import type { Catalog } from '@archsim/catalog';
import {
  ChatRequest,
  MAX_MESSAGE_CHARS,
  MAX_REPLY_CHARS,
  MentorStatus,
  NewRef,
  ProposalInput,
  ProposalStatusRequest,
  type MentorErrorCode,
  type MentorEvent,
  type MentorMessage,
  type MentorUsage,
  type Proposal,
  type ProposalOp,
} from '@archsim/problems';
import type { LoadedProblem } from '@archsim/problems/load';
import { safeJsonParse, validateDiagram } from '@archsim/sim-engine';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyProposal } from '../../src/store/proposal';
import { checkMethod, readJsonBody, Refusal, sendJson } from '../guard';
import type { PracticeStore } from '../practice-store';
import { currentState, systemPrompt, trimHistory } from './context';
import type { MentorProvider } from './provider';

export interface MentorOptions {
  providers: MentorProvider[];
  model: string;
  /** Without a chunk for this long, the reply is cut with a timeout (A10). */
  idleMs?: number;
}

const CHAT_BODY_LIMIT = 1024 * 1024;

class Rejected extends Error {}

/**
 * The mentor's neutral ids (n3) back to the diagram's own, with the map of the
 * question it answered; novoN refs stay. Anything else — a real id the model
 * guessed, an n# that wasn't on screen — rejects the proposal (mentor-edits A08).
 */
export function translateOps(
  ops: readonly ProposalOp[],
  ids: Record<string, string>,
): ProposalOp[] {
  const real = (ref: string, allowNew: boolean): string => {
    if (NewRef.safeParse(ref).success) {
      if (allowNew) return ref;
      throw new Rejected('um nó novo não pode ser desconectado');
    }
    const id = /^n\d+$/.test(ref) ? ids[ref] : undefined;
    if (id === undefined) throw new Rejected(`o nó ${ref.slice(0, 16)} não está no desenho`);
    return id;
  };
  return ops.map((op): ProposalOp => {
    switch (op.op) {
      case 'add':
        return op;
      case 'remove':
        return { ...op, node: real(op.node, false) };
      case 'connect':
        return { ...op, from: real(op.from, true), to: real(op.to, true) };
      case 'disconnect':
        return { ...op, from: real(op.from, false), to: real(op.to, false) };
      case 'set_variant':
      case 'set_prop':
      case 'rename':
        return { ...op, node: real(op.node, true) };
    }
  });
}

/** Server-side ids for the dry run; the browser makes its own when the person applies. */
const dryRunId = (serviceId: string, i: number) =>
  `${serviceId.split('.')[1] ?? 'node'}-p${String(i)}`;
const DEFAULT_IDLE_MS = 60_000;

/**
 * /__archsim/mentor/status, /__archsim/conversation/<id> and /__archsim/chat.
 * The caller has already passed checkCaller (loopback, Host, Origin).
 */
export function mentorRoutes(deps: {
  store: PracticeStore;
  problemOf: (id: string | undefined) => LoadedProblem;
  catalog: Catalog;
  mentor: MentorOptions | undefined;
  now: () => Date;
  log: (line: string) => void;
}) {
  const providers = deps.mentor?.providers ?? [];
  const model = deps.mentor?.model ?? 'claude-opus-5-5';
  const idleMs = deps.mentor?.idleMs ?? DEFAULT_IDLE_MS;
  /** One reply at a time per problem (A06). */
  const inFlight = new Set<string>();
  /** The system prompt only changes with the problem: build it once. */
  const systems = new Map<string, string>();

  async function status(req: IncomingMessage, res: ServerResponse) {
    checkMethod(req, 'GET');
    const has = async (id: MentorProvider['id']) =>
      (await providers.find((p) => p.id === id)?.available()) ?? false;
    const body: MentorStatus = {
      subscription: await has('subscription'),
      api: await has('api'),
      model,
    };
    sendJson(res, 200, MentorStatus.parse(body));
  }

  function conversation(req: IncomingMessage, res: ServerResponse, id: string | undefined) {
    checkMethod(req, 'GET', 'DELETE');
    const problemId = deps.problemOf(id).problem.id;
    if (req.method === 'DELETE') {
      // A reply in flight would write the old messages back when it ends.
      if (inFlight.has(problemId)) throw new Refusal(409, 'já há uma resposta em andamento');
      deps.store.clearConversation(problemId);
      res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    sendJson(res, 200, deps.store.readConversation(problemId));
  }

  async function chat(req: IncomingMessage, res: ServerResponse) {
    checkMethod(req, 'POST');
    let body: unknown;
    try {
      body = safeJsonParse(await readJsonBody(req, CHAT_BODY_LIMIT));
    } catch (error) {
      if (error instanceof Refusal) throw error;
      throw new Refusal(400, 'JSON inválido');
    }
    const message = (body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.length > MAX_MESSAGE_CHARS)
      throw new Refusal(413, `mensagem passa de ${String(MAX_MESSAGE_CHARS)} caracteres`);
    const parsed = ChatRequest.safeParse(body);
    if (!parsed.success) throw new Refusal(400, 'pedido de chat inválido');
    const request = parsed.data;
    const loaded = deps.problemOf(request.problemId);
    const checked = validateDiagram(request.diagram, deps.catalog);
    if (!checked.ok) throw new Refusal(400, `diagrama inválido: ${checked.code}`);
    const provider = providers.find((p) => p.id === request.provider);
    if (!provider || !(await provider.available())) throw new Refusal(409, 'provedor indisponível');
    const problemId = loaded.problem.id;
    if (inFlight.has(problemId)) throw new Refusal(409, 'já há uma resposta em andamento');
    inFlight.add(problemId);

    const started = Date.now();
    let ttft: number | null = null;
    let usage: MentorUsage | undefined;
    let errorCode: MentorErrorCode | null = null;
    // Set from the idle timer; an object so the flow analysis sees it change.
    const idleState = { timedOut: false };
    let text = '';
    let proposal: Proposal | undefined;
    let rejected = 0;
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClose);
    let idle: NodeJS.Timeout | undefined;
    const armIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        idleState.timedOut = true;
        controller.abort();
      }, idleMs);
    };
    const send = (event: MentorEvent) => {
      if (!res.writableEnded && !res.destroyed)
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const saved = deps.store.readConversation(problemId);
      const { kept, trimmed } = trimHistory(saved.messages);
      let system = systems.get(problemId);
      if (system === undefined) {
        system = systemPrompt(loaded, deps.catalog);
        systems.set(problemId, system);
      }
      const seen = currentState(loaded, checked.diagram, deps.catalog);
      const state = seen.text;
      const question: MentorMessage = {
        role: 'user',
        text: request.message,
        at: deps.now().toISOString(),
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      send({ type: 'start' });
      if (trimmed) send({ type: 'trimmed' });

      armIdle();
      // The single decision about the reply's proposal (review M2): the first that holds up
      // counts; the model is told the others don't. Providers ask it before answering the tool.
      const verdict = { asked: false, lastReason: undefined as string | undefined };
      const check = (raw: unknown): string | null => {
        verdict.asked = true;
        if (proposal !== undefined)
          return 'já há uma proposta registrada nesta resposta; ela é a que vale';
        const r = validateProposal(raw, seen.ids, checked.diagram);
        if (r.ok) {
          proposal = r.proposal;
          return null;
        }
        rejected += 1;
        verdict.lastReason = r.reason;
        return r.reason;
      };
      const unchecked: unknown[] = [];
      const input = { system, history: kept, state, message: request.message, model, check };
      for await (const chunk of provider.stream(input, controller.signal)) {
        armIdle();
        if (chunk.type === 'heartbeat') continue;
        if (chunk.type === 'proposal') {
          // Decided at the end: by the verdict when the provider asked it, else in order.
          unchecked.push(chunk.input);
          continue;
        }
        if (chunk.type === 'delta') {
          ttft ??= Date.now() - started;
          // Beyond what a conversation file holds, the reply is cut and kept (NFR-4, A06).
          const room = MAX_REPLY_CHARS - text.length;
          const piece = chunk.text.slice(0, room);
          text += piece;
          send({ type: 'delta', text: piece });
          if (piece.length < chunk.text.length) controller.abort();
        } else if (chunk.type === 'usage') {
          usage = chunk.usage;
          send(chunk);
        } else {
          errorCode = chunk.code;
          send(chunk);
        }
        if (controller.signal.aborted) break;
      }
      if (idleState.timedOut) {
        errorCode = 'timeout';
        send({ type: 'error', code: 'timeout' });
      }
      const interrupted = controller.signal.aborted;
      // A provider that never asked (none of ours today, but a test double may not):
      // the first proposal that holds up, in order — still the route's own validation (A08).
      if (!verdict.asked) for (const raw of unchecked) check(raw);
      if (!interrupted) {
        if (proposal !== undefined) send({ type: 'proposal', proposal });
        else if (verdict.lastReason !== undefined)
          send({ type: 'proposal_rejected', reason: verdict.lastReason });
      }
      // An interrupted reply never keeps a proposal (mentor-edits A10).
      const keptProposal = interrupted ? undefined : proposal;
      // The question is kept with its answer; a failure with no answer leaves the conversation as it was.
      if (text.length > 0 || keptProposal !== undefined) {
        const reply: MentorMessage = {
          role: 'mentor',
          text,
          at: deps.now().toISOString(),
          provider: provider.id,
          ...(interrupted ? { interrupted: true as const } : {}),
          ...(usage === undefined ? {} : { usage }),
          ...(keptProposal === undefined ? {} : { proposal: keptProposal }),
        };
        deps.store.writeConversation({ ...saved, messages: [...saved.messages, question, reply] });
      }
      send({ type: 'done', interrupted });
    } catch (error) {
      errorCode = 'unknown';
      if (!res.headersSent) throw error;
      send({ type: 'error', code: 'unknown' });
      send({ type: 'done', interrupted: true });
    } finally {
      clearTimeout(idle);
      res.off('close', onClose);
      inFlight.delete(problemId);
      // Before the stream starts, the error goes up as a JSON refusal or a 500.
      if (res.headersSent && !res.writableEnded) res.end();
      const outcome = idleState.timedOut
        ? 'timeout'
        : errorCode !== null
          ? `erro:${errorCode}`
          : controller.signal.aborted
            ? 'abortado'
            : 'ok';
      // One line per reply; never the question, the answer or a credential (A09).
      deps.log(
        `[archsim] mentor problema=${problemId} provedor=${provider.id} status=${outcome} ` +
          `ttft_ms=${ttft === null ? '-' : String(ttft)} in=${String(usage?.inputTokens ?? 0)} ` +
          `out=${String(usage?.outputTokens ?? 0)} propostas=${proposal === undefined ? '0' : '1'} ` +
          `rejeitadas=${String(rejected)}`,
      );
    }
  }

  /** Checks a tool input against the diagram the mentor saw; never trusts its ids (FR-6, A08). */
  function validateProposal(
    input: unknown,
    ids: Record<string, string>,
    seenDiagram: Parameters<typeof applyProposal>[0],
  ): { ok: true; proposal: Proposal } | { ok: false; reason: string } {
    const parsed = ProposalInput.safeParse(input);
    if (!parsed.success) return { ok: false, reason: 'a proposta não segue o formato esperado' };
    let ops: ProposalOp[];
    try {
      ops = translateOps(parsed.data.ops, ids);
    } catch (error) {
      if (error instanceof Rejected) return { ok: false, reason: error.message };
      throw error;
    }
    const dry = applyProposal(seenDiagram, ops, { catalog: deps.catalog, newId: dryRunId });
    if (!dry.ok) return { ok: false, reason: dry.message.slice(0, 200) };
    return {
      ok: true,
      proposal: { summary: parsed.data.summary, ops, id: randomUUID(), status: 'pending' },
    };
  }

  /** `POST proposal`: the person applied, discarded or undid a proposal (FR-9). */
  async function proposalStatus(req: IncomingMessage, res: ServerResponse) {
    checkMethod(req, 'POST');
    let body: unknown;
    try {
      body = safeJsonParse(await readJsonBody(req, 4096));
    } catch (error) {
      if (error instanceof Refusal) throw error;
      throw new Refusal(400, 'JSON inválido');
    }
    const parsed = ProposalStatusRequest.safeParse(body);
    if (!parsed.success) throw new Refusal(400, 'pedido inválido');
    const problemId = deps.problemOf(parsed.data.problemId).problem.id;
    if (inFlight.has(problemId)) throw new Refusal(409, 'já há uma resposta em andamento');
    const conversation = deps.store.readConversation(problemId);
    const message = conversation.messages.find(
      (m) => m.role === 'mentor' && m.proposal?.id === parsed.data.proposalId,
    );
    if (message?.role !== 'mentor' || message.proposal === undefined)
      throw new Refusal(404, 'proposta não encontrada');
    // pending ↔ applied, pending → discarded; a discarded proposal stays discarded.
    if (message.proposal.status === 'discarded')
      throw new Refusal(409, 'a proposta já foi descartada');
    if (message.proposal.status === 'applied' && parsed.data.status === 'discarded')
      throw new Refusal(409, 'desfaça a proposta antes de descartá-la');
    message.proposal = { ...message.proposal, status: parsed.data.status };
    deps.store.writeConversation(conversation);
    sendJson(res, 200, conversation);
  }

  return { status, conversation, chat, proposalStatus };
}

import type { Catalog } from '@archsim/catalog';
import {
  ChatRequest,
  MAX_MESSAGE_CHARS,
  MentorStatus,
  type MentorErrorCode,
  type MentorEvent,
  type MentorMessage,
  type MentorUsage,
} from '@archsim/problems';
import type { LoadedProblem } from '@archsim/problems/load';
import { safeJsonParse, validateDiagram } from '@archsim/sim-engine';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
      const state = currentState(loaded, checked.diagram, deps.catalog);
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
      const input = { system, history: kept, state, message: request.message, model };
      for await (const chunk of provider.stream(input, controller.signal)) {
        armIdle();
        if (chunk.type === 'delta') {
          ttft ??= Date.now() - started;
          text += chunk.text;
          send(chunk);
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
      // The question is kept with its answer; a failure with no answer leaves the conversation as it was.
      if (text.length > 0) {
        const reply: MentorMessage = {
          role: 'mentor',
          text,
          at: deps.now().toISOString(),
          provider: provider.id,
          ...(interrupted ? { interrupted: true as const } : {}),
          ...(usage === undefined ? {} : { usage }),
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
          `out=${String(usage?.outputTokens ?? 0)}`,
      );
    }
  }

  return { status, conversation, chat };
}

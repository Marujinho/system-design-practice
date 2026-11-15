import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaTool,
  BetaToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { MentorErrorCode } from '@archsim/problems';
import { MAX_TOOL_CALLS } from './mcp-server';
import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_REJECTED,
  TOOL_RESULT,
  toolInputSchema,
} from './proposal-tool';
import { PRICE_PER_MTOK, PRICED_MODEL, type MentorProvider, type ProviderChunk } from './provider';

/** What the provider needs from a stream: the raw events, then the final message. */
export interface ApiStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<Pick<BetaMessage, 'usage' | 'stop_reason' | 'content'>>;
}

export type StreamFn = (params: BetaMessageStreamParams, signal: AbortSignal) => ApiStream;

/** The Messages API with the key from the server's environment; no retries, so a bad key fails once (A07). */
function defaultStream(apiKey: string): StreamFn {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return (params, signal) => client.beta.messages.stream(params, { signal });
}

/** The SDK's typed errors, most specific first (FR-13). */
export function apiErrorCode(error: unknown): MentorErrorCode {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIConnectionError) return 'network';
  if (error instanceof Anthropic.AuthenticationError) return 'auth';
  if (error instanceof Anthropic.PermissionDeniedError) return 'auth';
  if (error instanceof Anthropic.RateLimitError) return 'rate_limit';
  if (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 503))
    return 'overloaded';
  return 'unknown';
}

/** The request: one tool (propor_mudancas), the stable prefix cached, the diagram now in the last user turn. */
export function apiParams(input: Parameters<MentorProvider['stream']>[0]): BetaMessageStreamParams {
  const messages: BetaMessageParam[] = input.history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));
  messages.push({ role: 'user', content: `${input.state}\n\n${input.message}` });
  return {
    model: input.model,
    max_tokens: 8000,
    system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
    messages,
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        input_schema: toolInputSchema() as BetaTool['input_schema'],
      },
    ],
    output_config: { effort: 'medium' },
    // On a refusal, the API re-runs the turn on a fallback model it picks by category.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
}

function usageChunk(
  t: { input: number; write: number; read: number; output: number },
  model: string,
): ProviderChunk {
  return {
    type: 'usage',
    usage: {
      inputTokens: t.input + t.write + t.read,
      outputTokens: t.output,
      ...(model === PRICED_MODEL
        ? {
            costUsd:
              (t.input * PRICE_PER_MTOK.input +
                t.write * PRICE_PER_MTOK.cacheWrite +
                t.read * PRICE_PER_MTOK.cacheRead +
                t.output * PRICE_PER_MTOK.output) /
              1e6,
          }
        : {}),
    },
  };
}

export function apiProvider(
  options: { env?: NodeJS.ProcessEnv; stream?: StreamFn } = {},
): MentorProvider {
  const env = options.env ?? process.env;
  return {
    id: 'api',
    available: () => Promise.resolve(Boolean(env.ANTHROPIC_API_KEY)),
    async *stream(input, signal): AsyncIterable<ProviderChunk> {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) {
        yield { type: 'error', code: 'auth' };
        return;
      }
      const open = options.stream ?? defaultStream(key);
      const total = { input: 0, write: 0, read: 0, output: 0 };
      try {
        let params = apiParams(input);
        // A proposal, up to MAX_TOOL_CALLS corrections, then the closing text (feedback FR-3).
        let wrote = false;
        let calls = 0;
        const lastRound = MAX_TOOL_CALLS;
        for (let round = 0; round <= lastRound; round += 1) {
          const stream = open(params, signal);
          let gap = round > 0 && wrote; // keep the closing text apart from what came before
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              if (gap) {
                yield { type: 'delta', text: '\n\n' };
                gap = false;
              }
              wrote = true;
              yield { type: 'delta', text: event.delta.text };
            } else {
              yield { type: 'heartbeat' }; // thinking and other events: alive, nothing to show
            }
          }
          const final = await stream.finalMessage();
          const u = final.usage;
          total.input += u.input_tokens;
          total.write += u.cache_creation_input_tokens ?? 0;
          total.read += u.cache_read_input_tokens ?? 0;
          total.output += u.output_tokens;
          if (final.stop_reason === 'refusal') {
            yield usageChunk(total, input.model);
            yield { type: 'error', code: 'refusal' };
            return;
          }
          const call = final.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
          if (call?.type === 'tool_use') {
            calls += 1;
            yield { type: 'proposal', input: call.input };
          }
          if (final.stop_reason !== 'tool_use' || round === lastRound) break;
          // Answer every tool call — with the simulator's reason when it refuses — and let the
          // model close its reply knowing whether there is a card (M5).
          const results: BetaToolResultBlockParam[] = [];
          for (const b of final.content) {
            if (b.type !== 'tool_use') continue;
            const reason =
              call?.type !== 'tool_use' || b.id !== call.id
                ? 'só uma proposta por chamada'
                : calls > MAX_TOOL_CALLS
                  ? 'limite de propostas nesta resposta; explique à pessoa o que faltou'
                  : (input.check?.(b.input) ?? null);
            results.push(
              reason === null
                ? { type: 'tool_result', tool_use_id: b.id, content: TOOL_RESULT }
                : {
                    type: 'tool_result',
                    tool_use_id: b.id,
                    is_error: true,
                    content: `${TOOL_REJECTED}${reason}`,
                  },
            );
          }
          params = {
            ...params,
            messages: [
              ...params.messages,
              { role: 'assistant', content: final.content },
              { role: 'user', content: results },
            ],
          };
        }
        yield usageChunk(total, input.model);
      } catch (error) {
        if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return;
        yield { type: 'error', code: apiErrorCode(error) };
      }
    },
  };
}

import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { MentorErrorCode } from '@archsim/problems';
import { PRICE_PER_MTOK, PRICED_MODEL, type MentorProvider, type ProviderChunk } from './provider';

/** What the provider needs from a stream: the raw events, then the final message. */
export interface ApiStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<Pick<BetaMessage, 'usage' | 'stop_reason'>>;
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

/** The request: no tools, the stable prefix cached, the diagram now in the last user turn. */
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
    output_config: { effort: 'medium' },
    // On a refusal, the API re-runs the turn on a fallback model it picks by category.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
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
      try {
        const stream = open(apiParams(input), signal);
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'delta', text: event.delta.text };
          } else {
            yield { type: 'heartbeat' }; // thinking and other events: alive, nothing to show
          }
        }
        const final = await stream.finalMessage();
        const u = final.usage;
        const write = u.cache_creation_input_tokens ?? 0;
        const read = u.cache_read_input_tokens ?? 0;
        const inputTokens = u.input_tokens + write + read;
        yield {
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens: u.output_tokens,
            ...(input.model === PRICED_MODEL
              ? {
                  costUsd:
                    (u.input_tokens * PRICE_PER_MTOK.input +
                      write * PRICE_PER_MTOK.cacheWrite +
                      read * PRICE_PER_MTOK.cacheRead +
                      u.output_tokens * PRICE_PER_MTOK.output) /
                    1e6,
                }
              : {}),
          },
        };
        if (final.stop_reason === 'refusal') yield { type: 'error', code: 'refusal' };
      } catch (error) {
        if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return;
        yield { type: 'error', code: apiErrorCode(error) };
      }
    },
  };
}

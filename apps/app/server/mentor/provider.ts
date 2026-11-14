import type {
  MentorErrorCode,
  MentorMessage,
  MentorProviderId,
  MentorUsage,
} from '@archsim/problems';

/** One turn for a provider: the stable system prompt, the history, the diagram now and the question. */
export interface ProviderInput {
  system: string;
  history: readonly MentorMessage[];
  state: string;
  message: string;
  model: string;
  /**
   * Checks a propor_mudancas input the way the route will: null when it holds,
   * else the reason. A provider that can answer the tool call tells the model (M5).
   */
  check?: (proposal: unknown) => string | null;
}

export type ProviderChunk =
  | { type: 'delta'; text: string }
  /** Upstream is alive (thinking, a ping): keeps the idle timer from firing, never shown. */
  | { type: 'heartbeat' }
  /** The mentor called propor_mudancas; the input is unchecked until the route validates it. */
  | { type: 'proposal'; input: unknown }
  | { type: 'usage'; usage: MentorUsage }
  | { type: 'error'; code: MentorErrorCode };

/**
 * A way to reach Claude. Neither implementation gives the model tools: the
 * mentor only talks (study-mode FR-12). Aborting the signal stops the upstream
 * call; the stream then simply ends.
 */
export interface MentorProvider {
  id: MentorProviderId;
  /** Whether this provider can answer now. Never makes a paid call (A07). */
  available(): Promise<boolean>;
  stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderChunk>;
}

/** The credentials a child process must not inherit, so the subscription login is used (A04). */
export const CREDENTIAL_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

/** The model the API prices below belong to; another model gets no cost estimate. */
export const PRICED_MODEL = 'claude-opus-5-5';

/**
 * API list prices of PRICED_MODEL, US$ per million tokens (Claude Opus 5.5, 2026-11):
 * cache writes cost 1.25× input, cache reads 0.1×.
 */
export const PRICE_PER_MTOK = { input: 4, cacheWrite: 5, cacheRead: 0.4, output: 20 };

/** The previous turns as plain text, for providers that take a single prompt. */
export function transcript(history: readonly MentorMessage[]): string {
  if (history.length === 0) return '';
  const lines = history.map((m) => `[${m.role === 'user' ? 'pessoa' : 'mentor'}]\n${m.text}`);
  return `<conversa_anterior>\n${lines.join('\n\n')}\n</conversa_anterior>`;
}

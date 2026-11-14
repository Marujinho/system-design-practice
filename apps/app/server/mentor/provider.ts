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
}

export type ProviderChunk =
  | { type: 'delta'; text: string }
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

/** API list prices of the default model, US$ per million tokens (Claude Opus 5.5, 2026-11). */
export const PRICE_PER_MTOK = { input: 4, output: 20 };

/** The previous turns as plain text, for providers that take a single prompt. */
export function transcript(history: readonly MentorMessage[]): string {
  if (history.length === 0) return '';
  const lines = history.map((m) => `[${m.role === 'user' ? 'pessoa' : 'mentor'}]\n${m.text}`);
  return `<conversa_anterior>\n${lines.join('\n\n')}\n</conversa_anterior>`;
}

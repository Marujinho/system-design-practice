import { Conversation, MentorEvent, MentorStatus, type MentorProviderId } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { create } from 'zustand';
import { ApiError } from './api';

async function json<T>(parse: (v: unknown) => T, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/__archsim/${path}`, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('o servidor local não respondeu');
  }
  if (res.status === 204) return parse(null);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorOf(body, res.status));
  return parse(body);
}

function errorOf(body: unknown, status: number): string {
  return body !== null && typeof body === 'object' && 'error' in body
    ? String(body.error)
    : `erro ${String(status)}`;
}

/** Splits a server-sent-event stream into its `data:` payloads. */
export function sseData(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks
    .map((b) =>
      b
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n'),
    )
    .filter((d) => d !== '');
  return { events, rest };
}

export const mentorApi = {
  status: () => json((v) => MentorStatus.parse(v), 'mentor/status'),
  conversation: (problemId: string) =>
    json((v) => Conversation.parse(v), `conversation/${encodeURIComponent(problemId)}`),
  clear: (problemId: string) =>
    json(() => undefined, `conversation/${encodeURIComponent(problemId)}`, { method: 'DELETE' }),

  /**
   * Sends a question with the diagram on screen and calls `onEvent` for every
   * event of the reply as it arrives. Rejects with ApiError when the server
   * refuses before streaming; an abort ends it quietly.
   */
  async chat(
    body: { problemId: string; provider: MentorProviderId; message: string; diagram: Diagram },
    signal: AbortSignal,
    onEvent: (event: MentorEvent) => void,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch('/__archsim/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      if (signal.aborted) return;
      throw new ApiError('o servidor local não respondeu');
    }
    if (!res.ok || !res.body) {
      const err: unknown = await res.json().catch(() => null);
      throw new ApiError(errorOf(err, res.status));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = sseData(buffer);
        buffer = rest;
        for (const data of events) {
          let parsed: MentorEvent;
          try {
            parsed = MentorEvent.parse(JSON.parse(data));
          } catch {
            parsed = { type: 'error', code: 'unknown' };
          }
          onEvent(parsed);
        }
      }
    } catch {
      if (signal.aborted) return;
      onEvent({ type: 'error', code: 'network' });
    }
  },
};

/** What the floating pill needs to know about the chat, wherever the panel is (study-mode FR-3). */
export interface MentorUiState {
  streaming: boolean;
  /** The first line of a reply that arrived while the chat was closed; null once seen. */
  unread: string | null;
  set: (patch: Partial<Pick<MentorUiState, 'streaming' | 'unread'>>) => void;
}

export const useMentorUi = create<MentorUiState>()((set) => ({
  streaming: false,
  unread: null,
  set: (patch) => {
    set(patch);
  },
}));

/** Up to 120 characters of the first non-empty line, without markdown marks. */
export function preview(text: string): string {
  const line =
    text
      .split('\n')
      .map((l) => l.replace(/[*_`#>]/g, '').trim())
      .find((l) => l !== '') ?? '';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

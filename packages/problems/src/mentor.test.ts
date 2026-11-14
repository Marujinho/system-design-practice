import { describe, expect, it } from 'vitest';
import {
  ChatRequest,
  Conversation,
  emptyConversation,
  MAX_MESSAGE_CHARS,
  MentorEvent,
  MentorStatus,
} from './mentor';

const at = '2026-11-14T12:00:00.000Z';

describe('mentor contracts (study-mode FR-6, FR-8, NFR-4)', () => {
  it('accepts a conversation with a question and an interrupted reply', () => {
    const c = {
      ...emptyConversation('url-shortener'),
      messages: [
        { role: 'user', text: 'O que está saturando?', at },
        { role: 'mentor', text: 'O RDS', at, provider: 'api', interrupted: true },
      ],
    };
    expect(Conversation.safeParse(c).success).toBe(true);
  });

  it('refuses a path-like problem id and unknown fields', () => {
    expect(Conversation.safeParse(emptyConversation('../x')).success).toBe(false);
    expect(
      Conversation.safeParse({ ...emptyConversation('url-shortener'), extra: 1 }).success,
    ).toBe(false);
  });

  it('limits a question to 8000 characters and refuses a blank one', () => {
    const base = { problemId: 'url-shortener', provider: 'subscription', diagram: {} };
    expect(ChatRequest.safeParse({ ...base, message: 'x'.repeat(MAX_MESSAGE_CHARS) }).success).toBe(
      true,
    );
    expect(
      ChatRequest.safeParse({ ...base, message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }).success,
    ).toBe(false);
    expect(ChatRequest.safeParse({ ...base, message: '   ' }).success).toBe(false);
    expect(ChatRequest.safeParse({ ...base, message: 'oi', provider: 'openai' }).success).toBe(
      false,
    );
  });

  it('keeps the status to availability and the model name, nothing else', () => {
    expect(MentorStatus.safeParse({ subscription: true, api: false, model: 'm' }).success).toBe(
      true,
    );
    expect(
      MentorStatus.safeParse({ subscription: true, api: false, model: 'm', email: 'x' }).success,
    ).toBe(false);
  });

  it('types every chat event and refuses an unknown one', () => {
    expect(MentorEvent.safeParse({ type: 'delta', text: 'oi' }).success).toBe(true);
    expect(MentorEvent.safeParse({ type: 'error', code: 'auth' }).success).toBe(true);
    expect(MentorEvent.safeParse({ type: 'error', code: 'boom' }).success).toBe(false);
    expect(MentorEvent.safeParse({ type: 'tool_use' }).success).toBe(false);
  });
});

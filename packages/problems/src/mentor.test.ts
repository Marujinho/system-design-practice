import { describe, expect, it } from 'vitest';
import {
  ChatRequest,
  Conversation,
  emptyConversation,
  MAX_MESSAGE_CHARS,
  MAX_PROPOSAL_OPS,
  MentorEvent,
  MentorStatus,
  ProposalInput,
  ProposalStatusRequest,
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

describe('proposals (mentor-edits FR-2, FR-9, NFR-3, A05, A08)', () => {
  const at = '2026-11-14T12:00:00.000Z';
  const ops = [
    {
      op: 'add',
      ref: 'novo1',
      service: 'aws.elasticache-valkey',
      label: 'Cache',
      props: { hitRatio: 0.9 },
    },
    { op: 'connect', from: 'n2', to: 'novo1' },
    { op: 'disconnect', from: 'n2', to: 'n3' },
    { op: 'set_variant', node: 'n3', variant: 'db.m7g.large' },
    { op: 'set_prop', node: 'n2', key: 'units', value: 6 },
    { op: 'rename', node: 'n2', label: 'Redirecionador' },
    { op: 'remove', node: 'n4' },
  ];

  it('accepts every operation the person can make by hand', () => {
    expect(ProposalInput.safeParse({ summary: 'cache na frente do banco', ops }).success).toBe(
      true,
    );
  });

  it('refuses unknown operations, markup in names, too many operations and bad refs', () => {
    const one = (op: unknown) => ProposalInput.safeParse({ summary: 's', ops: [op] }).success;
    expect(one({ op: 'set_load', rps: 1 })).toBe(false);
    expect(one({ op: 'rename', node: 'n1', label: '<img src=x onerror=alert(1)>' })).toBe(false);
    expect(one({ op: 'add', ref: 'novo51', service: 'aws.ec2' })).toBe(false);
    expect(one({ op: 'remove', node: '../x' })).toBe(false);
    expect(one({ op: 'add', ref: 'novo1', service: 'aws.ec2', extra: 1 })).toBe(false);
    const many = Array.from({ length: MAX_PROPOSAL_OPS + 1 }, () => ({ op: 'remove', node: 'n2' }));
    expect(ProposalInput.safeParse({ summary: 's', ops: many }).success).toBe(false);
    expect(ProposalInput.safeParse({ summary: 's', ops: [] }).success).toBe(false);
  });

  it('keeps a proposal on a reply, and old replies without one stay valid', () => {
    const proposal = {
      summary: 's',
      ops: [{ op: 'remove', node: 'cache' }],
      id: '0b6c1f9e-6b1a-4a5f-9a7e-0c2b1d3e4f50',
      status: 'pending',
    };
    const c = (extra: object) => ({
      ...emptyConversation('url-shortener'),
      messages: [
        { role: 'user', text: 'tira o cache', at },
        { role: 'mentor', text: 'ok', at, provider: 'api', ...extra },
      ],
    });
    expect(Conversation.safeParse(c({ proposal })).success).toBe(true);
    expect(Conversation.safeParse(c({})).success).toBe(true);
    expect(Conversation.safeParse(c({ proposal: { ...proposal, status: 'maybe' } })).success).toBe(
      false,
    );
    expect(MentorEvent.safeParse({ type: 'proposal', proposal }).success).toBe(true);
    expect(
      MentorEvent.safeParse({ type: 'proposal_rejected', reason: 'serviço inexistente' }).success,
    ).toBe(true);
    expect(
      ProposalStatusRequest.safeParse({
        problemId: 'url-shortener',
        proposalId: proposal.id,
        status: 'applied',
      }).success,
    ).toBe(true);
    expect(
      ProposalStatusRequest.safeParse({
        problemId: '../x',
        proposalId: proposal.id,
        status: 'applied',
      }).success,
    ).toBe(false);
  });
});

import { z } from 'zod';

/** Contracts of the study-mode mentor chat, shared by the local server and the app (study-mode PRD). */

export const MAX_MESSAGE_CHARS = 8000;
export const MAX_REPLY_CHARS = 100_000;
const PROBLEM_ID = /^[a-z][a-z0-9-]{0,63}$/;

export const MentorProviderId = z.enum(['subscription', 'api']);
export type MentorProviderId = z.infer<typeof MentorProviderId>;

export const MentorUsage = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().optional(),
  })
  .strict();
export type MentorUsage = z.infer<typeof MentorUsage>;

const UserMessage = z
  .object({
    role: z.literal('user'),
    text: z.string().min(1).max(MAX_MESSAGE_CHARS),
    at: z.iso.datetime(),
  })
  .strict();

export const MAX_PROPOSAL_OPS = 50;

/** A node name the mentor may write: the diagram's own limit, and never markup (A05). */
const Label = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[^<>]+$/);
/**
 * An existing node: a neutral id (`n3`) from the mentor, a real id once translated —
 * so the diagram's own id rule (an imported file may use `API_GW`). Only n# and novoN
 * are accepted from the model; the server enforces that when translating.
 */
const NodeRef = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** A node this proposal creates: `novo1` … `novo50`. */
export const NewRef = z.string().regex(/^novo([1-9]|[1-4]\d|50)$/);
const AnyRef = z.union([NewRef, NodeRef]);
const Id = z.string().min(1).max(64);

/** One change to the diagram, as the person could make it by hand (mentor-edits FR-2). */
export const ProposalOp = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add'),
      ref: NewRef,
      service: Id,
      variant: Id.optional(),
      props: z.record(z.string().max(32), z.number()).optional(),
      label: Label.optional(),
    })
    .strict(),
  z.object({ op: z.literal('remove'), node: NodeRef }).strict(),
  z.object({ op: z.literal('connect'), from: AnyRef, to: AnyRef }).strict(),
  z.object({ op: z.literal('disconnect'), from: NodeRef, to: NodeRef }).strict(),
  z.object({ op: z.literal('set_variant'), node: AnyRef, variant: Id }).strict(),
  z
    .object({
      op: z.literal('set_prop'),
      node: AnyRef,
      key: z.string().max(32),
      value: z.number(),
    })
    .strict(),
  z.object({ op: z.literal('rename'), node: AnyRef, label: Label }).strict(),
]);
export type ProposalOp = z.infer<typeof ProposalOp>;

/** What the mentor sends through the `propor_mudancas` tool. */
export const ProposalInput = z
  .object({
    summary: z.string().min(1).max(300),
    ops: z.array(ProposalOp).min(1).max(MAX_PROPOSAL_OPS),
  })
  .strict();
export type ProposalInput = z.infer<typeof ProposalInput>;

export const ProposalStatus = z.enum(['pending', 'applied', 'discarded']);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/** A validated proposal, with real node ids, as the card shows it and the conversation keeps it. */
export const Proposal = ProposalInput.extend({ id: z.uuid(), status: ProposalStatus }).strict();
export type Proposal = z.infer<typeof Proposal>;

/** `POST /__archsim/proposal`: the person applied, discarded or undid a proposal (FR-9). */
export const ProposalStatusRequest = z
  .object({ problemId: z.string().regex(PROBLEM_ID), proposalId: z.uuid(), status: ProposalStatus })
  .strict();
export type ProposalStatusRequest = z.infer<typeof ProposalStatusRequest>;

const MentorReply = z
  .object({
    role: z.literal('mentor'),
    text: z.string().max(MAX_REPLY_CHARS),
    at: z.iso.datetime(),
    provider: MentorProviderId,
    interrupted: z.literal(true).optional(),
    usage: MentorUsage.optional(),
    proposal: Proposal.optional(),
  })
  .strict();

export const MentorMessage = z.discriminatedUnion('role', [UserMessage, MentorReply]);
export type MentorMessage = z.infer<typeof MentorMessage>;

/** `practice/mentor-<problemId>.json`: one conversation per problem (FR-8). */
export const Conversation = z
  .object({
    schemaVersion: z.literal(1),
    problemId: z.string().regex(PROBLEM_ID),
    messages: z.array(MentorMessage),
  })
  .strict();
export type Conversation = z.infer<typeof Conversation>;

export function emptyConversation(problemId: string): Conversation {
  return { schemaVersion: 1, problemId, messages: [] };
}

/** Which providers can answer, and with which model. Never a credential (FR-6). */
export const MentorStatus = z
  .object({ subscription: z.boolean(), api: z.boolean(), model: z.string().min(1) })
  .strict();
export type MentorStatus = z.infer<typeof MentorStatus>;

/** `POST /__archsim/chat`. The diagram is validated by the engine, not here. */
export const ChatRequest = z
  .object({
    problemId: z.string().regex(PROBLEM_ID),
    provider: MentorProviderId,
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    diagram: z.unknown(),
  })
  .strict();
export type ChatRequest = z.infer<typeof ChatRequest>;

export const MentorErrorCode = z.enum([
  'auth',
  'rate_limit',
  'overloaded',
  'network',
  'refusal',
  'timeout',
  'unknown',
]);
export type MentorErrorCode = z.infer<typeof MentorErrorCode>;

/** One server-sent event of a chat reply, in order: start, trimmed?, delta*, proposal?, usage?, error?, done. */
export const MentorEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('trimmed') }).strict(),
  z.object({ type: z.literal('delta'), text: z.string() }).strict(),
  z.object({ type: z.literal('usage'), usage: MentorUsage }).strict(),
  z.object({ type: z.literal('error'), code: MentorErrorCode }).strict(),
  z.object({ type: z.literal('done'), interrupted: z.boolean() }).strict(),
  z.object({ type: z.literal('proposal'), proposal: Proposal }).strict(),
  z.object({ type: z.literal('proposal_rejected'), reason: z.string().max(200) }).strict(),
]);
export type MentorEvent = z.infer<typeof MentorEvent>;

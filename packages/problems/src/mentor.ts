import { z } from 'zod';

/** Contracts of the study-mode mentor chat, shared by the local server and the app (study-mode PRD). */

export const MAX_MESSAGE_CHARS = 8000;
const MAX_REPLY_CHARS = 100_000;
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

const MentorReply = z
  .object({
    role: z.literal('mentor'),
    text: z.string().max(MAX_REPLY_CHARS),
    at: z.iso.datetime(),
    provider: MentorProviderId,
    interrupted: z.literal(true).optional(),
    usage: MentorUsage.optional(),
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

/** One server-sent event of a chat reply, in order: start, trimmed?, delta*, usage?, error?, done. */
export const MentorEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('trimmed') }).strict(),
  z.object({ type: z.literal('delta'), text: z.string() }).strict(),
  z.object({ type: z.literal('usage'), usage: MentorUsage }).strict(),
  z.object({ type: z.literal('error'), code: MentorErrorCode }).strict(),
  z.object({ type: z.literal('done'), interrupted: z.boolean() }).strict(),
]);
export type MentorEvent = z.infer<typeof MentorEvent>;

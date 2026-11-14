import {
  Conversation,
  emptyConversation,
  emptyHistory,
  History,
  recordOf,
  type Attempt,
  type Session,
} from '@archsim/problems';
import { safeJsonParse } from '@archsim/sim-engine';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './atomic-write';

export interface PracticeStore {
  readHistory(): History;
  appendAttempt(attempt: Attempt): History;
  markSolutionViewed(problemId: string, at: string): History;
  writeSession(session: Session): void;
  bestScore(problemId: string): number | null;
  readConversation(problemId: string): Conversation;
  writeConversation(conversation: Conversation): void;
  clearConversation(problemId: string): void;
}

const PROBLEM_ID = /^[a-z][a-z0-9-]{0,63}$/;

/** practice/history.json, practice/session.json and practice/mentor-<id>.json: the only files the server writes. */
export function practiceStore(
  dir: string,
  warn: (line: string) => void = console.warn,
): PracticeStore {
  const historyPath = join(dir, 'history.json');
  const sessionPath = join(dir, 'session.json');
  mkdirSync(dir, { recursive: true });

  const readHistory = (): History => {
    if (!existsSync(historyPath)) return emptyHistory();
    // I/O errors (EACCES, EISDIR…) propagate as a 500; only bad content is set aside (A10).
    const text = readFileSync(historyPath, 'utf8');
    try {
      return History.parse(safeJsonParse(text));
    } catch {
      const aside = join(dir, `history.corrupt-${String(Date.now())}.json`);
      renameSync(historyPath, aside);
      warn(
        `[archsim] practice/history.json estava inválido; movido para ${aside} e recomeçado vazio`,
      );
      return emptyHistory();
    }
  };

  /** The only way to a conversation file: the id is checked again here, whoever called (A01). */
  const conversationPath = (problemId: string) => {
    if (!PROBLEM_ID.test(problemId)) throw new Error('id de problema inválido');
    return join(dir, `mentor-${problemId}.json`);
  };

  const readConversation = (problemId: string): Conversation => {
    const path = conversationPath(problemId);
    if (!existsSync(path)) return emptyConversation(problemId);
    // Same rule as the history: I/O errors propagate; only bad content is set aside (A08, A10).
    const text = readFileSync(path, 'utf8');
    try {
      const c = Conversation.parse(safeJsonParse(text));
      if (c.problemId !== problemId) throw new Error('conversa de outro problema');
      return c;
    } catch {
      const aside = join(dir, `mentor-${problemId}.corrupt-${String(Date.now())}.json`);
      renameSync(path, aside);
      warn(`[archsim] practice/mentor-${problemId}.json estava inválido; movido para ${aside}`);
      return emptyConversation(problemId);
    }
  };

  const writeHistory = (h: History) => {
    writeAtomic(historyPath, `${JSON.stringify(History.parse(h), null, 2)}\n`);
  };

  return {
    readHistory,
    appendAttempt: (attempt) => {
      const h = readHistory();
      h.attempts.push(attempt);
      writeHistory(h);
      return h;
    },
    markSolutionViewed: (problemId, at) => {
      const h = readHistory();
      h.solutionViewedAt[problemId] ??= at;
      writeHistory(h);
      return h;
    },
    writeSession: (session) => {
      writeAtomic(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
    },
    bestScore: (problemId) => recordOf(readHistory(), problemId)?.score ?? null,
    readConversation,
    writeConversation: (conversation) => {
      const c = Conversation.parse(conversation);
      writeAtomic(conversationPath(c.problemId), `${JSON.stringify(c, null, 2)}\n`);
    },
    clearConversation: (problemId) => {
      rmSync(conversationPath(problemId), { force: true });
    },
  };
}

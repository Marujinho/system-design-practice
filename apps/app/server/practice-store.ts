import { emptyHistory, History, recordOf, type Attempt, type Session } from '@archsim/problems';
import { safeJsonParse } from '@archsim/sim-engine';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './atomic-write';

export interface PracticeStore {
  readHistory(): History;
  appendAttempt(attempt: Attempt): History;
  markSolutionViewed(problemId: string, at: string): History;
  writeSession(session: Session): void;
  bestScore(problemId: string): number | null;
}

/** practice/history.json and practice/session.json: the only files the server writes. */
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
  };
}

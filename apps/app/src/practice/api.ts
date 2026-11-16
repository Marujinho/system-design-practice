import { tr } from '../i18n/t';
import { FinalizeResponse, History, ProblemSummary, PublicProblem } from '@archsim/problems';
import { Diagram } from '@archsim/sim-engine';
import { z } from 'zod';

export class ApiError extends Error {}

async function call<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/__archsim/${path}`, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(tr('api.noServer'));
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const reason =
      body !== null && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : tr('api.status', { status: res.status });
    throw new ApiError(reason);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(tr('api.unexpected'));
  return parsed.data;
}

export const api = {
  problems: () => call(z.array(ProblemSummary), 'problems'),
  history: () => call(History, 'history'),
  problem: (id: string) => call(PublicProblem, `problems/${encodeURIComponent(id)}`),
  finalize: (problemId: string, diagram: Diagram) =>
    call(FinalizeResponse, 'finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId, diagram }),
    }),
  /** Study mode: the same answer as finalize, recorded nowhere (study-mode FR-9). */
  studyScore: (problemId: string, diagram: Diagram) =>
    call(FinalizeResponse, 'study-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId, diagram }),
    }),
  /** The reference; with `en`, its node labels in English (language-switch FR-7). */
  reference: (id: string, lang: 'pt' | 'en' = 'pt') =>
    call(Diagram, `reference/${encodeURIComponent(id)}${lang === 'en' ? '?lang=en' : ''}`),
};

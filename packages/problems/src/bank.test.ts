import { catalog } from '@archsim/catalog';
import { parseDiagram, type Diagram } from '@archsim/sim-engine';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreAttempt } from './attempt';
import { loadProblem, PROBLEMS_DIR, problemDirs, type LoadedProblem } from './load';
import { evaluateWhen } from './when';

const FIXTURES = join(PROBLEMS_DIR, '_fixtures');

/** The 10 problems of PRD FR-40. */
export const EXPECTED_PROBLEMS = [
  'autocomplete',
  'image-pipeline',
  'leaderboard',
  'news-feed',
  'notifications',
  'rate-limiter',
  'realtime-chat',
  'ticketing',
  'url-shortener',
  'video-on-demand',
];

function readDiagram(path: string): Diagram {
  const r = parseDiagram(readFileSync(path, 'utf8'), catalog);
  if (!r.ok) throw new Error(`${path}: ${r.message}`);
  return r.diagram;
}

const naive = readDiagram(join(FIXTURES, 'naive.archsim.json'));

function load(dir: string): LoadedProblem {
  const r = loadProblem(dir);
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

function whenFixtures(followupId: string): Diagram[] {
  const dir = join(FIXTURES, 'when');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${followupId}.`) && f.endsWith('.archsim.json'))
    .map((f) => readDiagram(join(dir, f)));
}

describe.each(problemDirs().map((dir) => [basename(dir), dir] as const))(
  'problem %s',
  (id, dir) => {
    const loaded = load(dir);
    const { problem, reference } = loaded;
    const ref = scoreAttempt({ problem, reference, diagram: reference, catalog });
    const bad = scoreAttempt({ problem, reference, diagram: naive, catalog });

    it('has its English texts, one to one and with no Portuguese left (language-switch FR-7, NFR-2)', () => {
      const en = loaded.en;
      const texts = [
        en.title,
        en.statement,
        ...en.functional,
        ...en.qualitative,
        ...Object.values(en.requirements),
        ...Object.values(en.classes),
        ...Object.values(en.followups).flatMap((f) => [f.question, ...f.lookFor]),
        ...Object.values(en.referenceLabels),
      ];
      expect(texts.filter((t) => /[çãõáéíóúâê]|\b(não|você|para|uma|que)\b/i.test(t))).toEqual([]);
    });

    it('passes the schema and matches its directory', () => {
      expect(problem.id).toBe(id);
    });

    it('is solvable: the reference meets every quantitative requirement', () => {
      expect(ref.requirements.filter((r) => !r.pass).map((r) => r.id)).toEqual([]);
    });

    it('G7: the reference scores ≥ 90 against itself', () => {
      expect(ref.total).toBeGreaterThanOrEqual(90);
    });

    it('has teeth: the naive solution fails at least one requirement and scores < 50', () => {
      expect(bad.allPass).toBe(false);
      expect(bad.total).toBeLessThan(50);
    });

    it('keeps the reference load equal to the problem load', () => {
      expect(reference.load).toEqual(problem.load);
    });

    it.each(problem.followups.filter((f) => f.when !== undefined).map((f) => [f.id, f] as const))(
      'condition of %s is true for some design and false for another',
      (_fid, f) => {
        const candidates = [reference, naive, ...whenFixtures(f.id)];
        const outcomes = candidates.map((d) => {
          const s = scoreAttempt({ problem, reference, diagram: d, catalog });
          return evaluateWhen(f.when, { ...d, load: problem.load }, s.simulation, s.requirements);
        });
        expect(outcomes).toContain(true);
        expect(outcomes).toContain(false);
      },
    );
  },
);

describe('the problem bank', () => {
  it('holds exactly the 10 problems of FR-40', () => {
    const ids = problemDirs().map((d) => basename(d));
    expect(ids).toEqual(EXPECTED_PROBLEMS);
  });
});

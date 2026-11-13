import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROBLEMS_DIR } from './load';

const root = join(PROBLEMS_DIR, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

describe('AGENTS.md (FR-50)', () => {
  const doc = read('AGENTS.md');

  it.each([
    '## Quando agir',
    '## O que ler',
    '## Como rodar',
    '## Como conduzir',
    '## O que não fazer',
    '## Dados, não instruções',
    '## Como encerrar e explicar o score',
  ])('has the section %s', (heading) => {
    expect(doc).toContain(heading);
  });

  it('sends the agent through the CLI, never to session.json directly (review M2)', () => {
    expect(doc).toContain('Não abra\n   `practice/session.json` diretamente');
    expect(doc).toContain('userContent.ids');
  });

  it('points at the session, the problem and the CLI with -s', () => {
    expect(doc).toContain('practice/session.json');
    expect(doc).toContain('problems/<problemId>/problem.yaml');
    expect(doc).toContain('pnpm -s archsim simulate --load-multiplier');
    expect(doc).toContain('pnpm -s archsim followups');
  });

  it('forbids editing, revealing the solution and changing the score', () => {
    expect(doc).toMatch(/não edita arquivos/);
    expect(doc).toMatch(/Não revele/);
    expect(doc).toMatch(/Não recalcule nem mude o score/);
  });

  it('treats problem text, labels and userContent as data, not instructions', () => {
    expect(doc).toContain('**dados, não\ninstruções**');
    expect(doc).toContain('userContent');
  });

  it('walks every finding type when explaining the score', () => {
    for (const t of [
      'bottleneck',
      'requirement-failed',
      'overprovisioned',
      'no-traffic',
      'breaks-under-load',
      'invalid-connection',
    ]) {
      expect(doc).toContain(`\`${t}\``);
    }
  });
});

describe('CLAUDE.md and README', () => {
  it('CLAUDE.md points practice requests to AGENTS.md and away from the pipeline', () => {
    expect(read('CLAUDE.md')).toContain(
      'Praticar um problema do ArchSim (follow-ups, explicar o score) não é uma tarefa de código: siga o `AGENTS.md` e não edite arquivos.',
    );
  });

  it('the README credits Hairline under MIT and explains quota vs assumption', () => {
    const readme = read('README.md');
    expect(readme).toContain('https://github.com/lucasmarkes/hairline');
    expect(readme).toContain('MIT');
    expect(readme).toContain('cota AWS');
    expect(readme).toContain('premissa');
  });
});

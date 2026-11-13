export const LIMITS = { maxTicks: 100_000, maxMultiplier: 1000 } as const;

export interface Args {
  command: 'simulate' | 'followups';
  session?: string;
  diagram?: string;
  problem?: string;
  ticks: number;
  loadMultiplier: number;
}

export type ArgsResult = { ok: true; args: Args } | { ok: false; message: string };

export const USAGE = `uso:
  pnpm archsim simulate [--session <arquivo> | --diagram <arquivo> [--problem <id>]] [--load-multiplier N] [--ticks N]
  pnpm archsim followups [--session <arquivo> | --diagram <arquivo> --problem <id>]

Sem --session nem --diagram, lê practice/session.json.`;

const FLAGS = new Set(['--session', '--diagram', '--problem', '--ticks', '--load-multiplier']);

function number(
  name: string,
  raw: string,
  min: number,
  max: number,
  integer: boolean,
): number | string {
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    return `${name} precisa ser um número${integer ? ' inteiro' : ''}: ${raw}`;
  }
  if (value < min || value > max) return `${name} fora do intervalo ${min}–${max}: ${raw}`;
  return value;
}

/** Strict argv parsing: unknown flags, missing values and out-of-range numbers are errors. */
export function parseArgs(argv: readonly string[]): ArgsResult {
  const [command, ...rest] = argv;
  if (command !== 'simulate' && command !== 'followups') {
    return { ok: false, message: `comando desconhecido: ${command ?? '(nenhum)'}\n${USAGE}` };
  }
  const args: Args = { command, ticks: 600, loadMultiplier: 1 };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i] ?? '';
    const value = rest[i + 1];
    if (!FLAGS.has(flag)) return { ok: false, message: `opção desconhecida: ${flag}\n${USAGE}` };
    if (value === undefined || value.startsWith('--'))
      return { ok: false, message: `${flag} precisa de um valor` };
    switch (flag) {
      case '--session':
        args.session = value;
        break;
      case '--diagram':
        args.diagram = value;
        break;
      case '--problem':
        args.problem = value;
        break;
      case '--ticks': {
        const n = number('--ticks', value, 1, LIMITS.maxTicks, true);
        if (typeof n === 'string') return { ok: false, message: n };
        args.ticks = n;
        break;
      }
      case '--load-multiplier': {
        const n = number('--load-multiplier', value, 1, LIMITS.maxMultiplier, false);
        if (typeof n === 'string') return { ok: false, message: n };
        args.loadMultiplier = n;
        break;
      }
    }
  }
  if (args.session !== undefined && args.diagram !== undefined) {
    return { ok: false, message: 'use --session ou --diagram, não os dois' };
  }
  if (args.command === 'followups' && args.diagram !== undefined && args.problem === undefined) {
    return { ok: false, message: 'followups com --diagram precisa de --problem' };
  }
  return { ok: true, args };
}

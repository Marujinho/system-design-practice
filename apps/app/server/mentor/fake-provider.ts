import type { MentorProviderId } from '@archsim/problems';
import type { MentorProvider, ProviderChunk } from './provider';

/**
 * A scripted provider for tests and the e2e suite (never the real thing). The
 * question picks the script:
 * - "erro:auth" / "erro:429" → that error;
 * - "lento" → a first chunk, then waits until aborted;
 * - "trava" → never answers;
 * - "proponha:ec2" → a valid proposal (an EC2 'API' connected from n1); "proponha:invalida" → one with a service that doesn't exist;
 * - anything else → three chunks naming the first node in the diagram.
 */
export function fakeProvider(
  id: MentorProviderId,
  options: { available?: boolean; delayMs?: number } = {},
): MentorProvider & { calls: number } {
  const delay = options.delayMs ?? 5;
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  const self = {
    id,
    calls: 0,
    available: () => Promise.resolve(options.available ?? true),
    async *stream(
      input: Parameters<MentorProvider['stream']>[0],
      signal: AbortSignal,
    ): AsyncIterable<ProviderChunk> {
      self.calls += 1;
      const q = input.message.trim();
      if (q === 'erro:auth') {
        yield { type: 'error', code: 'auth' };
        return;
      }
      if (q === 'erro:429') {
        yield { type: 'error', code: 'rate_limit' };
        return;
      }
      if (q === 'proponha:ec2' || q === 'proponha:invalida') {
        yield { type: 'delta', text: 'Proponho uma API atrás dos Usuários. ' };
        yield {
          type: 'proposal',
          input: {
            summary: 'API atrás dos Usuários',
            ops:
              q === 'proponha:ec2'
                ? [
                    { op: 'add', ref: 'novo1', service: 'aws.ec2', label: 'API' },
                    { op: 'connect', from: 'n1', to: 'novo1' },
                  ]
                : [{ op: 'add', ref: 'novo1', service: 'aws.nao-existe' }],
          },
        };
        yield { type: 'delta', text: 'Você decide se aplica.' };
        return;
      }
      if (q === 'trava') {
        await wait(60_000, signal);
        return;
      }
      if (q === 'lento') {
        yield { type: 'delta', text: 'Pensando devagar' };
        await wait(60_000, signal);
        return;
      }
      const node = /"(n\d+)"/.exec(input.state)?.[1] ?? 'nenhum nó';
      for (const text of ['Olhando o desenho: ', `o nó ${node} `, 'é o primeiro da lista.']) {
        await wait(delay, signal);
        if (signal.aborted) return;
        yield { type: 'delta', text };
      }
      yield { type: 'usage', usage: { inputTokens: 1200, outputTokens: 30, costUsd: 0.0054 } };
    },
  };
  return self;
}

import { catalog } from '@archsim/catalog';
import { PROBLEMS_DIR } from '@archsim/problems/load';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { createPracticeHandler } from './server/routes';

export function practiceDir(env: Record<string, string | undefined> = process.env): string {
  return env.ARCHSIM_PRACTICE_DIR ?? resolve(PROBLEMS_DIR, '..', 'practice');
}

/** Serves /__archsim/* from the dev and preview servers: finalize, history, reference (FR-47). */
export function practicePlugin(): Plugin {
  const handler = () => {
    const h = createPracticeHandler({
      practiceDir: practiceDir(),
      problemsDir: PROBLEMS_DIR,
      catalog,
    });
    return (
      req: Parameters<typeof h>[0],
      res: Parameters<typeof h>[1],
      next: Parameters<typeof h>[2],
    ) => {
      void h(req, res, next);
    };
  };
  return {
    name: 'archsim-practice',
    configureServer(server) {
      server.middlewares.use(handler());
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler());
    },
  };
}

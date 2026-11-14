import { catalog } from '@archsim/catalog';
import { PROBLEMS_DIR } from '@archsim/problems/load';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { apiProvider } from './server/mentor/api-provider';
import type { MentorOptions } from './server/mentor/chat-route';
import { cliProvider } from './server/mentor/cli-provider';
import { fakeProvider } from './server/mentor/fake-provider';
import { createPracticeHandler } from './server/routes';

export const DEFAULT_MENTOR_MODEL = 'claude-opus-5-5';

/**
 * The study-mode mentor: the person's subscription through the installed
 * claude, then the API key from this environment. ARCHSIM_MENTOR_FAKE=1 (set
 * only by the e2e suite) swaps both for scripted fakes.
 */
export function mentorOptions(
  env: Record<string, string | undefined> = process.env,
): MentorOptions {
  const model = env.ARCHSIM_MENTOR_MODEL ?? DEFAULT_MENTOR_MODEL;
  if (env.ARCHSIM_MENTOR_FAKE === '1') {
    return { model, providers: [fakeProvider('subscription'), fakeProvider('api')] };
  }
  return { model, providers: [cliProvider({ env }), apiProvider({ env })] };
}

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
      mentor: mentorOptions(),
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

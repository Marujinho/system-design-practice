import * as Comlink from 'comlink';
import { createLoop } from './loop';

const loop = createLoop();

const api = {
  setDiagram: loop.setDiagram.bind(loop),
  start: loop.start.bind(loop),
  pause: loop.pause.bind(loop),
  resume: loop.resume.bind(loop),
  reset: loop.reset.bind(loop),
  stop: loop.stop.bind(loop),
  /** Test-only crash, so the e2e can prove a worker failure is recoverable (NFR-5). */
  crash() {
    if (import.meta.env.MODE !== 'test') return;
    setTimeout(() => {
      throw new Error('falha forçada pelo teste');
    });
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);

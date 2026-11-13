import type { Diagram, SimResult } from '@archsim/sim-engine';
import * as Comlink from 'comlink';
import { createLoop } from './loop';
import type { SimWorkerApi } from './sim.worker';

export interface SimBackend {
  setDiagram(d: Diagram): void;
  start(onResult: (r: SimResult) => void): void;
  pause(): void;
  resume(): void;
  crash(): void;
  dispose(): void;
}

/** The engine in a Web Worker (FR-10): the UI thread never runs a tick. */
export function workerBackend(onError: (message: string) => void): SimBackend {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (e) => {
    e.preventDefault();
    onError(e.message || 'erro no worker');
  };
  worker.onmessageerror = () => {
    onError('mensagem inválida do worker');
  };
  const api = Comlink.wrap<SimWorkerApi>(worker);
  return {
    setDiagram: (d) => void api.setDiagram(d),
    start: (cb) => void api.start(Comlink.proxy(cb)),
    pause: () => void api.pause(),
    resume: () => void api.resume(),
    crash: () => void api.crash(),
    dispose: () => {
      api[Comlink.releaseProxy]();
      worker.terminate();
    },
  };
}

/** The same loop in-process; for tests, where there is no Worker. */
export function inlineBackend(onError: (message: string) => void): SimBackend {
  const loop = createLoop();
  return {
    setDiagram: (d) => {
      loop.setDiagram(d);
    },
    start: (cb) => {
      loop.start((r) => {
        try {
          cb(r);
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    pause: () => {
      loop.pause();
    },
    resume: () => {
      loop.resume();
    },
    crash: () => {
      loop.stop();
      onError('falha forçada pelo teste');
    },
    dispose: () => {
      loop.stop();
    },
  };
}

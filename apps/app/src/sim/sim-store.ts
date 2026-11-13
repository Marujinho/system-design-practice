import type { Diagram, SimResult } from '@archsim/sim-engine';
import { create } from 'zustand';
import { workerBackend, type SimBackend } from './sim-client';

export type SimStatus = 'idle' | 'running' | 'paused' | 'error';

type Factory = (onError: (message: string) => void) => SimBackend;

let factory: Factory = workerBackend;

/** Tests swap the Worker for the in-process loop. */
export function setBackendFactory(f: Factory): void {
  factory = f;
}

interface SimStore {
  status: SimStatus;
  result: SimResult | null;
  error: string | null;
  backend: SimBackend | null;
  diagram: Diagram | null;
  start(diagram: Diagram): void;
  update(diagram: Diagram): void;
  pause(): void;
  resume(): void;
  /** Recreate the worker after a failure and resend the current diagram (NFR-5). */
  restart(): void;
  stop(): void;
}

export const useSim = create<SimStore>()((set, get) => {
  const boot = (diagram: Diagram) => {
    const backend = factory((message) => {
      get().backend?.dispose();
      set({ status: 'error', error: message, backend: null });
    });
    backend.setDiagram(diagram);
    backend.start((result) => {
      set({ result });
    });
    set({ backend, diagram, status: 'running', error: null });
  };

  return {
    status: 'idle',
    result: null,
    error: null,
    backend: null,
    diagram: null,

    start: (diagram) => {
      get().backend?.dispose();
      set({ result: null });
      boot(diagram);
    },
    update: (diagram) => {
      set({ diagram });
      get().backend?.setDiagram(diagram);
    },
    pause: () => {
      const { backend, status } = get();
      if (status !== 'running' || !backend) return;
      backend.pause();
      set({ status: 'paused' });
    },
    resume: () => {
      const { backend, status } = get();
      if (status !== 'paused' || !backend) return;
      backend.resume();
      set({ status: 'running' });
    },
    restart: () => {
      const { diagram } = get();
      get().backend?.dispose();
      if (diagram) boot(diagram);
    },
    stop: () => {
      get().backend?.dispose();
      set({ backend: null, status: 'idle', result: null, error: null });
    },
  };
});

import { catalog } from '@archsim/catalog';
import {
  initialState,
  step,
  TICK_MS,
  type Diagram,
  type SimResult,
  type SimState,
} from '@archsim/sim-engine';

export type ResultListener = (result: SimResult) => void;

/** The tick loop, shared by the worker and the in-process backend used in tests. */
export function createLoop(now: () => number = () => performance.now()) {
  let diagram: Diagram | null = null;
  let state: SimState = initialState();
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = 0;
  let listener: ResultListener | null = null;

  const tick = () => {
    if (!diagram || !listener) return;
    const t = now();
    const dt = Math.min(Math.max(t - last, 1), 1000);
    last = t;
    const r = step(state, diagram, catalog, dt);
    state = r.state;
    listener(r.result);
  };

  return {
    setDiagram(d: Diagram) {
      diagram = d;
    },
    start(onResult: ResultListener) {
      listener = onResult;
      this.resume();
    },
    pause() {
      clearInterval(timer);
      timer = undefined;
    },
    resume() {
      if (timer !== undefined) return;
      last = now();
      timer = setInterval(tick, TICK_MS);
    },
    reset() {
      state = initialState();
    },
    stop() {
      this.pause();
      listener = null;
    },
  };
}

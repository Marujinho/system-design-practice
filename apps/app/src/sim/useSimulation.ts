import { useEffect } from 'react';
import { useDiagram } from '../store/diagram-store';
import { useSim } from './sim-store';

/** Keeps the simulation running on the current diagram while the workspace is open. */
export function useSimulation(): void {
  useEffect(() => {
    useSim.getState().start(useDiagram.getState().diagram);
    const unsubscribe = useDiagram.subscribe((s, prev) => {
      if (s.diagram !== prev.diagram) useSim.getState().update(s.diagram);
    });
    return () => {
      unsubscribe();
      useSim.getState().stop();
    };
  }, []);
}

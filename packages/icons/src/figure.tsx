import { useEffect, useRef } from 'react';
import { HL } from '../vendor/kernel.js';
import { figureFor } from './registry';

export interface ServiceFigureProps {
  serviceId: string;
  /** Accessible name; the service label. */
  label: string;
  className?: string;
}

/**
 * A service's isometric figure (FR-33). The kernel styles it from the
 * --hairline-* tokens, answers the pointer, sleeps offscreen and lands at
 * once under prefers-reduced-motion.
 */
export function ServiceFigure({ serviceId, label, className }: ServiceFigureProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const figure = figureFor(serviceId);

  useEffect(() => {
    const stage = stageRef.current;
    const svg = svgRef.current;
    const read = readRef.current;
    if (!stage || !svg || !read || !figure) return;
    HL.inject(document);
    const instance = figure.mount({ stage, svg, read }, figure.range[1]);
    return () => {
      instance.destroy();
    };
  }, [figure]);

  if (!figure) return null;
  return (
    <div ref={stageRef} data-hairline="" className={className} role="img" aria-label={label}>
      <svg ref={svgRef} viewBox="0 0 400 320" aria-hidden="true" />
      <span ref={readRef} data-hairline-live="" aria-live="polite" />
    </div>
  );
}

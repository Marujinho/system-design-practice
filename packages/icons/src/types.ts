/** What a figure module exports: the hairline-create format, as an ES module. */
export interface FigureStage {
  stage: HTMLElement;
  svg: SVGSVGElement;
  read: HTMLElement;
}

export interface FigureInstance {
  set(value: number): void;
  destroy(): void;
}

export interface FigureDef {
  name: string;
  means: string;
  rules: number[];
  range: [number, number, number];
  tour: ([number, number] | null)[] | null;
  mount(stage: FigureStage, value: number): FigureInstance;
}

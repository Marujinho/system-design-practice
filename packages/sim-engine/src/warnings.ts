export type WarningCode =
  | 'CYCLE_UNSUPPORTED'
  | 'WEIGHTS_NORMALIZED'
  | 'NUMERIC_GUARD'
  | 'QUEUE_NO_CONSUMER'
  | 'INVALID_CONNECTION'
  | 'NO_ENTRY';

/** A structured, user-facing note. The engine never throws on domain input. */
export interface SimWarning {
  code: WarningCode;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

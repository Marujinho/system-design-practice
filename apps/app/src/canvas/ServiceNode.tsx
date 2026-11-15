import { catalog, findService, findVariant } from '@archsim/catalog';
import { ServiceFigure } from '@archsim/icons';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '../viz/useReducedMotion';
import type { ReplicaGroup } from './replicas';

export interface ServiceNodeData extends Record<string, unknown> {
  serviceId: string;
  /** The instance type, shown on the card when the service offers more than one. */
  variantId: string;
  label: string;
  /** The units this card stands for, when more than one (replica-groups FR-1). */
  replicas?: ReplicaGroup | null;
  /** Live status, filled in by the visualization layer. */
  status?: ReactNode;
  health?: string;
}

export type ServiceFlowNode = Node<ServiceNodeData, 'service'>;

/** Copies drawn at most; the rest is "+N" (replica-groups FR-3). */
export const MAX_COPIES = 12;

/**
 * The units a card stands for, as small copies in a frame: one node, one set of
 * connections, many machines (replica-groups FR-1–FR-5). Copies that appear
 * after the card mounted come in with a short animation, unless motion is reduced.
 */
function ReplicaStrip({ group }: { group: ReplicaGroup }) {
  const reduced = useReducedMotion();
  const shown = Math.min(group.count, MAX_COPIES);
  // What was on screen before this render: only copies beyond it are new.
  const before = useRef(shown);
  const previous = before.current;
  useEffect(() => {
    before.current = shown;
  }, [shown]);
  return (
    <div className="replica-group" role="img" aria-label={group.label}>
      <div className="replica-copies" aria-hidden="true">
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className={[
              'replica',
              group.primary && i === 0 && 'primary',
              !reduced && i >= previous && 'replica-enter',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
        {group.count > MAX_COPIES && (
          <span className="replica-more num">+{group.count - MAX_COPIES}</span>
        )}
      </div>
      <span className="replica-label" aria-hidden="true">
        {group.label}
      </span>
    </div>
  );
}

function ServiceNodeView({ data, selected }: NodeProps<ServiceFlowNode>) {
  const service = findService(catalog, data.serviceId);
  const name = service?.label ?? data.serviceId;
  const fullName = service?.fullName;
  const variant =
    service && service.variants.length > 1 ? findVariant(service, data.variantId) : undefined;
  return (
    <div
      className={`service-node${selected ? ' selected' : ''}`}
      data-health={data.health ?? 'healthy'}
      // The acronym spelled out on hover, without growing the card (study-mode FR-20).
      {...(fullName === undefined ? {} : { title: fullName })}
    >
      {service?.kind !== 'entry' && <Handle type="target" position={Position.Left} />}
      <ServiceFigure
        serviceId={data.serviceId}
        label={fullName === undefined ? name : `${name} (${fullName})`}
        className="service-figure"
      />
      <div className="service-node-text">
        <span className="service-node-label">{data.label}</span>
        {data.label !== name && <span className="service-node-kind">{name}</span>}
        {variant && <span className="service-node-variant num">{variant.id}</span>}
      </div>
      {data.replicas && <ReplicaStrip group={data.replicas} />}
      {data.status}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeView);

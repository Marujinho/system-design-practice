import { catalog, findService, findVariant } from '@archsim/catalog';
import { ServiceFigure } from '@archsim/icons';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type ReactNode } from 'react';
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
      {data.status}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeView);

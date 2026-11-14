import { catalog, findService, findVariant } from '@archsim/catalog';
import { ServiceFigure } from '@archsim/icons';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type ReactNode } from 'react';

export interface ServiceNodeData extends Record<string, unknown> {
  serviceId: string;
  /** The instance type, shown on the card when the service offers more than one. */
  variantId: string;
  label: string;
  /** Live status, filled in by the visualization layer. */
  status?: ReactNode;
  health?: string;
}

export type ServiceFlowNode = Node<ServiceNodeData, 'service'>;

function ServiceNodeView({ data, selected }: NodeProps<ServiceFlowNode>) {
  const service = findService(catalog, data.serviceId);
  const name = service?.label ?? data.serviceId;
  const variant =
    service && service.variants.length > 1 ? findVariant(service, data.variantId) : undefined;
  return (
    <div
      className={`service-node${selected ? ' selected' : ''}`}
      data-health={data.health ?? 'healthy'}
    >
      {service?.kind !== 'entry' && <Handle type="target" position={Position.Left} />}
      <ServiceFigure serviceId={data.serviceId} label={name} className="service-figure" />
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

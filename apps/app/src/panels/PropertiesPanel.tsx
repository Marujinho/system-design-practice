import { catalog, findService, findVariant } from '@archsim/catalog';
import {
  nodeStatics,
  Protocol,
  readValue,
  type DiagramEdge,
  type DiagramNode,
} from '@archsim/sim-engine';
import { useId } from 'react';
import { formatRps, formatUsd } from '../format';
import { useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';
import { LimitRow } from './LimitRow';
import { ParamField } from './ParamField';
import { groupVariants, optionText } from './variant-options';

const PROTOCOL_LABEL: Record<Protocol, string> = {
  http: 'HTTP/HTTPS',
  grpc: 'gRPC',
  tcp: 'TCP (banco)',
  websocket: 'WebSocket',
  pubsub: 'Pub/sub',
  queue: 'Fila',
};

function NodePanel({ node }: { node: DiagramNode }) {
  const diagram = useDiagram((s) => s.diagram);
  const store = useDiagram.getState;
  const labelId = useId();
  const variantId = useId();
  const service = findService(catalog, node.serviceId);
  const variant = service ? findVariant(service, node.variantId) : undefined;
  if (!service || !variant) return <p className="muted">Serviço desconhecido.</p>;
  // Subscribed, so the numbers follow each simulation result, not just diagram edits.
  const live = useSim((s) => s.result?.nodes[node.id]);
  const statics = nodeStatics(node, catalog, diagram.load);
  const capacity = live?.capacity ?? statics?.capacity ?? 0;
  const cost = live?.costMonth ?? statics?.idleCostMonth ?? 0;
  const value = (key: string) => readValue(node, variant, key);
  const groups = groupVariants(service.variants);

  return (
    <div className="panel" aria-label={`Propriedades de ${node.label}`}>
      <header>
        <h2>{service.label}</h2>
        <p className="muted">{service.description}</p>
      </header>

      <div className="field">
        <label htmlFor={labelId}>Nome no desenho</label>
        <input
          id={labelId}
          value={node.label}
          maxLength={80}
          onChange={(e) => {
            store().setLabel(node.id, e.target.value);
          }}
        />
      </div>

      {service.variants.length > 1 && (
        <div className="field">
          <label htmlFor={variantId}>Tipo</label>
          <select
            id={variantId}
            value={node.variantId}
            onChange={(e) => {
              store().setVariant(node.id, e.target.value);
            }}
          >
            {groups.length > 1
              ? groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {optionText(v)}
                      </option>
                    ))}
                  </optgroup>
                ))
              : service.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {optionText(v)}
                  </option>
                ))}
          </select>
        </div>
      )}

      {service.params.map((p) => (
        <ParamField
          key={p.key}
          label={p.label}
          unit={p.unit}
          value={node.props[p.key] ?? p.default}
          min={p.min}
          max={p.max}
          step={p.step}
          onCommit={(v) => store().setProp(node.id, p.key, v)}
        />
      ))}

      {service.kind !== 'entry' && (
        <dl className="figures">
          <div>
            <dt>Capacidade</dt>
            <dd className="num">
              {Number.isFinite(capacity) ? formatRps(capacity) : 'sem limite'}
            </dd>
          </div>
          <div>
            <dt>Custo</dt>
            <dd className="num">{formatUsd(cost)}/mês</dd>
          </div>
        </dl>
      )}

      {variant.burst === true && (
        <p className="note">Capacidade em burst; créditos de CPU ainda não modelados.</p>
      )}

      {service.kind !== 'entry' && (
        <section>
          <h3>Números da simulação</h3>
          <ul className="limits">
            <LimitRow
              label="Capacidade por unidade"
              unit="req/s"
              catalogValue={variant.capPerUnit}
              value={value('capPerUnit')}
              source={variant.capSource}
              sourceUrl={variant.capSourceUrl}
              onOverride={(v) => {
                store().setOverride(node.id, 'capPerUnit', v);
              }}
              onReset={() => {
                store().resetOverride(node.id, 'capPerUnit');
              }}
            />
            <LimitRow
              label="Latência base"
              unit="ms"
              catalogValue={variant.baseLatencyMs}
              value={value('baseLatencyMs')}
              source="assumption"
              onOverride={(v) => {
                store().setOverride(node.id, 'baseLatencyMs', v);
              }}
              onReset={() => {
                store().resetOverride(node.id, 'baseLatencyMs');
              }}
            />
            {variant.limits.map((l) => (
              <LimitRow
                key={l.id}
                label={l.label}
                unit={l.unit}
                catalogValue={l.value}
                value={value(l.id)}
                source={l.source}
                sourceUrl={l.sourceUrl}
                onOverride={(v) => {
                  store().setOverride(node.id, l.id, v);
                }}
                onReset={() => {
                  store().resetOverride(node.id, l.id);
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {variant.prices.length > 0 && (
        <section>
          <h3>Preços (us-east-1)</h3>
          <ul className="prices">
            {variant.prices.map((p) => (
              <li key={p.id}>
                <span>{p.label}</span>
                <span className="num">
                  US$ {p.amountUsd.toLocaleString('pt-BR', { maximumFractionDigits: 10 })}
                </span>
                <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener" className="muted">
                  fonte, {p.priceDate.split('-').reverse().join('/')}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EdgePanel({ edge }: { edge: DiagramEdge }) {
  const load = useDiagram((s) => s.diagram.load);
  const store = useDiagram.getState;
  const protocolId = useId();
  return (
    <div className="panel" aria-label="Propriedades da conexão">
      <header>
        <h2>Conexão</h2>
      </header>
      <div className="field">
        <label htmlFor={protocolId}>Protocolo</label>
        <select
          id={protocolId}
          value={edge.protocol}
          onChange={(e) => {
            store().setEdge(edge.id, { protocol: Protocol.parse(e.target.value) });
          }}
        >
          {Protocol.options.map((p) => (
            <option key={p} value={p}>
              {PROTOCOL_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      <ParamField
        label="Peso da conexão"
        unit="%, vazio = divide o restante"
        value={edge.weight === undefined ? 0 : Math.round(edge.weight * 100)}
        min={0}
        max={100}
        step={1}
        onCommit={(v) => {
          store().setEdge(edge.id, { weight: v / 100 });
          return true;
        }}
      />
      {edge.weight !== undefined && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            store().setEdge(edge.id, { weight: undefined });
          }}
        >
          remover peso
        </button>
      )}
      <fieldset className="field">
        <legend>Classes que passam por aqui</legend>
        {load.classes.map((c) => {
          const on = edge.classes === undefined || edge.classes.includes(c.name);
          return (
            <label key={c.name} className="check">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  const current = edge.classes ?? load.classes.map((x) => x.name);
                  const next = e.target.checked
                    ? [...current, c.name]
                    : current.filter((x) => x !== c.name);
                  const all = next.length === load.classes.length;
                  store().setEdge(edge.id, { classes: all ? undefined : next });
                }}
              />
              {c.label}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

export function PropertiesPanel() {
  const selection = useDiagram((s) => s.selection);
  const diagram = useDiagram((s) => s.diagram);
  if (selection.length !== 1) {
    return (
      <p className="panel-empty muted">
        {selection.length === 0
          ? 'Selecione um nó ou uma conexão.'
          : `${selection.length} itens selecionados.`}
      </p>
    );
  }
  const id = selection[0] ?? '';
  const node = diagram.nodes.find((n) => n.id === id);
  if (node) return <NodePanel node={node} />;
  const edge = diagram.edges.find((e) => e.id === id);
  if (edge) return <EdgePanel edge={edge} />;
  return null;
}

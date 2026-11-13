import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { PropertiesPanel } from './PropertiesPanel';

const s = () => useDiagram.getState();

beforeEach(() => {
  s().start({ kind: 'free' }, emptyDiagram());
});

function select(serviceId: string): string {
  const id = s().addNode(serviceId, { x: 0, y: 0 }) ?? '';
  s().select([id]);
  return id;
}

describe('PropertiesPanel (FR-7, FR-8, FR-39)', () => {
  it('asks for a selection when nothing is selected', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('Selecione um nó ou uma conexão.')).toBeTruthy();
  });

  it('EC2 t3.small × 3 shows 900 req/s and US$ 45,55/mês', async () => {
    select('aws.ec2');
    render(<PropertiesPanel />);
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 't3.small');
    const units = screen.getByLabelText('Réplicas');
    await userEvent.clear(units);
    await userEvent.type(units, '3{Enter}');
    expect(screen.getByText('900 req/s')).toBeTruthy();
    expect(screen.getByText('US$ 45,55/mês')).toBeTruthy();
  });

  it('groups the EC2 types by family and shows req/s and US$/mês on each (aws-instance-types FR-9b, FR-12)', async () => {
    select('aws.ec2');
    const { container } = render(<PropertiesPanel />);
    const picker = screen.getByLabelText('Tipo');
    expect([...container.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
      'Burst',
      'Uso geral',
      'Computação',
      'Memória',
    ]);
    const option = within(picker).getByRole('option', { name: /^c5\.xlarge / });
    expect(option.textContent).toContain('2.000 req/s');
    expect(option.textContent).toContain('US$ 124,10/mês');
    await userEvent.selectOptions(picker, 'c5.xlarge');
    expect(s().diagram.nodes[0]?.variantId).toBe('c5.xlarge');
    expect(container.querySelector('.figures')?.textContent).toContain('2.000 req/s');
  });

  it('keeps a flat list for a service with a single family', () => {
    select('aws.fargate');
    const { container } = render(<PropertiesPanel />);
    expect(container.querySelectorAll('optgroup')).toHaveLength(0);
    expect(within(screen.getByLabelText('Tipo')).getAllByRole('option')).toHaveLength(7);
  });

  it('refuses 0 replicas and shows the valid range', async () => {
    select('aws.ec2');
    render(<PropertiesPanel />);
    const units = screen.getByLabelText('Réplicas');
    await userEvent.clear(units);
    await userEvent.type(units, '0{Enter}');
    expect(screen.getByRole('alert').textContent).toMatch(/entre 1 e 1\.000/);
    expect(s().diagram.nodes[0]?.props.units).toBeUndefined();
  });

  it('labels the Lambda concurrency as a cited AWS quota', () => {
    select('aws.lambda');
    render(<PropertiesPanel />);
    const row = screen.getByText('Capacidade por unidade').closest('li');
    if (!row) throw new Error('no row');
    const badge = within(row).getByRole('link', { name: 'cota AWS' });
    expect(badge.getAttribute('href')).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
    expect(badge.getAttribute('rel')).toBe('noreferrer noopener');
  });

  it('labels the EC2 req/s as an assumption, overrides it and restores the default', async () => {
    const id = select('aws.ec2');
    render(<PropertiesPanel />);
    const row = screen.getByText('Capacidade por unidade').closest('li');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('premissa')).toBeTruthy();
    await userEvent.click(
      within(row).getByRole('button', { name: /Editar Capacidade por unidade/ }),
    );
    const input = within(row).getByLabelText('Novo valor para Capacidade por unidade');
    await userEvent.clear(input);
    await userEvent.type(input, '150{Enter}');
    expect(s().diagram.nodes.find((n) => n.id === id)?.overrides.capPerUnit).toBe(150);
    expect(within(row).getByText('valor alterado')).toBeTruthy();
    // the capacity and the edited premise both read 150 req/s
    expect(screen.getAllByText('150 req/s')).toHaveLength(2);
    await userEvent.click(within(row).getByRole('button', { name: 'restaurar padrão' }));
    expect(s().diagram.nodes.find((n) => n.id === id)?.overrides).toEqual({});
  });

  it('shows the burst note on T instances only', async () => {
    select('aws.ec2');
    render(<PropertiesPanel />);
    expect(screen.getByText(/créditos de CPU ainda não modelados/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'm5.large');
    expect(screen.queryByText(/créditos de CPU/)).toBeNull();
  });

  it('edits a connection: protocol, weight and classes', async () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const b = s().addNode('aws.rds-postgres', { x: 0, y: 0 }) ?? '';
    s().setLoad({
      classes: [
        {
          name: 'read',
          label: 'Leitura',
          mode: 'rps',
          op: 'read',
          rps: 1,
          payloadKB: 1,
          cacheable: true,
        },
        {
          name: 'write',
          label: 'Escrita',
          mode: 'rps',
          op: 'write',
          rps: 1,
          payloadKB: 1,
          cacheable: false,
        },
      ],
    });
    const e = s().connect(a, b, 'tcp') ?? '';
    s().select([e]);
    render(<PropertiesPanel />);
    await userEvent.selectOptions(screen.getByLabelText('Protocolo'), 'grpc');
    const w = screen.getByLabelText(/Peso da conexão/);
    await userEvent.clear(w);
    await userEvent.type(w, '80{Enter}');
    await userEvent.click(screen.getByLabelText('Leitura'));
    const edge = s().diagram.edges[0];
    expect(edge?.protocol).toBe('grpc');
    expect(edge?.weight).toBeCloseTo(0.8, 9);
    expect(edge?.classes).toEqual(['write']);
  });
});

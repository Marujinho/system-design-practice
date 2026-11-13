import { catalog, findService, type Variant } from '@archsim/catalog';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FAMILY_LABEL, groupVariants, monthlyPerUnit, optionText } from './variant-options';

const variants = (serviceId: string): Variant[] => findService(catalog, serviceId)?.variants ?? [];

describe('groupVariants (aws-instance-types FR-12)', () => {
  it('groups EC2 into the four families, in order, smallest capacity first', () => {
    const groups = groupVariants(variants('aws.ec2'));
    expect(groups.map((g) => g.label)).toEqual(['Burst', 'Uso geral', 'Computação', 'Memória']);
    for (const g of groups) {
      const caps = g.variants.map((v) => v.capPerUnit);
      expect(caps).toEqual([...caps].sort((a, b) => a - b));
    }
    expect(groups[0]?.variants[0]?.id).toBe('t3.nano');
    expect(groups.flatMap((g) => g.variants)).toHaveLength(19);
  });

  it('keeps a service without families in a single group', () => {
    const groups = groupVariants(variants('aws.fargate'));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.family).toBeNull();
    expect(groups[0]?.variants).toHaveLength(7);
  });

  it('labels every family in Portuguese', () => {
    expect(Object.values(FAMILY_LABEL)).toEqual(['Burst', 'Uso geral', 'Computação', 'Memória']);
  });
});

describe('optionText (aws-instance-types FR-9b)', () => {
  const ec2 = (id: string) => variants('aws.ec2').find((v) => v.id === id) as Variant;

  it('shows the capacity and the monthly price of one unit', () => {
    const text = optionText(ec2('t3.micro'));
    expect(text).toContain('t3.micro (2 vCPU, 1 GiB');
    expect(text).toContain('200 req/s');
    expect(text).toContain('US$ 7,59/mês');
  });

  it('adds every hourly price, like the EKS cluster fee', () => {
    const node = variants('aws.eks').find((v) => v.id === 'm5.large-nodes') as Variant;
    expect(monthlyPerUnit(node)).toBeCloseTo((0.1 + 0.096) * 730, 6);
  });

  it('leaves the price out when the type is charged by use only', () => {
    const rest = variants('aws.api-gateway').find((v) => v.id === 'rest') as Variant;
    expect(monthlyPerUnit(rest)).toBe(0);
    expect(optionText(rest)).not.toContain('/mês');
  });
});

describe('option text is text (aws-instance-types A05)', () => {
  it('renders a label with markup as plain text', () => {
    const base = variants('aws.ec2')[0] as Variant;
    const evil = { ...base, label: '<img src=x onerror=alert(1)>' };
    const { container } = render(
      <select aria-label="Tipo">
        <option value={evil.id}>{optionText(evil)}</option>
      </select>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('option')?.textContent).toContain('<img src=x');
  });
});

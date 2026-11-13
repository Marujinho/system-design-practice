import type { Family, Variant } from '@archsim/catalog';
import { HOURS_PER_MONTH } from '@archsim/sim-engine';
import { formatRps, formatUsd } from '../format';

/** Names of the instance families; the types themselves come only from the catalog. */
export const FAMILY_LABEL: Record<Family, string> = {
  burst: 'Burst',
  general: 'Uso geral',
  compute: 'Computação',
  memory: 'Memória',
};

const ORDER: readonly Family[] = ['burst', 'general', 'compute', 'memory'];

export interface VariantGroup {
  family: Family | null;
  label: string;
  variants: Variant[];
}

/** The type picker's groups: families in a fixed order, each from the smallest capacity up. */
export function groupVariants(variants: readonly Variant[]): VariantGroup[] {
  const groups: VariantGroup[] = [];
  for (const family of [...ORDER, null]) {
    const members = variants
      .filter((v) => (v.family ?? null) === family)
      .sort((a, b) => a.capPerUnit - b.capPerUnit);
    if (members.length > 0) {
      groups.push({ family, label: family ? FAMILY_LABEL[family] : 'Outros', variants: members });
    }
  }
  return groups;
}

/** What one unit costs per month from its hourly prices; 0 when it is charged by use only. */
export function monthlyPerUnit(variant: Variant): number {
  return (
    variant.prices.filter((p) => p.per === 'unit-hour').reduce((s, p) => s + p.amountUsd, 0) *
    HOURS_PER_MONTH
  );
}

/** "t3.micro (2 vCPU, 1 GiB, baseline 10%) · 200 req/s · US$ 7,59/mês" (aws-instance-types FR-9b). */
export function optionText(variant: Variant): string {
  const monthly = monthlyPerUnit(variant);
  const parts = [variant.label, formatRps(variant.capPerUnit)];
  if (monthly > 0) parts.push(`${formatUsd(monthly)}/mês`);
  return parts.join(' · ');
}

import { z } from 'zod';

/**
 * Behaviour families. The simulation engine picks a handler by kind, never by
 * service id, so another provider's service is only catalog data (PRD NFR-11).
 */
export const Kind = z.enum([
  'entry',
  'dns',
  'cdn',
  'api-gateway',
  'load-balancer',
  'nat',
  'waf',
  'compute',
  'function',
  'object-storage',
  'kv-database',
  'sql-database',
  'cache',
  'queue',
  'pubsub',
  'stream',
  'search',
  'observability',
]);
export type Kind = z.infer<typeof Kind>;

export const Category = z.enum([
  'entrada',
  'rede',
  'computacao',
  'dados',
  'cache',
  'mensageria',
  'busca',
  'observabilidade',
]);
export type Category = z.infer<typeof Category>;

const IsoDate = z.iso.date();
const SourceUrl = z.url({ protocol: /^https$/ });

/**
 * A number the simulator enforces. `aws-quota` is documented by the provider and
 * must cite it; `assumption` is a simulation premise (PRD FR-8).
 */
export const Limit = z
  .object({
    id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    label: z.string().min(1),
    value: z.number().nonnegative(),
    unit: z.string().min(1),
    source: z.enum(['aws-quota', 'assumption']),
    sourceUrl: SourceUrl.optional(),
  })
  .strict()
  .superRefine((limit, ctx) => {
    if (limit.source === 'aws-quota' && limit.sourceUrl === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: `A cota "${limit.id}" precisa de sourceUrl`,
      });
    }
  });
export type Limit = z.infer<typeof Limit>;

/** What a price is charged per. Handlers report usage in these dimensions. */
export const PriceUnit = z.enum([
  'unit-hour',
  'unit-month',
  'million-requests',
  'gb',
  'gb-second',
  'capacity-unit-hour',
  'gb-month',
  'million-units',
]);
export type PriceUnit = z.infer<typeof PriceUnit>;

/**
 * A volume tier: the price per unit up to `upTo` units a month, counted from zero;
 * `null` on the last tier (cost-model FR-1).
 */
export const Tier = z
  .object({ upTo: z.number().positive().nullable(), amountUsd: z.number().nonnegative() })
  .strict();
export type Tier = z.infer<typeof Tier>;

export const Price = z
  .object({
    id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    label: z.string().min(1),
    /** The price per unit; with tiers, the first tier's. */
    amountUsd: z.number().nonnegative(),
    per: PriceUnit,
    tiers: z.array(Tier).min(2).optional(),
    priceDate: IsoDate,
    sourceUrl: SourceUrl,
  })
  .strict()
  .superRefine((price, ctx) => {
    const tiers = price.tiers;
    if (tiers === undefined) return;
    if (tiers[0]?.amountUsd !== price.amountUsd)
      ctx.addIssue({
        code: 'custom',
        path: ['tiers'],
        message: 'a 1ª faixa deve ter o preço amountUsd',
      });
    tiers.forEach((t, i) => {
      const last = i === tiers.length - 1;
      if (last !== (t.upTo === null))
        ctx.addIssue({
          code: 'custom',
          path: ['tiers', i],
          message: 'só a última faixa não tem limite',
        });
      const prev = tiers[i - 1]?.upTo;
      if (t.upTo !== null && prev !== undefined && prev !== null && t.upTo <= prev)
        ctx.addIssue({
          code: 'custom',
          path: ['tiers', i],
          message: 'limites das faixas devem crescer',
        });
    });
  });
export type Price = z.infer<typeof Price>;

/** Instance family: groups the type picker. Omitted on services with a single family. */
export const Family = z.enum(['burst', 'general', 'compute', 'memory']);
export type Family = z.infer<typeof Family>;

export const Variant = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
    label: z.string().min(1),
    /** Requests (or operations) per second one unit handles. */
    capPerUnit: z.number().positive(),
    capSource: z.enum(['aws-quota', 'assumption']),
    capSourceUrl: SourceUrl.optional(),
    baseLatencyMs: z.number().positive(),
    /** T-family burstable instance: the MVP simulates burst capacity only (FR-39). */
    burst: z.boolean().optional(),
    family: Family.optional(),
    prices: z.array(Price),
    limits: z.array(Limit),
  })
  .strict();
export type Variant = z.infer<typeof Variant>;

/** An editable node property, rendered generically by the properties panel. */
export const Param = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    label: z.string().min(1),
    unit: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    default: z.number(),
  })
  .strict()
  .refine((p) => p.min <= p.default && p.default <= p.max, {
    message: 'default fora de [min, max]',
  });
export type Param = z.infer<typeof Param>;

export const ErrorCode = z.enum(['503', '429', 'throttle', 'none']);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const Service = z
  .object({
    id: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/, 'id no formato provider.servico'),
    provider: z.string().regex(/^[a-z]+$/),
    kind: Kind,
    category: Category,
    label: z.string().min(1),
    /** The acronym spelled out ("Simple Queue Service"), shown next to `label` (study-mode FR-17). */
    fullName: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[^<>]+$/)
      .optional(),
    description: z.string().min(1),
    errorCode: ErrorCode,
    validTargetKinds: z.array(Kind),
    variants: z.array(Variant).min(1),
    params: z.array(Param),
  })
  .strict()
  .superRefine((service, ctx) => {
    if (!service.id.startsWith(`${service.provider}.`)) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'id deve começar pelo provider' });
    }
    const seen = new Set<string>();
    for (const v of service.variants) {
      if (seen.has(v.id)) {
        ctx.addIssue({ code: 'custom', path: ['variants'], message: `variante repetida: ${v.id}` });
      }
      seen.add(v.id);
      if (v.capSource === 'aws-quota' && v.capSourceUrl === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants'],
          message: `capacidade da variante ${v.id} é cota e precisa de capSourceUrl`,
        });
      }
    }
  });
export type Service = z.infer<typeof Service>;

export const Catalog = z
  .object({
    catalogVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
    services: z.array(Service).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    for (const s of catalog.services) {
      if (ids.has(s.id)) {
        ctx.addIssue({ code: 'custom', path: ['services'], message: `serviço repetido: ${s.id}` });
      }
      ids.add(s.id);
    }
  });
export type Catalog = z.infer<typeof Catalog>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function parseCatalog(input: unknown): ParseResult<Catalog> {
  const result = Catalog.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, message: z.prettifyError(result.error) };
}

export const catalogJsonSchema = z.toJSONSchema(Catalog, { io: 'input' });

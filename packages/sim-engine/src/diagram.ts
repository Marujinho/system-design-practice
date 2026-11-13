import { findService, findVariant, type Catalog } from '@archsim/catalog';
import { z } from 'zod';

export const LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxNodes: 200,
  maxEdges: 400,
  maxClasses: 8,
  maxTotalRpm: 10_000_000,
  maxLabel: 80,
} as const;

const Finite = z.number();
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const ClassName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

export const RequestClass = z
  .object({
    name: ClassName,
    label: z.string().min(1).max(LIMITS.maxLabel),
    mode: z.enum(['users', 'rps', 'rpm']),
    /** Writes skip caches, go to the database writer and count as S3 PUTs. */
    op: z.enum(['read', 'write']),
    users: Finite.nonnegative().optional(),
    reqPerUserPerMin: Finite.nonnegative().optional(),
    rps: Finite.nonnegative().optional(),
    rpm: Finite.nonnegative().optional(),
    payloadKB: Finite.nonnegative().max(1024 * 1024),
    cacheable: z.boolean(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const need: Record<typeof c.mode, (keyof typeof c)[]> = {
      users: ['users', 'reqPerUserPerMin'],
      rps: ['rps'],
      rpm: ['rpm'],
    };
    for (const key of need[c.mode]) {
      if (c[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} é obrigatório no modo ${c.mode}`,
        });
      }
    }
  });
export type RequestClass = z.infer<typeof RequestClass>;

export const Load = z
  .object({ classes: z.array(RequestClass).min(1).max(LIMITS.maxClasses) })
  .strict();
export type Load = z.infer<typeof Load>;

export const Protocol = z.enum(['http', 'grpc', 'tcp', 'websocket', 'pubsub', 'queue']);
export type Protocol = z.infer<typeof Protocol>;

export const DiagramNode = z
  .object({
    id: Id,
    serviceId: z.string().min(1).max(64),
    variantId: z.string().min(1).max(64),
    position: z.object({ x: Finite, y: Finite }).strict(),
    label: z.string().max(LIMITS.maxLabel),
    props: z.record(z.string().max(32), Finite),
    overrides: z.record(z.string().max(32), Finite.nonnegative()),
  })
  .strict();
export type DiagramNode = z.infer<typeof DiagramNode>;

export const DiagramEdge = z
  .object({
    id: Id,
    source: Id,
    target: Id,
    protocol: Protocol,
    weight: Finite.min(0).max(1).optional(),
    classes: z.array(ClassName).max(LIMITS.maxClasses).optional(),
  })
  .strict();
export type DiagramEdge = z.infer<typeof DiagramEdge>;

export const Diagram = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.string().min(1).max(32),
    name: z.string().max(LIMITS.maxLabel).optional(),
    nodes: z.array(DiagramNode).max(LIMITS.maxNodes),
    edges: z.array(DiagramEdge).max(LIMITS.maxEdges),
    load: Load,
  })
  .strict();
export type Diagram = z.infer<typeof Diagram>;

export const diagramJsonSchema = z.toJSONSchema(Diagram, { io: 'input' });

export type DiagramErrorCode =
  | 'TOO_LARGE'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'TOO_MANY_NODES'
  | 'TOO_MANY_EDGES'
  | 'TOO_MANY_CLASSES'
  | 'LABEL_TOO_LONG'
  | 'INVALID_SCHEMA'
  | 'DUPLICATE_ID'
  | 'DANGLING_EDGE'
  | 'TOO_MANY_ENTRIES'
  | 'UNKNOWN_SERVICE'
  | 'UNKNOWN_VARIANT'
  | 'INVALID_PARAM'
  | 'UNKNOWN_CLASS'
  | 'LOAD_TOO_HIGH';

export type DiagramResult =
  { ok: true; diagram: Diagram } | { ok: false; code: DiagramErrorCode; message: string };

function fail(code: DiagramErrorCode, message: string): DiagramResult {
  return { ok: false, code, message };
}

/** Requests per second a class generates. */
export function rpsOf(c: RequestClass): number {
  switch (c.mode) {
    case 'users':
      return ((c.users ?? 0) * (c.reqPerUserPerMin ?? 0)) / 60;
    case 'rps':
      return c.rps ?? 0;
    case 'rpm':
      return (c.rpm ?? 0) / 60;
  }
}

export function totalRps(load: Load): number {
  return load.classes.reduce((sum, c) => sum + rpsOf(c), 0);
}

const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** JSON.parse that drops prototype-polluting keys (PRD §12 A08). */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => (POISON_KEYS.has(key) ? undefined : value));
}

function arrayLength(obj: unknown, key: string): number {
  if (typeof obj !== 'object' || obj === null) return 0;
  const value = (obj as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

/** Field names the schema defines; anything else in an error path is the file's own text. */
const KNOWN_FIELDS = new Set([
  'schemaVersion',
  'catalogVersion',
  'name',
  'nodes',
  'edges',
  'load',
  'classes',
  'id',
  'serviceId',
  'variantId',
  'position',
  'x',
  'y',
  'label',
  'props',
  'overrides',
  'source',
  'target',
  'protocol',
  'weight',
  'mode',
  'op',
  'users',
  'reqPerUserPerMin',
  'rps',
  'rpm',
  'payloadKB',
  'cacheable',
]);

/** Where a schema issue is, without echoing any key or value written in the file (PRD §12 A05). */
function safePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return 'raiz';
  return path
    .map((part) =>
      typeof part === 'number'
        ? `[${String(part)}]`
        : KNOWN_FIELDS.has(String(part))
          ? String(part)
          : '?',
    )
    .join('.')
    .replace(/\.\[/g, '[');
}

/** The numbers a node may override: capacity, latency and its variant's limits. */
export function overridableKeys(variant: { limits: readonly { id: string }[] }): Set<string> {
  return new Set(['capPerUnit', 'baseLatencyMs', ...variant.limits.map((l) => l.id)]);
}

/**
 * Validate an untrusted value as a diagram against the catalog. Messages never
 * repeat text from the file (keys, ids, labels, values): they name positions
 * and catalog labels only, because they can reach a coding agent (PRD §12 A05).
 */
export function validateDiagram(input: unknown, catalog: Catalog): DiagramResult {
  const version =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>).schemaVersion
      : undefined;
  if (version !== 1) {
    return fail('UNSUPPORTED_VERSION', 'Versão de arquivo não suportada; este app lê a versão 1.');
  }
  if (arrayLength(input, 'nodes') > LIMITS.maxNodes) {
    return fail('TOO_MANY_NODES', `O diagrama passa de ${LIMITS.maxNodes} nós.`);
  }
  if (arrayLength(input, 'edges') > LIMITS.maxEdges) {
    return fail('TOO_MANY_EDGES', `O diagrama passa de ${LIMITS.maxEdges} conexões.`);
  }
  const load = (input as Record<string, unknown>).load;
  if (arrayLength(load, 'classes') > LIMITS.maxClasses) {
    return fail('TOO_MANY_CLASSES', `A carga passa de ${LIMITS.maxClasses} classes de requisição.`);
  }

  const parsed = Diagram.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.find(
      (i) => i.code === 'too_big' && (i.path.includes('label') || i.path.includes('name')),
    );
    if (tooLong) {
      return fail('LABEL_TOO_LONG', `Um rótulo passa de ${LIMITS.maxLabel} caracteres.`);
    }
    const issues = parsed.error.issues;
    const first = issues[0];
    const where = first ? safePath(first.path) : 'raiz';
    const kind = first?.code === 'unrecognized_keys' ? 'campo desconhecido' : 'valor inválido';
    return fail(
      'INVALID_SCHEMA',
      `Arquivo fora do formato esperado: ${String(issues.length)} problema(s); o primeiro é ${kind} em ${where}.`,
    );
  }
  const diagram = parsed.data;

  const ids = new Set<string>();
  for (const item of [...diagram.nodes, ...diagram.edges]) {
    if (ids.has(item.id)) return fail('DUPLICATE_ID', 'Há dois nós ou conexões com o mesmo ID.');
    ids.add(item.id);
  }
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  for (const [i, e] of diagram.edges.entries()) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      return fail(
        'DANGLING_EDGE',
        `A conexão nº ${String(i + 1)} aponta para um nó que não existe.`,
      );
    }
  }

  let entries = 0;
  for (const [i, node] of diagram.nodes.entries()) {
    const at = `no nó nº ${String(i + 1)}`;
    const service = findService(catalog, node.serviceId);
    if (!service) return fail('UNKNOWN_SERVICE', `Serviço desconhecido no catálogo ${at}.`);
    if (service.kind === 'entry') entries += 1;
    const variant = findVariant(service, node.variantId);
    if (!variant)
      return fail('UNKNOWN_VARIANT', `Variante desconhecida de ${service.label} ${at}.`);
    for (const [key, value] of Object.entries(node.props)) {
      const param = service.params.find((p) => p.key === key);
      if (!param)
        return fail('INVALID_PARAM', `${service.label} ${at} tem uma propriedade que não existe.`);
      if (value < param.min || value > param.max) {
        return fail(
          'INVALID_PARAM',
          `${param.label} de ${service.label} ${at} fora do intervalo ${String(param.min)}–${String(param.max)}.`,
        );
      }
    }
    const allowed = overridableKeys(variant);
    if (Object.keys(node.overrides).some((k) => !allowed.has(k))) {
      return fail('INVALID_PARAM', `${service.label} ${at} altera um número que não existe.`);
    }
  }
  if (entries > 1) return fail('TOO_MANY_ENTRIES', 'Só pode haver um nó de Usuários.');

  const classNames = new Set(diagram.load.classes.map((c) => c.name));
  if (classNames.size !== diagram.load.classes.length) {
    return fail('DUPLICATE_ID', 'Há classes de requisição com o mesmo nome.');
  }
  for (const [i, e] of diagram.edges.entries()) {
    for (const c of e.classes ?? []) {
      if (!classNames.has(c)) {
        return fail(
          'UNKNOWN_CLASS',
          `A conexão nº ${String(i + 1)} usa uma classe que não está na carga.`,
        );
      }
    }
  }
  if (totalRps(diagram.load) * 60 > LIMITS.maxTotalRpm) {
    return fail('LOAD_TOO_HIGH', 'A carga total passa de 10.000.000 req/min.');
  }
  return { ok: true, diagram };
}

/** Parse a diagram file's text. Never throws. */
export function parseDiagram(text: string, catalog: Catalog): DiagramResult {
  if (new TextEncoder().encode(text).byteLength > LIMITS.maxBytes) {
    return fail('TOO_LARGE', 'O arquivo passa de 5 MB.');
  }
  let raw: unknown;
  try {
    raw = safeJsonParse(text);
  } catch {
    return fail('INVALID_JSON', 'O arquivo não é um JSON válido.');
  }
  return validateDiagram(raw, catalog);
}

export function serializeDiagram(diagram: Diagram): string {
  return `${JSON.stringify(diagram, null, 2)}\n`;
}

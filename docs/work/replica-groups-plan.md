# Plan: Ver as réplicas no canvas

**PRD**: `docs/work/replica-groups-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-15

## Approach
`toFlow` calcula, por nó, um `replicas` (`{ count, label, primary }`) com uma função pura `replicaGroup(node, service)`. O `ServiceNode` desenha, abaixo da figura, uma moldura com até 12 quadradinhos em CSS e a legenda. As cópias novas montam com a classe `replica-enter` (animação de 240 ms), que só existe quando não há reduced motion. As chaves dos quadradinhos são o índice, então só os novos montam e animam.

**Alternativa que perdeu:** repetir a `ServiceFigure`, um SVG animado com motor próprio, por cópia. Pesaria nos 50 nós do perf.

## Tasks
### T1 — `replicaGroup` e os dados do card
- **Files**: `apps/app/src/canvas/replicas.ts` (new), `replicas.test.ts` (new), `flow-model.ts`, `ServiceNode.tsx` (o tipo do `data`)
- **Mirror**: `UNIT_PARAMS` e o valor com default (`packages/sim-engine/src/findings.ts:33,125`)
- **Do**:
  - para o primeiro parâmetro entre `units`, `shards` e `prefixes` que o serviço tiver, com valor ≥ 2 → `{ count, label: "N réplicas" | "N shards" | "N prefixos" }`;
  - senão, `readReplicas` ≥ 1 → `{ count: N + 1, primary: true, label: "primário + N réplica(s) de leitura" }`;
  - senão, `null`. O resultado entra em `data.replicas`.
- **Tests**: EC2 6 → 6 réplicas; EC2 sem prop (default 1) → `null`; Kinesis 4 shards; S3 3 prefixos; RDS 2 → 3 com primário, RDS 0 → `null`; Lambda → `null`; `toFlow` leva `replicas`.

### T2 — O grupo no card
- **Files**: `apps/app/src/canvas/ServiceNode.tsx`, `canvas.css`, `canvas.test.tsx`
- **Mirror**: a linha secundária do card (`ServiceNode.tsx:31-33`); `useReducedMotion` (`viz/useReducedMotion.ts`)
- **Do**: `<div className="replica-group" role="img" aria-label={label}>` com até 12 `<span aria-hidden className="replica[ primary][ replica-enter]">`, "+N" quando houver mais, e a legenda. CSS: grade de 6 por linha, quadrados de 10 px, e `@keyframes replica-in` (escala 0.4 → 1 e opacidade).
- **Tests**:
  - o card renderiza 6 cópias e o nome acessível "6 réplicas";
  - 30 → 12 cópias e "+18";
  - RDS → o primeiro com a classe `primary`;
  - ao subir de 3 para 5, só as 2 novas recebem `replica-enter` (o render inicial não anima);
  - com reduced motion, nenhuma recebe.

### T3 — e2e
- **Files**: `apps/app/e2e/replica-groups.spec.ts` (new)
- **Do**: no canvas livre, selecionar a EC2 da referência e mudar "Réplicas" para 6 → o card mostra o grupo "6 réplicas" com 6 cópias; para 30 → "+18"; para 1 → nenhum grupo.
- **Check**: `pnpm test:e2e` verde, `perf.spec` ≥ 50 fps, axe sem violações.

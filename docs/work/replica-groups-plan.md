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

## Implementation

**Branch**: `feat/replica-groups` · **Base**: `master` · **Date**: 2026-11-15

| Task | Commit | Lint / Types / Tests |
|---|---|---|
| T1 | `f468e8f` | ✅ ✅ ✅ (721) |
| T2 | `034b231` | ✅ ✅ ✅ (726) |
| T3 | `63e1bec` | ✅ ✅ ✅ + e2e 64/64 |

### Deviations
- **T1** — a legenda usa o nome do próprio parâmetro do painel ("3 nós", "2 tasks", "4 shards"), e não sempre "réplicas", para o card e o painel dizerem o mesmo. EKS, Fargate e OpenSearch já começam com 2 ou 3 unidades e mostram o grupo desde o início. O teste M2 do chat (da feature anterior) passou a esperar o status do provedor antes de segurar o botão: ele falhou uma vez na suíte completa por referência velha.
- **T2** — no jsdom, o `getByRole('img')` não acha o grupo dentro da estrutura do React Flow. Os testes de unidade checam `role` e `aria-label` direto no elemento; o `getByRole` real está no e2e.
- **T3** — o `aria-label` "30 réplicas" casava com `getByLabel('Réplicas')` por substring. Os locators do campo nos e2e (`practice-flow`, `free-flow`) passaram a usar `exact: true`.

### Definition of Done
- [x] FR-1 a FR-6, com testes de unidade, de componente e e2e.
- [x] `pnpm lint`, `typecheck`, `test` (726), `test:e2e` (64) e `audit` passam. O perf ficou em 59,5 fps no p95 (meta ≥ 50).
- [x] Visto no navegador: EC2 com 6 réplicas → 6 cópias e "6 réplicas"; RDS → o primário cheio e "primário + 2 réplicas de leitura".

### Review
- **Performance:** `replicaGroup` roda no `toFlow`, que já roda a cada mudança do diagrama (barato). As cópias são CSS puro, e o perf com 50 nós segue em 59,5 fps.
- **OWASP Top 10:2025:**
  - A06: teto de 12 cópias, testado.
  - A10: o default do parâmetro e os serviços sem quantidade, testados.
  - A01–A05 e A07–A09: N/A, porque a mudança é só renderização, sem dados, rede ou gravação.
- Nenhum achado em aberto.

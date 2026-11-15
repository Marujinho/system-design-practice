# Plan: Custo mensal correto

**PRD**: `docs/work/cost-model-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-15

## Approach
1. **Schema:** o `Price` ganha `tiers?: { upTo: number | null; amountUsd: number }[]` (limites acumulados na unidade do preço; o `amountUsd` continua sendo o preço da 1ª faixa) e as unidades `gb-month` e `million-units`. O `monthlyCost` aplica as faixas.
2. **Motor:** o `step` registra, para cada nó, quanto da entrada veio direto do nó de entrada (`fromInternet`) e passa isso no `NodeContext`. Os kinds usam o valor:
   - o S3 cobra saída só sobre essa parte e soma o armazenamento;
   - o CDN separa leituras (saída para a internet) de escritas (para a origem);
   - o `sql-database` soma armazenamento e o I/O do Aurora;
   - o `stream` soma as unidades de payload.

**Alternativa que perdeu:** marcar no catálogo "S3 atrás de CloudFront". Isso depende do desenho, não do serviço, então tem de vir do grafo.

## Tasks
### T1 — Faixas de preço e unidades novas
- **Files**: `packages/catalog/src/schema.ts`, `schema.test.ts`, `packages/sim-engine/src/queueing.ts` (+ teste)
- **Do**:
  - `Tier` e `tiers` validados: `upTo` crescente, só o último `null`, e o 1º preço igual a `amountUsd`;
  - `PriceUnit` ganha `gb-month` e `million-units`;
  - `tieredCost(quantity, price)`; o `monthlyCost` a usa.
- **Tests**: faixas válidas e inválidas; o exemplo REST a 26,28B → 57.736; quantidade 0 → 0; dentro da 1ª faixa → igual ao preço plano.

### T2 — O motor sabe o que veio da internet; S3 e CloudFront cobram certo
- **Files**: `step.ts`, `kinds/context.ts`, `kinds/types.ts`, `kinds/object-storage.ts`, `kinds/cdn.ts`, testes em `kinds/*.test.ts`
- **Do**:
  - `fromInternet: ClassRates` no contexto: no laço do `step`, somar as taxas das arestas cuja origem é do kind `entry`;
  - S3: GB de saída = Σ por classe de `get.processed[c] × (fromInternet[c] / input[c])`;
  - CDN: `gb` = leituras processadas; `originGb` = escritas processadas, cobradas pelo preço `originTransfer` (por id).
- **Tests**: os três cenários do FR-3 e o FR-4.

### T3 — Catálogo: faixas, preços novos, parâmetros e a versão
- **Files**: `packages/catalog/src/catalog.json`, `catalog.test.ts`, `schemas/*.json` (regenerados)
- **Do**:
  - as faixas do FR-2;
  - CloudFront `originTransfer` a 0,020/GB;
  - S3 `storage` em `gb-month` com faixas e o parâmetro `storageGb`;
  - RDS (todas as variantes) `storage` a 0,115 em `gb-month` e o parâmetro `storageGb`;
  - Aurora (todas) `storage` a 0,10 `gb-month` e `io` a 0,20 `million-units`, com o parâmetro `storageGb`;
  - Kinesis `putPayloadUnits` a 0,014 `million-units`;
  - `catalogVersion` `2026-11-15.1`; `pnpm schemas`.
- **Tests**: os valores e as fontes; a versão.

### T4 — Armazenamento, I/O e payload no cálculo
- **Files**: `kinds/object-storage.ts`, `kinds/sql-database.ts`, `kinds/stream.ts`, testes
- **Do**:
  - S3: `storage` = `storageGb`;
  - RDS: `storage` = `storageGb × (1 + readReplicas)`;
  - Aurora: `storage` = `storageGb`, `io` = Σ escritas × ⌈payload/4⌉ por mês, em milhões;
  - Kinesis: `putPayloadUnits` = Σ registros × ⌈payload/25⌉ por mês, em milhões.
- **Tests**: FR-5 a FR-8.

### T5 — Verificação e README
- **Do**:
  - o custo das 10 referências pela CLI, antes e depois, registrado;
  - README: as faixas são por nó, a premissa de I/O do Aurora e a saída da EC2/ALB para a internet ainda não cobrada;
  - e2e completo.

## Implementation

**Branch**: `fix/cost-model` · **Base**: `master` · **Date**: 2026-11-15

| Task | Commit | Check | Lint / Types / Tests |
|---|---|---|---|
| T1 | `1efc8bc` | ✅ | ✅ ✅ ✅ |
| T2 | `908a9e6` | ✅ | ✅ ✅ ✅ |
| T3 | `7590893` | ✅ | ✅ ✅ ✅ |
| T4 | `217dae1` | ✅ | ✅ ✅ ✅ (741) |
| T5 | este commit | ✅ | ✅ ✅ ✅ (741) |

### Deviations
- **T2** — os testes de canvas, chat e prática passaram a chamar `cleanup()` antes de `vi.unstubAllGlobals()`. Os `afterEach` rodam em ordem inversa, e o `ResizeObserver` sumia antes da desmontagem (flake).
- **T3** — o teste de snapshot do catálogo passou a aceitar preços e faixas novos, mas segue proibindo mudar `id`, `per` ou `amountUsd` de um preço antigo. No `practice.test`, a espera pelo modo problema virou `waitFor`.
- **T4** — o preço de armazenamento do Aurora virou `clusterStorage` (um volume por cluster), separado do `storage` do RDS (um volume por instância). O motor decide pelo id do preço, sem checar o nome do serviço, porque o NFR-11 proíbe nomes de serviço AWS no código do motor.

### Definition of Done
- [x] Todo Must com teste. Os cenários da auditoria batem com a conta à mão:
  - API GW REST → Lambda → DynamoDB a 2k rps: o API GW dá $13.162,38, e o total $18.593 (antes $23.827);
  - Aurora com 1.000 escritas/s de 1 KB: $525,60 de I/O.
- [x] O custo das 10 referências foi recalculado (abaixo). Vídeo sob demanda caiu para US$ 32.347.
- [x] `pnpm lint`, `typecheck`, `test` (741) e `test:e2e` (64) verdes. O `pnpm audit` acusa 1 moderate em `minimatch` (dev, via eslint), que é herdado: aparece igual sem as mudanças do branch, e nenhuma dependência mudou.

### Verification
Custo mensal das referências pela CLI (`pnpm -s archsim simulate`), antes → depois:

| Problema | Antes | Depois | Δ |
|---|---|---|---|
| autocomplete | 1.897,96 | 1.897,96 | 0 |
| image-pipeline | 6.436,85 | 6.361,25 | −1,2% |
| leaderboard | 1.771,93 | 1.774,23 | +0,2% |
| news-feed | 3.298,42 | 3.298,42 | 0 |
| notifications | 5.844,74 | 5.844,74 | 0 |
| rate-limiter | 1.193,77 | 1.193,77 | 0 |
| realtime-chat | 4.303,42 | 4.303,42 | 0 |
| ticketing | 5.286,15 | 6.075,55 | +14,9% |
| url-shortener | 2.434,18 | 2.441,09 | +0,3% |
| video-on-demand | 63.102,96 | 32.347,36 | −48,7% |

O ticketing sobe pelo I/O do Aurora: ≈ 1.500 escritas/s dão ≈ 3,9 bilhões de I/O por mês, ou $788.

### Inherited failures
Nenhuma nos testes. O aviso do audit (`minimatch`) é anterior ao branch.

### Review fixes
A revisão independente não achou nada Critical, High ou Medium. Foram corrigidos:
- **L1:** `tieredCost(NaN)` com faixas devolvia 0 em silêncio. Agora devolve NaN, como um preço sem faixas, e o guard do `step` sinaliza.
- **L3:** o FR-3 só era testado passando `fromInternet` direto. Ganhou testes pelo `step()`: Users → S3 contra Users → Lambda → S3, e a divisão meio a meio.

Em aberto (Low):
- **L2:** o JSON Schema exportado aceita faixas malformadas. Só o zod, que o app usa ao carregar o catálogo, aplica as regras.

744 testes unitários e 64 e2e verdes.

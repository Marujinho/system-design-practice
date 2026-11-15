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

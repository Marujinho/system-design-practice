# Plan: Tipos de instância por serviço AWS

**PRD**: `docs/work/aws-instance-types-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-13

## Approach
Os tipos são só dados. O motor escolhe o handler pelo `kind` e lê `capPerUnit`, `baseLatencyMs`, `burst` e `prices` da variante (`packages/sim-engine/src/kinds/compute.ts:5-10`, `kinds/context.ts:8`). Por isso FR-1 a FR-9a não precisam de código no motor: basta acrescentar variantes ao `catalog.json`.

A regra de capacidade de cada serviço fica escrita uma vez, como uma função num teste do catálogo. O teste confere que cada variante nova bate com a regra. Os números entram no JSON calculados por essa mesma regra.

O schema ganha um campo opcional `family`. Com ele a UI agrupa o seletor sem escrever ids de tipo no código (NFR-3). Um snapshot das variantes de hoje protege FR-10.

Na UI:
- o seletor de `PropertiesPanel` passa a usar `<optgroup>` por família, e cada opção traz req/s e US$/mês;
- `toFlow` passa o `variantId` para o card do nó;
- o `ServiceNode` mostra o id do tipo quando o serviço tem mais de um.

**Alternativas descartadas**
- *Script gerador do catálogo, commitado (`scripts/gen-variants.ts`):* duas fontes da verdade (o script e o JSON) e mais código para manter. O teste da regra dá a mesma garantia com o JSON como fonte única.
- *Família derivada do prefixo do id na UI (`id.startsWith('c')`):* põe conhecimento de tipos no código da UI (viola NFR-3) e erra em ids como `cache.m7g.large`.
- *Reordenar as variantes por família:* o primeiro item é o padrão de um nó novo (`diagram-store.ts:83`, `service?.variants[0]`). Reordenar mudaria o padrão (viola FR-10). As variantes novas entram depois das atuais; a ordem de exibição vem do agrupamento.

## Decisions
| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Onde fica a família | `family?: 'burst' \| 'general' \| 'compute' \| 'memory'` no `Variant` (opcional) | Prefixo do id na UI; campo obrigatório | NFR-3; opcional não toca serviços de um tipo só | assumed |
| Ordem no JSON | As atuais primeiro, sem mexer; as novas depois | Reordenar por família | `variants[0]` é o padrão (FR-10) | assumed |
| Ordem no seletor | Por família (Burst, Uso geral, Computação, Memória) e, dentro dela, por `capPerUnit` crescente | Ordem do JSON | FR-12 pede ordem crescente; a capacidade cresce com o tamanho (FR-9) | assumed |
| Texto da opção | `{label} · {req/s} · {US$/mês}` — sem o preço quando a variante não tem preço `unit-hour` | Só o id | Mantém vCPU/GiB do rótulo; serviços cobrados por requisição (API Gateway, SQS) não têm preço mensal fixo | assumed |
| US$/mês | soma dos preços `per: 'unit-hour'` × `HOURS_PER_MONTH` (730) | Outro fator | Mesmo cálculo do motor (`findings.ts:110-112`, `queueing.ts`) | assumed |
| Regra de capacidade EC2 e EKS | t3 até medium: âncoras atuais; t3.large+: 300 req/s por vCPU; m5 e r5: 400/vCPU; c5: 500/vCPU | Proporcional a memória | m5.large = 2 vCPU × 400 = 800 (âncora); c5.xlarge = 2.000 = 10 × t3.micro | assumed |
| Regra RDS e Aurora | t4g: 300 × GiB (micro 1 GiB = 300 e small 2 GiB = 600 batem com as âncoras); m7g, r7g e r5: 1.500/vCPU (db.m7g.large e db.r5.large = 3.000) | Por vCPU nos t4g | Os t4g têm todos 2 vCPU; as âncoras crescem com a memória | assumed |
| Regra ElastiCache | t4g: micro 20.000 (âncora), small 30.000, medium 40.000; m7g e r7g: 25.000/vCPU | 10.000/vCPU | Os t4g têm todos 2 vCPU; m7g.large (2 vCPU) = 50.000 fica acima do t4g.medium | assumed |
| Regra OpenSearch | 200/vCPU em m7g, c6g e r6g; t3.small.search = 150 | c > m | As três âncoras atuais já dão 200/vCPU nas três famílias (m7g.medium 1 vCPU = 200, c6g.large 2 = 400, r6g.xlarge 4 = 800) e não podem mudar (FR-10). O critério c > m do FR-9 é testado no EC2, como o PRD escreve | assumed |
| Regra Fargate | ≥ 1 vCPU: 250/vCPU (âncoras 1 e 2 vCPU); 0,5 vCPU = 100 (âncora); 0,25 vCPU = 50 | Linear desde zero | Respeita as três âncoras | assumed |
| Latência base | A mesma que o serviço já usa para a família: EC2/EKS/Fargate 20 ms, RDS 5, Aurora 4, ElastiCache 1, OpenSearch m7g e t3 20 / c6g e r6g 15 | Variar por tamanho | Tamanho muda capacidade, não latência de serviço | assumed |
| Pesquisa de preços | Feita na T2–T4 nas páginas públicas da AWS, registrada numa tabela no plano com o link de cada número | Usar valores de memória | FR-8 exige fonte; "verify, don't assume" | assumed |
| Onde testar FR-9a | `packages/sim-engine/src/step.test.ts`, com `simulateSteady` | Teste no app | O motor é quem decide o gargalo | assumed |

## Critical files
| File | Role in this change |
|---|---|
| `packages/catalog/src/catalog.json` | Os dados — todas as variantes novas |
| `packages/catalog/src/schema.ts:92-107` | `Variant` ganha `family` opcional |
| `packages/catalog/src/catalog.test.ts:80-92` | Fonte e data dos preços; ganha a regra de capacidade, as contagens e o snapshot |
| `apps/app/src/panels/PropertiesPanel.tsx:59-75` | O seletor "Tipo" |
| `apps/app/src/canvas/ServiceNode.tsx:16-33`, `flow-model.ts:13-19` | O card do nó e os dados que ele recebe |
| `apps/app/src/store/diagram-store.ts:80-83` | `variants[0]` como padrão — a ordem do JSON importa |
| `scripts/schemas.ts`, `schemas/schemas.test.ts` | O JSON Schema exportado tem que acompanhar o zod |

## Tasks

### T1 — Campo `family` no schema e snapshot das variantes atuais
- **Covers**: FR-10, FR-12 (contrato), A06, A08
- **Files**: `packages/catalog/src/schema.ts` (edit), `packages/catalog/src/schema.test.ts` (edit), `packages/catalog/src/fixtures/variants-2026-11-13.1.json` (new), `packages/catalog/src/catalog.test.ts` (edit), `schemas/catalog.schema.json` (regenerated)
- **Mirror**: `schema.ts:97` (`capSource: z.enum([...])`) para o enum; `schema.ts:101-102` (`burst` opcional com doc) para o campo opcional; `schema.test.ts` (o helper `variant(overrides)`) para os casos
- **Do**: `export const Family = z.enum(['burst', 'general', 'compute', 'memory'])` e `family: Family.optional()` no `Variant`, com doc ("Agrupa o seletor de tipo; omitido em serviços de uma família só"). Gerar o snapshot: um script temporário (fora do repo, no scratchpad) lê o `catalog.json` atual e grava `{ [serviceId]: Variant[] }` no fixture. No `catalog.test.ts`, novo teste "keeps every variant that existed in 2026-11-13.1": para cada variante do fixture, a variante de mesmo id no catálogo, sem o campo `family`, é igual (`toEqual`); e `service.variants[0].id` é o mesmo do fixture. `pnpm schemas` para regravar `schemas/catalog.schema.json`.
- **Tests**: o schema aceita `family: 'compute'` e a ausência do campo; recusa `family: 'gpu'`; o snapshot passa sobre o catálogo atual.
- **Check**: `pnpm vitest run packages/catalog schemas` → verde; `git diff --stat schemas/` mostra só `catalog.schema.json`
- **Depends on**: —

### T2 — EC2 e EKS: tipos novos, famílias, preços pesquisados
- **Covers**: FR-1, FR-6, FR-8, FR-9, FR-11, G1, G2
- **Files**: `packages/catalog/src/catalog.json` (edit), `packages/catalog/src/catalog.test.ts` (edit), `docs/work/aws-instance-types-plan.md` (tabela de preços na seção da tarefa)
- **Mirror**: a variante `m5.large` do EC2 e a `m5.large-nodes` do EKS no `catalog.json` (forma, `prices[].id`, `label` "id (N vCPU, N GiB, …)"); `catalog.test.ts:44-48` (teste de preço por variante)
- **Do**:
  - Pesquisar o preço on-demand Linux us-east-1 dos 14 tipos novos do EC2 (FR-1) na página `https://aws.amazon.com/ec2/pricing/on-demand/`. Conferir vCPU e memória na página de tipos de instância. Registrar uma tabela id → US$/h → link no plano.
  - Acrescentar as variantes do EC2 depois de `m5.large`, com `capPerUnit` pela regra da Decisions, `capSource: "assumption"`, `baseLatencyMs: 20`, `burst` (t3 true, demais false), `family` e preço `hourly` com `priceDate: "2026-11-13"`. Pôr `family` também nas 5 variantes atuais (único campo que muda nelas, e o snapshot o ignora).
  - EKS: as 8 variantes novas de FR-6, cada uma com `clusterFee` igual ao de `m5.large-nodes` e `hourly` igual ao EC2 correspondente; capacidade pela mesma regra; `family` em todas.
  - Rótulos: "t3.large (2 vCPU, 8 GiB, baseline 30%)", "c5.xlarge (4 vCPU, 8 GiB)" e assim por diante. Nos nós do EKS: "c5.xlarge × nó (4 vCPU, 8 GiB)", espelhando o rótulo atual de `m5.large-nodes`.
- **Tests** (`catalog.test.ts`, `describe('instance types (aws-instance-types)')`): `capacityRule(serviceId, variant)` escrita no teste reproduz o `capPerUnit` de toda variante EC2/EKS; dentro de cada família, `capPerUnit` cresce com o preço; `c5.xlarge` > `m5.xlarge` ≥ `r5.xlarge` e `c5.xlarge` = 10 × `t3.micro` (FR-9); `aws.ec2` com os 19 ids exatos e `aws.eks` com os 9 (FR-1, FR-6); `hourly` de cada nó do EKS = `hourly` do EC2 de mesmo tipo e `clusterFee` igual ao atual (FR-6); todo rótulo começa pelo id e contém "vCPU" e "GiB" (FR-11); todo tipo novo tem `family`. O teste de fonte e data (`catalog.test.ts:80-92`) cobre FR-8.
- **Check**: `pnpm vitest run packages/catalog` → verde; `pnpm test` → verde (problemas e motor sem regravar nada)
- **Depends on**: T1

### T3 — RDS PostgreSQL e Aurora PostgreSQL
- **Covers**: FR-2, FR-3, FR-8, FR-9, FR-11, G1, G2
- **Files**: `packages/catalog/src/catalog.json` (edit), `packages/catalog/src/catalog.test.ts` (edit), plano (tabela de preços)
- **Mirror**: a variante `db.m7g.large` do RDS e a `db.r5.large` do Aurora; os testes do T2
- **Do**: pesquisar os preços Single-AZ on-demand de us-east-1 em `https://aws.amazon.com/rds/postgresql/pricing/` e `https://aws.amazon.com/rds/aurora/pricing/`, e registrar a tabela. Acrescentar as 9 variantes do RDS e as 8 do Aurora depois das atuais, com a regra da Decisions, as latências 5 e 4, `burst` nos t4g e `family`. Tipo inexistente em us-east-1 para o serviço sai e fica anotado como desvio (FR-8).
- **Tests**: a regra reproduz cada `capPerUnit`; monotonia por família; ids exatos (RDS 12, Aurora 9, ou menos com desvio anotado e ≥ 8); rótulos; a sugestão "trocar por db.t4g.micro" de `score.test.ts:180-193` continua passando sem mudar o teste.
- **Check**: `pnpm vitest run packages/catalog packages/sim-engine` → verde
- **Depends on**: T2

### T4 — ElastiCache Valkey, OpenSearch, Fargate e `catalogVersion`
- **Covers**: FR-4, FR-5, FR-7, FR-8, FR-9, FR-11, FR-14, G1, G2, A08
- **Files**: `packages/catalog/src/catalog.json` (edit), `packages/catalog/src/catalog.test.ts` (edit), `apps/app/src/store/defaults.ts` (sem mudança: lê `catalog.catalogVersion`), `packages/problems/src/bank.test.ts` (edit, se não houver teste de compatibilidade), plano (tabela de preços)
- **Mirror**: `cache.t4g.micro`, `m7g.medium.search` e `1vcpu-2gb` no `catalog.json`; os testes do T2
- **Do**:
  - Pesquisar os preços em `https://aws.amazon.com/elasticache/pricing/` (Valkey, nós sob demanda), `https://aws.amazon.com/opensearch-service/pricing/` e `https://aws.amazon.com/fargate/pricing/` (Linux/x86, por vCPU-h e por GB-h).
  - Fargate: o preço de cada tamanho é vCPU × preço/vCPU-h + GB × preço/GB-h, num único `hourly`, como hoje. O teste refaz a conta a partir dos dois preços unitários, que ficam como constantes no teste com o link.
  - Acrescentar as variantes com a regra e a latência da Decisions.
  - Subir `catalogVersion` para `2026-11-13.2`.
- **Tests**: regra e monotonia; ids exatos (ElastiCache 9, OpenSearch 10, Fargate 7); a conta do Fargate (FR-7); rótulos; `catalog.catalogVersion === '2026-11-13.2'`; as referências dos problemas (com `2026-11-13.1`) validam e pontuam igual. Se isso ainda não for coberto, mirror do teste de referência em `packages/problems/src/bank.test.ts`.
- **Check**: `pnpm test` → verde, sem regravar snapshot nem referência
- **Depends on**: T3

### T5 — A troca de tipo muda o gargalo (simulação)
- **Covers**: FR-9a, G1a
- **Files**: `packages/sim-engine/src/step.test.ts` (edit)
- **Mirror**: `step.test.ts:19-38` (cenário dourado com `node`, `edge` e `diagram` de `test-helpers.ts:17-40`) e `step.test.ts:51-64` (gargalo)
- **Do**: novo `it('aws-instance-types FR-9a: a bigger type clears the bottleneck at the same load')`: Usuários → EC2 (1 réplica) a 1.500 req/s, com `simulateSteady` (ou `step` repetido, como o arquivo faz). Com `t3.micro`: `bottleneckId === 'app'`, `utilization` ≈ 1500/200 e `errorRps > 0`. Com `c5.xlarge`: `utilization` ≈ 1500/2000 < 1 e `errorRps === 0`. A razão entre as utilizações é igual à razão entre as capacidades.
- **Tests**: o próprio.
- **Check**: `pnpm vitest run packages/sim-engine` → verde
- **Depends on**: T2

### T6 — Seletor agrupado por família, com req/s e US$/mês
- **Covers**: FR-12, FR-9b, NFR-2, NFR-3, A05
- **Files**: `apps/app/src/panels/PropertiesPanel.tsx` (edit), `apps/app/src/panels/variant-options.ts` (new), `apps/app/src/panels/panels.test.tsx` (edit)
- **Mirror**: `PropertiesPanel.tsx:59-75` (o `<select>` atual); `formatRps` e `formatUsd` de `apps/app/src/format.ts`; `HOURS_PER_MONTH` de `@archsim/sim-engine`; `panels.test.tsx` (render do `PropertiesPanel` com um nó selecionado)
- **Do**:
  - `variant-options.ts`: `FAMILY_LABEL: Record<Family, string>` (Burst, Uso geral, Computação, Memória — são rótulos de família, não ids de tipo).
  - `groupVariants(variants)` devolve `{ family: Family | null, label, variants }[]`, nas famílias da ordem fixa, cada grupo ordenado por `capPerUnit` crescente; variantes sem `family` caem num grupo `null`.
  - `optionText(v)` devolve `${v.label} · ${formatRps(v.capPerUnit)} · ${formatUsd(monthly)}/mês`, sem a parte do preço quando `monthly === 0`.
  - No painel: se houver mais de um grupo, `<optgroup label>` por grupo; senão, opções diretas (os serviços de hoje continuam iguais).
- **Tests**: `groupVariants` com o EC2 real dá 4 grupos na ordem e em ordem crescente; serviço sem família dá um grupo; `optionText` de `t3.micro` contém "200 req/s" e "US$ 7,59/mês" (com o `formatUsd` real); variante sem preço por hora não mostra "/mês". No painel com um EC2 selecionado: 4 `optgroup` com os rótulos, e trocar para `c5.xlarge` chama `setVariant` e a capacidade mostrada muda. Um rótulo com `<img onerror>` vira texto (A05).
- **Check**: `pnpm vitest run apps/app/src/panels` → verde; lint; types
- **Depends on**: T1 (o tipo `Family`), T2 (dados reais no teste)

### T7 — Tipo no card do nó
- **Covers**: FR-13, NFR-2, A05, A10
- **Files**: `apps/app/src/canvas/flow-model.ts` (edit), `apps/app/src/canvas/ServiceNode.tsx` (edit), `apps/app/src/canvas/canvas.css` (edit), `apps/app/src/canvas/canvas.test.tsx` (edit)
- **Mirror**: `ServiceNode.tsx:26-29` (`service-node-kind` em linha muted); `flow-model.ts:18` (`data`)
- **Do**: `ServiceNodeData` ganha `variantId: string`; `toFlow` passa `variantId: n.variantId`. No `ServiceNode`, quando `service.variants.length > 1` e o `variantId` existe no serviço, mostrar `<span className="service-node-variant num">{data.variantId}</span>` dentro de `.service-node-text`. Variante desconhecida: não mostra nada. CSS: `.service-node-variant { color: var(--text-muted); font-size: 10px; }`, igual a `.service-node-kind`.
- **Tests**: `toFlow` leva o `variantId`; o card de um EC2 `t3.micro` mostra "t3.micro"; depois de `setVariant(id, 'c5.xlarge')`, o `toFlow` seguinte e o card mostram "c5.xlarge"; o ALB não mostra tipo; um `variantId` inexistente não quebra nem mostra nada (A10). O render do `ServiceNode` usa `ReactFlowProvider`, como `viz.test.tsx:101-105`.
- **Check**: `pnpm vitest run apps/app/src/canvas` → verde; `pnpm test:e2e` → verde (o card ganhou uma linha)
- **Depends on**: T2

### T8 — e2e: trocar o tipo pelo painel
- **Covers**: FR-13, FR-9b, FR-12, NFR-1, NFR-2
- **Files**: `apps/app/e2e/instance-types.spec.ts` (new)
- **Mirror**: `apps/app/e2e/free-flow.spec.ts:36-44` (adicionar pela paleta); `free-flow.spec.ts:17-23` (selecionar um nó com `toPass`)
- **Do**: `/#/free`: adicionar Usuários e EC2 → o card mostra o tipo padrão do EC2 (`variants[0]`, lido do catálogo no teste) → selecionar o nó → o `<select>` "Tipo" tem os grupos "Computação" e "Memória" → `selectOption('c5.xlarge')` → o card mostra "c5.xlarge" e o "Custo" do painel muda → `watchConsole` vazio.
- **Tests**: o próprio spec; a suite inteira (a11y, keyboard e perf incluídos) verde.
- **Check**: `pnpm test:e2e` → verde em chromium e webkit
- **Depends on**: T6, T7

## Coverage
| PRD item | Task |
|---|---|
| FR-1 | T2 |
| FR-2, FR-3 | T3 |
| FR-4, FR-5, FR-7 | T4 |
| FR-6 | T2 |
| FR-8 | T2, T3, T4 |
| FR-9 | T2, T3, T4 |
| FR-9a, G1a | T5 |
| FR-9b | T6, T8 |
| FR-10 | T1 (snapshot), T2–T4 (rodam contra ele) |
| FR-11 | T2, T3, T4 |
| FR-12 | T1, T6, T8 |
| FR-13 | T7, T8 |
| FR-14 | T4 |
| G1, G2 | T2, T3, T4 |
| G3 | T7, T8 |
| G4 | T1, T2–T4 (`pnpm test` dos problemas sem regravar) |
| NFR-1 | T8 (`perf.spec.ts`); tamanho do `catalog.json` medido no T4 (< 60 KB a mais) |
| NFR-2 | T6, T7, T8 (`a11y.spec.ts`, `keyboard.spec.ts`) |
| NFR-3 | T1 (`family` nos dados), T6 (só rótulos de família na UI) |
| A03 | Sem dependência nova em nenhuma tarefa |
| A05 | T6, T7 |
| A06 | T1 |
| A08 | T1, T4 |
| A10 | T7 |
| A01, A02, A04, A07, A09 | N/A no PRD, com motivo |

## Risks
| Risk | Where it bites | What to do if it does |
|---|---|---|
| Página de preço da AWS carregada por JavaScript, sem o número no HTML | T2–T4 | Usar o JSON público de preços (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/{service}/current/us-east-1/index.json` ou a variante regional), citar a página humana no `sourceUrl` e anotar a origem no plano |
| Uma classe listada não existe para o serviço (ex.: Aurora `db.r5.4xlarge` aposentada) | T3 | Retirar, anotar o desvio, conferir o mínimo da G1 |
| O `findings` passa a sugerir outro tipo em algum teste | T2–T4 | Ler o caso: se a sugestão nova é a mais barata que aguenta a carga, o código está certo e o teste fixava um efeito colateral; isso é desvio a anotar, não mudança no motor |
| O card mais alto mexe em posições dos e2e | T7 | Rodar a suite; os testes usam locator, não coordenada fixa (exceto `pointOn`, que lê a posição real) |
| `pnpm schemas` regrava mais de um arquivo | T1 | Só o `catalog.schema.json` pode mudar; outro diff indica drift anterior, a ser anotado e não commitado junto |

## Verification
```
pnpm lint
pnpm typecheck
pnpm test
pnpm schemas && git diff --exit-code schemas/
pnpm test:e2e
```
Ponta a ponta: `pnpm dev` → Canvas livre → Usuários + EC2 → o card mostra o tipo → Propriedades → "Tipo" com 4 grupos e "· req/s · US$/mês" em cada opção → `c5.xlarge` → o card e o custo mudam. Com a carga em 1.500 req/s e 1 réplica, o EC2 deixa de ser gargalo ao trocar `t3.micro` por `c5.xlarge`. Abrir `/#/problems/url-shortener` → as soluções e os scores de antes iguais (a suite de problemas confirma).

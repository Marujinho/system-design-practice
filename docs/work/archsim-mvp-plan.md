# Plan: ArchSim — MVP (canvas, simulação, problemas e score)

**PRD**: `docs/work/archsim-mvp-prd.md` · **Approval**: 2026-11-13 · **Date**: 2026-11-13

## Approach

Monorepo pnpm + Turborepo com pacotes TypeScript consumidos **como código-fonte** (o `exports` de cada pacote aponta para `src/index.ts`; Vite, Vitest e `tsx` leem direto, sem etapa de build entre pacotes):

- `packages/catalog`: schema Zod do catálogo e `catalog.json`.
- `packages/sim-engine`: motor puro e determinístico. `step(state, diagram, catalog, load, dtMs) → { state, result }`; o comportamento de cada nó vem de um registro de handlers por `kind` (NFR-11), nunca do ID do serviço. O mesmo pacote calcula avaliação de requisitos, score e achados.
- `packages/problems`: schema e loader dos problemas, com YAML em modo seguro.
- `packages/cli`: `pnpm archsim …` via `tsx`, usando o mesmo motor.
- `packages/icons`: figuras isométricas.
- `apps/app`: Vite + React 19 + React Flow, com o motor rodando num Web Worker via Comlink.

**O ponto de arquitetura que decide o resto**: tudo que envolve a solução de referência roda no Node, nunca no navegador. Um plugin do Vite (`vite-plugin-practice`), ativo em `dev` e `preview`, expõe rotas locais em `/__archsim/*`:
- `GET` dos problemas, só com a parte pública (sem referência, follow-ups nem `lookFor`);
- `POST /finalize`, que roda o motor headless com o desenho e a referência, calcula score e achados, grava `practice/session.json` e `practice/history.json` de forma atômica e devolve o resultado com o custo da referência só como número;
- `GET /reference/:id`, liberado só se o histórico tiver uma finalização desse problema, e que marca `solutionSeen`.

Assim o score do app e o da CLI saem do mesmo código. A referência nunca está no bundle (A06), e todos os controles A01, A02, A05, A06 e A09 ficam num único ponto de entrada.

**Alternativas que perderam**:
- **Score no navegador, com a referência no bundle**: é mais simples, mas vaza a solução (A06/FR-44) e duplica o caminho do score entre app e CLI.
- **File System Access API para gravar `practice/`**: só funciona no Chrome (quebra NFR-10, Safari) e pede para escolher a pasta a cada sessão.
- **Servidor Node separado**: exige um segundo processo para o usuário subir e a coordenação de portas e CORS entre os dois. O plugin vive dentro do servidor que o usuário já roda.
- **Ícones como SVG estático próprio**: perde a reação ao ponteiro que FR-33 exige. Fica só como fallback do piloto (T17).
- **Fork do pacote Hairline**: as figuras internas não são API pública (`create` não é exportado), então cada atualização do pacote viraria um merge manual. O kernel da skill é o caminho que o autor documenta para figuras novas.

## Decisions

| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Onde rodam score e referência | Node, via plugin do Vite (`/__archsim/finalize`) | Navegador; servidor separado | Referência fora do bundle; app e CLI com o mesmo score; um processo só | assumed |
| Gravação de `practice/*.json` | Mesmo plugin, `POST` só de mesma origem, escrita atômica (tmp + `rename`) | File System Access API | Funciona no Safari; caminho fixo no servidor (sem path traversal) | assumed |
| Figuras dos serviços | Vendorizar o `kernel.js` da skill `hairline-create` (MIT, com aviso de licença) em `packages/icons/vendor/`; uma figura por serviço no formato da skill, com um wrapper React que monta a figura num `div`. Validação com o `look.mjs` da skill | SVG estático; fork do pacote | Única via documentada para figuras novas com a mesma linguagem e interação | assumed — **gate em T17**: se o piloto não montar como módulo ES dentro do React, ou custar > 1 dia, cai para SVG isométrico próprio + uma pequena mola por figura, com os mesmos tokens |
| Pacote `@lucasmarkes/hairline` em runtime | Não usar (as 33 figuras não representam serviços) | Usar para algum nó | Nenhuma figura existente serve; menos uma dependência | assumed |
| Pacotes internos | Consumidos como fonte TS (`exports` → `src/index.ts`) | Build com tsc/tsup por pacote | Sem etapa de build no ciclo; `tsx` roda a CLI direto | assumed |
| Execução da CLI | `pnpm archsim` → `tsx packages/cli/src/index.ts` | Build para `dist/` | O agente roda sem build; `tsx` já é dependência de dev | assumed |
| Versões | Exatas (`save-exact`), a última release com ≥ 14 dias de publicada na data do T1, conferida com `npm view <pkg> time`. Referência de hoje: react 19.3.x, @xyflow/react 12.12.x, vite 8.3.x, zod 4.6.x, zustand 5.1.x, immer 11.2.x, comlink 4.4.2, motion 14.13.x, yaml 2.9.1, vitest 5.1.x, fast-check 4.10.2, @playwright/test 1.65.x, turbo 2.11.x, eslint 10.14.x, typescript-eslint 8.72.x, prettier 3.10.x, tsx 4.23.15, react-markdown 10.1.0, @axe-core/playwright 4.14.x | Último de tudo | A03: não instalar release de dias atrás | assumed |
| TypeScript | A maior versão dentro do `peerDependencies.typescript` do typescript-eslint escolhido (conferir em T1; o TS 7.0 pode estar fora do range) | TS 7 direto | O lint não pode quebrar por versão | assumed |
| JSON Schema | `z.toJSONSchema()` nativo do Zod 4 | `zod-to-json-schema` | Uma dependência a menos | assumed |
| Markdown do enunciado | `react-markdown` sem `rehype-raw` (HTML bruto é ignorado) | Renderizar texto puro | Enunciados precisam de listas e negrito; sem HTML bruto, sem XSS | assumed |
| Rotas do app | Estado de tela simples com hash (`#/`, `#/problems`, `#/problems/:id`, `#/free`), sem router | react-router | São 4 telas; uma dependência a menos | assumed |
| Undo/redo | Pilha própria de snapshots do diagrama (≤ 100) no store | zundo | Uma dependência a menos; o diagrama é pequeno (≤ 200 nós) | assumed |
| p99 | `p99 = p50 × (1 + 5,64·ρ)` (ρ limitado a 1) | Fator constante | p99 ≈ p50 sem fila; tende a ln(100)/ln(2) ≈ 6,64 × p50, a razão p99/p50 de um tempo exponencial, quando satura. Atende FR-16 (≥ p50, cresce com ρ) | assumed |
| Latência saturada | ρ ≥ 0,95: p50 = latBase / 0,05 (20×); em serviço síncrono, o excedente vira erro, sem fila extra | Fila infinita | FR-16; mantém tudo finito (NFR-4) | assumed |
| Simulação para score | `simulateSteady(diagram, load, { ticks: 600 })` = 60 s simulados, nas cargas 1×, 1,5× e 2×. Fila "estável" = backlog não cresce nos últimos 100 ticks | Simular até convergir | Determinístico e com custo limitado | assumed |
| Calibração das referências | Cada referência atende a tudo com ρ ≤ ~0,65 no gargalo, para passar em 1,5× (exigido para score ≥ 90: 50 + 35 + 7,5) | Referência no limite | FR-60 só fecha assim; ainda "sem folga desnecessária" | assumed |
| CSP | Header estrito no `preview` (onde o e2e roda). No `dev`, o mesmo, mais `'unsafe-inline'` em `script-src`, exigido pelo preâmbulo do React Refresh. Nunca `unsafe-eval` | CSP estrita também no dev | O HMR do React não roda sem o script inline; a verificação de A02 acontece no build de produção | assumed |
| Partículas | Uma camada `<canvas>` 2D sobre o React Flow, desenhada num rAF que lê as posições das conexões do store | SVG animado por conexão | Teto de 2.000 partículas a ≥ 50 fps (NFR-2) | assumed |
| Branch | `feat/archsim-mvp` a partir de `46d3969` | — | PRD §19 | assumed |

## Critical files

Repositório greenfield: nenhum arquivo existe ainda. Estes são os que decidem se o plano funciona, e vale lê-los de novo antes de cada tarefa que dependa deles:

| File | Role in this change |
|---|---|
| `packages/sim-engine/src/step.ts` | Um tick: ordem topológica, distribuição por classe, handlers por `kind`. App, CLI e score dependem do contrato dele |
| `packages/sim-engine/src/kinds/index.ts` | Registro `kind → handler`: onde NFR-11 vale ou quebra |
| `packages/sim-engine/src/score.ts` | Score, estrelas, achados: o que o usuário e o agente veem no fim |
| `packages/catalog/src/catalog.json` | Todos os números (preço, cota, premissa) com fonte |
| `apps/app/vite-plugin-practice.ts` | A única superfície de rede: A01/A02/A05/A06/A08/A09/A10 |
| `packages/icons/src/figure.tsx` + `packages/icons/vendor/kernel.js` | Se o kernel não encaixar no React, todo o FR-33 muda de caminho (gate T17) |
| `AGENTS.md` | Tudo o que o agente do usuário sabe |

## Tasks

> Convenção de "Mirror": como o repositório não tem código, o primeiro arquivo de cada tipo é o padrão PROPOSED do PRD §11 e os seguintes copiam esse primeiro. Não há `file:line` de código existente para citar, e onde aparece "mirror Tn" a referência é o arquivo criado naquela tarefa.

### T1 — Montar o monorepo e o ferramental
- **Covers**: A03, convenções do PRD §11, base do NFR-10
- **Files**: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.nvmrc`, `.gitignore` (edit), `packages/{catalog,sim-engine,problems,cli,icons}/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}`, `apps/app/{package.json,tsconfig.json}`
- **Mirror**: nenhum (greenfield). Convenções do PRD §11.
- **Do**:
  - Criar a branch `feat/archsim-mvp`.
  - `.npmrc` com `save-exact=true` e `engine-strict=true`; `engines.node >= 22`.
  - Em `pnpm-workspace.yaml`, `onlyBuiltDependencies` com a lista mínima que o primeiro install pedir (registrar quais e por quê no commit).
  - Scripts na raiz: `build`, `dev`, `preview`, `lint`, `typecheck`, `test`, `test:bench`, `test:e2e`, `archsim`, `audit` (`pnpm audit --prod --audit-level high`), todos via turbo, exceto `archsim`.
  - `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e `moduleResolution: bundler`.
  - ESLint com typescript-eslint `strictTypeChecked` e as regras:
    - `no-eval`, `no-new-func`, `no-implied-eval`;
    - `no-restricted-syntax` contra o atributo JSX `dangerouslySetInnerHTML` e contra a atribuição a `innerHTML`/`outerHTML`;
    - `@typescript-eslint/no-explicit-any: error`;
    - em `packages/sim-engine/**`, `no-restricted-imports` de `react`, `react-dom` e `@xyflow/*` e `no-restricted-globals` de `window`, `document` e `Date`.
  - Cada pacote começa com uma função `version()` e um teste dela, para que lint, typecheck e test rodem desde o início.
- **Tests**: o teste de `version()` em cada pacote; teste de config que lê `eslint.config.js` e confirma as regras proibidas.
- **Check**: `pnpm install && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm audit` → tudo verde, 0 vulnerabilidades high/critical.
- **Depends on**: —
- **Done**: `ce5654f`
- **Deviation**: Node 24 em vez do 23 local (o @eslint/js recusa Node 23 em engines); engines = ^22.13 || >=24, .nvmrc = 24. TypeScript 6.0.3 (typescript-eslint 8.72 aceita <6.1). Testes rodam pelo vitest na raiz com projects, em vez de turbo; typecheck segue pelo turbo. pnpm audit: 1 moderada (minimatch via eslint, só dev), 0 high/critical.

### T2 — Schema do catálogo
- **Covers**: FR-4 (estrutura), FR-8 (schema), NFR-11 (`provider`/`kind`), NFR-12
- **Files**: `packages/catalog/src/schema.ts`, `packages/catalog/src/schema.test.ts`, `packages/catalog/src/index.ts`
- **Mirror**: nenhum (primeiro schema Zod; os próximos copiam este)
- **Do**:
  - `Kind` como `z.enum` com os 18 kinds do NFR-11.
  - `Limit = { id, label, value, unit, source: 'aws-quota' | 'assumption', sourceUrl? }`, com `superRefine` que exige `sourceUrl` quando `source === 'aws-quota'`.
  - `Price = { id, label, amountUsd ≥ 0, per: 'hour' | 'request' | 'million-requests' | 'gb' | 'gb-month' | 'gb-second' | 'shard-hour' | 'lcu-hour' | …, priceDate: ISO date, sourceUrl: url }`.
  - `Variant = { id, label, capPerUnit > 0, baseLatencyMs > 0, prices[], limits[] }`.
  - `Service = { id: /^[a-z]+\.[a-z0-9-]+$/, provider, kind, category, label, unitLabel, variants[] (≥ 1), defaults, errorCode, validTargets[], params[] }`, onde `params` são os campos editáveis com `min`, `max` e `step` que o painel de propriedades lê.
  - `Catalog = { catalogVersion, services[] }`. Todos os objetos com `.strict()`.
  - Exportar `parseCatalog(unknown)` e `catalogJsonSchema = z.toJSONSchema(Catalog)`.
- **Tests**: o schema aceita um serviço mínimo válido; recusa preço negativo, `capPerUnit` 0, cota sem `sourceUrl`, serviço sem `errorCode`, chave desconhecida e ID sem provider.
- **Check**: `pnpm --filter @archsim/catalog test` → verde
- **Depends on**: T1
- **Done**: `a4bbe86`
- **Deviation**: validTargets virou validTargetKinds (lista de kinds, não de IDs), para outro provedor não precisar repetir a regra. Price.per usa dimensões genéricas (unit-hour, million-requests, gb, gb-second, capacity-unit-hour), e cada handler informa o uso.

### T3 — Catálogo: os 8 serviços base
- **Covers**: FR-4 (parcial), FR-8 (dados), FR-39 (flag `burst`)
- **Files**: `packages/catalog/src/catalog.json`, `packages/catalog/src/catalog.test.ts`
- **Mirror**: `packages/catalog/src/schema.ts` (T2)
- **Do**:
  - Cadastrar `core.users` (kind `entry`), `aws.route53`, `aws.cloudfront`, `aws.alb`, `aws.ec2` (t3.nano a m5.large com os req/s da origem como `assumption` e `burst: true` nas T), `aws.lambda`, `aws.rds-postgres` e `aws.elasticache-valkey`.
  - Preços e cotas como estão no PRD de origem, com `priceDate` 2026-11-13 e o link de fonte de cada linha da tabela de origem.
  - Premissas que a origem não dá, todas como `assumption`, com a justificativa em `label`:
    - latência base: ALB 5 ms, EC2 20 ms, RDS 5 ms, ElastiCache 1 ms, CloudFront 10 ms;
    - capacidade: RDS por tamanho (t4g.micro 300 q/s, t4g.small 600, m7g.large 3.000), ElastiCache t4g.micro 20.000 ops/s.
- **Tests**:
  - `parseCatalog(catalog.json)` passa.
  - 8 entradas.
  - t3.micro 0,0104 × 730 = 7,592.
  - ALB 0,0225 × 730 = 16,425.
  - Lambda 0,20/milhão e 0,0000166667/GB-s.
  - Toda cota tem `sourceUrl`.
- **Check**: `pnpm --filter @archsim/catalog test` → verde
- **Depends on**: T2
- **Done**: `0d08c9f`
- **Deviation**: Os preços e as cotas vêm do documento de origem (conferidos pelo autor em 2026-11-13); o sourceUrl aponta para a página oficial de preços/cotas da AWS de cada serviço, que não reli nesta execução. Adicionei a unidade de preço unit-month (zona do Route 53). Novas premissas: queryShare 1% no Route 53 (cache de DNS), newConnectionShare 10% no ALB (keep-alive), capacidade de 250.000 req/s por distribuição CloudFront como cota.

### T4 — Schema do diagrama e parse seguro
- **Covers**: FR-9 (classes), FR-34/FR-35 (núcleo), NFR-3, A05 (limite de rótulo), A06, A08
- **Files**: `packages/sim-engine/src/diagram.ts`, `packages/sim-engine/src/diagram.test.ts`, `packages/sim-engine/fixtures/diagrams/*.json`
- **Mirror**: `packages/catalog/src/schema.ts` (T2)
- **Do**:
  - `RequestClass = { name, mode: 'users' | 'rps' | 'rpm', users?, reqPerUserPerMin?, rps?, payloadKB, cacheable }`.
  - `Load = { classes[1..8] }`, com o total ≤ 10.000.000 req/min.
  - `Node = { id, serviceId, variantId, position, label ≤ 80, props, overrides }`.
  - `Edge = { id, source, target, protocol, weight?: 0..1, classes?: string[] }`.
  - `Diagram = { schemaVersion: 1, catalogVersion, nodes ≤ 200, edges ≤ 400, load }`, `.strict()`.
  - `parseDiagram(text: string, catalog)`:
    - recusa > 5 MB antes do `JSON.parse`;
    - usa um `JSON.parse` com reviver que descarta `__proto__`, `constructor` e `prototype`;
    - valida com Zod e confere cada `serviceId`/`variantId` no catálogo;
    - devolve `{ ok: true, diagram } | { ok: false, code, message }` com mensagem em pt-BR por motivo.
  - `rpsOf(class)` converte usuários × req/min, req/min e req/s.
- **Tests**:
  - Round-trip `parse(stringify(d))` igual.
  - `rpsOf`: 100.000 × 10 / 60 = 16.666,7; 1.000.000 req/min = 16.666,7.
  - Limites exatos e acima: 200/201 nós, 400/401 conexões, 8/9 classes, 5 MB / 5 MB + 1, 10M / 10M + 1 req/min, rótulo 80/81.
  - Recusas, cada uma com o código certo: JSON quebrado, `schemaVersion: 2`, serviço inexistente.
  - `"__proto__": {"polluted": true}` não altera `Object.prototype`.
- **Check**: `pnpm --filter @archsim/sim-engine test diagram` → verde
- **Depends on**: T3

### T5 — Motor: grafo, ciclos e distribuição por classe
- **Covers**: FR-10 (ordem), FR-11, FR-12, FR-37, A06 (ciclo não trava)
- **Files**: `packages/sim-engine/src/graph.ts`, `packages/sim-engine/src/graph.test.ts`
- **Mirror**: `packages/sim-engine/src/diagram.ts` (T4): retorno `{ ok }`/avisos estruturados, sem exceções
- **Do**:
  - `analyze(diagram)`: SCC de Tarjan iterativo, sem recursão, para não estourar a pilha com 200 nós. Nós em SCC de tamanho > 1 (ou com laço) vão para `cyclic` com o aviso `CYCLE_UNSUPPORTED`; o resto entra em ordem topológica de Kahn.
  - `distribute(nodeOut: ClassRates, outEdges)`:
    - filtra as conexões por `classes`;
    - para cada classe, normaliza os pesos das conexões elegíveis: soma ≠ 1 gera `WEIGHTS_NORMALIZED`, e as conexões sem peso dividem o restante igualmente (ou tudo, se nenhuma tiver peso);
    - devolve `Map<edgeId, ClassRates>`.
  - `ClassRates = Record<className, number>`.
- **Tests**:
  - 80/20 → 800/200.
  - 60/60 → 50/50 + aviso.
  - 3 sem peso → 1/3 cada.
  - Leitura vai só ao cache e escrita só ao RDS.
  - Ciclo ALB → EC2 → ALB detectado.
  - Ciclo com fila no meio detectado.
  - Grafo de 200 nós em anel termina em < 100 ms.
  - Nó isolado e grafo desconexo.
- **Check**: `pnpm --filter @archsim/sim-engine test graph` → verde
- **Depends on**: T4

### T6 — Motor: handlers dos kinds base
- **Covers**: FR-13, FR-14, FR-15, FR-16, FR-17, FR-28 (parte por nó), NFR-11
- **Files**: `packages/sim-engine/src/kinds/{index,types,entry,dns,cdn,load-balancer,compute,function,sql-database,cache}.ts`, `packages/sim-engine/src/queueing.ts`, testes `*.test.ts` ao lado
- **Mirror**: `packages/sim-engine/src/graph.ts` (T5)
- **Do**:
  - `KindHandler = { capacity(params, variant, overrides) → number, process(input: ClassRates, ctx) → { processed: ClassRates, errors: ClassRates, utilization, p50, p99, costMonth, nextState } }`. O registro `kinds/index.ts` é um `Record<Kind, KindHandler>` total, e o compilador acusa um kind sem handler.
  - Em `queueing.ts`:
    - `latency(latBase, ρ)` com o p50 de FR-16 e o p99 de Decisions;
    - `saturate(input, capacity)`: corta proporcionalmente entre as classes quando ρ > 1;
    - `monthlyCost(prices, units, rps, gbPerSec)` com 730 h e 2.628.000 s.
  - Os kinds:
    - `cdn`/`cache`: hit ratio só nas classes `cacheable`;
    - `function`: concorrência = rps × duração, cota 1.000, excedente 429;
    - `compute`: `capPerUnit × réplicas`;
    - `entry`: emite a carga.
  - Nenhum handler lê `serviceId`.
- **Tests** (golden, com o cálculo escrito no teste):
  - FR-13: 10.000 leituras + 100 escritas, 90% de hit → 1.000 + 100.
  - FR-14: t3.micro ×2 = 400; Lambda 0,5 s → 2.000.
  - FR-15: 1,5k a 1 s → 1.000 ok + 500 × 429.
  - FR-16: 40 / 333,3 / 400 ms; p99 ≥ p50 em ρ ∈ {0; 0,5; 0,94; 0,96; 2; 1e6}.
  - FR-17: 16.666,7 → 400 ok, 16.266,7 de erro.
  - FR-28: Lambda 100 req/s → 52,56.
- **Check**: `pnpm --filter @archsim/sim-engine test kinds` → verde
- **Depends on**: T5

### T7 — Motor: `step`, métricas globais e estados
- **Covers**: FR-10, FR-26, FR-27, FR-28, FR-30 (cálculo do estado), NFR-1, NFR-4, NFR-9, NFR-11
- **Files**: `packages/sim-engine/src/step.ts`, `packages/sim-engine/src/state.ts`, `packages/sim-engine/src/simulate.ts`, `packages/sim-engine/src/step.test.ts`, `packages/sim-engine/src/properties.test.ts`, `packages/sim-engine/src/step.bench.ts`, `packages/sim-engine/fixtures/catalog-gcp.json`
- **Mirror**: `packages/sim-engine/src/kinds/compute.ts` (T6)
- **Do**:
  - `step(state, diagram, catalog, dtMs)`: percorre a ordem topológica acumulando a entrada de cada nó, chama o handler, distribui a saída.
  - Globais:
    - p50/p99 ponta a ponta por classe = programação dinâmica do caminho de maior p50 com tráfego > 0, parando em nós `queue` e `stream`;
    - taxa de erro = erros / entrada total;
    - custo = soma dos nós;
    - gargalo = maior ρ; no empate, a menor profundidade a partir da entrada.
  - `nodeState(ρ, backlogTrend)` com as fronteiras de FR-30 (`>= 0.7`, `>= 0.9`, `> 1`); backlog subindo por 3 ticks também conta como gargalo.
  - Em todo valor de saída, `finite(x)` troca NaN/±Infinity por 0 e emite o aviso `NUMERIC_GUARD`, que aparece em teste.
  - `simulateSteady(diagram, catalog, { ticks, loadMultiplier })` para CLI e score.
- **Tests**:
  - Golden FR-17/FR-26: 4.167%, erro 97,6%, US$ 15,18.
  - FR-27: gargalo e empate.
  - FR-28: ALB + 2 t3.micro = 31,61.
  - FR-30: fronteiras 0,69 / 0,70 / 0,90 / 1,00 / 1,01.
  - Sem Usuários → tudo 0.
  - NFR-4: fast-check com grafos aleatórios até 200 nós → métricas finitas e ≥ 0.
  - NFR-9: duas execuções de 100 ticks iguais.
  - NFR-11: o fixture `gcp.cloud-run` (`kind: compute`) simula; um teste que varre `src/` não encontra a string `aws.`.
  - NFR-1: bench com 50 nós e 60 conexões, p95 ≤ 10 ms.
- **Check**: `pnpm --filter @archsim/sim-engine test && pnpm --filter @archsim/sim-engine test:bench` → verde, p95 registrado no commit
- **Depends on**: T6

### T8 — Catálogo: os outros 14 serviços
- **Covers**: FR-4 (completo), FR-8
- **Files**: `packages/catalog/src/catalog.json`, `packages/catalog/src/catalog.test.ts`
- **Mirror**: as entradas de T3 em `catalog.json`
- **Do**:
  - Cadastrar API Gateway (variantes REST/HTTP/WebSocket), NLB, NAT Gateway, WAF, Fargate, EKS, S3, DynamoDB (on-demand/provisionado), Aurora PostgreSQL, SQS (Standard/FIFO), SNS, Kinesis, EventBridge, OpenSearch e CloudWatch.
  - 11 deles têm preço e cota na origem.
  - WAF, EventBridge, OpenSearch, CloudWatch e as cotas do API Gateway WebSocket: pesquisar nas páginas oficiais da AWS na implementação, registrar `sourceUrl` e `priceDate`, e marcar cada número sem página oficial como `assumption`.
  - Premissas de capacidade (Fargate por task, OpenSearch por nó, latências) como `assumption`.
- **Tests**:
  - 23 entradas.
  - Os valores da origem batem: SQS 0,40/milhão, Kinesis 0,015/shard-h, S3 3.500/5.500 por prefixo, DynamoDB 3.000 RCU / 1.000 WCU por partição, API Gateway 10.000 + 5.000.
  - Toda cota tem fonte.
- **Check**: `pnpm --filter @archsim/catalog test` → verde
- **Depends on**: T3

### T9 — Motor: filas, fan-out e streams
- **Covers**: FR-18, FR-19, FR-20, A10 (fila sem consumidor)
- **Files**: `packages/sim-engine/src/kinds/{queue,pubsub,stream}.ts` + testes
- **Mirror**: `packages/sim-engine/src/kinds/compute.ts` (T6)
- **Do**:
  - `queue`:
    - `nextState.backlog = max(0, backlog + (in − drained) × dt)`, com `drained = min(backlog/dt + in, Σ capacity(consumidores))`; a capacidade dos consumidores vem dos handlers deles, via `ctx.downstreamCapacity`;
    - idade = backlog / drained (0 se drained = 0 e backlog = 0; se drained = 0 e backlog > 0, idade = tempo simulado acumulado, com aviso `QUEUE_NO_CONSUMER`);
    - FIFO: cota de 300/s (3.000 com `batch: 10`), excedente vira erro.
  - `pubsub`: cada conexão de saída recebe tudo; custo = publicações + entregas.
  - `stream`: por shard, `min(1.000 rec/s, 1 MB/s ÷ payloadKB)`; excedente vira throttling.
- **Tests**:
  - FR-18: 1.000 in / 600 out, 10 s (100 ticks) → backlog 4.000, idade ≈ 6,67 s; FIFO 500 → 200 erros.
  - FR-19: 100 × 3 → 100 cada, custo de 100 + 300.
  - FR-20: 3.000 × 1 KB → 1.000 throttled; 1.500 × 2 KB → 500 throttled.
  - Fila sem consumidor → backlog cresce, sem NaN.
- **Check**: `pnpm --filter @archsim/sim-engine test kinds` → verde
- **Depends on**: T7, T8

### T10 — Motor: S3, DynamoDB, Aurora, API Gateway, WAF, NAT, CloudWatch, EKS
- **Covers**: FR-21, FR-22, FR-23, FR-24, FR-25
- **Files**: `packages/sim-engine/src/kinds/{object-storage,kv-database,api-gateway,waf,nat,observability}.ts`, `packages/sim-engine/src/kinds/sql-database.ts` (edit: réplicas de leitura) + testes
- **Mirror**: `packages/sim-engine/src/kinds/queue.ts` (T9)
- **Do**:
  - `object-storage`: GET e PUT por prefixo × prefixos (classe `write` = PUT, as outras = GET); excedente 503.
  - `kv-database`: a WCU/RCU provisionada limita a tabela; a partição quente (`hotKeyShare × rps`) é limitada a 1.000 WCU / 3.000 RCU, com unidades por KB do payload.
  - `sql-database`: com `readReplicas > 0`, as leituras vão para as réplicas (dividindo igualmente) e as escritas para o writer.
  - `api-gateway`: teto de cota em regime; WebSocket por conexões e mensagens.
  - `waf`: repassa `1 − blockedShare`.
  - `nat`: custo por GB = rps × payloadKB.
  - `observability`: fica fora do caminho e só soma custo; o `analyze` de T5 ignora conexões de/para ele no fluxo.
  - `compute` com `clusterFeeHour` para o EKS.
- **Tests**:
  - FR-21: 6.000 GET em 1 prefixo → 500 × 503; em 2 → 0.
  - FR-22: 1.500 escritas em 1.000 WCU → 500; 40% de 5.000 → 1.000.
  - FR-23: 1.500 por réplica, 200 no writer.
  - FR-24: 12.000 → 2.000 × 429.
  - FR-25: WAF 900; NAT 100 × 100 KB → 10 MB/s, custo coerente.
- **Check**: `pnpm --filter @archsim/sim-engine test` → verde
- **Depends on**: T9

### T11 — Motor: requisitos, score e achados
- **Covers**: FR-42 (métricas avaliáveis), FR-55, FR-56, FR-57, NFR-9 (score)
- **Files**: `packages/sim-engine/src/requirements.ts`, `packages/sim-engine/src/score.ts`, `packages/sim-engine/src/findings.ts` + testes, `packages/sim-engine/fixtures/findings/*.json`
- **Mirror**: `packages/sim-engine/src/simulate.ts` (T7)
- **Do**:
  - `Requirement = { id, metric: 'throughput' | 'p99' | 'errorRate' | 'costMonth' | 'queueAge' | 'queueStable', class?, op: '<=' | '>=', value, unit }`; `evaluate(result, reqs)` devolve `{ id, measured, target, pass }`.
  - `score({ diagram, reference, problem, catalog })`:
    - simula 1×, 1,5× e 2× (`simulateSteady`, 600 ticks) e simula a referência em 1×;
    - aplica a fórmula de FR-55 (com `problem.scoring` sobrescrevendo os pesos) e arredonda meio para cima;
    - estrelas em 50 / 75 / 90;
    - `belowReference = todos passam && userCost < referenceCost`.
  - `findings`, ordenados por impacto (gargalo e requisito falhando por grau de falha; superdimensionado por economia):
    - gargalo;
    - requisito falhou, com o nó que mais contribui (maior p50 no caminho, para p99; nó com mais erro, para errorRate);
    - superdimensionado: ρ < 0,25 e ≥ 5% do custo; economia = custo − custo com unidades = ceil(unidades × ρ / 0,7);
    - sem tráfego;
    - conexão inválida;
    - quebra com mais carga: primeiro nó com ρ > 1 em 1,5× ou 2×.
- **Tests**:
  - FR-55: 3/4 → 30; 92,5 → 93; 67,5 → 68; mais barato → 35 de custo; pesos sobrescritos.
  - FR-56: fronteiras 49/50, 74/75, 89/90; selo com 10% abaixo.
  - FR-57: um fixture por tipo de achado; m5.large ×10 com ρ 0,1 → superdimensionado com a economia calculada.
  - Determinismo: o mesmo score duas vezes.
- **Check**: `pnpm --filter @archsim/sim-engine test score findings requirements` → verde
- **Depends on**: T10

### T12 — Schema e loader de problemas; JSON Schemas exportados
- **Covers**: FR-41, FR-42 (schema), FR-49 (schema), NFR-12, A05 (YAML seguro), A08
- **Files**: `packages/problems/src/{schema,load,public}.ts` + testes, `scripts/export-schemas.ts`, `schemas/{catalog,diagram,problem,session,history,cli-output}.schema.json`, `schemas/schemas.test.ts`
- **Mirror**: `packages/catalog/src/schema.ts` (T2)
- **Do**:
  - `Problem = { id, title, difficulty: 'facil' | 'medio' | 'dificil', statement, functional[], quantitative: Requirement[], load: Load, qualitative[], followups[≥ 6], scoring? }`.
  - `Followup = { id: '<problema>.<slug>', question, when?, loadMultiplier?: 1..1000, lookFor[≥ 1], topic?: 'qualitative' }`.
  - `When = { hasService?: string[], missingService?: string[], metric?: { path, op, value }, requirementFails?: string }`.
  - `superRefine` com as contagens mínimas de FR-49 (≥ 1 com `metric` ou `requirementFails`, ≥ 1 com `loadMultiplier`, ≥ 1 `qualitative`).
  - `loadProblem(dir)`: `yaml.parse(text, { schema: 'core', customTags: [] })` (tag desconhecida gera erro), mais `parseDiagram` da referência e da ingênua.
  - `toPublic(problem)` remove `followups`, `scoring` e qualquer caminho de referência.
  - Schemas de sessão e histórico (definidos aqui, usados em T24).
  - `scripts/export-schemas.ts` grava `schemas/*.json` com `z.toJSONSchema`; o teste regera em memória e compara (sem drift).
- **Tests**:
  - Um problema mínimo válido passa.
  - Faltar cada contagem de FR-49 recusa.
  - Métrica fora da lista recusa.
  - YAML com `!!js/function` recusa.
  - `toPublic` não contém `followups` nem `lookFor` (o teste procura as strings).
  - Os schemas exportados são iguais aos gerados.
- **Check**: `pnpm --filter @archsim/problems test && pnpm test schemas` → verde
- **Depends on**: T11

### T13 — Problemas 1–5: encurtador, rate limiter, leaderboard, autocomplete, ingressos
- **Covers**: FR-40 (parcial), FR-49, FR-60, G1, G2, G7
- **Files**: `problems/{url-shortener,rate-limiter,leaderboard,autocomplete,ticketing}/{problem.yaml,reference.archsim.json}`, `problems/_fixtures/naive.archsim.json`, `problems/_fixtures/when/<followup-id>.{match,nomatch}.archsim.json`, `packages/problems/src/bank.test.ts`
- **Mirror**: o schema de T12; o enunciado e os números do encurtador vêm do PRD de origem ("10 mil leituras/s, 100 escritas/s, p99 < 50 ms")
- **Do**:
  - Para cada problema:
    - enunciado em pt-BR no tom de um teste técnico;
    - requisitos quantitativos com orçamento;
    - carga por classe;
    - tópicos qualitativos (no de ingressos, venda dupla e idempotência; no rate limiter, consistência entre nós);
    - ≥ 6 follow-ups com `lookFor`;
    - uma referência barata calibrada por Decisions: ρ ≤ ~0,65 no gargalo, passa em 1,5×.
  - A carga do pico de ingressos (1M usuários em 5 min) é constante na taxa de pico.
  - A solução ingênua é um fixture único (Usuários → EC2 t3.micro → RDS db.t4g.micro), aplicado à carga de cada problema.
  - Cada `when` tem um fixture que bate e um que não bate.
- **Tests** (`bank.test.ts`, parametrizado por diretório):
  - O schema passa.
  - Solvable: a referência atende a todos os requisitos.
  - G7: referência ≥ 90 e ingênua < 50.
  - A referência só usa serviços do catálogo.
  - Cada `when` avalia certo nos dois fixtures.
- **Check**: `pnpm --filter @archsim/problems test bank` → 5 problemas verdes
- **Depends on**: T12

### T14 — Problemas 6–10: feed, chat, imagens, notificações, vídeo
- **Covers**: FR-40 (completo), FR-49, FR-60, G1, G2, G7
- **Files**: `problems/{news-feed,realtime-chat,image-pipeline,notifications,video-on-demand}/{problem.yaml,reference.archsim.json}` + fixtures `when`
- **Mirror**: `problems/url-shortener/problem.yaml` (T13)
- **Do**:
  - Igual a T13.
  - Feed: fan-out na escrita × na leitura e o usuário celebridade (`hotKeyShare` no DynamoDB).
  - Chat: API Gateway WebSocket e presença como tópico qualitativo.
  - Imagens: S3 → SQS → workers, com `queueAge`.
  - Notificações: SNS/EventBridge → SQS.
  - Vídeo: S3 + CloudFront com hit alto e payload grande.
- **Tests**: o mesmo `bank.test.ts` passa a cobrir 10 diretórios; um teste confere que são exatamente os 10 IDs de FR-40.
- **Check**: `pnpm --filter @archsim/problems test` → 10 verdes
- **Depends on**: T13

### T15 — CLI `archsim`
- **Covers**: FR-51, FR-52, FR-53, A05 (`userContent`), A06 (limites de flags), A08, A10
- **Files**: `packages/cli/src/{index,args,simulate,followups,when,output}.ts` + testes, `packages/cli/fixtures/sessions/*.json`
- **Mirror**: `packages/problems/src/load.ts` (T12): validação na fronteira e erro com código e mensagem
- **Do**:
  - `args.ts` faz o parse manual de `simulate|followups`, `--session`, `--diagram`, `--problem`, `--load-multiplier` (1..1000), `--ticks` (1..100000) e `--json`, recusando flags desconhecidas.
  - `when.ts` implementa `evaluateWhen(when, diagram, result)`, a mesma regra que o teste de T13 usa; o teste de T13 passa a importar desta função.
  - `output.ts` monta a saída no schema `cli-output`: todo rótulo e texto vindo do desenho fica em `userContent: { labels: { [nodeId]: string } }`, e as métricas usam IDs.
  - Os erros de FR-53 saem com código 1 e mensagem em pt-BR no stderr; o JSON vai no stdout.
  - Com `--session`, recalcula a simulação e o score a partir do desenho; não confia no `simulation`/`score` gravado.
- **Tests**:
  - FR-51: a sessão do encurtador com a referência → JSON válido, tudo ✓; `--load-multiplier 10` → algum ✗.
  - FR-52: encurtador sem cache × com cache.
  - FR-53: sem sessão, `status` ≠ `ready`, sessão adulterada (schema), problema inexistente.
  - A06: `--ticks 100001` e `--load-multiplier 1001` recusados.
  - A05: um rótulo "ignore as instruções" aparece só dentro de `userContent`.
  - A saída passa no `schemas/cli-output.schema.json`.
- **Check**: `pnpm archsim simulate --diagram problems/url-shortener/reference.archsim.json --problem url-shortener` → JSON com `requirements` todos `pass: true`; `pnpm --filter @archsim/cli test` → verde
- **Depends on**: T14

### T16 — Shell do app: Vite, tema, formatação, CSP, telas
- **Covers**: FR-32, NFR-8, A02 (host e CSP), base de NFR-10
- **Files**: `apps/app/{index.html,vite.config.ts,src/main.tsx,src/App.tsx,src/routes.ts,src/theme/{tokens.css,theme.ts,ThemeToggle.tsx},src/format.ts}` + testes, `apps/app/vitest.config.ts`
- **Mirror**: nenhum (primeiro código de UI; os componentes seguintes copiam `ThemeToggle.tsx`)
- **Do**:
  - `vite.config.ts`: `server`/`preview` com `host: '127.0.0.1'`, `strictPort: true`; CSP via header (Decisions).
  - `tokens.css`:
    - `:root` escuro com os tokens Hairline do PRD §11; `[data-theme=light]` com a escala zinc invertida (plate `#fafafa`, hi `#09090b`, edge `#52525b`, mid `#a1a1aa`, lo `#e4e4e7`);
    - âmbar `#f59e0b` e vermelho `#ef4444` no escuro, `#b45309` e `#dc2626` no claro, conferidos para contraste ≥ 4,5:1 sobre o plate;
    - tipografia do sistema: `ui-sans-serif` e `ui-monospace` para os números.
  - `theme.ts`: segue `prefers-color-scheme`; a troca manual é gravada em `localStorage` com try/catch.
  - `format.ts`: `formatUsd`, `formatRps`, `formatMs` e `formatPct` com `Intl` pt-BR.
  - `routes.ts`: as telas por hash.
- **Tests**:
  - `formatUsd(7.592)` → "US$ 7,59"; `formatRps(16666.7)` → "16.667 req/s".
  - Tema: o sistema escuro abre escuro; a troca persiste; `localStorage` que lança não quebra.
  - Teste de config: `server.host` e `preview.host` são `127.0.0.1`.
  - O CSP do preview não tem `unsafe-eval` nem `unsafe-inline`.
- **Check**: `pnpm --filter @archsim/app test && pnpm --filter @archsim/app build && pnpm --filter @archsim/app preview` → abre em `http://127.0.0.1:4173`
- **Depends on**: T1

### T17 — Ícones: figura piloto e wrapper (gate)
- **Covers**: FR-33 (padrão), FR-31 (figuras paradas), A03 (licença)
- **Files**: `packages/icons/vendor/kernel.js`, `packages/icons/vendor/LICENSE-hairline`, `packages/icons/figures/aws.ec2.js`, `packages/icons/src/{figure.tsx,registry.ts,index.ts}`, `packages/icons/src/figure.test.tsx`
- **Mirror**: `skills/hairline-create/examples/riffle.js` do repositório Hairline (itens discretos), lido na implementação
- **Do**:
  - Copiar o `kernel.js` da skill (MIT) com o aviso de licença.
  - Escrever a figura do EC2 (um rack com instâncias) pelos passos da skill.
  - Rodar o `look.mjs` da skill até ele passar.
  - `figure.tsx`:
    - `<ServiceFigure serviceId label size />` monta a figura num `div` com o `mount({ stage, svg, read })` do kernel;
    - repassa os tokens via CSS vars herdadas;
    - com `prefers-reduced-motion`, não liga o tick;
    - `destroy` no unmount.
  - `registry.ts` mapeia `serviceId → figura`.
  - **Gate**: se o kernel exigir o global `HL` de um jeito que não isole por instância, ou se isso não fechar em 1 dia, troca para SVG isométrico próprio com mola simples. Atualizar esta tarefa e as T26a–c antes de seguir, e avisar o usuário.
- **Tests**:
  - Monta e desmonta sem vazar listeners (contagem de `addEventListener`/`removeEventListener`).
  - Com reduced motion, não registra tick.
  - Usa só `var(--hairline-*)` nos atributos de traço.
  - 50 instâncias montadas sem erro.
- **Check**: `pnpm --filter @archsim/icons test` → verde; o `look.mjs` da skill sai com 0
- **Depends on**: T16

### T18 — Store do diagrama: undo/redo e autosave
- **Covers**: FR-2, FR-36, A08 (autosave validado), A10
- **Files**: `apps/app/src/store/{diagram-store.ts,history.ts,autosave.ts}` + testes
- **Mirror**: `apps/app/src/theme/theme.ts` (T16): acesso a `localStorage` com try/catch
- **Do**:
  - Zustand + Immer. Estado `{ mode: 'free' | { problemId }, diagram, selection, overrides }`.
  - Ações: `addNode`, `moveNodes`, `removeSelection`, `connect`, `setEdge`, `setProps`, `setOverride`, `resetOverride`, `setLoad` (bloqueada no modo problema) e `replaceDiagram`.
  - `history.ts`: a pilha de snapshots (≤ 100) registra todas as ações, menos seleção e o movimento contínuo (o arrasto inteiro é um passo).
  - `autosave.ts`: grava debounced a 500 ms por chave (`archsim:free`, `archsim:problem:<id>`) e lê com `parseDiagram`; se o conteúdo for inválido ou o armazenamento lançar, cai para o diagrama vazio.
  - Limites de NFR-3 em `addNode`/`connect`, com mensagem.
- **Tests**:
  - Apagar e desfazer → volta igual (comparação profunda); refazer.
  - 101 ações → só as 100 últimas.
  - Recarregar → restaura.
  - Autosave corrompido → vazio.
  - `localStorage` lançando → vazio, sem exceção.
  - 201º nó recusado.
  - Carga travada no modo problema.
- **Check**: `pnpm --filter @archsim/app test store` → verde
- **Depends on**: T4, T16

### T19 — Canvas, paleta e conexões
- **Covers**: FR-1, FR-3, FR-5, FR-6, NFR-3 (UI), NFR-7 (paleta)
- **Files**: `apps/app/src/canvas/{Canvas.tsx,ServiceNode.tsx,FlowEdge.tsx,Palette.tsx,connection-rules.ts}` + testes
- **Mirror**: `apps/app/src/theme/ThemeToggle.tsx` (T16) para componentes; `packages/sim-engine/src/graph.ts` (T5) para a lógica pura em `connection-rules.ts`
- **Do**:
  - `ReactFlow` controlado pelo store, com `ServiceNode` (figura + rótulo + métricas) e `FlowEdge`.
  - Seleção múltipla com shift e arrasto; Delete/Backspace apaga; Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z.
  - `Palette`: agrupada por `category`, com busca por `label` (sem diferenciar acento nem maiúscula), arrastar com `dataTransfer` e Enter no item focado adicionando no centro da viewport.
  - `connection-rules.ts`: `defaultProtocol(sourceKind, targetKind)` e `isValidTarget(source, target)` pelo `validTargets` do catálogo. Uma conexão inválida é criada com `warning`; a `FlowEdge` mostra o ícone com o motivo no `title`.
- **Tests**:
  - Apagar 2 de 3 nós.
  - Busca "lam" → só Lambda; "sq" → SQS.
  - Soltar cria o nó no ponto.
  - Enter adiciona.
  - Protocolos: ALB → EC2 = HTTP, EC2 → RDS = TCP, SNS → SQS = pub/sub.
  - S3 → RDS mostra aviso e não bloqueia.
- **Check**: `pnpm --filter @archsim/app test canvas` → verde
- **Depends on**: T17, T18

### T20 — Painel de propriedades
- **Covers**: FR-7, FR-8 (UI), FR-39
- **Files**: `apps/app/src/panels/{PropertiesPanel.tsx,ParamField.tsx,LimitRow.tsx}` + testes
- **Mirror**: `apps/app/src/canvas/Palette.tsx` (T19)
- **Do**:
  - O painel é gerado a partir de `service.params` do catálogo; nenhum `if` por serviço.
  - `ParamField` respeita `min`/`max`/`step`, recusa valor fora do intervalo e mostra o intervalo.
  - `LimitRow` mostra o valor, o selo "cota AWS" (com link `sourceUrl`, `rel="noreferrer noopener"`) ou "premissa", e "valor alterado" com o botão "restaurar padrão".
  - Capacidade e custo do nó vêm do último resultado do worker (T21) ou, sem resultado, de `handler.capacity` e do custo com 0 req/s.
  - A nota de burst aparece quando a variante tem `burst: true`.
- **Tests**:
  - t3.small ×3 → 900 req/s e US$ 45,55.
  - Kinesis com 4 shards → 4.000.
  - Mudar 200 → 150 mostra "valor alterado"; restaurar volta.
  - O selo da Lambda é "cota AWS" com link.
  - Réplicas 0 recusado.
  - Nota de burst no t3.
- **Check**: `pnpm --filter @archsim/app test panels` → verde
- **Depends on**: T19, T8

### T21 — Carga, worker e ciclo de simulação
- **Covers**: FR-9 (UI), FR-10 (thread separada), FR-38, NFR-5, A10
- **Files**: `apps/app/src/sim/{sim.worker.ts,sim-client.ts,useSimulation.ts}`, `apps/app/src/panels/LoadPanel.tsx` + testes
- **Mirror**: `packages/sim-engine/src/simulate.ts` (T7) para a chamada; `apps/app/src/panels/PropertiesPanel.tsx` (T20) para o painel
- **Do**:
  - O worker expõe via Comlink `setDiagram(d)`, `start()`, `pause()` e `onResult(cb)`, com `step` a cada 100 ms medido por `performance.now()` e passando `dtMs` real.
  - `sim-client.ts` cria o worker com `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })`. `onerror`/`onmessageerror` colocam a simulação em estado de erro, e o banner tem o botão "reiniciar", que recria o worker e reenvia o diagrama do store.
  - Um gancho de teste `__archsimForceWorkerError` existe só em `import.meta.env.MODE === 'test'`.
  - `LoadPanel`: classes de requisição, slider logarítmico (0 a 10M req/min) mais campo numérico, travado no modo problema.
- **Tests**:
  - 100.000 × 10 → 16.666,7.
  - > 10M recusado.
  - Pausar congela o resultado; retomar volta.
  - Um erro forçado mostra o banner, e "reiniciar" volta a emitir resultados com o diagrama intacto.
  - Painel travado no modo problema.
- **Check**: `pnpm --filter @archsim/app test sim` → verde
- **Depends on**: T20, T10

### T22 — Visualização: estados, barra global, partículas, movimento reduzido
- **Covers**: FR-26, FR-27 (UI), FR-29, FR-30, FR-31, NFR-2, NFR-6
- **Files**: `apps/app/src/viz/{NodeStatus.tsx,GlobalBar.tsx,ParticleLayer.tsx,particles.ts,useReducedMotion.ts}` + testes
- **Mirror**: `apps/app/src/canvas/ServiceNode.tsx` (T19)
- **Do**:
  - `NodeStatus` mostra utilização %, req/s, p50/p99, erro %, custo e, em fila/stream, backlog e idade. Cor pelo estado de `nodeState` e sempre com um rótulo textual (saudável/pressionado/crítico/gargalo); pulso e piscada com `motion`.
  - `GlobalBar`: p50/p99 por classe, erro global, custo total, gargalo (clicar foca o nó).
  - `particles.ts` (puro):
    - `particleCount(rps) = round(k × log10(1 + rps))`;
    - distribuição proporcional com teto global de 2.000;
    - partículas de erro no sentido inverso, em vermelho.
  - `ParticleLayer`: um `<canvas>` com `devicePixelRatio` e um rAF que lê as posições das conexões do React Flow.
  - Com `useReducedMotion`, não há rAF, `motion` desligado e os indicadores ficam estáticos (espessura da conexão ∝ log rps, badge).
- **Tests**:
  - `particleCount`: 10 < 1.000.000, total ≤ 2.000 com 400 conexões no máximo.
  - Fronteiras de estado com rótulo.
  - Com movimento reduzido, nenhum `requestAnimationFrame` (espiado) e badge "gargalo" presente.
  - O gargalo da barra global bate com o resultado.
- **Check**: `pnpm --filter @archsim/app test viz` → verde
- **Depends on**: T21

### T23 — Salvar e abrir arquivo
- **Covers**: FR-34, FR-35, A05 (rótulos como texto), A08
- **Files**: `apps/app/src/files/{save-open.ts,FileMenu.tsx}` + testes, `apps/app/fixtures/files/{reference.archsim.json,cyclic.archsim.json,xss-label.archsim.json,proto.archsim.json,big.archsim.json}`
- **Mirror**: `apps/app/src/store/autosave.ts` (T18): `parseDiagram` antes de `replaceDiagram`
- **Do**:
  - Salvar: `Blob` + `<a download="nome.archsim.json">`.
  - Abrir: `<input type="file" accept=".json,.archsim.json">`; `file.size > 5 MB` é recusado antes de ler; depois `parseDiagram`; se der erro, mostrar `message` e não mudar o store.
- **Tests**:
  - Round-trip.
  - Cada recusa de FR-35 com a mensagem.
  - O rótulo `<img src=x onerror=alert(1)>` aparece como texto e nenhum `img` extra entra no DOM.
  - O arquivo com `__proto__` não polui.
- **Check**: `pnpm --filter @archsim/app test files` → verde
- **Depends on**: T22

### T24 — Plugin de prática: rotas locais, finalização, histórico, referência
- **Covers**: FR-46 (liberação), FR-47, FR-54, FR-59 (arquivo), A01, A02, A05, A06, A08, A09, A10
- **Files**: `apps/app/vite-plugin-practice.ts`, `apps/app/server/{guard.ts,routes.ts,atomic-write.ts,practice-store.ts}` + testes, `practice/README.md`, `practice/.gitkeep`, `.gitignore` (edit: `practice/*.json`)
- **Mirror**: `packages/cli/src/simulate.ts` (T15): o mesmo `score` e a mesma validação; `packages/problems/src/public.ts` (T12) para o que sai
- **Do**:
  - O plugin registra o middleware em `configureServer` e `configurePreviewServer`, só para `/__archsim/`.
  - `guard.ts`, em toda rota:
    - `Host` ∈ {`127.0.0.1:<porta>`, `localhost:<porta>`}, senão 403;
    - em `POST`, `Origin` = origem do app, senão 403;
    - em `GET`, `Sec-Fetch-Site` = `same-origin` ou `Origin` = origem do app, senão 403;
    - método certo, senão 405;
    - em `POST`, `Content-Type: application/json`, senão 415;
    - corpo ≤ 5 MB lido em stream, senão 413;
    - cada recusa gera uma linha no `console.warn` com método, rota, origem e motivo, sem corpo.
  - Rotas:
    - `GET /__archsim/problems` e `/problems/:id` → `toPublic`;
    - `POST /__archsim/finalize { problemId, diagram }`: `parseDiagram`, depois `score` com a referência e grava `session.json` e o append em `history.json` (com `solutionSeen` = problema já tem `solutionViewedAt`); devolve `{ score, findings, requirements, referenceCost, isRecord }`;
    - `GET /__archsim/history`;
    - `GET /__archsim/reference/:id`: 403 se não houver finalização desse problema no histórico; senão grava `solutionViewedAt` e devolve a referência.
  - `:id` validado contra a lista de IDs carregados (sem caminho vindo do cliente).
  - `atomic-write.ts`: `writeFile(tmp)` → `fsync` → `rename` em `practice/`. Uma gravação que falha deixa o arquivo anterior.
  - `practice-store.ts` lê o histórico com o schema; se o arquivo estiver corrompido, renomeia para `history.corrupt-<ts>.json` e começa vazio, com aviso.
- **Tests** (integração com o middleware montado num `http.createServer` de teste):
  - A01: `Origin: https://evil.example` → 403 e arquivo intacto; `Host: evil.example` → 403; sem `Origin` → 403.
  - A02: `GET /finalize` → 405; `text/plain` → 415.
  - A05: `problemId: "../../etc"` → 400.
  - A06: 5 MB + 1 → 413; `/reference/:id` antes de finalizar → 403.
  - A08: diagrama inválido → 400 e `session.json` anterior intacto.
  - A09: a linha de log da recusa contém a origem e não contém o corpo.
  - A10: falha simulada no `rename` mantém o anterior válido.
  - FR-47: a sessão gravada passa no schema e o desenho é igual.
  - FR-59: recorde ignorando `solutionSeen`.
  - FR-54: `git check-ignore practice/session.json` → ignorado.
- **Check**: `pnpm --filter @archsim/app test server` → verde
- **Depends on**: T15, T16

### T25 — Telas de prática: lista, problema, avaliação, resultado, solução
- **Covers**: FR-43, FR-44, FR-45, FR-46 (UI), FR-47 (UI), FR-48, FR-58, FR-59 (UI), A05 (markdown), A06 (referência fora do bundle)
- **Files**: `apps/app/src/practice/{api.ts,ProblemList.tsx,ProblemView.tsx,EvaluationPanel.tsx,ResultScreen.tsx,SolutionView.tsx,AgentHint.tsx}` + testes, `scripts/check-bundle-no-reference.mjs`
- **Mirror**: `apps/app/src/viz/GlobalBar.tsx` (T22); `apps/app/src/files/save-open.ts` (T23) para os erros de rede
- **Do**:
  - `api.ts` faz `fetch` para `/__archsim/*` com `credentials: 'same-origin'` e valida as respostas com os schemas.
  - `ProblemList`: título, dificuldade, status, recorde e estrelas, lidos de `/history`.
  - `ProblemView`:
    - enunciado com `react-markdown` sem `rehype-raw`, requisitos e a regra do jogo;
    - inicia o modo problema no store com o nó Usuários na carga do problema, travado;
    - `EvaluationPanel` avalia os requisitos no navegador a cada resultado do worker, com `evaluate` (T11), mais o custo atual.
  - "Finalizar e pontuar" chama `POST /finalize` e abre o `ResultScreen`:
    - o score conta até o valor com `motion`, ou aparece direto com movimento reduzido;
    - estrelas, partes, custo do usuário × referência, achados e "novo recorde".
  - `AgentHint` mostra a frase "Pode começar os follow-ups do ArchSim" e o comando `pnpm archsim simulate --session practice/session.json`, com botão de copiar.
  - "Ver uma solução" só aparece com uma finalização no histórico. `SolutionView` busca `/reference/:id` e renderiza um segundo `ReactFlow` somente-leitura (`nodesDraggable`/`nodesConnectable`/`elementsSelectable` falsos), simulado num segundo worker, sem tocar no store do usuário.
  - Uma falha de gravação mostra "não consegui gravar a sessão: {motivo}".
- **Tests**:
  - FR-43: status, recorde 85 e 2 estrelas.
  - FR-44: o DOM do problema não contém nomes de nós da referência; a carga está travada.
  - FR-45: remover o cache vira ✗.
  - FR-46: o botão está ausente antes e presente depois; o desenho do usuário fica igual em comparação profunda.
  - FR-58: "novo recorde"; movimento reduzido sem animação; a referência aparece só como número.
  - A05: um enunciado com `<script>` não cria elemento.
  - A06: o teste do build procura em `dist/assets/*.js` um ID de nó exclusivo de cada `reference.archsim.json` e não encontra.
- **Check**: `pnpm --filter @archsim/app test practice && pnpm --filter @archsim/app build && node scripts/check-bundle-no-reference.mjs` → verde
- **Depends on**: T24, T23

### T26a — Figuras: rede e borda (Route 53, CloudFront, API Gateway, ALB, NLB, NAT, WAF, Usuários)
- **Covers**: FR-33
- **Files**: `packages/icons/figures/{core.users,aws.route53,aws.cloudfront,aws.api-gateway,aws.alb,aws.nlb,aws.nat-gateway,aws.waf}.js`, `packages/icons/src/registry.ts` (edit)
- **Mirror**: `packages/icons/figures/aws.ec2.js` (T17) e os passos da skill `hairline-create` (conceito → construção → `look.mjs`)
- **Do**: uma figura por serviço, com um objeto e um gesto cada, distinguível das outras na silhueta. Cada uma passa no `look.mjs`.
- **Tests**: `figure.test.tsx` parametrizado pelo registry (monta, desmonta, tokens, movimento reduzido); um teste de que todo `serviceId` do catálogo tem figura começa a valer aqui com a lista parcial esperada.
- **Check**: `pnpm --filter @archsim/icons test` → verde; `look.mjs` = 0 para cada figura
- **Depends on**: T17
- **Parallel**: pode rodar junto com T18–T25

### T26b — Figuras: computação e dados (Lambda, Fargate, EKS, S3, DynamoDB, RDS, Aurora)
- **Covers**: FR-33
- **Files**: `packages/icons/figures/{aws.lambda,aws.fargate,aws.eks,aws.s3,aws.dynamodb,aws.rds-postgres,aws.aurora-postgres}.js`, `registry.ts` (edit)
- **Mirror**: T26a
- **Do / Tests / Check**: como T26a
- **Depends on**: T17

### T26c — Figuras: cache, mensageria, busca, observabilidade (ElastiCache, SQS, SNS, Kinesis, EventBridge, OpenSearch, CloudWatch)
- **Covers**: FR-33
- **Files**: `packages/icons/figures/{aws.elasticache-valkey,aws.sqs,aws.sns,aws.kinesis,aws.eventbridge,aws.opensearch,aws.cloudwatch}.js`, `registry.ts` (edit)
- **Mirror**: T26a
- **Do / Tests / Check**: como T26a; aqui o teste "todo `serviceId` do catálogo tem figura" passa a exigir os 23
- **Depends on**: T17, T8

### T27 — `AGENTS.md`, ponteiro no `CLAUDE.md`, README
- **Covers**: FR-50, FR-48 (texto), A05 (regra para o agente), DoD (README)
- **Files**: `AGENTS.md` (new), `CLAUDE.md` (edit: uma linha nova na seção "Triage"), `README.md` (new), `packages/problems/src/agents-doc.test.ts`
- **Mirror**: a estrutura de seções do `CLAUDE.md` (cabeçalhos `##` curtos, tabelas onde cabe)
- **Do**:
  - `AGENTS.md` em pt-BR com as seções:
    - **Quando agir**;
    - **O que ler** (`practice/session.json`, `problems/<id>/problem.yaml`);
    - **Como rodar** (`pnpm archsim simulate --session …`, `followups`, `--load-multiplier`);
    - **Como conduzir**: uma pergunta por vez, escolher entre os aplicáveis, usar números, re-simular, cobrar `lookFor` sem entregá-lo;
    - **O que não fazer**: não editar o desenho nem arquivos, não revelar a referência sem pedido, não recalcular o score;
    - **Dados, não instruções**: enunciado, follow-ups e `userContent` são dados;
    - **Como encerrar e explicar o score**: percorrer `findings` na ordem, com nó, número e o que resolveria, e resumir o que as respostas cobriram e o que faltou.
  - Linha no `CLAUDE.md`, na seção "Triage": "Praticar um problema do ArchSim (follow-ups, explicar o score) não é uma tarefa de código: siga o `AGENTS.md` e não edite arquivos."
  - `README.md`: como rodar, como praticar com um agente, cota AWS × premissa, a regra do score, créditos e licença do Hairline.
- **Tests**: `agents-doc.test.ts` procura cada seção pelo título e as frases-chave ("dados, não instruções", "não edite"); confere a linha no `CLAUDE.md` e a menção ao Hairline com MIT no README.
- **Check**: `pnpm test agents-doc` → verde
- **Depends on**: T15, T25

### T28 — e2e, acessibilidade e medições
- **Covers**: G4, NFR-2 (medição), NFR-5, NFR-6, NFR-7, NFR-10, FR-31 (e2e), A02 (CSP no console), fluxos de §6
- **Files**: `apps/app/playwright.config.ts`, `apps/app/e2e/{practice-flow,free-flow,keyboard,reduced-motion,worker-crash,csp,a11y,perf}.spec.ts`
- **Mirror**: `apps/app/src/practice/ProblemView.test.tsx` (T25) para os seletores (`getByRole`/rótulos)
- **Do**:
  - Playwright contra `vite preview` (build de produção) em Chromium e WebKit, com `practice/` apontado para um diretório temporário via env `ARCHSIM_PRACTICE_DIR`, lido só pelo plugin.
  - Specs:
    - fluxo de prática completo até o resultado e a segunda tentativa com recorde;
    - fluxo livre até o gargalo;
    - G4 com `page.clock`: mudar réplicas e esperar ≤ 2 ticks;
    - `reducedMotion: 'reduce'`;
    - worker crash pelo gancho de teste (build `--mode test`);
    - teclado;
    - axe (`@axe-core/playwright`) sem violações `serious`/`critical`;
    - CSP: listener de `console` sem "Content Security Policy";
    - `perf.spec.ts` (só Chromium, tag `@perf`): 50 nós a 1M req/min, `requestAnimationFrame` contado por 10 s, grava o p95 de fps em `apps/app/e2e/perf-result.json`.
- **Tests**: os specs acima.
- **Check**: `pnpm exec playwright install chromium webkit && pnpm test:e2e` → verde; `perf-result.json` com p95 ≥ 50
- **Depends on**: T25, T26c, T27

### T29 — Conquistas locais (Could)
- **Covers**: FR-61
- **Files**: `packages/sim-engine/src/achievements.ts` + teste, `apps/app/src/practice/Achievements.tsx` + teste
- **Mirror**: `packages/sim-engine/src/score.ts` (T11), uma função pura sobre o histórico
- **Do**: `achievements(history)` → as 4 conquistas de FR-61 com a data em que cada uma foi obtida; um painel na lista de problemas.
- **Tests**: cada condição, exatamente na fronteira; aparece uma vez só.
- **Check**: `pnpm test achievements` → verde
- **Depends on**: T25
- **Opcional**: corta-se sem afetar nenhum Must.

## Coverage

| PRD item | Task |
|---|---|
| FR-1 | T19 |
| FR-2 | T18, T19 |
| FR-3 | T19 |
| FR-4 | T2, T3, T8 |
| FR-5, FR-6 | T19 |
| FR-7 | T20 |
| FR-8 | T2, T3, T8, T20 |
| FR-9 | T4, T21 |
| FR-10 | T5, T7, T21 |
| FR-11, FR-12 | T5 |
| FR-13 – FR-17 | T6 |
| FR-18 – FR-20 | T9 |
| FR-21 – FR-25 | T10 |
| FR-26 | T7, T22 |
| FR-27 | T7, T22 |
| FR-28 | T6, T7 |
| FR-29 | T22 |
| FR-30 | T7, T22 |
| FR-31 | T17, T22, T28 |
| FR-32 | T16 |
| FR-33 | T17, T26a, T26b, T26c |
| FR-34, FR-35 | T4, T23 |
| FR-36 | T18 |
| FR-37 | T5 |
| FR-38 | T21 |
| FR-39 | T3, T20 |
| FR-40 | T13, T14 |
| FR-41 | T12 |
| FR-42 | T11, T12 |
| FR-43 – FR-45 | T25 |
| FR-46 | T24, T25 |
| FR-47 | T24, T25 |
| FR-48 | T25, T27 |
| FR-49 | T12, T13, T14 |
| FR-50 | T27 |
| FR-51 – FR-53 | T15 |
| FR-54 | T24 |
| FR-55 – FR-57 | T11 |
| FR-58 | T25 |
| FR-59 | T24, T25 |
| FR-60 | T13, T14 |
| FR-61 (Could) | T29 |
| NFR-1 | T7 |
| NFR-2 | T22, T28 |
| NFR-3 | T4, T18 |
| NFR-4 | T7 |
| NFR-5 | T21, T28 |
| NFR-6, NFR-7 | T22, T19, T28 |
| NFR-8 | T16 |
| NFR-9 | T7, T11 |
| NFR-10 | T16, T28 |
| NFR-11 | T2, T6, T7 |
| NFR-12 | T12 |
| A01 | T24 |
| A02 | T16, T24, T28 |
| A03 | T1, T17 (licença) |
| A04 | N/A (PRD) |
| A05 | T1 (lint), T4, T12, T15, T23, T24, T25, T27 |
| A06 | T4, T5, T15, T24, T25 |
| A07 | N/A (PRD) |
| A08 | T4, T12, T15, T18, T23, T24 |
| A09 | T24 |
| A10 | T7, T9, T15, T18, T21, T24 |
| G1, G2, G7 | T13, T14 |
| G3 | T6, T7, T9, T10, T11 |
| G4 | T28 |
| G5 | T28 |
| G6 | Verificação manual (§18.6 do PRD) após T27 |
| G8 | Pós-lançamento (`/monitor-work`) |
| §17 fixtures que não existem | T4 (diagramas), T7 (`catalog-gcp`), T11 (achados), T13/T14 (referências, ingênua, `when`), T15 (sessões), T21 (gancho do worker), T23 (arquivos maliciosos) |

## Risks

| Risk | Where it bites | What to do if it does |
|---|---|---|
| O `kernel.js` da skill foi feito para HTML avulso (global `HL`) e não isola instâncias | T17 | Gate de T17: troca para SVG próprio com mola; atualizar T26a–c; avisar o usuário antes de seguir |
| 23 figuras com `look.mjs` levam mais que o resto do app | T26a–c | Rodam em paralelo; se atrasarem, o app sai com as figuras prontas e um placeholder isométrico para as que faltam. Isso **não** fecha FR-33, e o `/review-work` precisa ver isso |
| Referências mal calibradas (score < 90 ou falham em 1,5×) | T13, T14 | O teste de banco mostra qual requisito e qual nó; ajustar a referência ou o número do problema, nunca relaxar o teste |
| O fixture de `when` passa no T13 com uma regra que a CLI implementa diferente | T13 → T15 | T15 move `evaluateWhen` para a CLI e o teste do banco passa a importá-la: uma regra só |
| O TypeScript mais novo fora do range do typescript-eslint | T1 | Pinar a maior versão suportada (Decisions) |
| O React Refresh exige CSP mais frouxa no dev | T16 | Só no dev; o e2e verifica a CSP estrita no preview |
| Partículas + 50 figuras animadas derrubam o fps | T22, T28 | As figuras só animam no hover (sem `play`); partículas com teto; se o `perf.spec` falhar, reduzir `k` e o teto antes de mexer em arquitetura |
| Preços de WAF/EventBridge/OpenSearch/CloudWatch sem página oficial clara | T8 | Registrar como `assumption` com a melhor fonte e dizer isso no commit; nunca inventar sem fonte |
| `Date` proibido no `sim-engine` quebra algo que precisa de tempo | T7, T11 | O tempo entra por parâmetro (`dtMs`, `now`); o histórico e a data ficam no plugin (T24) |
| O hook do `CLAUDE.md` descrito e ausente: nada impede escrita fora de `docs/work/` durante o plano | Este estágio | Seguido por disciplina; registrado no PRD §12 |

## Verification

Depois de todas as tarefas, num clone limpo:

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck
pnpm test                       # motor (golden, propriedade), catálogo, problemas (solvable/teeth/G7), CLI, plugin, app, AGENTS.md, schemas
pnpm test:bench                 # NFR-1: p95 ≤ 10 ms
pnpm build && node scripts/check-bundle-no-reference.mjs
pnpm exec playwright install chromium webkit && pnpm test:e2e   # inclui CSP, a11y, teclado, reduced motion, worker, perf (p95 fps ≥ 50)
pnpm audit
```

Depois, os passos manuais de §18 do PRD, com estes valores concretos:
1. `pnpm dev`; `lsof -iTCP -sTCP:LISTEN -P | grep node` → só `127.0.0.1`.
2. Fluxo livre do §18.2: ALB 3.333,3 req/s; EC2 é o gargalo; m5.large ×5 → US$ 350,40.
3. Prática no encurtador: sem dica e sem botão de solução; finalizar → score, estrelas, achados; `cat practice/session.json`; `git status` limpo; "Ver uma solução" aparece.
4. `pnpm archsim simulate --session practice/session.json`, `--load-multiplier 10` e `pnpm archsim followups`.
5. `curl -i -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:5173/__archsim/finalize` → `403`, `practice/session.json` inalterado.
6. Os 3 roteiros de agente do §18.6 do PRD com Claude Code numa sessão nova, com o resultado registrado em `docs/work/archsim-mvp-monitor.md`.
7. Temas e "Reduzir movimento" do macOS nos 4 estados; ler `apps/app/e2e/perf-result.json`.

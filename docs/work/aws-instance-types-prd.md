# PRD: Tipos de instância por serviço AWS

**Source**: `conversation` — "adiciona tbm, as classes dentro de cada servico da aws, por exemplo, se eu adiciono um ec2, ele pode ser microt3, mini, e varios outros. estuda la o q tem e associa la" + respostas: abrangência = "Famílias atuais"; onde escolher = "Mostrar no card" + "você também tem que carregar o limite que ele aguenta… se pegar um micro T3, ele vai aguentar X requests… um maior… 10X… pra ajudar no gargalo" · **Type**: feature · **Status**: READY · **Approval**: 2026-11-13 · **Standards**: owasp-top10-2025 · **Date**: 2026-11-13

## 1. Overview
Cada serviço AWS do catálogo que é dimensionado por instância (EC2, RDS PostgreSQL, Aurora PostgreSQL, ElastiCache Valkey, OpenSearch, nós do EKS e tamanhos de task do Fargate) passa a oferecer as famílias atuais de instância — burst (t), uso geral (m), computação (c) e memória (r) — de large a 4xlarge, além dos tamanhos pequenos de burst que já existem. Cada tipo tem preço on-demand de us-east-1 com fonte e data e uma capacidade simulada por uma regra explícita. O card do nó no canvas passa a mostrar o tipo escolhido.

## 2. Problem
O mecanismo de tipo já existe: cada serviço tem `variants` (`packages/catalog/src/schema.ts:92-107`), o painel de Propriedades mostra o seletor "Tipo" quando há mais de uma (`apps/app/src/panels/PropertiesPanel.tsx:59-69`), e o simulador usa capacidade, latência e preço da variante. O catálogo, porém, é raso. O EC2 tem 5 tipos e só um que não é burst (`m5.large`). O RDS tem 3; ElastiCache, Aurora e EKS têm 1 cada. Não há instância otimizada para computação nem para memória (`packages/catalog/src/catalog.json`). Isso tira do exercício a decisão central de dimensionamento: escalar na vertical (tipo maior) ou na horizontal (mais réplicas), e qual família é a certa para a carga. Além disso, o tipo só aparece abrindo o painel, então quem lê o desenho não vê se aquilo é um `t3.micro` ou um `m5.4xlarge`. O usuário não encontrou o seletor (pediu "adiciona as classes").

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1: Dar as escolhas reais de dimensionamento | Tipos por serviço dimensionado por instância | EC2 ≥ 15; RDS, Aurora, ElastiCache, OpenSearch, EKS ≥ 8 cada; Fargate ≥ 6 | Teste do catálogo contando variantes |
| G1a: A troca de tipo resolve gargalo | Utilização do nó ao trocar para um tipo maior, mesma carga | cai na proporção das capacidades | Teste de simulação (FR-9a) |
| G2: Números confiáveis | Preços com fonte AWS https e data; capacidade com origem declarada | 100% dos tipos novos | Teste do catálogo (o mesmo do MVP, `catalog.test.ts:80-92`) |
| G3: Ler o tipo sem clicar | Nós com mais de um tipo mostram o tipo no card | 100% | Teste de componente + e2e |
| G4: Nada do que existe muda | Variantes antigas, soluções de referência e scores | idênticos | Teste: ids antigos presentes com os mesmos números; suite de problemas verde sem atualizar snapshot |

**Non-goals**: todos os 800+ tipos da AWS; outras regiões; preços reservados, spot ou Savings Plans; famílias especializadas (GPU, storage-optimized, HPC); trocar o tipo direto no card.

## 4. Users & Personas
Quem pratica design de sistemas no ArchSim. Com isso, pode resolver um gargalo trocando `t3.micro` por `c5.xlarge` em vez de só somar réplicas, comparar o custo das duas saídas e ver no próprio desenho que tipo cada nó usa.

## 5. User Stories
- **US-1**: Como praticante, quero escolher entre as famílias e tamanhos atuais de cada serviço, para dimensionar como faria na AWS.
- **US-2**: Como praticante, quero que cada tipo tenha preço e capacidade coerentes entre si, para que a troca de tipo mude custo e desempenho de um jeito crível.
- **US-3**: Como praticante, quero achar o tipo certo numa lista longa sem me perder, agrupada por família.
- **US-4**: Como quem lê um desenho, quero ver o tipo de cada nó no card, sem abrir o painel.
- **US-5**: Como quem já tem diagramas salvos ou tentativas registradas, quero que eles abram e pontuem igual a antes.

## 6. User Flows
**Principal**: arrastar EC2 → o nó nasce com o tipo padrão de hoje e o card mostra "t3.micro" (ou o que for o padrão atual) → selecionar o nó → Propriedades → "Tipo" lista as opções agrupadas por família (Burst, Uso geral, Computação, Memória) → escolher `c5.xlarge` → o card passa a mostrar "c5.xlarge"; capacidade por réplica, latência, preço/mês e o resultado da simulação mudam no tick seguinte.

**Alternativos**:
- Serviço com um tipo só (Route 53, ALB, S3…) → o card não mostra tipo e o painel não mostra o seletor, como hoje.
- Abrir um `.archsim.json` antigo ou um problema → os nós mantêm os tipos que já tinham.
- Trocar de tipo apaga os valores alterados que o tipo novo não tem (comportamento atual de `setVariant`, `apps/app/src/store/diagram-store.ts:178-190`).

**Erro**: arquivo com um `variantId` que não existe → a validação já recusa (`validateDiagram`), sem mudança.

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | **EC2**: além dos 5 tipos atuais, `t3.large`, `t3.xlarge`, `t3.2xlarge`; `m5.xlarge`, `m5.2xlarge`, `m5.4xlarge`; `c5.large`, `c5.xlarge`, `c5.2xlarge`, `c5.4xlarge`; `r5.large`, `r5.xlarge`, `r5.2xlarge`, `r5.4xlarge`. | Must | US-1 | Given o catálogo, Then `aws.ec2` tem esses 19 ids; os t3 têm `burst: true`, os outros `burst: false`. |
| FR-2 | **RDS PostgreSQL**: além dos 3 atuais, `db.t4g.medium`, `db.t4g.large`; `db.m7g.xlarge`, `db.m7g.2xlarge`, `db.m7g.4xlarge`; `db.r7g.large`, `db.r7g.xlarge`, `db.r7g.2xlarge`, `db.r7g.4xlarge`. | Must | US-1 | Given o catálogo, Then `aws.rds-postgres` tem 12 tipos, com os t4g `burst: true`. |
| FR-3 | **Aurora PostgreSQL**: além de `db.r5.large`, `db.t4g.medium`; `db.r5.xlarge`, `db.r5.2xlarge`, `db.r5.4xlarge`; `db.r7g.large`, `db.r7g.xlarge`, `db.r7g.2xlarge`, `db.r7g.4xlarge`. | Must | US-1 | Given o catálogo, Then `aws.aurora-postgres` tem 9 tipos. |
| FR-4 | **ElastiCache Valkey**: além de `cache.t4g.micro`, `cache.t4g.small`, `cache.t4g.medium`; `cache.m7g.large`, `cache.m7g.xlarge`, `cache.m7g.2xlarge`; `cache.r7g.large`, `cache.r7g.xlarge`, `cache.r7g.2xlarge`. | Must | US-1 | Given o catálogo, Then `aws.elasticache-valkey` tem 9 tipos. |
| FR-5 | **OpenSearch**: além dos 3 atuais, `t3.small.search`; `m7g.large.search`, `m7g.xlarge.search`; `c6g.xlarge.search`, `c6g.2xlarge.search`; `r6g.large.search`, `r6g.2xlarge.search`. | Must | US-1 | Given o catálogo, Then `aws.opensearch` tem 10 tipos. |
| FR-6 | **EKS (nós gerenciados)**: além de `m5.large-nodes`, `t3.medium-nodes`, `t3.large-nodes`; `m5.xlarge-nodes`, `m5.2xlarge-nodes`; `c5.large-nodes`, `c5.xlarge-nodes`; `r5.large-nodes`, `r5.xlarge-nodes`. Cada um mantém a taxa do cluster, como `m5.large-nodes` faz hoje. | Must | US-1 | Given o catálogo, Then `aws.eks` tem 9 tipos, todos com o preço `clusterFee` igual ao atual e `hourly` igual ao do EC2 correspondente. |
| FR-7 | **Fargate**: além dos 3 atuais, `0.25vcpu-0.5gb`, `4vcpu-8gb`, `8vcpu-16gb`, `16vcpu-32gb`. | Must | US-1 | Given o catálogo, Then `aws.fargate` tem 7 tamanhos, com preço = vCPU × preço/vCPU-h + GB × preço/GB-h da página da AWS. |
| FR-8 | Todo tipo novo tem preço on-demand de us-east-1 (Linux, sem licença, Single-AZ onde houver opção) com `sourceUrl` https da AWS e `priceDate` = data da pesquisa. Tipo que a AWS não oferecer em us-east-1 para aquele serviço é retirado e registrado no registro de implementação. | Must | US-2 | O teste "cites a source for every quota and every price" (`catalog.test.ts:80-92`) passa; uma amostra de 3 preços por serviço confere com a página citada. |
| FR-9 | Cada tipo carrega quanto aguenta: a capacidade (`capPerUnit`, req/s por instância) vem de uma única regra declarada por serviço, ancorada nos números atuais, com `capSource: "assumption"`. A regra cresce com o tamanho dentro da família e reflete a família: computação (c) rende mais por vCPU que uso geral (m); memória (r) rende como uso geral em CPU. | Must | US-2 | Teste: em cada família, `capPerUnit` cresce com o tamanho; `c5.xlarge` > `m5.xlarge` ≥ `r5.xlarge` no EC2; a regra escrita no teste reproduz o valor do catálogo para todos os tipos novos. |
| FR-9a | A capacidade do tipo é a que o simulador usa para saturar o nó e apontar o gargalo: trocar o tipo muda a utilização e o gargalo no tick seguinte, sem mudar nada além do tipo. | Must | US-2 | Teste de simulação: Usuários → EC2 com 1 réplica a 1.500 req/s; com `t3.micro` o EC2 é o gargalo e há erros; com `c5.xlarge` a utilização cai abaixo de 1 e não há erro; a utilização é a carga ÷ (`capPerUnit` × réplicas). |
| FR-9b | Cada opção do seletor "Tipo" mostra a capacidade por instância e o preço por mês ao lado do nome (ex.: "t3.micro · 200 req/s · US$ 7,59/mês"), para comparar os tipos antes de escolher. | Should | US-1, US-2 | Given um EC2 selecionado, Then a opção `t3.micro` contém "200 req/s" e "US$ 7,59/mês"; o texto sai do catálogo, não de valores fixos no código. |
| FR-10 | Os ids, rótulos, capacidades, latências, preços e limites das variantes que já existem não mudam. Também não mudam o tipo padrão de um nó novo nem as soluções de referência. | Must | US-5 | Teste compara cada variante antiga com um snapshot tirado antes da mudança; `pnpm test` dos problemas passa sem regravar nada. |
| FR-11 | O rótulo de cada tipo segue o padrão atual: id, vCPU, memória e, nos burst, o baseline — ex.: "t3.micro (2 vCPU, 1 GiB, baseline 10%)" (`catalog.json`, EC2). | Should | US-1 | Teste: todo rótulo começa pelo id e cita vCPU e GiB. |
| FR-12 | O seletor "Tipo" agrupa as opções por família (Burst, Uso geral, Computação, Memória) quando o serviço tem mais de uma família. | Should | US-3 | Given um EC2 selecionado, Then o `<select>` tem 4 grupos com rótulos em português, e os tipos aparecem em ordem crescente de tamanho dentro de cada um. |
| FR-13 | O card do nó mostra o id do tipo (ex.: "c5.xlarge") quando o serviço tem mais de um tipo, e atualiza ao trocar. | Must | US-4 | Given um EC2, Then o card mostra "t3.micro"; When muda para c5.xlarge, Then mostra "c5.xlarge"; Given um ALB, Then o card não mostra tipo. |
| FR-14 | `catalogVersion` sobe (ex.: `2026-11-13.2`), e diagramas salvos com a versão anterior continuam abrindo. | Must | US-5 | Teste: as fixtures e as referências com `2026-11-13.1` passam por `validateDiagram` e simulam com os mesmos números. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Performance | O catálogo maior não pode pesar no carregamento nem no tick. | `perf.spec.ts` e o benchmark do motor (NFR-1 do MVP) continuam passando; o `catalog.json` cresce menos de 60 KB. |
| NFR-2 | Accessibility | O card mostra o tipo como texto legível (contraste do token `--text-muted`, que já é usado); o `<select>` agrupado continua operável por teclado. | `a11y.spec.ts` sem violações novas; `keyboard.spec.ts` continua passando. |
| NFR-3 | Maintainability | Rótulos, famílias e preços ficam só no `catalog.json` (dados), nunca no código da UI. | Revisão: a UI não tem nenhum id de tipo escrito no código. |

## 9. Out of Scope
- Outros tipos e famílias (GPU, storage, `x`, `z`, Graviton no EC2) — dá para adicionar depois com a mesma regra.
- Preços de outras regiões, reservados, spot e Savings Plans — o MVP é on-demand de us-east-1 (PRD do MVP §9).
- Variantes de Lambda (memória, arm64), DynamoDB ou SQS — não são dimensionadas por instância.
- Trocar o tipo direto no card — escolha do usuário: só mostrar.
- Mudar problemas ou soluções de referência para usar os tipos novos.

## 10. Definition of Done
- [ ] Todos os Must atendem os critérios de aceite
- [ ] Cada serviço da G1 tem o número mínimo de tipos
- [ ] Todo preço novo tem fonte e data, e 3 por serviço foram conferidos à mão contra a página citada (registrado no registro de implementação)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` e `pnpm schemas` verdes, com `schemas/` atualizado se o schema mudar
- [ ] Soluções de referência e scores dos problemas iguais aos de antes

## 11. Technical Context
**Stack & areas affected**: TypeScript 6.0.3, zod 4.6.7, React 19.3.1, Vitest 5, Playwright 1.64.1.
- `packages/catalog/src/catalog.json` — os dados (1.693 linhas); `schema.ts` — o schema `Variant` (`schema.ts:92-107`); `catalog.test.ts`.
- `apps/app/src/panels/PropertiesPanel.tsx:59-69` — o seletor "Tipo".
- `apps/app/src/canvas/ServiceNode.tsx:16-33` — o card do nó. Hoje recebe `serviceId` e `label` em `data` (`flow-model.ts:18`), não o tipo.
- Indireto: `packages/sim-engine` (lê `capPerUnit`, `baseLatencyMs`, `burst` e `prices` por kind), `packages/problems` (scores comparam o custo com a referência), `schemas/` (JSON Schema exportado por `pnpm schemas`, conferido em `schemas/schemas.test.ts`).

**Conventions**:
- Variante: `{ id, label, capPerUnit, capSource, baseLatencyMs, burst?, prices[], limits[] }`. Preço: `{ id: "hourly", label: "Por hora", amountUsd, per: "unit-hour", priceDate, sourceUrl }` (EC2 em `catalog.json`).
- EKS tem dois preços por variante: `clusterFee` e `hourly` (`aws.eks` / `m5.large-nodes`).
- `capSource: "assumption"` para req/s, com a descrição do serviço dizendo que é premissa ("req/s por instância é premissa: a AWS não publica esse número", EC2).
- Toda data de preço é a mesma e o teste a fixa (`catalog.test.ts:87`).
- Âncoras de capacidade atuais: EC2 t3.nano 100, t3.micro 200, t3.small 300, t3.medium 500, m5.large 800; RDS db.t4g.micro 300, db.t4g.small 600, db.m7g.large 3000; Aurora db.r5.large 3000; ElastiCache cache.t4g.micro 20000; OpenSearch m7g.medium 200, c6g.large 400, r6g.xlarge 800; Fargate 0.5 vCPU 100, 1 vCPU 250, 2 vCPU 500; EKS m5.large-nodes 800.

**Data & contracts**: o shape de `Variant` não precisa mudar para FR-1–FR-11. FR-12 (agrupar por família) precisa saber a família de cada tipo; se isso virar um campo opcional do `Variant`, o JSON Schema em `schemas/` muda e é regravado por `pnpm schemas`. `catalogVersion` sobe. Os diagramas (`.archsim.json`) não mudam de formato; `variantId` antigos continuam válidos.

**Constraints**: o motor escolhe o handler pelo `kind`, nunca pelo id (`schema.ts:4-6`), então os tipos novos são só dados. Nenhum id antigo pode sumir ou mudar de número (FR-10).

**Dependencies**: pesquisa de preços nas páginas públicas da AWS (EC2 on-demand, RDS, Aurora, ElastiCache, OpenSearch, Fargate, EKS) feita na implementação.

## 12. Security & Compliance

### OWASP Top 10:2025

| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | No | App local, sem usuários. Mudança de dados de catálogo e de exibição. | N/A — sem fronteira de acesso. |
| A02 | Security Misconfiguration | No | Nenhuma configuração, header ou CSP muda. | N/A; o e2e continua checando CSP via `watchConsole`. |
| A03 | Software Supply Chain Failures | No | Sem dependência nova. Os preços vêm de páginas da AWS, não de pacote. | `pnpm-lock.yaml` sem mudança no diff. |
| A04 | Cryptographic Failures | No | Sem dados sensíveis. | N/A. |
| A05 | Injection | Yes (leve) | Rótulos e ids do catálogo são renderizados como texto pelo React no card e no `<select>`, nunca como HTML. | Teste de componente: o card com um tipo cujo rótulo tem `<img onerror>` não cria `<img>`. |
| A06 | Insecure Design | Yes | O schema continua validando cada variante (ids no padrão, números positivos, preço com https); um tipo inválido quebra o carregamento do catálogo no teste, não em produção. | `parseCatalog` sobre o catálogo novo passa; teste que um preço sem `sourceUrl` é recusado (já existe em `schema.test.ts`). |
| A07 | Authentication Failures | No | Sem autenticação. | N/A. |
| A08 | Software or Data Integrity Failures | Yes | Arquivos e referências antigos continuam válidos e com os mesmos números (FR-10, FR-14); o JSON Schema exportado bate com o schema zod. | Teste de compatibilidade de FR-14; `schemas/schemas.test.ts`. |
| A09 | Security Logging and Alerting Failures | No | Nada é logado. | N/A. |
| A10 | Mishandling of Exceptional Conditions | Yes (leve) | Nó com `variantId` desconhecido continua caindo no caminho de erro atual ("Serviço desconhecido.", `PropertiesPanel.tsx:32`); o card sem tipo encontrado mostra só o serviço, sem exceção. | Teste de componente do card com `variantId` inexistente. |

**Existing controls at risk**: a validação do diagrama recusa `variantId` desconhecido; os tipos antigos têm que continuar no catálogo para ela não recusar arquivos válidos (FR-10).
**Secrets / PII touched**: nenhum.

## 13. Do / Don't
- Do: escrever a regra de capacidade de cada serviço uma vez (no teste e no registro de implementação) e gerar os números a partir dela. Se não, os números viram chute caso a caso.
- Do: citar a página exata da AWS de onde cada preço saiu.
- Don't: mexer em qualquer número de uma variante que já existe — muda scores e recordes já gravados.
- Don't: escrever nomes de família ou de tipo no código da UI — o catálogo é a fonte (NFR-3).

## 14. Risks & Caveats
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Algum tipo listado não existe para o serviço em us-east-1 (ex.: uma classe do Aurora). | Medium | Low | FR-8: retirar e registrar; os mínimos da G1 têm folga. |
| Capacidade por tipo é premissa e pode parecer arbitrária. | High | Medium | Regra única por serviço, ancorada nos números atuais e testada (FR-9); `capSource: "assumption"` aparece no painel como premissa. |
| Tipos mais baratos que os da referência deixam o usuário superar o custo da referência com mais facilidade. | Medium | Low | É o comportamento esperado (`belowReference` já existe); referências e scores antigos não mudam (FR-10). |
| Preço da página muda entre a pesquisa e o uso. | Low | Low | `priceDate` em todo preço, como no MVP. |
| Rótulo do tipo no card aumenta a altura do nó e mexe no layout dos e2e. | Medium | Low | Uma linha curta (só o id); rodar a suite e2e inteira. |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| Escopo: as famílias e tamanhos listados em FR-1–FR-7. | Resposta "Famílias atuais"; lista concreta escolhida por mim, sem Graviton no EC2 para manter o m5 atual como referência. | Acrescentar ou trocar ids é só dado; FRs se mantêm. |
| Preços on-demand de us-east-1, Linux, Single-AZ. | Convenção do MVP (PRD do MVP FR-4, §9). | Outra região seria um FR novo. |
| Capacidade cresce proporcional aos vCPUs dentro da família, com computação ~25% acima de uso geral por vCPU. | Âncoras atuais (m5.large 2 vCPU = 800 → 400 req/s por vCPU). | Ajusta só a regra; os testes de FR-9 apontam o lugar. |
| O tipo padrão de um nó novo continua o de hoje. | FR-10; não mexer em scores. | Mudar o padrão seria uma decisão separada. |
| Mostrar só o id do tipo no card (não o rótulo longo). | O card tem 120 px de largura (`canvas.css`, `.service-node`). | Rótulo maior quebraria o card. |
| `catalogVersion` não é usado para recusar arquivos. | Só é validado como string (`packages/sim-engine/src/diagram.ts:86`). | Se fosse, FR-14 precisaria de migração. |

## 16. Open Questions
None.

## 17. Tests
- Catálogo (`packages/catalog/src/catalog.test.ts`): contagem por serviço (G1, FR-1–FR-7); ids exatos; `burst` dos t/t4g; EKS com `clusterFee` + `hourly` igual ao EC2 correspondente (FR-6); Fargate = vCPU × preço + GB × preço (FR-7); fonte e data em todo preço (FR-8); regra de capacidade reproduz cada valor novo e é monotônica por família, com c > m ≥ r (FR-9); simulação com t3.micro × c5.xlarge na mesma carga muda o gargalo e a utilização na razão das capacidades (FR-9a, em `packages/sim-engine`); snapshot das variantes antigas inalterado (FR-10); rótulos começam pelo id e citam vCPU e GiB (FR-11); `catalogVersion` novo (FR-14).
- Schema: `parseCatalog` passa; se entrar o campo de família, um valor inválido é recusado e `schemas/` é regravado.
- Problemas: a suite de `packages/problems` passa sem regravar scores ou referências (G4, FR-10); fixtures com `2026-11-13.1` validam e simulam (FR-14, A08).
- App: o `<select>` do EC2 tem 4 grupos ordenados (FR-12) e cada opção traz req/s e US$/mês do catálogo (FR-9b); o card mostra o tipo e atualiza ao trocar, e não mostra nada no ALB (FR-13); o rótulo com `<img onerror>` não vira elemento (A05); `variantId` inexistente não quebra o card (A10).
- e2e: adicionar EC2, trocar para `c5.xlarge` pelo painel, ver "c5.xlarge" no card e o custo/mês mudar; `a11y.spec.ts` e `keyboard.spec.ts` verdes (NFR-2); `perf.spec.ts` verde (NFR-1).

## 18. Verification
```
pnpm lint
pnpm typecheck
pnpm test
pnpm schemas   # só se o schema mudar; depois conferir git diff em schemas/
pnpm test:e2e
```
Ponta a ponta: `pnpm dev` → Canvas livre → Usuários + EC2 → o card mostra "t3.micro" → Propriedades → "Tipo" com Burst / Uso geral / Computação / Memória → `c5.xlarge` → o card mostra "c5.xlarge", e a capacidade e o US$/mês mudam → repetir com RDS, ElastiCache e Fargate → abrir o problema do encurtador → a solução de referência e o score continuam os mesmos.

## 19. Release Plan
- **Branch**: nova, `feat/aws-instance-types`, a partir de `master`
- **Milestones**: release única
- **Migrations / ordering**: nenhuma; os `variantId` antigos continuam válidos
- **Config / secrets**: nenhum
- **Feature flag**: none — dados aditivos e um rótulo no card
- **Rollout**: tudo de uma vez
- **Rollback**: reverter os commits. Um diagrama salvo com um tipo novo não abre depois do rollback (o `variantId` deixa de existir). Isso fica documentado no PR; é aceitável num app local.
- **Post-launch**: sem telemetria; as métricas da §3 são verificadas pelos testes no CI.

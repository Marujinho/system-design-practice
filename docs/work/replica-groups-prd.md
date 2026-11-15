# PRD: Ver as réplicas no canvas

**Source**: `conversation` — "quando eu aumento o número de réplicas… ele deve fazer uma animaçãozinha e multiplicar aquele node pelo número de réplicas… e tratar aquele grupo como uma coisa só"; visual escolhido: "Mini-cópias dentro de um grupo"; "Sim, com auto-approve" · **Type**: feature · **Status**: READY · **Approval**: skipped (--auto) · **Standards**: owasp-top10-2025 · **Date**: 2026-11-15

## 1. Overview
O card de um nó com várias unidades passa a ser uma moldura com mini-cópias dentro, uma por réplica (até 12, depois "+N"), e a legenda "6 réplicas". As cópias novas aparecem com uma animação curta quando o número sobe. O nó continua sendo um só: uma conexão, um painel de propriedades. É uma mudança só visual: a simulação, o score e os arquivos não mudam.

## 2. Problem
- **As réplicas não aparecem no canvas.** A pessoa aumentou as réplicas, viu um score baixo e concluiu que elas não contavam. Achou também que a solução de referência "liga 3 réplicas manualmente".
- **O motor conta as réplicas.** Medido no `url-shortener` (`compute.ts:7`, capacidade = por unidade × réplicas): EC2 com 1, 10 e 30 réplicas → 800, 8.000 e 24.000 req/s; com 30, score 93.
- **As referências não desenham réplicas como nós soltos.** Os serviços repetidos nelas são papéis diferentes, cada um com as réplicas dentro: em `notifications`, uma fila e um grupo de workers por canal, cada grupo com 4 réplicas no spec.
- **O problema é de visibilidade.**

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1. Ver quantas máquinas um nó representa | Nós com quantidade ≥ 2 que mostram o grupo com a contagem certa | 100% | Testes de `replicaGroup` e do card; e2e |
| G2. Feedback ao mudar o número | As cópias novas animam ao aparecer (sem animação sob reduced motion) | Sim | Teste de componente e e2e |
| G3. Sem custo de desempenho | O e2e de perf (50 nós) continua ≥ 50 fps | ≥ 50 fps | `perf.spec.ts` |

**Non-goals**: criar nós separados por réplica; mudar a simulação ou o score; mudar o arquivo do diagrama.

## 5. User Stories
- **US-1**: Como pessoa montando, quero ver no card quantas réplicas um nó tem, para entender que ele conta como várias máquinas.
- **US-2**: Como pessoa montando, quero ver as cópias surgirem quando aumento as réplicas, para ter certeza de que a mudança entrou.

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | O card mostra um grupo de mini-cópias quando o serviço tem um parâmetro de quantidade (`units`, `shards` ou `prefixes`) com valor ≥ 2. | Must | US-1 | EC2 com 6 réplicas → 6 cópias e "6 réplicas"; com 1 → card como hoje. Kinesis com 4 shards → "4 shards"; S3 com 3 prefixos → "3 prefixos". |
| FR-2 | RDS e Aurora: com `readReplicas` ≥ 1, o grupo mostra o primário mais N réplicas de leitura, com o primário diferenciado. | Must | US-1 | RDS com 2 réplicas de leitura → 3 cópias (1 primário) e "primário + 2 réplicas de leitura". |
| FR-3 | No máximo 12 cópias desenhadas; acima disso, "+N". | Must | US-1 | 30 réplicas → 12 cópias, "+18" e "30 réplicas". |
| FR-4 | Cópias novas aparecem com uma animação curta (≤ 300 ms); sob `prefers-reduced-motion`, nenhuma animação. | Must | US-2 | Teste: ao subir de 3 para 5, as 2 novas têm a classe de entrada; com reduced motion, a classe não existe. |
| FR-5 | O grupo tem nome acessível ("6 réplicas"), e as cópias são decorativas para leitores de tela. | Must | US-1 | Teste: um elemento com `aria-label` "6 réplicas", cópias com `aria-hidden`. |
| FR-6 | Continua um nó só: as mesmas alças de conexão, a mesma seleção, o mesmo painel. | Must | US-1 | Os e2e existentes (conexões, seleção, duplo clique) passam. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Performance | Cópias em CSS puro (sem SVG nem JS por cópia). | `perf.spec.ts` ≥ 50 fps. |
| NFR-2 | Accessibility | O axe não acusa violações serious/critical. | `a11y.spec.ts`. |

## 10. Definition of Done
- [ ] Todo Must atende ao critério; `pnpm lint/typecheck/test/test:e2e/audit` verdes.

## 11. Technical Context
- `apps/app/src/canvas/flow-model.ts` (`toFlow` monta `data` do card) e `ServiceNode.tsx` (o card).
- Os parâmetros de quantidade são os de `UNIT_PARAMS` em `packages/sim-engine/src/findings.ts:33` (`units`, `shards`, `prefixes`), mais `readReplicas` (RDS e Aurora, no catálogo).
- O valor vem de `node.props[key] ?? param.default`, como em `findings.ts:125`.
- CSS em `apps/app/src/canvas/canvas.css` (`.service-node`, `:312`); o padrão de reduced motion é `useReducedMotion` (`apps/app/src/viz/useReducedMotion.ts`).

## 12. Security & Compliance
| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | No | — | N/A: só renderização. |
| A02 | Security Misconfiguration | No | — | N/A. |
| A03 | Software Supply Chain Failures | No | — | N/A: sem dependência. |
| A04 | Cryptographic Failures | No | — | N/A. |
| A05 | Injection | No | — | N/A: só números do diagrama já validado. |
| A06 | Insecure Design | Yes | O número de cópias desenhadas tem teto (12), mesmo com 1.000 réplicas. | Teste do FR-3. |
| A07 | Authentication Failures | No | — | N/A. |
| A08 | Software or Data Integrity Failures | No | — | N/A: não grava nada. |
| A09 | Security Logging and Alerting Failures | No | — | N/A. |
| A10 | Mishandling of Exceptional Conditions | Yes | Valor ausente usa o default do parâmetro; serviço sem parâmetro de quantidade → card como hoje. | Testes. |

## 18. Verification
`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit`, mais olhar o canvas com a EC2 em 1, 6 e 30 réplicas.

## 19. Release Plan
Branch `feat/replica-groups` a partir de `master`; single release; sem flag; rollback = reverter o merge.

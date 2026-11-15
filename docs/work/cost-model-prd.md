# PRD: Custo mensal correto: faixas de volume, transferências certas e os custos que faltavam

**Source**: `conversation` — "às vezes aparece o preço dando 20k sendo uma arquitetura simples"; auditoria de preços (subagent, 2026-11-15); "sim, com auto-approve, inclui os custos que faltam" · **Type**: bugfix · **Status**: READY · **Approval**: skipped (--auto) · **Standards**: owasp-top10-2025 · **Date**: 2026-11-15

## 1. Overview
A auditoria comparou mais de 120 preços unitários com a AWS Price List API e todos conferem. A forma de cobrar, porém, tem três erros que inflam o custo, e faltam dimensões que o subestimam. Este bugfix aplica as faixas de volume da AWS, cobra a saída do S3 só do que vai para a internet, cobra o upload do CloudFront como transferência para a origem e acrescenta armazenamento (S3, RDS e Aurora), I/O do Aurora e unidades de payload do Kinesis.

## 2. Problem
Evidência da auditoria, que reproduziu os casos no motor e refez as contas à mão:

| # | Erro | Onde | Exemplo | App | Correto |
|---|---|---|---|---|---|
| 1 | Sem faixas de volume: o preço da 1ª faixa vale para todo o volume | `packages/sim-engine/src/queueing.ts:79` (`monthlyCost`) | API Gateway REST a 10k req/s | US$ 91.980 | US$ 57.736 |
| 2 | O S3 cobra saída para a internet mesmo com o CloudFront na frente, ou quando quem lê é Lambda ou EC2 (na AWS, S3 → CloudFront e S3 → mesma região é US$ 0) | `kinds/object-storage.ts:29` | segmentos de vídeo | US$ 3.054 | ≈ US$ 26 |
| 3 | O CloudFront cobra upload (escrita) como saída para a internet, a US$ 0,085, e não como transferência para a origem, a US$ 0,020 | `kinds/cdn.ts:14` | uploads de 2 MB a 50 req/s | US$ 26.553 | ≈ US$ 8.980 |

Faltam também o armazenamento do S3, do RDS e do Aurora, o I/O do Aurora e as unidades de payload do Kinesis. A solução de referência de vídeo sob demanda sai por US$ 63 mil quando deveria sair por ≈ US$ 32 mil, o que também distorce o score, porque ele compara o custo da pessoa com o da referência.

O "US$ 20 mil numa arquitetura simples" é, em boa parte, verdade: 2.000 req/s num serviço cobrado por requisição (API Gateway REST) custam ≈ US$ 13 mil por mês. Com as faixas, o total cai de US$ 23,8 mil para US$ 18,6 mil.

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1. O custo bate com a conta da AWS | Cenários da auditoria: diferença entre o app e a conta à mão | ≤ 1% | Testes com os números da auditoria |
| G2. Nenhuma dimensão cobrada a mais | Saída do S3 cobrada só da parte que vai à internet; upload do CloudFront a US$ 0,020 | 100% | Testes |
| G3. Nenhuma dimensão relevante esquecida | Armazenamento do S3, do RDS e do Aurora, I/O do Aurora e payload do Kinesis cobrados | 5 de 5 | Testes |

**Non-goals**:
- Camada gratuita: é por conta, temporária, e irrelevante nas cargas dos problemas.
- Tráfego entre zonas de disponibilidade: o simulador não modela AZs.
- Savings Plans e reservas.
- Saída para a internet a partir de EC2 ou ALB: seria uma dimensão nova sobre payload de resposta que o modelo não tem. Fica registrada como limitação.

## 4. Users & Personas
A pessoa que compara o custo do próprio desenho com o da referência para aprender o trade-off de custo.

## 5. User Stories
- **US-1**: Como pessoa praticando, quero que o custo mensal reflita o que a AWS cobraria, para que a comparação e o score façam sentido.

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | Um preço pode ter faixas de volume (limite superior acumulado na unidade do preço e preço da faixa). O custo de uma dimensão em faixas soma cada faixa sobre o volume que cai nela. | Must | US-1 | Teste: API Gateway REST a 26,28 bi de requisições/mês = 333M × 3,50 + 667M × 2,80 + 19B × 2,38 + 6,28B × 1,51, em milhões → US$ 57.736 (±1%). |
| FR-2 | Faixas no catálogo, com os valores da AWS Price List API para us-east-1: API Gateway REST (3,50/2,80/2,38/1,51, com limites em 333M/1B/20B); HTTP (1,00/0,90, limite em 300M); CloudFront para a internet (0,085/0,080/0,060/0,040/0,030/0,025/0,020, limites em 10 TB/50 TB/150 TB/500 TB/1.024 TB/5.120 TB); S3 para a internet (0,09/0,085/0,07/0,05, limites em 10/50/150 TB); armazenamento S3 (0,023/0,022/0,021, limites em 50/500 TB). | Must | US-1 | Teste do catálogo com cada faixa. |
| FR-3 | O S3 cobra saída para a internet só sobre a parte das leituras que chega direto do nó Usuários. Leituras vindas do CloudFront, de Lambda, de EC2 ou de qualquer outro nó não pagam transferência. | Must | US-1 | Testes: Usuários → S3 paga; Usuários → CloudFront → S3 não paga saída no S3; metade direta e metade via Lambda paga metade. |
| FR-4 | O CloudFront cobra as escritas que passam por ele como transferência para a origem (US$ 0,020/GB), e só as leituras como saída para a internet. | Must | US-1 | Teste: uploads de 2 MB a 50 req/s → a origem cobra 50 × 2.048 KB × 2.628.000 / 1e6 GB × 0,020. |
| FR-5 | S3: parâmetro "Dados armazenados (GB)", padrão 100, cobrado a 0,023 por GB-mês, com faixas. | Must | US-1 | Teste. |
| FR-6 | RDS PostgreSQL: parâmetro "Armazenamento (GB)", padrão 20 (o mínimo do RDS), a 0,115 por GB-mês (gp3), cobrado no primário e em cada réplica de leitura. | Must | US-1 | Teste: 100 GB com 2 réplicas → 3 × 100 × 0,115. |
| FR-7 | Aurora PostgreSQL (Standard): parâmetro "Dados armazenados (GB)", padrão 10, a 0,10 por GB-mês, cobrado uma vez (o volume do cluster é compartilhado), mais I/O a 0,20 por milhão. Premissa: cada escrita gera ⌈payload/4 KB⌉ I/Os, e as leituras saem do cache de buffer (0 I/O). A premissa fica documentada. | Must | US-1 | Teste: 1.000 escritas/s de 1 KB → 2,628 bi de I/Os → US$ 525,60. |
| FR-8 | Kinesis: unidades de payload de PUT a 0,014 por milhão, com cada registro contando ⌈payload/25 KB⌉ unidades. | Must | US-1 | Teste. |
| FR-9 | A versão do catálogo sobe, e os JSON Schemas exportados são regenerados. Diagramas antigos continuam válidos, porque os parâmetros novos são opcionais e têm padrão. | Must | US-1 | O teste da versão é atualizado; um diagrama da versão anterior continua válido. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Accuracy | Cada preço novo cita a fonte oficial e a data. | Teste do catálogo, que já exige `sourceUrl` e `priceDate`. |
| NFR-2 | Performance | O cálculo com faixas não pesa no tick. | `perf.spec` ≥ 50 fps. |

## 9. Out of Scope
Ver os Non-goals. A saída da EC2 e do ALB para a internet entra no README como limitação conhecida.

## 10. Definition of Done
- [ ] Todo Must com teste; os cenários da auditoria batem com a conta à mão (≤ 1%).
- [ ] O custo das 10 referências é recalculado e registrado no PR, com o de vídeo sob demanda caindo para ≈ US$ 32 mil.
- [ ] `pnpm lint/typecheck/test/test:e2e/audit` verdes.

## 11. Technical Context
- **Preços:** `packages/catalog/src/schema.ts` (`Price`, `PriceUnit`) e `catalog.json`.
- **Cálculo:**
  - `packages/sim-engine/src/queueing.ts` (`monthlyCost`, `requestsMillionsPerMonth`);
  - `kinds/object-storage.ts`, `cdn.ts`, `api-gateway.ts`, `sql-database.ts`, `stream.ts`, `shared.ts` (`gbMonth`);
  - `step.ts` (a montagem da entrada de cada nó, em ordem topológica, `:208-230`);
  - `kinds/context.ts` e `types.ts` (`NodeContext`).
- **Valores:** todos da AWS Price List API (`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<Serviço>/current/us-east-1/index.json`), consultada em 2026-11-15. As faixas do CloudFront também estão na página https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/.

## 12. Security & Compliance
| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | No | — | N/A: só cálculo local. |
| A02 | Security Misconfiguration | No | — | N/A. |
| A03 | Software Supply Chain Failures | No | — | N/A: sem dependência. |
| A04 | Cryptographic Failures | No | — | N/A. |
| A05 | Injection | No | — | N/A. |
| A06 | Insecure Design | Yes | As faixas são validadas no schema: limites crescentes, a última sem limite, preços não negativos. Um catálogo malformado não carrega. | Teste de schema. |
| A07 | Authentication Failures | No | — | N/A. |
| A08 | Software or Data Integrity Failures | Yes | O catálogo continua validado ao carregar; diagramas antigos seguem válidos. | Testes. |
| A09 | Security Logging and Alerting Failures | No | — | N/A. |
| A10 | Mishandling of Exceptional Conditions | Yes | Volume zero → custo zero; volume dentro da 1ª faixa → o mesmo de antes. | Testes. |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| As faixas valem por nó, não somadas na conta inteira | O simulador não tem conta; somar entre nós seria arbitrário | Documentado no README |
| Aurora: I/O só nas escritas | As leituras de um working set em cache não vão ao storage | Premissa no README; ajustável |
| A saída do S3 para Lambda, EC2 e outros serviços na mesma região é grátis | Price List: `S3-DT-AWS Outbound` US$ 0,00 | — |

## 16. Open Questions
None.

## 18. Verification
`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit`, mais o custo das 10 referências pela CLI, antes e depois.

## 19. Release Plan
Branch `fix/cost-model` a partir de `master`; single release; sem flag. Os scores mudam onde o custo mudou, porque o custo da referência entra no score (o recorde antigo continua gravado como foi calculado). Rollback = reverter o merge.

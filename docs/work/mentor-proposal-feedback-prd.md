# PRD: O mentor sabe quando a proposta foi recusada, e a pessoa vê o motivo

**Source**: `conversation` — o aviso "O mentor propôs uma mudança que o simulador não aceita; peça de outro jeito." apareceu ao pedir "faz aí como você faria essa arquitetura", enquanto o mentor dizia "Montei a proposta… aparece num card"; e a resposta da pessoa, "Sim, com auto-approve", para corrigir os três pontos · **Type**: bugfix · **Status**: READY · **Approval**: skipped (--auto) · **Standards**: owasp-top10-2025 · **Date**: 2026-11-15

## 1. Overview
No modo estudo, quando o servidor recusa uma proposta do mentor, acontecem três coisas ruins:
- a pessoa vê só uma frase genérica, sem o motivo;
- no provedor de assinatura, o mentor não fica sabendo da recusa e afirma que "aparece num card" que não existe;
- uma recusa por um detalhe inofensivo (pedir uma conexão que já existe) derruba a proposta inteira.

Este bugfix mostra o motivo e faz o mentor receber a recusa nos dois provedores, para corrigir a proposta na mesma resposta. Conectar o que já está conectado passa a contar como feito.

## 2. Problem
Evidência em `practice/mentor-url-shortener.json` (2026-11-14 23:15):
- A pessoa pediu "faz aí como você faria essa arquitetura". O mentor propôs 5 mudanças, entre elas "Nova conexão n3 → n5". O servidor recusou a proposta, e o texto continuou dizendo "Montei a proposta. Ela aparece num card…".
- O motivo não foi registrado: o log só conta `rejeitadas=1`, e a UI descarta o `reason` do evento (`apps/app/src/practice/ChatPanel.tsx`, `setRejected(true)`).
- Reconstruindo o desenho pela conversa, a causa provável é a conexão API → banco **já existir**, porque `applyProposal` recusa "já está conectado" (`apps/app/src/store/proposal.ts`, `connect`). **Isto é inferência**, não está registrado.
- O mentor do `claude -p` sempre recebe "Proposta registrada" do servidor MCP (`apps/app/server/mentor/mcp-server.ts`), achado L aberto no PR #5. Só o provedor da API devolvia a recusa (`is_error`).

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1. A pessoa entende por que não veio card | Avisos de recusa que mostram o motivo do simulador | 100% | Teste de UI (FR-1) |
| G2. O mentor nunca afirma um card que não existe | Respostas com recusa em que o mentor recebeu o motivo antes de fechar o texto, nos dois provedores | 100% | Testes dos provedores (FR-2, FR-3); roteiro §18 |
| G3. Uma recusa vira correção, não beco sem saída | Pedidos do roteiro §18 com recusa inicial que terminam num card válido na mesma resposta | ≥ 1 de 2 | Roteiro §18 com a assinatura real |
| G4. Detalhes inofensivos não derrubam a proposta | Propostas recusadas só por conexão já existente | 0 | Teste (FR-4) |

**Non-goals**: mudar o alcance das operações; aceitar outras operações inválidas; registrar no log o texto da proposta.

## 4. Users & Personas
A mesma pessoa do modo estudo, que pede ao mentor para montar ou ajustar o desenho.

## 5. User Stories
- **US-1**: Como pessoa estudando, quero ver por que a proposta do mentor foi recusada, para pedir de outro jeito.
- **US-2**: Como pessoa estudando, quero que o mentor saiba quando a proposta dele não passou e a corrija sozinho, para não ouvir "está no card" quando não está.

## 6. User Flows
1. A pessoa pede uma mudança. O mentor chama `propor_mudancas`.
2. A proposta é validada **antes** de o mentor receber a resposta da ferramenta, nos dois provedores.
   - Válida → a ferramenta responde "registrada", e o card aparece.
   - Inválida → a ferramenta responde com erro e o motivo ("o nó n9 não está no desenho", "serviço desconhecido: aws.x"…). O mentor pode chamar a ferramenta de novo, corrigida, na mesma resposta, ou explicar à pessoa que não deu.
3. Se nenhuma proposta da resposta passar, o chat mostra o aviso **com o motivo** da última recusa.
4. Conectar dois nós que já estão conectados não é erro: a operação conta como feita.

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | O aviso de recusa mostra o motivo que o servidor enviou. | Must | US-1 | Teste de UI: evento `proposal_rejected` com motivo "serviço desconhecido: aws.x" → o aviso contém esse texto. |
| FR-2 | No provedor de assinatura, a ferramenta MCP valida a proposta com o servidor (a mesma validação da rota) antes de responder ao modelo. Inválida → resposta de erro com o motivo. | Must | US-2 | Teste: o servidor MCP gerado, com um validador que recusa, responde `isError: true` com o motivo; com um que aceita, responde o texto de sucesso. |
| FR-3 | Nos dois provedores, uma 2ª chamada da ferramenta na mesma resposta (a correção) é considerada. Vale a primeira proposta válida. | Must | US-2 | Testes: na API, recusa na rodada 1 e correção na rodada 2 → `proposal` com a correção e o texto final; na rota, recusada + válida → card da válida, sem aviso. |
| FR-4 | `connect` entre nós já conectados (mesma origem e destino) é ignorado sem erro. | Must | US-1 | Teste de `applyProposal`: proposta com uma conexão existente + outra mudança → ok, sem aresta duplicada, e a outra mudança aplicada. |
| FR-5 | O prompt diz ao mentor o que fazer com uma recusa: corrigir e propor de novo, ou explicar; nunca afirmar um card sem resposta de sucesso da ferramenta. | Should | US-2 | Revisão do prompt; roteiro §18. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Reliability | Se o canal de validação do MCP falhar (servidor fora, timeout de 5 s), a ferramenta responde erro "não consegui validar", e a resposta continua. | Teste: validador ausente → `isError` com essa mensagem, e o processo não trava. |
| NFR-2 | Limits | No máximo 3 chamadas da ferramenta por resposta. A partir da 4ª, a resposta é "limite de propostas nesta resposta". | Teste no provedor da API e no MCP. |

## 9. Out of Scope
- Desfazer pelo card depois de recarregar (achado L8 do PR #5).
- Reduzir latência ou tokens (achado Medium do PR #5).

## 10. Definition of Done
- [ ] Todo requisito Must atende ao seu critério de aceite
- [ ] Roteiro §18 com a assinatura real, registrado no PR
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm audit` passam

## 11. Technical Context
**Stack & areas affected**:
- `apps/app/server/mentor/cli-provider.ts`, `mcp-server.ts`, `api-provider.ts`, `chat-route.ts`, `prompt.ts`;
- `apps/app/src/store/proposal.ts`;
- `apps/app/src/practice/ChatPanel.tsx`.

**Conventions**:
- A validação existente é `input.check` (`apps/app/server/mentor/provider.ts`, `ProviderInput.check`), que a rota monta com `validateProposal` (`chat-route.ts`). O provedor da API já a usa para o `is_error` (`api-provider.ts`, rodada 2).
- O diretório privado do provedor de assinatura (mkdtemp 0700, `cli-provider.ts` `workDir`) já guarda o prompt e o script MCP de cada resposta, e os remove no `finally`.
- Os testes do MCP spawnam o script de verdade (`providers.test.ts`, "the MCP server answers…").

**Data & contracts**: nenhum contrato muda. O evento `proposal_rejected` já tem `reason`.

**Constraints**:
- O canal entre o processo MCP e o servidor é **local e privado**: nada de porta TCP nova, nada de rota HTTP nova.
- A validação é a mesma da rota.

**Dependencies**: None.

## 12. Security & Compliance

### OWASP Top 10:2025
| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes | O canal de validação é um socket de domínio Unix (ou named pipe) dentro do diretório privado 0700, criado por resposta e fechado no `finally`. Nada escuta em porta de rede, e nenhuma rota HTTP nova existe. O canal só valida, nunca aplica ou grava. | Teste: o caminho do socket está dentro do diretório privado; depois da resposta, o socket não existe; o canal não muda a conversa nem o desenho. |
| A02 | Security Misconfiguration | Yes | As flags do `claude` continuam com só `mcp__archsim__propor_mudancas` liberada. | Teste existente de `cliArgs`. |
| A03 | Software Supply Chain Failures | No | — | N/A: sem dependência nova (`node:net`). |
| A04 | Cryptographic Failures | No | — | N/A: sem segredos. |
| A05 | Injection | Yes | O motivo mostrado na UI é texto gerado pelo servidor, com até 200 caracteres, renderizado como texto (React). O motivo que vai ao modelo é o mesmo. | Teste de UI: motivo com `<b>` aparece como texto. |
| A06 | Insecure Design | Yes | O limite de 3 chamadas da ferramenta por resposta (NFR-2) impede que o modelo vire um laço de validação. | Testes do NFR-2. |
| A07 | Authentication Failures | No | — | N/A. |
| A08 | Software or Data Integrity Failures | Yes | A rota continua validando cada proposta que chega pelo stream, mesmo que o MCP já tenha validado. O MCP é uma ajuda ao modelo, não a autoridade. | Teste: proposta inválida que chega pelo stream é recusada pela rota independente do MCP. |
| A09 | Security Logging and Alerting Failures | Yes | O log continua só com contagens; o motivo não vai ao log. | Teste existente do log sem texto. |
| A10 | Mishandling of Exceptional Conditions | Yes | Uma falha ou timeout do canal vira erro na ferramenta, e a resposta segue (NFR-1). | Teste do NFR-1. |

**Existing controls at risk**: o provedor de assinatura ganha um socket local. Ele fica dentro do diretório que já é 0700 e só vive durante a resposta.
**Secrets / PII touched**: None.

## 13. Do / Don't
- Do: validar no MCP com a **mesma** função da rota (`input.check`).
- Don't: abrir porta TCP ou rota HTTP para o MCP — seria uma superfície nova acessível pelo navegador.

## 14. Risks & Caveats
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| O caminho do socket passa do limite do macOS (~104 caracteres) | Medium | High | Nome curto (`c-<8 hex>.sock`) no diretório privado; um teste mede o caminho real |
| O modelo insiste em propostas inválidas | Low | Low | Limite de 3 chamadas; a última recusa vira aviso com o motivo |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| A causa do episódio foi uma conexão já existente | Reconstrução do desenho pela conversa; o motivo não foi gravado | Os FR-1 a FR-3 resolvem qualquer outra causa: o motivo aparece e o mentor se corrige |
| `--max-turns` sobe para 5 (até 3 chamadas + texto final) | NFR-2 | Ajustar a constante |

## 16. Open Questions
None.

## 17. Tests
Cada critério de aceite dos §7 e §8 e cada linha "How it's tested" do §12. É preciso um teste que spawna o MCP gerado com um socket de validação dublado.

## 18. Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit
```
Com a assinatura real (preview em 4173, prática em diretório temporário), no `url-shortener` em estudo, com um desenho em que a API já está ligada ao banco:
1. "Conecta a API no banco e sobe a API para 25 réplicas" → card aplicável (FR-4).
2. "Adiciona um serviço aws.mongodb na frente do banco" → o mentor recebe a recusa e corrige (por exemplo, para DynamoDB) ou explica, sem afirmar card. Se não houver card, o aviso mostra o motivo.
3. "Faz aí como você faria essa arquitetura" → card aplicável.

## 19. Release Plan
- **Branch**: `fix/mentor-proposal-feedback`, a partir de `master`.
- **Milestones**: single release. **Migrations**: none. **Config**: none. **Flag**: none.
- **Rollout**: tudo de uma vez. **Rollback**: reverter o merge; nenhum dado novo.
- **Post-launch**: roteiro §18 no PR.

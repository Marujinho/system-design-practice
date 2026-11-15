# Plan: O mentor sabe quando a proposta foi recusada, e a pessoa vê o motivo

**PRD**: `docs/work/mentor-proposal-feedback-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-15

## Approach
A rota já tem a validação completa (`validateProposal`, exposta aos provedores como `ProviderInput.check`), e a API já a usa para responder com `is_error`. O que falta, por provedor:
- **Assinatura:** o processo MCP, que é quem responde ao modelo, não tem como chamar essa função. O provedor de assinatura passa a abrir, por resposta, um **socket de domínio Unix** no próprio diretório privado (0700). O script MCP gerado recebe o caminho e, em `tools/call`, manda a proposta por ali e espera `{ ok, reason }` (timeout de 5 s). Com `ok`, responde sucesso; senão, `isError: true` com o motivo. O socket é fechado e removido no `finally`.
- **API:** o laço de rodadas passa a aceitar até 3 chamadas da ferramenta, e a proposta de qualquer rodada é emitida (hoje só a da 1ª).
- **Rota:** sem mudança. Ela já fica com a primeira proposta válida e recusa as outras.
- **UI:** o aviso usa o `reason` do evento.
- **`applyProposal`:** `connect` existente vira no-op.
- **Prompt:** diz o que fazer com uma recusa.

**Alternativas que perderam**
- **Rota HTTP de validação chamada pelo MCP:** seria uma superfície nova no servidor, que o navegador alcança, com token para gerenciar.
- **Validar dentro do processo MCP:** exigiria levar catálogo, motor e diagrama para o script gerado, duplicando a autoridade.
- **Só reforçar o prompt:** não dá ao modelo o motivo.

## Decisions
| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Canal MCP → servidor | Socket Unix `c-<8 hex>.sock` no diretório privado, um por resposta | Porta TCP em loopback, rota HTTP | Fica dentro do 0700, nada exposto ao navegador | Assumed |
| Protocolo do canal | Uma linha JSON por pedido: `{"input": …}` → `{"ok": true}` / `{"ok": false, "reason": "…"}` | — | Simples; o socket só valida | Assumed |
| Limite | 3 chamadas da ferramenta por resposta: o MCP conta e responde "limite de propostas nesta resposta" na 4ª; a API para em 3 rodadas com ferramenta + 1 de texto; `--max-turns 5` | — | PRD NFR-2 | PRD |
| `connect` existente | No-op silencioso | Erro, aviso | PRD FR-4 | PRD |

## Critical files
| File | Role |
|---|---|
| `apps/app/server/mentor/mcp-server.ts` | O script gerado ganha a chamada ao socket |
| `apps/app/server/mentor/cli-provider.ts` | Abre e fecha o socket; passa o caminho ao script; `--max-turns` |
| `apps/app/server/mentor/api-provider.ts` | O laço de rodadas |
| `apps/app/src/store/proposal.ts` | `connect` idempotente |
| `apps/app/src/practice/ChatPanel.tsx` | O motivo no aviso |

## Tasks

### T1 — Conectar o que já está conectado conta como feito
- **Covers**: FR-4
- **Files**: `apps/app/src/store/proposal.ts`, `apps/app/src/store/proposal.test.ts`
- **Mirror**: o `connect` atual (`proposal.ts`)
- **Do**: no `connect`, se já houver uma aresta `from → to`, não faz nada (o laço e a entrada em Usuários continuam recusados).
- **Tests**: uma conexão existente + `set_prop` → ok, sem aresta nova, prop aplicada.
- **Check**: `pnpm --filter @archsim/app test -- proposal`
- **Depends on**: —

### T2 — O aviso mostra o motivo
- **Covers**: FR-1, A05
- **Files**: `apps/app/src/practice/ChatPanel.tsx`, `apps/app/src/practice/chat.test.tsx`
- **Mirror**: o estado `rejected` atual
- **Do**: `rejected: string | null`, com o `reason` do último `proposal_rejected`; o aviso vira "O mentor propôs uma mudança que o simulador não aceita: {motivo}. Peça de outro jeito."
- **Tests**: o motivo aparece; um motivo com `<b>` aparece como texto; continua escondido quando uma proposta da resposta passou.
- **Check**: `pnpm --filter @archsim/app test -- chat`
- **Depends on**: —

### T3 — O MCP valida pelo socket antes de responder ao modelo
- **Covers**: FR-2, NFR-1, NFR-2 (MCP), A01, A08, A10
- **Files**: `apps/app/server/mentor/mcp-server.ts`, `apps/app/server/mentor/cli-provider.ts`, `apps/app/server/mentor/providers.test.ts`
- **Mirror**: a geração do script e os testes que o spawnam (`providers.test.ts`); o diretório privado e a limpeza do `finally` (`cli-provider.ts`)
- **Do**:
  1. `mcpServerSource(schema, socketPath)`: em `tools/call` de `propor_mudancas`, conta as chamadas e, a partir da 4ª, responde `isError` "limite de propostas nesta resposta". Senão, faz `net.connect(socketPath)`, escreve `{"input": arguments}\n` e espera uma linha (timeout de 5 s). `ok` → texto de sucesso; senão, `isError: true` com `TOOL_REJECTED + reason`; falha ou timeout → `isError` "não consegui validar a proposta".
  2. `cli-provider.stream`: antes de gerar o script, `net.createServer` em `join(cwd, 'c-' + 8hex + '.sock')`, que responde a cada linha com `input.check?.(input) ?? null`. Sem `check` → `{ok: true}`. O servidor é fechado e o arquivo do socket removido no `finally`. `--max-turns 5`.
- **Tests**:
  - o MCP gerado com um socket dublado que recusa → `isError` com o motivo; que aceita → o texto de sucesso;
  - socket ausente → `isError` "não consegui validar";
  - 4ª chamada → limite;
  - `cli-provider` com `spawn` dublado: o socket existe durante a resposta, dentro do diretório privado, com o caminho abaixo de 100 caracteres, e some depois;
  - pelo socket, `check` é chamado com o input.
- **Check**: `pnpm vitest run apps/app/server/mentor`
- **Depends on**: —

### T4 — A API aceita a correção numa rodada seguinte
- **Covers**: FR-3, NFR-2 (API)
- **Files**: `apps/app/server/mentor/api-provider.ts`, `apps/app/server/mentor/providers.test.ts`, `apps/app/server/chat.test.ts`
- **Mirror**: o laço de rodadas atual
- **Do**: até 4 rodadas, emitindo `proposal` em qualquer uma. Encerra quando `stop_reason !== 'tool_use'`. Na 4ª rodada não há mais `tool_result`: ela é a última, de texto.
- **Tests**:
  - API: rodada 1 recusada (`check` recusa a 1ª), rodada 2 corrigida, rodada 3 de texto → 2 `proposal` emitidas, 3 chamadas, o 2º `tool_result` de sucesso;
  - rota: provedor que emite uma proposta inválida e depois uma válida → evento `proposal` da válida, gravada, e `proposal_rejected` antes.
- **Check**: `pnpm vitest run apps/app/server`
- **Depends on**: —

### T5 — O prompt diz o que fazer com uma recusa
- **Covers**: FR-5
- **Files**: `apps/app/server/mentor/prompt.ts`, `apps/app/server/mentor/context.test.ts`
- **Do**: "Se a ferramenta responder erro, a proposta não virou card: corrija conforme o motivo e chame de novo (até 3 vezes), ou explique à pessoa por que não dá."
- **Tests**: o prompt contém a instrução.
- **Check**: `pnpm vitest run apps/app/server/mentor/context.test.ts`
- **Depends on**: —

## Coverage
| PRD item | Task |
|---|---|
| FR-1 | T2 |
| FR-2 | T3 |
| FR-3 | T4 |
| FR-4 | T1 |
| FR-5 | T5 |
| NFR-1 | T3 |
| NFR-2 | T3, T4 |
| A01, A10 | T3 |
| A05 | T2 |
| A06 | T3, T4 |
| A08 | T3 (a rota segue validando), T4 |
| A09 | sem mudança (teste existente) |

## Risks
| Risk | Where it bites | What to do if it does |
|---|---|---|
| O caminho do socket passa do limite | T3 | Nome curto; um teste mede; se precisar, `os.tmpdir()` + nome curto 0600 |
| O `claude` trata `isError` de um jeito inesperado | Verificação real | Testar com o `claude` real antes de fechar |

## Verification
Os comandos do PRD §18 e o roteiro com a assinatura real (os 3 pedidos), no preview com um diretório de prática temporário.

## Implementation

**Branch**: `fix/mentor-proposal-feedback` · **Base**: `master` · **Date**: 2026-11-15

| Task | Commit | Check | Lint / Types / Tests |
|---|---|---|---|
| T1 | `33a8c86` | ✅ | ✅ ✅ ✅ (706) |
| T2 | `2283313` | ✅ | ✅ ✅ ✅ (706) |
| T3 | `2ac7b19` | ✅ (+ smoke com o `claude` real) | ✅ ✅ ✅ (710) |
| T4 | `228be49` | ✅ | ✅ ✅ ✅ (713) |
| T5 | `d99a268` | ✅ | ✅ ✅ ✅ (713) |

Baseline: 705 testes unitários e 62 e2e. No fim: 713 unitários e 62 e2e, verdes. `pnpm audit` limpo, nenhuma dependência nova.

### Deviations
- **T1** — saiu a asserção antiga que esperava erro ao conectar Usuários → ALB de novo. Era o comportamento que o FR-4 muda.
- **T2** — o primeiro commit foi sem o teste novo, porque a edição do teste não casou o texto. Corrigido com `--amend` antes do push.
- **T3** — `fakeChild` foi para o nível do módulo nos testes, para os dois blocos usarem.

### Definition of Done
- [x] Todo requisito Must atende ao seu critério de aceite: FR-1 a FR-4 com testes, FR-5 no prompt e testado.
- [x] Roteiro §18 com a assinatura real (preview, diretório temporário, navegador):
  - "Conecta a API no banco e sobe para 25" → card aplicado (o mentor anotou que a conexão já existia);
  - `aws.mongodb` → sem card e sem afirmação falsa, com o motivo e a alternativa;
  - "Faz aí como você faria essa arquitetura" → card com 6 operações, aplicado.
  - Smoke de recusa pelo socket: o `claude` recebeu o motivo e disse que não havia card.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` (713), `pnpm test:e2e` (62) e `pnpm audit` passam.

### Verification
- O log das 3 respostas reais: `propostas=1/0/1 rejeitadas=0`.
- O tempo até o primeiro token foi de 12,8 s, 3,2 s e 24,1 s. O de 24 s foi a resposta grande, com 6 operações. O achado de latência do PR #5 continua aberto.

### Inherited failures
Nenhuma.

### Review fixes
A revisão independente das partes de socket, script gerado e laço da API não achou nada Critical nem High. Foram corrigidos:
- **M1:** a API passou a parar em 3 chamadas, como o MCP.
- **M2:** a verificação da rota virou a decisão única sobre a proposta da resposta.
- **L3:** o buffer do socket ganhou limite e o UTF-8 passou a ser lido inteiro.
- **L5:** uma proposta que não muda nada passou a ser recusada.
- **L6:** o aviso de recusa não fica velho depois de uma interrupção.

Em aberto (Low):
- **L4:** com um `TMPDIR` muito longo, o socket não abre, e o mentor de assinatura responde só "erro desconhecido".

716 testes unitários e 62 e2e verdes.

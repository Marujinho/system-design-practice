# PRD: Ergonomia do canvas — remover conexão pelo "×" e painéis recolhíveis

**Source**: `conversation` — (1) "adiciona a funcionalidade de eu poder desvincular, porque eu tenho um nodezinho, aí quando eu boto o mouse em cima, deveria aparecer um xizinho, eu deveria poder desfazer aquela conexão." (2) "A tela em si está muito pequena. Todas as informações que tem ao redor, elas têm que ser colapsável. Põe isso aí nessa PRD também." · **Type**: feature · **Status**: READY · **Approval**: 2026-11-13 · **Standards**: owasp-top10-2025 · **Date**: 2026-11-13

> São duas features independentes, juntas num PRD só a pedido do usuário. Parte A: remover uma conexão. Parte B: recolher os painéis. Elas não dependem uma da outra; o plano pode ordená-las como quiser, e qualquer uma pode ser revertida sozinha.

## 1. Overview
Duas melhorias no espaço de trabalho do ArchSim. **A** — passar o mouse sobre uma conexão mostra um "×" no meio dela, e clicar remove só aquela conexão. Hoje isso exige selecionar uma linha de 1 px e apertar Delete. **B** — cada painel em volta do canvas pode ser recolhido para que o canvas ocupe a tela: paleta, painel lateral, barra de cima (enunciado + carga) e barra global de métricas.

## 2. Problem
**A.** Para remover uma conexão, é preciso acertar o clique numa linha de 1 px (`--xy-edge-stroke-width: 1`, `apps/app/src/canvas/canvas.css:104`) e saber que Delete/Backspace funciona (`apps/app/src/canvas/Canvas.tsx:151`). Nada na tela indica isso. Quem erra uma conexão acaba apagando um nó ou usando Cmd+Z, e os dois desfazem mais do que a pessoa queria.

**B.** O canvas fica no meio de uma grade fixa `200px | 1fr | 320px` (`apps/app/src/canvas/canvas.css:10`), abaixo de uma barra de cima que, no modo problema, junta o enunciado (até `30vh`, `apps/app/src/practice/practice.css:66`) e o painel de carga (`apps/app/src/practice/ProblemView.tsx:128-133`). Numa tela de 1440×900 com o enunciado aberto, sobram ~920 px de largura e menos de 60% da altura para o desenho. Hoje só o corpo do enunciado recolhe (`ProblemView.tsx:21-40`), e esse estado se perde ao recarregar. Evidência: o pedido do usuário ("a tela em si está muito pequena").

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1 (A): Remover uma conexão sem atalho escondido | Gestos para remover uma conexão | 2 (hover + clique), sem teclado | e2e: hover na conexão, clicar no "×", contar as conexões |
| G2 (A): Remover só o que a pessoa apontou | Nós, outras conexões e seleção afetados | 0 | Teste do store e e2e |
| G3 (A): A remoção pode ser desfeita | Cmd/Ctrl+Z traz a conexão de volta | 100%, com o mesmo protocolo, peso e classes | Teste do store |
| G4 (B): Dar ao canvas a tela quase inteira | Área do `.canvas` ÷ viewport, com tudo recolhido, em 1440×900 | ≥ 90% | e2e mede `getBoundingClientRect()` do `.canvas` antes e depois |
| G5 (B): O layout escolhido continua ao recarregar | Estado de cada painel depois de recarregar | igual ao de antes | e2e: recolher, recarregar, conferir |

**Non-goals**: redimensionar painéis arrastando a borda; mudar o conteúdo de qualquer painel; layout para celular; mudar o fluxo atual de seleção + Delete; pedir confirmação ao remover.

## 4. Users & Personas
Quem desenha no ArchSim, no canvas livre (`apps/app/src/App.tsx:53`) ou num problema de prática (`ProblemView.tsx:125`), muitas vezes num notebook. Com isso, a pessoa pode tirar uma conexão errada com um clique e trabalhar com o canvas ocupando a tela, abrindo cada painel só quando precisa.

## 5. User Stories
- **US-1** (A): Como pessoa desenhando, quero ver um "×" ao passar o mouse numa conexão, para saber que posso removê-la.
- **US-2** (A): Como pessoa desenhando, quero clicar no "×" e remover só aquela conexão, sem afetar nós, outras conexões ou o que eu tinha selecionado.
- **US-3** (A): Como pessoa desenhando, quero desfazer a remoção com Cmd/Ctrl+Z.
- **US-4** (A): Como pessoa usando só o teclado, quero acionar o "×" de uma conexão.
- **US-5** (B): Como pessoa desenhando numa tela pequena, quero recolher a paleta, o painel lateral, a barra de cima e a barra de métricas, para o canvas ocupar o espaço.
- **US-6** (B): Como pessoa que recolheu painéis, quero reabri-los com um clique a partir de uma faixa que continua visível, para não perder o caminho de volta.
- **US-7** (B): Como pessoa que voltou ao app, quero encontrar os painéis como deixei.
- **US-8** (B): Como pessoa usando só o teclado, quero recolher e expandir cada painel.

## 6. User Flows
**A — fluxo principal**: o cursor entra na conexão → o "×" aparece no meio da curva → clique → a conexão some, e a simulação e a avaliação recalculam como em qualquer mudança no diagrama.
- O cursor sai da conexão e do botão → o "×" some.
- Conexão com legenda ou aviso → o "×" aparece junto, sem cobrir o aviso.
- Conexão selecionada → o "×" continua visível (é o acesso por teclado e por toque). Tab chega ao botão; Enter ou Espaço remove.
- Cmd/Ctrl+Z → volta. Cmd/Ctrl+Shift+Z → some de novo.
- Erro: a conexão já não existe quando o clique chega → nada acontece.

**B — fluxo principal**: cada painel tem um botão de recolher no cabeçalho (paleta e lateral: um chevron na borda que encosta no canvas; barra de cima e barra de métricas: um botão no canto). Clique → o painel vira uma faixa estreita (≤ 32 px) com o botão de expandir e o nome do painel → o canvas cresce no lugar, e o viewport do React Flow se ajusta sem perder zoom nem posição → clique na faixa → o painel volta como estava (mesma aba, mesmo scroll de conteúdo quando possível).
- Painel lateral recolhido + clique num nó → o painel **não** abre sozinho. O nó aparece selecionado no canvas, e a faixa do painel lateral mostra um indicador de que tem algo para ver.
- Modo problema → o mesmo botão recolhe a barra de cima inteira (enunciado + carga). O "esconder enunciado" de hoje continua só para o corpo do enunciado.
- Recarregar ou voltar ao app → cada painel abre no estado em que foi deixado.
- Armazenamento do navegador indisponível → tudo abre expandido, como hoje, sem erro.

**Estados (B)**: expandido (padrão), recolhido (faixa).

## 7. Functional Requirements
### Parte A — remover conexão
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | Passar o mouse sobre uma conexão deve mostrar um botão "×" no ponto do meio da curva. Tirar o mouse da conexão e do botão esconde o botão. | Must | US-1 | Given A → B, When o cursor entra na conexão, Then o botão "Remover conexão" fica visível; When o cursor vai até o botão, Then ele continua visível; When o cursor sai dos dois, Then ele some. |
| FR-2 | Clicar no "×" deve remover só aquela conexão. Nós, outras conexões e seleção continuam como estavam (sai da seleção só o id removido). | Must | US-2 | Given A → B, A → C e o nó C selecionado, When o "×" de A → B é clicado, Then sobra só A → C, os 3 nós continuam no canvas e a seleção continua [C]. |
| FR-3 | A remoção vira um passo de undo/redo. | Must | US-3 | Given A → B com gRPC, peso 0,3 e classes ["leitura"], When remove e Cmd+Z, Then a conexão volta idêntica; When Cmd+Shift+Z, Then some de novo. |
| FR-4 | O clique no "×" não seleciona a conexão nem começa pan ou seleção por arraste no canvas. | Must | US-2 | Given nada selecionado, When o "×" é clicado, Then a seleção continua [] e o viewport não se move. |
| FR-5 | O "×" é um `<button>` com nome acessível e alcançável por teclado quando a conexão está selecionada. | Should | US-4 | Given A → B selecionada, When Tab até "Remover conexão" e Enter, Then a conexão some. |
| FR-6 | Remover uma conexão que já não existe não faz nada: sem exceção e sem passo no histórico. | Must | US-3 | Given um id que não existe, When a remoção é pedida, Then o diagrama e o tamanho do histórico não mudam. |
| FR-7 | O "×" convive com a legenda e o aviso da conexão sem cobrir nenhum dos dois. | Should | US-1 | Given S3 → RDS (com aviso), When hover, Then o aviso e o "×" estão visíveis e o tooltip do aviso continua funcionando. |

### Parte B — painéis recolhíveis
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-8 | A paleta (esquerda) pode ser recolhida e expandida. Recolhida, vira uma faixa de ≤ 32 px com o botão "Expandir paleta". | Must | US-5, US-6 | Given o canvas livre, When "Recolher paleta", Then a coluna da paleta mede ≤ 32 px e o `.canvas` ganha a largura liberada; When "Expandir paleta", Then volta a 200 px. |
| FR-9 | O painel lateral (direita — Propriedades no modo livre; Requisitos/Propriedades no modo problema) pode ser recolhido e expandido, e volta na mesma aba. | Must | US-5, US-6 | Given o modo problema na aba Propriedades, When recolhe e expande, Then a aba Propriedades continua ativa; recolhido, a coluna mede ≤ 32 px. |
| FR-10 | A barra de cima (enunciado + carga no modo problema; carga no modo livre) pode ser recolhida numa faixa de uma linha que mostra o título do problema (ou "Carga" no modo livre) e o botão de expandir. | Must | US-5, US-6 | Given um problema aberto, When "Recolher barra superior", Then a barra mede ≤ 32 px de altura, o título do problema continua visível e o `.canvas` ganha a altura liberada. |
| FR-11 | A barra global de métricas (`GlobalBar`, sobreposta ao canvas) pode ser recolhida num botão compacto e expandida de novo. | Should | US-5 | Given a simulação rodando, When "Recolher métricas", Then a barra vira um botão de ≤ 32×32 px e as métricas continuam sendo calculadas; When expande, Then os valores atuais aparecem. |
| FR-12 | Um controle "Focar no canvas" recolhe todos os painéis de uma vez, e outro clique restaura o estado que eles tinham antes. | Could | US-5 | Given paleta aberta e lateral recolhida, When "Focar no canvas", Then tudo recolhe; When clica de novo, Then a paleta abre e a lateral continua recolhida. |
| FR-13 | O estado de cada painel continua ao recarregar e vale para os dois modos (livre e problema). | Should | US-7 | Given a paleta recolhida, When a página recarrega ou outro problema é aberto, Then a paleta continua recolhida. |
| FR-14 | Recolher ou expandir não muda o diagrama, a seleção, a simulação nem o histórico de undo, e não desmonta o estado do painel (aba, campos sendo editados). | Must | US-5 | Given um nó selecionado e a simulação rodando, When recolhe e expande o painel lateral, Then a seleção, o tick da simulação e o tamanho do histórico continuam iguais. |
| FR-15 | Com o painel lateral recolhido, selecionar um nó ou uma conexão não o expande. A faixa mostra um indicador de que há seleção. | Should | US-6 | Given a lateral recolhida, When um nó é clicado, Then a lateral continua recolhida e a faixa tem o indicador com nome acessível "Propriedades — 1 item selecionado". |
| FR-16 | Quando o tamanho do `.canvas` muda por causa de um painel, o canvas mantém o zoom e o ponto do diagrama que estava no canto superior esquerdo. | Should | US-5 | Given zoom 1,5, When recolhe a paleta, Then o zoom continua 1,5 e nenhum nó pula na tela além do deslocamento horizontal da coluna. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Performance | Nenhuma das duas partes pode piorar o canvas fluido do MVP (50 nós, 60 conexões, 1M req/min, p95 ≥ 50 fps). O hover do "×" não re-renderiza o diagrama inteiro, e recolher um painel não reinicia a simulação. | `perf.spec.ts` continua passando. |
| NFR-2 | Accessibility | Todos os botões novos ("Remover conexão", "Recolher/Expandir …") têm nome acessível, `aria-expanded` nos de painel, foco visível com `--focus` e alvo ≥ 16×16 px. Operáveis só pelo teclado (estende o NFR-7 do MVP). | Teste de componente por role/name; `a11y.spec.ts` sem violações novas; `keyboard.spec.ts` ganha o passo recolher → expandir a paleta. |
| NFR-3 | Theming | Cores só pelos tokens de `apps/app/src/theme/tokens.css`, legíveis nos temas claro e escuro. | Checagem visual nos dois temas durante o e2e. |
| NFR-4 | Reduced motion | Animações de recolher ou de aparecer só com `prefers-reduced-motion: no-preference`. | Revisão do CSS. |
| NFR-5 | Reliability | Ler ou gravar o estado dos painéis nunca derruba o app. Sem armazenamento, ou com valor inválido, tudo abre expandido. | Teste com `localStorage` lançando e com valor corrompido, no mesmo padrão de `theme.test.tsx`. |

## 9. Out of Scope
- Redimensionar painéis arrastando — outra feature. Aqui é só aberto ou recolhido.
- Layout responsivo para celular — o MVP é para desktop.
- Arrastar a ponta de uma conexão para reconectar, ou menu de contexto — não foi pedido.
- "×" nos nós — o pedido é sobre conexões. Nós já saem com Delete.
- Modais `ResultScreen` e `SolutionView` — são sobreposições temporárias, não painéis em volta do canvas.
- MiniMap e Controls do React Flow — ficam dentro do canvas e já são pequenos. Se ainda atrapalharem, é um follow-up.

## 10. Definition of Done
- [ ] Todos os requisitos Must atendem seus critérios de aceite
- [ ] Testes da §17 passando
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:e2e` verdes
- [ ] O fluxo antigo (selecionar conexão + Delete) continua funcionando
- [ ] Em 1440×900, com tudo recolhido, o canvas ocupa ≥ 90% do viewport (G4)
- [ ] Testado em Chromium e WebKit, nos temas claro e escuro

## 11. Technical Context
**Stack & areas affected**: React 19.3.1, `@xyflow/react` 12.12.0, zustand 5.0.16 + immer 11.2.9, Vitest 5 + Testing Library, Playwright 1.64.1 (`apps/app/package.json`).
- Parte A: `apps/app/src/canvas/FlowEdge.tsx` (conexão customizada, já usa `EdgeLabelRenderer`, `FlowEdge.tsx:33-45`); `apps/app/src/store/diagram-store.ts` (hoje a remoção de conexão só passa por `removeSelection`, `diagram-store.ts:123-137`, que apaga a seleção inteira e a zera — não atende FR-2); `apps/app/src/canvas/canvas.css:152-175`.
- Parte B: `apps/app/src/workspace/Workspace.tsx:66-94` (monta a barra de cima, a paleta, o canvas e o painel lateral); `apps/app/src/canvas/canvas.css:1-12, 79-83` (`.workspace` com grade de linhas, `.workspace-body` com colunas fixas, `.side-panel`); `apps/app/src/canvas/Palette.tsx`; `apps/app/src/viz/GlobalBar.tsx` e `.global-bar` (`canvas.css:186-199`); `apps/app/src/practice/ProblemView.tsx:20-40, 125-180` (`Brief` com toggle próprio, abas do painel lateral); `apps/app/src/App.tsx:53` (modo livre).
- Indireto: simulação e avaliação (reagem a `diagram`), autosave (`store/autosave.ts`), o resize do React Flow (ResizeObserver, stubado em `canvas.test.tsx:12-20`).

**Conventions**:
- Mutações do diagrama passam por `commit(recipe)` (`diagram-store.ts:53-58`). O no-op para id inexistente segue `setEdge` (`diagram-store.ts:155-158`).
- Ações do canvas leem o store com `useDiagram.getState()` dentro de callbacks (`Canvas.tsx:115-118`).
- Elementos interativos sobre a conexão levam `nodrag nopan` (`FlowEdge.tsx:35`).
- Toggle de seção: `<button className="link-button" aria-expanded={open}>` com texto em português (`ProblemView.tsx:30-39`).
- Preferência local do usuário guardada em `localStorage` por `browserStorage()`, com try/catch e chave com prefixo `archsim:` (`theme/theme.ts:3-31`).
- Textos da UI em português, código em inglês. Comentários de doc citam o requisito (`FlowEdge.tsx:20`).
- Testes: store em `store/diagram-store.test.ts` (`s()` como atalho); canvas em `canvas/canvas.test.tsx`; storage em `theme/theme.test.tsx`; e2e em `apps/app/e2e/*.spec.ts`.

**Data & contracts**: nenhuma mudança de schema. `Diagram`/`DiagramEdge` e `.archsim.json` ficam iguais. O estado dos painéis é uma preferência de UI no `localStorage` (chave nova com prefixo `archsim:`) e não entra no arquivo do diagrama nem no autosave.

**Constraints**: remover uma conexão só tira da seleção o id removido. O canvas é editável nos dois modos (só a carga trava, `panels/LoadPanel.tsx:110`), e as duas partes valem nos dois. Recolher é visual: os painéis continuam montados (FR-14).

**Dependencies**: nenhuma. Sem pacote novo.

## 12. Security & Compliance

### OWASP Top 10:2025

| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | No | O app roda local, sem usuários nem autorização. As mudanças são de estado do cliente. | N/A — não existe fronteira de acesso. |
| A02 | Security Misconfiguration | Yes (leve) | Nada novo que viole a CSP do app (`apps/app/csp.ts`): sem `<style>` injetado, sem script inline. Estilos por classe; o `transform` do "×" segue o padrão aceito de `edge-label`. | e2e sem violação de CSP no console (checagem que já existe). |
| A03 | Software Supply Chain Failures | No | Sem dependência nova. | `pnpm-lock.yaml` sem mudança no diff. |
| A04 | Cryptographic Failures | No | Sem dados sensíveis. O estado dos painéis é uma preferência visual. | N/A. |
| A05 | Injection | Yes (leve) | Nomes acessíveis são texto fixo ou interpolado pelo React. O título do problema na faixa recolhida é renderizado como texto, nunca via `innerHTML`. | Teste de componente com `xss-label.archsim.json`: nada executa; o título com `<script>` aparece como texto. |
| A06 | Insecure Design | Yes | A remoção só aceita ids que existem e não apaga nós por tabela. O valor lido do `localStorage` é validado (só booleanos para chaves conhecidas). Qualquer outra coisa é ignorada. | Teste de store (id inexistente, `nodes` igual); teste do leitor com JSON inválido, tipos errados e chaves extras → padrão expandido. |
| A07 | Authentication Failures | No | Sem autenticação. | N/A. |
| A08 | Software or Data Integrity Failures | Yes | O diagrama continua válido depois de uma remoção: o arquivo salvo depois passa no schema. O estado dos painéis nunca entra no `.archsim.json`. | Teste: remover → salvar → reabrir dá um diagrama igual e válido; o arquivo salvo não tem chave de layout. |
| A09 | Security Logging and Alerting Failures | No | App local, sem logging. Nada novo é logado. | N/A. |
| A10 | Mishandling of Exceptional Conditions | Yes | Clique numa conexão já removida: sem exceção e sem passo vazio. `localStorage` ausente ou lançando: abre expandido e o app funciona. | Teste de store (FR-6); teste com storage lançando (NFR-5). |

**Existing controls at risk**: o fluxo de seleção + Delete (`Canvas.tsx:101-113`) não pode mudar. O `deleteKeyCode` com Backspace (`Canvas.tsx:151`) não pode disparar quando o foco está num botão novo. O `browserStorage()` que já existe (`theme.ts:6`) deve ser reaproveitado, não duplicado com um tratamento de erro mais fraco.
**Secrets / PII touched**: nenhum.

## 13. Do / Don't
- Do: criar uma ação no store que remove uma conexão pelo id, via `commit`. Se não, a remoção fica fora do undo.
- Do: marcar o "×" com `nodrag nopan` e parar a propagação do clique. Se não, o clique seleciona a conexão ou move o canvas.
- Do: manter o estado dos painéis fora de `useDiagram`. Ele não é diagrama e não pode entrar no histórico de undo nem no autosave.
- Don't: reaproveitar `removeSelection` para o "×" — isso apaga o resto da seleção (viola FR-2).
- Don't: guardar o hover da conexão em estado global — isso re-renderiza o canvas a cada movimento do mouse (viola NFR-1).
- Don't: desmontar o painel ao recolher (`{open && <Panel/>}`) — perde a aba e os campos em edição (viola FR-14).
- Don't: chamar `fitView` ao recolher — o zoom e a posição da pessoa pulam (viola FR-16).

## 14. Risks & Caveats
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| (A) O "×" fica numa camada HTML separada do SVG; o hover "sai" da conexão quando o cursor vai até o botão, e ele some antes do clique. | High | High | O botão conta como área de hover (FR-1). e2e com mouse real. |
| (A) Partículas (`ParticleLayer`, z-index 4) ou `GlobalBar` por cima do "×". | Medium | Medium | e2e com a simulação rodando: o clique chega ao botão. |
| (A) Telas de toque não têm hover. | Medium | Low | O "×" também aparece na conexão selecionada. |
| (B) O React Flow não percebe a mudança de tamanho ou recentraliza o viewport. | Medium | Medium | FR-16 + e2e conferindo zoom e posição antes e depois. |
| (B) A faixa recolhida do painel lateral esconde que um nó foi selecionado, e a pessoa acha que o clique não funcionou. | Medium | Low | Indicador de seleção na faixa (FR-15). |
| (B) Os testes e2e que já existem esperam a paleta e o painel visíveis. Um estado salvo de outra execução pode deixá-los recolhidos. | Medium | Medium | Os e2e começam com storage limpo (contexto novo do Playwright). Conferir que `helpers.ts` não reaproveita estado. |
| (B) Dois toggles do enunciado (o "esconder enunciado" de hoje e o de recolher a barra) confundem. | Low | Low | Os dois ficam com papéis distintos e nomes diferentes (§6). O plano pode propor unificar se ficar redundante. |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| "Nodezinho" é a conexão entre dois nós. | "desfazer aquela conexão" | O botão iria nos nós; os FRs da Parte A se mantêm com outro alvo. |
| O "×" fica no meio da curva, onde a legenda já fica. | `getBezierPath` → `labelX/labelY` (`FlowEdge.tsx:22`) | Só CSS ou cálculo. |
| Sem confirmação ao remover; o undo basta. | Undo cobre remoções (FR-2 do MVP). | Seria um diálogo, e os e2e evitam diálogos. |
| "Todas as informações ao redor" = paleta, painel lateral, barra de cima (enunciado + carga) e barra global de métricas. | São os únicos elementos fora do canvas no `Workspace` (`Workspace.tsx:66-94`), mais a `GlobalBar` sobreposta. | Incluir MiniMap e Controls é um FR a mais, no mesmo padrão. |
| Recolher = faixa estreita com botão de expandir, não sumir de vez. | US-6: precisa existir um caminho de volta visível. | Atalhos de teclado substituiriam a faixa. |
| O estado dos painéis é global (o mesmo no modo livre e em todos os problemas) e fica no `localStorage`. | É preferência de layout, como o tema (`theme.ts:3`). | Uma chave por modo; o FR-13 muda pouco. |
| Todos os painéis começam expandidos para quem nunca mexeu. | Mantém o comportamento atual e a descoberta das funções. | Mudar o padrão é uma constante. |

## 16. Open Questions
None.

## 17. Tests
**Parte A**
- Store: remover por id tira só aquela conexão; a seleção perde só esse id; `nodes` igual (FR-2, A06); undo devolve a conexão idêntica, redo remove de novo (FR-3); id inexistente → diagrama e histórico iguais (FR-6, A10).
- Componente: o botão "Remover conexão" aparece no hover e na seleção, e some fora disso (FR-1); o clique remove sem selecionar (FR-2, FR-4); aviso e botão aparecem juntos (FR-7); fixture XSS sem execução (A05).
- e2e: A → B e A → C; hover em A → B; clicar no "×" → 1 conexão, nós intactos (G1, G2); Cmd+Z → 2 (G3); teclado: selecionar + Tab + Enter (FR-5); com a simulação rodando, o clique chega ao botão.
- Integridade: remover → salvar → reabrir dá um diagrama válido e igual (A08).

**Parte B**
- Leitor e gravador do estado: padrão expandido sem storage, com storage lançando, com JSON inválido, com tipos errados e com chaves desconhecidas (NFR-5, A06, A10); round-trip gravar → ler.
- Componente: cada botão "Recolher/Expandir …" alterna `aria-expanded` e a classe recolhida (FR-8–FR-11); a aba do painel lateral continua depois de recolher e expandir (FR-9, FR-14); seleção e histórico iguais depois de alternar (FR-14); o indicador de seleção aparece na faixa recolhida (FR-15); o título do problema com `<script>` aparece como texto na faixa (A05); "Focar no canvas" recolhe tudo e restaura o estado anterior (FR-12).
- e2e: em 1440×900, recolher tudo → `.canvas` ≥ 90% do viewport (G4); recarregar → o mesmo estado (G5, FR-13); zoom e posição do primeiro nó iguais depois de recolher a paleta, a menos do deslocamento da coluna (FR-16); `keyboard.spec.ts` recolhe e expande a paleta só com teclado (NFR-2); `a11y.spec.ts` com tudo recolhido sem violações novas; o arquivo salvo não tem chave de layout (A08).
- Regressão: `perf.spec.ts` verde (NFR-1); os e2e que já existem continuam passando com o storage limpo.
- Fixtures: as que já existem bastam (`fixtures/files/xss-label.archsim.json`).

## 18. Verification
```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```
Ponta a ponta:
1. `pnpm dev` → Canvas livre → adicionar Usuários, ALB e EC2 → conectar Usuários → ALB e ALB → EC2 → hover em ALB → EC2 mostra o "×" → clicar → sobra só Usuários → ALB e os 3 nós → Cmd+Z traz a conexão de volta.
2. Na mesma tela, recolher a paleta, o painel lateral, a barra de cima e as métricas → o canvas ocupa a tela; zoom e posição continuam → recarregar → tudo continua recolhido → expandir cada um → volta como antes.
3. Abrir um problema → recolher a barra de cima → o título continua na faixa → aba Propriedades → recolher a lateral → clicar num nó → a faixa mostra o indicador → expandir → a aba Propriedades com o nó.
4. Repetir 1–3 com a simulação rodando, nos temas claro e escuro.

## 19. Release Plan
- **Branch**: nova, `feat/canvas-workspace-ergonomics`, a partir de `master`
- **Milestones**: release única, mas com as partes A e B em commits separados para cada uma poder ser revertida sozinha
- **Migrations / ordering**: nenhuma
- **Config / secrets**: nenhum
- **Feature flag**: none — é UI local e aditiva, e os padrões mantêm o comportamento atual
- **Rollout**: tudo de uma vez
- **Rollback**: reverter os commits da parte em questão. Sem mudança de dados nem de formato de arquivo. A chave de layout que sobrar no `localStorage` é ignorada.
- **Post-launch**: o app é local e não tem telemetria, então as métricas da §3 são verificadas pelos e2e no CI e por um teste manual do autor depois do merge.

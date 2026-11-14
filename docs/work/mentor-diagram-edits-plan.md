# Plan: O mentor propõe mudanças no desenho, aplicadas com um clique

**PRD**: `docs/work/mentor-diagram-edits-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-14

## Approach
O mentor ganha uma única ferramenta, `propor_mudancas`, descrita por um schema zod compartilhado. Ela chega ao modelo por caminhos diferentes em cada provedor:
- **API:** como tool nativa.
- **Assinatura:** por um servidor MCP mínimo, que o `claude -p` sobe com `--mcp-config`, mantendo `--tools ""` e `--strict-mcp-config` e liberando só essa ferramenta com `--allowedTools`.

**Verificado em 2026-11-14 com o v2.1.325:** o init mostra `tools: ['mcp__archsim__propor_mudancas']` e o MCP `connected`. O modelo chamou a ferramenta com a proposta, recebeu o resultado e fechou com texto, em 2 turnos.

O fluxo de uma proposta:
1. A ferramenta não faz nada: só devolve "Proposta registrada; a pessoa decide".
2. O servidor lê a chamada no stream e valida o input com zod.
3. Traduz os ids neutros (`n3`) para os reais com o mapa da própria pergunta.
4. Simula a aplicação sobre o desenho que o mentor viu, com uma função **pura** `applyProposal`, compartilhada entre o servidor e o navegador.
5. Só então emite um evento `proposal`, que vira um card com o id da proposta e o estado `pending`, gravado junto da fala.
6. No navegador, **Aplicar** roda a mesma `applyProposal` sobre o desenho atual. Ela é atômica: um nó sumido torna a proposta desatualizada, e um resultado inválido é recusado.
7. Com sucesso, o resultado entra por `replaceDiagram`: um passo de desfazer.
8. O estado do card vai ao servidor por uma rota nova.

Para o mentor conseguir propor certo, o contexto ganha as **conexões** do desenho (o estado de hoje só tem métricas por nó) e um resumo do catálogo (ids de serviço, tipos, parâmetros e intervalos) no system prompt, que é estável e fica em cache.

**Alternativas que perderam**
- **Bloco estruturado no texto, sem ferramenta.** Mantém "zero ferramentas", mas sem schema o modelo erra mais o formato, e o parse sai de um texto em streaming. Com a ferramenta funcionando sem abrir as de sistema (verificado), o schema vale mais.
- **O servidor aplicar a mudança.** O desenho vive no navegador (autosave em `localStorage`), e a confirmação por clique também; o servidor só valida.
- **Aplicar operação por operação com as ações do store** (`addNode`, `connect`…). Seriam N passos de desfazer, sem atomicidade, e cada ação mexe em seleção e avisos. A função pura com `replaceDiagram` dá um passo só e recusa tudo ou nada.
- **Servidor MCP como arquivo do repositório.** O config do Vite roda via module runner, e o caminho do arquivo não é confiável. Em vez disso, o script do MCP é escrito no diretório privado do provedor (o mesmo `mkdtemp` 0700) com o schema embutido, e roda com `process.execPath`.

## Decisions
| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Canal da proposta | Ferramenta `propor_mudancas`: nativa na API, MCP no `claude -p` | Bloco estruturado no texto | Schema; verificado que o CLI expõe só ela | Assumed (a pessoa perguntou "não seria só um MCP?") |
| Operações | `add` (ref `novoN`, `service`, `variant?`, `props?`, `label?`), `remove`, `connect`, `disconnect` (por `from`/`to`), `set_variant`, `set_prop`, `rename` | Edição por diff de diagrama | Espelha as ações do store (`diagram-store.ts:31-49`); fácil de descrever no card | Assumed |
| Onde mora `applyProposal` | `apps/app/src/store/proposal.ts`, pura (catalog, sim-engine, `connection-rules`, `freeSpot`) e importada também pelo servidor | `packages/problems` | Precisa de `defaultProtocol` (`connection-rules.ts:5`) e de `freeSpot`, que são do app; o servidor está no mesmo pacote | Assumed |
| `freeSpot` | Move de `Workspace.tsx:19-31` para `src/canvas/place.ts`; o `Workspace` importa de lá | Copiar | Sem duplicar e sem o servidor importar React | Assumed |
| Ids | O mentor fala em `n#`, e os novos são `novo1…novo50`; o servidor traduz com o mapa de `neutralIds` da pergunta; o card e a conversa guardam ids reais | O modelo vê ids reais | Ids reais são texto da pessoa (A05) e o modelo poderia forjá-los (A08) | PRD §13 |
| Ids dos nós criados | `${servico}-m${Date.now36}${i}` na hora de aplicar | Reaproveitar o `newId` interno do store | O `newId` não é exportado; o prefixo `m` evita colisão com `${servico}-${…}` | Assumed |
| Posição dos nós novos | Depois de aplicar as operações, cada nó novo vai para `freeSpot(perto do primeiro vizinho conectado)`; sem vizinho, à direita do nó mais à direita | Pedir posição ao modelo | O modelo não vê o canvas | Assumed |
| Protocolo de `connect` | `defaultProtocol(kind origem, kind destino)` | O modelo escolhe | É o mesmo comportamento da UI | Assumed |
| Fechamento da resposta na API | Se `stop_reason === 'tool_use'`, uma 2ª chamada com o `tool_result` fixo, para o texto final; no máximo 2 rodadas | Parar no tool_use | Igual ao CLI, que continua sozinho (verificado: 2 turnos) | Assumed |
| `--max-turns` no CLI | 3 (tool + resposta + folga) | 1 | Com 1, o CLI para antes do texto final | Assumed |
| Estado do card | `pending` → `applied`/`discarded`; desfazer volta a `pending`; rota `POST /__archsim/proposal` `{problemId, proposalId, status}` | Só local | O PRD pede o estado persistido (FR-9) | PRD |
| "Desfazer" no card | Visível enquanto `useDiagram.diagram` é o mesmo objeto que a aplicação produziu (identidade) | Ler o histórico | Qualquer mudança depois esconde o botão, sem acoplamento ao histórico | PRD §15 |
| Proposta durante uma resposta interrompida | Descartada (sem card) | Guardar | PRD A10 | PRD |
| Mais de uma chamada da ferramenta na mesma resposta | Só a primeira válida conta; as outras são ignoradas e contadas no log | Juntar | PRD NFR-3 (1 por resposta) | PRD |

## Critical files
| File | Role in this change |
|---|---|
| `apps/app/src/store/diagram-store.ts` | `replaceDiagram` como passo único (`:257-260`); as regras de `addNode`/`connect`/`setVariant`/`setProp`, que `applyProposal` espelha (`:86-235`) |
| `apps/app/server/mentor/chat-route.ts` | Onde a proposta é traduzida, validada, emitida e gravada; o log |
| `apps/app/server/mentor/cli-provider.ts` | As flags do `claude`; entram `--mcp-config` e `--allowedTools`, e `--tools ""` continua |
| `apps/app/server/mentor/api-provider.ts` | `tools` com a ferramenta e a 2ª rodada |
| `apps/app/server/mentor/context.ts` | As conexões no estado e o catálogo no system prompt; o mapa de ids neutros |
| `packages/problems/src/mentor.ts` | Os contratos novos (proposta, eventos, estado), opcionais na conversa |
| `apps/app/src/practice/ChatPanel.tsx` | O card, Aplicar/Descartar/Desfazer |

## Tasks

### T1 — Contratos da proposta
- **Covers**: FR-2 (forma), FR-9 (contrato), NFR-3, A05, A08
- **Files**: `packages/problems/src/mentor.ts`, `packages/problems/src/mentor.test.ts`
- **Mirror**: `MentorEvent` como discriminated union `.strict()` (`mentor.ts`); `ChatRequest`
- **Do**:
  1. Um `Label` com 1–80 caracteres e regex `/^[^<>]+$/`; um `NodeRef` com `/^[a-z0-9][a-z0-9._-]{0,63}$/`; um `NewRef` com `/^novo([1-9]|[1-4]\d|50)$/`.
  2. `ProposalOp`, discriminated union por `op`:
     - `add {ref: NewRef, service: string max 64, variant?: string max 64, props?: record<string max 32, finite number>, label?: Label}`;
     - `remove {node}`, `connect {from, to}`, `disconnect {from, to}` (`from`/`to` = `NodeRef | NewRef`);
     - `set_variant {node, variant}`, `set_prop {node, key, value}`, `rename {node, label}`.
  3. `ProposalInput = {summary: 1–300, ops: 1–50}` e `MAX_PROPOSAL_OPS = 50`.
  4. `Proposal = ProposalInput & {id: uuid, status: 'pending'|'applied'|'discarded'}`.
  5. `MentorReply.proposal?: Proposal` (opcional: as conversas antigas continuam válidas).
  6. Novos eventos: `{type:'proposal', proposal}` e `{type:'proposal_rejected', reason: string max 200}`.
  7. `ProposalStatusRequest = {problemId, proposalId: uuid, status}`.
- **Tests**:
  - cada operação válida;
  - operação desconhecida, 51 operações e label com `<` → inválidas;
  - conversa sem `proposal` continua válida; conversa com uma proposta é válida;
  - eventos novos válidos; `ref` `novo51` → inválido.
- **Check**: `pnpm vitest run packages/problems` → verde
- **Depends on**: —

### T2 — `applyProposal` pura, e `freeSpot` em módulo próprio
- **Covers**: FR-2, FR-6 (navegador e servidor), FR-7, FR-8 (resultado único), FR-10, NFR-1, A06, A08
- **Files**:
  - novos: `apps/app/src/canvas/place.ts`, `apps/app/src/store/proposal.ts`, `apps/app/src/store/proposal.test.ts`;
  - editados: `apps/app/src/workspace/Workspace.tsx` (importa `freeSpot` de `place.ts`), `apps/app/src/workspace/workspace.test.ts` (import)
- **Mirror**: as regras de `addNode` (`diagram-store.ts:86-113`: tipo padrão = 1º, rótulo padrão = `service.label`, entrada única), `connect` (`:157-170`: sem laço, sem duplicata, limite de arestas), `setVariant` (`:196-208`: filtra overrides com `overridableKeys`), `setProp` (`:211-222`: intervalo do parâmetro), `setLabel` (`:189-194`); `defaultProtocol` (`connection-rules.ts:5`); `validateDiagram` (`packages/sim-engine/src/diagram.ts:208`)
- **Do**:
  1. `applyProposal(diagram, ops, { catalog, newId, place }) → { ok: true, diagram } | { ok: false, code: 'missing' | 'invalid', message }`, sobre uma cópia (immer `produce`), na ordem.
  2. `missing` quando um `node`/`from`/`to` não existe (nem como real nem como `ref` criado antes).
  3. `invalid` para:
     - serviço, tipo ou parâmetro inexistente;
     - valor fora do intervalo;
     - `add` de serviço de entrada;
     - `remove`/`rename`/`set_*` do nó `core.users` (só `connect`/`disconnect` a partir dele);
     - `connect` em laço ou duplicado;
     - `disconnect` sem aresta, que conta como `missing`;
     - limites de nós e arestas.
  4. `remove` tira o nó e as arestas dele.
  5. Depois das operações, posiciona cada nó novo com `place(perto, ocupados)`.
  6. Por fim, `validateDiagram(result, catalog)`; se falhar → `invalid`.
  7. A carga nunca é tocada, porque não existe operação para ela.
  8. `describeOp(op, diagram, refs)` gera a linha em pt-BR do card ("+ ElastiCache (Valkey) 'Cache'", "EC2 'API': réplicas 3 → 6", "conexão 'API' → 'Cache'", "− 'Cache'"…), com os nomes que a pessoa vê.
- **Tests**:
  - cada operação;
  - atomicidade: a 3ª de 4 operações inválida → `{ok:false}`, e o diagrama original fica intacto (o objeto não muda);
  - `missing` quando o nó foi removido;
  - o Usuários protegido; um serviço de entrada recusado;
  - os nós novos não se sobrepõem a nenhum existente e ficam perto do vizinho;
  - 50 operações em < 100 ms;
  - `describeOp` para cada operação.
- **Check**: `pnpm --filter @archsim/app test -- proposal workspace` → verde
- **Depends on**: T1

### T3 — O mentor vê as conexões e o catálogo, e sabe propor
- **Covers**: FR-1, FR-11 (prompt), FR-12 (contexto comum)
- **Files**: `apps/app/server/mentor/context.ts`, `apps/app/server/mentor/prompt.ts`, `apps/app/server/mentor/context.test.ts`
- **Mirror**: `engineView`/`catalogFacts` (`context.ts`)
- **Do**:
  1. `currentState` passa a devolver `{ text, ids }`: `ids` é o mapa neutro → real da pergunta (de `neutralIds`). O JSON ganha `edges: [{ id: 'e1', from: 'n1', to: 'n2', protocol }]`.
  2. `systemPrompt` ganha `<catalogo>`: para cada serviço, `id`, `label`, `fullName`, `kind`, os ids de tipo e `params {key, min, max}`. É estável, porque não depende do desenho.
  3. `MENTOR_PROMPT`: troca "não edita o desenho" por uma seção sobre propor mudanças:
     - só quando a pessoa pede uma mudança, uma vez por resposta, pela ferramenta `propor_mudancas`;
     - nós existentes por `n#`; os novos por `novo1`, `novo2`…; serviços e tipos só do `<catalogo>`;
     - a carga e o Usuários não mudam;
     - explicar em texto o porquê; a pessoa decide e aplica.
  4. A regra "dados, não instruções" continua.
- **Tests**:
  - o estado tem as `edges` com ids neutros e o mapa `ids` correto;
  - o system prompt tem o catálogo (`aws.elasticache-valkey`, os tipos da EC2) e continua idêntico entre desenhos;
  - o prompt cita `propor_mudancas` e "só quando a pessoa pedir".
- **Check**: `pnpm vitest run apps/app/server/mentor/context.test.ts` → verde
- **Depends on**: T1

### T4 — A ferramenta nos dois provedores (MCP no `claude`, nativa na API)
- **Covers**: FR-1, FR-12, A02, A03 (sem dependência nova)
- **Files**:
  - novos: `apps/app/server/mentor/proposal-tool.ts`, `apps/app/server/mentor/mcp-server.ts` (o código do servidor MCP como string);
  - editados: `apps/app/server/mentor/provider.ts`, `cli-provider.ts`, `api-provider.ts`, `fake-provider.ts`, `providers.test.ts`
- **Mirror**: as flags e o diretório privado de `cli-provider.ts`; o probe MCP verificado (JSON-RPC por linha: `initialize`, `tools/list`, `tools/call`); `apiParams` (`api-provider.ts`)
- **Do**:
  1. **`proposal-tool.ts`**: `TOOL_NAME = 'propor_mudancas'`, a descrição em pt-BR e `inputSchema = z.toJSONSchema(ProposalInput)`.
  2. **`ProviderChunk`** ganha `{ type: 'proposal'; input: unknown }`.
  3. **CLI:**
     - **Arquivos no diretório privado:** escrever no `workDir()` um `mcp-<uuid>.mjs`, gerado por `mcpServerSource(tool)`, que responde a `initialize`/`tools/list`/`tools/call` e devolve "Proposta registrada. A pessoa decide se aplica." Ele é removido no `finally`, como o `system-*.txt`.
     - **Flags novas em `cliArgs(model, systemFile, mcpConfig)`:** `--mcp-config <json com command: process.execPath e args: [arquivo]>`, `--allowedTools mcp__archsim__propor_mudancas`, `--max-turns 3`. `--tools ""`, `--strict-mcp-config` e `--setting-sources ""` ficam.
     - **Leitura:** linhas `type:'assistant'` com bloco `tool_use` de nome `mcp__archsim__propor_mudancas` → `{type:'proposal', input}`.
  4. **API:**
     - `tools: [{ name, description, input_schema }]`;
     - se `final.stop_reason === 'tool_use'`, extrair os `tool_use` → `proposal`, e fazer uma 2ª chamada com o conteúdo do assistente + `tool_result` fixo, transmitindo o texto final;
     - no máximo 2 rodadas, com o uso somado.
  5. **Falso:** o roteiro "proponha:ec2" emite `{summary, ops:[{op:'add', ref:'novo1', service:'aws.ec2', label:'API'}, {op:'connect', from:'n1', to:'novo1'}]}`. O roteiro "proponha:invalida" emite um serviço inexistente.
- **Tests**:
  - **Flags do CLI:** `cliArgs` mantém `--tools ''`, `--strict-mcp-config` e `--setting-sources ''`; `--allowedTools` é **só** `mcp__archsim__propor_mudancas`; `--mcp-config` aponta para `process.execPath` e para um arquivo no diretório privado; nada de `bypass`.
  - **O servidor MCP de verdade:** spawn de `node` com o script gerado → `initialize` responde com `capabilities.tools`, `tools/list` devolve exatamente 1 ferramenta com o schema, `tools/call` devolve o texto fixo.
  - **Leitura da linha:** uma linha `assistant` com `tool_use` vira `proposal`; um `tool_use` de outro nome é ignorado.
  - **API:** com stream dublado de `stop_reason: 'tool_use'`, emite `proposal`, faz a 2ª chamada com o `tool_result` e transmite o texto final; o corpo tem exatamente 1 tool.
  - **Limpeza:** o arquivo MCP é removido ao fim.
- **Check**: `pnpm vitest run apps/app/server/mentor` → verde
- **Depends on**: T1, T3

### T5 — O servidor valida, traduz, grava e controla o estado da proposta
- **Covers**: FR-1, FR-4, FR-6 (servidor), FR-9, NFR-3, A01, A06, A08, A09, A10
- **Files**: `apps/app/server/mentor/chat-route.ts`, `apps/app/server/routes.ts`, `apps/app/server/chat.test.ts`
- **Mirror**: o loop de chunks e o `finally` de `chat-route.ts`; a rota `conversation` (`checkMethod`, `problemOf`); os testes A01/A10 de `chat.test.ts`
- **Do**:
  1. **Chunk `proposal`**, se ainda não houver proposta nesta resposta:
     1. `ProposalInput.safeParse`;
     2. traduzir os `node`/`from`/`to` neutros pelo `ids` da pergunta (um `n#` fora do mapa → rejeitada; qualquer id que não seja `n#` nem `novoN` → rejeitado);
     3. `applyProposal(diagrama validado da pergunta, ops traduzidas)`; se não der `ok` → rejeitada;
     4. se `ok`: `{ ...input traduzido, id: randomUUID(), status: 'pending' }` → evento `proposal`;
     5. senão → `proposal_rejected` com um motivo curto, sem texto do modelo.
  2. **Gravação:** a proposta vai com a fala do mentor só se a resposta não foi interrompida.
  3. **Log:** ganha `propostas=<0|1> rejeitadas=<n>`.
  4. **Rota `POST proposal`**, com corpo `ProposalStatusRequest`:
     - `checkCaller` já exige Origin; `problemOf`; 409 se houver resposta em andamento;
     - acha a proposta pelo `id` na conversa (404 se não achar) e muda o `status` (`pending↔applied`, `pending→discarded`; `discarded` é final → 409);
     - responde com a conversa.
- **Tests**:
  - **Proposta válida:** "proponha:ec2" → evento `proposal` com ids reais (`users` no `from`, não `n1`); gravada como `pending`.
  - **Proposta inválida:** "proponha:invalida" → `proposal_rejected`, sem proposta gravada; o texto continua.
  - **Ids:** um `n9` inexistente → rejeitada; um id real forjado (`users`) → rejeitada.
  - **Interrupção:** com "Parar" depois da proposta → nada de proposta gravada.
  - **Rota de estado:** `applied`, depois `pending`, depois `discarded`, e `applied` depois de `discarded` → 409; Origin estrangeiro → 403; sem Origin → 403; `proposalId` inexistente → 404.
  - **Log:** tem `propostas=1` e não tem o `summary`.
  - **Conversa corrompida:** uma proposta corrompida no arquivo → a conversa é deixada de lado como corrompida (o padrão atual).
- **Check**: `pnpm vitest run apps/app/server` → verde
- **Depends on**: T2, T4

### T6 — O card no chat: Aplicar, Descartar, Desfazer
- **Covers**: FR-3, FR-4, FR-5, FR-7 (UI), FR-8, FR-9 (UI), NFR-2, NFR-4, A05
- **Files**:
  - novos: `apps/app/src/practice/ProposalCard.tsx`;
  - editados: `apps/app/src/practice/ChatPanel.tsx`, `apps/app/src/practice/mentor-api.ts`, `apps/app/src/practice/practice.css`, `apps/app/src/practice/chat.test.tsx`
- **Mirror**: o padrão de eventos SSE e de `setMessages` de `ChatPanel.tsx`; a confirmação inline de "Nova conversa"; o markdown seguro (os textos do card são texto puro)
- **Do**:
  1. **Eventos:** `proposal` → guardar na resposta ao vivo e, no fim, na fala; `proposal_rejected` → aviso "o mentor propôs algo que o simulador não aceita".
  2. **`ProposalCard({ problemId, proposal, onStatus })`:**
     - mostra o `summary` e a lista de `describeOp`, com os nomes atuais do desenho;
     - **Aplicar:** `applyProposal(useDiagram.getState().diagram, ops, …)`. Com `ok` → `replaceDiagram(next)`, guarda `appliedRef = next` e manda `mentorApi.proposalStatus(…, 'applied')`. Com `missing` → estado "desatualizada", com a mensagem do PRD. Com `invalid` → a mensagem.
     - **Descartar** → `discarded`.
     - **Desfazer**, visível enquanto `useDiagram.diagram === appliedRef` → `undo()` + `pending`.
     - `role="status"` para o resultado; botões com nome acessível.
  3. **`mentorApi.proposalStatus(problemId, proposalId, status)`.**
- **Tests**:
  - o card mostra as linhas legíveis com os nomes do desenho;
  - Aplicar adiciona o nó e a conexão no store, com um único passo de desfazer; o undo volta exatamente;
  - Descartar não muda o desenho;
  - Desfazer some depois de outra edição;
  - proposta desatualizada (nó removido antes) → mensagem, desenho intacto;
  - o estado vem da conversa ao recarregar (aplicada/descartada);
  - `proposal_rejected` → aviso;
  - um label com `<img onerror>` (forçado no fixture do cliente) é exibido como texto;
  - teclado: Tab até Aplicar + Enter aplica.
- **Check**: `pnpm --filter @archsim/app test -- chat` → verde
- **Depends on**: T2, T5

### T8 — Arrastar com um dedo move o canvas; Shift + arrastar seleciona
- **Covers**: FR-13
- **Files**: `apps/app/src/canvas/Canvas.tsx`, `apps/app/e2e/canvas-gestures.spec.ts` (new), os e2e que dependam do arrasto de seleção (conferir)
- **Mirror**: as props atuais do `ReactFlow` (`Canvas.tsx:149-164`); os e2e com `page.mouse` (`apps/app/e2e/edge-remove.spec.ts:82-86`)
- **Do**:
  1. Trocar `selectionOnDrag` + `panOnDrag={[1, 2]}` por `panOnDrag` (botão principal) + `selectionKeyCode="Shift"`. O `multiSelectionKeyCode` passa a `['Meta', 'Control']`, para o Shift ser só o do retângulo. O Shift + clique num card continua somando seleção? Se o React Flow perder isso, manter `Shift` também em `multiSelectionKeyCode` e conferir no e2e.
  2. O texto de ajuda, se existir, é atualizado.
- **Tests** (e2e):
  - arrastar o fundo com o botão esquerdo muda o `transform` do `.react-flow__viewport`;
  - Shift + arrastar sobre dois cards seleciona os dois (`.selected`);
  - arrastar um card muda a posição dele e não o viewport.
- **Check**: `pnpm test:e2e` → verde
- **Depends on**: —

### T9 — Duplo clique num card abre as propriedades
- **Covers**: FR-14
- **Files**: `apps/app/src/workspace/layout-store.ts` (um pedido de "mostrar propriedades"), `apps/app/src/canvas/Canvas.tsx` (`onNodeDoubleClick`, `zoomOnDoubleClick={false}`), `apps/app/src/practice/ProblemView.tsx`, `apps/app/src/practice/StudyView.tsx` (a aba responde ao pedido), testes em `apps/app/src/workspace/layout-store.test.ts` e `apps/app/src/practice/practice.test.tsx`
- **Mirror**: `useLayout.toggle` (`layout-store.ts`); as abas de `ProblemView.tsx:137-158`
- **Do**:
  1. O `layout-store` ganha `showProperties()`: se o lateral estiver recolhido, expande (e salva como o `toggle` faz) e incrementa um contador `propertiesRequest`.
  2. `Canvas` ganha `onNodeDoubleClick={(_, n) => { select([n.id]); useLayout.getState().showProperties(); }}` e `zoomOnDoubleClick={false}`.
  3. `ProblemView` e `StudyView` observam `propertiesRequest` num `useEffect` → `setTab('props')`. O canvas livre já mostra só as propriedades.
- **Tests**:
  - `showProperties` expande um lateral recolhido e incrementa o contador;
  - no `ProblemView`, mudar o contador troca para a aba Propriedades;
  - e2e: duplo clique num card com o lateral recolhido → painel aberto na aba Propriedades com o título do serviço, e o zoom (`transform`) inalterado.
- **Check**: `pnpm --filter @archsim/app test -- layout practice` e `pnpm test:e2e` → verde
- **Depends on**: —

### T7 — e2e e README
- **Covers**: G1–G4 (automatizáveis), NFR-2, DoD README
- **Files**: `apps/app/e2e/study-flow.spec.ts` (ou um novo `mentor-edits.spec.ts`), `apps/app/e2e/a11y.spec.ts`, `README.md`
- **Mirror**: `study-flow.spec.ts` (abrir Estudar, pílula, perguntar); o teste do a11y com o mentor aberto
- **Do**:
  1. **e2e:**
     1. no estudo de um problema próprio por browser, pedir "proponha:ec2" → o card mostra "+ EC2 'API'" e "conexão 'Usuários' → 'API'";
     2. Aplicar → o card do nó "API" aparece no canvas;
     3. Ctrl+Z → some; Aplicar de novo → volta;
     4. Descartar uma segunda proposta → nada muda;
     5. recarregar → os estados persistem;
     6. `watchConsole` vazio.
  2. **a11y** com um card na tela.
  3. **README:** a seção do mentor ganha "o mentor propõe; você aplica com um clique; Ctrl+Z desfaz".
- **Tests**: o próprio e2e
- **Check**: `pnpm test:e2e` → verde nos dois projetos
- **Depends on**: T6

## Coverage
| PRD item | Task |
|---|---|
| FR-1 | T3, T4, T5 |
| FR-2 | T1, T2 |
| FR-3 | T2 (`describeOp`), T6 |
| FR-4 | T5, T6 |
| FR-5 | T6 |
| FR-6 | T2, T5, T6 |
| FR-7 | T2, T6 |
| FR-8 | T2, T6 |
| FR-9 | T1, T5, T6 |
| FR-10 (Should) | T2 |
| FR-11 (Should) | T3 (prompt), Verificação manual |
| FR-12 | T3, T4 |
| NFR-1 | T2 |
| NFR-2 | T6, T7 |
| NFR-3 | T1, T5 |
| NFR-4 | T2, T6 |
| A01 | T5 |
| A02 | T4 |
| A03 | T4 (nenhuma dependência nova; `pnpm audit`) |
| A05 | T1, T6 |
| A06 | T2, T5 |
| A08 | T1, T2, T5 |
| A09 | T5 |
| A10 | T5, T6 |
| §17 provedor falso com proposta | T4 |
| §17 e2e | T7 |
| DoD README | T7 |
| FR-13 | T8 |
| FR-14 | T9 |

## Risks
| Risk | Where it bites | What to do if it does |
|---|---|---|
| `z.toJSONSchema` gera um schema que a API ou o CLI não aceitam (por exemplo, `anyOf` de objetos `.strict()`) | T4 | Testar o schema real com o probe MCP e com uma chamada à API dublada; se preciso, achatar para um objeto com `op` enum e campos opcionais, validado por zod no servidor |
| O modelo usa ids reais ou de mais de um jeito | T5 | Rejeição com um motivo; o prompt é reforçado; o roteiro manual mede |
| A 2ª rodada da API dobra o custo e a latência da resposta com proposta | T4 | Só acontece quando há proposta; o `tool_result` é curto; o custo somado aparece no chat |
| O script MCP em tmp não sobe (outro Node, permissão) | T4 | `process.execPath` + 0700 no diretório privado; um teste spawna o script de verdade |
| O rollback deixa de lado conversas com proposta (`.strict()` antigo) | Release | Registrado no PR (PRD §19) |

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit
```
Depois, o roteiro do PRD §18 (passos 1–10) com a **assinatura real**, no preview em `127.0.0.1:4173`, com `ARCHSIM_PRACTICE_DIR` temporário, sem tocar no servidor de dev da pessoa. Os passos que dependem da UI (Aplicar, Ctrl+Z, recarregar) são verificados com um script Playwright temporário contra o preview real. O resultado é registrado no PR. A API real fica não verificada se não houver chave.

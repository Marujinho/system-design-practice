# Plan: Ergonomia do canvas — remover conexão pelo "×" e painéis recolhíveis

**PRD**: `docs/work/canvas-workspace-ergonomics-prd.md` · **Approval**: 2026-11-13 · **Date**: 2026-11-13

## Approach
**Parte A.** Uma ação nova `removeEdge(id)` no `useDiagram`, feita com `commit`. `FlowEdge` ganha um `<button>` "×" dentro do `EdgeLabelRenderer` que já existe. A visibilidade do botão é um estado local de cada conexão: `hovered || selected`. O hover vem de um `<g>` em volta do `BaseEdge`, que inclui a área de interação de 20 px, e do próprio botão. Uma folga de 120 ms ao sair cobre o espaço entre o SVG e a camada HTML. O botão leva `nodrag nopan nokey` e para a propagação de `pointerdown`/`click`. Assim o clique não seleciona a conexão nem move o canvas, e Backspace com o foco no botão não dispara o `deleteKeyCode` do React Flow (`isInputDOMNode` ignora `.nokey`).

**Parte B.** Um store zustand pequeno e separado, `useLayout` (`workspace/layout-store.ts`), guarda `collapsed: Record<PanelId, boolean>` e o snapshot do "Focar no canvas". Ele persiste em `localStorage['archsim:layout']` pelo `browserStorage()` que já existe, com leitura validada. Um componente `Collapsible` faz o botão com `aria-expanded`, a faixa recolhida e o conteúdo. O conteúdo continua montado com `hidden`, então a aba e os campos não se perdem. O `Workspace` envolve a paleta, o painel lateral e a barra de cima. As colunas e a altura mudam por variáveis CSS na `.workspace-body`. A `GlobalBar` alterna o próprio estado no mesmo store. O React Flow só refaz o enquadramento quando a prop `fitView` muda (`@xyflow/react` `index.mjs:317-318`), então mudar o tamanho do contêiner preserva zoom e posição sem código extra.

**Alternativas descartadas**
- *Hover em estado global (`onEdgeMouseEnter` no `ReactFlow` + id no store):* todas as conexões re-renderizam a cada entrada e saída do mouse (viola NFR-1 e o Don't do PRD).
- *Hover só com CSS (`.react-flow__edge:hover`):* o label fica num portal fora do `<g>` da conexão, e o CSS não consegue ligar os dois.
- *Reaproveitar `removeSelection`:* apaga o resto da seleção (viola FR-2).
- *Estado dos painéis no `useDiagram`:* entraria no histórico de undo e no autosave (viola o Do do PRD e A08).
- *`useState` no `Workspace` + prop drilling até a `GlobalBar`:* a `GlobalBar` é renderizada como `overlay` e o "Focar no canvas" precisa ver todos os painéis. Um store resolve com menos fios, e o projeto já usa zustand.
- *Desmontar o conteúdo recolhido (`{open && …}`, como o `Brief` faz hoje):* perde campos em edição (viola FR-14).

## Decisions
| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Visibilidade do "×" | Estado local `hovered` no `FlowEdge` + `selected` vindo das props | Store global; CSS | Re-render só da conexão (NFR-1) | assumed (PRD §13) |
| Folga ao sair do hover | 120 ms com `setTimeout`, cancelada ao entrar na outra área | Sem folga; área HTML invisível sobre a curva | O cursor atravessa a distância SVG → HTML sem o botão sumir (risco nº 1 do PRD) | assumed |
| Bloquear Backspace no botão | Classe `nokey` | `onKeyDown` com `stopPropagation` | É o mecanismo do próprio React Flow (`@xyflow/system` `isInputDOMNode`, `index.mjs:915-923`) | assumed |
| Onde fica o estado dos painéis | `useLayout` (zustand) em `workspace/layout-store.ts` | `useState` + props; context | Lido pelo `Workspace`, pela `GlobalBar` e pelo "Focar"; fora do diagrama | assumed |
| Persistência | `localStorage['archsim:layout']`, JSON `{palette,side,top,metrics: boolean}`, global para todos os modos | Uma chave por modo | PRD §15 (global); mesmo padrão do tema (`theme.ts:3-31`) | assumed (PRD) |
| Conteúdo recolhido | Continua montado com o atributo `hidden` | Desmontar | FR-14 | assumed (PRD) |
| Larguras | Variáveis CSS `--palette-w` e `--side-w` na `.workspace-body`; recolhido = 32 px | Classes com grades combinadas | Uma regra de grade, sem 4 combinações | assumed |
| Onde fica "Focar no canvas" | Botão no canto superior direito do `.canvas` (o MiniMap fica embaixo à direita, os Controls embaixo à esquerda) | Na barra de cima | Continua visível com tudo recolhido | assumed |
| Toggle "esconder enunciado" do `Brief` | Fica como está | Unificar com o recolher da barra | PRD §6 pede papéis distintos; é a menor mudança | assumed (PRD) |

## Critical files
| File | Role in this change |
|---|---|
| `apps/app/src/store/diagram-store.ts` | `commit` (53-58), `removeSelection` (123-137) e `setEdge` (155-158) — o modelo para `removeEdge` |
| `apps/app/src/canvas/FlowEdge.tsx` | Onde o "×" mora; `EdgeLabelRenderer` e `nodrag nopan` já estão em uso (33-45) |
| `apps/app/src/workspace/Workspace.tsx` | Monta a barra de cima, a paleta, o canvas e o painel lateral (66-94); vai envolvê-los |
| `apps/app/src/canvas/canvas.css` | Grade `.workspace`/`.workspace-body` (1-12), `.side-panel` (79-83), `.edge-label` (152-175), `.global-bar` (186-199) |
| `apps/app/src/theme/theme.ts` | `browserStorage()` e o padrão de leitura e gravação tolerante (6-31), que serão reaproveitados |
| `apps/app/src/viz/GlobalBar.tsx` | Barra de métricas que ganha o recolher (15-45) |
| `apps/app/src/practice/ProblemView.tsx` | Passa a barra de cima e a lateral do modo problema (125-180); vai passar o título para a faixa |

## Tasks

### T1 — Ação `removeEdge` no store
- **Done**: `beabfcd`
- **Covers**: FR-2, FR-3, FR-6, A06, A08, A10
- **Files**: `apps/app/src/store/diagram-store.ts` (edit), `apps/app/src/store/diagram-store.test.ts` (edit)
- **Mirror**: `diagram-store.ts:155-158` (`setEdge`: procura por id, retorna se não achar, dentro de `commit`); `diagram-store.ts:123-137` (filtra `d.edges`)
- **Do**: adicionar `removeEdge(id: string): void` na interface `DiagramState` (ao lado de `removeSelection`, linha 30) e na implementação. Se `!get().diagram.edges.some((e) => e.id === id)`, retorna (sem passo vazio: `filter` sempre cria um array novo e `commit` gravaria um passo). Senão, `commit((d) => { d.edges = d.edges.filter((e) => e.id !== id); })`. Se `selection` tiver o id, `set({ selection: selection.filter((x) => x !== id) })`; senão, não mexe.
- **Tests** (novo `describe('removeEdge (edge-hover FR-2/3/6)')`): A → B, A → C, seleção [C] → `removeEdge(AB)` → sobra só A → C, 3 nós, seleção [C]; seleção [AB, C] → seleção vira [C]; A → B com `setEdge` gRPC, peso 0,3 e classes ["leitura"] → remove → `undo` devolve igual a `structuredClone` de antes → `redo` remove; id inexistente → `diagram` com a mesma referência e `history.past.length` igual; remove → `serializeDiagram` → `parseDiagram(…, catalog)` ok e igual ao diagrama.
- **Check**: `pnpm vitest run apps/app/src/store` → verde
- **Depends on**: —

### T2 — Botão "×" no `FlowEdge`
- **Done**: `893d297`, `81a76fd` (tamanho do botão contra o zoom)
- **Covers**: FR-1, FR-4, FR-5, FR-7, NFR-1, NFR-2, NFR-3, NFR-4, A02, A05
- **Files**: `apps/app/src/canvas/FlowEdge.tsx` (edit), `apps/app/src/canvas/canvas.css` (edit), `apps/app/src/canvas/canvas.test.tsx` (edit)
- **Mirror**: `FlowEdge.tsx:32-45` (label no `EdgeLabelRenderer` com `transform` e `nodrag nopan`); `GlobalBar.tsx:32-37` (botão que chama `useDiagram.getState()` no `onClick`); `.edge-warning` em `canvas.css:165-175` para o estilo do círculo
- **Do**:
  - `const [hovered, setHovered] = useState(false)` mais um `useRef` de timer. `enter()` limpa o timer e faz `setHovered(true)`. `leave()` agenda `setHovered(false)` em 120 ms. Limpar o timer no unmount.
  - Envolver o `BaseEdge` num `<g onMouseEnter={enter} onMouseLeave={leave}>` e passar `interactionWidth={20}` (o padrão do React Flow, explícito para o hover).
  - `const showRemove = hovered || props.selected === true`. O label passa a renderizar quando `warning !== null || caption !== '' || showRemove`. O div do label ganha `onMouseEnter={enter}` e `onMouseLeave={leave}`.
  - Dentro do label, depois do aviso: `{showRemove && <button type="button" className="edge-remove nodrag nopan nokey" aria-label="Remover conexão" title="Remover conexão" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); useDiagram.getState().removeEdge(props.id); }}>×</button>}`.
  - Atualizar o comentário de doc citando o requisito, como em `FlowEdge.tsx:20`.
  - CSS `.edge-remove`: `display:inline-grid; place-content:center; width:16px; height:16px; border:1px solid var(--line-strong); border-radius:50%; background:var(--surface); color:var(--text); font-size:12px; line-height:1; cursor:pointer; padding:0`; `:hover` com `border-color: var(--state-critical); color: var(--state-critical)`. O foco vem do `:focus-visible` global (`tokens.css:78-81`). Sem transição (NFR-4 atendido por omissão).
- **Tests** (novo `describe('FlowEdge remove (edge-hover FR-1/4/5/7)')`, renderizando `<Canvas />` com duas conexões criadas no store, ResizeObserver já stubado): sem hover nem seleção → nenhum botão "Remover conexão"; `select([AB])` → o botão aparece; `fireEvent.mouseEnter` no `.react-flow__edge` de AB → o botão aparece; `mouseLeave` + `vi.advanceTimersByTime(120)` → some; o clique no botão → `edges` sem AB e `selection` igual a antes (FR-4); conexão S3 → RDS selecionada → `role=img` do aviso e o botão juntos (FR-7); o rótulo de nó `<img src=x onerror=…>` (fixture `xss-label`) e o botão com nome exato "Remover conexão", sem `img` criado (A05). Se o jsdom não medir os nós e o React Flow não renderizar as conexões, testar o `FlowEdge` sozinho dentro de `<ReactFlowProvider>` com props montadas à mão, e deixar o comportamento real para o e2e do T3.
- **Check**: `pnpm vitest run apps/app/src/canvas` → verde; `pnpm lint`; `pnpm typecheck`
- **Depends on**: T1

### T2a — Preservar o tamanho medido dos nós (adicionada na implementação, aprovada pelo usuário em 2026-11-13)
- **Done**: `49b22a6`
- **Covers**: FR-1, FR-2, FR-5 (estabilidade), NFR-1
- **Why**: no e2e do T3, o "×" sumia e o clique se perdia. A causa: a cada tick da simulação o `decorate` cria nós novos sem `measured`, porque `onNodesChange` ignorava `dimensions` (`Canvas.tsx:76`). O React Flow então zera os handles (`@xyflow/system` `parseHandles`, `index.mjs:1639-1641`; `adoptUserNodes`, `1692-1699`), e todas as conexões ficam um frame sem posição e são desmontadas e remontadas a cada 100 ms. Esse bug já existia antes desta mudança.
- **Files**: `apps/app/src/canvas/flow-model.ts` (edit), `apps/app/src/canvas/Canvas.tsx` (edit), `apps/app/src/canvas/canvas.test.tsx` (edit)
- **Do**: `withMeasured(nodes, sizes)` em `flow-model.ts`. O `Canvas` guarda as `dimensions` de `onNodesChange` num `useRef<Map>` e aplica `withMeasured` aos nós mostrados.
- **Tests**: `withMeasured` com e sem medidas. No e2e do T3, nenhuma conexão é desmontada em 1 s de simulação.
- **Check**: `pnpm test`; `pnpm test:e2e` (incluindo `perf.spec.ts`)
- **Depends on**: T1

### T3 — e2e da Parte A
- **Done**: `db94a10`
- **Covers**: G1, G2, G3, FR-1, FR-2, FR-3, FR-5, risco de z-index, NFR-2
- **Files**: `apps/app/e2e/edge-remove.spec.ts` (new)
- **Mirror**: `apps/app/e2e/free-flow.spec.ts:1-33` (`seed` + `watchConsole`, clique com `toPass` porque o nó re-renderiza 10×/s); `keyboard.spec.ts:3-26` (`tabTo`, `Alt+Tab` no WebKit)
- **Do**: seed `archsim:free` com `reference('url-shortener')` (tem conexões e a simulação roda). (1) Contar `.react-flow__edge` = N; `hover()` no path de uma conexão conhecida; esperar `getByRole('button', { name: 'Remover conexão' })` visível; mover o cursor até ele e clicar, com `toPass`; esperar N-1 conexões e os nós com a mesma contagem; `Meta+Z` (`Control+Z` fora do mac, por `process.platform`) → N. (2) Teclado: clicar na conexão para selecioná-la; `tabTo` até "Remover conexão"; `Enter` → N-1. (3) `watchConsole` vazio (A02).
- **Tests**: o próprio spec.
- **Check**: `pnpm test:e2e -- edge-remove` → verde em chromium e webkit
- **Depends on**: T2

### T4 — Store `useLayout` com persistência validada
- **Done**: `ae4529c`
- **Covers**: FR-12 (lógica), FR-13, FR-14 (fora do diagrama), NFR-5, A06, A10
- **Files**: `apps/app/src/workspace/layout-store.ts` (new), `apps/app/src/workspace/layout-store.test.ts` (new)
- **Mirror**: `theme/theme.ts:3-31` (chave `archsim:`, `browserStorage()`, try/catch, retorno padrão); `theme/theme.test.tsx:37-50` (storage que lança); `store/diagram-store.ts:51` (`create<…>()((set, get) => …)`)
- **Do**:
  - `export type PanelId = 'palette' | 'side' | 'top' | 'metrics'`; `export const PANELS: readonly PanelId[]`; `export type Collapsed = Record<PanelId, boolean>`; `const KEY = 'archsim:layout'`; `export const EXPANDED: Collapsed` (tudo `false`).
  - `readLayout(storage = browserStorage()): Collapsed`: `JSON.parse` dentro de try; aceita só objeto não nulo; para cada `PanelId`, usa o valor se `typeof === 'boolean'`, senão `false`; ignora chaves extras. Qualquer exceção → `EXPANDED`.
  - `storeLayout(c, storage = browserStorage())`: grava só as 4 chaves; try/catch silencioso.
  - `useLayout = create<{ collapsed; before: Collapsed | null; toggle(id); focusCanvas() }>()`. O estado inicial é `readLayout()`. `toggle` inverte, zera `before` e grava. `focusCanvas`: se `before` existe, restaura e zera; senão, guarda `before = collapsed` e recolhe tudo; grava nos dois casos.
  - Importar `browserStorage` de `../theme/theme` (reaproveitar, não duplicar — PRD §12 "Existing controls at risk").
- **Tests**: storage vazio → `EXPANDED`; round-trip `storeLayout` → `readLayout`; JSON inválido → `EXPANDED`; `{"palette":"yes","side":true,"x":1}` → `side` true e o resto false, sem `x`; `null` e array → `EXPANDED`; storage que lança na leitura e na gravação → `EXPANDED` e sem exceção; `toggle('palette')` grava `archsim:layout`; `focusCanvas` com `{side:true}` → tudo true → `focusCanvas` → volta a `{side:true}` (FR-12); `toggle` depois de `focusCanvas` zera `before`; `toggle` não muda `useDiagram.getState().history` (FR-14).
- **Check**: `pnpm vitest run apps/app/src/workspace` → verde
- **Depends on**: —

### T5 — `Collapsible` e a paleta, a lateral e a barra de cima recolhíveis
- **Done**: `8c6d660`
- **Covers**: FR-8, FR-9, FR-10, FR-14, FR-15, FR-16 (por construção), NFR-2, NFR-3, NFR-4, A05
- **Files**: `apps/app/src/workspace/Collapsible.tsx` (new), `apps/app/src/workspace/Workspace.tsx` (edit), `apps/app/src/practice/ProblemView.tsx` (edit), `apps/app/src/canvas/canvas.css` (edit), `apps/app/src/workspace/collapsible.test.tsx` (new)
- **Mirror**: `ProblemView.tsx:30-39` (botão `link-button` com `aria-expanded` e texto em pt); `canvas.css:8-12, 79-83` (grade e `.side-panel`); `canvas.test.tsx:12-31` (stubs de ResizeObserver/matchMedia para renderizar o `Workspace`)
- **Do**:
  - `Collapsible({ id, label, edge, summary, children })`, com `edge: 'left' | 'right' | 'top'`. Lê `useLayout((s) => s.collapsed[id])`. Renderiza `<div className={`collapsible collapsible-${edge}${collapsed ? ' collapsed' : ''}`}>` com um `<button type="button" className="collapse-toggle" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expandir' : 'Recolher'} ${label}`} onClick={() => toggle(id)}>` (chevron em texto: `‹ › ˄ ˅` conforme a borda e o estado). Depois, `{collapsed && summary}` e `<div className="collapsible-body" hidden={collapsed}>{children}</div>`.
  - `Workspace`: novas props opcionais `topSummary?: ReactNode` (padrão `<span className="muted">Carga</span>`). A `.workspace-top` vira `<Collapsible id="top" label="barra superior" edge="top" summary={topSummary}>{top}</Collapsible>`. A `<Palette>` vai num `<Collapsible id="palette" label="paleta" edge="left">`. O `.side-panel` vai num `<Collapsible id="side" label="painel lateral" edge="right" summary={<SelectionBadge />}>`. `SelectionBadge` fica no mesmo arquivo: lê `useDiagram((s) => s.selection.length)` e, se > 0, renderiza `<span className="selection-badge" role="status" aria-label={`Propriedades — ${n} ${n === 1 ? 'item selecionado' : 'itens selecionados'}`}>{n}</span>`. A `.workspace-body` recebe `className` com `palette-collapsed` e `side-collapsed` vindos de `useLayout`.
  - `ProblemView`: passar `topSummary={<strong>{problem.title}</strong>}` (o React escapa o texto — A05).
  - CSS: `.workspace-body { --palette-w: 200px; --side-w: 320px; grid-template-columns: var(--palette-w) minmax(0, 1fr) var(--side-w); }`, `.palette-collapsed { --palette-w: 32px }`, `.side-collapsed { --side-w: 32px }`. `.collapsible` em coluna com `min-height: 0`. Na `.collapsible-left`/`-right` recolhida, o botão fica no topo da faixa, centralizado, e o badge embaixo dele. Na `.collapsible-top` recolhida: `display:flex; align-items:center; gap:8px; height:32px; padding:0 16px; border-bottom:1px solid var(--line)`. `.collapse-toggle`: `width:20px; height:20px; border:1px solid var(--line-strong); border-radius:var(--radius); background:var(--surface); color:var(--text-muted)`. `.selection-badge`: círculo de 16 px com `border: 1px solid var(--text-muted)`. `.palette` perde o `border-right` (ele passa para o `.collapsible-left`) para não aparecer duas vezes. Só tokens (NFR-3). Sem transição (NFR-4).
  - Não chamar `fitView` em lugar nenhum (FR-16).
- **Tests**: renderizar `<Workspace mode={{kind:'free'}} side={<p>lado</p>} top={<p>topo</p>} />` com `useSimulation` mockado (`vi.mock('../sim/useSimulation')`, como o canvas faz com os observers). Os casos: "Recolher paleta" → `aria-expanded=false`, `.workspace-body` com `palette-collapsed`, o conteúdo da paleta ainda no DOM e `hidden`; "Expandir paleta" volta. Na lateral, com uma aba de teste que guarda estado (`<input defaultValue>` digitado), recolher e expandir mantém o texto digitado (FR-14). Com a lateral recolhida, `useDiagram.getState().select([id])` → o status "Propriedades — 1 item selecionado" aparece e a lateral continua recolhida (FR-15). "Recolher barra superior" → `topSummary` visível e `top` em `hidden`. Alternar não muda `history` nem `selection`. No `practice.test.tsx`, um caso a mais: título de problema com `<script>` na faixa recolhida aparece como texto (A05). `beforeEach` com `localStorage.clear()` e reset do `useLayout`.
- **Check**: `pnpm vitest run apps/app/src/workspace apps/app/src/practice` → verde; `pnpm lint`; `pnpm typecheck`
- **Depends on**: T4

### T6 — `GlobalBar` recolhível
- **Done**: `03e1c9d`
- **Covers**: FR-11, NFR-2
- **Files**: `apps/app/src/viz/GlobalBar.tsx` (edit), `apps/app/src/canvas/canvas.css` (edit), `apps/app/src/viz/viz.test.tsx` (edit)
- **Mirror**: `GlobalBar.tsx:32-41` (botão dentro da barra); `.collapse-toggle` do T5
- **Do**: ler `useLayout((s) => s.collapsed.metrics)` e `toggle`. Se `!result`, `return null`, como hoje. Recolhida: `<button className="collapse-toggle global-bar-toggle" aria-expanded={false} aria-label="Expandir métricas">≡</button>`, em posição absoluta onde a barra fica (`left:56px; bottom:12px; z-index:5`), 32×32. Expandida: a barra de hoje com um `collapse-toggle` "Recolher métricas" no fim. O `useSim` continua inscrito nos dois estados, então os valores estão atualizados ao expandir.
- **Tests**: com um `result` falso no `useSim` (padrão que o `viz.test.tsx` já usa): "Recolher métricas" → o `role=status` "Resultado global" some e "Expandir métricas" aparece; expandir → o p99 atual aparece.
- **Check**: `pnpm vitest run apps/app/src/viz` → verde
- **Depends on**: T4

### T7 — "Focar no canvas"
- **Done**: `02b40f2`
- **Covers**: FR-12
- **Files**: `apps/app/src/workspace/Workspace.tsx` (edit), `apps/app/src/canvas/canvas.css` (edit), `apps/app/src/workspace/collapsible.test.tsx` (edit)
- **Mirror**: o `overlay` do `Workspace.tsx:86-91` (elementos absolutos dentro do `.canvas`)
- **Do**: no `overlay`, adicionar `<FocusButton />` (no mesmo arquivo) que lê `useLayout((s) => s.before !== null)`: `<button type="button" className="button focus-canvas" aria-pressed={active} onClick={focusCanvas}>{active ? 'Restaurar painéis' : 'Focar no canvas'}</button>`. CSS `.focus-canvas { position:absolute; top:8px; right:8px; z-index:5 }`.
- **Tests**: com a paleta aberta e a lateral recolhida → "Focar no canvas" → os 4 recolhidos → "Restaurar painéis" → a paleta aberta e a lateral recolhida.
- **Check**: `pnpm vitest run apps/app/src/workspace` → verde
- **Depends on**: T5, T6

### T8 — e2e da Parte B, teclado e acessibilidade
- **Done**: `aef8fdb`
- **Covers**: G4, G5, FR-13, FR-16, NFR-2, A08, risco "e2e esperam painéis visíveis"
- **Files**: `apps/app/e2e/panels.spec.ts` (new), `apps/app/e2e/keyboard.spec.ts` (edit), `apps/app/e2e/a11y.spec.ts` (edit)
- **Mirror**: `free-flow.spec.ts:1-10` (`seed`, `watchConsole`); `keyboard.spec.ts:28-50` (fluxo só com teclado); `a11y.spec.ts:12-30` (axe por página)
- **Do**:
  - `panels.spec.ts`: (1) `setViewportSize(1440×900)`, `/#/free` com seed. Medir `.canvas` com `boundingBox()`. Clicar "Focar no canvas". Área ÷ (1440·900) ≥ 0,9 (G4). (2) Recolher a paleta → `reload()` → "Expandir paleta" visível (G5, FR-13). (3) Ler o `transform` de `.react-flow__viewport` antes e depois de recolher a paleta → o `scale` igual (FR-16). (4) `/#/problems/url-shortener` → recolher a barra superior → o título do problema visível na faixa. (5) `localStorage['archsim:free']` não tem `palette`, `side`, `top` nem `metrics` (A08). (6) `watchConsole` vazio.
  - `keyboard.spec.ts`: novo teste — `tabTo` "Recolher paleta" → Enter → `tabTo` "Expandir paleta" → Enter → "Buscar serviço" volta a ser alcançável.
  - `a11y.spec.ts`: mais uma entrada, "canvas livre recolhido" — `addInitScript` gravando `archsim:layout` com tudo `true`.
  - Os testes que já existem rodam com o storage limpo: o Playwright cria um contexto novo por teste (`playwright.config.ts:17`, sem `storageState`), então o padrão expandido vale.
- **Tests**: os próprios specs.
- **Check**: `pnpm test:e2e` → toda a suíte verde em chromium e webkit, inclusive `perf.spec.ts` (NFR-1)
- **Depends on**: T3, T7

## Coverage
| PRD item | Task |
|---|---|
| FR-1 | T2, T3 |
| FR-2 | T1, T2, T3 |
| FR-3 | T1, T3 |
| FR-4 | T2 |
| FR-5 | T2, T3 |
| FR-6 | T1 |
| FR-7 | T2 |
| FR-8 | T5 |
| FR-9 | T5 |
| FR-10 | T5, T8 |
| FR-11 | T6 |
| FR-12 | T4, T7 |
| FR-13 | T4, T8 |
| FR-14 | T4, T5 |
| FR-15 | T5 |
| FR-16 | T5, T8 |
| NFR-1 | T2 (hover local), T8 (`perf.spec.ts`) |
| NFR-2 | T2, T3, T5, T6, T8 |
| NFR-3 | T2, T5 (só tokens) + checagem visual na Verificação |
| NFR-4 | T2, T5 (sem transição) |
| NFR-5 | T4 |
| A02 | T2, T3, T8 (`watchConsole` pega CSP) |
| A03 | Nenhuma dependência nova em nenhuma tarefa; `/review-work` confere o lockfile |
| A05 | T2, T5 |
| A06 | T1, T4 |
| A08 | T1, T8 |
| A10 | T1, T4 |
| A01, A04, A07, A09 | N/A no PRD, com motivo |
| §17 Parte A (store, componente, e2e, integridade) | T1, T2, T3 |
| §17 Parte B (leitor, componente, e2e, regressão) | T4, T5, T6, T7, T8 |
| G1–G3 | T3 |
| G4–G5 | T8 |

## Risks
| Risk | Where it bites | What to do if it does |
|---|---|---|
| O jsdom não renderiza conexões do React Flow (os nós não têm medidas) | T2 testes | Testar o `FlowEdge` sozinho dentro de `<ReactFlowProvider>` com props à mão; o comportamento real fica no T3 |
| 120 ms não basta, ou o `mouseleave` do `<g>` dispara ao passar sobre as partículas (`pointer-events: none`, então não deveria) | T3 em WebKit | Subir para 200 ms; se ainda falhar, colocar uma área HTML transparente de 24 px sob o botão como "ponte" |
| A camada de label do React Flow fica abaixo de `.particles` (z-index 4), e o clique não chega ao botão | T3 com simulação | `z-index` no `.edge-remove`/`.edge-label` acima de 4, sem passar dos 5 da `GlobalBar` |
| O e2e do Cmd+Z depende da plataforma | T3 | `process.platform === 'darwin' ? 'Meta' : 'Control'` — o handler aceita os dois (`Canvas.tsx:64`) |
| `useLayout` é lido no import, e os testes herdam estado entre si | T4–T7 | `beforeEach`: `localStorage.clear()` + `useLayout.setState({ collapsed: EXPANDED, before: null })` |
| Renderizar o `Workspace` no jsdom puxa o worker da simulação | T5 testes | `vi.mock('../sim/useSimulation', () => ({ useSimulation: () => {} }))` |
| A borda dupla ou o espaçamento mudam o visual dos testes de a11y (contraste) | T8 | Ajustar o CSS para tokens com contraste já aprovado (`--text-muted` sobre `--bg`) |

## Verification
```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```
Depois, à mão (`pnpm dev`):
1. Canvas livre → Usuários, ALB e EC2 → conectar Usuários → ALB e ALB → EC2 → hover em ALB → EC2 → "×" → clicar → sobra Usuários → ALB com 3 nós → Cmd+Z volta → clicar na conexão, Tab até "Remover conexão", Enter → some.
2. Recolher a paleta, a lateral, a barra de cima e as métricas → o canvas ocupa a tela, sem pulo de zoom → recarregar → continua recolhido → "Restaurar painéis" volta ao estado anterior.
3. `/#/problems/url-shortener` → recolher a barra de cima → o título na faixa → aba Propriedades → recolher a lateral → clicar num nó → o badge "1" → expandir → a aba Propriedades com o nó.
4. Repetir 1–3 com a simulação rodando e nos temas claro e escuro (NFR-3).

## Implementation

**Branch**: `feat/canvas-workspace-ergonomics` · **Base**: `master` · **Date**: 2026-11-13

Toolchain: o `node` do PATH é o 23.11 e o `engines` pede `^22.13 || >=24`, então todos os comandos rodaram com `/opt/homebrew/opt/node@24/bin` (v24.21.0) na frente do PATH.

| Task | Commit | Check | Lint / Types / Tests |
|---|---|---|---|
| T1 | `beabfcd` | ✅ | ✅ ✅ ✅ (486 passed) |
| T2 | `893d297`, `81a76fd` | ✅ | ✅ ✅ ✅ (523 passed) |
| T2a | `49b22a6` | ✅ | ✅ ✅ ✅ (497 passed; e2e 25/25) |
| T3 | `db94a10` | ✅ e2e chromium + webkit | ✅ ✅ ✅ (497 passed; e2e 27/27) |
| T4 | `ae4529c` | ✅ | ✅ ✅ ✅ (511 passed) |
| T5 | `8c6d660` | ✅ | ✅ ✅ ✅ (517 passed; e2e 27/27) |
| T6 | `03e1c9d` | ✅ | ✅ ✅ ✅ (518 passed) |
| T7 | `02b40f2` | ✅ | ✅ ✅ ✅ (519 passed) |
| T8 | `aef8fdb` | ✅ e2e chromium + webkit | ✅ ✅ ✅ (519 passed; e2e 41/41) |

Final: lint ✅, typecheck ✅, `pnpm test` 523 passed (38 arquivos), `pnpm test:e2e` 41 passed (chromium + webkit, incluindo `perf.spec.ts`).

### Deviations
- **T2a (nova, aprovada pelo usuário)**: o e2e do T3 mostrou que, desde antes desta mudança, todas as conexões eram desmontadas e remontadas a cada tick da simulação. A causa: os nós vinham sem `measured` e o React Flow zerava os handles. Isso derrubava o hover e o clique do "×". O Canvas passou a guardar as `dimensions` medidas. Detalhes na seção T2a.
- **T2 — testes**: o jsdom não desenha conexões (nós sem medidas), então os testes de componente ficaram em `canvas/flow-edge.test.tsx` (arquivo novo), com `EdgeLabelRenderer` e `useStore` mockados, em vez de `canvas.test.tsx`. O comportamento real é coberto pelo e2e do T3.
- **T2 — tamanho contra o zoom (`81a76fd`)**: o label fica dentro do viewport com zoom. No zoom padrão (~0,5) o botão media 8×8 px na tela, abaixo dos 16 px do NFR-2. Largura, altura, fonte e borda agora são `16 / zoom` (lidos de `useStore`). Há um teste de unidade nos zooms 0,2/0,5/1/2 e uma checagem de tamanho no e2e.
- **T3**: o hover espera o primeiro resultado da simulação (`Resultado global`), porque ele aumenta os nós e move as conexões. Há também um teste novo de regressão: nenhuma conexão é desmontada em 1 s de simulação. A folga continua em 120 ms; com a T2a, não foi preciso aumentar.
- **T5**: o resumo da faixa de cima no modo livre é `<span class="collapsible-summary">Carga</span>` (o plano dizia `muted`). Os testes de `Workspace` usam o `inlineBackend` real da simulação, como `practice.test.tsx`, em vez de `vi.mock('../sim/useSimulation')`.
- **T6**: o `toggle` é chamado via `useLayout.getState()` (regra de lint `unbound-method`), igual ao `Collapsible`.
- **T8 / G4**: medido em 1440×900 com tudo recolhido, o canvas ocupa **91,9% da área de trabalho** e **86,3% da janela**. O cabeçalho do app (55 px) não é um painel e não recolhe, e as faixas de 32 px ocupam o resto. O e2e afirma ≥ 90% sobre a área de trabalho e anota as duas medidas. **G4 como escrita no PRD (≥ 90% da janela) não é atingida.**

### Definition of Done
- [x] Todos os Must atendem os critérios — FR-1/2/3/4/6 (store + `flow-edge.test.tsx` + `edge-remove.spec.ts`), FR-8/9/10/14 (`collapsible.test.tsx`, `panels.spec.ts`)
- [x] Testes da §17 passando — 523 unit, 41 e2e
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` verdes — saída acima
- [x] O fluxo antigo (selecionar conexão + Delete) continua funcionando — verificado com um e2e avulso em chromium e webkit (selecionar `alb-app`, Delete → uma conexão a menos, 5 nós); não ficou commitado, porque não estava no plano
- [x] Em 1440×900, com tudo recolhido, o canvas ≥ 90% da área de trabalho (G4) — 91,9% da área de trabalho, 86,3% da janela. Em 2026-11-13, depois do merge, o usuário aceitou os 86% da janela e a meta do PRD passou a medir a área de trabalho
- [x] Testado em Chromium e WebKit, temas claro e escuro — e2e nos dois navegadores; temas conferidos por screenshot em Chromium (o "×" com 16 px e as faixas recolhidas legíveis nos dois)

### Verification
- `pnpm lint` → 0 problemas; `pnpm typecheck` → ok; `pnpm test` → 38 arquivos, 523 testes passando; `pnpm test:e2e` → 41 passed (chromium + webkit).
- Repetição (`--repeat-each 4`) do e2e de hover: 8/8, de 0,6 a 1,1 s cada, sem novas tentativas.
- Screenshots (1440×900, problema `url-shortener`): expandido e com tudo recolhido; título na faixa de cima e badge "1" na lateral com um nó selecionado. Temas claro e escuro com o "×" visível.
- Item 3 da verificação manual (aba Propriedades preservada ao expandir) coberto pelo teste de componente que mantém o texto digitado na lateral; não foi refeito à mão no navegador.

### Inherited failures
Nenhuma: com Node 24, o ponto de partida tinha lint/types verdes, 481 testes de unidade e 21 e2e passando.


# Plan: Trocar o idioma do ArchSim entre português e inglês

**PRD**: `docs/work/language-switch-prd.md` · **Approval**: skipped (--auto) · **Date**: 2026-11-16

## Approach
O português continua sendo a fonte e o inglês entra ao lado dele, em cada lugar de onde o texto sai hoje. Nenhum formato que o código lê muda.
- **Interface:** um módulo próprio, `apps/app/src/i18n/`, sem dependência nova. Tem dois dicionários:
  - `pt.ts`, a fonte;
  - `en.ts`, tipado como `Record<keyof typeof pt, string>`, então uma chave faltando é erro de compilação.

  Os componentes leem `t(chave, params)`. O idioma fica num store zustand, com o mesmo armazenamento tolerante do tema, então trocar só re-renderiza.
- **Catálogo:** um arquivo paralelo, `catalog.en.json`, indexado por id de serviço, variante, parâmetro, preço e limite. A função `localizeCatalog(catalog, 'en')` devolve uma cópia só com os textos trocados. O motor e o worker continuam usando o catálogo base.
- **Problemas:** um `problem.en.yaml` ao lado de cada `problem.yaml`, com schema próprio. O servidor manda o `en` junto com o problema público, então a troca não precisa buscar nada de novo.
- **Motor:** os avisos e achados ganham `messageEn` ao lado de `message`, que segue em português para a CLI e o `session.json`.
- **Servidor:**
  - as recusas ganham `errorEn`;
  - o chat ganha `lang`, validado por uma lista fechada, que escolhe a regra de idioma do prompt e o texto do contexto.

**Alternativas que perderam**
- **Biblioteca (i18next, react-intl):** traz dependência e runtime para dois idiomas e cerca de 600 textos. O tipo `Record<keyof typeof pt, string>` já garante a completude em compilação.
- **Campos `labelEn` dentro do `catalog.json` e do `problem.yaml`:** incham o schema que o motor e a CLI leem e misturam a tradução com preços e cotas. O arquivo paralelo fica isolado e é validado por inteiro.
- **O servidor responder no idioma de um cabeçalho:** obrigaria buscar de novo o problema a cada troca, e o FR-2 pede a troca na hora. Ainda assim é o que a rota da referência faz, porque o conteúdo dela não pode ir antes da finalização (veja Decisions).
- **O motor receber `lang` e gerar uma mensagem só:** o `session.json`, que a CLI lê em português, teria que guardar o idioma, e uma troca depois de pontuar não traduziria o resultado.

## Decisions
| Decision | Chosen | Alternatives | Why | Asked / assumed |
|---|---|---|---|---|
| Mecanismo da interface | Módulo próprio: `pt.ts` (fonte), `en.ts` tipado, `t()`, `useT()`, store zustand | i18next, react-intl | Sem dependência (CLAUDE.md). Completude em compilação | Assumed |
| Placeholders | `{nome}`, substituídos como texto, sem HTML | ICU MessageFormat | Bastam números e nomes. O A05 pede texto puro | Assumed |
| Plural | Duas chaves (`…One` / `…Other`) onde aparece contagem | `Intl.PluralRules` | Poucos casos. Explícito | Assumed |
| Formato do catálogo em inglês | `packages/catalog/src/catalog.en.json` com schema zod: `services[id]: {label, description, params{key:{label,unit?}}, prices{id:label}, limits{id:{label,unit?}}, variants{id:{label?, prices?, limits?}}}`. Preços e limites no nível do serviço valem para toda variante, e a variante pode sobrescrever | Campos `En` no `catalog.json` | Isola a tradução. Os rótulos de preço se repetem nas variantes (ex.: as 12 do RDS) | Assumed |
| `fullName` | Segue como está (já em inglês) | — | É o nome oficial da AWS | Assumed |
| Formato dos problemas em inglês | `problems/<id>/problem.en.yaml` com `ProblemText`: `title, statement, functional[], qualitative[], requirements{id:label}, classes{name:label}, followups{id:{question, lookFor[]}}, referenceLabels{nodeId:label}` | Bloco `en:` dentro do `problem.yaml` | O `problem.yaml` segue igual para a CLI. O loader exige o arquivo e valida as chaves contra o problema | Assumed |
| Como o navegador recebe o problema em inglês | O `PublicProblem` e o resumo da lista ganham `en` (sem follow-ups, sem qualitativos, sem rótulos da referência) | Buscar de novo com `?lang=` | Troca na hora (FR-2). O A06 continua: o que é privado não vai | Assumed |
| Rótulos da referência | `GET reference/:id?lang=en` aplica os `referenceLabels`. A tela de solução busca de novo ao trocar | Mandar no `PublicProblem` | A referência só existe depois da finalização (FR-46). Mandar antes vazaria a estrutura | Assumed |
| Texto do motor | `SimWarning`, `Finding` e o erro do `parseDiagram` ganham `messageEn: string`. `message` continua em português. `FindingSchema` aceita `messageEn` como opcional, por causa de sessões e tentativas antigas | Motor com `lang` | O `session.json` e a CLI ficam como estão (FR-13). A troca depois de pontuar traduz o resultado | Assumed |
| Nomes de serviço nas mensagens do motor | O `messageEn` usa o rótulo do catálogo localizado. Rótulos escritos pela pessoa entram como estão | — | Dado da pessoa (PRD §9) | Assumed |
| Rótulo de um nó novo | O rótulo do serviço no idioma ativo no momento de criar. Os nós existentes não mudam | Retraduzir os nós ao trocar | O rótulo vira dado da pessoa, que pode renomear | Assumed |
| Erros do servidor | `Refusal(status, pt, en)`. O corpo fica `{error, errorEn}` e o cliente escolhe pelo idioma | Cabeçalho de idioma | 29 recusas trocadas de forma mecânica, sem estado no servidor | Assumed |
| Idioma do mentor | O corpo do chat ganha `lang: 'pt' \| 'en'` (zod enum, padrão `pt`). O prompt troca a regra "Responda em português do Brasil" por uma constante por idioma, e o contexto usa o texto do problema e os achados nesse idioma. O motivo de recusa da proposta sai no idioma | Instrução livre | Lista fechada (A05). O resto do prompt fica igual, e o cache continua valendo | Assumed |
| Idioma nos testes | `test-setup.ts` fixa `navigator.language = 'pt-BR'` e zera o store antes de cada teste. O Playwright usa `locale: 'pt-BR'` nos dois projetos | Reescrever os testes | O jsdom e o Chromium dizem `en-US`, e o FR-4 abriria o app em inglês. Os testes existentes ficam como estão (PRD §13) | Assumed |
| Varredura do FR-11 | Uma lista de palavras e caracteres que só existem em português (`ç`, `ã`, `õ`, " não ", " você ", "Usuários"…). Ela procura em `innerText`, `aria-label`, `title` e `placeholder`, e ignora o que a pessoa escreveu (`[data-user-content]`) | Detecção de idioma | Determinística e barata. O teste negativo prova que funciona | Assumed |

**Glossário (pt → en)**: gargalo → bottleneck · vazão → throughput · réplica de leitura → read replica · fila → queue · carga → load · custo mensal → monthly cost · premissa → assumption · cota da AWS → AWS quota · Usuários → Users · requisito → requirement · desenho → design (diagram, quando for o canvas) · modo estudo → study mode · mentor → mentor · Finalizar e pontuar → Finish and score.

## Critical files
| File | Role |
|---|---|
| `apps/app/src/theme/theme.ts` | O padrão do armazenamento e da precedência que o idioma copia |
| `apps/app/src/App.tsx:62-77` | O cabeçalho onde o controle entra |
| `apps/app/src/format.ts` | A formatação, hoje fixa em `pt-BR` |
| `packages/catalog/src/schema.ts`, `index.ts` | O catálogo e a carga validada |
| `packages/problems/src/schema.ts`, `load.ts`, `contracts.ts` | Problema, problema público e os contratos de API |
| `packages/sim-engine/src/findings.ts`, `step.ts` | Os textos do motor |
| `apps/app/server/mentor/prompt.ts`, `context.ts`, `chat-route.ts` | O idioma do mentor |

## Tasks

### T1 — Núcleo: idioma, `t()`, controle no cabeçalho, formatação
- **Covers**: FR-1, FR-3, FR-4, FR-10, FR-12, NFR-3, NFR-4, A08, A10
- **Files**:
  - `apps/app/src/i18n/lang.ts`, `i18n/store.ts`, `i18n/pt.ts`, `i18n/en.ts`, `i18n/t.ts`, `i18n/LanguageToggle.tsx`, `i18n/i18n.test.tsx` (novos);
  - `App.tsx`, `format.ts`, `format.test.ts`, `test-setup.ts`, `playwright.config.ts`, `index.html` (edit).
- **Mirror**: `theme/theme.ts:1-50` (storage seguro, `readStored`/`store`/`initial`, aplicar no `documentElement`); `theme/ThemeToggle.tsx` (botão `className="button"`); `theme/theme.test.tsx` (testes com storage dublado).
- **Do**:
  1. `lang.ts`: `type Lang = 'pt' | 'en'`. `readStoredLang` aceita só `pt` ou `en`, e qualquer outro valor vira `null`. `storeLang` não lança erro. `browserLang()`: `navigator.language` começando com `en` → `en`, senão `pt`. `initialLang()`: o salvo, senão o do navegador. `applyLang` grava `document.documentElement.lang` como `pt-BR` ou `en`. A chave é `archsim:lang`.
  2. `store.ts`: um store zustand `{ lang, setLang }`. `setLang` aplica e grava.
  3. `t.ts`:
     - `translate(lang, key, params?)` busca em `en`, cai para `pt` com um `console.warn` em dev se faltar, e substitui `{x}` por `String(params.x)`;
     - `useT()` devolve `t` ligado ao idioma do store;
     - `useLang()` devolve o idioma.
  4. `LanguageToggle`: um grupo `role="group"` com `aria-label` vindo de `t`, e dois botões `PT` / `EN` com `aria-pressed`. Entra no `App.tsx`, ao lado do `ThemeToggle`, e aplica o idioma na montagem, como o tema.
  5. `format.ts`: o locale vem de `useLangStore.getState().lang` (`pt` → `pt-BR`, `en` → `en-US`). As chamadas soltas a `toLocaleString('pt-BR')` do app passam a usar `format.ts`.
  6. O `index.html` mantém `lang="pt-BR"`, e o `applyLang` corrige na carga.
  7. Os testes ficam em PT: no `test-setup.ts`, `navigator.language` é `pt-BR` e o store volta a `pt` em `beforeEach`; no `playwright.config.ts`, `use.locale = 'pt-BR'`.
  8. Os textos do próprio controle e do `ThemeToggle` entram nos dicionários.
- **Tests**:
  - um valor salvo vence o navegador;
  - `"fr"` e `"<script>"` salvos são ignorados;
  - um storage que lança erro não quebra;
  - um navegador `en-GB` abre em `en`, um `pt-PT` em `pt` e um `fr` em `pt`;
  - o `lang` do `<html>` acompanha a troca;
  - uma chave sem `en` (dicionário dublado) mostra o `pt` e avisa;
  - um placeholder com `<b>` aparece como texto;
  - `formatNumber(1234.56)` dá `1.234,56` em PT e `1,234.56` em EN, e o mesmo para moeda;
  - o controle aparece, troca por clique e por teclado, e marca o `aria-pressed`.
- **Check**: `pnpm --filter @archsim/app test -- i18n format theme` → verde. Depois, `pnpm lint && pnpm typecheck && pnpm test`.
- **Depends on**: —

### T2 — Interface: canvas, painéis, arquivos, tela livre
- **Covers**: FR-5, NFR-5, A05
- **Files**: `apps/app/src/canvas/*.tsx|ts` (Palette, ServiceNode, FlowEdge, Canvas, connection-rules, palette-model), `panels/*` (LoadPanel, PropertiesPanel, ParamField, LimitRow, variant-options), `files/*` (FileMenu, save-open), `workspace/*`, `store/defaults.ts`, `routes.ts`/`App.tsx` (NotFound), `i18n/pt.ts`, `i18n/en.ts`
- **Mirror**: as chaves de T1. Os textos atuais passam para `pt.ts` exatamente como estão, para os testes existentes continuarem achando os mesmos textos.
- **Do**:
  - Cada literal visível, `aria-label`, `title` e `placeholder` vira `t('area.chave')`.
  - Os nomes das categorias e dos tipos da paleta também.
  - Os rótulos padrão da carga e do nó Usuários em `defaults.ts` seguem o idioma ativo na criação.
  - Os componentes leem `useT()`. Funções fora do React recebem `lang` ou `t` como parâmetro.
- **Tests**: os existentes seguem verdes em PT. Testes novos:
  - a paleta e o painel de propriedades renderizados com o store em `en` não contêm os textos portugueses do arquivo, por amostra;
  - um rótulo escrito pela pessoa segue como está.
- **Check**: `pnpm --filter @archsim/app test` → verde.
- **Depends on**: T1

### T3 — Interface: prática, estudo, resultado, mentor, conquistas
- **Covers**: FR-5, A05
- **Files**: `apps/app/src/practice/*` (ProblemList, ProblemView, StudyView, ResultScreen, EvaluationPanel, SolutionView, ChatPanel, ProposalCard, MentorLauncher, AgentHint, Achievements, format-req, api.ts, mentor-api.ts), `sim/*` (textos de status), `viz/*`, `i18n/pt.ts`, `i18n/en.ts`
- **Mirror**: T2.
- **Do**:
  - O mesmo de T2 para estas telas. Os erros do cliente (`api.ts:12-14`, "resposta inesperada…") viram chaves.
  - `format-req.ts` (o texto dos requisitos) usa `t`.
  - O markdown do mentor e do enunciado segue no `react-markdown`, sem HTML cru.
- **Tests**:
  - os existentes seguem verdes em PT;
  - a tela de resultado e o painel do chat em `en`, por amostra;
  - uma mensagem do mentor com `<b>` segue como texto (o teste existente, repetido em `en`).
- **Check**: `pnpm --filter @archsim/app test` → verde.
- **Depends on**: T1

### T4 — Catálogo em inglês
- **Covers**: FR-6, NFR-2, NFR-6, A08
- **Files**:
  - `packages/catalog/src/catalog.en.json` e `packages/catalog/src/localize.ts` (novos);
  - `schema.ts`, `index.ts`, `catalog.test.ts`, `localize.test.ts` (edit);
  - `apps/app/src/i18n/catalog.ts` (novo: `useCatalog()`);
  - os consumidores de texto do catálogo no app: `PropertiesPanel`, `variant-options`, `palette-model`, `ServiceNode`, `ProposalCard`, `SolutionView`, `diagram-store` (rótulo de nó novo).
- **Mirror**: `packages/catalog/src/index.ts:6-13` (carregar, validar e lançar erro se inválido); o schema `.strict()` de `schema.ts`.
- **Do**:
  1. Um `CatalogText` em zod, com o formato da tabela de decisões, `.strict()`.
  2. `localizeCatalog(c, lang)`:
     - `pt` devolve `c`;
     - `en` devolve uma cópia profunda só com `label`, `description` e `unit` trocados, guardada em memória por catálogo;
     - um texto que faltar fica em `pt` (o teste impede que isso chegue ao repositório).
  3. Exportar `catalogEn` validado na carga.
  4. Escrever as traduções dos 23 serviços, seguindo o glossário e os termos da AWS. As unidades em português ("fração", "conexões/s", "chamadas", "avaliações/s", "registros/s") também.
  5. No app, `useCatalog()` devolve o catálogo localizado para exibição, e o worker e a simulação seguem com o base.
- **Tests**:
  - todo serviço, variante, parâmetro, preço e limite tem texto `en` não vazio;
  - não há chave órfã (id que não existe no catálogo);
  - o `catalog.en.json` com uma chave desconhecida é recusado;
  - `localizeCatalog` não muda nenhum número, id ou preço (comparação profunda, sem os textos);
  - `localizeCatalog(c, 'pt') === c`.
- **Check**: `pnpm vitest run --project @archsim/catalog`, depois o gate.
- **Depends on**: T1 (para o `useCatalog`)

### T5 — Motor: avisos, achados e erros de diagrama nos dois idiomas
- **Covers**: FR-8, FR-13, A06
- **Files**:
  - `packages/sim-engine/src/findings.ts`, `step.ts`, `graph.ts`, `diagram.ts`, `kinds/queue.ts`;
  - os tipos de aviso e achado;
  - `packages/problems/src/contracts.ts` (`FindingSchema`, avisos);
  - `findings.test.ts`, `step.test.ts`;
  - `apps/app/src/practice/ResultScreen.tsx`, os painéis que mostram avisos, `files/FileMenu.tsx`.
- **Mirror**: `findings.ts:172-262` (cada achado monta `message`); `findings.ts:44-48` (os formatadores `n` e `usd`).
- **Do**:
  - Cada lugar que monta `message` monta também `messageEn`, com formatadores em `en-US` e os nomes vindos de `localizeCatalog(catalog, 'en')`.
  - `message` continua igual, byte a byte.
  - `FindingSchema` e o schema de aviso ganham `messageEn: z.string().optional()`.
  - O app mostra `lang === 'en' ? (x.messageEn ?? x.message) : x.message`.
  - O NFR-11 (sem nome de serviço AWS no motor) continua valendo, porque os nomes vêm do catálogo.
- **Tests**:
  - `NO_ENTRY` tem `message` e `messageEn` esperados;
  - um gargalo, um requisito reprovado e um superdimensionado dão `messageEn` com os mesmos números em formato en-US;
  - os testes existentes de `message` não mudam;
  - um `session.json` antigo, sem `messageEn`, ainda passa no schema;
  - o mesmo diagrama dá o mesmo `SimResult` numérico (FR-13).
- **Check**: `pnpm vitest run --project @archsim/sim-engine --project @archsim/problems`, depois o gate. `pnpm -s archsim simulate --diagram problems/url-shortener/reference.archsim.json --problem url-shortener` segue em português.
- **Depends on**: T4

### T6 — Problemas e conquistas em inglês
- **Covers**: FR-7, NFR-2, NFR-6, A06, A08
- **Files**:
  - `problems/*/problem.en.yaml` (10 novos);
  - `packages/problems/src/schema.ts` (`ProblemText`), `load.ts`, `contracts.ts` (`PublicProblem.en`, resumo `en`), `achievements.ts`, `bank.test.ts`, `schema.test.ts`;
  - `apps/app/server/routes.ts` (`problems`, `problems/:id`, `reference/:id?lang=`), `apps/app/server/routes.test.ts`;
  - `apps/app/src/practice/api.ts`, `ProblemList`, `ProblemView`, `StudyView`, `SolutionView`, `Achievements`.
- **Mirror**:
  - `load.ts:40-46` (`parseProblem`: YAML no core schema, depois zod);
  - `schema.ts:118-150` (`PublicProblem` e `toPublic`, que escolhe o que o navegador vê);
  - `routes.ts:175-177` (a referência só depois da finalização).
- **Do**:
  1. `ProblemText` `.strict()` com o formato da tabela de decisões. O `superRefine` contra o `Problem`:
     - os ids de requisito, de classe e de follow-up batem exatamente, sem faltar nem sobrar;
     - o número de itens de `functional` e de `qualitative` é igual;
     - os `referenceLabels` cobrem todos os nós da referência.
  2. `loadProblem` lê e valida `problem.en.yaml`. Se o arquivo faltar ou estiver inválido, o problema não carrega, com a mesma regra do `problem.yaml`.
  3. `toPublic` inclui `en: {title, statement, functional, requirements, classes}`, sem follow-ups, qualitativos ou `referenceLabels`.
  4. `reference/:id` aceita `lang` só de uma lista fechada e aplica `referenceLabels` quando é `en`.
  5. As conquistas ganham `en: {title, description}`.
  6. O app escolhe o texto pelo idioma. A tela de solução busca de novo quando o idioma muda.
  7. Escrever os 10 `problem.en.yaml`.
- **Tests**:
  - os 10 problemas carregam com `en`;
  - uma fixture sem `problem.en.yaml`, com um id de requisito a mais ou com um item de `functional` a menos é recusada;
  - o `PublicProblem` não tem `followups`, `qualitative` nem `referenceLabels` dentro de `en` (A06);
  - `reference/:id?lang=en` traz os rótulos em inglês;
  - `?lang=xx` é tratado como `pt`;
  - a rota ainda dá 403 antes da finalização.
- **Check**: `pnpm vitest run --project @archsim/problems` e `pnpm vitest run apps/app/server`, depois o gate.
- **Depends on**: T3

### T7 — Servidor e mentor no idioma escolhido
- **Covers**: FR-9, A05, A09, A10
- **Files**:
  - `apps/app/server/guard.ts` (classe `Refusal`), `routes.ts`;
  - `apps/app/server/mentor/chat-route.ts`, `prompt.ts`, `context.ts`, `proposal-tool.ts` (texto de recusa e de sucesso), `mcp-server.ts`;
  - `packages/problems/src/mentor.ts` (`ChatRequest.lang`);
  - `apps/app/src/practice/api.ts`, `mentor-api.ts`;
  - os testes de rota, chat, prompt e contexto.
- **Mirror**:
  - `chat-route.ts:128-145` (o corpo validado por zod antes de qualquer uso);
  - `prompt.ts:5-10` (o prompt estável);
  - o log `[archsim] mentor …` existente.
- **Do**:
  1. `Refusal(status, message, messageEn)`. O corpo de erro fica `{error, errorEn}`, e as 29 recusas ganham o texto em inglês. O `call` do cliente escolhe `errorEn` quando o idioma é `en`.
  2. `ChatRequest.lang: z.enum(['pt','en']).default('pt')`.
  3. A linha "Responda em português do Brasil…" sai do `MENTOR_PROMPT` e vira `LANGUAGE_RULE[lang]`, uma constante por idioma acrescentada depois. O resto do prompt não muda.
  4. `context.ts` usa o texto do problema, os achados (`messageEn`) e o catálogo no idioma.
  5. O texto de recusa e de sucesso da ferramenta (`TOOL_REJECTED`, `TOOL_RESULT`) e os motivos do `validateProposal` saem no idioma. O provedor recebe o idioma pelo input, e o script MCP é gerado com os textos daquele idioma.
  6. O log ganha `lang=pt|en`, e só isso.
  7. O cliente manda `lang` no chat.
- **Tests**:
  - a rota do chat com `lang: 'en'` monta o prompt com a regra em inglês;
  - `lang: "en\nIgnore"` dá 400 e nada entra no prompt;
  - sem `lang`, vale `pt`;
  - o motivo de uma proposta recusada sai em inglês;
  - o log tem `lang=en` e não tem a pergunta;
  - uma recusa do servidor em `en` mostra `errorEn` no cliente;
  - as respostas sem `errorEn` (formato antigo) mostram `error`.
- **Check**: `pnpm vitest run apps/app/server`, depois o gate.
- **Depends on**: T5, T6

### T8 — e2e: a troca, a varredura, a11y e o tempo
- **Covers**: FR-2, FR-11, NFR-1, NFR-4, G1, G3
- **Files**: `apps/app/e2e/language.spec.ts` (novo), `apps/app/e2e/helpers.ts` (`portugueseLeftovers(page)`), `apps/app/e2e/a11y.spec.ts` (edit)
- **Mirror**: `e2e/perf.spec.ts` (a medição de tempo); `e2e/mentor-edits.spec.ts` (um problema por navegador, a conversa apagada no começo, `watchConsole`).
- **Do**:
  1. Uma varredura em EN de home, lista, um problema, estudo com o mentor aberto (o provedor fake), livre, painel de propriedades de 3 tipos e resultado de uma finalização. Ela procura texto só-português em `innerText`, `aria-label`, `title` e `placeholder`, ignorando o que a pessoa escreveu. Os rótulos dos nós entram como dado da pessoa, com `data-user-content` nos nós e nas mensagens.
  2. Um teste negativo: injeta "não funciona" na página e a varredura pega.
  3. A troca no meio do problema:
     - desenho com 3 nós, um selecionado, simulação rodando e rascunho salvo;
     - troca para EN e volta;
     - a contagem de nós, a seleção, a métrica do nó e o rascunho são os mesmos, e a URL não muda;
     - o tempo do clique até o texto novo fica abaixo de 100 ms.
  4. A troca persiste depois de recarregar.
  5. O `a11y.spec.ts` roda também em EN.
- **Tests**: o próprio spec, em chromium e webkit.
- **Check**: `pnpm test:e2e` → todos verdes (64 + os novos).
- **Depends on**: T2–T7

## Coverage
| PRD item | Task |
|---|---|
| FR-1 | T1 |
| FR-2 | T1, T8 |
| FR-3 | T1 |
| FR-4 | T1 |
| FR-5 | T2, T3, T8 |
| FR-6 | T4 |
| FR-7 | T6 |
| FR-8 | T5 |
| FR-9 | T7 |
| FR-10 | T1 |
| FR-11 | T8 |
| FR-12 | T1 |
| FR-13 | T5, T6 |
| NFR-1 | T8 |
| NFR-2 | T1 (tipo), T4, T6 |
| NFR-3 | T1 |
| NFR-4 | T1, T8 |
| NFR-5 | T1, T2, T3 |
| NFR-6 | T4, T6 (glossário), amostra no PR |
| A03 | Nenhuma dependência nova; `pnpm audit` no review |
| A05 | T1, T3, T7 |
| A06 | T5, T6 |
| A08 | T1, T4, T6 |
| A09 | T7 |
| A10 | T1, T7 |
| A01, A02, A04, A07 | N/A (PRD §12). Os testes do guard seguem verdes em T7 |

## Risks
| Risk | Where it bites | What to do if it does |
|---|---|---|
| Um componente que formata número sem usar `useT` não re-renderiza ao trocar | T1–T3 | Todo componente que formata chama `useLang()`. O e2e do T8 confere os números em EN |
| Os nós do React Flow são memorizados e não pegam a troca | T2 | O `ServiceNode` assina `useLang()` direto |
| O `messageEn` do motor depende do catálogo localizado, e o motor importa o catálogo | T5 | O `localize.ts` fica no pacote do catálogo, que o motor já importa. Sem ciclo |
| A geração do script MCP por idioma muda o cache do provedor | T7 | O prompt de sistema segue estável. Só os textos da ferramenta mudam por idioma |
| O volume de tradução deixa T4 e T6 enormes | T4, T6 | Os commits ficam por tarefa. Se uma tarefa passar de um commit revisável, ela é dividida e a divisão anotada como desvio |
| Um teste existente procura um texto que mudou de lugar | T2, T3 | O texto em PT fica idêntico. Se mudar, é desvio anotado, nunca um teste apagado |

## Verification
PRD §18, com estes detalhes:
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit`.
- Preview (`ARCHSIM_PRACTICE_DIR` num diretório temporário do scratchpad), no navegador:
  1. Abrir em PT e trocar para EN em home, lista e url-shortener.
  2. Montar 3 nós e simular. Trocar e voltar: tudo igual.
  3. No estudo, com a assinatura real, perguntar em EN: a resposta vem em inglês. "Add a MongoDB" dá a recusa com o motivo em inglês.
  4. Finalizar: achados, score e números em en-US. Ver a solução: rótulos em inglês.
  5. Recarregar: continua em EN.
  6. `pnpm -s archsim simulate` segue em português.
- O PR leva a amostra para revisão: o enunciado de 2 problemas, 5 serviços e 10 textos da interface.

## Implementation

**Branch**: `feat/i18n-pt-en` · **Base**: `master` · **Date**: 2026-11-16

| Task | Commit | Check | Lint / Types / Tests |
|---|---|---|---|
| T1 | `2888e87` | ✅ | ✅ ✅ ✅ (756) |
| T2 | `eaaa013` | ✅ | ✅ ✅ ✅ (761) |
| T3 | `2c8ec59` | ✅ | ✅ ✅ ✅ (764) |
| T4 | `882de62` | ✅ | ✅ ✅ ✅ (774) |
| T5 | `db77942` | ✅ | ✅ ✅ ✅ (779) |
| T6 | `ab5011b` | ✅ | ✅ ✅ ✅ (796) |
| T7 | `17d5cd6` | ✅ | ✅ ✅ ✅ (800) |
| T8 | `31ea500` | ✅ (80 e2e) | ✅ ✅ ✅ (800) |

Linha de base: 744 testes unitários e 64 e2e, todos verdes. No fim: 800 unitários e 80 e2e (os 64 de antes, mais 6 de idioma e 10 de acessibilidade em inglês), verdes.

### Deviations
- **T1** — a formatação solta no `PropertiesPanel` e no `ChatPanel` ficou para T2 e T3, que já mexiam nesses arquivos. O aviso de tradução faltando sai sempre, e não só em dev, porque o `import.meta.env` não existe quando o servidor importa o módulo.
- **T2/T3** — entraram também `store/proposal.ts` (`describeOp`), os avisos do `diagram-store.ts` e os erros do `sim-client.ts`, que mostram texto ao usuário e a lista de arquivos não citava. Os helpers fora do React recebem `lang` ou usam `tr()`, e o componente que os chama assina o idioma.
- **T4** — o `catalogVersion` não subiu: o `catalog.json` não mudou, e a tradução fica em `catalog.en.json`.
- **T5** — os avisos de simulação (`SimWarning`) não ganharam `messageEn`. O app não os mostra em lugar nenhum; eles só vão para a CLI e para a sessão, em português. Ganharam inglês os achados e os erros de arquivo de diagrama, que a pessoa vê. Os JSON Schemas foram regenerados (`pnpm schemas`).
- **T6** — em vez de reescrever o diagrama, um store (`i18n/problem-text.ts`) leva para os painéis os rótulos em inglês das classes e dos requisitos do problema aberto. O resumo da lista ganhou `titleEn`.
- **T7** — os textos que só o modelo lê (`TOOL_RESULT`, `TOOL_REJECTED` e o resto do prompt) ficaram em português, com a regra de idioma pedindo a resposta em inglês. O script MCP não precisou ser gerado por idioma. O motivo de uma recusa, que a pessoa vê, sai no idioma do pedido. O `ApiError` guarda o texto em português para comparação (`ProposalCard`). O ajuste do teste de troca do T6 (comparar o conteúdo do diagrama em vez da identidade) entrou neste commit.
- **T8** — a varredura ignora o que a pessoa e o mentor escreveram por seletor (`.service-node-label`, `.chat-msg`, `.proposal`), sem o atributo `data-user-content` nos componentes. Ela achou dois problemas reais, já corrigidos:
  - o título da solução, que vinha do `name` da referência em português;
  - o nome acessível do controle de idioma, que não continha o texto visível (axe `label-content-name-mismatch`).
- **T8** — o primeiro commit do T8 passou com 2 erros de lint, porque um pipe escondeu o código de saída do gate. Foi corrigido com `--amend` antes de qualquer push.

### Definition of Done
- [x] Todo Must atende ao critério de aceite: FR-1 a FR-13 com testes unitários e e2e.
- [x] O teste do NFR-2 passa. Na interface, o tipo `Record<Key, string>` e o teste de placeholders garantem a completude. O catálogo passa por `catalogTextGaps` e pela checagem de português. Os 10 problemas passam pelo `problemTextGaps` na carga e pela checagem de português no `bank.test`.
- [x] O e2e do FR-11 passa em chromium e webkit, e o teste negativo pega uma string injetada.
- [x] Os testes existentes que procuram texto em português seguem verdes em PT.
- [x] Roteiro do §18:
  - a interface foi coberta pelo e2e nos dois navegadores: home, lista, problema, propriedades, resultado, solução, estudo e canvas livre, além da troca no meio do problema com recarga;
  - o mentor real (assinatura) respondeu em inglês às duas perguntas, no preview com um diretório de prática temporário;
  - `pnpm -s archsim simulate` segue em português.
- [x] `pnpm lint`, `typecheck`, `test` (800) e `test:e2e` (80) passam. O `pnpm audit` acusa 1 moderate em `minimatch` (dev, via eslint), herdado e sem dependência nova neste branch.
- [ ] A amostra da tradução para a pessoa revisar vai no PR.

### Verification
- Mentor real, em inglês, com `lang=en` e a assinatura:
  - "What is the bottleneck here?" → a resposta veio em inglês, com os números da simulação;
  - "Add a MongoDB database" → em inglês, sem card. O modelo não chamou a ferramenta e explicou que o MongoDB não está no catálogo, com o DynamoDB como alternativa. O motivo de recusa em inglês está coberto pelo teste da rota.
- Log: `... propostas=0 rejeitadas=0 lang=en`, sem a pergunta.
- Tempo até o primeiro token: 4,6 s e 5,3 s.
- A troca no meio do problema leva menos de 100 ms, medida no e2e.

### Inherited failures
Nenhuma nos testes. O aviso do audit (`minimatch`) é anterior ao branch.

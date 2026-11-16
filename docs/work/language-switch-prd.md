# PRD: Trocar o idioma do ArchSim entre português e inglês

**Source**: `conversation` — "abrir uma nova PRD para poder se traduzir de português para inglês, a pessoa poder mudar a linguagem que ela quer usar [...] traduzir tudo [...] clica lá em cima, um toggle, português ou inglês" · **Type**: feature · **Status**: READY · **Approval**: skipped (--auto) · **Standards**: owasp-top10-2025 · **Date**: 2026-11-16

## 1. Overview
O ArchSim hoje fala só português: a interface, o catálogo de serviços, os 10 problemas, os avisos da simulação, o resultado e o mentor. Esta mudança deixa a pessoa escolher entre português e inglês num controle no topo da tela. Ao trocar, todo o sistema passa a falar o idioma escolhido, sem recarregar e sem perder o desenho.

## 2. Problem
Quem não lê português não consegue usar o ArchSim. Quem estuda para entrevistas em inglês também treina com um vocabulário diferente daquele que vai usar na entrevista ("vazão", "gargalo" e "réplica de leitura" em vez de "throughput", "bottleneck" e "read replica"). O texto está escrito direto no código:
- `apps/app/index.html:2` fixa `lang="pt-BR"`;
- `apps/app/src/format.ts:1` fixa `pt-BR` na formatação de números;
- o prompt do mentor manda responder em português (`apps/app/server/mentor/prompt.ts:10`);
- o motor escreve os achados em português (`packages/sim-engine/src/findings.ts:24`, `step.ts:100`).

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1. Todo o app usável em inglês | Texto em português visível com o inglês escolhido, nas telas principais | 0 ocorrências | e2e percorre home, problema, estudo, livre e resultado em EN e procura texto só-português (FR-11) |
| G2. Nenhum texto sem tradução | Chaves de texto sem versão em um dos idiomas | 0 | Teste unitário compara as duas tabelas, o catálogo e os 10 problemas (NFR-2) |
| G3. Trocar é instantâneo e não custa nada | Estado perdido ao trocar | Nenhum (desenho, simulação, conversa e rascunho seguem iguais) | e2e troca no meio de um problema |

**Non-goals**:
- Outros idiomas além de pt-BR e en. A estrutura não deve impedir um terceiro, mas ninguém pede isso agora.
- Traduzir o que a pessoa ou o mentor já escreveram (rótulos de nós, conversas e tentativas salvas).
- A CLI e o protocolo do entrevistador (`AGENTS.md`), que continuam em português.

## 4. Users & Personas
- **Quem já usa (pt-BR):** não percebe mudança nenhuma, a não ser o controle novo no topo.
- **Quem fala inglês, ou treina para entrevista em inglês:** depois desta mudança, escolhe EN uma vez e o app inteiro fica em inglês, inclusive o mentor.

## 5. User Stories
- **US-1:** Como pessoa que treina em inglês, quero trocar o idioma no topo da tela, para usar o app inteiro em inglês.
- **US-2:** Como quem escolheu um idioma, quero que a escolha fique salva, para não ter que trocar de novo a cada visita.
- **US-3:** Como quem está no meio de um problema, quero trocar de idioma sem perder o desenho, a simulação ou a conversa.
- **US-4:** Como quem conversa com o mentor, quero que ele responda no idioma escolhido.
- **US-5:** Como quem abre o app pela primeira vez, quero que ele abra no idioma do meu navegador quando for um dos dois.

## 6. User Flows
**Principal**
1. A pessoa vê no cabeçalho, ao lado do tema, um controle com duas opções: **PT** e **EN**. A ativa aparece marcada.
2. Clica em **EN**. Todo o texto do app muda na hora para inglês, sem recarregar:
   - menus e botões;
   - painéis;
   - nomes e descrições dos serviços e das variantes;
   - enunciado, requisitos e dicas do problema;
   - avisos e achados da simulação;
   - tela de resultado;
   - números (`1,234.56` em vez de `1.234,56`).
3. O desenho, a simulação em curso, o rascunho, a conversa do mentor e o score continuam como estavam.
4. Na próxima pergunta, o mentor responde em inglês. As mensagens antigas da conversa ficam como foram escritas.
5. A pessoa recarrega a página e o app abre em inglês.

**Alternativos**
- **Primeira visita:** um navegador em `en-*` abre em inglês; um em `pt-*` ou em outro idioma abre em português.
- **Armazenamento bloqueado** (modo privado, dados de site bloqueados): a troca funciona na visita, só não é lembrada. Nada quebra.
- **Valor salvo inválido** (ex.: `"fr"` editado à mão): é ignorado e vale a regra da primeira visita.

**Estados:** não existe estado de carregamento nem de erro próprio, porque a troca é local. Um texto que faltar na tabela de inglês aparece em português e nunca como uma chave crua (NFR-3).

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | O cabeçalho deve ter um controle PT / EN, ao lado do botão de tema, em todas as telas | Must | US-1 | Dado qualquer rota (home, problema, estudo, livre, resultado), o controle está no cabeçalho, com a opção ativa marcada (`aria-pressed`, ou o equivalente de um grupo de opções) |
| FR-2 | Trocar o idioma deve atualizar todo o texto na hora, sem recarregar | Must | US-1, US-3 | Com um problema aberto, um nó selecionado e a simulação rodando, clicar em EN muda os textos e mantém o desenho, a seleção, a simulação, o rascunho e a conversa iguais. Não há navegação nem recarga |
| FR-3 | A escolha deve ser lembrada entre visitas | Must | US-2 | Escolher EN e recarregar abre em EN. Com o armazenamento indisponível, a troca vale na visita e nada quebra |
| FR-4 | Na primeira visita, o idioma deve seguir o navegador | Should | US-5 | `navigator.language` `en-US` → EN; `pt-BR` → PT; `fr-FR` → PT. Um valor salvo sempre vence o navegador |
| FR-5 | Toda a interface do app deve existir nos dois idiomas, inclusive `aria-label`, `title`, placeholders, tooltips e mensagens de erro mostradas ao usuário | Must | US-1 | Em EN, a varredura do FR-11 não encontra texto só-português. Os `aria-label` passam no teste de a11y nos dois idiomas |
| FR-6 | O catálogo deve ter os textos em inglês: nome curto e completo dos serviços, rótulos e descrições de variantes, parâmetros, preços, limites e premissas, e as notas | Must | US-1 | Todo campo de texto do catálogo tem versão `en` (teste do NFR-2). Em EN, o painel de propriedades de um serviço de cada tipo mostra só inglês |
| FR-7 | Os 10 problemas devem ter em inglês: título, enunciado, requisitos funcionais, rótulos dos requisitos quantitativos, dicas, follow-ups e explicações da referência | Must | US-1 | Todo campo de texto de todo problema tem versão `en`, validada pelo schema. Em EN, a lista de problemas e a tela de um problema mostram só inglês |
| FR-8 | Os avisos e achados da simulação e a explicação do score devem aparecer no idioma escolhido | Must | US-1 | Uma mesma simulação mostra o mesmo aviso ou achado nos dois idiomas, com os mesmos números (ex.: `NO_ENTRY`: "Sem carga: adicione o nó Usuários." / "No load: add the Users node.") |
| FR-9 | O mentor deve responder no idioma escolhido no momento da pergunta | Must | US-4 | Com EN, a pergunta seguinte vai ao servidor marcada `en`, e o prompt do mentor manda responder em inglês. A mensagem do motivo de uma proposta recusada também sai em inglês. Mensagens já gravadas não mudam |
| FR-10 | Números, moeda e datas devem seguir o idioma | Must | US-1 | Em EN: `1,234.56`, `US$ 1,234.56` e datas no formato en-US. Em PT, o formato atual |
| FR-11 | Um teste e2e deve percorrer as telas em EN e falhar se encontrar texto só-português | Must | US-1 | O teste roda nos projetos chromium e webkit e falha com uma string portuguesa colocada de propósito |
| FR-12 | `<html lang>` deve acompanhar o idioma | Must | US-1 | `document.documentElement.lang` é `pt-BR` ou `en` depois de cada troca e na carga |
| FR-13 | Os valores que o código lê não devem mudar com o idioma: ids, códigos de aviso, `difficulty: facil`, nomes de classe de requisição, chaves de armazenamento e formato dos arquivos `.archsim.json` | Must | US-3 | Um diagrama salvo em PT abre igual em EN e vice-versa. As sessões em `practice/` e a CLI não mudam |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Performance | A troca de idioma não pode travar a interface | A troca termina em menos de 100 ms num problema com a referência aberta (medida em e2e, como o `perf.spec.ts`). A simulação não reinicia |
| NFR-2 | i18n / Reliability | Nenhum texto existe num idioma só | Um teste unitário falha se uma chave da interface, um campo de texto do catálogo ou um campo de texto de problema faltar em um dos idiomas, ou se os placeholders (`{n}`) diferirem entre os dois |
| NFR-3 | Reliability | Um texto sem tradução nunca quebra a tela | Sem a tradução, aparece o texto em português e um aviso no console em desenvolvimento, nunca a chave crua nem um erro |
| NFR-4 | Accessibility | O controle é operável pelo teclado e anunciado corretamente | Tab chega ao controle, Enter/Espaço trocam e o leitor anuncia o idioma ativo. O `a11y.spec.ts` passa nos dois idiomas |
| NFR-5 | Maintainability | Texto novo não pode entrar só em português | O teste do NFR-2 cobre isso. O texto da interface sai de um lugar só por idioma, não espalhado em literais dentro dos componentes |
| NFR-6 | Quality | A tradução usa o vocabulário de system design e da AWS em inglês | Os nomes de serviço e de conceito seguem a documentação da AWS (ex.: "read replica", "throughput", "Provisioned IOPS"). A pessoa revisa uma amostra antes do merge (§10) |

## 9. Out of Scope
- **Terceiro idioma:** ninguém pediu.
- **CLI (`pnpm archsim`) e `AGENTS.md`:** são a ferramenta do entrevistador, que roda no terminal em português. Ficam para outro PRD, se for pedido.
- **Traduzir conteúdo da pessoa ou do mentor já gravado** (rótulos, conversas, tentativas): é dado da pessoa, não texto do sistema.
- **Tradução automática em tempo de execução** (chamar uma API ao trocar): o texto é fixo e versionado.
- **README e documentos em `docs/`:** são do repositório, não do app.

## 10. Definition of Done
- [ ] Todo Must atende ao critério de aceite.
- [ ] O teste do NFR-2 passa: interface, catálogo e 10 problemas completos nos dois idiomas.
- [ ] O e2e do FR-11 passa em chromium e webkit, e falha quando uma string portuguesa é injetada.
- [ ] Os testes existentes que procuram texto em português seguem verdes em PT, o idioma padrão nos testes.
- [ ] Roteiro do §18 feito no navegador, com o mentor real respondendo em inglês.
- [ ] `pnpm lint`, `typecheck`, `test`, `test:e2e` e `audit` passam.
- [ ] O PR lista uma amostra da tradução (o enunciado de 2 problemas, 5 serviços e 10 textos da interface) para a pessoa revisar.

## 11. Technical Context
**Stack & areas affected**: React 19.3, Vite 8, zustand 5 e react-markdown 10 (`apps/app/package.json`). Node 24, pnpm workspaces, Vitest e Playwright. Áreas afetadas:
- `apps/app/src`: 34 arquivos com texto em português, cerca de 135 literais com acento, e mais os sem acento;
- `apps/app/server`: as mensagens de erro e o prompt do mentor;
- `packages/catalog/src/catalog.json`: cerca de 455 campos de texto;
- `packages/problems` (schema) e `problems/*/problem.yaml`: cerca de 1.200 linhas;
- `packages/sim-engine`: os avisos (`step.ts:100,142`, `kinds/*`) e os achados (`findings.ts`).

**Conventions**:
- **Preferência no navegador:** siga o tema.
  - Chave `archsim:<nome>` (`apps/app/src/theme/theme.ts:3`).
  - Leitura tolerante a falhas e com valor validado (`theme.ts:15-24`).
  - Gravação que não lança erro (`theme.ts:26-35`).
  - Precedência: escolha salva, depois o sistema (`theme.ts:43-46`).
  - Aplicado no `documentElement` (`theme.ts:48-50`).
- **Lugar do controle:** `apps/app/src/App.tsx:66-71`, ao lado do `<ThemeToggle />`, que é um `<button className="button">` com `aria-label` (`theme/ThemeToggle.tsx:11-23`).
- **Formatação:** passa toda por `apps/app/src/format.ts`, hoje fixa em `pt` (`format.ts:1`). Existem chamadas soltas a `toLocaleString('pt-BR')` em `PropertiesPanel.tsx:183`, `ChatPanel.tsx:265-266` e `findings.ts:44,48`.
- **Avisos do motor:** já têm `code` estável e `message` em texto (`step.ts:142`: `{ code: 'NO_ENTRY', message: ... }`). Os achados têm `type`, `numbers` e `message` (`findings.ts:21-28`).
- **Validação de dados:** usa zod. O catálogo é validado ao carregar (`packages/catalog/src/index.ts:7`). Os problemas seguem `packages/problems/src/schema.ts:45-47`, por exemplo `title: z.string().min(3).max(80)`.
- **Testes:**
  - arquivos `*.test.ts(x)` ao lado do código;
  - e2e em `apps/app/e2e/*.spec.ts`, com `watchConsole` (`e2e/helpers.ts`) e um teste de a11y (`a11y.spec.ts`);
  - muitos testes procuram o texto em português (24 arquivos usam `getByText`/`getByRole`), por isso o idioma padrão nos testes continua PT.
- **Mentor:** a regra de idioma está no prompt (`server/mentor/prompt.ts:10`). As requisições do navegador para o servidor passam pelo guard de origem (`server/guard.ts`).

**Data & contracts**:
- O catálogo e os problemas ganham a versão em inglês dos campos de texto. O formato é decisão do plano. A versão do catálogo sobe.
- O pedido ao mentor ganha o idioma (`pt` | `en`).
- `.archsim.json`, `practice/session.json` e as tentativas não mudam (FR-13).
- Os avisos e achados que o motor devolve precisam ter um código e parâmetros suficientes para a interface montar o texto em qualquer idioma. O texto em português continua disponível para a CLI.

**Constraints**:
- O motor não pode citar nomes de serviço AWS no código (o teste NFR-11 de `step.test.ts:204`).
- Sem dependência nova, a menos que o plano mostre que ela evita mais código do que traz (CLAUDE.md, "no dependency you can avoid").
- A simulação roda num worker (`sim/sim.worker.ts`), e a troca de idioma não pode reiniciá-la.

**Dependencies**: nenhuma externa. O mentor real é testado com a assinatura `claude` instalada, como nos PRs anteriores.

## 12. Security & Compliance

### OWASP Top 10:2025
| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | Não | A troca é local e não abre rota nem permissão nova. As rotas do mentor seguem atrás do guard de origem | O teste do guard existente segue verde |
| A02 | Security Misconfiguration | Não | Sem configuração nova, variável de ambiente ou cabeçalho | — (nada a configurar) |
| A03 | Software Supply Chain Failures | Sim, se o plano trouxer uma biblioteca de i18n | Uma dependência nova precisa de justificativa no plano, versão fixa e `pnpm audit` sem achado novo | `pnpm audit` no review |
| A04 | Cryptographic Failures | Não | Nenhum dado sensível é guardado. A preferência é `pt` ou `en` | — (sem segredo nem dado pessoal) |
| A05 | Injection | Sim | Os textos traduzidos e os parâmetros interpolados (rótulos que a pessoa escreveu) aparecem como texto, nunca como HTML: nada de `dangerouslySetInnerHTML`. O markdown dos enunciados segue no `react-markdown` sem HTML cru. No servidor, o idioma do pedido ao mentor passa por uma lista fechada (`pt` | `en`) antes de entrar no prompt. Outro valor dá 400 ou cai no padrão, mas nunca é concatenado | Unitário: um rótulo `<b>x</b>` interpolado aparece como texto. Rota: `lang: "en\nIgnore..."` não entra no prompt |
| A06 | Insecure Design | Sim | O idioma não muda o que o código lê (FR-13): ids, códigos e formatos de arquivo são os mesmos | Unitário: o mesmo diagrama simula igual e salva o mesmo JSON nos dois idiomas |
| A07 | Authentication Failures | Não | Sem autenticação no app (uso local) | — |
| A08 | Software or Data Integrity Failures | Sim | O valor lido do armazenamento é validado contra a lista fechada. Catálogo e problemas com tradução faltando ou malformada são recusados na carga e nos testes | Unitário: valor salvo `"fr"`/`"<script>"` → ignorado. Teste do schema dos problemas e do catálogo sem `en` → falha |
| A09 | Security Logging and Alerting Failures | Sim, pouco | O log do mentor (`[archsim] mentor ...`) pode ganhar `lang=`, mas não o texto da pergunta. Nada de dado pessoal novo no log | O teste do log do mentor existente, mais o campo `lang` |
| A10 | Mishandling of Exceptional Conditions | Sim | Tradução ausente → português (NFR-3). Armazenamento que lança erro → a troca vale só na visita (FR-3). Idioma desconhecido no servidor → padrão | Unitários dos três casos |

**Existing controls at risk**:
- O guard de origem das rotas do mentor: não pode ficar mais frouxo ao aceitar o campo novo.
- A validação zod do catálogo e dos problemas: não pode ser afrouxada para aceitar campo sem tradução.

**Secrets / PII touched**: nenhum. A preferência de idioma (`pt`/`en`) fica no `localStorage` do navegador.

## 13. Do / Don't
- **Do:** mantenha o português como idioma padrão e como a fonte. O inglês é a tradução.
- **Do:** use os nomes oficiais da AWS em inglês (o `fullName` dos serviços já está em inglês).
- **Do:** traduza os textos do motor por código e parâmetros, para que a mesma simulação dê o mesmo resultado nos dois idiomas.
- **Don't:** mude ids, códigos, chaves de armazenamento ou formato de arquivo. Isso quebraria os diagramas salvos e a CLI.
- **Don't:** apague nem reescreva os testes que procuram texto em português para fazê-los passar. Eles seguem rodando em PT.
- **Don't:** traduza a conversa já gravada nem os rótulos que a pessoa escreveu.

## 14. Risks & Caveats
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Volume grande (≈ 455 campos do catálogo, ≈ 1.200 linhas de problemas, centenas de textos de interface): uma revisão difícil e um diff enorme | Alta | Médio | Tarefas separadas por área (interface, catálogo, problemas, motor, mentor), cada uma com o seu commit e o teste do NFR-2 |
| Tradução fraca ou inconsistente (o mesmo conceito com dois nomes) | Média | Médio | Um glossário curto no plano (gargalo → bottleneck, vazão → throughput, …). A pessoa revisa uma amostra (§10) |
| Um texto em português sobra escondido (tooltip, `aria-label`, erro raro) | Alta | Baixo | A varredura do FR-11 e o NFR-2. Erros raros entram na lista de chaves |
| Os textos em inglês são mais longos ou mais curtos e quebram o layout | Média | Baixo | O e2e tira screenshots em EN. Ajuste de CSS só onde quebrar |
| O mentor mistura idiomas numa conversa que começou em PT | Média | Baixo | A regra do prompt vale para a resposta atual. Uma conversa mista é aceitável |
| A CLI e o entrevistador dependem dos textos em português dos achados | Média | Médio | O motor continua oferecendo o português (FR-13) e a CLI não muda |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| Os idiomas são pt-BR e en (sem en-GB nem es) | O pedido: "português ou inglês" | Uma tabela a mais |
| O controle fica no cabeçalho, ao lado do tema, como duas opções PT / EN | "clica lá em cima [...] um toggle, português ou inglês" | Mudar a forma é CSS e markup |
| "Traduzir tudo" inclui catálogo, problemas, motor e mentor, não só os botões | "E aí você tem que traduzir tudo" | Menos tarefas, mesma estrutura |
| A CLI e o `AGENTS.md` ficam em português | São a ferramenta do entrevistador no terminal, não "o sistema" que a pessoa vê | Um PRD a mais, com `--lang` na CLI |
| A primeira visita segue o navegador (en → EN, o resto → PT) | É o comportamento comum, e o tema já segue o sistema (`theme.ts:43-46`) | Fixar PT na primeira visita é uma linha |
| A tradução é feita pelo agente que implementa e revisada pela pessoa por amostra | Não há tradutor no projeto | Pode haver retrabalho de texto depois do merge |
| Conversa e tentativas gravadas não são traduzidas | São dados da pessoa | — |

## 16. Open Questions
Nenhuma.

## 17. Tests
- **FR-1, NFR-4:** o controle aparece em todas as rotas, operável por teclado, com o estado anunciado. O `a11y.spec.ts` roda nos dois idiomas.
- **FR-2, G3, NFR-1:** e2e que troca com um problema aberto, um nó selecionado e a simulação rodando. O desenho, a seleção, o rascunho e a conversa seguem iguais, a simulação não reinicia, e a troca leva menos de 100 ms.
- **FR-3, FR-4, A08, A10:** unitários de leitura e gravação (mesmo padrão de `theme.test.tsx`):
  - um valor salvo vence o navegador;
  - um valor salvo inválido é ignorado;
  - um armazenamento que lança erro não quebra nada;
  - um navegador en, pt ou fr abre no idioma certo.
- **FR-5, FR-11:** a varredura e2e em EN (home, lista, problema, estudo, livre, resultado e painéis) procura texto só-português, inclusive em `aria-label`, `title` e `placeholder`. Um teste negativo prova que ela pega uma string injetada.
- **FR-6, FR-7, NFR-2:** unitários de completude:
  - toda chave da interface existe nos dois idiomas e com os mesmos placeholders;
  - todo campo de texto do catálogo tem `en`;
  - todo problema passa no schema com `en`;
  - um problema ou catálogo de fixture sem `en` é recusado.
- **FR-8:** para `NO_ENTRY`, um achado de gargalo e um requisito reprovado: o mesmo resultado nos dois idiomas, com os números iguais.
- **FR-9, A05, A09:**
  - a rota do mentor recebe `en` e o prompt diz para responder em inglês;
  - um valor fora da lista não entra no prompt;
  - o motivo de uma recusa sai em inglês;
  - o log ganha `lang=` e não ganha a pergunta.
- **FR-10:** a formatação de 1234.56 em PT e em EN, para número, moeda e data.
- **FR-12:** o `lang` do `<html>` depois da troca e na carga.
- **FR-13, A06:** o mesmo diagrama dá o mesmo resultado e salva o mesmo JSON em PT e em EN.
- **A05:** um rótulo com `<b>` interpolado num texto traduzido aparece como texto.
- **NFR-3:** uma chave sem tradução mostra o português e não a chave crua.
- **Regressão:** todos os testes existentes seguem verdes em PT.

## 18. Verification
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit`.
- No navegador (preview com um diretório de prática temporário):
  1. Abrir a home em PT, trocar para EN e conferir home, lista e um problema.
  2. Montar parte do desenho e simular. Trocar para PT e voltar para EN: o desenho e a simulação continuam iguais.
  3. Abrir o modo estudo, perguntar ao mentor real em EN e conferir a resposta em inglês. Pedir uma mudança inválida e ler o motivo da recusa em inglês.
  4. Finalizar e pontuar: os achados e a explicação aparecem em inglês e os números em `1,234.56`.
  5. Recarregar: abre em EN. Limpar `archsim:lang` com o navegador em en-US: abre em EN.
  6. `pnpm -s archsim simulate` segue em português.

## 19. Release Plan
- **Branch**: `feat/i18n-pt-en`, a partir de `master`.
- **Milestones**: uma entrega, implementada em tarefas por área.
- **Migrations / ordering**: nenhuma. O catálogo sobe de versão.
- **Config / secrets**: nenhum.
- **Feature flag**: nenhuma. O padrão continua PT, então quem não troca não vê diferença.
- **Rollout**: de uma vez, pelo merge.
- **Rollback**: reverter o merge. O que fica salvo é só `archsim:lang` no navegador, que a versão antiga ignora.
- **Post-launch**: refazer o roteiro do §18 depois do merge, com o servidor de desenvolvimento reiniciado.

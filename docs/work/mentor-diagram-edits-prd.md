# PRD: O mentor propõe mudanças no desenho, aplicadas com um clique

**Source**: `conversation` — "torne possível o agente que eu tô conversando fazer alterações no diagrama caso eu peça"; respostas: proposta com **Aplicar** (nada muda sem o clique) e alcance igual ao que a pessoa faz à mão · **Type**: feature · **Status**: READY · **Approval**: 2026-11-14 · **Standards**: owasp-top10-2025 · **Date**: 2026-11-14

## 1. Overview
No modo estudo, o mentor do chat hoje só conversa. A pessoa lê a sugestão ("põe um ElastiCache entre a API e o banco e sobe a EC2 para 6 réplicas") e refaz tudo à mão. Esta feature deixa a pessoa pedir a mudança ao mentor. Ele responde com uma **proposta**, um card no chat que lista as operações. Com um clique em **Aplicar**, a proposta entra no desenho de uma vez, como um único passo de desfazer. O alcance é o mesmo da pessoa: adicionar e remover serviços, conectar e desconectar, mudar réplicas, tipo, hit ratio e nomes. A carga do problema continua travada.

## 2. Problem
- **Sem atalho para o desenho:** a conversa com o mentor e o desenho vivem separados. Validar uma ideia ("e se eu puser um cache?") exige traduzir a resposta em vários cliques, sem garantia de que foi feito o que ele quis dizer.
- **Contradição atual:** o PRD do modo estudo excluiu isso de propósito (`docs/work/study-mode-mentor-chat-prd.md` §9: "O mentor editar o desenho… pede outro PRD"), e o prompt de hoje diz que ele "não edita o desenho" (`apps/app/server/mentor/prompt.ts`). Este é o outro PRD.

## 3. Goals & Success Metrics
| Goal | Metric | Target | How it's measured |
|---|---|---|---|
| G1. Pedir uma mudança e vê-la no desenho com um clique | Pedidos de mudança do roteiro (§18) que viram uma proposta aplicável e, aplicada, fazem o que foi pedido | 8 de 10, nos dois provedores | Roteiro manual §18 |
| G2. A pessoa continua no controle | Mudanças no desenho sem clique em **Aplicar** | 0 | Testes (FR-4, FR-9) |
| G3. Uma proposta nunca deixa o desenho inválido ou pela metade | Aplicações que resultam em diagrama inválido, carga alterada ou parte das operações aplicada | 0 | Testes de validação e atomicidade (FR-6, FR-7) |
| G4. Desfazer volta exatamente ao desenho anterior | Depois de **Aplicar** + um desfazer, desenho igual ao anterior | 100% | Teste (FR-8) |

**Non-goals**: substituir o desenho inteiro de uma vez ("monta a referência pra mim") — a escolha foi o alcance manual; mexer na carga do problema; aplicar sem confirmação; propor mudanças no modo prática (lá não há chat); arrastar ou arrumar a posição dos nós já existentes.

## 4. Users & Personas
A mesma pessoa do modo estudo. Depois desta entrega, ela diz "coloca um cache na frente do banco e sobe a API para 6 réplicas", lê no card o que vai mudar, clica em **Aplicar** e vê o efeito na simulação na hora. Se não gostar, desfaz com um Ctrl+Z.

## 5. User Stories
- **US-1**: Como pessoa estudando, quero pedir ao mentor uma mudança no desenho e aplicá-la com um clique, para testar ideias sem refazer tudo à mão.
- **US-2**: Como pessoa estudando, quero ver exatamente o que vai mudar antes de aplicar, para entender a mudança e decidir.
- **US-3**: Como pessoa estudando, quero desfazer uma proposta aplicada de uma vez, para voltar atrás sem medo.
- **US-4**: Como pessoa estudando, quero que perguntas comuns continuem sendo só conversa, para que o mentor não proponha mudanças quando eu só quero entender.

## 6. User Flows
**Principal**
1. No chat do modo estudo, a pessoa pede uma mudança: "adiciona um ElastiCache entre a API e o banco, com hit ratio 0,9".
2. O mentor responde com o texto de sempre, explicando o porquê, mais um **card de proposta**. O card lista as operações em linguagem clara, por exemplo:
   - "+ ElastiCache (Valkey) 'Cache'";
   - "+ conexão API → Cache";
   - "Cache: hit ratio 0,9".
3. O card tem **Aplicar** e **Descartar**.
4. **Aplicar**: as mudanças entram no desenho de uma vez, a simulação recalcula, e o card passa a "aplicada", com um botão **Desfazer** enquanto este for o último passo do histórico. Os nós novos aparecem em posições livres perto dos nós a que se ligam.
5. Ctrl+Z, ou **Desfazer** no card, volta ao desenho anterior inteiro.

**Alternativos**
- *Pergunta sem pedido de mudança*: o mentor só responde, sem card.
- *Descartar*: o card passa a "descartada", e nada muda.
- *O desenho mudou depois da proposta* (a pessoa editou à mão, ou aplicou outra proposta): se alguma operação aponta para um nó ou conexão que não existe mais, a aplicação é recusada inteira, com a mensagem "o desenho mudou desde esta proposta; peça de novo". Nada é aplicado pela metade.
- *Proposta inválida* (serviço inexistente, valor fora do intervalo, conexão não permitida, remoção do nó Usuários, mudança de carga): o servidor a descarta antes de chegar ao card, e o chat mostra "o mentor propôs algo que o simulador não aceita". O texto da resposta continua.
- *Recarregar a página*: os cards continuam na conversa com o seu estado (pendente, aplicada ou descartada).

**Estados do card**: pendente (Aplicar / Descartar), aplicada (Desfazer, enquanto possível), descartada, desatualizada (o desenho mudou, e Aplicar recusa com a mensagem acima), inválida (não chega a aparecer; aparece só o aviso).

## 7. Functional Requirements
| ID | Requirement | Priority | Story | Acceptance criteria |
|---|---|---|---|---|
| FR-1 | Quando a pessoa pede uma mudança no desenho, o mentor deve poder anexar à resposta uma proposta: uma lista ordenada de operações sobre o desenho que ele viu. | Must | US-1 | Com o provedor falso, pedir "adicione um cache" produz uma resposta com uma proposta de operações; nos provedores reais, o roteiro §18. |
| FR-2 | As operações possíveis são as que a pessoa faz à mão: adicionar serviço (com tipo, propriedades e nome opcionais), remover nó, conectar, desconectar, mudar tipo, mudar propriedade, mudar nome. A carga e o nó Usuários ficam fora. | Must | US-1 | Cada operação tem teste de aplicação; uma proposta com mudança de carga, remoção do Usuários ou operação desconhecida é rejeitada inteira. |
| FR-3 | A proposta deve aparecer no chat como um card que descreve cada operação em pt-BR, com os nomes que a pessoa vê (nome do nó e serviço), nunca só ids. | Must | US-2 | Teste de componente: uma proposta de 3 operações mostra 3 linhas legíveis ("+ ElastiCache (Valkey) 'Cache'", "EC2 'API': réplicas 3 → 6"…). |
| FR-4 | Nada muda no desenho sem um clique em **Aplicar**. | Must | US-1, US-2 | Teste: receber uma proposta e recarregar não altera o diagrama; só **Aplicar** altera. |
| FR-5 | **Descartar** marca a proposta como descartada sem mudar o desenho. | Must | US-2 | Teste de componente e de persistência. |
| FR-6 | Uma proposta é validada duas vezes. No servidor, ao chegar do modelo, contra o desenho que ele viu: catálogo, intervalos, conexões permitidas, alcance do FR-2, limite de tamanho. No navegador, ao aplicar: o resultado precisa passar na mesma validação de diagrama do app. Inválida → nada é aplicado. | Must | US-1 | Testes: serviço inexistente, réplicas fora do intervalo, conexão proibida e mais de 50 operações → rejeitadas no servidor; aplicar sobre um desenho em que o resultado fica inválido → recusado sem mudança. |
| FR-7 | Aplicar é atômico: ou todas as operações entram, ou nenhuma. Uma operação que aponta para um nó ou conexão que não existe mais recusa a proposta inteira, com a mensagem de desenho desatualizado. | Must | US-1, US-3 | Teste: remover à mão um nó que a proposta usa e depois Aplicar → desenho inalterado, card "desatualizada". |
| FR-8 | Uma proposta aplicada é um único passo de desfazer; Ctrl+Z ou **Desfazer** no card volta ao desenho exatamente anterior. | Must | US-3 | Teste: um snapshot antes, Aplicar, um undo → igual ao snapshot; refazer reaplica. |
| FR-9 | O estado de cada proposta (pendente, aplicada, descartada) é persistido na conversa e sobrevive a recarregar a página. | Must | US-2 | Teste de persistência e de componente após recarregar. |
| FR-10 | Os nós novos aparecem em posições livres, sem sobrepor os existentes, perto do nó a que a proposta os conecta. | Should | US-1 | Teste: os nós adicionados não ocupam a mesma posição de nenhum nó existente (critério de `freeSpot`). |
| FR-11 | O mentor só propõe quando a pessoa pede uma mudança; numa pergunta de entendimento, responde sem proposta. | Should | US-4 | Prompt revisado; roteiro §18 com 3 perguntas sem pedido de mudança → 0 propostas. |
| FR-12 | Funciona nos dois provedores (assinatura e API), com o mesmo formato de proposta. | Must | US-1 | Testes com os dois provedores dublados; roteiro §18 com o provedor real disponível. |

## 8. Non-Functional Requirements
| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Performance | Aplicar uma proposta de até 50 operações atualiza o desenho e dispara a simulação sem travar a interface. | Teste: aplicar 50 operações leva < 100 ms no store; o e2e de perf existente continua no orçamento. |
| NFR-2 | Accessibility | O card é navegável por teclado, os botões têm nome acessível, e o resultado de Aplicar ou Descartar é anunciado (`role="status"`). | O axe do e2e com um card na tela não acusa violações serious/critical; teste de teclado aplica uma proposta. |
| NFR-3 | Limits | No máximo 50 operações e 1 proposta por resposta; nomes com até 80 caracteres (o mesmo limite do campo de nome). | Testes de limite no servidor. |
| NFR-4 | i18n | Card e mensagens em pt-BR. | Revisão. |

## 9. Out of Scope
- Substituir o desenho inteiro ou montar a solução de referência numa operação — fora do alcance escolhido.
- Mover ou reorganizar nós existentes — posição é estética; nós novos são posicionados automaticamente (FR-10).
- Mudar a carga — travada no estudo, como para a pessoa.
- Propor no modo prática ou no canvas livre — não há chat lá.
- Aplicar parte de uma proposta, operação por operação — a proposta é um pacote; para mudar parte dela, a pessoa pede de novo.

## 10. Definition of Done
- [ ] Todo requisito Must atende ao seu critério de aceite
- [ ] Roteiro §18 executado com a assinatura real, resultado registrado no PR (e com a API, se houver chave)
- [ ] O modo prática e o canvas livre se comportam igual a antes (e2e existentes verdes)
- [ ] O README explica que o mentor propõe e a pessoa aplica
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm audit` passam

## 11. Technical Context
**Stack & areas affected**: o chat do modo estudo entregue no PR #4. Partes afetadas:
- servidor: `apps/app/server/mentor/` (o prompt, os provedores, a rota do chat, o contexto);
- contratos: `packages/problems/src/mentor.ts`;
- cliente: `apps/app/src/practice/ChatPanel.tsx` e `mentor-api.ts`;
- store: `apps/app/src/store/diagram-store.ts`, que já tem todas as operações: `addNode`, `removeSelection`, `connect`, `removeEdge`, `setVariant`, `setProp`, `setLabel`, `replaceDiagram` (`diagram-store.ts:31-49`), e o histórico de desfazer via `commit` (`diagram-store.ts:61`).

**Conventions**:
- **Contratos do chat:** zod `.strict()` em `packages/problems/src/mentor.ts` (`MentorEvent` como discriminated union de eventos SSE; `Conversation` com `MentorMessage`). Uma proposta entra como um novo evento e como um campo opcional da fala do mentor, sem quebrar conversas já gravadas (`schemaVersion: 1`, campo opcional).
- **Ids neutros:** o mentor vê os nós como `n1`, `n2`… (`neutralIds`, `packages/cli/src/output.ts:29`, usado em `apps/app/server/mentor/context.ts`). Uma proposta dele fala nesses ids, e o servidor os traduz para os ids reais do desenho daquela pergunta.
- **Validação de diagrama:** `validateDiagram(input, catalog)` (`packages/sim-engine/src/diagram.ts:208`). Já é usada no servidor (`routes.ts`) e no carregamento de arquivos.
- **Posição livre:** `freeSpot` (`apps/app/src/workspace/Workspace.tsx:19-31`).
- **Regras de conexão:** `apps/app/src/canvas/connection-rules.ts` (`defaultProtocol`, usado pela UI ao conectar).
- **Markdown seguro, sem HTML cru:** `ChatPanel.tsx` (`Reply`). Os textos do card são renderizados como texto pelo React.
- **Testes:**
  - servidor com o provedor falso injetado (`apps/app/server/chat.test.ts`);
  - UI com fetch mockado e stream SSE (`apps/app/src/practice/chat.test.tsx`);
  - store (`apps/app/src/store/diagram-store.test.ts`);
  - e2e com `ARCHSIM_MENTOR_FAKE=1` (`apps/app/e2e/study-flow.spec.ts`).

**Data & contracts**:
- `MentorEvent` ganha um evento de proposta.
- A fala do mentor (`MentorMessage`, role `mentor`) ganha um campo opcional com a proposta e o estado dela.
- Uma rota para atualizar o estado (aplicada/descartada) na conversa, ou equivalente.
- Conversas antigas continuam válidas, porque o campo é opcional.
- Nenhuma mudança em `history.json`, `session.json`, na CLI ou no motor.

**Constraints**:
- O mentor continua **sem acesso a arquivos, comandos ou web** nos dois provedores. O único efeito possível de uma resposta é uma proposta, que só a pessoa aplica.
- A aplicação acontece no navegador, sobre o store, porque o desenho vive lá (autosave em `localStorage`).
- A carga e o nó Usuários ficam fora de alcance.

**Dependencies**: o chat do modo estudo (mergeado no PR #4). Nenhuma outra.

## 12. Security & Compliance

### OWASP Top 10:2025

| # | Category | Applies? | Requirement | How it's tested |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes | A rota nova de estado da proposta passa por `checkCaller` + `checkMethod` e exige Origin em métodos que mudam estado, como as outras; o id do problema é validado pela mesma regex. O mentor não ganha nenhum acesso novo: nada de arquivos, comandos ou web, e a proposta só muda o desenho no navegador depois do clique. | Testes no padrão de `chat.test.ts`: Origin estrangeiro → 403, sem Origin → 403, id `../x` → 404; teste de que a configuração do provedor de assinatura continua com `--tools ""` (sem ferramentas de sistema). |
| A02 | Security Misconfiguration | Yes | Se o caminho escolhido no plano exigir dar ao modelo uma ferramenta de proposta, ela é a **única** ferramenta, e todas as ferramentas internas continuam desligadas. A CSP não muda. | Teste das opções do provedor (lista de ferramentas = só a de proposta, ou nenhuma); teste da CSP existente. |
| A03 | Software Supply Chain Failures | Yes | Nenhuma dependência nova, a menos que o plano justifique; se houver, versão exata e `pnpm audit` limpo. | `pnpm audit` na review. |
| A04 | Cryptographic Failures | No | — | N/A: nenhum segredo novo nem armazenamento de credenciais. As credenciais dos provedores seguem como no PR #4. |
| A05 | Injection | Yes | **Prompt injection:** um rótulo do desenho ou um texto pode induzir o mentor a propor uma mudança indesejada. O efeito fica limitado ao desenho, exige o clique, é visível no card e pode ser desfeito. **Texto proposto:** nomes de nó e qualquer texto da proposta são renderizados como texto, nunca como HTML, com limite de 80 caracteres e sem `<` ou `>`. | Teste: proposta com nome `<img onerror>` → rejeitada no servidor ou exibida como texto, sem criar elemento; teste com rótulo malicioso no desenho → a proposta, se houver, ainda exige o clique. |
| A06 | Insecure Design | Yes | O alcance é imposto no servidor e no navegador, não só no prompt: carga, nó Usuários e operações desconhecidas são rejeitados (FR-2, FR-6). Limite de 50 operações por proposta (NFR-3). Aplicação atômica (FR-7). | Testes de alcance, limite e atomicidade. |
| A07 | Authentication Failures | No | — | N/A: sem autenticação nova; os provedores seguem como no PR #4. |
| A08 | Software or Data Integrity Failures | Yes | A proposta é validada por zod e pelo motor antes de virar card, e de novo antes de ser aplicada. Ids neutros são traduzidos pelo mapa do servidor da pergunta, nunca aceitos como ids reais vindos do modelo. Uma proposta gravada na conversa é revalidada ao ler, e uma inválida é tratada como ausente. | Testes: id `n9` inexistente → rejeitado; id real forjado pelo modelo → rejeitado; arquivo de conversa com proposta corrompida → conversa lida sem a proposta. |
| A09 | Security Logging and Alerting Failures | Yes | O log por resposta ganha o número de operações propostas e se foram válidas ou rejeitadas, **sem** o conteúdo. Aplicar e descartar não registram texto. | Teste: a linha de log tem `propostas=` e não contém nomes de nó nem texto. |
| A10 | Mishandling of Exceptional Conditions | Yes | Proposta malformada, cortada no meio do stream ou interrompida (Parar) não vira card. Uma falha ao aplicar deixa o desenho como estava e mostra a mensagem. Uma falha ao gravar o estado mantém o desenho aplicado e avisa. | Testes: stream interrompido no meio da proposta → nenhum card; aplicar com erro → desenho inalterado. |

**Existing controls at risk**:
- *"O mentor não tem ferramentas"* (PRD do modo estudo, FR-12; `cli-provider.ts` `--tools ""`). Se o plano usar uma ferramenta de proposta, isso muda para "uma única ferramenta, que só descreve operações". As ferramentas de sistema continuam desligadas, e um teste fixa isso (A02).
- *O prompt atual diz "você não edita o desenho"* (`prompt.ts`). Ele passa a "você pode propor mudanças, que a pessoa aplica".
- *Separação estudo × prática*: inalterada, sem chat na prática.

**Secrets / PII touched**: none new. A proposta contém só operações sobre o desenho, gravadas na conversa local em `practice/mentor-<id>.json`, que já é gitignored.

## 13. Do / Don't
- Do: traduzir os ids neutros com o mapa da própria pergunta, para que o modelo nunca escolha um id real.
- Do: validar no servidor ao receber e no navegador ao aplicar — o desenho pode ter mudado entre um e outro.
- Do: aplicar como um único `commit` do store, para o desfazer funcionar de uma vez.
- Don't: aplicar sem clique, nem "só desta vez" — viola o G2.
- Don't: aplicar parte de uma proposta quando uma operação falha — a pessoa fica com um desenho que ninguém propôs.
- Don't: ligar qualquer ferramenta de sistema do Claude Code para isso — o mentor ganharia acesso à máquina.

## 14. Risks & Caveats
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| O modelo gera propostas mal formadas ou que não fazem o pedido | Medium | Medium | Validação dupla; o card mostra o que vai mudar antes; roteiro §18 mede o G1 |
| O provedor de assinatura (`claude -p`) não suporta uma ferramenta customizada sem abrir as de sistema | Medium | High | Caminho alternativo sem ferramentas: a proposta vem num formato estruturado dentro da resposta, extraído e validado pelo servidor. A escolha fica com o plano, que verifica na prática, como no PR #4 |
| O desenho muda entre a proposta e o clique | High | Low | FR-7: recusa inteira, com uma mensagem clara |
| Nós novos em posições ruins | Medium | Low | FR-10 (`freeSpot` perto do vizinho); a pessoa arrasta depois |
| Uma injeção via rótulo leva a uma proposta indesejada | Low | Low | Exige o clique, é visível, pode ser desfeita, e o alcance é só o desenho |

## 15. Assumptions
| Assumption | Basis | If wrong |
|---|---|---|
| Uma proposta por resposta | Simplicidade; a pessoa pede de novo para mais | Permitir várias é ampliar o contrato |
| Até 50 operações por proposta | Um desenho de problema tem entre 5 e 20 nós; 50 sobra | Ajustar a constante |
| Uma proposta antiga fica "desatualizada" quando o desenho muda de um jeito que a quebra; se continuar aplicável, pode ser aplicada | Recusar só o que não dá para aplicar | Se a pessoa quiser invalidar toda proposta antiga a qualquer mudança, é uma regra mais simples |
| O nome de um nó novo é opcional; sem ele, entra o rótulo padrão do serviço, como no clique da paleta | Comportamento atual de `addNode` | — |
| O desfazer pelo card só aparece enquanto a proposta é o último passo do histórico; depois disso, vale o Ctrl+Z normal | Evita desfazer algo diferente do que o card diz | — |

## 16. Open Questions
None.

## 17. Tests
- **Servidor:**
  - a proposta extraída e validada (catálogo, intervalos, conexões, alcance, limite de 50, carga e Usuários fora);
  - a tradução de ids neutros; ids inexistentes ou forjados → rejeitada;
  - nome com `<`/`>` ou acima de 80 caracteres → rejeitado;
  - stream interrompido → sem proposta;
  - a rota de estado com A01;
  - o log com `propostas=` sem texto;
  - conversa antiga sem o campo continua válida, e conversa com proposta corrompida é lida sem ela.
- **Provedores:** com o provedor de assinatura, a configuração continua sem ferramentas de sistema (ou só a de proposta); os dois provedores produzem o mesmo formato. O provedor falso ganha um roteiro de proposta (por exemplo, "proponha:cache").
- **Store/aplicação:**
  - cada operação do FR-2;
  - atomicidade, com uma operação inválida no meio → nada muda;
  - desenho desatualizado → recusa;
  - um único passo de desfazer, e refazer;
  - posições livres;
  - 50 operações em < 100 ms.
- **UI:**
  - o card com linhas legíveis;
  - Aplicar, Descartar e Desfazer;
  - os estados persistidos depois de recarregar;
  - o card desatualizado;
  - o aviso de proposta inválida;
  - texto malicioso exibido como texto;
  - teclado e anúncio.
- **e2e:** no estudo, pedir "proponha:cache" → card → Aplicar → o nó aparece e a simulação muda → Ctrl+Z volta; o axe com um card na tela.

## 18. Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit
```
Roteiro manual com o provedor real (assinatura; API se houver chave), no `url-shortener` em modo estudo:
1. "Adiciona um ElastiCache entre a API e o banco com hit ratio 0,9" → card com as operações → Aplicar → o cache aparece conectado, e a utilização do banco cai.
2. "Sobe a API para 6 réplicas" → Aplicar → 6 réplicas.
3. "Troca o banco para db.m7g.large" (ou um tipo válido) → Aplicar → o tipo muda.
4. "Remove o cache" → Aplicar → o nó e as conexões somem.
5. "Renomeia a API para 'Redirecionador'" → Aplicar.
6. "Conecta a API direto no banco" → Aplicar.
7. Um pedido impossível ("aumenta a carga para 50 mil") → o mentor explica que não pode, sem proposta, ou a proposta é rejeitada.
8. Três perguntas sem pedido de mudança ("por que o p99 subiu?") → nenhuma proposta.
9. Receber uma proposta, remover à mão um nó que ela usa, Aplicar → recusa com "o desenho mudou".
10. Aplicar e Ctrl+Z → o desenho volta exatamente; recarregar → os cards mantêm o estado.

O G1 conta os passos 1–6 e mais 4 pedidos livres (8 de 10).

## 19. Release Plan
- **Branch**: nova, `feat/mentor-diagram-edits`, a partir de `master`.
- **Milestones**: single release.
- **Migrations / ordering**: nenhuma. O campo de proposta na conversa é opcional, e os arquivos antigos continuam válidos.
- **Config / secrets**: nenhuma nova.
- **Feature flag**: none — a proposta só existe quando a pessoa pede, e nada muda sem clique.
- **Rollout**: tudo de uma vez (ferramenta local).
- **Rollback**: reverter o merge. As conversas gravadas com propostas continuam legíveis pela versão anterior? **Não**: o `.strict()` atual rejeitaria o campo novo e deixaria o arquivo de lado como corrompido. Por isso o rollback perde, no máximo, as conversas daquele período (dado local, sem impacto em nota ou histórico). Registrar isso no PR.
- **Post-launch**: o roteiro §18 registrado no PR; não há telemetria.

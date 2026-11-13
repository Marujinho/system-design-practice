# ArchSim

Treino de system design desenhando arquiteturas AWS que reagem à carga.

Você escolhe um problema clássico de entrevista (encurtador de URL, feed, chat, venda de
ingressos…), recebe só o enunciado e os números, e monta a arquitetura num canvas. A simulação
aplica a carga do problema: cada nó mostra utilização, latência, erros e custo, e o gargalo fica
vermelho e pisca. **O objetivo é atender a todos os requisitos pelo menor custo.** Ao finalizar,
você recebe um score de 0 a 100 com estrelas, e o seu agente de código conduz os follow-ups como
um entrevistador.

## Rodar

Requer Node 22.13+ ou 24 e pnpm 9.

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
```

`pnpm build && pnpm preview` serve o build de produção em `http://127.0.0.1:4173`. Os dois
servidores escutam só em `127.0.0.1`.

## Praticar

1. Abra **Praticar um problema** e escolha um dos 10 problemas.
2. Monte o desenho: arraste serviços da paleta, conecte, ajuste réplicas, tipos e hit ratio no
   painel. A aba **Requisitos** mostra, ao vivo, o que já é atendido.
3. Clique em **Finalizar e pontuar**. O score sai daí, com os achados: gargalos, requisitos que
   falharam, nós superdimensionados, o que quebra com mais carga.
4. Peça ao seu agente (Claude Code ou outro que leia `AGENTS.md`): _"Pode começar os follow-ups
   do ArchSim"_. Ele lê a sua sessão em `practice/session.json`, roda a simulação e pergunta como
   num entrevista. No fim, explica o score.
5. Ajuste e finalize de novo para bater o seu recorde. Depois da primeira finalização, **Ver uma
   solução** mostra uma solução de referência. Tentativas feitas depois de ver a solução não
   contam para o recorde.

A simulação também roda pela linha de comando:

```bash
pnpm -s archsim simulate                       # a sessão em practice/session.json
pnpm -s archsim simulate --load-multiplier 2   # com o dobro da carga
pnpm -s archsim followups                      # os follow-ups que se aplicam ao desenho
```

## O score

- Algum requisito falhou: até 40 pontos, proporcional aos requisitos atendidos.
- Todos atendidos: 50 pontos, mais até 35 pelo custo (35 × custo da referência / seu custo,
  com teto) e 7,5 + 7,5 se o desenho ainda aguenta 1,5× e 2× a carga.
- Estrelas: 1 com 50, 2 com 75, 3 com 90. Selo **abaixo da referência** quando você atende a
  tudo gastando menos que ela.

## Cota da AWS × premissa

Cada número que a simulação usa é marcado no painel de propriedades:

- **cota AWS** — um limite documentado pela AWS, com o link da fonte: as 1.000 execuções
  simultâneas da Lambda, os 3.500 PUT/s por prefixo do S3, os 1.000 registros/s por shard do
  Kinesis, os 10.000 req/s por conta do API Gateway.
- **premissa** — um valor que a AWS não publica, como quantas requisições por segundo uma
  instância EC2 aguenta ou a latência base de um serviço. Depende do seu código; aqui é uma
  estimativa didática. Você pode editar cada uma e restaurar o padrão.

Preços: on-demand em us-east-1, conferidos em 13/11/2026, cada um com a fonte. A AWS muda preços;
não use estes números em proposta real. Simplificações conhecidas: instâncias T simulam a
capacidade em burst (créditos de CPU ainda não modelados), não há auto scaling nem falhas de AZ,
e a carga é constante.

## Estrutura

| Pasta                 | O que tem                                                       |
| --------------------- | --------------------------------------------------------------- |
| `apps/app`            | O app (Vite + React + React Flow) e o servidor local de prática |
| `packages/sim-engine` | O motor de simulação: puro, determinístico, sem DOM             |
| `packages/catalog`    | Os 23 serviços: preços, cotas e premissas, com fonte            |
| `packages/problems`   | Schema dos problemas, score de tentativas, contratos            |
| `packages/cli`        | `pnpm archsim`                                                  |
| `packages/icons`      | As figuras isométricas dos serviços                             |
| `problems/`           | Os 10 problemas, cada um com a solução de referência            |
| `practice/`           | Suas tentativas (ignoradas pelo git)                            |
| `schemas/`            | JSON Schemas de tudo que um agente lê                           |

```bash
pnpm lint && pnpm typecheck && pnpm test   # verificação
pnpm test:e2e                               # e2e (Playwright)
```

## Créditos

As figuras isométricas usam o kernel da skill `hairline-create` de
[Hairline](https://github.com/lucasmarkes/hairline), de Lucas Marques, sob licença MIT
(`packages/icons/vendor/LICENSE-hairline`). A paleta de cores do app segue os tokens do Hairline.

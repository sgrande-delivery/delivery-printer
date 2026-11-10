---
description: Cria a estrutura SDD de uma feature em .claude/sdd/<issue>-<slug>/ — spec.md (o quê/por quê), plan.md (como, com a quebra em tasks) e já materializa todas as tasks (arquivo + issue no GitHub vinculada como sub-issue da feature). Primeiro passo do fluxo /create-spec → /execute <feature> → /ship <feature>.
argument-hint: [número da issue de feature e/ou descrição da feature]
---

O usuário quer especificar uma nova feature neste repo. A descrição dele é:

**$ARGUMENTS**

> O repo canônico é **`sgrande-delivery/delivery-printer`** — use esse nome em todo `gh --repo`, mesmo com o remoto apontando para `raphaelcarreiro/delivery-printer-2` (nome antigo, que redireciona).

Fluxo:

1. **Resolver a issue guarda-chuva no GitHub.**
   - Se o usuário passou um número, validar com `gh issue view <n> --repo sgrande-delivery/delivery-printer` e usar o título como base do slug. Se a issue não tiver a label `feature`, avisar e perguntar se é pra adicionar.
   - Se passou só a descrição, **criar** a issue de feature. Abrir as issues (a da feature e a de cada task) é o padrão do fluxo. Pular só quando ele disser que já tem a issue ou que não quer issue.
   - **As labels `feature` e `task` não existem neste repo** (ele só tem o conjunto default do GitHub). Criar a que faltar antes de abrir a primeira issue, avisando o usuário:
     ```bash
     gh label create feature --repo sgrande-delivery/delivery-printer --description "Frente de trabalho com spec em .claude/sdd/"
     gh label create task    --repo sgrande-delivery/delivery-printer --description "Task de uma feature SDD"
     ```
   - Ao criar a issue: título curto descrevendo a frente (não a task), corpo com objetivo em 1–2 parágrafos e a lista de tasks previstas.
   - Sem GitHub disponível: seguir com numeração local temporária e registrar que a pasta deve ser renomeada quando a issue existir.

2. **Definir o slug da feature (pasta SDD).**
   - Formato: `<numero-da-issue>-<slug-do-titulo>`.
   - **O slug é em inglês**, mesmo com a issue e a spec em português. Nome de diretório é identificador, e identificador neste repo é inglês. Traduzir o sentido do título, não palavra por palavra.
   - Lowercase, kebab-case, sem artigo nem preposição, ~3–5 palavras, começando pelo domínio quando fizer sentido agrupar (`printing-`, `updater-`, `socket-`, `login-`).
   - Exemplos no formato que este repo usaria:
     - *"Tela de configuração de impressão"* → `12-printing-settings-screen`
     - *"Mostrar informações do restaurante logado"* → `13-restaurant-info-screen`
     - *"Emitir status por impressora física"* → `14-printer-status-per-device`
   - Diretório: `.claude/sdd/<numero>-<slug>/`. Se já existir, perguntar: evoluir a spec existente ou escolher outro nome. **Nunca sobrescrever silenciosamente.**
   - Confirmar o slug com o usuário antes de criar.

3. **Decidir o escopo antes de escrever a spec.** Este app roda **na máquina do restaurante** e não tem banco: o que persiste mora na `delivery-api`, e o que é por instalação mora num arquivo sob `app.getPath('userData')`. Isso muda a pergunta inicial de toda feature:

   - **Em qual processo a feature vive?** `main` (impressora, tray, janela, autoupdate), `renderer` (UI, socket, HTTP) ou nos dois — e nesse caso qual é o canal IPC, que precisa existir nos **dois** lados.
   - **Depende de endpoint que ainda não existe na `delivery-api`, ou de evento que o `delivery-socket-api`/`delivery-admin` ainda não emite?** Então parte dela é cross-repo: registrar em "Fora do escopo" ou "Decisões pendentes" na spec, e em "Dependências de outros repos" no plan. A parte de lá é especificada **no repo de lá**, e esta spec cobre só o lado do printer, que só executa depois.
   - **Precisa de estado que sobreviva a restart?** Então é arquivo em `userData`. `.env` **não serve**: é build-time, vai inlinado no instalador e é igual para todo restaurante.
   - **Encosta em empacotamento, dependência do main ou autoupdate?** Então vale a pena ler `.claude/rules/autoupdate.md` antes de escrever, e a spec precisa dizer como a entrega será verificada (empacotar e abrir o asar).

4. **Coletar informações faltantes** — uma única rodada de perguntas curtas, só se algo essencial não estiver claro:
   - Objetivo e quem é afetado (operador no PDV, gestor no painel, suporte)
   - Processo afetado: main, renderer, os dois
   - Escopo: resolvível só neste repo, ou depende de contrato novo de outro repo
   - Regras de negócio já conhecidas

   Se a descrição já cobre tudo, pular.

5. **Inspecionar o código antes de escrever** — ancorar a spec na realidade do repo:
   - `CLAUDE.md` da raiz (fronteira entre processos, sockets, o "O que NÃO fazer") e as regras de `.claude/rules/` cujo `paths:` cobre os arquivos que a feature toca
   - `README.md`, para o que é empacotamento e ambiente
   - As specs vizinhas em `.claude/sdd/*/spec.md` — especialmente as RN
   - As tasks legadas em `.claude/tasks/PRINTER-*.md` quando a frente toca algo já pensado (a `PRINTER-001` desenha `printer_status` e `print_test`, e vive na branch `origin/docs/add-printer-001-task`)
   - O que já existe pra reaproveitar: os primitivos de `src/renderer/base/`, o `SocketStore`, o `useMessaging()`, o `api` com interceptor de refresh

6. **Escrever `spec.md`** em `.claude/sdd/<feature>/spec.md`:

   ```markdown
   # Spec — <Nome da feature>

   **Status:** rascunho
   **Criada em:** <YYYY-MM-DD>
   **Escopo:** renderer | main | main+renderer | build/empacotamento | cross-repo
   **Issue:** [#<n>](<url>)

   ## Contexto

   <Por que a feature existe. Problema, gap atual, o que dói hoje no PDV. 1–3 parágrafos.>

   ## Objetivo

   <O que muda quando a feature estiver entregue. 1 parágrafo.>

   ## Requisitos funcionais

   - **RF-01** — <requisito verificável>

   ## Regras de negócio

   - **RN-01** — <regra, com o porquê quando não for óbvio>

   ## Fora do escopo

   - <Item que poderia confundir mas não está na feature>

   ## Critérios de aceitação

   - [ ] <Item verificável da feature como um todo>

   ## Decisões pendentes

   | # | Tema | Recomendação default |
   |---|------|----------------------|
   | 1 | <tema> | <recomendação — o executor segue se ninguém opinar> |

   <Omitir a seção se não houver decisões pendentes.>
   ```

   **As RN são o que a spec tem de mais durável.** Preferir regra que explique *por quê* ("o canal IPC precisa do mesmo nome nos dois lados porque nome divergente devolve promessa rejeitada e ninguém percebe") a regra que só afirma. É nelas que uma premissa errada fica visível antes de virar bug — e nesta base a premissa não escrita custa impressão duplicada no restaurante.

   Regras que valem para quase toda feature daqui e devem aparecer nas RN quando forem tocadas: **o renderer não tem Node**; **canal IPC é par, nos dois lados**; **listener de socket tem `off` no cleanup**; **o HTML de impressão vem da `delivery-api`**; **`.env` é build-time, configuração por instalação é `userData`**; **atualização chega quando o operador fecha o app**.

7. **Escrever `plan.md`** em `.claude/sdd/<feature>/plan.md`:

   ```markdown
   # Plan — <Nome da feature>

   **Spec:** [spec.md](./spec.md)
   **Issue da feature:** [#<n>](<url>)
   **Branch de trabalho:** `feat/<issue>-<slug>`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

   ## Abordagem técnica

   <Como a feature se encaixa: processo afetado, canal IPC, namespace de socket, endpoint consumido,
   componente ou primitivo reaproveitado. Citar arquivo:linha do que será reaproveitado.>

   ## Decisões arquiteturais

   - <Decisão e o porquê. Se veio de "Decisões pendentes" da spec, referenciar.>

   ## Tasks

   | # | Task | Issue | Arquivo | Depende de | Status |
   |---|------|-------|---------|------------|--------|
   | 01 | <título curto> | — | — | — | a especificar |

   Status: `a especificar` → `pendente` → `executada` → `shipped`.

   ## Ordem de execução

   <Sequência em que o `/execute <feature>` vai rodar as tasks, e o porquê das dependências.>

   ## Dependências de outros repos

   <Endpoint que a `delivery-api` precisa expor, evento que o `delivery-socket-api` precisa repassar,
   tela que o `delivery-admin` precisa ter. Omitir se a feature for autocontida.>

   ## Verificação da entrega

   <Além de typecheck/lint/test: o que precisa ser visto rodando. Se a feature encosta em
   empacotamento ou autoupdate, o empacotamento e a inspeção do asar entram aqui.>

   ## Aprendizados que valem para as próximas tasks

   <Preenchido ao longo da execução: armadilha encontrada, premissa derrubada, comportamento não óbvio
   do Electron ou do socket. Omitir na criação.>
   ```

8. **Materializar todas as tasks da tabela do `plan.md`, na ordem.** Para cada linha, seguir o `/create-task`, passos 3 a 7, sem perguntar task a task:
   - abrir a issue da task (label `task`) e vinculá-la como sub-issue da feature (`/create-task`, passo 3). Para mandar o id interno da sub-issue, usar `-F`, não `-f`;
   - escrever `.claude/sdd/<feature>/tasks/<numero-da-issue>-<slug>.md` pelo template do `/create-task`, ancorado em `arquivo:linha` reais;
   - atualizar a linha no `plan.md`: issue, arquivo e status `pendente`.

   Task que ainda depende de decisão pendente também ganha issue e arquivo — o ponto em aberto fica explícito no "Contexto" dela. Deixar a linha `a especificar` sem arquivo é só para a task que não dá para descrever sem a decisão, e isso é dito no relatório.

   Conferir o vínculo das sub-issues no fim, uma vez, com `gh api repos/sgrande-delivery/delivery-printer/issues/<feature>/sub_issues --jq '.[] | "#\(.number) \(.state)"'`.

9. **Reportar** ao usuário:
   - os caminhos criados;
   - o link da issue da feature;
   - a tabela das tasks: número, título, issue (URL crua), "Depende de" e status;
   - as dependências de outros repos, se houver, dizendo onde a issue de lá precisa ser aberta;
   - o próximo passo: `/execute <feature>`.

**Não fazer:**

- Não abrir issue quando o dev disser que já tem ou que não quer. Nesse caso, perguntar os números existentes ou seguir com numeração local (`<NN>-<slug>.md`)
- Não deixar task sem arquivo por comodidade — a regra é materializar todas (passo 8)
- Não commitar — os artefatos SDD sobem junto com o `/ship`
- Não duplicar o `CLAUDE.md` nem as regras na spec — referenciar basta
- Não estimar tempo / story points
- Textos em português; código e identificadores em inglês

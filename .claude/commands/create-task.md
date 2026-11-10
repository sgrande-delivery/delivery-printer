---
description: Acrescenta (ou reescreve) uma task de uma feature SDD em .claude/sdd/<feature>/tasks/ — nomeada com o número da issue no GitHub, vinculada como sub-issue da feature — e atualiza a tabela do plan.md. O /create-spec já materializa as tasks previstas; este comando é para task nova ou para refazer uma. Requer spec/plan criados pelo /create-spec.
argument-hint: [feature] [nº da task no plan | descrição de task nova]
---

O usuário quer acrescentar ou refazer uma task de uma feature SDD. Argumentos:

**$ARGUMENTS**

O `/create-spec` já abre a issue e escreve o arquivo de **todas** as tasks previstas. Este comando cobre o que aparece depois: a task que o plano não previa, a que o `/execute` mostrou que precisa ser dividida, e a que vai ser reescrita.

Fluxo:

1. **Resolver a feature.**
   - O primeiro argumento é o slug (ou o número) da feature: `.claude/sdd/<feature>/` deve existir com `spec.md` e `plan.md`. Aceitar match parcial (`12` resolve `12-printing-settings-screen`).
   - Se não existir, parar e sugerir `/create-spec` — task sem spec não tem ancoragem.
   - Ler `spec.md` e `plan.md` **inteiros** antes de escrever qualquer coisa, inclusive "Aprendizados que valem para as próximas tasks".

2. **Resolver a task.**
   - Segundo argumento **numérico** (`01`, `2`): é a linha da tabela do `plan.md` com status `a especificar`. Se já tiver arquivo, perguntar se é pra reescrever.
   - Segundo argumento **descritivo**: task nova — **adicionar a linha** na tabela do plan, com "Depende de" coerente com a ordem de execução.
   - Sem segundo argumento: listar as linhas `a especificar` e perguntar qual materializar.

3. **Abrir a issue no GitHub e vincular como sub-issue da feature: é o padrão, sem perguntar.**
   - Usar número existente só quando o dev informar um; seguir sem issue, só com arquivo local, só quando ele pedir.
   - `gh issue create --repo sgrande-delivery/delivery-printer --label task`, com **título** = o mesmo título curto da task e **corpo** = Objetivo (2–3 frases) + 2–3 bullets do Contexto (RF/RN cobertos, dependência) + "o que testar" resumido + caminho do arquivo local. Não colar o md inteiro.
   - **A label `task` não existe neste repo ainda.** Se `gh label list` não a trouxer, criar antes, avisando o usuário:
     ```bash
     gh label create task --repo sgrande-delivery/delivery-printer --description "Task de uma feature SDD"
     ```
   - **Vincular como sub-issue** — a API exige o **id interno** da issue (não o `number`) e o campo como **inteiro** (`-F`, não `-f`, que manda string e devolve 422):

     ```bash
     R=sgrande-delivery/delivery-printer
     SUB_ID=$(gh api repos/$R/issues/<numero-da-task> --jq '.id')
     gh api --method POST repos/$R/issues/<numero-da-feature>/sub_issues -F sub_issue_id=$SUB_ID
     ```

   - Conferir com `gh api repos/$R/issues/<feature>/sub_issues --jq '.[] | "#\(.number) \(.state)"'` — o `sub_issues_summary` da issue-pai demora a refletir e não serve como confirmação imediata.

4. **Definir o nome do arquivo.**
   - **Com issue:** `.claude/sdd/<feature>/tasks/<numero-da-issue>-<slug>.md`, com o **slug em inglês**.
   - **Sem issue:** `<NN>-<slug>.md`, com `NN` sendo o próximo número livre da pasta.
   - Tasks legadas (`.claude/tasks/PRINTER-XXX-<slug>.md`) **mantêm o nome e o lugar** — são anteriores ao fluxo SDD. Task legada retomada dentro de uma feature pode migrar para `.claude/sdd/<feature>/tasks/<numero>-<slug>.md`, mantendo `legacy_id: PRINTER-XXX` no cabeçalho.

5. **Inspecionar o código antes de escrever** — abrir os arquivos que a task vai tocar e ancorar em `arquivo:linha` reais. Conferir o `CLAUDE.md` e as regras de `.claude/rules/` cujo `paths:` cobre esses arquivos para não propor algo que viole regra dura:

   - o renderer **não tem Node**: capacidade de sistema passa por canal IPC
   - canal IPC é **par**: `preload.ts` + `ipcMain.handle` com o mesmo nome literal, mais o stub em `src/__tests__/setup.ts`
   - `socket?.on` dentro de `useEffect` **exige** o `off` no cleanup
   - o HTML de impressão vem da `delivery-api`; não se renderiza comprovante aqui
   - `.env` é build-time e versionado: nada de segredo, e nada de configuração por instalação (isso é `userData`)
   - `electron-updater`/`electron-log` ficam em `dependencies`; Electron fica em 43.x
   - rota nova precisa de um caminho para chegar nela — não existe navegação neste app

   Quando a task tocar impressão ou socket, reler `.claude/rules/printing.md`: a reentrância (`printOrder` + varredura `/orders/print/list`), o `off` do listener e o singleton do `SocketStore` são armadilhas já pagas.

6. **Escrever a task** seguindo o template:

   ```markdown
   # <ID> — <título curto descritivo>

   **Issue:** [#<n>](<url>) | (sem issue)
   **Feature:** [<nome>](../spec.md) — issue #<n>
   **Tipo:** feature | bug | chore | refator
   **Processo:** main | preload | renderer | main+renderer | build
   **Depende de:** <ID> | (nenhuma)
   **Status:** pendente

   ## Objetivo

   <2–3 frases: o que entrega, por que importa nesta feature, resultado esperado. Não listar arquivos aqui.>

   ## Contexto

   - Estado atual no código (com `arquivo:linha`)
   - Quais RF/RN da spec esta task cobre
   - Decisões já tomadas e dependências
   - Armadilha conhecida que se aplica aqui (ver "Aprendizados" do plan)

   ## Mudanças

   ### 1. <Primeira mudança nomeada>

   `src/caminho/do/arquivo.ts` (novo | alterado):

   <Descrição + snippet/diff. Sempre citar o caminho; usar ```diff quando for alteração pontual.>

   ## Testes

   ### `<arquivo>.test.tsx` (novo | atualizado)

   - <Cenário verificável>

   ### Integração / sanity

   - `npm run typecheck` sem erros.
   - `npm test` passando.
   - `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`).

   ## Critérios de aceitação

   - [ ] <Item verificável — comportamento observável, não "funciona corretamente">
   - [ ] `npm run typecheck` sem erros
   - [ ] `npm test` passando
   - [ ] `npm run lint` sem erro novo

   ## Fora de escopo

   - <Item que fica pra outra task — citar o número quando existir>

   ## Branch

   `feat/<issue-da-feature>-<slug-da-feature>`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.
   ```

   A branch é **da spec, não da task**: todas as tasks rodam nela, em sequência, e o `/ship` abre um PR só. A base aqui é **sugestão**: o `/execute` pergunta ao dev de qual branch cortar — **uma vez por spec** — e reescreve esta seção com a base escolhida e a data, igual à linha `**Branch de trabalho:**` do `plan.md`. Task legada (`PRINTER-XXX`) continua com branch própria, `task/<id>-<slug>`.

   **Regras de qualidade:**
   - Critérios **verificáveis**: "o comprovante sai uma vez quando o componente remonta e o evento é emitido uma vez", não "não duplica mais"
   - Quando a task cria canal IPC, o critério inclui o **par**: o nome no preload, no `ipcMain.handle` e no stub de teste
   - Quando a task cria tela, o critério inclui **como se chega nela**
   - Quando a task encosta em empacotamento, o critério inclui a inspeção do asar
   - Numerar e nomear cada mudança; sempre citar `arquivo:linha` do estado atual
   - Em "Fora de escopo", listar o que NÃO fazer, inclusive o que parece relacionado — `ProtectedRoute` e o logo remoto são os candidatos clássicos a correção de carona
   - **Não** preencher `## Implementação` — é do `/execute`
   - Não duplicar spec, `CLAUDE.md` nem regra — referenciar basta
   - Não estimar tempo / story points

7. **Atualizar o `plan.md`** — na linha da task: "Issue" recebe `[#n](url)` (ou `—`), "Arquivo" recebe o link relativo e "Status" vira `pendente`.

8. **Reportar:** caminho do arquivo, link da issue e confirmação do vínculo de sub-issue, linha atualizada no plan, recap de 2–3 linhas (objetivo + o que validar) e o próximo passo — `/execute <feature>/<id>` para rodar só esta task, ou `/execute <feature>` quando a spec ainda tiver outras `pendente`.

**Não fazer:**

- Não abrir issue quando o dev disser que já tem ou que não quer — nesse caso, pedir o número ou seguir com numeração local
- Não commitar — os artefatos SDD sobem com o `/ship`
- Não inventar seções fora do template — o que não couber vai em "Contexto"
- Não deixar Objetivo genérico ("implementar conforme a spec") nem Contexto vazio
- Não tratar como task deste repo algo que depende de endpoint ou evento inexistente em outro repo sem registrar a dependência — a task de lá é aberta lá, e esta fica bloqueada até o contrato estar no ar

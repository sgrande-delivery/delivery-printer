---
description: Ship de uma spec SDD — push da branch da spec (feat/<issue>-<slug>, um commit por task já feito pelo /execute) e um PR contra master, com a versão do package.json conferida. NÃO cria tag nem release: merge em master não publica nada, e quem dispara a esteira é o dev criando a release como pré-release. Promover a pré-release é o que entrega a atualização aos PDVs.
argument-hint: [<feature> | <feature>/<id> | <id> | PRINTER-XXX | caminho do arquivo da task]
---

O trabalho **$ARGUMENTS** foi aprovado por mim após testes locais. Prossiga com o ship.

> **Como a publicação acontece aqui.** O `.github/workflows/publish.yml` roda no evento **`release: [published]`** — **push em `master` não publica nada**. Quem checa PR e `master` é o `ci.yml`. O dev cria a release com a tag `v<version>` marcada como **PRÉ-RELEASE** (draft não dispara workflow nenhum no GitHub), a esteira confere tag × `package.json`, builda e anexa os três arquivos, e **promover a pré-release é o que entrega a atualização** — o electron-updater pede `/releases/latest`, que ignora draft e pré-release. O fluxo completo, com as armadilhas, está em `.claude/rules/autoupdate.md`.

> **Logo: `/ship` aqui termina no PR.** Não existe tag para criar nem release para criar. Quem cria a tag é o GitHub, quando o dev cria a release; quem anexa os assets é a esteira; quem promove é o dev, depois de instalar o `.exe`. Se algo pedir `git tag` ou `gh release create`, está errado.

> **Onde este comando roda.** O `/execute` deixa o trabalho na branch da spec, `feat/<issue>-<slug>`, com um commit por task. Confirme com `git branch --show-current`; se a branch não existir ou não tiver os commits das tasks, é sinal de que a spec não foi executada por este fluxo, e aí vale perguntar em vez de supor.

> **Um PR por spec, não um por task.** O PR carrega os commits de todas as tasks `executada`, e o corpo tem uma seção por task. Task ainda `pendente`: avisar e perguntar se o PR sai sem ela.

Fluxo:

1. **Resolver o trabalho** — mesma regra do `/execute`: `<feature>` resolve a spec direto; uma task SDD resolve para a spec dela; `PRINTER-XXX` (legada, em `.claude/tasks/`) é uma task só, em `task/<id>-<slug>`. Ler a `spec.md`, o `plan.md` e **todas** as tasks. Registrar:
   - a branch da spec e o slug;
   - o número da issue de cada task (campo `**Issue:**`) e o da feature;
   - **a base registrada na linha `**Branch de trabalho:**`** — é ela que define o alvo do PR.

   Conferir que `git log <base>..HEAD` tem um commit por task `executada`, e que não sobrou mudança não commitada no escopo da spec.

2. **Confirmar o alvo do PR com o dev**, oferecendo a base registrada como default — normalmente `master`, porque este repo não tem branch de integração. Se a spec foi cortada da branch de outra spec que ainda não mergeou, o default é **essa** branch, e o comando certo passa a ser o `/ship-pr`: apontar para `master` faria o diff carregar a spec alheia inteira. Se o registro não existir, descobrir com `git merge-base` contra os candidatos e **perguntar**, sem presumir.

3. **A versão.** O nome da tag e da release saem do `package.json`, e não há Action que faça bump neste repo.
   - `git fetch --tags` e `gh release list --repo sgrande-delivery/delivery-printer --limit 5` para ver o que já existe (a última publicada é a referência real; o `package.json` da branch pode já estar à frente).
   - Se a `version` atual **já corresponde a uma release publicada**, a release nova não pode reusar essa tag: **pare e pergunte ao dev o bump** (patch default, minor, major), e deixe o bump num commit próprio `chore(release): bump version to X.Y.Z`.
   - Se a `version` já está à frente da última publicada, dizer qual é e seguir — é a tag que o dev vai usar ao criar a pré-release, e a esteira **reprova** se as duas divergirem.
   - **A versão só cresce.** É a única coisa que o updater compara.

4. **Delegar ao `git-agent` em duas etapas** — ele não consegue perguntar ao usuário, então a confirmação acontece aqui:

   **Etapa 1 — planejar.** Passar: branch atual, caminhos da spec/plan/tasks, **base do PR já confirmada**, número das issues, o bump de versão se houver, e o que **não** pode entrar nos commits (spec de outra frente, mudança pré-existente alheia, `.claude/settings.local.json`, `out/`, `release/`). Pedir:
   a. Estado do git (`git status`, `git diff --stat`), incluindo varredura de segredo — com atenção a `.env.development`/`.env.production`, que são **versionados** e podem aparecer no diff legitimamente, mas só com URL pública dentro
   b. Garantir que a branch é a da spec; se não for, criar a partir do HEAD com confirmação. Se o trabalho estiver em `master`, **parar e perguntar** — aqui commitar em `master` publica
   c. **Os commits das tasks já existem, um por task — não reescrever, não fazer squash nem rebase.** O plano cobre só o que sobrou: o bump de versão, o commit de estado SDD do passo 6 e algum resto no escopo
   d. Título e corpo do PR

   **Etapa 2 — executar**, depois que o usuário confirmar: commits, `git push -u origin <branch>` e `gh pr create --base <alvo-confirmado> --repo sgrande-delivery/delivery-printer`.

   > **NÃO** criar tag, release nem pré-release. **NÃO** rodar `gh issue close` — o fechamento é do merge, via `Closes #N`.

5. **Corpo do PR** — o que faz um PR revisável aqui:
   - Começar pelo **problema concreto** da spec, não pela lista de arquivos
   - **Uma seção por task**, na ordem dos commits: o que entrega, o sha e a issue
   - Decisões que valem revisão, com o porquê — em especial as que o implementador tomou por conta própria
   - **Canais IPC** criados ou alterados, com o par (preload + `ipcMain.handle`) e o stub de teste
   - **Eventos de socket** novos, em qual namespace, e quem está do outro lado (`delivery-socket-api`, `delivery-admin`)
   - **Telas e rotas** novas, e **como se chega nelas**
   - Variáveis de ambiente novas, nos cinco pontos
   - Se mexeu em `package.json`: a versão antes e depois, e o lembrete de que `npm ci` precisa passar
   - Limitações honestas: o que ficou fora e **o que não foi verificado**
   - **O que acontece no merge, e o que NÃO acontece:** o merge em `master` roda só a checagem e **não publica nada**. Publicar é o dev criar a release com a tag `v<version>` **como pré-release**; a esteira anexa os três arquivos, e **promover é o que entrega a atualização**, depois de instalar o `.exe`. Sem essa linha, alguém mergeia achando que publicou — ou achando que não
   - `Closes #<issue>` no fim, **um por linha para cada task do PR**, mais `Closes #<issue-da-feature>` quando todas as tasks estiverem no PR. Literal e fora de bloco de código
   - Como testar localmente, com comandos que funcionam copiados

6. **Atualizar o estado SDD** (na branch, num commit `docs(sdd)` próprio, depois dos commits das tasks):
   - `**Status:**` de **cada task do PR** → `shipped`
   - Linha de cada uma no `plan.md` → `shipped`
   - Se era a última task pendente, `spec.md` → `**Status:** entregue`
   - Task legada `PRINTER-XXX`: `status:` do frontmatter → `🟢 Implementada`

7. **Verificar o resultado, não confiar no exit code** — o `gh` já falhou em silêncio em outros repos da casa (erro de GraphQL de Projects no `pr edit`) e já devolveu `HTTP 503` no meio de um `pr create`. Reler o corpo publicado (`gh api repos/sgrande-delivery/delivery-printer/pulls/<n> --jq '.body'`) e comparar com o enviado. Em caso de 503, conferir pela REST se o PR nasceu **antes** de tentar de novo — senão nascem dois.

8. **Deixar a árvore em estado conhecido** — só depois do push e do PR confirmados pela API:
   - `git status --porcelain` limpo. Se sobrou algo, reportar e deixar a decisão com o dev — não descartar
   - Confirmar que a branch está no remoto: `git rev-parse HEAD` igual ao de `origin/<branch>`
   - A branch da spec **não** é apagada — ela é o que o PR aponta
   - Perguntar ao dev se quer voltar para `master` ou permanecer na branch da spec

9. **Reportar:**
   - Link do PR e base de verdade dele (lida da API), hash e assunto de cada commit, `git status` final
   - A versão que vai nomear o release, e se houve bump
   - Issues vinculadas (fecham no merge)
   - Branch em que a sessão ficou
   - E explicitamente, o que falta e é do dev:

   > **Próximos passos (não são deste comando), na ordem:** mergear o PR em `master` (**não publica nada**) → criar a release com a tag `v<version>` marcada como **PRÉ-RELEASE** → a esteira confere a tag, builda e anexa `.exe`, `.blockmap` e `latest.yml` **à mesma pré-release** → **instalar o `.exe` e conferir** → **promover** a pré-release, que é o que entrega a atualização → **atualizar o `delivery_printer_version` no `delivery-admin`**, senão o link de download do painel oferece a versão anterior.
   >
   > Dois avisos que valem repetir ao dev: **se a esteira terminar verde e sem assets anexados, não promova** (o suspeito é o `releaseType` ou a regra das 2 horas — ver `.claude/rules/autoupdate.md`); e **criar a release direto como normal** faz a esteira falhar de propósito, porque nesse instante ela já é a `Latest` sem `latest.yml` e todo app instalado tomaria 404. A atualização chega em cada PDV **quando o operador fechar o app pela bandeja** — pode levar dias.

**Não fazer:**

- Não criar tag, release nem pré-release — a tag nasce com o release do electron-builder
- Não publicar nem "promover" release — é ato do dev, e é ele que leva a atualização aos PDVs
- Não abrir um PR por task: o PR é da spec
- Não reescrever, esquashar nem rebasear os commits que o `/execute` fez
- Não commitar direto em `master` — aqui isso publica
- Não incluir nos commits arquivo que não pertence à spec — `git add` por caminho explícito, nunca `git add .`
- Não fechar à mão a issue que o `Closes #N` fecha no merge

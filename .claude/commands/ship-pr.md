---
description: Ship só-PR de uma spec — push da branch da spec (feat/<issue>-<slug>, um commit por task já feito pelo /execute) e um PR contra uma base que NÃO é master, confirmada com o dev. Use quando o PR mira a branch de outra spec ou uma branch de trabalho. Nada de versão, nada de release. Aceita <feature>, uma task SDD, PRINTER-XXX legada ou caminho do arquivo.
argument-hint: [<feature> | <feature>/<id> | <id> | PRINTER-XXX | caminho do arquivo da task] [branch-base opcional]
---

O trabalho **$ARGUMENTS** foi aprovado por mim após testes locais. Prossiga com o ship **só-PR**.

Este comando faz **só** commits + push + PR. Não toca na versão, não cria tag, não cria release, nunca fecha issue à mão.

> **Quando usar este e não o `/ship`.** Neste repo o `/ship` também termina no PR — a diferença é o alvo. `master` **publica no merge**: a esteira builda e cria o release draft, e o `/ship` cuida de conferir a versão do `package.json` e de dizer ao dev o que resta fazer. Este comando é para PR que **não** mira `master`: a branch de outra spec de que esta depende, ou uma branch de trabalho que ainda vai ser consolidada. Nesses casos não há versão a conferir e nada é publicado.

> **A base do PR é sempre perguntada — nunca presumida.** É a única decisão que este comando não pode tomar sozinho: abrir contra a branch errada faz o diff carregar trabalho alheio, ou aponta o merge para um lugar onde o código ainda não deveria entrar. A pergunta acontece **antes** de qualquer commit. E se a resposta for `master`, **use o `/ship`** — ele tem o passo da versão e o aviso do que acontece no merge.

Fluxo:

1. **Localizar o trabalho.** Resolver `$ARGUMENTS` pela mesma regra do `/execute`.
   - **SDD: o PR é da spec, não da task.** `<feature>` resolve a spec direto; uma task resolve para a spec dela.
     - Ler a `spec.md`, o `plan.md` e **todas** as tasks: o corpo do PR sai daí.
     - O trabalho está na branch da spec, `feat/<issue>-<slug>`, com um commit por task.
   - **Legada (`PRINTER-XXX`):** uma task, na branch `task/<id>-<slug>`.
   - **Sem argumento:** trabalhar com a branch atual e perguntar ao dev o que o PR representa.

   Conferir com `git branch --show-current` que a sessão está na branch onde o trabalho vive, e que `git log <base>..HEAD` tem um commit por task `executada`.
   - Task ainda `pendente`: avisar e perguntar se o PR sai sem ela. Sem ela, a issue não entra no `Closes`.
   - Mudança não commitada no escopo da spec: avisar antes de seguir.

2. **Determinar a base do PR** (`<base_branch>`):
   - 2º argumento passado → usar como `<base_branch>`
   - Senão, ler a linha `**Branch de trabalho:**` do `plan.md` (ou a seção `## Branch` das tasks): o `/execute` registra ali de qual base a branch foi cortada. Oferecê-la como default, dizendo que veio de lá
   - Levantar os candidatos reais antes de perguntar:

     ```bash
     git fetch origin
     git log --oneline -1 origin/master
     git branch -r --sort=-committerdate | head -12
     ```

   - **Perguntar e confirmar sempre.** Se a base for `master`, parar e dizer que o comando certo é o `/ship`
   - Confirmar que `origin/<base_branch>` existe. Se não existir, parar e avisar

3. **Delegar ao `git-agent` em duas etapas** — ele não pergunta ao dev, então toda confirmação acontece aqui.

   **Etapa 1 — planejar.** Passar: branch atual, caminhos de task/spec/plan, **a base já confirmada**, número das issues e o que **não** pode entrar nos commits (spec de outra frente viajando no working tree, mudança pré-existente alheia, `.claude/settings.local.json`, `out/`, `release/`). Pedir:
   a. Estado do git (`git status`, `git diff --stat`) e varredura de segredo nos arquivos que vão entrar — com atenção a `.env.development`/`.env.production`, que são **versionados** e podem entrar legitimamente, mas só com URL pública dentro
   b. Confirmação de que a branch é a da spec (ou `task/<id>-<slug>` nas legadas). Se o trabalho estiver em `master`, **parar e perguntar** — aqui commitar em `master` publica
   c. **Os commits das tasks já existem, um por task. Não reescrever, não fazer squash nem rebase.** O plano cobre só o que sobrou: o commit de estado SDD do passo 6 e algum resto no escopo
   d. Título e corpo do PR

   **Etapa 2 — executar**, depois que o dev confirmar: commits, `git push -u origin <branch>` e `gh pr create --base <base_branch> --repo sgrande-delivery/delivery-printer`.

   > **NÃO** tocar na `version` do `package.json`, **não** criar tag, **não** criar release. **NÃO** rodar `gh issue close`.

4. **Corpo do PR.** Um PR por spec:
   - Começar pelo **problema concreto** da spec, não pela lista de arquivos
   - **Uma seção por task**, na ordem dos commits: o que entrega, o sha e a issue
   - Decisões que valem revisão, com o porquê — sobretudo as que o implementador tomou por conta própria
   - Canais IPC (com o par preload + `ipcMain.handle`), eventos de socket e o namespace, telas e rotas novas com o caminho até elas
   - Variáveis de ambiente novas
   - Limitações honestas: o que ficou fora e **o que não foi verificado**
   - Link pra task: SDD → `.claude/sdd/<feature>/tasks/`; legada → `.claude/tasks/`
   - `Closes #<issue>` no fim, um por linha, literal e fora de bloco de código
   - **Que este PR não publica nada:** ele mira `<base_branch>`, e só a chegada em `master` aciona a esteira
   - Como testar localmente, com comandos que funcionam copiados

5. **Verificar o resultado, não confiar no exit code.** Reler o corpo publicado (`gh api repos/sgrande-delivery/delivery-printer/pulls/<n> --jq '.body'`) e comparar com o enviado. Em caso de 503, conferir pela REST se o PR nasceu **antes** de tentar de novo.

   **`Closes #N` contra branch que não é a default não vincula.** O GitHub só registra a keyword quando a base é o branch default (`master`). Em PR contra outra branch, `closingIssuesReferences` volta **vazio** — é esperado, não é erro de formatação, e reescrever o corpo não muda. Manter o `Closes #N` assim mesmo: passa a valer quando o trabalho chegar a `master`. A issue **continua aberta**, e não é para fechá-la à mão.

6. **Atualizar o estado SDD**, quando houver arquivo de task. Entra num commit `docs(sdd)` próprio:
   - `**Status:**` de **cada task do PR** → `shipped`
   - Linha de cada uma no `plan.md` → `shipped`
   - Se era a última task pendente, `spec.md` → `**Status:** entregue`
   - Task legada: `status:` do frontmatter → `🟢 Implementada`

7. **Reportar** ao dev em **tabela markdown com links clicáveis**:

   ```markdown
   ## Ship-PR `<feature>` — concluído

   ### Pull Request

   | # | Título | Base | Link |
   |---|---|---|---|
   | #<num> | <título da PR> | `<base lida da API>` | https://github.com/sgrande-delivery/delivery-printer/pull/<num> |

   ### Issues vinculadas

   | # | Título | Keyword no PR | Link |
   |---|---|---|---|
   | #<n> | <título da issue> | `Closes #<n>` | https://github.com/sgrande-delivery/delivery-printer/issues/<n> |

   <Se não houver: omitir a seção inteira, sem escrever "nenhuma".>

   ### Branch

   | Nome | Base | HEAD | Onde |
   |---|---|---|---|
   | `feat/<issue>-<slug>` | `<base_branch>` | `<sha curto>` | <local / origin> |
   ```

   **Convenções da tabela:** links são URLs absolutas e cruas — não encurtar com `[texto](url)`, o dev copia/cola em outros canais.

   Depois das tabelas, em texto corrido: se `closingIssuesReferences` voltou vazio e por quê, o estado SDD atualizado, a branch em que a sessão ficou, e explicitamente:

   > **Próximos passos**: este ship **não tocou na versão e não gerou release**, e nada foi publicado. O PR mira `<base_branch>` — quando mergeado, o código entra nessa branch. A publicação só acontece quando o trabalho chegar a `master`, pelo `/ship` da entrega que consolidar a frente.

**Não fazer:**

- Não abrir PR contra `master` por aqui — esse caminho é o `/ship`
- Não tocar na `version` do `package.json`
- Não criar tag nem release
- Não abrir um PR por task: o PR é da spec
- Não reescrever, esquashar nem rebasear os commits que o `/execute` fez
- Não incluir nos commits arquivo que não pertence ao trabalho — `git add` por caminho explícito
- Não fechar issue à mão
- Não presumir a base do PR

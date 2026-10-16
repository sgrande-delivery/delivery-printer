---
description: Executa as tasks de uma spec SDD em sequência, na branch da spec (feat/<issue>-<slug>), com um commit local por task. Lê spec e plan, pergunta a base uma vez por spec e delega cada task aos subagentes printer-agent → code-reviewer-typescript → test-writer-typescript, exibindo a tabela de situação a cada etapa. Não faz push nem PR (isso é do /ship ou do /ship-pr).
argument-hint: [<feature> | <feature>/<id> | <id> | PRINTER-XXX | caminho do arquivo da task]
---

Execute a implementação de: **$ARGUMENTS**

## O padrão

- **A unidade de execução é a spec.** `/execute <feature>` roda **todas** as tasks `pendente` da spec, em sequência, na ordem da tabela do `plan.md` e respeitando "Depende de". Não para entre uma task e outra para pedir confirmação: só para em bloqueio real (review que não converge, bug que o test-writer reporta, endpoint da `delivery-api` que ainda não existe, decisão de produto).
- **Uma branch por spec:** `feat/<issue>-<slug>`, com o mesmo nome da pasta SDD. Todas as tasks da spec rodam nela.
- **Um commit por task**, local e sem push, feito quando a task fecha o ciclo implementação → review → testes → review dos testes → verificação própria. Push e PR são do `/ship` (ou do `/ship-pr`), **um PR por spec**.
- **A tabela de situação** é exibida ao dev a cada mudança de etapa.

`/execute <feature>/<id>` ou `/execute <id>` roda **só aquela task**, na mesma branch da spec. As tasks legadas (`PRINTER-XXX`) não têm spec, então continuam com uma branch por task (`task/<id>-<slug>`).

## Resolução do argumento

Tentar nesta ordem:

1. Um caminho `.md`: usar direto e derivar `<feature>` do path quando ele estiver sob `.claude/sdd/`.
2. Só `<feature>` (`12`, `12-printing-settings-screen`), resolvendo `.claude/sdd/<feature>*/`: **modo spec**, que roda todas as tasks `pendente` em ordem.
3. `<feature>/<id>` (ex.: `12/14`): resolver via glob `.claude/sdd/<feature>*/tasks/<id>-*.md`.
4. Só um id numérico que não é pasta de feature: resolver via glob `.claude/sdd/*/tasks/<id>*.md` e derivar `<feature>` do path.
5. `PRINTER-XXX` (legada):
   1. procurar `legacy_id: PRINTER-XXX` em `.claude/sdd/*/tasks/*.md`;
   2. não achando, usar `.claude/tasks/PRINTER-XXX*.md`.
   A legada não tem `spec.md` nem `plan.md`: seguir só com o arquivo dela e dizer isso no relatório. A `PRINTER-001` vive na branch `origin/docs/add-printer-001-task`, não em `master` — se ela for o alvo, confirme de onde ler o arquivo.

Se não achar nada, reportar e parar. Se achar mais de um, perguntar qual.

**Antes de implementar, ler nesta ordem:**

1. a `spec.md` e o `plan.md` da feature, inteiros, inclusive "Aprendizados que valem para as próximas tasks", que é onde moram as armadilhas já pagas;
2. o `CLAUDE.md` da raiz e as regras de `.claude/rules/` cujo `paths:` cobre os arquivos que as tasks tocam;
3. as tasks.

No modo spec, reler o `plan.md` antes de **cada** task, porque a anterior pode ter acrescentado um aprendizado.

**Dependências:** "Depende de" dentro da mesma spec se resolve pela ordem. Se a task depende de endpoint da `delivery-api` ou de evento do `delivery-socket-api`/`delivery-admin` que ainda não existe, confirmar com o dev que está no ar antes de codar contra ele.

## Fluxo

1. **Conferir as issues.** Cada task tem o campo `**Issue:**`, preenchido pelo `/create-spec`.
   - Task sem issue: avisar e perguntar se é para abrir agora, pelo procedimento do `/create-task`, passo 3.

2. **Branch da spec: sempre com `git fetch origin`, e com a base perguntada uma única vez por spec.**

   Working tree sujo: nunca descartar — parar e perguntar antes de trocar de branch. Se a `spec.md`, o `plan.md` ou os arquivos de task ainda não estiverem commitados, avisar antes de trocar de branch.

   a. **A branch `feat/<issue>-<slug>` já existe** (local ou em `origin`): é a continuação de uma execução anterior.
      - Fazer checkout dela e conferir `git log <base>..HEAD` contra as tasks já `executada`.
      - Não perguntar a base de novo: ela está registrada na linha `**Branch de trabalho:**` do `plan.md`.

   b. **A branch não existe:** levantar os candidatos reais, não genéricos:

      ```bash
      git fetch origin
      git log --oneline -1 origin/master
      git branch -a --list "feat/*" --sort=-committerdate | head -12
      ```

      **Perguntar ao dev de qual base cortar**, oferecendo como default:
      - `origin/master` — este repo **não tem branch de integração**, e é esse o caminho normal;
      - a branch da spec de que esta depende, quando a dependência ainda não mergeou. Explicar o porquê: cortar de `master` daria um ponto de partida sem o que a spec pressupõe.

      Se o dev escolher a branch de outra spec sem dependência declarada, confirmar de novo — o PR vai carregar os commits dela.

   c. **Criar a branch.**
      1. Se houver trabalho pendente no working tree que pertença a outra frente, **commitá-lo primeiro**, em commits atômicos e por caminho explícito. Sem isso ele vaza para a branch nova e contamina o diff.
      2. `git checkout -b feat/<issue>-<slug> <base-escolhida>` e, logo depois, `git branch --unset-upstream`. O `checkout -b` a partir de `origin/<base>` configura upstream para a base, e um `git push` sem argumento iria para ela — **e aqui a base é `master`, onde push publica**.
      3. Validar o ambiente antes de delegar: `nvm use` e `npm run typecheck`.

   d. **Registrar a base:**
      - na linha `**Branch de trabalho:**` do `plan.md`: `` `feat/<issue>-<slug>`, cortada de `<base>` em <YYYY-MM-DD> ``;
      - na seção `## Branch` de cada task, a mesma linha.

      É esse registro que o `/ship` e o `/ship-pr` leem para saber contra qual branch abrir o PR.

3. **Baseline, uma vez por spec e antes da primeira delegação.**

   ```bash
   nvm use
   npm run typecheck
   npm run lint
   npm test
   ```

   Guardar o log inteiro em arquivo (não `tail`) e a lista de falhas. A contagem "depois" de cada task vira o "antes" da seguinte. Não rodar baseline enquanto um subagente edita.

   Baseline conhecido em 2026-10-15: typecheck 0, 3 testes passando, lint 0 erros e **1 aviso** (`react-hooks/set-state-in-effect` em `src/renderer/components/login/Login.tsx:23`). Esse aviso é da base — não é achado de task nenhuma, e não se conserta de carona.

4. **Para cada task, em sequência:**

   1. **Delegar ao `printer-agent`.** Passar:
      - os caminhos da task, da spec e do plan;
      - as armadilhas de "Aprendizados", e as regras de `.claude/rules/` cujo `paths:` cobre os arquivos da task — **subagente não carrega a regra sozinho**;
      - a instrução explícita: *"você está na branch `feat/<issue>-<slug>`: NÃO crie nem troque de branch, NÃO commite, trabalhe na atual"*.

      Ele identifica o processo (main, preload, renderer) e a camada, implementa e escreve os testes da task.
   2. **Delegar ao `code-reviewer-typescript`** para validar padrões e os modos de falha conhecidos desta base: canal IPC em um lado só, `socket?.on` sem `off`, Node no renderer, invariante de autoupdate quebrada, segredo em `.env` versionado, `.env` usado como configuração por instalação, layout de impressão em React, MUI/Redux voltando, chave de CSS Module sem rede de teste, rota sem caminho para chegar nela, tipagem frouxa (`noImplicitAny` está off).
      - Pedir julgamento explícito sobre as decisões que o implementador tomou por conta própria.
      - Com violação, volta ao `printer-agent`, em loop até aprovar.
   3. **Delegar ao `test-writer-typescript`** quando a task tiver invariante que merece rede própria (listener de socket, canal IPC, reentrância de impressão, timer de `printer_ping`, estado em `userData`) ou quando a cobertura entregue parecer espelhar a implementação. Ele deriva cenários das RN da spec e verifica por mutação que o teste cai sem a proteção.
      - Ele não edita código de implementação. Se um teste revelar bug, **para e reporta**, e o ciclo volta ao `printer-agent`.
      - Ele não enfraquece, apaga nem pula teste existente.
   4. **Mandar os testes ao `code-reviewer-typescript`**: asserção real (pelo papel, não pela classe), mock só na borda (`window.electron`, socket, módulo do axios), stub de canal novo no `src/__tests__/setup.ts`, ausência de dependência de timing e de ordem.
   5. **Verificar por conta própria** o que for barato:
      - `npm run typecheck`, `npm run lint`, `npm test`;
      - uma mutação da proteção central da task, para confirmar que o teste dela falha sem ela;
      - quando a task encostou em empacotamento ou em dependência do main: `npm run build` e `npx electron-builder --linux dir` + inspeção do asar (receita em `.claude/rules/autoupdate.md`).

      **Não rodar build de produção contra a API real** para "ver funcionando": o `printer_ping` registra a máquina como impressora do restaurante em produção. Verificação manual é `npm run dev`.
   6. **Atualizar o estado:**
      - `**Status:**` da task → `executada`;
      - a linha dela na tabela do `plan.md` → `executada`;
      - `## Implementação` preenchida no arquivo da task, com a subseção de testes;
      - aprendizado novo que valha para as próximas tasks → "Aprendizados" no `plan.md`.
   7. **Commitar a task localmente, sem push:**
      - conferir a branch no mesmo comando do commit — **se a branch atual for `master`, parar**: aqui push em `master` publica;
      - `git add` **por caminho explícito**, só com o escopo da task: código, testes, o arquivo da task e o `plan.md`. Nunca `git add .`;
      - mensagem em Conventional Commits no padrão do repo (assunto em inglês, imperativo, minúsculo; escopo da lista do `git-agent`), com a issue da task: `feat(printing): emit printer_status per device (#14)`;
      - terminar a mensagem com as linhas de atribuição da sessão.

      Um commit por task, e **cada commit roda**: typecheck e suíte verdes no commit, não só no fim da spec.
   8. **Exibir a tabela de situação** e seguir para a próxima task sem pedir confirmação.

5. **Fechamento da spec.** Com todas as tasks `executada`:
   - suíte completa, typecheck e lint contra o baseline do passo 3;
   - tabela final;
   - relatório.

## Tabela de situação

Exibir ao dev no início (depois de resolver a branch), a cada mudança de etapa e no fim:

```markdown
**Spec 12** — `feat/12-printing-settings-screen` (base `origin/master`, cortada em 2026-10-16)

| Task | Issue | Etapa | Situação |
|---|---|---|---|
| 01 — arquivo de settings em userData | #14 | ✅ commitada | `13f9865` |
| 02 — canal IPC de leitura e escrita | #15 | 🧪 testes | test-writer escrevendo |
| 03 — tela de configuração | #16 | ⏳ pendente | — |
```

Etapas, nesta ordem: ⏳ pendente · 🔨 implementação · 🔍 review · 🧪 testes · 🔍 review dos testes · ✅ commitada (com o sha curto na coluna "Situação"). Usar ⛔ bloqueada, com o motivo, quando a execução parar.

A coluna "Situação" diz em uma linha **o que está acontecendo agora**. O dev lê a tabela para saber onde a implementação está sem abrir log nenhum.

## Relatório final

- A tabela final e a branch, pronta para o `/ship <feature>`.
- Arquivos criados e modificados **por task**, separando implementação de testes.
- Canais IPC criados/alterados (com o par conferido por `grep`), eventos de socket, telas e rotas novas, com o caminho de navegação até elas.
- `npm run typecheck`, `npm run lint` e `npm test` com **baseline antes e depois**, **verificados por você**. Se o número de falhas ou avisos subiu, dizer qual e por quê.
- Decisões que o implementador tomou por conta própria e o veredito do review sobre elas.
- Variáveis de ambiente novas — e a confirmação de que entraram nos cinco pontos.
- Se a entrega depende de contrato de outro repo (`delivery-api`, `delivery-socket-api`, `delivery-admin`), dizer o que precisa estar no ar antes.
- Se a entrega encosta em empacotamento: o resultado da inspeção do asar, ou que ela não foi feita.
- Próximo passo: o dev testa manualmente e roda `/ship <feature>`.

**Importante:**
- O commit local por task é esperado.
- Push, PR, tag e release **não**: push é do `/ship`, e tag/release são do electron-builder no merge em `master`.
- Ao terminar, deixe a branch da spec em check-out: é nela que o `/ship` roda.

## Sobre o ambiente

- `nvm use` antes de tudo (Node 24 pelo `.nvmrc`): o shell desta máquina abre em Node 18 por padrão.
- `npm run dev` precisa do `--watch` (já está no script): sem ele, main e preload não são observados e alteração no processo principal não tem efeito nenhum.
- `npm run lint` **não** tem `--fix` aqui: ele não escreve no working tree. Quem escreve é `npm run lint:fix` e `npm run format`.
- Se a task mexer em `package.json`, rodar `npm ci` e dizer no relatório — o CI roda `npm ci`.
- Os commits da spec se empilham numa branch só: task que deixa typecheck ou suíte vermelho no commit dela contamina o review de todas as seguintes.
- Nada aqui dispara deploy: o que publica é o merge em `master`, e mesmo ele só cria um release **draft**.

# Spec — Esteira: checagem em PR e publicação só a partir de release

**Status:** entregue
**Criada em:** 2026-10-15
**Escopo:** build/empacotamento
**Issue:** [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)

## Contexto

O `.github/workflows/publish.yml` roda em `push: branches: [master]` e termina em `npx electron-builder --win --publish always`. Duas consequências medidas:

1. **PR não é checado.** Não existe workflow em `pull_request`: typecheck, lint e teste só rodam **depois** do merge. Quem revisa não tem sinal nenhum, e o primeiro feedback de um erro de tipo é a esteira de `master` falhando com o código já integrado.
2. **Merge e versão são a mesma coisa.** Qualquer merge em `master` builda e sobe assets. Dois merges na mesma versão reaproveitam o mesmo rascunho de release e sobrescrevem os arquivos; um merge com a versão de um release **já publicado** mexe no que o parque instalado está consumindo.

O portão que existe hoje é bom e não deve ser perdido: o electron-builder cria o release como `draft` (default do publisher, confirmado no schema do `builder-util-runtime`), e o electron-updater pede `https://github.com/<owner>/<repo>/releases/latest` com `Accept: application/json` (`GitHubProvider.getLatestTagName`), URL que **ignora draft e pré-release**. Ou seja: nada chega ao cliente antes de alguém publicar.

O que falta é desacoplar **integrar** de **versionar**: entrar em `master` não deveria gerar pacote; criar a release deveria.

## Objetivo

PR checado sempre, e publicação disparada **pela criação da release**, com a esteira conferindo que a tag e a `version` do `package.json` são a mesma coisa — hoje nada garante isso, e divergir faz os assets irem para outro rascunho, sem erro.

## Requisitos funcionais

- **RF-01** — Todo PR roda typecheck, lint, test e build, e o resultado aparece no PR.
- **RF-02** — `push` em `master` não publica nada.
- **RF-03** — Criar a release com a tag `v<version>` dispara o build e anexa instalador, `.blockmap` e `latest.yml` a ela.
- **RF-04** — Se a tag da release não for `v` + a `version` do `package.json`, a esteira falha nomeando as duas, antes de buildar.
- **RF-05** — O repositório documenta o fluxo novo e o rollback, nos quatro lugares que hoje afirmam "master publica".

## Regras de negócio

- **RN-01** — **O que entrega a atualização ao PDV é a release ser a `Latest` do repo.** Draft e pré-release são invisíveis ao updater, e é nisso que o portão de teste se sustenta: dá para ter os assets prontos sem ninguém baixar.
- **RN-02** — **A versão vem do `package.json` e só cresce.** Não há Action de bump aqui; subir a versão é parte do trabalho, e o electron-builder procura a release pela tag `v<version>` — não pela tag do evento.
- **RN-03** — **A conferência tag × versão vem antes do build.** Falhar em 10 segundos é melhor que anexar 150 MB no lugar errado.
- **RN-04** — **Publicar não é o fim.** O link de download do app no `delivery-admin` é hardcoded para `.../delivery-printer-2/releases/download/v${delivery_printer_version}/SGrande-Delivery-Printer-Setup-${v}.exe` (`pages/printer-settings/PrinterSettingsForm.tsx`), e `delivery_printer_version` é um campo digitado à mão em `PUT /printerSettings`. Release publicada sem atualizar esse campo deixa o painel oferecendo a versão anterior.
- **RN-05** — **A atualização chega quando o operador fecha o app**, que vive na bandeja: podem ser dias. Nenhum passo do fluxo pode supor efeito imediato no parque instalado.

## Fora do escopo

- Assinatura de código e mudanças no instalador — spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26).
- Bump automático de versão por Action. O `delivery-site` tem um `bump-version.yml`; aqui a versão continua manual, porque ela também é digitada no admin (RN-04) e automatizar meio caminho piora.
- Publicar automaticamente a release depois do build: isso removeria o portão de teste da RN-01.
- Atualizar `delivery_printer_version` no admin por API, daqui. É uma chamada autenticada de outro domínio; fica documentada no passo manual até alguém especificar direito.

## Critérios de aceitação

- [ ] PR com erro de tipo reprova; corrigido, aprova.
- [ ] Merge em `master` não gera release nem assets.
- [ ] Criar a release com a tag certa anexa `.exe`, `.blockmap` e `latest.yml` a ela.
- [ ] Criar com a tag divergente falha com mensagem nomeando a tag e a versão do `package.json`.
- [ ] `CLAUDE.md`, `.claude/rules/autoupdate.md`, `.claude/commands/ship.md` e `.claude/agents/git-agent.md` descrevem o fluxo novo, e o rollback está escrito.

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Qual atividade do evento `release` dispara a esteira | **Medir antes de decidir** (task [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9)). O default é `created` com a release salva como **draft**: é o que preserva o portão sem expor nada. Se a medição mostrar que `created` não dispara para draft, o caminho é criar como **pré-release** (dispara `published`/`prereleased`, e o updater ignora pré-release do mesmo jeito), e o rollout passa a ser "marcar como latest". A terceira opção, `workflow_dispatch` com a tag como input, fica como reserva |
| 2 | O que fazer quando o electron-builder encontra a release já criada | Medir na mesma task: o publisher procura a release pela tag e anexa. Se ele recusar release não-draft, isso decide a pendência 1 em favor do draft |

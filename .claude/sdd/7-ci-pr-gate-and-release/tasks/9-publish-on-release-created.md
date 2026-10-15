# 09 — Publicar só quando a release for criada, conferindo tag e versão

**Issue:** [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9)
**Feature:** [Esteira: checagem em PR e publicação só a partir de release](../spec.md) — issue #7
**Tipo:** chore
**Processo:** build
**Depende de:** 08
**Status:** pendente

## Objetivo

Tirar a publicação do `push` para `master` e passá-la para o evento de `release`, conferindo antes de buildar que a tag da release é `v` + a `version` do `package.json`.

## Contexto

- `.github/workflows/publish.yml` hoje: `on: push: branches: [master]`, `runs-on: windows-latest`, typecheck + test + build e `npx electron-builder --win --publish always` com `GH_TOKEN: ${{ secrets.TOKEN }}`
- Cobre a **RF-02**, a **RF-03** e a **RF-04**, e resolve as duas **decisões pendentes** da spec
- O electron-builder procura a release pela tag **`v<version>` do `package.json`**, não pela tag do evento: divergência faz os assets irem para outro rascunho, silenciosamente. É o que a conferência evita
- `actions/checkout@v4` num evento de `release` já traz o commit da tag, então o pacote é exatamente o que foi marcado — vale confirmar com `git log -1` no log da esteira
- `windows-latest` continua necessário aqui: NSIS sem wine
- `secrets.TOKEN` é o nome do secret que existe; não renomear

## Mudanças

### 1. Medir, antes de escrever o workflow final

Duas perguntas que **não** se responde por leitura, e que decidem o desenho (decisões pendentes da spec):

1. **O evento `release` com atividade `created` dispara a esteira quando a release é salva como draft?** A documentação de webhook descreve `created` como "um draft foi salvo, ou uma release/pré-release foi publicada sem ter sido draft antes", mas o comportamento no GitHub Actions é o que vale aqui.
2. **O electron-builder anexa assets a uma release que já existe e não é draft?** O publisher procura por tag; o caminho de release já publicada precisa ser visto.

Medir num rascunho de teste, com `workflow_dispatch` temporário no workflow para iterar sem criar release a cada tentativa. Registrar o resultado em "Aprendizados" do `plan.md` — ninguém vai querer medir isso duas vezes.

Fluxos, em ordem de preferência:

- **draft + `created`** (preferido): rascunho → esteira anexa → instalar e conferir → publicar → rollout
- **pré-release + `published`** (se `created` não disparar para draft): pré-release → esteira anexa → conferir → marcar como latest → rollout. Também seguro, porque `/releases/latest` ignora pré-release
- **`workflow_dispatch` com a tag como input** (reserva): perde o vínculo automático com a release

### 2. O workflow

`.github/workflows/publish.yml` (alterado):

- gatilho novo, conforme a medição
- primeiro passo, **antes** do `npm ci`: comparar `github.event.release.tag_name` com `v$(node -p "require('./package.json').version")` e falhar com mensagem nomeando as duas, por exemplo: `A release foi criada com a tag v2.7.1, mas o package.json está em 2.7.0. Suba a versão ou corrija a tag.`
- mantém typecheck + test + build antes de empacotar
- mantém `--win --publish always` e o `secrets.TOKEN`
- `concurrency` por tag, para dois eventos na mesma release não buildarem em paralelo

## Testes

Verificação empírica, com rascunho de teste que é **apagado** depois (e nunca publicado):

- tag divergente → falha no primeiro passo, em segundos, com as duas versões na mensagem
- tag correta → `.exe`, `.blockmap` e `latest.yml` anexados à release certa
- `push` em `master` → nenhuma execução do `publish.yml`
- o log mostra o commit da tag, não o `HEAD` de `master`

## Critérios de aceitação

- [ ] `push` em `master` não publica nada
- [ ] Criar a release com a tag certa anexa os três arquivos a ela
- [ ] Tag divergente reprova antes do build, nomeando tag e versão
- [ ] A medição das duas perguntas está registrada em "Aprendizados" do `plan.md`
- [ ] O rascunho de teste foi apagado, e nenhuma release de teste ficou publicada

## Fora de escopo

- Publicar a release automaticamente — isso removeria o portão de teste (RN-01 da spec)
- Bump automático de versão
- Atualizar o `delivery_printer_version` no admin por API — documentado como passo manual na task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10)
- Assinatura de código — spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26)

## Branch

`feat/7-ci-pr-gate-and-release`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

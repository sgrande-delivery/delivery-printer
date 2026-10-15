# 09 — Publicar só quando a release for criada, conferindo tag e versão

**Issue:** [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9)
**Feature:** [Esteira: checagem em PR e publicação só a partir de release](../spec.md) — issue #7
**Tipo:** chore
**Processo:** build
**Depende de:** 08
**Status:** executada

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos alterados

- `.github/workflows/publish.yml` — reescrito: gatilho `release: [published]`, job `gate` (ubuntu) + job `publish` (windows)
- `package.json` — **só** `build.publish.releaseType: "prerelease"`. `appId`, `owner`, `repo`, `private`, `productName`, arquitetura e `version` intocados

### As duas decisões pendentes da spec, resolvidas

**Decisão 1 — qual atividade dispara.** `created` está fora: a documentação do GitHub diz que draft **não** dispara workflow para `created`/`edited`/`deleted`. O gatilho é `published`, e a segurança vem de a release nascer pré-release.

**Decisão 2 — o que o electron-builder faz com release já existente.** Medido no código: ele sobe para draft; para não-draft **só** se `releaseType != "draft"`; e recusa release publicada há mais de 2 h. As duas últimas recusas são `log.warn` + `return null` + **exit 0**.

### O gate, e por que ele não infere intenção pelo evento

A documentação **não** diz quais activity types disparam na promoção de uma pré-release. Então o gate olha o estado real:

| Estado da release | Decisão |
| --- | --- |
| pré-release | `build=true` → builda e publica |
| não-pré, **com** `latest.yml` nos assets | `build=false` → promoção, nada a buildar, sai 0 |
| não-pré, **sem** `latest.yml` | **exit 1** com `::error::` — a release já é a Latest e todo app instalado tomaria 404 |
| payload de assets ilegível | **exit 1** com mensagem **própria** |

Correto nos dois cenários possíveis de semântica do evento. Verificado em **12 direções** pelo review e em 3 por mim, extraindo o `run:` do próprio YAML.

### Correções que o review fez, e por que cada uma importa

- **`EP_GH_IGNORE_TIME: 'true'`** — *o diff é que abriu essa exposição*: com draft, a regra das 2 h era inalcançável (draft retorna antes da checagem). Com pré-release ela vale, e recusa com run **verde e zero asset**
- **O comentário de cabeçalho era falso e perigoso:** afirmava que o electron-builder só anexa a draft ou pré-release. Com `releaseType: prerelease` ele anexa a release normal igual — alguém poderia remover o `gate` confiando nessa frase, e o gate é a única proteção
- **Mensagem de tag divergente** passou a dizer qual é a tag esperada: com a tag `2.7.0` (sem o `v`) ela lia "a tag 2.7.0, mas o package.json está em 2.7.0"
- **Payload ilegível ganhou mensagem própria**, em vez de herdar o conselho destrutivo de apagar e recriar a release
- **Mensagem do caso perigoso** passou a mandar **marcar como pré-release agora** — o único ato que tira a release da `Latest` imediatamente — antes de separar os dois casos

### Decisões mantidas pelo review

Dois jobs (promoção não acorda runner Windows; o caso perigoso vira job vermelho); comparação de tag no `publish`, porque ali ela lê o `package.json` **do mesmo checkout que vai ser empacotado`; `node -e` em vez de `jq` (mesmo interpretador no teste e no runner); `toJSON(...)` por `env` (nome de tag e de asset chegam como dado, testado com `"; rm -rf`); `concurrency` sem cancelamento (cancelar no meio do upload deixaria `.exe` parcial ou `latest.yml` sem `.blockmap`); `shell: bash` (o default do windows-latest é PowerShell).

### Verificação

- typecheck 0 · lint 0 erros e 1 aviso (o da base) · 3 testes
- **Empacotamento rodado:** `npm run build` + `npx electron-builder --linux dir` saem 0 com o `releaseType` novo; `app.asar` 5,0 MB, 24 pacotes, zero devDependency, com `electron-updater`, `electron-log` e `socket.io-client` presentes. `release/` apagado depois
- Invariantes de `.claude/rules/autoupdate.md` conferidas uma a uma, por mim e pelo review
- `releaseType` confirmado **inerte** no cliente: zero ocorrências em `node_modules/electron-updater/out/`

### O que NÃO é verificável antes do merge

Para o evento `release`, o workflow que vale é o que está em `master`. Então **nada** aqui prova o comportamento real: nem que `published` dispara na promoção, nem que o electron-builder anexa os três arquivos à pré-release, nem a reprovação por tag divergente ponta a ponta.

Isso se fecha na primeira release depois do merge, e o procedimento está na task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10). **Se a esteira terminar verde e sem assets, não promova** — o suspeito é a regra do `releaseType` ou a das 2 h.

## Branch

`feat/7-ci-pr-gate-and-release`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

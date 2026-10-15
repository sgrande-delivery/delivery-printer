---
paths:
  - "package.json"
  - "package-lock.json"
  - "electron.vite.config.ts"
  - "build-config.ts"
  - ".github/workflows/**"
  - "src/main/updater.ts"
  - ".env.development"
  - ".env.production"
  - ".env.example"
---

# Empacotamento, release e autoupdate

Esta é a regra em que um erro **não aparece no seu computador**: ele aparece semanas depois, numa máquina de restaurante que parou de receber atualização sem dizer nada. Tudo aqui foi medido, não deduzido.

## As invariantes

| Item | Valor hoje | Se mudar |
| --- | --- | --- |
| `build.appId` | `com.sgrande.delivery` | A nova versão instala **ao lado** da antiga em vez de atualizar |
| `build.publish` | `github`, owner `raphaelcarreiro`, repo `delivery-printer-2`, `private: true` | É o que gera o `app-update.yml` **embarcado**; instalação antiga continua consultando o valor antigo para sempre |
| `electron-updater` e `electron-log` | em **`dependencies`** | São externalizados do bundle do main; em `devDependencies` o electron-builder não os empacota e o `require` falha em runtime, **em silêncio** |
| `build.win.target[].arch` | `["ia32", "x64"]` numa invocação | Builds separados por arquitetura **sobrescrevem o `latest.yml`** e quebram o update de uma delas |
| `build.nsis.perMachine` | `false`, explícito (com `oneClick: false` e `allowElevation: false`) | `true` faz o instalador declarar `RequestExecutionLevel admin` (`installer.nsi:20-25`), então o update silencioso do `quit` abre UAC sem ninguém na frente e o PDV sem senha de admin para de atualizar em silêncio. Com `oneClick: true` soma-se o `isAdminRightsRequired` no `latest.yml` (`NsisTarget.js:311` — só quando `oneClick` **ou** `packElevateHelper` explícito; com o assistente e o default, ele **não** é gravado), que manda o updater pelo `elevate.exe` sem retry nem fallback (`NsisUpdater.js:123-129`). E `allowElevation: false` só desabilita a opção "todos os usuários" quando o instalador **não** roda elevado: instalação escolhida como admin ainda quebra o update daquela máquina (`installer.nsi:101-115`) |
| `version` | sempre crescente | É a única coisa que o updater compara |
| Electron | **43.x** | O 44 removeu `win32-ia32`: PDV 32-bit para de instalar e de atualizar |

## Por que o `build.publish` não pode "só ser corrigido"

O remoto deste clone é `raphaelcarreiro/delivery-printer-2`, nome antigo que o GitHub **redireciona** para `sgrande-delivery/delivery-printer`. Medido:

```
GET https://github.com/raphaelcarreiro/delivery-printer-2/releases/latest  → 301
  → https://github.com/sgrande-delivery/delivery-printer/releases/latest   → 200
```

O download de asset também atravessa o redirect (`.../releases/download/v2.6.0/latest.yml` → `200`).

Cada instalador carrega `resources/app-update.yml` com o owner/repo do momento do build. **Trocar para `sgrande-delivery/delivery-printer` só afeta instalações futuras**: quem já tem o app instalado continua pedindo a URL antiga até receber uma atualização — que ele só recebe pela URL antiga. Então:

- o redirect é **parte da infraestrutura de atualização**, não um detalhe cosmético;
- ninguém cria um repo novo chamado `raphaelcarreiro/delivery-printer-2` — isso mata o redirect e congela todas as instalações existentes;
- a troca do `publish`, se um dia valer a pena, é uma task própria, com o risco escrito, e não um "aproveitei que estava ali".

`private: true` com repo público é inofensivo: o electron-updater só usa o provedor privado quando existe `GH_TOKEN`/`GITHUB_TOKEN` no ambiente do app, o que não acontece na máquina do cliente.

## Como o release sai

Dois workflows. `ci.yml` checa (`pull_request` e `push: master`: `npm ci`, typecheck, lint, test, build) e **não publica**. `publish.yml` publica, no evento **`release: [published]`**, e é onde moram as armadilhas abaixo.

### O fluxo

| # | Ato | Quem |
| --- | --- | --- |
| 1 | bump da `version`, PR, merge em `master` (**não publica**) | dev |
| 2 | criar a release com a tag `v<version>`, **como PRÉ-RELEASE** | dev |
| 3 | conferir tag × `package.json`, buildar, anexar `.exe`/`.blockmap`/`latest.yml` | esteira |
| 4 | instalar o `.exe` anexado e conferir | dev |
| 5 | **promover** a pré-release a release normal → rollout | dev |
| 6 | atualizar `delivery_printer_version` no `delivery-admin` | dev |

### Por que pré-release e não draft

**Draft não dispara workflow.** Documentação do GitHub, literal: *"Workflows are not triggered for the `created`, `edited`, or `deleted` activity types for draft releases."* A segurança do portão vem então de a release ser **pré-release**, que o `GitHubProvider` do electron-updater ignora do mesmo jeito que ignora draft — ele pede `https://github.com/<owner>/<repo>/releases/latest` com `Accept: application/json` e lê o `tag_name`, e essa URL pula draft **e** pré-release.

### As três armadilhas do `getOrCreateRelease`

`node_modules/electron-publish/out/gitHubPublisher.js`, achando a release pela tag:

1. **release não-draft com `releaseType === "draft"`** (o default, quando o `package.json` não declara) → `log.warn("GitHub release not created")` e **`return null`**: nada anexado, **exit 0**. Fechado por `"releaseType": "prerelease"` em `build.publish`.
2. **release publicada há mais de 2 horas** → recusa igual, só com warn. **Esta só passou a existir quando saímos de draft** (draft retorna antes da checagem de tempo). Re-rodar o job no dia seguinte basta para cair nela. Fechado por `EP_GH_IGNORE_TIME: 'true'` no step de empacotamento.
3. **release inexistente** → criada, porque `--publish always`.

**`releaseType: "prerelease"` não é guarda:** com ele o publisher sobe para draft, pré-release **e release normal** igualmente. Quem recusa o caso perigoso é o job `gate` do workflow.

### O gate, e por que ele olha estado e não evento

A documentação **não** diz quais activity types disparam quando uma pré-release é promovida. Então o `gate` não infere intenção pelo tipo do evento — ele lê o estado real da release:

| Estado | Decisão |
| --- | --- |
| pré-release | builda e publica |
| não-pré, **com** `latest.yml` nos assets | promoção: não builda, sai verde |
| não-pré, **sem** `latest.yml` | **falha** — já é a `Latest` sem `latest.yml`, e todo app instalado tomaria 404 em silêncio |
| payload de assets ilegível | **falha**, com mensagem própria (não mande apagar release por erro de leitura) |

Esse desenho é correto nos dois cenários possíveis de semântica do evento. **Quando um gatilho do GitHub tiver semântica incerta, copie esta abordagem.**

### O que o cliente faz

`AppUpdater.run()` → `autoUpdater.checkForUpdates()` no boot, com `autoDownload` e `autoInstallOnAppQuit` ligados (`src/main/updater.ts`). O usuário vê uma notificação pedindo para fechar o app; a troca acontece no `quit`.

Corolário duplo, e os dois importam: **a atualização chega quando o operador fecha o app**, que vive na bandeja — pode levar dias; e **fechar pela janela (X) não produz `quit`** (`src/main/window.ts` dá `preventDefault` enquanto `isQuiting` for falso, e o `app.quit()` do Electron aborta quando uma janela impede o próprio fechamento), então só o "Fechar" da bandeja aplica atualização. Não prometa "atualiza na hora" em nenhuma task.

`releaseType` atravessa para o `app-update.yml` embarcado no pacote, e é **inerte** no cliente: zero ocorrências em `node_modules/electron-updater/out/`, e `allowPrerelease` é `false` por default. Nenhum PDV instala pré-release.

`secrets.TOKEN` é o nome do secret que existe no repo — não renomeie para `GITHUB_TOKEN` nem para `GH_TOKEN` no workflow sem criar o secret novo antes.

### Rollback

**O electron-updater não faz downgrade.** Marcar a release anterior como `Latest` faz com que ela volte a ser oferecida a quem **ainda não atualizou**; quem já atualizou **não volta sozinho**. As duas saídas:

- **voltar a anterior para `Latest`** (marcar a nova como pré-release) — estanca a propagação em minutos, e é o primeiro ato em qualquer incidente;
- **publicar uma versão nova com número maior e o conteúdo revertido** — é o único jeito de recuperar quem já atualizou.

As duas juntas, nessa ordem. E antes de qualquer uma: **se a esteira terminou verde e sem assets, não promova** — o problema é uma das armadilhas acima, não o código.

### Checklist de release

- [ ] `version` do `package.json` subiu, e é maior que a última tag publicada (`gh release list`)
- [ ] PR mergeado em `master` com o `ci.yml` verde
- [ ] release criada com a tag **`v<version>`** e marcada como **pré-release**
- [ ] run do `publish.yml` verde **e com os três arquivos anexados** à pré-release
- [ ] `.exe` instalado e conferido numa máquina
- [ ] release promovida (sai da pré-release, vira `Latest`)
- [ ] `delivery_printer_version` atualizado no `delivery-admin`

## Verificação, quando a task encostar nisto

Não dá para confiar em leitura: empacote e abra o asar.

```bash
npm run build
npx electron-builder --linux dir            # rápido, não precisa de Windows nem de wine
npx asar list release/linux-unpacked/resources/app.asar | head -40
cat release/linux-unpacked/resources/app-update.yml
```

**Correção medida em 2026-10-15:** o `app-update.yml` **não** está dentro do `app.asar` nesta versão — `npx asar extract-file … app-update.yml` falha com *"was not found in this archive"*. Ele fica ao lado, em `resources/`, então basta `cat release/linux-unpacked/resources/app-update.yml`.

> **Cuidado com o `extract-file`, medido do jeito ruim em 2026-10-15:** ele **escreve o arquivo extraído no diretório atual**, com o nome original. Rodado na raiz do repo para conferir o `package.json` empacotado, ele **sobrescreve o `package.json` do repo** — e, como o do asar não tem `scripts` nem `devDependencies`, o estrago é silencioso até o próximo `npm run`. Para inspecionar conteúdo, use `npx asar list` (não escreve nada); precisando do arquivo, rode o `extract-file` **de dentro de um diretório temporário**, nunca da raiz.

O que tem de aparecer: `out/main`, `out/preload`, `out/renderer`, `package.json`, `node_modules/electron-updater`, `node_modules/electron-log`, `node_modules/socket.io-client` — e **nenhuma** devDependency. A última medição (2026-10-15, Electron 43.7.11) deu 24 pacotes e `app.asar` de 5,0 MB. Apague `release/` depois: ela é gitignorada, mas 200 MB atrapalham.

Para o Windows de verdade, `npx electron-builder --win --publish never` precisa rodar no Windows (o workflow usa `windows-latest` justamente para não depender de wine).

## As variáveis de ambiente

`APP_API_BASE_URL` e `APP_WS_BASE_URL`, lidas por `buildTimeConstants(mode)` em `build-config.ts` e injetadas como `__API_BASE_URL__`/`__WS_BASE_URL__` nos **três** bundles via `define`.

- O mecanismo é `define`, e não o suporte nativo do electron-vite, porque o nativo usa prefixo por processo (`MAIN_VITE_`, `RENDERER_VITE_`) e `src/constants/constants.ts` é importado pelo main **e** pelo renderer — forçaria dois nomes para o mesmo valor
- Falta de variável **falha o build** com a mensagem que nomeia qual e onde defini-la. Não troque isso por default silencioso
- `vitest.config.ts` importa o mesmo `buildTimeConstants`, com `'development'`, para os dois nunca divergirem
- **Variável nova** entra em: `.env.development`, `.env.production`, `.env.example`, `REQUIRED_ENV` e o retorno de `buildTimeConstants`, mais a declaração em `env.d.ts`. Cinco pontos; faltar um dá `undefined` inlinado ou erro de tipo
- `.env.development` e `.env.production` são **versionados**: nunca segredo ali. Os valores são inlinados no bundle e vão dentro do instalador, extraível com `npx asar`. Override de máquina é `.env.local`

## Dependência nova

- **Do renderer**: entra em `devDependencies`. O Vite bundla dentro do JS; o electron-builder não precisa empacotar nada. Consequência a lembrar: `npm audit --omit=dev` **não** reflete o que é distribuído, porque react-router-dom e axios estão em devDependencies e vão dentro do bundle
- **Do main**: se for externalizada (é o default do `externalizeDepsPlugin`), tem de estar em `dependencies` — mesma armadilha do `electron-updater`
- Depois de mexer em `package.json`, rode `npm ci` e **diga no relatório**: o CI roda `npm ci`, que falha se o lockfile não acompanhar

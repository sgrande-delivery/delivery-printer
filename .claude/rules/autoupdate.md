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

`.github/workflows/publish.yml`, em `push` para `master`: `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npx electron-builder --win --publish always`, com `GH_TOKEN: ${{ secrets.TOKEN }}`.

1. O electron-builder cria o release como **`draft`** (default do publisher, confirmado no schema do `builder-util-runtime`), com tag `v<version>` do `package.json`, e sobe `Setup-<version>.exe`, `.blockmap` e `latest.yml`.
2. **Draft não atualiza ninguém.** O `GitHubProvider` do electron-updater pede `https://github.com/<owner>/<repo>/releases/latest` com `Accept: application/json` e lê o `tag_name` — essa URL ignora draft **e** pré-release.
3. Publicar o release (virar a **Latest** do repo) é o que entrega a atualização. É ato do dev, pela UI, depois de instalar o `.exe` e conferir.
4. O app checa no boot: `AppUpdater.run()` → `autoUpdater.checkForUpdates()`, com `autoDownload` e `autoInstallOnAppQuit` ligados (`src/main/updater.ts`). O usuário vê uma notificação pedindo para fechar o app; a troca acontece no quit.

Corolário: **a atualização chega quando o operador fecha o app**, e o app vive na bandeja. Pode levar dias. Não prometa "atualiza na hora" em nenhuma task.

`secrets.TOKEN` é o nome do secret que existe no repo — não renomeie para `GITHUB_TOKEN` nem para `GH_TOKEN` no workflow sem criar o secret novo antes.

## Verificação, quando a task encostar nisto

Não dá para confiar em leitura: empacote e abra o asar.

```bash
npm run build
npx electron-builder --linux dir            # rápido, não precisa de Windows nem de wine
npx asar list release/linux-unpacked/resources/app.asar | head -40
npx asar extract-file release/linux-unpacked/resources/app.asar app-update.yml
```

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

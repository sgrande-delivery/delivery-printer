# SGrande Delivery Printer 2

Impressão automática dos pedidos. Aplicação Electron + React, sem boilerplate:
o build é um `electron.vite.config.ts` de ~50 linhas que você controla por
inteiro.

> Instalar, dar suporte ou achar o log num restaurante? Veja o
> [`INSTALL.md`](./INSTALL.md): este README é para quem desenvolve.

## Requisitos

Node 24 (ver `.nvmrc`):

```bash
nvm use
npm install
```

## Desenvolvimento

```bash
npm run dev        # electron-vite dev --watch
npm run typecheck  # tsc nos dois lados (node e web)
npm run lint
npm test
```

Em dev: `F12` abre o devtools, `Ctrl+R` recarrega e o botão direito tem
"Inspect element". Fora de dev esses atalhos não existem.

### Hot reload

A flag `--watch` é obrigatória: sem ela o electron-vite compila main e preload
uma vez e não observa mais os arquivos, então alterações no processo principal
não têm efeito nenhum até você reiniciar à mão.

| Você edita | O que acontece |
| --- | --- |
| Componente ou `*.module.css` | atualiza na hora, estado preservado |
| Provider ou service | atualiza propagando até o `App.tsx`: a árvore remonta e o estado é perdido (volta pro loading), mas sem reload do browser |
| `src/main/` ou `src/main/preload.ts` | recompila e reinicia o app (~30ms de build) |

## Build e release

```bash
npm run build      # gera out/main, out/preload e out/renderer
npm run package    # instalador local, sem publicar
npm run release    # build + publica no GitHub Releases
```

O push para `master` **não publica**: ele só roda a checagem
(`.github/workflows/ci.yml`). Publicar é criar a release com a tag
`v<version>` marcada como **pré-release** — a esteira
(`.github/workflows/publish.yml`) confere a tag, builda e anexa o
instalador, o `.blockmap` e o `latest.yml` a ela. **Promover a pré-release
é o que entrega a atualização** aos PDVs, e deve ser feito só depois de
instalar e conferir o `.exe`.

O checklist completo, as armadilhas do publisher e o procedimento de
rollback estão em `.claude/rules/autoupdate.md`.

## Configuração por ambiente

As URLs vêm dos arquivos `.env`, carregados por `mode`:

| Arquivo | Quando | Versionado |
| --- | --- | --- |
| `.env.development` | `npm run dev` | sim |
| `.env.production` | `build`, `package`, `release` | sim |
| `.env.local`, `.env.*.local` | sobrescreve na sua máquina | **não** |

```
APP_API_BASE_URL=https://api.sgrande.delivery/api/admin/
APP_WS_BASE_URL=https://socket2.sgrande.delivery
```

Se alguma faltar, o build falha dizendo qual e em que arquivo defini-la, em vez
de gerar um app apontando para `undefined`.

> **Isso não é lugar para segredo.** Os valores são inlinados nos bundles em
> tempo de build e vão dentro do instalador, que é extraível com `npx asar`.
> São configuração pública, não credencial. Para configuração por instalação
> (ex.: impressora escolhida), use um arquivo em `app.getPath('userData')`,
> que é leitura em runtime.

## Estrutura

```
electron.vite.config.ts   build dos três processos (main, preload, renderer)
build-config.ts           aliases e constantes de build, compartilhados com o vitest
src/main/                 processo principal
src/renderer/base/        primitivos de UI (Typography, Button, TextField...)
src/renderer/             interface (React)
src/constants/            configuração por ambiente, usada pelos dois lados
out/                      saída do build (gitignored)
```

## Estilos

Não há biblioteca de UI nem CSS-in-JS. Cada componente tem seu
`Componente.module.css` ao lado (CSS Modules, suporte nativo do Vite), e as
cores, fontes e pesos são custom properties definidas em `:root` no
`src/renderer/app.css`. Os primitivos reutilizáveis ficam em
`src/renderer/base/`.

## Restrições que não podem ser quebradas

**Electron fica em 43.x.** O Electron 44 removeu os builds de Windows 32-bit
(`ia32`). Como o app é distribuído para PDVs 32-bit, subir para 44+ faz essas
máquinas pararem de instalar **e de receber atualização automática**, sem aviso.
Antes de subir a major, confirme que não existe mais nenhuma instalação 32-bit.

**O autoupdate depende de:**

| Item | Se mudar |
| --- | --- |
| `build.appId` = `com.sgrande.delivery` | A nova versão instala ao lado em vez de atualizar |
| `build.publish` (github/owner/repo) | Gera o `app-update.yml` embarcado no pacote |
| `electron-updater` e `electron-log` em `dependencies` | São externalizados do bundle do main; em `devDependencies` o electron-builder não os empacota e o `require` falha em runtime, silenciosamente |
| Uma única invocação do electron-builder para as duas arquiteturas | Builds separados sobrescrevem o `latest.yml` e quebram o update de uma delas |
| `version` sempre crescente | O updater compara versões |

Por isso `build.win.target` já declara `arch: ["ia32", "x64"]`: um `npm run
release` cobre as duas em uma passada, gerando um instalador combinado e um
`latest.yml` só.

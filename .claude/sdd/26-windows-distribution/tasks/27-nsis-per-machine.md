# 27 — Instalador per-machine, com atalhos e instalação silenciosa

**Issue:** [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27)
**Feature:** [Distribuição no Windows: instalador e assinatura](../spec.md) — issue #26
**Tipo:** chore
**Processo:** build
**Depende de:** (nenhuma)
**Status:** shipped (com um critério deliberadamente não atendido — ver Implementação)

## Objetivo

Configurar o NSIS para o uso real de PDV: instalação para a máquina inteira, atalho na área de trabalho, escolha de pasta e instalação silenciosa para o suporte — sem perder a atualização automática.

## Contexto

- `package.json` → `build.win` declara só `target: nsis` com `arch: ['ia32', 'x64']`; **não existe bloco `nsis`**, então valem os defaults do electron-builder: `oneClick: true`, `perMachine: false`, sem escolha de pasta
- Cobre a **RF-02**, a **RF-03**, a **RF-04** e a **RF-05**, e é onde a **RN-02** é verificada
- **O risco da task:** o electron-updater baixa a atualização e a aplica no `quit` (`autoInstallOnAppQuit = true`, `src/main/updater.ts:12`). Com instalação per-machine, o instalador precisa de elevação, e o Windows pode exigir UAC numa hora em que ninguém está olhando a tela. Se isso acontecer, o parque **para de atualizar em silêncio** — e é por isso que a decisão pendente 3 da spec existe
- **Não definir `artifactName` e não mexer em `productName`** (RN-01): o link de download do painel depende de `SGrande-Delivery-Printer-Setup-<version>.exe`
- O início automático é resolvido por código na spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) — esta task não precisa de `createStartMenuShortcut` para isso, e as duas não devem brigar

## Mudanças

### 1. Bloco `nsis`

`package.json` (alterado), em `build`:

```json
"nsis": {
  "oneClick": false,
  "perMachine": true,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "SGrande Delivery Printer"
}
```

Os valores de `oneClick` e `perMachine` são as decisões pendentes 2 e 3 da spec: entram assim e **podem voltar** se a verificação da RN-02 reprovar.

### 2. Verificação da atualização automática

O passo que define a task, e que não é teste de código:

1. empacotar e instalar a versão atual (per-machine)
2. publicar uma versão seguinte pelo fluxo da spec [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)
3. deixar o app aberto, esperar o download, **fechar pela bandeja** e observar se a atualização conclui sem intervenção
4. registrar o resultado em "Aprendizados" do `plan.md`

Se exigir UAC sem ninguém na frente, voltar `perMachine: false` e registrar o porquê — a decisão está prevista.

### 3. Instalação silenciosa

Confirmar e documentar a flag do instalador NSIS gerado (`/S`, e `/D=` para a pasta), com o comando exato que o suporte vai usar. Documentar na task [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29); aqui é só confirmar que funciona.

## Testes

Não há teste automatizado de instalador. A verificação é empírica, e cada item é um critério:

- instalar com dois usuários do Windows e abrir com os dois
- atualização automática sobre a instalação per-machine
- instalação silenciosa numa máquina sem interação
- nome do arquivo publicado inalterado

## Critérios de aceitação

- [ ] Instalado por um usuário, o app abre para outro usuário da mesma máquina
- [ ] A atualização automática conclui sem intervenção — **ou** a decisão de voltar para per-user está registrada com o motivo
- [ ] Instalação silenciosa funciona com a flag documentada
- [ ] O artefato continua `SGrande-Delivery-Printer-Setup-<version>.exe`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo (a task não toca `src/`, mas a esteira é a mesma)

## Fora de escopo

- Assinatura — task [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28)
- Documentação para o suporte — task [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29)
- Início automático (spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2))
- Mexer em `productName`, `appId` ou `build.publish`

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

`package.json` (bloco `build.nsis` + chave top-level `"//"` com a razão) e `.claude/rules/autoupdate.md` (invariante nova + a armadilha do `extract-file`). **Nenhum arquivo de código.**

### O critério que NÃO foi atendido, de propósito

> *"Instalado por um usuário do Windows, o app abre para outro usuário da mesma máquina."*

**Não atendido.** A task pedia `perMachine: true`, e a medição mostrou que isso quebra o update silencioso: instalação per-machine faz o instalador declarar `RequestExecutionLevel admin` (`installer.nsi:20-25`), então o Windows pede **UAC na criação do processo** quando o updater aplica a atualização no `quit` — sem ninguém na frente, num PDV que pode não ter senha de administrador. E numa máquina já per-machine, o update com `/S` cai em `UAC_RunElevated` + `Quit` (`installer.nsi:101-115`).

Quem decidiu foi a **RN-02 desta própria spec**, que nomeia isso como a verificação central: *"se a atualização passar a exigir confirmação de UAC que ninguém vê, o parque para de atualizar"*. A regra venceu o requisito.

**Reverter é uma linha** — mas aí a task precisa de Windows real, usuário não-admin e o cenário de migração do parque que hoje está em `%LOCALAPPDATA%`.

### O mecanismo, e a correção de uma afirmação minha

A primeira versão desta análise dizia que per-machine grava `isAdminRightsRequired` no `latest.yml` (`NsisTarget.js:311`). **Imprecisa para a forma que o repo tem:** `electron-builder` **não injeta defaults do schema** — `NsisTarget.js:39-45` monta `this.options` como `{ preCompressedFileExtensions, ...config.nsis }`, então `packElevateHelper` fica `undefined`, não `true`. Com `perMachine: true` **e** `oneClick: false`, o `(oneClick || options.packElevateHelper)` é falsy e o campo **nem seria gravado**.

A conclusão estava certa; o mecanismo não. O que vale aqui é o `RequestExecutionLevel` do manifesto.

### O que foi entregue

```json
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowElevation": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "SGrande Delivery Printer"
}
```

A razão do `perMachine: false` está numa chave top-level `"//"` — JSON não tem comentário e o `scheme.json` tem `additionalProperties: false` na raiz do `build` **e** no `NsisOptions`, então top-level é o único lugar possível (conferido: `npm ci --dry-run`, `npm pkg get`, `npm pack` e o load do electron-builder, todos ok). **Deixar o default implícito era o que fez a spec pedir o contrário sem perceber.**

`allowElevation: false` **fecha menos do que parece**: `multiUserUi.nsh:109-120` só desabilita "todos os usuários" quando o instalador **não** roda elevado; como admin, a opção continua selecionável. Fechar de verdade exige `customInstallMode`, que é task própria.

### O que ficou provado por medição

- **O parque atualiza no lugar:** `registryAddInstallInfo` é inserido **sem condicional** (`installSection.nsh:67`), então toda instalação já gravou `InstallLocation`; o `initMultiUser` acha `hasPerUserInstallation=1` e reaproveita a pasta antiga. **Não cria segunda instalação**, mesmo com o `APP_FILENAME` mudando por causa do `oneClick: false`
- **O nome do asset é preservado**, e por uma linha específica: `computeSafeArtifactNameIfNeeded` (`platformPackager.js:690-703`) troca **só espaço** por hífen, então sai `SGrande-Delivery-Printer-Setup-2.7.0.exe` — exatamente o que o `delivery-admin` tem hardcoded. No fallback sairia `sgrande-delivery-printer-2-setup-2.7.0.exe` e **o botão "Baixar agora" quebraria**. O arquivo local em `release/` continua com espaços: **só o asset publicado é hifenizado**
- **A desinstalação apaga a pasta certa.** Investigação levantada e derrubada: o `uninstaller.nsh:237-244` apaga **três** nomes, incluindo `${APP_PACKAGE_NAME}` (sempre o `name` do `package.json`), e é ali que o `userData` mora — medido rodando Electron 43 contra app de forma idêntica, e corroborado pelo `updaterCacheDirName` do `app-update.yml`

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · 3 testes em 2 arquivos (baseline desta cadeia) · **empacotamento rodado duas vezes** (`npm run build` + `npx electron-builder --linux dir`), `app.asar` com os três bundles e 24 pacotes em `node_modules`, ~5,0 MB · `app-update.yml` em `resources/` **fora do asar**, com `owner`/`repo`/`releaseType` intactos · `electron-updater` e `electron-log` em `dependencies` · Electron 43.7.11 · `appId`, `productName`, `artifactName`, `build.publish` e `win.target` intactos · as duas arquiteturas numa invocação só.

### O que não foi verificado

Tudo o que exige Windows, e é o que a spec chama de verificação empírica: o `.exe` em si, o diálogo de UAC, instalação silenciosa (`/S`, `/D=`), instalar com dois usuários, e **a atualização real entre duas versões publicadas** — que é a única coisa que fecha a RN-02 de verdade e **exige duas releases pela esteira**.

## Branch

`feat/26-windows-distribution`, cortada de `feat/7-ci-pr-gate-and-release` em 2026-10-15, com um commit por task.

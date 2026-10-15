# Plan — Distribuição no Windows: instalador e assinatura

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26)
**Branch de trabalho:** `feat/26-windows-distribution`, cortada de `feat/7-ci-pr-gate-and-release` em 2026-10-15: a esteira da spec #7 é o que publica o que esta spec empacota

## Abordagem técnica

Três frentes quase independentes:

- **instalador** (`build.nsis` no `package.json`) — não depende de decisão externa, e é onde está o risco técnico real (RN-02: per-machine × atualização automática)
- **assinatura** (`build.win` + secrets na esteira) — bloqueada pela escolha do certificado
- **documentação de suporte** — depende do que as duas primeiras definirem, e do log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) para dizer onde ele fica

A verificação da RN-02 não é opcional nem é teste de mesa: precisa de duas versões empacotadas, uma instalada e a outra publicada, para a atualização acontecer de verdade. Isso usa o fluxo de release que a spec [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7) define, então **esta spec vem depois dela**.

## Decisões arquiteturais

- **`artifactName` não é definido.** Deixar o default é o que mantém `SGrande-Delivery-Printer-Setup-<version>.exe`, que é o que o painel espera (RN-01). Definir explicitamente o mesmo valor também serviria, mas acrescenta um lugar para errar.
- **A assinatura entra pela esteira, não pela máquina de ninguém.** Assinar local com token físico produz release que só uma pessoa consegue publicar.
- **Se per-machine quebrar a atualização automática, per-machine é que cai** (decisão pendente 3). Instalação compartilhada entre logins é conveniência; atualização silenciosa é a razão de o app existir no formato em que está.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Instalador per-machine, com atalhos e instalação silenciosa | [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27) | [27-nsis-per-machine.md](./tasks/27-nsis-per-machine.md) | — | pendente |
| 02 | Assinar o instalador e o executável | [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28) | [28-code-signing.md](./tasks/28-code-signing.md) | — | pendente |
| 03 | Documentar instalação e suporte | [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29) | [29-support-install-docs.md](./tasks/29-support-install-docs.md) | 01, 02 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03, com a ressalva de que a **02 está bloqueada pela decisão pendente 1 da spec** (qual certificado). Se a decisão não existir quando chegar a vez dela, o `/execute` a marca `⛔ bloqueada` e segue para a 03 com o que a 01 entregou — a documentação de suporte vale sem a assinatura.

Esta spec **depende da [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)** (esteira e release) estar entregue: a verificação da RN-02 exige publicar duas versões pelo fluxo novo.

## Dependências de outros repos

| O quê | Onde | Efeito |
| --- | --- | --- |
| Link de download hardcoded com o nome do arquivo | `delivery-admin`, `pages/printer-settings/PrinterSettingsForm.tsx` | Restringe `productName`/`artifactName` (RN-01). Não é mudança lá, é restrição aqui |
| `delivery_printer_version` atualizado depois de cada release | `delivery-admin`, `PUT /printerSettings` | Sem isso, o painel oferece a versão anterior — já coberto pelo checklist da task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10) |

## Verificação da entrega

- **duas máquinas Windows limpas** (ou máquinas virtuais): uma para instalar a versão anterior e receber a atualização, outra para a instalação do zero com o SmartScreen virgem
- a verificação da RN-02 é a que decide a decisão pendente 3, e tem de ser feita **antes** de publicar a versão assinada para o parque
- `signtool verify /pa <arquivo>` (ou as propriedades do arquivo no Explorer) para a assinatura
- instalação silenciosa com a flag documentada, numa máquina sem interação

## Aprendizados que valem para as próximas tasks

Da task 01 (#27) — **a decisão desta task foi contra o que a spec pedia, e o motivo está aqui**:

- **`perMachine: false`, contra a RF-02, porque per-machine quebra o update silencioso no PDV.** A restrição do dev é que o autoupdate tem de continuar funcionando; a spec pediu per-machine sem ter medido o custo. **O custo aceito está declarado abaixo.**
- **O mecanismo, medido — e não é o que eu primeiro afirmei.** `electron-builder` **não injeta defaults do schema**: `NsisTarget.js:39-45` monta `this.options` como `{ preCompressedFileExtensions, ...config.nsis }`, então `packElevateHelper` fica **`undefined`**, não `true` (o `@default true` existe só na doc). Logo, com `perMachine: true` **e** `oneClick: false`, o `(oneClick || options.packElevateHelper)` de `NsisTarget.js:311` é falsy e o **`isAdminRightsRequired` nem seria gravado**. Per-machine cairia por outro caminho:
  - `installer.nsi:20-25` — com `INSTALL_MODE_PER_ALL_USERS` o instalador declara **`RequestExecutionLevel admin`**, e o Windows pede UAC **na criação do processo**, no `quit`, sem ninguém na frente;
  - `installer.nsi:101-115` — numa máquina que já tenha instalação per-machine, o update com `/S` cai em `UAC_RunElevated` + `Quit`.
  - O `elevate.exe` do `NsisUpdater.js:123-129` é que não tem retry nem fallback — mas ele é o caminho do `oneClick: true`.
- **`allowElevation: false` fecha menos do que parece.** `multiUserUi.nsh:109-120`: o radio "todos os usuários" só é desabilitado **quando o instalador não roda elevado**; com `UAC_IsAdmin` verdadeiro ele continua selecionável. Quem quiser fechar de verdade precisa de `customInstallMode` com `StrCpy $isForceCurrentInstall "1"` (`multiUserUi.nsh:41-43,59-65`), que força per-user e pula a página — **task própria**, acrescenta `installer.nsh` em buildResources.
- **O parque instalado atualiza no lugar, e isso foi medido.** `registryAddInstallInfo` (`include/installer.nsh:103-106`) é inserido **sem condicional** em `installSection.nsh:67`, então toda instalação já gravou `InstallLocation` em `Software\<APP_GUID>` (GUID = `UUID.v5(appId)`, e o `appId` não mudou). No primeiro update assistido: `hasPerUserInstallation=1` → `setInstallModePerUser` → `$INSTDIR` é a pasta antiga → `uninstallOldVersion` troca no lugar. **Não cria segunda instalação**, mesmo com o `APP_FILENAME` mudando por causa do `oneClick: false`. Só instalação **nova** vai para `%LOCALAPPDATA%\Programs\SGrande Delivery Printer`.
- **Investigação boa, conclusão errada, e vale ficar escrito para ninguém reabrir:** o `uninstaller.nsh:237-244` apaga **três** nomes, não um — `${APP_FILENAME}`, `${APP_PRODUCT_FILENAME}` e **`${APP_PACKAGE_NAME}`**, que é sempre o `name` do `package.json` (`NsisTarget.js:171`). E é ali que o dado mora: medido rodando Electron 43 contra app de forma idêntica, `userData` = `<appData>/sgrande-delivery-printer-2`, corroborado pelo `updaterCacheDirName: sgrande-delivery-printer-2-updater` do `app-update.yml` e pelo fato de o `package.json` dentro do asar **não** ter `productName` top-level. A desinstalação com apagar dados continua mirando a pasta certa.
- **O nome do asset é contrato, e está preservado por uma linha de código específica.** `computeSafeArtifactNameIfNeeded` (`platformPackager.js:690-703`) tem o comentário *"if space is the only problem, just replace only space to dash"*: espaço é o único problema, então `SGrande Delivery Printer Setup 2.7.0.exe` → **`SGrande-Delivery-Printer-Setup-2.7.0.exe`**, exatamente o que o painel tem hardcoded. Se caísse no fallback `generateGitHubInstallerName`, sairia `sgrande-delivery-printer-2-setup-2.7.0.exe` e **o botão "Baixar agora" quebraria**. O arquivo local em `release/` continua com espaços — **só o asset publicado é hifenizado**, então ninguém deve "consertar" o nome local.
- **Insumo para a task 03 (#29):** instalação silenciosa é **`/S`** (default per-user) ou **`/S /currentuser`**, **nunca `/allusers`** — `assistedInstaller.nsh:122-127`. Terminando per-machine, aquele PDV para de atualizar em silêncio. O `/D=` é suportado (`GetDParameter`), e o `instFilesPre` acrescenta o nome do app se a pasta escolhida não o contiver (`assistedInstaller.nsh:33-38`).
- **Cosmético aceito:** com `allowElevation: false` e instalador não elevado, o template concatena string **hardcoded em inglês** (`multiUserUi.nsh:114`), então num Windows pt-BR aparece "Para todos os usuários (must run as admin)". É texto do NSIS, não string de idioma.


<!-- Preenchido ao longo da execução. O resultado da verificação per-machine × atualização
     automática é o fato mais importante desta spec: registrar aqui com detalhe. -->

## Medições feitas antes da execução (2026-10-15)

- **O nome do instalador é contrato com o `delivery-admin`, e ele é hardcoded lá.** `delivery-admin/src/pages/printer-settings/PrinterSettingsForm.tsx:232` monta:

  ```
  https://github.com/raphaelcarreiro/delivery-printer-2/releases/download/v${version}/SGrande-Delivery-Printer-Setup-${version}.exe
  ```

  Conferido nos assets reais do release `v2.6.0` que está no ar: `SGrande-Delivery-Printer-Setup-2.6.0.exe`, mais o `.blockmap` e o `latest.yml`. **Com hífens.**
- **`artifactName` NÃO está configurado, e nunca esteve** (conferido em `95d13e3~1`, antes do refactor): o default do electron-builder (`${productName} Setup ${version}.${ext}`) **sanitiza os espaços para hífens**, e é daí que sai o nome que o painel espera. Nenhuma regressão veio do refactor — **mas qualquer mudança que afete o nome do artefato quebra o botão "Baixar agora" do painel, em silêncio, com 404.** Critério verificável desta spec: depois de empacotar, o arquivo gerado tem de se chamar exatamente `SGrande-Delivery-Printer-Setup-<version>.exe`.
- **`nsis: {}`** está vazio, então vale o default do electron-builder: `oneClick: true` e **`perMachine: false`** — instalação por usuário, em `%LOCALAPPDATA%`. É o ponto de partida da task 01 (#27).
- **`build.publish` continua `owner: raphaelcarreiro` / `repo: delivery-printer-2`** de propósito: toda instalação no parque consulta essa URL para atualizar. O GitHub redireciona do nome antigo, e o link do painel usa o antigo também.

## A task 02 (#28) NÃO foi entregue, e o motivo

**Status: ⛔ bloqueada por decisão do dono do negócio**, não por impedimento técnico.

Assinar exige **escolher e comprar um certificado**, e a decisão pendente 1 desta spec descreve as duas saídas: OV tradicional (US$ 200–400/ano, com a chave em token físico pelas regras novas da CA/B Forum — o que complica assinar na esteira) ou **Azure Trusted Signing** (assinatura na nuvem, ~US$ 10/mês, exige empresa verificada e plano Azure). **A recomendação é o Azure Trusted Signing**, por assinar no CI sem token físico.

Sem certificado não há o que implementar: `win.certificateFile`/`win.signtoolOptions` sem credencial não assina nada, e colocar credencial em `.env` versionado é proibido neste repo (o valor seria inlinado no bundle e extraível do instalador com `npx asar`).

**Enquanto isso, o SmartScreen avisa "editor desconhecido" em toda instalação**, e o `INSTALL.md` da task 03 documenta como passar por ele — é a mitigação, não a correção.

Quando o certificado existir, a #28 roda sem mudar nada do que a #27 entregou: ela só acrescenta assinatura ao mesmo `build.win`.

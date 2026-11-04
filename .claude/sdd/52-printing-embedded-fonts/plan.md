# Plan — Fontes de impressão embarcadas no app

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#52](https://github.com/sgrande-delivery/delivery-printer/issues/52)
**Branch de trabalho:** `feat/52-printing-embedded-fonts`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-04: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim.

> **Por que não `origin/master`.** Medido em 2026-11-04: o `master` deste repo ainda é a árvore **pré-ERB** — tem `.erb/` e `yarn.lock`, e não tem `electron.vite.config.ts`, `src/main/logger.ts`, `src/main/queue/` nem o `printReceipt`. Nenhuma premissa das duas tasks existe lá, e o PR [#36](https://github.com/sgrande-delivery/delivery-printer/pull/36), que remove o boilerplate, está aberto e em conflito. O `feature/api-v2-and-redesign` tem todas as premissas e já contém a spec 38 (merge do PR #51), então é o tronco de fato. **O PR desta spec é `/ship-pr` contra ele, não `/ship` contra `master`** — e a linha do `CLAUDE.md` que dá `origin/master` como default está desatualizada.

## Abordagem técnica

**O ponto de entrada é único.** O `printReceipt` (`src/main/ipc-events/onRawPrint.ts:11`) é por onde passa **todo** HTML que este app imprime: o comprovante da `delivery-api` pelo worker da fila (`src/main/queue/print-queue-worker.ts`), o `rawPrint` direto e a página de teste local (`src/main/testPrintPage.ts`). Declarar as faces ali cobre a RF-02 inteira num lugar só, e nenhum caminho novo de impressão precisa lembrar de fazer nada.

**Onde os arquivos ficam:** `assets/fonts/`. Isso **não exige mudança no `package.json`** — `extraResources: ["./assets/**"]` já empacota `assets/` em `resources/assets/`, e o `getAssetPath(app, 'fonts', …)` (`src/main/asset.ts:5`) já resolve `process.resourcesPath` no empacotado e `../../assets` em desenvolvimento. É o mesmo caminho pelo qual o ícone da tray já chega (`src/main/tray.ts:13`).

**Forma do módulo:** `src/main/printFonts.ts` (novo), com o catálogo das seis faces e duas funções puras — uma que monta o bloco `<style>` a partir de um resolvedor de caminho, outra que o insere no HTML. Puras porque o `printReceipt` não tem teste hoje (ele precisa de `BrowserWindow` de verdade), e é o que torna a RN-05 e a RN-06 verificáveis sob o Vitest sem Electron. O `printReceipt` fica com a composição: monta o CSS uma vez por processo e injeta antes do `fs.writeFileSync`.

## Decisões arquiteturais

- **Injetar no texto do HTML, não `insertCSS` depois do load.** Medi que o `insertCSS` funciona, mas a face entra **depois** de a página estar carregada e o `print` vem na linha seguinte: é uma janela de corrida sem necessidade. Injetada no texto, a face está no documento antes do primeiro layout.
- **`file://` em vez de `data:` URI base64.** As duas funcionam (medido). O `data:` dispensaria caminho, e com ele a RN-06 inteira, mas acrescenta **~160 kB de base64 a cada HTML de impressão** — e esse HTML é gravado em disco e **guardado na fila durável** (`print-queue.ndjson`, em `userData`) enquanto o trabalho está pendente ou falhado. Aquele arquivo é a parte que já carrega dado de cliente e que o `trimPrintedHtml` existe para conter; não vale engordá-lo em dez vezes o tamanho das fontes por trabalho.
- **Sem `asarUnpack`.** Medi que o `file://` lê de dentro do `app.asar`. Como os arquivos vão por `extraResources`, a questão nem se apresenta — fica registrado para quem for mexer no empacotamento e supor que precisa.
- **Sem esperar `document.fonts.ready` antes do `print`** (decisão pendente 2 da spec). Medido com `printToPDF` nos dois modos: a fonte real é embarcada **com e sem** a espera, porque o `loadFile` só resolve depois de a fonte usada ter sido buscada e o `font-display: block` não pinta no fallback. O `delivery-admin` precisou da espera porque lá o caminho é `window.print()` no navegador. Se algum dia aparecer comprovante em fallback no parque, **a espera é a primeira coisa a tentar**.
- **`font-display: block`**, como no admin. `swap` pinta no fallback e troca depois, o que numa folha de 80 mm é a métrica errada no papel — e aqui não existe "depois": o papel já saiu.
- **Este app não lê `font_family`** (RN-01). Registrando as três famílias, quem escolhe é o HTML que chegou. Nenhum enum deste repo precisa acompanhar o enum da API.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | As seis faces de impressão em `assets/fonts/` | [#53](https://github.com/sgrande-delivery/delivery-printer/issues/53) | [tasks/53-print-fonts-in-assets.md](./tasks/53-print-fonts-in-assets.md) | — | executada |
| 02 | Declarar os `@font-face` no HTML de impressão | [#54](https://github.com/sgrande-delivery/delivery-printer/issues/54) | [tasks/54-font-faces-in-print-html.md](./tasks/54-font-faces-in-print-html.md) | 01 | executada |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 antes de 02, e a dependência é literal: a task 02 tem um teste que confere que cada arquivo do catálogo **existe no disco** (RN-08), e ele não passa sem os binários. O inverso não vale — a 01 é só arquivo e README, não muda comportamento e passa sozinha.

## Dependências de outros repos

**Nenhuma bloqueia.** As duas outras pontas estão prontas, o que é incomum nesta casa e vale dizer em voz alta:

- **`delivery-api`** — spec [#1410](https://github.com/sgrande-delivery/delivery-api/issues/1410), **10 tasks shipped** na branch `feature/1410-printer-document-models-and-font`. O `PrintFontEnum` (`core/Printer/Domain/Enums/PrintFontEnum.php`) emite família e peso nos seis documentos. Nada a pedir lá
- **`delivery-admin`** — spec 1026, **4 tasks shipped**, incluindo a tela que grava `font_family` e os woff2 auto-hospedados em `public/fonts/print/`, que são a origem dos binários da task 01

**A ordem de deploy importa, e é a de sempre neste repo:** a atualização chega ao PDV quando o operador **fecha o app pela bandeja**, e ele vive lá — pode levar dias. Até isso acontecer em cada máquina, o gestor que escolher Plex, Atkinson ou Barlow continua vendo a bobina sair no fallback. Isso tem de ir no relatório do `/ship` e, se possível, ser dito na tela do admin.

**Uma observação para o `delivery-admin`, que não é desta frente:** o admin auto-hospeda `ibm-plex-mono-500/700`, e conferi que **nenhum** dos seis documentos da API nomeia mono — nos modelos `completo` e `simples` os valores saem com `.highlight-value`, na mesma família do resto. Se a pré-visualização de lá mostra valores em mono, ela mostra algo que a bobina não imprime. Issue de lá.

## Verificação da entrega

Além de `npm run typecheck`, `npm run lint` e `npm test`:

1. **`npm run package`** e conferir que `release/win-unpacked/resources/assets/fonts/` tem os seis woff2 e a `OFL.txt`. O `asar` não precisa ser aberto para isto — as fontes vão por `extraResources`, fora dele
2. **Imprimir de verdade em desenvolvimento**, com a loja de teste gravada em `font_family: plex`, e conferir na bobina (ou no PDF, se a impressora de teste for virtual) que o comprovante saiu em IBM Plex Sans Condensed. Repetir em `atkinson` e `barlow`
3. **`font_family: original`** e conferir que o documento saiu como sai hoje (RN-02)
4. **Com a máquina sem rede**, repetir o passo 2 — é a RN-04, e é o cenário real do PDV
5. **Renomear um dos woff2** e imprimir: o log registra o arquivo ausente e **o comprovante continua saindo**, no fallback (RF-04, RN-08)

Nada disso se verifica contra a API de produção: o `printer_ping` registraria esta máquina como impressora do restaurante.

## Aprendizados que valem para as próximas tasks

### Cobertura de glifo **não** se mede com `document.fonts.check` (task 01)

Sem descritor `unicode-range` no `@font-face`, o intervalo assumido é `U+0-10FFFF` e o Chromium responde `true` para **qualquer** caractere, inclusive os que a fonte não tem. O método deu falso positivo nesta spec — a frase "recorte `latin` + `latin-ext`" passou por ele e pelo review de quem a escreveu, e só caiu quando alguém descomprimiu o woff2 e leu o `cmap`. O que presta: parse do `cmap` (brotli + subtabelas 4 e 12), que dá 220 codepoints na Atkinson, 227 na Barlow e 229 na Plex, máximo `U+2215`.

O `document.fonts.load(...)` + `FontFace.status` **continua** válido para a outra pergunta, que é se o arquivo foi buscado: caminho inexistente dá `status: "error"`. É só cobertura que ele não sabe responder.

### As faces embarcadas não têm `latin-ext` (task 01)

Herdado da origem (`delivery-admin`, task 1027, que registrou o desvio por falta de `fonttools`). Letra fora do Latin-1 (`Ł`, `ş`, `ő`, `ă`) cai no fallback **glifo a glifo**: duas fontes na mesma linha da bobina, sem erro nenhum. pt-BR está inteiro coberto, então não bloqueia esta frente — mas é dívida conhecida, e **a task 54 não a resolve**. Resolver significa subsetar com `fonttools` e, com isso, deixar de usar os bytes vetados em térmica.

### O `README.md` de `assets/` viaja dentro do instalador (task 01)

`extraResources: ["./assets/**"]` não filtra: o empacotado saiu com **oito** arquivos em `resources/assets/fonts/` (6 woff2 + `OFL.txt` + `README.md`), não sete. Sem segredo nenhum ali, e a `OFL.txt` **precisa** viajar, porque a OFL exige que a licença acompanhe a redistribuição. Precedente que contrasta com `src/renderer/fonts/README.md`, que **não** viaja porque o Vite só emite o woff2. Documentação nova em `assets/` é documentação que vai para a máquina do cliente.

### `buildResources: "assets"` não se incomoda com subdiretório novo (task 01)

Era o risco real da task 01, e foi verificado empacotando (`npm run build && npx electron-builder --linux dir`): build sem um único warning de ícone, e `resources/assets/{icon.ico,icon.png,icon.svg,icons/}` no lugar. No código do electron-builder, o `getResource()` faz um `readdir` **plano** de `assets/` e compara por **nome exato** (`platformPackager.js:583-592`). **A regra que isso deixa:** o perigo em `assets/` é colidir com nome reservado — `icon.*`, `icons/`, `installerIcon.ico`, `uninstallerIcon.ico`, `installerHeader.bmp`, `installer*Sidebar.bmp`, `installer.nsh`, `background.*`, `entitlements.*`, `appx/`, `snap/`, `linux/`. `fonts/` está fora da lista.

### O `app.asar` não muda de tamanho, e isso é a prova (task 01)

`npx asar list` deu 562 entradas e **zero** woff2 de impressão, e o `app.asar` saiu com 5 409 498 bytes — o mesmo byte a byte do build de 29/10. É a medição que mostra que `extraResources` põe os arquivos **fora** do pacote da aplicação, e que `asarUnpack` é desnecessário. O woff2 do renderer (`material-symbols-outlined-subset`) continua sendo o único dentro do bundle.

### O bloco injetado tem teto de tamanho, por causa do prescan de charset (task 02)

Medido no Electron 43: o bloco de `@font-face` tem ~1,5 kB e empurra o `<meta charset="utf-8">` da página de teste do byte 43 para o **1613** — fora da janela de **1 024 bytes** do prescan de charset do HTML. O Chromium ainda decodifica UTF-8 (o detector de encoding de `file://` cobre) e os acentos saem inteiros, inclusive na linha `ÁÉÍÓÚ ÂÊÔ ÃÕ Ç` da página de teste, que existe justamente para denunciar acento errado. **Não é defeito, é teto:** quem fizer o bloco crescer muito precisa medir isso de novo. E é mais um argumento contra a alternativa `data:` base64 — com ela o `<meta>` iria para ~160 kB de distância.

No mesmo medidor: inserir `<style>` entre `<html>` e um `<head>` explícito faz o parser abrir um head implícito e **descartar o token `<head>`**. O head final fica com os filhos certos, na ordem certa; o único efeito seria perder atributo em `<head>`, e não existe nenhum neste repo.

### Invariante de cache em módulo do main se testa com `resetModules` + import dinâmico (task 02)

`vi.resetModules()` seguido de `await import('../printFonts')` é o padrão que `queue/__tests__/print-queue-store.test.ts:186`, `onBeforeQuit.test.ts:32` e `onRevealLogs.test.ts:42` já usam, e pelo mesmo motivo. O detalhe que faz funcionar: o `vi.hoisted` vive fora da factory do `vi.mock`, então a instância nova do módulo recebe **o mesmo** spy, e a contagem de chamadas atravessa o reset. Quem acrescentar outro teste que chame `getPrintFontFacesCss` tem de repetir o reset, senão herda o cache deste.

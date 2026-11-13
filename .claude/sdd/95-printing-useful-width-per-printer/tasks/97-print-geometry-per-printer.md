# 97 — Geometria de impressão por impressora no printReceipt

**Issue:** [#97](https://github.com/sgrande-delivery/delivery-printer/issues/97)
**Feature:** [Largura útil por impressora](../spec.md) — issue #95
**Tipo:** feature
**Processo:** main
**Depende de:** 96
**Status:** shipped

## Objetivo

Fazer o `printReceipt` decidir a geometria pela impressora de destino: com largura útil, geometria explícita (`pageSize` em micrômetros, margens `custom` 0 e um `<style>` de largura injetado no HTML); sem ela, `printableArea` como hoje; com papel inválido exposto pelo driver, `pageSize` forçado. Toda impressão passa a registrar a geometria no log. É esta task que faz o comprovante sair inteiro.

## Contexto

- Cobre **RF-02, RF-03, RF-04** e **RN-03 a RN-10** da spec.
- Estado atual: `src/main/ipc-events/onRawPrint.ts:11-59`. A lista de impressoras já é lida (`:19`) e casada (`:20`); a opção é fixa em `margins: { marginType: 'printableArea' }` (`:38-40`), e o comentário `:32-37` explica por quê. O HTML é gravado com os `@font-face` injetados por `withPrintFontFaces` (`:17`, `src/main/printFonts.ts:40-55`).
- `printReceipt` é o **único** `webContents.print` do repo (spec 89, RN-01; spec desta frente, RN-09). Continua sendo.
- Electron 43 (`node_modules/electron/electron.d.ts`): `pageSize?: string | Size`, objeto `{ width, height }` em **micrômetros**, mínimo 353 µm; `Margins.marginType` aceita `'custom'` com `top/bottom/left/right` em **pixels**. `PrinterInfo.options` é tipado como `Options {}` — tudo lido por narrowing. `isDefault` não está na tipagem: `readIsDefault` (`src/main/ipc-events/onListPrinters.ts:8-10`) já faz o narrowing.
- Estrutura do HTML da API (medida em `origin/master` da `delivery-api`): filho direto do `body` é a `div` com `padding`/`font-size` inline; `* { box-sizing: border-box }` nos dois layouts; `@page { size: Nmm auto; margin: 0 }` declarado — no layout `original`, **duas vezes** (o `80mm` do CSS estático e depois o do layout). Por isso a largura do documento é o **último** `@page size`.
- Armadilha já paga (spec 89, Aprendizados): afirmação sobre comportamento de terceiro em comentário precisa de origem. "Chromium ignora `@page` fora de `default`" cita a spec 89, RN-02; "o mapa de opções no Windows talvez não traga papel" cita a RN-07 desta spec e diz que não é verificável daqui.
- Armadilha já paga: o `vi.mock('../logger')` do `onRawPrint.test.ts:17` não é peso morto (sem ele o `electron-log/main` carrega contra o stub). O mock passa a precisar de `info` além de `warn`.

## Mudanças

### 1. A decisão de geometria, pura

`src/main/printGeometry.ts` (novo):

```ts
export type GeometryReason = 'printable-area' | 'useful-width' | 'invalid-driver-paper';

export type PrintGeometry = {
  margins: Electron.Margins;            // ou o tipo importado de 'electron'
  pageSize?: { width: number; height: number }; // microns
  widthCss: string | null;               // the <style> body, or null when nothing is injected
  reason: GeometryReason;
};

// 297 mm: continuous roll ignores the height; any height ≥ the content keeps it on one page.
export const ROLL_PAGE_HEIGHT_MICRONS = 297_000;

export function resolvePrintGeometry(input: {
  usefulWidthMm: number | null;
  driverPaper: { widthMm: number; heightMm: number } | null;
  documentWidthMm: number;
}): PrintGeometry
```

Regras, nesta ordem:

1. `usefulWidthMm` → `reason: 'useful-width'`, `margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }`, `pageSize: { width: W * 1000, height: 297000 }`, `widthCss` = `@page { size: Wmm auto !important; margin: 0 !important; } body > * { max-width: Wmm !important; }` (RN-05; `!important` porque o `<style>` entra antes dos da API).
2. `driverPaper` com `widthMm < 40`, `heightMm < 50` ou `heightMm === 0` → `reason: 'invalid-driver-paper'`, as mesmas margens `custom` 0, `pageSize: { width: documentWidthMm * 1000, height: 297000 }`, `widthCss: null` (RN-07: o documento já tem a largura certa; o problema é o papel).
3. senão → `reason: 'printable-area'`, `margins: { marginType: 'printableArea' }`, sem `pageSize`, `widthCss: null` (RN-04: nada muda).

Mais duas funções puras no mesmo arquivo:

- `documentWidthMm(html: string): number` — o **último** `@page { … size: <n>mm …}` do HTML; ausente ou ilegível → 80. Regex tolerante a espaço e à ordem `margin`/`size` dentro do bloco (o CSS estático da API escreve `margin: 0; size: 80mm auto;`).
- `driverPaperMm(options: unknown): { widthMm: number; heightMm: number } | null` — procura, nas chaves `media` e `PageSize` de um objeto de strings, um tamanho em milímetros no formato `<w>x<h>mm` (cobre nomes PWG como `oe_roll-80_80x297mm` e o `Custom.80x25mm` do CUPS); qualquer outra coisa → `null`. O comentário diz que é melhor-esforço e por quê (RN-07).

O comentário de topo carrega o porquê de cada ramo, apontando para a spec 95 (RN-04, RN-05, RN-07) e para a spec 89 (RN-01, RN-02) — e substitui o comentário de `onRawPrint.ts:32-37`, que sai de lá.

### 2. A injeção do `<style>` de largura

`src/main/printFonts.ts:40-55` — o ponto de injeção depois do `<html>` (RN-10) passa a servir os dois blocos. Opções, à escolha do implementador, desde que **uma** função decida o ponto de injeção:

- generalizar `withPrintFontFaces(html, css)` para `withInjectedStyle(html, css)` (o nome atual pode ficar como alias para não tocar os testes de `printFonts.test.ts`), e chamar com `fontCss + widthCss`; ou
- uma irmã `withPrintWidth(html, css)` que reaproveita o mesmo localizador de `<html>`/`<body>`.

`css` vazio não injeta `<style>` vazio novo.

### 3. O `printReceipt` decide pela impressora de destino

`src/main/ipc-events/onRawPrint.ts:11-59`:

- depois de `getPrintersAsync` (`:19`): `const target = findPrinterByDeviceName(printers, deviceName) ?? printers.find(readIsDefault)` — o destino real, inclusive a padrão do sistema (RN-03). O `deviceName` passado ao `print` continua **`printer?.name`** (o casamento), não o `target`: o Electron já escolhe a padrão sozinho, e mandar o nome dela mudaria o comportamento observado em `onRawPrint.test.ts` ("falls back to the system default printer").
- `readIsDefault` sai de `onListPrinters.ts:8-10` para um módulo do main (ex.: `src/main/printerInfo.ts`), importado pelos dois.
- `const usefulWidthMm = printerPreferenceFor(target?.name)?.usefulWidthMm ?? null` (task 96), lido **a cada impressão**, sem cache (plan, "Decisões arquiteturais").
- `const geometry = resolvePrintGeometry({ usefulWidthMm, driverPaper: driverPaperMm(target?.options), documentWidthMm: documentWidthMm(content) })`.
- a gravação do arquivo (`:17`) passa a injetar `getPrintFontFacesCss(app)` **e** `geometry.widthCss`. Isso move a gravação para **depois** do `getPrintersAsync` — a ordem atual (`:15-19`) não tem motivo além de conveniência; registrar na task.
- `print({ …, margins: geometry.margins, ...(geometry.pageSize && { pageSize: geometry.pageSize }) })` — sem `pageSize` quando o ramo não define (RN-04: a opção fica idêntica à de hoje).
- log da RN-08, uma linha por impressão, **antes** do `print`:

  ```ts
  logger.info('print-geometry', {
    device: target?.name ?? null,        // null = the system default, no printer listed
    matched: Boolean(printer),
    driverPaper: driverPaperMm(target?.options) ,
    driverMedia: <os valores crus de media/PageSize quando existirem, para o suporte ver o que o driver expõe>,
    marginType: geometry.margins.marginType,
    pageSize: geometry.pageSize ?? null,
    usefulWidthMm,
    reason: geometry.reason,
  });
  ```

  e, no ramo `invalid-driver-paper`, também `logger.warn('print-geometry: the driver declares an invalid paper, forcing pageSize', { device, driverPaper })` (decisão pendente 3). Nada do `content`.

### 4. A regra de impressão

`.claude/rules/printing.md:20` — o passo 4 passa a dizer o valor em vigor por caso (aprendizado da spec 89: regra que só registra a mudança envelhece): `printableArea` sem largura útil; geometria explícita (`pageSize` + `custom` 0 + `<style>` com `!important`) com largura útil; `pageSize` forçado com papel inválido exposto; a largura útil vem de `printer-preferences.json` em `userData`, por dispositivo, com a padrão do sistema herdando a dela. E que a decisão é `resolvePrintGeometry`, num lugar só.

## Testes

### `src/main/__tests__/printGeometry.test.ts` (novo)

- sem largura útil e sem papel do driver → `printableArea`, sem `pageSize`, `widthCss` nulo;
- largura útil 72 → `custom` 0 nos quatro lados, `pageSize { 72000, 297000 }`, `widthCss` com `max-width: 72mm !important` e `size: 72mm`;
- largura útil vence papel inválido;
- papel 80×25, 80×0 e 30×297 → `invalid-driver-paper` com `pageSize` na largura do documento; papel 80×297 → `printable-area`;
- `documentWidthMm`: `@page { size: 58mm auto; margin: 0; }` → 58; o par do layout `original` (`@page { margin: 0; size: 80mm auto; }` e depois `@page { size: 72mm auto; margin: 0; }`) → 72; sem `@page` → 80;
- `driverPaperMm`: `{ media: 'oe_roll-80_80x25mm' }` → 80×25; `{ PageSize: 'Custom.80x297mm' }` → 80×297; `{}`, `null`, `{ media: 'A4' }`, `{ media: 42 }` → `null`.

### `src/main/__tests__/onRawPrint.test.ts` (atualizado)

O mock de `electron` (`:19-37`) passa a aceitar `isDefault` e `options` na lista; `printerPreferences` mockado no módulo (não o arquivo) para controlar a largura por dispositivo; `logger` mock com `info` e `warn`.

- o teste existente (`:51-55`) continua: sem largura útil, `margins` é exatamente `{ marginType: 'printableArea' }` **e** a opção não tem `pageSize` (`not.toHaveProperty('pageSize')`), e o HTML gravado não contém `max-width:` injetado;
- com largura útil 72 para `EPSON TM-T20`: `margins` custom 0, `pageSize { width: 72000, height: 297000 }`, e o arquivo no `loadFile` contém o `<style>` de largura **depois** do `<!DOCTYPE html><html>` (asserção por posição: `indexOf('<!DOCTYPE') === 0` e o `<style>` depois do `<html>`);
- `deviceName: null` com a padrão `{ name: 'Cozinha', isDefault: true }` tendo largura útil 48 → a geometria de 48, e `deviceName` passado ao `print` continua `undefined`;
- casamento por caixa diferente (`'epson tm-t20'`) aplica a largura gravada para `'EPSON TM-T20'`;
- impressora com `options: { media: 'oe_roll-80_80x25mm' }` e sem largura útil → `pageSize` forçado com a largura do `@page` do HTML, e `logger.warn` chamado;
- `logger.info('print-geometry', …)` chamado uma vez por impressão, com `reason`, e sem o `content` no contexto.

### Integração / sanity

- `grep -rn "webContents.print" src/` → um ponto de chamada.
- `printFonts.test.ts` continua verde sem mudança de asserção (ou com a mudança justificada no relatório, se o nome da função mudou).
- `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run lint` no baseline.
- Mutação: trocar `!important` por nada no `widthCss`, ou devolver `printableArea` no ramo de largura útil, tem de derrubar um teste.

## Critérios de aceitação

- [ ] Sem largura útil e sem papel inválido exposto, a chamada ao `print` é idêntica à da v3.1.1 (mesmas chaves, sem `pageSize`) e o HTML não ganha `<style>` de largura
- [ ] Com largura útil W para o destino, o `print` recebe `pageSize { W*1000, 297000 }` e margens `custom` 0, e o HTML recebe o `<style>` com `!important` depois do `<html>`
- [ ] A impressora padrão do sistema herda a largura útil dela quando o `deviceName` não casa
- [ ] Papel do driver com largura < 40, altura < 50 ou 0 força `pageSize` mesmo sem largura útil
- [ ] Uma linha `print-geometry` no log por impressão, sem conteúdo do comprovante
- [ ] `grep -rn "webContents.print" src/` mostra um ponto só
- [ ] `.claude/rules/printing.md` nomeia a geometria em vigor por caso
- [ ] `npm run typecheck` sem erros
- [ ] `npx vitest run --maxWorkers=4` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- Página de teste e medição (task 98) — o `purpose: 'measure'` e o campo de payload de medição **não** entram aqui
- Tela (task 99)
- `scaleFactor` (spec, "Fora do escopo")
- Mudar o comportamento de arquivo temporário deixado na falha (`.claude/rules/printing.md`, "O contrato do `rawPrint`")

## Implementação

**Arquivos (implementação):**

- `src/main/printGeometry.ts` (novo) — `resolvePrintGeometry` (três ramos: `useful-width`, `invalid-driver-paper`, `printable-area`, nesta ordem), `documentWidthMm` (último `@page size` em mm, 40–80, senão 80), `driverPaperMm` (`<w>x<h>mm` em `media`/`PageSize`) e `driverMediaOptions` (os valores crus dessas chaves, para o log). O comentário de topo carrega o porquê de cada ramo e o limite da altura de 297 mm.
- `src/main/printerInfo.ts` (novo) — `isDefaultPrinter`, o antigo `readIsDefault` de `onListPrinters.ts`, agora usado também pela impressão.
- `src/main/ipc-events/onRawPrint.ts` — destino = casamento ?? padrão do sistema (RN-03); largura útil lida a cada impressão por `printerPreferenceFor(target?.name)`; HTML gravado **depois** da listagem, com fontes + `widthCss` num bloco só; `print` com `margins` da geometria e `pageSize` só quando o ramo define; `deviceName` do `print` continua o do casamento. Linha `logger.info('print-geometry', …)` por impressão (destino, casou?, `driverMedia`, `driverPaper`, `marginType`, `pageSize`, `usefulWidthMm`, `reason`) e `logger.warn` no ramo de papel inválido.
- `src/main/printFonts.ts` — `withPrintFontFaces` → `withPrintStyle` (o ponto único de injeção), sem injetar `<style>` vazio.
- `src/main/ipc-events/onListPrinters.ts` — importa `isDefaultPrinter`.
- `.claude/rules/printing.md` — passo 4 nomeia a geometria em vigor por caso, o limite dos 297 mm e o log; `paths:` ganha `printGeometry.ts`, `printFonts.ts`, `printerInfo.ts`, `printerPreferences.ts` e `shared/printerGeometry.ts`.

**Desvio da task:** o `@page` injetado é `size: Wmm 297mm`, não `Wmm auto` — a forma com `auto` não está na gramática de `size` e seria descartada (apontado no review). A spec (RF-02) foi corrigida junto.

**Testes:**

- `src/main/__tests__/printGeometry.test.ts` (novo) — os três ramos e a precedência; papéis 80×25, 80×0, 30×297 (inválidos) e 80×297, 40×50 (válidos); `documentWidthMm` com o layout `original` (dois `@page`), `@page` sem `size`, `A4`, folha 210×297, `page-size`; `driverPaperMm`/`driverMediaOptions`.
- `src/main/__tests__/onRawPrint.test.ts` — sem largura: opção idêntica (sem `pageSize`, sem `<style>` de largura); com 72: `custom` 0, `pageSize` 72000×297000, bloco depois do doctype/`<html>` e antes do `<style>` da API; caixa de letra; padrão do sistema herdando 48 com `deviceName` `undefined` no `print`; papel 80×25 exposto → `pageSize` forçado + `warn`; linha `print-geometry` exata e sem o conteúdo do comprovante.
- `src/main/__tests__/printFonts.test.ts` — renomeado; teste novo de `css` vazio.
- Mutação: tirar o fallback para a padrão derruba 2 testes; tirar o `!important` do `max-width` derruba 2.

**Review (`code-reviewer-typescript`):** aprovado, sem bloqueio; as 7 decisões do implementador aprovadas. Sugestões aplicadas: `driverPaper` na linha de log, `usefulWidthCss` sem `export`, comentários sem histórico de versão e sem narrar, `printFonts.ts`/`printerInfo.ts` no `paths:`, `<style>` vazio não injetado. A altura de 297 mm virou a decisão pendente 5 da spec e o passo 5 da verificação de campo.

**Correção depois do teste real na Cups-PDF** (ver "Teste real" no `plan.md`): o destino sem casamento passou a ser a padrão que o sistema operacional nomeia (`src/main/defaultPrinter.ts`, com `findDefaultPrinter` em `printerInfo.ts`), porque o Electron 43 não traz `isDefault` em runtime; e o `print` passou a receber `deviceName: target?.name` em vez do nome do casamento, porque sem nome o Electron devolveu sucesso sem criar job num processo recém-aberto. O `onListPrinters` usa a mesma padrão para o "(padrão)" da tela. Testes: `defaultPrinter.test.ts` (saída do `reg query` e do `lpstat -d`, cache de 30 s, falha → `null` com um `warn`), `onRawPrint.test.ts` (impressoras sem `isDefault`, como o Electron real; impressão pelo nome da padrão; sem padrão conhecida, `deviceName` `undefined`), `onListPrinters.test.ts` (rótulo pela padrão do sistema). Mutação: voltar ao `isDefault` derruba 2 testes.

## Branch

`feat/95-printing-useful-width-per-printer`, cortada de `origin/master` (`be947da`) em 2026-11-13. Um commit por task.

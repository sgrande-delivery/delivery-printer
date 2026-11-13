# 98 — Página de teste com a largura útil e página de medição

**Issue:** [#98](https://github.com/sgrande-delivery/delivery-printer/issues/98)
**Feature:** [Largura útil por impressora](../spec.md) — issue #95
**Tipo:** feature
**Processo:** main (+ tipos em shared)
**Depende de:** 97
**Status:** executada

## Objetivo

A página de teste comum passa a ser diagramada com a largura útil da impressora de destino e a dizer qual geometria usou; e nasce a página de medição — a mesma página, impressa sobre a bobina inteira, ignorando a largura configurada, para que a cabeça corte a escala no ponto real. Sem a medição, a tela da task 99 não teria como perguntar "qual o último número que saiu?" depois que uma largura já foi gravada.

## Contexto

- Cobre **RF-05, RF-06** e **RN-11, RN-12** da spec; mantém a **RN-06 da spec 89** (escala em mm fixos, fora da moldura).
- Estado atual: `buildTestPrintPage(request, appVersion, now)` (`src/main/testPrintPage.ts:36-93`) — `body { max-width: ${width}mm }` (`:72`), `.frame { margin: 2mm; … }` (`:73`), escala com `Math.floor(width / 5)` células de 5 mm (`:60-63`), rótulo `TEST_PRINT_SCALE_LABEL` (`:89`). `onPrintTest` (`src/main/ipc-events/onPrintTest.ts:26-40`) valida o `TestPrintRequest` (`:8-21`) e enfileira `kind: 'test'` com `label: TEST_PRINT_LABEL`.
- Com largura útil W, a task 97 já faz o `printReceipt` imprimir numa página de W mm e injetar `body > * { max-width: Wmm !important }` — inclusive na página de teste, que passa por ele. Esta task faz a **página** dizer isso por conta própria (teto da moldura e linha de geometria), para que ela continue certa se o driver recusar o papel custom, e para que o suporte leia no papel qual geometria saiu.
- **A medição precisa de outro ramo na decisão de geometria** (RN-11): se reaproveitasse a largura configurada, a escala seria cortada pelo próprio app. Ramo novo em `resolvePrintGeometry` (task 97), **antes** da largura útil: `measurePaperWidthMm` → `reason: 'measure'`, margens `custom` 0, `pageSize { paper * 1000, 297000 }`, `widthCss: null`. Bobina inteira e não `printableArea`, para que funcione também no driver da fitinha em branco (papel curto).
- O payload da fila é persistido em `print-queue.ndjson`; `isPrintJob` (`src/main/queue/print-queue-store.ts:30-51`) valida as chaves conhecidas e **não** rejeita chave a mais — o campo novo tem de ser validado ali, ou um arquivo editado com lixo nele chegaria ao `print`.
- A pré-visualização da tela `/print-test` compara as linhas **de dentro** da moldura (`.frame > *`, `src/renderer/components/test-print/__tests__/TestPrint.test.tsx:58` e `:327`). A linha de geometria fica **fora** da moldura, junto da escala, que a pré-visualização não desenha (spec 89, Aprendizados) — e o `buildTestPrintPage` mantém a assinatura de três argumentos válida (quarto opcional), porque esse teste a chama.

## Mudanças

### 1. O payload de medição

`src/shared/printQueue.ts:9-14`:

```diff
 export type PrintPayload = {
   content: string;
   copies: number;
   deviceName: string | null;
   id: string;
+  // Only the measuring test page sets it: lays the page out over the whole roll and ignores the useful
+  // width saved for the printer, so the head, not the app, is what cuts the scale (spec 95, RN-11).
+  measurePaperWidthMm?: 58 | 80;
 };
```

`src/shared/printQueue.ts:64-72` — `TestPrintRequest` ganha `purpose?: 'check' | 'measure'` (ausente = `'check'`).

`src/main/queue/print-queue-store.ts:46-49` — `isPrintJob` aceita `measurePaperWidthMm` ausente, 58 ou 80, e recusa qualquer outro valor.

`src/main/ipc-events/onPrintTest.ts:8-21` — `isTestPrintRequest` aceita `purpose` ausente, `'check'` ou `'measure'`.

### 2. O ramo de medição na decisão

`src/main/printGeometry.ts` (da task 97) — `resolvePrintGeometry` recebe `measurePaperWidthMm: number | null` e o ramo `measure` vem **primeiro**. `GeometryReason` ganha `'measure'`. `src/main/ipc-events/onRawPrint.ts` passa `payload.measurePaperWidthMm ?? null`, e o log `print-geometry` já sai com `reason: 'measure'`.

### 3. A página diz a geometria e respeita a largura

`src/shared/testPrintContent.ts` — o texto da linha nova mora aqui (RN-08 da spec 89: texto da página tem fonte única), como função pura:

```ts
export type TestPrintGeometry =
  | { kind: 'auto' }                       // no useful width: the area the driver declares
  | { kind: 'default-printer' }            // deviceName null: whatever the system default has
  | { kind: 'useful-width'; widthMm: number }
  | { kind: 'measure'; paperWidthMm: 58 | 80 };

export function testPrintGeometryLine(geometry: TestPrintGeometry): string
// 'Geometria: automática (área do driver)'
// 'Geometria: a da impressora padrão do Windows'
// 'Geometria: largura útil de 72 mm, desta máquina'
// 'Geometria: medição na bobina de 80 mm'
```

Curtas de propósito: a linha sai em 9 px e tem de caber em 48 mm.

`src/main/testPrintPage.ts:36` — `buildTestPrintPage(request, appVersion, now, geometry: TestPrintGeometry = { kind: 'auto' })`:

- `useful-width`: `.frame` ganha `max-width: calc(${W}mm - 4mm)` (a margem de 2 mm dos dois lados conta: `:73`), para fechar dentro de W mesmo se o driver recusar o `pageSize` custom e a página voltar a 80. O `body` continua com o teto da bobina, e a escala continua em mm fixos (RN-06 da spec 89) — com a página em W, ela termina na marca de W; é isso que a RN-11 chama de confirmação.
- `measure`: nada de teto extra; a escala vai até a bobina e é cortada pela cabeça.
- todos: uma `<div class="geometry">` com `testPrintGeometryLine(geometry)` **fora** da moldura, entre ela e o `.scale-label`, com `font-size: 9px` e quebra de linha normal.
- o comentário de `:47-59` ganha o parágrafo da largura útil e da medição (RN-11/RN-12 desta spec), sem perder o que já diz.

### 4. O `printTest` sabe medir

`src/main/ipc-events/onPrintTest.ts:26-40`:

- `purpose === 'measure'` → geometria `{ kind: 'measure', paperWidthMm }` na página e `measurePaperWidthMm: paperWidthMm` no payload; `label: TEST_MEASURE_LABEL` (`'a página de medição'`, exportado de `testPrintPage.ts` ao lado de `TEST_PRINT_LABEL`, `:34`).
- senão, `deviceName` nulo → `{ kind: 'default-printer' }`; com `deviceName`, `printerPreferenceFor(deviceName)` (task 96) → `useful-width` ou `auto`.
- `paperWidthMm` é a largura normalizada (`normalizePaperWidth`, `testPrintPage.ts:30-32`) — exportar ou mover para não duplicar.

## Testes

### `src/main/__tests__/testPrintPage.test.ts` (atualizado)

- sem quarto argumento: saída idêntica à de hoje **exceto** a linha `Geometria: automática (área do driver)` fora da moldura (os testes existentes, `:8-105`, continuam verdes);
- `useful-width` 72: `.frame` com `max-width: calc(72mm - 4mm)`; a escala continua com 16 células de 5 mm numa bobina de 80 (não encolhe);
- `measure` 80: sem teto na moldura, 16 células, linha `Geometria: medição na bobina de 80 mm`;
- a linha de geometria está **fora** da moldura (âncora por regex da moldura, como o aprendizado da spec 89 manda, não `slice(indexOf)`).

### `src/main/queue/__tests__/test-print.test.ts` (atualizado)

- `purpose: 'measure'` → o `printReceipt` recebe `measurePaperWidthMm: 80`, label `'a página de medição'`, e o HTML com a linha de medição;
- sem `purpose`, com largura útil 72 gravada para `EPSON TM-T20` (arquivo real em `userData`, que o teste já cria) → página `useful-width` 72 e payload **sem** `measurePaperWidthMm`;
- `purpose: 'outro'` → `throw`.

### `src/main/__tests__/printGeometry.test.ts` (atualizado)

- `measurePaperWidthMm: 58` com largura útil 72 → `measure`, `pageSize { 58000, 297000 }`, `widthCss` nulo.

### `src/main/queue/__tests__/` (store)

- `isPrintJob` com `measurePaperWidthMm: 58/80/ausente` passa; `72`, `'80'` não.

### Integração / sanity

- O `TestPrint.test.tsx:327` (comparação página × pré-visualização) continua verde sem mudança.
- `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run lint` no baseline.

## Critérios de aceitação

- [ ] Com largura útil configurada, a página de teste sai com teto de moldura em W e a linha "Geometria: largura útil de W mm, desta máquina"
- [ ] `printTest({ …, purpose: 'measure' })` enfileira a página de medição, que imprime com `pageSize` da bobina e margens `custom` 0, ignorando a largura útil
- [ ] A escala continua em mm fixos e fora da moldura nos três modos
- [ ] A pré-visualização da tela `/print-test` não muda, e o teste que a compara com a página continua verde
- [ ] `isPrintJob` recusa `measurePaperWidthMm` fora de 58/80
- [ ] `npm run typecheck` sem erros
- [ ] `npx vitest run --maxWorkers=4` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- A tela que chama a medição e grava a resposta (task 99)
- Trocar a escala de 5 mm por 1 mm, ou a régua de 40 colunas (spec 89, decisão 2)
- Mudar `TEST_PRINT_NOTE` (é compartilhada com a pré-visualização)

## Implementação

**Arquivos (implementação):**

- `src/shared/printQueue.ts` — `PrintPayload.measurePaperWidthMm?: 58 | 80`; `TestPrintRequest.purpose?: 'check' | 'measure'`.
- `src/main/queue/print-queue-store.ts` — `isPrintJob` aceita `measurePaperWidthMm` ausente, 58 ou 80, e descarta a linha com qualquer outro valor.
- `src/main/printGeometry.ts` — ramo `measure` (primeiro de todos): bobina inteira como `pageSize`, margens `custom` 0, nada injetado. `resolvePrintGeometry` recebe `measurePaperWidthMm: number | null` obrigatório, como os vizinhos.
- `src/main/ipc-events/onRawPrint.ts` — repassa `measurePaperWidthMm ?? null`.
- `src/shared/testPrintContent.ts` — `TestPrintGeometry` (`auto` | `default-printer` | `useful-width` | `measure`) e `testPrintGeometryLine`.
- `src/main/testPrintPage.ts` — quarto argumento opcional (`{ kind: 'auto' }`); em `useful-width`, regra própria `.frame { box-sizing: border-box; max-width: calc(Wmm - 4mm) !important; }`; `<div class="geometry">` fora da moldura, antes do rótulo da escala; `normalizePaperWidth` e `TEST_MEASURE_LABEL` exportados.
- `src/main/ipc-events/onPrintTest.ts` — valida `purpose`; geometria da página por `testPageGeometry` (medição; `deviceName` nulo → "padrão do Windows"; senão a largura salva do dispositivo ou automática); payload de medição com `measurePaperWidthMm` e label `'a página de medição'`.
- `.claude/rules/printing.md` — o caso `measure` entra na lista "em vigor, por caso".

**O bloqueio do review, e por que importa:** o teto da moldura entrou primeiro **sem** `!important`. O `printReceipt` injeta `body > * { max-width: Wmm !important }` na mesma impressão, e a moldura é filha do `body`: regra `!important` vence regra normal seja qual for a especificidade, então o teto nunca valia — e, no cenário para o qual ele existe (driver recusa o papel custom, página volta a 80 mm), a moldura saía com W + 2 mm e cortada, acusando a impressora certa (RN-05 da spec 89). Medido pelo revisor em Chromium headless: `frameRight` 74,00 mm sem, 69,99 mm com o `!important`. Com os dois `!important`, decide a especificidade: `.frame` (0,1,0) vence `body > *` (0,0,1).

**Testes:**

- `src/main/__tests__/testPrintPage.test.ts` — sem geometria: linha "automática" e nenhum teto; `useful-width`: teto border-box **com `!important`**; escala de 16 marcas até 80 e fora da moldura nos três modos; medição em 58 até 55; padrão do Windows; linha de geometria fora da moldura e antes da escala (âncora por regex, como manda o aprendizado da spec 89).
- `src/main/queue/__tests__/test-print.test.ts` — medição por cima de 72 salvo (payload `measurePaperWidthMm: 80`, label de medição, sem teto); página comum sem `purpose` **e** com `'check'` na largura salva; automática e padrão do Windows; 58 mm; `purpose` desconhecido recusado.
- `src/main/__tests__/printGeometry.test.ts` — medição vence largura salva e papel inválido.
- `src/main/__tests__/onRawPrint.test.ts` — medição com 72 salvo: `pageSize` 80 mm, nada injetado, log `reason: 'measure'`.
- `src/main/queue/__tests__/print-queue-store.test.ts` — rolo 58/80 preservado; 72 e `'80'` descartados.
- Mutações: medição depois da largura salva derruba 2; validação do campo na fila → `true` derruba 1; teto sem `!important` derruba 2.
- `TestPrint.test.tsx:327` (página × pré-visualização) verde sem mudança.

**Review (`code-reviewer-typescript`):** reprovou pelo `!important` da moldura (corrigido, com teste). Decisões: campo de medição opcional → trocado por `number | null` obrigatório, como sugerido; regra separada para o teto, `default-printer` para `deviceName` nulo, export de `normalizePaperWidth` e linha de geometria com quebra normal, aprovados. Ponto de atenção registrado no plan: na `/print-test`, um cadastro sem impressora encontrada manda `deviceName: null`, e se a padrão tiver largura salva a página sai sem teto próprio na moldura (o `printReceipt` ainda aplica a largura dela).

## Branch

`feat/95-printing-useful-width-per-printer`, cortada de `origin/master` (`be947da`) em 2026-11-13. Um commit por task.

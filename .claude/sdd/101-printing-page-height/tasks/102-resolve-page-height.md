# 102 — A altura da página sai da preferência e do driver

**Issue:** [#102](https://github.com/sgrande-delivery/delivery-printer/issues/102)
**Feature:** [A altura da página forçada](../spec.md) — issue #101
**Depende de:** —
**Bloqueia:** 103
**Status:** executada

## Objetivo

Tirar o 297 mm de constante e pôr no lugar os três degraus — é o que faz o comprovante longo sair inteiro.

## Mudanças

`src/shared/printerGeometry.ts`: `PrinterPreference` ganha `pageHeightMm?: number`; `PAGE_HEIGHT_MIN_MM` (297), `PAGE_HEIGHT_MAX_MM` (3000), `DEFAULT_PAGE_HEIGHT_MM` (297) e `isPageHeightMm`.

`src/main/printGeometry.ts`: `resolvePrintGeometry` recebe `pageHeightMm: number | null`, resolve a altura nos três degraus e devolve também `pageHeightMm` e `pageHeightSource`. `rollPage(widthMm, heightMm)` e `usefulWidthCss(widthMm, heightMm)` passam a receber a altura — o `@page` injetado tem de dizer a mesma (RF-04). `ROLL_PAGE_HEIGHT_MICRONS` sai; quem continua existindo é o default em milímetros.

`src/main/printerPreferences.ts`: `validDevices` carrega `pageHeightMm` quando válido e **só descarta o campo** quando não (RN-03); `writePrinterPageHeight(deviceName, pageHeightMm | null)` ao lado do `writePrinterUsefulWidth`, sobre o mesmo read-modify-write (extraído para um privado, para a regra de fundir grafias do mesmo dispositivo não existir em duas cópias).

`src/main/ipc-events/onRawPrint.ts`: passa `printerPreferenceFor(target?.name)?.pageHeightMm ?? null` e acrescenta `pageHeightMm` e `pageHeightSource` à linha `print-geometry`.

## Testes

`src/main/__tests__/printGeometry.test.ts`:

- altura salva vence o driver, e o `@page` injetado declara a mesma altura do `pageSize`
- sem altura salva, driver "80 x 3276" dá 3276 mm (`source: 'driver'`)
- sem altura salva, driver "80 x 297" dá 297 mm (`source: 'default'`) — nada muda para o parque
- papel inválido do driver não vira altura (altura 0 ou 25 mm cai no default)
- página de medição ignora a altura salva (RN-02)

`src/main/__tests__/printerPreferences.test.ts`: altura válida sobrevive ao round-trip; altura fora da faixa derruba o campo e **mantém** a largura; `writePrinterPageHeight` recusa fora da faixa sem escrever.

## Critérios de aceitação

- [x] Os três degraus, com a origem no log
- [x] `@page` e `pageSize` sempre com a mesma altura
- [x] Medição em 297 mm com altura salva de 3000
- [x] `npm run typecheck`, `npm test`, `npm run lint` sem erro novo

## Branch

`feat/101-printing-page-height`, cortada de `origin/master` em 2026-11-16.

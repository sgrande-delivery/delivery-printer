# 103 — O campo da altura na tela Impressoras

**Issue:** [#103](https://github.com/sgrande-delivery/delivery-printer/issues/103)
**Feature:** [A altura da página forçada](../spec.md) — issue #101
**Depende de:** 102
**Status:** executada

## Objetivo

Dar ao operador o número que o Windows não expõe — é o caminho das lojas em que o degrau do driver não dispara.

## Mudanças

`src/shared/ipcChannels.ts`: `setPrinterPageHeight: 'printer:set-page-height'`. O par no `src/main/preload.ts` e o `ipcMain.handle` no `src/main/main.ts` — o gate de texto (`src/shared/__tests__/ipcChannels.test.ts`) reprova a constante usada em um lado só. O stub entra em `src/__tests__/setup.ts`, senão o componente quebra sob jsdom.

`src/main/ipc-events/onSetPrinterPageHeight.ts` (novo): valida a requisição e a faixa antes de escrever, loga a falha e relança — o mesmo desenho do `onSetPrinterUsefulWidth`.

`src/renderer/hooks/usePrinterPreferences.ts`: `setPageHeight`, adotando o mapa que o main devolve (nunca um merge local).

`src/renderer/components/printers/PageHeightField.tsx` (novo) e `UsefulWidthSection.tsx`: o campo aparece **só com a largura ajustada** (RN-01), com `Switch` para sair do automático e `Stepper` de passo 100 mm, e o texto dizendo o efeito — "o comprovante é cortado a cada N cm quando o driver corta por página". Sem altura salva, o rótulo diz que a altura vem do papel do driver.

## Testes

`src/renderer/components/printers/__tests__/PageHeightField.test.tsx`: o campo não aparece sem largura ajustada; ligar o interruptor salva o default; o stepper salva o passo; falha do canal mostra a mensagem do `useMessaging`.

## Critérios de aceitação

- [x] O canal existe nos quatro lugares e o gate passa
- [x] O campo só aparece com a largura ajustada
- [x] Altura fora da faixa não sai da tela
- [x] `npm run typecheck`, `npm test`, `npm run lint` sem erro novo

## Branch

`feat/101-printing-page-height`, cortada de `origin/master` em 2026-11-16.

# 13 — Mostrar falha de impressão ao operador

**Issue:** [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** renderer
**Depende de:** 12
**Status:** pendente

## Objetivo

Fazer falha de impressão aparecer na tela e na notificação do Windows. O operador precisa saber que o comprovante não saiu enquanto o cliente ainda está no balcão — hoje ele descobre quando o cliente reclama.

## Contexto

- `src/renderer/hooks/usePrintingOrder.ts:34` e `src/renderer/hooks/usePrintingBoard.ts:32` só fazem `console.error(err)`
- `useMessaging().handleOpen(message)` (`src/renderer/providers/messaging.tsx`) é o snackbar já montado na árvore pelo `App.tsx`, e **nenhum hook de impressão o usa**
- O canal `notification` existe (`src/main/preload.ts:19`) e o handler monta uma `Notification` com título fixo `'Pedido recebido'` e corpo `Pedido ${orderSequence} enviado para impressão` (`src/main/ipc-events/onNotification.ts`) — **ninguém o chama**. Para servir a falha, ele precisa receber título e corpo de quem chama
- `src/main/ipc-events/onRawPrint.ts:46` rejeita com o `reason` do Electron; é esse texto que precisa virar mensagem útil em pt-BR
- Cobre a **RF-03** e a **RN-03**: aviso é sobre o que o operador resolve (impressora desligada, sem papel, nome errado), e não sobre o que só o suporte resolve
- A spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3), já introduz aviso no caso específico de "imprimiu e não marcou". Esta task cobre o caso geral e precisa não duplicar aviso com ela

## Mudanças

### 1. Aviso na tela

`usePrintingOrder.ts` e `usePrintingBoard.ts` (alterados): o `catch` passa a logar (task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12)) **e** avisar por `useMessaging()`, com texto que diga o que falhou e onde — pedido ou mesa, e a impressora quando o payload a tiver (`device_name`).

### 2. Notificação nativa útil

`src/main/ipc-events/onNotification.ts` (alterado): recebe `{ title, body }` em vez de só a sequência do pedido, preservando o uso previsto de "pedido recebido". `src/main/preload.ts` (alterado): a assinatura do canal acompanha. `src/__tests__/setup.ts` (alterado): o stub acompanha.

Notificação é para o caso em que a janela está escondida na bandeja — que é o normal deste app. Snackbar sozinho não é visto.

### 3. Tradução do motivo

Um mapa pequeno, no renderer, do motivo técnico para a frase em pt-BR, com fallback que mostra o motivo cru em vez de engolir o que não está mapeado.

## Testes

### `src/renderer/hooks/__tests__/usePrintingOrder.test.ts` (atualizado)

- `rawPrint` rejeitando: `handleOpen` é chamado com texto que contém o identificador do pedido, e `window.electron.notification` é chamado
- Impressão bem-sucedida: **nenhum** aviso (ruído é defeito, RN-03)

### `src/renderer/hooks/__tests__/usePrintingBoard.test.ts` (novo)

- Mesma dupla de cenários para comprovante de mesa

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: com a impressora desligada (ou `deviceName` inexistente), ver snackbar e notificação; com a janela na bandeja, ver só a notificação

## Critérios de aceitação

- [ ] Falha de impressão mostra snackbar e notificação do Windows, identificando pedido/mesa
- [ ] Impressão bem-sucedida não gera aviso nenhum
- [ ] Motivo não mapeado aparece cru, não engolido
- [ ] A mesma falha também está no arquivo de log
- [ ] Não há aviso duplicado com a task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3), quando as duas estiverem na base
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Reenviar a impressão (retry) — spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)
- Detectar falta de papel: o Electron não expõe isso (ver task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25))
- Notificar o painel — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25)

## Branch

`feat/11-observability-logs-and-errors`, cortada de `feat/1-reliability-silent-failures` em 2026-10-15, com um commit por task.

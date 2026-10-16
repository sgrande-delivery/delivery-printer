# 13 — Mostrar falha de impressão ao operador

**Issue:** [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** renderer
**Depende de:** 12
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/renderer/helpers/printFailure.ts`, `src/renderer/hooks/__tests__/usePrintingBoard.test.ts`, `src/renderer/components/error/__tests__/ErrorBoundary.test.tsx` (o teste do log, escrito pelo review).
Alterados: `usePrintingOrder.ts`, `usePrintingBoard.ts`, `src/main/ipc-events/onNotification.ts`, `src/main/preload.ts`, `src/renderer/components/error/ErrorBoundary.tsx`, `usePrintingOrder.test.ts`.

### O erro que o review mediu, e que é o achado da task

A primeira versão traduzia os motivos `failed` e `cancelled`. **Eles não existem.** O Electron 43 produz `"Invalid printer settings"`, `"Print job canceled"` e `"Print job failed"` — medidos nos typings (`electron.d.ts:18486`) **e** como literais no binário distribuído.

Consequência se tivesse passado: toda falha real apareceria ao operador **em inglês cru**, na tela, exatamente no caso para o qual a task existe. **E o teste passava**, porque mockava um motivo que o Electron nunca emite.

Isso é o padrão a desconfiar em toda esta base: teste que inventa a entrada prova que o código concorda com a nossa imaginação, não com a realidade. Verificado por mim: com as chaves antigas de volta, o teste do pedido cai.

### O que avisa, e o que fica só no log

| Caminho | Tela + notificação | Log |
| --- | --- | --- |
| `rawPrint` falha | sim | sim |
| busca do HTML falha | sim | sim |
| `PATCH /printed` falha (task #3 da spec #1) | sim (texto próprio) | sim |
| varredura `/orders/print/list` falha | **não** | sim |
| falha de renovação de token | **não** | sim |

A regra é **frequência**: aviso é por evento de impressão (um `printOrder` = no máximo um aviso); a varredura re-dispara a cada reconexão e avisaria a cada oscilação de rede.

A notificação nativa importa porque o app vive na **bandeja**: snackbar sozinho não é visto.

### Decisões, e o veredito do review

- **Avisar falha antes da impressora** (escopo além do enunciado): aprovado — o comprovante também não sai, e **na mesa não há varredura** que tente de novo
- **Dois avisos mutuamente exclusivos** com a task #3: confirmado lendo o fluxo (o `catch` novo faz `return` antes do PATCH), e preso pelos dois lados nos testes
- **`ErrorBoundary` no escopo**: entrada aprovada, mas o "sem teste" **não** — o review escreveu o teste que afirma o caminho até a ponte, e ele cai se o `console.error` voltar
- **`.catch(() => undefined)` na notificação**: corrigido para logar. Engolir calado é o padrão que esta spec existe para matar, e a assinatura do canal **acabou de mudar** — se ela perder o handler, ninguém descobre

### Testes

66 em 14 arquivos (baseline da spec: 59/13). Mutações: remover o aviso do pedido derruba 3; do board, 2; remover só a notificação do board, 1; **voltar as chaves antigas do mapa derruba 1** (verificado por mim); voltar o `console.error` do boundary derruba 1.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · par do canal `notification` conferido nos três lugares depois da mudança de assinatura.

### O que não foi verificado

O critério manual: impressora desligada → snackbar + notificação; janela na bandeja → só a notificação. Exige Windows com impressora. Os valores de `failureReason` vieram dos typings **e** do binário, não de uma impressão real.

## Branch

`feat/11-observability-logs-and-errors`, cortada de `feat/1-reliability-silent-failures` em 2026-10-15, com um commit por task.

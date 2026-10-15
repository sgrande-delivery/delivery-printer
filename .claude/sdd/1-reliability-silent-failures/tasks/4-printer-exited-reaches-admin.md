# 04 — Fazer o `printer_exited` chegar ao admin

**Issue:** [#4](https://github.com/sgrande-delivery/delivery-printer/issues/4)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Emitir o `printer_exited` por um socket que o servidor realmente escuta, para o painel marcar a impressora como offline no instante em que o app fecha — e não 60 segundos depois, por timeout.

## Contexto

- `src/main/main.ts:13` — `const socket = io(constants.WS_BASE_URL);` conecta na **raiz**. No `delivery-socket-api`, `src/core/shared/constants/namespaces.ts` lista nove namespaces e **todos** os gateways declaram um: **não existe gateway na raiz**
- Consequência: `subscribe_channel` (`src/main/ipc-events/onSocketRegister.ts`) e `printer_exited` (`src/main/app-events/onBeforeQuit.ts`) nunca são processados. O `printer_ping` funciona porque quem o emite é o **renderer**, no `/admin` (`src/renderer/hooks/useAdminSocketEvents.ts:32`)
- Do outro lado: `RestaurantGateway.printerExited` existe e valida `restaurantUuid` contra `client.data.restaurantUuid`, e `usePrinterConnectionStatus.ts` no `delivery-admin` escuta `printer_exited`. Os dois lados estão prontos; falta emitir de onde o servidor escuta
- Cobre a **RF-03** e a **RN-03** da spec
- Este é o **primeiro canal IPC do main para o renderer** deste app: hoje todos vão do renderer para o main (`src/main/preload.ts:10`), e a skill `add-screen` já registra isso como decisão de arquitetura

## Mudanças

### 1. Canal do main para o renderer

`src/main/preload.ts` (alterado): expor `onBeforeQuit(listener)` usando `ipcRenderer.on('app:before-quit', ...)`, devolvendo a função de remoção — o padrão que o renderer precisa para limpar no `useEffect`. O tipo chega ao renderer sozinho, porque `preload.d.ts` deriva de `typeof electronHandler`.

### 2. Emissão no renderer

`src/renderer/hooks/useAdminSocketEvents.ts` (alterado): registrar o listener do canal novo e, ao receber, emitir `printer_exited` com o `uuid` **cru** — é o que o gateway compara (`printerExited(@MessageBody() restaurantUuid: unknown)`). Mandar objeto faz o servidor responder `IGNORED` sem erro visível.

### 3. Esperar a emissão antes de fechar

`src/main/app-events/onBeforeQuit.ts` (alterado): deixa de emitir por socket e passa a avisar o renderer, com `event.preventDefault()` e um `app.quit()` depois do ack **ou** de um timeout curto (300 ms bastam para um emit em socket já conectado). Sem o timeout, janela fechada ou socket caído travaria o fechamento do app — que é pior que não avisar.

### 4. Remover o socket morto

- `src/main/main.ts`: sai o `io(constants.WS_BASE_URL)`, o `ipcMain.handle('socket-register', ...)` e o import de `constants`
- `src/main/ipc-events/onSocketRegister.ts`: apagado (era o único uso de `socketRestaurantUuid`)
- `src/main/preload.ts`: sai o `socketRegister`
- `src/renderer/hooks/useAdminSocketEvents.ts:46`: sai a chamada `window.electron.socketRegister(restaurant.uuid)` — a identidade do socket vem do handshake (`auth: { 'x-restaurant-uuid': id }` em `src/renderer/services/socket-store.ts:76`), não dela
- `src/__tests__/setup.ts`: sai o stub de `socketRegister`, entra o de `onBeforeQuit`

### 5. O `return` que falta no single-instance

`src/main/main.ts:22` (alterado): hoje o `app.quit()` do single-instance lock não interrompe o módulo, que segue até o `whenReady` e cria janela e tray de uma instância que vai morrer. Envolver o restante do boot no caminho de sucesso do lock.

## Testes

### `src/renderer/hooks/__tests__/useAdminSocketEvents.test.ts` (novo)

- Ao disparar o callback do `onBeforeQuit`, emite `printer_exited` com o `uuid` **cru** (não objeto)
- Desmontar remove o listener do canal (sem vazamento)
- Sem `restaurant`, não emite

### `src/main/__tests__/onBeforeQuit.test.ts` (novo)

- Avisa o renderer e só então chama `quit`
- Sem ack, chama `quit` depois do timeout (`vi.useFakeTimers()`)
- Com a janela destruída, não lança

### Integração / sanity

- `grep -rn "socketRegister\|socket-register" src/` não traz nada
- `npm run typecheck`, `npm run lint`, `npm test`

## Critérios de aceitação

- [ ] Fechar pela bandeja marca a impressora como offline no painel imediatamente
- [ ] O log do `delivery-socket-api` registra `printer_exited ... OK` (e não `IGNORED`)
- [ ] O app fecha em menos de 1 s mesmo com o socket desconectado
- [ ] Nenhuma referência a `socket-register` sobra no código nem no stub de teste
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- `printer:status` por impressora — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25), que depende do relay novo ([socket-api #50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50))
- Mudar o `printer_ping`, que funciona
- Reconexão e fallback de transporte do socket

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

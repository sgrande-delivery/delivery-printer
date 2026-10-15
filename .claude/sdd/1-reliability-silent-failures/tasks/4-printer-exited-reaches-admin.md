# 04 — Fazer o `printer_exited` chegar ao admin

**Issue:** [#4](https://github.com/sgrande-delivery/delivery-printer/issues/4)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

main + preload + renderer

### Arquivos criados/alterados

- `src/main/app-events/onBeforeQuit.ts` — reescrito: avisa o renderer, espera ack ou 300 ms, e só então `app.quit()`
- `src/main/main.ts` — sai o socket da raiz, o `ipcMain.handle('socket-register')` e os imports de `constants`/`socket.io-client`; o boot foi para `boot()`, chamada no `else` do single-instance lock
- `src/main/preload.ts` — sai o `socketRegister`; entram `onBeforeQuit(listener)` (devolve a função de remoção) e `beforeQuitDone()`
- `src/main/ipc-events/onSocketRegister.ts` — **apagado**
- `src/renderer/hooks/useAdminSocketEvents.ts` — sai a chamada `socketRegister`; entra o efeito que emite `printer_exited` no aviso de saída
- `src/__tests__/setup.ts` — sai o stub de `socketRegister`, entram os dois canais novos
- `src/main/__tests__/onBeforeQuit.test.ts` e `src/renderer/hooks/__tests__/useAdminSocketEvents.test.ts` (novos)

### Canais IPC criados/alterados

| Canal | Direção | Preload | Main | Stub |
| --- | --- | --- | --- | --- |
| `app:before-quit` | **main → renderer** (o primeiro deste app) | `preload.ts:21,24` | `onBeforeQuit.ts:3` | `setup.ts` |
| `app:before-quit-done` | renderer → main (ack) | `preload.ts:28` | `onBeforeQuit.ts:4` | `setup.ts` |
| `socket-register` | — | **removido** | **removido** | **removido** |

Par conferido por grep nos dois sentidos; `grep -rn "socketRegister\|socket-register\|onSocketRegister" src/` não traz nada.

### Eventos de socket

`printer_exited` passa a sair do socket `/admin` do renderer, com o `uuid` **cru** — é o que o `RestaurantGateway.printerExited` compara contra `client.data.restaurantUuid`, que vem do handshake. Emitir objeto faria o servidor responder `IGNORED` sem erro visível.

E a emissão agora usa **ack de socket.io**: o gateway retorna `{ event, message }`, e o Nest entrega isso ao callback de quem emite (confirmado em `@nestjs/platform-socket.io/adapters/io-adapter.js:36,43`, que faz `ack(response)` com o retorno do handler). Logo o quit espera a confirmação de verdade, e um `IGNORED` passa a ser observável **no app** — não só no log do servidor, que era exatamente o silêncio da RN-03.

### Variáveis de ambiente novas

Nenhuma.

### Decisões, e o veredito do review

- **Segundo canal para o ack** (`send` + `ipcMain.once`): certo — direção sem retorno, e o `once` é registrado **antes** do `send`, então não há corrida com renderer rápido
- **`finished` + `clearTimeout` + `removeListener`**: certo e necessário — no caminho do timeout o wrapper do `once` continua registrado, e sem o remove cada tentativa de quit deixaria um listener
- **Flag `quitting`**: necessária, senão o `app.quit()` do próprio handler reentra e dá `preventDefault` para sempre
- **`before-quit` registrado dentro do `whenReady`**: certo — depende da janela, e a instância duplicada não paga os 300 ms
- **Boot em `boot()` no `else` do lock**: o review confirmou que deixar os dois `ipcMain.handle` no escopo de módulo é inofensivo (registram no `ipcMain` do próprio processo, que nunca terá renderer) e desejável (precisam existir o quanto antes); só moveu a verificação do lock para depois da declaração, para não depender de hoisting
- **Nome de canal literal no preload e constante no main**: aceito — o electron-vite bundla import relativo, então importar o módulo do main emitiria código de main dentro do bundle do preload. O precedente do `START_MINIMIZED_ARG` não transfere porque ali os dois arquivos são o mesmo bundle. A dívida (`src/main/ipc-channels.ts` sem imports + reescrita da receita de grep em `printing.md`) está registrada nos Aprendizados

### Correções feitas pelo review

- `src/main/main.ts` — verificação do lock movida para depois da declaração de `boot()`; ordem de execução idêntica
- `src/main/__tests__/onBeforeQuit.test.ts` — cinco `as never` trocados por casts tipados. Não é estética: `src/main/__tests__` está no `include` do `tsconfig.node.json`, e com `as never` **inverter a ordem dos parâmetros compilava**. Com os casts tipados, a inversão dá `TS2345`

### Testes

- `src/main/__tests__/onBeforeQuit.test.ts` — avisa e só então fecha; sem ack fecha no timeout; janela destruída não lança; segundo `before-quit` passa direto
- `src/renderer/hooks/__tests__/useAdminSocketEvents.test.ts` — emite com `uuid` cru e terceiro argumento função; `beforeQuitDone` **só** depois do ack; `IGNORED` reporta e ainda fecha; `OK` não reporta; sem `restaurant` não emite; desmontar remove o listener

Mutações conferidas: neutralizar o timeout derruba 2; neutralizar o ack derruba 1; chamar `beforeQuitDone` fora do callback derruba 1; **remover o `vi.resetModules()` do teste derruba 2** — o reset é load-bearing, porque `quitting` é flag de módulo. Independência de ordem verificada com `--sequence.shuffle` três vezes.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso — o `Login.tsx:23` da base
- `npm test`: **22 testes em 6 arquivos** (baseline da spec: 3 em 2)
- Contrato do outro lado conferido **lendo** o `delivery-socket-api` (`restaurant.gateway.ts:123-141`, namespace `admin`) e o adapter do Nest
- **Invariante do autoupdate preservada, verificada no código da dependência:** o `autoInstallOnAppQuit` engancha em `app.onQuit` (`BaseUpdater.js:69-89`), ou seja no evento `quit`. O `preventDefault` novo atrasa ~300 ms e não cancela
- Empacotamento: não rodado — nada em `package.json`, dependências, versão do Electron, `build.*` ou configs de build

### Como testar

1. `npm run build && npx electron-builder --win --publish never`, instalar
2. **Com a janela escondida na bandeja** (é o caso real), clicar "Fechar" no menu da bandeja
3. Conferir no painel que a impressora marca offline **na hora**, e no log do `delivery-socket-api` que saiu `printer_exited ... OK` — e não `IGNORED`
4. Repetir com a rede caída: o app tem de fechar em menos de 1 s

### O que não foi verificado

Tudo que exige app empacotado e servidor real: o painel marcando offline, o `OK` no log, e o fechamento com socket caído (coberto só por teste unitário com timers falsos). **E um ponto que o review levantou e vale medir no passo 2 acima:** o `backgroundThrottling` está no default, então as filas do renderer **oculto** podem ser estranguladas pelo Chromium; se os 300 ms ficarem curtos nesse estado, o sintoma é o mesmo silêncio que a task corrige.

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

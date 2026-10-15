---
paths:
  - "src/renderer/hooks/**"
  - "src/renderer/services/socket-store.ts"
  - "src/main/ipc-events/**"
  - "src/main/app-events/**"
  - "src/main/preload.ts"
---

# O caminho da impressão

## O que acontece quando um pedido chega

1. O painel (ou a `delivery-api`) emite no socket. O renderer ouve: `printOrder` e `printShipment` no `/order` (`src/renderer/hooks/usePrintingOrder.ts:40`), `print_board` e `print_board_billing` no `/board` (`usePrintingBoard.ts:38`).
2. O hook pede o **HTML já renderizado** à `delivery-api`: `api.get<Response[]>(\`orders/${uuid}/${layout}\`)`. A resposta é uma **lista**, um item por impressora — cada um com `content`, `copies` e `device_name`.
3. Para cada item, o renderer chama `window.electron.rawPrint({ content, copies, deviceName, id })` com um `id` novo (`uuidv4()`), que é o nome do arquivo temporário.
4. O main grava `os.tmpdir()/<id>.print.html`, abre uma `BrowserWindow` escondida, casa `deviceName` com o nome real da impressora (case-insensitive) e chama `webContents.print({ silent: true, ... })` (`src/main/ipc-events/onRawPrint.ts`).
5. Só no caminho do pedido, depois de **todas** as impressões resolverem, o renderer marca: `api.patch(\`/orders/${uuid}/printed\`)`.

**Nada disso renderiza layout aqui.** O layout é da `delivery-api`. Se a impressão sai errada, o defeito está quase sempre no HTML que veio, e a verificação é olhar o `content` da resposta — não mexer em componente.

## O contrato do `rawPrint`

```ts
type RawPrint = { content: string; copies: number; deviceName: string | null; id: string };
```

- **`deviceName` pode ser `null`** e o `find` não acha nada: `printer?.name` fica `undefined` e o Electron imprime na **impressora padrão do sistema**. É o comportamento desejado para o restaurante com uma impressora só; não "corrija" para lançar erro sem a task pedir
- **O arquivo temporário só é removido no caminho de sucesso** (`fs.rmSync(file)` dentro do `if (success)`). Falha deixa o `.html` em `%TEMP%` — o `.gitignore` já cobre `*.print.html` no repo, mas na máquina do cliente o arquivo fica. Mudar isso é mudança de comportamento observável: diga na task
- A promessa **rejeita** com o `reason` do Electron quando a impressão falha, e quem chama hoje só faz `console.error`. O usuário não vê nada. Se a task é sobre dar retorno ao operador, o canal existente é o `useMessaging()`

## Os eventos, por namespace

| Namespace | Ouve | Emite |
| --- | --- | --- |
| `/admin` | `handleRestaurantState`, `admin_ping` | `printer_ping` (no connect e a cada 30 s) |
| `/order` | `printOrder`, `printShipment` | — |
| `/board` | `print_board`, `print_board_billing` | — |
| raiz (main) | — | `subscribe_channel` (quando o renderer chama `socketRegister`, já autenticado), `printer_exited` (no `before-quit`) |

O `printer_ping` leva `{ restaurant_id, restaurant_uuid, version }`, com a versão lida do `package.json` importado (`useAdminSocketEvents.ts:3`). É ele que acende "impressora online" no painel — **por isso build de produção não se testa contra a API real**.

Evento novo **do painel para cá** entra como `socket?.on(...)` no hook do namespace certo, com o `off` correspondente no cleanup. Evento novo **daqui para o painel** combina-se com o `delivery-socket-api` e com o `delivery-admin` antes: emitir num nome que ninguém escuta é silêncio, não erro.

## Vazamento de listener: a armadilha real desta base

`socket?.off('nome')` **sem o handler** remove todos os listeners daquele evento — é o que os hooks fazem, e funciona porque cada evento tem um listener só. Mas o cleanup tem de existir: o `usePrintingBoard` ficou **sem** `off('print_board')` por um tempo e cada remontagem empilhava um listener, o que imprime o mesmo comprovante duas, três, quatro vezes.

Regra: **todo `socket?.on` dentro de `useEffect` tem o `off` do mesmo evento no retorno**, e o efeito depende de `socket`. Review reprova sem isso, e é verificável por teste (montar, desmontar, remontar, emitir uma vez, contar as chamadas).

O segundo lado da mesma moeda: os `SocketStore` são **singletons de módulo** (`const store = new SocketStore('order')` no topo do hook). A instância sobrevive à remontagem do componente, e o `connect()` tem guarda (`if (this.socket) return`), então chamar duas vezes não abre dois sockets. Mas o `useEffect` de cleanup de `useOrderSocket` chama `store.disconnect()` — **se dois componentes usarem o mesmo namespace, o desmonte de um derruba o socket do outro**. Hoje só um componente usa cada hook. Se a task introduzir o segundo, isso deixa de ser teoria: resolva com contagem de referência no store, e escreva no `plan.md`.

## Reentrância

- **O mesmo pedido pode chegar duas vezes**: pelo `printOrder` e pela varredura `GET /orders/print/list` que roda a cada reconexão (`usePrintingOrder.ts:57`). O que evita a duplicata é o `patch('/orders/:uuid/printed')` ter sido processado pela API, não controle local. Task que mexe nesse par precisa dizer o que acontece na janela entre imprimir e marcar
- **Reconexão de socket re-dispara a varredura**: `isConnected` muda e o efeito roda de novo. Oscilação de rede imprime de novo o que ainda não foi marcado
- **O estado é volátil.** Não há banco nem arquivo de fila: fechar o app perde o que estava em voo. Se a task promete fila durável, ela cria o arquivo em `app.getPath('userData')` — não um `Map` em memória com nome de fila

## IPC: o par preload + main

Canal novo é **sempre duas linhas em dois arquivos**, com o mesmo nome literal:

```ts
// src/main/preload.ts — dentro de electronHandler
printTest: (printerId: number): Promise<void> => ipcRenderer.invoke('print-test', printerId),

// src/main/main.ts
ipcMain.handle('print-test', onPrintTest);
```

O tipo chega ao renderer sozinho: `preload.d.ts` declara `window.electron` como `typeof electronHandler`. **Não** existe segunda declaração para manter em sincronia — e não crie uma.

Nome divergente entre os dois lados **não dá erro**: `ipcRenderer.invoke` numa rota sem handler devolve uma promessa que rejeita, e todo chamador de hoje engole com `console.error`. Foi assim que `receive-order` (preload) × `notification` (main) passou batido. Ao criar ou renomear canal, confira o par com `grep -rn "<nome-do-canal>" src/` e exija ver **duas** ocorrências.

O stub do preload nos testes está em `src/__tests__/setup.ts`: **canal novo entra lá também**, senão o componente que o chama quebra sob jsdom com `undefined is not a function`.

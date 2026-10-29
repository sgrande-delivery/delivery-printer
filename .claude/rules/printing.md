---
paths:
  - "src/renderer/hooks/**"
  - "src/renderer/services/socket-store.ts"
  - "src/main/ipc-events/**"
  - "src/main/app-events/**"
  - "src/main/preload.ts"
  - "src/main/queue/**"
  - "src/shared/ipcChannels.ts"
  - "src/shared/queueLimits.ts"
---

# O caminho da impressão

## O que acontece quando um pedido chega

1. O painel (ou a `delivery-api`) emite no socket. O renderer ouve: `printOrder` e `printShipment` no `/order` (`src/renderer/hooks/usePrintingOrder.ts:90` e `:94`), `print_board` e `print_board_billing` no `/board` (`usePrintingBoard.ts:58` e `:54`).
2. O hook pede o **HTML já renderizado** à `delivery-api`: `api.get<Response[]>(\`orders/${uuid}/${layout}\`)`. A resposta é uma **lista**, um item por impressora — cada um com `content`, `copies` e `device_name`.
3. O renderer entrega a **resposta inteira de uma vez** à fila do main: `enqueueReceipts` (`src/renderer/services/printQueue.ts`) chama `window.electron.enqueue(...)`, com um `id` novo por item (`uuidv4()`, que também nomeia o arquivo temporário). A fila persiste tudo junto e **deduplica por pedido + tipo** (`already-printed`, `already in the queue`).
4. O worker da fila (`src/main/queue/print-queue-worker.ts`) imprime pelo `printReceipt` (`src/main/ipc-events/onRawPrint.ts`): grava `os.tmpdir()/<id>.print.html`, abre uma `BrowserWindow` escondida, casa `deviceName` com o nome real da impressora (case-insensitive) e chama `webContents.print({ silent: true, ... })`. Falha tenta de novo com espera crescente (ver "A fila durável").
5. Só no caminho do pedido, quando o main avisa que o trabalho **imprimiu** (`onJobPrinted`), o renderer marca: `api.patch(\`/orders/${uuid}/printed\`)`.

**Nada disso renderiza layout aqui.** O layout é da `delivery-api`. Se a impressão sai errada, o defeito está quase sempre no HTML que veio, e a verificação é olhar o `content` da resposta — não mexer em componente.

## O contrato do `rawPrint`

```ts
type RawPrint = { content: string; copies: number; deviceName: string | null; id: string };
```

- **`deviceName` pode ser `null`** e o `find` não acha nada: `printer?.name` fica `undefined` e o Electron imprime na **impressora padrão do sistema**. É o comportamento desejado para o restaurante com uma impressora só; não "corrija" para lançar erro sem a task pedir
- **O arquivo temporário só é removido no caminho de sucesso** (`fs.rmSync(file)` dentro do `if (success)`). Falha deixa o `.html` em `%TEMP%` — o `.gitignore` já cobre `*.print.html` no repo, mas na máquina do cliente o arquivo fica. Mudar isso é mudança de comportamento observável: diga na task
- A promessa **rejeita** com o `reason` do Electron quando a impressão falha. **Nenhuma tela chama mais o `rawPrint` direto** — o único código do renderer que encosta nele é o `helpers/printFailure.ts`, que traduz essa string de erro. Quem dá retorno ao operador é o caminho da fila (`onJobFailed` → `useMessaging()` + `Notification`), então o `rawPrint` sobrou como **canal, não como caminho**

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

- **O mesmo pedido pode chegar duas vezes**: pelo `printOrder` e pela varredura `GET /orders/print/list` que roda a cada reconexão (`usePrintingOrder.ts:125-131`). O que evita a duplicata é a deduplicação por pedido + tipo da fila (que lembra o que já imprimiu, mesmo sem o HTML) e, do outro lado, o `patch('/orders/:uuid/printed')` ter sido processado pela API. Task que mexe nesse par precisa dizer o que acontece na janela entre imprimir e marcar
- **Reconexão de socket re-dispara a varredura**: `isConnected` muda e o efeito roda de novo — e **a fila suprime**, não o renderer. A varredura chama `print(order, 'print-created', 'scan')` (`usePrintingOrder.ts:129`), e o worker compara por `orderUuid` + `kind` (`print-queue-worker.ts:246-271`): irmão `printed` devolve `already-printed`, irmão `pending` ou `failed` devolve `duplicate`. O livro de deduplicação **sobrevive sem o HTML**, porque o `trimPrintedHtml` apaga o conteúdo e mantém o registro.
  Os dois casos em que sai papel de novo, e os dois são de propósito: o registro foi **podado** (`MAX_AGE_MS` 24 h ou `MAX_JOBS` 200), ou o painel **re-emitiu** `printOrder` — que chega como `source: 'event'` e não é suprimido, porque é o operador pedindo de novo (há comentário no worker dizendo isso). O `source` é o que separa "a rede oscilou" de "alguém apertou Imprimir"
- **O estado em voo é durável.** Ver "A fila durável" abaixo: o que está em voo sobrevive a fechar o app, e é o arquivo que decide o que ainda falta imprimir

## A fila durável

Desde a spec 15 o renderer **não chama mais o `rawPrint` direto** no caminho dos comprovantes: ele chama `window.electron.enqueue(...)`, e a impressão é do worker do main (`src/main/queue/print-queue-worker.ts`), que usa `printReceipt` (`onRawPrint.ts`). O `rawPrint` direto sobrou como canal, não como caminho.

- **O arquivo:** `print-queue.ndjson` em `app.getPath('userData')`, uma linha JSON por trabalho, gravado por `writeFileAtomic` (`src/main/atomicFile.ts`). Leitura **nunca lança e nunca escreve**: linha ilegível é descartada com `logger.warn`, e uma leitura não destrói o que não entendeu. É dado de instalação, por isso mora em `userData` e nunca em `.env`
- **Os limites moram em `src/shared/queueLimits.ts`** — `MAX_ATTEMPTS` (5), `MAX_AGE_MS` (24 h) e `KEEP_PRINTED_HTML` (20) — e não no worker, porque o **main os aplica e a tela da fila os explica**: o texto da tela deriva deles, nunca de um número digitado duas vezes. `MAX_JOBS` (200) é só do store. `BACKOFF_BASE_MS`/`BACKOFF_MAX_MS` (2 s, até 30 s) são do worker
- **O HTML do comprovante é a parte pesada e a que carrega dado de cliente.** Pendente e falhado guardam o `payload` inteiro; impresso guarda só os `KEEP_PRINTED_HTML` mais novos (`trimPrintedHtml`) e os demais ficam como **livro de deduplicação**, sem HTML. Por isso reimprimir só vale para quem ainda tem o HTML (`isReprintable`), e o botão some nos outros
- **O HTML nunca cruza o IPC.** `PrintJobSummary` (`shared/printQueue.ts`) é o recorte que a tela vê: sem `payload.content`, com `copies`, `attempts`, `lastError` e `nextAttemptAt`. Canal novo da fila recebe `id` e nada mais
- **`nextAttemptAt` vive só em memória** (`Map` no worker) e **se perde no restart**: depois de reabrir, o job pendente aparece sem contagem e é tentado de imediato. Está certo — a espera existe para não martelar uma impressora que acabou de falhar, e quem reabriu o app já esperou
- **Política de anúncio:** o worker emite `queue:changed` (sem payload) a cada mudança do que está esperando ou falhado, **inclusive entre tentativas**, porque a tela mostra "2/5" e a contagem. Medido: 20 trabalhos com a impressora sempre falhando dão 120 anúncios, não 40, e **cada anúncio custa duas leituras do arquivo**, porque a sidebar (badge) e a tela montam o `usePrintQueue`. Aceitável (o `drain` já lê o arquivo por tentativa); a mitigação, se incomodar, é um `usePrintQueue` compartilhado. O `announce()` fica **dentro do `try`, depois do incremento de `attempts`**: se o store falha ao gravar, `attempts` nunca cresce e o laço de 2 s seria infinito — com o anúncio fora, anunciaria para sempre
- **Sem risco de laço:** `queue:changed` tem um consumidor só e o handler é leitura pura. Nenhum caminho reentra em `enqueue`, `kick`, `drain` ou `printReceipt`
- **`queue:discard`** remove um trabalho **falhado** (recusa pendente: está saindo). **`queue:reprint`** devolve um impresso ou falhado a `pending` com as tentativas zeradas, **no mesmo `id`** — é a chave da deduplicação, e id novo imprimiria duplicado. Consequência medida: a linha **some do Histórico** até imprimir de novo, e se a reimpressão falhar as cinco vezes ela volta como "Falhou", apagando da tela o registro de que o original saiu
- **Reimpressão não marca o pedido de novo:** o worker guarda `reprinting` e só suprime o `onPrinted` de quem já tinha impresso (`requeued-printed`) — o pedido já está marcado na API. O trabalho **falhado** reimpresso é a *primeira* impressão que funcionou e precisa marcar
- **Teste da fila:** `queue-ipc.test.ts` roda o store real sobre arquivo real mais o handler real, sem mock na borda. É o modelo: mockar o canal fez passar dois bugs desta spec (o "Impressos hoje" zerado no app real, e o `PATCH /printed` da reimpressão)

## IPC: o nome do canal mora em um lugar só

Todo nome de canal é constante de **`src/shared/ipcChannels.ts`**, em três grupos: `INVOKE_CHANNELS` (renderer → main, `ipcRenderer.invoke`/`ipcMain.handle`), `SEND_CHANNELS` (fire-and-forget, `send`/`ipcMain.on`) e `EVENT_CHANNELS` (main → renderer, `webContents.send`/`ipcRenderer.on`). O preload e o main importam de lá. Existe porque nome divergente **não dá erro**: `ipcRenderer.invoke` numa rota sem handler devolve promessa que rejeita e todo chamador engole com `console.error`, e um `ipcRenderer.on` que ninguém emite fica calado. Foi assim que `receive-order` (preload) × `notification` (main) passou batido, e os quatro canais main → renderer eram literal duplicado em dois arquivos.

Canal novo, com o `printTest` de exemplo:

```ts
// src/shared/ipcChannels.ts — INVOKE_CHANNELS
printTest: 'printTest',

// src/main/preload.ts — dentro de electronHandler
printTest: (request: TestPrintRequest): Promise<EnqueueResult> => ipcRenderer.invoke(INVOKE_CHANNELS.printTest, request),

// src/main/main.ts
ipcMain.handle(INVOKE_CHANNELS.printTest, onPrintTest);
```

O handler vai em `src/main/ipc-events/on<Nome>.ts`. O tipo chega ao renderer sozinho: `preload.d.ts` declara `window.electron` como `typeof electronHandler`. **Não** existe segunda declaração para manter em sincronia — e não crie uma.

**O que pega e o que não pega:** `src/shared/__tests__/ipcChannels.test.ts` lê o texto do `preload.ts` e do main e falha se uma constante não for usada nos **dois** lados, ou se voltar um literal em `ipcRenderer.*(' …')`/`ipcMain.*(' …')`. É um gate de texto, não de comportamento: nenhum outro teste importa o preload ou o `main.ts` (o `setup.ts` substitui `window.electron` inteiro, e os testes do main chamam os handlers direto). Continua valendo conferir com `grep -rn "<nome-do-canal>" src/`.

O stub do preload nos testes está em `src/__tests__/setup.ts`: **canal novo entra lá também**, senão o componente que o chama quebra sob jsdom com `undefined is not a function`.

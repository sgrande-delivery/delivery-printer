# 82 — Reinício controlado: marca de encerramento, espera da fila e quitAndInstall

**Issue:** [#82](https://github.com/sgrande-delivery/delivery-printer/issues/82)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** main
**Depende de:** 80
**Status:** pendente

## Objetivo

Fazer o app conseguir **instalar a atualização na hora, a pedido**, sem atropelar comprovante pendente. É a task mais arriscada da spec: ela mexe no caminho de encerramento, onde um erro não deixa de funcionar — ele **trava o PDV** ou derruba o app no meio de uma impressão.

## Contexto

- Cobre **RF-05** e **RF-06**, e as **RN-05**, **RN-06**, **RN-07**, **RN-08**, **RN-09** e **RN-17** da spec.
- **A armadilha central, e é a razão de existir desta task.** `src/main/window.ts:73-81`:

  ```ts
  this.window.on('close', event => {
    if (isQuiting) { return; }
    event.preventDefault();
    this.window.hide();
  });
  ```

  O `app.quit()` do Electron **aborta** quando uma janela impede o próprio fechamento. Então `autoUpdater.quitAndInstall()` sem a marca de encerramento spawna o instalador, o app **não morre**, e sobra um instalador esperando por um processo que não sai — estado pior que não ter o botão. `.claude/rules/autoupdate.md` já registra o mesmo mecanismo para o X da janela.
- **A marca de hoje não é alcançável de fora.** `src/main/tray.ts:4` é `export let isQuiting = false`, escrita só em `:52`, de dentro do próprio módulo. Um segundo caminho de encerramento não tem como marcá-la, e o `window.ts` a lê como binding de módulo — funciona hoje por conta de como o electron-vite emite o bundle, não por contrato. Daí o módulo próprio.
- **O `before-quit` já tem dono e já é assíncrono.** `src/main/app-events/onBeforeQuit.ts:15-46` dá `preventDefault`, pede ao renderer que emita `printer_exited`, e chama `app.quit()` quando o ack chega **ou** depois de `QUIT_TIMEOUT_MS` (300 ms). Tem guarda de reentrância (`quitting`, `:10` e `:16-18`), então o segundo `app.quit()` atravessa. **Não mude esse arquivo**: o caminho do updater passa por ele como qualquer outro encerramento, e o `printer_exited` tem de sair do mesmo jeito.
- **A instalação é silenciosa** (RN-06). `quitAndInstall(isSilent, isForceRunAfter)`: com `isSilent: false` o NSIS **assistido** deste app (`oneClick: false`, `package.json:82`) abre o assistente na tela do PDV e espera alguém clicar. O que permite o silêncio sem UAC é `perMachine: false` (`:83`). A chamada é `quitAndInstall(true, true)` — silencioso **e** reabrindo o app depois, que é o que o diálogo promete ("fecha e abre de novo na versão X").
- **Quem sabe o que está pendente é quem imprime.** A fila é lida por `printQueueStore.list('pending')` (`src/main/queue/print-queue-store.ts:148`, `list(status?)`), e o despertador é o `onChanged` do worker (`src/main/queue/print-queue.ts:19-24`), que dispara **a cada mudança do que está esperando ou falhado, inclusive entre tentativas** (`.claude/rules/printing.md`). Não precisa de timer, e **a seta é só nesse sentido** (RN-17): esta task **não altera** nenhum arquivo de `src/main/queue/`; ela assina o que já é emitido.
- **Trabalho `failed` não conta como pendente** (RN-07). Ele já desistiu depois de `MAX_ATTEMPTS` (`src/shared/queueLimits.ts:5`); esperar por ele seria esperar para sempre. A condição de instalar é `list('pending').length === 0`.
- **A espera não tem prazo, de propósito** (RN-08): num restaurante em pico a fila pode nunca chegar a zero, e um teto que instalasse "de qualquer jeito" derrubaria o app no meio de uma impressão — o que a RN-07 proíbe. A saída é o `Cancelar`, e a garantia de que nada se perde é o `autoInstallOnAppQuit` (RN-09).

## Mudanças

### 1. `src/main/quitState.ts` (novo)

```ts
// A marca de que o app está encerrando de verdade. window.ts a lê no 'close' para decidir entre
// esconder a janela e deixá-la fechar, e o app.quit() do Electron aborta se a janela impedir o
// próprio fechamento (spec 79, RN-05). São DOIS os caminhos que encerram -- o "Fechar" da bandeja e
// o reinício para atualizar --, e é por isso que a marca não pode morar dentro de um deles.
let quiting = false;

export function isQuiting(): boolean { return quiting; }
export function markQuiting(): void { quiting = true; }
```

- `src/main/tray.ts` deixa de exportar `isQuiting` e passa a chamar `markQuiting()` antes do `app.quit()` (`:51-53`).
- `src/main/window.ts` passa a chamar `isQuiting()` em vez de ler o binding (`:5` e `:74`).
- `grep -rn "isQuiting" src/` depois da mudança: só o módulo novo, o `window.ts` e o teste. Nada importando de `tray`.

### 2. `src/main/updater.ts` — reiniciar, agendar e cancelar

```ts
requestRestart(): UpdateState   // status 'ready' exigido; fila vazia instala, fila pendente agenda
cancelRestart(): UpdateState    // volta restartScheduled a false e desassina a fila
```

- `requestRestart()` fora de `'ready'` é **no-op com `logger.warn`** e devolve o estado como está: o botão só existe nesse estado, mas IPC é entrada não confiável.
- Com pendência: `restartScheduled: true`, `pendingJobs: <n>`, assina o `onChanged` da fila e **anuncia** (é o que faz a sidebar virar "Reinício agendado"). Cada anúncio da fila reconta os pendentes e atualiza `pendingJobs` — é o número que o cartão e o diálogo mostram.
- Chegando a zero: desassina e instala.
- Instalar é **sempre** a mesma função privada:

  ```ts
  private install(): void {
    markQuiting();                       // RN-05: sem isso o quit aborta
    autoUpdater.quitAndInstall(true, true);  // RN-06: silencioso, e reabre depois
  }
  ```

  O overlay da task #86 aparece porque o estado vai a `'restarting'` — o status que a task #80 já declarou e nunca produziu — **antes** do `install()`, e é anunciado antes de chamar. Invertido, a janela morre sem nunca ter pintado o overlay.
- **Como o updater assina a fila sem criar dependência de ciclo:** o `print-queue.ts` importa `printReceipt`, e o updater importaria o `print-queue.ts` — sem ciclo, mas acopla o updater ao módulo da fila. Prefira **injeção**: o `main.ts` passa ao updater `{ pendingCount, onQueueChanged }` no `start()`, montados ali a partir do store e do worker. É o que mantém o `updater.test.ts` sem precisar de arquivo de fila, e mantém a seta da RN-17 visível no lugar onde ela é ligada.

### 3. Os dois canais

`update:restart` e `update:cancel-restart` em `INVOKE_CHANNELS`, os handlers em `src/main/ipc-events/onRestartToUpdate.ts` e `onCancelRestart.ts`, o registro no `main.ts`, as linhas no `preload.ts` e os stubs no `src/__tests__/setup.ts` — os **quatro** lugares da RN-02, e o hook da task #81 ganha `restart()` e `cancelRestart()`.

## Testes

`src/main/__tests__/quitState.test.ts` (novo): começa `false`, `markQuiting()` leva a `true`, e é idempotente.

`src/main/__tests__/updater.test.ts` (alterado) — o núcleo desta task, com a fila **injetada** (um `pendingCount` controlável e um `onQueueChanged` que o teste dispara):

- `requestRestart()` em `'ready'` com fila vazia: marca o encerramento **antes** de `quitAndInstall`, e chama `quitAndInstall(true, true)`. **A ordem é asserção** (RN-05), não detalhe: inverta-a e o app não encerra.
- Com dois pendentes: **não** chama `quitAndInstall`, vai a `restartScheduled: true` com `pendingJobs: 2`, e anuncia.
- Anúncio da fila com um pendente: `pendingJobs: 1`, ainda sem instalar. Com zero: instala, uma vez só.
- `cancelRestart()` enquanto espera: volta a `'ready'` sem `restartScheduled`, **desassina** a fila, e um anúncio posterior com zero pendentes **não** instala. É o teste que pega o vazamento mais perigoso desta task — um app que reinicia sozinho depois de o operador ter cancelado.
- `requestRestart()` fora de `'ready'`: no-op, `warn`, sem `quitAndInstall`.
- Trabalho `failed` na fila **não** conta como pendente: com um `failed` e nenhum `pending`, a instalação acontece (RN-07).
- O estado vai a `'restarting'` e é anunciado **antes** do `quitAndInstall`.

`src/main/__tests__/onBeforeQuit.test.ts`: continua passando sem alteração — é a prova de que o caminho do `printer_exited` não mudou.

`src/main/__tests__/updateIpc.test.ts` (alterado): os dois handlers novos, contra o updater real.

## Critérios de aceitação

- [ ] `markQuiting()` é chamado antes de todo `quitAndInstall`, provado por ordem de chamadas no teste
- [ ] `quitAndInstall` é chamado com `(true, true)` — silencioso e reabrindo
- [ ] Reinício com fila pendente **agenda** e só instala quando os pendentes chegam a zero
- [ ] `Cancelar` desassina a fila: nenhum anúncio posterior instala nada
- [ ] Trabalho `failed` não bloqueia o reinício
- [ ] Nenhum arquivo de `src/main/queue/` foi alterado; a dependência entra por injeção no `main.ts`
- [ ] `src/main/tray.ts` não exporta mais `isQuiting`, e `grep -rn "isQuiting" src/` não mostra import vindo de `tray`
- [ ] `onBeforeQuit.test.ts` passa sem alteração
- [ ] **Conferido em Windows com instalador empacotado:** clicar em `Reiniciar e atualizar` fecha, instala em silêncio e reabre na versão nova — com a fila vazia e com um comprovante pendente
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **O diálogo, a faixa e o overlay** — task #86. Esta task entrega o estado `'restarting'` e as ações; quem os desenha é a #86.
- **Mudar `onBeforeQuit.ts`, o `QUIT_TIMEOUT_MS` ou o `printer_exited`.**
- **Mudar qualquer coisa em `src/main/queue/`**, inclusive "só para expor um contador".
- **Teto para a espera da fila** (RN-08 e decisão 2 da spec).
- **`perMachine`, `oneClick` ou qualquer invariante do empacotamento.**

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

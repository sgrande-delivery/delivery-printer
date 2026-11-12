# 82 — Reinício controlado: marca de encerramento, espera da fila e quitAndInstall

**Issue:** [#82](https://github.com/sgrande-delivery/delivery-printer/issues/82)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** main
**Depende de:** 80
**Status:** shipped

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
- **Quem sabe o que está pendente é quem imprime.** A fila é lida por `printQueueStore.list('pending')` (`src/main/queue/print-queue-store.ts:148`, `list(status?)`), e o despertador é o `onChanged` do worker (`src/main/queue/print-queue.ts:19-24`), que dispara **a cada mudança do que está esperando ou falhado, inclusive entre tentativas** (`.claude/rules/printing.md`). Não precisa de timer, e **a seta é só nesse sentido** (RN-17). **Premissa corrigida na execução:** o `onChanged` é dependência **fixa** passada ao `createPrintQueueWorker` e só reencaminha o `queue:changed` para a janela — não existe lista de ouvintes para assinar. O dev decidiu acrescentar um **publicador genérico** ao `print-queue.ts` (ver `## Implementação`); a fila continua não sabendo que o updater existe.
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

- [x] `markQuiting()` é chamado antes de todo `quitAndInstall`, provado por ordem de chamadas no teste
- [x] `quitAndInstall` é chamado com `(true, true)` — silencioso e reabrindo
- [x] Reinício com fila pendente **agenda** e só instala quando os pendentes chegam a zero
- [x] `Cancelar` desassina a fila: nenhum anúncio posterior instala nada
- [x] Trabalho `failed` não bloqueia o reinício
- [x] A dependência da fila entra por **injeção no `main.ts`**, e de `src/main/queue/` só o `print-queue.ts` mudou — um publicador genérico de 26 linhas, decidido pelo dev depois de a premissa da task cair (ver `## Implementação`). Store, worker, `bootPrintQueue`, limites, backoff, deduplicação e os outros dois eventos intactos
- [x] `src/main/tray.ts` não exporta mais `isQuiting`, e `grep -rn "isQuiting" src/` não mostra import vindo de `tray`
- [x] `onBeforeQuit.test.ts` passa sem alteração
- [ ] **Conferido em Windows com instalador empacotado:** clicar em `Reiniciar e atualizar` fecha, instala em silêncio e reabre na versão nova — com a fila vazia e com um comprovante pendente
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. `src/main/app-events/` **intocado** (`git diff` vazio) e o `onBeforeQuit.test.ts` passando sem alteração — é a prova de que o `printer_exited` continua saindo do mesmo jeito.

**`src/main/quitState.ts`** (novo) — `isQuiting()` / `markQuiting()`. O `tray.ts` deixou de exportar a marca e chama `markQuiting()` antes do `app.quit()`; o `window.ts` chama `isQuiting()`. `grep -rn "isQuiting" src/` fora de teste dá só `quitState.ts` e `window.ts` — nada vindo de `tray`.

**`requestRestart()` / `cancelRestart()`** no `AppUpdater`, com `install()` privado: `markQuiting()` **antes** de `autoUpdater.quitAndInstall(true, true)`, e o estado a `'restarting'` **anunciado antes** de instalar (senão a janela morre sem a #86 pintar o overlay).

### A premissa da task caiu, e o dev decidiu a saída

A task mandava "assinar o `onChanged` do worker". **Não existe assinatura:** o `onChanged` é dependência fixa passada ao `createPrintQueueWorker` em `print-queue.ts:23` e só reencaminha o `queue:changed` para a janela.

A primeira implementação resolveu com um **tap em `window.webContents.send`**. O dev **rejeitou** o tap pelo modo de falha: canal renomeado ou `send` saindo de outro `webContents` e o tap emudece — o reinício agendado **nunca dispara**, enquanto a tela promete "Reinicia sozinho quando a fila esvaziar". Operador esperando para sempre, log silencioso.

O que entrou foi um **publicador genérico** em `src/main/queue/print-queue.ts` (26 linhas): um `Set` de ouvintes, `onQueueChanged(listener)` devolvendo o `off`, e o `onChanged` do worker fazendo o `send` para a janela **primeiro** e só depois o fan-out, com `try/catch` **por ouvinte** sobre uma **cópia** do `Set`. A **RN-17 segue de pé**: a fila publica sinal genérico e **não sabe que o updater existe** — nenhum import de `updater` lá, nenhuma menção a updater ou reinício, e nada mais de `src/main/queue/` mudou. A injeção `{ pendingCount, onQueueChanged }` é montada no `boot()` do `main.ts`, que é onde a seta fica visível.

### O que o review mudou

1. **O reinício agendado ficava preso quando o status saía de `'ready'`** — medido, não deduzido. Agendado + evento `error` levava a `'error'` **carregando `restartScheduled: true`**; a assinatura era descartada no anúncio seguinte e a espera era abandonada **em silêncio**. Chegando a `'ready'` de novo, o agendamento velho continuava ligado, o `requestRestart()` caía na guarda de idempotência e **nada instalava nunca**, com o cartão prometendo "será instalada em seguida". Agora o `set()` desassina e zera `restartScheduled`/`pendingJobs` no **mesmo** patch quando o status sai de `'ready'` (exceto para `'restarting'`, que o `install()` já zera).
2. **O comentário do `install()` estava otimista.** Medido no `BaseUpdater.js`: o `quitAndInstall` **praticamente não lança** — ele captura, chama `dispatchError` e **devolve sem sair**. Então o caminho realista é "sem throw": a marca fica, o estado vai a `'error'` pelo evento, e o X da janela passa a encerrar o app. O comentário agora diz isso.
3. **`stop()` passou a desassinar a fila** — sem isso, quem chamasse `stop()` deixaria o ouvinte vivo e um reinício agendado ainda instalaria. O `started` continua **não** sendo zerado (reassinar duplicaria todos os handlers do `autoUpdater`).
4. **Um teste era tautológico** (o do `failed` não contar como pendente repetia o da fila vazia) e virou gate de texto sobre o `main.ts`, no padrão do `ipcChannels.test.ts`, provando que o `pendingCount` usa `list('pending')` — `list()` sem filtro contaria `printed`/`failed` e o reinício esperaria para sempre.
5. **Faltavam os testes do hook** para `restart`/`cancelRestart`: cada ação é uma linha, e canal trocado é silencioso (o gate só lê texto, e os stubs resolvem qualquer coisa).
6. **A guarda de estado do `onQueueChanged` era load-bearing e sem rede** — mutação mostrou que removê-la passava a suíte inteira. Agora tem teste.

### Decisões, e o veredito do review

| # | Decisão | Veredito |
| --- | --- | --- |
| 1 | `requestRestart()` sem fila ligada é no-op com `warn`, não instala às cegas | certo — instalar sem saber o pendente violaria a RN-07 |
| 2 | Contagem que lança conta 1 pendente e espera, com `logger.error` | certo (o `list()` não lança por contrato; é cinto de segurança) |
| 3 | Pedir reinício com um já agendado é idempotente | certo, medido |
| 4 | `cancelRestart()` é no-op em `'restarting'` | certo — depois do `quitAndInstall` não há o que cancelar |
| 5 | `pendingJobs` só anuncia quando o número muda | certo e necessário: 20 trabalhos falhando dão 120 anúncios |
| 6 | `install()` zera `restartScheduled`/`pendingJobs` | certo — o overlay não herda "aguardando N na fila" |
| 7 | `markQuiting()` irreversível se o `quitAndInstall` falhar | aceitável: limpar a marca reabriria a janela da RN-05 com instalador já spawnado. Errar para o lado "o quit funciona" é o certo, e o dano é recuperável |
| 8 | `stop()` não zera `started` | mantido; mas passou a desassinar a fila (item 3 acima) |
| 9 | Sem teste do hook para as duas ações novas | **rejeitado** — o review escreveu os dois |

### Testes

- `src/main/__tests__/quitState.test.ts` (novo) — começa `false`, `markQuiting()` leva a `true`, idempotente.
- `src/main/queue/__tests__/print-queue-listeners.test.ts` (novo) — ouvinte notificado a cada mudança; **o `send` para a janela acontece mesmo com um ouvinte que lança**, e os outros ouvintes seguem rodando; o `off` desassina; ouvinte que se desassina durante a própria notificação não quebra a iteração.
- `src/main/__tests__/updater.test.ts` (alterado) — a **ordem** `markQuiting` → `quitAndInstall` como asserção, o `(true, true)`, o `'restarting'` anunciado antes, agendar com 2 pendentes, anúncio com 1 e com 0 instalando uma vez só, o `cancelRestart()` desassinando, ouvinte chamado depois do cancelamento não instalando nada, no-op com `warn` fora de `'ready'` nos cinco status, o estado preso consertado, e o `stop()` desassinando.
- `src/main/__tests__/updateIpc.test.ts` e `src/renderer/hooks/__tests__/useAppUpdate.test.ts` (alterados) — os dois handlers e as duas ações novas do hook.

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **79 arquivos / 907 testes**, de 77/871.
- **Mutações:** o review rodou 14 (entre elas inverter a ordem do `markQuiting`, anunciar o `'restarting'` depois, `quitAndInstall(false, …)`, tirar o `off` do cancelamento, notificar antes do `send`, fan-out sem `try/catch`). Eu rodei a da RN-05 por conta própria: inverter a ordem derruba **4** testes. Arquivo restaurado com `sha256` conferido.
- **Empacotamento, rodado no review:** asar com 24 pacotes, `electron-updater` e `electron-log` presentes, nenhuma devDependency, `app-update.yml` intacto, e `quitAndInstall(true, true)` + `autoInstallOnAppQuit = true` no bundle do main.
- **Pendente, e é o que fecha a task:** o critério de Windows real — instalar o `.exe`, publicar a versão seguinte e clicar em `Reiniciar e atualizar` com a fila vazia **e** com um comprovante pendente. Não é mensurável aqui.

## Fora de escopo

- **O diálogo, a faixa e o overlay** — task #86. Esta task entrega o estado `'restarting'` e as ações; quem os desenha é a #86.
- **Mudar `onBeforeQuit.ts`, o `QUIT_TIMEOUT_MS` ou o `printer_exited`.**
- **Mudar qualquer coisa em `src/main/queue/` além do publicador genérico de `print-queue.ts`** que o dev aprovou nesta execução — e nada que faça a fila saber do updater.
- **Teto para a espera da fila** (RN-08 e decisão 2 da spec).
- **`perMachine`, `oneClick` ou qualquer invariante do empacotamento.**

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

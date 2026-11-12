# 80 — UpdateState, preferência de download automático e o AppUpdater como máquina de estado

**Issue:** [#80](https://github.com/sgrande-delivery/delivery-printer/issues/80)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** main
**Depende de:** —
**Status:** pendente

## Objetivo

Fazer o processo principal manter **um** estado de atualização derivado dos eventos do `electron-updater`, com verificação periódica, preferência de download automático gravada em `userData` e as notas da versão já convertidas para texto. É a base de que todas as outras tasks da spec dependem; nada de UI entra aqui.

## Contexto

- Cobre **RF-01**, **RF-08**, **RF-09** e **RF-10**, e as **RN-04**, **RN-09**, **RN-10**, **RN-11** e **RN-17** da spec.
- Estado atual: `src/main/updater.ts` tem 36 linhas. Liga `autoDownload` e `autoInstallOnAppQuit` (`:11-12`), chama `checkForUpdates()` uma vez (`:17-21`) e escuta **um** evento, `update-downloaded` (`:32-34`), respondendo com uma notificação. Não guarda estado nenhum, e ninguém pode perguntar nada a ele.
- Quem o instancia é `src/main/window.ts:84-87`, dentro do `build()` da janela. **Isso muda nesta task:** o updater deixa de ser detalhe da janela e passa a ser um módulo do processo, instanciado no `boot()` de `src/main/main.ts:50-79`, perto do `bootPrintQueue(window)` (`:73`) — ele vai precisar do mesmo tipo de ciclo de vida, e a task #81 vai precisar alcançá-lo de um handler de IPC.
- **De onde vêm as notas da versão, medido nesta spec:** o `latest.yml` deste repo **não** tem `releaseNotes` (a esteira não grava `releaseInfo`; `grep` em `package.json` e `.github/workflows/` acha só o `releaseType`). Quem preenche o campo é o `GitHubProvider`, com o `<content>` do feed `releases.atom` — o corpo da release renderizado em HTML pelo GitHub (`node_modules/electron-updater/out/providers/GitHubProvider.js:150-151`, função `getNoteValue`). Release sem corpo vem como `""`. Com `fullChangelog` desligado (o default) o tipo é `string`; ligado, seria `ReleaseNoteInfo[]` — **não ligue**.
- **Por isso a conversão é aqui** (RN-04): é HTML vindo da internet, e `dangerouslySetInnerHTML` com ele seria XSS dentro do renderer. O que atravessa é `string[]`.
- A preferência vai no `ui-preferences.json` que já existe. O comentário de `src/main/uiPreferences.ts:13-15` diz literalmente por que o arquivo é um objeto: *"cada preferência nova não deve precisar de outro"*. A escrita é read-modify-write (`:85-87`), e é isso que impede salvar o download automático e apagar o tema.
- **O que este módulo não pode fazer** (RN-17): nada aqui pode segurar, atrasar ou falhar `enqueue`, `drain` ou `printReceipt`. Esta task não toca em `src/main/queue/` nenhum arquivo.

## Mudanças

### 1. `src/shared/appUpdate.ts` (novo)

Os tipos, em `src/shared/` porque estão no `include` dos **dois** tsconfigs (`CLAUDE.md`, "Imports"); é o mesmo lugar e a mesma razão de `shared/printQueue.ts`.

```ts
// O estado que o main mantém e o renderer desenha. Vive em memória no main: ao contrário da fila,
// não há arquivo, e é por isso que o evento leva o estado inteiro no payload (spec 79, RN-03).

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  /** O app está encerrando para instalar. Só a task #82 o produz; está aqui para o tipo não mudar duas vezes. */
  | 'restarting';

export type UpdateState = {
  status: UpdateStatus;
  /** A versão deste app, do package.json. */
  currentVersion: string;
  /** A versão oferecida; null quando não há nenhuma. */
  targetVersion: string | null;
  /** 0 a 100. Só significa algo em 'downloading' e 'ready'. */
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  /** Do 'download-progress'; 0 quando o electron-updater não informa. Sem ele não há estimativa (fidelidade 5). */
  bytesPerSecond: number;
  /** Epoch ms da última verificação CONCLUÍDA (com ou sem novidade). null antes da primeira. */
  lastCheckedAt: number | null;
  /** Mensagem já legível; só em 'error'. */
  error: string | null;
  autoDownload: boolean;
  /** O operador pediu reinício e a fila ainda não esvaziou (task #82). */
  restartScheduled: boolean;
  /** Quantas impressões faltam sair antes do reinício agendado. 0 fora desse estado. */
  pendingJobs: number;
  /** Linhas de TEXTO extraídas do corpo da release. Nunca HTML (RN-04). */
  releaseNotes: string[];
};

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAX_RELEASE_NOTE_LINES = 12;
```

`UPDATE_CHECK_INTERVAL_MS` fica aqui, e não no `updater.ts`, pela mesma razão do `shared/queueLimits.ts`: **o main aplica e a tela explica** — se um dia a tela disser "verificamos a cada 6 horas", o número não pode estar digitado duas vezes.

### 2. `src/shared/releaseNotes.ts` (novo) — HTML para linhas de texto

Função pura, em `shared/` para ter teste sem Electron:

```ts
export function releaseNotesToLines(notes: unknown, max = MAX_RELEASE_NOTE_LINES): string[]
```

- Aceita `string` (o caso real), `null`/`undefined`/`""` (devolve `[]`) e **também** `ReleaseNoteInfo[]`, caso alguém ligue o `fullChangelog` um dia — nesse caso usa as notas da primeira entrada. Não lança para nenhuma entrada.
- Quebra por `<li>`, `<p>`, `<br>` e fim de linha; remove **todas** as tags; decodifica as cinco entidades que o GitHub emite (`&amp; &lt; &gt; &quot; &#39;`); descarta linha vazia e corta em `max`.
- **Não** interpreta Markdown: o que vem do feed já é HTML.

### 3. `src/main/uiPreferences.ts` — a preferência

Duas funções novas, no padrão das que já existem (`readSidebarWidth`/`writeSidebarWidth`, `:70-106`):

```ts
export function readAutoDownloadUpdates(): boolean   // default true; valor não-booleano loga warn e cai no default
export function writeAutoDownloadUpdates(value: boolean): void   // writeFields({ autoDownloadUpdates: value })
```

O default é `true` porque é o comportamento de hoje (`updater.ts:11`) e porque é o que serve o PDV que ninguém opera.

### 4. `src/main/updater.ts` — a máquina de estado

O `AppUpdater` guarda o `UpdateState`, assina os seis eventos e notifica um listener a cada mudança:

| Evento do `autoUpdater` | Transição |
| --- | --- |
| `checking-for-update` | `status: 'checking'` |
| `update-available` | `targetVersion`, `releaseNotes`, `lastCheckedAt`; `'downloading'` se `autoDownload`, senão `'available'` |
| `update-not-available` | `'idle'`, `targetVersion: null`, `lastCheckedAt` |
| `download-progress` | `'downloading'` + `percent`/`transferred`/`total`/`bytesPerSecond` |
| `update-downloaded` | `'ready'`, `percent: 100` |
| `error` | `'error'` + mensagem por `describeError`; **e `lastCheckedAt` atualizado**, porque a verificação terminou — sem novidade, mas terminou |

API pública:

```ts
state(): UpdateState
onChange(listener: (state: UpdateState) => void): () => void
check(): void          // nunca rejeita: loga e vira estado 'error'
download(): void       // idem; no-op se não há targetVersion
setAutoDownload(value: boolean): void   // grava a preferência, aplica no autoUpdater, e se ligou com status 'available' já baixa
start(): void          // aplica a preferência, assina os eventos, verifica agora e agenda o intervalo
stop(): void           // limpa o timer (usado no teste e no quit)
```

- `autoUpdater.autoDownload` passa a ser **a preferência lida**, não `true` fixo. `autoInstallOnAppQuit` continua `true` **sempre** (RN-09) — comentário na linha dizendo por quê.
- O timer é `setInterval(UPDATE_CHECK_INTERVAL_MS)` com `unref()` se disponível, e **não verifica se já está baixando ou pronto**: checar de novo no meio de um download é pedir para o electron-updater se confundir. A guarda é por status.
- O listener é **um** (`Set`, como `uiPreferences.ts:137`), e o `notify` é embrulhado em `try/catch` com `logger.error`, no mesmo padrão do `announce()` do worker da fila (`print-queue-worker.ts:94-100`): o anúncio não pode derrubar quem mudou o estado.
- A notificação do Windows **sai** daqui nesta task e volta na #87, agora alimentada pela transição para `'ready'`. Deixá-la como está não quebraria nada, mas a #87 precisa do estado para o texto.
- `src/main/main.ts` passa a instanciar o updater no `boot()` e a chamar `start()`; `src/main/window.ts` perde o método privado `updater()` (`:84-87`) e o import.

## Testes

`src/main/__tests__/updater.test.ts` (novo), com `electron-updater` mockado — um `autoUpdater` falso com `on` que guarda os handlers, para disparar os eventos à mão. O padrão do mock está em `src/main/__tests__/uiPreferences.test.ts:6-26` (`vi.hoisted` + `vi.mock('electron', …)`), e o `logger` é mockado como lá (`:24-25`).

- Cada uma das seis transições da tabela, conferindo o `UpdateState` resultante por inteiro (não só o `status`).
- `update-available` com `autoDownload: false` para em `'available'` e **não** chama `downloadUpdate`; com `true`, o status vira `'downloading'`.
- `setAutoDownload(true)` em `'available'` dispara o download; `setAutoDownload(false)` grava a preferência e **não** mexe em `autoInstallOnAppQuit`.
- `error` atualiza `lastCheckedAt` (é a parte que se esquece: erro também encerra uma verificação).
- O listener é chamado uma vez por mudança, e um listener que **lança** não impede a mudança de estado nem derruba o emissor.
- `start()` agenda o intervalo: com timers falsos, avançar `UPDATE_CHECK_INTERVAL_MS` chama `checkForUpdates` de novo; avançar estando em `'downloading'` **não** chama.
- `stop()` impede a verificação seguinte.

`src/shared/__tests__/releaseNotes.test.ts` (novo):

- Um corpo de release real do GitHub (HTML com `<ul><li>`) vira as linhas na ordem.
- `""`, `null`, `undefined` e `[]` viram `[]`.
- Tag não fechada, `<script>alert(1)</script>` e `<img onerror=…>` saem como **texto sem tag** — é a prova de que a RN-04 está implementada e não só escrita.
- Entidade (`&amp;`, `&#39;`) é decodificada; `max` corta a lista.
- `ReleaseNoteInfo[]` é aceito sem lançar.

`src/main/__tests__/uiPreferences.test.ts` (alterado): a preferência nova sobrevive a uma escrita de tema (prova do read-modify-write, no mesmo formato dos casos que já existem para `sidebarWidth`), e valor não-booleano no arquivo cai no default com `warn`.

## Critérios de aceitação

- [ ] `src/shared/appUpdate.ts` existe e compila nos **dois** tsconfigs (`npm run typecheck`)
- [ ] O `AppUpdater` guarda o `UpdateState` e o publica a cada uma das seis transições
- [ ] `autoUpdater.autoDownload` reflete a preferência gravada; `autoInstallOnAppQuit` continua `true` em todos os caminhos
- [ ] A preferência sobrevive a reabrir o app e não apaga `theme` nem `sidebarWidth`
- [ ] A verificação roda no boot e a cada 6 h, e **não** roda enquanto está baixando
- [ ] As notas da versão chegam ao estado como `string[]` sem nenhuma tag HTML
- [ ] O updater é instanciado no `main.ts`, e o `window.ts` não o conhece mais
- [ ] Nenhum arquivo de `src/main/queue/` foi tocado
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **Os canais de IPC** — task #81. Esta task entrega o estado e o `onChange`; quem o leva ao renderer é a próxima.
- **Reiniciar, cancelar e a espera da fila** — task #82. O status `'restarting'` e os campos `restartScheduled` e `pendingJobs` entram no tipo aqui, para não mexer no tipo duas vezes, e esta task nunca os produz: ficam em `false`/`0` e o status jamais chega a `'restarting'`.
- **A notificação do sistema** — task #87.
- **Ligar `fullChangelog`** ou buscar notas pela API do GitHub.

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

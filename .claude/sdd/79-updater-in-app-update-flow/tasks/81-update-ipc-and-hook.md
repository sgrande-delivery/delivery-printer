# 81 — Par IPC do autoupdate e o hook useAppUpdate

**Issue:** [#81](https://github.com/sgrande-delivery/delivery-printer/issues/81)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** main+renderer
**Depende de:** 80
**Status:** pendente

## Objetivo

Levar o `UpdateState` ao renderer e as ações de volta ao main, por canais declarados nos dois lados, e entregar o hook que a tela, a sidebar e a faixa vão consumir. É a ponte: depois desta task a UI tem de onde ler, sem ninguém importar `electron-updater` fora do main.

## Contexto

- Cobre a **RN-01**, a **RN-02** e a **RN-03** da spec.
- **O nome do canal mora num lugar só:** `src/shared/ipcChannels.ts`, em três grupos — `INVOKE_CHANNELS` (`:8-23`), `SEND_CHANNELS` (`:26-30`) e `EVENT_CHANNELS` (`:33-39`). O comentário do topo (`:1-5`) explica por que o arquivo existe: canal divergente **não dá erro**, a promessa rejeita e todo chamador engole. Foi assim que `receive-order` × `notification` passou batido.
- **São quatro lugares, não dois** (RN-02): a constante, a linha do `src/main/preload.ts`, o `ipcMain.handle` do `src/main/main.ts:31-46` e o stub de `src/__tests__/setup.ts:7-40`. Faltando o stub, todo componente que chamar o canal quebra sob jsdom com `undefined is not a function`.
- `src/shared/__tests__/ipcChannels.test.ts` é um **gate de texto**: ele lê o fonte do preload e do main e falha se uma constante não aparecer nos dois, ou se voltar um literal dentro de `ipcRenderer.*`/`ipcMain.*`. Ele não prova comportamento (`.claude/rules/printing.md`), então vale conferir com `grep -rn "<nome-do-canal>" src/`.
- **O padrão de listener main → renderer** já existe quatro vezes no preload (`:48-87` e `:118-125`): a função recebe o listener, registra o handler e **devolve a função de remoção**. Quem consome chama essa função no cleanup. O hook desta task segue isso — `.claude/rules/printing.md` chama vazamento de listener "a armadilha real desta base".
- **Por que o payload vem no evento, e o `queue:changed` não tem payload** (RN-03): o estado da fila mora em arquivo, então um payload poderia estar velho e quem ouve relê; o estado da atualização mora **em memória no main**, é pequeno e tem um consumidor. O `download-progress` emite dezenas de vezes por download, e copiar o padrão da fila aqui custaria uma ida e volta de IPC por tique. **Escreva isso no comentário do canal**, senão o próximo leitor vai "padronizar" os dois.
- Quem dá acesso ao updater a partir de um handler é o módulo da task #80: o handler importa a instância, como `onQueueState` importa o `printQueueWorker` (`print-queue.ts:19`).
- **Onde o hook mora:** no `AppShell`, que já é o dono único dos hooks de processo (`AppShell.tsx:19-23`, e a RN-06 da spec 38). A sidebar, a tela e a faixa leem de um contexto, no mesmo padrão do `ShellConnectionContext` (`layout/shellConnection.ts`); nenhuma delas monta o hook. Montar duas vezes daria dois `onUpdateChanged` e duas leituras iniciais — não quebra, mas é a porta para o problema que o `createSharedStore` existe para resolver.

## Mudanças

### 1. `src/shared/ipcChannels.ts`

```ts
// INVOKE_CHANNELS
updateState: 'update:state',
checkForUpdate: 'update:check',
downloadUpdate: 'update:download',
setAutoDownloadUpdates: 'update:set-auto-download',

// EVENT_CHANNELS
updateChanged: 'update:changed',
```

Os canais de reinício (`update:restart`, `update:cancel-restart`) são da **task #82** — não os declare aqui, ou o gate de texto falha por constante sem uso nos dois lados.

### 2. `src/main/ipc-events/` (novos)

`onUpdateState.ts`, `onCheckForUpdate.ts`, `onDownloadUpdate.ts`, `onSetAutoDownloadUpdates.ts`, um por arquivo, no padrão da pasta. As três ações resolvem com o `UpdateState` **depois** da mudança síncrona que elas provocam (não o estado final do download, que chega pelo evento): quem clicou já vê o botão mudar sem esperar o primeiro anúncio.

`onSetAutoDownloadUpdates` valida a entrada (`typeof value === 'boolean'`), como `onSetUiSidebarWidth` já faz com a largura — IPC é entrada não confiável.

### 3. `src/main/main.ts`

Quatro `ipcMain.handle` junto dos outros (`:31-46`), e, dentro do `boot()`, o `onChange` do updater mandando o estado para a janela — no mesmo formato do `onResolvedChange` (`:62-69`), com a guarda `window.isDestroyed()`.

### 4. `src/main/preload.ts`

```ts
updateState: (): Promise<UpdateState> => ipcRenderer.invoke(INVOKE_CHANNELS.updateState),
checkForUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(INVOKE_CHANNELS.checkForUpdate),
downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(INVOKE_CHANNELS.downloadUpdate),
setAutoDownloadUpdates: (value: boolean): Promise<UpdateState> =>
  ipcRenderer.invoke(INVOKE_CHANNELS.setAutoDownloadUpdates, value),

onUpdateChanged: (listener: (state: UpdateState) => void): (() => void) => { /* padrão das :118-125 */ },
```

O tipo chega ao renderer sozinho: `preload.d.ts` declara `window.electron` como `typeof electronHandler` e **não** há segunda declaração para manter em sincronia (`.claude/rules/printing.md`).

### 5. `src/__tests__/setup.ts`

Os cinco stubs. O `updateState` resolve um `UpdateState` **coerente** (status `'idle'`, versão do `package.json`, `autoDownload: true`, `releaseNotes: []`) — não um objeto vazio: stub incoerente faz a tela passar no teste em um estado que o canal real nunca produz, que é o defeito que o comentário do stub de `setUiSidebarWidth` (`:34-36`) já documenta para a largura.

### 6. `src/renderer/hooks/useAppUpdate.ts` (novo) e o contexto

- O hook lê `updateState()` uma vez, assina `onUpdateChanged`, **chama a função de remoção no cleanup**, e expõe `{ state, check, download, setAutoDownload }`. Cada ação adota o estado que o canal resolveu (como `handleCommitWidth` faz com a largura, `Sidebar.tsx:62-68`) e, no erro, loga por `log.error` e avisa por `useMessaging()`.
- `src/renderer/components/layout/appUpdateContext.ts` (novo), ao lado de `shellConnection.ts` e com a mesma forma. O `AppShell` monta o hook e provê o valor.

## Testes

`src/renderer/hooks/__tests__/useAppUpdate.test.ts` (novo), no padrão de `__tests__/usePrintQueue.test.ts`:

- Monta, resolve o estado inicial, e um `onUpdateChanged` emitido depois atualiza o estado.
- **Desmonta e remonta, emite uma vez, e o listener roda uma vez só** — o teste de vazamento que `.claude/rules/printing.md` prescreve, e que só falha se o cleanup existir.
- `check`/`download`/`setAutoDownload` chamam o canal e adotam o estado resolvido.
- Canal que **rejeita** não derruba o hook: o estado anterior permanece e o aviso é emitido.

`src/main/__tests__/updateIpc.test.ts` (novo): os quatro handlers chamados direto, com o updater da task #80 real e o `autoUpdater` mockado — sem mock na borda do canal. É o modelo que `queue-ipc.test.ts` estabeleceu, e o motivo está na regra: mockar o canal fez passar dois bugs na spec 15.

`src/shared/__tests__/ipcChannels.test.ts`: passa sem alteração (as constantes novas aparecem nos dois lados). Se falhar, é porque um dos quatro lugares ficou de fora — é exatamente o que ele existe para pegar.

## Critérios de aceitação

- [ ] Os cinco canais existem nos **quatro** lugares, e `src/shared/__tests__/ipcChannels.test.ts` passa
- [ ] `grep -rn "update:" src/` mostra cada nome só nas constantes, nunca como literal em `ipcRenderer.*`/`ipcMain.*`
- [ ] O renderer recebe o estado no payload do `update:changed`, sem precisar reler nada
- [ ] O hook remove o listener no cleanup, provado por montar/desmontar/remontar
- [ ] Nenhum arquivo de `src/renderer/` importa `electron` ou `electron-updater`
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **`update:restart` e `update:cancel-restart`** — task #82.
- **Qualquer componente visual.** Esta task não cria tela, cartão nem faixa; o hook existe e o `AppShell` o provê, e ninguém ainda o lê.
- **Mostrar erro de canal na UI além do aviso padrão.**

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

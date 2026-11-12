# 87 — Notificação do sistema revista: texto novo e clique que abre a janela

**Issue:** [#87](https://github.com/sgrande-delivery/delivery-printer/issues/87)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** main
**Depende de:** 80, 82
**Status:** shipped

## Objetivo

Fazer a notificação do Windows levar o operador até a tela nova, em vez de pedir que ele feche o programa. Ela é o **único** canal que alcança quem está com a janela escondida na bandeja, e é a primeira coisa que a maioria vai ver desta feature.

## Contexto

- Cobre **RF-11** e a **RN-16** da spec.
- A notificação de hoje é `src/main/updater.ts:23-29`, disparada no `update-downloaded` (`:32-34`):

  > **Nova versão disponível** / *Feche a aplicação e espere alguns segundos para aplicar a atualização*

  Ela estava certa quando não havia outro caminho. Com a tela, o cartão e o botão de reiniciar, ela passa a pedir a coisa mais inconveniente das três — e não diz que agora dá para resolver em dois cliques.
- **Por que ela não sai de cena** (RN-16): a janela vive escondida (`window.ts:73-81` esconde no `close`). Tela, cartão e faixa só são vistos por quem já abriu o app; quem não abriu só é alcançado pela notificação.
- **Um defeito medido nesta spec, no mesmo arquivo:** `updater.ts:25` monta o ícone com `path.join(process.resourcesPath, 'assets', 'icon.ico')`, em vez de `getAssetPath(app, 'icon.ico')` (`src/main/asset.ts:4-8`). Fora do pacote `process.resourcesPath` aponta para a instalação do Electron, então **em desenvolvimento esta notificação não tem ícone**. O commit `0095137` corrigiu exatamente isso no `onNotification.ts` e na bandeja, e disse *"like the rest of the main process"* — **esta linha ficou para trás, e é a última do repo** (`grep -rn "process.resourcesPath" src/` dá só ela e o próprio `asset.ts`). Conserta-se aqui, de passagem, porque é o mesmo arquivo e a mesma notificação.
- **O clique:** `Notification` emite `'click'`. Mostrar a janela é `window.show()` — o mesmo que a bandeja faz (`tray.ts:35-37` e `:62-64`). Para abrir **na tela de atualizações** é preciso dizer ao renderer para navegar; a navegação é **hash** (`createHashHistory`, `services/history.ts`), então existe o atalho de carregar `#/updates`. **Não** use o atalho: recarregar o renderer no meio de uma impressão derruba os três sockets e a varredura de reconexão. O caminho honesto é um evento main → renderer, e ele custa um canal.
- **Daí a decisão de escopo desta task:** mostrar a janela é barato e resolve 90% do valor (quem abre o app vê a faixa, que já diz tudo e tem o botão). Navegar por IPC é um canal novo nos quatro lugares da RN-02 para levar a um lugar onde a faixa já leva. **Esta task mostra a janela; não navega.**

## Mudanças

### 1. `src/main/updater.ts` — o texto e o ícone

A notificação passa a ser disparada pela transição para `'ready'` (a máquina de estado da task #80), não por um `on('update-downloaded')` solto:

> **Atualização pronta** / *A versão `<x>` está pronta. Abra o Delivery Printer e clique em "Reiniciar e atualizar" — ou ela é instalada quando o app for fechado.*

Dois cuidados no texto: ele não promete "atualiza na hora" (a atualização só é aplicada no `quit`, e é isso que a segunda metade da frase diz), e **cita o rótulo exato do botão**, porque é o que o suporte vai ler ao telefone.

O ícone passa por `getAssetPath(app, 'icon.ico')`, e o `import path from 'path'` sai se ficar sem uso.

### 2. O clique

`notification.on('click', …)` chama `window.show()`. O updater não tem a janela hoje (ele é instanciado no `main.ts` desde a task #80) — passe um `showWindow: () => void` junto do `pendingCount`/`onQueueChanged` da task #82, montado no `boot()` com a guarda `window.isDestroyed()`, como o `onResolvedChange` já faz (`main.ts:62-69`).

### 3. Uma notificação por versão

Guardar a última versão anunciada e não repetir. Sem isso, qualquer caminho que reentre no `'ready'` — o `checkForUpdates` do ciclo de 6 h encontrando a mesma versão já baixada — toca a notificação de novo, e o operador recebe o mesmo aviso de seis em seis horas até fechar o app. É em memória: depois de um restart, avisar uma vez é correto.

## Testes

`src/main/__tests__/updater.test.ts` (alterado):

- A transição para `'ready'` dispara **uma** notificação, com a versão oferecida no corpo.
- Chegar a `'ready'` de novo com a **mesma** versão **não** dispara; com versão **diferente**, dispara.
- O clique chama o `showWindow` injetado, e um `showWindow` ausente ou que lança não derruba nada.
- O ícone vem de `getAssetPath` (o mock de `electron` devolve um `app` com `isPackaged`, e a asserção é sobre o caminho resultante, não sobre `process.resourcesPath`).

Fora do teste automatizado: `Notification` real sob Windows, com e sem o app em foco. O que o jsdom e o mock não provam é se a notificação aparece — e `.claude/rules/renderer-ui.md` já registra que esse tipo de coisa "só Electron de verdade fecha".

## Critérios de aceitação

- [x] A notificação é disparada pela transição para `'ready'`, uma vez por versão
- [x] O texto cita o botão "Reiniciar e atualizar" e **não** promete atualização imediata
- [x] O ícone passa por `getAssetPath`, e `grep -rn "process.resourcesPath" src/` só acha `asset.ts`
- [x] Clicar na notificação mostra a janela
- [ ] Conferido em Windows: a notificação aparece com ícone, e o clique traz a janela da bandeja
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. **Ela fecha a regressão interna da spec:** a notificação saiu do `updater.ts` na #80 e ficou ausente por sete commits — entre eles, o app baixava a atualização sem avisar ninguém, e a notificação é o **único** canal que alcança quem está com a janela escondida na bandeja (RN-16).

**O texto:**

> **Atualização pronta** / *A versão `<x>` está pronta. Abra o Delivery Printer e clique em "Reiniciar e atualizar" — ou ela é instalada quando o app for fechado.*

Ele **não promete** "atualiza na hora" (a atualização só é aplicada no `quit`, e é o que a segunda metade diz) e **cita o rótulo exato** do botão, porque é o que o suporte lê ao telefone. O rótulo bate com o que o cartão da tela e o da sidebar mostram em `'ready'` (`updateView.ts:115` e `:205`) — e o "Reiniciar após a fila" do diálogo é um passo **depois**, sobre o qual a notificação não promete nada.

**O disparo é a transição para `'ready'`**, não um `on('update-downloaded')` solto: o `set({ status: 'ready' })` tem **um** escritor no arquivo, o texto lê o `targetVersion` do **estado** (não o payload do evento), e passa pela dedupe. **Uma notificação por versão**, guardada em memória: sem isso, qualquer reentrada em `'ready'` — o ciclo de 6 h encontrando a mesma versão já baixada — tocaria o mesmo aviso de seis em seis horas até o operador fechar o app.

**O clique mostra a janela** pelo `showWindow` injetado no `start()`, montado no `boot()` com a guarda `isDestroyed()`. **Não navega**: custaria um canal novo nos quatro lugares da RN-02 para levar a um lugar onde a faixa da #86 já leva, e recarregar o renderer com `#/updates` derrubaria os três sockets e a varredura de reconexão. `showWindow` **ausente** ou que **lança** não derruba nada.

**O `start()` virou objeto de opções** (`start({ queue, showWindow })`), que é o que o aprendizado da #82 pediu e ninguém havia gastado. Os dois campos são atribuídos **antes** da guarda `started`, então uma segunda chamada injeta dependência sem reassinar os eventos do `autoUpdater` (reassinar duplicaria todos os handlers). O `stop()` continua **não** zerando o `started`.

**O último `process.resourcesPath` solto do repositório saiu.** A linha antiga montava o ícone com `path.join(process.resourcesPath, 'assets', 'icon.ico')`, e fora do pacote o `process.resourcesPath` aponta para a instalação do Electron — **em desenvolvimento essa notificação não tinha ícone**. O commit `0095137` já havia consertado isso no `onNotification.ts` e na bandeja; esta linha ficou para trás. Agora passa por `getAssetPath(app, 'icon.ico')`, e `grep -rn "process.resourcesPath" src/` acha **só** o `asset.ts`. Conferido no pacote: `resources/assets/icon.ico` **vai** no instalador, então o caminho resolve nos dois modos.

### O que o review consertou

**O argumento do implementador era factualmente falso.** Ele não acrescentou a `Notification` ao mock de `electron` do `updateIpc.test.ts` dizendo que aquele arquivo "não chega ao `ready`" — e **chega, em dois testes**. Medido: a construção da notificação estourava, e **só o `catch` do `notifyReady()` mantinha o arquivo verde**. O custo é maior que o normal, porque esse é justamente o arquivo que roda o **updater real**: o gate de integração nunca exercitava o caminho da notificação, e mover ou estreitar o `try/catch` quebraria dois testes por motivo alheio ao que eles afirmam. O stub entrou, e agora o caminho real roda com **zero** `logger.error`.

### Testes

- A transição para `'ready'` dispara **uma** notificação, com a versão e o rótulo do botão no corpo.
- A **mesma** versão não repete; versão **diferente** dispara.
- **Não** notifica `available` nem erro — o `notifyReady()` tem um chamador.
- O ícone vem do `getAssetPath`, com asserção sobre o **caminho resultante**.
- O clique chama o `showWindow` injetado, e um `showWindow` ausente ou que lança não derruba nada.

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **85 arquivos / 1042 testes**, de 85/1037.
- **Mutação, rodada por mim:** tirar a dedupe por versão derruba o teste correspondente. O review rodou outras quatro (ícone literal, `try/catch` do clique, notificar no `update-available`) e **nenhuma sobreviveu**.
- **Empacotamento, rodado no review** (é a "Verificação da entrega" do plan): `app.asar` de 5,5 MB, **24 pacotes**, `electron-updater` e `electron-log` presentes, **nenhuma devDependency**, `app-update.yml` **ao lado** do asar e inalterado (`owner: raphaelcarreiro`, `repo: delivery-printer-2`, `releaseType: prerelease`). `package.json` e `package-lock.json` **fora** do diff da branch inteira.
- **Em aberto, e é o único critério que falta:** conferir em Windows que a notificação aparece com ícone e que o clique traz a janela da bandeja. Nem jsdom nem mock provam que ela **aparece**.

## Fora de escopo

- **Navegar para `/updates` pelo clique.** Custaria um canal novo nos quatro lugares da RN-02 para levar a um lugar onde a faixa da task #86 já leva. Fica anotado como melhoria.
- **Recarregar o renderer com `#/updates`** — derruba os três sockets.
- **Notificar "versão disponível" sem download** (com o download automático desligado). O cartão da sidebar dá conta, e notificar algo que exige dois cliques do operador para começar a baixar é cedo demais.
- **Notificar erro de atualização.** O PDV não pode fazer nada a respeito; o estado de erro está na tela, e o log vai para o `electron-log`.
- **Mexer no `onNotification.ts`** (o canal que o renderer usa para avisar de falha de impressão).

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

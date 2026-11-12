# 86 — Faixa de atualização pronta, diálogo de reinício, overlay e avisos

**Issue:** [#86](https://github.com/sgrande-delivery/delivery-printer/issues/86)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 82, 84
**Status:** executada

## Objetivo

Fechar o caminho do operador: a faixa que avisa nas outras telas, o diálogo que explica o que vai acontecer e respeita a fila, o overlay enquanto o app encerra para instalar, e os avisos dos dois desfechos que não têm tela própria.

## Contexto

- Cobre **RF-04**, **RF-05**, **RF-06** e **RF-07**, e as **RN-07**, **RN-08**, **RN-12** e **RN-15** da spec.
- No desenho: a faixa é `<sc-if value="{{ showBanner }}">`, **linhas 92-102**; o diálogo é **201-221**; o overlay é **223-229**; o aviso (toast) é **231-236**.
- **A faixa entra no shell, não numa tela.** `AppShell.tsx:38-40` é o `#app-content`, que dá o padding e recebe o `children`: a faixa vai **antes** do `children`, dentro dele. Posta numa tela, ela só apareceria naquela tela — e o desenho a quer em todas menos `/updates`.
- **Quando ela aparece** (`showBanner`, `:434` do desenho): status `ready`, não dispensada, **sem** reinício agendado, e a rota não é `/updates`. A rota se lê com `useLocation()`, que o `AppShell` já usa (`:25`).
- **A dispensa vale pela sessão e não é persistida** (RN-12): `useState` no `AppShell`, e nada em `userData`. A atualização continua pendente depois do "Depois", e o cartão da sidebar continua lá — persistir a dispensa esconderia a atualização para sempre, que é o problema que esta spec existe para resolver. **Dispensar de novo depois de um estado novo:** o `dismissed` volta a `false` quando o `targetVersion` muda, senão dispensar a 3.1.0 esconderia a faixa da 3.2.0.
- **O diálogo:** o app não tem primitivo de diálogo. A referência de véu + painel é a gaveta de impressoras (`components/printers/PrinterDrawer.tsx`), que usa o token `--scrim` e declara `-webkit-app-region: no-drag` no véu e no painel. O diálogo é modal centrado, com `role="dialog"`, `aria-modal`, `aria-labelledby`, fechamento por `Esc`, foco inicial no painel e devolvido ao botão que o abriu. **Primitivo novo só quando o padrão aparecer em dois lugares** (`.claude/rules/renderer-ui.md`): este é o primeiro diálogo modal, então ele mora em `components/updates/`, não em `base/`.
- **O texto da fila é singular e plural** (`queueText`, `:395-397`): *"Há 1 impressão na fila. O app espera ela terminar e reinicia sozinho."* / *"Há N impressões na fila. O app espera elas terminarem e reinicia sozinho."* E o rótulo do botão muda com ela: `Reiniciar após a fila` quando há pendência, `Reiniciar e atualizar` quando não há (`confirmLabel`, `:441`).
- **O número de pendentes vem do `UpdateState.pendingJobs`**, que o main mantém (task #82), **não** do `usePrintQueue` do renderer. São a mesma fila, mas quem decide esperar é o main, e dois contadores divergindo no mesmo diálogo é o defeito óbvio aqui.
- **O overlay é curto e pode nem ser visto:** depois do `'restarting'` o processo morre em seguida. Ele existe para que o clique tenha resposta imediata — e é por isso que a task #82 anuncia o estado **antes** de chamar o `quitAndInstall`.
- **Os avisos saem pelo `useMessaging()`**, que é o único jeito de falar com o operador (`.claude/rules/renderer-ui.md`). Dois textos do desenho: *"Você já está na versão mais recente."* (`:302`, depois de uma verificação sem novidade) e *"Reinício cancelado. A atualização será instalada ao fechar o app."* (`:333`). O terceiro aviso do desenho — "atualizado para a versão X" — **não atravessa** (fidelidade 1 / decisão 1).
- **O aviso de "já está na versão mais recente" só sai quando o operador pediu.** Ele não pode disparar na verificação do boot nem na de 6 h — toast a cada seis horas dizendo que está tudo bem é ruído. A diferença é de quem chamou: o aviso é responsabilidade de quem clicou em `Verificar agora`, comparando o `lastCheckedAt` antes e depois, não de um efeito que observa o estado.

## Mudanças

### 1. `src/renderer/components/updates/UpdateBanner.tsx` (novo) + módulo

Fundo `--accent-soft`, ícone `restart_alt` em `--accent-ink`, título *"A versão `<x>` está pronta para instalar"*, dica *"Se você não reiniciar agora, ela é instalada quando o app for fechado."*, e dois botões de 34 px: `Depois` (`text`) e `Reiniciar agora` (`contained`). `role="status"`, como o desenho (`:93`).

### 2. `src/renderer/components/updates/RestartDialog.tsx` (novo) + módulo

Véu, painel de 440 px, ícone em círculo `--accent-soft`, título *"Reiniciar para atualizar?"*, texto *"O Delivery Printer fecha e abre de novo na versão `<x>`. A impressão fica pausada por alguns segundos."*, a tarja de atenção com `stacks` e o texto da fila quando `pendingJobs > 0`, e os botões `Cancelar` / `<confirmLabel>` de 38 px.

### 3. `src/renderer/components/updates/RestartingOverlay.tsx` (novo) + módulo

Cobre a janela (`position: absolute; inset: 0`), fundo `--bg`, símbolo de 72 px por tema, `Spinner`, e *"Instalando a versão `<x>`…"*. `role="status"`.

### 4. `AppShell.tsx`

- Monta o `useAppUpdate` (já feito na task #81) e guarda o `dismissed` e o `dialogOpen`.
- A faixa antes do `children`, pela condição acima; o diálogo e o overlay no fim da árvore do shell, acima de tudo.
- `Reiniciar agora` da faixa, `Reiniciar e atualizar` do cartão da sidebar **e `Reiniciar e atualizar` do cartão principal da tela** abrem o **mesmo** diálogo — o desenho usa `openDialog` nos **três** (`:100`, `:354` e `:371`). Nenhum dos três reinicia direto. **Medido na execução da #85:** o estado do diálogo **não pode** morar na tela `/updates`, porque o cartão da sidebar é renderizado dentro do `AppShell` e não na rota — ou o estado sobe para o `AppShell`, ou ganha contexto próprio. E a religação é no `Record<UpdateAction, () => Promise<void>>` de cada consumidor, não no `updateView.ts`: os builders continuam devolvendo `action: 'restart'`.

### 5. A tela `/updates` e o cartão da sidebar — os três botões

Os botões de reinício das tasks #84 e #85 passam a abrir este diálogo em vez de chamar a ação direto. As duas **ligaram direto**, como as tasks delas mandavam, então **é aqui que isso se corrige, nos três lugares** — reiniciar sem confirmação é o oposto do que a RF-05 pede, e hoje a tela `/updates` reinicia sem perguntar nada.

## Testes

`src/renderer/components/updates/__tests__/UpdateBanner.test.tsx`, `RestartDialog.test.tsx`, `RestartingOverlay.test.tsx` (novos):

- A faixa aparece em `ready` e desaparece com `Depois`; `Reiniciar agora` abre o diálogo.
- O diálogo com `pendingJobs: 0`: sem tarja, botão `Reiniciar e atualizar`. Com 1: tarja no singular. Com 3: plural, botão `Reiniciar após a fila`.
- `Cancelar` fecha sem chamar ação nenhuma; `Esc` fecha; o foco volta ao botão que o abriu.
- O overlay mostra a versão oferecida.

`src/renderer/components/layout/__tests__/AppShell.test.tsx` (alterado):

- A faixa **não** aparece em `/updates`, e aparece nas outras rotas — os dois lados.
- Não aparece com reinício agendado.
- Dispensada, não volta na mesma sessão; **volta quando o `targetVersion` muda** (o caso que se esquece).
- Em `'restarting'`, o overlay cobre a janela.

`src/renderer/components/updates/__tests__/Updates.test.tsx` (alterado): `Verificar agora` que termina sem novidade emite o aviso; a verificação que **não** foi pedida pelo operador (estado mudando sozinho) **não** emite nada. `Cancelar` o reinício agendado emite o aviso do desenho.

## Critérios de aceitação

- [x] A faixa aparece em `ready` fora de `/updates`, e não aparece em `/updates`, com reinício agendado, nem depois do `Depois`
- [x] A dispensa vale pela sessão e volta quando a versão oferecida muda
- [x] Os **três** botões de reinício abrem o diálogo (a faixa, o cartão da sidebar e o cartão principal — o desenho usa `openDialog` nos três); nenhum reinicia sem confirmação, e `appUpdate.restart()` tem **um** chamador no renderer, o confirmar do diálogo
- [x] O diálogo diz quantas impressões faltam, no singular e no plural, com o número vindo do `UpdateState`
- [x] Confirmar chama a ação, e quem decide instalar ou agendar é o main pelo `pendingJobs` (a #82 provou os dois caminhos). **O ponta a ponta com instalador real fica para a verificação manual em Windows**
- [x] `Esc`, `Cancelar` e o foco de volta funcionam
- [x] O overlay aparece em `'restarting'`
- [x] "Você já está na versão mais recente." só sai quando o operador clicou em `Verificar agora`
- [x] Geometria e tokens conferidos contra o desenho, e todo `var(--…)` existe nos dois temas. **Os dois temas no olho ficam para a verificação manual**
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. **Esta task conserta um comportamento que as #84 e #85 deixaram de propósito:** o botão de reinício das duas chamava a ação direto, então a tela `/updates` e o cartão da sidebar reiniciavam o app **sem perguntar nada**. Agora `appUpdate.restart()` tem **um** chamador em todo o renderer — o confirmar do diálogo (`AppShell.tsx:50`) —, conferido por grep, e os testes das duas tasks foram reescritos para afirmar o contrário do que afirmavam.

**As três superfícies** (`components/updates/`): `UpdateBanner`, `RestartDialog` e `RestartingOverlay`, cada uma com seu módulo, mais `restartText.ts` com o `queueText` e o `confirmLabel` como funções puras. A faixa entra no `#app-content` do `AppShell`, **antes** do `children` — posta numa tela, só apareceria naquela tela.

**O estado do diálogo mora no `AppShell`**, com um contexto pequeno (`layout/restartDialogContext.ts`) que só expõe `openRestartDialog()`. Era obrigatório: o cartão da sidebar é renderizado **dentro do `AppShell`** e não na rota, então um `useState` na tela `/updates` não serviria aos três botões. O `AppUpdateContext` não foi tocado, e os `value()` dos testes das outras tasks continuam tipando.

**O diálogo só aparece com `dialogOpen && status === 'ready' && !restartScheduled`**, então ele **some sozinho** se o estado sair de `ready` por baixo dele — é o aprendizado da #82 aplicado (`'restarting'` não é terminal, e o dono do estado é o main).

**O overlay é dirigido só pelo `status`**, sem fetch, sem delay de animação e sem segundo render: ele tem ~300 ms de vida, e se o instalador recusar o estado vai a `'error'` dentro da mesma chamada — há teste provando que ele **desaparece** nesse caminho, e a mutação que o transforma em latch é pega.

### O laço que quase passou, e a rede que ele ganhou

A primeira versão fazia a subscrição do `useEffect` depender do `handleOpen` do `useMessaging`. O `auth.test.tsx` monta o `AppShell` real e **mocka o `useMessaging` devolvendo função nova por chamada**: a subscrição se refazia a cada render, relia o estado, adotava — render causando o próximo render. O sintoma não era asserção: era o worker do Vitest morrendo com `heap out of memory` depois de **~3 minutos**, sem nomear o hook nem a causa.

A saída é a ref (`useRef(handleOpen)` + `useEffect`), que já é o padrão desta base em **quatro** lugares. O review mediu duas coisas que valem: **não existe janela de primeiro render** (o `useRef(open)` captura o valor no primeiro render, na mesma passada do `useCallback`; o efeito só atualiza depois), e **memoizar o `value` do `MessagingProvider` não dispensaria a ref**, porque o `handleOpen` é `useCallback([open])` e muda de identidade a cada toast.

E ganhou **rede determinística**: um `describe` no `useAppUpdate.test.ts` com identidade instável **local ao bloco** (bandeira no `vi.hoisted`, para os 15 testes anteriores continuarem com o mock estável de sempre), cinco `rerender` e a afirmação de **uma** subscrição. Medido: com o `handleOpen` de volta nas dependências ele falha em **7 ms**, dizendo o número de subscrições — contra os três minutos até o OOM. Mais um comentário na linha da ref dizendo que essa dependência é proibida de propósito, e qual teste o prova.

### O aviso de "já está na versão mais recente"

Ele **só** sai no clique do operador, e isso tem teste nos dois lados. O desenho é **pedido armado**, não observador puro: o clique guarda `{ from: lastCheckedAt }` numa ref e cada estado adotado passa por um `adopt()` que desarma no primeiro desfecho que não é `checking`. Precisou ser assim porque o `onCheckForUpdate` resolve com o estado **logo depois da parte síncrona** (o `checking-for-update` é emitido na primeira linha do `doCheckForUpdates`), então o resultado só pode chegar por evento — "comparar o `lastCheckedAt` antes e depois" na resposta do clique, como a task escreveu, não funcionaria.

O review procurou os furos e mediu cada um: dois cliques dão **um** aviso; clique durante um `checking` em curso reaproveita a promessa em voo do electron-updater; em dev o pedido **desarma na hora** (o invoke já volta `idle` com o mesmo `lastCheckedAt`), então nada é emitido; e o único caminho em que o aviso não sairia exigiria duas verificações no **mesmo milissegundo**. O furo conhecido e benigno: uma verificação que **nunca termina** deixa o pedido armado, e o ciclo de 6 h seguinte pode respondê-lo — com um aviso, e com a frase ainda verdadeira.

### Decisões, e o veredito do review

| Decisão | Veredito |
| --- | --- |
| `handleOpen` por ref | certo, é o precedente da base, e sem janela de primeiro render (medido) |
| Pedido armado + `adopt()` para o aviso | certo, e mais robusto que o "compare antes e depois" da task |
| `dismissedVersion` em vez de booleano + efeito | **melhor que a task**: booleano exigiria `setState` em `useEffect`, o padrão que o lint desta base rebaixou de propósito |
| Diálogo some sozinho se o estado sair de `ready` | certo, e a mutação que o afrouxa é pega |
| `position: fixed`, não `absolute` | **a task estava errada**: o `.root` do `AppShell` não declara `position` e o diálogo é renderizado fora do `.content` |
| Overlay sem versão diz "Instalando a atualização…" | certo — "versão null" na tela do restaurante é o defeito que a #80 e a #84 já caçaram |
| `Spinner` com 28 na união | certo, é o aprendizado da #84 à risca |
| Testes do shell em arquivo novo | certo, e há precedente (`AppShellResize.test.tsx`) |
| `pendingJobs` do `UpdateState`, não do `usePrintQueue` | certo, e o teste **prova** (trocar a fonte derruba só ele) |
| `restartText.ts` em arquivo próprio | certo: o `updateView.ts` é a tabela dos cartões, não do diálogo |

### Testes

- A faixa aparece fora de `/updates` e **não** aparece nela (os dois lados), nem em `idle`/`downloading`, nem com reinício agendado; `Depois` a esconde e ela **volta quando o `targetVersion` muda** — o caso que se esquece.
- O diálogo com `pendingJobs` 0, 1 e 3: tarja ausente/singular/plural, e o rótulo do botão mudando para `Reiniciar após a fila`. `Cancelar`, `Esc`, clique no véu, trava de `Tab`, e o **foco devolvido** ao botão que abriu.
- As **três** aberturas testadas, e os testes antigos da #84 e #85 reescritos para afirmar que `restart` **não** é chamado.
- O overlay com a versão, e desaparecendo quando o estado vai de `restarting` para `error`.
- **18 chaves de CSS, uma asserção por chave, e as 18 derrubam a suíte** quando renomeadas uma por vez.

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **85 arquivos / 1037 testes**, de 81/992.
- **Mutação, rodada por mim:** religar o cartão principal direto na ação derruba 4 testes. O review rodou 18 de CSS (18/18 pegas), 6 de comportamento no shell (5 pegas, a sexta é cinto e suspensório), a da fonte do `pendingJobs`, a do latch do overlay e a do laço de subscrição.
- **Não verificado, e precisa do olho:** os dois temas; o `-webkit-app-region: no-drag` do véu e do painel, que **sobrevive à suíte** se alguém apagar; e o caminho `ready → restarting → instalador`, que só existe com instalador empacotado no Windows.

## Fora de escopo

- **Primitivo de diálogo em `base/`.** Este é o primeiro modal do app; o segundo é que paga o primitivo.
- **Toast de "atualizado para a versão X"** (fidelidade 1, decisão 1).
- **Barra de progresso na faixa.** O desenho não tem; o progresso mora no cartão da sidebar e na tela.
- **Impedir navegação durante o reinício** além do overlay.

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

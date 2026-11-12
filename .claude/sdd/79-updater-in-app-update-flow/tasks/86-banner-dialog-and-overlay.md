# 86 — Faixa de atualização pronta, diálogo de reinício, overlay e avisos

**Issue:** [#86](https://github.com/sgrande-delivery/delivery-printer/issues/86)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 82, 84
**Status:** pendente

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
- `Reiniciar agora` da faixa e `Reiniciar e atualizar` do cartão da sidebar abrem o **mesmo** diálogo — o desenho usa `openDialog` nos dois (`:100` e `:354`). Nenhum dos dois reinicia direto.

### 5. A tela `/updates` e o cartão da sidebar

Os botões de reinício dos dois (tasks #84 e #85) passam a abrir este diálogo em vez de chamar a ação direto. Se a task #84 os ligou direto à ação, **é aqui que isso se corrige** — reiniciar sem confirmação é o oposto do que a RF-05 pede.

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

- [ ] A faixa aparece em `ready` fora de `/updates`, e não aparece em `/updates`, com reinício agendado, nem depois do `Depois`
- [ ] A dispensa vale pela sessão e volta quando a versão oferecida muda
- [ ] Os dois botões de reinício abrem o diálogo; nenhum reinicia sem confirmação
- [ ] O diálogo diz quantas impressões faltam, no singular e no plural, com o número vindo do `UpdateState`
- [ ] Confirmar com fila vazia instala; com fila pendente, agenda — e a tarja de "Reinicia sozinho quando a fila esvaziar" aparece na tela e no cartão
- [ ] `Esc`, `Cancelar` e o foco de volta funcionam
- [ ] O overlay aparece em `'restarting'`
- [ ] "Você já está na versão mais recente." só sai quando o operador clicou em `Verificar agora`
- [ ] Confere com o desenho nos **dois temas**
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **Primitivo de diálogo em `base/`.** Este é o primeiro modal do app; o segundo é que paga o primitivo.
- **Toast de "atualizado para a versão X"** (fidelidade 1, decisão 1).
- **Barra de progresso na faixa.** O desenho não tem; o progresso mora no cartão da sidebar e na tela.
- **Impedir navegação durante o reinício** além do overlay.

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

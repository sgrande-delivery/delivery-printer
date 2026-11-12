# Plan — Processo de atualização da aplicação visível e acionável no PDV

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#79](https://github.com/sgrande-delivery/delivery-printer/issues/79)
**Branch de trabalho:** `feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, em sequência, com um commit local por task e um PR no fim

## Abordagem técnica

A feature tem uma espinha só: **o `main` passa a ser dono de um `UpdateState`, e o renderer é um desenho dele.** Nada do `electron-updater` encosta no renderer (RN-01), e nada de decisão de estado encosta num componente.

**No `main`:**

- `src/shared/appUpdate.ts` (novo) — os tipos, importados pelos dois lados, como `shared/printQueue.ts` já faz para a fila. Entra em `src/shared/` porque está no `include` dos **dois** tsconfigs (`CLAUDE.md`, "Imports").
- `src/main/updater.ts` (reescrito) — o `AppUpdater` de hoje (36 linhas, um evento) vira a máquina de estado: assina `checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded` e `error`, guarda o `UpdateState` em memória e chama um listener a cada mudança. Expõe `check()`, `download()`, `requestRestart()`, `cancelRestart()`, `setAutoDownload()` e `state()`. O timer de 6 h vive aqui.
- `src/main/quitState.ts` (novo) — a marca de encerramento, hoje `export let isQuiting` em `tray.ts:4`, com `isQuiting()` e `markQuiting()`. É o que a RN-05 exige: o `tray` e o updater são **dois** caminhos de encerramento, e uma variável exportada só é escrita de dentro do próprio módulo.
- `src/main/ipc-events/onUpdate*.ts` — um handler por ação, no padrão do resto da pasta.
- A espera da fila lê `printQueueStore.list('pending')` (`print-queue-store.ts:148`) e é acordada pelo `onChanged` do worker (`print-queue.ts:19-24`), que já dispara a cada mudança do que está esperando. **A seta é só nesse sentido** (RN-17): a fila não sabe que o updater existe.

**No renderer:**

- `src/renderer/hooks/useAppUpdate.ts` — lê o estado uma vez e assina `onUpdateChanged`, com `off` no cleanup. É o único consumidor do canal, e vive no `AppShell`, que já é o dono único dos hooks de processo (`.claude/rules/renderer-ui.md`); a sidebar, a tela e a faixa leem do contexto, não montam o hook de novo. Isso evita o problema que o `createSharedStore` existe para resolver, sem precisar dele.
- `src/renderer/components/updates/updateView.ts` — **função pura** que recebe o `UpdateState` e devolve o que o cartão principal e o cartão da sidebar mostram (ícone, tom, título, subtítulo, qual botão, o que ele diz). É a tabela de estados da spec em um lugar, testável sem renderizar nada e sem timer — o mesmo desenho de `buildDashboard` e `testPrintView`, que `.claude/rules/renderer-ui.md` prescreve.
- `src/renderer/screens/UpdatesScreen.tsx` + `components/updates/` — a tela, pelos primitivos de `base/` (`Button` com altura do desenho, `Switch`, `Spinner`, `Icon`, `Chip`) e CSS Modules com os tokens do `app.css`.

**O que é reaproveitado, com endereço:** `Sidebar.tsx:167-175` (a linha da versão já existe e ganha o `onClick`), `Sidebar.tsx:135-144` (o bloco de conexão, acima do qual entra o cartão), `AppShell.tsx:38-40` (o `.content`, onde a faixa entra antes do `children`), `uiPreferences.ts:85` (o `writeFields` read-modify-write), `StateLayout.tsx:19` (símbolo por tema), `providers/messaging.tsx` (os avisos), `PrinterDrawer.tsx` (a referência de véu + painel para o diálogo).

## Decisões arquiteturais

- **O estado vai no payload do evento** (RN-03), ao contrário do `queue:changed`. O estado da atualização mora em memória e tem um consumidor; o da fila mora em arquivo e tem dois. Copiar o padrão da fila custaria uma ida e volta por tique de progresso.
- **A tabela de estados sai do componente e vira função pura** (`updateView.ts`). São sete linhas de "estado → cor, texto, botão" entre o cartão principal e o da sidebar; dentro do JSX isso só se testa renderizando, e a cada estado novo o teste cresce em `getByText`.
- **A marca de encerramento ganha módulo próprio** em vez de um setter exportado pelo `tray`. O `tray` passa a ser um consumidor dela como qualquer outro, e o `window.ts` passa a chamar uma função em vez de ler um binding — que é o que hoje funciona por sorte do bundler.
- **A espera da fila vive no `main`, não no renderer.** O renderer poderia observar o `usePrintQueue` e chamar "instalar agora" quando chegasse a zero, mas isso põe a decisão de derrubar o app num processo que pode estar navegando, recarregando ou travado. Quem sabe o que está pendente é quem imprime.
- **A rota é oculta e o título vem de uma segunda fonte** (RN-14): `navigation.ts` ganha a lista de rotas sem item de menu, e o `titleFor` passa a olhar as duas. É a primeira rota oculta deste app, e o motivo de ser aceitável é que existem dois caminhos até ela.
- **A estimativa de tempo é omitida quando não há como calculá-la** (linha 5 da tabela de fidelidade), em vez de mostrar um número inventado. Progresso que mente é pior que progresso incompleto.
- **As notas de versão são convertidas no `main`** (RN-04). O renderer nunca recebe HTML de rede; recebe `string[]`.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | `UpdateState`, preferência de download automático e o `AppUpdater` como máquina de estado | [#80](https://github.com/sgrande-delivery/delivery-printer/issues/80) | [80-update-state-machine.md](./tasks/80-update-state-machine.md) | — | executada |
| 02 | Par IPC do autoupdate e o hook `useAppUpdate` | [#81](https://github.com/sgrande-delivery/delivery-printer/issues/81) | [81-update-ipc-and-hook.md](./tasks/81-update-ipc-and-hook.md) | 01 | executada |
| 03 | Reinício controlado: marca de encerramento, espera da fila e `quitAndInstall` | [#82](https://github.com/sgrande-delivery/delivery-printer/issues/82) | [82-controlled-restart.md](./tasks/82-controlled-restart.md) | 01 | executada |
| 04 | Três ícones novos no recorte da fonte | [#83](https://github.com/sgrande-delivery/delivery-printer/issues/83) | [83-icon-font-subset.md](./tasks/83-icon-font-subset.md) | — | executada |
| 05 | Tela `/updates` — cartão principal, progresso, preferências e novidades | [#84](https://github.com/sgrande-delivery/delivery-printer/issues/84) | [84-updates-screen.md](./tasks/84-updates-screen.md) | 02, 04 | executada |
| 06 | Cartão de atualização na barra lateral e navegação pela versão | [#85](https://github.com/sgrande-delivery/delivery-printer/issues/85) | [85-sidebar-update-card.md](./tasks/85-sidebar-update-card.md) | 02, 04, 05 | executada |
| 07 | Faixa de "pronta", diálogo de reinício, overlay e avisos | [#86](https://github.com/sgrande-delivery/delivery-printer/issues/86) | [86-banner-dialog-and-overlay.md](./tasks/86-banner-dialog-and-overlay.md) | 03, 05 | executada |
| 08 | Notificação do sistema revista | [#87](https://github.com/sgrande-delivery/delivery-printer/issues/87) | [87-system-notification.md](./tasks/87-system-notification.md) | 01, 03 | executada |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

**01 primeiro, sempre.** Ela é a única que cria o `UpdateState`, e todas as outras o leem ou o escrevem; sem ela as tasks de UI não têm tipo para consumir.

**02 e 03 depois de 01, nessa ordem.** A 02 abre a ponte (canais, preload, handlers, hook); a 03 acrescenta as duas ações mais arriscadas a essa ponte — reiniciar e cancelar — e é a que mexe no caminho de encerramento do app, que é o lugar onde um erro trava o PDV em vez de só não funcionar. Isolá-la num commit é o que permite revertê-la sozinha.

**04 antes de qualquer tela.** É mecânica e independente, mas a UI que vier antes dela mostra `restart_alt` como texto na tela — e esse defeito **não quebra teste nenhum** (RN-13), o que o torna fácil de entregar sem perceber.

**05 antes de 06 e 07** porque é ela que cria o `updateView.ts`, a função pura que decide cor, ícone e texto: a sidebar (06) e a faixa (07) consomem a mesma tabela, e escrevê-la duas vezes é como a tabela de estados começa a divergir entre os dois lugares.

**08 por último**, porque depende de a tela existir (a notificação abre a janela e é a tela que ela mostra) e porque é a menor.

## Dependências de outros repos

**Nenhuma.** Esta feature é autocontida: o `electron-updater` fala direto com o GitHub Releases, e o corpo da release — que alimenta as novidades (RN-04) — já existe lá. Nada é pedido à `delivery-api`, ao `delivery-socket-api` nem ao `delivery-admin`.

Duas consequências operacionais do fluxo de release, que valem para o relatório do `/ship` e não são dependência de código:

- **A feature só é observável a partir da versão seguinte à que a contém.** A versão que entrega esta tela é, por definição, a que ainda não a tinha quando foi baixada: o parque só vê a tela nova depois de atualizar pelo caminho antigo (notificação + "Fechar" da bandeja). Não há atalho, e é por isso que o passo 6 do fluxo de release (atualizar o `delivery_printer_version` no `delivery-admin`) continua importando.
- **O corpo da release do GitHub passa a ser texto de produto.** O que o dev escrever nas notas da release aparece na tela do restaurante (RF-10). Vale escrevê-las em pt-BR e em linguagem de operador, não de commit.

## Verificação da entrega

Além de `npm run typecheck`, `npm test` e `npm run lint` (baseline: 0 erros, 1 aviso em `Login.tsx:23`):

- **Empacotar e abrir o asar** (`.claude/rules/autoupdate.md`), porque a feature encosta no updater: `npm run build && npx electron-builder --linux dir`, e então `npx asar list release/linux-unpacked/resources/app.asar | head -40` — `electron-updater` e `electron-log` têm de continuar lá, e nenhuma devDependency. Conferir também `cat release/linux-unpacked/resources/app-update.yml` (ele fica **ao lado** do asar, não dentro). Apagar `release/` depois.
- **O caminho de reinício só é provável com instalador de verdade.** Em `npm run dev` o `autoUpdater` está inativo (`isUpdaterActive()` é falso fora do pacote) e o `checkForUpdates()` **resolve `null` sem emitir evento nenhum** — medido na task #80: nem erro, nem sucesso, o estado fica em `idle` com `lastCheckedAt: null`. O que prova a RF-05 é instalar o `.exe` de uma versão, publicar a seguinte e clicar em `Reiniciar e atualizar` numa máquina Windows — com a fila vazia **e** com um comprovante pendente.
- **Nunca com a API real.** Build de produção apontado para produção registra a máquina como impressora do restaurante pelo `printer_ping` (`CLAUDE.md`). O teste ponta a ponta do updater usa o instalador de teste do `test-installer.yml`, que já tem guarda contra vazamento de host de produção.
- **Os dois temas, no olho.** Token inexistente e cor errada não são cobertos por teste nenhum (`.claude/rules/renderer-ui.md`).
- **Nenhum ícone em texto**: a prova de que o recorte da fonte foi regerado é visual, nas quatro superfícies (tela, sidebar, faixa, diálogo).

## Aprendizados que valem para as próximas tasks

### Da task 01 (#80)

- **Em `npm run dev` o updater não falha: ele não faz nada.** O plan dizia que o `checkForUpdates()` falha de propósito em dev e que o estado de erro é fácil de ver. Medido na fonte: `isUpdaterActive()` é falso quando o app não é empacotado, e o `checkForUpdates()` **resolve `null` sem emitir evento nenhum** (`node_modules/electron-updater/out/AppUpdater.js:253-256,276-284`). Em dev o estado fica `idle` com `lastCheckedAt: null` **para sempre**. Consequência para a #84: o que se exercita em dev é a linha de "ainda não houve verificação" (fidelidade 7), não o erro — o caminho de erro precisa de instalador de verdade ou de um `check()` forçado a rejeitar.
- **O estado `'error'` pode ter `targetVersion: null`.** Erro de **verificação** não tem versão oferecida; erro de **download** tem. O desenho manda o cartão de erro mostrar `v<x>` e ligar o botão ao download (`atualizacoes.dc.html:360,375`), e o `download()` é no-op sem target, de propósito. Então na #84/#85 o "Tentar novamente" tem de chamar `check()` quando não há target, e o `v<x>` tem de sair da tela nesse caso — senão o botão não faz nada e a tela mostra `vnull`.
- **`state.error` é diagnóstico, não texto de produto.** Ele carrega o `describeError` (para log e, no limite, tooltip). O texto que o operador lê vem da tabela de estados, no `updateView.ts` da #84. Renderizar o campo direto divergiria do desenho congelado.
- **A instância do updater é descartada no `main.ts`** (`new AppUpdater().start()`), e o `stop()` não tem chamador. A #81 precisa alcançá-la de um handler de IPC: decida lá entre singleton de módulo (como os `SocketStore`) e guardar a referência no `boot()` e passá-la adiante. E **não** zere o `started` no `stop()`: o `autoUpdater` é singleton de módulo, e reassinar duplicaria todos os handlers.
- **O recorte da fonte precisa de UA de navegador, e a receita do `fonts/README.md` não diz isso** (medido para a #83): com `curl` puro o Google devolve `format('truetype')` — o arquivo sairia TTF com nome `.woff2`. Com um UA de Chrome, devolve `woff2`. Quem rodar a receita tem de passar `-A` e conferir `file` no resultado.
- **Entre a #80 e a #87 a notificação do Windows não existe.** Ela saiu do `updater.ts` nesta task e volta na #87, alimentada pela transição para `'ready'`. É regressão prevista e interna à spec (RN-16), mas significa que a spec **não pode ir para release sem a #87**.

### Da task 02 (#81)

- **Canal novo desta spec entra em cinco lugares, não quatro.** Os quatro da RN-02 (constante, preload, `main.ts`, stub do `src/__tests__/setup.ts`) **e** o `src/shared/__tests__/ipcChannels.test.ts`, que é `it.each` sobre as chaves e cresce sozinho — foi de lá que vieram 5 dos 20 testes novos. Constante declarada e usada em **um** lado só derruba esse gate: é por isso que `update:restart` e `update:cancel-restart` ficaram para a #82, que tem de declará-los e ligá-los nos quatro lugares **no mesmo commit**.
- **A #82 alcança o updater pelo acessor `appUpdater()`** (`src/main/updater.ts`, fim do arquivo), importado no handler como o `onQueueState` importa o `printQueueWorker`. O que precisar de janela ou da fila (a espera por `pending`) se liga no `boot()`, perto do `onChange`/`start()` do `main.ts` — **não** no import: a instância é preguiçosa de propósito, para não ler o `ui-preferences.json` antes do `whenReady`.
- **`state` do contexto é `UpdateState | null`, e `null` significa "o main ainda não respondeu".** Para a #84/#85/#86: o cartão da sidebar **não aparece** com `null` (mesmo resultado que o status `idle` pede), a tela precisa de um carregamento que **não** seja spinner eterno, e o `updateView.ts` recebe `UpdateState` já estreitado, nunca `null`.
- **O contexto tem default honesto, com ações no-op.** Consequência para teste, e é a que engana: componente renderizado **fora** do `AppUpdateContext.Provider` **não quebra** — ele só não faz nada ao clicar, e o teste passa parecendo provar algo. Teste de tela, de sidebar e de faixa tem de **prover o contexto** (ou receber o valor por prop).
- **As ações resolvem com o estado já mudado, e o hook adota.** Quem clica em `Baixar`/`Verificar agora`/`Reiniciar` não espera o primeiro `update:changed`, e a UI **não** deve manter estado otimista local: o dono do estado é o main. Como o `set()` do updater dispara o `onChange` **dentro** da chamada do handler, o evento sai antes da resposta do `invoke`, e a resposta nunca volta o estado para trás.
- **Os stubs do `setup.ts` resolvem sempre o `idle` coerente.** Teste de tela que quer `available`/`downloading`/`ready`/`error` sobrescreve o stub por teste (`vi.mocked(window.electron.updateState).mockResolvedValue(...)`) e emite pelo listener capturado do `onUpdateChanged` — o padrão está no `useAppUpdate.test.ts`.
- **O evento é por mudança, inclusive por tique de `download-progress`:** a tela de progresso re-renderiza dezenas de vezes por download. Nada de trabalho pesado por render no caminho do `percent`. É por isso que o valor do contexto já é `useMemo`.
- **Em dev os botões parecem inertes, e não é bug da UI:** `Verificar agora` devolve `idle` porque o `checkForUpdates()` resolve `null` sem emitir evento fora do pacote. `checking` e `error` só aparecem com instalador de verdade.

### Da task 03 (#82)

- **A premissa "assine o `onChanged` do worker" era falsa, e a saída foi decidida pelo dev.** O `onChanged` é dependência **fixa** passada ao `createPrintQueueWorker` e só reencaminha o `queue:changed` para a janela. O que entrou foi um **publicador genérico** em `print-queue.ts` (`onQueueChanged(listener)`, `send` para a janela primeiro, fan-out depois, `try/catch` por ouvinte sobre **cópia** do `Set`). O que foi **rejeitado** foi um tap em `window.webContents.send`, pelo modo de falha: ele quebra em silêncio e, quando quebra, o reinício agendado nunca dispara enquanto a tela promete "Reinicia sozinho quando a fila esvaziar". **Quem acrescentar um segundo ouvinte da fila** (a #87 é candidata) precisa saber que um ouvinte removido por outro ouvinte **ainda roda** naquela rodada — é o preço da cópia, e tem teste.
- **`'restarting'` não é terminal, e isso muda o desenho do overlay da #86.** Se o instalador recusar, o `electron-updater` leva o estado a `'error'` **dentro da mesma chamada**: o overlay tem de ser dirigido pelo `status` e sumir sozinho, nunca ser tela sem saída. E ele tem **~300 ms** de vida (o `app.quit()` vem num `setImmediate` e o `onBeforeQuit` adia ≤300 ms), então não pode depender de fetch, de delay de animação nem de um segundo render para aparecer.
- **O `quitAndInstall` falha sem lançar.** Medido no `BaseUpdater.js`: ele captura, chama `dispatchError` e **devolve sem sair**. Consequência que fica: a marca do `markQuiting()` é irreversível de propósito (limpá-la reabriria a janela da RN-05 com instalador já spawnado), então nesse caso o X da janela passa a **encerrar** o app em vez de esconder, e o estado vai a `'error'`.
- **`restart()` e `cancelRestart()` fora do estado certo são no-op silencioso** (log no main, nada na tela). A UI é a **única** coisa que informa o operador nesses casos — o botão tem de existir só nos estados da tabela.
- **`pendingJobs` só é anunciado quando o número muda**, e a tarja de espera só existe com `n ≥ 1`: com zero pendentes o app já instalou. `failed` nunca entra na conta (RN-07).
- **Enquanto um reinício está agendado, cada anúncio da fila acrescenta uma leitura síncrona do `print-queue.ndjson`** (a terceira por anúncio; a regra já contava duas). É o único ponto em que o updater **atrasa** o `drain` — microatraso, só nesse estado, e aceitável.
- **O último elo não tem teste, e não é descuido:** nada neste repo importa o `main.ts`, então a ligação `onQueueChanged` ↔ fila e o `pendingCount` são sustentados por leitura e por um **gate de texto** sobre o `main.ts`, no padrão do `ipcChannels.test.ts`. A #87, que vai injetar o `showWindow` no mesmo `start()`, deve **transformar o parâmetro em objeto de opções** (`start({ queue, showWindow })`) em vez de acrescentar um segundo posicional.

### Da task 04 (#83)

- **A receita do `fonts/README.md` estava quebrada, e agora está consertada:** sem `-A "<UA de navegador>"` o Google Fonts devolve `format('truetype')`, e o arquivo sai **TTF com nome `.woff2`**. Quem regerar o recorte tem de passar o UA e conferir com `file` (tem de dizer Web Open Font Format Version 2) e pelo tamanho (20–25 kB; salto para centenas de kB significa que a URL foi sem `icon_names` e baixou a fonte inteira).
- **"O glifo existe na fonte" é mensurável, e não precisa de olho.** Decodificar o `GSUB` do `.woff2` em Node puro (`node:zlib` brotli, zero dependência nova, 1–5 ms) diz se cada nome da união tem ligadura; esta fonte põe as ligaduras num extension lookup (tipo 7 → tipo 4) alcançável **só pela `rlig`** — a `rclt` está declarada com `lookupIndexCount` 0, e o README dizia o contrário. **Ícone novo numa task futura:** medir assim é mais barato e mais confiável que abrir o app.
- **Contagem de glifo não serve de asserção.** A receita **não fixa versão upstream**, então contagem exata quebra por deriva do Google sem nada de errado ter acontecido. O que é imune a deriva, e pega o único defeito real (recorte não regerado), é "todo nome da união tem ligadura".
- **Glifo a mais não é recorte errado.** A fonte traz os **apelidos legados** de cada ícone: ligadura `verified` e um segundo codepoint apontando para o glifo do `new_releases`, `local_printshop` para o do `print`, `clear` para o do `close`, e mais 16. Foi isso, e não lista errada, que fez 3 ícones novos virarem 4 glifos e 4 PUA a mais.

### Da task 05 (#84)

- **`toHaveClass(styles.a, styles.b)` passa quando UMA das duas chaves é `undefined`** — o matcher só falha com a lista vazia (medido no `node_modules/@testing-library/jest-dom`). Era exatamente o caso do ponto de estado do cartão: renomear `dot` **ou** `dotWarn` no `.module.css` não derrubava nada. **Uma asserção por chave**, sempre — e isso vale para a #85 e a #86, que vão escrever as mesmas asserções de tom.
- **Variante de primitivo entra no primitivo, e o `Spinner` acabou de provar por quê.** A tela redimensionava o anel por seletor descendente (`.status .ring`), e o efeito inteiro era **invisível para a suíte**: trocar o seletor por um que não casa deixava a suíte verde e o anel voltava calado para 40 px. Agora o `Spinner` tem `size`, união fechada `12 | 40`, porque a espessura da borda e a cor da trilha mudam com o tamanho — número livre não carregaria isso. Quem precisar de outro tamanho (a #86 pode, no overlay) acrescenta **valor à união**, não classe na tela.
- **O `updateView.ts` é só o cartão principal.** A coluna da sidebar não existe ainda: a #85 acrescenta um segundo builder **no mesmo arquivo**, não um `updateView` paralelo. **Visibilidade não está no view** — `buildUpdateCard` devolve cartão para todo status, inclusive `idle`/`checking`; quem decide "não aparece" (RF-03, e também `state === null`) é a #85, no seu próprio predicado.
- **A #85 precisa do `percentOf` exportado**, não de arredondar de novo: a sidebar mostra `v<x> · <pct>%` e a tela mostra `<pct>%`, e dois arredondamentos divergem por 1 em algum tique.
- **`UpdateAction` é a moeda comum** (`'check' | 'download' | 'restart' | 'cancel-restart'`), e quem mapeia ação → função é o consumidor, pelo `Record<UpdateAction, () => Promise<void>>`. A #86 muda o **mapeamento** de `'restart'` para "abrir o diálogo" — não o nome da ação, e não o view.
- **O diálogo tem de ser religado em TRÊS lugares, não dois.** No desenho o `Reiniciar e atualizar` do cartão principal também chama `openDialog` (`:371`), como a faixa (`:100`) e o cartão da sidebar (`:354`). A #84 ligou o botão direto na ação, como a task dela mandava; a #86 tem de redirecionar **a faixa, o cartão da sidebar e o cartão principal**, senão a tela `/updates` reinicia sem a confirmação que a RF-05 exige.
- **`releaseNotesTitle` e `autoDownloadHint` já existem e já têm teste** — não reescreva esses textos.

### Da task 06 (#85)

- **Aparência de primitivo é valor na união, nunca prop booleana.** A variante do botão sobre fundo escuro nasceu como `onDark?: boolean`, e isso tornava **expressável e calado** o que não existe: `<Button variant="contained" onDark>` compilava e não fazia nada. Virou `outlinedOnDark` na união `variant`. Esta base não tem um único booleano de aparência em primitivo — os que existem são estruturais (`fullWidth`, `dot`, `pressed`, `iconFirst`). E a união é também onde a métrica do desenho cabe: o peso 500 do secundário da sidebar **não tinha onde morar** com booleano.
- **`outlinedOnDark` só sobre `--side`/`--side-2`.** Em fundo claro ele dá texto branco invisível, e **nada no compilador avisa**. Faixa, diálogo e overlay ficam sobre `--surface`/`--bg` e usam `outlined`. Se algo precisar de botão sobre fundo escuro, é valor novo na união + linha no `METRICS`, nunca classe no consumidor.
- **Nome acessível colide entre superfícies da mesma feature.** O cartão da tela e o da sidebar eram os dois `aria-label="Atualização do aplicativo"`, e em `/updates` com atualização pendente ficam visíveis ao mesmo tempo. Agora são "Atualização do aplicativo" e "Resumo da atualização" — **a faixa precisa de um terceiro**. E `role="progressbar"` com `aria-label="Download da atualização"` já existe **duas** vezes (é assim no desenho): medidor novo no overlay precisa de nome próprio, ou os `getByRole` de teste ficam ambíguos.
- **O diálogo da #86 não pode ter o `useState` na tela `/updates`.** Ele é aberto de **três** lugares, e um deles — o cartão da sidebar — é renderizado **dentro do `AppShell`**, não na rota. Ou o estado sobe para o `AppShell` (ao lado do Provider, com o diálogo renderizado lá), ou ganha contexto próprio. Decidir isso **antes** de escrever o diálogo evita refazer a faixa.
- **A ação se religa no mapa do consumidor, não no view.** Em cada superfície existe um `Record<UpdateAction, () => Promise<void>>`; o `'restart'` passa a abrir o diálogo **ali**. O `buildSidebarUpdate` e o `buildUpdateCard` continuam devolvendo `action: 'restart'`.
- **Correção ao texto da regra:** `toHaveClass(styles.chaveInexistente)` **com um argumento só falha** (a lista fica vazia). O que passa calado é `toHaveClass(a, b)` com **uma** das duas `undefined`. A frase de `renderer-ui.md` sobre isso está pessimista — vale corrigir quando houver task de regra.

### Da task 07 (#86)

- **`handleOpen` nunca entra em array de dependência de efeito.** Ele muda de identidade a cada toast (é `useCallback([open])` no provider), e o `auth.test.tsx` mocka o `useMessaging` devolvendo **função nova por chamada** — uma subscrição que dependa dele se refaz a cada render e a regressão aparece como **OOM do worker do Vitest depois de ~3 min**, não como asserção. A saída é a ref (`useRef(handleOpen)` + `useEffect`), que já é o padrão da base em **quatro** lugares (`usePrintingOrder`, `usePrintingBoard`, `PrinterSettings`, e agora o `useAppUpdate`). **Memoizar o `value` do `MessagingProvider` não dispensa a ref**, porque a instabilidade real vem do mock do teste e do `[open]` do `useCallback`; é task própria (chore), e paga quatro refs.
- **Não há janela de primeiro render na ref** — medido: `useRef(open)` captura o valor **no primeiro render**, na mesma passada do `useCallback`; o efeito só atualiza nos renders seguintes. Um `useLayoutEffect` de filho chamando a ação já alcança o `handleOpen`.
- **O aviso de "versão mais recente" é pedido armado, não observador puro:** o clique guarda `{ from: lastCheckedAt }` numa ref e o `adopt()` desarma no primeiro estado que não é `checking`. Duas consequências medidas: em **dev** o clique não emite nada (o invoke já volta `idle` com o mesmo `lastCheckedAt`), e uma verificação que **nunca termina** deixa o pedido armado até a próxima mudança de estado — o ciclo de 6 h seguinte pode respondê-lo, com **um** aviso e a frase ainda verdadeira.
- **A dispensa da faixa é por versão** (`dismissedVersion`), não booleano com efeito de reset: booleano exigiria `setState` em `useEffect`, o padrão que o lint desta base rebaixou a aviso de propósito. Efeito colateral aceito: dispensar a 3.1.0, ver a 3.2.0 e **voltar** à 3.1.0 mantém a faixa escondida — exige rollback de release com o app aberto, e o cartão da sidebar continua lá (a RN-12 protege contra "esconder para sempre", e isso não acontece).
- **O primitivo de modal está pago.** A premissa da task ("este é o primeiro modal do app") é **falsa**: o `PrinterDrawer` já é `role="dialog" aria-modal` com véu, painel, trava de `Tab`, `Esc` e devolução de foco — e o `handlePanelKeyDown` do `RestartDialog` saiu **byte-idêntico** ao dele (22 linhas). Pela regra, o primitivo nasce na segunda aparição, e ela chegou: candidato a `base/Modal` ou a um hook `useModalPanel`, em **task própria**.
- **Dívida latente registrada:** o `dialogOpen` do `AppShell` não é zerado quando o diálogo some pelo estado, então um estado que saísse de `ready` e **voltasse** reabriria o diálogo sem clique. Não há sequência alcançável hoje (em `ready` o `check()` do main é bloqueado pelo `BUSY`, e a saída de `ready` é para `restarting` e dali para `error`). O conserto barato é zerar o `dialogOpen` no mesmo lugar em que o estado deixa de ser `ready`.
- **O aviso de cancelamento pode sair em duplicata** com duplo clique dentro da ida e volta do IPC, porque o main devolve o estado **inalterado** no no-op e ele satisfaz a condição do aviso. É cosmético (a frase continua verdadeira nos dois casos); o conserto é exigir `wasScheduled` numa ref antes de avisar.

### Da task 08 (#87)

- **O `updateIpc.test.ts` roda o updater REAL e chega ao estado `'ready'`.** Todo caminho novo do main que construa objeto do Electron (`Notification`, `Tray`, `BrowserWindow`) precisa de stub no mock de `electron` **daquele** arquivo — senão a construção estoura e **só um `try/catch` mantém o arquivo verde**, o que esconde o caminho do gate de integração e faz um conserto futuro no `try/catch` quebrar testes por motivo alheio.
- **O `notifiedVersion` é marcado antes do `try`**, então notificação que falhar na construção **não é retentada** para aquela versão. É defensável (a retentativa bateria no mesmo erro, e o ciclo de 6 h é barrado pelo `BUSY` enquanto `ready`), e a rede são as quatro superfícies da UI.
- **O último `process.resourcesPath` solto do repo saiu.** Fora do pacote ele aponta para a instalação do Electron, e o sintoma é **asset ausente só em desenvolvimento** — o tipo de defeito que não aparece em teste nem no instalador. O caminho certo é sempre `getAssetPath(app, …)`; conferido no pacote que `resources/assets/icon.ico` existe.
- **O que o texto da notificação pode prometer:** nunca "atualiza na hora" (a instalação é no `quit`), e o rótulo citado é o do botão que o operador clica **primeiro** — o `confirmLabel` do diálogo muda com a fila, e a notificação não promete nada sobre ele.

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
| 02 | Par IPC do autoupdate e o hook `useAppUpdate` | [#81](https://github.com/sgrande-delivery/delivery-printer/issues/81) | [81-update-ipc-and-hook.md](./tasks/81-update-ipc-and-hook.md) | 01 | pendente |
| 03 | Reinício controlado: marca de encerramento, espera da fila e `quitAndInstall` | [#82](https://github.com/sgrande-delivery/delivery-printer/issues/82) | [82-controlled-restart.md](./tasks/82-controlled-restart.md) | 01 | pendente |
| 04 | Três ícones novos no recorte da fonte | [#83](https://github.com/sgrande-delivery/delivery-printer/issues/83) | [83-icon-font-subset.md](./tasks/83-icon-font-subset.md) | — | pendente |
| 05 | Tela `/updates` — cartão principal, progresso, preferências e novidades | [#84](https://github.com/sgrande-delivery/delivery-printer/issues/84) | [84-updates-screen.md](./tasks/84-updates-screen.md) | 02, 04 | pendente |
| 06 | Cartão de atualização na barra lateral e navegação pela versão | [#85](https://github.com/sgrande-delivery/delivery-printer/issues/85) | [85-sidebar-update-card.md](./tasks/85-sidebar-update-card.md) | 02, 04, 05 | pendente |
| 07 | Faixa de "pronta", diálogo de reinício, overlay e avisos | [#86](https://github.com/sgrande-delivery/delivery-printer/issues/86) | [86-banner-dialog-and-overlay.md](./tasks/86-banner-dialog-and-overlay.md) | 03, 05 | pendente |
| 08 | Notificação do sistema revista | [#87](https://github.com/sgrande-delivery/delivery-printer/issues/87) | [87-system-notification.md](./tasks/87-system-notification.md) | 01, 03 | pendente |

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

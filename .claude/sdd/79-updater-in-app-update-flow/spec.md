# Spec — Processo de atualização da aplicação visível e acionável no PDV

**Status:** entregue
**Criada em:** 2026-11-11
**Escopo:** main+renderer
**Issue:** [#79](https://github.com/sgrande-delivery/delivery-printer/issues/79)
**Desenho congelado:** [`design/atualizacoes.dc.html`](./design/atualizacoes.dc.html)

## Contexto

A atualização deste app hoje é **invisível e não acionável**. O `AppUpdater` (`src/main/updater.ts`) tem 36 linhas: liga `autoDownload` e `autoInstallOnAppQuit`, chama `checkForUpdates()` uma vez, no boot da janela (`src/main/window.ts:84-87`), e escuta **um** evento — `update-downloaded` —, respondendo com uma notificação do Windows: *"Nova versão disponível / Feche a aplicação e espere alguns segundos para aplicar a atualização"*. Não há mais nada: nem progresso, nem erro, nem "já está atualizado", nem como pedir para verificar, nem como pedir para instalar.

O que isso produz no restaurante está documentado em `.claude/rules/autoupdate.md`: **a atualização chega quando o operador fecha o app pela bandeja, e isso pode levar dias.** A janela vive escondida (`window.ts:73-81` dá `preventDefault` no `close` e esconde), então fechar pelo X **não** produz `quit` e não aplica nada — só o "Fechar" do menu da bandeja (`tray.ts:49-55`) aplica. Enquanto isso, o painel mostra a versão de cada impressora pelo `printer_ping`, e o suporte não tem como dizer ao restaurante o que fazer além de "feche o programa pela setinha do relógio". Um PDV aberto há uma semana sequer **sabe** que existe versão nova: a única verificação é a do boot.

O desenho da página **Atualizações**, congelado em `design/atualizacoes.dc.html`, resolve isso dando ao processo um lugar e um controle: uma tela que diz a versão instalada e em que pé está a atualização, um cartão na barra lateral que aparece sozinho quando há algo a fazer, uma faixa nas outras telas quando a nova versão está pronta, e um **reinício pedido pelo operador** que respeita a fila de impressão — porque comprovante que não saiu é pedido que o restaurante não vê, e o pior momento para derrubar o app é no meio de uma impressão.

## Objetivo

O operador do PDV passa a ver em que pé está a atualização e a poder aplicá-la na hora, sem fechar o app pela bandeja e sem risco para o que está na fila; o app passa a descobrir versão nova mesmo ficando dias aberto; e o suporte passa a ter uma tela para onde apontar. O caminho antigo continua valendo como rede: o que foi baixado e não foi reiniciado é instalado no próximo `quit`.

## Requisitos funcionais

- **RF-01** — O processo `main` mantém **um** estado de atualização (`UpdateState`), derivado dos eventos do `electron-updater`, e o publica para o renderer a cada mudança. O estado cobre: status, versão instalada, versão oferecida, progresso (percentual, bytes transferidos, total, bytes/s), instante da última verificação concluída, mensagem de erro, preferência de download automático, reinício agendado e as notas da versão.
- **RF-02** — A tela `/updates` ("Atualizações") mostra, num cartão: o símbolo da marca, `Delivery Printer <versão instalada>`, um ponto de estado com o texto do estado e o botão de ação do estado — na tabela de estados abaixo. Durante o download, a barra de progresso com `<pct>% · <feito> de <total> MB` e o tempo restante. Com reinício agendado, a tarja de atenção `Reinicia sozinho quando a fila esvaziar · <n> na fila`. E, no pé, `Última verificação: <hora>`.
- **RF-03** — A barra lateral ganha um cartão de atualização **acima** do bloco de conexão, que aparece só quando há algo a fazer (disponível, baixando, pronta, reinício agendado, erro) e nunca quando está atualizado ou verificando. Ele é clicável e leva à tela `/updates`, assim como a linha `v<versão> · <arch>` que já existe no pé (`Sidebar.tsx:167-175`).
- **RF-04** — Quando a atualização está pronta e o operador não está na tela `/updates`, uma faixa no topo do conteúdo diz `A versão <x> está pronta para instalar` / `Se você não reiniciar agora, ela é instalada quando o app for fechado.`, com `Depois` e `Reiniciar agora`.
- **RF-05** — `Reiniciar e atualizar` abre o diálogo `Reiniciar para atualizar?`, que explica o que vai acontecer e, se houver impressão pendente, avisa quantas e que o app espera. Confirmar com fila vazia instala na hora; com fila pendente, **agenda**: o estado passa a reinício agendado, o app espera a fila esvaziar e então instala.
- **RF-06** — Cancelar um reinício agendado volta ao estado "pronta" e avisa que a atualização será instalada ao fechar o app.
- **RF-07** — Enquanto o app encerra para instalar, um overlay cobre a janela com o símbolo, o anel de progresso e `Instalando a versão <x>…`.
- **RF-08** — A tela `/updates` tem a preferência **Baixar e atualizar automaticamente**, por instalação, que liga e desliga o download automático. Desligada, versão nova fica em "disponível" até o operador clicar em `Baixar`.
- **RF-09** — O `main` verifica atualização no boot e, a partir daí, **a cada 6 horas**. O botão `Verificar agora` força uma verificação; se não houver versão nova, o app diz isso (`Você já está na versão mais recente.`).
- **RF-10** — A tela mostra as novidades da versão, quando houver, como uma lista de linhas de **texto** extraídas do corpo da release do GitHub.
- **RF-11** — A notificação do sistema continua sendo emitida quando a atualização termina de baixar, com texto que diz que é possível reiniciar pelo app; clicar nela mostra a janela.

### A tabela de estados

Do `mainCard(S)` e do `sidebarCard(S)` do desenho (`design/atualizacoes.dc.html:365` e `:344`). `<x>` é a versão oferecida.

| Status | Cartão principal (ponto · texto · botão) | Cartão da sidebar (ícone · título · subtítulo · botão) |
| --- | --- | --- |
| `idle` (atualizado) | `--ok-dot` · "Você está na versão mais recente" · `Verificar agora` (outlined) | **não aparece** |
| `checking` | anel girando · "Procurando atualizações…" · `Verificando…` (outlined, desabilitado) | **não aparece** |
| `available` | `--accent` · "A versão `<x>` está disponível" · `Baixar agora` (contained) | `new_releases` · "Nova versão disponível" · `v<x>` · `Baixar` |
| `downloading` | `--accent` · "Baixando a versão `<x>`" · sem botão | `downloading` · "Baixando atualização" · `v<x> · <pct>%` · barra |
| `ready` | `--ok-dot` · "A versão `<x>` está pronta para instalar" · `Reiniciar e atualizar` (contained) | `restart_alt` · "Atualização pronta" · `v<x>` · `Reiniciar e atualizar` |
| `ready` + agendado | `--warn` · "A versão `<x>` será instalada em seguida" · `Cancelar` (outlined) | `hourglass_top` (warn) · "Reinício agendado" · "Aguardando `<n>` na fila" · `Cancelar` |
| `error` | `--err-dot` · "Não foi possível baixar. Verifique a internet." · `Tentar novamente` (outlined) | `error` (err) · "Falha no download" · `v<x>` · `Tentar novamente` |
| `restarting` | anel girando · "Instalando a versão `<x>`…" · sem botão | **não aparece** |

**Duas notas da tabela, medidas na execução.** O `restarting` não estava na tabela e precisa estar: sem ele o estado cai no default e o cartão afirma "Você está na versão mais recente" **enquanto instala**. E o `error` tem **dois** casos, porque o estado pode chegar com `targetVersion: null` — erro de **verificação** não tem versão oferecida. Com versão, o texto é o do desenho e o botão baixa de novo; sem versão, o texto é "Não foi possível verificar atualizações. Verifique a internet." e o botão **verifica** (o `download()` é no-op sem alvo). O campo `error` do estado é diagnóstico e nunca vira texto de cartão.

## Regras de negócio

- **RN-01 — O renderer não fala com o `electron-updater`.** Ele não tem Node (`CLAUDE.md`, "O que é este projeto"), e o `autoUpdater` é módulo de processo principal. Todo estado de atualização chega por um canal declarado nos **dois** lados, e toda ação sai pelo mesmo caminho. Importar `electron-updater` no renderer compila (o `tsconfig.web.json` arrasta o `@types/node` inteiro — ver `CLAUDE.md`, "Tipagem") e quebra em runtime.
- **RN-02 — Canal IPC é par, em quatro lugares.** Constante em `src/shared/ipcChannels.ts`, linha no `src/main/preload.ts`, registro no `src/main/main.ts` e stub em `src/__tests__/setup.ts`. Faltando um dos dois primeiros, a promessa **rejeita calada** e todo chamador engole; faltando o stub, o componente quebra sob jsdom com `undefined is not a function`. Foi assim que `receive-order` × `notification` passou batido.
- **RN-03 — O `update:changed` leva o estado inteiro no payload, ao contrário do `queue:changed`, que não leva nada.** O motivo da diferença é material: o estado da fila mora em **arquivo** e um payload desatualizado mentiria, então quem ouve relê; o estado da atualização mora em **memória no main**, é pequeno e tem um consumidor só. Copiar aqui o padrão da fila custaria uma ida e volta de IPC **por evento de progresso** — e o `download-progress` emite dezenas de vezes por download.
- **RN-04 — As notas da versão atravessam o IPC como texto, nunca como HTML.** O `releaseNotes` do `UpdateInfo` não vem do `latest.yml` (a esteira não grava `releaseInfo`): o `GitHubProvider` o preenche com o `<content>` do feed `releases.atom`, isto é, **o corpo da release renderizado em HTML pelo GitHub** (`node_modules/electron-updater/out/providers/GitHubProvider.js:150-151`, `getNoteValue`; release sem corpo vem como `""`). É conteúdo de rede: `dangerouslySetInnerHTML` com ele é XSS dentro do renderer. A conversão para linhas de texto é feita no `main`, e o renderer recebe `string[]`.
- **RN-05 — Instalar pelo app exige marcar o encerramento antes de chamar o `quitAndInstall`.** `window.ts:73-81` dá `preventDefault` no `close` enquanto o app não está encerrando, e o `app.quit()` do Electron **aborta** quando uma janela impede o próprio fechamento. Sem a marca, o `quitAndInstall` spawna o instalador, o app **não morre**, e sobra um instalador esperando por um processo que não sai. Hoje essa marca é `export let isQuiting` em `src/main/tray.ts:4`, escrita só de dentro do próprio módulo — não há como um segundo caminho de encerramento usá-la de fora.
- **RN-06 — A instalação pedida pelo app é silenciosa.** O NSIS deste app é **assistido** (`oneClick: false`, `package.json:82`), então `quitAndInstall(false, …)` abre o assistente do instalador na tela do PDV e espera alguém clicar. O que permite instalar em silêncio sem UAC é `perMachine: false` (`package.json:83`) — ver `.claude/rules/autoupdate.md`. Mudar qualquer um dos dois muda o significado deste requisito.
- **RN-07 — Reinício nunca atropela comprovante pendente.** Pedido de reinício com trabalho `pending` na fila **agenda**: espera a fila esvaziar e então instala. É a mesma razão pela qual a fila é durável — papel que não saiu é pedido que o restaurante não vê. Trabalho `failed` não conta como pendente: ele já desistiu (`MAX_ATTEMPTS`, `shared/queueLimits.ts`) e esperar por ele seria esperar para sempre.
- **RN-08 — A espera da fila não tem prazo, de propósito, e por isso precisa de saída.** Num restaurante em pico a fila pode nunca chegar a zero, e um teto que instalasse "de qualquer jeito" derrubaria o app no meio de uma impressão — exatamente o que a RN-07 proíbe. A saída é o `Cancelar` (RF-06), e a garantia de que a atualização não se perde é o `autoInstallOnAppQuit`. O texto do desenho já é honesto quanto a isso: *"Reinicia sozinho quando a fila esvaziar"*.
- **RN-09 — `autoInstallOnAppQuit` fica ligado sempre, inclusive com o download automático desligado.** É ele que sustenta a promessa da faixa ("é instalada quando o app for fechado") e é a rede de quem nunca clica em nada. Desligá-lo deixaria uma atualização já baixada parada para sempre.
- **RN-10 — A preferência de download automático é por instalação e mora em `userData`.** Vai no `ui-preferences.json` que já existe (`src/main/uiPreferences.ts:15`), cuja escrita é **read-modify-write** (`:85`) justamente para que salvar uma preferência não apague outra. `.env` **não serve**: é build-time, vai inlinado no bundle e é igual para todo restaurante (`CLAUDE.md`, "O que NÃO fazer").
- **RN-11 — A verificação periódica não substitui a do boot nem o botão.** São três gatilhos com razões diferentes: o boot pega quem reabriu o app, as 6 h pegam quem não o fecha há dias (o caso comum neste parque), e o botão pega o suporte ao telefone. O custo de um ciclo é duas requisições ao GitHub por PDV (o `releases.atom` e o `latest.yml`), e é por isso que o intervalo é de horas e não de minutos.
- **RN-12 — A dispensa da faixa vale pela sessão e não é persistida.** A atualização continua pendente depois do `Depois`, e o cartão da sidebar continua lá; persistir a dispensa esconderia a atualização para sempre, que é o problema que esta spec existe para resolver.
- **RN-13 — Ícone novo exige regerar o recorte da fonte.** A `IconName` de `src/renderer/base/Icon.tsx:6-40` e a lista `icon_names` de `src/renderer/fonts/README.md` são a **mesma** lista, com 34 nomes. Nome novo na união sem regerar o `.woff2` faz a tela mostrar **o nome em texto**, sem erro nenhum. Esta spec precisa de três que não estão lá: `restart_alt`, `downloading` e `new_releases`.
- **RN-14 — A tela `/updates` não entra no menu, e por isso precisa de título em outro lugar e de dois caminhos até ela.** O desenho mantém os seis itens de hoje e não põe "Atualizações" entre eles (o `navDef` em `atualizacoes.dc.html:384-387`), mas o cabeçalho do shell tira o título do `NAV_ITEMS` (`navigation.ts:20-22`): rota ausente de lá sai com **cabeçalho vazio**. E `.claude/rules/renderer-ui.md` avisa que tela sem caminho até ela é tela morta — aqui os caminhos são o cartão da sidebar e a linha da versão, e é isso que torna aceitável a primeira rota oculta deste app.
- **RN-15 — O desenho congelado é a referência literal** de medida, cor, raio, peso, ordem, ícone e texto. Divergência deliberada vai na tabela "Fidelidade ao desenho" desta spec, e nada de hex solto: cor é token do `app.css` (`.claude/rules/renderer-ui.md`).
- **RN-16 — A notificação do sistema não sai de cena.** A janela vive escondida na bandeja; quando ela está escondida, a notificação é o **único** canal que alcança o operador. A tela, o cartão e a faixa só são vistos por quem já abriu o app.
- **RN-17 — O estado de atualização nunca bloqueia a impressão.** Nada neste caminho pode segurar, atrasar ou falhar um `enqueue`, um `drain` ou um `printReceipt`. O updater lê a fila para decidir se espera; a fila não sabe que o updater existe.

## Fora do escopo

- **Mexer nas invariantes do autoupdate**: `build.publish`, `appId`, a dupla `ia32`/`x64`, `perMachine`, `oneClick`, a versão do Electron ou o `releaseType`. Ver `.claude/rules/autoupdate.md` — cada uma dessas tem consequência em máquina de cliente, e nenhuma é necessária aqui.
- **Alimentar `releaseInfo.releaseNotes` no `latest.yml` pela esteira.** Medido nesta spec: não é preciso, porque o provider já lê o corpo da release do GitHub (RN-04). Se um dia o formato das notas virar requisito, é task própria no `publish.yml`.
- **Downgrade e rollback.** O electron-updater não faz downgrade; o procedimento de incidente está na regra e é operacional, não de código.
- **Oferecer pré-release ao cliente.** `allowPrerelease` fica `false`: nenhum PDV instala pré-release, e é isso que faz o portão de release funcionar.
- **Mostrar a atualização no painel** (`delivery-admin`), mudar o `printer_ping` ou criar evento de socket para forçar atualização remota. É frente própria, e com spec do outro lado.
- **Assinatura do instalador / aviso do SmartScreen.** Outro assunto.
- **Toast de "atualizado para a versão X" depois do reinício** — decisão 1.
- **Mudar o fluxo de release** (bump → PR → pré-release → conferir → promover). Esta spec não toca workflow nenhum.
- **Tela de histórico de versões.** As novidades são as da versão oferecida (ou da instalada); `fullChangelog` fica desligado.

## Fidelidade ao desenho

| # | O desenho | O app, e por quê |
| --- | --- | --- |
| 1 | `restart()` troca a versão em memória e mostra o toast "Delivery Printer atualizado para a versão 2.8.0" (`:336`) | **Não atravessa.** No app o processo morre e o instalador assume; para mostrar esse toast seria preciso guardar a última versão vista e comparar no boot seguinte (decisão 1) |
| 2 | `assets/app-icon/opcao-b-cupom-s.svg` no cartão e no overlay | `images/brand/simbolo.svg` / `simbolo-negativo.svg`, escolhido pelo tema, como o `StateLayout` já faz (`StateLayout.tsx:19`) |
| 3 | `@keyframes spin` inline e um `<span>` com borda girando | O primitivo `Spinner`, que já tem `role="progressbar"` e `aria-label`. CSS Module não aponta para keyframe global (`.claude/rules/renderer-ui.md`). O anel de 12 px do cartão é `<Spinner size={12} />` e o do overlay é `size={28}` — união fechada `12 | 28 | 40` e classe **no primitivo**, nunca override por seletor na tela |
| 4 | `<button role="switch">` escrito à mão (`:176`) | O primitivo `Switch`, com o rótulo visível ao lado, na tela |
| 5 | `eta` derivado de uma constante inventada: `(100 - progress) * 0.07` | Derivado do `bytesPerSecond` do `download-progress`, que **pode ser 0 ou faltar** — nesse caso a estimativa é **omitida** em vez de mostrar "cerca de 1 s" |
| 6 | `TOTAL_MB = 43.7` fixo | O `total` do `download-progress`, formatado com uma decimal e vírgula |
| 7 | `lastCheck: '10:42'` e o texto "Última verificação: hoje às 10:42" | Hora local do instante real da última verificação **concluída**; antes da primeira, a linha diz que ainda não houve verificação em vez de inventar hora |
| 8 | Corpo em 16 px | 14 px, como todo o app desde a spec 38 (divergência de base, `.claude/rules/renderer-ui.md`) |
| 9 | O menu tem seis itens e "Atualizações" não está entre eles | Mantido: a rota é oculta (RN-14) |
| 10 | `lastCheck: '10:42'` sempre com "hoje às" (`:170`) | "hoje às `<hora>`" **só no mesmo dia**; em outro dia, `Última verificação: 10/11 às 09:05`. O app fica aberto por dias, e "hoje" numa verificação de ontem mentiria |
| 11 | `eta` sempre em segundos (`'cerca de ' + remainingSec + ' s'`, `:388`) | Segundos abaixo de 60 s e **"cerca de `<n>` min"** a partir daí: com a taxa real, "cerca de 2700 s" é um número que ninguém lê |
| 12 | `TOTAL_MB = 43.7` sem declarar a base | MB = **1024²** (MiB), sobre o `total` em bytes do `download-progress`. É a base com que o GitHub mostra o tamanho do asset, então a tela e a release dizem o mesmo número |
| 13 | A preferência tem só rótulo e dica (`:176`) | Mais a linha **"Vale só neste computador. Aplica na hora."**, como o `AppearanceSection` faz: a preferência é por instalação e mora em `userData` (RN-10), e isso precisa estar escrito na tela |
| 14 | O `sidebarCard` escreve "Falha no download" para todo `erro`, com `sub: v<x>` (`:359`) | **Dois** títulos: "Falha no download" quando há versão oferecida, e **"Falha na verificação"** quando `targetVersion` é `null` — erro de verificação não baixou nada. Nesse caso o subtítulo **não é renderizado** (em vez de `vnull`) e o botão chama `check()`, porque o `download()` é no-op sem alvo |
| 15 | O ícone do reinício agendado é `var(--warn)` no cartão da sidebar (`:349`) | Token novo **`--side-warn`**, nos dois temas: o `--warn` do tema claro dá **2,07:1** sobre `--side-2`, abaixo dos 3:1 de AA para objeto gráfico. O token novo dá **8,13:1**. É a mesma razão pela qual o `--muted` divergiu do desenho na spec 38 — contraste medido ganha do mock |
| 16 | A sidebar do desenho tem 216 px, e o botão do cartão caba nela | A largura **mínima** da sidebar subiu de 180 para **200 px**, porque em 180 o rótulo "Reiniciar e atualizar" não cabe dentro do cartão e o botão pinta por cima da borda (o `Button` tem `nowrap` e `flex-shrink: 0`). Encurtar o rótulo foi recusado: 200 é a conta do rótulo + padding, e continua abaixo dos 216 do desenho |
| 17 | O diálogo e o overlay são `position: absolute; inset: 0` (`:202`, `:224`), e o véu é `rgba(21,19,18,.55)` literal | `position: fixed` e o token `--scrim`, como a gaveta de impressoras: o `.root` do `AppShell` não declara `position` e o diálogo é renderizado **fora** do `.content`, então `absolute` não resolveria contra a janela. Véu e painel declaram `-webkit-app-region: no-drag` (RN-13), que o quadro falso do mock não precisa |
| 18 | A faixa (`:93`) e o overlay (`:224`) são `role="status"` sem nome | Cada um ganha nome próprio: `"Aviso de atualização pronta"` e `"Instalando a atualização"`. As quatro superfícies da atualização coexistem, e "Atualização do aplicativo" (cartão da tela) e "Resumo da atualização" (sidebar) já estão tomados |
| 19 | O overlay sempre tem versão (`TARGET` é constante no mock) | Sem versão oferecida o texto é "Instalando a atualização…", nunca "Instalando a versão null…" |
| 20 | O diálogo aparece só por `dialog` (`:201`) | Além do clique, exige `status === 'ready'` e nenhum reinício agendado, e **some sozinho** se o estado mudar por baixo dele — `'restarting'` não é terminal |
| 21 | Os botões têm `padding: 0 14px` e `0 16px` (`:97-99`, `:217-219`) | O padding vem da tabela **por altura** do `Button`: 14 px no 34 e 18 px no `contained` de 38. O `Reiniciar agora` sai 2 px mais estreito e o confirmar 2 px mais largo, pela mesma razão da linha 14 |
| 22 | O painel do diálogo tem 440 px fixos (`:203`) | 440 px com `max-width: calc(100% - 32px)`, para o painel não vazar na largura mínima da janela |

## Critérios de aceitação

- [ ] Com uma versão nova publicada, o app a descobre sem reiniciar (ciclo de 6 h ou `Verificar agora`), baixa, e o cartão da sidebar aparece com o progresso
- [ ] `Reiniciar e atualizar` com a fila vazia fecha o app, instala em silêncio e reabre na versão nova — **conferido com instalador empacotado, não só em dev**
- [ ] `Reiniciar e atualizar` com impressão pendente **não** derruba o app: espera, imprime o que faltava e só então reinicia
- [ ] `Cancelar` um reinício agendado devolve o estado "pronta" e a atualização continua sendo aplicada no "Fechar" da bandeja
- [ ] Com `Baixar e atualizar automaticamente` desligado, versão nova para em "disponível" e nada é baixado até o clique; a preferência sobrevive a fechar e reabrir o app
- [ ] Erro de rede durante o download leva ao estado de erro com `Tentar novamente`, e o app continua imprimindo (RN-17)
- [ ] A tela, o cartão, a faixa, o diálogo e o overlay batem com o desenho nos **dois temas**, com as divergências da tabela acima e nenhuma outra
- [ ] Nenhum ícone aparece como texto na tela (prova de que o recorte da fonte foi regerado)
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`)
- [ ] `npx asar list` do pacote continua mostrando `electron-updater` e `electron-log`, e nenhuma devDependency

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | O toast "Delivery Printer atualizado para a versão X." do desenho, que só faz sentido **depois** do reinício | Não implementar nesta spec. Exigiria guardar a última versão vista em `userData` e comparar no boot — barato, mas é comportamento novo que o desenho não prova, e o reinício real já é evidência suficiente. Fica como task futura |
| 2 | Teto para a espera da fila num reinício agendado | Sem teto (RN-08). O `Cancelar` é a saída e o `autoInstallOnAppQuit` é a garantia; um teto que instalasse no meio de uma impressão contrariaria a RN-07 |
| 3 | O que fazer depois de o download falhar | Estado `error` com `Tentar novamente` manual, sem retry automático: o ciclo de 6 h já tenta de novo sozinho, e retry automático em rede instável vira tráfego sem dono |
| 4 | Se `Verificar agora` deve aparecer também no cartão da sidebar | Não. O desenho só o põe no cartão principal, e o cartão da sidebar existe para o que **tem ação pendente** — no estado "atualizado" ele nem aparece |

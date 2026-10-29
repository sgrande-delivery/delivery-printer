# Plan — Redesenhar a interface do app segundo o Claude Design

**Spec:** [spec.md](./spec.md)
**Desenho congelado:** [design/printer-v2.dc.html](./design/printer-v2.dc.html) — [como ler](./design/README.md)
**Issue da feature:** [#38](https://github.com/sgrande-delivery/delivery-printer/issues/38)
**Branch de trabalho:** `feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim.

**A base não é `origin/master`, e isso é medido, não preferência.** Master não tem `electron.vite.config.ts`, `src/main/queue/`, `src/renderer/base/` nem a tela de impressoras: os 33 commits da migração para electron-vite e das specs 1, 7, 11, 15, 19 e 26 estão todos não mergeados, e master é o app do boilerplate antigo mais o `CLAUDE.md` novo (que entrou sozinho pelo PR #37). Cortar de lá daria um ponto de partida sem 299 arquivos que esta spec cita por `arquivo:linha`. `test/dev-build-integration` é a única ref com tudo junto, e é a que permite empacotar um instalador apontado para o dev e testar o redesenho num PDV — que é metade da verificação desta spec. **O PR vai contra ela, pelo `/ship-pr`, não contra `master`.**

## Abordagem técnica

A feature é **só renderer**, com três exceções no main — todas por motivo de fronteira, não de conveniência:

| O que | Onde | Por que não dá no renderer |
| --- | --- | --- |
| Tema do sistema e preferência persistida | `src/main/theme.ts` (novo), `nativeTheme`, arquivo em `app.getPath('userData')` | O renderer não tem `fs` nem `nativeTheme` (RN-05); e o `.env` é build-time (RN-02) |
| Cor dos três botões nativos da janela | `window.ts`, `setTitleBarOverlay` | Não é CSS (RN-04) |
| Descartar e reimprimir trabalho da fila | `src/main/ipc-events/`, sobre `print-queue-store.ts` | O HTML do comprovante não cruza o IPC, de propósito (RN-09) |

O resto é composição de React com CSS Modules sobre o que já existe. Nada de biblioteca nova além da fonte de ícones (RN-11).

**O shell é a mudança que organiza todas as outras.** Hoje `ProtectedRoute` envolve cada tela num `DefaultLayout` que é só um `div` de padding (`DefaultLayout.tsx`), e os hooks de socket moram **dentro** da tela `/` (`Main.tsx:15-20`). O shell inverte isso: `DefaultLayout` passa a ser o `AppShell` (sidebar + cabeçalho + área de conteúdo), e os quatro hooks de impressão sobem para ele — assim valem para as seis rotas, e a tela deixa de ser dona da conexão (RN-06).

**Reaproveitamento, com arquivo e linha:**

| O que já existe | Onde | Quem usa no desenho |
| --- | --- | --- |
| Fila com pendentes, falhados e retry | `usePrintQueue.ts` (`queueState` + `onQueueChanged`) | sidebar (badge), Painel (números), Fila, Histórico |
| Conferência nome × device do Windows | `shared/printerMatch.ts`, `window.electron.listPrinters()` | Painel (bloco de saúde), Impressoras (chip e borda), Teste |
| Impressoras e sua escrita na API | `services/printers.ts`, `hooks/usePrinters.ts` | Impressoras, gaveta de edição, Teste |
| Configurações do restaurante | `services/printerSettings.ts`, `hooks/usePrinterSettings.ts` | Configurações |
| Teste local pela fila | `window.electron.printTest()`, `src/main/testPrintPage.ts` | Teste de impressão |
| Sessão, restaurante e `is_open` | `providers/auth.tsx` | sidebar, login, Painel |
| Snackbar | `providers/messaging.tsx` (`useMessaging().handleOpen`) | o toast do desenho |
| Combinação de classes | `base/cx.ts` | todo lugar |
| Rede contra classe inexistente | `__tests__/cssModules.ts`, `expectNoUndefinedClasses()` | RN-10, toda task com estilo |

**Os primitivos de `base/` ficam, e crescem por dentro** (RN-11): `Button` ganha as variantes do desenho (`contained`/`text` viram também `outlined` e `danger`, nos tamanhos que o desenho usa), `TextField` ganha a forma de caixa com `focus-within` do login, e entram três primitivos novos que o desenho repete em quatro ou mais lugares — `Icon`, `Stepper` (menos/valor/mais), `Switch` e `Chip`. Primitivo novo só com o padrão aparecendo em dois lugares; os quatro aparecem.

## Decisões arquiteturais

- **A paleta nova substitui a antiga, com camada de apelido durante a execução.** Os tokens do desenho (`--bg`, `--surface`, `--line`, `--text`, `--accent`, …) entram no `app.css` na task 01, e os nomes antigos (`--color-primary`, `--color-text`, …) continuam existindo **apontando para os novos**. É o que permite cada commit da spec compilar e ficar coerente sozinho, sem um único commit gigante que reescreve as 14 folhas de estilo. A task 12 apaga os apelidos — e é por isso que ela existe.
- **O tema é atributo em `<html>`, não classe nem contexto de cor.** `data-theme="dark"` liga o segundo bloco de tokens, igual ao desenho (que usa `data-theme="escuro"`; aqui o valor é em inglês, RN-14). Componente nenhum lê o tema: todos leem token. O único que lê o tema é quem avisa o main para trocar o `titleBarOverlay`.
- **A preferência de tema é `'system' | 'light' | 'dark'`, com `'system'` como default**, e vive em `ui-preferences.json` sob `userData`, escrito pelo `writeFileAtomic` que a fila já usa (`src/main/atomicFile.ts`). Arquivo ilegível não derruba o app: cai para `'system'`.
- **A fonte de ícones é a Material Symbols Outlined, empacotada** (divergência 1 da tabela de fidelidade). O desenho nomeia 28 símbolos, dois deles — `stacks` e `skillet` — sem equivalente no conjunto Material do `react-icons`; e fidelidade literal (RN-15) com meia dúzia de glifos aproximados não é fidelidade. A fonte entra como arquivo em `src/renderer/fonts/`, já recortada aos 34 símbolos no próprio arquivo (e **sem `unicode-range`**: o nome do ícone é renderizado como texto e virado em glifo por ligadura, então restringir o range ao PUA faria as letras latinas não usarem a fonte e **todo ícone sairia escrito**). O acesso é por um primitivo `Icon` com o nome do desenho — o que mantém a lista de símbolos num só lugar e permite trocar a implementação sem tocar em tela. O `react-icons` continua instalado (o `RestaurantStatus` o usa) e sai na task 12 se não sobrar uso.
- **O Painel é a variação C do desenho** (escolha do dev): bloco de estado grande, três números numa faixa e as impressoras como chips. As variações A e B ficam no arquivo do desenho como alternativa registrada, não como dívida.
- **Histórico e Fila leem a mesma fonte** (`usePrintQueue`), separados só por `status` e por recorte de tempo (RN-08). Não há segundo armazenamento, nem `useEffect` com `setInterval` lendo arquivo: o `onQueueChanged` já avisa.
- **Descartar e reimprimir são dois canais novos, não um `rawPrint` montado no renderer.** `queue:discard` remove o trabalho do arquivo; `queue:reprint` devolve o trabalho existente para `pending` com as tentativas zeradas. Os dois recebem `id` e nada mais — o payload com o HTML nunca sai do main (RN-09).
- **O `copies` entra no `PrintJobSummary`.** É o único campo do `payload` que a tela precisa (o Histórico mostra "2×"), e expor um número não é expor o comprovante.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Paleta, marca e fonte de ícones | [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39) | [39-palette-brand-and-icons.md](./tasks/39-palette-brand-and-icons.md) | — | executada |
| 02 | Tema claro/escuro seguindo o Windows | [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40) | [40-system-theme-and-preference.md](./tasks/40-system-theme-and-preference.md) | 01 | executada |
| 03 | Shell com sidebar, cabeçalho e navegação | [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41) | [41-app-shell-and-navigation.md](./tasks/41-app-shell-and-navigation.md) | 01, 02 | executada |
| 04 | Login redesenhado em duas etapas | [#42](https://github.com/sgrande-delivery/delivery-printer/issues/42) | [42-login-two-step-redesign.md](./tasks/42-login-two-step-redesign.md) | 01 | executada |
| 05 | Telas de estado e toast | [#43](https://github.com/sgrande-delivery/delivery-printer/issues/43) | [43-state-screens-and-toast.md](./tasks/43-state-screens-and-toast.md) | 01, 03 | executada |
| 06 | Painel (variação C) | [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44) | [44-dashboard-variant-c.md](./tasks/44-dashboard-variant-c.md) | 03 | executada |
| 07 | Fila de impressão, com descartar | [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45) | [45-print-queue-screen.md](./tasks/45-print-queue-screen.md) | 03 | executada |
| 08 | Histórico de hoje, com reimprimir | [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46) | [46-history-screen-and-reprint.md](./tasks/46-history-screen-and-reprint.md) | 03, 07 | executada |
| 09 | Impressoras: cartões e gaveta de edição | [#47](https://github.com/sgrande-delivery/delivery-printer/issues/47) | [47-printers-cards-and-drawer.md](./tasks/47-printers-cards-and-drawer.md) | 03 | pendente |
| 10 | Configurações de impressão e aparência | [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48) | [48-printing-settings-and-appearance.md](./tasks/48-printing-settings-and-appearance.md) | 02, 03 | pendente |
| 11 | Teste de impressão como tela própria | [#49](https://github.com/sgrande-delivery/delivery-printer/issues/49) | [49-test-print-screen.md](./tasks/49-test-print-screen.md) | 03, 09 | pendente |
| 12 | Limpeza dos tokens antigos e a regra da UI | [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50) | [50-token-cleanup-and-ui-rule.md](./tasks/50-token-cleanup-and-ui-rule.md) | 01–11 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

`01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12`

O porquê das dependências:

- **01 primeiro** porque todo o resto consome token, ícone e marca. É a única task sem tela: ela não deve mudar aparência nenhuma além das cores, e isso é proposital — se mudar layout, o diff das próximas fica ilegível.
- **02 antes de 03** porque o shell é a primeira coisa que fica errada no tema escuro (a sidebar já é escura no tema claro) e porque o `titleBarOverlay` precisa de dono antes de a janela ganhar cabeçalho próprio.
- **03 antes das telas** porque é ele que cria as rotas, e tela sem caminho até ela é tela morta. É também a task que sobe os hooks de impressão — a partir dela, navegar deixa de derrubar socket.
- **04 pode rodar em qualquer ponto depois de 01** (o login é a única tela fora do shell); fica aqui para o dev ver a primeira tela pronta cedo.
- **07 antes de 08** porque as duas mexem no `PrintJobSummary` e nos canais da fila; em ordem, a segunda já encontra o terreno arrumado.
- **09 antes de 11** porque a tela de teste reaproveita a lista de impressoras com a conferência de device que a 09 deixa pronta.
- **10 depois de 02** porque é nela que o alternador de tema ganha o lugar definitivo (a 02 o deixa na tela antiga, funcionando).
- **12 por último**, e ela é a que torna a entrega honesta: apaga os apelidos de token, remove o que ficou órfão e reescreve `.claude/rules/renderer-ui.md`, que hoje descreve uma UI que não existirá mais (tokens do MUI, "duas rotas", "não existe nenhum componente de navegação").

## Dependências de outros repos

**Nenhuma.** Medido campo por campo em 2026-10-28, contra os tipos que este app já declara:

| O que o desenho mostra | De onde vem | Já existe? |
| --- | --- | --- |
| Cópias de produção e expedição, fonte, margem, sem margem, largura máxima | `GET`/`PUT /printerSettings` → `PrinterSetting` (`types/restaurant.ts:8-16`) | sim, os seis campos do desenho batem um a um |
| Nome, setor, cópias, bobina e ativa da impressora | `GET`/`PUT /printers` → `Printer` (`types/printer.ts`) | sim |
| Tipo do comprovante (Produção, Expedição, Mesa, Conta da mesa) | `PrintJobKind` (`shared/printQueue.ts:5`) | sim, tradução local |
| Pedido, hora, tentativas, causa da falha | `PrintJobSummary` | sim |
| Cópias no histórico, instante da próxima tentativa | `PrintJob.payload.copies` e o `nextAttemptAt` do worker | **não cruzam o IPC hoje** — tasks 07 e 08, e é mudança **deste** repo |
| Restaurante, loja aberta, usuário | `providers/auth.tsx` (`GET /users/me`) | sim |

Ou seja: **não há spec a abrir na `delivery-api`, no `delivery-socket-api` nem no `delivery-admin`**, e não há ordem de deploy a respeitar. O indicador "online" que o painel mostra continua vindo do `printer_ping` de sempre, inalterado.

**Uma leitura de referência, que não é dependência:** a task [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48) precisa conferir no `delivery-admin` (`pages/printer-settings/PrinterSettingsForm.tsx`) os conjuntos de valores das configurações e o destino do `max_width` — porque o formulário daqui já segue os do painel de propósito, e a API **não valida nada** (`PrinterSettingsForm.tsx:29-31`). É leitura de código de lá, não mudança lá, e nada bloqueia. Confirmar o remoto com `git -C <diretório> remote get-url origin` antes de citar arquivo ou linha, e não presumir `master` como branch de integração.

Duas coisas de outros repos que a frente **não** resolve e nem tenta: o `printer:status` por impressora (task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25), presa em `delivery-socket-api#50`) e o comprovante de pedido v2 sair sem complementos, que se conserta no renderizador da `delivery-api`.

## Verificação da entrega

Além de `npm run typecheck`, `npm run lint` e `npm test` em cada task:

- **Comparação lado a lado, por tela, em `npm run dev`** — o desenho renderizado no Claude Design de um lado, o app do outro. É o critério de fidelidade (RN-15), e é humano: nenhum teste pega "o raio ficou 8 px em vez de 10".
- **Tema:** trocar o tema do Windows com o app aberto (Configurações → Personalização → Cores) e ver o app e os botões nativos da janela acompanharem, sem reiniciar. Depois fixar claro, fechar pela bandeja, reabrir, e conferir que continuou claro.
- **Sem internet:** desligar a rede da máquina e abrir o app. Login com logo, shell com ícones, nenhum quadrado vazio nem glifo faltando. Com o DevTools na aba Network, zero requisição a domínio externo.
- **Impressão sobrevive à navegação:** com o app na tela de Impressoras, emitir `printOrder` e ver o comprovante sair. É o conserto da falha 1 do contexto da spec, e vale um teste de montagem/desmontagem além do olho.
- **Fila e histórico contra a fila real:** desligar a impressora, deixar um trabalho falhar as cinco tentativas, conferir a aba Falhados, o "Tentar de novo" e o "Descartar"; religar, imprimir, e conferir o Histórico e a reimpressão.
- **Não encosta em empacotamento nem em autoupdate** — exceto o peso da fonte de ícones no bundle, que a task 01 mede e reporta (o baseline é 518 kB).

## Aprendizados que valem para as próximas tasks

### A rede contra chave de CSS Module estava morta (task 01)

`expectNoUndefinedClasses()` **não podia falhar** como o repo estava configurado, e a regra `.claude/rules/renderer-ui.md` o chama de "o único jeito de o erro aparecer antes do PDV". Medido em 2026-10-28:

| Expressão | `css` desligado (como estava) | `css: { include: [/\.module\.css$/] }` |
| --- | --- | --- |
| `styles.chaveQueNaoExiste` | `"_chaveQueNaoExiste_1809c2"` | `undefined` |
| `class` no DOM | `"_naoExiste_… outra"` | `"undefined outra"` |
| o helper falha? | **não** | **sim** |

O Vitest sem processar CSS devolve um nome **hasheado para a classe inexistente** — plausível, truthy, e invisível para um helper que procura a palavra `undefined`. A linha entrou no `vitest.config.ts` na task 01, com a suíte medida antes e depois: **213 de 214 passando nos dois casos**, mesma falha pré-existente.

**Consequência para as 11 tasks seguintes:** o critério "componente novo com estilo entra em teste que chama `expectNoUndefinedClasses()`" agora **vale de verdade**. Mantenha-o.

### `cx()` esconde o mesmo defeito, e o helper não o pega (task 01)

`cx()` descarta falsy (`src/renderer/base/cx.ts`), então `cx(styles.tipoErrado)` devolve **string vazia**, não `"undefined"` — a classe simplesmente não aparece, e nem o helper nem a tela acusam. Verificado por mutação: trocar `styles.icon` por `styles.ikon` no `Icon` derruba **1** teste, e é o que **afirma que a classe está presente**, não o do helper.

**E a task 02 mostrou que é pior:** em `className={styles.chaveErrada}` **direto**, sem `cx`, o React **omite o atributo** — não existe `class="undefined"` para o helper achar. Medido: duas chaves do `AppearanceSection` passaram a mutação com 41 e 17 testes verdes, até as afirmações de presença entrarem.

**Portanto, e isto vale para as dez tasks restantes:** o `expectNoUndefinedClasses()` só cobre **concatenação** (`` `${styles.x} y` ``). Para `cx(...)` e para `className={styles.x}` direto, o teste tem de **afirmar que a classe esperada está presente**, contra `styles.<chave>` e nunca contra substring literal — `toContain('icon')` é satisfeito por `iconButton`. Uma chave por elemento que importa, não só a `root`.

### A piscada de tema na abertura, e por que `backgroundColor` não a conserta (task 02)

A janela só aparece em `ready-to-show` (`src/main/window.ts`), o que já cobre o frame branco **antes** da primeira pintura — que é o único instante que `backgroundColor` pinta. A piscada que sobra é outra: a primeira pintura **já é** o React em claro (o `body` usa o `--bg` do `:root` e o `data-theme` ainda não existe), e o atributo só entra depois do `useEffect` mais a ida e volta do `ui:theme`.

Então `backgroundColor` derivado do tema é brinde legítimo (é o que o Windows pinta na área nova ao redimensionar), mas **vendido como conserto da piscada seria cargo cult**. O conserto de verdade é o tema chegar ao renderer **antes da primeira pintura**, e o main já o sabe no construtor: `webPreferences.additionalArguments: ['--ui-theme=' + resolved]`, o preload expondo isso de forma síncrona e o provider semeando o `useState` com ele. Mexe no contrato do preload, então merece teste próprio.

**Decisão:** fica medido e não feito. A task 03 é quem passa a ter shell inteiro piscando em branco, e é ela que decide se paga o conserto.

### Entre a task 02 e a task 03, duas telas ficam 6 px fora (task 02)

O `titleBarOverlay` foi de 50 para 56 px, e há **duas barras de título falsas** que espelhavam o valor antigo: `src/renderer/components/main/Main.module.css:1-15` e `src/renderer/components/printers/Printers.module.css:8-21`, as duas com `height: 50px; background: white; color: #222`. Consequência até a task 03 reescrevê-las: os três botões nativos passam 6 px abaixo da barra, e **no tema escuro as telas `/` e `/printers` mostram barra de título branca com texto escuro**. É consequência aceita da ordem do plan (02 antes de 03, porque o overlay precisa de dono antes de a janela ganhar cabeçalho próprio) — mas não pode ficar calada no relatório.

### A fonte de ícones não usa `liga` (task 01)

As ligaduras do recorte vivem num *extension lookup* (GSUB tipo 7) nas features **`rlig`** e **`rclt`**. O desenho declara `-webkit-font-feature-settings: 'liga'`, que para esta fonte é inerte: quem liga os ícones é o `rlig`, *required*, que o Chromium aplica por padrão. Ferramenta que lê ligadura por `liga` (o `opentype.js`) reporta **zero** nesta fonte, o que é limitação dela. Detalhes em `src/renderer/fonts/README.md`.

### O contrato de composição de rota mudou, e a skill `add-screen` mandava quebrá-lo (task 03)

O `ProtectedRoute` virou **rota de layout**: ele renderiza `<Outlet/>` dentro do `AppShell`, e as seis telas são filhas dele. Isso não é estilo — **envolver uma tela num `ProtectedRoute` próprio remonta o `AppShell` a cada navegação**, e o cleanup dos hooks de socket derruba a conexão. Era o defeito que esta spec consertou, e subir os hooks não bastava: com um `ProtectedRoute` por rota, o `disconnect()` rodava de qualquer jeito.

Para as nove tasks que criam tela:

- a rota entra **como filha** do `ProtectedRoute` que já existe. Nunca aninhe um segundo;
- a tela **não monta hook de socket** (`useAdminSocket`, `useOrderSocket`, `useBoardSocket`, `usePrintingOrder`, `usePrintingBoard`). O `AppShell` é o dono único (RN-06); quem precisa saber da conexão lê `useShellConnection()` de `components/layout/shellConnection.ts`;
- a tela **não põe título, padding nem região de arraste**: o cabeçalho do shell dá o título (mapa em `components/layout/navigation.ts`), o `.content` dá o `padding: 24px 28px`;
- a entrada é um item em `NAV_ITEMS` **e** no mapa de títulos — faltar no segundo dá tela com título vazio.

**A skill `.claude/skills/add-screen/SKILL.md` foi corrigida nesta task**, e isso era urgente: ela é carregada automaticamente quando alguém cria tela, e mandava, literalmente, `<Route path="/x" element={<ProtectedRoute element={<XScreen />} />} />`. Nove tasks desta spec criam tela; seguir a skill desfaria o conserto. Ela também afirmava que "não existe nenhum componente de navegação neste app", que havia "duas rotas", que o `ProtectedRoute` tem `const authenticated = true` (falso desde a task #5) e que o `expectNoUndefinedClasses` é "a única rede" contra chave errada (falso, ver abaixo).

### O `expectNoUndefinedClasses()` é inerte onde não há concatenação (task 03)

O aprendizado da task 02 chegou ao limite: nos três componentes do shell **não existe uma única concatenação de classe** — tudo é `cx()` ou `className={styles.x}` direto. Resultado medido: **27 das 41 chaves** não tinham rede nenhuma, inclusive as estruturais (`AppShell.root`, que é o `display:flex` sem o qual sidebar e conteúdo empilham; `Sidebar.root`, que são os 216 px; `Sidebar.item`, que são os 40 px e as cores de todos os itens de menu). As três chamadas do helper **não podiam falhar por chave nenhuma**.

A rede entrou como 15 afirmações de presença, e a varredura por mutação confirma: cada uma das 15 chaves derruba ao menos um teste. **A regra prática, que vale para as nove tasks restantes:** o helper é piso, não rede. Afirme presença nas chaves que carregam o layout.

### Dois bugs em código já commitado, e a classe deles é o achado de processo da spec (task 08)

**Bug 1: o "Impressos hoje" do Painel mostrava zero no app real.** O `onQueueState` filtrava os impressos, **com um comentário justificando** ("the deduplication ledger … have no reader in the renderer"). Era verdade até a task 06 criar o leitor e **não tocar no handler**. Os testes passaram porque **mockam o canal**.

**Bug 2: reimprimir disparava `PATCH /orders/:uuid/printed`.** O worker emite `onPrinted`, o `usePrintingOrder` reage marcando na API, e a RN-09 diz que nenhuma requisição sai. Consertado com um `Set` de reimpressões em voo — e o review achou o furo do conserto: ele valia também para job **falhado**, cuja reimpressão é a **primeira** impressão que funcionou, e que portanto **precisa** marcar. Hoje o `requeue` devolve `'requeued-printed' | 'requeued-failed'` e só o primeiro suprime.

**A classe é "a ficção autoconsistente", e esta base já a documentou na task #21.** O renderer lê algo que o main não manda, todo teste mocka a borda, a suíte fica verde e a feature está morta. Três camadas não pegaram: implementador, review e eu.

**O que o review mediu sobre a extensão do problema**, e que vale mais que os dois bugs:

- **nenhum teste deste repo pode pegar nome de canal divergente.** O `setup.ts` substitui `window.electron` inteiro, nenhum teste importa o `preload.ts` nem o `main.ts`, e os testes do main chamam os handlers **direto**. O `grep` que a `printing.md` prescreve é o **único** gate;
- pior nos quatro canais main→renderer, cujo nome é **literal duplicado em dois arquivos** sem constante compartilhada (`queue:job-printed`, `queue:job-failed`, `queue:changed`, `app:before-quit`, `ui:theme-changed`). Renomear só o literal do preload deixa a suíte verde e a tela congelada. **`src/shared/ipcChannels.ts` está endereçado à task 12**;
- o antídoto já existe e é o modelo: `queue-ipc.test.ts` roda o **store real sobre arquivo real** mais o handler real, sem mock na borda. **Repetir nas tasks 09 a 11**;
- varredura do resto da spec: `copies`, `nextAttemptAt` e `reprintable` têm produtor real e teste sem mock. O `initialTheme` **não é ficção** (os dois lados usam a mesma função), mas **não está provado** em Electron real — se `additionalArguments` não chegar ao `process.argv` do preload, degrada para claro em silêncio. **Só `npm run dev` fecha isso.**

### O custo de ler a fila, medido (task 08)

Com o arquivo realista (200 trabalhos, 20 deles com 10 kB de HTML): arquivo de **253 kB** (era ~55 kB, porque impresso não guardava HTML), `list()` + parse em **0,44 ms**, 200 summaries serializados em **54 kB** e **0,13 ms**, poda em **1,59 ms**.

No pior caso composto com a task 07 (20 jobs falhando = 120 anúncios/min) e com os **dois** `usePrintQueue` montados: **240 invokes/min**, ~0,14 s de CPU do main por minuto nesta máquina, ~13 MB/min de clone estrutural. Num PDV fraco, ~5×: ~1% de um núcleo. **Aceitável — não precisa de paginação no handler.** A mitigação barata, quando incomodar, é a que o plan já pede por outro motivo: **um `usePrintQueue` só, compartilhado**, que corta tudo pela metade.

### Reimprimir faz a linha sumir do Histórico, e pode apagar o registro do original (task 08)

O trabalho reimpresso volta a `pending` (mesmo `id`, que é a chave da deduplicação), então **some do Histórico até imprimir de novo** e o resumo cai 1 nesse intervalo. Pior: **se a reimpressão falhar as cinco tentativas, a linha volta como "Falhou"**, apagando da tela o registro de que o comprovante original saiu.

É consequência direta de "reimprimir não cria `id` novo", que é o que impede impressão duplicada. Fica declarado; mudar exigiria um registro de histórico separado da fila, que a RN-08 não quer.

### Varredura por mutação precisa provar a restauração (task 08)

O review desta task deixou **resíduo**: a chamada de `useMidnightTick()` sumiu do `useDashboardHealth` (a mutação "tirar o tique do Painel") e não voltou, embora o relatório afirmasse que a árvore estava idêntica. **Quem pegou foi o `tsc`**, pelo import órfão — se o import tivesse sido removido junto, a suíte teria ficado verde com a feature morta, que é a mesma classe do bug 1.

**Regra para quem varrer:** restaurar por cópia de backup **e conferir com `git diff`** ao fim, não por afirmação. E rodar `npm run typecheck` depois da varredura, não só a suíte.

### A spec afirmou uma premissa que o código desmentia, e o subagente parou certo (task 08)

A RN-09 e a task 08 diziam que a fila guarda os impressos "com o HTML no payload". **Falso:** `markPrinted` fazia `payload: { ...job.payload, content: '' }`, com teste afirmando, por decisão da spec 15 — o HTML é a parte pesada do arquivo. Seguir a task ao pé da letra entregaria um botão "Reimprimir" que **imprime página em branco e a marca como impressa**, e o teste "mantém o payload original" **passaria**, porque o payload original já era vazio.

**Erro meu, na escrita da spec:** li o cabeçalho do store e o validador `isPrintJob`, não o `markPrinted`. A premissa entrou como RN, que é o lugar mais caro para uma premissa errada — justamente o que a instrução do `/create-spec` diz ("premissa que não está escrita em lugar nenhum não pode ser questionada, então vira bug").

**O subagente parou e perguntou, e isso foi o certo.** O `CLAUDE.md` manda não parar por falta da outra ponta, mas **premissa contradita é motivo legítimo de parada**: quem decide qual lado muda é o dev. Ele entregou a parte que não dependia da decisão (o tique de meia-noite) e deixou o resto.

**Como não repetir:** RN que afirma comportamento de código existente precisa da linha conferida, não do cabeçalho do arquivo. Quando a spec disser "X guarda Y", abra a função que grava.

### A política de anúncio da fila foi revertida, e isso é a mudança mais sensível da spec (task 07)

O worker **passou a anunciar `queue:changed` entre as tentativas**, não só nas transições. Antes havia comentário dizendo o contrário ("no announcement between attempts"), e o motivo da mudança é legítimo: sem ela a tela da fila nunca mostraria "2/5" nem a contagem para a próxima tentativa.

**Medido pelo review, com sonda descartável:** 20 jobs com a impressora sempre falhando dão **120 anúncios** contra 40 antes (20 do enfileiramento + 80 entre tentativas + 20 da falha final), espalhados pela janela de backoff de ~60 s. E **cada anúncio custa duas leituras completas do NDJSON**, não uma, porque o `usePrintQueue` está montado na sidebar (badge) **e** na tela — o arquivo que carrega o HTML de todos os comprovantes. Aceitável (o `drain` já lê o arquivo por tentativa), mas não é grátis.

**Não há risco de laço, e isso é verificável:** `queue:changed` tem um consumidor só, e o handler é leitura pura (`list()` + um `Map.get`). Nenhum caminho reentra em `enqueue`, `kick`, `drain` ou `printReceipt`.

**O furo que o review achou no "é limitado":** se o store falha ao gravar (disco cheio, permissão), `attempts` nunca cresce, o job nunca chega a `failed` e o laço de 2 s é infinito — isso é **pré-existente** — mas com o anúncio fora do `try` cada volta anunciava: 62 anúncios em 120 s, para sempre. Corrigido movendo o `announce()` para dentro do `try`, depois do incremento.

**A `.claude/rules/printing.md` está afirmativamente errada**, e já estava antes desta task: ela diz *"O estado é volátil. Não há banco nem arquivo de fila: fechar o app perde o que estava em voo"*, quando a spec 15 entregou a fila durável. Agora ela também ignora a política de anúncio, o `nextAttemptAt` em memória e o canal `queue:discard`. **Merece seção própria**, e está endereçada à task 12.

### A ordem das linhas divergiu do desenho, e na task 08 a divergência se inverte (task 07)

A Fila lista na **ordem do arquivo** (mais antigo primeiro); o desenho faz `[novo, ...pendentes]` (`:655`), pondo o reimpresso no topo. A leitura do review, que eu aceito: o `[novo, ...]` do mock é artefato da simulação, o desenho não declara ordenação para a lista, e a ordem do arquivo é **a ordem em que o worker vai imprimir** — FIFO é mais verdadeiro que "mais novo em cima". Fica como está.

**Mas a RN-15 nomeia "ordem dos elementos"**, e exige corrigir ou registrar. Registrado aqui.

**Aviso para a task 08:** lá o desenho **é explícito** (`history: [{novo}, ...s.history]`, mais recente em cima) e a ordem do arquivo daria o contrário. No Histórico, ordenar por tempo decrescente é fidelidade **e** é o que o operador espera.

### O limite da rede de classes: ela pega o erro real, não o renome do CSS (task 07)

Medido: `toHaveClass(undefined)` **passa em silêncio** quando o elemento tem outra classe. Foi por isso que renomear `.grid` no `.module.css` sobreviveu à suíte inteira (a linha ainda tinha `styles.row`), enquanto renomear `.title` foi pego (aquele elemento não tinha outra classe).

Ou seja, a rede de presença cobre **erro de digitação na TSX**, que é o caso real que morde no PDV, e **não** cobre renome do lado do CSS. É extensão dos aprendizados sobre o `expectNoUndefinedClasses`: a afirmação de presença é melhor que o helper, e ainda assim não é prova.

### No Node 18 o lint estoura e sai 0 — parece limpo (task 07)

Vizinho do aprendizado do `tail`: no Node 18, que é o **default do shell desta máquina**, `npm run lint` morre com `TypeError: util.styleText is not a function` dentro do formatter e **termina com código 0**. Quem não rodar `nvm use` antes vê "lint limpo" sem lint nenhum ter acontecido.

Juntando os dois: a verificação honesta de lint é `nvm use` **e** ler a linha de resumo.

### Conferir lint com `tail` esconde o resumo — e um commit desta spec subiu vermelho (task 06)

**Falha do meu processo, medida depois:** o commit da task 05 (`ca3ae02`) subiu com **1 erro de lint** (`prettier/prettier`, linha de 124 colunas num arquivo de teste). Eu verifiquei com `npm run lint | tail -1`, que cortou a linha `✖ 2 problems (1 error, 1 warning)` e me devolveu vazio — li "vazio" como "limpo". O `.github/workflows/ci.yml` roda `npm run lint`, então **o PR da spec iria vermelho** até a task 06 consertar de passagem.

**O método correto:** ler a linha de resumo e a contagem de erros, nunca o `tail`:

```bash
npm run lint 2>&1 | grep -E "problems?|error" | tail -2
```

O baseline honesto desta spec passa a ser: **0 erros e 1 aviso** (`react-hooks/set-state-in-effect` em `Login.tsx:22`). Erro de lint **quebra o CI**; aviso não.

### Função pura + hook de duas linhas é o padrão a repetir (task 06)

`buildDashboard()` é exportada como função pura e o `useDashboardHealth` é só a casca que liga `usePrintQueue` e `usePrinters` a ela. Foi isso que permitiu **dez mutações de comportamento** testadas sem timer, sem `renderHook` e sem mock de React — precedência, recorte de data, plural, guarda de `devicesRead`, escolha do último comprovante, capitalização. O review confirmou zero sobreviventes.

**Repita nas tasks 07 a 11:** a lógica que decide texto, cor e destino sai do componente e vira função pura testável; o hook só injeta os dados.

### A escala de tamanho do `Button` não escala, e a recomendação é concreta (task 06)

São cinco valores (`medium`, `small`, `large` 46, `action` 42, `hero` 48), três criados um por task, e as tasks 09 a 11 trazem 34, 36, 38 e 44. Hoje `large`/`action`/`hero` diferem **só** em altura, padding e fonte, mas cada um duplica raio, peso, `text-transform`, `line-height` **e** dois blocos (`.X.containedPrimary` e o `:hover`), mais os remendos `.action.outlined`/`.large.outlined`. Com as alturas que faltam isso vai a sete blocos × três regras, e os nomes que sobram são de tela (`field`, `row`, `drawer`).

**Recomendação medida, para a task 12, nas duas partes juntas:**

1. **uma classe-base compartilhada** por todos os tamanhos do desenho (raio 8, semibold, `text-transform: none`, `line-height: 1`, `--accent`/`--accent-hover`), mantendo `medium`/`small` como o par legado do MUI — é isso que mata a duplicação de `containedPrimary`/`hover`, onde está o custo real;
2. **trocar o nome semântico pela altura, como união fechada:** `size?: 34 | 36 | 38 | 42 | 44 | 46 | 48`, com a tabela `Record<ButtonSize, { height; paddingX; fontSize }>` **dentro** do primitivo, aplicada por `style` — exatamente o precedente aprovado do `Icon` (`size?: number` + `style={{ fontSize }}`), justificado na task 01 por "o desenho usa dezenas de tamanhos". A união fechada impede inventar 51 px, e a tabela guarda o par altura/padding que o desenho define (28/20/18/16/12), então o padding não volta como override no consumidor.

**Não** usar prop numérica livre (`height={48}`): perde o conjunto fechado, que é o que segura a RN-15.

### O `Chip` nasceu com duas escolhas que a task 07 vai ter de desfazer (task 06)

O primitivo foi extraído e os dois chips existentes retroajustados (conferido pixel a pixel no review). Mas:

- **`.medium` embute o padding assimétrico `0 10px 0 6px`**, que é do caso "ícone na frente" (o chip de voltar, `:450`). Os chips de filtro da Fila (`:232`) e os de setor (`:404`) são 32 px com `padding: 0 12px` **simétrico** — padding assimétrico é propriedade do conteúdo, não do tamanho;
- **`.neutral.medium` acopla cor a tamanho** (`color: var(--text-2)`), e o chip de filtro quer `--text` no mesmo tamanho. Um `tone="muted"` resolve sem acoplar;
- **`ChipProps` não espalha `...rest`**, então chip-botão não aceita `aria-label`, `disabled` nem `aria-pressed` — e os chips de setor da task 09 são **seleção**, com estado selecionado no desenho, que `tone: neutral|ok|err` não expressa.

Quem estender, estende **o primitivo**, não sobrepõe classe na tela.

### "Hoje" congela na virada do dia (task 06)

A meia-noite é calculada a cada render, e o Painel só re-renderiza quando a fila muda, o socket conecta ou o restaurante muda de estado — o `printer_ping` de 30 s **só emite**, não mexe em estado. Numa noite calma o app atravessa a meia-noite mostrando o número de ontem e citando o comprovante de ontem como "último".

Não bloqueou a task 06 porque o erro é só na direção "número maior", a fila descarta o que passa de 24 h e nada é decidido a partir do número. **Conserto recomendado na task 08**, que tem o mesmo filtro e onde um "hoje" velho é pior: um `useMidnightTick()` em `renderer/hooks/`, usado pelo Painel **e** pelo Histórico. Use `setInterval` de 60 s, **não** `setTimeout` para a próxima meia-noite: o PDV suspende de madrugada, e um timeout de 7 h acordado pelo resume dispara tarde.

### Duas perdas e uma inconsistência observáveis, todas por fidelidade ao desenho (task 06)

- **O logo e o nome do restaurante desapareceram do app.** A variação C não os tem (só a B, `:143`, que está fora de escopo). É fiel ao desenho escolhido, mas é informação que o operador tinha e deixou de ter; o estado da loja segue na sidebar;
- **entre a task 06 e a 07 não há como tentar de novo pela UI:** o `Status` tinha "tentar de novo" e o Painel manda para `/queue`, que é esqueleto. O worker segue tentando sozinho (5 tentativas), então nada para de funcionar;
- **política de `role="alert"` inconsistente:** o Painel **não** alerta no estado de atenção (impressora não encontrada), enquanto o `PrinterItem` anuncia o mesmo assunto com `role="alert"`. Decisão de produto, a resolver quando a task 09 tocar o cartão.

### O bundle desta task é negativo (task 06)

JS do renderer **595,71 → 592,06 kB (−3,65)**, CSS **32,63 → 32,56**, módulos **235 → 227**: o Painel, o `Chip` e o hook custam **menos** que o `Status`, o `RestaurantStatus` e o ícone do `react-icons` que saíram. E `grep -rn "react-icons" src/` dá **zero** — a dependência só ocupa o `package.json`, e sai na task 12.

### CSS Module não consegue apontar para um `@keyframes` global, e falha calado (task 05)

Medido com o `node_modules` deste repo, num `vite build` de sonda:

| Dentro de um `.module.css` | Resultado |
| --- | --- |
| `animation: 900ms :global(spin) …` | **erro de parse** do postcss |
| `animation-name: :global(spin)` | **erro de parse** |
| `animation: spin …` com o `@keyframes spin` global | **compila e morre calado**: o CSS emitido vira `animation:_spin_or8z5_1`, e esse keyframe não existe |
| `@keyframes` **dentro** do módulo, referenciado no mesmo módulo | funciona (os dois são renomeados juntos) |

A terceira linha é a armadilha: animação parada, sem erro, sem aviso. As duas saídas são o keyframe **e** a classe que o usa no `app.css` (foi o que a task 05 fez, com `.spin`), ou keyframe e referência dentro do mesmo módulo. **Compartilhar animação entre módulos exige o global.**

### O `ErrorBoundary` está acima dos providers, e isso tem três consequências (task 05)

Ele é o nó mais externo do `App.tsx`, então: **não pode usar `useTheme()`** (daí a moldura própria, em vez do `StateLayout`) e **não pode usar `useMessaging()`** (daí o aviso inline com `role="status"`). Mas **os tokens de cor funcionam**, porque o `index.tsx` escreve o `data-theme` no `<html>` antes do `root.render` e os tokens vivem em `:root`, que é DOM e não contexto. Para escolher o símbolo claro/escuro basta ler `document.documentElement.dataset.theme` — foi o que a correção do review fez, e é por isso que a barra da tela de erro pôde ganhar a marca sem provider nenhum.

Consequência que é comportamento correto: ao estourar, os filhos desmontam junto com o `ThemeProvider`, então a tela de erro **congela no tema do instante do erro** e não acompanha troca do Windows depois disso.

### O retry automático funciona, mas requisição pendurada ainda trava o app (task 05)

Traçado e provado com timers falsos: `retrySession` põe `sessionStatus` em `loading`, o `NoConnection` desmonta, a tentativa dispara, e no erro ele remonta zerado em 12 s — o laço se mantém (`GET /users/me` em t=0, 12, 24, 36 s) e, quando a rede volta, a tela protegida aparece **sem ninguém clicar**.

**O furo que sobra:** se a requisição **pendura** em vez de falhar (Wi-Fi associado sem rota, o *black hole* clássico de PDV), o app fica em "Conectando ao servidor…" para sempre e não há segunda tentativa — `services/api.ts` cria o axios **sem `timeout`**. Medido: 120 s avançados, 2 chamadas no total.

Não é regressão desta spec (o botão manual tinha o mesmo destino) e o conserto é política de rede do app inteiro: **merece task própria**, junto com o `history.push` do interceptor que a regra da UI já lista como dívida.

### Dois desvios de acessibilidade herdados do desenho (task 05)

Medidos, e nenhum é defeito de implementação — os dois vêm de seguir o desenho e a task 01:

- **`--muted` no tema claro** (`#857a74` sobre `#faf7f5`) dá **3,91:1**, abaixo dos 4,5:1 de AA. É o token da frase da sessão e da contagem regressiva, em 12 e 13 px. No escuro fica 5,06:1;
- **texto sem tamanho explícito sai em 14 px**, não nos 16 px do desenho, porque o `app.css` tem `body { font-size: 0.875rem }` herdado do MUI.

Os dois são assunto da **task 12**, que varre o `app.css` — e a decisão ali é entre fidelidade ao desenho e AA, que é decisão de produto, não de limpeza.

### A varredura por mutação, do jeito que funciona neste shell (task 05)

O shell desta máquina é **zsh**, que **não faz word-splitting** em `$VAR` sem aspas: `npm test -- $PATHS` com dois caminhos numa variável vira **um** filtro só, nenhum arquivo casa, e toda mutação parece "sem rede". Passe os caminhos literalmente (ou use `${=VAR}`). Perdi uma rodada inteira com isso.

E a regra que já valia: **exclua o `src/__tests__/ui.test.tsx`** da varredura, porque a falha pré-existente dele faz toda mutação parecer "pega".

### O helper de label do testing-library ignora `button`, mas não ignora `aria-hidden` (task 04)

Isto é a armadilha mais caras para as tasks 09 e 10, que montam formulário — e eu mesmo a descrevi errado no briefing da task 04, até o review medir.

O `getTextContent` do `@testing-library/dom` devolve `''` para nós `button`, mas **não** filtra `span` nem `aria-hidden`. Consequência prática, com um campo que tem ícone à direita:

- ícone dentro de um `<button>` (o olho da senha): label envolvente **funciona**, `getByLabelText('Senha')` passa;
- ícone como `<span aria-hidden>` decorativo (o `person` do e-mail): label envolvente **quebra** — o nome acessível vira `'E-mailperson'`, porque o texto da ligadura do `Icon` conta no `textContent`.

**Portanto:** `<label htmlFor>` **irmão** do campo, nunca envolvente, sempre que houver ícone decorativo dentro da caixa. E "não envolver por causa do botão" é a razão **errada**: quem vaza é o span.

Bônus medido no mesmo ponto: o markup do desenho é **HTML inválido** aqui (`:452-457` põe `<input>` e `<button>` dentro do mesmo `<label>`, e `button` é *labelable*, o que o content model do `label` proíbe). O irmão com `htmlFor`/`id` é o jeito válido de reproduzir o desenho — divergência de markup que **não** é divergência de aparência.

### O primitivo `Chip` ainda não existe, e a terceira pílula chega na task 06 (task 04)

O chip de conexão do shell (task 03) e o chip de voltar do login (task 04) são duas "pílulas" com a mesma forma e nenhuma abstração. O `plan.md` promete um `Chip` em `base/`, e o critério da casa é o padrão aparecer em dois lugares — já apareceu. As tasks 06 (chips de impressora, `:177-180`) e 09 (chips de setor) trazem mais: **extraia o `Chip` na primeira delas e retroajuste estes dois**, senão a task 12 não tem o que documentar.

### PNG abaixo de 4 kB entra inlinado no JS (task 03)

**Números acumulados, sempre medidos contra worktree limpa no `HEAD` da task anterior:** task 01 não mexeu no JS (+1,39 kB de CSS); task 03 levou o JS de 560,93 a 591,52 kB e o CSS a 25,59; task 04 somou +0,35 kB de JS (o código novo quase empata com a saída de três ícones do `react-icons`) e +2,74 kB de CSS, e passou a emitir o `logo-horizontal-negativo.png` como asset, porque os 12 kB dele estão acima do limite de inline.

O `assetsInlineLimit` default do Vite é 4 kB, e os dois símbolos da marca (3 730 e 3 821 bytes) ficam **embutidos em base64 no bundle do renderer** — nenhum `.png` é emitido em `out/renderer/assets/`. São ~10 kB dos +30,6 kB de JS desta task. O `logo-horizontal-negativo.png` (12 kB) e o woff2 (20,9 kB) passam do limite e saem como arquivo. Não é problema; é como ler o número do bundle sem se assustar.

### Dívidas transitórias que as próximas tasks fecham (task 03)

Nenhuma é defeito novo; todas somem quando a tela dona for redesenhada, e nenhuma pode ficar calada:

- **na rota `/`**, a sidebar e o `Status` mostram os dois o usuário com e-mail, a versão com arquitetura e **dois botões "abrir logs" com o mesmo nome acessível** — teste futuro que use `getByRole('button', { name: 'abrir logs' })` nessa rota fica ambíguo. Fecha na task 06;
- **`/printers` e `/printer-settings` exibem título duas vezes**, o `<h1>` do shell e o `Typography` da própria tela. Fecha nas tasks 09 e 10;
- **não há rota catch-all:** hash desconhecido rende o shell com título e conteúdo vazios (antes não renderizava nada, então não é regressão);
- **o badge de Impressoras reconsulta `GET /printers` a cada navegação**, nas seis, quando só `/printers` pode torná-lo obsoleto; e entrar em `/printers` dispara **dois** `GET /printers` (a instância do sidebar e a da tela). Guardar o pathname anterior num ref e só chamar `refresh()` quando o anterior era `/printers` elimina 5 de 6. **Deixado de propósito para a task 09**, que é a dona da tela de impressoras, porque é mudança de política de busca e merece teste próprio em vez de carona aqui.

### Todo ícone passa pelo primitivo `Icon` (task 01)

As `font-variation-settings` e as `font-feature-settings` da fonte de ícones ficam **escopadas no `Icon.module.css`**, não numa classe global `.material-symbols-outlined` como o desenho faz — o desenho usa classe global porque o mock não tem componentes, e a regra da UI proíbe CSS global novo fora do `app.css`. **Consequência:** tela que escrever `class="material-symbols-outlined"` à mão não recebe nenhuma dessas declarações e o ícone sai errado. Nas tasks 03 a 11, todo ícone vem do `Icon`.

### O seletor do tema escuro é `:root[data-theme='dark']` (task 01)

`[data-theme='dark']` sozinho **empata em especificidade com `:root`** e só venceria por ordem de origem: um bloco `:root` acrescentado mais adiante no `app.css` desligaria o tema escuro em silêncio. Com `:root[data-theme='dark']` a precedência não depende da ordem. Token novo entra nos dois blocos (RN-11) e o escuro continua onde está.

### O peso do bundle: o baseline de 518 kB está velho (task 01)

Medido em worktree limpa no `HEAD` contra a task: o JS do renderer é **557,59 kB nos dois**, ou seja a task 01 não acrescentou **nada** de JS; ela custou **+1,39 kB de CSS** e os 20,86 kB do woff2, emitido como asset separado. Os ~40 kB a mais que o baseline histórico de 518 kB (`CLAUDE.md`) são crescimento das specs 11, 15 e 19. **Não comparar task nova com 518 kB** — comparar com a worktree do `HEAD`.

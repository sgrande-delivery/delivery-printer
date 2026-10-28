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
| 03 | Shell com sidebar, cabeçalho e navegação | [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41) | [41-app-shell-and-navigation.md](./tasks/41-app-shell-and-navigation.md) | 01, 02 | pendente |
| 04 | Login redesenhado em duas etapas | [#42](https://github.com/sgrande-delivery/delivery-printer/issues/42) | [42-login-two-step-redesign.md](./tasks/42-login-two-step-redesign.md) | 01 | pendente |
| 05 | Telas de estado e toast | [#43](https://github.com/sgrande-delivery/delivery-printer/issues/43) | [43-state-screens-and-toast.md](./tasks/43-state-screens-and-toast.md) | 01, 03 | pendente |
| 06 | Painel (variação C) | [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44) | [44-dashboard-variant-c.md](./tasks/44-dashboard-variant-c.md) | 03 | pendente |
| 07 | Fila de impressão, com descartar | [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45) | [45-print-queue-screen.md](./tasks/45-print-queue-screen.md) | 03 | pendente |
| 08 | Histórico de hoje, com reimprimir | [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46) | [46-history-screen-and-reprint.md](./tasks/46-history-screen-and-reprint.md) | 03, 07 | pendente |
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

### Todo ícone passa pelo primitivo `Icon` (task 01)

As `font-variation-settings` e as `font-feature-settings` da fonte de ícones ficam **escopadas no `Icon.module.css`**, não numa classe global `.material-symbols-outlined` como o desenho faz — o desenho usa classe global porque o mock não tem componentes, e a regra da UI proíbe CSS global novo fora do `app.css`. **Consequência:** tela que escrever `class="material-symbols-outlined"` à mão não recebe nenhuma dessas declarações e o ícone sai errado. Nas tasks 03 a 11, todo ícone vem do `Icon`.

### O seletor do tema escuro é `:root[data-theme='dark']` (task 01)

`[data-theme='dark']` sozinho **empata em especificidade com `:root`** e só venceria por ordem de origem: um bloco `:root` acrescentado mais adiante no `app.css` desligaria o tema escuro em silêncio. Com `:root[data-theme='dark']` a precedência não depende da ordem. Token novo entra nos dois blocos (RN-11) e o escuro continua onde está.

### O peso do bundle: o baseline de 518 kB está velho (task 01)

Medido em worktree limpa no `HEAD` contra a task: o JS do renderer é **557,59 kB nos dois**, ou seja a task 01 não acrescentou **nada** de JS; ela custou **+1,39 kB de CSS** e os 20,86 kB do woff2, emitido como asset separado. Os ~40 kB a mais que o baseline histórico de 518 kB (`CLAUDE.md`) são crescimento das specs 11, 15 e 19. **Não comparar task nova com 518 kB** — comparar com a worktree do `HEAD`.

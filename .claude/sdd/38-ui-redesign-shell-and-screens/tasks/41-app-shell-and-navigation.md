# 03 — Shell com sidebar, cabeçalho e navegação

**Issue:** [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 01, 02
**Status:** executada

## Objetivo

Criar o shell do desenho — sidebar de seis destinos, cabeçalho com título e chip de conexão, área de conteúdo — e, no mesmo movimento, subir os quatro hooks de impressão para cima do roteador, para que navegar pare de derrubar o socket.

## Contexto

- O desenho: `../design/printer-v2.dc.html:27-73`. A sidebar é `:28-66`, o cabeçalho `:68-71`, a área de conteúdo `:72`. O mapa de títulos está no script, em `:636`, e os seis itens de menu em `:637-640`.
- **Hoje `DefaultLayout` é um `div` de padding** (`src/renderer/components/layout/DefaultLayout.tsx`), e `ProtectedRoute` envolve cada tela nele (`routes/ProtectedRoute.tsx:19,27,35`). O shell toma esse lugar.
- **A falha que esta task conserta:** `useAdminSocketEvents`, `useAdminSocket`, `usePrintingOrder` e `usePrintingBoard` são montados em `src/renderer/components/main/Main.tsx:15-20`, que só renderiza na rota `/`. Ir a `/printers` desmonta o `Main`, e o cleanup de `useOrderSocket` chama `store.disconnect()` (`hooks/useOrderSocket.ts:18`) — então, com a tela de impressoras aberta, `printOrder` e `printShipment` não chegam a ninguém e o painel deixa de receber o `printer_ping`. Com quatro rotas isso já é verdade hoje; com seis seria pior.
- **Os `SocketStore` são singletons de módulo** (RN-06): `const store = new SocketStore('order')` no topo do hook. Por isso o shell tem de ser o **único** dono — se duas telas montarem o mesmo hook, o desmonte de uma derruba o socket da outra.
- A navegação é **hash** (`createHashHistory` em `services/history.ts`), porque em produção o renderer é carregado por `file://`. `NavLink` e `useLocation` funcionam normalmente; o que muda é a URL ter `#`.
- **A janela é arrastada pelo CSS** (RN-13): hoje `-webkit-app-region: drag` está em `Main.module.css:11`. No desenho a região arrastável é o topo da sidebar (`:29`) **e** o cabeçalho (`:68`). Botão dentro de região arrastável precisa de `-webkit-app-region: no-drag`, senão o clique vira arrasto — vale para o logout e para o "abrir logs" da sidebar.
- O `border-radius: 8px` e o `box-shadow` da linha 25 do desenho são a **moldura do mock** (uma janela flutuando sobre fundo `--page`), não UI: a janela real é uma janela real. O `--page` também não é usado pelo app.
- Cobre a **RF-01**, a **RF-02**, a **RF-03**, a **RN-06** e a **RN-13**.

## Mudanças

### 1. `src/renderer/components/layout/AppShell.tsx` + `.module.css` (novos)

Estrutura e medidas do desenho, sem inventar: sidebar de 216 px com fundo `--side`, cabeçalho de 56 px com borda inferior `--line` e `padding: 0 152px 0 28px` (os 152 px à direita são o espaço dos botões nativos da janela — RN-04), e conteúdo com `overflow-y: auto` e `padding: 24px 28px`.

Monta os quatro hooks de impressão **aqui**, uma vez:

```tsx
useAdminSocketEvents();
const { isConnected } = useAdminSocket();
usePrintingOrder();
usePrintingBoard();
```

### 2. `src/renderer/components/layout/Sidebar.tsx` + `.module.css` (novos)

- **Topo** (`:29-35`): símbolo de 30 px (`images/brand/simbolo-negativo.png`), "SGrande" em 13 px/600 e "Delivery Printer" em 12 px; região arrastável
- **Menu** (`:36-45`): os seis itens, com rótulo, ícone e rota:

| Rótulo | Ícone | Rota | Título no cabeçalho |
| --- | --- | --- | --- |
| Painel | `space_dashboard` | `/` | Painel |
| Fila | `stacks` | `/queue` | Fila de impressão |
| Histórico | `history` | `/history` | Histórico de hoje |
| Impressoras | `print` | `/printers` | Impressoras |
| Configurações | `tune` | `/printer-settings` | Configurações de impressão |
| Teste de impressão | `receipt_long` | `/print-test` | Teste de impressão |

  Item ativo: fundo `--side-2`, texto `#fff`, ícone `--accent`, peso 600. Inativo: texto `--side-text`, ícone `--side-muted`, peso 400, `hover` com fundo `--side-2`. Usar `NavLink` e o `isActive` dele, não comparação de string à mão.
- **Badges** (`:41-43`), lendo o que já existe:
  - **Fila**: `failed.length || pending.length` do `usePrintQueue()`, com fundo `--err-dot` quando há falha e `#5A524E` quando é só pendente — é o que o desenho faz em `:643`
  - **Impressoras**: quantas cadastradas não foram encontradas nesta máquina, pelo `usePrinters()`, com fundo `--err-dot`
  - Badge zero **não** aparece
- **Pé** (`:46-56`): caixa com os dois indicadores (conexão e loja), o usuário com logout, e a linha de versão com "abrir logs". Os dados já existem: `isConnected` do `useAdminSocket`, `restaurant.is_open` e `user` do `useAuth()`, `packageJson.version` e `window.electron.arch` (como em `Status.tsx:100-102`), e `window.electron.revealLogs()` com o mesmo tratamento de "ainda não há registros" de `Status.tsx:23-35`.

O avatar é a inicial do nome sobre `--accent` quando não há imagem, como o desenho (`:51`) — e como `Status.tsx:88` já faz.

### 3. `src/renderer/components/layout/StateLayout.tsx` + `.module.css` (novos)

A moldura mínima das telas de estado do desenho (`:470-476`): barra de 56 px arrastável com o símbolo e "SGrande Delivery Printer", e o conteúdo centralizado. **Nasce aqui porque `ProtectedRoute` precisa dela** — carregando e sem conexão não podem renderizar dentro do shell, que depende de sessão e de restaurante. O conteúdo das três telas é a task [#43](https://github.com/sgrande-delivery/delivery-printer/issues/43); aqui ela só envolve o que já existe.

O símbolo alterna com o tema (`:473` lê `symbolSrc`): `simbolo.png` no claro, `simbolo-negativo.png` no escuro, pelo `useTheme()` da task [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40).

### 4. `routes/ProtectedRoute.tsx`, `routes/Routes.tsx` e as telas

- `ProtectedRoute`: `loading` e `unreachable` passam a usar o `StateLayout`; `authenticated` usa o `AppShell`
- `Routes.tsx`: as duas rotas novas, `/queue`, `/history` e `/print-test`, dentro do `ProtectedRoute`, com telas de esqueleto (um `Typography` dizendo o nome da tela) — as tasks [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45), [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46) e [#49](https://github.com/sgrande-delivery/delivery-printer/issues/49) as preenchem. Esqueleto é aceitável aqui **porque o caminho até ela existe**; o que não se faz é rota sem caminho
- `components/main/Main.tsx`: **perde os quatro hooks** e o `div.titleBar` (`:28-30`), que agora é o cabeçalho do shell. Fica só com o `Status`, e o `handleLogout` vai para a sidebar
- `DefaultLayout.tsx` e `.module.css`: saem, ou passam a reexportar o `AppShell` — o que der o diff menor. Quem o usa é só o `ProtectedRoute`

### 5. O cabeçalho

Título pelo mapa da rota ativa (`:636`), em 18 px/600, e o chip de conexão (`:70`): `--ok-soft`/`--ok` com "Online" quando conectado; `--err-soft`/`--err` quando não — o desenho só mostra o caso bom, porque o mock está sempre conectado, e o texto do caso ruim é "Sem conexão", o mesmo vocabulário do resto do app.

## Testes

### `src/renderer/components/layout/__tests__/AppShell.test.tsx` (novo)

- Os seis itens aparecem, com o rótulo do desenho
- O item da rota atual recebe a classe de ativo, e só ele
- Badge da Fila aparece com a contagem e a cor de falha quando há falhado; **não** aparece com a fila vazia
- Badge de Impressoras aparece com a contagem de não encontradas
- Chip de conexão diz "Online" conectado e "Sem conexão" desconectado
- Versão e arquitetura aparecem; "abrir logs" chama `window.electron.revealLogs()`
- `expectNoUndefinedClasses(container)` no shell, na sidebar e no `StateLayout`

### `src/renderer/components/layout/__tests__/shellSockets.test.tsx` (novo) — a falha que a task conserta

- Montar o shell, navegar de `/` para `/printers` e **afirmar que o socket não foi desconectado**: `store.disconnect` não é chamado na navegação. Com os hooks de volta no `Main`, este teste falha — é a mutação que prova a rede
- Navegar e emitir `printOrder` ainda produz a chamada de impressão

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual, e é o critério central: com o app na tela de Impressoras, emitir `printOrder` no socket de dev e ver o comprovante sair
- Manual: arrastar a janela pelo cabeçalho e pelo topo da sidebar; clicar no logout e no "abrir logs" (se o clique virar arrasto, falta `no-drag`)

## Critérios de aceitação

- [ ] As seis telas são alcançáveis pela sidebar, cada uma com o seu título no cabeçalho, e o item ativo é visível
- [ ] Navegar entre telas **não** desconecta socket e não perde evento de impressão
- [ ] Os badges aparecem só quando há o que contar, com a cor do desenho
- [ ] A janela é arrastável pelo cabeçalho e pelo topo da sidebar, e os botões dentro deles respondem ao clique
- [ ] Carregando e sem conexão aparecem no `StateLayout`, não dentro do shell
- [ ] Medidas conferidas contra `design/printer-v2.dc.html:27-73`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- O conteúdo das seis telas: Painel é a [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44), Fila a [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45), Histórico a [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46), Impressoras a [#47](https://github.com/sgrande-delivery/delivery-printer/issues/47), Configurações a [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48), Teste a [#49](https://github.com/sgrande-delivery/delivery-printer/issues/49)
- O conteúdo das telas de estado — task [#43](https://github.com/sgrande-delivery/delivery-printer/issues/43)
- Sidebar recolhível, atalho de teclado, item de menu na bandeja

### O que o review pegou, e que eu corrigi antes do commit

Dois bloqueadores, nenhum deles no código do shell:

1. **27 das 41 chaves de CSS Module sem rede**, medido chave por chave, inclusive as estruturais. Como não há concatenação nenhuma nos três componentes, as três chamadas de `expectNoUndefinedClasses()` eram **inertes**. Entraram 15 afirmações de presença (2 testes novos), e a varredura por mutação confirma que cada chave derruba ao menos um teste.
2. **A skill `.claude/skills/add-screen/SKILL.md` instruía o padrão que re-quebra a RN-06** — `<Route element={<ProtectedRoute element={<XScreen />} />} />`, que remonta o shell a cada navegação. Ela é carregada automaticamente quando alguém cria tela, e **nove tasks desta spec criam tela**. Corrigida, junto com quatro outras afirmações que tinham deixado de ser verdade.

Mais cinco itens de atenção aplicados: `process.argv ?? []` no preload (sem isso, argv ausente lançaria **antes** do `contextBridge.exposeInMainWorld` e `window.electron` ficaria `undefined` — o app inteiro); `--side-badge` como token nos dois temas, no lugar do hex enterrado no módulo (RN-11, e a limpeza da task 12 varre o `app.css`, não os módulos); `Record<string, Badge | undefined>`, porque 4 dos 6 itens não têm badge; o cast gratuito e o reset fora de `finally` no teste do tema; e `firstPath` → `isFirstRun`, que é o que a variável guarda.

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

## Implementação

**Concluída em:** 2026-10-28

### Processos tocados

renderer; main e preload (só a piscada de tema)

### Arquivos criados/alterados

- `components/layout/{AppShell,Sidebar,StateLayout}.tsx` + `.module.css`, `navigation.ts`, `shellConnection.ts` — o shell; `hooks/useLogout.ts`
- `routes/ProtectedRoute.tsx` virou rota de layout (`Outlet`); `routes/Routes.tsx` aninha as seis telas; `screens/{Queue,History,PrintTest}Screen.tsx` são esqueletos
- `components/main/Main.tsx` perdeu os hooks e a barra falsa; `Main.module.css`, `DefaultLayout.*` removidos; `Printers.*` e `PrinterSettings.module.css` perderam barra falsa e `padding-top`
- Piscada: `shared/uiTheme.ts` (`themeArgument`/`themeFromArgv`), `main/window.ts` (`additionalArguments`), `main/preload.ts` (`initialTheme`), `providers/theme.tsx`, `index.tsx`, stub em `__tests__/setup.ts`

### Decisões que tomei por conta própria

- `ProtectedRoute` precisou virar rota de layout: com um por tela, o shell remontava a cada navegação e o conserto não existiria
- Piscada de tema paga agora (argumento de linha de comando lido de forma síncrona no preload)
- Badge de Impressoras reconsulta ao trocar de rota, para não manter acusação já corrigida
- Badge "só pendente" usa o `#5a524e` literal do desenho: não há token e `--text-2` muda no escuro

### Verificação

- typecheck 0; lint 0 erros e 1 aviso (baseline); testes 261/262, a falha é a pré-existente de `ui.test.tsx > Status`

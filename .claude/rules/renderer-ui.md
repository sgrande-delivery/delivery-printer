---
paths:
  - "src/renderer/**"
  - "src/__tests__/**"
---

# A interface

Não há biblioteca de UI e não há CSS-in-JS. Material-UI v4 e styled-components saíram na remoção do boilerplate, e o bundle caiu de 924 kB para 518 kB. **Não reintroduzir** sem a task pedir.

A interface atual é a da spec 38, desenhada no Claude Design. **O desenho está congelado em `.claude/sdd/38-ui-redesign-shell-and-screens/design/printer-v2.dc.html`** e é a referência literal de medida, cor, raio, peso, ordem, ícone e texto (RN-15). As divergências deliberadas estão na tabela "Fidelidade ao desenho" da `spec.md` — **leia a tabela antes de "consertar" qualquer coisa que pareça diferente do mock**. Algumas dizem o contrário do que o desenho mostra de propósito: sete setores em vez de quatro, margem em px em vez de mm, o `close` da gaveta com 152 px de respiro, o 22 px fixo embaixo do papel da pré-visualização.

## CSS Modules

Cada componente tem o seu `Componente.module.css` ao lado, importado como `styles`:

```tsx
import styles from './Dashboard.module.css';
<div className={styles.root}>
```

Para combinar classes, `cx()` (`src/renderer/base/cx.ts`), que descarta falsy — é a função de 3 linhas que existe para não ter a dependência:

```tsx
className={cx(styles.item, active && styles.itemActive)}
```

**A armadilha central de CSS Modules:** chave digitada errada não dá erro. `styles.contianer` é `undefined` e o estilo desaparece calado. A rede para isso é **curta, e a medida está em três specs**:

- `expectNoUndefinedClasses()` (`src/renderer/__tests__/cssModules.ts`) só pega **concatenação** (`` `${styles.x} y` ``). Em `cx(styles.errada)` a classe some sem deixar `undefined`, e em `className={styles.errada}` o React **omite o atributo**. Nesses dois casos o helper não pode falhar, e a presença dele num arquivo de teste **não diz nada** sobre cobertura de CSS
- O `vitest.config.ts` tem `css: { include: [/\.module\.css$/] }` — sem isso o helper nunca falhava, porque o Vitest devolvia um nome hasheado para a classe inexistente. Não tire
- **O que cobre de verdade é asserção de presença por elemento**, contra `styles.<chave>` (nunca contra substring literal: `toContain('icon')` é satisfeito por `iconButton`), numa chave por elemento que carrega layout, não só na `root`. `toHaveClass(undefined)` passa calado se o elemento tem outra classe, então renomear no `.module.css` ainda escapa
- **Token inexistente (`var(--scrimm)`) e cor errada não são cobertos por nada.** São olho humano, nos dois temas

Nada de `style={{}}` para layout (só valor calculado em runtime — o `Icon` e o `Button` fazem isso, com tabela dentro do primitivo) e nada de CSS global novo fora de `src/renderer/app.css`.

**CSS Module não aponta para `@keyframes` global, e falha calado:** `animation: spin` dentro de um módulo compila para um nome renomeado que não existe. Animação compartilhada vive no `app.css` junto da classe que a usa (`.spin`); animação de um componente só, no próprio módulo.

## Os tokens

As cores são custom properties em `src/renderer/app.css`, e os valores são os do desenho (`design/printer-v2.dc.html:13-14`): a paleta clara em `:root` e a escura em `:root[data-theme='dark']`. São os mesmos 30 nomes de cor nos dois blocos.

| Grupo | Tokens | Para quê |
| --- | --- | --- |
| Superfícies | `--bg`, `--surface`, `--surface-2` | fundo da janela, cartão, e fundo secundário e hover |
| Reservado | `--page` | declarado nos dois temas e **sem consumidor** desde a task 01. Era a "mesa" atrás do login, que o desenho resolveu de outro jeito. Usar ou apagar — não inventar função nova para ele |
| Linha e texto | `--line`, `--text`, `--text-2`, `--muted` | borda e divisor; corpo; secundário; terciário |
| Marca | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-ink` | ação primária, seu hover, o fundo suave e o texto sobre ele |
| Estado | `--ok`, `--ok-dot`, `--ok-soft`, `--err`, `--err-dot`, `--err-soft`, `--warn`, `--warn-soft` | texto/ponto/fundo de sucesso, falha e atenção |
| Barra lateral | `--side`, `--side-2`, `--side-text`, `--side-muted`, `--side-badge` | a sidebar e o painel de marca do login |
| Véu e papel | `--scrim`, `--paper`, `--paper-ink`, `--paper-rule`, `--paper-sub` | o véu da gaveta; o papel das pré-visualizações, que **continua claro no tema escuro** |

Pesos: `--font-weight-regular/medium/semibold/bold` = 400/500/600/700. Corpo em `0.875rem` (14 px) — ver "Acessibilidade" abaixo.

**Regras:**

- **Cor nova é token em `:root` _e_ no bloco escuro.** Token que existe só num tema é um tema quebrado em algum canto. O seletor escuro é `:root[data-theme='dark']` e não `[data-theme='dark']`: o segundo empata em especificidade com `:root` e só venceria por ordem, então um `:root` acrescentado depois desligaria o escuro em silêncio
- Hex solto num módulo é defeito, com as **exceções legítimas**: o `#fff` sobre `--accent` e sobre `--side` (o desenho também); os literais do toast (`Messaging.module.css`: fundo, texto e hover), que não seguem o tema de propósito; sombras `rgba(0,0,0,…)`; e o `#000` do `mask` do papel
- `--bg` e `--text` dos dois temas também estão **escritos à mão** em `src/main/theme.ts`, para o `titleBarOverlay`, porque o main não tem CSS. Mudou um, mudou o outro
- Não existe mais camada de apelido (`--color-primary` & cia. foram apagados na task #50). O `grep -rn "\-\-color-" src/` tem de sair vazio

## O tema

`data-theme="dark"` no `<html>` liga o bloco escuro; no claro o atributo é **removido** (`applyTheme` em `providers/theme.tsx`). Quem o escreve é o `ThemeProvider`: ele lê o tema resolvido do main (`window.electron.uiTheme()`), ouve `onUiThemeChanged` e grava a preferência (`'system' | 'light' | 'dark'`, default `'system'`) por `setUiTheme`. A preferência vive em `ui-preferences.json` sob `userData`, no main.

- **Componente não lê tema: lê token.** Só dois consultam `useTheme()`: o `StateLayout` (`:14`), que escolhe um _asset_ — o símbolo claro ou negativo da marca —, e o `AppearanceSection` (`:17`), que **é** o controle de tema. O `ErrorBoundary` **não** o chama: está acima dos providers e lê `document.documentElement.dataset.theme`
- O `titleBarOverlay` (os três botões nativos) **não é CSS**: o main o reconfigura a cada troca de tema (`window.setTitleBarOverlay`, RN-04). Tem 56 px, a altura do cabeçalho do shell, e é por isso que o cabeçalho reserva 152 px à direita
- O tema inicial chega pelo `additionalArguments` da janela e por `window.electron.initialTheme`, para a primeira pintura já sair certa. Isso **só foi provado em teste, não em Electron real**: se o argumento não chegar ao `process.argv` do preload, degrada para claro em silêncio

## Ícones

Todo ícone vem do primitivo `Icon` (`base/Icon.tsx`), que desenha uma **Material Symbols Outlined empacotada** (`src/renderer/fonts/`, recortada aos símbolos do desenho). A fonte é local porque nada visual do app pode vir da internet: o PDV pode estar sem rede exatamente quando precisa imprimir (RN-01).

- O nome é a **união fechada `IconName`** do `Icon.tsx`, e essa lista é a **mesma** do `icon_names` que gera o recorte (`fonts/README.md`). Ícone novo sem regerar a fonte aparece como **texto**
- As `font-variation-settings` ficam escopadas no `Icon.module.css`. Quem escrever `class="material-symbols-outlined"` à mão não recebe nenhuma e o ícone sai errado
- A fonte renderiza o **nome** como texto e vira glifo por ligadura (`rlig`, não `liga`). Consequência para teste: o texto do ícone conta no `textContent`, então `<label>` **envolvente** com ícone decorativo dentro quebra o nome acessível (`'E-mailperson'`). Use `<label htmlFor>` **irmão**

## Os primitivos de `base/`

| Componente | API |
| --- | --- |
| `Typography` | `variant`: `h4 \| h6 \| body1 \| body2 \| caption`; `color`: `inherit \| primary \| textPrimary \| textSecondary`; `align`; `as` |
| `Button` | `variant`: `contained \| outlined \| text`; `size`: `'medium' \| 'small'` (o botão legado, quadrado e em caixa alta) **ou uma altura do desenho**: `32 \| 34 \| 38 \| 42 \| 44 \| 46 \| 48`; `fullWidth`; default `type="button"` |
| `IconButton` | `size`: `medium` (redondo, 12 px de padding) `\| small` (o quadrado de 34 px com raio 6 que o desenho põe dentro de campo) |
| `TextField` | `label` (obrigatório), `fullWidth`, `endAdornment`, `variant`: `floating` (default) `\| boxed` |
| `Spinner` | `className`; o anel do desenho, já com `role="progressbar"` e `aria-label` |
| `Icon` | `name: IconName`, `size` (px) |
| `Stepper` | menos/valor/mais: `label`, `value`, `onChange`, `min`, `max`, `step`, `display`, `valueWidth` |
| `Switch` | `checked`, `onChange`, `label` (nome acessível; o rótulo visível mora na tela) |
| `Chip` | `tone`: `neutral \| muted \| ok \| err \| inverse`; `size`: `compact \| small \| medium \| large`; `dot`; `iconFirst`; `pressed`; com `onClick` vira `<button>` |

**`Button`: o tamanho é a altura.** Cada altura é uma linha de `METRICS` em `Button.tsx` (raio, fonte, padding e peso, por variante) aplicada por `style`, e o que é comum a todas fica numa classe só (`.design`: `nowrap`, sem caixa alta, `line-height: 1`). A união é **fechada de propósito**: impede inventar 51 px, e é o que segura a RN-15. **Não** use prop numérica livre, **não** dê nome de tela a tamanho (`large`, `hero`) e **não** sobreponha padding por classe no consumidor — altura nova é linha nova na tabela. O par legado `medium`/`small` é o MUI v4 e só o `PrintersNotice` e o toast o usam.
**O que a tabela não expressa:** o desenho dá ao _mesmo_ botão de 34 px `padding: 0 14px` no cartão de impressora (`:270`) e `0 16px` na barra de configurações (`:341`). A tabela é por altura e guarda só o primeiro; o "Salvar" da barra sai 2 px mais estreito. É a **linha 14** da tabela de fidelidade, mantida de propósito (2 px sem efeito funcional não pagam uma prop de padding, que reabriria o override no consumidor).

**`TextField` `floating`** é o rótulo flutuante do MUI em CSS puro. O `<input>` vem **antes** do `<label>` de propósito: o rótulo reage a `:focus` e `:placeholder-shown` pelo seletor irmão, e o `placeholder` default é `' '` para isso funcionar. **Não reordene e não remova o placeholder de espaço.** Hoje nenhuma tela usa essa variante (o login e a gaveta usam `boxed`); ela fica por ter teste e por ser a forma de campo do app antes da spec 38. Quem a quiser de volta, migra para tokens como o resto. `boxed` é o rótulo acima de uma caixa com `focus-within`.

Variante nova de primitivo entra no primitivo (uma classe no `.module.css` e um valor na união), não como override de classe na tela. Primitivo novo só quando o padrão aparecer em dois lugares — foi assim que `Chip`, `Stepper`, `Switch` e `Icon` nasceram. Quem estende o `Chip` estende o primitivo.

`base/Select.tsx` **não existe mais**: a gaveta de impressoras trocou o `<select>` por chips de setor, e o primitivo ficou sem importador.

## Shell e rotas

`src/renderer/routes/Routes.tsx` tem **sete** caminhos: `/login` (dentro de `PublicRoute` → `AuthLayout`) e as **seis telas do shell**, todas filhas de **um** `ProtectedRoute`: `/` (Painel), `/queue` (Fila), `/history` (Histórico), `/printers`, `/printer-settings` e `/print-test`. O procedimento de tela nova está na skill `add-screen`; o que vale como regra:

- **`ProtectedRoute` é rota de layout**: renderiza `<Outlet/>` dentro do `AppShell`. Tela nova entra **como filha** dele, nunca num segundo `ProtectedRoute` — envolver cada tela remonta o shell a cada navegação e o cleanup dos hooks de socket derruba a conexão
- **O `AppShell` é o dono único dos hooks de socket e de impressão** (RN-06): `useAdminSocketEvents`, `useAdminSocket`, `usePrintingOrder`, `usePrintingBoard`. Tela **não monta** nenhum deles. Quem precisa saber da conexão lê `useShellConnection()` (`layout/shellConnection.ts`)
- **A tela não põe título, padding nem região de arraste**: o cabeçalho dá o título (mapa em `layout/navigation.ts`) e o `.content` dá `padding: 24px 28px`
- **Rota nova precisa de item de menu**: a entrada é um item em `NAV_ITEMS` **e** o título no mesmo item. Tela sem caminho até ela é tela morta; sem título, o cabeçalho sai vazio. Não há rota catch-all
- **`StateLayout`** é a moldura das telas de estado (carregando, sem conexão): barra de marca + conteúdo. Elas não renderizam dentro do `AppShell`, que precisa da sessão e do restaurante que essas telas esperam. O `ErrorBoundary` tem moldura própria, porque está acima dos providers e não pode usar `useTheme()` nem `useMessaging()`
- A navegação é **hash** (`createHashHistory` em `services/history.ts`), porque em produção o renderer é carregado por `file://`. Link e `navigate` continuam normais; a URL tem `#`
- **`ProtectedRoute` ramifica pelo `sessionStatus`** do `useAuth()`: `loading` → `InsideLoading`; `unreachable` → a tela de sem conexão, **sem** redirecionar (quem perdeu a rede não é deslogado) e com retry automático a cada 12 s; `unauthenticated` → `Navigate to="/login" replace`; `authenticated` → o `AppShell`
- **Só 401 conta como "não logado".** `isSessionRefused` em `providers/auth.tsx` é 401 estrito: 403 vem do middleware `Role` depois da autenticação (sessão válida sem permissão), e 5xx/404/erro de rede são o servidor não respondendo. Tratar qualquer um deles como "não logado" manda o parque inteiro para um login onde a mesma credencial falha igual

**Dado compartilhado entre telas:** `createSharedStore` (`hooks/sharedStore.ts`) é um store por contagem de referência — o primeiro leitor que monta dispara o `start`, o último que desmonta devolve ao estado inicial. É por ele que a sidebar e a tela de impressoras compartilham **uma** busca. O contrato onde a próxima tela erra: o shell mantém a sidebar montada a sessão inteira, então o estado **não volta a zero até o logout**; tela que precisa de dado fresco chama `revalidate()` ao montar (e tem teste que cai se isso sair). Não há StrictMode neste app.

Telas que listam as impressoras cadastradas passam a escada `loading`/`forbidden`/`error` por `printersGate(status, reload)` (`components/printers/printersGate.tsx`), que devolve o elemento ou `null` para "pronto".

## Arrastar a janela

A janela usa `titleBarStyle: 'hidden'`, então **as regiões de arraste são CSS**: `-webkit-app-region: drag` no cabeçalho do shell, no topo da sidebar, na barra do `StateLayout`/`ErrorBoundary` e no painel de marca do login. Remover isso prende a janela no lugar.

**Botão dentro de uma região de arraste não recebe clique**, a menos que ele (ou seu contêiner) diga `-webkit-app-region: no-drag` (RN-13) — o item da sidebar, o chip de voltar do login, o véu e o painel da gaveta fazem isso. A tela nova não cria região de arraste: o cabeçalho do shell já cobre o topo. O que o jsdom não prova: apagar um `no-drag` **sobrevive à suíte**; só Electron de verdade fecha.

## Estado e dados

- `AuthProvider` (`providers/auth.tsx`) guarda `user`, `restaurant`, `authenticated`, `loading` e expõe `login`, `logout`, `checkEmail`, `me`, `setRestaurantIsOpen`. O `value` é `useMemo` — mantenha, senão todo consumidor re-renderiza a cada render do provider
- `MessagingProvider` (`providers/messaging.tsx`) é o toast: `useMessaging().handleOpen('mensagem')`. **É o único jeito de falar com o usuário** — não use `alert` e não deixe erro só no `console.error` quando a task pede retorno visível
- **Não há Redux, React Query nem Zustand**, e a remoção do Redux foi deliberada. Estado novo: `useState` local, `createSharedStore` se várias telas leem a mesma coisa, ou um provider
- **Lógica que decide texto, cor e destino sai do componente e vira função pura testável** (`buildDashboard`, `testPrintView`); o hook só injeta os dados. Foi o que permitiu testar por mutação sem timer
- Dado da API sempre pelo `api` de `services/api.ts`, que já tem `baseURL`, `withCredentials` e o header `App: admin`. **Não monte URL absoluta com `constants.BASE_URL`**
- **Rota de escrita que reconstrói o registro inteiro** (o `PUT /printerSettings` apaga e recria as linhas): o baseline é lido **no instante de escrever**, não na montagem. Revalidar ao montar melhora o que o operador vê; só a leitura no salvamento protege o que ele não vê
- **Pré-visualização que afirma "é isto que vai sair"** tem o texto em `src/shared/` (fonte única com a página do main) e um teste que compara o HTML real com o DOM renderizado. E se mostra a hora, segue o relógio (`useNow`), não o último clique

## Acessibilidade: as duas decisões, resolvidas

Medidas na task 05 e **decididas pelo dev na task #50**. As duas estão na `spec.md` (decisões 6 e 7) e a primeira virou a **linha 15** da tabela de fidelidade:

- **`--muted` do tema claro é `#756a64`, não o `#857a74` do desenho.** O valor do desenho dá **3,91:1** sobre `--bg`, abaixo dos 4,5:1 de AA, e este token carrega todo rótulo de seção, dica e tag, em 12–13 px; o escolhido fecha AA nos três fundos (4,92 / 5,25 / 4,60). **O token do tema escuro fica como o desenho**, porque lá já dá 5,06:1 — é divergência de um tema só, e está comentada no `app.css`. Não "restaure" o valor do mock
- **O corpo fica em 14 px** (`body { font-size: 0.875rem }`), contra os 16 px do desenho. É o valor com que as medidas das oito telas foram conferidas; subir para `1rem` reflui todas e é **task própria**, não limpeza de passagem

Cor nova que carregue texto pequeno: **meça o contraste contra os três fundos** (`--bg`, `--surface`, `--surface-2`) antes de aceitar o valor do desenho. Foi assim que esta apareceu.

## Dívida conhecida (não corrigir de passagem)

- **O `Login.tsx` ainda chama `me()` ao montar** e navega por conta própria, em vez de consumir o `sessionStatus`. Por isso o `me()` precisa adotar a sessão (senão o `ProtectedRoute` honesto devolve o `Login` num laço de requisição + navegação) e por isso sobrevive o aviso `react-hooks/set-state-in-effect` em `Login.tsx`. O conserto durável é o `Login` ler `sessionStatus` — task própria, com teste
- **O interceptor de erro do axios ainda empurra `/login` por conta própria** (`services/apiErrorInterceptor.ts`). No 401 concorda com o `ProtectedRoute`; quando o **refresh falha por rede**, o interceptor ganha e o operador vê o login em vez da tela de sem conexão. Conserto: tirar o `history.push` e deixar a navegação com o `sessionStatus`
- **O axios é criado sem `timeout`** (`services/api.ts`): requisição que pendura em vez de falhar deixa o app em "Conectando ao servidor…" sem segunda tentativa. Política de rede do app inteiro, task própria
- `react-router-dom` está declarado como `^6.28.1` e **resolve `6.30.6`**, com advisory de open redirect (faixa `6.0.0`–`7.17.0`); a correção existe só no `7.18.4`, que é major. Não é explorável aqui (nenhum destino de navegação vem do usuário, não há SSR), e o upgrade é task própria — boa hora para avaliar se o `BrowserRouter` customizado e a dependência `history` ainda se justificam no v7
- O `base/TextField` tem a variante `floating` (rótulo que sobe), migrada para os tokens novos e com teste, mas **nenhuma tela a usa** hoje: o desenho pede `boxed` em todo lugar. Fica porque é barata e o rótulo flutuante volta quando houver formulário denso
- O `Chip`, o `Button` e o `Stepper` só têm os tamanhos e tons que o desenho usa. Faltar um não é bug: é linha nova na tabela do primitivo

## Idioma

Texto visível é **pt-BR**. Nome de arquivo, componente, variável, classe CSS e commit são em **inglês**.

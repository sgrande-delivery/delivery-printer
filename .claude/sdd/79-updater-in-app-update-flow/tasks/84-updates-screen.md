# 84 — Tela /updates: cartão principal, progresso, preferências e novidades

**Issue:** [#84](https://github.com/sgrande-delivery/delivery-printer/issues/84)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 81, 83
**Status:** shipped

## Objetivo

Entregar a tela "Atualizações" do desenho: o cartão que diz a versão instalada e o que está acontecendo, o progresso do download, a preferência de download automático e as novidades da versão. Ela também cria o `updateView.ts`, a função pura que a sidebar e a faixa vão reusar.

## Contexto

- Cobre **RF-02**, **RF-08**, **RF-09** e **RF-10**, e as **RN-14**, **RN-15** e a tabela "Fidelidade ao desenho" da spec.
- O desenho é `../design/atualizacoes.dc.html`. A tela é o bloco `<sc-if value="{{ sUpd }}">`, **linhas 135-197**; a tabela de estado → cor/texto/botão é o `mainCard(S)`, **linha 365**. O `README.md` do `design/` diz como ler o arquivo.
- **O procedimento de tela nova está na skill `add-screen`** — siga-a: componente + CSS Module em `src/renderer/components/updates/`, screen em `src/renderer/screens/`, rota em `Routes.tsx`, título, caminho de navegação e teste.
- **Esta é a primeira rota oculta do app** (RN-14). `Routes.tsx:18-23` tem seis rotas de shell, todas filhas de **um** `ProtectedRoute` — a nova entra como irmã delas, nunca num segundo `ProtectedRoute` (isso remontaria o shell a cada navegação e o cleanup dos hooks de socket derrubaria a conexão). E o cabeçalho tira o título do `NAV_ITEMS` (`navigation.ts:20-22`), então **rota fora do `NAV_ITEMS` sai com cabeçalho vazio**: o `titleFor` precisa de uma segunda fonte.
- **A tela não põe título, padding nem região de arraste** (`.claude/rules/renderer-ui.md`): o cabeçalho dá o título e o `.content` dá `padding: 24px 28px`.
- O que se reaproveita, com endereço: `SettingsRow` (`components/printer-settings/SettingsRow.tsx:14`, rótulo + dica + controle à direita, com `last` para a última linha sem divisor), `Switch`, `Button` (altura **36** para o botão de ação do cartão e **34** se precisar; a altura é a prop, e altura nova é linha nova na `METRICS` de `Button.tsx`), `Spinner`, `Icon`, e o símbolo por tema como o `StateLayout.tsx:19` faz.
- **O `AppearanceSection` (`printer-settings/AppearanceSection.tsx:16-26`) é o precedente exato** da preferência local: salva no clique, fora de qualquer barra de "alterações não salvas", e diz na tela que vale só neste computador. A preferência de download automático segue isso.

## Mudanças

### 1. `src/renderer/components/updates/updateView.ts` (novo) — a função pura

```ts
export type UpdateAction = 'check' | 'download' | 'restart' | 'cancel-restart';
export type UpdateTone = 'ok' | 'accent' | 'warn' | 'err' | 'muted';

export type UpdateCardView = {
  /** A cor do ponto; 'spinner' quando é o anel girando em vez do ponto. */
  dot: UpdateTone | 'spinner';
  text: string;
  button: { label: string; action: UpdateAction; variant: 'contained' | 'outlined'; disabled: boolean } | null;
  progress: { percent: number; doneMb: string; totalMb: string; eta: string | null } | null;
  /** A tarja de atenção do reinício agendado; null fora dele. */
  waiting: string | null;
  lastCheck: string;
};

export function buildUpdateCard(state: UpdateState, now: number): UpdateCardView
```

É o mesmo desenho de `buildDashboard` e `testPrintView`, que `.claude/rules/renderer-ui.md` prescreve: **lógica que decide texto, cor e destino sai do componente e vira função pura testável**. São sete linhas de tabela entre este cartão e o da sidebar (task #85), e dentro do JSX isso só se testa renderizando.

Os textos são **literalmente** os do desenho (RN-15) — a tabela de estados da spec os lista. Três pontos de cuidado:

- **A estimativa é omitida quando não há como calculá-la** (fidelidade 5): `bytesPerSecond` 0, ausente, ou `totalBytes` 0 → `eta: null`, e a tela não mostra nada no lugar. O desenho a deriva de uma constante inventada; progresso que mente é pior que progresso incompleto.
- **MB com vírgula decimal e uma casa** (fidelidade 6), do `total` real: `43,7`, não `43.7`.
- **`lastCheckedAt` nulo** (fidelidade 7): antes da primeira verificação a linha diz que ainda não houve verificação, em vez de inventar hora. Com valor, é hora local no formato do desenho (`10:42`).

### 2. `src/renderer/components/updates/` — a tela

- `Updates.tsx` + `Updates.module.css` — a composição: o cartão principal, o cartão de preferências e o cartão de novidades, na ordem do desenho, com `max-width: 640px` (`:136`).
- `UpdateCard.tsx` + módulo — o cartão principal: símbolo 48 px, `Delivery Printer <versão>`, ponto/anel + texto, botão à direita, a barra de progresso de 6 px com `<pct>% · <feito> de <total> MB` e a estimativa à direita, a tarja de atenção do reinício agendado (`hourglass_top` + texto), e a linha `Última verificação: …`.
- `ReleaseNotesCard.tsx` + módulo — título (`Novidades da versão <x>`, ou `Novidades desta versão` quando a versão oferecida é a instalada) e as linhas como `<ul><li>`. **Texto, nunca `dangerouslySetInnerHTML`** (RN-04): o estado já chega como `string[]`. Lista vazia → o cartão **não é renderizado**.
- A preferência: um `SettingsRow` com `label="Baixar e atualizar automaticamente"`, a dica nas duas variantes do desenho (`:424-426`) e o `Switch`, `last`.
- `src/renderer/screens/UpdatesScreen.tsx` — a screen, no padrão das outras seis.

Tudo lê o contexto da task #81 (`useAppUpdateContext()`), nunca monta o hook de novo.

### 3. Rota, título e o caminho até ela

- `Routes.tsx`: `<Route path="/updates" element={<UpdatesScreen />} />` dentro do `ProtectedRoute` que já existe.
- `navigation.ts`: uma segunda lista para rota sem item de menu, e o `titleFor` olhando as duas:

  ```ts
  /** Rota de shell que não aparece no menu. A primeira é /updates: o desenho não a põe na barra
   *  lateral (atualizacoes.dc.html:384-387), e os caminhos até ela são o cartão de atualização e a
   *  linha da versão. O título precisa estar aqui, ou o cabeçalho sai vazio (spec 79, RN-14). */
  export const HIDDEN_ROUTES: readonly NavItem[] = [
    { label: 'Atualizações', icon: 'restart_alt', to: '/updates', title: 'Atualizações' },
  ];
  ```

  O `NAV_ITEMS` **não muda** — a sidebar continua com seis itens, e é o `titleFor` que passa a procurar nos dois.

## Testes

`src/renderer/components/updates/__tests__/updateView.test.ts` (novo) — o que carrega o peso, porque é tabela:

- **Uma asserção por linha da tabela de estados da spec**, nos sete casos (`idle`, `checking`, `available`, `downloading`, `ready`, `ready` + agendado, `error`), conferindo ponto, texto e botão (rótulo, ação, variante, desabilitado).
- `eta` é `null` com `bytesPerSecond: 0`, ausente, e com `totalBytes: 0`.
- MB formatado com vírgula e uma casa.
- `lastCheckedAt: null` dá o texto de "ainda não verificado"; com valor, a hora local.
- `restartScheduled` com 1 e com 2 pendentes: singular e plural corretos.

`src/renderer/components/updates/__tests__/Updates.test.tsx` (novo):

- Cada estado renderiza o botão certo, e clicá-lo chama a ação certa do contexto.
- O `Switch` reflete `autoDownload` e o clique chama `setAutoDownload` com o valor oposto; falha no canal mostra o aviso.
- `releaseNotes: []` → **nenhum** cartão de novidades; com linhas, uma `<li>` por linha e **nenhuma tag HTML renderizada** (um item contendo `<b>x</b>` como texto sai como texto).
- Presença de classe por elemento contra `styles.<chave>`, numa chave por elemento que carrega layout — não só na `root`, e nunca contra substring literal (`.claude/rules/renderer-ui.md`).

`src/renderer/components/layout/__tests__/AppShell.test.tsx` (alterado): navegar para `/updates` põe **"Atualizações"** no cabeçalho — a prova da RN-14, e o teste que falha se alguém puser a rota só no `Routes.tsx`.

## Critérios de aceitação

- [x] `/updates` renderiza dentro do `AppShell`, com o cabeçalho dizendo "Atualizações"
- [x] A rota **não** aparece na barra lateral (o menu continua com seis itens)
- [x] Os sete estados batem com a tabela da spec, em texto, cor e botão
- [x] O progresso mostra percentual, MB feito/total com vírgula, e **omite** a estimativa quando não há como calculá-la
- [x] A preferência liga e desliga o download automático (o `Switch` chama o canal nos dois sentidos, com teste); que ela **sobrevive a reabrir o app** é o round trip em `userData` provado na #80
- [x] As novidades saem como texto, e o cartão desaparece quando não há nenhuma
- [x] Sem hex solto em nenhum módulo, e todo token usado existe nos dois temas (conferido token a token contra o `app.css`). **Os dois temas no olho ficam para a verificação manual** — jsdom não pinta, e "cor errada no escuro" não é coberto por teste neste repo
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. A rota `/updates` existe, é **oculta** (o menu continua com seis itens) e hoje só se alcança pela URL hash: os dois caminhos até ela são as tasks #85 (cartão da sidebar e linha da versão) e #86 (faixa).

**`src/renderer/components/updates/updateView.ts`** — a **função pura** `buildUpdateCard(state, now)`, mais `releaseNotesTitle` e `autoDownloadHint`. Sem relógio próprio (o `now` é parâmetro) e **sem nenhuma decisão de texto sobrando no JSX**: o cartão só consome `view.dot/text/button/progress/waiting/lastCheck` e um `Record<UpdateAction, () => Promise<void>>` que mapeia ação → função do contexto. É o desenho de `buildDashboard`/`testPrintView` que a regra prescreve.

**A tela** — `Updates.tsx`, `UpdateCard.tsx`, `ReleaseNotesCard.tsx` (cada um com seu módulo) e `screens/UpdatesScreen.tsx`. A rota entra como **irmã** das seis dentro do **único** `ProtectedRoute`, e o `titleFor` passa a olhar `[...NAV_ITEMS, ...HIDDEN_ROUTES]` — `NAV_ITEMS` não cresceu. Conferido token a token contra o desenho: raio 10, padding 18, gap 14/16, símbolo 48, nome 16/600, ponto 8 px, barra 6 px raio 3, tarja `--warn-soft`/`--warn`, `lastCheck` 12 px `--muted`. **Zero hex solto**, e todos os `var(--…)` usados existem nos **dois** temas.

**Dois casos que o desenho não tinha, e a spec agora tem:**

- **`'restarting'`** ganhou linha na tabela de estados: sem ela o estado cai no `default` e o cartão afirma "Você está na versão mais recente" **enquanto instala**.
- **`'error'` sem `targetVersion`** (erro de verificação, não de download): texto próprio e o botão chamando **`check()`**, porque o `download()` é no-op sem alvo. O `state.error` **nunca** vira texto do cartão — tem teste afirmando que nem `null` nem `ECONNRESET` aparecem na tela.

**Estado `null`** (o main ainda não respondeu): a tela mostra só "Lendo o estado da atualização…" em `role="status"`, **sem Spinner e sem botão**, e sem os cartões de preferência e novidades. O `null` não carrega a versão instalada, e um anel giraria para sempre se o main nunca respondesse — é o aprendizado da #81 implementado. Há teste afirmando a **ausência** de `progressbar` e de `button`.

**`Button` ganhou a altura 36** — união + linha na `METRICS` + linha no `it.each`, que é o jeito que a regra prescreve. Valores do desenho: raio 6, fonte 13, `padding 0 16px`, peso 600 no contained e 500 no outlined.

### O que o review mudou

1. **Violação de regra: o anel de 12 px era um override na tela.** O `UpdateCard.module.css` redimensionava o `Spinner` por seletor descendente (`.status .ring`), e a regra diz que variante de primitivo entra **no primitivo**. Pior: o efeito inteiro era **invisível para a suíte** — trocar o seletor por um que não casa deixava tudo verde e o anel voltava calado para 40 px. Agora o `Spinner` tem `size`, união fechada `12 | 40`, com a classe no próprio primitivo (a espessura da borda e a cor da trilha mudam com o tamanho, então número livre não carregaria isso).
2. **`toHaveClass(styles.dot, styles.dotWarn)` passava com uma das duas `undefined`** — o matcher só falha com a lista vazia. Virou uma asserção por chave.
3. **A altura 36 e o peso 500 não estavam fixados em teste**: `weights(500)` podia virar 400 e o cartão podia virar `size={34}` sem nada cair.
4. **Um `!` gratuito** no `UpdateCard` (o TS perde o narrowing de `view.button` dentro da closure) virou desestruturação.

### Testes

- `updateView.test.ts` — **uma asserção por linha** da tabela de estados, nos sete casos, com `toEqual` no objeto inteiro do botão; `eta` nulo nos três casos (`bytesPerSecond` 0, ausente e `totalBytes` 0); MB com vírgula; `lastCheckedAt` nulo e com valor, nos dois ramos do "hoje".
- `Updates.test.tsx` — cada estado com o botão certo e o clique chamando a ação certa **do contexto provido**; o `Switch` nos dois sentidos; falha no canal mostrando o aviso (esse caso usa o hook real); `releaseNotes: []` sem cartão; e `'<b>x</b> e <img src=x onerror=alert(1)>'` saindo como **texto**, com `querySelector('b')` e `('img')` nulos.
- `AppShell.test.tsx` — `/updates` põe "Atualizações" no cabeçalho, o menu continua com 6 links e nenhum deles se chama "Atualizações".
- **Rede fechada depois do review:** 8 chaves de CSS que escapavam (`head`, `identity`, `progress`, `waitingText`, `pending`, `dotOk`, `dotAccent`, `dotErr`) passaram a ter asserção, cada uma medida por mutação.

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **81 arquivos / 963 testes**, de 79/907.
- **Mutação:** o review varreu as **27 chaves** dos três módulos renomeando uma por vez (13 escapavam; as 8 que carregam layout ou estado foram fechadas), mais o seletor do anel, o `weights(500)`, o `size={36}` e textos do view — 33 mutações.
- **Não verificado:** os dois temas no olho e a tela em Electron real. jsdom não pinta, e "cor errada no escuro" não é coberto por teste nenhum neste repo. Os caminhos `'checking'` e `'error'` também não aparecem em dev (aprendizado da #80).

## Fora de escopo

- **O cartão da sidebar** (task #85), **a faixa, o diálogo e o overlay** (task #86). Esta task entrega o `updateView.ts` que a #85 e a #86 consomem.
- **Pôr "Atualizações" no `NAV_ITEMS`.** O desenho não põe, e os dois caminhos até a tela chegam nas tasks #85 e #86.
- **Mexer nas outras telas** ou no `.content` do shell.
- **Estimativa de tempo "inteligente"** (média móvel, suavização). O valor cru do `bytesPerSecond`, ou nada.

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

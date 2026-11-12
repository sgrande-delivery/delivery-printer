# 84 — Tela /updates: cartão principal, progresso, preferências e novidades

**Issue:** [#84](https://github.com/sgrande-delivery/delivery-printer/issues/84)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 81, 83
**Status:** pendente

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

- [ ] `/updates` renderiza dentro do `AppShell`, com o cabeçalho dizendo "Atualizações"
- [ ] A rota **não** aparece na barra lateral (o menu continua com seis itens)
- [ ] Os sete estados batem com a tabela da spec, em texto, cor e botão
- [ ] O progresso mostra percentual, MB feito/total com vírgula, e **omite** a estimativa quando não há como calculá-la
- [ ] A preferência liga e desliga o download automático e sobrevive a reabrir o app
- [ ] As novidades saem como texto, e o cartão desaparece quando não há nenhuma
- [ ] Confere com o desenho nos **dois temas**, sem hex solto em nenhum módulo
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **O cartão da sidebar** (task #85), **a faixa, o diálogo e o overlay** (task #86). Esta task entrega o `updateView.ts` que a #85 e a #86 consomem.
- **Pôr "Atualizações" no `NAV_ITEMS`.** O desenho não põe, e os dois caminhos até a tela chegam nas tasks #85 e #86.
- **Mexer nas outras telas** ou no `.content` do shell.
- **Estimativa de tempo "inteligente"** (média móvel, suavização). O valor cru do `bytesPerSecond`, ou nada.

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

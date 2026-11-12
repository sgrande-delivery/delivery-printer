# 85 — Cartão de atualização na barra lateral e navegação pela versão

**Issue:** [#85](https://github.com/sgrande-delivery/delivery-printer/issues/85)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 81, 83, 84
**Status:** pendente

## Objetivo

Dar à atualização um lugar **permanentemente visível**: o cartão na barra lateral que aparece sozinho quando há algo a fazer, e a linha da versão virando caminho até a tela. É o que faz o operador descobrir que existe atualização sem ter aberto a tela.

## Contexto

- Cobre **RF-03**, e as **RN-14** e **RN-15** da spec.
- O desenho é o bloco `<sc-if value="{{ sb.show }}">` de `../design/atualizacoes.dc.html`, **linhas 45-66**, e a tabela de estado → ícone/cor/título/subtítulo/botão é o `sidebarCard(S)`, **linha 344**.
- **Onde ele entra:** no pé da sidebar, **acima** do bloco de conexão. Em `src/renderer/components/layout/Sidebar.tsx` isso é dentro do `.footer` (`:129`), antes do `.status` (`:135-144`) — e depois do nome do restaurante (`:130-134`), que o desenho não tem e o app tem.
- **A linha da versão já existe e já tem a forma do desenho:** `Sidebar.tsx:167-175` mostra `v{packageJson.version} · {window.electron.arch}` e o botão "abrir logs". No desenho essa linha é um `<button onClick="{{ goUpdates }}">` (`:79`). Aqui ela ganha o `onClick` navegando para `/updates`, e o "abrir logs" ao lado **continua intocado**.
- **A versão mostrada continua vindo do `packageJson` importado** (`Sidebar.tsx:12`), não do `UpdateState`. São o mesmo valor, e o import já existe; trocar a fonte faria a linha ficar vazia enquanto o estado não chegasse.
- **Não monte o hook aqui.** A sidebar lê o contexto da task #81, como já lê `useShellConnection` por contexto. Montar `useAppUpdate` na sidebar daria um segundo listener e uma segunda leitura inicial.
- **A sidebar é redimensionável** (`SidebarResizeHandle`, e a largura vem de `userData`): o cartão tem de sobreviver à largura mínima sem estourar. Título e subtítulo truncam, como `.userEmail` já faz (`Sidebar.tsx:154`).
- **Botão dentro de região de arraste não recebe clique** sem `-webkit-app-region: no-drag` (RN-13 da spec 38). O topo da sidebar é região de arraste; o pé **não** é, então o cartão não precisa disso — mas vale conferir no Electron de verdade, porque o jsdom não prova nada sobre arraste.

## Mudanças

### 1. `updateView.ts` — a segunda metade da tabela

A função pura da task #84 ganha a vista do cartão da sidebar, no mesmo arquivo e com o mesmo teste:

```ts
export type SidebarUpdateView = {
  icon: IconName;          // new_releases | downloading | restart_alt | hourglass_top | error
  tone: UpdateTone;        // a cor do ícone
  title: string;
  subtitle: string;
  bar: boolean;            // a barra de 4 px, só em 'downloading'
  percent: number;
  button: { label: string; action: UpdateAction; variant: 'contained' | 'outlined' } | null;
} | null;                  // null = o cartão não aparece

export function buildSidebarUpdate(state: UpdateState): SidebarUpdateView
```

`null` nos estados `idle`, `checking` e `restarting` — o desenho só o mostra quando há ação pendente (`sidebarCard` devolve `show: false` no default). **`checking` não mostra nada**: verificação é barulho, não tarefa.

### 2. `src/renderer/components/layout/SidebarUpdateCard.tsx` (novo) + módulo

- Componente próprio, não um bloco solto dentro da `Sidebar.tsx` — ela já tem 182 linhas e três hooks.
- O par título/subtítulo é um `<button>` que navega para `/updates` (`:47` do desenho), com nome acessível que inclui os dois textos.
- A barra de progresso tem `role="progressbar"` com `aria-valuenow`, como o desenho (`:55`).
- O botão de ação usa o `Button` com altura **34** (o desenho dá `height:34px`, `:60` e `:63`), `contained` para o primário e `outlined` para o secundário. Fundo do cartão: `--side-2`.
- **Nada de hex solto:** o desenho escreve `#5A524E` na trilha da barra (`:55`) e na borda do botão secundário (`:63`). Isso é cor da barra lateral e não existe como token — avaliar `--side-muted`/`--side-badge` antes de criar token novo, e **se criar, nos dois temas** (`.claude/rules/renderer-ui.md`). O `#fff` sobre `--accent` e sobre `--side` é exceção legítima.

### 3. `Sidebar.tsx`

- O cartão no `.footer`, antes do `.status`, lendo o contexto.
- A linha da versão vira `<button>` navegando para `/updates`, mantendo o texto `v<versão> · <arch>` e o "abrir logs" ao lado. Ela é a **única** forma de chegar à tela quando o app está atualizado (o cartão não aparece), então sem ela a tela fica inalcançável metade do tempo.

## Testes

`src/renderer/components/updates/__tests__/updateView.test.ts` (alterado): uma asserção por linha da tabela do `sidebarCard`, e `null` em `idle`, `checking` e `restarting`.

`src/renderer/components/layout/__tests__/Sidebar.test.tsx` (alterado):

- Com estado `ready`, o cartão aparece com "Atualização pronta" e o botão "Reiniciar e atualizar"; clicá-lo chama a ação do contexto.
- Com `idle`, **nenhum** cartão — e o teste afirma a ausência, que é a metade que se esquece.
- Clicar no título do cartão navega para `/updates`.
- Clicar na linha da versão navega para `/updates`, e o "abrir logs" **continua** chamando `revealLogs` (não foi engolido pelo botão novo).
- Com `downloading`, a barra tem `aria-valuenow` igual ao percentual.
- Presença de classe por elemento contra `styles.<chave>`.

## Critérios de aceitação

- [ ] O cartão aparece em `available`, `downloading`, `ready`, `ready` + agendado e `error`, e **não** aparece em `idle`, `checking` e `restarting`
- [ ] Ele fica acima do bloco de conexão, no pé da sidebar
- [ ] Título, subtítulo, ícone, cor e botão batem com o `sidebarCard` do desenho nos cinco estados
- [ ] Clicar no cartão e clicar na linha da versão levam a `/updates`; "abrir logs" continua funcionando
- [ ] Na largura mínima da sidebar nada estoura: os textos truncam
- [ ] Nenhum hex solto nos módulos novos; token novo, se houver, está nos **dois** temas
- [ ] Confere com o desenho nos dois temas
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **A faixa, o diálogo e o overlay** — task #86.
- **Badge no item de menu** para atualização. O desenho não tem, e o cartão já é mais visível que um badge.
- **Mexer nos badges que já existem** (`/queue` e `/printers`, `Sidebar.tsx:79-82`).
- **Pôr "Atualizações" no `NAV_ITEMS`** (RN-14).

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

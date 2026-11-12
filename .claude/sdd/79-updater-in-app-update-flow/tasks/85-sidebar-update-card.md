# 85 — Cartão de atualização na barra lateral e navegação pela versão

**Issue:** [#85](https://github.com/sgrande-delivery/delivery-printer/issues/85)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** feat
**Processo:** renderer
**Depende de:** 81, 83, 84
**Status:** executada

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

- [x] O cartão aparece em `available`, `downloading`, `ready`, `ready` + agendado e `error`, e **não** aparece em `idle`, `checking` e `restarting`
- [x] Ele fica acima do bloco de conexão, no pé da sidebar
- [x] Título, subtítulo, ícone, cor e botão batem com o `sidebarCard` do desenho nos cinco estados
- [x] Clicar no cartão e clicar na linha da versão levam a `/updates`; "abrir logs" continua funcionando
- [x] Os textos truncam, e a largura mínima **subiu para 200 px** porque em 180 o rótulo do botão não cabia dentro do cartão (decisão do dev; a conta está na `## Implementação`). Mais `overflow: hidden` no cartão como rede. **O olho em 200 px fica para a verificação manual** — jsdom não tem layout
- [x] Nenhum hex solto além do `#fff` sobre `--side-2`/`--side` (exceção legítima), e o token novo `--side-warn` está nos **dois** temas, com o contraste medido e a regra atualizada
- [x] Geometria e tokens conferidos linha por linha contra o `sidebarCard`. **Os dois temas no olho ficam para a verificação manual**
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. A tela `/updates` deixou de ser alcançável só pela URL: agora tem **dois** caminhos, o cartão e a linha da versão, os dois com teste de navegação.

**`buildSidebarUpdate(state)`** entrou no **mesmo** `updateView.ts` da #84, e o `percentOf` passou a ser **exportado** e reusado — a sidebar mostra `v<x> · <pct>%` e a tela mostra `<pct>%`, e dois arredondamentos divergiriam por 1 em algum tique. Há teste do invariante (`percent: 99.5` nos dois builders). Devolve `null` em `idle`, `checking` e `restarting`, e o `default` do `switch` também devolve `null`: status futuro sem linha na tabela **não mostra cartão** em vez de mostrar um errado — o oposto do `buildUpdateCard`, cujo `default` afirma "você está na versão mais recente" (é por isso que a #84 precisou da linha `restarting`).

**`SidebarUpdateCard.tsx` + módulo**, componente próprio, no `.footer` depois do nome do restaurante e antes do bloco de conexão. Lê o contexto, não monta o hook. **A linha da versão virou botão** para `/updates`, mantendo o texto `v<versão> · <arch>`, e o **"abrir logs" ao lado continua chamando `revealLogs` e não navega** — tem teste provando que o botão novo não o engoliu.

### O que o review mudou

1. **A variante nova do `Button` estava na forma errada.** O diagnóstico do implementador era certo (o `outlined` usa `--text`, escuro no tema claro, então o botão secundário sairia ilegível sobre a barra escura), mas ele criou uma **prop booleana `onDark`**. A regra diz "uma classe no `.module.css` **e um valor na união**", e esta base não tem nenhum booleano de aparência em primitivo — aparência é sempre união fechada, e os booleanos que existem são estruturais (`fullWidth`, `dot`, `pressed`). Pior: `<Button variant="contained" onDark>` **compilava e não fazia nada**, e o teste afirmava esse silêncio como comportamento. Virou o valor **`outlinedOnDark`** na união; de quebra, caberia na tabela o que não tinha onde morar: o desenho dá ao secundário da sidebar **peso 500** (`:63`), contra os 600 do `outlined` de 34 px.
2. **Colisão de nome acessível:** o cartão da tela já era `<section aria-label="Atualização do aplicativo">`, e em `/updates` com atualização pendente os dois ficam visíveis ao mesmo tempo — duas regiões com o mesmo nome. O da sidebar virou **"Resumo da atualização"**.
3. **Quatro chaves de CSS escapavam** (`summary`, `texts`, `action` e `versionLink`), medidas por mutação contra a suíte inteira. Fechadas, uma asserção por chave.
4. O nome acessível do título virou asserção **ancorada** (`/^Atualização pronta\s?v2\.8\.0$/`), que prova os dois textos **e** que o glifo do `Icon` não entra no nome.

### As duas decisões do dev

5. **A largura mínima da sidebar subiu de 180 para 200 px.** Medido: em 180 sobram ~136 px dentro do cartão, e o rótulo "Reiniciar e atualizar" em 13 px/600 (~122 px, calculado em Arial Bold, a fonte mais larga da pilha) mais `padding 0 14px` e borda dá 152 px, mais 24 do cartão e 20 do `.footer` = **196**; arredondado para o próximo múltiplo de 4, **200**, com a conta escrita ao lado da constante. Continua **abaixo** dos 216 do desenho. Encurtar o rótulo foi recusado pelo dev. Entrou também `overflow: hidden` no `.root` do cartão, como rede: jsdom não tem layout, então a conta não é mensurável aqui.
   **Consequência em máquina de cliente:** instalação com largura salva abaixo de 200 tem a barra **pulando para 200** na primeira abertura, e o `readSidebarWidth` loga o valor fora de faixa a cada leitura até o operador arrastar de novo (o arquivo não é reescrito na leitura, por desenho).
6. **Token `--side-warn`, nos dois temas.** O ícone do reinício agendado era `--warn`, que no tema claro dá **2,07:1** sobre `--side-2` — abaixo dos 3:1 de AA para objeto gráfico. O token novo (`#ffcb5c`) dá **8,13:1** sobre `--side-2` e **9,83:1** sobre `--side` no claro; 8,65:1 e 11,10:1 no escuro. É o mesmo precedente do `--muted` da spec 38: contraste medido ganha do mock. A regra `.claude/rules/renderer-ui.md` foi atualizada (31 tokens, e o grupo "Barra lateral" ganhou o nome novo).

### Testes

- `updateView.test.ts` — uma asserção por linha da tabela do `sidebarCard`, `null` nos três estados que não mostram cartão, o invariante do `percentOf`, e o erro sem versão (sem `vnull`, e o `state.error` nunca vazando para o view).
- `Sidebar.test.tsx` — o cartão em `ready` com o botão certo chamando a ação do contexto; **a ausência afirmada** em `idle`, `checking`, `restarting` e `state === null`, mais um teste de que **sem o Provider nada aparece**; o título navegando; a linha da versão navegando **e** o "abrir logs" continuando a revelar os logs; `aria-valuenow` igual ao percentual em `downloading`; e uma asserção por chave de CSS, tons incluídos.
- `sidebarWidth.test.ts` — o mínimo novo, mais os casos `[199, MIN]` e `[180, MIN]` (o segundo é exatamente a largura antiga salva).

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **81 arquivos / 992 testes**, de 81/963.
- **Mutação:** 12/12 chaves do módulo novo, mais `versionLink` e as três do `Button` — todas pegas depois do conserto (antes, quatro escapavam).
- **Não verificado, e precisa do olho:** a largura do rótulo foi **estimada** por métrica de Arial Bold, não medida em Segoe UI; o contraste foi **calculado** pela fórmula WCAG a partir dos hex, não visto na tela. Vale abrir em 200 px nos dois temas e conferir o botão dentro do cartão e o ícone do reinício agendado.

## Fora de escopo

- **A faixa, o diálogo e o overlay** — task #86.
- **Badge no item de menu** para atualização. O desenho não tem, e o cartão já é mais visível que um badge.
- **Mexer nos badges que já existem** (`/queue` e `/printers`, `Sidebar.tsx:79-82`).
- **Pôr "Atualizações" no `NAV_ITEMS`** (RN-14).

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

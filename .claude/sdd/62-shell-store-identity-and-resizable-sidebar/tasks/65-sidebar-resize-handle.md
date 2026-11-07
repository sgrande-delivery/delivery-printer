# 65 — O punho de redimensionar a sidebar

**Issue:** [#65](https://github.com/sgrande-delivery/delivery-printer/issues/65)
**Feature:** [Identidade da loja e sidebar redimensionável no shell](../spec.md) — issue #62
**Tipo:** feature
**Processo:** renderer
**Depende de:** [#64](https://github.com/sgrande-delivery/delivery-printer/issues/64)
**Status:** pendente

## Branch

`feat/62-shell-store-identity-and-resizable-sidebar`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-07.

## Objetivo

O punho na borda direita da sidebar: arrasta com o mouse, funciona pelo teclado, cancela com `Escape`, volta ao padrão no duplo clique, e a largura escolhida sobrevive a reabrir o app.

## Contexto

- Cobre as **RF-03**, **RF-05**, **RF-06** e **RF-07** e as **RN-04**, **RN-05** e **RN-07** da spec
- **A task #64 já entregou** `src/shared/sidebarWidth.ts` (faixa + `clampSidebarWidth`) e o par de canais no preload. Esta task **consome**; não reescreve saneamento nem inventa faixa
- **A referência é o `delivery-admin`**, branch `feat/admin-v2`, e vale ler os três antes de codar: `src/components/resize-handle/ResizeHandle.tsx` (o punho genérico, com os comentários que explicam cada decisão), `src/components/sidebar/SidebarResizeHandle.tsx` (a fiação) e `src/helpers/sidebarWidth.ts` (o `applySidebarWidth`, que é só `documentElement.style.setProperty`)
- **O que o porte traz de lá:** punho absoluto na borda direita, `setPointerCapture` no `pointerdown`, `Escape` ouvido no **`window`** (durante o arrasto o ponteiro está capturado mas o foco pode estar em qualquer lugar), um atributo em `document.body` enquanto arrasta (cursor e `user-select` da página inteira), limpeza na desmontagem (o punho pode deixar de ser renderizado no meio de um arrasto e deixar a página com `col-resize` para sempre), e a largura escrita numa **CSS var** a cada `pointermove`
- **O que não vem:** o `localStorage` (aqui a persistência é a da #64, RN-03), o `zIndex: 3` (era para passar por cima das sub-sidebars do painel, que aqui não existem) e o modo recolhido (fora do escopo da spec)
- **O que o admin não precisa e aqui é obrigatório:** `-webkit-app-region: no-drag` no punho (RN-05). O topo da sidebar é região de arraste da **janela** (`Sidebar.module.css:19`), e elemento dentro de região `drag` **não recebe mouse**. Se o punho atravessar aquela faixa sem `no-drag`, ele simplesmente não arrasta — e **o jsdom não pega isso**: apagar o `no-drag` sobrevive à suíte inteira. Só Electron de verdade mostra
- **A largura fixa de hoje** está em `Sidebar.module.css:3` (`width: 216px`) e passa a ser `var(--sidebar-width, 216px)` — o fallback é o que mantém a sidebar com a largura do desenho se a var nunca for escrita (preferência ausente, ou o renderer carregado sem o preload num teste)
- **O `AppShell` não pode remontar** ao mudar a largura (RN-07): ele é o dono único dos hooks de socket e de impressão, e remontar derruba a conexão — o restaurante pararia de imprimir enquanto alguém mexe na barra. É por isso que o arrasto escreve CSS var e o estado muda **uma vez**, no commit
- Decisão pendente **3** da spec: **16 px por seta**, sem `Home`/`End`

## Mudanças

### 1. `src/renderer/components/layout/SidebarResizeHandle.tsx` + `.module.css` (novos)

Componente do shell, não primitivo de `base/` (um consumidor; a regra pede duas telas). Props enxutas: a largura atual, o `onCommit`, e nada mais — a faixa vem de `src/shared/sidebarWidth.ts`.

O que precisa de comentário porque não se lê do código:

- **por que o `Escape` é ouvido no `window`** e não no punho;
- **por que a limpeza na desmontagem desfaz o arrasto** (atributo grudado no `body` + var na largura arrastada enquanto o valor commitado é o antigo);
- **por que a largura vai em CSS var** e não em estado (RN-04, com o motivo do socket);
- **o `no-drag`** (RN-05), com o aviso de que o teste não cobre.

Acessibilidade: `role="separator"` com `aria-orientation="vertical"`, `aria-label="Largura do menu"` (o rótulo do admin), `tabIndex={0}`, foco visível por `:focus-visible` com os tokens, e `aria-valuenow`/`aria-valuemin`/`aria-valuemax` — que é o que faz as setas terem sentido para quem não vê o arrasto.

### 2. `Sidebar.tsx` e `Sidebar.module.css` (alterados)

O `.root` ganha `position: relative` (se ainda não tiver) e a largura passa a `var(--sidebar-width, 216px)`. O punho é renderizado dentro da sidebar, na borda direita, **abaixo** da faixa de arraste da janela ou com `no-drag` — o que o olho aprovar em `npm run dev`.

A largura inicial vem da preferência (canal da #64) e é aplicada na CSS var no primeiro efeito. **Decisão pendente 2 da spec:** o salto da primeira pintura é aceito; não vá atrás do `additionalArguments` sem a decisão do dev.

### 3. `.claude/sdd/38-ui-redesign-shell-and-screens/spec.md` (alterado)

A linha **18** da tabela "Fidelidade ao desenho": o desenho dá à sidebar largura fixa de 216 px, e aqui ela passa a ser arrastável numa faixa, com o 216 como **padrão**. O **por quê**: nome de impressora do Windows e de setor são longos, e o monitor do balcão varia. Não conserte o parágrafo "São doze linhas".

## Testes

### `src/renderer/components/layout/__tests__/SidebarResizeHandle.test.tsx` (novo)

Sob jsdom, com eventos de ponteiro sintéticos (`pointerdown`/`pointermove`/`pointerup`) — o jsdom não tem `setPointerCapture`, então ele precisa de stub no elemento, e **isso vale um comentário no teste** para o próximo não achar que é mock desnecessário:

- Arrastar 40 px à direita escreve a CSS var com a largura inicial + 40, e **não** chama `onCommit` ainda
- `pointerup` chama `onCommit` **uma vez**, com a largura final clampada
- Arrastar além do máximo e abaixo do mínimo comita **dentro da faixa**
- `Escape` no meio do arrasto: a var volta à largura inicial e `onCommit` **não** é chamado
- Duplo clique comita o padrão
- Setas mudam a largura em 16 px e comitam; tecla que não é seta não faz nada
- `aria-valuenow` acompanha a largura; `role`, `aria-orientation` e o rótulo estão lá
- Desmontar no meio do arrasto limpa o atributo do `body` e devolve a var
- Presença por chave de `styles` e `expectNoUndefinedClasses()`

### `src/renderer/components/layout/__tests__/Sidebar.test.tsx` (alterado)

- A sidebar aplica a largura que veio da preferência na CSS var, e usa o **padrão** quando o canal rejeita ou devolve lixo
- O commit chama o canal de gravação **uma vez** por arrasto
- O `AppShell` **não** remonta: um teste que conte renders do shell (ou monte um marcador que morreria na remontagem) ao mudar a largura — é a RN-07, e é a que custa impressão parada se cair

**Verificar por mutação:** trocar a CSS var por `setState` tem de derrubar o teste de remontagem; comitar a cada `pointermove` tem de derrubar o "uma vez por arrasto"; tirar o clamp tem de derrubar os testes de faixa; tirar o `Escape` tem de derrubar o dele. **O `no-drag` não tem mutação que o pegue** — é verificação de olho, e está na lista de entrega da spec.

## Critérios de aceitação

- [ ] Em `npm run dev`: arrastar muda a largura na hora, sem piscar, e o app continua imprimindo durante o arrasto
- [ ] `Escape` volta à largura de antes; duplo clique volta ao padrão
- [ ] Tab chega ao punho com foco visível e as setas mudam a largura
- [ ] Fechar pela bandeja e reabrir mantém a largura **e** o tema (o teste da RN-01 da #64, agora de ponta)
- [ ] No mínimo da faixa, nenhum rótulo do menu fica cortado — se ficar, o mínimo sobe e a decisão pendente 1 é atualizada
- [ ] O punho recebe o mouse no Electron real (RN-05)
- [ ] A linha 18 está na tabela de fidelidade da spec 38
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

# 63 — O nome da loja no pé da sidebar

**Issue:** [#63](https://github.com/sgrande-delivery/delivery-printer/issues/63)
**Feature:** [Identidade da loja e sidebar redimensionável no shell](../spec.md) — issue #62
**Tipo:** feature
**Processo:** renderer
**Depende de:** —
**Status:** executada

## Branch

`feat/62-shell-store-identity-and-resizable-sidebar`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-07. Todas as tasks da spec rodam nela, um commit por task.

## Objetivo

Fazer o app dizer **qual loja** este PDV imprime, em qualquer tela. É a menor task da spec e entrega valor sozinha: o suporte deixa de precisar abrir a tela de impressão para conferir se a instalação está apontada para o restaurante certo.

## Contexto

- Cobre a **RF-01**, a **RF-02** e a **RN-08** da spec
- **O dado já está lá:** `const { restaurant, user } = useAuth()` (`src/renderer/components/layout/Sidebar.tsx:26`), e `restaurant?.is_open` já é consumido no pé (`:93-94`). Nenhuma requisição nova, nenhum canal, nenhum provider
- **Onde entra:** o `.footer` (`Sidebar.module.css:112`) tem o bloco `.status` com as duas linhas de ponto + texto (`.statusLine`, `:129`) e, abaixo, o bloco `.user` (`:150`) com avatar, nome, e-mail e o botão de sair. A decisão do dev é o nome da loja **no pé, junto da linha de loja aberta** e **acima** do bloco do usuário
- **A sidebar é estreita** (216 px hoje, e a task #65 vai permitir menos): nome de restaurante real passa fácil de 30 caracteres. O `.userName`/`.userEmail` (`:178`, `:186`) já resolvem isso — veja como, e siga o mesmo caminho em vez de inventar outro
- **O topo da sidebar é região de arraste da janela** (`.brand`, `-webkit-app-region: drag`, `:19`). Nada desta task entra ali, mas não mova o `.footer` para cima sem ler a RN-05 da spec
- O `restaurant` pode ser `null` num instante de carregamento (o `Sidebar` já o acessa com `?.`): sem nome, a linha não aparece — e não aparece **vazia**

## Mudanças

### 1. `src/renderer/components/layout/Sidebar.tsx` (alterado)

No `.footer`, antes do bloco `.status` ou junto dele (o que ficar melhor contra o desenho — a ordem de leitura natural é "esta loja" → "como ela está"), uma linha com o nome do restaurante, renderizada **só quando houver nome**.

Dois pontos que o review vai cobrar:

- **`title` com o nome inteiro**, porque o visível é truncado (RF-02). É o que dá ao operador como ler um nome que não cabe
- **Nada de `aria-label` redundante** nem de `role`: é texto. O que ele precisa é ser lido como texto na ordem certa

### 2. `Sidebar.module.css` (alterado)

Uma classe para a linha, no ritmo do `.footer` que já existe. O truncamento é o do `.userName`: `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` — e o contêiner precisa de `min-width: 0` para o `ellipsis` funcionar dentro de flex (o `.userText` já faz isso, `:174`). Peso e cor pelos tokens: o nome da loja é informação de primeira linha no pé, então `--text`; se precisar de rótulo ("Loja", "Restaurante"), ele é `--muted` em 12 px, como as outras dicas.

Sem hex, sem token novo. Se a cor que você quiser não existir, ela entra no `app.css` nos **dois** temas, com o contraste medido contra os três fundos — e aí vale lembrar o que a spec 56 mediu: `--muted` falha em AA sobre `--accent-soft`, e o fundo da sidebar é `--side`, um quinto fundo que ninguém mediu ainda.

### 3. `.claude/sdd/38-ui-redesign-shell-and-screens/spec.md` (alterado)

A linha **17** da tabela "Fidelidade ao desenho" (`:33-49`): o desenho não mostra o nome do restaurante na sidebar (`printer-v2.dc.html`), e aqui ele passa a aparecer no pé. O **por quê**: o desenho foi feito antes de o app ser usado por suporte, e a informação que falta num app de uma-loja-por-instalação é a loja. Siga o formato e o tom das 16 linhas existentes, e **não** conserte o parágrafo "São doze linhas" — é dívida anotada no plan da spec 56.

## Testes

### `src/renderer/components/layout/__tests__/Sidebar.test.tsx` (alterado)

O arquivo já existe e já monta a sidebar com o `useAuth` mockado — leia antes e siga as convenções dele.

- O nome do restaurante aparece no pé, e **dentro** do `.footer` (asserção de contenção, não só de presença na tela)
- Ele vem **antes** do bloco do usuário na ordem do DOM: é a decisão do dev, e inverter sobrevive a um teste que só olhe presença
- `restaurant` sem nome (`null`, `undefined`, `''`): a linha **não** é renderizada, e não sobra contêiner vazio
- Nome longo: o elemento tem o `title` com o nome **inteiro**
- Presença por chave de `styles` na classe nova, e `expectNoUndefinedClasses()`

**Verificar por mutação:** tirar o `title` tem de derrubar o teste do nome longo; mover a linha para depois do bloco do usuário tem de derrubar o teste de ordem.

## Critérios de aceitação

- [ ] Em `npm run dev`, logado, o nome da loja aparece no pé da sidebar nas seis telas
- [ ] Nome de 60 caracteres é truncado, mostra o inteiro no `title` e não empurra nem corta o bloco do usuário
- [ ] Sessão sem restaurante não deixa linha vazia nem buraco no pé
- [ ] A linha 17 está na tabela de fidelidade da spec 38
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

Executada em 2026-11-07. Três arquivos de código e uma linha de doc.

### O que ficou

`{restaurant?.name && <div className={styles.storeName} title={restaurant.name}>}` no `.footer`, **antes** do bloco `.status` — a ordem de leitura é "qual loja" → "como ela está" → "quem está logado". Sem nome (`null`, `undefined`, `''`) não há linha e o primeiro filho do pé continua sendo o `.status`.

**Sem rótulo "Loja:".** A caixa útil tem 188 px hoje (216 − 2×10 do `.footer` − 2×4 do `.storeName`), e a task #65 vai levá-la a ~152 px no mínimo da faixa: um rótulo comeria ~45 px do orçamento de truncamento da informação que a spec existe para mostrar, e a linha "Loja aberta/fechada" logo abaixo já dá o contexto.

### A cor divergiu da task, e foi isso que evitou um defeito

A task sugeria `--text`. **No tema claro `--text` é `#2b2725`, o mesmo valor de `--side`** (`app.css:17` e `:36`): seguir a letra teria pintado o nome da loja invisível sobre a sidebar clara. Entrou `--side-text`, que é a cor do conteúdo da sidebar (`.item`, `.brandProduct`) e existe nos dois temas.

O review mediu o contraste, e com isso o **quinto fundo do app deixa de ser território não medido**:

| par | claro | escuro |
| --- | --- | --- |
| `--side-text` sobre `--side` | **9,74:1** | **11,01:1** |
| `--side-text` sobre `--side-2` | 8,06:1 | 8,58:1 |
| `--side-muted` sobre `--side` | 4,82:1 | **4,59:1** |

Os dois primeiros passam AAA; o `--side-muted` fecha AA raspando no escuro — informação para quem for mexer naquele token.

### O que entrou depois do review

- **Bloqueante: a suíte nova fazia requisição real.** O `Sidebar` monta `usePrinters()`, cujo store singleton dispara `fetchPrinters()` no primeiro assinante — e o arquivo mockava `auth` e `messaging`, mas não `renderer/services/printers`. Medido pelo review: **7 GETs para `api-dev.sgrande.delivery` por `npm test`**, contra a invariante escrita no `vitest.config.ts:8` ("Tests never reach the network") e divergindo das outras oito suítes que montam `usePrinters`. Pior modo de falha: o erro cai no `log.error`, que é `window.electron.log` (um `vi.fn()`), então **nada aparece** — a suíte só fica mais lenta e o stderr enche de avisos de `act()`.
- **Bloqueante: `as unknown as` na fixture.** O duplo cast apagava a checagem do objeto **inteiro**, não só do `name`: o dia em que `shell.auth.restaurant` mudar de forma, o teste continuaria compilando e verde sobre um objeto que o provider real já não devolve. O campo entrou no tipo compartilhado (`shellMocks.ts`, `name?: string | null`) — e ele **pertence** à fixture, porque é o `Sidebar` que passou a ler `restaurant.name`. Conferido que o `AppShell.test.tsx` atribui sem `name`, então opcional não quebra ninguém.
- Os **7 avisos de `act()`** foram a zero com o `await waitFor(() => expect(fetchPrinters).toHaveBeenCalled())` do render helper — que de carona prova que o mock está em vigor: com o módulo real, `fetchPrinters` não é um `vi.fn` e a asserção não existiria.
- **O comentário do `min-width: 0` afirmava um mecanismo falso** ("keeps a long name from widening the footer"): o `.footer` não pode ser alargado pelo nome, porque a largura dele vem do `.root`; e em flex **em coluna** o `min-width` é eixo cruzado, onde `auto` já computa 0 — a declaração era inerte. Saiu, e o comentário passou a dizer o que de fato sustenta o `ellipsis`: a largura definida que o `.root` dá.

### Testes

7 casos em `src/renderer/components/layout/__tests__/Sidebar.test.tsx` — **arquivo novo**: a task errou ao dizer que ele já existia (havia só o `SidebarFetching.test.tsx`), e as convenções foram tiradas de lá. Suíte em **70 arquivos / 744 testes**.

Três mutações, todas mortas: tirar o `title` (cai o teste do nome longo), mover a linha para depois do bloco do usuário (cai o de ordem, assertado por `compareDocumentPosition`), renomear a chave no `.module.css` (cai 1 — e aqui a armadilha do `toHaveClass(undefined)` não se aplica, porque o elemento não tem outra classe).

### Não verificado

A sidebar **renderizada**: o `ellipsis` na tela, a aparência nos dois temas e o nome longo contra o mínimo de 180 px que a #65 vai permitir. jsdom não calcula layout. **Para o olho do dev:** o nome da loja ficou em `--side-text` enquanto `.userName` e `.brandName` são `#fff` — ou seja, a informação que esta spec existe para dar está um degrau **abaixo** do nome do usuário na hierarquia de cor. Pode estar certo, pode não; é decisão de olho.

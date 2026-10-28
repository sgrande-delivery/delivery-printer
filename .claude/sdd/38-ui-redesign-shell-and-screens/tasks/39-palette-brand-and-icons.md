# 01 — Paleta, marca e fonte de ícones

**Issue:** [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** —
**Status:** executada

## Objetivo

Pôr no repo as três coisas que todas as outras onze tasks consomem — os tokens das duas paletas, os ativos de marca e a fonte de ícones — sem mudar layout nenhum. No fim desta task o app tem a cara **colorida** do desenho e a estrutura antiga.

## Contexto

- Os tokens de hoje (`src/renderer/app.css:7-29`) são os valores que o **MUI v4 resolvia em runtime**, transcritos para a aparência não mudar na saída do boilerplate. Eles cumpriram o papel e agora saem.
- Os tokens do desenho estão em `../design/printer-v2.dc.html:13` (tema claro, `:root`) e `:14` (tema escuro, `[data-theme="escuro"]`). **São 26 tokens em cada bloco, e é esse hex que entra** — RN-15. O atributo aqui é `data-theme="dark"`, não `escuro`: identificador é em inglês (RN-14).
- **Não renomear as 14 folhas de estilo nesta task.** Os nomes antigos continuam existindo como apelido do token novo, e é isso que permite as próximas tasks irem uma a uma com cada commit coerente (decisão arquitetural do plan). A task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50) apaga os apelidos.
- **Dois acertos de tipografia que não são cosméticos:** o desenho usa `font-size:14px` no quadro (`:25`) — o mesmo `0.875rem` de hoje — mas pesos **400/500/600/700**, enquanto os tokens atuais são `200/300/400` (`app.css:26-28`, herança do MUI v4 deste projeto). Texto corrido do app hoje é **300**, e no desenho é **400**. A família de fonte é idêntica nos dois (`app.css:21-23` e `:17` do desenho), então não há fonte de texto a empacotar.
- **A fonte de ícones é empacotada, não vem do Google Fonts** (divergência 1 da tabela de fidelidade, RN-01): o desenho tem um `<link>` para `fonts.googleapis.com` na linha 11, e essa linha não atravessa. O PDV pode estar sem internet exatamente quando precisa imprimir, e é esse o defeito do logo do login hoje.
- **O `react-icons` não serve para este desenho.** Ele está instalado e é usado em `RestaurantStatus.tsx:2`, mas `stacks` e `skillet` não existem no conjunto Material dele, e fidelidade literal com glifo aproximado não é fidelidade.
- Cobre a **RN-01**, a **RN-11** e a **RN-15**.

## Mudanças

### 1. `src/renderer/app.css` — os tokens das duas paletas

Substituir o bloco `:root` pelos 26 tokens da linha 13 do desenho, e acrescentar o bloco `[data-theme="dark"]` com os 26 da linha 14. Manter o comentário de cabeçalho explicando a origem — trocando "os valores que o MUI resolvia" por "os valores do desenho, `design/printer-v2.dc.html:13-14`".

Acrescentar os pesos que o desenho usa:

```css
--font-weight-regular: 400;   /* era 300 */
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

E a camada de apelido, **com comentário dizendo que é temporária e de quem é a task que a remove**:

```css
/* Apelidos da paleta antiga. Existem para as tasks desta spec irem uma a uma;
   a task #50 os apaga depois de a última tela migrar. */
--color-primary: var(--accent);
--color-primary-light: var(--accent-hover);
--color-error: var(--err);
--color-success: var(--ok);
--color-text: var(--text);
--color-text-secondary: var(--text-2);
--color-divider: var(--line);
--color-input-border: var(--muted);
--color-secondary: var(--side-2);
```

`body` passa a usar `background-color: var(--bg)` e `color: var(--text)` (hoje são `#fff` e `#212529` crus, `app.css:46-47`), e a barra de rolagem usa `var(--line)` em vez de `#c6c6c6` (`app.css:81-87`). A `@media (min-width: 1200px)` em volta da barra de rolagem **sai**: a janela tem 1024 px, então a regra nunca valeu — a barra de rolagem do desenho existe na área de conteúdo em qualquer largura.

O `font-weight` do `body` continua lendo `var(--font-weight-regular)`, então o texto do app todo passa de 300 para 400 **nesta task**. É intencional e é a mudança mais visível dela.

### 2. Os ativos já estão no repo — conferir, não buscar

A marca e a fonte **já foram colocadas no repo** antes desta task, porque dependiam de acesso ao projeto do Claude Design e de rede, que o executor da task não tem. Estão documentadas na procedência:

| Arquivo | Tamanho | Onde é exibido |
| --- | --- | --- |
| `src/renderer/images/brand/simbolo-negativo.png` | 96×96 | sidebar (30 px) e telas de estado no tema escuro (26 px) |
| `src/renderer/images/brand/simbolo.png` | 96×96 | telas de estado no tema claro (26 px) |
| `src/renderer/images/brand/logo-horizontal-negativo.png` | 371×144 | painel de marca do login (190 px) |
| `src/renderer/fonts/material-symbols-outlined-subset.woff2` | 20 860 bytes | todos os ícones |

Ler os dois README ao lado deles (`images/brand/README.md` e `fonts/README.md`): eles registram a procedência, as medidas e as armadilhas. **Nada a baixar nesta task.**

Importar por `import logo from 'renderer/images/brand/logo-horizontal-negativo.png'`, que o Vite resolve; **não** montar caminho em string. Conferir que o `env.d.ts` declara os módulos de imagem e de fonte — se não declarar, o `tsc` reclama do import, e a declaração entra aqui.

### 3. `app.css` + `src/renderer/base/Icon.tsx` — os ícones

`@font-face` em `app.css` apontando para o woff2 local, com `font-display: block` (ícone que aparece como palavra por meio segundo é pior que ícone que aparece tarde) e as `font-variation-settings` da linha 20 do desenho.

**A armadilha, medida e não adivinhada:** o desenho declara `-webkit-font-feature-settings: 'liga'`, mas esta fonte **não usa `liga`** — as ligaduras vivem num *extension lookup* (GSUB tipo 7) nas features **`rlig`** e **`rclt`**. `rlig` é *required ligature* e o Chromium a aplica **por padrão**, então a linha do desenho funcionaria por acidente e mexer nela acreditando que é ela quem liga os ícones quebraria tudo sem explicação. Declare `font-feature-settings: 'liga' 1, 'rlig' 1` para ser explícito, ou nada.

`src/renderer/base/Icon.tsx` + `.module.css` (novos): recebe `name`, `size` (default 20, como o desenho) e `className`; renderiza `<span className={styles.icon} aria-hidden>{name}</span>`. O `name` é uma **união literal com os 34 símbolos**, para nome errado virar erro de tipo em vez de palavra solta na tela:

```
add · arrow_back · cancel · check · check_circle · chevron_right · close · cloud_done ·
cloud_off · error · history · hourglass_top · info · logout · person · print ·
progress_activity · radio_button_checked · radio_button_unchecked · receipt · receipt_long ·
remove · schedule · search · skillet · space_dashboard · stacks · table_restaurant ·
task_alt · tune · two_wheeler · visibility · visibility_off · warning
```

**A união e o recorte da fonte são a mesma lista.** Acrescentar nome na união sem regerar o woff2 (receita no `fonts/README.md`) dá ícone que não existe na fonte — e o `aria-hidden` garante que o leitor de tela não leia a palavra, mas a tela mostra. Se a task que vier precisar de ícone novo, ela rege o recorte.

O `crop_square` da linha 513 do desenho **não entra**: ali o desenho está desenhando os três botões nativos do Windows, que neste app são o `titleBarOverlay` (RN-04).

### 4. `vitest.config.ts` — fora do escopo declarado, e por quê

Acrescentar `css: { include: [/\.module\.css$/] }` ao `test` do `vitest.config.ts`.

**Medido em 2026-10-28:** sem essa linha o Vitest **não** processa os CSS Modules, e chave digitada errada **não vira `undefined`** — ele devolve um nome hasheado para a classe inexistente (`styles.chaveQueNaoExiste` → `"_chaveQueNaoExiste_1809c2"`). Com isso, o `expectNoUndefinedClasses()` **nunca falha**, e a RN-10 e o critério de aceitação desta própria task seriam asserções vazias. Com a linha, a chave errada vira `undefined`, o DOM recebe `class="undefined …"` e o helper falha.

A suíte foi medida nos dois casos: **213 de 214 passando**, mesma falha pré-existente. A linha entra aqui, e não em task própria, porque as onze tasks seguintes têm esse helper no critério — deixá-lo morto seria escrever onze tasks de teste contra uma rede que não pega nada.

### 5. Nada mais

Não mexer em componente, em layout nem em `RestaurantStatus.tsx`. Se uma cor ficar estranha porque a folha antiga assume fundo branco, **anotar e deixar** — a tela dela tem task própria.

## Testes

### `src/renderer/base/__tests__/Icon.test.tsx` (novo)

- Renderiza o nome como conteúdo, com a classe do módulo e `aria-hidden`
- `size` muda a medida aplicada; o default é 20
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test` — nenhum erro novo, e os testes existentes continuam passando (eles não afirmam cor)
- `npm run dev` e olhar as quatro telas de hoje: a paleta mudou, o layout não
- `npm run build` e **reportar o tamanho do bundle do renderer** antes e depois
- Com a rede da máquina desligada, abrir o app: nenhum ícone fica como texto, nenhum logo fica vazio. Com o DevTools na aba Network, **zero** requisição a domínio externo

## Critérios de aceitação

- [ ] Os 26 tokens de cada tema estão no `app.css` com o hex do desenho, conferidos um a um contra `design/printer-v2.dc.html:13-14`
- [ ] `document.documentElement.dataset.theme = 'dark'` no console do DevTools troca a paleta inteira (ainda sem ninguém que o faça por conta própria — é a task #40)
- [ ] Os três ativos de marca são importados pelo Vite, não por URL, e o `env.d.ts` declara os módulos
- [ ] A fonte de ícones é local, e os 34 símbolos renderizam sem internet (olhar humano: ícone ausente aparece como a palavra, ou como nada)
- [ ] Nome de ícone fora da união não compila
- [ ] Peso do bundle reportado, comparado com uma worktree limpa no `HEAD` (não com os 518 kB do `CLAUDE.md`, que são de antes das specs 11, 15 e 19)
- [ ] `expectNoUndefinedClasses()` **falha** quando a chave está errada — verificado por mutação, não por leitura
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Trocar `--color-*` por `--text`/`--accent` nas folhas existentes — é a task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50)
- Ligar o tema a algo (task [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40))
- Tirar o `react-icons` do `RestaurantStatus` ou do `package.json` — task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50), se não sobrar uso
- Qualquer mudança de layout

## Implementação

**Concluída em:** 2026-10-28

### Arquivos

Novos: `src/renderer/base/Icon.tsx` + `Icon.module.css` (+ teste), `src/renderer/fonts/material-symbols-outlined-subset.woff2` + `README.md`, `src/renderer/images/brand/` com três PNG + `README.md`.
Alterados: `src/renderer/app.css` (tokens das duas paletas, pesos, apelidos, `@font-face`, barra de rolagem), `vitest.config.ts` (a linha do `css`, seção 4 acima).

### A rede de teste desta base estava morta, e foi por aqui que apareceu

Verificando por mutação (`styles.icon` → `styles.ikon`), **só 1 dos 3 testes caiu**, e não foi o do `expectNoUndefinedClasses()`. Investigando: sem `css` ligado, o Vitest devolve um nome **hasheado para a classe inexistente**, nunca `undefined`, então o helper não tinha como falhar — e `cx()` descarta falsy, o que transforma chave errada em **classe ausente**, não em `class="undefined"`. Os dois caminhos passavam pela rede.

Duas consequências entraram no `plan.md`: a linha do Vitest (que ressuscita o helper, medida com a suíte antes e depois) e a regra de que teste de componente com `cx()` tem de **afirmar que a classe esperada está lá**, porque o helper sozinho não cobre esse caminho.

### Decisões

- **Nada no `env.d.ts`:** `*.png` já estava declarado e `*.woff2` vem do `vite/client` (o review provou com arquivo-sonda: o import em TSX das tasks 03 e 04 compila hoje, typecheck 0)
- **`style={{ fontSize: size }}`** para o tamanho: valor de prop resolvido em runtime, que é o caso que a regra permite. Enumerar uma classe por tamanho seria infidelidade por construção, porque o desenho usa dezenas de tamanhos
- **`.root` em vez de `.icon`** para a classe base, como os outros seis primitivos de `base/`; o teste afirma contra `styles.root`, não contra a substring `'icon'`, que um `className` externo como `iconButton` satisfaria
- **`@font-face` com `font-weight: 300 500`**, o intervalo do eixo variável que o recorte pediu, em vez de `400` fixo
- **Sem `unicode-range`:** o recorte está no arquivo. Restringir o range ao PUA faria as letras latinas do texto da ligadura não usarem a fonte, e **todo ícone sairia escrito**

### Testes

4 no `Icon`: nome como conteúdo com `aria-hidden` e a classe base; tamanho default e aplicado; `className` externo preservado mais o helper; e a **paridade entre a união de nomes e a lista `icon_names` do `fonts/README.md`**, que é a rede contra as duas listas divergirem.

Mutações verificadas: classe errada → 1 falha; nome acrescentado à união sem regerar o recorte → 1 falha.

### Verificação

typecheck **0** · lint **0 erros e 1 aviso** (o da base, `Login.tsx:23`) · `npm test` **35 arquivos, 215 testes, 214 passando**, com a única falha sendo a pré-existente do `ui.test.tsx` (regex de versão contra `2.7.0-dev.1`).

**Bundle, medido em worktree limpa no `HEAD` contra a task:** JS do renderer **557,59 kB nos dois** — a task não acrescenta JS nenhum; CSS **17,72 → 19,11 kB** (+1,39); mais o woff2 de **20,86 kB** emitido como asset separado, com o CSS referenciando-o por caminho **relativo** (`url('./material-symbols-outlined-subset-….woff2')`), o que resolve sob `file://` no app empacotado — é isso que fecha a RN-01 em produção, não só em dev. Os ~40 kB a mais que os 518 kB do `CLAUDE.md` são crescimento das specs 11, 15 e 19.

### O que não foi verificado

As duas conferências humanas que a task pede: `npm run dev` nas quatro telas de hoje (a paleta mudou, o layout não) e o app com a máquina **sem rede**, com a aba Network em zero requisição externa. A cobertura glifo-a-glifo das 34 ligaduras dentro do woff2 também não foi verificada por ferramenta (não há `fontTools` nesta máquina); a evidência é o `fonts/README.md` e o olhar humano.

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

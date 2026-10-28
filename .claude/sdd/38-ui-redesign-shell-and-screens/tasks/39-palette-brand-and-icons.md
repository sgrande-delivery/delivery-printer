# 01 — Paleta, marca e fonte de ícones

**Issue:** [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** —
**Status:** pendente

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

### 2. `src/renderer/images/brand/` — a marca no pacote

Quatro arquivos, do pacote de marca que o projeto do Claude Design carrega em `uploads/sgrande-assets-nova/logo/`:

| Arquivo | Onde é usado |
| --- | --- |
| `logo-horizontal-negativo.svg` | painel escuro do login (`:439` do desenho) |
| `simbolo-negativo.svg` | topo da sidebar (`:30`) e telas de estado no tema escuro (`:473`) |
| `simbolo.svg` | telas de estado no tema claro (`:473` lê `symbolSrc`, que alterna pelo tema) |
| `logo-horizontal.svg` | nenhum uso hoje; entra porque o par existe e a próxima tela clara que precisar de logo não vai buscar na internet |

**Como obtê-los:** eles estão no projeto do Claude Design, em `uploads/sgrande-assets-nova/logo/`, acessíveis pelo MCP do Claude Design (`get_file`, que devolve base64) ou pelo pacote `sgrande-assets-nova` que o dev já tem. O desenho referencia os `@2x.png`; **preferir os `.svg` do mesmo diretório** — a janela tem escala variável no Windows e o SVG não tem versão errada para escolher.

Importar por `import logo from 'renderer/images/brand/logo-horizontal-negativo.svg'`, que o Vite resolve; **não** montar caminho em string.

### 3. `src/renderer/fonts/` + `src/renderer/base/Icon.tsx` — os ícones

Baixar a Material Symbols Outlined (variável, `.woff2`) para `src/renderer/fonts/`, declarar o `@font-face` em `app.css` com `font-display: block` (ícone que aparece como texto por meio segundo é pior que ícone que aparece tarde) e as `font-variation-settings` da linha 20 do desenho.

`src/renderer/base/Icon.tsx` + `.module.css` (novos): recebe `name`, `size` (default 20, como o desenho) e `className`; renderiza `<span className={styles.icon} aria-hidden>{name}</span>`. O `name` é uma **união literal com os 34 símbolos que o desenho usa**, para nome errado virar erro de tipo em vez de quadrado vazio na tela:

```
add · arrow_back · cancel · check · check_circle · chevron_right · close · cloud_done ·
cloud_off · error · history · hourglass_top · info · logout · person · print ·
progress_activity · radio_button_checked · radio_button_unchecked · receipt · receipt_long ·
remove · schedule · search · skillet · space_dashboard · stacks · table_restaurant ·
task_alt · tune · two_wheeler · visibility · visibility_off · warning
```

O `crop_square` da linha 513 do desenho **não entra**: ali o desenho está desenhando os três botões nativos do Windows, que neste app são o `titleBarOverlay` (RN-04).

Se der para recortar a fonte por `unicode-range` nos símbolos usados, recortar — mas **medir antes e depois**, e reportar o peso no bundle (baseline 518 kB). Peso é critério, não palpite.

### 4. Nada mais

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
- [ ] Os quatro ativos de marca estão no repo e são importados pelo Vite, não por URL
- [ ] A fonte de ícones é local, e os 34 símbolos renderizam sem internet
- [ ] Nome de ícone fora da união não compila
- [ ] Peso do bundle reportado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Trocar `--color-*` por `--text`/`--accent` nas folhas existentes — é a task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50)
- Ligar o tema a algo (task [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40))
- Tirar o `react-icons` do `RestaurantStatus` ou do `package.json` — task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50), se não sobrar uso
- Qualquer mudança de layout

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

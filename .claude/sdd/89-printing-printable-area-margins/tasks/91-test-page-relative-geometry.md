# 91 — Página de teste diagramada como o comprovante, e a régua dizendo a verdade

**Issue:** [#91](https://github.com/sgrande-delivery/delivery-printer/issues/91)
**Feature:** [Imprimir dentro da área imprimível do driver](../spec.md) — issue #89
**Tipo:** fix
**Processo:** main (+ o texto compartilhado que o renderer lê)
**Depende de:** task #90
**Status:** executada

## Objetivo

Passar a página de teste local para o mesmo contrato de geometria do comprovante — largura relativa com teto — e acrescentar a ela a **escala em milímetros** que diz quanto a impressora realmente imprime. Sem isso, a task #90 entrega a correção com o instrumento de conferência descalibrado: a moldura sairia cortada justamente na impressora em que o comprovante acabou de ficar certo.

## Contexto

- Cobre as **RF-02**, **RF-03** e **RF-04** da spec, e carrega as **RN-05 a RN-08**.
- A página é a **única exceção** à regra de não ter layout de impressão neste repo, e o comentário de `src/main/testPrintPage.ts:11-20` explica por quê: ela não é comprovante, é diagnóstico, não carrega dado de pedido e tem de sair com a API fora do ar. Esta task mexe na geometria dela, não amplia a exceção.
- **O que está fixo hoje** (`src/main/testPrintPage.ts:63-64`): `body { width: ${width}mm }` e `.frame { width: calc(${width}mm - 4mm) }`. Depois da task #90, a caixa de conteúdo da página passa a ser a área imprimível (~72 mm numa bobina de 80 mm): esses 80 mm transbordam e a moldura perde a borda direita. O comentário de `:48-55` já antecipa exatamente esse modo de falha — "um diagnóstico que cria caso com a impressora certa é pior que nenhum" — e foi escrito para o recuo de 2 mm.
- **O que a moldura passa a medir.** Adaptada, ela deixa de testar "a largura configurada bate com o papel" e passa a testar algo que nada mais mede: **se o driver está dizendo a verdade** sobre a área imprimível. Moldura fechada = o que ele declarou cabe; borda faltando = ele declarou mais do que a cabeça alcança (RN-05).
- **E por isso a escala não pode se adaptar** (RN-06). Página que encolhe inteira nunca revela quanto encolheu. A escala é desenhada em medida fixa, **fora da moldura**, e some no ponto em que a área imprimível acaba — é o número que o `plan.md` pede na verificação da entrega e que hoje só sai com régua na mão.
- **Onde a escala tem de ficar, e por que isso também resolve o teste.** `pageLines` lê `.frame > *` e `previewLines` lê os filhos do papel da pré-visualização (`src/renderer/components/test-print/__tests__/TestPrint.test.tsx:48-59`); o teste de `:327` compara os dois. Escala **fora** da moldura é requisito geométrico — ela precisa ser cortada pela borda imprimível, não pela da moldura — e, de quebra, deixa esse contrato intocado.
- **A régua `|<-- 80 mm -->|` sai.** `testPrintWidthRuler` (`src/shared/testPrintContent.ts:40`) desenha uma seta em monospace cuja largura impressa não tem relação nenhuma com 80 mm: é decoração se passando por medida, e ao lado de uma escala de verdade vira ruído. A largura configurada continua dita, em palavras, na linha `Papel: 80 mm`.
- **A régua de 40 colunas fica, com outro sentido** (RN-07). Ela são ~70 mm em Consolas a 12 px, e dentro da moldura sobram ~64 mm numa área imprimível de 72 mm: vai sair cortada em impressora correta. Deixa de ser promessa ("se sai cortada, a largura está errada") e vira escala de leitura — a última coluna visível é quantos caracteres cabem naquele corpo de fonte.
- **O texto tem dois leitores** (RN-08): `src/shared/testPrintContent.ts` é lido pela página do main e pela pré-visualização (`src/renderer/components/test-print/testPrintView.ts:86-87`). Palavra nova entra lá, nunca digitada duas vezes.

## Mudanças

### 1. `src/main/testPrintPage.ts` — a geometria

```css
body  { max-width: ${width}mm; … }        /* era: width: ${width}mm */
.frame { box-sizing: border-box; margin: 2mm; … }   /* sem width: a margem define */
```

`body` é bloco e já ocupa a caixa de conteúdo; `max-width` passa a ser **teto**, não medida. A moldura sem `width` se dimensiona pelas próprias margens de 2 mm, que é o recuo que o comentário de `:48-55` justifica e que continua valendo.

O `@page { size: ${width}mm auto; margin: 0 }` **fica**: ele declara o papel, não a área de conteúdo, e é quem distingue a bobina de 58 da de 80.

O comentário da função precisa dizer o que mudou de sentido: a moldura agora afere o que o driver declara, não a largura configurada.

### 2. `src/main/testPrintPage.ts` — a escala em milímetros

Um elemento **irmão** da moldura, antes ou depois dela, encostado na borda esquerda da caixa de conteúdo (sem o recuo de 2 mm, senão a leitura sai deslocada):

- células de **5 mm** que não encolhem (`flex: 0 0 5mm`), cada uma com a marca à direita (`5`, `10`, … até `${width}`), `overflow: hidden` no contêiner;
- `Math.floor(width / 5)` células — 16 para 80 mm, 11 para 58 mm;
- corpo de fonte pequeno (~9 px) e uma borda de 1 px na posição da marca.

O rótulo vem de `TEST_PRINT_SCALE_LABEL` (abaixo). A leitura que o operador faz é "a última marca visível é a largura que esta impressora imprime", com resolução de 5 mm — suficiente para separar 72 de 80.

### 3. `src/shared/testPrintContent.ts`

- **Acrescentar** `TEST_PRINT_SCALE_LABEL`, curto, do tipo `Largura impressa (mm):`.
- **Reescrever** `TEST_PRINT_NOTE`. O que ela tem de dizer: a moldura deve sair fechada nos quatro lados, e lado faltando significa que o driver informa área imprimível maior do que a impressora alcança; na escala, a última marca visível é a largura real; na régua de colunas, a última coluna visível é quantos caracteres cabem. A nota de hoje ("Se a régua sai cortada ou quebra em duas linhas, a largura configurada não é a do papel") passa a ser **falsa** e não pode sobrar em pedaço nenhum.
- **Remover** `testPrintWidthRuler`.
- **Corrigir o comentário de `TEST_PRINT_COLUMNS`** (`:11-12`), que hoje afirma "a página que quebra esta linha está diagramada mais larga que o papel" — deixa de valer pelo mesmo motivo da nota.

### 4. `src/renderer/components/test-print/testPrintView.ts:86`

`rulers: [TEST_PRINT_COLUMNS]`, e o import de `testPrintWidthRuler` sai junto. A pré-visualização **não** replica a escala em milímetros: ela é ilustração de geometria em monospace (spec 38, RN-09), e um desenho de régua em px prometendo milímetros seria a mesma mentira que a seta removida.

## Testes

### `src/main/__tests__/testPrintPage.test.ts`

- `:26-27` e `:32` afirmam `toContain('width: 58mm')` / `'width: 80mm'`. Passam a afirmar o **teto** (`max-width: 58mm` / `80mm`) e, explicitamente, que **não** há largura fixa: nenhum `width: ${n}mm` solto no `body` nem na moldura.
- `:56` afirma a seta `|&lt;-- 80 mm --&gt;|`, que deixa de existir — vira asserção da escala: o número de células é `width / 5`, a última marca é `80` (e `55` para 58 mm), e a escala está **fora** de `.frame` (`doc.querySelectorAll('.frame .scale')` vazio, com a escala presente no documento).
- `:55` conta `<div class="ruler">` — hoje 2, passa a 1.
- `:64` afirma o começo da nota antiga; passa a afirmar a nova.
- **Verificar por mutação:** devolver `width: ${width}mm` ao `body`, ou mover a escala para dentro da moldura, tem de derrubar o teste.

### `src/renderer/components/test-print/__tests__/TestPrint.test.tsx`

- `:337` espera a linha `|<-- 80 mm -->|` na pré-visualização; sai.
- `:330` ("carries the accents line, the frame and both rulers") passa a falar de uma régua só, no nome e no corpo.
- `:327`, a comparação página × pré-visualização, **não deve precisar de mudança** — é o sinal de que a escala ficou fora da moldura. Se ela quebrar, a escala está no lugar errado.

## Critérios de aceitação

- [x] `buildTestPrintPage` não emite largura fixa em milímetros: `body` tem `max-width` e a moldura não tem `width`
- [x] A escala em milímetros é irmã da moldura (não filha), tem `width / 5` células que não encolhem e está encostada na borda esquerda da caixa de conteúdo
- [x] `testPrintWidthRuler` não existe mais, e `grep -rn "testPrintWidthRuler" src/` sai vazio
- [x] `TEST_PRINT_NOTE` e o comentário de `TEST_PRINT_COLUMNS` não afirmam mais nada sobre "a largura configurada não é a do papel"
- [x] A nota nova aparece igual na página e na pré-visualização, vinda de `src/shared/testPrintContent.ts` — sem texto digitado duas vezes
- [x] O teste de `testPrintPage` cobre a geometria nova e **foi verificado por mutação**
- [x] `TestPrint.test.tsx:327` (página × pré-visualização) continua passando sem ser adaptado
- [x] `npm run typecheck`, `npm run lint` e `npm test` saem como o baseline (0 erro; o aviso de `Login.tsx` pode existir, não pode aumentar)

### O que o review mudou

- **Um teste passava por acidente, e havia mutação que ele não pegava.** A asserção de "a escala está fora da moldura" extraía o bloco com `slice(indexOf(...), indexOf(...))`; quando o segundo índice não existe, `slice(start, -1)` devolve quase o documento inteiro e o teste falha por tabela, não por medir aninhamento. Com a escala **dentro** da moldura mas **sem indentação**, logo depois da régua, o teste do main dava **zero** falhas — só o contrato da `TestPrint.test.tsx` caía. Trocado por `match(/<div class="frame">[\s\S]*?\n<\/div>/)`: o primeiro `</div>` na coluna 0 fecha a moldura, porque tudo o que ela contém é indentado.
- **A invariante que torna a escala honesta não tinha rede.** `box-sizing: border-box` na `.cell` é o que faz 16 células darem **80,000 mm** exatos; sem ele cada célula vira 5 mm + 1 px e o último traço cai a ~84,2 mm — a escala mentiria 4 mm. Ganhou asserção própria.
- **`box-sizing` na `.frame` virou declaração morta** quando a `width` saiu (a propriedade só afeta medida declarada, e a moldura passou a declarar só `margin`, `border` e `padding`). Removida.
- **Dois números sem origem**, o mesmo achado da task 01: os ~72 mm e os ~70 mm passaram a citar `spec 89, "Contexto"` e `spec 89, RN-07`. E o comentário, trimado de 13 para 12 linhas, recuperou a justificativa de o `@page { size/margin }` ficar — que o diff tinha apagado sem substituto, deixando um `margin: 0` que o Chromium ignora sem explicação ao lado.
- **A nota citava o instrumento por um nome que o papel não imprime.** O rótulo impresso é `Largura impressa (mm):` e a nota dizia "Na escala em milímetros"; como as duas coisas que ela cita são fileiras de números, o operador tinha de adivinhar qual era qual. A nota passou a citar o rótulo, e o título virou a constante `TEST_PRINT_SCALE_TITLE`, da qual o rótulo e a nota derivam — texto visível digitado duas vezes no arquivo que existe para impedir isso seria o começo da divergência.

### A geometria, conferida caixa por caixa no review

| Caixa de conteúdo | `body` | `.frame` | Resultado |
| --- | --- | --- | --- |
| 72 mm (cabeça típica de 80 mm) | 72 mm | 68 mm | fecha, 2 mm de branco de cada lado |
| 80 mm (driver que declara a folha inteira) | 80 mm | 76 mm | fecha |
| > 80 mm | 80 mm (teto) | 76 mm | fecha, mas a escala **não revela** área maior que 80 mm |

O desvio de arredondamento acumulado nas 16 células é ≤ 16/64 px ≈ **0,07 mm** (o Blink faz layout em `LayoutUnit` de 1/64 px) — duas ordens de grandeza abaixo da resolução de 5 mm da escala.

### Mutações, conferidas duas vezes independentes

| Mutação | Testes que caem |
| --- | --- |
| `width` em vez de `max-width` no `body` | 3 |
| `width` **somado** ao `max-width` (a mais difícil) | 1 |
| escala dentro da moldura, indentada | 4 (2 do main + os 2 do contrato página × pré-visualização) |
| escala dentro da moldura, **sem** indentação | 0 antes do conserto do review · **4** depois |
| `.cell` sem `box-sizing: border-box` | 0 antes da asserção nova · **2** depois |

### Por que não passou pelo `test-writer`

As cinco mutações acima, mais duas repetidas pelo `/execute`, cobrem as invariantes que a spec nomeia: a geometria relativa (RN-05), a escala que não se adapta (RN-06) e o texto único nos dois lados (RN-08). O review encontrou e fechou o único buraco real — um teste que passava por tabela. Rede adicional aqui seria espelho da implementação, não proteção.

### O que a suíte não cobre, e é o que decide a frente

A impressão real. `overflow: hidden` cortar onde a conta diz que corta é layout de Chromium em impressora de verdade; a moldura fechada nos quatro lados e o número lido na escala são critérios de PDV. Os dois estão na "Verificação da entrega" do `plan.md`.

## Fora de escopo

- **Pôr a escala em milímetros na pré-visualização da tela.** Ela é ilustração de geometria em px (spec 38, RN-09); desenhar milímetros ali seria prometer uma medida que a tela não tem como fazer.
- **Recalibrar as 40 colunas** de `TEST_PRINT_COLUMNS` para a largura imprimível. O número certo depende do que a medição do PDV revelar, e mudá-lo agora é chutar (decisão pendente 2 da spec).
- **Mudar o que a página diz fora das réguas e da nota** — as linhas de dados, os acentos e o título ficam como estão.
- **Fazer a página de teste sair na fonte escolhida pela loja.** Segue fora, como na spec 52 e na 56.
- **A opção de impressão.** É a task #90.

## Branch

`feat/89-printing-printable-area-margins`, cortada de `origin/master` (`2dec3d8`) em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

## Implementação

**Concluída em:** 2026-11-12

### Processos tocados

main (+ texto compartilhado lido pelo renderer)

### Arquivos criados/alterados

- `src/main/testPrintPage.ts` — `body` com `max-width`, moldura sem `width`, escala em mm irmã da moldura (células `flex: 0 0 5mm`), seta removida, comentário reescrito
- `src/shared/testPrintContent.ts` — `TEST_PRINT_SCALE_LABEL` novo, `TEST_PRINT_NOTE` reescrita, `testPrintWidthRuler` removida, comentário de `TEST_PRINT_COLUMNS` corrigido
- `src/renderer/components/test-print/testPrintView.ts` — `rulers: [TEST_PRINT_COLUMNS]`
- Testes: `src/main/__tests__/testPrintPage.test.ts`, `src/renderer/components/test-print/__tests__/TestPrint.test.tsx` (`:327` não foi adaptado)

### Canais IPC, sockets, variáveis de ambiente

Nenhum.

### Decisões que tomei por conta própria

- O rótulo da escala é um `div.scale-label` irmão, acima das células, para não deslocar a marca 5 da borda esquerda
- A escala fica depois da moldura, no fim do `body`
- O teste do main não usa `DOMParser` (o `tsconfig.node.json` não tem DOM): lê o HTML por regex

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso (baseline)
- `npx vitest run --maxWorkers=4`: 74 arquivos / 822 testes passando
- Mutação: `width` no `body` derruba 3 testes do `testPrintPage`; escala dentro da moldura derruba 2 do `testPrintPage` e os 2 de `TestPrint.test.tsx` (página × pré-visualização)
- Não verificado: impressão real

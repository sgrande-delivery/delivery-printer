# 54 — Declarar os `@font-face` no HTML de impressão

**Issue:** [#54](https://github.com/sgrande-delivery/delivery-printer/issues/54)
**Feature:** [Fontes de impressão embarcadas no app](../spec.md) — issue #52
**Tipo:** feature
**Processo:** main
**Depende de:** [#53](https://github.com/sgrande-delivery/delivery-printer/issues/53)
**Status:** shipped

## Branch

`feat/52-printing-embedded-fonts`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-04. Todas as tasks da spec rodam nela, um commit por task.

## Objetivo

Fazer o HTML que vai para a impressora declarar as seis faces, para que a `font-family` que a `delivery-api` nomeia resolva de verdade. É a metade da feature que produz efeito visível na bobina.

## Contexto

- Cobre a **RF-02**, a **RF-03** e a **RF-04**, e as **RN-02**, **RN-05**, **RN-06** e **RN-08**
- **O funil é único:** `printReceipt` (`src/main/ipc-events/onRawPrint.ts:11`) recebe o `content` e o grava em `os.tmpdir()/<id>.print.html` antes do `loadFile`. Por ali passam o comprovante da API (pelo worker, `src/main/queue/print-queue-worker.ts`), o `rawPrint` direto e a página de teste local (`src/main/testPrintPage.ts`). Uma injeção ali cobre todos
- **A API não manda `@font-face`.** Ela emite só a `font-family` (e o peso) no bloco `<style>` do `<head>` dos dois layouts base e das duas views de caixa. Conferido nos seis documentos
- **O `@font-face` do renderer não serve** (RN-03): `src/renderer/app.css:93` vale para a janela da UI, não para o documento `file://` que a impressão carrega numa `BrowserWindow` própria. Quem "simplificar" acrescentando a face lá vai ver teste passando, tela certa e bobina no fallback
- **O formato do HTML que chega** (`resources/views/socket/order/layout/base.blade.php`): `<!DOCTYPE html>`, depois `<html>`, depois um `<style>` com o `styles.css` inlinado, depois um segundo `<style>` com `@page`, `max-width`, `font-family` e `font-weight`, depois `<body>`. Não há `<head>` explícito
- **Medições que a task pode usar como dadas** (Electron 43, 2026-11-04): `file://` carrega e aplica no HTML temporário, inclusive de dentro do `app.asar`; caminho inexistente dá `FontFace.status === 'error'`; e `printToPDF` embarca a fonte real **sem** esperar `document.fonts.ready` — por isso **não** acrescentar espera (decisão arquitetural do plan)
- O `logger` já existe em `src/main/logger.ts`

## Mudanças

### 1. `src/main/printFonts.ts` (novo)

O catálogo e duas funções puras. Puras porque o `printReceipt` não tem teste hoje — ele precisa de `BrowserWindow` de verdade — e é isso que torna a RN-05 e a RN-06 verificáveis sob o Vitest.

- **`PRINT_FONT_FACES`** — as seis entradas (`file`, `family`, `weight`), com as famílias escritas **exatamente** como a API as nomeia: `IBM Plex Sans Condensed`, `Atkinson Hyperlegible`, `Barlow Semi Condensed` (ver `core/Printer/Domain/Enums/PrintFontEnum.php` da `delivery-api`). Um comentário dizendo que o nome é contrato com aquele enum, e que divergir aqui é a face não casar — em silêncio
- **`buildPrintFontFacesCss(resolve: (file: string) => string): string`** — um `@font-face` por entrada, com `font-style: normal`, `font-display: block` e `src: url('<file-url>') format('woff2')`. A URL sai de **`pathToFileURL()`** (`node:url`), nunca de concatenação (RN-06). `font-display: block` e não `swap`: `swap` pinta no fallback e troca depois, e no papel não existe "depois"
- **`withPrintFontFaces(html: string, css: string): string`** — insere `<style>${css}</style>` **depois** da tag `<html…>` de abertura. Nunca antes do `<!DOCTYPE html>` (RN-05), e por isso a função não concatena no início em nenhum caminho. Sem `<html`, insere antes de `<body`; sem os dois, acrescenta no fim. O comentário tem de dizer **por que** a posição importa: conteúdo antes do doctype joga o Chromium em quirks mode, e quirks mode muda a métrica do documento inteiro — na bobina, é o comprovante com outro recorte e nenhum erro para explicar

A função **não escolhe família** (RN-02): o que ela injeta são só blocos `@font-face`, nenhuma regra com seletor.

### 2. `getPrintFontFacesCss(app)` — memoizado, e o aviso da RN-08

No mesmo módulo. Monta o CSS **uma vez por processo** (o caminho não muda em runtime) e, ao montar, confere com `fs.existsSync` cada arquivo resolvido por `getAssetPath(app, 'fonts', file)`. Arquivo ausente vira **um** `logger.warn` nomeando o arquivo e dizendo que o documento vai sair na fonte de fallback — e a face continua sendo declarada, porque a impressão não pode parar por causa de fonte (RF-04).

Memoizar tem um efeito que vale comentar: fonte acrescentada em dev só aparece depois de reiniciar o app.

### 3. `src/main/ipc-events/onRawPrint.ts` (alterado)

No `printReceipt`, antes do `fs.writeFileSync`:

```ts
const html = withPrintFontFaces(content, getPrintFontFacesCss(app));
```

e gravar `html` em vez de `content`. É a única linha de comportamento da task. O `app` vem de `electron` — o módulo já importa `BrowserWindow` de lá.

## Testes

### `src/main/__tests__/printFonts.test.ts` (novo)

- **O catálogo é o da RN-07:** seis entradas, os pares família/peso exatos, **sem** mono e **sem** 400 em Plex ou Barlow
- **Cada arquivo do catálogo existe em `assets/fonts/`** — a guarda que liga esta task à #53, e o que pega arquivo deletado, renomeado ou nunca copiado
- **O CSS gerado** tem seis `@font-face`, cada um com `font-display: block` e uma `url('file://…')`
- **RN-06:** com um resolvedor que devolve um caminho com espaço e acento (`…/Program Files/SGrande Impressão/x.woff2`), a URL sai percent-encoded (`%20`, `%C3%A3`) — é o teste que impede alguém "simplificar" o `pathToFileURL` para `'file://' + caminho`
- **RN-02:** removidos todos os blocos `@font-face` do CSS gerado, o que sobra é só espaço em branco — nenhuma regra com seletor, nenhuma família escolhida
- **RN-05:** aplicado a um HTML no formato real da API (fixture com `<!DOCTYPE html>`, `<html>`, dois `<style>`, `<body>`), o resultado continua começando por `<!DOCTYPE html>`, e o bloco injetado aparece **depois** da tag `<html>`
- **A injeção é aditiva:** o HTML original continua inteiro dentro do resultado, caractere por caractere — nada do que a API mandou foi reescrito
- Os dois caminhos de fallback de posição: HTML sem `<html` (entra antes do `<body`) e HTML sem os dois (entra no fim), e nos dois o doctype segue primeiro quando existe
- **RN-08:** com um arquivo faltando, há exatamente **um** `logger.warn` nomeando o arquivo, e o CSS **continua** com as seis faces

O stub do `logger` segue o que os testes de main já fazem (`src/main/__tests__/`); `app` entra como objeto mínimo com `isPackaged` e `getPath`, como o `getAssetPath` espera.

**Verificar por mutação** o teste da RN-05 e o da RN-06: trocar `pathToFileURL(p).href` por `'file://' + p` tem de quebrar, e mover a inserção para o início do HTML tem de quebrar. Teste que passa com a mutação viva não protege nada.

## Critérios de aceitação

- [ ] O HTML gravado em `os.tmpdir()` tem as seis declarações `@font-face` e começa por `<!DOCTYPE html>`
- [ ] Impressão real em dev com `font_family: plex` sai em IBM Plex Sans Condensed; `atkinson` e `barlow` nas respectivas
- [ ] Com `font_family: original`, o documento sai como hoje
- [ ] Arquivo de fonte renomeado: um `warn` no log e o comprovante **continua saindo**, no fallback
- [ ] Sem rede, a fonte continua aplicando
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

Executada em 2026-11-04. `src/main/printFonts.ts` novo, `src/main/__tests__/printFonts.test.ts` novo (22 testes) e **uma** linha de comportamento no `printReceipt`.

### Onde a injeção entrou, e por que ali

`fs.writeFileSync(file, withPrintFontFaces(content, getPrintFontFacesCss(app)))` (`onRawPrint.ts:17`). Conferido por grep que **nenhum caminho de impressão escapa**: `webContents.print` existe uma vez só no repo, `printReceipt` tem dois chamadores (o worker da fila em `queue/print-queue.ts:20` e o canal `rawPrint`), e a página de teste não é um terceiro caminho — o `onPrintTest` enfileira, então volta pelo worker.

Injetar **na gravação** e não no `enqueue` tem consequência que vale registrar: o `payload.content` fica **intacto** na fila durável, então o `print-queue.ndjson` em `userData` não engorda ~1,5 kB por trabalho, o `PrintJobSummary` não muda, e uma reimpressão re-injeta com os caminhos **atuais** — correto depois de uma atualização que mude o diretório de instalação.

### O que ficou provado, e como

**Prova de ponta** (módulo real bundlado, HTML na forma do `base.blade.php` da API, carregado de `os.tmpdir()` numa `BrowserWindow`, com `printToPDF` para ler qual fonte foi efetivamente embarcada):

| `font_family` | Faces carregadas | Fontes no PDF |
| --- | --- | --- |
| `plex` | Plex 500 + 700 | `IBMPlexSansCond-Medium`, `-Bold` |
| `atkinson` | Atkinson 400 + 700 | `AtkinsonHyperlegible-Regular`, `-Bold` |
| `barlow` | Barlow 500 + 700 | `BarlowSemiCondensed-Medium`, `-Bold` |
| `original` (pedido/mesa) | **nenhuma** | `DejaVuSans` (fonte do sistema) |
| `original` (caixa) | **nenhuma** | `DejaVuSansMono` |

Isso prova a **RF-03** (a escolha chega ao documento), a **RN-02** (com `original`, as seis faces são declaradas e nenhuma é usada: o comprovante sai como hoje) e, de carona, a **RN-07** — os dois pesos aparecem no PDF de cada família, o que confirma que o `700` é alcançado pelo `.bold` e que seis faces é o conjunto certo. O `<!DOCTYPE html>` é o primeiro byte nos cinco casos. Na máquina do cliente o fallback do `original` será Arial e o Courier New real; muda a fonte do sistema, não a conclusão.

### Testes

22 testes em `src/main/__tests__/printFonts.test.ts`, cada um dos cinco mutantes centrais medido e **morto**:

| mutação | cai |
| --- | --- |
| `'file://' + caminho` no lugar de `pathToFileURL` | o teste da RN-06 |
| inserir no início do HTML | o da RN-05 e os dois de fallback |
| `font-weight` fora do CSS gerado | o de pares família+peso |
| memoização removida | o de `warn` único por processo |
| regex estreitado para `/<html>/` | os três casos de `<html>` com atributo |
| `catch` relançando em vez de devolver `''` | o da RF-04 |

O da **RN-07 no CSS** é o que tem consequência silenciosa em bobina e por isso foi o primeiro a ser fechado: sem o peso, as duas faces da mesma família ficam idênticas em família+peso+estilo, a última vence, e o **arquivo 700 passa a servir o corpo do texto** com negrito sintetizado em cima. Comprovante legível, fonte errada, nenhum erro.

Sem dependência de ordem: suíte verde com `--sequence.shuffle` e `--sequence.shuffle.tests` em três seeds cada.

**Não coberto por teste, de propósito:** a fiação do `printReceipt`, que precisa de `BrowserWindow` real — é o que a prova de ponta acima cobre.

### Ajustes que o review pediu e entraram aqui

Builtins para `node:fs`/`node:url` (convergência com o resto do main), o `warn` prefixado `print-fonts:` (o suporte lê o `main.log` pelo prefixo do módulo), `describeError(err)` no `catch` (o logger tem `breakLength: Infinity` para manter uma linha por entrada, e `Error` cru sai com stack), e a blindagem `try/catch` devolvendo `''`: sem ela, um throw voltaria em **toda** impressão, porque o cache só guarda o caminho de sucesso.

Verificado: `npm run typecheck` 0, `npm run lint` 0 erros e 1 aviso pré-existente, `npm test` com 66 arquivos e **659** testes (baseline da branch: 65 e 637).

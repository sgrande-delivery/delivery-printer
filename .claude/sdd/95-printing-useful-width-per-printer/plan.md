# Plan — Largura útil por impressora

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#95](https://github.com/sgrande-delivery/delivery-printer/issues/95)
**Branch de trabalho:** `feat/95-printing-useful-width-per-printer`, cortada de `origin/master` (`be947da`) em 2026-11-13. Uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim

## Abordagem técnica

A frente atravessa os três processos, mas o centro dela é o **main**, e nele um ponto só: o `printReceipt` (`src/main/ipc-events/onRawPrint.ts:11`), que é o único `webContents.print` do repo e por onde passam fila de comprovantes, conta de mesa, `rawPrint` e página de teste.

**O dado.** A largura útil é por **dispositivo do Windows** e mora num arquivo próprio em `userData`, `printer-preferences.json`, com o mesmo contrato do `ui-preferences.json` (`src/main/uiPreferences.ts:23-87`): a leitura nunca lança e nunca escreve; a escrita é read-modify-write por `writeFileAtomic` (`src/main/atomicFile.ts`), para que uma chave nova de uma versão futura não seja apagada. A faixa (40–80) e o casamento de nome ficam em `src/shared/printerGeometry.ts`, porque o main aplica e a tela explica — o mesmo motivo de `src/shared/sidebarWidth.ts` e `src/shared/queueLimits.ts`. O casamento reaproveita o critério de `findPrinterByDeviceName` (`src/shared/printerMatch.ts:20`).

**A decisão de geometria.** Uma função pura nova, `resolvePrintGeometry` (`src/main/printGeometry.ts`), recebe a largura útil da impressora de destino, o papel que o driver expõe nas opções, a largura do documento lida do HTML e o modo de medição, e devolve `{ margins, pageSize?, widthCss, reason }`. O `printReceipt` só a chama, injeta o `widthCss` pelo mesmo ponto dos `@font-face` (`withPrintFontFaces`, `src/main/printFonts.ts:40`), passa as opções ao `print` e registra a geometria no log. Pura para ser testada sem Electron, e num lugar só (RN-09).

**A impressora de destino.** O `printReceipt` já tem a lista (`getPrintersAsync`, `onRawPrint.ts:19`) e o casamento (`:20`). Quando o casamento falha, a geometria vem da impressora marcada `isDefault` na mesma lista (RN-03) — o `isDefault` não está na tipagem do Electron 43, e o `readIsDefault` de `src/main/ipc-events/onListPrinters.ts:8` já faz o narrowing; ele sai para um módulo do main que os dois usem.

**A página de teste e a de medição.** O `onPrintTest` (`src/main/ipc-events/onPrintTest.ts:26`) monta a página no main a partir do `TestPrintRequest`. Ele passa a ler a largura útil do dispositivo e a entregá-la ao `buildTestPrintPage` (`src/main/testPrintPage.ts:36`), que põe o teto na moldura e diz a geometria no rótulo da escala. A medição é o mesmo pedido com `purpose: 'measure'`: o payload da fila ganha um campo opcional que manda o `resolvePrintGeometry` diagramar sobre a bobina inteira, ignorando a largura configurada.

**A tela.** A gaveta de edição (`src/renderer/components/printers/PrinterDrawer.tsx`) ganha uma seção própria, num componente separado, com gravação imediata pelo canal novo — fora do rascunho, do "sujo" e do "Salvar no servidor" da gaveta. A linha de detalhe do cartão (`detailLine`, `src/renderer/components/printers/printerView.ts:36`) mostra a largura quando há. Os primitivos `Switch`, `Stepper`, `Chip` e `Button` de `src/renderer/base/` cobrem tudo; nenhum ícone novo.

## Decisões arquiteturais

- **Arquivo próprio em `userData`, não o `ui-preferences.json`** (RN-01). O que está nele muda impressão, e a leitura dele entra no caminho de cada comprovante; misturar com tema e sidebar faria um erro de aparência e um de geometria dividirem o mesmo arquivo.
- **A leitura é por impressão, sem cache.** O arquivo é minúsculo, a impressão já grava e lê um HTML do disco, e sem cache a largura gravada na tela vale no próximo comprovante, sem canal de invalidação. Mesmo raciocínio do `drain` da fila, que lê o arquivo por tentativa.
- **`max-width` + `pageSize`, não `scaleFactor`** (RN-05, RN-06). O `max-width` é o que garante; o `pageSize` reforça e resolve a altura.
- **`!important` no `<style>` injetado.** Ele entra logo depois do `<html>` (RN-10) e portanto **antes** dos `<style>` da API; sem `!important`, o `@page { size }` e o `max-width` da API venceriam por ordem.
- **A largura do documento para a RN-07 vem do HTML** — o **último** `@page { size: Nmm …}`, porque o layout `original` da API declara o `80mm` do CSS estático e depois sobrescreve (`resources/views/socket/order/layout/base.blade.php` na `delivery-api`). Sem `@page` legível, 80.
- **A medição é um campo do payload, não um segundo caminho de impressão.** `PrintPayload` ganha `measurePaperWidthMm?: 58 | 80`, persistido na fila como o resto. A RN-09 continua de pé: é o mesmo `printReceipt`, com a mesma função de decisão.
- **Gravação imediata na tela** (decisão pendente 1 da spec). A seção não entra no rascunho da gaveta: a largura útil é local, e amarrá-la ao "Salvar no servidor" faria o rótulo do botão mentir.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Largura útil por impressora em userData, com o par IPC | [#96](https://github.com/sgrande-delivery/delivery-printer/issues/96) | [`tasks/96-printer-preferences-store.md`](./tasks/96-printer-preferences-store.md) | — | shipped |
| 02 | Geometria de impressão por impressora no printReceipt | [#97](https://github.com/sgrande-delivery/delivery-printer/issues/97) | [`tasks/97-print-geometry-per-printer.md`](./tasks/97-print-geometry-per-printer.md) | 01 | shipped |
| 03 | Página de teste com a largura útil e página de medição | [#98](https://github.com/sgrande-delivery/delivery-printer/issues/98) | [`tasks/98-test-page-useful-width-and-measure.md`](./tasks/98-test-page-useful-width-and-measure.md) | 02 | shipped |
| 04 | Largura útil e Medir na tela Impressoras | [#99](https://github.com/sgrande-delivery/delivery-printer/issues/99) | [`tasks/99-printers-screen-useful-width.md`](./tasks/99-printers-screen-useful-width.md) | 01, 03 | shipped |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

**01 → 02 → 03 → 04.** A 01 cria o dado e o canal, sem consumidor de impressão ainda — o canal é testado pelo gate de texto e pelo handler. A 02 faz a impressão ler o dado: é a frente de fato, e cada comprovante já sai certo com um arquivo editado à mão. A 03 depende da 02 porque a medição é um modo da mesma função de decisão. A 04 é a tela, e vem por último porque precisa dos dois canais e do `purpose: 'measure'`.

Cada commit compila e passa sozinho, como `master` exige.

## Dependências de outros repos

Nenhuma. A relação com a `delivery-api` é de diagnóstico: foi lá (`resources/views/print/layout.blade.php`, `resources/views/socket/order/layout/base.blade.php`, `public/css/socket/order/styles.css`) que se mediu que o filho do `body` é a `div` de padding, que `* { box-sizing: border-box }` vale nos dois layouts e que o documento é relativo. Se a API mudar essa estrutura, o `body > *` desta frente precisa ser revisto.

## Verificação da entrega

`npm run typecheck`, `npm run lint` e `npx vitest run --maxWorkers=4` no baseline (ver "Aprendizados" da spec 89 sobre o `--maxWorkers`). Eles provam as opções passadas ao `print`, o HTML injetado, o arquivo e a tela — **não provam o papel**: a suíte roda em jsdom, sem impressora, e esta máquina não enxerga impressora do Windows.

O que prova é impressão real no PDV, com o instalador da pré-release:

1. na impressora com driver que declara área = papel: **Medir**, responder o último número da escala, imprimir a página de teste (moldura fechada nos quatro lados, escala até a marca configurada) e um pedido `simples` com a Margem padrão (15 px): sequência, hora e contagem inteiras;
2. numa impressora com driver correto, sem largura útil: nada muda em relação à v3.1.1;
3. bobina de 58 em driver que diz 80: largura útil 48 (ou o que a medição der) → comprovante inteiro;
4. driver com papel curto ("80 x 25"): com largura útil configurada, comprovante inteiro; e conferir no log (`Exportar logs`) se a linha `print-geometry` traz o papel nas opções do driver — é ela que diz se a RN-07 dispara sozinha no Windows;
5. imprimir um pedido **longo** (mais de 30 cm de comprovante, ou uma conta de mesa cheia) com largura útil configurada: ele sai em duas páginas de 297 mm (decisão pendente 5 da spec); conferir se o driver corta entre elas;
6. anotar no relatório, por modelo de driver, o número medido e se o `pageSize` custom foi aceito (o comprovante sai com a altura do conteúdo, sem folha de 297 mm de papel em branco). Se o driver recusar o papel custom e alimentar 297 mm, o `max-width` ainda garante a largura, e a altura vira a próxima conversa.

## Aprendizados que valem para as próximas tasks

- **`npm run lint` estoura memória nesta máquina** por causa de `.erb/dll/` (sobra não rastreada do boilerplate antigo, ~5 MB de bundle gerado). O CI não tem o diretório. Para comparar com o baseline, `npx eslint . --ignore-pattern '.erb/**'` (0 erros, 1 aviso em `Login.tsx`).
- **O stub de `setPrinterUsefulWidth` (`src/__tests__/setup.ts`) não tem estado**: devolve só o dispositivo recém-gravado, enquanto o canal real devolve o mapa inteiro. Teste da task 99 com mais de um dispositivo precisa de `mockResolvedValueOnce` com o mapa completo — senão uma tela que *adota* o mapa (o certo) perde os outros sob o stub, e uma que *mescla* (o errado: duplicaria `EPSON`/`epson`) passa.
- **Chamar `printerPreferenceFor` com o nome da impressora resolvida** (ou a `isDefault`, RN-03), nunca com o `deviceName` cru do payload: o cru pode ser `null` ou um nome que não casa, e aí a largura da padrão não se aplicaria.
- **Entrada inválida no arquivo gera um `warn` por leitura**, e a task 97 lê a cada impressão: um arquivo editado com erro dá um `warn` por comprovante. Aceito (é o sinal de que o arquivo está errado), mas não é motivo para cache.
- **Arquivo que existe e não pôde ser lido não é arquivo inválido.** `readJsonObjectFile` separa `unreadable` de `invalid` porque recomeçar de `{}` só é seguro no segundo caso; no primeiro, a escrita apagaria todas as outras impressoras. O `uiPreferences` continua recomeçando nos dois (tema e sidebar não cortam comprovante).
- **O HTML temporário passou a ser gravado depois do `getPrintersAsync`** (a geometria precisa do destino). Se a listagem rejeitar, não sobra `.print.html` em `%TEMP%`; a fila tenta de novo com o mesmo `id` e sobrescreveria o arquivo de qualquer forma. "Só é removido no caminho de sucesso" continua verdadeiro.
- **`@page { size: <comprimento> auto }` é descartado pelo parser** — não é forma da gramática de `size`. A API usa essa forma, então o `@page` dela é inerte hoje; o que vale é o `pageSize` e o `max-width`. O injetado aqui usa `Wmm 297mm`, a mesma página do `pageSize`.
- **Mock de módulo com o critério real:** o `onRawPrint.test.ts` mocka `../printerPreferences` mas monta a resposta com o `findPrinterPreference` de verdade (`await import('shared/printerGeometry')` dentro do `vi.mock`), para que o teste de caixa de letra prove o casamento do produto e não o do mock.
- **Regra da página que convive com o `<style>` injetado pelo `printReceipt` precisa de `!important`.** O bloco injetado é `!important` para vencer a API por ordem; qualquer regra da própria página que queira valer sobre `body > *` (a moldura da página de teste é o caso) também precisa ser `!important`, e então decide a especificidade. Teste por regex não faz cascata: a asserção tem de exigir o `!important` por escrito, senão a regressão passa.
- **A página de teste com `deviceName: null` não sabe a geometria da impressora padrão** (o `onPrintTest` é síncrono e não lista impressoras). Ela diz "a da impressora padrão do Windows" e não põe teto próprio na moldura; o `printReceipt` ainda aplica a largura da padrão. Só a `/print-test` chega nesse caso (cadastro sem impressora encontrada). Resolver exigiria o handler assíncrono com `getPrintersAsync` + `isDefaultPrinter` — spec própria se fizer falta.
- **O `Stepper` é `role="group"`.** Em teste de tela que também tem outro grupo (a pergunta da medição), `getByRole('group')` sem nome é ambíguo; buscar pelo nome.
- **Desabilitar controle a cada gravação local custa foco e pisca a tela.** As escritas pelo IPC chegam em ordem e cada uma é atômica; o que precisa de trava é a ação que não pode ser repetida (enfileirar uma página), não a gravação de um valor idempotente.

### Teste real na Cups-PDF (2026-11-13, depois das quatro tasks)

O caminho de impressão foi exercitado de verdade: o `printReceipt` de `src/` empacotado com esbuild (`--alias:shared=./src/shared`, `electron` e `electron-log` externos, bundle em `out/` para achar `assets/fonts` e `node_modules`), rodando no Electron 43 e imprimindo na fila **Cups-PDF** desta máquina, com um comprovante montado do CSS real do `layout.blade.php` (`origin/master` da `delivery-api`). Os PDFs saíram com as páginas pedidas (72×297, 48×297, medição 80×297; A4 do driver quando nada está salvo), o conteúdo terminando dentro da largura útil, a fonte igual e o texto refluindo. Três aprendizados que os testes unitários não pegavam:

- **`isDefault` não vem em runtime no Electron 43**, além de não estar nos typings: a RN-03 como entrou na task 97 (`printers.find(isDefaultPrinter)`) nunca disparava, e o mock dos testes tinha `isDefault`. A padrão passou a vir do sistema operacional (`src/main/defaultPrinter.ts`), e o rótulo "(padrão)" da tela Impressoras também (ele nunca aparecia pelo mesmo motivo). **Mock de borda tem de ter o formato que a borda devolve de verdade.**
- **`print` sem `deviceName` num processo recém-aberto devolve sucesso e não cria job** (medido pelo contador de jobs do CUPS: nove execuções de envio único, zero jobs; com o nome, um job cada). Depois de uma impressão nomeada no mesmo processo, funciona — por isso a primeira rodada de testes não viu. O `printReceipt` imprime pelo nome do destino resolvido. Não foi medido no Windows, onde a v3.1.1 já imprime com `deviceName` vazio.
- **No CUPS, o `media` das `lpoptions` do usuário vence o `pageSize` do trabalho**: com `media=Custom.80x25mm` o PDF saiu 80×25, girado e reduzido. É artefato do CUPS, não modelo de driver Windows (que recebe o papel no DEVMODE do trabalho). Serviu para provar a detecção da RN-07: o CUPS expôs `media=Custom.80x25mm` nas opções e o ramo `invalid-driver-paper` disparou.

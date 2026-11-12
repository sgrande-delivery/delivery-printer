# Plan — Imprimir dentro da área imprimível do driver

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#89](https://github.com/sgrande-delivery/delivery-printer/issues/89)
**Branch de trabalho:** `feat/89-printing-printable-area-margins`, cortada de `origin/master` (`2dec3d8`) em 2026-11-12. Uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim

## Abordagem técnica

A frente inteira cabe no **processo main**, e nos dois arquivos que decidem geometria de impressão neste repo. Não há canal IPC novo, nem socket, nem endpoint, nem nada no renderer além do texto compartilhado que a tela `/print-test` já lê.

**O ponto único de impressão.** `printReceipt` (`src/main/ipc-events/onRawPrint.ts:11`) é o único lugar do repo que chama `webContents.print`, e todo caminho desemboca nele: o worker da fila (`src/main/queue/print-queue-worker.ts`), o `rawPrint` direto e o `printTest`. Trocar `marginType` ali muda os três de uma vez — é por isso que a task 01 é de uma linha e mesmo assim é a frente inteira.

**Por que o comprovante se adapta sozinho.** O contêiner que a `delivery-api` emite é `max-width: {{ width_mm }}mm; width: 100%` (`resources/views/print/layout.blade.php`, e o mesmo em `public/css/socket/order/styles.css` para o modelo `original`). `width: 100%` é relativo à caixa de conteúdo da página; encolher essa caixa encolhe o comprovante, sem uma linha de HTML mudar. É o que torna esta correção segura: o layout que vai para a impressora continua sendo o da API.

**Por que a página de teste não se adapta, e precisa.** `buildTestPrintPage` (`src/main/testPrintPage.ts:56-79`) escreve `body { width: ${width}mm }` e `.frame { width: calc(${width}mm - 4mm) }` — **fixo**. Numa caixa de conteúdo de 72 mm, esses 80 mm transbordam e a moldura sai cortada justamente na impressora em que o comprovante ficou certo. A task 02 troca o fixo por teto (`max-width`) e deixa a moldura auto-dimensionar pelas próprias margens, que é como o comprovante já se comporta.

**E acrescenta a única coisa que não pode se adaptar.** Página que encolhe inteira nunca revela quanto encolheu, então a task 02 põe uma **escala em milímetros em medida fixa, fora da moldura**, que é cortada pela borda da área imprimível. O ponto em que ela some é a largura real da impressora — é o número que a verificação da entrega pede e que hoje só sai com régua na mão.

**O que a tela ganha de graça.** O texto da página mora em `src/shared/testPrintContent.ts` e é lido pelo main e pela pré-visualização (`src/renderer/components/test-print/testPrintView.ts:86-87`). Mudar `TEST_PRINT_NOTE` ali muda a tela junto, e o teste que compara os dois lados é o que impede que só um mude.

## Decisões arquiteturais

- **`'printableArea'` e não `'custom'` com números nossos.** `custom` exigiria um milímetro escolhido por nós, igual para todo parque, errado para metade dele. `printableArea` delega ao único que conhece o hardware, que é o driver — e quando ele não souber, a RN-03 diz que não piora.
- **A correção não vem acompanhada de interruptor.** Nada de configuração por instalação nem de flag para voltar atrás: o conserto é um valor de enum, e desfazê-lo é outro release de uma linha. Interruptor aqui seria uma segunda geometria de impressão viva no parque para sempre, que é o que a RN-01 existe para evitar.
- **A página de teste muda na mesma spec, e não numa de limpeza depois.** Ela é o instrumento com que o suporte vai conferir esta própria correção; entregar a correção com o instrumento descalibrado é entregar a frente pela metade (RN-05).
- **O paliativo não vira código.** Margem de 30–35 px é configuração de loja na `delivery-api`, resolvida pelo suporte hoje, e sai do caminho sozinha quando a correção chegar (RN-09).

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Imprimir na área imprimível do driver | [#90](https://github.com/sgrande-delivery/delivery-printer/issues/90) | `tasks/90-print-inside-printable-area.md` | — | shipped |
| 02 | Página de teste com a geometria do comprovante | [#91](https://github.com/sgrande-delivery/delivery-printer/issues/91) | `tasks/91-test-page-relative-geometry.md` | 01 | shipped |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

**01 antes de 02**, e a dependência é de sentido, não de código: a página de teste só precisa parar de usar largura fixa **porque** a caixa de conteúdo passou a ser a área imprimível. Invertida, a task 02 seria uma mudança sem motivo visível, e o commit dela não explicaria nada a quem ler o histórico depois.

Os dois commits compilam e passam sozinhos, como `master` exige.

## Dependências de outros repos

Nenhuma. O HTML da `delivery-api` já é relativo e não muda; o `delivery-socket-api` e o `delivery-admin` não entram.

A relação com a `delivery-api` é de **diagnóstico, não de contrato**: foi lá (`resources/views/print/layout.blade.php`, `core/Printer/Application/ReceiptLayoutService.php`) que se mediu que o contêiner é relativo e que `margin_size` é em px. Nada precisa ser aberto lá por causa desta frente.

## Verificação da entrega

`npm run typecheck`, `npm run lint` e `npm test` no baseline — e eles **não provam a frente**. A suíte roda em jsdom e não tem impressora; o que ela cobre é que o HTML da página de teste mudou de geometria e que os dois lados do texto continuam iguais. A opção de impressão em si não é observável por teste neste repo.

O que prova é impressão real, numa bobina de 80 mm, e **não dá para fazer daqui** (a máquina de trabalho é WSL e não enxerga impressora do Windows):

1. empacotar (`npm run package`) ou instalar o `.exe` da pré-release no PDV;
2. com a Margem **de volta no valor de antes** (não no paliativo de 30–35 px), imprimir um pedido com o modelo `simples`: a sequência, a hora e a contagem de itens têm de sair inteiras;
3. imprimir a página de teste na mesma impressora: a moldura tem de fechar nos quatro lados;
4. **ler a largura na escala em milímetros** da própria página de teste (task 02): o ponto em que ela some do papel é a largura imprimível real. É esse número que diz se o driver declarou a área imprimível (RN-03) e é ele que decide se a decisão pendente 1 vira spec nova.

Três coisas a observar nesse passo, levantadas no review da task 02:

- **O número lido é piso em 5 mm.** A marca fica à esquerda do seu traço, então uma área de 72 mm mostra "70" e esconde "75". Registre o intervalo (`≥ 70 e < 75`), não o ponto — a decisão pendente 1 vai ser escrita em cima desse número.
- **A escala é a última coisa da página**, logo a mais perto do serrote e a que mais fica dentro do mecanismo até o próximo avanço de papel. Se a cauda vier rasgada ou engolida, mover a escala para antes da moldura é conserto de uma linha.
- **Área imprimível maior que 80 mm não é revelável** pela escala (o `body` tem teto de 80 mm, 16 células). Irrelevante em térmica; só não use esta página como medidor em impressora de folha.

Se o passo 2 não mudar nada em relação a hoje, a entrega **não é um fracasso**: é a medição que faltava para escrever o plano B. O que não pode acontecer é sair recuo grande nas quatro bordas — aí o driver declarou margens generosas demais, e a conversa é outra.

## Aprendizados que valem para as próximas tasks

- **A suíte completa estoura timeout nesta máquina com o padrão de workers.** São 6 CPUs e o Vitest sobe um worker por arquivo (73); dez testes de fila que escrevem arquivo de verdade dão "Test timed out in 5000ms" por contenção de I/O, e isso **não é regressão**. Rodados isolados, os mesmos 53 testes passam em 3 s. Use `npx vitest run --maxWorkers=4` para qualquer comparação com baseline — foi assim que o baseline desta spec foi medido (73 arquivos / 812 testes, tudo verde).
- **Afirmação sobre comportamento de terceiro em comentário precisa de origem.** A task 01 escreveu, seca, que o Chromium ignora o `@page margin` para qualquer `marginType` que não seja `default`. É verdade conhecida, mas **não é verificável neste repo**: a tipagem do Electron documenta só os valores aceitos. Passou a citar a RN da spec e a dizer que não é medível daqui. O critério: se a próxima pessoa não tem como conferir a frase, ela precisa saber de onde a frase veio.
- **Invariante escrita em regra tem de nomear o valor em vigor, não só o que mudou.** A primeira redação de `.claude/rules/printing.md:20` explicava o que `none` fazia e por que cortava, sem dizer que hoje se manda `printableArea` — e como o passo 4 cita a chamada abreviada, não havia onde descobrir. Regra que registra só a mudança envelhece em uma task.
- **Teste que lê HTML por texto precisa de âncora que não sobreviva ao erro.** A task 02 extraía a moldura com `slice(indexOf(a), indexOf(b))`; quando `b` não existe, `slice(start, -1)` devolve quase o documento inteiro e o teste passa a falhar por tabela em vez de medir o que diz medir — havia uma mutação real (escala dentro da moldura, sem indentação) que ele não pegava. A âncora passou a ser `match(/<div class="frame">[\s\S]*?\n<\/div>/)`, que depende da indentação do template e não de um índice que pode faltar.
- **`DOMParser` não existe no lado node.** `tsconfig.node.json` é `lib: ["ES2022"]` + `types: ["node"]`, e `new DOMParser()` dá `TS2304` ali. Teste de `src/main/**` que precisa olhar HTML usa regex; dar DOM ao tsconfig node destruiria o único guard de fronteira que o `CLAUDE.md` diz que funciona.
- **Texto visível que aparece em dois lugares da mesma página vira constante, não cópia.** A nota da página de teste citava a escala por um nome ("escala em milímetros") diferente do rótulo impresso ("Largura impressa (mm)"). O título virou `TEST_PRINT_SCALE_TITLE` e os dois derivam dele — é a mesma razão de `src/shared/testPrintContent.ts` existir, aplicada dentro do próprio arquivo.
- **A fonte única de texto faz a tela herdar instrução sobre markup que só o papel tem.** A nota compartilhada agora ensina a ler a escala em milímetros, e a tela `/print-test` — que afirma "é isto que vai sair" — não a desenha, de propósito (a pré-visualização é ilustração de geometria, spec 38 RN-09). É consequência aceita, mas é o tipo de divergência que cresce: texto novo que fale de um elemento do papel precisa de uma olhada na tela antes de entrar.
- **`onRawPrint.ts` agora tem teste** (`src/main/__tests__/onRawPrint.test.ts`), com `electron` mockado e `fs`/`os`/`printFonts`/`printerMatch` reais. Quem precisar exercitar o caminho de impressão no main já tem o molde pronto — inclusive o `vi.mock('../logger')`, que não é peso morto: sem ele o `electron-log/main` é carregado de verdade contra o stub de `electron` e o tempo de import do arquivo salta de ~2% para 77% do run.

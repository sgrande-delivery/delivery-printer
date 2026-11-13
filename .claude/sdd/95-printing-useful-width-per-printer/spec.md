# Spec — Largura útil por impressora

**Status:** rascunho
**Criada em:** 2026-11-13
**Escopo:** main+renderer
**Issue:** [#95](https://github.com/sgrande-delivery/delivery-printer/issues/95)

## Contexto

O comprovante continua saindo **cortado à direita** em campo depois da v3.1.1. A spec 89 trocou `marginType: 'none'` por `'printableArea'` (`src/main/ipc-events/onRawPrint.ts:38-40`), e isso só funciona **quando o driver declara a área imprimível certa** — a própria spec 89 avisou, na RN-03, que driver que declara área = papel deixa tudo como estava. É o caso do parque: PDV Windows com driver genérico de térmica ("Generic / Text Only", Elgin/Bematech/Epson antigos) que declara 80 × ∞, ou papel de 80 mm com bobina de 58, ou "Carta/A4" como padrão. Com eles, `printableArea` ≡ `none`. A cabeça de 80 mm imprime ~72 mm (576 pontos a 203 dpi), e o que a `delivery-api` põe entre 72 e 80 mm — sequência, hora e contagem nos modelos `simples`/`completo`, que alinham à direita com `justify-content: space-between` — é desenhado e não chega ao papel.

O segundo sintoma tem a mesma raiz: a **"fitinha em branco"** (relato do Christian, 2026-11-13). Com papel de bobina mal definido no driver ("80 x 0", "Receipt 80 x 25") ou margens não imprimíveis maiores que o papel, a caixa de conteúdo do `printableArea` fica com altura zero ou de poucos milímetros, e o Chromium manda o job assim mesmo: a impressora avança e corta uma tira vazia. Com `none` (≤ 3.0.2) as margens do driver eram ignoradas, por isso o sintoma apareceu ou piorou na 3.1.1. O `@page { size }` do HTML não salva: o Chromium ignora o `@page` para `marginType` diferente de `default` (spec 89, RN-02).

O fato que decide a frente: **o app não tem como saber a largura que a cabeça imprime, e a API não conhece a impressora.** O Electron não expõe a área imprimível fora do momento da impressão (`getPrintersAsync` devolve `name`, `displayName`, `isDefault`, `status` e um mapa de opções do driver — no Electron 43 tipado como `Options {}`). A fonte confiável é medir — a escala em milímetros que a spec 89 pôs na página de teste existe para isso — e **guardar o número por impressora, nesta máquina**.

O HTML da `delivery-api` é relativo e aguenta a mudança sem ser tocado. Nos dois layouts (`resources/views/print/layout.blade.php` e `resources/views/socket/order/layout/base.blade.php`, medidos em `origin/master` de lá) o filho direto do `<body>` é uma `div` com `padding: {{ margin_size }}` e `font-size` inline, `* { box-sizing: border-box }`, e o documento dentro dela é `max-width: {{ width_mm }}mm; width: 100%`. Encolher o filho do `body` faz o conteúdo refluir.

## Objetivo

O operador mede uma vez a largura que a impressora realmente imprime, o app guarda esse número para aquela impressora do Windows, e todo comprovante passa a ser diagramado dentro dele — com o tamanho de fonte que o lojista escolheu, sem `scaleFactor` e sem mudar nada na `delivery-api`. A mesma geometria explícita tira o driver da conta no caso da fitinha em branco. Impressora sem largura configurada continua exatamente como na v3.1.1.

## Requisitos funcionais

- **RF-01** — Cada impressora do Windows pode ter uma **largura útil (mm)**, inteira de 40 a 80, opcional, guardada nesta máquina. Sem valor, a impressora é "automática" (área que o driver declara).
- **RF-02** — Com largura útil configurada para a impressora de destino, o `printReceipt` imprime com `pageSize: { width: W × 1000, height: 297000 }` (micrômetros), `margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }`, e injeta no HTML, logo depois do `<html>`, um `<style>` que limita a largura: `@page { size: Wmm 297mm !important; margin: 0 !important; }` e `body > * { max-width: Wmm !important; }`. O `@page` diz o mesmo papel do `pageSize`, na forma que a gramática de `size` aceita (`<comprimento> auto`, a forma da API, não é uma delas e é descartada pelo parser).
- **RF-03** — Sem largura útil configurada, se o driver expuser no mapa de opções um papel com largura < 40 mm, altura < 50 mm ou altura 0, o `printReceipt` força `pageSize: { width: Pmm × 1000, height: 297000 }` com margens `custom` 0, em que P é a largura do documento (o último `@page { size: Nmm …}` do HTML; 80 se não houver), e registra no log que forçou.
- **RF-04** — Toda impressão registra no log a geometria usada: impressora de destino, papel que o driver expõe (quando expõe), `marginType`, `pageSize`, largura útil e o motivo da escolha.
- **RF-05** — A página de teste comum é diagramada com a largura útil da impressora de destino (moldura com `max-width` igual a W) e diz, no rótulo da escala, qual geometria foi usada.
- **RF-06** — Existe uma **página de medição**: a mesma página de teste, impressa sobre a bobina inteira do cadastro (58 ou 80 mm) com margens `custom` 0, ignorando a largura útil configurada, para que a cabeça corte a escala no ponto real.
- **RF-07** — Na tela Impressoras, o cadastro cuja impressora do Windows foi encontrada mostra a largura útil no cartão e permite, na gaveta de edição: ligar/desligar o ajuste, escolher o valor (40–80), **medir** (imprime a página de medição e pergunta "qual o último número que saiu inteiro na escala?", gravando a resposta) e imprimir a página de teste para conferir.

## Regras de negócio

- **RN-01** — **A largura útil é dado físico da máquina, e mora em `userData`.** Arquivo próprio, `printer-preferences.json`, chaveado pelo **nome do dispositivo do Windows** — não o nome do cadastro, não na `delivery-api`, não no `.env`. *Por quê:* a mesma loja tem PDVs com impressoras e drivers diferentes; um número na API valeria para todas as máquinas e estaria errado em metade delas, e o `.env` é build-time, igual para todo restaurante (CLAUDE.md). Arquivo próprio, e não o `ui-preferences.json`, porque o que está ali muda impressão, não aparência — e quem ler o arquivo de UI não espera achar geometria de papel.
- **RN-02** — **O casamento do dispositivo é o mesmo do destino do comprovante.** A largura útil de uma impressora é procurada pelo mesmo critério do `findPrinterByDeviceName` (`src/shared/printerMatch.ts:20`): igualdade do nome inteiro, sem diferenciar maiúscula. *Por quê:* critério diferente faria a tela mostrar uma largura que a impressão não aplica, ou o contrário — e nenhum dos dois dá erro. Consequência aceita: dois cadastros que apontam para o mesmo dispositivo dividem a largura útil, e a tela diz isso.
- **RN-03** — **Destino sem casamento é a impressora padrão do sistema, e a largura útil dela vale.** Quando o `deviceName` é `null` ou não casa, o Electron imprime na padrão (`.claude/rules/printing.md`, "O contrato do `rawPrint`"); a geometria é procurada para a impressora marcada `isDefault` na mesma lista. *Por quê:* o restaurante com uma impressora só recebe `device_name: null` da API, e é exatamente ele o que mais tem driver genérico.
- **RN-04** — **Sem largura útil configurada, nada muda.** A opção continua `marginType: 'printableArea'`, sem `pageSize` e sem `<style>` injetado (exceto o caso da RN-07). *Por quê:* driver que declara a área certa já imprime certo desde a v3.1.1; geometria explícita nele seria trocar o que funciona por um número digitado.
- **RN-05** — **Com largura útil, a geometria é explícita, e quem encolhe o conteúdo é o `max-width`, não o `pageSize`.** `pageSize` custom depende do driver aceitar papel personalizado; se recusar, o Chromium cai no papel padrão do driver. O `body > * { max-width: Wmm !important }` encolhe o retângulo em que o documento da API é diagramado, e o conteúdo reflui — é isso que garante o resultado; `pageSize` e margens `custom` 0 são reforço e tiram o driver da conta da altura (RN-07). `!important` porque o `<style>` injetado vem **antes** das regras da API no documento e perderia por ordem.
- **RN-06** — **A fonte do lojista não muda.** Nada de `scaleFactor`: ele reduz tudo (14 px vira 12,6 px a 90 %). O conteúdo reflui dentro da largura útil com o tamanho escolhido no painel.
- **RN-07** — **Papel inválido declarado pelo driver é contornado mesmo sem largura útil — quando o driver o expõe.** Se as opções da impressora (`printer.options`, chaves `media`/`PageSize`) trouxerem um papel em milímetros com largura < 40, altura < 50 ou altura 0, o app força `pageSize` na largura do documento com altura 297 mm e margens `custom` 0. *Limite que a spec não esconde:* não é verificável daqui se o Chromium do Windows põe o papel no mapa de opções (no CUPS ele põe as opções do destino); se não puser, esta regra não dispara no PDV, e **o caminho para a fitinha em branco é configurar a largura útil** — qualquer valor, inclusive 80 numa bobina de 80, já força a geometria explícita da RN-05. O log da RN-08 mostra no PDV o que o driver expõe, e é ele que diz se a regra serve.
- **RN-08** — **Toda impressão registra a geometria no log, e nada além dela.** `deviceName` de destino (ou "padrão do sistema"), o papel exposto pelo driver, `marginType`, `pageSize`, `usefulWidthMm` e o motivo (`printable-area`, `useful-width`, `invalid-driver-paper`, `measure`). Nada do conteúdo do comprovante. *Por quê:* hoje o suporte não distingue "driver mentiu" de "HTML largo", porque o log não registra a geometria. Mensagens de log em inglês, como o resto do repo.
- **RN-09** — **Uma decisão de geometria, num lugar.** A escolha da opção de impressão é uma função pura do main, chamada só pelo `printReceipt`, que continua sendo o **único** `webContents.print` do repo (spec 89, RN-01). *Por quê:* opção de impressão decidida em dois lugares sai como papel diferente de caminho diferente, e ninguém consegue dizer por quê.
- **RN-10** — **A injeção de `<style>` vai depois do `<!DOCTYPE html>`/`<html>`**, no mesmo ponto dos `@font-face` (`src/main/printFonts.ts:35-55`). Qualquer coisa antes do doctype joga o Chromium em quirks mode e muda as métricas do documento inteiro.
- **RN-11** — **A página de teste confirma, a página de medição mede — e as duas não se confundem.** Com largura útil configurada, a página de teste sai numa página de W mm: a escala não passa de W, e o que ela confirma é a moldura fechada nos quatro lados e a escala terminando na marca da largura configurada. Para medir é preciso ignorar a configuração e diagramar sobre a bobina inteira (RF-06); senão a escala é cortada pelo próprio app e o número lido é o que foi digitado. A escala continua em milímetros fixos e fora da moldura (spec 89, RN-06).
- **RN-12** — **O número lido na escala é piso em 5 mm e é gravado como está.** A escala marca de 5 em 5 (spec 89, plan, "Verificação da entrega"): uma área de 72 mm mostra "70" e esconde "75". Gravar 70 é conservador — perde até 5 mm à direita, mas nunca corta. Quem quiser os milímetros que sobram ajusta o valor à mão e confere na página de teste.
- **RN-13** — **Valor fora da faixa não é aplicado.** A faixa (40–80, inteiro) mora em `src/shared/`, usada pelos dois lados. A escrita recusa valor inválido; a leitura descarta entrada inválida do arquivo (editável à mão) com `logger.warn`, e a impressora volta a ser automática. *Por quê:* diferente da largura da sidebar, aqui o valor ajustado em silêncio vira comprovante cortado; automática é o comportamento conhecido.
- **RN-14** — **Canal IPC é par, e o renderer não tem Node.** A tela lê e grava a largura útil por dois canais declarados em `src/shared/ipcChannels.ts`, com o handler no main, a linha no preload e o stub em `src/__tests__/setup.ts` (`.claude/rules/printing.md`, "IPC").
- **RN-15** — **Sem alteração na `delivery-api`.** Nenhuma rota, view ou chave nova. `max_width`, `margin_size` e `font_size` do painel continuam valendo; a largura útil só limita o retângulo.
- **RN-16** — **A correção só chega quando o operador fecha o app pela bandeja** (`.claude/rules/autoupdate.md`), e pode levar dias. Os paliativos sem código continuam valendo no intervalo e entram no relatório do `/ship`: trocar o papel padrão do driver para a variante com a área útil entre parênteses ("80(72) x 297", "58(48)"), quando existir, ou subir a Margem para 30–35 px no painel.

## Fora do escopo

- **`scaleFactor` / campo "Reduzir %".** A recomendação é `max-width` + `pageSize`; redução proporcional fica como último recurso, em spec própria, se a medição em campo mostrar que não basta.
- **Qualquer mudança na `delivery-api`** (RN-15), inclusive o `removed_ingredients_line` e os complementos v2 faltando no comprovante — isso é a `API-155` lá ([delivery-api#365](https://github.com/sgrande-delivery/delivery-api/issues/365)).
- **Descobrir a área imprimível em código** no Windows. O Electron não a expõe; quem mede é o operador.
- **Sincronizar a largura útil entre máquinas** ou exibi-la no painel.
- **A pré-visualização da tela `/print-test`.** Ela não desenha a escala (spec 38, RN-09) e continua igual; o que muda na página impressa é o rótulo da escala e o teto da moldura, que só o papel tem.
- **Trocar a escala de 5 mm por 1 mm.** É a escala da spec 89; recalibrá-la é outra frente.

## Critérios de aceitação

- [ ] Impressora com driver que declara área = papel: com largura útil = número lido na escala da página de medição, o comprovante `simples` sai com sequência, hora e contagem **inteiras**, Margem no padrão (15 px), sem `scaleFactor`
- [ ] Impressora sem largura útil configurada: `webContents.print` é chamado com `margins: { marginType: 'printableArea' }`, sem `pageSize`, e o HTML não recebe o `<style>` de largura (teste do `printReceipt`)
- [ ] Página de teste com largura útil configurada: moldura fechada nos quatro lados e escala terminando na marca da largura configurada
- [ ] Bobina de 58 mm em driver que diz 80: largura útil 48 → comprovante inteiro
- [ ] Driver com papel "80 x 0" / "80 x 25": com largura útil configurada (qualquer valor), o comprovante sai inteiro; e, quando o driver expõe o papel nas opções, sai inteiro mesmo sem largura útil (RN-07)
- [ ] O log de cada impressão traz a geometria (RN-08)
- [ ] `grep -rn "webContents.print" src/` continua mostrando **um** ponto de chamada
- [ ] O par de canais novo aparece no `ipcChannels.ts`, no preload, no `main.ts` e no stub de `setup.ts`, e o `ipcChannels.test.ts` passa
- [ ] `npm run typecheck`, `npm run lint` e `npx vitest run --maxWorkers=4` no baseline
- [ ] Release pelo fluxo de pré-release (CLAUDE.md, "Condições de release") e `delivery_printer_version` atualizado no admin

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Onde mora o controle na tela Impressoras | **Seção "Nesta máquina" dentro da gaveta de edição**, com gravação imediata e independente do "Salvar no servidor", e a largura na linha de detalhe do cartão. Uma gaveta nova duplicaria foco, Esc e trava de Tab; o campo no cartão poluiria todos os cartões para um ajuste que se faz uma vez |
| 2 | Valor inicial ao ligar o ajuste sem medir | **72 para bobina de 80 e 48 para bobina de 58** — as larguras de cabeça comuns (576 e 384 pontos a 203 dpi). O operador confere na página de teste |
| 3 | Mensagem de log em português (como a spec original sugeria) ou inglês | **Inglês**, como todo o log do repo (`print-fonts: …`, `preferences: …`); o texto da spec original vira `print-geometry: the driver declares an invalid paper, forcing pageSize` |
| 4 | RN-07 provavelmente não dispara no Windows | **Entregar assim mesmo, com o log da RN-08**, e tratar a fitinha em branco pela largura útil configurada. Se o log de campo mostrar que o driver expõe o papel, a regra já está lá; se não, ela custa uma função pura |
| 5 | Altura de 297 mm na geometria explícita | **Manter 297 mm, como a spec original.** O Chromium pagina na altura do `pageSize`: comprovante com mais de 297 mm sai em duas páginas, e driver configurado para "cortar por página" corta no meio. É o mesmo papel padrão da maioria dos drivers do parque ("80 x 297"), então para eles nada muda; quem tem papel longo ("80 x 3276") passa a paginar. Medir a altura do conteúdo e passá-la como `pageSize` resolveria, mas exige diagramar a janela oculta na largura da página para a medida valer — fica para spec própria se a verificação de campo mostrar o corte |

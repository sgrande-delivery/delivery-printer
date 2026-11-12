# Spec — Imprimir dentro da área imprimível do driver

**Status:** rascunho
**Criada em:** 2026-11-12
**Escopo:** main
**Issue:** [#89](https://github.com/sgrande-delivery/delivery-printer/issues/89)

## Contexto

O comprovante sai **cortado do lado direito** nas bobinas de 80 mm. Medido em 2026-11-12, com duas fotos do mesmo pedido impresso com `margin_size` 20 px e com "Sem margem": nos dois casos a sequência (`#0020`), a hora e a contagem de itens somem na borda, e o corte cai sempre na mesma coluna, em linhas diferentes.

A causa está na opção de impressão deste app. O `printReceipt` chama `webContents.print` com **`margins: { marginType: 'none' }`** (`src/main/ipc-events/onRawPrint.ts:32-34`), e `none` não quer dizer "sem margem no papel": quer dizer **diagramar sobre a largura física inteira da folha, ignorando a área não imprimível que o driver declara**. Numa bobina de 80 mm a cabeça térmica cobre ~72 mm (576 pontos a 203 dpi). Tudo o que a `delivery-api` posiciona entre 72 mm e 80 mm é desenhado pelo Chromium e **nunca chega ao papel**.

O HTML não tem culpa, e não é aqui que ele se conserta. A `delivery-api` manda `@page { size: {{ width_mm }}mm auto; margin: 0 }` com o contêiner em `max-width: {{ width_mm }}mm; width: 100%` (`resources/views/print/layout.blade.php`), dentro de uma div com `padding: {{ margin_size }}px`. O contêiner é **relativo**: encolher o retângulo em que ele é diagramado basta para ele caber. Com `padding` em px, a conta é direta — 1 px CSS = 0,2646 mm:

| `margin_size` | Onde o conteúdo termina | Numa cabeça de 72 mm |
| --- | --- | --- |
| 1 px ("Sem margem") | 80,0 mm | corta ~8 mm |
| 20 px (o da foto) | 74,7 mm | corta ~2,6 mm |
| 30 px | 72,1 mm | no limite |
| 35 px | 70,7 mm | cabe com folga |

**Por que apareceu agora:** os modelos `simples` e `completo` da `delivery-api` ([#1415](https://github.com/sgrande-delivery/delivery-api/pull/1415)–[#1418](https://github.com/sgrande-delivery/delivery-api/pull/1418)) montam quase toda linha com `display: flex; justify-content: space-between` — a sequência, a hora, a contagem de itens, o rodapé. Todas encostam na borda direita do contêiner. No modelo `original` só o total ficava lá, então o mesmo defeito existia e aparecia num lugar só.

**O paliativo já está disponível e não é esta spec:** subir a Margem para 30–35 px na tela de impressão (ou no painel) resolve hoje, porque a `delivery-api` renderiza o HTML **a cada impressão** e nenhuma atualização deste app é necessária. O custo é o mesmo branco desperdiçado à esquerda, e a loja tem de saber que precisa fazer isso. Esta spec existe para que a loja **não** precise.

## Objetivo

O comprovante é diagramado na largura que a impressora realmente imprime, e não na largura do papel. Loja nenhuma precisa descobrir e configurar uma margem para o comprovante sair inteiro, e a página de teste local continua dizendo a verdade sobre a mesma impressora.

## Requisitos funcionais

- **RF-01** — O `printReceipt` imprime com a caixa de conteúdo da página igual à **área imprimível** declarada pelo driver, e não à largura física do papel. Vale para todo caminho que imprime, porque todos passam por ele: fila de comprovantes, conta de mesa, `rawPrint` e página de teste.
- **RF-02** — A página de teste local (`buildTestPrintPage`) é diagramada pelo **mesmo contrato do comprovante** — largura relativa limitada por `max-width` —, em vez da largura fixa em milímetros de hoje (`src/main/testPrintPage.ts:63-64`).
- **RF-03** — A página de teste traz uma **escala em milímetros**, desenhada em medida fixa e **fora da moldura**, para que o ponto em que ela é cortada seja a largura imprimível real da impressora, legível sem régua física.
- **RF-04** — A nota e as réguas dizem o que o operador deve ler: moldura cortada significa que o driver declara uma área imprimível maior do que a cabeça alcança; a escala em milímetros dá a largura real; e a régua de colunas é escala de leitura ("anote a última coluna visível"), não promessa de caber.
- **RF-05** — O comentário do `printReceipt` e a regra `.claude/rules/printing.md` registram o que `marginType` decide, porque é invariante de impressão e não detalhe de implementação.

## Regras de negócio

- **RN-01** — **Opção de impressão mora num lugar só.** `printReceipt` (`onRawPrint.ts:11`) é o único ponto do repo que chama `webContents.print`, e comprovante, conta de mesa e página de teste passam todos por ele. *Por quê:* opção de impressão duplicada por caminho não dá erro em lugar nenhum — sai papel diferente de caminho diferente e ninguém consegue dizer por quê. Task que precise de opção diferente por tipo de documento abre a discussão, não acrescenta um segundo `print`.
- **RN-02** — **`marginType` diferente de `'default'` ignora o `@page { margin }` do HTML.** O comprovante da `delivery-api` declara `margin: 0` no `@page`; com `'printableArea'` quem decide o recuo é o driver. *Por quê:* é exatamente isso que faz a troca funcionar sem tocar no HTML de seis documentos em produção — e é também o que amarra o resultado ao que o driver declara (RN-03).
- **RN-03** — **O conserto é condicional ao que o driver declara, e a spec não promete o que o Windows não informa.** Driver que declara área imprimível igual ao papel — comum em térmica — deixa tudo como está: o comprovante continua cortando, **sem regressão**. Driver que declara margens generosas acrescenta recuo visível nas quatro bordas. *Por quê:* o que esta frente entrega com certeza é parar de pedir ao Chromium que desenhe onde a impressora não imprime; o quanto isso recupera é medição de PDV, não de suíte. É por isso que a verificação da entrega é uma impressão real, e é por isso que o número medido tem de ir no relatório.
- **RN-04** — **Nada de layout de impressão muda aqui.** O comprovante cabe porque o contêiner dele é relativo (`max-width: Xmm; width: 100%`), não porque este app o reescreva. O HTML vem da `delivery-api` e continua vindo (CLAUDE.md, "O que NÃO fazer").
- **RN-05** — **A página de teste tem de ser diagramada como o comprovante, senão o diagnóstico mente.** Hoje ela é `body { width: ${width}mm }` com a moldura em `width: calc(${width}mm - 4mm)` — largura **fixa**. Numa caixa de conteúdo de 72 mm, esses 80 mm transbordam e a moldura sai cortada **na impressora em que o comprovante acabou de ficar certo**. *Por quê:* é o próprio motivo que o comentário de `testPrintPage.ts:48-55` já registra para o recuo de 2 mm — diagnóstico que acusa a impressora certa manda o operador caçar o problema errado. Adaptada, a moldura passa a medir outra coisa, e algo que nada mais mede: **se o driver está dizendo a verdade** sobre a área imprimível.
- **RN-06** — **A escala em milímetros é a única coisa da página que não pode se adaptar.** Ela é desenhada em medida fixa, fora da moldura, e é cortada pela borda da área imprimível; é esse corte que dá o número. *Por quê:* tudo o mais na página passa a encolher junto com a caixa de conteúdo (RN-05), e página que encolhe inteira nunca revela quanto encolheu. A escala existe para ser cortada — e é ela que substitui a régua física no passo de verificação do `plan.md`.
- **RN-07** — **A régua de 40 colunas deixa de prometer que cabe.** `TEST_PRINT_COLUMNS` são 40 colunas de 12 px, ~70 mm em Consolas, que não cabem nos ~64 mm de conteúdo que sobram dentro da moldura numa área imprimível de 72 mm. *Por quê:* a nota de hoje ("se a régua sai cortada ou quebra em duas linhas, a largura configurada não é a do papel") passaria a ser falsa em toda impressora correta. A régua vira escala: a última coluna visível é quantos caracteres aquela impressora dá naquele corpo de fonte.
- **RN-08** — **O texto da página de teste mora em `src/shared/testPrintContent.ts` e tem dois leitores.** A página que o main imprime (`testPrintPage.ts`) e a pré-visualização da tela (`testPrintView.ts:86-87`). *Por quê:* a tela afirma "é isto que vai sair", e o teste que compara o HTML real com o DOM renderizado cai se só um lado mudar. Mudar a nota é mudar a tela junto, de graça — desde que o texto não seja digitado duas vezes.
- **RN-09** — **A correção só chega ao PDV quando o operador fecha o app pela bandeja**, e isso pode levar dias (`.claude/rules/autoupdate.md`). *Por quê importa nesta spec:* o paliativo (Margem 30–35 px) não é alternativa à correção nem fica obsoleto com ela — é o que atende a loja no intervalo, e tem de estar no relatório do `/ship` junto com a ordem de entrega.
- **RN-10** — **Fechar a margem não é tarefa do operador.** Depois desta frente, loja que esteja com a Margem alta por causa do corte pode voltá-la ao que preferir; o app não mexe em configuração de loja e não avisa nada na tela. *Por quê:* a chave é da `delivery-api` e vale para todo documento da loja; escrever nela a partir de uma mudança de impressão deste app seria este repo decidindo layout, que é o que a RN-04 proíbe.

## Fora do escopo

- **`scaleFactor` como alternativa.** É o plano B se a medição mostrar que o driver não declara área imprimível nenhuma, e exige escolher de onde vem o número (constante, configuração por instalação, cálculo). Spec própria, com a medida na mão.
- **Configuração de margem ou de largura por instalação** (arquivo em `userData`). Só se a medição provar que um número por máquina é inevitável.
- **Qualquer layout de comprovante**, aqui ou na `delivery-api`. O defeito de geometria é este app; o HTML está certo.
- **Trocar `paper_width` para 72** na `delivery-api`. A coluna tem `CHECK (paper_width IN (58, 80))` (`src/renderer/services/printers.ts:32`), e a largura do papel é 80 mm mesmo — o que não é 80 mm é a cabeça.
- **Ensinar a Margem de 30–35 px na interface.** O paliativo vive no relatório do `/ship` e no suporte, não num aviso de tela que fica desatualizado no dia em que a correção chegar.
- **O app saber, em código, qual é a área imprimível.** O Electron não a expõe fora do momento da impressão (`getPrintersAsync` devolve `name`, `status`, `isDefault` e um mapa de opções do driver), e descobrir por outro caminho é investigação própria. Quem mede é o operador, lendo a escala impressa (RF-03) — o app não guarda esse número nem decide nada com ele.

## Critérios de aceitação

- [ ] `webContents.print` é chamado com `marginType: 'printableArea'`, e `grep -rn "webContents.print" src/` continua mostrando **um** ponto de chamada
- [ ] `buildTestPrintPage` não emite largura fixa em milímetros no `body` nem na moldura; a largura declarada vira teto (`max-width`)
- [ ] O teste de `testPrintPage` cobre a geometria nova e não passa com a antiga (foi verificado por mutação)
- [ ] A escala em milímetros é emitida em medida fixa, fora da moldura, e some do papel no ponto em que a área imprimível acaba
- [ ] A nota nova aparece igual na página impressa e na pré-visualização da tela `/print-test`, vinda de `src/shared/testPrintContent.ts`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` saem como o baseline (0 erro; o aviso de `Login.tsx` pode existir, não pode aumentar)
- [ ] **No PDV, com o instalador da pré-release:** um pedido com o modelo `simples` sai com a sequência, a hora e a contagem de itens **inteiras**, com a Margem de volta no valor de antes
- [ ] **No PDV:** a página de teste sai com a moldura fechada nos quatro lados, na mesma impressora
- [ ] O relatório diz quanto o driver recuou de fato — o número lido na escala em milímetros da página de teste —, porque é ele que decide se a RN-03 caiu do lado bom

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | E se o driver declarar área imprimível igual ao papel, e nada mudar? | **Entregar assim mesmo e registrar a medida.** `none` pede ao Chromium para desenhar onde a impressora não imprime; isso está errado independentemente de o driver ajudar. O plano B (`scaleFactor`, ou largura por instalação) é spec própria, e só se escreve bem com o número medido na mão |
| 2 | A régua de 40 colunas continua em 40? | **Sim, e vira escala.** Mudar o número a recalibraria para uma largura que esta spec não conhece ainda; o que muda é o que a nota promete sobre ela (RN-06) |

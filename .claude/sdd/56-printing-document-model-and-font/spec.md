# Spec — Modelo de documento e fonte na tela de impressão

**Status:** rascunho
**Criada em:** 2026-11-05
**Escopo:** renderer
**Issue:** [#56](https://github.com/sgrande-delivery/delivery-printer/issues/56)

## Contexto

A tela de impressão deste app (`/printer-settings`) oferece hoje **cópias, tamanho da fonte, margem e "Sem margem"** — dois cartões, `Cópias` e `Layout do comprovante` (`src/renderer/components/printer-settings/PrinterSettingsForm.tsx:145-171`), mais o cartão local de `Aparência`. Tudo ali é **geometria e quantidade**: a loja não escolhe nada sobre a **forma** do documento.

O `delivery-admin` escolheu, na spec [1026](https://github.com/sgrande-delivery/delivery-admin/issues/1026) (branch `feat/admin-v2`, rota `/printer-settings`), e para isso acrescentou **duas chaves** às mesmas linhas de `printer_settings`:

| Chave | Valores | Padrão | Como nasce |
| --- | --- | --- | --- |
| `document_model` | `original` · `completo` · `simples` | `original` | **ausente** |
| `font_family` | `original` · `plex` · `atkinson` · `barlow` | `original` | **ausente** |

As duas nascem ausentes em **toda** loja porque a [delivery-api#1410](https://github.com/sgrande-delivery/delivery-api/issues/1410) decidiu não fazer migration nem seeder: ausente significa `original` na leitura, e é isso que faz "loja existente não vê a impressão mudar" ser verdade sem backfill. Os nomes, as descrições em pt-BR e os pesos por família estão em `delivery-admin/src/constants/printDocumentModels.ts:10` e `printFonts.ts:15`; a resolução de ausente e de valor fora do enum, em `delivery-admin/src/helpers/printDocumentStyle.ts:17,26`.

**As duas pontas que faltavam já subiram.** A `delivery-api` renderiza os três modelos e emite a família e o peso nos seis documentos (#1410, shipped), e **este app já embarca as seis faces de impressão** e declara os `@font-face` no HTML que manda para a impressora (spec [#52](https://github.com/sgrande-delivery/delivery-printer/issues/52), PR #55 mergeado em `feature/api-v2-and-redesign`). O que falta é o lugar onde a escolha é feita **daqui**: hoje o operador no PDV tem de abrir o painel administrativo para mudar o modelo ou a fonte do papel que sai ao lado dele.

**Três fatos medidos que decidem o desenho desta frente:**

- **`printer_settings` é chave/valor sem whitelist, e o `PUT` apaga e recria.** O `UpdatePrinterSettingsUseCase` da `delivery-api` apaga **todas** as linhas da loja e recria uma por chave do corpo; não há `FormRequest`, então chave nova grava e valor fora do enum grava também. Este repo já trata isso: o baseline é uma *bag* (`PrinterSettingsData = Partial<PrinterSetting> & Record<string, unknown>`, `src/renderer/services/printerSettings.ts:11`), lida **no instante de salvar** (`PrinterSettingsForm.tsx:97-110`), e o corpo é sempre `{...loaded, ...changes}` (`printerSettings.ts:48-58`). Chave que este app nunca ouviu falar **já sobrevive ao round trip** — `document_model` e `font_family` atravessam a tela de hoje sem que ela saiba que existem.
- **O modelo de draft desta tela é só numérico.** `StepKey` são quatro chaves de número e `CLOSED_SETS` é `Record<StepKey, readonly number[]>` (`printerSettingsModel.ts:4,13`); `diffChanges` itera as chaves de `CLOSED_SETS` mais o booleano `no_margin` (`:66-82`). Chave de enum string não tem lugar nessa estrutura: ela precisa de um conjunto próprio, com resolução de ausente.
- **Os seis woff2 das famílias de impressão não passam pelo Vite.** Eles vivem em `assets/fonts/` e chegam ao PC por `extraResources`, para o **main** resolver por `getAssetPath` (`src/main/printFonts.ts:61`, `assets/fonts/README.md`). O bundle do renderer tem **zero** deles: a única face do renderer é o recorte da Material Symbols (`src/renderer/app.css:93`). Escrever o nome de cada fonte na própria face, como o painel faz, exige declarar face **no renderer** — e é a única coisa desta frente que mexe no que vai dentro do instalador.

**A tensão com a spec 52, resolvida aqui.** A RN-01 de lá diz que este repo **não lê `font_family` e não escolhe família em lugar nenhum**, e lista "tela, configuração ou chave nova neste app" como fora do escopo **daquela** spec. Esta frente **não** desfaz aquilo: quem escolhe a família no papel continua sendo o HTML que a `delivery-api` manda, e este app continua só declarando as faces. O que muda é que a tela passa a **escrever** as duas chaves — e o custo disso está na RN-05.

## Objetivo

O operador no PDV escolhe, na própria tela de impressão deste app, **qual modelo** de documento e **qual fonte** a loja imprime, com os mesmos nomes e descrições do painel e cada fonte escrita na própria face. Loja que não encostar nos controles continua imprimindo exatamente como imprime hoje, e nenhuma outra configuração é perdida ao salvar.

## Requisitos funcionais

- **RF-01** — **Modelo de documento**: três cartões de rádio com nome e uma linha de descrição — "Original / Igual ao que imprime hoje", "Completo / Seções, linhas e destaques para leitura rápida", "Simples / Só o essencial, usa menos papel" — no topo do cartão `Layout do comprovante`, acima de "Tamanho da fonte".
- **RF-02** — Com **Original** selecionado, uma linha de apoio abaixo dos cartões: "A cozinha e os entregadores continuam vendo o mesmo documento de hoje."
- **RF-03** — **Fonte**: quatro cartões de rádio — "Original / Fonte do sistema, como hoje", "IBM Plex Sans Condensed / Estreita, cabe mais por linha", "Atkinson Hyperlegible / Máxima legibilidade, mais larga", "Barlow Semi Condensed / Meio-termo, traço uniforme" —, cada nome **escrito na própria face**; o "Original" na fonte da interface.
- **RF-04** — Chave ausente, ou com valor fora do enum, aparece como **Original** selecionado nos dois grupos.
- **RF-05** — Os dois grupos funcionam por teclado: `role="radiogroup"` com `role="radio"` e `aria-checked` nos itens, Tab só no selecionado, setas trocando a seleção e movendo o foco, Enter e Espaço selecionando.
- **RF-06** — "Salvar" grava as duas chaves no mesmo `PUT /printerSettings`, preservando todas as outras linhas da loja; a barra "Alterações não salvas" e o "Descartar" cobrem as duas escolhas como cobrem as de hoje.
- **RF-07** — As faces das três famílias acompanham o renderer e aplicam **sem rede**, no app empacotado e em desenvolvimento.
- **RF-08** — A divergência em relação ao desenho congelado entra na tabela "Fidelidade ao desenho" da spec [#38](https://github.com/sgrande-delivery/delivery-printer/issues/38), com o motivo.

## Regras de negócio

- **RN-01** — **Ausente é `original`, e valor fora do enum também.** *Por quê:* a #1410 não fez migration nem seeder, então **nenhuma** loja tem as duas linhas hoje; e o `PUT /printerSettings` não tem `FormRequest`, então a tela não pode presumir que o que leu é um dos valores do enum. É a mesma regra do painel (spec 1026, RN-01): as duas pontas resolvendo igual é o que mantém a escolha com um significado só.
- **RN-02** — **O draft compara pelo valor *resolvido*, não pelo bruto.** Voltar à escolha em vigor deixa o formulário limpo e **não grava nada** — inclusive quando a chave está ausente e o operador clica em "Original". *Por quê:* é o contrato que a tela já tem para os números ("going back to the stored value leaves the draft clean", `printerSettingsModel.ts:66`), e é o que impede que abrir a tela e passar o olho crie linha nova no banco da loja. **Consequência a declarar:** linha que guarda uma string inválida **não é consertada** por selecionar "Original", porque para todo leitor — esta tela, o painel e as views da API — ela já significa `original`. Não há escolha a corrigir, só um byte diferente guardando o mesmo sentido.
- **RN-03** — **O corpo do `PUT` é a bag inteira lida no instante de salvar, com as duas chaves novas por cima.** *Por quê:* o `UpdatePrinterSettingsUseCase` apaga todas as linhas da loja e recria uma por chave do corpo — chave ausente não significa "não mexa", significa "apague". É por isso que `max_width` (a largura da bobina) e `delivery_printer_version` (de onde o painel monta o link do instalador) sobrevivem a um salvamento feito daqui, e nenhum dos dois tem campo nesta tela. O caminho já existe (`printerSettings.ts:48-58`); esta frente **não** pode trocá-lo por um payload montado a partir de campos.
- **RN-04** — **`document_model` e `font_family` não entram em `KNOWN_KEYS`.** *Por quê:* aquele guard é `KNOWN_KEYS.some(key => key in data)` (`printerSettings.ts:26`) e existe para recusar baseline vindo de fonte errada — ele vale porque as sete chaves que lista são **semeadas no cadastro** de todo restaurante. As duas novas nascem ausentes: incluí-las faria uma bag que tem só elas passar por baseline confiável, e salvar sobre essa bag apagaria as linhas reais da loja.
- **RN-05** — **Este app escreve a chave; continua sem lê-la no caminho de impressão.** A RN-01 da spec 52 segue valendo por inteiro: nenhum código deste repo lê `font_family` ou `document_model` para escolher família, layout ou rota de impressão. *Por quê, e qual é o custo:* o contrato que mantém este app agnóstico é "a API nomeia, o app declara a face". Uma tela que escreve a chave não fere isso, mas **cria uma segunda cópia do enum neste repo**, que passa a precisar de sincronia com `PrintFontEnum`/`PrintDocumentModel` da `delivery-api` e com as constantes do `delivery-admin`. Valor novo que aparecer lá e não aqui some do seletor **em silêncio** — a tela não mostra opção que não conhece, e o valor salvo pela outra ponta continua funcionando. É o preço aceito para o operador não precisar do painel; quem acrescentar modelo ou fonte na API tem de abrir issue aqui.
- **RN-06** — **A grafia da família no `@font-face` do renderer tem de casar com a da tabela de opções, e CSS não importa TS.** *Por quê:* o nome da família é a única cola entre a face declarada no `app.css` e o `font-family` que o rótulo pede; divergência de uma letra deixa o rótulo no fallback, com a tela inteira funcionando e nenhum erro. É a mesma armadilha que a spec 52 registrou do outro lado (`src/main/printFonts.ts:10-13`), onde a grafia é **contrato com a `delivery-api`**. **E as duas não são a mesma coisa:** as faces do main servem ao documento de impressão e as do renderer servem ao rótulo da tela. Por isso a conferência é um teste que lê o `app.css` e exige, para cada família nomeada nas opções, um `@font-face` declarado.
- **RN-07** — **Uma face por família no renderer.** *Por quê:* o único consumidor é o nome dentro do cartão, que usa um peso só. As **seis** faces do documento de impressão continuam como estão (spec 52, RN-07) — este é outro consumidor, com outra lista. Peso que nenhum rótulo pede é só tamanho de instalador em máquina de cliente.
- **RN-08** — **A fonte do rótulo vem do pacote, nunca da rede.** Nenhum `<link>` para `fonts.googleapis.com` atravessa para o app. *Por quê:* é a RN-01 da interface deste repo e a RN-04 da spec 52 — o PDV pode estar sem rede exatamente quando precisa imprimir, e a tela de impressão é onde o operador vai quando a impressão está dando problema.
- **RN-09** — **A pré-visualização da coluna direita continua sendo ilustração de geometria, em monospace.** Ela **não** segue o modelo nem a fonte escolhidos. *Por quê:* ela promete largura, tamanho e margem, e só isso (spec 38, RN-07); fazê-la seguir o modelo seria prometer um layout que este app não renderiza e não conhece — a réplica dos três modelos é do painel, que a construiu espelhando as views da API (spec 1026, RN-05). Decisão do dev nesta frente: a pré-visualização de documentos não vem para cá.
- **RN-10** — **A escolha feita aqui chega ao papel pela `delivery-api`, e a fonte só aparece em PDV que já tenha a versão com as faces embarcadas.** *Por quê:* o HTML vem da API (que já renderiza os três modelos), e as faces de impressão entraram na spec 52, ainda **não publicada em release**. A atualização chega quando o operador fecha o app **pela bandeja** — pode levar dias (`.claude/rules/autoupdate.md`). Até lá, a escolha de modelo já muda o papel (é a API que renderiza) e a de fonte cai no fallback, em silêncio. Isso vai no relatório do `/ship-pr`, não num aviso na tela.

## Fora do escopo

- **A pré-visualização de documentos do painel e as miniaturas dos modelos** — decisão do dev nesta frente (RN-09). O painel replica os três modelos numa folha de expedição (`delivery-admin/src/pages/printer-settings/preview/`); aqui a coluna direita segue sendo a ilustração de geometria.
- **Mover "Tamanho da fonte" para um cartão novo "Documentos"**, como o painel fez (spec 1026, RF-05). Aqui os dois controles novos entram no cartão que o desenho já posicionou, e o tamanho da fonte fica onde está — mover um controle já desenhado custa divergência e reflui os testes da tela, sem ganho para quem opera.
- **Renderizar os modelos `completo` e `simples`**, ou qualquer layout de impressão, neste repo. O HTML vem da `delivery-api` (`CLAUDE.md`).
- **Ler `font_family` ou `document_model` no caminho de impressão** (RN-05, e RN-01 da spec 52).
- **A página de teste local sair na fonte escolhida.** O `buildTestPrintPage` é gerado aqui e não conhece a escolha da loja; segue fora, como na spec 52.
- **`max_width` e `delivery_printer_version`** — sem campo nesta tela, e atravessam o salvamento pela bag (RN-03).
- **Modelo ou fonte por documento, ou por impressora.** É uma escolha só, da loja, para os seis documentos — é o que mantém a cozinha com um layout para aprender (spec 1026).
- **`latin-ext`.** As faces são o recorte `latin` (`assets/fonts/README.md`): letra fora do Latin-1 cai no fallback glifo a glifo. Limitação herdada, não desta frente.

## Critérios de aceitação

- [ ] Com as duas chaves **ausentes** (toda loja hoje), a tela abre com "Original" selecionado nos dois grupos e **nada** é enviado ao salvar outra mudança qualquer
- [ ] Escolher "Completo" e "IBM Plex Sans Condensed" e salvar manda um `PUT /printerSettings` cujo corpo tem as duas chaves novas **e** todas as linhas que já existiam, incluindo `max_width` e `delivery_printer_version`
- [ ] Reabrir a tela depois de salvar mostra as duas escolhas persistidas (vindas do `/users/me`)
- [ ] Chave com valor inválido (`document_model: "foo"`) aparece como "Original" e não derruba a tela
- [ ] Os quatro nomes de fonte aparecem **cada um na sua face** nos dois temas, e com a máquina **sem rede**
- [ ] Os dois grupos são operáveis só por teclado: Tab entra no selecionado, setas trocam, Enter e Espaço selecionam
- [ ] `npm run typecheck`, `npm run lint` e `npm test` saem como o baseline (0 erro; o aviso de `Login.tsx` pode existir, não pode aumentar)
- [ ] Todo componente novo com estilo tem teste chamando `expectNoUndefinedClasses()`, e asserção de presença por chave de `styles` nos elementos que carregam layout
- [ ] O delta do bundle do renderer é medido e dito no relatório (`npm run build`), e as faces aparecem em `out/renderer/assets/`
- [ ] A linha nova está na tabela "Fidelidade ao desenho" da spec 38

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Qual peso usar na face do rótulo | **O peso do corpo do comprovante**: Plex 500, Atkinson 400, Barlow 500 — os mesmos que o `PrintFontEnum::weight()` da API emite. É o traço que o operador vai ler na bobina, e é o critério pelo qual ele escolhe. O painel usa o 700 porque lá o nome é título de cartão; aqui o cartão tem nome e descrição, e o nome não precisa do peso de título |
| 2 | Como os três woff2 chegam ao bundle do renderer | **Referenciar `assets/fonts/*.woff2` pelo `app.css`** (`url('../../assets/fonts/…')`), deixando o Vite emiti-los: fonte única de bytes, sem segunda cópia no repo para sair de sincronia. O `fs.allow` default do Vite é a raiz do projeto, então deve servir também no `npm run dev` — **tem de ser medido nos dois modos**. Se o dev server recusar, a saída é copiar as três faces para `src/renderer/fonts/` (como a fonte de ícones) e registrar no README que são os mesmos bytes de `assets/fonts/`, conferíveis por `cmp` |
| 3 | O cartão "Original" da lista de fontes | **Escrito na fonte da interface**, sem face nova. É o que ele é: "fonte do sistema, como hoje". Mostrá-lo em qualquer família seria mentir sobre o que `original` faz |

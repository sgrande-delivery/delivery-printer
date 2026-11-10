# Spec — Fontes de impressão embarcadas no app

**Status:** entregue
**Criada em:** 2026-11-04
**Escopo:** main
**Issue:** [#52](https://github.com/sgrande-delivery/delivery-printer/issues/52)

## Contexto

A spec [delivery-api#1410](https://github.com/sgrande-delivery/delivery-api/issues/1410) deu ao gestor a escolha da fonte dos seis documentos de impressão — `original`, `plex`, `atkinson` ou `barlow`, numa chave `font_family` em `printer_settings`. Ela está **inteira shipped**: o `PrintFontEnum` emite a família e o peso nos dois layouts base e nas duas views de caixa, e o `delivery-admin` shipou a tela que grava a chave (spec 1026).

**A RN-03 de lá atribui a outra metade a este repo:** *"a API só nomeia a fonte; não embute nem serve o arquivo. A view emite `font-family: 'IBM Plex Sans Condensed', sans-serif` e quem resolve é o app Electron, que embarca os woff2."* As alternativas foram descartadas com motivo: woff2 em base64 engordaria todo payload de impressão trafegando pelo socket, e servir por URL exigiria internet exatamente no momento em que a cozinha mais precisa imprimir. A consequência está declarada lá: **enquanto este app não embarcar as fontes, o gestor escolhe e nada muda na bobina, em silêncio.**

**E embarcar os arquivos não basta.** A API emite `font-family`, mas **nenhum `@font-face`** — conferido nos seis documentos. O `@font-face` que já existe neste repo (`src/renderer/app.css:93`, da Material Symbols) **não alcança a impressão**: o `printReceipt` grava o HTML da API em `os.tmpdir()/<id>.print.html` e o carrega numa `BrowserWindow` própria (`src/main/ipc-events/onRawPrint.ts:11`). É outro documento, e o CSS do renderer não vale nele. Sem declarar as faces ali, a fonte cai no fallback pelo mesmo silêncio da RN-03, por um segundo motivo que a spec da API não prevê.

**O que foi medido antes de escrever esta spec** (Electron 43, binário deste repo, 2026-11-04):

- `@font-face` com `src: url('file://…')` **carrega e aplica** num HTML temporário em `os.tmpdir()`. Não há impedimento de CORS `file://` → `file://` para fonte, ao contrário do que se supõe por padrão. O controle negativo — caminho inexistente — dá `status: "error"` e largura idêntica ao fallback, então a medição sabe reconhecer falha
- Funciona também **de dentro do `app.asar`**, o que dispensa `asarUnpack`
- `printToPDF` **com** e **sem** esperar `document.fonts.ready` embarca a fonte real nos dois casos: o print não corre com o carregamento, porque o `loadFile` só resolve depois de a fonte usada ter sido buscada
- As seis faces cobrem **todo** o texto de um comprovante brasileiro (`AÇÃO ação ÁÀÃÂÉÊÍÓÕÔÚÜÇ 0123456789 R$ ºª °`), sem nenhum glifo faltando — medido lendo o `cmap` de cada woff2. O que elas **não** têm é `latin-ext`: letra fora do Latin-1 cai no fallback glifo a glifo, e isso é limitação herdada da origem, não desta frente

## Objetivo

A fonte que o gestor escolhe na tela do painel sai na bobina do restaurante, nos seis documentos e nos três modelos, sem rede no momento de imprimir e sem este app precisar saber qual foi a escolha.

## Requisitos funcionais

- **RF-01** — As seis faces das três famílias acompanham o instalador e são legíveis em runtime, no app empacotado e em desenvolvimento.
- **RF-02** — Todo HTML que este app manda para a impressora declara as seis faces antes de ser carregado.
- **RF-03** — Com `font_family` em `plex`, `atkinson` ou `barlow`, o documento sai na fonte escolhida; com `original`, sai igual ao de hoje.
- **RF-04** — Arquivo de fonte ausente no disco deixa rastro no log, em vez de virar fallback silencioso.

## Regras de negócio

- **RN-01** — **A API nomeia a fonte; este app só declara as faces.** Este repo **não** lê `font_family` e não escolhe família em lugar nenhum. *Por quê:* é o que mantém o contrato deste app agnóstico da escolha do gestor e da versão do pedido — registrando as três famílias, quem decide é o HTML que chegou. Ler a chave aqui criaria uma segunda fonte de verdade para uma decisão que já tem dono, e seria preciso mantê-la em sincronia com um enum de outro repo.
- **RN-02** — **A injeção é aditiva: declara face, nunca escolhe família.** *Por quê:* é o que faz a RF-03 valer nos dois sentidos. O `original` nomeia `sans-serif` nos quatro documentos de pedido e mesa e `'Courier New'` nos dois de caixa; se este app também escolhesse família, o `original` deixaria de ser idêntico ao de hoje — exatamente o que a RN-01 da spec 1410 existe para impedir.
- **RN-03** — **O `@font-face` do renderer não vale na impressão.** A impressão é um documento `file://` em `os.tmpdir()` carregado numa `BrowserWindow` própria; CSS do bundle do renderer não o alcança. *Por quê:* é a armadilha central desta feature. Quem for "simplificar" acrescentando a face ao `src/renderer/app.css` vai ver o teste passar, a tela ficar certa e a bobina continuar no fallback.
- **RN-04** — **A fonte vem do disco, sempre. Nenhum `<link>` para `fonts.googleapis.com` atravessa para o app.** *Por quê:* é a mesma razão da fonte de ícones (`src/renderer/fonts/README.md`) — o PDV pode estar sem rede justamente quando precisa imprimir, e a folha de impressão não tem segunda chance.
- **RN-05** — **Nada é inserido antes do `<!DOCTYPE html>`.** *Por quê:* conteúdo antes do doctype joga o Chromium em quirks mode, e quirks mode muda a métrica do documento inteiro — margem, colapso de altura, largura. Numa bobina de 80 mm isso é o comprovante saindo com outro recorte, sem erro nenhum para explicar.
- **RN-06** — **A URL do arquivo é construída com `pathToFileURL()`, nunca por concatenação de string.** *Por quê:* o instalador deixa o operador escolher o diretório (`allowToChangeInstallationDirectory: true`), então o caminho pode ter espaço e acento. No Windows a concatenação crua ainda produz barra invertida e letra de unidade, que não é URL válida. Nos dois casos a face some em silêncio.
- **RN-07** — **Só os pesos que alguma view alcança são embarcados.** São seis: Plex 500/700, Atkinson 400/700, Barlow 500/700. *Por quê:* o peso do corpo vem do `PrintFontEnum::weight()` (500 em Plex e Barlow, 400 em Atkinson, que não tem 500) e o único outro peso que as views pedem é `700`, pelo `.bold` do `styles.css:66` e pelas classes dos modelos novos em `resources/views/print/layout.blade.php:25-70`. Peso que nenhuma view nomeia é só tamanho de instalador em máquina de cliente; e a Atkinson não tem 500 — um pedido de 500 casaria com o 400 real, que é o peso que o enum da API já emite para ela.
- **RN-08** — **Face que não carrega tem de deixar rastro.** *Por quê:* este é o modo de falha que as specs [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) e [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) existiram para combater. Um woff2 que não foi empacotado produz um comprovante perfeitamente legível na fonte errada — ninguém abre chamado, e a feature simplesmente não existe no parque. O `status: "error"` da medição mostra que a falha é detectável; o que falta é alguém olhar.

## Fora do escopo

- **IBM Plex Mono e os pesos 400 de Plex e Barlow.** O `delivery-admin` auto-hospeda dez arquivos porque o navegador dele também renderiza a pré-visualização; os seis documentos da API nunca nomeiam mono, e nada neles volta o peso para 400 (RN-07).
- **A página de teste local passar a sair na fonte escolhida.** O `buildTestPrintPage` é gerado aqui e não conhece a escolha da loja; as faces ficam disponíveis para ela de graça, mas usá-las é decisão de produto com task própria.
- **Renderizar layout de impressão neste repo.** Continua valendo o que o `CLAUDE.md` diz: o HTML vem da `delivery-api`.
- **A divergência de mono entre a pré-visualização do admin e o documento da API.** Conferido que a API não nomeia mono em nenhum dos seis documentos; se o preview do admin mostra valores em mono, ele mostra algo que a bobina não imprime. É issue do `delivery-admin`, não desta frente.
- **Tela, configuração ou chave nova neste app** (RN-01).

## Critérios de aceitação

- [ ] O instalador empacotado contém as seis faces em `resources/assets/fonts/`, e o app as encontra pelo `getAssetPath`
- [ ] O HTML gravado em `os.tmpdir()` contém as seis declarações `@font-face`, e o `<!DOCTYPE html>` continua sendo a primeira coisa do arquivo (RN-05)
- [ ] Comprovante da `delivery-api` com `font_family: plex` sai em IBM Plex Sans Condensed; com `atkinson` e `barlow`, nas respectivas
- [ ] Com `font_family: original`, o documento sai como sai hoje — `sans-serif` em pedido/mesa e Courier no caixa (RN-02)
- [ ] Texto com acento, `ç` e `R$` sai com glifo em todas as seis faces
- [ ] Com a máquina sem rede, a fonte continua aplicando (RN-04)
- [ ] Removido um dos woff2 do diretório, o log registra o arquivo ausente e a impressão **continua saindo** no fallback (RF-04, RN-08)

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | De onde vêm os binários | **Copiar os seis do `delivery-admin` (`public/fonts/print/`), não baixar de novo.** São os bytes já vetados em folha de teste térmica a 203 dpi na task [delivery-admin#1027](https://github.com/sgrande-delivery/delivery-admin/issues/1027), e a cobertura de pt-BR deles foi medida nesta spec. Baixar de novo troca um arquivo conferido por um não conferido, e o Google atualiza glifo sem avisar |
| 2 | Esperar `document.fonts.ready` antes do `print` | **Não esperar.** Medido nos dois modos: o `printToPDF` embarca a fonte real com e sem a espera, porque o `loadFile` resolve depois de a fonte ter sido buscada e o `font-display: block` não pinta no fallback. O `delivery-admin` precisou da espera porque lá é `window.print()` no navegador, caminho diferente. Se algum dia aparecer comprovante em fallback no parque, a espera é a primeira coisa a tentar — está registrada no plan por isso |

**As duas foram resolvidas no default, durante a execução (2026-11-04):** os binários vieram copiados do `delivery-admin` e conferidos por `cmp` como idênticos à origem, e a espera por `document.fonts.ready` **não** entrou — medido com `printToPDF` que a fonte real é embarcada com e sem ela. As duas decisões estão detalhadas em "Decisões arquiteturais" do `plan.md`.

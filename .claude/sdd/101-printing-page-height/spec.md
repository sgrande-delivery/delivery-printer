# Spec — A altura da página forçada: comprovante maior que 29,7 cm

**Status:** rascunho
**Criada em:** 2026-11-16
**Processo:** main (geometria e preferências) + renderer (o campo na tela Impressoras)
**Issue:** [#101](https://github.com/sgrande-delivery/delivery-printer/issues/101)

## Contexto

Relato do dev (2026-11-16): desde a 3.1.2, loja com bobina longa configurada no driver ("80 x 3276", 3 m) tem o comprovante **cortado a cada 29,7 cm**. Na 2.6.0 não acontecia.

A causa é uma constante. A geometria explícita da spec 95 força `pageSize: { width: W × 1000, height: ROLL_PAGE_HEIGHT_MICRONS }` (`src/main/printGeometry.ts`), e `ROLL_PAGE_HEIGHT_MICRONS` são 297 mm. O Chromium **pagina na altura do `pageSize`**: comprovante mais longo sai em duas páginas, e driver configurado para "cortar por página" corta no fim de cada uma.

A linha do tempo, medida nas tags:

| Versão | Altura da página | Corta em 29,7 cm? |
|---|---|---|
| 2.6.0 | do driver (`marginType: 'none'`, sem `pageSize`) | não |
| 3.0.0 – 3.0.2 | do driver (`'none'`) | não |
| 3.1.1 | do driver (`'printableArea'`, spec 89) | não |
| 3.1.2 – 3.2.0 | **297 mm forçados** (spec 95) | **sim** |

E só onde a geometria é explícita: largura útil salva nesta máquina (`useful-width`), papel inválido declarado pelo driver (`invalid-driver-paper`) e página de medição (`measure`). Sem largura útil e com papel válido o caminho é `printable-area`, sem `pageSize`, e a altura volta a ser a do driver.

Não é efeito colateral imprevisto: a **decisão 5 da spec 95** registrou a troca — *"quem tem papel longo ('80 x 3276') passa a paginar… Medir a altura do conteúdo e passá-la como `pageSize` resolveria, mas exige diagramar a janela oculta na largura da página para a medida valer — fica para spec própria se a verificação de campo mostrar o corte"*. A verificação de campo mostrou, e esta é a spec própria.

## Objetivo

Comprovante longo sai inteiro na loja de bobina longa, sem perder a largura útil que conserta o corte à direita — hoje a loja escolhe entre um corte e o outro.

## Requisitos funcionais

- **RF-01** — A altura da página forçada vem, em ordem: da altura salva para a impressora de destino; senão do papel que o driver declara, quando válido e maior que 297 mm; senão 297 mm.
- **RF-02** — A altura é salva por dispositivo do Windows, nesta máquina, no mesmo `printer-preferences.json` da largura útil, e vale para todo cadastro que aponta para aquele dispositivo.
- **RF-03** — A tela Impressoras oferece o campo ao lado da largura útil, **só quando a largura está ajustada**, com o texto dizendo o que o número faz.
- **RF-04** — O `@page { size }` injetado no HTML declara a **mesma** altura do `pageSize`.
- **RF-05** — A página de medição continua em 297 mm, qualquer que seja a altura salva.
- **RF-06** — O `print-geometry` do log registra a altura efetiva e de onde ela veio.

## Regras de negócio

- **RN-01** — **A altura só tem efeito onde a geometria é explícita.** No caminho `printable-area` não há `pageSize`, e a altura é do driver: por isso a tela só oferece o campo com a largura ajustada, e por isso ele não é "altura do papel", é a altura da página que o app força.
- **RN-02** — **A página de medição fica em 297 mm** (RF-05). Ela é uma escala de poucos centímetros; uma página de 3 m faria o driver avançar a bobina inteira para medir a régua, e o operador mediria no papel desperdiçado.
- **RN-03** — **Altura inválida derruba o campo, não a entrada.** O arquivo é editado à mão no PDV (RN-13 da spec 95); derrubar a entrada por causa da altura deixaria a impressora automática e devolveria o corte à direita que a largura útil conserta. A largura continua sendo o que faz a entrada existir.
- **RN-04** — **A faixa é 297 a 3000 mm, e valor fora dela é recusado, não ajustado.** O piso é o papel padrão de hoje — abaixo dele a mudança só criaria corte novo. O teto cobre a bobina do relato com folga. Ajustar em silêncio é comprovante cortado em silêncio, que é a mesma razão da faixa da largura útil.
- **RN-05** — **O degrau do driver é melhor esforço.** O Chromium do Windows pode não trazer o papel no mapa de opções (RN-07 da spec 95): quando não trouxer, o degrau 2 não dispara e o caminho é salvar a altura na tela. É por isso que o campo existe, e não só a herança automática.
- **RN-06** — **`pageSize` custom depende de o driver aceitar papel personalizado.** Recusando, o Chromium cai no papel padrão do driver — a largura continua garantida pelo `max-width` injetado (RN-05 da spec 95), e a altura volta a ser a do driver, que é o comportamento da 2.6.0. Nenhum caminho fica pior que hoje.

## Fora do escopo

- **Medir a altura do conteúdo** e passá-la como `pageSize`: resolveria sem configuração, mas exige diagramar a janela oculta na largura da página antes de medir. Spec própria.
- Mudar o papel do driver pelo app, ou qualquer escrita em configuração do Windows.
- A largura útil, a página de medição e o `printableArea` — a spec 95 fica como está.

## Critérios de aceitação

- [ ] Com altura salva, o `pageSize` e o `@page` injetado declaram a mesma altura
- [ ] Sem altura salva e com driver declarando "80 x 3276", a altura sai 3276 mm sem ninguém configurar
- [ ] Sem altura salva e com driver declarando "80 x 297", nada muda em relação à 3.2.0
- [ ] Página de medição continua em 297 mm com altura salva de 3000
- [ ] Altura fora da faixa é recusada na tela e no handler, e não escreve
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Teto do `pageSize` que o Chromium aceita | **Medir no PDV antes de promover a release.** Não há limite máximo documentado no código (só o mínimo de 353 µm), e 3.000.000 µm não foi exercitado. Se o Chromium recusar, o log dirá, e a saída é o degrau 3 — o comportamento de hoje |

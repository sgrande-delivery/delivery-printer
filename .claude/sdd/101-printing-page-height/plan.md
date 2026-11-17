# Plan — A altura da página forçada

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#101](https://github.com/sgrande-delivery/delivery-printer/issues/101)
**Branch de trabalho:** `feat/101-printing-page-height`, cortada de `origin/master` em 2026-11-16

## Abordagem técnica

Um ponto decide a geometria hoje (`resolvePrintGeometry`, `src/main/printGeometry.ts:76`), e continua sendo um só: o que muda é que a altura deixa de ser a constante `ROLL_PAGE_HEIGHT_MICRONS` e passa a ser resolvida em três degraus, com a origem registrada para o log.

```
preferência salva (printer-preferences.json)   →  'preference'
senão papel do driver válido e > 297 mm        →  'driver'
senão 297 mm                                   →  'default'
```

O degrau 2 é grátis: `driverPaperMm(target?.options)` já lê `{ widthMm, heightMm }` das chaves `media`/`PageSize`, e hoje a altura lida é usada só para decidir se o papel é inválido. É ele que conserta a bobina de 3 m **sem configuração**, onde o Windows expõe o papel.

A preferência mora onde a largura útil já mora, pela mesma razão da RN-01 da spec 95: é dado desta máquina, lido no caminho da impressão, e o arquivo é editável à mão no PDV. A entrada continua existindo por causa da largura; a altura é campo opcional dela (RN-03).

| Arquivo | O que muda |
|---|---|
| `src/shared/printerGeometry.ts` | `pageHeightMm?` em `PrinterPreference`, `isPageHeightMm`, a faixa e o default |
| `src/main/printGeometry.ts` | `resolvePageHeightMm` e os três degraus; `rollPage`/`usefulWidthCss` recebem a altura |
| `src/main/printerPreferences.ts` | carrega o campo novo; `writePrinterPageHeight` sobre o mesmo read-modify-write |
| `src/main/ipc-events/onRawPrint.ts` | passa a preferência e loga `pageHeightMm` + `pageHeightSource` |
| `src/main/ipc-events/onSetPrinterPageHeight.ts` | handler novo, validando a faixa antes de escrever |
| `src/shared/ipcChannels.ts`, `src/main/preload.ts`, `src/main/main.ts`, `src/__tests__/setup.ts` | o canal nos quatro lugares que o gate de texto cobra |
| `src/renderer/hooks/usePrinterPreferences.ts` | `setPageHeight` |
| `src/renderer/components/printers/PageHeightField.tsx` | o campo, dentro da seção da largura útil |

## Decisões arquiteturais

- **Três degraus, e não só o campo:** a herança do driver conserta a loja do relato sem ninguém abrir a tela, e o campo cobre o Windows que não expõe o papel (RN-05). Um sem o outro deixa metade das lojas de fora.
- **A página de medição não herda** (RN-02): ela é escala curta, e 3 m de avanço para medir 8 cm de régua é papel jogado fora.
- **Campo só com a largura ajustada** (RN-01): onde a geometria não é explícita a altura não faz nada, e oferecer o controle ali seria mentir para o operador.
- **Faixa recusada, não ajustada** (RN-04): a mesma escolha que a largura útil já fez, pela mesma razão — número ajustado em silêncio é comprovante cortado em silêncio.
- **`pageHeightSource` no log** e não só o número: do PDV, é o que separa "o driver expôs a bobina" de "alguém salvou 3000" e de "caiu no default".

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | A altura sai da preferência e do driver | [#102](https://github.com/sgrande-delivery/delivery-printer/issues/102) | [`102-resolve-page-height.md`](./tasks/102-resolve-page-height.md) | — | executada |
| 02 | O campo na tela Impressoras | [#103](https://github.com/sgrande-delivery/delivery-printer/issues/103) | [`103-page-height-field.md`](./tasks/103-page-height-field.md) | 01 | executada |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02. A 01 já entrega o conserto da loja do relato onde o driver expõe o papel; a 02 cobre o Windows que não expõe.

## Dependências de outros repos

Nenhuma. A altura é decisão desta máquina, e o HTML que a `delivery-api` manda não muda — o `@page` dela continua sendo sobrescrito pelo `<style>` injetado, como desde a spec 95.

## Aprendizados que valem para as próximas tasks

- **O degrau do driver só dispara em papel que o `driverPaperMm` sabe ler**, e ele só confia na forma `<w>x<h>mm` (`oe_roll-80_80x3276mm`, `Custom.80x25mm`). Um `media: 'Roll Paper 80 x 3276'` — a grafia que vários drivers térmicos usam — devolve `null`, e a loja cai no padrão de 297 mm. Isto é o que torna o campo da #103 o caminho principal e não a exceção: a altura automática é um bônus, não a entrega.
- **Mudar a forma do retorno do `resolvePrintGeometry` quebra três testes de igualdade exata** (`toEqual` do objeto inteiro em `printGeometry.test.ts`, a linha de log em `onRawPrint.test.ts`). É de propósito, e é por isso que a linha de log tem asserção exata em vez de `objectContaining`: campo novo no log é decisão, não acidente.
- **Helper de teste com `props.x ?? default` engole `null`.** A primeira versão do `PageHeightField.test.tsx` passava 72 onde o teste pedia `usefulWidthMm: null`, e o único teste que cobre a RN-01 passava sem exercer nada. Default por destructuring (`{ usefulWidthMm = 72 }`) distingue ausente de `null`. Conferido por mutação: tirado o `adjusted &&` do `UsefulWidthSection`, o teste cai.
- **A altura vive dentro da entrada da largura, e isso tem duas consequências** que o teste fixa: apagar a largura leva a entrada inteira (altura incluída), e gravar altura num dispositivo sem largura é erro, não entrada nova — senão ficaria configuração salva que não configura nada.
- **`delete` em vez de desestruturar o campo a remover.** `const { pageHeightMm: _removed, ...rest }` gera aviso novo de `no-unused-vars`, e o baseline deste repo é exatamente um aviso (o `Login.tsx`) — aviso novo conta como regressão.

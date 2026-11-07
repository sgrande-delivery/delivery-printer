# 57 — O modelo das duas chaves de enum

**Issue:** [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57)
**Feature:** [Modelo de documento e fonte na tela de impressão](../spec.md) — issue #56
**Tipo:** feature
**Processo:** renderer
**Depende de:** —
**Status:** shipped

## Branch

`feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05. Todas as tasks da spec rodam nela, um commit por task.

## Objetivo

Dar à tela de impressão o eixo que ela não tem: **chave de enum**. Hoje o modelo de draft só sabe de número (`StepKey`/`CLOSED_SETS`) e do booleano `no_margin`. Depois desta task, `document_model` e `font_family` têm tabela de opções, resolução de ausente e participação no draft, no `diffChanges` e no `isDirty` — sem nenhuma UI ainda.

## Contexto

- Cobre as **RN-01**, **RN-02**, **RN-04** e **RN-05** da spec
- **O caminho de gravação já aceita chave que a tela não conhece.** O baseline é uma bag (`src/renderer/services/printerSettings.ts:11`) e o corpo do `PUT` é `{...loaded, ...changes}` (`:48-58`). Esta task **não** encosta nesse arquivo, com uma exceção de leitura: conferir que `KNOWN_KEYS` (`:13-21`) **não** ganhou as duas chaves novas (RN-04)
- **O que existe hoje no modelo** (`src/renderer/components/printer-settings/printerSettingsModel.ts`): `StepKey` (`:4`), `Draft` (`:7`), `CLOSED_SETS` (`:13`), `currentValue` (`:57`), `currentNoMargin` (`:61`), `diffChanges` (`:66`) e `isDirty` (`:84`). O `diffChanges` itera `Object.keys(CLOSED_SETS)` e trata `no_margin` à parte — o laço novo é o terceiro caso, no mesmo formato
- **A referência do outro lado** (medida em `delivery-admin`, branch `feat/admin-v2`): `src/constants/printDocumentModels.ts:10` e `src/constants/printFonts.ts:15` têm os nomes e as descrições em pt-BR; `src/helpers/printDocumentStyle.ts:17,26` resolve ausente e fora do enum. Os textos têm de ser **os mesmos** dos dois lados: operador que leu "usa menos papel" no painel vê a mesma frase aqui
- **O que a API garante, e o que não garante:** não há `FormRequest` no `PUT /printerSettings`, então o valor lido pode ser **qualquer string**; e não houve migration nem seeder, então na prática **toda** loja hoje tem as duas chaves ausentes

## Mudanças

### 1. `src/renderer/components/printer-settings/printDocuments.ts` (novo)

As duas tabelas de opções e a resolução. É a cópia do enum que a RN-05 aceita, e fica junto da tela — **não** em `src/constants/` (configuração de build) nem em `src/shared/` (o main não a usa, e não deve).

- `export type PrintDocumentModel = 'original' | 'completo' | 'simples'`
- `export type PrintFontKey = 'original' | 'plex' | 'atkinson' | 'barlow'`
- `DOCUMENT_MODEL_OPTIONS: readonly { value, name, description }[]` — nessa ordem, `original` primeiro: a ordem da tabela **é** a ordem dos cartões e a ordem que as setas percorrem (task #59)
- `FONT_OPTIONS: readonly { value, name, description, fontFamily?: string, fontWeight?: number }[]` — `fontFamily`/`fontWeight` ausentes em `original`, que é a fonte da interface (decisão 3 da spec). Os três valores: `'IBM Plex Sans Condensed'` / 500, `'Atkinson Hyperlegible'` / 400, `'Barlow Semi Condensed'` / 500 (decisão 1 da spec: o peso do corpo do comprovante)
- `resolveDocumentModel(settings: PrinterSettingsData): PrintDocumentModel` e `resolveFontFamily(settings): PrintFontKey` — leem a chave crua e devolvem `original` para ausente, para tipo errado e para string fora do enum (RN-01)

Um comentário no topo tem de dizer **duas** coisas que não se leem do código: que esta é a segunda cópia de um enum cujo dono é a `delivery-api` (`PrintFontEnum`, `PrintDocumentModel`), e que valor novo que aparecer lá e não aqui **desaparece do seletor em silêncio** — a tela não mostra opção que não conhece, e o valor gravado pela outra ponta continua funcionando.

A grafia em `fontFamily` é a cola com o `@font-face` do `app.css` (task #58, RN-06). O comentário diz que **não** é a mesma lista do `src/main/printFonts.ts:14`, que serve ao documento de impressão e é contrato com a API.

### 2. `src/renderer/types/restaurant.ts` (alterado)

`PrinterSetting` (`:8-17`) ganha as duas chaves, **como `string` opcional** e não como a união:

```ts
  // Nascem ausentes: a delivery-api não faz migration nem seeder. O valor pode ser qualquer string
  // (o PUT não tem FormRequest); quem estreita é resolveDocumentModel/resolveFontFamily.
  document_model?: string;
  font_family?: string;
```

Declarar a união aqui seria uma **afirmação falsa** sobre a resposta da API (`CLAUDE.md`, "a resposta não é validada contra o tipo declarado"): o campo pode vir `"foo"`, e um tipo que diz o contrário faz o `resolve` parecer código morto.

### 3. `printerSettingsModel.ts` (alterado)

- `export type EnumKey = 'document_model' | 'font_family'`
- O `Draft` (`:7`) passa a carregar as duas chaves **estreitas**:
  ```ts
  export type Draft = Partial<Pick<PrinterSetting, StepKey | 'no_margin'>> & {
    document_model?: PrintDocumentModel;
    font_family?: PrintFontKey;
  };
  ```
  O draft só nasce de um clique numa opção, então ali o valor é sempre válido. O baseline é largo e o draft é estreito, e essa assimetria é proposital — vale um comentário de uma linha.
- `currentEnum(settings, draft, key)` — devolve `draft[key] ?? resolve<key>(settings)`, sempre um valor válido
- `diffChanges` (`:66`) ganha o terceiro laço, comparando pelo valor **resolvido** (RN-02):
  ```ts
  for (const key of ENUM_KEYS) {
    const next = draft[key];

    if (next !== undefined && next !== currentResolved(settings, key)) {
      changes[key] = next;
    }
  }
  ```
  Comparar com o **bruto** faria "Original" numa loja sem a linha virar mudança, e abrir a tela e passar o olho criaria linha nova no banco da loja. O comentário tem de registrar a consequência da escolha: linha que guarda string inválida **não** é consertada pela tela, porque para todo leitor ela já significa `original`.
- `isDirty` (`:84`) não muda: ele conta as chaves de `diffChanges`

## Testes

### `src/renderer/components/printer-settings/__tests__/printDocuments.test.ts` (novo)

- Toda opção do enum tem entrada na tabela, e a tabela não tem entrada a mais — nas duas tabelas
- `original` é a **primeira** de cada tabela (a ordem é a dos cartões e a das setas)
- Nome e descrição são os textos exatos da spec (RF-01 e RF-03), um teste por tabela
- `resolveDocumentModel`/`resolveFontFamily` devolvem `original` para: chave ausente, `null`, número, objeto, `''` e `'foo'`; e devolvem o valor para cada membro do enum
- As três opções de fonte com face têm `fontFamily` e `fontWeight`, e `original` **não** tem — é o que impede alguém "completar a tabela" com uma família para o `original` e mentir sobre o que ele faz

### `printerSettingsModel.test.ts` (alterado)

- `currentEnum` devolve o draft quando existe, senão o resolvido
- **RN-02, o caso central:** chave **ausente** + draft `'original'` → `diffChanges` vazio e `isDirty` falso; chave ausente + draft `'completo'` → `{ document_model: 'completo' }`
- Chave com `'foo'` + draft `'original'` → **vazio** (é o que está em vigor), e + draft `'simples'` → `{ document_model: 'simples' }`
- As duas chaves juntas num draft saem juntas no `diffChanges`, e misturadas com uma chave numérica e com `no_margin` saem as três
- Chave de enum no draft **não** afeta `previewMetrics` (RN-09: a pré-visualização não segue modelo nem fonte)

**Verificar por mutação:** trocar a comparação do laço novo de resolvido para bruto (`settings[key]`) tem de derrubar o teste da RN-02; e fazer o `resolve` devolver o valor cru quando ele não está no enum tem de derrubar os casos de `'foo'`. Teste que passa com essas duas mutações vivas não protege nada.

### `src/renderer/services/__tests__/printerSettings.test.ts` (alterado)

Um teste de **RN-04**: uma bag com **só** `document_model` e `font_family` **não** passa por `hasKnownSettings`. É o que impede alguém acrescentar as duas chaves à lista "para ficar completa" — a lista é das sete linhas semeadas no cadastro, e salvar sobre uma bag que tem só as novas apagaria as reais.

## Critérios de aceitação

- [ ] `resolveDocumentModel`/`resolveFontFamily` devolvem `original` para ausente, tipo errado e string fora do enum
- [ ] Draft com `'original'` sobre chave ausente **não** vira mudança, e `isDirty` continua falso
- [ ] `diffChanges` entrega as duas chaves novas junto das numéricas e do booleano, sem tocar nas outras linhas
- [ ] `hasKnownSettings` continua recusando bag que tenha só as duas chaves novas
- [ ] Nenhuma UI mudou nesta task: a tela renderiza igual, e os testes de tela existentes passam sem edição
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

Executada em 2026-11-05. Três arquivos de implementação e três de teste, nenhuma linha de UI — `PrinterSettings.test.tsx` passou sem edição, que é a prova de que a tela não mudou.

### O que ficou de pé

- **`printDocuments.ts`** (novo): os dois tipos, as duas tabelas e `resolveDocumentModel`/`resolveFontKey`, sobre um `resolveOption` privado que busca por `options.find()`. **Buscar na lista, e não por `Object.hasOwn` num `Record` como o painel faz, resolve duas coisas de uma vez:** a tabela *tem* de ser array ordenado (a ordem é a dos cartões e a que as setas percorrem, task #59), e chave herdada não passa — `'toString'` está na lista de inválidos do teste e resolve para `original`.
- **`PrinterSetting`**: `document_model?: string` e `font_family?: string`. Medido pelo review: declarando a união ali, os testes do caso real (`document_model: 'foo'`) **deixam de compilar** (TS2769/TS2345). Ou seja, a união não seria só uma afirmação falsa sobre a API — ela proibiria escrever o teste do que a API de fato devolve.
- **`printerSettingsModel.ts`**: `ENUM_KEYS` **é a fonte** do `EnumKey` (`as const` + `(typeof ENUM_KEYS)[number]`), `Draft` estreito nas duas chaves, `currentEnum` com overload por chave e o terceiro laço do `diffChanges` comparando pelo valor resolvido.
- **`printerSettings.ts`**: intocado, `KNOWN_KEYS` com as sete chaves semeadas (RN-04).

### Nomes que divergem da task

- **`resolveFontKey`**, e não `resolveFontFamily` como a task escreveu. A função devolve a **chave** (`'plex'`), no mesmo módulo em que `FontOption.fontFamily` é a **família CSS** (`'IBM Plex Sans Condensed'`) — dois conceitos com um nome só, num arquivo que as tasks #59 e #60 vão importar. É também o nome que o painel usa (`resolvePrintFontKey`). Renomeado antes de existir importador.
- **`ENUM_KEYS` como fonte do tipo**, e não o tipo escrito à mão com a lista ao lado, como a task sugeria. Fechado porque a divergência entre os dois é silenciosa do pior jeito: chave que está no tipo e falta na lista mostra o controle na tela, nunca chega ao `diffChanges`, e o "Salvar" limpa a barra **sem gravar nada**.

### Testes

39 testes novos (30 em `printDocuments.test.ts`, 8 no `printerSettingsModel.test.ts`, 1 no `printerSettings.test.ts`), suíte em **67 arquivos / 698 testes** (baseline da branch: 66 / 659).

Sete mutações medidas, todas mortas:

| mutação | cai |
| --- | --- |
| laço de enum comparando o **bruto** (`settings[key]`) | 2 testes — é a RN-02 |
| `resolveOption` devolvendo a string crua fora do enum | 8 testes |
| `KNOWN_KEYS` ganhando as duas chaves novas | 1 teste — é a RN-04 |
| laço de enum sem o guard `next !== undefined` | 3 testes, **um deles direto** |
| `resolveEnum` sempre com o resolvedor de fonte | 2 testes, **um deles no `diffChanges`** |

As duas últimas linhas eram morte só indireta no primeiro corte, e o review as apontou. Fechadas com duas asserções:

- **`diffChanges(stored, { font_size: 18 })` com `toStrictEqual`**, para chave de enum não tocada ficar **fora** do payload em vez de entrar como `undefined`. O cenário é concreto sob a RN-03: `changes.document_model = undefined` sobrevive ao spread, o `JSON.stringify` descarta a chave, e o `PUT` — que apaga e recria toda linha — **apaga a linha** de uma loja que tinha `'completo'`. `toEqual` não serviria: ele ignora propriedade com valor `undefined`.
- **`document_model` no teste de volta ao valor armazenado**, que só exercitava `font_family` e por isso deixava o despacho por chave do `resolveEnum` passar vivo.

### O que o review julgou e aprovou sem bloqueio

Os overloads de `currentEnum`, o `ENUM_KEYS`/`resolveEnum` privados, o `as PrinterSettingsData` nos testes de valor inválido e os textos pt-BR — comparados programaticamente com os 14 pares nome/descrição do `delivery-admin` (`feat/admin-v2`), diferença vazia nos dois sentidos.

`npm run typecheck` 0, `npm run lint` 0 erros e 1 aviso (o `Login.tsx` da baseline), `npm test` verde.

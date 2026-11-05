# 60 — Modelo e Fonte no cartão "Layout do comprovante"

**Issue:** [#60](https://github.com/sgrande-delivery/delivery-printer/issues/60)
**Feature:** [Modelo de documento e fonte na tela de impressão](../spec.md) — issue #56
**Tipo:** feature
**Processo:** renderer
**Depende de:** [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57), [#58](https://github.com/sgrande-delivery/delivery-printer/issues/58), [#59](https://github.com/sgrande-delivery/delivery-printer/issues/59)
**Status:** pendente

## Branch

`feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05.

## Objetivo

Ligar tudo: os dois grupos de cartões no cartão `Layout do comprovante`, o salvamento pelo caminho que já existe e os testes de tela. É a task que faz a feature aparecer para quem opera.

## Contexto

- Cobre as **RF-01**, **RF-02**, **RF-03**, **RF-04**, **RF-06** e **RF-08** e as **RN-03**, **RN-09** e **RN-10** da spec
- **O cartão alvo** é `Layout do comprovante` (`src/renderer/components/printer-settings/PrinterSettingsForm.tsx:157-171`), que hoje tem "Tamanho da fonte", "Margem" e "Sem margem". Os dois grupos entram **acima** de "Tamanho da fonte"; o tamanho **não muda de cartão** (spec, "Fora do escopo")
- **O salvamento não muda.** O `handleSave` (`:88-139`) já lê a bag no instante de salvar, manda `{...fresh, ...diffChanges(fresh, draft)}` e trata 403, 422, baseline suspeito e rede. Com a task #57 feita, as duas chaves novas entram no `diffChanges` sozinhas — esta task **não** escreve payload, **não** monta corpo e **não** acrescenta requisição
- **A barra "Alterações não salvas"** (`:198-215`) aparece com `isDirty`, que também já cobre as duas chaves
- **A pré-visualização não reage** (RN-09): ela segue ilustração de geometria em monospace, e `previewMetrics` (`printerSettingsModel.ts:113`) não lê chave de enum
- **O desenho congelado não tem estes controles** (`.claude/sdd/38-ui-redesign-shell-and-screens/design/printer-v2.dc.html:285-343`): a tabela "Fidelidade ao desenho" da spec 38 tem 15 linhas, e esta frente acrescenta a **16ª**

## Mudanças

### 1. `PrinterSettingsForm.tsx` (alterado)

- Um setter de draft para chave de enum, no formato do `handleStep` (`:50-52`):
  ```ts
  function handleEnum<K extends EnumKey>(key: K, value: NonNullable<Draft[K]>): void {
    setDraft(current => ({ ...current, [key]: value }));
  }
  ```
- Dentro da `<section>` do layout (`:157`), antes do `renderStep('font_size', …)`, dois blocos de largura cheia, cada um com um rótulo (`<span>` com `id`, como a gaveta faz em `PrinterDrawer.tsx:254-256`) e um `OptionCardGroup`:
  - **"Modelo de documento"**, com `DOCUMENT_MODEL_OPTIONS` e `currentEnum(settings, draft, 'document_model')`. Com `original` em vigor, passa como `children` a linha de apoio: *"A cozinha e os entregadores continuam vendo o mesmo documento de hoje."* (RF-02)
  - **"Fonte"**, com `FONT_OPTIONS` e `currentEnum(settings, draft, 'font_family')`, mapeando `fontFamily`/`fontWeight` para o `nameStyle` de cada cartão
- O título do cartão e as três linhas de baixo ficam como estão. Nada de `aria-labelledby` novo na `<section>`: ela já tem `layout-title`

### 2. `PrinterSettingsForm.module.css` (alterado)

Classes para os dois blocos: `.group` (padding `12px 16px`, o mesmo do `SettingsRow`, com o divisor `1px solid var(--line)` embaixo para seguir o ritmo do cartão), `.groupLabel` (o rótulo, peso `--font-weight-medium`) e `.support` (12 px, `var(--muted)`, a linha de apoio). Sem hex solto.

### 3. `.claude/sdd/38-ui-redesign-shell-and-screens/spec.md` (alterado)

Linha **16** na tabela "Fidelidade ao desenho" (`:33-49`), no formato das outras: o desenho dá ao cartão `Layout do comprovante` três linhas (tamanho da fonte, margem, sem margem); aqui ele passa a ter, acima delas, dois grupos de cartões de rádio — Modelo de documento e Fonte. **Por quê:** as duas chaves são posteriores ao desenho (`delivery-admin` spec 1026, `delivery-api` #1410), e a alternativa — cartão novo "Documentos", como o painel — exigiria mover "Tamanho da fonte", que o desenho já posicionou. Referenciar a spec #56.

## Testes

### `__tests__/PrinterSettings.test.tsx` (alterado)

O arquivo já tem toda a infraestrutura: `api` mockado (`:15`), store de auth com estado (`:23-42`) e o `loaded` de baseline (`:57-66`). Casos novos, num `describe('modelo e fonte')`:

- **Loja de hoje (as duas chaves ausentes):** os dois grupos abrem com "Original" marcado (`aria-checked`), e a linha de apoio do modelo aparece
- **Valor inválido** (`document_model: 'foo'`): abre em "Original" e a tela não quebra
- **Valor guardado** (`font_family: 'barlow'`): abre com "Barlow Semi Condensed" marcado
- **RN-02 na tela:** com as chaves ausentes, clicar em "Original" **não** faz a barra de alterações aparecer; clicar em "Completo" faz
- **RF-06, o teste que paga:** escolher "Completo" e "IBM Plex Sans Condensed", salvar, e o corpo do `PUT` tem `document_model: 'completo'`, `font_family: 'plex'` **e** `max_width`, `delivery_printer_version` e a `unknown_key` do baseline — é a RN-03 medida de ponta
- Escolher modelo e clicar em "Descartar" volta ao valor do servidor e **não** manda nada
- A linha de apoio **desaparece** ao escolher "Completo" e volta ao escolher "Original"
- **RN-09:** mudar modelo e fonte não muda nada no papel da pré-visualização — `font-family`, largura e `padding` do `preview-paper` (`:559`) seguem iguais
- `expectNoUndefinedClasses()` e asserção de presença nas chaves novas (`.group`, `.groupLabel`, `.support`)

**Verificar por mutação:** montar o payload a partir de campos em vez da bag tem de derrubar o teste da RN-03; e fazer a pré-visualização ler a fonte escolhida tem de derrubar o da RN-09.

## Critérios de aceitação

- [ ] Em `npm run dev`, com as duas chaves ausentes: a tela abre em "Original" nos dois grupos, e o corpo do `PUT` de uma mudança qualquer **não** leva as duas chaves
- [ ] Escolher modelo e fonte, salvar, recarregar a tela: as escolhas persistem, e `max_width` e `delivery_printer_version` continuam lá
- [ ] Teclado nos dois grupos: Tab entra no selecionado, setas trocam e movem o foco, Enter e Espaço selecionam
- [ ] Os quatro nomes de fonte aparecem cada um na sua face, nos dois temas
- [ ] A pré-visualização continua sendo ilustração de geometria em monospace
- [ ] A linha 16 está na tabela de fidelidade da spec 38
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

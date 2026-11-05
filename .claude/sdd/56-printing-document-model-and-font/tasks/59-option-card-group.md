# 59 — O grupo de cartões de rádio

**Issue:** [#59](https://github.com/sgrande-delivery/delivery-printer/issues/59)
**Feature:** [Modelo de documento e fonte na tela de impressão](../spec.md) — issue #56
**Tipo:** feature
**Processo:** renderer
**Depende de:** [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57)
**Status:** pendente

## Branch

`feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05.

## Objetivo

O componente que desenha uma escolha exclusiva como cartões com nome e descrição, operável só por teclado. Usado duas vezes na tela de impressão (modelo e fonte), e por nenhuma outra — por isso ele **não** vai para `base/`.

## Contexto

- Cobre a **RF-05** da spec
- **Onde mora, e por quê:** `src/renderer/components/printer-settings/OptionCardGroup.tsx` + `.module.css`. Primitivo em `base/` só quando o padrão aparece em **duas telas** (`.claude/rules/renderer-ui.md`); aqui aparece duas vezes na mesma. Se uma segunda tela quiser, a promoção é task própria
- **Por que não `Chip`:** o `Chip` (`src/renderer/base/Chip.tsx`) já faz escolha exclusiva com `pressed` (a gaveta de impressoras usa, `PrinterDrawer.tsx:258-277`), mas é uma pílula de uma linha — não cabe a descrição, que é o que distingue "Completo" de "Simples" para quem nunca viu os dois
- **A referência de comportamento** é o painel (`delivery-admin/src/pages/printer-settings/documents/hooks/useRadioGroupNavigation.ts:15-33` e `PrintFontItem.tsx:60-68`): setas trocam a seleção **e** movem o foco, e só o item selecionado é tabulável. É o padrão WAI-ARIA de radiogroup, e é o mesmo que o operador já encontra no painel
- **Enter e Espaço saem de graça:** cada item é um `<button type="button">`, e o navegador já dispara o clique nos dois. Não escrever handler para isso
- **O `SettingsRow`** (`SettingsRow.tsx`) continua sendo o padrão rótulo-à-esquerda/controle-à-direita das três linhas de baixo do cartão. O grupo de cartões **não** é um `SettingsRow`: ele ocupa a largura inteira

## Mudanças

### 1. `src/renderer/components/printer-settings/OptionCardGroup.tsx` (novo)

Função genérica (não `React.FC`, que atrapalha o genérico):

```ts
export interface OptionCard<T extends string> {
  value: T;
  name: string;
  description: string;
  // Só para a lista de fontes: o nome escrito na própria face (task #58).
  nameStyle?: CSSProperties;
}

interface OptionCardGroupProps<T extends string> {
  label: string;      // o rótulo visível do grupo, que também nomeia o radiogroup
  labelId: string;    // id do rótulo, para o aria-labelledby
  value: T;           // a opção em vigor (já resolvida pelo chamador)
  options: readonly OptionCard<T>[];
  onChange(value: T): void;
  // A linha de apoio sob os cartões, quando houver (RF-02).
  children?: ReactNode;
}
```

- O contêiner é `role="radiogroup"` com `aria-labelledby={labelId}` e um `onKeyDown` que trata `ArrowRight`/`ArrowDown` (próxima) e `ArrowLeft`/`ArrowUp` (anterior), com volta circular, `preventDefault` e foco no item que passou a ser selecionado
- Cada item é `<button type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1}>`, com nome e descrição dentro
- O `nameStyle` é aplicado por `style` no elemento do nome. **É o caso legítimo de `style={{}}`** (`.claude/rules/renderer-ui.md`: valor calculado em runtime, com a tabela dentro do módulo que a define — aqui, `printDocuments.ts`). O resto do visual é classe
- O foco é movido por `ref` no contêiner e `querySelectorAll('[role="radio"]')`, como o painel faz — o índice da seleção é o índice do item na lista, então a ordem da tabela de opções é a ordem da navegação (task #57)

### 2. `OptionCardGroup.module.css` (novo)

Tokens, zero hex: cartão não selecionado com `1px solid var(--line)` sobre `var(--surface)`; selecionado com `var(--accent)` na borda e `var(--accent-soft)` no fundo; nome em `var(--text)`, descrição em 12 px e `var(--muted)`; `:focus-visible` com `outline` em `var(--accent)` e `outline-offset: 2px`. Grade de `repeat(auto-fit, minmax(…, 1fr))` com `gap: 8px`, e o raio de 10 px dos cartões da tela (`PrinterSettingsForm.module.css`).

Se faltar cor, ela entra como **token nos dois temas** no `app.css` e o contraste é medido contra `--bg`, `--surface` e `--surface-2` antes de aceitar o valor.

## Testes

### `src/renderer/components/printer-settings/__tests__/OptionCardGroup.test.tsx` (novo)

Com uma lista de três opções fixas (não a real: o componente é genérico e não conhece documento nem fonte):

- Renderiza um `radio` por opção, com o nome e a descrição acessíveis, dentro de um `radiogroup` nomeado pelo rótulo
- Só a opção em vigor tem `aria-checked="true"`, e só ela tem `tabIndex` 0 — as outras, `-1`
- Clique numa opção chama o `onChange` com o valor **dela**, e clique na já selecionada também chama (não é toggle: a escolha é exclusiva e não há "nenhuma")
- `ArrowRight` e `ArrowDown` pedem a próxima; `ArrowLeft` e `ArrowUp`, a anterior; na última, a próxima é a **primeira** (volta circular)
- A seta **move o foco** para o item que passou a ser selecionado — asserção em `document.activeElement`
- Tecla que não é seta não chama `onChange` e não é `preventDefault`
- `nameStyle` chega ao elemento do nome (`font-family` e `font-weight` inline)
- `children` aparece abaixo dos cartões quando passado, e não aparece quando não
- `expectNoUndefinedClasses()`, e asserção de presença por chave de `styles` no contêiner, no cartão e no cartão selecionado — a chave do estado selecionado é a que some calada num rename

**Verificar por mutação:** tirar o `tabIndex` condicional tem de derrubar o teste de tabulação; tirar o `focus()` do `moveSelection` tem de derrubar o do `activeElement`; e trocar o módulo de volta circular por `Math.min/max` tem de derrubar o da última opção.

## Critérios de aceitação

- [ ] O grupo é operável só por teclado: Tab entra no selecionado, setas trocam e movem o foco, Enter e Espaço selecionam
- [ ] A ordem dos cartões e a da navegação são a ordem da lista recebida
- [ ] Zero hex solto no módulo CSS, e o estado selecionado é visível nos dois temas
- [ ] Nenhuma tela mudou nesta task
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

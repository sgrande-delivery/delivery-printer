# 59 — O grupo de cartões de rádio

**Issue:** [#59](https://github.com/sgrande-delivery/delivery-printer/issues/59)
**Feature:** [Modelo de documento e fonte na tela de impressão](../spec.md) — issue #56
**Tipo:** feature
**Processo:** renderer
**Depende de:** [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57)
**Status:** executada

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

## Implementação

Executada em 2026-11-05. `OptionCardGroup.tsx` + `.module.css` novos e 18 testes. Nenhuma tela mudou — a ligação é a task #60.

### A API que a task #60 consome

```ts
export interface OptionCard<T extends string> {
  value: T;
  name: string;
  description: string;
  nameStyle?: CSSProperties;
}
// label, labelId, value, options, onChange(value: NoInfer<T>), children?
function OptionCardGroup<T extends string>(props): React.ReactElement  // export default
```

O **rótulo visível é do componente**, não do chamador: ele renderiza o `<span id={labelId}>` e o `aria-labelledby` aponta para ele, então texto e nome acessível ficam no mesmo lugar.

**`NoInfer<T>` no `onChange` não é enfeite.** Sem ele o callback entra como sítio de inferência, `T` colapsa para `string` e passar um setter de `useState<PrintDocumentModel>` **não compila** (`TS2322`, medido). Com ele, as formas de chamada que a #60 vai usar compilam sem anotação de genérico. O teste do foco usa um `useState` real **sem** anotar o genérico, de propósito: tirando o `NoInfer`, o `npm run typecheck` falha — é ele a rede, porque o Vitest não typecheca.

### O que entrou depois do review

- **Bloqueante de contraste, medido:** a descrição em `--muted` sobre o cartão selecionado (`--accent-soft`) dá **4,33:1** no tema claro e **4,34:1** no escuro, abaixo dos 4,5:1 de AA para 12 px — e essa linha é justamente a única coisa que distingue "Completo" de "Simples" para quem nunca viu os dois. `.selected .description` passa a usar `--text-2`: **6,30:1** e **7,54:1**. O `--accent-soft` é um **quarto fundo**, que o `--muted` do desenho nunca enfrentou (a regra manda medir contra `--bg`, `--surface` e `--surface-2`), e foi por esse mesmo critério que o `--muted` já tinha sido escurecido na spec 38.
- **O glifo de rádio**, que a task não tinha pedido: `radio_button_checked`/`radio_button_unchecked` pelo `Icon`, como os outros dois cartões de rádio do app (`PrinterDrawer.tsx:228`). Duas razões: seleção sinalizada **só** por cor e borda é fraca para quem não distingue o `--accent-soft`, e um terceiro idioma visual para escolha exclusiva no mesmo app é dívida de desenho. Os dois nomes já estão na união `IconName` e no recorte da fonte — nada a regerar.
- **Nome acessível explícito.** Com nome e descrição dentro do `<button>`, o nome acessível saía colado: `"OriginalIgual ao que imprime hoje"` (é o mesmo mecanismo que a regra registra em `'E-mailperson'`). Agora o `aria-label` é o nome da opção e a descrição vai por `aria-describedby`. O `Icon` já é `aria-hidden`, então o glifo não entra no nome — mas **entra no `textContent`**, e é por isso que o teste do glifo casa por texto.
- **Ordem dos `children` assertada:** mover a linha de apoio para antes da grade sobrevivia à suíte, e a RF-02 diz "abaixo dos cartões".
- O ternário encadeado do `stepFor` saiu (era o único do repo) e o guard `Math.max(current, 0)` foi apagado: a prop declara o valor já resolvido, os resolvedores garantem isso, e o módulo sozinho já devolve índice válido — era galho morto sem teste.

### Testes

18 casos; suíte em **69 arquivos / 723 testes**. Mutações medidas, todas mortas:

| mutação | cai |
| --- | --- |
| `tabIndex` sempre 0 | 1 teste |
| sem o `focus()` | 1 teste |
| volta circular por `Math.min/max` | 5 testes |
| sem `preventDefault` | 1 teste |
| `aria-checked` só no selecionado | 1 teste |
| `nameStyle` aplicado ao cartão | 1 teste |
| sem `aria-labelledby` | 1 teste |
| **sem `NoInfer`** | **o `npm run typecheck`** |
| sem `aria-label` | 1 teste |
| `children` antes da grade | 1 teste |
| glifo sempre marcado | 2 testes |
| rename de **qualquer** uma das 7 chaves do módulo CSS | 1 teste cada |

### Não verificado

O componente **renderizado**: nada de aparência nos dois temas nem teclado em Electron real (não há display na sessão, e a tela que o usa só existe na task #60). O contraste foi **calculado**, não visto — a função de contraste usada reproduz exatamente os quatro números que o `app.css` e a regra documentam.

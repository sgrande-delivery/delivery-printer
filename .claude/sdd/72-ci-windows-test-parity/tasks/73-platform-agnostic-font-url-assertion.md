# 73 — Asserção da RN-06 sem depender da plataforma

**Issue:** [#73](https://github.com/sgrande-delivery/delivery-printer/issues/73)
**Feature:** [Paridade de plataforma entre o gate de PR e a esteira de publicação](../spec.md) — issue #72
**Tipo:** bug
**Processo:** main (teste)
**Depende de:** (nenhuma)
**Status:** shipped

## Objetivo

Fazer a asserção da RN-06 verificar o que a regra protege — que espaço e acento não cheguem crus ao `url()` do CSS — em vez de uma string de caminho POSIX inteira. É o que derruba a suíte no Windows e, com ela, a esteira de publicação.

## Contexto

- Cobre **RF-01** e as **RN-01** e **RN-05** da spec.
- Estado atual: `src/main/__tests__/printFonts.test.ts:68-74` passa `/opt/Program Files/SGrande Impressão/x.woff2` ao `buildPrintFontFacesCss` e espera que o CSS contenha `file:///opt/Program%20Files/SGrande%20Impress%C3%A3o/x.woff2`.
- No Windows, `pathToFileURL` resolve um caminho sem unidade contra a unidade corrente, e o resultado é `file:///D:/opt/Program%20Files/SGrande%20Impress%C3%A3o/x.woff2`. Foi o que o runner `windows-latest` registrou.
- **A proteção funcionou nas duas plataformas:** espaço virou `%20`, `ã` virou `%C3%A3`. O que quebrou foi a asserção do prefixo, não o comportamento.
- `src/main/printFonts.ts:28-34` está correto e **não é para mexer** (RN-05). `pathToFileURL(resolve(file)).href` é a forma certa, e é ela que produz a codificação.
- As outras duas asserções do mesmo teste (`not.toContain('Impressão')`, `not.toContain(' Files')`) **já são** independentes de plataforma e já expressam metade da regra. É nelas que a forma nova se apoia.
- Consequência do defeito: derrubou o step Test do `publish.yml` na `v3.0.0`, a pré-release ficou sem assets, e a promoção deixou o repositório com a `Latest` sem `latest.yml` — 404 silencioso em todo PDV instalado.

## Mudanças

### 1. A asserção, por propriedade

`src/main/__tests__/printFonts.test.ts` (alterado):

```diff
   it('percent-encodes a path with space and accent (RN-06)', () => {
     const css = buildPrintFontFacesCss(() => '/opt/Program Files/SGrande Impressão/x.woff2');

-    expect(css).toContain('file:///opt/Program%20Files/SGrande%20Impress%C3%A3o/x.woff2');
+    // O prefixo do href depende da plataforma: no Windows o pathToFileURL resolve um caminho
+    // sem unidade contra a unidade corrente, e `/opt/x` vira `file:///D:/opt/x`. A RN-06 é
+    // sobre a codificação, não sobre o prefixo — asserção na string inteira derrubou a
+    // esteira de publicação (que roda em windows-latest) na v3.0.0.
+    expect(css).toContain('Program%20Files/SGrande%20Impress%C3%A3o/x.woff2');
+    expect(css).toContain("src: url('file:///");
     expect(css).not.toContain('Impressão');
     expect(css).not.toContain(' Files');
   });
```

O par de asserções cobre a regra inteira: a primeira prova que **o espaço e o acento foram codificados juntos, no segmento certo**; a segunda, que o resultado continua sendo uma URL `file://` dentro do `url()` do CSS. As duas que já existiam provam que nada cru sobrou.

## Testes

### `src/main/__tests__/printFonts.test.ts` (atualizado)

- O próprio teste é a mudança. O que precisa ser **verificado por mutação**, sem commitar: trocar `pathToFileURL(resolve(file)).href` por `resolve(file)` em `src/main/printFonts.ts:33` tem de **derrubar** este teste. Se sobreviver, a asserção nova não protege nada e o conserto só desligou o alarme.

### Integração / sanity

- `npm run typecheck` sem erros.
- `npm test` passando.
- `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`).
- Quando a task 74 entrar, a prova real é a suíte verde no `windows-latest`.

## Critérios de aceitação

- [ ] `npm test` passa no Linux
- [ ] A asserção não contém caminho absoluto de nenhuma plataforma (nem `/opt`, nem letra de unidade)
- [ ] Remover o `pathToFileURL` do `printFonts.ts` derruba o teste — conferido por mutação (RN-01)
- [ ] `src/main/printFonts.ts` não foi alterado (RN-05)
- [ ] `npm run typecheck` sem erros
- [ ] `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-10, commit único.

**`src/main/__tests__/printFonts.test.ts`** — a asserção única com caminho POSIX literal virou um par, mais o comentário que explica a troca:

- `toContain('Program%20Files/SGrande%20Impress%C3%A3o/x.woff2')` — a codificação percentual do espaço **e** do acento, no segmento, sem prefixo de plataforma nenhum;
- `toContain("src: url('file:///")` — a forma `file:///` dentro do `url()` do CSS.

As duas `not.toContain` que já existiam ficaram como estavam. `src/main/printFonts.ts` **não** foi tocado (RN-05).

### Por que são duas asserções, e não uma

A RN-06 (spec 52) tem **duas pernas**, e o review as separou: a URL é construída com `pathToFileURL()` e **nunca por concatenação de string**, porque no Windows a concatenação crua produz letra de unidade sem a terceira barra — `file://D:/…`, que não é URL válida, e a face some em silêncio. A primeira asserção cobre a codificação; a segunda cobre a forma. O comentário no teste diz isso, porque sem ele a segunda parece redundante com o teste vizinho `declares six faces, each font-display block with a file URL` e seria a primeira a ser apagada numa limpeza.

### Testes

Nenhum teste novo: a task **é** a correção de um teste. O que a prova é mutação, e foram quatro, todas com `printFonts.ts` restaurado e `git status` limpo depois:

| Mutação em `printFonts.ts` | Resultado |
| --- | --- |
| `resolve(file)` no lugar de `pathToFileURL(…).href` | 2 testes caem, inclusive este |
| `.pathname` no lugar de `.href` | 2 testes caem |
| `'file://D:' + encodeURI(resolve(file))` (concatenação à mão, 2 barras) | **só este teste cai** — os outros 21 passam, inclusive o vizinho |
| codificação só do espaço | **só este teste cai** |

As duas últimas são o que prova que a asserção nova não é decorativa: existem modos de falha da RN-06 que **nenhum outro teste da suíte pega**.

### Verificação

`npm run typecheck` 0 erros · `npm test` 73 arquivos / 807 testes · `npm run lint` 0 erros e 1 aviso (`Login.tsx:23`, o da base) · `prettier --check` limpo. Igual ao baseline em `f4ac35b`.

**Não verificado:** a suíte rodando de fato no `windows-latest`. Substituído pelo log real do job que falhou na v3.0.0 (run `42833082769`), que dá o href exato produzido lá, e pela avaliação das asserções contra ele. A prova definitiva é o CI do PR depois da task 74.

## Fora de escopo

- **Mexer no `printFonts.ts`** (RN-05)
- **Varrer a suíte atrás de outros testes dependentes de plataforma** — a matriz da task 74 é o que acha o próximo, e é mais confiável que varredura manual. Medido: 72 dos 73 arquivos já passam no Windows
- A matriz do `ci.yml` — task 74
- O guard da promoção — task 75

## Branch

`feat/72-ci-windows-test-parity`, cortada de `origin/master` em 2026-11-10. Todas as tasks da spec rodam nela, com um commit por task.

# 68 — Tipo de trabalho board-payment na fila, com rótulo e ícone

**Issue:** [#68](https://github.com/sgrande-delivery/delivery-printer/issues/68)
**Feature:** [Imprimir o comprovante de pagamento de conta de mesa](../spec.md) — issue #67
**Tipo:** feature
**Processo:** renderer (com um valor em `src/shared/`)
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Dar ao comprovante de pagamento de mesa um tipo próprio na fila durável, com rótulo e ícone, para que a Fila, o Histórico e os avisos de falha saibam nomear o papel que não saiu. Sem isso, um comprovante preso na fila apareceria como "Conta da mesa" e mandaria o operador conferir o documento errado.

## Contexto

- Cobre **RF-03** e **RN-05** da spec.
- `PrintJobKind` vive em `src/shared/printQueue.ts:4` — tipo compartilhado pelos dois processos, no `include` dos dois tsconfigs.
- O mapa de rótulo e ícone é o `RECEIPT_KINDS` de `src/renderer/helpers/receiptKind.ts:6-12`, um `Record<PrintJobKind, { label, icon }>`. Os dois são `Record` **fechado**, então o compilador cobra a entrada nova — este é o raro ponto desta base em que o tipo protege de verdade (o `tsconfig` tem `noImplicitAny: false` e o `no-explicit-any` está off).
- **O que o `tsc` não protege, e é a armadilha desta task:** o ícone. A união `IconName` (`src/renderer/base/Icon.tsx:6-37`) aceita o nome assim que ele for escrito, e o recorte da fonte **não tem o glifo** — a tela desenha a palavra em texto, sem erro em lugar nenhum e com a suíte passando. A união do `Icon.tsx` e o `icon_names` da receita em `src/renderer/fonts/README.md` são a **mesma** lista; mudar uma sem a outra é o defeito.
- Decisões default da spec: ícone `payments`, rótulo `Pagamento` (os vizinhos são de uma palavra e a coluna é estreita; o número da mesa já vai no `label` do trabalho).
- Regerar o `.woff2` muda o `sha256` registrado no `fonts/README.md`. Isso é **esperado** — o hash existe para distinguir "regerado de propósito" de "trocado sem querer", e o README precisa ser atualizado com o valor novo.

## Mudanças

### 1. O tipo na fila

`src/shared/printQueue.ts` (alterado):

```diff
-export type PrintJobKind = 'order-created' | 'order-dispatched' | 'board' | 'board-billing' | 'test';
+export type PrintJobKind = 'order-created' | 'order-dispatched' | 'board' | 'board-billing' | 'board-payment' | 'test';
```

### 2. Rótulo e ícone

`src/renderer/helpers/receiptKind.ts` (alterado):

```diff
   'board-billing': { label: 'Conta da mesa', icon: 'receipt' },
+  'board-payment': { label: 'Pagamento', icon: 'payments' },
   test: { label: 'Teste', icon: 'receipt_long' },
```

### 3. O ícone na união

`src/renderer/base/Icon.tsx` (alterado): `| 'payments'` na união `IconName`, em ordem alfabética (entre `'logout'` e `'person'`).

### 4. O recorte da fonte

`src/renderer/fonts/material-symbols-outlined-subset.woff2` (regerado) e `src/renderer/fonts/README.md` (alterado):

Acrescentar `payments` ao `ICONS` da receita do README e rodar os dois `curl` de lá. Atualizar no README: a contagem de ícones (34 → 35), o tamanho do arquivo e o `sha256`.

**Se a regeração não for possível na hora da execução** (sem rede, API do Google fora), usar `receipt_long` como ícone, **não** acrescentar `payments` à união, e abrir issue para a troca. Nome fora do recorte é pior que ícone repetido: ele aparece como texto na tela do operador.

## Testes

### `src/renderer/components/print-queue/__tests__/queueView.test.ts` e `.../PrintQueue.test.tsx` (atualizados)

- Um trabalho `board-payment` aparece na Fila com o rótulo `Pagamento`
- O mesmo no Histórico (`src/renderer/components/history/__tests__/historyView.test.ts`)

### `src/renderer/base/__tests__/Icon.test.tsx` (atualizado)

- O `Icon` renderiza `payments` — prova que o nome está na união, **não** que o glifo existe

### Integração / sanity

- `npm run typecheck` sem erros — os dois `Record` fechados falham sozinhos se a entrada faltar.
- `npm test` passando.
- `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`).

## Critérios de aceitação

- [ ] `PrintJobKind` inclui `board-payment`, e `RECEIPT_KINDS` tem a entrada correspondente
- [ ] Um trabalho `board-payment` aparece na Fila e no Histórico com rótulo e ícone próprios
- [ ] O glifo **desenha como ícone** na tela, não como a palavra `payments` — conferido com o olho, nos dois temas, porque nenhum teste pega isso (RN-05)
- [ ] O `icon_names` do `fonts/README.md` e a união `IconName` têm exatamente a mesma lista
- [ ] O `sha256` e a contagem de ícones do README correspondem ao arquivo novo
- [ ] `npm run typecheck` sem erros
- [ ] `npm test` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- Escutar o evento e enfileirar — task 69. Esta task deixa um tipo sem produtor por um commit, e está certo: ela compila e passa sozinha, que é o que `master` exige aqui.
- Mexer nos rótulos ou ícones dos tipos que já existem
- Pré-visualização do comprovante na tela de Configurações de impressão

## Branch

`feat/67-board-payment-receipt-printing`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

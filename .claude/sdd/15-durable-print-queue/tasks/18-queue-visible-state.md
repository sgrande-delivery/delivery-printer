# 18 — Estado da fila visível e retry manual

**Issue:** [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** renderer
**Depende de:** 17
**Status:** pendente

## Objetivo

Mostrar na tela quantos trabalhos estão pendentes e quais falharam, e deixar o operador tentar de novo sem fechar o app.

## Contexto

- Cobre a **RF-04** e a **RN-05** da spec
- A tela de status (`src/renderer/components/status/Status.tsx`) é o único lugar que o operador olha, e já concentra restaurante, usuário, conexão e versão
- O estado vem do main pelos canais da task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17); o renderer **não** lê a fila do disco (RN-01)
- Pendente é informação, falhado é alerta: cor e texto diferentes, e o alerta precisa dizer qual pedido/mesa e qual impressora
- `RestaurantStatus.tsx` já é o componente de estado de conexão ao lado do nome do restaurante — o padrão visual de "indicador" existe e deve ser seguido, não reinventado
- Primitivos de `src/renderer/base/`, tokens de `app.css` e `expectNoUndefinedClasses` no teste, conforme `.claude/rules/renderer-ui.md`

## Mudanças

### 1. Hook de estado

`src/renderer/hooks/usePrintQueue.ts` (novo): assina o estado da fila (consulta no mount + atualização a cada mudança avisada pelo main), e expõe `pending`, `failed` e `retry(id?)`.

### 2. Indicador na tela de status

`src/renderer/components/status/Status.tsx` (alterado) + CSS Module: contador de pendentes quando houver, e bloco de falhados com o botão de tentar de novo. Sem trabalho nenhum, **nada aparece** — fila vazia é o estado normal e não merece espaço.

### 3. Aviso de falha

Reaproveita o `useMessaging()` e a notificação da task [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13) para o momento em que um trabalho passa a `failed`; o indicador é o estado persistente, a notificação é o evento.

## Testes

### `src/renderer/hooks/__tests__/usePrintQueue.test.ts` (novo)

- Reflete o estado vindo do canal, e atualiza quando o main avisa
- `retry` chama o canal com o id

### `src/renderer/components/status/__tests__/Status.test.tsx` (atualizado)

- Com pendentes, mostra o contador; sem nada, não mostra bloco nenhum
- Com falhado, mostra o alerta com pedido e impressora, e o botão chama o retry
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: impressora desligada, acompanhar o contador subir, religar e ver zerar; forçar `failed` e usar o retry

## Critérios de aceitação

- [ ] Pendentes aparecem e zeram quando a fila esvazia
- [ ] Falhado aparece como alerta, com pedido/mesa e impressora
- [ ] Retry manual reprocessa e limpa o alerta quando dá certo
- [ ] Fila vazia não ocupa espaço na tela
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Tela dedicada de histórico de impressão
- Cancelar trabalho (se virar pedido, é task própria)
- Exportar a fila: o log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) já cobre o que o suporte precisa

## Branch

`feat/15-durable-print-queue`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

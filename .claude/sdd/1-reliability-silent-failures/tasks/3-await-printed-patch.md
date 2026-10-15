# 03 — Aguardar o patch de impresso e parar de reimprimir o pedido

**Issue:** [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Aguardar e tratar a falha de `PATCH /orders/:uuid/printed`, que hoje é fire-and-forget. Enquanto ela é ignorada, o pedido fica não-marcado e **sai de novo** na próxima reconexão: é a causa conhecida do comprovante duplicado que o restaurante reclama.

## Contexto

- `src/renderer/hooks/usePrintingOrder.ts:33` — o `api.patch` é chamado sem `await`, dentro do `try` que termina em `catch (err) { console.error(err) }`. Sem o `await`, o `catch` não vê a rejeição: ela vira unhandled rejection na janela
- `usePrintingOrder.ts:54-67` — a varredura `GET /orders/print/list` roda sempre que `isConnected` muda, e imprime tudo que a API ainda considera não impresso
- Cobre a **RF-02** e a **RN-02** da spec: a marcação é a única defesa contra duplicata, porque não existe controle local
- O interceptor (`src/renderer/services/apiErrorInterceptor.ts`) pode **reenfileirar** a chamada enquanto renova o token; o `await` passa a esperar isso também, o que é o comportamento desejado
- `usePrintingBoard.ts` não tem marcação equivalente — comprovante de mesa não é marcado em lugar nenhum, e por isso também não é recuperado. Isso é da spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15), não desta

## Mudanças

### 1. Aguardar e reportar a marcação

`src/renderer/hooks/usePrintingOrder.ts` (alterado):

```diff
       await Promise.all(promises);

-      api.patch(`/orders/${uuid}/printed`);
+      await api.patch(`/orders/${uuid}/printed`);
     } catch (err) {
       console.error(err);
     }
```

E separar os dois modos de falha, que hoje caem no mesmo `catch` e são muito diferentes:

- **falhou ao imprimir** — o pedido não saiu; a API continua achando que precisa imprimir, e a varredura vai tentar de novo. Está certo
- **imprimiu e falhou ao marcar** — o comprovante já está na mão do operador, e a varredura vai imprimir **de novo**. É o caso que precisa de aviso, porque a correção é humana até a fila da spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15) existir

O aviso ao operador sai por `useMessaging().handleOpen(...)`, dizendo o número do pedido.

### 2. Não reimprimir o que acabou de sair

Guardar em memória, no hook, os `uuid` cuja impressão foi concluída nesta sessão, e pular esses na varredura. É uma defesa barata para o caso exato de "imprimiu, não marcou, reconectou" — e deliberadamente **não** é a fila durável: morre no restart, e isso está dito na spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15).

## Testes

### `src/renderer/hooks/__tests__/usePrintingOrder.test.ts` (novo)

- `rawPrint` ok e `patch` com 500: o aviso aparece e a rejeição **não** escapa (sem unhandled rejection)
- O mesmo pedido chegando pela varredura depois de uma impressão concluída nesta sessão **não** imprime de novo
- Falha no `rawPrint`: o `patch` **não** é chamado (não marcar como impresso o que não saiu)
- Teste por mutação: removendo a guarda de memória, o teste de duplicata cai

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`

## Critérios de aceitação

- [ ] Com a marcação respondendo 500, o comprovante sai **uma** vez e o operador é avisado
- [ ] Com a impressão falhando, a API não é marcada
- [ ] Nenhuma unhandled rejection no console durante os dois cenários
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Fila persistida e retry — spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)
- Recuperação de comprovante de mesa, que não tem marcação na API — spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)
- Log em arquivo — spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11); aqui o aviso é de tela

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

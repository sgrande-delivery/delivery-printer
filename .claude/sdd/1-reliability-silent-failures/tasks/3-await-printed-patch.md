# 03 — Aguardar o patch de impresso e parar de reimprimir o pedido

**Issue:** [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** shipped

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

Guardar em memória, no hook, os `uuid` cuja impressão **de `print-created`** foi concluída nesta sessão, e pular esses na varredura. É uma defesa barata para o caso exato de "imprimiu, não marcou, reconectou" — e deliberadamente **não** é a fila durável: morre no restart, e isso está dito na spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15).

**Correção medida na execução — a primeira versão desta task estava errada aqui.** Dizia "os `uuid` cuja impressão foi concluída", sem o layout, e a implementação registrou os dois. Como a varredura **sempre** pede `print-created`, registrar o `print-dispatched` esconde dela um `print-created` que falhou: pedido com produção falhada e entrega impressa deixa de ser recuperado, e o ticket da cozinha nunca sai. O review reproduziu (`GET print-created` 1 vez em vez de 2) e o registro passou a ser gateado por `layout === 'print-created'`. A guarda tem um significado só, idêntico à pergunta que a varredura faz.

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

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

renderer

### Arquivos criados/alterados

- `src/renderer/hooks/usePrintingOrder.ts` — `await` na marcação, dois `try` separados, aviso ao operador e a guarda em memória gateada por layout
- `src/renderer/hooks/__tests__/usePrintingOrder.test.ts` (novo) — 4 casos

### Canais IPC criados/alterados

Nenhum. O `rawPrint` já existia nos dois lados (`preload.ts:15` / `main.ts:16`) e já tinha stub em `src/__tests__/setup.ts`.

### Eventos de socket

Nenhum novo. Os `off('printOrder')` e `off('printShipment')` do cleanup continuam íntegros, com `socket` nas dependências.

### Variáveis de ambiente novas

Nenhuma.

### Decisões, e o veredito do review sobre cada uma

- **`handleOpen` num ref, fora das dependências do `print`.** Review: **correto, e a premissa é verdadeira** — `messaging.tsx:31` é `useCallback(..., [open])`, então o `handleOpen` muda de identidade a cada abertura do snackbar; nas dependências, o aviso de "não consegui marcar" refaria a varredura e dispararia uma nova rodada de impressões. O caminho durável (estabilizar o provider) ficou registrado como dívida no plan
- **Guarda consultada só na varredura, não nos eventos de socket.** Review: **correto, e por razão mais forte que a declarada** — o `printOrder` reemitido pelo painel vem do `printNow` (`POST /orders/{id}/print-approved` → `order.gateway.ts:47`), ou seja, é pedido **explícito** do operador para reimprimir; suprimir isso seria regressão de produto
- **`uuid` entra na guarda antes do `patch`.** Review: correto — o comprovante já saiu fisicamente
- **Assinatura `print(order, layout)` com `Pick<OrderData, 'uuid' | 'sequence'>`.** Review: correto e **verificado nos dois caminhos** — `sequence` é coluna de tabela, vem no `select('orders.*')` do `/orders/print/list` e no `toArray()` que o socket relaya
- **`#<sequence>` na mensagem.** Review: é o número que o painel mostra nas telas de pedido ao vivo, que é a tela que o operador tem aberta

### O que o review bloqueou, e como ficou

A guarda registrava os **dois** layouts e era consultada só por `uuid`. Reproduzido pelo review: `print-created` falha → `print-dispatched` sai → reconexão → a varredura **pula** o pedido, e o `GET print-created` acontece 1 vez em vez de 2. O comprovante de produção nunca sai, em silêncio.

Corrigido com o gate `layout === 'print-created'` (a guarda passa a ter um significado só, idêntico à pergunta que a varredura faz), e o cenário virou o quarto teste — que é a rede que impede o gate de ser removido por engano. O enunciado desta task, que não mencionava o layout, foi corrigido na seção "Mudanças".

### Testes

`src/renderer/hooks/__tests__/usePrintingOrder.test.ts`, com `vi.mock` de `renderer/services/api`, `renderer/providers/messaging` e `../useOrderSocket`:

- `rawPrint` ok e `patch` 500 → aviso com `#42`, uma impressão, **sem** unhandled rejection (verificado por `process.on('unhandledRejection')`)
- reconexão depois de impressão concluída → duas varreduras, um `rawPrint`
- `rawPrint` rejeita → `patch` **não** é chamado, e não há aviso
- `print-created` falha, `print-dispatched` sai, reconexão → o `GET print-created` acontece **duas** vezes

Mutação, conferida pelo implementador, pelo review e por mim: removendo o gate, cai **só** o quarto caso (1 falha, 11 passam); restaurado, 12 verdes.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso — o `Login.tsx:23` da base
- `npm test`: 12 testes em 4 arquivos
- Empacotamento: não rodado — diff só de renderer, sem dependência nem `package.json`

### Como testar

1. `npm run dev`
2. Com a marcação respondendo 500 (ou a rota bloqueada), disparar um pedido: o comprovante sai uma vez e o snackbar avisa citando o número
3. Reconectar o socket e confirmar que ele não sai de novo

### O que não foi verificado

Impressora real, o snackbar na tela (o provider está mockado nos testes; nenhum teste renderiza o `MessagingProvider` de verdade), reconexão real de socket, e o reenfileiramento do interceptor de refresh de token junto com o `await` novo. O payload da API foi conferido **lendo** `delivery-api` e `delivery-socket-api`, não chamando.

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

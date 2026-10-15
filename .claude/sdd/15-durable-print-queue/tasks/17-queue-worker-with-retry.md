# 17 — Worker com retry, deduplicação e cobertura de mesa

**Issue:** [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 16
**Status:** pendente

## Objetivo

Processar a fila em série, com retry em backoff e sem imprimir duas vezes, cobrindo também comprovante de mesa e `print-dispatched` — que hoje não têm recuperação nenhuma.

## Contexto

- Cobre a **RF-01** a **RF-05** e as RN-03, RN-05 e RN-06 da spec
- Os quatro eventos ficam onde estão (`usePrintingOrder.ts:40,44` e `usePrintingBoard.ts:38,42`); o que muda é o que eles fazem depois de buscar o HTML: `enqueue` em vez de `rawPrint`
- `rawPrint` **não** é idempotente e `PATCH /printed` **é** (RN-03): imprimir primeiro, registrar, marcar depois
- A marcação continua no renderer, que tem a sessão; o main avisa "imprimi o job X" por canal novo, e o renderer chama a API. Se a marcação falhar, o retry é só dela — nunca reimpressão
- A guarda em memória da task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3) (spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1)) é **substituída** pela deduplicação em disco: removê-la é parte desta task, não deixar as duas
- A varredura `GET /orders/print/list` continua existindo e passa a enfileirar; a deduplicação é o que impede o pedido já impresso de sair de novo
- Canais IPC novos são pares nos dois lados, mais stub em `src/__tests__/setup.ts` (`.claude/rules/printing.md`)

## Mudanças

### 1. O worker

`src/main/queue/print-queue-worker.ts` (novo): laço serial que pega o próximo pendente elegível (respeitando o backoff), chama a impressão do `onRawPrint` (extraída para função reutilizável), e em caso de sucesso marca e avisa o renderer. Em caso de falha, incrementa a tentativa e agenda; passando do limite, marca `failed` e avisa.

Gatilhos: boot do app, `enqueue`, e um aviso de reconexão vindo do renderer (o `isConnected` do `SocketStore` é quem sabe).

### 2. Impressão extraída

`src/main/ipc-events/onRawPrint.ts` (alterado): a lógica de imprimir vira função chamável pelo worker; o canal `rawPrint` continua existindo para o teste local da task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24), ou passa a enfileirar com `kind: 'test'` — decidir na execução e registrar.

### 3. Canais

`enqueue(job)`, `queueState()`, `retryFailed(id?)`, `notifyConnection(isConnected)` e o canal do main para o renderer `onJobPrinted(cb)`.

### 4. Hooks

`usePrintingOrder.ts` e `usePrintingBoard.ts` (alterados): enfileiram; a marcação passa a reagir ao `onJobPrinted`. A guarda em memória da task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3) sai.

## Testes

### `src/main/queue/__tests__/print-queue-worker.test.ts` (novo)

- Impressão falhando duas vezes e sucedendo na terceira: sai **uma** vez, com duas tentativas registradas
- Passando do limite: `failed`, e o renderer é avisado
- Dois trabalhos para a mesma impressora: processados em série, nunca concorrentes
- Trabalho já `printed` não é reprocessado — **teste por mutação**: removendo a checagem, este teste cai
- Falha na marcação não gera nova impressão

### `src/renderer/hooks/__tests__/usePrintingOrder.test.ts` (atualizado)

- O evento enfileira em vez de imprimir direto
- `onJobPrinted` dispara a marcação
- A varredura de reconexão enfileira, e trabalho já impresso não duplica

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: impressora desligada, pedido chega, religar a impressora e ver sair uma vez; repetir reiniciando o app no meio

## Critérios de aceitação

- [ ] Impressora desligada: o trabalho sai quando ela volta, uma vez
- [ ] Encerrar o processo no meio e reabrir: o trabalho sai uma vez
- [ ] Comprovante de mesa é recuperado
- [ ] Falha além do limite vira `failed` e aparece no estado da fila
- [ ] Falha de marcação não causa reimpressão
- [ ] A guarda em memória da task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3) foi removida
- [ ] Mutação da deduplicação derruba teste
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- UI do estado da fila — task [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18)
- Reimpressão pedida pelo painel
- Paralelismo entre impressoras (decisão registrada no plan)

## Branch

`feat/15-durable-print-queue`, cortada de `feat/11-observability-logs-and-errors` em 2026-10-15, com um commit por task.

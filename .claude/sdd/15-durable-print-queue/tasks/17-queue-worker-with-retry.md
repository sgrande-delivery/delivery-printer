# 17 — Worker com retry, deduplicação e cobertura de mesa

**Issue:** [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 16
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/main/queue/print-queue-worker.ts`, `src/main/queue/print-queue.ts`, `src/main/ipc-events/{onEnqueue,onQueueState,onRetryFailed,onNotifyConnection}.ts`, `src/renderer/services/printQueue.ts`, e quatro arquivos de teste.
Alterados: `onRawPrint.ts` (a impressão virou `printReceipt`, chamável pelo worker), `main.ts`, `preload.ts`, `setup.ts`, `shared/printQueue.ts`, `print-queue-store.ts` (`enqueueMany`, `resetFailed`, `isPrintJob` exportado), `usePrintingOrder.ts`, `usePrintingBoard.ts`.

### Canais

`enqueue`, `queueState`, `retryFailed` (`invoke`/`handle`), `notifyConnection` (`send`/`on`), e **dois main → renderer**: `queue:job-printed` e `queue:job-failed`, com cleanup devolvido ao chamador. Par e stub conferidos nos seis.

O `rawPrint` **continua** e imprime direto, fora da fila: o teste local da #24 precisa de resposta imediata ("a impressora respondeu?"), e um teste enfileirado sairia minutos depois.

### Os três bloqueios do review

**1. A dedup suprimia a reimpressão explícita do operador.** A primeira versão barrava o `printOrder` reemitido pelo painel quando havia registro `printed` — contra decisão já medida na task #3 da spec #1. Agora o `EnqueueRequest` carrega `source: 'event' | 'scan'`, e a guarda vale **só** para a varredura. O `DEDUP_AFTER_PRINT` por `kind` saiu (viraria lógica morta). Irmão `failed` com origem `'event'` passou a **enfileirar lote novo** em vez de devolver `'duplicate'` — engolir o pedido explícito sem aviso era o problema.

**2. O `deviceName` na chave perdia comprovante.** `printers.name` **não tem índice único** (migration sem `unique`, request sem `unique`, formulário sem checagem), então duas impressoras "Cozinha" devolvem dois itens com o mesmo nome e conteúdos diferentes — e o segundo desaparecia. **E o teste registrava a perda como desejada.**

A correção foi de desenho: **a unidade de enfileiramento é a resposta inteira**, numa chamada IPC (`enqueueMany`). Itens da mesma resposta nunca deduplicam entre si, o lote nunca fica pela metade no arquivo, e a E/S cai pela metade. O `deviceName` saiu da chave.

**3. O teste de serialidade não discriminava.** Mutar o `drain()` para concorrente passava nos 12 testes: o teste provava só a reentrância do `kick()`. O cenário que pega é **dois `pending` já no arquivo no boot** (o `kill -9`), e ele foi acrescentado.

### Mutações, verificadas por mim de forma independente

| Mutação | Resultado |
| --- | --- |
| guarda de `printed` desligada | caem **2** testes, **os dois da varredura** — e o de evento **não** cai, que é o correto |
| guard de reentrância do `drain()` desligado | cai **exatamente** o teste novo do boot |
| dedup por `deviceName` dentro do lote | cai o teste dos dois itens "Cozinha" |
| `toSummary` virando spread do job | cai o teste do `queueState`, com `SECRET` no fio |

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · **115 testes em 20 arquivos** (baseline da spec: 71/16) · `npm run build` com os três bundles, e `grep` no bundle do renderer por `printQueueStore`/`createPrintQueueWorker`/`print-queue.ndjson` → **zero ocorrências** (o código de fila ficou só em `out/main/main.js`).

### O que não foi verificado

Impressora real, restart real do Electron (o "restart" dos testes é instância nova de worker sobre o mesmo arquivo — proxy correto, porque o estado mora em disco), socket real reconectando, e o botão "Imprimir" do painel contra este app (medido **lendo** os três repos, não chamando). Um `kill -9` **entre** imprimir e gravar `markPrinted` ainda pode duplicar: não há como evitar sem transação com a impressora.

## Branch

`feat/15-durable-print-queue`, cortada de `feat/11-observability-logs-and-errors` em 2026-10-15, com um commit por task.

# 16 — Fila persistida em userData

**Issue:** [#16](https://github.com/sgrande-delivery/delivery-printer/issues/16)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** main
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Criar o armazenamento da fila no processo principal — enfileirar, listar, marcar impresso, marcar falhado, descartar por idade — com escrita atômica e limites de tamanho e idade.

## Contexto

- `app.getPath('userData')` é o lugar de estado por instalação; `.env` é build-time e não serve (`.claude/rules/autoupdate.md`)
- Cobre a **RN-01**, a **RN-02** e a **RN-04** da spec
- O trabalho já tem identidade: `uuidv4()` em `src/renderer/hooks/usePrintingOrder.ts:26`, que vira o nome do arquivo temporário em `src/main/ipc-events/onRawPrint.ts:16`
- O payload de um trabalho é o do `rawPrint` (`content`, `copies`, `deviceName`, `id`) mais o que a marcação precisa (tipo, e o `uuid` do pedido quando houver)
- Decisão pendente 1 da spec: guardar o HTML na fila. O `content` é o comprovante inteiro, então o limite de tamanho da RN-04 importa de verdade
- A task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) da spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) grava um JSON de uma chave em `userData` para o início automático. Se as duas estiverem na base, vale um helper comum de leitura/escrita atômica — e **não** um "framework de storage"

## Mudanças

### 1. O store

`src/main/queue/print-queue-store.ts` (novo): NDJSON em `userData`, com API pequena e explícita — `enqueue(job)`, `list()`, `markPrinted(id)`, `markFailed(id, reason)`, `incrementAttempt(id)`, `pruneOlderThan(ms)`.

Escrita atômica: arquivo temporário no mesmo diretório + `rename`. Leitura tolerante: linha que não parseia é **descartada com log**, e o resto da fila sobrevive (RN-02).

Limites: número máximo de trabalhos e idade máxima (24 h, decisão pendente 2). O que for descartado vai para o log com o motivo (RN-06).

### 2. Tipos

`src/main/queue/types.ts` (novo): o `PrintJob` com `id`, `kind` (`order-created` | `order-dispatched` | `board` | `board-billing` | `test`), `payload` do `rawPrint`, `orderUuid` opcional, `attempts`, `status` (`pending` | `printed` | `failed`), `createdAt`, `lastError`.

Os nomes de `kind` acompanham os quatro eventos de socket mais o teste local da task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24), para o worker não precisar adivinhar o que fazer depois de imprimir.

## Testes

### `src/main/queue/__tests__/print-queue-store.test.ts` (novo)

- Enfileira, lê de volta, e o conteúdo é igual (ida e volta)
- `markPrinted` remove do pendente; `markFailed` mantém com o motivo
- Arquivo com uma linha corrompida no meio: as outras são lidas, a corrompida é descartada
- Arquivo inexistente: `list()` devolve vazio, sem lançar
- Trabalho mais velho que o limite é descartado por `pruneOlderThan`
- Limite de tamanho respeitado

`app.getPath` é mockado com `vi.mock('electron', ...)` para um diretório temporário.

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`

## Critérios de aceitação

- [ ] Fila sobrevive a restart do processo
- [ ] Arquivo corrompido não impede a leitura do resto nem o boot do app
- [ ] Escrita é atômica (teste de interrupção simulada, ou inspeção de que nunca há `write` direto no arquivo final)
- [ ] Limites de idade e de tamanho aplicados, com descarte logado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- O worker e o retry — task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17)
- Canais IPC — task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17), que é quem passa a precisar deles
- UI — task [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18)
- Banco de dados embarcado: decisão registrada no plan (dependência nativa × duas arquiteturas)

## Branch

`feat/15-durable-print-queue`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

# Plan — Fila durável de impressão com retry

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)
**Branch de trabalho:** `feat/15-durable-print-queue`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

A fila inverte o caminho de hoje. Em vez de `evento → API → rawPrint`, passa a ser:

```
evento de socket (renderer)
  → busca o HTML na API (renderer, onde o axios com sessão mora)
  → enqueue(job) por IPC  →  fila em userData (main)
                              worker (main): rawPrint → marca impresso → remove
                                             falhou → retry com backoff → failed
  ← estado da fila por IPC ← (renderer mostra pendentes/falhados)
```

O renderer continua dono da chamada HTTP, porque é onde está a sessão (cookie, interceptor de refresh). O main passa a ser dono da impressão e da persistência. A marcação `PATCH /printed` é feita pelo renderer quando o main avisa que imprimiu (a alternativa, main com axios próprio, duplicaria a autenticação — o mesmo erro que a spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) está desfazendo no socket).

Reaproveitado: o `id` do trabalho já existe (`uuidv4()` em `usePrintingOrder.ts:26`) e já é o nome do arquivo temporário em `onRawPrint`; o `isConnected` do `SocketStore` como gatilho de reprocessamento; o `useMessaging()` e o log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11).

## Decisões arquiteturais

- **Fila no main, com API por IPC** (RN-01). Três canais novos: `enqueue`, `queueState` e `retryFailed`, mais um canal do main para o renderer avisando "imprimi o job X, marque na API".
- **NDJSON com reescrita atômica**, não banco. São dezenas de registros, não milhares; SQLite ou `better-sqlite3` traria dependência nativa, e dependência nativa em Electron significa rebuild por arquitetura — com `ia32` e `x64`, dois.
- **O worker é serial.** Impressora térmica não ganha nada com paralelismo, e serial elimina a classe de bug de dois trabalhos na mesma impressora ao mesmo tempo.
- **Backoff curto e limite baixo** (ex.: 5 tentativas, 2s → 30s). O caso real é "impressora desligada por alguns minutos"; retry por horas só esconde o problema de quem precisa agir.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Fila persistida em userData | [#16](https://github.com/sgrande-delivery/delivery-printer/issues/16) | [16-queue-store-in-userdata.md](./tasks/16-queue-store-in-userdata.md) | — | pendente |
| 02 | Worker com retry, deduplicação e cobertura de mesa | [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17) | [17-queue-worker-with-retry.md](./tasks/17-queue-worker-with-retry.md) | 01 | pendente |
| 03 | Estado da fila visível e retry manual | [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18) | [18-queue-visible-state.md](./tasks/18-queue-visible-state.md) | 02 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03, estritamente: a 02 precisa do armazenamento e a 03 precisa do worker para ter estado a mostrar.

**Esta spec depende da [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) (observabilidade) estar entregue**, por decisão registrada na RN-06: fila que falha calada é pior que não ter fila, porque ela passa a ser o lugar onde o trabalho desaparece. Se o `/execute` for rodado antes, dizer isso e perguntar.

Depende também da [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3), em um ponto específico: a guarda em memória que ela introduz é substituída pela deduplicação em disco da task 02 — a 02 remove a guarda, e não as duas convivem.

## Dependências de outros repos

Nenhuma. Em particular, a fila **não** precisa de endpoint novo: a marcação `PATCH /orders/:uuid/printed` já existe, e comprovante de mesa continua sem marcação na API — a recuperação dele passa a ser local, que é justamente o ganho.

## Verificação da entrega

- **matar o processo no meio** é o teste que importa: `kill -9` (ou encerrar pelo Gerenciador de Tarefas) com trabalho na fila, reabrir, e conferir que ele sai uma vez
- impressora desligada e religada, com o app aberto e com o app reiniciado no meio
- arquivo de fila corrompido à mão: o app abre
- teste por mutação na deduplicação, exigido pela task 02

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. -->

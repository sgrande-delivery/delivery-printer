# Plan — Fila durável de impressão com retry

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)
**Branch de trabalho:** `feat/15-durable-print-queue`, cortada de `feat/11-observability-logs-and-errors` em 2026-10-15: todas as tasks em sequência, um commit por task e um PR no fim

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
| 01 | Fila persistida em userData | [#16](https://github.com/sgrande-delivery/delivery-printer/issues/16) | [16-queue-store-in-userdata.md](./tasks/16-queue-store-in-userdata.md) | — | executada |
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

Da task 01 (#16):

- **O guard de `id` do `enqueue` NÃO é a RF-03, e a task 02 precisa saber disso.** O `id` é `uuidv4()` gerado **por tentativa de impressão** (`usePrintingOrder.ts:54`), então a varredura depois de restart reenfileira o mesmo pedido com id **novo** e ele imprimiria de novo. **A deduplicação é por `orderUuid` + `kind`**, com o `kind` significando a mesma pergunta que a varredura faz (`print-created` → `order-created`) — é o aprendizado da spec #1 task 02 aplicado ao disco. O guard de id serve a outra coisa: retry idempotente de IPC.
- **A evidência de deduplicação é o registro `printed` com `content` zerado** (o `markPrinted` não apaga o trabalho, muda o status). **E ele é o primeiro que o limite descarta** (`dropOverflow` tira impressos antes de falhados e pendentes, o que é correto em princípio). Janela estreita — exige `PATCH /printed` ter falhado, mais 200 trabalhos depois, mais restart —, mas a task 02 depende desse registro.
- **O comprovante foi medido, e é por isso que a reescrita integral fica.** Na `delivery-api`, o layout de impressão inlina `public/css/socket/order/styles.css` = **2 379 bytes** e **não há imagem nem base64 em nenhuma blade de impressão** (grep limpo). Logo um trabalho é ~3–10 kB, 30 kB no pedido monstro; com 200 trabalhos o arquivo fica em ~2 MB, e uma mutação (ler + serializar + escrever + `fsync` + `rename`) custa **7–21 ms** medidos. Limite por **contagem** basta; revisar se a API algum dia inlinar logo ou base64.
- **Append em NDJSON não satisfaz a RN-02.** `appendFileSync` de linha multi-kB **não é atômico**, e a linha truncada que a leitura descarta seria exatamente **o trabalho recém-enfileirado que ainda não imprimiu** — o único cuja perda a RF-01 existe para evitar, e caladamente, porque o renderer já recebeu "enfileirado". Com reescrita + `rename`, queda no meio não perde nada.
- **Leitura não escreve.** A cura do arquivo é `compact()`, chamada por quem decide (boot), não efeito colateral de `list()`. Três motivos: a #17 e a #18 leem em laço (uma linha ilegível geraria `open`+`fsync`+`rename` **por poll**); o log carrega só o número da linha, então depois da cura não há nada para o suporte olhar; e numa migração de schema — quando alguém acrescentar campo obrigatório ao `PrintJob` — um simples `list()` **zeraria a fila pendente**. **A task 02 tem de chamar `compact()` no boot, junto do `pruneOlderThan()`.**
- **Teste do main que escreve em disco tem orçamento de tempo.** O CI roda em `windows-latest` (NTFS + Defender) com timeout default de 5 s, e um teste com 203 reescritas atômicas levou 826 ms aqui e **estourou o timeout numa das execuções**. O formato certo é montar o estado inicial escrevendo o arquivo de uma vez e deixar sob teste só a transição (826 ms → 54 ms).
- **A mutação que mata não é a primeira que se escreve.** A rede de privacidade do log tinha **dois** ramos de descarte e só um estava provado: interpolar o conteúdo **dentro da mensagem** do outro ramo passava com todos os testes verdes — e era justamente o ramo que carrega payload inteiro. Verificado depois da correção: vazando qualquer um dos dois ramos, o teste cai.
- **Tipo compartilhado tem uma fonte só.** O arquivo `src/main/queue/types.ts` que só reexportava de `shared/` foi removido: ele seria convite para a #18 importar `main/queue/types` — funciona hoje (tipo é apagado na emissão) e vira bug de bundling no dia em que alguém puser um valor lá.
- **A garantia de o HTML não atravessar o IPC não pode ser só de tipo.** Nada obriga o handler da #17 a usar `Omit`/`Pick`. A garantia real é **teste sobre o payload do canal** afirmando que nenhum `content` cruza, escrito na task que cria o canal.



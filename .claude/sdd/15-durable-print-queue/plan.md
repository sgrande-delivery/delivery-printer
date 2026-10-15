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
| 02 | Worker com retry, deduplicação e cobertura de mesa | [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17) | [17-queue-worker-with-retry.md](./tasks/17-queue-worker-with-retry.md) | 01 | executada |
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
Da task 02 (#17):

- **A dedup se decide pela ORIGEM, não pelo `kind`.** Evento de socket = pedido explícito do operador, **imprime**; varredura `/orders/print/list` = recuperação, **deduplica**. A primeira versão estendeu a dedup aos eventos e **suprimia a reimpressão explícita por até 24 h** — contra decisão já registrada na task #3 da spec #1 (*"suprimir isso seria regressão de produto"*). O caminho foi remedido nos três repos e está vivo: `POST /orders/print/now` → `OrderPrintedController::printNow()` → socket `/orders/{id}/print-approved` → `order.gateway.ts:46-47` emite `printOrder`, e o botão **"Imprimir"** existe em `delivery-admin`, `BoardProductListMenu.tsx:31`.
- **Bug em outro repo, achado de passagem:** os botões "Imprimir pedido" da lista de pedidos e do live-orders do admin vão por `POST /orders/v2/{id}/dispatch-print` → `DispatchOrderPrintUseCase.php:67`, que manda **o array de payloads de impressão**, não o pedido — e o gateway sala por `order.restaurant_uuid`, que nesse payload não existe, virando `restaurant:undefined`. **Ninguém recebe.** Hoje a única reimpressão explícita que chega a este app é a do menu de mesa.
- **`printers.name` NÃO é único**, e por isso ele não pode entrar na chave de dedup: a migration cria `string('name', 100)` **sem índice único**, o `CreatePrinterRequest`/`UpdatePrinterRequest` validam sem `unique`, e o formulário do painel não checa. Duas impressoras chamadas "Cozinha" (dois tickets de estação na mesma impressora física) devolvem **dois itens com o mesmo `device_name` e conteúdos diferentes** — e a primeira versão descartava o segundo **em silêncio**, com um teste que **registrava a perda como comportamento desejado**.
- **A unidade de enfileiramento é a resposta inteira da API, nunca um item.** `enqueueMany` em uma chamada IPC: itens da mesma resposta **nunca** deduplicam entre si, o lote nunca fica pela metade no arquivo (o que faria a varredura seguinte tratar o resto como duplicata) e a E/S cai pela metade. Isto também torna a #19 mais simples: `deviceName` saiu da identidade do trabalho.
- **Teste de serialidade que não semeia o arquivo não prova nada.** O teste original só provava a reentrância do `kick()`, porque o segundo `enqueue` acontecia depois de o `drain()` já ter capturado a lista. O cenário que discrimina é **dois `pending` já no arquivo no boot** — o caso do `kill -9`. Verificado: com o guard de reentrância desligado, cai exatamente esse teste.
- **O id do job e o id do payload têm de ser o mesmo `uuidv4()`.** A primeira versão gerava dois, então o log dizia `enqueued <jobId>` e o `.print.html` que a falha deixa em `%TEMP%` tinha outro nome — o suporte não correlacionava. A regra está no `.claude/rules/printing.md` ("um `id` novo, que é o nome do arquivo temporário").
- **Conserto de bug pré-existente dentro de task de feature, aceito com justificativa:** o `printReceipt` passou a fechar a `BrowserWindow` num `finally`. É o retry que transforma um vazamento pontual em até 5 janelas escondidas por job — entregar o worker sem isso seria entregar de propósito um worker que vaza.
- **A marcação por job inverte a premissa do `.claude/rules/printing.md`.** A regra diz que "o que evita a duplicata é o `patch` ter sido processado pela API"; com a fila, o `PATCH` sai a cada job impresso, então a API para de listar o pedido enquanto o comprovante da segunda impressora ainda está `pending` — e a varredura deixa de ser a recuperação, a fila local passa a ser. É o desenho da spec, mas a regra precisa ser atualizada quando esta spec chegar ao `master`.
- **Dívidas declaradas:** `notifyConnection(true)` zera a espera de **todos** os jobs, e reconexão de socket é evidência fraca de que a **impressora** voltou (a impressão é local) — rede oscilando queima as 5 tentativas em segundos; se `incrementAttempt`/`markFailed` lançar na última tentativa, o job nunca vira `failed` e o retry fica infinito no teto de 30 s; falha ao gravar `printed` (disco cheio) deixa o job `pending` no disco, então um restart reimprimiria; e `bootPrintQueue` roda junto da criação da janela, então job herdado pode imprimir antes de o renderer montar o listener (para `order-created` a varredura repara via `already-printed`; para `order-dispatched` não há reparo).

- **A garantia de o HTML não atravessar o IPC não pode ser só de tipo.** Nada obriga o handler da #17 a usar `Omit`/`Pick`. A garantia real é **teste sobre o payload do canal** afirmando que nenhum `content` cruza, escrito na task que cria o canal.



# Plan — Imprimir o comprovante de pagamento de conta de mesa

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#67](https://github.com/sgrande-delivery/delivery-printer/issues/67)
**Branch de trabalho:** `feat/67-board-payment-receipt-printing`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

A feature é o **terceiro caso do `usePrintingBoard`**, e quase tudo que ela precisa já existe:

- `src/renderer/hooks/usePrintingBoard.ts` já tem o `print(session, layout)` que busca o conteúdo, enfileira e avisa o operador nas duas falhas (`SERVER_FETCH_REASON` e `QUEUE_REASON`). O que muda é que o layout do comprovante **não é um sufixo da URL da sessão**: a rota é `board-sessions/{id}/payments/{paymentId}/receipt-content`, com um id a mais. O `print` atual monta a URL por interpolação de `layout`; o caminho mais honesto é um segundo callback (`printPayment`) ao lado dele, não um `layout` que esconde um path diferente dentro do mesmo `Record`.
- `enqueueReceipts` (`src/renderer/services/printQueue.ts:17`) já entrega a resposta inteira ao main numa chamada, com um `id` novo por item. Sem `orderUuid` (RN-03), como o board já faz.
- `buildPrintFailureNotice` + `useMessaging()` + `window.electron.notification` já são o caminho de aviso, e o `onJobFailed` do `usePrintingOrder` (`:117-123`) já cobre a falha **depois** do limite de tentativas para **qualquer** tipo, inclusive este — não há nada a fazer lá.
- `src/shared/printQueue.ts:4` é onde o `PrintJobKind` vive; `src/renderer/helpers/receiptKind.ts:6` é o mapa de rótulo e ícone que as telas de Fila e Histórico leem. Os dois são `Record<PrintJobKind, …>`, então o compilador cobra a entrada nova — este é o raro ponto desta base em que o tipo protege de verdade.

**O que o `tsc` não protege**, e por isso vira critério: o ícone. A união `IconName` aceita o nome novo assim que ele for escrito, e o recorte da fonte não tem o glifo — a tela desenha a palavra `payments` em texto, sem erro nenhum (RN-05).

## Decisões arquiteturais

- **Tipo de trabalho próprio (`board-payment`) em vez de reusar `board-billing`.** O `kind` é a identidade do papel na fila: é por ele que a tela nomeia o trabalho pendente, que o Histórico agrupa e que o worker deduplica. Reusar o da conta faria o operador procurar o documento errado quando o papel não saísse, e misturaria dois documentos no Histórico.
- **Um callback próprio para o comprovante, e não mais um valor no `PrintingLayoutOptions`.** O `Record<PrintingLayoutOptions, PrintJobKind>` de hoje funciona porque os dois layouts são sufixos do mesmo recurso (`board-sessions/{id}/<layout>`). O comprovante tem outro recurso e outro id; espremê-lo ali obrigaria o `print` a saber de dois formatos de URL, e é o tipo de economia que custa o próximo leitor.
- **Sem `orderUuid` e fora de `MARKED_IN_API`.** Não há o que marcar e não há o que deduplicar (RN-03/RN-04). Consequência aceita e desejada: dois eventos iguais imprimem dois comprovantes, porque o segundo é o painel reimprimindo.
- **O `AppShell` continua o dono único do hook.** Nenhuma tela monta `usePrintingBoard` (RN-06); a feature não cria um segundo consumidor do `/board` e portanto não precisa de contagem de referência no `SocketStore`.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Tipo de trabalho `board-payment` na fila, com rótulo e ícone | [#68](https://github.com/sgrande-delivery/delivery-printer/issues/68) | [68-board-payment-job-kind.md](./tasks/68-board-payment-job-kind.md) | — | pendente |
| 02 | Escutar `print_board_payment` e enfileirar o comprovante | [#69](https://github.com/sgrande-delivery/delivery-printer/issues/69) | [69-listen-print-board-payment.md](./tasks/69-listen-print-board-payment.md) | 01 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 antes porque o `PrintJobKind` é o que a 02 usa no `enqueue`; invertida, o commit da 02 não compila. A 01 sozinha deixa um tipo sem produtor por um commit — aceito: ela é inteiramente verificável (os dois `Record` fechados, o ícone desenhando como glifo), e compila e passa sozinha, que é o que `master` exige aqui.

## Dependências de outros repos

| Repo | O que precisa estar no ar | Issue |
| --- | --- | --- |
| `delivery-socket-api` | rota `POST /board-sessions/:id/payments/:paymentId/print` e o evento `print_board_payment` | [#61](https://github.com/sgrande-delivery/delivery-socket-api/issues/61) |
| `delivery-api` | documento, `GET …/receipt-content`, emissão no pagamento e rota de reimpressão | [#1466](https://github.com/sgrande-delivery/delivery-api/issues/1466) |
| `delivery-admin` | switch com default desligado e botão de reimprimir | [#1059](https://github.com/sgrande-delivery/delivery-admin/issues/1059) |

Conforme o CLAUDE.md ("Contrato cross-repo não bloqueia implementação"), as tasks daqui rodam contra o contrato da spec, sem esperar a outra ponta. **Ordem de deploy:** socket → api → printer → admin; e o printer é o lento da fila, porque a atualização só se aplica quando o operador **fecha o app pela bandeja** — fechar pela janela (X) só esconde e não produz `quit`. Até lá, o evento é emitido e ninguém o escuta: não quebra nada, e o comprovante simplesmente não sai.

## Verificação da entrega

Além de `npm run typecheck`, `npm test` e `npm run lint` (baseline: 0 erros, 1 aviso em `Login.tsx:23`):

- **O ícone, com o olho, nos dois temas.** É a parte que nenhum teste cobre: glifo ausente no recorte desenha o nome em texto e a suíte passa. Abrir a tela de Fila com um trabalho `board-payment` e olhar.
- **Um `print_board_payment` de verdade**, em dev, contra a `delivery-api` de dev — nunca contra a API real, porque o `printer_ping` registraria esta máquina como impressora do restaurante em produção.
- Empacotamento não é tocado por esta frente, então não há inspeção de asar a fazer.

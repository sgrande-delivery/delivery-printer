# 69 — Escutar print_board_payment e enfileirar o comprovante

**Issue:** [#69](https://github.com/sgrande-delivery/delivery-printer/issues/69)
**Feature:** [Imprimir o comprovante de pagamento de conta de mesa](../spec.md) — issue #67
**Tipo:** feature
**Processo:** renderer
**Depende de:** 68
**Status:** pendente

## Objetivo

Escutar `print_board_payment` no namespace `/board`, buscar o HTML pronto na `delivery-api` e entregá-lo à fila do main. É o que faz o comprovante de pagamento de mesa realmente sair na impressora do PDV.

## Contexto

- Cobre **RF-01**, **RF-02**, **RF-04**, **RF-05** e as **RN-01 a RN-04** e **RN-06** da spec.
- O `usePrintingBoard` (`src/renderer/hooks/usePrintingBoard.ts`) já faz exatamente este caminho para os outros dois documentos de mesa: o `print` (`:35-53`) busca o conteúdo, chama `enqueueReceipts` e avisa o operador nas **duas** falhas, com motivos diferentes (`SERVER_FETCH_REASON` e `QUEUE_REASON`); o efeito de `:52-67` registra os listeners e faz o `off` no cleanup.
- **O que muda:** a rota do comprovante tem um id a mais — `board-sessions/{id}/payments/{paymentId}/receipt-content` —, então ela não cabe no `Record<PrintingLayoutOptions, PrintJobKind>` de hoje (`:12-17`), que assume que o layout é sufixo do mesmo recurso. Um callback próprio ao lado do `print`, e não um "layout" que esconde outro formato de URL.
- **A armadilha já paga desta base (RN-02):** este mesmo hook ficou sem `off('print_board')` por um tempo, e cada remontagem empilhava um listener — o mesmo comprovante saindo duas, três, quatro vezes no restaurante. Todo `socket?.on` dentro de `useEffect` tem o `off` do mesmo evento no retorno, e o efeito depende de `socket`.
- **Sem `orderUuid` e fora de `MARKED_IN_API`** (RN-03/RN-04): não existe `PATCH /printed` para pagamento e não há varredura de reconexão que traga comprovante de volta. A lista de `usePrintingOrder.ts:23` é de **permissão**, não de exclusão, justamente para que um tipo novo não passe a marcar pedido como impresso por omissão — `board-payment` fica fora dela, e não há nada a alterar lá.
- **O HTML não é renderizado aqui** (RN-01): vem pronto da `delivery-api`. Nada de ler `coverage`, formatar valor ou montar layout.
- A falha **depois** do limite de tentativas já é coberta: o `onJobFailed` do `usePrintingOrder` (`:117-123`) avisa para **qualquer** tipo de trabalho, inclusive mesa. Nada a fazer lá.
- O evento é emitido pela spec [delivery-socket-api#61](https://github.com/sgrande-delivery/delivery-socket-api/issues/61) e a rota é criada pela [delivery-api#1466](https://github.com/sgrande-delivery/delivery-api/issues/1466). Conforme o CLAUDE.md, esta task **não espera** nenhuma das duas.

## Mudanças

### 1. O tipo do payload do evento

`src/renderer/types/boardPayment.ts` (novo):

```ts
// O que o delivery-socket-api emite em print_board_payment (contrato da spec 61 de lá).
export interface BoardPaymentPrintRequest {
  id: string;
  payment_id: string;
  board_number: string;
  restaurant_id: number;
  restaurant_uuid: string;
}
```

Mantido **estreito de propósito**: a resposta da API não é validada contra o tipo declarado neste repo, e declarar só o que se usa é o que impede supor um campo que pode não vir.

### 2. O callback do comprovante

`src/renderer/hooks/usePrintingBoard.ts` (alterado): um `printPayment` ao lado do `print`, com a mesma estrutura de dois estágios e dois motivos de falha:

```ts
const printPayment = useCallback(async (request: BoardPaymentPrintRequest) => {
  const label = `o comprovante de pagamento da mesa ${request.board_number}`;
  let reason = SERVER_FETCH_REASON;

  try {
    const response = await api.get<ReceiptResponse[]>(
      `board-sessions/${request.id}/payments/${request.payment_id}/receipt-content`
    );

    reason = QUEUE_REASON;

    // Sem orderUuid: não há PATCH /printed para pagamento e não há varredura que o traga de
    // volta, então não há par pedido+tipo para deduplicar. Dois eventos iguais são dois
    // comprovantes — e é o certo, porque o segundo é o painel reimprimindo.
    await enqueueReceipts(response.data, { kind: 'board-payment', source: 'event', label });
  } catch (err) {
    log.error('board payment receipt failed before reaching the queue', err, {
      boardSessionId: request.id,
      paymentId: request.payment_id,
    });

    const notice = buildPrintFailureNotice(label, null, reason);
    handleOpenRef.current(notice.body);
    window.electron.notification(notice).catch((err: unknown) => log.error('notification failed', err));
  }
}, []);
```

### 3. O listener

`src/renderer/hooks/usePrintingBoard.ts` (alterado), no efeito de `:52-67`:

```diff
     socket?.on('print_board', (session: BoardControlMovement) => {
       print(session, 'content');
     });

+    socket?.on('print_board_payment', (request: BoardPaymentPrintRequest) => {
+      printPayment(request);
+    });
+
     return () => {
       socket?.off('print_board_billing');
       socket?.off('print_board');
+      socket?.off('print_board_payment');
     };
-  }, [print, socket]);
+  }, [print, printPayment, socket]);
```

## Testes

### `src/renderer/hooks/__tests__/usePrintingBoard.test.ts` (atualizado)

O arquivo já tem o padrão de achar o handler por `mocks.socket.on.mock.calls.find(c => c[0] === 'print_board')` (`:19` e `:51`).

- Emitir `print_board_payment` busca `board-sessions/{id}/payments/{paymentId}/receipt-content` e chama `window.electron.enqueue` **uma** vez, com a resposta inteira e `kind: 'board-payment'`
- O trabalho enfileirado **não** leva `orderUuid`, e o `label` traz o número da mesa (RN-03)
- Falha no `api.get` mostra o toast com `SERVER_FETCH_REASON` e dispara `window.electron.notification`
- Falha no `enqueue` mostra uma mensagem **diferente** — o operador precisa saber se o problema foi o servidor ou o app
- `print_board` e `print_board_billing` continuam funcionando como hoje
- **Montar, desmontar, remontar e emitir uma vez enfileira uma vez** (RN-02) — o teste que prova o `off`; conferir por mutação que ele cai quando o `off('print_board_payment')` é removido

### Integração / sanity

- `npm run typecheck` sem erros.
- `npm test` passando.
- `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`).

## Critérios de aceitação

- [ ] Emitir `print_board_payment` enfileira uma vez, com a resposta inteira e `kind: 'board-payment'`
- [ ] O trabalho vai sem `orderUuid` e com o número da mesa no `label`
- [ ] Montar/desmontar/remontar e emitir **uma** vez enfileira **uma** vez (RN-02)
- [ ] As duas falhas dão mensagens diferentes, no toast **e** na notificação do sistema
- [ ] Nenhum caminho novo dispara `PATCH /orders/:uuid/printed` (RN-04)
- [ ] `print_board` e `print_board_billing` seguem com o comportamento de hoje
- [ ] `npm run typecheck` sem erros
- [ ] `npm test` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- **Varredura de reconexão** para comprovantes perdidos enquanto o PDV estava offline: não há rota de listagem de pendentes de mesa, e a spec da `delivery-api` não cria uma. A recuperação é o botão de reimprimir do painel.
- **Marcar o pagamento como impresso na API** (RN-03): não existe rota, e não é para criar.
- Mexer no `MARKED_IN_API` do `usePrintingOrder` — `board-payment` fica fora, e isso é o padrão, não uma mudança.
- Pré-visualizar o comprovante na tela de Configurações de impressão.
- Refatorar o `print`/`PrintingLayoutOptions` existente: ele continua servindo os dois documentos que já tem.

## Branch

`feat/67-board-payment-receipt-printing`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

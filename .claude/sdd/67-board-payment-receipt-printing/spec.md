# Spec — Imprimir o comprovante de pagamento de conta de mesa

**Status:** rascunho
**Criada em:** 2026-11-09
**Escopo:** renderer (com um valor novo em `src/shared/`) — cross-repo
**Issue:** [#67](https://github.com/sgrande-delivery/delivery-printer/issues/67)

## Contexto

Quando o operador recebe o pagamento de uma mesa no painel, a tela de pagamento tem um switch "Imprimir comprovante". O que a plataforma manda imprimir hoje nesse switch é a **conta inteira** — o mesmo documento do botão "imprimir conta" —, e nem isso chega ao PDV, porque o payload que a `delivery-api` manda ao socket não leva `restaurant_uuid` e o evento acaba numa sala vazia. O operador liga o switch, cobra, e não sai papel.

A `delivery-api` está criando um documento próprio para isso ([delivery-api#1466](https://github.com/sgrande-delivery/delivery-api/issues/1466)) e o `delivery-socket-api` um evento próprio ([#61](https://github.com/sgrande-delivery/delivery-socket-api/issues/61)). Deste lado falta escutar esse evento e colocar o comprovante na fila.

O app já faz exatamente isso para dois outros documentos do mesmo namespace: `print_board` e `print_board_billing`, em `src/renderer/hooks/usePrintingBoard.ts:54-58`. A frente é o terceiro caso do mesmo hook — **e um tipo de trabalho novo na fila durável**, porque a Fila, o Histórico e o aviso de falha nomeiam o papel pelo `kind` (`src/renderer/helpers/receiptKind.ts:6-12`), e "Conta da mesa" para um comprovante de pagamento manda o operador conferir o documento errado.

## Objetivo

O comprovante de pagamento de mesa sai na impressora do PDV quando o painel registra o pagamento, e aparece na Fila, no Histórico e nos avisos de falha com nome e ícone próprios.

## Requisitos funcionais

- **RF-01** — O renderer escuta `print_board_payment` no namespace `/board` e, ao recebê-lo, busca `GET board-sessions/{id}/payments/{payment_id}/receipt-content` na `delivery-api`.
- **RF-02** — A resposta inteira é entregue à fila do main em uma chamada, com `kind: 'board-payment'`, `source: 'event'` e `label` `o comprovante de pagamento da mesa <board_number>`.
- **RF-03** — A fila passa a conhecer o tipo `board-payment`, com rótulo e ícone próprios na Fila e no Histórico.
- **RF-04** — Falha ao buscar o conteúdo, ou ao enfileirar, avisa o operador pelo toast **e** pela notificação do sistema, como os demais documentos de mesa.
- **RF-05** — O listener tem `off` no cleanup do efeito, e remontar o componente não duplica a impressão.

## Regras de negócio

- **RN-01 — Comprovante não é renderizado aqui.** O HTML vem pronto da `delivery-api`; este app grava em arquivo temporário e manda para a impressora. Não montar layout, não ler `coverage`, não formatar valor. Se o papel sair errado, o defeito está no `content` que veio — e a verificação é olhar a resposta, não mexer em componente.
- **RN-02 — Todo `socket?.on` dentro de `useEffect` tem o `off` do mesmo evento no retorno.** É a armadilha já paga desta base: o `usePrintingBoard` ficou sem `off('print_board')` por um tempo e cada remontagem empilhava um listener, imprimindo o mesmo comprovante duas, três, quatro vezes. Verificável por teste: montar, desmontar, remontar, emitir uma vez, contar as chamadas.
- **RN-03 — Comprovante de pagamento não marca nada na `delivery-api`.** Diferente do pedido, não há `PATCH /printed` e não há varredura de reconexão que o traga de volta. A fila em disco é a **única** recuperação, e por isso o trabalho vai sem `orderUuid`: não há par pedido+tipo para deduplicar, e dois eventos iguais são dois comprovantes — que é o certo, porque o segundo evento é alguém apertando "reimprimir" no painel.
- **RN-04 — Tipo novo na fila não entra em `MARKED_IN_API`.** A lista de `usePrintingOrder.ts:23` é de **permissão**, não de exclusão, exatamente para que um tipo novo não passe a marcar pedido como impresso por omissão. `board-payment` fica fora dela.
- **RN-05 — Ícone novo exige regerar o recorte da fonte.** A união `IconName` (`src/renderer/base/Icon.tsx:6`) e o `icon_names` do recorte (`src/renderer/fonts/README.md`) são a **mesma** lista. Nome novo só na união aparece como texto na tela, sem erro em lugar nenhum.
- **RN-06 — O `SocketStore` do `/board` é singleton de módulo e só um componente o usa.** O `AppShell` é o dono único dos hooks de impressão; nenhuma tela monta `usePrintingBoard`. Se alguma vier a montar, o `disconnect()` do cleanup de um derruba o socket do outro — aí é contagem de referência no store, e está escrito no plan.
- **RN-07 — O contrato da outra ponta não bloqueia esta implementação.** As specs da `delivery-api` e do `delivery-socket-api` são o contrato; esta spec implementa contra ele sem esperar o deploy de lá. O que vai no relatório do `/ship` é a ordem de deploy — e que a atualização só chega ao PDV quando o operador fecha o app pela bandeja, o que pode levar dias.

## Contrato com os outros repos

**Evento que este app passa a escutar** — namespace `/board`, emitido pelo `delivery-socket-api`:

```ts
// print_board_payment
{
  id: string;              // uuid da sessão de mesa
  payment_id: string;      // uuid do pagamento
  board_number: string;    // "010" — entra no label do aviso
  restaurant_id: number;
  restaurant_uuid: string;
}
```

**Rota que este app passa a consumir** — `delivery-api`:

`GET board-sessions/{id}/payments/{payment_id}/receipt-content` → `200` com `[{ content, copies, device_name }]`, o mesmo `ReceiptResponse` de `src/renderer/services/printQueue.ts:5-9`.

## Fora do escopo

- **Renderizar ou conferir o conteúdo do comprovante** (RN-01). O que sai no papel é decisão e código da `delivery-api`.
- **Pré-visualizar o comprovante** na tela de Configurações de impressão. As pré-visualizações de lá são dos documentos de pedido; acrescentar esta é task própria.
- **Marcar o pagamento como impresso na API** (RN-03). Não existe rota para isso e a spec da `delivery-api` não cria uma.
- **Varredura de reconexão** para comprovantes perdidos enquanto o PDV estava offline. Não há rota de listagem de pendentes para mesa, e a spec da `delivery-api` não cria uma — a recuperação é o botão de reimprimir do painel.
- **Roteamento por impressora.** A `delivery-api` devolve `device_name: null`, isto é, impressora padrão do sistema, como já faz para a conta de mesa.
- **Mexer em `print_board` e `print_board_billing`.** Continuam como estão.

## Critérios de aceitação

- [ ] Emitir `print_board_payment` no socket `/board` faz o app buscar `board-sessions/{id}/payments/{payment_id}/receipt-content` e chamar `window.electron.enqueue` uma vez, com a resposta inteira e `kind: 'board-payment'`
- [ ] Montar, desmontar e remontar o componente dono do hook, e então emitir o evento **uma** vez, enfileira **uma** vez (RN-02)
- [ ] Falha na busca do conteúdo mostra o toast e dispara a notificação do sistema, com o número da mesa no texto
- [ ] Falha ao enfileirar mostra uma mensagem **diferente** da falha de busca — o operador precisa saber se o problema foi o servidor ou o app
- [ ] Um trabalho `board-payment` na fila aparece na tela de Fila e no Histórico com rótulo e ícone próprios, e o ícone **desenha como ícone**, não como texto (RN-05)
- [ ] `board-payment` não dispara `PATCH /orders/:uuid/printed` em nenhum caminho (RN-04)
- [ ] `npm run typecheck` sem erros, `npm test` passando, `npm run lint` sem erro novo

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Ícone do tipo `board-payment` | Acrescentar `payments` à união `IconName` **e** ao `icon_names` do recorte, regerando o `.woff2` pela receita do `fonts/README.md` (o hash do arquivo muda, e isso é esperado). Se a regeração não for possível na hora da execução, reusar `receipt_long` e abrir issue — nunca deixar um nome fora do recorte. |
| 2 | Rótulo na Fila e no Histórico | `Pagamento`. Os rótulos vizinhos são de uma palavra (`Produção`, `Expedição`, `Mesa`), e a coluna é estreita; "Comprovante de pagamento" quebraria a linha. O número da mesa já aparece no `label` do trabalho. |

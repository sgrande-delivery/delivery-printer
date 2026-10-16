# Spec — Fila durável de impressão com retry

**Status:** rascunho
**Criada em:** 2026-10-15
**Escopo:** main+renderer
**Issue:** [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)

## Contexto

Impressão perdida hoje é perdida. O caminho é direto e sem rede: o evento de socket chega ao renderer, o hook busca o HTML na API e chama `window.electron.rawPrint(...)`; se o `rawPrint` rejeita, o `catch` faz `console.error` e o trabalho desaparece.

O que existe de recuperação cobre **um** caso de quatro: `GET /orders/print/list` na reconexão (`src/renderer/hooks/usePrintingOrder.ts:54-67`) reimprime pedidos que a API ainda considera não impressos. Não existe nada equivalente para:

- **`printShipment`** — o layout `print-dispatched` do mesmo pedido; a varredura só pede `print-created`
- **`print_board`** e **`print_board_billing`** (`src/renderer/hooks/usePrintingBoard.ts`) — comprovante de mesa não é marcado em lugar nenhum da API, e o evento passou, acabou

E mesmo o caso coberto só funciona se o app estiver **aberto e conectado**: evento que chega com o app fechado, PDV desligado ou impressora sem papel não deixa rastro.

Uma agravante medida: `src/renderer/hooks/usePrintingOrder.ts:33` não aguarda a marcação `printed`, então falha ali faz o pedido **reimprimir** na próxima varredura. A spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) corrige o `await` e põe uma guarda em memória; uma guarda em memória morre no restart, que é exatamente quando a fila importa.

## Objetivo

Todo trabalho de impressão sobrevive a app fechado, PDV reiniciado e impressora indisponível, sai **uma** vez, e o que não sai fica visível para alguém resolver.

## Requisitos funcionais

- **RF-01** — Os quatro eventos de impressão enfileiram em disco antes de imprimir.
- **RF-02** — A fila é processada com retry em backoff, no boot e a cada reconexão.
- **RF-03** — O mesmo trabalho não imprime duas vezes, inclusive depois de restart.
- **RF-04** — Trabalho que falha além do limite fica `failed` e aparece na tela, com retry manual.
- **RF-05** — A marcação `PATCH /orders/:uuid/printed` é parte do trabalho: só depois de imprimir, e falha dela não causa reimpressão.

## Regras de negócio

- **RN-01** — **A fila mora no processo principal.** Ele tem `fs`, sobrevive ao recarregamento da janela e é único por instância (o single-instance lock garante isso). Fila no renderer morreria em cada reload e duplicaria se houvesse duas janelas.
- **RN-02** — **Escrita atômica, sempre.** O PDV é desligado na tomada: arquivo meio escrito na volta é pior que arquivo nenhum. Arquivo temporário + `rename`, e corrupção detectada é descartada com log, não propagada.
- **RN-03** — **Imprimir é a operação que não pode repetir; marcar é a que pode.** `PATCH /printed` é idempotente do lado da API; `rawPrint` não é. Então a ordem é imprimir, registrar que imprimiu e **depois** marcar, com retry só na marcação.
- **RN-04** — **A fila é limitada em tamanho e em idade.** Comprovante de ontem não interessa a ninguém, e disco cheio num PDV é incidente pior que o original.
- **RN-05** — **Pendente é informação; falhado é alerta.** A UI precisa diferenciar, porque "três na fila" durante o almoço é normal e "um falhado" exige alguém.
- **RN-06** — **Nada de fila silenciosa.** Toda transição (enfileirado, impresso, falhado, descartado por idade) vai para o log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11). É o que torna a fila verificável em campo.

## Fora do escopo

- Reimprimir por pedido do painel (o admin não tem esse botão hoje; se tiver, é contrato novo).
- Fila compartilhada entre máquinas: cada PDV tem a sua, e isso é proposital.
- `printer:status` com contadores — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25).
- Interface de histórico de impressão: a fila guarda o que está em voo e o que falhou, não um relatório.

## Critérios de aceitação

- [ ] Impressora desligada: o trabalho fica pendente e sai quando ela volta, **uma** vez.
- [ ] App fechado durante o pico: ao abrir, a fila do disco é processada.
- [ ] Pedido já impresso não sai de novo depois de restart, mesmo que a API ainda o liste como não impresso.
- [ ] Comprovante de mesa perdido por impressora offline é recuperado — o que hoje não acontece de jeito nenhum.
- [ ] Trabalho que falha além do limite aparece na tela e tem retry manual que funciona.
- [ ] Arquivo de fila corrompido não impede o app de abrir, e o descarte está no log.
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo.

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Guardar o HTML do comprovante na fila, ou só a referência e rebuscar na API | **Guardar o HTML.** Rebuscar parece mais limpo, mas o motivo mais comum de falha é a impressora, não a rede — e rebuscar depois de horas pode trazer conteúdo diferente (pedido editado), imprimindo algo que não é o que o cliente levou. O custo é disco, e a RN-04 o limita |
| 2 | Limite de idade do trabalho | 24 h, e descarte registrado no log. Comprovante de ontem não serve, e manter dá a falsa impressão de que vai sair |

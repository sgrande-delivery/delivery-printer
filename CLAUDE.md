# delivery-printer — CLAUDE.md

> **Escopo deste arquivo.** Ele cobre só o que vale para toda a plataforma SGrande Delivery: o modelo de versões (v1 × v2) e como contrato entre repos se resolve. A arquitetura deste app **não está documentada aqui** — ela está no `CLAUDE.md` da branch que carrega o trabalho recente (instalador Windows, fila de impressão, ajustes pelo PDV), que ainda não foi mergeada nesta `master`.

## O que é este app

App Electron que imprime o comprovante do pedido na impressora local do restaurante. O contrato dele tem três passos, e **nenhum deles lê a estrutura do pedido**: recebe a identidade pelo socket (`uuid`, `sequence`), busca o **HTML já renderizado** por HTTP na `delivery-api` e manda cru para a impressora — `src/renderer/hooks/usePrintingOrder.ts`, que lê da resposta apenas `content`, `copies` e `device_name` (linhas 11-14).

É esse desenho que torna o app agnóstico de versão, e é por isso que ele não ganha uma versão v2.

## A v1 e a v2 da plataforma — e por que não existe versão v2 deste app

A `delivery-api`, o `delivery-admin` e o `delivery-client` estão num corte para a **v2**, e **a v1 não acaba nele**: as duas versões atendem produção em paralelo enquanto os restaurantes migram, um a um, sem data para o fim da v1. A API publica as rotas v2 no mesmo deploy da v1, com chave por restaurante (`uses_v2_orders`) decidindo qual caminho serve cada loja; o painel e o app do cliente ficam com **dois apps no ar**, um da `master` (v1) e um da branch v2.

**Este app atende as duas versões sem build próprio, e não é para criar um.** Medido em 2026-10-19 contra a `feature/product-engineering-rebased` da `delivery-api`:

- **As quatro rotas que este app consome não são versionadas** e respondem para pedido de qualquer versão, porque operam sobre as mesmas tabelas: `GET /orders/{uuid}/print-created`, `GET /orders/{uuid}/print-dispatched`, `PATCH /orders/{uuid}/printed` (`app/Modules/Order/routes/admin-routes.php:35-38`) e `GET /orders/print/list` (`:55`, SQL cru sobre `orders` + `order_status` + `order_printed`).
- **O id público de um pedido v2 é a coluna `orders.uuid`** — o mesmo `uuid` que este app recebe no socket e usa na URL (`core/Order/V2/Infra/DB/Eloquent/OrderRepository.php:168`, `where('uuid', ...)`). Não há dois espaços de identidade.
- **A v2 foi adaptada a este contrato, não o contrário.** A spec [delivery-api#1220](https://github.com/sgrande-delivery/delivery-api/issues/1220) (entregue em 2026-10-15) fez o despacho v2 emitir `uuid`, `sequence` e `restaurant_uuid` nos mesmos eventos (`printOrder`, `printShipment`) e na mesma sala, e registrou no plan: *"`delivery-printer` — nada a fazer"*.
- **O status `'o'` é o mesmo nas duas** (`OrderStatusV2Enum::OPEN = 'o'`), então a varredura de reconexão (`GET /orders/print/list`) também acha pedido v2.

**O que está incompleto é o HTML, e o conserto é na `delivery-api`.** O payload de um pedido v2 é renderizado pelo pipeline v1 (`LegacyPrintBridge` → `PrintCreatedOrderUseCase` → `resources/views/socket/order/`), cujas views leem `additional`, `ingredients` e `complement_categories` — relações **legadas** que o repositório v2 nunca grava: ele persiste só `order_product_usages`. Resultado: **comprovante de pedido v2 sai com nome, quantidade, preço e anotação, e sem complementos, adicionais e ingredientes.** O diagnóstico já está escrito lá, na task `API-155` (issue [delivery-api#365](https://github.com/sgrande-delivery/delivery-api/issues/365), severidade alta), que **nunca foi executada** e está no fluxo `.claude/tasks/` aposentado — precisa renascer como spec SDD na `delivery-api`.

Três consequências para quem trabalha aqui:

- **Comprovante v2 saindo sem complemento não é bug deste repo.** Não "consertar" aqui montando layout, lendo `usages` ou pedindo outra rota: a impressão não é renderizada neste app (ver "O que é este app"), e a correção é no renderizador da `delivery-api`.
- **Não criar versão, branch, build ou flag v2 deste app**, e não perguntar se é para criar: a resposta é não. O contrato deste app — identidade pelo socket, HTML por HTTP, impressão crua — é agnóstico de versão por desenho, e é o que o mantém assim.
- **O campo `removed_ingredients_line`**, que a rota v2 `GET /orders/v2/{publicId}/print-payload` acrescenta, é descartado aqui: a resposta é lida como `content`, `copies` e `device_name`. Passar a renderizá-lo é decisão de produto com task própria, não limpeza.

## Contrato cross-repo não bloqueia implementação

Feature que atravessa repos tem **spec nos dois lados**, e cada uma carrega o contrato inline: a daqui diz o que este app consome e espera; a da `delivery-api` diz o que ela publica. Esse par **é** o contrato — não há etapa de aprovação depois dele, e não há nada a esperar.

- **Implementar contra o contrato da spec, sem esperar a outra ponta entregar**, e sem trocar implementação por mock, stub ou TODO.
- **Não parar para perguntar se pode seguir.** Quem escreveu a spec já decidiu o que é para fazer; perguntar o que a task já responde é retrabalho para o dev, não cuidado.
- **O aviso vai no relatório:** que a impressão só fecha ponta a ponta quando a outra ponta subir, e a ordem de deploy quando ela importa.
- **Motivo real para parar:** as duas specs divergirem no contrato (campo, rota, nome de evento, unidade). Aí o contrato não existe de fato, e quem decide qual lado muda é o dev. Ausência de implementação do outro lado **não** é divergência.

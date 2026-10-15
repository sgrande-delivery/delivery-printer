# 22 — Editar a impressora na API, com 403 tratado

**Issue:** [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 21
**Status:** pendente

## Objetivo

Deixar o operador corrigir no PDV o cadastro da impressora — principalmente o `name`, **escolhido da lista real do Windows** —, gravando em `PUT /api/admin/printers/{id}`.

## Contexto

- `PUT /api/admin/printers/{id}` existe (`app/Modules/Printer/routes/admin-routes.php`), sob `role:printer`, e o contrato de entrada é o `UpdatePrinterRequest` da API
- Campos: `name` (o device do Windows, RN-02), `copies`, `station`, `paper_width` (58 ou 80), `activated`. `address` é informativo do painel e **não** é editado aqui (fora do escopo da spec)
- `station` tem **sete** valores na API — `kitchen`, `bar`, `pizza`, `counter`, `cashier`, `dessert`, `sushi` (`core/Printer/Domain/Enums/PrinterStationEnum.php`) — contra quatro no tipo do `delivery-admin`. Seguir a API (decisão pendente 3 da spec)
- `PATCH /printers/{id}/toggle-active` é o caminho de ativar/desativar; usar ele em vez de mandar `activated` no `PUT`, se o contrato do `PUT` não o aceitar — confirmar no `UpdatePrinterRequest` antes
- Cobre a **RF-03**, a **RN-02** e a **RN-04**
- 403 por falta de permissão precisa impedir o formulário de "salvar" e perder a alteração (RN-04)
- Aqui também se resolve a **decisão pendente 1** da spec: o que o `onRawPrint` faz quando o nome não casa. Hoje imprime na padrão, calado. A proposta é **falhar visível** — mas isso muda comportamento em produção, então entra só com confirmação do dev, e com a tela de diagnóstico já no ar

## Mudanças

### 1. Edição

`src/renderer/services/printers.ts` (alterado): `updatePrinter(id, payload)` e `togglePrinterActive(id)`.

`src/renderer/components/printers/PrinterForm.tsx` + `.module.css` (novos): formulário por impressora, com o `name` num **select** alimentado por `window.electron.listPrinters()` — nunca texto livre (RN-02). `copies` numérico com mínimo 1, `station` e `paper_width` como selects com os valores da API.

### 2. Retorno ao operador

Sucesso e falha pelo `useMessaging()`. 403 com texto explícito sobre permissão. Erro de validação da API mostrado com a mensagem que ela devolve, não com texto genérico.

### 3. Fallback da impressora não encontrada (sob confirmação)

`src/main/ipc-events/onRawPrint.ts` (alterado, **se** o dev confirmar): nome que não casa passa a rejeitar com motivo claro em vez de imprimir na padrão. Com a spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) na base, isso aparece na tela e no log; com a [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15), vira trabalho `failed` recuperável.

Se o dev não confirmar, a task entrega só a edição, e a decisão fica registrada como pendente no `plan.md`.

## Testes

### `src/renderer/components/printers/__tests__/PrinterForm.test.tsx` (novo)

- O campo de nome é um select com as impressoras da máquina; não aceita valor fora da lista
- Salvar chama `PUT` com o payload esperado
- 403 mostra a mensagem de permissão e o formulário não finge ter salvo
- Erro de validação da API aparece como veio
- `expectNoUndefinedClasses(container)`

### `src/main/__tests__/onRawPrint.test.ts` (novo, se a mudança do fallback entrar)

- `deviceName` que não casa **rejeita** com motivo, e não imprime
- `deviceName` nulo continua indo para a padrão (comportamento desejado de restaurante com uma impressora só)
- Mutação: voltando o fallback silencioso, o teste cai

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: corrigir o nome e ver o comprovante seguinte sair na impressora certa; conferir no painel que o cadastro mudou

## Critérios de aceitação

- [ ] O nome só pode ser escolhido da lista real da máquina
- [ ] Corrigir o nome faz o comprovante seguinte sair na impressora certa
- [ ] 403 não perde a alteração nem mente sobre ter salvo
- [ ] `station` oferece os sete valores da API
- [ ] Se o fallback mudou, há teste que cai ao reintroduzir o silencioso; se não mudou, a pendência está registrada no `plan.md`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Criar e excluir impressora
- Editar `address`
- Configurações do restaurante (`printerSettings`) — task [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23)

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

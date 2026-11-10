# 25 — Emitir `printer:status` por impressora

**Issue:** [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 20
**Status:** bloqueada (socket-api#50 aberta em 2026-10-15)

## Objetivo

Passar a emitir `printer:status` por impressora física, no formato que o `delivery-admin` já espera, para a coluna de status do painel deixar de ficar permanentemente vazia.

## Contexto

- O admin **já escuta**: `components/printers/hooks/usePrintersLiveStatus.ts`, payload `{ printer_id, status, last_print?, jobs_today?, jobs_week? }`, `status` em `online | offline | paper_low | no_paper | overheat | paused`, e alerta em tela para `offline`, `no_paper` e `overheat`. O nome do evento tem **dois-pontos** — `printer:status`, não `printer_status` como a `PRINTER-001` rascunhou
- **Bloqueada por outro repo:** o `delivery-socket-api` repassa só evento com `@SubscribeMessage` declarado (`src/nestjs/modules/restaurant/restaurant.gateway.ts` tem `printer_ping` e `printer_exited`). Sem o relay, a emissão **não chega a ninguém**. Issue aberta: [sgrande-delivery/delivery-socket-api#50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50), pedindo o espelho do `printerPing`, com a mesma validação de `restaurant_uuid`
- Emitir pelo socket do renderer, no `/admin` — o autenticado, mesma razão da spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1): identidade vem do handshake
- **RN-07: não emitir o que o app não sabe.** `no_paper` e `overheat` não são observáveis pela API do Electron. O que dá para saber:
  - `online` / `offline` — a impressora cadastrada resolve (ou não) para um device presente na lista do Windows (task [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20))
  - `offline` também depois de falha de impressão nela
  - `last_print` — o horário da última impressão bem-sucedida nesta sessão
  - `jobs_today` / `jobs_week` — contadores **voláteis** em memória, por decisão da FIX-011 da `delivery-api`, que removeu as colunas do banco. Reiniciar o app zera, e isso é aceitável por aquela decisão
  - Se o `status` do `getPrintersAsync` trouxer algo útil no Windows (a task [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20) registra o shape observado), usar; senão, não inventar
- Throttle mínimo entre emissões do mesmo status por impressora, para não inundar o painel (a `PRINTER-001` sugere 1 s)
- Cobre a **RF-06** e a **RN-07**

## Mudanças

### 1. Hook de status

`src/renderer/hooks/usePrinterStatusReporter.ts` (novo): cruza as cadastradas com os devices (reusando o `usePrinters` da task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)), mantém os contadores em memória, aplica o throttle e emite no socket do `/admin`.

Gatilhos: conexão do socket, mudança na lista de devices, conclusão ou falha de impressão, e um heartbeat no mesmo intervalo do `printer_ping` (30 s, `useAdminSocketEvents.ts:38`).

### 2. Payload

`{ restaurant_uuid, printer_id, status, last_print?, jobs_today?, jobs_week? }`. O `restaurant_uuid` entra porque é o que o gateway valida contra a sala do socket — sem ele, o relay responde `IGNORED`.

## Testes

### `src/renderer/hooks/__tests__/usePrinterStatusReporter.test.ts` (novo)

- Impressora que resolve emite `online`; que não resolve emite `offline`
- **Nunca** emite `no_paper` nem `overheat` (RN-07) — teste explícito, porque é regra de "o que não fazer"
- Throttle: duas mudanças iguais em sequência produzem uma emissão
- Falha de impressão numa impressora emite `offline` para aquele `printer_id`
- Contadores sobem com impressão concluída, e zeram em nova sessão

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- **Com o relay no ar:** desligar uma impressora e ver o painel marcá-la offline; conferir no log do socket-api `OK` e não `IGNORED`

## Critérios de aceitação

- [ ] O painel mostra online/offline por impressora
- [ ] Nenhum status que o app não sabe é emitido
- [ ] O throttle impede enxurrada
- [ ] O log do `delivery-socket-api` registra `OK`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Bloqueio

Esta task **não pode ser verificada** antes de [socket-api#50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50) estar publicado. Se chegar a vez dela antes disso, o `/execute` a marca `⛔ bloqueada` e fecha a spec sem ela — implementar às cegas daria uma emissão que ninguém recebe e nenhum critério verificável.

## Fora de escopo

- Persistir contadores (as colunas foram removidas pela FIX-011)
- Detectar papel ou temperatura
- `paused`, que é estado lógico do painel, não do app
- O relay em si, que é do `delivery-socket-api`

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

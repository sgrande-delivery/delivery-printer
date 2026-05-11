---
id: PRINTER-001
title: Emitir `printer_status` por impressora física + escutar `print_test`
status: 🟡 Planejada
repo: delivery-printer
created_at: 2026-05-11
related: []
issues: []
blocked_by: []
blocks: [ADMIN-077, FIX-011]
severity: medium
---

## Contexto

A `delivery-api` originalmente tinha implementado telemetria de impressoras via REST (`POST /internal/printers/{id}/telemetry` em API-071). **Decisão revertida** em FIX-011 do `delivery-api` em favor da arquitetura socket que **já existe e funciona** neste app: o `delivery-printer` já está conectado ao namespace `/admin` do `delivery-socket-api` (`useAdminSocketEvents.ts`), emite `printer_ping` a cada 30s pra heartbeat do restaurante.

Esta task estende o app pra:

1. **Emitir status detalhado por impressora física** via novo evento `printer_status` (não só "estou vivo").
2. **Escutar `print_test`** vindo do admin → disparar impressão de teste na impressora apontada.

Sem persistência backend — contadores ficam volatile no app. Status reload do admin = "Sem dados" até o próximo evento (≤30s do `printer_ping`). Aceitável conforme decisão #3 da FIX-011.

## Estado atual

- App Electron v2.6.0 conectado em `${WS_BASE_URL}/admin` via `socket-store.ts`.
- `useAdminSocketEvents.ts` emite `printer_ping` a cada 30s com `{ restaurant_id, restaurant_uuid, version }`.
- `useAdminSocketEvents.ts` emite `printer_exited` no `before-quit`.
- Hooks de impressão: `usePrintingOrder`, `usePrintingReceipt`, `useReceiptSocket`, `usePrintingBoard` — escutam eventos e processam jobs.
- Sem evento de status por impressora física individual hoje. Sem listener de "imprimir teste".

## Decisões já fechadas

| # | Tema | Decisão |
|---|------|---------|
| 1 | Granularidade do status | **Por impressora física** (printer_id do backend, não por máquina). Uma máquina pode ter N impressoras conectadas. |
| 2 | Counters | **Volatile in-memory** no app (Map por printer_id). Reset a cada restart do app. |
| 3 | Eventos que disparam emit | (a) impressão concluída (incrementa counter, emite); (b) papel acabou (driver detecta); (c) impressora desconectou; (d) heartbeat 30s (mesmo intervalo do printer_ping). |
| 4 | Status enum | `online | offline | no_paper | overheat` (alinhado com `PrinterStatusEnum` do delivery-api antigo, sem `paused` que é estado lógico do admin). |
| 5 | Test-print | Admin emit `print_test`. App escuta, valida que tem impressora pro `printer_id` indicado, manda página de teste (texto curto: "TESTE — Impressora #X — timestamp"), emite `printer_status` confirmando o job. |
| 6 | Throttle de re-emit | Mínimo 1s entre emits do mesmo `printer_status` pra mesmo printer_id (evitar flood). |
| 7 | Mapeamento printer_id ↔ impressora física | Vem do form admin (`station`, `paper_width`, `copies` + `address` IP/USB). App lê config local OU faz fetch via REST do delivery-api (`GET /printers`). |

## 1. Novo evento `printer_status`

Emitido pra socket no namespace `/admin` (já conectado).

```ts
socket.emit('printer_status', {
  restaurant_uuid: '01HX-...',
  printer_id: 12,
  status: 'no_paper',         // online | offline | no_paper | overheat
  last_print: '2026-05-11T12:34:56-03:00',  // ISO 8601, opcional
  jobs_today: 84,             // counter local in-memory (cumulative since app start ou desde última meia-noite)
  jobs_week: 612,             // counter local (rolling 7d se app rodou contínuo, senão = jobs_today)
  emitted_at: '2026-05-11T12:34:56-03:00',
});
```

### Quando emitir

- **Após cada job impresso** (incrementa `jobs_today`/`jobs_week` antes de emitir).
- **Mudança de status** detectada pelo driver (papel acabou, overheat, desconectou).
- **Heartbeat**: junto com cada `printer_ping` (a cada 30s), emit `printer_status` por cada impressora conectada com status atual.
- **Test-print recebido** (depois de processar — ver §2).

### Implementação sugerida

Novo hook `usePrinterStatusEmitter.ts`:

```ts
export function usePrinterStatusEmitter(printers: LocalPrinter[]) {
  const { socket, isConnected } = useAdminSocket();
  const restaurant = useSelector(s => s.restaurant);

  useEffect(() => {
    if (!isConnected || !restaurant?.uuid) return;

    const emitAll = () => {
      printers.forEach(p => {
        socket?.emit('printer_status', {
          restaurant_uuid: restaurant.uuid,
          printer_id: p.id,
          status: p.detectStatus(),  // 'online' | 'no_paper' | etc
          last_print: p.lastPrintAt?.toISOString() ?? null,
          jobs_today: p.counters.today,
          jobs_week: p.counters.week,
          emitted_at: new Date().toISOString(),
        });
      });
    };

    emitAll();
    const interval = setInterval(emitAll, 30_000);
    return () => clearInterval(interval);
  }, [isConnected, printers, restaurant, socket]);
}
```

E em todo lugar que conclui job (`usePrintingOrder`, `usePrintingReceipt`, etc), incrementa `printer.counters` E re-emit imediato.

## 2. Listener `print_test`

Admin emite quando clica "Imprimir teste" na lista de impressoras:

```ts
// admin (delivery-admin)
socket.emit('print_test', {
  restaurant_uuid: restaurant.uuid,
  printer_id: 12,
  triggered_by: { user_id: 327, user_name: 'Carla' },  // pra log
});
```

App escuta e processa:

```ts
useEffect(() => {
  socket?.on('print_test', async (payload) => {
    if (payload.restaurant_uuid !== restaurant.uuid) return;  // defensive

    const printer = findPrinterById(payload.printer_id);
    if (!printer) {
      socket?.emit('printer_status', {
        ...basePayload(printer),
        status: 'offline',
        message: `Impressora ${payload.printer_id} não encontrada localmente`,
      });
      return;
    }

    try {
      await printer.print(buildTestPageHtml(payload.triggered_by));
      printer.counters.today += 1;
      socket?.emit('printer_status', {
        restaurant_uuid: restaurant.uuid,
        printer_id: printer.id,
        status: 'online',
        last_print: new Date().toISOString(),
        jobs_today: printer.counters.today,
        jobs_week: printer.counters.week,
        emitted_at: new Date().toISOString(),
      });
    } catch (e) {
      socket?.emit('printer_status', {
        restaurant_uuid: restaurant.uuid,
        printer_id: printer.id,
        status: detectErrorStatus(e),  // 'no_paper' | 'offline' | etc
        emitted_at: new Date().toISOString(),
      });
    }
  });

  return () => {
    socket?.off('print_test');
  };
}, [socket, restaurant]);
```

## 3. Página de teste

Conteúdo curto formatado pra impressora térmica 80mm/58mm:

```
====================================
       TESTE DE IMPRESSÃO
====================================
Impressora #12
Solicitado por: Carla
2026-05-11 12:34:56
====================================

Se você está lendo isso,
sua impressora está OK!

====================================
```

Reusar layout existente em `src/renderer/components/printing-layouts/` se houver template "test", senão criar um simples.

## Critérios de aceitação

- [ ] Novo hook `usePrinterStatusEmitter` registrado em `App.tsx` ou similar.
- [ ] `printer_status` emitido a cada 30s (heartbeat) por cada impressora física conectada.
- [ ] `printer_status` emitido imediatamente após cada job concluído.
- [ ] `printer_status` emitido na mudança de status (papel acabou, overheat).
- [ ] Listener `print_test` recebe + processa + emite confirmação.
- [ ] Counter `jobs_today` / `jobs_week` in-memory por printer_id, incrementado em todo print.
- [ ] App lê lista de printers via fetch ao backend (`GET /api/admin/printers`) ou config local; mapeia `printer_id` → driver físico.
- [ ] Throttle 1s entre emits do mesmo printer_status.
- [ ] Sem regressão em `printer_ping`, `printer_exited`, `print_nfce_receipt`, `print_board_billing`.

## Não faz parte do escopo

- **Persistência local** dos counters (SQLite) — fica pra task futura se vira problema.
- **Reset diário automático** dos counters — pode acumular forever; admin filtra por dia se quiser.
- **Reconnect automático** ao mudar de impressora física (USB hot-plug) — fora.
- **Alertas locais** (notification do Electron) — admin (browser) cuida disso ao receber socket.

## Branch e merge

- Convenção do repo: validar com mantenedor.
- **Pre-release**: minor bump (feature significativa de telemetria + listener novo).

## Estimativa

- 2-3 sessões.
- Sensível: descobrir como o app atual mapeia "impressora física" pra `printer_id` do backend (pode ser via `address` ou config separada).

## Riscos monitorados

| Risco | Mitigação |
|-------|-----------|
| `printer_status` emit a cada job pode floodar socket-api se restaurante imprime > 100/min | Throttle 1s + batch (acumula deltas e emite agregado a cada N segundos). |
| Driver de impressora térmica não expõe "papel acabou" / "overheat" de forma confiável | Best-effort: detecta "offline" via timeout, demais via try/catch no comando de impressão. |
| App reinicia → counters zerados → admin vê queda | Aceitável conforme decisão #2 (volatile). Admin pode comparar com cron diário do delivery-api se quiser histórico (mas FIX-011 removeu cron). Se virar problema, abrir task pra SQLite local. |
| Mapeamento `printer_id` ↔ driver físico erra (mais de uma impressora com mesmo address) | Validar via test manual; fallback emit `printer_status` com `status: offline` se não achar match. |

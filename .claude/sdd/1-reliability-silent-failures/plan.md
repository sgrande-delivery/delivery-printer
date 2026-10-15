# Plan — Tirar as falhas silenciosas do app de impressão

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1)
**Branch de trabalho:** `feat/1-reliability-silent-failures`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

As cinco falhas não se encostam, então a spec é deliberadamente de tasks independentes — a única ordem que importa é a do commit, para o review de cada uma ficar legível.

Duas tocam o **processo principal** (início automático e o socket morto), três tocam o **renderer** (marcação do pedido, estado de conexão, error boundary). A única que atravessa a fronteira é a do `printer_exited`, que precisa de um canal IPC do main **para** o renderer — o primeiro deste app, já que hoje todos os canais vão na direção oposta (`src/main/preload.ts:10`).

O que será reaproveitado:

- `useMessaging()` (`src/renderer/providers/messaging.tsx`) para aviso ao operador — já montado na árvore, nunca usado pelos hooks
- `authenticated` e `loading` do `AuthProvider` (`src/renderer/providers/auth.tsx:93`), que já existem e não são consumidos por ninguém
- `useAdminSocket()` (`src/renderer/hooks/useAdminSocket.ts`), o socket autenticado que já emite `printer_ping` com sucesso
- os primitivos de `src/renderer/base/` para as telas de erro e de sem conexão

## Decisões arquiteturais

- **O `printer_exited` passa a sair do renderer, não do main.** A alternativa seria conectar o main ao `/admin` com credencial, replicando no main a autenticação por cookie que o renderer já tem. O renderer já está conectado e autenticado; o main só precisa pedir, e esperar.
- **O socket da raiz no main é removido, com os dois canais que existiam por causa dele** (`socket-register` e a variável `socketRestaurantUuid`). Ele não funciona hoje: conexão em namespace sem gateway. Manter seria carregar um socket que tenta reconectar para sempre sem nunca entregar nada.
- **O início automático é do código, não do instalador.** `setLoginItemSettings` no boot, só quando `app.isPackaged`. Fica independente da spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26), que vai mexer no NSIS, e não precisa de elevação.
- **Error boundary de classe, sem dependência.** `react-error-boundary` resolveria, mas são 20 linhas de `componentDidCatch` e o repo acabou de sair de 90 dependências para 30.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Iniciar com o Windows | [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) | [2-autostart-with-windows.md](./tasks/2-autostart-with-windows.md) | — | pendente |
| 02 | Aguardar o patch de impresso e parar de reimprimir | [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3) | [3-await-printed-patch.md](./tasks/3-await-printed-patch.md) | — | pendente |
| 03 | Fazer o `printer_exited` chegar ao admin | [#4](https://github.com/sgrande-delivery/delivery-printer/issues/4) | [4-printer-exited-reaches-admin.md](./tasks/4-printer-exited-reaches-admin.md) | — | pendente |
| 04 | Estado de sem conexão e `ProtectedRoute` de verdade | [#5](https://github.com/sgrande-delivery/delivery-printer/issues/5) | [5-offline-state-and-protected-route.md](./tasks/5-offline-state-and-protected-route.md) | — | pendente |
| 05 | Error boundary com recuperação | [#6](https://github.com/sgrande-delivery/delivery-printer/issues/6) | [6-react-error-boundary.md](./tasks/6-react-error-boundary.md) | — | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03 → 04 → 05. Nenhuma depende da outra; a ordem é da mais isolada para a mais invasiva, para o diff de cada commit ficar pequeno. A 03 é a única que mexe em main e renderer juntos, e a 04 é a única que muda fluxo visível (quem não está logado passa a ser redirecionado), então ela vem depois das correções mecânicas.

## Dependências de outros repos

Nenhuma. A 03 usa o handler `printerExited` que **já existe** no `RestaurantGateway` do `delivery-socket-api` e o `usePrinterConnectionStatus` que **já existe** no `delivery-admin` — é só passar a emitir de onde o servidor escuta.

## Verificação da entrega

Além de `npm run typecheck`, `npm run lint` e `npm test`:

- a 01 e a 03 precisam de **app empacotado** para valer: `npm run build && npx electron-builder --win --publish never` numa máquina Windows, instalar, reiniciar. Em dev o `setLoginItemSettings` nem roda (`isPackaged` falso)
- a 03 precisa de confirmação do **outro lado**: o log do `delivery-socket-api` dizendo `printer_exited ... OK`, e o painel marcando offline. Sem isso é só uma emissão bonita
- a 02 e a 04 se verificam com a API mockada (500 na marcação, rede fora)

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. -->

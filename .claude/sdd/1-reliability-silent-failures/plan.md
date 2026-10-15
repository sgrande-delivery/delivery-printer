# Plan — Tirar as falhas silenciosas do app de impressão

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1)
**Branch de trabalho:** `feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15: todas as tasks em sequência, um commit por task e um PR no fim

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
| 01 | Iniciar com o Windows | [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) | [2-autostart-with-windows.md](./tasks/2-autostart-with-windows.md) | — | executada |
| 02 | Aguardar o patch de impresso e parar de reimprimir | [#3](https://github.com/sgrande-delivery/delivery-printer/issues/3) | [3-await-printed-patch.md](./tasks/3-await-printed-patch.md) | — | executada |
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

Da task 01 (#2), e as três valem para a 03 (#4), que também mexe no main:

- **`args` do login item chega por `process.argv`, não por `process.env`.** O `process.env.START_MINIMIZED` que o `window.ts` lia é herança do ERB e **nada no repo o define**. A task #2 afirmava o contrário, e a afirmação foi corrigida no arquivo dela — a spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26), que vai criar atalho de startup pelo instalador, dependia desse detalhe estar certo.
- **Teste de código do main vive em `src/main/__tests__/`** (o `include` do Vitest é `src/**/*.{test,spec}.{ts,tsx}`, então é coletado) e roda no **jsdom global**: `// @vitest-environment node` quebra, porque o `setupFiles` de `src/__tests__/setup.ts` usa `window`. `node:fs`, `node:os` e `node:path` funcionam normalmente sob jsdom. O padrão a copiar é o `vi.mock('electron', ...)` com `vi.hoisted` e o getter de `isPackaged` de `src/main/__tests__/autostart.test.ts`.
- **O `electron-log` já tem transporte de arquivo ligado neste processo** (`src/main/updater.ts:8`, `log.transports.file.level = 'info'`), e a dependência já é empacotada. Ou seja, a spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) não começa do zero: existe um sink pronto, e os três `console.*` de `src/main/` (`main.ts`, `updater.ts`, `autostart.ts`) são os sites a trocar. Atenção ao fato de que o `AppUpdater` é construído **depois** do `registerAutostart()` no `whenReady`, então quem configurar o logger precisa fazê-lo antes de tudo.
Da task 02 (#3):

- **A guarda em memória registra só `print-created`, e isso não é detalhe.** A varredura `/orders/print/list` sempre pede esse layout; registrar o `print-dispatched` esconderia dela um `print-created` que falhou, e o pedido deixaria de ser recuperado — ticket de cozinha que nunca sai, em silêncio. Foi reproduzido em teste antes de corrigir, e o teste é a rede que impede o gate de ser removido por engano. **A task #17 (spec #15), que substitui esta guarda pela deduplicação em disco, herda a mesma regra:** a chave tem de ter o mesmo significado que a pergunta de quem consulta.
- **A janela que a guarda NÃO fecha, exigida pela RN-02.** Entre `rawPrint` resolver e o `uuid` entrar na guarda não há nada: se a reconexão cair **enquanto** uma impressão está em voo, o pedido ainda não está na guarda e a varredura imprime de novo. A guarda cobre "imprimiu, não marcou, reconectou depois"; não cobre "imprimindo agora, reconectou agora". Fechar isso exige estado que sobreviva ao momento da impressão, e é da spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15) — que precisa enfileirar **antes** de imprimir, não depois.
- **Dívida: o `handleOpen` do `MessagingProvider` é instável.** Ele é `useCallback(..., [open])` (`src/renderer/providers/messaging.tsx:31`), porque lê `open` para decidir entre fechar-e-reabrir (350 ms) e abrir direto. Resultado: muda de identidade a cada abertura do snackbar, e qualquer `useCallback` que o inclua nas dependências vira instável — na task 02 isso faria o aviso de "não consegui marcar" refazer a varredura e disparar uma nova rodada de impressões. A volta foi um ref. O caminho durável é estabilizar o provider (`setOpen(prev => ...)` em vez de ler `open`, deixando `handleOpen` com `[]`), que serve todos os consumidores — mas é mudança no provider, fora do escopo de qualquer task desta spec. **Quem for mexer no `messaging.tsx` faz isso primeiro.**
- **Dívida consciente da RN-01:** o `console.log(err)` da varredura (`usePrintingOrder.ts`, efeito do `findOrders`) ficou. É linha de base, e trocá-lo por aviso visível faria a tela avisar a cada oscilação de rede — spam que treina o operador a ignorar a tela (RN-03 da spec #11). Candidato à spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) (log em arquivo), não a aviso.
- **Texto do aviso, decisão de produto em aberto:** "Ele pode sair novamente" só se concretiza se o app reiniciar antes de a API ser marcada — dentro da mesma sessão a guarda impede. A frase se salva pelo "pode", mas não diz ao operador o que fazer. Melhorá-la é decisão de produto.

- **Decisão de produto em aberto, levada ao dev:** no boot, o app sobe **minimizado na barra de tarefas** (é o que o `START_MINIMIZED` sempre fez e o que está implementado), não escondido na bandeja. Para um app que vive na bandeja, "escondido" talvez seja o esperado — mas mudar isso altera o comportamento de uma flag pré-existente, então ficou como pergunta.

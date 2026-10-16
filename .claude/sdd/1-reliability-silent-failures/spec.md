# Spec — Tirar as falhas silenciosas do app de impressão

**Status:** entregue
**Criada em:** 2026-10-15
**Escopo:** main+renderer
**Issue:** [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1)

## Contexto

O app roda sozinho no PDV, sem ninguém olhando. Hoje, quando algo falha, ele continua parecendo ligado: todo caminho de erro termina em `console.error`, que no app empacotado não chega a lugar nenhum, e várias falhas não têm nem isso.

São cinco falhas independentes, todas medidas no código, e todas com a mesma assinatura — **o app parece funcionar e não está**:

1. **Não inicia com o Windows.** Não existe `setLoginItemSettings` em `src/main/`, e o NSIS está nos defaults, sem atalho de startup. Reboot do PDV deixa a impressora parada até alguém abrir o app à mão.
2. **Pedido reimpresso.** `src/renderer/hooks/usePrintingOrder.ts:33` chama `api.patch('/orders/<uuid>/printed')` **sem `await`**, dentro de um `try` que por isso não o captura. A rejeição vira unhandled rejection e o pedido fica não-marcado — então a varredura `GET /orders/print/list` da próxima reconexão (`usePrintingOrder.ts:57`) o imprime de novo.
3. **`printer_exited` não chega a ninguém.** `src/main/main.ts:13` conecta em `io(constants.WS_BASE_URL)`, a **raiz**. No `delivery-socket-api` todos os gateways são namespaced (`src/core/shared/constants/namespaces.ts`) e **não há gateway na raiz**: `subscribe_channel` e `printer_exited` emitidos de lá caem no vazio. O `usePrinterConnectionStatus.ts` do `delivery-admin` escuta `printer_exited` e nunca o recebe; ele só descobre a saída por timeout de 60 s.
4. **Sem conexão, tela vazia e calada.** `src/renderer/routes/ProtectedRoute.tsx:10` tem `const authenticated = true;`, e quem leva ao login é o interceptor **no 401** (`services/apiErrorInterceptor.ts`). Erro de rede não tem `response`, então nada redireciona: `/users/me` falha, `restaurant` fica `null`, nenhum socket conecta, e a tela mostra só a barra de título e a versão.
5. **Erro de render é tela branca sem volta.** Não existe error boundary em `src/renderer/`, e `Ctrl+R` só existe em desenvolvimento (`src/main/devtools.ts`).

## Objetivo

Nenhuma dessas cinco falhas acontece em silêncio: o app sobe sozinho depois do reboot, não reimprime pedido por falha de marcação, avisa o painel quando sai, diz ao operador quando não consegue falar com o servidor, e sobrevive a um erro de render.

## Requisitos funcionais

- **RF-01** — O app instalado inicia junto com o Windows, e desligar isso não é revertido pelo app no boot seguinte.
- **RF-02** — Falha ao marcar o pedido como impresso é aguardada, registrada e não produz nova impressão do mesmo pedido.
- **RF-03** — Ao fechar pela bandeja, o `printer_exited` chega ao painel pelo socket autenticado do namespace `/admin`.
- **RF-04** — Sem conseguir falar com a API, a tela diz que não há conexão e oferece tentar de novo; com 401, vai para o login.
- **RF-05** — Erro de render mostra tela de erro com recuperação, em vez de tela branca.

## Regras de negócio

- **RN-01** — **Nenhum caminho de falha termina em `console.error` e nada mais.** Falha que o operador precisa saber vai para a tela; falha que o suporte precisa investigar vai para o log. Esta spec não constrói o log (é a #11), mas não pode aumentar a dívida: o que ela tocar passa a reportar.
- **RN-02** — **A marcação `printed` é a única defesa contra duplicata.** Não há controle local de "já imprimi". Qualquer mudança no par imprimir/marcar tem de dizer o que acontece na janela entre os dois.
- **RN-03** — **O socket que o servidor escuta é o do namespace `/admin`, autenticado pelo handshake do renderer.** O `delivery-socket-api` valida `restaurant_uuid` contra a sala do próprio socket e ignora o que não casa — emitir de um socket sem identidade não é erro visível, é silêncio.
- **RN-04** — **"Não autenticado" e "não consegui falar com o servidor" são estados diferentes** e levam a telas diferentes. Tratar os dois como um só é o que produz a tela vazia de hoje.
- **RN-05** — O início automático é uma preferência da máquina, não do app: se o operador ou o suporte desligar, o app não liga de novo sozinho.

## Fora do escopo

- Log em arquivo, rotação e exportação — spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11).
- Fila durável de impressão e retry — spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15). Aqui o pedido ainda se perde se o app estiver fechado; o que esta spec corrige é a **duplicata** e o silêncio.
- Emitir `printer:status` por impressora — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25), que depende de relay novo no `delivery-socket-api` ([issue #50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50)).
- Tela de configuração de impressão — spec [#19](https://github.com/sgrande-delivery/delivery-printer/issues/19).
- Instalador per-machine e assinatura — spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26). O início automático desta spec é por código (`setLoginItemSettings`), e continua valendo depois de o instalador mudar.

## Critérios de aceitação

- [ ] Instalado, reiniciado o Windows, o app está na bandeja sem ninguém abrir.
- [ ] Com a marcação de impresso falhando, o comprovante não sai duas vezes na reconexão seguinte.
- [ ] Fechar pela bandeja marca a impressora como offline no painel na hora, e o log do socket-api registra `OK` (não `IGNORED`).
- [ ] Com a API inacessível, a tela diz que não há conexão e tem como tentar de novo; com 401, cai no login; autenticado, entra.
- [ ] Um componente que lança no render mostra a tela de erro, e recarregar devolve o app funcionando.
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`).

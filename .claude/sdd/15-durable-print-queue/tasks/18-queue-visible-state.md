# 18 — Estado da fila visível e retry manual

**Issue:** [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** renderer
**Depende de:** 17
**Status:** executada

## Objetivo

Mostrar na tela quantos trabalhos estão pendentes e quais falharam, e deixar o operador tentar de novo sem fechar o app.

## Contexto

- Cobre a **RF-04** e a **RN-05** da spec
- A tela de status (`src/renderer/components/status/Status.tsx`) é o único lugar que o operador olha, e já concentra restaurante, usuário, conexão e versão
- O estado vem do main pelos canais da task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17); o renderer **não** lê a fila do disco (RN-01)
- Pendente é informação, falhado é alerta: cor e texto diferentes, e o alerta precisa dizer qual pedido/mesa e qual impressora
- `RestaurantStatus.tsx` já é o componente de estado de conexão ao lado do nome do restaurante — o padrão visual de "indicador" existe e deve ser seguido, não reinventado
- Primitivos de `src/renderer/base/`, tokens de `app.css` e `expectNoUndefinedClasses` no teste, conforme `.claude/rules/renderer-ui.md`

## Mudanças

### 1. Hook de estado

`src/renderer/hooks/usePrintQueue.ts` (novo): assina o estado da fila (consulta no mount + atualização a cada mudança avisada pelo main), e expõe `pending`, `failed` e `retry(id?)`.

### 2. Indicador na tela de status

`src/renderer/components/status/Status.tsx` (alterado) + CSS Module: contador de pendentes quando houver, e bloco de falhados com o botão de tentar de novo. Sem trabalho nenhum, **nada aparece** — fila vazia é o estado normal e não merece espaço.

### 3. Aviso de falha

Reaproveita o `useMessaging()` e a notificação da task [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13) para o momento em que um trabalho passa a `failed`; o indicador é o estado persistente, a notificação é o evento.

## Testes

### `src/renderer/hooks/__tests__/usePrintQueue.test.ts` (novo)

- Reflete o estado vindo do canal, e atualiza quando o main avisa
- `retry` chama o canal com o id

### `src/renderer/components/status/__tests__/Status.test.tsx` (atualizado)

- Com pendentes, mostra o contador; sem nada, não mostra bloco nenhum
- Com falhado, mostra o alerta com pedido e impressora, e o botão chama o retry
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: impressora desligada, acompanhar o contador subir, religar e ver zerar; forçar `failed` e usar o retry

## Critérios de aceitação

- [ ] Pendentes aparecem e zeram quando a fila esvazia
- [ ] Falhado aparece como alerta, com pedido/mesa e impressora
- [ ] Retry manual reprocessa e limpa o alerta quando dá certo
- [ ] Fila vazia não ocupa espaço na tela
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Tela dedicada de histórico de impressão
- Cancelar trabalho (se virar pedido, é task própria)
- Exportar a fila: o log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) já cobre o que o suporte precisa

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/renderer/hooks/usePrintQueue.ts`, `src/renderer/components/print-queue/{FailedJobList,FailedJobItem}.tsx` + os `.module.css`, e dois arquivos de teste.
Alterados: `Status.tsx`, `Status.module.css`, `preload.ts`, `print-queue.ts`, `print-queue-worker.ts`, `onQueueState.ts`, `setup.ts`.

### Nenhum aviso novo, e isso foi verificado

O `onJobFailed` da #13/#17 já dispara snackbar + notificação nativa para **qualquer** job que vira `failed`, **sem filtro de `kind`** (mesa incluída), com `label` e `deviceName`. O bloco na tela é o **estado persistente** que sobra depois que o snackbar some; um segundo aviso seria duplicata literal.

O review procurou assimetria e achou duas, **ambas corretas por desenho**: estado sem aviso para job `failed` herdado de sessão anterior (o aviso saiu antes), e para job que falha entre o `bootPrintQueue` e o mount do listener — e o bloco é justamente a rede desse segundo caso.

### O polling foi substituído por anúncio

A primeira versão fazia `setInterval` de 3 s, e cada poll lia e parseava o NDJSON **inteiro** (até ~2 MB, medido na task 01) no processo main — ~40 MB/min, 24/7, no mesmo loop que dirige a impressão serial.

O review inventariou **todas** as mutações da fila e mostrou que havia **um** furo: o `enqueue`. Virou o canal `queue:changed` (main → renderer, sem payload), com `announce()` em quatro pontos e **de propósito nenhum entre tentativas** — com a impressora desligada seria um ping a cada 2–30 s.

Ganho colateral: a tela deixou de ficar até 3 s atrás do estado real.

### O que o review corrigiu

- **`announce()` com `try/catch` obrigatório**: sem ele, um `send` que lance faz o `enqueue` **rejeitar** para um job **já gravado em disco**, e a tela mentiria dizendo que o comprovante foi perdido
- **filtro de `printed` movido para o main**: não é só payload — os `printed` são o livro-caixa da dedup, e mandar a fila toda convidaria a próxima task a decidir dedup no renderer, contra a RN-01
- **`refresh` virou não-async**: medido com probe que a regra `set-state-in-effect` olha o **callee**, não o microtask. A primeira versão fugia do aviso duplicando "consulta + guarda + set" em dois lugares
- **guarda de corrida ganhou teste** (não tinha), e entrou um teste que **impede o polling de voltar**

### O `.map()` extraído

`FailedJobList` (o `<ul>`) e `FailedJobItem` (o `<li>`, com os dois fallbacks e o botão), em `src/renderer/components/print-queue/`, um componente por arquivo — seguindo o precedente de `restaurant-status/`. O `Status` fica o pai: wrapper `role="alert"`, título e "tentar todos de novo".

### Testes

**126 em 21 arquivos** (baseline da spec: 71/16). Mutações, todas derrubando teste: sem `announce()` no enqueue → 2; sem `offChanged()` no cleanup → 1; sem a guarda de corrida → 1; sem o filtro de `printed` → 1; **polling de volta → 1**; blocos renderizando com fila vazia → 2.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · `ui.test.tsx` verde · par do canal novo conferido nos dois lados + stub · o `content` não atravessa (`queue:changed` vai **sem payload**).

Geometria medida pelo review, não deduzida: na janela de 1024×728 o bloco de falhados (400 px centrados) **não** se sobrepõe ao bloco `.user` (`right: 20`, ~250 px); só encostaria com ~13 falhados, e aí o wrapper rola.

### O que não foi verificado

O caminho manual: impressora desligada → contador subir → religar → zerar; forçar `failed` e usar o retry. **E ele vale mais agora do que valia com o polling**, porque é o que prova o `queue:changed` em processo real. A aparência dos blocos novos também não foi vista.

## Branch

`feat/15-durable-print-queue`, cortada de `feat/11-observability-logs-and-errors` em 2026-10-15, com um commit por task.

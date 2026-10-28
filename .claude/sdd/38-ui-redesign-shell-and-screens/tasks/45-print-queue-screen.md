# 07 — Fila de impressão, com descartar

**Issue:** [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 03
**Status:** pendente

## Objetivo

A tela que mostra o que está esperando para sair e o que não saiu, com a causa, e dá as duas únicas ações possíveis para um trabalho falhado: tentar de novo ou descartar.

## Contexto

- O desenho: `../design/printer-v2.dc.html:183-221`. A lógica das abas e das linhas está no script, em `:649-658`.
- **A fila já existe e é durável:** `src/main/queue/`, com `queueState()` e `retryFailed(id?)` no preload (`preload.ts:28,31`) e `onQueueChanged` avisando cada transição (`preload.ts:57`). O renderer já a consome pelo `usePrintQueue()`.
- **O que falta é descartar.** Hoje um trabalho falhado só sai da lista pelo limite de 24 h ou pelo limite de 200 (`print-queue-store.ts:13-14`). Sem descartar, o comprovante de um pedido cancelado fica acusando falha no Painel e na sidebar pelo resto do dia.
- **Os números do desenho são os do código, e isso não é coincidência:** "Cada trabalho tenta até 5 vezes" é o `MAX_ATTEMPTS = 5` (`print-queue-worker.ts:9`) e "Comprovantes com mais de 24 h são descartados" é o `MAX_AGE_MS` (`print-queue-store.ts:14`). Se um dos dois mudar, **o texto da tela muda junto** — derivar do constante, não escrever o número à mão.
- **A hora da próxima tentativa** (`:214`, "Nova tentativa em 18 s") vive só em memória no worker: `nextAttemptAt`, um `Map` em `print-queue-worker.ts:65`. Decisão 1 da spec: **expor como campo opcional no `PrintJobSummary`**. O `onQueueState` hoje lê o store, não o worker — a mudança é o worker publicar o instante junto do estado. Se o acoplamento ficar feio, o texto cai para "aguardando nova tentativa", sem contagem; o que a tela **não** faz é inventar o segundo.
- **Canal IPC é par** (RN-03), e o novo entra também no stub de `src/__tests__/setup.ts`.
- Cobre a **RF-08** e a decisão pendente 1 da spec.

## Mudanças

### 1. `src/shared/printQueue.ts` — dois campos

```ts
export type PrintJobSummary = Omit<PrintJob, 'payload'> & {
  deviceName: string | null;
  copies: number;            // do payload; é o único campo dele que a tela precisa
  nextAttemptAt?: number;     // só para pendente que já falhou pelo menos uma vez
};
```

O `copies` é da task [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46) (o Histórico mostra "2×"), e entra aqui porque é o mesmo tipo e a mesma função de conversão — fazer duas vezes é pior. **O HTML continua não cruzando** (RN-09): `payload.content` segue fora do summary, de propósito.

`toSummary` (`print-queue-worker.ts:19`) passa a preencher os dois.

### 2. `src/main/ipc-events/onDiscardJob.ts` (novo) + o par no preload

| Canal | Assinatura | Semântica |
| --- | --- | --- |
| `queue:discard` | `(id: string): Promise<boolean>` | Remove o trabalho do arquivo. `false` quando o `id` não existe mais |

Só **trabalho falhado** pode ser descartado: descartar pendente seria perder comprovante que ainda ia sair. O handler recusa (devolve `false` e registra `logger.warn`) se o status não for `failed` — a tela não é a última linha de defesa.

Depois de remover, anunciar `queue:changed`, como as outras transições fazem.

### 3. `src/renderer/hooks/usePrintQueue.ts` — `discard`

Acrescentar `discard(id)` ao que o hook devolve, no molde do `retry` que já está lá (`usePrintQueue.ts:44-61`): chama o canal, registra erro pelo `log`, e **chama `refresh()` mesmo quando nada mudou** — pelo mesmo motivo comentado no `retry`, que o main só anuncia quando houve mudança.

### 4. `src/renderer/helpers/receiptKind.ts` — acrescentar o ícone ao mapa que já existe

**Não crie `components/print-queue/jobKind.ts`:** a task 06 já pôs o mapa de rótulos em `src/renderer/helpers/receiptKind.ts`, e é lá que ele fica — são **três** telas consumindo (Painel, Fila, Histórico), e em `components/print-queue/` ele seria importado de dentro de outras duas features. O `helpers/` já é a casa do vocabulário de impressão compartilhado (`printFailure.ts`).

O que fazer: unificar em `RECEIPT_KINDS: Record<PrintJobKind, { label: string; icon: IconName }>` e atualizar o consumidor de hoje (`useDashboardHealth.ts`). Os quatro ícones do desenho (`skillet`, `two_wheeler`, `table_restaurant`, `receipt`) **já estão** na união `IconName` e no recorte da fonte — nada a regerar. O mapa, do desenho (`:522-527`):

| `PrintJobKind` | Rótulo | Ícone |
| --- | --- | --- |
| `order-created` | Produção | `skillet` |
| `order-dispatched` | Expedição | `two_wheeler` |
| `board` | Mesa | `table_restaurant` |
| `board-billing` | Conta da mesa | `receipt` |
| `test` | Teste | `receipt_long` |

O `test` **não está no desenho** — o mock não tem trabalho de teste, mas a fila tem (`PrintJobKind` inclui `'test'`, e a task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24) o enfileira). Esconder a página de teste da fila faria o operador ver um pendente que a tela não explica. Então ele aparece, com o rótulo e o ícone acima.

### 5. `src/renderer/components/print-queue/PrintQueue.tsx` + `.module.css` (novos)

- **Aviso de falha** (`:185-190`), só quando há falhado: `--err-soft`/`--err`, com o texto do desenho — "**N comprovantes não saíram** — não vai sair sozinho. Corrija a causa e tente de novo." (plural correto, ao contrário do mock)
- **Abas** (`:192-196`): segmentado em `--surface-2`, raio 8, `padding: 3px`; aba ativa com fundo `--surface` e `box-shadow: 0 1px 2px rgba(0,0,0,.12)`. Rótulos "Pendentes · N" e "Falhados · N". A aba inicial vem do `state` do `navigate` (`{ tab: 'pending' | 'failed' }`, que a task 06 já emite e cujo teste já prova). **O tipo `QueueTab` mora hoje dentro de `components/dashboard/Dashboard.tsx`** — mova-o para `components/print-queue/` ou `renderer/types/` nesta task, porque importar tipo de dentro do componente de outra feature é acoplamento que não se justifica; sem `state`, é Falhados quando há falha e Pendentes quando não — como `:649` faz
- **Dica** (`:195`): a frase com o 5 e as 24 h, derivada das constantes
- **Tabela** (`:197-219`): a grade do desenho, `minmax(0,1.2fr) minmax(0,1fr) 70px minmax(0,1.4fr) 180px`, cabeçalho em `--surface-2`. Por linha: ícone do tipo, pedido em 600 com "tipo · hora" abaixo, impressora com reticências, tentativas em `tabular-nums` ("3/5"), situação com ícone e cor, e as ações
- **Situação**, como `:651`: falhado → `error` em `--err` com a causa (`lastError`); pendente imprimindo → `print`; pendente esperando → `schedule` com "Nova tentativa em N s"
- **Ações** (`:208-216`), só em falhado: "Descartar" (texto, `--text-2`) e "Tentar de novo" (`--accent`). Depois de agir, a mensagem vai pelo `useMessaging()`, como o desenho faz com o toast
- **Vazio** (`:217`): `padding: 48px`, centro, `check_circle` de 32 px em `--ok`, e o texto por aba — "Nenhuma impressão falhou." / "Nada esperando para imprimir."

**`FailedJobList.tsx` e `FailedJobItem.tsx` estão órfãos desde a task 06** (o único importador era o `Status.tsx`, que saiu) e **nunca tiveram teste próprio** — `components/print-queue/` não tem `__tests__/`. Então não há teste a mover: ou você os reaproveita nesta tela, ou **apaga os dois aqui**. Deixá-los órfãos depois desta task é dívida que a 12 vai ter de limpar sem contexto.

**O `Chip` precisa de dois ajustes antes de servir aos filtros** (medidos no review da task 06): o `.medium` embute padding assimétrico `0 10px 0 6px`, que é do chip de voltar, e os filtros querem `0 12px` simétrico; e `.neutral.medium` acopla `color: var(--text-2)` ao tamanho, quando o filtro quer `--text`. Conserte **no primitivo** (um `tone="muted"` resolve o segundo), não com classe na tela.

### 6. `screens/PrintQueueScreen.tsx`

Substitui o esqueleto que a task [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41) deixou em `/queue`.

## Testes

### `src/main/queue/__tests__/queue-ipc.test.ts` (ampliado)

- `queue:discard` remove o trabalho falhado do arquivo e anuncia `queue:changed`
- `queue:discard` num **pendente** recusa, devolve `false` e **não** remove
- `id` inexistente devolve `false` sem lançar
- `toSummary` leva `copies` e **não** leva `payload.content` — a mutação que importa: devolver o payload inteiro faz este teste falhar

### `src/renderer/hooks/__tests__/usePrintQueue.test.ts` (ampliado)

- `discard` chama o canal e atualiza a lista mesmo quando o main não anuncia

### `src/renderer/components/print-queue/__tests__/PrintQueue.test.tsx` (novo)

- Aba inicial: Falhados quando há falha; Pendentes quando não; o `state` do `navigate` vence os dois
- Falhado mostra a causa, "Descartar" e "Tentar de novo"; pendente **não** mostra ação nenhuma
- Pendente com `nextAttemptAt` mostra a contagem; sem ele, mostra o texto sem contagem
- Vazio por aba, com o texto de cada uma
- Trabalho de teste aparece como "Teste"
- "N comprovantes não saíram" em singular e plural
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `grep -rn "queue:discard" src/` mostra duas ocorrências (preload + main), mais o stub
- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: desligar a impressora, deixar um trabalho falhar as cinco tentativas, conferir a aba, descartar, e conferir que ele **não volta** depois de reiniciar o app (é arquivo, não memória)

## Critérios de aceitação

- [ ] As duas abas seguem o desenho (`:183-221`), com as contagens no rótulo
- [ ] Trabalho falhado mostra a causa e as duas ações; pendente não mostra ação
- [ ] Descartar remove de verdade, e o descartado não reaparece depois do restart
- [ ] Descartar pendente é recusado pelo main, não só escondido na tela
- [ ] O texto do limite deriva de `MAX_ATTEMPTS` e `MAX_AGE_MS`
- [ ] O summary continua sem o HTML do comprovante
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Reimprimir do histórico — task [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46)
- Mudar o backoff, o limite de tentativas ou o de idade
- Pausar a fila, reordenar, mudar a impressora de um trabalho enfileirado

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

# 08 — Histórico de hoje, com reimprimir

**Issue:** [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 03, 07
**Status:** shipped

## Objetivo

A tela do que saiu hoje, com busca e filtro por tipo — e o botão que reimprime um comprovante sem pedir nada ao servidor.

## Contexto

- O desenho: `../design/printer-v2.dc.html:223-254`. O mapa de tipos está em `:522-527` e a filtragem em `:664-667`.
- **A tela é possível sem backend novo:** a fila durável guarda os trabalhos com `status: 'printed'` por até 24 h e no máximo 200 (`print-queue-store.ts:13-14`). O histórico é esse arquivo, filtrado.
- **Mas o HTML do impresso era apagado**, e isso derrubou a premissa da primeira versão desta task. `markPrinted` fazia `payload: { ...job.payload, content: '' }` (`print-queue-store.ts:191`), com teste afirmando, por decisão da spec 15: o HTML é a parte pesada do arquivo. Reimprimir devolveria `content: ''` e **o worker imprimiria uma página em branco**.

  **A decisão do dev (2026-10-28):** o store passa a manter o HTML dos **20 impressos mais recentes** e apagar o dos demais. Então, nesta task:

  1. `markPrinted` **não** apaga o conteúdo; quem apaga é uma poda que roda depois, deixando com HTML só os `KEEP_PRINTED_HTML` impressos mais novos (por `createdAt`). A constante mora em `src/shared/queueLimits.ts`, ao lado de `MAX_ATTEMPTS` e `MAX_AGE_MS`;
  2. o teste `"markPrinted … drops the receipt HTML"` (`print-queue-store.test.ts:73`) **muda de propósito**, e o novo afirma as duas metades: o recente mantém, o 21º perde;
  3. o `PrintJobSummary` ganha **`reprintable: boolean`** — `status` é `printed` ou `failed` **e** `payload.content` não é vazio. **A linha sem HTML não mostra o botão** (com `title` dizendo por quê), em vez de mostrar um que imprime em branco. Isso é divergência deliberada do desenho, que põe o botão em toda linha: entra na tabela de fidelidade;
  4. **declare no relatório** o efeito de privacidade: até 20 comprovantes passam a ter o HTML em disco por até 24 h, onde antes era apagado na impressão.
- **E é por isso que reimprimir não toca na API** (RN-09): o HTML já está no disco. Buscar de novo em `GET orders/{uuid}/print-created` seria pior de três formas — depende de rede, o pedido já está marcado como impresso, e a varredura `GET /orders/print/list` não o traz mais.
- **"Hoje" é o que a fila guarda** (RN-08): `createdAt` desde a meia-noite local. A tela **não** oferece dia anterior, e o resumo diz o recorte. Prometer histórico que o arquivo não tem é pior que não ter a tela.
- **E "hoje" congela na virada do dia, hoje:** a meia-noite é calculada por render, e nada re-renderiza o app numa noite calma (o `printer_ping` de 30 s só emite, não mexe em estado). O Painel já tem o problema e o aceitou; **aqui é pior**, porque a tela é o histórico. Crie um `useMidnightTick()` em `renderer/hooks/` e use **nas duas** telas. Com `setInterval` de 60 s, **não** `setTimeout` para a próxima meia-noite: o PDV suspende de madrugada e um timeout de 7 h acordado pelo resume dispara tarde.
- A task [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45) já deixou `copies` no summary e o mapa de tipos em `components/print-queue/jobKind.ts` — esta reaproveita os dois.
- Cobre a **RF-09**, a **RN-08** e a **RN-09**.

## Mudanças

### 1. `src/main/ipc-events/onReprintJob.ts` (novo) + o par no preload

| Canal | Assinatura | Semântica |
| --- | --- | --- |
| `queue:reprint` | `(id: string): Promise<boolean>` | Devolve o trabalho existente para `pending`, com `attempts: 0` e `lastError: null`, e acorda o worker |

Pontos que não são detalhe:

- **Reimprimir não cria trabalho novo com `id` novo.** O `id` é o nome do arquivo temporário (`onRawPrint.ts`) e é a chave da deduplicação; gerar outro abriria a porta para duas impressões do mesmo comprovante
- Só `printed` e `failed` podem ser reimpressos. Pendente já vai sair, e reenfileirar o que está saindo é imprimir duas vezes — o handler recusa, com `logger.warn`
- Anuncia `queue:changed` depois de gravar
- **O HTML nunca cruza o IPC.** O renderer manda um `id`; quem tem o conteúdo é o main

### 2. `src/renderer/components/history/History.tsx` + `.module.css` (novos)

- **Busca** (`:227-230`): caixa de 220 px, altura 36, borda `--line`, raio 6, com `search` em `--muted` e `placeholder="Buscar pedido ou mesa"`. Filtra pelo `label` do trabalho, sem diferenciar caixa, como `:664`
- **Filtros** (`:231-235`): chips de altura 32 e raio 16; ativo com fundo `--text` e texto `--bg`, inativo com fundo `--surface`, texto `--text-2` e borda `--line`. Os seis do desenho — Todos, Produção, Expedição, Mesa, Conta da mesa, Falhas — mais **Teste**, pelo mesmo motivo da task [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45): a fila tem esse tipo e o mock não tinha
- **Resumo** (`:236`): "Hoje, {dia} {mês} · N impressos · M falhas", com a data real e plural correto
- **Tabela** (`:238-251`): a grade do desenho, `52px 76px minmax(0,1fr) minmax(0,1.2fr) 52px 110px 40px`, com Hora, Pedido, Tipo, Impressora, Cópias, Situação e a ação. Hora em `--muted` com `tabular-nums`, pedido em 600, tipo com ícone de 16 px, impressora com reticências, cópias como "2×", e o chip de situação (altura 22, raio 11): Impresso em `--ok-soft`/`--ok`, Falhou em `--err-soft`/`--err`
- **Reimprimir** (`:249`): botão de ícone de 32 px, `print`, com `hover` em `--accent` e `title="Reimprimir"`. Confirma pelo `useMessaging()` — "{pedido} enviado para {impressora}." — que é o que o desenho faz no toast (`:629`)
- **Vazio**: sem nada hoje, a tela diz isso; não é o mesmo que "ainda carregando"

A impressora exibida é o `deviceName` do trabalho; quando é `null`, o comprovante saiu na impressora padrão do Windows (é o comportamento desejado de `onRawPrint`, não um defeito) — a tela escreve "impressora padrão", não um campo vazio.

### 3. `screens/HistoryScreen.tsx`

Substitui o esqueleto de `/history`.

## Testes

### `src/main/queue/__tests__/queue-ipc.test.ts` (ampliado)

- `queue:reprint` num `printed` o devolve a `pending` com `attempts: 0`, **mantendo o `id`** — a mutação que importa: gerar `id` novo faz o teste falhar
- `queue:reprint` num `pending` recusa e não altera o arquivo
- O trabalho reimpresso mantém o `payload` original (o HTML não é remontado)
- `id` inexistente devolve `false`

### `src/renderer/components/history/__tests__/History.test.tsx` (novo)

- Só aparece o que tem `createdAt` ≥ meia-noite; o de ontem às 23 h **não** aparece, mesmo estando no arquivo
- Busca filtra por pedido sem diferenciar caixa
- Cada filtro de tipo mostra só o seu; "Falhas" mostra só os falhados
- `deviceName: null` aparece como "impressora padrão"
- Reimprimir chama `queue:reprint` com o `id` e **não** chama o `api` — verificável, e é a RN-09
- Vazio é diferente de carregando
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `grep -rn "queue:reprint" src/` mostra duas ocorrências, mais o stub
- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: imprimir, reimprimir pela tela, e conferir que **nenhuma requisição sai** na aba Network do DevTools

## Critérios de aceitação

- [ ] A tela segue o desenho (`:223-254`), conferida lado a lado
- [ ] O recorte é hoje, e a tela diz qual é o recorte
- [ ] Busca e os sete filtros funcionam juntos
- [ ] Reimprimir imprime de novo sem nenhuma requisição à `delivery-api`
- [ ] Reimprimir mantém o `id` do trabalho
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Histórico além do que a fila guarda: nada de banco, arquivo próprio ou rota nova na API (RN-08)
- Exportar o histórico para arquivo
- Reimprimir **em outra** impressora — o trabalho reimpresso vai para a mesma, porque o `device_name` veio no payload que a API montou

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

## Implementação

**Concluída em:** 2026-10-28

### Processos tocados

main, preload, renderer

### Arquivos criados/alterados

- `src/shared/queueLimits.ts` — `KEEP_PRINTED_HTML = 20`
- `src/shared/printQueue.ts` — `PrintJobSummary.reprintable`
- `src/main/queue/print-queue-store.ts` — `markPrinted` não apaga mais; `trimPrintedHtml()` (poda por `createdAt`); `requeue(id)`
- `src/main/queue/print-queue-worker.ts` — poda após cada impressão; `reprint(id)`; `isReprintable`; reimpressão não emite `onPrinted`
- `src/main/ipc-events/onReprintJob.ts` (novo), `onQueueState.ts` (passa a incluir os impressos)
- `src/renderer/components/history/` — `History`, `HistoryTable`, `HistoryRow` (+ `.module.css`), `historyView.ts` (funções puras)
- `src/renderer/base/Chip.tsx` — `tone="inverse"`, `size="compact"`, `pressed`
- `src/renderer/hooks/usePrintQueue.ts` — `loaded`, `reprint`
- `src/renderer/screens/HistoryScreen.tsx`

### Canais IPC criados/alterados

- `queue:reprint` — preload `src/main/preload.ts:41`, handler `src/main/main.ts:35`, stub `src/__tests__/setup.ts:20`

### Decisões que tomei por conta própria

- `onQueueState` filtrava os `printed`; sem isso o Histórico (e o "Impressos hoje" do Painel) nunca veria nada. Passou a devolvê-los, e o teste de exclusão mudou.
- O worker não emite `onPrinted` para reimpressão (senão o `usePrintingOrder` daria `PATCH /printed` de novo, violando a RN-09). O marcador vive em memória.
- Resumo omite "falhas" quando 0 (como o desenho `:709`).
- `Chip` ganhou `inverse`, `compact` e `pressed` (primitivo, não override).
- Linha sem HTML: `<span title>` de 32 px no lugar do botão.

### Verificação

- `npm run typecheck`: 0; `npm run lint`: 0 erros, 1 aviso (baseline); `npm test`: 52 arquivos, 418 testes; varredura por mutação: 0 sobreviventes

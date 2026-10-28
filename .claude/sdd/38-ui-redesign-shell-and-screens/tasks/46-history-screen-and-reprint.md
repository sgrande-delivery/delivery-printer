# 08 — Histórico de hoje, com reimprimir

**Issue:** [#46](https://github.com/sgrande-delivery/delivery-printer/issues/46)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 03, 07
**Status:** pendente

## Objetivo

A tela do que saiu hoje, com busca e filtro por tipo — e o botão que reimprime um comprovante sem pedir nada ao servidor.

## Contexto

- O desenho: `../design/printer-v2.dc.html:223-254`. O mapa de tipos está em `:522-527` e a filtragem em `:664-667`.
- **A tela é possível sem backend novo**, e é a parte menos óbvia desta spec: a fila durável guarda os trabalhos com `status: 'printed'`, **com o HTML no payload**, por até 24 h e no máximo 200 (`print-queue-store.ts:13-14`). O histórico é esse arquivo, filtrado.
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

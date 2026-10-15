# 16 — Fila persistida em userData

**Issue:** [#16](https://github.com/sgrande-delivery/delivery-printer/issues/16)
**Feature:** [Fila durável de impressão com retry](../spec.md) — issue #15
**Tipo:** feature
**Processo:** main
**Depende de:** (nenhuma)
**Status:** executada

## Objetivo

Criar o armazenamento da fila no processo principal — enfileirar, listar, marcar impresso, marcar falhado, descartar por idade — com escrita atômica e limites de tamanho e idade.

## Contexto

- `app.getPath('userData')` é o lugar de estado por instalação; `.env` é build-time e não serve (`.claude/rules/autoupdate.md`)
- Cobre a **RN-01**, a **RN-02** e a **RN-04** da spec
- O trabalho já tem identidade: `uuidv4()` em `src/renderer/hooks/usePrintingOrder.ts:26`, que vira o nome do arquivo temporário em `src/main/ipc-events/onRawPrint.ts:16`
- O payload de um trabalho é o do `rawPrint` (`content`, `copies`, `deviceName`, `id`) mais o que a marcação precisa (tipo, e o `uuid` do pedido quando houver)
- Decisão pendente 1 da spec: guardar o HTML na fila. O `content` é o comprovante inteiro, então o limite de tamanho da RN-04 importa de verdade
- A task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) da spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) grava um JSON de uma chave em `userData` para o início automático. Se as duas estiverem na base, vale um helper comum de leitura/escrita atômica — e **não** um "framework de storage"

## Mudanças

### 1. O store

`src/main/queue/print-queue-store.ts` (novo): NDJSON em `userData`, com API pequena e explícita — `enqueue(job)`, `list()`, `markPrinted(id)`, `markFailed(id, reason)`, `incrementAttempt(id)`, `pruneOlderThan(ms)`.

Escrita atômica: arquivo temporário no mesmo diretório + `rename`. Leitura tolerante: linha que não parseia é **descartada com log**, e o resto da fila sobrevive (RN-02).

Limites: número máximo de trabalhos e idade máxima (24 h, decisão pendente 2). O que for descartado vai para o log com o motivo (RN-06).

### 2. Tipos

`src/main/queue/types.ts` (novo): o `PrintJob` com `id`, `kind` (`order-created` | `order-dispatched` | `board` | `board-billing` | `test`), `payload` do `rawPrint`, `orderUuid` opcional, `attempts`, `status` (`pending` | `printed` | `failed`), `createdAt`, `lastError`.

Os nomes de `kind` acompanham os quatro eventos de socket mais o teste local da task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24), para o worker não precisar adivinhar o que fazer depois de imprimir.

## Testes

### `src/main/queue/__tests__/print-queue-store.test.ts` (novo)

- Enfileira, lê de volta, e o conteúdo é igual (ida e volta)
- `markPrinted` remove do pendente; `markFailed` mantém com o motivo
- Arquivo com uma linha corrompida no meio: as outras são lidas, a corrompida é descartada
- Arquivo inexistente: `list()` devolve vazio, sem lançar
- Trabalho mais velho que o limite é descartado por `pruneOlderThan`
- Limite de tamanho respeitado

`app.getPath` é mockado com `vi.mock('electron', ...)` para um diretório temporário.

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`

## Critérios de aceitação

- [ ] Fila sobrevive a restart do processo
- [ ] Arquivo corrompido não impede a leitura do resto nem o boot do app
- [ ] Escrita é atômica (teste de interrupção simulada, ou inspeção de que nunca há `write` direto no arquivo final)
- [ ] Limites de idade e de tamanho aplicados, com descarte logado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- O worker e o retry — task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17)
- Canais IPC — task [#17](https://github.com/sgrande-delivery/delivery-printer/issues/17), que é quem passa a precisar deles
- UI — task [#18](https://github.com/sgrande-delivery/delivery-printer/issues/18)
- Banco de dados embarcado: decisão registrada no plan (dependência nativa × duas arquiteturas)

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/main/queue/print-queue-store.ts`, `src/main/queue/__tests__/print-queue-store.test.ts`, `src/main/atomicFile.ts`, `src/shared/printQueue.ts`.
Alterado: `src/main/autostart.ts` (passou a gravar a marca pelo `writeFileAtomic`).

O `src/main/queue/types.ts` que só reexportava foi **removido pelo review**: uma fonte de verdade (`shared/printQueue`), senão vira convite para a #18 importar de `main/`.

### As duas perguntas do fluxo, respondidas com medição

**Reescrita integral a cada mutação — fica.** O comprovante da `delivery-api` foi medido: CSS inline de **2 379 bytes**, **sem imagem nem base64** em nenhuma blade de impressão. Logo ~3–10 kB por trabalho (30 kB no pior caso), ~2 MB com a fila cheia, e a mutação custa **7–21 ms**. Numa operação que acontece ~3× por trabalho, contra segundos de impressão térmica, é otimização prematura.

**Append em NDJSON não serve**, e o argumento é a própria RN-02: `appendFileSync` de linha multi-kB não é atômico, e a linha truncada que a leitura descartaria é **o trabalho recém-enfileirado que ainda não imprimiu**.

**Limite por contagem basta** (200 ≈ 2 MB), com gatilho de revisão se a API passar a inlinar imagem.

### O defeito de desenho que o review corrigiu

`list()` **escrevia** quando encontrava linha inválida. A contradição que eu suspeitei não existia (a reescrita estava em `try/catch`), mas o desenho estava errado por três razões: a #17 e a #18 leem **em laço**, então uma linha ilegível geraria `open`+`fsync`+`rename` por poll; o log carrega só o número da linha, então a cura apaga a única evidência; e numa **migração de schema** o primeiro `list()` zeraria a fila pendente.

Agora a leitura é pura e a cura é **`compact()`**, decisão de quem chama. **A #17 tem de chamá-la no boot, junto do `pruneOlderThan()`.**

### Decisões, e o veredito do review

- **Tipos em `src/shared/`**: certo, e a consequência foi verificada com `npm run build` + grep nos bundles — nenhum símbolo da fila em `out/renderer/`
- **`markPrinted` mantém o registro e zera o `content`**: certo, e **é isto que substitui a guarda em memória da task #3**. Mas o review achou o que isso **não** resolve: ver o aprendizado sobre `orderUuid` + `kind`
- **`writeFileAtomic` compartilhado com o `autostart`**, com `fsync` antes do `rename`, e leitura separada em cada módulo porque as tolerâncias divergem: certo nos três pontos. Ausência de `fsync` no diretório pai também está certa — não há forma portável no Windows, e perder o `rename` deixa o arquivo anterior **íntegro**
- **Descarte por ordem** (impressos → falhados → pendentes mais velhos): certo em princípio, com a ressalva de que o impresso é a evidência de dedup
- **Log de descarte só com o número da linha**: certo, e agora provado **nos dois ramos**

### Testes

**88 em 17 arquivos** (baseline da branch: 71/16). Oito mutações derrubam teste, incluindo:

| Mutação | Testes |
| --- | --- |
| `writeFileSync` direto, sem `rename` | 2 |
| abrir o arquivo final mantendo `fsync`, sem `rename` | 2 |
| vazar o conteúdo da linha no log (qualquer dos dois ramos) | 1 — **verificado por mim** |
| `markPrinted` mantendo o HTML | 1 |
| ordem de descarte invertida | 1 |
| leitura voltando a reescrever | 2 |

A RN-02 está provada nas duas pontas: o arquivo final **nunca** é aberto para escrita (espiões em `openSync` **e** `writeFileSync`), e interrupção do `rename` deixa o arquivo anterior byte a byte igual, sem `.tmp` sobrando.

E o review reduziu um teste de **826 ms para 54 ms** — ele fazia 203 reescritas com `fsync` e **estourou o timeout de 5 s numa das execuções**. O CI é `windows-latest`, onde isso é pior.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · 88 testes · nenhuma dependência nova · invariantes de autoupdate intactas.

### O que não foi verificado

Queda de energia real em NTFS (a atomicidade está provada por código e teste, não no filesystem alvo), `app.getPath('userData')` real (o `electron` é mockado), prune de 24 h com relógio real, e ponta a ponta — **nada chama o store até a #17**.

## Branch

`feat/15-durable-print-queue`, cortada de `feat/11-observability-logs-and-errors` em 2026-10-15, com um commit por task.

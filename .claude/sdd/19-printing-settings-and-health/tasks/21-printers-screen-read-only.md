# 21 — Tela de impressoras conferindo o nome contra o device

**Issue:** [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 20
**Status:** shipped

## Objetivo

Criar a tela que lista as impressoras cadastradas e, para cada uma, diz se o nome casa com um device real daquela máquina — o que hoje é invisível e produz impressão na impressora padrão sem aviso.

## Contexto

- `GET /api/admin/printers` é paginado e aceita `page`, `rows`, `term`, `station`, `sort`, `direction`; a resposta é `{ data, total }` (ver `components/printers/hooks/useFetchPrinters.ts` no `delivery-admin`). No PDV não precisa de busca nem paginação visível: um restaurante tem poucas impressoras — pedir uma página grande e listar tudo
- O tipo que a API devolve: `id`, `name`, `address`, `activated`, `station`, `paper_width`, `copies`. Os campos `status`, `last_print`, `jobs_today`, `jobs_week` que o tipo do admin declara **não vêm do banco** (colunas removidas na migration `2026_05_11_140000_revert_printer_telemetry_columns_and_tables`): o admin os preenche ao vivo pelo socket. Não declarar o que não vem
- O cruzamento usa **exatamente** o critério do `onRawPrint.ts:21`: `name.toLowerCase() === device.name.toLowerCase()`. Critério diferente faria a tela mentir sobre o que a impressão vai fazer (decisão registrada no plan)
- Cobre a **RF-02**, a **RN-02**, a **RN-03** e a **RN-04**
- `role:printer` é exigido pela rota: 403 vira mensagem de permissão, nunca lista vazia (RN-04)
- Segue a skill `add-screen`: componente, CSS Module, screen, rota, **caminho de navegação** e teste. É a primeira tela nova desde a saída do boilerplate — ela define o padrão para as próximas

## Mudanças

### 1. Serviço e hook

`src/renderer/services/printers.ts` (novo): `fetchPrinters()` pelo `api` que já existe. `src/renderer/hooks/usePrinters.ts` (novo): junta a lista da API com a do Windows (`window.electron.listPrinters()`) e devolve cada cadastrada com `resolvedDevice: string | null`.

### 2. Tela

`src/renderer/components/printers/Printers.tsx` + `.module.css` (novos): uma linha por impressora cadastrada com nome, setor, cópias, largura do papel, ativa/inativa e o **estado de resolução**: "encontrada" ou **"não encontrada nesta máquina"**, com destaque (RN-03) e uma linha explicando a consequência — "a impressão está saindo na impressora padrão do Windows".

Mostra também as impressoras do Windows que não estão cadastradas, porque é o que o operador precisa para escolher o nome certo na task [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22).

Estados: carregando, vazio (nenhuma cadastrada), sem permissão (403), erro de rede.

### 3. Rota e navegação

`src/renderer/screens/PrintersScreen.tsx`, rota `/printers` em `src/renderer/routes/Routes.tsx` dentro do `ProtectedRoute`, e o link na tela de status (`src/renderer/components/status/Status.tsx`) — sem o link, a tela é inalcançável (decisão pendente 2 da spec).

## Testes

### `src/renderer/hooks/__tests__/usePrinters.test.ts` (novo)

- Nome igual com caixa diferente **resolve** (é o critério do `onRawPrint`)
- Nome inexistente devolve `resolvedDevice: null`
- Lista de devices vazia: todas ficam não resolvidas, sem quebrar

### `src/renderer/components/printers/__tests__/Printers.test.tsx` (novo)

- Impressora não encontrada aparece com o destaque e a frase da consequência
- 403 mostra a mensagem de permissão, e **não** o estado vazio
- Estado vazio (200 com lista vazia) é diferente do 403
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: cadastrar no painel uma impressora com nome errado e ver a tela acusar

## Critérios de aceitação

- [ ] A tela lista as cadastradas, com o estado de resolução correto
- [ ] Caixa diferente resolve; nome errado não resolve e aparece em destaque
- [ ] 403, lista vazia e erro de rede são três telas distintas
- [ ] A tela é alcançável a partir da tela de status
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Editar (é a task [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22)) e criar impressora (fora da spec)
- Mudar o fallback de impressora padrão no `onRawPrint` — decisão pendente 1, task [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22)
- Status ao vivo da impressora — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25)

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/shared/printerMatch.ts` (+ teste), `src/renderer/types/printer.ts`, `src/renderer/services/printers.ts` (+ teste), `src/renderer/hooks/usePrinters.ts` (+ teste), `src/renderer/screens/PrintersScreen.tsx`, e em `src/renderer/components/printers/`: `Printers`, `PrinterList`, `PrinterItem`, `PrintersNotice`, cada um com `.module.css`.
Alterados: `src/main/ipc-events/onRawPrint.ts`, `src/renderer/routes/Routes.tsx`, `src/renderer/components/status/Status.tsx` + `.module.css` + teste.

### O bug que esta task quase entregou

A primeira versão mandava `rows: 200` no `GET /printers`. **Medido no `delivery-api`** (branch `feature/product-engineering-rebased`): `GetPrintersRequest.php:14,27` tem `ALLOWED_ROWS = [10, 20, 50, 100]` com `Rule::in`, e `failedValidation` lança 422.

Toda chamada responderia **422**, e a tela mostraria "Não foi possível carregar as impressoras" com um botão de tentar de novo que falha para sempre. **Os testes passavam porque mockavam o `fetchPrinters`** — a ficção autoconsistente que as specs #11 e #15 já registraram três vezes, agora na forma mais caprichada: o mock concordava com uma chamada que o servidor recusa.

**A correção é mandar menos:** `GetPrintersInput.php:21` liga a paginação só se `page` ou `rows` existirem, então omitindo os dois o use case chama `searchAll()` e o controller responde um **array puro**. Sem limite para estourar, sem `total` para ignorar, sem 201ª impressora invisível.

E entrou **o teste de serviço que faltava**: afirma a URL e que `mock.calls[0]` tem **tamanho 1**, ou seja, nenhum parâmetro. Verificado por mim: devolvendo `rows: 200`, 1 teste falha.

### O critério de cruzamento ficou único

Antes havia duas cópias, com um comentário dizendo "o mesmo critério do `printReceipt`". **Prosa não obriga os dois lados a mudarem juntos** — que é exatamente o que este plan exige. Agora `src/shared/printerMatch.ts` tem `findPrinterByDeviceName`, genérica estrutural (serve `Electron.PrinterInfo` e `WindowsPrinter` sem `as`), e **o main e o renderer chamam a mesma função**. Verificado por grep: `onRawPrint.ts:19`, `usePrinters.ts:37,39`.

Ganho de rede: o `printReceipt` **nunca teve teste próprio** (é mockado no `queue-ipc.test.ts`); agora o critério dele tem.

### Estados da tela

| Estado | O que aparece |
| --- | --- |
| carregando | spinner |
| 403 | "Sem permissão para ver as impressoras" + `log.warn` com o rastro para o suporte |
| erro | aviso com "Tentar novamente" |
| 200 vazio | "Nenhuma impressora cadastrada…" |
| **nenhum device lido** | "Não foi possível ler as impressoras deste computador" — e os itens ficam **neutros** |

O último é correção do review: com `listPrinters()` devolvendo `[]` (spooler caído, Linux, dev), a versão anterior pintava **todas** as cadastradas de vermelho acusando "não encontrada nesta máquina". Era o único estado em que a tela afirmava mais do que mediu.

### Decisões

- **`station` fica `string | null`**, e o mapa de tradução tem os **7** valores do `PrinterStationEnum` (`kitchen, bar, pizza, counter, cashier, dessert, sushi`). O mapa de 4 da primeira versão deixaria "dessert" cru numa UI pt-BR. União literal travaria este app num enum de outro repo
- **Duas impressoras com o mesmo nome são duas linhas legítimas**, com teste: dois tickets de estação na mesma impressora física é cadastro válido, e o cruzamento pega o primeiro — o que a impressão faz
- **O tipo não declara** `status`/`last_print`/`jobs_*`: colunas removidas do banco
- `PrinterStatus` → `PrintersLoadStatus`, porque a #25 vai precisar do nome para "online/offline"

### Testes

**152 em 26 arquivos** (baseline da spec: 126/21; a task entregou 140, o review levou a 148, as correções a 152).

Mutações verificadas: `rows: 200` de volta → 1 falha; critério sensível a caixa → 2; `trim()` nos dois lados → 2; dedupe por nome → 2; `dessert` fora do mapa → 1.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · `ui.test.tsx` verde · contrato conferido no fonte do `delivery-api` (rota, FormRequest, DTO, use case, repositório e presenter).

### O que não foi verificado

Nada rodou em Windows nem contra a `api-dev`: o `isDefault` segue sendo previsão, e a verificação manual que esta task pede (cadastrar nome errado no painel e ver a tela acusar) **depende de saber se o usuário do PDV tem `role:printer`**. A aparência não teve olhar humano.

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

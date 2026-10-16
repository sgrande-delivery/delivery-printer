# 21 — Tela de impressoras conferindo o nome contra o device

**Issue:** [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 20
**Status:** pendente

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

## Branch

`feat/19-printing-settings-and-health`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

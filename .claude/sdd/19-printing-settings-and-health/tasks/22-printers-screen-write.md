# 22 — Editar a impressora na API, com 403 tratado

**Issue:** [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 21
**Status:** executada

## Objetivo

Deixar o operador corrigir no PDV o cadastro da impressora — principalmente o `name`, **escolhido da lista real do Windows** —, gravando em `PUT /api/admin/printers/{id}`.

## Contexto

- `PUT /api/admin/printers/{id}` existe (`app/Modules/Printer/routes/admin-routes.php`), sob `role:printer`, e o contrato de entrada é o `UpdatePrinterRequest` da API
- Campos: `name` (o device do Windows, RN-02), `copies`, `station`, `paper_width` (58 ou 80), `activated`. `address` é informativo do painel e **não** é editado aqui (fora do escopo da spec)
- `station` tem **sete** valores na API — `kitchen`, `bar`, `pizza`, `counter`, `cashier`, `dessert`, `sushi` (`core/Printer/Domain/Enums/PrinterStationEnum.php`) — contra quatro no tipo do `delivery-admin`. Seguir a API (decisão pendente 3 da spec)
- `PATCH /printers/{id}/toggle-active` é o caminho de ativar/desativar; usar ele em vez de mandar `activated` no `PUT`, se o contrato do `PUT` não o aceitar — confirmar no `UpdatePrinterRequest` antes
- Cobre a **RF-03**, a **RN-02** e a **RN-04**
- 403 por falta de permissão precisa impedir o formulário de "salvar" e perder a alteração (RN-04)
- Aqui também se resolve a **decisão pendente 1** da spec: o que o `onRawPrint` faz quando o nome não casa. Hoje imprime na padrão, calado. A proposta é **falhar visível** — mas isso muda comportamento em produção, então entra só com confirmação do dev, e com a tela de diagnóstico já no ar

## Mudanças

### 1. Edição

`src/renderer/services/printers.ts` (alterado): `updatePrinter(id, payload)` e `togglePrinterActive(id)`.

`src/renderer/components/printers/PrinterForm.tsx` + `.module.css` (novos): formulário por impressora, com o `name` num **select** alimentado por `window.electron.listPrinters()` — nunca texto livre (RN-02). `copies` numérico com mínimo 1, `station` e `paper_width` como selects com os valores da API.

### 2. Retorno ao operador

Sucesso e falha pelo `useMessaging()`. 403 com texto explícito sobre permissão. Erro de validação da API mostrado com a mensagem que ela devolve, não com texto genérico.

### 3. Fallback da impressora não encontrada (sob confirmação)

`src/main/ipc-events/onRawPrint.ts` (alterado, **se** o dev confirmar): nome que não casa passa a rejeitar com motivo claro em vez de imprimir na padrão. Com a spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) na base, isso aparece na tela e no log; com a [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15), vira trabalho `failed` recuperável.

Se o dev não confirmar, a task entrega só a edição, e a decisão fica registrada como pendente no `plan.md`.

## Testes

### `src/renderer/components/printers/__tests__/PrinterForm.test.tsx` (novo)

- O campo de nome é um select com as impressoras da máquina; não aceita valor fora da lista
- Salvar chama `PUT` com o payload esperado
- 403 mostra a mensagem de permissão e o formulário não finge ter salvo
- Erro de validação da API aparece como veio
- `expectNoUndefinedClasses(container)`

### `src/main/__tests__/onRawPrint.test.ts` (novo, se a mudança do fallback entrar)

- `deviceName` que não casa **rejeita** com motivo, e não imprime
- `deviceName` nulo continua indo para a padrão (comportamento desejado de restaurante com uma impressora só)
- Mutação: voltando o fallback silencioso, o teste cai

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: corrigir o nome e ver o comprovante seguinte sair na impressora certa; conferir no painel que o cadastro mudou

## Critérios de aceitação

- [ ] O nome só pode ser escolhido da lista real da máquina
- [ ] Corrigir o nome faz o comprovante seguinte sair na impressora certa
- [ ] 403 não perde a alteração nem mente sobre ter salvo
- [ ] `station` oferece os sete valores da API
- [ ] Se o fallback mudou, há teste que cai ao reintroduzir o silencioso; se não mudou, a pendência está registrada no `plan.md`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Criar e excluir impressora
- Editar `address`
- Configurações do restaurante (`printerSettings`) — task [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23)

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/renderer/components/printers/PrinterForm.tsx` + `.module.css`, `stations.ts`, `src/renderer/services/apiMessage.ts`, e três arquivos de teste (`PrinterForm`, `PrinterItem`, `apiMessage`).
Alterados: `src/renderer/services/printers.ts`, `usePrinters.ts`, `PrinterItem.tsx` + `.module.css`, `PrinterList.tsx`, `Printers.tsx`, `printers.test.ts`, `Printers.test.tsx`.

`src/main/` **não** foi tocado (conferido: `git status --porcelain src/main` vazio).

### O corpo do `PUT`, e por que leva os seis campos

```
{ name, address, activated, copies, paper_width, station }
```

A primeira versão omitia o `activated`, com o argumento de que ele é `sometimes` no FormRequest e que ativar/desativar tem rota própria. **`sometimes` nesta API não preserva — significa "opcional no request", e aí o DTO aplica o default dele.** Medido: `UpdatePrinterInput` declara `public bool $activated = true;`, o `Dto::handleMap` faz `return` quando a chave falta (mantendo o default), e o `PrinterRepository::update()` grava **as seis colunas**.

Consequência que isso teria tido em produção: o operador desativa uma impressora pelo toggle, depois edita o nome dela, e **a impressora volta a ligar sozinha**.

O `address` nunca se perde: é `string` não-nulo no schema, o `GET` sempre o traz e o form só o repassa, nos dois caminhos (com e sem lista de devices).

### O 422 que não aparecia

O `apiMessage.ts` lia `{ message, errors }` — o formato do Laravel. **Esta API emite `{ error, status_code, detail, internal_code }`**, medido ponta a ponta até o `response()->json($e->toArray(), $status)` do `bootstrap/app.php:135`. Nem `message` nem `errors` existem nesse endpoint, então a mensagem caía no texto genérico: o operador punha 4 cópias, causava o erro, e recebia "não foi possível salvar" em vez de "cópias não pode ser maior que 3".

Agora lê `detail` → `errors` → `error`, e **o teste usa o corpo real desta API**, copiado do `toArray()`. O `errors` fica como alternativa legítima: é o formato do handler de `ValidationException`, que atende os endpoints que não sobrescrevem `failedValidation`.

### O toggle

`PATCH /printers/{id}/toggle-active`, sem corpo — a rota atômica (`DB::transaction` sobre `NOT activated`), que dispensa mandar `name`/`address`.

Ela **não é idempotente**, e por isso os botões ganharam guarda de voo: dois cliques voltavam ao estado original, o que para o operador parece "não fez nada". Há teste de duplo clique.

### Sucesso e falha

| | Onde aparece |
| --- | --- |
| erro de validação (422) | **inline no formulário**, com o texto da API, e o form fica aberto com o que foi digitado |
| 403 | inline, "nada foi salvo" |
| sucesso | **snackbar** pelo `useMessaging()` |

A task pedia os dois pelo `useMessaging()`; a divisão foi aprovada por mérito: erro de formulário tem de **ficar** ao lado do campo, e o snackbar é mau veículo para isso. O que não podia era o sucesso ficar mudo — e estava, porque o único sinal era a tela piscar.

Por isso o `refresh` (sem `loading`) substituiu o `reload` no caminho de salvar e no do toggle: esvaziar a tela inteira para refletir uma linha é flash desnecessário, mas só se pode tirá-lo **depois** de dar sinal próprio ao sucesso. O `reload` ficou no "tentar novamente", onde o `loading` faz sentido.

### Testes

**176 em 29 arquivos** (baseline da task: 152/26).

Mutações verificadas: `PUT` só com `name` → cai o teste de payload; `activated` fora do `PUT` → cai; sem a leitura de `detail` → caem 4 em 2 arquivos; sem a guarda do toggle → cai o de duplo clique; `onChanged={reload}` de volta → caem os dois de "sem passar por loading".

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · `ui.test.tsx` verde · contrato conferido no fonte da `delivery-api`: `UpdatePrinterRequest`, `UpdatePrinterInput`, `Dto::handleMap`, `PrinterRepository`, `TogglePrinterActiveUseCase`, `PrinterPresenter`, as três classes de exceção, os handlers do `bootstrap/app.php`, `admin-routes.php` e as duas migrations de `printers`.

### O que não foi verificado

Nada contra a `api-dev` nem no Electron real. **O teste manual que mais importa é o do bug corrigido:** desativar uma impressora, editar o nome dela e conferir no painel que ela **continua desativada**. A aparência do select ao lado do `TextField` também não teve olhar humano — e é o que motiva a task do `base/Select` antes da #23.

A rajada de snackbar (salvar e alternar em sequência rápida) cai no `setTimeout` de 350 ms do provider, comportamento conhecido da spec #1.

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

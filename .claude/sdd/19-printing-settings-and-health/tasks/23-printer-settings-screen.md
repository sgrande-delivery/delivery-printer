# 23 — Tela de configurações de impressão (`printerSettings`)

**Issue:** [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 21
**Status:** pendente

## Objetivo

Trazer para o PDV as mesmas configurações de impressão que o admin já tem, lendo e gravando no mesmo lugar: `GET` e `PUT /api/admin/printerSettings`.

## Contexto

- As rotas existem sob `role:printer-setting` (`app/Modules/Printer/routes/admin-routes.php`), e o admin as consome em `pages/printer-settings/PrinterSettings.tsx` com `api.put('/printerSettings', settings)`
- Os campos, do tipo do admin (`src/types/printerSettings.ts`): `font_size`, `production_template_copies`, `shipment_template_copies`, `no_margin`, `max_width`, `margin_size`, `delivery_printer_version`
- **O app já recebe esses valores**: `restaurant.printer_settings` vem no `/users/me` e está declarado em `src/renderer/types/restaurant.ts` (sem o `delivery_printer_version`) — e nunca foi lido. Serve de estado inicial, sem request extra
- **RN-05 é o risco da task:** o `PUT` do admin manda o objeto inteiro, e ele inclui `delivery_printer_version`, que o painel usa para montar o link de download do instalador (`pages/printer-settings/PrinterSettingsForm.tsx`). Se o app mandar o objeto sem esse campo, apaga a configuração de que o admin depende. Ler antes, preservar o que não edita
- **RN-06:** quem aplica `font_size` e margens é a API, ao renderizar o HTML. O app não interpreta nada disso — só lê e grava
- Cobre a **RF-04**, a **RN-04**, a **RN-05** e a **RN-06**

## Mudanças

### 1. Serviço

`src/renderer/services/printerSettings.ts` (novo): `fetchPrinterSettings()` e `updatePrinterSettings(settings)`. O update parte do objeto **lido da API** e sobrepõe só os campos editados — nunca monta o objeto do zero.

### 2. Tipo

`src/renderer/types/restaurant.ts` (alterado): o `PrinterSetting` local ganha `delivery_printer_version`, para o campo existir no objeto que vai e volta, mesmo não sendo editável aqui.

### 3. Tela

`src/renderer/components/printer-settings/PrinterSettings.tsx` + `.module.css` (novos): os campos acima, em pt-BR, com os mesmos rótulos do admin para o suporte falar uma língua só ("Tamanho da fonte", "Cópias impressão produção", "Cópias impressão entrega", "Remover margens", "Tamanho das margens").

`delivery_printer_version` aparece **somente leitura**, mostrando a versão que o painel está oferecendo para download — informação útil ao suporte, e deixa explícito que não se edita daqui.

Estados: carregando, salvando, sem permissão (403), erro.

### 4. Rota e navegação

`src/renderer/screens/PrinterSettingsScreen.tsx`, rota `/printer-settings` no `ProtectedRoute`, e a entrada junto da tela de impressoras.

## Testes

### `src/renderer/services/__tests__/printerSettings.test.ts` (novo)

- O `PUT` preserva `delivery_printer_version` e os campos não editados — **o teste central da task**
- Mutação: montando o payload do zero, este teste cai

### `src/renderer/components/printer-settings/__tests__/PrinterSettings.test.tsx` (novo)

- Renderiza os campos com os valores carregados
- `delivery_printer_version` aparece e **não** é editável
- 403 mostra a mensagem de permissão
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: alterar cópias de produção no PDV, conferir no admin que mudou e que o link de download continua apontando para a mesma versão; imprimir um pedido e ver o número de cópias novo

## Critérios de aceitação

- [ ] Alterar no PDV reflete no admin
- [ ] `delivery_printer_version` intacto depois do `PUT` feito pelo app
- [ ] O campo aparece como leitura, com a versão que o painel oferece
- [ ] 403 tratado
- [ ] O próximo comprovante sai com o número de cópias configurado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Editar `delivery_printer_version` daqui: é o painel que decide qual versão oferecer
- Interpretar `font_size`/margens no app (RN-06)
- Cadastro de impressoras — tasks [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) e [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22)

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

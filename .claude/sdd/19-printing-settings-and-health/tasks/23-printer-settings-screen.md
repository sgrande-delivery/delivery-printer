# 23 — Tela de configurações de impressão (`printerSettings`)

**Issue:** [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 21
**Status:** executada

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/renderer/services/printerSettings.ts`, `hooks/usePrinterSettings.ts`, `components/printer-settings/{PrinterSettings,PrinterSettingsForm}.tsx` + `.module.css`, `screens/PrinterSettingsScreen.tsx`, **`base/Select.tsx`** + `.module.css`, e três arquivos de teste.
Alterados: `providers/auth.tsx`, `routes/Routes.tsx`, `components/status/Status.tsx` + teste, `components/printers/PrinterForm.tsx` + `.module.css` (migrado para o `base/Select`).

### O bug que esta task quase entregou, e que ela existia para evitar

A primeira versão lia o baseline de `GET /api/admin/printerSettings`. **Essa rota lê a tabela errada na `delivery-api`**: `FindCurrentRestaurantPrinterSettingsUseCase:19` usa `$restaurant->settings` (`RestaurantSetting` → `restaurant_settings`), enquanto o `PUT` escreve em `printer_settings`. A relação certa está vinte linhas abaixo no mesmo model.

Como o `PUT` **apaga todas as linhas e recria do payload**, o primeiro "Salvar" num PDV mandaria as 32 chaves de configuração geral do restaurante e **destruiria as sete de impressão**. `PrintCreatedOrderUseCase:28` e `ShipmentOrderUseCase:32` leem as cópias e a blade interpola `font_size`/`margin_size`: **o restaurante pararia de imprimir**, e o botão "Baixar agora" do painel passaria a apontar `v undefined`.

Ninguém havia percebido porque o `delivery-admin` **nunca chama esse `GET`** — ele usa `restaurant.printer_settings` do `/users/me`. Este app seria o primeiro consumidor.

**A fonte certa era a que esta própria task indicava:** a sessão. Medido que ela lê a tabela correta — `ShowAdminUserUseCase:44` faz `append('printer_settings')` e o acessor usa `$this->printerSettings()->get()`.

### A invariante, e o porteiro que a protege

O `PUT` manda `{ ...loaded, ...changes }`, onde `loaded` é o objeto da sessão **sem filtro**: as sete chaves conhecidas, as que existirem, e qualquer chave que este app não declara. O `delivery_printer_version` **nunca** é editável aqui — quem decide a versão oferecida é o painel — e volta intacto.

Como guard de **forma** não pega semântica errada (`typeof === 'object'` aprovava as 32 chaves alheias), há porteiro de **conteúdo**: baseline sem nenhuma das sete chaves conhecidas **recusa o salvamento com mensagem**, em duas camadas. Baseline vazio também recusa, porque as sete chaves são semeadas no cadastro do restaurante — vazio é evidência de bug, não de restaurante novo.

### Campos

| Campo | Conjunto, igual ao do painel |
| --- | --- |
| Tamanho da fonte | 12, 14, 16, 18, 20, 22, 24 |
| Cópias de produção | 1, 2, 3, 4 |
| Cópias de entrega | 1, 2, 3, 4 |
| Margens | 1 ("0px"), 10, 15, 20, 25, 30, 35, 40 ("NNpx") |
| Remover margens | checkbox |
| `delivery_printer_version` | **só exibido** |

Conjuntos fechados em vez de texto livre, porque **o servidor não valida nada** (sem FormRequest, coluna `string(255)` sem `CHECK`): `copies: 0` chega ao `webContents.print` e nenhum comprovante sai; `font-size: 0px` dá comprovante em branco. Isso também matou a mensagem global de erro, que não dizia qual campo havia sido recusado. Os rótulos foram conferidos no painel.

**`max_width` saiu da edição:** é configuração morta — não existe no painel e nenhuma blade ou use case a lê. Continua preservada no payload.

Valor fora do conjunto aparece como opção extra, para abrir a tela não reescrever o que estava gravado.

### `base/Select`

Criado seguindo o `base/TextField`: label por `useId` + `htmlFor`, e o `<select>` **antes** do `<label>` para o seletor irmão `:focus ~ .label` funcionar. A label fica sempre flutuada, porque um `<select>` sempre exibe uma opção e não há `:placeholder-shown` a seguir — é o estado em que o `TextField` fica quando tem valor.

Ganhou **o teste de ordem que o comentário do `TextField` sempre quis ter**, e o `PrinterForm` da #22 migrou (o `.select` saiu do CSS dele).

### Depois de salvar, a sessão é atualizada

`setPrinterSettings` no `providers/auth.tsx`, no molde do `setRestaurantIsOpen`. Sem isso, voltar à tela releria o valor **velho** do `/users/me` e um segundo "Salvar" mesclaria sobre o baseline antigo, **desfazendo o primeiro**.

### Testes

**199 em 32 arquivos** (baseline da task: 176/29).

Mutações verificadas: porteiro sempre verdadeiro → **7** testes caem; merge trocado por `{ ...changes }` → **6** caem.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · `ui.test.tsx` verde · nenhum `GET /printerSettings` restante · contrato conferido no fonte da `delivery-api` e os conjuntos conferidos no formulário do `delivery-admin`.

### Consequência aceita

Esta tela **não tem região de arraste**, então a janela não se move nela — enquanto `/printers` se move, porque a #21 copiou a barra antes de a decisão ser tomada. São cinco telas sem arraste, e duas irmãs da mesma spec se comportando diferente. É o preço de não fazer a quarta cópia, e reforça a task de subir a barra para o `DefaultLayout`.

### O que não foi verificado

Nada contra a `api-dev` nem no Electron real: a persistência, o link do instalador no painel continuando na mesma versão, e o comprovante seguinte saindo com o número de cópias novo. A aparência do `Select` ao lado do `TextField` não teve olhar humano.

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

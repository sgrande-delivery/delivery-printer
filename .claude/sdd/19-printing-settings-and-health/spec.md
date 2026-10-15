# Spec — Configuração de impressão e saúde das impressoras no PDV

**Status:** rascunho
**Criada em:** 2026-10-15
**Escopo:** main+renderer (cross-repo nas duas últimas tasks)
**Issue:** [#19](https://github.com/sgrande-delivery/delivery-printer/issues/19)

## Contexto

O operador não tem onde arrumar nada. Impressora, cópias e setor vêm todos do backend, e "está imprimindo na impressora errada" só se resolve por acesso remoto de alguém do suporte.

**A configuração já existe, e mora na `delivery-api`** — o que falta é o PDV alcançá-la. As rotas estão em `app/Modules/Printer/routes/admin-routes.php`, sob `api/admin`, com `assign.guard:admin` + `admin.jwt.auth`:

| Rota | Permissão | Quem usa hoje |
| --- | --- | --- |
| `GET /printers` (paginado) | `role:printer` | `delivery-admin`, `components/printers/hooks/useFetchPrinters.ts` |
| `GET /printers/{id}` | `role:printer` | admin |
| `POST /printers` | `role:printer` | admin |
| `PUT /printers/{id}` | `role:printer` | admin |
| `PATCH /printers/{id}/toggle-active` | `role:printer` | admin |
| `GET` e `PUT /printerSettings` | `role:printer-setting` | `delivery-admin`, `pages/printer-settings/PrinterSettings.tsx` |

O app já se autentica com credencial de admin e já manda `App: admin` (`src/renderer/services/api.ts:13`): ele pode consumir as mesmas rotas, **se o usuário logado tiver a permissão**.

### O fato central

**`printers.name` não é um rótulo: é o nome do device no Windows.** A API monta o payload de impressão com `'device_name' => $printer ? $printer['name'] : null` (`core/Order/Application/UseCases/Order/Traits/OrderPrintingTrait.php:49`, e o equivalente em `core/Board/.../GetBoardSessionPrintingContentUseCase.php:73`), e o app casa isso com o que o Windows reporta, sem diferenciar maiúsculas:

```ts
const printer = printers.find(printer => printer.name.toLowerCase() === deviceName?.toLowerCase());
```

`src/main/ipc-events/onRawPrint.ts:21`. Não achando, `printer?.name` fica `undefined` e o Electron **imprime na impressora padrão do sistema, calado**. É a causa raiz de "imprimiu na impressora errada" — e é invisível: ninguém erra de propósito, erra-se digitando o nome no painel, de outra máquina, sem ver a lista real.

### O que já existe do outro lado

- O `delivery-admin` **já escuta** `printer:status` (com dois-pontos) em `components/printers/hooks/usePrintersLiveStatus.ts`, com `{ printer_id, status, last_print?, jobs_today?, jobs_week? }` e alerta para `offline`, `no_paper` e `overheat`. **Ninguém emite** — a coluna de status vive vazia
- O `delivery-socket-api` repassa só evento com `@SubscribeMessage` declarado (`src/nestjs/modules/restaurant/restaurant.gateway.ts`): tem `printer_ping` e `printer_exited`, **não tem** `printer:status`
- O botão de teste do admin chama `POST /printers/{id}/test-print` (`useTestPrintPrinter.ts`), rota que **não existe** na API — hoje dá 404 e o painel mostra "não foi possível enviar o teste"
- Status de impressora é **volátil por decisão**: a FIX-011 da `delivery-api` removeu as colunas `status`, `last_print`, `jobs_today` e `jobs_week` da tabela `printers` (migration `2026_05_11_140000_revert_printer_telemetry_columns_and_tables`) em favor do socket

## Objetivo

O operador resolve no PDV o que hoje depende de suporte: ver quais impressoras cadastradas realmente existem naquela máquina, corrigir o cadastro, ajustar as configurações de impressão e imprimir um teste — e o painel passa a ver o estado das impressoras.

## Requisitos funcionais

- **RF-01** — O app lista as impressoras instaladas na máquina.
- **RF-02** — Uma tela mostra as impressoras cadastradas e, para cada uma, se o `name` casa com um device real daquela máquina.
- **RF-03** — O operador corrige o cadastro (`name` escolhido da lista real, `copies`, `station`, `paper_width`, `activated`) gravando na API.
- **RF-04** — O operador vê e altera as configurações de impressão do restaurante (`printerSettings`), as mesmas do admin.
- **RF-05** — O operador imprime uma página de teste na impressora escolhida, sem depender do backend.
- **RF-06** — O app emite `printer:status` por impressora, no formato que o painel já espera.

## Regras de negócio

- **RN-01** — **A configuração mora na `delivery-api`, no mesmo lugar que o admin usa.** Nada de arquivo local com cadastro de impressora: duas fontes de verdade sobre qual impressora atende a cozinha é pior que uma fonte errada.
- **RN-02** — **`printers.name` é o nome do device no Windows.** Toda escrita nesse campo vem de escolha numa lista real, nunca de texto livre digitado no PDV.
- **RN-03** — **Nome que não casa é um defeito visível, não um detalhe.** A tela precisa mostrar "não encontrada" com destaque, porque o sintoma (imprimiu na padrão) não se liga sozinho à causa.
- **RN-04** — **403 não é tela vazia.** `role:printer` e `role:printer-setting` são por usuário: sem permissão, a tela diz que falta permissão, e não finge que não há impressora cadastrada.
- **RN-05** — **`PUT /printerSettings` substitui o objeto.** O admin manda o objeto inteiro, e ele inclui `delivery_printer_version`, que o painel usa para montar o link de download do instalador. O app **preserva** o que não edita, ou apaga a configuração de que o admin depende.
- **RN-06** — **Quem aplica as configurações de impressão é a API**, ao renderizar o HTML. O app não interpreta `font_size` nem margens — ele só lê e grava.
- **RN-07** — **Não emitir status que o app não sabe.** `no_paper` e `overheat` não são observáveis pela API do Electron; inventá-los treina o gestor a desconfiar do painel.
- **RN-08** — **O teste de impressão local é a exceção deliberada** à regra de que comprovante é renderizado pela API: ele não tem dado de pedido e precisa funcionar com a API fora, na hora da instalação.

## Fora do escopo

- Criar impressora (`POST /printers`): cadastro novo é fluxo do painel, com dados que o PDV não tem (nome de negócio, endereço IP). O PDV **corrige**, não cadastra.
- `address` (IP/USB): informativo para o admin; o app não tem como validá-lo e não deve inventar valor.
- O botão de teste **do painel** — depende de rota nova na API ([delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205)).
- Contadores persistidos de impressão: as colunas foram removidas na FIX-011; o que existe é volátil.
- Configuração de início automático na UI — spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2), resolve por código.

## Critérios de aceitação

- [ ] A tela lista as impressoras cadastradas e marca as que não casam com nenhum device da máquina.
- [ ] Corrigir o `name` pela lista faz o comprovante seguinte sair na impressora certa.
- [ ] Usuário sem `role:printer` vê mensagem de permissão, não lista vazia.
- [ ] Alterar cópias de produção no PDV reflete no admin, e `delivery_printer_version` continua intacto.
- [ ] O teste imprime na impressora escolhida, com a API fora do ar.
- [ ] Com o relay publicado, desligar uma impressora faz o painel mostrá-la offline; `no_paper` nunca é emitido.
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo.

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | O que fazer quando o `name` cadastrado não casa com nenhum device | **Mostrar e não imprimir na padrão.** Hoje o fallback silencioso é o bug; o certo é falhar visível. Mas isso muda comportamento de impressão, então a mudança do fallback fica na task [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22) e sob confirmação do dev — a tela de diagnóstico ([#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)) entrega valor sem mexer nele |
| 2 | Onde a entrada para as telas novas aparece | Link na tela de status, que é onde o operador já olha. Item na bandeja exige canal main→renderer, que a spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) task [#4](https://github.com/sgrande-delivery/delivery-printer/issues/4) introduz — se ela já estiver na base, o item de bandeja fica barato |
| 3 | `station` tem 7 valores na API e 4 no tipo do admin | Seguir a API (`PrinterStationEnum`), e abrir issue no `delivery-admin` para a divergência |

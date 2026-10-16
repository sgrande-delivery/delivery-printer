# Plan — Configuração de impressão e saúde das impressoras no PDV

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#19](https://github.com/sgrande-delivery/delivery-printer/issues/19)
**Branch de trabalho:** `feat/19-printing-settings-and-health`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

Três camadas, nessa ordem:

1. **Saber o que a máquina tem** — canal IPC novo devolvendo `webContents.getPrintersAsync()`. Hoje essa chamada só existe dentro do `onRawPrint`, numa janela criada para imprimir (`src/main/ipc-events/onRawPrint.ts:20`)
2. **Confrontar com o que está cadastrado** — `GET /api/admin/printers` pelo `api` que já existe (`src/renderer/services/api.ts`, com `baseURL`, cookie e `App: admin`), e o cruzamento pelo mesmo critério do `onRawPrint` (`toLowerCase()`)
3. **Deixar corrigir** — `PUT /printers/{id}` e `PUT /printerSettings`, com 403 tratado

Depois, as duas pontas independentes: o teste local (que não depende de nada) e a emissão de `printer:status` (que depende do relay no `delivery-socket-api`).

As telas seguem a skill `add-screen`: componente + CSS Module, screen, rota no `Routes.tsx`, **caminho de navegação** e teste com `expectNoUndefinedClasses`. São as primeiras telas novas desde a saída do boilerplate, então elas também viram o precedente de layout para as próximas.

## Decisões arquiteturais

- **Nada de cadastro local.** Tudo que é configuração vai e vem da API (RN-01). O único estado local possível nesta spec é cache de leitura, e mesmo isso não é necessário num app que fica aberto.
- **O cruzamento nome × device usa exatamente o critério do `onRawPrint`.** Se a tela usasse comparação diferente (trim, acentos, normalização), ela mentiria sobre o que a impressão vai fazer. Qualquer melhora no critério muda os dois juntos.
- **O teste de impressão é local e renderizado aqui** (RN-08), e é a única exceção. O HTML é curto e fica num módulo próprio, para ninguém confundir com layout de comprovante.
- **`printer:status` é emitido pelo renderer**, no `/admin`, pelo mesmo socket autenticado do `printer_ping` — mesma razão da spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1): identidade vem do handshake.
- **A tela de impressoras mostra, mas não conserta sozinha, o fallback da impressora padrão.** Mudar o fallback é mudança de comportamento de impressão em produção (decisão pendente 1).

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Expor as impressoras do Windows ao renderer | [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20) | [20-list-windows-printers-ipc.md](./tasks/20-list-windows-printers-ipc.md) | — | pendente |
| 02 | Tela de impressoras conferindo o nome contra o device | [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) | [21-printers-screen-read-only.md](./tasks/21-printers-screen-read-only.md) | 01 | pendente |
| 03 | Editar a impressora na API, com 403 tratado | [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22) | [22-printers-screen-write.md](./tasks/22-printers-screen-write.md) | 02 | pendente |
| 04 | Tela de configurações de impressão (`printerSettings`) | [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23) | [23-printer-settings-screen.md](./tasks/23-printer-settings-screen.md) | 02 | pendente |
| 05 | Imprimir teste local | [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24) | [24-local-test-print.md](./tasks/24-local-test-print.md) | 01 | pendente |
| 06 | Emitir `printer:status` por impressora | [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) | [25-emit-printer-status.md](./tasks/25-emit-printer-status.md) | 01 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03 → 04 → 05 → 06.

A 01 é base de três outras. A 02 entrega valor sozinha (diagnóstico) e cria o layout que a 03 e a 04 reusam. A 05 poderia vir mais cedo, mas depois da 02 ela já nasce com a lista de impressoras na tela. A **06 é a última porque está bloqueada por outro repo** — se o relay não estiver publicado quando chegar a vez, ela fica `⛔ bloqueada` e a spec fecha sem ela.

## Dependências de outros repos

| O quê | Onde | Efeito se não existir |
| --- | --- | --- |
| Relay de `printer:status` no namespace `/admin` | [sgrande-delivery/delivery-socket-api#50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50) | A task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) não tem como ser verificada: a emissão sai daqui e não chega a ninguém |
| `POST /printers/{id}/test-print` | [sgrande-delivery/delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205) | O botão de teste **do painel** continua em 404. Não afeta a task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24), que é local |
| Permissões `role:printer` e `role:printer-setting` no usuário que o PDV usa | `delivery-api` (dado, não código) | As telas mostram mensagem de permissão em vez de dados. Vale confirmar com o dev qual usuário os restaurantes usam no printer **antes** da task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) |
| Divergência de `station` (7 na API, 4 no tipo do admin) | `delivery-admin` | Nenhum aqui: esta spec segue a API. Vale issue lá |

## Verificação da entrega

- a 01 e a 05 precisam de **Windows com impressora de verdade**; em Linux a lista vem vazia ou diferente, e isso é o caso de borda que a 01 tem de tratar
- a 02 e a 03 se verificam contra o ambiente de dev da API (`api-dev.sgrande.delivery`, que é o que `.env.development` aponta): criar uma impressora com nome errado no painel, ver a tela acusar, corrigir no PDV e ver o painel refletir
- a 04 se verifica nos dois sentidos, e o critério que importa é `delivery_printer_version` **intacto** depois do `PUT` feito pelo app
- a 06 só se verifica com o relay no ar, e a verificação é o painel, não o nosso log

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. Candidatos: o shape real de getPrintersAsync no Windows
     (campos além de name e isDefault), e se o usuário do PDV tem as permissões. -->

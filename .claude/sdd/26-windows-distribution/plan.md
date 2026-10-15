# Plan — Distribuição no Windows: instalador e assinatura

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26)
**Branch de trabalho:** `feat/26-windows-distribution`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

Três frentes quase independentes:

- **instalador** (`build.nsis` no `package.json`) — não depende de decisão externa, e é onde está o risco técnico real (RN-02: per-machine × atualização automática)
- **assinatura** (`build.win` + secrets na esteira) — bloqueada pela escolha do certificado
- **documentação de suporte** — depende do que as duas primeiras definirem, e do log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) para dizer onde ele fica

A verificação da RN-02 não é opcional nem é teste de mesa: precisa de duas versões empacotadas, uma instalada e a outra publicada, para a atualização acontecer de verdade. Isso usa o fluxo de release que a spec [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7) define, então **esta spec vem depois dela**.

## Decisões arquiteturais

- **`artifactName` não é definido.** Deixar o default é o que mantém `SGrande-Delivery-Printer-Setup-<version>.exe`, que é o que o painel espera (RN-01). Definir explicitamente o mesmo valor também serviria, mas acrescenta um lugar para errar.
- **A assinatura entra pela esteira, não pela máquina de ninguém.** Assinar local com token físico produz release que só uma pessoa consegue publicar.
- **Se per-machine quebrar a atualização automática, per-machine é que cai** (decisão pendente 3). Instalação compartilhada entre logins é conveniência; atualização silenciosa é a razão de o app existir no formato em que está.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Instalador per-machine, com atalhos e instalação silenciosa | [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27) | [27-nsis-per-machine.md](./tasks/27-nsis-per-machine.md) | — | pendente |
| 02 | Assinar o instalador e o executável | [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28) | [28-code-signing.md](./tasks/28-code-signing.md) | — | pendente |
| 03 | Documentar instalação e suporte | [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29) | [29-support-install-docs.md](./tasks/29-support-install-docs.md) | 01, 02 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03, com a ressalva de que a **02 está bloqueada pela decisão pendente 1 da spec** (qual certificado). Se a decisão não existir quando chegar a vez dela, o `/execute` a marca `⛔ bloqueada` e segue para a 03 com o que a 01 entregou — a documentação de suporte vale sem a assinatura.

Esta spec **depende da [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)** (esteira e release) estar entregue: a verificação da RN-02 exige publicar duas versões pelo fluxo novo.

## Dependências de outros repos

| O quê | Onde | Efeito |
| --- | --- | --- |
| Link de download hardcoded com o nome do arquivo | `delivery-admin`, `pages/printer-settings/PrinterSettingsForm.tsx` | Restringe `productName`/`artifactName` (RN-01). Não é mudança lá, é restrição aqui |
| `delivery_printer_version` atualizado depois de cada release | `delivery-admin`, `PUT /printerSettings` | Sem isso, o painel oferece a versão anterior — já coberto pelo checklist da task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10) |

## Verificação da entrega

- **duas máquinas Windows limpas** (ou máquinas virtuais): uma para instalar a versão anterior e receber a atualização, outra para a instalação do zero com o SmartScreen virgem
- a verificação da RN-02 é a que decide a decisão pendente 3, e tem de ser feita **antes** de publicar a versão assinada para o parque
- `signtool verify /pa <arquivo>` (ou as propriedades do arquivo no Explorer) para a assinatura
- instalação silenciosa com a flag documentada, numa máquina sem interação

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. O resultado da verificação per-machine × atualização
     automática é o fato mais importante desta spec: registrar aqui com detalhe. -->

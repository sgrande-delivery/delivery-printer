# Plan — Esteira: checagem em PR e publicação só a partir de release

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)
**Branch de trabalho:** `feat/7-ci-pr-gate-and-release`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

Dois workflows em vez de um:

- `.github/workflows/ci.yml` — `pull_request` e `push: master`. Typecheck, lint, test, build. Não publica
- `.github/workflows/publish.yml` — evento de `release`. Confere tag × versão, builda e publica

O `publish.yml` atual já faz typecheck e test antes de empacotar, e isso **continua**: ele é a última linha, e a release não pode sair de um commit que não compila só porque o PR passou semanas antes.

A conferência tag × versão é um passo de shell lendo `package.json` com `node -p` e comparando com `github.event.release.tag_name`, antes de qualquer `npm ci`.

## Decisões arquiteturais

- **A esteira não publica a release.** O portão de instalar o `.exe` e conferir antes de qualquer PDV ver a versão é o que impede um defeito de empacotamento de virar parque quebrado — e é o único portão que existe, porque não há canal beta.
- **A versão continua manual.** Automatizar o bump sem automatizar o `delivery_printer_version` do admin (RN-04) dá a falsa sensação de fluxo automático com um passo manual escondido no meio.
- **A conferência falha a esteira, não corrige.** Corrigir a tag por Action significaria mexer em tag publicada; errar a versão é erro humano que a pessoa desfaz em dez segundos.
- **O `ci.yml` roda também em `push: master`** — merge via "squash and merge" não reexecuta o check do PR, e é bom ter o sinal do que de fato está em `master`.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Rodar typecheck, lint, test e build em PR | [#8](https://github.com/sgrande-delivery/delivery-printer/issues/8) | [8-ci-on-pull-request.md](./tasks/8-ci-on-pull-request.md) | — | pendente |
| 02 | Publicar só quando a release for criada, conferindo tag e versão | [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9) | [9-publish-on-release-created.md](./tasks/9-publish-on-release-created.md) | 01 | pendente |
| 03 | Atualizar a documentação do fluxo de release e o rollback | [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10) | [10-document-release-flow.md](./tasks/10-document-release-flow.md) | 02 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03. A 01 primeiro porque é ela que dá rede para as outras duas (e para todas as specs seguintes). A 03 depois da 02 porque documenta o que a 02 **mediu**, não o que se imaginou: a decisão pendente 1 da spec só fecha na 02.

## Dependências de outros repos

Nenhuma para implementar. Uma para operar, registrada na RN-04: depois de publicar, o campo `delivery_printer_version` precisa ser atualizado no `delivery-admin` (`PUT /printerSettings`), senão o link de download do painel aponta para a versão anterior. Entra no checklist da task 03.

## Verificação da entrega

- a 01 se verifica abrindo um PR de verdade com erro plantado
- a 02 **não se verifica em dry-run**: precisa de uma release de teste. Usar uma versão de teste (ex.: a próxima patch) num rascunho, conferir os assets, e **apagar o rascunho** depois. Não publicar
- a 03 é revisão humana dos quatro arquivos, mais um teste de mesa do rollback

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. A medição da task 02 sobre qual atividade do evento `release`
     dispara a esteira, e sobre o comportamento do electron-builder com release já existente, entra
     aqui — é o tipo de fato que ninguém quer medir duas vezes. -->

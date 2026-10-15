# 08 — Rodar typecheck, lint, test e build em PR

**Issue:** [#8](https://github.com/sgrande-delivery/delivery-printer/issues/8)
**Feature:** [Esteira: checagem em PR e publicação só a partir de release](../spec.md) — issue #7
**Tipo:** chore
**Processo:** build
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Criar `.github/workflows/ci.yml` rodando em `pull_request` e em `push` para `master`, com typecheck, lint, test e build — sem publicar nada. Hoje um PR entra sem checagem nenhuma.

## Contexto

- `.github/workflows/publish.yml` é o único workflow, roda em `push: branches: [master]` e já faz typecheck + test + build antes de empacotar: a checagem existe, mas só depois do merge
- Cobre a **RF-01** da spec
- O runner é `windows-latest` no publish, por causa do NSIS. Para checagem **não** há essa necessidade: `ubuntu-latest` é mais rápido e mais barato, e o que o `ci.yml` roda (tsc, eslint, vitest, electron-vite build) não depende de Windows. A diferença fica registrada
- `node-version-file: .nvmrc` (Node 24) e `cache: npm`, como o workflow atual
- `npm run lint` aqui **não** tem `--fix`: roda na esteira sem sujar nada
- `npm ci` é o comando certo, e ele falha se o `package-lock.json` não acompanhar o `package.json`

## Mudanças

### 1. O workflow

`.github/workflows/ci.yml` (novo):

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

O `build` entra porque ele é o que pega erro de configuração do electron-vite e de variável de ambiente ausente (`buildTimeConstants` falha alto), e leva ~1,5 s.

### 2. Nada de publicação

O `ci.yml` **não** tem `GH_TOKEN` nem chama electron-builder. Essa separação é o ponto da task.

## Testes

Não há teste automatizado de workflow. A verificação é empírica:

- abrir um PR com um erro de tipo plantado e ver o check reprovar, com o erro legível no log
- corrigir e ver aprovar
- confirmar na aba Actions que o `ci.yml` não criou release nem assets

## Critérios de aceitação

- [ ] PR mostra o check com os cinco passos, e reprova com erro de tipo
- [ ] O check também roda no `push` para `master`
- [ ] `cancel-in-progress` funciona: um segundo push cancela a execução anterior
- [ ] O `ci.yml` não publica nada e não usa o secret `TOKEN`
- [ ] O `publish.yml` segue intacto nesta task

## Fora de escopo

- Mudar o gatilho ou o conteúdo do `publish.yml` — task [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9)
- Rodar a suíte em matriz de Node ou de sistema: o app roda num Node só, o do `.nvmrc`
- `npm audit` na esteira: as 10 vulnerabilidades moderadas de hoje são todas de devDependency, e reprovar o PR por elas pararia o trabalho sem reduzir risco

## Branch

`feat/7-ci-pr-gate-and-release`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

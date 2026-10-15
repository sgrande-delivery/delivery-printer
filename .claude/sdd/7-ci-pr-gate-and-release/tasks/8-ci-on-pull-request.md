# 08 — Rodar typecheck, lint, test e build em PR

**Issue:** [#8](https://github.com/sgrande-delivery/delivery-printer/issues/8)
**Feature:** [Esteira: checagem em PR e publicação só a partir de release](../spec.md) — issue #7
**Tipo:** chore
**Processo:** build
**Depende de:** (nenhuma)
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

build (esteira)

### Arquivos criados/alterados

- `.github/workflows/ci.yml` (novo, 41 linhas). O `publish.yml` ficou **intocado** — é da task [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9)

### O que o workflow faz

`pull_request` (sem filtro de branch) e `push` em `master` → `npm ci`, `typecheck`, `lint`, `test`, `build`. Nenhum `GH_TOKEN`, nenhum electron-builder: a separação entre **checar** e **publicar** é o ponto da task.

`concurrency` com `group: ci-${{ github.ref }}` e `cancel-in-progress: true`.

### Decisões

- **`ubuntu-latest`**, e não `windows-latest` como o `publish.yml`: só o empacotamento NSIS depende de Windows; tsc, eslint, vitest e electron-vite build não. Mais rápido e mais barato, e está comentado no YAML
- **`pull_request` sem `branches:`** — de propósito: as seis specs desta frente abrem PR contra branch que não é `master`, e com filtro o check não rodaria em nenhuma delas
- Steps nomeados no estilo do `publish.yml`; sem `fetch-depth`, porque nada aqui precisa do histórico
- O `build` entra porque é ele que pega erro de configuração do electron-vite e variável de ambiente ausente (o `buildTimeConstants` falha alto)

### Nota de YAML, para quem escrever script depois

`yaml.safe_load` devolve as chaves `['name', True, 'concurrency', 'jobs']`: em YAML 1.1 o `on:` sem aspas é o booleano `True`. O GitHub tem parser próprio e aceita; o `publish.yml` já era assim, e o estilo foi mantido. **Script nosso que ler esse arquivo precisa buscar `d[True]`, não `d['on']`.**

### Verificação

Os quatro comandos rodados por mim nesta máquina, na ordem do workflow: typecheck 0 · lint 0 erros e 1 aviso (o `Login.tsx:23` da base) · 3 testes em 2 arquivos · build em ~0,9 s, 176 módulos. O `npm ci` sai 0, o que confirma que o lockfile acompanha o `package.json`.

### O que foi verificado no GitHub, medido em 2026-10-15

O workflow **rodou** no PR desta spec ([#31](https://github.com/sgrande-delivery/delivery-printer/pull/31)) — run `38773521265`, sha `1e14f82`, evento `pull_request`, job `check`: **success**. Então dois dos três critérios estão fechados:

- **o check aparece no PR:** ✅ apareceu e passou
- **a aba Actions não cria release nenhum:** ✅ a `Latest` do repo continua a `2.6.0` de 2026-01-12, anterior a este trabalho — nenhum release novo

### O que continua não verificado

- **o check reprova com erro de tipo** — ninguém introduziu um erro para ver reprovar, então o que está provado é que ele passa quando deve passar, não que barra quando deve barrar. É a assimetria que esta execução encontrou cinco vezes em teste de unidade, e vale igual para o CI
- **o `cancel-in-progress` cancela a execução anterior** — exige dois pushes rápidos na mesma branch, e só houve **um** run

## Branch

`feat/7-ci-pr-gate-and-release`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

# 74 — Rodar a suíte também no windows-latest no ci.yml

**Issue:** [#74](https://github.com/sgrande-delivery/delivery-printer/issues/74)
**Feature:** [Paridade de plataforma entre o gate de PR e a esteira de publicação](../spec.md) — issue #72
**Tipo:** chore
**Processo:** build
**Depende de:** 73
**Status:** executada

## Objetivo

Fazer o gate de PR reprovar o que a esteira de publicação reprovaria, rodando testes e build também no `windows-latest`. É o que impede o próximo teste dependente de plataforma de só aparecer no dia do release.

## Contexto

- Cobre **RF-02** e as **RN-02** e **RN-06** da spec.
- Estado atual: `.github/workflows/ci.yml:16` fixa `runs-on: ubuntu-latest` para o job `check`, que roda `npm ci`, typecheck, lint, test e build. O `publish.yml` roda os mesmos quatro últimos em `windows-latest` (`publish.yml`, job `publish`), de propósito, para o NSIS não depender de wine.
- **A consequência estrutural, que é o motivo desta task:** um teste cujo resultado depende do Windows **nunca pode falhar no gate de PR e nunca pode passar na esteira de publicação**. O defeito da task 73 viveu quatro specs em verde por isso.
- `.github/workflows/ci.yml:13-14` carrega o comentário que declara a premissa derrubada: *"Checks (tsc, eslint, vitest, electron-vite build) do not depend on Windows; only the NSIS packaging in publish.yml does."* Ele **sai** nesta task — comentário que afirma o contrário do que o arquivo faz é pior que comentário nenhum, e é o convite para alguém reverter a matriz achando que ela é desperdício.
- **Matriz por step, não por workflow** (RN-06): `test` e `build` são os que tocam caminho, `fs` e empacotamento; `typecheck` e `lint` não têm comportamento dependente de plataforma, e duplicá-los só dobra o tempo do gate.
- O `concurrency` do `ci.yml:8-10` é por `github.ref` com `cancel-in-progress: true` — correto para gate de PR, e a matriz não muda isso.

## Mudanças

### 1. A matriz no job `check`

`.github/workflows/ci.yml` (alterado):

```diff
 jobs:
   check:
-    # Checks (tsc, eslint, vitest, electron-vite build) do not depend on Windows;
-    # only the NSIS packaging in publish.yml does.
-    runs-on: ubuntu-latest
+    # The suite and the build run on both systems because publish.yml packages on
+    # Windows: a test whose result depends on the platform could otherwise never fail
+    # the PR gate and never pass the publishing pipeline. That is exactly how the
+    # printFonts path assertion took down the v3.0.0 release. Typecheck and lint stay
+    # on Linux alone -- neither touches fs or paths, and a slow gate gets switched off.
+    strategy:
+      fail-fast: false
+      matrix:
+        os: [ubuntu-latest, windows-latest]
+
+    runs-on: ${{ matrix.os }}
```

`fail-fast: false` de propósito: querendo saber se o defeito é **de uma** plataforma ou **das duas**, cancelar a outra metade esconde metade da resposta.

### 2. Typecheck e lint só no Linux

`.github/workflows/ci.yml` (alterado), nos dois steps:

```diff
       - name: Typecheck
+        if: matrix.os == 'ubuntu-latest'
         run: npm run typecheck

       - name: Lint
+        if: matrix.os == 'ubuntu-latest'
         run: npm run lint
```

## Testes

Não há teste automatizado desta mudança — ela **é** infraestrutura de teste. O que a verifica:

### Verificação no próprio PR

- O PR desta spec roda nas duas plataformas e o `windows-latest` fica **verde**: é a primeira vez que o repositório vê isso, e só é possível porque a task 73 entrou antes.
- Num commit descartável (não commitado na branch final), reintroduzir a asserção POSIX da task 73 tem de **reprovar** o PR, pelo job do Windows e só por ele. É a prova de que a matriz pega o que precisava pegar.

### Integração / sanity

- `npm run typecheck`, `npm test` e `npm run lint` continuam passando localmente.
- Conferir no run que o job do Windows **não** executou typecheck nem lint (os dois `if`), e que o do Linux executou os cinco steps.

## Critérios de aceitação

- [ ] O `ci.yml` roda `test` e `build` em `ubuntu-latest` **e** `windows-latest`
- [ ] `typecheck` e `lint` rodam só no Linux
- [ ] O job do Windows fica verde no PR desta spec
- [ ] Um teste dependente de caminho Windows reprova o PR, e só pelo job do Windows (conferido num commit descartável)
- [ ] O comentário que afirma que os checks não dependem do Windows não existe mais
- [ ] O `ci.yml` continua sem publicar nada

## Implementação

Executada em 2026-11-10, commit único. Arquivos: `.github/workflows/ci.yml` e `.claude/rules/autoupdate.md`.

**`ci.yml`** — o job `check` ganhou `strategy.matrix.os: [ubuntu-latest, windows-latest]` com `fail-fast: false`, `runs-on: ${{ matrix.os }}`, e `typecheck`/`lint` condicionados ao Linux. O comentário que afirmava que os checks não dependem do Windows saiu.

**`autoupdate.md`** — a regra descrevia o `ci.yml` como um job só. A matriz é invariante de release (é ela que dá paridade com o `publish.yml`, que empacota em Windows), então foi para lá, com o motivo e a consequência operacional.

### Duas correções que vieram do review

1. **A justificativa do comentário estava errada.** O texto prescrito pela task dizia que typecheck e lint *"não tocam fs nem caminho"* — falso ao pé da letra: o `tsc` resolve dois tsconfigs e o `paths`, e o `eslint .` varre a árvore. O que é verdade, e é argumento mais forte, é que **o veredito** deles não muda com o SO, e que o único eixo que mudaria — caixa de nome de arquivo — é **mais estrito no Linux**. Deixar a justificativa falsa seria repetir o defeito que esta própria task existe para remover.
2. **`if: runner.os == 'Linux'` em vez de `matrix.os == 'ubuntu-latest'`.** Com a forma literal, fixar a matriz num label específico um dia (`ubuntu-24.04`, como se faz quando o `-latest` anda) faria os dois `if` deixarem de casar, e typecheck e lint passariam a rodar em **nenhuma** plataforma, sem nada ficar vermelho. É a família de falha da RN-03 desta spec, dentro da task que a combate.

### Verificação

- YAML parseado: matriz com os dois sistemas, `fail-fast: false`, `if` só em `Typecheck` e `Lint`, `test` e `build` sem `if`, `on` e `concurrency` intocados.
- `npm run typecheck` 0 · `npm test` 73 arquivos / 807 testes · `npm run lint` 0 erros e 1 aviso (o da base).
- **Branch protection conferido:** o ruleset `master-protection` tem só `deletion`, `non_fast_forward` e `pull_request` (0 aprovações). **Não há `required_status_checks`**, então o check mudar de nome (`check` → `check (ubuntu-latest)` / `check (windows-latest)`) não trava PR. Era o risco não óbvio da matriz.
- **Custo medido, e menor do que parece:** o repo é público, então minuto de runner Windows **não é faturado**. No run da v3.0.0 o leg Windows levou ~2 min 48 s até o Test (suíte 53 s contra 10 s no Linux); os dois legs correm em paralelo, então o relógio do gate vai de ~1,5 min para ~3 min.

**Não verificado, e só o PR prova:** o leg Windows verde (o step `Build` nunca foi exercitado nesta árvore — ficou *skipped* no run que falhou), e a mutação do commit descartável reprovando só pelo job do Windows.

## Fora de escopo

- **Adicionar `macos-latest`.** Ninguém empacota nem roda o app em macOS; seria custo sem cobertura.
- **Pôr a matriz no `publish.yml`.** Ele já roda só no Windows, que é o que ele precisa ser.
- **Mudar o `concurrency`** de nenhum dos dois workflows.
- O guard da promoção — task 75.

## Branch

`feat/72-ci-windows-test-parity`, cortada de `origin/master` em 2026-11-10. Todas as tasks da spec rodam nela, com um commit por task.

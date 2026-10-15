# Plan — Esteira: checagem em PR e publicação só a partir de release

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)
**Branch de trabalho:** `feat/7-ci-pr-gate-and-release`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15: todas as tasks em sequência, um commit por task e um PR no fim

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
| 01 | Rodar typecheck, lint, test e build em PR | [#8](https://github.com/sgrande-delivery/delivery-printer/issues/8) | [8-ci-on-pull-request.md](./tasks/8-ci-on-pull-request.md) | — | executada |
| 02 | Publicar só quando a release for criada, conferindo tag e versão | [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9) | [9-publish-on-release-created.md](./tasks/9-publish-on-release-created.md) | 01 | executada |
| 03 | Atualizar a documentação do fluxo de release e o rollback | [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10) | [10-document-release-flow.md](./tasks/10-document-release-flow.md) | 02 | executada |

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

Da task 02 (#9) — são os fatos que a spec mandava medir, e nenhum deles é dedutível:

- **Draft não dispara workflow.** Documentação do GitHub, literal: *"Workflows are not triggered for the `created`, `edited`, or `deleted` activity types for draft releases."* O desenho "draft + `created`" que a spec preferia **não existe**. O gatilho é `release: [published]`, e a segurança passa a vir de a release nascer **pré-release** — que o `/releases/latest` ignora como ignora draft.
- **A documentação NÃO diz quais activity types disparam na promoção** de uma pré-release. Por isso o gate não infere intenção pelo evento: ele olha o **estado** (promoção já tem `latest.yml`; release criada direto não tem nada). Esse desenho é correto nos dois casos possíveis, e é o que vale copiar quando um gatilho do GitHub tiver semântica incerta.
- **`releaseType` do `build.publish` decide se o upload acontece.** `electron-publish/out/gitHubPublisher.js`, `getOrCreateRelease()`: achando a release pela tag, se ela **não** é draft e `releaseType === "draft"` (o default, quando o campo não é declarado), ele faz `log.warn("GitHub release not created")` e **`return null`** — nada é anexado e **o processo sai 0**. Daí o `releaseType: "prerelease"`. **Atenção:** ele não é guarda — com `prerelease` o publisher sobe para draft, pré-release **e release normal** igualmente. Quem recusa o caso perigoso é o job `gate`.
- **A regra das 2 horas só passou a existir agora.** No mesmo `getOrCreateRelease()`, release **draft** retorna antes de qualquer checagem de tempo; com pré-release (não-draft) vale a regra de recusar upload em release publicada há mais de 2 h — e a recusa é `log.warn` + `return null` + **exit 0**, ou seja run verde com zero asset. Re-rodar o job no dia seguinte (secret corrigido, runner na fila) basta para cair nela. Fechado com `EP_GH_IGNORE_TIME: 'true'` no step de empacotamento (`isEnvTrue` aceita `"true"`, conferido na fonte). Com isso os três caminhos de `return null` ficam fechados: não-draft+draft (impossível), 2 h (desligado) e release inexistente (`--publish always` cria).
- **`releaseType` vai para o `app-update.yml` embarcado, e é inerte no cliente.** Medido empacotando: o campo aparece junto de `owner/repo/private`. `grep -rn releaseType node_modules/electron-updater/out/` dá **zero**, e `allowPrerelease` é `false` por default (`AppUpdater.js:125`), com `src/main/updater.ts` não tocando nele — então nenhum PDV instala pré-release. Fica registrado porque é campo novo atravessando a fronteira para a máquina do cliente: se o electron-updater um dia passar a lê-lo, isto vira o bug que não aparece aqui.
- **A receita de inspeção do asar em `.claude/rules/autoupdate.md` está errada:** nesta versão o `app-update.yml` **não** está dentro do `app.asar` (o `npx asar extract-file` falha com *"was not found in this archive"*); ele fica em `release/linux-unpacked/resources/app-update.yml`. Corrigido na task 03 (#10), que é a dona da documentação.
- **Mensagem de erro que mostra os dois valores iguais é mensagem inútil.** A primeira versão da checagem de tag, com a tag `2.7.0` (sem o `v`, erro provável de quem digita na UI), lia *"a tag 2.7.0, mas o package.json está em 2.7.0"* — na exata situação para a qual a checagem existe. Passou a dizer também qual é a tag esperada.
- **Payload ilegível precisa de mensagem própria.** O gate herdava o `::error::` que manda apagar e recriar a release, que é conselho **destrutivo** quando a causa real é um payload que não parseia. Separar "não consegui ler" de "li e julguei" é o que impede o diagnóstico errado.
- **Dívida: `npm run release` mudou de comportamento sem o diff tocá-lo.** `electron-builder build --publish always` rodado na máquina de um dev, para uma versão sem release, antes criava um **draft** (invisível) e agora cria uma **pré-release publicada** — visível no repo público, fora da `Latest` (inofensiva para o parque, mas visível). Agora que quem publica é a esteira, vale considerar remover esse script. Decisão de outra task.

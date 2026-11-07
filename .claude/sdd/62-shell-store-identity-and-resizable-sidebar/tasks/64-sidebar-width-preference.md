# 64 — A largura da sidebar como preferência em `userData`

**Issue:** [#64](https://github.com/sgrande-delivery/delivery-printer/issues/64)
**Feature:** [Identidade da loja e sidebar redimensionável no shell](../spec.md) — issue #62
**Tipo:** feature
**Processo:** main+renderer (par de canais IPC)
**Depende de:** —
**Status:** executada

## Branch

`feat/62-shell-store-identity-and-resizable-sidebar`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-07.

## Objetivo

Guardar a largura da sidebar por instalação, no arquivo de preferências de UI que já existe, com o par de canais para o renderer ler e gravar. **Sem UI nesta task** — ela é a fundação da #65, e vem antes porque é onde estão os modos de falha caros.

## Contexto

- Cobre a **RF-04** e as **RN-01**, **RN-02**, **RN-03** e **RN-06** da spec
- **O arquivo existe e foi feito para isto.** `src/main/theme.ts` guarda `ui-preferences.json` em `app.getPath('userData')`, e o comentário do `PREFERENCES_FILE` diz: *"An object, not the bare string: it is the first UI preference file, and the next preference should not need a second one."*
- **A armadilha, e é o motivo desta task existir separada:** `writePreference` grava `writeFileAtomic(preferencesPath(), JSON.stringify({ theme: preference }))` — o objeto **inteiro**, com uma chave só. Um `writeWidth` escrito no mesmo molde **apaga o tema**. A falha é diferida: só aparece no próximo restart, quando o app volta no tema do sistema, e o relato que chega é "o app mudou de cor sozinho"
- **A leitura nunca lança e nunca escreve** (`readPreference`, `:23-52`): arquivo ausente, JSON inválido e valor fora do enum caem no default com `logger.warn` — e **não** regravam. A largura segue a mesma política (RN-06): valor fora da faixa entra **clampado**, sem corrigir o disco
- **O par de canais é o modo de falha nº 1 deste repo.** O nome mora em `src/shared/ipcChannels.ts`, e canal novo são **quatro** pontos: a constante, a linha do preload (`src/main/preload.ts`, o tema está em `:105-109`), o `ipcMain.handle` (`src/main/main.ts:41-42`) e o stub do `src/__tests__/setup.ts` (`:31-32`). O teste `src/shared/__tests__/ipcChannels.test.ts` é um gate de **texto**: ele falha se a constante não aparecer nos dois lados, mas não prova comportamento
- **A faixa é de duas pontas:** o main clampa o que leu do disco e o renderer clampa o arrasto. Por isso ela mora em `src/shared/` — é o mesmo motivo de `src/shared/queueLimits.ts` existir, e o comentário de lá explica o padrão
- Decisão pendente **1** da spec dá a faixa: default **216**, mínimo **180**, máximo **360**

## Mudanças

### 1. `src/shared/sidebarWidth.ts` (novo)

A faixa e o saneamento, puros e sem Electron (`src/shared/` está no `include` dos **dois** tsconfigs, então nada de `node:fs` nem de DOM aqui):

- `SIDEBAR_DEFAULT_WIDTH`, `SIDEBAR_MIN_WIDTH`, `SIDEBAR_MAX_WIDTH`
- `clampSidebarWidth(value: unknown): number` — devolve o default para o que não é número finito (`undefined`, `null`, `'280'`, `NaN`, `Infinity`) e clampa o resto na faixa. **Um comentário tem de dizer por que `'280'` não é aceito:** o arquivo é editável à mão e `Number('')` é `0`, que passaria por `Number.isFinite` e cairia no mínimo em vez do default — foi a armadilha que o `delivery-admin` registrou no helper dele

### 2. `src/main/theme.ts` (alterado) — ou renomeado

O módulo deixa de ser "o do tema" e passa a ser o das preferências de UI. **Duas saídas, e a task aceita qualquer uma, desde que o relatório diga qual e por quê:** manter o nome (menor diff, nome que mente um pouco) ou renomear para `uiPreferences.ts` (nome honesto, diff maior, e o `theme.test.ts` acompanha). Em qualquer caso:

- **Uma função só lê o objeto inteiro do disco** (hoje `readPreference` lê e já extrai o tema). O tema e a largura passam a sair dela, cada um com o seu saneamento
- **A escrita é ler-modificar-gravar** (RN-01): grava `{ ...atual, theme }` ou `{ ...atual, sidebarWidth }`. Nunca um objeto montado de novo
- `writeFileAtomic` continua sendo o gravador, e a leitura continua **sem lançar e sem escrever**

### 3. `src/shared/ipcChannels.ts`, `preload.ts`, `main.ts`, `src/main/ipc-events/` (alterado/novo)

Dois canais em `INVOKE_CHANNELS`, no padrão `ui:` que o tema já usa (`ui:theme`, `ui:set-theme`): um para ler a largura, um para gravar. O handler novo em `src/main/ipc-events/on<Nome>.ts`, como os outros. O preload expõe as duas funções tipadas — e o tipo chega ao renderer sozinho pelo `typeof electronHandler`, **não** crie segunda declaração.

**O gravador resolve para a largura que passou a valer** (como `setUiTheme` resolve para o tema que passou a valer), porque é a largura clampada que a tela tem de adotar — e não a que ela pediu.

### 4. `src/__tests__/setup.ts` (alterado)

O stub das duas funções novas, ao lado de `uiTheme`/`setUiTheme` (`:31-32`). **Sem isso, qualquer componente que as chame quebra sob jsdom com `undefined is not a function`** — e quebra na task #65, não aqui, o que é o pior lugar para descobrir.

## Testes

### `src/main/__tests__/` — o teste do módulo de preferências (alterado)

O `theme.test.ts` já existe e já escreve arquivo real num diretório temporário. Casos novos, **e o primeiro é o que esta task existe para proteger**:

- **RN-01, nos dois sentidos:** gravar a largura e ler o **tema** de volta inalterado; gravar o tema e ler a **largura** de volta inalterada. Com a gravação ingênua (`JSON.stringify({ sidebarWidth })`) os dois caem
- Arquivo ausente → default, sem lançar
- JSON inválido → default, com um `warn`
- `{"sidebarWidth": 4}` e `{"sidebarWidth": 99999}` → clampados na leitura, e o **arquivo não é reescrito** (comparar o conteúdo antes e depois)
- `{"sidebarWidth": "280"}`, `null`, `true`, objeto → default
- Chave desconhecida no arquivo (`{"theme":"dark","futura":1}`) **sobrevive** a uma gravação de largura — é a mesma regra do payload da tela de impressão, e é o que permite uma versão futura acrescentar preferência sem que esta apague

### `src/shared/__tests__/sidebarWidth.test.ts` (novo)

A faixa e o `clampSidebarWidth` com a tabela de entradas inválidas acima. É teste puro e barato, e é o que impede o default e o mínimo de se confundirem.

### `src/shared/__tests__/ipcChannels.test.ts` (existente, deve passar sem edição)

Ele é o gate de texto do par de canais: se um dos dois lados ficar de fora, ele falha. **Confira também por `grep -rn "<nome-do-canal>" src/`** que os quatro pontos existem — o gate não cobre o `setup.ts`.

**Verificar por mutação:** trocar a escrita por `JSON.stringify({ sidebarWidth })` tem de derrubar os dois testes da RN-01; fazer a leitura regravar o valor clampado tem de derrubar o teste de "o arquivo não é reescrito"; remover o canal do preload tem de derrubar o `ipcChannels.test.ts`.

## Critérios de aceitação

- [ ] Gravar largura preserva o tema, e gravar tema preserva a largura — provado por teste nos dois sentidos
- [ ] Arquivo ausente, inválido, com largura fora da faixa ou com tipo errado: o app lê o default ou o valor clampado, sem lançar e sem reescrever o disco
- [ ] Chave desconhecida no arquivo sobrevive a uma gravação
- [ ] Os quatro pontos do canal existem (`grep`), e o `ipcChannels.test.ts` passa
- [ ] Nenhuma UI mudou nesta task
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

**Concluída em:** 2026-11-07

### Processos tocados

main, preload (renderer: só o stub de teste)

### Arquivos criados/alterados

- `src/shared/sidebarWidth.ts` (novo) — faixa 216/180/360 e `clampSidebarWidth`
- `src/main/theme.ts` -> `src/main/uiPreferences.ts` (renomeado) — leitura única do objeto, `readSidebarWidth`, `writeSidebarWidth`, escrita ler-modificar-gravar
- `src/main/ipc-events/onUiSidebarWidth.ts`, `onSetUiSidebarWidth.ts` (novos)
- `src/main/main.ts`, `window.ts`, `preload.ts`, `ipc-events/onUiTheme.ts`, `onSetUiTheme.ts`, `src/shared/ipcChannels.ts`, `src/__tests__/setup.ts`
- Testes: `src/main/__tests__/uiPreferences.test.ts` (renomeado e ampliado), `src/shared/__tests__/sidebarWidth.test.ts` (novo)
- Referências ao nome antigo: `src/renderer/app.css`, `.claude/rules/renderer-ui.md`

### Canais IPC criados

- `ui:sidebar-width` (`uiSidebarWidth`) e `ui:set-sidebar-width` (`setUiSidebarWidth`) — constante, preload, `main.ts` e stub do `setup.ts`

### Decisões que tomei por conta própria

- Renomeei para `uiPreferences.ts`: o módulo já não é só do tema, e só havia 5 importadores.
- Ausência da chave `theme` deixou de gerar `warn` (arquivo só com largura é normal e a leitura roda a cada refresh); tema presente e inválido ainda gera. O caso "a missing key" do teste antigo mudou de acordo.
- `writeSidebarWidth` aceita `unknown` e clampa em vez de recusar (o tema recusa): a tela adota o valor devolvido.
- Gravar sobre arquivo ilegível recomeça de `{}`.

### Verificação

- typecheck 0; lint 0 erros + 1 aviso (`Login.tsx`); 71 arquivos / 778 testes
- Mutações: escrita ingênua derruba 3 testes; leitura que regrava derruba 7; remover do preload derruba o `ipcChannels.test.ts`

### Fechamento (depois do review)

Quatro ajustes entraram, todos de "atenção" do review — nenhum bloqueante:

- **O caminho de escrita passou a deixar rastro.** `readSidebarWidth` já avisava; `writeSidebarWidth` não. Cenário concreto da task #65: o arrasto calcula `start + delta`, `start` chega `undefined` num re-render, vira `NaN`, grava **216**, a sidebar pula para o padrão e o `main.log` não tem uma linha — o relato que chegaria ao suporte é "a barra volta sozinha às vezes". Com teste próprio (`NaN`, `'x'`, `99999` avisam; 250 não), e a mutação que tira o aviso derruba 3 testes.
- **Os stubs do `setup.ts` passaram a clampar**, importando `clampSidebarWidth`/`SIDEBAR_DEFAULT_WIDTH` em vez de ecoar o argumento e do literal `216`. Sem isso, um teste da #65 que arraste para 900 veria o stub devolver 900 — valor que o canal real **nunca** resolve — e um bug de "o renderer não clampa o arrasto" passaria verde.
- O `{}` literal voltou para a asserção de silêncio, num `it.each` com os dois corpos.
- O único `as` do diff (`parsed as Stored`) ganhou a meia linha de justificativa que o `CLAUDE.md` pede.

Suíte final: **71 arquivos / 783 testes** (baseline da task 01: 70 / 744).

### O que o review mediu e vale guardar

- **Não há segundo caminho de escrita:** `writeFileAtomic` tem um só chamador neste módulo (`writeFields`), e `writePreference`/`writeSidebarWidth` passam os dois por ele. A RN-01 não tem furo — e a mutação para a escrita ingênua derruba 3 testes.
- **A leitura não cria arquivo:** com o `userData` vazio, ler as duas preferências deixa o diretório **vazio** — nem o `.tmp` do `writeFileAtomic` aparece.
- **O rename não deixou importador para trás**, e o `npm run build` passa — era o jeito objetivo de provar que renomear um módulo do main não quebra o bundling (o electron-vite tem `lib.entry` em `main.ts`/`preload.ts` e bundla o resto).
- **Um limite conhecido, não consertado:** `readStored()` devolve `null` para **qualquer** falha de leitura, inclusive um `EBUSY`/`EPERM` transitório do Windows (antivírus segurando o arquivo logo depois do `rename` do `writeFileAtomic`). Nesse instante o conteúdo era válido, e gravar a largura apagaria um tema fixado. Distinguir "não parseou" de "não abriu" é o conserto, se algum dia incomodar.

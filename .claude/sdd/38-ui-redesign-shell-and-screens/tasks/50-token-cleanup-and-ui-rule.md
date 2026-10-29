# 12 — Limpeza dos tokens antigos e a regra da UI

**Issue:** [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** chore
**Processo:** renderer
**Depende de:** 01–11
**Status:** shipped

## Objetivo

Fechar a spec: apagar os apelidos de token que seguraram a migração, remover o que ficou órfão, e reescrever a regra da UI, que hoje descreve uma interface que deixou de existir.

## Contexto

- A task [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39) deixou os nomes antigos (`--color-primary`, `--color-text`, …) apontando para os novos, de propósito: é o que permitiu as dez tasks seguintes irem uma a uma, com cada commit coerente. Essa camada tem **data de validade, e é esta task**.
- **Esta task não muda aparência nenhuma.** Se mudar, é porque uma folha de estilo dependia de um apelido com valor diferente do token novo — e isso é defeito a corrigir, não a aceitar.
- `.claude/rules/renderer-ui.md` é carregada pelo Claude Code sempre que alguém abre arquivo em `src/renderer/**`. Hoje ela afirma coisas que a spec derrubou, e cada uma delas vira decisão errada na próxima task de quem a ler:
  - a tabela de tokens é a do MUI v4 (`--color-primary: #f0592a`, pesos 200/300/400)
  - "o `Routes.tsx` tem **duas** rotas hoje" — passaram a ser seis
  - "**não existe nenhum componente de navegação neste app**" — passou a existir
  - "o logo do login vem de URL remota" aparece como dívida conhecida — foi resolvida
  - os breakpoints transcritos do MUI e o `down('md')` que "está ativo na janela default"
  - a tabela dos primitivos de `base/`, que ganhou `Icon`, `Stepper`, `Switch` e variantes novas
- Cobre a **RN-11** e a **RN-15** (o que fica escrito é o que a próxima task vai seguir).

## Mudanças

### 1. Apagar a camada de apelido

Trocar cada uso do nome antigo pelo token novo nas folhas que sobraram, e **remover o bloco de apelidos** do `app.css`. Verificável: `grep -rn "\-\-color-" src/renderer/` sai vazio.

Enquanto estiver nessa varredura, caçar o que a migração deixou para trás:

- `grep -rn "#[0-9a-fA-F]\{3,6\}\|rgba(" src/renderer --include=*.css` — hex solto que devia ser token (RN-11). **O `rgba(` no grep não é zelo:** sem ele a varredura não acha `InsideSaving.module.css` (`rgba(250,250,250,.5)`, um véu claro que fica errado no tema escuro) nem os dois `rgba(0,0,0,.04)` de hover do `Button` e do `IconButton`, medidos no review da task 04. As exceções legítimas são o toast — fundo, texto **e o hover do botão** (`rgba(255,255,255,.08)`), literais nos dois temas de propósito —, e o `#fff` sobre `--accent` **e sobre `--side`** (a sidebar e o painel de marca do login usam os dois, e o desenho também)
- a `@media (min-width: 1200px)` da barra de rolagem e os breakpoints do MUI: a janela tem 1024 px e não é redimensionável para menos pelo operador — o que não é mais usado sai
- `grep -rn "react-icons" src/` — se o `RestaurantStatus` saiu na task [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44) e nada mais a importa, a dependência sai do `package.json`. **Rodar `npm ci` depois e dizer no relatório**, porque o CI roda `npm ci` e falha se o lockfile não acompanhar
- `src/renderer/images/logo192.png`, que estava guardado para a troca do logo do login — a troca aconteceu na task [#42](https://github.com/sgrande-delivery/delivery-printer/issues/42)
- componentes e folhas sem importador: `Status`, `RestaurantStatus`, `PrintersNotice`, `FailedJobList`, `FailedJobItem` — conferir um por um com `grep`, **não** apagar de memória. (`DefaultLayout` e `Main.module.css` já saíram na task 03.)
- **`InsideSaving` NÃO é órfão:** ele tem um importador, `Login.tsx:82`, e vai continuar tendo. O que ele precisa é de cor por token: o véu é `rgba(250,250,250,.5)` fixo, e desde a task 04 ele cobre **a coluna direita inteira** do login (~624×728) em vez do cartão de 400 px que deixou de existir — o ancestral posicionado mudou. No tema escuro isso é um véu claro grande
- **CSS que ficou morto por causa da spec**, confirmado por mutação no review da task 04: a variante `floating` do `TextField` (os dois passos do login eram os únicos consumidores e viraram `boxed`) e o `IconButton` `color="primary"` (`.colorPrimary`, cujo último consumidor era o ícone de voltar antigo). Decidir aqui se a `floating` morre ou fica documentada — ela tem teste honesto, então ficar não custa mentira

### 2. `src/shared/ipcChannels.ts`: o nome do canal num lugar só

Medido no review da task 08: **nenhum teste deste repo pega nome de canal divergente**. O `setup.ts` substitui `window.electron` inteiro, nenhum teste importa o `preload.ts` ou o `main.ts`, e os testes do main chamam os handlers direto — o `grep` da `printing.md` é o único gate. Pior nos quatro canais main→renderer, cujo nome é **literal duplicado em dois arquivos**: `queue:job-printed`, `queue:job-failed`, `queue:changed`, `app:before-quit` e `ui:theme-changed`. Renomear só o literal do preload deixa a suíte verde e a tela congelada.

Criar `src/shared/ipcChannels.ts` com as constantes e importar dos dois lados mata a classe inteira — é o tipo de conserto que a regra de impressão pede há três specs sem ter como cobrar.

### 3. Racionalizar a escala de tamanho do `Button`

Ela virou um nome por tela: `medium`, `small`, `large` (46), `action` (42), `hero` (48), e as tasks 09 a 11 acrescentam mais. A recomendação medida está nos "Aprendizados" do plan, em duas partes — classe-base compartilhada, e união **fechada** de alturas com a tabela dentro do primitivo, no precedente do `Icon`. Fazer as duas; só a segunda deixa a duplicação de `containedPrimary`/`hover` de pé.

### 4. Reescrever `.claude/rules/renderer-ui.md`

Mesma estrutura e mesmo tom, conteúdo novo:

- **Tokens:** a tabela das duas paletas, com a origem (`design/printer-v2.dc.html:13-14`), e a regra de que cor nova é token em `:root` **e** no bloco escuro — token que existe só num tema é um tema quebrado em algum canto
- **Tema:** `data-theme` no `<html>`, quem o escreve, e a regra de que componente lê token e não tema; mais o `titleBarOverlay`, que é do main (RN-04)
- **Ícones:** a fonte local, o primitivo `Icon` com a união de nomes, e por que não vem da internet (RN-01)
- **Primitivos:** a tabela atualizada — `Typography`, `Button`, `IconButton`, `TextField` (com as duas variantes, e a nota de não reordenar `<input>`/`<label>` na antiga), `Spinner` (com as duas formas), `Icon`, `Stepper`, `Switch`, `Chip`
- **Shell e rotas:** as seis rotas, o `AppShell` como dono **único** dos hooks de socket (RN-06), o `StateLayout`, a navegação por hash, e a regra de que rota nova precisa de item de menu
- **Arrastar a janela:** onde ficam as regiões e por que botão dentro delas precisa de `no-drag` (RN-13)
- **Dívida conhecida**, atualizada: o `Login` ainda chama `me()` ao montar; o interceptor de erro ainda empurra `/login` por conta própria; o `react-router-dom` em `6.28.1` com o advisory. **Sai** o logo remoto, que foi resolvido
- **A fila durável, que a regra ainda nega.** Hoje a `printing.md` afirma *"O estado é volátil. Não há banco nem arquivo de fila"* — falso desde a spec 15. A seção nova cobre: o arquivo em `userData`, o `MAX_ATTEMPTS`/`MAX_AGE_MS` que agora vivem em `src/shared/queueLimits.ts` (e por que não no worker), a **política de anúncio** (`queue:changed` entre tentativas, com o custo medido de duas leituras do arquivo por anúncio porque a sidebar e a tela montam o hook), o `nextAttemptAt` que vive **em memória** e se perde no restart, e os canais `queue:discard` e `queue:reprint`. Sem isso a próxima task que tocar a fila decide no escuro
- **Fidelidade:** que o desenho está em `.claude/sdd/38-ui-redesign-shell-and-screens/design/`, que ele é a referência de medida, e que as sete divergências estão na spec — para a próxima task não "consertar" uma delas sem saber que é deliberada

### 3. Atualizar o `CLAUDE.md` no que esta spec mudou

Duas correções pontuais, sem reescrever a seção:

- a tabela da **Stack** diz "UI: React 18, react-router-dom 6, CSS Modules (sem biblioteca de UI, sem CSS-in-JS)" — acrescentar a fonte de ícones local, que é dependência visual nova
- a seção **Fluxo de trabalho (SDD)** afirma que as labels `feature` e `task` **não existem** neste repo; elas existem (conferido em 2026-10-28, `gh label list`)

### 5. Duas decisões de acessibilidade que são de produto, não de limpeza

Medidas no review da task 05, e as duas vêm de seguir o desenho:

- **`--muted` no tema claro** (`#857a74` sobre `#faf7f5`) dá **3,91:1**, abaixo dos 4,5:1 da WCAG AA, e é o token da frase da sessão e da contagem regressiva, em 12-13 px. No escuro fica 5,06:1;
- **texto sem tamanho explícito sai em 14 px** (o `body { font-size: 0.875rem }` herdado do MUI) contra os 16 px do desenho.

Escurecer o `--muted` fecha o AA e **diverge do desenho**; manter preserva a fidelidade e deixa texto pequeno abaixo do mínimo. **Não decida sozinho:** leve ao dev, e o que sair vira linha na tabela "Fidelidade ao desenho" da spec.

### 6. Registrar os aprendizados no `plan.md`

Preencher a seção "Aprendizados que valem para as próximas tasks" com o que as onze tasks derrubaram ou descobriram. **Não é formalidade:** é o que a próxima spec de UI vai ler.

## Testes

- A suíte inteira, sem adaptação: esta task não muda comportamento. Teste que precisar mudar é sinal de que algo além de limpeza aconteceu — parar e olhar
- `grep -rn "\-\-color-" src/renderer/` vazio
- `grep -rn "react-icons" src/` vazio, se a dependência saiu
- `npm ci` depois de mexer no `package.json`
- `npm run build` com o peso do bundle **comparado ao da task [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39)** e ao baseline de 518 kB, reportado no relatório
- Manual: as oito telas (seis do shell, login, e as três de estado) nos dois temas, lado a lado com o desenho. É a última chance de pegar divergência acumulada

## Critérios de aceitação

- [ ] Nenhum `--color-*` sobrou, e a aparência **não** mudou nesta task
- [ ] Nenhum arquivo órfão, verificado por `grep` e não de memória
- [ ] `.claude/rules/renderer-ui.md` descreve a UI que existe, incluindo as divergências deliberadas
- [ ] As duas correções do `CLAUDE.md` feitas
- [ ] Os aprendizados estão no `plan.md`
- [ ] Peso do bundle reportado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- As dívidas que a regra registra (o `me()` do `Login`, o `history.push` do interceptor, o `react-router-dom` 7): continuam registradas, continuam sendo task própria
- Qualquer mudança de aparência

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

## Implementação

**Concluída em:** 2026-10-29

### Processos tocados

renderer, main e preload (só a origem do nome do canal), build (`package.json`/lockfile)

### Arquivos criados/alterados

- `src/renderer/app.css` — bloco de apelidos `--color-*` apagado; `--paper-rule` e `--paper-sub` nos dois temas
- `src/renderer/base/Button.tsx`, `Button.module.css` — tabela `METRICS` por altura, classe-base `.design`, um só `.containedPrimary`; `size`: `'medium' | 'small' | 32 | 34 | 38 | 42 | 44 | 46 | 48`
- `src/renderer/base/IconButton.*`, `Typography.module.css`, `TextField.module.css` — tokens novos; `color="primary"` removido
- `src/renderer/base/Select.*` e `__tests__/Select.test.tsx` — apagados (zero importadores)
- `src/renderer/images/logo192.png` — apagado
- `src/renderer/components/loading/InsideSaving.module.css` — véu por `color-mix` sobre `--bg`
- `src/renderer/components/printer-settings/PrinterSettingsForm.module.css` — hex do papel viram `--paper-rule`/`--paper-sub`
- `src/renderer/components/printers/printersGate.tsx` (novo), `Printers.tsx`, `test-print/TestPrint.tsx` — escada de estado extraída
- `NoConnection`, `Dashboard`, `Login`, `ErrorBoundary`, `QueueRow` — `size` por altura
- `src/shared/ipcChannels.ts` (novo), `src/main/preload.ts`, `main.ts`, `queue/print-queue.ts`, `app-events/onBeforeQuit.ts`
- `package.json`, `package-lock.json` — `react-icons` removido
- `.claude/rules/renderer-ui.md` (reescrita), `.claude/rules/printing.md` (fila durável, fluxo e IPC), `CLAUDE.md` (Stack e labels), `spec.md` (linha 14, decisões 6 e 7), `plan.md`
- Testes: `Button.test.tsx`, `printersGate.test.tsx`, `ipcChannels.test.ts` novos; asserções de classe de tamanho dos consumidores viraram `toHaveStyle({ height })`

### Canais IPC criados/alterados

Nenhum canal novo e nenhum nome mudou: os 20 existentes passaram a vir de `src/shared/ipcChannels.ts`.

### Decisões que tomei por conta própria

- Padding do `Button`: derivado de **altura × variante**, linha 14 mantida (ver `spec.md`)
- Três mudanças visuais mínimas, listadas no `plan.md`: hover do `contained` legado, hover `text` sem `rgba(0,0,0,.04)`, peso 400 do 38 px não-`contained`
- Apaguei `base/Select` e `IconButton color="primary"`; mantive `TextField floating`
- Acessibilidade (`--muted` e 14 px): **não decidi**, registrei como decisões 6 e 7 na `spec.md`

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso (`Login.tsx:22`, o do baseline)
- `npm test`: 64 arquivos, 622 testes, 0 falhas (586 − 3 do `Select` + 39 novos)
- `npm run build`: JS do renderer 641,90 → 642,26 kB; CSS 51,05 → 46,20 kB; main 36,71 → 37,48; preload 4,53 → 5,49
- `npm ci` depois de mexer no `package.json`: limpo

### Como testar

1. `npm run dev`, as oito telas nos dois temas, lado a lado com o desenho
2. Conferir o hover dos botões `text`/`IconButton` no tema escuro, o véu do login ao entrar, e o peso do "Cancelar" da gaveta

### O que o review mudou depois da primeira entrega

**Dois bloqueios, e os dois eram a própria ironia desta task:** ela existia em parte para consertar uma regra que mentia, e entregou **duas afirmações novas falsas**. Conferidas na fonte antes de corrigir:

1. A `printing.md` dizia *"oscilação de rede imprime de novo o que ainda não foi marcado"*. A varredura re-dispara e **a fila suprime** — `orderUuid` + `kind`, `already-printed` para irmão `printed`, `duplicate` para `pending`/`failed` (`print-queue-worker.ts:246-271`), e o livro sobrevive sem o HTML. Sai papel de novo só se o registro foi podado (24 h / 200) ou se o painel re-emitiu, que chega como `source: 'event'` e **não** é suprimido de propósito.
2. A `renderer-ui.md` dizia que a notificação nativa *"tem canal certo nos dois lados, mas ninguém a chama"*. É chamada em `usePrintingOrder.ts:41` e `usePrintingBoard.ts:49` desde a spec 13, e a assinatura é `{ title, body }`, não `orderSequence`.

**Mais quatro `arquivo:linha` desatualizados** (os `socket?.on` e a varredura), **uma afirmação velha sobre o `rawPrint`** (nenhuma tela o chama mais; o único código do renderer que o encosta é o `helpers/printFailure.ts`), **a versão do `react-router-dom`** (declarado `^6.28.1`, resolve `6.30.6`) e **quem consulta `useTheme()`** (o `StateLayout` e o `AppearanceSection`; o `ErrorBoundary` não).

**O `--page` ficou declarado nos dois temas e sem consumidor** desde a task 01, e a regra lhe dava uma função que nenhum CSS implementa. Virou linha "Reservado" na tabela de tokens, com a instrução de usar ou apagar — não inventar função nova.

**Três acabamentos:** o `height: size as number` do `Button` deixou de precisar da asserção (a altura viaja dentro do objeto de métricas); o comentário do `printersGate` passou a dizer o motivo real de ser função e não componente (o `null` que significa "continue desenhando", que um componente não comunica ao pai); e o `quietText` do botão de 38 px ganhou asserção — mutá-lo passava calado, e ele é o "Cancelar" da gaveta, que o desenho declara como `--text-2` (`:431`).

**A decisão do dev sobre acessibilidade entrou:** `--muted` do tema claro escurecido para `#756a64` (linha 15 da tabela de fidelidade, só no tema claro), corpo mantido em 14 px. As decisões pendentes 6 e 7 estão resolvidas na `spec.md`, e a seção de acessibilidade da `renderer-ui.md` — que até aqui mandava **não** escurecer — foi reescrita com o método: cor do desenho que carregue texto pequeno se mede contra os três fundos antes de ser aceita.

### Verificação

`npm run typecheck` 0; `npm run lint` 0 erros e 1 aviso (o de `Login.tsx`); `npm test` **64 arquivos, 622 testes, 0 falhas**; `npm run build` e `npm ci` passam. CSS do renderer **51,05 → 46,20 kB**; main e preload crescem ~1 kB cada, pelas constantes de canal inlinadas. `build.publish`, `version`, `electron-updater`, `electron-log`, `appId` e o teto do Electron 43: **intactos** — o diff do `package.json` é uma linha.

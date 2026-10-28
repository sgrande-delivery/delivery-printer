# 12 — Limpeza dos tokens antigos e a regra da UI

**Issue:** [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** chore
**Processo:** renderer
**Depende de:** 01–11
**Status:** pendente

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

- `grep -rn "#[0-9a-fA-F]\{3,6\}" src/renderer --include=*.css` — hex solto que devia ser token (RN-11). As exceções legítimas são o toast, que é literal nos dois temas de propósito, e o `#fff` sobre `--accent`
- a `@media (min-width: 1200px)` da barra de rolagem e os breakpoints do MUI: a janela tem 1024 px e não é redimensionável para menos pelo operador — o que não é mais usado sai
- `grep -rn "react-icons" src/` — se o `RestaurantStatus` saiu na task [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44) e nada mais a importa, a dependência sai do `package.json`. **Rodar `npm ci` depois e dizer no relatório**, porque o CI roda `npm ci` e falha se o lockfile não acompanhar
- `src/renderer/images/logo192.png`, que estava guardado para a troca do logo do login — a troca aconteceu na task [#42](https://github.com/sgrande-delivery/delivery-printer/issues/42)
- componentes e folhas sem importador: `DefaultLayout`, `Main`, `Status`, `RestaurantStatus`, `PrintersNotice`, `FailedJobList`, `FailedJobItem`, `InsideSaving` — conferir um por um com `grep`, **não** apagar de memória

### 2. Reescrever `.claude/rules/renderer-ui.md`

Mesma estrutura e mesmo tom, conteúdo novo:

- **Tokens:** a tabela das duas paletas, com a origem (`design/printer-v2.dc.html:13-14`), e a regra de que cor nova é token em `:root` **e** no bloco escuro — token que existe só num tema é um tema quebrado em algum canto
- **Tema:** `data-theme` no `<html>`, quem o escreve, e a regra de que componente lê token e não tema; mais o `titleBarOverlay`, que é do main (RN-04)
- **Ícones:** a fonte local, o primitivo `Icon` com a união de nomes, e por que não vem da internet (RN-01)
- **Primitivos:** a tabela atualizada — `Typography`, `Button`, `IconButton`, `TextField` (com as duas variantes, e a nota de não reordenar `<input>`/`<label>` na antiga), `Spinner` (com as duas formas), `Icon`, `Stepper`, `Switch`, `Chip`
- **Shell e rotas:** as seis rotas, o `AppShell` como dono **único** dos hooks de socket (RN-06), o `StateLayout`, a navegação por hash, e a regra de que rota nova precisa de item de menu
- **Arrastar a janela:** onde ficam as regiões e por que botão dentro delas precisa de `no-drag` (RN-13)
- **Dívida conhecida**, atualizada: o `Login` ainda chama `me()` ao montar; o interceptor de erro ainda empurra `/login` por conta própria; o `react-router-dom` em `6.28.1` com o advisory. **Sai** o logo remoto, que foi resolvido
- **Fidelidade:** que o desenho está em `.claude/sdd/38-ui-redesign-shell-and-screens/design/`, que ele é a referência de medida, e que as sete divergências estão na spec — para a próxima task não "consertar" uma delas sem saber que é deliberada

### 3. Atualizar o `CLAUDE.md` no que esta spec mudou

Duas correções pontuais, sem reescrever a seção:

- a tabela da **Stack** diz "UI: React 18, react-router-dom 6, CSS Modules (sem biblioteca de UI, sem CSS-in-JS)" — acrescentar a fonte de ícones local, que é dependência visual nova
- a seção **Fluxo de trabalho (SDD)** afirma que as labels `feature` e `task` **não existem** neste repo; elas existem (conferido em 2026-10-28, `gh label list`)

### 4. Registrar os aprendizados no `plan.md`

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

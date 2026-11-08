# Plan — Identidade da loja e sidebar redimensionável no shell

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#62](https://github.com/sgrande-delivery/delivery-printer/issues/62)
**Branch de trabalho:** `feat/62-shell-store-identity-and-resizable-sidebar`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-07. **O PR é `/ship-pr` contra `feature/api-v2-and-redesign`**, confirmado com o dev em 2026-11-07: nada é publicado naquele merge. Uma branch por spec, com todas as tasks em sequência, um commit por task e um PR no fim. A base é onde a #51, a #55 e a #61 (spec 56) já foram mergeadas — a #61 entrou em 2026-11-07, então a tabela de fidelidade da spec 38 já tem a linha 16 e as desta spec são a 17 e a 18. `master` não tem a tela redesenhada

## Abordagem técnica

Três camadas, e a fronteira entre elas é o que a spec protege.

**O nome da loja (task 01)** é só renderer: o `Sidebar` já lê `restaurant` do `useAuth()` na mesma linha em que lê `is_open` (`Sidebar.tsx:26`), e o pé já tem o bloco de status (`:85-96`). Uma linha nova ali, com truncamento por CSS e o nome inteiro no `title`. Zero rede, zero IPC.

**A preferência (task 02)** é main + preload + renderer, no padrão que o tema já desenhou:

- `src/main/theme.ts` guarda `ui-preferences.json` em `app.getPath('userData')` e escreve por `writeFileAtomic` (`src/main/atomicFile.ts`). O módulo passa a ter leitura e escrita da largura **sobre o mesmo objeto**, com ler-modificar-gravar (RN-01). O nome do arquivo e o `preferencesPath()` não se duplicam: se o módulo deixar de ser "o do tema", ele vira `uiPreferences.ts` — decisão da task, dita no relatório.
- Dois canais em `src/shared/ipcChannels.ts` (`INVOKE_CHANNELS`), espelhados no preload e no `main.ts`, mais o stub do `src/__tests__/setup.ts` (RN-02). O handler vai em `src/main/ipc-events/`, como os outros.
- A faixa (`min`, `max`, `default`) mora em `src/shared/`, não no componente: o main clampa na leitura e o renderer clampa no arrasto, e um número digitado duas vezes é como as faixas divergem. É o mesmo motivo de `src/shared/queueLimits.ts` existir.

**O punho (task 03)** é renderer, portando o padrão do admin (`ResizeHandle.tsx`, `SidebarResizeHandle.tsx`, `helpers/sidebarWidth.ts` da `feat/admin-v2`) para CSS Modules: punho absoluto na borda direita, `setPointerCapture`, `Escape` ouvido no `window` (durante o arrasto o foco pode estar em qualquer lugar), atributo em `document.body` enquanto arrasta (cursor e `user-select` da página inteira), e a largura escrita numa **CSS var** no `documentElement` a cada `pointermove` (RN-04). O `Sidebar.module.css` passa a ler `var(--sidebar-width, 216px)` em vez do `216px` fixo.

**O que o porte não traz do admin:** o `localStorage` (RN-03), o `zIndex: 3` (lá era para passar por cima das sub-sidebars, que aqui não existem) e o modo recolhido. E traz uma coisa que o admin não precisa: `-webkit-app-region: no-drag` no punho (RN-05).

## Decisões arquiteturais

- **A largura mora no `ui-preferences.json`, não em `localStorage`.** O arquivo existe, o comentário dele diz que foi feito objeto para a segunda preferência, e o app não usa `localStorage` em lugar nenhum. O custo é um par de canais IPC — e é ele que paga a RN-03 (preferência por instalação, sem contaminar a `delivery-api`).
- **Ler-modificar-gravar, e não um arquivo por preferência.** Dois arquivos nunca se apagariam, mas a cada preferência nova haveria um arquivo novo em `userData` e nenhuma delas seria a "preferência de UI" — além de contrariar o comentário do módulo.
- **A faixa em `src/shared/`.** Ela é regra de negócio de duas pontas: o main precisa dela para clampar o que leu do disco, e o renderer para clampar o arrasto.
- **O punho é componente do shell, não primitivo de `base/`.** Tem um consumidor; primitivo em `base/` quando o padrão aparecer em duas telas (`.claude/rules/renderer-ui.md`).

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | O nome da loja no pé da sidebar | [#63](https://github.com/sgrande-delivery/delivery-printer/issues/63) | [63-store-name-in-sidebar.md](./tasks/63-store-name-in-sidebar.md) | — | shipped |
| 02 | A largura como preferência em `userData` | [#64](https://github.com/sgrande-delivery/delivery-printer/issues/64) | [64-sidebar-width-preference.md](./tasks/64-sidebar-width-preference.md) | — | shipped |
| 03 | O punho de redimensionar a sidebar | [#65](https://github.com/sgrande-delivery/delivery-printer/issues/65) | [65-sidebar-resize-handle.md](./tasks/65-sidebar-resize-handle.md) | 02 | shipped |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03.

A **01** é independente e pequena, e entrega valor sozinha (o suporte já consegue ver a loja). A **02** é a fundação da 03 e tem os modos de falha mais caros (o par de canais e a gravação que apaga a outra preferência), então vem antes e com teste próprio — a 03 só liga a interface a algo que já funciona e já está provado. Inverter faria o punho ser testado contra uma persistência que ainda não existe, com a largura voltando ao padrão a cada abertura e sem saber de quem é a culpa.

## Dependências de outros repos

**Nenhuma.** Nada aqui consome rota nova, evento novo ou tela de outro repo, e nada sai no `printer_ping`. O padrão do punho é **lido** do `delivery-admin` (`feat/admin-v2`) como referência de implementação, não como contrato: se o admin mudar o dele, nada aqui quebra.

## Verificação da entrega

Além de `npm run typecheck`, `npm run lint` e `npm test`:

- **`npm run dev`, e nos dois temas:** o nome da loja no pé em todas as telas; arrastar o punho; `Escape` no meio do arrasto; duplo clique voltando ao padrão; Tab chegando ao punho com foco visível e as setas mudando a largura.
- **O teste que o jsdom não faz:** o punho **recebe o mouse** (RN-05). Em jsdom, apagar o `no-drag` sobrevive à suíte; só Electron mostra.
- **A RN-01, nos dois sentidos:** mudar a largura, fechar o app **pela bandeja**, reabrir e conferir o tema; depois mudar o tema, fechar, reabrir e conferir a largura. É o único jeito de ver a gravação que apaga a outra chave.
- **O arquivo, à mão:** apagar o `ui-preferences.json` (o app abre no padrão), e escrever largura fora da faixa (o app abre dentro dela).
- **Par de canais por `grep`:** `grep -rn "<nome-do-canal>" src/` tem de achar os quatro pontos (constante, preload, `main.ts`, `setup.ts`).
- Empacotamento **não** entra: nada aqui encosta em `package.json`, `extraResources`, `publish` ou autoupdate.

## Aprendizados que valem para as próximas tasks

**Da task 01:**

- **Suíte que monta o `Sidebar` tem de mockar `renderer/services/printers`.** O componente monta `usePrinters()`, cujo store singleton dispara `fetchPrinters()` no primeiro assinante — sem o dublê, `npm test` faz GET real em `api-dev.sgrande.delivery`, uma vez por teste, contra o que o `vitest.config.ts:8` promete. E **não aparece**: o erro cai no `log.error`, que é um `vi.fn()` do setup. O sintoma visível é outro — avisos de `act()` no stderr. Com o dublê, `await waitFor(() => expect(fetchPrinters).toHaveBeenCalled())` no helper de render zera os avisos e prova que o mock está em vigor.
- **A paleta da sidebar, medida:** `--side-text` sobre `--side` dá 9,74:1 (claro) e 11,01:1 (escuro), AAA nos dois; `--side-muted` sobre `--side` dá 4,82 e **4,59** — AA raspando no escuro. Quem for colorir o punho da #65 ou qualquer texto novo no pé parte daqui, em vez de medir de novo.
- **`--text` não serve na sidebar:** no tema claro ele é `#2b2725`, **o mesmo valor** de `--side`. Texto invisível, sem erro nenhum.
- **`min-width: 0` só é necessário em flex de linha** (é o caso do `.userText` dentro do `.user`). Em flex de **coluna** o `min-width` é eixo cruzado e `auto` já computa 0 — e `overflow: hidden` no próprio elemento zera o mínimo automático de qualquer jeito.
- **Para a task #65, um recado do review:** o truncamento do nome depende de o `.root` manter largura **definida**. `width: var(--sidebar-width)` continua funcionando; o que quebra é o `.root` passar a ser dimensionado por conteúdo (`width: max-content`, ou `flex-basis: auto` sem `width`) — aí o nome longo deixa de truncar e **alarga a sidebar**. Nenhum teste de jsdom pega isso.
- **A fixture `shellMocks.ts` é tipada à mão** e cresce quando um componente do layout passa a ler um campo novo. Preferir isso a `as unknown as` no caso de teste: o duplo cast apaga a checagem do objeto inteiro, e o `tsc` deixa de ser o gate quando a fixture divergir do provider real.

**Da task 02:**

- **O módulo das preferências agora é `src/main/uiPreferences.ts`** (era `theme.ts`). A `spec.md` e a seção "Abordagem técnica" acima ainda citam o nome antigo no texto de contexto — é história, mas quem der `grep` por `main/theme.ts` não acha nada.
- **Os dois canais:** `ui:sidebar-width` (lê) e `ui:set-sidebar-width` (grava). **O setter resolve para a largura clampada**, não para a pedida — é ela que a tela tem de adotar. Os quatro pontos de cada um estão conferidos por `grep`, inclusive o stub do `setup.ts`, que também clampa (um stub que ecoasse faria um arrasto para 900 parecer aceito).
- **A RMW é segura porque é síncrona.** `readFileSync` + `writeFileAtomic` não têm `await` no meio, então dois invokes quase simultâneos (tema e largura) não se intercalam na thread do main. **Trocar por `fs.promises` reabriria a RN-01 como corrida** — é a invariante que mantém a regra viva, e não está no nome de nenhuma função.
- **O default não é o mínimo.** `'280'`, `''`, `null`, `true` e objeto caem em **216**, não em 180. Só número finito fora da faixa é clampado para a borda.
- **Largura fracionária passa inteira e calada** (`220.7` lê `220.7`): o clamp não arredonda, de propósito, porque arredondar na leitura mudaria o valor lido do disco. A task #65 grava inteiro.
- **O caminho de escrita avisa** quando o valor pedido não é o salvo — é o que separa "a barra volta sozinha" de um `NaN` no cálculo do arrasto.

**Da task 03:**

- **A sonda da RN-07 tem um limite medido:** a mutação "estado por pixel em vez da CSS var" é morta pelo contador de renders da **`Sidebar`**, não pelo do `AppShell` — e um `setState` que fique dentro do próprio punho passa a suíte inteira. Quem mexer no `AppShellResize.test.tsx` precisa saber disso antes de "simplificar" as asserções de mount/unmount, que são o seguro contra a largura subir para o shell ou virar `key`.
- **Duas coisas nesta frente não têm mutação que as pegue:** o `-webkit-app-region: no-drag` do punho e o `.root` virar `max-content` (que mataria o truncamento do nome da loja). As duas estão comentadas no código e na lista de verificação manual — é o máximo que dá para fazer sob jsdom.
- **`:focus-visible`, nunca `:focus`,** em elemento que recebe `focus()` programático no `pointerdown`: com `:focus` o anel apareceria depois de cada arrasto de mouse.
- **Não gravar quando o valor não mudou é também o freio do key-repeat** — sem ele, segurar a seta martela o `writeFileAtomic` dezenas de vezes por segundo. O ponto morto: retentar depois de falha de gravação **no mesmo pixel** não reenvia.
- **`body[data-resizing]` é a única forma de pintar cursor e `user-select` na página inteira:** CSS Module não alcança o `body`, e `app.css` é o único lugar de CSS global. O atributo tem cinco saídas (`pointerup`, `pointercancel`, `lostpointercapture`, `Escape`, desmontagem), quatro delas assertadas — atributo grudado deixaria a janela inteira com `col-resize`.

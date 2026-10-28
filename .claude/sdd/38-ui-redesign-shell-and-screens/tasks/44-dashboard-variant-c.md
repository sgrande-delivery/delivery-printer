# 06 — Painel (variação C)

**Issue:** [#44](https://github.com/sgrande-delivery/delivery-printer/issues/44)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 03
**Status:** executada

## Objetivo

A tela inicial do app: um bloco de estado grande que diz, de longe, se está imprimindo ou se alguém precisa agir — com a ação que resolve, os três números do dia e as impressoras como chips.

## Contexto

- O desenho: `../design/printer-v2.dc.html:156-181` (variação **C**, a escolhida). A lógica de estado e de cor está no script, em `:613-621`, e é **tão normativa quanto o markup**.
- As variações A (`:75-122`) e B (`:124-154`) ficam no arquivo como alternativa registrada. Não são dívida e não se implementam aqui.
- Esta tela **substitui** o conteúdo de `components/status/Status.tsx` (118 linhas), que hoje é o app inteiro: logo do restaurante, nome, `RestaurantStatus`, pendentes, lista de falhados, usuário, versão e os quatro links do pé. Quem herdou cada parte: usuário, versão e links foram para a sidebar na task [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41); a lista de falhados vai para a Fila, task [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45). **O que sobra do `Status` é este Painel.**
- Os três dados já existem: `usePrintQueue()` dá pendentes e falhados; `usePrinters()` dá as cadastradas com a conferência contra o device do Windows; `useAuth()` dá o restaurante.
- **"Impressos hoje" é o que a fila ainda guarda** (RN-08): a fila mantém no máximo 200 trabalhos e descarta o que passa de 24 h (`print-queue-store.ts:13-14`). O número é a contagem de `status === 'printed'` com `createdAt` **desde a meia-noite local** — não "nas últimas 24 h", porque o rótulo diz "hoje".
- Cobre a **RF-07**, a **RF-03** (os mesmos números do badge) e a **RN-08**.

## Mudanças

### 1. `src/renderer/components/dashboard/Dashboard.tsx` + `.module.css` (novos)

Composto de três partes, com as medidas do desenho:

- **Bloco de estado** (`:157-163`): círculo de 132 px com o ícone de 72 px, título de 30 px/600 com `text-wrap: balance`, subtítulo de 15 px em `--text-2`, e o botão de ação de 48 px em `--accent` quando houver ação
- **Faixa de números** (`:169-176`): grade de três colunas, largura máxima 640 px, borda `--line`, raio 12, fundo `--surface`; valor em 40 px/600 com `font-variant-numeric: tabular-nums`, rótulo em 13 px `--text-2`. A separação é `border-right` entre as células — **a última não tem**, ao contrário do que o desenho faz
- **Chips de impressora** (`:177-180`): altura 34, raio 17, fundo `--surface`, borda `--line`, com o ponto de 8 px e "{setor} · {nome}"

### 2. `src/renderer/hooks/useDashboardHealth.ts` (novo) — o estado, com a precedência do desenho

A precedência é a de `:613-616`, e a ordem importa: **falha vence impressora não encontrada, que vence o estado normal.**

| Quando | Cor | Ícone | Título | Subtítulo | Ação |
| --- | --- | --- | --- | --- | --- |
| Há trabalho falhado | `--err-soft` / `--err` | `error` | "N impressões falharam" | "Pedido X não saiu: <causa>." | **Ver fila** → `/queue` |
| Há cadastro não encontrado | `--warn-soft` / `--warn` | `warning` | "N impressoras não encontradas" | "Os comprovantes dela vão para a impressora padrão do Windows." | **Corrigir** → `/printers` |
| Nenhum dos dois | `--ok-soft` / `--ok` | `check_circle` | "Imprimindo automaticamente" | "Último comprovante: {pedido} · {tipo} às {hora}" | — |

**Plural de verdade:** o desenho concatena sem concordância ("1 impressão falhou" com o mesmo texto no plural) porque é mock; aqui o texto é pt-BR correto nos dois casos, como `Status.tsx:66-69` já faz.

E o caso que o desenho não tem: **sem nenhuma impressão hoje e sem falha**, o subtítulo não pode citar "último comprovante" inexistente — nesse caso diz que está pronto e aguardando pedido. O desenho sempre tem histórico porque o mock sempre tem.

Os três números (`:617-621`), cada um clicável para onde o desenho manda:

| Rótulo | Valor | Vai para |
| --- | --- | --- |
| Impressos hoje | `printed` com `createdAt` ≥ meia-noite | `/history` |
| Na fila | `pending.length` | `/queue` (aba Pendentes) |
| Falharam | `failed.length`, em `--err` quando > 0 | `/queue` (aba Falhados) |

A aba de destino passa por `state` do `navigate`, e a task [#45](https://github.com/sgrande-delivery/delivery-printer/issues/45) a lê — combinar o nome da chave nas duas tasks (`{ tab: 'pending' | 'failed' }`).

### 3. `components/status/` e `components/main/`

`Status.tsx` e `Status.module.css` saem, junto com `components/main/Main.tsx` e `Main.module.css` se nada mais os usar — o `MainScreen` passa a renderizar o `Dashboard`. Conferir com `grep -rn "Status\|components/main" src/renderer/` antes de apagar, e **mover** o teste de `status/__tests__/Status.test.tsx` para o do Painel em vez de descartá-lo: o que ele afirma sobre falha visível continua valendo.

`components/restaurant-status/RestaurantStatus.tsx` perde o único consumidor (o indicador foi para a sidebar). Sai aqui, e com ele o último uso do `react-icons` — o que a task [#50](https://github.com/sgrande-delivery/delivery-printer/issues/50) confere antes de remover a dependência.

## Testes

### `src/renderer/hooks/__tests__/useDashboardHealth.test.ts` (novo)

- Falha **e** impressora não encontrada ao mesmo tempo → o estado é o de falha (a precedência é regra)
- Só impressora não encontrada → estado de atenção, com a contagem e o destino `/printers`
- Nada dos dois, com histórico → estado normal citando o último comprovante
- Nada dos dois, **sem** histórico → estado normal sem citar comprovante nenhum
- Singular e plural corretos em um e em dois
- "Impressos hoje" **não** conta o que foi impresso ontem às 23 h (o recorte é meia-noite, não 24 h)

### `src/renderer/components/dashboard/__tests__/Dashboard.test.tsx` (novo)

- O número de falhados aparece em `--err` só quando é maior que zero
- Clicar em "Na fila" navega para `/queue` com `{ tab: 'pending' }`; "Falharam" com `{ tab: 'failed' }`
- Os chips mostram setor e nome, com o ponto de encontrada/não encontrada
- Com `listPrinters()` devolvendo `[]` (spooler caído, Linux, dev), os chips ficam **neutros** e o estado **não** acusa impressora não encontrada — é a correção que a task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) já teve de fazer uma vez, e repeti-la aqui é o ponto
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: provocar os três estados (desligar a impressora e deixar falhar; renomear a impressora no painel; tudo normal) e comparar com o desenho lado a lado

## Critérios de aceitação

- [ ] Os três estados aparecem com cor, ícone, título, subtítulo e ação do desenho (`:613-616`)
- [ ] A precedência é falha → não encontrada → normal
- [ ] Os três números batem com os badges da sidebar, e cada um leva ao lugar certo
- [ ] Sem device nenhum lido, a tela não acusa o que não mediu
- [ ] `Status.tsx` saiu e nada ficou órfão
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- As variações A e B do Painel
- Status ao vivo da impressora pelo socket — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25), presa em `delivery-socket-api#50`
- Gráfico, série temporal, comparação com ontem: a fila não guarda isso (RN-08)

## Implementação

**Concluída em:** 2026-10-28

### Arquivos

Novos: `components/dashboard/Dashboard.tsx` + `.module.css`, `hooks/useDashboardHealth.ts`, `helpers/receiptKind.ts`, `base/Chip.tsx` + `.module.css`, mais três arquivos de teste.
Alterados: `base/Button.*` (`size="hero"`, 48 px), `hooks/usePrintQueue.ts` (passa a devolver `printed`), `screens/MainScreen.tsx`, `layout/AppShell.*` e `login/PasswordStep.*` (os dois chips existentes passam a usar o primitivo).
**Removidos**, cada um conferido por `grep` antes: `components/status/` (3 arquivos), `components/main/Main.tsx`, `components/restaurant-status/` (2 arquivos).

### A suíte ficou zerada, e por motivo medido

O baseline carregava 1 falha desde o começo da spec: `ui.test.tsx > Status > renders the version with the real architecture`, cujo `expect` era **insatisfazível** — o regex `/^v\d+\.\d+\.\d+ - /` não casa com `v2.7.0-dev.1 - x64`, por causa do sufixo de pré-release. O sujeito do teste saiu nesta task, e o sucessor em `AppShell.test.tsx` é **mais** estrito e passa (`/^v\d+\.\d+\.\d+.* · x64$/`).

O review conferiu as 118 linhas do `Status.test.tsx` deletado item por item: `revealLogs`, navegação, falha visível com pedido e causa, fila vazia sem alerta e pendente como informação **todos** vivem em outro arquivo agora. A única afirmação não re-alojada é o clique de retry pela UI, que é da task 07 e segue coberta no nível do hook e do worker.

### O primitivo `Chip` foi extraído aqui

Era o que o aprendizado da task 04 mandava: o chip de conexão do shell e o de voltar do login já eram duas pílulas sem abstração, e esta task trazia a terceira. API: `tone`, `size`, `dot` e `onClick` (que o transforma de `<span>` em `<button>` com `no-drag`). Os dois existentes foram retroajustados, e o review conferiu que saem **pixel-equivalentes**.

Duas escolhas dele a task 07 vai desfazer, e já estão escritas lá: o `.medium` embute padding assimétrico (do chip de voltar) e `.neutral.medium` acopla cor a tamanho.

### O que o review pegou, e que eu corrigi antes do commit

Nenhum bloqueador. Dois nits aplicados: o **único ternário aninhado do renderer** (o hook passou a devolver `dot: 'ok' | 'err' | 'muted'` em vez de `found: boolean | null`, o que apagou o ternário e ficou mais honesto sobre o que o dado é) e **quatro citações de linha do desenho erradas** — nesta spec a citação é o que o próximo review abre para conferir fidelidade, então citação errada é defeito.

E um achado que é falha do meu processo, não desta task: o commit da task 05 subiu com **1 erro de lint**, porque eu conferia o lint com `tail` e a linha do resumo ficava cortada. O CI roda `npm run lint`, então o PR iria vermelho. Corrigido aqui de passagem (é a saída literal do prettier num arquivo de teste) e o método está no plan.

### Testes

16 novos. **Zero sobreviventes** em três varreduras independentes: 27 chaves de CSS Module, e **dez mutações de comportamento** no `useDashboardHealth` — precedência, recorte de data, plural, guarda de `devicesRead` (duas), escolha do último comprovante, setor cru, capitalização, `startOfDay` e concordância.

A mutação que o implementador declarou duvidosa ("derrubou 14 testes") era **mutação quebrada**, não rede frouxa: o review reproduziu e o `tsc` acusa `TS2454` (variável usada antes de ser atribuída).

Minhas duas mutações: inverter a precedência derruba o teste de "falha vence não-encontrada quando as duas acontecem"; trocar meia-noite por 24 h derruba 2.

### Verificação

typecheck **0** · lint **0 erros e 1 aviso** (o da base) · `npm test` **46 arquivos, 306 testes, 0 falhas** · `npm run build` passa, e é a única etapa que pega a armadilha de `@keyframes` em CSS Module que a task 05 mediu.

**Bundle negativo:** JS do renderer **595,71 → 592,06 kB (−3,65)**, módulos **235 → 227**. O Painel, o `Chip` e o hook custam menos que o que saiu. `react-icons` ficou com **zero** usos no código.

### O que não foi verificado, e uma perda a declarar

A comparação lado a lado em `npm run dev` nos dois temas, e provocar os três estados de verdade (impressora desligada até falhar, cadastro renomeado, tudo normal) mais o estado "sem impressão hoje" de um PDV recém-aberto.

**Declarado, não esquecido:** o logo e o nome do restaurante **deixaram de aparecer** no app — a variação C não os tem (só a B, que está fora de escopo). É fidelidade ao desenho escolhido, e é informação que o operador tinha.

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

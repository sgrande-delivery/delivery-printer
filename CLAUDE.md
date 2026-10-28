# delivery-printer — CLAUDE.md

## Contexto do Projeto

Este repositório é o **aplicativo de impressão automática** da plataforma: um Electron instalado no PC do restaurante (o PDV), que fica na bandeja do Windows, conecta no `delivery-socket-api` e manda para a impressora térmica o que a `delivery-api` renderiza.

Em outubro de 2026 o repo **saiu do electron-react-boilerplate** (ERB). O build hoje é um `electron.vite.config.ts` de ~50 linhas, sem scaffold copiado dentro do repo. As duas regras que sustentam essa decisão, e que valem para qualquer ferramenta nova aqui: **nada específico do app escondido dentro da ferramenta**, e **um config só, que você entende por inteiro**.

O `README.md` cobre como rodar, o hot reload, os `.env` e as restrições de empacotamento. Este arquivo não repete: ele cobre o que vale para o repositório inteiro quando se **escreve código** aqui.

## O que é este projeto

Três processos, e a fronteira entre eles é o que o projeto tem de mais importante:

| Processo | Entrada | O que pode fazer |
| --- | --- | --- |
| **main** (`src/main/`) | eventos do Electron, `ipcMain.handle`, um socket próprio | Node inteiro: `fs`, impressora, `Notification`, tray, autoupdate |
| **preload** (`src/main/preload.ts`) | — | só expor funções pelo `contextBridge`; é a **única** ponte |
| **renderer** (`src/renderer/`) | React, três namespaces de socket, HTTP na `delivery-api` | nada de Node: só `window.electron.*` e `fetch`/axios |

O renderer **não tem `nodeIntegration`**. Toda capacidade de sistema que a UI precisa passa por um canal declarado no preload (`src/main/preload.ts:10`) e por um `ipcMain.handle` no main (`src/main/main.ts:15`). Canal que existe num lado e não no outro falha **em silêncio** — foi exatamente o bug do `receive-order`/`notification` encontrado na saída do ERB.

**A impressão não é renderizada aqui.** A `delivery-api` devolve HTML pronto (`GET orders/:uuid/print-created`), e o main grava num arquivo temporário e manda para a impressora via `webContents.print` (`src/main/ipc-events/onRawPrint.ts`). Não existe layout de impressão em React neste repo, e não deve voltar a existir: a abordagem antiga (`printing-layouts/`, 18 arquivos) foi removida porque estava morta.

## As aplicações da plataforma

**O canônico é o repo na organização `sgrande-delivery`**, não o nome do diretório clonado nem a URL do remoto:

| Apelido | Repo | O que este app consome de lá |
| --- | --- | --- |
| printer (este repo) | `sgrande-delivery/delivery-printer` | — |
| api | `sgrande-delivery/delivery-api` | `/api/admin/*` — login, `users/me`, HTML de impressão, `orders/:uuid/printed` |
| socket | `sgrande-delivery/delivery-socket-api` | namespaces `/admin`, `/order`, `/board` e a raiz |
| admin (painel) | `sgrande-delivery/delivery-admin` | quem dispara `printOrder`, `print_board` e lê o `printer_ping` |

**O remoto deste clone é `git@github.com:raphaelcarreiro/delivery-printer-2.git`, que é o nome antigo.** O GitHub **redireciona** para `sgrande-delivery/delivery-printer` (medido: `301`), então `gh` e `git push` funcionam. Ao usar `--repo`, nomeie `sgrande-delivery/delivery-printer`. O que **não** muda é o `build.publish` do `package.json`, que continua `owner: raphaelcarreiro` / `repo: delivery-printer-2` — ver `.claude/rules/autoupdate.md`, porque mexer ali tem consequência em máquina de cliente.

**Antes de citar caminho ou linha de outro repo, confirme o remoto:** `git -C <diretório> remote get-url origin`. E **nunca presuma `master` como branch de integração de outro repo** — vários estão em branch de frente, e medir contra o default responde que o código não existe.

## A v1 e a v2 da plataforma — e por que não existe versão v2 deste app

A `delivery-api`, o `delivery-admin` e o `delivery-client` estão num corte para a **v2**, e **a v1 não acaba nele**: as duas versões atendem produção em paralelo enquanto os restaurantes migram, um a um, sem data para o fim da v1. A API publica as rotas v2 no mesmo deploy da v1, com chave por restaurante (`uses_v2_orders`) decidindo qual caminho serve cada loja; o painel e o app do cliente ficam com **dois apps no ar**, um da `master` (v1) e um da branch v2.

**Este app atende as duas versões sem build próprio, e não é para criar um.** Medido em 2026-10-19 contra a `feature/product-engineering-rebased` da `delivery-api`:

- **As quatro rotas que este app consome não são versionadas** e respondem para pedido de qualquer versão, porque operam sobre as mesmas tabelas: `GET /orders/{uuid}/print-created`, `GET /orders/{uuid}/print-dispatched`, `PATCH /orders/{uuid}/printed` (`app/Modules/Order/routes/admin-routes.php:35-38`) e `GET /orders/print/list` (`:55`, SQL cru sobre `orders` + `order_status` + `order_printed`).
- **O id público de um pedido v2 é a coluna `orders.uuid`** — o mesmo `uuid` que este app recebe no socket e usa na URL (`core/Order/V2/Infra/DB/Eloquent/OrderRepository.php:168`, `where('uuid', ...)`). Não há dois espaços de identidade.
- **A v2 foi adaptada a este contrato, não o contrário.** A spec [delivery-api#1220](https://github.com/sgrande-delivery/delivery-api/issues/1220) (entregue em 2026-10-15) fez o despacho v2 emitir `uuid`, `sequence` e `restaurant_uuid` nos mesmos eventos (`printOrder`, `printShipment`) e na mesma sala, e registrou no plan: *"`delivery-printer` — nada a fazer"*, conferido na versão `2.7.0-dev.1` com a fila durável.
- **O status `'o'` é o mesmo nas duas** (`OrderStatusV2Enum::OPEN = 'o'`), então a varredura de reconexão (`GET /orders/print/list`) também acha pedido v2.

**O que está incompleto é o HTML, e o conserto é na `delivery-api`.** O payload de um pedido v2 é renderizado pelo pipeline v1 (`LegacyPrintBridge` → `PrintCreatedOrderUseCase` → `resources/views/socket/order/`), cujas views leem `additional`, `ingredients` e `complement_categories` — relações **legadas** que o repositório v2 nunca grava: ele persiste só `order_product_usages` (`core/Order/V2/Infra/DB/Eloquent/OrderRepository.php:479`). Resultado: **comprovante de pedido v2 sai com nome, quantidade, preço e anotação, e sem complementos, adicionais e ingredientes.** O diagnóstico já está escrito lá, na task `API-155` (issue [delivery-api#365](https://github.com/sgrande-delivery/delivery-api/issues/365), severidade alta), que **nunca foi executada** e está no fluxo `.claude/tasks/` aposentado — precisa renascer como spec SDD na `delivery-api`.

Três consequências para quem trabalha aqui:

- **Comprovante v2 saindo sem complemento não é bug deste repo.** Não "consertar" aqui montando layout, lendo `usages` ou pedindo outra rota: a impressão não é renderizada neste app (ver "O que é este projeto"), e a correção é no renderizador da `delivery-api`.
- **Não criar versão, branch, build ou flag v2 deste app**, e não perguntar se é para criar: a resposta é não. O contrato deste app — identidade pelo socket, HTML por HTTP, impressão crua — é agnóstico de versão por desenho, e é o que o mantém assim.
- **O campo `removed_ingredients_line`**, que a rota v2 `GET /orders/v2/{publicId}/print-payload` acrescenta, é descartado aqui: o `ReceiptResponse` lê `content`, `copies` e `device_name` (`src/renderer/services/printQueue.ts:5`). Passar a renderizá-lo é decisão de produto com task própria, não limpeza.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Electron **43.x** (teto duro — ver `.claude/rules/autoupdate.md`) |
| Build | electron-vite 6 + Vite 7 (`electron.vite.config.ts`, `build-config.ts`) |
| UI | React 18, react-router-dom 6, **CSS Modules** (sem biblioteca de UI, sem CSS-in-JS) |
| Estado | Context (`providers/auth.tsx`, `providers/messaging.tsx`) — **não há Redux** |
| HTTP | Axios (`src/renderer/services/api.ts`), cookie de sessão + refresh no interceptor |
| Tempo real | socket.io-client 4 — três namespaces no renderer, um socket na raiz no main |
| Impressão | `webContents.print` sobre HTML vindo da `delivery-api` |
| Autoupdate | electron-updater + electron-log (em `dependencies`, e isso é obrigatório) |
| Empacotamento | electron-builder 26 — NSIS Windows `ia32` + `x64` numa invocação |
| Testes | Vitest 5 + jsdom + Testing Library |
| Lint / formato | ESLint 10 flat config + typescript-eslint + Prettier |
| Node | 24 (`.nvmrc`); `engines: >=22.12.0` |

## Arquitetura de sockets

São **quatro** conexões, e confundi-las é o erro mais fácil daqui:

| Quem conecta | Namespace | Para quê |
| --- | --- | --- |
| main (`src/main/main.ts:13`) | raiz (`WS_BASE_URL`) | `subscribe_channel` quando o renderer chama `socketRegister`, e `printer_exited` no `before-quit` |
| renderer (`useAdminSocket`) | `/admin` | `printer_ping` a cada 30 s, `admin_ping`, `handleRestaurantState` |
| renderer (`useOrderSocket`) | `/order` | `printOrder`, `printShipment` |
| renderer (`useBoardSocket`) | `/board` | `print_board`, `print_board_billing` |

Cada `SocketStore` é um **módulo singleton** (`const store = new SocketStore('admin')` no topo do hook): a instância vive fora do React e sobrevive a remontagem. Consequência prática em `.claude/rules/printing.md`.

O `printer_ping` é o que faz o restaurante aparecer como "impressora online" no painel. **Por isso não se roda build de produção apontado para a API real em teste**: a sua máquina aparece como impressora fantasma do restaurante.

## Onde mora cada assunto

Este arquivo guarda só o que vale para o repositório inteiro. O resto são regras por assunto em `.claude/rules/`: cada uma declara no `paths:` os globs em que vale, e o Claude Code a carrega quando lê um arquivo que casa com eles. **Subagente não tem garantia de carregar a regra sozinho** — quem delega manda ler as regras cujo `paths:` cobre os arquivos da task.

| Regra | Assunto |
| --- | --- |
| `.claude/rules/printing.md` | O caminho real da impressão, os eventos de socket, o contrato do `rawPrint`, reentrância e vazamento de listener |
| `.claude/rules/autoupdate.md` | Empacotamento, release, as invariantes do autoupdate, o teto do Electron 43 e como verificar empacotando |
| `.claude/rules/renderer-ui.md` | CSS Modules, os primitivos de `base/`, os tokens, rota nova e as armadilhas da UI |

## Condições de release

**Push para `master` não publica mais nada.** O `.github/workflows/publish.yml` roda no evento **`release: [published]`**; quem checa PR e `master` é o `.github/workflows/ci.yml`, que não publica. O fluxo, do começo ao fim:

1. **bump da `version` no `package.json`** → PR (checado pelo `ci.yml`) → merge em `master`. **Nada é publicado.**
2. **criar a release com a tag `v<version>`, marcada como PRÉ-RELEASE.** Draft não serve: o GitHub **não dispara workflow** para release em draft (`created`, `edited` e `deleted` não disparam).
3. a esteira confere que a tag bate com o `package.json`, builda e anexa `Setup-<version>.exe`, `.blockmap` e `latest.yml` **à mesma pré-release**.
4. **instalar o `.exe` anexado e conferir.** Se a esteira terminou verde e **sem assets**, não promova: o suspeito é o `releaseType` ou a regra das 2 horas (ver `.claude/rules/autoupdate.md`).
5. **promover a pré-release a release normal.** É isto que entrega a atualização: o electron-updater pede `/releases/latest`, que **ignora draft e pré-release**.
6. **atualizar o `delivery_printer_version`** no `delivery-admin` (`PUT /printerSettings`), senão o link de download do painel continua oferecendo a versão anterior.

Três consequências que não se deduzem do YAML:

- **A versão vem do `package.json` e só cresce.** Não há Action de bump aqui, e ela também é digitada à mão no admin (passo 6) — por isso continua manual.
- **Criar a release direto como normal é o erro perigoso**, e a esteira o recusa: nesse instante ela já é a `Latest` **sem `latest.yml`**, e todo app instalado tomaria 404 na checagem de atualização, em silêncio. O job `gate` falha com a instrução de marcar como pré-release imediatamente.
- **A atualização chega quando o operador fecha o app pela bandeja**, e ele vive lá. Pode levar dias. Fechar pela janela (X) só esconde e **não** produz `quit`, então não aplica atualização nenhuma.

## Padrões de Desenvolvimento

### Tipagem

`tsconfig.json` tem `strict: true`, mas **`noImplicitAny: false`**: parâmetro sem tipo compila. Quem cobra tipo aqui é o review, não o compilador. `@typescript-eslint/no-explicit-any` está **off** no `eslint.config.mjs` — o mesmo vale.

- O typecheck é **duplo** e os dois lados têm `lib` diferente: `tsconfig.node.json` (main + `src/constants` + `src/shared`, sem DOM) e `tsconfig.web.json` (renderer + `src/constants` + `src/shared`, com DOM). `npm run typecheck` roda os dois
- **O guard de fronteira só existe numa direção, e isso foi medido.** DOM em código compartilhado derruba o programa node (`document.title` em `src/shared/` → `TS2584`). O contrário **não**: `import fs from 'node:fs'` em `src/shared/` **passa** no `tsconfig.web.json`, porque `types: ["vite/client"]` arrasta um `/// <reference types="node" />` e com ele o `@types/node` inteiro. Ou seja: **nenhum typecheck deste repo impede Node no renderer** — quem impede é o review e o build do renderer. Não confie no compilador para isso
- `src/constants/constants.ts` é importado pelos **dois** lados: o que entra ali tem de compilar nos dois `lib`
- A resposta da `delivery-api` não é validada contra o tipo declarado — `api.get<Response[]>` é uma **afirmação**, não prova. Mantenha opcional o campo que pode vir `null` (`device_name: string | null` é o exemplo real)
- `catch (err: unknown)` com narrowing por `instanceof AxiosError`, como em `providers/auth.tsx:57`

### Comentários

Comentário existe para carregar o que o código não carrega: unidade que o tipo não diz, contrato de terceiro que não se lê daqui, o porquê de código que parece deletável (a ordem do `<input>` antes do `<label>` em `base/TextField.tsx` é um exemplo que vale). Não vale narrar a linha, repetir o tipo nem registrar histórico de task ou de review — isso mora em `.claude/sdd/`.

### Idioma

**Texto visível ao usuário é pt-BR**; código, identificador, nome de arquivo, slug de pasta e assunto de commit são em **inglês**. Os comandos e prompts de agente em `.claude/` são em pt-BR, como o resto da casa.

### Imports

Aliases: `renderer/`, `constants/`, `main/`, `shared/` (declarados em `build-config.ts` e espelhados no `paths` do `tsconfig.json`). Eles são **regex** de propósito: um alias solto `constants` sombrearia o módulo nativo do Node. Alias novo entra nos dois lugares, ou o `tsc` e o Vite discordam.

**Onde mora código que os dois lados importam:** `src/shared/`, que está no `include` dos **dois** tsconfigs. `src/constants/` é configuração de build (ele lê as constantes injetadas) e não é depósito de utilidade compartilhada. E **não** ponha em `src/main/` o que o renderer vai importar: o electron-vite bundla import relativo, então código de processo principal acaba emitido **dentro do bundle do renderer** — medido, com o símbolo aparecendo nos dois bundles.

## Fluxo de trabalho (SDD)

O trabalho é organizado por **feature**, não por task solta. Cada feature vive em `.claude/sdd/<issue>-<slug>/`, numerada pela issue guarda-chuva do GitHub:

```
.claude/sdd/12-printing-settings-screen/
├── spec.md      o quê e por quê — contexto, RF, RN, critérios, decisões pendentes
├── plan.md      como — abordagem, decisões arquiteturais, tabela de tasks, aprendizados
└── tasks/
    └── 14-userdata-settings-file.md     nomeada pela issue da task
```

**O ciclo:**

1. `/create-spec` escreve spec e plan **e materializa todas as tasks**: abre a issue de cada uma, vincula como sub-issue da feature e escreve o arquivo.
2. `/execute <feature>` roda **todas as tasks da spec em sequência**, na branch da spec, com **um commit por task**, e exibe a tabela de situação a cada etapa.
3. `/ship <feature>` faz push e abre o PR contra `master`. O merge **não publica**: quem dispara a esteira é o dev criando a release como pré-release, e é o `/ship` que lhe diz, no relatório, os passos que restam (ver "Condições de release"). `/ship-pr <feature>` é o mesmo sem nada de versão, para PR contra branch que não é `master`.

O `/create-task` acrescenta ou refaz uma task numa spec que já existe. Fora do ciclo, `/report-bug` e `/request-feature` abrem issue a partir do relato do tester ou do pedido do dev.

**No GitHub:** a feature é uma issue com label `feature`; cada task é uma issue com label `task`, vinculada como **sub-issue** da feature. **Nenhuma das duas labels existe neste repo ainda** — o `/create-spec` cria a que faltar antes de abrir a primeira issue.

**Status da task**, na tabela do `plan.md`: `a especificar` → `pendente` → `executada` → `shipped`.

**Subagentes locais** (`.claude/agents/`): `printer-agent` implementa, `test-writer-typescript` reforça a rede de teste quando a invariante merece, `code-reviewer-typescript` revisa contra os modos de falha desta base, `git-agent` faz commit/push/PR. O `/execute`, o `/ship` e o `/ship-pr` os orquestram — não invocar direto.

Onde escrever o quê:

- **`spec.md`** — o durável. As **RN** são o que mais paga: regra que explica *por quê* sobrevive a refactor, e premissa que não está escrita em lugar nenhum não pode ser questionada, então vira bug. Nesta base, "o preload e o main têm de declarar o **mesmo** nome de canal" e "o `latest.yml` é único para as duas arquiteturas" são exatamente desse tipo
- **`plan.md`** — como a feature se encaixa na arquitetura, e a seção **"Aprendizados que valem para as próximas tasks"**
- **`tasks/*.md`** — a unidade de execução: mudanças com `arquivo:linha`, testes, critérios verificáveis

**Tasks legadas:** `.claude/tasks/PRINTER-XXX-<slug>.md`, com frontmatter YAML (`id`, `status`, `issues`), são anteriores ao fluxo SDD e **ficam onde estão**. `/execute PRINTER-XXX` e `/ship PRINTER-XXX` continuam resolvendo lá, com uma branch por task (`task/<id>-<slug>`). A `PRINTER-001` vive hoje na branch `origin/docs/add-printer-001-task`, não em `master`.

### Contrato cross-repo não bloqueia implementação

Feature que atravessa repos tem **spec nos dois lados**, e cada uma carrega o contrato: a daqui diz o que este app escuta e qual rota consome; a da `delivery-api` (ou do `delivery-socket-api`) diz o que publica. Esse par **é** o contrato — não há etapa de aprovação depois dele, e não há nada a esperar.

- **Implementar contra o contrato da spec, sem esperar a outra ponta entregar.** Task daqui não fica bloqueada porque a rota nova ainda não subiu, nem porque o evento ainda não é emitido.
- **Não parar para perguntar se pode seguir.** Quem escreveu a spec já decidiu o que é para fazer; perguntar o que a task já responde é retrabalho para o dev, não cuidado.
- **O aviso vai no relatório:** que a feature só funciona ponta a ponta quando a outra ponta subir, e a ordem de deploy quando ela importa — aqui ela quase sempre importa, porque a atualização chega quando o operador fecha o app pela bandeja (ver "Condições de release").
- **Motivo real para parar:** as duas specs divergirem no contrato (nome de evento, chave do payload, forma da resposta). Aí o contrato não existe de fato, e quem decide qual lado muda é o dev. Ausência de implementação do outro lado **não** é divergência.

### Base e branch da execução

**Uma branch por spec:** `feat/<issue>-<slug>`, com o mesmo nome da pasta SDD. Todas as tasks da spec rodam nela, em sequência, com um commit local por task. Push e PR (um por spec) são do `/ship`/`/ship-pr`. Mudança pontual fora de spec usa `chore/…`, `fix/…` ou `docs/…`.

Ao criar a branch, o `/execute` **sempre** roda `git fetch origin` e pergunta de qual base cortar, **uma vez por spec** — `origin/master` é o default aqui, porque este repo não tem branch de integração. Depois registra a base na linha `**Branch de trabalho:**` do `plan.md`, com a data; é esse registro que o `/ship` lê.

**`master` publica.** Diferente dos outros repos da casa, aqui não existe branch de integração que absorva trabalho pela metade: o que entra em `master` vira release. Por isso cada commit da spec tem de compilar e passar sozinho — e por isso o PR existe mesmo quando o dev é o único revisor.

## Comandos

```bash
nvm use            # Node 24 (.nvmrc); o shell padrão desta máquina abre em 18
npm install        # sem --legacy-peer-deps: a árvore é limpa
npm run dev        # electron-vite dev --watch — o --watch é obrigatório (README)
npm run typecheck  # tsc nos dois lados: tsconfig.node.json e tsconfig.web.json
npm run lint       # eslint . (NÃO escreve; o que escreve é o lint:fix)
npm test           # vitest run
npm run build      # out/main, out/preload, out/renderer
npm run package    # instalador local, sem publicar
```

**Baseline em `refactor/remove-erb-boilerplate`, medido em 2026-10-15:** `npm run typecheck` sai 0, `npm test` passa (2 arquivos, 3 testes), `npm run lint` dá **0 erros e 1 aviso** — `react-hooks/set-state-in-effect` em `src/renderer/components/login/Login.tsx:23`, padrão pré-existente rebaixado a aviso de propósito no `eslint.config.mjs`. Só **erro novo**, ou aviso novo, conta como regressão.

Diferente dos outros repos da casa, **`npm run lint` aqui não tem `--fix`**: ele não escreve no working tree, então pode rodar depois de montar o escopo do commit. Quem escreve é `npm run lint:fix` e `npm run format`.

## O que NÃO fazer

- **Não subir o Electron para 44+** — o 44 removeu o build `win32-ia32` e os PDVs 32-bit param de instalar **e de receber atualização**, sem aviso. Ver `.claude/rules/autoupdate.md`
- **Não mover `electron-updater` nem `electron-log` para `devDependencies`** — eles são externalizados do bundle do main; fora de `dependencies` o electron-builder não os empacota e o `require` falha em runtime, em silêncio
- **Não rodar build de produção contra a API real** para testar: o `printer_ping` registra a sua máquina como impressora do restaurante em produção. Teste em dev
- **Não colocar segredo em `.env.development`/`.env.production`** — eles são versionados, e os valores são inlinados no bundle, que vai dentro do instalador (extraível com `npx asar`). Configuração por instalação é leitura em runtime e mora em arquivo sob `app.getPath('userData')`
- **Não renderizar layout de impressão em React** — o HTML vem da `delivery-api`; `printing-layouts/` foi removido por estar morto
- **Não criar versão, branch, build ou flag v2 deste app**, e não propor caminho alternativo por versão de pedido: o contrato deste app é agnóstico de versão, e comprovante v2 incompleto se conserta no renderizador da `delivery-api`. Ver "A v1 e a v2 da plataforma"
- **Não adicionar canal no preload sem o `ipcMain.handle` correspondente** (e vice-versa): a promessa rejeita calada
- **Não reintroduzir biblioteca de UI, CSS-in-JS nem lib de estado** sem a task pedir — a remoção de MUI e Redux é deliberada, e foi ela que levou o bundle de 924 kB para 518 kB
- **Não voltar a copiar scaffold de build para dentro do repo.** Ferramenta é dependência versionada; se precisar de comportamento próprio, ele mora no `electron.vite.config.ts`, legível por inteiro
- **Não usar `git add .`** — o escopo do commit é por caminho explícito

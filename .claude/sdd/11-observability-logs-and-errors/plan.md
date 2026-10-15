# Plan — Observabilidade: log em arquivo e erro visível ao operador

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11)
**Branch de trabalho:** `feat/11-observability-logs-and-errors`, cortada de `feat/1-reliability-silent-failures` em 2026-10-15: todas as tasks em sequência, um commit por task e um PR no fim

## Abordagem técnica

O `electron-log` já é dependência e já grava — falta configurá-lo no boot do **main** (hoje a configuração mora dentro do `AppUpdater`, que é quem por acaso o usa primeiro) e dar ao renderer um caminho até ele.

O renderer não tem Node, então ele não escreve no arquivo: manda por IPC. O `electron-log` tem um caminho próprio para isso (`electron-log/renderer`), e ele depende de `preload`/`contextIsolation` configurados de um jeito específico. A decisão de usar o caminho da biblioteca **ou** um canal IPC explícito (`log` com nível + mensagem) fica para a task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12), medida no app empacotado: canal explícito é mais código e zero surpresa; o da biblioteca é menos código e depende de detalhe de inicialização que já quebrou em outras bases.

Aviso ao operador usa o que já existe: `useMessaging().handleOpen(...)` para a tela, e o canal `notification` para a notificação nativa — que hoje tem texto fixo de pedido recebido e precisa receber o texto de quem chama.

## Decisões arquiteturais

- **O log é um módulo do main** (`src/main/logger.ts`), configurado antes de qualquer outra coisa no boot. Quem precisa logar importa dele; ninguém configura `electron-log` duas vezes.
- **Campos escolhidos à mão, nunca o erro cru** (RN-02). Vale um helper que extrai de `AxiosError` só método, URL, status e código — e descarta `config.headers` e `response.data`.
- **Nível de arquivo em `info`, console em `debug` só em dev.** O que interessa ao suporte é o caminho de impressão e de sessão, não cada render.
- **Exportar = abrir a pasta.** `shell.showItemInFolder` é uma chamada, não tem dependência e deixa o operador anexar o arquivo onde quiser. Zipar e subir para algum lugar é projeto, não task.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Log em arquivo com rotação, nos dois processos | [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12) | [12-file-logging-with-rotation.md](./tasks/12-file-logging-with-rotation.md) | — | shipped |
| 02 | Mostrar falha de impressão ao operador | [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13) | [13-visible-print-failures.md](./tasks/13-visible-print-failures.md) | 01 | shipped |
| 03 | Exportar os logs para o suporte | [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14) | [14-export-logs.md](./tasks/14-export-logs.md) | 01 | shipped |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03. As duas últimas dependem do arquivo existir; entre elas não há dependência, e a ordem é por valor: avisar o operador vale mais que exportar.

## Dependências de outros repos

Nenhuma.

## Verificação da entrega

- o caminho real do arquivo **tem de ser medido no app empacotado**, não deduzido: o `electron-log` grava em `<userData>/logs/`, e `userData` depende de `app.getName()`, que lê o `package.json` embarcado. A task 01 registra o caminho observado, e a 03 e a documentação do suporte usam esse valor
- a RN-02 se verifica grepando o arquivo depois de provocar 401 e falha de refresh: `Authorization`, `Cookie`, `Bearer` e `access_token` não podem aparecer
- a rotação se verifica forçando escrita até passar do limite configurado

## Aprendizados que valem para as próximas tasks

Da task 01 (#12):

- **Código que os dois lados importam mora em `src/shared/`**, criado nesta task, com alias `shared/` em `build-config.ts` + `paths` e o diretório no `include` dos **dois** tsconfigs. O `src/constants/` **não** serve: ele é configuração de build. E o erro que foi corrigido aqui é instrutivo: com a função pura em `src/main/`, o símbolo dela apareceu **nos dois bundles** (`out/main/main.js` e `out/renderer/assets/index-*.js`) — o electron-vite bundla import relativo, então era fonte de processo principal emitida dentro do bundle do renderer. É o mesmo mecanismo que o aprendizado da task 03 (#4) registrou para o preload. O precedente de `preload.d.ts` importar `main/preload` não cobre o caso, porque lá é `import type`, apagado na emissão.
- **O typecheck NÃO impede Node no renderer, e isso foi medido nas duas direções.** DOM em código compartilhado derruba o programa node (`document.title` em `src/shared/` → `TS2584`). O inverso **passa**: `import fs from 'node:fs'` em `src/shared/` não é barrado pelo `tsconfig.web.json`, porque `types: ["vite/client"]` arrasta `/// <reference types="node" />` e com ele o `@types/node`. Quem impede Node no renderer é o review e o build — **não** o compilador. Registrado também no `CLAUDE.md`.
- **O `externalizeDepsPlugin` externaliza só `dependencies`**, e nada mais: `deps = Object.keys(pkg.dependencies || {})` (`node_modules/electron-vite/dist/chunks/lib-DoUt4oMD.js:1185`), sem `devDependencies` nem `peerDependencies`; e o electron-vite força `ssr.noExternal = true` em main e preload, então a heurística do Vite também não externaliza. **Consequência que desfaz uma suposição natural:** `import 'axios'` no main seria **bundlado** em `out/main/main.js` e funcionaria na máquina do cliente — o custo é tamanho e acoplamento, **não** falha silenciosa no instalador. A armadilha de `devDependencies` da rule de autoupdate vale para dependência **externalizada**, isto é, para o que está em `dependencies`.
- **`ipcRenderer.send` lança sincronamente** quando o payload não é clonável estruturalmente (função, instância com método). Como o `send` do log é chamado de dentro de `catch`, isso quebraria o próprio handler de erro — a RN-05 ("escrever log nunca derruba o app") exige `try/catch` ali, e há teste que cai sem ele.
- **Canal IPC explícito em vez de `electron-log/renderer`:** o `initialize()` da biblioteca registra um preload próprio nas sessões, o que convive mal com o nosso preload (bundle único) e com o bundling do electron-vite, e a falha apareceria só no instalador. Com canal explícito, o stub de `src/__tests__/setup.ts` resolve o jsdom e a RN-02 fica do lado do renderer, onde o erro de axios nasce. `send`/`on`, não `invoke`/`handle`: log não devolve promessa que rejeita.
- **O caminho do arquivo de log continua PREVISTO, não medido:** `%APPDATA%\sgrande-delivery-printer-2\logs\main.log`, porque `getAppLogPath` devolve `<userData>/logs` e `app.getName()` cai no `name` do `package.json` (o `productName` vive em `build`, não na raiz). **A task [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14) e a documentação do suporte não podem citar esse caminho como verdade** antes de alguém rodar `log.transports.file.getFile().path` num build real.
- **Dois pontos de log do interceptor que a task parecia não pedir, e que ficam:** eles só são alcançáveis depois de `error.response?.status === 401`, então oscilação de rede (sem `response`) volta antes e **não** escreve nada — a preocupação de ruído não se aplica. E a flag `isRefresing` limita a linha do refresh a uma por rajada.
- **A dívida do `ipc-channels.ts` cresceu:** o canal `log` é o **quinto** com o nome duplicado como literal nos dois lados e **sem nada testando o par**.
- **Dois sites de `console.*` ficaram de fora desta task, de propósito, e um deles importa:** `ErrorBoundary.tsx:32` — ou seja, **erro de render, que é justamente o que o boundary pega, não chega ao arquivo de log**. Candidato à task 02 (#13) ou a follow-up. O outro é `useAdminSocketEvents.ts:44`.
Da task 02 (#13):

- **Os `failureReason` reais do `webContents.print` no Electron 43 são `"Invalid printer settings"`, `"Print job canceled"` e `"Print job failed"`** — medidos nos typings (`node_modules/electron/electron.d.ts:18486`) **e** como literais no binário distribuído. A primeira versão mapeava `failed`/`cancelled`, que **não existem**: toda falha real chegaria ao operador em inglês cru, na tela, justamente no caso para o qual a task existe. **E o teste passava**, porque mockava um motivo que o Electron nunca emite — ficção autoconsistente. É o padrão a desconfiar: teste que inventa a entrada prova que o código concorda com a nossa imaginação, não com a realidade.
- **O `ipcRenderer.invoke` embrulha a rejeição do main em `Error invoking remote method '<canal>': <motivo>`**, e o main serializa com `r.toString()`. Como o `onRawPrint` rejeita com **string** (o `reason` do callback), o que chega ao renderer não tem "Error:" interno — mas um `Error` lançado no main chega com prefixo duplo. Quem for ler motivo de falha vindo de IPC precisa tirar esse prefixo.
- **Aviso é por evento de impressão, não por polling — e é essa a linha entre aviso e ruído.** Falha do `rawPrint` **e** falha da busca do HTML avisam (o comprovante não saiu nos dois casos, e na mesa não há varredura que tente de novo). A varredura `/orders/print/list` e as falhas de token ficam **só no log**: a primeira re-dispara a cada reconexão e avisaria a cada oscilação de rede; a segunda é o exemplo literal da RN-03.
- **Rajada conhecida, não resolvida:** se a varredura devolver N pedidos pendentes e o GET do layout falhar em todos, saem N snackbars e N notificações — e com o `handleOpen` instável (fecha-e-reabre em 350 ms) só a última é legível. Limitado pelo número de pedidos pendentes, não por rede. Candidato a agregação, e material para a spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15).
- **Erro de render agora chega ao arquivo** (`ErrorBoundary` passou de `console.error` para `log.error`), com teste que afirma o caminho até a ponte — e que cai se alguém voltar o `console.error`. Fecha o buraco que a spec #1 deixou: o boundary pegava o erro e ninguém conseguia ler.
- **A forma do payload de notificação está declarada três vezes** (helper, literal do preload, tipo do handler no main) e **nada testa o par**: acrescentar campo de um lado não é pego. O durável é um `import type` de `src/shared/`, que a task 01 criou exatamente para isso.
- **Dívida de rede no `/board`:** o teste novo do hook de mesa era a chance de cobrir montar/desmontar/remontar e contar emissões (o vazamento de listener que a `printing.md` descreve). O `off` existe e esta task não tocou no efeito, então não é achado dela — mas a rede continua ausente.

Da task 03 (#14):

- **`logger.transports.file.getFile()` CRIA o arquivo.** `electron-log/src/node/transports/file/FileRegistry.js:71-72` faz `mkdirSync` + `writeFileSync(path, '', { flag: 'a' })` dentro de `testFileWriting()`. Medido por probe: `antes do getFile → existe: false`; `depois → existe: true, tamanho 0`. **Consequência:** `existsSync` depois de `getFile()` é sempre verdadeiro, então "tem registro?" se mede por **tamanho**, nunca por existência — e a leitura tem de vir **antes** da linha de log que escreve nesse mesmo arquivo. Sem isso, instalação nova sem incidente abre o Explorer com um `main.log` de 0 byte em vez de avisar.
- **O quarto caso de ficção autoconsistente da sessão, e o mais sutil:** o teste do caso negativo passava porque o mock devolvia `getFile: () => ({ path })` — um objeto **sem o efeito colateral da biblioteca**. A correção não foi só no código: o mock passou a replicar os dois efeitos reais (o `getFile` cria o arquivo vazio, o `info` faz append). **Regra que sai disto: mock de biblioteca que tem efeito colateral precisa ter o efeito colateral, ou o teste prova só que o código concorda com o mock.**
- **O caminho do log se mede sozinho em campo:** o handler resolve em runtime e registra `log file resolved to <caminho>` na primeira chamada (`grep "log file resolved"` no `main.log`). Então a medição que falta chega com o primeiro clique de "abrir logs" num Windows — e **é esse valor observado que entra aqui e na documentação do suporte** (task #29 da spec #26), não a previsão.
- **"Link que é ação" agora aparece em dois lugares** (`desconectar`, pré-existente, e `abrir logs`, que o review trocou por `<button type="button">`). O `desconectar` continua `<a href="#">` com `preventDefault`, que num app de hash history é navegação de verdade sendo barrada à mão. Dois lugares é o gatilho da regra "primitivo novo quando o padrão aparece em dois lugares" — e o primitivo `Button` não serve sem override, porque ele é botão MUI de texto (uppercase, `min-width: 64px`). Follow-up natural.
- **`src/__tests__/ui.test.tsx` renderiza o `Status` sem `MessagingProvider`**, e funciona porque o `MessagingContext` tem default `{} as MessagingContextData`, então o guard do `useMessaging()` não dispara e o `handleOpen` fica `undefined`. Inofensivo hoje (aquele teste não clica), mas é uma rede frouxa esperando alguém.

- **Mensagem de log em inglês, texto de tela em pt-BR.** As tasks 02 e 03 precisam seguir isso para não divergir.



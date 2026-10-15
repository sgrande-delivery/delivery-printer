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
| 01 | Log em arquivo com rotação, nos dois processos | [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12) | [12-file-logging-with-rotation.md](./tasks/12-file-logging-with-rotation.md) | — | executada |
| 02 | Mostrar falha de impressão ao operador | [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13) | [13-visible-print-failures.md](./tasks/13-visible-print-failures.md) | 01 | pendente |
| 03 | Exportar os logs para o suporte | [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14) | [14-export-logs.md](./tasks/14-export-logs.md) | 01 | pendente |

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
- **Mensagem de log em inglês, texto de tela em pt-BR.** As tasks 02 e 03 precisam seguir isso para não divergir.



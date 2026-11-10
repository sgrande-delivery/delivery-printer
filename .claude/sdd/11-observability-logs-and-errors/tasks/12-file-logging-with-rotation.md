# 12 — Log em arquivo com rotação, nos dois processos

**Issue:** [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** shipped

## Objetivo

Centralizar o log em arquivo, com rotação e nível definidos num lugar só, e dar ao renderer um caminho para escrever nesse mesmo arquivo. Hoje só o updater escreve, e o resto do app fala com o `console`, que no app instalado é o nada.

## Contexto

- `src/main/updater.ts:8` configura `log.transports.file.level = 'info'` dentro do construtor do `AppUpdater` — a configuração do app inteiro mora em quem por acaso loga primeiro
- Chamadas que hoje se perdem: `src/main/main.ts:39` (`.catch(console.log)`), `src/main/updater.ts:19` (loga a mensagem e **descarta o erro**), `src/renderer/hooks/usePrintingOrder.ts:34`, `usePrintingBoard.ts:32`, `src/renderer/providers/auth.tsx:46`
- Cobre a **RF-01**, a **RF-02** e a **RF-05**, e as RN-02, RN-04 e RN-05
- O renderer não tem Node: precisa de canal IPC, par nos dois lados mais o stub em `src/__tests__/setup.ts` (`.claude/rules/printing.md`)
- `electron-log` v5 tem `electron-log/renderer`, que usa IPC por baixo; funciona com `contextIsolation` ligado, mas depende de inicialização no main (`log.initialize()`). A alternativa é um canal explícito. **Medir as duas no app empacotado** antes de decidir, e registrar em "Aprendizados"
- O caminho do arquivo depende de `app.getName()`, que no pacote lê o `package.json` embarcado (`name` = `sgrande-delivery-printer-2`, porque `productName` está em `build`, não na raiz). **Medir e registrar** o caminho observado: a task [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14) e a documentação do suporte dependem dele

## Mudanças

### 1. O módulo de log

`src/main/logger.ts` (novo): configura `electron-log` uma vez — nível de arquivo, `maxSize` para a rotação (RN-04), formato com horário local, e `catchErrors`/handlers de `unhandledRejection` e `uncaughtException` (RF-05). Exporta o logger e um `describeError(err)` que extrai de `AxiosError` só método, URL, status e código de erro, **descartando** headers e corpo (RN-02).

Escrita que falha não propaga (RN-05): o `electron-log` já trata, e o que a task acrescenta é não embrulhar chamada de log em `try` espalhado pelo código.

### 2. Boot

`src/main/main.ts` (alterado): importar o logger como **primeira** linha, antes de qualquer outro import que possa logar, e trocar `.catch(console.log)` por log de verdade. `src/main/updater.ts` (alterado): remover a configuração do construtor e logar o erro do `checkForUpdates`, que hoje é descartado.

### 3. Canal para o renderer

`src/main/preload.ts` + `src/main/main.ts` + handler novo em `src/main/ipc-events/` (ou `log.initialize()`, conforme a medição): o renderer passa a ter `window.electron.log(level, message, context?)`, com o `context` serializável.

`src/__tests__/setup.ts` (alterado): stub do canal novo.

### 4. Trocar os `console` dos caminhos críticos

`usePrintingOrder.ts`, `usePrintingBoard.ts`, `providers/auth.tsx` e `services/apiErrorInterceptor.ts`: `console.error(err)` → log com contexto (pedido, impressora, rota), passando pelo `describeError`.

## Testes

### `src/main/__tests__/logger.test.ts` (novo)

- `describeError` com um `AxiosError` montado à mão devolve método, URL, status e código, e **não** devolve `headers`, `Authorization`, `Cookie` nem corpo de resposta
- `describeError` com `Error` comum devolve mensagem e nome
- Erro sem `response` (rede) é descrito como tal

### `src/renderer/services/__tests__/log.test.ts` (novo)

- O helper do renderer chama o canal com nível e mensagem
- Canal ausente (ambiente sem preload) não lança

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Empacotado: provocar falha de impressão e de login, abrir o arquivo e conferir as duas linhas; `grep -iE "authorization|cookie|bearer|access_token"` no arquivo **não** traz nada
- Forçar escrita acima do `maxSize` e confirmar a rotação

## Critérios de aceitação

- [ ] Existe um arquivo de log com as duas falhas provocadas, legíveis, com horário local
- [ ] Nenhuma credencial no arquivo, verificado por grep
- [ ] O renderer escreve no mesmo arquivo do main
- [ ] Rotação observada
- [ ] Promise rejeitada não tratada aparece no arquivo
- [ ] O caminho observado do arquivo está registrado em "Aprendizados" do `plan.md`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Enviar log para fora da máquina
- Aviso ao operador — task [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13)
- Botão de exportar — task [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14)
- Trocar todo `console.log` do repo: só os caminhos críticos listados

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

main + preload + renderer, mais um diretório novo compartilhado

### Arquivos

**Novos:** `src/main/logger.ts` (configura o `electron-log` uma vez, no import), `src/main/ipc-events/onLog.ts`, `src/renderer/services/log.ts`, **`src/shared/describeError.ts`** e seu teste, mais o teste do canal no renderer.

**Alterados:** `src/main/main.ts` (o `import './logger'` é a **primeira** linha), `preload.ts`, `updater.ts` (saiu a configuração do construtor; o erro do `checkForUpdates`, que era descartado, agora é logado), `autostart.ts`, `app-events/onBeforeQuit.ts`, `src/__tests__/setup.ts`, `src/renderer/index.tsx`, `hooks/usePrintingOrder.ts`, `hooks/usePrintingBoard.ts`, `providers/auth.tsx`, `services/apiErrorInterceptor.ts`, `build-config.ts` e os três `tsconfig`.

### Canal IPC criado

| Canal | Direção | Preload | Main | Stub |
| --- | --- | --- | --- | --- |
| `log` | renderer → main | `preload.ts:32` (`send`) | `main.ts:16` (`ipcMain.on`) | `setup.ts:13` |

`send`/`on` e não `invoke`/`handle`: log não pode devolver promessa que rejeita ao chamador. É o **quinto** canal com o nome duplicado como literal nos dois lados e sem teste do par — a dívida do `ipc-channels.ts` cresceu.

### A violação de fronteira que o review pegou, e o diretório novo

O `describeError` nasceu em `src/main/` e era importado pelo renderer. **Medido:** o símbolo dele aparecia **nos dois bundles** — fonte de processo principal emitida dentro do bundle do renderer, o mesmo mecanismo que a task #4 registrou para o preload.

Virou **`src/shared/describeError.ts`**, com alias `shared/` e o diretório no `include` dos dois tsconfigs. Não foi para `src/constants/`, que é configuração de build e não depósito.

### Três fatos medidos nesta task, todos registrados nos Aprendizados

1. **O typecheck não impede Node no renderer.** DOM em `src/shared/` derruba o programa node (`TS2584`); `import fs from 'node:fs'` em `src/shared/` **passa** no web, porque `types: ["vite/client"]` arrasta `@types/node`. Quem impede é review e build.
2. **O `externalizeDepsPlugin` externaliza só `dependencies`** (`lib-DoUt4oMD.js:1185`), e o electron-vite força `ssr.noExternal` em main/preload. Logo `import 'axios'` no main seria **bundlado** e funcionaria — a justificativa original do duck typing estava errada, e foi reescrita antes de virar aprendizado.
3. **`ipcRenderer.send` lança sincronamente** em payload não clonável. Como o `send` do log roda dentro de `catch`, isso quebraria o próprio handler de erro: a RN-05 exige `try/catch` ali, e há teste que cai sem ele.

### Decisões, e o veredito do review

- **Canal explícito em vez de `electron-log/renderer`**: aprovado — o `initialize()` da biblioteca registra preload próprio nas sessões, briga com o nosso bundle único, e falharia só no instalador
- **`errorHandler.startCatching({ showDialog: false })`**: aprovado, com a API conferida — o default é `true` e usa `showErrorBox`, ou seja caixa modal no PDV em serviço
- **`maxSize` 2 MiB**: teto real 4 MiB, porque o `archiveLogFn` mantém um `.old.log` ao lado. `breakLength: Infinity` é o que faz o `grep` da RN-02 funcionar
- **`describeError` tira a query string e devolve `reachedServer`**: é a distinção que a spec #1 aprendeu a valer (401 do refresh × rede caindo no refresh). Descarta `stack` de propósito: sem sourcemap em produção, stack minificada não serve a ninguém
- **Flag `logged`** no `usePrintingOrder`: local à invocação, cada impressora que falha gera a própria linha
- **Os dois pontos de log do interceptor ficam**: só alcançáveis depois de `status === 401`, então oscilação de rede volta antes e não escreve nada

### Testes

59 testes em 13 arquivos (baseline da spec: 50/11). Mutações conferidas por mim e pelo review:

| Mutação | Testes que caem |
| --- | --- |
| `describeError` devolvendo o erro cru (RN-02) | **6** |
| `withoutQuery` devolvendo a URL com query | 2 |
| `try/catch` do `send` removido | 1 |

O teste da RN-02 não é tautológico: `JSON.stringify` de um `AxiosError` cru passa pelo `toJSON`, que inclui `config` com `headers`.

### Verificação

- typecheck 0 · lint 0 erros e 1 aviso (o da base) · 59 testes · build dos três bundles com o alias novo resolvendo (renderer 522,3 kB, era 518)
- Par do canal conferido por grep nos dois lados + stub
- **Nenhuma dependência nova** (`electron-log` já estava em `dependencies`); invariantes de autoupdate intactas

### O que NÃO foi verificado — e o que depende disso

Nada rodou dentro do Electron. Ficam abertos quatro critérios: **o caminho observado do arquivo**, a rotação por `maxSize`, o `grep` de credencial no arquivo real e a rejection não tratada aparecendo nele.

O caminho é **previsão**: `%APPDATA%\sgrande-delivery-printer-2\logs\main.log`. **A task #14 e a documentação do suporte não devem citá-lo como verdade** antes de alguém rodar `log.transports.file.getFile().path` num build real.

E um site de `console.error` ficou fora de propósito: `ErrorBoundary.tsx:32` — ou seja, **erro de render não chega ao arquivo**. Candidato à task #13.

## Branch

`feat/11-observability-logs-and-errors`, cortada de `feat/1-reliability-silent-failures` em 2026-10-15, com um commit por task.

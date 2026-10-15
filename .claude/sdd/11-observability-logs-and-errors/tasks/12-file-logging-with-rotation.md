# 12 — Log em arquivo com rotação, nos dois processos

**Issue:** [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** pendente

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

## Branch

`feat/11-observability-logs-and-errors`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

# 14 — Exportar os logs para o suporte

**Issue:** [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 12
**Status:** pendente

## Objetivo

Dar ao operador um botão que entregue o log ao suporte, sem acesso remoto à máquina e sem explicar caminho de pasta por telefone.

## Contexto

- Depende do arquivo existir (task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12)), e do caminho observado que ela registra em "Aprendizados"
- Cobre a **RF-04** da spec
- O caminho barato e sem dependência é `shell.showItemInFolder(arquivo)` no main, exposto por canal IPC: abre o Explorer com o arquivo já selecionado, e o operador arrasta para onde quiser
- A entrada fica na tela de status, perto da versão (`src/renderer/components/status/Status.tsx:57`) — é onde o suporte já manda o operador olhar quando pede a versão
- O arquivo pode não existir ainda (instalação nova, nada logado): o botão precisa dizer isso em vez de parecer quebrado

## Mudanças

### 1. Canal

`src/main/preload.ts` + `src/main/main.ts` + `src/main/ipc-events/onRevealLogs.ts` (novo): `revealLogs()` resolve o caminho pelo módulo de log, confere a existência e chama `shell.showItemInFolder`. Devolve se o arquivo existia, para o renderer poder avisar.

`src/__tests__/setup.ts` (alterado): stub do canal.

### 2. Botão

`src/renderer/components/status/Status.tsx` (alterado) + CSS Module: um link discreto ao lado da versão, "abrir logs". Primitivos de `src/renderer/base/` e tokens do `app.css`, conforme `.claude/rules/renderer-ui.md`.

## Testes

### `src/main/__tests__/onRevealLogs.test.ts` (novo)

- Arquivo existente: chama `shell.showItemInFolder` com o caminho certo e devolve `true`
- Arquivo ausente: **não** chama, e devolve `false`

### `src/renderer/components/status/__tests__/Status.test.tsx` (novo ou atualizado)

- Clique chama o canal
- Resposta negativa mostra o aviso de que ainda não há log
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual no Windows: clicar e ver o Explorer abrir com o arquivo selecionado

## Critérios de aceitação

- [ ] O botão abre a pasta com o arquivo de log selecionado
- [ ] Sem arquivo, o operador recebe aviso claro e nada quebra
- [ ] O botão não atrapalha a leitura da versão, que é a informação que o suporte pede primeiro
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Zipar, enviar por e-mail ou subir o log para algum lugar
- Visualizador de log dentro do app
- Rotina de limpeza manual (a rotação da task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12) resolve o crescimento)

## Branch

`feat/11-observability-logs-and-errors`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

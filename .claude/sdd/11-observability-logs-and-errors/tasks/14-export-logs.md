# 14 — Exportar os logs para o suporte

**Issue:** [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14)
**Feature:** [Observabilidade: log em arquivo e erro visível ao operador](../spec.md) — issue #11
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 12
**Status:** executada

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/main/ipc-events/onRevealLogs.ts`, `src/main/__tests__/onRevealLogs.test.ts`, `src/renderer/components/status/__tests__/Status.test.tsx`.
Alterados: `src/main/preload.ts`, `src/main/main.ts`, `src/__tests__/setup.ts`, `src/renderer/components/status/Status.tsx`, `Status.module.css`.

### Canal

| Canal | Direção | Preload | Main | Stub |
| --- | --- | --- | --- | --- |
| `revealLogs` | renderer → main | `preload.ts:38` | `main.ts:19` | `setup.ts:15` |

É o **sexto** nome de canal duplicado à mão e sem teste do par.

### O caminho do log não é codificado — e passa a se medir sozinho

O handler resolve em runtime (`logger.transports.file.getFile().path`), então nada aqui depende da **previsão** registrada nos Aprendizados. E ele registra `log file resolved to <caminho>` na primeira chamada: a medição que falta ao repo chega com o primeiro clique num Windows, e é esse valor que entra na documentação do suporte.

### O defeito que o review pegou, medido duas vezes

**`getFile()` cria o arquivo** (`FileRegistry.js:71-72`: `mkdirSync` + `writeFileSync` com flag `a`, dentro do `testFileWriting`). Probe:

```
antes do getFile  -> existe: false
depois do getFile -> existe: true | tamanho: 0
depois do info    -> existe: true | tamanho: 49
```

Então o `existsSync` da primeira versão era **sempre** verdadeiro: o `return false` era código morto, e instalação nova sem incidente abriria o Explorer com um `main.log` de 0 byte em vez do aviso.

**E o teste passava** — porque o mock devolvia `getFile: () => ({ path })`, objeto sem o efeito colateral da biblioteca. Quarto caso de ficção autoconsistente da sessão.

Correção em duas frentes:

1. **Código:** mede por `statSync(file).size > 0`, e a leitura vem **antes** da linha de log, porque ela escreve nesse mesmo arquivo. Os dois pontos estão comentados, porque a ordem é contraintuitiva.
2. **Teste:** o mock passou a replicar os dois efeitos reais (o `getFile` cria o arquivo vazio, o `info` faz append), e o caso negativo usa o **arquivo real vazio** do tempdir.

Mutações, verificadas por mim de forma independente: trocar `size > 0` por `existsSync` derruba o teste do caso negativo; mover a leitura para depois do `logger.info` derruba o mesmo teste.

### Correções que o review fez

- `useRef`/`useEffect` do `handleOpen` removidos: o handler já fecha sobre o valor atual, a maquinaria não comprava nada
- o `catch` do clique passou a **logar** a causa — engolir calado é o que esta spec existe para matar, e a assinatura do canal é nova
- `<a href="#">` → `<button type="button">`: é ação, não navegação, e num app de hash history o `href="#"` é navegação de verdade sendo barrada à mão
- o teste do componente usa `getByRole('button', …)` e `mockClear()` do stub compartilhado (que carrega histórico entre testes)
- o teste da linha de log virou honesto com `vi.resetModules()`, e agora também trava que ela não pode ficar atrás de um `return` antecipado

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · **71 testes em 16 arquivos** (baseline da spec: 50/11) · `ui.test.tsx` verde.

### O que não foi verificado

O Explorer abrindo com o arquivo selecionado, o clique real na janela, e o caminho do `main.log` no app empacotado — que é justamente o que a linha de log vai medir no primeiro uso.

## Branch

`feat/11-observability-logs-and-errors`, cortada de `feat/1-reliability-silent-failures` em 2026-10-15, com um commit por task.

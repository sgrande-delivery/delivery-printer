# 20 — Expor as impressoras do Windows ao renderer

**Issue:** [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Criar o canal que devolve as impressoras instaladas na máquina. É a base da tela de configuração, do diagnóstico de nome divergente e do teste local.

## Contexto

- `webContents.getPrintersAsync()` só existe no main, e hoje é chamado dentro do `onRawPrint` (`src/main/ipc-events/onRawPrint.ts:20`), numa `BrowserWindow` criada só para imprimir e fechada no callback
- Cobre a **RF-01** da spec
- Canal novo é par nos dois lados, mais stub em `src/__tests__/setup.ts` (`.claude/rules/printing.md`)
- Em Linux e em dev a lista vem diferente (ou vazia): o contrato tem de aguentar vazio, e quem consome tem de ter estado vazio
- O shape do retorno do Electron tem mais campos que interessam (`name`, `isDefault`, `displayName`, `status`, `options`). **Registrar em "Aprendizados" o shape observado no Windows** — a task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) vai querer saber se `status` diz algo útil

## Mudanças

### 1. Handler

`src/main/ipc-events/onListPrinters.ts` (novo): resolve a lista e devolve só o que o renderer precisa (`name`, `isDefault`, `displayName`), ordenada.

Precisa de um `webContents` para chamar. Opções: reusar a janela principal (barato, e é a que existe) ou criar uma invisível como o `onRawPrint` faz. **Reusar a principal**, passando-a ao handler, e registrar a decisão: criar janela para listar impressora é custo sem motivo.

### 2. Canal

`src/main/preload.ts` e `src/main/main.ts` (alterados): `listPrinters(): Promise<WindowsPrinter[]>`. `src/__tests__/setup.ts` (alterado): stub devolvendo duas impressoras fictícias, uma delas `isDefault`.

### 3. Tipo compartilhado

O tipo vive no main e chega ao renderer pelo `typeof electronHandler` (`src/renderer/preload.d.ts`) — sem declaração duplicada.

## Testes

### `src/main/__tests__/onListPrinters.test.ts` (novo)

- Devolve a lista mapeada, com os campos escolhidos
- Lista vazia não lança e devolve `[]`
- `getPrintersAsync` rejeitando é tratado (devolve `[]` e loga), porque a tela não pode quebrar por causa do spooler

### Integração / sanity

- `grep -rn "listPrinters" src/` mostra o par (preload + main) e o stub
- `npm run typecheck`, `npm run lint`, `npm test`
- Manual no Windows: comparar a lista com o Painel de Controle

## Critérios de aceitação

- [ ] O renderer recebe a lista real da máquina
- [ ] Lista vazia e falha do spooler não quebram nada
- [ ] O par do canal está nos dois lados, e o stub de teste existe
- [ ] O shape observado no Windows está registrado em "Aprendizados" do `plan.md`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Qualquer tela — tasks [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) e seguintes
- Mudar o `onRawPrint`: ele continua resolvendo a impressora como hoje (a decisão pendente 1 da spec é da task [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22))
- Detectar papel ou estado da impressora — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) explica por que não dá

## Branch

`feat/19-printing-settings-and-health`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

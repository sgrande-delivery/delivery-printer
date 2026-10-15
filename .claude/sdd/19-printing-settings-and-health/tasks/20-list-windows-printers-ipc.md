# 20 — Expor as impressoras do Windows ao renderer

**Issue:** [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** (nenhuma)
**Status:** executada

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/main/ipc-events/onListPrinters.ts`, `src/shared/windowsPrinter.ts` (o tipo, para as tasks 02/03/05), `src/main/__tests__/onListPrinters.test.ts`.
Alterados: `src/main/main.ts`, `src/main/preload.ts`, `src/__tests__/setup.ts`.

### Canal

| Canal | Direção | Preload | Main | Stub |
| --- | --- | --- | --- | --- |
| `listPrinters` | renderer → main | `preload.ts:20` | `main.ts:23` | `setup.ts:11` (duas impressoras, uma padrão) |

É o **nono** canal com o nome duplicado como literal nos dois lados e sem teste do par.

### Decisão: `event.sender`, sem criar janela

O handler usa o `webContents` de quem chamou — a janela principal — em vez de criar uma `BrowserWindow` invisível como o `printReceipt` faz para imprimir. Listar impressoras precisa de um `webContents`, não de uma página.

O ganho secundário é que os handlers continuam registrados no **nível do módulo** (o mais cedo possível, antes de o renderer invocar); passar a janela ao handler exigiria mover o registro para dentro do `boot`. E simplifica o teste, que passa um `sender` falso.

### O achado que afeta duas tasks à frente

**`Electron.PrinterInfo` no 43 tem quatro campos, e `isDefault` não é um deles** — medido nos typings: `description`, `displayName`, `name`, `options`, com `Options` declarado **vazio**. A única ocorrência de `isDefault*` no arquivo inteiro é `isDefaultProtocolClient`, sem relação.

O handler lê `isDefault` por narrowing e cai para `false` quando falta: se o Electron não o preencher no Windows, a tela da task 02 **não destaca** a padrão em vez de mentir. E a task 06 não pode contar com `status` para dizer se a impressora está online.

### Outras decisões

- **Sem dedupe na lista:** `printers.name` não tem índice único (medido na #17), e dois itens com o mesmo nome são exatamente o caso que a tela da #21 precisa mostrar
- **O canal nunca rejeita:** spooler caído devolve `[]` e loga com `logger.error` + `describeError`. `[]` é o contrato de "nada a mostrar", que também cobre Linux e dev
- Ordenação por `displayName` e depois `name`; `displayName` vazio cai para `name`

### Testes

`src/main/__tests__/onListPrinters.test.ts`, 4 casos. **130 testes em 22 arquivos** (baseline da spec: 126/21).

Mutação: propagar a rejeição do `getPrintersAsync` derruba `returns [] and logs when the spooler rejects`.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · par conferido por grep nos três lugares. **Revisado por mim** (orquestrador), não por subagente: é um arquivo de 33 linhas mais o teste, e o fato de maior risco — o shape do `PrinterInfo` — eu conferi pessoalmente nos typings.

### O que não foi verificado

Nada no Windows: se `isDefault` vem em runtime, o conteúdo de `options`, e a lista comparada com o Painel de Controle. Em Linux e dev a lista real pode vir vazia, e isso não foi medido — mas é o caso que o contrato `[]` cobre.

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

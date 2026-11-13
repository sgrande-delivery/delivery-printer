# 96 — Largura útil por impressora em userData, com o par IPC

**Issue:** [#96](https://github.com/sgrande-delivery/delivery-printer/issues/96)
**Feature:** [Largura útil por impressora](../spec.md) — issue #95
**Tipo:** feature
**Processo:** main+renderer (main, preload, shared)
**Depende de:** (nenhuma)
**Status:** shipped

## Objetivo

Guardar, nesta máquina, a largura útil (mm) de cada impressora do Windows num arquivo próprio em `userData`, e expô-la à tela por um par de canais IPC (ler tudo, gravar uma). É a base de dados da frente: a task 97 lê o mesmo arquivo a cada impressão, e a 99 escreve nele.

## Contexto

- Cobre **RF-01** e **RN-01, RN-02, RN-13, RN-14** da spec.
- O molde é o `ui-preferences.json` (`src/main/uiPreferences.ts`): `readStored` (`:25-54`) nunca lança e nunca escreve, distingue `ENOENT` (silêncio) de erro de leitura (`logger.warn`), recusa JSON que não é objeto; `writeFields` (`:85-87`) é read-modify-write por `writeFileAtomic` (`src/main/atomicFile.ts`). **Não** é para gravar dentro do `ui-preferences.json` (RN-01): arquivo próprio, `printer-preferences.json`.
- O padrão leitura/validação de JSON passa a existir em dois lugares. Extrair o `readStored` para um helper compartilhado do main (ex.: `src/main/jsonObjectFile.ts`, `readJsonObject(file, scope)`) é aceitável **se** os testes de `uiPreferences.test.ts` continuarem verdes sem mudança de asserção; se a extração exigir mexer nas asserções, duplique o trecho no módulo novo e registre no plan.
- O casamento de nome é o de `findPrinterByDeviceName` (`src/shared/printerMatch.ts:20-25`): nome inteiro, sem diferenciar maiúscula, sem `trim` (RN-02).
- Faixa em `src/shared/`, porque os dois lados validam — mesmo motivo de `src/shared/sidebarWidth.ts`. Mas, **diferente** da sidebar, valor inválido **não é ajustado**: é descartado na leitura e recusado na escrita (RN-13).
- Canais: `.claude/rules/printing.md`, "IPC: o nome do canal mora em um lugar só". O gate `src/shared/__tests__/ipcChannels.test.ts` falha se a constante não for usada nos dois lados.

## Mudanças

### 1. Faixa, tipos e casamento compartilhados

`src/shared/printerGeometry.ts` (novo) — puro, sem `node:` e sem DOM (está no `include` dos dois tsconfigs):

```ts
export const USEFUL_WIDTH_MIN_MM = 40;
export const USEFUL_WIDTH_MAX_MM = 80;

// One entry per Windows device, keyed by the device name as Windows reports it.
export type PrinterPreference = { usefulWidthMm: number };
export type PrinterPreferences = Record<string, PrinterPreference>;

export function isUsefulWidthMm(value: unknown): value is number { /* inteiro finito em [40, 80] */ }

// Same criterion as findPrinterByDeviceName (shared/printerMatch): whole name, case-insensitive.
export function findPrinterPreference(prefs: PrinterPreferences, deviceName: string | null | undefined): PrinterPreference | undefined
```

O comentário diz por que a faixa mora aqui e por que valor inválido não é ajustado (RN-13).

### 2. O arquivo em userData

`src/main/printerPreferences.ts` (novo):

- `PRINTER_PREFERENCES_FILE = 'printer-preferences.json'`, em `app.getPath('userData')`.
- Formato no disco: `{ "devices": { "<deviceName>": { "usefulWidthMm": 72 } } }` — um objeto com a chave `devices`, para caber preferência futura sem migração.
- `readPrinterPreferences(): PrinterPreferences` — nunca lança, nunca escreve. Arquivo ausente → `{}` sem log; ilegível / não-JSON / não-objeto → `{}` com `logger.warn('printer-preferences: …')`; entrada com `usefulWidthMm` fora da faixa ou não-inteiro → descartada com `logger.warn` que cita o dispositivo e o valor.
- `writePrinterUsefulWidth(deviceName: string, usefulWidthMm: number | null): PrinterPreferences` — `null` remove a entrada; número fora da faixa ou `deviceName` vazio → `throw new Error(...)` (não grava). Read-modify-write sobre o objeto do disco: chave desconhecida na raiz e outros dispositivos sobrevivem. Se já existe entrada para o mesmo dispositivo com outra caixa de letra, ela é **substituída** (não duplica: RN-02). Devolve o mapa resultante (o que a tela adota).
- `printerPreferenceFor(deviceName: string | null | undefined): PrinterPreference | undefined` — atalho `findPrinterPreference(readPrinterPreferences(), deviceName)`, que é o que a task 97 vai chamar.

### 3. O par de canais

`src/shared/ipcChannels.ts:8-29` — em `INVOKE_CHANNELS`:

```diff
+  printerPreferences: 'printer:preferences',
+  setPrinterUsefulWidth: 'printer:set-useful-width',
```

`src/main/ipc-events/onPrinterPreferences.ts` (novo) — devolve `readPrinterPreferences()`.

`src/main/ipc-events/onSetPrinterUsefulWidth.ts` (novo) — recebe `(event, request: unknown)`; valida o formato `{ deviceName: string; usefulWidthMm: number | null }` por narrowing (o renderer não é tipado em runtime, como em `onPrintTest.ts:8-21`); inválido → `throw`; erro de gravação → `logger.error('printer-preferences: could not save', describeError(err))` e relança (molde: `onSetUiSidebarWidth.ts`).

`src/main/main.ts:39-60` — `ipcMain.handle(INVOKE_CHANNELS.printerPreferences, onPrinterPreferences)` e `ipcMain.handle(INVOKE_CHANNELS.setPrinterUsefulWidth, onSetPrinterUsefulWidth)`.

`src/main/preload.ts:16-155` — no `electronHandler`, com comentário de uma linha cada:

```ts
// Every Windows device with a useful width saved on this machine. Never the receipt.
printerPreferences: (): Promise<PrinterPreferences> => ipcRenderer.invoke(INVOKE_CHANNELS.printerPreferences),

// null goes back to automatic (the area the driver declares). Resolves to the whole map after the write;
// rejects for a width outside 40–80.
setPrinterUsefulWidth: (deviceName: string, usefulWidthMm: number | null): Promise<PrinterPreferences> =>
  ipcRenderer.invoke(INVOKE_CHANNELS.setPrinterUsefulWidth, { deviceName, usefulWidthMm }),
```

`src/__tests__/setup.ts:27-73` — stubs `printerPreferences: vi.fn().mockResolvedValue({})` e `setPrinterUsefulWidth` que devolve o mapa com a entrada aplicada (ou removida, para `null`) — stub que ecoa sem validar faria a tela aceitar 90.

## Testes

### `src/shared/__tests__/printerGeometry.test.ts` (novo)

- `isUsefulWidthMm`: 40 e 80 passam; 39, 81, 72.5, `NaN`, `'72'`, `null` não.
- `findPrinterPreference` casa sem diferenciar maiúscula e não casa com `null`/`undefined`/nome parcial.

### `src/main/__tests__/printerPreferences.test.ts` (novo)

Arquivo real num diretório temporário (molde: `uiPreferences.test.ts`, com `app.getPath('userData')` mockado e o `logger` mockado):

- arquivo ausente → `{}` e nenhum `warn`;
- JSON inválido, array, `devices` não-objeto → `{}` e um `warn`, e o arquivo **não** é reescrito pela leitura;
- entrada com 30, 90, 72.5 ou `'72'` → descartada com `warn`; as válidas ao lado sobrevivem;
- gravar → ler devolve o valor; gravar `null` remove; gravar `'epson'` depois de `'EPSON'` deixa **uma** entrada;
- gravar preserva chave desconhecida na raiz e outros dispositivos;
- gravar 39/81/`''` lança e não toca o arquivo.

### `src/main/__tests__/printerPreferencesIpc.test.ts` (novo) ou dentro do anterior

- o handler de gravação recusa payload malformado (`{}`, `deviceName` número, `usefulWidthMm` string) e grava o válido.

### Integração / sanity

- `src/shared/__tests__/ipcChannels.test.ts` passa com as duas constantes novas.
- `grep -rn "printer:set-useful-width\|printer:preferences" src/` mostra só o `ipcChannels.ts`.
- `npm run typecheck` sem erros; `npx vitest run --maxWorkers=4` passando; `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:22`).

## Critérios de aceitação

- [ ] `printer-preferences.json` é criado em `userData` só na primeira gravação, e uma leitura nunca o escreve
- [ ] Entrada inválida no arquivo volta a "automática" com `warn`, sem derrubar as válidas
- [ ] A escrita recusa largura fora de 40–80 e não grava nada
- [ ] Os dois canais existem no `ipcChannels.ts`, no `preload.ts`, no `main.ts` e no stub de `setup.ts`
- [ ] `npm run typecheck` sem erros
- [ ] `npx vitest run --maxWorkers=4` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- Ler a preferência na impressão (task 97) e na página de teste (task 98)
- Qualquer tela (task 99)
- Migrar o `ui-preferences.json` ou mudar o comportamento dele

## Implementação

**Arquivos (implementação):**

- `src/shared/printerGeometry.ts` (novo) — `USEFUL_WIDTH_MIN_MM`/`MAX_MM` (40/80), `PrinterPreference(s)`, `isUsefulWidthMm` (inteiro finito na faixa, sem ajuste), `findPrinterPreference`.
- `src/shared/printerMatch.ts` — `isSameDeviceName(name, deviceName)` extraído; `findPrinterByDeviceName` passa a usá-lo. É o critério único do destino, agora também da busca e da deduplicação da largura útil (RN-02).
- `src/main/jsonObjectFile.ts` (novo) — `readJsonObjectFile(file, scope)` (união `ok` | `absent` | `unreadable` | `invalid`), `readJsonObject` (o valor ou `null`) e `isJsonObject`, extraídos do `readStored` de `uiPreferences.ts`, com os mesmos textos de log prefixados pelo `scope`. Tolera BOM no começo do arquivo (Bloco de Notas "UTF-8 com BOM", `-Encoding UTF8` do PowerShell 5.1) — o que também deixa a leitura do `ui-preferences.json` mais tolerante, sem outra mudança.
- `src/main/uiPreferences.ts` — `readStored` delega ao helper; comportamento e mensagens idênticos (`preferences: …`).
- `src/main/printerPreferences.ts` (novo) — `printer-preferences.json` em `userData`, formato `{ "devices": { "<device>": { "usefulWidthMm": N } } }`; `readPrinterPreferences` (descarta entrada inválida com `warn`, nunca escreve), `writePrinterUsefulWidth` (recusa fora da faixa e nome vazio; **recusa gravar sobre arquivo que existe e não pôde ser lido** — recomeçar de `{}` apagaria as outras impressoras —, mas recomeça de arquivo que não é JSON; substitui o mesmo dispositivo com outra caixa mantendo os outros campos da entrada; preserva chave desconhecida da raiz e entradas ilegíveis de outros dispositivos; grava indentado, para o suporte ler/editar); a leitura descarta chave vazia, `printerPreferenceFor` (lida a cada chamada, sem cache).
- `src/main/ipc-events/onPrinterPreferences.ts`, `onSetPrinterUsefulWidth.ts` (novos) — leitura; escrita com narrowing do pedido **e da faixa** (pedido inválido rejeita sem log de erro, para que o `logger.error` + relançamento signifique só falha de gravação).
- `src/shared/ipcChannels.ts` (`printerPreferences: 'printer:preferences'`, `setPrinterUsefulWidth: 'printer:set-useful-width'`), `src/main/main.ts` (dois `ipcMain.handle`), `src/main/preload.ts` (dois métodos no `electronHandler`).

**Testes:**

- `src/shared/__tests__/printerGeometry.test.ts` (novo) — faixa (aceita 40/48/72/80; recusa 39, 81, 72.5, NaN, Infinity, `'72'`, null, undefined) e casamento sem diferenciar maiúscula.
- `src/main/__tests__/printerPreferences.test.ts` (novo) — arquivo real em diretório temporário: ausente, ilegível, entrada inválida, ida e volta, `null`, mesma impressora com outra caixa, preservação no read-modify-write, recusa sem tocar o arquivo, e os dois handlers (pedido malformado não grava; largura recusada loga e relança).
- `src/__tests__/setup.ts` — stubs `printerPreferences` e `setPrinterUsefulWidth` (este recusa o que o main recusa).
- Também: arquivo com BOM, chave vazia descartada, campos da entrada preservados, recusa de gravar sobre arquivo ilegível (um diretório no lugar do arquivo dá `EISDIR`, o mesmo ramo de antivírus/permissão).
- Mutação: trocar `isSameDeviceName` por `===` na deduplicação derruba 1 teste; aceitar qualquer largura na escrita derruba 4; tirar o corte do BOM derruba 1; tirar a recusa de arquivo ilegível derruba 1.

**Review (`code-reviewer-typescript`):** reprovou por 2 erros de Prettier (corrigidos). Aprovou as cinco decisões do implementador (extração do `readJsonObject`, `isSameDeviceName`, preservar entradas ilegíveis de outros dispositivos, JSON indentado, stub sem estado que valida a faixa). As sugestões 2–10 foram aplicadas: campos da entrada preservados, BOM, recusa de gravar sobre arquivo ilegível, faixa validada no handler, narrowing sem cast, chave vazia, comentários com origem.

**Suíte:** 88 arquivos / 1099 testes (baseline 86 / 1052); typecheck 0; lint 0 erros, 1 aviso (o de `Login.tsx`).

## Branch

`feat/95-printing-useful-width-per-printer`, cortada de `origin/master` (`be947da`) em 2026-11-13. Um commit por task.

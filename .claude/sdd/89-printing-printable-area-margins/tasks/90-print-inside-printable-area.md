# 90 — Imprimir na área imprimível do driver, em vez da largura física do papel

**Issue:** [#90](https://github.com/sgrande-delivery/delivery-printer/issues/90)
**Feature:** [Imprimir dentro da área imprimível do driver](../spec.md) — issue #89
**Tipo:** fix
**Processo:** main
**Depende de:** —
**Status:** shipped

## Objetivo

Trocar `marginType: 'none'` por `'printableArea'` na única chamada de `webContents.print` do repo, para que a caixa de conteúdo da página passe a ser a área que a impressora alcança, e não a largura física do papel. É a frente inteira em um valor de enum — e é por isso que o que esta task tem de entregar junto é o **porquê escrito** e a **rede que impede o valor de voltar**.

## Contexto

- Cobre a **RF-01** e a **RF-05** da spec, e carrega as **RN-01 a RN-04**.
- `printReceipt` (`src/main/ipc-events/onRawPrint.ts:11`) é o **único** ponto do repo que chama `webContents.print` (`:25`), e todo caminho desemboca nele: o worker da fila (`src/main/queue/print-queue-worker.ts`), o `rawPrint` direto e o `printTest`. Conferir com `grep -rn "webContents.print" src/` antes e depois.
- Hoje ele manda `margins: { marginType: 'none' }` (`:32-34`). **`none` não quer dizer "sem margem no papel"**: quer dizer diagramar sobre a folha inteira e ignorar a área não imprimível que o driver declara. Numa bobina de 80 mm a cabeça térmica cobre ~72 mm (576 pontos a 203 dpi), então o que a `delivery-api` posiciona depois disso é desenhado pelo Chromium e nunca chega ao papel.
- **O comprovante se adapta sem uma linha de HTML mudar.** O contêiner que a `delivery-api` emite é `max-width: {{ width_mm }}mm; width: 100%` (`resources/views/print/layout.blade.php`, e o equivalente em `public/css/socket/order/styles.css` para o modelo `original`). `width: 100%` é relativo à caixa de conteúdo: encolher a caixa encolhe o comprovante. Nada de layout muda aqui (RN-04, e CLAUDE.md).
- **`marginType` diferente de `'default'` ignora o `@page { margin }` do HTML** (RN-02). O comprovante declara `margin: 0` e isso deixa de decidir qualquer coisa — é justamente o que permite corrigir sem tocar nos seis documentos que estão em produção.
- **O resultado depende do que o driver declara** (RN-03). Driver que declara área imprimível igual ao papel não muda nada e **não regride**; driver que declara margens generosas acrescenta recuo nas quatro bordas. A medição é no PDV (ver "Verificação da entrega" no `plan.md`), não aqui.
- **`onRawPrint.ts` não tem teste nenhum hoje.** Em toda suíte que o toca, `printReceipt` é substituído por `vi.fn()` (`src/main/queue/__tests__/queue-ipc.test.ts:12-14`, `test-print.test.ts:14-16`, `print-queue-listeners.test.ts:7`). As opções de impressão que este app manda para o Chromium **não são afirmadas em lugar nenhum** — é a falta que esta task fecha.

## Mudanças

### 1. `src/main/ipc-events/onRawPrint.ts:32-34`

```ts
margins: {
  marginType: 'printableArea',
},
```

Com o comentário imediatamente acima, porque o valor sozinho não carrega nada disto:

- `none` pede ao Chromium para desenhar sobre a folha inteira, inclusive onde a impressora não imprime; numa bobina de 80 mm a cabeça cobre ~72 mm, e o comprovante saía cortado à direita (#89);
- `printableArea` faz a caixa de conteúdo ser a área que o driver declara, e o contêiner relativo da `delivery-api` (`max-width: Xmm; width: 100%`) encolhe sozinho para dentro dela;
- qualquer `marginType` que não seja `default` **sobrepõe o `@page { margin }` do HTML** — é o que permite consertar sem tocar no documento que a API renderiza.

Nada mais da chamada muda: `silent`, `deviceName`, `color`, `collate` e `copies` ficam como estão.

### 2. `.claude/rules/printing.md`

Na descrição do passo 4 de "O que acontece quando um pedido chega", acrescentar a invariante, em uma ou duas linhas: **a geometria da impressão é decidida pelo `marginType`, num ponto só, e `none` significa desenhar fora da área imprimível.** A regra já descreve a chamada (`webContents.print({ silent: true, ... })`) e é onde a próxima pessoa vai procurar.

Vale também dizer o que a RN-01 diz: caminho novo que precise de opção de impressão diferente abre a discussão, não acrescenta um segundo `print`.

## Testes

Arquivo novo: **`src/main/__tests__/onRawPrint.test.ts`**, com `electron` mockado. O molde é o `printFonts.test.ts`, que já lida com a parte chata: `vi.mock('../logger')`, porque o `electron-log/main` puxa o electron de verdade e o `getPrintFontFacesCss` passa por ele.

O mock de `electron` precisa de `app` (só `isPackaged: false`, que é o que o `getAssetPath` lê) e de um `BrowserWindow` que devolva `{ webContents: { getPrintersAsync, loadFile, print }, isDestroyed, close }`, com `print` guardando as opções recebidas e chamando o callback.

O que cobrir, em ordem de valor:

1. **As opções de impressão, com `marginType: 'printableArea'`.** É a razão da task. **Verificar por mutação:** voltar o valor para `'none'` tem de derrubar este teste, e só ele.
2. **O resto das opções continua igual** — `silent: true`, `color: false`, `collate: false` e o `copies` que veio no payload. Pinar isso agora custa três linhas e é o que transforma o arquivo numa rede, em vez de um espelho de uma linha.
3. **O destino.** `deviceName` casa com a impressora do Windows sem diferenciar maiúsculas (é o que o `findPrinterByDeviceName` promete) e, quando não casa ou vem `null`, `deviceName` chega ao `print` como `undefined` — que é a impressora padrão do sistema, e é comportamento desejado (`.claude/rules/printing.md`, "O contrato do `rawPrint`").
4. **O arquivo temporário.** É escrito em `os.tmpdir()` com o nome `<id>.print.html` e já com os `@font-face` injetados, e é removido **só** no caminho de sucesso.
5. **A falha.** A promessa rejeita com o `reason` que o Electron devolveu, e a janela é fechada nos dois caminhos (é o `finally` que impede a pilha de janelas nas cinco tentativas da fila).

Os itens 3 a 5 não são escopo novo: são o comportamento que já existe e que nunca teve teste. Se algum deles custar mais do que parece, o item 1 é o que não pode faltar.

## Critérios de aceitação

- [x] `webContents.print` é chamado com `margins: { marginType: 'printableArea' }`, e o resto das opções está intacto
- [x] `grep -rn "webContents.print" src/` continua mostrando **um** ponto de chamada
- [x] O comentário acima da opção diz o que `none` fazia, por que cortava e por que o comprovante se adapta sozinho — sem narrar a linha
- [x] `.claude/rules/printing.md` registra a invariante da geometria no passo 4
- [x] `src/main/__tests__/onRawPrint.test.ts` existe, cobre pelo menos o item 1, e **foi verificado por mutação** (voltar para `'none'` derruba o teste)
- [x] `npm run typecheck`, `npm run lint` e `npm test` saem como o baseline (0 erro; o aviso de `Login.tsx` pode existir, não pode aumentar)

## Implementação

Executada em 2026-11-12, um commit. `src/main/ipc-events/onRawPrint.ts`, `.claude/rules/printing.md` e o arquivo de teste novo `src/main/__tests__/onRawPrint.test.ts`.

### A mudança

`marginType: 'none'` → `'printableArea'`, e mais nada da chamada. O comentário de seis linhas acima dela diz o que `none` fazia, por que a bobina de 80 mm cortava e por que o contêiner relativo da `delivery-api` encolhe sozinho para dentro da área.

### A terceira frase do comentário foi ancorada depois do review

A redação original afirmava, seca, que *"qualquer tipo diferente de `default` sobrepõe o `@page margin` do HTML"*. O review apontou que isso é **contrato do Chromium, não verificável neste repo** — a tipagem do Electron (`electron.d.ts:24918`) documenta só os valores aceitos, e nada aqui mede o comportamento. A frase passou a citar a origem (`spec 89, RN-02`) e a dizer que não é medível daqui.

E o review notou algo que o implementador não tinha visto: **essa frase não é o que faz a troca funcionar.** `none` também é diferente de `default`, então o `@page { margin: 0 }` da API já era ignorado antes. O que ela explica é outra coisa — por que o documento da API não precisa mudar.

### A regra ganhou o valor em vigor, não só o anterior

A primeira redação de `.claude/rules/printing.md:20` explicava o que `none` fazia e por que cortava, mas **não nomeava `printableArea`**. Como o passo 4 cita a chamada abreviada (`webContents.print({ silent: true, ... })`), a próxima pessoa não teria como saber qual valor está em vigor — e o presente de "`none` significa desenhar fora da área imprimível" podia ser lido como o valor atual. Corrigido pelo review.

### O primeiro teste de `onRawPrint.ts`

7 casos, com `electron` mockado e `fs`, `os`, `printFonts` e `printerMatch` reais — a borda que a regra da fila já elogia no `queue-ipc.test.ts`. Além da `marginType`, pinam o que nunca teve rede: as outras opções (`toMatchObject`, para que opção nova não quebre o teste), o casamento de `deviceName` sem diferenciar maiúsculas, o `undefined` que vira impressora padrão do Windows, o arquivo temporário escrito com os `@font-face` **antes** do `loadFile`, e a rejeição com a string crua do Electron com o `.html` **permanecendo** em `%TEMP%` — que é contrato escrito, não acidente.

### Verificação

- `npm run typecheck` 0 · `npm run lint` **0 erros e 1 aviso** (o `set-state-in-effect` de `Login.tsx`, da base) · `npx vitest run --maxWorkers=4` **74 arquivos / 819 testes** (812 do baseline + 7).
- **Mutação, conferida duas vezes independentes** (review e `/execute`): `'printableArea'` → `'none'` derruba **1** teste na suíte inteira, e é o caso 1. O review fez uma segunda mutação — remover `deviceName: printer?.name` — que derruba 3, provando que o `toHaveProperty('deviceName', undefined)` não é asserção em vácuo.
- `grep -rn "webContents.print" src/`: **um** ponto de chamada (`onRawPrint.ts:25`); a outra ocorrência é menção em comentário no `printFailure.ts`.
- `npm run build` compila, e `out/main/main.js` traz uma chamada de `webContents.print(` com `marginType: "printableArea"`.
- **Não verificado, e é o que importa para a entrega:** a impressão real na térmica de 80 mm. A máquina é WSL e não enxerga impressora do Windows; o número da RN-03 sai no PDV, pela escala da task #91.

### Nota do review que não virou mudança

Nenhum teste guarda a **RN-01** (um `webContents.print` só no repo) — ela segue como `grep` no critério de aceitação. Há precedente de gate textual nesta base (`src/shared/__tests__/ipcChannels.test.ts` lê o texto do preload e do main) se um dia valer automatizar. Ficou como sugestão.

## Fora de escopo

- **`scaleFactor` e `pageSize`.** São o plano B, e só se escrevem com a medição do PDV na mão (decisão pendente 1 da spec).
- **Configuração de margem ou largura por instalação.** Não há arquivo novo em `userData` nesta frente.
- **A página de teste local.** É a task #91, e depende desta.
- **Qualquer layout de comprovante**, aqui ou na `delivery-api`.
- **Mexer na Margem (`margin_size`) da loja.** O paliativo é do suporte; o app não escreve configuração de loja por causa de uma mudança de impressão (RN-09).

## Branch

`feat/89-printing-printable-area-margins`, cortada de `origin/master` (`2dec3d8`) em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

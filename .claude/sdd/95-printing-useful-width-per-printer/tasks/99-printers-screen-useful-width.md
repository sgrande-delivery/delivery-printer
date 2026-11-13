# 99 — Largura útil e Medir na tela Impressoras

**Issue:** [#99](https://github.com/sgrande-delivery/delivery-printer/issues/99)
**Feature:** [Largura útil por impressora](../spec.md) — issue #95
**Tipo:** feature
**Processo:** renderer
**Depende de:** 96, 98
**Status:** shipped

## Objetivo

Dar ao operador o jeito de configurar a largura útil sem digitar número nenhum: na gaveta de edição da impressora, uma seção "Nesta máquina" que liga o ajuste, mede (imprime a página de medição e pergunta o último número da escala) e grava a resposta; e a largura configurada aparece no cartão. Sem esta task, a frente só serve para quem edita `printer-preferences.json` à mão.

## Contexto

- Cobre **RF-07** e **RN-02, RN-12, RN-14** da spec; segue as **decisões pendentes 1 e 2** (seção dentro da gaveta, gravação imediata; valor inicial 72/48).
- Estado atual:
  - `Printers.tsx:12-82` é dono da lista e da gaveta (`editing`, `:15-16`; `PrinterDrawer`, `:67-78`).
  - `PrinterDrawer.tsx:63-350` tem rascunho (`draft`, `:65`), "sujo" (`isDirty`, `:70`), confirmação ao sair (`:81-92`, `:107-130`) e trava de Tab (`:132-154`), e o rodapé "Salvar no servidor" (`:341-343`). A linha "Ativa" (`:310-316`) é o último bloco do corpo antes do erro (`:317-321`).
  - `PrinterItem.tsx:80` mostra `detailLine(printer)` (`printerView.ts:36-45`); o botão de teste (`:82-90`) chama `window.electron.printTest` e fala "enviada para a fila" — molde do "Medir".
  - `printer.resolvedDevice` (`src/renderer/hooks/usePrinters.ts:16`) é o dispositivo para onde o comprovante desse cadastro vai agora — é a chave da largura útil na tela (RN-02).
- Canais da task 96: `window.electron.printerPreferences()` e `window.electron.setPrinterUsefulWidth(deviceName, mm | null)`, que devolve o mapa inteiro (adotar o que volta, não o que foi pedido). `findPrinterPreference` e a faixa em `src/shared/printerGeometry.ts`.
- Medição da task 98: `printTest({ …, purpose: 'measure' })`. O nome da escala impressa é `TEST_PRINT_SCALE_TITLE` (`src/shared/testPrintContent.ts:20`) — a pergunta cita a escala por ele, não por texto digitado (Aprendizados da spec 89).
- Regras de UI: `.claude/rules/renderer-ui.md` — CSS Module ao lado, `cx()`, tokens, primitivos de `base/` (`Switch`, `Stepper`, `Chip`, `Button`), **nenhum ícone novo** (o recorte da fonte é fechado), retorno ao operador só por `useMessaging().handleOpen`. A lógica que decide texto e opções sai do componente como função pura em `printerView.ts`.

## Mudanças

### 1. Funções puras

`src/renderer/components/printers/printerView.ts`:

- `defaultUsefulWidth(paperWidth: number): number` — 48 para 58, 72 para o resto; o comentário diz de onde vêm (576 e 384 pontos a 203 dpi) e que é ponto de partida, não medida.
- `measureMarks(paperWidth: number): number[]` — as marcas de 5 em 5 que a escala imprime, de `USEFUL_WIDTH_MIN_MM` até `Math.floor(paper / 5) * 5`: `[40, 45, 50, 55]` na de 58, `[40 … 80]` na de 80.
- `detailLine(printer, usefulWidthMm: number | null = null)` (`:36-45`) — acrescenta `largura útil 72 mm` depois da bobina quando há valor.

### 2. O hook

`src/renderer/hooks/usePrinterPreferences.ts` (novo) — lê `printerPreferences()` ao montar; `setUsefulWidth(deviceName, mm | null): Promise<void>` chama o canal e adota o mapa que volta; falha de leitura → `{}` + `log.error` (a tela fica "automática", que é o que a impressão também faria se o arquivo não fosse legível); falha de gravação → relança para a seção dizer. Sem `createSharedStore`: só esta tela lê.

### 3. A seção

`src/renderer/components/printers/UsefulWidthSection.tsx` + `UsefulWidthSection.module.css` (novos), renderizada em `PrinterDrawer.tsx` entre a linha "Ativa" (`:310-316`) e o erro (`:317`). Props: `printer: ResolvedPrinter`, `usefulWidthMm: number | null`, `onChange(mm: number | null): Promise<void>`.

- Rótulo da seção: **"Largura útil nesta máquina"**.
- Sem `printer.resolvedDevice`: só a dica *"Disponível quando a impressora do Windows deste cadastro for encontrada nesta máquina."* e nada clicável.
- Linha com `Switch` (`label="Ajustar a largura útil"`): desligado, dica *"Automática: o app usa a área que o driver da impressora informa."*; ligar grava `defaultUsefulWidth(printer.paper_width)`; desligar grava `null`.
- Ligado: `Stepper` (`label="Largura útil"`, `min`/`max` da faixa compartilhada, `step` 1, `display={`${v} mm`}`) que grava a cada passo.
- Botões `Button size={34}`: **"Medir"** (`outlined`) e **"Imprimir teste"** (`text`), ambos chamando `window.electron.printTest` com o pedido do cadastro (`printerName`, `stationLabel(printer.station)`, `paper_width`, `resolvedDevice`) — o primeiro com `purpose: 'measure'`.
- Depois que a medição foi **enviada**: um grupo (`role="group"`, rótulo visível) *"Qual o último número que saiu inteiro na escala “${TEST_PRINT_SCALE_TITLE}”?"* com um `Chip` por `measureMarks(printer.paper_width)` e um "Cancelar". Escolher grava o número **como está** (RN-12), fecha a pergunta e avisa pelo toast *"Largura útil de 70 mm salva nesta máquina. Imprima o teste para conferir a moldura."*
- Dica fixa ao pé: *"Vale para todo cadastro que usa “${resolvedDevice}” neste computador. Fica salvo aqui, não no servidor."*
- Falha de gravação → toast *"Não foi possível salvar a largura útil neste computador."*; falha de envio → o mesmo texto do cartão (`printFailureReason`, `PrinterItem.tsx:53`).
- **Fora do rascunho da gaveta**: mexer na seção não deixa a gaveta "suja", não pede confirmação ao sair e não passa pelo "Salvar no servidor". Os controles novos entram na trava de Tab sem mudança (`FOCUSABLE`, `:42`).

CSS: os valores de rótulo, dica e linha são os mesmos da gaveta (`PrinterDrawer.module.css:77-94`, `:169-178`), declarados no módulo da seção — não importar o módulo da gaveta. Separador de topo com `var(--line)` para a seção ler como outra coisa que o cadastro.

### 4. A tela passa o dado

`src/renderer/components/printers/Printers.tsx` — usa o hook; passa ao `PrinterList`/`PrinterItem` a largura do `resolvedDevice` de cada cadastro (`findPrinterPreference`) para o `detailLine`, e à gaveta `usefulWidthMm` + `onUsefulWidthChange`.

`PrinterList.tsx:6-12` e `PrinterItem.tsx:14-20` — prop `usefulWidthFor(printer): number | null` (ou o mapa), sem lógica nova no item além do `detailLine`.

## Testes

### `src/renderer/components/printers/__tests__/printerView.test.ts` (atualizado)

- `defaultUsefulWidth(58)` = 48, `(80)` = 72, `(72)` = 72;
- `measureMarks(58)` = `[40, 45, 50, 55]`, `measureMarks(80)` termina em 80 e começa em 40;
- `detailLine` com e sem largura útil.

### `src/renderer/components/printers/__tests__/UsefulWidthSection.test.tsx` (novo)

- sem `resolvedDevice`: a dica aparece, nenhum `Switch`, nenhum botão;
- ligar o `Switch` chama `onChange(72)` numa bobina de 80 e `onChange(48)` numa de 58; desligar chama `onChange(null)`;
- o `Stepper` aparece só ligado e "Aumentar" chama `onChange(valor + 1)`, sem passar de 80;
- "Medir" chama `printTest` com `purpose: 'measure'` e o `resolvedDevice`; depois do envio aparecem os chips das marcas; clicar "70" chama `onChange(70)` e some a pergunta;
- falha do `printTest` não mostra a pergunta e avisa;
- presença de classe por elemento contra `styles.<chave>` nos blocos com layout (`.claude/rules/renderer-ui.md`, CSS Modules).

### `PrinterDrawer.test.tsx` / `Printers.test.tsx` (atualizados)

- mexer na seção não liga a confirmação "Descartar as alterações?" ao fechar;
- o cartão mostra `largura útil 72 mm` quando o stub de `printerPreferences` devolve 72 para o dispositivo resolvido (com caixa de letra diferente — RN-02);
- o stub de `setup.ts` da task 96 basta; se o teste precisar de outro valor, `mockResolvedValueOnce`.

### Integração / sanity

- `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run lint` no baseline.
- Verificação manual em `npm run dev` (nunca build de produção contra a API real): abrir Impressoras → Editar numa impressora encontrada → a seção aparece; ligar, medir, responder; o cartão mostra a largura.

## Critérios de aceitação

- [ ] Caminho até a funcionalidade: menu **Impressoras** → **Editar** no cartão → seção "Largura útil nesta máquina"
- [ ] Ligar o ajuste grava 72 (bobina de 80) ou 48 (bobina de 58); desligar volta a automática
- [ ] "Medir" envia a página de medição e a resposta escolhida é gravada como está
- [ ] Mexer na seção não torna a gaveta "suja" nem passa pelo "Salvar no servidor"
- [ ] O cartão mostra a largura útil do dispositivo resolvido
- [ ] Nenhum ícone fora da união `IconName`, nenhuma cor fora dos tokens
- [ ] `npm run typecheck` sem erros
- [ ] `npx vitest run --maxWorkers=4` passando
- [ ] `npm run lint` sem erro novo

## Fora de escopo

- A largura útil na tela `/print-test` (spec, "Fora do escopo")
- Campo "Reduzir %" / `scaleFactor`
- Configurar a largura útil de impressora instalada que não tem cadastro (a lista "Impressoras instaladas nesta máquina", `Printers.tsx:53-66`, continua só leitura)
- Refatorar a gaveta num primitivo de diálogo

## Implementação

**Caminho até a funcionalidade:** menu **Impressoras** → **Editar** (ou **Corrigir**) no cartão → seção "Largura útil nesta máquina", entre a linha "Ativa" e o rodapé da gaveta. A largura configurada aparece na linha de detalhe do cartão.

**Arquivos (implementação):**

- `src/renderer/components/printers/printerView.ts` — `detailLine(printer, usefulWidthMm = null)` acrescenta `largura útil N mm` depois da bobina; `defaultUsefulWidth` (48 na de 58, 72 nas outras); `measureMarks` (marcas de 5 em 5 de 40 até a bobina).
- `src/renderer/hooks/usePrinterPreferences.ts` (novo) — lê ao montar; `setUsefulWidth` adota o mapa que o main devolve (nunca mescla); a primeira leitura, se chegar depois de uma gravação, é ignorada; falha de leitura → `{}` + `log.error`.
- `src/renderer/components/printers/UsefulWidthSection.tsx` + `.module.css` (novos) — `Switch` "Ajustar a largura útil" (liga com o valor inicial, desliga para automática), `Stepper` 40–80 gravando a cada passo, "Medir" (`printTest` com `purpose: 'measure'`, depois a pergunta com um `Chip` por marca; a resposta é gravada como está) e "Imprimir teste" (`purpose: 'check'`); dica fixa com o nome do dispositivo e "não no servidor". Sem impressora encontrada, só a dica. Só os botões de impressão ficam desabilitados enquanto a página é enfileirada; gravar não desabilita nada.
- `src/renderer/components/printers/PrinterDrawer.tsx` — props `usefulWidthMm` e `onUsefulWidthChange`; renderiza a seção pelo cadastro salvo, fora do rascunho.
- `Printers.tsx`, `PrinterList.tsx`, `PrinterItem.tsx` — o hook mora na tela; `usefulWidthFor(printer)` casa `resolvedDevice` pelo critério da impressão (`findPrinterPreference`).

**Testes:**

- `__tests__/UsefulWidthSection.test.tsx` (novo) — sem impressora: nada clicável; automática sem stepper; ligar grava 72/48; desligar grava `null`; stepper grava e para em 80; medir: pedido exato com `purpose: 'measure'`, pergunta com o nome da escala vindo de `TEST_PRINT_SCALE_TITLE`, marcas de 80 e de 58, resposta gravada e confirmada; falha de gravação mantém a pergunta; falha de envio não pergunta e nomeia a página; teste comum com `'check'`; gravar não desabilita stepper/switch; enviar desabilita só os botões; classe de layout por elemento contra `styles.<chave>`.
- `hooks/__tests__/usePrinterPreferences.test.ts` (novo) — leitura ao montar, falha de leitura, gravação que chega antes da primeira leitura, gravação recusada mantém o estado.
- `__tests__/PrinterDrawer.test.tsx` — seção ausente sem impressora; gravar não pede "Descartar as alterações?" nem chama `updatePrinter`; cartão com a largura casada sem diferenciar maiúscula; a tela adota o mapa devolvido (`mockResolvedValueOnce`, como manda o aprendizado da task 96).
- `__tests__/printerView.test.ts` — `detailLine` com e sem largura, `defaultUsefulWidth`, `measureMarks`.
- Mutações: o hook mesclando em vez de adotar derruba 1 teste; sem a guarda da primeira leitura, 1.
- `npm run build`: o código de `printer-preferences.json` fica só em `out/main/main.js` (0 ocorrências no bundle do renderer).

**Review (`code-reviewer-typescript`):** aprovado, sem bloqueio; as 7 decisões aprovadas (a guarda da primeira leitura "não dispara hoje, com handlers síncronos no main, mas protege o contrato"). Aplicado: `busy` só nos botões de impressão (atenção A1: o stepper piscava a 40 % e perdia o foco a cada passo), CSS morto do stepper removido, asserção de `.rowText`, dica do fluxo "Corrigir", mensagem de falha que nomeia a página, comentário e título de teste. Mantido de propósito: o `.map()` de `Chip` com callback, no mesmo padrão dos chips de setor da gaveta.

**Não verificado:** `npm run dev` (precisa de API local e login), foco/opacidade no Electron real e a aparência nos dois temas.

## Branch

`feat/95-printing-useful-width-per-printer`, cortada de `origin/master` (`be947da`) em 2026-11-13. Um commit por task.

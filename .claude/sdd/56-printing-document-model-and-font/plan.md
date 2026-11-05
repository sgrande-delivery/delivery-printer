# Plan — Modelo de documento e fonte na tela de impressão

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#56](https://github.com/sgrande-delivery/delivery-printer/issues/56)
**Branch de trabalho:** `feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05. Uma branch por spec, com todas as tasks em sequência, um commit por task e um PR no fim. A base é onde a #51 (redesenho) e a #55 (fontes de impressão) foram mergeadas, e `master` não tem nem a tela redesenhada nem as faces

## Abordagem técnica

Tudo acontece no **renderer**, numa tela que já existe. Nenhum canal IPC novo, nenhum socket, nenhuma rota nova na `delivery-api`, nenhum arquivo em `userData`.

**O que já está pronto e não se mexe:**

- O baseline é uma bag (`PrinterSettingsData`, `src/renderer/services/printerSettings.ts:11`), lido no `/users/me` **no instante de salvar** (`PrinterSettingsForm.tsx:97-110`), e o corpo do `PUT` é `{...loaded, ...changes}` (`printerSettings.ts:48-58`). As duas chaves novas **já atravessam** este caminho hoje, sem a tela saber delas: é só a origem das `changes` que precisa crescer.
- A escada de erro do salvamento (403, 422, `UntrustedBaselineError`, rede) e a barra "Alterações não salvas" cobrem qualquer chave que entre em `diffChanges` (`PrinterSettingsForm.tsx:112-137,198-215`).
- `usePrinterSettings` + `adopt` + `revalidate` (`src/renderer/hooks/usePrinterSettings.ts`) seguem iguais.

**O que cresce:**

- `printerSettingsModel.ts` ganha, ao lado de `StepKey`/`CLOSED_SETS` (`:4,13`), um eixo de **chave de enum**: a opção em vigor resolvida (ausente e inválido → `original`), o draft e o `diffChanges` comparando pelo valor **resolvido** (RN-02). O `Draft` passa a ser a união dos três tipos de chave (número, booleano, enum).
- Um arquivo novo de opções, `src/renderer/components/printer-settings/printDocuments.ts`, com as duas tabelas (chave → nome, descrição e, para a fonte, família CSS e peso). É a cópia do enum que a RN-05 aceita, e fica **junto da tela**, não em `src/constants/` (que é configuração de build, `CLAUDE.md`) nem em `src/shared/` (o main não a usa, e não deve: RN-05).
- `src/renderer/app.css` ganha **três** `@font-face` (uma por família, RN-07), apontando para os woff2 que já estão no repo em `assets/fonts/`.
- Um componente local de **grupo de cartões de rádio** (`OptionCardGroup`), usado duas vezes nesta tela. Fica em `components/printer-settings/`, não em `base/`: o padrão aparece duas vezes, mas as duas na mesma tela — primitivo novo só quando aparecer em duas telas (`.claude/rules/renderer-ui.md`). A navegação por teclado é a do painel (`delivery-admin/src/pages/printer-settings/documents/hooks/useRadioGroupNavigation.ts:15-33`): setas trocam a seleção **e** movem o foco, e só o selecionado é tabulável.
- O cartão `Layout do comprovante` (`PrinterSettingsForm.tsx:157-171`) recebe os dois grupos **acima** de "Tamanho da fonte", em blocos de largura cheia — os grupos não cabem no `SettingsRow` (rótulo à esquerda, controle à direita), que segue valendo para as três linhas de baixo.

**Os tokens e o visual:** cartão selecionado usa `--accent` na borda e `--accent-soft` no fundo; não selecionado, `--line` sobre `--surface`; descrição em `--muted`. Zero hex solto, e nada que exija cor nova — se exigir, a cor entra como token nos **dois** temas e o contraste é medido contra os três fundos.

## Decisões arquiteturais

- **A cópia do enum é assumida, não evitada.** Dá para não copiar nada — a tela poderia pedir as opções à API —, mas não existe rota que as liste, e inventar uma faria esta tela depender de rede para desenhar um seletor de 4 itens, num app cuja tela de impressão é exatamente onde se vai quando a rede está ruim. O custo (sincronia com a `delivery-api` e com o `delivery-admin`) está escrito na RN-05, com a consequência: valor novo lá e não aqui desaparece do seletor em silêncio.
- **Duas listas de face, de propósito.** O main declara seis faces para o documento de impressão, com a grafia que é contrato com `PrintFontEnum::css` (`src/main/printFonts.ts:10-13`); o renderer declara três, para o rótulo. Juntar as duas numa fonte única exigiria mover a lista para `src/shared/` e fazer o renderer conhecer o contrato da impressão — que é precisamente o acoplamento que a RN-01 da spec 52 existe para não ter. O que amarra as duas pontas é o teste da RN-06, que lê o `app.css`.
- **A comparação é pelo valor resolvido** (RN-02), e não pelo bruto, para que abrir a tela e clicar em "Original" numa loja sem a linha não crie linha nenhuma. O preço é não ter como "consertar" uma linha com string inválida pela tela — e ela não precisa de conserto, porque todos os leitores já a resolvem para `original`.
- **O `font_size` não muda de cartão**, ao contrário do painel (spec 1026, RF-05). O desenho congelado posicionou aquele controle, e mover por simetria entre apps custa divergência e reflui os testes da tela sem ganho para quem opera.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | O modelo das duas chaves de enum | [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57) | [57-enum-settings-model.md](./tasks/57-enum-settings-model.md) | — | executada |
| 02 | As faces das três famílias no bundle do renderer | [#58](https://github.com/sgrande-delivery/delivery-printer/issues/58) | [58-ui-font-faces-in-renderer.md](./tasks/58-ui-font-faces-in-renderer.md) | — | pendente |
| 03 | O grupo de cartões de rádio | [#59](https://github.com/sgrande-delivery/delivery-printer/issues/59) | [59-option-card-group.md](./tasks/59-option-card-group.md) | 01 | pendente |
| 04 | Modelo e Fonte no cartão "Layout do comprovante" | [#60](https://github.com/sgrande-delivery/delivery-printer/issues/60) | [60-model-and-font-in-receipt-card.md](./tasks/60-model-and-font-in-receipt-card.md) | 01, 02, 03 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03 → 04.

A **01** é o modelo e não tem dependência: é ela que define o tipo, as opções e a resolução de ausente, e é contra ela que as outras três são escritas. A **02** é independente do modelo (é CSS e build) e vem antes da **03** para que o cartão de fonte já nasça mostrando a face certa em vez de ser conferido duas vezes. A **03** entrega o grupo de cartões com teclado e teste próprios, sem tocar na tela. A **04** liga tudo: os dois grupos no cartão, o salvamento, os testes de tela e a linha na tabela de fidelidade da spec 38.

## Dependências de outros repos

**Nenhuma a esperar.** As duas pontas já subiram: a `delivery-api` renderiza os três modelos e nomeia a família nos seis documentos ([#1410](https://github.com/sgrande-delivery/delivery-api/issues/1410), shipped) e o `delivery-admin` já grava as duas chaves (spec [1026](https://github.com/sgrande-delivery/delivery-admin/issues/1026), entregue). Nada é preciso na API para esta frente funcionar: as chaves entram no `GET`/`PUT /printerSettings` que já existe, pela natureza chave/valor da tabela.

Duas consequências para o relatório do ship, não para a execução:

- **A fonte escolhida só aparece na bobina de um PDV que já tenha as faces embarcadas** (spec #52, mergeada na `feature/api-v2-and-redesign` e **ainda não publicada em release**). Antes disso, escolher fonte grava e não muda o papel, em silêncio (RN-10).
- **O modelo escolhido muda o papel na hora**, porque quem renderiza é a API — não depende de release deste app.

## Verificação da entrega

Além de `npm run typecheck`, `npm run lint` e `npm test`:

- **Em `npm run dev`**, com uma loja de teste: abrir a tela com as duas chaves ausentes (o estado de toda loja hoje), conferir "Original" nos dois grupos, escolher modelo e fonte, salvar, e **ler o corpo do `PUT`** (DevTools → Network) para confirmar que ele leva as outras linhas — `max_width` e `delivery_printer_version` inclusive.
- **Os quatro nomes na face certa**, nos dois temas, e com a máquina **sem rede** (desligar o Wi-Fi e recarregar): é o que separa "está bundlado" de "está vindo do Google".
- **Teclado**: Tab entra no selecionado, setas trocam e movem o foco, Enter e Espaço selecionam, nos dois grupos.
- **`npm run build`** e `ls -l out/renderer/assets/*.woff2`: as três faces emitidas, e o delta do bundle dito no relatório. Não precisa empacotar instalador — esta frente não encosta em `extraResources`, `publish` nem autoupdate —, mas o delta vai dentro do `.exe` e por isso é medido.

## Aprendizados que valem para as próximas tasks

**Da task 01:**

- **O resolvedor da fonte chama-se `resolveFontKey`** (não `resolveFontFamily`, como as tasks escreveram): ele devolve a **chave** (`'plex'`), enquanto `FontOption.fontFamily` é a **família CSS** (`'IBM Plex Sans Condensed'`). Quem importar, importe pelo nome novo.
- **`currentEnum` tem overload por chave e só aceita literal.** `currentEnum(settings, draft, 'font_family')` devolve `PrintFontKey` sem cast; `currentEnum(settings, draft, key)` com `key: EnumKey` **não compila** (TS2769, medido). As tasks #59 e #60 chamam com literais, então não há problema — mas não tente generalizar o grupo de cartões por uma variável de chave.
- **A promessa dos overloads não é verificada pelo `tsc`.** Trocando o corpo do `resolveEnum` para devolver sempre o resolvedor de fonte, o compilador não reclama; quem pega é o teste. Isso vale para qualquer overload que venha a ser escrito aqui: a rede é o teste, nunca o tipo.
- **`FONT_OPTIONS[].fontFamily` é a família *exata*, sem pilha de fallback** — diferente do painel, que guarda `"'Print IBM Plex Sans Condensed', sans-serif"`. É proposital: o teste de contrato da task #58 casa essa string contra o `@font-face` do `app.css`, e uma pilha ali o quebraria. **Consequência para as tasks #59 e #60:** o fallback é composto no ponto de uso, no `nameStyle` — a família da opção entre apóstrofos, vírgula, `var(--font-family)` —, senão face que falhe cai na serifada default do Chromium em vez da fonte da interface.
- **Chave de enum nova entra num lugar só:** `ENUM_KEYS` é a fonte do tipo `EnumKey`. Acrescentar ao tipo e esquecer a lista mostraria o controle e nunca gravaria — o "Salvar" limparia a barra sem escrever nada.
- **`toEqual` não serve para provar ausência de chave num payload:** ele ignora propriedade cujo valor é `undefined`. Sob a RN-03 (o `PUT` apaga e recria toda linha), chave que entra como `undefined` no corpo **apaga a linha** da loja. Use `toStrictEqual` sempre que o teste for sobre a forma do payload.

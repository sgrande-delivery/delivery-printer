# Plan — Modelo de documento e fonte na tela de impressão

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#56](https://github.com/sgrande-delivery/delivery-printer/issues/56)
**Branch de trabalho:** `feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05. **O PR é `/ship-pr` contra `feature/api-v2-and-redesign`**, confirmado com o dev em 2026-11-07: é lá que a #51 (redesenho) e a #55 (fontes) foram mergeadas, e nada é publicado no merge. Uma branch por spec, com todas as tasks em sequência, um commit por task e um PR no fim. A base é onde a #51 (redesenho) e a #55 (fontes de impressão) foram mergeadas, e `master` não tem nem a tela redesenhada nem as faces

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
| 01 | O modelo das duas chaves de enum | [#57](https://github.com/sgrande-delivery/delivery-printer/issues/57) | [57-enum-settings-model.md](./tasks/57-enum-settings-model.md) | — | shipped |
| 02 | As faces das três famílias no bundle do renderer | [#58](https://github.com/sgrande-delivery/delivery-printer/issues/58) | [58-ui-font-faces-in-renderer.md](./tasks/58-ui-font-faces-in-renderer.md) | — | shipped |
| 03 | O grupo de cartões de rádio | [#59](https://github.com/sgrande-delivery/delivery-printer/issues/59) | [59-option-card-group.md](./tasks/59-option-card-group.md) | 01 | shipped |
| 04 | Modelo e Fonte no cartão "Layout do comprovante" | [#60](https://github.com/sgrande-delivery/delivery-printer/issues/60) | [60-model-and-font-in-receipt-card.md](./tasks/60-model-and-font-in-receipt-card.md) | 01, 02, 03 | shipped |

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

**Da task 02:**

- **O `@font-face` do renderer pode apontar para fora do root do Vite.** `url('../../assets/fonts/…')` do `app.css` (root em `src/renderer`) é emitido pelo build com hash em `out/renderer/assets/` e referenciado por caminho relativo, que é o que funciona sob `file://`. O `fs.allow` default não recusou o arquivo num servidor Vite de mesmo root — mas **o `npm run dev` com Electron real segue sem medição**; se aparecer 403 ali, a saída é copiar as três faces para `src/renderer/fonts/` (decisão 2 da spec).
- **As faces do rótulo entram só pelo bundle do renderer.** Conferido no asar: `resources/assets/fonts/` (impressão, por `extraResources`) segue com os seis woff2 intocados, e as três do rótulo vão dentro do `app.asar` por `files: ["out/**"]`. Os mesmos bytes vão duas vezes no instalador, de propósito, e isso está escrito no `assets/fonts/README.md`.
- **Nome de arquivo de fonte carrega o peso, e isso é rede de teste.** Face declarada `500` apontando o arquivo `700` não aparece na tela: as duas faces ficam idênticas em família+peso+estilo e o negrito passa a servir o corpo. O `printFontFaces.test.ts` agora cobra o sufixo `-<peso>.woff2`.
- **Número de RN sozinho é ambíguo neste repo:** há uma RN-07 na spec 52 (seis faces para a impressão) e outra na 56 (uma face por família no renderer), e as duas falam de peso de fonte. Comentário que cite RN diz de qual spec.

**Da task 03:**

- **`--accent-soft` é um quarto fundo, e o `--muted` falha nele.** 4,33:1 no tema claro e 4,34:1 no escuro para texto de 12 px, abaixo de AA. Texto pequeno sobre cartão selecionado usa `--text-2` (6,30 / 7,54). A regra manda medir contra `--bg`, `--surface` e `--surface-2` — esta frente mostrou que a lista tem um quarto item.
- **Nome acessível de cartão com nome + descrição sai colado** (`"OriginalIgual ao que imprime hoje"`). O conserto é `aria-label` com o nome e `aria-describedby` para a descrição. O `Icon` já é `aria-hidden`, então glifo não entra no nome — mas entra no `textContent`, e é por texto que se testa qual glifo está desenhado.
- **`NoInfer<T>` em callback de componente genérico.** Sem ele o `T` colapsa para `string` e setter de `useState` do tipo estreito não compila. E o `npm run typecheck` **é** a rede disso: o Vitest não typecheca, então vale deixar no teste uma chamada que só compila com o `NoInfer`.
- **A rede de CSS Module deste repo é mais forte do que a regra diz.** Medido nas 7 chaves do módulo novo: o jest-dom 6 lança `"At least one expected class must be provided"` para `toHaveClass(undefined)` em vez de passar calado, então **rename no `.module.css` é pego**. A regra (`.claude/rules/renderer-ui.md`) afirma o contrário — vale corrigi-la numa passada própria.
- **Já são três cópias do par "botão `role=radio` + borda `--accent` + fundo `--accent-soft` + glifo"** no app (`PrinterOption`, a lista de devices do `PrinterDrawer`, e agora este). Pela regra das duas telas, um primitivo em `base/` se justifica — **task própria**, não de passagem.
- **Para a task #60, uma armadilha de tipo medida:** `FONT_OPTIONS` é assinável a `readonly OptionCard<PrintFontKey>[]` **como está**, porque `nameStyle` é opcional e `fontFamily`/`fontWeight` são extras ignorados fora de literal. Passar a tabela direto compila e **as faces nunca aplicam, em silêncio** (é a RN-06 falhando sem erro). A #60 tem de mapear para `nameStyle` explicitamente e assertar o `font-family` inline nos quatro nomes.
- **`minmax(160px, 1fr)` é o primeiro `auto-fit` do renderer e é um chute:** na coluna esquerda do formulário os quatro cartões de fonte devem cair em duas colunas, e "IBM Plex Sans Condensed" (23 caracteres) quebra linha em 160 px. É item de conferência da #60 em `npm run dev`.

**Da task 04:**

- **Tabela de opções é assinável ao tipo do cartão sem o `nameStyle`,** e é assim que a feature mente: `options={FONT_OPTIONS}` compila, a tela desenha os quatro cartões e **nenhuma face aplica**. Quem acrescentar opção visual a esta tela mapeia explicitamente e assere o `style` inline no teste.
- **Nome de face sem peso inline sintetiza negrito.** Como há uma face por família (RN-07), o `--font-weight-semibold` do cartão pediria um peso que não existe no pacote e o Chromium o sintetizaria — o nome sairia num traço que a bobina não imprime. Por isso o peso vai inline junto da família, e "Original" (na fonte da interface) sai mais pesado que os três.
- **Dívida encontrada e deliberadamente não consertada:** o parágrafo introdutório da tabela "Fidelidade ao desenho" da spec 38 diz "São **doze** linhas" e a tabela tem **16**. A defasagem é anterior a esta spec. Passada própria, não limpeza de carona.

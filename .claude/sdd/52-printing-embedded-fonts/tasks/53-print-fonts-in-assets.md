# 53 — As seis faces de impressão em `assets/fonts/`

**Issue:** [#53](https://github.com/sgrande-delivery/delivery-printer/issues/53)
**Feature:** [Fontes de impressão embarcadas no app](../spec.md) — issue #52
**Tipo:** feature
**Processo:** main (empacotamento)
**Depende de:** (nenhuma)
**Status:** shipped

## Branch

`feat/52-printing-embedded-fonts`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-04. Todas as tasks da spec rodam nela, um commit por task.

## Objetivo

Pôr no repo os seis woff2 que os documentos da `delivery-api` alcançam, com licença e procedência registradas, de forma que o instalador os leve e o app os encontre em runtime. Esta task **não muda comportamento** — quem passa a usar as faces é a [#54](https://github.com/sgrande-delivery/delivery-printer/issues/54).

## Contexto

- Cobre a **RF-01** e a **RN-07**; a **RN-04** é a razão de os arquivos morarem no repo e não vir nada do Google em runtime
- **Nenhuma mudança de build é necessária.** `extraResources: ["./assets/**"]` (`package.json`) já empacota `assets/` em `resources/assets/`, e `getAssetPath(app, …)` (`src/main/asset.ts:5`) já resolve `process.resourcesPath` no empacotado e `path.join(__dirname, '../../assets')` em dev. É por aí que o ícone da tray já chega (`src/main/tray.ts:13`). **Não** mexer em `files`, `asar` nem `asarUnpack`
- **A origem são os arquivos do `delivery-admin`**, em `public/fonts/print/` (task [delivery-admin#1027](https://github.com/sgrande-delivery/delivery-admin/issues/1027), shipped): subconjunto **só do bloco `latin`** do Google Fonts (220 a 229 codepoints por face, medido no `cmap`; `latin-ext` ficou fora na origem por falta de `fonttools`), **sem** descritor `unicode-range`, e já vetados numa folha de teste em térmica a 203 dpi — foi ela que fixou os pesos. Copiar, não baixar de novo (decisão pendente 1 da spec): o Google atualiza glifo sem avisar, e trocar um arquivo conferido por um não conferido é perder a única verificação em papel que existe
- **São seis, não os dez do admin** (RN-07). O admin precisa de mais porque o navegador dele também renderiza a pré-visualização e imprime direto; aqui, o peso do corpo vem do `PrintFontEnum::weight()` e o único outro que as views pedem é `700`

## Mudanças

### 1. Os binários

`assets/fonts/` (novo), copiados de `delivery-admin/public/fonts/print/`:

| Arquivo | Família | Peso | Bytes | `sha256` (origem, 2026-11-04) |
|---|---|---|---|---|
| `ibm-plex-sans-condensed-500.woff2` | IBM Plex Sans Condensed | 500 | 19 952 | `e3b4fd97fd20bc70fda66d8d5f0745d8d6958068a024cb4724bbc1ffb6cbc183` |
| `ibm-plex-sans-condensed-700.woff2` | IBM Plex Sans Condensed | 700 | 19 352 | `4768878c107d92c528a65bba206a87cdcf2c694514e75907fb91772cf8a388a5` |
| `atkinson-hyperlegible-400.woff2` | Atkinson Hyperlegible | 400 | 17 208 | `d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc` |
| `atkinson-hyperlegible-700.woff2` | Atkinson Hyperlegible | 700 | 17 524 | `140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0` |
| `barlow-semi-condensed-500.woff2` | Barlow Semi Condensed | 500 | 22 428 | `0d7513795eaf8fdab7f340144841bd2d9fac7d9303c03aa6b525a2c908e9b371` |
| `barlow-semi-condensed-700.woff2` | Barlow Semi Condensed | 700 | 23 244 | `fb958c8c20a05552ac8a85d925d96028d52565792650e941a5fe96b6997aa5cb` |

**119 708 bytes (~117 kB) no total**, no instalador e **zero no bundle do renderer** — eles não passam pelo Vite.

Mais `assets/fonts/OFL.txt`, copiada do mesmo diretório. Conferido que ela **cobre as três famílias**: um índice nas linhas 3 a 5 e três blocos de licença — IBM Plex (que vale para a Sans Condensed), Barlow e Atkinson Hyperlegible, todas OFL 1.1. A única edição é a linha 3, que hoje diz *"IBM Plex Sans Condensed e IBM Plex Mono"*: a Mono não vem para cá (RN-07), então ela nomeia só a Sans Condensed. Os três blocos ficam inteiros.

Confirmar os `sha256` depois de copiar. Se algum divergir, **parar e dizer** — significa que o arquivo do admin mudou depois de 2026-11-04, e aí a folha de teste em térmica não vale mais para ele.

### 2. O README

`assets/fonts/README.md` (novo), no formato de `src/renderer/fonts/README.md`, que é a referência de como este repo documenta fonte embarcada. Precisa carregar:

- **De onde vieram** — `delivery-admin/public/fonts/print/`, com link para a task 1027, e a receita do `curl` de lá para quem precisar regerar (incluindo a armadilha registrada ali: a User-Agent tem de ser a **completa**, com `AppleWebKit/…` e `Safari/…`, senão o Google responde TTF e sem `unicode-range`)
- **Por que são seis** — a conta da RN-07, com os caminhos: `PrintFontEnum::weight()` dá o peso do corpo, `public/css/socket/order/styles.css:66` e as classes de `resources/views/print/layout.blade.php:25-70` dão o `700`, e nada pede 400 em Plex/Barlow nem mono em documento nenhum
- **Por que não vêm do Google em runtime** — a RN-04, igual à da fonte de ícones
- **A cobertura medida** — as seis faces cobrem `AÇÃO ação ÁÀÃÂÉÊÍÓÕÔÚÜÇ 0123456789 R$ ºª °` e a pontuação de comprovante, sem glifo faltando (medido em 2026-11-04 lendo o `cmap` dos seis woff2; **não** com `document.fonts.check`, que sem `unicode-range` responde `true` para qualquer caractere). É a verificação que importa num comprovante brasileiro
- **Os `sha256`** — para distinguir "regerado de propósito" de "trocado sem querer", como o README da fonte de ícones já faz
- **Que o consumidor é o `printFonts.ts`**, do main, e **não** o CSS do renderer — com a RN-03 em uma linha, porque é aqui que alguém vai procurar quando a fonte não sair

## Testes

**Nenhum nesta task, de propósito.** O catálogo que lista os arquivos nasce na [#54](https://github.com/sgrande-delivery/delivery-printer/issues/54), e é lá que mora o teste que confere que cada arquivo do catálogo existe no disco — a guarda contra arquivo deletado ou renomeado. Testar aqui só a presença de seis arquivos num diretório seria um teste que não conhece quem os consome.

O `sha256` fica no README e **não** em teste, seguindo o precedente da fonte de ícones: regerar de propósito dá bytes diferentes, e um teste de hash transformaria atualização legítima em falha de CI.

## Critérios de aceitação

- [ ] `assets/fonts/` tem os seis woff2 com os nomes e os bytes da tabela, e os `sha256` conferem
- [ ] `assets/fonts/OFL.txt` existe e cobre as três famílias embarcadas
- [ ] `assets/fonts/README.md` responde às seis perguntas da seção 2
- [ ] `npm run package` produz `resources/assets/fonts/` com os **oito** arquivos — os seis woff2, a `OFL.txt` e o `README.md`, porque `extraResources` não filtra
- [ ] `package.json` **não** foi alterado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

Executada em 2026-11-04. Nenhuma mudança de comportamento: neste commit, `assets/fonts/` não é lido por ninguém — o consumidor nasce na [#54](https://github.com/sgrande-delivery/delivery-printer/issues/54).

- **Os seis woff2** copiados de `delivery-admin/public/fonts/print/`. Conferido por `cmp`: **idênticos byte a byte** à origem, não só com `sha256` igual ao da tabela. São os bytes vetados na folha de teste em térmica a 203 dpi.
- **`OFL.txt`** com uma única linha diferente da origem (a 3, que deixou de citar a IBM Plex Mono); os três blocos de licença íntegros. Ela viaja no instalador porque a OFL exige que a licença acompanhe a redistribuição.
- **`README.md`** cobrindo os seis pontos pedidos.
- **`package.json` intocado** (`git diff HEAD` vazio), como o critério de aceitação exige.

**O que o review mediu, e é a evidência que sustenta a task:** `npm run build && npx electron-builder --linux dir` põe os **oito** arquivos em `resources/assets/fonts/` com os `sha256` certos; o `app.asar` saiu com 5 409 498 bytes, **o mesmo byte a byte** do build de 29/10, e `npx asar list` não acha woff2 de impressão nenhum dentro dele — ou seja, `extraResources` entrega os arquivos fora do pacote da aplicação e `asarUnpack` é desnecessário. O `buildResources: "assets"` não se incomodou com o subdiretório novo (build sem warning de ícone), porque o electron-builder compara por nome exato num `readdir` plano. O bundle do renderer continua emitindo **um** woff2, o da fonte de ícones.

**Uma afirmação da própria task estava errada e foi corrigida aqui.** A task dizia que o recorte era `latin` + `latin-ext`; medido no `cmap` dos seis arquivos, é **só `latin`** — 220 codepoints na Atkinson, 227 na Barlow, 229 na Plex, máximo `U+2215`, e `Ł Ą ă ğ ſ ő ş` ausentes nas seis. pt-BR está inteiro coberto, então a frente não para, mas a dívida ficou registrada. A causa raiz vale mais que a correção e está em "Aprendizados" do `plan.md`: a cobertura tinha sido "medida" com `document.fonts.check`, que sem descritor `unicode-range` responde `true` para qualquer caractere.

### Testes

**Nenhum**, como a task previu. O catálogo que lista os arquivos nasce na #54, e é lá que mora o teste de existência em disco — a guarda real contra arquivo deletado ou renomeado. O `sha256` fica no README e não em teste, pelo precedente de `src/renderer/fonts/README.md`: regerar de propósito dá bytes diferentes, e um teste de hash transformaria atualização legítima em falha de CI.

Verificado depois das correções: `npm run typecheck` 0, `npm run lint` 0 erros e 1 aviso pré-existente (`Login.tsx`), `npm test` com 65 arquivos e 637 testes passando — igual ao baseline da branch.

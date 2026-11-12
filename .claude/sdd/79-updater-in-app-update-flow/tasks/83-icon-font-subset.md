# 83 — Três ícones novos no recorte da fonte Material Symbols

**Issue:** [#83](https://github.com/sgrande-delivery/delivery-printer/issues/83)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** chore
**Processo:** renderer
**Depende de:** —
**Status:** executada

## Objetivo

Pôr `restart_alt`, `downloading` e `new_releases` na união `IconName` **e** no recorte da fonte, para que as telas da spec possam usá-los. É mecânica, independente das outras tasks, e tem de vir **antes** de qualquer UI desta spec.

## Contexto

- Cobre a **RN-13** da spec.
- `src/renderer/base/Icon.tsx:6-40` tem a união `IconName` com **34** nomes, e o comentário de `:5` diz a regra: *"Same list as the icon_names of the font subset (fonts/README.md): change one, regenerate the other."*
- `src/renderer/fonts/material-symbols-outlined-subset.woff2` é a Material Symbols Outlined recortada a esses 34 símbolos: **20 860 bytes**, contra 2,37 MB da fonte completa. Ela é local porque nada visual deste app vem da internet — o PDV pode estar sem rede exatamente quando precisa imprimir (RN-01 da spec 38).
- **A armadilha, literal no `fonts/README.md`:** ícone novo na união **não aparece** se o recorte não for regerado — ele não está na fonte, e a tela mostra **o nome em texto**. Não quebra teste nenhum: o `Icon` renderiza o nome como conteúdo e a ligadura é que o transforma em glifo, então sob jsdom tudo passa igual. É defeito de olho, e é fácil entregar sem perceber.
- Os três que o desenho usa e **não** existem no recorte: `restart_alt` (faixa, diálogo e cartão "Atualização pronta"), `downloading` (cartão "Baixando atualização") e `new_releases` (cartão "Nova versão disponível"). Os outros que o desenho usa — `check_circle`, `error`, `hourglass_top`, `stacks` — já estão lá.
- O hash `sha256` do `.woff2` está registrado no `fonts/README.md` com a razão: distinguir "regerado de propósito" de "trocado sem querer". A receita **não fixa versão upstream**, então os bytes vão mudar além dos três glifos novos — isso é esperado, e é por isso que o hash novo entra no README no mesmo commit.

## Mudanças

### 1. `src/renderer/base/Icon.tsx`

Três nomes na união, em ordem alfabética como o resto: `downloading` (depois de `cloud_off`), `new_releases` (depois de `logout`) e `restart_alt` (depois de `remove`). A união sai de 34 para **37** nomes.

### 2. `src/renderer/fonts/material-symbols-outlined-subset.woff2`

Regerado com a receita do `fonts/README.md`, com a lista de 37 em ordem alfabética:

```bash
ICONS="add,arrow_back,cancel,check,check_circle,chevron_right,close,cloud_done,cloud_off,downloading,error,history,hourglass_top,info,logout,new_releases,person,print,progress_activity,radio_button_checked,radio_button_unchecked,receipt,receipt_long,remove,restart_alt,schedule,search,skillet,space_dashboard,stacks,table_restaurant,task_alt,tune,two_wheeler,visibility,visibility_off,warning"
curl -s "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=$ICONS" -o ms.css
curl -s "$(sed -n 's/.*src: url(\([^)]*\)) format.*/\1/p' ms.css)" -o src/renderer/fonts/material-symbols-outlined-subset.woff2
```

O `ms.css` é descartável — **não** commitá-lo.

### 3. `src/renderer/fonts/README.md`

- A lista `icon_names` do bloco de comando, atualizada (é ela que a próxima pessoa vai copiar).
- "34 símbolos" → 37, nos dois lugares em que o número aparece.
- A seção "O que foi medido nesta fonte" ganha a data nova e os números novos: tamanho do arquivo, `sha256`, contagem de glifos e de codepoints do `cmap`. Os valores antigos **saem** — medição velha ao lado da nova é a próxima pessoa conferindo o hash errado.

## Testes

Não há teste automatizado possível para "o glifo existe na fonte": a suíte roda em jsdom, que não carrega `woff2`, e o `Icon` renderiza o nome como texto nos dois casos. Isso é limitação da plataforma de teste, não falta de cuidado — e é exatamente por isso que o `README.md` da fonte existe.

O que verifica:

1. **A união e a lista do README são a mesma lista.** Comparação textual, feita à mão no review e registrada no relatório: ordenar os dois conjuntos e conferir que são iguais, com 37 elementos.
2. **O arquivo é um woff2 válido e cresceu de forma plausível.** `file` diz `Web Open Font Format (Version 2)`; o tamanho fica na ordem de 21–23 kB (três glifos sobre 78). Salto para centenas de kB significa que a URL do CSS veio sem o `icon_names` e baixou a fonte inteira — é o erro provável desta receita.
3. **Os três glifos aparecem, no olho, no `npm run dev`.** Uma tela descartável com os três `Icon` lado a lado basta; nome em texto é a falha. Pode ser feito já com a tela da task #84, que é a próxima.
4. `src/renderer/base/__tests__/Icon.test.tsx` continua passando (ele exercita o primitivo, não a fonte).

## Critérios de aceitação

- [x] `IconName` tem 37 nomes, em ordem alfabética, incluindo `downloading`, `new_releases` e `restart_alt`
- [x] A lista `icon_names` do `fonts/README.md` é **idêntica** à união
- [x] O `.woff2` foi regerado, é woff2 válido, e o tamanho continua na ordem de 20 kB
- [x] O `sha256` e as medições do `README.md` são os do arquivo novo, e os antigos não ficaram ao lado
- [x] Os três ícones têm **ligadura medida** na fonte (`GSUB` decodificado: 37/37, com controle negativo na fonte anterior reprovando exatamente os três). O olho no Electron não foi usado, e o `rlig` é *required ligature*, aplicada por padrão pelo Chromium
- [x] O `ms.css` não foi commitado
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Implementação

Executada em 2026-11-12, um commit. `src/renderer/base/Icon.tsx` (união 34 → **37**), `src/renderer/fonts/material-symbols-outlined-subset.woff2` (20 860 → **23 036** bytes) e `src/renderer/fonts/README.md`.

### A receita do README estava quebrada, e isso é metade do valor desta task

Medido antes de delegar: a receita baixa com `curl` **sem User-Agent de navegador**, e nesse caso o Google devolve **três** blocos `@font-face`, todos `format('truetype')`. Seguir o README ao pé da letra salvaria um **TTF com o nome `.woff2`**. Com UA de Chrome vem **um** bloco, `format('woff2')`.

A receita foi consertada: os dois `curl` levam `-A "$UA"`, com o sintoma, a consequência e a conferência (`file` tem de dizer Web Open Font Format Version 2; tamanho na faixa de 20–25 kB) escritos ao lado. **Conferido pelo review:** rodar a receita como ela está escrita hoje produz o arquivo commitado com `sha256` **idêntico byte a byte**.

### O critério visual virou medição

A task dizia que não há teste automatizado possível para "o glifo existe na fonte", e que a prova é o olho no app rodando. O review decodificou o `GSUB` em Node puro (`node:zlib` brotli, sem dependência nova) e mediu: **37 de 37 nomes têm ligadura**, todas no lookup tipo 7 → tipo 4, alcançável pela feature `rlig`. `restart_alt` → gid 20 (U+F053), `downloading` → gid 19 (U+F001), `new_releases` → gid 47 (U+EF76).

**Com controle negativo, que é o que dá valor ao "OK":** o mesmo script contra a fonte **anterior**, com a lista nova, dá **34 OK e 3 falhas — exatamente os três nomes novos**. O script sabe falhar, e falha no lugar certo. Ele também reproduziu todos os números antigos do README (78 glifos, `sha256 7a13d4b3…`, `totalSfntSize` 43 052, 80 codepoints, 56 PUA, `GSUB` 1 776).

### O `+4` glifos, explicado

A fonte nova tem **82** glifos para **3** ícones acrescentados, e 60 PUA contra 56. A hipótese de deriva do Google foi **descartada remedindo**: pedir hoje a lista antiga de 34, com o mesmo UA, dá 78 glifos e 56 PUA — iguais aos commitados. O `+4` vem todo da lista nova, e os três acréscimos são sempre acompanhados de um quarto item que é **apelido do `new_releases`**: a ligadura legada `verified` apontando para o mesmo gid, um segundo codepoint (U+E031) do mesmo glifo, e uma forma alternativa (gid 48) fora do `cmap`. Não há glifo órfão: 60 codepoints PUA mapeiam 37 gids distintos, um por ícone.

### Dois acertos do review no README

- O bullet dizia que as ligaduras estão nas features `rlig` **e `rclt`**. Medido no byte: a `rclt` está declarada mas sua featureTable tem `lookupIndexCount` **0** — quem alcança o lookup é só a `rlig`.
- "as **24 letras** (`_abcdefghiklmnoprstuvwy`)": a string tem 23 caracteres; o 24º codepoint não-PUA é o **espaço**.

E a seção medida ganhou os dois fatos acima (37/37 ligaduras e a explicação do `+4`), porque `82`/`60`/`56` soltos ao lado de "+3 ícones" convidam a próxima pessoa à conclusão errada — foi a dúvida que o implementador não conseguiu fechar sozinho.

### Verificação

- `npm run typecheck` 0 · `npm run lint` 0 erros e 1 aviso (o da base) · `npm test` **79 arquivos / 907 testes** (esta task não acrescenta teste; ver abaixo).
- União × lista do README **por comando**: 37 e 37, `diff` das duas ordenadas vazio, sem duplicata, e idêntica a `sort`.
- `file`: `Web Open Font Format (Version 2), TrueType, length 23036`. `sha256` novo: `22c9e92ef978a45e2e0040501ad8017cc0ec07cab4e664dcecdf60b643028a76`; os valores antigos **saíram** do README.
- `npm run build`: a fonte entra em `out/renderer/assets/` com o **mesmo** `sha256`.
- **O critério 5 da task** ("aparecem como glifo no app rodando") não foi conferido no Electron, e na prática foi substituído por algo mais forte: o `rlig` é *required ligature*, que o Chromium aplica por padrão, e o `GSUB` diz que os três estão lá.
- **Em aberto, para decisão própria:** o review mostrou que "todo nome da união tem ligadura" é automatizável (~120–150 linhas de helper, zero dependência nova, 1–5 ms) e que seria a **única** rede da RN-13. Ele recomendou não fixar contagem exata de glifos, porque a receita não fixa versão upstream e deriva do Google quebraria o teste sem nada de errado ter acontecido.

## Fora de escopo

- **Trocar a fonte por outra, ou voltar a buscá-la do Google Fonts em runtime.** A RN-01 da spec 38 proíbe.
- **Acrescentar ícone "que talvez sirva depois".** Cada glifo custa bytes no instalador, e a união fechada é o que mantém as duas listas comparáveis.
- **Mexer no `Icon.module.css`** ou nas `font-variation-settings` — o `README.md` explica por que a linha de `font-feature-settings` do desenho é enganosa (esta fonte usa `rlig`, não `liga`).

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

# 83 — Três ícones novos no recorte da fonte Material Symbols

**Issue:** [#83](https://github.com/sgrande-delivery/delivery-printer/issues/83)
**Feature:** [Processo de atualização da aplicação visível e acionável no PDV](../spec.md) — issue #79
**Tipo:** chore
**Processo:** renderer
**Depende de:** —
**Status:** pendente

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

- [ ] `IconName` tem 37 nomes, em ordem alfabética, incluindo `downloading`, `new_releases` e `restart_alt`
- [ ] A lista `icon_names` do `fonts/README.md` é **idêntica** à união
- [ ] O `.woff2` foi regerado, é woff2 válido, e o tamanho continua na ordem de 20 kB
- [ ] O `sha256` e as medições do `README.md` são os do arquivo novo, e os antigos não ficaram ao lado
- [ ] Os três ícones aparecem como glifo, não como texto, no app rodando
- [ ] O `ms.css` não foi commitado
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **Trocar a fonte por outra, ou voltar a buscá-la do Google Fonts em runtime.** A RN-01 da spec 38 proíbe.
- **Acrescentar ícone "que talvez sirva depois".** Cada glifo custa bytes no instalador, e a união fechada é o que mantém as duas listas comparáveis.
- **Mexer no `Icon.module.css`** ou nas `font-variation-settings` — o `README.md` explica por que a linha de `font-feature-settings` do desenho é enganosa (esta fonte usa `rlig`, não `liga`).

## Branch

`feat/79-updater-in-app-update-flow`, cortada de `origin/master` em 2026-11-12. Todas as tasks da spec rodam nela, com um commit por task.

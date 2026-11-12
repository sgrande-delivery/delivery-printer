# A fonte de ícones, no pacote

`material-symbols-outlined-subset.woff2` é a **Material Symbols Outlined** recortada aos 37 símbolos que o desenho da spec 38 usa.

Ela mora aqui, e não no Google Fonts, por causa da **RN-01**: nada visual deste app vem da internet, porque o PDV pode estar sem rede exatamente quando precisa imprimir. O desenho declara um `<link>` para `fonts.googleapis.com` (`design/printer-v2.dc.html:11`) e essa linha **não atravessa** para o app.

## Por que recortada

| Versão                                  | Tamanho                       |
| --------------------------------------- | ----------------------------- |
| fonte variável completa (~3 mil ícones) | **2 367 840 bytes** (2,37 MB) |
| este recorte (37 ícones)                | **23 036 bytes** (22,5 kB)    |

99,0 % menor. Sem o recorte, a fonte sozinha seria **4,5×** o bundle inteiro do renderer (518 kB).

## Como foi gerada, e como gerar de novo

A receita **não fixa versão upstream**: o Google atualiza glifos, então regerar dá bytes diferentes do `sha256` acima. Isso é esperado; o hash serve para distinguir "regerado de propósito" de "trocado sem querer".

A API do Google Fonts recorta por nome de ícone. Trocar a lista no `icon_names`, pegar a URL do `src: url(...)` do CSS devolvido e baixar o woff2. **Os dois `curl` precisam de um User-Agent de navegador**: sem ele o Google devolve CSS com três blocos `@font-face` em `format('truetype')`, e o arquivo salvo sairia **TTF com nome `.woff2`**. Com o UA vem um bloco só, `format('woff2')`. Trabalhe fora do repo (o `ms.css` não é commitado) e confira com `file` (tem de dizer _Web Open Font Format (Version 2)_) e com o tamanho (na ordem de 20–25 kB; centenas de kB é a fonte inteira, sem o `icon_names`):

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
ICONS="add,arrow_back,cancel,check,check_circle,chevron_right,close,cloud_done,cloud_off,downloading,error,history,hourglass_top,info,logout,new_releases,person,print,progress_activity,radio_button_checked,radio_button_unchecked,receipt,receipt_long,remove,restart_alt,schedule,search,skillet,space_dashboard,stacks,table_restaurant,task_alt,tune,two_wheeler,visibility,visibility_off,warning"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=$ICONS" -o ms.css
curl -s -A "$UA" "$(sed -n 's/.*src: url(\([^)]*\)) format.*/\1/p' ms.css)" -o material-symbols-outlined-subset.woff2
file material-symbols-outlined-subset.woff2
```

**A armadilha:** ícone novo no `Icon.tsx` **não aparece** se o recorte não for gerado de novo — ele simplesmente não está na fonte, e a tela mostra o nome em texto ou nada. Por isso a união de nomes do `Icon.tsx` e a lista do `icon_names` são a **mesma** lista, e mudar uma sem a outra é o defeito.

## O que foi medido nesta fonte (2026-11-12)

- `wOF2` válido, 17 tabelas, 82 glifos, `totalSfntSize` de **46 280** bytes (o sfnt depois de descomprimir)
- `sha256` do arquivo: `22c9e92ef978a45e2e0040501ad8017cc0ec07cab4e664dcecdf60b643028a76` — se ele mudar sem alguém regerar o recorte de propósito, a fonte foi trocada
- `cmap` com 84 codepoints: o espaço, as **23 letras** necessárias para escrever os nomes (`_abcdefghiklmnoprstuvwy`) e **60 PUA** (entre eles `U+E8AD`, o `print`)
- `GSUB` presente (1 890 bytes), com as 56 ligaduras dentro de um **extension lookup** (tipo 7) alcançado pela feature **`rlig`**; a **`rclt`** também está declarada, mas **sem lookup nenhum** (`lookupIndexCount` 0), então quem liga os ícones é só a `rlig`
- **os 37 nomes da união `IconName` têm ligadura**, conferido decodificando o `GSUB` glifo por glifo — não inferido do tamanho do arquivo
- **Por que as contagens crescem mais que a lista:** 3 ícones novos deram **+4** glifos, **+4** PUA e **+4** ligaduras, porque o Google manda junto os apelidos de cada glifo. Os três são `downloading` (`U+F001`), `restart_alt` (`U+F053`) e `new_releases` (`U+EF76`), e o quarto de cada conta é do `new_releases`: um segundo codepoint (`U+E031`), um nome legado (`verified`) e uma forma alternativa (glifo fora do `cmap`, alcançado por substituição simples). Diferença maior que a da lista **não** é sinal de recorte errado — é alias.

**Consequência prática, e é o ponto que não se adivinha:** o desenho escreve `-webkit-font-feature-settings: 'liga'`, mas esta fonte **não usa `liga`** — usa `rlig`, que é _required ligature_ e o Chromium aplica **por padrão**. Ou seja: declarar só `'liga'` funcionaria por acidente, e mexer nessa linha achando que ela é o que liga os ícones quebraria a tela sem explicação. Não dependa dela; se quiser ser explícito, declare `font-feature-settings: 'liga' 1, 'rlig' 1`.

Pelo mesmo motivo, ferramenta que lê ligadura por `liga` (o `opentype.js`, por exemplo) reporta **zero ligaduras** nesta fonte. Isso é limitação da ferramenta, não defeito da fonte.

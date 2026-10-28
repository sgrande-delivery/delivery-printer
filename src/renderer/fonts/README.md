# A fonte de ícones, no pacote

`material-symbols-outlined-subset.woff2` é a **Material Symbols Outlined** recortada aos 34 símbolos que o desenho da spec 38 usa.

Ela mora aqui, e não no Google Fonts, por causa da **RN-01**: nada visual deste app vem da internet, porque o PDV pode estar sem rede exatamente quando precisa imprimir. O desenho declara um `<link>` para `fonts.googleapis.com` (`design/printer-v2.dc.html:11`) e essa linha **não atravessa** para o app.

## Por que recortada

| Versão | Tamanho |
| --- | --- |
| fonte variável completa (~3 mil ícones) | **2 367 840 bytes** (2,37 MB) |
| este recorte (34 ícones) | **20 860 bytes** (20,4 kB) |

99,1 % menor. Sem o recorte, a fonte sozinha seria **4,5×** o bundle inteiro do renderer (518 kB).

## Como foi gerada, e como gerar de novo

A receita **não fixa versão upstream**: o Google atualiza glifos, então regerar dá bytes diferentes do `sha256` acima. Isso é esperado; o hash serve para distinguir "regerado de propósito" de "trocado sem querer".

A API do Google Fonts recorta por nome de ícone. Trocar a lista no `icon_names`, pegar a URL do `src: url(...)` do CSS devolvido e baixar o woff2:

```bash
ICONS="add,arrow_back,cancel,check,check_circle,chevron_right,close,cloud_done,cloud_off,error,history,hourglass_top,info,logout,person,print,progress_activity,radio_button_checked,radio_button_unchecked,receipt,receipt_long,remove,schedule,search,skillet,space_dashboard,stacks,table_restaurant,task_alt,tune,two_wheeler,visibility,visibility_off,warning"
curl -s "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=$ICONS" -o ms.css
curl -s "$(sed -n 's/.*src: url(\([^)]*\)) format.*/\1/p' ms.css)" -o material-symbols-outlined-subset.woff2
```

**A armadilha:** ícone novo no `Icon.tsx` **não aparece** se o recorte não for gerado de novo — ele simplesmente não está na fonte, e a tela mostra o nome em texto ou nada. Por isso a união de nomes do `Icon.tsx` e a lista do `icon_names` são a **mesma** lista, e mudar uma sem a outra é o defeito.

## O que foi medido nesta fonte (2026-10-28)

- `wOF2` válido, 17 tabelas, 78 glifos, `totalSfntSize` de **43 052** bytes (o sfnt depois de descomprimir)
- `sha256` do arquivo: `7a13d4b3e105375330141541f92508b4dfe973c4c33a317f3e1a263cd07fc05b` — se ele mudar sem alguém regerar o recorte de propósito, a fonte foi trocada
- `cmap` com 80 codepoints: as **24 letras** necessárias para escrever os nomes (`_abcdefghiklmnoprstuvwy`) e **56 PUA** (entre eles `U+E8AD`, o `print`)
- `GSUB` presente (1 776 bytes), com as ligaduras dentro de um **extension lookup** (tipo 7) nas features **`rlig`** e **`rclt`**

**Consequência prática, e é o ponto que não se adivinha:** o desenho escreve `-webkit-font-feature-settings: 'liga'`, mas esta fonte **não usa `liga`** — usa `rlig`, que é *required ligature* e o Chromium aplica **por padrão**. Ou seja: declarar só `'liga'` funcionaria por acidente, e mexer nessa linha achando que ela é o que liga os ícones quebraria a tela sem explicação. Não dependa dela; se quiser ser explícito, declare `font-feature-settings: 'liga' 1, 'rlig' 1`.

Pelo mesmo motivo, ferramenta que lê ligadura por `liga` (o `opentype.js`, por exemplo) reporta **zero ligaduras** nesta fonte. Isso é limitação da ferramenta, não defeito da fonte.

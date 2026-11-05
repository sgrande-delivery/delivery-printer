# As fontes de impressão, no pacote

Seis arquivos `woff2` das três famílias que o gestor pode escolher na tela de impressão do painel (`font_family` = `plex`, `atkinson` ou `barlow`): IBM Plex Sans Condensed, Atkinson Hyperlegible e Barlow Semi Condensed. A licença das três (SIL OFL 1.1) está em `OFL.txt`, ao lado.

| Arquivo                             | Família                 | Peso | Bytes  | `sha256`                                                           |
| ----------------------------------- | ----------------------- | ---- | ------ | ------------------------------------------------------------------ |
| `ibm-plex-sans-condensed-500.woff2` | IBM Plex Sans Condensed | 500  | 19 952 | `e3b4fd97fd20bc70fda66d8d5f0745d8d6958068a024cb4724bbc1ffb6cbc183` |
| `ibm-plex-sans-condensed-700.woff2` | IBM Plex Sans Condensed | 700  | 19 352 | `4768878c107d92c528a65bba206a87cdcf2c694514e75907fb91772cf8a388a5` |
| `atkinson-hyperlegible-400.woff2`   | Atkinson Hyperlegible   | 400  | 17 208 | `d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc` |
| `atkinson-hyperlegible-700.woff2`   | Atkinson Hyperlegible   | 700  | 17 524 | `140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0` |
| `barlow-semi-condensed-500.woff2`   | Barlow Semi Condensed   | 500  | 22 428 | `0d7513795eaf8fdab7f340144841bd2d9fac7d9303c03aa6b525a2c908e9b371` |
| `barlow-semi-condensed-700.woff2`   | Barlow Semi Condensed   | 700  | 23 244 | `fb958c8c20a05552ac8a85d925d96028d52565792650e941a5fe96b6997aa5cb` |

Total: **119 708 bytes** (~117 kB), no instalador e **zero no bundle do renderer** (eles não passam pelo Vite). Chegam ao PC do restaurante por `extraResources: ["./assets/**"]`, em `resources/assets/fonts/`, e o main os resolve por `getAssetPath(app, 'fonts', …)`.

## De onde vieram

Foram **copiados** de `delivery-admin/public/fonts/print/` (task [delivery-admin#1027](https://github.com/sgrande-delivery/delivery-admin/issues/1027)), não baixados de novo: são os bytes já vetados numa folha de teste em térmica a 203 dpi, e o Google atualiza glifo sem avisar. O recorte é **só o bloco `latin`** do Google Fonts — 220 a 229 codepoints por face, máximo `U+2215`, usado sem descritor `unicode-range`. **`latin-ext` ficou fora**, e isso veio da origem: o `delivery-admin` registrou o desvio (`plan.md:143` e `tasks/1027…:246`) porque juntar os dois blocos num arquivo exigiria subsetar com `fonttools`. **Consequência:** letra fora do Latin-1 (`Ł`, `ş`, `ő`, `ă`) cai no fallback **glifo a glifo** — duas fontes na mesma linha da bobina, sem erro nenhum. Nome de cliente ou de rua é onde isso apareceria.

Para regerar, pedir o CSS com User-Agent de navegador moderno e baixar o `src` do bloco `latin`:

```bash
curl -sS -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;700&display=block'
```

**A armadilha:** a User-Agent tem de ser a **completa**, com `AppleWebKit/…` e `Safari/…`. Uma encurtada faz o Google responder TTF e **sem `unicode-range`**, e aí não dá para saber qual bloco se está baixando.

Regerar dá bytes diferentes dos `sha256` acima. Isso é esperado; o hash serve para distinguir "regerado de propósito" de "trocado sem querer" — e um arquivo regerado perde a verificação em papel da folha de teste. Por isso não há teste de hash.

## Por que são seis

Só vêm os pesos que alguma view da `delivery-api` alcança (RN-07 da spec 52):

- o peso do corpo vem do `PrintFontEnum::weight()`: **500** em Plex e Barlow, **400** em Atkinson (que não tem 500)
- o único outro peso que as views pedem é **700**: o `.bold` de `public/css/socket/order/styles.css:66` e as classes dos modelos novos em `resources/views/print/layout.blade.php:25-70` (as de `print/parts/` só **aplicam** essas classes, não declaram peso)
- nenhum documento pede 400 em Plex ou Barlow, nem mono

O admin guarda dez arquivos (inclui IBM Plex Mono e os 400 de Plex e Barlow) porque o navegador dele também renderiza a pré-visualização. A Atkinson simplesmente não tem 500: com 400 e 700 declarados, um pedido de 500 casa com o 400 real, sem síntese — por isso ela entra em 400 e o enum da API já emite 400 para ela.

## Por que não vêm do Google em runtime

Mesma razão da fonte de ícones (`src/renderer/fonts/README.md`, RN-04 da spec 52): o PDV pode estar sem rede exatamente quando precisa imprimir, e a folha de impressão não tem segunda chance. Nenhum `<link>` para `fonts.googleapis.com` atravessa para o app.

## Cobertura medida (2026-11-04)

As seis faces cobrem `AÇÃO ação ÁÀÃÂÉÊÍÓÕÔÚÜÇ 0123456789 R$ ºª °` e a pontuação de comprovante, sem glifo faltando. **Medido lendo o `cmap` de cada woff2** (descompressão brotli + parse das subtabelas 4 e 12): 220 codepoints na Atkinson, 227 na Barlow, 229 na Plex. É a verificação que importa num comprovante brasileiro.

**Não** meça isso com `document.fonts.check(fonte, texto)`: sem descritor `unicode-range` no `@font-face`, o intervalo assumido é `U+0-10FFFF` e o Chromium responde `true` para qualquer caractere, inclusive os que a fonte não tem. Esse método deu falso positivo aqui antes de alguém abrir o `cmap`.

## Quem consome

O consumidor é o `src/main/printFonts.ts` (task #54), no **main**, que declara os `@font-face` no HTML antes de gravá-lo para impressão. **Não** é o CSS do renderer: a impressão é um documento `file://` em `os.tmpdir()` numa `BrowserWindow` própria, e o `@font-face` do `app.css` não o alcança (RN-03). Se a fonte escolhida não sair na bobina, é lá que se procura. O aviso no log para arquivo de fonte ausente (RF-04) também é da task #54 — até ela entrar, este diretório não é lido por ninguém.

# A marca, no pacote

Estes arquivos existem porque **nada visual deste app vem da internet** (RN-01 da spec 38): o PDV pode estar sem rede exatamente quando precisa imprimir, e até a spec 38 o logo da tela de login era buscado em `https://admin.sgrande.delivery/logo192.png` — sem internet, a tela aparecia sem logo.

Procedência: pacote de marca `sgrande-assets-nova` do projeto no Claude Design, em 2026-10-28.

| Arquivo | Origem no pacote | Onde é exibido |
| --- | --- | --- |
| `simbolo-negativo.svg` | `logo/simbolo-negativo.svg` | sidebar (30 px) e telas de estado no tema escuro (26 px) |
| `simbolo.svg` | derivado do negativo (ver abaixo) | telas de estado no tema claro (26 px) |
| `logo-horizontal-negativo.svg` | `logo/logo-horizontal-negativo.svg` | painel de marca do login (190 px de largura) |

## Por que SVG, e não os PNGs do pacote

**Os PNGs do pacote de marca estão corrompidos na origem.** Medido em 2026-10-29, nos três: a assinatura, o `IHDR` e o `IEND` estão certos — por isso `file`, o `npx asar` e qualquer editor os chamam de PNG —, mas **o chunk `IDAT` falha no CRC** e o `zlib` recusa os dados de pixel (`incorrect data check`). O `logo-horizontal-negativo@2x.png` está ainda truncado, com um `IDAT` declarando 8192 bytes que o arquivo não tem.

**Não foi a importação que estragou.** Rebuscar `logo/simbolo-negativo@2x.png` do projeto de design devolve **os mesmos 3.821 bytes, com o mesmo CRC quebrado** — o dano está no arquivo guardado lá. Por isso não adianta reimportar PNG: os `.svg` do mesmo pacote chegam íntegros, porque são texto e não passam pelo round-trip binário que estragou os outros.

Consequência prática: **o logo ficou quebrado na sidebar, no login e nas telas de estado das tasks 01 à 12**, em dev e empacotado, e nenhum teste acusou — a suíte importava o asset pela URL e nunca olhava os bytes. Quem achou foi o dev, rodando o app no Windows. O guarda que faltava é `src/renderer/images/__tests__/brandAssets.test.ts`, que **decodifica** cada imagem que embarca (aqui e em `assets/`) em vez de olhar o cabeçalho.

**O `simbolo.svg` é derivado do `simbolo-negativo.svg`** trocando a cor do ladrilho escuro (`#5A524E` → `#2B2725`). Conferido contra os dois originais do pacote: fora essa cor, os arquivos são idênticos. O `logo-horizontal-negativo.svg` é o mesmo símbolo com outro `viewBox` mais os dois grupos do letreiro.

Os três foram gravados **sem o bloco `<metadata><c2pa:manifest>`** do pacote: são ~16 kB de base64 de proveniência por arquivo, que não desenham nada.

## Regras

- Importar pelo Vite (`import logo from 'renderer/images/brand/logo-horizontal-negativo.svg'`), **nunca** montar caminho em string. O `*.svg` já está declarado no `env.d.ts`.
- **Arquivo novo de marca entra como SVG**, pelo mesmo motivo acima. Se algum dia for preciso PNG (um `icon.png` de bandeja, por exemplo, que o Electron não aceita em SVG), **gere-o a partir do SVG** e confira que o teste de assets passa antes de commitar.
- SVG vindo de fora é renderizado com os privilégios do renderer: o teste recusa `<script>`, `on*=` e `javascript:`. Não relaxe isso.

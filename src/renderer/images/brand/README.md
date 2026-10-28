# A marca, no pacote

Estes arquivos existem porque **nada visual deste app vem da internet** (RN-01 da spec 38): o PDV pode estar sem rede exatamente quando precisa imprimir, e até a spec 38 o logo da tela de login era buscado em `https://admin.sgrande.delivery/logo192.png` — sem internet, a tela aparecia sem logo.

Procedência: pacote de marca `sgrande-assets-nova` do projeto no Claude Design, em 2026-10-28.

| Arquivo | Origem no pacote | Tamanho | Onde é exibido |
| --- | --- | --- | --- |
| `simbolo-negativo.png` | `logo/simbolo-negativo@2x.png` | 96×96 | sidebar (30 px) e telas de estado no tema escuro (26 px) |
| `simbolo.png` | `logo/simbolo@2x.png` | 96×96 | telas de estado no tema claro (26 px) |
| `logo-horizontal-negativo.png` | `logo/logo-horizontal-negativo@3x.png` | 371×144 | painel de marca do login (190 px de largura) |

**Por que o `@3x` só no logo horizontal:** o `@2x` dele tem 247×96, e exibido a 190 px dá só 1,3× — fica mole no Windows a 125 % ou 150 % de escala. O `@3x` dá ~1,95×. Os símbolos, exibidos a 30 px com fonte de 96 px, já têm folga de 3× no `@2x`.

Importar pelo Vite (`import logo from 'renderer/images/brand/logo-horizontal-negativo.png'`), **nunca** montar caminho em string.

Se um dia a aparência pedir nitidez maior (tela de 4K, logo exibido grande), a saída é o SVG do mesmo pacote (`logo/*.svg`) — ele existe, e não foi usado aqui só porque os PNGs já cobrem os tamanhos de exibição atuais.

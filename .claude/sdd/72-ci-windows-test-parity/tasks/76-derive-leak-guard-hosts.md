# 76 — Guarda do instalador de teste derivada dos .env, não repetida

**Issue:** [#76](https://github.com/sgrande-delivery/delivery-printer/issues/76)
**Feature:** [Paridade de plataforma entre o gate de PR e a esteira de publicação](../spec.md) — issue #72
**Tipo:** bug
**Processo:** build
**Depende de:** (nenhuma)
**Status:** executada

## Objetivo

Fazer a guarda do instalador de teste derivar os hosts proibidos dos `.env` versionados, em vez de repeti-los. Repetidos, eles ficaram para trás do primeiro PR que mudou um `.env`, e metade da guarda passou a não poder falhar.

## Contexto

- Cobre **RF-05** e a **RN-07** da spec (acrescentadas junto com esta task).
- O `test-installer.yml` existe porque o build de produção **não pode** apontar para a API real num teste: o `printer_ping` registraria a máquina como impressora de um restaurante em produção. O comentário do próprio workflow (`:48-50`) chama a verificação de *"a única verificação que separa instalador de teste de instalador que registra a máquina como impressora em produção"*.
- **O defeito, medido:** `test-installer.yml:54` e `:56` procuravam `api\.sgrande\.delivery\|socket2\.sgrande\.delivery`. O PR #71 trocou o `.env.production` de `socket2.sgrande.delivery` para `socket.sgrande.delivery`, e o padrão não acompanhou. `socket2\.sgrande\.delivery` **não casa** com `socket.sgrande.delivery`, então a metade do WebSocket ficou cega. Conferido num `out/` sintético: a guarda antiga **passa em branco** com a URL de socket de produção no bundle.
- É a **mesma patologia** das tasks 73 e 75 — guarda estruturalmente incapaz de falhar — num terceiro workflow. Lá era um teste que não podia rodar no sistema certo e um portão que não era chamado; aqui é um padrão que não pode mais casar.
- A verificação positiva também era parcial: ela conferia só `api-dev`, nunca o socket de dev.

## Mudanças

### 1. Hosts derivados, não repetidos

`.github/workflows/test-installer.yml` (alterado), no step `Refuse to ship a test installer that talks to production`:

`collect_hosts()` extrai o host de cada linha `APP_*=<esquema>://…`. **Proibido** vem do `.env.production`, **esperado** vem do `.env.development` — os dois versionados, os dois com duas chaves. Assim a guarda acompanha qualquer PR que mude um `.env`, que é precisamente o que falhou aqui.

A extração tolera `export`, espaço em volta do `=`, aspas em volta do valor, CRLF e **qualquer** esquema (`http`, `https`, `ws`, `wss`), porque todas essas formas são válidas no dotenv e **host que a extração perde sai da guarda em silêncio** — que é a doença da #76, não a cura. Medido: com o `sed` da primeira versão, `APP_WS_BASE_URL=wss://socket.sgrande.delivery` no `.env.production` fazia a guarda sair `exit 0` **com o socket de produção no bundle**, e valor entre aspas fazia o mesmo com a API.

A busca passou a ser `grep -F` (string literal). O ponto não escapado do padrão antigo era regex, e um dia casaria por acidente.

O step que escreve o `.env.production.local` virou `cp .env.development .env.production.local`: ele repetia as duas URLs de dev num heredoc, a mesma patologia desta issue a 25 linhas de distância. A cópia também cobre `APP_*` que ainda não existe — variável nova entra no build de teste sem ninguém lembrar do step.

### 2. Três coisas que a guarda agora recusa fazer em silêncio

- **Não consegue extrair host** de um dos dois `.env` (arquivo ausente, nenhuma linha de URL) → falha dizendo isso, em vez de comparar com lista vazia e sair verde.
- **Host de produção contido num de dev** (`api.sgrande.delivery` dentro de `staging-api.sgrande.delivery`) → falha com o motivo. Sem isso, a guarda acusaria **todo** build de teste e ninguém entenderia por quê.
- **Autoteste da derivação antes do veredito:** toda linha de URL do `.env` tem de render um host com cara de host (`[A-Za-z0-9.:-]`), ou a guarda para com a linha na tela. É o que impede a #76 de voltar: o risco que sobrou depois de derivar não é o `grep` deixar de casar, é a **extração** perder um host e deixar essa metade cega. Um fixture escrito a partir do host já extraído **não** testa isso — `grep -F` sempre acha a string que acabou de ser escrita, então ele passa justamente nos casos em que a extração falhou (medido: `wss://` e valor entre aspas passavam pelo fixture e saíam `exit 0`).

### 3. A verificação positiva cobre os dois hosts

Antes conferia só `api-dev`. Agora exige **todos** os hosts do `.env.development` no bundle.

## Testes

Não há teste automatizado de workflow neste repo. A prova foi extrair o step do YAML e rodá-lo contra um `out/` sintético, num sandbox com cópias dos `.env`:

| Cenário | Resultado |
| --- | --- |
| bundle só com URLs de dev | `exit 0`, "ok: bundles point at dev" |
| vazou a **API** de produção | `exit 1`, acusa `api.sgrande.delivery` |
| **vazou o SOCKET de produção** | `exit 1`, acusa `socket.sgrande.delivery` ← **a guarda antiga passava em branco** |
| vazaram as duas | `exit 1`, acusa as duas (não para na primeira) |
| falta a URL de dev do socket | `exit 1`, diz que não dá para afirmar que aponta para dev |
| bundle vazio | `exit 1`, idem |
| host de produção contido no de dev | `exit 1`, com o motivo |
| `.env.production` ausente | `exit 1`, nomeando o arquivo |
| `.env.production` sem nenhuma linha de URL | `exit 1`, com o motivo |
| `wss://` no `.env.production` + socket de produção no bundle | `exit 1` ← **a primeira versão desta task saía `exit 0`** |
| valor entre aspas no `.env.production` + API de produção no bundle | `exit 1` ← **idem** |
| `export` e espaço em volta do `=` + vazamento | `exit 1` |
| `.env` com CRLF + vazamento | `exit 1` |
| comentário no fim da linha do `.env` | `exit 0`, host extraído limpo |
| dois `APP_*` apontando para o mesmo host | `exit 0`, sem falso negativo de contagem |
| linha de URL que não rende host (`https://`, `user:pw@host`) | `exit 1`, com a linha na tela |

Fim a fim, no build real (Node 24, `npm run build`, mode `production`):

- com `cp .env.development .env.production.local` → os dois hosts de dev inlinados, nenhum de produção, guarda `exit 0`;
- **sem** o override → `index-*.js` com `BASE_URL: "https://api.sgrande.delivery/api/admin/"` e `WS_BASE_URL: "https://socket.sgrande.delivery"`, guarda `exit 1` acusando os dois.

A comparação direta que fecha a issue: no mesmo `out/` com `socket.sgrande.delivery`, o `grep` do `master` **não acusou** e o novo acusou.

Não rodado: `shellcheck`/`actionlint` (não instalados nesta máquina) e o workflow de verdade no `windows-latest`.

## Critérios de aceitação

- [x] Os hosts proibidos e esperados vêm dos `.env` versionados, e não há host literal no workflow — nem na guarda, nem no step que escreve o `.env.production.local`
- [x] Vazamento da URL de socket de produção reprova (o caso da #76)
- [x] Vazamento da URL de API de produção continua reprovando
- [x] Ausência de **qualquer** host de dev no bundle reprova
- [x] Host de produção contido num de dev falha com explicação, em vez de reprovar todo build de teste
- [x] A guarda autotesta a **derivação** antes de dar veredito, com um autoteste que pode falhar (medido: quatro formas de linha o derrubam)
- [x] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo

## Fora de escopo

- **Rodar o workflow de verdade.** O gatilho é `push` em `test/dev-build-**`, e criar essa branch gera um build de instalador completo no Windows. A validação por sandbox cobre a lógica; o run real é quando alguém for gerar um instalador de teste.
- Mudar o gatilho, o `--publish never` ou o artifact.
- Estender a mesma derivação ao `ci.yml` ou ao `publish.yml`: nenhum dos dois escreve `.env.production.local`, então nenhum tem esse risco.

## Branch

`feat/72-ci-windows-test-parity`, cortada de `origin/master` em 2026-11-10. Todas as tasks da spec rodam nela, com um commit por task.

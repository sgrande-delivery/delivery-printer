---
paths:
  - "package.json"
  - "package-lock.json"
  - "electron.vite.config.ts"
  - "build-config.ts"
  - ".github/workflows/**"
  - "src/main/updater.ts"
  - ".env.development"
  - ".env.production"
  - ".env.example"
---

# Empacotamento, release e autoupdate

Esta é a regra em que um erro **não aparece no seu computador**: ele aparece semanas depois, numa máquina de restaurante que parou de receber atualização sem dizer nada. Tudo aqui foi medido, não deduzido.

## As invariantes

| Item | Valor hoje | Se mudar |
| --- | --- | --- |
| `build.appId` | `com.sgrande.delivery` | A nova versão instala **ao lado** da antiga em vez de atualizar |
| `build.publish` | `github`, owner `raphaelcarreiro`, repo `delivery-printer-2`, `private: true` | É o que gera o `app-update.yml` **embarcado**; instalação antiga continua consultando o valor antigo para sempre |
| `electron-updater` e `electron-log` | em **`dependencies`** | São externalizados do bundle do main; em `devDependencies` o electron-builder não os empacota e o `require` falha em runtime, **em silêncio** |
| `build.win.target[].arch` | `["ia32", "x64"]` numa invocação | Builds separados por arquitetura **sobrescrevem o `latest.yml`** e quebram o update de uma delas |
| `build.nsis.perMachine` | `false`, explícito (com `oneClick: false` e `allowElevation: false`) | `true` faz o instalador declarar `RequestExecutionLevel admin` (`installer.nsi:20-25`), então o update silencioso do `quit` abre UAC sem ninguém na frente e o PDV sem senha de admin para de atualizar em silêncio. Com `oneClick: true` soma-se o `isAdminRightsRequired` no `latest.yml` (`NsisTarget.js:311` — só quando `oneClick` **ou** `packElevateHelper` explícito; com o assistente e o default, ele **não** é gravado), que manda o updater pelo `elevate.exe` sem retry nem fallback (`NsisUpdater.js:123-129`). E `allowElevation: false` só desabilita a opção "todos os usuários" quando o instalador **não** roda elevado: instalação escolhida como admin ainda quebra o update daquela máquina (`installer.nsi:101-115`) |
| `version` | sempre crescente | É a única coisa que o updater compara |
| Electron | **43.x** | O 44 removeu `win32-ia32`: PDV 32-bit para de instalar e de atualizar |

## Por que o `build.publish` não pode "só ser corrigido"

O remoto deste clone é `raphaelcarreiro/delivery-printer-2`, nome antigo que o GitHub **redireciona** para `sgrande-delivery/delivery-printer`. Medido:

```
GET https://github.com/raphaelcarreiro/delivery-printer-2/releases/latest  → 301
  → https://github.com/sgrande-delivery/delivery-printer/releases/latest   → 200
```

O download de asset também atravessa o redirect (`.../releases/download/v2.6.0/latest.yml` → `200`).

Cada instalador carrega `resources/app-update.yml` com o owner/repo do momento do build. **Trocar para `sgrande-delivery/delivery-printer` só afeta instalações futuras**: quem já tem o app instalado continua pedindo a URL antiga até receber uma atualização — que ele só recebe pela URL antiga. Então:

- o redirect é **parte da infraestrutura de atualização**, não um detalhe cosmético;
- ninguém cria um repo novo chamado `raphaelcarreiro/delivery-printer-2` — isso mata o redirect e congela todas as instalações existentes;
- a troca do `publish`, se um dia valer a pena, é uma task própria, com o risco escrito, e não um "aproveitei que estava ali".

`private: true` com repo público é inofensivo: o electron-updater só usa o provedor privado quando existe `GH_TOKEN`/`GITHUB_TOKEN` no ambiente do app, o que não acontece na máquina do cliente.

## Como o release sai

Dois workflows. `ci.yml` checa (`pull_request` e `push: master`) e **não publica**. `publish.yml` publica, nos eventos **`release: [published, released]`**, e é onde moram as armadilhas abaixo.

**O `ci.yml` roda em matriz, `[ubuntu-latest, windows-latest]`, e isso é invariante de release, não preferência:** `npm ci`, `test` e `build` rodam nos **dois**; `typecheck` e `lint` só no Linux, porque o veredito deles não muda com o SO e o único eixo que mudaria (caixa de nome de arquivo) é mais estrito lá. O motivo é paridade com este arquivo: o `publish.yml` empacota em `windows-latest`, então um teste cujo resultado depende da plataforma **não podia falhar no gate de PR nem passar na esteira** — foi exatamente assim que uma asserção de caminho do `printFonts` derrubou o step Test da **v3.0.0**, deixando a pré-release sem assets. Promovida em seguida, ela virou a `Latest` sem `latest.yml`, e todo app instalado tomou 404. Tirar a matriz reabre essa porta.

Consequência operacional: o nome do check deixou de ser `check` e passou a ser **`check (ubuntu-latest)`** e **`check (windows-latest)`**. Hoje é inofensivo, porque o ruleset `master-protection` tem só `deletion`, `non_fast_forward` e `pull_request` — **nenhum `required_status_checks`** (conferido em 2026-11-10). Quem um dia exigir check por nome tem de usar os dois nomes novos, ou o gate passa a ser exigido de um job que não existe.

### O fluxo

| # | Ato | Quem |
| --- | --- | --- |
| 1 | bump da `version`, PR, merge em `master` (**não publica**) | dev |
| 2 | criar a release com a tag `v<version>`, **como PRÉ-RELEASE** | dev |
| 3 | conferir tag × `package.json`, buildar, anexar `.exe`/`.blockmap`/`latest.yml` | esteira |
| 4 | instalar o `.exe` anexado e conferir | dev |
| 5 | **promover** a pré-release a release normal → rollout | dev |
| 6 | atualizar `delivery_printer_version` no `delivery-admin` | dev |

### O que escrever no corpo da release

**O corpo é público e tem dois leitores**, e o segundo é o que surpreende: além da página da release no GitHub, ele é exibido **dentro do app**, na tela `/updates` (spec 79, RF-10). O `releaseNotesToLines` (`src/shared/releaseNotes.ts`) recebe o corpo **já renderizado em HTML** pelo GitHub, apaga toda tag, decodifica as cinco entidades e corta em **12 linhas** (`MAX_RELEASE_NOTE_LINES`). Daí:

- **negrito, título e link viram texto puro.** `## Impressão` vira a linha `Impressão`, e o `- ` do item de lista desaparece (o `<li>` vira quebra de linha). Não quebra nada — só não decora nada.
- **O que passar de 12 linhas não existe para o operador.** Parágrafo e item contam um cada.
- **URL no corpo é texto morto na tela:** não é clicável e não leva a lugar nenhum.

**Quem lê é o dono do restaurante e o operador do PDV**, não o dev. O padrão, medido nas releases `v3.0.1` e `v3.0.2`:

- **pt-BR, e o efeito antes do mecanismo.** "o comprovante saía cortado do lado direito" é o que ele reconhece no papel que tem na mão; `marginType` não lhe diz nada.
- **Diga como era antes quando a mudança só faz sentido assim** — *"Antes a falha era silenciosa"* (v3.0.1).
- **Nada de número de PR, número de issue, nome de arquivo, de função ou de chave de configuração.** Isso mora no PR e na spec, que são onde o dev procura.
- **Seções `##` por tema só quando a release é grande.** A v3.0.1 reescreveu o app e tinha três; a v3.0.2 eram três parágrafos secos, sem nenhuma.
- **As primeiras linhas são as únicas garantidas.** Ponha na frente o que muda o dia de quem opera.
- **Sem "Full Changelog" e sem lista de commits.** A v2.6.0 tem, e dentro do app isso é uma linha gasta com uma URL que ninguém clica.

O título da release é `v<version>`, igual à tag.

### Por que pré-release e não draft

**Draft não dispara workflow.** Documentação do GitHub, literal: *"Workflows are not triggered for the `created`, `edited`, or `deleted` activity types for draft releases."* A segurança do portão vem então de a release ser **pré-release**, que o `GitHubProvider` do electron-updater ignora do mesmo jeito que ignora draft — ele pede `https://github.com/<owner>/<repo>/releases/latest` com `Accept: application/json` e lê o `tag_name`, e essa URL pula draft **e** pré-release.

### As três armadilhas do `getOrCreateRelease`

`node_modules/electron-publish/out/gitHubPublisher.js`, achando a release pela tag:

1. **release não-draft com `releaseType === "draft"`** (o default, quando o `package.json` não declara) → `log.warn("GitHub release not created")` e **`return null`**: nada anexado, **exit 0**. Fechado por `"releaseType": "prerelease"` em `build.publish`.
2. **release publicada há mais de 2 horas** → recusa igual, só com warn. **Esta só passou a existir quando saímos de draft** (draft retorna antes da checagem de tempo). Re-rodar o job no dia seguinte basta para cair nela. Fechado por `EP_GH_IGNORE_TIME: 'true'` no step de empacotamento.
3. **release inexistente** → criada, porque `--publish always`.

**`releaseType: "prerelease"` não é guarda:** com ele o publisher sobe para draft, pré-release **e release normal** igualmente. Quem recusa o caso perigoso é o job `gate` do workflow.

### O gate, e por que ele olha estado e não evento

**Promover uma pré-release dispara `released`, e não `published`.** Medido em 2026-11-10: a `v3.0.0` foi criada como pré-release, o `publish` falhou no step Test e deixou zero assets; ao promovê-la, o `publish.yml` (que escutava só `published`) **não rodou**, e ela virou a `Latest` sem `latest.yml`. O `gate` tinha o ramo certo para esse estado e nunca foi chamado. Por isso o `on` escuta `[published, released]` e o `gate` não infere intenção pelo tipo do evento — ele lê o estado que vem **no payload**, em todo evento que possa produzir o estado ruim. Não acrescente outros tipos (`edited` dispararia a cada salvamento de notas; nenhum produz o estado ruim).

**O payload é um retrato do instante do evento, não o estado de agora** — e isso tem corolário prático, porque o `concurrency` enfileira: promover **com a esteira ainda rodando** faz o run do `released` decidir com a lista de assets de **antes** do build, então ele sai vermelho mesmo que os três arquivos tenham chegado no meio-tempo. O alarme não é falso (no instante da promoção o estado ruim existiu), mas o diagnóstico precisa ser conferido com `gh release view <tag>` antes de concluir que o build falhou. A mensagem do job diz isso.

**Release criada direto como normal dispara os dois eventos** (conferido na fonte da doc do GitHub em 2026-11-10: `published` = *"A release, pre-release, or draft of a release was published"*; `released` = *"A release was published, or a pre-release was changed to a release"*). Consequência: dois runs vermelhos para a mesma tag, serializados pelo `concurrency`. É ruído aceitável — o primeiro ato é o mesmo nas duas mensagens.

| Evento | Estado | Decisão |
| --- | --- | --- |
| `published` | pré-release | builda e publica |
| `published` | não-pré, **com** `latest.yml` nos assets | promoção: não builda, sai verde |
| `published` | não-pré, **sem** `latest.yml` | **falha** — já é a `Latest` sem `latest.yml`, e todo app instalado tomaria 404 em silêncio |
| `released` | pré-release | não builda, sai verde. **Ramo defensivo:** pela doc este caso não ocorre, e ele existe para que uma semântica não documentada não dispare um **segundo build na mesma tag** |
| `released` | não-pré, **com** `latest.yml` | promoção legítima: não builda, sai verde |
| `released` | não-pré, **sem** `latest.yml` | **falha**, com a instrução de recuperação: `gh release edit <tag> --prerelease`, que devolve a `Latest` para a anterior em segundos |
| qualquer | payload de assets ilegível | **falha**, com mensagem própria (não mande apagar release por erro de leitura) |

**No `released` o gate falha, não conserta:** buildar e anexar ali publicaria asset numa release que **já é a `Latest`**, a janela que ele existe para fechar. Um job vermelho não desfaz a promoção; é o único aviso de que o parque entrou em 404. O `concurrency` é por tag com `cancel-in-progress: false` de propósito: promover logo depois de criar **enfileira** atrás do build em andamento, e `true` faria a promoção cancelá-lo.

**O que o gate não pega, e nenhum `on: release` pegaria:** apagar o asset `latest.yml` da release que é a `Latest` **não dispara webhook nenhum** — o evento `release` tem sete activity types e **não existe** evento de asset de release (conferido em 2026-11-10). É o único caminho restante para o pior estado do repositório, e só um job agendado conferindo `/releases/latest` o acharia. Saiba que ele existe antes de redescobri-lo como surpresa.

Segunda folga conhecida: o predicado do gate é **só** o `latest.yml`. Uma release com `latest.yml` e **sem** o `.exe` sai verde, e o fim é o mesmo — o updater acha a atualização e toma 404 no download. O checklist exige três arquivos; o portão afirma um.

**Quando um gatilho do GitHub tiver semântica incerta, copie esta abordagem** — olhe o estado — **e meça qual evento dispara de fato**, porque o portão só vale se for chamado.

### O que o cliente faz

`AppUpdater.run()` → `autoUpdater.checkForUpdates()` no boot, com `autoDownload` e `autoInstallOnAppQuit` ligados (`src/main/updater.ts`). O usuário vê uma notificação pedindo para fechar o app; a troca acontece no `quit`.

Corolário duplo, e os dois importam: **a atualização chega quando o operador fecha o app**, que vive na bandeja — pode levar dias; e **fechar pela janela (X) não produz `quit`** (`src/main/window.ts` dá `preventDefault` enquanto `isQuiting` for falso, e o `app.quit()` do Electron aborta quando uma janela impede o próprio fechamento), então só o "Fechar" da bandeja aplica atualização. Não prometa "atualiza na hora" em nenhuma task.

`releaseType` atravessa para o `app-update.yml` embarcado no pacote, e é **inerte** no cliente: zero ocorrências em `node_modules/electron-updater/out/`, e `allowPrerelease` é `false` por default. Nenhum PDV instala pré-release.

`secrets.TOKEN` é o nome do secret que existe no repo — não renomeie para `GITHUB_TOKEN` nem para `GH_TOKEN` no workflow sem criar o secret novo antes.

### Rollback

**O electron-updater não faz downgrade.** Marcar a release anterior como `Latest` faz com que ela volte a ser oferecida a quem **ainda não atualizou**; quem já atualizou **não volta sozinho**. As duas saídas:

- **voltar a anterior para `Latest`** (marcar a nova como pré-release) — estanca a propagação em minutos, e é o primeiro ato em qualquer incidente;
- **publicar uma versão nova com número maior e o conteúdo revertido** — é o único jeito de recuperar quem já atualizou.

As duas juntas, nessa ordem. E antes de qualquer uma: **se a esteira terminou verde e sem assets, não promova** — o problema é uma das armadilhas acima, não o código.

### Checklist de release

- [ ] `version` do `package.json` subiu, e é maior que a última tag publicada (`gh release list`)
- [ ] PR mergeado em `master` com o `ci.yml` verde
- [ ] release criada com a tag **`v<version>`** e marcada como **pré-release**
- [ ] corpo da release escrito para quem usa o app, em pt-BR, com o que importa nas primeiras 12 linhas
- [ ] run do `publish.yml` verde **e com os três arquivos anexados** à pré-release
- [ ] `.exe` instalado e conferido numa máquina
- [ ] release promovida (sai da pré-release, vira `Latest`)
- [ ] `delivery_printer_version` atualizado no `delivery-admin`

## Verificação, quando a task encostar nisto

Não dá para confiar em leitura: empacote e abra o asar.

```bash
npm run build
npx electron-builder --linux dir            # rápido, não precisa de Windows nem de wine
npx asar list release/linux-unpacked/resources/app.asar | head -40
cat release/linux-unpacked/resources/app-update.yml
```

**Correção medida em 2026-10-15:** o `app-update.yml` **não** está dentro do `app.asar` nesta versão — `npx asar extract-file … app-update.yml` falha com *"was not found in this archive"*. Ele fica ao lado, em `resources/`, então basta `cat release/linux-unpacked/resources/app-update.yml`.

> **Cuidado com o `extract-file`, medido do jeito ruim em 2026-10-15:** ele **escreve o arquivo extraído no diretório atual**, com o nome original. Rodado na raiz do repo para conferir o `package.json` empacotado, ele **sobrescreve o `package.json` do repo** — e, como o do asar não tem `scripts` nem `devDependencies`, o estrago é silencioso até o próximo `npm run`. Para inspecionar conteúdo, use `npx asar list` (não escreve nada); precisando do arquivo, rode o `extract-file` **de dentro de um diretório temporário**, nunca da raiz.

O que tem de aparecer: `out/main`, `out/preload`, `out/renderer`, `package.json`, `node_modules/electron-updater`, `node_modules/electron-log`, `node_modules/socket.io-client` — e **nenhuma** devDependency. A última medição (2026-10-15, Electron 43.7.11) deu 24 pacotes e `app.asar` de 5,0 MB. Apague `release/` depois: ela é gitignorada, mas 200 MB atrapalham.

Para o Windows de verdade, `npx electron-builder --win --publish never` precisa rodar no Windows (o workflow usa `windows-latest` justamente para não depender de wine).

## As variáveis de ambiente

`APP_API_BASE_URL` e `APP_WS_BASE_URL`, lidas por `buildTimeConstants(mode)` em `build-config.ts` e injetadas como `__API_BASE_URL__`/`__WS_BASE_URL__` nos **três** bundles via `define`.

- O mecanismo é `define`, e não o suporte nativo do electron-vite, porque o nativo usa prefixo por processo (`MAIN_VITE_`, `RENDERER_VITE_`) e `src/constants/constants.ts` é importado pelo main **e** pelo renderer — forçaria dois nomes para o mesmo valor
- Falta de variável **falha o build** com a mensagem que nomeia qual e onde defini-la. Não troque isso por default silencioso
- `vitest.config.ts` importa o mesmo `buildTimeConstants`, com `'development'`, para os dois nunca divergirem
- **Variável nova** entra em: `.env.development`, `.env.production`, `.env.example`, `REQUIRED_ENV` e o retorno de `buildTimeConstants`, mais a declaração em `env.d.ts`. Cinco pontos; faltar um dá `undefined` inlinado ou erro de tipo
- `.env.development` e `.env.production` são **versionados**: nunca segredo ali. Os valores são inlinados no bundle e vão dentro do instalador, extraível com `npx asar`. Override de máquina é `.env.local`

## Dependência nova

- **Do renderer**: entra em `devDependencies`. O Vite bundla dentro do JS; o electron-builder não precisa empacotar nada. Consequência a lembrar: `npm audit --omit=dev` **não** reflete o que é distribuído, porque react-router-dom e axios estão em devDependencies e vão dentro do bundle
- **Do main**: se for externalizada (é o default do `externalizeDepsPlugin`), tem de estar em `dependencies` — mesma armadilha do `electron-updater`
- Depois de mexer em `package.json`, rode `npm ci` e **diga no relatório**: o CI roda `npm ci`, que falha se o lockfile não acompanhar

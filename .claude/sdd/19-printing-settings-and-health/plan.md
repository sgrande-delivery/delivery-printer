# Plan — Configuração de impressão e saúde das impressoras no PDV

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#19](https://github.com/sgrande-delivery/delivery-printer/issues/19)
**Branch de trabalho:** `feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15: todas as tasks em sequência, um commit por task e um PR no fim

## Abordagem técnica

Três camadas, nessa ordem:

1. **Saber o que a máquina tem** — canal IPC novo devolvendo `webContents.getPrintersAsync()`. Hoje essa chamada só existe dentro do `onRawPrint`, numa janela criada para imprimir (`src/main/ipc-events/onRawPrint.ts:20`)
2. **Confrontar com o que está cadastrado** — `GET /api/admin/printers` pelo `api` que já existe (`src/renderer/services/api.ts`, com `baseURL`, cookie e `App: admin`), e o cruzamento pelo mesmo critério do `onRawPrint` (`toLowerCase()`)
3. **Deixar corrigir** — `PUT /printers/{id}` e `PUT /printerSettings`, com 403 tratado

Depois, as duas pontas independentes: o teste local (que não depende de nada) e a emissão de `printer:status` (que depende do relay no `delivery-socket-api`).

As telas seguem a skill `add-screen`: componente + CSS Module, screen, rota no `Routes.tsx`, **caminho de navegação** e teste com `expectNoUndefinedClasses`. São as primeiras telas novas desde a saída do boilerplate, então elas também viram o precedente de layout para as próximas.

## Decisões arquiteturais

- **Nada de cadastro local.** Tudo que é configuração vai e vem da API (RN-01). O único estado local possível nesta spec é cache de leitura, e mesmo isso não é necessário num app que fica aberto.
- **O cruzamento nome × device usa exatamente o critério do `onRawPrint`.** Se a tela usasse comparação diferente (trim, acentos, normalização), ela mentiria sobre o que a impressão vai fazer. Qualquer melhora no critério muda os dois juntos.
- **O teste de impressão é local e renderizado aqui** (RN-08), e é a única exceção. O HTML é curto e fica num módulo próprio, para ninguém confundir com layout de comprovante.
- **`printer:status` é emitido pelo renderer**, no `/admin`, pelo mesmo socket autenticado do `printer_ping` — mesma razão da spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1): identidade vem do handshake.
- **A tela de impressoras mostra, mas não conserta sozinha, o fallback da impressora padrão.** Mudar o fallback é mudança de comportamento de impressão em produção (decisão pendente 1).

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Expor as impressoras do Windows ao renderer | [#20](https://github.com/sgrande-delivery/delivery-printer/issues/20) | [20-list-windows-printers-ipc.md](./tasks/20-list-windows-printers-ipc.md) | — | executada |
| 02 | Tela de impressoras conferindo o nome contra o device | [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) | [21-printers-screen-read-only.md](./tasks/21-printers-screen-read-only.md) | 01 | executada |
| 03 | Editar a impressora na API, com 403 tratado | [#22](https://github.com/sgrande-delivery/delivery-printer/issues/22) | [22-printers-screen-write.md](./tasks/22-printers-screen-write.md) | 02 | executada |
| 04 | Tela de configurações de impressão (`printerSettings`) | [#23](https://github.com/sgrande-delivery/delivery-printer/issues/23) | [23-printer-settings-screen.md](./tasks/23-printer-settings-screen.md) | 02 | executada |
| 05 | Imprimir teste local | [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24) | [24-local-test-print.md](./tasks/24-local-test-print.md) | 01 | pendente |
| 06 | Emitir `printer:status` por impressora | [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) | [25-emit-printer-status.md](./tasks/25-emit-printer-status.md) | 01 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03 → 04 → 05 → 06.

A 01 é base de três outras. A 02 entrega valor sozinha (diagnóstico) e cria o layout que a 03 e a 04 reusam. A 05 poderia vir mais cedo, mas depois da 02 ela já nasce com a lista de impressoras na tela. A **06 é a última porque está bloqueada por outro repo** — se o relay não estiver publicado quando chegar a vez, ela fica `⛔ bloqueada` e a spec fecha sem ela.

## Dependências de outros repos

| O quê | Onde | Efeito se não existir |
| --- | --- | --- |
| Relay de `printer:status` no namespace `/admin` | [sgrande-delivery/delivery-socket-api#50](https://github.com/sgrande-delivery/delivery-socket-api/issues/50) | A task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25) não tem como ser verificada: a emissão sai daqui e não chega a ninguém |
| `POST /printers/{id}/test-print` | [sgrande-delivery/delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205) | O botão de teste **do painel** continua em 404. Não afeta a task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24), que é local |
| Permissões `role:printer` e `role:printer-setting` no usuário que o PDV usa | `delivery-api` (dado, não código) | As telas mostram mensagem de permissão em vez de dados. Vale confirmar com o dev qual usuário os restaurantes usam no printer **antes** da task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) |
| Divergência de `station` (7 na API, 4 no tipo do admin) | `delivery-admin` | Nenhum aqui: esta spec segue a API. Vale issue lá |

## Verificação da entrega

- a 01 e a 05 precisam de **Windows com impressora de verdade**; em Linux a lista vem vazia ou diferente, e isso é o caso de borda que a 01 tem de tratar
- a 02 e a 03 se verificam contra o ambiente de dev da API (`api-dev.sgrande.delivery`, que é o que `.env.development` aponta): criar uma impressora com nome errado no painel, ver a tela acusar, corrigir no PDV e ver o painel refletir
- a 04 se verifica nos dois sentidos, e o critério que importa é `delivery_printer_version` **intacto** depois do `PUT` feito pelo app
- a 06 só se verifica com o relay no ar, e a verificação é o painel, não o nosso log

## Aprendizados que valem para as próximas tasks

Da task 02 (#21), e **esta é a mais caníbal da spec**:

- **`GET /printers` com `rows: 200` responde 422 em TODA chamada.** Medido em `app/Modules/Printer/Request/GetPrintersRequest.php:14,27` (branch `feature/product-engineering-rebased`): `private const array ALLOWED_ROWS = [10, 20, 50, 100];` com `Rule::in(self::ALLOWED_ROWS)`, e `failedValidation` lança `UnprocessableEntityException(422)`. A tela teria nascido com um botão "tentar novamente" que falha para sempre — **e os testes não pegaram, porque mockam o `fetchPrinters`**. É o mesmo padrão de ficção autoconsistente que as specs #11 e #15 registraram três vezes.
- **A correção é mandar MENOS, não mais:** `GetPrintersInput.php:21` faz `isPaginated = isset($payload['page']) || isset($payload['rows'])`, então **omitindo os dois** o `GetPrintersUseCase` chama `searchAll()` e o controller responde um **array puro**, não `{ data, total }`. Sem `rows` não há limite para estourar, nem `total` para ignorar, nem 201ª impressora invisível.
- **Lição de processo, para a #22 e a #23:** a medição funda foi feita no módulo do `printerSettings` (assunto da #23) e **o FormRequest ao lado da rota da própria task passou batido**. Antes de chamar rota do `delivery-api`, ler o **FormRequest dela** — a #22 vai mexer em `PUT /printers/{id}`, cujo `UpdatePrinterRequest` tem `Rule::in` em `station`.
- **O critério de cruzamento virou único, em `src/shared/printerMatch.ts`.** Comentário dizendo "o mesmo critério do `printReceipt`" é prosa, e prosa não obriga os dois lados a mudarem juntos — que é exatamente o que este plan exige. O `printReceipt` do main e o hook do renderer agora chamam a **mesma** função genérica, e ela tem teste próprio (o `printReceipt` nunca teve: é mockado).
- **`PrinterStationEnum` tem SETE casos**, não quatro: `kitchen, bar, pizza, counter, cashier, dessert, sushi` (medido em `core/Printer/Domain/Enums/`). O mapa de tradução com 4 deixaria "dessert" aparecer cru numa UI pt-BR. **`station` fica `string \| null`** mesmo assim: união literal travaria este app num enum de outro repo, e o presenter emite `station?->value`, nulável de verdade.
- **Duas impressoras com o mesmo nome são duas linhas legítimas na tela**, e isso agora tem teste. Dois tickets de estação na mesma impressora física é cadastro válido; o cruzamento pega o primeiro, que é o que a impressão faz. Nada é fundido e nada é escondido.
- **`paper_width` é enum de dois casos (58, 80)** e `copies` é int. Para leitura `number` serve; a #22, que vai **oferecer escolha**, se beneficia de `58 | 80`.
- **A barra de arraste deve subir para o `DefaultLayout`, não ser copiada.** `InsideLoading`, `NoConnection` e a tela de erro renderizam **todas** dentro dele (`ProtectedRoute.tsx:17,26,35`), então um bloco lá paga **três** das quatro telas da dívida registrada e apaga as cópias do `Main` e da `Printers`; só o login, que é `AuthLayout`, precisa da sua. **A #22 e a #23 não devem fazer a terceira e a quarta cópia.**
- **`listPrinters()` devolvendo `[]`** (spooler caído, Linux, dev) pinta **todas** as cadastradas de vermelho com "não encontrada nesta máquina". É defensável, mas é o único estado em que a tela afirma mais do que mediu: com N cadastradas e zero devices, o certo é dizer "não foi possível ler as impressoras deste computador".
- **A dívida do `base/LinkButton` chegou a CINCO call sites** (`.linkLogout`, `.linkLogs`, `.linkRetry` ×2, `.linkBack`).

Para a task 03 (#22) — medido no `delivery-api` **antes** de a task começar, que é a lição de processo da #21:

- **`PUT /printers/{id}` exige `name` E `address` em TODA chamada** (`app/Modules/Printer/Request/UpdatePrinterRequest.php`): as duas são `required`. Trocar só o nome do device **sem mandar o endereço dá 422** — mesma armadilha do `printerSettings`, por outro motivo. A tela tem de mandar o registro completo, partindo do que o `GET` devolveu.
- **`copies` tem `min:1` e `max:3`.** Oferecer 4 cópias na interface é 422 garantido. O seletor tem de parar em 3.
- **`paper_width` é `Rule::in` do `PrinterPaperWidthEnum`**, que tem exatamente dois casos: **58 e 80**. Aqui a união literal `58 | 80` vale, porque é escolha oferecida pela interface, não leitura de valor alheio.
- **`station` é `sometimes, nullable` + `Rule::in`** dos 7 valores do enum. Nulo é válido.
- **EMENDA, medida depois que o texto abaixo induziu a erro: `sometimes` nesta API NÃO significa "preserva" — significa "opcional no request", e aí o DTO aplica o DEFAULT dele.** `core/Printer/Application/DTO/UpdatePrinterInput.php` declara `public bool $activated = true;` (e `station = null`, `paper_width = 80`, `copies = 1`), o `Dto::handleMap` faz `if (!array_key_exists($property, $payload)) return;` — mantendo o default — e o `PrinterRepository::update()` grava **as seis colunas**. Então **`PUT` sem `activated` escreve `activated = true`**: o operador desativava uma impressora pelo toggle, editava o nome dela e **a impressora voltava a ligar sozinha**. O `PUT` tem de carregar **todos** os seis campos, não só os dois `required`. Vale para a #23 numa forma ainda pior: lá as chaves ausentes são **apagadas**.
- **Existe rota dedicada para ativar/desativar: `PATCH /printers/{id}/toggle-active`** — e o `TogglePrinterActiveUseCase` é **o único use case do módulo `Printer` envolvido em `DB::transaction`**. Ativar/desativar deve ir por ela, **não** por `PUT` com `activated`: é atômica e dispensa mandar `name`/`address` junto.
- **As rotas e os papéis** (`app/Modules/Printer/routes/admin-routes.php`), todas sob `assign.guard:admin` + `admin.jwt.auth`:

  | Rota | Papel |
  | --- | --- |
  | `GET/POST /printers`, `GET/PUT /printers/{id}`, `PATCH /printers/{id}/toggle-active` | `role:printer` |
  | `GET/PUT /printerSettings` | **`role:printer-setting`** |

  São **dois papéis diferentes**, então um restaurante pode ter um e não o outro: a tela de impressoras e a de configurações podem dar 403 **independentemente**, e cada uma precisa do seu estado de permissão.

Da task 03 (#22):

- **`PATCH /printers/{id}/toggle-active` NÃO é idempotente:** o use case faz `update(['activated' => DB::raw('NOT activated')])`. Sem guarda de voo, dois cliques voltam ao estado original — e para o operador isso parece "o botão não fez nada", o que convida ao terceiro clique. Os botões têm `toggling` + `disabled`, com teste de duplo clique.
- **O corpo de erro desta API NÃO é o do Laravel.** Medido ponta a ponta: `UpdatePrinterRequest::failedValidation` → `UnprocessableEntityException($msg, 422, $validator->errors()->toArray())` → o terceiro argumento é o `array $detail` do `HttpException` → `toArray()` emite **`{ error, status_code, detail, internal_code }`** → `bootstrap/app.php:135` faz `response()->json($e->toArray(), $status)`, e o `BaseException` ainda tem `render()` próprio devolvendo o mesmo. **Nem `message` nem `errors` existem nesse endpoint**, então ler o formato do Laravel descartava a mensagem que o operador precisava ver.
  - `errors` **não** é ficção: é o formato do handler de `ValidationException` (`bootstrap/app.php:85`), que atende os endpoints que **não** sobrescrevem `failedValidation`. Vale manter como alternativa.
- **Código morto achado de carona:** `src/renderer/services/apiErrorInterceptor.ts:28` testa `data.code === 'login.invalid_credentials'`, mas o `toArray()` emite isso como **`internal_code`** — o `if` nunca é verdadeiro. Hoje é inócuo (o 401 cai no `history.push('/login')` e já se está no login), mas é **task própria com teste**. O `access_token.expired` logo abaixo funciona, porque o handler de `UnauthorizedHttpException` emite `code` literalmente (`bootstrap/app.php:147`).
- **Erro de formulário fica inline; sucesso vai pelo snackbar.** A task pedia os dois pelo `useMessaging()`, e o review aprovou a divisão por mérito: erro de formulário tem de **ficar** ao lado do campo, e o snackbar é mau veículo para isso (o `handleOpen` é instável e rajada deixa só o último legível — Aprendizados #1 e #11). O que não podia era o sucesso ficar **mudo**, e ele estava: o único sinal era a tela piscar.
- **`refresh` (sem `loading`) para refletir mudança, `reload` (com `loading`) para o "tentar novamente".** Esvaziar a tela inteira para atualizar uma linha é flash desnecessário — mas só se pode tirar o flash **depois** de dar sinal próprio ao sucesso, senão o salvamento fica sem retorno nenhum.
- **Teste que renderiza componente pelado e código desenhado em volta disso são coisas diferentes.** A primeira versão evitou o `useMessaging()` com o argumento de que "sem o provider o `handleOpen` seria `undefined`" — verdade **nos testes**, falso na tela real, porque o `MessagingProvider` envolve o `Routes` (`App.tsx:13`). A saída é embrulhar o teste no provider, não desenhar o código em volta da limitação do teste.
- **`base/Select` está ganho para task própria:** o padrão `label + select` se repete **4 vezes dentro de um arquivo**, e o `<select>` do form usa *caption acima* enquanto o `base/TextField` usa *label flutuante* — hoje não aparecem juntos, mas **na #23 vão**, e aí a diferença fica visível.
- **A dívida do `base/LinkButton` chegou a SEIS call sites.**

Da task 05 (#24):

- **`@page { size: Xmm auto; margin: 0 }` não é palpite: é o mecanismo de produção.** Medido na `delivery-api` (`public/css/socket/order/styles.css:29`): o comprovante que imprime em todo restaurante hoje usa exatamente isso, com `box-sizing: border-box` e `max-width` em mm, pelo mesmo `webContents.print({ margins: { marginType: 'none' } })`.
- **O que de fato não se mede daqui é a borda colada no papel.** Drivers térmicos costumam reservar 2–3 mm não imprimíveis, e a `delivery-api` **nunca depende do extremo** (não desenha borda e ainda aplica `padding`). Por isso a moldura do teste é **recuada 2 mm** e a frase deixou de dar veredito ("se aparece inteira, está certa") e passou a dizer o que olhar: **uma página de diagnóstico que acusa a impressora certa é pior que nenhuma**, porque manda o operador perseguir o problema errado. O recuo preserva o sinal do descasamento 58↔80 (a régua corta ou quebra) e remove o falso alarme.
- **`paper_width` é configuração MORTA também do lado da `delivery-api`:** `grep` acha só entidade, DTO, mapper e testes — nenhuma blade e nenhum CSS a leem, e o comprovante é **sempre** montado para 80 mm. Consequência para o suporte: **"o teste saiu certinho a 58 mm" NÃO significa que o comprovante sairá assim.** A página de teste é hoje a única impressão da plataforma que honra 58 mm. Vale issue na `delivery-api`.
- **Lista de exclusão com default perigoso é a forma errada da guarda.** A marcação na API era `kind !== 'board' && !== 'board-billing' && !== 'test'`: o **próximo** `kind` passaria a marcar por omissão, calado. Virou **lista de permissão** derivada do `KIND` do próprio hook — os tipos que levam marcação são, por construção, os que aquele hook enfileira.
- **Um comentário que a própria task invalidou é convite escrito para o erro seguinte.** O `onRawPrint.ts` dizia que "o teste local da tela de impressão quer resposta imediata, não retry" — e o teste local agora é enfileirado. Deixar aquilo lá era instruir a próxima task a desviar da fila. Corrigido no mesmo commit.
- **O canal `rawPrint` ficou sem chamador no renderer** (só preload, main e asserções de `not.toHaveBeenCalled`): todo trabalho de impressão passa pela fila desde a #17, e o teste da #24 foi o último produtor a entrar nela.
- **A dedup da fila é corretamente inerte para trabalho sem `orderUuid`.** Dois cliques geram dois testes, e isso é certo: sem `orderUuid` não há trabalho a deduplicar, e é coerente com o Aprendizado da #17 ("duas impressoras com o mesmo nome são dois trabalhos legítimos"). Diferente da #22, onde a guarda de voo era **de correção** porque `PATCH NOT activated` desfaz o clique anterior.
- **O layout do teste mora em `src/main/`, e não em `src/renderer/services/`, e a razão é a regra.** O que o `CLAUDE.md` proíbe é layout de impressão **no renderer**; uma string de HTML em `src/renderer/services/` fica a um refactor de virar componente, porque é vizinha dos componentes e importável por eles. No main, para virar React precisa atravessar fronteira de processo. (A justificativa original — "o `app.getVersion()` vem sem IPC" — **era falsa**: o renderer já tem a versão, lida do `package.json` no `printer_ping`.)
- **`stationLabel` chega do renderer já traduzido**, e a direção está certa: o mapa é de um enum de outro repo com 7 valores que pode virar 8, e o main não faz i18n de mais nada. Se algum dia o **main** precisar disparar um teste sozinho (item de bandeja), o mapa sobe para `src/shared/`.

Da task 04 (#23) — **e o achado mais grave da spec está aqui**:

- **`GET /api/admin/printerSettings` LÊ A TABELA ERRADA na `delivery-api`.** Medido e conferido linha por linha:

  | | Relação | Model | Tabela |
  | --- | --- | --- | --- |
  | `GET /printerSettings` | `$restaurant->settings` (`FindCurrentRestaurantPrinterSettingsUseCase:19`) | `RestaurantSetting` | **`restaurant_settings`** |
  | `PUT /printerSettings` | — | `PrinterSetting` | **`printer_settings`** |

  A relação certa existe no mesmo model, vinte linhas abaixo (`Restaurant.php:272`, `printerSettings()`), e nenhum dos dois models sobrescreve `$table`, então o Laravel deriva nomes diferentes. **A correção na API é de uma linha.**
  - **Ninguém percebeu porque o `delivery-admin` nunca chama esse `GET`**: ele monta o formulário de `restaurant.printer_settings`, vindo do `/users/me`. Este app seria o primeiro consumidor.
  - **O que isso teria causado:** o `GET` devolve as 32 chaves de configuração geral do restaurante (`pizza_calculate`, `tax_mode`, `delivery_time`…), sobreposição **zero** com as 7 de impressão. A tela mostraria tudo vazio para **todo** restaurante, e o primeiro "Salvar" mandaria as 32 chaves alheias — e como o `PUT` apaga tudo e recria do payload, **as sete linhas reais iriam embora**. `PrintCreatedOrderUseCase:28` e `ShipmentOrderUseCase:32` leem as cópias, e a blade interpola `font_size`/`margin_size`: **o restaurante pararia de imprimir**, e o botão "Baixar agora" do painel apontaria para `v undefined`. A RN-05 invertida.
  - **A fonte certa era a que a própria task indicava:** `useAuth().restaurant.printer_settings`, do `/users/me` — medido: `ShowAdminUserUseCase:44` faz `append('printer_settings')` e o acessor `Restaurant::getPrinterSettingsAttribute()` usa `$this->printerSettings()->get()`, **a relação correta**. É também a mesma fonte do admin, então o suporte fala uma língua só. O `GET` isolado é o único quebrado.
- **Guard de forma não pega semântica errada.** `typeof === 'object'` aprovava as 32 chaves alheias. O porteiro agora exige **ao menos uma das sete chaves conhecidas** e **recusa o salvamento com mensagem** em vez de reconstruir do zero — em duas camadas (a tela não monta o form; o serviço lança antes do `PUT`).
- **"Objeto vazio" NÃO significa "restaurante novo":** `OnCreatedRestaurantUseCase:54-73` semeia as sete chaves no cadastro, então baseline vazio é **evidência de bug**. O teste que dizia "não quebra com objeto vazio" virou "**não salva** sobre baseline vazio" — a versão anterior consagrava a perda de dados como comportamento desejado, mesmo padrão da #17.
- **`max_width` é configuração MORTA:** não existe no formulário do admin, e `grep` na `delivery-api`, no `delivery-admin` e no `delivery-socket-api` só acha o cast, o default `80` do cadastro e a declaração de tipo. **Nenhuma blade e nenhum use case a leem.** Saiu da edição e continua **preservada** no payload — que é o que a RN-05 pede.
- **Os limites numéricos não eram opcionais, porque o servidor não é rede nenhuma** (sem FormRequest, coluna `string(255)` sem `CHECK`). `copies: 0` chega ao `webContents.print` e **nenhum comprovante sai**; `font-size: 0px` na blade dá comprovante em branco. A saída foi espelhar os **conjuntos fechados do admin** com o `base/Select` — o que matou de uma vez a validação inventada, a mensagem global de erro ("o operador não sabia qual campo recusou") e a divergência com o painel. Os rótulos de `margin_size` foram conferidos no painel: `1` é "0px", os demais "NNpx".
- **Valor fora do conjunto aparece como opção extra**, para abrir a tela não reescrever o que já estava gravado.
- **Depois de salvar, a sessão tem de ser atualizada.** Sem `setPrinterSettings` no `providers/auth.tsx`, voltar à tela releria o `printer_settings` **velho** do `/users/me`, e um segundo "Salvar" mesclaria sobre o baseline antigo **desfazendo o primeiro**.
- **`base/Select` criado**, no idioma do `base/TextField` (label via `useId` + `htmlFor`, `<select>` antes do `<label>` para o seletor irmão `:focus ~ .label`). A label fica **sempre** flutuada, porque um `<select>` sempre exibe uma opção e não há `:placeholder-shown` a seguir — é exatamente o estado em que o `TextField` fica quando tem valor. **E ganhou o teste de ordem que o comentário do `TextField` sempre quis ter.** O `PrinterForm` da #22 migrou, e o `.select` saiu do CSS dele.
- **Consequência aceita e visível:** `/printer-settings` **não tem região de arraste**, então a janela não se move nessa tela — enquanto `/printers` move, porque a #21 copiou a barra antes de a decisão ser tomada. São **cinco** telas sem arraste, e duas telas irmãs da mesma spec se comportam diferente. É o preço de não fazer a quarta cópia, e reforça a task de subir a barra para o `DefaultLayout`.
- **O ramo de 422 é contrato defensivo, não comportamento observado:** essa rota não tem validação nenhuma, e o nome do teste passou a dizer isso.
- **A dívida do `base/LinkButton` chegou a SETE call sites.**

Para a task 04 (#23) — medido no `delivery-api` antes de a task começar:

- **MEDIDO no `delivery-api`, e é pior do que a RN-05 diz: o `PUT /printerSettings` não "substitui o objeto", ele APAGA TODAS as linhas do restaurante e recria uma por chave do payload** (`core/Printer/Application/UpdatePrinterSettingsUseCase.php`):

  ```php
  $this->repository->deleteByRestaurantId($restaurant->id);
  foreach (array_keys($payload) as $key) { $this->repository->create([...]); }
  ```

  As configurações são **linhas chave/valor**, não um JSON. Consequências para a task 04 (#23):
  - **Mandar objeto parcial destrói toda chave não enviada** — não só o `delivery_printer_version`. A regra correta é mais forte que a RN-05: **ler o objeto inteiro, mesclar só o campo alterado e devolver tudo**, preservando **até chave que este app nunca ouviu falar** (o admin pode acrescentar uma amanhã).
  - **Não há validação nenhuma:** o controller faz `$request->json()->all()` e passa direto ao use case, sem FormRequest. Chave com nome errado é aceita e gravada **em silêncio**, sem erro — então a tela não pode contar com a API para recusar payload malformado.
  - **O delete+create NÃO está em transação** (medido: a única `DB::transaction` do módulo `Printer` está no `TogglePrinterActiveUseCase`). Se o laço de `create` falhar no meio, o restaurante fica com as configurações **parcialmente apagadas**, sem rollback. É risco do outro repo, mas quem dispara o `PUT` é este app — **vale issue na `delivery-api`**.
- **A lista fechada de chaves de `printerSettings`**, medida em `core/Printer/Application/GetPrinterSettingsUseCase.php` (o mapa de `casts`): `font_size` (int), `shipment_template_copies` (int), `production_template_copies` (int), `no_margin` (bool), `max_width` (int), **`delivery_printer_version` (string)** e `margin_size` (int). São **sete**. O `delivery_printer_version` é o que o `delivery-admin` lê para o link de download — perdê-lo quebra o botão de baixar o instalador no painel.


Da task 01 (#20):

- **`Electron.PrinterInfo` no Electron 43 tem QUATRO campos, e `isDefault` não é um deles.** Medido em `node_modules/electron/electron.d.ts:11246`: `description`, `displayName`, `name`, `options` — e `options` é declarado como `interface Options {}`, **vazia**, então os typings não dizem nada sobre o conteúdo. A única ocorrência de `isDefault*` em todo o arquivo é `isDefaultProtocolClient`, sem relação.
  - **Consequência para a task 02 (#21):** não dá para prometer na tela "esta é a impressora padrão" com base em tipo. O handler lê `isDefault` por narrowing (`'isDefault' in printer && printer.isDefault === true`) e cai para `false` quando o campo falta — então, se o Electron 43 não o preencher no Windows, a tela simplesmente **não** destaca a padrão, em vez de mentir. **Medir no Windows antes de a tela depender disso.**
  - **Consequência para a task 06 (#25):** `status` **não** está declarado, então não dá para contar com ele para dizer se a impressora está online. O que sobra é o que a própria task #25 já previa: presença do device na lista, e falha de impressão. O `no_paper`/`overheat` continuam fora.
- **`event.sender` dispensa criar janela.** O handler usa o `webContents` de quem chamou (a janela principal), em vez de uma `BrowserWindow` invisível como o `onRawPrint` faz para imprimir: listar impressoras não precisa de página. Isso também evita mover o registro dos handlers para dentro do `boot` — eles ficam no nível do módulo, que é o mais cedo possível.
- **Nada de dedupe na lista.** `printers.name` não tem índice único (medido na #17), então dois itens com o mesmo nome continuam dois itens — e é isso que a tela da #21 tem de mostrar, porque é exatamente o caso em que a impressão cai na padrão sem ninguém perceber.
- **O canal nunca rejeita:** spooler caído devolve `[]` e loga. A tela de impressão não pode quebrar porque o serviço de impressão do Windows engasgou, e `[]` é o contrato de "nada a mostrar" — que também cobre Linux e dev.



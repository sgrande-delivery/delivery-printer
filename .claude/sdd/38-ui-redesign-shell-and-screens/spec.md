# Spec — Redesenhar a interface do app segundo o Claude Design

**Status:** entregue
**Criada em:** 2026-10-28
**Escopo:** main+renderer
**Issue:** [#38](https://github.com/sgrande-delivery/delivery-printer/issues/38)

## Contexto

A interface é a parte mais datada da plataforma. O app autenticado é **uma tela**: logo do restaurante, nome, estado da loja, a lista dos comprovantes que falharam, o usuário e, no pé, quatro links em minúsculas (`Status.tsx:107-115`) — é por eles, e só por eles, que se chega às telas de impressoras e de configurações. Não existe componente de navegação, não existe tema escuro, e a paleta ainda é a que o Material-UI v4 resolvia em runtime, transcrita em `app.css` para a aparência não mudar na saída do boilerplate.

Por baixo, porém, o app já tem o que uma interface decente mostraria: fila durável com retry e dedup (`src/main/queue/`), configurações de impressão da `delivery-api` (`/printerSettings`), conferência do nome cadastrado contra o device do Windows (`shared/printerMatch.ts`) e teste de impressão local (`PrinterItem.tsx:72`). O que falta é a tela.

O projeto no Claude Design (`Delivery Printer v2.dc.html`) desenha o app inteiro: shell com sidebar de seis destinos, paleta nova (Laranja SGrande / Grafite / Papel), tema claro e escuro, login em duas etapas com painel de marca, as três telas de estado e o toast. Esta spec implementa esse desenho.

**Duas falhas que o desenho torna estruturais, e que esta frente conserta de passagem:**

1. **O app para de escutar impressão quando o operador navega.** `useAdminSocketEvents`, `useAdminSocket`, `usePrintingOrder` e `usePrintingBoard` são montados em `Main.tsx:15-20`, que só renderiza na rota `/`. Ir a `/printers` desmonta o `Main`, e o cleanup de `useOrderSocket` chama `store.disconnect()` (`useOrderSocket.ts:18`) — então, enquanto a tela de impressoras ou de configurações está aberta, `printOrder` e `printShipment` não chegam a ninguém e o painel deixa de receber o `printer_ping`.
2. **O logo do login vem de URL remota** (`https://admin.sgrande.delivery/logo192.png`, `Login.tsx:84`): sem internet, a tela de login aparece sem logo. É dívida conhecida, e o desenho exige dois ativos de marca novos de qualquer forma.

## Objetivo

O app passa a ter a interface do desenho: um shell com navegação permanente, paleta e tema novos, e seis telas que mostram o que o app já sabe — o que está imprimindo, o que está na fila, o que foi impresso hoje, como estão as impressoras, como está configurado e como testar. Impressão e socket deixam de depender da tela aberta.

## Fidelidade ao desenho

**O desenho é a referência literal** (RN-15): medida, cor, raio, peso de fonte, ordem dos elementos, ícone e texto saem do desenho, não de interpretação. Quando a task diz "como no desenho", é para abrir o arquivo e copiar o valor.

O desenho está **congelado no repo**, em [`design/printer-v2.dc.html`](./design/printer-v2.dc.html), com [como lê-lo](./design/README.md) ao lado — as tasks citam linha dele. A cópia existe porque fidelidade que depende de acesso ao Claude Design não é verificável no review.

São **doze** linhas: os cinco pontos previstos na escrita da spec, cinco que a execução mediu, e **uma que a execução provou errada** (a 4), mantida riscada porque correção de premissa é o registro mais útil que esta tabela carrega. Fora desta lista, divergência é defeito:

| # | O desenho | O que vale aqui | Por quê |
|---|-----------|-----------------|---------|
| 1 | `<link>` para a fonte Material Symbols no Google Fonts | A mesma fonte, **empacotada** em `src/renderer/` e servida por `@font-face` local | RN-01: o PDV pode estar sem internet justamente quando precisa imprimir. A fonte local dá paridade exata de glifo; o `react-icons` não tem `stacks` nem `skillet` |
| 2 | Quatro setores: Cozinha, Bar, Caixa, **Expedição** | Os **sete** de `stations.ts` — `kitchen`, `bar`, `pizza`, `counter`, `cashier`, `dessert`, `sushi`. "Expedição" **não é** setor na `delivery-api` | O chip de setor grava na API: oferecer valor que o enum não tem é erro de gravação, e esconder cinco setores existentes é pior que divergir do mock |
| 3 | "Seja bem-vinda, Maria" na etapa da senha | Saudação neutra com o nome | RN-12: o app recebe `user.name` e não sabe de quem se trata |
| 4 | ~~Bobina como alternador de 58 / 80 mm~~ — **não era divergência** | O alternador, com **58 e 80 e nada mais** | **Esta linha estava errada, e a execução a corrigiu em 2026-10-28.** A spec afirmava que `paper_width` é número livre e que o alternador reescreveria uma bobina de 76 mm em silêncio. Medido na `delivery-api`: `UpdatePrinterRequest.php:29` valida com `Rule::in(PrinterPaperWidthEnum)` (**só 58 e 80**) e a tabela tem `CHECK (paper_width IN (58, 80))`. Terceira largura **não pode existir nem ser salva** — o chip extra era código morto, e o tipo de escrita voltou a `58 \| 80` |
| 5 | Dados do mock: Pizzaria Bella Massa, Maria Souza, `87` impressos, `v2.7.0 · x64`, `28/10/2026` | Os dados reais do app | O mock é ilustração. A **forma** (`87`, `1/5`, `15:41`, `2 cópia(s)`) é que se copia |
| 6 | Faixas e unidades dos controles de configuração: fonte `9–18`, cópias `1–5`, margem `0–10 **mm**`, largura `48–80 mm` | A **forma** do desenho (menos/valor/mais, interruptor) com os **conjuntos fechados do painel administrativo**: fonte `12–24`, cópias `1–4`, margem em **px** (e o `1` que o painel mostra como "0px") | Confirmado na fonte em 2026-10-28: o `PUT /printerSettings` **não tem `FormRequest`** (`$request->json()->all()`) e a migração define `value` como string nullable sem `CHECK` — **a API não valida nada**, então o conjunto fechado da tela é a única proteção contra fonte 0 e 0 cópias. Margem em mm num campo que o servidor trata como px chega ao comprovante impresso, e fonte 9 é um comprovante que o cliente não lê |
| 7 | Seis filtros de tipo no Histórico (`:231-235`) | **Sete**: os seis mais **Teste** | A fila tem o kind `test` (a task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24) o enfileira) e o mock não tinha. Esconder a página de teste do histórico deixaria o operador sem explicação para uma linha que ele mandou imprimir |
| 8 | O botão **Reimprimir** em toda linha do histórico (`:249`) | Só nas linhas que ainda têm o HTML; nas outras, um espaço com `title` explicando que apenas os 20 comprovantes mais recentes podem ser reimpressos | O store mantém o HTML dos 20 impressos mais novos e apaga o resto (RN-09). Botão que imprime página em branco é pior que botão ausente |
| 9 | Conteúdo da página de teste: "Máquina: PDV-CAIXA-01", "Acentos: ÁÉÍÓÚ…", "SE VOCÊ LÊ ISTO, ESTÁ OK" | A pré-visualização espelha a página real (`src/main/testPrintPage.ts:59-68`: Cadastro, Setor, Impressora, Papel, Data, Versão, moldura e régua) — e a linha de acentos do desenho é **boa**, então entra **na página real**, não só na pré-visualização | Pré-visualização que mostra uma página diferente da que sai é a única coisa pior que não ter pré-visualização. A moldura e a régua ficam: elas existem para medir se a largura configurada é a do papel |
| 10 | Sem botão de teste no cartão da impressora | O botão de ícone fica (decisão pendente 2, **resolvida**: os dois caminhos ficam) | A tela de teste é o caminho completo; o botão no cartão é o caminho curto de quem já está corrigindo aquela impressora, e é anterior a esta spec |
| 11 | O botão `close` do cabeçalho da gaveta de edição fica a 12 px da borda direita (`:390`), e o painel nasce no topo da janela | O mesmo cabeçalho de 56 px, com **152 px de respiro à direita** (o do cabeçalho do shell), e o `close` ao lado do título | Sob os 12 px do desenho ficam os três botões nativos da janela (`titleBarOverlay`, RN-04): o `close` não receberia clique nenhum. O véu e o painel são `no-drag`, senão o arraste da janela engole o clique no topo |
| 12 | Preenchimento do papel da pré-visualização: `10 + margem*2` px acima e `4 + margem*3` px nos lados (`:741`), com a margem em **mm** | `margem × 0,85` px no topo e nos lados, com **22 px fixos embaixo** (o `padding-bottom` do desenho, `:741`) (a margem é px e o comprovante real põe `padding: Npx` igual nos quatro), e `10px 4px` em "Sem margem", como o desenho | A fórmula do desenho é para 0–10 mm; com os valores reais (10–40 px) estouraria os 256 px do papel. 0,85 é 3,2 px/mm do desenho sobre os ~3,78 px/mm do CSS: mantém a proporção com a largura. É ilustração (RN-07). **O 22 px de baixo é do desenho e não escala — não "consertar" para 0,85** |
| 13 | O interruptor **"Sem margem"** (`:316-320`), com a pré-visualização reagindo a ele | Fica **como o desenho**, inclusive a pré-visualização reagindo | Medido em 2026-10-28 na `delivery-api`: `no_margin` tem **três ocorrências, todas de escrita** (semeia no cadastro, cast na leitura, seeder) e **nenhum leitor de renderização** — os Blades que este app imprime (`resources/views/socket/{order,board/billing}/layout/base.blade.php:9-10`) leem só `font_size` e `margin_size`. Ou seja: **hoje o interruptor não muda o papel que sai desta impressora**; ele muda a impressão feita pelo painel, que lê a chave no `OrderPrintSheet`. A decisão do dev foi manter o controle e consertar na API — [delivery-api#1378](https://github.com/sgrande-delivery/delivery-api/issues/1378), com spec em `.claude/sdd/1378-socket-print-honours-margin-settings/`. Quando aquela spec subir, o interruptor **passa a funcionar sozinho**, sem release deste app |
| 14 | O "Salvar" da barra de alterações tem `padding: 0 16px` (`:341`) | 14 px, o mesmo do botão de 34 px do cartão de impressora | O desenho dá ao **mesmo** botão de 34 px paddings diferentes em duas telas (`:270` = `0 14px`, `:341` = `0 16px`). **Decidido na task 12: a linha fica.** A escala do `Button` virou a tabela `METRICS` por altura (raio, fonte, padding e peso, por variante) dentro do primitivo, e uma tabela por altura guarda um padding por variante, não um por tela. Expressar o 16 pediria uma prop de padding, e é exatamente o override no consumidor que a tabela existe para impedir; são 2 px sem efeito funcional. Reabre se o desenho ganhar mais casos assim |
| 15 | O `--muted` do tema claro é `#857a74` (`:13`) | `#756a64` — **só no tema claro** | O valor do desenho dá **3,91:1** sobre `--bg`, abaixo dos 4,5:1 da WCAG AA, e é o token de todo rótulo de seção, dica e tag, em 12–13 px. `#756a64` fecha AA nos três fundos do app (4,92 sobre `--bg`, 5,25 sobre `--surface`, 4,60 sobre `--surface-2`). **Decidido pelo dev na task 12.** O tema escuro fica como o desenho, porque lá o token já dá 5,06:1 — a divergência é de um tema só |

## Requisitos funcionais

- **RF-01** — Toda tela autenticada aparece dentro de um shell com sidebar fixa de seis destinos (Painel, Fila, Histórico, Impressoras, Configurações, Teste de impressão) e cabeçalho com o título da tela e o indicador de conexão. A sidebar mostra conexão, estado da loja, usuário com logout, versão com arquitetura e o acesso aos registros.
- **RF-02** — Os hooks de socket e de impressão permanecem montados em qualquer tela do shell: navegar não derruba socket nem perde evento.
- **RF-03** — A sidebar sinaliza no item **Fila** quantos trabalhos estão pendentes ou falhados, e no item **Impressoras** quantos cadastros não foram encontrados nesta máquina.
- **RF-04** — O app usa a paleta nova e segue o tema do Windows, reagindo à troca em runtime; a tela de Configurações permite fixar claro ou escuro, e a escolha sobrevive ao restart **desta instalação**.
- **RF-05** — O login tem duas etapas em layout de duas colunas, com a marca servida do próprio pacote, e volta da senha para o e-mail sem perder o endereço digitado.
- **RF-06** — As telas de carregando, sem conexão e erro, e o toast, seguem o desenho. A de sem conexão diz que a sessão continua válida, mostra o endereço consultado e oferece nova tentativa.
- **RF-07** — O Painel mostra o estado num único bloco grande — imprimindo normalmente, impressora não encontrada ou impressão falhada —, a ação que resolve cada caso, os três números do dia (impressos, na fila, falharam) e as impressoras com o resultado da conferência.
- **RF-08** — A tela de Fila lista pendentes e falhados em abas, com tentativas, situação, descartar e tentar de novo, e estado vazio próprio de cada aba.
- **RF-09** — A tela de Histórico lista os comprovantes impressos no dia, com busca por pedido, filtro por tipo, cópias, situação e reimpressão.
- **RF-10** — A tela de Impressoras mostra cada cadastro como cartão com o resultado da conferência contra o Windows, edita numa gaveta lateral e lista as impressoras instaladas na máquina.
- **RF-11** — A tela de Configurações usa controles de incremento e interruptor, mostra uma pré-visualização que reage aos valores, e só grava quando o operador confirma — com barra de alterações não salvas.
- **RF-12** — O teste de impressão tem tela própria: escolha da impressora, pré-visualização da página de teste e retorno do envio.

## Regras de negócio

- **RN-01** — **Nada visual vem da internet.** Ícone, logo e imagem moram no pacote. O desenho carrega a fonte Material Symbols pelo Google Fonts e essa linha não atravessa: o PDV pode estar sem internet exatamente quando precisa imprimir, e é esse o defeito do logo do login hoje. Recurso remoto novo é reprovado no review.
- **RN-02** — **O tema é preferência da instalação, não do restaurante.** Mora em arquivo sob `app.getPath('userData')`. `.env` é build-time, igual para todo restaurante e inlinado no instalador; e `printerSettings` da `delivery-api` vale para o restaurante inteiro e aparece no painel administrativo — gravar tema lá mudaria a tela de outra pessoa.
- **RN-03** — **Canal IPC é par:** o mesmo nome literal no `preload.ts` e no `ipcMain.handle`, mais a entrada no stub de `src/__tests__/setup.ts`. Nome divergente não dá erro: `ipcRenderer.invoke` sem handler devolve promessa rejeitada, e todo chamador de hoje a engole.
- **RN-04** — **A cor dos três botões nativos da janela não é CSS.** Ela é o `titleBarOverlay`, configurado no main (`window.ts:26-30`). Trocar o tema no renderer sem avisar o main deixa os botões do Windows ilegíveis sobre o fundo novo — e o cabeçalho do desenho reserva 152 px à direita justamente para eles.
- **RN-05** — **O renderer não tem Node.** Toda capacidade de sistema passa por canal declarado no preload. Nenhum typecheck deste repo impede `import fs` no renderer; quem impede é o review.
- **RN-06** — **O shell é o único dono dos hooks de socket.** Os `SocketStore` são singletons de módulo e o cleanup de `useOrderSocket`/`useAdminSocket`/`useBoardSocket` chama `store.disconnect()`: dois componentes no mesmo namespace fazem o desmonte de um derrubar o socket do outro. Tela nenhuma monta esses hooks por conta própria. E todo `socket?.on` dentro de `useEffect` continua com o `off` do mesmo evento no retorno — sem isso, cada remontagem empilha um listener e o mesmo comprovante sai duas, três vezes.
- **RN-07** — **O comprovante continua sendo renderizado pela `delivery-api`.** As pré-visualizações das telas de Configurações e de Teste são ilustrações do efeito dos valores, não o comprovante real: nenhuma delas busca HTML na API nem tenta reproduzi-lo. Quem aplica fonte, margem e largura no comprovante é o servidor.
- **RN-08** — **"Hoje" é o que a fila ainda guarda.** O histórico e o número de impressos saem da fila durável, que mantém no máximo 200 trabalhos e descarta o que passa de 24 h (`print-queue-store.ts:13-14`). A tela filtra por `createdAt` desde a meia-noite local e **não** oferece dia anterior — prometer histórico que o arquivo não tem é pior que não ter a tela.
- **RN-09** — **Reimprimir é re-enfileirar o trabalho que já está na fila, pelo `id`**, e o HTML fica no main: o `PrintJobSummary` não carrega `payload`, de propósito. O renderer **não** busca o HTML de novo na `delivery-api` — pedido já marcado como impresso voltaria a depender da rota, e a varredura `GET /orders/print/list` não o traz mais.

  **Correção medida em 2026-10-28, depois de a spec ser escrita:** a primeira versão desta RN afirmava que a fila guarda os impressos "com o HTML no payload". **É falso** — `markPrinted` apagava o conteúdo de propósito (`print-queue-store.ts:191`, com teste), decisão da spec 15, porque o HTML é a parte pesada do arquivo. Seguir a RN ao pé da letra faria "Reimprimir" devolver `content: ''` à fila, e **o worker imprimiria uma página em branco e a marcaria como impressa**.

  **A regra que vale:** o store mantém o HTML dos **`KEEP_PRINTED_HTML` impressos mais recentes** (20) e apaga o dos demais. Reimprimir funciona na janela em que ele é usado de verdade — comprovante rasgado, papel que acabou, cozinha que perdeu —, que é de minutos, não de horas. E o que a tela mostra não é adivinhação: o summary carrega `reprintable`, e a linha sem HTML **não oferece o botão**, em vez de oferecer um que imprime em branco.

  **Consequência de privacidade, declarada:** comparado a guardar os 200, isto limita; comparado ao que havia **antes desta spec**, a janela **aumenta** — até 20 comprovantes passam a ter o HTML em disco por até 24 h, onde antes era apagado na hora da impressão.
- **RN-10** — **Chave de CSS Module digitada errada não dá erro:** `styles.contianer` é `undefined` e o estilo desaparece calado. Componente novo com estilo entra num teste que chama `expectNoUndefinedClasses()` (`src/renderer/__tests__/cssModules.ts`).
- **RN-11** — **Não entra biblioteca de UI, CSS-in-JS nem lib de estado.** A remoção de MUI e Redux levou o bundle de 924 kB para 518 kB. Cor nova é token em `:root`, não hex solto no módulo; variante nova de primitivo entra no primitivo.
- **RN-12** — **Saudação não infere gênero do nome.** O desenho escreve "Seja bem-vinda, Maria" porque o exemplo é uma mulher; o app recebe `user.name` e não sabe de quem se trata. O texto é neutro.
- **RN-13** — **A janela é arrastada pelo `-webkit-app-region: drag`** (hoje em `Main.module.css:11`, porque a janela usa `titleBarStyle: 'hidden'`). O shell mantém região arrastável no topo da sidebar e do cabeçalho, e todo botão dentro dela declara `-webkit-app-region: no-drag` — senão o clique vira arrasto e o botão não responde.
- **RN-14** — Texto visível é **pt-BR**; arquivo, componente, variável, classe CSS e commit são em **inglês**.
- **RN-15** — **O desenho é a referência literal, não inspiração.** Valor de medida, cor, raio, peso, espaçamento, ícone, ordem e texto vêm de `Delivery Printer v2.dc.html`. Só as divergências listadas em "Fidelidade ao desenho" são permitidas, e nenhuma outra entra sem virar linha naquela tabela — "ficou parecido" não é o critério, e aproximação acumulada em doze tasks não devolve o desenho no fim.

## Fora do escopo

- **Renderizar layout de comprovante aqui.** O HTML vem da `delivery-api`; `printing-layouts/` foi removido por estar morto.
- **Versão, branch, build ou flag v2 deste app**, e o campo `removed_ingredients_line` da rota v2 — o contrato deste app é agnóstico de versão.
- **Emitir `printer:status` por impressora** (task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25), bloqueada por `delivery-socket-api#50`). O indicador por impressora nas telas é a conferência **local** contra o device do Windows, que já existe.
- **Histórico além do que a fila guarda:** nada de banco, de arquivo de histórico próprio ou de rota nova na API para buscar impressões antigas.
- **Mudar o tamanho da janela.** O desenho é 1024×728, igual ao que `window.ts:18-19` já cria.
- **Bandeja e notificação nativa.** O menu da tray e a `Notification` do Windows não mudam de aparência nesta frente.
- **Tradução.** Um idioma, pt-BR, como hoje.
- **Assinatura do instalador** e qualquer coisa de empacotamento — é a spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26).

## Critérios de aceitação

- [ ] Em `npm run dev`, as seis telas são alcançáveis pela sidebar, cada uma com o título no cabeçalho, e o item ativo é visível.
- [ ] Com o app na tela de Impressoras, um `printOrder` emitido no socket ainda imprime, e o painel continua vendo o `printer_ping`.
- [ ] Trocar o tema do Windows entre claro e escuro muda o app **sem reiniciar**, inclusive a cor dos três botões nativos da janela; fixar claro ou escuro nas Configurações sobrevive a fechar e reabrir o app.
- [ ] Nenhuma requisição de rede sai do renderer para buscar fonte, ícone ou imagem: com a máquina sem internet, login e shell aparecem completos.
- [ ] Um comprovante que falhou cinco vezes aparece na aba Falhados com a causa, e "Tentar de novo" o devolve para Pendentes; "Descartar" o remove e ele não volta.
- [ ] Um comprovante impresso hoje aparece no Histórico e "Reimprimir" o imprime de novo sem pedir nada à `delivery-api`.
- [ ] Corrigir o nome de uma impressora pela gaveta grava na API e o cartão deixa de acusar "não encontrada".
- [ ] `npm run typecheck`, `npm run lint` e `npm test` saem como o baseline (0 erros; o aviso pré-existente em `Login.tsx` pode desaparecer com o redesenho, não pode aumentar).
- [ ] Todo componente novo com estilo tem teste chamando `expectNoUndefinedClasses()`.
- [ ] **Fidelidade:** cada tela entregue é comparada com a do desenho (`design/printer-v2.dc.html`, e o link do Claude Design para ver renderizado) lado a lado em `npm run dev`. Divergência encontrada é corrigida ou entra na tabela de "Fidelidade ao desenho" com o motivo — não fica calada.

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | O desenho mostra "Nova tentativa em 18 s" na fila, e esse instante hoje vive só em memória no worker (`print-queue-worker.ts:65`, `nextAttemptAt`) | Expor `nextAttemptAt` opcional no `PrintJobSummary`, preenchido pelo worker. Se o acoplamento entre o handler de `queueState` e o worker não se pagar, a linha vira "aguardando nova tentativa", sem contagem — o que a tela não pode fazer é inventar o segundo |
| 2 | ~~O botão de teste dentro do `PrinterItem`~~ — **resolvida na task 09:** os dois caminhos ficam, e a linha 10 da tabela de fidelidade registra | — |
| 3 | A tela de sem conexão do desenho mostra "nova tentativa em 12 s", e hoje não há retry automático — só o botão | Implementar o retry automático a cada **12 s**, o valor do desenho, com a contagem visível: a tela sem retry exige alguém na frente do PDV para o app voltar a imprimir |
| 4 | O desenho põe "Loja aberta" na sidebar, ao lado da conexão | Manter, lendo o `restaurant.is_open` que o `AuthProvider` já tem e o `handleRestaurantState` já atualiza — é informação que o operador do balcão usa, e não custa requisição nova |
| 5 | ~~O desenho edita **`max_width`**~~ — **resolvida na task 10: a linha sai da tela** | Medido em 2026-10-28: o painel (`delivery-admin`, `pages/printer-settings/PrinterSettingsForm.tsx`) **não** edita `max_width`; só o lê, em mm, no `OrderPrintSheet` (impressão pelo navegador). E o HTML que este app imprime (`resources/views/socket/*/layout/base.blade.php`, `delivery-api`) lê só `font_size` e `margin_size`. A tela mostra o valor salvo na largura da pré-visualização (80 mm se faltar), sem controle | — |
| 6 | ~~O `--muted` do tema claro dá 3,91:1~~ — **resolvida na task 12: escurecido para `#756a64`** | Decisão do dev. Fecha AA nos três fundos (4,92 / 5,25 / 4,60); o tema escuro fica como o desenho (5,06:1). Virou a **linha 15** da tabela de fidelidade | — |
| 7 | ~~14 px contra os 16 px do desenho~~ — **resolvida na task 12: fica em 14 px** | Decisão do dev. É o valor do desenho, e todas as medidas das oito telas foram conferidas contra ele; subir para `1rem` refluiria as oito e pediria nova passada visual em cada uma. Se vier a subir, é task própria, não limpeza |

# Spec — Redesenhar a interface do app segundo o Claude Design

**Status:** rascunho
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

Há exatamente **cinco** pontos em que o desenho não pode ser seguido ao pé da letra. Fora desta lista, divergência é defeito:

| # | O desenho | O que vale aqui | Por quê |
|---|-----------|-----------------|---------|
| 1 | `<link>` para a fonte Material Symbols no Google Fonts | A mesma fonte, **empacotada** em `src/renderer/` e servida por `@font-face` local | RN-01: o PDV pode estar sem internet justamente quando precisa imprimir. A fonte local dá paridade exata de glifo; o `react-icons` não tem `stacks` nem `skillet` |
| 2 | Quatro setores: Cozinha, Bar, Caixa, **Expedição** | Os **sete** de `stations.ts` — `kitchen`, `bar`, `pizza`, `counter`, `cashier`, `dessert`, `sushi`. "Expedição" **não é** setor na `delivery-api` | O chip de setor grava na API: oferecer valor que o enum não tem é erro de gravação, e esconder cinco setores existentes é pior que divergir do mock |
| 3 | "Seja bem-vinda, Maria" na etapa da senha | Saudação neutra com o nome | RN-12: o app recebe `user.name` e não sabe de quem se trata |
| 4 | Bobina como alternador de **58 / 80 mm** | O alternador, mais um terceiro chip com o valor real quando o cadastro não é 58 nem 80 | `paper_width` é número livre na API; o alternador de dois valores reescreveria em silêncio uma bobina de 76 mm |
| 5 | Dados do mock: Pizzaria Bella Massa, Maria Souza, `87` impressos, `v2.7.0 · x64`, `28/10/2026` | Os dados reais do app | O mock é ilustração. A **forma** (`87`, `1/5`, `15:41`, `2 cópia(s)`) é que se copia |
| 6 | Faixas e unidades dos controles de configuração: fonte `9–18`, cópias `1–5`, margem `0–10 **mm**`, largura `48–80 mm` | A **forma** do desenho (menos/valor/mais, interruptor) com os **conjuntos fechados do painel administrativo**: fonte `12–24`, cópias `1–4`, margem em **px** (e o `1` que o painel mostra como "0px") | `PrinterSettingsForm.tsx:29-42` registra que esses conjuntos são os do painel e que **a API não valida nada**. Margem em mm num campo que o servidor trata como px chega ao comprovante impresso, e fonte 9 é um comprovante que o cliente não lê |
| 7 | Conteúdo da página de teste: "Máquina: PDV-CAIXA-01", "Acentos: ÁÉÍÓÚ…", "SE VOCÊ LÊ ISTO, ESTÁ OK" | A pré-visualização espelha a página real (`src/main/testPrintPage.ts:59-68`: Cadastro, Setor, Impressora, Papel, Data, Versão, moldura e régua) — e a linha de acentos do desenho é **boa**, então entra **na página real**, não só na pré-visualização | Pré-visualização que mostra uma página diferente da que sai é a única coisa pior que não ter pré-visualização. A moldura e a régua ficam: elas existem para medir se a largura configurada é a do papel |

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
- **RN-09** — **Reimprimir é re-enfileirar o trabalho que já está na fila, pelo `id`.** O HTML fica no main: o `PrintJobSummary` não carrega `payload`, de propósito. O renderer não busca o HTML de novo na `delivery-api` — pedido já marcado como impresso voltaria a depender da rota, e a varredura `GET /orders/print/list` não o traz mais.
- **RN-10** — **Chave de CSS Module digitada errada não dá erro:** `styles.contianer` é `undefined` e o estilo desaparece calado. Componente novo com estilo entra num teste que chama `expectNoUndefinedClasses()` (`src/renderer/__tests__/cssModules.ts`).
- **RN-11** — **Não entra biblioteca de UI, CSS-in-JS nem lib de estado.** A remoção de MUI e Redux levou o bundle de 924 kB para 518 kB. Cor nova é token em `:root`, não hex solto no módulo; variante nova de primitivo entra no primitivo.
- **RN-12** — **Saudação não infere gênero do nome.** O desenho escreve "Seja bem-vinda, Maria" porque o exemplo é uma mulher; o app recebe `user.name` e não sabe de quem se trata. O texto é neutro.
- **RN-13** — **A janela é arrastada pelo `-webkit-app-region: drag`** (hoje em `Main.module.css:11`, porque a janela usa `titleBarStyle: 'hidden'`). O shell mantém região arrastável no topo da sidebar e do cabeçalho, e todo botão dentro dela declara `-webkit-app-region: no-drag` — senão o clique vira arrasto e o botão não responde.
- **RN-14** — Texto visível é **pt-BR**; arquivo, componente, variável, classe CSS e commit são em **inglês**.
- **RN-15** — **O desenho é a referência literal, não inspiração.** Valor de medida, cor, raio, peso, espaçamento, ícone, ordem e texto vêm de `Delivery Printer v2.dc.html`. Só as cinco divergências listadas em "Fidelidade ao desenho" são permitidas, e nenhuma outra entra sem virar linha naquela tabela — "ficou parecido" não é o critério, e aproximação acumulada em doze tasks não devolve o desenho no fim.

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
| 2 | O botão de teste dentro do `PrinterItem` (`PrinterItem.tsx:72`), agora que existe tela de teste | Manter os dois: a tela é o caminho completo, e o botão no cartão é o caminho curto de quem já está corrigindo aquela impressora |
| 3 | A tela de sem conexão do desenho mostra "nova tentativa em 12 s", e hoje não há retry automático — só o botão | Implementar o retry automático a cada **12 s**, o valor do desenho, com a contagem visível: a tela sem retry exige alguém na frente do PDV para o app voltar a imprimir |
| 4 | O desenho põe "Loja aberta" na sidebar, ao lado da conexão | Manter, lendo o `restaurant.is_open` que o `AuthProvider` já tem e o `handleRestaurantState` já atualiza — é informação que o operador do balcão usa, e não custa requisição nova |
| 5 | O desenho edita **`max_width`** ("Largura máxima", `48–80 mm`), que a tela de hoje **não** edita — e a unidade real do campo não está escrita em lugar nenhum deste repo | Conferir no `delivery-admin` (`pages/printer-settings/PrinterSettingsForm.tsx`) se o painel o edita e com que conjunto de valores, e seguir o painel — a mesma regra da divergência 6. Se o painel **não** o edita, a linha sai da tela: largura errada é comprovante cortado, e este app não é o lugar de descobrir a unidade por tentativa |

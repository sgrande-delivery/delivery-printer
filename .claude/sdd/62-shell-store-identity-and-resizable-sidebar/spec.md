# Spec — Identidade da loja e sidebar redimensionável no shell

**Status:** entregue
**Criada em:** 2026-11-07
**Escopo:** main+renderer
**Issue:** [#62](https://github.com/sgrande-delivery/delivery-printer/issues/62)

## Contexto

O pé da sidebar é onde o app responde "de quem é esta sessão": a conexão com o servidor, "Loja aberta"/"Loja fechada" e o **usuário** logado, com nome, e-mail, avatar e o botão de sair (`src/renderer/components/layout/Sidebar.tsx:85-110`). Falta ali exatamente a coisa que importa num app que existe para imprimir os pedidos de **uma** loja: **qual loja**. O único lugar do app que usa `restaurant.name` hoje é o papel da pré-visualização da tela de impressão (`PrinterSettingsForm.tsx:165`) — e é informação que o suporte usa para conferir se o PDV está apontado para o lugar certo, antes de procurar defeito em impressora.

O dado já está no `AuthProvider` (`restaurant.name`, e há `logo`/`image`), que o `Sidebar` já consome na mesma linha em que lê `is_open` (`:26`).

**A segunda falta é a largura.** A sidebar é fixa em `216px` (`Sidebar.module.css:3`). O `delivery-admin` deixa a dele ser arrastada e lembra o valor; aqui não há como. Nome de impressora do Windows e nome de setor são longos, e a largura boa depende do monitor do balcão — que num PDV vai de um 15" a um 24" girado.

**O padrão do admin, medido na `feat/admin-v2`** (`src/components/resize-handle/ResizeHandle.tsx`, `src/components/sidebar/SidebarResizeHandle.tsx`, `src/helpers/sidebarWidth.ts`): um punho absoluto na borda direita, `pointer capture`, `Escape` cancelando o arrasto, passo por teclado, um atributo em `document.body` enquanto arrasta, e o valor escrito **numa CSS var** (`--sidebar-width`) durante o movimento — é isso que evita um re-render do shell por pixel. O commit é que persiste. Lá a persistência é `localStorage`; aqui **não pode ser**: o app não usa `localStorage` em lugar nenhum, e preferência por instalação neste repo mora num arquivo sob `app.getPath('userData')`.

**E já existe o arquivo certo.** O tema guarda a preferência em `ui-preferences.json` (`src/main/theme.ts`), cujo comentário diz, literalmente, que ele é um objeto e não a string crua *"porque é o primeiro arquivo de preferência de UI, e a próxima preferência não deve precisar de um segundo"*. Esta é a próxima.

**O que isso cobra, e é a armadilha desta spec:** `writePreference` grava `JSON.stringify({ theme: preference })` — o objeto **inteiro**, com uma chave só. Um gravador de largura escrito no mesmo formato **apaga o tema**, e vice-versa; e a perda só aparece no próximo restart, quando o app volta no tema do sistema sem ninguém ter pedido.

## Objetivo

O operador (e o suporte, por cima do ombro dele) vê em qualquer tela **qual restaurante** este PDV está imprimindo, e pode arrastar a sidebar para a largura que couber no monitor dele — largura que o app lembra na próxima abertura, sem mexer em nada do restaurante.

## Requisitos funcionais

- **RF-01** — O nome do restaurante logado aparece no pé da sidebar, acima do bloco do usuário e junto da linha de "Loja aberta"/"Loja fechada", visível em todas as telas do shell.
- **RF-02** — Nome longo não quebra o layout da sidebar nem empurra o bloco do usuário: ele é truncado, com o nome inteiro disponível no `title`.
- **RF-03** — A sidebar tem um punho na borda direita que arrasta a largura com o mouse, dentro de uma faixa fechada, e o conteúdo (rótulos do menu, status, usuário) acompanha sem cortar texto no mínimo da faixa.
- **RF-04** — A largura escolhida sobrevive a fechar e reabrir o app, por instalação.
- **RF-05** — O punho é operável por teclado (foco visível, setas mudando a largura em passo fixo) e o arrasto pode ser cancelado com `Escape`, voltando à largura de antes.
- **RF-06** — Duplo clique no punho devolve a largura ao padrão.
- **RF-07** — As duas mudanças entram na tabela "Fidelidade ao desenho" da spec [#38](https://github.com/sgrande-delivery/delivery-printer/issues/38), porque o desenho congelado não tem nenhuma das duas.

## Regras de negócio

- **RN-01** — **Gravar uma preferência não pode apagar a outra.** A escrita do `ui-preferences.json` é um `JSON.stringify` do objeto inteiro (`theme.ts`), então salvar largura exige ler-modificar-gravar. *Por quê:* é falha silenciosa e diferida — o operador arrasta a sidebar, fecha o app, e na próxima abertura o tema que ele havia fixado virou "automático". Ninguém liga as duas coisas, e o relato que chega ao suporte é "o app mudou de cor sozinho".
- **RN-02** — **Canal IPC é par, nos dois lados, e o nome mora em `src/shared/ipcChannels.ts`.** *Por quê:* canal declarado só no preload devolve promessa que rejeita e todo chamador engole; só no main, fica calado para sempre. Foi o bug do `receive-order`/`notification` na saída do ERB. Canal novo são **quatro** pontos: a constante, a linha do preload, o `ipcMain.handle` e o stub do `src/__tests__/setup.ts` — sem o quarto, o componente quebra sob jsdom com `undefined is not a function`.
- **RN-03** — **A largura é preferência por instalação, não configuração do restaurante.** Ela nunca vai para a `delivery-api` e nunca sai no `printer_ping`. *Por quê:* é propriedade do monitor daquele balcão, e dois PDVs da mesma loja podem querer larguras diferentes. É também por isso que não é `.env`: aquilo é build-time e igual para todo restaurante.
- **RN-04** — **O arrasto escreve CSS var, não estado de React.** *Por quê:* um `setState` por `pointermove` re-renderiza o shell inteiro — e o shell é o dono único dos hooks de socket e de impressão (RN-06 da spec 38). Re-render a 60 Hz enquanto o restaurante imprime é a última coisa que este app precisa. O estado só muda no commit, uma vez.
- **RN-05** — **O punho precisa de `-webkit-app-region: no-drag`.** *Por quê:* o topo da sidebar é região de arraste da **janela** (`drag`), e elemento dentro dela não recebe mouse (RN-13 da spec 38). Um punho que atravesse aquela faixa simplesmente não arrasta, sem nenhum sinal visual — e o jsdom **não** pega isso: só Electron de verdade mostra.
- **RN-06** — **Faixa fechada, e o valor lido é clampado sem regravar.** Valor fora da faixa no arquivo (editado à mão, ou vindo de uma versão futura com outra faixa) entra clampado. *Por quê:* a mesma razão das listas fechadas da tela de impressão — o arquivo em `userData` é editável e não validado por ninguém, e sidebar de 4 px esconde o menu sem dar erro. Não regravar na leitura é o que mantém "abrir a tela não escreve no disco".
- **RN-07** — **O shell não remonta ao mudar a largura.** *Por quê:* remontar o `AppShell` derruba as conexões de socket pelo cleanup dos hooks (spec 38, RN-06), e o restaurante para de imprimir enquanto alguém mexe na barra.
- **RN-08** — **O nome da loja é exibido, nunca editado aqui.** *Por quê:* quem muda cadastro é o painel; esta tela é de leitura, e um campo editável criaria um segundo lugar para escrever o nome do restaurante.

## Fora do escopo

- **Esconder/colapsar a sidebar** (o admin tem um modo recolhido com só os ícones). Faixa fechada, e o mínimo continua mostrando os rótulos — colapso é outra feature, com outra decisão de desenho.
- **O logo da loja.** O `restaurant` traz `logo`/`image`, mas imagem na sidebar é decisão de desenho com carregamento de rede (o app não busca imagem da internet para nada hoje, RN-01 da interface) — task própria se o dev quiser.
- **Largura por tela, ou qualquer outro painel redimensionável.** Uma largura, da sidebar, para o app inteiro.
- **Mostrar o restaurante em outro lugar** (cabeçalho, bandeja, título da janela). A decisão do dev foi o pé da sidebar.
- **Trocar de restaurante sem deslogar.** Uma instalação atende uma loja; trocar é sair e entrar.
- **A prévia de documento da tela de impressão**, pedida no mesmo dia: é spec própria.

## Critérios de aceitação

- [ ] Em `npm run dev`, logado, o nome da loja aparece no pé da sidebar em todas as seis telas
- [ ] Nome muito longo (teste com um nome de 60 caracteres) é truncado, mostra o inteiro no `title` e **não** empurra nem corta o bloco do usuário
- [ ] Arrastar o punho muda a largura na hora, sem piscar e sem o app parar de imprimir no meio do arrasto
- [ ] `Escape` no meio do arrasto volta à largura de antes; duplo clique no punho volta ao padrão
- [ ] Tab chega ao punho com foco visível, e as setas mudam a largura
- [ ] Fechar o app pela bandeja e reabrir mantém a largura **e** o tema que estavam valendo (é o teste da RN-01, e tem de ser feito nos dois sentidos: mudar largura e conferir tema, mudar tema e conferir largura)
- [ ] `ui-preferences.json` apagado à mão: o app abre no padrão, sem erro no log além do aviso de arquivo ausente
- [ ] Largura absurda escrita à mão no arquivo (`4`, `99999`): o app abre dentro da faixa
- [ ] `npm run typecheck`, `npm run lint` e `npm test` como o baseline; todo componente novo com estilo tem `expectNoUndefinedClasses()`
- [ ] As duas linhas novas estão na tabela "Fidelidade ao desenho" da spec 38

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | A faixa de largura | **Padrão 216 px** (o valor do desenho, para quem não arrasta não ver diferença), **mínimo 180** e **máximo 360**. Os do admin (290/240/420) são de um painel com submenu e não servem aqui. Os três valores são para **conferir no olho** em `npm run dev`: o que decide o mínimo é o rótulo "Configurações de impressão" do menu começar a cortar |
| 2 | A primeira pintura com a largura salva | **Aceitar o salto.** A preferência chega por IPC, que é assíncrono, então o shell pinta em 216 e ajusta no primeiro efeito. O tema resolveu isso passando o valor no `additionalArguments` da janela, mas aquele caminho **só foi provado em teste, não em Electron real** (spec 38) — somar uma segunda dependência nele troca um salto de uma vez na abertura por um modo de falha novo. O app abre uma vez e vive na bandeja |
| 3 | O passo do teclado | **16 px por seta**, e `Home`/`End` não entram. Passo pequeno demais faz o teclado parecer quebrado; `Home`/`End` em punho de redimensionar não é idioma que o operador vá descobrir |

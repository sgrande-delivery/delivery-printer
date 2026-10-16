---
description: Abre uma issue de feature neste repo a partir do pedido do dev/PO. Preenche o template feature_request.yml.
argument-hint: [descrição livre da feature pedida]
---

O dev/PO está pedindo uma feature nova no app de impressão. A descrição é:

**$ARGUMENTS**

Fluxo:

1. **Coletar informações** — o template `.github/ISSUE_TEMPLATE/feature_request.yml` exige:
   - Problema / motivação (qual dor resolve, e pra quem: operador no PDV, gestor no painel, suporte)
   - Proposta (solução imaginada)
   - Escopo principal (tela/UI / impressão / socket / configuração / atualização e empacotamento / outro)
   - Prioridade percebida (high / medium / low)

   E os opcionais que ajudam muito:
   - Alternativas consideradas
   - Feature ou task relacionada (`.claude/sdd/`, ou `PRINTER-XXX` legada)
   - Observações: dependências em outros repos, endpoints ou eventos que ainda não existem

   Se `$ARGUMENTS` já cobrir o suficiente, seguir. Se faltar campo obrigatório, fazer **uma única rodada** de perguntas curtas — máximo 3-4.

2. **Aplicar as regras do projeto antes de aceitar a proposta como está.** Essas observações entram no campo "Observações adicionais" — não bloqueiam a abertura da issue:
   - **Capacidade de sistema exige canal IPC.** Se a proposta é "o app lê a lista de impressoras", "o app salva um arquivo" ou "o app mostra notificação", anotar que isso roda no **main** e chega à UI por um canal declarado nos dois lados
   - **Configuração escolhida pelo operador não vai em `.env`.** `.env` é build-time, vai inlinado no instalador e é igual para todo restaurante. Configuração por instalação é arquivo em `app.getPath('userData')`
   - **Layout de comprovante é da `delivery-api`.** Se o pedido descreve "mudar o que sai na impressão", anotar que o HTML vem de lá e a issue provavelmente é no repo da API
   - **Evento novo é contrato de dois repos.** Se a feature depende de o painel emitir algo, ou de o app emitir algo que o painel leia, anotar que a issue do outro lado (`delivery-socket-api`, `delivery-admin`, `delivery-api`) é aberta lá e vem antes
   - **Tela nova precisa de um caminho até ela.** Não existe componente de navegação neste app: anotar que a entrada (link, botão, item na tray) é parte do escopo
   - **Nada chega ao PDV na hora.** A atualização é baixada em segundo plano e aplicada quando o operador **fecha** o app, e só depois de o dev publicar o release. Se o pedido pressupõe efeito imediato no parque instalado, anotar isso
   - **Electron fica em 43.x.** Se a proposta depende de API de Electron mais novo, anotar que subir de major derruba os PDVs 32-bit

3. **Inferir contexto** quando der:
   - Menção a "operador", "PDV", "tela do printer" → UI/renderer
   - Menção a "impressora", "cópias", "papel" → impressão (main), e possivelmente contrato com a API
   - Menção a "painel", "aparece offline", "mandar imprimir de novo" → socket, e contrato com `delivery-admin`
   - Se já existe pasta em `.claude/sdd/` cobrindo a mesma frente, dizer qual — a issue pode ser uma **task** daquela feature em vez de uma feature nova
   - A `PRINTER-001` (em `.claude/tasks/`, na branch `origin/docs/add-printer-001-task`) já desenha `printer_status` por impressora física e o `print_test`: se o pedido for isso, aproveite o que está escrito lá em vez de recomeçar

4. **Montar o corpo da issue** seguindo a estrutura do template, preservando o que o solicitante disse e acrescentando as observações do passo 2 numa subseção clara ("Observações do agente sobre regras do projeto").

5. **Abrir a issue** em `sgrande-delivery/delivery-printer`:
   - Título: começar com `[feature]` seguido de um resumo curto da intenção
   - Labels: `feature` (o template já aplica). **A label `feature` pode não existir ainda** — criar antes, avisando:
     ```bash
     gh label create feature --repo sgrande-delivery/delivery-printer --description "Frente de trabalho com spec em .claude/sdd/"
     ```
   - Assignees: não atribuir a ninguém por default

6. **Reportar** ao solicitante:
   - Link da issue criada
   - Resumo do que foi preenchido
   - As observações do passo 2, especialmente dependência de outro repo ("isso depende de endpoint que a `delivery-api` ainda não expõe — abra a issue de lá antes")
   - Próximo passo, quando o pedido tiver corpo pra virar trabalho: `/create-spec <numero-da-issue>`

Se o solicitante voltar com refinamentos depois, **não abrir outra issue** — comentar ou editar o corpo da existente.

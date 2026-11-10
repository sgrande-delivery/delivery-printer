---
description: Abre uma issue de bug neste repo a partir do relato do tester ou do suporte. Preenche o template bug_report.yml.
argument-hint: [descrição livre do bug]
---

Alguém encontrou um bug no app de impressão e quer abrir uma issue. A descrição é:

**$ARGUMENTS**

Fluxo:

1. **Coletar informações** — o template `.github/ISSUE_TEMPLATE/bug_report.yml` exige estes campos obrigatórios:
   - O que aconteceu
   - O que deveria acontecer
   - Passos para reproduzir (numerados, incluindo o que foi feito no painel e o que apareceu no app)
   - Severidade (blocker / high / medium / low)
   - Onde aparece (tela do app / impressão / atualização automática / conexão com o socket / instalação)
   - Ambiente: **versão do app** (está no canto da tela de status, no formato `v2.7.0 - x64`), Windows do PDV e se é 32 ou 64 bits

   E os opcionais que ajudam muito:
   - Nome do restaurante / uuid, quando o bug é de um só
   - Modelo da impressora e se é USB ou rede
   - Task ou feature relacionada (`.claude/sdd/<feature>/tasks/`, ou `PRINTER-XXX` legada)
   - Logs: o `electron-log` grava em `<userData>/logs/main.log`, e no Windows o `userData` é `%APPDATA%\<nome do app>` — peça para o tester colar o caminho que achar, em vez de ditar um que pode não existir naquela versão

   Se `$ARGUMENTS` já cobrir tudo, seguir. Se faltar campo obrigatório, fazer **uma única rodada** de perguntas curtas.

2. **A versão é quase sempre a informação que falta, e quase sempre a decisiva.** O app atualiza quando o operador fecha o programa, então máquinas diferentes rodam versões diferentes ao mesmo tempo, e bug "que voltou" costuma ser PDV que nunca reiniciou. Peça a versão antes de qualquer hipótese, e confira com `gh release list --repo sgrande-delivery/delivery-printer --limit 5` se ela é a última publicada.

3. **Inferir contexto** quando der:
   - "não imprime", "saiu em branco", "saiu duas vezes" → impressão. Duplicata é sintoma conhecido de listener sem cleanup e de reentrância entre `printOrder` e a varredura `/orders/print/list`
   - "aparece offline no painel" → `printer_ping` no namespace `/admin`, ou a conexão do socket
   - "pediu pra fechar e não atualizou" → autoupdate: confirme se o release está **publicado** e não apenas em draft
   - "não abre", "sumiu" → o app vive na bandeja: confirme se é a janela escondida (`close` esconde em vez de fechar) antes de tratar como crash
   - Se a branch atual é de uma task, olhar a task correspondente e perguntar se o bug tem relação

4. **Cuidado com credenciais nos logs:** se vier log com cookie de sessão, header `Authorization`, JWT cru ou token do GitHub, **redija antes de gravar na issue** (substituir por `<redacted>`). Confirmar com quem relatou que a redação ficou ok antes de abrir.

5. **Montar o corpo da issue** seguindo a estrutura do template (mesmas seções, mesma ordem). Markdown limpo, sem parafrasear em excesso — preservar o que foi dito.

6. **Abrir a issue** em `sgrande-delivery/delivery-printer`:
   - Título: começar com `[bug]` seguido de um resumo curto do sintoma
   - Labels: `bug` (o template já aplica)
   - Assignees: não atribuir a ninguém por default

7. **Reportar** a quem relatou:
   - Link da issue criada
   - Resumo do que foi preenchido (e o que foi redigido por conter credencial)
   - Que ele pode anexar foto do comprovante ou do erro comentando na issue depois
   - Se o bug já tem correção desenhada, o próximo passo é virar task: `/create-task <feature> <descrição>`, ou `/create-spec` se for uma frente inteira

Se vierem informações novas depois ("esqueci de dizer que é só na impressora da cozinha"), **não abrir outra issue** — comentar ou editar o corpo da existente.

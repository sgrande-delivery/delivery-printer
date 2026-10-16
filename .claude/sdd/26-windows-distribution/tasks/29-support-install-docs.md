# 29 — Documentar instalação e suporte

**Issue:** [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29)
**Feature:** [Distribuição no Windows: instalador e assinatura](../spec.md) — issue #26
**Tipo:** chore
**Processo:** build
**Depende de:** 27, 28
**Status:** shipped

## Objetivo

Escrever o documento que o suporte usa no dia a dia: instalar, reinstalar, instalar em silêncio, achar o log, e o que fazer quando a impressão não sai.

## Contexto

- Hoje não existe nada disso: o `README.md` é para quem desenvolve, e o `CLAUDE.md` é para quem programa com o Claude
- Cobre a **RF-03** da spec, e é o lugar onde várias pontas de outras specs se encontram
- De onde vem o instalador: o link do painel (`pages/printer-settings/PrinterSettingsForm.tsx`) depende de `delivery_printer_version` ser atualizado no `PUT /printerSettings` depois de publicar a release — o checklist da task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10) cobre o lado de quem publica, e aqui o suporte precisa saber que é esse link que ele manda para o cliente
- Onde fica o log: depende da task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12), que **mede e registra** o caminho real no app empacotado. Não escrever caminho deduzido
- O que significa "não encontrada" na tela de impressoras (task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)): o nome cadastrado não casa com nenhum device do Windows, e a impressão está caindo na padrão. É o roteiro de diagnóstico mais útil que o suporte vai ter

## Mudanças

### 1. O documento

`INSTALL.md` na raiz (novo), curto e em pt-BR, com seções:

- **Instalar** — de onde baixar (o link do painel), o que o Windows vai perguntar, e a instalação silenciosa com o comando exato
- **Primeiro acesso** — login com credencial do painel, e as permissões (`role:printer`, `role:printer-setting`) de que as telas de configuração precisam
- **Conferir que está funcionando** — a tela de status, o indicador de conexão, o teste de impressão (task [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24))
- **Quando não imprime** — o roteiro: impressora "não encontrada" na tela, impressora desligada, fila com falhados (spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15)), e como pegar o log (task [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14))
- **Atualização** — que ela é automática, aplicada **quando o operador fecha o app**, e que pode levar dias; como forçar fechando pela bandeja
- **Reinstalar** — e o que se perde (nada do cadastro, que mora na API)

### 2. Ponteiro no README

`README.md` (alterado): uma linha apontando para o `INSTALL.md`, para quem chega pelo repo não achar que o README cobre suporte.

## Testes

Não há código. A verificação é a que importa para um documento:

- alguém do suporte que não participou das tasks segue o documento numa máquina limpa, instala, loga, imprime um teste e encontra o log — **sem perguntar nada**
- os caminhos e comandos citados são copiáveis e funcionam
- nenhum caminho de arquivo deduzido: todos vieram de medição

## Critérios de aceitação

- [ ] Alguém do suporte completa instalação e teste de impressão seguindo só o documento
- [ ] O caminho do log citado é o medido na task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12)
- [ ] A instalação silenciosa documentada é a verificada na task [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27)
- [ ] Está escrito que a atualização chega quando o operador fecha o app
- [ ] O README aponta para o documento

## Fora de escopo

- Documentação para o cliente final (o restaurante): este documento é para o suporte
- Vídeo ou material de treinamento
- Documentar o fluxo de release — task [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10)

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

`INSTALL.md` na raiz (novo) e um ponteiro no topo do `README.md`.

Fora do `README` de propósito: ele é para quem desenvolve, e o suporte tem outro público e outro vocabulário. Sem `docs/`, porque é um arquivo só. O fluxo de release e o rollback **não** foram reescritos — a doc aponta para o `README.md` e para a `.claude/rules/autoupdate.md`.

### O achado que mudou o enquadramento

As telas das specs #11, #15 e #19 **não existem nesta branch**: a execução tem duas cadeias independentes, e a #26 sai da cadeia `refactor → #7`, não da que tem as telas. A primeira versão da doc marcava cada uma como "[ainda não existe]" — honesto para a branch, **errado para o produto**, porque o `INSTALL.md` vai junto com a release e as telas chegam no merge.

Reestruturado: a doc descreve **o produto da 2.7.0**, com os passos funcionando, e a ressalva ficou num **bloco único demarcado** por comentários HTML (`BLOCO-DEPENDENTE-DE-TELA`), que diz o que apagar caso as specs não sejam mergeadas antes da release. A tabela de recursos ganhou a coluna **"Chega com"** em vez de "não existe".

### O que é medido e o que é a confirmar

**Medido, com procedência ao lado:** o caminho do log (`%APPDATA%\sgrande-delivery-printer-2\logs\main.log`, com as duas metades justificadas — `userData` medido em Electron 43 e os typings do electron-log), o nome do instalador (hifenizado **só** no asset publicado), as opções do `build.nsis`, `ia32`+`x64`, as flags de instalação silenciosa, o indicador de conexão, o comportamento da bandeja (o X esconde, "Fechar" encerra) e a atualização aplicada ao fechar o app.

**Nove afirmações marcadas "a confirmar em Windows"**, entre elas o comando silencioso, o texto do SmartScreen, a pasta padrão e a impressão caindo na padrão quando o nome não casa.

E a seção do log termina dizendo ao leitor o que fazer se a medição estiver errada: *"Se o arquivo não existir nessa pasta num Windows real, o caminho acima está errado: corrija esta página."*

### Dois fatos de suporte que não estavam escritos em lugar nenhum

- **As permissões são duas e independentes:** `role:printer` para as impressoras e `role:printer-setting` para as configurações, em grupos separados do `admin-routes.php`. Um restaurante pode ter uma e não a outra, então as duas telas podem dar "sem permissão" **separadamente** — e o suporte tem de perguntar **qual** tela
- **Depois de promover uma release, alguém tem de atualizar o `delivery_printer_version` no painel**, senão o botão "Baixar agora" continua oferecendo a versão antiga: a URL é montada com essa chave, hardcoded em `PrinterSettingsForm.tsx:232`. É um passo manual do fluxo de release que estava implícito

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · 3 testes em 2 arquivos — nada de código mudou.

### O que não foi verificado

Nada num Windows. E o critério *"completar instalação e teste de impressão só com o documento"* **não fecha** até alguém seguir a doc do zero, numa máquina limpa, sem ajuda — é o teste do documento, e ele não foi feito.

## Branch

`feat/26-windows-distribution`, cortada de `feat/7-ci-pr-gate-and-release` em 2026-10-15, com um commit por task.

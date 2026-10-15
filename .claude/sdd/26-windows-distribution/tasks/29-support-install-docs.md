# 29 — Documentar instalação e suporte

**Issue:** [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29)
**Feature:** [Distribuição no Windows: instalador e assinatura](../spec.md) — issue #26
**Tipo:** chore
**Processo:** build
**Depende de:** 27, 28
**Status:** pendente

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

## Branch

`feat/26-windows-distribution`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

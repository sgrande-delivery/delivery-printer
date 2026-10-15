# 10 — Atualizar a documentação do fluxo de release e o rollback

**Issue:** [#10](https://github.com/sgrande-delivery/delivery-printer/issues/10)
**Feature:** [Esteira: checagem em PR e publicação só a partir de release](../spec.md) — issue #7
**Tipo:** chore
**Processo:** build
**Depende de:** 09
**Status:** pendente

## Objetivo

Alinhar a documentação do repo ao fluxo que a task [#9](https://github.com/sgrande-delivery/delivery-printer/issues/9) mediu e implementou, e escrever o procedimento de rollback, que hoje não existe em lugar nenhum.

## Contexto

Quatro lugares afirmam hoje que "master publica", e eles orientam tanto humano quanto agente. Mudar o workflow sem mudar os quatro deixa o repo mentindo sobre si mesmo:

- `CLAUDE.md`, seção "Condições de release" (os quatro itens numerados)
- `.claude/rules/autoupdate.md`, seção "Como o release sai"
- `.claude/commands/ship.md` — o aviso do topo, o passo 3 (versão) e o bloco de "Próximos passos"
- `.claude/agents/git-agent.md`, seção "Estado da infra — o que dispara deploy"

Dois fatos que precisam estar escritos e não estão:

- **O link de download no `delivery-admin` é hardcoded** (`pages/printer-settings/PrinterSettingsForm.tsx`) para `.../delivery-printer-2/releases/download/v${delivery_printer_version}/SGrande-Delivery-Printer-Setup-${v}.exe`, e `delivery_printer_version` é digitado à mão no formulário, que salva com `PUT /printerSettings`. Publicar sem atualizar o campo deixa o painel oferecendo a versão anterior — e o nome do arquivo depende de `productName`, que a spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26) não pode mexer sem alinhar
- **Rollback:** marcar a release anterior como `Latest` faz o updater voltar a oferecê-la, mas **quem já atualizou não volta sozinho** — o electron-updater não faz downgrade. A versão volta a ser oferecida para quem ainda não atualizou; as máquinas já atualizadas precisam de reinstalação manual, ou de uma versão nova com o número maior e o conteúdo revertido. É isso que precisa estar escrito, porque na hora do incêndio ninguém vai deduzir

## Mudanças

### 1. Os quatro arquivos

Reescrever as seções listadas no contexto com o fluxo final: bump no `package.json` → PR (checado pelo `ci.yml`) → merge → criar a release com a tag `v<version>` → esteira anexa os assets → instalar o `.exe` e conferir → publicar/marcar como latest → **atualizar `delivery_printer_version` no admin**.

### 2. O procedimento de rollback

Seção nova em `.claude/rules/autoupdate.md`: como voltar, o que o rollback **não** faz (downgrade automático), e a decisão entre marcar a anterior como latest e publicar uma versão nova com o conteúdo revertido.

### 3. O checklist de release

Um checklist curto, no `README.md` ou em `.claude/rules/autoupdate.md`, que caiba numa tela. Ele é o que o `/ship` passa a imprimir no relatório.

## Testes

Não há código. A verificação é:

- reler os quatro arquivos e confirmar que nenhum fala de `push` em `master` publicando
- `grep -rn "push para .master.\|push: branches" CLAUDE.md .claude/` não traz afirmação velha
- teste de mesa do rollback: alguém que não participou da task consegue executar o procedimento lendo só o que está escrito

## Critérios de aceitação

- [ ] Os quatro arquivos descrevem o fluxo novo, com a atividade do evento que a task 09 mediu
- [ ] O passo de atualizar `delivery_printer_version` no admin está no checklist
- [ ] O rollback está escrito, inclusive o que ele não resolve
- [ ] Nenhuma menção remanescente a "master publica"

## Fora de escopo

- Automatizar o `delivery_printer_version` (chamada autenticada de outro domínio, sem spec)
- Mexer no `delivery-admin` para tirar o link hardcoded — se virar trabalho, é issue de lá
- Documentação de instalação para o suporte — task [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29)

## Branch

`feat/7-ci-pr-gate-and-release`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

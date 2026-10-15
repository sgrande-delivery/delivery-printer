# 28 — Assinar o instalador e o executável

**Issue:** [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28)
**Feature:** [Distribuição no Windows: instalador e assinatura](../spec.md) — issue #26
**Tipo:** chore
**Processo:** build
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Assinar o pacote para o Windows parar de avisar "editor desconhecido" na instalação e em cada atualização — que é a primeira impressão que o restaurante tem do produto.

## Bloqueio

**Esta task está bloqueada pela decisão pendente 1 da spec:** qual certificado. É decisão do dono do negócio, com custo:

- **OV tradicional** — na casa de US$ 200–400/ano. Pelas regras atuais da CA/B Forum, a chave privada fica em token físico ou HSM, o que torna assinar em CI trabalhoso
- **Azure Trusted Signing** — assina na nuvem, mais barato, exige empresa verificada e assinatura Azure. É a recomendação, porque assina na esteira sem token

Sem a escolha, o `/execute` marca a task `⛔ bloqueada` e segue.

## Contexto

- Não existe nada de assinatura hoje: nenhum `win.certificateFile`, `certificateSubjectName` ou `azureSignTool` no `build`, e o `publish.yml` não tem `CSC_LINK`/`CSC_KEY_PASSWORD`
- Cobre a **RF-01** e as RN-03 e RN-04
- O segredo entra como **secret do repo** (RN-03). Nunca no `.env`, que é versionado e vai inlinado no instalador — o `.claude/rules/autoupdate.md` já registra isso
- O que a assinatura **não** muda: `latest.yml` e `.blockmap` continuam sendo gerados do mesmo jeito, e o `appId` e o `build.publish` não se tocam. O autoupdate não depende da assinatura — mas a atualização assinada deixa de mostrar aviso ao instalar
- **RN-04:** reputação do SmartScreen é acumulada por certificado. A primeira versão assinada ainda pode avisar por um tempo, e isso precisa estar dito na entrega

## Mudanças

### 1. Configuração

`package.json` (alterado): o bloco de assinatura conforme o caminho escolhido — `win.azureSignOptions` para o Trusted Signing, ou `win.certificateFile`/`certificateSubjectName` para o OV.

### 2. Esteira

`.github/workflows/publish.yml` (alterado): os secrets do caminho escolhido no ambiente do passo de empacotamento. Nada de novo no `ci.yml`, que não publica.

### 3. Verificação na própria esteira

Um passo depois do empacotamento conferindo que o `.exe` saiu assinado, para a esteira falhar em vez de publicar binário sem assinatura quando o segredo expirar ou faltar. Em runner Windows, `signtool verify /pa` resolve.

## Testes

Empírico, numa máquina Windows limpa:

- instalar o `.exe` publicado e confirmar que **não** aparece "editor desconhecido"
- propriedades do arquivo → aba Assinaturas Digitais mostra a empresa
- `signtool verify /pa` sai com sucesso
- uma atualização automática em cima de uma versão anterior, confirmando que não apareceu aviso novo

## Critérios de aceitação

- [ ] O instalador publicado é assinado, e o Windows mostra a empresa
- [ ] A esteira falha se o binário sair sem assinatura
- [ ] Nenhum segredo em arquivo versionado
- [ ] A entrega diz explicitamente que a reputação do SmartScreen é acumulada, e que a primeira versão assinada ainda pode avisar
- [ ] O `latest.yml`, o `appId` e o `build.publish` continuam intactos

## Fora de escopo

- Comprar o certificado e verificar a empresa (é o bloqueio, e é do dono do negócio)
- Assinar builds de Linux
- Notarização (era macOS, que saiu do projeto)

## Branch

`feat/26-windows-distribution`, cortada de `feat/7-ci-pr-gate-and-release` em 2026-10-15, com um commit por task.

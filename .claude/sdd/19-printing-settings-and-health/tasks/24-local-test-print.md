# 24 — Imprimir teste local

**Issue:** [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 20
**Status:** pendente

## Objetivo

Um botão que imprime uma página de teste na impressora escolhida, sem depender do backend. É o que faz a instalação e o atendimento de suporte funcionarem desde o primeiro dia.

## Contexto

- O caminho é o `rawPrint` que já existe (`src/main/preload.ts:15`): HTML curto montado aqui, `copies: 1`, `deviceName` o escolhido, `id` novo
- Cobre a **RF-05** e a **RN-08**: é a **única** impressão que este app renderiza, e a exceção se justifica porque não há dado de pedido e precisa funcionar com a API fora. A regra geral — comprovante vem da `delivery-api` — continua valendo, e o módulo precisa deixar isso explícito no nome e num comentário
- **Não confundir** com `POST /printers/{id}/test-print`, que o `delivery-admin` chama e **não existe** na API ([delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205)). Quando existir, o caminho remoto pode reusar esta impressão
- O conteúdo útil do teste: nome da impressora, setor, data e hora local, versão do app e largura do papel — é o que o suporte pede para confirmar que o comprovante certo saiu na impressora certa
- A largura do papel importa no HTML: 58 mm e 80 mm (`PrinterPaperWidthEnum`), e o teste deve respeitar a cadastrada

## Mudanças

### 1. O conteúdo

`src/renderer/services/testPrintContent.ts` (novo): função que monta o HTML do teste a partir de `{ printerName, station, paperWidth, appVersion }`. Comentário no topo dizendo por que esta é a exceção à regra de não renderizar comprovante aqui.

### 2. O botão

`src/renderer/components/printers/Printers.tsx` (alterado): botão "imprimir teste" por impressora, habilitado só quando ela **resolve** para um device real (task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21)) — oferecer teste no que vai cair na padrão confunde o diagnóstico.

Retorno pelo `useMessaging()`: sucesso, ou o motivo da falha como o Electron devolveu.

## Testes

### `src/renderer/services/__tests__/testPrintContent.test.ts` (novo)

- O HTML contém nome, setor, versão e horário
- A largura de 58 mm e a de 80 mm produzem estilos diferentes

### `src/renderer/components/printers/__tests__/Printers.test.tsx` (atualizado)

- Clique chama `window.electron.rawPrint` com `copies: 1` e o `deviceName` da impressora
- Impressora não resolvida tem o botão desabilitado
- Falha mostra o motivo
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual no Windows: imprimir teste em cada impressora e confirmar que sai na correta, com a API **desligada** (é o cenário de instalação)

## Critérios de aceitação

- [ ] O teste sai na impressora escolhida, com a API fora do ar
- [ ] O botão fica desabilitado para impressora que não resolve
- [ ] A página mostra impressora, setor, horário e versão
- [ ] Falha mostra o motivo, não mensagem genérica
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- O teste disparado pelo painel ([delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205))
- Layout de comprovante de pedido: continua sendo da API
- Enfileirar o teste (se a spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15) já estiver na base, decidir na execução se o teste entra na fila com `kind: 'test'` ou segue direto)

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

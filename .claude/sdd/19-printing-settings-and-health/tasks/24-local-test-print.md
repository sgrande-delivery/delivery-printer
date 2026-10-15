# 24 — Imprimir teste local

**Issue:** [#24](https://github.com/sgrande-delivery/delivery-printer/issues/24)
**Feature:** [Configuração de impressão e saúde das impressoras no PDV](../spec.md) — issue #19
**Tipo:** feature
**Processo:** renderer
**Depende de:** 20
**Status:** executada

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

## Implementação

**Concluída em:** 2026-10-15

### Arquivos

Novos: `src/main/testPrintPage.ts`, `src/main/ipc-events/onPrintTest.ts`, e dois arquivos de teste (`testPrintPage`, `test-print`).
Alterados: `src/main/preload.ts`, `src/main/main.ts`, `src/main/ipc-events/onRawPrint.ts` (comentário invalidado por esta task), `src/shared/printQueue.ts`, `src/__tests__/setup.ts`, `src/renderer/components/printers/PrinterItem.tsx` + teste, `src/renderer/hooks/usePrintingOrder.ts` + teste.

### Canal

| Canal | Direção | Preload | Main | Stub |
| --- | --- | --- | --- | --- |
| `printTest` | renderer → main | `preload.ts:25` | `main.ts:26` | `setup.ts:16` |

É o décimo canal com o nome duplicado como literal nos dois lados e sem teste do par.

### Fecha uma dívida da spec #15

O `kind: 'test'` foi declarado na fila pela #15 e **ficou sem produtor**. Esta task é o produtor: o teste vai por `enqueue`, passa pelo worker e **herda retry, teto de 5 tentativas e a visibilidade da #18** — conferido no código, não por promessa. O `rawPrint` direto não é usado, e com isso o canal `rawPrint` ficou **sem nenhum chamador no renderer**.

### Por que é local, e onde o layout mora

`POST /printers/{id}/test-print` **não existe** na `delivery-api` (issue `delivery-api#1205`: o painel já chama uma rota inexistente), e a página precisa sair com a API fora do ar. O HTML é gerado aqui.

Ele mora em **`src/main/`**, e a razão é a regra: o `CLAUDE.md` proíbe layout de impressão **no renderer**, e uma string de HTML em `src/renderer/services/` fica a um refactor de virar componente — vizinha dos componentes, importável por eles. No main, para virar React precisa atravessar fronteira de processo. O comentário da exceção impõe o limite em vez de descrevê-lo, e recusa explicitamente a extensão.

### A página

Nome cadastrado, setor em pt-BR, device do Windows (ou "padrão do Windows"), largura, data/hora e versão do app — tudo escapado, **sem nenhum dado de cliente**.

Para largura e margem: moldura **recuada 2 mm**, régua e linha de dígitos. O mecanismo (`@page { size: Xmm auto; margin: 0 }`) é o **medido em produção** no comprovante da `delivery-api`. O recuo é decisão desta task: drivers térmicos costumam reservar 2–3 mm não imprimíveis, e uma moldura colada perderia as bordas laterais **numa impressora correta** — diagnóstico que acusa a impressora certa é pior que nenhum. Por isso a frase também deixou de dar veredito e passou a dizer o que olhar.

**Fato para o suporte:** `paper_width` é morto do lado da API — o comprovante é **sempre** montado para 80 mm. Então "o teste saiu certinho a 58 mm" **não** significa que o comprovante sairá assim.

### Não marca na API

Duas camadas: o job nasce **sem `orderUuid`** (então nem entra no bloco de dedup), e o `usePrintingOrder` só marca `kind` que **ele próprio** enfileira — era uma lista de exclusão cujo default era marcar, e virou lista de permissão derivada do `KIND` do hook, à prova do sexto tipo. O teste que prova emite `kind: 'test'` **com** `orderUuid`, que é o único arranjo em que a asserção significa algo.

### Testes

**211 em 34 arquivos** (baseline da task: 199/32).

Mutações verificadas: desviar da fila → cai o teste que lê `printQueueStore.list()`; afrouxar a guarda de `kind` → cai o teste de marcação.

### Verificação

typecheck 0 · lint 0 erros e 1 aviso (o da base) · `ui.test.tsx` verde · par do canal conferido (as outras ocorrências do literal são o uso via preload, o stub e uma string de erro de teste — não um terceiro lado) · id do job igual ao do arquivo temporário · **nenhuma rota da `delivery-api` é chamada**.

Empacotamento **não rodado, e não precisa**: o diff encosta em `src/main/` mas não toca `package.json`, `build-config.ts`, `electron.vite.config.ts`, `.env*` nem `tsconfig*`; `node:crypto` é builtin e as invariantes de autoupdate estão intactas.

### O que não foi verificado

A saída física no papel, nas duas larguras — é o que exige Windows com impressora térmica, e é critério de aceitação desta task. E imprimir com a API fora do ar: pelo desenho nenhuma rota é chamada, mas não foi exercitado com o app rodando.

## Branch

`feat/19-printing-settings-and-health`, cortada de `feat/15-durable-print-queue` em 2026-10-15, com um commit por task.

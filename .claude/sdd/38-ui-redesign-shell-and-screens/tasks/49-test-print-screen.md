# 11 — Teste de impressão como tela própria

**Issue:** [#49](https://github.com/sgrande-delivery/delivery-printer/issues/49)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 03, 09
**Status:** pendente

## Objetivo

Promover o teste de impressão a tela própria: escolher a impressora, ver o que vai sair e mandar — sem depender do servidor. É a tela que o suporte usa ao telefone, na instalação.

## Contexto

- O desenho: `../design/printer-v2.dc.html:345-385`. Os estados do envio estão no script, em `:684`.
- **O teste já funciona**, por inteiro: `window.electron.printTest(request)` (`preload.ts:25`), handler em `src/main/ipc-events/onPrintTest.ts`, página em `src/main/testPrintPage.ts`, e passa **pela fila** — mesmo retry e mesmo caminho de falha de um comprovante. Hoje o acesso é um botão dentro do cartão da impressora (`PrinterItem.tsx:72`).
- O `TestPrintRequest` (`shared/printQueue.ts`) já pede exatamente o que a tela tem: `printerName`, `stationLabel` (já em português — a tela é dona dessa tradução), `paperWidth` e `deviceName` resolvido.
- **A pré-visualização tem de espelhar a página real** (divergência 7 da tabela de fidelidade). A página de hoje (`testPrintPage.ts:59-68`) imprime **Cadastro, Setor, Impressora, Papel, Data, Versão**, mais a moldura e duas réguas, mais a frase que explica o que observar. O mock do desenho mostra outras linhas. Pré-visualização que mostra uma página diferente da que sai é pior que não ter pré-visualização — então a pré-visualização segue a página real, **e a boa ideia do desenho entra na página**:
  - acrescentar à página real a linha de acentuação — `Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç` —, que é um teste de verdade: impressora térmica com página de código errada troca acento por símbolo, e hoje nada no app revela isso
  - **manter** a moldura e as duas réguas: elas existem para medir se a largura configurada é a do papel, o que a página do desenho não faz
- Cobre a **RF-12**.

## Mudanças

### 1. `src/main/testPrintPage.ts` — a linha de acentos

Uma linha `<p>` com `Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç`, depois da `Versão`. Não mexer na moldura, nas réguas nem na frase final.

### 2. `src/renderer/components/test-print/TestPrint.tsx` + `.module.css` (novos)

Duas colunas (`minmax(0,1fr) 300px`), como o desenho:

- **Texto de abertura** (`:347`), literal: "Imprime uma página gerada aqui mesmo, sem depender do servidor. Use na instalação ou para conferir se a impressora certa responde."
- **Lista de impressoras** (`:351-357`): uma opção por **cadastro**, com rádio, nome e o setor à direita em `--muted`. Selecionada com borda `--accent` e fundo `--accent-soft`. Vem do `usePrinters()`, o mesmo da task [#47](https://github.com/sgrande-delivery/delivery-printer/issues/47)
- **O que o desenho não previu:** cadastro **não encontrado** nesta máquina. A opção continua escolhível — testar é justamente como se descobre o problema —, mas avisa que vai sair na impressora padrão do Windows, com o mesmo vocabulário do cartão. Sem isso, o operador testa, a página sai na impressora errada, e ele conclui que está tudo bem
- **Botão** (`:359`): 44 px, `--accent`, com o ícone `print`, "Imprimir página de teste"; enquanto envia, "Imprimindo…" com opacidade 0,6 e sem reentrância
- **Retorno** (`:360`, `:684`): nada quando parado; `progress_activity` em `--text-2` com "Enviando para {nome}…" enquanto envia; `check_circle` em `--ok` com "Enviado às {hora}. Confira se a página saiu." no fim. O texto é deliberadamente "enviado", não "impresso": quem confirma é o papel, e o `printTest` resolve com o enfileiramento
- **Falha** (que o desenho não tem): o `printTest` pode rejeitar, e `PrinterItem.test.tsx:178` já cobre esse caminho hoje. Mensagem em `--err` com a causa, pelo `useMessaging()`
- **Pré-visualização** (`:362-382`): papel de 240 px em `--paper`/`--paper-ink`, monoespaçado, com **as mesmas linhas da página real**, incluindo a moldura e a régua, e a largura da bobina do cadastro escolhido

### 3. `screens/TestPrintScreen.tsx`

Substitui o esqueleto de `/print-test`.

### 4. O botão no cartão fica

Decisão pendente 2 da spec: a tela é o caminho completo e o botão no cartão é o caminho curto. Os dois chamam o mesmo `printTest`.

## Testes

### `src/main/__tests__/testPrintPage.test.ts` (ampliado)

- A página contém a linha de acentos, com os caracteres acentuados **escapados corretamente** — o `escapeHtml` já existe no módulo e o teste tem de provar que acento não virou entidade quebrada
- A moldura, as duas réguas e as seis linhas de dados continuam presentes (mutação: remover a régua faz o teste falhar)

### `src/renderer/components/test-print/__tests__/TestPrint.test.tsx` (novo)

- Lista um item por cadastro, com o setor; o primeiro vem selecionado
- Escolher outra troca a seleção e **limpa** a mensagem anterior
- Imprimir chama `printTest` com `printerName`, `stationLabel` traduzido, `paperWidth` e o `deviceName` resolvido
- Clicar duas vezes rápido não manda duas vezes
- Cadastro não encontrado é escolhível e mostra o aviso da impressora padrão
- `printTest` rejeitando mostra a causa
- A pré-visualização tem as mesmas linhas que `testPrintPage.ts` produz — o teste importa as duas e compara os marcadores, para que mudar uma e esquecer a outra falhe
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual, e é o ponto da tela: imprimir de verdade numa térmica e conferir **os acentos** e se a régua cabe no papel

## Critérios de aceitação

- [ ] A tela segue o desenho (`:345-385`), conferida lado a lado
- [ ] A pré-visualização mostra as mesmas linhas que a página impressa, e há teste que quebra se divergirem
- [ ] A página real ganhou a linha de acentos, com os acentos saindo certos no papel
- [ ] Cadastro não encontrado pode ser testado, com aviso
- [ ] Dois cliques rápidos não produzem duas páginas
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- `POST /printers/{id}/test-print` da `delivery-api` ([delivery-api#1205](https://github.com/sgrande-delivery/delivery-api/issues/1205)), que é o botão de teste **do painel**: este teste é local, de propósito, e não depende dela
- Testar todas as impressoras de uma vez
- Diagnóstico de spooler ou de porta

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

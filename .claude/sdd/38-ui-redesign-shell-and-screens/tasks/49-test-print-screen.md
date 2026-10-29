# 11 — Teste de impressão como tela própria

**Issue:** [#49](https://github.com/sgrande-delivery/delivery-printer/issues/49)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 03, 09
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-29

### Processos tocados

main (a página), renderer (a tela), `shared` (o texto comum)

### Arquivos criados/alterados

- `src/shared/testPrintContent.ts` (novo) — as palavras da página de teste, fonte única da página real e da pré-visualização
- `src/main/testPrintPage.ts` — monta as linhas a partir do `shared`; ganhou `Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç` depois da `Versão`
- `src/renderer/components/test-print/` (novo) — `TestPrint.tsx`, `.module.css`, `testPrintView.ts` (funções puras) e três arquivos de teste
- `src/renderer/screens/PrintTestScreen.tsx` — troca o esqueleto
- `src/renderer/base/Button.tsx` + `.module.css` — tamanho `44`, só número

### Canais IPC criados/alterados

Nenhum. Usa o `printTest` existente.

### Decisões que tomei por conta própria

- O texto da página vive em `shared/testPrintContent.ts` e os dois lados o importam, mas o teste de paridade compara a página **parseada do HTML real** com o DOM da pré-visualização, não os dois contra a mesma constante
- Papel da pré-visualização: 240 px para 80 mm e 174 px para 58 mm (proporcional); o desenho tem 240 fixo
- Falha: linha `--err` inline (`role="alert"`) **e** o toast do `useMessaging()`
- Opções ficam desabilitadas durante o envio, para a mensagem "Enviado" não ser lida como sendo da impressora escolhida depois
- Sem trava por `useRef`: o `disabled` do botão já impede a reentrada (a mutação do ref sobrevivia à suíte, então saiu)
- Cadastro sem device lido (`devicesRead` falso) fica neutro, sem aviso, como no cartão

### O que o review mudou depois da primeira entrega

Dois bloqueios, os dois mecânicos, mais cinco acabamentos. O miolo passou e foi verificado de forma independente: a página real mudou **exatamente uma linha** (provado gerando a página do commit anterior e a nova, e comparando byte a byte nas duas bobinas) e a paridade DOM-contra-DOM é real **nos dois sentidos**.

**1. O `.map()` das opções virou `PrinterOptionList` + `PrinterOption`**, com os `.module.css` ao lado, no molde dos quatro precedentes desta spec.

**2. Oito chaves de layout não tinham rede.** Mutadas juntas, a suíte do arquivo ficava verde — inclusive com a pré-visualização sem o fundo e as colunas sem `flex-direction`. O `expectNoUndefinedClasses()` estava chamado **duas vezes** e não pegava nada, porque o componente não tem uma única concatenação. Agora cada uma tem presença afirmada, e cada mutação derruba um teste.

**3. A linha `Data:` envelhecia** — semeada no mount e atualizada só na troca de impressora. Num app que fica dias aberto, a tela mostrava uma hora e o papel saía com outra: **a própria paridade que esta task entrega, rompida em uso real**, e invisível ao teste porque ele congela o tempo. Agora usa o `useNow` da task 07, a cada 10 s, com teste que avança o relógio falso.

**4. Os três textos de `shared/` não passavam pelo `escapeHtml`**, enquanto as linhas de dados e a régua passavam. Assimetria fechada: num módulo compartilhado, alguém acrescenta um `<` sem lembrar que ali virou HTML.

**5. Três menores:** a lista vazia ganhou classe e teste, o `aria-label` do radiogroup virou `aria-labelledby` apontando para o rótulo visível, e o `const printer = selected` ganhou o comentário que explica por que não é alias gratuito (`handlePrint` é declaração *hoisted* e não herda o narrowing; sem o `const`, `TS2345`).

### Verificação

`npm run typecheck` 0; `npm run lint` 0 erros e 1 aviso (o de `Login.tsx`); `npm test` **62 arquivos, 586 testes, 0 falhas** (baseline 60/554).

**Falta olho humano, e aqui é o que mais importa da spec inteira:** imprimir numa térmica de verdade para conferir **os acentos** da linha nova, se a régua cabe no papel de 58 e de 80 mm, e a moldura recuada em 2 mm. A página de código da impressora é exatamente o que esta linha existe para revelar, e nenhuma máquina daqui fecha isso.

# 09 — Impressoras: cartões e gaveta de edição

**Issue:** [#47](https://github.com/sgrande-delivery/delivery-printer/issues/47)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 03
**Status:** shipped

## Objetivo

A tela de impressoras na forma do desenho: cada cadastro como cartão que diz se o nome casa com um device desta máquina, e a edição numa gaveta lateral — com o aviso que explica a consequência de errar o nome.

## Metade da tela já existe

Esta é restyle, não construção: `components/printers/` tem `Printers.tsx` (lista, estados de carregando, vazio, 403 e erro), `PrinterList`, `PrinterItem` (com o botão de teste), `PrinterForm` (que grava na API) e `PrintersNotice`, com três arquivos de teste. `hooks/usePrinters.ts` já cruza a lista da API com `window.electron.listPrinters()` pelo `shared/printerMatch.ts` — **o mesmo critério do `onRawPrint.ts:19`**, que é o que faz a tela não mentir sobre o que a impressão vai fazer.

**Preservar, e não reescrever:**

- Os **cinco** estados que a task [#21](https://github.com/sgrande-delivery/delivery-printer/issues/21) mediu: carregando, 403 ("Sem permissão…"), erro de rede, 200 vazio, e **nenhum device lido** — este último é o que impede a tela de pintar todas de vermelho quando o spooler está caído ou o app roda em Linux. Era o único estado em que a tela afirmava mais do que mediu
- A chamada sem `page` nem `rows` em `services/printers.ts`: `rows: 200` dá **422** (`GetPrintersRequest.php:14` tem `ALLOWED_ROWS = [10,20,50,100]`), e há teste afirmando que a chamada vai sem parâmetro nenhum
- O 403 na escrita, com a mensagem de permissão
- Os **sete** setores de `components/printers/stations.ts` — não os quatro do desenho (divergência 2 da tabela de fidelidade): "Expedição" não existe no `PrinterStationEnum` da `delivery-api`, e esconder cinco setores existentes é pior que divergir do mock

## Contexto

- O desenho: `../design/printer-v2.dc.html:256-283` (a tela) e `:387-436` (a gaveta). As cores por estado estão no script, em `:596-611`.
- Cobre a **RF-10**.

## Mudanças

### 1. `components/printers/Printers.tsx` + `.module.css`

- **Aviso** (`:258-261`), substituindo o `PrintersNotice`: fundo `--surface-2`, texto `--text-2` em 13 px, ícone `info`, e o texto do desenho — "O nome cadastrado precisa ser **igual ao da impressora no Windows**. Quando não é, o comprovante sai na impressora padrão sem aviso. Corrija escolhendo da lista desta máquina."
- **Impressoras instaladas nesta máquina** (`:275-282`): rótulo em caixa alta, 12 px/600, `letter-spacing: .06em`, e os chips de altura 30, raio 6, com `print` e "(padrão)" na que o Windows marca como default

### 2. `components/printers/PrinterItem.tsx` + `.module.css`

Cartão do desenho (`:263-274`): `padding: 14px 16px`, raio 10, fundo `--surface`, borda `--line` — **ou `--err` quando não encontrada**. Quadrado de 40 px com `print`, nome em 14 px/600, chip ao lado (altura 22, raio 11) com `check`/"Encontrada nesta máquina" em `--ok-soft`/`--ok` ou `warning`/"Não encontrada — sai na padrão" em `--err-soft`/`--err`. Segunda linha em 12 px `--text-2`: "{setor} · {N} cópia(s) · bobina {largura} mm · {ativa|desativada}".

Botão à direita, como `:605-607`: **"Editar"** com borda `--line` quando encontrada, **"Corrigir"** em `--accent` quando não. A diferença de rótulo e de peso é proposital — o desenho está dizendo qual das duas o operador precisa olhar.

O botão de teste de impressão **fica** (decisão pendente 2 da spec): a tela de teste é o caminho completo, e o botão no cartão é o caminho curto de quem já está corrigindo aquela impressora. No cartão ele é botão de ícone, para não competir com o "Corrigir".

Com nenhum device lido, o cartão fica **neutro**: sem chip de erro, sem borda vermelha, sem "Corrigir".

### 3. `components/printers/PrinterDrawer.tsx` + `.module.css` (novos), absorvendo o `PrinterForm`

Gaveta do desenho (`:388-435`): véu em `rgba(20,17,16,.45)`, painel de 380 px à direita com fundo `--surface` e `box-shadow: -12px 0 32px rgba(0,0,0,.2)`, cabeçalho de 56 px com o título e o `close`, corpo rolável com `gap: 18px`, e rodapé com "Cancelar" e **"Salvar no servidor"**.

Quatro campos, e cada um tem uma armadilha:

| Campo | Forma no desenho | O que cuidar |
| --- | --- | --- |
| **Impressora do Windows** (`:392-397`) | Lista de opções com rádio; selecionada com borda `--accent` e fundo `--accent-soft` | É o campo que resolve o problema da tela. Escolher da lista é o caminho principal; **o nome digitado à mão continua possível**, porque há cadastro apontando para impressora de outra máquina, e substituir o campo por uma lista fechada tornaria esse cadastro ineditável |
| **Setor** (`:398-406`) | Chips; ativo com fundo `--text` e texto `--bg` | Os **sete** de `stations.ts`, não os quatro do mock. **O `Chip` (task 06) ainda não serve para seleção:** `ChipProps` não espalha `...rest` (logo não aceita `aria-label`, `disabled` nem `aria-pressed`) e o `tone` só tem `neutral|ok|err`. Estenda **o primitivo** |
| **Cópias** (`:408-414`) | Menos / valor / mais, 34 px | Mínimo 1: zero cópia é nenhum comprovante |
| **Bobina** (`:415-422`) | Segmentado 58 / 80 mm | **58 e 80 e nada mais.** A primeira versão desta linha dizia que `paper_width` é número livre e pedia um terceiro chip: é falso, medido na `delivery-api` (`Rule::in(PrinterPaperWidthEnum)` mais `CHECK (paper_width IN (58, 80))`), e o chip extra era código morto |
| **Ativa** (`:424-427`) | Interruptor, com "Desativada, não recebe comprovantes" | É o `PATCH /printers/{id}/toggle-active`, rota **separada** do `PUT` — conferir o que o `PrinterForm` de hoje faz e manter |

Fechar pelo véu, pelo `close` ou por `Esc`, e **sem perder o rascunho sem confirmar** quando houver alteração. Foco: ao abrir, vai para o painel; ao fechar, volta para o botão que a abriu.

### 4. Primitivos

`Stepper` (menos/valor/mais) e `Switch` saem desta tela **para `base/`**, porque a task [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48) usa os dois — é o critério de primitivo novo (o padrão aparecendo em dois lugares), e não antes.

## Testes

Os três arquivos de teste existentes (`Printers.test.tsx`, `PrinterItem.test.tsx`, `PrinterForm.test.tsx`) são **adaptados, não descartados**: o que eles afirmam sobre os cinco estados, sobre o 403 e sobre o teste de impressão continua valendo.

### `components/printers/__tests__/PrinterDrawer.test.tsx` (novo)

- Escolher um device da lista preenche o nome; o campo aceita nome digitado que não está na lista
- Os sete setores aparecem
- Bobina 76 mm abre com um terceiro chip selecionado mostrando 76; salvar sem tocar nele **mantém 76**
- Cópias não desce abaixo de 1
- 403 ao salvar mostra a mensagem de permissão e **não** fecha a gaveta
- `Esc` e o véu fecham; com rascunho alterado, pedem confirmação
- `expectNoUndefinedClasses(container)` na tela e na gaveta

### `base/__tests__/Stepper.test.tsx` e `Switch.test.tsx` (novos)

- Limites respeitados, `aria-label`/`aria-checked` presentes, teclado funciona

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: cadastrar no painel uma impressora com nome errado, ver o cartão acusar, corrigir pela gaveta, e ver o cartão mudar **sem recarregar**

## Critérios de aceitação

- [ ] A tela e a gaveta seguem o desenho (`:256-283` e `:387-436`), conferidas lado a lado
- [ ] "Corrigir" aparece só na não encontrada, e "Editar" na encontrada
- [ ] Os cinco estados da tela continuam distintos, incluindo "nenhum device lido" com cartões neutros
- [ ] Os sete setores estão oferecidos
- [ ] A bobina oferece 58 e 80, e só — é o conjunto que a API valida (`Rule::in`) e que o banco impõe (CHECK)
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Uma dívida de busca que é desta task

Desde a task 06 há **duas** instâncias de `usePrinters` e de `usePrintQueue` na rota `/` (a da sidebar e a do Painel), e **duas** em `/printers` (a da sidebar e a da tela): dois `GET /printers`, dois `listPrinters()` e dois `queueState()` por entrada, com estados independentes que podem discordar por um instante entre o badge e a tela. Somando o `refresh()` por navegação que a sidebar faz, são seis requisições por volta completa pelo menu.

Você é a dona da tela de impressoras, então **resolva as duas de uma vez**: um provider para a lista, ou contagem de referência no hook. E troque o `refresh()` por navegação por "só quando o pathname anterior era `/printers`", que elimina 5 de 6 das chamadas com a mesma garantia.

## Fora de escopo

- Criar e excluir impressora (é no painel administrativo)
- Status ao vivo pelo socket — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25)
- Mudar o fallback de impressora padrão do `onRawPrint` — é comportamento desejado para o restaurante com uma impressora só

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

## Implementação

**Concluída em:** 2026-10-28

### Processos tocados

renderer. Nenhum canal IPC criado nem alterado.

### Arquivos criados/alterados

- `hooks/sharedStore.ts` (novo) — store com contagem de referência: `start` no primeiro leitor, `teardown` no último, escrita sem leitor descartada
- `hooks/usePrinters.ts`, `hooks/usePrintQueue.ts` — viram casca sobre o store: **uma** cópia, um `GET /printers`, um `listPrinters()`, um `queueState()` e uma assinatura de `onQueueChanged` para o shell inteiro. `usePrinters` ganha `revalidate()` e relê no `focus` da janela
- `components/layout/Sidebar.tsx` — o `refresh()` por navegação saiu
- `base/Stepper`, `base/Switch` (novos); `Chip` (`aria-label`, `title`, `disabled`; `.compact.iconFirst` com gap 4); `Button` (`size={34}` e `size={38}`); `IconButton` (estado `:disabled`)
- `components/printers/` — `Printers`, `PrinterList`, `PrinterItem` redesenhados; `PrinterDrawer` e `printerView.ts` (novos); `PrinterForm` removido
- `services/printers.ts` — `paper_width: PaperWidth` no payload, com `PaperWidth = 58 | 80` restaurado depois do review medir a validação da API
- `app.css` — `--scrim` nos dois temas
- `spec.md` — divergência 10 na tabela de fidelidade

### Decisões que tomei por conta própria

- **Dívida de busca resolvida por store compartilhado, não por provider**, e o `refresh()` da sidebar saiu por inteiro em vez de virar "só se o pathname anterior era `/printers`": com uma cópia só, o `refresh` da tela de impressoras já atualiza o badge. Em troca a tela chama `revalidate()` ao montar (não duplica a requisição da primeira entrada) e o hook relê no `focus` da janela, que é o momento em que "o operador corrigiu o nome no Windows" fica visível.
- Cartão **sem `role="alert"`** (resolve a inconsistência com o Painel anotada na task 06).
- Botão Ativar/Desativar saiu do cartão: a ativação mora no interruptor da gaveta, gravada **depois** do PUT pela rota `toggle-active`, e só se o interruptor terminou do outro lado. Falha só na ativação diz que os dados foram salvos, relê a lista e não fecha.
- Setor: chip pressionado de novo **limpa** o setor (é o caminho para "Sem setor", que o select antigo tinha). Setor que a API tem e o app não conhece aparece como chip extra, selecionado — mesma regra da bobina.
- Cópias de 1 a 3 (o `max` da API, com CHECK no banco). A bobina oferece **58 e 80 e nada mais**: o terceiro chip que a primeira versão desta task pedia era inalcançável, porque a API valida contra o enum e o banco tem CHECK.
- A gaveta tem **152 px de respiro à direita no cabeçalho** (divergência 10).
- Confirmação de descarte é inline no rodapé, não `window.confirm`.
- "Instaladas nesta máquina" lista **todos** os devices (o desenho), não só os não cadastrados.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso (`Login.tsx:22`, baseline)
- `npm test`: 58 arquivos, 502 testes, 0 falhas (baseline 52 / 419)
- Varredura por mutação: 56 mutações, 55 mortas; sobrevivente é equivalente (`request++` no teardown de `usePrinters`, redundante com o descarte de escrita sem leitor e com o `request++` do `load()` seguinte). Árvore restaurada e conferida com `diff -r` contra cópia, e `typecheck` depois.
- Não verificado: `npm run dev` / olho humano contra o desenho; foco e Tab em Electron real.

### Como testar

1. `npm run dev`, abrir Impressoras com um cadastro de nome errado: cartão vermelho, chip "Não encontrada — sai na padrão", botão "Corrigir".
2. Corrigir pela gaveta escolhendo da lista, "Salvar no servidor": o cartão e o badge da sidebar mudam sem recarregar.
3. Bobina 76 mm: terceiro chip selecionado; editar só as cópias e salvar mantém 76.

# 10 — Configurações de impressão e aparência

**Issue:** [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 02, 03
**Status:** shipped

## Objetivo

A tela de configurações na forma do desenho — controles de incremento, interruptor, pré-visualização que reage aos valores e barra de alterações não salvas — mais a seção de aparência, onde o alternador de tema ganha o lugar definitivo.

## Contexto

- O desenho: `../design/printer-v2.dc.html:285-343`. Os cartões são `:287-321`, a pré-visualização `:322-336` e a barra de alterações `:337-342`.
- A tela existe (`components/printer-settings/`, com `PrinterSettings.tsx` e `PrinterSettingsForm.tsx`) e já lê e grava em `GET`/`PUT /printerSettings`, com o 403 tratado (`PrinterSettingsForm.tsx:106`).
- **A divergência mais importante desta spec está aqui** (divergências 6 e 7 da tabela de fidelidade). `PrinterSettingsForm.tsx:29-42` registra que os conjuntos de valores são **os mesmos do painel administrativo**, e que **a API não valida nada**:

  | Campo | Conjunto que vale | O desenho propõe | Decisão |
  | --- | --- | --- | --- |
  | `font_size` | 12, 14, 16, 18, 20, 22, 24 | 9–18, passo 1 | fica o do painel |
  | `production_template_copies` | 1–4 | 1–5 | fica o do painel |
  | `shipment_template_copies` | 1–4 | 1–5 | fica o do painel |
  | `margin_size` | em **px**: o `1` que o painel mostra como "0px", e 10–40 de 5 em 5 | 0–10 **mm** | fica o do painel, **em px** |
  | `max_width` | não editável hoje | 48–80 mm | **decisão pendente 5 da spec**: conferir no `delivery-admin` antes |
  | `no_margin` | booleano | interruptor | igual |

  **A forma é a do desenho; os valores são os do painel.** Margem em mm num campo que o servidor trata como px chega ao comprovante impresso, e fonte 9 é um comprovante que o cliente não lê. Se o conjunto fechado não couber no controle de incremento (passo irregular: 1, 10, 15, 20…), o controle percorre **o conjunto**, não o número — é o que mantém a forma sem mentir sobre os valores.
- **Antes de implementar:** abrir `pages/printer-settings/PrinterSettingsForm.tsx` do `delivery-admin` e conferir os conjuntos e o `max_width`. É leitura de referência, não dependência — nada a esperar de lá. Confirmar o remoto com `git -C <diretório> remote get-url origin`, e não presumir `master` como branch de integração.
- A frase do desenho (`:321`) — "Estas configurações são do restaurante e valem também no painel administrativo. Quem aplica no comprovante é o servidor." — **é a RN-07 escrita para o operador**, e fica literal.
- Cobre a **RF-11**, a **RF-04** (o lugar definitivo do alternador) e a **RN-07**.

## Mudanças

### 1. `components/printer-settings/PrinterSettingsForm.tsx` + `.module.css`

Dois cartões, com cabeçalho de 14/16 px e peso 600, e uma linha por campo com rótulo, dica em 12 px `--muted` e o controle à direita:

- **Cópias** (`:288-300`): produção — "Sai na impressora do setor quando o pedido entra"; expedição — "Sai quando o pedido é despachado"
- **Layout do comprovante** (`:301-320`): tamanho da fonte, largura máxima (se entrar), margem — esta com **opacidade 0,4 e desabilitada** quando "Sem margem" está ligado, e a dica virando "Desligada por 'Sem margem'", como `:709` — e o interruptor "Sem margem", com "Usa toda a largura da bobina"
- A nota do `:321`, literal

Usa o `Stepper` e o `Switch` que a task [#47](https://github.com/sgrande-delivery/delivery-printer/issues/47) pôs em `base/`.

### 2. A barra de alterações não salvas (`:337-342`)

`position: sticky; bottom: 0`, ocupando as duas colunas, fundo `--side`, texto branco: "Alterações não salvas", com "Descartar" e "Salvar". Aparece só quando há diferença em relação ao que veio do servidor — o `dirty` que o formulário já calcula (`PrinterSettingsForm.tsx:170`).

Isto **substitui** o botão de salvar de hoje. Vantagem real, não cosmética: o operador que mexeu e saiu da tela vê que mexeu.

### 3. A pré-visualização (`:322-336`)

Coluna de 300 px: rótulo em caixa alta, e o papel sobre fundo `--surface-2` com raio 10 e `padding: 18px`. O papel usa `--paper`/`--paper-ink`, fonte monoespaçada, e **reage aos valores**: largura `round(max_width * 3.2)px`, `font-size` igual ao `font_size`, e o `padding` conforme margem e "sem margem" (`:741`). A borda serrilhada de baixo é a máscara do desenho (`:333`).

**É ilustração do efeito dos valores, não o comprovante** (RN-07): não busca HTML na API e não tenta reproduzir o layout real. O conteúdo é o do desenho (nome do restaurante, pedido, dois itens, total) com o nome **real** do restaurante do `useAuth()`.

Se `max_width` ficar fora do escopo (decisão pendente 5), a largura da pré-visualização usa o valor salvo, sem controle para mexer nele.

### 4. A seção Aparência

O que a task [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40) deixou funcionando ganha a forma do desenho: terceiro cartão, três opções — **Automático (segue o Windows) / Claro / Escuro** —, com a frase que evita o mal-entendido: **"vale só neste computador"**.

**O desenho não tem controle de tema nenhum** — conferido por grep no `printer-v2.dc.html`. Então a RN-15 não tem o que cobrar aqui: a forma é sua decisão, e **não procure no desenho um controle que não existe**. A task 02 a entregou com radios nativos na tela antiga; é essa seção que você redesenha.

Duas coisas a decidir, que a task 02 deixou em aberto de propósito:

- **Salvar na hora × botão Salvar.** A Aparência grava no clique; o resto da tela grava por confirmação, e esta task acrescenta a barra de "Alterações não salvas". Duas semânticas de gravação na mesma tela é inconsistência visível — escolha uma e diga qual no relatório. (Preferência local gravando na hora é defensável: ela não vai para o servidor.)
- **Desabilitar durante a gravação.** Hoje clique repetido dispara `ui:set-theme` em sequência; é inofensivo (a escrita é atômica), mas feio.

Ela é adição pedida pelo dev. Fica no fim da coluna, depois da nota, para não se confundir com o que é do restaurante — a diferença entre preferência local e configuração do restaurante é a RN-02, e é ela que a frase comunica.

## Testes

`components/printer-settings/__tests__/PrinterSettings.test.tsx` é **adaptado**: o que afirma sobre leitura, gravação e 403 continua valendo.

### Acrescentar

- O controle percorre o **conjunto fechado**, não o número: do 12 o seguinte é 14, não 13
- Valor salvo fora do conjunto (`font_size: 13`, que a API aceita) **aparece** e sobrevive a um salvamento que não o toca
- Ligar "Sem margem" desabilita a margem e troca a dica
- A barra aparece só com alteração; "Descartar" volta ao que veio do servidor; "Salvar" manda o payload inteiro
- 403 ao salvar mostra a mensagem e **mantém** as alterações na tela
- A pré-visualização muda de largura ao mudar a largura, e de tamanho de texto ao mudar a fonte
- A seção Aparência troca o tema e diz que vale só neste computador
- `expectNoUndefinedClasses(container)`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual contra `api-dev`: salvar, recarregar o app e conferir que persistiu; conferir no painel administrativo que o valor é o mesmo
- **Manual que vale o esforço:** mudar a fonte, imprimir um comprovante de verdade e conferir que o que saiu corresponde ao que a pré-visualização sugeriu. Se não corresponder, a pré-visualização está mentindo e é ela que muda

## Critérios de aceitação

- [ ] Os cartões, a pré-visualização e a barra seguem o desenho (`:285-343`)
- [ ] Os conjuntos de valores são os do painel administrativo, com a unidade correta
- [ ] A conferência no `delivery-admin` foi feita, e o destino do `max_width` está registrado no plan
- [ ] Valor salvo fora do conjunto não é reescrito em silêncio
- [ ] "Sem margem" desabilita a margem
- [ ] A seção Aparência está na tela e diz que é local
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Validar no servidor o que a API não valida
- Pré-visualização do comprovante **real** (RN-07): o layout é da `delivery-api`
- `delivery_printer_version`, que é do painel e não deste app

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

## Implementação

**Concluída em:** 2026-10-28

### Processos tocados

renderer

### Arquivos criados/alterados

- `src/renderer/components/printer-settings/printerSettingsModel.ts` (novo) — funções puras: conjuntos fechados, `stepOptions`, `diffChanges`, `isDirty`, `marginHint`, `previewMetrics`
- `PrinterSettingsForm.tsx` + `.module.css` — dois cartões, `Stepper`/`Switch`, pré-visualização, barra de alterações; o estado é um `Draft` (só o que difere do baseline)
- `PrinterSettings.tsx` + `.module.css` — sem título/voltar (o shell dá); revalida no mount; Aparência como filha do formulário (fim da coluna, depois da nota)
- `AppearanceSection.tsx` + `.module.css` — terceiro cartão; opções desabilitadas durante a gravação
- `services/printerSettings.ts` (`fetchPrinterSettings`), `hooks/usePrinterSettings.ts` (`revalidate`)
- `base/Stepper.module.css` — desabilitado a 0,4 (o desenho, `:301`) sem escurecer os botões de novo por cima
- testes: `printerSettingsModel.test.ts` (novo), `PrinterSettings.test.tsx` (reescrito), `AppearanceSection.test.tsx`
- `spec.md` — linha 12 da tabela de fidelidade e decisão pendente 5 resolvida

### Canais IPC / sockets / variáveis de ambiente

Nenhum.

### Decisões que tomei por conta própria

- **`max_width` fica fora da tela** (decisão 5): o painel não o edita e o HTML impresso não o lê. A pré-visualização usa o valor salvo.
- **Aparência grava no clique**, fora da barra: é local, não vai ao servidor, e tema que só vale depois de confirmar é pior. Desabilita as opções durante a gravação.
- **Baseline revalidado ao abrir** (`GET /users/me`): o `PUT` apaga e recria todas as linhas a partir do baseline, e o da sessão é o do login — salvar sobre ele desfaria o que o painel mudou (inclusive `delivery_printer_version`).
- Valor salvo fora do conjunto entra nas opções do controle (12, 13, 14…), para aparecer e poder ser restaurado.
- Chave ausente mostra "—"; o primeiro passo cai na primeira opção.
- Removido o texto da versão do instalador (o desenho não tem; a chave segue no payload).
- Padding da pré-visualização: ver linha 12 da tabela de fidelidade.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso (`Login.tsx:22`)
- `npm test`: 59 arquivos, 546 testes, 0 falhas
- Varredura por mutação: 52 mutações, 4 sobreviventes explicados no relatório; restauração provada por checksum.

### Como testar

1. `npm run dev`, abrir Configurações
2. Mexer em fonte/cópias/margem: a barra aparece, a pré-visualização reage; "Descartar" volta
3. "Sem margem" desliga a margem; "Salvar" grava; conferir no painel

### O que o review mudou depois da primeira entrega

Seis bloqueios; um era decisão do dev e os cinco restantes foram corrigidos.

**1. A tela ainda salvava de baseline velho (perda de dado).** O `revalidate()` no mount não bastava: sobravam três caminhos — o `GET` rejeitando, o `GET` devolvendo resposta inutilizável (**calado**, a tela ficava idêntica a uma saudável), e a corrida com o revalidate em voo. Como o `PUT` apaga-e-recria, qualquer um deles revertia o que o painel tivesse mudado, inclusive o `delivery_printer_version`.

O conserto é **ler antes de escrever**: o `handleSave` busca as configurações no instante do salvamento e envia o delta sobre elas; se não puder ler, **não envia** e diz isso. Custa um `GET` por salvamento.

**2. Nenhum teste pegava a volta ao snapshot.** Medido: congelar o baseline no formulário passava **546/546**, porque o mock de `useAuth` devolvia `vi.fn()` para o setter e o baseline nunca mudava no teste. Com mock **com estado** e uma asserção de que o `PUT` leva valor que só a resposta fresca tem, a mesma mutação derruba **5 testes**.

**3. `font-size: 16px` no cabeçalho do cartão** divergia do desenho, que não declara tamanho e herda 14 px (`:25`, `:289`). Virou `font-size: inherit` — **tirar a linha não basta**, porque o `<h2>` tem `1.5em` do agente de usuário.

**4. As duas infidelidades do botão.** "Descartar" voltou a peso regular (`.h34.text` no primitivo, no precedente do `.row.text`). O padding do "Salvar" **entrou na tabela de fidelidade (linha 14)**: o desenho dá ao mesmo botão de 34 px paddings diferentes em duas telas, e a task 12 não resolve isso.

**5. `StepRow` era um segundo componente no arquivo.** Virou `SettingsRow.tsx` + `.module.css`, usado pelas quatro linhas de stepper **e** pela do interruptor.

**Mais dois, de atenção:** as seis chaves de CSS que carregam layout ganharam asserção de presença; e o "Salvar" deixou de ser `submit`, porque radio dentro de `<form>` **submete com Enter** no Chromium e o jsdom não implementa isso — a Aparência podia gravar as configurações do restaurante sem clique.

**6. O interruptor "Sem margem" não tem efeito no papel deste app** — decisão do dev: fica como o desenho, e o conserto é na API. Virou a **linha 13** da tabela de fidelidade, mais a issue [delivery-api#1378](https://github.com/sgrande-delivery/delivery-api/issues/1378) com spec em `.claude/sdd/1378-socket-print-honours-margin-settings/`.

### Verificação

`npm run typecheck` 0; `npm run lint` 0 erros e 1 aviso (o de `Login.tsx`); `npm test` **60 arquivos, 554 testes, 0 falhas** (baseline 58/497).

**Falta olho humano:** comparar com `design/printer-v2.dc.html:285-343` em `npm run dev` nos dois temas (a cor do papel no escuro, e token inexistente a rede não pega); salvar contra a api-dev e conferir no painel; e **imprimir um comprovante de verdade** para ver se a proporção de 0,85 da pré-visualização corresponde ao papel.

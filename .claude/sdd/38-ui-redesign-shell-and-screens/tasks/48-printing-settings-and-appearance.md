# 10 — Configurações de impressão e aparência

**Issue:** [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 02, 03
**Status:** pendente

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

O desenho não tem esta seção; ela é adição pedida pelo dev. Fica no fim da coluna, depois da nota, para não se confundir com o que é do restaurante — a diferença entre preferência local e configuração do restaurante é a RN-02, e é ela que a frase comunica.

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

# Spec — Paridade de plataforma entre o gate de PR e a esteira de publicação

**Status:** rascunho
**Criada em:** 2026-11-10
**Escopo:** renderer/main (um teste) + build/empacotamento (CI)
**Issue:** [#72](https://github.com/sgrande-delivery/delivery-printer/issues/72)

## Contexto

Em 2026-11-10 a release `v3.0.0` foi criada como pré-release. O job `gate` passou, e o job `publish` **falhou no step Test**, antes de empacotar — a pré-release ficou com zero assets. A promoção para release normal **não** redisparou a esteira, e por alguns minutos a `v3.0.0` foi a `Latest` do repositório **sem `latest.yml`**: todo PDV instalado tomou 404 ao checar atualização, sem nada aparecer para ninguém. A contenção foi marcar a release de volta como pré-release, o que devolveu a `Latest` para a `v2.6.0`.

O defeito é **um teste**, e é pequeno: `src/main/__tests__/printFonts.test.ts:68-74` passa um caminho POSIX (`/opt/Program Files/SGrande Impressão/x.woff2`) e espera `file:///opt/Program%20Files/…`. No Windows, `pathToFileURL` resolve o caminho relativo à unidade corrente e devolve `file:///D:/opt/Program%20Files/…`. A codificação percentual — o que a RN-06 original realmente protege — funcionou: o espaço virou `%20`, o `ã` virou `%C3%A3`. Quebrou só a asserção do prefixo. `src/main/printFonts.ts` está correto.

O que torna isso uma frente, e não um conserto de uma linha, é **por que escapou**: o `ci.yml` roda em `ubuntu-latest` e o `publish.yml` em `windows-latest`, de propósito, para o NSIS não depender de wine. Esse teste existe há quatro specs e **nunca pôde falhar no gate de PR nem passar na esteira de publicação**. O comentário do `ci.yml` declara a premissa exata que o incidente derrubou: *"Checks (tsc, eslint, vitest, electron-vite build) do not depend on Windows; only the NSIS packaging in publish.yml does."* A premissa era razoável e estava errada: este app empacota para Windows e tem código de `main` que monta caminho e URL de arquivo.

E há um **terceiro** workflow com a mesma doença, descoberto no review da task 02: o `test-installer.yml` recusa publicar um instalador de teste que fale com produção — "a única verificação que separa instalador de teste de instalador que registra a máquina como impressora em produção", nas palavras dele. Ele procurava `socket2.sgrande.delivery`, que o PR #71 aposentou em favor de `socket.sgrande.delivery`, e o padrão não acompanhou: a metade do WebSocket ficou **cega**. Guarda que repete um valor em vez de derivá-lo fica para trás do primeiro PR que mude esse valor.

E há um quarto buraco, descoberto na mesma hora: **a promoção não é checada por ninguém**. O `gate` só roda no evento `published`; promover pré-release para release dispara `released`, que o workflow não escuta. Quem promove uma release cujo build falhou não recebe nenhum sinal — o `gate` foi escrito para recusar exatamente o estado "Latest sem `latest.yml`", e nesse caminho ele nem é chamado.

## Objetivo

O gate de PR passa a reprovar o que a esteira de publicação reprovaria, e promover uma release sem `latest.yml` passa a falhar com mensagem, em vez de quebrar a atualização do parque em silêncio.

## Requisitos funcionais

- **RF-01** — A asserção da RN-06 em `printFonts.test.ts` passa no Linux e no Windows, verificando o que a regra protege: que o `href` seja percent-encoded e não contenha caractere cru.
- **RF-02** — O `ci.yml` roda a suíte de testes também em `windows-latest`, e reprova o PR quando ela falha lá.
- **RF-03** — O `publish.yml` passa a escutar também `release: [released]` e, nesse evento, **falha com mensagem** quando a release não tem `latest.yml` entre os assets.
- **RF-05** — A guarda do `test-installer.yml` deriva os hosts proibidos e esperados dos `.env` versionados, reprova o vazamento de **qualquer** host de produção, exige **todos** os hosts de dev no bundle, e se autotesta antes de dar veredito.
- **RF-04** — O caminho feliz não muda: pré-release continua buildando e publicando; promoção de release que **tem** `latest.yml` continua saindo verde sem buildar.

## Regras de negócio

- **RN-01 — Teste de caminho de arquivo não escreve caminho literal de uma plataforma.** `pathToFileURL` é resolvido contra a unidade corrente no Windows, então `/opt/x` vira `file:///D:/opt/x` lá e `file:///opt/x` aqui. A asserção tem de ser sobre a **propriedade** (percent-encoding, ausência de caractere cru), não sobre a string inteira — ou o caminho de entrada tem de ser construído por plataforma.
- **RN-02 — O que a esteira de publicação roda, o gate de PR também roda.** Enquanto houver step em comum entre os dois workflows (`npm ci`, typecheck, test, build), rodá-los em sistemas diferentes é uma divergência que só aparece no dia do release — o pior dia possível, porque a release já existe e já pode ter sido promovida.
- **RN-03 — A `Latest` sem `latest.yml` é o pior estado possível deste repositório**, e nenhum caminho pode chegar nele calado. É a mesma razão que criou o `gate`; o incidente mostrou que ele cobria uma porta e não a outra.
- **RN-04 — Falhar na promoção é barato; não falhar é caro.** Um job vermelho num evento `released` não desfaz a promoção nem impede nada — mas é o único aviso que o dev recebe de que acabou de pôr o parque em 404. A recuperação (marcar de volta como pré-release) leva segundos **quando se sabe**.
- **RN-07 — Guarda não repete o valor que protege: deriva.** Repetido, ele fica para trás do primeiro PR que o mude, e a guarda passa a não poder falhar — sem erro, sem aviso, parecendo aprovação. É a forma que a #76 tomou. **Derivar move o elo fraco da comparação para a derivação**, e é a derivação que tem de ser autotestada: o autoteste confronta o valor derivado com a **fonte** dele — a linha do `.env`, o `package.json`, o payload —, nunca com ele mesmo. Fixture escrito a partir do valor já extraído é tautologia: o `grep` sempre acha a string que acabou de escrever, então ele passa **justamente** quando a extração perdeu um valor. Medido nesta spec: com o fixture tautológico, `wss://` e valor entre aspas no `.env.production` davam `exit 0` com a URL de produção no bundle.
- **RN-05 — O `printFonts.ts` não entra nesta spec.** Ele está certo: `pathToFileURL(resolve(file)).href` é a forma correta, e foi ela que produziu o `%20` e o `%C3%A3` no Windows. Mudar implementação para fazer um teste passar é inverter a seta.
- **RN-06 — Rodar em duas plataformas dobra o custo do gate, e o corte é por step.** `typecheck` e `lint` não têm comportamento dependente de plataforma e não precisam de matriz; `test` e `build` são os que tocam caminho e `fs`. Duplicar tudo é desperdício que alguém vai querer remover depois.

## Fora do escopo

- **Mexer em `src/main/printFonts.ts`** (RN-05).
- **Varrer o resto da suíte atrás de outros testes dependentes de plataforma.** Medido na própria esteira: dos 73 arquivos, 72 passaram no Windows e 1 falhou — e o `grep` por literal POSIX em `src/` acha só `printFonts`. A matriz da RF-02 é o que encontra o próximo, e é mais confiável que uma varredura manual.
- **Assinar o instalador.** O aviso do SmartScreen é outro assunto, com task própria.
- **Republicar a `v3.0.0`.** A release já foi publicada como normal uma vez; o relançamento sai como versão nova depois que esta spec entrar. Não é trabalho de código.
- **Mudar o fluxo de release** (pré-release → conferir → promover). Ele está certo; o que faltava era o aviso na segunda porta.

## Critérios de aceitação

- [ ] `npm test` passa no Linux **e** no Windows, com a asserção da RN-06 ainda falhando se o percent-encoding for removido do `printFonts.ts` — conferido por mutação, senão o conserto virou um teste que não protege nada
- [ ] Um PR com um teste que só quebra no Windows é **reprovado** pelo `ci.yml`
- [ ] Criar uma pré-release continua buildando e anexando os três arquivos
- [ ] Promover uma release **com** `latest.yml` sai verde, sem buildar
- [ ] Promover uma release **sem** `latest.yml` falha, com mensagem dizendo o que fazer (marcar de volta como pré-release)
- [ ] `npm run typecheck`, `npm test` e `npm run lint` sem erro novo (baseline: 0 erros, 1 aviso em `Login.tsx:23`)

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Quais steps ganham matriz no `ci.yml` | `test` e `build` nas duas plataformas; `typecheck` e `lint` só no `ubuntu-latest`, que é onde já estão. São os dois que tocam caminho, `fs` e empacotamento (RN-06). |
| 2 | Forma da asserção da RN-06 | Asserção por propriedade: o `href` contém `%20` e `%C3%A3`, e não contém `Impressão` nem ` Files`. Ela expressa a regra melhor que a string literal expressava, e é por isso que a troca não é uma concessão ao Windows. |

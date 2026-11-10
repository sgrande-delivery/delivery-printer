# Plan — Paridade de plataforma entre o gate de PR e a esteira de publicação

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#72](https://github.com/sgrande-delivery/delivery-printer/issues/72)
**Branch de trabalho:** `feat/72-ci-windows-test-parity`, cortada de `origin/master` em 2026-11-10. Todas as tasks da spec rodam nela, em sequência, com um commit local por task e um PR no fim

## Abordagem técnica

Três mudanças pequenas e independentes, em três arquivos:

- **`src/main/__tests__/printFonts.test.ts:68-74`** — a asserção passa a verificar a propriedade (o `href` percent-encoded, sem caractere cru) em vez da string inteira com prefixo POSIX. Isso expressa a RN-06 original melhor do que a forma antiga: o que a regra protege é que espaço e acento não cheguem crus ao `url()` do CSS, não que o caminho comece com `/opt`.
- **`.github/workflows/ci.yml`** — o job `check` ganha `strategy.matrix.os: [ubuntu-latest, windows-latest]`, e os steps de `typecheck` e `lint` ficam condicionados ao Linux (RN-06 da spec). O comentário que afirma que os checks não dependem do Windows sai junto, porque é ele que documenta a premissa derrubada — deixá-lo é convidar alguém a reverter a matriz.
- **`.github/workflows/publish.yml`** — o `on` ganha o tipo `released`, e o job `gate` ganha um ramo para ele: `latest.yml` presente → verde sem buildar; ausente → `::error::` com a instrução de marcar de volta como pré-release. A lógica de leitura dos assets já existe no `gate` (`publish.yml:40-52`) e é reaproveitada.

**O ponto de atenção do `publish.yml`:** hoje o `gate` decide por `prerelease == true` e cai para a inspeção de assets quando não é pré-release. Com `released` no `on`, o mesmo job passa a ser chamado em dois eventos, e o `concurrency.group` é por `tag_name` com `cancel-in-progress: false` — então uma promoção logo depois de uma criação **enfileira** em vez de cancelar. É o comportamento desejado, mas precisa estar escrito, porque `cancel-in-progress: true` faria a promoção cancelar o build em andamento, que é como se chega de novo em release sem asset.

## Decisões arquiteturais

- **A asserção muda, a implementação não** (RN-05 da spec). `pathToFileURL(resolve(file)).href` é a forma correta e foi ela que produziu `%20` e `%C3%A3` no Windows. O teste é que estava medindo a coisa errada.
- **Matriz por step, não por workflow.** Duplicar `typecheck` e `lint` no Windows não acha defeito nenhum (nenhum dos dois toca `fs` ou caminho) e dobra o tempo do gate. Um gate caro é um gate que alguém desliga.
- **O guard da promoção falha em vez de corrigir.** Daria para o workflow buildar e anexar no evento `released`, mas isso publicaria assets numa release que já é a `Latest` — exatamente a janela que a RN-03 proíbe. Falhar alto e deixar a decisão com o dev é o mesmo desenho do `gate` de hoje.
- **O `ci.yml` continua sem publicar nada.** A matriz não muda isso.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Asserção da RN-06 sem depender da plataforma | [#73](https://github.com/sgrande-delivery/delivery-printer/issues/73) | [73-platform-agnostic-font-url-assertion.md](./tasks/73-platform-agnostic-font-url-assertion.md) | — | executada |
| 02 | Rodar a suíte também no `windows-latest` | [#74](https://github.com/sgrande-delivery/delivery-printer/issues/74) | [74-ci-windows-matrix.md](./tasks/74-ci-windows-matrix.md) | 01 | executada |
| 03 | Recusar promoção de release sem `latest.yml` | [#75](https://github.com/sgrande-delivery/delivery-printer/issues/75) | [75-guard-release-promotion.md](./tasks/75-guard-release-promotion.md) | — | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 antes de 02, e a ordem importa: com a matriz ligada e a asserção ainda POSIX, o CI do próprio PR desta spec ficaria vermelho e esconderia qualquer outro sinal. 03 é independente das duas (mexe só no `publish.yml`) e pode rodar a qualquer momento; fica por último por ser a única que não tem como ser verificada antes do próximo release de verdade.

## Dependências de outros repos

Nenhuma. A frente é inteiramente local.

## Verificação da entrega

- **A matriz prova a si mesma:** o PR desta spec roda nas duas plataformas, e o Windows tem de ficar verde — é a primeira vez que isso acontece no repositório.
- **Mutação na task 01:** remover o `pathToFileURL` do `printFonts.ts` (sem commitar) tem de derrubar o teste. Asserção que sobrevive à remoção da proteção não protege.
- **A task 03 não dá para verificar sem release.** O que dá para fazer antes é ler o payload de um evento `released` real — o do incidente de 2026-11-10 está no histórico de runs — e conferir que o `gate` novo teria falhado nele. A verificação de verdade é o próximo release: criar a pré-release, deixar o build terminar, promover, e ver o job sair verde sem buildar.

## Aprendizados que valem para as próximas tasks

- **`if: runner.os == 'Linux'`, nunca `matrix.os == '<label>'`.** Condicionar step ao valor literal do label faz o `if` deixar de casar no dia em que alguém fixa a versão (`ubuntu-24.04`), e o step some em silêncio — gate que para de checar sem ficar vermelho. `runner.os` é imune.
- **A matriz renomeia o check:** `check` virou `check (ubuntu-latest)` e `check (windows-latest)`. Hoje é inofensivo porque o ruleset `master-protection` não tem `required_status_checks` (conferido em 2026-11-10); quem for exigir check por nome tem de usar os dois novos.
- **Repo público: minuto de runner Windows não é faturado.** O multiplicador 2× do Windows só vale em repo privado. O custo da matriz é fila e tempo de parede (~1,5 min → ~3 min, com os legs em paralelo), não dinheiro.
- **Assimetria que fica, e é consciente:** o `publish.yml` roda `typecheck` no Windows e o gate passa a rodá-lo só no Linux, então erro de typecheck exclusivo do Windows ainda não reprova PR. É a decisão #1 de "Decisões pendentes" da spec. A alternativa de custo zero — tirar o typecheck do `publish.yml`, já que o gate o cobre — é task própria.

- **A RN-06 da spec 52 tem duas pernas, e o `plan.md` parafraseou só uma.** A regra é "a URL é construída com `pathToFileURL()`, **nunca por concatenação de string**" — porque no Windows a concatenação crua produz `file://D:/…`, sem a terceira barra, que não é URL válida e faz a face sumir em silêncio. Medido na task 01: essa forma errada passa no teste vizinho (`declares six faces…`) e nas duas `not.toContain`, e é pega **só** pela asserção `src: url('file:///`. Quem for "limpar" o teste por achá-la redundante remove a única rede dessa perna.
- **Cuidado ao citar "RN-06" aqui:** existem duas. A da spec 52 é a que o `printFonts.test.ts` protege; a desta spec é o custo da matriz por step. Nomear a spec ao citar RN de outra frente.
- **O log do job que falhou é fonte melhor que dedução sobre "o que quebra no Windows".** O run `42833082769` mostra `1 failed | 806 passed`: só a asserção de caminho. Os outros 21 testes do mesmo arquivo — inclusive `fs.existsSync` sobre `assets/fonts` real e todo o `loadPrintFontFacesCss` — já passavam lá. Isso dispensou a varredura manual por "outros testes POSIX-only".

- **Promover pré-release dispara `released`, não `published`.** Medido em 2026-11-10, e é o que a `.claude/rules/autoupdate.md` registrava como incerto na documentação do GitHub ("a documentação não diz quais activity types disparam quando uma pré-release é promovida"). Agora se sabe: não dispara `published`, então um workflow que só escuta `published` **não roda na promoção**.
- **O `gate` cobria uma porta e não a outra.** Ele foi desenhado para recusar "Latest sem `latest.yml`" — e esse estado foi alcançado justamente pelo caminho em que ele não é chamado. Portão que depende do evento certo não é portão; vale checar o **estado** em todo evento que possa produzir o estado ruim.
- **Um teste pode ser estruturalmente incapaz de falhar no gate.** Este viveu quatro specs em verde porque o gate e a esteira rodam em sistemas diferentes. Antes de confiar numa suíte, vale perguntar em que ambiente ela nunca rodou.

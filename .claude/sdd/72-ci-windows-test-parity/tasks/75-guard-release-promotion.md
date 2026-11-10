# 75 — Recusar promoção de release sem latest.yml

**Issue:** [#75](https://github.com/sgrande-delivery/delivery-printer/issues/75)
**Feature:** [Paridade de plataforma entre o gate de PR e a esteira de publicação](../spec.md) — issue #72
**Tipo:** bug
**Processo:** build
**Depende de:** (nenhuma)
**Status:** executada

## Objetivo

Fazer a promoção de uma release sem `latest.yml` falhar com mensagem. Hoje ela passa calada, e foi por esse caminho que a `v3.0.0` virou a `Latest` do repositório sem nenhum asset, pondo todo PDV instalado em 404 ao checar atualização.

## Contexto

- Cobre **RF-03**, **RF-04** e as **RN-03** e **RN-04** da spec.
- **Medido em 2026-11-10:** promover pré-release para release dispara o activity type **`released`**, e não `published`. O `publish.yml:9-11` escuta só `published`, então **a promoção não chama o `gate`**.
- Isso é exatamente o que a `.claude/rules/autoupdate.md` registrava como incógnita: *"A documentação não diz quais activity types disparam quando uma pré-release é promovida."* O desenho do `gate` (ler estado, não inferir intenção pelo evento) estava certo — o que faltou foi **ser chamado** nesse evento. A regra precisa ser atualizada com o valor medido, nesta mesma task.
- **A ironia do incidente:** o `gate` tem um ramo exatamente para este estado — *"A release está publicada como release normal e não tem `latest.yml`, então ela já é a `Latest` do repositório e todo app instalado tomaria 404"* (`publish.yml:52`). Ele nunca rodou, porque a release foi promovida, não publicada.
- A leitura dos assets do payload já existe e é para reaproveitar: `publish.yml:40-52`, incluindo o tratamento de payload ilegível, que tem mensagem própria de propósito (mandar apagar release por erro de leitura é conselho errado).
- **Falha, não conserta** (RN-03): daria para buildar e anexar no `released`, mas isso publicaria assets numa release que **já é a `Latest`** — a janela que a regra proíbe. Falhar alto e deixar a decisão com o dev é o desenho do `gate` de hoje.
- **Atenção ao `concurrency`** (`publish.yml:13-15`): o grupo é por `tag_name` com `cancel-in-progress: false`, então promover logo depois de criar **enfileira** em vez de cancelar. É o desejado — `true` faria a promoção cancelar o build em andamento, que é outro caminho para release sem asset. Não mudar, e deixar o porquê escrito.

## Mudanças

### 1. Escutar o evento da promoção

`.github/workflows/publish.yml` (alterado):

```diff
 on:
   release:
-    types: [published]
+    # `released` is what promoting a pre-release fires -- measured on 2026-11-10, when
+    # promoting v3.0.0 ran nothing at all and left the repository as Latest with no
+    # latest.yml. `published` alone never sees a promotion.
+    types: [published, released]
```

### 2. O ramo da promoção no `gate`

`.github/workflows/publish.yml` (alterado), no step `Decide whether to build`: antes da checagem de pré-release, ramificar pelo evento.

Em `released`:

- pré-release (promoção que ainda não saiu da pré-release, ou edição) → nada a fazer, `build=false`
- **com** `latest.yml` nos assets → promoção legítima: `build=false`, verde
- **sem** `latest.yml` → `::error::` dizendo que a release já é a `Latest` sem `latest.yml`, que todo app instalado está tomando 404, e que o primeiro ato é **marcá-la de volta como pré-release** (`gh release edit <tag> --prerelease`), que devolve a `Latest` para a anterior em segundos
- payload ilegível → a mensagem própria que já existe

Em `published`, o comportamento de hoje, intocado (RF-04).

### 3. A regra, com o valor medido

`.claude/rules/autoupdate.md` (alterado): trocar a frase sobre a incerteza da documentação pelo fato medido, e acrescentar à tabela do `gate` a linha do evento `released`. O texto atual diz que o desenho "é correto nos dois cenários possíveis de semântica do evento" — isso continua verdade, mas agora se sabe **qual** é o cenário, e que havia um terceiro: o evento em que o portão não era chamado.

## Testes

Não há teste automatizado de workflow neste repo.

### Verificação possível antes de um release

- Ler o payload do evento `released` do incidente de 2026-11-10 (está no histórico de runs do repositório) e conferir, com o mesmo `node -e` que o `gate` usa, que a expressão de assets devolveria `false` para o `latest.yml` — ou seja, que o `gate` novo teria falhado ali.
- Conferir que o ramo de `published` não mudou, comparando o diff do step.

### Verificação real

Só o próximo release prova: criar a pré-release, **deixar o build terminar e anexar os três arquivos**, promover, e ver o job sair **verde sem buildar**. O caminho de falha só se vê de propósito, e não vale provocá-lo em produção.

## Critérios de aceitação

- [ ] Criar uma pré-release continua buildando e anexando `.exe`, `.blockmap` e `latest.yml` (RF-04)
- [ ] Promover uma release **com** `latest.yml` sai verde, sem buildar
- [ ] Promover uma release **sem** `latest.yml` falha, e a mensagem diz o primeiro ato da recuperação (marcar de volta como pré-release)
- [ ] Payload de assets ilegível continua com a mensagem própria, que não manda apagar release
- [ ] O `concurrency` continua com `cancel-in-progress: false`, com o porquê escrito
- [ ] A `.claude/rules/autoupdate.md` registra que a promoção dispara `released`, com a data da medição

## Implementação

Executada em 2026-11-10, commit único. Arquivos: `.github/workflows/publish.yml` e `.claude/rules/autoupdate.md`.

**`publish.yml`** — `on.release.types` passou a `[published, released]`; o step `Decide whether to build` ganhou a env `EVENT_ACTION` e dois ramos novos; a leitura de assets e a mensagem de payload ilegível foram **reaproveitadas**, não duplicadas. O job `publish` e o `concurrency` ficaram intocados (só ganharam comentário).

O comentário do job foi **reescrito**: ele afirmava que `published` cobria a promoção, que é a premissa que o incidente derrubou.

**`autoupdate.md`** — a incerteza sobre qual evento dispara virou fato datado, a tabela de decisão do gate ganhou a coluna Evento e as linhas de `released`, e entraram as duas folgas conhecidas (ver abaixo).

### A ordem do primeiro ramo é o que impede build duplo

`released` + `prerelease=true` é checado **antes** do `if [ "$PRERELEASE" = "true" ]`. Depois dele seria inalcançável, e um `released` em pré-release viraria `build=true` — isto é, **um segundo build e upload na mesma tag**. Pela documentação esse caso não ocorre (`released` não dispara em pré-release), então o ramo é **defensivo**: ele existe para que uma semântica não documentada não produza o dano.

### O fato que faltava medir

O implementador afirmou, de conhecimento, que criar release direto como normal dispara `published` **e** `released`. Conferido na fonte da documentação do GitHub (`github/docs`, `src/webhooks/data/fpt/release.json`): `published` = *"A release, pre-release, or draft of a release was published"*; `released` = *"A release was published, or a pre-release was changed to a release"*. **Verdadeiro.** Consequência: dois runs vermelhos para a mesma tag, serializados pelo `concurrency`. Ruído aceitável — o primeiro ato é o mesmo nas duas mensagens.

### Testes

Não há teste automatizado de workflow neste repo. A prova foi extrair o `run` do job `gate` do YAML e executá-lo com as env vars de cada cenário:

| Evento | Pré? | Assets | exit | build |
| --- | --- | --- | --- | --- |
| `published` | sim | `[]` | 0 | `true` |
| `published` | não | com `latest.yml` | 0 | `false` |
| `published` | não | `[]` | 1 | — (caminho de hoje, intocado) |
| `released` | sim | `[]` | 0 | `false` (ramo defensivo) |
| `released` | não | com `latest.yml` | 0 | `false` |
| **`released`** | **não** | **`[]`** | **1** | — **← o incidente da v3.0.0, agora pego** |
| qualquer | — | ilegível | 1 | — (mensagem própria; **não** manda apagar release) |

### Duas folgas que ficam, documentadas na regra

1. **Apagar o asset `latest.yml` da `Latest` não dispara webhook nenhum.** O evento `release` tem sete activity types e não existe evento de asset. Nenhum `on: release` pega; só um job agendado conferindo `/releases/latest`.
2. **O predicado é só o `latest.yml`.** Release com `latest.yml` e sem o `.exe` sai verde, e o fim é o mesmo: o updater acha a atualização e toma 404 no download. O checklist exige três arquivos; o portão afirma um. Endurecer é uma linha, e é task própria.

**Não verificado:** o comportamento real do GitHub num evento `released` (não há run desse evento no histórico, porque o workflow não o escutava). A prova de ponta a ponta é o próximo release.

## Fora de escopo

- **Buildar e anexar no evento `released`** (RN-03): publicaria asset numa release que já é a `Latest`.
- **Desfazer a promoção automaticamente.** O workflow avisa; quem decide é o dev.
- **Republicar a `v3.0.0`.** Ela já foi publicada como normal uma vez; o relançamento sai como versão nova, e não é trabalho de código.
- Os outros tipos de evento de release (`created`, `edited`, `deleted`, `unpublished`, `prereleased`) — nenhum deles produz o estado ruim.

## Branch

`feat/72-ci-windows-test-parity`, cortada de `origin/master` em 2026-11-10. Todas as tasks da spec rodam nela, com um commit por task.

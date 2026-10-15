# 06 — Error boundary com recuperação

**Issue:** [#6](https://github.com/sgrande-delivery/delivery-printer/issues/6)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** feature
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** executada

## Objetivo

Impedir que um erro de render deixe o PDV com tela branca e sem volta. O operador não sabe reiniciar o app, e em produção ele não tem nem `Ctrl+R`.

## Contexto

- Não existe error boundary em `src/renderer/` (varrido)
- `src/main/devtools.ts:12` — `registerDevtools` retorna cedo fora de desenvolvimento, então `F12` e `Ctrl+R` não existem no app instalado. Decisão deliberada, e o preço é não ter como recarregar
- `src/renderer/App.tsx` é a raiz: `BrowserRouter` → `AuthProvider` → `MessagingProvider` → `Routes`
- Cobre a **RF-05** da spec
- **Correção medida na execução:** a fronteira não é "render vs. efeito", é **sincrônico vs. agendado**. Throw sincrônico no corpo de um `useEffect` **é** capturado (o React trata erro de commit phase por `captureCommitPhaseError`); o que escapa é o que foi agendado para depois — `.catch` de promessa, timer, handler de evento. Medido com sonda descartável. O caso concreto desta base: o `AuthProvider` pede `/users/me` com `.then().catch(failSession)`, então **falha de API nunca chega a esta tela** — e isso não muda com o boundary onde ele está. Esse caminho é o log da spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11)

## Mudanças

### 1. O boundary

`src/renderer/components/error/ErrorBoundary.tsx` + `.module.css` (novos): componente de classe com `componentDidCatch`, que guarda o erro no estado e renderiza a tela de falha — texto em pt-BR dizendo que algo deu errado, e um `Button` para recarregar.

Enquanto a spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) não existir, o `componentDidCatch` registra com `console.error`; o comentário no código diz que o destino final é o log em arquivo, para quem chegar lá depois não precisar descobrir.

### 2. Posição na árvore

`src/renderer/App.tsx` (alterado): o boundary envolve **tudo** — inclusive os providers, porque erro no `AuthProvider` é exatamente um dos que produziriam tela branca. O `MessagingProvider` fica dentro, então o boundary não pode depender do snackbar para se mostrar.

## Testes

### `src/renderer/components/error/__tests__/ErrorBoundary.test.tsx` (novo)

- Filho que lança no render: mostra a tela de erro, e o resto da árvore não aparece
- Filho que não lança: renderiza normalmente, sem nada em volta
- O botão chama o recarregamento (mockado)
- `expectNoUndefinedClasses(container)`

O React escreve o erro no console nesse teste; silenciar com um spy, não com mudança no componente.

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`

## Critérios de aceitação

- [ ] Erro no render de qualquer tela mostra a tela de erro, não tela branca
- [ ] Recarregar devolve o app funcionando
- [ ] Erro dentro do `AuthProvider` também é capturado
- [ ] Está escrito nos critérios e no código que erro assíncrono **não** é coberto por boundary
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Enviar o erro para serviço externo (Sentry e similares): decisão de produto, e o app não tem telemetria hoje
- Capturar erro assíncrono por `window.onerror`/`unhandledrejection`: cabe na spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11), junto com o log
- Reinício automático do app

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

renderer

### Arquivos criados/alterados

- `src/renderer/components/error/ErrorBoundary.tsx` + `.module.css` (novos) — classe com `getDerivedStateFromError` (estado) e `componentDidCatch` (log)
- `src/renderer/components/error/__tests__/ErrorBoundary.test.tsx` (novo) — 3 casos
- `src/renderer/__tests__/appErrorBoundary.test.tsx` (novo, escrito pelo review) — o caso que prova a **posição**
- `src/renderer/App.tsx` — o boundary envolve tudo, inclusive o `BrowserRouter`

### Canais IPC / socket / variáveis de ambiente

Nenhum.

### Decisões, e o veredito do review

- **Boundary acima do `BrowserRouter` também**, não só dos providers: aprovado com razão mais forte que a declarada — com o router desmontado a tela de falha não teria como navegar, o que justifica o reload ser a única saída; e de bônus cobre throw no `history`
- **`getDerivedStateFromError` guarda o estado, `componentDidCatch` só loga**: idiomático. A mutação que a task pedia (o `componentDidCatch` não guardar o erro) não se aplica a este desenho, e o review exigiu a equivalente — `getDerivedStateFromError` devolvendo `{ failed: false }` derruba **3** testes
- **Estado é só `failed: boolean`**, sem guardar o `Error`: a tela não mostra detalhe, e `Error` em estado que ninguém lê é peso morto. O detalhe vai para o `console.error` com o `componentStack`
- **Sem `background` no CSS**: o `body` já é branco no `app.css` e os textos usam os tokens de texto — criar um token de branco que nenhum outro componente usaria seria token morto. `min-height: 100vh` (e não `flex: 1` como o `NoConnection`) é o certo aqui, porque esta tela monta na raiz, sem pai flex
- **Reload como única saída**: confirmado que em produção o `Ctrl+R` não existe (`devtools.ts` retorna cedo fora de dev) e a bandeja só tem Abrir/Minimizar/Fechar — o botão é literalmente a única recuperação

### O critério que estava sem prova

A task exigia "erro dentro do `AuthProvider` também é capturado", e os três testes iniciais usavam um filho que lança — o que passaria com o boundary em **qualquer** lugar da árvore. O review escreveu o teste que renderiza o `App` inteiro com o módulo do provider mockado para lançar no render, e **provou** que ele discrimina: movendo o boundary para dentro do `AuthProvider`, o teste falha.

Verificado por mim, de forma independente:

| Mutação | Testes que caem |
| --- | --- |
| boundary descido para dentro do `AuthProvider` | 1 (`catches an error thrown by a provider, not only by a screen`) |
| `getDerivedStateFromError` → `{ failed: false }` | 3 |

### A fronteira real, medida

O enunciado desta task dizia que erro em efeito não é capturado. **Está errado** e foi corrigido acima: throw sincrônico em corpo de efeito **é** capturado. O que escapa é trabalho agendado — e é justamente aí que o `AuthProvider` fala com a API (`.then().catch(failSession)`), então **falha de rede nunca chega a esta tela**. Quem cobre isso é a spec #11, com `window.onerror`/`unhandledrejection` e log em arquivo.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso — o `Login.tsx:23` da base
- `npm test`: **50 testes em 11 arquivos**
- Empacotamento: não rodado — diff só de renderer

### Como testar

1. `npm run dev`, provocar erro de render numa tela (ou usar o mock do teste como referência)
2. Ver a tela "Algo deu errado" com o botão
3. Recarregar e confirmar que o app volta

### O que não foi verificado

A tela a olho no Electron (legibilidade conferida por leitura do `app.css` e dos tokens, não visualmente) e o `location.reload()` no app empacotado — confirmado por código (`loadFile` em `src/main/util.ts:16`, hash router em `services/history.ts`), não executado.

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

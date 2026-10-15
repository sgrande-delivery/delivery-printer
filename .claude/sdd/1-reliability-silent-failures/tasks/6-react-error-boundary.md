# 06 — Error boundary com recuperação

**Issue:** [#6](https://github.com/sgrande-delivery/delivery-printer/issues/6)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** feature
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Impedir que um erro de render deixe o PDV com tela branca e sem volta. O operador não sabe reiniciar o app, e em produção ele não tem nem `Ctrl+R`.

## Contexto

- Não existe error boundary em `src/renderer/` (varrido)
- `src/main/devtools.ts:12` — `registerDevtools` retorna cedo fora de desenvolvimento, então `F12` e `Ctrl+R` não existem no app instalado. Decisão deliberada, e o preço é não ter como recarregar
- `src/renderer/App.tsx` é a raiz: `BrowserRouter` → `AuthProvider` → `MessagingProvider` → `Routes`
- Cobre a **RF-05** da spec
- Erro em efeito ou em handler assíncrono **não** é capturado por boundary; isso fica explícito nos critérios para ninguém achar que a task cobre mais do que cobre

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

## Branch

`feat/1-reliability-silent-failures`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

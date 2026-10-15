# 05 — Estado explícito de sem conexão, e `ProtectedRoute` de verdade

**Issue:** [#5](https://github.com/sgrande-delivery/delivery-printer/issues/5)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Trocar a tela vazia e calada de quando a API está inacessível por um estado explícito com botão de tentar de novo, e fazer a rota protegida usar o `authenticated` que já existe no contexto.

## Contexto

- `src/renderer/routes/ProtectedRoute.tsx:10` — `const authenticated = true;`. A rota protegida nunca protege; o `Navigate to="/login"` do ternário é inalcançável
- `src/renderer/providers/auth.tsx:38-48` — o efeito chama `/users/me` e no erro só faz `console.error`. `authenticated` fica `false`, `restaurant` fica `null`, `loading` vira `false`
- `src/renderer/services/apiErrorInterceptor.ts` — redireciona para `/login` **só** quando há `response` com 401. Erro de rede não tem `response`: cai no primeiro `return Promise.reject(error)`
- Resultado medido: a janela abre em `/` (hash history), o `ProtectedRoute` deixa passar, o `Main` renderiza o `Status` com `restaurant?.name` indefinido, nenhum socket conecta — barra de título, versão, e nada mais
- Cobre a **RF-04** e a **RN-04** da spec
- Os sockets só conectam quando há `restaurant` (`useAdminSocket.ts:11`), então nada de socket precisa mudar aqui

## Mudanças

### 1. Distinguir os três estados no `AuthProvider`

`src/renderer/providers/auth.tsx` (alterado): o efeito de sessão passa a registrar **por que** falhou. Resposta com status é "não autenticado"; erro sem `response` é "sem conexão". O contexto expõe `sessionStatus: 'loading' | 'authenticated' | 'unauthenticated' | 'unreachable'` e uma função para tentar de novo.

`authenticated` continua existindo e passa a ser consumido de verdade — sem quebrar o `Login.tsx`, que usa `auth.me()`.

### 2. `ProtectedRoute` honesto

`src/renderer/routes/ProtectedRoute.tsx` (alterado):

- `loading` → o `InsideLoading` que já existe
- `unreachable` → a tela nova de sem conexão, **sem** mandar para o login: quem está logado e perdeu a rede não deve ser deslogado
- `unauthenticated` → `Navigate to="/login"`
- `authenticated` → `DefaultLayout` com o conteúdo

### 3. Tela de sem conexão

`src/renderer/components/connection/NoConnection.tsx` + `.module.css` (novos): explica em pt-BR que o app não conseguiu falar com o servidor, mostra o endereço que tentou (`constants.BASE_URL`, que é configuração pública) e tem um `Button` para tentar de novo. Usa os primitivos de `src/renderer/base/` e os tokens de `app.css`, conforme `.claude/rules/renderer-ui.md`.

Tentar de novo refaz a checagem de sessão; não recarrega a janela.

## Testes

### `src/renderer/components/connection/__tests__/NoConnection.test.tsx` (novo)

- Renderiza o texto e o botão, e chama o retry no clique
- `expectNoUndefinedClasses(container)`

### `src/renderer/routes/__tests__/ProtectedRoute.test.tsx` (novo)

- `unauthenticated` redireciona para `/login`
- `unreachable` mostra a tela de sem conexão e **não** redireciona
- `authenticated` renderiza o conteúdo dentro do layout
- Teste por mutação: voltando o `authenticated = true` fixo, o teste de redirecionamento cai

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual com `npm run dev`: apontar `APP_API_BASE_URL` do `.env.local` para uma porta fechada e ver a tela; voltar e ver o app entrar

## Critérios de aceitação

- [ ] API fora: tela de sem conexão, com retry que funciona quando a API volta
- [ ] 401: vai para o login
- [ ] Sessão válida: entra na tela de status
- [ ] Quem está logado e perde a rede **não** é deslogado
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Reconexão automática em intervalo (o retry aqui é manual) — vira task própria se o suporte pedir
- Os avisos `preserve-caught-error` e `react-hooks/set-state-in-effect` do `eslint.config.mjs`: se o refactor do provider resolvê-los de graça, ótimo; **não** é objetivo da task
- Login offline (não existe credencial local, e não é desejável num PDV compartilhado)

## Branch

`feat/1-reliability-silent-failures`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

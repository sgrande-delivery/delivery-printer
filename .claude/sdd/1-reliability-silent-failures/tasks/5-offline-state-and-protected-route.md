# 05 — Estado explícito de sem conexão, e `ProtectedRoute` de verdade

**Issue:** [#5](https://github.com/sgrande-delivery/delivery-printer/issues/5)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** bug
**Processo:** renderer
**Depende de:** (nenhuma)
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

renderer

### Arquivos criados/alterados

- `src/renderer/providers/auth.tsx` — `sessionStatus` com quatro estados, `isSessionRefused` (401 estrito), `requestSession`/`retrySession`, e o `me()` adotando sessão válida
- `src/renderer/routes/ProtectedRoute.tsx` — ramifica pelos quatro estados; o `authenticated = true` fixo saiu
- `src/renderer/components/connection/NoConnection.tsx` + `.module.css` (novos)
- Testes novos: `src/renderer/providers/__tests__/auth.test.tsx` (19 casos), `src/renderer/routes/__tests__/ProtectedRoute.test.tsx`, `src/renderer/components/connection/__tests__/NoConnection.test.tsx`
- `src/renderer/__tests__/cssModules.ts` (novo) — o `expectNoUndefinedClasses` extraído das duas cópias; `src/__tests__/ui.test.tsx` passou a importar

### Canais IPC / eventos de socket / variáveis de ambiente

Nenhum. Os sockets só conectam com `restaurant` presente, então nada mudou ali.

### A correção que o review fez, e por que ela importa mais que o resto

O enunciado desta task dizia "resposta com status é não autenticado", e a implementação seguiu: **qualquer** resposta, inclusive 5xx, virava `unauthenticated`. Um 500 no boot mandaria **todo o parque** para a tela de login, onde a mesma credencial falha igual — tela enganosa, pior que a tela vazia que a task veio matar.

Agora é `isSessionRefused`, **401 estrito**, e a decisão foi medida no `delivery-api` (`origin/master`): autenticação falha com `UnauthorizedHttpException` no `Authenticate.php` (401); **autorização** falha com `ForbiddenHttpException` no `Role.php` (403), que roda **depois** do `admin.jwt.auth` — logo 403 é sessão válida sem permissão. 5xx, 404 e erro de rede são o servidor não respondendo à pergunta.

Reforço inesperado da medição: **`GET /api/admin/users/me` não existe**. O que casa é `GET /users/{id}` com `{id}='me'` sob `role:user`, o que faz do 403 resposta plausível de regime permanente no boot.

### Decisões, e o veredito do review

- **`me()` adota a sessão quando o status ainda não é `authenticated`**: o review confirmou que **o laço é real** — `me()` ok com provider `unauthenticated` → `push('/')` → `Navigate` para `/login` → `Login` remonta → `me()` → sem fim. Remédio mínimo aprovado; o conserto durável (o `Login` consumir `sessionStatus`) ficou como task própria
- **Guard por ref**: o guard é obrigatório (sem ele `applySession` cria `user` novo, o `value` muda e o efeito do `Login`, que depende de `[auth]`, reentra sem parar); o ref é uma das duas implementações, escolhida para manter o `me` estável — coerente com o que esta base já pagou no `handleOpen` (task 02)
- **`authenticated`/`loading` derivados**: o único consumidor de `loading` é o `Main.tsx:27`, que ficou **inalcançável** (o `ProtectedRoute` trata `loading` antes)
- **`.then/.catch` duplicado**: o review desduplicou em `requestSession()` sem acordar o `set-state-in-effect`, deixando o `setSessionStatus('loading')` só no retry (o estado inicial já é `loading`)

### Testes

19 casos no provider, cobrindo os 15 cenários da lista do review: 200, 401, 500/502/403/404 (`it.each`), erro sem `response`, erro não-Axios, os dois de `retrySession`, os dois de `me()`, `logout`, `login` 200 e 401, uma só chamada no boot, e três de **integração com o provider real** dentro do `ProtectedRoute`.

Mutações, medidas pelo test-writer, pelo review e por mim de forma independente:

| Mutação | Testes que caem |
| --- | --- |
| `isSessionRefused` frouxo (o bug original) | **8** |
| guard do `me()` removido | 1 |
| `me()` sem `applySession` | 1 |

O review também achou **um teste que não testava**: o da tela nova afirmava só o rótulo `Endereço:`, então passava verde com o endereço ausente. Virou a string inteira, e zerar o endereço agora o derruba.

Padrão estabelecido para teste de provider: `renderHook(() => useAuth(), { wrapper: AuthProvider })` — não sonda com `Proxy` sobre variável de módulo. É igualmente honesto porque a Testing Library faz a mesma atribuição em `useEffect` por dentro.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso — o `Login.tsx:23` da base, **no mesmo arquivo e na mesma linha** (medido antes e depois)
- `npm test`: **46 testes em 9 arquivos** (baseline da spec: 3 em 2)
- Empacotamento: não rodado — diff só de renderer

### Como testar

1. `npm run dev` com `APP_API_BASE_URL` do `.env.local` apontando para uma porta fechada → tela "Sem conexão com o servidor", com o endereço e o botão
2. Subir a API e clicar em "Tentar novamente" → o app entra
3. Com sessão inválida (401) → vai para o login

### O que não foi verificado

O cenário manual acima — exige GUI do Electron e não roda nesta máquina. É a única prova de ponta a ponta de que o retry entra no app quando a API volta, e a fidelidade visual da tela nova segue sem olho humano.

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

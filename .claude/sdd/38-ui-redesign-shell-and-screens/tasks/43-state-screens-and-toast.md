# 05 — Telas de estado e toast

**Issue:** [#43](https://github.com/sgrande-delivery/delivery-printer/issues/43)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 01, 03
**Status:** pendente

## Objetivo

As três telas que o operador vê quando nada está normal — carregando, sem conexão e erro de render — e o toast, todas na forma do desenho. A de sem conexão passa a tentar de novo sozinha.

## Contexto

- O desenho: `../design/printer-v2.dc.html:470-509` (as três telas, dentro do `StateLayout` que a task [#41](https://github.com/sgrande-delivery/delivery-printer/issues/41) criou) e `:517-523` (o toast).
- As três já existem e funcionam: `components/loading/InsideLoading.tsx` com o `base/Spinner`, `components/connection/NoConnection.tsx` e `components/error/ErrorBoundary.tsx`. O `ProtectedRoute` já ramifica pelo `sessionStatus` — `loading`, `unreachable`, `unauthenticated`, `authenticated` (`routes/ProtectedRoute.tsx:17-37`).
- **O que muda de comportamento é um só item:** hoje a tela de sem conexão só tem o botão. O desenho mostra "nova tentativa em N s" (`:492`), e sem retry automático o app só volta a imprimir se alguém estiver na frente do PDV — que é justamente o que não acontece. **Decisão 3 da spec:** retry automático a cada **12 s**, o valor do desenho (`:570`), com a contagem visível.
- **O `retrySession` já existe** no `useAuth()` e é o que o botão chama hoje (`ProtectedRoute.tsx:28`). O retry automático chama o mesmo.
- O endereço no bloco monoespaçado (`:490`) vem do `constants.BASE_URL`, como o `NoConnection` já faz (`NoConnection.tsx:20`) — não do literal `api.sgrande.delivery` do desenho, que é mock.
- A frase "Você continua conectado à sua conta — não é preciso entrar de novo." (`:489`) é importante e não é decoração: ela existe porque **401 é a única coisa que desloga** (`isSessionRefused` em `providers/auth.tsx` é 401 estrito), e o operador precisa saber que perder a rede não perdeu a sessão.
- O toast é o `MessagingProvider` que já está montado (`providers/messaging.tsx`, `useMessaging().handleOpen`) — **é o único jeito de falar com o usuário** neste app. Muda a aparência, não a API.
- Cobre a **RF-06** e a decisão pendente 3 da spec.

## Mudanças

### 1. `components/loading/InsideLoading.tsx` + `.module.css` e `base/Spinner`

O spinner do desenho (`:478`) é um anel: 40 px, borda de 3 px em `--accent-soft` com o topo em `--accent`, girando em 900 ms linear. Hoje o `base/Spinner` é outra coisa; acrescentar a forma como **variante do primitivo** (RN-11), mantendo o `role="progressbar"` e o `aria-label` que ele já tem. Abaixo, "Conectando ao servidor…" em `--text-2`.

A animação `spin` vai para o `app.css` como `@keyframes`, igual ao desenho (`:20`) — não para o módulo, porque dois componentes a usam.

### 2. `components/connection/NoConnection.tsx` + `.module.css`

Forma do desenho (`:483-494`): bloco de 460 px centralizado, círculo de 72 px em `--err-soft`/`--err` com `cloud_off` de 36 px, título de 22 px/600, corpo em `--text-2`, a frase da sessão em `--muted`, o endereço em bloco monoespaçado com fundo `--surface-2`, e a linha de ação com o botão `--accent` de 42 px mais a contagem.

O retry automático:

```tsx
// 12 s é o valor do desenho (:570). O contador é só o que o operador lê;
// quem decide tentar de novo é o intervalo.
```

- `useEffect` com `setInterval` de 1 s para a contagem e `retrySession()` quando chega a zero, voltando a 12
- **Limpar o intervalo no cleanup**, e não deixar a contagem correr quando o componente sai de tela
- Clicar em "Tentar novamente" dispara na hora e **reinicia** a contagem
- `role="alert"` continua, como hoje (`NoConnection.tsx:12`)

### 3. `components/error/ErrorBoundary.tsx` + `.module.css`

Forma do desenho (`:496-507`): círculo de 72 px em `--accent-soft`/`--accent-ink` com `error`, título "Algo deu errado nesta tela", corpo, e **dois** botões — "Abrir registros", que chama `window.electron.revealLogs()` com o mesmo tratamento de "ainda não há registros" de `Status.tsx:23-35`, e "Recarregar", que é a recuperação que o boundary já faz.

O botão de registros é novo aqui e é o que torna a tela útil para o suporte: a spec [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11) pôs o log em arquivo justamente para esta conversa.

### 4. `components/messaging/Messaging.tsx` + `.module.css`

Forma do desenho (`:518-522`): fixo no rodapé, centralizado, largura entre 300 e 560 px, raio 8, fundo `#2B2725` e texto `#FAF7F5` — **literais, nos dois temas**, porque o toast do desenho não troca de cor com o tema (é o `--side` do tema claro em ambos). Botão "Fechar" em `#FF9A73`, caixa alta, 12 px/600.

A animação de entrada e o tempo de permanência que o provider já tem **ficam**: o desenho não os especifica, e mexer neles é mexer em comportamento sem pedido.

## Testes

### `src/renderer/components/connection/__tests__/NoConnection.test.tsx` (ampliado)

O arquivo já existe. Acrescentar:

- A contagem aparece e decresce com o tempo controlado (`vi.useFakeTimers()`)
- Chegando a zero, `retrySession` **é chamado**, e a contagem volta a 12
- O botão chama na hora e reinicia a contagem
- Desmontar para o intervalo: avançar o tempo depois do desmonte **não** chama `retrySession` de novo
- O endereço exibido é o `constants.BASE_URL`, não um literal

### `src/renderer/components/error/__tests__/ErrorBoundary.test.tsx` (ampliado)

- "Abrir registros" chama `revealLogs`; quando ele devolve `false`, a mensagem de "ainda não há registros" aparece
- "Recarregar" continua recuperando

### `src/renderer/components/messaging/__tests__/Messaging.test.tsx` (novo)

- `handleOpen('x')` mostra a mensagem; "Fechar" a remove
- `expectNoUndefinedClasses(container)` nas quatro telas desta task

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual: desligar a rede da máquina com o app aberto, ver a tela de sem conexão com a contagem, religar e ver o app voltar **sozinho**
- Manual: forçar um erro de render em dev e conferir os dois botões

## Critérios de aceitação

- [ ] As três telas seguem o desenho (`:470-509`), conferidas lado a lado, nos dois temas
- [ ] A tela de sem conexão volta sozinha quando a rede volta, sem ninguém clicar
- [ ] O intervalo morre no desmonte (verificado por teste, não por inspeção)
- [ ] O toast tem a forma do desenho e a mesma API (`useMessaging().handleOpen`)
- [ ] "Abrir registros" funciona na tela de erro
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Tirar o `history.push('/login')` do interceptor de erro, que no refresh falhado por rede ganha do `ProtectedRoute` e mostra o login em vez desta tela — task própria, já registrada na regra da UI
- Mudar o mapeamento de `sessionStatus` (os 8 testes que o protegem continuam valendo)
- Notificação nativa do Windows para queda de conexão

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

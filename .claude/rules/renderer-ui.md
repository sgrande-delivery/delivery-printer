---
paths:
  - "src/renderer/**"
  - "src/__tests__/**"
---

# A interface

Não há biblioteca de UI e não há CSS-in-JS. Material-UI v4 e styled-components saíram na remoção do boilerplate, e o bundle caiu de 924 kB para 518 kB. **Não reintroduzir** sem a task pedir.

## CSS Modules

Cada componente tem o seu `Componente.module.css` ao lado, importado como `styles`:

```tsx
import styles from './Status.module.css';
<div className={styles.container}>
```

Para combinar classes, `cx()` (`src/renderer/base/cx.ts`), que descarta falsy — é a função de 3 linhas que existe para não ter a dependência:

```tsx
className={cx(styles.avatar, !user.image && styles.avatarFallback)}
```

**A armadilha central de CSS Modules:** chave digitada errada não dá erro. `styles.contianer` é `undefined`, vira `class="undefined"` no DOM e o estilo desaparece calado. Existe rede para isso: `expectNoUndefinedClasses()`, exportado de `src/renderer/__tests__/cssModules.ts` (o nome não casa com o `include` do Vitest, então ele não é coletado como suíte). **Componente novo com estilo entra num teste que chama esse helper** — é o único jeito de o erro aparecer antes do PDV.

Nada de `style={{}}` para layout (só valor calculado em runtime) e nada de CSS global novo fora de `src/renderer/app.css`.

## Os tokens

As cores, fontes e pesos são custom properties em `:root`, no `src/renderer/app.css`. Os valores são **os que o MUI v4 resolvia em runtime**, para a aparência não mudar na migração:

| Token | Valor | Origem |
| --- | --- | --- |
| `--color-primary` | `#f0592a` | `palette.primary.main` do tema antigo |
| `--color-primary-light` | `#f37a55` | `lighten(main, 0.2)` — o `tonalOffset` default do MUI |
| `--color-error` / `--color-success` | `#f44336` / `#4caf50` | defaults da paleta MUI v4 |
| `--color-text` / `--color-text-secondary` | `rgba(0,0,0,.87)` / `rgba(0,0,0,.54)` | idem |
| `--font-weight-light/regular/medium` | `200` / `300` / `400` | os pesos que este projeto usava |

Cor nova entra como token em `:root`, não como hex solto no módulo. Os breakpoints do MUI v4 também foram transcritos exatos, e os comentários no CSS dizem de onde vieram: `down('md')` = `max-width: 1279.95px` — que **está ativo** na janela default de 1024 px, então é esse o padding do `DefaultLayout` na prática (`15px 20px`) — e `down('sm')` = `max-width: 959.95px`.

`-webkit-app-region: drag` em `Main.module.css:11` é o que permite arrastar a janela pela barra de título (a janela usa `titleBarStyle: 'hidden'`). Remover isso prende a janela no lugar.

## Os primitivos de `base/`

| Componente | API |
| --- | --- |
| `Typography` | `variant`: `h4 \| h6 \| body1 \| body2 \| caption`; `color`: `inherit \| primary \| textPrimary \| textSecondary`; `align`; `as` |
| `Button` | `variant`: `contained \| text`; `size`: `medium \| small`; `fullWidth`; default `type="button"` |
| `IconButton` | `color`: `default \| primary` |
| `TextField` | `label` (obrigatório), `fullWidth`, `endAdornment` |
| `Spinner` | `className`; já tem `role="progressbar"` e `aria-label` |

`TextField` reproduz o label flutuante do MUI em CSS puro: o `<input>` vem **antes** do `<label>` de propósito, porque o label reage a `:focus` e `:placeholder-shown` pelo seletor irmão, e o `placeholder` default é `' '` para o `:placeholder-shown` funcionar. Não reordene, e não remova o placeholder de espaço.

Variante nova de primitivo entra no primitivo (mais uma classe no `.module.css` e mais um valor na union), não como override de classe no componente que o usa. Primitivo novo só quando o padrão aparecer em dois lugares.

**Fidelidade:** o label flutuante e o `Spinner` são reimplementações — equivalentes em comportamento, **não pixel-idênticas** ao MUI. Task que mexa na aparência do login merece um olhar humano em `npm run dev`.

## Rotas

`src/renderer/routes/Routes.tsx` tem **duas** rotas hoje: `/login` (dentro de `PublicRoute` → `AuthLayout`) e `/` (dentro de `ProtectedRoute` → `DefaultLayout`). O procedimento de rota nova está na skill `add-screen`; o que vale como regra:

- A navegação é **hash** (`createHashHistory` em `services/history.ts`), porque em produção o renderer é carregado por `file://` e history de path não resolve. Link e `navigate` continuam normais; o que muda é a URL ter `#`
- **Não existe nenhum componente de navegação neste app.** Rota nova sem um caminho para chegar nela é tela morta — a entrada (link, botão, item de menu na tray) é parte da task, não um "depois"
- **`ProtectedRoute` protege de verdade desde a task [#5](https://github.com/sgrande-delivery/delivery-printer/issues/5)** (o `const authenticated = true;` saiu). Ele ramifica pelo `sessionStatus` do `useAuth()`: `loading` → `InsideLoading`; `unreachable` → a tela de sem conexão, **sem** redirecionar (quem está logado e perdeu a rede não é deslogado); `unauthenticated` → `Navigate to="/login" replace`; `authenticated` → o conteúdo no `DefaultLayout`
- **Só 401 conta como "não logado".** `isSessionRefused` em `providers/auth.tsx` é 401 estrito, e isso é regra, não detalhe: 403 vem do middleware `Role` da `delivery-api` **depois** da autenticação (sessão válida sem permissão), e 5xx/404/erro de rede são o servidor não respondendo a pergunta. Tratar qualquer um deles como "não logado" manda o parque inteiro para uma tela de login onde a mesma credencial falha igual. Há 8 testes que caem se esse mapeamento voltar a ser frouxo
- **Dívida: o `Login.tsx` ainda chama `me()` ao montar** e navega por conta própria, em vez de consumir o `sessionStatus`. Por isso o `me()` precisa adotar a sessão (senão o `ProtectedRoute` honesto devolve o `Login` para um laço infinito de requisição + navegação) e por isso sobrevive o aviso `react-hooks/set-state-in-effect` em `Login.tsx:23`. O conserto durável é o `Login` ler `sessionStatus`, o que apagaria o `me()` do contrato — task própria, com teste
- **Dois donos da navegação, e eles discordam num canto.** O interceptor de erro do axios ainda empurra `/login` por conta própria (`services/apiErrorInterceptor.ts`): no 401 sem `access_token.expired` e quando o refresh falha. No 401 os dois concordam com o `ProtectedRoute`; quando o **refresh falha por rede**, o interceptor ganha e o operador vê o formulário de login em vez da tela de sem conexão. Fechar isso é tirar o `history.push` do interceptor e deixar a navegação com o `sessionStatus` — task própria, com teste

## Estado e dados

- `AuthProvider` (`providers/auth.tsx`) guarda `user`, `restaurant`, `authenticated`, `loading` e expõe `login`, `logout`, `checkEmail`, `me`, `setRestaurantIsOpen`. `user` e `restaurant` moram juntos porque a sessão sempre os seta juntos. O `value` é `useMemo` — mantenha, senão todo consumidor re-renderiza a cada render do provider
- `MessagingProvider` (`providers/messaging.tsx`) é o snackbar: `useMessaging().handleOpen('mensagem')`. **É o único jeito de falar com o usuário** — não use `alert` e não deixe erro só no `console.error` quando a task pede retorno visível
- **Não há Redux, React Query nem Zustand**, e a remoção do Redux foi deliberada. Estado novo: `useState` local, ou um provider se for compartilhado
- Dado da API sempre pelo `api` de `services/api.ts`, que já tem `baseURL`, `withCredentials` e o header `App: admin`. **Não monte URL absoluta com `constants.BASE_URL`** — o axios ignora o `baseURL` quando a URL é absoluta, e o resultado idêntico esconde a duplicação (dois hooks faziam isso até outubro de 2026)

## Dívida conhecida (não corrigir de passagem)

- **O logo do login vem de URL remota** (`https://admin.sgrande.delivery/logo192.png`, `components/login/Login.tsx:84`): sem internet, a tela de login aparece sem logo. `src/renderer/images/logo192.png` está no repo **sem ninguém importar**, mantido de propósito para quando essa troca for feita
- A notificação nativa (`window.electron.notification(orderSequence)`) tem canal certo nos dois lados, mas **ninguém a chama**. Ligar a feature é chamar nos hooks de impressão — e é decisão de produto, não limpeza
- `react-router-dom` está em `6.28.1`, com advisory de open redirect (faixa `6.0.0`–`7.17.0`); a correção existe só no `7.18.4`, que é major. Não é explorável aqui (nenhum destino de navegação vem do usuário, não há SSR), e o upgrade é task própria — boa hora para avaliar se o `BrowserRouter` customizado e a dependência `history` ainda se justificam no v7

## Idioma

Texto visível é **pt-BR**. Nome de arquivo, componente, variável, classe CSS e commit são em **inglês**.

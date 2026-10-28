# 04 — Login redesenhado em duas etapas

**Issue:** [#42](https://github.com/sgrande-delivery/delivery-printer/issues/42)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** renderer
**Depende de:** 01
**Status:** pendente

## Objetivo

O login do desenho: duas colunas, painel de marca escuro à esquerda, formulário de duas etapas à direita — com o logo vindo do próprio pacote, o que também encerra a dívida do logo por URL remota.

## Contexto

- O desenho: `../design/printer-v2.dc.html:438-467`. Painel de marca em `:439-445`, formulário em `:446-466`.
- **O login já é de duas etapas**: `Login.tsx` guarda `step` e alterna `UsernameStep` (`:36`) e `PasswordStep` (`:59`), com `checkEmail` e `login` do `useAuth()`. A lógica fica; muda a aparência e muda o caminho de volta.
- **O logo vem de URL remota** (`components/login/Login.tsx:84`, `https://admin.sgrande.delivery/logo192.png`): sem internet, a tela de login aparece sem logo. É dívida conhecida, e a task [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39) já pôs `logo-horizontal-negativo.png` no pacote (371×144; ver `src/renderer/images/brand/README.md`). `src/renderer/images/logo192.png` está no repo **sem ninguém importar**, guardado de propósito para esta troca; agora ele sai de cena para o SVG de marca.
- **Dívida que esta task não fecha:** o `Login.tsx` chama `me()` ao montar e navega por conta própria, em vez de consumir o `sessionStatus` — é a origem do aviso `react-hooks/set-state-in-effect` em `Login.tsx:23`, rebaixado a aviso de propósito no `eslint.config.mjs`. **Não mexer nisso aqui**: é task própria, com teste, e misturá-la com o redesenho esconde as duas. Se o aviso desaparecer de graça, ótimo; se continuar, continua sendo o baseline.
- **Saudação não infere gênero** (RN-12): o desenho escreve "Seja bem-vinda, Maria" porque o exemplo é uma mulher. O app recebe `user.name` e não sabe de quem se trata — o texto é neutro ("Olá, Maria"), e a decisão fica registrada aqui porque o desenho diz outra coisa.
- O painel de marca é **região arrastável** (`:439`) e ocupa 400 px. O rodapé "SGrande Delivery Printer © 2026" (`:465`) usa o ano corrente, não um literal.
- Cobre a **RF-05**, a **RN-01** e a **RN-12**.

## Mudanças

### 1. `components/layout/AuthLayout.tsx` + `.module.css`

Passa a ser as duas colunas: a de 400 px com fundo `--side`, e a de conteúdo centralizado. O `PublicRoute` já o usa; nada muda ali.

### 2. `components/login/BrandPanel.tsx` + `.module.css` (novos)

Logo horizontal negativo (`images/brand/logo-horizontal-negativo.png`) de 190 px no topo, e no pé do painel o título "SGrande Delivery Printer" (30 px/600) com a linha "Impressão automática dos pedidos, direto na cozinha, no bar e no caixa." em 15 px `--side-text` — o texto é o do desenho. Abaixo, `v{version} · {arch} · SGrande Delivery`, com os mesmos dados que a sidebar usa.

Região arrastável, com `no-drag` em qualquer coisa clicável (RN-13).

### 3. `components/login/Login.tsx` e os dois passos

- Rótulo de etapa em `--accent-ink`, caixa alta, `letter-spacing: .08em`: "Passo 1 de 2" e "Passo 2 de 2" (`:449`)
- Título e subtítulo por etapa (`:450-451`): e-mail → "Entrar" / "Use o e-mail da sua conta SGrande Delivery."; senha → saudação neutra com o nome / "Digite sua senha para começar a imprimir."
- **O chip de voltar** (`:447`): aparece só na etapa da senha, com `arrow_back` e o **e-mail digitado**, e volta para a etapa do e-mail **sem perder o endereço** — hoje o `PasswordStep` tem outro caminho de volta; é este que fica
- O campo (`:452-457`): caixa de 46 px com borda `--line`, raio 8, e o realce de foco do desenho — `border-color: var(--accent)` e `box-shadow: 0 0 0 3px var(--accent-soft)` via `:focus-within`. Ícone à direita: `person` na etapa do e-mail (decorativo) e `visibility`/`visibility_off` na da senha, alternando o `type` — o que o `PasswordStep.tsx` já faz com o `IconButton`
- Botão de 46 px, `--accent`, raio 8, com `hover` em `--accent-hover`; estado de carregando como o app já trata
- Erro de credencial continua pelo `useMessaging()`, como hoje

**Atenção ao primitivo:** o `TextField` de hoje (`base/TextField.tsx`) reproduz o label flutuante do MUI, e o desenho **não tem label flutuante** — tem rótulo acima e caixa com borda. São duas formas diferentes. Acrescentar a forma nova **como variante do primitivo** (`variant="boxed"`), não como override de classe na tela (RN-11); o label flutuante continua existindo enquanto outra tela o usar, e a ordem `<input>` antes do `<label>` **não se reordena** na variante antiga: o label reage por seletor irmão.

### 4. O logo remoto sai

Remover a URL de `Login.tsx:84` e qualquer referência a `admin.sgrande.delivery` no renderer. Conferir com `grep -rn "admin.sgrande.delivery\|logo192" src/`.

## Testes

### `src/renderer/components/login/__tests__/Login.test.tsx` (novo)

- Etapa do e-mail: rótulo "Passo 1 de 2", título "Entrar", sem chip de voltar
- Depois do `checkEmail`, etapa da senha: "Passo 2 de 2", o nome na saudação e o chip com o e-mail
- O chip volta para a etapa do e-mail **com o endereço preenchido**
- O olho alterna o `type` do campo entre `password` e `text`
- Credencial recusada mostra a mensagem pelo `MessagingProvider`
- Nenhum `img` com `src` começando em `http` (a rede do RN-01, verificável)
- `expectNoUndefinedClasses(container)`

### `src/renderer/base/__tests__/TextField.test.tsx` (novo ou ampliado)

- A variante antiga mantém a ordem `<input>` antes do `<label>` e o `placeholder=' '`
- A variante nova põe o rótulo acima e não depende de `:placeholder-shown`

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Manual nos dois temas, com a rede desligada: logo presente, foco com o halo laranja
- **Olhar humano é obrigatório nesta tela** (a regra da UI já diz isso para o login): o campo e o botão são reimplementação, não réplica de biblioteca

## Critérios de aceitação

- [ ] As duas etapas seguem o desenho (`:438-467`), conferidas lado a lado
- [ ] O logo aparece com a máquina sem internet
- [ ] O chip de voltar mostra o e-mail e preserva o que foi digitado
- [ ] A saudação não presume gênero
- [ ] O realce de foco é o do desenho
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo, e o aviso do `Login.tsx` não **aumenta**

## Fora de escopo

- Fazer o `Login` consumir `sessionStatus` em vez de `me()` — task própria
- Tirar o `history.push('/login')` do interceptor de erro (`services/apiErrorInterceptor.ts`) — task própria
- "Esqueci minha senha", lembrar e-mail, entrar com outro provedor

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

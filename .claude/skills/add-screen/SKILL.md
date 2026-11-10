---
name: add-screen
description: Passo a passo para criar uma tela (rota) nova no delivery-printer — o componente, o CSS Module, a screen, a rota no Routes.tsx, o caminho de navegação até ela e o teste. Use ao criar uma tela, não ao editar uma existente.
---

# Adicionar uma tela

As regras de CSS Modules, tokens, primitivos e rotas estão em `.claude/rules/renderer-ui.md`: leia antes. Isto é o procedimento.

Hoje existem **sete** rotas (`src/renderer/routes/Routes.tsx`): `/login` dentro de `PublicRoute` (→ `AuthLayout`), e seis dentro de **um único** `ProtectedRoute`, que é uma **rota de layout** (→ `AppShell`, o shell com sidebar e cabeçalho).

São **cinco** passos, e o quinto é o que as pessoas esquecem.

## 1. O componente e o CSS Module

```
src/renderer/components/printing-settings/
├── PrintingSettings.tsx
└── PrintingSettings.module.css
```

Diretório em kebab-case, componente em PascalCase, CSS Module com o mesmo nome do componente. Use os primitivos de `src/renderer/base/` (`Typography`, `Button`, `TextField`, `IconButton`, `Spinner`) em vez de estilizar texto e botão de novo, e `cx()` para combinar classes. Cor e peso novos entram como token em `:root` do `src/renderer/app.css`.

## 2. A screen

```tsx
// src/renderer/screens/PrintingSettingsScreen.tsx
import React from 'react';
import PrintingSettings from '../components/printing-settings/PrintingSettings';

const PrintingSettingsScreen: React.FC = () => <PrintingSettings />;

export default PrintingSettingsScreen;
```

A camada `screens/` é fina de propósito: ela existe para a rota apontar para um nome estável enquanto o componente é reorganizado por dentro. Siga `src/renderer/screens/MainScreen.tsx`.

## 3. A rota

```diff
  <Routes>
    <Route path="/login" element={<PublicRoute element={<LoginScreen />} />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<MainScreen />} />
      <Route path="/printers" element={<PrintersScreen />} />
+     <Route path="/printing-settings" element={<PrintingSettingsScreen />} />
    </Route>
  </Routes>
```

- **A tela entra como filha do `ProtectedRoute` que já existe.** Ele é uma **rota de layout** (renderiza `<Outlet/>` dentro do `AppShell`), e isso não é estilo: **envolver a tela num `ProtectedRoute` próprio remonta o `AppShell` a cada navegação**, e o cleanup dos hooks de socket derruba a conexão — o app para de escutar `printOrder` enquanto o operador troca de tela. Foi exatamente o defeito que a spec 38 consertou, e o `shellSockets.test.tsx` o guarda. **Nunca aninhe um segundo `ProtectedRoute`.**
- **A tela não monta hook de socket** (`useAdminSocket`, `useOrderSocket`, `useBoardSocket`, `usePrintingOrder`, `usePrintingBoard`). Os `SocketStore` são singletons de módulo e o cleanup de um desmonte derruba o socket de quem mais estiver usando: o `AppShell` é o **dono único**. Se a tela precisa saber se há conexão, leia o `useShellConnection()` de `components/layout/shellConnection.ts`.
- **A tela não põe título, padding nem barra de arraste:** o cabeçalho do shell dá o título (do mapa em `components/layout/navigation.ts`), o `.content` dá o `padding: 24px 28px`, e a região arrastável é do shell.
- Tela de autenticação vai em `PublicRoute` (traz o `AuthLayout`).
- O path é em inglês e kebab-case, como o resto dos identificadores.

## 4. O teste

Teste de render em `src/renderer/components/<feature>/__tests__/<Componente>.test.tsx`, com os providers que o componente exige (`AuthProvider`, `MessagingProvider`, `ThemeProvider`).

Asserte pelo papel (`getByRole`, `getByLabelText`), não por classe de CSS — **com uma exceção medida**, que é a armadilha de CSS Modules:

- chame `expectNoUndefinedClasses(container)`, importado de `renderer/__tests__/cssModules`;
- **e afirme que a classe esperada está presente** nos elementos que carregam o layout, contra `styles.<chave>` e nunca contra substring (`toContain('icon')` é satisfeito por `iconButton`).

A segunda parte não é zelo: o helper **só pega concatenação** (`` className={`${styles.x} y`} ``). Medido em 2026-10-28 — em `className={styles.chaveErrada}` o React **omite o atributo**, e em `cx(styles.chaveErrada)` o `cx` descarta falsy e a classe fica **ausente**: nos dois casos não existe `class="undefined"` para o helper achar, e a tela perde o estilo em silêncio. Componentes inteiros já passaram a mutação com a suíte verde por confiar só no helper.

O `vitest.config.ts` processa os `.module.css` (`css: { include: [/\.module\.css$/] }`) justamente para a chave errada virar `undefined`; sem essa linha nem o helper funciona.

## 5. O caminho até a tela — o passo esquecido

**Existe navegação desde a spec 38**, e a entrada continua sendo parte da entrega — rota sem caminho até ela é tela morta, porque a janela não tem barra de endereço.

A entrada normal é a **sidebar**: acrescente um item em `NAV_ITEMS`, em `src/renderer/components/layout/navigation.ts`, com rótulo, ícone (um nome da união do `base/Icon`) e a rota. O mapa de títulos do cabeçalho está no mesmo arquivo — **os dois têm de ganhar a entrada**, senão a tela aparece com título vazio.

Ícone novo no menu exige **regerar o recorte da fonte** (receita em `src/renderer/fonts/README.md`): a união do `Icon.tsx` e a lista `icon_names` do recorte são a mesma lista, e há teste que falha se divergirem.

As outras entradas que o app comporta:

- **Um item no menu da bandeja** (`src/main/tray.ts`), que mostra a janela e manda o renderer navegar. Isso exige um canal IPC do main para o renderer (`webContents.send` + `ipcRenderer.on`); o primeiro desses canais já existe (`ui:theme-changed`), então o padrão está dado
- **Navegação com `useNavigate()`** dentro de um componente, quando a origem é outra tela

A navegação é **hash** (`createHashHistory`), porque em produção o renderer carrega por `file://` e history de path não resolve. Isso não muda o uso, só a URL.

## Checklist

- [ ] componente + `.module.css` em `src/renderer/components/<feature>/`
- [ ] screen em `src/renderer/screens/`
- [ ] rota no `src/renderer/routes/Routes.tsx`, **como filha** do `ProtectedRoute` que já existe (ou em `PublicRoute`), nunca num `ProtectedRoute` novo
- [ ] item em `NAV_ITEMS` **e** no mapa de títulos (`components/layout/navigation.ts`)
- [ ] teste de render com `expectNoUndefinedClasses` **e** afirmação de presença das classes estruturais
- [ ] a tela não monta hook de socket, não põe título nem padding próprios
- [ ] **caminho de navegação até a tela**, implementado e testado à mão em `npm run dev`
- [ ] `npm run typecheck`, `npm run lint`, `npm test`

---
name: add-screen
description: Passo a passo para criar uma tela (rota) nova no delivery-printer — o componente, o CSS Module, a screen, a rota no Routes.tsx, o caminho de navegação até ela e o teste. Use ao criar uma tela, não ao editar uma existente.
---

# Adicionar uma tela

As regras de CSS Modules, tokens, primitivos e rotas estão em `.claude/rules/renderer-ui.md`: leia antes. Isto é o procedimento.

Hoje existem **duas** rotas (`src/renderer/routes/Routes.tsx`): `/login` dentro de `PublicRoute` (→ `AuthLayout`) e `/` dentro de `ProtectedRoute` (→ `DefaultLayout`).

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
    <Route path="/" element={<ProtectedRoute element={<MainScreen />} />} />
+   <Route path="/printing-settings" element={<ProtectedRoute element={<PrintingSettingsScreen />} />} />
  </Routes>
```

- Tela que exige sessão vai em `ProtectedRoute` (traz o `DefaultLayout`); tela de autenticação vai em `PublicRoute` (traz o `AuthLayout`).
- **`ProtectedRoute` tem `const authenticated = true;` hardcoded** (`routes/ProtectedRoute.tsx:10`): hoje ele não protege nada. Não conserte isso dentro desta tarefa — é task própria, porque muda o fluxo de login. Só saiba que a proteção que o nome promete ainda não existe.
- O path é em inglês e kebab-case, como o resto dos identificadores.

## 4. O teste

Teste de render em `src/renderer/components/<feature>/__tests__/<Componente>.test.tsx`, com os providers que o componente exige (`AuthProvider`, `MessagingProvider`) e **com `expectNoUndefinedClasses(container)`** — copie o helper de `src/__tests__/ui.test.tsx:11`. É a única rede contra chave de CSS Module digitada errada, que vira `class="undefined"` e perde o estilo em silêncio.

Asserte pelo papel (`getByRole`, `getByLabelText`), não por classe de CSS.

## 5. O caminho até a tela — o passo esquecido

**Não existe nenhum componente de navegação neste app.** Não há menu, não há abas, não há breadcrumb. Rota registrada no `Routes.tsx` é alcançável só digitando a URL — que o usuário não tem, porque a janela não tem barra de endereço.

Então a entrada é parte da entrega. As opções que o app já comporta:

- **Um `Button` ou link na tela de status** (`src/renderer/components/status/Status.tsx`), navegando com `history.push('/printing-settings')` (`renderer/services/history.ts`) — é o padrão que o logout já usa
- **Um item no menu da bandeja** (`src/main/tray.ts`), que mostra a janela e manda o renderer navegar. Isso exige um canal IPC do main para o renderer (`webContents.send` + `ipcRenderer.on`), que **não existe hoje**: hoje todos os canais vão do renderer para o main. Criar o primeiro é decisão de arquitetura e merece estar escrito na task
- **Navegação com `useNavigate()`** do react-router dentro de um componente, quando a origem é uma tela e não a tray

A navegação é **hash** (`createHashHistory`), porque em produção o renderer carrega por `file://` e history de path não resolve. Isso não muda o uso, só a URL.

## Checklist

- [ ] componente + `.module.css` em `src/renderer/components/<feature>/`
- [ ] screen em `src/renderer/screens/`
- [ ] rota no `src/renderer/routes/Routes.tsx`, dentro de `ProtectedRoute` ou `PublicRoute`
- [ ] teste de render com `expectNoUndefinedClasses`
- [ ] **caminho de navegação até a tela**, implementado e testado à mão em `npm run dev`
- [ ] `npm run typecheck`, `npm run lint`, `npm test`

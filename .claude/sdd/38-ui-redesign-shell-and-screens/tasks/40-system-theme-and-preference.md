# 02 — Tema claro/escuro seguindo o Windows

**Issue:** [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 01
**Status:** pendente

## Objetivo

O app segue o tema do Windows, reagindo à troca com o app aberto, e o operador pode fixar claro ou escuro — com a escolha sobrevivendo ao restart **daquela instalação**. Inclui os três botões nativos da janela, que não são CSS.

## Contexto

- A task [#39](https://github.com/sgrande-delivery/delivery-printer/issues/39) deixou os dois blocos de token prontos; falta quem decida qual vale.
- **O tema é preferência da instalação** (RN-02): mora em arquivo sob `app.getPath('userData')`. O `.env` é build-time, inlinado no instalador e igual para todo restaurante; e o `printerSettings` da `delivery-api` vale para o restaurante inteiro e aparece no painel administrativo — gravar tema lá mudaria a tela de outra pessoa.
- **A cor dos botões nativos da janela não é CSS** (RN-04). A janela usa `titleBarStyle: 'hidden'` com `titleBarOverlay: { color: 'white', symbolColor: '#222', height: 50 }` (`src/main/window.ts:25-30`). No tema escuro esses três botões ficam ilegíveis, e o cabeçalho do desenho reserva 152 px à direita justamente para eles (`../design/printer-v2.dc.html:68`). A altura também muda: o desenho tem cabeçalho de **56 px**, não 50.
- Há molde pronto para o arquivo: `src/main/atomicFile.ts` (`writeFileAtomic`), que a fila usa, e `src/main/queue/print-queue-store.ts` como exemplo de leitura que **nunca derruba o app** quando o arquivo está ilegível.
- **Canal IPC é par** (RN-03): mesmo nome literal no `preload.ts` e no `ipcMain.handle`, e a entrada no stub de `src/__tests__/setup.ts`. Nome divergente devolve promessa rejeitada que ninguém vê — foi o bug do `receive-order`/`notification`.
- Cobre a **RF-04**, a **RN-02**, a **RN-03** e a **RN-04**.

## Mudanças

### 1. `src/main/theme.ts` (novo) — a preferência e a decisão

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
```

- `readPreference()`: lê `ui-preferences.json` de `app.getPath('userData')`; arquivo ausente, ilegível ou com valor fora dos três cai em `'system'` e registra `logger.warn` — nunca lança
- `writePreference(pref)`: `writeFileAtomic`, como a fila
- `resolve(pref)`: `'system'` → `nativeTheme.shouldUseDarkColors`, senão a própria escolha
- `onResolvedChange(cb)`: assina `nativeTheme.on('updated')` e chama de volta **só quando o resolvido muda** (o evento dispara por mais coisa que a troca de claro/escuro, e avisar à toa faz o renderer piscar)

Guardar o arquivo com `{ "theme": "system" }` e não só a string: é o primeiro arquivo de preferência de UI do app, e a próxima preferência não vai querer um segundo arquivo.

### 2. `src/main/ipc-events/onUiTheme.ts` e `onSetUiTheme.ts` (novos) + o par no preload

| Canal | Direção | Assinatura |
| --- | --- | --- |
| `ui:theme` | renderer → main | `(): Promise<{ preference: ThemePreference; resolved: ResolvedTheme }>` |
| `ui:set-theme` | renderer → main | `(preference: ThemePreference): Promise<ResolvedTheme>` |
| `ui:theme-changed` | main → renderer | assinatura, devolvendo a função de cancelar — como `onQueueChanged` (`preload.ts:57-65`) |

Registrar os dois `handle` em `src/main/main.ts` (ao lado dos que já existem, por volta de `:15`), acrescentar os três no `electronHandler` do `preload.ts` e **no stub de `src/__tests__/setup.ts`** — senão todo componente que os chama quebra sob jsdom com `undefined is not a function`.

O tipo do `ThemePreference` mora em `src/shared/uiTheme.ts`, porque os dois processos o importam (`src/shared/` está no `include` dos dois tsconfigs; `src/main/` não serve, porque o electron-vite bundla import relativo e o símbolo acabaria emitido dentro do bundle do renderer).

### 3. `src/main/window.ts` — o overlay acompanha

Extrair as cores do overlay para uma função que recebe o `ResolvedTheme` e devolve `{ color, symbolColor, height: 56 }`, com os valores do desenho: no claro, fundo `--bg` (`#FAF7F5`) e símbolo `--text` (`#2B2725`); no escuro, `--side`/`--surface` e `#FAF7F5`. Aplicar no construtor e chamar `window.setTitleBarOverlay(...)` sempre que o tema resolvido mudar.

A altura vai de 50 para **56**, para casar com o cabeçalho do desenho (`:68`).

### 4. `src/renderer/providers/theme.tsx` (novo) — aplicar e expor

Provider montado acima do roteador (em `src/renderer/App.tsx`, junto dos que já estão lá): lê o tema no `mount`, escreve `data-theme` em `document.documentElement` (apenas `'dark'`; no claro, remove o atributo, para o `:root` valer sozinho), assina `onUiThemeChanged` e devolve o cancelamento no cleanup. Expõe `useTheme()` com `{ preference, resolved, setPreference }`.

Componente nenhum mais lê o tema: todos leem token (decisão arquitetural do plan).

### 5. O alternador, na tela de configurações de hoje

`src/renderer/components/printer-settings/PrinterSettings.tsx` ganha uma seção **Aparência** com três opções — Automático (segue o Windows) / Claro / Escuro — e a frase que evita o mal-entendido: **"vale só neste computador"**. A tela ainda é a antiga; a task [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48) a redesenha e **mantém esta seção**.

Preferência sem onde mexer é preferência morta — é o mesmo motivo pelo qual rota nova precisa de caminho até ela.

## Testes

### `src/main/__tests__/theme.test.ts` (novo)

- `readPreference()` com arquivo ausente, JSON inválido e valor fora dos três devolve `'system'` e não lança
- `resolve('light')` ignora o `nativeTheme`; `resolve('system')` o segue
- `onResolvedChange` **não** chama de volta quando o `updated` dispara sem o resolvido mudar
- `writePreference` → `readPreference` ida e volta

### `src/renderer/providers/__tests__/theme.test.tsx` (novo)

- Preferência `'dark'` escreve `data-theme="dark"` no elemento raiz; `'light'` **remove** o atributo
- `ui:theme-changed` com `'dark'` troca o atributo sem remontar
- O cleanup cancela a assinatura (desmontar e emitir não muda mais nada)
- `setPreference` chama `ui:set-theme` com o valor e reflete o resolvido que o main devolveu

### Integração / sanity

- `grep -rn "ui:theme\|ui:set-theme\|ui:theme-changed" src/` mostra **duas** ocorrências de cada canal (preload + main), mais o stub
- `npm run typecheck` (os dois lados), `npm run lint`, `npm test`
- Manual: trocar o tema do Windows (Configurações → Personalização → Cores) com o app aberto e ver app e botões nativos acompanharem, sem reiniciar; fixar Claro, **fechar pela bandeja**, reabrir, e conferir que continuou claro

## Critérios de aceitação

- [ ] Sem preferência salva, o app abre no tema do Windows
- [ ] Trocar o tema do Windows com o app aberto troca o app e os três botões nativos da janela
- [ ] Fixar Claro ou Escuro vence o sistema e sobrevive a fechar pela bandeja e reabrir
- [ ] Apagar `ui-preferences.json` à mão não impede o app de abrir
- [ ] Os três canais existem nos dois lados e no stub de teste
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- O lugar definitivo do alternador no desenho — task [#48](https://github.com/sgrande-delivery/delivery-printer/issues/48)
- Outras preferências de UI (densidade, zoom): o arquivo nasce preparado, mas nada mais entra nele aqui
- Tema da bandeja e da notificação nativa — fora da spec

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

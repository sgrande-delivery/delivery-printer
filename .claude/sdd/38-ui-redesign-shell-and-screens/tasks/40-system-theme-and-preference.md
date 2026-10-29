# 02 — Tema claro/escuro seguindo o Windows

**Issue:** [#40](https://github.com/sgrande-delivery/delivery-printer/issues/40)
**Feature:** [Redesenhar a interface do app segundo o Claude Design](../spec.md) — issue #38
**Tipo:** feature
**Processo:** main+renderer
**Depende de:** 01
**Status:** shipped

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

## Implementação

**Concluída em:** 2026-10-28

### Arquivos

Novos: `src/shared/uiTheme.ts` (tipos + `isThemePreference`), `src/main/theme.ts` (+ teste), `src/main/ipc-events/onUiTheme.ts`, `onSetUiTheme.ts`, `src/renderer/providers/theme.tsx` (+ teste), `src/renderer/components/printer-settings/AppearanceSection.tsx` + `.module.css` (+ teste).
Alterados: `src/main/preload.ts`, `src/main/main.ts`, `src/main/window.ts`, `src/renderer/App.tsx`, `src/renderer/components/printer-settings/PrinterSettings.tsx` + teste, `src/__tests__/setup.ts`, `src/renderer/app.css` (nota reversa dos dois hex).

### Canais IPC, com o par conferido por grep

| Canal | Preload | Main |
| --- | --- | --- |
| `ui:theme` | `preload.ts:90` | `main.ts:36` |
| `ui:set-theme` | `preload.ts:93` | `main.ts:37` |
| `ui:theme-changed` (main → renderer) | `preload.ts:98` ouve, `:101` remove | `main.ts:59` envia |

Stub em `src/__tests__/setup.ts:28-30`, com as três funções.

### Decisões

- **Cor do overlay no escuro: `#2b2725`**, o `--bg`, e **não** o `--side`/`--surface` que a task sugeria. O review conferiu no desenho e a task estava errada: o quadro (`:25`) tem `background:var(--bg)`, o `<main>` (`:67`) não declara fundo e o `<header>` (`:68`) só tem borda inferior — o overlay fica sobre o `--bg`. Os quatro valores batem um a um com os tokens
- **Os dois hex ficam duplicados no main, por necessidade:** a cor é exigida no construtor da `BrowserWindow`, antes de existir renderer para consultar. Estão em minúsculas como no `app.css` (maiúsculas quebravam o grep por valor) e o `app.css` ganhou nota reversa ao lado da definição dos tokens
- **`AppearanceSection` fora do ternário** da tela: a preferência continua alcançável quando as configurações do restaurante não carregam (403, erro de rede) — preferência sem onde mexer é preferência morta
- **Valor desconhecido lança**, com `logger.warn` antes, e a rejeição chega ao operador pelo `useMessaging()`; o radio controlado volta sozinho ao valor anterior. Cair para `'system'` em silêncio gravaria uma escolha que ninguém fez. Mesmo padrão de `onPrintTest.ts:25`
- **`subscribed` nunca volta a `false`:** `nativeTheme` é global do processo e não há remontagem no main, então o latch garante uma assinatura só para a vida do app. **Não** é o vazamento de listener da regra de impressão, que é sobre `socket?.on` em `useEffect`

### O que o review pegou, e que eu corrigi antes do commit

Quatro itens, todos mecânicos, e dois deles eram buracos de rede provados por mutação:

1. Duas das três chaves de CSS Module do `AppearanceSection` **sem rede**: mutar `styles.option` e `styles.options` passava com 41 e 17 testes verdes. Entraram as afirmações de presença
2. `checked={preference === option.value}` **sem teste**: trocar por `checked={false}` passava. É o que o operador confere ao reabrir a tela, e é o lado de UI do critério "fixar Claro sobrevive a fechar pela bandeja"
3. `providers/theme.tsx` chamava `window.electron.log` direto, furando o `renderer/services/log.ts` — que existe porque a ponte pode não existir e porque o `context` é clonado estruturalmente, o que **lança de forma síncrona** dentro de um `.catch()`
4. `AppearanceSection.module.css` usava `var(--color-text)`, apelido velho em arquivo **novo** — os apelidos existem para o CSS que já estava lá, e a task #50 os apaga

As três mutações do review foram re-rodadas depois: **as três falham**.

### Testes

20 novos, em 3 arquivos: 11 no `theme.ts` do main (arquivo ausente, JSON inválido, valor fora dos três, chave ausente, valor não-objeto, ida e volta, `resolve`, altura 56 nos dois temas, e as três de `onResolvedChange`), 5 no provider e 4 no `AppearanceSection`.

Mutações verificadas por mim: tirar a guarda de `refreshResolved` → 1 falha; sempre escrever `data-theme` → 3 falhas; as três do review → 1 falha cada.

O teste do `AppearanceSection` ganhou `beforeEach` restaurando o stub: sem ele, o teste novo deixava `uiTheme` resolvendo `dark` e o seguinte clicava num radio já marcado, que não dispara `onChange`.

### Verificação

typecheck **0** · lint **0 erros e 1 aviso** (o da base) · `npm test` **38 arquivos, 233 testes, 232 passando**, com a única falha sendo a pré-existente do `ui.test.tsx`.

### O que não foi verificado, e é o essencial desta task

**Nada do roteiro de Windows foi exercitado**, porque ele não tem como ser automatizado aqui: trocar o tema em Configurações → Personalização → Cores com o app aberto e ver os três botões nativos acompanharem; fixar Claro, **fechar pela bandeja**, reabrir e conferir que continuou claro; apagar o `ui-preferences.json` à mão e ver o app abrir. É o único jeito de exercitar `main.ts:53-60` (`setTitleBarOverlay` + `webContents.send`), e esta base não tem teste de `main.ts`/`window.ts` — os testes aqui simulam o evento por mock.

**Consequência conhecida até a task 03:** o overlay passou a 56 px e as duas barras de título falsas (`Main.module.css`, `Printers.module.css`) ainda são de 50 px e brancas — os botões nativos passam 6 px abaixo delas, e no tema escuro as telas `/` e `/printers` mostram barra branca. Registrado nos aprendizados do plan.

## Branch

`feat/38-ui-redesign-shell-and-screens`, cortada de `test/dev-build-integration` em 2026-10-28, com um commit por task. A base não é `master` porque master não tem o app que esta spec modifica — ver a linha **Branch de trabalho** do [plan.md](../plan.md).

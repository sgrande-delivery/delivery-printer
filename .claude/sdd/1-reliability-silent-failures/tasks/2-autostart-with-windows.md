# 02 — Iniciar com o Windows

**Issue:** [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** feature
**Processo:** main
**Depende de:** (nenhuma)
**Status:** executada

## Objetivo

Fazer o app instalado subir junto com o Windows, respeitando quem desligar isso depois. Hoje, reboot de PDV deixa a impressora parada até alguém notar e abrir o app à mão — e ninguém nota antes do primeiro pedido não sair.

## Contexto

- Não existe `setLoginItemSettings` em nenhum arquivo de `src/main/` (varrido), e o `build` do `package.json` não tem bloco `nsis`: valem os defaults, que não criam atalho de startup
- Cobre a **RF-01** e a **RN-05** da spec
- O registro só pode acontecer com `app.isPackaged`: em desenvolvimento isso registraria o Electron do `node_modules` no startup da máquina de quem desenvolve
- `app.getLoginItemSettings()` devolve `openAtLogin`, então dá para distinguir "nunca configurei" de "o usuário desligou". Sem essa distinção, ligar a cada boot desfaz a escolha de quem desligou
- `openAsHidden` é só macOS. **Correção medida na execução:** `src/main/window.ts:61` lê `process.env.START_MINIMIZED`, e `args` do login item é linha de comando — argumento não vira variável de ambiente, então passar `args` sozinho não faria efeito nenhum. Nada no repo define essa variável (ela é herança do ERB)
- A spec [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26) vai mexer no instalador; esta task é por código e continua valendo depois

## Mudanças

### 1. Registro do início automático

`src/main/autostart.ts` (novo): expõe `registerAutostart()`, que retorna cedo quando `!app.isPackaged`.

A regra: se o app nunca configurou o início automático nesta máquina, ligar. Se já configurou antes, **não tocar** — o valor atual é a escolha de quem mexeu depois. A marca de "já configurei" precisa sobreviver ao restart, então vai num JSON de uma chave em `app.getPath('userData')` (o mesmo lugar que a spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15) vai usar para a fila; aqui sem abstração nova).

### 2. Chamada no boot

`src/main/main.ts` (alterado): chamar `registerAutostart()` dentro do `whenReady`, antes de construir a janela.

## Testes

### `src/main/__tests__/autostart.test.ts` (novo)

- Com `isPackaged` falso, não chama `setLoginItemSettings`
- Primeira execução empacotada: chama com `openAtLogin: true` e grava a marca
- Execução seguinte com `openAtLogin: false` (usuário desligou) e marca presente: **não** chama `setLoginItemSettings`
- Arquivo de marca corrompido não impede o boot

`electron` é mockado com `vi.mock('electron', ...)`, como diz `.claude/agents/test-writer-typescript.md`.

### Integração / sanity

- `npm run typecheck`, `npm run lint`, `npm test`
- Empacotado no Windows: instalar, reiniciar a máquina, confirmar o app na bandeja; desligar o início automático pelo Gerenciador de Tarefas, reiniciar, confirmar que o app **não** subiu e não voltou a se registrar

## Critérios de aceitação

- [ ] Instalado e reiniciada a máquina, o app está na bandeja sem intervenção
- [ ] Desligado pelo usuário, permanece desligado depois de dois reboots
- [ ] Em `npm run dev` nada é registrado no startup do Windows
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo

## Fora de escopo

- Atalho de startup pelo instalador e instalação per-machine — task [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27)
- Interface para o operador ligar/desligar o início automático: se virar pedido, é task na spec [#19](https://github.com/sgrande-delivery/delivery-printer/issues/19), que é onde a configuração mora

## Implementação

**Concluída em:** 2026-10-15

### Processos tocados

main

### Arquivos criados/alterados

- `src/main/autostart.ts` (novo) — `registerAutostart()` e `START_MINIMIZED_ARG`
- `src/main/__tests__/autostart.test.ts` (novo) — 5 cenários
- `src/main/main.ts` — `registerAutostart()` como primeira chamada do `whenReady`
- `src/main/window.ts` — o `ready-to-show` passa a minimizar também por `process.argv.includes(START_MINIMIZED_ARG)`

### Canais IPC criados/alterados

Nenhum. `setLoginItemSettings` é API do main, não IPC; `src/main/preload.ts` ficou intocado.

### Eventos de socket

Nenhum.

### Variáveis de ambiente novas

Nenhuma.

### Decisões que tomei por conta própria

- **A task estava errada sobre o `START_MINIMIZED`** (ver "Correção medida" no Contexto). Em vez de implementar o enunciado, passou-se `args: ['--start-minimized']` no login item e o `window.ts` passou a ler `process.argv`, mantendo a variável de ambiente como escape hatch. Review: **certo, e a melhor das opções** — a constante compartilhada é a única coisa que impede os dois lados de divergirem em silêncio, já que não há teste do `window.ts`
- **Marca ilegível é tratada como "já configurei", e o arquivo não é reparado.** `openAtLogin: false` com marca ilegível é ambíguo entre "nunca configurei" e "o operador desligou", e reativar contra a escolha de quem desligou é o dano irreversível. Review: concordou com a direção, **mas o caminho era silencioso** e agora reporta — sem isso, marca corrompida significaria app que nunca sobe com o Windows, sem rastro (RN-01)
- **`setLoginItemSettings` só é chamado se `openAtLogin` ainda for falso**, e a marca é gravada de qualquer forma. Review: defensável, **mas a guarda não tinha teste nenhum** — `openAtLogin` era sempre `false` no setup, então remover o `!` não quebrava nada. Teste acrescentado pelo review
- **`try/catch` em volta de tudo**, para falha de registro não derrubar o boot. Review: certo; o nível virou `console.error` (era `console.log`, que vai para stdout e escaparia da varredura da spec #11)

### Testes

`src/main/__tests__/autostart.test.ts`, com `vi.mock('electron')` e `mkdtemp` por teste:

- não empacotado → não chama `setLoginItemSettings`
- primeira execução empacotada → liga e grava a marca
- usuário desligou (marca presente) → não toca em nada
- alguém já tinha ligado (marca ausente, `openAtLogin: true`) → não sobrescreve, e grava a marca
- marca corrompida → não lança, não reativa, e **reporta**

Mutações conferidas: tirar a guarda da marca derruba 2 testes; tirar a guarda do `openAtLogin` derruba 1; tirar o `console.error` do caminho ilegível derruba 1.

### Verificação

- `npm run typecheck`: 0
- `npm run lint`: 0 erros, 1 aviso — o `Login.tsx:23` da base
- `npm test`: 8 testes em 3 arquivos (baseline: 3 em 2)
- Empacotamento: **não rodado** — o diff não encosta em `package.json`, `build-config.ts`, `electron.vite.config.ts` nem no workflow

### Como testar

1. `npm run build && npx electron-builder --win --publish never` numa máquina Windows
2. Instalar, reiniciar a máquina, confirmar o app na bandeja
3. Desligar o início automático pelo Gerenciador de Tarefas, reiniciar duas vezes, confirmar que **não** volta

### O que não foi verificado

Tudo que depende de Windows empacotado: que o `--start-minimized` chega em `process.argv`, que a Run key é escrita com os `args`, e os três critérios de reboot. **Risco observado pelo review, a conferir no teste de aceitação:** nos typings do Electron 43, `openAtLogin` pode voltar `true` com a Run key **desativada** pelo Gerenciador de Tarefas (quem distingue é `executableWillLaunchAtLogin`). Se isso acontecer numa primeira execução, a guarda pula o registro, grava a marca e o app nunca sobe com o Windows. Hoje o caminho é quase inalcançável (nada registra o login item antes de nós), mas passa a ser o caso normal depois da spec #26, que cria atalho de startup pelo instalador.

## Branch

`feat/1-reliability-silent-failures`, cortada de `refactor/remove-erb-boilerplate` em 2026-10-15, com um commit por task.

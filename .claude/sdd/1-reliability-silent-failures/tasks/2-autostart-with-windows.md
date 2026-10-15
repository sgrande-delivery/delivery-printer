# 02 — Iniciar com o Windows

**Issue:** [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2)
**Feature:** [Tirar as falhas silenciosas do app de impressão](../spec.md) — issue #1
**Tipo:** feature
**Processo:** main
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Fazer o app instalado subir junto com o Windows, respeitando quem desligar isso depois. Hoje, reboot de PDV deixa a impressora parada até alguém notar e abrir o app à mão — e ninguém nota antes do primeiro pedido não sair.

## Contexto

- Não existe `setLoginItemSettings` em nenhum arquivo de `src/main/` (varrido), e o `build` do `package.json` não tem bloco `nsis`: valem os defaults, que não criam atalho de startup
- Cobre a **RF-01** e a **RN-05** da spec
- O registro só pode acontecer com `app.isPackaged`: em desenvolvimento isso registraria o Electron do `node_modules` no startup da máquina de quem desenvolve
- `app.getLoginItemSettings()` devolve `openAtLogin`, então dá para distinguir "nunca configurei" de "o usuário desligou". Sem essa distinção, ligar a cada boot desfaz a escolha de quem desligou
- `openAsHidden` é só macOS. No Windows, o jeito de subir discreto é o `START_MINIMIZED` que `src/main/window.ts:61` já lê, passado em `args` do login item
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

## Branch

`feat/1-reliability-silent-failures`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

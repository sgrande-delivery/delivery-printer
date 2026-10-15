# 27 — Instalador per-machine, com atalhos e instalação silenciosa

**Issue:** [#27](https://github.com/sgrande-delivery/delivery-printer/issues/27)
**Feature:** [Distribuição no Windows: instalador e assinatura](../spec.md) — issue #26
**Tipo:** chore
**Processo:** build
**Depende de:** (nenhuma)
**Status:** pendente

## Objetivo

Configurar o NSIS para o uso real de PDV: instalação para a máquina inteira, atalho na área de trabalho, escolha de pasta e instalação silenciosa para o suporte — sem perder a atualização automática.

## Contexto

- `package.json` → `build.win` declara só `target: nsis` com `arch: ['ia32', 'x64']`; **não existe bloco `nsis`**, então valem os defaults do electron-builder: `oneClick: true`, `perMachine: false`, sem escolha de pasta
- Cobre a **RF-02**, a **RF-03**, a **RF-04** e a **RF-05**, e é onde a **RN-02** é verificada
- **O risco da task:** o electron-updater baixa a atualização e a aplica no `quit` (`autoInstallOnAppQuit = true`, `src/main/updater.ts:12`). Com instalação per-machine, o instalador precisa de elevação, e o Windows pode exigir UAC numa hora em que ninguém está olhando a tela. Se isso acontecer, o parque **para de atualizar em silêncio** — e é por isso que a decisão pendente 3 da spec existe
- **Não definir `artifactName` e não mexer em `productName`** (RN-01): o link de download do painel depende de `SGrande-Delivery-Printer-Setup-<version>.exe`
- O início automático é resolvido por código na spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2) — esta task não precisa de `createStartMenuShortcut` para isso, e as duas não devem brigar

## Mudanças

### 1. Bloco `nsis`

`package.json` (alterado), em `build`:

```json
"nsis": {
  "oneClick": false,
  "perMachine": true,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "SGrande Delivery Printer"
}
```

Os valores de `oneClick` e `perMachine` são as decisões pendentes 2 e 3 da spec: entram assim e **podem voltar** se a verificação da RN-02 reprovar.

### 2. Verificação da atualização automática

O passo que define a task, e que não é teste de código:

1. empacotar e instalar a versão atual (per-machine)
2. publicar uma versão seguinte pelo fluxo da spec [#7](https://github.com/sgrande-delivery/delivery-printer/issues/7)
3. deixar o app aberto, esperar o download, **fechar pela bandeja** e observar se a atualização conclui sem intervenção
4. registrar o resultado em "Aprendizados" do `plan.md`

Se exigir UAC sem ninguém na frente, voltar `perMachine: false` e registrar o porquê — a decisão está prevista.

### 3. Instalação silenciosa

Confirmar e documentar a flag do instalador NSIS gerado (`/S`, e `/D=` para a pasta), com o comando exato que o suporte vai usar. Documentar na task [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29); aqui é só confirmar que funciona.

## Testes

Não há teste automatizado de instalador. A verificação é empírica, e cada item é um critério:

- instalar com dois usuários do Windows e abrir com os dois
- atualização automática sobre a instalação per-machine
- instalação silenciosa numa máquina sem interação
- nome do arquivo publicado inalterado

## Critérios de aceitação

- [ ] Instalado por um usuário, o app abre para outro usuário da mesma máquina
- [ ] A atualização automática conclui sem intervenção — **ou** a decisão de voltar para per-user está registrada com o motivo
- [ ] Instalação silenciosa funciona com a flag documentada
- [ ] O artefato continua `SGrande-Delivery-Printer-Setup-<version>.exe`
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo (a task não toca `src/`, mas a esteira é a mesma)

## Fora de escopo

- Assinatura — task [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28)
- Documentação para o suporte — task [#29](https://github.com/sgrande-delivery/delivery-printer/issues/29)
- Início automático (spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1), task [#2](https://github.com/sgrande-delivery/delivery-printer/issues/2))
- Mexer em `productName`, `appId` ou `build.publish`

## Branch

`feat/26-windows-distribution`, a branch da spec, com um commit por task. Base sugerida: `origin/master`.

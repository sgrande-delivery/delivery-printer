# Spec — Distribuição no Windows: instalador e assinatura

**Status:** rascunho
**Criada em:** 2026-10-15
**Escopo:** build/empacotamento
**Issue:** [#26](https://github.com/sgrande-delivery/delivery-printer/issues/26)

## Contexto

É a parte que o cliente vê primeiro, e hoje é a que mais parece amadora.

**Nada é assinado.** Não existe `win.certificateFile`, `certificateSubjectName` nem `azureSignTool` no `build` do `package.json`, e o workflow não tem `CSC_LINK`/`CSC_KEY_PASSWORD`. Consequências: o SmartScreen avisa "editor desconhecido" na instalação **e em cada atualização**, e antivírus dá falso-positivo em binário sem assinatura — num app que o restaurante instala por link, isso custa instalação não concluída e ligação para o suporte.

**O instalador está nos defaults.** O `build.win` só declara `target: nsis` com `arch: ['ia32', 'x64']`; não há bloco `nsis`. Então vale `oneClick: true` e `perMachine: false`: instalação de um clique, **por usuário do Windows**, sem escolha de pasta e sem instalação silenciosa documentada. Em PDV com mais de um login do Windows — comum, porque o turno troca —, o app instalado por um não existe para o outro.

**Uma restrição que atravessa tudo:** o link de download do app no `delivery-admin` é hardcoded (`pages/printer-settings/PrinterSettingsForm.tsx`):

```
https://github.com/raphaelcarreiro/delivery-printer-2/releases/download/v${delivery_printer_version}/SGrande-Delivery-Printer-Setup-${delivery_printer_version}.exe
```

Ou seja: o nome do arquivo (`SGrande-Delivery-Printer-Setup-<version>.exe`, derivado de `productName`), o caminho do repo **antigo** (que o GitHub redireciona) e a versão digitada à mão no painel. Mexer em `productName` ou definir `artifactName` quebra o botão de download do painel, em silêncio.

## Objetivo

A instalação e a atualização param de avisar que o editor é desconhecido, o app fica instalado para a máquina (não para um usuário), e o suporte tem instalação silenciosa.

## Requisitos funcionais

- **RF-01** — O instalador e o executável são assinados, e o Windows mostra a empresa.
- **RF-02** — ~~A instalação é per-machine~~, **com atalho na área de trabalho e opção de escolher a pasta**.
  > **A parte per-machine foi DESCARTADA na execução da task #27, pela RN-02 desta própria spec.** Medido: instalação per-machine faz o instalador declarar `RequestExecutionLevel admin` (`installer.nsi:20-25`), então o Windows pede UAC **na criação do processo** quando o updater aplica a atualização no `quit` — e num PDV sem senha de administrador o parque **para de atualizar em silêncio**. A regra venceu o requisito, que é o desenho certo. O resto da RF-02 foi entregue. **Preço aceito e declarado: o app NÃO abre para um segundo usuário do Windows na mesma máquina.** Reverter é uma linha (`build.nsis.perMachine`), mas aí a #27 precisa de Windows real, usuário não-admin e o cenário de migração do parque que hoje está em `%LOCALAPPDATA%`. Detalhe completo nos Aprendizados do `plan.md`.
- **RF-03** — Existe instalação silenciosa documentada para suporte remoto.
- **RF-04** — O nome do artefato continua `SGrande-Delivery-Printer-Setup-<version>.exe`.
- **RF-05** — A atualização automática continua funcionando depois da mudança de instalador. **É a RF que sobreviveu à colisão com a RF-02, e foi ela que decidiu.**

## Regras de negócio

- **RN-01** — **O nome do artefato é contrato com o `delivery-admin`.** Qualquer mudança em `productName` ou `artifactName` tem de ser combinada com o painel, ou o link de download quebra calado.
- **RN-02** — **Per-machine pede elevação, e a atualização automática instala no quit.** O updater baixa e aplica ao fechar o app; com instalação per-machine, o instalador precisa de privilégio. **É a verificação central da spec**: se a atualização passar a exigir confirmação de UAC que ninguém vê, o parque para de atualizar — exatamente o que a migração do boilerplate foi feita para preservar.
- **RN-03** — **Certificado é segredo de esteira.** Vai em secret do repo, nunca no `.env`, que é versionado e vai inlinado no instalador.
- **RN-04** — **Reputação do SmartScreen é por certificado e acumulada.** A primeira versão assinada ainda pode avisar; isso precisa estar dito na entrega, ou alguém vai concluir que não funcionou.
- **RN-05** — **Electron continua em 43.x.** A spec mexe em instalador, não em runtime: subir major removeria o build `ia32` e os PDVs 32-bit.

## Fora do escopo

- Trocar `build.publish` para o repo canônico: instalação existente continua consultando o caminho antigo, e o redirect é parte da infraestrutura de atualização (ver `.claude/rules/autoupdate.md`). Se um dia valer, é task própria com o risco escrito.
- Tirar o link hardcoded do `delivery-admin`: issue de lá.
- Instalador para Linux ou macOS: o `linux: AppImage` existe para teste de empacotamento, e o macOS saiu de propósito.
- Loja (Microsoft Store) ou MSI: nenhum dos dois serve ao fluxo de atualização por `latest.yml`.

## Critérios de aceitação

- [ ] Em máquina limpa, instalar o `.exe` publicado não mostra "editor desconhecido", e as propriedades do arquivo mostram a empresa.
- [x] ~~Instalado por um usuário do Windows, o app abre para outro usuário da mesma máquina.~~ **NÃO ATENDIDO, por decisão registrada** — é o preço de preservar a atualização silenciosa (ver RF-02 e os Aprendizados do `plan.md`).
- [ ] Uma atualização automática conclui sozinha, sem intervenção. **Exige Windows e duas versões publicadas pela esteira** — é a verificação que ainda não foi feita, e a única que fecha a RN-02 empiricamente. Até lá, o que existe é a leitura do fonte (`installer.nsi`, `assistedInstaller.nsh`, `multiUser.nsh`, `NsisUpdater.js`) dizendo que o caminho per-user atualiza no lugar, sem elevação.
- [ ] O nome do arquivo publicado continua o que o painel espera.
- [ ] A instalação silenciosa está documentada e funciona.

## Decisões pendentes

| # | Tema | Recomendação default |
|---|------|----------------------|
| 1 | Qual certificado | **Decisão do dono do negócio, não técnica.** OV tradicional (na casa de US$ 200–400/ano, e com a chave em token físico pelas regras novas da CA/B Forum, o que complica assinar em CI) ou **Azure Trusted Signing** (assinatura na nuvem, mais barato, exige a empresa verificada e um plano Azure). A recomendação é o Azure Trusted Signing, por assinar na esteira sem token físico — e a task [#28](https://github.com/sgrande-delivery/delivery-printer/issues/28) fica bloqueada até a escolha |
| 2 | `oneClick` ou assistente | Assistente (`oneClick: false`) com `allowToChangeInstallationDirectory`, porque instalação em PDV às vezes vai para outro disco. O custo é um clique a mais |
| 3 | ~~Manter `perMachine: true` se a atualização automática exigir UAC~~ | **DECIDIDA em 2026-10-15, na execução da #27: per-user (`perMachine: false`).** A medição no fonte mostrou que per-machine exige elevação no `quit`, então valeu o que esta linha já previa — atualização silenciosa vale mais que instalação compartilhada entre logins. Fica para o dev reverter se, na prática, os PDVs tiverem mais de um usuário do Windows em uso |

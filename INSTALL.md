# Instalação e suporte — SGrande Delivery Printer

Documento para **quem atende o restaurante**. Quem desenvolve ou publica versões
lê o `README.md`.

Convenções desta página, porque suporte age sobre o que está escrito aqui:

- **[medido]** — conferido no código ou rodando o empacotamento, com a fonte ao lado.
- **[a confirmar em Windows]** — deduzido e **ainda não visto num Windows real**.
  Trate como hipótese e, ao confirmar, corrija esta página.
- **[chega com a spec N]** — recurso entregue em outra frente do mesmo release
  (ver o bloco abaixo).

<!-- BLOCO-DEPENDENTE-DE-TELA: início. Se as specs #11, #15 e #19 não forem
     mergeadas antes da release, apague este bloco e as seções marcadas com
     [chega com a spec N]. -->
> **Atenção: versão.** As seções que dependem de tela (exportar logs, tela de
> impressoras, fila de impressão, teste de impressão, configurações de
> impressão) valem **a partir da versão que inclui as specs #11, #15 e #19**.
> Na branch `feat/26-windows-distribution` isoladamente elas ainda **não estão
> presentes**: foram entregues em outra cadeia de PRs (#30, #32, #33, #34),
> mergeada antes da release. Confira a versão instalada (canto da tela
> principal) antes de mandar o operador procurar uma tela.
<!-- BLOCO-DEPENDENTE-DE-TELA: fim -->

## Instalar

**De onde baixar.** O botão "Baixar agora" nas configurações de impressão do
painel. O link é fixo no código do painel
[medido: `delivery-admin`, `PrinterSettingsForm.tsx:232`] e usa a chave
`delivery_printer_version` das configurações de impressão:
`.../releases/download/v<versão>/SGrande-Delivery-Printer-Setup-<versão>.exe`.
É esse link que se manda ao cliente.

**Depois de promover uma release, alguém tem de atualizar
`delivery_printer_version` no painel** (último passo do checklist de release).
Sem isso o botão continua oferecendo a versão antiga: se o cliente baixou
versão velha, o problema é esse passo, não o instalador. A tela de configuração
deste app **mostra** essa chave sem deixar editar; quem edita é o painel.

**Nome do arquivo.** O arquivo publicado se chama
`SGrande-Delivery-Printer-Setup-<versão>.exe` (com hífens). Quem gera o
instalador na própria máquina o vê com espaços; só o nome publicado tem hífens.
Não renomeie o publicado: o link do painel depende do nome exato. [medido]

**Windows 32 ou 64 bits.** Um só instalador serve às duas arquiteturas. [medido:
`build.win.target` com `ia32` e `x64` numa invocação]

**O que o instalador faz.** [medido, `package.json` `build.nsis`]

- é um assistente (não instala com um clique), e permite **escolher a pasta**;
- cria atalho na **área de trabalho** e no **menu Iniciar**;
- instala **para o usuário do Windows que o executou**, sem pedir senha de
  administrador. A pasta padrão de uma instalação nova é
  `%LOCALAPPDATA%\Programs\SGrande Delivery Printer`. Máquinas que já tinham o
  app continuam atualizando na pasta onde ele já estava. [medido no fonte do
  electron-builder; a pasta padrão em Windows real é a confirmar]

**Limitação conhecida.** Por ser instalação por usuário, o app **não aparece
para um segundo login do Windows** na mesma máquina. Se o PDV troca de login
por turno, o app tem de ser instalado em cada login, ou o turno tem de usar o
mesmo login. Isso foi uma troca deliberada: instalação para a máquina inteira
exige administrador, e a atualização automática pararia de funcionar em PDV sem
senha de administrador.

**Não escolha "todos os usuários".** Se o assistente mostrar essa opção
(aparece desabilitada quando o instalador não roda como administrador), não a
use: um PDV instalado assim **para de atualizar sem avisar**. Por isso, não
execute o instalador com "Executar como administrador".

### Aviso do Windows ("editor desconhecido" / SmartScreen)

**Hoje o instalador não é assinado.** Ao abrir o `.exe`, o Windows SmartScreen
pode mostrar "O Windows protegeu o computador" com editor desconhecido, e
antivírus podem marcar o arquivo. O texto exato da tela e dos botões depende da
versão do Windows [a confirmar em Windows]; em geral é preciso clicar em
**Mais informações** e depois **Executar assim mesmo**.

Isso é esperado enquanto não houver assinatura. A assinatura é a task #28 da
spec #26 e está **bloqueada por uma decisão do dono do negócio** (qual
certificado comprar). Mesmo depois de assinado, a primeira versão ainda pode
avisar: a reputação no SmartScreen é acumulada por certificado.

### Instalação silenciosa (suporte remoto)

Em um prompt de comando, na pasta do instalador. A forma é a mesma da
documentação do NSIS; as flags abaixo foram lidas no fonte do instalador do
electron-builder (`assistedInstaller.nsh`), **mas o comando nunca foi rodado
num Windows real** [a confirmar em Windows]:

```bat
SGrande-Delivery-Printer-Setup-2.7.0.exe /S
```

- `/S` instala para o usuário atual (é o padrão). `/S /currentuser` é
  equivalente.
- **Nunca use `/allusers`.** Pelo motivo acima: o PDV deixa de atualizar.
- Para escolher a pasta: `/D=C:\caminho\da\pasta`, **sempre por último** na
  linha. Se a pasta informada não terminar com o nome do app, o instalador
  acrescenta o nome. O `/D=` não leva aspas, mesmo com espaço no caminho
  (comportamento do NSIS, a confirmar).
- Rode com o usuário do Windows que vai operar o app, e **não** como
  administrador.

## Primeiro acesso

Ao abrir, o app pede o login. Use o e-mail e a senha do painel do restaurante.
Depois do login aparecem o nome do restaurante e o indicador de conexão.

**[chega com a spec #19]** As telas de configuração dependem de **duas
permissões independentes** do usuário, cada uma controlando uma tela
[medido: `admin-routes.php` do módulo Printer na `delivery-api`]:

| Permissão | Tela | Rotas da API |
| --- | --- | --- |
| `role:printer` | impressoras | `GET/POST /printers`, `GET/PUT /printers/{id}`, `PATCH /printers/{id}/toggle-active` |
| `role:printer-setting` | configurações de impressão | `GET/PUT /printerSettings` |

Um restaurante pode ter uma e não a outra, então **as duas telas podem dar "sem
permissão" separadamente**. Ao ouvir "sem permissão", pergunte **qual tela**: a
liberação a pedir ao atendimento é diferente para cada uma.

## Conferir que está funcionando

Na tela principal (a única que existe hoje):

- **Indicador de conexão**: "conectando..." enquanto o app liga no servidor;
  "online" quando o restaurante está aberto; "offline" quando está fechado no
  painel. [medido: `RestaurantStatus.tsx`] Um restaurante fechado no painel
  aparece como "offline" **mesmo com a conexão boa** — não confunda com queda
  de rede.
- **Versão instalada**: canto inferior da mesma tela, no formato
  `v2.7.0 - x64` (ou `ia32`). [medido: `Status.tsx`]
- **Teste de impressão** **[chega com a spec #19, task #24]**: imprime uma
  página de teste na impressora escolhida, sem depender do backend. Onde clicar
  é a confirmar na versão publicada. Sem a tela, o teste é fazer um pedido real
  ou de teste no painel e ver se sai.

O app fica na **bandeja do Windows** (perto do relógio). Fechar a janela só a
esconde; para abrir de novo, clique duas vezes no ícone da bandeja ou use
"Abrir" no menu dele. "Fechar" no menu da bandeja encerra o app de verdade.
[medido: `tray.ts`]

## Quando não imprime

Ordem sugerida, do mais barato ao mais caro:

1. **O app está aberto?** Procure o ícone na bandeja. Se não houver, abra pelo
   atalho.
2. **Indicador de conexão.** "conectando..." que não sai significa que o app não
   chega ao servidor: verifique a internet do PDV e o firewall.
3. **Impressora padrão do Windows.** Hoje a impressão sai pela impressora
   configurada no cadastro do restaurante; se o nome cadastrado não existir no
   Windows, a impressão cai na **padrão** do sistema. Confira, em Configurações
   do Windows, se a impressora está ligada, sem papel e sem fila travada, e se
   é a padrão. [comportamento descrito na spec #19; a confirmar em Windows]
4. **Reiniciar o app** (Fechar pela bandeja e abrir de novo).

O que chega com as outras frentes da mesma release, e que o suporte passa a
usar:

| Recurso | Para quê | Chega com |
| --- | --- | --- |
| Tela de impressoras com "não encontrada" | Mostra que o nome cadastrado não casa com nenhuma impressora do Windows, e que a impressão está caindo na padrão. É o roteiro de diagnóstico mais útil | spec #19, task #21 |
| Fila de impressão com trabalhos "falhados" | Pedidos que o app tentou imprimir e não conseguiu, com nova tentativa manual. "Pendente" é normal; "falhado" exige alguém | spec #15 |
| Aviso de falha de impressão | A falha aparece na tela e na notificação do Windows, com o pedido e a impressora | spec #11, task #13 |
| Exportar logs | Entrega o log ao suporte sem acesso remoto | spec #11, task #14 |

Roteiro quando essas telas existirem **[chega com as specs #19 e #15; os
textos exatos das telas são a confirmar na versão publicada]**:

- **Impressora "não encontrada"**: o nome cadastrado não existe no Windows e a
  impressão cai na padrão. Escolha o nome da lista real de impressoras e salve.
  Salvar exige `role:printer`.
- **Fila com falhado**: veja o motivo no log e use a nova tentativa manual
  depois de resolver a causa (impressora ligada, com papel).
- **Impressora desligada ou sem papel** aparece como erro do Windows, não como
  "não encontrada".

### Onde está o log

O arquivo recebe o log da **atualização automática** (erros ao baixar ou
aplicar versão) [medido: `updater.ts`]. Os eventos de impressão e do resto do
app passam a ir para o mesmo arquivo **[chega com a spec #11]**.

```
%APPDATA%\sgrande-delivery-printer-2\logs\main.log
```

Procedência do caminho [medido, mas não visto num Windows]:

- a pasta `sgrande-delivery-printer-2` é o `userData` do Electron 43, medido
  rodando um app de forma idêntica: ele usa o campo `name` do `package.json`,
  **não** o nome de exibição "SGrande Delivery Printer". Confere com o
  `updaterCacheDirName: sgrande-delivery-printer-2-updater` do `app-update.yml`;
- `\logs\main.log` vem do `electron-log`: os typings dizem
  `userData + /logs/ + fileName` e o nome padrão é `main.log`.

Para abrir: tecle `Win + R`, digite `%APPDATA%\sgrande-delivery-printer-2\logs`
e Enter. Com a spec #11, **prefira o botão de exportar logs** (que abre a pasta com o
arquivo selecionado, segundo a spec) em vez de pedir ao operador que navegue por
pastas.

Se o arquivo não existir nessa pasta num Windows real, **o caminho acima está
errado: corrija esta página**.

## Atualização

- É **automática**: o app procura versão nova, baixa e **aplica quando o
  operador fecha o app** (menu da bandeja, "Fechar"). Aparece uma notificação
  "Nova versão disponível". [medido: `src/main/updater.ts`]
- Como o app vive na bandeja e raramente é fechado, a troca pode levar **dias**.
  Para forçar: bandeja, "Fechar", esperar alguns segundos e abrir de novo.
- Fechar a janela no X **não** atualiza; ela só vai para a bandeja.
- Confira a versão no canto da tela principal. Se continua antiga depois de
  fechar de verdade, o motivo mais provável é que a versão nova ainda não foi
  **promovida** a release normal no GitHub (a esteira cria como pré-release, e
  só a promovida chega aos PDVs). Quem publica verifica isso: ver o fluxo de
  release e o rollback em `README.md` e `.claude/rules/autoupdate.md`.
- Se o PDV foi instalado "para todos os usuários" ou como administrador, ele
  pode não atualizar sozinho. Reinstale como descrito acima.
- **Nunca foi verificada uma atualização ponta a ponta num Windows real**
  (spec #26, critério ainda aberto). Essa verificação **exige duas versões
  publicadas pela esteira**, e ninguém a fez ainda. Se uma atualização falhar em campo, o log
  acima é o primeiro lugar a olhar, e a ocorrência deve ser registrada.

## Reinstalar

Baixe o instalador da versão atual e execute por cima: ele troca os arquivos no
lugar. O **cadastro do restaurante não se perde**, porque mora na API. O login é
refeito pela sessão do app.

Ao desinstalar pelo Windows, o instalador oferece apagar também os dados
locais do app; isso só remove arquivos desta máquina (a pasta `userData`
acima). [comportamento do desinstalador lido no fonte; a confirmar em Windows]

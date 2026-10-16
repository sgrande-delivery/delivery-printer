# Spec — Observabilidade: log em arquivo e erro visível ao operador

**Status:** entregue
**Criada em:** 2026-10-15
**Escopo:** main+renderer
**Issue:** [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11)

## Contexto

O `electron-log` está em `dependencies` e configurado — mas **só o updater escreve nele**: `src/main/updater.ts:8` faz `log.transports.file.level = 'info'` e `autoUpdater.logger = log`, e é tudo. O resto do app usa `console`:

- `src/main/main.ts:39` — `.catch(console.log)` no boot
- `src/main/updater.ts:19` — `console.log('Erro ao verificar atualização')`, sem o erro
- `src/renderer/hooks/usePrintingOrder.ts:34` e `usePrintingBoard.ts:32` — `console.error(err)` em falha de impressão
- `src/renderer/providers/auth.tsx:46` — `console.error(err)` na checagem de sessão

No app empacotado o `console` não vai a lugar nenhum que alguém possa ler depois. O efeito prático é que **todo defeito chega como "o cliente ligou dizendo que não imprime"**, sem nada para investigar: não se sabe se o evento chegou, se a API respondeu, se a impressora recusou, nem quando.

E o operador também não sabe: falha de impressão não aparece na tela. O `useMessaging()` (`src/renderer/providers/messaging.tsx`) está montado na árvore e **nenhum hook de impressão o usa**; o canal `notification` existe no preload (`src/main/preload.ts:19`), tem handler (`src/main/ipc-events/onNotification.ts`) e **ninguém o chama**.

## Objetivo

Toda falha relevante deixa rastro em arquivo que o suporte consegue ler, e falha de impressão aparece para quem está no balcão enquanto o cliente ainda está esperando.

## Requisitos funcionais

- **RF-01** — Existe um arquivo de log, com rotação por tamanho, contendo os eventos dos dois processos.
- **RF-02** — O renderer consegue escrever nesse mesmo arquivo.
- **RF-03** — Falha de impressão aparece na tela e na notificação do Windows, com o pedido e a impressora identificados.
- **RF-04** — O operador consegue entregar o log ao suporte sem acesso remoto à máquina.
- **RF-05** — Erro assíncrono não tratado (promise rejeitada, erro de janela) vai para o log em vez de desaparecer.

## Regras de negócio

- **RN-01** — **Log é para o suporte, não para o desenvolvedor.** A linha precisa dizer o que aconteceu, com qual pedido e qual impressora, e em que horário local — não o stack de um módulo minificado.
- **RN-02** — **Log nunca contém credencial.** O app trafega cookie de sessão e JWT; o interceptor de erro do axios carrega `config.headers`. Logar objeto de erro de axios inteiro vaza `Authorization`/`Cookie` — o que vai para o arquivo é escolhido campo a campo, nunca o erro cru.
- **RN-03** — **Aviso ao operador é sobre o que ele pode resolver.** "Sem papel na impressora da cozinha" é aviso; falha de renovação de token é log. Ruído na tela treina o operador a ignorar a tela.
- **RN-04** — **Log não pode crescer sem limite.** Disco cheio num PDV é um incidente pior que o que o log ia ajudar a resolver.
- **RN-05** — **Escrever log nunca derruba o app.** Falha de escrita (disco cheio, permissão, antivírus) é engolida, não propagada.

## Fora do escopo

- Telemetria ou crash reporting externo (Sentry e afins): decisão de produto, custo e privacidade; o app não envia nada para fora hoje.
- Fila durável de impressão — spec [#15](https://github.com/sgrande-delivery/delivery-printer/issues/15), que **depende** desta: fila que falha calada é pior que não ter fila.
- `printer:status` para o painel — task [#25](https://github.com/sgrande-delivery/delivery-printer/issues/25). É sinal operacional para o gestor, não log de suporte.
- Correções de `console.error` nos caminhos que a spec [#1](https://github.com/sgrande-delivery/delivery-printer/issues/1) está tocando: lá eles ganham aviso de tela; aqui ganham arquivo.

## Critérios de aceitação

- [ ] Provocar falha de impressão e encontrá-la no arquivo, com pedido e impressora identificáveis.
- [ ] Provocar falha de login e encontrá-la no arquivo, **sem** cookie, token ou header de autorização em lugar nenhum.
- [ ] Com a impressora desligada, o operador vê o aviso na tela e a notificação do Windows.
- [ ] O botão de exportar abre a pasta com o arquivo selecionado.
- [ ] Uma promise rejeitada não tratada aparece no arquivo.
- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erro novo.

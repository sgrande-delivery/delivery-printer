# Plan — Observabilidade: log em arquivo e erro visível ao operador

**Spec:** [spec.md](./spec.md)
**Issue da feature:** [#11](https://github.com/sgrande-delivery/delivery-printer/issues/11)
**Branch de trabalho:** `feat/11-observability-logs-and-errors`: uma por spec, com todas as tasks em sequência, um commit por task e um PR no fim. O `/execute` completa com a base e a data

## Abordagem técnica

O `electron-log` já é dependência e já grava — falta configurá-lo no boot do **main** (hoje a configuração mora dentro do `AppUpdater`, que é quem por acaso o usa primeiro) e dar ao renderer um caminho até ele.

O renderer não tem Node, então ele não escreve no arquivo: manda por IPC. O `electron-log` tem um caminho próprio para isso (`electron-log/renderer`), e ele depende de `preload`/`contextIsolation` configurados de um jeito específico. A decisão de usar o caminho da biblioteca **ou** um canal IPC explícito (`log` com nível + mensagem) fica para a task [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12), medida no app empacotado: canal explícito é mais código e zero surpresa; o da biblioteca é menos código e depende de detalhe de inicialização que já quebrou em outras bases.

Aviso ao operador usa o que já existe: `useMessaging().handleOpen(...)` para a tela, e o canal `notification` para a notificação nativa — que hoje tem texto fixo de pedido recebido e precisa receber o texto de quem chama.

## Decisões arquiteturais

- **O log é um módulo do main** (`src/main/logger.ts`), configurado antes de qualquer outra coisa no boot. Quem precisa logar importa dele; ninguém configura `electron-log` duas vezes.
- **Campos escolhidos à mão, nunca o erro cru** (RN-02). Vale um helper que extrai de `AxiosError` só método, URL, status e código — e descarta `config.headers` e `response.data`.
- **Nível de arquivo em `info`, console em `debug` só em dev.** O que interessa ao suporte é o caminho de impressão e de sessão, não cada render.
- **Exportar = abrir a pasta.** `shell.showItemInFolder` é uma chamada, não tem dependência e deixa o operador anexar o arquivo onde quiser. Zipar e subir para algum lugar é projeto, não task.

## Tasks

| # | Task | Issue | Arquivo | Depende de | Status |
|---|------|-------|---------|------------|--------|
| 01 | Log em arquivo com rotação, nos dois processos | [#12](https://github.com/sgrande-delivery/delivery-printer/issues/12) | [12-file-logging-with-rotation.md](./tasks/12-file-logging-with-rotation.md) | — | pendente |
| 02 | Mostrar falha de impressão ao operador | [#13](https://github.com/sgrande-delivery/delivery-printer/issues/13) | [13-visible-print-failures.md](./tasks/13-visible-print-failures.md) | 01 | pendente |
| 03 | Exportar os logs para o suporte | [#14](https://github.com/sgrande-delivery/delivery-printer/issues/14) | [14-export-logs.md](./tasks/14-export-logs.md) | 01 | pendente |

Status: `a especificar` → `pendente` → `executada` → `shipped`.

## Ordem de execução

01 → 02 → 03. As duas últimas dependem do arquivo existir; entre elas não há dependência, e a ordem é por valor: avisar o operador vale mais que exportar.

## Dependências de outros repos

Nenhuma.

## Verificação da entrega

- o caminho real do arquivo **tem de ser medido no app empacotado**, não deduzido: o `electron-log` grava em `<userData>/logs/`, e `userData` depende de `app.getName()`, que lê o `package.json` embarcado. A task 01 registra o caminho observado, e a 03 e a documentação do suporte usam esse valor
- a RN-02 se verifica grepando o arquivo depois de provocar 401 e falha de refresh: `Authorization`, `Cookie`, `Bearer` e `access_token` não podem aparecer
- a rotação se verifica forçando escrita até passar do limite configurado

## Aprendizados que valem para as próximas tasks

<!-- Preenchido ao longo da execução. O caminho observado do arquivo de log e a decisão sobre
     electron-log/renderer × canal IPC explícito entram aqui. -->

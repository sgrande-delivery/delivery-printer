# O desenho, congelado

`atualizacoes.dc.html` é a cópia literal da página **Atualizações** do projeto no Claude Design, baixada em **2026-11-11** do canvas:

<https://claude.ai/code/artifact/31f0ea40-92a0-478c-9f87-a4df03ea60dc>

(projeto de origem: <https://claude.ai/design/p/9e936aee-a919-461b-a680-91ae388419c1>)

Ela está aqui pela mesma razão que o `printer-v2.dc.html` da spec 38: a **RN-15** exige fidelidade literal, e isso só é verificável se o valor estiver ao alcance de quem implementa e de quem revisa, sem depender de acesso ao Claude Design. **As tasks citam linha deste arquivo.**

Como ler, além do que o README da spec 38 já explica (`<sc-if>` é condicional, `<sc-for>` é repetição, estilo inline vira CSS Module, tokens no `<helmet>`):

- **O `<script type="text/x-dc">` do fim é a parte mais normativa deste arquivo.** As duas funções que decidem tudo são `sidebarCard(S)` (linha 344) e `mainCard(S)` (linha 365): elas mapeiam **estado → ícone, cor, título, subtítulo, qual botão aparece e o que ele diz**. É de lá que sai a tabela de estados da RF-02 e da RF-03, não do markup.
- O `data-props` (linha 241) declara os seis estados que o mock sabe desenhar — `atualizado`, `verificando`, `disponivel`, `baixando`, `pronta`, `erro` — mais a fila (0 a 5), a tela e o `autoDownload`. São os mesmos nomes do `UpdateStatus` da spec, traduzidos para inglês no código.
- **O mock finge o reinício.** `restart()` (linha 336) troca a versão em memória, volta para `atualizado` e mostra um toast de sucesso. No app de verdade o processo morre e o instalador assume — por isso o toast de "atualizado para a versão X" **não** atravessa (linha 1 da tabela "Fidelidade ao desenho").
- As constantes do topo (`CURRENT = '2.7.0'`, `TARGET = '2.8.0'`, `TOTAL_MB = 43.7`) e o `lastCheck: '10:42'` são dados de mock. O que vale é a **forma** do texto ("v2.8.0", "43,7", "10:42" com vírgula decimal e hora local), não o valor.
- O `eta` do mock é derivado de uma constante inventada (`(100 - progress) * 0.07`). No app ele vem do `bytesPerSecond` do `download-progress`, que pode ser 0 — ver linha 5 da tabela de fidelidade.

O arquivo **não abre no navegador** sem o `support.js` e os assets do projeto de origem, que não foram copiados. Para ver o desenho renderizado, abra o link acima.

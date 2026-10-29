# O desenho, congelado

`printer-v2.dc.html` é a cópia literal de `Delivery Printer v2.dc.html` do projeto no Claude Design, sincronizada em **2026-10-28**:

<https://claude.ai/design/p/9e936aee-a919-461b-a680-91ae388419c1?file=Delivery+Printer+v2.dc.html>

Ela está aqui porque a RN-15 da spec exige fidelidade literal, e isso só é verificável se o valor estiver ao alcance de quem implementa e de quem revisa — sem depender de acesso ao Claude Design. **As tasks citam linha deste arquivo.**

Como ler:

- O bloco `<style>` no `<helmet>` (linhas 12-21) tem os tokens das duas paletas: `:root` é o tema claro, `[data-theme="escuro"]` é o escuro. **São esses hex que entram no `app.css`** — o nome do atributo aqui é `escuro` porque o mock é em pt-BR; no app o atributo é `data-theme="dark"`, porque identificador é em inglês.
- O markup usa tags próprias do runtime do Claude Design: `<sc-if value="{{ x }}">` é condicional e `<sc-for list="{{ xs }}" as="x">` é repetição. Leia-as como `{x && ...}` e `xs.map(...)`.
- Os estilos são inline, de propósito (é um mock de uma página). **Neste repo eles viram CSS Modules** — o valor é que se copia, não a forma de aplicá-lo.
- O `<script type="text/x-dc">` no fim tem o mock de dados e o `renderVals()`, que é onde estão as regras de cor por estado (qual fundo o bloco de saúde usa em cada caso, qual cor o chip recebe, quando o badge aparece). **Essa lógica é tão normativa quanto o markup.**

O arquivo **não abre no navegador** sem o `support.js` do projeto de origem, que é o runtime gerado do Claude Design e não foi copiado — não há o que aprender nele. Para ver o desenho renderizado, abra o link acima.

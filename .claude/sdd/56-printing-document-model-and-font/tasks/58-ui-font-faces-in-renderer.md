# 58 — As faces das três famílias no bundle do renderer

**Issue:** [#58](https://github.com/sgrande-delivery/delivery-printer/issues/58)
**Feature:** [Modelo de documento e fonte na tela de impressão](../spec.md) — issue #56
**Tipo:** feature
**Processo:** renderer (build)
**Depende de:** —
**Status:** shipped

## Branch

`feat/56-printing-document-model-and-font`, cortada de `origin/feature/api-v2-and-redesign` em 2026-11-05.

## Objetivo

Fazer o renderer saber desenhar texto nas três famílias de impressão, para que o cartão de fonte mostre cada nome **escrito na própria face** (RF-03). Vem do pacote, nunca da rede.

## Contexto

- Cobre a **RF-07** e as **RN-06**, **RN-07** e **RN-08** da spec, e resolve a **decisão 2**
- **Os arquivos já estão no repo** desde a spec #52: seis woff2 em `assets/fonts/` (`README.md` de lá tem a tabela com bytes e `sha256`). Eles chegam ao PC por `extraResources: ["./assets/**"]` e hoje só o **main** os lê, por `getAssetPath` (`src/main/printFonts.ts:61`), para o HTML de impressão
- **O bundle do renderer tem zero deles.** A única face do renderer é o recorte da Material Symbols (`src/renderer/app.css:93-99`), importado por caminho relativo e emitido pelo Vite
- **São três faces, não seis** (RN-07): o único consumidor aqui é o nome dentro do cartão, que usa um peso só. Pelos pesos da decisão 1: Plex **500**, Atkinson **400**, Barlow **500** — os mesmos que o `PrintFontEnum::weight()` da API emite para o corpo
- **O renderer é o root do Vite** (`electron.vite.config.ts`, `root: src/renderer`), então a URL do `@font-face` aponta para **fora** do root. O `fs.allow` default do Vite é a raiz do projeto, que contém `assets/` — por isso a expectativa é funcionar nos dois modos, mas **isso tem de ser medido**, não presumido (ver "Verificação")
- **Nada de rede:** o app não busca fonte, ícone nem imagem na internet (`.claude/rules/renderer-ui.md`, RN-01 da spec 38)

## Mudanças

### 1. `src/renderer/app.css` (alterado)

Três `@font-face` logo depois do bloco da Material Symbols (`:93-99`), no mesmo formato:

```css
/* As três famílias que o gestor pode escolher para a impressão, para o nome aparecer na própria
   face na tela de impressão. Os bytes são os mesmos que o main manda para a impressora
   (assets/fonts/README.md); aqui vem só o peso do corpo, que é o único que o rótulo usa. */
@font-face {
  font-family: 'IBM Plex Sans Condensed';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('../../assets/fonts/ibm-plex-sans-condensed-500.woff2') format('woff2');
}
```

e as duas outras: `Atkinson Hyperlegible` / 400 / `atkinson-hyperlegible-400.woff2`, `Barlow Semi Condensed` / 500 / `barlow-semi-condensed-500.woff2`.

Dois pontos que precisam de comentário porque divergem do lado do main de propósito:

- **`font-display: swap`, e não `block` como na impressão.** No papel não existe "depois", então lá é `block` (`src/main/printFonts.ts:30`). Aqui o conteúdo é o **nome da fonte**, texto legível em qualquer face: `block` o esconderia por até 3 s se o arquivo falhasse, e o operador ficaria sem saber qual opção está escolhendo.
- **A grafia da família é a cola com a tabela de opções** (`printDocuments.ts`, task #57). Divergir de uma letra deixa o rótulo no fallback com a tela inteira funcionando e nenhum erro — é o que o teste abaixo existe para pegar.

### 2. `assets/fonts/README.md` (alterado)

A seção "Quem consome" diz hoje que o consumidor é só o `src/main/printFonts.ts`. Acrescentar que **três** das seis faces (os pesos de corpo) também são declaradas no `src/renderer/app.css`, para o rótulo da tela de impressão, e que por isso os mesmos bytes vão **duas vezes** no instalador: em `resources/assets/fonts/` (impressão) e dentro do bundle do renderer (rótulo). Dizer o tamanho medido do delta.

A frase "zero no bundle do renderer (eles não passam pelo Vite)" deixa de ser verdade e tem de sair — README que mente sobre o que vai no instalador é pior que README ausente.

## Testes

### `src/renderer/components/printer-settings/__tests__/printFontFaces.test.ts` (novo)

Teste de **contrato entre dois arquivos** que a linguagem não amarra (CSS não importa TS). Lê `src/renderer/app.css` com `node:fs` — o teste roda em Node, não no bundle:

- Para **cada** opção de `FONT_OPTIONS` que tem `fontFamily`, existe um `@font-face` no `app.css` com aquela família **exata** e aquele `font-weight`
- O `src` de cada um desses blocos aponta para um arquivo que **existe** em disco (resolvido relativo ao `app.css`)
- Nenhuma menção a `fonts.googleapis.com` em `src/renderer/` (RN-08) — varredura simples no diretório
- A opção `original` **não** tem `@font-face` próprio: ela é a fonte da interface

**Verificar por mutação:** renomear a família no `app.css` para `'IBM Plex Sans Condensed '` (um espaço no fim) tem de derrubar o primeiro teste; apontar o `src` para um arquivo inexistente tem de derrubar o segundo. São exatamente as duas falhas que não aparecem na tela nem no console.

## Verificação

Esta task é a única da feature que muda o que vai dentro do instalador, e o ponto em aberto é o caminho para fora do root do Vite. **Medir nos dois modos:**

- **`npm run dev`**: abrir a tela de impressão e conferir que o nome "IBM Plex Sans Condensed" sai **estreito** (e não na fonte da UI). Se o dev server recusar o arquivo (`Failed to load resource`, ou 403 do `fs.allow`), a saída é a da decisão 2: copiar as três faces para `src/renderer/fonts/`, registrar no `README.md` de lá que são os mesmos bytes de `assets/fonts/` e conferir por `cmp`. Registrar o que aconteceu em "Aprendizados" do plan — é informação que vale para a próxima fonte
- **`npm run build`**: `ls -l out/renderer/assets/*.woff2` tem de listar as três, e o delta do bundle entra no relatório
- **Sem rede**: desligar a rede e recarregar — a face continua aplicando. É o que separa "está bundlado" de "está vindo do Google"

## Critérios de aceitação

- [ ] As três famílias aplicam na tela, em `npm run dev` e no build, com a máquina **sem rede**
- [ ] `out/renderer/assets/` contém as três faces depois do `npm run build`, e o delta do bundle está dito no relatório
- [ ] O teste de contrato cai se a grafia da família divergir ou se o arquivo não existir
- [ ] `assets/fonts/README.md` não afirma mais que o bundle do renderer tem zero faces
- [ ] `npm run typecheck`, `npm run lint` e `npm test` seguem como na baseline

## Implementação

Executada em 2026-11-05. Três `@font-face` no `src/renderer/app.css`, o `assets/fonts/README.md` corrigido e um teste de contrato novo (7 testes). **A decisão 2 da spec caiu no default:** o caminho relativo serve, e nada foi copiado para `src/renderer/fonts/`.

### O caminho para fora do root do Vite funciona

`url('../../assets/fonts/<arquivo>.woff2')` a partir do `app.css`, com o root do renderer em `src/renderer`. Medido em 2026-11-05:

- **Build:** `npm run build` emite as três faces em `out/renderer/assets/`, com os bytes exatos de `assets/fonts/` (19 952 / 17 208 / 22 428), e o CSS construído as referencia por `url('./…woff2')` **relativo** — que é o que precisa funcionar sob `file://` em produção.
- **Delta:** `out/renderer` passou de **739 021** para **799 917** bytes (**+60 896**: 59 588 de woff2 + ~1,3 kB de CSS). O JS não mudou.
- **Empacotamento, conferido no asar:** `npx electron-builder --linux dir` deu `app.asar` de 5 475 059 bytes contendo as três faces em `out/renderer/assets/`, e `resources/assets/fonts/` **inalterado**, com os seis woff2. Ou seja: as faces entram **só** pelo bundle do renderer (`files: ["out/**"]`), e o caminho de impressão continua chegando por `extraResources`. Nada de `package.json`, `publish`, `appId`, `extraResources` ou `version` foi tocado.
- **Dev:** servidor Vite com o mesmo root servindo o woff2 por `/@fs/…` com **200, `font/woff2`, 19 952 bytes** — o `fs.allow` default não recusou o arquivo fora do root. **É aproximação, não prova:** o `npm run dev` com Electron real não foi medido (não há display na sessão). Se der 403, a saída é a da decisão 2.

### O teste de contrato, e o furo que ele não tinha

O teste lê o `app.css` com `node:fs` e casa cada família de `FONT_OPTIONS` contra um `@font-face` com a grafia **exata** e o peso. Cinco divergências realistas medidas, todas morrendo: família com espaço no fim, família renomeada só num dos dois lados, bloco apagado, os três blocos apagados, `src` para arquivo inexistente, e `fonts.googleapis.com` num `.tsx` do renderer.

**Faltava uma, e o review a mediu:** face declarada `500` apontando o **arquivo 700** passava nos sete testes. É o erro que não aparece na tela — as duas faces da família ficam idênticas em família+peso+estilo, a última vence, e o arquivo de negrito passa a servir o corpo do texto. Fechada com uma asserção que usa a convenção de nome do diretório (`-<peso>.woff2`), e a mutação agora derruba o teste.

### Ajustes que o review pediu e entraram aqui

- **Bloqueante:** o `assets/fonts/README.md` fechava a seção "Quem consome" com *"Os `700` e nenhum outro peso vão ao renderer"* — o **inverso** do que o diff faz, na frase-resumo que o próximo leitor usa para decidir o peso da próxima face. Corrigida.
- O total rotulado "no instalador" (119 708 bytes) tinha virado o total do diretório: agora diz os dois números, e que o instalador carrega 179 296 bytes de fonte de impressão.
- O comentário do `app.css` qualifica a spec de cada RN: o `src/main/printFonts.ts` também cita uma "RN-07", mas é a da spec 52.
- `.svg` entrou na varredura da RN-08 (um `<style>` dentro de SVG também importa fonte), o `listFiles` passou a usar o `readdirSync` recursivo com `parentPath` — o idioma que o `brandAssets.test.ts:18` já usa —, e os três "por quês" do arquivo foram escritos: por que o `3` é fixo, por que `.md` fica fora da varredura (o `fonts/README.md` tem a URL do Google de propósito) e por que o arquivo se exclui.

### Não verificado

O `npm run dev` com Electron real, o teste com a máquina sem rede, e o rótulo aparecendo na face certa — os três dependem de tela, e o cartão de fonte só existe depois da task #60. Ficam na verificação manual do dev.

`npm run typecheck` 0, `npm run lint` 0 erros e 1 aviso (o da baseline), `npm test` **68 arquivos / 705 testes**.

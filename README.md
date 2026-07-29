# Plastnova · Precificação

Sistema de precificação de produtos da Plastnova. Aplicativo web estático
(HTML, CSS e JavaScript puros, sem framework nem etapa de build), com
Firebase Firestore como banco de dados em tempo real e Firebase
Authentication como controle de acesso. Progressive Web App (instalável em
computador, tablet ou celular).

Este documento descreve **o que o sistema faz** e **como ele é construído
por dentro** — não é um manual de uso.

---

## Visão geral do modelo de dados

O sistema gira em torno de quatro entidades, cada uma vivendo em sua
própria coleção do Firestore, sincronizadas de forma independente:

| Coleção | Conteúdo |
|---|---|
| `materiais` | matéria-prima: nome, unidade de medida, custo por unidade |
| `maoDeObra` | itens de mão de obra: nome/função, unidade de cobrança, valor por unidade |
| `produtos` | produtos, cada um contendo suas variações (tamanhos) e itens gerais |
| `tabelasPreco` | regras de precificação aplicadas globalmente sobre o custo de qualquer produto |
| `backups` | cópias completas e datadas das quatro coleções acima |

Cada coleção é ouvida em tempo real via `onSnapshot`: qualquer alteração
feita em qualquer dispositivo logado aparece nos outros em segundos, sem
recarregar a página. Cada item (um material, um item de mão de obra, um
produto, uma tabela) é um documento independente — editar um não bloqueia
nem sobrescreve os demais, mesmo que duas pessoas estejam mexendo em itens
diferentes da mesma aba ao mesmo tempo.

---

## Materiais (matéria-prima)

Cada material tem três campos: **nome**, **unidade** (`un`, `kg`, `g`, `m`,
`cm`, `L`, `mL`, `m², `pacote`) e **custo por unidade**. O custo aceita até
**5 casas decimais** e nunca é arredondado no armazenamento — só a
exibição em telas de listagem usa uma formatação compacta; nos cálculos
internos, o valor completo (com todas as casas informadas) é sempre
preservado.

A edição de um material cadastrado acontece **em linha, dentro da própria
tabela**: clicar no ícone de edição transforma aquela linha em campos
editáveis com botões de salvar/cancelar, sem reaproveitar ou sobrepor o
formulário de cadastro de um novo item (que fica sempre livre, no topo da
página). Os botões de salvar ficam desabilitados durante a gravação, o que
impede que um duplo clique acidental crie um registro duplicado.

A lista de materiais tem busca por nome/unidade e ordenação (nome A–Z/Z–A,
custo crescente/decrescente).

---

## Mão de obra

Estruturalmente idêntica a Materiais, com uma diferença: em vez de uma
lista fixa de unidades físicas, mão de obra aceita também unidades de
**tempo** (`hora`, `minuto`), além das mesmas unidades padrão dos
materiais. Isso permite modelar tanto itens cobrados por tempo (ex:
"Costureira" a R$/hora) quanto por peça produzida (ex: "Solda" a R$/unidade
soldada), no mesmo cadastro. Mesma regra de precisão (até 5 casas), mesma
edição em linha, mesma busca/ordenação.

---

## Produtos

Um produto é a unidade central do sistema de precificação. Sua estrutura
foi desenhada para refletir como a Plastnova realmente compõe custo: um
mesmo produto (ex. "Cortina corta luz") existe em vários **tamanhos**, e
cada tamanho consome quantidades diferentes de material e mão de obra —
mas nem tudo varia por tamanho.

### Estrutura de um produto

```
produto
├── nome
├── código interno (opcional — identifica o produto no sistema de vendas)
├── % de custos indiretos
├── itens gerais (materiais + mão de obra que entram no custo de TODOS os tamanhos)
└── variações (tamanhos)
    ├── nome do tamanho (ex: "1,40 x 2,20m")
    ├── código interno específico deste tamanho (tem prioridade sobre o código do produto)
    ├── itens específicos (materiais + mão de obra só deste tamanho)
    └── ajustes pontuais sobre os itens gerais (opcional)
```

**Itens gerais** existem para casos como embalagem, energia elétrica ou
etiqueta — coisas que todo tamanho do produto consome igualmente. Cadastrar
um item ali evita repeti-lo manualmente em cada variação.

**Itens específicos** existem para o que realmente muda por tamanho: metros
de tecido, minutos de costura, unidades de solda etc. — cada variação tem
sua própria lista, com suas próprias quantidades.

**Ajustes por tamanho** resolvem o caso intermediário: um item que é geral
"na maioria das vezes", mas que um tamanho específico consome em
quantidade diferente (ou não consome de jeito nenhum). Em vez de duplicar
o item como "específico" em todas as variações, o tamanho excepcional
recebe apenas uma sobrescrita pontual da quantidade daquele item geral —
os demais tamanhos continuam herdando o valor padrão do produto
automaticamente. Tecnicamente, isso é implementado como um mapa
`overridesMaterial` / `overridesMao` por variação, indexado pelo id do
item geral; a ausência de entrada nesse mapa significa "usa o padrão do
produto".

### Cálculo de custo

Para cada variação, o custo total é:

```
custo direto  = Σ(itens gerais efetivos) + Σ(itens específicos da variação)
indiretos     = custo direto × (% de custos indiretos do produto)
custo total   = custo direto + indiretos
```

"Itens gerais efetivos" já leva em conta os ajustes por tamanho descritos
acima. O custo total de cada variação é recalculado a cada renderização, a
partir dos preços atuais cadastrados em Materiais e Mão de obra — ou seja,
atualizar o preço de um material atualiza instantaneamente o custo (e o
preço de venda) de todo produto que o utiliza, em qualquer tamanho, sem
nenhuma ação manual.

O custo direto e o custo total carregam a precisão completa dos valores de
origem durante o cálculo; apenas a exibição final (na ficha, na lista e nas
impressões) é arredondada para 2 casas decimais.

### Código interno

Serve para identificar rapidamente um produto (ou uma variação específica
dele) no sistema de vendas usado no dia a dia, sem precisar bater o nome
por extenso. O código pode ser definido no nível do produto (aplica-se a
todos os tamanhos por padrão) e, opcionalmente, sobrescrito por tamanho —
útil quando cada tamanho tem seu próprio SKU. Aparece na listagem de
produtos, na ficha de cada tamanho e em ambas as impressões.

### Duplicar tamanho

Cada variação pode ser duplicada com um clique, copiando sua lista de
itens específicos e servindo como ponto de partida para um tamanho
parecido — o código interno da cópia é limpo automaticamente, já que um
código não deve se repetir entre tamanhos diferentes.

### Busca

A lista de produtos permite buscar por nome ou por código interno, e
ordenar alfabeticamente.

---

## Tabelas de preço

O preço de venda não é um campo do produto — é calculado a partir do custo
total de cada variação aplicando regras cadastradas de forma **global e
independente** dos produtos, na aba Tabelas de preço. Isso significa que
um mesmo produto pode ter, simultaneamente, um preço para a Tabela A, outro
para a Tabela B, outro para Marketplace etc., todos derivados do mesmo
custo-base.

Cada tabela tem um nome e uma de três regras de cálculo:

- **Margem sobre o preço**: `preço = custo ÷ (1 − margem/100)`. A margem
  informada representa a fração do preço final que é lucro (não uma
  margem sobre o custo).
- **Multiplicador direto**: `preço = custo × valor`. Um valor `2`, por
  exemplo, produz exatamente o dobro do custo.
- **Marketplace**: `preço = custo ÷ (1 − (comissão% + margem%)/100)`.
  Soma a comissão cobrada pela plataforma de venda (Mercado Livre, Shopee
  etc.) à margem desejada antes de aplicar a mesma fórmula de margem sobre
  o preço — o preço resultante já embute o repasse da comissão, sem que a
  margem real de lucro seja corroída por ela.

O preço final é sempre arredondado para 2 casas decimais na exibição. A
lista de tabelas mostra, para cada uma, um exemplo de preço resultante de
um custo hipotético de R$ 100 — uma forma rápida de comparar o efeito de
cada regra sem precisar abrir um produto.

O botão de impressão da tabela de preços geral (todos os produtos, todos
os tamanhos, todas as tabelas cadastradas, lado a lado) fica nesta aba.

---

## Impressão

Duas saídas impressas, geradas via `window.print()` com uma folha de
estilos dedicada (`@media print`) que oculta a interface normal e mostra
apenas uma tabela limpa, em preto sobre branco:

- **Ficha de um produto**: para cada tamanho, lista os itens gerais e
  específicos com suas quantidades e subtotais, o percentual de custos
  indiretos aplicado, o custo total, e o preço calculado em cada tabela de
  preço cadastrada.
- **Tabela de preços geral**: uma linha por produto × tamanho, com código
  interno, custo e o preço em cada tabela — pensada para consulta rápida
  ou para deixar impressa junto ao posto de vendas.

Como a impressão usa o recurso nativo do navegador, "salvar como PDF" no
diálogo de impressão produz um PDF sem depender de nenhuma biblioteca
extra.

---

## Backup

Cada execução de backup — automática ou manual — grava **um documento por
aba** (materiais, mão de obra, produtos, tabelas de preço) na coleção
`backups`, todos compartilhando o mesmo identificador de lote (a data/hora
ISO do momento em que o backup foi feito). Isso permite, no histórico:

- ver todos os lotes de backup já feitos, com data/hora e se foram
  automáticos ou manuais;
- baixar o conteúdo de **uma aba específica** de um backup específico, sem
  precisar restaurar/baixar tudo junto;
- restaurar **só uma aba** de um backup antigo, sobrescrevendo apenas os
  itens daquela coleção;
- excluir um lote de backup do histórico (não afeta os dados atuais, só a
  cópia salva).

**Backup automático**: como o sistema é um site estático, sem processo de
servidor rodando continuamente, não há como agendar uma execução garantida
em horário fixo sem depender de infraestrutura paga adicional (Cloud
Functions). Em vez disso, toda vez que o app é aberto por qualquer pessoa
logada, ele verifica há quanto tempo o último backup foi feito; se fizer
mais de 12 horas (ou nunca tiver existido um), um novo backup automático é
disparado nesse momento. Na prática, com o uso normal do sistema ao longo
do dia, isso se aproxima de duas execuções diárias sem exigir nada manual.

**Importação de arquivo**: além do histórico guardado no Firestore, é
possível importar um `.json` baixado anteriormente — o caminho de
recuperação para o cenário extremo em que o próprio projeto Firebase for
perdido.

---

## Autenticação

O acesso ao aplicativo é protegido por Firebase Authentication
(e-mail/senha). Não existe fluxo de autocadastro dentro do app — contas só
são criadas manualmente, pelo administrador, direto no Firebase Console.
As regras do Firestore exigem `request.auth != null` para qualquer leitura
ou escrita, então a proteção não depende só da tela de login do app: sem
uma sessão autenticada válida, o banco de dados recusa a operação mesmo
que alguém tente acessá-lo diretamente.

---

## Tema claro/escuro

Interface com dois temas, ambos em tons de azul (claro: fundo quase
branco com acentos azuis sobre texto azul-marinho; escuro: fundo
azul-marinho profundo com acentos em azul-ciano). A escolha é aplicada via
atributo `data-theme` na raiz do documento, salva em `localStorage` e
recuperada antes da primeira renderização (um pequeno script inline no
`<head>`), para evitar o "flash" do tema errado ao carregar a página.

---

## Progressive Web App

Manifesto (`manifest.json`), ícones (192px/512px, gerados a partir do
logo da Plastnova) e um service worker (`sw.js`, estratégia
network-first) tornam o app instalável como aplicativo nativo em
desktop, tablet ou celular, com ícone próprio e sem a barra de endereço do
navegador.

---

## Estrutura de arquivos

```
index.html          tela de login + estrutura das abas
style.css            paleta de cores (claro/escuro), tipografia, layout
app.js                toda a lógica: Firestore, autenticação, cálculo de
                       preços, renderização das abas, busca/ordenação,
                       backup, impressão
firebase-config.js    credenciais do projeto Firebase
manifest.json / sw.js  suporte a instalação como PWA
icon-*.png / favicon.png  ícones gerados a partir do logo
```

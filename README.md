# Plastnova - Precificação

App estático (HTML/JS puro, sem build) para cadastrar materiais, mão de obra
e produtos — com tamanhos/variações e itens gerais — e calcular preço de
venda em tempo real. Os dados ficam no Firestore, então funciona de qualquer
navegador e sincroniza entre dispositivos automaticamente.

## 1. Firebase já configurado

As chaves do projeto `precificacao-plastnova` já estão em `firebase-config.js`.

## 2. Ativar login (Authentication)

O app exige e-mail/senha pra entrar — sem isso, qualquer pessoa com o link
poderia ver e editar os dados. Passos:

1. No Firebase Console: **Build → Authentication → Get started**
2. Aba **Sign-in method** → ative o provedor **E-mail/senha**
3. Aba **Users → Add user** → crie um usuário (e-mail + senha) pra você (e
   outro pra cada pessoa que for usar o sistema)

Não existe tela de "criar conta" no app — os usuários só são criados por
você, direto no console. Isso é intencional: mantém o acesso restrito a quem
você autorizar manualmente.

## 3. Regras do Firestore (Firestore → Regras)

Agora que existe login, as regras devem exigir usuário autenticado:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 4. Backup

Na aba **Ajustes** do app:

- **Automático**: toda vez que alguém abre o app, ele confere se já passou 12h
  desde o último backup — se sim, cria um novo sozinho. Como o site é
  estático (sem servidor rodando o tempo todo), isso é o que dá pra fazer
  sem custo extra; cobre bem o "2x ao dia" com uso normal. Se no futuro
  quiserem um agendamento garantido mesmo com o app fechado, é possível,
  mas exige Cloud Functions do Firebase num plano pago (Blaze).
- **Manual**: botão "Fazer backup agora", a qualquer momento.
- Cada backup salva **materiais, mão de obra, produtos e tabelas de preço em
  registros separados**, com data/hora, e aparece no histórico da aba
  Ajustes — de lá dá pra baixar `.json` de uma aba específica, restaurar
  só aquela aba, ou excluir o backup do histórico.
- **Importar de arquivo**: recuperação de desastre a partir de um `.json`
  baixado anteriormente (útil se o próprio Firestore for perdido).

## 5. Publicar no GitHub Pages

1. Suba esta pasta para um repositório novo no GitHub
2. **Settings → Pages → Branch: main /(root)** → Save
3. Em alguns minutos o site fica no ar em
   `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

## 6. Instalar no computador ou tablet (opcional)

O app já tem `manifest.json`, `sw.js` e os ícones (`icon-192.png`,
`icon-512.png`, `favicon.png`) gerados a partir do logo da Plastnova — não
precisa criar nada. Abrindo o link no Chrome/Edge vai aparecer a opção
**"Instalar app"** na barra de endereço — funciona em notebook, desktop e
tablet Android. No iPad/iPhone (Safari), usa-se "Adicionar à Tela de Início".

## Tabelas de preço

Na aba **Tabelas de preço** você cadastra quantas regras quiser, cada uma
aplicada sobre o custo de qualquer produto/tamanho automaticamente:

- **Margem sobre o preço (%)**: preço = custo ÷ (1 − margem/100)
- **Multiplicador direto**: preço = custo × valor (ex: 2 = exatamente o dobro)
- **Marketplace**: preço = custo ÷ (1 − (comissão% + margem%)/100) — já
  embute a comissão da plataforma (Mercado Livre, Shopee etc.) além da sua
  margem desejada

## Estrutura

```
index.html          # estrutura da página e abas
style.css            # identidade visual
app.js                # lógica: Firestore + renderização das 3 abas
firebase-config.js    # suas chaves do Firebase (preencher)
manifest.json / sw.js # permitem "instalar" o app
```

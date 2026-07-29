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

No cabeçalho do app: **⬇ (Exportar backup)** baixa um `.json` com todos os
materiais, mão de obra, produtos e tabelas de preço. **⬆ (Importar backup)**
lê esse arquivo e recria os itens no Firestore (usando o mesmo ID salvo no
arquivo — então restaurar não duplica). Recomendado: baixar um backup de
vez em quando e guardar em algum lugar (e-mail pra você mesmo, Google
Drive etc.), já que hoje é a única cópia de segurança fora do Firestore.

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

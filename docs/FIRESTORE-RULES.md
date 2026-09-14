# Firestore Rules — modo profissional

As regras antigas eram:

```text
allow read, write: if true;
```

Isso significa que qualquer pessoa que conhecesse o projeto poderia ler, alterar ou apagar o estoque diretamente pela API. A versão 2.1.0 remove esse acesso público.

## 1. Ative o Firebase Authentication

Firebase Console → **Authentication** → **Começar** → **Sign-in method** → habilite **E-mail/senha**.

## 2. Crie o proprietário

Em **Authentication → Users → Add user**, crie o usuário que terá acesso à adega. Copie o **UID** gerado.

## 3. Crie o documento de autorização

No Firestore crie:

```text
Coleção: adegaConfig
Documento: access
Campo: ownerUids
Tipo: array
Valor: ["UID_DO_PROPRIETARIO"]
```

Para mais de uma pessoa, adicione todos os UIDs no mesmo array.

## 4. Publique as regras

Abra **Firestore Database → Regras**, substitua pelas regras do arquivo `firestore.rules` e clique em **Publicar**.

## 5. Domínio autorizado

Em **Authentication → Settings → Authorized domains**, adicione o domínio de produção da Vercel, por exemplo:

```text
adega-snowy-six.vercel.app
```

## O que passa a ser protegido

- estoque legado;
- documento PRO;
- histórico e degustações;
- configurações;
- acesso ao endpoint Gemini.

A API `/api/ai` usa o token do usuário e consulta `adegaConfig/access`; portanto uma pessoa autenticada mas não autorizada também não consegue consumir sua chave Gemini.

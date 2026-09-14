# Firestore Rules — Adega EID VALÊNCIO PRO 2.1

A V2.1 foi ajustada ao uso familiar informado: **sem Firebase Authentication** e utilizando somente o documento já existente.

```text
adegas/adega-compartilhada
├── estoque[]
└── v2
    ├── settings
    ├── movements
    ├── tastings
    ├── wishlist
    └── events
```

As Rules atuais são suficientes para o funcionamento:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /adegas/adega-compartilhada {
      allow read, write: if true;
    }
  }
}
```

Não é necessário liberar `adega-compartilhada-pro-v2` e não é necessário criar Authentication.

## Segurança

`allow read, write: if true` significa acesso público ao documento para quem conhecer a configuração do Firebase. Isso foi mantido deliberadamente porque a instalação foi definida sem login. Se futuramente a adega deixar de ser exclusivamente familiar, a recomendação é migrar para Authentication + Rules por usuário.

## Compatibilidade

Use a versão PRO 2.1 como interface principal. O frontend antigo fazia `setDoc({ estoque })` sem `merge` e pode apagar o campo `v2` se voltar a gravar no mesmo documento.

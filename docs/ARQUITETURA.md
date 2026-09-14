# Arquitetura — Adega EID VALÊNCIO PRO v2.1

## Princípio de compatibilidade

O projeto mantém o Firebase original e o documento legado:

- Projeto Firebase: `valencio-app`
- Firestore: `adegas/adega-compartilhada`
- Campo legado preservado: `estoque`

O aplicativo novo **não exige migração destrutiva**. Os vinhos continuam em `estoque` no documento legado. Os recursos avançados ficam em `adegas/adega-compartilhada-pro-v2`, no mesmo projeto Firebase. A separação é necessária porque a versão antiga usa `setDoc({ estoque })` sem `merge` e apagaria campos adicionais colocados no documento legado.

## Segurança e identidade

A v2.1 adiciona uma camada de identidade antes do banco:

```text
Usuário
  ↓ Firebase Authentication (e-mail/senha)
UID autenticado
  ↓ Firestore Rules + adegaConfig/access.ownerUids
Adega autorizada
  ├─ estoque legado
  ├─ dados PRO
  └─ /api/ai → Gemini
```

O aplicativo não oferece cadastro público. Usuários são criados manualmente no Firebase Authentication e só recebem acesso quando seu UID estiver em `adegaConfig/access.ownerUids`.

A interface valida a allowlist antes de abrir. A API Gemini recebe um ID token Firebase e usa o próprio Firestore protegido para confirmar que o UID está autorizado antes de consumir `GEMINI_API_KEY`.

## Estrutura de dados

```text
adegaConfig/access
└── ownerUids[]               # allowlist administrativa

adegas/adega-compartilhada
└── estoque[]                 # fonte de verdade do inventário e compatibilidade antiga

adegas/adega-compartilhada-pro-v2
└── v2
    ├── schemaVersion
    ├── movements[]           # auditoria e movimentações
    ├── tastings[]            # diário de degustação
    ├── wishlist[]            # lista de desejos
    ├── events[]              # refeições/eventos planejados
    └── settings
        ├── profileName
        ├── cellarName
        ├── shelves[]
        ├── slotsPerShelf
        └── cloudinary        # cloud name/preset público; nunca API secret
```

Cada vinho continua contendo `quantity`, mas pode possuir `bottles[]`. A auditoria PRO registra também UID/e-mail autenticado quando disponível.

## Concorrência

As gravações feitas pelo app PRO usam transações Firestore lendo o estoque legado e o documento PRO antes de gravar. Isso reduz perda de atualização entre dispositivos PRO. A versão antiga continua tecnicamente capaz de regravar o array inteiro, por isso o recomendado é usar o PRO como interface principal depois da validação.

## Cloudinary

O frontend usa upload **unsigned**, que exige somente `cloudName` e `uploadPreset` público. Nenhum API secret do Cloudinary deve ser colocado no navegador.

A resolução da configuração ocorre nesta ordem:

1. configuração salva em `v2.settings.cloudinary`;
2. cache local do dispositivo;
3. descoberta de configuração pública no mesmo Firebase;
4. configuração manual em Configurações.

## IA

A chave Gemini não é entregue ao navegador. O frontend chama `/api/ai`, enviando o ID token Firebase. A função Vercel valida a autorização no Firestore e só então lê `GEMINI_API_KEY` das Environment Variables e chama Gemini.

A IA recebe uma projeção do estoque atual, não o banco inteiro. O prompt separa fatos cadastrados, conteúdo reconhecido no rótulo e conhecimento enológico geral.

## PWA

`manifest.webmanifest` + `sw.js` permitem instalação no Android e cache do shell. O cache foi versionado para v2.1 para incluir a nova camada de autenticação. O service worker não intercepta `/api/*` nem chamadas externas do Firebase.

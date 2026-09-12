# Arquitetura — Adega EID VALÊNCIO PRO v2

## Princípio de compatibilidade

O projeto mantém o Firebase original e o documento legado:

- Projeto Firebase: `valencio-app`
- Firestore: `adegas/adega-compartilhada`
- Campo legado preservado: `estoque`

O aplicativo novo **não exige migração destrutiva**. Os vinhos continuam em `estoque` no documento legado. Os recursos avançados ficam em um segundo documento, `adegas/adega-compartilhada-pro-v2`, no **mesmo projeto Firebase**. Essa separação é necessária porque a versão antiga usa `setDoc({ estoque })` sem `merge` e apagaria qualquer campo adicional colocado no documento legado.

## Estrutura de dados

```text
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
        └── cloudinary        # somente cloud name/preset público; nunca API secret
```

Cada vinho continua contendo `quantity`, mas pode possuir `bottles[]`. A quantidade é mantida sincronizada com as garrafas armazenadas nos fluxos do app novo.

## Concorrência

As gravações feitas pelo app PRO usam transações Firestore lendo o estoque legado e o documento PRO antes de gravar. Isso reduz perda de atualização entre dispositivos PRO. A versão antiga continua tecnicamente capaz de regravar o array inteiro, por isso o recomendado é usar o PRO como interface principal depois do deploy; ainda assim, os dados V2 ficam protegidos em outro documento e não são apagados pelo frontend antigo.

## Cloudinary

O frontend usa upload **unsigned**, que exige somente `cloudName` e `uploadPreset` público. Nenhum API secret do Cloudinary deve ser colocado no navegador.

A resolução da configuração ocorre nesta ordem:

1. configuração salva em `v2.settings.cloudinary` da própria adega;
2. cache local do dispositivo;
3. descoberta de configuração pública no mesmo Firebase (`settings/integrations`, `settings/publicIntegrations`, `integrations/cloudinary`, `config/publicIntegrations`);
4. configuração manual em Configurações.

## IA

A chave Gemini não é entregue ao navegador. O frontend chama `/api/ai`, e a função Vercel lê `GEMINI_API_KEY` das Environment Variables.

A IA recebe uma projeção do estoque atual, não o banco inteiro. O prompt força separação entre:

- fatos cadastrados no Firebase;
- conteúdo reconhecido visualmente no rótulo;
- conhecimento enológico geral.

Ela não deve completar estoque, quantidade, safra ou posição ausentes.

## PWA

`manifest.webmanifest` + `sw.js` permitem instalação no Android e cache do shell do aplicativo. Dados continuam vindo do Firestore quando há conexão. O service worker não intercepta `/api/*` nem chamadas externas do Firebase.

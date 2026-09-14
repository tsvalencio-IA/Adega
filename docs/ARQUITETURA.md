# Arquitetura — Adega EID VALÊNCIO PRO 2.1

## Fonte de verdade

O projeto preserva o Firebase original:

- projeto: `valencio-app`;
- documento: `adegas/adega-compartilhada`;
- inventário: campo `estoque`;
- dados profissionais: campo `v2` no mesmo documento.

```text
adegas/adega-compartilhada
├── estoque[]
└── v2
    ├── schemaVersion: 3
    ├── movements[]
    ├── tastings[]
    ├── wishlist[]
    ├── events[]
    └── settings
        ├── profileName
        ├── cellarName
        ├── layoutMode: single_shelf
        ├── columns: 5
        └── cloudinary
```

As gravações PRO usam transações Firestore e `merge`, preservando estoque e metadados profissionais no mesmo commit lógico.

## Armário

A localização é por garrafa. A posição é um número positivo e representa a leitura física da prateleira da esquerda para a direita, cinco posições por fileira:

`1–5`, `6–10`, `11–15` e assim por diante.

Na migração, posições legadas A/B/C/D, posições duplicadas e garrafas sem posição são normalizadas. A ordem inicial segue os rótulos em ordem alfabética, correspondente à disposição informada pelo usuário. Mover para uma posição ocupada troca as duas posições.

## Compatibilidade

O sistema lê registros antigos que possuem apenas quantidade. Para cada quantidade disponível, cria a representação de garrafa necessária sem modificar a quantidade oficial. Depois da primeira migração, a estrutura enriquecida é gravada no mesmo `estoque`.

A versão antiga não deve continuar gravando após a migração porque utilizava `setDoc({ estoque })` sem `merge`.

## Cloudinary

O frontend utiliza upload unsigned com `cloudName` + `uploadPreset`. Nenhum API Secret é colocado no navegador. A configuração é salva em `v2.settings.cloudinary` e também mantida em cache local de recuperação.

## IA

A chave Gemini fica somente na Vercel. `/api/ai` recebe uma projeção do estoque e separa dados cadastrados de conhecimento enológico geral.

## PWA

O service worker 2.1 usa cache próprio e inclui os módulos `store-core`, `store-actions`, `store-meta`, `ui-v21` e o CSS do armário físico.

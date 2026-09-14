# Adega EID VALÊNCIO PRO

Aplicação premium para gestão da adega pessoal, construída a partir da base original e mantendo o **mesmo Firebase** e o mesmo documento de estoque.

## O que esta versão entrega

- dashboard com total de garrafas, rótulos, países, favoritos e valor cadastrado;
- cadastro manual e leitura de rótulo por câmera/galeria com IA;
- upload opcional da foto original para o mesmo Cloudinary;
- inventário pesquisável por rótulo, produtor, uva, região e país;
- filtros, ordenação, favoritos e estoque baixo;
- controle por garrafa, além da quantidade total compatível com o sistema antigo;
- localização física por prateleira e posição;
- adega visual com posições ocupadas/livres;
- movimentações com auditoria (entrada, saída, edição, consumo e exclusão);
- fluxo **Abrir garrafa** com nota, refeição, ocasião, companhia e observação;
- diário de degustações;
- wishlist;
- eventos/refeições planejados;
- Sommelier IA conectado ao estoque real;
- ficha técnica e harmonização por vinho;
- planejamento de refeição usando somente rótulos disponíveis;
- backup JSON, restauração e exportação CSV;
- PWA instalável no Android;
- backend Gemini protegido por função serverless na Vercel e autenticação Firebase;
- interface mobile-first e responsiva para celular e computador.

## Compatibilidade com o projeto antigo

O aplicativo continua usando:

```text
Firebase project: valencio-app
Firestore: adegas/adega-compartilhada
campo legado: estoque
```

Os recursos novos ficam em `v2` no documento `adegas/adega-compartilhada-pro-v2`, dentro do **mesmo Firebase**. O estoque permanece em `adegas/adega-compartilhada`. Essa separação protege o diário/configurações porque o frontend antigo sobrescreve o documento de estoque sem `merge`. Não há migração destrutiva nem criação de outro projeto Firebase.

## Cloudinary

O projeto antigo anexado não continha a configuração do Cloudinary. Esta versão não inventa credenciais. Ela tenta localizar a configuração pública no mesmo Firebase e também permite informar, uma única vez, o `cloudName` e o `unsigned upload preset` que você já usa.

Nenhum Cloudinary API Secret deve ser colocado no frontend.

## Gemini / IA

A chave Gemini da versão antiga não foi copiada para o novo repositório. Configure na Vercel:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Veja `docs/DEPLOY.md` para o passo a passo completo.

## Estrutura

```text
.
├── .github/workflows/validate.yml
├── api/
│   └── ai.js
├── assets/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── css/
│   └── app.css
├── docs/
│   ├── ARQUITETURA.md
│   ├── DEPLOY.md
│   └── FIRESTORE-RULES.md
├── js/
│   ├── ai.js
│   ├── app.js
│   ├── auth.js
│   ├── cloudinary.js
│   ├── config.js
│   ├── firebase.js
│   ├── store.js
│   └── utils.js
├── scripts/
│   └── check.mjs
├── .env.example
├── .gitignore
├── firebase.json
├── firestore.rules
├── index.html
├── manifest.webmanifest
├── package.json
├── SECURITY.md
├── sw.js
└── vercel.json
```

## Teste estrutural

Com Node instalado, opcionalmente rode:

```bash
npm run check
```

O script verifica arquivos obrigatórios, sintaxe JavaScript, JSON e padrões óbvios de segredo indevidamente versionado. O mesmo teste roda automaticamente no GitHub Actions a cada push em `main`/`master`.

## Segurança profissional — v2.1.0

A versão 2.1.0 adiciona login obrigatório por Firebase Authentication e substitui o modelo público `allow read, write: if true` por autorização individual via UID.

O bootstrap está documentado em [`docs/FIRESTORE-RULES.md`](docs/FIRESTORE-RULES.md). O aplicativo não possui cadastro público; usuários são criados manualmente no Console Firebase e autorizados no documento `adegaConfig/access`.

A API Gemini também valida a sessão e a autorização antes de usar `GEMINI_API_KEY`, reduzindo o risco de terceiros consumirem sua cota da IA.

## Publicação recomendada

**GitHub privado + Vercel.** A Vercel é necessária para `/api/ai`, onde fica a integração segura com Gemini.

Leia: [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/FIRESTORE-RULES.md`](docs/FIRESTORE-RULES.md) e [`SECURITY.md`](SECURITY.md).

---

Powered by **thIAguinho Soluções Digitais**

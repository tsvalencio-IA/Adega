# Segurança — Adega EID VALÊNCIO PRO

## Estado da versão 2.1.0

- Firebase Authentication obrigatório para abrir o aplicativo.
- Não existe cadastro público na interface.
- Firestore restrito a UIDs explicitamente autorizados em `adegaConfig/access`.
- Os únicos documentos acessíveis pelo cliente são `adegas/adega-compartilhada` e `adegas/adega-compartilhada-pro-v2`.
- Exclusão dos documentos raiz é negada pelas Rules.
- A API do Gemini exige token Firebase válido e confirma a autorização no Firestore antes de consumir a chave Gemini.
- `GEMINI_API_KEY` permanece exclusivamente na Vercel.
- Chaves públicas do Firebase não são tratadas como segredo; a proteção real vem de Auth + Rules.
- O Cloudinary continua compatível com o mesmo `cloudName` e preset existente. Um unsigned preset deve ser limitado no painel Cloudinary por formato, tamanho e pasta.

## Bootstrap seguro

Antes de publicar `firestore.rules`:

1. Ative **Authentication → Sign-in method → Email/Password**.
2. Em **Authentication → Users**, crie manualmente o(s) usuário(s) autorizado(s). Não habilite cadastro público no aplicativo.
3. Copie o UID do usuário.
4. No Firestore, crie `adegaConfig/access` com o campo `ownerUids` do tipo array contendo esse UID.
5. Publique o conteúdo de `firestore.rules`.
6. Em **Authentication → Settings → Authorized domains**, confirme o domínio da Vercel.

Se o UID não estiver em `ownerUids`, a conta pode autenticar, mas não consegue ler o estoque nem usar a IA.

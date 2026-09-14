# Publicação — Adega EID VALÊNCIO PRO v2.1

## Ordem obrigatória

A versão 2.1 usa Firebase Authentication e Rules fechadas. **Não publique as novas Rules antes de criar o usuário e o documento de autorização**, ou você poderá bloquear o acesso ao próprio estoque.

## 1. Firebase Authentication

No projeto `valencio-app`:

1. Firebase Console → **Authentication → Começar**.
2. **Sign-in method → E-mail/senha → Ativar**.
3. **Users → Add user**.
4. Crie manualmente a conta que terá acesso à adega.
5. Copie o **UID** dessa conta.

O aplicativo não possui cadastro público.

## 2. Documento de autorização

Antes de fechar as Rules, em Firestore → Dados crie:

```text
Coleção: adegaConfig
Documento: access
Campo: ownerUids
Tipo: array
Valor: ["UID_COPIADO_DO_AUTH"]
```

Se quiser autorizar outra pessoa, crie também o usuário em Authentication e adicione o UID ao mesmo array.

## 3. Domínio autorizado

Firebase → Authentication → **Settings → Authorized domains**.

Confirme/adicone o domínio usado na produção, por exemplo:

```text
adega-snowy-six.vercel.app
```

Inclua também um domínio personalizado, se houver.

## 4. Firestore Rules

Abra **Firestore Database → Regras** e publique exatamente o conteúdo de `firestore.rules`.

A partir daí:

- `adegas/adega-compartilhada` deixa de ser público;
- `adegas/adega-compartilhada-pro-v2` passa a ser owner-only;
- `adegaConfig/access` só pode ser lido pelo próprio UID autorizado;
- exclusões dos documentos raiz ficam negadas;
- qualquer outro caminho do Firestore fica bloqueado por padrão.

## 5. Vercel

O repositório deve permanecer conectado à Vercel com Framework Preset **Other**, raiz do repositório e sem Build Command obrigatório.

Em **Vercel → Project → Settings → Environment Variables**, configure:

```text
GEMINI_API_KEY=sua_chave_rotacionada
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_MODEL` é opcional. Depois faça Redeploy.

A API `/api/ai` exige um ID token Firebase e confirma a autorização no Firestore antes de chamar Gemini. Assim um visitante ou um usuário autenticado não autorizado não consegue consumir a chave da IA.

## 6. Cloudinary

O projeto continua compatível com o mesmo Cloudinary. Nenhum `API Secret` deve ficar no frontend.

No primeiro acesso autorizado:

1. Abra ⚙ **Configurações**.
2. Vá à área Cloudinary.
3. Toque em **Procurar no Firebase**; ou informe o mesmo `Cloud name` e o mesmo `Unsigned upload preset` já usados.
4. Teste o upload.
5. Salve.

No Cloudinary, restrinja o unsigned preset por formato de arquivo, tamanho máximo e pasta quando possível.

## 7. Validação de produção

Faça nesta ordem:

1. Abra o site deslogado: deve aparecer somente a tela de login.
2. Entre com uma conta que **não** esteja no `ownerUids`: ela não pode ler o estoque nem usar IA.
3. Entre com a conta autorizada: o estoque antigo precisa carregar normalmente.
4. Cadastre um rótulo de teste e confirme sincronização em outro aparelho com a mesma conta/autorização.
5. Abra/consuma uma garrafa e confira o Diário; a auditoria deve registrar identidade autenticada quando disponível.
6. Teste leitura de rótulo/Cloudinary.
7. Teste o Sommelier.
8. Instale a PWA e confirme novo login/sessão.

## Compatibilidade de dados

O Firebase permanece `valencio-app`.

```text
Estoque legado: adegas/adega-compartilhada
Dados PRO:      adegas/adega-compartilhada-pro-v2
Autorização:    adegaConfig/access
```

Não há migração destrutiva do estoque.

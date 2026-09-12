# Segurança

- A chave Gemini **não** fica no frontend desta versão.
- Não coloque `GEMINI_API_KEY`, Cloudinary API Secret ou credenciais privadas em `js/config.js`.
- Cloudinary no navegador deve usar somente `cloudName` + **unsigned upload preset**.
- A configuração pública do Firebase no frontend identifica o projeto, mas não substitui Firestore Security Rules. Proteja o banco pelas Rules adequadas ao seu cenário.
- A versão anterior continha uma chave Gemini utilizável pelo navegador. Recomenda-se rotacionar essa chave antes da publicação profissional.
- O repositório deve preferencialmente ser privado, mesmo sem segredos versionados.

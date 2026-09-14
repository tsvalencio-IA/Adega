# Changelog

## 2.1.0 — Segurança profissional

- Firebase Authentication obrigatório.
- Login sem cadastro público.
- Firestore Rules owner-only por UID.
- Documento `adegaConfig/access` como allowlist de proprietários.
- API Gemini protegida por token Firebase e autorização Firestore.
- Auditoria passa a registrar UID/e-mail autenticado quando disponível.
- `store.js` incluído no repositório oficial.
- Cache PWA atualizado para 2.1.0.
- Headers de segurança reforçados na Vercel.
- Documentação de bootstrap e domínio autorizado.

## 2.0.0 — Adega EID VALÊNCIO PRO

### Preservado

- mesmo projeto Firebase `valencio-app`;
- mesmo documento de estoque `adegas/adega-compartilhada`;
- campo `estoque` compatível com a aplicação anterior;
- cadastro e controle de quantidade;
- leitura de rótulo por imagem;
- sommelier, ficha técnica e harmonização;
- identidade Adega EID VALÊNCIO.

### Arquitetura

- `index.html` monolítico substituído por módulos separados;
- Firestore com transações nas alterações feitas pelo PRO;
- documento avançado isolado `adegas/adega-compartilhada-pro-v2`;
- fallback local para recursos PRO caso as Rules ainda não autorizem o segundo documento;
- chave Gemini removida do frontend;
- backend `/api/ai` para Vercel;
- Cloudinary com descoberta no mesmo Firebase e configuração pública persistida;
- service worker + manifesto PWA;
- validação automática via GitHub Actions.

### Estoque e adega

- garrafas individuais dentro de cada rótulo;
- localização por prateleira/posição;
- adega visual;
- entrada/saída auditadas;
- fluxo Abrir garrafa;
- favoritos;
- filtros, pesquisa e ordenação;
- valor cadastrado do acervo;
- alerta de estoque baixo;
- reconciliação automática quando a versão antiga altera somente `quantity`.

### Diário

- movimentações;
- degustações com nota, refeição, ocasião, companhia e observação;
- wishlist;
- eventos/refeições planejados;
- perfil/nome registrado nas movimentações PRO.

### IA

- consulta ao estoque real;
- contexto de degustações reais;
- contexto de wishlist e eventos;
- sugestão de vinho disponível;
- planejamento de refeição respeitando quantidade disponível;
- harmonização específica;
- ficha técnica com separação entre dado cadastrado e conhecimento geral;
- leitura de rótulo com instrução explícita para não inventar campos ilegíveis;
- histórico curto de conversa no Sommelier.

### Dados e operação

- backup JSON;
- restauração confirmada;
- exportação CSV;
- diagnóstico de IA;
- descoberta/teste do Cloudinary;
- documentação de deploy, arquitetura, segurança e Rules;
- interface responsiva mobile/desktop;
- rodapé `Powered by thIAguinho Soluções Digitais`.

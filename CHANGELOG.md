# 2.1.0 — armário real e sincronização PRO

- remove o modelo genérico de prateleiras A/B/C/D;
- representa uma única prateleira física em fileiras de cinco posições: 1–5, 6–10, 11–15...;
- migra automaticamente posições antigas ou vazias sem alterar quantidades;
- usa a ordem alfabética atual dos rótulos como ordem física inicial informada;
- novas garrafas ocupam a próxima posição livre;
- mover uma garrafa para posição ocupada faz troca de posições, evitando duplicidade;
- edição de posição do rótulo passa a refletir a garrafa disponível;
- dados PRO (`v2`) e `estoque` passam a sincronizar no mesmo `adegas/adega-compartilhada`;
- elimina a dependência do documento `adega-compartilhada-pro-v2` e o fallback local causado pelas Rules atuais;
- mantém funcionamento sem Firebase Authentication, conforme solicitado;
- Cloudinary manual passa a persistir junto das configurações PRO;
- painel deixa de expor configurações A/B/C/D que não existem no armário real;
- PWA atualizada para cache 2.1.0 e novos módulos de dados.

# 2.0.0 — fundação PRO

- dashboard com estoque e indicadores;
- controle por garrafa;
- adega visual;
- diário de degustações;
- wishlist e eventos;
- Sommelier IA com contexto do estoque;
- backend Gemini na Vercel;
- integração Cloudinary;
- backup JSON e CSV;
- PWA responsiva.

---

Powered by **thIAguinho Soluções Digitais**

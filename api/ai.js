const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_KEY || '';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cleanInventory(inv) {
  if (!Array.isArray(inv)) return [];
  return inv.slice(0, 250).map(w => ({
    id: String(w.id || '').slice(0, 120), wineName: String(w.wineName || '').slice(0, 180), producer: String(w.producer || '').slice(0, 120),
    grape: String(w.grape || '').slice(0, 140), region: String(w.region || '').slice(0, 140), country: String(w.country || '').slice(0, 80),
    year: String(w.year || '').slice(0, 20), type: String(w.type || '').slice(0, 60), quantity: Math.max(0, Number(w.quantity) || 0),
    description: String(w.description || '').slice(0, 500), favorite: Boolean(w.favorite), purchasePrice: Math.max(0, Number(w.purchasePrice) || 0),
    locations: Array.isArray(w.locations) ? w.locations.slice(0, 30).map(x => String(x).slice(0, 40)) : []
  }));
}

function cleanContext(raw = {}) {
  return {
    inventory: cleanInventory(raw.inventory),
    tastings: (Array.isArray(raw.tastings) ? raw.tastings : []).slice(0, 40).map(t => ({
      at: String(t.at || '').slice(0, 40), wineName: String(t.wineName || '').slice(0, 180), year: String(t.year || '').slice(0, 20),
      rating: Math.max(0, Math.min(5, Number(t.rating) || 0)), food: String(t.food || '').slice(0, 220),
      occasion: String(t.occasion || '').slice(0, 160), companions: String(t.companions || '').slice(0, 180), notes: String(t.notes || '').slice(0, 500)
    })),
    wishlist: (Array.isArray(raw.wishlist) ? raw.wishlist : []).slice(0, 30).map(w => ({
      wineName: String(w.wineName || '').slice(0, 180), producer: String(w.producer || '').slice(0, 120), year: String(w.year || '').slice(0, 20), notes: String(w.notes || '').slice(0, 350)
    })),
    events: (Array.isArray(raw.events) ? raw.events : []).slice(0, 25).map(e => ({
      title: String(e.title || '').slice(0, 180), date: String(e.date || '').slice(0, 30), people: Math.max(0, Number(e.people) || 0),
      meal: String(e.meal || '').slice(0, 500), status: String(e.status || '').slice(0, 60)
    }))
  };
}

function cleanHistory(history) {
  return (Array.isArray(history) ? history : []).slice(-8).map(m => ({
    role: m?.role === 'ai' ? 'assistant' : 'user', text: String(m?.text || '').slice(0, 1800)
  }));
}
const SYSTEM = `Você é o Sommelier da Adega EID VALÊNCIO. Regra central: diferencie rigorosamente DADOS CADASTRADOS da ADEGA de conhecimento enológico geral. Nunca invente que um vinho, quantidade, safra, preço, posição ou evento existe. Para estoque, use SOMENTE o JSON fornecido. Se um dado do cadastro estiver ausente, diga que não está cadastrado. Para conhecimento enológico geral, seja técnico e prudente; se não houver segurança suficiente, declare a limitação. Responda em português do Brasil, sem exageros publicitários. Não trate inferência como fato.`;

function promptFor(mode, body) {
  const ctx = cleanContext(body.context || { inventory: body.inventory });
  const contextText = JSON.stringify(ctx);
  const historyText = JSON.stringify(cleanHistory(body.history));
  const msg = String(body.message || '').slice(0, 5000);
  if (mode === 'chat') return `${SYSTEM}\n\nCONTEXTO REAL CADASTRADO (fonte de verdade): ${contextText}\n\nHISTÓRICO RECENTE DA CONVERSA: ${historyText}\n\nPergunta: ${msg}\nResponda de forma direta. Para estoque, use somente context.inventory. Para preferências pessoais, use somente context.tastings e sinalize quando houver poucos registros. Wishlist não é estoque. Eventos planejados não significam consumo realizado. Quando recomendar algo existente, cite nome e quantidade real. Se perguntarem onde está, use somente locations.`;
  if (mode === 'suggest') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\n\nEscolha, entre context.inventory com quantity > 0, uma opção adequada para hoje. Contexto opcional: ${msg || 'nenhum'}. Você pode usar degustações reais para personalizar, mas nunca trate uma inferência de preferência como certeza. Identifique claramente o rótulo escolhido e não recomende item fora do estoque.`;
  if (mode === 'tech_sheet') return `${SYSTEM}\n\nVinho selecionado (cadastro real): ${JSON.stringify(body.wine || {})}\n\nCONTEXTO DA ADEGA: ${contextText}\n\nProduza uma ficha técnica útil. Separe explicitamente o que é "Cadastrado" do que é "Conhecimento enológico geral". Não complete produtor, safra, região, composição ou teor alcoólico se não houver base.`;
  if (mode === 'pairing') return `${SYSTEM}\n\nVinho selecionado: ${JSON.stringify(body.wine || {})}\nPedido de harmonização: ${msg}\nCONTEXTO REAL: ${contextText}\nExplique por que a harmonização funciona em termos de acidez, taninos, corpo, gordura, sal, doçura e intensidade, usando somente características sustentáveis. Se o cadastro não comprovar detalhe específico do rótulo, trate como recomendação geral do estilo/uva, não como fato.`;
  if (mode === 'dinner') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\nEvento/refeição: ${msg}\nMonte um plano objetivo usando EXCLUSIVAMENTE rótulos presentes em context.inventory e respeitando quantity. Use degustações anteriores apenas como preferência observada. Inclua quantidade sugerida de garrafas como estimativa, nunca como consumo exato por pessoa. Se o estoque não for suficiente ou não houver opção adequada, diga claramente.`;
  return `${SYSTEM}\n${msg}`;
}
function scanPrompt() {
  return `Analise APENAS o que é visível no rótulo. Retorne JSON válido, sem markdown, com estas chaves: wineName, producer, grape, region, country, year, type, description, foodPairings. Use null ou string vazia quando não for legível. Não invente uva, safra, região, país ou produtor. description deve descrever somente informações realmente visíveis ou, no máximo, identificar o tipo genérico do produto sem inventar detalhes. foodPairings deve ser [] se o rótulo não trouxer informação suficiente para identificar com segurança o estilo.`;
}

async function geminiCall({ prompt, imageBase64, mimeType, jsonMode }) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY não configurada na Vercel.');
  const parts = [{ text: prompt }];
  if (imageBase64) parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
  const payload = { contents: [{ role: 'user', parts }], generationConfig: { temperature: jsonMode ? 0.05 : 0.25 } };
  if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
  if (!text) throw new Error('A IA retornou resposta vazia.');
  return text;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'GET') return send(res, 200, { ok: true, configured: Boolean(API_KEY), model: MODEL });
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = String(body.mode || 'chat');
    if (mode === 'scan') {
      const img = String(body.imageBase64 || '');
      if (!img || img.length > 4_500_000) return send(res, 400, { error: 'Imagem ausente ou grande demais.' });
      const text = await geminiCall({ prompt: scanPrompt(), imageBase64: img, mimeType: body.mimeType, jsonMode: true });
      let json;
      try { json = JSON.parse(text.replace(/^```json/i, '').replace(/```$/i, '').trim()); }
      catch { return send(res, 502, { error: 'A IA retornou JSON inválido.', raw: text.slice(0, 600) }); }
      return send(res, 200, { ok: true, json });
    }
    const prompt = promptFor(mode, body);
    const text = await geminiCall({ prompt, jsonMode: false });
    return send(res, 200, { ok: true, text });
  } catch (e) {
    return send(res, 500, { error: e?.message || 'Falha na IA.' });
  }
}

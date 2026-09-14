const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

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
    favorite: Boolean(w.favorite), purchasePrice: Math.max(0, Number(w.purchasePrice) || 0),
    locations: Array.isArray(w.locations) ? w.locations.slice(0, 30).map(x => String(x).slice(0, 40)) : []
  }));
}

function cleanContext(raw = {}) {
  const inventory = cleanInventory(raw.inventory);
  const calculated = { labels: inventory.length, bottles: inventory.reduce((n,w)=>n+w.quantity,0) };
  return {
    inventory,
    summary: {
      labels: Math.max(0, Number(raw?.summary?.labels) || calculated.labels),
      bottles: Math.max(0, Number(raw?.summary?.bottles) || calculated.bottles),
      inventoryTruncated: Boolean(raw?.summary?.inventoryTruncated)
    },
    tastings: (Array.isArray(raw.tastings) ? raw.tastings : []).slice(0, 30).map(t => ({
      at: String(t.at || '').slice(0, 40), wineName: String(t.wineName || '').slice(0, 180), year: String(t.year || '').slice(0, 20),
      rating: Math.max(0, Math.min(5, Number(t.rating) || 0)), food: String(t.food || '').slice(0, 220),
      occasion: String(t.occasion || '').slice(0, 160), companions: String(t.companions || '').slice(0, 180), notes: String(t.notes || '').slice(0, 500)
    })),
    wishlist: (Array.isArray(raw.wishlist) ? raw.wishlist : []).slice(0, 20).map(w => ({
      wineName: String(w.wineName || '').slice(0, 180), producer: String(w.producer || '').slice(0, 120), year: String(w.year || '').slice(0, 20), notes: String(w.notes || '').slice(0, 350)
    })),
    events: (Array.isArray(raw.events) ? raw.events : []).slice(0, 15).map(e => ({
      title: String(e.title || '').slice(0, 180), date: String(e.date || '').slice(0, 30), people: Math.max(0, Number(e.people) || 0),
      meal: String(e.meal || '').slice(0, 500), status: String(e.status || '').slice(0, 60)
    }))
  };
}

function cleanHistory(history) {
  return (Array.isArray(history) ? history : []).slice(-8).map(m => ({
    role: m?.role === 'ai' ? 'assistant' : 'user', text: String(m?.text || '').slice(0, 1400)
  }));
}

const SYSTEM = `Você é o Sommelier da Adega EID VALÊNCIO. Há duas classes de informação e você NUNCA pode misturá-las:
1) DADOS CADASTRADOS: estoque, rótulos, quantidade, safra, preço, posição, favoritos, degustações, eventos e wishlist. Para esses fatos, o JSON recebido é a única fonte permitida. Não complete, não estime e não corrija por memória externa.
2) CONHECIMENTO ENOLÓGICO GERAL: harmonização, serviço, estilos e explicações. Pode usar conhecimento geral, mas deve apresentá-lo como orientação, não como fato cadastrado daquele rótulo quando o cadastro não comprovar.
Se faltar um dado, diga literalmente que ele não está cadastrado. Se context.summary.inventoryTruncated for true, nunca afirme que uma lista parcial representa todo o estoque. Responda em português do Brasil, de forma direta e curta. Não trate inferência como fato.`;

function promptFor(mode, body) {
  const ctx = cleanContext(body.context || { inventory: body.inventory });
  const contextText = JSON.stringify(ctx);
  const historyText = JSON.stringify(cleanHistory(body.history));
  const msg = String(body.message || '').slice(0, 5000);
  if (mode === 'chat') return `${SYSTEM}\n\nCONTEXTO REAL CADASTRADO: ${contextText}\n\nHISTÓRICO RECENTE: ${historyText}\n\nPERGUNTA: ${msg}\n\nPara qualquer afirmação sobre o que existe na adega, confira o JSON antes de responder. Se a pergunta for factual e o dado não puder ser provado pelo JSON, diga que não é possível confirmar pelo cadastro. Wishlist não é estoque. Evento planejado não é consumo. Quantidade e posição jamais podem ser inferidas.`;
  if (mode === 'suggest') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\n\nTAREFA: escolha entre context.inventory com quantity > 0 uma opção adequada para hoje. Contexto: ${msg || 'nenhum'}. Não recomende rótulo ausente. Ao citar estoque ou posição, copie os valores do JSON sem alterar.`;
  if (mode === 'tech_sheet') return `${SYSTEM}\n\nVINHO SELECIONADO (cadastro): ${JSON.stringify(body.wine || {})}\n\nCONTEXTO: ${contextText}\n\nProduza uma ficha técnica dividida em "Cadastrado" e "Conhecimento enológico geral". Não invente produtor, safra, região, composição, teor alcoólico ou premiação.`;
  if (mode === 'pairing') return `${SYSTEM}\n\nVINHO SELECIONADO: ${JSON.stringify(body.wine || {})}\nPEDIDO: ${msg}\nCONTEXTO: ${contextText}\nExplique a harmonização. Características específicas do rótulo só podem ser afirmadas se estiverem cadastradas; caso contrário, fale genericamente do estilo/uva.`;
  if (mode === 'dinner') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\nEVENTO/REFEIÇÃO: ${msg}\nMonte um plano usando EXCLUSIVAMENTE rótulos de context.inventory com quantity > 0. Respeite as quantidades cadastradas. Quantidade sugerida de consumo é estimativa e deve ser identificada como tal.`;
  return `${SYSTEM}\n${msg}`;
}

function scanPrompt() {
  return `Analise APENAS o que é visível no rótulo. Retorne JSON válido, sem markdown, com estas chaves: wineName, producer, grape, region, country, year, type, description, foodPairings. Use null ou string vazia quando não for legível. Não invente uva, safra, região, país, produtor, teor alcoólico ou classificação. description deve registrar somente informação visível. foodPairings deve ser [] se o rótulo não permitir identificar com segurança o estilo.`;
}

async function geminiCall({ prompt, imageBase64, mimeType, jsonMode, model = TEXT_MODEL }) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY não configurada na Vercel.');
  const parts = [{ text: prompt }];
  if (imageBase64) parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
  const payload = { contents: [{ role: 'user', parts }], generationConfig: { temperature: jsonMode ? 0 : 0.12, maxOutputTokens: jsonMode ? 1400 : 1800 } };
  if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
  if (!text) throw new Error('A IA retornou resposta vazia.');
  return text;
}

async function openRouterCall(prompt) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY não configurada.');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://adega-snowy-six.vercel.app',
      'X-Title': 'Adega EID VALENCIO'
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.12, max_tokens: 1800 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenRouter HTTP ${response.status}`);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Fallback retornou resposta vazia.');
  return text;
}

async function textCall(prompt) {
  if (API_KEY) {
    try { return { text: await geminiCall({ prompt, model: TEXT_MODEL }), provider: 'gemini', model: TEXT_MODEL }; }
    catch (e) {
      if (!OPENROUTER_API_KEY) throw e;
      console.warn('[ADEGA IA] Gemini falhou; usando fallback:', e?.status || e?.message);
    }
  }
  if (OPENROUTER_API_KEY) return { text: await openRouterCall(prompt), provider: 'openrouter', model: OPENROUTER_MODEL };
  throw new Error('Nenhum provedor de IA configurado. Configure GEMINI_API_KEY na Vercel.');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'GET') return send(res, 200, {
    ok: true,
    configured: Boolean(API_KEY || OPENROUTER_API_KEY),
    geminiConfigured: Boolean(API_KEY),
    fallbackConfigured: Boolean(OPENROUTER_API_KEY),
    textModel: TEXT_MODEL,
    visionModel: VISION_MODEL,
    fallbackModel: OPENROUTER_API_KEY ? OPENROUTER_MODEL : null
  });
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = String(body.mode || 'chat');
    if (mode === 'scan') {
      const img = String(body.imageBase64 || '');
      if (!img || img.length > 4_500_000) return send(res, 400, { error: 'Imagem ausente ou grande demais.' });
      const text = await geminiCall({ prompt: scanPrompt(), imageBase64: img, mimeType: body.mimeType, jsonMode: true, model: VISION_MODEL });
      let json;
      try { json = JSON.parse(text.replace(/^```json/i, '').replace(/```$/i, '').trim()); }
      catch { return send(res, 502, { error: 'A IA retornou JSON inválido.', raw: text.slice(0, 600) }); }
      return send(res, 200, { ok: true, json, provider: 'gemini', model: VISION_MODEL });
    }
    const prompt = promptFor(mode, body);
    const out = await textCall(prompt);
    return send(res, 200, { ok: true, text: out.text, provider: out.provider, model: out.model });
  } catch (e) {
    return send(res, 500, { error: e?.message || 'Falha na IA.' });
  }
}

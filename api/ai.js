const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
const API_KEYS = [process.env.GEMINI_API_KEY, process.env.GOOGLE_GENERATIVE_AI_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);

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
  return {
    inventory,
    summary: {
      labels: Math.max(0, Number(raw?.summary?.labels) || inventory.length),
      bottles: Math.max(0, Number(raw?.summary?.bottles) || inventory.reduce((n,w)=>n+w.quantity,0)),
      inventoryTruncated: Boolean(raw?.summary?.inventoryTruncated)
    },
    tastings: (Array.isArray(raw.tastings) ? raw.tastings : []).slice(0, 30).map(t => ({
      at: String(t.at || '').slice(0, 40), wineName: String(t.wineName || '').slice(0, 180), year: String(t.year || '').slice(0, 20),
      rating: Math.max(0, Math.min(5, Number(t.rating) || 0)), food: String(t.food || '').slice(0, 220), occasion: String(t.occasion || '').slice(0, 160), notes: String(t.notes || '').slice(0, 500)
    })),
    wishlist: (Array.isArray(raw.wishlist) ? raw.wishlist : []).slice(0, 20).map(w => ({ wineName:String(w.wineName||'').slice(0,180), year:String(w.year||'').slice(0,20) })),
    events: (Array.isArray(raw.events) ? raw.events : []).slice(0, 15).map(e => ({ title:String(e.title||'').slice(0,180), date:String(e.date||'').slice(0,30), people:Math.max(0,Number(e.people)||0), meal:String(e.meal||'').slice(0,500) }))
  };
}
function cleanHistory(history) {
  return (Array.isArray(history) ? history : []).slice(-8).map(m => ({ role: m?.role === 'ai' ? 'assistant' : 'user', text: String(m?.text || '').slice(0, 1400) }));
}
const SYSTEM = `Você é o Sommelier da Adega EID VALÊNCIO. Separe rigorosamente duas classes de informação.
DADOS CADASTRADOS: estoque, rótulos, quantidade, safra, preço, posição, favoritos, degustações, eventos e wishlist. O JSON recebido é a única fonte permitida. Nunca complete, estime ou corrija esses fatos por memória externa.
CONHECIMENTO ENOLÓGICO GERAL: harmonização, serviço, estilos e explicações. Pode usar conhecimento geral, mas não o apresente como fato específico daquele rótulo quando o cadastro não comprovar.
Se faltar dado, diga que não está cadastrado. Se inventoryTruncated=true, não trate a lista parcial como inventário completo. Responda em português do Brasil, de forma direta. Não trate inferência como fato.`;
function promptFor(mode, body) {
  const ctx = cleanContext(body.context || { inventory: body.inventory });
  const contextText = JSON.stringify(ctx);
  const historyText = JSON.stringify(cleanHistory(body.history));
  const msg = String(body.message || '').slice(0, 5000);
  if (mode === 'chat') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\n\nHISTÓRICO: ${historyText}\n\nPERGUNTA: ${msg}\nNunca altere quantidade, posição ou safra recebidas. Se o JSON não comprovar um fato da adega, diga que não pode confirmar pelo cadastro.`;
  if (mode === 'suggest') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\n\nEscolha exclusivamente entre context.inventory com quantity>0. Contexto: ${msg || 'nenhum'}. Não recomende rótulo ausente e copie quantidade/posição exatamente do JSON.`;
  if (mode === 'tech_sheet') return `${SYSTEM}\n\nVINHO CADASTRADO: ${JSON.stringify(body.wine || {})}\nCONTEXTO: ${contextText}\nSepare "Cadastrado" de "Conhecimento enológico geral". Não invente produtor, safra, região, composição, teor alcoólico ou premiação.`;
  if (mode === 'pairing') return `${SYSTEM}\n\nVINHO: ${JSON.stringify(body.wine || {})}\nPEDIDO: ${msg}\nCONTEXTO: ${contextText}\nExplique a harmonização. Características específicas só podem ser afirmadas quando cadastradas; caso contrário, fale genericamente do estilo/uva.`;
  if (mode === 'dinner') return `${SYSTEM}\n\nCONTEXTO REAL: ${contextText}\nEVENTO: ${msg}\nUse exclusivamente rótulos disponíveis no JSON e respeite quantity. Quantidade de consumo sugerida é estimativa e deve ser indicada como tal.`;
  return `${SYSTEM}\n${msg}`;
}
function scanPrompt() {
  return `Analise APENAS o que é visível no rótulo. Retorne JSON válido, sem markdown, com: wineName, producer, grape, region, country, year, type, description, foodPairings. Use string vazia ou null quando não for legível. Não invente uva, safra, região, país, produtor, teor alcoólico, classificação ou premiação. description deve registrar somente informação visível. foodPairings deve ser [] se o estilo não puder ser identificado com segurança.`;
}
async function callOne(key, { prompt, imageBase64, mimeType, jsonMode, model }) {
  const parts = [{ text: prompt }];
  if (imageBase64) parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
  const payload = { contents: [{ role: 'user', parts }], generationConfig: { temperature: jsonMode ? 0 : 0.12, maxOutputTokens: jsonMode ? 1400 : 1800 } };
  if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const e=new Error(data?.error?.message || `Gemini HTTP ${response.status}`); e.status=response.status; throw e; }
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n').trim();
  if (!text) throw new Error('A IA retornou resposta vazia.');
  return text;
}
async function geminiCall(args) {
  if (!API_KEYS.length) throw new Error('GEMINI_API_KEY não configurada na Vercel.');
  let last;
  for (let i=0;i<API_KEYS.length;i++) {
    try { return await callOne(API_KEYS[i], args); }
    catch (e) { last=e; if (![429,500,502,503,504].includes(Number(e.status)) || i===API_KEYS.length-1) throw e; }
  }
  throw last || new Error('Falha no Gemini.');
}
export default async function handler(req,res) {
  if (req.method==='OPTIONS') { res.statusCode=204; return res.end(); }
  if (req.method==='GET') return send(res,200,{ ok:true, configured:Boolean(API_KEYS.length), textModel:TEXT_MODEL, visionModel:VISION_MODEL, keyCount:API_KEYS.length });
  if (req.method!=='POST') return send(res,405,{error:'Método não permitido.'});
  try {
    const body = typeof req.body==='string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const mode=String(body.mode||'chat');
    if (mode==='scan') {
      const img=String(body.imageBase64||'');
      if (!img || img.length>4_500_000) return send(res,400,{error:'Imagem ausente ou grande demais.'});
      const text=await geminiCall({prompt:scanPrompt(),imageBase64:img,mimeType:body.mimeType,jsonMode:true,model:VISION_MODEL});
      let json; try { json=JSON.parse(text.replace(/^```json/i,'').replace(/```$/i,'').trim()); } catch { return send(res,502,{error:'A IA retornou JSON inválido.',raw:text.slice(0,600)}); }
      return send(res,200,{ok:true,json,model:VISION_MODEL});
    }
    const text=await geminiCall({prompt:promptFor(mode,body),jsonMode:false,model:TEXT_MODEL});
    return send(res,200,{ok:true,text,model:TEXT_MODEL});
  } catch(e) { return send(res,500,{error:e?.message||'Falha na IA.'}); }
}

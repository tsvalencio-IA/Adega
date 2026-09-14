const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma uns umas para por com que qual quais quem como eu voce você meu minha meus minhas tem tenho temos existe existem estao estão esta está sao são'.split(' '));

function norm(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(value = '') {
  return norm(value).split(/\s+/).filter(x => x.length > 1 && !STOP.has(x));
}
function storedBottles(w) { return (w.bottles || []).filter(b => b.status === 'stored'); }
function qty(w) { return Math.max(0, Number(w.quantity) || 0); }
function label(w) { return `${w.wineName || 'Vinho sem nome'}${w.year ? ` · ${w.year}` : ''}`; }
function positions(w) { return [...new Set(storedBottles(w).map(b => String(b.location || '')).filter(Boolean))].sort((a,b)=>(Number(a)||9999)-(Number(b)||9999)); }
function listLines(list, extra = () => '', limit = 25) {
  const shown = list.slice(0, limit).map(w => `• ${label(w)}${extra(w)}`);
  if (list.length > limit) shown.push(`• … e mais ${list.length - limit} rótulo(s).`);
  return shown.join('\n');
}
function result(text, evidence = {}) { return { handled: true, text, source: 'firebase-deterministic', certainty: 'exact', evidence }; }
function notHandled() { return { handled: false }; }

function dimensionMatches(message, wines) {
  const q = norm(message);
  const fields = ['country','grape','type','producer','region','year'];
  const matches = [];
  for (const field of fields) {
    const values = [...new Set(wines.map(w => String(w[field] ?? '').trim()).filter(Boolean))];
    for (const value of values) {
      const nv = norm(value);
      if (nv.length < 3) continue;
      if (q.includes(nv)) matches.push({ field, value, norm: nv });
      else {
        const parts = tokens(value).filter(x => x.length >= 4);
        if (parts.length && parts.every(p => q.includes(p))) matches.push({ field, value, norm: nv });
      }
    }
  }
  const seen = new Set();
  return matches.filter(m => { const k = `${m.field}:${m.norm}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function wineNameMatches(message, wines) {
  const q = norm(message);
  const qTokens = new Set(tokens(message));
  return wines.map(w => {
    const name = norm(w.wineName || '');
    if (!name) return { w, score: 0 };
    let score = q.includes(name) && name.length >= 5 ? 10 : 0;
    for (const t of tokens(w.wineName)) if (t.length >= 4 && qTokens.has(t)) score += 2;
    for (const t of tokens(w.producer || '')) if (t.length >= 4 && qTokens.has(t)) score += 1;
    return { w, score };
  }).filter(x => x.score > 0).sort((a,b)=>b.score-a.score);
}

function filterByMentionedDimensions(message, wines) {
  const dims = dimensionMatches(message, wines);
  if (!dims.length) return { list: wines, dims: [] };
  const grouped = new Map();
  for (const m of dims) {
    if (!grouped.has(m.field)) grouped.set(m.field, []);
    grouped.get(m.field).push(m);
  }
  let list = wines;
  for (const [field, group] of grouped) {
    list = list.filter(w => group.some(m => norm(w[field]) === m.norm || norm(w[field]).includes(m.norm) || m.norm.includes(norm(w[field]))));
  }
  return { list, dims };
}

function isRecommendation(message) {
  const q = norm(message);
  return /(recomenda|recomendacao|harmoniza|beber com|combina com|para comer|para jantar|para churrasco|para massa|para chocolate|escolha ideal|o que abrir|qual abrir)/.test(q);
}

export function answerFromTruth(message, state) {
  const q = norm(message);
  if (!q) return notHandled();
  const wines = Array.isArray(state?.wines) ? state.wines : [];
  const available = wines.filter(w => qty(w) > 0);
  const allBottleCount = available.reduce((n,w)=>n+qty(w),0);
  const tastings = Array.isArray(state?.v2?.tastings) ? state.v2.tastings : [];
  const movements = Array.isArray(state?.v2?.movements) ? state.v2.movements : [];

  if (isRecommendation(message)) return notHandled();

  const posMatch = q.match(/(?:posicao|posição|numero|nº|n°)\s*(\d{1,4})/i) || (/(?:onde.*\b)\d{1,4}\b/.test(q) ? q.match(/\b(\d{1,4})\b/) : null);
  if (posMatch) {
    const pos = String(Number(posMatch[1]));
    const found = [];
    for (const w of available) for (const b of storedBottles(w)) if (String(Number(b.location)) === pos) found.push(w);
    if (!found.length) return result(`A posição ${pos} está vazia no cadastro atual.`, { position: pos, matches: 0 });
    return result(`Na posição ${pos}: ${[...new Set(found.map(label))].join(', ')}.`, { position: pos, matches: found.map(w=>w.id) });
  }

  if (/(quantas?|total|numero).*garraf/.test(q) && !dimensionMatches(message, wines).length && !wineNameMatches(message, wines).length) {
    return result(`Há ${allBottleCount} garrafa${allBottleCount===1?'':'s'} disponível${allBottleCount===1?'':'eis'} em ${available.length} rótulo${available.length===1?'':'s'} com estoque.`, { bottles: allBottleCount, labels: available.length });
  }
  if (/(quantos?|total|numero).*(rotulo|vinho)/.test(q) && !dimensionMatches(message, wines).length && !wineNameMatches(message, wines).length) {
    return result(`Há ${available.length} rótulo${available.length===1?'':'s'} com estoque, somando ${allBottleCount} garrafa${allBottleCount===1?'':'s'}.`, { bottles: allBottleCount, labels: available.length });
  }

  if (/(mais antigo|safra mais antiga|vinho mais antigo)/.test(q)) {
    const dated = available.filter(w => /^\d{4}$/.test(String(w.year))).sort((a,b)=>Number(a.year)-Number(b.year));
    if (!dated.length) return result('Não há safra cadastrada em nenhum rótulo disponível.');
    const year = String(dated[0].year); const same = dated.filter(w => String(w.year) === year);
    return result(`A safra mais antiga cadastrada é ${year}:\n${listLines(same, w => ` — ${qty(w)} garrafa${qty(w)===1?'':'s'}`)}`, { year, ids: same.map(w=>w.id) });
  }
  if (/(mais novo|safra mais nova|vinho mais novo|mais recente)/.test(q)) {
    const dated = available.filter(w => /^\d{4}$/.test(String(w.year))).sort((a,b)=>Number(b.year)-Number(a.year));
    if (!dated.length) return result('Não há safra cadastrada em nenhum rótulo disponível.');
    const year = String(dated[0].year); const same = dated.filter(w => String(w.year) === year);
    return result(`A safra mais recente cadastrada é ${year}:\n${listLines(same, w => ` — ${qty(w)} garrafa${qty(w)===1?'':'s'}`)}`, { year, ids: same.map(w=>w.id) });
  }
  if (/(mais caro|maior valor|maior preco)/.test(q)) {
    const priced = available.filter(w => Number(w.purchasePrice) > 0).sort((a,b)=>Number(b.purchasePrice)-Number(a.purchasePrice));
    if (!priced.length) return result('Nenhum valor de compra está cadastrado nos rótulos disponíveis.');
    const w=priced[0]; return result(`Maior valor unitário cadastrado: ${label(w)} — R$ ${Number(w.purchasePrice).toFixed(2).replace('.',',')}.`, { id:w.id, price:Number(w.purchasePrice) });
  }
  if (/(mais barato|menor valor|menor preco)/.test(q)) {
    const priced = available.filter(w => Number(w.purchasePrice) > 0).sort((a,b)=>Number(a.purchasePrice)-Number(b.purchasePrice));
    if (!priced.length) return result('Nenhum valor de compra está cadastrado nos rótulos disponíveis.');
    const w=priced[0]; return result(`Menor valor unitário cadastrado: ${label(w)} — R$ ${Number(w.purchasePrice).toFixed(2).replace('.',',')}.`, { id:w.id, price:Number(w.purchasePrice) });
  }

  if (/favorit/.test(q)) {
    const list = available.filter(w => w.favorite);
    return result(list.length ? `Favoritos com estoque (${list.length}):\n${listLines(list,w=>` — ${qty(w)} garrafa${qty(w)===1?'':'s'}`)}` : 'Nenhum rótulo disponível está marcado como favorito.', { ids:list.map(w=>w.id) });
  }
  if (/(repetid|mais de uma garrafa|duplicad)/.test(q)) {
    const list = available.filter(w => qty(w) > 1).sort((a,b)=>qty(b)-qty(a));
    return result(list.length ? `Rótulos com mais de uma garrafa (${list.length}):\n${listLines(list,w=>` — ${qty(w)} garrafas`)}` : 'Não há rótulos com mais de uma garrafa disponível.', { ids:list.map(w=>w.id) });
  }
  if (/(estoque baixo|acabando|ultima garrafa|última garrafa)/.test(q)) {
    const list = available.filter(w => qty(w) === 1);
    return result(list.length ? `Rótulos com apenas 1 garrafa (${list.length}):\n${listLines(list)}` : 'Nenhum rótulo está com apenas uma garrafa.', { ids:list.map(w=>w.id) });
  }
  if (/(zerad|sem estoque|acabou)/.test(q)) {
    const list = wines.filter(w => qty(w) <= 0);
    return result(list.length ? `Rótulos zerados (${list.length}):\n${listLines(list)}` : 'Nenhum rótulo cadastrado está zerado.', { ids:list.map(w=>w.id) });
  }

  if (/(melhor nota|mais bem avaliad|melhor avaliad)/.test(q)) {
    const rated = tastings.filter(t => Number(t.rating) > 0).sort((a,b)=>Number(b.rating)-Number(a.rating));
    if (!rated.length) return result('Ainda não há degustações com nota registrada.');
    const top = Number(rated[0].rating); const same = rated.filter(t=>Number(t.rating)===top);
    return result(`Maior nota registrada: ${top}/5.\n${same.slice(0,20).map(t=>`• ${t.wineName}${t.year?` · ${t.year}`:''}`).join('\n')}`, { rating:top, tastingIds:same.map(t=>t.id) });
  }
  if (/(mais consumid|mais bebid|mais aberto)/.test(q)) {
    const map = new Map();
    for (const m of movements) if (m.type === 'consumo') map.set(m.wineName || m.wineId, (map.get(m.wineName || m.wineId)||0) + Math.max(1, Math.abs(Number(m.quantity)||1)));
    const sorted=[...map.entries()].sort((a,b)=>b[1]-a[1]);
    if (!sorted.length) return result('Ainda não há consumos suficientes registrados no histórico.');
    return result(`Mais consumido no histórico: ${sorted[0][0]} — ${sorted[0][1]} garrafa${sorted[0][1]===1?'':'s'} registrada${sorted[0][1]===1?'':'s'}.`, { wine:sorted[0][0], consumed:sorted[0][1] });
  }

  const dimFiltered = filterByMentionedDimensions(message, available);
  if (dimFiltered.dims.length && /(tenho|tem|quais|quant|lista|mostra|estoque|disponivel|disponíveis)/.test(q)) {
    const list = dimFiltered.list;
    const bottles = list.reduce((n,w)=>n+qty(w),0);
    const criteria = dimFiltered.dims.map(d=>d.value).join(' + ');
    if (!list.length) return result(`Não há rótulos disponíveis que correspondam a: ${criteria}.`, { criteria });
    return result(`${criteria}: ${list.length} rótulo${list.length===1?'':'s'}, ${bottles} garrafa${bottles===1?'':'s'}.\n${listLines(list,w=>` — ${qty(w)} garrafa${qty(w)===1?'':'s'}${positions(w).length?` · posição ${positions(w).join(', ')}`:''}`)}`, { criteria, ids:list.map(w=>w.id), bottles });
  }

  const nameMatches = wineNameMatches(message, wines);
  if (nameMatches.length && /(onde|posicao|tenho|tem|quant|estoque|safra|uva|pais|país|regiao|região|produtor|valor|preco|preço)/.test(q)) {
    const bestScore = nameMatches[0].score;
    const list = nameMatches.filter(x=>x.score >= Math.max(2,bestScore-2)).slice(0,10).map(x=>x.w);
    if (/onde|posicao/.test(q)) {
      return result(list.map(w => `${label(w)}: ${positions(w).length ? `posição ${positions(w).join(', ')}` : 'posição não cadastrada'}; estoque ${qty(w)}.`).join('\n'), { ids:list.map(w=>w.id) });
    }
    return result(list.map(w => `${label(w)} — ${qty(w)} garrafa${qty(w)===1?'':'s'}${w.grape?` · ${w.grape}`:''}${w.country?` · ${w.country}`:''}${positions(w).length?` · posição ${positions(w).join(', ')}`:''}`).join('\n'), { ids:list.map(w=>w.id) });
  }

  return notHandled();
}

export function buildTruthContext(message, state, maxInventory = 250) {
  const wines = (Array.isArray(state?.wines) ? state.wines : []).filter(w=>qty(w)>0);
  const qTokens = new Set(tokens(message));
  const scoreWine = w => {
    const fields=[w.wineName,w.producer,w.grape,w.region,w.country,w.year,w.type].filter(Boolean).join(' ');
    let score=0;
    for(const t of tokens(fields)) if(qTokens.has(t)) score += t.length >= 6 ? 3 : 1;
    if(w.favorite) score += .15;
    return score;
  };
  let ranked = wines.map((w,i)=>({w,i,score:scoreWine(w)})).sort((a,b)=>b.score-a.score || a.i-b.i);
  const hasRelevant = ranked.some(x=>x.score>0);
  if (hasRelevant) {
    const relevant=ranked.filter(x=>x.score>0);
    const rest=ranked.filter(x=>x.score<=0);
    ranked=[...relevant,...rest];
  }
  const inventory=ranked.slice(0,maxInventory).map(({w})=>({
    id:w.id,wineName:w.wineName,producer:w.producer||'',grape:w.grape||'',region:w.region||'',country:w.country||'',year:w.year||'',type:w.type||'',quantity:qty(w),favorite:Boolean(w.favorite),purchasePrice:Number(w.purchasePrice)||0,locations:positions(w)
  }));
  return {
    inventory,
    summary:{labels:wines.length,bottles:wines.reduce((n,w)=>n+qty(w),0),inventoryTruncated:wines.length>inventory.length},
    tastings:(state?.v2?.tastings||[]).slice(0,30),
    wishlist:(state?.v2?.wishlist||[]).slice(0,20),
    events:(state?.v2?.events||[]).slice(0,15)
  };
}

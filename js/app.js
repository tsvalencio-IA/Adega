import { APP_CONFIG } from './config.js';
import {
  startRealtime, subscribe, getState, addWine, updateWine, adjustQuantity, openBottle, assignBottleLocation,
  toggleFavorite, deleteWine, addWishlist, removeWishlist, addEvent, removeEvent, saveSettings,
  backupObject, replaceFromBackup
} from './store.js';
import { getCloudinaryConfig, setCloudinaryConfig, discoverCloudinary, uploadImage, testCloudinaryConfig } from './cloudinary.js';
import { checkAI, scanLabel, askSommelier, getSuggestion, getTechSheet, getPairing, planDinner } from './ai.js';
import {
  $, $$, escapeHtml, money, formatDate, safeNumber, debounce, compressImage, fileToBase64, downloadText, toCSV, nowISO
} from './utils.js';

const ui = {
  state: getState(), route: 'home', journal: 'movements', search: '', filters: { type: '', country: '', stock: '', sort: 'name' },
  chat: [{ role: 'ai', text: 'Sommelier pronto. Posso cruzar suas perguntas com o estoque real da adega.' }],
  lastError: null, aiStatus: null, installPrompt: null
};

const els = {
  sync: $('#sync-pill'), modal: $('#modal'), backdrop: $('#modal-backdrop'), sheet: $('#modal-sheet'),
  loading: $('#loading'), loadingText: $('#loading-text'), toast: $('#toast'),
  camera: $('#camera-input'), gallery: $('#gallery-input'), backup: $('#backup-input')
};

function toast(message, type = '') {
  els.toast.textContent = message; els.toast.className = `toast ${type}`.trim();
  els.toast.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}
function loading(show, text = 'Processando...') { els.loadingText.textContent = text; els.loading.classList.toggle('hidden', !show); }
function openModal(html) { els.sheet.innerHTML = html; els.backdrop.classList.remove('hidden'); els.modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { els.backdrop.classList.add('hidden'); els.modal.classList.add('hidden'); els.sheet.innerHTML = ''; document.body.style.overflow = ''; }
function modalHead(title, subtitle = '') { return `<div class="modal-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="close-btn" data-close-modal>×</button></div>`; }
function bindClose() { $$('[data-close-modal]', els.sheet).forEach(b => b.onclick = closeModal); }
function errMessage(e) { return e?.message || String(e || 'Erro desconhecido.'); }
function withError(fn) { return async (...args) => { try { return await fn(...args); } catch (e) { console.error(e); toast(errMessage(e), 'error'); } }; }

function routeTo(route) {
  ui.route = route;
  $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === route));
  $$('.bottom-nav [data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  if (route === 'cellar') renderCellar();
  if (route === 'visual') renderVisual();
  if (route === 'journal') renderJournal();
  if (route === 'ai') renderAI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentStoredBottles(w) { return (w.bottles || []).filter(b => b.status === 'stored'); }
function totalBottles() { return ui.state.wines.reduce((n, w) => n + (w.quantity || 0), 0); }
function inventoryValue() { return ui.state.wines.reduce((n, w) => n + safeNumber(w.purchasePrice) * safeNumber(w.quantity), 0); }
function uniqueCountries() { return [...new Set(ui.state.wines.map(w => w.country).filter(Boolean))]; }
function wineLabel(w) { return `${w.wineName}${w.year ? ` · ${w.year}` : ''}`; }

function renderAll() {
  renderHome();
  if (ui.route === 'cellar') renderCellar();
  if (ui.route === 'visual') renderVisual();
  if (ui.route === 'journal') renderJournal();
  if (ui.route === 'ai') renderAI();
}

function renderHome() {
  const wines = ui.state.wines;
  const qty = totalBottles();
  $('#hero-subtitle').textContent = wines.length ? `${qty} garrafa${qty === 1 ? '' : 's'} em ${wines.length} rótulo${wines.length === 1 ? '' : 's'}, sincronizados no Firebase atual.` : 'Sua adega está conectada. Cadastre o primeiro rótulo.';
  const favorites = wines.filter(w => w.favorite).length;
  const value = inventoryValue();
  $('#stats-grid').innerHTML = [
    ['🍷', qty, 'Garrafas disponíveis'], ['🏷', wines.length, 'Rótulos cadastrados'], ['★', favorites, 'Favoritos'], ['◈', value ? money(value) : '—', 'Valor cadastrado']
  ].map(([icon, val, label]) => `<div class="stat-card"><span class="icon">${icon}</span><div><strong>${escapeHtml(String(val))}</strong><small>${label}</small></div></div>`).join('');

  const low = wines.filter(w => w.quantity > 0 && w.quantity <= 1).sort((a,b) => a.quantity-b.quantity);
  const vintages = wines.filter(w => /^\d{4}$/.test(String(w.year))).sort((a,b) => Number(a.year)-Number(b.year));
  const recentTaste = ui.state.v2.tastings?.[0];
  const unplaced = wines.reduce((n,w) => n + currentStoredBottles(w).filter(b => !b.location).length, 0);
  const insight = [
    { e:'ESTOQUE BAIXO', t: low[0] ? wineLabel(low[0]) : 'Nenhum alerta', p: low.length ? `${low.length} rótulo(s) com apenas uma garrafa.` : 'Não há rótulos disponíveis com estoque unitário.' },
    { e:'SAFRA MAIS ANTIGA', t: vintages[0] ? wineLabel(vintages[0]) : 'Sem safra cadastrada', p: vintages[0] ? `${vintages[0].country || vintages[0].region || 'Origem não cadastrada'}.` : 'Cadastre safras para acompanhar a evolução do acervo.' },
    { e:'ORGANIZAÇÃO', t: unplaced ? `${unplaced} sem posição` : 'Tudo localizado', p: unplaced ? 'Use a Adega visual para definir prateleira e posição.' : 'Todas as garrafas rastreadas têm posição definida.' }
  ];
  if (recentTaste) insight[2] = { e:'ÚLTIMA DEGUSTAÇÃO', t: recentTaste.wineName || 'Registro', p: `${recentTaste.rating ? '★'.repeat(Math.round(recentTaste.rating)) : 'Sem nota'} · ${formatDate(recentTaste.at)}` };
  $('#insights').innerHTML = insight.map(x => `<article class="insight-card"><span class="eyebrow">${x.e}</span><strong>${escapeHtml(x.t)}</strong><p>${escapeHtml(x.p)}</p></article>`).join('');

  const types = new Map();
  wines.forEach(w => { const k = w.type || 'Não informado'; types.set(k, (types.get(k)||0) + (w.quantity || 0)); });
  const rows = [...types.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = Math.max(1, ...rows.map(x=>x[1]));
  $('#distribution').innerHTML = rows.length ? rows.map(([k,v]) => `<div class="bar-row"><label>${escapeHtml(k)}</label><div class="bar-track"><i style="width:${Math.max(5, Math.round(v/max*100))}%"></i></div><b>${v}</b></div>`).join('') : '<div class="empty-state" style="padding:22px"><p>Cadastre vinhos para ver a distribuição do acervo.</p></div>';
}

function filteredWines() {
  let list = [...ui.state.wines];
  const q = ui.search.trim().toLowerCase();
  if (q) list = list.filter(w => [w.wineName,w.producer,w.grape,w.region,w.country,w.year,w.type].join(' ').toLowerCase().includes(q));
  if (ui.filters.type) list = list.filter(w => w.type === ui.filters.type);
  if (ui.filters.country) list = list.filter(w => w.country === ui.filters.country);
  if (ui.filters.stock === 'available') list = list.filter(w => w.quantity > 0);
  if (ui.filters.stock === 'low') list = list.filter(w => w.quantity > 0 && w.quantity <= 1);
  if (ui.filters.stock === 'zero') list = list.filter(w => w.quantity <= 0);
  if (ui.filters.sort === 'name') list.sort((a,b)=>(a.wineName||'').localeCompare(b.wineName||'', 'pt-BR'));
  if (ui.filters.sort === 'qty') list.sort((a,b)=>b.quantity-a.quantity);
  if (ui.filters.sort === 'year') list.sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0));
  if (ui.filters.sort === 'value') list.sort((a,b)=>safeNumber(b.purchasePrice)-safeNumber(a.purchasePrice));
  return list;
}

function renderCellar() {
  const list = filteredWines();
  $('#wine-empty').classList.toggle('hidden', list.length > 0);
  $('#wine-grid').innerHTML = list.map(w => `
    <article class="wine-card" data-wine-id="${escapeHtml(w.id)}">
      <button class="wine-image" data-open-wine="${escapeHtml(w.id)}" aria-label="Abrir ${escapeHtml(w.wineName)}">
        ${w.imageUrl ? `<img src="${escapeHtml(w.imageUrl)}" alt="Rótulo de ${escapeHtml(w.wineName)}" loading="lazy">` : '<span class="wine-placeholder">🍷</span>'}
      </button>
      <span class="stock-dot">${w.quantity} garrafa${w.quantity === 1 ? '' : 's'}</span>
      <div class="wine-body">
        <h3>${escapeHtml(w.wineName)}</h3>
        <div class="wine-meta">${escapeHtml(w.grape || 'Uva não cadastrada')}</div>
        <div class="wine-meta">${escapeHtml([w.region,w.country,w.year].filter(Boolean).join(' · ') || 'Origem não cadastrada')}</div>
        <div class="wine-foot"><span class="qty-badge">${w.type ? escapeHtml(w.type) : 'Vinho'}</span><span class="wine-actions"><button class="mini-icon ${w.favorite ? 'favorite' : ''}" data-favorite="${escapeHtml(w.id)}" title="Favorito">★</button><button class="mini-icon" data-open-wine="${escapeHtml(w.id)}">›</button></span></div>
      </div>
    </article>`).join('');
  $$('[data-open-wine]').forEach(b => b.onclick = () => openWineDetails(b.dataset.openWine));
  $$('[data-favorite]').forEach(b => b.onclick = withError(async e => { e.stopPropagation(); await toggleFavorite(b.dataset.favorite); }));
  renderFilterChips();
}

function renderFilterChips() {
  const parts = [];
  if (ui.filters.type) parts.push(['type', ui.filters.type]);
  if (ui.filters.country) parts.push(['country', ui.filters.country]);
  if (ui.filters.stock) parts.push(['stock', ({available:'Disponíveis',low:'Estoque baixo',zero:'Zerados'})[ui.filters.stock]]);
  if (ui.filters.sort !== 'name') parts.push(['sort', `Ordem: ${{qty:'quantidade',year:'safra',value:'valor'}[ui.filters.sort]}`]);
  $('#active-filters').innerHTML = parts.map(([k,v]) => `<button class="chip active" data-clear-filter="${k}">${escapeHtml(v)} ×</button>`).join('');
  $$('[data-clear-filter]').forEach(b => b.onclick = () => { ui.filters[b.dataset.clearFilter] = b.dataset.clearFilter === 'sort' ? 'name' : ''; renderCellar(); });
}

function openFilters() {
  const types = [...new Set(ui.state.wines.map(w=>w.type).filter(Boolean))].sort();
  const countries = [...new Set(ui.state.wines.map(w=>w.country).filter(Boolean))].sort();
  openModal(`${modalHead('Filtros da adega','Combine critérios sem perder nenhum dado.')}
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Tipo</label><select id="filter-type"><option value="">Todos</option>${types.map(x=>`<option ${ui.filters.type===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div>
      <div class="field"><label>País</label><select id="filter-country"><option value="">Todos</option>${countries.map(x=>`<option ${ui.filters.country===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Estoque</label><select id="filter-stock"><option value="">Todos</option><option value="available" ${ui.filters.stock==='available'?'selected':''}>Disponíveis</option><option value="low" ${ui.filters.stock==='low'?'selected':''}>Baixo (1)</option><option value="zero" ${ui.filters.stock==='zero'?'selected':''}>Zerados</option></select></div>
      <div class="field"><label>Ordenar por</label><select id="filter-sort"><option value="name">Nome</option><option value="qty" ${ui.filters.sort==='qty'?'selected':''}>Quantidade</option><option value="year" ${ui.filters.sort==='year'?'selected':''}>Safra</option><option value="value" ${ui.filters.sort==='value'?'selected':''}>Valor</option></select></div>
    </div><div class="modal-actions"><button class="ghost-btn" id="clear-filters">Limpar</button><button class="primary-btn" id="apply-filters">Aplicar</button></div></div>`);
  bindClose();
  $('#clear-filters').onclick = () => { ui.filters = {type:'',country:'',stock:'',sort:'name'}; closeModal(); renderCellar(); };
  $('#apply-filters').onclick = () => { ui.filters = { type: $('#filter-type').value, country: $('#filter-country').value, stock: $('#filter-stock').value, sort: $('#filter-sort').value }; closeModal(); renderCellar(); };
}

function renderVisual() {
  const settings = ui.state.v2.settings;
  const shelves = settings.shelves || APP_CONFIG.defaults.shelves;
  const slots = settings.slotsPerShelf || 6;
  $('#visual-subtitle').textContent = `${settings.cellarName || 'Adega principal'} · ${shelves.length} prateleira(s) · ${slots} posição(ões) por prateleira.`;
  const placements = new Map();
  ui.state.wines.forEach(w => currentStoredBottles(w).forEach(b => { if (b.location) { const arr = placements.get(b.location) || []; arr.push({w,b}); placements.set(b.location, arr); } }));
  $('#visual-cellar').style.setProperty('--slots', slots);
  $('#visual-cellar').innerHTML = shelves.map(s => `<div class="shelf-row"><div class="shelf-title"><span>Prateleira ${escapeHtml(s)}</span><span>${slots} posições</span></div><div class="shelf-slots" style="--slots:${slots}">${Array.from({length:slots},(_,i)=>{
    const loc = `${s}${i+1}`; const arr = placements.get(loc) || []; const first = arr[0];
    return `<button class="slot ${arr.length?'occupied':''}" data-slot="${escapeHtml(loc)}">${arr.length ? `<span class="bottle">🍾</span><strong>${escapeHtml(first.w.wineName)}</strong><small>${arr.length>1?`${arr.length} garrafas`:loc}</small>` : `<strong>${escapeHtml(loc)}</strong><small>vazio</small>`}</button>`;
  }).join('')}</div></div>`).join('');
  $$('[data-slot]').forEach(b => b.onclick = () => openSlot(b.dataset.slot, placements.get(b.dataset.slot) || []));

  const unplaced = [];
  ui.state.wines.forEach(w => currentStoredBottles(w).filter(b=>!b.location).forEach(b => unplaced.push({w,b})));
  $('#unplaced-list').innerHTML = unplaced.length ? unplaced.slice(0,100).map(({w,b}) => `<div class="unplaced-item"><div><strong>${escapeHtml(w.wineName)}</strong><small>${escapeHtml(w.grape || '')}</small></div><button class="secondary-btn" data-place-wine="${escapeHtml(w.id)}" data-place-bottle="${escapeHtml(b.id)}">Posicionar</button></div>`).join('') : '<div class="empty-state" style="padding:28px;grid-column:1/-1"><span>✓</span><h3>Tudo organizado</h3><p>Não há garrafas disponíveis sem posição.</p></div>';
  $$('[data-place-bottle]').forEach(b => b.onclick = () => openPositionPicker(b.dataset.placeWine, b.dataset.placeBottle));
}

function openSlot(location, items) {
  if (!items.length) {
    const candidates = [];
    ui.state.wines.forEach(w => currentStoredBottles(w).filter(b=>!b.location).forEach(b => candidates.push({w,b})));
    openModal(`${modalHead(`Posição ${location}`,'Escolha uma garrafa disponível para ocupar esta posição.')}<div class="modal-body">${candidates.length ? `<div class="timeline">${candidates.slice(0,100).map(({w,b}) => `<button class="timeline-item" data-assign="${escapeHtml(w.id)}|${escapeHtml(b.id)}"><span class="timeline-icon">🍷</span><div><strong>${escapeHtml(wineLabel(w))}</strong><p>${escapeHtml(w.grape || 'Uva não cadastrada')}</p></div><span>›</span></button>`).join('')}</div>` : '<div class="empty-state"><p>Não há garrafas sem posição para alocar.</p></div>'}</div>`);
    bindClose();
    $$('[data-assign]').forEach(b => b.onclick = withError(async () => { const [wid,bid] = b.dataset.assign.split('|'); await assignBottleLocation(wid,bid,location); closeModal(); toast(`Garrafa posicionada em ${location}.`,'success'); }));
    return;
  }
  openModal(`${modalHead(`Posição ${location}`,`${items.length} garrafa(s) nesta posição.`)}<div class="modal-body"><div class="timeline">${items.map(({w,b}) => `<div class="timeline-item"><span class="timeline-icon">🍾</span><div><strong>${escapeHtml(wineLabel(w))}</strong><p>${escapeHtml(w.grape || 'Uva não cadastrada')}</p></div><button class="ghost-btn" data-unplace="${escapeHtml(w.id)}|${escapeHtml(b.id)}">Retirar posição</button></div>`).join('')}</div></div>`);
  bindClose();
  $$('[data-unplace]').forEach(b => b.onclick = withError(async () => { const [wid,bid] = b.dataset.unplace.split('|'); await assignBottleLocation(wid,bid,''); closeModal(); toast('Posição removida.','success'); }));
}

function openPositionPicker(wineId,bottleId) {
  const s = ui.state.v2.settings; const locations = (s.shelves || []).flatMap(sh => Array.from({length:s.slotsPerShelf||6},(_,i)=>`${sh}${i+1}`));
  openModal(`${modalHead('Escolher posição','A posição fica vinculada à garrafa, não apenas ao rótulo.')}<div class="modal-body"><div class="form-grid"><div class="field full"><label>Posição</label><select id="position-choice"><option value="">Sem posição</option>${locations.map(x=>`<option>${escapeHtml(x)}</option>`).join('')}</select></div></div><div class="modal-actions"><button class="primary-btn" id="save-position">Salvar posição</button></div></div>`);
  bindClose(); $('#save-position').onclick = withError(async () => { await assignBottleLocation(wineId,bottleId,$('#position-choice').value); closeModal(); toast('Localização atualizada.','success'); });
}

function renderJournal() {
  $$('#journal-tabs button').forEach(b => b.classList.toggle('active', b.dataset.journal === ui.journal));
  const root = $('#journal-content');
  if (ui.journal === 'movements') {
    const items = ui.state.v2.movements || [];
    root.innerHTML = items.length ? `<div class="timeline">${items.map(m => `<div class="timeline-item"><span class="timeline-icon">${movementIcon(m.type)}</span><div><strong>${escapeHtml(m.wineName || movementTitle(m.type))}</strong><p>${escapeHtml(m.detail || movementTitle(m.type))}${m.quantity ? ` · ${m.quantity>0?'+':''}${m.quantity}` : ''} · ${escapeHtml(m.actor || '')}</p></div><time>${formatDate(m.at,true)}</time></div>`).join('')}</div>` : journalEmpty('Ainda não há movimentações registradas.');
  }
  if (ui.journal === 'tastings') {
    const items = ui.state.v2.tastings || [];
    root.innerHTML = items.length ? `<div class="journal-card-grid">${items.map(t => `<article class="journal-card"><strong>${escapeHtml(t.wineName || 'Degustação')}</strong><p class="rating">${t.rating ? '★'.repeat(Math.round(t.rating)) + '☆'.repeat(Math.max(0,5-Math.round(t.rating))) : 'Sem nota'}</p><p>${escapeHtml([t.food,t.occasion,t.companions].filter(Boolean).join(' · ') || 'Sem detalhes adicionais')}</p>${t.notes?`<p>${escapeHtml(t.notes)}</p>`:''}<p>${formatDate(t.at,true)}</p></article>`).join('')}</div>` : journalEmpty('Abra uma garrafa e registre sua primeira degustação.');
  }
  if (ui.journal === 'wishlist') {
    const items = ui.state.v2.wishlist || [];
    root.innerHTML = `<div class="journal-toolbar"><button class="primary-btn compact" data-add-wish>＋ Desejo</button></div>` + (items.length ? `<div class="journal-card-grid">${items.map(x => `<article class="journal-card"><strong>${escapeHtml(x.wineName || 'Vinho desejado')}</strong><p>${escapeHtml([x.producer,x.year,x.notes].filter(Boolean).join(' · '))}</p><div class="row"><span></span><button class="danger-btn" data-remove-wish="${escapeHtml(x.id)}">Remover</button></div></article>`).join('')}</div>` : journalEmpty('Sua lista de desejos está vazia.'));
    $('[data-add-wish]')?.addEventListener('click', openWishlistForm); $$('[data-remove-wish]').forEach(b => b.onclick = withError(async()=>removeWishlist(b.dataset.removeWish)));
  }
  if (ui.journal === 'events') {
    const items = ui.state.v2.events || [];
    root.innerHTML = `<div class="journal-toolbar"><button class="primary-btn compact" data-add-event>＋ Evento</button></div>` + (items.length ? `<div class="journal-card-grid">${items.map(x => `<article class="journal-card"><strong>${escapeHtml(x.title || 'Evento')}</strong><p>${escapeHtml([x.date ? formatDate(x.date) : '', x.people ? `${x.people} pessoas` : '', x.meal].filter(Boolean).join(' · '))}</p><div class="row"><button class="secondary-btn" data-plan-event="${escapeHtml(x.id)}">Planejar com IA</button><button class="danger-btn" data-remove-event="${escapeHtml(x.id)}">Remover</button></div></article>`).join('')}</div>` : journalEmpty('Cadastre um jantar, encontro ou degustação para planejar com sua adega.'));
    $('[data-add-event]')?.addEventListener('click', openEventForm); $$('[data-remove-event]').forEach(b => b.onclick = withError(async()=>removeEvent(b.dataset.removeEvent))); $$('[data-plan-event]').forEach(b => b.onclick = ()=>planStoredEvent(b.dataset.planEvent));
  }
}
function journalEmpty(text){ return `<div class="empty-state"><span>◴</span><h3>Nenhum registro</h3><p>${escapeHtml(text)}</p></div>`; }
function movementIcon(t){ return ({entrada:'＋',saida:'−',consumo:'🍷',edicao:'✎',exclusao:'×',localizacao:'⌖',importacao:'⇪'})[t] || '•'; }
function movementTitle(t){ return ({entrada:'Entrada de estoque',saida:'Saída de estoque',consumo:'Consumo',edicao:'Edição',exclusao:'Exclusão',localizacao:'Localização',importacao:'Importação'})[t] || 'Movimentação'; }

function renderAI() {
  const s = ui.aiStatus;
  const status = $('#ai-status');
  if (!s) status.textContent = 'Verificando backend da IA...';
  else if (s.configured) { status.textContent = `IA protegida no backend · ${s.model || 'Gemini'}`; status.className='ai-status ok'; }
  else { status.textContent = 'Backend disponível, mas GEMINI_API_KEY ainda não foi configurada na Vercel.'; status.className='ai-status warn'; }
  $('#chat-messages').innerHTML = ui.chat.map(m => `<div class="chat-bubble ${m.role}">${escapeHtml(m.text)}</div>`).join('');
  const cm = $('#chat-messages'); cm.scrollTop = cm.scrollHeight;
}

function openAddWine() {
  openModal(`${modalHead('Adicionar vinho','Escolha como o rótulo entrará na adega.')}
    <div class="modal-body"><div class="choice-grid">
      <button class="choice" data-add-source="camera"><span>📷</span><strong>Câmera</strong><small>Fotografar o rótulo agora</small></button>
      <button class="choice" data-add-source="gallery"><span>🖼</span><strong>Galeria</strong><small>Usar uma foto existente</small></button>
      <button class="choice" data-add-source="manual"><span>✎</span><strong>Manual</strong><small>Preencher sem usar IA</small></button>
    </div><div class="notice" style="margin-top:12px">A leitura por imagem só preenche o que a IA consegue identificar. Você confirma e pode corrigir tudo antes de salvar.</div></div>`);
  bindClose();
  $$('[data-add-source]').forEach(b => b.onclick = () => { const s=b.dataset.addSource; closeModal(); if(s==='camera') els.camera.click(); else if(s==='gallery') els.gallery.click(); else openWineForm({}); });
}

async function handleScan(file) {
  if (!file) return;
  loading(true,'Analisando o rótulo...');
  try {
    const compressed = await compressImage(file, { maxSide: 1500, quality:.82 });
    const base64 = await fileToBase64(compressed);
    const info = await scanLabel(base64, compressed.type || 'image/jpeg');
    let cloud = null;
    const cfg = getCloudinaryConfig();
    if (cfg.cloudName && cfg.uploadPreset) {
      try { loading(true,'Salvando a foto no Cloudinary...'); cloud = await uploadImage(compressed, { tags:'adega-eid,rotulo' }); }
      catch(e){ console.warn('[ADEGA] Cloudinary upload:',e); toast(`Rótulo identificado, mas a foto não foi salva: ${errMessage(e)}`,'error'); }
    }
    openWineForm({ ...info, imageUrl: cloud?.url || '', imagePublicId: cloud?.publicId || '' }, compressed);
  } catch(e) { toast(errMessage(e),'error'); }
  finally { loading(false); els.camera.value=''; els.gallery.value=''; }
}

function openWineForm(info = {}, originalFile = null, wineId = '') {
  const editing = Boolean(wineId);
  const s = ui.state.v2.settings; const locations=(s.shelves||[]).flatMap(sh=>Array.from({length:s.slotsPerShelf||6},(_,i)=>`${sh}${i+1}`));
  openModal(`${modalHead(editing?'Editar vinho':'Confirmar vinho', editing?'Atualize somente os campos necessários.':'Confira os dados antes de gravar no Firebase.')}
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>Nome do vinho *</label><input id="f-name" value="${escapeHtml(info.wineName||'')}" placeholder="Ex.: Catena Malbec"></div>
      <div class="field"><label>Produtor</label><input id="f-producer" value="${escapeHtml(info.producer||'')}"></div>
      <div class="field"><label>Uva / corte</label><input id="f-grape" value="${escapeHtml(info.grape||'')}"></div>
      <div class="field"><label>Região</label><input id="f-region" value="${escapeHtml(info.region||'')}"></div>
      <div class="field"><label>País</label><input id="f-country" value="${escapeHtml(info.country||'')}"></div>
      <div class="field"><label>Safra</label><input id="f-year" inputmode="numeric" value="${escapeHtml(info.year??'')}"></div>
      <div class="field"><label>Tipo</label><select id="f-type"><option value="">Não informado</option>${['Tinto','Branco','Rosé','Espumante','Fortificado','Sobremesa','Outro'].map(x=>`<option ${info.type===x?'selected':''}>${x}</option>`).join('')}</select></div>
      ${editing?'':`<div class="field"><label>Quantidade</label><input id="f-qty" type="number" min="1" value="${Math.max(1,safeNumber(info.quantity,1))}"></div>`}
      <div class="field"><label>Valor unitário (R$)</label><input id="f-price" inputmode="decimal" value="${info.purchasePrice?escapeHtml(String(info.purchasePrice)):''}"></div>
      <div class="field"><label>Data da compra</label><input id="f-purchase-date" type="date" value="${escapeHtml(info.purchaseDate||'')}"></div>
      <div class="field"><label>Local da compra</label><input id="f-purchase-place" value="${escapeHtml(info.purchasePlace||'')}"></div>
      <div class="field"><label>Posição padrão</label><select id="f-location"><option value="">Sem posição</option>${locations.map(x=>`<option ${info.location===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field full"><label>Descrição / observação</label><textarea id="f-description">${escapeHtml(info.description||'')}</textarea></div>
      <div class="field full"><label>Foto do rótulo</label><input id="f-image" value="${escapeHtml(info.imageUrl||'')}" placeholder="URL Cloudinary (opcional)"></div>
    </div>
    ${!getCloudinaryConfig().cloudName ? '<div class="notice" style="margin-top:12px">Cloudinary não está configurado neste projeto de adega. A foto ainda pode ser usada para leitura da IA, mas não será guardada até o Cloudinary ser configurado.</div>' : ''}
    <div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" id="save-wine">${editing?'Salvar alterações':'Salvar na adega'}</button></div></div>`);
  bindClose();
  $('#save-wine').onclick = withError(async()=>{
    const wineName=$('#f-name').value.trim(); if(!wineName) return toast('Informe o nome do vinho.','error');
    const data={ wineName, producer:$('#f-producer').value.trim(), grape:$('#f-grape').value.trim(), region:$('#f-region').value.trim(), country:$('#f-country').value.trim(), year:$('#f-year').value.trim(), type:$('#f-type').value, purchasePrice:safeNumber($('#f-price').value,0), purchaseDate:$('#f-purchase-date').value, purchasePlace:$('#f-purchase-place').value.trim(), location:$('#f-location').value, description:$('#f-description').value.trim(), imageUrl:$('#f-image').value.trim(), imagePublicId:info.imagePublicId||'' };
    loading(true,editing?'Salvando alterações...':'Registrando na adega...');
    try { if(editing) await updateWine(wineId,data); else await addWine(data,Math.max(1,Math.floor(safeNumber($('#f-qty').value,1)))); closeModal(); toast(editing?'Cadastro atualizado.':'Vinho adicionado à adega.','success'); }
    finally{ loading(false); }
  });
}

function openWineDetails(id) {
  const w = ui.state.wines.find(x=>x.id===String(id)); if(!w) return;
  const stored = currentStoredBottles(w); const locs=[...new Set(stored.map(b=>b.location).filter(Boolean))];
  openModal(`${modalHead('Detalhes do rótulo','Estoque e histórico permanecem sincronizados no banco atual.')}
    <div class="modal-body">
      <div class="detail-hero"><div class="detail-photo">${w.imageUrl?`<img src="${escapeHtml(w.imageUrl)}" alt="${escapeHtml(w.wineName)}">`:'🍷'}</div><div class="detail-title"><div class="pill-row">${w.favorite?'<span class="meta-pill">★ Favorito</span>':''}${w.type?`<span class="meta-pill">${escapeHtml(w.type)}</span>`:''}${w.year?`<span class="meta-pill">Safra ${escapeHtml(w.year)}</span>`:''}</div><h2>${escapeHtml(w.wineName)}</h2><p>${escapeHtml([w.producer,w.grape,w.region,w.country].filter(Boolean).join(' · ') || 'Detalhes técnicos ainda não cadastrados.')}</p>${locs.length?`<p>⌖ ${escapeHtml(locs.join(', '))}</p>`:''}</div></div>
      <div class="quantity-box"><div><small style="color:var(--muted);text-transform:uppercase;font-size:9px">Garrafas disponíveis</small><div style="font-size:10px;color:var(--muted);margin-top:3px">Entrada/saída registrada na auditoria</div></div><div class="qty-controls"><button id="qty-minus">−</button><strong>${w.quantity}</strong><button id="qty-plus">＋</button></div></div>
      ${w.description?`<div class="notice" style="margin-top:10px">${escapeHtml(w.description)}</div>`:''}
      <div class="action-grid">
        <button class="primary-btn" id="open-bottle" ${w.quantity<=0?'disabled':''}>🍷 Abrir garrafa</button>
        <button class="secondary-btn" id="wine-pair">🍽 Harmonizar</button>
        <button class="secondary-btn" id="wine-tech">📜 Ficha técnica</button>
        <button class="secondary-btn" id="wine-position">⌖ Localizar</button>
        <button class="secondary-btn" id="wine-favorite">★ ${w.favorite?'Remover favorito':'Favoritar'}</button>
        <button class="secondary-btn" id="wine-edit">✎ Editar</button>
      </div>
      <div class="modal-actions"><button class="danger-btn" id="wine-delete">Excluir rótulo</button></div>
    </div>`);
  bindClose();
  $('#qty-plus').onclick=withError(async()=>{await adjustQuantity(w.id,1,{detail:'Entrada rápida pela ficha do vinho'}); closeModal(); toast('Uma garrafa adicionada.','success');});
  $('#qty-minus').onclick=withError(async()=>{ if(w.quantity<=0)return; await adjustQuantity(w.id,-1,{type:'saida',status:'adjusted_out',detail:'Saída manual pela ficha do vinho'}); closeModal(); toast('Estoque ajustado.','success');});
  $('#open-bottle').onclick=()=>openTastingForm(w);
  $('#wine-tech').onclick=()=>showTechSheet(w);
  $('#wine-pair').onclick=()=>openPairingForm(w);
  $('#wine-position').onclick=()=>openBottleList(w);
  $('#wine-favorite').onclick=withError(async()=>{await toggleFavorite(w.id); closeModal();});
  $('#wine-edit').onclick=()=>openWineForm(w,null,w.id);
  $('#wine-delete').onclick=()=>confirmDeleteWine(w);
}

function openBottleList(w) {
  const bottles=currentStoredBottles(w);
  openModal(`${modalHead('Garrafas e posições',w.wineName)}<div class="modal-body">${bottles.length?`<div class="timeline">${bottles.map((b,i)=>`<div class="timeline-item"><span class="timeline-icon">${i+1}</span><div><strong>Garrafa ${i+1}</strong><p>${escapeHtml(b.location||'Sem posição')}${b.purchasePrice?` · ${money(b.purchasePrice)}`:''}</p></div><button class="secondary-btn" data-edit-bottle-loc="${escapeHtml(b.id)}">Posição</button></div>`).join('')}</div>`:journalEmpty('Não há garrafas disponíveis deste rótulo.')}</div>`);
  bindClose(); $$('[data-edit-bottle-loc]').forEach(b=>b.onclick=()=>openPositionPicker(w.id,b.dataset.editBottleLoc));
}

function openTastingForm(w) {
  openModal(`${modalHead('Abrir garrafa',w.wineName)}<div class="modal-body"><div class="notice">Ao confirmar, o estoque será reduzido em 1 e a movimentação ficará registrada. Os dados de degustação são opcionais.</div><div class="form-grid" style="margin-top:12px">
    <div class="field"><label>Nota (0 a 5)</label><select id="t-rating"><option value="0">Sem nota</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select></div>
    <div class="field"><label>Ocasião</label><input id="t-occasion" placeholder="Ex.: jantar em casa"></div>
    <div class="field full"><label>Comida / harmonização real</label><input id="t-food" placeholder="Ex.: churrasco, massa, queijo..."></div>
    <div class="field full"><label>Companhia</label><input id="t-companions" placeholder="Opcional"></div>
    <div class="field full"><label>Observações</label><textarea id="t-notes" placeholder="Aromas percebidos, evolução, impressão pessoal..."></textarea></div>
  </div><div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" id="confirm-open">Confirmar abertura</button></div></div>`);
  bindClose(); $('#confirm-open').onclick=withError(async()=>{ loading(true,'Registrando consumo...'); try{ await openBottle(w.id,{rating:safeNumber($('#t-rating').value),occasion:$('#t-occasion').value.trim(),food:$('#t-food').value.trim(),companions:$('#t-companions').value.trim(),notes:$('#t-notes').value.trim()}); closeModal(); toast('Garrafa aberta e registrada no diário.','success'); }finally{loading(false);} });
}

function confirmDeleteWine(w) {
  openModal(`${modalHead('Excluir rótulo','Esta ação remove o cadastro do estoque atual.')}<div class="modal-body"><div class="notice danger-note">Você está prestes a excluir <strong>${escapeHtml(w.wineName)}</strong> e ${w.quantity} garrafa(s) disponíveis. Uma movimentação de exclusão será mantida no histórico.</div><div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="danger-btn" id="confirm-delete">Excluir definitivamente</button></div></div>`);
  bindClose(); $('#confirm-delete').onclick=withError(async()=>{await deleteWine(w.id); closeModal(); toast('Rótulo removido.','success');});
}

async function showTechSheet(w) {
  loading(true,'Gerando ficha técnica...');
  try{ const r=await getTechSheet(w); openModal(`${modalHead('Ficha técnica',w.wineName)}<div class="modal-body"><div class="ai-result">${escapeHtml(r.text||'')}</div></div>`); bindClose(); }
  catch(e){toast(errMessage(e),'error');} finally{loading(false);}
}
function openPairingForm(w) {
  openModal(`${modalHead('Harmonizar vinho',w.wineName)}<div class="modal-body"><div class="form-grid"><div class="field full"><label>Prato, ocasião ou ingrediente principal</label><input id="pair-details" placeholder="Ex.: picanha na churrasqueira, risoto de funghi..."></div></div><div class="modal-actions"><button class="primary-btn" id="pair-run">Analisar harmonização</button></div></div>`);
  bindClose(); $('#pair-run').onclick=async()=>{const d=$('#pair-details').value.trim();if(!d)return toast('Descreva o prato ou ocasião.','error');loading(true,'Analisando harmonização...');try{const r=await getPairing(w,d);openModal(`${modalHead('Harmonização',w.wineName)}<div class="modal-body"><div class="ai-result">${escapeHtml(r.text||'')}</div></div>`);bindClose();}catch(e){toast(errMessage(e),'error');}finally{loading(false);}};
}

function openDinnerForm(prefill='') {
  openModal(`${modalHead('Planejar refeição','A IA só pode selecionar rótulos que constam no estoque real.')}
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Número de pessoas</label><input id="d-people" type="number" min="1" value="2"></div>
      <div class="field"><label>Ocasião</label><select id="d-occasion"><option>Jantar</option><option>Almoço</option><option>Churrasco</option><option>Happy hour</option><option>Degustação</option></select></div>
      <div class="field full"><label>Prato / cardápio / preferências</label><textarea id="d-details" placeholder="Ex.: carne vermelha, entrada com queijos e prato principal...">${escapeHtml(prefill)}</textarea></div>
    </div><div class="modal-actions"><button class="primary-btn" id="d-run">Cruzar com minha adega</button></div></div>`);
  bindClose(); $('#d-run').onclick=()=>runDinner({people:$('#d-people').value,occasion:$('#d-occasion').value,details:$('#d-details').value.trim()});
}
async function runDinner(data){ loading(true,'Cruzando refeição e estoque...'); try{const r=await planDinner(`Pessoas: ${data.people}. Ocasião: ${data.occasion}. Detalhes: ${data.details||'não informados'}.`);openModal(`${modalHead('Plano da refeição','Resultado baseado no estoque enviado à IA.') }<div class="modal-body"><div class="ai-result">${escapeHtml(r.text||'')}</div></div>`);bindClose();}catch(e){toast(errMessage(e),'error');}finally{loading(false);} }

function openWishlistForm(){openModal(`${modalHead('Adicionar desejo','Salve um vinho que deseja experimentar ou comprar.')}<div class="modal-body"><div class="form-grid"><div class="field full"><label>Nome do vinho *</label><input id="w-name"></div><div class="field"><label>Produtor</label><input id="w-producer"></div><div class="field"><label>Safra</label><input id="w-year"></div><div class="field full"><label>Observações</label><textarea id="w-notes"></textarea></div></div><div class="modal-actions"><button class="primary-btn" id="w-save">Salvar desejo</button></div></div>`);bindClose();$('#w-save').onclick=withError(async()=>{const n=$('#w-name').value.trim();if(!n)return toast('Informe o vinho.','error');await addWishlist({wineName:n,producer:$('#w-producer').value.trim(),year:$('#w-year').value.trim(),notes:$('#w-notes').value.trim()});closeModal();toast('Adicionado à lista de desejos.','success');});}
function openEventForm(){openModal(`${modalHead('Novo evento','Planeje um jantar, encontro ou degustação.') }<div class="modal-body"><div class="form-grid"><div class="field full"><label>Título *</label><input id="e-title" placeholder="Ex.: Jantar de sábado"></div><div class="field"><label>Data</label><input id="e-date" type="date"></div><div class="field"><label>Pessoas</label><input id="e-people" type="number" min="1" value="2"></div><div class="field full"><label>Cardápio / ideia</label><textarea id="e-meal"></textarea></div></div><div class="modal-actions"><button class="primary-btn" id="e-save">Salvar evento</button></div></div>`);bindClose();$('#e-save').onclick=withError(async()=>{const n=$('#e-title').value.trim();if(!n)return toast('Informe o título.','error');await addEvent({title:n,date:$('#e-date').value,people:safeNumber($('#e-people').value,2),meal:$('#e-meal').value.trim()});closeModal();toast('Evento salvo.','success');});}
function planStoredEvent(id){const e=ui.state.v2.events.find(x=>x.id===id);if(!e)return;openDinnerForm(`${e.title}. ${e.meal||''}`);setTimeout(()=>{if($('#d-people'))$('#d-people').value=e.people||2;if($('#d-occasion'))$('#d-occasion').value='Jantar';},0);}

async function aiSuggestion(){loading(true,'Escolhendo entre os rótulos disponíveis...');try{const r=await getSuggestion('Escolha uma opção adequada para hoje sem inventar contexto adicional.');openModal(`${modalHead('Escolha ideal','Somente rótulos que estão disponíveis na adega.') }<div class="modal-body"><div class="ai-result">${escapeHtml(r.text||'')}</div></div>`);bindClose();}catch(e){toast(errMessage(e),'error');}finally{loading(false);}}

function openSettings(){
  const s=ui.state.v2.settings;const c=getCloudinaryConfig();
  openModal(`${modalHead('Configurações','Integrações, adega visual, backup e diagnóstico.')}
    <div class="modal-body">
      <div class="section-head" style="margin-top:0"><div><small>PERFIL</small><h2>Identificação</h2></div></div>
      <div class="form-grid"><div class="field"><label>Nome para auditoria</label><input id="s-profile" value="${escapeHtml(s.profileName||'')}"></div><div class="field"><label>Nome da adega</label><input id="s-cellar" value="${escapeHtml(s.cellarName||'')}"></div><div class="field"><label>Prateleiras</label><input id="s-shelves" value="${escapeHtml((s.shelves||[]).join(', '))}" placeholder="A, B, C, D"></div><div class="field"><label>Posições por prateleira</label><input id="s-slots" type="number" min="1" max="20" value="${s.slotsPerShelf||6}"></div></div>
      <div class="section-head"><div><small>IMAGENS</small><h2>Cloudinary</h2></div></div>
      <div class="notice">O ZIP original enviado nesta conversa não continha configuração Cloudinary. Por isso o projeto tenta descobrir a configuração pública no mesmo Firebase e também permite gravá-la aqui sem alterar código.</div>
      <div class="form-grid" style="margin-top:10px"><div class="field"><label>Cloud name</label><input id="s-cloud" value="${escapeHtml(c.cloudName||'')}"></div><div class="field"><label>Unsigned upload preset</label><input id="s-preset" value="${escapeHtml(c.uploadPreset||'')}"></div><div class="field full"><label>Pasta</label><input id="s-folder" value="${escapeHtml(c.folder||'adega-eid')}"></div></div>
      <div class="modal-actions" style="justify-content:flex-start"><button class="secondary-btn" id="discover-cloud">Descobrir no Firebase</button><button class="secondary-btn" id="test-cloud">Testar Cloudinary</button></div>
      ${ui.state.runtime?.metaMode==='local'?'<div class="notice danger-note" style="margin-top:12px"><strong>Dados PRO em fallback local.</strong><br>O estoque continua no Firebase original, mas as Rules atuais não autorizaram o documento adega-compartilhada-pro-v2. Autorize esse documento para sincronizar diário, eventos e configurações entre aparelhos.</div>':''}
      <div class="section-head"><div><small>IA</small><h2>Backend Gemini</h2></div></div>
      <div id="settings-ai-note" class="notice">${ui.aiStatus?.configured?'Backend configurado e chave protegida no servidor.':'Para ativar a IA no deploy profissional, configure GEMINI_API_KEY nas Environment Variables da Vercel. A chave não fica mais no navegador.'}</div>
      <div class="section-head"><div><small>DADOS</small><h2>Backup e exportação</h2></div></div>
      <div class="modal-actions" style="justify-content:flex-start"><button class="secondary-btn" id="export-json">Backup JSON</button><button class="secondary-btn" id="export-csv">Estoque CSV</button><button class="secondary-btn" id="import-json">Importar backup</button></div>
      <div class="modal-actions"><button class="primary-btn" id="save-settings">Salvar configurações</button></div>
    </div>`);
  bindClose();
  $('#save-settings').onclick=withError(async()=>{const cloud={cloudName:$('#s-cloud').value.trim(),uploadPreset:$('#s-preset').value.trim(),folder:$('#s-folder').value.trim()||'adega-eid'};await saveSettings({profileName:$('#s-profile').value.trim()||APP_CONFIG.defaults.profileName,cellarName:$('#s-cellar').value.trim()||APP_CONFIG.defaults.cellarName,shelves:$('#s-shelves').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),slotsPerShelf:safeNumber($('#s-slots').value,6),cloudinary:cloud});localStorage.setItem('adega-eid-cloudinary-public-config',JSON.stringify(cloud));closeModal();toast('Configurações salvas.','success');});
  $('#discover-cloud').onclick=withError(async()=>{loading(true,'Procurando configuração no mesmo Firebase...');try{const found=await discoverCloudinary();if(found){$('#s-cloud').value=found.cloudName;$('#s-preset').value=found.uploadPreset;$('#s-folder').value=found.folder||'adega-eid';toast(`Cloudinary encontrado em ${found.source||'configuração existente'}.`,'success');}else toast('Nenhuma configuração Cloudinary completa foi encontrada no Firebase atual.','error');}finally{loading(false);}});
  $('#test-cloud').onclick=async()=>{loading(true,'Testando upload mínimo...');try{const r=await testCloudinaryConfig({cloudName:$('#s-cloud').value,uploadPreset:$('#s-preset').value,folder:$('#s-folder').value});toast(r.ok?'Cloudinary respondeu corretamente.':`Falha: ${r.error}`,r.ok?'success':'error');}finally{loading(false);}};
  $('#export-json').onclick=()=>{downloadText(`adega-eid-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backupObject(),null,2));toast('Backup JSON gerado.','success');};
  $('#export-csv').onclick=()=>{const rows=[['Nome','Produtor','Uva','Região','País','Safra','Tipo','Quantidade','Valor unitário','Posição']];ui.state.wines.forEach(w=>rows.push([w.wineName,w.producer,w.grape,w.region,w.country,w.year,w.type,w.quantity,w.purchasePrice,w.location]));downloadText(`adega-eid-estoque-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+toCSV(rows),'text/csv;charset=utf-8');toast('CSV gerado.','success');};
  $('#import-json').onclick=()=>els.backup.click();
}

async function importBackupFile(file){if(!file)return;try{const text=await file.text();const data=JSON.parse(text);if(!data||(!Array.isArray(data.estoque)&&!data.v2))throw new Error('Arquivo não parece ser um backup válido da adega.');openModal(`${modalHead('Confirmar importação','A importação substitui o estoque e os dados V2 do documento atual.') }<div class="modal-body"><div class="notice danger-note">O backup contém ${(data.estoque||[]).length} rótulo(s). Faça esta operação apenas se deseja substituir os dados atuais.</div><div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="danger-btn" id="confirm-import">Importar e substituir</button></div></div>`);bindClose();$('#confirm-import').onclick=withError(async()=>{loading(true,'Importando backup...');try{await replaceFromBackup(data);closeModal();toast('Backup importado.','success');}finally{loading(false);}});}catch(e){toast(errMessage(e),'error');}finally{els.backup.value='';}}

function bindGlobalEvents(){
  document.addEventListener('click',e=>{const route=e.target.closest('[data-route]');if(route)routeTo(route.dataset.route);const action=e.target.closest('[data-action]');if(action){const a=action.dataset.action;if(a==='add-wine'||a==='scan-wine')openAddWine();if(a==='open-dinner')openDinnerForm();if(a==='ai-suggest')aiSuggestion();}});
  els.backdrop.onclick=closeModal; $('#settings-btn').onclick=openSettings; $('#filters-btn').onclick=openFilters;
  $('#wine-search').addEventListener('input',debounce(e=>{ui.search=e.target.value;renderCellar();},120));
  $$('#journal-tabs button').forEach(b=>b.onclick=()=>{ui.journal=b.dataset.journal;renderJournal();});
  els.camera.onchange=e=>handleScan(e.target.files?.[0]); els.gallery.onchange=e=>handleScan(e.target.files?.[0]); els.backup.onchange=e=>importBackupFile(e.target.files?.[0]);
  $('#chat-form').onsubmit=async e=>{e.preventDefault();const input=$('#chat-input');const q=input.value.trim();if(!q)return;ui.chat.push({role:'user',text:q});input.value='';renderAI();loading(true,'Consultando estoque e conhecimento enológico...');try{const r=await askSommelier(q,ui.chat);ui.chat.push({role:'ai',text:r.text||'Sem resposta.'});}catch(err){ui.chat.push({role:'ai',text:`IA indisponível: ${errMessage(err)}`});}finally{loading(false);renderAI();}};
  window.addEventListener('online',()=>{els.sync.className='status-pill ok';els.sync.querySelector('span').textContent='Online';});
  window.addEventListener('offline',()=>{els.sync.className='status-pill error';els.sync.querySelector('span').textContent='Offline';});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ui.installPrompt=e;});
}

async function boot(){
  bindGlobalEvents();
  subscribe((state,error)=>{ui.state=state;ui.lastError=error||null;const localPro=state?.runtime?.metaMode==='local';els.sync.className=`status-pill ${error?'error':localPro?'':'ok'}`;els.sync.querySelector('span').textContent=error?'Erro Firebase':localPro?'Estoque sync · PRO local':'Sincronizado';renderAll();});
  startRealtime();
  renderAll();
  ui.aiStatus=await checkAI(); renderAI();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(e){console.warn('[ADEGA] SW',e);}}
}

boot();

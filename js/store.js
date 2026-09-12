import { db, adegaRef, metaRef, doc, getDoc, onSnapshot, runTransaction } from './firebase.js';
import { APP_CONFIG } from './config.js';
import { fingerprint, nowISO, safeNumber, uid } from './utils.js';

const LIMITS = { movements: 500, tastings: 250, events: 120, wishlist: 200 };
const META_LS_KEY = 'adega-eid-pro-v2-local-fallback';
let metaMode = 'firebase';

function readLocalMeta() {
  try {
    const raw = localStorage.getItem(META_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed?.v2 ? parsed : {};
  } catch (_) { return {}; }
}
function writeLocalMeta(v2) {
  try { localStorage.setItem(META_LS_KEY, JSON.stringify({ v2 })); } catch (_) {}
}

let state = normalizeDocument({}, readLocalMeta());
const listeners = new Set();
let unsubscribe = null;

function stableWineId(w, i) {
  return String(w?.id || `wine_${fingerprint(w) || i}`);
}

function normalizeBottle(b, wineId, i) {
  return {
    id: String(b?.id || `${wineId}_b${i + 1}`),
    status: b?.status || 'stored',
    location: b?.location || '',
    purchasePrice: safeNumber(b?.purchasePrice, 0),
    purchaseDate: b?.purchaseDate || '',
    purchasePlace: b?.purchasePlace || '',
    acquiredAt: b?.acquiredAt || '',
    openedAt: b?.openedAt || '',
    notes: b?.notes || ''
  };
}

export function normalizeWine(w = {}, i = 0) {
  const id = stableWineId(w, i);
  const quantity = Math.max(0, Math.floor(safeNumber(w.quantity, 0)));
  let bottles = Array.isArray(w.bottles) ? w.bottles.map((b, j) => normalizeBottle(b, id, j)) : [];
  const stored = bottles.filter(b => b.status === 'stored');
  if (stored.length < quantity) {
    for (let k = stored.length; k < quantity; k++) bottles.push(normalizeBottle({
      id: `${id}_legacy_${k + 1}`,
      status: 'stored',
      location: w.location || '',
      purchasePrice: w.purchasePrice || 0,
      purchaseDate: w.purchaseDate || '',
      purchasePlace: w.purchasePlace || ''
    }, id, bottles.length));
  } else if (stored.length > quantity) {
    // A versão legada consegue reduzir `quantity` sem conhecer bottles[].
    // Reconciliamos somente o excedente para a tela PRO nunca mostrar mais garrafas que o estoque oficial.
    stored.slice(quantity).forEach(b => { b.status = 'legacy_adjusted_out'; });
  }
  return {
    id,
    wineName: w.wineName || w.nome || 'Vinho sem nome',
    producer: w.producer || w.produtor || '',
    grape: w.grape || w.uva || '',
    region: w.region || w.regiao || '',
    country: w.country || w.pais || '',
    year: w.year ?? w.safra ?? '',
    type: w.type || w.tipo || '',
    description: w.description || w.descricao || '',
    foodPairings: Array.isArray(w.foodPairings) ? w.foodPairings : [],
    quantity,
    imageUrl: w.imageUrl || w.fotoUrl || '',
    imagePublicId: w.imagePublicId || w.publicId || '',
    favorite: Boolean(w.favorite),
    tags: Array.isArray(w.tags) ? w.tags : [],
    location: w.location || '',
    purchasePrice: safeNumber(w.purchasePrice, 0),
    purchaseDate: w.purchaseDate || '',
    purchasePlace: w.purchasePlace || '',
    purchaseNotes: w.purchaseNotes || '',
    createdAt: w.createdAt || '',
    updatedAt: w.updatedAt || '',
    bottles
  };
}

function defaults() {
  return {
    schemaVersion: 2,
    movements: [], tastings: [], wishlist: [], events: [],
    settings: {
      profileName: APP_CONFIG.defaults.profileName,
      cellarName: APP_CONFIG.defaults.cellarName,
      shelves: [...APP_CONFIG.defaults.shelves],
      slotsPerShelf: APP_CONFIG.defaults.slotsPerShelf,
      cloudinary: { ...APP_CONFIG.cloudinary },
      appLock: false
    },
    createdAt: nowISO(), updatedAt: nowISO()
  };
}

export function normalizeDocument(data = {}, meta = {}) {
  const base = defaults();
  // Compatibilidade de transição: lê v2 do documento PRO; se uma versão de teste antiga tiver v2 no legado, também recupera.
  const v2Source = meta?.v2 && typeof meta.v2 === 'object' ? meta.v2 : (data.v2 && typeof data.v2 === 'object' ? data.v2 : {});
  const v2 = v2Source;
  const settings = { ...base.settings, ...(v2.settings || {}) };
  settings.cloudinary = { ...base.settings.cloudinary, ...(v2.settings?.cloudinary || {}) };
  settings.shelves = Array.isArray(settings.shelves) && settings.shelves.length ? settings.shelves : base.settings.shelves;
  settings.slotsPerShelf = Math.max(1, Math.min(20, Math.floor(safeNumber(settings.slotsPerShelf, base.settings.slotsPerShelf))));
  return {
    wines: (Array.isArray(data.estoque) ? data.estoque : []).map(normalizeWine),
    v2: {
      ...base, ...v2, settings,
      movements: Array.isArray(v2.movements) ? v2.movements : [],
      tastings: Array.isArray(v2.tastings) ? v2.tastings : [],
      wishlist: Array.isArray(v2.wishlist) ? v2.wishlist : [],
      events: Array.isArray(v2.events) ? v2.events : []
    },
    raw: { legacy: data, meta },
    runtime: { metaMode }
  };
}

function legacySerializable(s) { return { estoque: s.wines }; }
function metaSerializable(s) { return { v2: s.v2 }; }

function notify() { listeners.forEach(fn => fn(state)); }
export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function startRealtime() {
  if (unsubscribe) return unsubscribe;
  let legacyData = {};
  let metaData = readLocalMeta();
  let legacyReady = false;
  const emit = () => {
    // O estoque legado é a fonte de verdade do inventário. Se as Rules não liberarem o doc PRO,
    // os recursos avançados caem para armazenamento local em vez de bloquear o estoque.
    if (!legacyReady) return;
    const effectiveMeta = metaMode === 'local' ? readLocalMeta() : metaData;
    state = normalizeDocument(legacyData, effectiveMeta);
    notify();
  };
  const offLegacy = onSnapshot(adegaRef, snap => {
    legacyReady = true;
    legacyData = snap.exists() ? snap.data() : {};
    emit();
  }, err => {
    console.error('[ADEGA] Firestore estoque listener:', err);
    listeners.forEach(fn => fn(state, err));
  });
  const offMeta = onSnapshot(metaRef, snap => {
    metaMode = 'firebase';
    metaData = snap.exists() ? snap.data() : readLocalMeta();
    if (snap.exists() && metaData?.v2) writeLocalMeta(metaData.v2);
    emit();
  }, err => {
    console.warn('[ADEGA] Documento PRO sem acesso; usando fallback local:', err?.code || err?.message);
    metaMode = 'local';
    metaData = readLocalMeta();
    emit();
  });
  unsubscribe = () => { offLegacy(); offMeta(); };
  return unsubscribe;
}

function isMetaPermissionError(error) {
  const code = String(error?.code || '');
  return code.includes('permission-denied') || code.includes('unauthenticated');
}

async function transactLocalFallback(mutator) {
  let localV2 = readLocalMeta();
  let finalState;
  const result = await runTransaction(db, async tx => {
    const legacySnap = await tx.get(adegaRef);
    const s = normalizeDocument(legacySnap.exists() ? legacySnap.data() : {}, localV2);
    const value = await mutator(s);
    s.v2.updatedAt = nowISO();
    tx.set(adegaRef, legacySerializable(s), { merge: true });
    finalState = s;
    return value;
  });
  if (finalState) {
    metaMode = 'local';
    writeLocalMeta(finalState.v2);
    state = normalizeDocument(legacySerializable(finalState), { v2: finalState.v2 });
    notify();
  }
  return result;
}

async function transact(mutator) {
  if (metaMode === 'local') return transactLocalFallback(mutator);
  try {
    return await runTransaction(db, async tx => {
      // Leitura sequencial intencional: todas as leituras acontecem antes das gravações.
      const legacySnap = await tx.get(adegaRef);
      const metaSnap = await tx.get(metaRef);
      const s = normalizeDocument(
        legacySnap.exists() ? legacySnap.data() : {},
        metaSnap.exists() ? metaSnap.data() : {}
      );
      const result = await mutator(s);
      s.v2.updatedAt = nowISO();
      tx.set(adegaRef, legacySerializable(s), { merge: true });
      tx.set(metaRef, metaSerializable(s), { merge: true });
      writeLocalMeta(s.v2);
      return result;
    });
  } catch (error) {
    if (!isMetaPermissionError(error)) throw error;
    console.warn('[ADEGA] Rules não autorizaram documento PRO; operação seguirá com V2 local.', error?.code || error?.message);
    metaMode = 'local';
    return transactLocalFallback(mutator);
  }
}

function actor(s) { return s.v2.settings.profileName || 'Usuário da adega'; }
function movement(s, data) {
  s.v2.movements.unshift({ id: uid('mov'), at: nowISO(), actor: actor(s), ...data });
  s.v2.movements = s.v2.movements.slice(0, LIMITS.movements);
}

function makeBottle(w, extra = {}) {
  return normalizeBottle({ id: uid('bottle'), status: 'stored', location: extra.location || w.location || '', purchasePrice: extra.purchasePrice ?? w.purchasePrice, purchaseDate: extra.purchaseDate || w.purchaseDate, purchasePlace: extra.purchasePlace || w.purchasePlace, acquiredAt: nowISO(), ...extra }, w.id, w.bottles.length);
}

function ensureStoredBottles(w) {
  const count = w.bottles.filter(b => b.status === 'stored').length;
  for (let i = count; i < w.quantity; i++) w.bottles.push(makeBottle(w));
}

export async function addWine(info, quantity = 1) {
  quantity = Math.max(1, Math.floor(safeNumber(quantity, 1)));
  return transact(s => {
    const fp = fingerprint(info);
    let w = s.wines.find(x => fingerprint(x) === fp && fp.replace(/\|/g, '') !== '');
    if (w) {
      w.quantity += quantity; ensureStoredBottles(w);
      if (!w.imageUrl && info.imageUrl) { w.imageUrl = info.imageUrl; w.imagePublicId = info.imagePublicId || ''; }
      w.updatedAt = nowISO();
    } else {
      w = normalizeWine({ ...info, id: uid('wine'), quantity, createdAt: nowISO(), updatedAt: nowISO(), bottles: [] }, s.wines.length);
      ensureStoredBottles(w); s.wines.push(w);
    }
    movement(s, { type: 'entrada', wineId: w.id, wineName: w.wineName, quantity, detail: 'Entrada de garrafa(s)' });
    return w.id;
  });
}

export async function updateWine(wineId, patch = {}) {
  return transact(s => {
    const w = s.wines.find(x => x.id === String(wineId));
    if (!w) throw new Error('Vinho não encontrado.');
    const oldName = w.wineName;
    Object.assign(w, patch, { id: w.id, updatedAt: nowISO() });
    w.quantity = Math.max(0, Math.floor(safeNumber(w.quantity, 0)));
    ensureStoredBottles(w);
    movement(s, { type: 'edicao', wineId: w.id, wineName: w.wineName, quantity: 0, detail: oldName === w.wineName ? 'Cadastro atualizado' : `Nome alterado de ${oldName}` });
  });
}

export async function adjustQuantity(wineId, delta, details = {}) {
  delta = Math.trunc(safeNumber(delta, 0));
  if (!delta) return;
  return transact(s => {
    const w = s.wines.find(x => x.id === String(wineId));
    if (!w) throw new Error('Vinho não encontrado.');
    ensureStoredBottles(w);
    if (delta > 0) {
      for (let i = 0; i < delta; i++) w.bottles.push(makeBottle(w, details));
      w.quantity += delta;
      movement(s, { type: 'entrada', wineId: w.id, wineName: w.wineName, quantity: delta, detail: details.detail || 'Ajuste positivo de estoque' });
    } else {
      const removeCount = Math.min(w.quantity, Math.abs(delta));
      const stored = w.bottles.filter(b => b.status === 'stored');
      for (let i = 0; i < removeCount; i++) {
        const b = stored[stored.length - 1 - i];
        if (b) { b.status = details.status || 'adjusted_out'; b.openedAt = nowISO(); b.notes = details.detail || b.notes; }
      }
      w.quantity -= removeCount;
      movement(s, { type: details.type || 'saida', wineId: w.id, wineName: w.wineName, quantity: -removeCount, detail: details.detail || 'Ajuste negativo de estoque' });
    }
    w.updatedAt = nowISO();
  });
}

export async function openBottle(wineId, tasting = null) {
  return transact(s => {
    const w = s.wines.find(x => x.id === String(wineId));
    if (!w || w.quantity <= 0) throw new Error('Não há garrafa disponível deste rótulo.');
    ensureStoredBottles(w);
    const bottle = [...w.bottles].reverse().find(b => b.status === 'stored');
    if (bottle) { bottle.status = 'consumed'; bottle.openedAt = nowISO(); }
    w.quantity -= 1; w.updatedAt = nowISO();
    movement(s, { type: 'consumo', wineId: w.id, wineName: w.wineName, bottleId: bottle?.id || '', quantity: -1, detail: tasting?.food ? `Consumido com ${tasting.food}` : 'Garrafa aberta/consumida' });
    if (tasting) {
      s.v2.tastings.unshift({ id: uid('taste'), at: nowISO(), wineId: w.id, wineName: w.wineName, year: w.year || '', rating: Math.max(0, Math.min(5, safeNumber(tasting.rating, 0))), food: tasting.food || '', occasion: tasting.occasion || '', companions: tasting.companions || '', notes: tasting.notes || '', actor: actor(s) });
      s.v2.tastings = s.v2.tastings.slice(0, LIMITS.tastings);
    }
  });
}

export async function assignBottleLocation(wineId, bottleId, location) {
  return transact(s => {
    const w = s.wines.find(x => x.id === String(wineId));
    if (!w) throw new Error('Vinho não encontrado.');
    ensureStoredBottles(w);
    const b = w.bottles.find(x => x.id === String(bottleId));
    if (!b || b.status !== 'stored') throw new Error('Garrafa não disponível.');
    const previous = b.location || 'sem posição';
    b.location = location || '';
    w.location = w.bottles.find(x => x.status === 'stored' && x.location)?.location || w.location || '';
    movement(s, { type: 'localizacao', wineId: w.id, wineName: w.wineName, bottleId: b.id, quantity: 0, detail: `${previous} → ${location || 'sem posição'}` });
  });
}

export async function toggleFavorite(wineId) {
  return transact(s => {
    const w = s.wines.find(x => x.id === String(wineId));
    if (!w) return;
    w.favorite = !w.favorite; w.updatedAt = nowISO();
  });
}

export async function deleteWine(wineId) {
  return transact(s => {
    const i = s.wines.findIndex(x => x.id === String(wineId));
    if (i < 0) return;
    const w = s.wines[i];
    movement(s, { type: 'exclusao', wineId: w.id, wineName: w.wineName, quantity: -w.quantity, detail: 'Rótulo removido da adega' });
    s.wines.splice(i, 1);
  });
}

export async function addWishlist(item) {
  return transact(s => {
    s.v2.wishlist.unshift({ id: uid('wish'), createdAt: nowISO(), ...item });
    s.v2.wishlist = s.v2.wishlist.slice(0, LIMITS.wishlist);
  });
}
export async function removeWishlist(id) { return transact(s => { s.v2.wishlist = s.v2.wishlist.filter(x => x.id !== id); }); }

export async function addEvent(item) {
  return transact(s => {
    s.v2.events.unshift({ id: uid('event'), createdAt: nowISO(), status: 'planejado', ...item });
    s.v2.events = s.v2.events.slice(0, LIMITS.events);
  });
}
export async function removeEvent(id) { return transact(s => { s.v2.events = s.v2.events.filter(x => x.id !== id); }); }

export async function saveSettings(patch) {
  return transact(s => {
    const current = s.v2.settings;
    const next = { ...current, ...patch };
    if (patch.cloudinary) next.cloudinary = { ...current.cloudinary, ...patch.cloudinary };
    if (patch.shelves) next.shelves = patch.shelves.filter(Boolean).slice(0, 12);
    if (patch.slotsPerShelf != null) next.slotsPerShelf = Math.max(1, Math.min(20, Math.floor(safeNumber(patch.slotsPerShelf, current.slotsPerShelf))));
    s.v2.settings = next;
  });
}

export async function replaceFromBackup(backup) {
  const source = backup?.estoque || backup?.v2 ? backup : (backup?.raw?.legacy || backup?.raw || {});
  const meta = backup?.v2 ? { v2: backup.v2 } : (backup?.raw?.meta || {});
  const incoming = normalizeDocument(source, meta);
  return transact(s => {
    s.wines = incoming.wines;
    s.v2 = { ...incoming.v2, updatedAt: nowISO() };
    movement(s, { type: 'importacao', wineId: '', wineName: '', quantity: 0, detail: 'Backup JSON importado' });
  });
}

export function backupObject() { return { exportedAt: nowISO(), appVersion: APP_CONFIG.version, firebaseProject: APP_CONFIG.firebase.projectId, legacyDocument: APP_CONFIG.adegaId, proDocument: APP_CONFIG.metaDocId, estoque: state.wines, v2: state.v2 }; }

export async function discoverCloudinaryFromFirebase() {
  const paths = [
    ['settings', 'integrations'], ['settings', 'publicIntegrations'], ['integrations', 'cloudinary'], ['config', 'publicIntegrations']
  ];
  for (const [c, id] of paths) {
    try {
      const snap = await getDoc(doc(db, c, id));
      if (!snap.exists()) continue;
      const raw = snap.data();
      const v = raw.cloudinary || raw.publicIntegrations?.cloudinary || raw.integrations?.cloudinary || raw;
      const cloudName = v?.cloudName || v?.cloud_name || '';
      const uploadPreset = v?.uploadPreset || v?.upload_preset || v?.preset || v?.unsignedPreset || '';
      const folder = v?.folder || APP_CONFIG.cloudinary.folder;
      if (cloudName && uploadPreset) return { cloudName, uploadPreset, folder, source: `${c}/${id}` };
    } catch (e) { console.debug('[ADEGA] Cloudinary discovery', c, id, e?.code || e?.message); }
  }
  return null;
}

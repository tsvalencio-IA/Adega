import { db, adegaRef, metaRef, doc, getDoc, onSnapshot, runTransaction } from './firebase.js';
import { APP_CONFIG } from './config.js';
import { fingerprint, nowISO, safeNumber, uid } from './utils.js';
import { currentIdentity } from './auth.js';

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
    // A versÃ£o legada consegue reduzir `quantity` sem conhecer bottles[].
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
  // Compatibilidade de transiÃ§Ã£o: lÃª v2 do documento PRO; se uma versÃ£o de teste antiga tiver v2 no legado, tambÃ©m recupera.
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
    // O estoque legado Ã© a fonte de verdade do inventÃ¡rio. Se as Rules nÃ£o liberarem o doc PRO,
    // os recursos avanÃ§ados caem para armazenamento local em vez de bloquear o estoque.
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
  if (metaMode === 'local') return transactLocalFallback(mutato²È="25™¼¹¥µ…•UÉ°ìÜ¹¥µ…•AÕ‰±¥%€ô¥¹™¼¹¥µ…•AÕ‰±¥%ñğ€œœìô(€€€€€Ü¹ÕÁ‘…Ñ•‘Ğ€ô¹½İ%M< ¤ì(€€€ô•±Í”ì(€€€€€Ü€ô¹½Éµ…±¥é•]¥¹”¡ì€¸¸¹¥¹™¼°¥èÕ¥ İ¥¹”œ¤°ÅÕ…¹Ñ¥Ñä°É•…Ñ•‘Ğè¹½İ%M< ¤°ÕÁ‘…Ñ•‘Ğè¹½İ%M< ¤°‰½ÑÑ±•Ìèmtô°Ì¹İ¥¹•Ì¹±•¹Ñ ¤ì(€€€€€•¹ÍÕÉ•MÑ½É•‘	½ÑÑ±•Ì¡Ü¤ìÌ¹İ¥¹•Ì¹ÁÕÍ ¡Ü¤ì(€€€ô(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€•¹ÑÉ…‘„œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°ÅÕ…¹Ñ¥Ñä°‘•Ñ…¥°è€¹ÑÉ…‘„‘”…ÉÉ…™„¡Ì¤œô¤ì(€€€É•ÑÕÉ¸Ü¹¥ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸ÕÁ‘…Ñ•]¥¹”¡İ¥¹•%°Á…Ñ €ôíô¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€ …Ü¤Ñ¡É½Ü¹•ÜÉÉ½È Y¥¹¡¼»¼•¹½¹ÑÉ…‘¼¸œ¤ì(€€€½¹ÍĞ½±‘9…µ”€ôÜ¹İ¥¹•9…µ”ì(€€€=‰©•Ğ¹…ÍÍ¥¸¡Ü°Á…Ñ °ì¥èÜ¹¥°ÕÁ‘…Ñ•‘Ğè¹½İ%M< ¤ô¤ì(€€€Ü¹ÅÕ…¹Ñ¥Ñä€ô5…Ñ ¹µ…à À°5…Ñ ¹™±½½È¡Í…™•9Õµ‰•È¡Ü¹ÅÕ…¹Ñ¥Ñä°€À¤¤¤ì(€€€•¹ÍÕÉ•MÑ½É•‘	½ÑÑ±•Ì¡Ü¤ì(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€•‘¥…¼œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°ÅÕ…¹Ñ¥Ñäè€À°‘•Ñ…¥°è½±‘9…µ”€ôôôÜ¹İ¥¹•9…µ”€ü€…‘…ÍÑÉ¼…ÑÕ…±¥é…‘¼œ€è9½µ”…±Ñ•É…‘¼‘”€‘í½±‘9…µ•õ€ô¤ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸…‘©ÕÍÑEÕ…¹Ñ¥Ñä¡İ¥¹•%°‘•±Ñ„°‘•Ñ…¥±Ì€ôíô¤ì(€‘•±Ñ„€ô5…Ñ ¹ÑÉÕ¹Œ¡Í…™•9Õµ‰•È¡‘•±Ñ„°€À¤¤ì(€¥˜€ …‘•±Ñ„¤É•ÑÕÉ¸ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€ …Ü¤Ñ¡É½Ü¹•ÜÉÉ½È Y¥¹¡¼»¼•¹½¹ÑÉ…‘¼¸œ¤ì(€€€•¹ÍÕÉ•MÑ½É•‘	½ÑÑ±•Ì¡Ü¤ì(€€€¥˜€¡‘•±Ñ„€ø€À¤ì(€€€€€™½È€¡±•Ğ¤€ô€Àì¤€ğ‘•±Ñ„ì¤¬¬¤Ü¹‰½ÑÑ±•Ì¹ÁÕÍ ¡µ…­•	½ÑÑ±”¡Ü°‘•Ñ…¥±Ì¤¤ì(€€€€€Ü¹ÅÕ…¹Ñ¥Ñä€¬ô‘•±Ñ„ì(€€€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€•¹ÑÉ…‘„œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°ÅÕ…¹Ñ¥Ñäè‘•±Ñ„°‘•Ñ…¥°è‘•Ñ…¥±Ì¹‘•Ñ…¥°ñğ€©ÕÍÑ”Á½Í¥Ñ¥Ù¼‘”•ÍÑ½ÅÕ”œô¤ì(€€€ô•±Í”ì(€€€€€½¹ÍĞÉ•µ½Ù•½Õ¹Ğ€ô5…Ñ ¹µ¥¸¡Ü¹ÅÕ…¹Ñ¥Ñä°5…Ñ ¹…‰Ì¡‘•±Ñ„¤¤ì(€€€€€½¹ÍĞÍÑ½É•€ôÜ¹‰½ÑÑ±•Ì¹™¥±Ñ•È¡ˆ€ôøˆ¹ÍÑ…ÑÕÌ€ôôô€ÍÑ½É•œ¤ì(€€€€€™½È€¡±•Ğ¤€ô€Àì¤€ğÉ•µ½Ù•½Õ¹Ğì¤¬¬¤ì(€€€€€€€½¹ÍĞˆ€ôÍÑ½É•‘mÍÑ½É•¹±•¹Ñ €´€Ä€´¥tì(€€€€€€€¥˜€¡ˆ¤ìˆ¹ÍÑ…ÑÕÌ€ô‘•Ñ…¥±Ì¹ÍÑ…ÑÕÌñğ€…‘©ÕÍÑ•‘}½ÕĞœìˆ¹½Á•¹•‘Ğ€ô¹½İ%M< ¤ìˆ¹¹½Ñ•Ì€ô‘•Ñ…¥±Ì¹‘•Ñ…¥°ñğˆ¹¹½Ñ•Ììô(€€€€€ô(€€€€€Ü¹ÅÕ…¹Ñ¥Ñä€´ôÉ•µ½Ù•½Õ¹Ğì(€€€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è‘•Ñ…¥±Ì¹ÑåÁ”ñğ€Í…¥‘„œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°ÅÕ…¹Ñ¥Ñäè€µÉ•µ½Ù•½Õ¹Ğ°‘•Ñ…¥°è‘•Ñ…¥±Ì¹‘•Ñ…¥°ñğ€©ÕÍÑ”¹•…Ñ¥Ù¼‘”•ÍÑ½ÅÕ”œô¤ì(€€€ô(€€€Ü¹ÕÁ‘…Ñ•‘Ğ€ô¹½İ%M< ¤ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸½Á•¹	½ÑÑ±”¡İ¥¹•%°Ñ…ÍÑ¥¹œ€ô¹Õ±°¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€ …ÜñğÜ¹ÅÕ…¹Ñ¥Ñä€ğô€À¤Ñ¡É½Ü¹•ÜÉÉ½È ;¼£„…ÉÉ…™„‘¥ÍÁ½»µÙ•°‘•ÍÑ”ËÍÑÕ±¼¸œ¤ì(€€€•¹ÍÕÉ•MÑ½É•‘	½ÑÑ±•Ì¡Ü¤ì(€€€½¹ÍĞ‰½ÑÑ±”€ôl¸¸¹Ü¹‰½ÑÑ±•Ít¹É•Ù•ÉÍ” ¤¹™¥¹¡ˆ€ôøˆ¹ÍÑ…ÑÕÌ€ôôô€ÍÑ½É•œ¤ì(€€€¥˜€¡‰½ÑÑ±”¤ì‰½ÑÑ±”¹ÍÑ…ÑÕÌ€ô€½¹ÍÕµ•œì‰½ÑÑ±”¹½Á•¹•‘Ğ€ô¹½İ%M< ¤ìô(€€€Ü¹ÅÕ…¹Ñ¥Ñä€´ô€ÄìÜ¹ÕÁ‘…Ñ•‘Ğ€ô¹½İ%M< ¤ì(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€½¹ÍÕµ¼œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°‰½ÑÑ±•%è‰½ÑÑ±”ü¹¥ñğ€œœ°ÅÕ…¹Ñ¥Ñäè€´Ä°‘•Ñ…¥°èÑ…ÍÑ¥¹œü¹™½½€ü½¹ÍÕµ¥‘¼½´€‘íÑ…ÍÑ¥¹œ¹™½½‘õ€€è€…ÉÉ…™„…‰•ÉÑ„½½¹ÍÕµ¥‘„œô¤ì(€€€¥˜€¡Ñ…ÍÑ¥¹œ¤ì(€€€€€Ì¹ØÈ¹Ñ…ÍÑ¥¹Ì¹Õ¹Í¡¥™Ğ¡ì¥èÕ¥ Ñ…ÍÑ”œ¤°…Ğè¹½İ%M< ¤°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°å•…ÈèÜ¹å•…Èñğ€œœ°É…Ñ¥¹œè5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ Ô°Í…™•9Õµ‰•È¡Ñ…ÍÑ¥¹œ¹É…Ñ¥¹œ°€À¤¤¤°™½½èÑ…ÍÑ¥¹œ¹™½½ñğ€œœ°½…Í¥½¸èÑ…ÍÑ¥¹œ¹½…Í¥½¸ñğ€œœ°½µÁ…¹¥½¹ÌèÑ…ÍÑ¥¹œ¹½µÁ…¹¥½¹Ìñğ€œœ°¹½Ñ•ÌèÑ…ÍÑ¥¹œ¹¹½Ñ•Ìñğ€œœ°€¸¸¹…Ñ½É%‘•¹Ñ¥Ñä¡Ì¤ô¤ì(€€€€€Ì¹ØÈ¹Ñ…ÍÑ¥¹Ì€ôÌ¹ØÈ¹Ñ…ÍÑ¥¹Ì¹Í±¥” À°1%5%QL¹Ñ…ÍÑ¥¹Ì¤ì(€€€ô(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸…ÍÍ¥¹	½ÑÑ±•1½…Ñ¥½¸¡İ¥¹•%°‰½ÑÑ±•%°±½…Ñ¥½¸¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€ …Ü¤Ñ¡É½Ü¹•ÜÉÉ½È Y¥¹¡¼»¼•¹½¹ÑÉ…‘¼¸œ¤ì(€€€•¹ÍÕÉ•MÑ½É•‘	½ÑÑ±•Ì¡Ü¤ì(€€€½¹ÍĞˆ€ôÜ¹‰½ÑÑ±•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡‰½ÑÑ±•%¤¤ì(€€€¥˜€ …ˆñğˆ¹ÍÑ…ÑÕÌ€„ôô€ÍÑ½É•œ¤Ñ¡É½Ü¹•ÜÉÉ½È …ÉÉ…™„»¼‘¥ÍÁ½»µÙ•°¸œ¤ì(€€€½¹ÍĞÁÉ•Ù¥½ÕÌ€ôˆ¹±½…Ñ¥½¸ñğ€Í•´Á½Í§Ÿ¼œì(€€€ˆ¹±½…Ñ¥½¸€ô±½…Ñ¥½¸ñğ€œœì(€€€Ü¹±½…Ñ¥½¸€ôÜ¹‰½ÑÑ±•Ì¹™¥¹¡à€ôøà¹ÍÑ…ÑÕÌ€ôôô€ÍÑ½É•œ€˜˜à¹±½…Ñ¥½¸¤ü¹±½…Ñ¥½¸ñğÜ¹±½…Ñ¥½¸ñğ€œœì(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€±½…±¥é……¼œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°‰½ÑÑ±•%èˆ¹¥°ÅÕ…¹Ñ¥Ñäè€À°‘•Ñ…¥°è€‘íÁÉ•Ù¥½ÕÍôƒŠH€‘í±½…Ñ¥½¸ñğ€Í•´Á½Í§Ÿ¼õ€ô¤ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸Ñ½±•…Ù½É¥Ñ”¡İ¥¹•%¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ì¹™¥¹¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€ …Ü¤É•ÑÕÉ¸ì(€€€Ü¹™…Ù½É¥Ñ”€ô€…Ü¹™…Ù½É¥Ñ”ìÜ¹ÕÁ‘…Ñ•‘Ğ€ô¹½İ%M< ¤ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸‘•±•Ñ•]¥¹”¡İ¥¹•%¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞ¤€ôÌ¹İ¥¹•Ì¹™¥¹‘%¹‘•à¡à€ôøà¹¥€ôôôMÑÉ¥¹œ¡İ¥¹•%¤¤ì(€€€¥˜€¡¤€ğ€À¤É•ÑÕÉ¸ì(€€€½¹ÍĞÜ€ôÌ¹İ¥¹•Ím¥tì(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€•á±ÕÍ…¼œ°İ¥¹•%èÜ¹¥°İ¥¹•9…µ”èÜ¹İ¥¹•9…µ”°ÅÕ…¹Ñ¥Ñäè€µÜ¹ÅÕ…¹Ñ¥Ñä°‘•Ñ…¥°è€KÍÑÕ±¼É•µ½Ù¥‘¼‘„…‘•„œô¤ì(€€€Ì¹İ¥¹•Ì¹ÍÁ±¥”¡¤°€Ä¤ì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸…‘‘]¥Í¡±¥ÍĞ¡¥Ñ•´¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€Ì¹ØÈ¹İ¥Í¡±¥ÍĞ¹Õ¹Í¡¥™Ğ¡ì¥èÕ¥ İ¥Í œ¤°É•…Ñ•‘Ğè¹½İ%M< ¤°€¸¸¹¥Ñ•´ô¤ì(€€€Ì¹ØÈ¹İ¥Í¡±¥ÍĞ€ôÌ¹ØÈ¹İ¥Í¡±¥ÍĞ¹Í±¥” À°1%5%QL¹İ¥Í¡±¥ÍĞ¤ì(€ô¤ì)ô)•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸É•µ½Ù•]¥Í¡±¥ÍĞ¡¥¤ìÉ•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøìÌ¹ØÈ¹İ¥Í¡±¥ÍĞ€ôÌ¹ØÈ¹İ¥Í¡±¥ÍĞ¹™¥±Ñ•È¡à€ôøà¹¥€„ôô¥¤ìô¤ìô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸…‘‘Ù•¹Ğ¡¥Ñ•´¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€Ì¹ØÈ¹•Ù•¹ÑÌ¹Õ¹Í¡¥™Ğ¡ì¥èÕ¥ •Ù•¹Ğœ¤°É•…Ñ•‘Ğè¹½İ%M< ¤°ÍÑ…ÑÕÌè€Á±…¹•©…‘¼œ°€¸¸¹¥Ñ•´ô¤ì(€€€Ì¹ØÈ¹•Ù•¹ÑÌ€ôÌ¹ØÈ¹•Ù•¹ÑÌ¹Í±¥” À°1%5%QL¹•Ù•¹ÑÌ¤ì(€ô¤ì)ô)•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸É•µ½Ù•Ù•¹Ğ¡¥¤ìÉ•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøìÌ¹ØÈ¹•Ù•¹ÑÌ€ôÌ¹ØÈ¹•Ù•¹ÑÌ¹™¥±Ñ•È¡à€ôøà¹¥€„ôô¥¤ìô¤ìô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸Í…Ù•M•ÑÑ¥¹Ì¡Á…Ñ ¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€½¹ÍĞÕÉÉ•¹Ğ€ôÌ¹ØÈ¹Í•ÑÑ¥¹Ìì(€€€½¹ÍĞ¹•áĞ€ôì€¸¸¹ÕÉÉ•¹Ğ°€¸¸¹Á…Ñ ôì(€€€¥˜€¡Á…Ñ ¹±½Õ‘¥¹…Éä¤¹•áĞ¹±½Õ‘¥¹…Éä€ôì€¸¸¹ÕÉÉ•¹Ğ¹±½Õ‘¥¹…Éä°€¸¸¹Á…Ñ ¹±½Õ‘¥¹…Éäôì(€€€¥˜€¡Á…Ñ ¹Í¡•±Ù•Ì¤¹•áĞ¹Í¡•±Ù•Ì€ôÁ…Ñ ¹Í¡•±Ù•Ì¹™¥±Ñ•È¡	½½±•…¸¤¹Í±¥” À°€ÄÈ¤ì(€€€¥˜€¡Á…Ñ ¹Í±½ÑÍA•ÉM¡•±˜€„ô¹Õ±°¤¹•áĞ¹Í±½ÑÍA•ÉM¡•±˜€ô5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ ÈÀ°5…Ñ ¹™±½½È¡Í…™•9Õµ‰•È¡Á…Ñ ¹Í±½ÑÍA•ÉM¡•±˜°ÕÉÉ•¹Ğ¹Í±½ÑÍA•ÉM¡•±˜¤¤¤¤ì(€€€Ì¹ØÈ¹Í•ÑÑ¥¹Ì€ô¹•áĞì(€ô¤ì)ô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸É•Á±…•É½µ	…­ÕÀ¡‰…­ÕÀ¤ì(€½¹ÍĞÍ½ÕÉ”€ô‰…­ÕÀü¹•ÍÑ½ÅÕ”ñğ‰…­ÕÀü¹ØÈ€ü‰…­ÕÀ€è€¡‰…­ÕÀü¹É…Üü¹±•…äñğ‰…­ÕÀü¹É…Üñğíô¤ì(€½¹ÍĞµ•Ñ„€ô‰…­ÕÀü¹ØÈ€üìØÈè‰…­ÕÀ¹ØÈô€è€¡‰…­ÕÀü¹É…Üü¹µ•Ñ„ñğíô¤ì(€½¹ÍĞ¥¹½µ¥¹œ€ô¹½Éµ…±¥é•½Õµ•¹Ğ¡Í½ÕÉ”°µ•Ñ„¤ì(€É•ÑÕÉ¸ÑÉ…¹Í…Ğ¡Ì€ôøì(€€€Ì¹İ¥¹•Ì€ô¥¹½µ¥¹œ¹İ¥¹•Ìì(€€€Ì¹ØÈ€ôì€¸¸¹¥¹½µ¥¹œ¹ØÈ°ÕÁ‘…Ñ•‘Ğè¹½İ%M< ¤ôì(€€€µ½Ù•µ•¹Ğ¡Ì°ìÑåÁ”è€¥µÁ½ÉÑ……¼œ°İ¥¹•%è€œœ°İ¥¹•9…µ”è€œœ°ÅÕ…¹Ñ¥Ñäè€À°‘•Ñ…¥°è€	…­ÕÀ)M=8¥µÁ½ÉÑ…‘¼œô¤ì(€ô¤ì)ô()•áÁ½ÉĞ™Õ¹Ñ¥½¸‰…­ÕÁ=‰©•Ğ ¤ìÉ•ÑÕÉ¸ì•áÁ½ÉÑ•‘Ğè¹½İ%M< ¤°…ÁÁY•ÉÍ¥½¸èAA}=9%¹Ù•ÉÍ¥½¸°™¥É•‰…Í•AÉ½©•ĞèAA}=9%¹™¥É•‰…Í”¹ÁÉ½©•Ñ%°±•…å½Õµ•¹ĞèAA}=9%¹…‘•…%°ÁÉ½½Õµ•¹ĞèAA}=9%¹µ•Ñ…½%°•ÍÑ½ÅÕ”èÍÑ…Ñ”¹İ¥¹•Ì°ØÈèÍÑ…Ñ”¹ØÈôìô()•áÁ½ÉĞ…Íå¹Œ™Õ¹Ñ¥½¸‘¥Í½Ù•É±½Õ‘¥¹…ÉåÉ½µ¥É•‰…Í” ¤ì(€½¹ÍĞÁ…Ñ¡Ì€ôl(€€€lÍ•ÑÑ¥¹Ìœ°€¥¹Ñ•É…Ñ¥½¹Ìt°lÍ•ÑÑ¥¹Ìœ°€ÁÕ‰±¥%¹Ñ•É…Ñ¥½¹Ìt°l¥¹Ñ•É…Ñ¥½¹Ìœ°€±½Õ‘¥¹…Éät°l½¹™¥œœ°€ÁÕ‰±¥%¹Ñ•É…Ñ¥½¹Ìt(€tì(€™½È€¡½¹ÍĞmŒ°¥‘t½˜Á…Ñ¡Ì¤ì(€€€ÑÉäì(€€€€€½¹ÍĞÍ¹…À€ô…İ…¥Ğ•Ñ½Œ¡‘½Œ¡‘ˆ°Œ°¥¤¤ì(€€€€€¥˜€ …Í¹…À¹•á¥ÍÑÌ ¤¤½¹Ñ¥¹Õ”ì(€€€€€½¹ÍĞÉ…Ü€ôÍ¹…À¹‘…Ñ„ ¤ì(€€€€€½¹ÍĞØ€ôÉ…Ü¹±½Õ‘¥¹…ÉäñğÉ…Ü¹ÁÕ‰±¥%¹Ñ•É…Ñ¥½¹Ìü¹±½Õ‘¥¹…ÉäñğÉ…Ü¹¥¹Ñ•É…Ñ¥½¹Ìü¹±½Õ‘¥¹…ÉäñğÉ…Üì(€€€€€½¹ÍĞ±½Õ‘9…µ”€ôØü¹±½Õ‘9…µ”ñğØü¹±½Õ‘}¹…µ”ñğ€œœì(€€€€€½¹ÍĞÕÁ±½…‘AÉ•Í•Ğ€ôØü¹ÕÁ±½…‘AÉ•Í•ĞñğØü¹ÕÁ±½…‘}ÁÉ•Í•ĞñğØü¹ÁÉ•Í•ĞñğØü¹Õ¹Í¥¹•‘AÉ•Í•Ğñğ€œœì(€€€€€½¹ÍĞ™½±‘•È€ôØü¹™½±‘•ÈñğAA}=9%¹±½Õ‘¥¹…Éä¹™½±‘•Èì(€€€€€¥˜€¡±½Õ‘9…µ”€˜˜ÕÁ±½…‘AÉ•Í•Ğ¤É•ÑÕÉ¸ì±½Õ‘9…µ”°ÕÁ±½…‘AÉ•Í•Ğ°™½±‘•È°Í½ÕÉ”è€‘íô¼‘í¥‘õ€ôì(€€€ô…Ñ €¡”¤ì½¹Í½±”¹‘•‰Õœ mt±½Õ‘¥¹…Éä‘¥Í½Ù•Éäœ°Œ°¥°”ü¹½‘”ñğ”ü¹µ•ÍÍ…”¤ìô(€ô(€É•ÑÕÉ¸¹Õ±°ì)ô(
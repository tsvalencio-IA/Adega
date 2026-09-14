import { db, adegaRef, doc, getDoc, onSnapshot, runTransaction } from './firebase.js';
import { APP_CONFIG } from './config.js';
import { fingerprint, nowISO, safeNumber, uid } from './utils.js';

export const LIMITS = { movements: 500, tastings: 250, events: 120, wishlist: 200 };
const META_LS_KEY = 'adega-eid-pro-v2-local-fallback';
let metaMode = 'firebase';
let unsubscribe = null;
let migrationQueued = false;
const listeners = new Set();

export function readLocalMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_LS_KEY) || '{}');
    return parsed?.v2 ? parsed : {};
  } catch (_) { return {}; }
}
export function writeLocalMeta(v2) {
  try { localStorage.setItem(META_LS_KEY, JSON.stringify({ v2 })); } catch (_) {}
}

function stableWineId(w, i) { return String(w?.id || `wine_${fingerprint(w) || i}`); }
export function numericPosition(value) {
  const raw = String(value ?? '').trim().replace(/^P/i, '');
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function normalizeBottle(b, wineId, i) {
  return {
    id: String(b?.id || `${wineId}_b${i + 1}`), status: b?.status || 'stored', location: b?.location || '',
    purchasePrice: safeNumber(b?.purchasePrice, 0), purchaseDate: b?.purchaseDate || '', purchasePlace: b?.purchasePlace || '',
    acquiredAt: b?.acquiredAt || '', openedAt: b?.openedAt || '', notes: b?.notes || ''
  };
}
export function normalizeWine(w = {}, i = 0) {
  const id = stableWineId(w, i);
  const quantity = Math.max(0, Math.floor(safeNumber(w.quantity, 0)));
  let bottles = Array.isArray(w.bottles) ? w.bottles.map((b, j) => normalizeBottle(b, id, j)) : [];
  const stored = bottles.filter(b => b.status === 'stored');
  if (stored.length < quantity) {
    for (let k = stored.length; k < quantity; k++) bottles.push(normalizeBottle({
      id: `${id}_legacy_${k + 1}`, status: 'stored', location: w.location || '', purchasePrice: w.purchasePrice || 0,
      purchaseDate: w.purchaseDate || '', purchasePlace: w.purchasePlace || ''
    }, id, bottles.length));
  } else if (stored.length > quantity) stored.slice(quantity).forEach(b => { b.status = 'legacy_adjusted_out'; });
  return {
    id, wineName: w.wineName || w.nome || 'Vinho sem nome', producer: w.producer || w.produtor || '', grape: w.grape || w.uva || '',
    region: w.region || w.regiao || '', country: w.country || w.pais || '', year: w.year ?? w.safra ?? '', type: w.type || w.tipo || '',
    description: w.description || w.descricao || '', foodPairings: Array.isArray(w.foodPairings) ? w.foodPairings : [], quantity,
    imageUrl: w.imageUrl || w.fotoUrl || '', imagePublicId: w.imagePublicId || w.publicId || '', favorite: Boolean(w.favorite),
    tags: Array.isArray(w.tags) ? w.tags : [], location: w.location || '', purchasePrice: safeNumber(w.purchasePrice, 0),
    purchaseDate: w.purchaseDate || '', purchasePlace: w.purchasePlace || '', purchaseNotes: w.purchaseNotes || '',
    createdAt: w.createdAt || '', updatedAt: w.updatedAt || '', bottles
  };
}
export function ensureStoredBottles(w) {
  const count = w.bottles.filter(b => b.status === 'stored').length;
  for (let i = count; i < w.quantity; i++) w.bottles.push(makeBottle(w));
}
export function makeBottle(w, extra = {}) {
  return normalizeBottle({ id: uid('bottle'), status: 'stored', location: extra.location || w.location || '',
    purchasePrice: extra.purchasePrice ?? w.purchasePrice, purchaseDate: extra.purchaseDate || w.purchaseDate,
    purchasePlace: extra.purchasePlace || w.purchasePlace, acquiredAt: nowISO(), ...extra }, w.id, w.bottles.length);
}
export function refreshWinePrimaryLocation(w) {
  const first = w.bottles.filter(x => x.status === 'stored' && numericPosition(x.location))
    .sort((a,b) => numericPosition(a.location)-numericPosition(b.location))[0];
  w.location = first ? String(numericPosition(first.location)) : '';
}
export function normalizeLayoutInState(s, force = false) {
  const entries = [];
  [...s.wines].sort((a,b)=>(a.wineName||'').localeCompare(b.wineName||'', 'pt-BR')).forEach(w => {
    ensureStoredBottles(w);
    w.bottles.filter(b => b.status === 'stored').forEach(b => entries.push({ w, b }));
  });
  let changed = false; const used = new Set();
  if (force) entries.forEach(({b}) => { if (b.location) changed = true; b.location = ''; });
  else entries.forEach(({b}) => {
    const pos = numericPosition(b.location);
    if (!pos || used.has(pos)) { if (b.location) changed = true; b.location = ''; }
    else { const normalized=String(pos); if (b.location!==normalized) changed=true; b.location=normalized; used.add(pos); }
  });
  let next=1;
  entries.forEach(({b}) => { if (numericPosition(b.location)) return; while(used.has(next)) next++; b.location=String(next); used.add(next); changed=true; next++; });
  s.wines.forEach(refreshWinePrimaryLocation);
  return changed;
}
export function setBottlePositionInState(s, w, bottle, location) {
  const targetPos=numericPosition(location), target=targetPos?String(targetPos):'';
  const previousPos=numericPosition(bottle.location), previous=previousPos?String(previousPos):'';
  if (target) for (const otherWine of s.wines) {
    ensureStoredBottles(otherWine);
    const occupant=otherWine.bottles.find(x=>x.status==='stored' && x.id!==bottle.id && numericPosition(x.location)===targetPos);
    if (occupant) { occupant.location=previous; refreshWinePrimaryLocation(otherWine); break; }
  }
  bottle.location=target; refreshWinePrimaryLocation(w); return {previous,target};
}
function defaults() {
  return { schemaVersion:3, movements:[], tastings:[], wishlist:[], events:[], settings:{
    profileName:APP_CONFIG.defaults.profileName, cellarName:'Armário principal', layoutMode:'single_shelf', columns:5,
    shelfName:'Prateleira única', shelves:[''], slotsPerShelf:5, cloudinary:{...APP_CONFIG.cloudinary}, appLock:false
  }, createdAt:nowISO(), updatedAt:nowISO() };
}
export function normalizeDocument(data={}, meta={}) {
  const base=defaults();
  const v2Source=meta?.v2&&typeof meta.v2==='object'?meta.v2:(data.v2&&typeof data.v2==='object'?data.v2:{});
  const v2=v2Source;
  const settings={...base.settings,...(v2.settings||{})};
  settings.cloudinary={...base.settings.cloudinary,...(v2.settings?.cloudinary||{})};
  settings.layoutMode='single_shelf'; settings.columns=5; settings.shelfName='Prateleira única'; settings.shelves=[''];
  const wines=(Array.isArray(data.estoque)?data.estoque:[]).map(normalizeWine);
  const bottleCount=wines.reduce((n,w)=>n+w.quantity,0);
  const maxPosition=wines.reduce((max,w)=>Math.max(max,...(w.bottles||[]).filter(b=>b.status==='stored').map(b=>numericPosition(b.location))),0);
  settings.slotsPerShelf=Math.max(5,Math.ceil(Math.max(1,bottleCount,maxPosition)/5)*5);
  const result={ wines, v2:{...base,...v2,settings,
    movements:Array.isArray(v2.movements)?v2.movements:[], tastings:Array.isArray(v2.tastings)?v2.tastings:[],
    wishlist:Array.isArray(v2.wishlist)?v2.wishlist:[], events:Array.isArray(v2.events)?v2.events:[]
  }, raw:{legacy:data,meta}, runtime:{metaMode} };
  normalizeLayoutInState(result,false); return result;
}
let state=normalizeDocument({},readLocalMeta());
export function getState(){return state;}
export function subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);}
function notify(){listeners.forEach(fn=>fn(state));}
function serializable(s){return{estoque:s.wines,v2:s.v2};}
export async function transact(mutator){
  let finalV2=null;
  const result=await runTransaction(db,async tx=>{
    const snap=await tx.get(adegaRef), data=snap.exists()?snap.data():{};
    const s=normalizeDocument(data,data?.v2?{}:readLocalMeta());
    const value=await mutator(s); s.v2.updatedAt=nowISO(); tx.set(adegaRef,serializable(s),{merge:true}); finalV2=s.v2; return value;
  });
  if(finalV2)writeLocalMeta(finalV2); return result;
}
export function startRealtime(){
  if(unsubscribe)return unsubscribe;
  unsubscribe=onSnapshot(adegaRef,snap=>{
    const data=snap.exists()?snap.data():{};
    state=normalizeDocument(data,data?.v2?{}:readLocalMeta()); metaMode='firebase'; state.runtime.metaMode='firebase';
    writeLocalMeta(state.v2); notify();
    const needsMigration=!data?.v2||Number(data?.v2?.schemaVersion||0)<3||data?.v2?.settings?.layoutMode!=='single_shelf';
    if(needsMigration&&!migrationQueued){migrationQueued=true;Promise.resolve().then(()=>transact(s=>{s.v2.schemaVersion=3;normalizeLayoutInState(s,false);})).catch(e=>{migrationQueued=false;console.warn('[ADEGA] Migração:',e?.code||e?.message);});}
  },err=>{console.error('[ADEGA] Firestore listener:',err);metaMode='local';state=normalizeDocument(state.raw?.legacy||{},readLocalMeta());state.runtime.metaMode='local';listeners.forEach(fn=>fn(state,err));});
  return unsubscribe;
}
export function actor(s){return s.v2.settings.profileName||'Usuário da adega';}
export function movement(s,data){s.v2.movements.unshift({id:uid('mov'),at:nowISO(),actor:actor(s),...data});s.v2.movements=s.v2.movements.slice(0,LIMITS.movements);}
export async function ensureSequentialLayout(force=false){return transact(s=>{const changed=normalizeLayoutInState(s,force);if(changed)movement(s,{type:'localizacao',wineId:'',wineName:'',quantity:0,detail:'Armário reorganizado em ordem sequencial (5 por fileira)'});return changed;});}
export async function discoverCloudinaryFromFirebase(){
  for(const [c,id] of [['settings','integrations'],['settings','publicIntegrations'],['integrations','cloudinary'],['config','publicIntegrations']])try{
    const snap=await getDoc(doc(db,c,id));if(!snap.exists())continue;const raw=snap.data(),v=raw.cloudinary||raw.publicIntegrations?.cloudinary||raw.integrations?.cloudinary||raw;
    const cloudName=v?.cloudName||v?.cloud_name||'',uploadPreset=v?.uploadPreset||v?.upload_preset||v?.preset||v?.unsignedPreset||'',folder=v?.folder||APP_CONFIG.cloudinary.folder;
    if(cloudName&&uploadPreset)return{cloudName,uploadPreset,folder,source:`${c}/${id}`};
  }catch(e){console.debug('[ADEGA] Cloudinary discovery',c,id,e?.code||e?.message);}return null;
}

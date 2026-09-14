import { APP_CONFIG } from './config.js';
import { nowISO, uid } from './utils.js';
import { transact, getState, LIMITS, normalizeDocument, normalizeLayoutInState, movement, numericPosition } from './store-core.js';

export async function addWishlist(item){return transact(s=>{s.v2.wishlist.unshift({id:uid('wish'),createdAt:nowISO(),...item});s.v2.wishlist=s.v2.wishlist.slice(0,LIMITS.wishlist);});}
export async function removeWishlist(id){return transact(s=>{s.v2.wishlist=s.v2.wishlist.filter(x=>x.id!==id);});}
export async function addEvent(item){return transact(s=>{s.v2.events.unshift({id:uid('event'),createdAt:nowISO(),status:'planejado',...item});s.v2.events=s.v2.events.slice(0,LIMITS.events);});}
export async function removeEvent(id){return transact(s=>{s.v2.events=s.v2.events.filter(x=>x.id!==id);});}
export async function saveSettings(patch){return transact(s=>{const current=s.v2.settings,next={...current,...patch};if(patch.cloudinary)next.cloudinary={...current.cloudinary,...patch.cloudinary};next.layoutMode='single_shelf';next.columns=5;next.shelfName='Prateleira única';next.shelves=[''];const bottleCount=s.wines.reduce((n,w)=>n+w.quantity,0),maxPosition=s.wines.reduce((max,w)=>Math.max(max,...(w.bottles||[]).filter(b=>b.status==='stored').map(b=>numericPosition(b.location))),0);next.slotsPerShelf=Math.max(5,Math.ceil(Math.max(1,bottleCount,maxPosition)/5)*5);s.v2.settings=next;});}
export async function replaceFromBackup(backup){const source=backup?.estoque||backup?.v2?backup:(backup?.raw?.legacy||backup?.raw||{}),meta=backup?.v2?{v2:backup.v2}:(backup?.raw?.meta||{}),incoming=normalizeDocument(source,meta);return transact(s=>{s.wines=incoming.wines;s.v2={...incoming.v2,updatedAt:nowISO()};normalizeLayoutInState(s,false);movement(s,{type:'importacao',wineId:'',wineName:'',quantity:0,detail:'Backup JSON importado'});});}
export function backupObject(){const state=getState();return{exportedAt:nowISO(),appVersion:'2.1.0',firebaseProject:APP_CONFIG.firebase.projectId,document:APP_CONFIG.adegaId,estoque:state.wines,v2:state.v2};}

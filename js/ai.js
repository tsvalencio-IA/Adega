import { APP_CONFIG } from './config.js';
import { getState } from './store.js';

function cellarContextForAI() {
  const state = getState();
  const inventory = state.wines.filter(w => w.quantity > 0).map(w => ({
    id: w.id, wineName: w.wineName, producer: w.producer, grape: w.grape, region: w.region,
    country: w.country, year: w.year, type: w.type, quantity: w.quantity,
    description: w.description, favorite: w.favorite, purchasePrice: w.purchasePrice || 0,
    locations: w.bottles.filter(b => b.status === 'stored').map(b => b.location).filter(Boolean)
  }));
  const tastings = (state.v2.tastings || []).slice(0, 40).map(t => ({
    at: t.at, wineId: t.wineId, wineName: t.wineName, year: t.year || '', rating: t.rating || 0,
    food: t.food || '', occasion: t.occasion || '', companions: t.companions || '', notes: t.notes || ''
  }));
  const wishlist = (state.v2.wishlist || []).slice(0, 30).map(w => ({
    wineName: w.wineName || '', producer: w.producer || '', year: w.year || '', notes: w.notes || ''
  }));
  const events = (state.v2.events || []).slice(0, 25).map(e => ({
    title: e.title || '', date: e.date || '', people: e.people || 0, meal: e.meal || '', status: e.status || ''
  }));
  return { inventory, tastings, wishlist, events };
}

async function request(payload) {
  const response = await fetch(APP_CONFIG.aiEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch (_) { data = { error: raw || `HTTP ${response.status}` }; }
  if (!response.ok) throw new Error(data?.error || `IA indisponível (${response.status}).`);
  return data;
}

export async function checkAI() {
  try {
    const r = await fetch(APP_CONFIG.aiEndpoint, { method: 'GET', cache: 'no-store' });
    return await r.json();
  } catch (e) { return { ok: false, configured: false, error: e.message }; }
}

export async function scanLabel(base64, mimeType = 'image/jpeg') {
  const data = await request({ mode: 'scan', imageBase64: base64, mimeType });
  if (!data.json) throw new Error('A IA não retornou dados estruturados do rótulo.');
  return data.json;
}

export async function askSommelier(message, history = []) {
  return request({ mode: 'chat', message, history: history.slice(-8), context: cellarContextForAI() });
}
export async function getSuggestion(context = '') {
  return request({ mode: 'suggest', message: context, context: cellarContextForAI() });
}
export async function getTechSheet(wine) {
  return request({ mode: 'tech_sheet', wine, context: cellarContextForAI() });
}
export async function getPairing(wine, details) {
  return request({ mode: 'pairing', wine, message: details, context: cellarContextForAI() });
}
export async function planDinner(details) {
  return request({ mode: 'dinner', message: details, context: cellarContextForAI() });
}

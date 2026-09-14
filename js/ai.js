import { APP_CONFIG } from './config.js';
import { getState } from './store.js';
import { answerFromTruth, buildTruthContext } from './truth-engine.js';

function cellarContextForAI(message = '') {
  return buildTruthContext(message, getState(), 250);
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
  const exact = answerFromTruth(message, getState());
  if (exact.handled) return { ok: true, text: exact.text, source: exact.source, certainty: exact.certainty, evidence: exact.evidence };
  return request({ mode: 'chat', message, history: history.slice(-8), context: cellarContextForAI(message) });
}
export async function getSuggestion(context = '') {
  return request({ mode: 'suggest', message: context, context: cellarContextForAI(context) });
}
export async function getTechSheet(wine) {
  return request({ mode: 'tech_sheet', wine, context: cellarContextForAI(wine?.wineName || '') });
}
export async function getPairing(wine, details) {
  return request({ mode: 'pairing', wine, message: details, context: cellarContextForAI(`${wine?.wineName || ''} ${details || ''}`) });
}
export async function planDinner(details) {
  return request({ mode: 'dinner', message: details, context: cellarContextForAI(details) });
}

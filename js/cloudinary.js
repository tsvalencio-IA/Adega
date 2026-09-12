import { APP_CONFIG } from './config.js';
import { getState, saveSettings, discoverCloudinaryFromFirebase } from './store.js';
import { compressImage } from './utils.js';

const LS_KEY = 'adega-eid-cloudinary-public-config';

function normalize(raw = {}) {
  return {
    cloudName: String(raw.cloudName || raw.cloud_name || '').trim(),
    uploadPreset: String(raw.uploadPreset || raw.upload_preset || raw.preset || '').trim(),
    folder: String(raw.folder || APP_CONFIG.cloudinary.folder).trim() || APP_CONFIG.cloudinary.folder
  };
}

export function getCloudinaryConfig() {
  const fromState = normalize(getState()?.v2?.settings?.cloudinary || {});
  if (fromState.cloudName && fromState.uploadPreset) return fromState;
  try {
    const local = normalize(JSON.parse(localStorage.getItem(LS_KEY) || '{}'));
    if (local.cloudName && local.uploadPreset) return local;
  } catch (_) {}
  return normalize(APP_CONFIG.cloudinary);
}

export async function setCloudinaryConfig(raw) {
  const cfg = normalize(raw);
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  await saveSettings({ cloudinary: cfg });
  return cfg;
}

export async function discoverCloudinary() {
  const current = getCloudinaryConfig();
  if (current.cloudName && current.uploadPreset) return { ...current, source: 'configuração da adega' };
  const found = await discoverCloudinaryFromFirebase();
  if (found) {
    await setCloudinaryConfig(found);
    return found;
  }
  return null;
}

export async function uploadImage(file, options = {}) {
  const cfg = getCloudinaryConfig();
  if (!cfg.cloudName || !cfg.uploadPreset) {
    throw new Error('Cloudinary ainda não está configurado. Informe cloud name e upload preset em Configurações.');
  }
  const optimized = await compressImage(file, { maxSide: options.maxSide || 1800, quality: options.quality || .84 });
  const fd = new FormData();
  fd.append('file', optimized);
  fd.append('upload_preset', cfg.uploadPreset);
  fd.append('folder', options.folder || cfg.folder || APP_CONFIG.cloudinary.folder);
  if (options.tags) fd.append('tags', options.tags);
  if (options.context) fd.append('context', options.context);
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`;
  const response = await fetch(url, { method: 'POST', body: fd });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!response.ok || !json?.secure_url) {
    throw new Error(json?.error?.message || `Falha no Cloudinary (${response.status}).`);
  }
  return { url: json.secure_url, publicId: json.public_id || '', width: json.width || 0, height: json.height || 0, bytes: json.bytes || 0 };
}

export async function testCloudinaryConfig(raw) {
  const cfg = normalize(raw);
  if (!cfg.cloudName || !cfg.uploadPreset) return { ok: false, error: 'Preencha cloud name e upload preset.' };
  const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#7f1d1d"/></svg>`;
  const file = new File([tinySvg], 'adega-cloudinary-test.svg', { type: 'image/svg+xml' });
  const fd = new FormData();
  fd.append('file', file); fd.append('upload_preset', cfg.uploadPreset); fd.append('folder', `${cfg.folder}/diagnostico`);
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`;
  try {
    const response = await fetch(url, { method: 'POST', body: fd });
    const json = await response.json().catch(() => ({}));
    return response.ok && json.secure_url ? { ok: true, url: json.secure_url, publicId: json.public_id } : { ok: false, error: json?.error?.message || `HTTP ${response.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

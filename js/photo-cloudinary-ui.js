import { getCloudinaryConfig, uploadImage } from './cloudinary.js';

let pendingPhoto = null;
let pendingPreviewUrl = '';
let toastTimer = null;

function showToast(message, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${type}`.trim();
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function rememberSelectedPhoto(event) {
  const input = event.target;
  if (!input || !['camera-input', 'gallery-input'].includes(input.id)) return;
  const file = input.files?.[0];
  if (!file) return;
  pendingPhoto = file;
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = URL.createObjectURL(file);
}

document.addEventListener('change', rememberSelectedPhoto, true);

function enhancePhotoField() {
  const urlInput = document.getElementById('f-image');
  if (!urlInput || document.getElementById('cloudinary-photo-actions')) return;

  const field = urlInput.closest('.field') || urlInput.parentElement;
  if (!field) return;

  const originalPhoto = pendingPhoto;
  const originalPreview = pendingPreviewUrl;
  pendingPhoto = null;
  pendingPreviewUrl = '';

  const label = field.querySelector('label');
  if (label) label.textContent = 'Foto do rótulo';
  urlInput.placeholder = 'A URL será preenchida automaticamente pelo Cloudinary';

  const wrap = document.createElement('div');
  wrap.id = 'cloudinary-photo-actions';
  wrap.style.marginTop = '10px';

  const previewBox = document.createElement('div');
  previewBox.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.02)';

  const preview = document.createElement('div');
  preview.style.cssText = 'width:78px;height:98px;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:rgba(255,255,255,.04);flex:0 0 auto';
  const img = document.createElement('img');
  img.alt = 'Prévia do rótulo';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
  const placeholder = document.createElement('span');
  placeholder.textContent = '🍷';
  placeholder.style.fontSize = '28px';
  preview.appendChild(placeholder);

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:210px';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'secondary-btn';

  const chooseBtn = document.createElement('button');
  chooseBtn.type = 'button';
  chooseBtn.className = 'ghost-btn';
  chooseBtn.textContent = '🖼 Escolher outra foto';

  const status = document.createElement('small');
  status.style.cssText = 'color:var(--muted);line-height:1.4';

  const directInput = document.createElement('input');
  directInput.type = 'file';
  directInput.accept = 'image/*';
  directInput.hidden = true;

  let selectedFile = originalPhoto;
  let selectedPreview = originalPreview;

  function showPreview(src) {
    if (!src) {
      img.removeAttribute('src');
      if (!preview.contains(placeholder)) preview.appendChild(placeholder);
      return;
    }
    if (preview.contains(placeholder)) placeholder.remove();
    img.src = src;
    if (!preview.contains(img)) preview.appendChild(img);
  }

  function refresh() {
    const currentUrl = urlInput.value.trim();
    if (selectedPreview) showPreview(selectedPreview);
    else if (currentUrl) showPreview(currentUrl);
    else showPreview('');

    const cfg = getCloudinaryConfig();
    const configured = Boolean(cfg.cloudName && cfg.uploadPreset);
    const alreadyCloudinary = /^https:\/\/res\.cloudinary\.com\//i.test(currentUrl);

    if (selectedFile) uploadBtn.textContent = currentUrl ? '☁ Reenviar foto ao Cloudinary' : '☁ Salvar esta foto no Cloudinary';
    else uploadBtn.textContent = currentUrl ? '☁ Trocar / reenviar foto' : '☁ Escolher foto e salvar no Cloudinary';

    if (alreadyCloudinary) status.textContent = '✓ Foto já salva no Cloudinary. A URL acima foi preenchida automaticamente.';
    else if (!configured) status.textContent = 'Cloudinary ainda não configurado. Configure Cloud name + Unsigned upload preset em ⚙ Configurações.';
    else if (selectedFile) status.textContent = 'Foto analisada pela IA pronta para ser armazenada no Cloudinary.';
    else status.textContent = 'Você também pode colar uma URL existente manualmente.';
  }

  directInput.addEventListener('change', () => {
    const file = directInput.files?.[0];
    if (!file) return;
    selectedFile = file;
    if (selectedPreview && selectedPreview.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
    selectedPreview = URL.createObjectURL(file);
    refresh();
  });

  chooseBtn.addEventListener('click', () => directInput.click());
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      directInput.click();
      return;
    }
    const cfg = getCloudinaryConfig();
    if (!cfg.cloudName || !cfg.uploadPreset) {
      status.textContent = 'Configure o Cloudinary em ⚙ Configurações antes de enviar a foto.';
      showToast('Configure Cloud name e Unsigned upload preset nas Configurações.', 'error');
      return;
    }
    const oldText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = '☁ Enviando foto...';
    try {
      const result = await uploadImage(selectedFile, { tags: 'adega-eid,rotulo' });
      urlInput.value = result.url;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      showPreview(result.url);
      status.textContent = '✓ Foto salva no Cloudinary e URL preenchida automaticamente.';
      showToast('Foto salva no Cloudinary.', 'success');
    } catch (error) {
      status.textContent = `Falha ao enviar: ${error?.message || error}`;
      showToast(error?.message || 'Falha ao salvar a foto no Cloudinary.', 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = oldText;
      refresh();
    }
  });

  urlInput.addEventListener('input', refresh);
  controls.append(uploadBtn, chooseBtn, status, directInput);
  previewBox.append(preview, controls);
  wrap.appendChild(previewBox);
  field.appendChild(wrap);
  refresh();
}

const observer = new MutationObserver(enhancePhotoField);
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhancePhotoField);
else enhancePhotoField();

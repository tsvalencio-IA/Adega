import { APP_CONFIG } from './config.js';
import {
  startRealtime, subscribe, getState, addWine, updateWine, adjustQuantity, openBottle, assignBottleLocation,
  toggleFavorite, deleteWine, addWishlist, removeWishlist, addEvent, removeEvent, saveSettings,
  backupObject, replaceFromBackup
} from './store.js';
import { getCloudinaryConfig, setCloudinaryConfig, discoverCloudinary, uploadImage, testCloudinaryConfig } from './cloudinary.js';
import { checkAI, scanLabel, askSommelier, getSuggestion, getTechSheet, getPairing, planDinner } from './ai.js';
import { observeAuth, signInOwner, signOutOwner, sendReset, currentIdentity } from './auth.js';
import {
  $, $$, escapeHtml, money, formatDate, safeNumber, debounce, compressImage, fileToBase64, downloadText, toCSV, nowISO
} from './utils.js';

const ui = {
  state: getState(), route: 'home', journal: 'movements', search: '', filters: { type: '', country: '', stock: '', sort: 'name' },
  chat: [{ role: 'ai', text: 'Sommelier pronto. Posso cruzar suas perguntas com o estoque real da adega.' }],
  lastError: null, aiStatus: null, installPrompt: null, authUser: null, runtimeStarted: false
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
function modalHead(title, subtitle = '') { return `<div class="modal-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="close-btn" data-close-modal>Ã—</button></div>`; }
function bindClose() { $$('[data-close-modal]', els.sheet).forEach(b => b.onclick = closeModal); }
function errMessage(e) { return e?.message || String(e || 'Erro desconhecido.'); }
function withError(fn) { return async (...args) => { try { return await fn(...args); } catch (e) { console.error(e); toast(errMessage(e), 'error'); } }; }

function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou senha invÃ¡lidos.';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code.includes('unauthorized-domain')) return 'Este domÃ­nio da Vercel ainda nÃ£o foi autorizado no Firebase Authentication.';
  if (code.includes('network-request-failed')) return 'Falha de conexÃ£o ao autenticar.';
  return error?.message || 'NÃ£o foi possÃ­vel entrar.';
}

function renderAuth(user) {
  ui.authUser = user || null;
  $('#auth-gate').classList.toggle('hidden', Boolean(user));
  $('#app').classList.toggle('hidden', !user);
  if (user) document.body.classList.add('authenticated'); else document.body.classList.remove('authenticated');
}

function bindAuthEvents() {
  const form = $('#auth-form');
  const email = $('#auth-email');
  const password = $('#auth-password');
  const message = $('#auth-message');
  form.onsubmit = async event => {
    event.preventDefault();
    message.className = 'auth-message'; message.textContent = 'Autenticando...';
    try {
      await signInOwner(email.value, password.value);
      password.value = '';
      message.className = 'auth-message success'; message.textContent = 'Acesso autorizado.';
    } catch (error) {
      message.className = 'auth-message error'; message.textContent = authErrorMessage(error);
    }
  };
  $('#auth-reset').onclick = async () => {
    try {
      await sendReset(email.value);
      message.className = 'auth-message success'; message.textContent = 'E-mail de recuperaÃ§Ã£o enviado.';
    } catch (error) {
      message.className = 'auth-message error'; message.textContent = authErrorMessage(error);
    }
  };
}

async function startAuthorizedRuntime() {
  if (ui.runtimeStarted) return;
  ui.runtimeStarted = true;
  bindGlobalEvents();
  subscribe((state,error)=>{
    ui.state=state; ui.lastError=error||null;
    const localPro=state?.runtime?.metaMode==='local';
    const permissionDenied = String(error?.code || '').includes('permission-denied');
    els.sync.className=`status-pill ${error?'error':localPro?'':'ok'}`;
    els.sync.querySelector('span').textContent=permissionDenied?'Sem permissÃ£o':error?'Erro Firebase':localPro?'Estoque sync Â· PRO local':'Sincronizado';
    if (permissionDenied) toast('Sua conta entrou, mas o UID ainda nÃ£o foi autorizado no Firestore.','error');
    renderAll();
  });
  startRealtime();
  renderAll();
  ui.aiStatus=await checkAI(); renderAI();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(e){console.warn('[ADEGA] SW',e);}}
}

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
function wineLabel(w) { return `${w.wineName}${w.year ? ` Â· ${w.year}` : ''}`; }

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
  $('#hero-subtitle').textContent = wines.length ? `${qty} garrafa${qty === 1 ? '' : 's'} em ${wines.length} rÃ³tulo${wines.length === 1 ? '' : 's'}, sincronizados no Firebase atual.` : 'Sua adega estÃ¡ conectada. Cadastre o primeiro rÃ³tulo.';
  const favorites = wines.filter(w => w.favorite).length;
  const value = inventoryValue();
  $('#stats-grid').innerHTML = [
    ['ğŸ·', qty, 'Garrafas disponÃ­veis'], ['ğŸ·', wines.length, 'RÃ³tulos cadastrados'], ['â˜…', favorites, 'Favoritos'], ['â—ˆ', value ? money(value) : 'â€”', 'Valor cadastrado']
  ].map(([icon, val, label]) => `<div class="stat-card"><span class="icon">${icon}</span><div><strong>${escapeHtml(String(val))}</strong><small>${label}</small></div></div>`)²È="24½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰µ½‘…°µ…Ñ¥½¹ÌˆÍÑå±”ô‰©ÕÍÑ¥™äµ½¹Ñ•¹Ğé™±•àµÍÑ…ÉĞˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰‘¥Í½Ù•Èµ±½Õˆù•Í½‰É¥È¹¼¥É•‰…Í”ğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰Ñ•ÍĞµ±½ÕˆùQ•ÍÑ…È±½Õ‘¥¹…Éäğ½‰ÕÑÑ½¸øğ½‘¥Øø(€€€€€€‘íÕ¤¹ÍÑ…Ñ”¹ÉÕ¹Ñ¥µ”ü¹µ•Ñ…5½‘”ôôô±½…°œüœñ‘¥Ø±…ÍÌô‰¹½Ñ¥”‘…¹•Èµ¹½Ñ”ˆÍÑå±”ô‰µ…É¥¸µÑ½ÀèÄÉÁàˆøñÍÑÉ½¹œù…‘½ÌAI<•´™…±±‰…¬±½…°¸ğ½ÍÑÉ½¹œøñ‰Èù<•ÍÑ½ÅÕ”½¹Ñ¥¹Õ„¹¼¥É•‰…Í”½É¥¥¹…°°µ…Ì…ÌIÕ±•Ì…ÑÕ…¥Ì»¼…ÕÑ½É¥é…É…´¼‘½Õµ•¹Ñ¼…‘•„µ½µÁ…ÉÑ¥±¡…‘„µÁÉ¼µØÈ¸ÕÑ½É¥é”•ÍÍ”‘½Õµ•¹Ñ¼Á…É„Í¥¹É½¹¥é…È‘§…É¥¼°•Ù•¹Ñ½Ì”½¹™¥ÕÉ‡ŸÕ•Ì•¹ÑÉ”…Á…É•±¡½Ì¸ğ½‘¥Øøœèœô(€€€€€€ñ‘¥Ø±…ÍÌô‰Í•Ñ¥½¸µ¡•…ˆøñ‘¥ØøñÍµ…±°ù%ğ½Íµ…±°øñ Èù	…­•¹•µ¥¹¤ğ½ Èøğ½‘¥Øøğ½‘¥Øø(€€€€€€ñ‘¥Ø¥ô‰Í•ÑÑ¥¹Ìµ…¤µ¹½Ñ”ˆ±…ÍÌô‰¹½Ñ¥”ˆø‘íÕ¤¹…¥MÑ…ÑÕÌü¹½¹™¥ÕÉ•ü	…­•¹½¹™¥ÕÉ…‘¼”¡…Ù”ÁÉ½Ñ•¥‘„¹¼Í•ÉÙ¥‘½È¸œèA…É„…Ñ¥Ù…È„%¹¼‘•Á±½äÁÉ½™¥ÍÍ¥½¹…°°½¹™¥ÕÉ”5%9%}A%}-d¹…Ì¹Ù¥É½¹µ•¹ĞY…É¥…‰±•Ì‘„Y•É•°¸¡…Ù”»¼™¥„µ…¥Ì¹¼¹…Ù•…‘½È¸ôğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í•Ñ¥½¸µ¡•…ˆøñ‘¥ØøñÍµ…±°ùMUI;ğ½Íµ…±°øñ Èù½¹Ñ„…ÕÑ½É¥é…‘„ğ½ Èøğ½‘¥Øøğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰¹½Ñ¥”ˆøñÍÑÉ½¹œø‘í•Í…Á•!Ñµ°¡ÕÉÉ•¹Ñ%‘•¹Ñ¥Ñä ¤¹•µ…¥°ñğ€½¹Ñ„…ÕÑ•¹Ñ¥…‘„œ¥ôğ½ÍÑÉ½¹œøñ‰ÈùU%è€‘í•Í…Á•!Ñµ°¡ÕÉÉ•¹Ñ%‘•¹Ñ¥Ñä ¤¹Õ¥ñğ€ŸŠPœ¥ôñ‰Èù<…•ÍÍ¼…¼•ÍÑ½ÅÕ””ƒ€%ƒ¤Ù…±¥‘…‘¼Á•±¼¥É•‰…Í”…¹Ñ•Ì‘”…‘„½Á•É‡Ÿ¼ÁÉ½Ñ•¥‘„¸ğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰µ½‘…°µ…Ñ¥½¹ÌˆÍÑå±”ô‰©ÕÍÑ¥™äµ½¹Ñ•¹Ğé™±•àµÍÑ…ÉĞˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰±½½ÕĞµ…½Õ¹ĞˆùM…¥È‘•ÍÑ„½¹Ñ„ğ½‰ÕÑÑ½¸øğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í•Ñ¥½¸µ¡•…ˆøñ‘¥ØøñÍµ…±°ù=Lğ½Íµ…±°øñ Èù	…­ÕÀ”•áÁ½ÉÑ‡Ÿ¼ğ½ Èøğ½‘¥Øøğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰µ½‘…°µ…Ñ¥½¹ÌˆÍÑå±”ô‰©ÕÍÑ¥™äµ½¹Ñ•¹Ğé™±•àµÍÑ…ÉĞˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰•áÁ½ÉĞµ©Í½¸ˆù	…­ÕÀ)M=8ğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰•áÁ½ÉĞµÍØˆùÍÑ½ÅÕ”MXğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¥ô‰¥µÁ½ÉĞµ©Í½¸ˆù%µÁ½ÉÑ…È‰…­ÕÀğ½‰ÕÑÑ½¸øğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰µ½‘…°µ…Ñ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäµ‰Ñ¸ˆ¥ô‰Í…Ù”µÍ•ÑÑ¥¹ÌˆùM…±Ù…È½¹™¥ÕÉ‡ŸÕ•Ìğ½‰ÕÑÑ½¸øğ½‘¥Øø(€€€€ğ½‘¥Øù€¤ì(€‰¥¹‘±½Í” ¤ì(€€ œ±½½ÕĞµ…½Õ¹Ğœ¤¹½¹±¥¬õİ¥Ñ¡ÉÉ½È¡…Íå¹Œ ¤ôùì…İ…¥ĞÍ¥¹=ÕÑ=İ¹•È ¤ì±½Í•5½‘…° ¤ì±½…Ñ¥½¸¹É•±½… ¤ìô¤ì(€€ œÍ…Ù”µÍ•ÑÑ¥¹Ìœ¤¹½¹±¥¬õİ¥Ñ¡ÉÉ½È¡…Íå¹Œ ¤ôùí½¹ÍĞ±½Õõí±½Õ‘9…µ”è œÌµ±½Õœ¤¹Ù…±Õ”¹ÑÉ¥´ ¤±ÕÁ±½…‘AÉ•Í•Ğè œÌµÁÉ•Í•Ğœ¤¹Ù…±Õ”¹ÑÉ¥´ ¤±™½±‘•Èè œÌµ™½±‘•Èœ¤¹Ù…±Õ”¹ÑÉ¥´ ¥ñğ…‘•„µ•¥ôí…İ…¥ĞÍ…Ù•M•ÑÑ¥¹Ì¡íÁÉ½™¥±•9…µ”è œÌµÁÉ½™¥±”œ¤¹Ù…±Õ”¹ÑÉ¥´ ¥ññAA}=9%¹‘•™…Õ±ÑÌ¹ÁÉ½™¥±•9…µ”±•±±…É9…µ”è œÌµ•±±…Èœ¤¹Ù…±Õ”¹ÑÉ¥´ ¥ññAA}=9%¹‘•™…Õ±ÑÌ¹•±±…É9…µ”±Í¡•±Ù•Ìè œÌµÍ¡•±Ù•Ìœ¤¹Ù…±Õ”¹ÍÁ±¥Ğ œ°œ¤¹µ…À¡àôùà¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤¤¹™¥±Ñ•È¡	½½±•…¸¤±Í±½ÑÍA•ÉM¡•±˜éÍ…™•9Õµ‰•È  œÌµÍ±½ÑÌœ¤¹Ù…±Õ”°Ø¤±±½Õ‘¥¹…Éäé±½Õ‘ô¤í±½…±MÑ½É…”¹Í•Ñ%Ñ•´ …‘•„µ•¥µ±½Õ‘¥¹…ÉäµÁÕ‰±¥Œµ½¹™¥œœ±)M=8¹ÍÑÉ¥¹¥™ä¡±½Õ¤¤í±½Í•5½‘…° ¤íÑ½…ÍĞ ½¹™¥ÕÉ‡ŸÕ•ÌÍ…±Ù…Ì¸œ°ÍÕ•ÍÌœ¤íô¤ì(€€ œ‘¥Í½Ù•Èµ±½Õœ¤¹½¹±¥¬õİ¥Ñ¡ÉÉ½È¡…Íå¹Œ ¤ôùí±½…‘¥¹œ¡ÑÉÕ”°AÉ½ÕÉ…¹‘¼½¹™¥ÕÉ‡Ÿ¼¹¼µ•Íµ¼¥É•‰…Í”¸¸¸œ¤íÑÉåí½¹ÍĞ™½Õ¹õ…İ…¥Ğ‘¥Í½Ù•É±½Õ‘¥¹…Éä ¤í¥˜¡™½Õ¹¥ì œÌµ±½Õœ¤¹Ù…±Õ”õ™½Õ¹¹±½Õ‘9…µ”ì œÌµÁÉ•Í•Ğœ¤¹Ù…±Õ”õ™½Õ¹¹ÕÁ±½…‘AÉ•Í•Ğì œÌµ™½±‘•Èœ¤¹Ù…±Õ”õ™½Õ¹¹™½±‘•Éñğ…‘•„µ•¥œíÑ½…ÍĞ¡±½Õ‘¥¹…Éä•¹½¹ÑÉ…‘¼•´€‘í™½Õ¹¹Í½ÕÉ•ñğ½¹™¥ÕÉ‡Ÿ¼•á¥ÍÑ•¹Ñ”ô¹€°ÍÕ•ÍÌœ¤íõ•±Í”Ñ½…ÍĞ 9•¹¡Õµ„½¹™¥ÕÉ‡Ÿ¼±½Õ‘¥¹…Éä½µÁ±•Ñ„™½¤•¹½¹ÑÉ…‘„¹¼¥É•‰…Í”…ÑÕ…°¸œ°•ÉÉ½Èœ¤íõ™¥¹…±±åí±½…‘¥¹œ¡™…±Í”¤íõô¤ì(€€ œÑ•ÍĞµ±½Õœ¤¹½¹±¥¬õ…Íå¹Œ ¤ôùí±½…‘¥¹œ¡ÑÉÕ”°Q•ÍÑ…¹‘¼ÕÁ±½…·µ¹¥µ¼¸¸¸œ¤íÑÉåí½¹ÍĞÈõ…İ…¥ĞÑ•ÍÑ±½Õ‘¥¹…Éå½¹™¥œ¡í±½Õ‘9…µ”è œÌµ±½Õœ¤¹Ù…±Õ”±ÕÁ±½…‘AÉ•Í•Ğè œÌµÁÉ•Í•Ğœ¤¹Ù…±Õ”±™½±‘•Èè œÌµ™½±‘•Èœ¤¹Ù…±Õ•ô¤íÑ½…ÍĞ¡È¹½¬ü±½Õ‘¥¹…ÉäÉ•ÍÁ½¹‘•Ô½ÉÉ•Ñ…µ•¹Ñ”¸œé…±¡„è€‘íÈ¹•ÉÉ½Éõ€±È¹½¬üÍÕ•ÍÌœè•ÉÉ½Èœ¤íõ™¥¹…±±åí±½…‘¥¹œ¡™…±Í”¤íõôì(€€ œ•áÁ½ÉĞµ©Í½¸œ¤¹½¹±¥¬ô ¤ôùí‘½İ¹±½…‘Q•áĞ¡…‘•„µ•¥µ‰…­ÕÀ´‘í¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤¹Í±¥” À°ÄÀ¥ô¹©Í½¹€±)M=8¹ÍÑÉ¥¹¥™ä¡‰…­ÕÁ=‰©•Ğ ¤±¹Õ±°°È¤¤íÑ½…ÍĞ 	…­ÕÀ)M=8•É…‘¼¸œ°ÍÕ•ÍÌœ¤íôì(€€ œ•áÁ½ÉĞµÍØœ¤¹½¹±¥¬ô ¤ôùí½¹ÍĞÉ½İÌõml9½µ”œ°AÉ½‘ÕÑ½Èœ°UÙ„œ°I•§¼œ°A‡µÌœ°M…™É„œ°Q¥Á¼œ°EÕ…¹Ñ¥‘…‘”œ°Y…±½ÈÕ¹¥Ó…É¥¼œ°A½Í§Ÿ¼utíÕ¤¹ÍÑ…Ñ”¹İ¥¹•Ì¹™½É… ¡ÜôùÉ½İÌ¹ÁÕÍ ¡mÜ¹İ¥¹•9…µ”±Ü¹ÁÉ½‘Õ•È±Ü¹É…Á”±Ü¹É•¥½¸±Ü¹½Õ¹ÑÉä±Ü¹å•…È±Ü¹ÑåÁ”±Ü¹ÅÕ…¹Ñ¥Ñä±Ü¹ÁÕÉ¡…Í•AÉ¥”±Ü¹±½…Ñ¥½¹t¤¤í‘½İ¹±½…‘Q•áĞ¡…‘•„µ•¥µ•ÍÑ½ÅÕ”´‘í¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤¹Í±¥” À°ÄÀ¥ô¹ÍÙ€°qÕ™•™˜œ­Ñ½MX¡É½İÌ¤°Ñ•áĞ½ÍØí¡…ÉÍ•ĞõÕÑ˜´àœ¤íÑ½…ÍĞ MX•É…‘¼¸œ°ÍÕ•ÍÌœ¤íôì(€€ œ¥µÁ½ÉĞµ©Í½¸œ¤¹½¹±¥¬ô ¤ôù•±Ì¹‰…­ÕÀ¹±¥¬ ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸¥µÁ½ÉÑ	…­ÕÁ¥±”¡™¥±”¥í¥˜ …™¥±”¥É•ÑÕÉ¸íÑÉåí½¹ÍĞÑ•áĞõ…İ…¥Ğ™¥±”¹Ñ•áĞ ¤í½¹ÍĞ‘…Ñ„õ)M=8¹Á…ÉÍ”¡Ñ•áĞ¤í¥˜ …‘…Ñ…ñğ …ÉÉ…ä¹¥ÍÉÉ…ä¡‘…Ñ„¹•ÍÑ½ÅÕ”¤˜˜…‘…Ñ„¹ØÈ¤¥Ñ¡É½Ü¹•ÜÉÉ½È ÉÅÕ¥Ù¼»¼Á…É•”Í•ÈÕ´‰…­ÕÀÛ…±¥‘¼‘„…‘•„¸œ¤í½Á•¹5½‘…°¡€‘íµ½‘…±!•… ½¹™¥Éµ…È¥µÁ½ÉÑ‡Ÿ¼œ°¥µÁ½ÉÑ‡Ÿ¼ÍÕ‰ÍÑ¥ÑÕ¤¼•ÍÑ½ÅÕ””½Ì‘…‘½ÌXÈ‘¼‘½Õµ•¹Ñ¼…ÑÕ…°¸œ¤ôñ‘¥Ø±…ÍÌô‰µ½‘…°µ‰½‘äˆøñ‘¥Ø±…ÍÌô‰¹½Ñ¥”‘…¹•Èµ¹½Ñ”ˆù<‰…­ÕÀ½¹Ó¥´€‘ì¡‘…Ñ„¹•ÍÑ½ÅÕ•ññmt¤¹±•¹Ñ¡ôËÍÑÕ±¼¡Ì¤¸‡„•ÍÑ„½Á•É‡Ÿ¼…Á•¹…ÌÍ”‘•Í•©„ÍÕ‰ÍÑ¥ÑÕ¥È½Ì‘…‘½Ì…ÑÕ…¥Ì¸ğ½‘¥Øøñ‘¥Ø±…ÍÌô‰µ½‘…°µ…Ñ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰¡½ÍĞµ‰Ñ¸ˆ‘…Ñ„µ±½Í”µµ½‘…°ù…¹•±…Èğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰‘…¹•Èµ‰Ñ¸ˆ¥ô‰½¹™¥É´µ¥µÁ½ÉĞˆù%µÁ½ÉÑ…È”ÍÕ‰ÍÑ¥ÑÕ¥Èğ½‰ÕÑÑ½¸øğ½‘¥Øøğ½‘¥Øù€¤í‰¥¹‘±½Í” ¤ì œ½¹™¥É´µ¥µÁ½ÉĞœ¤¹½¹±¥¬õİ¥Ñ¡ÉÉ½È¡…Íå¹Œ ¤ôùí±½…‘¥¹œ¡ÑÉÕ”°%µÁ½ÉÑ…¹‘¼‰…­ÕÀ¸¸¸œ¤íÑÉåí…İ…¥ĞÉ•Á±…•É½µ	…­ÕÀ¡‘…Ñ„¤í±½Í•5½‘…° ¤íÑ½…ÍĞ 	…­ÕÀ¥µÁ½ÉÑ…‘¼¸œ°ÍÕ•ÍÌœ¤íõ™¥¹…±±åí±½…‘¥¹œ¡™…±Í”¤íõô¤íõ…Ñ ¡”¥íÑ½…ÍĞ¡•ÉÉ5•ÍÍ…”¡”¤°•ÉÉ½Èœ¤íõ™¥¹…±±åí•±Ì¹‰…­ÕÀ¹Ù…±Õ”ôœœíõô()™Õ¹Ñ¥½¸‰¥¹‘±½‰…±Ù•¹ÑÌ ¥ì(€‘½Õµ•¹Ğ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ±”ôùí½¹ÍĞÉ½ÕÑ”õ”¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µÉ½ÕÑ•tœ¤í¥˜¡É½ÕÑ”¥É½ÕÑ•Q¼¡É½ÕÑ”¹‘…Ñ…Í•Ğ¹É½ÕÑ”¤í½¹ÍĞ…Ñ¥½¸õ”¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ…Ñ¥½¹tœ¤í¥˜¡…Ñ¥½¸¥í½¹ÍĞ„õ…Ñ¥½¸¹‘…Ñ…Í•Ğ¹…Ñ¥½¸í¥˜¡„ôôô…‘µİ¥¹”ññ„ôôôÍ…¸µİ¥¹”œ¥½Á•¹‘‘]¥¹” ¤í¥˜¡„ôôô½Á•¸µ‘¥¹¹•Èœ¥½Á•¹¥¹¹•É½É´ ¤í¥˜¡„ôôô…¤µÍÕ•ÍĞœ¥…¥MÕ•ÍÑ¥½¸ ¤íõô¤ì(€•±Ì¹‰…­‘É½À¹½¹±¥¬õ±½Í•5½‘…°ì€ œÍ•ÑÑ¥¹Ìµ‰Ñ¸œ¤¹½¹±¥¬õ½Á•¹M•ÑÑ¥¹Ìì€ œ™¥±Ñ•ÉÌµ‰Ñ¸œ¤¹½¹±¥¬õ½Á•¹¥±Ñ•ÉÌì(€€ œİ¥¹”µÍ•…É œ¤¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¥¹ÁÕĞœ±‘•‰½Õ¹”¡”ôùíÕ¤¹Í•…É õ”¹Ñ…É•Ğ¹Ù…±Õ”íÉ•¹‘•É•±±…È ¤íô°ÄÈÀ¤¤ì(€€ œ©½ÕÉ¹…°µÑ…‰Ì‰ÕÑÑ½¸œ¤¹™½É… ¡ˆôùˆ¹½¹±¥¬ô ¤ôùíÕ¤¹©½ÕÉ¹…°õˆ¹‘…Ñ…Í•Ğ¹©½ÕÉ¹…°íÉ•¹‘•É)½ÕÉ¹…° ¤íô¤ì(€•±Ì¹…µ•É„¹½¹¡…¹”õ”ôù¡…¹‘±•M…¸¡”¹Ñ…É•Ğ¹™¥±•Ìü¹lÁt¤ì•±Ì¹…±±•Éä¹½¹¡…¹”õ”ôù¡…¹‘±•M…¸¡”¹Ñ…É•Ğ¹™¥±•Ìü¹lÁt¤ì•±Ì¹‰…­ÕÀ¹½¹¡…¹”õ”ôù¥µÁ½ÉÑ	…­ÕÁ¥±”¡”¹Ñ…É•Ğ¹™¥±•Ìü¹lÁt¤ì(€€ œ¡…Ğµ™½É´œ¤¹½¹ÍÕ‰µ¥Ğõ…Íå¹Œ”ôùí”¹ÁÉ•Ù•¹Ñ•™…Õ±Ğ ¤í½¹ÍĞ¥¹ÁÕĞô œ¡…Ğµ¥¹ÁÕĞœ¤í½¹ÍĞÄõ¥¹ÁÕĞ¹Ù…±Õ”¹ÑÉ¥´ ¤í¥˜ …Ä¥É•ÑÕÉ¸íÕ¤¹¡…Ğ¹ÁÕÍ ¡íÉ½±”èÕÍ•Èœ±Ñ•áĞéÅô¤í¥¹ÁÕĞ¹Ù…±Õ”ôœœíÉ•¹‘•É$ ¤í±½…‘¥¹œ¡ÑÉÕ”°½¹ÍÕ±Ñ…¹‘¼•ÍÑ½ÅÕ””½¹¡•¥µ•¹Ñ¼•¹½³Í¥¼¸¸¸œ¤íÑÉåí½¹ÍĞÈõ…İ…¥Ğ…Í­M½µµ•±¥•È¡Ä±Õ¤¹¡…Ğ¤íÕ¤¹¡…Ğ¹ÁÕÍ ¡íÉ½±”è…¤œ±Ñ•áĞéÈ¹Ñ•áÑñğM•´É•ÍÁ½ÍÑ„¸ô¤íõ…Ñ ¡•ÉÈ¥íÕ¤¹¡…Ğ¹ÁÕÍ ¡íÉ½±”è…¤œ±Ñ•áĞé%¥¹‘¥ÍÁ½»µÙ•°è€‘í•ÉÉ5•ÍÍ…”¡•ÉÈ¥õô¤íõ™¥¹…±±åí±½…‘¥¹œ¡™…±Í”¤íÉ•¹‘•É$ ¤íõôì(€İ¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ½¹±¥¹”œ° ¤ôùí•±Ì¹Íå¹Œ¹±…ÍÍ9…µ”ôÍÑ…ÑÕÌµÁ¥±°½¬œí•±Ì¹Íå¹Œ¹ÅÕ•ÉåM•±•Ñ½È ÍÁ…¸œ¤¹Ñ•áÑ½¹Ñ•¹Ğô=¹±¥¹”œíô¤ì(€İ¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ½™™±¥¹”œ° ¤ôùí•±Ì¹Íå¹Œ¹±…ÍÍ9…µ”ôÍÑ…ÑÕÌµÁ¥±°•ÉÉ½Èœí•±Ì¹Íå¹Œ¹ÅÕ•ÉåM•±•Ñ½È ÍÁ…¸œ¤¹Ñ•áÑ½¹Ñ•¹Ğô=™™±¥¹”œíô¤ì(€İ¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰•™½É•¥¹ÍÑ…±±ÁÉ½µÁĞœ±”ôùí”¹ÁÉ•Ù•¹Ñ•™…Õ±Ğ ¤íÕ¤¹¥¹ÍÑ…±±AÉ½µÁĞõ”íô¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸‰½½Ğ ¥ì(€‰¥¹‘ÕÑ¡Ù•¹ÑÌ ¤ì(€½‰Í•ÉÙ•ÕÑ ¡…Íå¹ŒÕÍ•È€ôøì(€€€É•¹‘•ÉÕÑ ¡ÕÍ•È¤ì(€€€½¹ÍĞµ•ÍÍ…”€ô€ œ…ÕÑ µµ•ÍÍ…”œ¤ì(€€€¥˜€ …ÕÍ•È¤ì(€€€€€µ•ÍÍ…”¹±…ÍÍ9…µ”€ô€…ÕÑ µµ•ÍÍ…”œì(€€€€€µ•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ğ€ô€¹ÑÉ”½´Õµ„½¹Ñ„…ÕÑ½É¥é…‘„¹¼¥É•‰…Í”¸œì(€€€€€¥˜€¡Õ¤¹ÉÕ¹Ñ¥µ•MÑ…ÉÑ•¤±½…Ñ¥½¸¹É•±½… ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€µ•ÍÍ…”¹±…ÍÍ9…µ”€ô€…ÕÑ µµ•ÍÍ…”ÍÕ•ÍÌœì(€€€µ•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ğ€ô€•ÍÍ¼…ÕÑ½É¥é…‘¼¸œì(€€€…İ…¥ĞÍÑ…ÉÑÕÑ¡½É¥é•‘IÕ¹Ñ¥µ” ¤ì(€ô¤ì)ô(()‰½½Ğ ¤ì(
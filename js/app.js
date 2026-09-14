import { APP_CONFIG } from './config.js';
import {
  startRealtime, subscribe, getState, addWine, updateWine, adjustQuantity, openBottle, assignBottleLocation,
  toggleFavorite, deleteWine, addWishlist, removeWishlist, addEvent, removeEvent, saveSettings,
  backupObject, replaceFromBackup
} from './store.js';
import { getCloudinaryConfig, setCloudinaryConfig, discoverCloudinary, uploadImage, testCloudinaryConfig } from './cloudinary.js';
import { checkAI, scanLabel, askSommelier, getSuggestion, getTechSheet, getPairing, planDinner } from './ai.js';
import { observeAuth, signInOwner, signOutOwner, sendReset, currentIdentity, verifyOwnerAccess } from './auth.js';
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
function modalHead(title, subtitle = '') { return `<div class="modal-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="close-btn" data-close-modal>Г—</button></div>`; }
function bindClose() { $$('[data-close-modal]', els.sheet).forEach(b => b.onclick = closeModal); }
function errMessage(e) { return e?.message || String(e || 'Erro desconhecido.'); }
function withError(fn) { return async (...args) => { try { return await fn(...args); } catch (e) { console.error(e); toast(errMessage(e), 'error'); } }; }

function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou senha invГЎlidos.';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code.includes('unauthorized-domain')) return 'Este domГ­nio da Vercel ainda nГЈo foi autorizado no Firebase Authentication.';
  if (code.includes('network-request-failed')) return 'Falha de conexГЈo ao autenticar.';
  return error?.message || 'NГЈo foi possГ­vel entrar.';
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
      message.className = 'auth-message success'; message.textContent = 'E-mail de recuperaГ§ГЈo enviado.';
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
    els.sync.querySelector('span').textContent=permissionDenied?'Sem permissГЈo':error?'Erro Firebase':localPro?'Estoque sync В· PRO local':'Sincronizado';
    if (permissionDenied) toast('Sua conta entrou, mas o UID ainda nГЈo foi autorizado no Firestore.','error');
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
  if (route ===!,ѓТ!ђ гY[ќИ\HЪ[Ь›Ыљ^\€pи\љ[Л]™[ќЬИHЫЫ™љYЭ\pйрнY\И[ќ™H\\™[ЬЛЏЩ]Џ‰О‰ЙЯB€]€Ы\ЬПHњЩXЭ[Ы‹ZXYЏЏ]ЏЏЫX[’POЬЫX[ЏЏђXЪЩ[™Щ[Z[љOЪЏЏЩ]ЏЏЩ]Џ‚€]€YHњЩ][™ЬЛXZK[›ЭH€Ы\ЬПH››ЭXЩHЏ‰ЭZKZTЭ]\ПЛЫЫ™љYЭ\™YЙРXЪЩ[™ЫЫ™љYЭ\YИHЪ]™H›ЭYЪYH›ИЩ\ќљYЬ‹‰О‰Ф\H]]\€HPH›И\ЮH›Щљ\ЬЪ[Ы[ЫЫ™љYЭ\™HСSRS’WРTWТСVH\И[ќљ\›Ы›Y[ќ\љXX›\ИH™\Щ[€HЪ]™H°иЫИљXШHXZ\И›И]™YШYЬ‹‰ЯOЩ]Џ‚€]€Ы\ЬПHњЩXЭ[Ы‹ZXYЏЏ]ЏЏЫX[”СQХTђS°бРOЬЫX[ЏЏђЫЫќH]]Ьљ^YOЪЏЏЩ]ЏЏЩ]Џ‚€]€Ы\ЬПH››ЭXЩHЏЏЭ›Ы™П‰Щ\ШШ\R[
Э\њ™[ќY[ќ]J
K™[XZ[	РЫЫќH]][ќXШYIК_OЬЭ›Ы™ПЏњЏ•RQ€	Щ\ШШ\R[
Э\њ™[ќY[ќ]J
KќZY	ш %	К_OњЏ“ИXЩ\ЬЫИ[И\ЭЬ]YHH0иPH0кH[YYИ[Иљ\™X\ЩH[ќ\ИHШYHЬ\pйриЫИ›ЭYЪYKЏЩ]Џ‚€]€Ы\ЬПH›[Щ[XXЭ[ЫњИ€Э[OHљќ\ЭYћKXЫЫќ[ќ™›^\Э\ќЏЏќ]Ы€Ы\ЬПHњЩXЫЫ™\ћKXќ€€YH›ЩЫЭ]XXШЫЭ[ќЏ”ШZ\€\ЭHЫЫќOШќ]ЫЏЏЩ]Џ‚€]€Ы\ЬПHњЩXЭ[Ы‹ZXYЏЏ]ЏЏЫX[‘QФПЬЫX[ЏЏђXЪЭ\H^ЬќpйриЫПЪЏЏЩ]ЏЏЩ]Џ‚€]€Ы\ЬПH›[Щ[XXЭ[ЫњИ€Э[OHљќ\ЭYћKXЫЫќ[ќ™›^\Э\ќЏЏќ]Ы€Ы\ЬПHњЩXЫЫ™\ћKXќ€€YH™^ЬќZњЫЫ€ЏђXЪЭ\”УУЏШќ]ЫЏЏќ]Ы€Ы\ЬПHњЩXЫЫ™\ћKXќ€€YH™^ЬќXЬЭ€Џ‘\ЭЬ]YHФХЏШќ]ЫЏЏќ]Ы€Ы\ЬПHњЩXЫЫ™\ћKXќ€€YHљ[\ЬќZњЫЫ€Џ’[\Ьќ\€XЪЭ\Шќ]ЫЏЏЩ]Џ‚€]€Ы\ЬПH›[Щ[XXЭ[ЫњИЏЏќ]Ы€Ы\ЬПHњљ[X\ћKXќ€€YHњШ]™K\Щ][™ЬИЏ”Ш[\€ЫЫ™љYЭ\pйрнY\ПШќ]ЫЏЏЩ]Џ‚€Щ]Џ
NВ€љ[™ЫЬЩJ
NВ€	
	ИЫЩЫЭ]XXШЫЭ[ќ	КK›ЫЫXЪП]Ъ]\њ›ЬЉ\Ю[К
OOћИ]ШZ]ЪYЫ“Э]ЭЫ™\Љ
NИЫЬЩS[Щ[

NИШШ][Ы‹њ™[ШY

NИJNВ€	
	ИЬШ]™K\Щ][™ЬЙКK›ЫЫXЪП]Ъ]\њ›ЬЉ\Ю[К
OOћШЫЫњЭЫЭY^ШЫЭY[YN‰
	ИЬЛXЫЭY	КKќ[YKќљ[J
K\ШY™\Щ]‰
	ИЬЛ\™\Щ]	КKќ[YKќљ[J
K›Ы\Ћ‰
	ИЬЛY›Ы\‰КKќ[YKќљ[J
_	ШYYШKYZY	ЯNШ]ШZ]Ш]™TЩ][™ЬКЬ›Щљ[S[YN‰
	ИЬЛ\›Щљ[IКKќ[YKќљ[J
_TРУУ‘’QЛ™Y][Лњ›Щљ[S[YKЩ[\“[YN‰
	ИЬЛXЩ[\‰КKќ[YKќљ[J
_TРУУ‘’QЛ™Y][ЛЩ[\“[YKЪ[™\О‰
	ИЬЛ\Ъ[™\ЙКKќ[YKњЬ]
	Л	КK›X\
Oћќљ[J
KќХ\\ђШ\ЩJ
JK™љ[\Љ›ЫЫX[ЉKЫЭФ\”Ъ[ЋњШY™Sќ[X™\Љ	
	ИЬЛ\ЫЭЙКKќ[YKЉKЫЭY[\ћNЫЭYJNЫШШ[ЭЬYЩKњЩ]][J	ШYYШKYZYXЫЭY[\ћK\X›XЛXЫЫ™љYЙЛ”УУ‹њЭљ[™ЪYћJЫЭY
JNШЫЬЩS[Щ[

NЭШ\Э
	РЫЫ™љYЭ\pйрнY\ИШ[\Л‰Л	ЬЭXШЩ\ЬЙКNЯJNВ€	
	ИЩ\ШЫЭ™\‹XЫЭY	КK›ЫЫXЪП]Ъ]\њ›ЬЉ\Ю[К
OOћЫШY[™КќYK	Ф›ШЭ\[™ИЫЫ™љYЭ\pйриЫИ›ИY\Ы[Иљ\™X\ЩK‹‹‰КNЭћ^ШЫЫњЭ›Э[™X]ШZ]\ШЫЭ™\ђЫЭY[\ћJ
NЪYЉ›Э[™
^Й
	ИЬЛXЫЭY	КKќ[YOY›Э[™ЫЭY[YNЙ
	ИЬЛ\™\Щ]	КKќ[YOY›Э[™ќ\ШY™\Щ]Й
	ИЬЛY›Ы\‰КKќ[YOY›Э[™™›Ы\џ	ШYYШKYZY	ОЭШ\Э
ЫЭY[\ћH[ЫЫќYИ[H	Щ›Э[™њЫЭ\Щ_	ШЫЫ™љYЭ\pйриЫИ^\Э[ќIЯK	ЬЭXШЩ\ЬЙКNЯY[ЩHШ\Э
	У™[љ[XHЫЫ™љYЭ\pйриЫИЫЭY[\ћHЫЫ\]H›ЪH[ЫЫќYH›Иљ\™X\ЩH]X[‰Л	Щ\њ›Ь‰КNЯYљ[[^ЫШY[™К[ЩJNЯ_JNВ€	
	ИЭ\ЭXЫЭY	КK›ЫЫXЪПX\Ю[К
OOћЫШY[™КќYK	Х\Э[™И\ШYpл[љ[[Л‹‹‰КNЭћ^ШЫЫњЭЏX]ШZ]\ЭЫЭY[\ћPЫЫ™љYКШЫЭY[YN‰
	ИЬЛXЫЭY	КKќ[YK\ШY™\Щ]‰
	ИЬЛ\™\Щ]	КKќ[YK›Ы\Ћ‰
	ИЬЛY›Ы\‰КKќ[Y_JNЭШ\Э
‹›ЪПЙРЫЭY[\ћH™\ЬЫ™]HЫЬњ™][Y[ќK‰О[N€	Ь‹™\њ›ЬџX‹›ЪПЙЬЭXШЩ\ЬЙО‰Щ\њ›Ь‰КNЯYљ[[^ЫШY[™К[ЩJNЯ_NВ€	
	ИЩ^ЬќZњЫЫ‰КK›ЫЫXЪПJ
OOћЩЭЫ›ШY^
YYШKYZYXXЪЭ\IЫ™]И]J
KќТTУФЭљ[™К
KњЫXЩJL
_KљњЫЫ”УУ‹њЭљ[™ЪYћJXЪЭ\Шљ™XЭ

Kќ[ЉJNЭШ\Э
	РXЪЭ\”УУ€Щ\YЛ‰Л	ЬЭXШЩ\ЬЙКNЯNВ€	
	ИЩ^ЬќXЬЭ‰КK›ЫЫXЪПJ
OOћШЫЫњЭ›ЭЬПVЦЙУ›ЫYIЛ	Ф›Щ]Ь‰Л	Х]IЛ	Ф™YЪpиЫЙЛ	Фpл\ЙЛ	ФШYњIЛ	Х\ЙЛ	Ф]X[ќYYIЛ	Х[Ь€[љ]0и\љ[ЙЛ	ФЬЪpйриЫЙЧWNЭZKњЭ]KќЪ[™\Л™›Ь‘XXЪ
ПOњ›ЭЬЛњ\Ъ
ЭЛќЪ[™S[YKЛњ›ЩXЩ\‹Л™Ь\KЛњ™YЪ[Ы‹ЛЫЭ[ќћKЛћYX\‹Лќ\KЛњ]X[ќ]KЛњ\Ъ\ЩTљXЩKЛ›ШШ][Ы—JJNЩЭЫ›ШY^
YYШKYZYY\ЭЬ]YKIЫ™]И]J
KќТTУФЭљ[™К
KњЫXЩJL
_KЬЭ	ЧY™Y™‰КЭРФХЉ›ЭЬКK	Э^ШЬЭЋШЪ\њЩ]]]‹N	КNЭШ\Э
	РФХ€Щ\YЛ‰Л	ЬЭXШЩ\ЬЙКNЯNВ€	
	ИЪ[\ЬќZњЫЫ‰КK›ЫЫXЪПJ
OO™[ЛXЪЭ\ЫXЪК
NВџB‚\Ю[Иќ[Э[Ы€[\ЬќXЪЭ\љ[Jљ[J^ЪYЉYљ[J\™]\›ЋЭћ^ШЫЫњЭ^X]ШZ]љ[Kќ^

NШЫЫњЭ]OR”УУ‹њ\њЩJ^
NЪYЉY]_
P\њ^Kљ\Р\њ^J]K™\ЭЬ]YJI‰€Y]KќЊЉJ]›ЭИ™]И\њ›ЬЉ	Р\њ]Z]›И°иЫИ\™XЩHЩ\€[HXЪЭ\°и[YИHYYШK‰КNЫЬ[“[Щ[
	Ы[Щ[XY
	РЫЫ™љ\›X\€[\ЬќpйриЫЙЛ	РH[\ЬќpйриЫИЭXњЭ]ZHИ\ЭЬ]YHHЬИYЬИЊ€ИШЭ[Y[ќИ]X[‰КHO]€Ы\ЬПH›[Щ[X›ЩHЏЏ]€Ы\ЬПH››ЭXЩH[™Щ\‹[›ЭHЏ“ИXЪЭ\ЫЫќ0к[H	К]K™\ЭЬ]Y_ЧJK›[™ЭH°мЭ[ККK€pйШH\ЭHЬ\pйриЫИ\[\ИЩH\ЩZHЭXњЭ]Z\€ЬИYЬИ]XZ\ЛЏЩ]ЏЏ]€Ы\ЬПH›[Щ[XXЭ[ЫњИЏЏќ]Ы€Ы\ЬПH™ЪЬЭXќ€€]KXЫЬЩK[[Щ[ђШ[Щ[\ЏШќ]ЫЏЏќ]Ы€Ы\ЬПH™[™Щ\‹Xќ€€YHЫЫ™љ\›KZ[\ЬќЏ’[\Ьќ\€HЭXњЭ]Z\ЏШќ]ЫЏЏЩ]ЏЏЩ]Џ
NШљ[™ЫЬЩJ
NЙ
	ИШЫЫ™љ\›KZ[\Ьќ	КK›ЫЫXЪП]Ъ]\њ›ЬЉ\Ю[К
OOћЫШY[™КќYK	Т[\Ьќ[™ИXЪЭ\‹‹‰КNЭћ^Ш]ШZ]™\XЩQњ›ЫPXЪЭ\
]JNШЫЬЩS[Щ[

NЭШ\Э
	РXЪЭ\[\ЬќYЛ‰Л	ЬЭXШЩ\ЬЙКNЯYљ[[^ЫШY[™К[ЩJNЯ_JNЯXШ]Ъ
J^ЭШ\Э
\њ“Y\ЬШYЩJJK	Щ\њ›Ь‰КNЯYљ[[^Щ[ЛXЪЭ\ќ[YOIЙОЯ_B‚™ќ[Э[Ы€љ[™ЫШ[]™[ќК
^В€ШЭ[Y[ќY]™[ќ\Э[™\Љ	ШЫXЪЙЛOOћШЫЫњЭ›Э]OYKќ\™Щ]ЫЬЩ\Э
	ЦЩ]K\›Э]WIКNЪYЉ›Э]J\›Э]UК›Э]K™]\Щ]њ›Э]JNШЫЫњЭXЭ[ЫЏYKќ\™Щ]ЫЬЩ\Э
	ЦЩ]KXXЭ[Ы—IКNЪYЉXЭ[ЫЉ^ШЫЫњЭOXXЭ[Ы‹™]\Щ]XЭ[ЫЋЪYЉOOOIШY]Ъ[™IЯOOOIЬШШ[‹]Ъ[™IК[Ь[ђYЪ[™J
NЪYЉOOOIЫЬ[‹Y[›™\‰К[Ь[‘[›™\‘›Ь›J
NЪYЉOOOIШZK\ЭYЩЩ\Э	КXZTЭYЩЩ\Э[ЫЉ
NЯ_JNВ€[ЛXЪЩ›Ь›ЫЫXЪПXЫЬЩS[Щ[И	
	ИЬЩ][™ЬЛXќ‰КK›ЫЫXЪП[Ь[”Щ][™ЬОИ	
	ИЩљ[\њЛXќ‰КK›ЫЫXЪП[Ь[‘љ[\њОВ€	
	ИЭЪ[™K\ЩX\Ъ	КKY]™[ќ\Э[™\Љ	Ъ[њ]	ЛX›Э[ЩJOOћЭZKњЩX\ЪYKќ\™Щ]ќ[YNЬ™[™\ђЩ[\Љ
NЯKLЊ
JNВ€		
	ИЪ›Э\›[]XњИќ]Ы‰КK™›Ь‘XXЪ
ЏO‹›ЫЫXЪПJ
OOћЭZKљ›Э\›[X‹™]\Щ]љ›Э\›[Ь™[™\’›Э\›[

NЯJNВ€[ЛШ[Y\K›ЫЪ[™ЩOYOOљ[™TШШ[ЉKќ\™Щ]™љ[\ПЛ–МJNИ[Л™Ш[\ћK›ЫЪ[™ЩOYOOљ[™TШШ[ЉKќ\™Щ]™љ[\ПЛ–МJNИ[ЛXЪЭ\›ЫЪ[™ЩOYOOљ[\ЬќXЪЭ\љ[JKќ\™Щ]™љ[\ПЛ–МJNВ€	
	ИШЪ]Y›Ь›IКK›ЫњЭX›Z]X\Ю[ИOOћЩKњ™]™[ќY][

NШЫЫњЭ[њ]I
	ИШЪ]Z[њ]	КNШЫЫњЭOZ[њ]ќ[YKќљ[J
NЪYЉ\J\™]\›ЋЭZKЪ]њ\Ъ
Ь›ЫN‰Э\Щ\‰Л^њ_JNЪ[њ]ќ[YOIЙОЬ™[™\ђRJ
NЫШY[™КќYK	РЫЫњЭ[[™И\ЭЬ]YHHЫЫљXЪ[Y[ќИ[›Ы0мЩЪXЫЛ‹‹‰КNЭћ^ШЫЫњЭЏX]ШZ]\ЪФЫЫ[Y[Y\ЉKZKЪ]
NЭZKЪ]њ\Ъ
Ь›ЫN‰ШZIЛ^њ‹ќ^	ФЩ[H™\ЬЬЭK‰ЯJNЯXШ]Ъ
\њЉ^ЭZKЪ]њ\Ъ
Ь›ЫN‰ШZIЛ^PH[™\ЬЫ°л]™[€	Щ\њ“Y\ЬШYЩJ\њЉ_XJNЯYљ[[^ЫШY[™К[ЩJNЬ™[™\ђRJ
NЯ_NВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	ЫЫ›[™IЛ

OOћЩ[ЛњЮ[ЛЫ\ЬУ[YOIЬЭ]\Л\[ЪЙОЩ[ЛњЮ[Лњ]Y\ћTЩ[XЭЬЉ	ЬЬ[‰КKќ^ЫЫќ[ќIУЫ›[™IОЯJNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	ЫЩ™›[™IЛ

OOћЩ[ЛњЮ[ЛЫ\ЬУ[YOIЬЭ]\Л\[\њ›Ь‰ОЩ[ЛњЮ[Лњ]Y\ћTЩ[XЭЬЉ	ЬЬ[‰КKќ^ЫЫќ[ќIУЩ™›[™IОЯJNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	Ш™Y›Ь™Z[њЭ[›Ы\	ЛOOћЩKњ™]™[ќY][

NЭZKљ[њЭ[›Ы\YNЯJNВџB‚\Ю[Иќ[Э[Ы€›ЫЭ

^В€љ[™]]]™[ќК
NВ€ШњЩ\ќ™P]]
\Ю[И\Щ\€O€В€ЫЫњЭY\ЬШYЩHH	
	ИШ]][Y\ЬШYЩIКNВ€Y€
]\Щ\ЉHВ€™[™\ђ]]
ќ[
NВ€Y\ЬШYЩKЫ\ЬУ[YHH	Ш]][Y\ЬШYЩIОВ€Y\ЬШYЩKќ^ЫЫќ[ќH	С[ќ™HЫЫH[XHЫЫќH]]Ьљ^YH›Иљ\™X\ЩK‰ОВ€Y€
ZKњќ[ќ[YTЭ\ќY
HШШ][Ы‹њ™[ШY

NВ€™]\›ЋВ€B‚€Y\ЬШYЩKЫ\ЬУ[YHH	Ш]][Y\ЬШYЩIОВ€Y\ЬШYЩKќ^ЫЫќ[ќH	Х[Y[™И]]Ьљ^pйриЫИHYYШK‹‹‰ОВ€ЫЫњЭXШЩ\ЬИH]ШZ]™\љYћSЭЫ™\ђXШЩ\ЬК
NВ€Y€
XXШЩ\ЬЛ›ЪКHВ€™[™\ђ]]
ќ[
NВ€Y\ЬШYЩKЫ\ЬУ[YHH	Ш]][Y\ЬШYЩH\њ›Ь‰ОВ€Y\ЬШYЩKќ^ЫЫќ[ќHXШЩ\ЬЛњ™X\ЫЫ€OOH	Ы›Э[\ЭY	В€И	РЫЫќH]][ќXШYKX\ИИRQ°иЫИ\Э0иH]]Ьљ^YИ\H\ЭHYYШK‰В€€	РЫЫќH]][ќXШYKЬ°к[H\И™YЬ\ЛШ[ЭЫ\ЭZ[™H°иЫИ]]Ьљ^\[H\ЭHRQ‰ОВ€™]\›ЋВ€B‚€™[™\ђ]]
\Щ\ЉNВ€Y\ЬШYЩKЫ\ЬУ[YHH	Ш]][Y\ЬШYЩHЭXШЩ\ЬЙОВ€Y\ЬШYЩKќ^ЫЫќ[ќH	РXЩ\ЬЫИ]]Ьљ^YЛ‰ОВ€]ШZ]Э\ќ]]Ьљ^™Yќ[ќ[YJ
NВ€JNВџB‚‚›ЫЭ

NВ
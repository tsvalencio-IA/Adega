import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, onSnapshot, runTransaction, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { APP_CONFIG } from './config.js';

export const firebaseApp = initializeApp(APP_CONFIG.firebase);
export const db = getFirestore(firebaseApp);

// Documento legado: permanece exatamente onde a versão antiga lê/grava o estoque.
export const adegaRef = doc(db, 'adegas', APP_CONFIG.adegaId);
// Documento PRO isolado: a versão antiga usa setDoc({estoque}) sem merge e nunca toca neste documento.
export const metaRef = doc(db, 'adegas', APP_CONFIG.metaDocId);

export { doc, getDoc, onSnapshot, runTransaction, setDoc };

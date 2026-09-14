import { firebaseApp } from './firebase.js';
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('[ADEGA] Persistência de autenticação:', error?.code || error?.message);
});

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInOwner(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) throw new Error('Informe e-mail e senha.');
  const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return credential.user;
}

export async function signOutOwner() {
  await signOut(auth);
}

export async function sendReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('Informe o e-mail para recuperar a senha.');
  await sendPasswordResetEmail(auth, cleanEmail);
}

export async function getApiToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  return user.getIdToken(forceRefresh);
}

export function currentIdentity() {
  const user = auth.currentUser;
  return user ? {
    uid: user.uid || '',
    email: user.email || '',
    displayName: user.displayName || ''
  } : { uid: '', email: '', displayName: '' };
}

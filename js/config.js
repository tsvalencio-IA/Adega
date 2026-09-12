export const APP_CONFIG = {
  appName: 'Adega EID VALÊNCIO',
  version: '2.0.0',
  adegaId: 'adega-compartilhada',
  metaDocId: 'adega-compartilhada-pro-v2',
  firebase: {
    apiKey: 'AIzaSyCAOHJ5Dj4TjZLg8wonEVMcCOvFSn0F8a8',
    authDomain: 'valencio-app.firebaseapp.com',
    projectId: 'valencio-app',
    storageBucket: 'valencio-app.firebasestorage.app',
    messagingSenderId: '889574596911',
    appId: '1:889574596911:web:e786e2638ba706c4ad81da'
  },
  cloudinary: {
    cloudName: '',
    uploadPreset: '',
    folder: 'adega-eid'
  },
  aiEndpoint: '/api/ai',
  defaults: {
    shelves: ['A', 'B', 'C', 'D'],
    slotsPerShelf: 6,
    cellarName: 'Adega principal',
    profileName: 'Usuário da adega'
  }
};

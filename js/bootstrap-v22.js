const CACHE_PREFIX = 'adega-eid-pro-';
try {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX)).map(k => caches.delete(k)));
  }
} catch (e) {
  console.warn('[ADEGA] Limpeza de cache anterior:', e?.message || e);
}
await import('./app.js?v=2.2.0');

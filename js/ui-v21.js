// Ajustes visuais da V2.1 sem duplicar a interface principal.
if (typeof document !== 'undefined' && !document.querySelector('link[data-adega-v21]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/armario-v21.css?v=2.1.0';
  link.dataset.adegaV21 = 'true';
  document.head.appendChild(link);
}

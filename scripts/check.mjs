import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const required = [
  'index.html','manifest.webmanifest','sw.js','vercel.json','api/ai.js','js/app.js','js/config.js',
  'js/firebase.js','js/auth.js','js/store.js','js/cloudinary.js','js/ai.js','js/utils.js','css/app.css','assets/icon.svg',
  'assets/icon-192.png','assets/icon-512.png','assets/apple-touch-icon.png','firestore.rules','firebase.json','README.md'
];
let failed = false;
for (const f of required) {
  if (!fs.existsSync(path.join(root, f))) { console.error('FALTA:', f); failed = true; }
}
const js = ['api/ai.js', ...fs.readdirSync(path.join(root, 'js')).filter(x => x.endsWith('.js')).map(x => `js/${x}`), 'sw.js'];
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); console.log('OK syntax:', f); }
  catch (e) { failed = true; console.error('ERRO syntax:', f, e.stderr?.toString() || e.message); }
}
const files = [];
function walk(dir) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { const p=path.join(dir,ent.name); if (ent.isDirectory() && !ent.name.startsWith('.')) walk(p); else if (ent.isFile()) files.push(p); } }
walk(root);
const all = files.filter(f => /\.(?:js|html|json|md|txt|webmanifest)$/i.test(f)).map(f => fs.readFileSync(f,'utf8')).join('\n');
const forbidden = [/AIzaSyAl5I/i, /GEMINI_API_KEY\s*=\s*["'][A-Za-z0-9_-]{20,}/i, /api_secret\s*[:=]\s*["'][^"']+/i];
for (const re of forbidden) if (re.test(all)) { failed = true; console.error('SEGREDO/CHAVE suspeita encontrada:', re); }
try { JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8')); JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')); JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')); JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8')); console.log('OK JSON'); }
catch(e) { failed = true; console.error('ERRO JSON:', e.message); }
if (failed) process.exit(1);
console.log('\nVALIDAÇÃO CONCLUÍDA: estrutura, sintaxe, JSON e varredura de segredos passaram.');

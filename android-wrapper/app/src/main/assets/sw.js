const CACHE='imperium-personal-planner-v1';
const ASSETS=['./','./index.html','./planner.js','./planner-core.js','./planner.css','./config.js','./manifest.webmanifest','./icons/planner.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('imperium-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Cache only the static shell, never credentials, API responses or documents.
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.some(a=>new URL(a,self.location.href).pathname===url.pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});

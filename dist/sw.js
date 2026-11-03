// Cache the application shell only. Never cache downloads, requests with a body,
// navigation outside the app, query strings, or any clinical record.
const CACHE='endo-note-shell-v1.0.1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./engine.js','./knowledge.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
const allowed=new Set(ASSETS.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('endo-note-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!allowed.has(e.request.url))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});

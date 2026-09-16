/* Offline-cache för app-skalet. Höj CACHE vid varje deploy, annars ligger
   gamla filer kvar hos den som redan sparat appen på hemskärmen. */
const CACHE = 'resekartan-v10';
const SHELL = [
  './', './index.html', './app.js', './manifest.json',
  './data/world-50m.js', './data/iso.js', './data/seed.js', './data/firebase-config.js',
  './icon-180.png', './icon-192.png', './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // En enda trasig URL ska inte fälla hela installationen
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);

  // Live-data ska alltid gå mot nätet
  if(/firestore|identitytoolkit|firebaseio|nominatim|photon/.test(url.hostname)) return;

  // Firebase-SDK:n är statiska filer – värd att cacha, annars laddas ~300 kB
  // vid varje kallstart och inloggningen känns hängd.
  const isSDK = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');

  // HTML hämtas nätverket först, annars fastnar den som sparat appen på
  // hemskärmen i en gammal version tills cachen råkar bytas ut.
  const isPage = request.mode === 'navigate' ||
    (request.destination === 'document') ||
    url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  e.respondWith((async () => {
    const cached = await caches.match(request);
    const net = fetch(request).then(res => {
      if(res && res.ok && (url.origin === location.origin || isSDK || SHELL.includes(request.url))){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => null);

    if(isPage) return (await net) || cached || new Response('Offline', { status: 503 });
    return cached || (await net) || new Response('Offline', { status: 503 });
  })());
});

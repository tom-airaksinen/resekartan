/* Offline-cache för app-skalet.

   Två saker som gick fel tidigare och som reglerna nedan finns till för:

   1. `cache.add()` går genom webbläsarens vanliga HTTP-cache. GitHub Pages sätter
      max-age, så en ny service worker kunde lägga in en *gammal* fil i sin färska
      cache – appen startade i lokalt läge trots att konfigurationen var ifylld.
      Därför hämtas allt med `cache: 'reload'` vid installation.

   2. Cache-först på koden gjorde att den som sparat appen på hemskärmen blev kvar
      i en gammal version. Nu går sidan och de små kodfilerna nätverket först och
      faller tillbaka på cachen; bara det tunga (kartdata, ikoner, bibliotek)
      läses cache-först. */
const CACHE = 'resekartan-v35';

const SHELL = [
  './', './index.html', './app.js', './manifest.json',
  './data/world-50m.js', './data/iso.js', './data/seed.js', './data/firebase-config.js',
  './icon-180.png', './icon-192.png', './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Figtree:wght@400;500;600&display=optional',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
];

// Små filer som styr hur appen beter sig – de ska alltid vara färska
const FRESH = /\/(index\.html|app\.js|manifest\.json)$|\/data\/(firebase-config|seed|iso)\.js$|\/$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async u => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if(res && res.ok) await c.put(u, res);
    }));
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

  // Live-data går alltid mot nätet
  if(/firestore|identitytoolkit|firebaseio|nominatim|photon/.test(url.hostname)) return;

  // Firebase-SDK:n är statiska filer – värd att cacha, annars laddas ~300 kB
  // vid varje kallstart och inloggningen känns hängd.
  const isSDK = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');
  // Typsnitten måste cachas, annars hämtas de vid varje start och hinner inte
  // fram innan texten ritas – det är det som får appnamnet att blinka till.
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isPage = request.mode === 'navigate' || request.destination === 'document';
  const wantFresh = isPage || (url.origin === location.origin && FRESH.test(url.pathname));

  e.respondWith((async () => {
    const cached = await caches.match(request);
    const net = fetch(request).then(res => {
      if(res && res.ok && (url.origin === location.origin || isSDK || isFont)){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => null);

    if(wantFresh) return (await net) || cached || new Response('Offline', { status: 503 });
    return cached || (await net) || new Response('Offline', { status: 503 });
  })());
});

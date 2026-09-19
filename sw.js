/* Offline-cache för app-skalet.

   Två saker som gick fel tidigare och som reglerna nedan finns till för:

   1. `cache.add()` går genom webbläsarens vanliga HTTP-cache. GitHub Pages sätter
      max-age, så en ny service worker kunde lägga in en *gammal* fil i sin färska
      cache – appen startade i lokalt läge trots att konfigurationen var ifylld.
      Därför hämtas allt med `cache: 'reload'` vid installation.

   2. Cache-först på koden gjorde att den som sparat appen på hemskärmen blev kvar
      i en gammal version. Nu går sidan och de små kodfilerna nätverket först och
      faller tillbaka på cachen; bara det tunga (kartdata, ikoner, bibliotek)
      läses cache-först.

   3. En enda cache som byttes ut vid varje version tömde också typsnitt,
      kartbibliotek och Firebase-SDK. Första starten efter varje uppdatering
      hämtade dem från nätet igen, och appnamnet blinkade när typsnittet kom
      efter texten. Nu ligger det som aldrig ändras (tredjepartsfiler med
      version i adressen) i en egen cache som överlever versionsbyten. */
const CACHE  = 'resekartan-v55';      // appens egna filer, byts vid varje version
const STATIC = 'resekartan-static';   // typsnitt och bibliotek, överlever versionsbyten

const SHELL = [
  './', './index.html', './app.js', './manifest.json',
  './data/world-50m.js', './data/iso.js', './data/seed.js', './data/firebase-config.js',
  './icon-180.png', './icon-192.png', './icon-512.png'
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Figtree:wght@400;500;600&display=optional';
const STATIC_FILES = [
  FONT_CSS,
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
];
const isStatic = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  || url.hostname === 'cdnjs.cloudflare.com'
  || (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/'));

// Små filer som styr hur appen beter sig – de ska alltid vara färska
const FRESH = /\/(index\.html|app\.js|manifest\.json)$|\/data\/(firebase-config|seed|iso)\.js$|\/$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async u => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if(res && res.ok) await c.put(u, res);
    }));
    // Det statiska hämtas bara om det saknas – det ändras aldrig
    const st = await caches.open(STATIC);
    await Promise.allSettled(STATIC_FILES.map(async u => {
      if(await st.match(u)) return;
      const res = await fetch(u);
      if(res && res.ok) await st.put(u, res);
    }));
    /* Typsnittsfilerna står bara i css:en, så de plockas ut därifrån och läggs
       i cachen direkt vid installationen. Annars hämtas de först när sidan
       ritas, och då hinner texten ritas i reservtypsnittet innan de kommer. */
    try {
      const css = await (await st.match(FONT_CSS)).text();
      const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
      await Promise.allSettled(urls.map(async u => {
        if(await st.match(u)) return;
        const res = await fetch(u);
        if(res && res.ok) await st.put(u, res);
      }));
    } catch(err){}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Bara gamla versioner av appens egna cache rensas – den statiska får leva
    await Promise.all(keys.filter(k => k.startsWith('resekartan-v') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);

  // Live-data går alltid mot nätet
  if(/firestore|identitytoolkit|firebaseio|nominatim|photon/.test(url.hostname)) return;

  const statisk = isStatic(url);
  const isPage = request.mode === 'navigate' || request.destination === 'document';
  const wantFresh = isPage || (url.origin === location.origin && FRESH.test(url.pathname));

  e.respondWith((async () => {
    const cached = await caches.match(request);
    const net = fetch(request).then(res => {
      if(res && res.ok && (url.origin === location.origin || statisk)){
        const copy = res.clone();
        caches.open(statisk ? STATIC : CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => null);

    if(wantFresh) return (await net) || cached || new Response('Offline', { status: 503 });
    return cached || (await net) || new Response('Offline', { status: 503 });
  })());
});

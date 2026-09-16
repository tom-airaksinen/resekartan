/* Resekartan – familjens resor på en karta.
   Data ligger i localStorage tills Firebase kopplas på; seed.js är bara exempel. */

/* ============================ Lås ============================
   Obs: det här håller nyfikna ute, inte en angripare. Sidan är statisk, så all
   kod går att läsa. Därför ligger bara en PBKDF2-hash i koden (lösenordet självt
   läcker alltså inte), och riktiga resor sparas i localStorage/Firebase – aldrig
   i repot. Vill man skydda själva datat är det Firebase-reglerna som gör jobbet. */
const AUTH = {
  salt: 'resekartan-familjen-v1',
  iter: 150000,
  // Byt lösenord under Inställningar → Lösenord: appen räknar fram raden som ska in här.
  // Skriv aldrig själva lösenordet i koden – repot är publikt.
  hash: '5805d07268265f31365760d2aa2a450e97629e0d6a43c36829b54b3d971026c7'
};
const LS_KEY = 'resekartan.data', LS_AUTH = 'resekartan.unlocked';

async function derive(pw){
  if(!crypto?.subtle) throw new Error('nocrypto');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt: enc.encode(AUTH.salt), iterations: AUTH.iter, hash:'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,'0')).join('');
}
const lockEl = document.getElementById('lock'), appEl = document.getElementById('app');
function lockStatus(text){
  const box = document.getElementById('pwStatus');
  if(!box) return;
  box.hidden = !text;
  if(text) document.getElementById('pwStatusText').textContent = text;
}
function openApp(){ lockEl.hidden = true; appEl.hidden = false; start(); }

/* ============================ Moln (Firebase) ============================
   Utan konfiguration kör appen helt lokalt: localStorage + lösenordshashen ovan.
   Med konfiguration delar alla enheter samma data och inloggningen går mot
   Firebase Authentication, som också är det som faktiskt skyddar datat.

   Hela datat ligger i ETT dokument. För en familj är det några tiotal kB, långt
   under Firestores gräns, och det gör varje sparning atomär. Baksidan: sparar två
   personer i samma sekund vinner den sista. Med fyra användare är det en rimlig
   avvägning – blir det ett problem är nästa steg ett dokument per resa. */
const CLOUD = { on: false, ready: false, mod: null, db: null, auth: null, ref: null, user: null, applying: false };
const useCloud = () => !!window.FIREBASE_CONFIG;
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

let cloudInitPromise = null;
function cloudInit(){ return cloudInitPromise ??= cloudInitOnce(); }
async function cloudInitOnce(){
  if(!useCloud()) return false;
  const [app, auth, store] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js')
  ]);
  const a = app.initializeApp(window.FIREBASE_CONFIG);
  CLOUD.mod = { auth, store };
  CLOUD.auth = auth.getAuth(a);
  // Lokal cache: appen läser utan nät, och ändringar som görs offline köas och
  // skickas upp när täckningen kommer tillbaka. Faller tillbaka till minnescache
  // om webbläsaren nekar (privat fönster, flera flikar utan stöd).
  try {
    CLOUD.db = store.initializeFirestore(a, {
      localCache: store.persistentLocalCache({ tabManager: store.persistentMultipleTabManager() })
    });
  } catch(e){
    CLOUD.db = store.getFirestore(a);
  }
  CLOUD.ref = store.doc(CLOUD.db, 'resekartan', 'data');
  await auth.setPersistence(CLOUD.auth, auth.browserLocalPersistence).catch(() => {});
  CLOUD.ready = true;
  return true;
}

function cloudDot(state, title){
  const el = document.getElementById('cloudDot');
  if(!el) return;
  el.hidden = !useCloud();
  el.className = 'cloud' + (state ? ' ' + state : '');
  el.title = title || '';
}

/* Lyssna på dokumentet så alla enheter följer med i realtid */
function cloudWatch(){
  const { store } = CLOUD.mod;
  store.onSnapshot(CLOUD.ref, snap => {
    if(snap.metadata.hasPendingWrites) return;   // vår egen skrivning, redan ritad
    const d = snap.data();
    if(!d || !d.payload) return;
    let incoming;
    try { incoming = JSON.parse(d.payload); } catch(e){ return; }
    if(!incoming || !Array.isArray(incoming.trips)) return;
    if(JSON.stringify(incoming) === JSON.stringify(DB)) return;
    CLOUD.applying = true;
    DB = incoming;
    normaliseDB();
    try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch(e){}
    refreshAll();
    CLOUD.applying = false;
    cloudDot('on', 'Synkad med familjens data');
  }, err => {
    cloudDot('off', 'Ingen kontakt med molnet: ' + err.code);
    toast('Tappade kontakten med molnet. Ändringar sparas lokalt.');
  });
}

let cloudQueue = null;
async function cloudSave(){
  if(!CLOUD.on || CLOUD.applying) return;
  const { store } = CLOUD.mod;
  clearTimeout(cloudQueue);
  cloudQueue = setTimeout(async () => {
    try {
      await store.setDoc(CLOUD.ref, {
        payload: JSON.stringify(DB),
        updatedAt: store.serverTimestamp(),
        updatedBy: CLOUD.user?.email || 'okänd'
      });
      cloudDot('on', 'Sparat i molnet');
    } catch(err){
      cloudDot('off', 'Kunde inte spara i molnet: ' + err.code);
      toast('Kunde inte spara i molnet – ändringen finns kvar lokalt.');
    }
  }, 400);
}

/* Första inloggningen mot ett tomt moln: lägg upp det som redan finns lokalt */
async function cloudFirstSync(){
  const { store } = CLOUD.mod;
  const snap = await store.getDoc(CLOUD.ref);
  if(snap.exists() && snap.data().payload){
    try {
      const d = JSON.parse(snap.data().payload);
      if(d && Array.isArray(d.trips)){ DB = d; normaliseDB(); }
    } catch(e){}
  } else {
    DB = loadDB(); normaliseDB();
    await store.setDoc(CLOUD.ref, {
      payload: JSON.stringify(DB),
      updatedAt: store.serverTimestamp(),
      updatedBy: CLOUD.user?.email || 'okänd'
    });
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch(e){}
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Fel e-post eller lösenord.',
  'auth/wrong-password': 'Fel lösenord.',
  'auth/user-not-found': 'Det finns inget konto med den e-posten.',
  'auth/invalid-email': 'Kontrollera e-postadressen.',
  'auth/too-many-requests': 'För många försök. Vänta en stund.',
  'auth/network-request-failed': 'Ingen kontakt med nätet.'
};

document.getElementById('lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('pwBtn'), err = document.getElementById('pwErr');
  const pw = document.getElementById('pw').value;
  btn.disabled = true; btn.textContent = 'Kollar …'; err.textContent = '';

  if(useCloud()){
    const email = document.getElementById('email').value.trim();
    try {
      lockStatus('Kopplar upp …');
      await cloudInit();
      const { auth } = CLOUD.mod;
      lockStatus('Loggar in …');
      const cred = await auth.signInWithEmailAndPassword(CLOUD.auth, email, pw);
      CLOUD.user = cred.user; CLOUD.on = true;
      lockStatus('Hämtar familjens resor …');
      await cloudFirstSync();
      lockStatus('');
      openApp();
      cloudWatch();
      cloudDot('on', 'Inloggad som ' + email);
      return;
    } catch(ex){
      lockStatus('');
      err.textContent = ex.code === 'permission-denied'
        ? 'Inloggad, men kontot saknar behörighet till datat. Kontrollera Firestore-reglerna.'
        : (AUTH_ERRORS[ex.code] || ('Inloggningen misslyckades (' + (ex.code || ex.message) + ').'));
    }
  } else {
    try {
      if(await derive(pw) === AUTH.hash){
        try { localStorage.setItem(LS_AUTH, AUTH.hash); } catch(e){}
        return openApp();
      }
      err.textContent = 'Fel lösenord.';
    } catch(ex){
      err.textContent = ex.message === 'nocrypto'
        ? 'Låset behöver https (eller localhost) för att fungera.'
        : 'Något gick fel. Försök igen.';
    }
  }
  btn.disabled = false; btn.textContent = useCloud() ? 'Logga in' : 'Lås upp';
  document.getElementById('pw').select();
});

/* ============================ Dialog och toast ============================
   alert()/confirm() är blockerade i sandlådade inbäddningar – där hände det
   ingenting alls när man tryckte Spara. Allt går genom egna rutor istället. */
const askEl = document.getElementById('ask');
let askResolve = null;
function ask(text, yes = 'Ja'){
  return new Promise(resolve => {
    askResolve = resolve;
    document.getElementById('askText').textContent = text;
    document.getElementById('askYes').textContent = yes;
    askEl.hidden = false;
    document.getElementById('askYes').focus();
  });
}
function closeAsk(v){ askEl.hidden = true; const r = askResolve; askResolve = null; if(r) r(v); }
document.getElementById('askYes').onclick = () => closeAsk(true);
document.getElementById('askNo').onclick = () => closeAsk(false);
askEl.addEventListener('click', e => { if(e.target === askEl) closeAsk(false); });
addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if(!askEl.hidden) return closeAsk(false);
  if(!document.getElementById('cal').hidden) return closeCal();
});

let toastTimer = null;
function toast(text){
  let el = document.getElementById('toast');
  if(!el){ el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ============================ Data ============================ */
let DB = { people: [], home: null, trips: [] };

function loadDB(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ const d = JSON.parse(raw); if(d && Array.isArray(d.trips)) return d; }
  } catch(e){}
  return structuredClone(SEED);
}
function saveDB(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
  catch(e){ toast('Kunde inte spara på den här enheten.'); }
  cloudSave();
}
const usingSeed = () => { try { return !localStorage.getItem(LS_KEY); } catch(e){ return true; } };

/* ============================ Länder och personer ============================ */
const regionName = (() => {
  try { const dn = new Intl.DisplayNames(['sv'], { type:'region' }); return c => dn.of(c) || c; }
  catch(e){ return c => c; }
})();
function countryName(iso){ const a = ISO[iso]?.[0]; return a ? regionName(a) : ('Land ' + iso); }
function flagOf(iso){
  const a = ISO[iso]?.[0];
  if(!a) return '🏳️';
  return String.fromCodePoint(...[...a].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}
const ALL_COUNTRIES = Object.keys(ISO)
  .map(iso => ({ iso, name: countryName(iso) }))
  .sort((a,b) => a.name.localeCompare(b.name,'sv'));

/* Familjen har varsin färg; gäster delar en dämpad stil och känns igen på namnet,
   som alltid står utskrivet där det spelar roll. */
const PALETTE = ['--p1','--p2','--p3','--p4','--p5','--p6'];
const person = id => DB.people.find(p => p.id === id);
const isCore = id => !!person(id)?.core;
const family = () => DB.people.filter(p => p.core);
const guests = () => DB.people.filter(p => !p.core);
const personColor = id => {
  const i = family().findIndex(p => p.id === id);
  return i < 0 ? 'var(--guest-bg)' : `var(${PALETTE[i % PALETTE.length]})`;
};
const personName = id => person(id)?.name || id;
const isHome = iso => iso === DB.home?.iso;

/* ============================ Format ============================ */
const MON = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
const dt = s => new Date(s + 'T12:00:00');
const days = t => Math.max(1, Math.round((dt(t.end) - dt(t.start)) / 864e5) + 1);
function span(a, b){
  if(!a) return 'datum saknas';
  if(!b) b = a;
  const A = dt(a), B = dt(b);
  if(a === b) return `${A.getDate()} ${MON[A.getMonth()]} ${A.getFullYear()}`;
  if(A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear())
    return `${A.getDate()}–${B.getDate()} ${MON[A.getMonth()]} ${A.getFullYear()}`;
  if(A.getFullYear() === B.getFullYear())
    return `${A.getDate()} ${MON[A.getMonth()]} – ${B.getDate()} ${MON[B.getMonth()]} ${A.getFullYear()}`;
  return `${A.getDate()} ${MON[A.getMonth()]} ${A.getFullYear()} – ${B.getDate()} ${MON[B.getMonth()]} ${B.getFullYear()}`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const av = id => `<span class="av${isCore(id) ? '' : ' guest'}" style="--pc:${personColor(id)}" title="${esc(personName(id))}"><i>${esc(personName(id)[0] || '?')}</i></span>`;
// Bara familjen får varsin bricka; gäster samlas i en "+N" med namnen i title,
// annars blir två gäster med samma initial omöjliga att skilja åt.
function avs(who){
  const list = who || [], core = list.filter(isCore), extra = list.filter(id => !isCore(id));
  return `<span class="avs">${core.map(av).join('')}${extra.length
    ? `<span class="more" title="${esc(extra.map(personName).join(', '))}">+${extra.length}</span>` : ''}</span>`;
}
const stopWho = (t, s) => (s.who && s.who.length ? s.who : t.who) || [];
const stopStart = (t, s) => s.start || t.start;
const stopEnd = (t, s) => s.end || t.end;

/* ============================ Urval ============================ */
let filter = null, tab = 'karta', sel = null, selCountry = null;

const inFilter = (t, s) => !filter || stopWho(t, s).includes(filter);
const visible = () => DB.trips.filter(t => !filter || t.who?.includes(filter) || t.stops.some(s => inFilter(t, s)));
const done = list => list.filter(t => !t.planned);
const byDateDesc = (a, b) => (b.start || '').localeCompare(a.start || '');

function stopsIn(iso){
  const out = [];
  visible().forEach(t => t.stops.forEach(st => { if(st.iso === iso && inFilter(t, st)) out.push({ t, st }); }));
  return out.sort((a, b) => byDateDesc(a.t, b.t));
}
function stats(list){
  const l = done(list), countries = new Set(), places = new Set();
  let dd = 0;
  l.forEach(t => {
    dd += days(t);
    t.stops.forEach(s => {
      if(!inFilter(t, s)) return;
      if(!isHome(s.iso)) countries.add(s.iso);
      (s.places || []).forEach(p => places.add(p.name));
    });
  });
  return { countries: countries.size, places: places.size, trips: l.length, days: dd };
}

/* ============================ Bilder ============================
   Bilderna ligger för sig, inte i huvuddokumentet – det skulle spränga
   Firestores gräns på 1 MB per dokument. Molnläge: subcollection
   resekartan/data/foton. Lokalt: IndexedDB, som till skillnad från
   localStorage klarar hundratals megabyte.

   Varje bild skalas ned i webbläsaren innan den sparas. `place` är tomt än så
   länge men finns med, så bilder kan knytas till en enskild ort längre fram
   utan att det som redan ligger inne behöver skrivas om. */
const PH_MAX_SIDE = 1400, PH_BUDGET = 700 * 1024;

function idb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('resekartan-foton', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains('foton')){
        db.createObjectStore('foton', { keyPath: 'id' }).createIndex('tripId', 'tripId');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbAll(tripId){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('foton').objectStore('foton').index('tripId').getAll(tripId);
    tx.onsuccess = () => res(tx.result || []);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbPut(rec){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('foton', 'readwrite').objectStore('foton').put(rec);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(id){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('foton', 'readwrite').objectStore('foton').delete(id);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const photoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Skala ned och komprimera tills bilden ryms i ett Firestore-dokument */
async function shrink(file){
  const bmp = await createImageBitmap(file).catch(() => null);
  if(!bmp) throw new Error('Kunde inte läsa bilden.');
  const scale = Math.min(1, PH_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let q = .72, url = cv.toDataURL('image/jpeg', q);
  while(url.length > PH_BUDGET && q > .35){ q -= .12; url = cv.toDataURL('image/jpeg', q); }
  if(url.length > PH_BUDGET){
    const cv2 = document.createElement('canvas');
    cv2.width = Math.round(w * .7); cv2.height = Math.round(h * .7);
    cv2.getContext('2d').drawImage(cv, 0, 0, cv2.width, cv2.height);
    url = cv2.toDataURL('image/jpeg', .6);
  }
  return { url, w, h };
}

const photos = {
  async list(tripId){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      const col = store.collection(CLOUD.db, 'resekartan', 'data', 'foton');
      const snap = await store.getDocs(store.query(col, store.where('tripId', '==', tripId)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
    }
    return (await idbAll(tripId)).sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
  },
  async add(tripId, file){
    const { url, w, h } = await shrink(file);
    const rec = { id: photoId(), tripId, place: null, url, w, h,
                  addedAt: new Date().toISOString(), addedBy: CLOUD.user?.email || null };
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      const { id, ...data } = rec;
      await store.setDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', id), data);
    } else {
      await idbPut(rec);
    }
    return rec;
  },
  async remove(id){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      await store.deleteDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', id));
    } else {
      await idbDel(id);
    }
  }
};

/* ============================ Kartan ============================ */
const svg = d3.select('#map'), gWorld = d3.select('#world');
const world = topojson.feature(WORLD, WORLD.objects.countries);
const landMesh = topojson.merge(WORLD, WORLD.objects.countries.geometries);
const proj = d3.geoNaturalEarth1(), path = d3.geoPath(proj);
let W = 0, H = 0, k = 1;

const SEAS = [
  ['Atlanten', 30, -40], ['Stilla havet', 0, -140], ['Stilla havet', 20, 170],
  ['Indiska oceanen', -25, 78], ['Norra ishavet', 80, 0]
];
const CONTINENTS = [
  ['Nordamerika', 46, -100], ['Sydamerika', -14, -60], ['Europa', 50, 15],
  ['Afrika', 6, 20], ['Asien', 45, 90], ['Oceanien', -25, 134]
];

const zoom = d3.zoom().scaleExtent([1, 1500])
  .on('zoom', e => { k = e.transform.k; gWorld.attr('transform', e.transform); rescale(); });
svg.call(zoom).on('dblclick.zoom', null);

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const ease = s => calm.matches ? s : s.transition().duration(650);

function layout(){
  const r = document.getElementById('stage').getBoundingClientRect();
  W = r.width; H = r.height;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  proj.fitExtent([[8, 60], [W - 8, H - (window.innerWidth < 900 ? H * .42 : 8)]], world);
  d3.select('#coast').attr('d', path(landMesh));
  d3.select('#countries').selectAll('path').data(world.features).join('path')
    .attr('d', path).attr('class', 'land')
    .on('click', (e, f) => { if(pickTarget) return; e.stopPropagation(); showCountry(f.id); });
  d3.select('#sealabels').selectAll('text').data(W >= 620 ? SEAS : []).join('text')
    .attr('class', 'sealabel').text(d => d[0])
    .attr('x', d => proj([d[2], d[1]])[0]).attr('y', d => proj([d[2], d[1]])[1]);
  d3.select('#conlabels').selectAll('text').data(CONTINENTS).join('text')
    .attr('class', 'conlabel').text(d => d[0])
    .attr('x', d => proj([d[2], d[1]])[0]).attr('y', d => proj([d[2], d[1]])[1]);
  drawPins();
}

function drawPins(){
  const links = [], pins = [];
  if(selCountry){
    stopsIn(selCountry).forEach(({ t, st }) =>
      (st.places || []).forEach(p => pins.push({ t, s: st, p, city: true })));
  } else {
    visible().forEach(t => {
      const stops = t.stops.filter(s => inFilter(t, s));
      if(!stops.length) return;
      const main = stops[0], m = (main.places || [])[0];
      if(m) pins.push({ t, s: main, p: m });
      stops.slice(1).forEach(s => {
        const p = (s.places || [])[0];
        if(!p) return;
        pins.push({ t, s, p, side: true });
        if(m) links.push([m, p]);
      });
    });
  }
  d3.select('#links').selectAll('path').data(links).join('path').attr('class', 'link')
    .attr('d', l => `M${proj([l[0].lon, l[0].lat])}L${proj([l[1].lon, l[1].lat])}`);

  const key = q => q.t.id + '|' + q.s.iso + '|' + q.p.name;
  d3.select('#pins').selectAll('g').data(pins, key)
    .join(en => { const g = en.append('g'); g.append('circle'); return g; })
    .attr('class', q => `pin${q.side ? ' side' : ''}${q.city ? ' city' : ''}${q.t.planned ? ' planned' : ''}`)
    .attr('transform', q => `translate(${proj([q.p.lon, q.p.lat])})`)
    .on('click', (e, q) => { if(pickTarget) return; e.stopPropagation(); showTrip(q.t.id); });

  d3.select('#labels').selectAll('text').data(selCountry ? pins : [], key).join('text')
    .attr('class', 'clabel').text(q => q.p.name)
    .attr('x', q => proj([q.p.lon, q.p.lat])[0]).attr('y', q => proj([q.p.lon, q.p.lat])[1]);

  drawHome(); rescale(); paint();
}

function drawHome(){
  const home = DB.home?.place ? [DB.home.place] : [];
  d3.select('#home').selectAll('g').data(home).join(en => {
    const g = en.append('g').attr('class', 'home-pin');
    g.append('circle').attr('r', 8).attr('stroke-width', 2);
    g.append('path').attr('d', 'M-3.4,-0.3 L0,-3.4 L3.4,-0.3 M-2.4,-1.1 L-2.4,3.2 L2.4,3.2 L2.4,-1.1');
    g.append('title');
    return g;
  }).select('title').text(p => 'Hemma i ' + p.name);
  d3.select('#home').selectAll('g').on('click', e => {
    if(pickTarget) return;
    e.stopPropagation(); showCountry(DB.home.iso);
  });
}

function rescale(){
  const u = 1 / k;
  d3.select('#pins').selectAll('g').each(function(q){
    const big = this.classList.contains('active') ? 1.35 : 1;
    d3.select(this).select('circle')
      .attr('r', (q.side ? 4.5 : q.city ? 5.5 : 6.5) * big * u).attr('stroke-width', 2 * u);
  });
  d3.select('#links').selectAll('path').attr('stroke-width', 1.2 * u);
  d3.select('#countries').selectAll('path').attr('stroke-width', .5 * u);
  d3.select('#countries').selectAll('path.home,path.visited').attr('stroke-width', u);
  // Kustlinjens halo är ett grepp för världsvyn. Håller vi den lika bred på skärmen
  // hela vägen in blir den ett vitt nät över kartan, så den smalnar av och tonar ut.
  const coastPx = Math.max(.4, 2.6 / Math.sqrt(k));
  // Streckmönstret ligger i kartans koordinatsystem och skalas med zoomen,
  // så vid inzoom blev det jättefält. Krymp mönstret i samma takt.
  d3.select('#hatch').attr('patternTransform', `rotate(45) scale(${u})`);
  d3.select('#coast').attr('stroke-width', coastPx * u)
    .style('opacity', k >= 12 ? 0 : Math.min(.9, .9 * (12 - k) / 6));
  d3.select('#home').selectAll('g').attr('transform', p => `translate(${proj([p.lon, p.lat])}) scale(${u})`);
  const ls = (W >= 620 ? 13 : 10) * u;
  d3.select('#sealabels').selectAll('text')
    .style('font-size', ls + 'px').style('opacity', k < 2.4 ? .8 : 0);
  d3.select('#conlabels').selectAll('text')
    .style('font-size', ls + 'px').style('letter-spacing', .8 * u + 'px')
    .style('opacity', k < 2.4 ? .75 : 0);
  placeLabels(u);
}

function placeLabels(u){
  const placed = [];
  d3.select('#labels').selectAll('text')
    .style('font-size', (11 * u) + 'px').style('stroke-width', 3.2 * u)
    .each(function(){
      const t = d3.select(this).style('display', null);
      const spots = [[0,-11,'middle'], [0,16,'middle'], [9,4,'start'], [-9,4,'end']];
      let fits = null;
      for(const [dx, dy, anchor] of spots){
        t.attr('dx', dx * u).attr('dy', dy * u).attr('text-anchor', anchor);
        const b = this.getBBox(), pad = 2 * u;
        const hit = placed.some(o => b.x - pad < o.x + o.width && o.x < b.x + b.width + pad
                                  && b.y - pad < o.y + o.height && o.y < b.y + b.height + pad);
        if(!hit){ fits = b; break; }
      }
      if(fits) placed.push(fits); else t.style('display', 'none');
    });
}

function paint(){
  const v = new Set(), p = new Set();
  visible().forEach(t => t.stops.forEach(s => {
    if(!inFilter(t, s) || isHome(s.iso)) return;
    (t.planned ? p : v).add(s.iso);
  }));
  p.forEach(i => { if(v.has(i)) p.delete(i); });
  d3.select('#countries').selectAll('path').attr('class', f =>
    'land' + (isHome(f.id) ? ' home hit' : '') + (v.has(f.id) ? ' visited hit' : '') + (p.has(f.id) ? ' planned hit' : ''));
  d3.select('#pins').selectAll('g')
    .classed('active', q => q.t.id === sel).classed('dim', q => sel && q.t.id !== sel);
  rescale();
}

function mapView(){
  if(window.innerWidth >= 900) return { top: 0, h: H };
  const bottom = sheet.getBoundingClientRect().height || H * sheetFrac;
  return { top: 108, h: Math.max(90, H - bottom - 118) };
}
function fitBox(x0, y0, x1, y1, maxK, fill){
  const v = mapView();
  const kk = Math.min(maxK, (fill || .7) / Math.max((x1 - x0) / W, (y1 - y0) / v.h, .004));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ty = v.top + v.h / 2;
  ease(svg).call(zoom.transform, d3.zoomIdentity.translate(W/2 - kk*cx, ty - kk*cy).scale(kk));
}
function flyTo(t){
  const pts = t.stops.flatMap(s => (s.places || []).map(p => proj([p.lon, p.lat])));
  if(!pts.length) return;
  fitBox(d3.min(pts, p => p[0]), d3.min(pts, p => p[1]),
         d3.max(pts, p => p[0]), d3.max(pts, p => p[1]), 250, .6);
}
// Rutan en landvy ska fylla: hela landet plus platserna vi varit på i det.
// Vi mäter landets STÖRSTA landmassa – annars drar Alaska ut hela USA-vyn.
function countryBox(iso){
  const f = world.features.find(x => x.id === iso);
  let box = null;
  if(f){
    const g = f.geometry, polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    let best = null, bestA = -1;
    polys.forEach(co => {
      const poly = { type:'Polygon', coordinates: co }, a = Math.abs(path.area(poly));
      if(a > bestA){ bestA = a; best = poly; }
    });
    const b = path.bounds(best);
    box = [b[0][0], b[0][1], b[1][0], b[1][1]];
  }
  const pts = [];
  stopsIn(iso).forEach(({ st }) => (st.places || []).forEach(p => pts.push(proj([p.lon, p.lat]))));
  if(isHome(iso) && DB.home.place) pts.push(proj([DB.home.place.lon, DB.home.place.lat]));
  if(!box && !pts.length){
    const ll = ISO[iso];
    if(ll) pts.push(proj([ll[2], ll[1]]));
  }
  pts.forEach(q => { box = box
    ? [Math.min(box[0], q[0]), Math.min(box[1], q[1]), Math.max(box[2], q[0]), Math.max(box[3], q[1])]
    : [q[0], q[1], q[0], q[1]]; });
  return box;
}
function flyToCountry(iso){
  const b = countryBox(iso);
  if(!b) return;
  // Marginalen måste vara proportionell – ett fast px-tal dränker ett litet land
  const w = b[2] - b[0], h = b[3] - b[1];
  const mx = w > .5 ? w * .08 : 6, my = h > .5 ? h * .08 : 6;
  fitBox(b[0] - mx, b[1] - my, b[2] + mx, b[3] + my, 150, .85);
}
function resetZoom(){ ease(svg).call(zoom.transform, d3.zoomIdentity); }
function clearSel(){
  if(!sel && !selCountry) return;
  sel = null; selCountry = null; drawPins(); renderSheet(); resetZoom();
}
svg.on('click', () => { if(!pickTarget) clearSel(); });
// Samma rörelseinställning som resten av kartan
d3.select('#zin').on('click', () => ease(svg).call(zoom.scaleBy, 1.6));
d3.select('#zout').on('click', () => ease(svg).call(zoom.scaleBy, 1/1.6));

/* ============================ Filter ============================ */
function renderWho(){
  document.getElementById('who').innerHTML =
    `<button class="all" aria-pressed="${filter === null}" data-p="">Alla</button>` +
    family().map(p => `<button aria-pressed="${filter === p.id}" data-p="${esc(p.id)}">${av(p.id)}${esc(p.name)}</button>`).join('');
}
document.getElementById('who').addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  filter = b.dataset.p || null; sel = null; selCountry = null;
  renderWho(); drawPins(); renderSheet(); renderViews(); resetZoom();
});

/* ============================ Bottenark ============================ */
const sheet = document.getElementById('sheet'), body = document.getElementById('sheetBody');

/* ---- Dragbart ark ----
   Handtaget såg ut att gå att dra men gjorde bara en toggle. Nu går arket att
   dra fritt och snäpper till närmaste läge, så man kan trycka undan det och
   utforska kartan under. */
const SNAPS = [.26, .5, .72, .9];
let sheetFrac = .5;

function setSheet(frac, animate = true){
  if(window.innerWidth >= 900) return;           // på desktop är arket en fast panel
  sheetFrac = Math.min(.92, Math.max(.16, frac));
  sheet.classList.toggle('dragging', !animate);
  sheet.style.height = (sheetFrac * 100) + '%';
}
const snapTo = frac => SNAPS.reduce((a, b) => Math.abs(b - frac) < Math.abs(a - frac) ? b : a);

const handle = document.getElementById('handle');
let drag = null;
handle.addEventListener('pointerdown', e => {
  if(window.innerWidth >= 900) return;
  drag = { y: e.clientY, start: sheetFrac, moved: false, t: Date.now() };
  handle.setPointerCapture(e.pointerId);
});
handle.addEventListener('pointermove', e => {
  if(!drag) return;
  const dy = e.clientY - drag.y;
  if(Math.abs(dy) > 3) drag.moved = true;
  setSheet(drag.start - dy / H, false);
});
function endDrag(e){
  if(!drag) return;
  const quick = Date.now() - drag.t < 250;
  const dy = e.clientY - drag.y;
  let target;
  if(drag.moved && quick && Math.abs(dy) > 24){
    // Snärt: hoppa ett steg i svepets riktning
    const i = SNAPS.indexOf(snapTo(drag.start));
    target = SNAPS[Math.min(SNAPS.length - 1, Math.max(0, i + (dy < 0 ? 1 : -1)))];
  } else if(drag.moved){
    target = snapTo(sheetFrac);
  } else {
    // Rent tryck: växla mellan hopfällt och det läge vyn utgår från
    target = sheetFrac > .35 ? SNAPS[0] : defaultFrac();
  }
  drag = null;
  setSheet(target, true);
  try { handle.releasePointerCapture(e.pointerId); } catch(err){}
}
handle.addEventListener('pointerup', endDrag);
handle.addEventListener('pointercancel', endDrag);
handle.addEventListener('keydown', e => {
  const i = SNAPS.indexOf(snapTo(sheetFrac));
  if(e.key === 'ArrowUp'){ e.preventDefault(); setSheet(SNAPS[Math.min(SNAPS.length - 1, i + 1)]); }
  if(e.key === 'ArrowDown'){ e.preventDefault(); setSheet(SNAPS[Math.max(0, i - 1)]); }
});

// Utgångshöjd per vy: kartan får mest plats där den är poängen
function defaultFrac(){
  if(sheet.classList.contains('detail')) return .72;
  if(sheet.classList.contains('country')) return .5;
  return .5;
}

const tripRow = t => {
  const first = t.stops[0];
  const extra = t.stops.slice(1).map(s => countryName(s.iso)).join(', ');
  return `<button class="trip${t.planned ? ' planned' : ''}" data-trip="${esc(t.id)}">
    <span class="flag">${first ? flagOf(first.iso) : '🏳️'}</span>
    <span><b>${esc(t.title)}${t.planned ? '<span class="tag">Planerad</span>' : ''}${extra ? `<span class="tag side">+ ${esc(extra)}</span>` : ''}</b><small>${span(t.start, t.end)}</small></span>
    ${avs(t.who)}</button>`;
};
/* Fyra tal på en rad. Etiketterna är korta i arket där de ska rymmas bredvid
   varandra, och utskrivna i statistikvyn där det finns plats. */
const statTiles = (s, cls = 'stats') => {
  const long = cls !== 'stats';
  return `<div class="${cls}">
  <div class="stat"><div class="num">${s.countries}</div><span>${long ? 'besökta länder' : 'länder'}</span></div>
  <div class="stat"><div class="num">${s.places}</div><span>platser</span></div>
  <div class="stat"><div class="num">${s.trips}</div><span>resor</span></div>
  <div class="stat"><div class="num">${s.days}</div><span>${long ? 'dagar på resande fot' : 'resdagar'}</span></div></div>`;
};
const seedNote = () => (usingSeed() && !CLOUD.on)
  ? '<p class="example">Exempeldata. Lägg in era egna resor under Resor → Ny resa.</p>' : '';

function renderSheet(){
  sheet.classList.remove('detail', 'country');
  setSheet(.5);
  if(sel){ const t = DB.trips.find(x => x.id === sel); if(t) return renderTrip(t); sel = null; }
  if(selCountry) return renderCountry(selCountry);
  const list = visible(), sorted = [...list].sort(byDateDesc);
  const next = sorted.filter(t => t.planned).sort((a,b) => (a.start||'').localeCompare(b.start||''))[0];
  const past = sorted.filter(t => !t.planned);
  body.innerHTML = statTiles(stats(list)) +
    (next ? `<h2 class="sec">Nästa resa</h2>${tripRow(next)}` : '') +
    `<h2 class="sec">Senaste resor</h2>` +
    (past.length ? past.map(tripRow).join('') : '<p class="example">Inga resor ännu med det här filtret.</p>') +
    seedNote();
}

const ICON = {
  cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  pin:'<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  who:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/></svg>'
};

function renderTrip(t){
  sheet.classList.add('detail'); sheet.classList.remove('country');
  setSheet(.72);
  const stopRow = s => `<div class="stop${s.side ? ' side' : ''}"><span class="flag">${flagOf(s.iso)}</span>
    <b>${esc(countryName(s.iso))}${s.side ? '<span class="tag side">Avstickare</span>' : ''}</b>
    <small>${(s.places||[]).map(p => esc(p.name)).join(', ')}${s.start ? ` · ${span(s.start, s.end)}` : ''}${s.who?.length ? ` · ${s.who.map(personName).join(' och ')}` : ''}</small></div>`;
  const places = t.stops.flatMap(s => (s.places||[]).map(p => p.name));
  body.innerHTML = `<div class="detail">
    <button class="back" data-back>‹ Tillbaka</button>
    <h2><span class="flag">${t.stops[0] ? flagOf(t.stops[0].iso) : '🏳️'}</span>${esc(t.title)}${t.planned ? '<span class="tag">Planerad</span>' : ''}</h2>
    <div class="meta">
      ${ICON.cal}<div>${span(t.start, t.end)} <span style="color:var(--ink-3)">· ${days(t)} dagar</span></div>
      ${ICON.pin}<div>${places.map(esc).join(', ') || '–'}</div>
      ${ICON.who}<div class="who-row">${(t.who||[]).map(p => `<span>${av(p)}${esc(personName(p))}</span>`).join('')}</div>
    </div>
    ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
    <div class="stops">${t.stops.map(stopRow).join('')}</div>
    <div class="actions">
      <button class="btn" data-edit="${esc(t.id)}">Ändra resa</button>
      <button class="btn danger" data-del="${esc(t.id)}">Ta bort</button>
    </div>
    <div class="photos" id="photos" data-tripid="${esc(t.id)}">
      <h3>Bilder <span class="cnt" id="phCnt"></span></h3>
      <div id="phBody"><p class="ph-busy"><span class="spin"></span>Hämtar bilder …</p></div>
    </div>
  </div>`;
  loadPhotos(t.id);
}

/* ---- Galleri ---- */
let phCache = [], phTrip = null;

const addTile = `<button type="button" class="addph" id="phAdd">
  <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 16l5-5 4 4 3-3 6 6M12 2v6M9 5h6"/></svg>
  Lägg till</button>`;

function renderPhotos(){
  const box = document.getElementById('phBody');
  if(!box) return;
  const cnt = document.getElementById('phCnt');
  if(cnt) cnt.textContent = phCache.length ? `${phCache.length} ${phCache.length === 1 ? 'bild' : 'bilder'}` : '';
  box.innerHTML = `<div class="grid-ph">${addTile}${phCache.map((p, i) =>
    `<figure><img src="${p.url}" alt="Bild ${i + 1} från resan" loading="lazy" data-open="${i}">
      <button type="button" class="rm" data-rm="${esc(p.id)}" aria-label="Ta bort bilden">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></figure>`).join('')}</div>
    ${phCache.length ? '' : '<p class="hint">Lägg till några favoriter från resan. Bilderna krymps innan de sparas, så de tar liten plats.</p>'}`;
}

async function loadPhotos(tripId){
  phTrip = tripId; phCache = [];
  try {
    // Lagringen kan tiga still (blockerad IndexedDB i privat läge, nätet borta).
    // Då ska vyn visa något användbart i stället för att stå kvar på "Hämtar …".
    const list = await Promise.race([
      photos.list(tripId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))
    ]);
    if(phTrip !== tripId) return;                 // användaren hann byta resa
    phCache = list;
    renderPhotos();
  } catch(e){
    const box = document.getElementById('phBody');
    if(box) box.innerHTML = `<p class="ph-empty">${
      e.code === 'permission-denied'
        ? 'Firestore-reglerna släpper inte in bilderna än. Uppdatera reglerna enligt docs/firebase.md.'
        : e.message === 'timeout'
          ? 'Bildlagringen svarar inte. Prova att ladda om.'
          : 'Kunde inte hämta bilderna.'
    }</p><div class="grid-ph" style="margin-top:8px">${addTile}</div>`;
  }
}

const phInput = document.getElementById('phInput');
document.addEventListener('click', e => {
  if(e.target.closest('#phAdd')){ phInput.value = ''; phInput.click(); return; }
  const open = e.target.closest('[data-open]');
  if(open){ openViewer(+open.dataset.open); return; }
  const rm = e.target.closest('[data-rm]');
  if(rm){ removePhoto(rm.dataset.rm); return; }
});

phInput.addEventListener('change', async () => {
  const files = [...phInput.files].filter(f => f.type.startsWith('image/'));
  if(!files.length || !phTrip) return;
  const box = document.getElementById('phBody');
  const tripAtStart = phTrip;
  let done = 0, failed = 0;
  const say = () => {
    const el = document.getElementById('phProgress');
    if(el) el.textContent = `Lägger till bild ${done + 1} av ${files.length} …`;
  };
  if(box) box.insertAdjacentHTML('afterbegin',
    `<p class="ph-busy"><span class="spin"></span><span id="phProgress">Lägger till bild 1 av ${files.length} …</span></p>`);
  for(const f of files){
    say();
    try {
      const rec = await photos.add(tripAtStart, f);
      if(phTrip === tripAtStart) phCache.push(rec);
    } catch(err){ failed++; }
    done++;
  }
  if(phTrip === tripAtStart) renderPhotos();
  toast(failed
    ? `${done - failed} av ${files.length} bilder tillagda, ${failed} misslyckades.`
    : done === 1 ? '1 bild tillagd.' : `${done} bilder tillagda.`);
});

async function removePhoto(id){
  if(!await ask('Ta bort bilden?', 'Ta bort')) return;
  try {
    await photos.remove(id);
    phCache = phCache.filter(p => p.id !== id);
    renderPhotos();
    if(!viewerEl.hidden) closeViewer();
    toast('Bilden är borttagen.');
  } catch(e){ toast('Kunde inte ta bort bilden.'); }
}

/* ---- Helskärmsvisning ---- */
const viewerEl = document.getElementById('viewer');
let vIdx = 0;
function openViewer(i){
  if(!phCache[i]) return;
  vIdx = i; viewerEl.hidden = false; paintViewer();
}
function closeViewer(){ viewerEl.hidden = true; }
function paintViewer(){
  const p = phCache[vIdx];
  if(!p) return closeViewer();
  document.getElementById('vImg').src = p.url;
  document.getElementById('vCount').textContent = `${vIdx + 1} / ${phCache.length}`;
  document.getElementById('vPrev').disabled = vIdx === 0;
  document.getElementById('vNext').disabled = vIdx >= phCache.length - 1;
}
const step = d => { vIdx = Math.min(phCache.length - 1, Math.max(0, vIdx + d)); paintViewer(); };
document.getElementById('vClose').onclick = closeViewer;
document.getElementById('vPrev').onclick = () => step(-1);
document.getElementById('vNext').onclick = () => step(1);
document.getElementById('vDel').onclick = () => removePhoto(phCache[vIdx]?.id);
addEventListener('keydown', e => {
  if(viewerEl.hidden) return;
  if(e.key === 'Escape') closeViewer();
  if(e.key === 'ArrowLeft') step(-1);
  if(e.key === 'ArrowRight') step(1);
});
// Svep i sidled
let vx = null;
viewerEl.addEventListener('pointerdown', e => { vx = e.clientX; });
viewerEl.addEventListener('pointerup', e => {
  if(vx === null) return;
  const dx = e.clientX - vx; vx = null;
  if(Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
});

function renderCountry(iso){
  sheet.classList.add('country'); sheet.classList.remove('detail');
  setSheet(.5);
  const home = isHome(iso), groups = stopsIn(iso);
  const places = new Set();
  groups.forEach(({ st }) => (st.places||[]).forEach(p => places.add(p.name)));
  const n = groups.filter(g => !g.t.planned).length;
  const planned = groups.length - n;
  const sum = n
    ? `${n} ${n === 1 ? 'resa' : 'resor'} · ${places.size} ${places.size === 1 ? 'plats' : 'platser'}`
    : planned
      ? `${planned} planerad ${planned === 1 ? 'resa' : 'resor'} – inte varit här än`
      : 'Inget inlagt ännu.';
  body.innerHTML = `<div class="country">
    <button class="back" data-back>‹ Tillbaka</button>
    <h2><span class="flag">${flagOf(iso)}</span>${esc(countryName(iso))}${home ? '<span class="tag home-badge">Hemma</span>' : ''}</h2>
    <p>${sum}${home && DB.home.place ? ` · vi bor i ${esc(DB.home.place.name)}` : ''}</p>
    ${groups.map(({ t, st }) => `<div class="ctrip">
      <div class="hdr"><span><b>${esc(t.title)}</b>${t.planned ? '<span class="tag">Planerad</span>' : ''}${st.side ? '<span class="tag side">Avstickare</span>' : ''}
        <span class="when">${span(stopStart(t, st), stopEnd(t, st))}</span></span>${avs(stopWho(t, st))}</div>
      <ul>${(st.places||[]).map(p => `<li${home ? ' class="home-city"' : ''}><div><b>${esc(p.name)}</b>${p.what ? ` <span>— ${esc(p.what)}</span>` : ''}</div></li>`).join('')}</ul>
      <button class="more" data-trip="${esc(t.id)}">Visa hela resan ›</button>
    </div>`).join('') || '<p class="example">Inga resor hit med det här filtret.</p>'}
  </div>`;
}

document.addEventListener('click', e => {
  const tr = e.target.closest('[data-trip]');
  if(tr){ showTrip(tr.dataset.trip); return; }
  if(e.target.closest('[data-back]')){ clearSel(); return; }
  const ed = e.target.closest('[data-edit]');
  if(ed){ openEditor(ed.dataset.edit); return; }
  const del = e.target.closest('[data-del]');
  if(del){ removeTrip(del.dataset.del); return; }
  const co = e.target.closest('[data-country]');
  if(co){ setTab('karta'); showCountry(co.dataset.country); }
});

function showTrip(id){
  const t = DB.trips.find(x => x.id === id);
  if(!t) return;
  sel = id; selCountry = null; setTab('karta'); drawPins(); renderSheet(); flyTo(t);
}
function showCountry(iso){
  selCountry = iso; sel = null; setTab('karta'); drawPins(); renderSheet(); flyToCountry(iso);
}
async function removeTrip(id){
  const t = DB.trips.find(x => x.id === id);
  if(!t) return;
  if(!await ask(`Ta bort resan "${t.title}"? Det går inte att ångra.`, 'Ta bort')) return;
  DB.trips = DB.trips.filter(x => x.id !== id);
  saveDB(); sel = null;
  if(!editor.hidden) closeEditor();
  refreshAll();
  toast('Resan är borttagen.');
  // Bilderna hör till resan och ska inte bli kvar som skräp
  try { (await photos.list(id)).forEach(p => photos.remove(p.id)); } catch(e){}
}

/* ============================ Vyer ============================ */
function renderViews(){
  const list = visible(), sorted = [...list].sort(byDateDesc);

  const byYear = {};
  sorted.forEach(t => { (byYear[(t.start || '????').slice(0,4)] ??= []).push(t); });
  document.getElementById('view-resor').innerHTML =
    `<div class="viewhead"><h1>Alla resor</h1>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="importTrips">Importera</button>
        <button class="btn primary" id="newTrip">+ Ny resa</button>
      </div></div>` +
    (sorted.length
      ? Object.keys(byYear).sort().reverse().map(y => `<h2 class="sec">${y}</h2>${byYear[y].map(tripRow).join('')}`).join('')
      : '<p class="example">Inga resor ännu. Tryck på “Ny resa”.</p>') + seedNote();

  const s = stats(list);
  const count = id => {
    const c = new Set();
    done(DB.trips).forEach(t => t.stops.forEach(st => {
      if(stopWho(t, st).includes(id) && !isHome(st.iso)) c.add(st.iso);
    }));
    return c.size;
  };
  // Familjen står alltid med; gäster bara när de faktiskt varit någonstans
  const per = [
    ...family().map(p => [p.id, count(p.id)]),
    ...guests().map(p => [p.id, count(p.id)]).filter(x => x[1] > 0).sort((a,b) => b[1] - a[1])
  ];
  const maxC = Math.max(1, ...per.map(x => x[1]));
  const years = {};
  done(list).forEach(t => { const y = (t.start||'????').slice(0,4); years[y] = (years[y]||0) + days(t); });
  const maxY = Math.max(1, ...Object.values(years));
  const longest = [...done(list)].sort((a,b) => days(b) - days(a))[0];
  const cc = {};
  done(list).forEach(t => { const i = t.stops[0]?.iso; if(i && !isHome(i)) cc[i] = (cc[i]||0) + 1; });
  const most = Object.entries(cc).sort((a,b) => b[1] - a[1])[0];
  const newest = (() => {
    const seen = new Set(); let last = '–';
    [...done(DB.trips)].sort((a,b) => (a.start||'').localeCompare(b.start||'')).forEach(t =>
      t.stops.forEach(st => { if(!isHome(st.iso) && !seen.has(st.iso)){ seen.add(st.iso); last = `${countryName(st.iso)} (${(t.start||'').slice(0,4)})`; } }));
    return last;
  })();
  document.getElementById('view-stat').innerHTML = `<h1>Statistik</h1>${statTiles(s, 'grid2')}
    <h2 class="sec">Länder per person</h2><div class="bars">${per.map(([id, n]) =>
      `<div class="bar">${av(id)}<span class="nm">${esc(personName(id))}</span><div class="track"><div class="fill" style="--pc:${personColor(id)};width:${n/maxC*100}%"></div></div><span class="val">${n} ${n === 1 ? 'land' : 'länder'}</span></div>`).join('')}</div>
    <h2 class="sec">Resdagar per år</h2><div class="years">${Object.keys(years).sort().map(y =>
      `<div><span class="v">${years[y]}</span><div class="col" style="height:${years[y]/maxY*70}%"></div><span>${y}</span></div>`).join('') || '<div><span>–</span></div>'}</div>
    <h2 class="sec">Kul att veta</h2><dl class="facts">
      <dt>Längsta resan</dt><dd>${longest ? `${esc(longest.title)}, ${days(longest)} dagar` : '–'}</dd>
      <dt>Flest resor till</dt><dd>${most ? `${esc(countryName(most[0]))} (${most[1]})` : '–'}</dd>
      <dt>Senaste nya landet</dt><dd>${esc(newest)}</dd>
      <dt>Avstickare</dt><dd>${done(list).reduce((n,t) => n + t.stops.filter(x => x.side).length, 0)}</dd>
      <dt>Resor i ${esc(countryName(DB.home?.iso || '752'))}</dt><dd>${done(list).filter(t => t.stops.every(x => isHome(x.iso))).length}</dd>
    </dl>${seedNote()}`;

  const lc = {};
  list.forEach(t => t.stops.forEach(st => {
    if(!inFilter(t, st)) return;
    const o = lc[st.iso] ??= { n: 0, planned: true, last: '' };
    if(!t.planned){ o.n++; o.planned = false; }
    if((t.start||'') > o.last) o.last = t.start || '';
  }));
  const isos = Object.keys(lc).sort((a,b) => lc[b].last.localeCompare(lc[a].last));
  document.getElementById('view-lander').innerHTML =
    `<h1>${isos.filter(i => !lc[i].planned && !isHome(i)).length} länder</h1><div class="clist">` +
    isos.map(i => `<button class="trip${lc[i].planned ? ' planned' : ''}" data-country="${esc(i)}">
      <span class="flag">${flagOf(i)}</span>
      <span><b>${esc(countryName(i))}${lc[i].planned ? '<span class="tag">Planerad</span>' : ''}${isHome(i) ? '<span class="tag home-badge">Hemma</span>' : ''}</b>
      <small>${lc[i].n ? `${lc[i].n} ${lc[i].n === 1 ? 'resa' : 'resor'}, senast ${lc[i].last.slice(0,4)}` : 'inte än'}</small></span><span></span></button>`).join('')
    + '</div>' + (isos.length ? '' : '<p class="example">Inga länder ännu.</p>');

  renderSettings();
}
document.addEventListener('click', e => {
  if(e.target.id === 'newTrip') openEditor(null);
  if(e.target.id === 'importTrips') openImport();
});

/* ============================ Inställningar ============================ */
function renderSettings(){
  document.getElementById('view-settings').innerHTML = `<h1>Inställningar</h1>
    <h2 class="sec">Hemort</h2>
    <p class="subtle">Landet ritas i egen färg och får en hus-markör på orten.</p>
    <div class="field"><label class="fl" for="setHomeName">Ort</label>
      <input type="text" id="setHomeName" value="${esc(DB.home?.place?.name || '')}"></div>
    <div class="row2 field">
      <div><label class="fl" for="setHomeLat">Latitud</label><input type="number" step="0.0001" id="setHomeLat" value="${DB.home?.place?.lat ?? ''}"></div>
      <div><label class="fl" for="setHomeLon">Longitud</label><input type="number" step="0.0001" id="setHomeLon" value="${DB.home?.place?.lon ?? ''}"></div>
    </div>
    <div class="field"><label class="fl" for="setHomeIso">Hemland</label>
      <select id="setHomeIso">${ALL_COUNTRIES.map(c => `<option value="${c.iso}"${c.iso === DB.home?.iso ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <button class="btn" id="saveHome">Spara hemort</button>

    <h2 class="sec">Resenärer</h2>
    <p class="subtle">Familjen är förkryssad på varje ny resa. Övriga kryssas i när de var med.</p>
    <div class="plist" id="plist">${DB.people.map(p => `<div class="prow" data-person="${esc(p.id)}">
      ${av(p.id)}
      <input type="text" value="${esc(p.name)}" data-pname aria-label="Namn">
      <button type="button" class="role" data-toggle-core>${p.core ? 'familj' : 'övrig'}</button>
      <button type="button" class="iconbtn sm" data-rmperson aria-label="Ta bort ${esc(p.name)}">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`).join('')}</div>
    <div class="addp"><input type="text" id="newPerson" placeholder="t.ex. mormor Ingrid" aria-label="Ny resenär">
      <button class="btn ghost" id="addPerson">Lägg till</button></div>
    <div class="actions"><button class="btn" id="savePeople">Spara resenärer</button></div>

    <h2 class="sec">Lagring</h2>
    <p class="subtle">${useCloud()
      ? (CLOUD.on
          ? `Molnläge. Data delas med alla som loggar in – inloggad som <strong>${esc(CLOUD.user?.email || '')}</strong>. Ändringar syns på övriga enheter direkt.`
          : 'Molnläge är påslaget men inloggningen saknas. Ladda om sidan och logga in.')
      : 'Lokalt läge. Data ligger bara i den här webbläsaren. Fyll i <code>data/firebase-config.js</code> för att dela den mellan enheter.'}</p>

    <h2 class="sec">Säkerhetskopia</h2>
    <p class="subtle">Kopiera texten och spara den någonstans, eller klistra in en tidigare kopia för att läsa in den.</p>
    <textarea class="codebox" id="dump" spellcheck="false" aria-label="Data som JSON"></textarea>
    <div class="actions">
      <button class="btn" id="copyDump">Kopiera</button>
      <button class="btn" id="loadDump">Läs in</button>
      <button class="btn ghost" id="resetData">Återställ exempel</button>
    </div>

    ${useCloud() ? '' : `<h2 class="sec">Lösenord</h2>
    <p class="subtle">Sidan är statisk, så lösenordet skyddar mot nyfikna – inte mot någon som läser koden. Skriv ett nytt lösenord för att få raden som ska klistras in i <code>app.js</code>.</p>
    <div class="field"><input type="password" id="newPw" placeholder="Nytt lösenord" autocomplete="new-password" aria-label="Nytt lösenord"></div>
    <button class="btn" id="mkHash">Skapa hash</button>
    <textarea class="codebox" id="hashOut" spellcheck="false" hidden aria-label="Ny hash-rad"></textarea>`}

    <h2 class="sec">Den här enheten</h2>
    <div class="actions" style="margin-top:0">
      <button class="btn ghost" id="logout">Logga ut</button>
      <button class="btn ghost" id="refreshApp">Hämta senaste versionen</button>
    </div>
    <p class="hint">${useCloud() ? 'Loggar ut från familjens konto på den här enheten.' : 'Låser appen igen på den här enheten.'}</p>
    <p class="example">Kartdata: Natural Earth 1:50m via world-atlas (public domain).</p>`;
  const dump = document.getElementById('dump');
  if(dump) dump.value = JSON.stringify(DB, null, 1);
}

document.getElementById('view-settings').addEventListener('click', e => {
  const row = e.target.closest('[data-person]');
  if(row && e.target.closest('[data-toggle-core]')){
    const p = person(row.dataset.person);
    p.core = !p.core; saveDB(); renderSettings(); renderWho(); refreshAll(); setTab('settings');
    return;
  }
  if(row && e.target.closest('[data-rmperson]')){
    const p = person(row.dataset.person);
    const used = DB.trips.filter(t => (t.who||[]).includes(p.id) || t.stops.some(s => (s.who||[]).includes(p.id)));
    ask(used.length
      ? `${p.name} är med på ${used.length} ${used.length === 1 ? 'resa' : 'resor'}. Ta bort ändå?`
      : `Ta bort ${p.name}?`, 'Ta bort').then(ok => {
      if(!ok) return;
      DB.people = DB.people.filter(x => x.id !== p.id);
      DB.trips.forEach(t => {
        t.who = (t.who||[]).filter(x => x !== p.id);
        t.stops.forEach(s => { if(s.who) s.who = s.who.filter(x => x !== p.id); });
      });
      if(filter === p.id) filter = null;
      saveDB(); refreshAll(); setTab('settings');
      toast(`${p.name} är borttagen.`);
    });
    return;
  }
});

document.addEventListener('click', async e => {
  const id = e.target.id;
  if(id === 'refreshApp'){
    toast('Hämtar senaste versionen …');
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map(r => r.unregister()));
    } catch(err){}
    setTimeout(() => location.reload(), 600);
    return;
  }
  if(id === 'addPerson'){
    const inp = document.getElementById('newPerson'), name = inp.value.trim();
    if(!name) return;
    DB.people.push({ id: 'g' + Date.now().toString(36), name, core: false });
    saveDB(); refreshAll(); setTab('settings');
  }
  if(id === 'savePeople'){
    document.querySelectorAll('#plist [data-person]').forEach(row => {
      const p = person(row.dataset.person), v = row.querySelector('[data-pname]').value.trim();
      if(p && v) p.name = v;
    });
    saveDB(); refreshAll(); setTab('settings'); toast('Resenärerna är sparade.');
  }
  if(id === 'saveHome'){
    const name = document.getElementById('setHomeName').value.trim();
    const lat = parseFloat(document.getElementById('setHomeLat').value);
    const lon = parseFloat(document.getElementById('setHomeLon').value);
    DB.home = { iso: document.getElementById('setHomeIso').value,
                place: name && isFinite(lat) && isFinite(lon) ? { name, lat, lon } : null };
    saveDB(); refreshAll(); setTab('settings'); toast('Hemorten är sparad.');
  }
  if(id === 'copyDump'){
    const ta = document.getElementById('dump');
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); toast('Kopierat.'); }
    catch(err){ toast('Markera texten och kopiera den manuellt.'); }
  }
  if(id === 'loadDump'){
    try {
      const d = JSON.parse(document.getElementById('dump').value);
      if(!d || !Array.isArray(d.trips)) throw new Error();
      if(!await ask('Ersätt all data på den här enheten?', 'Ersätt')) return;
      DB = d; saveDB(); refreshAll(); setTab('settings'); toast('Inläst.');
    } catch(err){ toast('Texten är inte giltig data.'); }
  }
  if(id === 'resetData'){
    if(!await ask('Kasta allt och börja om med exempelresorna?', 'Återställ')) return;
    try { localStorage.removeItem(LS_KEY); } catch(err){}
    DB = structuredClone(SEED); refreshAll(); setTab('settings'); toast('Exempeldata återställd.');
  }
  if(id === 'mkHash'){
    const pw = document.getElementById('newPw').value;
    if(!pw) return toast('Skriv ett lösenord först.');
    const out = document.getElementById('hashOut');
    try {
      const h = await derive(pw);
      out.hidden = false;
      out.value = `  hash: '${h}'   // sätt den här raden i AUTH i app.js`;
      out.select();
    } catch(err){ toast('Låset behöver https eller localhost.'); }
  }
  if(id === 'logout'){
    if(CLOUD.on){ try { await CLOUD.mod.auth.signOut(CLOUD.auth); } catch(err){} }
    try { localStorage.removeItem(LS_AUTH); } catch(err){}
    location.reload();
  }
});

/* ============================ Flikar ============================ */
const VIEWS = ['resor', 'stat', 'lander', 'settings'];
function setTab(t){
  tab = t;
  document.querySelectorAll('#tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  VIEWS.forEach(v => document.getElementById('view-' + v).hidden = (v !== t));
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('[role=tab]');
  if(b) setTab(b.dataset.tab);
});
document.getElementById('settingsBtn').onclick = () => setTab(tab === 'settings' ? 'karta' : 'settings');

/* ============================ Redigering ============================ */
const editor = document.getElementById('editor'), edBody = document.getElementById('edBody');
let draft = null, editingId = null, pickTarget = null, changeIsoIndex = null;
let edStep = 'form';      // 'country' = välj land först, 'form' = hela formuläret
let addStopSide = false;  // vilket slags stopp landsteget ska skapa

const blankPlace = () => ({ name: '', lat: null, lon: null, what: '' });
const blankStop = (iso, side = false) => ({ iso, side, places: [blankPlace()] });
function blankTrip(iso){
  const today = new Date().toISOString().slice(0,10);
  return { id: 't' + Date.now().toString(36), title: countryName(iso), start: today, end: today,
           who: family().map(p => p.id), planned: false, note: '', stops: [blankStop(iso)] };
}
// Länder vi redan varit i – snabbval högst upp i landsökningen
function recentCountries(n){
  const seen = [];
  [...DB.trips].sort(byDateDesc).forEach(t => t.stops.forEach(st => {
    if(!seen.includes(st.iso)) seen.push(st.iso);
  }));
  return seen.slice(0, n);
}

function openEditor(id){
  editingId = id;
  const t = id && DB.trips.find(x => x.id === id);
  if(t){
    draft = structuredClone(t);
    draft.stops.forEach(s => { s.places ??= []; if(!s.places.length) s.places.push(blankPlace()); });
    edStep = 'form';
  } else {
    draft = null; edStep = 'country'; addStopSide = false;
  }
  document.getElementById('edTitle').textContent = t ? 'Ändra resa' : 'Ny resa';
  editor.hidden = false;
  renderEditor();
  if(edStep === 'country') setTimeout(() => document.getElementById('cSearch')?.focus(), 60);
}

/* Landsteget: sök bland alla länder, med de senast besökta som snabbval */
function renderCountryStep(q = ''){
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(needle)).slice(0, 40)
    : [];
  const quick = recentCountries(6);
  edBody.innerHTML = `<div class="pickstep">
    <h3>${draft ? 'Vilket land till?' : 'Vart reste ni?'}</h3>
    <p class="lead">Sök på landet. Städer och platser lägger vi in i nästa steg.</p>
    <input type="text" id="cSearch" value="${esc(q)}" placeholder="Sök land …" autocomplete="off" aria-label="Sök land">
    ${!needle && quick.length ? `<div><label class="fl">Varit där förut</label>
      <div class="quick">${quick.map(iso =>
        `<button type="button" data-iso="${iso}">${flagOf(iso)} ${esc(countryName(iso))}</button>`).join('')}</div></div>` : ''}
    <div class="clist-search">${needle
      ? (hits.length
        ? hits.map(c => `<button type="button" class="copt" data-iso="${c.iso}"><span class="flag">${flagOf(c.iso)}</span><b>${esc(c.name)}</b></button>`).join('')
        : '<p class="nores">Inget land matchar. Prova en annan stavning.</p>')
      : ''}</div>
  </div>`;
}
function closeEditor(){ editor.hidden = true; draft = null; editingId = null; }
function edBack(){
  if(edStep === 'country' && draft){ edStep = 'form'; changeIsoIndex = null; return renderEditor(); }
  closeEditor();
}
document.getElementById('edClose').onclick = edBack;
document.getElementById('edCancel').onclick = edBack;

function whoPicker(selected, name){
  const chip = p => `<button type="button" class="chip" data-who="${name}" data-id="${esc(p.id)}" aria-pressed="${selected.includes(p.id)}">${av(p.id)}${esc(p.name)}</button>`;
  const g = guests();
  return `<div class="chips">${family().map(chip).join('')}</div>
    ${g.length ? `<div class="chips" style="margin-top:8px">${g.map(chip).join('')}</div>` : ''}
    <div class="addp"><input type="text" data-newperson="${name}" placeholder="Lägg till någon annan, t.ex. mormor Ingrid" aria-label="Ny resenär">
      <button type="button" class="btn ghost" data-addperson="${name}">Lägg till</button></div>`;
}

function renderEditor(){
  document.getElementById('edSave').hidden = (edStep === 'country');
  document.getElementById('edCancel').textContent = edStep === 'country' ? 'Avbryt' : 'Avbryt';
  if(edStep === 'country') return renderCountryStep(edBody.querySelector('#cSearch')?.value || '');

  edBody.innerHTML = `
    <div class="field"><label class="fl" for="fTitle">Vad kallar vi resan?</label>
      <input type="text" id="fTitle" value="${esc(draft.title)}" placeholder="t.ex. Italien eller Sportlovet i Åre"></div>
    <div class="field"><label class="fl">När var ni där?</label>
      <button type="button" class="datebtn" id="fDates">${draft.start
        ? esc(span(draft.start, draft.end)) + ` <span style="color:var(--ink-3)">· ${days(draft)} ${days(draft) === 1 ? 'dag' : 'dagar'}</span>`
        : '<span class="ph">Välj datum</span>'}</button></div>
    <div class="field"><label class="check"><input type="checkbox" id="fPlanned" ${draft.planned ? 'checked' : ''}> Planerad resa (inte gjord än)</label></div>
    <div class="field"><label class="fl">Vilka var med?</label>${whoPicker(draft.who, 'trip')}</div>
    <div class="field"><label class="fl" for="fNote">Minne från resan</label>
      <textarea id="fNote" placeholder="Vad gjorde vi? Vad var bäst?">${esc(draft.note)}</textarea></div>

    <h2 class="sec">Länder på resan</h2>
    <p class="hint" style="margin-bottom:10px">Första landet är huvudmålet. Lägg till en avstickare för ett land ni bara tog en sväng till – det räknas ändå som besökt land.</p>
    ${draft.stops.map((s, i) => stopCard(s, i)).join('')}
    <div class="actions" style="margin-top:0">
      <button type="button" class="btn ghost" data-addstop="0">+ Land</button>
      <button type="button" class="btn ghost" data-addstop="1">+ Avstickare</button>
    </div>
    ${editingId ? `<div class="actions"><button type="button" class="btn danger" data-del="${esc(editingId)}">Ta bort resan</button></div>` : ''}`;
}

function stopCard(s, i){
  return `<div class="stopcard${s.side ? ' side' : ''}" data-stop="${i}">
    <div class="sc-head">
      <span class="flag">${flagOf(s.iso)}</span>
      <b>${esc(countryName(s.iso))}</b>
      <span class="role">${i === 0 ? 'Huvudmål' : s.side ? 'Avstickare' : 'Land ' + (i+1)}</span>
      ${draft.stops.length > 1 ? `<button type="button" class="iconbtn sm" data-delstop="${i}" aria-label="Ta bort landet">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ''}
    </div>
    <div class="field"><button type="button" class="btn ghost" data-changeiso="${i}" style="width:100%">Byt land</button></div>
    ${i > 0 ? `<div class="field"><label class="check"><input type="checkbox" data-side="${i}" ${s.side ? 'checked' : ''}> Avstickare inom samma resa</label></div>` : ''}
    <div class="field"><label class="check"><input type="checkbox" data-owndate="${i}" ${s.start ? 'checked' : ''}> Egna datum</label></div>
    ${s.start ? `<div class="field"><button type="button" class="datebtn" data-stopdates="${i}">${esc(span(s.start, s.end || s.start))}</button></div>` : ''}
    <div class="field"><label class="check"><input type="checkbox" data-ownwho="${i}" ${s.who?.length ? 'checked' : ''}> Egna deltagare</label></div>
    ${s.who?.length ? `<div class="field">${whoPicker(s.who, 'stop' + i)}</div>` : ''}

    <label class="fl">Platser</label>
    ${(s.places||[]).map((p, j) => placeRow(p, i, j, s.places.length > 1)).join('')}
    <button type="button" class="btn ghost" data-addplace="${i}" style="margin-top:10px">+ Plats</button>
  </div>`;
}

function placeRow(p, i, j, canDelete){
  const has = isFinite(p.lat) && isFinite(p.lon) && p.lat !== null;
  return `<div class="placerow" data-place="${i}.${j}">
    <div class="pr-main">
      <div class="searchwrap">
        <input type="text" data-pname="${i}.${j}" value="${esc(p.name)}" placeholder="Ort, t.ex. Rom" autocomplete="off">
        <div class="results" data-results="${i}.${j}" hidden></div>
      </div>
      <input type="text" data-pwhat="${i}.${j}" value="${esc(p.what)}" placeholder="Vad gjorde vi här?">
      <div class="coord${has ? '' : ' missing'}">${has
        ? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`
        : 'Ingen position – sök på namnet eller peka på kartan'}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button type="button" class="iconbtn sm" data-find="${i}.${j}" aria-label="Sök position">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button>
      <button type="button" class="iconbtn sm" data-pick="${i}.${j}" aria-label="Peka på kartan">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.3"/></svg></button>
      ${canDelete ? `<button type="button" class="iconbtn sm" data-delplace="${i}.${j}" aria-label="Ta bort platsen">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
    </div>
  </div>`;
}

/* Läs tillbaka allt som står i formuläret innan strukturen ändras eller sparas */
function readDraft(){
  if(!draft || editor.hidden || edStep === 'country') return;
  const g = id => document.getElementById(id);
  draft.title = g('fTitle')?.value.trim() ?? draft.title;
  draft.planned = !!g('fPlanned')?.checked;
  draft.note = g('fNote')?.value.trim() ?? draft.note;
  draft.stops.forEach((s, i) => {
    const side = edBody.querySelector(`[data-side="${i}"]`);
    if(side) s.side = side.checked;
    (s.places||[]).forEach((p, j) => {
      const n = edBody.querySelector(`[data-pname="${i}.${j}"]`), w = edBody.querySelector(`[data-pwhat="${i}.${j}"]`);
      if(n) p.name = n.value.trim();
      if(w) p.what = w.value.trim();
    });
  });
}

/* ============================ Kalender ============================
   Årsrad + tre månader i taget. Första klicket sätter start, nästa sätter slut. */
const calEl = document.getElementById('cal');
let calState = null;   // {start, end, year, apply(start,end), title}
const MONTHS = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = ymd(new Date());

function openCal(start, end, title, apply){
  const y = start ? +start.slice(0,4) : new Date().getFullYear();
  calState = { start: start || null, end: end || start || null, year: y, apply, title };
  calEl.hidden = false;
  document.getElementById('calTitle').textContent = title;
  renderCal(start ? +start.slice(5,7) - 1 : new Date().getMonth());
}
function closeCal(){ calEl.hidden = true; calState = null; }

function renderYears(scrollTo){
  const now = new Date().getFullYear(), years = [];
  for(let y = now + 2; y >= now - 40; y--) years.push(y);
  document.getElementById('calYears').innerHTML = years.map(y =>
    `<button type="button" data-year="${y}" aria-pressed="${y === calState.year}">${y}</button>`).join('');
  // Rulla bara fram året när kalendern öppnas. Gör vi det vid varje klick
  // hoppar raden under fingret.
  if(scrollTo){
    const y = document.querySelector('#calYears [aria-pressed="true"]');
    if(y) y.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
}
function markYear(){
  document.querySelectorAll('#calYears [data-year]').forEach(b =>
    b.setAttribute('aria-pressed', String(+b.dataset.year === calState.year)));
}
function renderMonths(focusMonth){
  document.getElementById('calMonths').innerHTML =
    Array.from({ length: 12 }, (_, m) => monthGrid(calState.year, m)).join('');
  if(focusMonth != null){
    const target = document.querySelector(`#calMonths [data-month="${focusMonth}"]`);
    if(target) target.scrollIntoView({ block: 'start' });
  }
  updateCalSum();
}
function renderCal(focusMonth){
  renderYears(true);
  renderMonths(focusMonth != null ? focusMonth : 0);
}

function monthGrid(year, m){
  const firstDay = new Date(year, m, 1);
  const lead = (firstDay.getDay() + 6) % 7;            // måndag först
  const n = new Date(year, m + 1, 0).getDate();
  const { start, end } = calState;
  let cells = '';
  for(let i = 0; i < lead; i++) cells += '<button type="button" class="pad" disabled></button>';
  for(let d = 1; d <= n; d++){
    const key = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isS = key === start, isE = key === end;
    const inside = start && end && key > start && key < end;
    const cls = ['', isS || isE ? 'edge' : '', inside ? 'in' : '',
      isS && isE ? 'one' : isS ? 's' : isE ? 'e' : '', key === todayISO ? 'today' : ''
    ].filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-day="${key}">${d}</button>`;
  }
  return `<div class="month" data-month="${m}"><h4>${MONTHS[m]} ${year}</h4>
    <div class="dow"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
    <div class="days">${cells}</div></div>`;
}
function updateCalSum(){
  const { start, end } = calState;
  const n = start && end ? Math.round((dt(end) - dt(start)) / 864e5) + 1 : 0;
  document.getElementById('calSum').textContent = start
    ? `${span(start, end)} · ${n} ${n === 1 ? 'dag' : 'dagar'}`
    : 'Välj första dagen';
  document.getElementById('calDone').disabled = !start;
}
calEl.addEventListener('click', e => {
  const y = e.target.closest('[data-year]');
  if(y){
    calState.year = +y.dataset.year;
    markYear();
    document.getElementById('calMonths').scrollTop = 0;
    return renderMonths(null);
  }
  const d = e.target.closest('[data-day]');
  if(d){
    const key = d.dataset.day;
    if(!calState.start || calState.end || key < calState.start){ calState.start = key; calState.end = null; }
    else calState.end = key;
    const scroll = document.getElementById('calMonths').scrollTop;
    document.getElementById('calMonths').innerHTML =
      Array.from({length:12}, (_, m) => monthGrid(calState.year, m)).join('');
    document.getElementById('calMonths').scrollTop = scroll;
    updateCalSum();
  }
});
document.getElementById('calClose').onclick = closeCal;
document.getElementById('calDone').onclick = () => {
  if(!calState?.start) return;
  calState.apply(calState.start, calState.end || calState.start);
  closeCal();
  renderEditor();
};

/* ============================ Editorns händelser ============================ */
edBody.addEventListener('click', e => {
  const t = e.target;

  const pickIso = t.closest('[data-iso]');
  if(pickIso){
    const code = pickIso.dataset.iso;
    if(!draft) draft = blankTrip(code);
    else if(changeIsoIndex !== null){ draft.stops[changeIsoIndex].iso = code; changeIsoIndex = null; }
    else draft.stops.push(blankStop(code, addStopSide));
    edStep = 'form';
    return renderEditor();
  }
  const chg = t.closest('[data-changeiso]');
  if(chg){ readDraft(); changeIsoIndex = +chg.dataset.changeiso; edStep = 'country'; renderEditor();
           setTimeout(() => document.getElementById('cSearch')?.focus(), 60); return; }
  const dates = t.closest('#fDates');
  if(dates){
    readDraft();
    return openCal(draft.start, draft.end, 'När var ni där?', (a, b) => { draft.start = a; draft.end = b; });
  }
  const sd = t.closest('[data-stopdates]');
  if(sd){
    readDraft();
    const st = draft.stops[+sd.dataset.stopdates];
    return openCal(st.start || draft.start, st.end || draft.end, 'Datum för ' + countryName(st.iso),
      (a, b) => { st.start = a; st.end = b; });
  }
  const addp = t.closest('[data-addperson]');
  if(addp){
    const name = t.closest('.addp').querySelector('input').value.trim();
    if(!name) return;
    readDraft();
    const id = 'g' + Date.now().toString(36);
    DB.people.push({ id, name, core: false });
    saveDB();
    const which = addp.dataset.addperson;
    const list = which === 'trip' ? (draft.who ??= []) : (draft.stops[+which.slice(4)].who ??= []);
    list.push(id);
    renderWho();
    return renderEditor();
  }

  const chip = t.closest('[data-who]');
  if(chip){
    readDraft();
    const list = chip.dataset.who === 'trip'
      ? (draft.who ??= [])
      : (draft.stops[+chip.dataset.who.slice(4)].who ??= []);
    const i = list.indexOf(chip.dataset.id);
    if(i < 0) list.push(chip.dataset.id); else list.splice(i, 1);
    return renderEditor();
  }
  const addStop = t.closest('[data-addstop]');
  if(addStop){
    readDraft(); addStopSide = addStop.dataset.addstop === '1'; changeIsoIndex = null;
    edStep = 'country'; renderEditor();
    setTimeout(() => document.getElementById('cSearch')?.focus(), 60);
    return;
  }
  const delStop = t.closest('[data-delstop]');
  if(delStop){ readDraft(); draft.stops.splice(+delStop.dataset.delstop, 1); return renderEditor(); }
  const addPlace = t.closest('[data-addplace]');
  if(addPlace){ readDraft(); draft.stops[+addPlace.dataset.addplace].places.push(blankPlace()); return renderEditor(); }
  const delPlace = t.closest('[data-delplace]');
  if(delPlace){
    readDraft();
    const [i, j] = delPlace.dataset.delplace.split('.').map(Number);
    draft.stops[i].places.splice(j, 1);
    return renderEditor();
  }
  const hit = t.closest('[data-hit]');
  if(hit){
    const ref = hit.closest('.results').dataset.results;
    const [i, j] = ref.split('.').map(Number);
    const [lat, lon] = hit.dataset.hit.split(',').map(Number);
    readDraft();
    Object.assign(draft.stops[i].places[j], { lat, lon, name: hit.dataset.name || draft.stops[i].places[j].name });
    clearFormError();
    return renderEditor();
  }
  const find = t.closest('[data-find]');
  if(find){ readDraft(); return searchPlace(find.dataset.find); }
  const pick = t.closest('[data-pick]');
  if(pick){ readDraft(); return startPick(pick.dataset.pick); }
});

edBody.addEventListener('input', e => {
  const pn = e.target.closest('[data-pname]');
  if(pn){
    const ref = pn.dataset.pname, val = pn.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchPlace(ref, val), SEARCH_WAIT);
    return;
  }
  if(e.target.id === 'cSearch'){
    const v = e.target.value, pos = e.target.selectionStart;
    renderCountryStep(v);
    const f = document.getElementById('cSearch');
    f.focus(); f.setSelectionRange(pos, pos);
  }
});

edBody.addEventListener('change', e => {
  const own = e.target.closest('[data-owndate]');
  if(own){
    readDraft();
    const s = draft.stops[+own.dataset.owndate];
    if(own.checked){ s.start = draft.start; s.end = draft.end; } else { s.start = null; s.end = null; }
    return renderEditor();
  }
  const ow = e.target.closest('[data-ownwho]');
  if(ow){
    readDraft();
    const s = draft.stops[+ow.dataset.ownwho];
    s.who = ow.checked ? [...draft.who] : null;
    return renderEditor();
  }
  const side = e.target.closest('[data-side]');
  if(side){ readDraft(); return renderEditor(); }
});

function showFormError(msg, focusSel){
  const box = document.getElementById('edErr');
  box.textContent = msg; box.hidden = false;
  if(focusSel){
    const el = edBody.querySelector(focusSel);
    if(el){ el.closest('.field')?.classList.add('bad'); el.scrollIntoView({ block:'center' }); el.focus?.(); }
  }
}
function clearFormError(){
  document.getElementById('edErr').hidden = true;
  edBody.querySelectorAll('.field.bad').forEach(f => f.classList.remove('bad'));
}

edBody.addEventListener('focusout', e => {
  const pn = e.target.closest('[data-pname]');
  if(!pn) return;
  setTimeout(() => {
    const box = edBody.querySelector(`[data-results="${pn.dataset.pname}"]`);
    if(box && !box.contains(document.activeElement)) box.hidden = true;
  }, 180);
});

document.getElementById('edSave').onclick = () => {
  if(!draft || edStep === 'country') return;
  readDraft();
  clearFormError();
  if(!draft.title) return showFormError('Resan behöver ett namn.', '#fTitle');
  if(!draft.start || !draft.end) return showFormError('Välj datum för resan.', '#fDates');
  if(draft.end < draft.start) return showFormError('Slutdatumet ligger före startdatumet.', '#fDates');
  if(!(draft.who || []).length) return showFormError('Kryssa i minst en som var med.');

  // En plats utan position kan inte ritas på kartan – peka ut vilken det gäller
  const missing = [];
  draft.stops.forEach((st, i) => (st.places||[]).forEach((p, j) => {
    if(p.name && (p.lat === null || !isFinite(p.lat))) missing.push({ i, j, p });
  }));
  if(missing.length){
    const m = missing[0];
    return showFormError(`${m.p.name} saknar position. Tryck på förstoringsglaset för att söka, eller på kartnålen för att peka ut den.`,
      `[data-pname="${m.i}.${m.j}"]`);
  }
  draft.stops = draft.stops
    .map(s => ({ ...s, places: (s.places||[]).filter(p => p.name && isFinite(p.lat) && p.lat !== null) }))
    .filter(s => s.places.length);
  if(!draft.stops.length)
    return showFormError('Lägg till minst en plats – sök på namnet eller peka på kartan.', '[data-pname="0.0"]');
  draft.stops[0].side = false;
  const i = DB.trips.findIndex(t => t.id === draft.id);
  if(i >= 0) DB.trips[i] = draft; else DB.trips.push(draft);
  saveDB();
  const id = draft.id;
  closeEditor();
  sel = id; selCountry = null;
  refreshAll();
  const t = DB.trips.find(x => x.id === id);
  if(t) flyTo(t);
  toast('Resan är sparad.');
};

/* ---- Position: sök eller peka ----
   Två gratiskällor utan konto eller nyckel, frågade parallellt:
   Photon (komoot) är byggd för att söka medan man skriver, Nominatim är bättre på
   öar och regioner ("Korsika"). Träffar i stoppets land hamnar överst, resten
   sorteras bort om landet gav något – det är nästan alltid rätt plats man menar. */
const SEARCH_MIN = 2, SEARCH_WAIT = 450;
let searchTimer = null, searchSeq = 0;

function normPhoton(f){
  const p = f.properties, c = f.geometry?.coordinates;
  if(!c) return null;
  const where = [p.city, p.state, p.country].filter(Boolean).join(', ');
  return { name: p.name || p.city || '', label: where, lat: c[1], lon: c[0],
           cc: (p.countrycode || '').toLowerCase(), kind: p.osm_value || '' };
}
function normNominatim(h){
  return { name: h.name || h.display_name.split(',')[0], label: h.display_name,
           lat: +h.lat, lon: +h.lon,
           cc: (h.address?.country_code || '').toLowerCase(),   // kräver addressdetails=1
           kind: h.type || '' };
}
async function geocode(q, cc){
  const enc = encodeURIComponent(q);
  // Nominatim först: den svarar med svenska namn, så den vinner när båda hittar
  // samma plats och dubbletten sorteras bort nedan.
  const calls = [
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=sv&q=${enc}`
          + (cc ? `&countrycodes=${cc}` : ''))
      .then(r => r.json()).then(d => (d || []).map(normNominatim)),
    fetch(`https://photon.komoot.io/api/?q=${enc}&limit=8`)
      .then(r => r.json()).then(d => (d.features || []).map(normPhoton).filter(Boolean))
  ];
  const settled = await Promise.allSettled(calls);
  if(settled.every(r => r.status === 'rejected')) throw new Error('offline');
  let hits = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Nominatim-träffarna är redan landfiltrerade; Photons filtrerar vi här
  if(cc){
    const inCountry = hits.filter(h => !h.cc || h.cc === cc);
    if(inCountry.length) hits = inCountry;
  }
  const seen = new Set();
  return hits.filter(h => {
    if(!h.name) return false;
    const key = h.lat.toFixed(2) + ',' + h.lon.toFixed(2);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 7);
}

function searchPlace(ref, q){
  const [i, j] = ref.split('.').map(Number);
  const box = edBody.querySelector(`[data-results="${ref}"]`);
  if(!box) return;
  const term = String(q ?? draft.stops[i].places[j].name ?? '').trim();
  if(term.length < SEARCH_MIN){
    box.hidden = true;
    return;
  }
  const cc = (ISO[draft.stops[i].iso]?.[0] || '').toLowerCase();
  const seq = ++searchSeq;
  box.hidden = false;
  box.innerHTML = '<div class="msg">Söker …</div>';
  geocode(term, cc).then(hits => {
    if(seq !== searchSeq) return;
    if(!hits.length){
      box.innerHTML = '<div class="msg">Hittade inget. Peka på kartan istället.</div>';
      return;
    }
    box.innerHTML = hits.map(h =>
      `<button type="button" data-hit="${h.lat},${h.lon}" data-name="${esc(h.name)}">${esc(h.name)}${
        h.kind ? ` <span style="color:var(--ink-3);font-size:12px">${esc(h.kind)}</span>` : ''
      }<small>${esc(h.label)}</small></button>`).join('');
  }).catch(() => {
    if(seq !== searchSeq) return;
    box.innerHTML = '<div class="msg">Ortsökningen blockeras i den här förhandsvisningen, som inte släpper igenom anrop utåt. '
      + 'Tryck på kartnålen och peka ut platsen istället – på den publicerade sajten fungerar sökningen.</div>';
  });
}

function startPick(ref){
  pickTarget = ref;
  const [i, j] = ref.split('.').map(Number);
  const stop = draft.stops[i];
  editor.hidden = true;
  setTab('karta');
  document.getElementById('pickbar').hidden = false;
  document.getElementById('pickText').textContent =
    `Peka ut ${draft.stops[i].places[j].name || 'platsen'} i ${countryName(stop.iso)}.`;
  document.getElementById('map').classList.add('picking');
  // Zooma till landet först – annars ska man träffa rätt på en världskarta
  const b = countryBox(stop.iso);
  if(b){
    const w = b[2] - b[0], h = b[3] - b[1];
    const mx = w > .5 ? w * .12 : 6, my = h > .5 ? h * .12 : 6;
    fitBox(b[0] - mx, b[1] - my, b[2] + mx, b[3] + my, 40, .8);
  }
}
function stopPick(){
  pickTarget = null;
  document.getElementById('pickbar').hidden = true;
  document.getElementById('map').classList.remove('picking');
  editor.hidden = false;
  renderEditor();
}
document.getElementById('pickCancel').onclick = stopPick;
svg.on('click.pick', event => {
  if(!pickTarget) return;
  event.stopPropagation();
  const [x, y] = d3.pointer(event, document.getElementById('world'));
  const ll = proj.invert([x, y]);
  if(!ll) return;
  const [i, j] = pickTarget.split('.').map(Number);
  Object.assign(draft.stops[i].places[j], { lat: +ll[1].toFixed(4), lon: +ll[0].toFixed(4) });
  stopPick();
});

/* ============================ Import från albumnamn ============================
   Google Photos API går inte att använda för det här: sedan 31 mars 2025 kommer
   man bara åt album som appen själv skapat, och delade album ger 403. Men själva
   albumnamnen bär informationen – "Wroclaw 1-4 juni 2023" säger både vart och när.
   Så: klistra in namnen, tolka datum ur texten och slå upp orten. */
const IMON = { jan:0,januari:0,feb:1,februari:1,mar:2,mars:2,apr:3,april:3,maj:4,jun:5,juni:5,
  jul:6,juli:6,aug:7,augusti:7,sep:8,sept:8,september:8,okt:9,oktober:9,nov:10,november:10,dec:11,december:11 };
const IMONRE = Object.keys(IMON).sort((a, b) => b.length - a.length).join('|');
const DASH = '[-–—]';
const p2 = n => String(n).padStart(2, '0');
const ymdParts = (y, m, d) => `${y}-${p2(m + 1)}-${p2(d)}`;
const monOf = t => IMON[t.toLowerCase().replace('.', '')];

// Mest specifika mönstret först, annars snappar ett kortare åt sig fel siffror
const DATE_RULES = [
  [/(\d{4})-(\d{2})-(\d{2})\s*[-–—]\s*(\d{4})-(\d{2})-(\d{2})/,
    m => [`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}-${m[5]}-${m[6]}`]],
  [/(\d{4})-(\d{2})-(\d{2})/, m => [`${m[1]}-${m[2]}-${m[3]}`, `${m[1]}-${m[2]}-${m[3]}`]],
  [new RegExp(`(\\d{1,2})\\s+(${IMONRE})\\.?\\s+(\\d{4})\\s*${DASH}\\s*(\\d{1,2})\\s+(${IMONRE})\\.?\\s+(\\d{4})`, 'i'),
    m => [ymdParts(+m[3], monOf(m[2]), +m[1]), ymdParts(+m[6], monOf(m[5]), +m[4])]],
  [new RegExp(`(\\d{1,2})\\s+(${IMONRE})\\.?\\s*${DASH}\\s*(\\d{1,2})\\s+(${IMONRE})\\.?\\s+(\\d{4})`, 'i'),
    m => [ymdParts(+m[5], monOf(m[2]), +m[1]), ymdParts(+m[5], monOf(m[4]), +m[3])]],
  [new RegExp(`(\\d{1,2})\\s*${DASH}\\s*(\\d{1,2})\\s+(${IMONRE})\\.?\\s+(\\d{4})`, 'i'),
    m => [ymdParts(+m[4], monOf(m[3]), +m[1]), ymdParts(+m[4], monOf(m[3]), +m[2])]],
  [new RegExp(`(\\d{1,2})\\s+(${IMONRE})\\.?\\s+(\\d{4})`, 'i'),
    m => [ymdParts(+m[3], monOf(m[2]), +m[1]), ymdParts(+m[3], monOf(m[2]), +m[1])]],
  [new RegExp(`(${IMONRE})\\.?\\s+(\\d{4})`, 'i'),
    m => { const y = +m[2], M = monOf(m[1]); return [ymdParts(y, M, 1), ymdParts(y, M, new Date(y, M + 1, 0).getDate())]; }]
];

/* Deltagare som initialer sist i namnet: "... -TA" = Tom och Aron.
   Familjen går före gäster; är en bokstav tvetydig bland gästerna hoppas den över.
   Matchar inte alla bokstäver någon person lämnas raden orörd – då var det
   förmodligen inte deltagare utan en del av titeln. */
function parseWho(tail){
  const letters = tail.toUpperCase().split('');
  const ids = [];
  for(const ch of letters){
    const fam = family().filter(p => p.name[0].toUpperCase() === ch);
    if(fam.length === 1){ ids.push(fam[0].id); continue; }
    const g = guests().filter(p => p.name[0].toUpperCase() === ch);
    if(g.length === 1){ ids.push(g[0].id); continue; }
    return null;                       // okänd eller tvetydig bokstav
  }
  return ids.length ? [...new Set(ids)] : null;
}

function parseAlbum(line){
  let s = String(line).trim().replace(/\s+/g, ' ');
  if(!s) return null;

  // Deltagare sist: "-TA" eller "-T A"
  let who = null;
  const wm = s.match(/[-–—]\s*([A-Za-zÅÄÖåäö]{1,6})\s*$/);
  if(wm){
    const ids = parseWho(wm[1].replace(/\s+/g, ''));
    if(ids){ who = ids; s = s.slice(0, wm.index).trim(); }
  }

  let start = null, end = null, used = '', yearOnly = false;
  for(const [re, fn] of DATE_RULES){
    const m = s.match(re);
    if(m){ [start, end] = fn(m); used = m[0]; break; }
  }
  if(!start){
    const m = s.match(/(?:^|\s)((?:19|20)\d{2})(?:\s|$)/);
    if(m){ const y = +m[1]; start = `${y}-01-01`; end = `${y}-12-31`; used = m[1]; yearOnly = true; }
  }

  let rest = (used ? s.replace(used, ' ') : s)
    .replace(/\b(v\.?\s*\d+|vecka\s*\d+)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-–—]+|[\s-–—]+$/g, '')
    .trim();

  // Orter i parentes eller efter kolon: "Kalifornien (San Diego, Los Angeles)"
  let title = rest, names = [];
  const pm = rest.match(/^(.*?)\s*[\(\[]([^)\]]+)[\)\]]\s*(.*)$/);
  const cm = rest.match(/^([^:]+):\s*(.+)$/);
  if(pm){
    title = (pm[1] + ' ' + pm[3]).replace(/\s+/g, ' ').trim();
    names = pm[2].split(/[,;/]|\soch\s/);
  } else if(cm){
    title = cm[1].trim();
    names = cm[2].split(/[,;/]|\soch\s/);
  } else {
    names = [rest];
  }
  names = names.map(x => x.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  title = title.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim() || names[0] || rest;

  return { line: String(line).trim(), title, names, who,
           start, end, yearOnly, hasDate: !!used && !yearOnly };
}

const importer = document.getElementById('importer');
const imBody = document.getElementById('imBody');
let imRows = null, imStep = 'paste';

function openImport(){
  imStep = 'paste'; imRows = null;
  importer.hidden = false;
  renderImport();
  setTimeout(() => document.getElementById('imText')?.focus(), 60);
}
function closeImport(){ importer.hidden = true; imRows = null; }
document.getElementById('imClose').onclick = closeImport;

function renderImport(){
  const err = document.getElementById('imErr');
  err.hidden = true;
  document.getElementById('imTitle').textContent = imStep === 'paste' ? 'Importera resor' : 'Granska innan de läggs in';
  document.getElementById('imBack').textContent = imStep === 'paste' ? 'Avbryt' : 'Tillbaka';
  document.getElementById('imNext').textContent = imStep === 'paste' ? 'Tolka raderna' : 'Lägg in valda';

  if(imStep === 'paste'){
    imBody.innerHTML = `
      <p class="subtle">Klistra in namnen på dina resealbum, ett per rad. Appen läser ut
      datum ur namnet och slår upp orterna på kartan.</p>
      <div class="field"><textarea id="imText" spellcheck="false" placeholder="Wroclaw 1-4 juni 2023
Kalifornien (San Diego, Los Angeles) 12-27 jun 2025
Hamburg 1-3 maj 2026 -TA
Sommar i Grekland juli 2022"></textarea></div>
      <div class="imhelp">
        <p><b>Datum</b> läses var som helst i namnet:<br>
          <code>1-4 juni 2023</code> · <code>28 juni - 3 juli 2024</code> ·
          <code>24 dec 2018 - 2 jan 2019</code> · <code>14 sep 2025</code> ·
          <code>juli 2022</code> (hela månaden) · <code>2023-05-03</code> · bara årtal</p>
        <p><b>Flera orter</b> inom parentes eller efter kolon:<br>
          <code>Kalifornien (San Diego, Los Angeles)</code> ·
          <code>Italien: Rom, Formia</code><br>
          Utan parentes tolkas hela namnet som en enda ort.</p>
        <p><b>Vilka som var med</b> anges med initialer sist, efter ett bindestreck:<br>
          ${family().map(p => `<code>${esc(p.name[0].toUpperCase())}</code> ${esc(p.name)}`).join(' · ')}<br>
          <code>Hamburg 1-3 maj 2026 -TA</code> blir en resa med ${
            family().slice(0, 1).map(p => esc(p.name)).join('')} och ${
            family().slice(2, 3).map(p => esc(p.name)).join('') || 'Aron'}.
          Utan suffix räknas hela familjen.</p>
        <p>Rader utan datum går också bra – de hamnar längst ned och får datum du fyller i själv.</p>
      </div>`;
    return;
  }

  const ok = imRows.filter(r => r.use).length;
  imBody.innerHTML = `
    <p class="imsum">${imRows.length} rader · ${ok} valda${
      imRows.some(r => r.pending) ? ' <span class="spin"></span> slår upp orter …' : ''}</p>
    <div>${imRows.map((r, i) => {
      const bad = !r.places.length;
      return `<label class="imrow${bad ? ' bad' : ''}">
        <input type="checkbox" data-im="${i}" ${r.use ? 'checked' : ''} ${bad ? 'disabled' : ''}>
        <span>
          <span class="who">${r.places.length ? flagOf(r.iso) + ' ' : ''}${esc(r.title || r.line)}${
            r.yearOnly ? '<span class="imbadge warn">bara år</span>' : ''}${
            !r.hasDate && !r.yearOnly ? '<span class="imbadge warn">inget datum</span>' : ''}</span>
          <span class="src">${esc(r.line)}</span>
          <span class="meta2">${r.pending ? 'slår upp …'
            : r.places.length
              ? `${r.places.map(p => esc(p.name)).join(', ')} · ${esc(countryName(r.iso))} · ${span(r.start, r.end)}`
                + (r.who ? ' · ' + r.who.map(personName).join(', ') : '')
                + (r.missing?.length ? ` · hittade inte ${r.missing.map(esc).join(', ')}` : '')
              : `Hittade ingen ort${r.names.length > 1 ? 'erna' : ' med det namnet'} – lägg in för hand i stället.`}</span>
        </span>
      </span></label>`;
    }).join('')}</div>`;
}

imBody.addEventListener('change', e => {
  const cb = e.target.closest('[data-im]');
  if(!cb || !imRows) return;
  imRows[+cb.dataset.im].use = cb.checked;
  const ok = imRows.filter(r => r.use).length;
  const sum = imBody.querySelector('.imsum');
  if(sum) sum.textContent = `${imRows.length} rader · ${ok} valda`;
});

document.getElementById('imBack').onclick = () => {
  if(imStep === 'review'){ imStep = 'paste'; renderImport(); }
  else closeImport();
};

document.getElementById('imNext').onclick = async () => {
  const err = document.getElementById('imErr');
  if(imStep === 'paste'){
    const lines = document.getElementById('imText').value.split('\n').map(x => x.trim()).filter(Boolean);
    if(!lines.length){ err.textContent = 'Klistra in minst en rad.'; err.hidden = false; return; }
    if(lines.length > 200){ err.textContent = 'Max 200 rader åt gången.'; err.hidden = false; return; }
    imRows = lines.map(parseAlbum).filter(Boolean).map(r => ({ ...r, use: false, places: [], iso: null, pending: true }));
    // Rader utan datum sist – de behöver ändå handpåläggning
    imRows.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    imStep = 'review';
    renderImport();
    await lookupRows();
    return;
  }
  // Spara
  const chosen = imRows.filter(r => r.use && r.places.length);
  if(!chosen.length){ err.textContent = 'Kryssa i minst en resa.'; err.hidden = false; return; }
  const today = new Date().toISOString().slice(0, 10);
  chosen.forEach(r => {
    DB.trips.push({
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: r.title || r.places[0].name,
      start: r.start, end: r.end,
      who: r.who && r.who.length ? r.who : family().map(p => p.id),
      planned: r.start > today,
      note: '',
      stops: [{ iso: r.iso, places: r.places.map(p => ({ name: p.name, lat: p.lat, lon: p.lon, what: '' })) }]
    });
  });
  saveDB();
  closeImport();
  refreshAll();
  toast(chosen.length === 1 ? '1 resa inlagd.' : `${chosen.length} resor inlagda.`);
};

/* Slå upp en rad i taget – geokodarna är gratis och ska inte översvämmas */
async function lookupRows(){
  for(const r of imRows){
    r.missing = [];
    const queries = (r.names && r.names.length ? r.names : [r.title]).filter(Boolean);
    for(const q of queries){
      try {
        // Är landet redan känt från en tidigare ort på raden, sök inom det
        const hits = await geocode(q, r.iso ? (ISO[r.iso]?.[0] || '').toLowerCase() : '');
        const hit = hits[0];
        if(hit){
          const iso = isoFromCC(hit.cc) || isoByPosition(hit);
          if(iso){
            r.iso ??= iso;
            r.places.push({ name: hit.name, lat: hit.lat, lon: hit.lon });
          } else r.missing.push(q);
        } else r.missing.push(q);
      } catch(e){ r.missing.push(q); }
      renderImport();
      await new Promise(res => setTimeout(res, 1100));   // Nominatim: max 1/sek
    }
    // Förkryssa bara rader som blev kompletta
    if(r.places.length && r.hasDate && !r.missing.length) r.use = true;
    r.pending = false;
    renderImport();
  }
  renderImport();
}

const CC2ISO = Object.fromEntries(Object.entries(ISO).map(([num, v]) => [v[0].toLowerCase(), num]));
const isoFromCC = cc => cc ? CC2ISO[cc.toLowerCase()] || null : null;

// Photon svarar inte alltid med landskod – fall tillbaka på var punkten hamnar
function isoByPosition(hit){
  const pt = [hit.lon, hit.lat];
  const f = world.features.find(ft => d3.geoContains(ft, pt));
  return f ? f.id : null;
}

/* ============================ Start ============================ */
function refreshAll(){
  renderWho(); drawPins(); renderSheet(); renderViews();
}
function normaliseDB(){
  DB.people ??= structuredClone(SEED.people);
  DB.trips ??= [];
  DB.home ??= structuredClone(SEED.home);
  // Äldre data saknar core-flaggan – då var alla familj
  if(!DB.people.some(p => p.core)) DB.people.forEach(p => { p.core = true; });
}
function start(){
  if(!CLOUD.on) DB = loadDB();
  normaliseDB();
  cloudDot(CLOUD.on ? 'on' : '', CLOUD.on ? 'Synkad med familjens data' : '');
  document.getElementById('brandSub').textContent =
    DB.people.map(p => p.name.split(' ')[0]).slice(0,4).join(', ');
  renderWho(); layout(); renderSheet(); renderViews();
  addEventListener('resize', layout);
}

/* Körs sist: start() rör kartans konstanter, som måste vara initialiserade först.
   Ingen try runt openApp – ett fel där ska synas, inte sväljas. */
function registerSW(){
  if(!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(reloading) return;
    reloading = true;
    location.reload();
  });
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();                       // leta efter ny version vid varje start
      setInterval(() => reg.update(), 60 * 60 * 1000);
    } catch(e){}
  });
}

(async function boot(){
  registerSW();

  if(!useCloud()){
    let unlocked = false;
    try { unlocked = localStorage.getItem(LS_AUTH) === AUTH.hash; } catch(e){}
    if(unlocked) openApp(); else document.getElementById('pw').focus();
    return;
  }

  // Molnläge: Firebase Authentication ersätter lösenordshashen
  document.getElementById('email').hidden = false;
  document.getElementById('pwBtn').textContent = 'Logga in';
  document.getElementById('lockLead').textContent = 'Familjens resor. Logga in för att komma in.';
  cloudDot('', 'Kopplar upp …');
  lockStatus('Kopplar upp …');
  try {
    await cloudInit();
    lockStatus('');
    CLOUD.mod.auth.onAuthStateChanged(CLOUD.auth, async user => {
      if(!user){
        cloudDot('', 'Inte inloggad');
        lockStatus('');
        return;
      }
      CLOUD.user = user; CLOUD.on = true;
      lockStatus('Hämtar familjens resor …');
      try { await cloudFirstSync(); }
      catch(e){
        lockStatus('');
        document.getElementById('pwErr').textContent =
          e.code === 'permission-denied'
            ? 'Kontot har inte behörighet till datat. Kontrollera Firestore-reglerna.'
            : 'Kunde inte hämta datat: ' + (e.code || e.message);
        return;
      }
      lockStatus('');
      if(appEl.hidden) openApp(); else refreshAll();
      cloudWatch();
      cloudDot('on', 'Inloggad som ' + user.email);
    });
  } catch(e){
    document.getElementById('pwErr').textContent = 'Kunde inte ladda Firebase. Kontrollera nätet.';
    cloudDot('off', 'Firebase kunde inte laddas');
  }
})();

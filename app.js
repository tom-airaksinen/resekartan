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
const LS_KEY = 'resekartan.data', LS_AUTH = 'resekartan.unlocked', LS_SEEN = 'resekartan.inloggad', LS_LEGEND = 'resekartan.legend';
const LS_FILTER = 'resekartan.filter';   // vilka resenärer som var valda sist, per enhet
const APP_VERSION = 'v77';   // följ sw.js CACHE, så man ser vad som faktiskt körs

/* ============================ Tema ============================
   Temat är per enhet och ligger i localStorage, inte i DB – Hedvig ska kunna ha
   rosa i sin telefon utan att de andras appar ändras. "Standard" sätter ingen
   data-theme alls, så ljust/mörkt följer systemet precis som förut. Rosa är
   bara ljust och står utanför den mörka media-frågan (se index.html). */
const LS_TEMA = 'resekartan.tema';
const TEMAN = {
  standard: { name: 'Standard', desc: 'Hav, papper och marinblått', color: '#D3E2EA',
              prev: { sea: '#D3E2EA', land: '#EDE9E0', vis: '#2B4F84', surf: '#FBFAF7', acc: '#E4572E' } },
  rosa:     { name: 'Hedvig', desc: 'Rosé och hallon', color: '#F7D9E1',
              prev: { sea: '#F7D9E1', land: '#FFF8F2', vis: '#D6336C', surf: '#FFF6F7', acc: '#E0407A' } }
};
const temaNu = () => { try { const t = localStorage.getItem(LS_TEMA); return TEMAN[t] ? t : 'standard'; } catch(e){ return 'standard'; } };
function setTema(t, save = true){
  if(!TEMAN[t]) t = 'standard';
  if(t === 'standard') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  // Adressfältets färg: en metatagg utan media vinner över de två media-styrda
  let m = document.getElementById('temaColor');
  if(t === 'standard'){ m?.remove(); }
  else {
    if(!m){ m = document.createElement('meta'); m.id = 'temaColor'; m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = TEMAN[t].color;
  }
  if(save){ try { localStorage.setItem(LS_TEMA, t); } catch(e){} }
}
setTema(temaNu(), false);

async function derive(pw){
  if(!crypto?.subtle) throw new Error('nocrypto');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt: enc.encode(AUTH.salt), iterations: AUTH.iter, hash:'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,'0')).join('');
}
const lockEl = document.getElementById('lock'), appEl = document.getElementById('app');
/* Låsskärmen är också startbilden. Formuläret ligger dolt tills vi vet att någon
   faktiskt behöver logga in – annars blinkade ett lösenordsfält förbi vid varje
   start medan Firebase laddades, fast man redan var inloggad sedan tidigare. */
let lockFormShown = false;
function showLockForm(lead){
  if(lockFormShown) return;
  lockFormShown = true;
  document.getElementById('lockForm').hidden = false;
  if(lead) document.getElementById('lockLead').textContent = lead;
  // Bara med mus: på telefonen skulle tangentbordet hoppa upp vid varje start
  if(matchMedia('(hover: hover)').matches) document.getElementById('pw').focus();
}
/* Har den här enheten varit inne i appen förut? Då ska starten vänta tyst i
   stället för att visa ett inloggningsformulär man ändå inte behöver. Tre spår,
   för att en ny flagga är tom första gången och då hade formuläret blinkat
   förbi en sista gång: vår egen flagga, Firebases sparade inloggning, och att
   det redan ligger resor sparade här. */
const sett = () => {
  try {
    if(localStorage.getItem(LS_SEEN) === '1') return true;
    if(localStorage.getItem(LS_KEY)) return true;
    return Object.keys(localStorage).some(k => k.startsWith('firebase:authUser:'));
  } catch(e){ return false; }
};
const setSett = v => { try { v ? localStorage.setItem(LS_SEEN, '1') : localStorage.removeItem(LS_SEEN); } catch(e){} };

/* Texten dyker upp först efter en stund. Går starten fort ser man bara loggan
   och sedan kartan, i stället för tre rader text som hinner avlösa varandra. */
let statusTimer = null;
function lockStatus(text, direkt){
  const box = document.getElementById('pwStatus');
  if(!box) return;
  clearTimeout(statusTimer);
  if(!text){ box.classList.remove('pa'); return; }
  document.getElementById('pwStatusText').textContent = text;
  if(box.classList.contains('pa')) return;      // redan framme, byt bara texten
  // Efter en uppdatering ska texten synas med en gång – då är väntan väntad.
  // Annars 1,2 s: en vanlig start hinner bli klar innan dess, och då syns ingen
  // text alls. Raden tar sin plats oavsett (visibility, inte display), så
  // kortet växer aldrig mitt i starten.
  if(direkt) box.classList.add('pa');
  else statusTimer = setTimeout(() => box.classList.add('pa'), 1200);
}
/* Låsskärmen ligger kvar tills första ritningen är klar. Annars står man en stund
   framför en tom app och undrar om den hängt sig – och kraschar uppstarten blir det
   en tom skärm utan förklaring i stället för ett felmeddelande. */
function openApp(){
  appEl.hidden = false;
  lockStatus('Ritar kartan …');
  // Låt webbläsaren måla laddningstexten innan det tunga arbetet börjar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      start();
      // En notislänk går före den plats man var på innan en uppdatering
      try { if(!oppnaFranAdress()) aterstallPlats(); } catch(e){ console.error('återgång:', e); }
      lockStatus('');
      lockEl.classList.add('klar');
      setTimeout(() => { lockEl.hidden = true; lockEl.classList.remove('klar'); }, 260);
    } catch(e){
      lockStatus('');
      appEl.hidden = true;
      document.getElementById('pwErr').textContent = 'Appen kunde inte starta: ' + (e.message || e);
      const btn = document.getElementById('pwBtn');
      btn.disabled = false;
      btn.textContent = useCloud() ? 'Logga in' : 'Lås upp';
      console.error('start() kraschade:', e);
    }
  }));
}

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

/* Pluppen syns bara när synken strular. En grön prick som alltid lyser säger
   ingenting – läget står ändå under Inställningar → Den här versionen. */
function cloudDot(state, title){
  const el = document.getElementById('cloudDot');
  if(!el) return;
  el.hidden = !(useCloud() && state === 'off');
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
  // Segt nät ska inte betyda oändlig väntan
  const snap = await Promise.race([
    store.getDoc(CLOUD.ref),
    new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 12000))
  ]);
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
      lockStatus('Kopplar upp mot molnet …');
      await cloudInit();
      const { auth } = CLOUD.mod;
      lockStatus('Loggar in …');
      const cred = await auth.signInWithEmailAndPassword(CLOUD.auth, email, pw);
      CLOUD.user = cred.user; CLOUD.on = true; setSett(true);
      lockStatus('Hämtar familjens resor …');
      await cloudFirstSync();
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
  if(!askEl.hidden){
    // Stoppa här: annars stänger samma tangenttryck även det som ligger under
    e.stopImmediatePropagation();
    return closeAsk(false);
  }
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
const days = t => {
  const a = dt(t.start), b = dt(t.end);
  if(isNaN(a) || isNaN(b)) return 0;       // en resa utan datum ska inte bli NaN
  return Math.max(1, Math.round((b - a) / 864e5) + 1);
};
/* ---- Permanentboende ----
   En resa märkt `bo` är en resa som alla andra: den räknas i antal resor, tänder
   landet på kartan och tar med sina platser. Det enda den inte ger är resdagar –
   ett år i Moskva är inte 365 dagar på resande fot.

   Perioderna nycklas på person **och land**. Bodde man i Moskva och åkte en helg
   till Prag var det en riktig resa med riktiga resdagar; en vecka i S:t Petersburg
   under samma år var det inte. Det är den enda gränsdragningen som går att
   förklara i en mening. */
function boendePerioder(){
  const out = new Map();
  DB.trips.forEach(t => {
    if(!t.bo) return;
    t.stops.forEach(st => {
      const a = stopStart(t, st), b = stopEnd(t, st) || a;
      if(!a) return;
      stopWho(t, st).forEach(id => {
        if(!out.has(id)) out.set(id, []);
        out.get(id).push({ iso: st.iso, start: a, end: b });
      });
    });
  });
  return out;
}
const bodde = (perioder, id, isos, dag) =>
  (perioder.get(id) || []).some(b => isos.includes(b.iso) && dag >= b.start && dag <= b.end);

/* Alla kalenderdagar familjen varit borta, som ett set av datum.
   Två skäl att räkna så här i stället för att summera resornas längder:
   åkte två delar av familjen åt olika håll samma vecka var det en vecka borta,
   inte två, och en resa över nyår ska fördelas på rätt år.

   En dag räknas bort först när **alla** som dagen gäller för bodde i landet.
   Hälsar Tom på Karin under hennes termin i Moskva är det tre veckors resa för
   honom, noll för henne – och för "alla resor", där båda räknas, är det ändå en
   dag borta, för Tom var det. */
function travelDays(list){
  const dagar = new Set(), perioder = boendePerioder();
  done(list).forEach(t => {
    if(t.bo) return;
    const a = dt(t.start), b = dt(t.end);
    if(isNaN(a) || isNaN(b) || b < a) return;
    const vilka = filter.size ? [...filter] : (t.who || []);
    const isos = t.stops.map(st => st.iso);
    for(const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)){
      const dag = ymd(d);
      if(vilka.length && vilka.every(id => bodde(perioder, id, isos, dag))) continue;
      dagar.add(dag);
    }
  });
  return dagar;
}
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
/* ---- Länk till resan ----
   En adress till något som hör till resan: ett fotoalbum, en blogg, en dagbok.
   Bara http och https släpps igenom – fältet renderas som en länk, och då får
   inget annat protokoll ta sig in. Saknas protokoll antas https. */
function cleanUrl(v){
  const raw = String(v ?? '').trim();
  if(!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : '';
  } catch(e){ return ''; }
}
const LINK_NAMES = [
  [/^(photos\.google\.com|photos\.app\.goo\.gl|goo\.gl)$/, 'Google Photos'],
  [/^(share\.icloud\.com|www\.icloud\.com|icloud\.com)$/, 'iCloud-album'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)flickr\.com$/, 'Flickr'],
  [/(^|\.)dropbox\.com$/, 'Dropbox'],
  [/(^|\.)(onedrive\.live\.com|1drv\.ms)$/, 'OneDrive'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
];
function linkName(url){
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    for(const [re, namn] of LINK_NAMES) if(re.test(h)) return namn;
    return h;
  } catch(e){ return 'Länk'; }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Går namnet att läsa för oss? Se geocode() – ortsökningen svarade förut med
// ortens eget alfabet när det inte fanns något svenskt eller engelskt namn.
const harLatin = s => /\p{Script=Latin}/u.test(String(s || ''));
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

/* ============================ Urval ============================
   Filtret är en mängd och betyder OCH: väljer man Tom och Karin visas resorna
   där båda var med, inte alla resor där någon av dem var med. Tom mängd = alla. */
let filter = new Set(), tab = 'karta', sel = null, selCountry = null;
let selArsdag = null;       // 'YYYY-MM-DD' när årsdagsvyn är uppe

const inFilter = (t, s) => {
  if(!filter.size) return true;
  const who = stopWho(t, s);
  for(const id of filter) if(!who.includes(id)) return false;
  return true;
};
const visible = () => DB.trips.filter(t => t.stops.some(s => inFilter(t, s)));
const done = list => list.filter(t => !t.planned);
const byDateDesc = (a, b) => (b.start || '').localeCompare(a.start || '');

function stopsIn(iso){
  const out = [];
  visible().forEach(t => t.stops.forEach(st => { if(st.iso === iso && inFilter(t, st)) out.push({ t, st }); }));
  return out.sort((a, b) => byDateDesc(a.t, b.t));
}
/* Fågelvägen från hemorten, storcirkel – inte rutt, utan hur långt bort platsen
   faktiskt ligger. Varje plats räknas en gång även om ni varit där flera gånger. */
const EARTH_KM = 6371;
function distFromHome(lat, lon){
  const h = DB.home?.place;
  if(!h) return null;
  return d3.geoDistance([h.lon, h.lat], [lon, lat]) * EARTH_KM;
}
// Den längsta platsen i varje land. Utan den grupperingen fyller en enda
// långresa hela listan med grannstäder.
function farthest(list, n = 6){
  if(!DB.home?.place) return [];
  const best = new Map();
  done(list).forEach(t => t.stops.forEach(st => {
    if(!inFilter(t, st)) return;
    (st.places || []).forEach(p => {
      const km = distFromHome(p.lat, p.lon);
      if(km == null) return;
      const prev = best.get(st.iso);
      if(!prev || km > prev.km){
        best.set(st.iso, { name: p.name, iso: st.iso, km, year: (t.start || '').slice(0, 4), id: t.id });
      }
    });
  }));
  return [...best.values()].sort((a, b) => b.km - a.km).slice(0, n);
}
const km = v => Math.round(v / 10) * 10 >= 1000
  ? (Math.round(v / 10) * 10).toLocaleString('sv-SE') + ' km'
  : Math.round(v) + ' km';

function stats(list){
  const l = done(list), countries = new Set(), places = new Set();
  l.forEach(t => t.stops.forEach(s => {
    if(!inFilter(t, s)) return;
    if(!isHome(s.iso)) countries.add(s.iso);
    (s.places || []).forEach(p => places.add(p.name));
  }));
  return { countries: countries.size, places: places.size, trips: l.length, days: travelDays(list).size };
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
/* Förhandsbilden är det galleriet visar. Rutorna är drygt hundra punkter breda,
   så 400 px räcker även på en trefaldig skärm – och en resa med tjugo bilder
   väger då några hundra kB i stället för fjorton megabyte. */
const PREV_SIDE = 400, PREV_Q = .7;

function scaleUrl(url, side, q){
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, side / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      res(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

function idb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('resekartan-foton', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains('foton')){
        db.createObjectStore('foton', { keyPath: 'id' }).createIndex('tripId', 'tripId');
      }
      // v2: originalen flyttade hit, så galleriet kan läsa enbart förhandsbilderna
      if(!db.objectStoreNames.contains('bilder')) db.createObjectStore('bilder', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Bildlagringen är öppen i en annan flik.'));
  });
}
async function idbGet(store, id){
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(store).objectStore(store).get(id);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}
async function idbPutIn(store, rec){
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(store, 'readwrite').objectStore(store).put(rec);
    q.onsuccess = () => res();
    q.onerror = () => rej(q.error);
  });
}
async function idbDelFrom(store, id){
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    q.onsuccess = () => res();
    q.onerror = () => rej(q.error);
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
const idbPut = rec => idbPutIn('foton', rec);
const idbDel = id => idbDelFrom('foton', id);

const photoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byOrd = (a, b) => (a.ord ?? 9e9) - (b.ord ?? 9e9) || (a.addedAt || '').localeCompare(b.addedAt || '');

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
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byOrd);
    }
    return (await idbAll(tripId)).sort(byOrd);
  },
  /* Molnets egen diskcache. Finns bilderna där svarar den utan nät. Lokalt
     läge läser redan från disken, så där finns inget att skynda på. */
  async listCached(tripId){
    if(!CLOUD.on) return null;
    const { store } = CLOUD.mod;
    const col = store.collection(CLOUD.db, 'resekartan', 'data', 'foton');
    const snap = await store.getDocsFromCache(store.query(col, store.where('tripId', '==', tripId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byOrd);
  },
  /* Skriver om ordningen efter ett drag. Bilder utan ord är äldre poster och
     sorteras sist tills de fått en plats. */
  async setOrder(list){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      const batch = store.writeBatch(CLOUD.db);
      list.forEach((p, i) => batch.update(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', p.id), { ord: i }));
      await batch.commit();
    } else {
      for(let i = 0; i < list.length; i++) await idbPut({ ...list[i], ord: i });
    }
    list.forEach((p, i) => { p.ord = i; });
  },
  /* Originalet skrivs först. Dör nätet mitt i finns bilden kvar, och posten i
     foton skapas nästa gång – tvärtom hade gett en rad utan bild bakom. */
  async add(tripId, file){
    const { url, w, h } = await shrink(file);
    const prev = await scaleUrl(url, PREV_SIDE, PREV_Q) || url;
    const id = photoId();
    const meta = { tripId, place: null, prev, w, h,
                   addedAt: new Date().toISOString(), addedBy: CLOUD.user?.email || null };
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      await store.setDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'bilder', id), { url });
      await store.setDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', id), meta);
    } else {
      await idbPutIn('bilder', { id, url });
      await idbPut({ id, ...meta });
    }
    return { id, ...meta };
  },
  /* Originalet i full storlek – hämtas bara när någon öppnar bilden. */
  async full(id){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      const d = await store.getDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'bilder', id));
      return d.exists() ? d.data().url : null;
    }
    return (await idbGet('bilder', id))?.url || null;
  },
  /* Flyttar en bild från före v21, där originalet låg i samma post som resten,
     till den nya uppdelningen. En bild i taget: avbryts det halvvägs är den
     bilden antingen flyttad eller orörd, aldrig trasig. */
  async split(p){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      await store.setDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'bilder', p.id), { url: p.url });
      await store.updateDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', p.id),
        { prev: p.prev, url: store.deleteField() });
    } else {
      await idbPutIn('bilder', { id: p.id, url: p.url });
      const { url, ...rest } = p;
      await idbPut(rest);
    }
    delete p.url;
  },
  async remove(id){
    if(CLOUD.on){
      const { store } = CLOUD.mod;
      await store.deleteDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'foton', id));
      await store.deleteDoc(store.doc(CLOUD.db, 'resekartan', 'data', 'bilder', id));
    } else {
      await idbDel(id);
      await idbDelFrom('bilder', id);
    }
  }
};

/* Bilder som lades in före v21 har originalet kvar i sin post. De får en
   förhandsbild i bakgrunden, en i taget, utan att någon behöver vänta. */
const migrating = new Set();
async function migratePhotos(tripId, list){
  const gamla = list.filter(p => p.url && !p.prev && !migrating.has(p.id));
  if(!gamla.length) return;
  gamla.forEach(p => migrating.add(p.id));
  try {
    for(const p of gamla){
      p.prev = await scaleUrl(p.url, PREV_SIDE, PREV_Q);
      if(!p.prev){ delete p.prev; continue; }
      await photos.split(p);
    }
    if(phTrip === tripId) renderPhotos();
  } catch(e){
    // nätet eller lagringen strular – resten tas nästa gång resan öppnas
  } finally { gamla.forEach(p => migrating.delete(p.id)); }
}

/* ============================ Kartan ============================ */
const svg = d3.select('#map'), gWorld = d3.select('#world');
const world = topojson.feature(WORLD, WORLD.objects.countries);

/* ---- Landdelar ----
   Natural Earth ritar Frankrike som **en** yta, och i den ligger Réunion,
   Franska Guyana, Mayotte och Antillerna. Färgar man "Frankrike" färgas allt det
   där med, så en helg i Paris tände öar på andra sidan jorden. Samma sak med
   Nederländernas Karibien, USA:s Alaska och Hawaii, Spaniens Kanarieöar.

   Länder med delar långt från huvudlandmassan delas därför i flera ytor: en
   kärna och en per avlägsen klunga. Sedan färgas bara de delar där man faktiskt
   satt en plupp. Resten av världen ritas som förut, en yta per land – delade vi
   allt skulle antalet paths gå från 240 till flera tusen, och `rescale()` rör
   dem alla vid varje zoomsteg.

   Gränsen är 800 km från huvuddelens **omslutande ruta**, inte från dess mitt.
   Mot mitten mätt ligger Maine 2 500 km från USA:s tyngdpunkt och hade blivit en
   utpost; mot rutan mätt ligger det inuti och Alaska 2 100 km utanför. Korsika
   hamnar 80 km utanför Frankrikes ruta och räknas som kärna, Guadeloupe 6 700. */
const UTPOST_KM = 800;

const kl = (v, a, b) => Math.min(b, Math.max(a, v));
function avstandTillRuta([[w, s], [e, n]], [lon, lat]){
  return d3.geoDistance([kl(lon, w, e), kl(lat, s, n)], [lon, lat]) * EARTH_KM;
}
// Punkten räknas med en grads marginal: en plupp lagd strax utanför kusten hör
// ändå till ön man var på.
function iRuta([[w, s], [e, n]], lon, lat, pad = 1){
  if(lat < s - pad || lat > n + pad) return false;
  return w <= e ? (lon >= w - pad && lon <= e + pad) : (lon >= w - pad || lon <= e + pad);
}

function delaLand(f){
  const g = f.geometry;
  if(g.type !== 'MultiPolygon' || g.coordinates.length < 2) return null;
  // Snabb utgång: ryms landet i ett litet fönster kan ingen del ligga långt bort
  const bb = d3.geoBounds(f);
  if(avstandTillRuta([bb[0], bb[0]], bb[1]) < UTPOST_KM) return null;

  const delar = g.coordinates.map(c => {
    const poly = { type: 'Polygon', coordinates: c };
    return { c, area: d3.geoArea(poly), mitt: d3.geoCentroid(poly), bb: d3.geoBounds(poly) };
  }).sort((a, b) => b.area - a.area);

  const huvud = delar[0];
  const ute = [], karna = [];
  delar.forEach(d => (avstandTillRuta(huvud.bb, d.mitt) > UTPOST_KM ? ute : karna).push(d));
  if(!ute.length) return null;

  // Klustra utposterna, annars blir Guadeloupes öar fem ytor i stället för en
  const klungor = [];
  ute.forEach(d => {
    const k = klungor.find(k => d3.geoDistance(k.mitt, d.mitt) * EARTH_KM <= UTPOST_KM);
    if(k) k.delar.push(d); else klungor.push({ mitt: d.mitt, delar: [d] });
  });
  return [{ namn: 'k', delar: karna }, ...klungor.map((k, i) => ({ namn: 'u' + i, delar: k.delar }))];
}

const KARTDELAR = world.features.flatMap(f => {
  const uppdelat = delaLand(f);
  if(!uppdelat) return [{ id: f.id, key: f.id, karna: true, geometry: f.geometry, bb: d3.geoBounds(f) }];
  return uppdelat.map(x => {
    const geometry = { type: 'MultiPolygon', coordinates: x.delar.map(d => d.c) };
    return { id: f.id, key: f.id + ':' + x.namn, karna: x.namn === 'k', geometry,
             bb: d3.geoBounds({ type: 'Feature', geometry }) };
  });
});
const DELAR = KARTDELAR.reduce((m, d) => m.set(d.id, [...(m.get(d.id) || []), d]), new Map());

/* Vilka delar av landet ska färgas? Den utpost som rymmer plupparna, annars
   kärnan. Ett odelat land, eller ett land utan koordinater alls, färgas helt –
   som förut. */
function aktivaDelar(iso, punkter){
  const delar = DELAR.get(iso);
  if(!delar || delar.length < 2) return null;
  if(!punkter || !punkter.length) return null;
  const traff = new Set();
  punkter.forEach(([lon, lat]) => {
    const u = delar.find(d => !d.karna && iRuta(d.bb, lon, lat));
    traff.add(u ? u.key : iso + ':k');
  });
  return traff;
}
const delFargas = (traff, d) => !traff || traff.has(d.key);
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
  d3.select('#countries').selectAll('path').data(KARTDELAR, d => d.key).join('path')
    .attr('d', d => path(d.geometry)).attr('class', 'land')
    .on('click', (e, d) => { if(pickTarget) return; e.stopPropagation(); showCountry(d.id); });
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
      if(t.id === sel){
        // Den öppnade resan visar varenda ort – det är den man tittar på
        stops.forEach((s, si) => (s.places || []).forEach(p =>
          pins.push({ t, s, p, side: si > 0, city: true })));
        const m = (stops[0].places || [])[0];
        if(m) stops.slice(1).forEach(s => {
          const p = (s.places || [])[0];
          if(p) links.push([m, p]);
        });
        return;
      }
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

  const labelled = selCountry || sel ? pins.filter(q => q.city) : [];
  d3.select('#labels').selectAll('text').data(labelled, key).join('text')
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
  // Både bredden och streckmönstret måste följa zoomen; allt i #world skalas med k
  d3.select('#links').selectAll('path')
    .attr('stroke-width', 1.2 * u).attr('stroke-dasharray', `${3 * u} ${3 * u}`);
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

/* Skalan är relativ: mörkast är alltid det mest besökta landet i den vy man har
   framför sig, ljusast är ett besök. Filtrerar man på en person är det hennes
   fördelning som styr, så tre resor kan vara mörkast för en och ljusast för en
   annan. Absoluta gränser gjorde kartan platt för den som rest mindre.

   Priset är att en nyans inte betyder samma sak hela tiden. Det löses genom att
   teckenförklaringen skriver ut de faktiska talen i stället för att antyda dem.

   Ett besök är sitt eget steg. Det absolut vanligaste är att ha varit i ett
   land en enda gång, och slås den ettan ihop med tvåorna försvinner just den
   skillnad man helst vill se. Resten av spannet fördelas över steg 2–4. */
const HEAT_STEG = 4;
const heatNivå = (n, max) => n <= 1
  ? 1
  : 2 + Math.min(HEAT_STEG - 2, Math.floor((n - 2) / (max - 1) * (HEAT_STEG - 1)));

function legendRamp(max){
  const el = document.getElementById('legRamp');
  if(!el) return;
  el.hidden = !max;
  if(!max) return;
  const grupper = Array.from({ length: HEAT_STEG }, () => []);
  for(let n = 1; n <= max; n++) grupper[heatNivå(n, max) - 1].push(n);
  const rutor = grupper.map((g, i) => g.length ? `<i class="l-v${i + 1}"></i>` : '').join('');
  const tal = grupper.filter(g => g.length)
    .map(g => g[0] === g.at(-1) ? g[0] : `${g[0]}–${g.at(-1)}`).join(' · ');
  el.innerHTML = `Besökt${rutor}<em>${tal} ${max === 1 ? 'resa' : 'resor'}</em>`;
}

function paint(){
  const antal = {}, p = new Set(), gjorda = {}, planerade = {};
  const punkt = (bok, iso, s) => (s.places || []).forEach(pl => {
    if(isFinite(pl.lat) && isFinite(pl.lon)) (bok[iso] ??= []).push([pl.lon, pl.lat]);
  });
  visible().forEach(t => {
    const räknade = new Set();
    t.stops.forEach(s => {
      if(!inFilter(t, s)) return;
      punkt(t.planned ? planerade : gjorda, s.iso, s);
      if(isHome(s.iso)) return;
      if(t.planned){ p.add(s.iso); return; }
      if(räknade.has(s.iso)) return;      // ett land två gånger i samma resa är en resa
      räknade.add(s.iso);
      antal[s.iso] = (antal[s.iso] || 0) + 1;
    });
  });
  // Hemorten hör till hemlandets kärna även om inga resor dit ligger inne
  if(DB.home?.iso && DB.home.place)
    (gjorda[DB.home.iso] ??= []).push([DB.home.place.lon, DB.home.place.lat]);
  Object.keys(antal).forEach(i => p.delete(i));
  const max = Math.max(0, ...Object.values(antal));
  legendRamp(max);
  const cache = new Map();
  const traffar = (bok, iso) => {
    const nyckel = bok === gjorda ? 'g' + iso : 'p' + iso;
    if(!cache.has(nyckel)) cache.set(nyckel, aktivaDelar(iso, bok[iso]));
    return cache.get(nyckel);
  };
  d3.select('#countries').selectAll('path').attr('class', d => {
    const gjort = delFargas(traffar(gjorda, d.id), d);
    const plan = delFargas(traffar(planerade, d.id), d);
    return 'land' + (isHome(d.id) && gjort ? ' home hit' : '')
      + (antal[d.id] && gjort ? ' visited hit v' + heatNivå(antal[d.id], max) : '')
      + (p.has(d.id) && plan ? ' planned hit' : '');
  });
  d3.select('#pins').selectAll('g')
    .classed('active', q => q.t.id === sel).classed('dim', q => sel && q.t.id !== sel);
  rescale();
}

/* Rama in det som är valt, utan att gissa: en öppen resa, ett öppet land, annars
   hela världen. */
function ramaOm(){
  if(sel){
    const t = DB.trips.find(x => x.id === sel);
    if(t) return flyTo(t);
  }
  if(selCountry) return flyToCountry(selCountry);
  resetZoom();
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
/* Tillbaka ska landa där man kom ifrån. Öppnar man en resa ur Resor hamnar man
   på kartan, och då är reselistan det man vill tillbaka till – inte kartans ark.
   Ingen tidig retur här: ett tryck ska alltid rita om, annars kan knappen kännas
   död i lägen där sel råkat nollställas på annat håll. */
/* Arket har en egen historik. Söker man fram ett land, öppnar en av dess resor
   och trycker tillbaka ska man hamna i landet igen – inte i ingenting. Varje
   bildruta minns vad som var öppet och vilken flik man kom från, så vägen
   tillbaka går hela sträckan: resa → land → fliken Länder. */
const nav = [];
const navLika = (a, b) => a.sel === b.sel && a.selCountry === b.selCountry
  && a.selArsdag === b.selArsdag && a.tab === b.tab;

function navPush(){
  const ruta = { sel, selCountry, selArsdag, tab };
  if(nav.length && navLika(nav.at(-1), ruta)) return;
  nav.push(ruta);
  if(nav.length > 20) nav.shift();       // ingen anledning att minnas längre bak
}

/* Ett steg bakåt. Är historiken tom är grundvyn det enda rimliga. */
function goBack(){
  const f = nav.pop();
  if(!f) return clearSel();
  sel = f.sel; selCountry = f.selCountry; selArsdag = f.selArsdag || null;
  drawPins(); renderSheet();
  if(f.selCountry) flyToCountry(f.selCountry);
  else if(f.sel){ const t = DB.trips.find(x => x.id === f.sel); if(t) flyTo(t); else resetZoom(); }
  else resetZoom();
  if(f.tab !== tab) setTab(f.tab);
}

/* Hela vägen ut till grundvyn: används av ett andra tryck på Kartfliken, av ett
   klick på kartan och när filtret ändras. */
function clearSel(){
  nav.length = 0;
  sel = null; selCountry = null; selArsdag = null;
  drawPins(); renderSheet(); resetZoom();
}
svg.on('click', () => { if(!pickTarget) clearSel(); });
// Samma rörelseinställning som resten av kartan
d3.select('#zin').on('click', () => ease(svg).call(zoom.scaleBy, 1.6));
d3.select('#zout').on('click', () => ease(svg).call(zoom.scaleBy, 1/1.6));

/* ---- Svep tillbaka ----
   Ett höger-svep i arket går ett steg bakåt, precis som Tillbaka-knappen.
   Trösklarna är Flippas: riktningen avgörs på tio punkter med 1,3 gångers
   övervikt så en skrollning inte råkar räknas, och svepet måste nå 70 punkter.

   Två saker som är lätta att missa:
   - Beslutet måste kunna tas **vid släppet** också. Ett riktigt snabbt svep kan
     ge noll pointermove, och då hände ingenting alls.
   - Klicket efter svepet måste sväljas, annars öppnar samma rörelse resan man
     svepte över. */
let svepVakt = false;
document.addEventListener('click', e => {
  if(svepVakt){ e.stopPropagation(); e.preventDefault(); }
}, true);

function svepTillbaka(el, garAttGaBak){
  let sx = 0, sy = 0, lx = 0, ly = 0, foljer = false, klart = false, isidled = false;
  const avgor = (x, y) => {
    if(klart) return;
    const dx = x - sx, dy = y - sy;
    if(Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    klart = true;
    isidled = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3;
    if(!isidled) foljer = false;          // uppåt, nedåt eller vänster: inte vår gest
  };
  el.addEventListener('pointerdown', e => {
    if((e.button ?? 0) > 0 || !garAttGaBak()) return;
    sx = lx = e.clientX; sy = ly = e.clientY;
    foljer = true; klart = false; isidled = false;
  });
  el.addEventListener('pointermove', e => {
    if(!foljer) return;
    lx = e.clientX; ly = e.clientY;
    avgor(lx, ly);
  });
  const slut = (x, y) => {
    if(!foljer) return;
    avgor(x, y);                          // hann ingen rörelse avgöra: gör det nu
    const ok = foljer && isidled && (x - sx) > 70 && !phDrag.on;
    foljer = false;
    if(!ok) return;
    svepVakt = true;
    setTimeout(() => { svepVakt = false; }, 400);
    goBack();
  };
  el.addEventListener('pointerup', e => slut(e.clientX, e.clientY));
  // pointercancel = webbläsaren tog gesten. Sista kända läget gäller; cancel-
  // händelsens egna koordinater är inte att lita på.
  el.addEventListener('pointercancel', () => slut(lx, ly));
}
/* Elementet hämtas direkt ur sidan, inte via `body`-konstanten. Den deklareras
   längre ned i filen, och att röra den härifrån gav "Cannot access 'body'
   before initialization" – hela app.js föll, tyst. */
svepTillbaka(document.getElementById('sheetBody'), () => !!(sel || selCountry || selArsdag));

/* ============================ Filter ============================ */
const whoBtn = document.getElementById('whoBtn');
const whoMenu = document.getElementById('whoMenu');

const helaFamiljen = () => {
  const f = family();
  return f.length > 0 && f.length === filter.size && f.every(p => filter.has(p.id));
};
function filterLabel(){
  if(!filter.size) return 'Alla resor';
  if(helaFamiljen()) return 'Hela familjen';
  const names = [...filter].map(personName);
  return names.length <= 2 ? names.join(' och ') : `${names.length} valda`;
}
const TICK = '<span class="tick"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';

/* Filtret ligger kvar på enheten. Hedvig vill se sina egna resor varje gång hon
   öppnar appen, inte familjens gemensamma – och det valet ska hon bara behöva
   göra en gång. Ingen sparad nyckel = aldrig valt, och då gäller hela familjen. */
function sparaFilter(){
  try { localStorage.setItem(LS_FILTER, filter.size ? [...filter].join(',') : 'alla'); } catch(e){}
}
function lasFilter(){
  let v = null;
  try { v = localStorage.getItem(LS_FILTER); } catch(e){}
  filter.clear();
  if(v === 'alla') return;                       // "Alla resor", inget filter
  // Personer kan ha tagits bort sedan valet gjordes; blir inget kvar faller vi
  // tillbaka på hela familjen i stället för på ett tomt filter som betyder allt.
  const ids = (v || '').split(',').filter(id => family().some(p => p.id === id));
  if(ids.length) ids.forEach(id => filter.add(id));
  else family().forEach(p => filter.add(p.id));
}

function renderWho(){
  document.getElementById('whoLabel').textContent = filterLabel();
  /* "Alla resor" och "Hela familjen" är inte samma sak, och det var precis det
     som förvirrade: en resa där bara en av oss var med hör hemma i den första
     men inte i den andra. Väljer man personer gäller och, inte eller – resan
     ska visas bara om alla de valda var med. */
  whoMenu.innerHTML =
    `<button data-p="" aria-pressed="${!filter.size}">Alla resor${TICK}</button>
     <button data-p="*" aria-pressed="${helaFamiljen()}">Hela familjen${TICK}</button><hr>
     <p class="lead">Eller välj vilka som var med</p>` +
    family().map(p => `<button data-p="${esc(p.id)}" aria-pressed="${filter.has(p.id)}">
      ${av(p.id)}${esc(p.name)}${TICK}</button>`).join('');
}
function closeWho(){ whoMenu.hidden = true; whoBtn.setAttribute('aria-expanded', 'false'); }
whoBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = whoMenu.hidden;
  whoMenu.hidden = !open;
  whoBtn.setAttribute('aria-expanded', String(open));
});
whoMenu.addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  e.stopPropagation();
  const id = b.dataset.p;
  if(!id) filter.clear();
  else if(id === '*'){ filter.clear(); family().forEach(p => filter.add(p.id)); }
  else if(filter.has(id)) filter.delete(id);
  else filter.add(id);
  sparaFilter();
  nav.length = 0;                       // historiken hör till det gamla urvalet
  sel = null; selCountry = null;
  renderWho(); drawPins(); renderSheet(); renderViews();
  if(tab === 'karta') resetZoom();      // rör inte kartan när man står i en annan flik
});
document.addEventListener('click', () => { if(!whoMenu.hidden) closeWho(); });
addEventListener('keydown', e => { if(e.key === 'Escape' && !whoMenu.hidden) closeWho(); });

/* ============================ Bottenark ============================ */
const sheet = document.getElementById('sheet'), body = document.getElementById('sheetBody');

/* ---- Dragbart ark ----
   Handtaget såg ut att gå att dra men gjorde bara en toggle. Nu går arket att
   dra fritt och snäpper till närmaste läge, så man kan trycka undan det och
   utforska kartan under. */
const SNAPS = [.26, .5, .72, .9];
let sheetFrac = .5;

function setSheet(frac, animate = true){
  const stage = document.getElementById('stage');
  if(window.innerWidth >= 900){                  // på desktop är arket en fast panel
    stage.style.setProperty('--sheet-h', '0px');
    return;
  }
  sheetFrac = Math.min(.92, Math.max(.16, frac));
  sheet.classList.toggle('dragging', !animate);
  stage.classList.toggle('dragging', !animate);   // förklaringen ska följa fingret utan eftersläp
  sheet.style.height = (sheetFrac * 100) + '%';
  // Teckenförklaringen låg annars bakom arket och syntes aldrig på telefonen
  stage.style.setProperty('--sheet-h', (sheetFrac * 100) + '%');
  // Dras arket högt finns ingen karta kvar att förklara, och rutan skulle
  // annars tränga sig in bakom toppraden
  stage.classList.toggle('sheet-high', sheetFrac > .66);
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

/* ---- Miniatyrer i reselistorna ----
   Resans första bild sparas som en 144 px-kopia på resan själv (`thumb`), inte
   som en uppslagning per rad. Skälet är att listorna annars måste läsa en hel
   bild per resa vid varje start – i molnläge en nedladdning på några hundra kB
   styck – och att raderna nu ritas direkt, utan att vänta på lagringen.
   `thumbOf` är id:t kopian gjordes av, så den vet när omslaget bytts ut. */
/* Liggande 4:3 – rutan i listan är liggande, och det är de flesta resebilder
   också. THUMB_V räknas upp när formatet ändras, så omslag som redan ligger
   sparade görs om nästa gång resan öppnas. */
// v3: omslag gjorda före blankkollen nedan kan vara svarta rutor, och görs om
const THUMB_W = 240, THUMB_H = 180, THUMB_V = 3;

/* En tom canvas sparad som JPEG blir en **svart** ruta, inte en genomskinlig, och
   den ser ut som en riktig bild för allt annat i appen. Det var så ett omslag
   kunde vara kolsvart medan galleriet visade Eiffeltornet.

   Två orsaker till att canvasen blev tom, och båda är åtgärdade här:
   `img.onload` betyder inte att bilden är avkodad – Safari kan rita ingenting
   om man ritar direkt – och en bild utan mått ger `NaN` till `drawImage()`. */
function blank(cv){
  try {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    // Var hundrade bildpunkt räcker för att avgöra om rutan är helsvart
    for(let i = 0; i < d.length; i += 400){
      if(d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8) return false;
    }
    return true;
  } catch(e){ return false; }   // kan inte läsas – anta att den duger
}

async function makeThumb(url){
  if(!url) return null;
  const img = new Image();
  img.src = url;
  // decode() väntar tills bilden går att rita. onload gör inte det i Safari.
  try {
    if(img.decode) await img.decode();
    else await new Promise((ok, nej) => { img.onload = ok; img.onerror = nej; });
  } catch(e){ return null; }
  const bw = img.naturalWidth || img.width, bh = img.naturalHeight || img.height;
  if(!bw || !bh) return null;
  // Beskär mitten, som object-fit:cover gör i rutan
  const s = Math.max(THUMB_W / bw, THUMB_H / bh);
  const w = bw * s, h = bh * s;
  const cv = document.createElement('canvas');
  cv.width = THUMB_W; cv.height = THUMB_H;
  cv.getContext('2d').drawImage(img, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
  // Hellre ingen miniatyr än en svart. Utan omslag visas flaggan, och nästa gång
  // resan öppnas görs ett nytt försök.
  if(blank(cv)) return null;
  return cv.toDataURL('image/jpeg', .6);
}

/* Uppdaterar raderna som redan står på skärmen. Den öppna resedetaljen ritas
   inte om – då skulle galleriet och läsläget hoppa mitt i att man håller på. */
function paintThumbRows(t){
  document.querySelectorAll(`.trip[data-trip="${CSS.escape(t.id)}"]`).forEach(row => {
    const img = row.querySelector('.thumb img');
    if(t.thumb){
      if(img){ img.src = t.thumb; return; }
      const flag = row.querySelector('.flag');
      if(!flag) return;
      const emoji = flag.textContent;
      flag.outerHTML = `<span class="thumb"><img src="${t.thumb}" alt=""></span>`;
      row.querySelector('b')?.insertAdjacentHTML('afterbegin', `<span class="rowflag">${emoji}</span>`);
      row.classList.add('has-thumb');
    } else if(img){
      const emoji = row.querySelector('.rowflag')?.textContent || '🏳️';
      row.querySelector('.rowflag')?.remove();
      row.querySelector('.thumb').outerHTML = `<span class="flag">${emoji}</span>`;
      row.classList.remove('has-thumb');
    }
  });
}

/* Kallas varje gång en resas bilder ändras: efter uppladdning, borttagning,
   omordning och när ett gammalt galleri öppnas första gången. */
async function syncThumb(tripId, list){
  const t = DB.trips.find(x => x.id === tripId);
  if(!t) return;
  const hero = list[0];
  if(!hero){
    if(!t.thumb && !t.thumbOf) return;
    delete t.thumb; delete t.thumbOf; delete t.thumbV;
  } else {
    if(t.thumbOf === hero.id && t.thumb && t.thumbV === THUMB_V) return;
    const url = await makeThumb(hero.prev || hero.url);
    if(!url){
      // Misslyckades försöket och det som ligger inne är från en äldre version
      // kan det vara just en svart ruta. Ta bort den – flaggan är bättre – och
      // låt nästa öppning försöka igen.
      if(!t.thumb || t.thumbV === THUMB_V) return;
      delete t.thumb; delete t.thumbOf; delete t.thumbV;
    } else {
      t.thumb = url; t.thumbOf = hero.id; t.thumbV = THUMB_V;
    }
  }
  saveDB();
  paintThumbRows(t);
}

const tripRow = t => {
  const first = t.stops[0];
  const extra = t.stops.slice(1).map(s => countryName(s.iso)).join(', ');
  const flag = first ? flagOf(first.iso) : '🏳️';
  const th = t.thumb;
  return `<button class="trip${t.planned ? ' planned' : ''}${th ? ' has-thumb' : ''}" data-trip="${esc(t.id)}">
    ${th ? `<span class="thumb"><img src="${th}" alt=""></span>` : `<span class="flag">${flag}</span>`}
    <span><b>${th ? `<span class="rowflag">${flag}</span>` : ''}${esc(t.title)}${t.planned ? '<span class="tag">Planerad</span>' : ''}${extra ? `<span class="tag side">+ ${esc(extra)}</span>` : ''}</b><small>${span(t.start, t.end)}</small></span>
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
/* Topp tre på en rad i Kul att veta. Ettan står i full svärta, tvåan och trean
   dämpade – listan ska kunna läsas som ett svar och inte som en tabell. */
const topp3 = (list, rad) => list.length
  ? `<dd class="top3">${list.map(x => `<span>${rad(x)}</span>`).join('')}</dd>`
  : '<dd>–</dd>';

const seedNote = () => (usingSeed() && !CLOUD.on)
  ? '<p class="example">Exempeldata. Lägg in era egna resor under Resor → Ny resa.</p>' : '';

function renderSheet(){
  sheet.classList.remove('detail', 'country');
  /* Att skriva om innehållet nollställer inte skrollningen – står man nedskrollad
     i reselistan och öppnar en resa därifrån börjar detaljen mitt i, och
     herobilden är avklippt innan man ens hunnit se den. Arket börjar alltid
     överst. */
  body.scrollTop = 0;
  setSheet(.5);
  if(sel){ const t = DB.trips.find(x => x.id === sel); if(t) return renderTrip(t); sel = null; }
  if(selCountry) return renderCountry(selCountry);
  if(selArsdag) return renderArsdag(selArsdag);
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
  who:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/></svg>',
  link:'<svg viewBox="0 0 24 24"><path d="M10 13a4.5 4.5 0 006.4.2l2.6-2.6a4.5 4.5 0 00-6.4-6.4l-1.5 1.5M14 11a4.5 4.5 0 00-6.4-.2L5 13.4a4.5 4.5 0 006.4 6.4l1.5-1.5"/></svg>',
  out:'<svg viewBox="0 0 24 24"><path d="M9 5h10v10M19 5L9.5 14.5M15 14v5H5V9h5"/></svg>'
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
    ${t.thumb ? `<button type="button" class="triphero" id="triphero" data-tripid="${esc(t.id)}"
      data-open="0" aria-label="Öppna bilderna från ${esc(t.title)}">
      <img src="${esc(t.thumb)}" alt="Omslagsbild från ${esc(t.title)}">
      <span class="spin"></span></button>` : ''}
    <h2><span class="flag">${t.stops[0] ? flagOf(t.stops[0].iso) : '🏳️'}</span>${esc(t.title)}${t.planned ? '<span class="tag">Planerad</span>' : ''}${t.bo ? '<span class="tag">Bodde här</span>' : ''}</h2>
    <div class="meta">
      ${ICON.cal}<div>${span(t.start, t.end)} <span style="color:var(--ink-3)">· ${days(t)} dagar${
        t.bo ? ' · räknas inte som resdagar' : ''}</span></div>
      ${ICON.pin}<div>${places.map(esc).join(', ') || '–'}</div>
      ${ICON.who}<div class="who-row">${(t.who||[]).map(p => `<span>${av(p)}${esc(personName(p))}</span>`).join('')}</div>
    </div>
    ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
    ${t.link ? `<a class="triplink" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">
      <span class="ic">${ICON.link}</span>
      <span><b>${esc(linkName(t.link))}</b><small>Öppnas i en ny flik</small></span>
      <span class="ch">${ICON.out}</span></a>` : ''}
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
const kanKlistra = () => true;
/* Rutan är ett helt vanligt redigerbart fält, utan något som dämpar det.
   inputmode="none" och en etikett inuti provades först, och då vägrade iOS visa
   sin Klistra in-meny på långtryck – fältet såg inte ut som något man skriver i.
   Nu ligger etiketten utanför fältet, och fältet innehåller ett osynligt tecken
   så markören har någonstans att stå. */
const ZWSP = '\u200B';
const pasteLabel = `<span class="klistraetikett" aria-hidden="true">
  <svg viewBox="0 0 24 24"><path d="M9 4H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1.2"/></svg>
  Klistra in</span>`;
/* Två lägen. Som knapp: ett tryck frågar urklippet, vilket räcker för
   skärmdumpar och bilder från webben – inget tangentbord, ingen extra bubbla.
   Säger Safari nej blir rutan ett skrivfält och får fokus, så iOS egen
   Klistra in-meny finns på långtryck som andra chans. Tangentbordet kommer
   bara i det läget. */
const pasteTile = `<div class="klistrawrap">
  <div class="klistra" id="phPaste" role="button" tabindex="0"
       aria-label="Klistra in en bild">${ZWSP}</div>${pasteLabel}</div>`;
const aterstallPasteTile = () => {
  const el = document.getElementById('phPaste');
  if(!el) return;
  el.textContent = ZWSP;
  el.removeAttribute('contenteditable');
  el.setAttribute('role', 'button');
};
function oppnaSkrivfalt(el){
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('role', 'textbox');
  el.focus();
}

function renderPhotos(){
  const box = document.getElementById('phBody');
  if(!box) return;
  /* Ritas rutnätet om mitt i ett drag blir rutan man håller i en lös nod som
     inte längre sitter i sidan, och nästa flytt klistrar in den igen bredvid
     sin egen ersättare – då syns samma bild två gånger. Vänta tills draget
     släppts i stället. */
  if(phDrag.on){ phDrag.pending = true; return; }
  phDrag.pending = false;
  const cnt = document.getElementById('phCnt');
  if(cnt) cnt.textContent = phCache.length ? `${phCache.length} ${phCache.length === 1 ? 'bild' : 'bilder'}` : '';
  box.innerHTML = `<div class="grid-ph" id="phGrid">${phCache.map((p, i) =>
    `<figure data-id="${esc(p.id)}"${i === 0 ? ' class="hero"' : ''}>
      <img src="${p.prev || p.url}" alt="Bild ${i + 1} från resan" loading="lazy" data-open="${i}" draggable="false">
      <span class="cover">Omslag</span></figure>`).join('')}${addTile}${kanKlistra() ? pasteTile : ''}</div>
    <p class="hint">${phCache.length > 1
      ? 'Håll på en bild och dra för att flytta den. Den första bilden är omslaget och visas i reselistorna. '
      : phCache.length ? '' : 'Lägg till några favoriter från resan. Bilderna krymps innan de sparas, så de tar liten plats. '}
      Klistra in: skärmdumpar går med ett tryck. Bilder kopierade ur andra appar kräver ett tryck till: håll ner i rutan och välj Klistra in.${
        urklippsInfo ? `<br><span class="urklipp" style="color:var(--danger)">${esc(urklippsInfo)}</span>` : ''}</p>${
        PH_LOG_ON && urklippsInfo && phLog.length ? `<pre id="phLog" class="phlog">${esc(phLog.join('\n'))}</pre>` : ''}`;
}

/* ---- Dra för att ändra ordning ----
   HTML5:s drag and drop finns inte på touch, så ordningen ändras med
   pointer-händelser: på telefonen startar ett långtryck draget, med mus räcker
   det att dra några pixlar. Rör sig fingret innan långtrycket hunnit gå är det
   en skrollning och draget avbryts. */
const phDrag = { fig: null, on: false, armed: false, pending: false, timer: null, pid: null, x0: 0, y0: 0, bx: 0, by: 0, endedAt: 0, överZon: false };

/* ---- Släppzonen ----
   Drar man en bild uppåt dyker en papperskorg upp: antingen släpper man bilden
   på sin nya plats i rutnätet, eller på zonen för att radera den.

   Zonen ligger **fast överst i arket**, inte inskjuten ovanför rutnätet. Har man
   skrollat ned i galleriet hamnar en inskjuten zon utanför skärmen, och under ett
   drag går det inte att skrolla dit – touchmove är avstängd just då. Fast
   placering gör den alltid nåbar, och den ritas ut efter arkets kant så den
   fungerar både i bottenarket och i sidopanelen på desktop. */
const phZon = document.getElementById('phZon');

function stallZon(pa){
  if(!phZon) return;
  if(!pa){ phZon.hidden = true; phZon.classList.remove('over'); return; }
  const r = body.getBoundingClientRect();
  phZon.style.left = Math.round(r.left + 12) + 'px';
  phZon.style.width = Math.round(r.width - 24) + 'px';
  phZon.style.top = Math.round(r.top + 10) + 'px';
  phZon.hidden = false;
  // Framme först efter en bildruta, annars hinner övergången inte synas
  requestAnimationFrame(() => phZon.classList.add('inne'));
}
const iZon = (x, y) => {
  if(!phZon || phZon.hidden) return false;
  const r = phZon.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
const phFigures = () => [...document.querySelectorAll('#phGrid figure')];

function phDragStart(x, y){
  const fig = phDrag.fig;
  if(!fig) return;
  clearTimeout(phDrag.timer);
  phDrag.on = true; phDrag.armed = false; phDrag.överZon = false; phDrag.bx = x; phDrag.by = y;
  fig.classList.add('drag');
  fig.style.transform = 'scale(1.06)';
  try { fig.setPointerCapture(phDrag.pid); } catch(e){}
  navigator.vibrate?.(8);
  stallZon(true);
}
function phDragMove(x, y){
  const fig = phDrag.fig;
  // Rutnätet kan ha ritats om under fingret – då finns rutan inte kvar
  if(!fig.isConnected || !fig.closest('#phGrid')){ phDragReset(); return; }
  fig.style.transform = `translate(${x - phDrag.bx}px, ${y - phDrag.by}px) scale(1.06)`;
  /* Över papperskorgen slutar bilden söka en ny plats i rutnätet. Annars hade
     ordningen ändrats på vägen upp, och ångrar man sig hamnar bilden på fel
     ställe i stället för där den låg. */
  const över = iZon(x, y);
  if(över !== phDrag.överZon){
    phDrag.överZon = över;
    phZon.classList.toggle('over', över);
    fig.classList.toggle('raderas', över);
    if(över) navigator.vibrate?.(12);
  }
  if(över) return;
  // Rutan under fingret: göm den dragna så elementFromPoint ser förbi den
  fig.style.pointerEvents = 'none';
  const over = document.elementFromPoint(x, y)?.closest('#phGrid figure');
  fig.style.pointerEvents = '';
  if(!over || over === fig) return;
  const figs = phFigures();
  if(figs.indexOf(over) > figs.indexOf(fig)) over.after(fig); else over.before(fig);
  // Rutan har landat i sin nya plats – räkna om nollpunkten så den fortsätter
  // följa fingret därifrån i stället för att hoppa
  phDrag.bx = x; phDrag.by = y;
  fig.style.transform = 'scale(1.06)';
  phFigures().forEach((f, i) => f.classList.toggle('hero', i === 0));
}
function phDragReset(){
  stallZon(false);
  if(phDrag.fig){
    phDrag.fig.classList.remove('drag', 'raderas');
    phDrag.fig.style.transform = ''; phDrag.fig.style.pointerEvents = '';
  }
  clearTimeout(phDrag.timer);
  const väntade = phDrag.on && phDrag.pending;
  phDrag.fig = null; phDrag.on = false; phDrag.armed = false; phDrag.överZon = false; phDrag.timer = null;
  if(väntade) renderPhotos();        // omritningen som sköts upp under draget
}
async function phDragEnd(){
  const ids = phFigures().map(f => f.dataset.id);
  const raderas = phDrag.överZon ? phDrag.fig?.dataset.id : null;
  phDragReset();
  phDrag.endedAt = Date.now();
  if(raderas){
    // Rita om från phCache: rutan släpptes på papperskorgen, inte på en plats i
    // rutnätet, så ordningen i sidan säger ingenting. Ångrar man sig ligger
    // bilden kvar där den låg.
    renderPhotos();
    return removePhoto(raderas);
  }
  const byId = new Map(phCache.map(p => [p.id, p]));
  const next = ids.map(id => byId.get(id)).filter(Boolean);
  // Stämmer inte rutorna med bilderna vi har är sidan ur synk. Rita om från
  // bilderna i stället för att spara en ordning som kan vara fel.
  if(next.length !== ids.length || next.length !== phCache.length){ renderPhotos(); return; }
  if(next.every((p, i) => p.id === phCache[i].id)){ if(phDrag.pending) renderPhotos(); return; }
  phCache = next;
  renderPhotos();
  try { await photos.setOrder(phCache); }
  catch(e){ toast('Kunde inte spara ordningen.'); }
  const trip = phTrip;
  await syncThumb(trip, phCache);
  await visaHero(trip, phCache);
}
// iOS visar annars sin egen Dela/Spara-meny när man håller på en bild, och då
// går ordningen inte att ändra. -webkit-touch-callout i index.html tar hand om
// resten; den här fångar högerklick och de fall där menyn ändå försöker fram.
document.addEventListener('contextmenu', e => { if(e.target.closest?.('#phGrid figure')) e.preventDefault(); });
document.addEventListener('pointerdown', e => {
  const fig = e.target.closest?.('#phGrid figure');
  if(!fig || e.button > 0) return;
  phDragReset();
  phDrag.fig = fig; phDrag.pid = e.pointerId; phDrag.x0 = e.clientX; phDrag.y0 = e.clientY;
  if(e.pointerType === 'mouse') phDrag.armed = true;
  else phDrag.timer = setTimeout(() => phDragStart(e.clientX, e.clientY), 260);
});
document.addEventListener('pointermove', e => {
  if(!phDrag.fig) return;
  if(phDrag.on){ phDragMove(e.clientX, e.clientY); return; }
  const far = Math.hypot(e.clientX - phDrag.x0, e.clientY - phDrag.y0);
  if(phDrag.armed){ if(far > 5) phDragStart(e.clientX, e.clientY); }
  else if(far > 8) phDragReset();          // fingret skrollar, inte drar
});
document.addEventListener('pointerup', () => { if(phDrag.on) phDragEnd(); else phDragReset(); });
document.addEventListener('pointercancel', phDragReset);
// Pointer-händelser stoppar inte skrollningen på touch – det gör bara den här
document.addEventListener('touchmove', e => { if(phDrag.on) e.preventDefault(); }, { passive: false });

async function loadPhotos(tripId){
  phTrip = tripId; phCache = [];
  const visa = list => {
    if(phTrip !== tripId) return;                 // användaren hann byta resa
    phCache = list;
    renderPhotos();
    // syncThumb först: den skapar omslaget, och visaHero läser det. Kördes de i
    // andra ordningen fick en resa vars miniatyr görs vid första öppningen
    // ingen herobild förrän man öppnat den en gång till.
    syncThumb(tripId, list)       // fyller också i omslaget för gallerier från före v19
      .then(() => visaHero(tripId, list));
    migratePhotos(tripId, list);  // och delar upp bilder som lades in före v21
  };
  /* Molnets diskcache först. Den svarar direkt och funkar på dåligt nät, så
     galleriet står inte och snurrar medan servern funderar. Servern får sedan
     komma ikapp i bakgrunden. */
  let ur_cache = false;
  try {
    const c = await photos.listCached(tripId);
    if(c?.length){ ur_cache = true; visa(c); }
  } catch(e){}
  try {
    // Lagringen kan tiga still (blockerad IndexedDB i privat läge, nätet borta).
    // Då ska vyn visa något användbart i stället för att stå kvar på "Hämtar …".
    const list = await Promise.race([
      photos.list(tripId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))
    ]);
    visa(list);
  } catch(e){
    if(ur_cache) return;                          // vi visar redan bilderna
    // Herobilden ska inte stå och snurra för alltid för att galleriet strulade
    document.getElementById('triphero')?.classList.add('skarp');
    const box = document.getElementById('phBody');
    if(phTrip !== tripId || !box) return;
    box.innerHTML = `<p class="ph-empty">${
      e.code === 'permission-denied'
        ? 'Firestore-reglerna släpper inte in bilderna än. Uppdatera reglerna enligt docs/firebase.md.'
        : e.message === 'timeout'
          ? 'Bildlagringen svarar inte just nu.'
          : 'Kunde inte hämta bilderna.'
    }</p>
    <div class="actions" style="margin-top:10px"><button class="btn" id="phRetry">Försök igen</button></div>
    <div class="grid-ph" style="margin-top:12px">${addTile}</div>`;
  }
}

/* Herobilden skärps i två steg. Miniatyren som ligger på resan (~5 kB) ritas
   direkt, uppskalad och suddig, så rutan aldrig står tom och sidan inte hoppar.
   Sedan byts den mot galleriets förhandsbild på 400 px – den är redan hämtad –
   och till sist mot originalet på 1400 px, som hämtas först när galleriet är
   uppritat så det inte konkurrerar med det man faktiskt tittar på. */
/* Herobilden ska följa bilderna, inte bara resans första ritning. Raderade man
   omslaget låg det kvar stort i detaljvyn, och laddade man upp nya bilder till
   en resa som saknat omslag dök ingen hero upp förrän man öppnat resan på nytt.
   Anropas därför efter varje ändring, och skapar eller tar bort rutan själv. */
async function visaHero(tripId, list){
  if(sel !== tripId) return;                      // en annan resa står öppen
  const detalj = body.querySelector('.detail');
  if(!detalj) return;
  const t = DB.trips.find(x => x.id === tripId);
  let box = document.getElementById('triphero');
  const p = list[0];
  if(!p || !t?.thumb){ box?.remove(); return; }    // inga bilder kvar
  if(!box){
    detalj.querySelector('.back')?.insertAdjacentHTML('afterend',
      `<div class="triphero" id="triphero" data-tripid="${esc(tripId)}">
        <img src="${esc(t.thumb)}" alt="Omslagsbild från ${esc(t.title)}"><span class="spin"></span></div>`);
    box = document.getElementById('triphero');
  } else if(box.querySelector('img').getAttribute('src') !== t.thumb){
    // Omslaget har bytts – börja om från miniatyren i stället för att låta den
    // gamla bilden stå kvar tills originalet hunnit fram
    box.classList.remove('skarp');
    box.querySelector('img').src = t.thumb;
  }
  skarpHero(tripId, list);
}

async function skarpHero(tripId, list){
  const box = document.getElementById('triphero');
  if(!box || box.dataset.tripid !== tripId) return;
  const img = box.querySelector('img'), p = list[0];
  if(!p){ box.remove(); return; }                 // sista bilden togs bort
  const byt = async url => {
    if(!url) return;
    const n = new Image();
    n.src = url;
    try { await n.decode(); } catch(e){ return; }
    if(!img.isConnected || box.dataset.tripid !== tripId) return;
    img.src = url;
  };
  await byt(p.prev || p.url);
  box.classList.add('skarp');
  const full = () => loadFull(p).then(byt).catch(() => {});
  if(p.url || fullCache.has(p.id)) full();
  else setTimeout(() => { if(box.dataset.tripid === tripId) full(); }, 500);
}

const phInput = document.getElementById('phInput');
document.addEventListener('click', e => {
  if(e.target.closest('#phAdd')){ phInput.value = ''; phInput.click(); return; }
  if(e.target.closest('#phPaste')){ klistraIn(); return; }
  if(e.target.closest('#phRetry')){
    const box = document.getElementById('phBody');
    if(box) box.innerHTML = '<p class="ph-busy"><span class="spin"></span>Hämtar bilder …</p>';
    loadPhotos(phTrip);
    return;
  }
  const open = e.target.closest('[data-open]');
  if(open){ if(Date.now() - phDrag.endedAt > 300) openViewer(+open.dataset.open); return; }
});

phInput.addEventListener('change', () => laggTillBilder([...phInput.files]));

async function laggTillBilder(valda){
  logga(`laggTillBilder: ${valda.length} st, typer ${valda.map(f => f.type || '?').join(',')}`);
  const files = valda.filter(f => f.type.startsWith('image/'));
  if(!files.length || !phTrip) return logga('laggTillBilder avbryter: inga bildfiler eller ingen resa');
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
      logga('bild sparad');
    } catch(err){ failed++; logga('sparning fel: ' + (err.message || err)); }
    done++;
  }
  if(phTrip === tripAtStart) renderPhotos();
  await syncThumb(tripAtStart, phCache);
  await visaHero(tripAtStart, phCache);
  toast(failed
    ? `${done - failed} av ${files.length} bilder tillagda, ${failed} misslyckades.`
    : done === 1 ? '1 bild tillagd.' : `${done} bilder tillagda.`);
}

/* ---- Klistra in en bild ----
   Bra när bilden finns i ett delat album men inte på telefonen: kopiera den där
   och klistra in här, i stället för att spara ner den till kamerarullen först. */
const galleriOppet = () => !!phTrip && !!document.getElementById('phBody')
  && editor.hidden && importer.hidden && viewerEl.hidden;

/* En bild kan komma in på fyra sätt, och Safari väljer inte samma som andra:
   som fil, som en adress i text/html, eller genom att webbläsaren själv lägger
   in en <img> i rutan. Alla fyra hanteras, annars fungerar det på datorn men
   inte på telefonen. */
async function filFranUrl(url, namn = 'urklipp'){
  logga('hämtar ' + url.slice(0, 40));
  const res = await fetch(url);                 // blob: och data: går bra
  const blob = await res.blob();
  logga(`hämtat ${blob.type || '(ingen typ)'} ${Math.round(blob.size / 1024)} kB`);
  if(!blob.type.startsWith('image/')) return null;
  return new File([blob], namn, { type: blob.type });
}
const imgSrcUrHtml = html => html.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;

/* ---- Felsökningslogg för inklistring ----
   Varje steg skrivs till en synlig logg under rutnätet. Inklistring på iPhone
   går inte att felsöka i blindo, och en toast hinner försvinna innan man läst
   den. Loggen tas bort när det fungerar. */
const PH_LOG_ON = false;      // slå på vid felsökning – skriver varje steg under rutnätet
const phLog = [];
function logga(txt){
  if(!PH_LOG_ON) return;
  const t = new Date();
  phLog.push(`${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')} ${txt}`);
  if(phLog.length > 14) phLog.shift();
  let el = document.getElementById('phLog');
  if(!el){
    if(!urklippsInfo) return;                 // loggen visas först när något gått fel
    const hint = document.querySelector('#phBody .hint');
    if(!hint) return;
    hint.insertAdjacentHTML('afterend', '<pre id="phLog" class="phlog"></pre>');
    el = document.getElementById('phLog');
  }
  el.textContent = phLog.join('\n');
}
const beskrivDT = d => d
  ? `typer[${[...(d.types || [])].join(',')}] filer=${d.files?.length ?? '?'} items=${d.items?.length ?? '?'}`
    + (d.items ? ' ' + [...d.items].map(i => `${i.kind}:${i.type}`).join(',') : '')
  : 'ingen dataTransfer';
addEventListener('error', e => logga('FEL ' + (e.message || e.error?.message || '?')));
addEventListener('unhandledrejection', e => logga('FEL (promise) ' + (e.reason?.message || e.reason?.name || e.reason)));

/* Vad urklippet faktiskt innehöll, i klartext under rutnätet. Inklistring beter
   sig olika i olika webbläsare och går inte att felsöka i blindo. */
let urklippsInfo = '';
/* Skriv raden direkt i hjälptexten. Att rita om galleriet här skulle slita bort
   rutan användaren just står i, mitt under inklistringen. */
function visaUrklipp(txt){
  urklippsInfo = txt;
  const h = document.querySelector('#phBody .hint');
  if(!h) return;
  h.querySelector('.urklipp')?.remove();
  if(txt) h.insertAdjacentHTML('beforeend',
    `<br><span class="urklipp" style="color:var(--danger)">${esc(txt)}</span>`);
  if(PH_LOG_ON && txt && phLog.length && !document.getElementById('phLog'))
    h.insertAdjacentHTML('afterend', `<pre id="phLog" class="phlog">${esc(phLog.join('\n'))}</pre>`);
}
// Vad som blev kvar i rutan, utan det osynliga tecknet och utan råmarkup
const rutansInnehall = el => [...el.childNodes]
  .map(n => n.nodeType === 1 ? `<${n.nodeName.toLowerCase()}>` : n.textContent.replaceAll(ZWSP, '').trim())
  .filter(Boolean).join(' ').slice(0, 60);

/* clipboard.read() körs på alla enheter, även pekskärm. Det var så det fungerade
   i v43: ett tryck på rutan, Safari visar sin Paste-bubbla, ett tryck på den och
   bilden kommer. I v47 stängde jag av det på pekskärm utifrån en felaktig teori,
   och tog därmed bort den enda väg som någonsin fungerat på iPhone. Långtryck i
   fältet finns kvar som andra väg, men den är inte huvudvägen. */
async function klistraIn(){
  if(!galleriOppet()) return;
  const el = document.getElementById('phPaste');
  // Redan i skrivfältsläge: låt iOS sköta trycket, fråga inte urklippet igen
  if(el?.isContentEditable){ logga('tryck i skrivfältsläge – lämnar till systemet'); return; }
  logga(`tryck · galleri=${galleriOppet()} · read=${typeof navigator.clipboard?.read}`);
  const filer = [], spar = [];
  try {
    logga('read startar');
    const poster = await (navigator.clipboard?.read?.() ?? []);
    logga(`read klar: ${poster.length} poster`);
    for(const post of poster){
      spar.push(post.types.join('+') || '(utan typer)');
      logga('post: ' + (post.types.join(',') || '(utan typer)'));
      const typ = post.types.find(t => t.startsWith('image/'));
      if(typ){
        filer.push(new File([await post.getType(typ)], 'urklipp', { type: typ }));
        continue;
      }
      /* Safari på iPhone lämnar ut en post utan typer för bilder från andra
         appar. Prova att be om vanliga typer ändå – enligt specen ska det
         kasta, men det kostar inget att fråga. */
      if(!post.types.length){
        for(const t of ['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'image/webp', 'text/html']){
          try {
            const blob = await post.getType(t);
            logga(`getType(${t}) gav ${blob.type || '?'} ${Math.round(blob.size / 1024)} kB`);
            if(t.startsWith('image/') && blob.size){ filer.push(new File([blob], 'urklipp', { type: blob.type || t })); break; }
            if(t === 'text/html'){
              const src = imgSrcUrHtml(await blob.text());
              const f = src && await filFranUrl(src).catch(() => null);
              if(f){ filer.push(f); break; }
            }
          } catch(e){ logga(`getType(${t}): ${e.name}`); }
        }
        continue;
      }
      // Safari lämnar ibland bara ut bilden som en adress i html
      if(post.types.includes('text/html')){
        const src = imgSrcUrHtml(await (await post.getType('text/html')).text());
        const f = src && await filFranUrl(src).catch(() => null);
        if(f) filer.push(f);
      }
    }
  } catch(e){ spar.push('fel: ' + e.name); logga(`read fel: ${e.name} ${e.message || ''}`); }
  logga(`read gav ${filer.length} bild(er)`);
  if(filer.length){ urklippsInfo = ''; aterstallPasteTile(); return laggTillBilder(filer); }
  /* Typlös post = bild kopierad ur en annan app, som Google Photos. Safari
     lämnar inte ut den till sidan, men iOS egen inklistring på långtryck gör det
     – bekräftat på telefon 2026-09-18, fungerar varje gång. */
  visaUrklipp(spar.some(x => x === '(utan typer)')
    ? 'Håll ner i rutan och välj Klistra in.'
    : 'Urklippet innehöll ingen bild.');
  if(el) oppnaSkrivfalt(el);      // andra chansen: iOS egen meny på långtryck
}

/* Webbläsaren la in bilden i rutan i stället för att skicka den som fil.
   Plocka upp den därifrån och städa rutan. */
async function bildUrRutan(info){
  const el = document.getElementById('phPaste');
  if(!el) return logga('bildUrRutan: rutan saknas');
  const src = el.querySelector('img')?.getAttribute('src');
  const innehall = rutansInnehall(el);
  logga(`rutan efter paste: img=${src ? src.slice(0, 30) : 'nej'} innehåll="${innehall}"`);
  aterstallPasteTile();
  if(!src) return visaUrklipp(`${info} · rutan fick: ${innehall || 'ingenting'}`);
  const f = await filFranUrl(src).catch(() => null);
  if(f){ urklippsInfo = ''; return laggTillBilder([f]); }
  visaUrklipp(`${info} · bild i rutan men gick inte att läsa: ${src.slice(0, 60)}`);
}

/* iOS kan lämna det inklistrade i beforeinput i stället för i paste – och kan
   skicka bara det ena. Båda går till samma hantering. */
document.addEventListener('focusin', e => { if(e.target.id === 'phPaste') logga('rutan fick fokus'); });
document.addEventListener('focusout', e => { if(e.target.id === 'phPaste') logga('rutan tappade fokus'); });
document.addEventListener('beforeinput', e => {
  if(e.inputType !== 'insertFromPaste' || !e.target.closest?.('#phPaste')) return;
  logga(`beforeinput insertFromPaste · ${beskrivDT(e.dataTransfer)}`);
  hanteraInklistring(e, e.dataTransfer, true, 'beforeinput');
});
document.addEventListener('paste', e => {
  const t = e.target, namn = t?.id ? '#' + t.id : (t?.tagName || '?');
  logga(`paste på ${namn} · galleri=${galleriOppet()} · ${beskrivDT(e.clipboardData)}`);
  if(!galleriOppet()) return;
  const iRutan = !!e.target.closest?.('#phPaste');
  hanteraInklistring(e, e.clipboardData, iRutan, 'paste');
});
function hanteraInklistring(e, d, iRutan, kanal){
  // Klistrar man in i ett vanligt textfält ska texten dit, inte bli en bild
  if(!iRutan && e.target.closest?.('input, textarea, [contenteditable]')) return;
  if(hanterad === e.timeStamp) return;      // paste och beforeinput för samma tryck

  const info = `${kanal}: typer ${[...(d?.types || [])].join(', ') || 'inga'} · filer ${d?.files?.length ?? 0}`;
  let filer = [...(d?.files || [])].filter(f => f.type.startsWith('image/'));
  // items kan bära bilden fast files är tom
  if(!filer.length && d?.items)
    filer = [...d.items].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if(filer.length){
    hanterad = e.timeStamp;
    logga(`${kanal}: ${filer.length} fil(er) → lägger till`);
    e.preventDefault(); urklippsInfo = '';
    if(iRutan) aterstallPasteTile();
    return laggTillBilder(filer);
  }

  let html = '';
  try { html = d?.getData?.('text/html') || ''; } catch(err){ logga('getData html fel: ' + err.message); }
  const src = imgSrcUrHtml(html);
  if(src){
    hanterad = e.timeStamp;
    logga(`${kanal}: html med img → hämtar`);
    e.preventDefault(); urklippsInfo = '';
    if(iRutan) aterstallPasteTile();
    filFranUrl(src).then(f => f && laggTillBilder([f]))
      .catch(err => { logga('hämtning fel: ' + err.message); visaUrklipp(`${info} · adress gick inte att läsa`); });
    return;
  }

  /* Ingen fil och ingen adress. Låt webbläsaren klistra in i rutan som den vill
     och plocka upp resultatet efteråt – det är så Safari gör med bilder från
     andra appar. Utanför rutan låter vi det vara. */
  if(iRutan && kanal === 'paste'){ logga('paste: inget direkt – väntar på rutan'); setTimeout(() => bildUrRutan(info), 0); }
}
let hanterad = 0;

async function removePhoto(id){
  if(!await ask('Ta bort bilden?', 'Ta bort')) return;
  try {
    const trip = phTrip;
    await photos.remove(id);
    phCache = phCache.filter(p => p.id !== id);
    renderPhotos();
    await syncThumb(trip, phCache);   // först omslaget, sedan herobilden som läser det
    await visaHero(trip, phCache);
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
function closeViewer(){
  viewerEl.hidden = true;
  nollstallZoom(false);
  if(vNed || viewerEl.style.opacity) nollstallNed(false);
  kanskeLaddaOm();
}
/* Originalen för den här sessionen. Bläddrar man fram och tillbaka ska samma
   bild inte hämtas om. */
const fullCache = new Map();
async function loadFull(p){
  if(!p) return null;
  if(p.url) return p.url;
  if(fullCache.has(p.id)) return fullCache.get(p.id);
  const url = await photos.full(p.id).catch(() => null);
  if(url) fullCache.set(p.id, url);
  return url;
}
/* ---- Bläddring med glid ----
   Spåret håller tre rutor: föregående, den man tittar på, och nästa. Att byta
   bild flyttar spåret en rutbredd åt sidan; när glidningen är klar ritas rutorna
   om med den nya bilden i mitten och spåret nollställs utan övergång. Fler än tre
   rutor vore bara fler avkodade bilder i minnet utan att synas. */
const vTrack = () => document.getElementById('vTrack');
let slideBusy = false, vDrag = null;

const fullEllerPrev = p => p.url || fullCache.get(p.id) || p.prev || '';

/* Rutorna byggs en gång och återanvänds. Vid ett steg roteras noderna i stället
   för att ritas om: den ruta som redan syns på skärmen blir den nya mitten, och
   bara den ruta som hamnat utanför fylls med en ny bild. Ritade vi om alla tre
   skulle bilden man just glidit fram till avkodas en gång till – det var det som
   såg ut som att den renderades två gånger. */
function nollstallSpar(){
  const track = vTrack();
  track.classList.add('dragging');
  track.style.transform = 'translateX(-100%)';
  void track.offsetWidth;
  track.classList.remove('dragging');
}
function fyllRuta(n, i){
  const slide = vTrack().children[n];
  if(!slide) return;
  const img = slide.querySelector('img'), p = phCache[i];
  /* Rutan måste ligga kvar i flödet även när den är tom. Göms den försvinner
     den ur flexraden, de andra två glider ett steg åt vänster, och spåret –
     som alltid står på -100% – hamnar då på nästa bild i stället för den man
     valde. Det slog bara till på första bilden, där rutan före är tom. */
  if(!p){
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = '';
    return;
  }
  const src = fullEllerPrev(p);
  if(img.getAttribute('src') !== src) img.src = src;
  img.alt = `Bild ${i + 1} från resan`;
  img.hidden = false;
}
function byggRutor(){
  const track = vTrack();
  if(track.children.length !== 3)
    track.innerHTML = '<div class="vslide"><img alt="" draggable="false"></div>'.repeat(3);
  [vIdx - 1, vIdx, vIdx + 1].forEach((i, n) => fyllRuta(n, i));
  nollstallSpar();
}
function roteraRutor(d){
  const track = vTrack();
  if(d > 0) track.appendChild(track.firstElementChild);
  else track.insertBefore(track.lastElementChild, track.firstElementChild);
  nollstallSpar();
  fyllRuta(d > 0 ? 2 : 0, d > 0 ? vIdx + 1 : vIdx - 1);
}

/* Texten, knapparna och hämtningen av originalet. Originalet avkodas färdigt
   innan det byts in, annars hinner rutan bli tom ett ögonblick. */
/* Byt in originalet i mittrutan när det redan är hämtat.
   Utan det här steget fastnade bilden på förhandsbildens 400 px: rutan ritades
   av fyllRuta() medan bilden fortfarande var "nästa bild", och då fanns bara
   förhandsbilden. Sedan la förladdningen originalet i fullCache – och när man
   bläddrade dit såg uppdateraVisare() att allt var klart, skrev ingen
   "laddar …" och återvände utan att någon bytt src. Just de bilder som borde
   vara skarpast blev alltså de som aldrig blev det. */
function visaOriginal(p){
  const url = p.url || fullCache.get(p.id);
  const img = vTrack()?.children[1]?.querySelector('img');
  if(url && img && img.getAttribute('src') !== url) img.src = url;
}
function uppdateraVisare(){
  const p = phCache[vIdx];
  if(!p) return closeViewer();
  const cnt = document.getElementById('vCount');
  const nr = `${vIdx + 1} / ${phCache.length}`;
  const klar = !!p.url || fullCache.has(p.id);
  cnt.textContent = klar ? nr : `${nr} · laddar …`;
  document.getElementById('vPrev').disabled = vIdx === 0;
  document.getElementById('vNext').disabled = vIdx >= phCache.length - 1;
  // Grannarna åt båda håll: bläddring bakåt var lika vanlig men förladdades inte
  if(klar){ visaOriginal(p); förladda(); return; }
  loadFull(p).then(async url => {
    if(!url){
      if(!viewerEl.hidden && phCache[vIdx]?.id === p.id) cnt.textContent = `${nr} · kunde inte hämta bilden`;
      return;
    }
    const färdig = new Image();
    färdig.src = url;
    try { await färdig.decode(); } catch(e){}
    // Användaren kan ha bläddrat vidare under tiden
    if(viewerEl.hidden || phCache[vIdx]?.id !== p.id) return;
    const img = vTrack().children[1]?.querySelector('img');
    if(img) img.src = url;
    cnt.textContent = nr;
    förladda();
  });
}
// Grannbilderna i förväg, så bläddringen känns direkt åt båda håll
function förladda(){
  loadFull(phCache[vIdx + 1]);
  loadFull(phCache[vIdx - 1]);
}

function paintViewer(){
  if(!phCache[vIdx]) return closeViewer();
  nollstallZoom(false);
  byggRutor();
  uppdateraVisare();
}
function step(d){
  const n = vIdx + d;
  if(slideBusy || n < 0 || n >= phCache.length) return;
  nollstallZoom(false);           // en ny bild börjar alltid oinzoomad
  if(calm.matches){ vIdx = n; paintViewer(); return; }   // utan rörelse: byt rakt av
  const track = vTrack();
  slideBusy = true;
  track.style.transform = `translateX(${-100 - d * 100}%)`;
  let gjort = false;
  const done = () => {
    if(gjort) return;
    gjort = true;
    track.removeEventListener('transitionend', done);
    vIdx = n; slideBusy = false;
    roteraRutor(d);                  // rutan som redan syns blir den nya mitten
    nollstallZoom(false);
    uppdateraVisare();
  };
  track.addEventListener('transitionend', done);
  setTimeout(done, 450);        // nödutgång om transitionend uteblir
}
document.getElementById('vClose').onclick = closeViewer;
document.getElementById('vPrev').onclick = () => step(-1);
document.getElementById('vNext').onclick = () => step(1);
document.getElementById('vDel').onclick = () => removePhoto(phCache[vIdx]?.id);
addEventListener('keydown', e => {
  if(viewerEl.hidden || !askEl.hidden) return;   // frågerutan äger tangenterna när den är uppe
  if(e.key === 'Escape') closeViewer();
  if(e.key === 'ArrowLeft') step(-1);
  if(e.key === 'ArrowRight') step(1);
});
/* ---- Nypa, panorera och svepa ----
   Tre gester på samma yta, och vilken det är avgörs av hur många fingrar som
   ligger på skärmen och om bilden redan är inzoomad:

   | | |
   | --- | --- |
   | två fingrar | nyp: skala och flytta ankaret |
   | ett finger, oinzoomad | svep till nästa bild, som förut |
   | ett finger, inzoomad | panorera inuti bilden |
   | dubbeltryck | växla mellan helbild och 2,5× på den punkt man tryckte |

   Bilderna är på 1400 px, så de blir grynigare ju närmare man går – men att
   kunna gå nära en skylt eller ett ansikte är värt mer än att slippa se
   pixlarna. Taket är 6×.

   `touch-action: none` på ytan är en förutsättning: annars tar webbläsaren
   nypningen själv och zoomar hela sidan i stället för bilden. */
const ZOOM_MAX = 6, ZOOM_TAPP = 2.5;
let bildZoom = { k: 1, x: 0, y: 0 };
const pekare = new Map();
let pinch = null, panorering = null, sistaTapp = 0, sistaTappPos = null;

const mittImg = () => vTrack()?.children[1]?.querySelector('img');
const avstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mitten = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/* Punkten räknas mot mittrutans mitt, inte mot bildens. Rutan är otransformerad
   medan bilden bär zoomens transform, så rutan är den enda stabila referensen. */
function motMitten(cx, cy){
  const slide = vTrack()?.children[1];
  if(!slide) return { x: 0, y: 0 };
  const r = slide.getBoundingClientRect();
  return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
}
function klampaZoom(){
  const img = mittImg();
  const w = img?.clientWidth || 0, h = img?.clientHeight || 0;
  const mx = Math.max(0, (bildZoom.k - 1) * w / 2), my = Math.max(0, (bildZoom.k - 1) * h / 2);
  bildZoom.x = Math.min(mx, Math.max(-mx, bildZoom.x));
  bildZoom.y = Math.min(my, Math.max(-my, bildZoom.y));
}
function visaZoom(mjukt){
  const img = mittImg();
  if(!img) return;
  img.style.transition = mjukt ? 'transform .2s ease' : 'none';
  img.style.transform = bildZoom.k === 1 ? '' : `translate(${bildZoom.x}px, ${bildZoom.y}px) scale(${bildZoom.k})`;
  viewerEl.classList.toggle('zoomad', bildZoom.k > 1);
}
function nollstallZoom(mjukt){
  bildZoom = { k: 1, x: 0, y: 0 };
  pinch = null; panorering = null;
  viewerEl.classList.remove('zoomad');
  // Alla tre rutorna städas: den man lämnar bär annars kvar sin transform och
  // dyker upp inzoomad nästa gång den roteras in i mitten.
  vTrack()?.querySelectorAll('img').forEach(im => {
    im.style.transition = mjukt ? 'transform .2s ease' : 'none';
    im.style.transform = '';
  });
}
/* Skala om kring en punkt: den modellpunkt som ligger under fingret ska ligga
   kvar där när skalan ändras. */
function zoomaTill(k, ankare, fran){
  const k1 = Math.min(ZOOM_MAX, Math.max(1, k));
  const r = k1 / fran.k;
  bildZoom.k = k1;
  bildZoom.x = ankare.x - r * (ankare.x - fran.x);
  bildZoom.y = ankare.y - r * (ankare.y - fran.y);
  if(k1 === 1){ bildZoom.x = 0; bildZoom.y = 0; }
  klampaZoom();
}

/* ---- Svep ned för att stänga ----
   Samma avvägning som Flippas ark: 55 punkters drag räcker, och en snabb knyck
   nedåt (0,45 punkter per millisekund) räcker ännu tidigare. Riktningen avgörs
   på sex punkters rörelse med 1,3 gångers övervikt, så ett lätt snedsvep i
   sidled fortfarande bläddrar. Gesten finns bara när bilden inte är inzoomad –
   då panorerar ett finger i stället. */
let vNed = null;
function visaNed(dy){
  const spar = vTrack();
  if(spar) spar.style.transform = `translateY(${dy}px)`;
  viewerEl.style.opacity = String(Math.max(.25, 1 - dy / 420));
}
function nollstallNed(mjukt){
  vNed = null;
  const spar = vTrack();
  if(spar){
    spar.style.transition = mjukt && !calm.matches ? 'transform .22s ease' : 'none';
    spar.style.transform = '';
    if(mjukt) setTimeout(() => { const t = vTrack(); if(t) t.style.transition = ''; }, 240);
  }
  viewerEl.style.opacity = '';
}

viewerEl.addEventListener('pointerdown', e => {
  if(slideBusy || e.target.closest('.vbtn')) return;
  pekare.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if(pekare.size === 2){
    // Ett svep som blev en nypning: lämna tillbaka spåret innan vi zoomar
    if(vDrag){ vDrag = null; vTrack().classList.remove('dragging'); vTrack().style.transform = 'translateX(-100%)'; }
    panorering = null;
    const [a, b] = [...pekare.values()], m = mitten(a, b);
    pinch = { d: avstand(a, b) || 1, k: bildZoom.k, x: bildZoom.x, y: bildZoom.y, mx: m.x, my: m.y,
              ankare: motMitten(m.x, m.y) };
    return;
  }
  if(pekare.size !== 1) return;
  if(bildZoom.k > 1){
    panorering = { x: e.clientX, y: e.clientY, ox: bildZoom.x, oy: bildZoom.y };
    return;
  }
  vDrag = { x: e.clientX, y: e.clientY, w: viewerEl.clientWidth || 1, dx: 0, rör: false,
            riktning: null, dy: 0, lastY: e.clientY, lastT: performance.now(), vy: 0 };
});

viewerEl.addEventListener('pointermove', e => {
  const p = pekare.get(e.pointerId);
  if(p){ p.x = e.clientX; p.y = e.clientY; }

  if(pinch && pekare.size >= 2){
    const [a, b] = [...pekare.values()], m = mitten(a, b);
    zoomaTill(pinch.k * (avstand(a, b) / pinch.d), pinch.ankare, pinch);
    // Flyttar man nypningen i sidled ska bilden följa med
    bildZoom.x += m.x - pinch.mx; bildZoom.y += m.y - pinch.my;
    klampaZoom();
    return visaZoom(false);
  }
  if(panorering){
    bildZoom.x = panorering.ox + (e.clientX - panorering.x);
    bildZoom.y = panorering.oy + (e.clientY - panorering.y);
    klampaZoom();
    return visaZoom(false);
  }
  if(!vDrag) return;
  const dx = e.clientX - vDrag.x, dny = e.clientY - vDrag.y;
  if(!vDrag.riktning){
    if(Math.abs(dx) < 6 && Math.abs(dny) < 6) return;
    // Nedåt med tydlig övervikt = stäng, allt annat = bläddra
    vDrag.riktning = (dny > 0 && Math.abs(dny) > Math.abs(dx) * 1.3) ? 'ned' : 'sida';
    if(vDrag.riktning === 'ned'){ vNed = vDrag; vTrack().classList.add('dragging'); }
  }
  if(vDrag.riktning === 'ned'){
    const nu = performance.now();
    if(nu > vDrag.lastT) vDrag.vy = (e.clientY - vDrag.lastY) / (nu - vDrag.lastT);
    vDrag.lastY = e.clientY; vDrag.lastT = nu;
    vDrag.dy = Math.max(0, dny);
    return visaNed(vDrag.dy);
  }
  if(!vDrag.rör){
    vDrag.rör = true;
    vTrack().classList.add('dragging');
  }
  const kant = (dx > 0 && vIdx === 0) || (dx < 0 && vIdx >= phCache.length - 1);
  vDrag.dx = kant ? dx / 3 : dx;
  vTrack().style.transform = `translateX(calc(-100% + ${vDrag.dx}px))`;
});

function slutSvep(){
  if(!vDrag) return;
  if(vDrag.riktning === 'ned'){
    const { dy, vy } = vDrag;
    vDrag = null; vNed = null;
    const track = vTrack();
    track.classList.remove('dragging');
    if(!(dy > 55 || vy > .45)){ nollstallNed(true); return false; }
    if(calm.matches){ nollstallNed(false); closeViewer(); return false; }
    track.style.transition = 'transform .2s ease-in';
    track.style.transform = `translateY(${viewerEl.clientHeight || 800}px)`;
    viewerEl.style.transition = 'opacity .2s';
    viewerEl.style.opacity = '0';
    setTimeout(() => { closeViewer(); viewerEl.style.transition = ''; nollstallNed(false); }, 190);
    return false;
  }
  const { dx, w, rör } = vDrag;
  vDrag = null;
  const track = vTrack();
  track.classList.remove('dragging');
  if(!rör) return true;
  const tröskel = Math.max(48, w * .18);
  const d = dx <= -tröskel ? 1 : dx >= tröskel ? -1 : 0;
  if(d && vIdx + d >= 0 && vIdx + d < phCache.length) step(d);
  else track.style.transform = 'translateX(-100%)';
  return false;
}
/* Dubbeltryck: två tryck inom 300 ms och åtta punkter från varandra. Det andra
   trycket får inte ha varit ett svep eller en panorering. */
function kanskeDubbeltryck(e){
  const nu = Date.now(), pos = { x: e.clientX, y: e.clientY };
  if(sistaTapp && nu - sistaTapp < 300 && sistaTappPos && avstand(sistaTappPos, pos) < 8){
    sistaTapp = 0; sistaTappPos = null;
    if(bildZoom.k > 1) nollstallZoom(true);
    else { zoomaTill(ZOOM_TAPP, motMitten(pos.x, pos.y), bildZoom); visaZoom(true); }
    return;
  }
  sistaTapp = nu; sistaTappPos = pos;
}
function slappPekare(e){
  const fanns = pekare.delete(e.pointerId);
  if(pinch && pekare.size < 2){
    pinch = null;
    if(bildZoom.k <= 1.02) nollstallZoom(true);
    // Ett finger kvar efter nypningen: låt det panorera vidare utan uppehåll
    const kvar = [...pekare.values()][0];
    panorering = kvar && bildZoom.k > 1 ? { x: kvar.x, y: kvar.y, ox: bildZoom.x, oy: bildZoom.y } : null;
    return;
  }
  if(panorering){
    const flyttat = avstand({ x: e.clientX, y: e.clientY }, { x: panorering.x, y: panorering.y }) > 8;
    panorering = null;
    if(!flyttat && fanns) kanskeDubbeltryck(e);
    return;
  }
  const stillastaende = slutSvep();
  if(stillastaende && fanns) kanskeDubbeltryck(e);
}
viewerEl.addEventListener('pointerup', slappPekare);
viewerEl.addEventListener('pointercancel', e => { pekare.delete(e.pointerId); pinch = null; panorering = null; slutSvep(); });

function renderCountry(iso){
  sheet.classList.add('country'); sheet.classList.remove('detail');
  setSheet(.5);
  const home = isHome(iso), groups = stopsIn(iso);
  const places = new Set();
  // Bara gjorda resor räknas – en planerad resa har vi inte varit på än
  groups.forEach(({ t, st }) => { if(!t.planned) (st.places||[]).forEach(p => places.add(p.name)); });
  const n = groups.filter(g => !g.t.planned).length;
  const planned = groups.length - n;
  /* Att söka fram Kirgizistan och mötas av "inget inlagt" är fel svar när det
     finns en resa dit – den råkar bara ligga utanför filtret. Då listas den
     ändå, med vilka som var med, så man ser vad som gömmer sig. */
  const dolda = groups.length
    ? []
    : [...DB.trips].filter(t => t.stops.some(st => st.iso === iso)).sort(byDateDesc);
  const sum = n
    ? `${n} ${n === 1 ? 'resa' : 'resor'} · ${places.size} ${places.size === 1 ? 'plats' : 'platser'}`
    : planned
      ? `${planned} planerad ${planned === 1 ? 'resa' : 'resor'} – inte varit här än`
      : dolda.length
        ? `${dolda.length} ${dolda.length === 1 ? 'resa' : 'resor'} hit, men ingen som passar filtret`
        : 'Inget inlagt ännu.';
  body.innerHTML = `<div class="country">
    <button class="back" data-back>‹ Tillbaka</button>
    <h2><span class="flag">${flagOf(iso)}</span>${esc(countryName(iso))}${home ? '<span class="tag home-badge">Hemma</span>' : ''}</h2>
    <p>${sum}${home && DB.home.place ? ` · vi bor i ${esc(DB.home.place.name)}` : ''}</p>
    ${groups.map(({ t, st }) => `<div class="ctrip" data-trip="${esc(t.id)}" role="button" tabindex="0">
      <div class="hdr">
        ${t.thumb ? `<span class="thumb"><img src="${t.thumb}" alt=""></span>` : `<span class="flag">${flagOf(st.iso)}</span>`}
        <span><b>${esc(t.title)}</b>${t.planned ? '<span class="tag">Planerad</span>' : ''}${st.side ? '<span class="tag side">Avstickare</span>' : ''}
        <span class="when">${span(stopStart(t, st), stopEnd(t, st))}</span></span>${avs(stopWho(t, st))}</div>
      <ul>${(st.places||[]).map(p => `<li${home ? ' class="home-city"' : ''}><div><b>${esc(p.name)}</b>${p.what ? ` <span>— ${esc(p.what)}</span>` : ''}</div></li>`).join('')}</ul>
      <span class="more">Visa hela resan ›</span>
    </div>`).join('') || (dolda.length
      ? `<p class="example">Filtret står på <b>${esc(filterLabel())}</b>, och ingen av resorna hit matchar det.
           Byt i toppraden för att se dem på kartan – eller öppna dem här:</p>
         ${dolda.map(tripRow).join('')}`
      : '<p class="example">Inga resor hit ännu.</p>')}
  </div>`;
}

// Hela kortet i landvyn är klickbart, inte bara "Visa hela resan"
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const c = e.target.closest?.('.ctrip[data-trip]');
  if(!c) return;
  e.preventDefault();
  showTrip(c.dataset.trip);
});

document.addEventListener('click', e => {
  const tr = e.target.closest('[data-trip]');
  if(tr){ showTrip(tr.dataset.trip); return; }
  if(e.target.closest('[data-back]')){ goBack(); return; }
  const ed = e.target.closest('[data-edit]');
  if(ed){ openEditor(ed.dataset.edit); return; }
  const del = e.target.closest('[data-del]');
  if(del){ removeTrip(del.dataset.del); return; }
  const co = e.target.closest('[data-country]');
  if(co){ showCountry(co.dataset.country); }
});

function showTrip(id){
  const t = DB.trips.find(x => x.id === id);
  if(!t || sel === id) return;
  navPush();
  sel = id; selCountry = null; selArsdag = null; setTab('karta'); drawPins(); renderSheet(); flyTo(t);
}
function showCountry(iso){
  if(selCountry === iso && !sel) return;
  navPush();
  selCountry = iso; sel = null; selArsdag = null; setTab('karta'); drawPins(); renderSheet(); flyToCountry(iso);
}
/* Årsdagsvyn: flera resor har årsdag samma dag, och notisen leder hit i stället
   för till en av dem. En enda resa länkas direkt till sig själv – en lista med
   ett objekt i vore ett extra steg utan innehåll. */
function showArsdag(datum){
  if(selArsdag === datum && !sel && !selCountry) return;
  navPush();
  selArsdag = datum; sel = null; selCountry = null;
  setTab('karta'); drawPins(); renderSheet(); resetZoom();
}

function renderArsdag(datum){
  sheet.classList.remove('detail', 'country');
  setSheet(.5);
  const träffar = arsdagarPa(datum, 'allt', null).sort((a, b) => a.ar - b.ar);
  const d = dt(datum);
  body.innerHTML = `<div class="country">
    <button class="back" data-back>‹ Tillbaka</button>
    <h2>Årsdagar</h2>
    <p>${isNaN(d) ? '' : esc(`${d.getDate()} ${MON[d.getMonth()]}`) + ' · '}${
      träffar.length === 1 ? 'en resa' : `${träffar.length} resor`}</p>
    ${träffar.map(({ t, ar }) => `<div class="arsrad">
      <span class="ar">för ${esc(arOrd(ar))} år sedan</span>
      ${tripRow(t)}</div>`).join('')
      || '<p class="example">Inga resor har årsdag den dagen längre.</p>'}
  </div>`;
}
async function removeTrip(id){
  const t = DB.trips.find(x => x.id === id);
  if(!t) return;
  if(!await ask(`Ta bort resan "${t.title}"? Det går inte att ångra.`, 'Ta bort')) return;
  DB.trips = DB.trips.filter(x => x.id !== id);
  for(let i = nav.length - 1; i >= 0; i--) if(nav[i].sel === id) nav.splice(i, 1);
  saveDB(); sel = null;
  if(!editor.hidden) closeEditor();
  refreshAll();
  toast('Resan är borttagen.');
  // Bilderna hör till resan och ska inte bli kvar som skräp
  try { (await photos.list(id)).forEach(p => photos.remove(p.id)); } catch(e){}
}

/* ============================ Sök ============================
   Ett fält som söker på resenamn, platser och länder bland de inlagda resorna.
   Finns på tre ställen (förstoringsglaset på kartan, överst i Resor och Länder)
   men är samma komponent: markup från searchMarkup(), händelser delegerade
   på document så fälten överlever att vyerna ritas om. */
const SEARCH_SVG = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
const searchMarkup = id => `<div class="srch" id="${id}"><div class="in">${SEARCH_SVG}<input type="search" placeholder="Sök resa, plats eller land" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Sök resa, plats eller land"><button class="clr" type="button" aria-label="Rensa" hidden><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="srch-res" role="listbox" hidden></div></div>`;

// Åre och "are" ska hitta varandra: fäll ihop diakriter och skiftläge
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function searchIndex(){
  const out = [], byIso = {};
  DB.trips.forEach(t => {
    const year = (t.start || '').slice(0, 4);
    const lands = t.stops.map(s => countryName(s.iso)).join(', ');
    out.push({ kind: 'resa', label: t.title, sub: `${span(t.start, t.end)}${lands ? ' · ' + lands : ''}`,
      flag: t.stops[0] ? flagOf(t.stops[0].iso) : '🏳️', go: () => showTrip(t.id) });
    t.stops.forEach(s => {
      const o = byIso[s.iso] ??= { n: 0 };
      if(!t.planned) o.n++;
      (s.places || []).forEach(p => p.name && out.push({ kind: 'plats', label: p.name,
        sub: `${countryName(s.iso)} · ${t.title}${year ? ' ' + year : ''}`, flag: flagOf(s.iso), go: () => showTrip(t.id) }));
    });
  });
  Object.entries(byIso).forEach(([iso, o]) => out.push({ kind: 'land', label: countryName(iso),
    sub: o.n ? `${o.n} ${o.n === 1 ? 'resa' : 'resor'}` : 'planerad resa', flag: flagOf(iso), go: () => showCountry(iso) }));
  return out;
}
function searchHits(q){
  const f = fold(q.trim());
  if(!f) return [];
  const rank = { land: 0, resa: 1, plats: 2 };
  return searchIndex()
    .map(e => { const l = fold(e.label), i = l.indexOf(f); return i < 0 ? null : { e, i, word: (i === 0 || l[i - 1] === ' ') ? 0 : 1 }; })
    .filter(Boolean)
    // ordbörjan först, sen tidig träff, sen land → resa → plats
    .sort((a, b) => a.word - b.word || a.i - b.i || rank[a.e.kind] - rank[b.e.kind] || a.e.label.localeCompare(b.e.label, 'sv'))
    .slice(0, 8).map(h => h.e);
}
function highlight(label, q){
  const f = fold(q.trim()), i = fold(label).indexOf(f);
  if(i < 0) return esc(label);
  return esc(label.slice(0, i)) + '<mark>' + esc(label.slice(i, i + f.length)) + '</mark>' + esc(label.slice(i + f.length));
}
function paintSearch(box){
  const input = box.querySelector('input'), res = box.querySelector('.srch-res');
  const q = input.value;
  box.querySelector('.clr').hidden = !q;
  box._act = -1;
  if(!q.trim()){ box._hits = []; res.hidden = true; res.innerHTML = ''; return; }
  const hits = box._hits = searchHits(q);
  res.hidden = false;
  res.innerHTML = hits.length
    ? hits.map((h, i) => `<button type="button" role="option" data-i="${i}" aria-selected="false">
        <span class="flag">${h.flag}</span><span><b>${highlight(h.label, q)}</b><small>${esc(h.sub)}</small></span><span class="kind">${h.kind}</span></button>`).join('')
    : `<p class="msg">Inget som heter “${esc(q.trim())}” bland resorna.</p>`;
}
function markActive(box){
  box.querySelectorAll('.srch-res [role=option]').forEach((b, i) => b.setAttribute('aria-selected', String(i === box._act)));
}
/* Teckenförklaringen på telefonen: av som standard, och valet ligger kvar på
   enheten. På desktop styr media-frågan i index.html och knappen finns inte. */
const legendBtn = document.getElementById('legendBtn');
function setLegend(on, save = true){
  document.body.classList.toggle('visa-legend', on);
  legendBtn?.setAttribute('aria-pressed', String(on));
  legendBtn?.setAttribute('aria-label', on ? 'Dölj teckenförklaring' : 'Visa teckenförklaring');
  if(save){ try { localStorage.setItem(LS_LEGEND, on ? '1' : '0'); } catch(e){} }
}
document.body.dataset.tab = 'karta';     // startläget, innan setTab körts
try { setLegend(localStorage.getItem(LS_LEGEND) === '1', false); } catch(e){ setLegend(false, false); }
legendBtn?.addEventListener('click', e => {
  e.stopPropagation();
  setLegend(!document.body.classList.contains('visa-legend'));
});

const topEl = document.getElementById('top');
function closeSearch(box){
  const input = box.querySelector('input');
  input.value = ''; paintSearch(box); input.blur();
  if(box.id === 'mapSearch') topEl.classList.remove('searching');
}
function pickSearch(box, i){
  const h = box._hits?.[i];
  if(!h) return;
  closeSearch(box);
  h.go();
}
document.addEventListener('input', e => {
  const box = e.target.closest?.('.srch');
  if(box && e.target.tagName === 'INPUT') paintSearch(box);
});
document.addEventListener('focusin', e => {
  const box = e.target.closest?.('.srch');
  if(box && e.target.tagName === 'INPUT' && e.target.value.trim()) box.querySelector('.srch-res').hidden = false;
});
document.addEventListener('keydown', e => {
  const box = e.target.closest?.('.srch');
  if(!box) return;
  const hits = box._hits || [];
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    if(!hits.length) return;
    e.preventDefault();
    box._act = ((box._act ?? -1) + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    markActive(box);
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(hits.length) pickSearch(box, box._act >= 0 ? box._act : 0);
  } else if(e.key === 'Escape'){
    closeSearch(box);
  }
});
document.addEventListener('click', e => {
  const opt = e.target.closest('.srch-res [role=option]');
  if(opt){ pickSearch(opt.closest('.srch'), +opt.dataset.i); return; }
  const clr = e.target.closest('.srch .clr');
  if(clr){ const box = clr.closest('.srch'), inp = box.querySelector('input'); inp.value = ''; paintSearch(box); inp.focus(); return; }
  if(e.target.closest('#searchBtn')){
    closeWho();
    topEl.classList.add('searching');
    document.querySelector('#mapSearch input').focus();
    return;
  }
  if(e.target.closest('#searchCancel')){ closeSearch(document.getElementById('mapSearch')); return; }
  // Tryck utanför fäller ihop listan; texten står kvar och listan kommer tillbaka vid fokus
  document.querySelectorAll('.srch-res:not([hidden])').forEach(r => { if(!r.closest('.srch').contains(e.target)) r.hidden = true; });
});

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
      </div></div>` + searchMarkup('searchResor') +
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
    ...family().filter(p => !filter.size || filter.has(p.id)).map(p => [p.id, count(p.id)]),
    ...guests().map(p => [p.id, count(p.id)]).filter(x => x[1] > 0).sort((a,b) => b[1] - a[1])
  ];
  const maxC = Math.max(1, ...per.map(x => x[1]));
  const years = {};
  // Dag för dag, så en resa över nyår hamnar på båda åren
  travelDays(list).forEach(d => { const y = d.slice(0, 4); years[y] = (years[y] || 0) + 1; });
  const maxY = Math.max(1, ...Object.values(years));
  /* Ett år i Moskva skulle annars vinna "längsta resan" för alltid, och det är
     inte samma sorts rekord. Boendena får en egen rad.
     Topp tre i stället för en enda: tvåan och trean är ofta det roliga, och en
     ensam vinnare säger inget om hur nära det var. */
  const sortLangd = (a, b) => days(b) - days(a) || a.title.localeCompare(b.title, 'sv');
  const longest = done(list).filter(t => !t.bo && days(t)).sort(sortLangd).slice(0, 3);
  const longestBo = done(list).filter(t => t.bo && days(t)).sort(sortLangd).slice(0, 3);
  const cc = {};
  done(list).forEach(t => { const i = t.stops[0]?.iso; if(i && !isHome(i)) cc[i] = (cc[i]||0) + 1; });
  const most = Object.entries(cc)
    .sort((a, b) => b[1] - a[1] || countryName(a[0]).localeCompare(countryName(b[0]), 'sv'))
    .slice(0, 3);
  const newest = (() => {
    const seen = new Set(); let last = '–';
    [...done(DB.trips)].sort((a,b) => (a.start||'').localeCompare(b.start||'')).forEach(t =>
      t.stops.forEach(st => { if(!isHome(st.iso) && !seen.has(st.iso)){ seen.add(st.iso); last = `${countryName(st.iso)} (${(t.start||'').slice(0,4)})`; } }));
    return last;
  })();
  document.getElementById('view-stat').innerHTML = `<h1>Statistik</h1>${statTiles(s, 'grid2')}
    <h2 class="sec">Länder per person</h2><div class="bars">${per.map(([id, n]) =>
      `<div class="bar">${av(id)}<span class="nm">${esc(personName(id))}</span><div class="track"><div class="fill" style="--pc:${personColor(id)};width:${n/maxC*100}%"></div></div><span class="val">${n} ${n === 1 ? 'land' : 'länder'}</span></div>`).join('')}</div>
    <h2 class="sec">Resdagar per år</h2><div class="years">${Object.keys(years).sort().reverse().map(y =>
      `<div><span class="v">${years[y]}</span><div class="col" style="height:${years[y]/maxY*70}%"></div><span>${y}</span></div>`).join('') || '<div><span>–</span></div>'}</div>
    ${(() => {
      const top = farthest(list, 6);
      if(!top.length) return '';
      const max = top[0].km;
      return `<h2 class="sec">Längst hemifrån</h2>
        <p class="hint" style="margin:-2px 0 8px">Fågelvägen från ${esc(DB.home.place.name)} – den plats vi nått längst bort i varje land.</p>
        <div class="toplist">${top.map((x, i) => `
          <button class="topitem" data-trip="${esc(x.id)}">
            <span class="rank">${i + 1}</span>
            <span class="flag">${flagOf(x.iso)}</span>
            <span class="nm"><b>${esc(x.name)}</b><small>${esc(countryName(x.iso))}${
              x.year ? ' · ' + x.year : ''}</small></span>
            <span class="km">${km(x.km)}</span>
            <span class="track"><span class="fill" style="width:${x.km / max * 100}%"></span></span>
          </button>`).join('')}</div>`;
    })()}

    <h2 class="sec">Kul att veta</h2><dl class="facts">
      <dt>Längsta ${longest.length === 1 ? 'resan' : 'resorna'}</dt>${topp3(longest,
        t => `${esc(t.title)} <span class="v">${days(t)} dagar</span>`)}
      ${longestBo.length ? `<dt>Längsta ${longestBo.length === 1 ? 'vistelsen' : 'vistelserna'}</dt>${topp3(longestBo,
        t => `${esc(t.title)} <span class="v">${days(t)} dagar</span>`)}` : ''}
      <dt>Flest resor till</dt>${topp3(most,
        ([iso, n]) => `${flagOf(iso)} ${esc(countryName(iso))} <span class="v">${n}</span>`)}
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
    `<h1>${isos.filter(i => !lc[i].planned && !isHome(i)).length} länder</h1>` + searchMarkup('searchLander') + '<div class="clist">' +
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

/* Inställningarnas notisruta. Tre lägen i stället för fyra kryssrutor – fyra
   kryss är fyra beslut om något man inte har känsla för förrän notiserna
   börjar komma. Siffran under alternativen räknas på era egna resor, så valet
   görs mot verkligheten och inte mot en känsla. */
function notisAvsnitt(){
  const val = notisVal();
  const rubrik = `<h2 class="sec">Notiser</h2>`;
  if(!pushStods())
    return rubrik + '<p class="hint">Den här webbläsaren kan inte ta emot notiser.</p>';
  if(kraverHemskarm())
    return rubrik + `<p class="hint">Lägg till Resekartan på hemskärmen först. iPhone
      släpper bara in notiser för den installerade appen – dela-knappen i Safari,
      sedan "Lägg till på hemskärmen".</p>`;
  if(!CLOUD.on)
    return rubrik + '<p class="hint">Logga in mot molnet för att kunna slå på notiser.</p>';

  /* Blockerat på systemnivå är ett eget läge, inte "av". Appen kan inte fråga
     igen – webbläsaren svarar nej direkt – så en kryssruta hade bara känts
     trasig. Säg var man slår på det i stället. */
  if(Notification.permission === 'denied') return rubrik + `<div class="pitch blockerad">
    <p class="rub">Notiser är avstängda för Resekartan</p>
    <p>Telefonen släpper inte igenom dem, och appen kan inte slå på dem åt dig.
    Gå till <b>Inställningar → Resekartan → Notiser</b> i telefonen, slå på där,
    och kom tillbaka hit.</p>
  </div>`;

  const kort = ([id, l]) => `<button type="button" data-lage="${id}" aria-pressed="${val.lage === id}">
    <b>${esc(l.namn)}</b><small>${esc(l.desc)}</small>${TICK}</button>`;
  const brickor = family().map(p => `<button type="button" class="chip" data-pushperson="${esc(p.id)}"
    style="--pc:${personColor(p.id)}" aria-pressed="${val.personer.includes(p.id)}">${av(p.id)}${esc(p.name)}${TICK}</button>`).join('');
  const n = val.personer.length ? notisAntal(val.lage, val.personer) : 0;

  /* Systemets behörighet avgör, inte appens minnesanteckning. Stänger man av
     notiser i telefonens inställningar ska reglaget här följa med – annars står
     det "på" medan ingenting kommer fram. */
  if(!val.pa || Notification.permission !== 'granted') return rubrik + `<div class="pitch">
    <p class="rub">Bli påmind om era resor</p>
    <p>"I dag för fem år sedan kom ni hem från Rumänien." En notis på årsdagen av en
    avslutad resa, med en väg rakt in i resan och bilderna.</p>
    <label class="check"><input type="checkbox" id="pushOn"> Slå på för den här enheten</label>
    <p class="hint">Skickas vid 16-tiden. Varje telefon och padda väljer själv.</p>
  </div>`;

  return rubrik + `
    <div class="field"><label class="check"><input type="checkbox" id="pushOn" checked>
      Skicka årsdagsnotiser till den här enheten</label></div>
    <p class="hint" style="margin-top:-4px">Skickas vid 16-tiden.</p>
    <label class="fl">Hur ofta</label>
    <div class="lagen">${Object.entries(LAGEN).map(kort).join('')}</div>
    <p class="hint">${val.personer.length
      ? `Det blir ${n === 0 ? 'ingen notis' : n === 1 ? 'en notis' : n + ' notiser'} det närmaste året.`
      : 'Kryssa i minst en person – annars skickas ingenting.'}</p>
    <label class="fl" style="margin-top:14px">Resor där någon av dessa var med</label>
    <div class="chips">${brickor}</div>
    <div class="actions"><button type="button" class="btn ghost" id="pushTest">Skicka en testnotis</button></div>`;
}

/* ============================ Inställningar ============================ */
function renderSettings(){
  const valt = temaNu();
  /* Platser som sparades med ortens eget alfabet innan v58. De dyker upp i
     topplistan över längst hemifrån och går inte att läsa, så de listas här med
     en genväg till resan i stället för att man ska leta rätt på dem själv. */
  const krumelurer = [];
  DB.trips.forEach(t => t.stops.forEach(st => (st.places || []).forEach(p => {
    if(p.name && !harLatin(p.name))
      krumelurer.push({ id: t.id, title: t.title, start: t.start, end: t.end, iso: st.iso, name: p.name });
  })));
  const temaKort = ([id, t]) => `<button type="button" class="tcard" data-tema="${id}" aria-pressed="${id === valt}"
      style="--t-sea:${t.prev.sea};--t-land:${t.prev.land};--t-vis:${t.prev.vis};--t-surf:${t.prev.surf};--t-acc:${t.prev.acc}">
      <span class="prev"><i class="l1"></i><i class="l2"></i><i class="v1"></i><i class="v2"></i><span class="sh"></span></span>
      <span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>
      <span class="tick"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></button>`;
  /* Ordningen: det man faktiskt ändrar först, det man ställer in en gång i
     mitten, och tekniken hopfälld längst ned. Rutan blandade förut notiser och
     tema med säkerhetskopior och lösenordshashar, och då hittar man inget. */
  document.getElementById('view-settings').innerHTML = `<h1>Inställningar</h1>
    ${notisAvsnitt()}

    <h2 class="sec">Utseende</h2>
    <p class="subtle">Temat gäller bara den här enheten. Väljer du Hedvig här ändras ingenting i de andras appar.</p>
    <div class="themes">${Object.entries(TEMAN).map(temaKort).join('')}</div>

    <details class="fallbar"><summary>Hemort</summary>
    <p class="subtle">Landet ritas i egen färg och får en hus-markör på orten.
    Avstånden i statistiken räknas härifrån.</p>
    <div class="field"><label class="fl" for="setHomeName">Sök orten</label>
      <div class="searchwrap">
        <input type="text" id="setHomeName" autocomplete="off" placeholder="t.ex. Årsta"
               value="${esc(DB.home?.place?.name || '')}">
        <div class="results" id="homeResults" hidden></div>
      </div>
      <p class="hint" id="homeNow">${DB.home?.place
        ? `Nu: ${esc(DB.home.place.name)}, ${esc(countryName(DB.home.iso))} · ${DB.home.place.lat.toFixed(3)}, ${DB.home.place.lon.toFixed(3)}`
        : 'Ingen hemort vald än.'}</p>
    </div>
    </details>

    <details class="fallbar"><summary>Resenärer</summary>
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
    </details>
    ${krumelurer.length ? `
    <h2 class="sec">Ortnamn att rätta</h2>
    <p class="subtle">De här platserna sparades med ortens eget alfabet, innan sökningen
    började be om ett latinskt namn. Öppna resan, skriv namnet du känner igen och spara –
    positionen ligger kvar.</p>
    <div class="clist">${krumelurer.map(k => `<button class="trip" data-edit="${esc(k.id)}">
      <span class="flag">${flagOf(k.iso)}</span>
      <span><b>${esc(k.name)}</b><small>${esc(k.title)} · ${esc(span(k.start, k.end))}</small></span>
      <span></span></button>`).join('')}</div>` : ''}

    <details class="fallbar">
      <summary>Avancerat och felsökning</summary>

    <h2 class="sec">Den här versionen</h2>
    <dl class="facts">
      <dt>Läge</dt><dd>${useCloud() ? (CLOUD.on ? 'Moln, inloggad' : 'Moln, ej inloggad') : 'Lokalt'}</dd>
      <dt>Appversion</dt><dd>${esc(APP_VERSION)}</dd>
    </dl>
    ${useCloud() ? '' : `<p class="subtle" style="margin-top:8px">Appen kör lokalt trots att molnet är påslaget i repot? Då ligger en gammal version kvar i cachen – tryck <b>Hämta senaste versionen</b> längst ned.</p>`}

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
    <p class="example">Kartdata: Natural Earth 1:50m via world-atlas (public domain).</p>
    </details>`;
  const dump = document.getElementById('dump');
  if(dump) dump.value = JSON.stringify(DB, null, 1);
}

document.getElementById('view-settings').addEventListener('click', e => {
  const t = e.target.closest('[data-tema]');
  if(!t) return;
  setTema(t.dataset.tema);
  document.querySelectorAll('#view-settings [data-tema]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.tema === t.dataset.tema)));
  toast(`Tema: ${TEMAN[temaNu()].name}`);
});

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
      filter.delete(p.id);
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
    setSett(false);
    location.reload();
  }
});

/* Hemorten söks fram på samma sätt som platser i en resa */
let homeTimer = null, homeSeq = 0;
function searchHome(q){
  const box = document.getElementById('homeResults');
  if(!box) return;
  const term = String(q || '').trim();
  if(term.length < 2){ box.hidden = true; return; }
  const seq = ++homeSeq;
  box.hidden = false;
  box.innerHTML = '<div class="msg">Söker …</div>';
  geocode(term, '').then(hits => {
    if(seq !== homeSeq) return;
    if(!hits.length){ box.innerHTML = '<div class="msg">Hittade inget med det namnet.</div>'; return; }
    box.innerHTML = hits.map(h =>
      `<button type="button" data-home="${h.lat},${h.lon}" data-name="${esc(h.name)}">${esc(h.name)}${
        h.kind ? ` <span style="color:var(--ink-3);font-size:12px">${esc(h.kind)}</span>` : ''
      }<small>${esc(h.label)}</small></button>`).join('');
  }).catch(() => {
    if(seq !== homeSeq) return;
    box.innerHTML = '<div class="msg">Sökningen nås inte härifrån just nu.</div>';
  });
}

document.getElementById('view-settings').addEventListener('change', e => {
  if(e.target.id === 'pushOn') e.target.checked ? slaPaNotiser() : slaAvNotiser();
});

document.getElementById('view-settings').addEventListener('input', e => {
  if(e.target.id !== 'setHomeName') return;
  const v = e.target.value;
  clearTimeout(homeTimer);
  homeTimer = setTimeout(() => searchHome(v), SEARCH_WAIT);
});

document.getElementById('view-settings').addEventListener('click', async e => {
  const lage = e.target.closest('[data-lage]');
  if(lage) return andraNotisVal({ lage: lage.dataset.lage });
  const pp = e.target.closest('[data-pushperson]');
  if(pp){
    const val = notisVal(), id = pp.dataset.pushperson;
    return andraNotisVal({ personer: val.personer.includes(id)
      ? val.personer.filter(x => x !== id) : [...val.personer, id] });
  }
  if(e.target.closest('#pushTest')){
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('I dag för fem år sedan kom ni hem från Rumänien', {
        body: 'Så här kommer en årsdagsnotis att se ut.',
        icon: './icon-192.png', badge: './icon-192.png', tag: 'resekartan-test'
      });
    } catch(err){ toast('Kunde inte visa testnotisen.'); }
    return;
  }
  const b = e.target.closest('[data-home]');
  if(!b) return;
  const [lat, lon] = b.dataset.home.split(',').map(Number);
  const name = b.dataset.name;
  const iso = isoFromCC((b.dataset.cc || '')) || isoByPosition({ lat, lon });
  if(!iso){ toast('Kunde inte avgöra vilket land orten ligger i.'); return; }
  DB.home = { iso, place: { name, lat, lon } };
  saveDB(); refreshAll(); setTab('settings');
  toast(`Hemorten är nu ${name}.`);
});

/* ============================ Flikar ============================ */
const VIEWS = ['resor', 'stat', 'lander', 'settings'];   // 'karta' är kartan under
function setTab(t){
  tab = t;
  // Väljaren gäller resor och statistik, inte inställningar – där skulle den bara
  // se ut som att inställningarna var personliga
  document.body.dataset.tab = t;          // infoknappen hör bara hemma på kartan
  document.body.classList.toggle('no-top', t === 'settings');
  if(t === 'settings') closeWho();
  document.querySelectorAll('#tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  VIEWS.forEach(v => document.getElementById('view-' + v).hidden = (v !== t));
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('[role=tab]');
  if(!b) return;
  const t = b.dataset.tab;
  // Trycker man på fliken man redan står i backar man ut till dess grundvy,
  // som i de flesta iOS-appar: kartan släpper det som är öppet, listorna går
  // upp till toppen igen.
  if(t === tab){
    if(t === 'karta'){
      // Kartan har tre saker som kan ha flyttat sig: det som är öppet, kartans
      // zoom och arkets läge och skrollning. Alla tre ska tillbaka.
      if(sel || selCountry){ clearSel(); }
      else {
        resetZoom();
        setSheet(.5);
        body.scrollTo({ top: 0, behavior: calm.matches ? 'auto' : 'smooth' });
      }
    } else {
      document.getElementById('view-' + t)
        ?.scrollTo({ top: 0, behavior: calm.matches ? 'auto' : 'smooth' });
    }
  }
  setTab(t);
});


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
           who: family().map(p => p.id), planned: false, bo: false, note: '', link: '', stops: [blankStop(iso)] };
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
  edBody.scrollTop = 0;                 // en ny redigering börjar överst
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
function closeEditor(){ editor.hidden = true; draft = null; editingId = null; kanskeLaddaOm(); }
function edBack(){
  if(edStep === 'country' && draft){ edStep = 'form'; changeIsoIndex = null; return renderEditor(); }
  closeEditor();
}
document.getElementById('edClose').onclick = edBack;
document.getElementById('edCancel').onclick = edBack;

function whoPicker(selected, name){
  const chip = p => `<button type="button" class="chip" data-who="${name}" data-id="${esc(p.id)}" style="--pc:${personColor(p.id)}" aria-pressed="${selected.includes(p.id)}">${av(p.id)}${esc(p.name)}${TICK}</button>`;
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

  // Att skriva om innehållet nollställer skrollningen. Står man långt ned bland
  // platserna ska en omritning inte kasta upp en till titelfältet igen.
  const kvar = edBody.scrollTop;
  edBody.innerHTML = `
    <div class="field"><label class="fl" for="fTitle">Vad kallar vi resan?</label>
      <input type="text" id="fTitle" value="${esc(draft.title)}" placeholder="t.ex. Italien eller Sportlovet i Åre"></div>
    <div class="field"><label class="fl">När var ni där?</label>
      <button type="button" class="datebtn" id="fDates">${draft.start
        ? esc(span(draft.start, draft.end)) + ` <span style="color:var(--ink-3)">· ${days(draft)} ${days(draft) === 1 ? 'dag' : 'dagar'}</span>`
        : '<span class="ph">Välj datum</span>'}</button></div>
    <div class="field"><label class="check"><input type="checkbox" id="fPlanned" ${draft.planned ? 'checked' : ''}> Planerad resa (inte gjord än)</label></div>
    <div class="field"><label class="check"><input type="checkbox" id="fBo" ${draft.bo ? 'checked' : ''}> Räkna som permanentboende, ta inte med i statistiken över resdagar</label></div>
    <div class="field"><label class="fl">Vilka var med?</label>${whoPicker(draft.who, 'trip')}</div>
    <div class="field"><label class="fl" for="fNote">Minne från resan</label>
      <textarea id="fNote" placeholder="Vad gjorde vi? Vad var bäst?">${esc(draft.note)}</textarea></div>
    <div class="field"><label class="fl" for="fLink">Länk till resan</label>
      <input type="url" id="fLink" inputmode="url" autocomplete="off" spellcheck="false"
             value="${esc(draft.link || '')}" placeholder="photos.google.com/…">
      <p class="hint">Valfritt. Ett fotoalbum, en blogg eller något annat som hör till resan.</p></div>

    <h2 class="sec">Länder på resan</h2>
    <p class="hint" style="margin-bottom:10px">Första landet är huvudmålet. Lägg till en avstickare för ett land ni bara tog en sväng till – det räknas ändå som besökt land.</p>
    ${draft.stops.map((s, i) => stopCard(s, i)).join('')}
    <div class="actions" style="margin-top:0">
      <button type="button" class="btn ghost" data-addstop="0">+ Land</button>
      <button type="button" class="btn ghost" data-addstop="1">+ Avstickare</button>
    </div>
    ${editingId ? `<div class="actions"><button type="button" class="btn danger" data-del="${esc(editingId)}">Ta bort resan</button></div>` : ''}
    ${SOK_LOG_ON ? `<pre id="sokLog" class="soklog"${sokLog.length ? '' : ' hidden'}>${esc(sokLog.join('\n'))}</pre>` : ''}`;
  edBody.scrollTop = kvar;
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
  draft.bo = !!g('fBo')?.checked;
  draft.note = g('fNote')?.value.trim() ?? draft.note;
  const rå = g('fLink')?.value;
  if(rå !== undefined){ draft.linkRå = rå.trim(); draft.link = cleanUrl(rå); }
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
  const { start } = calState;
  const end = calState.end || start;
  const n = start ? Math.round((dt(end) - dt(start)) / 864e5) + 1 : 0;
  document.getElementById('calSum').textContent = start
    ? `${span(start, end)} · ${n} ${n === 1 ? 'dag' : 'dagar'}`
      + (calState.end ? '' : ' · välj sista dagen, eller tryck Klar')
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
  const find = t.closest('[data-find]');
  if(find){ readDraft(); return searchPlace(find.dataset.find); }
  const pick = t.closest('[data-pick]');
  if(pick){ readDraft(); return startPick(pick.dataset.pick); }
});

/* ---- Att välja en träff i ortsökningen ----
   Två saker gjorde att ett tryck på en träff kunde se ut att inte göra något:

   1. Valet ritade om hela formuläret, och då nollställs `edBody.scrollTop`.
      Står man långt ned bland platserna kastas man upp till titelfältet i
      samma ögonblick, och det syns aldrig att positionen faktiskt kom in.
   2. Valet skedde på `click`. På iPhone hinner fältet tappa fokus och
      tangentbordet stängas mellan tryck och klick, och då flyttar listan sig
      under fingret.

   Nu väljs träffen på `pointerup` – med `preventDefault` på `pointerdown` så
   fokus ligger kvar – och bara den berörda raden ritas om. Rör sig fingret mer
   än tio punkter var det en skrollning i listan, inte ett val. */
function valjTraff(hit){
  const box = hit.closest('[data-results]');
  if(!box) return sokLogga('AVBRÖT: hittade ingen resultatruta');
  if(!draft) return sokLogga('AVBRÖT: inget utkast');
  const [i, j] = box.dataset.results.split('.').map(Number);
  const [lat, lon] = String(hit.dataset.hit || '').split(',').map(Number);
  if(!draft.stops[i]?.places[j]) return sokLogga('AVBRÖT: ingen plats ' + i + '.' + j);
  if(!isFinite(lat) || !isFinite(lon)) return sokLogga('AVBRÖT: ogiltig position');
  sokLogga('OK ' + lat.toFixed(3) + ', ' + lon.toFixed(3));
  clearTimeout(searchTimer); searchSeq++;   // ett svar på väg in ska inte fälla ut listan igen
  readDraft();
  Object.assign(draft.stops[i].places[j], { lat, lon, name: hit.dataset.name || draft.stops[i].places[j].name });
  clearFormError();
  fyllPlatsrad(i, j);
}

/* ---- Synlig logg ----
   Ortsökningen har gått sönder två gånger på iPhone utan att det gick att se
   varför, och båda lagningarna byggde på en teori. Samma läxa som från
   inklistringen: logga på skärmen innan du gissar. Raden under träffarna visar
   vilka händelser som faktiskt kom fram. Slå av med SOK_LOG_ON när det är löst. */
const SOK_LOG_ON = true;
const sokLog = [];
function sokLogga(txt){
  if(!SOK_LOG_ON) return;
  sokLog.push(new Date().toTimeString().slice(3, 8) + ' ' + txt);
  if(sokLog.length > 12) sokLog.shift();
  const el = document.getElementById('sokLog');
  if(el){ el.hidden = false; el.textContent = sokLog.join('\n'); }
}

/* Valet är med flit förlåtande. Två skydd gjorde det sprött: målet måste vara
   samma element vid pointerup, och fingret fick inte flytta sig mer än tio
   punkter. På iPhone glider listan till av sig själv – tangentbordet öppnas,
   förslagsraden dyker upp, och Safari skrollar fram fältet – och då föll
   trycket. Nu räcker det att trycket började på en träff och släpptes någorlunda
   nära den; både pointerup och click leder fram, den som hinner först. */
let traffNed = null;
const traffKlar = (hit, via) => {
  if(!traffNed || traffNed.hit !== hit) return;
  traffNed = null;
  sokLogga('väljer via ' + via);
  valjTraff(hit);
};
edBody.addEventListener('pointerdown', e => {
  const hit = e.target.closest('[data-hit]');
  if(!hit) return;
  traffNed = { hit, x: e.clientX, y: e.clientY, t: Date.now() };
  sokLogga('ned på "' + (hit.dataset.name || '?') + '" (' + e.pointerType + ')');
});
edBody.addEventListener('pointerup', e => {
  const ned = traffNed;
  if(!ned) return sokLogga('upp utan ned');
  const flytt = Math.round(Math.hypot(e.clientX - ned.x, e.clientY - ned.y));
  const samma = e.target.closest('[data-hit]') === ned.hit;
  sokLogga('upp flytt=' + flytt + ' samma=' + samma);
  // Rör sig fingret långt var det en skrollning i listan, inte ett val
  if(flytt > 24) { traffNed = null; return; }
  traffKlar(ned.hit, 'pointerup');
});
/* pointercancel kommer när Safari bestämmer sig för att gesten var en skrollning,
   men också ibland av sig självt. Kandidaten kastas därför inte direkt – ett
   click kan fortfarande komma efter, och då ska trycket räknas. */
edBody.addEventListener('pointercancel', () => {
  sokLogga('avbruten (pointercancel)');
  const ned = traffNed;
  setTimeout(() => { if(traffNed === ned) traffNed = null; }, 500);
});
edBody.addEventListener('click', e => {
  const hit = e.target.closest('[data-hit]');
  if(!hit) return;
  sokLogga('klick');
  if(traffNed) return traffKlar(hit, 'click');
  // Trycket hann aldrig registreras som pointerdown – välj ändå
  sokLogga('väljer via click utan ned');
  valjTraff(hit);
});

function fyllPlatsrad(i, j){
  const row = edBody.querySelector(`[data-place="${i}.${j}"]`);
  if(!row) return renderEditor();
  const p = draft.stops[i].places[j];
  const namn = row.querySelector(`[data-pname="${i}.${j}"]`);
  if(namn) namn.value = p.name;
  const box = row.querySelector('[data-results]');
  if(box){ box.hidden = true; box.innerHTML = ''; }
  const coord = row.querySelector('.coord');
  if(coord){
    coord.className = 'coord vald';
    coord.textContent = `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
    setTimeout(() => coord.classList.remove('vald'), 900);
  }
}

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
  if(draft.linkRå && !draft.link)
    return showFormError('Länken ser inte ut som en webbadress. Klistra in hela adressen, till exempel photos.google.com/…', '#fLink');
  delete draft.linkRå;

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

/* Typen som står i grått bakom namnet. Rå OSM-engelska ("administrative")
   ser ut som ett fel och fick oss att tro att sådana träffar saknade position –
   de gör de inte, det är så Nominatim märker en stad som är en kommungräns. */
const PLATSTYP = {
  administrative:'kommun', municipality:'kommun', county:'län', district:'distrikt',
  city:'stad', town:'ort', village:'by', hamlet:'liten by', locality:'plats',
  suburb:'stadsdel', borough:'stadsdel', neighbourhood:'kvarter', quarter:'kvarter',
  state:'delstat', province:'provins', region:'region', continent:'kontinent', country:'land',
  island:'ö', islet:'liten ö', archipelago:'skärgård', peninsula:'halvö', cape:'udde',
  peak:'bergstopp', volcano:'vulkan', valley:'dal', glacier:'glaciär', desert:'öken',
  lake:'sjö', river:'flod', bay:'vik', beach:'strand', water:'vatten',
  national_park:'nationalpark', nature_reserve:'naturreservat', park:'park',
  airport:'flygplats', aerodrome:'flygplats', train_station:'järnvägsstation', station:'station',
  attraction:'sevärdhet', museum:'museum', hotel:'hotell', farm:'gård', isolated_dwelling:'gård',
  safety_region:'område', city_block:'kvarter'
};
const platstyp = k => PLATSTYP[k] || (k ? String(k).replace(/_/g, ' ') : '');

/* ---- Namn vi kan läsa ----
   Både Nominatim och Photon svarar med ortens **lokala** namn när det inte finns
   något på det språk man bett om. Sökte man Okinawa fick man 沖縄県 i listan, och
   det var krumelurerna som sparades på resan – och dök upp i topplistan över
   längst hemifrån. Samma sak i Etiopien.

   Tre saker löser det: Nominatim får `accept-language=sv,en` så den faller
   tillbaka på engelska i stället för på japanska, Photon får `lang=en`, och
   dubbletterna nedan låter ett latinskt namn vinna över ett som inte är det. */
function normPhoton(f){
  const p = f.properties, c = f.geometry?.coordinates;
  if(!c) return null;
  const where = [p.city, p.state, p.country].filter(Boolean).join(', ');
  return { name: p.name || p.city || '', label: where, lat: c[1], lon: c[0],
           cc: (p.countrycode || '').toLowerCase(), kind: p.osm_value || '' };
}
function normNominatim(h){
  // namedetails=1 ger alla namntaggar, så vi kan välja själva i stället för att
  // lita på att Accept-Language tolkats som vi tänkte. int_name är sista utvägen.
  const n = h.namedetails || {};
  const namn = n['name:sv'] || n['name:en'] || h.name || n.int_name || h.display_name.split(',')[0];
  return { name: namn, label: h.display_name,
           lat: +h.lat, lon: +h.lon,
           cc: (h.address?.country_code || '').toLowerCase(),   // kräver addressdetails=1
           kind: h.type || '' };
}
async function geocode(q, cc){
  const enc = encodeURIComponent(q);
  // Nominatim först: den svarar med svenska namn, så den vinner när båda hittar
  // samma plats och dubbletten sorteras bort nedan.
  const calls = [
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&limit=8&accept-language=sv,en&q=${enc}`
          + (cc ? `&countrycodes=${cc}` : ''))
      .then(r => r.json()).then(d => (d || []).map(normNominatim)),
    fetch(`https://photon.komoot.io/api/?q=${enc}&limit=8&lang=en`)
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
  /* Samma plats från båda källorna slås ihop. Nominatim vinner normalt – den
     svarar med svenska namn – men ett namn med latinska bokstäver vinner alltid
     över ett utan, så källorna täcker upp för varandra där den ena bara har det
     lokala namnet. Map behåller insättningsordningen när värdet byts ut, så
     Nominatims träffar ligger kvar överst. */
  const bast = new Map();
  hits.forEach(h => {
    if(!h.name) return;
    // En träff utan position går inte att välja. Bättre att den aldrig syns än
    // att ett tryck på den ser ut att inte göra något.
    if(!isFinite(h.lat) || !isFinite(h.lon)) return;
    const key = h.lat.toFixed(2) + ',' + h.lon.toFixed(2);
    const fanns = bast.get(key);
    if(!fanns || (!harLatin(fanns.name) && harLatin(h.name))) bast.set(key, h);
  });
  return [...bast.values()].slice(0, 7);
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
        h.kind ? ` <span style="color:var(--ink-3);font-size:12px">${esc(platstyp(h.kind))}</span>` : ''
      }<small>${esc(h.label)}</small></button>`).join('');
  }).catch(() => {
    if(seq !== searchSeq) return;
    box.innerHTML = '<div class="msg">Ortsökningen blockeras i den här förhandsvisningen, som inte släpper igenom anrop utåt. '
      + 'Tryck på kartnålen och peka ut platsen istället – på den publicerade sajten fungerar sökningen.</div>';
  });
}

let pickScroll = 0;
function startPick(ref){
  pickTarget = ref;
  const [i, j] = ref.split('.').map(Number);
  const stop = draft.stops[i];
  pickScroll = edBody.scrollTop;   // display:none nollställer den, så spara undan
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
  edBody.scrollTop = pickScroll;
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

  /* Länk var som helst på raden, typiskt ett album i Google Photos. Den plockas
     bort först: en adress innehåller både siffror och ord som annars skulle
     läsas som datum eller ortnamn. */
  let link = '';
  const um = s.match(/(?:https?:\/\/|www\.)\S+/i);
  if(um){
    const rå = um[0].replace(/[),.;:!?]+$/, '');
    link = cleanUrl(rå);
    s = (s.slice(0, um.index) + ' ' + s.slice(um.index + rå.length)).replace(/\s+/g, ' ').trim();
    if(!s) return null;
  }

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

  return { line: String(line).trim(), title, names, who, link,
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
function closeImport(){ importer.hidden = true; imRows = null; kanskeLaddaOm(); }
document.getElementById('imClose').onclick = closeImport;

function renderImport(){
  const err = document.getElementById('imErr');
  err.hidden = true;
  document.getElementById('imNext').disabled = false;
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
Rom 1-9 aug 2026 https://photos.app.goo.gl/abc
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
        <p><b>En länk</b> får stå var som helst på raden och följer med resan:<br>
          <code>Rom 1-9 aug 2026 https://photos.app.goo.gl/…</code><br>
          Adressen plockas bort innan resten läses, så den stör inte datum eller ortnamn.</p>
        <p>Rader utan datum går också bra – de hamnar längst ned och får datum du fyller i själv.</p>
      </div>`;
    return;
  }

  if(!imRows) return;                       // rutan hann stängas mitt i uppslagningen
  const ok = imRows.filter(r => r.use).length;
  const vantar = imRows.some(r => r.pending);
  const hittade = imRows.filter(r => r.places.length).length;
  /* Knappen är låst medan orterna slås upp. Trycktes den tidigare sparades bara
     de rader som hunnit bli klara, och resten försvann utan att något sa ifrån. */
  document.getElementById('imNext').disabled = vantar;
  imBody.innerHTML = `
    <p class="imsum">${imRows.length} rader · ${ok} valda${
      vantar ? ' <span class="spin"></span> slår upp orter …' : ''}</p>${
    !vantar && hittade > ok
      ? `<p class="imwarn">${hittade - ok} ${hittade - ok === 1 ? 'rad hittade en ort men saknar datum' : 'rader hittade en ort men saknar datum'} –
         kryssa i dem här om du vill lägga in dem ändå och fylla i datum efteråt.</p>`
      : ''}
    <div>${imRows.map((r, i) => {
      const bad = !r.places.length;
      return `<label class="imrow${bad ? ' bad' : ''}">
        <input type="checkbox" data-im="${i}" ${r.use ? 'checked' : ''} ${bad ? 'disabled' : ''}>
        <span>
          <span class="who">${r.places.length ? flagOf(r.iso) + ' ' : ''}${esc(r.title || r.line)}${
            r.yearOnly ? '<span class="imbadge warn">bara år</span>' : ''}${
            !r.hasDate && !r.yearOnly ? '<span class="imbadge warn">inget datum</span>' : ''}${
            r.link ? `<span class="imbadge">${esc(linkName(r.link))}</span>` : ''}</span>
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
  const nya = chosen.map(r => ({
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: r.title || r.places[0].name,
    start: r.start, end: r.end,
    who: r.who && r.who.length ? r.who : family().map(p => p.id),
    planned: !!r.start && r.start > today,
    note: '',
    link: r.link || '',
    stops: [{ iso: r.iso, places: r.places.map(p => ({ name: p.name, lat: p.lat, lon: p.lon, what: '' })) }]
  }));
  DB.trips.push(...nya);
  saveDB();
  closeImport();
  refreshAll();
  // "Resan sparades inte" är oftast "resan sparades men filtret döljer den":
  // en rad med -TA blir en resa där bara två var med, och då syns den inte
  // under Hela familjen.
  const gomda = nya.filter(t => !t.stops.some(st => inFilter(t, st))).length;
  toast((nya.length === 1 ? '1 resa inlagd.' : `${nya.length} resor inlagda.`)
    + (gomda ? ` ${gomda} av dem döljs av filtret ${filterLabel()}.` : ''));
};

/* Slå upp en rad i taget – geokodarna är gratis och ska inte översvämmas */
async function lookupRows(){
  const mina = imRows;
  for(const r of mina){
    if(imRows !== mina) return;          // rutan stängdes, eller raderna byttes ut
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
      if(imRows !== mina) return;
      renderImport();
      await new Promise(res => setTimeout(res, 1100));   // Nominatim: max 1/sek
      if(imRows !== mina) return;
    }
    /* Kryssa i allt som fick en position och ett datum. Förut krävdes dessutom
       att varje ort på raden hittades, och en rad som såg alldeles färdig ut i
       granskningen kunde ändå ligga okryssad – då sparades den inte, och det
       syntes ingenstans. Saknade orter står som "hittade inte" på raden. */
    if(r.places.length && r.start) r.use = true;
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

/* ============================ Årsdagsnotiser ============================
   "I dag för fem år sedan kom ni hem från Rumänien." Beslut och avvägningar
   står i docs/arsdagsnotiser.md; här ligger bara klientdelen. Avsändaren är
   scripts/send-arsdagar.js, som körs av GitHub Actions.

   Den publika VAPID-nyckeln är inte hemlig – den identifierar bara avsändaren
   för webbläsaren. Den privata halvan ligger som GitHub-secret. */
const VAPID_PUBLIC = 'BFhuKfDnP9P-LzD10zHVCEcFZzNiXyncDz_xYy36kvALo3M3DEEuM0ayTnTBMS0FQ20aB10lucZRExHQj81RRwQ';
const LS_PUSH = 'resekartan.notiser';     // { pa, lage, personer } – spegel för gränssnittet
const LS_ENHET = 'resekartan.enhet';      // slump-id, nyckeln i resekartan/data/push

const LAGEN = {
  sparsamt: { namn: 'Sparsamt', desc: '5, 10, 15, 20 år …' },
  lagom:    { namn: 'Lagom',    desc: '1, 2 och 5 år, sedan vart femte' },
  allt:     { namn: 'Allt',     desc: 'varje år' }
};
const ORD = ['noll','ett','två','tre','fyra','fem','sex','sju','åtta','nio','tio','elva','tolv'];
const arOrd = n => ORD[n] || String(n);

const notisVal = () => {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(LS_PUSH) || '{}'); } catch(e){}
  return { pa: !!o.pa, lage: LAGEN[o.lage] ? o.lage : 'lagom',
           personer: Array.isArray(o.personer) ? o.personer : family().map(p => p.id) };
};
const setNotisVal = o => { try { localStorage.setItem(LS_PUSH, JSON.stringify(o)); } catch(e){} };
function enhetsId(){
  let id = null;
  try { id = localStorage.getItem(LS_ENHET); } catch(e){}
  if(!id){
    id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem(LS_ENHET, id); } catch(e){}
  }
  return id;
}

const pushStods = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const paHemskarmen = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
/* iPadOS säger "Macintosh" i user agent sedan version 13, så en padda går inte
   att känna igen på namnet. Pekpunkterna skiljer den från en riktig Mac – och
   utan det testet visades notisrutan på paddan som om allt var i sin ordning,
   fast prenumerationen aldrig hade kunnat gå igenom. */
const applePekskarm = () => /iPhone|iPod|iPad/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// iOS och iPadOS släpper bara in web push för appar på hemskärmen (16.4+)
const kraverHemskarm = () => applePekskarm() && !paHemskarmen();

/* ---- Vilka resor har årsdag ---- */
const skottar = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const resansFolk = t => [...new Set([...(t.who || []), ...t.stops.flatMap(s => s.who || [])])];

const arsdagGaller = (ar, lage) => ar >= 1 && (
  lage === 'allt' ? true :
  lage === 'sparsamt' ? ar % 5 === 0 :
  ar === 1 || ar === 2 || ar % 5 === 0);

/* Resor vars **slutdatum** har årsdag på det givna datumet. Slutdatumet, inte
   startdatumet: "kom hem" bär även ett år i Moskva, där "åkte till" hade låtit
   fel. Resor utan slutdatum och planerade resor är aldrig med. */
function arsdagarPa(datum, lage, personer){
  const [y, m, d] = String(datum).split('-').map(Number);
  if(!y) return [];
  const ut = [];
  DB.trips.forEach(t => {
    if(t.planned || !t.end) return;
    const [ey, em, ed] = t.end.split('-').map(Number);
    // En resa som slutade 29 februari får sin årsdag den 28:e övriga år
    const traff = (em === m && ed === d) || (em === 2 && ed === 29 && m === 2 && d === 28 && !skottar(y));
    if(!traff) return;
    const ar = y - ey;
    if(!arsdagGaller(ar, lage)) return;
    if(personer && personer.length && !resansFolk(t).some(id => personer.includes(id))) return;
    ut.push({ t, ar });
  });
  return ut;
}
/* Hur många notiser valet faktiskt ger det närmaste året. Flera resor samma dag
   blir en notis, så det är dagar med träff som räknas – inte resor. */
function notisAntal(lage, personer){
  const d = new Date();
  let n = 0;
  for(let i = 0; i < 365; i++){
    d.setDate(d.getDate() + 1);
    if(arsdagarPa(ymd(d), lage, personer).length) n++;
  }
  return n;
}

/* ---- Prenumerationen ---- */
const b64ToBytes = b64 => {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const rå = atob(s), arr = new Uint8Array(rå.length);
  for(let i = 0; i < rå.length; i++) arr[i] = rå.charCodeAt(i);
  return arr;
};
const pushRef = () => CLOUD.mod.store.doc(CLOUD.db, 'resekartan', 'data', 'push', enhetsId());

/* Sändaren minns per prenumeration vilket datum den senast fick något, så en
   försenad körning hinner ikapp utan att någon får dubbelt. Slår man på notiser
   efter klockan 16 märks dagen som avklarad – annars hade dagens notis kommit
   med en gång, som ett hopp ur ingenstans. */
function dagenRedanAvklarad(){
  const nu = new Date();
  const timme = +new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    hour: '2-digit', hour12: false }).format(nu);
  if(timme < 16) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

async function sparaPrenumeration(sub, val){
  if(!CLOUD.on) throw new Error('offline');
  await CLOUD.mod.store.setDoc(pushRef(), {
    subscription: JSON.parse(JSON.stringify(sub)),
    lage: val.lage, personer: val.personer, enabled: true,
    lastSent: dagenRedanAvklarad(),
    ua: (navigator.userAgent || '').slice(0, 120),
    updatedAt: new Date().toISOString()
  });
}

async function slaPaNotiser(){
  const val = notisVal();
  if(!pushStods()) return toast('Notiser stöds inte i den här webbläsaren.');
  if(kraverHemskarm()) return toast('Lägg till Resekartan på hemskärmen först – iPhone kräver det för notiser.');
  if(!CLOUD.on) return toast('Notiser kräver att du är inloggad mot molnet.');
  let lov;
  try { lov = await Notification.requestPermission(); } catch(e){ lov = Notification.permission; }
  if(lov !== 'granted'){
    toast(lov === 'denied' ? 'Notiser är blockerade. Slå på dem i telefonens inställningar.' : 'Du sa nej till notiser.');
    return renderSettings();
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
    await sparaPrenumeration(sub, val);
    setNotisVal({ ...val, pa: true });
    toast('Notiser är på. Nästa årsdag hör vi av oss.');
  } catch(e){
    toast('Kunde inte slå på notiser: ' + (e.message || e.code || 'okänt fel'));
  }
  renderSettings();
}

async function slaAvNotiser(){
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
  } catch(e){}
  try { if(CLOUD.on) await CLOUD.mod.store.deleteDoc(pushRef()); } catch(e){}
  setNotisVal({ ...notisVal(), pa: false });
  renderSettings();
}

/* Ändrat läge eller ändrade personer. Är notiserna på ska molnet veta direkt,
   annars sparas valet bara lokalt tills man slår på dem. */
async function andraNotisVal(patch){
  const val = { ...notisVal(), ...patch };
  setNotisVal(val);
  renderSettings();
  if(!val.pa || !CLOUD.on) return;
  try {
    await CLOUD.mod.store.updateDoc(pushRef(), { lage: val.lage, personer: val.personer, updatedAt: new Date().toISOString() });
  } catch(e){ toast('Valet sparades här men nådde inte molnet.'); }
}

/* ---- Notis-tryck ---- */
/* Adressen bär vart trycket ska leda: #resa=<id> för en enda resa,
   #arsdag=YYYY-MM-DD när flera hade årsdag samma dag. */
function oppnaFranAdress(){
  const h = location.hash || '';
  const resa = h.match(/^#resa=(.+)$/), ars = h.match(/^#arsdag=(\d{4}-\d{2}-\d{2})$/);
  if(!resa && !ars) return false;
  history.replaceState(null, '', location.pathname + location.search);
  if(resa) showTrip(decodeURIComponent(resa[1]));
  else showArsdag(ars[1]);
  return true;
}
addEventListener('hashchange', oppnaFranAdress);
// Trycket kan komma medan appen redan är öppen – då skickar arbetaren hit i stället
navigator.serviceWorker?.addEventListener?.('message', e => {
  if(e.data?.type !== 'resekartan-oppna' || !e.data.url) return;
  try {
    const h = new URL(e.data.url, location.href).hash;
    if(h){ location.hash = h; oppnaFranAdress(); }
  } catch(err){}
});

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
/* Behörigheten kan ha dragits tillbaka i telefonens inställningar sedan sist.
   Då är prenumerationen död – sändaren städar bort den när den får 404 – och
   den lokala flaggan ska inte påstå något annat. */
function synkaNotisLage(){
  if(!('Notification' in window)) return;
  const val = notisVal();
  if(val.pa && Notification.permission !== 'granted') setNotisVal({ ...val, pa: false });
}

function start(){
  synkaNotisLage();
  if(!CLOUD.on) DB = loadDB();
  normaliseDB();
  // Kartan utgår från familjens gemensamma resor, men har någon valt något
  // annat på den här enheten gäller det valet i stället.
  lasFilter();
  cloudDot(CLOUD.on ? 'on' : '', CLOUD.on ? 'Synkad med familjens data' : '');
  renderWho(); layout(); renderSheet(); renderViews();
  /* Omritningen räknar om projektionen men rör inte zoomen, så transformen pekar
     på fel ställe efteråt. Roterade man telefonen medan man var inzoomad i ett
     land hamnade man någon helt annanstans. Rama in det man tittar på igen. */
  addEventListener('resize', () => { layout(); ramaOm(); });
}

/* ============================ Ny version ============================
   Symtomet var att man fick tvinga fram avslut två gånger för att få den nya
   koden. Tre saker saknades:

   1. `updateViaCache: 'none'` vid registreringen. Utan den får webbläsaren
      servera **sw.js själv** ur HTTP-cachen, och GitHub Pages sätter max-age –
      då upptäcks en ny version aldrig, hur ofta man än frågar.
   2. En kontroll när appen kommer i förgrunden. En timme mellan försöken räcker
      inte för en app man öppnar i en minut åt gången.
   3. En omladdning när den nya arbetaren tagit över. Den togs medvetet bort en
      gång, med motiveringen att koden ändå går nätverket först – men den redan
      öppna sidan kör förstås kvar sin gamla kod tills något laddar om den.

   Omladdningen sker bara när det är ofarligt: inte mitt i en redigering, en
   import, en bildvisning eller ett drag. Var man var sparas och återställs, och
   låsskärmen säger vad som händer i stället för att bara blinka förbi. */
const LS_UPPD = 'resekartan.uppdaterad', LS_PLATS = 'resekartan.plats';
let vantarNyVersion = false, laddarOm = false;

const sakertAttLaddaOm = () => !appEl.hidden && editor.hidden && viewerEl.hidden
  && askEl.hidden && importer.hidden && !phDrag.on && !pickTarget;

function kanskeLaddaOm(){
  if(!vantarNyVersion || laddarOm || !sakertAttLaddaOm()) return;
  laddarOm = true;
  try {
    sessionStorage.setItem(LS_UPPD, '1');
    sessionStorage.setItem(LS_PLATS, JSON.stringify({ tab, sel, selCountry, selArsdag }));
  } catch(e){}
  location.reload();
}

/* Tillbaka till samma plats efteråt. sessionStorage överlever en omladdning i
   samma flik men är tom vid en äkta kallstart, så en gammal plats kan inte spöka. */
function aterstallPlats(){
  let p = null;
  try {
    const rå = sessionStorage.getItem(LS_PLATS);
    if(rå){ sessionStorage.removeItem(LS_PLATS); p = JSON.parse(rå); }
  } catch(e){}
  if(!p) return false;
  if(p.tab && p.tab !== 'karta') setTab(p.tab);
  if(p.sel && DB.trips.some(t => t.id === p.sel)) showTrip(p.sel);
  else if(p.selCountry) showCountry(p.selCountry);
  else if(p.selArsdag) showArsdag(p.selArsdag);
  return true;
}

/* Körs sist: start() rör kartans konstanter, som måste vara initialiserade först.
   Ingen try runt openApp – ett fel där ska synas, inte sväljas. */
/* Ingen omladdning när en ny service worker tar över. Sidan och app.js går
   redan nätverket först, så en start får alltid senaste koden ändå; det nya
   arbetaren tillför är bara färsk cache för det tunga. Omladdningen som fanns
   här startade om appen mitt i uppstarten varje gång en version släppts, och
   det syntes som ett blink. */
function registerSW(){
  if(!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Fanns ingen arbetare alls är det första installationen – inget att byta ut
  const haddeArbetare = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!haddeArbetare) return;
    vantarNyVersion = true;
    kanskeLaddaOm();
  });
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      reg.update();
      // En app man öppnar en minut åt gången hinner aldrig med en timmes intervall
      addEventListener('visibilitychange', () => {
        if(document.visibilityState !== 'visible') return;
        reg.update();
        kanskeLaddaOm();
      });
      setInterval(() => reg.update(), 15 * 60 * 1000);
    } catch(e){}
  });
}

(async function boot(){
  registerSW();
  // Kommer vi tillbaka från en uppdatering ska det stå varför vi väntar
  try {
    if(sessionStorage.getItem(LS_UPPD)){
      sessionStorage.removeItem(LS_UPPD);
      lockStatus('Uppdaterar till senaste versionen …', true);
    }
  } catch(e){}

  if(!useCloud()){
    let unlocked = false;
    try { unlocked = localStorage.getItem(LS_AUTH) === AUTH.hash; } catch(e){}
    if(unlocked) openApp();
    else showLockForm('Familjens resor. Skriv lösenordet för att komma in.');
    return;
  }

  // Molnläge: Firebase Authentication ersätter lösenordshashen
  document.getElementById('email').hidden = false;
  document.getElementById('pwBtn').textContent = 'Logga in';
  const LEAD = 'Familjens resor. Logga in för att komma in.';
  // Har den här enheten aldrig varit inloggad finns inget att vänta på
  if(!sett()) showLockForm(LEAD);
  // Svarar inloggningen inte alls ska man ändå kunna göra något
  const nödutgång = setTimeout(() => { if(appEl.hidden) showLockForm(LEAD); }, 12000);
  cloudDot('', 'Kopplar upp …');
  lockStatus('Kopplar upp mot molnet …');
  try {
    await cloudInit();
    lockStatus('');
    CLOUD.mod.auth.onAuthStateChanged(CLOUD.auth, async user => {
      if(!user){
        clearTimeout(nödutgång);
        setSett(false);
        cloudDot('', 'Inte inloggad');
        lockStatus('');
        showLockForm(LEAD);
        return;
      }
      clearTimeout(nödutgång);
      setSett(true);
      CLOUD.user = user; CLOUD.on = true;
      lockStatus('Hämtar familjens resor …');
      try { await cloudFirstSync(); }
      catch(e){
        lockStatus('');
        if(e.message === 'slow'){
          // Nätet är segt men datat finns lokalt – öppna med det vi har
          DB = loadDB(); normaliseDB();
          if(appEl.hidden) openApp();
          cloudWatch();
          cloudDot('off', 'Långsam uppkoppling – visar senast sparade');
          toast('Molnet svarar långsamt. Visar det som fanns sparat här.');
          return;
        }
        document.getElementById('pwErr').textContent =
          e.code === 'permission-denied'
            ? 'Kontot har inte behörighet till datat. Kontrollera Firestore-reglerna.'
            : 'Kunde inte hämta datat: ' + (e.code || e.message);
        showLockForm(LEAD);
        return;
      }
      if(appEl.hidden) openApp(); else { refreshAll(); lockStatus(''); }
      cloudWatch();
      cloudDot('on', 'Inloggad som ' + user.email);
    });
  } catch(e){
    clearTimeout(nödutgång);
    lockStatus('');
    document.getElementById('pwErr').textContent = 'Kunde inte ladda Firebase. Kontrollera nätet.';
    cloudDot('off', 'Firebase kunde inte laddas');
    showLockForm(LEAD);
  }
})();

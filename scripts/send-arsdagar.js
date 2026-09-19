// Skickar årsdagsnotiser: "I dag för fem år sedan kom ni hem från Rumänien."
// Körs av GitHub Actions flera gånger på kvällen; skickar tidigast 16 svensk tid
// och minns per prenumeration vilket datum den senast fick något.
// Beslut och avvägningar: docs/arsdagsnotiser.md
//
// ---- Varför inget tjänstekonto ----
// Första försöket använde firebase-admin med en tjänstekontonyckel. Google
// vägrade: organisationen förbjuder att såna nycklar skapas, vilket är en
// rimlig policy som inte ska slås av för ett familjeprojekt.
//
// Sändaren loggar därför in som en vanlig användare, precis som appen, och går
// via Firestores REST-API. Det är dessutom **mindre** makt än en tjänstekonto-
// nyckel, som går förbi Firestore-reglerna helt och hållet. Kontot behöver stå i
// familjen() i firestore.rules, och lösenordet ligger som GitHub-secret.

const fs = require('fs');
const path = require('path');
// web-push laddas först i main(). Reglerna nedan går då att testa med bara node,
// utan att installera något.

const VAPID_PUBLIC = 'BFhuKfDnP9P-LzD10zHVCEcFZzNiXyncDz_xYy36kvALo3M3DEEuM0ayTnTBMS0FQ20aB10lucZRExHQj81RRwQ';
const BAS = process.env.APP_URL || 'https://resekartan.tomairaksinen.se/';
// Samma projekt och nyckel som appen. Nyckeln är inte hemlig – den identifierar
// bara projektet, och det som skyddar datat är Firestore-reglerna.
const PROJEKT = 'resekartan-3b126';
const API_NYCKEL = 'AIzaSyCwHQkNu1DRWNCckIHq3fftZOmAw0rHgxQ';
const DOKUMENT = `https://firestore.googleapis.com/v1/projects/${PROJEKT}/databases/(default)/documents`;
const TIMME = 16;                       // tidigast, svensk tid
const TVINGA = process.env.TVINGA === '1';   // för manuell körning och test
const TORRKORNING = process.env.TORRKORNING === '1';
/* En riktig notis till alla enheter, oavsett årsdagar och klockslag. Finns för
   att kunna se hela kedjan fungera – VAPID, prenumeration, service worker – utan
   att vänta på att en resa faktiskt fyller år. Skickar på riktigt; torrkörning
   vore meningslöst här. */
const PROVNOTIS = process.env.PROVNOTIS === '1';

// ---- Landnamn på svenska, ur samma tabell som appen ----
const isoRa = fs.readFileSync(path.join(__dirname, '..', 'data', 'iso.js'), 'utf8');
const ISO = JSON.parse(isoRa.slice(isoRa.indexOf('{'), isoRa.lastIndexOf('}') + 1));
const regionName = new Intl.DisplayNames(['sv'], { type: 'region' });
const landnamn = iso => {
  const a = ISO[iso] && ISO[iso][0];
  try { return a ? regionName.of(a) : 'okänt land'; } catch(e){ return a || 'okänt land'; }
};
// Flaggan ur alpha-2, samma sätt som i appen: två regionindikatorer
const flagga = iso => {
  const a = ISO[iso] && ISO[iso][0];
  return a ? String.fromCodePoint(...[...a].map(c => 127397 + c.charCodeAt(0))) : '';
};

/* ---- Firestore över REST ----
   REST-API:et svarar med typade värden ({ stringValue: … }) och vill ha samma
   form tillbaka. Två små översättare räcker för det vi lagrar. */
function fromFs(v){
  if(v == null) return null;
  if('nullValue' in v) return null;
  if('stringValue' in v) return v.stringValue;
  if('booleanValue' in v) return v.booleanValue;
  if('integerValue' in v) return +v.integerValue;
  if('doubleValue' in v) return v.doubleValue;
  if('timestampValue' in v) return v.timestampValue;
  if('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if('mapValue' in v){
    const ut = {};
    for(const [k, x] of Object.entries(v.mapValue.fields || {})) ut[k] = fromFs(x);
    return ut;
  }
  return null;
}
const doc2obj = d => {
  const ut = {};
  for(const [k, v] of Object.entries(d.fields || {})) ut[k] = fromFs(v);
  return ut;
};

async function loggaIn(){
  const { FIREBASE_EMAIL, FIREBASE_PASSWORD } = process.env;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_NYCKEL}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FIREBASE_EMAIL, password: FIREBASE_PASSWORD, returnSecureToken: true })
  });
  const d = await r.json();
  if(!r.ok) throw new Error('Inloggningen misslyckades: ' + (d.error?.message || r.status));
  return d.idToken;
}

const fsHamta = async (token, vag) => {
  const r = await fetch(`${DOKUMENT}${vag}`, { headers: { Authorization: 'Bearer ' + token } });
  const d = await r.json();
  if(!r.ok) throw new Error(`Firestore ${r.status} på ${vag}: ${d.error?.message || ''}`);
  return d;
};

/* Hela prenumerationslistan, sida för sida. Fler än 300 enheter lär det aldrig
   bli, men en sida som tystnar mitt i vore ett fel som aldrig syntes. */
async function hamtaPush(token){
  const ut = [];
  let token_sida = '';
  do {
    const d = await fsHamta(token, `/resekartan/data/push?pageSize=300` + (token_sida ? `&pageToken=${token_sida}` : ''));
    (d.documents || []).forEach(x => ut.push({ id: x.name.split('/').pop(), ...doc2obj(x) }));
    token_sida = d.nextPageToken || '';
  } while(token_sida);
  return ut;
}

const markeraSand = (token, id, datum) =>
  fetch(`${DOKUMENT}/resekartan/data/push/${id}?updateMask.fieldPaths=lastSent`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { lastSent: { stringValue: datum } } })
  });

const taBort = (token, id) =>
  fetch(`${DOKUMENT}/resekartan/data/push/${id}`, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });

// ---- Klockan i Sverige ----
function stockholm(){
  const nu = new Date();
  const datum = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
  const timme = +new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    hour: '2-digit', hour12: false }).format(nu);
  return { datum, timme };
}

// ---- Samma regler som i app.js ----
const ORD = ['noll','ett','två','tre','fyra','fem','sex','sju','åtta','nio','tio','elva','tolv'];
const arOrd = n => ORD[n] || String(n);
const skottar = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const resansFolk = t => [...new Set([...(t.who || []), ...(t.stops || []).flatMap(s => s.who || [])])];

const arsdagGaller = (ar, lage) => ar >= 1 && (
  lage === 'allt' ? true :
  lage === 'sparsamt' ? ar % 5 === 0 :
  ar === 1 || ar === 2 || ar % 5 === 0);

function arsdagarPa(trips, datum, lage, personer){
  const [y, m, d] = datum.split('-').map(Number);
  const ut = [];
  trips.forEach(t => {
    if(t.planned || !t.end) return;
    const [ey, em, ed] = String(t.end).split('-').map(Number);
    // 29 februari får sin årsdag den 28:e de år som inte är skottår
    const traff = (em === m && ed === d) || (em === 2 && ed === 29 && m === 2 && d === 28 && !skottar(y));
    if(!traff) return;
    const ar = y - ey;
    if(!arsdagGaller(ar, lage)) return;
    if(personer && personer.length && !resansFolk(t).some(id => personer.includes(id))) return;
    ut.push({ t, ar });
  });
  return ut.sort((a, b) => a.ar - b.ar);
}

const dagar = t => {
  const a = new Date(t.start + 'T12:00:00'), b = new Date(t.end + 'T12:00:00');
  if(isNaN(a) || isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / 864e5) + 1);
};

/* "ni" när hela familjen var med, annars namnen. Aldrig "du": en prenumeration
   är anonym, så avsändaren vet inte vem som håller i telefonen. */
function vilka(t, people){
  const folk = resansFolk(t);
  const karna = people.filter(p => p.core);
  const med = karna.filter(p => folk.includes(p.id));
  if(karna.length && med.length === karna.length) return 'ni';
  const namn = (med.length ? med : people.filter(p => folk.includes(p.id))).map(p => p.name);
  if(!namn.length) return 'ni';
  if(namn.length === 1) return namn[0];
  return namn.slice(0, -1).join(', ') + ' och ' + namn.at(-1);
}

/* Resans namn, inte landet. Oftast är de samma, men har man döpt resan till
   "Sportlovet i Åre" är det den man minns. En resa utan namn faller tillbaka på
   landet. Priset är att ett namn inte alltid böjs snällt efter "från"; det är en
   rimlig växling mot att få med det man själv skrev. */
const resnamn = t => (t.title || '').trim() || landnamn(t.stops?.[0]?.iso);

function notis(traffar, people, datum){
  if(traffar.length === 1){
    const { t, ar } = traffar[0];
    /* Ingen brödtext. Meningen är hela notisen, och en notis på en låst skärm
       rymmer ändå bara ett par rader – orter, land och dagar trängde bara undan
       det som betyder något. Resten står i appen, ett tryck bort. */
    const flg = flagga(t.stops?.[0]?.iso);
    return {
      title: `I dag för ${arOrd(ar)} år sedan kom ${vilka(t, people)} hem från ${resnamn(t)}${flg ? ' ' + flg : ''}`,
      body: '',
      url: `${BAS}#resa=${encodeURIComponent(t.id)}`
    };
  }
  /* Flera samma dag: bara antalet. Listan med land och årtal fick inte plats på
     en iPhone och klipptes mitt i – och den som är nyfiken är ett tryck bort. */
  const n = traffar.length;
  const rubrik = (ORD[n] || n) + ' resor har årsdag i dag!';
  return {
    title: rubrik.charAt(0).toUpperCase() + rubrik.slice(1) + ' 🥳',
    body: '',
    url: `${BAS}#arsdag=${datum}`
  };
}

async function main(){
  const { VAPID_PRIVATE, FIREBASE_EMAIL, FIREBASE_PASSWORD } = process.env;
  const saknas = ['VAPID_PRIVATE', 'FIREBASE_EMAIL', 'FIREBASE_PASSWORD']
    .filter(n => !process.env[n]);
  if(saknas.length){
    console.error('Saknar ' + saknas.join(', ') + ' – lägg dem som GitHub-secrets.');
    process.exit(1);
  }
  const webpush = require('web-push');
  const { datum, timme } = stockholm();
  /* Tidigast 16, inte exakt 16. Schemalagda jobb på GitHub startar ofta några
     minuter sent och ibland mycket mer, och med ett exakt timtest hoppades dagen
     tyst över. I stället minns varje prenumeration vilket datum den senast fick
     något, så en försenad körning hinner ikapp utan att någon får dubbelt. */
  if(timme < TIMME && !TVINGA && !PROVNOTIS){
    console.log(`Klockan är ${timme} i Stockholm, notiser går ut tidigast ${TIMME}. Gör inget.`);
    return;
  }
  webpush.setVapidDetails('mailto:tom.airaksinen@kleer.se', VAPID_PUBLIC, VAPID_PRIVATE);
  const token = await loggaIn();

  const doc = await fsHamta(token, '/resekartan/data');
  let data;
  try { data = JSON.parse(doc2obj(doc).payload); }
  catch(e){ console.error('Kunde inte tolka payload:', e.message); process.exit(1); }
  const trips = data.trips || [], people = data.people || [];

  const prenumerationer = await hamtaPush(token);
  console.log(`${datum}: ${trips.length} resor, ${prenumerationer.length} prenumerationer`);

  let skickade = 0, tomma = 0, redan = 0, stadade = 0;

  if(PROVNOTIS){
    console.log('PROVNOTIS: skickar en riktig notis till alla enheter.');
    for(const p of prenumerationer){
      if(!p.enabled || !p.subscription) continue;
      try {
        await webpush.sendNotification(p.subscription, JSON.stringify({
          title: 'Provnotis från Resekartan 🥳',
          body: 'Kommer den här fram gör årsdagsnotiserna det också.',
          url: BAS
        }));
        console.log(`  ${p.id}: skickad`);
        skickade++;
      } catch(e){
        if(e.statusCode === 404 || e.statusCode === 410){ await taBort(token, p.id); stadade++; }
        else console.error(`  ${p.id}: fel ${e.statusCode || ''} ${e.message}`);
      }
    }
    console.log(`Klart: ${skickade} skickade, ${stadade} borttagna. Inga lastSent rördes.`);
    return;
  }
  for(const p of prenumerationer){
    if(!p.enabled || !p.subscription) continue;
    if(p.lastSent === datum && !TVINGA){ redan++; continue; }   // dagen är redan avklarad
    const traffar = arsdagarPa(trips, datum, p.lage || 'lagom', p.personer);
    if(!traffar.length){
      // Märk dagen ändå, annars räknas resorna om vid varje körning
      if(!TORRKORNING) await markeraSand(token, p.id, datum);
      tomma++;
      continue;
    }
    const nyttolast = notis(traffar, people, datum);
    console.log(`  ${p.id}: ${traffar.length} träff – ${nyttolast.title}`);
    if(TORRKORNING) continue;
    try {
      await webpush.sendNotification(p.subscription, JSON.stringify(nyttolast));
      await markeraSand(token, p.id, datum);
      skickade++;
    } catch(e){
      // 404/410 = prenumerationen finns inte längre; appen är avinstallerad
      if(e.statusCode === 404 || e.statusCode === 410){
        await taBort(token, p.id);
        stadade++;
      } else {
        console.error(`  ${p.id}: fel ${e.statusCode || ''} ${e.message}`);
      }
    }
  }
  console.log(`Klart: ${skickade} skickade, ${tomma} utan årsdag, ${redan} redan avklarade, ${stadade} borttagna.`);
}

// Reglerna går att testa utan Firebase: kör filen direkt så skickar den,
// require:a den så får man bara funktionerna.
module.exports = { arsdagarPa, notis, vilka, landnamn, flagga, resnamn, arOrd, stockholm, dagar, fromFs, doc2obj };
if(require.main === module) main().catch(e => { console.error(e); process.exit(1); });

// Skickar årsdagsnotiser: "I dag för fem år sedan kom ni hem från Rumänien."
// Körs av GitHub Actions 14 och 15 UTC; skriptet gör bara något när klockan i
// Stockholm faktiskt är 16, vilket täcker både sommar- och vintertid.
// Beslut och avvägningar: docs/arsdagsnotiser.md
//
// Resorna ligger i Firestore, som till skillnad från Realtime Database inte har
// någon genväg med en DB-secret över REST. Därför firebase-admin med ett
// tjänstekonto – den enda delen som inte fanns i Flippa sedan tidigare.

const fs = require('fs');
const path = require('path');
// firebase-admin och web-push laddas först i main(). Reglerna nedan går då att
// testa med bara node, utan att installera något.

const VAPID_PUBLIC = 'BFhuKfDnP9P-LzD10zHVCEcFZzNiXyncDz_xYy36kvALo3M3DEEuM0ayTnTBMS0FQ20aB10lucZRExHQj81RRwQ';
const BAS = process.env.APP_URL || 'https://resekartan.tomairaksinen.se/';
const TIMME = 16;                       // svensk tid
const TVINGA = process.env.TVINGA === '1';   // för manuell körning och test
const TORRKORNING = process.env.TORRKORNING === '1';

// ---- Landnamn på svenska, ur samma tabell som appen ----
const isoRa = fs.readFileSync(path.join(__dirname, '..', 'data', 'iso.js'), 'utf8');
const ISO = JSON.parse(isoRa.slice(isoRa.indexOf('{'), isoRa.lastIndexOf('}') + 1));
const regionName = new Intl.DisplayNames(['sv'], { type: 'region' });
const landnamn = iso => {
  const a = ISO[iso] && ISO[iso][0];
  try { return a ? regionName.of(a) : 'okänt land'; } catch(e){ return a || 'okänt land'; }
};

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
   "Sportlovet i Åre" är det den man minns – och landet står kvar i brödtexten,
   så ingenting går förlorat. Priset är att ett namn inte alltid böjs snällt
   efter "från"; det är en rimlig växling mot att få med det man själv skrev. */
const resnamn = t => (t.title || '').trim() || landnamn(t.stops?.[0]?.iso);

function notis(traffar, people, datum){
  if(traffar.length === 1){
    const { t, ar } = traffar[0];
    const orter = (t.stops || []).flatMap(s => (s.places || []).map(p => p.name)).filter(Boolean);
    const land = landnamn(t.stops?.[0]?.iso);
    const d = dagar(t);
    return {
      title: `I dag för ${arOrd(ar)} år sedan kom ${vilka(t, people)} hem från ${resnamn(t)}`,
      // Landet först: står det redan i namnet upprepas det inte
      body: [resnamn(t).toLowerCase().includes(land.toLowerCase()) ? '' : land,
             orter.slice(0, 4).join(', '),
             d ? `${d} ${d === 1 ? 'dag' : 'dagar'}` : ''].filter(Boolean).join(' · '),
      url: `${BAS}#resa=${encodeURIComponent(t.id)}`
    };
  }
  const n = traffar.length;
  const rubrik = (ORD[n] || n) + ' resor har årsdag i dag';
  return {
    title: rubrik.charAt(0).toUpperCase() + rubrik.slice(1),
    body: traffar.map(({ t, ar }) => `${resnamn(t)} för ${arOrd(ar)} år sedan`).join(' · '),
    url: `${BAS}#arsdag=${datum}`
  };
}

async function main(){
  const { VAPID_PRIVATE, FIREBASE_SERVICE_ACCOUNT } = process.env;
  if(!VAPID_PRIVATE || !FIREBASE_SERVICE_ACCOUNT){
    console.error('Saknar VAPID_PRIVATE eller FIREBASE_SERVICE_ACCOUNT');
    process.exit(1);
  }
  const admin = require('firebase-admin');
  const webpush = require('web-push');
  const { datum, timme } = stockholm();
  if(timme !== TIMME && !TVINGA){
    console.log(`Klockan är ${timme} i Stockholm, notiser går ut ${TIMME}. Gör inget.`);
    return;
  }
  webpush.setVapidDetails('mailto:tom.airaksinen@kleer.se', VAPID_PUBLIC, VAPID_PRIVATE);
  admin.initializeApp({ credential: admin.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();

  const doc = await db.doc('resekartan/data').get();
  if(!doc.exists){ console.error('resekartan/data saknas'); process.exit(1); }
  let data;
  try { data = JSON.parse(doc.data().payload); }
  catch(e){ console.error('Kunde inte tolka payload:', e.message); process.exit(1); }
  const trips = data.trips || [], people = data.people || [];

  const snap = await db.collection('resekartan/data/push').get();
  console.log(`${datum}: ${trips.length} resor, ${snap.size} prenumerationer`);

  let skickade = 0, tomma = 0, stadade = 0;
  for(const d of snap.docs){
    const p = d.data();
    if(!p || !p.enabled || !p.subscription){ continue; }
    const traffar = arsdagarPa(trips, datum, p.lage || 'lagom', p.personer);
    if(!traffar.length){ tomma++; continue; }
    const nyttolast = notis(traffar, people, datum);
    console.log(`  ${d.id}: ${traffar.length} träff – ${nyttolast.title}`);
    if(TORRKORNING) continue;
    try {
      await webpush.sendNotification(p.subscription, JSON.stringify(nyttolast));
      skickade++;
    } catch(e){
      // 404/410 = prenumerationen finns inte längre; appen är avinstallerad
      if(e.statusCode === 404 || e.statusCode === 410){
        await d.ref.delete();
        stadade++;
      } else {
        console.error(`  ${d.id}: fel ${e.statusCode || ''} ${e.message}`);
      }
    }
  }
  console.log(`Klart: ${skickade} skickade, ${tomma} utan årsdag, ${stadade} borttagna.`);
}

// Reglerna går att testa utan Firebase: kör filen direkt så skickar den,
// require:a den så får man bara funktionerna.
module.exports = { arsdagarPa, notis, vilka, landnamn, resnamn, arOrd, stockholm, dagar };
if(require.main === module) main().catch(e => { console.error(e); process.exit(1); });

#!/bin/bash
# Tar om skärmdumparna till sidan /om.
#
#   scripts/skarmdumpar.sh [mapp-med-foton]
#
# Alltid exempeldatat i data/seed.js, aldrig familjens riktiga resor – sidan och
# repot är publika. Anges en mapp läggs bilderna i den in på Italien-resan, så
# galleriet och omslaget syns; de skalas till 1400 px på vägen in.
#
# Två fällor som kostade en stund första gången:
#   * headless Chrome golvar bredden vid 500 px. Mindre --window-size ger ändå
#     500 och en beskuren bild. Appen körs därför i en iframe på 393×852, så
#     både formatet och layouten blir en riktig telefon.
#   * utan --force-prefers-reduced-motion hinner kartans flygning aldrig bli
#     klar: d3:s övergångar drivs inte av den virtuella tiden.

set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
FOTON="${1:-}"
TMP="$(mktemp -d)"
PORT=8577
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
trap 'rm -rf "$TMP"; kill %1 2>/dev/null || true' EXIT

cp -R "$REPO/." "$TMP/"
rm -rf "$TMP/.git"

# Molnläget av → appen kör på seed.js, och låset hoppas över
python3 - "$TMP" "$FOTON" <<'PY'
import io, sys, os, base64, glob
tmp, fotomapp = sys.argv[1], sys.argv[2]

k = os.path.join(tmp, 'data/firebase-config.js')
s = io.open(k, encoding='utf-8').read()
io.open(k, 'w', encoding='utf-8').write(s[:s.rfind('window.FIREBASE_CONFIG = {')] + '/* av i skärmdumpsläget */\n')

bilder = []
if fotomapp:
    for f in sorted(glob.glob(os.path.join(fotomapp, '*')))[:8]:
        if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            typ = 'image/png' if f.lower().endswith('.png') else 'image/jpeg'
            bilder.append('data:%s;base64,%s' % (typ, base64.b64encode(open(f, 'rb').read()).decode()))
    print('  %d foton läggs in' % len(bilder))

a = io.open(os.path.join(tmp, 'app.js'), encoding='utf-8').read()
a = a.replace('    if(unlocked) openApp();', '    if(true) openApp();', 1)
a += '''
/* ---- Skärmdumpsläge, se scripts/skarmdumpar.sh ---- */
const SKOTT_FOTON = %s;
setTimeout(async () => {
  const vad = new URLSearchParams(location.search).get('skott') || 'karta';
  filter.clear(); family().forEach(p => filter.add(p.id));
  const it = DB.trips.find(t => t.title === 'Italien') || DB.trips[0];
  const iso = it.stops[0].iso;

  if(SKOTT_FOTON.length){
    // Krymp till samma storlekar som appen själv sparar, så bilderna beter sig lika
    const prev = await Promise.all(SKOTT_FOTON.map(u => scaleUrl(u, PREV_SIDE, PREV_Q)));
    const full = await Promise.all(SKOTT_FOTON.map(u => scaleUrl(u, PH_MAX_SIDE, .82)));
    phTrip = it.id;
    phCache = prev.map((p, i) => ({ id: 'skott' + i, tripId: it.id, ord: i, prev: p, url: full[i] }));
    it.thumb = await makeThumb(prev[0]);
    it.thumbOf = 'skott0'; it.thumbV = THUMB_V;
  }
  refreshAll();

  const stall = () => {
    if(vad === 'resa'){ showTrip(it.id); setSheet(SKOTT_FOTON.length ? .62 : .5, false); }
    else if(vad === 'galleri'){ showTrip(it.id); setSheet(.9, false); }
    else if(vad === 'land'){ showCountry(iso); setSheet(.5, false); }
    else if(vad === 'stat') setTab('stat');
    else if(vad === 'lander') setTab('lander');
    else setSheet(.5, false);
    ramaOm();
  };
  stall();
  setTimeout(() => {
    stall();
    if(phCache.length){ renderPhotos(); skarpHero(it.id, phCache); }
    if(vad === 'galleri') document.getElementById('phBody')?.scrollIntoView({ block: 'center' });
  }, 1200);
  setTimeout(() => {
    document.querySelectorAll('.spin').forEach(e => e.remove());
    if(!phCache.length) document.getElementById('photos')?.remove();
  }, 2700);
}, 1400);
''' % (str(bilder).replace("'", '"'))
io.open(os.path.join(tmp, 'app.js'), 'w', encoding='utf-8').write(a)

# Ramen som ger riktiga telefonmått trots headless golv på 500 px
io.open(os.path.join(tmp, 'telefon.html'), 'w', encoding='utf-8').write(
  '<!doctype html><meta charset="utf-8">'
  '<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}'
  'iframe{border:0;display:block;width:393px;height:852px}</style>'
  '<script>document.write("<iframe src=\\"/?skott="'
  ' + encodeURIComponent(new URLSearchParams(location.search).get("skott") || "karta") + "\\"></iframe>");</script>')
PY

cd "$TMP"
python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 2

VYER="karta resa land stat"
[ -n "$FOTON" ] && VYER="$VYER galleri"
for v in $VYER; do
  "$CHROME" --headless=new --disable-gpu --window-size=500,900 --hide-scrollbars \
    --force-prefers-reduced-motion=reduce --virtual-time-budget=10000 \
    --screenshot="$TMP/ra-$v.png" "http://localhost:$PORT/telefon.html?skott=$v" >/dev/null 2>&1
done

python3 - "$TMP" "$REPO" "$VYER" <<'PY'
from PIL import Image
import sys, os
tmp, repo, vyer = sys.argv[1], sys.argv[2], sys.argv[3].split()
ut = os.path.join(repo, 'om/bilder')
os.makedirs(ut, exist_ok=True)
for v in vyer:
    im = Image.open(os.path.join(tmp, f'ra-{v}.png')).convert('RGB').crop((0, 0, 393, 852))
    fil = os.path.join(ut, f'{v}.jpg')
    im.save(fil, quality=84, optimize=True)
    print(f'  om/bilder/{v}.jpg  {im.size[0]}×{im.size[1]}  {os.path.getsize(fil)//1024} kB')
PY

echo "Klart."

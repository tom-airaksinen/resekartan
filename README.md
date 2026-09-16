# Resekartan

Interaktiv världskarta över familjens resor. Mobilen först.

**Live:** https://tom-airaksinen.github.io/resekartan/

## Deploya

```sh
git push          # GitHub Pages bygger om från main automatiskt
```

Repot är publikt – det krävs för Pages på GitHub Free. Familjens riktiga resor
ligger aldrig här utan i `localStorage` (och senare Firebase), och lösenordet står
varken i koden eller i den här filen.

## Status

**Live sedan 2026-09-16.** Appen går att använda: lösenordslås, karta, och ett
gränssnitt för att lägga till, ändra och ta bort resor. Data ligger i `localStorage`
på varje enhet. Nästa steg är Firebase, så alla fyra delar samma data.

## Kör lokalt

```sh
python3 -m http.server 8000     # öppna http://localhost:8000
```

Krävs för att `data/world-110m.js` ska laddas (går även med `file://`, men
servern är enklare).

## Så är den byggd

- Vanilla HTML/CSS/JS, som Flippa, Gnugga och Morsemaskinen.
  `index.html` (markup + stil), `app.js` (all logik), `data/` (karta och exempel).
- `d3` + `topojson` från cdnjs för projektion och zoom.
- Mobil: karta i helskärm, bottenark med resorna, flikrad längst ner.
  Desktop (≥900px): kartan till vänster, sidopanel till höger, flikarna som en smal rail.

### Kartdata

`data/world-50m.js` – Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas),
public domain, inlagt som `window.WORLD` så det laddas utan fetch/CORS. 755 kB rått,
~236 kB över gzip. På den skalan har Hongkong och Macau egna ytor; Gibraltar är för
litet och visas bara som plupp.

`data/iso.js` – ISO 3166-1 numerisk → alpha-2 plus en fallbackposition. Svenska
landnamn kommer ur `Intl.DisplayNames`, flaggor ur alpha-2-koden, så det finns
ingen handskriven landlista att underhålla.

Vill man ha ännu finare kustlinjer är 1:10m nästa steg, men den måste byggas från
Natural Earths shapefiles (mapshaper) och blir flera megabyte.

Kartan går att zooma till 400×. Så nära blir kustlinjerna kantiga – 50m-datat har
inte den detaljen – men pluppar, ortsnamn och linjer håller sin storlek hela vägen
eftersom allt som ritas ovanpå skalas med `1/k` i `rescale()`.

### Två CSS-fällor värda att minnas

**CSS vinner över presentationsattribut.** Kartans linjebredder räknas fram per
zoomnivå i `rescale()` och sätts som attribut. Skriver man `stroke-width` i
CSS-regeln för `.land` eller `.clabel` vinner CSS, attributet ignoreras, och
linjerna skalas med kartan – vid landvyns zoom blev de tio pixlar breda. Sätt
aldrig `stroke-width` i CSS för element vars bredd `rescale()` styr.

**Versaler sitter högt i sin radbox.** Initialen i `.av` ligger i ett `<i>` som
skjuts ned `.07em`, annars hamnar bokstaven ungefär en pixel ovanför cirkelns mitt.

### Dialoger

`alert()` och `confirm()` är blockerade i sandlådade inbäddningar (t.ex. en
publicerad artefakt), där de tyst gör ingenting. Appen använder därför egna rutor:
`ask()` för bekräftelser, `toast()` för kvittenser och ett felmeddelande i
redigeringsfotens `#edErr` för validering. Använd inte de inbyggda.

### Lösenord

Sidan är statisk och repot är publikt, så låset håller nyfikna ute – inte någon som
läser källkoden. I `app.js` ligger bara en PBKDF2-hash (150 000 varv, SHA-256),
aldrig lösenordet självt, och lösenordet skrivs inte heller här.

Byt det under Inställningar → Lösenord: appen räknar fram den nya raden att klistra
in i `AUTH` i `app.js`. Upplåsningen sparas sedan per enhet i `localStorage`.

Riktiga resor hamnar i `localStorage` (och sedan Firebase), aldrig i repot – så
koden kan ligga publikt utan att familjens resor gör det.

## Datamodell (exempel i `data/seed.js`)

En **resa** har titel, datum, deltagare (`who`) och en lista `stops`.
Första stoppet är huvudmålet; övriga kan vara **avstickare** (`side: true`) med
egna `start`/`end`/`who` – annars ärvs resans. Avstickare räknas som besökta
länder i statistiken men ritas med tunnare plupp och streckad linje till huvudmålet,
så det syns att de hör ihop.

Varje stopp har `iso` (numerisk landkod) och `places`:
`{name, lat, lon, what}` – `what` är "vad vi gjorde" och visas i landvyn.

**Hemlandet** (`home.iso`) ritas i egen varm färg med hus-markör på hemorten
(`home.place`). Det räknas inte som "besökt land" i totalen, men svenska resor
räknas som resor, dagar och platser. Ändras under Inställningar.

## Landvy

Tryck på ett färgat land (eller på Sverige) → kartan zoomar in på hela landet och
varje besökt ort får en egen plupp med utsatt namn, medan arket listar resorna dit
med datum, deltagare och vad vi gjorde på varje plats.

Zoomrutan utgår från landets **största landmassa** – annars drar Alaska ut hela
USA-vyn – och utökas med platser som ligger utanför den (Gotland, Själland).
Ortsnamn placeras runt pluppen och hoppas över om de ändå krockar.

## Lägga in resor

Resor → **Ny resa** börjar med att söka fram landet; de senast besökta ligger som
snabbval. Sedan kommer resten av formuläret med titeln förifylld.

**Datum** väljs i en egen kalender: årsrad överst, månaderna under varandra.
Första klicket sätter startdagen, nästa sätter slutdagen.

**Platsens position** söks fram medan man skriver, eller pekas ut på kartan
(kartnålen). Sökningen kräver nätverk och blockeras i sandlådade förhandsvisningar (som en
publicerad artefakt, vars CSP inte släpper igenom anrop utåt) – då fungerar
kartpekningen ändå, och den zoomar automatiskt in på stoppets land först.

Sökningen frågar två gratistjänster parallellt, båda utan konto eller API-nyckel:

| | Styrka |
|---|---|
| [Nominatim](https://nominatim.org/) (OpenStreetMap) | Öar och regioner – den hittar Korsika. Svarar med svenska namn. |
| [Photon](https://photon.komoot.io/) (komoot) | Byggd för att söka medan man skriver; bättre på småorter. |

Träffarna slås ihop, dubbletter faller bort (Nominatim vinner, för de svenska
namnen) och resultatet filtreras på **stoppets land** – söker man "Korsika" på en
Frankrike-resa hamnar rätt ö först. Sökningen väntar 450 ms efter sista tecknet,
vilket håller sig väl inom Nominatims policy på max en förfrågan per sekund.

Betalalternativ som Google Places eller Mapbox behövs inte för den här
användningen, och skulle kräva API-nyckel och kreditkort.

**Resenärer:** familjen (`core: true`) är förkryssad på varje ny resa. Övriga –
kompisar, mor- och farföräldrar – ligger under och kryssas i när de var med. Nya
personer läggs till direkt i resedialogen eller under Inställningar. Filtret på
kartan visar bara familjen; övriga syns på resorna men inte som filterval.

Familjen har varsin färg; övriga delar en dämpad stil och känns igen på namnet, som
alltid står utskrivet där det spelar roll. I den kompakta avatarraden visas familjen
som brickor och resten som "+N" – annars går två gäster med samma initial inte att
skilja åt.

Under Inställningar finns en säkerhetskopia: hela datat som text att kopiera undan
eller klistra tillbaka.

## Nästa steg

1. Firebase som gemensam databas, så alla fyra kan lägga in från mobil, padda och dator.
   Då blir också frågan om publik sajt eller inloggning skarp – se `docs/oppna-fragor.md`.
3. Foton per resa, grupperade per person. Se `docs/mockup-feedback.md`.

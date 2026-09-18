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

### Teman

Två teman: **Standard** (som förut) och **Hedvig** (rosa), under Inställningar →
Utseende. Valet ligger i `localStorage` per enhet, aldrig i `DB`, så Hedvigs rosa
inte följer med till de andras telefoner via molnet.

Allt är CSS-variabler. Standard sätter ingen `data-theme` alls och följer därför
systemets ljusa/mörka läge som tidigare. Rosa sätter `data-theme="rosa"` och är
bara ljust – därför är den mörka media-frågan i `index.html` undantagen med
`:not([data-theme="rosa"])`. Missar man det undantaget när ett tema läggs till
ritas det mörka temats färger ovanpå det nya i en telefon som står i mörkt läge.

### Omslagsbilder och miniatyrer

En resa med minst en bild visar sitt omslag i stället för flaggan i Senaste resor
och Alla resor. Omslaget är resans **första** bild, och ordningen ändras genom att
dra rutorna i galleriet.

Miniatyren ligger på resan själv i `DB` (`thumb`, en 144 px-JPEG, plus `thumbOf`
som är id:t den gjordes av) – inte bland bilderna. Det är med flit:

- Listorna ritas direkt, utan att vänta på lagringen, och uppdateras i samma
  ögonblick som omslaget byts.
- Alternativet vore en uppslagning per resa vid varje start. I molnläge blir det
  en nedladdning på några hundra kB per resa, varje gång appen öppnas.
- Priset är några kB per resa i huvuddokumentet. Med `thumb` runt 5 kB rymmer
  Firestores gräns på 1 MB långt över hundra resor, men det är den gränsen att
  hålla ögonen på om biblioteket växer.

`syncThumb()` håller den aktuell: efter uppladdning, borttagning, omordning och
när ett galleri från före v19 öppnas första gången.

### Bilderna: förhandsbild och original

Omslaget i listorna är liggande 4:3 (240 × 180 px, visas i 96 × 72). De flesta
resebilder är liggande. `THUMB_V` räknas upp när formatet ändras, så omslag som
redan ligger sparade görs om nästa gång resan öppnas.

Rader utan bild får samma ruta med flaggan i, så vänsterkanten blir rak i en
blandad lista. Samma ruta används i landvyns resor. Landraderna i Länder rör vi
inte – de har aldrig bilder, och väljs med `[data-trip]` i väljaren.

Galleriet visar en förhandsbild på 400 px, inte originalet. Originalet på max
1400 px hämtas först när man öppnar bilden i helskärm, och visaren målar upp
förhandsbilden direkt medan den väntar. En resa med tjugo bilder laddar därmed
några hundra kB i stället för flera megabyte.

Det kräver att de ligger i **skilda poster** – Firestore hämtar alltid hela
dokument, och en stor IndexedDB-post kostar minne även lokalt:

| Var | Innehåll |
| --- | --- |
| `foton` | uppgifter om bilden + `prev` (400 px) |
| `bilder` | `url`, originalet (1400 px) |

Galleriet läser **molnets diskcache först** och låter servern komma ikapp i
bakgrunden, så en trög uppkoppling inte lämnar rutnätet snurrande. Går det ändå
fel visas ett meddelande med en **Försök igen**-knapp i stället för en
återvändsgränd.

Bilder som lades in före v21 har originalet kvar i `foton`. De flyttas
automatiskt, en i taget i bakgrunden, när resan öppnas. Originalet skrivs alltid
före posten som pekar på det, så ett avbrutet nät aldrig lämnar en bildruta utan
bild bakom.

### Bildvisaren glider

Spåret i helskärmsläget håller tre rutor: föregående, den man tittar på, och
nästa. Att byta bild flyttar spåret en rutbredd åt sidan; när glidningen är klar
ritas rutorna om med den nya bilden i mitten och spåret nollställs utan övergång.
Fler än tre rutor vore bara fler avkodade bilder i minnet utan att synas.

Två saker som annars blinkar:

- **Bilden får en fast ruta**, `width:100%;height:100%;object-fit:contain`. Låter
  man bildens egen storlek bestämma boxen ritas förhandsbilden på 400 px liten och
  hoppar sedan upp när originalet kommit – tydligast på stående bilder.
- **Vid ett steg roteras noderna**, de ritas inte om. Rutan som redan syns blir den
  nya mitten och bara den som hamnat utanför fylls med en ny bild. Ritade vi om
  alla tre skulle bilden man just glidit fram till avkodas en gång till.
- Originalet avkodas färdigt med `decode()` innan det byts in, annars hinner rutan
  bli tom ett ögonblick.
- **En tom ruta måste ligga kvar i flödet.** Gömdes den med `hidden` föll den ur
  flexraden, de två andra gled ett steg åt vänster, och spåret – som alltid står
  på `-100%` – hamnade på nästa bild i stället för den man valde. Det slog bara
  till på första bilden, där rutan före är tom, och gav symtomen "första
  miniatyren öppnar bild två" och "bild två visas igen när man sveper dit". Det är
  bara `<img>` som göms.

Svepet låter bilden följa fingret, och i ändarna dämpas dragningen till en
tredjedel så den tar emot i stället för att glida ut i tomma intet. `touch-action:
pan-y` på ytan hindrar webbläsaren från att tolka svepet som sitt eget bakåtsvep.

`transitionend` är inte att lita på ensamt – en dold flik eller ett avbrutet
skede kan svälja den, så en timeout på 450 ms städar upp. Med `prefers-reduced-motion`
byts bilden rakt av utan glid.

**Att ta bort en bild sker bara i helskärmsläget.** Kryssen i rutnätet togs bort:
man raderar sällan, och de gjorde att man inte vågade trycka på bilderna.

### Dra för att ändra ordning

HTML5:s drag and drop finns inte på touch, så galleriet använder pointer-händelser
(`phDrag` i `app.js`). På telefonen startar ett långtryck på 260 ms draget; med mus
räcker det att dra fem pixlar. Rör sig fingret mer än åtta pixlar innan långtrycket
gått är det en skrollning, och draget avbryts.

Tre fällor:

- `touch-action` på rutorna är `pan-y` så sidan fortfarande går att skrolla.
- Skrollningen under ett pågående drag stoppas av en egen `touchmove`-lyssnare
  med `passive: false`. `preventDefault` på pointer-händelser gör ingenting åt
  saken.
- **`-webkit-touch-callout: none` måste sitta på bildrutorna.** Utan den öppnar
  iOS sin egen Dela/Spara-meny på långtryck, och draget kommer aldrig igång.
- **`renderPhotos()` ritar inte om mitt i ett drag.** Rutan man håller i blir då
  en lös nod, och nästa flytt klistrar in den igen bredvid sin egen ersättare –
  samma bild syns två gånger fast räknaren säger rätt antal. Omritningen skjuts
  upp till draget släppts (`phDrag.pending`).

### Färgskalan på kartan

Besökta länder färgas efter hur många resor som gått dit, i tre steg: `--v1`,
`--v2`, `--v3`. Skalan är **relativ mot den vy man har framför sig** – mörkast är
alltid det mest besökta landet bland de resor som visas, ljusast är ett besök.
Filtrerar man på en person styr hennes fördelning, så tre resor kan vara mörkast
för en i familjen och ljusast för en annan.

Absoluta gränser (1 / 2–3 / 4+) provades först och gjorde kartan platt för den
som rest mindre: har man som mest varit tre gånger någonstans hamnar allt i
samma ton, och det roliga med att se sitt eget mest besökta land försvinner.

Priset för en relativ skala är att en nyans inte betyder samma sak hela tiden.
Det löses genom att teckenförklaringen skriver ut de faktiska talen – `legendRamp()`
räknar fram vilka antal som hamnar i vilket steg och visar bara de steg som
används. Skalan får aldrig vara en gissning.

Tre steg räcker. Fler nyanser går ändå inte att skilja åt i ett litet land på en
telefonskärm. Stegen är jämna i ljushet, inte i mättnad, så skillnaden syns lika
tydligt mellan varje par.

Ytorna är **platta, inte gradienter**. En gradient gjorde att samma antal resor
såg olika ut beroende på var på jorden landet låg, vilket är precis vad en
färgskala inte får göra.

Teckenförklaringen ankras ovanför bottenarket via `--sheet-h`, som `setSheet()`
skriver. Innan dess låg den bakom arket och syntes aldrig på en telefon.

På telefonen är den **av som standard** och fälls upp med infoknappen i toppraden;
valet ligger kvar på enheten. Från 900 px och uppåt finns plats, och då ligger den
framme hela tiden utan knapp.

### Alla resor är inte samma sak som hela familjen

Resenärsväljaren har två lägen överst som är lätta att blanda ihop. **Alla resor**
filtrerar inte alls. **Hela familjen** kryssar i alla fyra, och eftersom flera
valda personer betyder *och* – inte *eller* – visas då bara resor där alla var med.
Det är också utgångsläget vid varje start: kartan handlar om familjens gemensamma
resor, och enskildas ligger ett tryck bort.

Det stod tidigare bara "Alla" under rubriken "Visa resor där dessa var med", vilket
lovade det ena och gjorde det andra: en resa där bara en av oss var med syntes ändå.

### Länk till resan

Varje resa kan ha en adress, typiskt ett fotoalbum men lika gärna en blogg. Den
sparas i `t.link` och visas som en rad i resedetaljen, med ett namn som härleds ur
värdnamnet (`linkName()` känner igen Google Photos, iCloud och några till, annars
visas domänen).

Importen läser också en länk: står en adress var som helst på raden plockas den
bort innan resten tolkas, så den inte förväxlas med datum eller ortnamn.

`cleanUrl()` släpper bara igenom http och https, och lägger till https när
protokollet saknas. Fältet renderas som en `href`, så inget annat protokoll får ta
sig in. Vill man ha flera länkar per resa längre fram är `t.link` det som behöver
bli en lista.

### Toppraden på kartan

`#top` har `align-items:flex-start`, och det är inte kosmetik. Utan den sträcker
sig raderna över hela scenen, och eftersom de bär `pointer-events:auto` lägger de
en osynlig yta ovanpå sidopanelens överkant. Där sitter Tillbaka-knappen, som
därmed slutade svara på klick utan att något syntes vara fel.

På desktop står sökfältet framme hela tiden i stället för att slås på med ett
förstoringsglas: där finns plats, och då behövs varken knappen eller Avbryt.
`#top` slutar också före panelen, så ingenting i toppraden kan nå in under den.

### Tillbaka landar där man kom ifrån

`backTab` minns vilken flik resan öppnades från. Öppnar man en resa ur Resor
hamnar man på kartan, och då är reselistan det man vill tillbaka till – inte
kartans ark. `clearSel()` har medvetet ingen tidig retur: ett tryck ska alltid
rita om, annars kan knappen kännas död i lägen där `sel` nollställts på annat
håll.

### Appikonen

Ikonen är en kartnål med en glob i huvudet, ritad i `icon.svg`. De fyra PNG-erna
i repot renderas ur den filen och ska inte redigeras för hand.

`icon-maskable.svg` är samma motiv nedkrympt till 72 %. Android beskär maskerbara
ikoner till en cirkel, och allt utanför den inre 80-procentiga ytan kan försvinna.

Genomskinlighet är medvetet bortvald: iOS tillåter den inte i hemskärmsikoner utan
fyller allt utanför motivet med svart. Bakgrunden är därför en egen ljus himmel.

> Byter man ikonen behåller iOS den gamla på hemskärmen. Ta bort genvägen och
> lägg till appen på nytt för att se den nya.

Samma motiv ligger också inlagt som SVG i `index.html`, i en `<symbol id="logga">`
som används två gånger: stort på låsskärmen och litet i pillret uppe till vänster.
Det är med flit en kopia av `icon.svg` och inte en bild: en begäran till hade
fördröjt just det som ska synas först. Ändrar man ikonen behöver därför både
`icon.svg` och symbolen i `index.html` uppdateras.

### Typsnitten får inte blinka in

Appnamnet blinkade till vid varje start: texten ritades först i reservtypsnittet
och byttes sedan mot Bricolage Grotesque när filen kommit.

Två saker orsakade det. Länken till Google Fonts stod på `display=swap`, vilket är
just instruktionen att byta in typsnittet mitt i, och service workern cachade inte
typsnittsfilerna, så de hämtades på nytt vid varje start.

Nu gäller `display=optional`: reservtypsnittet används bara om filen inte redan
finns, och då byts den aldrig i efterhand. Service workern cachar både css:en och
filerna från `fonts.gstatic.com`, så från andra starten och framåt ritas rätt
typsnitt direkt. Det finns också en `preconnect` till `fonts.gstatic.com` – utan
den öppnas anslutningen först när css:en har lästs.

Byter man typsnitt måste adressen uppdateras på båda ställena: `index.html` och
`SHELL` i `sw.js`.

### Låsskärmen är också startbilden

Formuläret ligger dolt i markupen och visas först när någon faktiskt behöver logga
in. Tidigare blinkade ett lösenordsfält förbi vid varje start medan Firebase
laddades, fast man redan var inloggad.

`sett()` avgör om enheten varit inne förut. Den tittar på tre saker, för en ny
flagga är tom första gången och då hade formuläret blinkat förbi en sista gång:
`resekartan.inloggad`, Firebases egen sparade inloggning (`firebase:authUser:…`),
och om det redan ligger resor i `resekartan.data`. Stämmer något av dem väntar
appen tyst med bara loggan; annars visas formuläret direkt, för då finns inget att
vänta på.

Tre saker tar fram formuläret: att inloggningen svarar att ingen är inloggad, att
något går fel, eller att tolv sekunder gått utan besked.

Statusraden under loggan **tar alltid sin plats** i kortet och döljs med
`visibility`, inte `display`. Dök den upp först när den behövdes växte kortet och
allt innehåll hoppade till mitt i starten. Texten visas dessutom först efter
1,2 sekunder, så en vanlig start hinner bli klar innan dess och man ser bara
loggan och sedan kartan.

Kortet står kvar när formuläret dyker upp, så startbilden växer till en
inloggningsruta i stället för att bytas ut.

### Nya inputtyper måste in i formulärregeln

Fältstilarna räknas upp per typ (`input[type=text]`, `[type=email]`, …). Lägger man
till en typ som inte står där får fältet webbläsarens egen stil och blir ett litet
streck bland de andra. Det hände url-fältet för länken.

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
personer läggs till direkt i resedialogen eller under Inställningar.

**Filtret** sitter i toppbaren och gäller i alla flikar. Det är en mängd och betyder
OCH: väljer man Tom och Karin visas resorna där **båda** var med, inte alla resor
där någon av dem var med. Bara familjen går att filtrera på; övriga syns på resorna
men är inte filterval.

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

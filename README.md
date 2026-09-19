# Resekartan

Interaktiv världskarta över familjens resor. Mobilen först.

**Live:** https://resekartan.tomairaksinen.se
(gamla `tom-airaksinen.github.io/resekartan/` skickar vidare hit med 301)

## Deploya

```sh
git push          # GitHub Pages bygger om från main automatiskt
```

Repot är publikt – det krävs för Pages på GitHub Free. Familjens riktiga resor
ligger aldrig här utan i Firestore, och varken lösenord eller e-post står i koden
eller i den här filen. `CNAME` i repotroten skrevs av GitHub när den egna adressen
sattes upp; den ska ligga kvar.

### Egen adress: resekartan.tomairaksinen.se

Tre ställen, i den ordningen:

1. **Loopia → Domännamn → tomairaksinen.se → DNS.** Lägg till en **CNAME**-post:
   namn `resekartan`, värde `tom-airaksinen.github.io.` (med punkt sist). Ingen
   A-post – den är bara för toppdomänen. Spridningen tar oftast minuter, ibland en
   timme.
2. **GitHub → repot → Settings → Pages → Custom domain.** Skriv in
   `resekartan.tomairaksinen.se` och spara. GitHub kontrollerar DNS:en, skriver en
   `CNAME`-fil i repot och beställer certifikat. När "DNS check successful" står
   där: kryssa i **Enforce HTTPS** (knappen är grå tills certifikatet är klart,
   vilket kan ta upp till en timme).
3. **Firebase-konsolen → Authentication → Settings → Authorized domains → Add
   domain:** `resekartan.tomairaksinen.se`. **Utan det steget går det inte att
   logga in från den nya adressen** – Firebase Auth vägrar okända ursprung, och
   felet ser ut som ett inloggningsfel snarare än ett domänfel.

Firestore-reglerna rör man inte: de tittar på uid, inte på varifrån anropet kom.
Den gamla adressen `tom-airaksinen.github.io/resekartan/` fortsätter fungera och
skickar vidare, så gamla hemskärmsgenvägar överlever.

## Sidan /om

`om/index.html` är en publik presentationssida på
https://resekartan.tomairaksinen.se/om – vad appen gör, med skärmdumpar. Den
delar inte kod med appen; färgerna och typsnitten är samma värden skrivna för
hand, och loggan är en kopia av symbolen i `index.html`.

**Skärmdumparna visar exempeldatat i `data/seed.js`, aldrig familjens riktiga
resor.** Sidan är publik och repot är publikt, så det är inte en detalj att vara
slarvig med. De tas om med headless Chrome mot en lokal kopia där
`data/firebase-config.js` är tömd:

```sh
--window-size=500,1000 --force-prefers-reduced-motion=reduce
```

Två saker som krävs för att de ska bli rätt: bredden golvas vid 500 i headless
(mindre `--window-size` ger ändå 500 och en beskuren bild), och utan reducerad
rörelse hinner kartans flygning inte bli klar – d3:s övergångar drivs inte av
den virtuella tiden.

## Status

**Live sedan 2026-09-16, på egen adress sedan 2026-09-19.** I skarp drift: karta,
resor, landvy, statistik, bilder per resa och import från albumnamn. Firebase är
påkopplat, så alla fyra delar samma data och loggar in med familjekontot – data i
Firestore, bilder i en subcollection, inloggning i Firebase Authentication.

Utan `data/firebase-config.js` ifylld faller appen tillbaka på lokalt läge:
`localStorage` per enhet och lösenordshashen i `app.js`. Det är kvar för att
appen ska gå att köra och testa utan moln, inte för att det är vägen framåt.

## Kör lokalt

```sh
python3 -m http.server 8000     # öppna http://localhost:8000
```

Krävs för att `data/world-50m.js` ska laddas (går även med `file://`, men servern
är enklare). `localhost` ligger redan bland Firebases Authorized domains, så
inloggningen fungerar lokalt.

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

**En tom canvas sparad som JPEG blir en svart ruta, inte en genomskinlig.** Det
gjorde att ett omslag kunde vara kolsvart medan galleriet visade Eiffeltornet –
och inget i appen kunde se skillnad, det var en giltig bild.

Två orsaker till att canvasen blev tom, båda åtgärdade i v67:

- `img.onload` betyder inte att bilden går att rita. Safari kan lämna canvasen
  orörd om man ritar direkt i lyssnaren. Nu väntar `makeThumb()` på `decode()`.
- En bild utan mått gav `NaN` till `drawImage()`, som då inte ritade något.

Och eftersom teorier om Safari har varit fel förr kontrolleras resultatet:
`blank()` läser var hundrade bildpunkt ur canvasen, och är allt svartare än 8
sparas ingen miniatyr alls. Då visas flaggan, och nästa gång resan öppnas görs ett
nytt försök. Priset är att ett verkligt kolsvart foto aldrig blir omslag – en bra
affär mot att en svart ruta ser ut som ett fel i appen.

`THUMB_V` är uppräknad till 3, så omslag gjorda före kollen görs om nästa gång
resan öppnas. Misslyckas det nya försöket **och** det som ligger inne är från en
äldre version kastas det – det kan vara just en svart ruta. Ett aktuellt omslag
rörs inte av ett misslyckat försök.

### Herobilden i resedetaljen

Öppnar man en resa med bilder ligger omslaget stort överst, i en 3:2-ruta som
aldrig blir högre än 34 % av skärmen. Rutan har sin höjd från början, så sidan
inte hoppar när bilden kommer.

Den skärps i tre steg, och inget av dem kostar en extra hämtning som inte ändå
hade skett:

| Steg | Var kommer bilden ifrån | När |
| --- | --- | --- |
| miniatyren, uppskalad och suddig | `t.thumb`, ~5 kB, ligger redan i `DB` | direkt, i samma målning som resten |
| förhandsbilden, 400 px | galleriets `prev`, hämtas ändå | när bildlistan svarat |
| originalet, 1400 px | `loadFull()`, samma cache som bildvisaren | en halv sekund senare |

Den halva sekunden är med flit: originalet ska inte konkurrera om nätet med det
rutnät man faktiskt tittar på. Blurren tas bort så fort 400 px-versionen är inne,
inte när originalet är det – annars står bilden och ser suddig ut i onödan.

Herobilden är ett `<button>` med `data-open="0"`, inte en `div`. Det är samma
bild som första rutan i galleriet, så ett tryck ska göra samma sak – öppna
visaren på bild ett, med svep och bläddring därifrån. `data-open` plockas upp av
samma lyssnare som miniatyrerna, och knappelementet ger tryck, tabb och Enter
utan en rad egen kod. Tappar man på den innan bilderna hunnit fram gör den
ingenting: `openViewer()` returnerar tidigt när `phCache` är tom.

**Arket börjar alltid överst.** Att skriva om `#sheetBody` nollställer inte
skrollningen av sig självt. Öppnade man en resa från en nedskrollad lista –
träfflistan i sökningen, Alla resor – började detaljen mitt i, och herobilden
var avklippt innan man hunnit se den. `renderSheet()` sätter därför
`scrollTop = 0`.

Går bildhämtningen fel tas blurren och snurran bort ändå, så rutan inte blir
stående och snurrar. Finns ingen `thumb` ritas ingen hero alls; resan får den
nästa gång den öppnas, för då har `syncThumb()` hunnit skapa miniatyren.

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

**Originalet måste bytas in även när det redan är hämtat.** Det var buggen som
gjorde att just de bilder som borde vara skarpast blev de som aldrig blev det:

1. Rutan för nästa bild ritas av `fyllRuta()` medan man tittar på den föregående.
   Då finns bara förhandsbilden på 400 px, och det är den som hamnar i `src`.
2. Förladdningen hämtar hem originalet och lägger det i `fullCache`.
3. Man bläddrar dit. `uppdateraVisare()` ser att allt är klart, skriver ingen
   "laddar …" – och returnerade utan att någon bytt `src`. Rutan blev kvar på
   400 px så länge man hade visaren öppen.

Symtomet är lätt att missförstå: en bild som säger "laddar …" blir skarp till slut,
medan en som inte säger något förblir suddig. `visaOriginal()` gör nu bytet, och
förladdningen hämtar grannarna åt **båda** håll – bakåtbläddring var lika vanlig
men förladdades inte alls.

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

### Svep ned för att stänga, svep höger för att gå tillbaka

Två gester med Flippas trösklar, som redan är tunade där:

| Gest | Var | Tröskel |
| --- | --- | --- |
| ned | bildvisaren | 55 punkter **eller** en knyck på 0,45 punkter/ms |
| höger | arket | 70 punkter |

Riktningen avgörs på de första punkterna med **1,3 gångers övervikt** åt det ena
hållet, så en skrollning eller ett lätt snedsvep inte råkar räknas. Svepet nedåt
finns bara när bilden inte är inzoomad – då panorerar ett finger i stället.

Tre fällor, alla lärda i Flippa:

- **Beslutet måste kunna tas vid släppet.** Ett riktigt snabbt svep kan ge noll
  `pointermove`, och då hände ingenting alls. `avgor()` anropas därför både under
  rörelsen och i `pointerup`.
- **`pointercancel` räknas.** Webbläsaren tar ibland över gesten; sista kända
  position används, eftersom cancel-händelsens egna koordinater inte är att lita
  på.
- **Klicket efter svepet måste sväljas.** Annars öppnar samma rörelse resan man
  svepte över. En vakt i capture-fasen sväljer klick i 400 ms.

En fälla till, egen den här gången: `svepTillbaka()` anropades med `body`-
konstanten, som deklareras längre ned i filen. Det gav *Cannot access 'body'
before initialization* och fällde hela `app.js` tyst – kartan blev vit. Elementet
hämtas nu direkt ur sidan i stället.

**Att ta bort en bild sker bara i helskärmsläget.** Kryssen i rutnätet togs bort:
man raderar sällan, och de gjorde att man inte vågade trycka på bilderna.

### Nypa, panorera, dubbeltrycka

Tre gester på samma yta i bildvisaren. Vilken det blir avgörs av hur många fingrar
som ligger på skärmen och om bilden redan är inzoomad:

| Gest | Vad den gör |
| --- | --- |
| två fingrar | nyper: skalar kring punkten mellan fingrarna, och flyttar med om nypet dras |
| ett finger, oinzoomad | svep till nästa bild, precis som förut |
| ett finger, inzoomad | panorerar inuti bilden |
| dubbeltryck | växlar mellan helbild och 2,5× på punkten man tryckte |

Taket är 6×. Bilderna är på 1400 px, så de blir grynigare ju närmare man går – men
att kunna gå nära en skylt eller ett ansikte är värt mer än att slippa se pixlarna.

Fyra saker att veta om man rör koden:

- **`touch-action: none` på `.vwrap` är förutsättningen.** Med `pan-y`, som det stod
  förut, tar webbläsaren nypningen själv och zoomar hela sidan i stället för bilden;
  appen får aldrig se gesten. Det finns inget att skrolla i visaren, så vi äger alla
  fingrar på ytan.
- **Punkten räknas mot mittrutans mitt, inte mot bildens.** `.vslide` är
  otransformerad medan `<img>` bär zoomens transform, så rutan är den enda stabila
  referensen – bildens `getBoundingClientRect()` ändrar sig av zoomen man just
  håller på att räkna ut.
- **Alla tre rutorna städas vid nollställning.** Bara mitten är inzoomad, men den man
  lämnar bär annars kvar sin inline-transform och dyker upp inzoomad nästa gång den
  roteras in i mitten. Zoomen nollställs vid varje bildbyte, i `step()`,
  `paintViewer()` och `closeViewer()`.
- **Variabeln heter `bildZoom`.** `zoom` är redan upptaget av d3:s zoom-beteende på
  kartan, på modulnivå i samma fil.

Svepet är avstängt när bilden är inzoomad – där panorerar ett finger i stället. Vill
man till nästa bild zoomar man ut först, med dubbeltryck eller ett nyp inåt. Att
låta svepet ta vid vid bildens kant vore trevligare men kräver att man vet var
kanten går, och den beror på bildens proportioner inuti `object-fit: contain`.

### Frågerutan ligger överst

`#ask` har `z-index: 100`, över allt annat. Den låg under bildvisaren (80), och
då såg papperskorgen ut att inte göra något: frågan stod och väntade bakom bilden
och dök upp först när man stängde visaren.

Toasten ligger ännu högre men har `pointer-events: none`. Den är bara information
och får aldrig fånga ett tryck som var tänkt för något under den.

Escape i frågerutan gör `stopImmediatePropagation()`. Utan den stängde samma
tangenttryck både frågan och visaren under.

### Klistra in en bild

Galleriet tar emot bilder ur urklipp, inte bara ur filväljaren. Det är till för
bilder som finns i ett delat album men inte på telefonen: kopiera där, klistra in
här, i stället för att spara ner till kamerarullen först.

**Vad Safari på iPhone faktiskt lämnar ut, mätt med logg 2026-09-18:**

| Urklippets innehåll | `clipboard.read()` svarar |
| --- | --- |
| skärmdump, bild kopierad från en webbsida | en post med `image/png` – fungerar |
| bild kopierad ur Google Photos-appen | en post **utan typer**; `getType()` ger `NotAllowedError` för alla typer |

Det andra fallet är inte "finns inte" utan "får inte": appen lägger bilden på
urklippet i en form som WebKit inte släpper till webbsidor, och det går inte att
komma runt från sidan. Det förklarar varför inklistringen "fungerade ibland" under
utvecklingen – det berodde på vilken sorts bild som låg i urklippet, inte på
koden. Läxan från den veckan: **logga på skärmen innan du gissar.** Fyra
omskrivningar byggde på teorier som en enda loggrad hade fällt.

**Rutan har därför två lägen, och båda är bekräftade på telefon 2026-09-18.**
Som knapp frågar ett tryck urklippet, vilket räcker för skärmdumpar: inget
tangentbord, ingen extra bubbla. Säger Safari nej blir rutan ett skrivfält
(`contenteditable`) och får fokus, och raden under säger "Håll ner i rutan och
välj Klistra in". iOS egen inklistring på långtryck lämnar då ut bilden **varje
gång**, även den Safari nyss vägrade – systemet får det webbsidan inte får.
Tangentbordet kommer bara i det läget. Efter en lyckad inklistring blir rutan
knapp igen.

Det går inte att slå ihop till ett steg: `read()` måste provas först för att
skärmdumpar ska gå på ett tryck, och först när den svarar typlöst vet appen att
långtryck behövs.

Loggen (`phLog`, styrs av `PH_LOG_ON`) visas bara när något gått fel.

I skrivfältsläget kan bilden komma in på flera sätt, och Safari väljer inte samma
som andra:

| Väg | Var |
| --- | --- |
| `clipboard.read()` | huvudvägen på iPhone och där Safari tillåter det |
| `clipboardData.files` eller `items` | datorn, Android |
| `beforeinput` med `insertFromPaste` | iOS lämnar ibland datat där i stället för i `paste` |
| `text/html` med en `<img src>` | Safari lämnar ibland bara ut en adress |
| en `<img>` som webbläsaren själv lägger i rutan | Safari, bilder från andra appar |

Den sista är den minst uppenbara: **gör man `preventDefault()` på
inklistringen i rutan hinner Safari aldrig lägga dit bilden**, och då finns inget
att plocka upp. Därför låter vi den klistra in, läser ut bilden efteråt och städar
rutan.

Tre detaljer till:

- **Fältet måste se ut som något man skriver i, annars visar iOS ingen meny.**
  Först låg etiketten inuti fältet som `contenteditable="false"`, och fältet hade
  `inputmode="none"`. Då gav långtryck ingenting alls: inget att sätta markören i,
  ingen Klistra in-meny. Nu ligger etiketten utanför fältet, fältet innehåller ett
  osynligt tecken (`\u200B`) så markören har någonstans att stå, och inget
  dämpar inmatningen.
- Texten är genomskinlig men markören syns, så man ser att fältet är aktivt utan
  att det osynliga tecknet eller inklistrad text blir synlig.
- **`font-size: 16px` på fältet är inget stilval.** iOS zoomar in hela sidan när
  man fokuserar ett redigerbart fält med mindre text än så.
- Misslyckas en inklistring skrivs det i klartext under rutnätet vad webbläsaren
  lämnade ut. Inklistring beter sig olika överallt och går inte att felsöka i blindo.

`paste`-händelsen fungerar också var som helst i en öppen resa, vilket räcker på
datorn. Den ignoreras när markören står i ett vanligt textfält.

Allt går vidare till `laggTillBilder()`, samma väg som filväljaren, så bilderna
krymps och får omslag på precis samma sätt.

> Varför inte hämta omslaget automatiskt ur ett Google Photos-album? Webbläsaren
> får inte läsa den sidan, och allt som kommer runt det kräver en server eller
> nycklar. Utrett 2026-09-18.

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

### Resdagar räknas som kalenderdagar

`travelDays()` bygger ett set av datum och räknar dess storlek, i stället för att
summera resornas längder. Två saker faller ut av det:

- **Överlappande resor räknas en gång.** Åkte Tom och Aron åt ett håll samtidigt
  som Karin och Hedvig åkte åt ett annat var familjen borta en vecka, inte två.
- **En resa över nyår hamnar på rätt år.** 27 dec till 4 jan ger fem dagar på det
  gamla året och fyra på det nya, i stället för nio på det gamla.

Avstickare och flera länder i samma resa har aldrig räknats dubbelt – dagarna kom
alltid från resans egna datum, inte från stoppen. Det kontrollerades 2026-09-18.

`days()` returnerar 0 i stället för `NaN` för en resa utan giltiga datum. Förut
förgiftade en sådan resa hela summan.

### Permanentboende är en resa utan resdagar

Ett år i Moskva ska räknas som en resa och ett land, men inte som 365 dagar på
resande fot. Kryssrutan **"Räkna som permanentboende, ta inte med i statistiken
över resdagar"** i resedialogen sätter `t.bo`, och den gör exakt en sak: resan
ger noll resdagar. Allt annat är sig likt – den räknas i antal resor, tänder
landet på kartan, tar med sina platser och sitt avstånd i Längst hemifrån.

Ingen automatisk regel på antal dagar. Februari i Tokyo är 28 dagar och ska
räknas som resa, så varje gräns hade blivit godtycklig – och fel just där det
spelar roll. Kryssrutan är en bedömning, och den är din.

**Överlappet följer av samma flagga, utan en regel till.** Boendeperioderna
plockas ut ur `bo`-resorna i `boendePerioder()`, nycklade på **person och land**.
En dag räknas bort ur `travelDays()` först när *alla* som dagen gäller för bodde
i landet:

| Situation | Utfall |
| --- | --- |
| Tom hälsar på Karin tre veckor under hennes Moskvatermin | 21 dagar för Tom, 0 för Karin |
| Samma resa sedd under "Alla resor" | 21 dagar – Tom var faktiskt borta |
| Karin en vecka i Tokyo inuti Toms månad där | 7 dagar för Karin, Toms 28 rör sig inte |
| Helg i Prag under Moskvaåret | riktiga resdagar – annat land |
| Vecka i S:t Petersburg under Moskvaåret | inga resdagar – samma land man bodde i |

Sista raden är gränsdragningen, och den är vald för att den går att förklara i
en mening. Att skilja "resa hemifrån-hemifrån" från "resa inom landet man bodde
i" hade krävt att boendet fick en egen hemort, och det är inte värt det för två
fall.

Tokyo-fallet behövde ingenting nytt: `travelDays()` är ett set av datum, så en
resa inuti en annan räknas redan bara en gång.

**Längsta resan och Längsta vistelsen är två olika rekord.** Moskvaåret hade
annars vunnit det första för alltid, så boenden räknas bort därifrån och får en
egen rad i Kul att veta – den visas bara när det finns ett boende inlagt.

Båda raderna, och Flest resor till, visar **topp tre** i stället för en enda
vinnare (`topp3()`): tvåan och trean är ofta det roliga, och en ensam vinnare
säger inget om hur nära det var. Ettan står i full svärta, tvåan och trean
dämpade och mindre, så raden fortfarande går att läsa som ett svar och inte som
en tabell. Rubriken böjs efter antalet – "Längsta resan" när det bara finns en.

CSS-fällan där: barnkombinatorn i `.facts dd.top3>span:not(:first-child)` är inte
kosmetik. Utan `>` träffar regeln även `.v`-spannen inne i raderna, och då dämpas
ettans siffra också – och den vinner dessutom på specificitet över regeln som
skulle färga `.v`.

Boendet syns bara i resedetaljen: etiketten "Bodde här" vid titeln och
"· räknas inte som resdagar" efter dagantalet. Listorna och kartan behandlar det
som vilken resa som helst.

**Planerade resor räknas aldrig med i statistiken.** `done()` sållar bort dem ur
resdagar, antal resor, besökta länder, platser, "längst hemifrån" och landvyns
sammanfattning. De syns på kartan i sin egen ton, i listorna och i sökningen –
det är trevligt att se vad som väntar – men man har inte varit där än.

### Territorier färgas inte av sitt moderland

Natural Earth ritar Frankrike som **en** yta, och i den ligger Réunion, Franska
Guyana, Mayotte och Antillerna. Färgade man "Frankrike" färgades alltså allt det
där med, och en helg i Paris tände öar på andra sidan jorden. Samma sak med
Nederländernas Karibien, USA:s Hawaii och Spaniens Kanarieöar.

Länder med delar långt från huvudlandmassan delas därför i flera ytor: en kärna
och en per avlägsen klunga (`delaLand()`). Sedan färgas bara de delar där det
faktiskt sitter en plupp. Ett land utan koordinater alls färgas helt, som förut –
annars hade gamla resor utan positioner slutat synas.

**Avståndet mäts till huvuddelens omslutande ruta, inte till dess mitt.** Mot
mitten mätt ligger Maine 2 500 km från USA:s tyngdpunkt och hade blivit en utpost;
mot rutan mätt ligger det inuti, medan Alaska hamnar 2 100 km utanför. Korsika
ligger 80 km utanför Frankrikes ruta och räknas som kärna, Guadeloupe 6 700.

Utposterna klustras innan de blir ytor, annars blir Guadeloupes öar fem paths i
stället för en. Totalt går kartan från 240 till 293 paths – `rescale()` rör dem
alla vid varje zoomsteg, så att dela *alla* länder hade kostat flera tusen.

**`UTPOST_KM` är gränsen, och den är en smaksak.** Så här faller länderna ut:

| Gräns | Delas | Blir kvar hela |
| --- | --- | --- |
| 800 km | 23 länder | – |
| 1 500 km | 11 länder | Japan, Malaysia, Spanien, Kanada, Norge |
| 2 500 km | 7 länder | + Portugal, Indonesien, Australien, USA:s Alaska |

Vi kör på **800**, den mest sanningsenliga: en resa till Kuala Lumpur färgar inte
Borneo och en resa till Tokyo färgar inte Okinawa. Känns det snålt är 1 500 nästa
steg – det är en siffra på en rad. 2 500 och 3 000 ger samma utfall, så där ligger
en naturlig lucka i datat om man vill ha en försiktig gräns.

### Resdagar per år börjar med i år

Stapeldiagrammet i statistiken har senaste året till vänster och äldre år bort åt
höger. Det man vill se först ska inte ligga sist.

Raden skrollar i sidled i stället för att klämma ihop sig: varje år har en
golvbredd på 34 punkter, för med tjugo år i listan blev staplarna annars streck.

### Färgskalan på kartan

Besökta länder färgas efter hur många resor som gått dit, i fyra steg: `--v1`
till `--v4`. Skalan är **relativ mot den vy man har framför sig** – mörkast är
alltid det mest besökta landet bland de resor som visas, ljusast är ett besök.

**Ett besök är sitt eget steg.** Det absolut vanligaste är att ha varit i ett land
en enda gång, och slogs den ettan ihop med tvåorna försvann just den skillnad man
helst vill se. Steg 2–4 fördelar resten av spannet: med max 7 resor blir det
1 · 2–3 · 4–5 · 6–7, med max 10 blir det 1 · 2–4 · 5–7 · 8–10.
Filtrerar man på en person styr hennes fördelning, så tre resor kan vara mörkast
för en i familjen och ljusast för en annan.

Absoluta gränser (1 / 2–3 / 4+) provades först och gjorde kartan platt för den
som rest mindre: har man som mest varit tre gånger någonstans hamnar allt i
samma ton, och det roliga med att se sitt eget mest besökta land försvinner.

Priset för en relativ skala är att en nyans inte betyder samma sak hela tiden.
Det löses genom att teckenförklaringen skriver ut de faktiska talen – `legendRamp()`
räknar fram vilka antal som hamnar i vilket steg och visar bara de steg som
används. Skalan får aldrig vara en gissning.

Fyra steg är taket. Fler nyanser går ändå inte att skilja åt i ett litet land på
en telefonskärm. Stegen är jämna i ljushet, inte i mättnad, så skillnaden syns
lika tydligt mellan varje par.

Ytorna är **platta, inte gradienter**. En gradient gjorde att samma antal resor
såg olika ut beroende på var på jorden landet låg, vilket är precis vad en
färgskala inte får göra.

Teckenförklaringen ankras ovanför bottenarket via `--sheet-h`, som `setSheet()`
skriver. Innan dess låg den bakom arket och syntes aldrig på en telefon.

På telefonen är den **av som standard** och fälls upp med infoknappen i toppraden;
valet ligger kvar på enheten. Från 900 px och uppåt finns plats, och då ligger den
framme hela tiden utan knapp.

Knappen visas bara i kartfliken (`body[data-tab]`). I de andra flikarna finns ingen
karta att förklara, och den skulle bara se trasig ut.

### Alla resor är inte samma sak som hela familjen

Resenärsväljaren har två lägen överst som är lätta att blanda ihop. **Alla resor**
filtrerar inte alls. **Hela familjen** kryssar i alla fyra, och eftersom flera
valda personer betyder *och* – inte *eller* – visas då bara resor där alla var med.
Det är också utgångsläget vid varje start: kartan handlar om familjens gemensamma
resor, och enskildas ligger ett tryck bort.

Det stod tidigare bara "Alla" under rubriken "Visa resor där dessa var med", vilket
lovade det ena och gjorde det andra: en resa där bara en av oss var med syntes ändå.

**Valet ligger kvar på enheten** (`resekartan.filter`, aldrig i `DB` – samma skäl
som för temat). Hela familjen är fortfarande utgångsläget, men bara tills någon
väljer något annat: Hedvig ska kunna filtrera på sig själv en gång och sedan möta
sina egna resor varje gång hon öppnar appen. Står valet på personer som senare
tagits bort faller appen tillbaka på hela familjen, inte på ett tomt filter –
tomt betyder ju "alla resor", vilket är något helt annat.

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

**Men sökfältet måste få krympa.** Med `width:320px;flex:none` svämmade raden över
`#top` så fort namnet plus fältet blev bredare än utrymmet, och fältet la sig under
sidopanelen – tydligast på en iPad i liggande läge. Nu står det `flex:1 1 220px`
med `max-width:300px`, så det ger efter i stället för att bryta ut.

### Panelens och flikradens bredd står på ett ställe

`--panel` och `--rail` sätts i desktop-media-frågan, och allt som måste sluta före
panelen (`#top`, `.zoom`, `#pickbar`) räknar ut sig själv ur `calc(var(--panel) +
16px)`. Förut stod 420 och 436 inskrivna på fem ställen, och då glider siffrorna
isär så fort en av dem ändras.

Panelen är `clamp(340px, 32vw, 420px)`. Fast 420 var i överkant på en iPad – kartan
är det man kom för – men på en stor skärm finns plats. Flikraden gick från 76 till
68 px med etiketterna en halv punkt mindre; de får fortfarande plats utan att
klippas, "Inställningar" inräknad. Vad det ger:

| Fönster | Karta förut | Karta nu |
| --- | --- | --- |
| 920 px | 404 px | 512 px |
| 1180 px (iPad liggande) | 684 px | 734 px |
| 1366 px och uppåt | 870 px | 878 px |

### Arket har en egen historik

`nav` är en stack av bildrutor: `{ sel, selCountry, tab }`. `showTrip()` och
`showCountry()` lägger på det som var öppet innan, och `goBack()` plockar av en
ruta i taget. Vägen tillbaka går därför hela sträckan:

```
Länder → Ungern → Budapest 2019 → tillbaka → Ungern → tillbaka → Länder
```

Förut nollställdes allt vid ett tryck på Tillbaka, så man tappade landet med dess
övriga resor och fick leta upp det igen.

Tre saker tömmer stacken helt, för då hör den gamla vägen inte längre ihop med det
man ser: ett andra tryck på Kartfliken, ett klick på kartan, och att filtret ändras.
En borttagen resa rensas ur stacken så Tillbaka inte leder till något som inte finns.

`clearSel()` har medvetet ingen tidig retur: ett tryck ska alltid rita om, annars
kan knappen kännas död i lägen där `sel` nollställts på annat håll.

Fällan att minnas: `showCountry()` byter flik själv. Anropar man `setTab('karta')`
före den hamnar fel flik i historiken, och Tillbaka leder till kartan i stället för
till Länder.

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

**Den verkliga orsaken till blinket var ändå en annan**, och den hittades först
efter att typsnittsfixen ovan inte räckte: service workern hade en enda cache som
byttes ut vid varje version, och `activate` raderade allt annat. Typsnitt,
kartbibliotek och Firebase-SDK försvann alltså vid varje uppdatering, och första
starten efteråt hämtade dem från nätet igen. Dessutom laddade sidan om sig själv
när den nya arbetaren tog över, mitt i uppstarten. Under en dag med fyrtio
versioner var varje start en "första start efter uppdatering", och blinket
såg ut att vara permanent.

Nu finns två cachar. `resekartan-vNN` för appens egna filer byts vid varje version.
`resekartan-static` för typsnitt, cdnjs och Firebase-SDK överlever versionsbyten;
adresserna där bär sin egen version och ändras aldrig. Typsnittsfilerna plockas ut
ur css:en redan vid installationen så de finns från första starten. Omladdningen
vid `controllerchange` är borttagen: sidan och `app.js` går ändå nätverket först,
så en start får alltid senaste koden.

Byter man typsnitt måste adressen uppdateras på båda ställena: `index.html` och
`FONT_CSS` i `sw.js`.

### Ny version tas emot utan att man tvingar fram avslut

Symtomet var att man fick avsluta appen två gånger för att få den nya koden. Tre
saker saknades:

- **`updateViaCache: 'none'` vid registreringen.** Utan den får webbläsaren
  servera *sw.js själv* ur HTTP-cachen, och GitHub Pages sätter max-age. Då
  upptäcks en ny version aldrig, hur ofta man än frågar.
- **En kontroll när appen kommer i förgrunden.** En timme mellan försöken räcker
  inte för en app man öppnar en minut åt gången.
- **En omladdning när den nya arbetaren tagit över.** Den togs medvetet bort en
  gång, med motiveringen att koden ändå går nätverket först. Det stämmer för en
  *ny* start – men den redan öppna sidan kör förstås kvar sin gamla kod tills
  något laddar om den.

Omladdningen sker bara när det är ofarligt: inte mitt i en redigering, en import,
en bildvisning, ett drag eller en kartpekning (`sakertAttLaddaOm()`). Är något av
det uppe väntar den, och `closeEditor()`, `closeViewer()` och `closeImport()`
frågar igen när de stänger.

Var man var sparas i `sessionStorage` och återställs efteråt, så en uppdatering
inte kastar ut en ur resan man tittade på. En notislänk går före den platsen.
`sessionStorage` överlever en omladdning i samma flik men är tom vid en äkta
kallstart, så en gammal plats kan inte spöka.

Låsskärmen säger **"Uppdaterar till senaste versionen …"** direkt i stället för
efter 1,2 sekunder som vid en vanlig start – väntan är ju väntad då. Kortet hoppar
inte, för statusraden tar alltid sin plats med `visibility`, aldrig `display`.

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

Fällan gäller **allt som mäts i användarenheter**, inte bara bredden. Streckade
linjen till en avstickare hade `stroke-dasharray: 3 3` kvar i CSS medan bredden
skalades som den skulle. Allt inne i `#world` skalas med `k`, så ett tre enheters
streck blev `3 × k` skärmpixlar: vid 170× gångers zoom var ett enda streck femhundra
pixlar långt, och linjen mellan Los Angeles och Tijuana såg ut som ett lösryckt
sträck som slutade mitt i havet. Nu sätts dasharrayen i `rescale()` tillsammans med
bredden. Mönstret i `#hatch` hade redan sin `patternTransform` skalad där – det var
bara streckningen som glömts.

**Versaler sitter högt i sin radbox.** Initialen i `.av` ligger i ett `<i>` som
skjuts ned `.07em`, annars hamnar bokstaven ungefär en pixel ovanför cirkelns mitt.

### Dialoger

`alert()` och `confirm()` är blockerade i sandlådade inbäddningar (t.ex. en
publicerad artefakt), där de tyst gör ingenting. Appen använder därför egna rutor:
`ask()` för bekräftelser, `toast()` för kvittenser och ett felmeddelande i
redigeringsfotens `#edErr` för validering. Använd inte de inbyggda.

### Lösenord

**I molnläge gäller Firebase Authentication**, ett delat familjekonto med e-post och
lösenord, och Firestore-reglerna släpper bara in det kontots uid. Lösenordet byts i
Firebase-konsolen → Authentication → Users, inte i appen. Glömt det? Där finns både
*Reset password* och möjligheten att sätta ett nytt direkt.

Firebase svarar med samma fel (`auth/invalid-credential`) för fel lösenord som för
en adress utan konto, så appens text säger "Fel e-post eller lösenord" och kan inte
säga vilket. Det är avsiktligt från Google – annars gick det att fiska efter vilka
adresser som har konton.

Authorized domains i samma vy gäller bara OAuth-omdirigeringar (telefon, Google,
tredjepart). E-post och lösenord bryr sig inte om den listan, så den är inte platsen
att leta när inloggningen nekas.

Den gamla PBKDF2-hashen i `AUTH` i `app.js` (150 000 varv, SHA-256) används bara i
lokalt läge, när `data/firebase-config.js` är tom. Den byts under Inställningar →
Lösenord, som räknar fram den nya raden att klistra in. Lösenordet självt står
varken i koden eller här.

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

**Hela resekortet öppnar resan**, inte bara raden "Visa hela resan ›" längst ned.
Kortet är en `div` med `role="button"` och `data-trip`, så den delegerade
klicklyssnaren tar hand om det som vanligt; Enter och mellanslag har en egen rad
kod eftersom en `div` inte får det gratis som en `<button>`.

**Ett land utan träffar listar ändå sina resor.** Att söka fram Kirgizistan och
mötas av "inget inlagt" är fel svar när det finns en resa dit – den råkar bara
ligga utanför filtret. Nu står det vilket filter som gäller, och resorna listas
med datum och vilka som var med, så man kan öppna dem direkt eller byta filter.
Först när landet verkligen är tomt står det att det är tomt.

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

**Namnet måste gå att läsa.** Båda källorna svarar med ortens **lokala** namn när
det inte finns något på det språk man bett om. `accept-language=sv` gav därför
沖縄県 för Okinawa och አዲስ አበባ för Addis Abeba – och det var de tecknen som
sparades på resan och sedan dök upp i topplistan över längst hemifrån. Tre
åtgärder, alla i `geocode()`:

| | Förut | Nu |
| --- | --- | --- |
| Nominatim | `accept-language=sv` | `accept-language=sv,en` + `namedetails=1` |
| Photon | inget språk | `lang=en` |
| Dubbletter | Nominatim vann alltid | ett latinskt namn vinner över ett som inte är det |

Svenskan går fortfarande först där den finns – Korsika heter Korsika och Addis
Abeba heter Addis Abeba – engelskan är bara det som tar vid i stället för
japanskan. `namedetails=1` låter oss välja `name:sv` → `name:en` → `name` →
`int_name` själva i stället för att lita på att Accept-Language tolkats som vi
tänkte. Photon kan bara de, en, fr och it, så `en` är det bästa som finns där.

Platser som redan ligger sparade med fel alfabet listas under **Inställningar →
Ortnamn att rätta**, med en genväg till resan. De rättas för hand: skriv namnet
och spara, positionen ligger kvar eftersom bara textfältet ändras. Avsnittet
visas bara när det finns något att rätta. Ingen automatisk omskrivning – att
gissa om namn som redan står inskrivna är precis det sortens hjälpsamhet som
förstör data.

**Valet av träff är med flit förlåtande.** Två skydd gjorde det sprött: målet
måste vara samma element vid `pointerup`, och fingret fick inte flytta sig mer än
tio punkter. På iPhone glider listan till av sig själv – tangentbordet öppnas,
förslagsraden dyker upp, Safari skrollar fram fältet – och då föll trycket, utan
att något syntes hända. Nu räcker det att trycket började på en träff och släpptes
inom 24 punkter, och både `pointerup` och `click` leder fram; den som hinner
först. Ett `pointercancel` kastar inte kandidaten direkt, för ett `click` kan
komma efter. En riktig skrollning i listan (över 24 punkter) väljer fortfarande
inget.

`SOK_LOG_ON` i `app.js` ritar en logg under formuläret med vilka händelser som
faktiskt kom fram. Den finns för att buggen lagades två gånger på teori och höll
båda gångerna – samma läxa som inklistringen lärde ut. Slå av flaggan när det är
avgjort.

**Ett tryck på en träff kunde se ut att inte göra något.** Två orsaker, båda
åtgärdade i v54:

- Valet ritade om **hela** formuläret, och då nollställs `edBody.scrollTop`.
  Platserna ligger längst ned, så man kastades upp till titelfältet i samma
  ögonblick – positionen kom in, men det syntes aldrig. Nu ritas bara den berörda
  raden om (`fyllPlatsrad()`), och `renderEditor()` lägger tillbaka skrollningen
  när den ändå måste rita om allt.
- Valet skedde på `click`. På iPhone hinner fältet tappa fokus och tangentbordet
  stängas mellan tryck och klick, och då flyttar listan sig under fingret. Nu
  väljs träffen på `pointerup`, med `preventDefault()` på `pointerdown` så fokus
  ligger kvar. Rör sig fingret mer än tio punkter var det en skrollning i listan
  och inget val.

**"Administrative" var inte felet.** Det är Nominatims ord för en ort som är
ritad som en kommungräns – Long Beach och Utrecht är båda sådana, och de har
koordinater som alla andra. Men rå OSM-engelska mitt i en svensk lista ser ut som
ett fel, så `platstyp()` översätter: administrative → kommun, city → stad,
island → ö. Träffar som verkligen saknar position sållas bort i `geocode()`
i stället för att ligga kvar och inte gå att välja.

**Resenärer:** familjen (`core: true`) är förkryssad på varje ny resa. Övriga –
kompisar, mor- och farföräldrar – ligger under och kryssas i när de var med. Nya
personer läggs till direkt i resedialogen eller under Inställningar.

Brickorna skiljer sig åt på tre sätt samtidigt, inte bara på färg: den ivalda har
personens egen färg i kanten, full styrka och en ifylld bock; den urvalda är grå,
tonad och har en tom ring. Skillnaden låg förut bara i en svag bakgrundston, och
den syns inte i solsken på en telefon – och inte alls för den som har svårt att
skilja färger åt.

### Importen kryssar i själv

Resor → **Importera** läser albumnamn, en per rad, och slår upp orterna. Kryssen i
granskningen bestämmer vad som sparas, och de sattes förut bara på rader där
*varje* ort på raden hittades. En rad som såg alldeles färdig ut kunde därför
ligga okryssad, och då sparades den inte – vilket såg ut som att importen
tappade bort resan.

Nu kryssas allt i som fick en position och ett datum. Orter som inte hittades
står som "hittade inte …" på raden, så det syns vad som saknas i stället för att
tystas ned med ett tomt kryss. Rader utan datum lämnas okryssade med en rad som
säger varför, och **"Lägg in valda" är låst medan uppslagningen pågår** – trycktes
den tidigare sparades bara de rader som hunnit bli klara.

Kvittensen säger också till när de nya resorna hamnar utanför filtret: en rad som
slutar på `-TA` blir en resa där bara två var med, och den syns inte under Hela
familjen. "Resan sparades inte" var oftast "resan sparades men filtret döljer den".

**Filtret** sitter i toppbaren och gäller i alla flikar. Det är en mängd och betyder
OCH: väljer man Tom och Karin visas resorna där **båda** var med, inte alla resor
där någon av dem var med. Bara familjen går att filtrera på; övriga syns på resorna
men är inte filterval.

Familjen har varsin färg; övriga delar en dämpad stil och känns igen på namnet, som
alltid står utskrivet där det spelar roll. I den kompakta avatarraden visas familjen
som brickor och resten som "+N" – annars går två gäster med samma initial inte att
skilja åt.

### Inställningarnas ordning

Det man faktiskt ändrar först, det man ställer in en gång i mitten, och tekniken
hopfälld längst ned:

1. **Notiser** – är de av visas en inbjudan i stället för en kryssruta bland andra.
   Funktionen är svår att upptäcka och lätt att vilja ha.
2. **Utseende**
3. **Hemort** och **Resenärer**, var sin hopfälld `<details>` – sätts en gång och
   rörs sällan
4. **Avancerat och felsökning**, också hopfälld – version, lagring,
   säkerhetskopia, lösenord, logga ut, hämta senaste versionen

De hopfällda avsnitten använder sammanfattningsraden som rubrik, så ingen extra
`h2` behövs inuti.

Rutan blandade förut notiser och tema med säkerhetskopior och lösenordshashar, och
då hittar man ingetdera. Säkerhetskopian – hela datat som text att kopiera undan
eller klistra tillbaka – ligger kvar under Avancerat.

### Årsdagsnotiser

*"I dag för fem år sedan kom ni hem från Rumänien."* En push-notis på årsdagen av
en avslutad resa, med en väg rakt in i resan och dess bilder. Hela resonemanget –
varför slutdatum och inte start, varför land och inte ort, varför tre lägen i
stället för fyra kryssrutor – står i `docs/arsdagsnotiser.md`. Här bara var
delarna ligger:

| Var | Vad |
| --- | --- |
| `app.js` | inställningar, prenumeration, `arsdagarPa()`, årsdagsvyn, djuplänkar |
| `sw.js` | `push` och `notificationclick` |
| `resekartan/data/push/<enhet>` | prenumerationen, valda personer och läge |
| `scripts/send-arsdagar.js` | läser resor och prenumerationer, skickar |
| `.github/workflows/arsdagsnotiser.yml` | kör 14 och 15 UTC |

Reglerna för vilka resor som har årsdag finns i **två** exemplar, ett i `app.js`
och ett i sändaren. Det är med flit: klienten behöver dem för att kunna räkna ut
hur många notiser ett läge ger, och sändaren kör i Node utan webbläsare. Ändrar
man den ena måste den andra följa med – de är korta och står bredvid varandra i
dokumentationen.

Sändaren kan köras torrt från Actions-fliken (**Run workflow** → torrkörning), och
reglerna går att testa med bara `node`: `firebase-admin` och `web-push` laddas
först inne i `main()`, så `require('./scripts/send-arsdagar.js')` ger bara
funktionerna.

Tre hemligheter behövs i repot: `VAPID_PRIVATE`, `FIREBASE_EMAIL` och
`FIREBASE_PASSWORD`. Sändaren loggar in som en vanlig användare i stället för att
använda en tjänstekontonyckel – organisationen förbjuder såna nycklar, och en
nyckel hade dessutom gått förbi Firestore-reglerna helt. Kontots uid måste stå i
`familjen()` i `firestore.rules`.

## Nästa steg

Firebase, egen adress och foton per resa är på plats. Kvar står, i
`docs/oppna-fragor.md`:

1. Gästkonto som bara får läsa. Reglerna är fem rader, jobbet ligger i appen –
   tre skrivningar sker av att bara titta. Se `docs/gastkonto.md`.
2. Fler teman ur prototypen (Skymning, Stugan), och om designspåret ska väljas.
3. Bilder grupperade per person, inte bara per resa. Se `docs/mockup-feedback.md`.
4. Flera länkar per resa, med egna namn.

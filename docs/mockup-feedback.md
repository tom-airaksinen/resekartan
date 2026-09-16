# Resekartan – feedback på första mockupen

Mockup från annan AI (2026-09-16): desktop-dashboard med sidomeny, fem statistikkort,
världskarta med foto-pins, detaljpanel till höger, "Senaste resor" + "Snabbstatistik".

## Måste

- **Mobilen är primär.** Mockupen är webbcentrisk (sidomeny, fem kort i rad, sidopanel).
  Designen ska utgå från en telefon på höjden; desktop får bli en bonus.

## Gillar

- **Senaste resor** – listan med de senaste resorna ska finnas kvar.
- **Nyckeltalen**, alla fem: besökta länder, städer, antal resor, dagar på resande fot,
  familjemedlemmar.
- **Kartan** som visar var man varit.
- **Pluppar på kartan** där man varit. Tryck på en plupp → mer info om resan: var,
  hur länge, vilka som var med, när.
- **Filtret "Alla resenärer"** – bra, ska finnas kvar.

## Krav som kommit fram

- **Resenärer:** familjen är fyra – Tom, Karin, Aron, Hedvig. Varje resa anger vilka som
  var med (t.ex. London feb 2025: Karin + Hedvig; Hamburg maj 2026: Tom + Aron).
- **Flera länder i en resa ("avstickare"):** en resa kan ha delmål i andra länder –
  USA-resan hade en natt i Mexiko, Spanien-resan en tur till Gibraltar. Resan är
  huvudobjektet; delmålen hör till den men ska ändå räknas och synas på kartan.
  Avstickare räknas som besökt land i statistiken, ärver resans datum och deltagare som
  default men kan överstyras. Gibraltar, Macau och liknande räknas som egna "länder".

## Gillar inte

_(fylls på)_

## Tillagt efter mockup 1 (Hedvigs önskemål, 2026-09-16)

- **Klicka på ett land → större bild av landet.** Kartan zoomar in på hela landet och
  visar en plupp per ort man varit på, med namnet utsatt. Byggt.
- **Sverige tydligare markerat som hemland**, inte bara mörkare beige. Nu egen varm
  färg med kontur och en hus-markör på hemorten. Byggt.
- **Klicka på Sverige → Sverigekarta** med var i Sverige vi varit, när, vad vi gjorde
  och vilka som var med. Byggt – fyra svenska exempelresor ligger i datat.

## Steg 2 (2026-09-16)

- **Finare karta.** 110m byttes mot Natural Earth 1:50m – kusterna var för kantiga
  jämfört med första mockupen. Havs- och kontinentnamn tillagda (bara kontinenter
  på mobil, annars trängs de).
- **Gränssnitt för att lägga till, ändra och ta bort resor.** Position på en plats
  hämtas via sökning (Nominatim) eller genom att peka på kartan.
- **Lösenordslås.** Ingen kontohantering – ett lösenord för hela sajten, sparat per
  enhet i localStorage. Bara hashen ligger i koden.

## Steg 3 (2026-09-16)

- **Kustlinjen tonar ut vid inzoomning.** Den låg kvar på samma skärmbredd hela vägen
  in och blev ett vitt nät över kartan. Nu smalnar den av och försvinner vid hög zoom –
  den är ett grepp för världsvyn.
- **Ny resa börjar med att söka land** (autocomplete), med senast besökta som snabbval.
- **Egen datumväljare** med årsrad och månader i följd, start- och slutdag i samma vy,
  istället för två `<input type="date">`.
- **Resenärer utöver familjen.** Familjen är förkryssad, övriga kryssas i. Nya personer
  läggs till direkt i dialogen eller under Inställningar.

## Steg 4 (2026-09-16)

- **Filtret på kartan visar bara familjen.** Gäster syns på resorna men är inte
  filterval.
- **Kalendern var enorm på dator** – dagrutorna hade `aspect-ratio: 1` i ett rutnät
  som fick hela fönsterbredden. Nu tre månader i rad med maxbredd, som ett flygbolag.
- **Platssökning medan man skriver**, mot Nominatim + Photon, filtrerad på stoppets
  land. "Korsika" på en Frankrike-resa ger rätt ö.
- **Spara såg ut att göra ingenting.** Valideringen gick genom `alert()`, som är
  blockerad i sandlådade inbäddningar. Alla dialoger är nu egna, och felet pekar ut
  vilken plats som saknar position.

## Steg 5 (2026-09-16)

- **Tjocka linjer vid inzoomning – den riktiga orsaken.** `#map .land` hade
  `stroke-width:.5` i CSS, och CSS vinner över presentationsattribut. Bredden som
  `rescale()` räknade fram ignorerades helt, så linjerna skalades med kartan och blev
  10–17 px vid landvyns zoom. Kustlinjefixen i steg 3 träffade bara `#coast`, som
  saknade CSS-bredd. Nu är alla linjer konstanta på skärmen.
- **Initialen i avatarerna satt ~1 px för högt** (versaler hamnar högt i radboxen).
  Ligger nu i ett `<i>` som skjuts ned `.07em`.
- **Ortsökningen** kan inte fungera i en sandlådad förhandsvisning. Meddelandet säger
  nu varför, och kartpekningen zoomar in på stoppets land först.

## Steg 6 (2026-09-16) – live, PWA och moln

- **Live på GitHub Pages:** https://tom-airaksinen.github.io/resekartan/
- **PWA.** `manifest.json`, ikoner och en service worker som cachar app-skalet.
  Går att spara på hemskärmen och fungerar offline efter första besöket.
- **Avatarerna igen.** iOS Safari centrerade inte innehållet med `inline-grid` +
  `place-items` – bokstaven hamnade uppe till vänster. Utbytt mot `inline-flex`
  med utskrivna `align-items`/`justify-content`, som håller i alla webbläsare.
- **Firebase förberett.** Appen kör lokalt tills `data/firebase-config.js` fylls i;
  då byter den till molnläge med Firebase Authentication och ett delat
  Firestore-dokument. Guide i `docs/firebase.md`, regler i `firestore.rules`.

## Steg 7 (2026-09-16) – riktiga enheter

- **Allt avklippt på iPhone efter inloggning.** Såg ut som safe area men var iOS
  auto-zoom: fokuserar man ett fält med `font-size` under 16px zoomar iOS in, och
  i hemskärmsläge går det inte att zooma ut igen. Alla fält är nu 16px.
- **Nyckeltalen** låg i en horisontell scroller som såg avklippt ut. Nu ett rutnät
  som radbryter (3 + 2 på en telefon).
- **Safe area** hanteras nu även i sidled och för flikraden, inte bara i överkant.
- **Inloggningen kändes hängd.** Firebase-SDK:n (~300 kB) laddades vid varje
  kallstart utan cache och utan synlig återkoppling. Nu cachas den av service
  workern, och låsskärmen visar "Kopplar upp → Loggar in → Hämtar familjens resor".
- **Service workern hämtar sidan nätverket först**, så ingen fastnar i en gammal
  version efter att ha sparat appen på hemskärmen.

## Steg 8 (2026-09-16) – dragbart ark och bilder

- **Arket går att dra.** Handtaget såg ut att kunna dras men gjorde bara en toggle.
  Nu dras det fritt och snäpper till fyra lägen, så man kan trycka undan det och
  utforska kartan under – särskilt i landvyn.
- **Bilder per resa.** Galleri i resedetaljen, helskärmsvisning med svep, och
  nedskalning i webbläsaren så varje bild landar på ett par hundra kB. Ligger i en
  egen subcollection, inte i huvuddokumentet.

## Steg 9 (2026-09-16)

- **Import från albumnamn.** Google Photos API är stängt för det här sedan mars 2025,
  så i stället klistrar man in albumnamnen. Datum tolkas ur texten och orten slås upp.
- **Streckmönstret för planerade resor** låg i kartans koordinatsystem och växte med
  zoomen – hela Rumänien blev några få jättefält. Samma klass av bugg som
  linjebredderna; mönstret krymper nu i takt med zoomen.

## Steg 10 (2026-09-16)

- **"Längst hemifrån"** i statistiken: topplista med fågelvägsavstånd från hemorten.
  Visar den längsta platsen i *varje* land – utan den grupperingen fyllde en enda
  långresa hela listan med grannstäder. Raderna går till resan.

## Steg 11 (2026-09-16)

- **En toppbar i stället för två.** "Resekartan · Alla ▾" med utfällbar väljare;
  de två pillren tog mycket höjd på mobilen.
- **Filtret gäller flera personer samtidigt och betyder OCH** – Tom + Karin ger
  resorna där båda var med. Det var poängen: se vad man gjort tillsammans.
- **Filtret syns i alla flikar**, inte bara på kartan. Det påverkar ju statistiken
  och reselistan lika mycket.
- **Inställningar blev en femte flik** i stället för ett fritt flytande kugghjul.

## Senare – inte version 1

Version 1 ska vara väldigt enkel, men datamodellen ska inte stänga dörren för detta.

- **Foton per resa.** ~~Grupperade per person~~ – byggt 2026-09-16 som ett gemensamt
  galleri per resa i stället; familjen delar konto och det spelade mindre roll vem
  som laddat upp vad. Nästa steg är att kunna knyta en bild till en enskild ort.

# Öppna frågor – Resekartan

## Plattform
- [x] PWA i webbläsaren (som Flippa/Gnugga/Morsemaskinen) eller något annat? → **Svar:** Ja, responsiv webbapp på GitHub Pages. Firebase som gemensam databas i ett senare steg, så Hedvig kan lägga in från mobilen, Tom från datorn och Aron från paddan. (2026-09-16)
- [x] Ska den vara publik eller kräva inloggning? → **Svar:** Rudimentärt lösenordsskydd räcker, inga användarkonton. Inloggningen sparas per enhet i localStorage. Byggt 2026-09-16: PBKDF2-hash i koden, aldrig lösenordet i klartext. (2026-09-16)
- [x] Hur skyddas datat när Firebase kopplas på? → **Svar:** Firebase Authentication med ett delat familjekonto (e-post + lösenord), och Firestore-regler som bara släpper in det kontots uid. Då ersätter det den lokala lösenordsgrinden. Byggt 2026-09-16, väntar på att projektet skapas i konsolen – se `docs/firebase.md`. (2026-09-16)
- [ ] Skapa Firebase-projektet och fyll i `data/firebase-config.js` + uid i `firestore.rules`.
- [x] Eget repo på GitHub, eller en mapp i något befintligt? → **Svar:** Eget publikt repo, som morsemaskinen. Live på https://tom-airaksinen.github.io/resekartan/ sedan 2026-09-16. Publikt krävs för Pages på Free-planen. (2026-09-16)
- [ ] Egen adress `resekartan.tomairaksinen.se`: CNAME hos Loopia → `tom-airaksinen.github.io.`, custom domain i GitHub Pages, och – lätt att glömma – `resekartan.tomairaksinen.se` som Authorized domain i Firebase Authentication, annars går det inte att logga in. Stegen står i README under Deploya → Egen adress. (2026-09-19)
- [ ] Vad blir lösenordet? Byt från utgångsvärdet under Inställningar → Lösenord, och klistra in hashen i `AUTH` i `app.js`. Skriv aldrig lösenordet i repot.

## Kartdata
- [x] Vilken kartdata? → **Svar:** Natural Earth 1:50m via world-atlas (public domain, ~236 kB gzippat). Byttes från 110m 2026-09-16 för finare kuster; gav också Hongkong och Macau egna ytor. (2026-09-16)
- [ ] Räcker 50m, eller vill vi bygga 10m från Natural Earths shapefiles när vi zoomar in på småländer?

## Innehåll
- [ ] Hur långt bak ska resorna gå – bara det vi minns, eller hela vägen tillbaka?
- [ ] Ska "hemma" (Sverige) räknas som besökt land i totalen? (Nu: nej, Sverige ritas i en egen dämpad ton.)

## Datamodell
- [x] Räknas en avstickare (Mexiko en natt, Gibraltar) som "besökt land" i statistiken? → **Svar:** Ja. Men det ska synas att den hör till huvudresan (Kalifornien). (2026-09-16)
- [x] Räknas Gibraltar som eget land eller som Storbritannien? → **Svar:** Eget land – "special-territorier" som Gibraltar och Macau räknas för sig, det är det roliga. (2026-09-16)
- [x] Ska en avstickare ha egna datum/deltagare, eller ärver den resans? → **Svar:** Ärver som default, men kan överstyras per avstickare. (2026-09-16)

## Design
- [ ] Vilket designspår ska appen ha? Prototyp med fyra spår (Papper, Skymning, Stugan, Hedvig/rosa), temaväljare och fyra ikonförslag: https://claude.ai/artifact/9UVgb82rs82TwCb8uxK3v5 (2026-09-17)
- [x] Ska temat vara valbart per enhet (Inställningar → Utseende) eller ett gemensamt utseende för alla? Hedvig vill ha rosa. → **Svar:** Valbart per enhet. Byggt 2026-09-17: två teman, Standard och Hedvig (rosa), under Inställningar → Utseende. Valet ligger i `localStorage` och följer inte med till molnet. Rosa är bara ljust; Standard följer systemets ljusa/mörka läge som förut. (2026-09-17)
- [ ] Ska fler teman byggas (Skymning, Stugan från prototypen)?
- [x] Ska resenärsfiltret komma ihåg sig mellan starter? → **Svar:** Ja, sedan 2026-09-19, i `localStorage` per enhet precis som temat. Hela familjen är fortfarande utgångsläget, men bara tills någon väljer annat. (2026-09-19)
- [x] Ny hemskärmsikon – vilken av de fyra? Genomskinlig bakgrund går inte på iOS (fylls svart), så ikonen behöver en designad bakgrund. → **Svar:** Globpluppen, kartnål med glob i huvudet. Inlagd 2026-09-17, källa i `icon.svg`. Tills vidare – kan bytas när designspåret är valt. (2026-09-17)
- [x] Fotobaserad design (thumbnails i listor, hero-bild i resedetaljen)? Inspo och konsekvenser i `docs/inspo/fotobaserad.md`. → **Svar:** Ja, byggt. Miniatyrer i listorna sedan 2026-09-17, herobild överst i resedetaljen sedan 2026-09-19 – miniatyren visas uppskalad och suddig direkt, sedan 400 px och till sist originalet. Ingen extra hämtning som inte ändå hade skett. (2026-09-19)
- [ ] Miniatyrer i reselistorna: resans omslagsbild visas till vänster i Senaste resor och Alla resor. Byggt 2026-09-17 som test, med drag and drop i galleriet för att välja omslag. Rader utan bild fick först en smalare ruta och ojämn vänsterkant; sedan 2026-09-18 har alla reserader samma liggande ruta, med flaggan i när bild saknas. (2026-09-18)
- [ ] Omslagsbilden sparas på resan i `DB` (~5 kB styck). Håll ett öga på dokumentstorleken när resorna blir många – Firestores gräns är 1 MB. (2026-09-17)
- [x] Färgskalan på kartan: räcker tre steg? → **Svar:** Nej. Sedan 2026-09-19 är det fyra steg, och **ett besök är sitt eget steg** – det är det absolut vanligaste, och slogs ettan ihop med tvåorna försvann den skillnad man helst vill se. Steg 2–4 fördelar resten. Tonerna ligger som `--v1`–`--v4` per tema i `index.html`. (2026-09-19)
- [ ] Känns enkelresorna fortfarande för ljusa mot havet nu när `--v1` blivit ljusare, eller ska skalan byta kulör helt? (2026-09-19)
- [ ] Länk per resa finns sedan 2026-09-18 (en adress, t.ex. Google Photos-album). Ska det gå att lägga flera länkar per resa, och i så fall med egna namn? (2026-09-18)
- [ ] Gästkonto som bara får läsa? Utrett 2026-09-18, inte byggt. Reglerna är fem rader; jobbet ligger i appen, särskilt tre skrivningar som sker av att bara titta. Se `docs/gastkonto.md`. (2026-09-18)
- [x] Klistra in bild: skärmdumpar fungerar på iPhone, bilder ur Google Photos-appen släpper Safari inte ifrån sig (`NotAllowedError`). → **Svar:** Bekräftat systematiskt 2026-09-18: skärmdump går på ett tryck, Google Photos-bild kräver långtryck i rutan och går då varje gång. Två lägen i rutan, ingen väg att slå ihop dem. (2026-09-18)

## Resor kontra boende
- [ ] **Hur ska långa vistelser räknas?** Tom bodde ett år i Moskva, Karin en termin (vid ett annat tillfälle), Tom hela februari 2026 i Tokyo. Alla tre ska räknas som besökta länder, men ett år i Moskva får inte bli 365 resdagar. Förslaget 2026-09-19: en kryssruta **"Vi bodde här"** (`bo: true`) på resan i stället för en automatisk 30-dagarsregel – Tokyo-månaden är 28 dagar och ska räknas som resa, så gränsen skulle bli godtycklig. En boenderesa märker landet som besökt men ger noll resdagar och räknas inte som resa.
- [ ] **Överlappet, som följer av samma förslag:** resdagar räknas per person, och dagar som ligger inne i den personens egen boendeperiod i samma land räknas inte. Tom hälsar på Karin tre veckor under hennes Moskvatermin → Toms 21 dagar räknas, Karins inte. Ligger hela resan inne i ens boendeperiod räknas den inte som ens resa alls. Tokyo-fallet (Karin sista veckan) fungerar redan idag, eftersom `travelDays()` är ett set av datum och överlappande resor därför bara räknas en gång.
- [ ] Ska en boenderesa ha en egen ton på kartan och en egen etikett i listorna ("Bodde här"), eller se ut som vilken resa som helst?

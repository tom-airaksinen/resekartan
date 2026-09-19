# Öppna frågor – Resekartan

## Plattform
- [x] PWA i webbläsaren (som Flippa/Gnugga/Morsemaskinen) eller något annat? → **Svar:** Ja, responsiv webbapp på GitHub Pages. Firebase som gemensam databas i ett senare steg, så Hedvig kan lägga in från mobilen, Tom från datorn och Aron från paddan. (2026-09-16)
- [x] Ska den vara publik eller kräva inloggning? → **Svar:** Rudimentärt lösenordsskydd räcker, inga användarkonton. Inloggningen sparas per enhet i localStorage. Byggt 2026-09-16: PBKDF2-hash i koden, aldrig lösenordet i klartext. (2026-09-16)
- [x] Hur skyddas datat när Firebase kopplas på? → **Svar:** Firebase Authentication med ett delat familjekonto (e-post + lösenord), och Firestore-regler som bara släpper in det kontots uid. Då ersätter det den lokala lösenordsgrinden. Byggt 2026-09-16, väntar på att projektet skapas i konsolen – se `docs/firebase.md`. (2026-09-16)
- [x] Skapa Firebase-projektet och fyll i `data/firebase-config.js` + uid i `firestore.rules`. → **Svar:** Klart. Projektet `resekartan-3b126` kör skarpt sedan 2026-09-17; familjekontot är inlagt i `familjen()` i reglerna. (2026-09-19)
- [x] Eget repo på GitHub, eller en mapp i något befintligt? → **Svar:** Eget publikt repo, som morsemaskinen. Live på https://tom-airaksinen.github.io/resekartan/ sedan 2026-09-16. Publikt krävs för Pages på Free-planen. (2026-09-16)
- [x] Egen adress `resekartan.tomairaksinen.se`? → **Svar:** Live 2026-09-19. CNAME hos Loopia (Loopia lägger själv till A-poster mot sitt webbhotell när man skapar subdomänen – de måste bort), custom domain + Enforce HTTPS i GitHub Pages, och domänen bland Firebases Authorized domains. Gamla adressen skickar vidare med 301. Stegen står i README under Deploya → Egen adress. (2026-09-19)
- [x] Vad blir lösenordet? → **Svar:** Överspelat av molnläget. Inloggningen går via Firebase Authentication med familjekontot, och lösenordet byts i Firebase-konsolen → Authentication → Users. PBKDF2-hashen i `AUTH` används bara i lokalt läge. Skriv aldrig lösenordet i repot. (2026-09-19)

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
- [x] **Hur ska långa vistelser räknas?** Tom bodde ett år i Moskva, Karin en termin, Tom hela februari 2026 i Tokyo. → **Svar:** Kryssrutan "Räkna som permanentboende, ta inte med i statistiken över resdagar" (`t.bo`) på resan, ingen automatisk dagsgräns – Tokyo-månaden är 28 dagar och ska räknas som resa, så gränsen hade blivit godtycklig. Resan räknas som resa och land men ger noll resdagar. Byggt 2026-09-19 (v55).
- [x] **Överlappet:** dagar som ligger inne i en persons egen boendeperiod i samma land räknas inte som hennes resdagar. → **Svar:** Byggt. `boendePerioder()` nycklar på person och land; en dag faller bort först när alla som dagen gäller för bodde där. Tom hos Karin i Moskva = 21 dagar för honom, 0 för henne. Helg i Prag under Moskvaåret ger resdagar, vecka i S:t Petersburg gör det inte. (2026-09-19)
- [x] Ska en boenderesa synas i listorna och på kartan? → **Svar:** Nej, bara i resedetaljen tills vidare: etiketten "Bodde här" och "räknas inte som resdagar" efter dagantalet. Kan utökas om det känns otydligt. (2026-09-19)
- [x] Moskvaåret vinner "Längsta resan" för alltid. → **Svar:** Boenden räknas bort därifrån och får en egen rad, "Längsta vistelsen", som bara syns när det finns ett boende inlagt. (2026-09-19)
- [x] Ortsökningen sparade ortens eget alfabet (沖縄県 i stället för Okinawa) i Japan och Etiopien. → **Svar:** Åtgärdat 2026-09-19 (v58): Nominatim frågas med `accept-language=sv,en` och `namedetails=1`, Photon med `lang=en`, och vid dubbletter vinner ett latinskt namn. Svenska går fortfarande först. Redan sparade namn listas under Inställningar → Ortnamn att rätta och rättas för hand. (2026-09-19)
- [ ] Är "Räkna som permanentboende, ta inte med i statistiken över resdagar" rätt ord i kryssrutan, eller räcker "Vi bodde här" när man vant sig? (2026-09-19)

## Kartan
- [x] Territorier färgades av sitt moderland – en helg i Paris tände Réunion och Franska Guyana. → **Svar:** Åtgärdat 2026-09-19 (v63). Länder med delar längre än `UTPOST_KM` (800 km) från huvudlandmassans omslutande ruta delas i flera ytor, och bara de delar där det sitter en plupp färgas. Land utan koordinater färgas helt, som förut. (2026-09-19)
- [ ] Är 800 km för snålt? Vid den gränsen delas 23 länder, och Okinawa, Borneo och Kanarieöarna slutar färgas av Tokyo, Kuala Lumpur och Madrid. 1 500 km ger 11 länder och lämnar dem hela; 2 500 ger 7 och lämnar även Alaska och Azorerna. En siffra på en rad i `app.js`. (2026-09-19)

## Bildvisaren
- [x] Ska man kunna nypa för att zooma i bilderna, även om upplösningen är låg? → **Svar:** Ja, byggt 2026-09-19 (v60). Nyp, panorering med ett finger när man är inzoomad, och dubbeltryck för 2,5×. Taket är 6×; bilderna är 1400 px, så det blir grynigt – men att kunna gå nära är värt det. (2026-09-19)
- [ ] När man svepar vid kanten av en inzoomad bild: ska svepet ta vid och byta bild? Kräver att man vet var bildens kant går inuti `object-fit: contain`, alltså bildens proportioner. Nu måste man zooma ut först. (2026-09-19)

## Notiser
- [x] Ska appen kunna skicka påminnelser om gamla resor? → **Svar:** Ja. Årsdagsnotiser byggda 2026-09-19 (v68): slutdatum, landnamn, "kom hem", tre lägen för hur ofta, kryssruta per person, klockan 16 svensk tid. Beslut och avvägningar i `docs/arsdagsnotiser.md`.
- [ ] Lägg till `VAPID_PRIVATE` och `FIREBASE_SERVICE_ACCOUNT` som GitHub-secrets, annars kan sändaren inte köra. Den privata VAPID-nyckeln ligger i `~/resekartan-vapid-private.txt` på Toms dator. (2026-09-19)
- [ ] Alla fyra behöver lägga till appen på hemskärmen från `resekartan.tomairaksinen.se` och slå på notiser – iPhone släpper bara in web push för den installerade appen. (2026-09-19)
- [ ] Känns notisen rätt efter ett par månader, eller ska texten säga mer – antal platser, en bild? Web Push klarar en bild, men omslaget ligger som data-URL och skulle behöva en riktig adress. (2026-09-19)

# Öppna frågor – Resekartan

## Plattform
- [x] PWA i webbläsaren (som Flippa/Gnugga/Morsemaskinen) eller något annat? → **Svar:** Ja, responsiv webbapp på GitHub Pages. Firebase som gemensam databas i ett senare steg, så Hedvig kan lägga in från mobilen, Tom från datorn och Aron från paddan. (2026-09-16)
- [x] Ska den vara publik eller kräva inloggning? → **Svar:** Rudimentärt lösenordsskydd räcker, inga användarkonton. Inloggningen sparas per enhet i localStorage. Byggt 2026-09-16: PBKDF2-hash i koden, aldrig lösenordet i klartext. (2026-09-16)
- [x] Hur skyddas datat när Firebase kopplas på? → **Svar:** Firebase Authentication med ett delat familjekonto (e-post + lösenord), och Firestore-regler som bara släpper in det kontots uid. Då ersätter det den lokala lösenordsgrinden. Byggt 2026-09-16, väntar på att projektet skapas i konsolen – se `docs/firebase.md`. (2026-09-16)
- [ ] Skapa Firebase-projektet och fyll i `data/firebase-config.js` + uid i `firestore.rules`.
- [x] Eget repo på GitHub, eller en mapp i något befintligt? → **Svar:** Eget publikt repo, som morsemaskinen. Live på https://tom-airaksinen.github.io/resekartan/ sedan 2026-09-16. Publikt krävs för Pages på Free-planen. (2026-09-16)
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
- [ ] Ny hemskärmsikon – vilken av de fyra? Genomskinlig bakgrund går inte på iOS (fylls svart), så ikonen behöver en designad bakgrund.
- [ ] Fotobaserad design (thumbnails i listor, hero-bild i resedetaljen)? Inspo och konsekvenser i `docs/inspo/fotobaserad.md`. Kräver drag and drop för bildordning. (2026-09-17)
- [ ] Miniatyrer i reselistorna: resans omslagsbild visas till vänster i Senaste resor och Alla resor. Byggt 2026-09-17 som test, med drag and drop i galleriet för att välja omslag. Rader utan bild behåller flaggan i en smalare ruta, så vänsterkanten blir ojämn i blandade listor – behåll, eller ge alla rader samma bredd? (2026-09-17)
- [ ] Omslagsbilden sparas på resan i `DB` (~5 kB styck). Håll ett öga på dokumentstorleken när resorna blir många – Firestores gräns är 1 MB. (2026-09-17)

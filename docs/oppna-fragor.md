# Öppna frågor – Resekartan

## Plattform
- [x] PWA i webbläsaren (som Flippa/Gnugga/Morsemaskinen) eller något annat? → **Svar:** Ja, responsiv webbapp på GitHub Pages. Firebase som gemensam databas i ett senare steg, så Hedvig kan lägga in från mobilen, Tom från datorn och Aron från paddan. (2026-09-16)
- [x] Ska den vara publik eller kräva inloggning? → **Svar:** Rudimentärt lösenordsskydd räcker, inga användarkonton. Inloggningen sparas per enhet i localStorage. Byggt 2026-09-16: PBKDF2-hash i koden, aldrig lösenordet i klartext. (2026-09-16)
- [ ] Vad blir lösenordet? Just nu `resekartan` – byt under Inställningar och klistra in den nya hashen i `app.js`.
- [ ] Hur skyddas datat när Firebase kopplas på? Lösenordsgrinden i klienten räcker inte då – det blir Firebase-reglerna som gör jobbet.
- [ ] Eget repo på GitHub, eller en mapp i något befintligt?

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

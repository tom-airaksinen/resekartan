# Gästkonto som bara får läsa

**Status: inte byggt.** Utrett 2026-09-18, uppskattat till en halv dags arbete.
Den här filen finns för att slippa utreda det en gång till.

## Vad det handlar om

Ett andra inlogg som kommer åt familjens resor men inte kan ändra något. Bakom
lösenord, men utan att gästen behöver ett riktigt konto.

## Behörigheten är den enkla delen

`firestore.rules` skiljer i dag inte på läsning och skrivning. Att dela upp dem är
en liten ändring:

```
function familjen() { return ['<uid>']; }
function gaster()   { return ['<gast-uid>']; }

match /resekartan/{document=**} {
  allow read:  if request.auth != null
               && (request.auth.uid in familjen() || request.auth.uid in gaster());
  allow write: if request.auth != null && request.auth.uid in familjen();
}
```

Det är serverkontrollerat. En gäst kan inte skriva ens om någon manipulerar koden
i webbläsaren, och det är starkare än det lokala lösenordslåset som ligger öppet i
`app.js`.

**Kontot behöver ingen riktig e-postadress.** Firebase kräver en adress som
användarnamn men verifierar den inte, så `gast@resekartan.local` med ett lösenord
fungerar. I praktiken blir det bara ett lösenord att dela ut, och det återkallas
genom att byta lösenord i konsolen.

## Fällan: appen skriver när man bara tittar

Det här är det som gör jobbet större än det ser ut. Tre skrivningar sker utan att
någon trycker på något, och alla tre skulle falla på behörighet för en gäst:

| Var | När |
| --- | --- |
| `syncThumb()` | omslagsbilden skapas första gången en resa med foton öppnas |
| `migratePhotos()` | bilder från före v21 delas upp när galleriet öppnas |
| `cloudFirstSync()` | huvuddokumentet skapas om det saknas, vid inloggning |

Att dölja knappar räcker alltså inte. De här tre måste stängas av separat, annars
möts gästen av permission-denied när hon bara bläddrar.

## Knapparna

Ett dussin ställen: Ny resa, Importera, Ändra resa, Ta bort, lägg till och flytta
bilder, ta bort bild, och hela Inställningar utom Utseende.

Billigast är att märka dem med ett attribut och dölja allihop med **en** CSS-regel
när gästläget är på, i stället för ett dussin villkor i koden. Då blir varje
ändring ett ord och det går inte att tänka fel. Lägg en spärr i `saveDB()` och i
`photos`-funktionerna som skyddsnät, så en missad knapp inte ger ett kryptiskt fel.

Gästläget avgörs av inloggat uid mot en lista i `app.js`. Att listan ligger öppet
spelar ingen roll – reglerna är det som gäller, koden bara döljer det som ändå
inte skulle fungera.

## Att bestämma först

Ska gästen se **allt**, eller ska en **enskild resa** kunna delas, till exempel med
mormor? Det senare är en annan och betydligt större sak, eftersom allt ligger i ett
enda dokument bakom inloggning. Det skulle kräva en publik kopia per delad resa.

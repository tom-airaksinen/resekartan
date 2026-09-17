# Koppla på Firebase

Appen kör lokalt tills `data/firebase-config.js` är ifylld. Då byter den till
molnläge: alla enheter delar samma data, och inloggningen går mot Firebase
Authentication i stället för lösenordshashen i `app.js`.

Det här är också först nu datat får ett *riktigt* skydd. Lösenordslåset i lokalt
läge är en grind mot nyfikna; Firestore-reglerna är det som faktiskt håller.

## 1. Skapa projektet

1. <https://console.firebase.google.com> → **Lägg till projekt** → t.ex. `resekartan`.
   Google Analytics behövs inte.
2. **Bygg → Firestore Database → Skapa databas**. Välj **produktionsläge**
   (reglerna sätts i steg 4) och regionen `eur3` eller `europe-north1`.
3. **Bygg → Authentication → Kom igång → E-post/lösenord → Aktivera**.

## 2. Skapa familjens konto

**Authentication → Users → Lägg till användare.** En e-post och ett lösenord som
ni fyra delar – ni behöver inte varsitt konto.

Kopiera **User UID** som dyker upp i listan.

## 3. Hämta konfigurationen

**Projektinställningar (kugghjulet) → Dina appar → Webb (`</>`)** → registrera
appen (ingen hosting). Kopiera `firebaseConfig`-objektet och klistra in det i
`data/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "…",
  authDomain: "resekartan-xxxxx.firebaseapp.com",
  projectId: "resekartan-xxxxx",
  storageBucket: "resekartan-xxxxx.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
```

Värdena är inte hemliga – de pekar bara ut projektet, och är synliga i vilken
webbapp som helst. Skyddet ligger i reglerna.

## 4. Sätt reglerna

**Firestore Database → Regler.** Klistra in innehållet i `firestore.rules`,
byt `KLISTRA_IN_UID_HAR` mot uid:t från steg 2, och publicera.

Utan det steget kommer ingen åt datat – inte ens ni.

## 5. Tillåt domänen

**Authentication → Settings → Authorized domains** ska innehålla
`tom-airaksinen.github.io`. Lägg till den om den saknas.

## 6. Deploya

```sh
git add data/firebase-config.js && git commit -m "Koppla på Firebase" && git push
```

Ladda om sajten. Nu ska e-postfältet dyka upp på låsskärmen, och en grön prick
bredvid kugghjulet när synken är igång.

## Första inloggningen

Har du redan lagt in resor lokalt på en enhet skickas de upp första gången den
enheten loggar in mot ett tomt moln. Logga därför in **från den enhet som har
datat först**, och därefter från de andra – annars skriver en tom enhet över.

Efter det syns ändringar direkt på alla enheter.

## Hur datat ligger

Resorna ligger i ett dokument, `resekartan/data`, som en JSON-sträng i fältet
`payload`, plus `updatedAt` och `updatedBy`.

**Bilderna ligger för sig**, i två subcollections. De skulle spränga
huvuddokumentets gräns annars, och Firestore kan inte hämta delar av ett
dokument – vill man läsa något lätt måste det ligga i en egen post.

- `resekartan/data/foton/{id}` – uppgifterna om bilden plus `prev`, en
  förhandsbild på 400 px (~30 kB). Det är den galleriet läser och visar.
- `resekartan/data/bilder/{id}` – originalet, max 1400 px (~200 kB). Hämtas
  först när någon öppnar bilden i helskärm.

Uppdelningen kom i v21. Före den låg originalet i `foton`, vilket gjorde att en
resa med tjugo bilder laddade flera megabyte bara för att rita rutnätet. Gamla
bilder flyttas automatiskt, en i taget i bakgrunden, när resan öppnas.

Firestores gratisnivå på 1 GiB räcker till tusentals bilder.

Fältet `place` är tomt men finns med, så bilder kan knytas till en enskild ort
längre fram utan att det som redan ligger inne behöver skrivas om.

> **Har du redan publicerat reglerna?** Då måste de uppdateras en gång till –
> den tidigare versionen matchade bara `resekartan/data` och släpper inte in
> bilderna. Regeln matchar nu `resekartan/{document=**}`.

Ett dokument gör varje sparning atomär och håller koden enkel. För en familj är
det några tiotal kB, långt under Firestores gräns på 1 MB. Baksidan: sparar två
personer i samma sekund vinner den sista. Blir det ett problem är nästa steg ett
dokument per resa.

## Varför Firestore och inte Realtime Database

Båda hade fungerat – datat är litet och läses i sin helhet, så Firestores bättre
frågemöjligheter spelar ingen roll här. Det som avgjorde är **offline**: Firestore
har en lokal cache i webbläsaren där skrivningar köas och skickas upp när nätet
kommer tillbaka. Eftersom appen ligger på hemskärmen som en PWA går det att lägga
in en resa utan täckning. Realtime Database hade tappat den skrivningen.

Firestore är också det Google bygger vidare på; RTDB underhålls men får inga nya
funktioner.

## Kostnad

Firebases gratisnivå (Spark) räcker med mycket god marginal: 50 000 läsningar och
20 000 skrivningar per dag. Familjen kommer inte i närheten – en vanlig dag blir
det en handfull läsningar och kanske någon enstaka skrivning.

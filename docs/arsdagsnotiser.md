# Årsdagsnotiser

*"I dag för fem år sedan kom ni hem från Rumänien."* En push-notis på årsdagen av
en avslutad resa, med en väg rakt in i resan och dess bilder.

Beslutat 2026-09-19. Det mesta av maskineriet finns redan i Flippa
(`Projekt/glosappen`) och återanvänds: VAPID, `web-push`, prenumeration i molnet,
GitHub Actions som cron, och `push`/`notificationclick` i service workern.

## Vad som skickas

**Slutdatumet styr**, inte startdatumet. "Kom hem" bär alla fallen: en vanlig
resa, en avstickare, och ett år i Moskva – *"i dag för tio år sedan kom du hem
från Ryssland"* fungerar även för ett boende, där "åkte till" hade låtit fel.

**Resans namn**, inte landet och inte orten. Oftast är namnet och landet samma
sak, men har man döpt resan till "Sportlovet i Åre" är det den man minns. Landet
står kvar i brödtexten – utom när det redan finns i namnet, då upprepas det inte.
En resa utan namn faller tillbaka på landet.

Priset är att ett namn inte alltid böjs snällt efter "från". *"Kom du hem från
Moskva-året"* skaver lite. Det är en rimlig växling mot att få med det man själv
skrev; ändrar vi oss är det raden `resnamn()` i sändaren.

En resa den dagen är **bara meningen**, med landets flagga sist:

> **I dag för fem år sedan kom ni hem från Rumänien 🇷🇴**

> **I dag för fem år sedan kom ni hem från Sportlovet i Åre 🇸🇪**

> **I dag för tio år sedan kom Tom hem från Moskva-året 🇷🇺**

Flaggan är resans **första** land; en avstickare får inte sin egen. Orter, land i
klartext och antal dagar provades i brödtexten men togs bort – en notis på en låst
skärm rymmer ändå bara ett par rader, och detaljerna trängde undan det som betyder
något. Resten står i appen, ett tryck bort.

Flera samma dag blir bara antalet:

> **Två resor har årsdag i dag! 🥳**

Listan med land och årtal fanns där först men klipptes mitt i på en iPhone. Den
som är nyfiken är ett tryck från årsdagsvyn, där allt står.

"Ni" när hela familjen var med, annars namnen. Avsändaren vet **inte** vem som
håller i telefonen – en prenumeration är anonym – så "du" går inte att använda
utan att gissa. Namnen är alltid sanna.

## Vilka årsdagar

Tre lägen i stället för fyra kryssrutor. Fyra kryss är fyra beslut om något man
inte har någon känsla för förrän notiserna börjar komma; ett val i tre steg är
lättare att göra och lika lätt att ändra.

| Läge | Årsdagar |
| --- | --- |
| Sparsamt | 5, 10, 15, 20 … |
| Lagom | 1, 2, 5, och sedan vart femte |
| Allt | varje år |

Under alternativen står hur många notiser valet faktiskt ger det närmaste året,
räknat på era egna resor. Då väljer man mot verkligheten i stället för mot en
känsla – något Flippa inte kunde göra, eftersom en daglig påminnelse alltid är en
per dag.

**Resor utan slutdatum hoppas över.** De importerade "bara år"-raderna har
31 december som slut och landar därför på nyårsafton, men eftersom flera resor
samma dag slås ihop blir det en enda notis den dagen. Det får vara.

Planerade resor är aldrig med – de har inte hänt än.

## Vilkas resor

En kryssruta per familjemedlem: *"Resor där någon av dessa var med."*

**"Någon av" står utskrivet med flit.** Kryssrutorna betyder **eller** – en resa
räknas om minst en av de ikryssade var med. Resenärsfiltret i toppbaren, som ser
likadant ut, betyder **och**: väljer man Tom och Karin visas bara resor där båda
var med. Att den skillnaden inte syntes i orden har redan förvirrat en gång, se
"Alla resor är inte samma sak som hela familjen" i README.

Det är dessutom en **egen** inställning, inte resenärsfiltret. Filtret är en
vyinställning, och hade det styrt notiserna skulle Hedvig tysta sina egna notiser
genom att titta på kartan på ett annat sätt.

Valet ligger på enheten tillsammans med prenumerationen, av två skäl: en
prenumeration hör till en webbläsarinstallation, inte till ett konto, och
familjen delar ett enda Firebase-konto. Ingen inloggning kan alltså skilja
telefonerna åt.

## När

**Klockan 16 svensk tid**, inte inställbart, och det står i rutan. Tidig kväll,
när man har lust att titta på bilder.

Att tiden är fast gör sändaren enklare: Flippa kör var femtonde minut för att
träffa allas valda tider, här räcker en gång om dagen.

**Tidigast 16, inte exakt 16.** Actions-cron är i UTC, och schemalagda jobb
startar ofta några minuter sent – ibland mycket mer. Med ett exakt timtest hade en
försenad körning tyst hoppat över dagen. I stället gör jobbet fyra försök (14:00,
15:30, 17:30 och 19:30 UTC), skickar tidigast 16 svensk tid, och varje
prenumeration minns i `lastSent` vilket datum den senast fick något. Den första
körningen som lyckas gör jobbet; resten ser att dagen är avklarad och avstår.

Slår man på notiser efter 16 märks dagen som redan avklarad, annars hade dagens
notis kommit med en gång – som ett hopp ur ingenstans.

## Vart trycket leder

En resa → resan öppnas direkt (`#resa=<id>`). Att visa en lista med ett enda
objekt i vore ett extra steg utan innehåll.

Flera → en årsdagsvy i arket (`#arsdag=YYYY-MM-DD`), som landvyn fast med "för X
år sedan" på varje rad. Arket har redan en historikstack, så Tillbaka fungerar
utan extra arbete.

## Så hänger delarna ihop

| Var | Vad |
| --- | --- |
| `app.js` | inställningar, prenumeration, årsdagsberäkning, årsdagsvy, djuplänkar |
| `sw.js` | tar emot `push`, öppnar rätt vy vid `notificationclick` |
| `resekartan/data/push/<enhet>` | prenumerationen, valda personer och läge |
| `scripts/send-arsdagar.js` | läser resor och prenumerationer, skickar |
| `.github/workflows/arsdagsnotiser.yml` | kör skriptet 14 och 15 UTC |

### Avsändaren loggar in som en användare, inte som ett tjänstekonto

Första försöket använde `firebase-admin` med en tjänstekontonyckel. Google vägrade
skapa nyckeln: organisationen förbjuder det (`Key creation is not allowed on this
service account`). Det är en rimlig policy som inte ska slås av för ett
familjeprojekt – och det visade sig vara rätt tvång.

En tjänstekontonyckel går nämligen **förbi Firestore-reglerna** och gäller tills
någon återkallar den. Sändaren behöver inte i närheten av så mycket. Nu loggar den
in som en vanlig användare mot Firebase Auth och läser via Firestores REST-API,
precis som appen – samma regler gäller, och kontot kan stängas av för sig.

Skapa ett eget konto för det (Authentication → Users → Add user), lägg dess uid i
`familjen()` i `firestore.rules` och publicera reglerna. Då slipper man att en
ändring av familjens lösenord tystar notiserna.

`firebase-admin` behövs inte längre; `web-push` är enda beroendet.

### Hemligheter i repot

| Secret | Vad |
| --- | --- |
| `VAPID_PRIVATE` | privata halvan av nyckelparet; den publika står i `app.js` |
| `FIREBASE_EMAIL` | avsändarens konto |
| `FIREBASE_PASSWORD` | dess lösenord |

Ingen av dem står i koden. Den publika VAPID-nyckeln och projektets API-nyckel är
inte hemliga – de identifierar bara projektet, och det som skyddar datat är
Firestore-reglerna.

## Lägen i inställningsrutan

Rutan visar olika saker beroende på vad som faktiskt går att göra:

| Läge | Vad som visas |
| --- | --- |
| webbläsaren klarar inte push | en rad som säger det |
| iPhone eller iPad, inte på hemskärmen | hur man lägger dit appen |
| inte inloggad mot molnet | logga in först |
| **blockerat i telefonen** (`denied`) | rött kort: slå på i systemets inställningar |
| av | en inbjudan, inte en kryssruta bland andra |
| på | lägen, personer och en testknapp |

**Systemets behörighet avgör om reglaget står på, inte appens minnesanteckning.**
Stänger man av notiser i telefonens inställningar ska rutan följa med – annars
står det "på" medan ingenting kommer fram. `synkaNotisLage()` rättar den lokala
flaggan vid start, och `notisAvsnitt()` läser `Notification.permission` varje
gång den ritas.

Blockerat är ett **eget** läge, inte "av". Appen kan inte fråga igen – webbläsaren
svarar nej direkt – så en kryssruta hade bara känts trasig.

## Att prova hela kedjan

**Actions → Årsdagsnotiser → Run workflow** har tre kryss:

| Kryss | Vad det gör |
| --- | --- |
| tvinga | struntar i att klockan ska vara 16 |
| torrkörning | visar vad som skulle skickas, skickar inget |
| **provnotis** | skickar en **riktig** notis till alla enheter, oavsett årsdagar |

Provnotisen finns för att kunna se hela kedjan fungera – VAPID, prenumeration,
service worker, telefonen – utan att vänta på att en resa faktiskt fyller år. Den
rör inte `lastSent`, så dagens riktiga notis kommer ändå.

## Att veta

**På iPhone fungerar web push bara för appar på hemskärmen**, iOS 16.4 och uppåt.
Alla fyra måste alltså ha lagt till appen – och sedan 2026-09-19 från den nya
adressen, `resekartan.tomairaksinen.se`. Appen säger till i stället för att tyst
misslyckas.

**29 februari** räknas som 28 februari de år som inte är skottår, annars hade en
sådan resa fått en årsdag vart fjärde år.

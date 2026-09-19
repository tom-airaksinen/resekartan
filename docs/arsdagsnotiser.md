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

En resa den dagen är **bara meningen** – ingen brödtext:

> **I dag för fem år sedan kom ni hem från Rumänien**

> **I dag för fem år sedan kom ni hem från Sportlovet i Åre**

Orter, land och antal dagar provades i brödtexten men togs bort: en notis på en
låst skärm rymmer ändå bara ett par rader, och detaljerna trängde undan det som
betyder något. Resten står i appen, ett tryck bort.

Flera samma dag slås ihop till en, och där **är** listan innehållet:

> **Två resor har årsdag i dag**
> Rumänien för fem år sedan · Sportlovet i Åre för fem år sedan

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
träffa allas valda tider, här räcker en körning om dagen. Actions-cron är i UTC,
så jobbet startar 14:00 och 15:00 UTC och skriptet kör bara när klockan i
Stockholm faktiskt är 16 – det täcker både sommar- och vintertid.

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

Resorna ligger i Firestore, som inte har Realtime Databases genväg med en
DB-secret över REST. Avsändaren använder därför **firebase-admin med ett
tjänstekonto**. Det är den enda delen som inte finns i Flippa sedan tidigare.

### Hemligheter i repot

| Secret | Vad |
| --- | --- |
| `VAPID_PRIVATE` | privata halvan av nyckelparet; den publika står i `app.js` |
| `FIREBASE_SERVICE_ACCOUNT` | tjänstekontots JSON, från Firebase-konsolen |

Ingen av dem står i koden. Den publika VAPID-nyckeln är inte hemlig – den
identifierar bara avsändaren för webbläsaren.

## Att veta

**På iPhone fungerar web push bara för appar på hemskärmen**, iOS 16.4 och uppåt.
Alla fyra måste alltså ha lagt till appen – och sedan 2026-09-19 från den nya
adressen, `resekartan.tomairaksinen.se`. Appen säger till i stället för att tyst
misslyckas.

**29 februari** räknas som 28 februari de år som inte är skottår, annars hade en
sådan resa fått en årsdag vart fjärde år.

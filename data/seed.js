/* Exempeldata. Byts mot familjens riktiga resor via Resor → Ny resa.
   Riktiga resor hamnar i localStorage (och senare i Firebase) – aldrig i den här filen,
   så repot kan ligga publikt utan att familjens resor gör det.

   Land anges med numerisk ISO-kod; svenskt namn och flagga härleds i app.js.
   Plats: {name, lat, lon, what} – what är "vad vi gjorde", visas i landvyn. */
window.SEED = {
  /* core: true = familjen, förkryssad på varje ny resa.
     Övriga är resesällskap som kryssas i när de var med. */
  people: [
    { id: 'elin',    name: 'Elin',   core: true },
    { id: 'jonas',  name: 'Jonas',  core: true },
    { id: 'vera',   name: 'Vera',   core: true },
    { id: 'milo', name: 'Milo',   core: true },
    { id: 'sanna',  name: 'Sanna (kompis)' },
    { id: 'pia',  name: 'Pia (granne)' },
    { id: 'mormor',  name: 'Mormor Britt' },
    { id: 'morfar',  name: 'Morfar Sture' },
    { id: 'leif',    name: 'Farbror Leif' }
  ],
  home: { iso: '752', place: { name: 'Stockholm', lat: 59.33, lon: 18.07 } },
  trips: [
    { id: 'it26', title: 'Italien', start: '2026-08-01', end: '2026-08-09',
      who: ['elin','jonas','vera','milo'],
      note: 'En vecka med historia, bad och italiensk mat. Två nätter i Rom med Colosseum och Fontana di Trevi, sedan Formia med strandliv och dagstur till Ponza.',
      stops: [{ iso: '380', places: [
        { name: 'Rom', lat: 41.90, lon: 12.50, what: 'Colosseum och Fontana di Trevi' },
        { name: 'Formia', lat: 41.26, lon: 13.61, what: 'Strandliv och glass varje kväll' },
        { name: 'Gaeta', lat: 41.21, lon: 13.57, what: 'Gamla stan och klippstranden' },
        { name: 'Sperlonga', lat: 41.26, lon: 13.43, what: 'Grottan och Tiberius villa' },
        { name: 'Ponza', lat: 40.90, lon: 12.96, what: 'Dagstur med båt' }]}]},

    { id: 'hh26', title: 'Hamburg', start: '2026-05-01', end: '2026-05-03',
      who: ['elin','vera'],
      note: 'Pappa-och-son-helg: Miniatur Wunderland, hamnrundtur och Elbphilharmonie.',
      stops: [{ iso: '276', places: [
        { name: 'Hamburg', lat: 53.55, lon: 9.99, what: 'Miniatur Wunderland och hamnrundtur' }]}]},

    { id: 'hk25', title: 'Hongkong', start: '2025-10-26', end: '2025-11-03',
      who: ['elin','jonas','vera','milo'],
      note: 'Höstlov i Hongkong. Victoria Peak, Star Ferry och dim sum varje dag. En dag med färja till Macau.',
      stops: [
        { iso: '344', places: [
          { name: 'Hongkong', lat: 22.32, lon: 114.17, what: 'Victoria Peak, Star Ferry och dim sum' }]},
        { iso: '446', side: true, start: '2025-10-30', end: '2025-10-30', places: [
          { name: 'Macau', lat: 22.20, lon: 113.54, what: 'Färja över på dagen, portugisiska gamla stan' }]}]},

    { id: 'us25', title: 'Kalifornien', start: '2025-06-12', end: '2025-06-27',
      who: ['elin','jonas','vera','milo'],
      note: 'Roadtrip längs kusten: San Francisco, Highway 1, Los Angeles och San Diego. En natt över gränsen i Tijuana.',
      stops: [
        { iso: '840', places: [
          { name: 'San Francisco', lat: 37.77, lon: -122.42, what: 'Golden Gate och Alcatraz' },
          { name: 'Los Angeles', lat: 34.05, lon: -118.24, what: 'Santa Monica Pier och Hollywood' },
          { name: 'San Diego', lat: 32.72, lon: -117.16, what: 'Zoo och surfing i La Jolla' }]},
        { iso: '484', side: true, start: '2025-06-20', end: '2025-06-21', places: [
          { name: 'Tijuana', lat: 32.51, lon: -117.04, what: 'En natt över gränsen, tacos på gatan' }]}]},

    { id: 'lon25', title: 'London', start: '2025-02-14', end: '2025-02-17',
      who: ['jonas','milo'],
      note: 'Sportlovshelg med musikal, Harry Potter-studion och Camden.',
      stops: [{ iso: '826', places: [
        { name: 'London', lat: 51.51, lon: -0.13, what: 'Musikal, Harry Potter-studion och Camden' }]}]},

    { id: 'es24', title: 'Andalusien', start: '2024-10-12', end: '2024-10-19',
      who: ['elin','jonas','vera','milo'],
      note: 'Höstlov i Málaga med dagsturer till Sevilla och Gibraltar – aporna på klippan var höjdpunkten.',
      stops: [
        { iso: '724', places: [
          { name: 'Málaga', lat: 36.72, lon: -4.42, what: 'Stranden och Picassomuseet' },
          { name: 'Sevilla', lat: 37.39, lon: -5.99, what: 'Alcázar och dagstur med tåg' }]},
        { iso: '292', side: true, start: '2024-10-15', end: '2024-10-15', places: [
          { name: 'Gibraltar', lat: 36.14, lon: -5.35, what: 'Linbanan upp till aporna på klippan' }]}]},

    { id: 'dk24', title: 'Köpenhamn', start: '2024-05-03', end: '2024-05-05',
      who: ['elin','jonas','vera','milo'],
      note: 'Tivoli, Nyhavn och cykel längs kanalerna.',
      stops: [{ iso: '208', places: [
        { name: 'Köpenhamn', lat: 55.68, lon: 12.57, what: 'Tivoli, Nyhavn och cykel längs kanalerna' }]}]},

    { id: 'ro26', title: 'Rumänien', start: '2026-10-24', end: '2026-10-31',
      who: ['elin','jonas','vera','milo'], planned: true,
      note: 'Höstlovet 2026. Bukarest och Transsylvanien är påtänkta.',
      stops: [{ iso: '642', places: [
        { name: 'Bukarest', lat: 44.43, lon: 26.10, what: 'Bukarest och Transsylvanien är påtänkta' }]}]},

    { id: 'no26lof', title: 'Lofoten', start: '2026-07-03', end: '2026-07-12',
      who: ['elin','jonas','vera','milo'],
      note: 'Midnattssol, branta toppar rakt upp ur havet och rorbuer att bo i. Vi körde hela vägen ut till Å och badade i vatten som var alldeles för kallt.',
      stops: [{ iso: '578', places: [
        { name: 'Svolvær', lat: 68.23, lon: 14.57, what: 'Hamnen och Svolværgeita på håll' },
        { name: 'Henningsvær', lat: 68.15, lon: 14.20, what: 'Fotbollsplanen mellan klipporna' },
        { name: 'Reine', lat: 67.93, lon: 13.09, what: 'Utsikten från Reinebringen' },
        { name: 'Å', lat: 67.88, lon: 12.98, what: 'Vägens slut och torrfiskmuseet' }]}]},

    /* Resor i Sverige – syns när man trycker på hemlandet */
    { id: 'se26are', title: 'Åre', start: '2026-02-21', end: '2026-02-28',
      who: ['elin','jonas','vera','milo'],
      note: 'Sportlov i fjällen. Milo åkte sin första svarta backe och Vera lärde sig snowboard.',
      stops: [{ iso: '752', places: [
        { name: 'Åre', lat: 63.40, lon: 13.08, what: 'Skidor hela veckan och första svarta backen' }]}]},

    { id: 'se25got', title: 'Gotland', start: '2025-07-05', end: '2025-07-14',
      who: ['elin','jonas','vera','milo'],
      note: 'Sommarvecka på Gotland med stugan utanför Visby, raukar på Fårö och bad varje dag.',
      stops: [{ iso: '752', places: [
        { name: 'Visby', lat: 57.64, lon: 18.30, what: 'Ringmuren och medeltidsveckan' },
        { name: 'Fårö', lat: 57.93, lon: 19.15, what: 'Raukarna på Langhammars och bad' },
        { name: 'Ljugarn', lat: 57.32, lon: 18.71, what: 'Stranden och glasspaus' }]}]},

    { id: 'se25gbg', title: 'Göteborg', start: '2025-04-11', end: '2025-04-13',
      who: ['elin','milo'],
      note: 'Helg med Liseberg och Universeum medan Jonas och Vera var på hockeycup.',
      stops: [{ iso: '752', places: [
        { name: 'Göteborg', lat: 57.71, lon: 11.97, what: 'Liseberg och Universeum' }]}]},

    { id: 'fi25', title: 'Finland', start: '2025-08-01', end: '2025-08-05',
      who: ['milo','sanna','pia'],
      note: 'Milo åkte med kompisen Sanna och hennes mamma till Helsingfors. Färja över, Linnanmäki och simhall.',
      stops: [{ iso: '246', places: [
        { name: 'Helsingfors', lat: 60.17, lon: 24.94, what: 'Linnanmäki och Sveaborg' }]}]},

    { id: 'se24kol', title: 'Kolmården', start: '2024-08-09', end: '2024-08-11',
      note: 'Djurparkshelg med camping. Mormor och morfar följde med. Delfinshowen och Wildfire var höjdpunkterna.',
      who: ['elin','jonas','vera','milo','mormor','morfar'],
      stops: [{ iso: '752', places: [
        { name: 'Kolmården', lat: 58.66, lon: 16.39, what: 'Djurparken, delfinshowen och Wildfire' }]}]}
  ]
};

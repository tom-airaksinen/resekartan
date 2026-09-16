/* Firebase-konfiguration.

   Så länge den här är null kör appen helt lokalt: data sparas i localStorage på
   varje enhet, och låset är lösenordshashen i app.js.

   Fyll i värdena från Firebase-konsolen (Projektinställningar → Dina appar → Webb)
   så byter appen till molnläge: alla enheter delar samma data och inloggningen
   sker mot Firebase Authentication i stället.

   Nycklarna nedan är inte hemliga – de identifierar bara projektet. Det som
   skyddar datat är Firestore-reglerna, se README.

window.FIREBASE_CONFIG = {
  apiKey: "…",
  authDomain: "resekartan-xxxxx.firebaseapp.com",
  projectId: "resekartan-xxxxx",
  storageBucket: "resekartan-xxxxx.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
*/
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCwHQkNu1DRWNCckIHq3fftZOmAw0rHgxQ",
  authDomain: "resekartan-3b126.firebaseapp.com",
  projectId: "resekartan-3b126",
  storageBucket: "resekartan-3b126.firebasestorage.app",
  messagingSenderId: "650524119600",
  appId: "1:650524119600:web:3b018b8fdbe7b1247f53f5"
};

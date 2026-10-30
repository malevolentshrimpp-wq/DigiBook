// Importer Firebase-funksjonane du treng
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js"; // Lagt til for databasen din

// Din Firebase-konfigurasjon
const firebaseConfig = {
  apiKey: "AIzaSyDxleNNYJPwPx9rxDQWXvumVJGTDXYoKYs",
  authDomain: "digibooked.firebaseapp.com",
  projectId: "digibooked",
  storageBucket: "digibooked.firebasestorage.app",
  messagingSenderId: "906425900847",
  appId: "1:906425900847:web:07d4c438fb0cf03c9acbda",
  measurementId: "G-2KWG9WNLJ7"
};

// Start Firebase og koble til tenestene
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app); // Gjer databasen klar til bruk

console.log("Firebase er kobla til prosjektet ditt!");
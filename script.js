// =====================================================
// DigiBook – script.js
// Denne fila gjer at nettsida fungerer, og snakkar med Firebase.
// =====================================================


// ---------- 1. KOPLE TIL FIREBASE ----------

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, arrayUnion, arrayRemove }
    from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDxleNNYJPwPx9rxDQWXvumVJGTDXYoKYs",
    authDomain: "digibooked.firebaseapp.com",
    projectId: "digibooked",
    storageBucket: "digibooked.firebasestorage.app",
    messagingSenderId: "906425900847",
    appId: "1:906425900847:web:07d4c438fb0cf03c9acbda"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);     // innlogging
const db = getFirestore(app);  // databasen


// ---------- 2. VARIABLAR ----------

let minUid = null;          // ID-en til den som er logga inn
let minProfil = null;       // profilen til den som er logga inn
let nyttBrukarnamn = null;  // brukarnamnet når nokon lagar ny konto
let profilar = {};          // alle profilane, så me kan vise namn og bilete

const FORSLAG = ["skule", "venskap", "familie", "kjærleik", "stress", "søvn", "trening", "mat",
    "musikk", "spel", "film", "bøker", "natur", "dyr", "mote", "kunst", "framtid", "jobb", "klager"];
const FARGAR = ["kaffi", "rosa", "salvie", "lavendel", "himmel"];
const HUMOR = ["😊", "🥰", "😢", "😡", "😰", "😴"];


// ---------- 3. HJELPEFUNKSJONAR ----------

// Hentar eit element frå HTML-en
function finn(id) {
    return document.getElementById(id);
}

// Viser éi side og skjuler alle dei andre. Markerer òg rett knapp i menyen.
function visSide(id) {
    document.querySelectorAll(".side").forEach((side) => side.hidden = side.id !== id);
    document.querySelectorAll(".meny-knapp").forEach((knapp) => {
        knapp.classList.toggle("aktiv", knapp.dataset.side === id);
    });
    finn("melding").hidden = true;
    window.scrollTo(0, 0);
}

// Viser ei feilmelding øvst på sida
function visMelding(tekst) {
    finn("melding").textContent = tekst;
    finn("melding").hidden = false;
    window.scrollTo(0, 0);
}

// SIKKERHEIT: gjer om farlege teikn, så ingen kan leggje inn kode i tekstane sine (XSS)
function vask(tekst) {
    return String(tekst)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Gjer **feit**, *kursiv* og __understreka__ tekst om til HTML.
// Teksten vert vaska FØRST, så dette er trygt.
function formatertTekst(tekst) {
    return vask(tekst)
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/__(.+?)__/g, "<u>$1</u>")
        .replace(/\*(.+?)\*/g, "<i>$1</i>");
}

// Gjer om eit tidspunkt til lesbar dato, t.d. "30. okt. 2026, 11:43"
function dato(tid) {
    return new Date(tid).toLocaleString("nn-NO", { dateStyle: "medium", timeStyle: "short" });
}

// Profilbilete: anten eit opplasta bilete, eller første bokstav i brukarnamnet
function bileteHTML(profil) {
    if (profil.bilete && profil.bilete.startsWith("data:image/")) {
        return `<img src="${vask(profil.bilete)}" alt="Profilbilete">`;
    }
    return vask(profil.brukarnamn.charAt(0).toUpperCase());
}

// Namn + profilbilete + dato øvst på ein tekst eller eit svar.
// Vanlege: kan trykkjast på for å sjå profilen. Anonyme: "?" og kan ikkje trykkjast på.
function forfattarHTML(data) {
    if (data.anonym) {
        const namn = data.uid === minUid ? "Anonym (deg)" : "Anonym";
        return `
            <div class="forfattar">
                <span class="avatar liten">?</span>
                <span><b>${namn}</b><small>${dato(data.dato)}</small></span>
            </div>`;
    }
    const profil = profilar[data.uid] || { brukarnamn: data.brukarnamn };
    return `
        <button class="forfattar til-profil">
            <span class="avatar liten">${bileteHTML(profil)}</span>
            <span><b>${vask(profil.brukarnamn)}</b><small>${dato(data.dato)}</small></span>
        </button>`;
}

// Lagar knappar som kan slåast av og på (brukt til interesser og emne).
// "valde" er lista over det som er valt no.
function lagValKnappar(boksId, alternativ, valde) {
    const boks = finn(boksId);
    boks.innerHTML = "";
    for (const ord of alternativ) {
        const knapp = document.createElement("button");
        knapp.textContent = "#" + ord;
        knapp.className = valde.includes(ord) ? "emne vald" : "emne";
        knapp.onclick = () => {
            if (valde.includes(ord)) {
                valde.splice(valde.indexOf(ord), 1);   // fjern frå lista
            } else {
                valde.push(ord);                       // legg til i lista
            }
            knapp.classList.toggle("vald");
        };
        boks.append(knapp);
    }
}

// Viser alle feil som skjer med databasen, så du ser kva som er gale
window.addEventListener("unhandledrejection", (hending) => {
    console.error(hending.reason);
    visMelding("Noko gjekk gale: " + hending.reason.message);
});


// ---------- 4. LOGG INN OG LAG KONTO ----------

finn("knapp-logginn").onclick = async () => {
    try {
        await signInWithEmailAndPassword(auth, finn("epost").value, finn("passord").value);
    } catch (feil) {
        visMelding("Feil e-post eller passord.");
    }
};

finn("knapp-lagkonto").onclick = async () => {
    const brukarnamn = finn("brukarnamn").value.trim();
    if (brukarnamn.length < 3) {
        visMelding("Skriv eit brukarnamn på minst 3 bokstavar.");
        return;
    }
    try {
        nyttBrukarnamn = brukarnamn;
        await createUserWithEmailAndPassword(auth, finn("epost").value, finn("passord").value);
    } catch (feil) {
        nyttBrukarnamn = null;
        if (feil.code === "auth/email-already-in-use") visMelding("Denne e-posten har allereie ein konto.");
        else if (feil.code === "auth/weak-password") visMelding("Passordet må ha minst 6 teikn.");
        else visMelding("Sjekk at e-posten er rett skriven.");
    }
};

finn("knapp-loggut").onclick = () => signOut(auth);

// Denne køyrer kvar gong nokon loggar inn eller ut
onAuthStateChanged(auth, async (brukar) => {
    if (!brukar) {
        finn("meny").hidden = true;
        visSide("side-logginn");
        return;
    }

    minUid = brukar.uid;

    // PERSONVERN: e-posten vert lagra i ei PRIVAT samling.
    // Berre du sjølv (og admin i Firebase) kan sjå han, ikkje andre brukarar.
    await setDoc(doc(db, "privat", minUid), { epost: brukar.email });

    const profilRef = doc(db, "brukarar", minUid);
    const svar = await getDoc(profilRef);

    if (svar.exists()) {
        minProfil = svar.data();
    } else {
        // Ny brukar: lag ein profil (utan e-post, for andre kan lese profilen)
        minProfil = {
            brukarnamn: nyttBrukarnamn || "brukar" + Math.floor(Math.random() * 1000),
            interesser: [],
            bio: "",
            bilete: "",
            farge: "kaffi"
        };
        await setDoc(profilRef, minProfil);
    }

    finn("meny").hidden = false;
    if (minProfil.interesser.length === 0) {
        visInteresser();   // ny brukar: spør om interesser først
    } else {
        visFeed();
    }
});


// ---------- 5. MENYEN ----------

finn("meny-feed").onclick = () => visFeed();
finn("meny-alle").onclick = () => visAlle();
finn("meny-sok").onclick = () => visSide("side-sok");
finn("meny-profil").onclick = () => visProfil(minUid);
finn("meny-skriv").onclick = () => opneSkriv();


// ---------- 6. INTERESSER ----------

let valde = [];  // interessene brukaren har trykt på

function visInteresser() {
    valde = [...minProfil.interesser];
    lagValKnappar("interesse-liste", FORSLAG, valde);
    visSide("side-interesser");
}

finn("knapp-lagre-interesser").onclick = async () => {
    if (valde.length === 0) {
        visMelding("Vel minst éin ting.");
        return;
    }
    await updateDoc(doc(db, "brukarar", minUid), { interesser: valde });
    minProfil.interesser = valde;
    visFeed();
};

finn("knapp-endre-interesser").onclick = () => visInteresser();


// ---------- 7. TEKSTAR (INNLEGG) ----------

// Hentar alle tekstar (og alle profilar) frå databasen, med dei nyaste først
async function hentAlleInnlegg() {
    const brukarSvar = await getDocs(collection(db, "brukarar"));
    brukarSvar.docs.forEach((d) => profilar[d.id] = d.data());

    const svar = await getDocs(collection(db, "innlegg"));
    const liste = svar.docs.map((d) => ({ id: d.id, ...d.data() }));
    liste.sort((a, b) => b.dato - a.dato);
    return liste;
}

// Lagar HTML for éin tekst
function innleggHTML(innlegg) {
    const tittel = innlegg.tittel ? `<h3>${vask(innlegg.tittel)}</h3>` : "";
    const emne = innlegg.emne.map((e) => `<button class="emne lite">#${vask(e)}</button>`).join("");
    const hjarte = innlegg.hjarte || [];
    const harTrykt = hjarte.includes(minUid) ? "vald" : "";

    // Mine eigne tekstar kan eg slette. Andre sine kan eg rapportere.
    let knapp = `<button class="lenke rapporter">Rapporter</button>`;
    if (innlegg.uid === minUid) {
        knapp = `<button class="lenke slett">Slett</button>`;
    }

    return `
        <article class="innlegg ${innlegg.anonym ? "anonym" : ""}">
            <div class="innlegg-topp">
                ${forfattarHTML(innlegg)}
                <span class="humor">${vask(innlegg.humor || "")}</span>
            </div>
            <div class="innhald">
                ${tittel}
                <p>${formatertTekst(innlegg.tekst)}</p>
            </div>
            <div>${emne}</div>
            <div class="innlegg-botn">
                <span>
                    <button class="hjarte ${harTrykt}">♥ ${hjarte.length}</button>
                    <button class="lenke svar-knapp">Svar</button>
                </span>
                ${knapp}
            </div>
        </article>`;
}

// Viser ei liste med tekstar på sida
function visInnlegg(boksId, liste) {
    const boks = finn(boksId);
    if (liste.length === 0) {
        boks.innerHTML = `<p class="grå">Ingen tekstar her enno.</p>`;
        return;
    }
    boks.innerHTML = liste.map(innleggHTML).join("");

    // Kopl kvar tekst på sida (nr 0, 1, 2 ...) til rett tekst i lista
    boks.querySelectorAll(".innlegg").forEach((kort, nr) => koplKnappar(kort, liste[nr]));
}

// Gjer alle knappane i éin tekst klikkbare
function koplKnappar(kort, innlegg) {
    kort.querySelectorAll(".emne").forEach((knapp) => {
        knapp.onclick = () => sok(knapp.textContent);
    });

    // Trykk på teksten eller "Svar" = opne teksten
    kort.querySelector(".innhald").onclick = () => opneInnlegg(innlegg);
    kort.querySelector(".svar-knapp").onclick = () => opneInnlegg(innlegg);

    // Trykk på namnet = sjå profilen (finst ikkje på anonyme tekstar)
    const profilKnapp = kort.querySelector(".til-profil");
    if (profilKnapp) profilKnapp.onclick = () => visProfil(innlegg.uid);

    const hjarteKnapp = kort.querySelector(".hjarte");
    hjarteKnapp.onclick = () => gjeHjarte(innlegg, hjarteKnapp);

    const slettKnapp = kort.querySelector(".slett");
    if (slettKnapp) slettKnapp.onclick = () => slettInnlegg(innlegg, kort);

    const rapportKnapp = kort.querySelector(".rapporter");
    if (rapportKnapp) rapportKnapp.onclick = () => rapporter(innlegg, rapportKnapp);
}

// Gje hjarte, eller ta det bort igjen viss du allereie har gjeve
async function gjeHjarte(innlegg, knapp) {
    const ref = doc(db, "innlegg", innlegg.id);
    innlegg.hjarte = innlegg.hjarte || [];

    if (innlegg.hjarte.includes(minUid)) {
        await updateDoc(ref, { hjarte: arrayRemove(minUid) });
        innlegg.hjarte = innlegg.hjarte.filter((x) => x !== minUid);
    } else {
        await updateDoc(ref, { hjarte: arrayUnion(minUid) });
        innlegg.hjarte.push(minUid);
    }
    knapp.textContent = "♥ " + innlegg.hjarte.length;
    knapp.classList.toggle("vald", innlegg.hjarte.includes(minUid));
}

// Slett ein av dine eigne tekstar
async function slettInnlegg(innlegg, kort) {
    if (!confirm("Vil du slette teksten?")) return;
    await deleteDoc(doc(db, "innlegg", innlegg.id));
    kort.remove();
    if (kort.classList.contains("stor")) visProfil(minUid);   // var teksten open, gå til profilen
}

// Rapporter ein tekst. Rapporten havnar i samlinga "rapportar" i Firebase.
// Der ser admin kven som skreiv han (forfattarUid), òg om han er anonym.
async function rapporter(innlegg, knapp) {
    const grunn = prompt("Kvifor vil du rapportere denne teksten?");
    if (!grunn) return;

    await addDoc(collection(db, "rapportar"), {
        innleggId: innlegg.id,
        tekst: innlegg.tekst,
        grunn: grunn,
        forfattarUid: innlegg.uid,
        anonym: innlegg.anonym,
        rapportertAv: minUid,
        dato: Date.now()
    });
    knapp.textContent = "Rapportert ✓";
    knapp.disabled = true;
}


// ---------- 8. OPNE EIN TEKST OG SVARE ----------

let opentInnlegg = null;        // teksten som er open no
let forrigeSide = "side-feed";  // sida me kom frå (for "Tilbake"-knappen)

async function opneInnlegg(innlegg) {
    const dennaSida = document.querySelector(".side:not([hidden])").id;
    if (dennaSida !== "side-innlegg") forrigeSide = dennaSida;

    opentInnlegg = innlegg;
    visSide("side-innlegg");

    // Vis teksten stort
    finn("innlegg-stor").innerHTML = innleggHTML(innlegg);
    const kort = finn("innlegg-stor").querySelector(".innlegg");
    kort.classList.add("stor");
    koplKnappar(kort, innlegg);

    finn("svar-tekst").value = "";
    finn("svar-anonym").checked = false;
    visSvar();
}

finn("knapp-tilbake").onclick = () => visSide(forrigeSide);

// Hentar og viser svara under teksten (eldste først, som ein samtale)
async function visSvar() {
    const svar = await getDocs(collection(db, "innlegg", opentInnlegg.id, "svar"));
    const liste = svar.docs.map((d) => ({ id: d.id, ...d.data() }));
    liste.sort((a, b) => a.dato - b.dato);

    if (liste.length === 0) {
        finn("svar-liste").innerHTML = `<p class="grå">Ingen svar enno. Ver den første!</p>`;
        return;
    }

    finn("svar-liste").innerHTML = liste.map((s) => `
        <div class="svar ${s.anonym ? "anonym" : ""}">
            <div class="svar-topp">
                ${forfattarHTML(s)}
                ${s.uid === minUid ? `<button class="lenke slett">Slett</button>` : ""}
            </div>
            <p>${vask(s.tekst)}</p>
        </div>`).join("");

    // Gjer namn og slett-knappar klikkbare
    finn("svar-liste").querySelectorAll(".svar").forEach((boks, nr) => {
        const s = liste[nr];
        const profilKnapp = boks.querySelector(".til-profil");
        if (profilKnapp) profilKnapp.onclick = () => visProfil(s.uid);

        const slettKnapp = boks.querySelector(".slett");
        if (slettKnapp) slettKnapp.onclick = async () => {
            if (!confirm("Vil du slette svaret?")) return;
            await deleteDoc(doc(db, "innlegg", opentInnlegg.id, "svar", s.id));
            visSvar();
        };
    });
}

// Send eit svar
finn("knapp-svar").onclick = async () => {
    const tekst = finn("svar-tekst").value.trim();
    if (tekst === "") return;
    const anonym = finn("svar-anonym").checked;

    await addDoc(collection(db, "innlegg", opentInnlegg.id, "svar"), {
        uid: minUid,
        brukarnamn: anonym ? "" : minProfil.brukarnamn,
        anonym: anonym,
        tekst: tekst,
        dato: Date.now()
    });
    finn("svar-tekst").value = "";
    finn("svar-anonym").checked = false;
    visSvar();
};


// ---------- 9. TIL DEG ----------

async function visFeed() {
    visSide("side-feed");
    const alle = await hentAlleInnlegg();
    const fraAndre = alle.filter((i) => i.uid !== minUid);

    // Finn tekstar som har minst eitt emne brukaren likar
    const forDeg = fraAndre.filter((i) => i.emne.some((e) => minProfil.interesser.includes(e)));

    if (forDeg.length > 0) {
        finn("feed-tekst").textContent = "Tekstar frå andre om ting du likar.";
        visInnlegg("feed-liste", forDeg);
    } else {
        finn("feed-tekst").textContent = "Ingen har skrive om interessene dine enno. Her er dei nyaste tekstane.";
        visInnlegg("feed-liste", fraAndre);
    }
}


// ---------- 10. ALLE TEKSTAR ----------

async function visAlle() {
    visSide("side-alle");
    visInnlegg("alle-liste", await hentAlleInnlegg());
}


// ---------- 11. SØK ----------

finn("knapp-sok").onclick = () => sok(finn("sok-felt").value);

async function sok(ord) {
    ord = ord.replace("#", "").trim().toLowerCase();
    finn("sok-felt").value = ord;
    visSide("side-sok");
    const alle = await hentAlleInnlegg();
    // Treff viss ordet finst som #emne, i tittelen eller i teksten
    const treff = alle.filter((i) =>
        i.emne.includes(ord) ||
        (i.tittel || "").toLowerCase().includes(ord) ||
        i.tekst.toLowerCase().includes(ord));
    visInnlegg("sok-liste", treff);
}


// ---------- 12. PROFIL (din eigen eller andre sin) ----------

async function visProfil(uid) {
    const erMeg = uid === minUid;
    visSide("side-profil");
    finn("pynt-boks").hidden = true;
    if (!erMeg) finn("meny-profil").classList.remove("aktiv");

    const alle = await hentAlleInnlegg();   // hentar òg profilane
    const profil = erMeg ? minProfil : profilar[uid];

    finn("profil-kort").className = "kort profil-kort farge-" + profil.farge;
    finn("profil-bilete").innerHTML = bileteHTML(profil);
    finn("profil-namn").textContent = profil.brukarnamn;
    finn("profil-bio").textContent = profil.bio || (erMeg ? "Du har ikkje skrive noko om deg sjølv enno." : "");
    finn("profil-interesser").textContent = profil.interesser.map((e) => "#" + e).join("   ");

    // Berre på din eigen profil kan du redigere
    finn("profil-knappar").hidden = !erMeg;
    finn("profil-tekstar-tittel").textContent = erMeg ? "Mine tekstar" : "Tekstar av " + profil.brukarnamn;

    // PERSONVERN: anonyme tekstar skal ALDRI synast på profilen til andre
    const tekstar = alle.filter((i) => i.uid === uid && (erMeg || !i.anonym));
    visInnlegg("profil-liste", tekstar);
}


// ---------- 13. SKRIV NY TEKST ----------

let valdeEmne = [];   // emna brukaren har valt
let valtHumor = "";   // humøret brukaren har valt

finn("knapp-avbryt-nytt").onclick = () => visProfil(minUid);

function opneSkriv() {
    valdeEmne = [];
    valtHumor = "";
    finn("nytt-tittel").value = "";
    finn("nytt-tekst").value = "";
    finn("nytt-anonym").checked = false;
    finn("anonym-info").hidden = true;
    finn("skriv-dato").textContent = new Date().toLocaleDateString("nn-NO",
        { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    teiknEmne();
    teiknHumor();
    oppdaterOrdteljar();
    visSide("side-skriv");
}

// Viser emne-knappane: forslaga + dei brukaren har lagt til sjølv
function teiknEmne() {
    const alternativ = [...new Set([...FORSLAG, ...valdeEmne])];
    lagValKnappar("nytt-emne-liste", alternativ, valdeEmne);
}

// Legg til eit eige emne, t.d. "hest"
finn("knapp-legg-til-emne").onclick = () => {
    const ord = finn("eige-emne").value.toLowerCase().replace(/[^a-zæøå0-9_]/g, "");
    if (ord !== "" && !valdeEmne.includes(ord)) {
        valdeEmne.push(ord);
    }
    finn("eige-emne").value = "";
    teiknEmne();
};

// Teiknar humør-knappane (berre eitt kan veljast)
function teiknHumor() {
    finn("humor-liste").innerHTML = "";
    for (const humor of HUMOR) {
        const knapp = document.createElement("button");
        knapp.textContent = humor;
        knapp.className = humor === valtHumor ? "emoji vald" : "emoji";
        knapp.onclick = () => {
            valtHumor = humor === valtHumor ? "" : humor;   // trykk igjen for å fjerne
            teiknHumor();
        };
        finn("humor-liste").append(knapp);
    }
}

// B / I / U-knappane: set teikn rundt teksten du har merka
document.querySelectorAll(".format").forEach((knapp) => {
    knapp.onclick = () => {
        const felt = finn("nytt-tekst");
        const merke = knapp.dataset.merke;
        const start = felt.selectionStart;
        const slutt = felt.selectionEnd;
        const merka = felt.value.slice(start, slutt) || "tekst";

        felt.value = felt.value.slice(0, start) + merke + merka + merke + felt.value.slice(slutt);
        felt.focus();
    };
});

// Teljar ord, som i Word
function oppdaterOrdteljar() {
    const ord = finn("nytt-tekst").value.trim().split(/\s+/).filter((o) => o !== "");
    finn("ordteljar").textContent = ord.length + " ord";
}
finn("nytt-tekst").oninput = oppdaterOrdteljar;

// Vis forklaring når brukaren vel å vere anonym
finn("nytt-anonym").onchange = () => {
    finn("anonym-info").hidden = !finn("nytt-anonym").checked;
};

finn("knapp-publiser").onclick = async () => {
    const tekst = finn("nytt-tekst").value.trim();
    if (tekst === "") {
        visMelding("Du må skrive noko før du kan publisere.");
        return;
    }
    const anonym = finn("nytt-anonym").checked;

    // Finn #emne skrivne i teksten, og slå dei saman med dei valde (Set fjernar duplikat)
    const fraTeksten = (tekst.match(/#[a-zæøå0-9_]+/gi) || []).map((e) => e.slice(1).toLowerCase());
    const emne = [...new Set([...valdeEmne, ...fraTeksten])];

    await addDoc(collection(db, "innlegg"), {
        uid: minUid,
        brukarnamn: anonym ? "" : minProfil.brukarnamn,   // anonym = namnet vert ikkje lagra
        anonym: anonym,
        tittel: finn("nytt-tittel").value.trim(),
        tekst: tekst,
        emne: emne,
        humor: valtHumor,
        hjarte: [],
        dato: Date.now()
    });
    visProfil(minUid);
};


// ---------- 14. REDIGER PROFIL ----------

let valtBilete = "";
let valtFarge = "";

finn("knapp-pynt").onclick = () => {
    valtBilete = minProfil.bilete;
    valtFarge = minProfil.farge;
    finn("pynt-bio").value = minProfil.bio;
    teiknPynt();
    finn("pynt-boks").hidden = false;
};

finn("knapp-avbryt-pynt").onclick = () => finn("pynt-boks").hidden = true;
finn("knapp-fjern-bilete").onclick = () => { valtBilete = ""; teiknPynt(); };

// Viser korleis biletet ser ut, og teiknar fargeknappane
function teiknPynt() {
    finn("pynt-forhand").innerHTML = bileteHTML({ brukarnamn: minProfil.brukarnamn, bilete: valtBilete });

    finn("farge-liste").innerHTML = "";
    for (const farge of FARGAR) {
        const knapp = document.createElement("button");
        knapp.textContent = farge;
        knapp.className = "fargeknapp farge-" + farge + (farge === valtFarge ? " vald" : "");
        knapp.onclick = () => { valtFarge = farge; teiknPynt(); };
        finn("farge-liste").append(knapp);
    }
}

// Når brukaren vel eit bilete frå datamaskina
finn("bilete-fil").onchange = () => {
    const fil = finn("bilete-fil").files[0];
    if (!fil) return;

    const bilete = new Image();
    bilete.onload = () => {
        // Gjer biletet lite (200 x 200 pikslar), så det får plass i databasen
        const lerret = document.createElement("canvas");
        lerret.width = 200;
        lerret.height = 200;
        const side = Math.min(bilete.width, bilete.height);   // klipp ut ein firkant frå midten
        lerret.getContext("2d").drawImage(bilete,
            (bilete.width - side) / 2, (bilete.height - side) / 2, side, side,
            0, 0, 200, 200);
        valtBilete = lerret.toDataURL("image/jpeg", 0.8);     // biletet som tekst
        teiknPynt();
    };
    bilete.src = URL.createObjectURL(fil);
};

finn("knapp-lagre-pynt").onclick = async () => {
    const bio = finn("pynt-bio").value.trim();
    await updateDoc(doc(db, "brukarar", minUid), { bilete: valtBilete, farge: valtFarge, bio: bio });
    minProfil.bilete = valtBilete;
    minProfil.farge = valtFarge;
    minProfil.bio = bio;
    visProfil(minUid);
};

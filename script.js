// =====================================================
// DigiBook – script.js
// Denne fila gjer at nettsida fungerer, og snakkar med Firebase.
// =====================================================


// ---------- 1. KOPLE TIL FIREBASE ----------

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
    query, where, arrayUnion, arrayRemove, deleteField }
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


// ---------- 2. VARIABLAR OG LISTER ----------

let minUid = null;          // ID-en til den som er logga inn
let minProfil = null;       // profilen til den som er logga inn
let nyttBrukarnamn = null;  // brukarnamnet når nokon lagar ny konto
let profilar = {};          // alle profilane, så me kan vise namn og bilete

const FORSLAG = [
    "skule", "lekser", "prøvar", "venskap", "familie", "kjærleik", "forhold", "stress",
    "angst", "søvn", "helse", "kvardag", "klager", "framtid", "jobb", "pengar",
    "trening", "fotball", "dans", "friluftsliv", "natur", "dyr", "hest", "mat",
    "baking", "musikk", "konsertar", "spel", "film", "seriar", "bøker", "teikning",
    "kunst", "foto", "mote", "sminke", "reise", "teknologi", "koding", "humor"
];
const FARGAR = ["kaffi", "rosa", "salvie", "lavendel", "himmel"];
const HUMOR = ["😊", "🥰", "😢", "😡", "😰", "😴"];
const REAKSJONAR = ["❤️", "😂", "😮", "😢", "👏", "🙏"];


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

// Viser alle feil som skjer med databasen, så du ser kva som er gale
window.addEventListener("unhandledrejection", (hending) => {
    console.error(hending.reason);
    visMelding("Noko gjekk gale: " + hending.reason.message);
});

// SIKKERHEIT: gjer om farlege teikn, så ingen kan leggje inn kode (XSS)
function vask(tekst) {
    return String(tekst)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// SIKKERHEIT: tekstane kan ha feit, kursiv osv. Me går gjennom HTML-en og
// tek berre vare på trygge taggar (ei "kvitliste"). Alt anna vert fjerna.
const TRYGGE_TAGGAR = ["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "UL", "OL", "LI"];

function rensHTML(html) {
    const mal = document.createElement("template");   // template køyrer aldri skript
    mal.innerHTML = html;

    function rens(node) {
        let resultat = "";
        for (const barn of node.childNodes) {
            if (barn.nodeType === Node.TEXT_NODE) {
                resultat += vask(barn.textContent);
            } else if (TRYGGE_TAGGAR.includes(barn.nodeName)) {
                const tag = barn.nodeName.toLowerCase();
                resultat += tag === "br" ? "<br>" : `<${tag}>${rens(barn)}</${tag}>`;
            } else {
                resultat += rens(barn);   // ukjend tagg: behald berre teksten inni
            }
        }
        return resultat;
    }
    return rens(mal.content);
}

// Gjer om eit tidspunkt til lesbar dato, t.d. "30. okt. 2026, 11:43"
function dato(tid) {
    return new Date(tid).toLocaleString("nn-NO", { dateStyle: "medium", timeStyle: "short" });
}

// Hentar namnet til ein brukar
function namnTil(uid) {
    return profilar[uid] ? profilar[uid].brukarnamn : "Ukjend";
}

// Profilbilete: anten eit opplasta bilete, eller første bokstav i brukarnamnet
function bileteHTML(profil) {
    if (profil.bilete && profil.bilete.startsWith("data:image/")) {
        return `<img src="${vask(profil.bilete)}" alt="Profilbilete">`;
    }
    return vask(profil.brukarnamn.charAt(0).toUpperCase());
}

// Namn + profilbilete + dato. Kan trykkjast på for å sjå profilen.
function forfattarHTML(uid, tid) {
    const profil = profilar[uid] || { brukarnamn: "Ukjend" };
    return `
        <button class="forfattar til-profil" data-uid="${vask(uid)}">
            <span class="avatar liten">${bileteHTML(profil)}</span>
            <span><b>${vask(profil.brukarnamn)}</b><small>${dato(tid)}</small></span>
        </button>`;
}

// Finn ein knapp inni eit element og bestem kva som skjer når du trykkjer
function vedKlikk(element, klasse, handling) {
    element.querySelectorAll(klasse).forEach((knapp) => {
        knapp.onclick = (hending) => {
            hending.stopPropagation();
            handling(knapp);
        };
    });
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

// Les eit ord frå eit tekstfelt og legg det til i lista (t.d. eit eige emne)
function leggTilEige(feltId, liste) {
    const ord = finn(feltId).value.toLowerCase().replace(/[^a-zæøå0-9_]/g, "");
    if (ord !== "" && !liste.includes(ord)) {
        liste.push(ord);
    }
    finn(feltId).value = "";
}


// ---------- 4. LOGG INN OG LAG KONTO ----------

finn("knapp-logginn").onclick = async () => {
    // Har kontoen ingen profil enno, brukar me brukarnamnet om det er skrive inn
    nyttBrukarnamn = finn("brukarnamn").value.trim() || null;
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
        if (feil.code === "auth/email-already-in-use") {
            // Kontoen finst frå før (t.d. om noko gjekk gale sist). Prøv å logge inn i staden.
            try {
                await signInWithEmailAndPassword(auth, finn("epost").value, finn("passord").value);
            } catch {
                nyttBrukarnamn = null;
                visMelding("Denne e-posten har allereie ein konto. Skriv rett passord og trykk «Logg inn».");
            }
            return;
        }
        nyttBrukarnamn = null;
        if (feil.code === "auth/weak-password") visMelding("Passordet må ha minst 6 teikn.");
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
    const profilRef = doc(db, "brukarar", minUid);
    const svar = await getDoc(profilRef);

    if (svar.exists()) {
        minProfil = svar.data();
    } else {
        // Ny brukar: lag ein profil
        minProfil = {
            brukarnamn: nyttBrukarnamn || "brukar" + Math.floor(Math.random() * 1000),
            bio: "",
            bilete: "",
            farge: "kaffi",
            interesser: [],
            folgjer: []
        };
        await setDoc(profilRef, minProfil);
    }

    // PERSONVERN: e-posten ligg i ei PRIVAT mappe under brukaren (brukarar/ID/privat/info).
    // Berre du sjølv og admin kan sjå han, ikkje andre brukarar.
    await setDoc(doc(db, "brukarar", minUid, "privat", "info"), { epost: brukar.email });

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
finn("meny-sok").onclick = () => sok("");
finn("meny-profil").onclick = () => visProfil(minUid);
finn("meny-skriv").onclick = () => opneSkriv(null);


// ---------- 6. INTERESSER ----------

let valde = [];  // interessene brukaren har trykt på

function visInteresser() {
    valde = [...minProfil.interesser];
    teiknInteresser();
    visSide("side-interesser");
}

function teiknInteresser() {
    const alternativ = [...new Set([...FORSLAG, ...valde])];   // forslag + eigne
    lagValKnappar("interesse-liste", alternativ, valde);
}

finn("knapp-legg-til-interesse").onclick = () => {
    leggTilEige("eiga-interesse", valde);
    teiknInteresser();
};

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


// ---------- 7. HENTE TEKSTAR FRÅ DATABASEN ----------

// Hentar alle profilane
async function hentProfilar() {
    const svar = await getDocs(collection(db, "brukarar"));
    svar.docs.forEach((d) => profilar[d.id] = d.data());
    minProfil = profilar[minUid];
}

// Hentar tekstar (og profilar), med dei nyaste først
async function hentTekstar(sporjing) {
    await hentProfilar();
    const svar = await getDocs(sporjing);
    const liste = svar.docs.map((d) => ({ id: d.id, ...d.data() }));
    liste.sort((a, b) => b.dato - a.dato);
    return liste;
}

// Alle offentlege tekstar (ikkje private)
function hentOffentlege() {
    return hentTekstar(query(collection(db, "innlegg"), where("privat", "==", false)));
}

// Alle mine tekstar, òg dei private
function hentMine() {
    return hentTekstar(query(collection(db, "innlegg"), where("uid", "==", minUid)));
}


// ---------- 8. VISE TEKSTAR ----------

// Lagar HTML for éin tekst
function innleggHTML(innlegg) {
    const erMin = innlegg.uid === minUid;
    const hjarte = innlegg.hjarte || [];
    const tittel = innlegg.tittel ? `<h3>${vask(innlegg.tittel)}</h3>` : "";
    const tekst = innlegg.html ? rensHTML(innlegg.html) : vask(innlegg.tekst);
    const emne = innlegg.emne.map((e) => `<button class="emne lite">#${vask(e)}</button>`).join("");

    // Delt av nokon andre? Då viser me det øvst.
    let delt = "";
    if (innlegg.delt) {
        delt = `<p class="delt-linje">↻ <button class="lenke til-profil" data-uid="${vask(innlegg.uid)}">${vask(namnTil(innlegg.uid))}</button> delte dette</p>`;
    }

    // Små merke: privat og redigert
    let merke = "";
    if (innlegg.privat) merke += `<span class="merke">🔒 Privat</span>`;
    if (innlegg.redigert) merke += `<span class="grå liten-tekst">Redigert</span>`;

    // Knappar nedst til venstre: hjarte, svar og del
    let venstre = `
        <button class="hjarte ${hjarte.includes(minUid) ? "vald" : ""}">♥ ${hjarte.length}</button>
        <button class="lenke svar-knapp">Svar</button>`;
    if (!erMin) venstre += `<button class="lenke del-knapp">↻ Del</button>`;

    // Knappar nedst til høgre: rediger/slett (mine) eller rapporter (andre sine)
    let hogre = `<button class="lenke rapporter">Rapporter</button>`;
    if (erMin && innlegg.delt) hogre = `<button class="lenke slett">Fjern deling</button>`;
    else if (erMin) hogre = `<button class="lenke rediger">Rediger</button> <button class="lenke slett">Slett</button>`;

    return `
        <article class="innlegg ${innlegg.privat ? "privat" : ""}">
            ${delt}
            <div class="innlegg-topp">
                ${forfattarHTML(innlegg.forfattarUid || innlegg.uid, innlegg.dato)}
                <span class="humor">${vask(innlegg.humor || "")}</span>
            </div>
            <div class="innhald">
                ${tittel}
                <div class="tekst">${tekst}</div>
            </div>
            <div class="merke-rad">${merke}</div>
            <div>${emne}</div>
            <div class="innlegg-botn">
                <span>${venstre}</span>
                <span>${hogre}</span>
            </div>
        </article>`;
}

// Viser ei liste med tekstar på sida
function visInnlegg(boksId, liste, tomTekst) {
    const boks = finn(boksId);
    if (liste.length === 0) {
        boks.innerHTML = `<p class="grå">${tomTekst}</p>`;
        return;
    }
    boks.innerHTML = liste.map(innleggHTML).join("");

    // Kopl kvar tekst på sida (nr 0, 1, 2 ...) til rett tekst i lista
    boks.querySelectorAll(".innlegg").forEach((kort, nr) => koplKnappar(kort, liste[nr]));
}

// Bestem kva alle knappane i éin tekst gjer
function koplKnappar(kort, innlegg) {
    kort.querySelector(".innhald").onclick = () => opneInnlegg(innlegg);
    vedKlikk(kort, ".svar-knapp", () => opneInnlegg(innlegg));
    vedKlikk(kort, ".emne", (knapp) => sok(knapp.textContent));
    vedKlikk(kort, ".til-profil", (knapp) => visProfil(knapp.dataset.uid));
    vedKlikk(kort, ".hjarte", (knapp) => gjeHjarte(innlegg, knapp));
    vedKlikk(kort, ".del-knapp", (knapp) => delInnlegg(innlegg, knapp));
    vedKlikk(kort, ".rediger", () => opneSkriv(innlegg));
    vedKlikk(kort, ".slett", () => slettInnlegg(innlegg, kort));
    vedKlikk(kort, ".rapporter", (knapp) => rapporter(innlegg, knapp));
}


// ---------- 9. HJARTE, DELE, SLETTE OG RAPPORTERE ----------

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

// Del (republiser) ein annan sin tekst på din profil.
// Me lagar ein kopi der "uid" er deg og "forfattarUid" er den som skreiv han.
async function delInnlegg(innlegg, knapp) {
    await addDoc(collection(db, "innlegg"), {
        uid: minUid,
        forfattarUid: innlegg.forfattarUid || innlegg.uid,
        tittel: innlegg.tittel || "",
        html: innlegg.html || vask(innlegg.tekst),
        tekst: innlegg.tekst,
        emne: innlegg.emne,
        humor: innlegg.humor || "",
        privat: false,
        delt: true,
        hjarte: [],
        dato: Date.now()
    });
    knapp.textContent = "Delt ✓";
    knapp.disabled = true;
}

// Slett ein av dine eigne tekstar
async function slettInnlegg(innlegg, kort) {
    if (!confirm("Vil du slette denne teksten?")) return;
    await deleteDoc(doc(db, "innlegg", innlegg.id));
    kort.remove();
    if (kort.classList.contains("stor")) visProfil(minUid);   // var teksten open, gå til profilen
}

// Rapporter: opnar eit lite vindauge der du vel kvifor
let rapportInnlegg = null;
let rapportKnapp = null;

function rapporter(innlegg, knapp) {
    rapportInnlegg = innlegg;
    rapportKnapp = knapp;
    finn("rapport-meir").value = "";
    finn("rapport-dialog").showModal();
}

finn("rapport-avbryt").onclick = () => finn("rapport-dialog").close();

// Rapporten havnar i samlinga "rapportar" i Firebase, der admin kan lese han
finn("rapport-send").onclick = async () => {
    const grunn = document.querySelector('input[name="grunn"]:checked').value;
    finn("rapport-dialog").close();

    await addDoc(collection(db, "rapportar"), {
        innleggId: rapportInnlegg.id,
        tittel: rapportInnlegg.tittel || "",
        tekst: rapportInnlegg.tekst,
        grunn: grunn,
        meir: finn("rapport-meir").value.trim(),
        forfattarUid: rapportInnlegg.forfattarUid || rapportInnlegg.uid,
        rapportertAv: minUid,
        dato: Date.now()
    });
    rapportKnapp.textContent = "Rapportert ✓";
    rapportKnapp.disabled = true;
};


// ---------- 10. OPNE EIN TEKST OG SVARE ----------

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
        <div class="svar">
            <div class="svar-topp">
                ${forfattarHTML(s.uid, s.dato)}
                ${s.uid === minUid ? `<button class="lenke slett">Slett</button>` : ""}
            </div>
            <p>${vask(s.tekst)}</p>
            <div class="reaksjonar">${reaksjonarHTML(s)}</div>
        </div>`).join("");

    finn("svar-liste").querySelectorAll(".svar").forEach((boks, nr) => {
        const s = liste[nr];
        vedKlikk(boks, ".til-profil", (knapp) => visProfil(knapp.dataset.uid));
        vedKlikk(boks, ".slett", async () => {
            if (!confirm("Vil du slette svaret?")) return;
            await deleteDoc(doc(db, "innlegg", opentInnlegg.id, "svar", s.id));
            visSvar();
        });
        koplHaldInne(boks, s);
    });
}

// Send eit svar
finn("knapp-svar").onclick = async () => {
    const tekst = finn("svar-tekst").value.trim();
    if (tekst === "") return;

    await addDoc(collection(db, "innlegg", opentInnlegg.id, "svar"), {
        uid: minUid,
        tekst: tekst,
        reaksjonar: {},
        dato: Date.now()
    });
    finn("svar-tekst").value = "";
    visSvar();
};


// ---------- 11. EMOJI-REAKSJONAR PÅ SVAR (hald inne) ----------

// Tel kor mange som har gjeve kvar emoji, t.d. "❤️ 2  😂 1"
function reaksjonarHTML(s) {
    const tal = {};
    for (const emoji of Object.values(s.reaksjonar || {})) {
        tal[emoji] = (tal[emoji] || 0) + 1;
    }
    return Object.entries(tal)
        .map(([emoji, antal]) => `<span class="reaksjon">${vask(emoji)} ${antal}</span>`)
        .join("");
}

// Hald inne på eit svar i eit halvt sekund = vis emoji-menyen
function koplHaldInne(boks, s) {
    let tidtakar = null;
    boks.onpointerdown = (hending) => {
        if (hending.target.closest("button")) return;   // ikkje når du trykkjer på ein knapp
        tidtakar = setTimeout(() => visReaksjonsmeny(boks, s), 500);
    };
    boks.onpointerup = () => clearTimeout(tidtakar);
    boks.onpointerleave = () => clearTimeout(tidtakar);
    boks.oncontextmenu = (hending) => hending.preventDefault();   // ingen høgreklikk-meny
}

function visReaksjonsmeny(boks, s) {
    document.querySelectorAll(".reaksjonsmeny").forEach((m) => m.remove());

    const meny = document.createElement("div");
    meny.className = "reaksjonsmeny";
    for (const emoji of REAKSJONAR) {
        const knapp = document.createElement("button");
        knapp.textContent = emoji;
        knapp.onclick = () => reager(s, emoji);
        meny.append(knapp);
    }
    boks.append(meny);
}

// Trykk utanfor menyen = lukk han
document.addEventListener("pointerdown", (hending) => {
    if (!hending.target.closest(".reaksjonsmeny")) {
        document.querySelectorAll(".reaksjonsmeny").forEach((m) => m.remove());
    }
});

// Lagre reaksjonen. Same emoji ein gong til = fjern reaksjonen.
async function reager(s, emoji) {
    const ref = doc(db, "innlegg", opentInnlegg.id, "svar", s.id);
    const felt = "reaksjonar." + minUid;   // t.d. reaksjonar.abc123 = "❤️"

    if (s.reaksjonar && s.reaksjonar[minUid] === emoji) {
        await updateDoc(ref, { [felt]: deleteField() });
    } else {
        await updateDoc(ref, { [felt]: emoji });
    }
    visSvar();
}


// ---------- 12. TIL DEG ----------

async function visFeed() {
    visSide("side-feed");
    const alle = await hentOffentlege();
    const folgjer = minProfil.folgjer || [];

    // Dine eigne tekstar, tekstar frå folk du følgjer, og tekstar om noko du er interessert i
    const forDeg = alle.filter((i) =>
        i.uid === minUid ||
        folgjer.includes(i.uid) ||
        i.emne.some((e) => minProfil.interesser.includes(e)));

    if (forDeg.length > 0) {
        finn("feed-tekst").textContent = "Tekstar om ting du likar, frå folk du følgjer, og dine eigne.";
        visInnlegg("feed-liste", forDeg, "");
    } else if (alle.length > 0) {
        finn("feed-tekst").textContent = "Ingen har skrive om interessene dine enno. Her er dei nyaste tekstane.";
        visInnlegg("feed-liste", alle, "");
    } else {
        finn("feed-tekst").textContent = "";
        visInnlegg("feed-liste", [], "Ingen andre har skrive noko enno. Når nokon skriv om det du likar, dukkar det opp her.");
    }
}


// ---------- 13. ALLE TEKSTAR ----------

async function visAlle() {
    visSide("side-alle");
    visInnlegg("alle-liste", await hentOffentlege(), "Ingen har skrive noko enno.");
}


// ---------- 14. SØK (personar og tekstar) ----------

finn("knapp-sok").onclick = () => sok(finn("sok-felt").value);
finn("sok-felt").onkeydown = (hending) => {
    if (hending.key === "Enter") sok(finn("sok-felt").value);
};

async function sok(ord) {
    ord = ord.replace("#", "").trim().toLowerCase();
    finn("sok-felt").value = ord;
    visSide("side-sok");
    const alle = await hentOffentlege();   // hentar òg profilane

    // Populære emne: tel kor mange tekstar som har kvart emne, og vis dei 15 største
    const tal = {};
    alle.forEach((i) => i.emne.forEach((e) => tal[e] = (tal[e] || 0) + 1));
    const populaere = Object.entries(tal).sort((a, b) => b[1] - a[1]).slice(0, 15);

    finn("sok-emne").innerHTML = populaere.map(([emne, antal]) =>
        `<button class="emne" data-emne="${vask(emne)}">#${vask(emne)} <span class="antal">${antal}</span></button>`).join("");
    vedKlikk(finn("sok-emne"), ".emne", (knapp) => sok(knapp.dataset.emne));
    finn("sok-emne-boks").hidden = ord !== "" || populaere.length === 0;   // berre før du har søkt

    // Personar der brukarnamnet inneheld søkeordet
    const personar = Object.keys(profilar).filter((uid) =>
        uid !== minUid && profilar[uid].brukarnamn.toLowerCase().includes(ord));

    finn("sok-personar").innerHTML = personar.map((uid) => `
        <button class="person til-profil" data-uid="${vask(uid)}">
            <span class="avatar liten">${bileteHTML(profilar[uid])}</span>
            <span><b>${vask(profilar[uid].brukarnamn)}</b><small>${vask(profilar[uid].bio || "")}</small></span>
        </button>`).join("");
    finn("sok-personar-tittel").hidden = personar.length === 0;
    finn("sok-personar-tittel").textContent = ord === "" ? "Personar på DigiBook" : "Personar";
    vedKlikk(finn("sok-personar"), ".til-profil", (knapp) => visProfil(knapp.dataset.uid));

    // Tekstar: berre når det er skrive eit søkeord
    finn("sok-tekstar-tittel").hidden = ord === "";
    if (ord === "") {
        finn("sok-liste").innerHTML = "";
        return;
    }
    const treff = alle.filter((i) =>
        i.emne.includes(ord) ||
        (i.tittel || "").toLowerCase().includes(ord) ||
        i.tekst.toLowerCase().includes(ord));
    visInnlegg("sok-liste", treff, "Fann ingen tekstar.");
}


// ---------- 15. PROFIL (din eigen eller andre sin) ----------

let visarProfil = null;   // ID-en til profilen som er open no

async function visProfil(uid) {
    visarProfil = uid;
    const erMeg = uid === minUid;
    visSide("side-profil");
    finn("pynt-boks").hidden = true;
    if (!erMeg) finn("meny-profil").classList.remove("aktiv");

    // Mine: alle tekstane mine, òg private. Andre: berre deira offentlege.
    const tekstar = erMeg ? await hentMine() : (await hentOffentlege()).filter((i) => i.uid === uid);
    const profil = profilar[uid];

    finn("profil-kort").className = "kort profil-kort farge-" + profil.farge;
    finn("profil-bilete").innerHTML = bileteHTML(profil);
    finn("profil-namn").textContent = profil.brukarnamn;
    finn("profil-bio").textContent = profil.bio || (erMeg ? "Du har ikkje skrive noko om deg sjølv enno." : "");
    finn("profil-interesser").textContent = profil.interesser.map((e) => "#" + e).join("   ");

    // Tel følgjarar: alle profilar som har denne personen i "folgjer"-lista si
    const folgjarar = Object.values(profilar).filter((p) => (p.folgjer || []).includes(uid)).length;
    const ordet = folgjarar === 1 ? "følgjar" : "følgjarar";
    finn("profil-tal").textContent = `${folgjarar} ${ordet} · følgjer ${(profil.folgjer || []).length}`;

    // Eigen profil: rediger-knappar. Andre: følg-knapp.
    finn("profil-knappar").hidden = !erMeg;
    finn("knapp-folg").hidden = erMeg;
    const folgjerAllereie = (minProfil.folgjer || []).includes(uid);
    finn("knapp-folg").textContent = folgjerAllereie ? "Følgjer ✓" : "Følg";
    finn("knapp-folg").className = folgjerAllereie ? "kvit" : "";

    finn("profil-tekstar-tittel").textContent = erMeg ? "Mine tekstar" : "Tekstar av " + profil.brukarnamn;
    visInnlegg("profil-liste", tekstar, erMeg ? "Du har ikkje skrive noko enno." : "Ingen tekstar enno.");
}

// Følg eller slutt å følgje
finn("knapp-folg").onclick = async () => {
    const ref = doc(db, "brukarar", minUid);
    if ((minProfil.folgjer || []).includes(visarProfil)) {
        await updateDoc(ref, { folgjer: arrayRemove(visarProfil) });
    } else {
        await updateDoc(ref, { folgjer: arrayUnion(visarProfil) });
    }
    visProfil(visarProfil);
};


// ---------- 16. SKRIV NY TEKST (eller rediger) ----------

let valdeEmne = [];     // emna brukaren har valt
let valtHumor = "";     // humøret brukaren har valt
let redigerer = null;   // teksten som vert redigert (null = ny tekst)

finn("knapp-avbryt-nytt").onclick = () => visProfil(minUid);

function opneSkriv(innlegg) {
    redigerer = innlegg;
    if (innlegg) {
        // Rediger: fyll inn det som står der frå før
        finn("nytt-tittel").value = innlegg.tittel || "";
        finn("nytt-tekst").innerHTML = innlegg.html ? rensHTML(innlegg.html) : vask(innlegg.tekst);
        finn("nytt-privat").checked = innlegg.privat;
        valdeEmne = [...innlegg.emne];
        valtHumor = innlegg.humor || "";
        finn("knapp-publiser").textContent = "Lagre endringar";
    } else {
        // Ny tekst: tomt ark
        finn("nytt-tittel").value = "";
        finn("nytt-tekst").innerHTML = "";
        finn("nytt-privat").checked = false;
        valdeEmne = [];
        valtHumor = "";
        finn("knapp-publiser").textContent = "Publiser";
    }
    finn("privat-info").hidden = !finn("nytt-privat").checked;
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

finn("knapp-legg-til-emne").onclick = () => {
    leggTilEige("eige-emne", valdeEmne);
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

// B / I / U / Liste: nettlesaren gjer den merka teksten feit, kursiv osv.
document.querySelectorAll(".format").forEach((knapp) => {
    knapp.onmousedown = (hending) => {
        hending.preventDefault();   // så teksten du har merka ikkje vert "umerka"
        document.execCommand(knapp.dataset.kommando);
        oppdaterVerktoy();
    };
});

// Knappane lyser når skrifta der du skriv er feit, kursiv osv.
function oppdaterVerktoy() {
    document.querySelectorAll(".format").forEach((knapp) => {
        knapp.classList.toggle("aktiv", document.queryCommandState(knapp.dataset.kommando));
    });
}
document.addEventListener("selectionchange", oppdaterVerktoy);

// Når du limer inn tekst, tek me berre med sjølve teksten (ikkje farge, storleik osv.)
finn("nytt-tekst").onpaste = (hending) => {
    hending.preventDefault();
    document.execCommand("insertText", false, hending.clipboardData.getData("text/plain"));
};

// Teljar ord, som i Word
function oppdaterOrdteljar() {
    const ord = finn("nytt-tekst").innerText.trim().split(/\s+/).filter((o) => o !== "");
    finn("ordteljar").textContent = ord.length + " ord";
}
finn("nytt-tekst").oninput = oppdaterOrdteljar;

finn("nytt-privat").onchange = () => {
    finn("privat-info").hidden = !finn("nytt-privat").checked;
};

finn("knapp-publiser").onclick = async () => {
    const tekst = finn("nytt-tekst").innerText.trim();   // rein tekst (til søk og rapportar)
    if (tekst === "") {
        visMelding("Du må skrive noko før du kan publisere.");
        return;
    }
    const html = rensHTML(finn("nytt-tekst").innerHTML);   // tekst med feit, kursiv osv.

    // Finn #emne skrivne i teksten, og slå dei saman med dei valde (Set fjernar duplikat)
    const fraTeksten = (tekst.match(/#[a-zæøå0-9_]+/gi) || []).map((e) => e.slice(1).toLowerCase());
    const emne = [...new Set([...valdeEmne, ...fraTeksten])];

    const data = {
        tittel: finn("nytt-tittel").value.trim(),
        html: html,
        tekst: tekst,
        emne: emne,
        humor: valtHumor,
        privat: finn("nytt-privat").checked
    };

    if (redigerer) {
        // Rediger ein tekst som finst frå før
        await updateDoc(doc(db, "innlegg", redigerer.id), { ...data, redigert: true });
    } else {
        // Ny tekst
        await addDoc(collection(db, "innlegg"), {
            uid: minUid,
            forfattarUid: minUid,
            ...data,
            delt: false,
            hjarte: [],
            dato: Date.now()
        });
    }
    visProfil(minUid);
};


// ---------- 17. REDIGER PROFIL ----------

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

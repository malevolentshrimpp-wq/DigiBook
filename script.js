// =====================================================
// DigiBook – script.js
// Denne fila gjer at nettsida fungerer, og snakkar med Firebase.
// =====================================================


// ---------- 1. KOPLE TIL FIREBASE ----------

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged,
    sendEmailVerification, sendPasswordResetEmail }
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
auth.languageCode = "no";      // e-postane frå Firebase (stadfesting, nytt passord) kjem på norsk
const db = getFirestore(app);  // databasen


// ---------- 2. VARIABLAR OG LISTER ----------

let minUid = null;          // ID-en til den som er logga inn
let minProfil = null;       // profilen til den som er logga inn
let nyttBrukarnamn = null;  // brukarnamnet når nokon lagar ny konto
let profilar = {};          // alle profilane, så me kan vise namn og bilete
let mineDelte = {};         // tekstar eg har delt: { tekst-ID: delings-ID }

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
const SKRIVEFORSLAG = [
    "Kva gjorde deg glad i dag?",
    "Noko du gruar deg til",
    "Tre ting du er takknemleg for",
    "Kva ville du sagt til deg sjølv for eitt år sidan?",
    "Ein ting som irriterte deg i dag",
    "Kva drøymer du om?",
    "Den beste dagen du hugsar",
    "Noko du aldri har fortalt nokon",
    "Kva treng du akkurat no?",
    "Ein person som betyr mykje for deg"
];


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

// Viser ei melding øvst på sida. ok = true gir ei god melding (ikkje raud).
function visMelding(tekst, ok = false) {
    finn("melding").textContent = tekst;
    finn("melding").classList.toggle("ok", ok);
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

// Eit lite kort med bilete, namn og bio for ein person (brukt i søk og følgjar-lista)
function personHTML(uid) {
    const profil = profilar[uid];
    return `
        <button class="person til-profil" data-uid="${vask(uid)}">
            <span class="avatar liten">${bileteHTML(profil)}</span>
            <span><b>${vask(profil.brukarnamn)}</b><small>${vask(profil.bio || "")}</small></span>
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

// Byte mellom "Logg inn" og "Lag ny konto"
finn("til-registrer").onclick = () => visSide("side-registrer");
finn("til-logginn").onclick = () => visSide("side-logginn");

// Skjema: "onsubmit" køyrer både når du trykkjer på knappen og når du trykkjer Enter.
// preventDefault() stoppar nettlesaren frå å laste sida på nytt.
finn("logginn-skjema").onsubmit = async (hending) => {
    hending.preventDefault();
    nyttBrukarnamn = null;
    try {
        await signInWithEmailAndPassword(auth, finn("logginn-epost").value, finn("logginn-passord").value);
    } catch (feil) {
        // Vis ei melding som fortel KVA som gjekk gale
        if (feil.code === "auth/invalid-credential") visMelding("Feil e-post eller passord.");
        else if (feil.code === "auth/too-many-requests") visMelding("For mange forsøk. Vent litt, eller trykk «Gløymt passord?».");
        else if (feil.code === "auth/network-request-failed") visMelding("Fekk ikkje kontakt med internett. Sjekk nettet og prøv igjen.");
        else visMelding("Klarte ikkje å logge inn (" + feil.code + ").");
    }
};

finn("registrer-skjema").onsubmit = async (hending) => {
    hending.preventDefault();
    const brukarnamn = finn("reg-brukarnamn").value.trim();
    const epost = finn("reg-epost").value;
    const passord = finn("reg-passord").value;
    if (brukarnamn.length < 3) {
        visMelding("Skriv eit brukarnamn på minst 3 bokstavar.");
        return;
    }
    try {
        nyttBrukarnamn = brukarnamn;
        await createUserWithEmailAndPassword(auth, epost, passord);
    } catch (feil) {
        if (feil.code === "auth/email-already-in-use") {
            // Kontoen finst frå før (t.d. om noko gjekk gale sist). Prøv å logge inn i staden.
            try {
                await signInWithEmailAndPassword(auth, epost, passord);
            } catch {
                nyttBrukarnamn = null;
                visMelding("Denne e-posten har allereie ein konto. Gå til «Logg inn».");
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
onAuthStateChanged(auth, (brukar) => {
    if (brukar) {
        startApp(brukar);
    } else {
        minUid = null;
        finn("meny").hidden = true;
        visSide("side-logginn");
    }
});

// Startar appen for ein brukar som har logga inn
async function startApp(brukar) {
    // Hent nyaste info frå Firebase (er e-posten stadfesta?) og ein ny "billett" (token).
    // Billetten er det sikkerheitsreglane sjekkar, så han må vere oppdatert.
    await brukar.reload();
    await brukar.getIdToken(true);

    minUid = brukar.uid;
    mineDelte = {};
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
        // Ny brukar: send e-post med stadfestingslenke. Går det ikkje, kan han sendast på nytt seinare.
        try {
            await sendEmailVerification(brukar);
        } catch {}
    }

    // PERSONVERN: e-posten ligg i ei PRIVAT mappe under brukaren (brukarar/ID/privat/info).
    // Berre du sjølv og admin kan sjå han, ikkje andre brukarar.
    await setDoc(doc(db, "brukarar", minUid, "privat", "info"), { epost: brukar.email });

    // SIKKERHEIT: du må stadfeste e-posten før du kan bruke DigiBook.
    // Då kan ingen lage tusen falske brukarar med e-postar som ikkje finst.
    if (!brukar.emailVerified) {
        finn("meny").hidden = true;
        finn("verifiser-epost").textContent = brukar.email;
        visSide("side-verifiser");
        return;
    }

    finn("meny").hidden = false;
    if (minProfil.interesser.length === 0) {
        visInteresser();   // ny brukar: spør om interesser først
    } else {
        visFeed();
    }
}

// "Eg har stadfesta e-posten": prøv å starte appen på nytt
finn("knapp-har-stadfesta").onclick = async () => {
    await startApp(auth.currentUser);
    if (!auth.currentUser.emailVerified) {
        visMelding("E-posten er ikkje stadfesta enno. Trykk på lenka i e-posten først.");
    }
};

finn("knapp-send-pa-nytt").onclick = async () => {
    try {
        await sendEmailVerification(auth.currentUser);
        visMelding("Ny e-post er sendt! Sjekk innboksen og søppelposten.", true);
    } catch {
        visMelding("Vent litt før du prøver igjen.");
    }
};

finn("knapp-verifiser-loggut").onclick = () => signOut(auth);

// Medan stadfestingssida er open: sjekk kvart 5. sekund om e-posten er stadfesta.
// Då kjem du inn av deg sjølv når du har trykt på lenka i e-posten.
setInterval(async () => {
    if (finn("side-verifiser").hidden || !auth.currentUser) return;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) startApp(auth.currentUser);
}, 5000);

// GLØYMT PASSORD: Firebase sender ei lenke der du kan lage nytt passord
finn("knapp-glomt").onclick = async () => {
    const epost = finn("logginn-epost").value.trim();
    if (epost === "") {
        visMelding("Skriv e-posten din i feltet over, og trykk «Gløymt passord?» igjen.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, epost);
        visMelding("Viss det finst ein konto med denne e-posten, har me sendt ei lenke for å lage nytt passord.", true);
    } catch {
        visMelding("Sjekk at e-posten er rett skriven.");
    }
};


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

    // Hugs kva tekstar eg har delt (så knappen viser "Delt ✓")
    liste.forEach((i) => {
        if (i.delt && i.uid === minUid) mineDelte[i.originalId] = i.id;
    });
    return liste;
}

// Alle offentlege tekstar (ikkje private)
function hentOffentlege() {
    return hentTekstar(query(collection(db, "innlegg"), where("privat", "==", false)));
}

// Offentlege tekstar utan delingar (delingar synest berre inne på profilen)
async function hentOriginale() {
    const alle = await hentOffentlege();
    return alle.filter((i) => !i.delt);
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
    const tekst = rensHTML(innlegg.html);
    const emne = innlegg.emne.map((e) => `<button class="emne lite">#${vask(e)}</button>`).join("");

    // Små merke: privat og redigert
    let merke = "";
    if (innlegg.privat) merke += `<span class="merke">🔒 Privat</span>`;
    if (innlegg.redigert) merke += `<span class="grå liten-tekst">Redigert</span>`;

    // Knappar nedst til venstre: hjarte, svar og del
    let venstre = `
        <button class="hjarte ${hjarte.includes(minUid) ? "vald" : ""}">♥ ${hjarte.length}</button>
        <button class="lenke svar-knapp">Svar</button>`;
    if (!erMin) {
        const harDelt = mineDelte[innlegg.id];
        venstre += `<button class="lenke del-knapp ${harDelt ? "vald" : ""}" title="Del teksten på profilen din">${harDelt ? "↻ Delt ✓" : "↻ Del"}</button>`;
    }

    // Knappar nedst til høgre: rediger/slett (mine) eller rapporter (andre sine)
    let hogre = `<button class="lenke rapporter">Rapporter</button>`;
    if (erMin) hogre = `<button class="lenke rediger">Rediger</button> <button class="lenke slett">Slett</button>`;

    return `
        <article class="innlegg ${innlegg.privat ? "privat" : ""}" data-id="${vask(innlegg.id)}">
            <div class="innlegg-topp">
                ${forfattarHTML(innlegg.uid, innlegg.dato)}
                <span class="humor">${vask(innlegg.humor || "")}</span>
            </div>
            <div class="innhald">
                ${tittel}
                <div class="tekst">${tekst}</div>
                <span class="les-meir">Les meir →</span>
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
    merkLangeTekstar(boks);
}

// Lange tekstar vert kutta i rutenettet. Dei får "Les meir →" nedst.
function merkLangeTekstar(boks) {
    boks.querySelectorAll(".tekst").forEach((tekst) => {
        tekst.classList.toggle("kutta", tekst.scrollHeight > tekst.clientHeight);
    });
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
    // Oppdater alle hjarte-knappane for denne teksten (han kan synast fleire stader)
    document.querySelectorAll(`.innlegg[data-id="${innlegg.id}"] .hjarte`).forEach((k) => {
        k.textContent = "♥ " + innlegg.hjarte.length;
        k.classList.toggle("vald", innlegg.hjarte.includes(minUid));
    });
}

// Del (republiser) ein annan sin tekst på profilen din, eller angre delinga.
// Ei deling er berre ein "peikar" til originalteksten (originalId), ikkje ein kopi.
async function delInnlegg(innlegg, knapp) {
    knapp.disabled = true;

    if (mineDelte[innlegg.id]) {
        // Allereie delt: fjern delinga
        await deleteDoc(doc(db, "innlegg", mineDelte[innlegg.id]));
        delete mineDelte[innlegg.id];
        knapp.textContent = "↻ Del";
    } else {
        // Del teksten
        const deling = await addDoc(collection(db, "innlegg"), {
            uid: minUid,
            originalId: innlegg.id,
            delt: true,
            privat: false,
            dato: Date.now()
        });
        mineDelte[innlegg.id] = deling.id;
        knapp.textContent = "↻ Delt ✓";
    }
    knapp.classList.toggle("vald", Boolean(mineDelte[innlegg.id]));
    knapp.disabled = false;
}

// Slett ein av dine eigne tekstar
async function slettInnlegg(innlegg, kort) {
    if (!confirm("Vil du slette denne teksten?")) return;

    // Slett svara under teksten først, så dei ikkje vert liggjande att i databasen
    const svar = await getDocs(collection(db, "innlegg", innlegg.id, "svar"));
    for (const s of svar.docs) {
        await deleteDoc(s.ref);
    }
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
        forfattarUid: rapportInnlegg.uid,
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
                ${s.uid === minUid || opentInnlegg.uid === minUid ? `<button class="lenke slett">Slett</button>` : ""}
            </div>
            <p>${vask(s.tekst)}</p>
            <div class="svar-reaksjonar">
                ${reaksjonarHTML(s)}
                <button class="lenke reager-knapp">☺ Reager</button>
            </div>
        </div>`).join("");

    finn("svar-liste").querySelectorAll(".svar").forEach((boks, nr) => {
        const s = liste[nr];
        vedKlikk(boks, ".til-profil", (knapp) => visProfil(knapp.dataset.uid));
        // Du kan slette dine eigne svar, og alle svar under dine eigne tekstar
        vedKlikk(boks, ".slett", async () => {
            if (!confirm("Vil du slette svaret?")) return;
            await deleteDoc(doc(db, "innlegg", opentInnlegg.id, "svar", s.id));
            visSvar();
        });
        vedKlikk(boks, ".reager-knapp", () => visReaksjonsmeny(boks, s));
        vedKlikk(boks, ".reaksjon", (knapp) => reager(s, knapp.dataset.emoji));   // trykk på ein emoji = same reaksjon
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
    const reaksjonar = s.reaksjonar || {};
    const tal = {};
    for (const emoji of Object.values(reaksjonar)) {
        tal[emoji] = (tal[emoji] || 0) + 1;
    }
    return Object.entries(tal).map(([emoji, antal]) => {
        const min = reaksjonar[minUid] === emoji ? "vald" : "";   // er det min reaksjon?
        return `<button class="reaksjon ${min}" data-emoji="${vask(emoji)}">${vask(emoji)} ${antal}</button>`;
    }).join("");
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

// Helsing etter kva tid det er på døgnet, t.d. "God kveld, Matilda 🌙"
function helsing(namn) {
    const time = new Date().getHours();
    if (time < 5) return `God natt, ${namn} 🌙`;
    if (time < 10) return `God morgon, ${namn} ☀️`;
    if (time < 18) return `Hei, ${namn} 👋`;
    return `God kveld, ${namn} 🌙`;
}

async function visFeed() {
    visSide("side-feed");
    finn("feed-tittel").textContent = helsing(minProfil.brukarnamn);
    const alle = await hentOriginale();
    const folgjer = minProfil.folgjer || [];

    // Dine eigne tekstar, tekstar frå folk du følgjer, og tekstar om noko du er interessert i
    const forDeg = alle.filter((i) =>
        i.uid === minUid ||
        folgjer.includes(i.uid) ||
        i.emne.some((e) => minProfil.interesser.includes(e)));

    if (forDeg.length > 0) {
        finn("feed-tekst").textContent = "Tekstar om ting du likar, frå folk du følger, og dine eigne.";
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
    visInnlegg("alle-liste", await hentOriginale(), "Ingen har skrive noko enno.");
}


// ---------- 14. SØK (personar og tekstar) ----------

finn("sok-skjema").onsubmit = (hending) => {
    hending.preventDefault();
    sok(finn("sok-felt").value);
};

async function sok(ord) {
    ord = ord.replace("#", "").trim().toLowerCase();
    finn("sok-felt").value = ord;
    visSide("side-sok");
    const alle = await hentOriginale();   // hentar òg profilane

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

    finn("sok-personar").innerHTML = personar.map(personHTML).join("");
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
    const offentlege = await hentOffentlege();
    const tekstar = erMeg ? await hentMine() : offentlege.filter((i) => i.uid === uid);
    const eigne = tekstar.filter((i) => !i.delt);   // tekstar personen har skrive

    // Delingar er berre peikarar. Finn originalteksten til kvar deling.
    const delte = tekstar
        .filter((i) => i.delt)
        .map((deling) => offentlege.find((i) => i.id === deling.originalId))
        .filter((original) => original);   // hopp over viss originalen er sletta
    const profil = profilar[uid];
    if (!profil) {
        visMelding("Fann ikkje denne brukaren. Kanskje kontoen er sletta?");
        return;
    }

    finn("profil-kort").className = "kort profil-kort farge-" + profil.farge;
    finn("profil-bilete").innerHTML = bileteHTML(profil);
    finn("profil-namn").textContent = profil.brukarnamn;
    finn("profil-bio").textContent = profil.bio || (erMeg ? "Du har ikkje skrive noko om deg sjølv enno." : "");
    finn("profil-interesser").textContent = profil.interesser.map((e) => "#" + e).join("   ");

    // Følgjarar: alle profilar som har denne personen i "folgjer"-lista si
    // (id !== uid: ingen kan telje som følgjar av seg sjølv)
    const folgjarar = Object.keys(profilar).filter((id) => id !== uid && (profilar[id].folgjer || []).includes(uid));
    // Følgjer: personane i "folgjer"-lista til denne personen (som framleis finst)
    const folgjer = (profil.folgjer || []).filter((id) => id !== uid && profilar[id]);

    const ordet = folgjarar.length === 1 ? "følger" : "følgere";
    finn("knapp-folgjarar").textContent = `${folgjarar.length} ${ordet}`;
    finn("knapp-folgjer").textContent = `følger ${folgjer.length}`;
    finn("knapp-folgjarar").onclick = () => visFolgListe("Følgere", folgjarar);
    finn("knapp-folgjer").onclick = () => visFolgListe(profil.brukarnamn + " følger", folgjer);

    // Eigen profil: rediger-knappar. Andre: følg-knapp.
    finn("profil-knappar").hidden = !erMeg;
    finn("knapp-folg").hidden = erMeg;
    const folgjerAllereie = (minProfil.folgjer || []).includes(uid);
    finn("knapp-folg").textContent = folgjerAllereie ? "Følger ✓" : "Følg";
    finn("knapp-folg").className = folgjerAllereie ? "kvit" : "";

    // To faner: "Tekstar" og "Delt"
    finn("fane-tekstar").textContent = `Tekstar (${eigne.length})`;
    finn("fane-delt").textContent = `Delt (${delte.length})`;
    visInnlegg("profil-liste", eigne, erMeg ? "Du har ikkje skrive noko enno." : "Ingen tekstar enno.");
    visInnlegg("profil-delt-liste", delte,
        erMeg ? "Du har ikkje delt noko enno. Trykk «↻ Del» på ein tekst du likar." : "Ingen delte tekstar enno.");
    visFane("tekstar");
}

// Byt mellom fanene "Tekstar" og "Delt" på profilen
function visFane(fane) {
    finn("profil-liste").hidden = fane !== "tekstar";
    finn("profil-delt-liste").hidden = fane !== "delt";
    finn("fane-tekstar").classList.toggle("aktiv", fane === "tekstar");
    finn("fane-delt").classList.toggle("aktiv", fane === "delt");
    merkLangeTekstar(finn(fane === "delt" ? "profil-delt-liste" : "profil-liste"));
}
finn("fane-tekstar").onclick = () => visFane("tekstar");
finn("fane-delt").onclick = () => visFane("delt");

// Viser eit vindauge med ei liste over personar (følgjarar eller dei personen følgjer)
function visFolgListe(tittel, personar) {
    finn("folg-tittel").textContent = tittel;
    if (personar.length === 0) {
        finn("folg-liste").innerHTML = `<p class="grå">Ingen her enno.</p>`;
    } else {
        finn("folg-liste").innerHTML = personar.map(personHTML).join("");
    }
    // Trykk på ein person = lukk vindauget og gå til profilen
    vedKlikk(finn("folg-liste"), ".til-profil", (knapp) => {
        finn("folg-dialog").close();
        visProfil(knapp.dataset.uid);
    });
    finn("folg-dialog").showModal();
}
finn("folg-lukk").onclick = () => finn("folg-dialog").close();

// Følg eller slutt å følgje
finn("knapp-folg").onclick = async () => {
    if (visarProfil === minUid) return;   // du kan ikkje følgje deg sjølv
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
        finn("nytt-tekst").innerHTML = rensHTML(innlegg.html);
        finn("nytt-privat").checked = innlegg.privat;
        valdeEmne = [...innlegg.emne];
        valtHumor = innlegg.humor || "";
        finn("knapp-publiser").textContent = "Lagre endringar";
        finn("utkast-info").hidden = true;
    } else {
        // Ny tekst: hent fram utkastet viss du har eit, elles tomt ark
        const utkast = hentUtkast();
        finn("nytt-tittel").value = utkast ? utkast.tittel : "";
        finn("nytt-tekst").innerHTML = utkast ? rensHTML(utkast.html) : "";
        finn("utkast-info").hidden = !utkast;
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
    };
});

// Teljar ord, som i Word
function oppdaterOrdteljar() {
    const ord = finn("nytt-tekst").innerText.trim().split(/\s+/).filter((o) => o !== "");
    finn("ordteljar").textContent = ord.length + " ord";
}
finn("nytt-tekst").oninput = () => {
    oppdaterOrdteljar();
    lagreUtkast();
};
finn("nytt-tittel").oninput = lagreUtkast;

// UTKAST: teksten du skriv vert lagra i nettlesaren medan du skriv.
// Lukkar du sida ved eit uhell, får du han att neste gong.
// PERSONVERN: utkastet ligg berre på denne maskina, og er knytt til kontoen din.
function utkastNokkel() {
    return "digibook-utkast-" + minUid;
}

function lagreUtkast() {
    if (redigerer) return;   // berre for nye tekstar
    const tittel = finn("nytt-tittel").value;
    const tomt = tittel === "" && finn("nytt-tekst").innerText.trim() === "";
    if (tomt) {
        localStorage.removeItem(utkastNokkel());
    } else {
        localStorage.setItem(utkastNokkel(), JSON.stringify({ tittel: tittel, html: finn("nytt-tekst").innerHTML }));
    }
}

// Gir utkastet, eller null viss det ikkje finst noko
function hentUtkast() {
    return JSON.parse(localStorage.getItem(utkastNokkel()));
}

function slettUtkast() {
    localStorage.removeItem(utkastNokkel());
}

finn("knapp-tom-utkast").onclick = () => {
    slettUtkast();
    opneSkriv(null);
};

// "Treng du inspirasjon?": vel eit tilfeldig skriveforslag som tittel
finn("knapp-inspirasjon").onclick = () => {
    const nr = Math.floor(Math.random() * SKRIVEFORSLAG.length);
    finn("nytt-tittel").value = SKRIVEFORSLAG[nr];
    lagreUtkast();
    finn("nytt-tekst").focus();
};

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
            ...data,
            delt: false,
            hjarte: [],
            dato: Date.now()
        });
        slettUtkast();   // teksten er publisert, så utkastet trengst ikkje lenger
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


// ---------- 18. KVELDSMODUS (mørkt tema) ----------

// Slår kveldsmodus av eller på, og hugsar valet i nettlesaren (localStorage)
function settKveldsmodus(pa) {
    document.body.classList.toggle("kveld", pa);
    finn("knapp-kveld").textContent = pa ? "☀️" : "🌙";
    localStorage.setItem("digibook-kveld", pa ? "ja" : "nei");
}

finn("knapp-kveld").onclick = () => settKveldsmodus(!document.body.classList.contains("kveld"));

// Når sida lastar: bruk det du valde sist
settKveldsmodus(localStorage.getItem("digibook-kveld") === "ja");


// ---------- 19. OM DIGIBOOK ----------

// Trykk på "DigiBook" (eller "Om DigiBook") = vis sida om prosjektet
let sideForOm = "side-logginn";   // sida me kom frå

document.querySelectorAll(".til-om").forEach((knapp) => {
    knapp.onclick = () => {
        sideForOm = document.querySelector(".side:not([hidden])").id;
        visSide("side-om");
    };
});

finn("knapp-om-tilbake").onclick = () => visSide(sideForOm);

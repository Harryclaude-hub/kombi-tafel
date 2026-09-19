// ============================================================
// BILDLAGER: die Wettschein-Bilder liegen NICHT mehr im localStorage.
//
// WARUM ES DAS GIBT (14.09.2026):
// Der localStorage eines Browsers fasst rund 5 MB - fuer ALLES, was
// diese Seite dort ablegt. Darin liegt auch die Anmeldung von Supabase
// (der Schluessel sb-...-auth-token). Sind die Scheinbilder voll,
// scheitert JEDES weitere Schreiben - auch das der Anmeldung. Genau das
// ist Karam passiert: erst kamen keine Bilder mehr rein, dann liess sich
// die Kombi-Tafel nicht mehr einloggen, und ohne Anmeldung stand unter
// keiner Kombination mehr ein Bild.
//
// IndexedDB im selben Browser hat dieses enge Limit nicht (hunderte MB).
// Die Bilder ziehen dorthin um, der localStorage bleibt frei fuer die
// Anmeldung. Der Umzug laeuft beim Start JEDER Seite automatisch und
// braucht kein Konto - er muss ja auch dann helfen, wenn das Einloggen
// gerade nicht geht.
//
// Die Datenbank bleibt die Wahrheit: eine gespeicherte Kombination hat
// ihr Bild zusaetzlich in kt_scheine.foto. Das Bildlager ist die
// schnelle, oertliche Form - und die Rettung fuer alles, was noch nicht
// gespeichert ist.
// ============================================================
"use strict";

const BILDLAGER_DB = "kt_bilder";
const BILDLAGER_LAGER = "bilder";
const BILDLAGER_VORSATZ = "foto_";

function bildLagerDb() {
  return new Promise((fertig, schief) => {
    const a = indexedDB.open(BILDLAGER_DB, 1);
    a.onupgradeneeded = () => {
      if (!a.result.objectStoreNames.contains(BILDLAGER_LAGER)) {
        a.result.createObjectStore(BILDLAGER_LAGER);
      }
    };
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => schief(a.error);
  });
}

function bildLagerTun(art, arbeit) {
  return bildLagerDb().then(db => new Promise((fertig, schief) => {
    const t = db.transaction(BILDLAGER_LAGER, art);
    const lager = t.objectStore(BILDLAGER_LAGER);
    const a = arbeit(lager);
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => schief(a.error);
  }));
}

// Ein Bild ablegen. satz = { foto, name, zeit }.
async function bildLagerSetzen(scheinId, satz) {
  if (!scheinId || !satz || !satz.foto) return false;
  await bildLagerTun("readwrite", l => l.put({
    foto: satz.foto,
    name: satz.name || "Wettschein",
    zeit: satz.zeit || new Date().toISOString()
  }, String(scheinId)));
  return true;
}

async function bildLagerHolen(scheinId) {
  if (!scheinId) return null;
  try { return (await bildLagerTun("readonly", l => l.get(String(scheinId)))) || null; }
  catch (e) { return null; }
}

async function bildLagerWeg(scheinId) {
  try { await bildLagerTun("readwrite", l => l.delete(String(scheinId))); return true; }
  catch (e) { return false; }
}

// Alle Bilder mit ihrer Kennung - fuer die Uebersicht "Meine Bilder".
async function bildLagerListe() {
  try {
    const kennungen = await bildLagerTun("readonly", l => l.getAllKeys());
    const saetze = await bildLagerTun("readonly", l => l.getAll());
    const raus = [];
    for (let i = 0; i < kennungen.length; i++) {
      const s = saetze[i] || {};
      raus.push({ scheinId: String(kennungen[i]), foto: s.foto || null,
                  name: s.name || "Wettschein", zeit: s.zeit || null });
    }
    // Das Neueste zuerst.
    raus.sort((a, b) => String(b.zeit || "").localeCompare(String(a.zeit || "")));
    return raus;
  } catch (e) { return []; }
}

// Wieviel Platz belegen die Bilder im Lager?
async function bildLagerGroesse() {
  const liste = await bildLagerListe();
  let zeichen = 0;
  for (const b of liste) zeichen += (b.foto || "").length;
  return { anzahl: liste.length, mb: zeichen / 1024 / 1024 };
}

// ---------- DER UMZUG ----------
// Holt jedes Bild aus dem localStorage ins Lager und raeumt den
// localStorage frei. Erst wenn ein Bild sicher im Lager liegt, wird es
// drueben geloescht - lieber zweimal vorhanden als einmal verloren.
async function bildLagerUmzug() {
  let umgezogen = 0, frei = 0, gescheitert = 0;
  let kennungen = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(BILDLAGER_VORSATZ) !== 0) continue;
      if (k.indexOf("foto_analyse_") === 0 || /_zeit$|_name$/.test(k)) continue;
      kennungen.push(k.slice(BILDLAGER_VORSATZ.length));
    }
  } catch (e) { return { umgezogen: 0, frei: 0, gescheitert: 0, fehler: String(e) }; }

  for (const id of kennungen) {
    let foto = null;
    try { foto = localStorage.getItem(BILDLAGER_VORSATZ + id); } catch (e) { foto = null; }
    if (!foto) continue;
    const name = localStorage.getItem(BILDLAGER_VORSATZ + id + "_name") || "Wettschein";
    const zeit = localStorage.getItem(BILDLAGER_VORSATZ + id + "_zeit") || null;
    try {
      // Steht es schon im Lager, nicht ueberschreiben - das Lager ist
      // ab jetzt die neuere Ablage.
      const da = await bildLagerHolen(id);
      if (!da || !da.foto) await bildLagerSetzen(id, { foto: foto, name: name, zeit: zeit });
      const nachher = await bildLagerHolen(id);
      if (!nachher || !nachher.foto) { gescheitert++; continue; }
      frei += foto.length;
      localStorage.removeItem(BILDLAGER_VORSATZ + id);
      localStorage.removeItem(BILDLAGER_VORSATZ + id + "_zeit");
      localStorage.removeItem(BILDLAGER_VORSATZ + id + "_name");
      localStorage.removeItem("foto_analyse_" + id);
      umgezogen++;
    } catch (e) { gescheitert++; }
  }
  return { umgezogen: umgezogen, frei: frei / 1024 / 1024, gescheitert: gescheitert };
}

// Wieviel liegt ueberhaupt noch im localStorage? Fuer die Anzeige, damit
// "ich kann mich nicht einloggen" nicht wieder geraten werden muss.
function localStorageBelegung() {
  let zeichen = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      zeichen += (k || "").length + ((localStorage.getItem(k) || "").length);
    }
  } catch (e) { return null; }
  return zeichen / 1024 / 1024;
}

// Beim Start jeder Seite: umziehen, sobald der Browser Luft hat. Ohne
// Konto, ohne Netz, ohne Klick - der Umzug muss auch dann laufen, wenn
// das Einloggen gerade scheitert, denn genau das repariert er.
(function bildLagerStart() {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const los = () => {
    bildLagerUmzug().then(r => {
      if (r && r.umgezogen) {
        // Nur in die Konsole: beim Start soll nichts dazwischenfunken.
        console.log("Bildlager: " + r.umgezogen + " Bilder umgezogen, " +
          r.frei.toFixed(1) + " MB im Browserspeicher frei geworden." +
          (r.gescheitert ? " " + r.gescheitert + " blieben liegen." : ""));
      }
    }).catch(() => { /* ohne Umzug laeuft die Seite weiter */ });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los);
  else los();
})();

// ---------- Foto-Merker fuer GESPEICHERTE Scheine (19.09.2026) ----------
// Karam: "Oefter, wenn ich die Seite neu lade oder das Programm neu
// oeffne, brauche ich ein paar Minuten, bis alle Fotos wieder angezeigt
// werden. Ich will, dass es wirklich schneller und fluessiger laeuft."
// Das Bildlager oben haelt UNVERSCHLUESSELTE Bilder von Karten, die noch
// nicht gespeichert sind. Der Foto-Merker hier ist etwas anderes: er
// merkt sich je Schein-Kennung den VERSCHLUESSELTEN foto-Text aus
// kt_scheine - exakt den Geheimtext, der auch auf dem Server liegt.
// Beim naechsten Laden faellt nur noch das Entschluesseln an
// (Millisekunden) statt einer Netz-Abfrage je Bild. Sicherheit
// unveraendert: auf der Platte liegt nichts Lesbares.
// Faellt IndexedDB aus, liefert alles hier null und die App laeuft wie
// vorher uebers Netz - der Merker ist NUR eine Abkuerzung.
// Aufgeraeumt wird er dort, wo Fotos geschrieben oder geloescht werden
// (supa.js), und "Frisch laden" am Logo leert ihn ganz.
const FOTOMERK_DB = "kt_fotomerk";

function fotoMerkTun(art, arbeit) {
  return new Promise((fertig) => {
    try {
      const a = indexedDB.open(FOTOMERK_DB, 1);
      a.onupgradeneeded = () => {
        if (!a.result.objectStoreNames.contains("fotos")) a.result.createObjectStore("fotos");
      };
      a.onerror = () => fertig(null);
      a.onsuccess = () => {
        try {
          const t = a.result.transaction("fotos", art);
          const x = arbeit(t.objectStore("fotos"));
          x.onsuccess = () => { a.result.close(); fertig(x.result); };
          x.onerror = () => { a.result.close(); fertig(null); };
        } catch (e) { fertig(null); }
      };
    } catch (e) { fertig(null); }
  });
}
function fotoMerkHolen(id) { return fotoMerkTun("readonly", l => l.get(String(id))); }
function fotoMerkSetzen(id, satz) { return fotoMerkTun("readwrite", l => l.put(satz, String(id))); }
function fotoMerkWeg(id) { return fotoMerkTun("readwrite", l => l.delete(String(id))); }
function fotoMerkLeeren() { return fotoMerkTun("readwrite", l => l.clear()); }

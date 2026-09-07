// ============================================================
// FOTO-ABLAGE: die Fotos eines Ordners liegen zusaetzlich als
// echte Bilddateien auf dem Laptop.
//
// WARUM ES DAS GIBT (07.09.2026):
// Bisher stand im Scan-Auftrag nur "die Fotos liegen in Supabase
// als Daten-URL". Claude musste sie dann Stueck fuer Stueck aus
// der Datenbank ziehen: ein einziges Foto sind rund 105.000
// Zeichen Base64, die durch die SQL-Schnittstelle passen muessen.
// Am 07.09.2026 hat genau das ueber eine halbe Stunde gedauert -
// fuer EIN Foto mit 13 Zeilen. Eine Bilddatei dagegen liest Claude
// in Sekunden.
//
// Deshalb: beim Hochladen (und auf Knopfdruck auch nachtraeglich)
// wird jedes Foto zusaetzlich als Datei abgelegt:
//     <Ablage-Ordner>\<Ordnername>\01.jpg, 02.jpg, ...
// Der Scan-Auftrag nennt danach diesen Pfad, und Claude oeffnet
// die Dateien direkt.
//
// Die Datenbank bleibt unveraendert die Wahrheit. Die Dateien sind
// nur die schnelle Leseform. Geht die Ablage nicht (falscher
// Browser, Ordner nicht freigegeben), faellt alles auf den alten
// Weg zurueck - es geht nichts kaputt, es dauert nur laenger.
// ============================================================
"use strict";

const FOTOABLAGE_PFAD_SCHLUESSEL = "kt_fotoablage_pfad";
const FOTOABLAGE_PFAD_VORGABE = "C:\\Users\\Home\\kombi-tafel\\fotos";
const FOTOABLAGE_DB = "kt_fotoablage";
const FOTOABLAGE_LAGER = "griffe";
const FOTOABLAGE_GRIFF = "wurzel";

// Kann dieser Browser ueberhaupt in einen Ordner schreiben?
// Chrome und Edge koennen es, Firefox und Safari (noch) nicht.
function fotoAblageKann() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// Der Pfad, den wir Claude nennen. Der Browser verraet den echten
// Pfad des gewaehlten Ordners aus Sicherheitsgruenden nicht, also
// merken wir ihn uns einmal selbst.
function fotoAblagePfad() {
  try { return localStorage.getItem(FOTOABLAGE_PFAD_SCHLUESSEL) || FOTOABLAGE_PFAD_VORGABE; }
  catch (e) { return FOTOABLAGE_PFAD_VORGABE; }
}

function fotoAblagePfadSetzen(pfad) {
  try { localStorage.setItem(FOTOABLAGE_PFAD_SCHLUESSEL, String(pfad || "").trim()); } catch (e) { /* egal */ }
}

// ---------- den Ordner-Griff aufbewahren ----------
// Ein FileSystemDirectoryHandle laesst sich in IndexedDB legen und
// ueberlebt so das Schliessen des Browsers. Die Erlaubnis dagegen
// muss je Sitzung neu geholt werden - dafuer braucht es einen Klick.

function fotoAblageDb() {
  return new Promise((fertig, fehler) => {
    const a = indexedDB.open(FOTOABLAGE_DB, 1);
    a.onupgradeneeded = () => { a.result.createObjectStore(FOTOABLAGE_LAGER); };
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => fehler(a.error);
  });
}

function fotoAblageGriffLesen() {
  return fotoAblageDb().then(db => new Promise(fertig => {
    const a = db.transaction(FOTOABLAGE_LAGER, "readonly").objectStore(FOTOABLAGE_LAGER).get(FOTOABLAGE_GRIFF);
    a.onsuccess = () => fertig(a.result || null);
    a.onerror = () => fertig(null);
  })).catch(() => null);
}

function fotoAblageGriffSchreiben(griff) {
  return fotoAblageDb().then(db => new Promise(fertig => {
    const a = db.transaction(FOTOABLAGE_LAGER, "readwrite").objectStore(FOTOABLAGE_LAGER).put(griff, FOTOABLAGE_GRIFF);
    a.onsuccess = () => fertig(true);
    a.onerror = () => fertig(false);
  })).catch(() => false);
}

// Gibt den Wurzel-Ordner zurueck, oder null.
// fragen = true darf den Nutzer um Erlaubnis bitten (nur direkt nach einem Klick).
async function fotoAblageWurzel(fragen) {
  if (!fotoAblageKann()) return null;
  const griff = await fotoAblageGriffLesen();
  if (!griff) return null;
  try {
    let recht = await griff.queryPermission({ mode: "readwrite" });
    if (recht === "prompt" && fragen) recht = await griff.requestPermission({ mode: "readwrite" });
    return recht === "granted" ? griff : null;
  } catch (e) { return null; }
}

// Einmal einrichten: Ordner waehlen und den echten Pfad festhalten.
async function fotoAblageEinrichten() {
  if (!fotoAblageKann()) {
    return { ok: false, grund: "Dieser Browser kann keine Dateien ablegen. Bitte Chrome oder Edge nehmen." };
  }
  let griff;
  try {
    griff = await window.showDirectoryPicker({ id: "ktfotos", mode: "readwrite" });
  } catch (e) {
    return { ok: false, grund: "Kein Ordner gewaehlt." };
  }
  const vorschlag = fotoAblagePfad();
  const pfad = window.prompt(
    "Wie heisst dieser Ordner vollstaendig auf dem Laptop?\n" +
    "Genau diesen Pfad bekommt Claude genannt, damit er die Bilder findet.",
    vorschlag);
  if (!pfad) return { ok: false, grund: "Kein Pfad angegeben." };
  fotoAblagePfadSetzen(pfad);
  await fotoAblageGriffSchreiben(griff);
  return { ok: true, pfad: fotoAblagePfad(), name: griff.name };
}

// ---------- schreiben ----------

function fotoAblageEndung(dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/([a-z0-9+.-]+);/i);
  const art = (m ? m[1] : "jpeg").toLowerCase();
  if (art === "jpeg" || art === "jpg") return "jpg";
  if (art === "png") return "png";
  if (art === "webp") return "webp";
  return "img";
}

async function fotoAblageBlob(dataUrl) {
  const r = await fetch(dataUrl);
  return await r.blob();
}

// Legt ALLE Fotos eines Ordners als Dateien ab. Die Datenbank bleibt
// die Wahrheit, deshalb wird jedes Mal frisch geschrieben: so stimmen
// die Dateien auch dann, wenn ein Foto vom Handy nachgekommen ist.
// Rueckgabe: { ok, anzahl, pfad } oder { ok:false, grund }.
async function fotoAblageOrdnerSichern(ordner, fragen) {
  if (!fotoAblageKann()) return { ok: false, grund: "browser" };
  const wurzel = await fotoAblageWurzel(fragen);
  if (!wurzel) return { ok: false, grund: "kein-ordner" };

  let fotos;
  try { fotos = await supaSatzUploadsVoll(ordner); }
  catch (e) { return { ok: false, grund: "datenbank" }; }
  if (!fotos || !fotos.length) return { ok: false, grund: "keine-fotos" };

  let ziel;
  try { ziel = await wurzel.getDirectoryHandle(ordner, { create: true }); }
  catch (e) { return { ok: false, grund: "unterordner" }; }

  let n = 0;
  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];
    if (!foto || !foto.foto) continue;
    const name = String(i + 1).padStart(2, "0") + "." + fotoAblageEndung(foto.foto);
    try {
      const blob = await fotoAblageBlob(foto.foto);
      const datei = await ziel.getFileHandle(name, { create: true });
      const schreiber = await datei.createWritable();
      await schreiber.write(blob);
      await schreiber.close();
      n++;
    } catch (e) { /* dieses eine Foto eben nicht - der Rest laeuft weiter */ }
  }
  if (!n) return { ok: false, grund: "nichts-geschrieben" };
  return { ok: true, anzahl: n, gesamt: fotos.length, pfad: fotoAblagePfad() + "\\" + ordner };
}

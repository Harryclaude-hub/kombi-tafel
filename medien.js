// ============================================================
// MEDIEN: Fotos, Dateien, Sprach- und Video-Nachrichten im
// Messenger - alles Ende-zu-Ende verschluesselt.
//
// Ablauf: Datei -> AES-GCM verschluesseln (iv vorangestellt) ->
// als Datenmuell in den Speicher (Bucket kt-medien) -> in der
// Nachricht steht nur ein verschluesselter Verweis:
//   [[medien]]{"art":"bild|datei|ton|video","pfad":"...","name":"...","groesse":123}
// Beim Anzeigen wird heruntergeladen, entschluesselt und als
// Blob-URL gezeigt. GRENZE des Gratis-Speichers: 50 MB je Datei,
// 1 GB insgesamt - das ist eine Supabase-Grenze, keine Wahl.
// ============================================================
"use strict";

const MEDIEN_MAX = 50 * 1024 * 1024;
const MEDIEN_ZEICHEN = "[[medien]]";
const _medienUrls = {};   // pfad -> fertige Blob-URL

async function medienVerschluesseln(key, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, buf);
  const paket = new Uint8Array(12 + ct.byteLength);
  paket.set(iv, 0);
  paket.set(new Uint8Array(ct), 12);
  return new Blob([paket], { type: "application/octet-stream" });
}

async function medienEntschluesseln(key, buf) {
  try {
    const b = new Uint8Array(buf);
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12));
  } catch (e) { return null; }
}

function medienZufallsname() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function medienDmPfad(a, b) {
  const paar = [a, b].sort();
  return "dm/" + paar[0] + "_" + paar[1] + "/" + medienZufallsname();
}

function medienBereichPfad(bereichId) {
  return "bereich/" + bereichId + "/" + medienZufallsname();
}

// Hochladen + Verweistext bauen. art: bild | datei | ton | video
async function medienHochladen(key, pfad, blobOderDatei, art, name) {
  if (!key) return { fehler: "Kein Schluessel - der Partner braucht einmal die neue Version." };
  if (blobOderDatei.size > MEDIEN_MAX)
    return { fehler: "Zu gross: " + Math.round(blobOderDatei.size / 1024 / 1024) +
      " MB. Der Gratis-Speicher erlaubt hoechstens 50 MB je Datei." };
  const buf = await blobOderDatei.arrayBuffer();
  const paket = await medienVerschluesseln(key, buf);
  const up = await supa.storage.from("kt-medien").upload(pfad, paket, {
    contentType: "application/octet-stream"
  });
  if (up.error) return { fehler: up.error.message };
  return { ok: true, text: MEDIEN_ZEICHEN + JSON.stringify({
    art: art, pfad: pfad, name: name || "", groesse: blobOderDatei.size,
    typ: blobOderDatei.type || ""
  }) };
}

function medienLesen(text) {
  if (typeof text !== "string" || !text.startsWith(MEDIEN_ZEICHEN)) return null;
  try { return JSON.parse(text.slice(MEDIEN_ZEICHEN.length)); } catch (e) { return null; }
}

function medienTypSicher(m) {
  const t = String(m.typ || "");
  if (m.art === "bild" && /^image\/(png|jpe?g|gif|webp)$/.test(t)) return t;
  if (m.art === "ton" && /^audio\/[\w.+-]+$/.test(t)) return t;
  if (m.art === "video" && /^video\/[\w.+-]+$/.test(t)) return t;
  if (m.art === "bild") return "image/png";
  if (m.art === "ton") return "audio/webm";
  if (m.art === "video") return "video/webm";
  return "application/octet-stream";
}

async function medienUrl(key, m) {
  if (!/^(dm|bereich)\/[0-9a-f_-]+\/[0-9a-f]{32}$/i.test(String(m.pfad || ""))) return null;
  if (_medienUrls[m.pfad]) return _medienUrls[m.pfad];
  const dl = await supa.storage.from("kt-medien").download(m.pfad);
  if (dl.error || !key) return null;
  const klar = await medienEntschluesseln(key, await dl.data.arrayBuffer());
  if (!klar) return null;
  const url = URL.createObjectURL(new Blob([klar], { type: medienTypSicher(m) }));
  _medienUrls[m.pfad] = url;
  return url;
}

function medienGroesseText(n) {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n > 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

// Platzhalter-HTML; wird danach per medienNachladen(key) befuellt
function medienSicher(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function medienPlatzhalter(m) {
  // Der Pfad kommt aus der Nachricht eines ANDEREN Nutzers: er landet
  // NIE roh im HTML, nur seine entschaerfte Form in der id.
  const id = "med_" + String(m.pfad).replace(/[^a-z0-9]/gi, "");
  const name = medienSicher(m.name || "Datei");
  return '<span class="medien" id="' + id + '">' +
    "[" + (m.art === "bild" ? "Foto" : m.art === "ton" ? "Sprachnachricht" :
           m.art === "video" ? "Video" : "Datei") + " laedt: " + name + "]</span>";
}

async function medienNachladen(key, m) {
  const id = "med_" + m.pfad.replace(/[^a-z0-9]/gi, "");
  const ziel = document.getElementById(id);
  if (!ziel) return;
  const url = await medienUrl(key, m);
  const name = medienSicher(m.name || "Datei");
  if (!url) { ziel.innerHTML = "[nicht ladbar: " + name + "]"; return; }
  if (m.art === "bild") {
    ziel.innerHTML = '<a href="' + url + '" target="_blank"><img src="' + url + '" class="medienbild" alt="' + name + '"></a>';
  } else if (m.art === "ton") {
    ziel.innerHTML = '<audio controls src="' + url + '"></audio>';
  } else if (m.art === "video") {
    ziel.innerHTML = '<video controls src="' + url + '" class="medienvideo"></video>';
  } else {
    ziel.innerHTML = '<a href="' + url + '" download="' + name + '">' + name +
      " (" + medienGroesseText(m.groesse || 0) + ") herunterladen</a>";
  }
}

// ---------- Aufnahme: Sprach- und Video-Nachrichten ----------

let _aufnahme = null;   // { rec, teile, art, stream }

async function aufnahmeStart(art, quelle) {
  if (_aufnahme) return { fehler: "Es laeuft schon eine Aufnahme." };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      art === "video" ? { video: true, audio: true } : { audio: true });
  } catch (e) {
    return { fehler: (art === "video" ? "Kamera" : "Mikrofon") +
      " nicht erlaubt oder nicht vorhanden (" + e.name + ")." };
  }
  const rec = new MediaRecorder(stream);
  const teile = [];
  rec.ondataavailable = ev => { if (ev.data.size) teile.push(ev.data); };
  rec.start(250);
  _aufnahme = { rec: rec, teile: teile, art: art, stream: stream, quelle: quelle || "" };
  return { ok: true, stream: stream };
}

function aufnahmeStopp() {
  return new Promise(fertig => {
    if (!_aufnahme) { fertig(null); return; }
    const a = _aufnahme;
    _aufnahme = null;
    a.rec.onstop = () => {
      a.stream.getTracks().forEach(t => t.stop());
      fertig(new Blob(a.teile, { type: a.rec.mimeType || (a.art === "video" ? "video/webm" : "audio/webm") }));
    };
    a.rec.stop();
  });
}

function aufnahmeAbbrechen() {
  if (!_aufnahme) return;
  const a = _aufnahme;
  _aufnahme = null;
  try { a.rec.stop(); } catch (e) {}
  a.stream.getTracks().forEach(t => t.stop());
}

function aufnahmeLaeuft(quelle) {
  if (!_aufnahme) return false;
  return quelle === undefined || _aufnahme.quelle === quelle;
}

// ============================================================
// ADMIN: die eigene Admin-Seite (admin.html).
// Zwei Blöcke: Foto-Sätze der Homebase hochladen und alle
// User verwalten. Die Datenbank prüft jede Aktion selbst
// (RLS + Admin-RPCs) - die Seite ist nur die Oberflaeche.
// ============================================================
"use strict";

function elA(id) { return document.getElementById(id); }

function meldungA(text, art) {
  const box = elA("meldung");
  if (!box) return;
  box.innerHTML = '<div class="' + (art === "gut" ? "kern" : "warnkern") + '">' + text + "</div>";
  box.scrollIntoView({ block: "nearest" });
}

function sicherA(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function zeitA(iso) {
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    "." + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

let adminIch = null;

async function startAdmin() {
  const ziel = elA("admininhalt");
  if (!window.supa) {
    ziel.innerHTML = '<div class="warnkern">Die Datenbank-Bibliothek konnte nicht laden. Bitte Seite neu laden.</div>';
    return;
  }
  const u = await supaNutzer();
  if (!u) {
    ziel.innerHTML = '<div class="kern">Du bist nicht angemeldet. ' +
      '<a href="mein.html"><b>Zuerst in Mein Bereich anmelden</b></a>, dann hierher zurueck.</div>';
    return;
  }
  const admin = await supaIstAdmin();
  if (!admin) {
    ziel.innerHTML = '<div class="warnkern"><b>Nur für Admins.</b> Dein Konto hat keine Admin-Rolle - ' +
      "hier gibt es für dich nichts zu sehen.</div>";
    return;
  }
  adminIch = u;
  ziel.innerHTML = `
<h2>&#128193; Ordner der Homebase</h2>
<p class="mini">Der ganze Ablauf an einem Ort: <b>Ordner anlegen</b> (oder Fotos hochladen -
der Ordner entsteht dann von selbst), <b>Fotos hineinlegen</b>, <b>einlesen</b> und die Zeilen
<b>abarbeiten</b>. Jeder Ordner ist für ALLE Nutzer gleich; nur der aktivierte Ordner wird
auf Kombi-Tafel, Kombi-Bau und Original-Tabelle angezeigt. Ordner mischen sich nie.</p>
<div class="kern"><b>Neuen Ordner anlegen:</b>
  <input type="date" id="neusatz_datum">
  <input id="neusatz_titel" placeholder="Titel (leer = Fotos vom Datum)" size="24">
  <button class="haupt" onclick="tuSatzNeu()">&#10133; Ordner anlegen</button></div>
<p><input id="satz_suche" placeholder="&#128269; Ordner suchen: Datum oder Titel eintippen..."
  size="40" oninput="satzSuche(this.value)"></p>
<div id="adm_ordner"><p class="mini">Lädt...</p></div>
<h2>&#128101; Alle User</h2>
<p class="mini">Löschen entfernt ein Konto RESTLOS - samt allem, was der User angelegt hat,
auch in geteilten Bereichen. Der Knopf will zur Sicherheit zweimal gedrückt werden.
Admins ernennst du mit "zum Admin machen" - auch das fragt zweimal.</p>
<div id="adm_user"></div>`;
  await zeichneOrdner();
  await adminUserliste();
}

// ---------- Foto-Sätze ----------

// ---------- EINE Ordner-Werkstatt ----------
// Je Ordner ein Kasten: Kopf mit Zahlen, Knopfleiste, Fotos, Vorschau,
// Wetten-Tabelle. Alles was zu einem Ordner gehoert, ist beisammen.

async function zeichneOrdner() {
  const box = elA("adm_ordner");
  if (!box) return;
  const uploads = await supaSatzUploadsLaden();
  let saetze = await supaSaetzeLaden();

  // Fotos ohne Ordner? Dann fehlt der Ordner - er wird angelegt.
  const datenOhne = [...new Set(uploads.map(u => u.satz_datum))].filter(d => !saetze.some(s => s.id === d));
  for (const d of datenOhne) {
    const t = d.split("-");
    await supaSatzAnlegen(d, "Fotos vom " + t[2] + "." + t[1] + "." + t[0]);
  }
  if (datenOhne.length) saetze = await supaSaetzeLaden();

  if (!saetze.length) {
    box.innerHTML = '<div class="kern">Noch kein Ordner. Leg oben einen an - oder lade unten ' +
      "einfach Fotos hoch, dann entsteht er von selbst.</div>" + fotoZuNeuemOrdnerHtml();
    return;
  }
  const wetten = await supaWettenLaden();
  const offen = localStorage.getItem("kt_satz");
  let html = "";
  for (const s of saetze) {
    const meine = wetten.filter(w => w.satz === s.id);
    const fotos = uploads.filter(u => u.satz_datum === s.id);
    const wartet = fotos.filter(u => u.status === "wartet").length;
    const istOffen = offen === s.id;
    html += '<details class="ordnerwerk' + (istOffen ? " werkoffen" : "") + '" id="satzdetails_' + sicherA(s.id) +
      '" data-such="' + sicherA((s.titel + " " + s.id).toLowerCase()) + '"' + (istOffen ? " open" : "") +
      ' ontoggle="if(this.open)satzFotosLaden(\'' + sicherA(s.id) + '\')">' +
      "<summary><b>&#128193; " + sicherA(s.titel) + "</b> " +
      (istOffen ? '<span class="fertigbadge">offener Ordner</span> ' : "") +
      '<span class="mini">' + meine.length + " Wetten, " + fotos.length + " Fotos" +
      (wartet ? ", " + wartet + " noch nicht eingelesen" : "") + "</span></summary>" +
      '<div class="werkinhalt">' +
      // Knopfleiste
      '<div class="werkleiste">' +
      (istOffen ? '<span class="mini gruen">&#9989; Dieser Ordner ist überall offen</span>'
                : '<button class="haupt" onclick="satzAktivieren(\'' + sicherA(s.id) + '\')">&#9989; Diesen Ordner aktivieren</button>') +
      ' <label class="fotoknopf">&#128247; Fotos hinzufügen' +
      '<input type="file" accept="image/*" multiple style="display:none" ' +
      'onchange="tuSatzFotos(this, \'' + sicherA(s.id) + '\')"></label>' +
      (fotos.length ? ' <button class="haupt" onclick="satzEinlesen(\'' + sicherA(s.id) + '\')">&#128269; ' +
        (wartet ? "Fotos einlesen (" + wartet + " neu)" : "Fotos noch einmal einlesen") + "</button>" : "") +
      ' <button onclick="tuWetteNeu(\'' + sicherA(s.id) + '\')">&#10133; Wette von Hand</button>' +
      ' <button id="satzweg_' + sicherA(s.id) + '" onclick="tuSatzWeg(\'' + sicherA(s.id) + '\')">&#128465; Ordner löschen</button>' +
      "</div>" +
      '<div id="vorschau_' + sicherA(s.id) + '"></div>' +
      '<div id="satzfotos_' + sicherA(s.id) + '"></div>' +
      '<h3>Wetten in diesem Ordner (' + meine.length + ")</h3>" +
      (meine.length ? '<div class="tabellenrand"><table><thead><tr><th>Anstoß (UK)</th><th>gemeldet</th>' +
        "<th>Liga</th><th>Spiel</th><th>Wette</th><th>Art</th><th>Quote</th><th></th></tr></thead><tbody>" +
        meine.map(w => wettenZeileHtml(w)).join("") + "</tbody></table></div>"
        : '<p class="mini">Noch keine Wetten - Fotos einlesen oder von Hand anlegen.</p>') +
      "</div></details>";
  }
  box.innerHTML = html;
}

function wettenZeileHtml(w) {
  const quote = (Array.isArray(w.o) && w.o[0]) ? w.o[0][1] : "";
  const mehr = (Array.isArray(w.o) && w.o.length > 1)
    ? ' <span class="mini">(+' + (w.o.length - 1) + " weitere: " +
      w.o.slice(1).map(x => x[1]).join(" / ") + ")</span>" : "";
  return "<tr>" +
    '<td><input value="' + sicherA(w.an_korrigiert || w.an_zeit) + '" onchange="tuWette(' + w.id + ',\'an_zeit\',this.value)" size="16"></td>' +
    '<td><input value="' + sicherA(w.von || "") + '" onchange="tuWette(' + w.id + ',\'von\',this.value)" size="5"></td>' +
    '<td><input value="' + sicherA(w.liga || "") + '" onchange="tuWette(' + w.id + ',\'liga\',this.value)" size="18"></td>' +
    '<td><input value="' + sicherA(w.spiel) + '" onchange="tuWette(' + w.id + ',\'spiel\',this.value)" size="32"></td>' +
    '<td><input value="' + sicherA(w.wette) + '" onchange="tuWette(' + w.id + ',\'wette\',this.value)" size="22"></td>' +
    '<td><select onchange="tuWette(' + w.id + ',\'s\',this.value)">' +
      S_WAHL.map(x => "<option" + (w.s === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></td>" +
    '<td><input value="' + sicherA(String(quote)) + '" onchange="tuWetteQuote(' + w.id + ',this.value)" size="5">' + mehr + "</td>" +
    '<td><button onclick="tuWetteWeg(' + w.id + ')">weg</button></td></tr>';
}

// Fotos hochladen, wenn es noch gar keinen Ordner gibt
function fotoZuNeuemOrdnerHtml() {
  const d = new Date();
  const heute = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
  return '<p><label>Datum: <input type="date" id="satz_datum" value="' + heute + '"></label> ' +
    '<label class="fotoknopf">&#128247; Fotos hochladen' +
    '<input type="file" accept="image/*" multiple style="display:none" onchange="tuSatzFotos(this)"></label></p>';
}

// Alte Namen weiterhin bedienbar (aeltere Aufrufe im Code)
async function adminFotoSaetze() { return zeichneOrdner(); }
async function adminSaetze() { return zeichneOrdner(); }

async function tuSatzFotos(input, satzId) {
  const feld = elA("satz_datum");
  const datum = satzId || (feld ? feld.value : "");
  if (!datum) { meldungA("Bitte zuerst das Datum des Ordners wählen.", "warn"); return; }
  const dateien = Array.from(input.files || []);
  input.value = "";
  if (!dateien.length) return;
  let ok = 0, doppelt = 0;
  for (const datei of dateien) {
    const dataUrl = await verkleinereBild(datei, 1600);
    if (!dataUrl) continue;
    const hash = await fotoFingerabdruck(dataUrl);
    if (hash && await supaUploadHashDa(datum, hash)) { doppelt++; continue; }
    const r = await supaSatzFotoHochladen(adminIch.id, datum, dataUrl, hash);
    if (!r.error) ok++;
    else meldungA("Foto nicht gespeichert: " + sicherA(r.error.message), "warn");
  }
  // Der Ordner entsteht automatisch mit dem Datum als Namen
  let neuerOrdner = false;
  if (ok) {
    const daSaetze = await supaSaetzeLaden();
    if (!daSaetze.some(s => s.id === datum)) {
      const d = datum.split("-");
      const r = await supaSatzAnlegen(datum, "Fotos vom " + d[2] + "." + d[1] + "." + d[0]);
      neuerOrdner = !r.error;
    }
  }
  meldungA(ok + " von " + dateien.length + " Fotos zum Satz vom " + sicherA(datum) +
    " hochgeladen" + (doppelt ? ", " + doppelt + " war(en) schon da (gleiches Foto) und wurden übersprungen" : "") +
    (neuerOrdner ? ". <b>Ordner automatisch angelegt.</b>" : ".") +
    " Jetzt auf <b>Jetzt im Programm einlesen</b> drücken.", ok || doppelt ? "gut" : "warn");
  adminFotoSaetze();
  adminSaetze();
}

// ---------- Fotos ansehen und loeschen ----------
// Falsch hochgeladen? Jedes Foto laesst sich einzeln entfernen - oder
// alle eines Datums auf einmal, um mit dem gleichen Datum komplett neu
// anzufangen. (Satz löschen entfernt die Fotos absichtlich NICHT.)

async function fotoKachelnHtml(datum) {
  const uploads = await supaSatzUploadsVoll(datum);
  if (!uploads.length) return '<p class="mini">Keine Fotos mehr zu diesem Datum.</p>';
  // Doppelt hochgeladene erkennen: gleicher Fingerabdruck = gleiches Foto
  const haeufig = {};
  for (const up of uploads) {
    up._hash = await fotoFingerabdruck(up.foto);
    haeufig[up._hash] = (haeufig[up._hash] || 0) + 1;
  }
  let h = '<div class="fotogitter">';
  for (const up of uploads) {
    const doppelt = up._hash && haeufig[up._hash] > 1;
    h += '<div class="fotokachel' + (doppelt ? " fotodoppelt" : "") + '"><img src="' + up.foto + '" alt="Foto">' +
      '<div class="mini">' + (up.status === "wartet" ? '<span class="rot">wartet</span>' : '<span class="gruen">eingelesen</span>') +
      (doppelt ? ' <b class="rot">DOPPELT hochgeladen!</b>' : "") +
      ' <button onclick="tuFotoWeg(\'' + up.id + '\', \'' + sicherA(datum) + '\')">dieses Foto löschen</button></div></div>';
  }
  h += "</div>" +
    '<p><button id="allefotosweg_' + sicherA(datum) + '" onclick="tuAlleFotosWeg(\'' + sicherA(datum) + '\')">' +
    "ALLE " + uploads.length + " Fotos vom " + sicherA(datum) + " löschen</button> " +
    '<span class="mini">Danach kannst du zum gleichen Datum komplett neue Fotos hochladen.</span></p>';
  return h;
}

async function fotosZeigen(datum) {
  const box = elA("fotoliste_" + datum);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }   // zweiter Klick klappt zu
  box.innerHTML = '<p class="mini">Lade Fotos...</p>';
  box.innerHTML = await fotoKachelnHtml(datum);
}

// Fotos direkt im geoeffneten Satz (Saetze bearbeiten)
async function satzFotosLaden(datum) {
  const box = elA("satzfotos_" + datum);
  if (!box || box.dataset.geladen === "1") return;
  box.dataset.geladen = "1";
  box.innerHTML = '<p class="mini">Lade Fotos...</p>';
  box.innerHTML = "<h3>Fotos dieses Satzes</h3>" + await fotoKachelnHtml(datum);
}

async function tuFotoWeg(id, datum) {
  const r = await supaSatzUploadLoeschen(id);
  if (r.error || !r.data || !r.data.length) { meldungA("Foto nicht gelöscht (nur Admins).", "warn"); return; }
  meldungA("Foto gelöscht.", "gut");
  await adminFotoSaetze();
  const oben = elA("fotoliste_" + datum);
  if (oben) { oben.innerHTML = ""; fotosZeigen(datum); }
  const imSatz = elA("satzfotos_" + datum);
  if (imSatz) { imSatz.dataset.geladen = ""; satzFotosLaden(datum); }
}

async function tuAlleFotosWeg(datum) {
  const knopf = elA("allefotosweg_" + datum);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = "Wirklich ALLE Fotos vom " + datum + " löschen?";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supa.from("kt_satz_uploads").delete().eq("satz_datum", datum).select("id");
  if (r.error) { meldungA("Nicht gelöscht: " + sicherA(r.error.message), "warn"); return; }
  meldungA(((r.data && r.data.length) || 0) + " Fotos vom " + sicherA(datum) +
    " gelöscht. Du kannst jetzt zum gleichen Datum frisch hochladen.", "gut");
  adminFotoSaetze();
  const imSatz = elA("satzfotos_" + datum);
  if (imSatz) { imSatz.dataset.geladen = ""; satzFotosLaden(datum); }
}

// Kleine Fotos vor der Erkennung hochskalieren - winzige Schrift ist der
// Hauptgrund fuer verlorene Zeilen (15 statt 50!)
// Bild fuer die Erkennung aufbereiten: gross genug, Graustufen, mehr
// Kontrast. Das ist der groesste Hebel dafuer, dass JEDE Zeile ankommt.
function bildVergroessern(dataUrl, mindestBreite) {
  return new Promise(fertig => {
    const bild = new Image();
    bild.onload = () => {
      const faktor = Math.max(1, Math.min(4, mindestBreite / bild.width));
      const c = document.createElement("canvas");
      c.width = Math.round(bild.width * faktor);
      c.height = Math.round(bild.height * faktor);
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(bild, 0, 0, c.width, c.height);
      try {
        const d = g.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          const grau = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          // Kontrast anheben: helles heller, dunkles dunkler
          const stark = Math.max(0, Math.min(255, (grau - 128) * 1.6 + 128));
          p[i] = p[i + 1] = p[i + 2] = stark;
        }
        g.putImageData(d, 0, 0);
      } catch (e) { /* ohne Aufbereitung weiter */ }
      fertig(c.toDataURL("image/png"));
    };
    bild.onerror = () => fertig(dataUrl);
    bild.src = dataUrl;
  });
}

async function fotoFingerabdruck(dataUrl) {
  try {
    const buf = new TextEncoder().encode(dataUrl);
    const h = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
  } catch (e) { return null; }
}

function verkleinereBild(datei, maxBreite) {
  return new Promise(fertig => {
    const leser = new FileReader();
    leser.onload = ev => {
      const bild = new Image();
      bild.onload = () => {
        const faktor = Math.min(1, maxBreite / bild.width);
        const c = document.createElement("canvas");
        c.width = Math.round(bild.width * faktor);
        c.height = Math.round(bild.height * faktor);
        c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
        fertig(c.toDataURL("image/jpeg", 0.8));
      };
      bild.onerror = () => fertig(null);
      bild.src = ev.target.result;
    };
    leser.onerror = () => fertig(null);
    leser.readAsDataURL(datei);
  });
}

// ---------- Userliste ----------

async function adminUserliste() {
  const box = elA("adm_user");
  if (!box) return;
  const r = await supaAdminUserliste();
  if (r.error) {
    box.innerHTML = '<p class="mini rot">Admin-Liste nicht ladbar: ' + sicherA(r.error.message) + "</p>";
    return;
  }
  let zeilen = "";
  for (const u of (r.data || [])) {
    zeilen += "<tr><td>" + sicherA(u.username || "(kein Name)") +
      (u.rolle === "admin" ? ' <span class="mini">(Admin)</span>' : "") + "</td>" +
      "<td>" + sicherA(u.email || "") + "</td>" +
      "<td class='mini'>" + zeitA(u.registriert) + "</td>" +
      "<td class='mini'>" + (u.zuletzt ? zeitA(u.zuletzt) : "-") + "</td>" +
      "<td>" + u.scheine + "</td>" +
      "<td>" + (u.id === adminIch.id
        ? "<span class='mini'>das bist du</span>"
        : (u.rolle === "admin"
          ? '<button id="adminrolle_' + u.id + '" onclick="tuAdminRolle(\'' + u.id + '\', \'user\')">Admin-Rolle nehmen</button>'
          : '<button id="adminrolle_' + u.id + '" onclick="tuAdminRolle(\'' + u.id + '\', \'admin\')">zum Admin machen</button> ' +
            '<button id="adminweg_' + u.id + '" onclick="tuAdminLoeschen(\'' + u.id + '\')">löschen</button>')) +
      "</td></tr>";
  }
  box.innerHTML = "<table><thead><tr><th>Benutzername</th><th>E-Mail</th><th>registriert</th>" +
    "<th>zuletzt da</th><th>Scheine</th><th></th></tr></thead><tbody>" + zeilen + "</tbody></table>";
}

async function tuAdminRolle(id, neu) {
  const knopf = elA("adminrolle_" + id);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = (neu === "admin") ? "Wirklich zum Admin machen?" : "Wirklich Rolle nehmen?";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supaAdminRolle(id, neu);
  if (r.error) { meldungA("Rolle nicht geändert: " + sicherA(r.error.message), "warn"); return; }
  meldungA(neu === "admin"
    ? "Der Nutzer ist jetzt Admin: er sieht diese Seite und darf Foto-Sätze hochladen."
    : "Admin-Rolle entfernt - er ist wieder normaler Nutzer.", "gut");
  adminUserliste();
}

async function tuAdminLoeschen(id) {
  const knopf = elA("adminweg_" + id);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = "Wirklich? Alles weg!";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supaAdminUserLoeschen(id);
  if (r.error) { meldungA("Nicht gelöscht: " + sicherA(r.error.message), "warn"); return; }
  meldungA("User " + sicherA(String(r.data || "gelöscht")) + ".", "gut");
  adminUserliste();
}

document.addEventListener("DOMContentLoaded", startAdmin);

// ============================================================
// FOTO-SAETZE IM PROGRAMM EINLESEN
// Texterkennung laeuft im Browser (wie beim Wettschein-Lesen),
// dann zerlegt ein fester Zeilen-Parser Saschas Tabellen-Format:
//   Anstoss | Meldedatum | Liga | Spiel | Wette | Quote
// NICHTS wird still uebernommen: erst kommt die VORSCHAU, in der
// jede Zeile geprueft, geaendert oder geloescht werden kann.
// ============================================================

let vorschauZeilen = [];
let vorschauDatum = null;
let vorschauUploads = [];
let vsTrotzdem = false;
let vorschauBox = null;

const S_WAHL = ["SIEG", "ASIA", "TORE", "ECKEN", "BTTS", "HZ-END", "DNB", "DC", "TENNIS"];

// Spalten erkennen ueber die PIXEL-Position der Woerter: die Text-
// erkennung liefert zu jedem Wort, wo es im Bild steht. Grosse Luecken
// zwischen Woertern sind Spaltengrenzen - viel robuster als Leerzeichen.
function felderAusWorten(words) {
  const w = (words || []).filter(x => x.text && x.text.trim() && x.bbox);
  w.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const felder = [];
  let akt = "", vorigesEnde = null;
  for (const x of w) {
    if (vorigesEnde !== null && (x.bbox.x0 - vorigesEnde) > 15) {
      if (akt.trim()) felder.push(akt.trim());
      akt = "";
    }
    akt += (akt ? " " : "") + x.text.trim();
    vorigesEnde = x.bbox.x1;
  }
  if (akt.trim()) felder.push(akt.trim());
  return felder;
}

// Sieht eine nicht verwertbare Rohzeile trotzdem nach einer Wett-Zeile aus?
// (dann wird sie in die Vorschau uebernommen statt weggeworfen)
// Notfall-Zerlegung einer Zeile ohne brauchbare Spalten: die festen
// Bestandteile (Datum, Meldedatum, Quoten) herausloesen, der Rest bleibt
// als Liga/Spiel/Wette-Text stehen.
function zeileNotZerlegen(text) {
  let t = " " + String(text).replace(/\s+/g, " ").trim() + " ";
  const felder = [];
  const datum = t.match(/\d{2}-\d{2}-\d{4}[.,;]?\s*\d{1,2}[:.]\d{2}/);
  if (datum) { felder.push(datum[0]); t = t.replace(datum[0], " | "); }
  const meld = t.match(/\s\d{1,2}\/\d{1,2}\/\d{2,4}\s/);
  if (meld) { felder.push(meld[0].trim()); t = t.replace(meld[0], " | "); }
  const quoten = t.match(/\d{1,3}[.,]\d{2}(?!\d)/g) || [];
  for (const q of quoten) t = t.replace(q, " | ");
  // Spiel und Wette trennen: vor und nach dem Vereins-Trenner "vs"
  const rest = t.split("|").map(x => x.trim()).filter(x => x.length > 1);
  for (const r of rest) {
    const vs = r.match(/^(.*\bvs?\.?\b.*?)\s+(\S.*\(.*\).*)$/i);
    if (vs) { felder.push(vs[1].trim()); felder.push(vs[2].trim()); }
    else felder.push(r);
  }
  for (const q of quoten) felder.push(q);
  return felder;
}

function zeileSiehtNachWetteAus(text) {
  const t = String(text || "").trim();
  if (t.length < 12) return false;
  const hatZahl = /\d{1,3}[.,]\d{1,2}(?!\d)/.test(t);
  const hatSpiel = /\bvs?\.?\b/i.test(t);
  const hatZeit = /\d{1,2}[:.]\d{2}/.test(t);
  return (hatZahl && (hatSpiel || hatZeit)) || (hatSpiel && hatZeit);
}

function satzFelderParsen(felder, erbe) {
  let an = null, von = "", quote = null;
  const quoten = [];
  const rest = [];
  for (const f of felder) {
    const anM = f.match(/(\d{2})-(\d{2})-(\d{4})[.,;]?\s*(\d{1,2})[:.](\d{2})/);
    const qM = f.match(/^[.,]?(\d{1,3})[,.](\d{2})[.,]?$/);
    const vonM = f.match(/^[^0-9]?(\d{1,2})\/(\d{1,2})\/?\d{0,4}$/);
    if (anM && !an) {
      an = anM[3] + "-" + anM[2] + "-" + anM[1] + "T" + anM[4].padStart(2, "0") + ":" + anM[5];
    } else if (vonM && !von && !an === false && rest.length === 0) {
      von = vonM[1] + "." + vonM[2] + ".";
    } else if (qM) {
      const q = parseFloat(qM[1] + "." + qM[2]);
      quoten.push(q);
      quote = q;                                  // das LETZTE Zahlenfeld fuehrt
    } else if (f.length > 1 && !/^[a-z]{1,3}$/i.test(f)) {
      rest.push(f);   // Kleinkram wie das jb-Kuerzel fliegt raus
    }
  }
  let geerbt = false;
  if (!an && erbe && erbe.an && quote !== null && rest.length) {
    an = erbe.an;                       // Datum aus der Vorzeile uebernehmen
    if (!von && erbe.von) von = erbe.von;
    geerbt = true;
  }
  if (!an || quote === null || quote < 1.01 || quote > 1000 || !rest.length) return null;
  let liga = "", spiel = "", wette = "";
  const vsIdx = rest.findIndex(t => /\bvs?\.?\b/i.test(t) && /[a-z].*\bvs?\.?\b.*[a-z]/i.test(t));
  if (vsIdx >= 0) {
    spiel = rest[vsIdx];
    liga = rest.slice(0, vsIdx).join(" ");
    wette = rest.slice(vsIdx + 1).join(" ");
  } else if (rest.length >= 3) {
    liga = rest[0]; spiel = rest[1]; wette = rest.slice(2).join(" ");
  } else if (rest.length === 2) {
    spiel = rest[0]; wette = rest[1];
  } else {
    spiel = rest[0];
  }
  if (!wette && spiel) { wette = spiel; }
  // Stehen mehrere Quoten in einer Zeile (z. B. 2,25 / 2,50), kommen ALLE mit
  const alle = quoten.filter(q => q >= 1.01 && q <= 1000);
  return { von: von, an_zeit: an, liga: liga, spiel: spiel, wette: wette,
    s: artErkennen(wette), quote: quote, quoten: alle.length > 1 ? alle : null, geerbt: geerbt };
}

function artErkennen(wette) {
  if (/[+-]\s?\d+[.,]?\d*\s*A[HIl]?/i.test(wette) || /\([+-]/.test(wette) || /\d[.,]5\s*AH/i.test(wette)) return "ASIA";
  if (/DN[BE]/i.test(wette)) return "DNB";
  if (/\(DC/i.test(wette)) return "DC";
  if (/ber\s|under|over|tore/i.test(wette)) return "TORE";
  if (/eck|corner/i.test(wette)) return "ECKEN";
  return "SIEG";
}

// Bekannte Lesefehler der Texterkennung deterministisch reparieren
// (nur eindeutige Muster - alles andere bleibt und wird markiert)
function wetteReparieren(w) {
  let t = String(w).trim();
  t = t.replace(/^[\('",\u201A\u2018\u2019]+/, "");          // fuehrende Klammer-/Anfuehrungsreste
  t = t.replace(/DN[EB][._\s]*$/i, "DNB)");                 // DNE._ -> DNB)
  t = t.replace(/A[Il1]\)?\s*$/i, "AH)");                   // Al / AI -> AH)
  t = t.replace(/\((\d)[:.](5)\s/, "(-$1.$2 ");            // (2:5 -> (-2.5
  t = t.replace(/\(([+-])(\d)(\d)(?![.,\d])/, "($1$2.$3"); // (-25 -> (-2.5
  t = t.replace(/\(([+-]?\d+)\s(5)\b/, "($1.$2");          // (-1 5 -> (-1.5
  t = t.replace(/[;:]\s*$/, ")");                           // (Win; -> (Win)
  if (/\([^)]*$/.test(t)) t += ")";                        // fehlende Klammer schliessen
  return t;
}

// Warnungen je Zeile: was der Mensch pruefen sollte (gelb in der Vorschau)
function pruefGruende(z, satzDatum) {
  const g = [];
  const satz = new Date(satzDatum + "T00:00");
  const tage = (new Date(z.an_zeit) - satz) / 86400000;
  if (!(tage >= -1 && tage <= 14)) g.push("Anstoß weit weg vom Satz-Datum");
  const spielNorm = z.spiel.toLowerCase().replace(/[^a-z0-9]/g, "");
  const teamNorm = z.wette.toLowerCase().replace(/\(.*$/, "").replace(/[^a-z0-9]/g, "");
  if (teamNorm.length >= 4 && !spielNorm.includes(teamNorm.slice(0, Math.min(8, teamNorm.length))))
    g.push("Wett-Team steht nicht im Spiel");
  if (z.quote > 50) g.push("sehr hohe Quote");
  if (z.quote < 1.15) g.push("sehr niedrige Quote - Lesefehler?");
  return g;
}

// STRENG (fuers automatische Verwerfen): nur wirklich 1:1 gleiche Zeilen
// gelten als Duplikat - Karams Regel. Alles nur AEHNLICHE wird lediglich
// gelb markiert (weicher Schluessel) und bleibt seine Entscheidung.
function zeilenSchluessel(z) {
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
  return z.an_zeit + "|" + z.quote + "|" + norm(z.spiel) + "|" + norm(z.wette);
}

function zeilenSchluesselWeich(z) {
  const spiel6 = z.spiel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  const uhr = String(z.an_zeit).slice(11, 16);
  return uhr + "|" + z.quote + "|" + z.s + "|" + spiel6;
}

// Moegliche Doppelte (gleiche Zeit + gleiche Quote) fuer die Vorschau markieren
function vsDoppelVerdacht() {
  const zaehl = {};
  for (const z of vorschauZeilen) {
    const k = zeilenSchluesselWeich(z);
    zaehl[k] = (zaehl[k] || 0) + 1;
  }
  return vorschauZeilen.map(z => zaehl[zeilenSchluesselWeich(z)] > 1);
}

// Lade-Anzeige mit Prozent: man sieht genau, was gerade passiert
function einleseBalken(box, foto, gesamt, prozent, text) {
  if (!box) return;
  box.innerHTML = '<div class="kern"><b>&#128269; Einlesen läuft:</b> Foto ' + foto + " von " + gesamt +
    " - " + text + '<div class="ladebalken"><div class="ladebalkenfuellung" style="width:' +
    Math.max(2, Math.min(100, prozent)) + '%">' + prozent + " %</div></div></div>";
}

async function satzEinlesen(datum) {
  vorschauBox = "vorschau_" + datum;
  const box = elA(vorschauBox);
  if (typeof Tesseract === "undefined") {
    meldungA("Die Texterkennung ist noch nicht geladen - Seite einmal neu laden.", "warn");
    return;
  }
  box.innerHTML = '<div class="kern">Lese die Fotos vom ' + sicherA(datum) +
    "... beim ersten Mal dauert das ein paar Sekunden je Foto.</div>";
  const uploads = await supaSatzUploadsVoll(datum);
  if (!uploads.length) { box.innerHTML = '<div class="warnkern">Keine Fotos zu diesem Datum.</div>'; return; }
  vorschauDatum = datum;
  vorschauUploads = uploads;
  vsTrotzdem = false;
  const gesehen = new Set();
  vorschauZeilen = [];
  let nr = 0;
  for (const up of uploads) {
    nr++;
    einleseBalken(box, nr, uploads.length, 0, "Foto wird vorbereitet...");
    let lines = [];
    try {
      const gross = await bildVergroessern(up.foto, 2400);
      const nrJetzt = nr;
      // NUR den logger uebergeben: zusaetzliche Einstellungen kosten hier die
      // Wort-Koordinaten, und ohne die faellt die Spaltenerkennung aus.
      const erg = await Tesseract.recognize(gross, "deu", {
        logger: m => {
        if (m.status === "recognizing text") {
          einleseBalken(box, nrJetzt, uploads.length, Math.round((m.progress || 0) * 100), "Zeilen werden gelesen...");
        } else if (m.status && m.progress !== undefined) {
          einleseBalken(box, nrJetzt, uploads.length, Math.round((m.progress || 0) * 100), "Erkennung lädt (" + m.status + ")...");
        }
      } });
      lines = erg.data.lines || [];
      // Fallback fuer aeltere Ausgaben: Bloecke/Absaetze durchsuchen
      if (!lines.length && erg.data.blocks) {
        for (const b of erg.data.blocks) for (const p of (b.paragraphs || []))
          for (const l of (p.lines || [])) lines.push(l);
      }
    } catch (e) {
      meldungA("Foto " + nr + " nicht lesbar: " + sicherA(String(e.message || e).slice(0, 60)), "warn");
      continue;
    }
    const geparst = [];
    let erbe = null;
    let unklar = 0;
    for (const line of lines) {
      let felder = felderAusWorten(line.words);
      const rohText = (line.text || felder.join(" ")).replace(/\s+/g, " ").trim();
      // Notfall: keine Wort-Koordinaten -> an groesseren Luecken zerlegen
      if (felder.length < 3 && rohText.length > 20) {
        const geteilt = rohText.split(/\s{2,}/).map(t => t.trim()).filter(Boolean);
        if (geteilt.length >= 3) felder = geteilt;
      }
      let p = satzFelderParsen(felder, erbe);
      // Zweiter Versuch: Zeile anhand der Muster zerlegen (Datum | Rest | Quoten)
      if (!p && rohText.length > 20) p = satzFelderParsen(zeileNotZerlegen(rohText), erbe);
      if (p) {
        p.wette = wetteReparieren(p.wette);
        p.s = artErkennen(p.wette);
        p.gruende = pruefGruende(p, datum);
        if (p.geerbt) p.gruende.push("Anstoß aus der Vorzeile geerbt - prüfen");
        p.roh = rohText;
        erbe = { an: p.an_zeit, von: p.von };
        geparst.push(p);
      } else if (zeileSiehtNachWetteAus(rohText)) {
        // KEINE Zeile verschwindet still: unvollstaendig uebernehmen und
        // rot markieren, damit Karam sie von Hand fertig macht
        unklar++;
        const zahl = (rohText.match(/(\d{1,3})[.,](\d{1,2})(?!\d)/g) || []).pop();
        geparst.push({
          von: erbe ? erbe.von : "", an_zeit: (erbe && erbe.an) || (datum + "T12:00"),
          liga: "", spiel: rohText.slice(0, 90), wette: "", s: "SIEG",
          quote: zahl ? parseFloat(zahl.replace(",", ".")) : 0,
          roh: rohText,
          gruende: ["NICHT sicher erkannt - bitte Spiel, Wette und Quote von Hand eintragen oder Zeile löschen"]
        });
      }
    }
    if (unklar) meldungA("Foto " + nr + ": " + unklar + " Zeile(n) konnten nicht sauber gelesen " +
      "werden - sie stehen ROT in der Vorschau, damit nichts verloren geht.", "warn");
    for (const z of geparst) {
      const k = zeilenSchluessel(z);
      if (gesehen.has(k)) continue;   // Fotos ueberlappen sich oft - Doppelte fliegen raus
      gesehen.add(k);
      vorschauZeilen.push(z);
    }
  }
  vorschauZeigen();
}

function vorschauZeigen() {
  const box = elA(vorschauBox || "vorschau_" + vorschauDatum);
  if (!vorschauZeilen.length) {
    box.innerHTML = '<div class="warnkern"><b>Keine Zeilen erkannt.</b> Das Foto ist zu unscharf ' +
      "oder ein anderes Format - Zeilen lassen sich unten von Hand anlegen, oder ein besseres " +
      "Foto hochladen (Bildschirm-Screenshot liest sich am besten).</div>" + vorschauFussHtml();
    return;
  }
  const verdacht = vsDoppelVerdacht();
  let zeilen = "";
  vorschauZeilen.forEach((z, i) => {
    const gruende = (z.gruende || []).concat(verdacht[i] ? ["möglicherweise doppelt"] : []);
    const unvollstaendig = !z.wette || !z.quote || z.quote < 1.01;
    zeilen += "<tr" + (unvollstaendig ? " class='rohzeile'" : (gruende.length ? " class='ohneordner'" : "")) + ">" +
      "<td class='mini'" + (z.roh ? ' title="' + sicherA(z.roh) + '"' : "") + ">" +
      (gruende.length ? sicherA(gruende.join(", ")) : "") + "</td>" +
      '<td><input value="' + sicherA(z.an_zeit) + '" onchange="vsFeld(' + i + ',\'an_zeit\',this.value)" size="16"></td>' +
      '<td><input value="' + sicherA(z.von) + '" onchange="vsFeld(' + i + ',\'von\',this.value)" size="5"></td>' +
      '<td><input value="' + sicherA(z.liga) + '" onchange="vsFeld(' + i + ',\'liga\',this.value)" size="20"></td>' +
      '<td><input value="' + sicherA(z.spiel) + '" onchange="vsFeld(' + i + ',\'spiel\',this.value)" size="34"></td>' +
      '<td><input value="' + sicherA(z.wette) + '" onchange="vsFeld(' + i + ',\'wette\',this.value)" size="24"></td>' +
      '<td><select onchange="vsFeld(' + i + ',\'s\',this.value)">' +
        S_WAHL.map(x => "<option" + (z.s === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></td>" +
      '<td><input value="' + z.quote + '" onchange="vsFeld(' + i + ',\'quote\',this.value)" size="5">' +
        ((z.quoten && z.quoten.length > 1) ? ' <span class="mini">(+' + (z.quoten.length - 1) + " weitere)</span>" : "") + "</td>" +
      '<td><button onclick="vsWeg(' + i + ')">weg</button></td></tr>';
  });
  const fertigN = vorschauZeilen.filter(z => z.wette && z.quote >= 1.01).length;
  const offenN = vorschauZeilen.length - fertigN;
  box.innerHTML = '<div class="kern"><b>Vorschau: ' + vorschauZeilen.length + " Zeilen aus den Fotos (Satz vom " +
    sicherA(vorschauDatum) + ") - davon <span class='gruen'>" + fertigN + " vollständig</span>" +
    (offenN ? " und <span class='rot'>" + offenN + " zum Nacharbeiten (rot)</span>" : "") + ".</b> " +
    "<b class='rot'>Zähle auf den Fotos nach, ob die Anzahl stimmt!</b> " +
    "Fehlen Zeilen, ist das Foto zu klein oder unscharf - am besten Bildschirm-Screenshots in voller " +
    "Größe hochladen, notfalls die Tabelle in mehreren Ausschnitten. Bitte kurz vergleichen - jede Zelle " +
    "lässt sich direkt ändern. <b>Gelbe Zeilen</b> haben gleiche Zeit und Quote wie eine andere - " +
    "möglicherweise doppelt erkannt, bitte vergleichen. Übernommen wird erst mit dem grünen Knopf.</div>" +
    '<div class="tabellenrand"><table><thead><tr><th>Prüfen</th><th>Anstoß (UK-Zeit)</th><th>gemeldet</th>' +
    "<th>Liga</th><th>Spiel</th><th>Wette</th><th>Art</th><th>Quote</th><th></th></tr></thead><tbody>" +
    zeilen + "</tbody></table></div>" + vorschauFussHtml();
}

function vorschauFussHtml() {
  return '<p><button onclick="vsNeueZeile()">Zeile hinzufügen</button> ' +
    '<button class="haupt" onclick="vsUebernehmen()">Satz übernehmen: Ordner anlegen und überall anzeigen</button> ' +
    '<button onclick="elA(\'" + (vorschauBox || "vorschau_" + vorschauDatum) + "\').innerHTML=\'\'">abbrechen</button></p>';
}

function vsFeld(i, feld, wert) {
  if (!vorschauZeilen[i]) return;
  vorschauZeilen[i][feld] = (feld === "quote") ? (parseFloat(String(wert).replace(",", ".")) || 0) : wert;
}

function vsWeg(i) { vorschauZeilen.splice(i, 1); vsTrotzdem = false; vorschauZeigen(); }

function vsNeueZeile() {
  vorschauZeilen.push({ von: "", an_zeit: vorschauDatum + "T12:00", liga: "", spiel: "", wette: "", s: "SIEG", quote: 2.0 });
  vorschauZeigen();
}

async function vsUebernehmen() {
  const kaputt = vorschauZeilen.filter(z => !z.spiel || !z.wette || !z.quote || z.quote < 1.01 || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(z.an_zeit));
  if (kaputt.length) {
    meldungA("<b>" + kaputt.length + " Zeile(n) unvollständig</b> (Spiel, Wette, Quote ab 1.01 und " +
      "Anstoß im Format 2026-08-28T19:45 sind Pflicht). Bitte korrigieren oder die Zeile mit weg entfernen.", "warn");
    return;
  }
  if (!vorschauZeilen.length) { meldungA("Keine Zeilen zum Übernehmen.", "warn"); return; }
  // Gelbe Zeilen (Prüf-Gründe) nicht einfach durchwinken: erst warnen,
  // erst der zweite Klick übernimmt wirklich (Karams Zwei-Klick-Regel)
  const gelb = vorschauZeilen.filter((z, i) => (z.gruende && z.gruende.length) || vsDoppelVerdacht()[i]).length;
  if (gelb && !vsTrotzdem) {
    vsTrotzdem = true;
    meldungA("<b>" + gelb + " gelbe Zeile(n) mit Prüf-Hinweis!</b> Bitte erst mit den Fotos " +
      "vergleichen und korrigieren oder mit weg entfernen. Wenn wirklich alles stimmt: " +
      "den grünen Knopf noch einmal drücken.", "warn");
    return;
  }
  vsTrotzdem = false;
  const d = vorschauDatum.split("-");
  const titel = "Fotos vom " + d[2] + "." + d[1] + "." + d[0];
  const s = await supaSatzAnlegen(vorschauDatum, titel);
  if (s.error) { meldungA("Satz nicht angelegt: " + sicherA(s.error.message), "warn"); return; }
  // Was schon im Ordner steht, wird NICHT doppelt angelegt (Fotos nachschieben!)
  const daWetten = (await supaWettenLaden()).filter(w => w.satz === vorschauDatum);
  const daSchluessel = new Set(daWetten.map(w => zeilenSchluessel({
    an_zeit: w.an_zeit, quote: (Array.isArray(w.o) && w.o[0]) ? w.o[0][1] : 0, s: w.s, spiel: w.spiel })));
  let ok = 0, schonDa = 0;
  for (let i = 0; i < vorschauZeilen.length; i++) {
    const z = vorschauZeilen[i];
    if (daSchluessel.has(zeilenSchluessel(z))) { schonDa++; continue; }
    const optionen = (z.quoten && z.quoten.length > 1)
      ? z.quoten.map((q, k) => [k === 0 ? z.wette : "Option " + (k + 1), q])
      : [[z.wette, z.quote]];
    const r = await supaWetteAnlegen(vorschauDatum, { pos: daWetten.length + i + 1, von: z.von, an_zeit: z.an_zeit,
      liga: z.liga, spiel: z.spiel, wette: z.wette, kat: z.s, s: z.s,
      o: optionen });
    if (!r.error) ok++;
  }
  for (const up of vorschauUploads) await supaUploadStatus(up.id, "eingelesen");
  elA(vorschauBox || "vorschau_" + vorschauDatum).innerHTML = "";
  meldungA("<b>Satz vom " + sicherA(vorschauDatum) + ": " + ok + " Wetten übernommen" +
    (schonDa ? ", " + schonDa + " waren schon im Ordner (nicht doppelt angelegt)" : "") + ".</b> " +
    "Der Ordner steht ab sofort auf der Kombi-Tafel, im Kombi-Bau und in der Original-Tabelle - " +
    "über die Ordner-Leiste wählbar. Nachbearbeiten geht unten bei Sätze bearbeiten.", "gut");
  adminFotoSaetze();
  adminSaetze();
}

// ---------- Ordner-Werkzeuge (Suche, Aktivieren, Aufklappen) ----------

function satzSuche(wert) {
  const s = String(wert || "").toLowerCase().trim();
  for (const el2 of document.querySelectorAll("[data-such]")) {
    el2.style.display = (!s || el2.dataset.such.includes(s)) ? "" : "none";
  }
}

// Ein Klick macht diesen Ordner überall zum offenen Ordner
function satzAktivieren(id) {
  localStorage.setItem("kt_satz", id);
  meldungA("<b>Ordner aktiviert.</b> Er ist ab sofort überall der offene Ordner: " +
    '<a href="index.html"><b>zur Kombi-Tafel</b></a> &nbsp; ' +
    '<a href="kombis.html"><b>zum Kombi-Bau</b></a> &nbsp; ' +
    '<a href="original.html"><b>zur Original-Tabelle</b></a>', "gut");
  adminSaetze();
}

function satzAufklappen(id) {
  const d = elA("satzdetails_" + id);
  if (d) { d.open = true; d.scrollIntoView({ block: "start" }); }
}

async function tuSatzNeu() {
  const datum = elA("neusatz_datum").value;
  if (!datum) { meldungA("Bitte ein Datum wählen.", "warn"); return; }
  const t = elA("neusatz_titel").value.trim();
  const d = datum.split("-");
  const titel = t || ("Fotos vom " + d[2] + "." + d[1] + "." + d[0]);
  const r = await supaSatzAnlegen(datum, titel);
  if (r.error) { meldungA("Ordner nicht angelegt: " + sicherA(r.error.message), "warn"); return; }
  meldungA("Ordner <b>" + sicherA(titel) + "</b> angelegt - er erscheint sofort in der Ordner-Leiste. " +
    "Wetten unten hinzufügen oder Fotos zu diesem Datum hochladen und einlesen.", "gut");
  adminSaetze();
}

async function tuWette(id, feld, wert) {
  const felder = {}; felder[feld] = wert;
  if (feld === "s") felder.kat = wert;
  if (feld === "an_zeit") felder.an_korrigiert = null;   // die neue Zeit gilt
  const r = await supaWetteAendern(id, felder);
  if (r.error || !r.data || !r.data.length) meldungA("Nicht gespeichert (nur Admins ändern Sätze).", "warn");
}

async function tuWetteQuote(id, wert) {
  const q = parseFloat(String(wert).replace(",", "."));
  if (!q || q < 1.01) { meldungA("Quote ab 1.01 bitte.", "warn"); return; }
  // Nur die ERSTE Quote aendern - weitere Optionen der Wette bleiben erhalten
  const w = (await supa.from("kt_wetten").select("wette, o").eq("id", id).maybeSingle()).data;
  const o = (w && Array.isArray(w.o) && w.o.length) ? w.o.slice() : [[(w && w.wette) || "", q]];
  o[0] = [o[0][0], q];
  const r = await supaWetteAendern(id, { o: o });
  if (r.error || !r.data || !r.data.length) meldungA("Quote nicht gespeichert.", "warn");
}

async function tuWetteWeg(id) {
  const r = await supaWetteLoeschen(id);
  if (r.error || !r.data || !r.data.length) { meldungA("Nicht gelöscht.", "warn"); return; }
  adminSaetze();
}

async function tuWetteNeu(satzId) {
  const r = await supaWetteAnlegen(satzId, { pos: 999, von: "", an_zeit: satzId + "T12:00",
    liga: "", spiel: "Neues Spiel A vs B", wette: "A (Win)", kat: "SIEG", s: "SIEG", o: [["A (Win)", 2.0]] });
  if (r.error) { meldungA("Nicht angelegt: " + sicherA(r.error.message), "warn"); return; }
  adminSaetze();
}

async function tuSatzWeg(id) {
  const knopf = elA("satzweg_" + id);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = "Wirklich? Alle Wetten des Satzes weg!";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supaSatzLoeschen(id);
  if (r.error || !r.data || !r.data.length) { meldungA("Nicht gelöscht.", "warn"); return; }
  meldungA("Satz gelöscht.", "gut");
  adminSaetze();
}

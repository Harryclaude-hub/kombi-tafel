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
  <input id="neusatz_zusatz" placeholder="Zusatz, z.B. abend" size="12">
  <input id="neusatz_titel" placeholder="Titel (leer = Fotos vom Datum)" size="24">
  <button class="haupt" onclick="tuSatzNeu()">&#10133; Ordner anlegen</button>
  <p class="mini">Am selben Tag mehrere Ordner? Dann einen <b>Zusatz</b> eintragen
  (zum Beispiel "frueh" und "abend"). Ohne Zusatz heisst der Ordner einfach nach dem Datum.</p></div>
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
      (fotos.length ? ' <button class="haupt" onclick="satzScannen(\'' + sicherA(s.id) + '\')">&#128270; ' +
        "Ordner scannen (" + fotos.length + " Foto" + (fotos.length === 1 ? "" : "s") + ")</button>" : "") +
      (fotos.length ? ' <button onclick="satzEinlesen(\'' + sicherA(s.id) + '\')" ' +
        'title="Der alte Weg: die Texterkennung im Browser. Sie liest diese Tabellen sehr schlecht.">' +
        "&#128269; alt: selbst einlesen</button>" : "") +
      ' <button onclick="tuWetteNeu(\'' + sicherA(s.id) + '\')">&#10133; Wette von Hand</button>' +
      ' <button id="satzweg_' + sicherA(s.id) + '" onclick="tuSatzWeg(\'' + sicherA(s.id) + '\')">&#128465; Ordner löschen</button>' +
      "</div>" +
      '<div id="scan_' + sicherA(s.id) + '"></div>' +
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
    (ok ? " <b>Das Einlesen startet jetzt von selbst...</b>" : ""), ok || doppelt ? "gut" : "warn");
  await adminSaetze();
  if (ok) {
    // DER DURCHLAUF: neue Fotos -> sofort einlesen. Saubere Zeilen gehen
    // automatisch in die Datenbank; nur Unklares wartet auf Karam.
    durchlaufDatum = datum;
    satzAufklappen(datum);
    satzEinlesen(datum);
  }
}

// ============================================================
// DER DURCHLAUF: Fotos hochladen, und alles Weitere passiert
// von selbst - einlesen, saubere Zeilen uebernehmen, Ordner
// aktivieren. Damit stehen Kombi-Tafel, Kombi-Bau und die
// Original-Tabelle ohne einen weiteren Klick.
// Nur Zeilen mit Pruef-Gruenden bleiben in der Vorschau stehen:
// bei echtem Geld winkt der Durchlauf nichts Unsicheres durch.
// ============================================================
let durchlaufDatum = null;

function zeileIstSauber(z, verdachtHier) {
  return z.spiel && z.wette && z.quote && z.quote >= 1.01 &&
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(z.an_zeit) &&
    !(z.gruende && z.gruende.length) && !verdachtHier;
}

async function durchlaufWeiter() {
  if (durchlaufDatum !== vorschauDatum) return;
  durchlaufDatum = null;
  if (!vorschauZeilen.length) return;   // vorschauZeigen erklaert das schon
  const verdacht = vsDoppelVerdacht();
  const saubere = [], unklare = [];
  vorschauZeilen.forEach((z, i) => (zeileIstSauber(z, verdacht[i]) ? saubere : unklare).push(z));

  if (!saubere.length) {
    meldungA("<b>Durchlauf angehalten:</b> keine der " + vorschauZeilen.length +
      " Zeilen ist eindeutig - bitte in der Vorschau prüfen.", "warn");
    return;
  }

  // Die sauberen Zeilen gehen sofort in die Datenbank
  vorschauZeilen = saubere;
  vsTrotzdem = false;
  const erg = await vsUebernehmen();
  // Ging beim Speichern etwas schief, darf der Durchlauf NICHT weiterlaufen
  // und schon gar nicht den Ordner aktivieren: sonst stuende gruen "fertig",
  // waehrend die Zeilen gar nicht in der Datenbank sind. vsUebernehmen hat
  // die rote Meldung dazu bereits ausgegeben.
  if (!erg || erg.fehler) return;

  if (!unklare.length) {
    // Alles sauber: Ordner gleich aktivieren - der Durchlauf ist komplett
    satzAktivieren(vorschauDatum);
    meldungA("<b>&#9989; Durchlauf fertig: " + saubere.length + " Wetten eingelesen, " +
      "Ordner aktiv.</b> Alles steht bereit: " +
      '<a href="index.html"><b>Kombi-Tafel</b></a> &nbsp; ' +
      '<a href="kombis.html"><b>Kombi-Bau</b></a> (baut die Dreier von selbst) &nbsp; ' +
      '<a href="original.html"><b>Original-Tabelle</b></a>', "gut");
    return;
  }

  // Unklares bleibt in der Vorschau stehen - nichts geht verloren
  // Warten, bis die Ordner-Neuzeichnung durch ist, sonst wischt sie die Vorschau weg
  await new Promise(r => setTimeout(r, 1800));
  vorschauZeilen = unklare;
  vorschauZeigen();
  meldungA("<b>" + saubere.length + " saubere Zeilen sind schon drin.</b> " +
    unklare.length + " Zeile(n) brauchen noch deinen Blick (unten in der Vorschau): " +
    "korrigieren oder mit weg entfernen, dann den grünen Knopf drücken. " +
    "Danach den Ordner aktivieren.", "warn");
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
  // Stehen mehrere Quoten in einer Zeile (z. B. 2,25 / 2,50), kommen ALLE mit -
  // ABER nicht die Interwetten-Spalte. Sie ist keine zweite Wettmoeglichkeit,
  // sondern dieselbe Quote nach Abzug der 5 Prozent (G geteilt durch 1,05).
  const geteilt = quotenTeilen(quoten.filter(q => q >= 1.01 && q <= 1000), wette);
  const alle = geteilt.q;
  // Die fuehrende Quote muss aus der bereinigten Liste kommen. Vorher fuehrte
  // schlicht das letzte Zahlenfeld der Zeile - und das war meistens die
  // schon gekuerzte Interwetten-Zahl.
  // Die fuehrende Quote ist die ERSTE Linie, nicht die letzte Zahl der
  // Zeile: rechts stehen jetzt die Mindestquoten.
  const fuehrend = alle.length ? alle[0] : quote;
  return { von: von, an_zeit: an, liga: liga, spiel: spiel, wette: wette,
    s: artErkennen(wette), quote: fuehrend, quoten: alle.length > 1 ? alle : null,
    mind: geteilt.m, geerbt: geerbt };
}

// Wirft aus einer Quotenliste jede Zahl heraus, die eine andere Zahl
// geteilt durch 1,05 ist. Genau so entsteht Saschas Spalte H aus Spalte G.
// 0,02 Spielraum, weil in der Tabelle auf zwei Stellen gerundet wird.
// Beispiel aus Zeile 1.01: aus [2.30, 2.19] bleibt [2.30] (2.30/1.05 = 2.19).
// Aus zwei echten Optionen wie [2.25, 2.50] bleiben beide stehen
// (2.50/1.05 = 2.38, 2.25/1.05 = 2.14 - keine trifft die andere).
// WARUM GEGEN DIE ZULETZT BEHALTENE ZAHL UND NICHT GEGEN ALLE:
// Beim Durchrechnen fiel eine Kette auf. Verglichen mit ALLEN Zahlen
// waere aus [2.10, 2.00, 1.90] nur noch [2.10] geworden: erst faellt 2.00
// als Abzug von 2.10, dann 1.90 als Abzug von 2.00 - obwohl 2.00 da
// schon draussen war. Verglichen wird deshalb immer nur mit der zuletzt
// BEHALTENEN Zahl. Dann bleibt [2.10, 1.90] stehen, und aus
// [3.00, 2.86, 1.50, 1.43] (zwei Optionen mit je ihrer Abzugsspalte)
// wird richtig [3.00, 1.50].
// ---------- Die zwei Quotenspalten (gemessen am Foto vom 30.08.2026) ----------
// Eine Zeile im Foto hat rechts ZWEI Quotenblöcke:
//   OVER (2.25, 2.5)   1.94 / 2.20   1.85 / 2.10
// Links die Quoten, rechts die Mindestquoten, paarweise in derselben
// Reihenfolge: 2.25 gehoert 1.94 und 1.85, 2.5 gehoert 2.20 und 2.10.
// Frueher hat ohneGebuehrenspalte() die rechte Zahl weggeworfen, weil sie
// ungefaehr Quote/1,05 ist - deshalb kam nie eine Mindestquote an.

// Wie viele Linien nennt der Wett-Text? "OVER (2.25, 2.5)" -> 2, sonst 1.
function linienZahl(wette) {
  const t = String(wette || "");
  const auf = t.indexOf("("), zu = t.lastIndexOf(")");
  if (auf < 0 || zu <= auf) return 1;
  const teile = t.slice(auf + 1, zu).split(",").map(x => x.trim()).filter(Boolean);
  return teile.length || 1;
}

// Zahlen einer Zeile in Quoten und Mindestquoten aufteilen.
function quotenTeilen(liste, wette) {
  const n = linienZahl(wette);
  const l = (liste || []).slice();
  if (l.length === 2 * n) return { q: l.slice(0, n), m: l.slice(n) };
  if (l.length === n) return { q: l, m: [] };
  // Zahl passt nicht zur Zahl der Linien: nichts erfinden. Lieber ohne
  // Mindestquote - dann greift der Ersatzwert, statt dass eine falsche
  // Grenze in die Rechnung kommt.
  return { q: l.slice(0, Math.max(1, n)), m: [] };
}

// [Linie, Quote, Mindestquote] - der dritte Platz nur, wenn es ihn gibt.
function optionenBauen(wette, q, m) {
  return (q || []).map((wert, k) => {
    const name = (k === 0) ? wette : "Option " + (k + 1);
    return (m && m[k]) ? [name, wert, m[k]] : [name, wert];
  });
}

function ohneGebuehrenspalte(liste) {
  if (!liste || liste.length < 2) return liste || [];
  const raus = [];
  for (const q of liste) {
    // Dieselbe Zahl zweimal ist keine zweite Wettmoeglichkeit.
    if (raus.some(x => Math.abs(x - q) < 0.001)) continue;
    const letzte = raus.length ? raus[raus.length - 1] : null;
    if (letzte !== null && Math.abs(q - letzte / 1.05) <= 0.02) continue;
    raus.push(q);
  }
  return raus;
}

function artErkennen(wette) {
  const t = String(wette || "");
  // Beide Mannschaften treffen: stand frueher gar nicht drin und landete
  // deshalb faelschlich unter SIEG (an Karams Fotos vom 27.08. aufgefallen).
  if (/\bBTTS\b|beide\s+treffen|both\s+teams/i.test(t)) return "BTTS";
  if (/DN[BE]/i.test(t)) return "DNB";
  if (/\(DC|\bDC\b/i.test(t)) return "DC";
  // Ueber/Unter VOR dem Handicap pruefen: "OVER (2.5, 3)" hat Klammern und
  // Zahlen und waere sonst als Handicap durchgegangen.
  if (/\bover\b|\bunder\b|ber\s|tore|\bo\d|\bu\d/i.test(t)) return "TORE";
  if (/eck|corner/i.test(t)) return "ECKEN";
  if (/[+-]\s?\d+[.,]?\d*\s*A[HIl]?/i.test(t) || /\([+-]/.test(t) || /\d[.,]5\s*AH/i.test(t)) return "ASIA";
  // Handicap OHNE Vorzeichen hinter HOME/AWAY, zum Beispiel
  // "AWAY (0.5, 0.75)" - dieser Fall fehlte und galt als SIEG.
  if (/\b(home|away)\b[^a-z0-9]*\(?\s*[+-]?\d/i.test(t)) return "ASIA";
  // Vorgabe direkt hinter dem Namen, wie beim Basketball: "Swiss +9,5".
  if (/[+-]\s?\d+([.,]\d+)?\s*$/.test(t)) return "ASIA";
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
  if (durchlaufDatum === null) durchlaufDatum = datum;   // Knopf = gleicher Durchlauf
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
  durchlaufWeiter();
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
  const daSchluessel = new Set(daWetten.map(satzSchluessel));
  let ok = 0, schonDa = 0, fehler = 0, ersterFehler = "";
  for (let i = 0; i < vorschauZeilen.length; i++) {
    const z = vorschauZeilen[i];
    if (daSchluessel.has(satzSchluessel(z))) { schonDa++; continue; }
    const optionen = optionenBauen(z.wette,
      (z.quoten && z.quoten.length) ? z.quoten : [z.quote], z.mind);
    const r = await supaWetteAnlegen(vorschauDatum, { pos: daWetten.length + i + 1, von: z.von, an_zeit: z.an_zeit,
      liga: z.liga, spiel: z.spiel, wette: z.wette, kat: z.s, s: z.s,
      o: optionen });
    if (!r.error) ok++;
    // Frueher wurde ein Fehlschlag hier nur NICHT mitgezaehlt und sonst
    // verschwiegen. Dann stand gruen "45 Wetten uebernommen", obwohl
    // keine einzige in der Datenbank war.
    else { fehler++; if (!ersterFehler) ersterFehler = String(r.error.message || r.error); }
  }
  // Die Fotos gelten NUR als eingelesen, wenn wirklich alles durchging.
  // Sonst verschwaende der Hinweis "X noch nicht eingelesen" und niemand
  // wuesste, dass etwas nachzutragen ist.
  if (!fehler) { for (const up of vorschauUploads) await supaUploadStatus(up.id, "eingelesen"); }
  elA(vorschauBox || "vorschau_" + vorschauDatum).innerHTML = "";
  if (fehler) {
    meldungA("<b>Achtung: " + fehler + " von " + (ok + fehler) + " Zeilen sind NICHT " +
      "gespeichert worden.</b> " + sicherA(ersterFehler.slice(0, 120)) + " - die Fotos bleiben " +
      "auf \"noch nicht eingelesen\" stehen, du kannst es also einfach noch einmal versuchen. " +
      "Die " + ok + " gespeicherten Zeilen stehen schon im Ordner und werden beim naechsten " +
      "Versuch nicht doppelt angelegt.", "warn");
  } else {
    meldungA("<b>Satz vom " + sicherA(vorschauDatum) + ": " + ok + " Wetten übernommen" +
      (schonDa ? ", " + schonDa + " waren schon im Ordner (nicht doppelt angelegt)" : "") + ".</b> " +
      "Der Ordner steht ab sofort auf der Kombi-Tafel, im Kombi-Bau und in der Original-Tabelle - " +
      "über die Ordner-Leiste wählbar. Nachbearbeiten geht unten bei Sätze bearbeiten.", "gut");
  }
  adminFotoSaetze();
  adminSaetze();
  return { ok: ok, schonDa: schonDa, fehler: fehler, grund: ersterFehler };
}

// Der Vergleichsschluessel fuer "steht schon im Ordner". Er benutzt nur
// Felder, die beim Speichern und beim Wiederlesen GENAU gleich bleiben:
// Anstosszeit, Spiel und Wette. Die Quote bleibt bewusst draussen (siehe
// die Erklaerung oben bei daSchluessel).
function satzSchluessel(w) {
  const norm = t => String(t == null ? "" : t).toLowerCase().replace(/[^a-z0-9]/g, "");
  return String(w.an_zeit) + "|" + norm(w.spiel) + "|" + norm(w.wette);
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
  // Der Zusatz macht aus einem Datum mehrere Ordner: 2026-08-27-abend.
  // Nur Buchstaben, Ziffern und Bindestrich, damit die Kennung sauber bleibt.
  const zusatzFeld = elA("neusatz_zusatz");
  const zusatz = zusatzFeld ? zusatzFeld.value.trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) : "";
  const kennung = zusatz ? datum + "-" + zusatz : datum;
  const t = elA("neusatz_titel").value.trim();
  const d = datum.split("-");
  const titel = t || ("Fotos vom " + d[2] + "." + d[1] + "." + d[0] + (zusatz ? " (" + zusatz + ")" : ""));
  const r = await supaSatzAnlegen(kennung, titel);
  if (r.error) { meldungA("Ordner nicht angelegt: " + sicherA(r.error.message), "warn"); return; }
  meldungA("Ordner <b>" + sicherA(titel) + "</b> angelegt (Kennung " + sicherA(kennung) + ") - " +
    "er erscheint sofort in der Ordner-Leiste. Fotos hineinlegen und dann auf " +
    "<b>Ordner scannen</b> drücken.", "gut");
  if (zusatzFeld) zusatzFeld.value = "";
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

// ============================================================
// ORDNER SCANNEN: Karam laesst die Fotos von Claude lesen.
//
// Warum ueberhaupt: die Texterkennung im Browser (Tesseract) liest
// diese Tabellen nicht. Gemessen am 28.08. an einem echten Foto:
// sie fand die 12 Zeilen, aber KEINE EINZIGE war brauchbar - aus
// "The New Saints FC" wurde "The New Sarmts FC", aus "19:45" wurde
// "19 45". Bei Quoten und Anstosszeiten ist das mit echtem Geld
// nicht zu gebrauchen. Deshalb dieser Weg.
//
// Der Ablauf in drei Schritten:
//   1. Knopf druecken: es erscheint ein fertiger Satz zum Kopieren.
//   2. Claude liest die Fotos und gibt die Zeilen zurueck.
//   3. Zeilen hier einfuegen, pruefen lassen, uebernehmen.
// Es wird NICHTS uebernommen, was nicht vollstaendig ist - lieber
// eine Zeile weniger als eine falsche Quote.
// ============================================================

const SCAN_TRENNER = /\t|\s*\|\s*/;
let scanGeprueft = {};   // Ordner -> gepruefte Zeilen

function satzScannen(ordner) {
  const box = elA("scan_" + ordner);
  if (!box) return;
  if (box.dataset.offen === "1") { box.innerHTML = ""; box.dataset.offen = ""; return; }
  box.dataset.offen = "1";
  // Der vollstaendige Auftrag. Er enthaelt ALLES, was Claude braucht, um
  // die Arbeit ohne Rueckfrage zu Ende zu bringen: wo die Fotos liegen,
  // was gelesen werden soll, in welcher Form es in die Datenbank gehoert
  // und was ausdruecklich NICHT eingetragen wird. Karam soll nichts mehr
  // einfuegen muessen - die Zeilen landen direkt im Ordner, und der
  // Kombi-Bau rechnet danach von selbst weiter.
  const satz = [
    "Bitte lies den Ordner " + ordner + " der Kombi-Tafel ein und trag die Zeilen selbst ein.",
    "",
    "WO DIE FOTOS LIEGEN: Supabase-Projekt mqmevpyatjsambervgtu, Tabelle kt_satz_uploads,",
    "Spalte satz_datum = " + ordner + ". Sie stehen dort als Daten-URL und sind nur fuer",
    "Admins lesbar. Sieh sie dir wirklich an, Bild fuer Bild.",
    "",
    "WAS ICH BRAUCHE:",
    "1. Lies JEDE Zeile von JEDEM Foto. Keine Zeile ueberspringen.",
    "2. Die Fotos ueberlappen sich oft - dieselbe Zeile darf nur EINMAL hinein.",
    "3. Je Zeile: Melder, Anstoss, Liga, Spiel, Wette, Quote.",
    "4. Stehen mehrere Quoten in einer Zeile (mit Schraegstrich getrennt), ist das EINE",
    "   Wette mit mehreren Optionen - alle Werte mitnehmen.",
    "5. Trag NUR die erste Quotenspalte ein, also die Rohquote. Die Interwetten-Spalte",
    "   daneben NICHT eintragen: die rechnet das Programm selbst (geteilt durch 1,05).",
    "",
    "EINTRAGEN in die Tabelle kt_wetten mit satz = " + ordner + ", dazu pos, von,",
    "an_zeit im Format 2026-08-29T15:00, liga, spiel, wette, kat und s (die Wettart",
    "nach artErkennen aus admin.js) und o als Liste [[Name, Quote], ...].",
    "Danach die Fotos in kt_satz_uploads auf status eingelesen setzen und gelesen_am fuellen.",
    "",
    "WICHTIG: rate NICHTS. Ist eine Zeile abgeschnitten oder unleserlich, lass sie weg",
    "und sag mir am Ende genau, welche fehlt und warum. Lieber eine Zeile weniger als",
    "eine falsche Quote - hier haengt echtes Geld dran.",
    "",
    "Sag mir zum Schluss, wie viele Zeilen jetzt im Ordner stehen."
  ].join("\n");
  box.innerHTML =
    '<div class="scankasten">' +
    "<h3>&#128270; Ordner scannen</h3>" +
    '<p class="mini">Die Texterkennung im Browser liest diese Tabellen nicht zuverlässig ' +
    "(gemessen: 0 von 12 Zeilen brauchbar). Deshalb liest <b>Claude</b> die Fotos.</p>" +
    '<ol class="scanschritte">' +
    "<li><b>Diesen Auftrag an Claude schicken</b> (er macht dann alles allein):<br>" +
    '<button class="haupt" onclick="scanSatzKopieren(\'' + sicherA(ordner) + '\')">' +
    "&#128203; Auftrag kopieren</button>" +
    '<pre id="scan_satz_' + sicherA(ordner) + '" class="scanauftrag">' + sicherA(satz) + "</pre></li>" +
    "<li>Claude liest die Fotos und trägt die Zeilen <b>selbst</b> in diesen Ordner ein. " +
    "Danach hier nachsehen:<br>" +
    '<button onclick="scanNachsehen(\'' + sicherA(ordner) + '\')">' +
    "&#128260; Nachsehen, ob die Zeilen da sind</button></li>" +
    "<li class='mini'><b>Nur als Rückweg</b>, falls du die Zeilen doch als Text bekommst: " +
    "hier einfügen und prüfen lassen.<br>" +
    '<textarea id="scan_text_' + sicherA(ordner) + '" rows="8" spellcheck="false" ' +
    'placeholder="Melder | Anstoß | Liga | Spiel | Wette | Quoten"></textarea><br>' +
    '<button class="haupt" onclick="scanPruefen(\'' + sicherA(ordner) + '\')">' +
    "&#128269; Zeilen prüfen</button></li></ol>" +
    '<div id="scan_ergebnis_' + sicherA(ordner) + '"></div></div>';
}

function scanSatzKopieren(ordner) {
  const c = elA("scan_satz_" + ordner);
  if (!c) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(c.textContent).then(
      () => meldungA("Satz kopiert - jetzt bei Claude einfügen.", "gut"),
      () => meldungA("Kopieren ging nicht - bitte den Satz von Hand markieren.", "warn"));
  } else {
    meldungA("Dieser Browser kann nicht selbst kopieren - bitte den Satz von Hand markieren.", "warn");
  }
}

// Wandelt eine Anstoss-Angabe in das Format des Programms um.
// Erlaubt: 2026-08-29T15:00 | 2026-08-29 15:00 | 29.08.2026 15:00
//          29/08/2026 15:00 | 29-08-2026, 15:00
function scanZeit(roh) {
  const t = String(roh || "").trim().replace(/,/g, " ").replace(/\s+/g, " ");
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2})[:.h](\d{2})$/i);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") +
    "T" + m[4].padStart(2, "0") + ":" + m[5];
  m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\s+(\d{1,2})[:.h](\d{2})$/i);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") +
    "T" + m[4].padStart(2, "0") + ":" + m[5];
  return null;
}

// Mehrere Quoten je Zeile sind erlaubt (eine Wette mit mehreren Optionen).
function scanQuoten(roh) {
  return String(roh || "").split(/[\/;]/).map(x => {
    const z = parseFloat(String(x).trim().replace(",", "."));
    return isFinite(z) ? Math.round(z * 1000) / 1000 : null;
  }).filter(z => z !== null && z >= 1.01 && z < 1000);
}

async function scanPruefen(ordner) {
  const ziel = elA("scan_ergebnis_" + ordner);
  const feld = elA("scan_text_" + ordner);
  if (!ziel || !feld) return;
  const roh = feld.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!roh.length) { ziel.innerHTML = '<div class="warnkern">Nichts eingefügt.</div>'; return; }

  // Was schon im Ordner steht, wird NICHT doppelt angelegt.
  const daWetten = (await supaWettenLaden()).filter(w => w.satz === ordner);
  const bekannt = new Set(daWetten.map(w => (w.spiel + "|" + w.wette + "|" + w.an_zeit).toLowerCase()));

  const gut = [], schlecht = [], doppelt = [];
  roh.forEach((zeile, i) => {
    const nr = i + 1;
    if (/^\s*(melder|von)\s*(\||\t)/i.test(zeile)) return;   // Kopfzeile darf mit drin sein
    const f = zeile.split(SCAN_TRENNER).map(x => x.trim());
    if (f.length < 6) { schlecht.push([nr, "nur " + f.length + " Felder statt 6", zeile]); return; }
    const von = f[0], liga = f[2], spiel = f[3], wette = f[4];
    const an = scanZeit(f[1]);
    const quoten = scanQuoten(f[5]);
    if (!an) { schlecht.push([nr, "Anstoß nicht lesbar: " + f[1], zeile]); return; }
    if (!spiel) { schlecht.push([nr, "Spiel fehlt", zeile]); return; }
    if (!wette) { schlecht.push([nr, "Wette fehlt", zeile]); return; }
    if (!quoten.length) { schlecht.push([nr, "keine gültige Quote (ab 1.01)", zeile]); return; }
    const key = (spiel + "|" + wette + "|" + an).toLowerCase();
    if (bekannt.has(key)) { doppelt.push(nr); return; }
    bekannt.add(key);
    const geteilt = quotenTeilen(quoten, wette);
    gut.push({ von: von || "?", an_zeit: an, liga: liga, spiel: spiel, wette: wette,
      s: artErkennen(wette), quoten: geteilt.q, mind: geteilt.m });
  });
  scanGeprueft[ordner] = gut;

  let h = '<div class="' + (schlecht.length ? "warnkern" : "kern") + '"><b>' + roh.length +
    " Zeilen eingefügt:</b> " + gut.length + " in Ordnung" +
    (doppelt.length ? ", " + doppelt.length + " stehen schon im Ordner" : "") +
    (schlecht.length ? ", <b>" + schlecht.length + " mit Problem</b>" : "") + ".</div>";
  if (schlecht.length) {
    h += "<p><b>Diese Zeilen werden NICHT übernommen:</b></p><ul class='mini'>";
    for (const x of schlecht.slice(0, 12))
      h += "<li>Zeile " + x[0] + ": " + sicherA(x[1]) + "<br><code>" +
        sicherA(String(x[2]).slice(0, 110)) + "</code></li>";
    if (schlecht.length > 12) h += "<li>... und " + (schlecht.length - 12) + " weitere</li>";
    h += "</ul>";
  }
  if (gut.length) {
    h += '<div class="tabellenrand"><table><thead><tr><th>Melder</th><th>Anstoß</th><th>Liga</th>' +
      "<th>Spiel</th><th>Wette</th><th>Art</th><th>Quoten</th></tr></thead><tbody>";
    for (const z of gut.slice(0, 60))
      h += "<tr><td>" + sicherA(z.von) + "</td><td class='mini'>" + sicherA(z.an_zeit) +
        "</td><td>" + sicherA(z.liga) + "</td><td>" + sicherA(z.spiel) + "</td><td>" +
        sicherA(z.wette) + "</td><td>" + z.s + "</td><td>" + z.quoten.join(" / ") +
        ((z.mind && z.mind.length) ? '<div class="mini">Mindest ' + z.mind.join(" / ") + "</div>" : "") +
        "</td></tr>";
    h += "</tbody></table></div>";
    if (gut.length > 60) h += '<p class="mini">(nur die ersten 60 gezeigt, übernommen werden alle ' +
      gut.length + ")</p>";
    h += '<p><button class="haupt" onclick="scanUebernehmen(\'' + sicherA(ordner) + '\')">' +
      "&#9989; Diese " + gut.length + " Zeilen übernehmen</button></p>";
  }
  ziel.innerHTML = h;
}

async function scanUebernehmen(ordner) {
  const gut = scanGeprueft[ordner] || [];
  if (!gut.length) { meldungA("Nichts zu übernehmen.", "warn"); return; }
  const ziel = elA("scan_ergebnis_" + ordner);
  if (ziel) ziel.innerHTML = '<div class="kern">Wird gespeichert...</div>';

  // Den Ordner sicherheitshalber anlegen (er kann auch nur aus Fotos bestehen)
  const t = String(ordner).split("-");
  const titel = (t.length >= 3 && /^\d{4}$/.test(t[0]))
    ? "Fotos vom " + t[2] + "." + t[1] + "." + t[0] + (t[3] ? " (" + t.slice(3).join("-") + ")" : "")
    : String(ordner);
  await supaSatzAnlegen(ordner, titel);
  const daWetten = (await supaWettenLaden()).filter(w => w.satz === ordner);

  let ok = 0;
  const fehler = [];
  for (let i = 0; i < gut.length; i++) {
    const z = gut[i];
    const o = optionenBauen(z.wette, z.quoten, z.mind);
    const r = await supaWetteAnlegen(ordner, { pos: daWetten.length + i + 1, von: z.von,
      an_zeit: z.an_zeit, liga: z.liga, spiel: z.spiel, wette: z.wette,
      kat: z.s, s: z.s, o: o });
    if (r.error) fehler.push(z.spiel + ": " + r.error.message);
    else ok++;
  }
  await supa.from("kt_satz_uploads")
    .update({ status: "eingelesen", gelesen_am: new Date().toISOString() })
    .eq("satz_datum", ordner);

  scanGeprueft[ordner] = [];
  meldungA("<b>" + ok + " von " + gut.length + " Zeilen im Ordner " + sicherA(ordner) + ".</b>" +
    (fehler.length ? " <b>" + fehler.length + " NICHT gespeichert:</b> " +
      sicherA(fehler.slice(0, 2).join("; ")) : "") +
    " Der Ordner steht jetzt auf der Kombi-Tafel, im Kombi-Bau und in der Original-Tabelle.",
    fehler.length ? "warn" : "gut");
  await zeichneOrdner();
}

// Nachsehen, ob Claude die Zeilen inzwischen eingetragen hat. Zeigt
// ehrlich, was WIRKLICH im Ordner steht, und bietet danach das
// Aktivieren an - erst damit erscheint der Ordner auf der Kombi-Tafel,
// im Kombi-Bau und in der Original-Tabelle.
async function scanNachsehen(ordner) {
  const ziel = elA("scan_ergebnis_" + ordner);
  if (!ziel) return;
  ziel.innerHTML = '<div class="kern">Sehe nach...</div>';
  const wetten = (await supaWettenLaden()).filter(w => w.satz === ordner);
  if (!wetten.length) {
    ziel.innerHTML = '<div class="warnkern"><b>Noch keine Zeile im Ordner.</b> ' +
      "Entweder ist Claude noch nicht fertig, oder der Auftrag ist noch nicht abgeschickt. " +
      "Gleich noch einmal nachsehen.</div>";
    return;
  }
  const melder = {};
  for (const w of wetten) melder[w.von || "?"] = (melder[w.von || "?"] || 0) + 1;
  const offen = localStorage.getItem("kt_satz") === ordner;
  ziel.innerHTML = '<div class="kern"><b>&#9989; ' + wetten.length +
    " Zeilen stehen im Ordner " + sicherA(ordner) + ".</b> Nach Melder: " +
    Object.entries(melder).map(x => sicherA(x[0]) + " " + x[1]).join(", ") + ".</div>" +
    (offen
      ? '<p class="mini gruen">Dieser Ordner ist bereits überall offen. ' +
        '<a href="kombis.html"><b>Zum Kombi-Bau</b></a></p>'
      : '<p><button class="haupt" onclick="satzAktivieren(\'' + sicherA(ordner) + '\')">' +
        "&#9989; Diesen Ordner jetzt aktivieren</button> " +
        '<span class="mini">Danach steht er auf der Kombi-Tafel, im Kombi-Bau und in der ' +
        "Original-Tabelle.</span></p>");
}

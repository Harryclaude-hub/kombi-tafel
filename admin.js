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
<h2>Foto-Sätze der Homebase hochladen</h2>
<p class="mini">Jede Foto-Lieferung ist ein eigener Ordner mit Datum, für ALLE Nutzer gleich
(die Homebase). Du laedst die Fotos hier hoch, Claude liest sie beim nächsten Auftrag ein und
legt daraus den neuen Satz in der Kombi-Tafel an. <b>Sätze mischen sich nie.</b>
Jeder Admin sieht hier auch die Uploads der anderen Admins.</p>
<div id="adm_fotos"></div>
<div id="adm_vorschau"></div>
<h2>Sätze bearbeiten</h2>
<p class="mini">Jeder eingelesene Satz lässt sich hier jederzeit nachbearbeiten: Einträge
ändern, löschen oder neue hinzufügen. Die Tafel, der Kombi-Bau und die Original-Tabelle
ziehen sofort mit. Der feste Satz vom 24.08. liegt im Programm selbst und bleibt wie er ist.</p>
<div id="adm_saetze"></div>
<h2>Alle User</h2>
<p class="mini">Löschen entfernt ein Konto RESTLOS - samt allem, was der User angelegt hat,
auch in geteilten Bereichen. Der Knopf will zur Sicherheit zweimal gedrückt werden.
Admins ernennst du mit "zum Admin machen" - auch das fragt zweimal.</p>
<div id="adm_user"></div>`;
  await adminFotoSaetze();
  await adminSaetze();
  await adminUserliste();
}

// ---------- Foto-Sätze ----------

async function adminFotoSaetze() {
  const box = elA("adm_fotos");
  if (!box) return;
  const uploads = await supaSatzUploadsLaden();
  const gruppen = {};
  for (const u of uploads) {
    gruppen[u.satz_datum] = gruppen[u.satz_datum] || { n: 0, wartet: 0 };
    gruppen[u.satz_datum].n++;
    if (u.status === "wartet") gruppen[u.satz_datum].wartet++;
  }
  let liste = "";
  for (const datum of Object.keys(gruppen)) {
    const g = gruppen[datum];
    liste += "<li><b>Satz vom " + sicherA(datum) + "</b>: " + g.n + " Foto(s), " +
      (g.wartet ? '<span class="rot">' + g.wartet + " warten</span> " +
        '<button class="haupt" onclick="satzEinlesen(\'' + sicherA(datum) + '\')">Jetzt im Programm einlesen</button>'
                : '<span class="gruen">eingelesen</span> ' +
        '<button onclick="satzEinlesen(\'' + sicherA(datum) + '\')">noch einmal einlesen</button>') + "</li>";
  }
  const d = new Date();
  const heute = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
  box.innerHTML =
    '<label>Datum des Satzes: <input type="date" id="satz_datum" value="' + heute + '"></label> ' +
    '<label class="fotoknopf">Fotos hochladen' +
    '<input type="file" accept="image/*" multiple style="display:none" ' +
    'onchange="tuSatzFotos(this)"></label>' +
    (liste ? "<ul>" + liste + "</ul>" : '<p class="mini">Noch keine Foto-Sätze hochgeladen.</p>');
}

async function tuSatzFotos(input) {
  const datum = elA("satz_datum").value;
  if (!datum) { meldungA("Bitte zuerst das Datum des Satzes wählen.", "warn"); return; }
  const dateien = Array.from(input.files || []);
  input.value = "";
  if (!dateien.length) return;
  let ok = 0;
  for (const datei of dateien) {
    const dataUrl = await verkleinereBild(datei, 1100);
    if (!dataUrl) continue;
    const r = await supaSatzFotoHochladen(adminIch.id, datum, dataUrl);
    if (!r.error) ok++;
    else meldungA("Foto nicht gespeichert: " + sicherA(r.error.message), "warn");
  }
  meldungA(ok + " von " + dateien.length + " Fotos zum Satz vom " + sicherA(datum) +
    " hochgeladen. Claude liest sie beim nächsten Auftrag ein.", ok ? "gut" : "warn");
  adminFotoSaetze();
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
  meldungA("User restlos gelöscht.", "gut");
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

const S_WAHL = ["SIEG", "ASIA", "TORE", "ECKEN", "BTTS", "HZ-END", "DNB", "DC", "TENNIS"];

function satzZeileParsen(zeile) {
  const roh = String(zeile).trim();
  if (roh.length < 15) return null;
  const anM = roh.match(/(\d{2})-(\d{2})-(\d{4}),?\s*(\d{1,2})[:.](\d{2})/);
  const quoteM = roh.match(/(\d{1,2})[,.](\d{2})\s*$/);
  if (!anM || !quoteM) return null;
  const an = anM[3] + "-" + anM[2] + "-" + anM[1] + "T" + anM[4].padStart(2, "0") + ":" + anM[5];
  const quote = parseFloat(quoteM[1] + "." + quoteM[2]);
  if (quote < 1.01 || quote > 1000) return null;
  const vonM = roh.match(/(\d{1,2})\/(\d{1,2})\/\d{2,4}/);
  const von = vonM ? vonM[1] + "." + vonM[2] + "." : "";
  let mitte = roh.slice(roh.indexOf(anM[0]) + anM[0].length, roh.lastIndexOf(quoteM[0]));
  if (vonM) mitte = mitte.replace(vonM[0], "  ");
  const teile = mitte.split(/\s{2,}|\t|\|/).map(t => t.trim()).filter(t => t.length > 1);
  let liga = "", spiel = "", wette = "";
  const vsIdx = teile.findIndex(t => /\svs?\.?\s/i.test(t));
  if (vsIdx >= 0) {
    spiel = teile[vsIdx];
    liga = teile.slice(0, vsIdx).join(" ");
    wette = teile.slice(vsIdx + 1).join(" ");
  } else if (teile.length >= 3) {
    liga = teile[0]; spiel = teile[1]; wette = teile.slice(2).join(" ");
  } else {
    spiel = teile.join(" ");
  }
  let s = "SIEG";
  if (/AH\)?|\([+-]\d+[.,]5/i.test(wette) && /[+-]?\d+[.,]5/.test(wette)) s = "ASIA";
  else if (/DNB/i.test(wette)) s = "DNB";
  else if (/\(DC\)?/i.test(wette) && /DC/.test(wette)) s = "DC";
  else if (/ber\s|under|over|tore/i.test(wette)) s = "TORE";
  else if (/eck|corner/i.test(wette)) s = "ECKEN";
  return { von: von, an_zeit: an, liga: liga, spiel: spiel, wette: wette, s: s, quote: quote };
}

function satzTextParsen(text) {
  const zeilen = [];
  for (const z of String(text).split(/\n+/)) {
    const p = satzZeileParsen(z);
    if (p) zeilen.push(p);
  }
  return zeilen;
}

function zeilenSchluessel(z) {
  return (z.an_zeit + "|" + z.spiel + "|" + z.wette + "|" + z.quote).toLowerCase().replace(/\s+/g, " ");
}

async function satzEinlesen(datum) {
  const box = elA("adm_vorschau");
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
  const gesehen = new Set();
  vorschauZeilen = [];
  let nr = 0;
  for (const up of uploads) {
    nr++;
    box.innerHTML = '<div class="kern">Lese Foto ' + nr + " von " + uploads.length + "...</div>";
    let text = "";
    try {
      const erg = await Tesseract.recognize(up.foto, "deu");
      text = erg.data.text;
    } catch (e) {
      meldungA("Foto " + nr + " nicht lesbar: " + sicherA(String(e.message || e).slice(0, 60)), "warn");
      continue;
    }
    for (const z of satzTextParsen(text)) {
      const k = zeilenSchluessel(z);
      if (gesehen.has(k)) continue;   // Fotos ueberlappen sich oft - Doppelte fliegen raus
      gesehen.add(k);
      vorschauZeilen.push(z);
    }
  }
  vorschauZeigen();
}

function vorschauZeigen() {
  const box = elA("adm_vorschau");
  if (!vorschauZeilen.length) {
    box.innerHTML = '<div class="warnkern"><b>Keine Zeilen erkannt.</b> Das Foto ist zu unscharf ' +
      "oder ein anderes Format - Zeilen lassen sich unten von Hand anlegen, oder ein besseres " +
      "Foto hochladen (Bildschirm-Screenshot liest sich am besten).</div>" + vorschauFussHtml();
    return;
  }
  let zeilen = "";
  vorschauZeilen.forEach((z, i) => {
    zeilen += "<tr>" +
      '<td><input value="' + sicherA(z.an_zeit) + '" onchange="vsFeld(' + i + ',\'an_zeit\',this.value)" size="16"></td>' +
      '<td><input value="' + sicherA(z.von) + '" onchange="vsFeld(' + i + ',\'von\',this.value)" size="5"></td>' +
      '<td><input value="' + sicherA(z.liga) + '" onchange="vsFeld(' + i + ',\'liga\',this.value)" size="20"></td>' +
      '<td><input value="' + sicherA(z.spiel) + '" onchange="vsFeld(' + i + ',\'spiel\',this.value)" size="34"></td>' +
      '<td><input value="' + sicherA(z.wette) + '" onchange="vsFeld(' + i + ',\'wette\',this.value)" size="24"></td>' +
      '<td><select onchange="vsFeld(' + i + ',\'s\',this.value)">' +
        S_WAHL.map(x => "<option" + (z.s === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></td>" +
      '<td><input value="' + z.quote + '" onchange="vsFeld(' + i + ',\'quote\',this.value)" size="5"></td>' +
      '<td><button onclick="vsWeg(' + i + ')">weg</button></td></tr>';
  });
  box.innerHTML = '<div class="kern"><b>Vorschau: ' + vorschauZeilen.length + " Wetten erkannt (Satz vom " +
    sicherA(vorschauDatum) + ").</b> Bitte kurz mit den Fotos vergleichen - jede Zelle " +
    "lässt sich direkt ändern. Übernommen wird erst mit dem grünen Knopf.</div>" +
    '<div class="tabellenrand"><table><thead><tr><th>Anstoß (UK-Zeit)</th><th>gemeldet</th>' +
    "<th>Liga</th><th>Spiel</th><th>Wette</th><th>Art</th><th>Quote</th><th></th></tr></thead><tbody>" +
    zeilen + "</tbody></table></div>" + vorschauFussHtml();
}

function vorschauFussHtml() {
  return '<p><button onclick="vsNeueZeile()">Zeile hinzufügen</button> ' +
    '<button class="haupt" onclick="vsUebernehmen()">Satz übernehmen: Ordner anlegen und überall anzeigen</button> ' +
    '<button onclick="elA(\'adm_vorschau\').innerHTML=\'\'">abbrechen</button></p>';
}

function vsFeld(i, feld, wert) {
  if (!vorschauZeilen[i]) return;
  vorschauZeilen[i][feld] = (feld === "quote") ? (parseFloat(String(wert).replace(",", ".")) || 0) : wert;
}

function vsWeg(i) { vorschauZeilen.splice(i, 1); vorschauZeigen(); }

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
  const d = vorschauDatum.split("-");
  const titel = "Fotos vom " + d[2] + "." + d[1] + "." + d[0];
  const s = await supaSatzAnlegen(vorschauDatum, titel);
  if (s.error) { meldungA("Satz nicht angelegt: " + sicherA(s.error.message), "warn"); return; }
  let ok = 0;
  for (let i = 0; i < vorschauZeilen.length; i++) {
    const z = vorschauZeilen[i];
    const r = await supaWetteAnlegen(vorschauDatum, { pos: i + 1, von: z.von, an_zeit: z.an_zeit,
      liga: z.liga, spiel: z.spiel, wette: z.wette, kat: z.s, s: z.s,
      o: [[z.wette, z.quote]] });
    if (!r.error) ok++;
  }
  for (const up of vorschauUploads) await supaUploadStatus(up.id, "eingelesen");
  elA("adm_vorschau").innerHTML = "";
  meldungA("<b>Satz vom " + sicherA(vorschauDatum) + " übernommen: " + ok + " Wetten.</b> " +
    "Der Ordner steht ab sofort auf der Kombi-Tafel, im Kombi-Bau und in der Original-Tabelle - " +
    "über die Ordner-Leiste wählbar. Nachbearbeiten geht unten bei Sätze bearbeiten.", "gut");
  adminFotoSaetze();
  adminSaetze();
}

// ---------- Saetze bearbeiten (aendern, loeschen, hinzufuegen) ----------

async function adminSaetze() {
  const box = elA("adm_saetze");
  if (!box) return;
  const saetze = await supaSaetzeLaden();
  if (!saetze.length) { box.innerHTML = '<p class="mini">Noch keine im Programm eingelesenen Sätze.</p>'; return; }
  const wetten = await supaWettenLaden();
  let html = "";
  for (const s of saetze) {
    const meine = wetten.filter(w => w.satz === s.id);
    let zeilen = "";
    for (const w of meine) {
      const quote = (Array.isArray(w.o) && w.o[0]) ? w.o[0][1] : "";
      zeilen += "<tr>" +
        '<td><input value="' + sicherA(w.an_zeit) + '" onchange="tuWette(' + w.id + ',\'an_zeit\',this.value)" size="16"></td>' +
        '<td><input value="' + sicherA(w.von || "") + '" onchange="tuWette(' + w.id + ',\'von\',this.value)" size="5"></td>' +
        '<td><input value="' + sicherA(w.liga || "") + '" onchange="tuWette(' + w.id + ',\'liga\',this.value)" size="18"></td>' +
        '<td><input value="' + sicherA(w.spiel) + '" onchange="tuWette(' + w.id + ',\'spiel\',this.value)" size="32"></td>' +
        '<td><input value="' + sicherA(w.wette) + '" onchange="tuWette(' + w.id + ',\'wette\',this.value)" size="22"></td>' +
        '<td><select onchange="tuWette(' + w.id + ',\'s\',this.value)">' +
          S_WAHL.map(x => "<option" + (w.s === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></td>" +
        '<td><input value="' + sicherA(String(quote)) + '" onchange="tuWetteQuote(' + w.id + ',this.value)" size="5"></td>' +
        '<td><button onclick="tuWetteWeg(' + w.id + ')">weg</button></td></tr>';
    }
    html += '<details class="satzkasten"><summary><b>' + sicherA(s.titel) + "</b> (" + meine.length + " Wetten)</summary>" +
      '<div class="tabellenrand"><table><thead><tr><th>Anstoß (UK)</th><th>gemeldet</th><th>Liga</th>' +
      "<th>Spiel</th><th>Wette</th><th>Art</th><th>Quote</th><th></th></tr></thead><tbody>" + zeilen +
      "</tbody></table></div>" +
      '<p><button onclick="tuWetteNeu(\'' + sicherA(s.id) + '\')">Wette hinzufügen</button> ' +
      '<button id="satzweg_' + sicherA(s.id) + '" onclick="tuSatzWeg(\'' + sicherA(s.id) + '\')">ganzen Satz löschen</button></p>' +
      "</details>";
  }
  box.innerHTML = html;
}

async function tuWette(id, feld, wert) {
  const felder = {}; felder[feld] = wert;
  if (feld === "s") felder.kat = wert;
  const r = await supaWetteAendern(id, felder);
  if (r.error || !r.data || !r.data.length) meldungA("Nicht gespeichert (nur Admins ändern Sätze).", "warn");
}

async function tuWetteQuote(id, wert) {
  const q = parseFloat(String(wert).replace(",", "."));
  if (!q || q < 1.01) { meldungA("Quote ab 1.01 bitte.", "warn"); return; }
  // Wett-Text als Linie mitfuehren, damit die Tafel sie anzeigen kann
  const w = (await supa.from("kt_wetten").select("wette").eq("id", id).maybeSingle()).data;
  const r = await supaWetteAendern(id, { o: [[(w && w.wette) || "", q]] });
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

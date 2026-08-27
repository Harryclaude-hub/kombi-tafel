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
(die Homebase). Fotos hochladen, dann <b>Jetzt im Programm einlesen</b> drücken - das Programm
liest sie sofort selbst, du prüfst die Vorschau und übernimmst. <b>Sätze mischen sich nie.</b>
Doppelt hochgeladene Fotos erkennt das Programm am Fingerabdruck und lehnt sie ab.
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
  let ok = 0, doppelt = 0;
  for (const datei of dateien) {
    const dataUrl = await verkleinereBild(datei, 1100);
    if (!dataUrl) continue;
    const hash = await fotoFingerabdruck(dataUrl);
    if (hash && await supaUploadHashDa(datum, hash)) { doppelt++; continue; }
    const r = await supaSatzFotoHochladen(adminIch.id, datum, dataUrl, hash);
    if (!r.error) ok++;
    else meldungA("Foto nicht gespeichert: " + sicherA(r.error.message), "warn");
  }
  meldungA(ok + " von " + dateien.length + " Fotos zum Satz vom " + sicherA(datum) +
    " hochgeladen" + (doppelt ? ", " + doppelt + " war(en) schon da (gleiches Foto) und wurden übersprungen" : "") +
    ". Jetzt oben auf <b>Jetzt im Programm einlesen</b> drücken.", ok || doppelt ? "gut" : "warn");
  adminFotoSaetze();
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

function satzFelderParsen(felder) {
  let an = null, von = "", quote = null;
  const rest = [];
  for (const f of felder) {
    const anM = f.match(/(\d{2})-(\d{2})-(\d{4}),?\s*(\d{1,2})[:.](\d{2})/);
    const qM = f.match(/^[.,]?(\d{1,3})[,.](\d{2})[.,]?$/);
    const vonM = f.match(/^[^0-9]?(\d{1,2})\/(\d{1,2})\/?\d{0,4}$/);
    if (anM && !an) {
      an = anM[3] + "-" + anM[2] + "-" + anM[1] + "T" + anM[4].padStart(2, "0") + ":" + anM[5];
    } else if (vonM && !von && !an === false && rest.length === 0) {
      von = vonM[1] + "." + vonM[2] + ".";
    } else if (qM) {
      quote = parseFloat(qM[1] + "." + qM[2]);   // das LETZTE Zahlenfeld gewinnt
    } else if (f.length > 1 && !/^[a-z]{1,3}$/i.test(f)) {
      rest.push(f);   // Kleinkram wie das jb-Kuerzel fliegt raus
    }
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
  let s = "SIEG";
  if (/[+-]\s?\d+[.,]?\d*\s*A[HIl]?/i.test(wette) || /\([+-]/.test(wette)) s = "ASIA";
  else if (/DN[BE]/i.test(wette)) s = "DNB";
  else if (/\(DC/i.test(wette)) s = "DC";
  else if (/ber\s|under|over|tore/i.test(wette)) s = "TORE";
  else if (/eck|corner/i.test(wette)) s = "ECKEN";
  return { von: von, an_zeit: an, liga: liga, spiel: spiel, wette: wette, s: s, quote: quote };
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
  return g;
}

function zeilenSchluessel(z) {
  // Zeit + Quote + Art + Spiel-Anfang: faengt auch Zeilen, die die
  // Texterkennung auf zwei Fotos leicht unterschiedlich gelesen hat
  const spiel4 = z.spiel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return z.an_zeit + "|" + z.quote + "|" + z.s + "|" + spiel4;
}

// Moegliche Doppelte (gleiche Zeit + gleiche Quote) fuer die Vorschau markieren
function vsDoppelVerdacht() {
  const zaehl = {};
  for (const z of vorschauZeilen) {
    const k = z.an_zeit + "|" + z.quote;
    zaehl[k] = (zaehl[k] || 0) + 1;
  }
  return vorschauZeilen.map(z => zaehl[z.an_zeit + "|" + z.quote] > 1);
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
    let lines = [];
    try {
      const erg = await Tesseract.recognize(up.foto, "deu");
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
    for (const line of lines) {
      const p = satzFelderParsen(felderAusWorten(line.words));
      if (p) {
        p.wette = wetteReparieren(p.wette);
        p.gruende = pruefGruende(p, datum);
        geparst.push(p);
      }
    }
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
  const box = elA("adm_vorschau");
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
    zeilen += "<tr" + (gruende.length ? " class='ohneordner'" : "") + ">" +
      "<td class='mini'>" + (gruende.length ? sicherA(gruende.join(", ")) : "") + "</td>" +
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
    "lässt sich direkt ändern. <b>Gelbe Zeilen</b> haben gleiche Zeit und Quote wie eine andere - " +
    "möglicherweise doppelt erkannt, bitte vergleichen. Übernommen wird erst mit dem grünen Knopf.</div>" +
    '<div class="tabellenrand"><table><thead><tr><th>Prüfen</th><th>Anstoß (UK-Zeit)</th><th>gemeldet</th>' +
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
  // Was schon im Ordner steht, wird NICHT doppelt angelegt (Fotos nachschieben!)
  const daWetten = (await supaWettenLaden()).filter(w => w.satz === vorschauDatum);
  const daSchluessel = new Set(daWetten.map(w => zeilenSchluessel({
    an_zeit: w.an_zeit, quote: (Array.isArray(w.o) && w.o[0]) ? w.o[0][1] : 0, s: w.s, spiel: w.spiel })));
  let ok = 0, schonDa = 0;
  for (let i = 0; i < vorschauZeilen.length; i++) {
    const z = vorschauZeilen[i];
    if (daSchluessel.has(zeilenSchluessel(z))) { schonDa++; continue; }
    const r = await supaWetteAnlegen(vorschauDatum, { pos: daWetten.length + i + 1, von: z.von, an_zeit: z.an_zeit,
      liga: z.liga, spiel: z.spiel, wette: z.wette, kat: z.s, s: z.s,
      o: [[z.wette, z.quote]] });
    if (!r.error) ok++;
  }
  for (const up of vorschauUploads) await supaUploadStatus(up.id, "eingelesen");
  elA("adm_vorschau").innerHTML = "";
  meldungA("<b>Satz vom " + sicherA(vorschauDatum) + ": " + ok + " Wetten übernommen" +
    (schonDa ? ", " + schonDa + " waren schon im Ordner (nicht doppelt angelegt)" : "") + ".</b> " +
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
  const wetten = await supaWettenLaden();
  const uploads = await supaSatzUploadsLaden();

  // Klare Uebersicht: ein Blick, alle Ordner
  let ueber = '<div class="kern"><b>Neuen leeren Ordner anlegen:</b> ' +
    '<input type="date" id="neusatz_datum"> ' +
    '<input id="neusatz_titel" placeholder="Titel (leer = Fotos vom Datum)" size="24"> ' +
    '<button class="haupt" onclick="tuSatzNeu()">Ordner anlegen</button> ' +
    '<span class="mini">Wetten dann unten von Hand hinzufügen oder Fotos einlesen.</span></div>';
  if (saetze.length) {
    ueber += "<table><thead><tr><th>Ordner</th><th>Wetten</th><th>Fotos</th><th></th></tr></thead><tbody>";
    for (const s of saetze) {
      const n = wetten.filter(w => w.satz === s.id).length;
      const f = uploads.filter(u => u.satz_datum === s.id).length;
      ueber += "<tr><td><b>" + sicherA(s.titel) + "</b> <span class='mini'>(" + sicherA(s.id) + ")</span></td>" +
        "<td>" + n + "</td><td>" + f + "</td>" +
        '<td><button onclick="satzAufklappen(\'' + sicherA(s.id) + '\')">öffnen und bearbeiten</button></td></tr>';
    }
    ueber += "</tbody></table>";
  } else {
    ueber += '<p class="mini">Noch keine im Programm eingelesenen Ordner.</p>';
  }

  let html = ueber;
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
    html += '<details class="satzkasten" id="satzdetails_' + sicherA(s.id) + '"><summary><b>' + sicherA(s.titel) + "</b> (" + meine.length + " Wetten)</summary>" +
      '<div class="tabellenrand"><table><thead><tr><th>Anstoß (UK)</th><th>gemeldet</th><th>Liga</th>' +
      "<th>Spiel</th><th>Wette</th><th>Art</th><th>Quote</th><th></th></tr></thead><tbody>" + zeilen +
      "</tbody></table></div>" +
      '<p><button onclick="tuWetteNeu(\'' + sicherA(s.id) + '\')">Wette hinzufügen</button> ' +
      '<button id="satzweg_' + sicherA(s.id) + '" onclick="tuSatzWeg(\'' + sicherA(s.id) + '\')">ganzen Satz löschen</button></p>' +
      "</details>";
  }
  box.innerHTML = html;
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

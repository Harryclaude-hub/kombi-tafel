// ============================================================
// EXPORT: Kontostaende, Tagesansicht, alle Kombinationen, alle Fotos
//
// Karam (16.09.2026): "Ich will ein Excel-Tabellensystem, das ich
// woechentlich in diesem Programm mache. Ein Klick, und ich bekomme den
// aktuellen Zeitpunkt aller Kontostaende als Excel. Dafuer muss es einen
// Knopf geben, bei der Buchhaltung. Und die Tagesanzeige genauso. Und
// jede einzelne Kombi, die ich gespielt habe, als Datei. Und alle Fotos,
// die ich gespeichert habe, in einem Ordner."
//
// WARUM DAS IM BROWSER LAUFEN MUSS UND NICHT AUF DEM SERVER
// Einsatz, Quote, Anbieter und die Fotos liegen verschluesselt in
// kt_scheine (Spalte daten und foto, Praefix e2e1:). Der Schluessel liegt
// nur auf Karams Geraet. Ein Server-Export haette also nur Zeitstempel
// und Nummern - ohne eine einzige Zahl, auf die es ankommt.
//
// KEINE FREMDE BIBLIOTHEK
// Die Datei schreibt xlsx und zip selbst. Beides ist ein ZIP mit ein
// paar XML-Dateien darin; das sind die 120 Zeilen hier unten. Eine
// Bibliothek vom fremden Server waere groesser als diese Datei und
// wuerde beim naechsten Netzausfall fehlen.
//
// TRENNUNG: diese Datei RECHNET NICHTS NEU. Sie liest, was mein.js und
// ergebnisse.js ohnehin schon gerechnet haben, und schreibt es in eine
// Tabelle. Steht hier eine Zahl anders als am Bildschirm, ist das ein
// Fehler in dieser Datei, nie eine zweite Meinung.
// ============================================================
"use strict";

// ---------- CRC32, das ZIP verlangt es je Datei ----------
const EX_CRC = (function () {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function exCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = EX_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function exText(s) { return new TextEncoder().encode(s); }

// ---------- ZIP schreiben (ohne Komprimierung) ----------
// "Gespeichert" statt "deflate": JPEG und PNG sind schon komprimiert, da
// bringt Packen nichts, und ohne Packer bleibt der Code nachlesbar.
// Grosse Dateien wuerden dadurch groesser - bei Fotos ist das egal.
function exZip(dateien) {
  const teile = [], mittel = [];
  let versatz = 0;
  for (const d of dateien) {
    const name = exText(d.name);
    const inhalt = (d.inhalt instanceof Uint8Array) ? d.inhalt : exText(String(d.inhalt));
    const crc = exCrc32(inhalt);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);   // Kennung "hier faengt eine Datei an"
    kopf.setUint16(4, 20, true);           // braucht Fassung 2.0
    kopf.setUint16(6, 0x0800, true);       // Namen sind UTF-8
    kopf.setUint16(8, 0, true);            // 0 = gespeichert, nicht gepackt
    kopf.setUint16(10, 0, true);           // Uhrzeit
    kopf.setUint16(12, 0x2921, true);      // Datum (fest: 01.09.2020)
    kopf.setUint32(14, crc, true);
    kopf.setUint32(18, inhalt.length, true);
    kopf.setUint32(22, inhalt.length, true);
    kopf.setUint16(26, name.length, true);
    kopf.setUint16(28, 0, true);
    teile.push(new Uint8Array(kopf.buffer), name, inhalt);

    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true);      // Kennung "Eintrag im Inhaltsverzeichnis"
    m.setUint16(4, 20, true); m.setUint16(6, 20, true);
    m.setUint16(8, 0x0800, true); m.setUint16(10, 0, true);
    m.setUint16(12, 0, true); m.setUint16(14, 0x2921, true);
    m.setUint32(16, crc, true);
    m.setUint32(20, inhalt.length, true);
    m.setUint32(24, inhalt.length, true);
    m.setUint16(28, name.length, true);
    m.setUint32(42, versatz, true);
    mittel.push(new Uint8Array(m.buffer), name);
    versatz += 30 + name.length + inhalt.length;
  }
  let mittelLaenge = 0;
  for (const m of mittel) mittelLaenge += m.length;
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);     // Kennung "Ende des Verzeichnisses"
  ende.setUint16(8, dateien.length, true);
  ende.setUint16(10, dateien.length, true);
  ende.setUint32(12, mittelLaenge, true);
  ende.setUint32(16, versatz, true);
  return new Blob([...teile, ...mittel, new Uint8Array(ende.buffer)],
    { type: "application/zip" });
}

// ---------- XLSX schreiben ----------
function exXmlSicher(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Steuerzeichen sind in XML verboten und machen die Datei unlesbar.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function exSpalte(n) {                       // 0 -> A, 26 -> AA
  let s = "";
  n = n + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Ein Blatt: { name, spalten: [{titel, breite}], zeilen: [[wert, ...], ...] }
// Zahlen werden als Zahl geschrieben (Karam kann in Excel summieren),
// alles andere als Text. null und undefined bleiben leere Zellen.
function exBlattXml(blatt) {
  let z = "";
  const kopf = (blatt.spalten || []).map(s => s.titel);
  const alle = kopf.length ? [kopf].concat(blatt.zeilen || []) : (blatt.zeilen || []);
  alle.forEach((zeile, i) => {
    const nr = i + 1;
    let zellen = "";
    (zeile || []).forEach((wert, j) => {
      if (wert === null || wert === undefined || wert === "") return;
      const ref = exSpalte(j) + nr;
      const kopfzeile = (kopf.length && i === 0);
      if (typeof wert === "number" && isFinite(wert)) {
        zellen += '<c r="' + ref + '" s="' + (kopfzeile ? 1 : 2) + '"><v>' + wert + "</v></c>";
      } else {
        zellen += '<c r="' + ref + '" s="' + (kopfzeile ? 1 : 0) + '" t="inlineStr">' +
          "<is><t xml:space=\"preserve\">" + exXmlSicher(wert) + "</t></is></c>";
      }
    });
    z += '<row r="' + nr + '">' + zellen + "</row>";
  });
  const breiten = (blatt.spalten || []).map((s, i) =>
    '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (s.breite || 14) + '" customWidth="1"/>').join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (breiten ? "<cols>" + breiten + "</cols>" : "") +
    (kopf.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "") +
    "<sheetData>" + z + "</sheetData></worksheet>";
}

function exXlsx(blaetter) {
  const n = blaetter.length;
  const dateien = [];
  dateien.push({
    name: "[Content_Types].xml",
    inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      blaetter.map((b, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      "</Types>"
  });
  dateien.push({
    name: "_rels/.rels",
    inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
  });
  dateien.push({
    name: "xl/workbook.xml",
    inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      blaetter.map((b, i) => '<sheet name="' + exXmlSicher(b.name).slice(0, 31) +
        '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") +
      "</sheets></workbook>"
  });
  dateien.push({
    name: "xl/_rels/workbook.xml.rels",
    inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      blaetter.map((b, i) => '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
        (i + 1) + '.xml"/>').join("") +
      '<Relationship Id="rId' + (n + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>"
  });
  // Stile: 0 Text, 1 Kopfzeile fett, 2 Zahl mit zwei Nachkommastellen
  dateien.push({
    name: "xl/styles.xml",
    inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
      '<fonts count="2">' +
      '<font><sz val="11"/><name val="Arial"/></font>' +
      '<font><b/><sz val="11"/><name val="Arial"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5FB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      "</cellXfs>" +
      // MUSS nach cellXfs stehen, das schreibt das Dateiformat so vor.
      // Ohne diesen Standardstil meldet das Tabellenprogramm beim Oeffnen
      // "Mappe hat keinen Standardstil": sieht aus wie ein Schaden an der
      // Datei und ist keiner. Davor eingesetzt waere es ein echter.
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
  });
  blaetter.forEach((b, i) => dateien.push({
    name: "xl/worksheets/sheet" + (i + 1) + ".xml", inhalt: exBlattXml(b)
  }));
  const blob = exZip(dateien);
  return new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------- Herunterladen ----------
function exSpeichern(blob, dateiname) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = dateiname;
  document.body.appendChild(a); a.click(); a.remove();
  // Erst spaeter freigeben: Safari bricht den Download ab, wenn die
  // Adresse schon weg ist, bevor er angefangen hat.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Data-URL ("data:image/jpeg;base64,...") zu Bytes, ohne fetch.
function exDatenUrlZuBytes(url) {
  const komma = String(url).indexOf(",");
  if (komma < 0) return null;
  const kopf = url.slice(0, komma), roh = url.slice(komma + 1);
  try {
    if (/;base64/i.test(kopf)) {
      const bin = atob(roh);
      const b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      return b;
    }
    return exText(decodeURIComponent(roh));
  } catch (e) { return null; }
}

function exEndung(datenUrl, name) {
  const m = /^data:image\/([a-z0-9.+-]+)/i.exec(String(datenUrl || ""));
  const aus = /\.([a-z0-9]{2,4})$/i.exec(String(name || ""));
  if (aus) return aus[1].toLowerCase();
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  return "jpg";
}

// Dateinamen entschaerfen: Windows mag \ / : * ? " < > | nicht.
function exNameSicher(s, ersatz) {
  let t = String(s || "").replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
  t = t.replace(/[. ]+$/, "");
  return t || (ersatz || "ohne_Namen");
}

function exHeute() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// ============================================================
// WOHER DIE ZAHLEN KOMMEN
// Nichts hier rechnet neu. personPruefen() aus mein.js liefert je Person
// und Anbieter eingezahlt, zurueckgeholt, gesetzt, gewonnen, im Spiel und
// das Guthaben - dieselbe Funktion, die auch die Personen-Kasse und die
// Tagesuebersicht am Bildschirm benutzen. Steht in der Tabelle eine
// andere Zahl als am Schirm, ist das ein Fehler HIER, nie eine zweite
// Meinung.
// ============================================================

function exScheine() { return Array.isArray(kasseScheine) ? kasseScheine : []; }
function exPersonen() { return Array.isArray(ordnerListe) ? ordnerListe : []; }

function exPersonName(id) {
  const o = exPersonen().find(x => x.id === id);
  return o ? String(o.name || "") : "";
}
function exAnbieterName(kz) {
  const a = KASSE_ANBIETER.find(x => x[0] === kz);
  return a ? a[1] : (kz || "?");
}
function exMeldung(text, art) {
  if (typeof meldungM === "function") meldungM(text, art || "gut");
}

// Ist ueberhaupt etwas geladen? Ein leerer Export sieht aus wie
// "nichts da" und ist in Wahrheit "noch nicht fertig geladen".
function exBereit() {
  if (typeof kasseScheine === "undefined" || typeof ordnerListe === "undefined" ||
      typeof personPruefen !== "function") {
    exMeldung("Der Export ist noch nicht bereit, die Seite laedt noch. Gleich nochmal druecken.", "warn");
    return false;
  }
  if (!exPersonen().length && !exScheine().length) {
    exMeldung("Es ist nichts zum Ausgeben da: weder Personen noch Kombinationen geladen.", "warn");
    return false;
  }
  const gesperrt = exScheine().filter(s => s.daten && s.daten.gesperrt).length;
  if (gesperrt) {
    exMeldung("<b>Achtung:</b> " + gesperrt + " Kombination(en) lassen sich auf diesem Geraet " +
      "nicht entschluesseln. Sie stehen in der Datei als \"nicht lesbar\" und zaehlen in " +
      "KEINER Summe mit.", "warn");
  }
  return true;
}

function exStandText() {
  return (typeof wannText === "function") ? wannText(new Date())
    : new Date().toLocaleString("de-AT");
}

function exSumme(zeilen, i) {
  return zeilen.reduce((p, z) => p + (Number(z[i]) || 0), 0);
}

// ---------- 1. Kontostaende ----------
// Spalten so benannt wie in Karams eigener Mappe, damit er Zeile fuer
// Zeile vergleichen kann. Differenz = Aktuell minus Eingezahlt.
function exKontostaende() {
  if (!exBereit()) return;
  const scheine = exScheine();
  const stand = exStandText();
  const uebersicht = [], jePerson = [], jeAnbieter = {};
  for (const [kz] of KASSE_ANBIETER)
    jeAnbieter[kz] = { konten: 0, einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, imSpiel: 0, guthaben: 0, offen: 0 };

  for (const p of exPersonen()) {
    const pr = personPruefen(p.id, scheine);
    const meine = scheine.filter(s => s.ordner === p.id);
    let pKonten = 0, pEinge = 0, pGuth = 0, pSpiel = 0, pOffen = 0;
    for (const [kz, name] of KASSE_ANBIETER) {
      const a = pr.anbieter[kz];
      if (!a) continue;
      const offen = meine.filter(s => s.stand === "offen" && s.daten && s.daten.kz === kz).length;
      // Anbieter, bei denen diese Person nie etwas hatte, kommen nicht in
      // die Liste: sonst stuenden sieben leere Zeilen je Person darin.
      if (!a.einge && !a.geholt && !a.einsatz && !a.gewonnen && !a.guthaben && !offen) continue;
      pKonten++;
      pEinge += a.einge; pGuth += a.guthaben; pSpiel += (a.imSpiel || 0); pOffen += offen;
      const j = jeAnbieter[kz];
      j.konten++; j.einge += a.einge; j.geholt += a.geholt; j.einsatz += a.einsatz;
      j.gewonnen += a.gewonnen; j.imSpiel += (a.imSpiel || 0); j.guthaben += a.guthaben; j.offen += offen;
      uebersicht.push([p.name, name, a.einge, a.geholt, a.einsatz, a.gewonnen,
        (a.imSpiel || 0), a.guthaben, a.guthaben - a.einge, offen, stand]);
    }
    jePerson.push([p.name, pKonten, pEinge, pGuth, pGuth - pEinge, pSpiel, pOffen]);
  }
  // Nach P-Nummer ordnen, nicht als Text: P-2 vor P-10 (personVergleich in logik.js).
  if (typeof personVergleich === "function") {
    uebersicht.sort((a, b) => personVergleich({ name: a[0] }, { name: b[0] }) ||
      String(a[1]).localeCompare(String(b[1]), "de"));
    jePerson.sort((a, b) => personVergleich({ name: a[0] }, { name: b[0] }));
  }
  uebersicht.push(["Summe", "", exSumme(uebersicht, 2), exSumme(uebersicht, 3), exSumme(uebersicht, 4),
    exSumme(uebersicht, 5), exSumme(uebersicht, 6), exSumme(uebersicht, 7), exSumme(uebersicht, 8),
    exSumme(uebersicht, 9), ""]);
  jePerson.push(["Summe", exSumme(jePerson, 1), exSumme(jePerson, 2), exSumme(jePerson, 3),
    exSumme(jePerson, 4), exSumme(jePerson, 5), exSumme(jePerson, 6)]);

  const anbZeilen = [];
  for (const [kz, name] of KASSE_ANBIETER) {
    const j = jeAnbieter[kz];
    if (!j.konten) continue;
    anbZeilen.push([name, j.konten, j.einge, j.geholt, j.einsatz, j.gewonnen,
      j.imSpiel, j.guthaben, j.guthaben - j.einge, j.offen]);
  }
  anbZeilen.push(["Summe", exSumme(anbZeilen, 1), exSumme(anbZeilen, 2), exSumme(anbZeilen, 3),
    exSumme(anbZeilen, 4), exSumme(anbZeilen, 5), exSumme(anbZeilen, 6), exSumme(anbZeilen, 7),
    exSumme(anbZeilen, 8), exSumme(anbZeilen, 9)]);

  const mappe = exXlsx([
    { name: "Uebersicht",
      spalten: [{ titel: "Person", breite: 14 }, { titel: "Anbieter", breite: 16 },
        { titel: "Eingezahlt", breite: 12 }, { titel: "Zurueckgeholt", breite: 13 },
        { titel: "Gesetzt", breite: 12 }, { titel: "Gewonnen", breite: 12 },
        { titel: "Im Spiel", breite: 12 }, { titel: "Aktuell", breite: 12 },
        { titel: "Differenz", breite: 12 }, { titel: "Offen", breite: 8 },
        { titel: "Stand", breite: 18 }],
      zeilen: uebersicht },
    { name: "Pro Person",
      spalten: [{ titel: "Person", breite: 14 }, { titel: "Konten", breite: 9 },
        { titel: "Eingezahlt", breite: 12 }, { titel: "Aktuell", breite: 12 },
        { titel: "Differenz", breite: 12 }, { titel: "Im Spiel", breite: 12 },
        { titel: "Offen", breite: 8 }],
      zeilen: jePerson },
    { name: "Pro Anbieter",
      spalten: [{ titel: "Anbieter", breite: 16 }, { titel: "Konten", breite: 9 },
        { titel: "Eingezahlt", breite: 12 }, { titel: "Zurueckgeholt", breite: 13 },
        { titel: "Gesetzt", breite: 12 }, { titel: "Gewonnen", breite: 12 },
        { titel: "Im Spiel", breite: 12 }, { titel: "Aktuell", breite: 12 },
        { titel: "Differenz", breite: 12 }, { titel: "Offen", breite: 8 }],
      zeilen: anbZeilen },
    { name: "Legende",
      spalten: [{ titel: "Spalte", breite: 16 }, { titel: "Was darin steht", breite: 95 }],
      zeilen: [
        ["Stand", "Zeitpunkt, zu dem diese Datei geschrieben wurde: " + stand],
        ["Eingezahlt", "Was bei diesem Anbieter eingezahlt wurde (Personen-Kasse, zum Anbieter eingezahlt)."],
        ["Zurueckgeholt", "Was vom Anbieter wieder herausgeholt wurde."],
        ["Gesetzt", "Summe der Einsaetze aller Kombinationen dieser Person bei diesem Anbieter."],
        ["Gewonnen", "Was gewonnene Kombinationen zurueckgebracht haben: wirklich bekommen, sonst der Moeglich-Wert."],
        ["Im Spiel", "Einsatz der Kombinationen, die noch offen sind."],
        ["Aktuell", "Rechnerisches Guthaben: Eingezahlt minus Zurueckgeholt minus Gesetzt plus Gewonnen plus Korrekturen. Dieselbe Rechnung wie die Personen-Kasse am Bildschirm."],
        ["Differenz", "Aktuell minus Eingezahlt. Ueber null heisst: bei diesem Anbieter liegst du vorne."],
        ["Offen", "Anzahl der Kombinationen, die noch nicht entschieden sind."],
        ["", ""],
        ["Wichtig", "Diese Datei kennt nur, was in diesem Programm gespeichert ist. Was beim Anbieter auf der Website steht, kann abweichen, solange eine Zahlung oder ein Ergebnis hier noch nicht eingetragen ist."],
        ["Nicht lesbar", "Kombinationen, die sich auf diesem Geraet nicht entschluesseln liessen, zaehlen in KEINER Summe mit."]
      ] }
  ]);
  exSpeichern(mappe, "Kontostaende_" + exHeute() + ".xlsx");
  exMeldung("Kontostaende gespeichert: <b>Kontostaende_" + exHeute() + ".xlsx</b>", "gut");
}

// ---------- 2. Tagesansicht ----------
function exTagesansicht() {
  if (!exBereit()) return;
  const tag = (typeof tagGewaehlt === "function") ? tagGewaehlt() : exHeute();
  const zeilen = (typeof tagZeilen === "function") ? tagZeilen(tag) : [];
  if (!zeilen.length) { exMeldung("Fuer diesen Tag ist nichts zu sehen.", "warn"); return; }

  const bearbeitet = [], halter = [], anb = {};
  for (const [kz] of KASSE_ANBIETER)
    anb[kz] = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, imSpiel: 0, guthaben: 0, wartet: 0 };
  for (const z of zeilen) {
    const einsatzNeu = z.neu.reduce((p, s) => p + ((s.daten && s.daten.einsatz) || 0), 0);
    if (z.neu.length || z.geaendert.length || z.zahlungen.length)
      bearbeitet.push([z.person.name, z.neu.length, einsatzNeu, z.geaendert.length,
        z.zahlungen.length, z.haelt]);
    halter.push([z.person.name, z.pr.aufWegen, z.pr.beiAnbietern, z.pr.imSpiel, z.haelt]);
    for (const [kz] of KASSE_ANBIETER) {
      const a = z.pr.anbieter[kz];
      if (!a) continue;
      for (const f of ["einge", "geholt", "einsatz", "gewonnen", "imSpiel", "guthaben", "wartet"])
        anb[kz][f] += a[f] || 0;
    }
  }
  halter.sort((a, b) => b[4] - a[4]);
  const anbZeilen = [];
  for (const [kz, name] of KASSE_ANBIETER) {
    const a = anb[kz];
    if (!a.einge && !a.einsatz && !a.gewonnen && !a.guthaben && !a.imSpiel) continue;
    anbZeilen.push([name, a.einge, a.geholt, a.einsatz, a.gewonnen, a.imSpiel, a.guthaben, a.wartet]);
  }
  if (bearbeitet.length) bearbeitet.push(["Summe", exSumme(bearbeitet, 1), exSumme(bearbeitet, 2),
    exSumme(bearbeitet, 3), exSumme(bearbeitet, 4), exSumme(bearbeitet, 5)]);
  if (anbZeilen.length) anbZeilen.push(["Summe", exSumme(anbZeilen, 1), exSumme(anbZeilen, 2),
    exSumme(anbZeilen, 3), exSumme(anbZeilen, 4), exSumme(anbZeilen, 5), exSumme(anbZeilen, 6),
    exSumme(anbZeilen, 7)]);
  if (halter.length) halter.push(["Summe", exSumme(halter, 1), exSumme(halter, 2),
    exSumme(halter, 3), exSumme(halter, 4)]);

  const mappe = exXlsx([
    { name: "An dem Tag bearbeitet",
      spalten: [{ titel: "Person", breite: 14 }, { titel: "Neue Kombinationen", breite: 18 },
        { titel: "Einsatz neu", breite: 12 }, { titel: "Geaendert", breite: 10 },
        { titel: "Zahlungen", breite: 11 }, { titel: "Haelt gerade", breite: 13 }],
      zeilen: bearbeitet },
    { name: "Geldstand bei Anbietern",
      spalten: [{ titel: "Anbieter", breite: 16 }, { titel: "Eingezahlt", breite: 12 },
        { titel: "Zurueckgeholt", breite: 13 }, { titel: "Gesetzt", breite: 12 },
        { titel: "Gewonnen", breite: 12 }, { titel: "Im Spiel", breite: 12 },
        { titel: "Aktuell", breite: 12 }, { titel: "Wartet auf Ergebnis", breite: 18 }],
      zeilen: anbZeilen },
    { name: "Wer haelt wie viel",
      spalten: [{ titel: "Person", breite: 14 }, { titel: "Auf den Wegen", breite: 14 },
        { titel: "Bei den Anbietern", breite: 17 }, { titel: "Im Spiel", breite: 12 },
        { titel: "Haelt zusammen", breite: 15 }],
      zeilen: halter },
    { name: "Legende",
      spalten: [{ titel: "Feld", breite: 18 }, { titel: "Was darin steht", breite: 95 }],
      zeilen: [
        ["Tag", tag],
        ["Geschrieben am", exStandText()],
        ["Wichtig", "Nur Neue Kombinationen, Einsatz neu, Geaendert und Zahlungen gelten fuer diesen Tag. Alle anderen Zahlen sind der Stand von JETZT, nicht von diesem Tag."],
        ["Haelt gerade", "Auf den Wegen plus bei den Anbietern plus im Spiel."]
      ] }
  ]);
  exSpeichern(mappe, "Tag_" + tag + ".xlsx");
  exMeldung("Tagesansicht gespeichert: <b>Tag_" + tag + ".xlsx</b>", "gut");
}

// ---------- 3. Jede einzelne Kombination ----------
function exKombinationen() {
  if (!exBereit()) return;
  const scheine = exScheine().slice().sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")));
  if (!scheine.length) { exMeldung("Es sind keine Kombinationen gespeichert.", "warn"); return; }

  const zeilen = [], beine = [];
  for (const s of scheine) {
    const d = s.daten || {};
    const unlesbar = !!d.gesperrt;
    const wetten = d.wetten || [];
    const zurueck = (typeof echtZurueckWert === "function" && !unlesbar) ? echtZurueckWert(s) : null;
    zeilen.push([
      s.nummer || null,
      (typeof wannText === "function") ? wannText(s.created_at) : String(s.created_at || ""),
      exPersonName(s.ordner) || "ohne Person",
      unlesbar ? "nicht lesbar" : exAnbieterName(d.kz),
      unlesbar ? null : wetten.length,
      unlesbar ? "nicht lesbar"
               : wetten.map(t => (t.spiel || "") + (t.linie ? " (" + t.linie + ")" : "")).join(" + "),
      unlesbar ? null : (d.quote || null),
      unlesbar ? null : (d.einsatz || null),
      unlesbar ? null : (d.moeglich || null),
      s.stand || "",
      (s.stand === "gewonnen" && zurueck !== null) ? zurueck : null,
      d.handeingabe ? "von Hand" : "",
      s.foto ? "ja" : "nein",
      String(s.notiz || "").replace(/\s+/g, " ").trim(),
      d.satz || ""
    ]);
    if (unlesbar) continue;
    for (const t of wetten)
      beine.push([s.nummer || null, exPersonName(s.ordner) || "ohne Person", exAnbieterName(d.kz),
        t.spiel || "", t.linie || "", t.an || "", t.quote || null, t.mind || null, s.stand || ""]);
  }
  zeilen.push(["", "Summe", "", "", null, "", null, exSumme(zeilen, 7), exSumme(zeilen, 8),
    "", exSumme(zeilen, 10), "", "", "", ""]);

  const mappe = exXlsx([
    { name: "Kombinationen",
      spalten: [{ titel: "Nr.", breite: 7 }, { titel: "Gespeichert am", breite: 18 },
        { titel: "Person", breite: 14 }, { titel: "Anbieter", breite: 16 },
        { titel: "Wetten", breite: 8 }, { titel: "Spiele", breite: 70 },
        { titel: "Quote", breite: 9 }, { titel: "Einsatz", breite: 11 },
        { titel: "Moeglich", breite: 11 }, { titel: "Stand", breite: 11 },
        { titel: "Wirklich bekommen", breite: 17 }, { titel: "Eingabe", breite: 11 },
        { titel: "Foto", breite: 7 }, { titel: "Notiz", breite: 40 },
        { titel: "Satz", breite: 13 }],
      zeilen: zeilen },
    { name: "Einzelne Wetten",
      spalten: [{ titel: "Nr.", breite: 7 }, { titel: "Person", breite: 14 },
        { titel: "Anbieter", breite: 16 }, { titel: "Spiel", breite: 42 },
        { titel: "Wette", breite: 22 }, { titel: "Anstoss", breite: 18 },
        { titel: "Quote", breite: 9 }, { titel: "Mindestquote", breite: 13 },
        { titel: "Stand", breite: 11 }],
      zeilen: beine },
    { name: "Legende",
      spalten: [{ titel: "Feld", breite: 18 }, { titel: "Was darin steht", breite: 95 }],
      zeilen: [
        ["Geschrieben am", exStandText()],
        ["Kombinationen", String(scheine.length) + " Zeilen, jede gespeicherte Kombination einmal."],
        ["Einzelne Wetten", "Dasselbe noch einmal, aber jede Wette in einer eigenen Zeile. Eine Kombination mit drei Wetten steht hier dreimal."],
        ["Nr.", "Die feste Nummer, die beim Speichern vergeben wurde."],
        ["Wirklich bekommen", "Nur bei gewonnenen Kombinationen. Leer heisst: noch nichts eingetragen."],
        ["Eingabe", "von Hand heisst: nachtraeglich in Mein Bereich eingetippt, nicht im Kombi-Bau gebaut."],
        ["Nicht lesbar", "Kombination, die sich auf diesem Geraet nicht entschluesseln liess. Zaehlt in keiner Summe mit."]
      ] }
  ]);
  exSpeichern(mappe, "Kombinationen_" + exHeute() + ".xlsx");
  exMeldung("Alle " + scheine.length + " Kombinationen gespeichert: <b>Kombinationen_" +
    exHeute() + ".xlsx</b>", "gut");
}

// ---------- 4. Alle Fotos in einem Ordner ----------
// Je Person ein Unterordner. Der Dateiname faengt mit der festen Nummer
// an, dann das Datum: so stimmt die Reihenfolge im Windows-Ordner. Die
// Liste, welches Bild zu welcher Kombination gehoert, liegt als Excel
// mit im ZIP, nicht als zweiter Download.
function exFotos() {
  if (!exBereit()) return;
  const alle = exScheine();
  const mit = alle.filter(s => s.foto && String(s.foto).startsWith("data:"));
  const ohne = alle.length - mit.length;
  if (!mit.length) { exMeldung("Es ist kein Foto gespeichert.", "warn"); return; }
  exMeldung("Packe " + mit.length + " Fotos zusammen, das dauert einen Moment...", "gut");

  const dateien = [], liste = [], vergeben = new Set();
  let bytes = 0, kaputt = 0;
  const sortiert = mit.slice().sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")));
  for (const s of sortiert) {
    const roh = exDatenUrlZuBytes(s.foto);
    if (!roh || !roh.length) { kaputt++; continue; }
    const person = exNameSicher(exPersonName(s.ordner) || "ohne Person");
    const datum = String(s.created_at || "").slice(0, 10);
    const nr = s.nummer ? String(s.nummer).padStart(4, "0") : "ohne-Nr";
    const stamm = exNameSicher(s.foto_name || "Wettschein", "Wettschein")
      .replace(/\.[a-z0-9]{2,4}$/i, "");
    let name = "Fotos/" + person + "/" + nr + "_" + datum + "_" + stamm +
      "." + exEndung(s.foto, s.foto_name);
    // Zwei Bilder duerfen nie denselben Namen haben, sonst ueberschreibt
    // das Entpacken still eines davon.
    if (vergeben.has(name)) {
      const punkt = name.lastIndexOf(".");
      let i = 2, kandidat;
      do { kandidat = name.slice(0, punkt) + "_" + i + name.slice(punkt); i++; }
      while (vergeben.has(kandidat));
      name = kandidat;
    }
    vergeben.add(name);
    dateien.push({ name: name, inhalt: roh });
    bytes += roh.length;
    const d = s.daten || {};
    liste.push([s.nummer || null, name.replace(/^Fotos\//, ""),
      (typeof wannText === "function") ? wannText(s.created_at) : String(s.created_at || ""),
      exPersonName(s.ordner) || "ohne Person",
      d.gesperrt ? "nicht lesbar" : exAnbieterName(d.kz),
      d.gesperrt ? null : (d.einsatz || null), s.stand || "",
      Math.round(roh.length / 1024)]);
  }
  if (!dateien.length) { exMeldung("Kein Foto liess sich lesen. Nichts gepackt.", "warn"); return; }
  const anzahl = dateien.length;

  const mappe = exXlsx([{ name: "Fotos",
    spalten: [{ titel: "Nr.", breite: 7 }, { titel: "Datei", breite: 60 },
      { titel: "Gespeichert am", breite: 18 }, { titel: "Person", breite: 14 },
      { titel: "Anbieter", breite: 16 }, { titel: "Einsatz", breite: 11 },
      { titel: "Stand", breite: 11 }, { titel: "Groesse KB", breite: 11 }],
    zeilen: liste }]);

  mappe.arrayBuffer().then(ab => {
    dateien.unshift({ name: "Fotos_Liste.xlsx", inhalt: new Uint8Array(ab) });
    dateien.unshift({ name: "LIESMICH.txt", inhalt:
      "Fotos aus der Kombi-Tafel\r\n" +
      "Geschrieben am " + exStandText() + "\r\n\r\n" +
      anzahl + " Bilder, je Person ein Unterordner.\r\n" +
      "Der Dateiname faengt mit der festen Nummer der Kombination an, dann das Datum.\r\n" +
      "Welches Bild zu welcher Kombination gehoert, steht in Fotos_Liste.xlsx.\r\n\r\n" +
      (kaputt ? kaputt + " Bild(er) liessen sich nicht lesen und fehlen hier.\r\n" : "") +
      (ohne ? ohne + " Kombination(en) haben gar kein Foto.\r\n" : "")
    });
    exSpeichern(exZip(dateien), "Fotos_" + exHeute() + ".zip");
    exMeldung("<b>" + anzahl + " Fotos</b> gepackt (" + (bytes / 1048576).toFixed(1) +
      " MB): <b>Fotos_" + exHeute() + ".zip</b>." +
      (kaputt ? " " + kaputt + " Bild(er) waren nicht lesbar und fehlen." : "") +
      (ohne ? " " + ohne + " Kombination(en) haben kein Foto." : ""), "gut");
  });
}

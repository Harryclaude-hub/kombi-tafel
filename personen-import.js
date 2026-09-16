// ============================================================
// PERSONEN AUS DER LISTE ABGLEICHEN UND ANLEGEN
//
// Karam (16.09.2026): "Ich moechte, dass du alle Personen aus der
// Excel-Datei hinzufuegst. Alle Personen. Auch wenn da null ist. Einfach
// P, ihr Name dazu."
//
// WARUM DAS HIER IM BROWSER STEHT UND NICHT AUF DEM SERVER GEMACHT WURDE
// Die Personennamen liegen Ende-zu-Ende verschluesselt in kt_ordner. Der
// Schluessel liegt nur auf Karams Geraet. Vom Server aus laesst sich
// weder lesen, WELCHE P-Nummern es schon gibt, noch eine neue anlegen,
// ohne die Verschluesselung auszuhebeln. Deshalb: Liste einfuegen, der
// Browser vergleicht und legt an.
//
// ES WIRD NICHTS GERATEN: verglichen wird ueber die P-Nummer
// (personNummer aus logik.js), nicht ueber den Namen. Was die Liste
// nicht hergibt, wird nicht erfunden, sondern benannt.
// ============================================================
"use strict";

let piZeilen = [];      // das, was zuletzt eingefuegt wurde
let piPlan = null;      // was daraus folgt: anlegen / vorhanden / unklar

// Die Anbieter-Namen aus Karams Liste auf die Kuerzel der Tafel.
// Was hier NICHT drinsteht, wird spaeter ausdruecklich als "unbekannter
// Anbieter" gemeldet - nicht stillschweigend weggelassen.
const PI_ANBIETER = {
  "stake": "st", "interwetten": "iw", "iw": "iw", "bwin": "bw",
  "bet365": "b3", "365": "b3", "admiral": "ad", "ad": "ad",
  "betway": "bt", "merkurbets": "mb", "merkur bets": "mb", "merkur": "mb",
};

function piPanelHtml() {
  return '<details class="pi-kasten"><summary>&#128203; Personen aus einer Liste abgleichen und anlegen</summary>' +
    '<div class="inhalt">' +
    '<p class="mini">Fuege hier die Zeilen aus deiner Konten-Uebersicht ein. Eine Zeile je Konto, ' +
    "die Spalten durch einen Tabulator getrennt (aus Excel kopiert passt das von selbst):<br>" +
    "<code>P-Nummer &nbsp; Anbieter &nbsp; Eingezahlt &nbsp; Aktuell &nbsp; Notiz</code><br>" +
    "Es reicht auch die reine P-Nummer je Zeile. <b>Jede P-Nummer wird angelegt, auch die mit null.</b></p>" +
    '<textarea id="pi_text" rows="8" placeholder="P-494&#9;Stake&#9;1000&#9;1440,77&#10;P-525&#9;Stake&#9;0&#9;0"></textarea>' +
    // Karam soll nicht tippen muessen: die Datei laden reicht.
    '<p><label class="fotoknopf">&#128193; Liste aus Datei laden' +
      '<input type="file" accept=".txt,.csv,.tsv,text/plain" style="display:none" ' +
      'onchange="piDateiLaden(this)"></label> ' +
      '<span class="mini">Eine Textdatei mit einer Zeile je Konto, Spalten durch Tabulator ' +
      "oder Strichpunkt getrennt. Aus Excel: Speichern unter, Textdatei.</span></p>" +
    '<p><button class="haupt" onclick="piVergleichen()">Vergleichen</button> ' +
    '<button onclick="piLeeren()">Feld leeren</button></p>' +
    '<div id="pi_ergebnis"></div>' +
    // Zweiter Schritt: die Kontostaende. Getrennt, weil das GELD ist -
    // erst Personen anlegen, dann ansehen, dann eintragen.
    '<h4>Schritt 2: Kontostände zum Stichtag übernehmen</h4>' +
    '<div id="pi_staende"><p class="mini">Erst oben einfügen und auf Vergleichen drücken.</p></div>' +
    "</div></details>";
}

// Eine eingefuegte Zeile zerlegen. Komma als Dezimalzeichen, Punkt als
// Tausenderzeichen - so kommt es aus Excel.
function piZahl(t) {
  const s = String(t === undefined || t === null ? "" : t).trim();
  if (!s) return null;
  const r = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isFinite(r) ? r : null;
}

function piLesen(text) {
  const raus = [];
  for (const roh of String(text || "").split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile) continue;
    const teil = zeile.split(/\t|;/).map(x => x.trim());
    const name = teil[0];
    if (!name) continue;
    // Kopfzeile und Summenzeilen ueberspringen, aber NUR diese.
    if (/^(person|p-nummer|summe|zusammen|ziel)$/i.test(name)) continue;
    const anb = (teil[1] || "").trim();
    raus.push({
      name: name,
      nummer: (typeof personNummer === "function") ? personNummer(name) : null,
      anbieterText: anb,
      kz: PI_ANBIETER[anb.toLowerCase()] || null,
      eingezahlt: piZahl(teil[2]),
      aktuell: piZahl(teil[3]),
      notiz: (teil[4] || "").trim(),
      roh: zeile,
    });
  }
  return raus;
}

// Eine Textdatei ins Feld laden. Scheitert das Lesen, wird das GESAGT -
// ein leeres Feld saehe aus wie "Datei war leer".
function piDateiLaden(input) {
  const datei = input.files && input.files[0];
  if (!datei) return;
  const leer = () => { try { input.value = ""; } catch (e) { } };
  const leser = new FileReader();
  leser.onerror = () => {
    leer();
    meldungM("Diese Datei liess sich nicht lesen (" + textSicherM(datei.name) + ").", "warn");
  };
  leser.onload = ev => {
    leer();
    const feld = el("pi_text");
    if (!feld) return;
    feld.value = String(ev.target.result || "");
    const zeilen = feld.value.split(/\r?\n/).filter(x => x.trim()).length;
    meldungM("<b>" + textSicherM(datei.name) + "</b> geladen, " + zeilen +
      " Zeilen. Jetzt auf <b>Vergleichen</b> drücken.", "gut");
    piVergleichen();
  };
  leser.readAsText(datei, "utf-8");
}

function piLeeren() {
  const f = el("pi_text");
  if (f) f.value = "";
  const e = el("pi_ergebnis");
  if (e) e.innerHTML = "";
  piZeilen = []; piPlan = null;
}

function piVergleichen() {
  const feld = el("pi_text");
  const ziel = el("pi_ergebnis");
  if (!feld || !ziel) return;
  piZeilen = piLesen(feld.value);
  if (!piZeilen.length) {
    ziel.innerHTML = '<div class="warnkern">Im Feld steht keine brauchbare Zeile. ' +
      "Eine Zeile je Konto, Spalten durch Tabulator getrennt.</div>";
    return;
  }
  const da = Array.isArray(ordnerListe) ? ordnerListe : [];
  // Verglichen wird ueber die P-NUMMER, nicht ueber den Namen: "P-7" und
  // "P-7 Max" sind dieselbe Person, "Max" allein waere eine andere.
  const nachNummer = new Map();
  // Dieselbe P-Nummer zweimal in der Tafel ist ein echtes Problem: das
  // Geld landet dann auf der einen Karte und die Scheine haengen an der
  // anderen. Deshalb wird es gezaehlt und gemeldet, nicht verschwiegen.
  const doppelt = new Map();
  for (const o of da) {
    const n = (typeof personNummer === "function") ? personNummer(o.name) : null;
    if (n === null) continue;
    if (nachNummer.has(n)) {
      if (!doppelt.has(n)) doppelt.set(n, [nachNummer.get(n)]);
      doppelt.get(n).push(o);
    } else nachNummer.set(n, o);
  }
  const vorhanden = [], fehlt = [], ohneNummer = [], unbekannterAnbieter = [];
  const gesehen = new Set();
  for (const z of piZeilen) {
    if (z.nummer === null) { ohneNummer.push(z); continue; }
    if (z.anbieterText && !z.kz) unbekannterAnbieter.push(z);
    if (gesehen.has(z.nummer)) continue;      // dieselbe Person, zweites Konto
    gesehen.add(z.nummer);
    if (nachNummer.has(z.nummer)) vorhanden.push({ z: z, o: nachNummer.get(z.nummer) });
    else fehlt.push(z);
  }
  // Personen, die es in der Tafel gibt, aber nicht in der Liste
  const nurInTafel = da.filter(o => {
    const n = (typeof personNummer === "function") ? personNummer(o.name) : null;
    return n === null || !gesehen.has(n);
  });
  piPlan = { vorhanden: vorhanden, fehlt: fehlt, ohneNummer: ohneNummer,
    unbekannterAnbieter: unbekannterAnbieter, nurInTafel: nurInTafel };

  let h = "";
  if (doppelt.size) {
    h += '<div class="pi-block pi-warn"><b>&#9888; ' + doppelt.size +
      " P-Nummer(n) gibt es in der Tafel ZWEIMAL.</b> Das muss weg, bevor Kontostände " +
      "eingetragen werden: sonst hängen die Scheine an der einen Karte und das Geld an der " +
      "anderen.<div class=\"pi-liste\">" +
      [...doppelt.entries()].map(([n, liste]) =>
        '<span class="pi-chip">P-' + n + " (" + liste.length + "&times;)</span>").join(" ") +
      '</div><p class="mini">Die leere Karte kannst du oben bei den Personen löschen, ' +
      "der Löschen-Knopf erscheint nur, wenn nichts daran hängt.</p></div>";
  }
  h += '<div class="pi-summe">' +
    '<span class="pi-k"><b>' + piZeilen.length + "</b> Zeilen eingefügt</span>" +
    '<span class="pi-k"><b>' + gesehen.size + "</b> verschiedene P-Nummern</span>" +
    '<span class="pi-k pi-da"><b>' + vorhanden.length + "</b> schon da</span>" +
    '<span class="pi-k pi-neu"><b>' + fehlt.length + "</b> fehlen</span>" +
    "</div>";

  if (fehlt.length) {
    h += '<div class="pi-block"><b>Diese ' + fehlt.length + " Personen fehlen in der Tafel:</b>" +
      '<div class="pi-liste">' + fehlt.map(z =>
        '<span class="pi-chip">' + textSicherM(z.name) + "</span>").join(" ") + "</div>" +
      (darfSchreiben()
        ? '<p><button class="haupt" onclick="piAnlegen()">Diese ' + fehlt.length +
          " Personen jetzt anlegen</button> " +
          '<span class="mini">Angelegt wird nur der Name. Die Kontostände kommen ' +
          "im zweiten Schritt darunter.</span></p>"
        : '<p class="mini">In diesem Bereich darfst du nicht schreiben.</p>') +
      "</div>";
  } else {
    h += '<div class="pi-block pi-gut"><b>Es fehlt keine Person.</b> Jede P-Nummer aus der ' +
      "Liste ist schon in der Tafel.</div>";
  }

  if (vorhanden.length) {
    h += '<details class="pi-block"><summary>' + vorhanden.length +
      " Personen sind schon da (ansehen)</summary><div class=\"pi-liste\">" +
      vorhanden.map(v => '<span class="pi-chip pi-chip-da">' + textSicherM(v.z.name) +
        (v.o.name !== v.z.name ? ' <span class="mini">heißt hier: ' + textSicherM(v.o.name) + "</span>" : "") +
        "</span>").join(" ") + "</div></details>";
  }
  if (nurInTafel.length) {
    h += '<details class="pi-block"><summary>' + nurInTafel.length +
      " Personen sind in der Tafel, aber nicht in deiner Liste (ansehen)</summary>" +
      '<div class="pi-liste">' + nurInTafel.map(o =>
        '<span class="pi-chip">' + textSicherM(o.name) + "</span>").join(" ") +
      '</div><p class="mini">Die bleiben unberührt. Es wird nie etwas gelöscht.</p></details>';
  }
  // Was die Liste nicht hergibt, wird BENANNT statt weggelassen.
  if (ohneNummer.length) {
    h += '<div class="pi-block pi-warn"><b>' + ohneNummer.length +
      " Zeile(n) ohne P-Nummer</b> - die kann ich nicht zuordnen und lasse sie weg:" +
      '<div class="pi-liste">' + ohneNummer.slice(0, 12).map(z =>
        '<span class="pi-chip">' + textSicherM(z.name) + "</span>").join(" ") +
      (ohneNummer.length > 12 ? " und weitere" : "") + "</div></div>";
  }
  if (unbekannterAnbieter.length) {
    const namen = [...new Set(unbekannterAnbieter.map(z => z.anbieterText))];
    h += '<div class="pi-block pi-warn"><b>Unbekannte Anbieter:</b> ' +
      namen.map(n => textSicherM(n)).join(", ") +
      '. <span class="mini">Die Personen werden trotzdem angelegt. Nur ein Guthaben ' +
      "könnte ich diesen Anbietern später nicht zuordnen, weil es sie in der Tafel nicht gibt.</span></div>";
  }
  ziel.innerHTML = h;
  // Schritt 2 gleich mitrechnen, damit Karam sieht, was danach kaeme.
  if (typeof piStaendeZeigen === "function") piStaendeZeigen();
}

// Legt die fehlenden Personen an. Eine nach der anderen, und jede
// Rueckmeldung wird ausgewertet: ein Fehlschlag darf nicht untergehen.
async function piAnlegen() {
  if (!piPlan || !piPlan.fehlt.length) return;
  const ziel = el("pi_ergebnis");
  const wieViele = piPlan.fehlt.length;
  if (!confirm("Es werden " + wieViele + " neue Personen angelegt.\n\n" +
      "Es wird nichts gelöscht und nichts überschrieben. Weiter?")) return;

  let gemacht = 0;
  const fehler = [];
  for (const z of piPlan.fehlt) {
    const r = await supaOrdnerAnlegen(aktiverBereich.id, z.name);
    if (r.fehler) { fehler.push(z.name + ": " + r.fehler); continue; }
    if (r.ordner && r.ordner.id && typeof personGemerkt === "function") personGemerkt(r.ordner.id);
    gemacht++;
  }
  let text = "<b>" + gemacht + " von " + wieViele + " Personen angelegt.</b>";
  if (fehler.length) {
    text += " <b>Nicht angelegt:</b> " + fehler.slice(0, 8).join("; ") +
      (fehler.length > 8 ? " und " + (fehler.length - 8) + " weitere" : "");
  }
  meldungM(text, fehler.length ? "warn" : "gut");
  if (ziel) ziel.innerHTML = '<div class="' + (fehler.length ? "warnkern" : "merk") + '">' +
    text + " Der Vergleich wird gleich neu gerechnet.</div>";
  await zeichneBereich();
  // Nach dem Neuzeichnen noch einmal vergleichen, damit man sieht, dass
  // sie jetzt wirklich da sind.
  if (el("pi_text")) piVergleichen();
}

// ============================================================
// KONTOSTAENDE ZUM STICHTAG UEBERNEHMEN
//
// Karam (16.09.2026): "Das ist der aktuelle Kontostand von jeder Person,
// und das ist der letzte Stand vom 14.09. um 18 Uhr. Alle Scheine, die
// danach gekommen sind, sollen von dem Gesamtbetrag abgerechnet werden."
//
// SO WIRD GERECHNET, UND WARUM NICHT EINFACHER
// Die Zahl aus der Liste ist der Stand ZUM STICHTAG. Sie enthaelt also
// schon alles, was vor dem Stichtag passiert ist. Das Programm rechnet
// aber ueber ALLE Scheine einer Person:
//
//   Guthaben = eingezahlt - zurueckgeholt - gesetzt + gewonnen + Korrektur
//
// Wuerde man die Listen-Zahl einfach als Korrektur eintragen, zoege das
// Programm die alten Scheine ein ZWEITES Mal ab. Deshalb wird die
// Korrektur so gewaehlt, dass am Stichtag genau die Listen-Zahl
// herauskommt:
//
//   Korrektur = Liste - eingezahlt + zurueckgeholt + gesetzt_vor - gewonnen_vor
//
// Danach gilt: Guthaben = Liste - gesetzt_nach + gewonnen_nach.
// Genau das, was Karam wollte.
//
// Eingetragen wird als "stand_anbieter" mit dem Datum des Stichtags -
// die Korrektur-Art, die das Programm schon kennt. Nichts wird geloescht,
// nichts ueberschrieben: es kommt eine Buchung dazu, und die steht in der
// Personen-Kasse mit einer Notiz, woher sie stammt.
// ============================================================

const PI_STICHTAG = "kt_pi_stichtag";
const PI_STICHTAG_VORGABE = "2026-09-14T18:00";
let piStandPlan = [];

function piStichtag() {
  try { return localStorage.getItem(PI_STICHTAG) || PI_STICHTAG_VORGABE; }
  catch (e) { return PI_STICHTAG_VORGABE; }
}
function piStichtagSetzen(wert) {
  try { localStorage.setItem(PI_STICHTAG, wert || PI_STICHTAG_VORGABE); } catch (e) { }
  piStaendeZeigen();
}

// Was hat diese Person bei diesem Anbieter VOR dem Stichtag gesetzt und
// gewonnen, und was danach? Genau diese Zahlen braucht die Korrektur.
function piVorStichtag(ordnerId, kz, grenze) {
  const liste = Array.isArray(kasseScheine) ? kasseScheine : [];
  let gesetzt = 0, gewonnen = 0, nachGesetzt = 0, nachGewonnen = 0, nachN = 0;
  for (const s of liste) {
    if (s.ordner !== ordnerId) continue;
    if (!s.daten || s.daten.gesperrt || s.daten.kz !== kz) continue;
    const t = new Date(s.created_at);
    const vorher = !isNaN(t.getTime()) && t <= grenze;
    const einsatz = s.daten.einsatz || 0;
    const zurueck = (s.stand === "gewonnen" && typeof echtZurueckWert === "function")
      ? echtZurueckWert(s) : 0;
    if (vorher) { gesetzt += einsatz; gewonnen += zurueck; }
    else { nachGesetzt += einsatz; nachGewonnen += zurueck; nachN++; }
  }
  return { gesetzt: gesetzt, gewonnen: gewonnen,
    nachGesetzt: nachGesetzt, nachGewonnen: nachGewonnen, nachN: nachN };
}

// Die Vorschau: was wuerde eingetragen, und was kommt danach heraus.
// Es wird NICHTS geschrieben, bevor Karam das gesehen und bestaetigt hat.
function piStaendeZeigen() {
  const ziel = el("pi_staende");
  if (!ziel) return;
  let h = '<div class="pi-zeile"><label>Stichtag (Stand der Liste): ' +
    '<input type="datetime-local" id="pi_stichtag" value="' + piStichtag() +
    '" onchange="piStichtagSetzen(this.value)"></label> ' +
    '<span class="mini">Alles, was danach gesetzt wurde, wird vom Stand abgezogen.</span></div>';
  if (!piZeilen.length) {
    ziel.innerHTML = h + '<p class="mini">Erst oben einfügen und auf Vergleichen drücken.</p>';
    return;
  }
  const grenze = new Date(piStichtag());
  if (isNaN(grenze.getTime())) {
    ziel.innerHTML = h + '<div class="warnkern">Der Stichtag ist nicht lesbar. Nichts gerechnet.</div>';
    return;
  }
  const nachNummer = new Map();
  for (const o of (Array.isArray(ordnerListe) ? ordnerListe : [])) {
    const n = (typeof personNummer === "function") ? personNummer(o.name) : null;
    if (n !== null && !nachNummer.has(n)) nachNummer.set(n, o);
  }

  const plan = [], fehlen = [], ohneAnbieter = [];
  for (const z of piZeilen) {
    if (z.nummer === null) continue;
    if (z.aktuell === null || z.aktuell === undefined) continue;   // ohne Zahl nichts tun
    const o = nachNummer.get(z.nummer);
    if (!o) { fehlen.push(z); continue; }
    if (!z.kz) { ohneAnbieter.push(z); continue; }
    const pr = personPruefen(o.id, Array.isArray(kasseScheine) ? kasseScheine : []);
    const a = pr.anbieter[z.kz] || { einge: 0, geholt: 0, korrektur: 0 };
    const v = piVorStichtag(o.id, z.kz, grenze);
    // Die SCHON vorhandene Korrektur muss abgezogen werden. Ohne das
    // verdoppelt ein zweiter Lauf den ganzen Stand - im Test kamen aus
    // 1390,77 glatte 2781,54. Mit dem Abzug ist ein zweiter Lauf eine
    // Korrektur von null und aendert nichts.
    const schon = a.korrektur || 0;
    const korrektur = z.aktuell - a.einge + a.geholt + v.gesetzt - v.gewonnen - schon;
    plan.push({ o: o, z: z,
      korrektur: Math.round(korrektur * 100) / 100,
      nachher: Math.round((z.aktuell - v.nachGesetzt + v.nachGewonnen) * 100) / 100,
      nachGesetzt: v.nachGesetzt, nachN: v.nachN });
  }
  piStandPlan = plan;

  if (!plan.length) {
    ziel.innerHTML = h + '<div class="warnkern">Keine Zeile, die sich eintragen liesse. ' +
      "Leg zuerst die fehlenden Personen an, und achte darauf, dass in der Spalte " +
      "<b>Aktuell</b> eine Zahl steht.</div>" + piRestHtml(fehlen, ohneAnbieter);
    return;
  }

  const sSt = plan.reduce((p, x) => p + x.z.aktuell, 0);
  const sNach = plan.reduce((p, x) => p + x.nachher, 0);
  h += '<div class="pi-block"><b>' + plan.length + " Kontostände werden eingetragen.</b> " +
    '<span class="mini">Es wird nichts überschrieben: je Konto kommt EINE Korrektur-Buchung dazu, ' +
    "datiert auf den Stichtag, mit Notiz woher sie kommt.</span>" +
    '<div class="tabellenrand"><table><thead><tr><th>Person</th><th>Anbieter</th>' +
    "<th>Stand laut Liste</th><th>Seit dem Stichtag gesetzt</th><th>Steht danach</th>" +
    "</tr></thead><tbody>";
  for (const p of plan) {
    h += "<tr><td>" + textSicherM(p.o.name) + "</td><td>" + textSicherM(p.z.anbieterText) + "</td>" +
      "<td><b>" + p.z.aktuell.toFixed(2) + " &euro;</b></td>" +
      "<td>" + (p.nachN
        ? p.nachN + " Stück, " + p.nachGesetzt.toFixed(2) + " &euro;"
        : '<span class="mini">nichts</span>') + "</td>" +
      "<td class='" + (p.nachher >= 0 ? "gruen" : "rot") + "'><b>" +
        p.nachher.toFixed(2) + " &euro;</b></td></tr>";
  }
  h += "</tbody><tfoot><tr><td><b>Zusammen</b></td><td></td><td><b>" + sSt.toFixed(2) +
    " &euro;</b></td><td></td><td><b>" + sNach.toFixed(2) + " &euro;</b></td></tr></tfoot>" +
    "</table></div>" +
    (darfSchreiben()
      ? '<p><button class="haupt" onclick="piStaendeEintragen()">Diese ' + plan.length +
        " Kontostände jetzt eintragen</button></p>"
      : '<p class="mini">In diesem Bereich darfst du nicht schreiben.</p>') +
    "</div>" + piRestHtml(fehlen, ohneAnbieter);
  ziel.innerHTML = h;
}

// Was NICHT eingetragen wird, steht ausdruecklich da. Weglassen waere
// genau der Fehler, bei dem spaeter Geld fehlt und niemand weiss warum.
function piRestHtml(fehlen, ohneAnbieter) {
  let h = "";
  if (fehlen.length) {
    h += '<div class="pi-block pi-warn"><b>' + fehlen.length +
      " Zeile(n) haben noch keine Person in der Tafel</b> - erst oben anlegen:" +
      '<div class="pi-liste">' + [...new Set(fehlen.map(z => z.name))].slice(0, 15)
        .map(n => '<span class="pi-chip">' + textSicherM(n) + "</span>").join(" ") + "</div></div>";
  }
  if (ohneAnbieter.length) {
    const namen = [...new Set(ohneAnbieter.map(z => z.anbieterText || "(leer)"))];
    h += '<div class="pi-block pi-warn"><b>' + ohneAnbieter.length +
      " Zeile(n) mit einem Anbieter, den die Tafel nicht kennt:</b> " +
      namen.map(n => textSicherM(n)).join(", ") +
      '. <span class="mini">Diese Stände bleiben aussen vor, damit sie nicht beim falschen ' +
      "Anbieter landen.</span></div>";
  }
  return h;
}

async function piStaendeEintragen() {
  if (!piStandPlan.length) return;
  const wieViele = piStandPlan.length;
  if (!confirm("Es werden " + wieViele + " Korrektur-Buchungen eingetragen, datiert auf den " +
      "Stichtag.\n\nEs wird nichts gelöscht und nichts überschrieben. Weiter?")) return;
  const datum = piStichtag().slice(0, 10);
  let gemacht = 0;
  const fehler = [];
  for (const p of piStandPlan) {
    const notiz = "Stand aus der Konten-Liste vom " + piStichtag().replace("T", " ") +
      ": " + p.z.aktuell.toFixed(2) + " Euro";
    const r = await supaPersonBuchen(aktiverBereich.id, p.o.id, datum, null,
      "stand_anbieter", p.z.kz, p.korrektur, notiz);
    if (r && r.error) {
      fehler.push(p.o.name + " / " + p.z.anbieterText + ": " + r.error.message);
      continue;
    }
    gemacht++;
  }
  let text = "<b>" + gemacht + " von " + wieViele + " Kontoständen eingetragen.</b>";
  if (fehler.length) text += " <b>Nicht eingetragen:</b> " + fehler.slice(0, 6).join("; ") +
    (fehler.length > 6 ? " und " + (fehler.length - 6) + " weitere" : "");
  meldungM(text, fehler.length ? "warn" : "gut");
  await zeichneBereich();
  piStaendeZeigen();
}

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
    '<p><button class="haupt" onclick="piVergleichen()">Vergleichen</button> ' +
    '<button onclick="piLeeren()">Feld leeren</button></p>' +
    '<div id="pi_ergebnis"></div></div></details>';
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
  for (const o of da) {
    const n = (typeof personNummer === "function") ? personNummer(o.name) : null;
    if (n !== null && !nachNummer.has(n)) nachNummer.set(n, o);
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

  let h = '<div class="pi-summe">' +
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
          '<span class="mini">Angelegt wird nur der Name. Guthaben und Einzahlungen ' +
          "trägst du danach ein, dazu frage ich dich getrennt.</span></p>"
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

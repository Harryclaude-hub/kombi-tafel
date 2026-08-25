// ============================================================
// LOGIK: Rechnen, Sortieren, Anzeigen, Eingaben merken.
// Keine Gestaltung hier, die liegt komplett in stil.css.
// ============================================================
"use strict";

// Stand der Daten (wird oben auf der Seite angezeigt)
const DATEN_STAND = "Fotos vom 24.08.2026, eingepflegt 24.08.2026. Gebuehren-Recherche: Stand 24.08.2026.";

// ---------- Rechnen ----------

function echteQuote(anbieter, eingabe) {
  // echte Quote = Schaufenster-Quote geteilt durch den Gebuehren-Teiler
  const t = GEBUEHREN_TEILER[anbieter];
  if (!eingabe || eingabe <= 1) return null;
  return eingabe / t;
}

function rund2(x) { return Math.round(x * 100) / 100; }

// Anstoss lesen; "?" am Ende = Uhrzeit unbekannt.
// Die Foto-Zeit wird um ZEITVERSATZ_MINUTEN nach vorne gerechnet (UK -> Oesterreich).
function liesAnstoss(an) {
  const unklar = an.endsWith("?");
  const iso = unklar ? an.slice(0, -1) : an;
  const d = new Date(iso);
  const versatz = (typeof ZEITVERSATZ_MINUTEN === "number") ? ZEITVERSATZ_MINUTEN : 0;
  if (!unklar && versatz) d.setMinutes(d.getMinutes() + versatz);
  return { zeit: d, unklar: unklar };
}

// Welche Zeitangabe gilt fuer diese Wette: korrigierte, sonst die aus dem Foto
function anstossFeld(w) { return w.anKorrigiert || w.an; }

function zeitText(an) {
  const a = liesAnstoss(an);
  const t = a.zeit;
  const dd = String(t.getDate()).padStart(2, "0");
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const hh = String(t.getHours()).padStart(2, "0");
  const mi = String(t.getMinutes()).padStart(2, "0");
  if (a.unklar) return dd + "." + mm + ". Zeit?";
  return dd + "." + mm + ". " + hh + ":" + mi;
}

function istVorbei(an) {
  const a = liesAnstoss(an);
  if (a.unklar) {
    // Uhrzeit unbekannt: erst am Folgetag als vorbei werten
    const ende = new Date(a.zeit); ende.setHours(23, 59);
    return new Date() > ende;
  }
  return new Date() > a.zeit;
}

function jetztText() {
  const t = new Date();
  return String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") +
    ". " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
}

// ---------- Markt-Einschaetzung (wer hat die Wette ueberhaupt) ----------
// J = ja, D = duenn (nur Teile, oft nur Topspiele), N = vermutlich gar nicht.
// Das ist Einschaetzung nach Liga-Stufe und Markttyp, kein Beleg.

const STUFEN = {
  "UEFA Conference League":"A","K League 1":"A","Liga Profesional de Futbol":"A",
  "Liga MX, Apertura":"A","Pro League (BEL)":"A","Scottish Premiership":"A",
  "Championship":"A","3. Liga":"A","Ekstraklasa":"A","J1 League":"A",
  "Czech First League":"A","SuperLiga Romaniei":"A","Stoiximan Super League":"A",
  "Saudi Pro League":"A","LaLiga 2":"A","Copa Betano do Brasil":"A","Esp2":"A",
  "Spain1":"A","WTA":"A","ATP":"A",
  "First Division (IRL)":"B","Liga AUF Uruguaya":"B","Chinese Super League":"B",
  "Primera A (COL)":"B","Liga de Primera (CHI)":"B","League Two":"B",
  "Copa Chile":"B","Norwegian 1st Division":"B","USL Championship":"B",
  "South African Premier Division":"B","Challenge League":"B","National League":"B",
  "Australia Cup":"C","Liga 2 Casa Pariurilor":"C","Ligue 3":"C",
  "Liga MX, Women, Apertura":"C","Besta deild karla":"C","TOPLYGA":"C",
  "Scottish Challenge Cup":"C"
};

function marktTyp(w) {
  if (w.kat === "ECKEN") return "CORNER";
  if (w.kat === "HTFT") return "HTFT";
  if (w.kat === "DNB") return "DNB";
  if (w.kat === "TENNIS") return "TENNIS";
  return (w.s === "S2") ? "ASIAN" : "STD";
}

// [iw, bw, b3, st]
const VERF = {
  "STD_A":["J","J","J","J"],   "STD_B":["J","J","J","J"],   "STD_C":["D","D","J","J"],
  "ASIAN_A":["D","J","J","J"], "ASIAN_B":["D","D","J","J"], "ASIAN_C":["N","N","J","J"],
  "CORNER_A":["D","D","J","J"],"CORNER_B":["N","N","J","J"],"CORNER_C":["N","N","D","D"],
  "HTFT_A":["J","J","J","J"],  "HTFT_B":["D","D","J","J"],  "HTFT_C":["N","N","D","D"],
  "TENNIS_A":["J","J","J","J"],"DNB_A":["J","J","J","J"],   "DNB_B":["J","J","J","J"]
};

function verfuegbarkeit(w) {
  const stufe = STUFEN[w.liga] || "B";
  const v = VERF[marktTyp(w) + "_" + stufe] || ["J","J","J","J"];
  return { iw: v[0], bw: v[1], b3: v[2], st: v[3] };
}

// Start-Vorgabe (solange keine Live-Quoten getippt sind):
// KEINE Aussage ueber die beste Quote! Nur: wo zuerst schauen.
// Reihenfolge nach der 80-Kriterien-Recherche. Interwetten immer zuletzt (Gebuehr).
function standardAnbieter(w) {
  const typ = marktTyp(w);
  const rang = (typ === "ASIAN" || typ === "CORNER" || typ === "TENNIS")
    ? ["b3", "st", "bw", "iw"]     // Spezialmaerkte: Bet365, dann Stake
    : ["b3", "bw", "st", "iw"];    // Standardmaerkte: Bet365, dann Bwin
  const v = verfuegbarkeit(w);
  for (const kz of rang) if (v[kz] === "J") return kz;
  for (const kz of rang) if (v[kz] === "D") return kz;
  return "b3";
}

// ---------- Eingaben merken (localStorage, mit Zeitstempel) ----------

function schluessel(id, opt, anbieter) { return "q_" + id + "_" + opt + "_" + anbieter; }

function liesEingabe(id, opt, anbieter) {
  const v = localStorage.getItem(schluessel(id, opt, anbieter));
  return v ? parseFloat(v) : null;
}

function liesEingabeZeit(id, opt, anbieter) {
  const t = localStorage.getItem("t_" + schluessel(id, opt, anbieter));
  if (!t) return null;
  const d = new Date(t);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    ". " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function speichereEingabe(id, opt, anbieter, wert) {
  const k = schluessel(id, opt, anbieter);
  if (wert) {
    localStorage.setItem(k, wert);
    localStorage.setItem("t_" + k, new Date().toISOString());
  } else {
    localStorage.removeItem(k);
    localStorage.removeItem("t_" + k);
  }
}

// Wann wurde bei diesem Anbieter fuer diese Wette zuletzt nachgeschaut
function liesGeprueft(id, anbieter) {
  const t = localStorage.getItem("p_" + id + "_" + anbieter);
  if (!t) return null;
  const d = new Date(t);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    ". " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function merkeGeprueft(id, anbieter) {
  localStorage.setItem("p_" + id + "_" + anbieter, new Date().toISOString());
}

function gewaehlteOption(w) {
  const v = localStorage.getItem("opt_" + w.id);
  if (v !== null) {
    const i = parseInt(v, 10);
    if (i >= 0 && i < w.o.length) return i;
  }
  return 0; // Standard: sicherste Option (Regel Nr. 1)
}

// ---------- Zuweisung: bei welchem Anbieter wird DIESE Wette gesetzt ----------

const ANBIETER = [
  // suche: %s wird durch den ersten Teamnamen ersetzt.
  // direkt = die Adresse springt wirklich in die Suche (geprueft).
  // sonst oeffnet sich die Sportwetten-Startseite und du fuegst den Namen
  // oben in die Lupe ein (Kopier-Knopf steht in der Zelle).
  { kz: "iw", name: "Interwetten", url: "https://www.interwetten.com/de/sportwetten",
    suche: "https://www.interwetten.com/de/sportwetten", direkt: false },
  { kz: "bw", name: "Bwin", url: "https://sports.bwin.com/de/sports",
    suche: "https://sports.bwin.com/de/sports/search?query=%s", direkt: true },
  { kz: "b3", name: "Bet365", url: "https://www.bet365.com/",
    suche: "https://www.bet365.com/#/AS/B1/", direkt: false },
  { kz: "st", name: "Stake", url: "https://stake.com/de/sports",
    suche: "https://stake.com/de/sports/search?query=%s", direkt: false }
];

// Erster Teamname einer Wette, zum Suchen und Kopieren
function suchName(w) {
  const teile = w.spiel.split(/ vs | - /);
  return teile[0].trim();
}

function anbieterSuchLink(a, w) {
  return a.suche.replace("%s", encodeURIComponent(suchName(w)));
}

function anbieterName(kz) { return ANBIETER.find(a => a.kz === kz).name; }

// Bester aus den GETIPPTEN Quoten (echt gerechnet); null wenn nichts getippt
function liveBester(w, optIdx) {
  const opt = w.o[optIdx][0];
  let bester = null, wert = 0, anzahl = 0;
  for (const a of ANBIETER) {
    const echt = echteQuote(a.kz, liesEingabe(w.id, opt, a.kz));
    if (echt) { anzahl++; if (echt > wert) { wert = echt; bester = a.kz; } }
  }
  return anzahl > 0 ? { kz: bester, echt: wert, anzahl: anzahl } : null;
}

// Rangliste der vier Anbieter fuer DIESE Wette, bester zuerst.
// Getippte echte Quoten zaehlen zuerst (absteigend); ohne Eingaben entscheidet
// die Markt-Verfuegbarkeit und dann die Standard-Reihenfolge der Recherche.
function rangliste(w) {
  const optIdx = gewaehlteOption(w);
  const opt = w.o[optIdx][0];
  const v = verfuegbarkeit(w);
  const typ = marktTyp(w);
  const basis = (typ === "ASIAN" || typ === "CORNER" || typ === "TENNIS")
    ? ["b3", "st", "bw", "iw"] : ["b3", "bw", "st", "iw"];
  const vw = { J: 2, D: 1, N: 0 };
  const liste = ANBIETER.map(a => {
    const echt = echteQuote(a.kz, liesEingabe(w.id, opt, a.kz));
    return { kz: a.kz, echt: echt || 0, hat: !!echt, v: vw[v[a.kz]], p: basis.indexOf(a.kz) };
  });
  liste.sort((x, y) => (y.hat - x.hat) || (y.echt - x.echt) || (y.v - x.v) || (x.p - y.p));
  return liste;
}

// Die Zuweisung: der Anbieter auf dem gewaehlten Rang (1 = bester)
function zuweisung(w) {
  const l = rangliste(w);
  const idx = Math.min(aktiverRang - 1, l.length - 1);
  const e = l[idx];
  const getippte = l.filter(x => x.hat).length;
  return { kz: e.kz, echt: e.hat ? e.echt : null, quelle: e.hat ? "getippt" : "vorgabe",
           anzahl: getippte, rang: idx + 1, verfN: e.v === 0 };
}

// ---------- Recherche-Quoten (Markt jetzt) ----------

function rechercheFuer(w, optIdx) {
  if (typeof RECHERCHE === "undefined") return null;
  const r = RECHERCHE[w.id];
  if (!r) return null;
  const linie = w.o[optIdx][0];
  const wert = r.werte[linie];
  return { wert: (typeof wert === "number") ? wert : null, zeit: r.zeit,
           url: r.url, notiz: r.notiz || "" };
}

// ---------- Links je Wette ----------

function vergleichsLink(w) {
  // Suche nach dem Spiel auf einem Quotenvergleich: ein Klick, alle Anbieter-Quoten
  const teile = w.spiel.split(" vs ");
  const q = teile.map(t => '"' + t.trim() + '"').join(" ") + " quoten oddspedia";
  return "https://www.google.com/search?q=" + encodeURIComponent(q);
}

// ---------- Filter-Zustand ----------

const KATEGORIEN = [
  ["ALLE", "Alle"],
  ["SIEG", "Sieg + Handicap"],
  ["TORE", "Tore Ueber/Unter"],
  ["ECKEN", "Ecken"],
  ["BTTS", "Beide treffen"],
  ["HTFT", "Halbzeit/Endstand"],
  ["DNB", "Draw No Bet"],
  ["TENNIS", "Tennis"]
];

let aktiveKat = "ALLE";
let aktiverAnbieter = "ALLE";
let aktiverRang = 1;   // 1 = bester Anbieter, 2 = zweitbester, ...
let aktiverReiter = "ALLE";

// Die Reiter: wo die Wette in der App steckt. Bewusst sprechende Namen
// statt S1..S8, damit nichts verwechselt wird.
const REITER = [
  ["SIEG",   "Siegwette"],
  ["ASIA",   "Asiatische Linien"],
  ["TORE",   "Tore Ueber/Unter"],
  ["ECKEN",  "Ecken"],
  ["BTTS",   "Beide treffen"],
  ["HZ-END", "Halbzeit/Endstand"],
  ["DNB",    "Draw No Bet"],
  ["TENNIS", "Tennis Sieg"]
];
let nurKommende = true;
const offeneDetails = new Set();

// Grundmenge fuer ALLE Zaehler: dieselbe Sicht (vergangene raus, wenn Schalter an)
function sichtBasis() {
  return nurKommende ? WETTEN.filter(w => !istVorbei(anstossFeld(w))) : WETTEN.slice();
}

function basisListe() {
  let liste = sichtBasis();
  if (aktiveKat !== "ALLE") liste = liste.filter(w => w.kat === aktiveKat);
  if (aktiverReiter !== "ALLE") liste = liste.filter(w => w.s === aktiverReiter);
  return liste;
}

function baueFilter() {
  const vorbeiZahl = WETTEN.filter(w => istVorbei(anstossFeld(w))).length;
  const basis = sichtBasis();

  // Hilfsfunktion: eine Filterzeile mit Beschriftung links und Knoepfen rechts
  function zeile(behaelterId, beschriftung, eintraege, istAktiv, beiKlick, klasse) {
    const box = document.getElementById(behaelterId);
    box.innerHTML = "";
    box.className = "filterzeile " + (klasse || "");
    const lab = document.createElement("span");
    lab.className = "f-label";
    lab.textContent = beschriftung;
    box.appendChild(lab);
    const knoepfe = document.createElement("span");
    knoepfe.className = "f-knoepfe";
    for (const e of eintraege) {
      const b = document.createElement("button");
      b.innerHTML = e.text + (e.zahl !== undefined ? ' <span class="f-zahl">' + e.zahl + "</span>" : "");
      if (istAktiv(e)) b.className = "aktiv";
      if (e.titel) b.title = e.titel;
      b.onclick = () => beiKlick(e);
      knoepfe.appendChild(b);
    }
    box.appendChild(knoepfe);
  }

  // 1) Wett-Art
  zeile("filter", "Wett-Art",
    KATEGORIEN.map(([kz, name]) => ({ kz: kz, text: name,
      zahl: basis.filter(w => kz === "ALLE" || w.kat === kz).length })),
    e => e.kz === aktiveKat,
    e => { aktiveKat = e.kz; zeichne(); }, "f-art");

  // 2) Reiter in der App
  const nachReiter = nurKommende ? basis : WETTEN;
  const reiterEintraege = [{ kz: "ALLE", text: "Alle", zahl: nachReiter.filter(w => aktiveKat === "ALLE" || w.kat === aktiveKat).length }]
    .concat(REITER.map(([kz, name]) => ({ kz: kz, text: kz, titel: name,
      zahl: nachReiter.filter(w => w.s === kz && (aktiveKat === "ALLE" || w.kat === aktiveKat)).length })));
  zeile("reiterfilter", "Reiter in der App", reiterEintraege,
    e => e.kz === aktiverReiter,
    e => { aktiverReiter = e.kz; zeichne(); }, "f-reiter");

  // 3) Anbieter-Rang
  zeile("rangfilter", "Anbieter-Rang",
    [[1, "1. Bester"], [2, "2. Zweitbester"], [3, "3. Drittbester"], [4, "4. Viertbester"]]
      .map(([r, name]) => ({ kz: r, text: name,
        titel: "Zeigt fuer jede Wette den Anbieter auf Platz " + r + " ihrer Rangliste" })),
    e => e.kz === aktiverRang,
    e => { aktiverRang = e.kz; zeichne(); }, "f-rang");

  // 4) Setzen bei
  const liste = basisListe();
  zeile("anbieterfilter", "Setzen bei",
    [{ kz: "ALLE", text: "Alle", zahl: liste.length }].concat(
      ANBIETER.map(a => ({ kz: a.kz, text: a.name,
        zahl: liste.filter(w => zuweisung(w).kz === a.kz).length }))),
    e => e.kz === aktiverAnbieter,
    e => { aktiverAnbieter = e.kz; zeichne(); }, "f-anbieter");

  // 5) Zeitraum
  zeile("zeitfilter", "Zeitraum",
    [{ kz: true, text: "Nur kommende" },
     { kz: false, text: "Auch vergangene", zahl: vorbeiZahl }],
    e => e.kz === nurKommende,
    e => { nurKommende = e.kz; zeichne(); }, "f-zeit");
}

// ---------- Erklaerung je Wette ----------

function erklaerung(w, optIdx) {
  const o = w.o[optIdx][0];
  const heim = w.wette.startsWith("HOME");
  const seite = heim ? "Heimteam" : "Auswaertsteam";
  if (w.kat === "TENNIS") return w.wette.replace(" ML", "") + " muss das Match gewinnen. Kein Unentschieden moeglich.";
  if (w.kat === "BTTS") return "Beide Teams muessen mindestens 1 Tor schiessen. 1:1 gewinnt, 3:0 verliert.";
  if (w.kat === "HTFT") return "Auswaertsteam muss zur Halbzeit fuehren UND am Ende gewinnen. Beides noetig.";
  if (w.kat === "DNB") return "Der genannte Verein muss gewinnen. Bei Unentschieden: Einsatz zurueck.";
  if (w.kat === "ECKEN") return "Beide Teams zusammen hoechstens 8 Ecken. Tore egal.";
  if (w.kat === "TORE") {
    const ueber = w.wette.startsWith("OVER");
    const l = parseFloat(o);
    let text = ueber ? ("Es muessen mehr als " + o + " Tore fallen.") : ("Es duerfen hoechstens " + o + " Tore fallen (weniger als " + o + ").");
    if (Number.isInteger(l)) text += " Bei genau " + o + " Toren: Geld zurueck.";
    else if (l % 0.5 !== 0) text += " Viertel-Linie: Einsatz wird auf zwei Linien geteilt, halbe Gewinne/Verluste moeglich.";
    return text;
  }
  if (o === "-0.5") return seite + " muss gewinnen. Punkt. (Gleiche Wette wie Siegwette 1X2, beide Preise vergleichen!)";
  if (o === "0") return seite + " muss gewinnen. Bei Unentschieden: Geld zurueck (DNB).";
  if (o === "+0.25") return seite + " muss gewinnen. Bei Unentschieden: halber Einsatz zurueck, halber gewinnt.";
  if (o === "-0.25") return seite + " muss gewinnen. Bei Unentschieden: halber Einsatz zurueck, halber verloren.";
  if (o === "-1.75") return "Muss mit 2 Toren Unterschied gewinnen: halber Gewinn bei genau 2, voller ab 3.";
  return seite + " mit Handicap " + o + ". Details im Begriffe-Kasten oben.";
}

const ANBIETER_GRUND = {
  iw: "Gebuehr: jede Quote zaehlt real nur durch 1,05 geteilt (nur bei Gewinn faellig).",
  bw: "Keine Gebuehr (Bwin uebernimmt die 5 % seit Mai 2026 selbst).",
  b3: "Keine Gebuehr. Groesstes Marktangebot, asiatische Linien und Ecken sind Spezialitaet.",
  st: "Keine Gebuehr, aber nur Krypto; Netzwerkgebuehr bei jeder Auszahlung."
};
const VERF_LANG = { J: "Markt: vorhanden", D: "Markt: nur duenn (pruefen)", N: "Markt: vermutlich NICHT vorhanden" };

// Wer koennte bei DIESEM Markttyp besser sein als der Start-Tipp (Durchschnitts-Erfahrung)
function alternativText(w) {
  const typ = marktTyp(w);
  const stufe = STUFEN[w.liga] || "B";
  if (typ === "ASIAN" || typ === "CORNER" || stufe === "C")
    return "Stake: hat bei Nischenligen, Viertel-Linien und Ecken im Schnitt die niedrigste Marge der vier (ca. 4,6 %). Wenn Krypto ok ist, dort zuerst gegenpruefen.";
  if (typ === "TENNIS")
    return "Stake: bei Tennis-Quoten oft gleichauf oder besser; kleine Turniere fuehrt Bet365 aber haeufiger.";
  if (stufe === "A")
    return "Bwin: bei Standardmaerkten grosser Ligen oft gleichauf mit Bet365, dazu Boost-Aktionen. Gegenpruefen lohnt.";
  return "Bwin oder Stake: bei Standardmaerkten liegen alle drei nah beieinander, der Vergleichslink entscheidet.";
}

// ---------- Zellen bauen ----------

const VERF_TEXT = { J: "", D: "Markt duenn, pruefen", N: "kein Markt (vermutl.)" };

function eingabeFeld(w, opt, anbieter) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = "0.01"; inp.min = "1";
  inp.placeholder = "Quote";
  inp.title = "Nur die Quote eintippen, die die App fuer GENAU diese Wette anzeigt, z. B. 2.30. Nichts umrechnen, kein Einsatz. Anleitung: Kasten oben.";
  const v = liesEingabe(w.id, opt, anbieter);
  if (v) inp.value = v;
  inp.oninput = () => {
    speichereEingabe(w.id, opt, anbieter, inp.value);
    if (inp.value) merkeGeprueft(w.id, anbieter);
    aktualisiereZeile(w.id);
  };
  return inp;
}

function zelleAnbieter(w, optIdx, anbieter, zu) {
  const td = document.createElement("td");
  td.className = "anbieter " + anbieter;
  const a = ANBIETER.find(x => x.kz === anbieter);
  const opt = w.o[optIdx][0];
  const ref = w.o[optIdx][1];
  const v = verfuegbarkeit(w)[anbieter];

  // Kopfzeile der Zelle: Link zum Anbieter, dazu Kopier-Knopf fuer den Teamnamen
  const oben = document.createElement("div");
  oben.className = "z-kopf";
  const lnk = document.createElement("a");
  lnk.href = anbieterSuchLink(a, w);
  lnk.target = "_blank";
  lnk.rel = "noopener";
  lnk.className = "oeffnen";
  lnk.textContent = a.direkt ? "Suche oeffnen" : "Seite oeffnen";
  lnk.title = a.direkt
    ? ("Oeffnet die Suche nach \"" + suchName(w) + "\" direkt bei " + a.name)
    : ("Oeffnet " + a.name + ". Dort oben die Lupe antippen und \"" + suchName(w) + "\" einfuegen (Kopier-Knopf daneben).");
  lnk.onclick = () => { merkeGeprueft(w.id, anbieter); setTimeout(() => aktualisiereZeile(w.id), 50); };
  oben.appendChild(lnk);

  const kopie = document.createElement("button");
  kopie.className = "kopier";
  kopie.textContent = "Name";
  kopie.title = "Teamnamen \"" + suchName(w) + "\" kopieren, dann in der App in die Suche einfuegen";
  kopie.onclick = (ev) => {
    ev.preventDefault();
    navigator.clipboard.writeText(suchName(w));
    kopie.textContent = "kopiert";
    setTimeout(() => { kopie.textContent = "Name"; }, 1200);
  };
  oben.appendChild(kopie);
  td.appendChild(oben);

  if (v === "N") {
    const kein = document.createElement("div");
    kein.className = "keinmarkt";
    kein.textContent = VERF_TEXT.N;
    td.appendChild(kein);
  } else {
    td.appendChild(eingabeFeld(w, opt, anbieter));

    const e = liesEingabe(w.id, opt, anbieter);
    const echt = echteQuote(anbieter, e);
    const info = document.createElement("div");
    info.className = "real";
    if (echt) {
      info.innerHTML = "<b>real " + rund2(echt).toFixed(2) + "</b>";
    } else if (anbieter === "iw") {
      info.textContent = "Foto " + ref.toFixed(2) + " > real " + rund2(ref / GEBUEHREN_TEILER.iw).toFixed(2);
    } else {
      info.textContent = "Foto-Quote " + ref.toFixed(2) + ", kein Abzug";
    }
    td.appendChild(info);

    if (v === "D") {
      const d = document.createElement("div");
      d.className = "duenn";
      d.textContent = VERF_TEXT.D;
      td.appendChild(d);
    }
  }

  // Zeitstempel: wann zuletzt bei diesem Anbieter nachgeschaut
  const gep = liesGeprueft(w.id, anbieter);
  const zeile = document.createElement("div");
  zeile.className = gep ? "geprueft" : "real";
  zeile.textContent = gep ? ("geprueft " + gep) : "noch nicht geprueft";
  td.appendChild(zeile);

  if (zu.kz === anbieter) {
    td.classList.add(zu.quelle === "getippt" ? "bester" : "empfohlen");
    const tag = document.createElement("div");
    tag.className = "tag";
    if (zu.rang === 1) {
      tag.textContent = (zu.quelle === "getippt") ? "BESTER (getippt)" : "START-TIPP";
    } else {
      tag.textContent = zu.rang + ". WAHL" + (zu.quelle === "getippt" ? " (getippt)" : "");
    }
    if (v === "N") tag.textContent += ", Markt fehlt wohl";
    td.appendChild(tag);
  }
  return td;
}

// Aufklapp-Zeile mit Erklaerung, Begruendung, Links und Zeitstempeln
function baueDetailZeile(w) {
  const optIdx = gewaehlteOption(w);
  const opt = w.o[optIdx][0];
  const tr = document.createElement("tr");
  tr.className = "detail";
  tr.id = "d_" + w.id;
  const td = document.createElement("td");
  td.colSpan = 12;

  const v = verfuegbarkeit(w);
  let anbieterHtml = "";
  for (const a of ANBIETER) {
    const e = liesEingabe(w.id, opt, a.kz);
    const wann = liesEingabeZeit(w.id, opt, a.kz);
    const getippt = e
      ? ("Getippt: <b>" + e.toFixed(2) + "</b> am " + wann + ", real " + rund2(echteQuote(a.kz, e)).toFixed(2) + ".")
      : "Noch keine Live-Quote getippt.";
    anbieterHtml += "<li><a href=\"" + a.url + "\" target=\"_blank\" rel=\"noopener\">" + a.name + "</a>: " +
      ANBIETER_GRUND[a.kz] + " " + VERF_LANG[v[a.kz]] + ". " + getippt + "</li>";
  }

  td.innerHTML =
    "<b>Was die Wette heisst:</b> " + erklaerung(w, optIdx) +
    "<br><b>Warum dieser Start-Tipp:</b> Start-Tipp ist KEINE Aussage ueber die beste Live-Quote, " +
    "sondern nur: dort zuerst schauen (keine Gebuehr, Markt vorhanden). Die echte beste Quote entsteht " +
    "erst aus deinen getippten Zahlen oder ueber den Vergleichs-Link." +
    (function () {
      const r = rechercheFuer(w, optIdx);
      if (!r) return "";
      return "<br><b>Fremdvergleich (nur zur Einordnung, NICHT zum Wetten):</b> " +
        (r.wert ? r.wert.toFixed(2) : "Linie nicht gelistet") +
        ", gesucht am " + r.zeit + ". " + r.notiz +
        ' <a href="' + r.url + '" target="_blank" rel="noopener">Quelle oeffnen</a>' +
        "<br><small>Das ist die beste Quote des Quotenvergleichs, NICHT die eines bestimmten " +
        "der vier Anbieter. Interwetten und Stake sind dort nicht gelistet.</small>";
    })() +
    "<br><b>Gegenpruefen bei:</b> " + alternativText(w) +
    "<br><b>Interwetten-Schwelle:</b> lohnt nur, wenn die Anzeige dort ueber beste andere Quote mal 1,05 liegt." +
    "<br><b>Vergleich mit einem Klick:</b> <a href=\"" + vergleichsLink(w) + "\" target=\"_blank\" rel=\"noopener\">" +
    "alle Anbieter-Quoten fuer dieses Spiel suchen</a> (oeffnet die Suche nach dem Spiel auf einem Quotenvergleich)" +
    "<br><b>Die vier Anbieter fuer diese Wette:</b><ul>" + anbieterHtml + "</ul>" +
    "<b>Datenstand dieser Zeile:</b> abgetippt aus dem Foto vom 24.08.2026 (Foto-Quote " + w.o[optIdx][1].toFixed(2) +
    "). Markt-Angaben: Einschaetzung vom 24.08.2026, kein Beleg. Angezeigt: " + jetztText() + ".";
  tr.appendChild(td);
  return tr;
}

function baueZeile(w) {
  const tr = document.createElement("tr");
  tr.id = "z_" + w.id;
  const optIdx = gewaehlteOption(w);
  if (istVorbei(anstossFeld(w))) tr.classList.add("vorbei");

  let td = document.createElement("td");
  td.className = "zeit";
  td.textContent = zeitText(anstossFeld(w));
  tr.appendChild(td);

  td = document.createElement("td");
  td.className = "zeit gemeldet";
  td.textContent = (typeof ROH !== "undefined" && ROH[w.id]) ? ROH[w.id][0] : "?";
  td.title = "Wann der Tippgeber den Tipp eingetragen hat. Je aelter, desto eher hat sich die Quote inzwischen bewegt.";
  tr.appendChild(td);

  td = document.createElement("td");
  td.innerHTML = w.liga + ' <span class="von ' + w.von + '">' + w.von + "</span>";
  tr.appendChild(td);

  td = document.createElement("td");
  td.className = "spiel";
  td.textContent = w.spiel;
  if (w.doppel) {
    const s = document.createElement("span");
    s.className = "doppel";
    s.title = "Dieses Spiel steht mehrfach in der Liste. Nur EINE der Wetten in eine Kombi nehmen!";
    s.textContent = " [doppelt]";
    td.appendChild(s);
  }
  const mehr = document.createElement("a");
  mehr.href = "#";
  mehr.className = "mehr";
  mehr.textContent = offeneDetails.has(w.id) ? "Info schliessen" : "Info + Links";
  mehr.onclick = (ev) => {
    ev.preventDefault();
    if (offeneDetails.has(w.id)) offeneDetails.delete(w.id); else offeneDetails.add(w.id);
    zeichne();
  };
  td.appendChild(document.createElement("br"));
  td.appendChild(mehr);
  tr.appendChild(td);

  td = document.createElement("td");
  td.className = "wette";
  td.title = erklaerung(w, optIdx);
  if (w.o.length > 1) {
    const sel = document.createElement("select");
    w.o.forEach((o, i) => {
      const op = document.createElement("option");
      op.value = i;
      op.textContent = w.wette.split("(")[0].trim() + " " + o[0] + "  (Foto " + o[1].toFixed(2) + ")";
      if (i === optIdx) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = () => { localStorage.setItem("opt_" + w.id, sel.value); zeichne(); };
    td.appendChild(sel);
    const hinweis = document.createElement("div");
    hinweis.className = "real";
    hinweis.textContent = "sicherste zuerst";
    td.appendChild(hinweis);
  } else {
    td.textContent = w.wette;
  }
  tr.appendChild(td);

  td = document.createElement("td");
  td.className = "tabq";
  td.textContent = w.o[optIdx][1].toFixed(2);
  tr.appendChild(td);

  const zu = zuweisung(w);
  for (const a of ANBIETER) tr.appendChild(zelleAnbieter(w, optIdx, a.kz, zu));

  td = document.createElement("td");
  td.className = "ansage";
  const rangWort = (zu.rang === 1) ? "" : (zu.rang + ". Wahl: ");
  if (zu.quelle === "getippt") {
    td.innerHTML = rangWort + '<b class="gruen">' + anbieterName(zu.kz) + "</b> real " + rund2(zu.echt).toFixed(2) +
      (zu.anzahl < 4 ? '<div class="real">' + zu.anzahl + " von 4 Quoten getippt</div>" : "");
  } else {
    td.innerHTML = rangWort + '<b class="gruen">' + anbieterName(zu.kz) +
      '</b><div class="real">' + (zu.rang === 1 ? "Start-Tipp" : "Rang-Vorgabe") + ", KEINE Live-Quote</div>";
  }
  if (zu.verfN) td.innerHTML += '<div class="keinmarkt">Achtung: Markt dort vermutlich nicht vorhanden</div>';
  tr.appendChild(td);

  td = document.createElement("td");
  td.className = "such";
  const rEintrag = REITER.find(x => x[0] === w.s);
  td.innerHTML = '<span class="reiter-chip">' + w.s + "</span>";
  td.title = rEintrag ? ("Reiter in der App: " + rEintrag[1] + ". Anleitung im Reiter-Kasten oben.")
                      : "Reiter-Kasten oben aufklappen";
  tr.appendChild(td);

  return tr;
}

function aktualisiereZeile(id) {
  const w = WETTEN.find(x => x.id === id);
  const alt = document.getElementById("z_" + id);
  if (w && alt) {
    const fokus = document.activeElement;
    const neu = baueZeile(w);
    alt.replaceWith(neu);
    const altDetail = document.getElementById("d_" + id);
    if (altDetail) altDetail.replaceWith(baueDetailZeile(w));
    if (fokus && fokus.tagName === "INPUT") {
      const inputsAlt = Array.from(alt.querySelectorAll("input"));
      const idx = inputsAlt.indexOf(fokus);
      if (idx >= 0) {
        const inputsNeu = neu.querySelectorAll("input");
        if (inputsNeu[idx]) {
          inputsNeu[idx].focus();
          const l = inputsNeu[idx].value.length;
          inputsNeu[idx].setSelectionRange && inputsNeu[idx].setSelectionRange(l, l);
        }
      }
    }
    baueFilter(); // Anbieter-Zaehler mitziehen
  }
}

function zeichne() {
  baueFilter();
  const koerper = document.getElementById("koerper");
  koerper.innerHTML = "";
  let liste = basisListe();
  if (aktiverAnbieter !== "ALLE") liste = liste.filter(w => zuweisung(w).kz === aktiverAnbieter);
  liste.sort((a, b) => liesAnstoss(anstossFeld(a)).zeit - liesAnstoss(anstossFeld(b)).zeit);
  for (const w of liste) {
    koerper.appendChild(baueZeile(w));
    if (offeneDetails.has(w.id)) koerper.appendChild(baueDetailZeile(w));
  }
  const vorbeiZahl = WETTEN.filter(w => istVorbei(anstossFeld(w))).length;
  let text = liste.length + " Wetten angezeigt. Gesamt: " + WETTEN.length +
    ", davon " + vorbeiZahl + " schon angepfiffen/vorbei (" +
    (nurKommende ? "ausgeblendet, Knopf oben" : "eingeblendet, grau") + ").";
  if (aktiverReiter !== "ALLE") {
    const r = REITER.find(x => x[0] === aktiverReiter);
    text += " Reiter: " + aktiverReiter + " (" + (r ? r[1] : "") + ").";
  }
  if (aktiverRang !== 1) text += " Angezeigt wird je Wette der " + aktiverRang + ". Anbieter der Rangliste.";
  if (aktiverAnbieter !== "ALLE") text += " Filter: setzen bei " + anbieterName(aktiverAnbieter) + ".";
  document.getElementById("zaehler").textContent = text;
  const stand = document.getElementById("stand");
  if (stand) stand.textContent = "Datenstand: " + DATEN_STAND +
    (typeof RECHERCHE_STAND !== "undefined" ? " Markt-Quoten gesucht: " + RECHERCHE_STAND + "." : "") +
    " Anstosszeiten auf oesterreichische Zeit umgerechnet (+1 h gegenueber dem Foto)." +
    " Seite angezeigt: " + jetztText() + " Uhr.";
}

document.addEventListener("DOMContentLoaded", zeichne);

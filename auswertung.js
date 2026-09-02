// ============================================================
// AUSWERTUNG: entscheidet aus einem Spielergebnis, ob eine Wette
// gewonnen, verloren, halb oder zurueck ist - und daraus, was eine
// ganze Kombination auszahlt.
//
// REINE RECHENSCHICHT. Kein DOM, keine Datenbank, kein Netz.
// Dieselbe Datei laeuft im Browser UND unter Node (fuer die Tests).
//
// Die eiserne Regel (Karam, 01.09.2026): lieber "unklar" sagen und
// EINMAL nachfragen, als still raten. Ein falsch abgerechneter
// Schein verfaelscht die Kasse zwischen Freunden. Alles, was diese
// Datei nicht sicher lesen kann, bekommt den Stand "unklar" und
// wird NIE automatisch verbucht.
//
// Begriffe:
//   Wette-Text  der Text EINER Linie (aus wetten[].linie im Verlauf,
//               z. B. "OVER 2.5", "HOME -0.25", "dnb away").
//   ergebnis    { heim, gast,            Endstand (Fussball: Tore,
//                                        Tennis: gewonnene Saetze)
//                 htHeim, htGast,        Halbzeit (nur fuer HTFT)
//                 karten,                Karten beider Teams zusammen
//                 ecken,                 Ecken beider Teams zusammen
//                 sonder,                { "asse jones": 12, ... }
//                 stand }                "fertig" | "abgesagt"
//   ausgang     "gewonnen" | "halbgewonnen" | "push" | "halbverloren"
//               | "verloren" | "offen" | "unklar" | "abgesagt"
//   faktor      womit der Einsatz-Anteil dieser Wette multipliziert
//               wird: q, (q+1)/2, 1, 0.5, 0. Bei offen/unklar: null.
// ============================================================
"use strict";

// ---------- Zahlen lesen: "2,5" und "2.5" sind dieselbe Zahl ----------

function awZahl(s) {
  const z = parseFloat(String(s).replace(",", "."));
  return isFinite(z) ? z : null;
}

// ---------- Der Spielname in seine zwei Seiten ----------
// "Chindia Targoviste vs FC Voluntari" | "Wolfsberg - Lask"

function awSeiten(spiel) {
  const t = String(spiel || "");
  let m = t.split(/\s+vs\.?\s+/i);
  if (m.length !== 2) m = t.split(/\s+-\s+/);
  if (m.length !== 2) return null;
  return { heim: m[0].trim(), gast: m[1].trim() };
}

// Steht dieser Name in der Heim- oder Gastseite? Wortweise, damit
// "Leipzig" auf "RB Leipzig" passt, aber "Sporting" NICHT zugleich
// auf "Sporting" und "Sporting B" - trifft der Name beide Seiten,
// ist es keine Antwort ("beide"), und die Wette bleibt unklar.
function awSeiteVonName(name, spiel) {
  const s = awSeiten(spiel);
  if (!s) return null;
  const n = String(name).toLowerCase().trim();
  if (n.length < 3) return null;        // "FC" o.ae. traefe alles
  // Wortanfaenge reichen: Karam kuerzt Namen ab ("Etche ML" fuer
  // Etcheverry). Jedes Wort des Namens muss als Wortanfang der Seite
  // vorkommen - "Leipzig" trifft "RB Leipzig", "Etche" trifft
  // "Etcheverry", aber "Sporting" trifft auch "Sporting B" und
  // faellt dann unten als "beide" heraus.
  const trifft = (seiteText) => {
    const woerter = seiteText.toLowerCase().split(/\s+/);
    return n.split(/\s+/).every(teil =>
      woerter.some(w => w.indexOf(teil) === 0));
  };
  const inHeim = trifft(s.heim);
  const inGast = trifft(s.gast);
  if (inHeim && inGast) return "beide";
  if (inHeim) return "heim";
  if (inGast) return "gast";
  return null;
}

// ---------- Den Wett-Text lesen ----------
// Liefert IMMER ein Objekt. art "unklar" heisst: von Hand entscheiden.
//   { art, seite, linie, basis, name, ht, ft, grund }
//   art: sieg | dnb | dc | btts | htft | handicap | ueber | unter
//        | kombi-sieg-ueber | unklar
//   basis (bei ueber/unter): tore | karten | ecken | teamtore
//        | sonder (dann traegt "sonderSchluessel" den Namen der Zahl)

function wetteLesen(text, spiel) {
  const roh = String(text || "").trim();
  const t = roh.toLowerCase().replace(/\s+/g, " ").trim();
  const unklar = (grund) => ({ art: "unklar", grund: grund, text: roh });
  if (!t) return unklar("leerer Wett-Text");

  // Mehrere Linien in Klammern: "OVER (2.5, 3)" ist keine EINE Wette.
  // Im Verlauf steht immer die gewaehlte Linie - kommt doch der ganze
  // Klammertext an (Altbestand), muss ein Mensch sagen, welche galt.
  if (/\([^)]*,[^)]*\)/.test(t)) return unklar("mehrere Linien in einem Text - welche wurde gesetzt?");

  // ---- BTTS ----
  if (/^btts\s*(yes|ja)$/.test(t)) return { art: "btts", seite: "ja" };
  if (/^btts\s*(no|nein)$/.test(t)) return { art: "btts", seite: "nein" };

  // ---- HTFT HOME/AWAY/DRAW ----
  let m = t.match(/^htft\s+(home|away|draw)\s*\/\s*(home|away|draw)$/);
  if (m) {
    const map = { home: "heim", away: "gast", draw: "remis" };
    return { art: "htft", ht: map[m[1]], ft: map[m[2]] };
  }

  // ---- Doppelte Chance ----
  m = t.match(/^dc\s+(home|away|draw)$|^(home|away)\s+dc$|^\(dc\s*(home|away)\)$/);
  if (m) {
    const w = m[1] || m[2] || m[3];
    if (w === "draw") return unklar("dc draw: 1X oder X2?");
    return { art: "dc", seite: w === "home" ? "heim" : "gast" };
  }

  // ---- Draw no bet ----
  m = t.match(/^dnb\s+(home|away)$|^(home|away)\s+dnb$/);
  if (m) { const w = m[1] || m[2]; return { art: "dnb", seite: w === "home" ? "heim" : "gast" }; }
  m = t.match(/^(.+?)\s+dnb$/);
  if (m) {
    const seite = awSeiteVonName(m[1], spiel);
    if (seite === "heim" || seite === "gast") return { art: "dnb", seite: seite, name: m[1] };
    return unklar("dnb: '" + m[1] + "' passt nicht eindeutig zu \"" + String(spiel || "") + "\"");
  }

  // ---- Kombi in einer Wette: "away and over 2,5" ----
  m = t.match(/^(home|away)\s+and\s+over\s+([\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[2]);
    if (linie === null) return unklar("Zahl nicht lesbar: " + roh);
    return { art: "kombi-sieg-ueber", seite: m[1] === "home" ? "heim" : "gast", linie: linie };
  }

  // ---- Asse (Tennis): "Montgomery o4,5 aces" / "Over 14,5 aces Fritz" / "Quevedo u1,5 aces" ----
  if (t.indexOf("aces") >= 0 || t.indexOf("asse") >= 0) {
    m = t.match(/^(.+?)\s+(o|u|over|under)\s?([\d.,]+)\s+(?:aces|asse)$/) ||
        t.match(/^(over|under)\s+([\d.,]+)\s+(?:aces|asse)\s+(.+)$/);
    if (m) {
      const erstesIstRichtung = (m[1] === "over" || m[1] === "under");
      const name = (erstesIstRichtung ? m[3] : m[1]).trim();
      const richtung = (erstesIstRichtung ? m[1] : m[2]);
      const linie = awZahl(erstesIstRichtung ? m[2] : m[3]);
      if (linie === null || !name) return unklar("Asse-Wette nicht lesbar: " + roh);
      return { art: (richtung[0] === "o") ? "ueber" : "unter", linie: linie,
               basis: "sonder", sonderSchluessel: "asse " + name.toLowerCase(), name: name };
    }
    return unklar("Asse-Wette nicht lesbar: " + roh);
  }

  // ---- Karten / Ecken: "CARDS UNDER 5.5", "CORNERS OVER 9.5" ----
  m = t.match(/^(cards?|karten)\s+(over|under)\s+([\d.,]+)$/) ||
      t.match(/^(corners?|ecken)\s+(over|under)\s+([\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[3]);
    if (linie === null) return unklar("Zahl nicht lesbar: " + roh);
    const basis = /card|kart/.test(m[1]) ? "karten" : "ecken";
    return { art: m[2] === "over" ? "ueber" : "unter", linie: linie, basis: basis };
  }

  // ---- Team-Tore: "AWAY UNDER 0.5" / "HOME OVER 1.5" ----
  m = t.match(/^(home|away)\s+(over|under)\s+([\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[3]);
    if (linie === null) return unklar("Zahl nicht lesbar: " + roh);
    return { art: m[2] === "over" ? "ueber" : "unter", linie: linie,
             basis: "teamtore", seite: m[1] === "home" ? "heim" : "gast" };
  }

  // ---- Tore gesamt: "OVER 2.5" / "under 3,5" ----
  m = t.match(/^(over|under|ueber|unter)\s+([\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[2]);
    if (linie === null) return unklar("Zahl nicht lesbar: " + roh);
    // Eine Torlinie von 20 gibt es nicht: das ist eine Gesamtzahl aus
    // einer anderen Sportart (Games, Punkte). Die Zahl dafuer muss als
    // Sonderwert eingetragen werden, geraten wird nicht.
    const art = (m[1] === "over" || m[1] === "ueber") ? "ueber" : "unter";
    if (linie >= 15) return { art: art, linie: linie, basis: "sonder", sonderSchluessel: "gesamt" };
    return { art: art, linie: linie, basis: "tore" };
  }

  // ---- Handicap mit home/away: "HOME -1.0", "AWAY 0.5", "HOME 0" ----
  m = t.match(/^(home|away)\s+([+-]?[\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[2]);
    if (linie === null) return unklar("Handicap nicht lesbar: " + roh);
    // +7.5 und mehr: das ist fast nie ein Fussball-Handicap, sondern
    // Ecken oder eine andere Zaehlung. Ein Mensch entscheidet.
    if (Math.abs(linie) >= 4) return unklar("Handicap " + m[2] + " ist ungewoehnlich gross - was wird gezaehlt?");
    return { art: "handicap", seite: m[1] === "home" ? "heim" : "gast", linie: linie };
  }

  // ---- Handicap mit Teamname: "Casa Pia +1", "Famalicao -0,25", "Sporting -2" ----
  m = t.match(/^(.+?)\s+([+-][\d.,]+)$/);
  if (m) {
    const linie = awZahl(m[2]);
    const seite = awSeiteVonName(m[1], spiel);
    if (linie !== null && (seite === "heim" || seite === "gast")) {
      if (Math.abs(linie) >= 4) return unklar("Handicap " + m[2] + " ist ungewoehnlich gross - was wird gezaehlt?");
      return { art: "handicap", seite: seite, linie: linie, name: m[1] };
    }
    return unklar("'" + roh + "' passt nicht eindeutig zu \"" + String(spiel || "") + "\"");
  }

  // ---- Sieg: "home" / "away" / "draw" ----
  if (t === "home" || t === "1") return { art: "sieg", seite: "heim" };
  if (t === "away" || t === "2") return { art: "sieg", seite: "gast" };
  if (t === "draw" || t === "x") return { art: "sieg", seite: "remis" };

  // ---- Sieg mit Name: "Leipzig", "Tondela ML", "Etche ML" ----
  m = t.match(/^(.+?)\s+ml$/) || [null, t];
  {
    const seite = awSeiteVonName(m[1], spiel);
    if (seite === "heim" || seite === "gast") return { art: "sieg", seite: seite, name: m[1] };
    if (seite === "beide") return unklar("'" + m[1] + "' steht auf beiden Seiten von \"" + String(spiel || "") + "\"");
  }

  return unklar("Wett-Text nicht erkannt: " + roh);
}

// ---------- Ueber/Unter mit Viertellinien ----------
// Ausgang fuer EINE glatte oder halbe Linie:
function awUeberUnterEinfach(wert, linie, ueber) {
  if (wert > linie) return ueber ? "gewonnen" : "verloren";
  if (wert < linie) return ueber ? "verloren" : "gewonnen";
  return "push";                        // nur bei glatten Linien moeglich
}

// Viertellinie (x.25 / x.75) = halb auf den zwei Nachbarlinien.
function awUeberUnter(wert, linie, ueber) {
  const rest = Math.round((linie % 0.5) * 100) / 100;
  if (rest === 0.25 || rest === -0.25) {
    const a = awUeberUnterEinfach(wert, linie - 0.25, ueber);
    const b = awUeberUnterEinfach(wert, linie + 0.25, ueber);
    return awHalbe(a, b);
  }
  return awUeberUnterEinfach(wert, linie, ueber);
}

function awHalbe(a, b) {
  if (a === b) return a;
  const paar = [a, b].sort().join("+");
  if (paar === "gewonnen+push") return "halbgewonnen";
  if (paar === "push+verloren") return "halbverloren";
  // gewonnen+verloren kann bei Nachbarlinien nicht vorkommen
  return "unklar";
}

// Handicap: Abstand aus Sicht der gesetzten Seite plus Linie.
// Die Viertellinie steckt in der LINIE, nicht in der Summe - deshalb
// wird hier die Linie geteilt, nicht das Ergebnis. (margin + 0.25 hat
// nie den Rest 0.25, der Fehler fiel in der ersten Probe auf:
// HOME -0.25 bei 0:0 muss halbverloren sein, nicht verloren.)
function awHandicap(margin, linie) {
  const einfach = (l) => {
    const s = margin + l;
    return s > 0 ? "gewonnen" : (s < 0 ? "verloren" : "push");
  };
  const rest = Math.abs(Math.round((linie % 0.5) * 100) / 100);
  if (rest === 0.25) return awHalbe(einfach(linie - 0.25), einfach(linie + 0.25));
  return einfach(linie);
}

// ---------- EINE Wette auswerten ----------
// Liefert { ausgang, grund }. quote kommt erst bei faktorFuer dazu.

function wetteAuswerten(gelesen, ergebnis, spiel) {
  const g = gelesen && gelesen.art ? gelesen : wetteLesen(gelesen, spiel);
  if (g.art === "unklar") return { ausgang: "unklar", grund: g.grund };
  const e = ergebnis || {};
  if (e.stand === "abgesagt") return { ausgang: "abgesagt", grund: "Spiel abgesagt - Einsatz zurueck" };
  const fehlt = (was) => ({ ausgang: "offen", grund: was + " fehlt noch" });

  const heim = awZahl(e.heim), gast = awZahl(e.gast);

  switch (g.art) {
    case "sieg": {
      if (heim === null || gast === null) return fehlt("Endstand");
      if (g.seite === "remis") return { ausgang: heim === gast ? "gewonnen" : "verloren" };
      const s = g.seite === "heim" ? heim - gast : gast - heim;
      return { ausgang: s > 0 ? "gewonnen" : "verloren" };
    }
    case "dnb": {
      if (heim === null || gast === null) return fehlt("Endstand");
      if (heim === gast) return { ausgang: "push", grund: "Unentschieden - Einsatz zurueck" };
      const s = g.seite === "heim" ? heim - gast : gast - heim;
      return { ausgang: s > 0 ? "gewonnen" : "verloren" };
    }
    case "dc": {
      if (heim === null || gast === null) return fehlt("Endstand");
      const s = g.seite === "heim" ? heim - gast : gast - heim;
      return { ausgang: s >= 0 ? "gewonnen" : "verloren" };
    }
    case "btts": {
      if (heim === null || gast === null) return fehlt("Endstand");
      const beide = heim > 0 && gast > 0;
      return { ausgang: (g.seite === "ja") === beide ? "gewonnen" : "verloren" };
    }
    case "htft": {
      if (heim === null || gast === null) return fehlt("Endstand");
      const hh = awZahl(e.htHeim), hg = awZahl(e.htGast);
      if (hh === null || hg === null) return fehlt("Halbzeitstand");
      const lage = (h, a) => h > a ? "heim" : (a > h ? "gast" : "remis");
      const ok = lage(hh, hg) === g.ht && lage(heim, gast) === g.ft;
      return { ausgang: ok ? "gewonnen" : "verloren" };
    }
    case "handicap": {
      if (heim === null || gast === null) return fehlt("Endstand");
      const margin = g.seite === "heim" ? heim - gast : gast - heim;
      return { ausgang: awHandicap(margin, g.linie) };
    }
    case "kombi-sieg-ueber": {
      if (heim === null || gast === null) return fehlt("Endstand");
      const s = g.seite === "heim" ? heim - gast : gast - heim;
      if (s <= 0) return { ausgang: "verloren", grund: "Siegteil verloren" };
      const tore = awUeberUnterEinfach(heim + gast, g.linie, true);
      return { ausgang: tore === "gewonnen" ? "gewonnen" : "verloren" };
    }
    case "ueber":
    case "unter": {
      const ueber = g.art === "ueber";
      let wert = null, name = "Endstand";
      if (!g.basis || g.basis === "tore") {
        if (heim === null || gast === null) return fehlt("Endstand");
        wert = heim + gast;
      } else if (g.basis === "teamtore") {
        const w = g.seite === "heim" ? heim : gast;
        if (w === null) return fehlt("Endstand");
        wert = w;
      } else if (g.basis === "karten") {
        wert = awZahl(e.karten); name = "Kartenzahl";
      } else if (g.basis === "ecken") {
        wert = awZahl(e.ecken); name = "Eckenzahl";
      } else if (g.basis === "sonder") {
        wert = awZahl(e.sonder ? e.sonder[g.sonderSchluessel] : null);
        name = "Zahl fuer '" + g.sonderSchluessel + "'";
      }
      if (wert === null) return fehlt(name);
      return { ausgang: awUeberUnter(wert, g.linie, ueber) };
    }
  }
  return { ausgang: "unklar", grund: "Art nicht auswertbar: " + g.art };
}

// ---------- Der Faktor je Ausgang ----------
// q ist die ECHTE Quote der Wette (nach Gebuehr, aus dem Verlauf).

function faktorFuer(ausgang, q) {
  const quote = awZahl(q);
  switch (ausgang) {
    case "gewonnen":      return quote === null ? null : quote;
    case "halbgewonnen":  return quote === null ? null : (quote + 1) / 2;
    case "push":
    case "abgesagt":      return 1;
    case "halbverloren":  return 0.5;
    case "verloren":      return 0;
  }
  return null;                          // offen / unklar
}

// ---------- Eine ganze Kombination ----------
// wetten: [{ linie|wette, spiel, quote }], ergebnisJe(spiel) -> ergebnis.
// Liefert { stand: "offen"|"unklar"|"gewonnen"|"verloren",
//           auszahlung, faktor, beine: [{...je Wette}] }
// "gewonnen" heisst hier: es kommt Geld zurueck (auch blosser Einsatz
// bei lauter Push) - das passt zum Feld "wirklich bekommen" in Mein
// Bereich. auszahlung ist einsatz x Produkt der Faktoren.

function kombiAuswerten(wetten, einsatz, ergebnisJe) {
  const beine = [];
  let faktor = 1, offen = 0, unklar = 0, verloren = 0;
  for (const w of (wetten || [])) {
    const text = w.linie || w.wette || "";
    const gelesen = wetteLesen(text, w.spiel);
    const erg = (typeof ergebnisJe === "function") ? ergebnisJe(w) : null;
    const a = wetteAuswerten(gelesen, erg, w.spiel);
    const f = faktorFuer(a.ausgang, w.quote);
    beine.push({ spiel: w.spiel, text: text, ausgang: a.ausgang, grund: a.grund || "", faktor: f });
    if (a.ausgang === "offen") offen++;
    else if (a.ausgang === "unklar") unklar++;
    else if (a.ausgang === "verloren") { verloren++; faktor = 0; }
    else if (f !== null) faktor *= f;
    else unklar++;                      // Ausgang klar, Quote fehlt
  }
  // EIN verlorenes Bein reisst alles: das steht fest, auch wenn andere
  // Beine noch laufen oder unklar sind.
  if (verloren) return { stand: "verloren", auszahlung: 0, faktor: 0, beine: beine };
  if (unklar) return { stand: "unklar", auszahlung: null, faktor: null, beine: beine };
  if (offen) return { stand: "offen", auszahlung: null, faktor: null, beine: beine };
  const rund = (x) => Math.round(x * 100) / 100;
  const aus = rund((awZahl(einsatz) || 0) * faktor);
  return { stand: aus > 0 ? "gewonnen" : "verloren", auszahlung: aus, faktor: rund(faktor), beine: beine };
}

// ---------- Was braucht ein Spiel an Eingaben? ----------
// Fuer die Eingabemaske: welche Felder muessen ueberhaupt gefragt
// werden, damit alle Wetten dieses Spiels entscheidbar sind.

function benoetigteFelder(texte, spiel) {
  const felder = { endstand: false, halbzeit: false, karten: false, ecken: false, sonder: [] };
  for (const text of (texte || [])) {
    const g = wetteLesen(text, spiel);
    if (g.art === "unklar") continue;
    if (g.art === "htft") { felder.endstand = true; felder.halbzeit = true; }
    else if (g.basis === "karten") felder.karten = true;
    else if (g.basis === "ecken") felder.ecken = true;
    else if (g.basis === "sonder") { if (felder.sonder.indexOf(g.sonderSchluessel) < 0) felder.sonder.push(g.sonderSchluessel); }
    else felder.endstand = true;
  }
  return felder;
}

// Unter Node (Tests) auch als Modul erreichbar:
if (typeof module !== "undefined" && module.exports) {
  module.exports = { awZahl, awSeiten, awSeiteVonName, wetteLesen, awUeberUnter,
    awHandicap, wetteAuswerten, faktorFuer, kombiAuswerten, benoetigteFelder };
}

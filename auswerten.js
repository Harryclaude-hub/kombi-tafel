// ============================================================
// AUSWERTEN: viele Scheine schnell auf gewonnen oder verloren stellen
//
// Karam (16.09.2026): "Die Bettslips sollen viel uebersichtlicher sein.
// Vor allem ist wichtig, dass grosse Mengen abgearbeitet werden koennen,
// 100 Stueck oder mehr, und zwar dass sie einzeln ausgewertet werden
// koennen. Immer ein kleines Bild daneben, das man anklicken kann, dann
// wird es groesser. Kein aufklappendes Menue, sondern einfach gruen oder
// rot: ist aufgegangen, ist nicht aufgegangen. Daneben steht immer, was
// gekommen ist. Und ein Zeitraum - eine ganze Woche oder die ganze Zeit -
// wo ich die Wetten auswerten kann, und dann kriege ich einfach einen
// Umsatz und was mein Gewinn ist."
//
// WARUM EIGENE ANSICHT UND NICHT DIE GROSSE TABELLE
// Die Kombinations-Tabelle in mein.js zeichnet bei jeder Aenderung den
// ganzen Bereich neu (zeichneBereich). Bei drei Scheinen faellt das nicht
// auf, bei 150 klickt man ins Leere und wartet. Hier wird nach einem
// Klick nur die eine Karte und die Summenzeile neu gezeichnet.
//
// DIESE DATEI RECHNET NICHTS NEU: Umsatz ist die Summe der Einsaetze,
// Gewinn kommt aus echtZurueckWert(), derselben Funktion wie ueberall.
// Faellt die Datei weg, fehlt nur der Reiter "Auswerten".
// ============================================================
"use strict";

const AW_ZEITRAUM = "kt_aw_zeitraum";     // zuletzt gewaehlter Zeitraum
const AW_STICHTAG = "kt_aw_stichtag";     // Stand der letzten Excel-Liste
const AW_NUR_OFFEN = "kt_aw_nur_offen";
// Karam (16.09.2026): "Beim Auswerten moechte ich, dass ich Personen
// filtern kann, ganz rechts muss Personenfilter kommen und
// Anbieterfilter - ich kann mir die Anbieter auch aussuchen."
// Beide sind MEHRFACHWAHL. Eine leere Liste heisst ausdruecklich
// "alle", nicht "keine": so ist der Anfangszustand nie eine
// versehentlich leere Auswertung.
const AW_PERSONEN = "kt_aw_personen";
const AW_ANBIETER = "kt_aw_anbieter";

// Karams Konten-Uebersicht hatte den Stand Montag, 14.09.2026 18:00.
// Alles, was danach gespielt wurde, fehlt dort und muss dazugerechnet
// werden. Der Wert ist aenderbar und wird auf dem Geraet gemerkt.
const AW_STICHTAG_VORGABE = "2026-09-14T18:00";

function awStichtag() {
  try { return localStorage.getItem(AW_STICHTAG) || AW_STICHTAG_VORGABE; }
  catch (e) { return AW_STICHTAG_VORGABE; }
}
function awNurOffen() {
  try { return localStorage.getItem(AW_NUR_OFFEN) !== "nein"; } catch (e) { return true; }
}
function awZeitraum() {
  try { return JSON.parse(localStorage.getItem(AW_ZEITRAUM) || "null") || { art: "stichtag" }; }
  catch (e) { return { art: "stichtag" }; }
}
function awZeitraumSetzen(z) {
  try { localStorage.setItem(AW_ZEITRAUM, JSON.stringify(z)); } catch (e) { }
}

// ---------- Personen- und Anbieterfilter ----------
// Eine leere Liste heisst IMMER "alle". Damit kann kein Zustand
// entstehen, in dem nichts mehr angezeigt wird und niemand weiss warum.
function awListeLesen(schluessel) {
  try {
    const v = JSON.parse(localStorage.getItem(schluessel) || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch (e) { return []; }
}
function awListeSchreiben(schluessel, liste) {
  try { localStorage.setItem(schluessel, JSON.stringify(liste)); } catch (e) { }
}
function awPersonenFilter() { return awListeLesen(AW_PERSONEN); }
function awAnbieterFilter() { return awListeLesen(AW_ANBIETER); }

// Ein Eintrag um: drin wird raus, raus wird drin.
function awUmschalten(schluessel, wert) {
  const liste = awListeLesen(schluessel);
  const i = liste.indexOf(String(wert));
  if (i >= 0) liste.splice(i, 1); else liste.push(String(wert));
  awListeSchreiben(schluessel, liste);
  if (typeof zeichneBereich === "function") zeichneBereich();
}
function awPersonUm(id) { awUmschalten(AW_PERSONEN, id == null ? "" : id); }
function awAnbieterUm(kz) { awUmschalten(AW_ANBIETER, kz == null ? "" : kz); }
function awPersonenAlle() { awListeSchreiben(AW_PERSONEN, []); if (typeof zeichneBereich === "function") zeichneBereich(); }
function awAnbieterAlle() { awListeSchreiben(AW_ANBIETER, []); if (typeof zeichneBereich === "function") zeichneBereich(); }
function awFilterAlle() {
  awListeSchreiben(AW_PERSONEN, []);
  awListeSchreiben(AW_ANBIETER, []);
  if (typeof zeichneBereich === "function") zeichneBereich();
}

// Die beiden Merkmale eines Scheins, immer auf dieselbe Art gelesen.
function awPersonVon(s) { return s && s.ordner ? String(s.ordner) : ""; }
function awAnbieterVon(s) {
  const d = (s && s.daten) || {};
  return d.kz ? String(d.kz) : "";
}

function awTagText(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

// Von wann bis wann? Gibt {von, bis} als Date zurueck, beide duerfen
// null sein ("alles"). bis ist IMMER das Ende des Tages, sonst fiele
// alles nach Mitternacht heraus - genau der Fehler, den Karam meinte.
function awGrenzen() {
  const z = awZeitraum();
  const jetzt = new Date();
  const heute0 = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  // Karam (16.09.2026): "der Zeitraum, einfach auch hinzufuegen, wann das
  // circa endet. Uhrzeit ist nicht wichtig." Deshalb traegt jeder
  // Zeitraum ein Von- und ein Bis-DATUM im Text, nie nur ein Wort.
  const tag = d => d ? (String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear()) : "";
  const spanne = (a, b) => tag(a) + " bis " + (b ? tag(b) : tag(jetzt) + " (heute)");

  if (z.art === "alles") {
    return { von: null, bis: null, text: "die ganze Zeit", spanne: "alles bis " + tag(jetzt) };
  }
  if (z.art === "stichtag") {
    const s = new Date(awStichtag());
    const gueltig = !isNaN(s.getTime());
    return { von: gueltig ? s : null, bis: null,
      text: "seit dem Stichtag",
      spanne: gueltig ? (tag(s) + " bis " + tag(jetzt) + " (heute)") : "Stichtag unlesbar" };
  }
  if (z.art === "heute") return { von: heute0, bis: null, text: "heute", spanne: tag(heute0) };
  if (z.art === "gestern") {
    const g = new Date(heute0); g.setDate(g.getDate() - 1);
    const e = new Date(heute0); e.setMilliseconds(-1);
    return { von: g, bis: e, text: "gestern", spanne: tag(g) };
  }
  if (z.art === "woche") {
    const w = new Date(heute0); w.setDate(w.getDate() - 6);
    return { von: w, bis: null, text: "die letzten 7 Tage", spanne: spanne(w, null) };
  }
  if (z.art === "monat") {
    const m = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
    return { von: m, bis: null, text: "dieser Monat", spanne: spanne(m, null) };
  }
  if (z.art === "vormonat") {
    const v = new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1);
    const e = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1); e.setMilliseconds(-1);
    return { von: v, bis: e, text: "letzter Monat", spanne: spanne(v, e) };
  }
  // Eigener Zeitraum: zwei Datumsfelder
  const von = z.von ? new Date(z.von + "T00:00") : null;
  const bis = z.bis ? new Date(z.bis + "T23:59:59.999") : null;
  const vOk = (von && !isNaN(von.getTime())) ? von : null;
  const bOk = (bis && !isNaN(bis.getTime())) ? bis : null;
  return { von: vOk, bis: bOk, text: "eigener Zeitraum",
    spanne: (vOk ? tag(vOk) : "Anfang") + " bis " + (bOk ? tag(bOk) : tag(jetzt) + " (heute)") };
}

// Welche Scheine gehoeren in den Zeitraum? Gerechnet wird ueber
// created_at, also den Moment des Speicherns - derselbe Zeitpunkt, den
// die Buchhaltung und die Tagesansicht benutzen.
// Drei Stufen, und jede hat genau eine Aufgabe. Die Summenzeile und die
// Liste greifen auf verschiedene Stufen zu; stuende das Filtern an zwei
// Stellen, zeigten Summe und Liste irgendwann verschiedene Mengen.
//   awImZeitraum  nur die Zeit
//   awGefiltert   dazu Person und Anbieter   -> die Summen rechnen hiermit
//   awScheine     dazu "nur die offenen"     -> die Liste zeigt das
function awImZeitraum() {
  const alle = Array.isArray(kasseScheine) ? kasseScheine : [];
  const g = awGrenzen();
  return alle.filter(s => {
    const t = new Date(s.created_at);
    if (isNaN(t.getTime())) return true;      // Zeit unlesbar: lieber zeigen als verschweigen
    if (g.von && t < g.von) return false;
    if (g.bis && t > g.bis) return false;
    return true;
  });
}

function awGefiltert() {
  const personen = awPersonenFilter();
  const anbieter = awAnbieterFilter();
  return awImZeitraum().filter(s => {
    if (personen.length && personen.indexOf(awPersonVon(s)) < 0) return false;
    if (anbieter.length && anbieter.indexOf(awAnbieterVon(s)) < 0) return false;
    return true;
  });
}

function awScheine() {
  const nurOffen = awNurOffen();
  return awGefiltert()
    .filter(s => !nurOffen || s.stand === "offen")
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

function awPersonName(id) {
  const o = (Array.isArray(ordnerListe) ? ordnerListe : []).find(x => x.id === id);
  return o ? String(o.name || "") : "";
}
function awGeld(x) { return Number(x || 0).toFixed(2) + " &euro;"; }

// Wann ist diese Kombination durch? Das letzte Spiel darin entscheidet.
// scheinEnde() aus mein.js rechnet es (Anstoss plus Spieldauer-Puffer) -
// dieselbe Funktion, die auch "alle Spiele aus, Ergebnis?" auslöst.
// Karam wollte hier NUR das Datum, keine Uhrzeit.
function awEndeText(s) {
  if (typeof scheinEnde !== "function") return "?";
  const e = scheinEnde(s);
  if (!e || isNaN(e.getTime())) return "Zeit unbekannt";
  return String(e.getDate()).padStart(2, "0") + "." +
    String(e.getMonth() + 1).padStart(2, "0") + "." + e.getFullYear();
}

// ---------- Zeichnen ----------
function zeichneAuswerten() {
  const box = el("auswerten");
  if (!box) return;
  const g = awGrenzen();
  const liste = awScheine();
  box.innerHTML = awKopfHtml(g, liste) +
    '<div id="aw_liste">' + awListeHtml(liste) + "</div>";
}

// ---------- Die beiden Filterkaesten rechts ----------
// Gezeigt wird IMMER nur, was im Zeitraum wirklich vorkommt, mit der
// Anzahl dahinter. So kann man nichts anwaehlen, das ohnehin leer ist,
// und sieht auf einen Blick, wo die Kombinationen liegen.
// Eine Auswahl, die es im Zeitraum nicht mehr gibt, bleibt trotzdem
// stehen und wird gezeigt - sonst waere sie still verschwunden und
// Karam suchte, warum die Liste leer ist.
function awFilterGruppe(titel, eintraege, gewaehlt, umFn, alleFn, leerText) {
  const aus = gewaehlt.length === 0;
  let h = '<div class="aw-fgruppe"><div class="aw-ftitel">' + titel +
    (aus ? ' <span class="mini">(alle)</span>'
         : ' <span class="aw-fzahl">' + gewaehlt.length + " gewählt</span>") + "</div>" +
    '<div class="aw-fchips">' +
    '<button class="aw-chip' + (aus ? " aktiv" : "") + '" onclick="' + alleFn + '()">alle</button>';
  for (const e of eintraege) {
    const an = gewaehlt.indexOf(e.wert) >= 0;
    h += '<button class="aw-chip' + (an ? " aktiv" : "") + (e.fehlt ? " aw-chipweg" : "") +
      '" onclick="' + umFn + '(' + JSON.stringify(e.wert) + ')" title="' +
      (e.fehlt ? "gewählt, kommt in diesem Zeitraum aber nicht vor"
               : e.zahl + " Kombination(en) in diesem Zeitraum") + '">' +
      textSicherM(e.text) + ' <span class="aw-chipz">' + e.zahl + "</span></button>";
  }
  if (!eintraege.length) h += '<span class="mini">' + leerText + "</span>";
  return h + "</div></div>";
}

function awFilterHtml(imZeitraum) {
  // Zaehlen, was es gibt.
  const zaehlP = {}, zaehlA = {};
  for (const s of imZeitraum) {
    const p = awPersonVon(s), a = awAnbieterVon(s);
    zaehlP[p] = (zaehlP[p] || 0) + 1;
    zaehlA[a] = (zaehlA[a] || 0) + 1;
  }
  const gewP = awPersonenFilter(), gewA = awAnbieterFilter();
  // Gewaehltes, das im Zeitraum nicht vorkommt, trotzdem aufnehmen.
  for (const p of gewP) if (!(p in zaehlP)) zaehlP[p] = 0;
  for (const a of gewA) if (!(a in zaehlA)) zaehlA[a] = 0;

  const personen = Object.keys(zaehlP).map(p => ({
    wert: p,
    text: p ? (awPersonName(p) || "Person " + String(p).slice(0, 6)) : "keine Person",
    zahl: zaehlP[p],
    fehlt: zaehlP[p] === 0
  })).sort((a, b) => b.zahl - a.zahl ||
    (typeof personVergleich === "function" ? personVergleich(a.text, b.text)
                                           : a.text.localeCompare(b.text)));

  const anbieter = Object.keys(zaehlA).map(a => ({
    wert: a,
    text: a ? ((typeof anbieterName === "function" && anbieterName(a)) || a) : "ohne Anbieter",
    zahl: zaehlA[a],
    fehlt: zaehlA[a] === 0
  })).sort((a, b) => b.zahl - a.zahl || a.text.localeCompare(b.text));

  const etwasAn = gewP.length || gewA.length;
  return '<div class="aw-filter">' +
    awFilterGruppe("&#128100; Person", personen, gewP, "awPersonUm", "awPersonenAlle",
      "In diesem Zeitraum liegt keine Kombination.") +
    awFilterGruppe("&#127978; Anbieter", anbieter, gewA, "awAnbieterUm", "awAnbieterAlle",
      "In diesem Zeitraum liegt keine Kombination.") +
    (etwasAn
      ? '<div class="aw-fhinweis mini"><b>Gefiltert.</b> Die Zahlen oben und die Liste ' +
        "unten zeigen nur die gewählten. " +
        '<button onclick="awFilterAlle()">Filter ganz weg</button></div>'
      : "") +
    "</div>";
}

function awKopfHtml(g, liste) {
  const z = awZeitraum();
  const knopf = (art, text) => '<button class="aw-zeit' + (z.art === art ? " aktiv" : "") +
    '" onclick="awZeitWaehlen(\'' + art + '\')">' + text + "</button>";
  return '<div class="aw-kopf">' +
    "<h2>&#9989; Scheine auswerten</h2>" +
    '<p class="mini">Ein Klick je Schein: <b>grün</b> heißt aufgegangen, <b>rot</b> heißt nicht ' +
      "aufgegangen. Das Bild daneben wird beim Antippen groß.</p>" +
    '<div class="aw-zeiten">' +
      knopf("stichtag", "Seit dem Stichtag") + knopf("heute", "Heute") +
      knopf("gestern", "Gestern") + knopf("woche", "Letzte 7 Tage") +
      knopf("monat", "Dieser Monat") + knopf("vormonat", "Letzter Monat") +
      knopf("alles", "Die ganze Zeit") + knopf("eigen", "Eigener Zeitraum") +
    "</div>" +
    // Karam (16.09.2026): "bei dem Zeitraum sie nicht untereinander,
    // sondern nebeneinander. Zeitraum, Saetze, Uhrzeit - und da mit der
    // Uhrzeit, also wann es genau gesetzt wurde."
    '<div class="aw-spanne">' +
      '<span class="aw-sp"><span class="aw-spt">Zeitraum</span>' +
        '<span class="aw-spw">' + g.spanne + "</span></span>" +
      '<span class="aw-sp"><span class="aw-spt">Sätze</span>' +
        '<span class="aw-spw">' + liste.length + "</span></span>" +
      '<span class="aw-sp"><span class="aw-spt">Erster gesetzt</span>' +
        '<span class="aw-spw">' + (liste.length && typeof wannText === "function"
          ? wannText(liste[0].created_at) : "-") + "</span></span>" +
      '<span class="aw-sp"><span class="aw-spt">Letzter gesetzt</span>' +
        '<span class="aw-spw">' + (liste.length && typeof wannText === "function"
          ? wannText(liste[liste.length - 1].created_at) : "-") + "</span></span>" +
    "</div>" +
    (z.art === "stichtag"
      ? '<div class="aw-zeile"><label>Stichtag (Stand deiner Excel-Liste): ' +
        '<input type="datetime-local" id="aw_stichtag" value="' + awStichtag() +
        '" onchange="awStichtagSetzen(this.value)"></label> ' +
        '<span class="mini">Alles, was danach gespeichert wurde, fehlt in der Liste und ' +
        "wird hier gezählt.</span></div>"
      : "") +
    (z.art === "eigen"
      ? '<div class="aw-zeile"><label>von <input type="date" id="aw_von" value="' +
        (z.von || "") + '" onchange="awEigenSetzen()"></label> ' +
        '<label>bis <input type="date" id="aw_bis" value="' + (z.bis || "") +
        '" onchange="awEigenSetzen()"></label></div>'
      : "") +
    '<div class="aw-zeile"><label><input type="checkbox"' + (awNurOffen() ? " checked" : "") +
      ' onchange="awNurOffenSetzen(this.checked)"> nur die noch offenen zeigen</label></div>' +
    // Karam wollte die beiden Filter "ganz rechts". Sie stehen deshalb
    // in derselben Zeile wie die Summenkacheln, rechts davon; am Handy
    // rutschen sie darunter.
    '<div class="aw-oben">' + awSummeHtml(liste, g) +
      awFilterHtml(awImZeitraum()) + "</div>";
}

// Die Summenzeile: Umsatz und Gewinn fuer den Zeitraum.
// WICHTIG: der Gewinn zaehlt nur ENTSCHIEDENE Scheine. Offene Einsaetze
// sind weder gewonnen noch verloren - sie stehen getrennt als "im Spiel".
// Wuerde man sie als Verlust rechnen, saehe jeder Tag zuerst schrecklich
// aus und waere es nicht.
function awSummeHtml(liste, g) {
  // Dieselbe Menge wie die Liste darunter, nur ohne "nur die offenen":
  // die Kacheln sollen ja gerade zeigen, wie viele offen, gewonnen und
  // verloren sind. Person und Anbieter wirken aber sehr wohl - sonst
  // stuende ueber einer gefilterten Liste eine ungefilterte Summe.
  const imZeitraum = awGefiltert();
  let umsatz = 0, zurueck = 0, offenEinsatz = 0, nOffen = 0, nGew = 0, nVer = 0, unlesbar = 0;
  for (const s of imZeitraum) {
    const d = s.daten || {};
    if (d.gesperrt) { unlesbar++; continue; }
    umsatz += d.einsatz || 0;
    if (s.stand === "offen") { offenEinsatz += d.einsatz || 0; nOffen++; }
    else if (s.stand === "gewonnen") { nGew++; zurueck += (typeof echtZurueckWert === "function") ? echtZurueckWert(s) : 0; }
    else nVer++;
  }
  const entschieden = umsatz - offenEinsatz;
  const gewinn = zurueck - entschieden;
  return '<div class="aw-summe">' +
    '<div class="aw-kachel"><div class="aw-kt">Zeitraum</div><div class="aw-kw">' +
      imZeitraum.length + " Kombinationen</div>" +
      '<div class="aw-ku">' + g.spanne + "</div></div>" +
    '<div class="aw-kachel"><div class="aw-kt">Umsatz (Einsatz)</div><div class="aw-kw">' +
      awGeld(umsatz) + '</div><div class="aw-ku">davon ' + awGeld(offenEinsatz) + " noch im Spiel</div></div>" +
    '<div class="aw-kachel ' + (gewinn >= 0 ? "aw-plus" : "aw-minus") + '">' +
      '<div class="aw-kt">Gewinn (nur entschiedene)</div><div class="aw-kw">' +
      (gewinn >= 0 ? "+" : "") + awGeld(gewinn) + '</div>' +
      '<div class="aw-ku">' + awGeld(zurueck) + " zurück auf " + awGeld(entschieden) + " Einsatz</div></div>" +
    '<div class="aw-kachel"><div class="aw-kt">Stand</div><div class="aw-kw">' + nOffen + " offen</div>" +
      '<div class="aw-ku">' + nGew + " gewonnen, " + nVer + " verloren" +
      (unlesbar ? ", " + unlesbar + " nicht lesbar" : "") + "</div></div>" +
    "</div>";
}

function awListeHtml(liste) {
  if (!liste.length) {
    // Warum leer? Wenn ein Filter gesetzt ist, ist DAS fast immer der
    // Grund. Das gehoert dazugesagt, sonst sucht man am falschen Ende.
    const gefiltert = awPersonenFilter().length + awAnbieterFilter().length;
    return '<p class="mini">Hier ist nichts auszuwerten. ' +
      (gefiltert
        ? "Es ist ein <b>Filter</b> gesetzt (" + gefiltert + " Auswahl" +
          (gefiltert === 1 ? "" : "en") + " rechts oben). " +
          '<button onclick="awFilterAlle()">Filter ganz weg</button> '
        : "") +
      "Sonst: anderen Zeitraum nehmen, oder den Haken bei \"nur die noch offenen\" weg.</p>";
  }
  // Karam (16.09.2026): "eine Nummerierung, die erste ist 1 und dann geht
  // es so weiter - vor allem wenn ich einen Filter nutze, dass ich mich
  // einfach nicht verwirre." Das ist eine LAUFENDE Nummer im gerade
  // gefilterten Zeitraum, NICHT die feste Nr. des Scheins. Beide stehen
  // nebeneinander, damit man sie nie verwechselt.
  return liste.map((s, i) => awKarteHtml(s, i + 1, liste.length)).join("");
}

function awKarteHtml(s, lfd, gesamt) {
  const d = s.daten || {};
  const schreib = (typeof darfSchreiben === "function") ? darfSchreiben() : false;
  if (d.gesperrt) {
    return '<div class="aw-karte aw-unlesbar" id="aw_' + s.id + '">' +
      '<div class="aw-text"><b>Nr. ' + (s.nummer || "?") + "</b> " +
      '<span class="s-warn">nicht lesbar - der Schlüssel für diesen Bereich fehlt auf diesem Gerät</span></div></div>';
  }
  const person = awPersonName(s.ordner);
  const zurueck = (typeof echtZurueckWert === "function") ? echtZurueckWert(s) : 0;
  const spiele = (d.wetten || []).map(t =>
    textSicherM(t.spiel || "") + (t.linie ? " <span class='mini'>(" + textSicherM(t.linie) + ")</span>" : ""));
  return '<div class="aw-karte aw-' + s.stand + '" id="aw_' + s.id + '"' +
    ' data-lfd="' + (lfd || "") + '" data-gesamt="' + (gesamt || "") + '">' +
    // Das Bild: klein daneben, Klick macht es gross (zeilen.js setzt
    // .foto-gross). Ohne Foto steht ein ruhiger Platzhalter, damit die
    // Karten nicht unterschiedlich breit werden.
    '<div class="aw-bild">' +
      (s.foto
        ? '<img class="minifoto" src="' + textSicherM(s.foto) + '" alt="Wettschein Nr. ' +
          (s.nummer || "") + '" title="Antippen macht das Bild groß">'
        // Ein Foto, das sich nicht entschluesseln liess, ist NICHT
        // dasselbe wie gar keines. Vorher sah beides gleich aus.
        : (s.fotoUnlesbar
          ? '<div class="aw-keinbild aw-fotokaputt mini">Foto da,<br>nicht lesbar</div>'
          : '<div class="aw-keinbild mini">kein Foto</div>')) +
      // Karam: "bei den Kombis immer so einen kleinen Button, Foto
      // hinzufuegen." Auch hier, direkt unter dem Platz fuers Bild.
      (typeof fotoKnopfHtml === "function" ? fotoKnopfHtml(s.id, true) : "") +
    "</div>" +
    '<div class="aw-text">' +
      '<div class="aw-zeile1">' +
        // Links die laufende Nummer im Filter, daneben die feste Nummer
        // des Scheins. Die laufende sagt "der wievielte von wie vielen",
        // die feste ist die, unter der er in der Buchhaltung steht.
        (lfd ? '<span class="aw-lfd" title="Der ' + lfd + ". von " + gesamt +
          ' in diesem Zeitraum">' + lfd + "/" + gesamt + "</span> " : "") +
        "<b>Nr. " + (s.nummer || "?") + "</b> " +
        (typeof markeM === "function" ? markeM(d.kz) : textSicherM(d.kz || "")) + " " +
        // Zwei verschiedene Zeiten, deshalb beide ausgeschrieben.
        // Karam (16.09.2026): "Nenn das so, dass es erkannt wird."
        '<span class="aw-zeit-gesetzt" title="Der Moment, in dem du sie in den Verlauf gelegt hast">' +
          '<span class="aw-zl">Gesetzt am</span> <b>' +
          (typeof wannText === "function" ? wannText(s.created_at) : "") + "</b></span> " +
        '<span class="aw-zeit-laeuft" title="Wann das letzte Spiel dieser Kombination durch ist">' +
          '<span class="aw-zl">Läuft bis</span> <b>' + awEndeText(s) + "</b></span> " +
        // Derselbe Personen-Knopf wie in allen anderen Tabellen
        // (personKnopfM in mein.js) - nicht ein zweiter, der sich
        // spaeter anders verhaelt.
        (typeof personKnopfM === "function" ? personKnopfM(s.ordner)
          : textSicherM(person || "ohne Person")) +
      "</div>" +
      '<div class="aw-spiele mini">' + spiele.join("<br>") + "</div>" +
      '<div class="aw-geld">' +
        "Einsatz <b>" + awGeld(d.einsatz) + "</b> &middot; Quote <b>" +
        Number(d.quote || 0).toFixed(2) + "</b> &middot; möglich <b>" + awGeld(d.moeglich) + "</b>" +
      "</div>" +
    "</div>" +
    '<div class="aw-tasten">' +
      (schreib
        ? '<button class="aw-gruen' + (s.stand === "gewonnen" ? " aktiv" : "") +
            '" onclick="awStand(\'' + s.id + '\',\'gewonnen\')">&#10003; aufgegangen</button>' +
          '<button class="aw-rot' + (s.stand === "verloren" ? " aktiv" : "") +
            '" onclick="awStand(\'' + s.id + '\',\'verloren\')">&#10007; nicht aufgegangen</button>' +
          (s.stand !== "offen"
            ? '<button class="aw-zurueck mini" onclick="awStand(\'' + s.id +
              '\',\'offen\')">nochmal offen</button>'
            : "")
        : '<span class="mini">' + s.stand + "</span>") +
      // Was ist gekommen? Bei gewonnen steht der Betrag daneben und ist
      // aenderbar, falls der Anbieter weniger ausgezahlt hat als moeglich.
      '<div class="aw-ergebnis mini">' + awErgebnisHtml(s, zurueck, schreib) + "</div>" +
    "</div>" +
    "</div>";
}

function awErgebnisHtml(s, zurueck, schreib) {
  if (s.stand === "gewonnen") {
    return "gekommen: " + (schreib
      ? '<input class="einsatz aw-echt" type="number" step="0.01" value="' +
        Number(zurueck || 0).toFixed(2) + '" onchange="awEcht(\'' + s.id + '\', this.value)"> &euro;'
      : "<b>" + awGeld(zurueck) + "</b>") +
      ((s.echt_zurueck === null || s.echt_zurueck === undefined)
        ? ' <span class="aw-geschaetzt">noch der Möglich-Wert</span>' : "");
  }
  if (s.stand === "verloren") return "verloren: <b>-" + awGeld((s.daten || {}).einsatz) + "</b>";
  return (typeof scheinWartet === "function" && scheinWartet(s))
    ? '<span class="aw-wartet">alle Spiele aus - Ergebnis?</span>'
    : "noch offen";
}

// ---------- Bedienen ----------
// Der Sprung zur Person liegt in mein.js (zuPersonM) und wird von ALLEN
// Tabellen benutzt. Hier steht nur noch der alte Name, damit nichts ins
// Leere laeuft, falls er irgendwo haengengeblieben ist.
function awZurPerson(ordnerId) {
  return (typeof zuPersonM === "function") ? zuPersonM(ordnerId) : true;
}

function awZeitWaehlen(art) {
  const z = awZeitraum();
  awZeitraumSetzen({ art: art, von: z.von, bis: z.bis });
  zeichneAuswerten();
}
function awEigenSetzen() {
  const von = el("aw_von"), bis = el("aw_bis");
  awZeitraumSetzen({ art: "eigen", von: von ? von.value : "", bis: bis ? bis.value : "" });
  zeichneAuswerten();
}
function awStichtagSetzen(wert) {
  try { localStorage.setItem(AW_STICHTAG, wert || AW_STICHTAG_VORGABE); } catch (e) { }
  zeichneAuswerten();
}
function awNurOffenSetzen(an) {
  try { localStorage.setItem(AW_NUR_OFFEN, an ? "ja" : "nein"); } catch (e) { }
  zeichneAuswerten();
}

// Gewonnen oder verloren setzen. Es wird NUR diese eine Karte und die
// Summenzeile neu gezeichnet, nicht der ganze Bereich: bei 150 Scheinen
// waere das sonst jedes Mal eine Gedenksekunde.
async function awStand(id, wert) {
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === id);
  if (!s) return;
  const karte = el("aw_" + id);
  if (karte) karte.classList.add("aw-laeuft");
  const vorher = s.stand;
  const r = await supaScheinAendern(id, { stand: wert });
  if (karte) karte.classList.remove("aw-laeuft");
  if (r.error) {
    // NICHT still zurueckfallen: sonst klickt Karam weiter und glaubt,
    // es sei gespeichert.
    meldungM("Nicht gespeichert: " + r.error.message + " Der Schein steht weiter auf \"" +
      vorher + "\".", "warn");
    return;
  }
  s.stand = wert;
  s.updated_at = new Date().toISOString();
  awKarteAuffrischen(s);
  awSummeAuffrischen();
  // Die grosse Tabelle, die Personen-Kasse und die Badges haengen auch
  // daran. Sie werden nachgezogen, sobald Karam den Reiter wechselt -
  // hier waere ein volles Neuzeichnen zu langsam.
  if (typeof kasseScheineGeaendert === "function") kasseScheineGeaendert();
}

async function awEcht(id, wert) {
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === id);
  if (!s) return;
  const text = String(wert || "").trim().replace(",", ".");
  const zahl = text === "" ? null : parseFloat(text);
  if (text !== "" && (isNaN(zahl) || zahl < 0)) {
    meldungM("Das ist kein Betrag: \"" + wert + "\". Nichts gespeichert.", "warn");
    return;
  }
  const r = await supaScheinAendern(id, { echt_zurueck: zahl });
  if (r.error) { meldungM("Nicht gespeichert: " + r.error.message, "warn"); return; }
  s.echt_zurueck = zahl;
  awKarteAuffrischen(s);
  awSummeAuffrischen();
  if (typeof kasseScheineGeaendert === "function") kasseScheineGeaendert();
}

function awKarteAuffrischen(s) {
  const karte = el("aw_" + s.id);
  if (!karte) return;
  // Steht der Schein nicht mehr im Filter (nur offene), verschwindet die
  // Karte - mit einer kurzen Notiz, damit es nicht aussieht, als waere
  // etwas verloren gegangen.
  if (awNurOffen() && s.stand !== "offen") {
    karte.outerHTML = '<div class="aw-weg mini">Nr. ' + (s.nummer || "?") + " auf <b>" +
      (s.stand === "gewonnen" ? "aufgegangen" : "nicht aufgegangen") +
      "</b> gesetzt. Steht jetzt bei den erledigten.</div>";
    return;
  }
  // Die laufende Nummer steht an der Karte, damit sie beim Auffrischen
  // nicht verloren geht: neu durchzaehlen wuerde die ganze Liste kosten.
  const neu = document.createElement("div");
  neu.innerHTML = awKarteHtml(s, karte.dataset ? karte.dataset.lfd : "",
    karte.dataset ? karte.dataset.gesamt : "");
  karte.replaceWith(neu.firstElementChild);
}

function awSummeAuffrischen() {
  const box = el("auswerten");
  if (!box) return;
  const alt = box.querySelector(".aw-summe");
  if (!alt) return;
  const neu = document.createElement("div");
  neu.innerHTML = awSummeHtml(awScheine(), awGrenzen());
  alt.replaceWith(neu.firstElementChild);
}

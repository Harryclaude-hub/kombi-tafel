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
// Karam (17.09.2026): "Ich will, dass die Reihenfolge auch ihrer Aelte so
// ist, dass man sie ganz unten angezeigt bekommt." Also NEUESTE zuerst,
// die alten August-Scheine stehen damit am Ende der Liste. Umstellbar,
// denn zum Abarbeiten der Reihe nach ist die andere Richtung besser.
const AW_REIHE = "kt_aw_reihe";

// Karams Konten-Uebersicht hatte den Stand Montag, 14.09.2026 18:00.
// Alles, was danach gespielt wurde, fehlt dort und muss dazugerechnet
// werden. Der Wert ist aenderbar und wird auf dem Geraet gemerkt.
const AW_STICHTAG_VORGABE = "2026-09-14T18:00";

function awStichtag() {
  try { return localStorage.getItem(AW_STICHTAG) || AW_STICHTAG_VORGABE; }
  catch (e) { return AW_STICHTAG_VORGABE; }
}
// Der ALTE Haken "nur die noch offenen zeigen". Er wird nicht mehr
// angezeigt und nur noch EINMAL gelesen: als Uebersetzung fuer awZeig(),
// damit Karams alte Wahl nicht verloren geht (Falle: localStorage-
// Schluessel mit Altwert - eine neue Vorgabe allein aendert auf seinem
// Geraet gar nichts).
function awNurOffen() {
  try { return localStorage.getItem(AW_NUR_OFFEN) !== "nein"; } catch (e) { return true; }
}

// Karam (17.09.2026): "Ich moechte bitte noch ein Button neben eigener
// Zeitraum, einmal verloren und einmal gewonnen. Alles, was ich schon
// eingetragen habe oder du sogar eingetragen hast, kann ich nochmal
// nachschauen - oder ich kann beides mit anzeigen lassen oder ausblenden."
// Zwei Schalter statt des alten Hakens: OFFENE stehen immer in der Liste
// (das ist die Arbeitsliste), gewonnen und verloren kommen einzeln dazu.
// Beide aus = genau der alte Zustand "nur die offenen".
const AW_ZEIG = "kt_aw_zeig";
function awZeig() {
  try {
    const roh = localStorage.getItem(AW_ZEIG);
    if (roh) { const z = JSON.parse(roh); return { gew: !!z.gew, ver: !!z.ver }; }
  } catch (e) { }
  // Noch nie benutzt: die alte Wahl uebersetzen. "Alles zeigen" hiess
  // gewonnen UND verloren sichtbar, der alte Vorgabezustand hiess beides weg.
  const alles = !awNurOffen();
  return { gew: alles, ver: alles };
}
function awZeigSetzen(z) {
  try { localStorage.setItem(AW_ZEIG, JSON.stringify({ gew: !!z.gew, ver: !!z.ver })); } catch (e) { }
}
function awZeigUm(was) {
  const z = awZeig();
  z[was] = !z[was];
  awZeigSetzen(z);
  zeichneAuswerten();
}
// Gehoert ein Schein mit diesem Stand gerade ins Bild? Unbekannte
// Staende werden IMMER gezeigt - lieber zeigen als verschweigen.
function awStandSichtbar(stand, zeig) {
  if (stand === "gewonnen") return zeig.gew;
  if (stand === "verloren") return zeig.ver;
  return true;
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
// "neu" = neueste zuerst (alte unten), "alt" = aelteste zuerst.
function awReihe() {
  try { return localStorage.getItem(AW_REIHE) === "alt" ? "alt" : "neu"; }
  catch (e) { return "neu"; }
}
function awReiheSetzen(art) {
  try { localStorage.setItem(AW_REIHE, art === "alt" ? "alt" : "neu"); } catch (e) { }
  awNeuZeichnen();
}

function awPersonenFilter() { return awListeLesen(AW_PERSONEN); }
function awAnbieterFilter() { return awListeLesen(AW_ANBIETER); }

// ---------- Die Spielsuche ----------
// Karam (17.09.2026): "Ich moechte bei Auswerten eine Suchleiste da
// hinballern. Da kann man die Spiele eingeben. Die ganzen Spiele wurden
// eigentlich eingetragen. Ich brauche einfach nur eine Suchmaschine.
// Anstatt dass man immer durchscrollen muss, gibt man einfach den Namen
// der Spiele, und jede Kombi, die diesen Eintrag oder so einen aehnlichen
// Namen bei sich traegt, kommt dann hoch."
//
// ABSICHTLICH NICHT GEMERKT. Eine Suche, die beim naechsten Oeffnen noch
// steht, laesst Kombinationen fehlen und niemand weiss warum - dieselbe
// Ueberlegung wie bei obSuche in mein.js.
let awSuche = "";

// Beide Seiten laufen durch DIESELBE Verhaertung, deshalb finden sie
// einander: "Beşiktaş" und "Besiktas", "SC Preußen 06 Münster" und
// "SC Preussen Munster", "FC Zürich" und "FC Zuerich".
// Schritt eins: klein, ß zu ss, Zeichen von ihren Haekchen trennen und
// die Haekchen wegwerfen, alles andere zu Leerzeichen.
function awNorm(t) {
  return String(t == null ? "" : t)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
// Schritt zwei: die deutsche Ersatzschreibung ae/oe/ue faellt mit a/o/u
// zusammen. Das erzeugt auch unsinnige Formen ("queens" wird "quns"),
// aber das macht nichts: die SUCHE laeuft durch genau dieselbe Stufe,
// also treffen sich beide Seiten trotzdem.
function awHart(t) {
  return awNorm(t).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
}

// Was ist an einer Kombination durchsuchbar? Die Spiele zuerst, denn
// danach sucht Karam. Dazu Linie, Anbieter, Nummer und Person - alles,
// was auf der Karte sichtbar steht. Was man sieht, muss man auch
// suchen koennen, sonst sucht man vergeblich nach etwas, das dasteht.
function awSuchText(s) {
  const d = (s && s.daten) || {};
  const teile = [];
  for (const t of (d.wetten || [])) {
    teile.push(t.spiel || "");
    teile.push(t.linie || t.wette || "");
  }
  teile.push("nr " + (s.nummer || ""));
  teile.push(d.anbieter || (typeof anbieterName === "function" ? anbieterName(d.kz) : ""));
  teile.push(awPersonName(s.ordner) || "");
  return awHart(teile.join(" "));
}

// Mehrere Woerter sind eine UND-Suche: "girona palmas" findet die Partie,
// auch wenn dazwischen noch etwas steht.
function awSuchWorte() {
  const q = awHart(awSuche);
  return q ? q.split(" ").filter(Boolean) : [];
}

function awPasstZurSuche(s, worte) {
  if (!worte.length) return true;
  // Eine nicht lesbare Kombination hat keinen Text, der treffen koennte.
  // Sie wird deshalb NIE weggesucht, sondern bleibt als sichtbarer Rest
  // stehen - sonst faellt ihr Einsatz aus Umsatz und Gewinn heraus und
  // die Kacheln zeigten zu wenig Geld, ohne es zu sagen.
  if ((s.daten || {}).gesperrt) return true;
  const text = awSuchText(s);
  return worte.every(w => text.indexOf(w) > -1);
}

// Trifft dieses eine Bein? Nur fuer die Markierung auf der Karte.
function awBeinTrifft(t, worte) {
  if (!worte.length) return false;
  const text = awHart((t.spiel || "") + " " + (t.linie || t.wette || ""));
  return worte.some(w => text.indexOf(w) > -1);
}

function awSuchen(wert) {
  awSuche = String(wert || "");
  // Neue Suche = neue Menge = wieder beim ersten Block anfangen.
  awLimit = AW_BLOCK;
  // NUR Liste, Summenkacheln und die Standzeile neu - nicht die ganze
  // Ansicht. Sonst waere das Eingabefeld nach dem ersten Buchstaben weg.
  // Dieselbe Falle wie bei obSuchen in mein.js.
  const k = el("aw_liste");
  if (k) k.innerHTML = awListeHtml(awScheine());
  awSummeAuffrischen();
  const st = el("aw_suchstand");
  if (st) st.innerHTML = awSuchStandHtml();
  const weg = el("aw_suchweg");
  if (weg) weg.hidden = !awSuche;
}

function awSucheWeg() {
  const feld = el("aw_suche");
  if (feld) feld.value = "";
  awSuchen("");
}

// Ein Eintrag um: drin wird raus, raus wird drin.
function awUmschalten(schluessel, wert) {
  const liste = awListeLesen(schluessel);
  const i = liste.indexOf(String(wert));
  if (i >= 0) liste.splice(i, 1); else liste.push(String(wert));
  awListeSchreiben(schluessel, liste);
  awNeuZeichnen();
}

// NUR diese eine Zeile zeichnet die Auswert-Ansicht neu, und alle
// Filterknoepfe gehen darueber.
// HIER STAND EIN FEHLER: zeichneBereich(). Das zeichnet Mein Bereich,
// ruft aber zeichneAuswerten() nicht auf (das macht nur der Reiter
// oben, mein.js). Ein Klick auf einen Filter aenderte damit zwar den
// gespeicherten Zustand, aber auf dem Schirm passierte NICHTS - es sah
// aus, als gaebe es den Filter gar nicht.
function awNeuZeichnen() {
  if (typeof zeichneAuswerten === "function") zeichneAuswerten();
}
function awPersonUm(id) { awUmschalten(AW_PERSONEN, id == null ? "" : id); }
function awAnbieterUm(kz) { awUmschalten(AW_ANBIETER, kz == null ? "" : kz); }
function awPersonenAlle() { awListeSchreiben(AW_PERSONEN, []); awNeuZeichnen(); }
function awAnbieterAlle() { awListeSchreiben(AW_ANBIETER, []); awNeuZeichnen(); }
function awFilterAlle() {
  awListeSchreiben(AW_PERSONEN, []);
  awListeSchreiben(AW_ANBIETER, []);
  // "Ganz weg" heisst ganz weg: sonst bliebe die Suche stehen und die
  // Liste waere nach dem Klick immer noch kuerzer als erwartet.
  awSuche = "";
  awPersonSuche = "";
  awNeuZeichnen();
}

// Die beiden Merkmale eines Scheins, immer auf dieselbe Art gelesen.
function awPersonVon(s) { return s && s.ordner ? String(s.ordner) : ""; }

// In WELCHE Schublade gehoert dieser Schein beim Personenfilter?
// Drei Antworten: eine Kennung, "weg" (von einer falschen Person
// abgezogen) oder "" (war nie zugeordnet).
// Karam (17.09.2026): "Ich will, dass es dafuer auch einen eigenen Filter
// gibt." Ohne die eigene Schublade laegen die Abgezogenen unter "keine
// Person" und waeren im Auswerten nicht mehr auffindbar.
// Der Zaehler und der Filter fragen BEIDE hier - sonst zeigte der Chip
// eine Zahl, die die Liste darunter nicht hat.
const AW_LOS = "weg";
function awPersonFach(s) {
  const id = awPersonVon(s);          // die eine Stelle, die "hat Person?" beantwortet
  if (id) return id;
  if (s && s.daten && s.daten.personWeg) return AW_LOS;
  return "";
}
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
  // Die Spielsuche sitzt GENAU HIER, in derselben Stufe wie Person und
  // Anbieter. Eine Stufe tiefer (awScheine) zeigten die Summenkacheln
  // Umsatz und Gewinn fuer den ganzen Zeitraum, waehrend darunter sieben
  // Kombinationen stehen - eine Geldzahl, die zu nichts gehoert.
  // Eine Stufe hoeher (awImZeitraum) sprangen die Personen- und
  // Anbieter-Chips bei jedem Tastendruck in Anzahl und Reihenfolge.
  const worte = awSuchWorte();
  return awImZeitraum().filter(s => {
    if (personen.length && personen.indexOf(awPersonFach(s)) < 0) return false;
    if (anbieter.length && anbieter.indexOf(awAnbieterVon(s)) < 0) return false;
    if (!awPasstZurSuche(s, worte)) return false;
    return true;
  });
}

function awScheine() {
  const zeig = awZeig();
  const alt = awReihe() === "alt";
  return awGefiltert()
    .filter(s => awStandSichtbar(s.stand, zeig))
    .sort((a, b) => {
      const v = String(a.created_at || "").localeCompare(String(b.created_at || ""));
      return alt ? v : -v;
    });
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
// Karam (17.09.2026): "riesengrosse Mengen ... die Suchmaschine muss
// noch immer funktionieren, auch bei 10.000 Kombis." Gesucht, gefiltert
// und summiert wird IMMER ueber alle Daten (awGefiltert) - nur
// GEZEICHNET wird in Bloecken. 10.000 Karten auf einmal in die Seite zu
// schreiben waere die Gedenkminute, vor der er warnt. Was nicht
// gezeichnet ist, steht mit Zahl und Nachlade-Knopf ausdruecklich da.
const AW_BLOCK = 150;
let awLimit = AW_BLOCK;

function zeichneAuswerten() {
  // Jedes volle Neuzeichnen (Zeitraum, Filter, Stand-Schalter) beginnt
  // wieder mit dem ersten Block - die Menge darunter ist eine andere.
  awLimit = AW_BLOCK;
  const box = el("auswerten");
  if (!box) return;
  const g = awGrenzen();
  const liste = awScheine();
  box.innerHTML = awKopfHtml(g, liste) +
    '<div id="aw_liste">' + awListeHtml(liste) + "</div>";
}

function awNurListeNeu() {
  const k = el("aw_liste");
  if (k) k.innerHTML = awListeHtml(awScheine());
}
function awMehrZeigen() { awLimit += AW_BLOCK; awNurListeNeu(); }
function awAlleZeigen() { awLimit = Number.MAX_SAFE_INTEGER; awNurListeNeu(); }

// ---------- Die beiden Filterkaesten rechts ----------
// Gezeigt wird IMMER nur, was im Zeitraum wirklich vorkommt, mit der
// Anzahl dahinter. So kann man nichts anwaehlen, das ohnehin leer ist,
// und sieht auf einen Blick, wo die Kombinationen liegen.
// Eine Auswahl, die es im Zeitraum nicht mehr gibt, bleibt trotzdem
// stehen und wird gezeigt - sonst waere sie still verschwunden und
// Karam suchte, warum die Liste leer ist.
// EIN Chip, von Personen- UND Anbieter-Kasten benutzt - der Knopf darf
// sich nie an zwei Stellen verschieden verhalten.
function awChipHtml(e, an, umFn) {
  // EINFACHE Anfuehrungszeichen im Aufruf, das Attribut selbst haengt
  // in doppelten. Hier stand JSON.stringify, und das liefert doppelte:
  // daraus wurde onclick="awPersonUm("pA")". Das Attribut endete beim
  // zweiten Anfuehrungszeichen, der Klick tat gar nichts, und es sah
  // aus, als gaebe es den Filter nicht. Im Browser durch echtes
  // Klicken gefunden, nicht durch Lesen.
  const ruf = umFn + "('" + String(e.wert).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "')";
  return '<button class="aw-chip' + (an ? " aktiv" : "") + (e.fehlt ? " aw-chipweg" : "") +
    '" onclick="' + textSicherM(ruf) + '" title="' +
    (e.tipp ? textSicherM(e.tipp)
      : (e.fehlt ? "gewählt, kommt in diesem Zeitraum aber nicht vor"
                 : e.zahl + " Kombination(en) in diesem Zeitraum")) + '">' +
    textSicherM(e.text) + ' <span class="aw-chipz">' + e.zahl + "</span></button>";
}

function awFilterGruppe(titel, eintraege, gewaehlt, umFn, alleFn, leerText) {
  const aus = gewaehlt.length === 0;
  let h = '<div class="aw-fgruppe"><div class="aw-ftitel">' + titel +
    (aus ? ' <span class="mini">(alle)</span>'
         : ' <span class="aw-fzahl">' + gewaehlt.length + " gewählt</span>") + "</div>" +
    '<div class="aw-fchips">' +
    '<button class="aw-chip' + (aus ? " aktiv" : "") + '" onclick="' + alleFn + '()">alle</button>';
  for (const e of eintraege) {
    h += awChipHtml(e, gewaehlt.indexOf(e.wert) >= 0, umFn);
  }
  if (!eintraege.length) h += '<span class="mini">' + leerText + "</span>";
  return h + "</div></div>";
}

// ---------- Das Suchfeld links unter dem Zeitraum ----------
// Karam (17.09.2026): "Da gibt es so eine riesen Leerflaeche links unter
// dem Zeitraum und die Filter." Genau dort steht es jetzt: der
// Filterkasten rechts ist gut dreimal so hoch wie die Zeitraum-Angaben
// links, darunter war nichts.
function awSucheHtml() {
  return '<div class="aw-suche">' +
    '<label class="aw-suchlabel" for="aw_suche">&#128269; Spiel suchen</label>' +
    '<div class="aw-suchzeile">' +
      '<input id="aw_suche" type="text" inputmode="search" enterkeyhint="search" ' +
        // Autokorrektur aus: am Handy macht sie aus "besiktas" ein
        // deutsches Wort, und dann wird etwas anderes gesucht, als da steht.
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="z. B. Girona Palmas, Besiktas, Preussen Muenster, oder die Nr." ' +
        'value="' + textSicherM(awSuche) + '" oninput="awSuchen(this.value)">' +
      '<button id="aw_suchweg" onclick="awSucheWeg()"' + (awSuche ? "" : " hidden") +
        ">Suche löschen</button>" +
    "</div>" +
    '<div id="aw_suchstand" class="aw-suchstand mini">' + awSuchStandHtml() + "</div>" +
  "</div>";
}

// Was die Suche gerade tut, in einem Satz. Ohne ihn waere nach dem
// Tippen nur eine kuerzere Liste da und kein Grund dafuer.
function awSuchStandHtml() {
  const imZeitraum = awImZeitraum();
  if (!awSuche.trim()) {
    return "Tippe den Namen einer Mannschaft oder einer Partie. Gesucht wird in den " +
      "<b>Spielen</b> jeder Kombination, dazu Linie, Anbieter, Nummer und Person. " +
      "Mehrere Wörter müssen alle vorkommen. Groß- und Kleinschreibung, Umlaute und " +
      "Bindestriche sind egal.";
  }
  const treffer = awGefiltert().length;
  const gesperrt = awGefiltert().filter(s => (s.daten || {}).gesperrt).length;
  return "<b>" + treffer + "</b> von " + imZeitraum.length +
    " Kombinationen im Zeitraum passen auf <b>" + textSicherM(awSuche.trim()) + "</b>." +
    (gesperrt ? " Davon " + gesperrt + " nicht lesbar - die stehen immer dabei, " +
      "weil über ihren Inhalt niemand etwas sagen kann." : "") +
    " Umsatz und Gewinn oben zählen genau diese " + treffer + ".";
}

// ---------- Der Personen-Kasten: die letzten drei, dazu eine Suche ----------
// Karam (17.09.2026): "Ich moechte, dass ich bei den Personen nicht alle
// Personen angezeigt bekomme, sondern nur die letzten drei, die ich
// geoeffnet habe, und nur eine Suchleiste - das erspart mir einfach
// Platz bei der Suche."
// Die letzten drei kommen aus personenZuletzt() in logik.js - DERSELBEN
// Merkliste, die auch Mein Bereich und der Kombi-Bau benutzen. Sichtbar
// bleiben ausserdem IMMER: jede gewaehlte Person (ein aktiver Filter,
// den man nicht sieht, waere eine kuerzere Liste ohne Grund) und die
// zwei Sonderfaecher "keine Person" und "falsch zugeordnet" (dort liegt
// Geld, das noch niemandem zugerechnet ist). Alle anderen findet die
// Suche, und wie viele das sind, steht ausdruecklich da.
// Die Suche wird ABSICHTLICH nicht gemerkt - dieselbe Ueberlegung wie
// bei der Spielsuche: eine stehengebliebene Suche laesst Personen fehlen.
let awPersonSuche = "";
const AW_PERSONEN_KURZ = 3;

function awPersonZaehlen() {
  const zaehlP = {};
  for (const s of awImZeitraum()) {
    const p = awPersonFach(s);
    zaehlP[p] = (zaehlP[p] || 0) + 1;
  }
  const gewP = awPersonenFilter();
  // Gewaehltes, das im Zeitraum nicht vorkommt, trotzdem aufnehmen.
  for (const p of gewP) if (!(p in zaehlP)) zaehlP[p] = 0;
  return { zaehlP: zaehlP, gewP: gewP };
}

function awPersonEintrag(wert, zahl, gewaehlt) {
  return {
    wert: wert,
    text: wert === AW_LOS ? "⚠ falsch zugeordnet"
        : (wert ? (awPersonName(wert) || "Person " + String(wert).slice(0, 6)) : "keine Person"),
    zahl: zahl || 0,
    fehlt: !!gewaehlt && !zahl,
    tipp: (!gewaehlt && !zahl)
      ? "in diesem Zeitraum keine Kombination - anklicken filtert trotzdem" : ""
  };
}

function awPersonGruppeHtml() {
  const z = awPersonZaehlen();
  const zaehlP = z.zaehlP, gewP = z.gewP;
  const q = awHart(awPersonSuche);
  const gewaehltIst = w => gewP.indexOf(w) >= 0;
  let eintraege = [];
  let versteckt = 0;
  if (q) {
    // Gesucht wird ueber ALLE Personen des Bereichs, nicht nur die im
    // Zeitraum - Karam sucht ja gerade eine, die nicht vorn steht.
    // Dieselbe Verhaertung wie die Spielsuche: Umlaute, Gross/Klein,
    // Bindestriche egal.
    for (const w of Object.keys(zaehlP)) {
      if (!w || w === AW_LOS) eintraege.push(awPersonEintrag(w, zaehlP[w], gewaehltIst(w)));
    }
    for (const o of (Array.isArray(ordnerListe) ? ordnerListe : [])) {
      eintraege.push(awPersonEintrag(String(o.id), zaehlP[String(o.id)] || 0,
        gewaehltIst(String(o.id))));
    }
    eintraege = eintraege.filter(e => awHart(e.text).indexOf(q) > -1);
  } else {
    const zeigen = new Set(gewP);
    zeigen.add("");
    zeigen.add(AW_LOS);
    let n = 0;
    const liste = Array.isArray(ordnerListe) ? ordnerListe : [];
    for (const id of (typeof personenZuletzt === "function" ? personenZuletzt() : [])) {
      if (n >= AW_PERSONEN_KURZ) break;
      if (liste.some(o => String(o.id) === String(id)) && !zeigen.has(String(id))) {
        zeigen.add(String(id));
        n++;
      }
    }
    for (const w of Object.keys(zaehlP)) {
      if (zeigen.has(w)) eintraege.push(awPersonEintrag(w, zaehlP[w], gewaehltIst(w)));
      else versteckt++;
    }
    // Die letzten drei stehen auch dann da, wenn sie im Zeitraum leer
    // sind - sonst waere "zuletzt geoeffnet" mal da und mal nicht.
    for (const w of zeigen) {
      if (w && w !== AW_LOS && !(w in zaehlP)) {
        eintraege.push(awPersonEintrag(w, 0, gewaehltIst(w)));
      }
    }
  }
  eintraege.sort((a, b) => b.zahl - a.zahl || a.text.localeCompare(b.text, "de"));

  const aus = gewP.length === 0;
  let h = '<div class="aw-fgruppe" id="aw_pgruppe"><div class="aw-ftitel">&#128100; Person' +
    (aus ? ' <span class="mini">(alle)</span>'
         : ' <span class="aw-fzahl">' + gewP.length + " gewählt</span>") + "</div>" +
    '<div class="aw-psuchzeile">' +
      '<input id="aw_psuche" type="text" inputmode="search" ' +
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="Person suchen (Name oder Nummer)" value="' + textSicherM(awPersonSuche) +
        '" oninput="awPersonSuchen(this.value)">' +
      (awPersonSuche
        ? '<button class="aw-psuchweg" onclick="awPersonSuchen(\'\')" ' +
          'title="Personen-Suche löschen">&#10005;</button>' : "") +
    "</div>" +
    '<div class="aw-fchips">' +
    '<button class="aw-chip' + (aus ? " aktiv" : "") + '" onclick="awPersonenAlle()">alle</button>';
  for (const e of eintraege) h += awChipHtml(e, gewaehltIst(e.wert), "awPersonUm");
  if (!eintraege.length) {
    h += '<span class="mini">' + (q
      ? "Keine Person passt auf <b>" + textSicherM(awPersonSuche.trim()) + "</b>."
      : "In diesem Zeitraum liegt keine Kombination.") + "</span>";
  }
  h += "</div>";
  // Was gerade NICHT dasteht, steht ausdruecklich dabei - eine kurze
  // Liste ohne diesen Satz saehe aus, als gaebe es die anderen nicht.
  if (q) {
    h += '<div class="mini aw-pmehr">' + eintraege.length + " Person" +
      (eintraege.length === 1 ? "" : "en") + " passt" + (eintraege.length === 1 ? "" : "en") +
      " auf <b>" + textSicherM(awPersonSuche.trim()) + "</b>.</div>";
  } else if (versteckt) {
    h += '<div class="mini aw-pmehr">' + versteckt + " weitere " +
      (versteckt === 1 ? "Person ist" : "Personen sind") +
      " über die Suche zu finden.</div>";
  }
  return h + "</div>";
}

function awPersonKastenAuffrischen() {
  const g = el("aw_pgruppe");
  if (!g) return;
  const neu = document.createElement("div");
  neu.innerHTML = awPersonGruppeHtml();
  g.replaceWith(neu.firstElementChild);
}

function awPersonSuchen(wert) {
  awPersonSuche = String(wert || "");
  // NUR den Personen-Kasten neu zeichnen. Die ganze Ansicht wuerde das
  // Suchfeld beim ersten Buchstaben wegwerfen (dieselbe Falle wie bei
  // obSuchen und der Spielsuche).
  awPersonKastenAuffrischen();
  const f = el("aw_psuche");
  if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { } }
}

// ---------- Person direkt an der Karte zuordnen ----------
// Karam (17.09.2026): "Es kann oft sein, dass entweder keine Person
// zugeordnet ist oder die falsche. Ich will das direkt hier beim
// Auswerten aendern koennen, ohne die Person zu besuchen."
// Geschrieben wird ueber scheinOrdnerSchreiben in mein.js - DENSELBEN
// Weg, den die grosse Tabelle nimmt (mit 0-Zeilen-Wache und Merkliste).
// Ein eigener Schreibweg hier waere die Drift-Falle.
let awPwOffen = "";                 // Schein-Kennung des offenen Waehlers
let awPwSuche = "";                 // nie gemerkt, wie jede Suche hier
const AW_PW_HOECHSTENS = 12;

function awPersonWahlHtml(s) {
  return '<div class="aw-pwahl" id="aw_pw_' + s.id + '">' +
    '<div class="aw-pwkopf"><b>Person zuordnen</b> <span class="mini">- antippen gilt sofort</span>' +
      '<button class="aw-pwzu" onclick="awPersonWahlUm(\'' + s.id + '\')">schließen</button></div>' +
    '<input id="aw_pws_' + s.id + '" type="text" inputmode="search" ' +
      'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
      'placeholder="Person suchen (Name oder Nummer)" value="' + textSicherM(awPwSuche) +
      '" oninput="awPersonWahlSuchen(\'' + s.id + '\', this.value)">' +
    '<div class="aw-fchips" id="aw_pwc_' + s.id + '">' + awPersonWahlChips(s) + "</div>" +
  "</div>";
}

function awPersonWahlChips(s) {
  const q = awHart(awPwSuche);
  let liste = Array.isArray(ordnerListe) ? ordnerListe.slice() : [];
  // Zuletzt benutzte zuerst - dieselbe Reihenfolge wie ueberall
  // (personenSortiert in logik.js), keine eigene.
  if (typeof personenSortiert === "function") liste = personenSortiert(liste, kasseScheine);
  if (q) liste = liste.filter(o => awHart(o.name || "").indexOf(q) > -1);
  const mehr = Math.max(0, liste.length - AW_PW_HOECHSTENS);
  const kurz = liste.slice(0, AW_PW_HOECHSTENS);
  let h = "";
  for (const o of kurz) {
    const an = String(s.ordner || "") === String(o.id);
    h += '<button class="aw-chip' + (an ? " aktiv" : "") + '" onclick="awPersonZuordnen(\'' +
      s.id + "','" + String(o.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + '\')" title="' +
      (an ? "ist schon zugeordnet" : "dieser Person zuordnen") + '">' +
      textSicherM(o.name || "Person") + "</button>";
  }
  if (!kurz.length) {
    h += '<span class="mini">Keine Person passt auf <b>' + textSicherM(awPwSuche.trim()) +
      "</b>.</span>";
  }
  if (mehr) h += '<span class="mini">' + mehr + " weitere - tipp den Namen genauer.</span>";
  // Abziehen mit Vermerk laeuft ueber DENSELBEN Weg wie der Knopf in der
  // grossen Tabelle (tuPersonWeg): eigene Rueckfrage mit der Kasse
  // vorher/nachher, erst Vermerk, dann Person weg.
  if (s.ordner) {
    h += '<button class="aw-chip aw-pwweg" onclick="awPersonWeg(\'' + s.id + '\')" ' +
      'title="Von dieser Person abziehen, mit Vermerk - landet unter Falsch zugeordnet">' +
      "&#9888; nicht diese Person</button>";
  }
  return h;
}

function awPersonWahlUm(id) {
  awPwOffen = (awPwOffen === id) ? "" : id;
  awPwSuche = "";
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === id);
  if (s) awKarteAuffrischen(s);
  if (awPwOffen) {
    const f = el("aw_pws_" + id);
    if (f) f.focus();
  }
}

function awPersonWahlSuchen(id, wert) {
  awPwSuche = String(wert || "");
  // NUR die Chip-Liste tauschen, das Eingabefeld bleibt stehen - so
  // geht der Fokus beim Tippen nicht verloren.
  const k = el("aw_pwc_" + id);
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === id);
  if (k && s) k.innerHTML = awPersonWahlChips(s);
}

async function awPersonZuordnen(scheinId, ordnerId) {
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === scheinId);
  if (!s) return;
  if (typeof scheinOrdnerSchreiben !== "function") {
    meldungM("Zuordnen geht hier gerade nicht - die Seite ist unvollständig geladen. " +
      "Lad sie neu.", "warn");
    return;
  }
  if (String(s.ordner || "") === String(ordnerId || "")) {
    awPwOffen = ""; awPwSuche = "";
    awKarteAuffrischen(s);
    return;
  }
  const alterName = s.ordner ? (awPersonName(s.ordner) || "einer anderen Person") : "";
  if (!(await scheinOrdnerSchreiben(scheinId, ordnerId))) return;
  s.ordner = ordnerId || null;
  awPwOffen = ""; awPwSuche = "";
  meldungM("<b>Nr. " + (s.nummer || "?") + "</b> ist jetzt bei <b>" +
    textSicherM(awPersonName(ordnerId) || "Person") + "</b>." +
    (alterName ? " Vorher: " + textSicherM(alterName) + "." : ""), "gut");
  if (typeof kasseScheineGeaendert === "function") kasseScheineGeaendert();
  // Ist ein Personenfilter an, gehoert die Karte jetzt womoeglich nicht
  // mehr in die Liste - dann die ganze Ansicht frisch. Sonst reicht das
  // Noetige: die Karte, der Personen-Kasten, die Summen.
  if (awPersonenFilter().length) { zeichneAuswerten(); return; }
  awKarteAuffrischen(s);
  awPersonKastenAuffrischen();
  awSummeAuffrischen();
}

async function awPersonWeg(scheinId) {
  if (typeof tuPersonWeg !== "function") {
    meldungM("Abziehen geht hier gerade nicht - die Seite ist unvollständig geladen. " +
      "Lad sie neu.", "warn");
    return;
  }
  awPwOffen = ""; awPwSuche = "";
  // tuPersonWeg fragt selbst nach (mit der Kasse vorher/nachher),
  // schreibt erst den Vermerk, dann die Person weg, und laedt Mein
  // Bereich frisch. Danach wird die Auswert-Ansicht aus der frischen
  // Liste neu gezeichnet.
  await tuPersonWeg(scheinId);
  zeichneAuswerten();
}

function awFilterHtml(imZeitraum) {
  // Zaehlen, was es an Anbietern gibt. Die Personen zaehlt der
  // Personen-Kasten selbst (awPersonZaehlen) - eine zweite Zaehlung
  // hier waere die Drift-Falle.
  const zaehlA = {};
  for (const s of imZeitraum) {
    const a = awAnbieterVon(s);
    zaehlA[a] = (zaehlA[a] || 0) + 1;
  }
  const gewA = awAnbieterFilter();
  // Gewaehltes, das im Zeitraum nicht vorkommt, trotzdem aufnehmen.
  for (const a of gewA) if (!(a in zaehlA)) zaehlA[a] = 0;

  const anbieter = Object.keys(zaehlA).map(a => ({
    wert: a,
    text: a ? ((typeof anbieterName === "function" && anbieterName(a)) || a) : "ohne Anbieter",
    zahl: zaehlA[a],
    fehlt: zaehlA[a] === 0
  })).sort((a, b) => b.zahl - a.zahl || a.text.localeCompare(b.text));

  const etwasAn = awPersonenFilter().length || gewA.length;
  return '<div class="aw-filter">' +
    awPersonGruppeHtml() +
    awFilterGruppe("&#127978; Anbieter", anbieter, gewA, "awAnbieterUm", "awAnbieterAlle",
      "In diesem Zeitraum liegt keine Kombination.") +
    (etwasAn
      ? '<div class="aw-fhinweis mini"><b>Gefiltert.</b> Die Zahlen oben und die Liste ' +
        "unten zeigen nur die gewählten. " +
        '<button onclick="awFilterAlle()">Filter ganz weg</button></div>'
      : "") +
    "</div>";
}

// Der frueheste oder spaeteste Zeitpunkt der Liste, unabhaengig davon,
// wie sie gerade sortiert ist.
function awRandZeit(liste, frueh) {
  if (!liste.length || typeof wannText !== "function") return "-";
  let beste = null;
  for (const s of liste) {
    const t = String(s.created_at || "");
    if (!t) continue;
    if (beste === null) { beste = t; continue; }
    if (frueh ? (t < beste) : (t > beste)) beste = t;
  }
  return beste === null ? "-" : wannText(beste);
}

function awKopfHtml(g, liste) {
  const z = awZeitraum();
  const zeig = awZeig();
  // Wie viele gewonnene und verlorene gibt es im Zeitraum (samt Person,
  // Anbieter und Suche)? Die Zahl steht AM Schalter, damit man vor dem
  // Klick weiss, was er einblenden wuerde.
  const gefiltert = awGefiltert();
  let anzGew = 0, anzVer = 0;
  for (const s of gefiltert) {
    if (s.stand === "gewonnen") anzGew++;
    else if (s.stand === "verloren") anzVer++;
  }
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
      // Die zwei Stand-Schalter, direkt neben "Eigener Zeitraum".
      // Angeschaltet (gefuellt) = diese Scheine stehen mit in der Liste.
      '<span class="aw-skgruppe">' +
        '<button class="aw-zeit aw-sk-gew' + (zeig.gew ? " aktiv" : "") +
          '" onclick="awZeigUm(\'gew\')" title="' +
          (zeig.gew ? "Die gewonnenen wieder ausblenden"
                    : "Die " + anzGew + " gewonnenen mit anzeigen") + '">' +
          '&#10003; gewonnen <span class="aw-skz" id="aw_skz_gew">' + anzGew + "</span></button>" +
        '<button class="aw-zeit aw-sk-ver' + (zeig.ver ? " aktiv" : "") +
          '" onclick="awZeigUm(\'ver\')" title="' +
          (zeig.ver ? "Die verlorenen wieder ausblenden"
                    : "Die " + anzVer + " verlorenen mit anzeigen") + '">' +
          '&#10007; verloren <span class="aw-skz" id="aw_skz_ver">' + anzVer + "</span></button>" +
      "</span>" +
    "</div>" +
    // Karam (17.09.2026): "Der Filter soll ganz rechts daneben, Zeitraum
    // und so weiter." Also in DIESELBE Zeile wie die Zeitraum-Angaben,
    // rechts davon. Am Handy rutscht er darunter.
    '<div class="aw-reihe">' +
    // Links stehen jetzt ZWEI Kaesten untereinander: die Zeitraum-Angaben
    // und darunter die Spielsuche. Genau die Flaeche, die neben dem hohen
    // Filterkasten rechts leer war.
    '<div class="aw-links">' +
    // Karam (16.09.2026): "bei dem Zeitraum sie nicht untereinander,
    // sondern nebeneinander. Zeitraum, Saetze, Uhrzeit - und da mit der
    // Uhrzeit, also wann es genau gesetzt wurde."
    '<div class="aw-spanne">' +
      '<span class="aw-sp"><span class="aw-spt">Zeitraum</span>' +
        '<span class="aw-spw">' + g.spanne + "</span></span>" +
      '<span class="aw-sp"><span class="aw-spt">Sätze</span>' +
        '<span class="aw-spw">' + liste.length + "</span></span>" +
      // NICHT liste[0] und liste[letzter]: die Reihenfolge ist umstellbar,
      // und dann staende der juengste unter "Erster gesetzt". Also wirklich
      // das Kleinste und das Groesste suchen.
      '<span class="aw-sp"><span class="aw-spt">Erster gesetzt</span>' +
        '<span class="aw-spw">' + awRandZeit(liste, true) + "</span></span>" +
      '<span class="aw-sp"><span class="aw-spt">Letzter gesetzt</span>' +
        '<span class="aw-spw">' + awRandZeit(liste, false) + "</span></span>" +
    "</div>" +
    awSucheHtml() +
    "</div>" +
    awFilterHtml(awImZeitraum()) +
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
    // Der Haken "nur die noch offenen zeigen" ist WEG: dieselbe Frage
    // beantworten jetzt die zwei Schalter oben. Zwei Bedienstellen fuer
    // dasselbe waeren zwei Wahrheiten (Drift-Falle).
    '<div class="aw-zeile"><label>Reihenfolge: ' +
      '<select onchange="awReiheSetzen(this.value)">' +
        '<option value="neu"' + (awReihe() === "neu" ? " selected" : "") +
          ">neueste zuerst (alte unten)</option>" +
        '<option value="alt"' + (awReihe() === "alt" ? " selected" : "") +
          ">älteste zuerst</option>" +
      "</select></label></div>" +
    awSummeHtml(liste, g);
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
    // Die Suche ist der haeufigste Grund fuer eine leere Liste und muss
    // deshalb zuerst dastehen, samt dem Wort, nach dem gesucht wurde.
    if (awSuche.trim()) {
      return '<p class="mini">Keine Kombination enthält <b>' +
        textSicherM(awSuche.trim()) + "</b>" +
        (gefiltert ? " (dazu ist noch ein <b>Filter</b> gesetzt, " + gefiltert +
          " Auswahl rechts oben)" : "") + ". " +
        '<button onclick="awSucheWeg()">Suche löschen</button> ' +
        '<span class="mini">Geschrieben wird der Name so, wie der Anbieter ihn auf dem ' +
        "Schein hatte - probier ein einzelnes Wort.</span></p>";
    }
    return '<p class="mini">Hier ist nichts auszuwerten. ' +
      (gefiltert
        ? "Es ist ein <b>Filter</b> gesetzt (" + gefiltert + " Auswahl" +
          (gefiltert === 1 ? "" : "en") + " rechts oben). " +
          '<button onclick="awFilterAlle()">Filter ganz weg</button> '
        : "") +
      "Sonst: anderen Zeitraum nehmen, oder oben neben den Zeiträumen die Schalter " +
      "<b>gewonnen</b> und <b>verloren</b> anschalten.</p>";
  }
  // Karam (16.09.2026): "eine Nummerierung, die erste ist 1 und dann geht
  // es so weiter - vor allem wenn ich einen Filter nutze, dass ich mich
  // einfach nicht verwirre." Das ist eine LAUFENDE Nummer im gerade
  // gefilterten Zeitraum, NICHT die feste Nr. des Scheins. Beide stehen
  // nebeneinander, damit man sie nie verwechselt.
  // Gezeichnet wird hoechstens bis awLimit. Die laufende Nummer und das
  // "von N" zaehlen trotzdem ueber ALLES - die Menge aendert sich durch
  // das Blaettern ja nicht.
  const zeigen = liste.length > awLimit ? liste.slice(0, awLimit) : liste;
  return zeigen.map((s, i) => awKarteHtml(s, i + 1, liste.length)).join("") +
    (zeigen.length < liste.length
      ? '<div class="aw-mehr"><b>' + zeigen.length + " von " + liste.length +
        "</b> Kombinationen gezeichnet - die Zahlen und Summen oben zählen immer alle. " +
        '<button onclick="awMehrZeigen()">die nächsten ' +
        Math.min(AW_BLOCK, liste.length - zeigen.length) + " zeigen</button> " +
        '<button onclick="awAlleZeigen()">alle ' + liste.length +
        " zeigen (kann träge werden)</button></div>"
      : "");
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
  // Welches Bein hat die Suche getroffen? Markiert wird das GANZE Bein,
  // nicht ein Stueck Text darin: die Namen sind schon durch textSicherM
  // gelaufen, und in fertiges HTML nachtraeglich hineinzuschneiden wuerde
  // genau den Schutz aushebeln, fuer den textSicherM da ist.
  const worte = awSuchWorte();
  const spiele = (d.wetten || []).map(t =>
    '<span class="aw-spiel' + (awBeinTrifft(t, worte) ? " aw-treff" : "") + '">' +
    textSicherM(t.spiel || "") +
    (t.linie ? " <span class='mini'>(" + textSicherM(t.linie) + ")</span>" : "") +
    "</span>");
  return '<div class="aw-karte aw-' + s.stand + (awTeilGewinn(s) ? " aw-teilgewinn" : "") +
    '" id="aw_' + s.id + '"' +
    ' data-lfd="' + (lfd || "") + '" data-gesamt="' + (gesamt || "") + '">' +
    // Das Bild: klein daneben, Klick macht es gross (zeilen.js setzt
    // .foto-gross). Ohne Foto steht ein ruhiger Platzhalter, damit die
    // Karten nicht unterschiedlich breit werden.
    '<div class="aw-bild">' +
      // Bild, Lade-Platzhalter, Nochmal-Knopf oder Unlesbar-Marke kommen
      // aus dem EINEN Erzeuger in mein.js (fotoBildHtml, seit "Bilder
      // erst beim Zeigen" am 17.09.2026). Nur "hat wirklich keines"
      // behaelt hier den ruhigen Platzhalter, damit die Karten nicht
      // unterschiedlich breit werden.
      (typeof fotoBildHtml === "function" && typeof fotoErwartet === "function"
        ? (fotoErwartet(s)
          ? fotoBildHtml(s)
          : '<div class="aw-keinbild mini">kein Foto</div>')
        : (s.foto
          ? '<img class="minifoto" src="' + textSicherM(s.foto) + '" alt="Wettschein Nr. ' +
            (s.nummer || "") + '" title="Antippen macht das Bild groß">'
          : (s.fotoUnlesbar
            ? '<div class="aw-keinbild aw-fotokaputt mini">Foto da,<br>nicht lesbar</div>'
            : '<div class="aw-keinbild mini">kein Foto</div>'))) +
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
        // Karam (17.09.2026): "direkt daneben ein Button, wo ich eine
        // andere Person suchen und zuordnen kann - ohne dass ich die
        // Person besuchen muss."
        (schreib
          ? '<button class="aw-pknopf" onclick="awPersonWahlUm(\'' + s.id + '\')" title="' +
            (s.ordner ? "Eine andere Person zuordnen, direkt hier"
                      : "Dieser Kombination direkt hier eine Person geben") + '">&#9998; ' +
            (s.ordner ? "ändern" : "zuordnen") + "</button>"
          : "") +
      "</div>" +
      // Der Waehler wird NUR gebaut, wenn er offen ist - bei langen
      // Listen wuerde er sonst an jeder Karte unsichtbar mitgeschleppt.
      (schreib && awPwOffen === s.id ? awPersonWahlHtml(s) : "") +
      '<div class="aw-spiele mini">' + spiele.join("<br>") + "</div>" +
      '<div class="aw-geld">' +
        "Einsatz <b>" + awGeld(d.einsatz) + "</b> &middot; Quote <b>" +
        Number(d.quote || 0).toFixed(2) + "</b> &middot; möglich <b>" + awGeld(d.moeglich) + "</b>" +
      "</div>" +
    "</div>" +
    '<div class="aw-tasten">' +
      (schreib
        // Gruen ist nur dann gefuellt, wenn es ein VOLLER Gewinn ist -
        // sonst waeren gruen und orange gleichzeitig an und niemand
        // wuesste, was gilt.
        ? '<button class="aw-gruen' +
            (s.stand === "gewonnen" && !awTeilGewinn(s) ? " aktiv" : "") +
            '" onclick="awStand(\'' + s.id + '\',\'gewonnen\')">&#10003; aufgegangen</button>' +
          '<button class="aw-rot' + (s.stand === "verloren" ? " aktiv" : "") +
            '" onclick="awStand(\'' + s.id + '\',\'verloren\')">&#10007; nicht aufgegangen</button>' +
          '<button class="aw-orange' + (awTeilGewinn(s) ? " aktiv" : "") +
            '" onclick="awTeilUm(\'' + s.id + '\')" title="Gewonnen, aber der Anbieter hat ' +
            'weniger ausgezahlt (etwas gevoidet)? Hier den echten Betrag eintragen.">' +
            "&#177; weniger gekommen</button>" +
          '<div class="aw-teilform" id="aw_tf_' + s.id + '" hidden>' +
            '<label class="mini" for="aw_tfe_' + s.id + '">wirklich gekommen:</label> ' +
            '<input id="aw_tfe_' + s.id + '" class="einsatz aw-echt" type="text" ' +
              'inputmode="decimal" value="' +
              (s.echt_zurueck !== null && s.echt_zurueck !== undefined
                ? Number(s.echt_zurueck).toFixed(2) : "") +
              '" placeholder="' + Number(d.moeglich || 0).toFixed(2) + '"> &euro; ' +
            '<button class="aw-orange aw-teilok" onclick="awTeilSpeichern(\'' + s.id +
              '\')">so speichern</button>' +
          "</div>" +
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
    // Karams Fall: gewonnen, aber der Anbieter hat weniger ausgezahlt
    // (etwas wurde gevoidet). Das steht als ORANGE Zeile dran, mit
    // beiden Zahlen - sonst sieht ein beschnittener Gewinn aus wie ein
    // voller und die Differenz faellt niemandem mehr auf.
    return (awTeilGewinn(s)
      ? '<div class="aw-teilmarke">nicht zur Gänze gewonnen: <b>' +
        awGeld(s.echt_zurueck) + "</b> statt möglich " +
        awGeld((s.daten || {}).moeglich) + "</div>"
      : "") +
      "gekommen: " + (schreib
      // type="text" statt type="number": das Zahlenfeld verschluckt
      // "250,50" je nach Spracheinstellung stillschweigend (bekannte
      // Falle). awEcht wandelt das Komma selbst um.
      ? '<input class="einsatz aw-echt" type="text" inputmode="decimal" value="' +
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

// ---------- Der dritte Ausgang: gewonnen, aber nicht der volle Betrag ----------
// Karam (17.09.2026): "Manche Wetten gewinne ich zwar, aber ich bekomme
// nicht den vollen Betrag - da wird irgendwas gevoidet oder so. Ich
// moechte da unten einen orangenen Button, darauf klicke ich und kann
// direkt eintippen, was der eigentlich gewonnene Betrag ist, und dann
// steht da: nicht zur Gaenze gewonnen, das ist dann orange."
//
// Orange ist KEIN eigener Stand in der Datenbank. Der Schein steht auf
// "gewonnen", der echte Betrag in echt_zurueck - denselben Feldern, mit
// denen Buchhaltung, Kombi-Konto und Berichte laengst rechnen. Ein
// dritter Stand haette jede dieser Rechnungen anfassen muessen und
// waere frueher oder spaeter irgendwo vergessen worden. Orange ist nur
// die SICHTBARKEIT davon: gewonnen, und echt_zurueck weicht vom
// Moeglich-Wert ab. Das ist aus den echten Geldzahlen abgeleitet, nicht
// aus einem Merker, der auseinanderlaufen koennte.
function awTeilGewinn(s) {
  if (!s || s.stand !== "gewonnen") return false;
  if (s.echt_zurueck === null || s.echt_zurueck === undefined) return false;
  const moeglich = ((s.daten || {}).moeglich) || 0;
  return Math.abs(Number(s.echt_zurueck) - moeglich) > 0.004;
}

function awTeilUm(id) {
  const f = el("aw_tf_" + id);
  if (!f) return;
  f.hidden = !f.hidden;
  if (!f.hidden) {
    const feld = el("aw_tfe_" + id);
    if (feld) { feld.focus(); try { feld.select(); } catch (e) { } }
  }
}

async function awTeilSpeichern(id) {
  const s = (Array.isArray(kasseScheine) ? kasseScheine : []).find(x => x.id === id);
  if (!s) return;
  const feld = el("aw_tfe_" + id);
  const roh = String(feld ? feld.value : "").trim();
  const zahl = parseFloat(roh.replace(",", "."));
  if (roh === "" || isNaN(zahl) || zahl < 0) {
    meldungM("Das ist kein Betrag: \"" + roh + "\". Nichts gespeichert.", "warn");
    return;
  }
  const vorher = s.stand;
  // EIN Schreibvorgang fuer Stand UND Betrag. Zwei getrennte koennten
  // in der Mitte scheitern: dann stuende "gewonnen" mit dem vollen
  // Moeglich-Wert da - genau die Zahl, die Karam korrigieren wollte.
  const r = await supaScheinAendern(id, { stand: "gewonnen", echt_zurueck: zahl });
  if (r.error) {
    meldungM("Nicht gespeichert: " + r.error.message + " Der Schein steht weiter auf \"" +
      vorher + "\".", "warn");
    return;
  }
  if (!r.data || !r.data.length) {
    meldungM("<b>Nicht gespeichert.</b> Es wurde keine Zeile geändert - fehlendes " +
      "Schreibrecht, oder die Kombination ist nicht mehr da. Nr. " + (s.nummer || "?") +
      " steht weiter auf \"" + vorher + "\".", "warn");
    return;
  }
  s.stand = "gewonnen";
  s.echt_zurueck = zahl;
  s.updated_at = new Date().toISOString();
  const moeglich = ((s.daten || {}).moeglich) || 0;
  if (Math.abs(zahl - moeglich) <= 0.004) {
    // Ehrlich sagen, warum hier nichts orange wird.
    meldungM("Nr. " + (s.nummer || "?") + ": Der Betrag ist genau der mögliche Gewinn - " +
      "der Schein steht als ganz normal gewonnen da (grün, nicht orange).", "gut");
  }
  awKarteAuffrischen(s);
  awSummeAuffrischen();
  awStandSchalterAuffrischen();
  if (typeof kasseScheineGeaendert === "function") kasseScheineGeaendert();
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
  // Die 0-Zeilen-Falle: ein an RLS gescheitertes Update kommt OHNE error
  // zurueck. Ohne diese Pruefung saehe die Karte gruen aus, waehrend in
  // der Datenbank weiter "offen" steht - beim naechsten Laden waere der
  // Klick wie nie geschehen.
  if (!r.data || !r.data.length) {
    meldungM("<b>Nicht gespeichert.</b> Es wurde keine Zeile geändert - fehlendes " +
      "Schreibrecht, oder die Kombination ist nicht mehr da. Nr. " + (s.nummer || "?") +
      " steht weiter auf \"" + vorher + "\".", "warn");
    return;
  }
  s.stand = wert;
  s.updated_at = new Date().toISOString();
  awKarteAuffrischen(s);
  awSummeAuffrischen();
  awStandSchalterAuffrischen();
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
  if (!r.data || !r.data.length) {
    meldungM("<b>Nicht gespeichert.</b> Es wurde keine Zeile geändert - fehlendes " +
      "Schreibrecht, oder die Kombination ist nicht mehr da.", "warn");
    return;
  }
  s.echt_zurueck = zahl;
  awKarteAuffrischen(s);
  awSummeAuffrischen();
  if (typeof kasseScheineGeaendert === "function") kasseScheineGeaendert();
}

function awKarteAuffrischen(s) {
  const karte = el("aw_" + s.id);
  if (!karte) return;
  // Blendet der Stand-Schalter diesen Schein gerade aus, verschwindet die
  // Karte - mit einer kurzen Notiz, damit es nicht aussieht, als waere
  // etwas verloren gegangen, und mit dem Weg, sie wiederzuholen.
  if (!awStandSichtbar(s.stand, awZeig())) {
    karte.outerHTML = '<div class="aw-weg mini">Nr. ' + (s.nummer || "?") + " auf <b>" +
      (s.stand === "gewonnen" ? "aufgegangen" : "nicht aufgegangen") +
      "</b> gesetzt. Der Schalter <b>" +
      (s.stand === "gewonnen" ? "gewonnen" : "verloren") +
      "</b> oben neben den Zeiträumen holt sie wieder ins Bild.</div>";
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

// Nach jedem Klick auf gruen oder rot stimmen die Zahlen AN den zwei
// Stand-Schaltern nicht mehr. Nur die zwei Zahlen nachziehen - die ganze
// Ansicht neu zu zeichnen wuerde das Weiterarbeiten ausbremsen.
function awStandSchalterAuffrischen() {
  let g = 0, v = 0;
  for (const s of awGefiltert()) {
    if (s.stand === "gewonnen") g++;
    else if (s.stand === "verloren") v++;
  }
  const eg = el("aw_skz_gew"); if (eg) eg.textContent = g;
  const ev = el("aw_skz_ver"); if (ev) ev.textContent = v;
}

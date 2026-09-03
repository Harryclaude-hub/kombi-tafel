// ============================================================
// VERTEILER: baut aus den offenen Wetten moeglichst viele
// Dreier-Kombinationen, jede mit dem vollen Ziel-Einsatz.
//
// Es stecken ZWEI Verfahren darin, die beide dieselbe Aufgabe
// loesen und beide dieselben Regeln einhalten:
//   "paare"  denkt von den Anbietern her (beste Belegung,
//            wenigste unsichere Teile)
//   "suche"  probiert viele Loesungen und behaelt die beste
//            (verwertet auch den letzten Rest)
// verteileBeste() rechnet BEIDE und nimmt, was mehr Dreier
// liefert - bei Gleichstand die sauberere Belegung. Das ist
// Karams Rangfolge: erst alles raus, dann so sicher wie moeglich.
//
// Die Regeln (nachgeprueft am 28.08. mit dem Pruefstand,
// 14 Faelle je Verfahren, null Regelbrueche):
//   R1 genau drei Wetten je Schein
//   R2 drei VERSCHIEDENE Spiele je Schein
//   R3 jede Wette in hoechstens zwei Scheinen
//   R4 der Anbieter des Scheins fuehrt alle drei Wetten
//   R5 jede echte Quote (nach Gebuehr) ueber der Mindestquote
//   R6 Bet365 ist die letzte Wahl
//   R7 jede Kombination will das volle Ziel (400)
//   R8 Ausweichen auf Unbestaetigtes ist erlaubt, wird aber
//      als "geschaetzt" oder "unsicher" markiert
//   R9 nie behaupten, ein Anbieter habe einen Markt sicher nicht
// ============================================================
"use strict";
(function (FENSTER) {
"use strict";

/*
  VERFAHREN "UEBER DIE ANBIETER GEDACHT"
  =====================================

  Grundgedanke in einem Satz: nicht die Wetten fragen "wo passe ich hin",
  sondern jeden Anbieter fragen "welche Wetten fuehrst DU, und wie viele
  Dreier bekomme ich daraus".

  Warum so:
  Ein Schein gehoert IMMER genau einem Anbieter (R4). Also ist der Anbieter
  der Topf, und die Frage ist nur, welche Wette in welchen Topf wandert.
  Wetten, die nur ein einziger Anbieter fuehrt, sind der Engpass. Wetten,
  die alle vier fuehren, sind Verschiebemasse. Deshalb bekommt in jeder
  Runde der Anbieter den Zuschlag, der gerade die "unbeweglichsten" Wetten
  verbaut, und nicht einfach der erste in der Liste.

  Die zweite Idee ist die Kapazitaets-Regel:
  Jede Wette darf zweimal verbaut werden (R3), jedes Spiel darf pro Schein
  nur einmal vorkommen (R2). Ein Spiel hat also eine Rest-Kapazitaet
  (Summe der offenen Verwendungen seiner Wetten). Wer in jeder Runde die
  DREI SPIELE MIT DER GROESSTEN REST-KAPAZITAET nimmt, holt beweisbar die
  maximale Anzahl Dreier heraus. Nimmt man stattdessen stur der Reihe nach,
  bleibt am Ende ein Spiel mit viel Kapazitaet uebrig, das keinen Partner
  mehr findet. Genau das ist der Grund, warum der heutige Bau so viele
  Reste erzeugt.

  Die dritte Idee sind die Belegstufen. Verfuegbarkeit ist kein Ja/Nein,
  sondern eine Rangfolge:
      Rang 0 belegt      Karam hat dort selbst eine Quote (BEWEIS)
      Rang 1 geschaetzt  eigene Quote vorhanden, VERF sagt J
      Rang 2 duenn       eigene Quote vorhanden, VERF sagt D oder nichts
      Rang 3 notfall     VERF sagt N, oder die Quote ist nur abgeleitet
  Gebaut wird in vier Wellen: erst alles, was auf Rang 0 geht, dann Rang 1
  dazu, und so weiter. Nichts wird ausgeschlossen (R9), aber schlechteres
  Material kommt erst dran, wenn das gute verbaut ist, und wird im Ergebnis
  als "unsicher" ausgewiesen (R8).

  Was das Verfahren NICHT tut: es behauptet nie, ein Anbieter habe einen
  Markt sicher nicht. Rang 3 heisst "letzte Wahl", nicht "unmoeglich".
*/

/* ------------------------------------------------------------------ */
/* Feste Groessen                                                      */
/* ------------------------------------------------------------------ */

// KARAMS REGEL (03.09.2026): die eingetippte Quote gilt UNGETEILT,
// auch bei Interwetten - die Gebuehr rechnet die Tafel rueckwaerts aus
// dem angesagten Hoechstgewinn (siehe daten.js). Teiler bleiben als
// Mechanik stehen, alle auf 1.
var GEBUEHREN_TEILER = { iw: 1.00, bw: 1.00, b3: 1.00, st: 1.00 };

var ALLE_ANBIETER = ["iw", "bw", "b3", "st"];
var LETZTE_WAHL = "b3";
// KARAMS RANGFOLGE (28.08.): Stake zuerst, dann Interwetten, dann Bwin
// (bzw. Sportingbet - dasselbe Haus), Bet365 ganz zuletzt.
// Kleinere Zahl = lieber. Das ist ein WUNSCH, keine Pflicht: bringt ein
// bevorzugter Anbieter keinen Dreier zustande, gewinnt trotzdem der, der
// einen zustande bringt. Kein einziger Dreier geht dafuer verloren.
var ANBIETER_RANG = { st: 0, iw: 1, bw: 2, b3: 3 };
function anbRang(kz) {
  return Object.prototype.hasOwnProperty.call(ANBIETER_RANG, kz) ? ANBIETER_RANG[kz] : 2;
}          // R6

var RANG_BELEGT = 0;
var RANG_GESCHAETZT = 1;
var RANG_DUENN = 2;
var RANG_NOTFALL = 3;

// Nach aussen gibt es nur drei Woerter. Rang 2 und Rang 3 sind beide
// "unsicher", damit Karam auf einen Blick sieht, was nicht bestaetigt ist.
var RANG_WORT = ["belegt", "geschaetzt", "unsicher", "unsicher"];

/* ------------------------------------------------------------------ */
/* Kleinkram                                                           */
/* ------------------------------------------------------------------ */

function istZahl(x) {
  return typeof x === "number" && isFinite(x);
}

function runde(x, stellen) {
  var f = Math.pow(10, stellen);
  return Math.round(x * f) / f;
}

// Eigener Zufallsgeber mit Startwert. Kein Math.random, kein Date.now,
// damit derselbe Satz mit derselben Saat immer dasselbe Ergebnis gibt.
function zufallsgeber(saat) {
  var z = Math.floor(istZahl(saat) ? saat : 1) % 2147483647;
  if (z <= 0) z += 2147483646;
  return function () {
    z = (z * 16807) % 2147483647;
    return (z - 1) / 2147483646;
  };
}

// Anbieterliste saeubern und Bet365 ans Ende schieben (R6).
function reihenfolgeAnbieter(liste) {
  var quelle = Array.isArray(liste) && liste.length ? liste : ALLE_ANBIETER;
  var raus = [];
  var gesehen = {};
  for (var i = 0; i < quelle.length; i++) {
    var kz = quelle[i];
    if (ALLE_ANBIETER.indexOf(kz) < 0) continue;   // unbekannte Kuerzel ignorieren
    if (gesehen[kz]) continue;
    gesehen[kz] = true;
    raus.push(kz);
  }
  raus.sort(function (a, b) {
    // Nach Karams Rangfolge, nicht nach der Reihenfolge der Kaestchen.
    var ra = anbRang(a), rb = anbRang(b);
    if (ra !== rb) return ra - rb;
    return quelle.indexOf(a) - quelle.indexOf(b);
  });
  return raus;
}

/* ------------------------------------------------------------------ */
/* Bewertung einer einzelnen Stelle (Wette bei einem Anbieter)         */
/* ------------------------------------------------------------------ */

// Kleinste bekannte Rohquote der Wette ueber alle Anbieter.
// Wird als Ersatzwert genommen, wenn beim gefragten Anbieter gar keine
// Quote steht. Absichtlich die KLEINSTE: wer schaetzt, soll sich bei der
// Mindestquote nicht selbst beluegen.
function ersatzRohquote(w) {
  var klein = null;
  for (var i = 0; i < ALLE_ANBIETER.length; i++) {
    var q = w.quoten ? w.quoten[ALLE_ANBIETER[i]] : null;
    if (istZahl(q) && q > 1 && (klein === null || q < klein)) klein = q;
  }
  return klein;
}

// Ergebnis: null heisst "hier nicht verwendbar" (nur wegen R5 oder weil
// es ueberhaupt keine Zahl gibt), sonst {echt, rang, ausEigen}.
function stelleBauen(w, kz, mind, ersatz) {
  // HARTE SPERRE: der Mensch hat gesehen, dass es die Wette dort nicht
  // gibt. Das steht ueber jeder Schaetzung und ueber jeder Ersatzquote.
  if (w.gesperrt && w.gesperrt[kz]) return null;
  var teiler = GEBUEHREN_TEILER[kz] || 1;
  var eigen = w.quoten ? w.quoten[kz] : null;
  var roh = null;
  var ausEigen = false;

  if (istZahl(eigen) && eigen > 1) {
    roh = eigen;
    ausEigen = true;
  } else if (istZahl(ersatz) && ersatz > 1) {
    roh = ersatz;                       // abgeleitet, also nie besser als Rang 3
  }
  if (roh === null) return null;        // ohne jede Zahl geht gar nichts

  var echt = roh / teiler;
  // R5, harte Grenze: die ECHTE Quote nach Gebuehr muss die Mindestquote
  // erreichen. Genau auf der Grenze zaehlt als erreicht.
  // Seit 29.08.2026: jede Wette bringt ihre eigene Mindestquote aus dem
  // Foto mit (w.mind). Der uebergebene Wert ist nur noch der Ersatz.
  var mindW = (typeof w.mind === "number" && w.mind > 0) ? w.mind : mind;
  if (echt < mindW - 1e-9) return null;

  var v = (w.verf && w.verf[kz]) ? String(w.verf[kz]).toUpperCase() : "";
  var belegt = !!(w.belegt && w.belegt[kz]);

  var rang;
  if (!ausEigen) rang = RANG_NOTFALL;          // Preis nur geraten
  else if (belegt) rang = RANG_BELEGT;         // eigene Eingabe ist der Beweis
  else if (v === "J") rang = RANG_GESCHAETZT;
  else if (v === "N") rang = RANG_NOTFALL;     // moeglich, aber letzte Wahl (R9)
  else rang = RANG_DUENN;                      // D oder gar keine Angabe

  return { echt: echt, rang: rang, ausEigen: ausEigen };
}

/* ------------------------------------------------------------------ */
/* Hauptfunktion                                                       */
/* ------------------------------------------------------------------ */

function verteile(eingabe) {
  var ein = eingabe || {};
  var einst = ein.einst || {};

  var mind = istZahl(einst.mind) ? einst.mind : 1.5;
  var ziel = istZahl(einst.ziel) ? einst.ziel : 400;
  var maxNutzung = istZahl(einst.maxNutzung) ? Math.max(1, Math.floor(einst.maxNutzung)) : 2;
  var anbieter = reihenfolgeAnbieter(einst.anbieter);
  var wuerfel = zufallsgeber(einst.saat);
  // Dopplung heisst: derselbe Dreier ein zweites Mal. Das ist kein neuer
  // Schein, das ist nur der doppelte Einsatz auf dieselbe Wette. Deshalb
  // standardmaessig aus, per Einstellung aber zuschaltbar.
  var dopplungErlaubt = einst.dopplungErlaubt === true;
  // Optionale Anbieter-Grenzen je Kombination (R7). Ohne Angabe nimmt der
  // erste passende Anbieter die vollen 400.
  var grenzen = einst.limits && typeof einst.limits === "object" ? einst.limits : null;

  /* --- 1. Wetten einlesen und jede Stelle bewerten ----------------- */

  var tafel = [];          // eine Zeile je Wette
  var nachId = {};
  var rohListe = Array.isArray(ein.wetten) ? ein.wetten : [];

  for (var i = 0; i < rohListe.length; i++) {
    var w = rohListe[i];
    if (!w || w.id === null || w.id === undefined) continue;
    var id = String(w.id);
    if (nachId[id]) continue;                       // doppelte Id: erste gewinnt

    var spiel = (w.spiel === null || w.spiel === undefined || w.spiel === "")
      ? ("!ohnespiel!" + id)                        // ohne Spielangabe zaehlt sie als eigenes Spiel
      : String(w.spiel);

    var ersatz = ersatzRohquote(w);
    var stellen = {};
    var luecke = {};          // hier fehlt eine eigene Quote, Eintippen wuerde helfen
    var hatIrgendwo = false;
    for (var a = 0; a < anbieter.length; a++) {
      var kzA = anbieter[a];
      var s = stelleBauen(w, kzA, mind, ersatz);
      if (s) { stellen[kzA] = s; hatIrgendwo = true; }
      // Nur wenn ueberhaupt keine eigene Zahl da ist, bringt Eintippen etwas.
      // Steht dort schon eine Quote, die unter der Mindestquote liegt, ist
      // die Lage bekannt und ein Tipp waere nur Beschaeftigung.
      var eigeneZahl = w.quoten ? w.quoten[kzA] : null;
      luecke[kzA] = !(istZahl(eigeneZahl) && eigeneZahl > 1);
    }

    var zeile = {
      id: id,
      spiel: spiel,
      stellen: stellen,
      luecke: luecke,
      hatIrgendwo: hatIrgendwo,
      rest: maxNutzung,
      benutzt: 0,
      mischwert: wuerfel()        // fester Zufallswert je Wette, nur zum Losen
    };
    tafel.push(zeile);
    nachId[id] = zeile;
  }

  /* --- 2. Bau in vier Wellen --------------------------------------- */

  // Wellenplan. Gemessen an 600 Zufallslagen mit 6 bis 120 Wetten
  // (vergleich.js), Zahlen sind Summen ueber alle Laeufe:
  //   "fein" 99,2 % der theoretisch moeglichen Dreier, 18065 belegte Teile,
  //          nur 1139 unsichere Teile
  //   "grob" 99,3 % der Dreier, aber nur 8280 belegte Teile
  //   "aus"  100 % der Dreier, aber 7966 unsichere Teile, also das Siebenfache
  // Also: die feine Staffelung kostet nur 0,8 Prozent Dreier und liefert
  // dafuer doppelt so viele bestaetigte Scheine. Deshalb ist sie Vorgabe.
  // Der Verlust sitzt fast nur bei sehr kleinen Saetzen (6 bis 15 Wetten:
  // 94,0 gegen 99,3 Prozent), ab 41 Wetten sind es 99,5 gegen 100 Prozent.
  var plan = einst.wellenPlan === "grob" || einst.wellenPlan === "aus"
    ? einst.wellenPlan : "fein";
  var wellen = plan === "aus" ? [RANG_NOTFALL]
    : plan === "grob" ? [RANG_GESCHAETZT, RANG_DUENN, RANG_NOTFALL]
    : [RANG_BELEGT, RANG_GESCHAETZT, RANG_DUENN, RANG_NOTFALL];
  var kombis = [];
  var gebauteSchluessel = {};      // gegen exakte Dopplung
  var kombiZaehler = 0;

  // Zaehler je Anbieter. Bei sonst gleichwertigen Kandidaten bekommt der
  // Anbieter den Schein, der bisher am wenigsten abbekommen hat. Das
  // aendert die Anzahl der Dreier nicht, verteilt aber das Geld auf
  // mehrere Konten, statt alles auf ein einziges zu haeufen.
  var lastProAnbieter = {};

  for (var wi = 0; wi < wellen.length; wi++) {
    var welle = wellen[wi];
    // Wie viele Anbieter koennen diese Wette in dieser Welle fuehren?
    // Das ist das Mass fuer "unbeweglich": 1 heisst, nur dieser eine.
    var breite = beweglichkeit(tafel, anbieter, welle);

    while (true) {
      var gewaehlt = besterDreier(tafel, anbieter, welle, breite,
                                  gebauteSchluessel, dopplungErlaubt, lastProAnbieter);
      if (!gewaehlt) break;

      for (var g = 0; g < gewaehlt.wetten.length; g++) {
        gewaehlt.wetten[g].rest -= 1;
        gewaehlt.wetten[g].benutzt += 1;
      }
      gebauteSchluessel[gewaehlt.schluessel] = true;
      lastProAnbieter[gewaehlt.kz] = (lastProAnbieter[gewaehlt.kz] || 0) + 1;
      kombiZaehler += 1;
      kombis.push({
        nr: kombiZaehler,
        gebautBei: gewaehlt.kz,
        zeilen: gewaehlt.wetten
      });
    }
  }

  /* --- 3. Einsatz verteilen (R7) ----------------------------------- */

  var teileBelegt = 0, teileGeschaetzt = 0, teileUnsicher = 0;
  var summeGesetzt = 0;
  var ausKombis = [];

  for (var k = 0; k < kombis.length; k++) {
    var kb = kombis[k];
    var kandidaten = [];

    for (var ai = 0; ai < anbieter.length; ai++) {
      var kz = anbieter[ai];
      var schlechtester = -1;
      var produkt = 1;
      var geht = true;
      for (var z = 0; z < kb.zeilen.length; z++) {
        var st = kb.zeilen[z].stellen[kz];
        if (!st) { geht = false; break; }           // R4: fuehrt nicht alle drei
        if (st.rang > schlechtester) schlechtester = st.rang;
        produkt *= st.echt;
      }
      if (!geht) continue;
      kandidaten.push({
        kz: kz,
        rang: schlechtester,
        quote: produkt,
        rangAnb: anbRang(kz),
        eigen: kz === kb.gebautBei ? 0 : 1,
        platz: ai
      });
    }

    // Reihenfolge der Zahlstellen: KARAMS ANBIETER-REIHENFOLGE ZUERST
    // (Stake, Interwetten, Bwin/Sportingbet, Bet365 zuletzt).
    //
    // Frueher stand x.rang (der Beweis fuer die Quote) vorn. Gemessen an
    // 51 echten Wetten: sobald bei Interwetten Quoten eingetippt waren,
    // gingen 100 Prozent dorthin und Stake bekam nichts - obwohl Stake
    // die erste Wahl sein soll. Genau das war der Fehler.
    //
    // Nur der Notfall bleibt hinten: dort ist entweder bekannt, dass es
    // das Spiel beim Anbieter NICHT gibt, oder der Preis ist reine
    // Schaetzung. Auf so ein Konto zu setzen hilft niemandem.
    // Eine bloss unbekannte Verfuegbarkeit ist KEIN Notfall - die darf
    // Stake nicht nach hinten schieben.
    kandidaten.sort(function (x, y) {
      var xn = (x.rang === RANG_NOTFALL) ? 1 : 0;
      var yn = (y.rang === RANG_NOTFALL) ? 1 : 0;
      if (xn !== yn) return xn - yn;
      if (x.rangAnb !== y.rangAnb) return x.rangAnb - y.rangAnb;
      // Erst innerhalb DESSELBEN Anbieters zaehlt, wie gut die Quote belegt ist.
      if (x.rang !== y.rang) return x.rang - y.rang;
      if (x.eigen !== y.eigen) return x.eigen - y.eigen;
      if (y.quote !== x.quote) return y.quote - x.quote;
      return x.platz - y.platz;
    });

    var offen = ziel;
    var teile = [];
    for (var ki = 0; ki < kandidaten.length && offen > 0.0001; ki++) {
      var kand = kandidaten[ki];
      var deckel = (grenzen && istZahl(grenzen[kand.kz])) ? grenzen[kand.kz] : Infinity;
      if (deckel <= 0) continue;
      var betrag = runde(Math.min(offen, deckel), 2);
      if (betrag <= 0) continue;
      teile.push({
        kz: kand.kz,
        einsatz: betrag,
        sicherheit: RANG_WORT[kand.rang],
        quote: runde(kand.quote, 2)
      });
      offen = runde(offen - betrag, 2);
      if (kand.rang === RANG_BELEGT) teileBelegt++;
      else if (kand.rang === RANG_GESCHAETZT) teileGeschaetzt++;
      else teileUnsicher++;
    }

    var gesetzt = 0;
    for (var t = 0; t < teile.length; t++) gesetzt += teile[t].einsatz;
    gesetzt = runde(gesetzt, 2);
    summeGesetzt += gesetzt;

    ausKombis.push({
      nr: kb.nr,
      wetten: kb.zeilen.map(function (zz) { return zz.id; }),
      teile: teile,
      gesetzt: gesetzt,
      ziel: ziel,
      fehlend: runde(ziel - gesetzt, 2)
    });
  }

  /* --- 4. Reste und Bericht ---------------------------------------- */

  var uebrig = [];
  var benutzt = 0;
  for (var u = 0; u < tafel.length; u++) {
    if (tafel[u].benutzt > 0) benutzt++;
    else uebrig.push(tafel[u].id);
  }

  var summeZiel = runde(ausKombis.length * ziel, 2);
  var voll = 0;
  for (var v = 0; v < ausKombis.length; v++) if (ausKombis[v].fehlend <= 0.0001) voll++;

  var bericht = {
    kombisGesamt: ausKombis.length,
    kombisVoll: voll,
    summeGesetzt: runde(summeGesetzt, 2),
    summeZiel: summeZiel,
    abdeckung: summeZiel > 0 ? runde(summeGesetzt / summeZiel, 3) : 0,
    wettenBenutzt: benutzt,
    wettenGesamt: tafel.length,
    teileBelegt: teileBelegt,
    teileGeschaetzt: teileGeschaetzt,
    teileUnsicher: teileUnsicher,
    tippVorschlaege: tippVorschlaege(ausKombis, nachId, tafel, anbieter, ziel),
    // Zusatzzahlen, die nicht gefordert sind, aber zeigen, wie nah der Bau
    // am theoretisch Moeglichen liegt.
    obergrenzeKombis: obergrenze(tafel, maxNutzung),
    slotsGesamt: tafel.length * maxNutzung,
    slotsGenutzt: ausKombis.length * 3,
    kombisJeAnbieter: zaehleAnbieter(ausKombis)
  };

  return { kombis: ausKombis, uebrig: uebrig, bericht: bericht };
}

/* ------------------------------------------------------------------ */
/* Beweglichkeit: bei wie vielen Anbietern geht diese Wette in dieser   */
/* Welle ueberhaupt. 1 heisst Engpass, 4 heisst Verschiebemasse.        */
/* ------------------------------------------------------------------ */

function beweglichkeit(tafel, anbieter, welle) {
  var karte = {};
  for (var i = 0; i < tafel.length; i++) {
    var n = 0;
    for (var a = 0; a < anbieter.length; a++) {
      var st = tafel[i].stellen[anbieter[a]];
      if (st && st.rang <= welle) n++;
    }
    karte[tafel[i].id] = n;
  }
  return karte;
}

/* ------------------------------------------------------------------ */
/* Der Kern: EIN Dreier je Runde, ueber alle Anbieter verglichen        */
/* ------------------------------------------------------------------ */

function besterDreier(tafel, anbieter, welle, breite, gebaut, dopplungErlaubt, last) {
  var bestNormal = null;
  var bestB3 = null;

  for (var a = 0; a < anbieter.length; a++) {
    var kz = anbieter[a];
    var k = dreierFuerAnbieter(tafel, kz, a, welle, breite, gebaut, dopplungErlaubt);
    if (!k) continue;
    k.last = last[kz] || 0;
    if (kz === LETZTE_WAHL) {
      if (!bestB3 || istBesser(k, bestB3)) bestB3 = k;
    } else {
      if (!bestNormal || istBesser(k, bestNormal)) bestNormal = k;
    }
  }

  // R6, erste Stufe: Bet365 kommt nur zum Zug, wenn in dieser Runde kein
  // anderer erlaubter Anbieter ueberhaupt einen Dreier zustande bringt.
  if (bestNormal) return bestNormal;
  if (!bestB3) return null;

  // R6, zweite Stufe, Sicherheitsnetz. Die Suche je Anbieter schaut nur in
  // ein Fenster der besten fuenf Spiele. Theoretisch kann ein Anbieter
  // deshalb aufgeben, obwohl er genau diese drei Wetten fuehrt (naemlich
  // wenn in seinem Fenster nur schon gebaute Dreier liegen). Dann bekaeme
  // Bet365 einen Schein, den ein anderer genauso gut nehmen koennte.
  // Ehrlich gesagt: in 1200 Zufallslagen ist dieser Fall kein einziges Mal
  // eingetreten (4312 Bet365-Scheine, 0 Umzuege). Der Block bleibt
  // trotzdem drin, damit R6 aus der Bauart folgt und nicht aus Glueck.
  var umzug = null;
  for (var b = 0; b < anbieter.length; b++) {
    var kz2 = anbieter[b];
    if (kz2 === LETZTE_WAHL) continue;
    var schlechtester = -1;
    var geht = true;
    for (var i = 0; i < bestB3.wetten.length; i++) {
      var st = bestB3.wetten[i].stellen[kz2];
      if (!st || st.rang > welle) { geht = false; break; }
      if (st.rang > schlechtester) schlechtester = st.rang;
    }
    if (!geht || schlechtester > bestB3.maxRang) continue;
    var ersatz = machKandidat(bestB3.wetten, kz2, b, breite, bestB3.schluessel);
    ersatz.last = last[kz2] || 0;
    if (!umzug || istBesser(ersatz, umzug)) umzug = ersatz;
  }
  return umzug || bestB3;
}

// Vergleich zweier Kandidaten aus verschiedenen Anbietern.
function istBesser(a, b) {
  if (a.rangSumme !== b.rangSumme) return a.rangSumme < b.rangSumme;      // besser belegt zuerst
  if (a.enge !== b.enge) return a.enge > b.enge;                          // erst die unbeweglichen Wetten verbauen
  if (Math.abs(a.quote - b.quote) > 1e-9) return a.quote > b.quote;       // hoehere Echtquote (das meidet nebenbei die iw-Gebuehr)
  if (a.last !== b.last) return a.last < b.last;                          // Geld auf mehrere Konten verteilen
  return a.platz < b.platz;
}

function dreierFuerAnbieter(tafel, kz, platz, welle, breite, gebaut, dopplungErlaubt) {
  /* Schritt 1: Topf dieses Anbieters, nach Spielen gruppiert. */
  var spiele = {};
  var namen = [];
  for (var i = 0; i < tafel.length; i++) {
    var zeile = tafel[i];
    if (zeile.rest <= 0) continue;
    var st = zeile.stellen[kz];
    if (!st || st.rang > welle) continue;         // R4 und Wellen-Grenze
    if (!spiele[zeile.spiel]) { spiele[zeile.spiel] = { kap: 0, wetten: [] }; namen.push(zeile.spiel); }
    spiele[zeile.spiel].kap += zeile.rest;
    spiele[zeile.spiel].wetten.push(zeile);
  }
  if (namen.length < 3) return null;               // R2: ohne drei Spiele kein Dreier

  /* Schritt 2: in jedem Spiel die beste Wette zuerst.
     Reihenfolge: mehr Rest zuerst (verteilt die Verwendungen), dann die
     Wette, die sonst kaum jemand fuehrt, dann die hoehere Echtquote. */
  for (var n = 0; n < namen.length; n++) {
    var eintrag = spiele[namen[n]];
    eintrag.wetten.sort(function (x, y) {
      if (x.rest !== y.rest) return y.rest - x.rest;
      var bx = breite[x.id], by = breite[y.id];
      if (bx !== by) return bx - by;
      var sx = x.stellen[kz], sy = y.stellen[kz];
      if (sx.rang !== sy.rang) return sx.rang - sy.rang;
      if (sy.echt !== sx.echt) return sy.echt - sx.echt;
      if (x.mischwert !== y.mischwert) return x.mischwert - y.mischwert;
      return x.id < y.id ? -1 : 1;
    });
  }

  /* Schritt 3: die drei Spiele mit der groessten Rest-Kapazitaet.
     Das ist der Punkt, an dem die Ausbeute entsteht. Wer immer die
     vollsten Spiele zuerst anzapft, laesst am Ende kein Spiel mit vielen
     offenen Verwendungen und ohne Partner zurueck. */
  namen.sort(function (x, y) {
    var kx = spiele[x], ky = spiele[y];
    if (kx.kap !== ky.kap) return ky.kap - kx.kap;
    var ex = kx.wetten[0], ey = ky.wetten[0];
    if (breite[ex.id] !== breite[ey.id]) return breite[ex.id] - breite[ey.id];
    if (ex.mischwert !== ey.mischwert) return ex.mischwert - ey.mischwert;
    return x < y ? -1 : 1;
  });

  /* Schritt 4: normalerweise sind es genau die ersten drei. Nur wenn
     dieser Dreier schon einmal gebaut wurde, wird in der Nachbarschaft
     weitergesucht (die naechstbesten Spiele, zweitbeste Wette im Spiel). */
  var obergrenze = Math.min(namen.length, 5);
  var kandidat = null;

  for (var i1 = 0; i1 < obergrenze - 2 && !kandidat; i1++) {
    for (var i2 = i1 + 1; i2 < obergrenze - 1 && !kandidat; i2++) {
      for (var i3 = i2 + 1; i3 < obergrenze && !kandidat; i3++) {
        var gruppen = [spiele[namen[i1]], spiele[namen[i2]], spiele[namen[i3]]];
        var tiefe = [
          Math.min(2, gruppen[0].wetten.length),
          Math.min(2, gruppen[1].wetten.length),
          Math.min(2, gruppen[2].wetten.length)
        ];
        for (var p1 = 0; p1 < tiefe[0] && !kandidat; p1++) {
          for (var p2 = 0; p2 < tiefe[1] && !kandidat; p2++) {
            for (var p3 = 0; p3 < tiefe[2] && !kandidat; p3++) {
              var drei = [gruppen[0].wetten[p1], gruppen[1].wetten[p2], gruppen[2].wetten[p3]];
              var schluessel = drei.map(function (d) { return d.id; }).sort().join("|");
              if (!dopplungErlaubt && gebaut[schluessel]) continue;
              kandidat = machKandidat(drei, kz, platz, breite, schluessel);
            }
          }
        }
      }
    }
  }
  return kandidat;
}

function machKandidat(drei, kz, platz, breite, schluessel) {
  var rangSumme = 0, maxRang = 0, quote = 1, enge = 0;
  for (var i = 0; i < drei.length; i++) {
    var st = drei[i].stellen[kz];
    rangSumme += st.rang;
    if (st.rang > maxRang) maxRang = st.rang;      // der schwaechste Beleg bestimmt den Schein
    quote *= st.echt;
    enge += 1 / Math.max(1, breite[drei[i].id]);   // 1 = nur dieser Anbieter kann sie
  }
  return {
    kz: kz, platz: platz, wetten: drei, schluessel: schluessel,
    rangSumme: rangSumme, maxRang: maxRang, quote: quote, enge: enge, last: 0
  };
}

/* ------------------------------------------------------------------ */
/* Tipp-Vorschlaege: welche Quote einzutippen bringt am meisten         */
/* ------------------------------------------------------------------ */

function tippVorschlaege(kombis, nachId, tafel, anbieter, ziel) {
  var sammler = {};

  function merke(id, kz, betrag, art, grund) {
    var s = id + "|" + kz;
    if (!sammler[s]) sammler[s] = { id: id, kz: kz, art: art, grund: grund, gewinnAnAbdeckung: 0 };
    sammler[s].gewinnAnAbdeckung += betrag;
  }

  // Fall A: ein Teil haengt an einer Schaetzung. Wird diese eine Quote
  // eingetippt, wird aus dem Teil ein belegter Teil.
  for (var k = 0; k < kombis.length; k++) {
    var kb = kombis[k];
    for (var t = 0; t < kb.teile.length; t++) {
      var teil = kb.teile[t];
      if (teil.sicherheit === "belegt") continue;
      for (var w = 0; w < kb.wetten.length; w++) {
        var zeile = nachId[kb.wetten[w]];
        var st = zeile.stellen[teil.kz];
        if (!st || st.rang === RANG_BELEGT) continue;
        merke(zeile.id, teil.kz, teil.einsatz, "mehr Sicherheit",
          "Kombination " + kb.nr + " steht bei " + teil.kz + " nur auf einer Schaetzung ("
          + (st.ausEigen ? "Verfuegbarkeit geraten" : "auch die Quote ist nur abgeleitet")
          + "), mit der echten Quote waere der Schein bestaetigt");
      }
    }
  }

  // Fall B: Wetten, die gar nicht verbaut wurden. Eine bestaetigte Quote
  // kann eine komplett neue 400er-Kombination freischalten, aber nur wenn
  // beim selben Anbieter noch zwei Wetten aus anderen Spielen offen sind.
  for (var i = 0; i < tafel.length; i++) {
    var z = tafel[i];
    if (z.benutzt > 0) continue;
    for (var a = 0; a < anbieter.length; a++) {
      var kz = anbieter[a];
      // Nur wo gar keine eigene Quote steht. Steht dort eine, die unter
      // der Mindestquote liegt, weiss Karam schon Bescheid, und wo die
      // Wette ohnehin verwendbar waere, hilft Eintippen der Ausbeute nicht.
      if (!z.luecke[kz] || z.stellen[kz]) continue;
      var partner = 0;
      var spieleGesehen = {};
      for (var j = 0; j < tafel.length; j++) {
        var p = tafel[j];
        if (p === z || p.rest <= 0 || p.spiel === z.spiel) continue;
        if (!p.stellen[kz]) continue;
        if (spieleGesehen[p.spiel]) continue;
        spieleGesehen[p.spiel] = true;
        partner++;
        if (partner >= 2) break;
      }
      if (partner >= 2) {
        merke(z.id, kz, ziel, "mehr Einsatz",
          z.hatIrgendwo
            ? "Wette blieb uebrig, bei " + kz + " fehlt die Quote, mit ihr waere ein weiterer Dreier moeglich"
            : "von dieser Wette ist nirgends eine brauchbare Quote bekannt, deshalb faellt sie ganz aus");
        break;   // ein Vorschlag je uebriger Wette reicht
      }
    }
  }

  var liste = [];
  for (var s in sammler) if (Object.prototype.hasOwnProperty.call(sammler, s)) liste.push(sammler[s]);
  liste.sort(function (x, y) {
    if (y.gewinnAnAbdeckung !== x.gewinnAnAbdeckung) return y.gewinnAnAbdeckung - x.gewinnAnAbdeckung;
    // bei gleichem Betrag zuerst das, was zusaetzliches Geld in Scheine
    // bringt, danach das, was vorhandene Scheine absichert
    var ax = x.art === "mehr Einsatz" ? 0 : 1;
    var ay = y.art === "mehr Einsatz" ? 0 : 1;
    if (ax !== ay) return ax - ay;
    if (x.id !== y.id) return x.id < y.id ? -1 : 1;
    return x.kz < y.kz ? -1 : 1;
  });
  return liste.slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Obergrenze: wie viele Dreier waeren ohne jede Anbieter-Schranke      */
/* ueberhaupt moeglich. Nur als Massstab fuer den Bericht.              */
/* ------------------------------------------------------------------ */

function obergrenze(tafel, maxNutzung) {
  var proSpiel = {};
  var summe = 0;
  for (var i = 0; i < tafel.length; i++) {
    if (!tafel[i].hatIrgendwo) continue;
    proSpiel[tafel[i].spiel] = (proSpiel[tafel[i].spiel] || 0) + maxNutzung;
    summe += maxNutzung;
  }
  var kaps = [];
  for (var s in proSpiel) if (Object.prototype.hasOwnProperty.call(proSpiel, s)) kaps.push(proSpiel[s]);
  var t = Math.floor(summe / 3);
  while (t > 0) {
    var deckung = 0;
    for (var j = 0; j < kaps.length; j++) deckung += Math.min(kaps[j], t);
    if (deckung >= 3 * t) return t;
    t--;
  }
  return 0;
}

function zaehleAnbieter(kombis) {
  var z = {};
  for (var i = 0; i < kombis.length; i++) {
    for (var t = 0; t < kombis[i].teile.length; t++) {
      var kz = kombis[i].teile[t].kz;
      z[kz] = (z[kz] || 0) + 1;
    }
  }
  return z;
}

FENSTER.verteilePaare = verteile;

})(typeof window !== "undefined" ? window : module.exports);

(function (FENSTER) {
"use strict";

/* ======================================================================
   VERFAHREN "SUCHE MIT BEWERTUNG"
   ----------------------------------------------------------------------
   Grundgedanke in einem Satz: Ich baue denselben Wettordner viele Male
   hintereinander auf, jedes Mal mit einer anderen Reihenfolge, gebe jedem
   fertigen Aufbau eine Punktzahl und behalte den besten.

   Warum ueberhaupt suchen und nicht einfach rechnen?
   Die Aufgabe ist ein Zuordnungsproblem mit mehreren harten Regeln
   (drei verschiedene Spiele, hoechstens zwei Scheine je Wette, alle drei
   Wetten beim selben Anbieter). Wer nur EINMAL gierig durchlaeuft, faellt
   auf die erste Reihenfolge herein: eine seltene Wette wird frueh mit
   zwei Allerweltswetten verbraucht und fehlt spaeter dort, wo sie die
   einzige Moeglichkeit gewesen waere. Mehrere Laeufe mit verschiedenen
   Reihenfolgen und eine Punktzahl am Ende sind die billigste Art, das zu
   reparieren, ohne dass die Laufzeit explodiert.

   Die drei Belegstufen sind das Herz des Verfahrens:
     BELEGT      Karam hat die Quote bei diesem Anbieter selbst eingetippt
                 oder sie kommt aus einem Screenshot. Das ist ein Beweis,
                 dass es den Markt dort gibt.
     GESCHAETZT  Die Tabelle sagt J. Kein Beweis, aber plausibel.
     UNSICHER    Die Tabelle sagt D oder N, oder wir wissen gar nichts.
   Gebaut wird deshalb in drei Wellen: zuerst werden Dreier gesucht, die
   bei EINEM Anbieter komplett belegt sind, danach die nur geschaetzten,
   ganz zum Schluss der markierte Notausgang.
   Nach Regel R9 wird NIE ein Anbieter ausgeschlossen. N ist nur die
   schlechteste Bewertung, kein Verbot.
   ====================================================================== */

/* ---------------------------------------------------------------------
   Feste Groessen
   --------------------------------------------------------------------- */

// KARAMS REGEL (03.09.2026): die eingetippte Quote gilt UNGETEILT,
// auch bei Interwetten - die Gebuehr rechnet die Tafel rueckwaerts aus
// dem angesagten Hoechstgewinn (siehe daten.js). Teiler bleiben als
// Mechanik stehen, alle auf 1.
var GEBUEHREN_TEILER = { iw: 1, bw: 1, b3: 1, st: 1 };

// Regel R6: Bet365 ist die letzte Wahl.
var LETZTE_WAHL = "b3";
// KARAMS RANGFOLGE (28.08.): Stake zuerst, dann Interwetten, dann Bwin
// (bzw. Sportingbet - dasselbe Haus), Bet365 ganz zuletzt.
// Kleinere Zahl = lieber. Das ist ein WUNSCH, keine Pflicht: bringt ein
// bevorzugter Anbieter keinen Dreier zustande, gewinnt trotzdem der, der
// einen zustande bringt. Kein einziger Dreier geht dafuer verloren.
var ANBIETER_RANG = { st: 0, iw: 1, bw: 2, b3: 3 };
function anbRang(kz) {
  return Object.prototype.hasOwnProperty.call(ANBIETER_RANG, kz) ? ANBIETER_RANG[kz] : 2;
}

// Guete einer Wette bei einem Anbieter. Hoeher ist besser.
// 4    eigene Quote eingetippt oder Screenshot  -> BELEGT, ein Beweis
// 3    Tabelle sagt J und eine Roh-Quote liegt vor
// 2.5  Tabelle sagt J, aber keine eigene Roh-Quote (Ersatzquote noetig)
// 1    Tabelle sagt D und eine Roh-Quote liegt vor
// 0.5  Tabelle sagt D ohne Quote, oder N mit Quote
// 0.25 Tabelle sagt N ohne Quote, oder gar keine Angabe
var GUETE_BELEGT = 4;
var GUETE_GESCHAETZT = 2.5;   // ab hier heisst ein Teil noch "geschaetzt"

// VERTRAUENS-DECKEL, der wichtigste Entwurfsentscheid dieser Datei.
// Die Eingabe nennt KEIN Einsatzlimit je Anbieter, also kann das Programm
// nicht wissen, wie viel ein Buchmacher wirklich annimmt. Ich benutze
// stattdessen den Belegzustand als Deckel: volle 400 Euro nur dort, wo
// bewiesen ist, dass es die drei Maerkte gibt. Ist der Anbieter nur
// geschaetzt, wandert nur die Haelfte dorthin und der Rest wird nach R7
// auf einen zweiten Anbieter verteilt, der dieselben drei Wetten fuehrt.
// Ist er unsicher, nur ein Viertel. Wer echte Anbieter-Limits kennt,
// aendert genau diese drei Zahlen und sonst nichts.
var DECKEL_ANTEIL = { belegt: 1, geschaetzt: 0.5, unsicher: 0.25 };

// Punktzahl eines fertigen Aufbaus. Volle Kombinationen zaehlen am
// meisten, belegte Anbieter mehr als geschaetzte, Reste kosten.
var PUNKTE = {
  belegt: 100,        // je voll gesetzter Kombination bei belegtem Anbieter
  geschaetzt: 60,
  unsicher: 25,
  vollBonus: 60,      // Zuschlag, wenn die Kombination die 400 erreicht
  restStrafe: 10,     // je brauchbarer Wette, die in keinem Schein landet
  spielStrafe: 15,    // je Kombination, in der ein Spiel oefter als zweimal auftaucht
  doppelStrafe: 20    // zweimal genau derselbe Dreier: erlaubt, aber unerwuenscht
};

/* ---------------------------------------------------------------------
   Zufall mit Startwert. Kein Math.random, kein Date.now, damit derselbe
   Ordner mit derselben Saat immer dasselbe Ergebnis liefert.
   --------------------------------------------------------------------- */
function zufallsGeber(saat) {
  var s = (saat >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mischeListe(liste, wuerfel) {
  for (var k = liste.length - 1; k > 0; k--) {
    var j = Math.floor(wuerfel() * (k + 1));
    var h = liste[k];
    liste[k] = liste[j];
    liste[j] = h;
  }
  return liste;
}

/* ---------------------------------------------------------------------
   Vorbereitung: aus der rohen Eingabe eine Tabelle machen, in der jede
   Frage in einem Schritt beantwortbar ist.
   --------------------------------------------------------------------- */
function bereiteVor(eingabe) {
  var e = eingabe || {};
  var einstRoh = e.einst || {};
  var wetten = Array.isArray(e.wetten) ? e.wetten : [];

  var mind = typeof einstRoh.mind === "number" ? einstRoh.mind : 1.5;
  var ziel = typeof einstRoh.ziel === "number" ? einstRoh.ziel : 400;
  var maxNutzung = typeof einstRoh.maxNutzung === "number" ? einstRoh.maxNutzung : 2;
  var saat = typeof einstRoh.saat === "number" ? einstRoh.saat : 1;
  var anbieter = Array.isArray(einstRoh.anbieter) && einstRoh.anbieter.length
    ? einstRoh.anbieter.slice()
    : ["iw", "bw", "b3", "st"];

  var anzahlA = anbieter.length;
  var v = {
    mindJe: [],
    wetten: wetten,
    anbieter: anbieter,
    mind: mind,
    ziel: ziel,
    maxNutzung: maxNutzung,
    saat: saat,
    // Karams Einsatz-Grenzen je Anbieter (leer = keine Grenze)
    grenzen: (einstRoh.limits && typeof einstRoh.limits === "object") ? einstRoh.limits : null,
    spielNr: [],      // Zahl statt Text, damit der Vergleich schnell ist
    maske: [],        // Bitmaske: bei welchen Anbietern ist R5 erfuellt
    echt: [],         // echte Quote je Anbieter (nach Gebuehr)
    guete: [],        // Belegstufe je Anbieter
    knappheit: [],    // bei wie vielen Anbietern ist die Wette gut brauchbar
    belegZahl: [],    // bei wie vielen Anbietern ist sie nachweislich belegt
    kapa: [],         // wie oft darf die Wette noch verbaut werden
    nutzbar: []       // Indizes der Wetten, die ueberhaupt irgendwo passen
  };

  var spielIndex = {};
  var naechsteSpielNr = 0;

  for (var i = 0; i < wetten.length; i++) {
    var w = wetten[i] || {};
    var quoten = w.quoten || {};
    var belegt = w.belegt || {};
    var verf = w.verf || {};

    // Spielkennung. Fehlt sie, gilt die Wette als eigenes Spiel, sonst
    // wuerden alle namenlosen Wetten sich gegenseitig blockieren.
    var spielText = (w.spiel === undefined || w.spiel === null || w.spiel === "")
      ? ("#ohne#" + i)
      : String(w.spiel);
    if (!(spielText in spielIndex)) {
      spielIndex[spielText] = naechsteSpielNr++;
    }
    v.spielNr.push(spielIndex[spielText]);

    // Ersatzquote fuer Anbieter ohne eigene Roh-Quote: die NIEDRIGSTE
    // bekannte Roh-Quote dieser Wette. Bewusst vorsichtig, damit eine
    // erfundene Quote nie die Mindestquote schoenrechnet.
    var ersatz = null;
    for (var kz in quoten) {
      if (!Object.prototype.hasOwnProperty.call(quoten, kz)) continue;
      var q = quoten[kz];
      if (typeof q === "number" && q > 0 && (ersatz === null || q < ersatz)) ersatz = q;
    }

    // Die Mindestquote DIESER Wette aus dem Foto, sonst der Ersatzwert.
    // Muss genauso wirken wie mindW in stelleBauen (Verfahren 1).
    var mindW = (typeof w.mind === "number" && w.mind > 0) ? w.mind : mind;
    v.mindJe.push(mindW);

    var echtZeile = [];
    var gueteZeile = [];
    var maske = 0;
    var knapp = 0;
    var belegAnzahl = 0;

    for (var a = 0; a < anzahlA; a++) {
      var kzA = anbieter[a];
      var teiler = GEBUEHREN_TEILER[kzA] || 1;
      var eigen = (typeof quoten[kzA] === "number" && quoten[kzA] > 0) ? quoten[kzA] : null;
      var roh = eigen !== null ? eigen : ersatz;
      var echt = roh === null ? 0 : roh / teiler;
      echtZeile.push(echt);

      var stufe = verf[kzA];
      var g;
      if (belegt[kzA] === true && eigen !== null) {
        g = GUETE_BELEGT;                       // Beweis
      } else if (stufe === "J") {
        g = eigen !== null ? 3 : 2.5;
      } else if (stufe === "D") {
        g = eigen !== null ? 1 : 0.5;
      } else {                                   // N oder gar keine Angabe
        g = eigen !== null ? 0.5 : 0.25;
      }
      gueteZeile.push(g);

      // HARTE SPERRE zuerst (siehe stelleBauen), dann R5: echte Quote
      // nach Gebuehr muss die Mindestquote erreichen.
      var gesperrtHier = !!(w.gesperrt && w.gesperrt[kzA]);
      if (!gesperrtHier && roh !== null && echt >= mindW - 1e-9) {
        maske |= (1 << a);
        if (g >= 3) knapp++;
        if (g >= GUETE_BELEGT) belegAnzahl++;
      }
    }

    v.echt.push(echtZeile);
    v.guete.push(gueteZeile);
    v.maske.push(maske);
    v.knappheit.push(knapp);
    v.belegZahl.push(belegAnzahl);
    v.kapa.push(maske === 0 ? 0 : maxNutzung);
    if (maske !== 0) v.nutzbar.push(i);
  }

  // Wie oft wird gesucht? Fest verdrahtet statt zeitgesteuert, weil
  // Date.now verboten ist und das Ergebnis sonst nicht wiederholbar
  // waere. Die Formel haelt die Rechenzeit bei jeder Ordnergroesse
  // deutlich unter einer Sekunde (gemessen: 200 Wetten rund 150 ms).
  var n = Math.max(1, v.nutzbar.length);
  v.laeufe = Math.max(12, Math.min(60, Math.round(2000000 / (n * n))));

  return v;
}

/* ---------------------------------------------------------------------
   Kleine Helfer
   --------------------------------------------------------------------- */
function stufeVon(minGuete) {
  if (minGuete >= GUETE_BELEGT) return "belegt";
  if (minGuete >= GUETE_GESCHAETZT) return "geschaetzt";
  return "unsicher";
}

function rangVon(stufe) {
  if (stufe === "belegt") return 3;
  if (stufe === "geschaetzt") return 2;
  return 1;
}

function deckelFuer(stufe, ziel) {
  return Math.round(ziel * DECKEL_ANTEIL[stufe]);
}

function schluesselVon(trip) {
  var k = trip.slice().sort(function (x, y) { return x - y; });
  return k[0] + "," + k[1] + "," + k[2];
}

/* ---------------------------------------------------------------------
   Ein Dreier aus einem Vorrat.
   Die Liste wird der Reihe nach abgegangen, dabei gilt:
     - jedes Spiel nur einmal im selben Schein (R2)
     - die drei muessen mindestens einen gemeinsamen Anbieter haben,
       sonst waere R4 unerfuellbar (Und-Verknuepfung der Bitmasken)
   Bei jedem weiteren Dreier faengt der Durchlauf eine Stelle weiter an
   (runde), damit nicht immer dieselben drei Wetten zusammenkommen.
   --------------------------------------------------------------------- */
function scanneDreier(aktiv, v, start) {
  var trip = [];
  var spiele = [];
  var maske = 0xffffffff;
  for (var k = 0; k < aktiv.length && trip.length < 3; k++) {
    var i = aktiv[(start + k) % aktiv.length];
    if (spiele.indexOf(v.spielNr[i]) >= 0) continue;   // R2
    var neu = maske & v.maske[i];
    if (neu === 0) continue;                            // kein gemeinsamer Anbieter
    trip.push(i);
    spiele.push(v.spielNr[i]);
    maske = neu;
  }
  return trip.length === 3 ? trip : null;
}

function dreierAusVorrat(vorrat, v, kapa, gesehen, zaehlerDoppelt) {
  var raus = [];
  var runde = 0;
  while (true) {
    var aktiv = [];
    for (var t = 0; t < vorrat.length; t++) {
      if (kapa[vorrat[t]] > 0) aktiv.push(vorrat[t]);
    }
    if (aktiv.length < 3) break;

    var start = runde % aktiv.length;
    var erster = null;
    var trip = null;
    // Bis zu drei Anlaeufe, um einen schon einmal gebauten Dreier zu
    // vermeiden. Zweimal genau derselbe Schein bringt nichts Neues, ist
    // aber besser als gar kein Schein, deshalb nur "moeglichst nicht".
    for (var versuch = 0; versuch < 3; versuch++) {
      var kand = scanneDreier(aktiv, v, (start + versuch) % aktiv.length);
      if (!kand) break;
      if (!erster) erster = kand;
      if (!gesehen[schluesselVon(kand)]) { trip = kand; break; }
    }
    if (!trip) trip = erster;
    if (!trip) break;

    // Wenn selbst der Notausgang ein schon gebauter Dreier ist, wird er
    // trotzdem genommen: 400 Euro doppelt auf dieselben drei Spiele sind
    // immer noch besser als eine Kombination weniger, und R3 begrenzt das
    // Risiko ohnehin auf zwei Scheine je Wette. Die Bewertung zieht dafuer
    // Punkte ab, damit ein Aufbau ohne Wiederholung gewinnt, wenn es einen
    // gleich guten gibt.
    var sch = schluesselVon(trip);
    if (gesehen[sch]) zaehlerDoppelt.wert++;
    gesehen[sch] = true;
    kapa[trip[0]]--;
    kapa[trip[1]]--;
    kapa[trip[2]]--;
    raus.push(trip);
    runde++;
  }
  return raus;
}

/* ---------------------------------------------------------------------
   Die 400 Euro einer Kombination auf Anbieter verteilen (R4, R6, R7, R8).
   Reihenfolge der Kandidaten:
     1. nach Belegstufe: belegt vor geschaetzt vor unsicher
     2. innerhalb derselben Stufe steht Bet365 immer hinten (R6)
     3. dann die hoehere Gesamtquote
   REIHENFOLGE (Stand 29.08.2026, von Karam noch einmal bestaetigt):
   Zuerst entscheidet SEINE Anbieter-Reihenfolge - Stake, Interwetten,
   Bwin (= Sportingbet), Bet365 zuletzt. Erst danach zaehlt, wie gut die
   Quote belegt ist.
   Frueher war es umgekehrt. Gemessen an seinen 51 echten Wetten: kaum
   waren bei Interwetten Quoten eingetippt, gingen 32 von 32
   Kombinationen dorthin und Stake bekam nichts. Er tippt die Anbieter
   aber der Reihe nach ab - der zuerst getippte gewann also immer.

   Eine Ausnahme bleibt: Stufe "unsicher" (der Preis ist reine
   Schaetzung, oder der Markt ist dort nachweislich nicht da) steht
   weiter ganz hinten. Sonst wanderte Geld auf Maerkte, von denen
   niemand weiss, ob es sie ueberhaupt gibt.
   Eine bloss UNBEKANNTE Verfuegbarkeit ist kein solcher Fall - genau
   dazu hat Karam gesagt: "wenn Du nicht lesen kannst, ob es das Spiel
   dort gibt, dann passt das".
   Jeder Anbieter nimmt hoechstens seinen Vertrauens-Deckel. Reicht der
   erste nicht, kommt der naechste dazu, der DIESELBEN drei Wetten fuehrt.
   --------------------------------------------------------------------- */
function teileFuer(trip, v) {
  var kandidaten = [];
  for (var a = 0; a < v.anbieter.length; a++) {
    var bit = (1 << a);
    if (!((v.maske[trip[0]] & bit) && (v.maske[trip[1]] & bit) && (v.maske[trip[2]] & bit))) continue;
    var minG = Infinity;
    var quote = 1;
    for (var t = 0; t < 3; t++) {
      var g = v.guete[trip[t]][a];
      if (g < minG) minG = g;
      quote *= v.echt[trip[t]][a];
    }
    var st = stufeVon(minG);
    kandidaten.push({
      kz: v.anbieter[a],
      stufe: st,
      rang: rangVon(st),
      spaet: anbRang(v.anbieter[a]),
      quote: quote
    });
  }

  kandidaten.sort(function (x, y) {
    // "unsicher" heisst: Preis geraten oder Markt nachweislich nicht da.
    // Das bleibt hinten, alles andere richtet sich nach Karams Reihenfolge.
    var xu = (x.stufe === "unsicher") ? 1 : 0;
    var yu = (y.stufe === "unsicher") ? 1 : 0;
    if (xu !== yu) return xu - yu;
    if (x.spaet !== y.spaet) return x.spaet - y.spaet;    // Karams Rangfolge ZUERST
    if (y.rang !== x.rang) return y.rang - x.rang;        // dann die Belegung
    if (y.quote !== x.quote) return y.quote - x.quote;    // dann hoehere Quote
    return x.kz < y.kz ? -1 : (x.kz > y.kz ? 1 : 0);      // fester Tiebreak
  });

  var teile = [];
  var rest = v.ziel;
  for (var f = 0; f < kandidaten.length && rest > 0.5; f++) {
    var k = kandidaten[f];
    // Karams Einsatz-Grenze je Anbieter: mehr als das nimmt er dort nicht
    // an. Ohne Angabe gilt keine Grenze.
    var grenze = (v.grenzen && typeof v.grenzen[k.kz] === "number" && isFinite(v.grenzen[k.kz]))
      ? v.grenzen[k.kz] : Infinity;
    if (grenze <= 0) continue;
    var nehmen = Math.min(rest, deckelFuer(k.stufe, v.ziel), grenze);
    if (nehmen <= 0) continue;
    teile.push({
      kz: k.kz,
      einsatz: Math.round(nehmen),
      sicherheit: k.stufe,
      quote: Math.round(k.quote * 100) / 100
    });
    rest -= nehmen;
  }
  return teile;
}

/* ---------------------------------------------------------------------
   Ein einzelner Aufbau (ein Lauf der Suche)
   --------------------------------------------------------------------- */
function eineLoesung(v, lauf) {
  var wuerfel = zufallsGeber((v.saat * 7919 + lauf * 104729 + 12345) >>> 0);
  var variante = lauf % 6;
  var kapa = v.kapa.slice();
  var gesehen = {};
  var trips = [];
  var zaehlerDoppelt = { wert: 0 };

  // Anbieter-Reihenfolge: Bet365 immer ganz hinten (R6), der Rest wird
  // je Lauf gemischt, damit nicht immer derselbe Anbieter zuerst die
  // besten Wetten abgreift.
  var normal = [];
  var zuletzt = [];
  for (var a = 0; a < v.anbieter.length; a++) {
    if (v.anbieter[a] === LETZTE_WAHL) zuletzt.push(a); else normal.push(a);
  }
  // Erster Lauf: streng nach Karams Rangfolge. Spaetere Laeufe mischen,
  // damit die Suche auch andere Aufteilungen findet - genau Karams Satz
  // "wenn die Moeglichkeit nicht da ist, dann lass es ganz random sein".
  if (lauf > 0) mischeListe(normal, wuerfel);
  else normal.sort(function (x, y) { return anbRang(v.anbieter[x]) - anbRang(v.anbieter[y]); });
  var anbieterFolge = normal.concat(zuletzt);

  // Drei Wellen: erst nur Belegtes, dann Geschaetztes, dann alles.
  var schwellen = [GUETE_BELEGT, GUETE_GESCHAETZT, 0];

  for (var s = 0; s < schwellen.length; s++) {
    var schwelle = schwellen[s];
    for (var f = 0; f < anbieterFolge.length; f++) {
      var idx = anbieterFolge[f];
      var bit = (1 << idx);
      var vorrat = [];
      for (var n = 0; n < v.nutzbar.length; n++) {
        var i = v.nutzbar[n];
        if (kapa[i] <= 0) continue;
        if (!(v.maske[i] & bit)) continue;
        if (v.guete[i][idx] < schwelle) continue;
        vorrat.push(i);
      }
      if (vorrat.length < 3) continue;
      sortiereVorrat(vorrat, v, idx, variante, wuerfel);
      var neue = dreierAusVorrat(vorrat, v, kapa, gesehen, zaehlerDoppelt);
      for (var d = 0; d < neue.length; d++) trips.push(neue[d]);
    }
  }

  // Letzte Welle ohne Anbieter-Vorgabe: was noch Kapazitaet hat und
  // irgendeinen gemeinsamen Anbieter findet, wird noch zusammengelegt.
  // Erst hier ist es egal, wie sinnvoll die Mischung inhaltlich ist,
  // Hauptsache es geht als Dreier raus.
  var restVorrat = [];
  for (var r = 0; r < v.nutzbar.length; r++) {
    if (kapa[v.nutzbar[r]] > 0) restVorrat.push(v.nutzbar[r]);
  }
  if (restVorrat.length >= 3) {
    sortiereVorrat(restVorrat, v, -1, variante, wuerfel);
    var restNeu = dreierAusVorrat(restVorrat, v, kapa, gesehen, zaehlerDoppelt);
    for (var rr = 0; rr < restNeu.length; rr++) trips.push(restNeu[rr]);
  }

  // Bewerten. Hier werden die Teil-Objekte NICHT gebaut: fuer die
  // Punktzahl reicht die schnelle Rechnung, und die fertigen Teile
  // braucht am Ende nur der Sieger (siehe verbessere).
  var kombis = [];
  var spielZaehler = {};
  var punkte = 0;
  for (var t = 0; t < trips.length; t++) {
    var trip = trips[t];
    punkte += schnellPunkte(trip, v);
    for (var sp = 0; sp < 3; sp++) {
      var nr = v.spielNr[trip[sp]];
      spielZaehler[nr] = (spielZaehler[nr] || 0) + 1;
    }
    kombis.push({ trip: trip, teile: null, gesetzt: 0 });
  }

  // Reste kosten Punkte: jede brauchbare Wette, die nirgends landet.
  var offen = 0;
  for (var u = 0; u < v.nutzbar.length; u++) {
    if (kapa[v.nutzbar[u]] === v.maxNutzung) offen++;
  }
  punkte -= offen * PUNKTE.restStrafe;
  punkte -= zaehlerDoppelt.wert * PUNKTE.doppelStrafe;

  // Ein Spiel oefter als zweimal im ganzen Aufbau ist erlaubt (die Regel
  // begrenzt die WETTE, nicht das Spiel), aber unschoen: leichte Strafe.
  for (var key in spielZaehler) {
    if (!Object.prototype.hasOwnProperty.call(spielZaehler, key)) continue;
    if (spielZaehler[key] > 2) punkte -= (spielZaehler[key] - 2) * PUNKTE.spielStrafe;
  }

  return { kombis: kombis, kapa: kapa, punkte: punkte, lauf: lauf };
}

function sortiereVorrat(vorrat, v, idxAnbieter, variante, wuerfel) {
  var schl = {};
  for (var k = 0; k < vorrat.length; k++) {
    var i = vorrat[k];
    var quote = idxAnbieter >= 0 ? v.echt[i][idxAnbieter] : besteEchtQuote(v, i);
    var guete = idxAnbieter >= 0 ? v.guete[i][idxAnbieter] : besteGuete(v, i);
    var s;
    if (variante === 0) s = v.knappheit[i] * 1000 - quote;        // seltene Wetten zuerst
    else if (variante === 1) s = -quote;                          // hohe Quote zuerst
    else if (variante === 2) s = wuerfel();                       // ganz gemischt
    else if (variante === 3) s = -guete * 1000 - quote;           // beste Belegstufe zuerst
    else if (variante === 4) s = v.belegZahl[i] * 1000 - guete;   // wenig belegte zuerst
    else s = -guete * 1000 + wuerfel() * 400;                     // gute Stufe, leicht verruettelt
    schl[i] = s;
  }
  vorrat.sort(function (x, y) { return (schl[x] - schl[y]) || (x - y); });
}

/* ---------------------------------------------------------------------
   Nachbesserung durch Tauschen (das eigentliche Suchwerkzeug).
   Die ANZAHL der Kombinationen ist nach dem Aufbau meist schon am
   Anschlag (Kapazitaet geteilt durch drei). Was sich noch verbessern
   laesst, ist die QUALITAET: welche drei Wetten liegen zusammen, und ist
   der Anbieter dafuer belegt oder nur geraten.
   Deshalb werden je zwei fertige Kombinationen genommen und je eine
   Wette getauscht. Bringt der Tausch mehr Punkte, bleibt er. Da beim
   Tausch dieselben Wetten im Umlauf bleiben, aendern sich weder die
   Nutzungszahl (R3) noch die Reste, der Punktevergleich ist also lokal
   und exakt. Geprueft werden muessen nur R2 (drei verschiedene Spiele)
   und ob es ueberhaupt noch einen gemeinsamen Anbieter gibt (R4).
   --------------------------------------------------------------------- */
// Punktzahl eines Dreiers OHNE die Teil-Objekte zu bauen. Fuer die
// Punkte zaehlt nur, welche Belegstufen die moeglichen Anbieter haben,
// nicht welche Quote und nicht welcher Anbieter es am Ende wird. Diese
// Abkuerzung macht den Tauschschritt um ein Vielfaches schneller, ohne
// dass sich das Ergebnis aendert.
var GEWICHT_NACH_RANG = [0, PUNKTE.unsicher, PUNKTE.geschaetzt, PUNKTE.belegt];
var ANTEIL_NACH_RANG = [0, DECKEL_ANTEIL.unsicher, DECKEL_ANTEIL.geschaetzt, DECKEL_ANTEIL.belegt];

function schnellPunkte(trip, v) {
  var raenge = [0, 0, 0, 0];
  var anzahl = 0;
  for (var a = 0; a < v.anbieter.length; a++) {
    var bit = (1 << a);
    if (!((v.maske[trip[0]] & bit) && (v.maske[trip[1]] & bit) && (v.maske[trip[2]] & bit))) continue;
    var minG = v.guete[trip[0]][a];
    if (v.guete[trip[1]][a] < minG) minG = v.guete[trip[1]][a];
    if (v.guete[trip[2]][a] < minG) minG = v.guete[trip[2]][a];
    raenge[anzahl++] = minG >= GUETE_BELEGT ? 3 : (minG >= GUETE_GESCHAETZT ? 2 : 1);
  }
  // absteigend sortieren, hoechstens vier Werte
  for (var i = 1; i < anzahl; i++) {
    var h = raenge[i], j = i - 1;
    while (j >= 0 && raenge[j] < h) { raenge[j + 1] = raenge[j]; j--; }
    raenge[j + 1] = h;
  }
  var rest = v.ziel, p = 0;
  for (var k = 0; k < anzahl && rest > 0.5; k++) {
    var nehmen = Math.min(rest, Math.round(v.ziel * ANTEIL_NACH_RANG[raenge[k]]));
    p += (nehmen / v.ziel) * GEWICHT_NACH_RANG[raenge[k]];
    rest -= nehmen;
  }
  if (rest <= 0.5) p += PUNKTE.vollBonus;
  return p;
}

function summeVon(teile) {
  var s = 0;
  for (var i = 0; i < teile.length; i++) s += teile[i].einsatz;
  return s;
}

function passtInKombi(trip, ersetzePos, neueWette, v) {
  if (trip[ersetzePos] === neueWette) return false;
  var maske = v.maske[neueWette];
  for (var t = 0; t < 3; t++) {
    if (t === ersetzePos) continue;
    if (trip[t] === neueWette) return false;                     // waere doppelt
    if (v.spielNr[trip[t]] === v.spielNr[neueWette]) return false; // R2
    maske &= v.maske[trip[t]];
  }
  return maske !== 0;                                             // R4 bleibt erfuellbar
}

function verbessere(v, loesung, maxRunden) {
  var kombis = loesung.kombis;
  // Bestmoeglicher Wert einer einzelnen Kombination: volle 400 Euro bei
  // einem belegten Anbieter. Zwei solche Kombinationen koennen durch
  // keinen Tausch besser werden, das Paar wird uebersprungen. Das spart
  // bei einem gut gebauten Ordner rund die Haelfte der Rechenzeit.
  var hoechstwert = PUNKTE.belegt + PUNKTE.vollBonus;
  var wert = [];
  for (var i = 0; i < kombis.length; i++) wert.push(schnellPunkte(kombis[i].trip, v));

  var neuA = [0, 0, 0], neuB = [0, 0, 0];   // Arbeitsspeicher, keine neuen Objekte je Probe
  for (var runde = 0; runde < maxRunden; runde++) {
    var gewinn = 0;
    for (var a = 0; a < kombis.length; a++) {
      var perfektA = wert[a] >= hoechstwert - 1e-9;
      for (var b = a + 1; b < kombis.length; b++) {
        if (perfektA && wert[b] >= hoechstwert - 1e-9) continue;   // beide schon am Anschlag
        var tripA = kombis[a].trip, tripB = kombis[b].trip;
        var vorher = wert[a] + wert[b];
        var bestesDelta = 1e-9, waPa = -1, waPb = -1;
        for (var pa = 0; pa < 3; pa++) {
          for (var pb = 0; pb < 3; pb++) {
            if (!passtInKombi(tripA, pa, tripB[pb], v)) continue;
            if (!passtInKombi(tripB, pb, tripA[pa], v)) continue;
            neuA[0] = tripA[0]; neuA[1] = tripA[1]; neuA[2] = tripA[2]; neuA[pa] = tripB[pb];
            neuB[0] = tripB[0]; neuB[1] = tripB[1]; neuB[2] = tripB[2]; neuB[pb] = tripA[pa];
            var nachher = schnellPunkte(neuA, v) + schnellPunkte(neuB, v);
            if (nachher - vorher > bestesDelta) {
              bestesDelta = nachher - vorher;
              waPa = pa; waPb = pb;
            }
          }
        }
        if (waPa >= 0) {
          var merk = tripA[waPa];
          tripA[waPa] = tripB[waPb];
          tripB[waPb] = merk;
          wert[a] = schnellPunkte(tripA, v);
          wert[b] = schnellPunkte(tripB, v);
          perfektA = wert[a] >= hoechstwert - 1e-9;
          gewinn += bestesDelta;
        }
      }
    }
    loesung.punkte += gewinn;
    if (gewinn < 0.5) break;      // nichts mehr zu holen
  }

  // Erst jetzt die endgueltigen Teile bauen, einmal je Kombination.
  for (var z = 0; z < kombis.length; z++) {
    kombis[z].teile = teileFuer(kombis[z].trip, v);
    kombis[z].gesetzt = summeVon(kombis[z].teile);
  }
  return loesung;
}

function besteEchtQuote(v, i) {
  var best = 0;
  for (var a = 0; a < v.anbieter.length; a++) {
    if ((v.maske[i] & (1 << a)) && v.echt[i][a] > best) best = v.echt[i][a];
  }
  return best;
}

function besteGuete(v, i) {
  var best = 0;
  for (var a = 0; a < v.anbieter.length; a++) {
    if ((v.maske[i] & (1 << a)) && v.guete[i][a] > best) best = v.guete[i][a];
  }
  return best;
}

/* ---------------------------------------------------------------------
   Tipp-Vorschlaege: welche Quote sollte Karam eintippen?
   Das ist die einzige Handlung, die seine Ausbeute dauerhaft verbessert,
   deshalb wird sie in Euro beziffert und nicht nur erwaehnt.
   Fall 1: eine Kombination erreicht die 400 nicht, weil der Anbieter nur
           geschaetzt ist. Wird er belegt, faellt der Deckel weg.
   Fall 2: eine Wette ist ueberhaupt nicht verwendbar, weil bei keinem
           Anbieter eine brauchbare Quote bekannt ist.
   --------------------------------------------------------------------- */
function baueTipps(v, loesung) {
  var sammler = {};

  function merke(id, kz, gewinn, grund) {
    var key = id + "|" + kz;
    if (!sammler[key]) sammler[key] = { id: id, kz: kz, grund: grund, gewinnAnAbdeckung: 0 };
    sammler[key].gewinnAnAbdeckung += gewinn;
  }

  // Fall 1
  for (var c = 0; c < loesung.kombis.length; c++) {
    var k = loesung.kombis[c];
    var fehlend = v.ziel - k.gesetzt;
    if (fehlend <= 0.5) continue;
    for (var a = 0; a < v.anbieter.length; a++) {
      var bit = (1 << a);
      var fehlt = [];
      var passt = true;
      for (var t = 0; t < 3; t++) {
        var i = k.trip[t];
        if (!(v.maske[i] & bit)) { passt = false; break; }
        if (v.guete[i][a] < GUETE_BELEGT) fehlt.push(i);
      }
      if (!passt || fehlt.length === 0) continue;
      var anteil = fehlend / fehlt.length;
      for (var f = 0; f < fehlt.length; f++) {
        var w = v.wetten[fehlt[f]];
        merke(
          w.id,
          v.anbieter[a],
          anteil,
          fehlt.length === 1
            ? "Diese eine Quote bei " + v.anbieter[a] + " eintippen, dann nimmt der Anbieter die vollen " + v.ziel + " Euro"
            : "Zusammen mit " + (fehlt.length - 1) + " weiteren Quoten bei " + v.anbieter[a] + " wird die Kombination voll"
        );
      }
    }
  }

  // Fall 2
  for (var i2 = 0; i2 < v.wetten.length; i2++) {
    if (v.maske[i2] !== 0) continue;                 // ist verwendbar, kein Fall 2
    var w2 = v.wetten[i2] || {};
    var verf = w2.verf || {};
    // Anbieter mit der besten Einschaetzung zuerst vorschlagen.
    var besterA = -1, besteStufe = -1;
    for (var a2 = 0; a2 < v.anbieter.length; a2++) {
      if (v.anbieter[a2] === LETZTE_WAHL) continue;   // R6, Bet365 nicht zuerst empfehlen
      var st = verf[v.anbieter[a2]];
      var wert = st === "J" ? 3 : (st === "D" ? 2 : 1);
      if (wert > besteStufe) { besteStufe = wert; besterA = a2; }
    }
    if (besterA < 0) besterA = 0;
    var kzB = v.anbieter[besterA];
    var teiler = GEBUEHREN_TEILER[kzB] || 1;
    // So viel muesste auf dem Schirm stehen, damit nach Gebuehr die
    // Mindestquote herauskommt.
    var noetig = Math.ceil((v.mindJe[i2] || v.mind) * teiler * 100) / 100;
    // Wie viel waere zu holen? Nur etwas, wenn zwei weitere Wetten mit
    // freier Kapazitaet und anderen Spielen bei diesem Anbieter warten.
    var partner = 0;
    var spieleGesehen = [v.spielNr[i2]];
    for (var p = 0; p < v.nutzbar.length; p++) {
      var pi = v.nutzbar[p];
      if (loesung.kapa[pi] <= 0) continue;
      if (!(v.maske[pi] & (1 << besterA))) continue;
      if (spieleGesehen.indexOf(v.spielNr[pi]) >= 0) continue;
      spieleGesehen.push(v.spielNr[pi]);
      partner++;
      if (partner >= 2) break;
    }
    merke(
      w2.id,
      kzB,
      partner >= 2 ? v.ziel : 0,
      "Ohne Quote ist diese Wette nirgends einsetzbar. Ab " + noetig + " bei " + kzB
        + (partner >= 2 ? " entsteht daraus ein weiterer Dreier" : " waere sie wenigstens verwendbar")
    );
  }

  var liste = [];
  for (var key in sammler) {
    if (!Object.prototype.hasOwnProperty.call(sammler, key)) continue;
    var e = sammler[key];
    e.gewinnAnAbdeckung = Math.round(e.gewinnAnAbdeckung);
    liste.push(e);
  }
  liste.sort(function (x, y) {
    if (y.gewinnAnAbdeckung !== x.gewinnAnAbdeckung) return y.gewinnAnAbdeckung - x.gewinnAnAbdeckung;
    return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0);
  });
  return liste.slice(0, 12);
}

/* ---------------------------------------------------------------------
   Ausgabe zusammenbauen
   --------------------------------------------------------------------- */
function formatiere(v, loesung) {
  var kombis = [];
  var benutzt = {};
  var teileBelegt = 0, teileGeschaetzt = 0, teileUnsicher = 0;
  var summeGesetzt = 0, kombisVoll = 0, summeBelegt = 0;

  for (var c = 0; c < loesung.kombis.length; c++) {
    var k = loesung.kombis[c];
    // Sicherheitsnetz: waehrend der Suche tragen die Kombinationen noch
    // keine Teil-Objekte, normalerweise baut verbessere() sie. Wer
    // formatiere direkt aufruft, bekommt sie hier nachgeliefert.
    if (!k.teile) {
      k.teile = teileFuer(k.trip, v);
      k.gesetzt = summeVon(k.teile);
    }
    var ids = [];
    for (var t = 0; t < 3; t++) {
      ids.push(v.wetten[k.trip[t]].id);
      benutzt[k.trip[t]] = true;
    }
    for (var q = 0; q < k.teile.length; q++) {
      var s = k.teile[q].sicherheit;
      if (s === "belegt") { teileBelegt++; summeBelegt += k.teile[q].einsatz; }
      else if (s === "geschaetzt") teileGeschaetzt++;
      else teileUnsicher++;
    }
    summeGesetzt += k.gesetzt;
    if (k.gesetzt >= v.ziel - 0.5) kombisVoll++;
    kombis.push({
      nr: c + 1,
      wetten: ids,
      teile: k.teile,
      gesetzt: k.gesetzt,
      ziel: v.ziel,
      fehlend: Math.max(0, v.ziel - k.gesetzt)
    });
  }

  var uebrig = [];
  for (var i = 0; i < v.wetten.length; i++) {
    if (!benutzt[i]) uebrig.push(v.wetten[i].id);
  }

  var summeZiel = kombis.length * v.ziel;
  return {
    kombis: kombis,
    uebrig: uebrig,
    bericht: {
      kombisGesamt: kombis.length,
      kombisVoll: kombisVoll,
      summeGesetzt: summeGesetzt,
      summeZiel: summeZiel,
      abdeckung: summeZiel > 0 ? Math.round((summeGesetzt / summeZiel) * 1000) / 1000 : 0,
      wettenBenutzt: Object.keys(benutzt).length,
      wettenGesamt: v.wetten.length,
      teileBelegt: teileBelegt,
      teileGeschaetzt: teileGeschaetzt,
      teileUnsicher: teileUnsicher,
      // Zwei Zusatzzahlen, die im Vertrag nicht gefordert sind, aber die
      // wichtigste Frage beantworten: wie viel Geld steht auf BEWIESENEM
      // Boden? Ohne sie sieht eine Abdeckung von 1,00 immer gleich gut
      // aus, egal ob 400 Euro belegt oder viermal 100 Euro geraten sind.
      summeBelegt: summeBelegt,
      abdeckungBelegt: summeZiel > 0 ? Math.round((summeBelegt / summeZiel) * 1000) / 1000 : 0,
      tippVorschlaege: baueTipps(v, loesung)
    }
  };
}

/* ---------------------------------------------------------------------
   Einstieg
   --------------------------------------------------------------------- */
function verteile(eingabe) {
  var v = bereiteVor(eingabe);

  if (v.nutzbar.length < 3 || v.anbieter.length === 0) {
    // Zu wenige brauchbare Wetten fuer einen einzigen Dreier.
    return formatiere(v, { kombis: [], kapa: v.kapa.slice(), punkte: 0, lauf: 0 });
  }

  var beste = null;
  for (var lauf = 0; lauf < v.laeufe; lauf++) {
    var loesung = eineLoesung(v, lauf);
    if (!beste || loesung.punkte > beste.punkte + 1e-9) beste = loesung;
  }
  // Nur der Sieger wird nachgebessert und bekommt dabei seine fertigen
  // Teil-Objekte. Das Tauschen kostet mehr als ein ganzer Aufbau, lohnt
  // sich aber nur dort, wo es zaehlt.
  verbessere(v, beste, 4);
  return formatiere(v, beste);
}

FENSTER.verteileSuche = verteile;

})(typeof window !== "undefined" ? window : module.exports);

(function (FENSTER) {
  // Karams Wort: es sollen "immer Mischungen kommen". Derselbe Dreier
  // ein zweites Mal ist keine Mischung, sondern nur doppeltes Geld auf
  // dasselbe Los - solche Wiederholungen fliegen VOR der Wertung raus.
  function ohneWiederholung(aus) {
    if (!aus || !Array.isArray(aus.kombis)) return aus;
    const gesehen = new Set();
    const behalten = [];
    for (const k of aus.kombis) {
      const key = k.wetten.slice().sort().join("|");
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      behalten.push(k);
    }
    if (behalten.length === aus.kombis.length) return aus;
    // Nummern und Bericht sauber nachziehen
    const benutzt = new Set();
    let b = 0, g = 0, u = 0, summe = 0;
    behalten.forEach((k, i) => {
      k.nr = i + 1;
      summe += k.gesetzt || 0;
      for (const id of k.wetten) benutzt.add(id);
      for (const t of k.teile || []) {
        if (t.sicherheit === "belegt") b++;
        else if (t.sicherheit === "geschaetzt") g++;
        else u++;
      }
    });
    aus.kombis = behalten;
    const alleIds = new Set([...benutzt, ...(aus.uebrig || [])]);
    aus.bericht = aus.bericht || {};
    aus.bericht.kombisGesamt = behalten.length;
    aus.bericht.summeGesetzt = summe;
    aus.bericht.teileBelegt = b;
    aus.bericht.teileGeschaetzt = g;
    aus.bericht.teileUnsicher = u;
    aus.bericht.wettenBenutzt = benutzt.size;
    return aus;
  }

  // Punktzahl einer Loesung: Dreier zaehlen zuerst (jeder volle Dreier
  // ist gesetztes Geld), dann belegte Teile, unsichere kosten.
  function punkte(aus) {
    if (!aus || !Array.isArray(aus.kombis)) return -1;
    const b = aus.bericht || {};
    return aus.kombis.length * 1000 +
      (b.teileBelegt || 0) * 2 -
      (b.teileUnsicher || 0);
  }

  FENSTER.verteileBeste = function (eingabe) {
    // Beide Verfahren bekommen ihre eigene Kopie, damit keines dem
    // anderen die Eingabe verbiegt.
    let a = null, b = null;
    try { a = ohneWiederholung(FENSTER.verteilePaare(JSON.parse(JSON.stringify(eingabe)))); } catch (e) { /* faellt aus */ }
    try { b = ohneWiederholung(FENSTER.verteileSuche(JSON.parse(JSON.stringify(eingabe)))); } catch (e) { /* faellt aus */ }
    let sieger, name;
    if (punkte(a) >= punkte(b)) { sieger = a; name = "paare"; }
    else { sieger = b; name = "suche"; }
    if (!sieger) return { kombis: [], uebrig: [], bericht: { fehler: "beide Verfahren ausgefallen" } };
    sieger.bericht = sieger.bericht || {};
    sieger.bericht.verfahren = name;
    // Die Tipp-Vorschlaege von "paare" sind die ausfuehrlicheren; wenn die
    // Suche gewinnt und selbst keine hat, werden sie uebernommen.
    if (name === "suche" && a && a.bericht &&
        (!sieger.bericht.tippVorschlaege || !sieger.bericht.tippVorschlaege.length)) {
      sieger.bericht.tippVorschlaege = a.bericht.tippVorschlaege || [];
    }
    return sieger;
  };
})(typeof window !== "undefined" ? window : module.exports);

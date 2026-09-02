// ============================================================
// KOMBI-BAU: baut aus den offenen Wetten 3er-Scheine und laesst
// sie danach bearbeiten.
//
// Karams Regeln:
//   1. Jede echte Einzelquote (nach Gebühr) >= Mindestquote
//   2. Alle drei Wetten eines Scheins beim GLEICHEN Anbieter,
//      und der Anbieter muss den Markt auch führen
//   3. Jedes Spiel insgesamt nur EINMAL
//   4. Wetten unter der Mindestquote werden NICHT weggeworfen,
//      sondern kommen in eigene 3er-Scheine ("zu niedrig")
//   5. Einzelne Wette rausnehmen -> es rueckt automatisch eine
//      andere nach, die beim selben Anbieter verfügbar ist
//
// Der Zustand liegt im localStorage, damit Rausnehmen und
// Nachruecken erhalten bleiben.
// ============================================================
"use strict";

// Stellt das Programm selbst Kombinationen? Seit 30.08.2026 nein - Karam
// baut sie unten in der Tabelle von Hand. Siehe baueAlles().
const KT_AUTOBAU = false;

// Jeder Foto-Satz hat seinen eigenen Bau-Zustand: nie mischen!
function zustandSchluessel() { return "scheinbau_" + aktiverSatzId(); }

// ---------- Quellen für eine Quote ----------

function zielQuote(w, optIdx, kz) {
  // Die Quote, die du im besten Fall erwarten kannst:
  // eigene Eingabe > Screenshot > Foto-Quote
  const opt = w.o[optIdx][0];
  const teiler = GEBUEHREN_TEILER[kz];
  const eigen = liesEingabe(w.id, opt, kz);
  if (eigen) return { roh: eigen, echt: eigen / teiler, quelle: "deine Eingabe", fest: true };
  const shot = screenshotQuote(w, optIdx, kz);
  if (shot) return { roh: shot.wert, echt: shot.wert / teiler, quelle: "Screenshot", fest: false };
  const ref = w.o[optIdx][1];
  return { roh: ref, echt: ref / teiler, quelle: "Foto " + ref.toFixed(2), fest: false };
}

// ERSATZWERT, nicht mehr die Regel: seit dem 29.08.2026 bringt jede
// Wette ihre eigene Mindestquote aus dem Foto mit (mindFuer in logik.js).
// Das Feld oben greift nur noch, wenn im Foto nichts steht.
// Geprueft wird immer die ECHTE Quote nach Gebuehr. Die Foto-Quote ist
// nur eine Einschaetzung und entscheidet nichts.
function mindWert(z) {
  const m = z && z.einst ? Number(z.einst.mind) : NaN;
  return isFinite(m) && m > 0 ? m : MIND_STANDARD;
}

// Erreicht diese Quote die Mindestquote? Genau darauf zaehlt als erreicht.
function ueberMind(echt, mind) { return echt >= mind - 0.0001; }

function spielKennung(w) { return w.doppel || (w.liga + "|" + w.spiel); }

function wetteNachId(id) { return WETTEN.find(w => w.id === id); }

// ---------- Zustand ----------

function liesZustand() {
  try { return JSON.parse(localStorage.getItem(zustandSchluessel()) || "null"); }
  catch (e) { return null; }
}
function speichereZustand(z) { localStorage.setItem(zustandSchluessel(), JSON.stringify(z)); }

// Zaehlt jeden Bau-Durchgang mit. Wird nirgends angezeigt und hat mit
// Karams Schein-Nummer nichts zu tun: sie sorgt allein dafuer, dass zwei
// Durchgaenge nie dieselben Kennungen vergeben.
const BAU_SCHLUESSEL = "kt_bau_lfd";

function bauMarke() {
  let n = 0;
  try { n = parseInt(localStorage.getItem(BAU_SCHLUESSEL) || "0", 10) || 0; } catch (e) { }
  n++;
  try { localStorage.setItem(BAU_SCHLUESSEL, String(n)); } catch (e) { }
  return n;
}

// ---------- Die laufende Schein-Nummer ----------
// Geht nur nach oben und ueberlebt das Loeschen von Scheinen, den
// Neuaufbau und den Wechsel des Ordners. Eine einmal vergebene Nummer
// kommt nie wieder - auch dann nicht, wenn der Schein nie gespeichert
// wurde. Genau darum ging es: beim Suchen darf es nie zwei mit
// derselben Zahl geben.
const NR_SCHLUESSEL = "kt_schein_nr";
let _nrGewarnt = false;

function nrStand() {
  try { return parseInt(localStorage.getItem(NR_SCHLUESSEL) || "0", 10) || 0; }
  catch (e) { return 0; }
}

function nrMerken(n) {
  try { localStorage.setItem(NR_SCHLUESSEL, String(n)); return true; }
  catch (e) {
    // Voller Speicher. Dann koennte eine Nummer doch noch einmal
    // vergeben werden - das muss man wissen, statt es zu erraten.
    if (!_nrGewarnt && typeof meldung === "function") {
      _nrGewarnt = true;
      meldung("Der Speicher dieses Browsers ist voll. Die Schein-Nummern koennen sich " +
        "deshalb wiederholen. Alte Scheinfotos loeschen, dann stimmt es wieder.", "warn");
    }
    return false;
  }
}

// Holt den Zaehler ueber alles, was schon da ist. Noetig fuer Scheine,
// die vor dem Zaehler angelegt wurden.
// (nrAufholen ist entfallen: sie zog den festen Zaehler auf die hoechste
//  interne nr hoch. Seit die interne nr bei jedem Bauen wieder bei 1
//  anfaengt, waere das ein Verstellen ohne Anlass.)

function nrNaechste() {
  const n = nrStand() + 1;
  nrMerken(n);
  return n;
}

// Karams Reihenfolge, an EINER Stelle. Stake zuerst, Bet365 zuletzt.
// Bwin und Sportingbet sind derselbe Anbieter, deshalb steht dort nur bw.
const KT_ANBIETER_RANG = ["st", "iw", "bw", "b3"];

function einstellungenLesen() {
  const anb = [];
  document.querySelectorAll(".anbwahl:checked").forEach(c => anb.push(c.value));
  // NACH KARAMS REIHENFOLGE, nicht nach der Reihenfolge der Kaestchen.
  // Vorher kam heraus: iw, bw, b3, st - Stake also zuletzt. Daran haengen
  // der Niedrig-Schein, das Aufteilen auf einen weiteren Anbieter und der
  // selbst gebaute Schein, die alle einfach den ersten der Liste nehmen.
  anb.sort((a, b) => KT_ANBIETER_RANG.indexOf(a) - KT_ANBIETER_RANG.indexOf(b));
  const zielFeld = document.getElementById("ziel");
  // Karams Einsatz-Grenzen je Anbieter. Leeres Feld = keine Grenze.
  // Sie werden gemerkt, damit er sie nicht jedes Mal neu eintippt.
  const limits = {};
  document.querySelectorAll(".grenzwahl").forEach(f => {
    const wert = parseFloat(f.value);
    if (isFinite(wert) && wert >= 0) limits[f.dataset.kz] = wert;
  });
  try { localStorage.setItem("kt_grenzen", JSON.stringify(limits)); } catch (e) { }
  return {
    mind: parseFloat(document.getElementById("mind").value) || 1.5,
    anbieter: anb.length ? anb : KT_ANBIETER_RANG.slice(),
    saat: parseInt(document.getElementById("mischzahl").value, 10) || 1,
    ziel: zielFeld ? (parseFloat(zielFeld.value) || 400) : 400,
    limits: Object.keys(limits).length ? limits : null
  };
}

// Beim Laden die gemerkten Grenzen wieder eintragen.
function grenzenEintragen() {
  let g = {};
  try { g = JSON.parse(localStorage.getItem("kt_grenzen") || "{}"); } catch (e) { g = {}; }
  document.querySelectorAll(".grenzwahl").forEach(f => {
    if (typeof g[f.dataset.kz] === "number") f.value = g[f.dataset.kz];
  });
}
document.addEventListener("DOMContentLoaded", grenzenEintragen);

// ---------- Der Bau ----------

// nurRest = true: die schon GESETZTEN Kombinationen bleiben unangetastet,
// und nur aus den uebrigen Wetten wird neu gemischt. Das ist Karams Fall
// "wenn was mit der Kombination nicht stimmt, alles neu mischen was noch
// nicht gesetzt wurde".
function baueAlles(nurRest) {
  const e = einstellungenLesen();
  const behalten = nurRest ? gesetzteScheine() : [];
  // Wetten, die in einer gesetzten Kombination stecken, sind verbraucht.
  const verbraucht = new Set();
  for (const s of behalten) for (const x of s.wetten) verbraucht.add(x.id);
  const offen = satzWetten().filter(w => !istVorbei(anstossFeld(w)) && !verbraucht.has(w.id))
    .sort((a, b) => liesAnstoss(anstossFeld(a)).zeit - liesAnstoss(anstossFeld(b)).zeit);

  // ---- Eingabe fuer den Verteiler bauen ----
  // Je Wette: die gewaehlte Option, die ROHEN Quoten je Anbieter, ob die
  // Quote BELEGT ist (eigene Eingabe oder Screenshot = Beweis, dass der
  // Anbieter den Markt fuehrt) und die Markt-Schaetzung J/D/N.
  // limits fehlte hier - die Einsatz-Grenzen kamen beim Bauen also gar
  // nie an, obwohl der Verteiler sie auswertet (einst.limits).
  const eingabe = { wetten: [], einst: { mind: e.mind, ziel: e.ziel,
    anbieter: e.anbieter, maxNutzung: 2, saat: e.saat, limits: e.limits } };
  const optVon = {};
  for (const w of offen) {
    const optIdx = gewaehlteOption(w);
    optVon[w.id] = optIdx;
    const v = verfuegbarkeit(w);
    const quoten = {}, belegt = {}, verf = {};
    for (const kz of e.anbieter) {
      const q = zielQuote(w, optIdx, kz);
      // Die Quote bleibt stehen, gesperrt wird ueber das eigene Feld weiter
      // unten. Frueher stand hier quoten[kz] = null mit der Begruendung,
      // ohne Quote gehe nichts - das war falsch: der Verteiler setzt dann
      // eine Ersatzquote ein und baut die Wette doch dort ein.
      quoten[kz] = (q.roh && q.roh > 1) ? q.roh : null;
      belegt[kz] = q.fest === true || q.quelle === "Screenshot";
      // Was Karam selbst gesehen hat, schlaegt die Schaetzung aus der
      // Tabelle. "N" heisst fuer den Verteiler: letzte Wahl.
      verf[kz] = nichtDa(w.id, kz) ? "N" : (v[kz] || "J");
    }
    // Die harte Sperre: hier steht, wo Karam die Wette nicht gefunden hat.
    const gesperrt = {};
    for (const kz of e.anbieter) if (nichtDa(w.id, kz)) gesperrt[kz] = true;
    // mind: die Mindestquote DIESER Wette aus dem Foto. Ohne die wuerde der
    // Verteiler weiter mit einer einzigen Zahl fuer alle rechnen.
    eingabe.wetten.push({ id: w.id, spiel: spielKennung(w), quoten: quoten, belegt: belegt,
      verf: verf, gesperrt: gesperrt, mind: mindFuer(w, optIdx, e.mind) });
  }

  // ---- Verteilen: beide Verfahren rechnen, das bessere gewinnt ----
  const aus = (typeof verteileBeste === "function")
    ? verteileBeste(eingabe)
    : { kombis: [], uebrig: eingabe.wetten.map(x => x.id), bericht: {} };

  // ---- Kombinationen in Scheine uebersetzen ----
  // Eine Kombination = eine Gruppen-Nummer (daran haengt die 400er-Rechnung).
  // Jeder Teil = ein Schein bei einem Anbieter mit seinem Einsatz.
  const scheine = behalten.slice();
  // Diese Nummer ist NUR zum Zusammenhalten der Teile einer Kombination.
  // Sie wird nie angezeigt und darf sich deshalb ruhig wiederholen. Die
  // sichtbare Nummer entsteht beim Zeichnen (anzeigeNr), die feste erst
  // beim Speichern.
  let lfdIntern = 0;
  for (const s of behalten) if ((s.nr || 0) > lfdIntern) lfdIntern = s.nr;
  // Eine Marke fuer diesen Durchgang, damit die Kennungen der neuen
  // Scheine nicht auf die von gestern fallen (siehe oben bei bauMarke).
  const marke = bauMarke();
  // Karam baut seit 30.08.2026 SELBST, unten in der Tabelle. Automatisch
  // gestellte Kombinationen will er nicht mehr sehen: "Ich will nur noch,
  // dass ich die erstelle." Der Verteiler rechnet weiter (er liefert die
  // Uebersicht, welche Wette wo ueberhaupt geht), aber es entstehen keine
  // Scheine mehr daraus. Auf true stellen holt den Automatikbau zurueck.
  for (const k of (KT_AUTOBAU ? (aus.kombis || []) : [])) {
    const lfd = ++lfdIntern;
    const wetten = k.wetten.map(id => ({ id: id, optIdx: optVon[id] || 0 }));
    const teile = (k.teile && k.teile.length) ? k.teile
      : [{ kz: e.anbieter[0], einsatz: e.ziel, sicherheit: "geschaetzt" }];
    teile.forEach((t, ti) => {
      scheine.push({
        nr: lfd,
        id: "S" + marke + "-" + lfd + (ti ? "_t" + (ti + 1) : ""),
        kz: t.kz,
        art: "normal",
        teil: ti ? ti + 1 : undefined,
        einsatz: t.einsatz,
        sicherheit: t.sicherheit || "geschaetzt",
        wetten: wetten.map(x => ({ id: x.id, optIdx: x.optIdx })),
        entfernt: []
      });
    });
  }

  // ---- Was nicht verbaut wurde ----
  // Unter der Mindestquote ueberall -> eigene 3er-Scheine wie bisher
  // ("niedrig"), damit nichts weggeworfen wird. Der Rest bleibt als
  // "uebrig" sichtbar.
  const inKombi = new Set();
  for (const k of aus.kombis || []) for (const id of k.wetten) inKombi.add(id);
  const zuNiedrig = [], uebrig = [];
  for (const w of offen) {
    if (inKombi.has(w.id)) continue;
    const irgendwoUeber = e.anbieter.some(kz =>
      ueberMind(zielQuote(w, optVon[w.id], kz).echt, mindFuer(w, optVon[w.id], e.mind)));
    (irgendwoUeber ? uebrig : zuNiedrig).push(w);
  }
  const topfN = mische(zuNiedrig.slice(), e.saat + 7);
  const uebrigN = [];
  while (topfN.length) {
    const gruppe = [];
    const spiele = new Set();
    for (let i = 0; i < topfN.length && gruppe.length < 3; i++) {
      const kk = spielKennung(topfN[i]);
      if (spiele.has(kk)) continue;               // R2 auch bei den Niedrigen
      spiele.add(kk);
      gruppe.push(topfN.splice(i, 1)[0]);
      i--;
    }
    if (gruppe.length === 3) {
      const lfd = ++lfdIntern;
      // Bet365 ist auch hier die letzte Wahl (R6): der erste erlaubte
      // Nicht-b3-Anbieter bekommt den Niedrig-Schein.
      const kzN = e.anbieter.find(kz => kz !== "b3") || e.anbieter[0];
      scheine.push(macheSchein(marke, lfd, kzN,
        gruppe.map(w => ({ id: w.id, optIdx: optVon[w.id] || 0 })), "niedrig"));
    } else {
      for (const w of gruppe) uebrigN.push({ kz: "", id: w.id });
      break;
    }
  }

  const zustand = {
    einst: e,
    scheine: scheine,
    uebrig: uebrig.map(w => ({ kz: "", id: w.id })),
    uebrigNiedrig: uebrigN,
    doppelt: [],          // Doppel-Spiele fliegen nicht mehr raus: der
    keinMarkt: [],        // Verteiler achtet je Schein darauf (R2)
    gesamtOffen: offen.length,
    tipps: (aus.bericht && aus.bericht.tippVorschlaege) || [],
    bericht: aus.bericht || {},
    gebautAm: new Date().toISOString()
  };
  speichereZustand(zustand);
  return zustand;
}

function waehleAnbieter(moeglich, topf) {
  // Karams Regel: Bet365 ist die LETZTE Option. Solange irgendein anderer
  // erlaubter Anbieter die Wette führt, bekommt Bet365 sie nicht automatisch.
  // (Einen Schein von Hand auf Bet365 stellen geht weiterhin.)
  const ohneB3 = moeglich.filter(m => m.kz !== "b3");
  const auswahl = ohneB3.length ? ohneB3 : moeglich;
  const beste = auswahl[0].q.echt;
  const gleichauf = auswahl.filter(m => m.q.echt >= beste - 0.005);
  gleichauf.sort((a, b) => {
    if (a.duenn !== b.duenn) return a.duenn ? 1 : -1;
    const la = (topf[a.kz] || []).length, lb = (topf[b.kz] || []).length;
    if (la !== lb) return la - lb;
    return b.q.echt - a.q.echt;
  });
  return gleichauf[0].kz;
}

// Erkennungsmarke statt fremdem Logo: eigene Marke in der bekannten Hausfarbe.
// Fremde Firmenlogos werden bewusst NICHT eingebunden (Urheberrecht, und sie
// wuerden von den Anbieter-Servern geladen, was hier ohnehin blockiert ist).
function marke(kz) {
  return '<span class="marke m-' + kz + '">' + anbieterName(kz) + "</span>";
}

// Anbieter eines Scheins wechseln, mit Prüfung aller drei Wetten
function anbieterWechseln(scheinId, neuKz) {
  if (!neuKz) return;
  const z = liesZustand();
  const sch = z.scheine.find(s => s.id === scheinId);
  if (!sch || sch.kz === neuKz) return;

  const probleme = [];
  for (const eintrag of sch.wetten) {
    const w = wetteNachId(eintrag.id);
    if (!w) continue;
    const v = verfuegbarkeit(w)[neuKz];
    // "N" ist nur eine Einschätzung, kein Ausschluss: Karam prüft selbst.
    const q = zielQuote(w, eintrag.optIdx, neuKz);
    const mindW = mindFuer(w, eintrag.optIdx, z.einst.mind);
    if (sch.art === "normal" && q.echt < mindW - 0.0001) {
      probleme.push(w.spiel + ": dort nur " + rund2(q.echt).toFixed(2) +
        ", unter der Mindestquote " + mindW.toFixed(2) + " dieser Wette");
    }
  }

  const alt = sch.kz;
  sch.kz = neuKz;
  speichereZustand(z);

  if (probleme.length) {
    meldung("Schein " + sch.nr + " steht jetzt auf " + anbieterName(neuKz) +
      ", aber <b>" + probleme.length + " von " + sch.wetten.length +
      " Wetten passen dort nicht</b>:<ul><li>" + probleme.join("</li><li>") +
      "</li></ul>Die betroffenen Zeilen sind rot. Nimm sie mit dem Menue rechts raus, " +
      "dann rueckt automatisch etwas Passendes nach. Oder stell zurueck auf " +
      anbieterName(alt) + ".", "warn");
  } else {
    meldung("Schein " + sch.nr + " steht jetzt auf <b>" + anbieterName(neuKz) +
      "</b>. Alle " + sch.wetten.length + " Wetten sind dort verfügbar und über der Mindestquote.", "gut");
  }
  zeichne_();
}

function macheSchein(marke, nr, kz, gruppe, art) {
  return {
    nr: nr,
    id: "S" + marke + "-" + nr,
    kz: kz,
    art: art,                 // "normal" oder "niedrig"
    wetten: gruppe.map(k => ({ id: k.id, optIdx: k.optIdx })),
    entfernt: []              // {id, grund, wann}
  };
}

function mische(liste, saat) {
  let s = saat || 1;
  const zufall = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

// ---------- Was Karam selbst gesehen hat ----------
//
// "Dieser Anbieter hat diese Wette nicht" ist eine Beobachtung, keine
// Schaetzung. Sie bleibt auf dem Geraet stehen und gilt fuer alles
// Weitere: fuer den Wechsel des Anbieters, fuer das Nachruecken und
// beim naechsten Bauen.
const NICHT_DA_SCHLUESSEL = "kt_nicht_da";

function nichtDaLesen() {
  try { return JSON.parse(localStorage.getItem(NICHT_DA_SCHLUESSEL) || "{}") || {}; }
  catch (e) { return {}; }
}

function nichtDa(wettId, kz) {
  // Alles Wahre sperrt: alte Eintraege stehen auf true, neue auf
  // "keine" oder "quote".
  return !!nichtDaLesen()[wettId + "|" + kz];
}

// Warum gesperrt? "keine" = hat er nicht, "quote" = Quote passt dort
// nicht, "" = gar nicht gesperrt.
function nichtDaGrund(wettId, kz) {
  const wert = nichtDaLesen()[wettId + "|" + kz];
  if (!wert) return "";
  return (wert === "quote") ? "quote" : "keine";
}

function nichtDaSetzen(wettId, kz, grund) {
  const m = nichtDaLesen();
  if (grund) m[wettId + "|" + kz] = (grund === "quote") ? "quote" : "keine";
  else delete m[wettId + "|" + kz];
  try { localStorage.setItem(NICHT_DA_SCHLUESSEL, JSON.stringify(m)); return true; }
  catch (e) {
    meldung("Der Speicher dieses Browsers ist voll - ich konnte mir nicht merken, " +
      "dass der Anbieter diese Wette nicht hat.", "warn");
    return false;
  }
}

// Hat KEINER der erlaubten Anbieter diese Wette?
function nirgendsDa(wettId, erlaubt) {
  const liste = (erlaubt && erlaubt.length) ? erlaubt : KT_ANBIETER_RANG;
  return liste.every(kz => nichtDa(wettId, kz));
}

// ---------- Wette rausnehmen und Ersatz nachruecken ----------

// Die frueheren Helfer verbraucht() und verbrauchteKennungen() sind hier
// weg. Sie sperrten global jede schon verbaute Wette und jedes schon
// vorkommende Spiel - damit war der Topf fuer den Nachruecker praktisch
// immer leer. Was jetzt gilt, steht bei findeErsatz.

// Wie oft steckt jede Wette gerade in einem Schein? R3 erlaubt zwei.
function nutzungZaehlen(z) {
  const n = {};
  for (const sch of z.scheine) for (const w of sch.wetten) n[w.id] = (n[w.id] || 0) + 1;
  return n;
}

const ERSATZ_MAX_NUTZUNG = 2;   // R3, dieselbe Zahl wie beim Verteilen
const ERSATZ_NOTFALL_NUTZUNG = 3;   // die Ausnahme, damit drei drin bleiben

function findeErsatz(z, kz, scheinId, maxNutzung) {
  const grenze = maxNutzung || ERSATZ_MAX_NUTZUNG;
  const e = z.einst;
  const sch = z.scheine.find(s => s.id === scheinId);
  const leer = { imOrdner: 0, offen: 0, frei: 0, mitMarkt: 0, passend: 0 };
  if (!sch) return { treffer: null, info: leer };

  const nutzung = nutzungZaehlen(z);

  // Was steht in DIESEM Schein schon - als Wette und als Spiel?
  const drinHier = new Set(sch.wetten.map(w => w.id));
  const spieleHier = new Set();
  for (const w of sch.wetten) {
    const ww = wetteNachId(w.id);
    if (ww) spieleHier.add(spielKennung(ww));
  }
  // Was Karam aus GENAU DIESEM Schein herausgenommen hat, kommt hier nicht
  // zurueck - er hatte einen Grund. In einem anderen Schein darf es stehen.
  const rausHier = new Set((sch.entfernt || []).map(x => x.id));

  // NUR aus dem offenen Ordner. satzWetten() gibt ausschliesslich Wetten
  // dieses Ordners zurueck - eine zweite Quelle gibt es hier nicht.
  const imOrdner = satzWetten();
  const offen = imOrdner.filter(w => !istVorbei(anstossFeld(w)));
  const frei = offen.filter(w =>
    !drinHier.has(w.id) &&
    !rausHier.has(w.id) &&
    !spieleHier.has(spielKennung(w)) &&
    // Was der Anbieter dieses Scheins nachweislich nicht hat, darf hier
    // auch nicht nachruecken. Das fehlte, und die Erfolgsmeldung hat dann
    // sogar behauptet, die Wette sei dort zu haben.
    !nichtDa(w.id, kz) &&
    (nutzung[w.id] || 0) < grenze);

  const bewertet = [];
  for (const w of frei) {
    const optIdx = gewaehlteOption(w);
    const q = zielQuote(w, optIdx, kz);
    if (ueberMind(q.echt, mindFuer(w, optIdx, e.mind)))
      bewertet.push({ w: w, optIdx: optIdx, echt: q.echt, schonBenutzt: nutzung[w.id] || 0 });
  }
  const info = { imOrdner: imOrdner.length, offen: offen.length, frei: frei.length,
    mitMarkt: frei.length, passend: bewertet.length };
  if (!bewertet.length) return { treffer: null, info: info };

  // Erst die, die noch gar nicht verbaut sind - so haengen nicht zwei
  // Scheine an derselben Wette. Danach der fruehere Anstoss.
  bewertet.sort(function (a, b) {
    if (a.schonBenutzt !== b.schonBenutzt) return a.schonBenutzt - b.schonBenutzt;
    return liesAnstoss(anstossFeld(a.w)).zeit - liesAnstoss(anstossFeld(b.w)).zeit;
  });
  return { treffer: { id: bewertet[0].w.id, optIdx: bewertet[0].optIdx,
    schonBenutzt: bewertet[0].schonBenutzt }, info: info, grenze: grenze };
}

function wetteRaus(scheinId, wettId, grund) {
  const z = liesZustand();
  if (!z) return;
  const sch = z.scheine.find(s => s.id === scheinId);
  if (!sch) return;
  const pos = sch.wetten.findIndex(w => w.id === wettId);
  if (pos < 0) return;

  // Im Modus "Einer nach dem anderen" gilt etwas anderes: dort wird die
  // Wette fuer DIESEN Anbieter abgelehnt und sofort getauscht, die zwei
  // anderen bleiben stehen. Genau so arbeitet Karam am Schalter.
  if (sch.einzeln && typeof einzelnAbgelehnt === "function") {
    if (grund === "Anbieter hat die Wette nicht") { einzelnAbgelehnt(wettId, "keine"); return; }
    if (grund === "Quote passt nicht mehr") { einzelnAbgelehnt(wettId, "quote"); return; }
    if (typeof einzelnTauschen === "function") { einzelnTauschen(wettId); return; }
  }

  // Karams Sonderweg: sagt er "der Anbieter hat sie nicht", dann fliegt
  // nicht die Wette raus, sondern die ganze Kombination wandert weiter.
  if (grund === "Anbieter hat die Wette nicht") {
    if (anbieterWeiterwandern(z, sch, wettId)) return;
    // Kein Anbieter mehr uebrig: dann doch heraus, unten weiter wie immer.
  }

  sch.entfernt.push({ id: wettId, grund: grund, wann: new Date().toISOString() });
  sch.wetten.splice(pos, 1);
  speichereZustand(z);

  // Ersatz suchen: gleicher Anbieter, gleicher Ordner, und nur was in
  // DIESEN Schein passt.
  // Stufe 1: hoechstens zwei Scheine je Wette (R3).
  let suche = findeErsatz(z, sch.kz, sch.id, ERSATZ_MAX_NUTZUNG);
  // Stufe 2: ist der Ordner voll verbaut - und das ist er nach einem
  // vollen Bau IMMER, gemessen 51 Wetten auf 102 Plaetze - dann darf eine
  // Wette ausnahmsweise in einen dritten Schein. Sonst bliebe hier auf
  // Dauer ein Zweier stehen.
  if (!suche.treffer) suche = findeErsatz(z, sch.kz, sch.id, ERSATZ_NOTFALL_NUTZUNG);
  if (suche.treffer) {
    sch.wetten.splice(pos, 0, { id: suche.treffer.id, optIdx: suche.treffer.optIdx });
    speichereZustand(z);
    const nw = wetteNachId(suche.treffer.id);
    const schon = suche.treffer.schonBenutzt || 0;
    // Bei der Ausnahme MUSS klar dastehen, was sie bedeutet: die Wette
    // entscheidet dann ueber drei Kombinationen statt ueber zwei.
    const zusatz = (schon >= ERSATZ_MAX_NUTZUNG)
      ? " <b>Achtung:</b> im Ordner war nichts Freies mehr, deshalb steht diese Wette " +
        "jetzt in <b>drei</b> Scheinen. Geht sie schief, sind alle drei weg."
      : (schon ? " (steht auch in einem zweiten Schein)" : "");
    meldung("<b>Nachgerückt:</b> " + (nw ? nw.spiel : suche.treffer.id) +
      " - der Schein hat wieder " + sch.wetten.length + " Wetten. " +
      "Bei " + anbieterName(sch.kz) + " über der Mindestquote, aus dem offenen Ordner." +
      zusatz, schon >= ERSATZ_MAX_NUTZUNG ? "warn" : "gut");
  } else {
    const i = suche.info;
    let grundText;
    // Hier ist schon Stufe 2 gelaufen, also war auch ein dritter Schein
    // je Wette erlaubt. Was jetzt noch fehlt, fehlt wirklich.
    if (i.offen === 0) grundText = "In diesem Ordner ist keine Wette mehr offen - alle Spiele " +
      "haben schon angefangen.";
    else if (i.frei === 0) grundText = "Von den " + i.offen + " noch offenen Wetten des Ordners " +
      "passt keine in diesen Schein - auch dann nicht, wenn eine Wette ausnahmsweise in einen " +
      "dritten Schein dürfte. Entweder steht das Spiel schon in diesem Schein, oder du hast " +
      "die Wette hier vorher selbst herausgenommen.";
    else grundText = "Von den " + i.frei + " Wetten, die hier hineinpassen würden, schafft keine " +
      "bei " + anbieterName(sch.kz) + " deine Mindestquote " + z.einst.mind.toFixed(2) + ".";
    meldung("<b>Kein Ersatz gefunden.</b> " + grundText +
      " Der Schein hat jetzt " + sch.wetten.length + " Wetten. Deine Möglichkeiten: " +
      "als " + sch.wetten.length + "er stehen lassen, oder oben auf <b>Anders mischen</b> " +
      "drücken (verteilt alles neu), oder die Mindestquote senken.", "warn");
  }
  zeichne_();
}

// ---------- Eigene Quote eintragen, mit Prüfung ----------

function quoteEintragen(scheinId, wettId, feld) {
  const z = liesZustand();
  const sch = z.scheine.find(s => s.id === scheinId);
  const eintrag = sch.wetten.find(w => w.id === wettId);
  const w = wetteNachId(wettId);
  const opt = w.o[eintrag.optIdx][0];
  const roh = parseFloat(feld.value);

  if (!feld.value) {                       // geleert: Eingabe löschen
    speichereEingabe(wettId, opt, sch.kz, "");
    zeichne_();
    return;
  }
  if (!roh || roh <= 1) { feld.classList.add("fehler"); return; }

  const echt = roh / GEBUEHREN_TEILER[sch.kz];
  const mindW = mindFuer(w, eintrag.optIdx, z.einst.mind);
  if (sch.art === "normal" && echt < mindW - 0.0001) {
    feld.classList.add("fehler");
    meldung("Nicht übernommen: " + roh.toFixed(2) + " bei " + anbieterName(sch.kz) +
      " sind real nur " + rund2(echt).toFixed(2) + ", das liegt unter der Mindestquote " +
      mindW.toFixed(2) + " dieser Wette (aus dem Foto). Entweder du nimmst die Wette raus, " +
      "oder du suchst eine andere Linie desselben Spiels.",
      "warn");
    return;
  }
  feld.classList.remove("fehler");
  // Karams Regel: unter der Mindestquote ist gesperrt (oben), weit UEBER der
  // Foto-Quote gibt es eine Mahnung - das riecht nach Tippfehler.
  const fotoRoh = w.o[eintrag.optIdx][1];
  if (fotoRoh && roh > fotoRoh * 1.15) {
    meldung("<b>Mahnung, bitte prüfen:</b> deine Quote <b>" + roh.toFixed(2) + "</b> liegt weit über der " +
      "Foto-Quote <b>" + fotoRoh.toFixed(2) + "</b> (mehr als 15 Prozent drüber). Vertippt? " +
      "Übernommen ist sie trotzdem - wenn sie wirklich stimmt, ist alles gut.", "warn");
  }
  speichereEingabe(wettId, opt, sch.kz, String(roh));
  merkeGeprueft(wettId, sch.kz);
  zeichne_();
}

// ---------- Foto zum Schein ----------

function fotoSchluessel(scheinId) { return "foto_" + scheinId; }

// Kurzform eines Spielnamens fuer den Bildnamen:
// "Bayern München - Borussia Dortmund" -> "Bay-Bor"
function spielKuerzel(spiel) {
  const seiten = String(spiel || "").split(/\s+(?:-|–|—|vs\.?|gegen)\s+/i);
  const kurz = seiten.map(seite => {
    const woerter = seite.trim().replace(/[^A-Za-zÄÖÜäöüß0-9 ]/g, "").split(/\s+/).filter(Boolean);
    if (!woerter.length) return "";
    // Vereinskuerzel wie FC, SV, TSV sagen nichts - das erste echte Wort zaehlt.
    const wort = woerter.find(x => x.length > 2 && !/^(fc|sv|sc|ac|as|ss|vfb|vfl|tsv|rb|psv|afc)$/i.test(x)) || woerter[0];
    return wort.slice(0, 3);
  }).filter(Boolean);
  return kurz.join("-") || "Spiel";
}

// Der Name des Bildes: Anbieter, Teams abgekuerzt, Einsatz, die einzelnen
// Quoten NACH Gebuehr, die Gesamtquote und das Datum. "netto" heisst:
// die Gebuehr des Anbieters ist schon abgezogen - der Schein selbst zeigt
// hoehere Zahlen.
function fotoName(scheinId) {
  const z = liesZustand();
  const sch = z ? z.scheine.find(x => x.id === scheinId) : null;
  const d = new Date();
  const datum = String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  if (!sch) return "Schein " + datum;
  let gesamt = 1;
  const kuerzel = [];
  const quoten = [];
  for (const eintrag of sch.wetten) {
    const w = wetteNachId(eintrag.id);
    if (!w) continue;
    const q = zielQuote(w, eintrag.optIdx, sch.kz);
    gesamt *= q.echt;
    kuerzel.push(spielKuerzel(w.spiel));
    quoten.push(rund2(q.echt).toFixed(2));
  }
  const feld = document.getElementById("e_" + scheinId);
  let einsatz = feld ? parseFloat(feld.value) : parseFloat(sch.einsatz);
  if (isNaN(einsatz)) einsatz = parseFloat(einsatzWert(sch, z)) || 0;
  const netto = (GEBUEHREN_TEILER[sch.kz] !== 1) ? "netto" : "";
  return anbieterName(sch.kz) + " " + kuerzel.join("_") +
    " " + rund2(einsatz).toFixed(2) + "EUR" +
    (quoten.length ? " " + quoten.join("x") : "") +
    " Q" + rund2(gesamt).toFixed(2) + netto + " " + datum;
}

// Ein fertiges Bild (Ausschnitt oder Foto) dem Schein zuordnen.
// Passt es nicht in den Speicher, wird es schrittweise kleiner gerechnet,
// statt mit einem Fehler abzubrechen.
function fotoAusCanvas(c, scheinId, herkunft) {
  const name = fotoName(scheinId);
  let daten = c.toDataURL("image/jpeg", 0.82);
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      localStorage.setItem(fotoSchluessel(scheinId), daten);
      localStorage.setItem(fotoSchluessel(scheinId) + "_zeit", new Date().toISOString());
      localStorage.setItem(fotoSchluessel(scheinId) + "_name", name);
      meldung((herkunft || "Bild") + " übernommen und benannt: <b>" + name + "</b> (" +
        Math.round(daten.length / 1024) + " KB).", "gut");
      zeichne_();
      return true;
    } catch (err) {
      const k = document.createElement("canvas");
      k.width = Math.max(1, Math.round(c.width * 0.75));
      k.height = Math.max(1, Math.round(c.height * 0.75));
      k.getContext("2d").drawImage(c, 0, 0, k.width, k.height);
      c = k;
      daten = c.toDataURL("image/jpeg", 0.7);
    }
  }
  meldung("Das Bild passt nicht in den Speicher. Lösch ältere Bilder oder nimm einen kleineren Ausschnitt.", "warn");
  return false;
}

// Dateiname zum Herunterladen (ohne Leerzeichen)
function fotoDateiname(name) {
  return name.replace(/ /g, "_").replace("Quote_", "Q") + ".jpg";
}

function fotoHochladen(scheinId, input) {
  const datei = input.files && input.files[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onload = ev => {
    const bild = new Image();
    bild.onload = () => {
      // Verkleinern, damit es in den Speicher passt
      const maxB = 700;
      const faktor = Math.min(1, maxB / bild.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bild.width * faktor);
      c.height = Math.round(bild.height * faktor);
      c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
      const daten = c.toDataURL("image/jpeg", 0.7);
      try {
        const name = fotoName(scheinId);
        localStorage.setItem(fotoSchluessel(scheinId), daten);
        localStorage.setItem(fotoSchluessel(scheinId) + "_zeit", new Date().toISOString());
        localStorage.setItem(fotoSchluessel(scheinId) + "_name", name);
        meldung("Foto gespeichert und benannt: <b>" + name + "</b> (" +
          Math.round(daten.length / 1024) + " KB).", "gut");
        zeichne_();
      } catch (err) {
        meldung("Foto zu gross für den Speicher. Lösch aeltere Fotos oder mach einen Ausschnitt.", "warn");
      }
    };
    bild.src = ev.target.result;
  };
  leser.readAsDataURL(datei);
}

function fotoLoeschen(scheinId) {
  localStorage.removeItem(fotoSchluessel(scheinId));
  localStorage.removeItem(fotoSchluessel(scheinId) + "_zeit");
  localStorage.removeItem(fotoSchluessel(scheinId) + "_name");
  localStorage.removeItem("foto_analyse_" + scheinId);
  zeichne_();
}

// ---------- Meldungen ----------

function meldung(text, art) {
  const box = document.getElementById("meldung");
  box.className = (art === "warn") ? "warnkern" : "merk";
  box.innerHTML = text;
  box.style.display = "block";
}

// ---------- Anzeige ----------

function zeichne_() {
  zeichneOrdnerLeiste();
  zeichneGesetzte();
  zeichneEigenbau();
  // Auf "Mein Bereich" gibt es keine Schein-Elemente: dort nur Konto und Verlauf zeichnen.
  if (!document.getElementById("scheine")) {
    zeichneVerlauf();
    zeichneKonto();
    return;
  }
  let z = liesZustand();
  if (!z) z = baueAlles();

  // AUTO-ARCHIV: vergangene Wetten fliegen aus den Scheinen.
  // Was du mit "In den Verlauf" gespeichert hast, bleibt für immer im Verlauf;
  // hier im Bau verschwinden nur die abgelaufenen Bausteine.
  let archiviert = 0, nachgerückt = 0;
  for (const sch of z.scheine) {
    for (let i = sch.wetten.length - 1; i >= 0; i--) {
      const w = wetteNachId(sch.wetten[i].id);
      if (!w || istVorbei(anstossFeld(w))) {
        sch.entfernt.push({ id: sch.wetten[i].id,
          grund: "Spiel vorbei, automatisch archiviert", wann: new Date().toISOString() });
        sch.wetten.splice(i, 1);
        archiviert++;
      }
    }
  }
  if (archiviert) {
    speichereZustand(z);
    // ACHTUNG, hier stand ein Fehler: findeErsatz bekam eine LISTE, wo es
    // eine Schein-Kennung erwartet. Damit fand es nie einen Schein und gab
    // still auf - das automatische Nachruecken nach dem Archivieren hat
    // also seit dem Umbau gar nicht mehr funktioniert.
    for (const sch of z.scheine) {
      while (sch.wetten.length < 3) {
        const suche = findeErsatz(z, sch.kz, sch.id, ERSATZ_NOTFALL_NUTZUNG);
        if (!suche.treffer) break;
        sch.wetten.push(suche.treffer);
        nachgerückt++;
        speichereZustand(z);
      }
    }
    z.scheine = z.scheine.filter(sch => sch.wetten.length > 0);
    speichereZustand(z);
    meldung(archiviert + " abgelaufene Wette(n) automatisch archiviert, " +
      nachgerückt + " Ersatz nachgerückt. Dein Verlauf in Mein Bereich bleibt unberührt.", "gut");
  }

  // Einstellungen zurueckspiegeln
  document.getElementById("mind").value = z.einst.mind;
  document.querySelectorAll(".anbwahl").forEach(c => { c.checked = z.einst.anbieter.includes(c.value); });

  // Anbieter-Filter (Karten oben im Panel): NUR die Anzeige wird
  // gefiltert - Zustand, Zaehler und Panel rechnen weiter mit allem.
  const sichtbar = s => !bauAnbieterFilter || s.kz === bauAnbieterFilter;
  const normal = z.scheine.filter(s =>
    (s.art === "normal" || s.art === "eigen" || s.art === "variante") && sichtbar(s));
  const niedrig = z.scheine.filter(s => s.art === "niedrig" && sichtbar(s));
  const verbaut = z.scheine.reduce((p, s) => p + s.wetten.length, 0);

  // Einmal fuer alle Karten (siehe Kommentar unten bei scheinHtml).
  const gesetztJetzt = gesetzteEintraege();

  const gruppenZahl = new Set(normal.map(s => s.nr)).size;
  document.getElementById("uebersicht").innerHTML =
    (KT_AUTOBAU
      ? "<b>" + gruppenZahl + " Kombinationen über der Mindestquote</b> (je Wette aus dem Foto, sonst " +
        z.einst.mind.toFixed(2) + "), dazu <b>" + niedrig.length + " Scheine mit zu niedrigen Quoten</b>. " +
        verbaut + " Plätze belegt bei " + z.gesamtOffen + " offenen Wetten (jede darf in " +
        "höchstens zwei Scheinen stecken), " + (z.uebrig.length + z.uebrigNiedrig.length) + " blieben übrig."
      : "<b>" + gruppenZahl + " selbst gebaute Kombination(en)</b>, " + verbaut +
        " Plätze bei " + z.gesamtOffen + " offenen Wetten. Gebaut wird unten in der Tabelle.") +
    (bauAnbieterFilter ? ' <span class="gs-filterhinweis">&#128269; Filter: nur <b>' +
      textSicherK2(anbieterName(bauAnbieterFilter)) +
      "</b> - Karte oben nochmal antippen zeigt wieder alles.</span>" : "") +
    tippsHtml(z);

  document.getElementById("scheine").innerHTML =
    (normal.length ? normal.map(s => scheinHtml(s, z, gesetztJetzt)).join("") :
      (bauAnbieterFilter
        ? '<div class="kern">Keine Kombination bei ' + textSicherK2(anbieterName(bauAnbieterFilter)) +
          " im Bau. Die Karte oben nochmal antippen zeigt wieder alle.</div>"
        : '<div class="kern">Noch nichts gebaut. Hak dir unten in der Tabelle die Wetten an, ' +
          'wähl den Anbieter und drück <b>Kombination aus der Auswahl bauen</b>.</div>'));

  document.getElementById("niedrig").innerHTML =
    (niedrig.length ? niedrig.map(s => scheinHtml(s, z, gesetztJetzt)).join("") :
      '<p class="mini">Keine Wetten unter der Mindestquote.</p>');

  zeichneReste(z);
  zeichneVerlauf();
  zeichneKonto();
  if (typeof einzelnZeichnen === "function") einzelnZeichnen();
  zeichnePanel();
}

// Die sichtbare Nummer: 1 bis zur Zahl der gebauten Kombinationen.
// Teile derselben Kombination teilen sich eine Nummer.
function anzeigeNr(z, nr) {
  const alle = [...new Set((z.scheine || []).map(s => s.nr))].sort((a, b) => a - b);
  const i = alle.indexOf(nr);
  return i < 0 ? nr : (i + 1);
}

// gesetzt ist die EINE Liste je Zeichnung (gesetzteEintraege). Fehlt sie,
// holt schonGesetzt sie selbst - dann stimmt die Anzeige auch, es kostet
// nur mehr.
function scheinHtml(s, z, gesetzt) {
  const mind = mindWert(z);
  // EXAKTE Kennung: ein zweiter Teil ist beim Anbieter eine eigene
  // Wette und braucht seinen eigenen Eintrag.
  const imVerlauf = schonGesetzt(s.id, gesetzt);
  let gesamt = 1, gesamtRoh = 1, alleFest = true;
  const zeilen = s.wetten.map(eintrag => {
    const w = wetteNachId(eintrag.id);
    if (!w) return "";
    const q = zielQuote(w, eintrag.optIdx, s.kz);
    const v = verfuegbarkeit(w)[s.kz];
    gesamt *= q.echt; gesamtRoh *= q.roh;
    if (!q.fest) alleFest = false;
    // Die Mindestquote gegen die ECHTE Quote nach Gebuehr.
    // Genau auf der Grenze gilt als erreicht - also gruen.
    // Jede Zeile hat ihre EIGENE Mindestquote aus dem Foto. "mind" oben ist
    // nur noch der Ersatzwert, falls im Foto keine steht.
    const mindZ = mindFuer(w, eintrag.optIdx, mind);
    const unter = !ueberMind(q.echt, mindZ);
    const opt = w.o[eintrag.optIdx][0];
    const eigen = liesEingabe(w.id, opt, s.kz);
    return "<tr" + (unter ? ' class="unterquote"' : "") + ">" +
      "<td class='s-zeit'>" + zeitText(anstossFeld(w)) + "</td>" +
      "<td class='s-spiel'>" + w.spiel + '<div class="mini">' + w.liga + "</div></td>" +
      "<td class='s-wette'>" + optionName(w, eintrag.optIdx) +
        ' <span class="reiter-chip">' + w.s + "</span>" +
        (v === "D" ? '<div class="duenn">Markt dort duenn, prüfen</div>' :
         (v === "N" ? '<div class="duenn">Einschätzung: evtl. nicht im Angebot, prüfen</div>' : "")) + "</td>" +
      "<td class='s-ziel'>" + q.roh.toFixed(2) + '<div class="mini">' + q.quelle + "</div></td>" +
      // Die Mindestquote, aber in der Waehrung der Spalte daneben: das ist
      // die Zahl, die beim Anbieter auf dem Schirm stehen muss. Bei
      // Interwetten sind das 1,89 fuer real 1,80.
      // AUFRUNDEN, nicht kaufmaennisch: bei 1,85 und Teiler 1,05 waeren es
      // 1,9425 - abgerundet auf 1,94 waere die echte Quote 1,8476 und damit
      // UNTER der Mindestquote. Die angezeigte Pflichtquote muss immer
      // reichen.
      "<td class='s-mind'>" + (Math.ceil(mindZ * GEBUEHREN_TEILER[s.kz] * 100) / 100).toFixed(2) +
        (GEBUEHREN_TEILER[s.kz] !== 1
          ? '<div class="mini">= real ' + mindZ.toFixed(2) + "</div>" : "") +
        '<div class="mini">' + (w.o[eintrag.optIdx].length > 2
          ? "aus dem Foto" : "kein Foto-Wert") + "</div></td>" +
      "<td class='s-eingabe'><input type='number' step='0.01' min='1' placeholder='Quote' " +
        (eigen ? "value='" + eigen + "' " : "") +
        "onchange=\"quoteEintragen('" + s.id + "','" + w.id + "',this)\">" +
        // Karams Ampel: drueber gruen, drunter rot, genau drauf gruen.
        '<div class="' + (unter ? "unterrot" : "uebergruen") + '">real ' + rund2(q.echt).toFixed(2) +
        (unter ? " zu niedrig" : "") + "</div></td>" +
      "<td class='s-raus'>" +
        "<select onchange=\"if(this.value){wetteRaus('" + s.id + "','" + w.id + "',this.value);}\">" +
        "<option value=''>raus...</option>" +
        "<option>Quote passt nicht mehr</option>" +
        "<option>Anbieter hat die Wette nicht</option>" +
        "<option>Spiel abgelaufen</option>" +
        "<option>will ich nicht</option></select></td></tr>";
  }).join("");

  const foto = localStorage.getItem(fotoSchluessel(s.id));
  const fotoZeit = localStorage.getItem(fotoSchluessel(s.id) + "_zeit");
  const kopfKlasse = (s.art === "niedrig") ? "s-kopf niedrigkopf" : "s-kopf";

  const wahl = '<select class="anbwechsel" onchange="anbieterWechseln(\'' + s.id + "', this.value)\">" +
    ANBIETER.map(a => "<option value='" + a.kz + "'" + (a.kz === s.kz ? " selected" : "") +
      ">" + a.name + "</option>").join("") + "</select>";

  return '<div class="schein"><div class="' + kopfKlasse + '">' +
    // Zuerst und am groessten: WO soll er suchen. marke() schreibt den
    // Namen schon selbst - ihn hier noch einmal zu setzen ergab "StakeStake".
    // Die Anbieter-Klasse m-<kz> am Namen: damit faerbt die Design-Schicht
    // den Kasten je Anbieter, und die :has-Farbband-Regeln in stil.css
    // (Z. ~1111), die genau diese Klasse erwarten, leben wieder.
    '<span class="s-wo"><span class="s-wo-name m-' + s.kz + '">' + anbieterName(s.kz) +
    '</span><span class="s-wo-mini">hier suchen</span></span>' +
    "Kombination " + anzeigeNr(z, s.nr) +
    (imVerlauf
      ? ' <span class="s-drin" title="Diese Kombination ist gespeichert - du findest sie in Mein Bereich.">' +
        '&#10003; im Verlauf' + (imVerlauf.nummer ? ' als Nr. ' + imVerlauf.nummer : '') +
        (imVerlauf.einsatz ? ', ' + Number(imVerlauf.einsatz).toFixed(2) + ' &euro;' : '') + '</span>'
      : "") +
    (s.art === "eigen" ? ' <span class="s-warn">selbst gebaut</span>' : "") +
    (s.teil ? ' <span class="s-warn">Teil ' + s.teil +
      (s.variante ? " (andere Mischung für den Rest)" : " (gleiche Wetten, weiterer Anbieter)") + "</span>" : "") +
    " " + wahl +
    (s.sicherheit === "unsicher"
      ? ' <span class="s-warn">&#9888; nicht bestätigt - vor dem Setzen beim Anbieter prüfen</span>'
      : s.sicherheit === "geschaetzt"
        ? ' <span class="ausshot">Markt nur geschätzt - kurz prüfen</span>' : "") +
    (s.art === "niedrig" ? ' <span class="s-warn">Quoten unter der Mindestquote</span>' : "") +
    (s.wetten.length !== 3 ? ' <span class="s-warn">nur ' + s.wetten.length +
      ' Wetten, kein Dreier mehr</span>' : "") +
    '<span class="s-quote">' + s.wetten.length + "er, Gesamtquote laut Schein <b>" + rund2(gesamtRoh).toFixed(2) + "</b>" +
    (alleFest ? ' <span class="mini gruen">alle Quoten selbst geprüft</span>'
              : ' <span class="mini">teils noch Foto-Quoten</span>') +
    "</span></div>" +
    "<table class='s-tab'><thead><tr><th>Anstoss</th><th>Spiel</th><th>Wette</th>" +
    "<th>Ziel-Quote</th><th>mind.</th><th>Deine Quote</th><th></th></tr></thead><tbody>" +
    zeilen + "</tbody></table>" +
    (s.entfernt.length ? '<div class="s-raus-liste">Rausgenommen: ' +
      s.entfernt.map(e => (wetteNachId(e.id) ? wetteNachId(e.id).spiel : e.id) +
        " (" + e.grund + ")").join(", ") + "</div>" : "") +
    // Karam (01.09.2026): Einsatz UND moeglichen Gewinn eintragen, so wie
    // der Anbieter ihn anzeigt. Aus beiden ergibt sich die ECHTE Gebuehr:
    // Einsatz x Quote laut Schein minus das, was der Anbieter auszahlt.
    // Die frueheren zwei geschaetzten Zahlen (netto / "Schein zeigt")
    // lagen bei Interwetten oft daneben - jetzt zaehlt, was er sieht.
    "<div class='s-fuss'>Einsatz <input type='number' step='0.5' min='0' class='einsatz' " +
      "id='e_" + s.id + "' value='" + einsatzWert(s, z) + "' oninput=\"einsatzGeaendert('" + s.id + "', this.value, " + gesamt + ", " + gesamtRoh + ")\"> &euro;" +
      ' &nbsp;&rarr;&nbsp; m&ouml;glich <input type="number" step="0.01" min="0" class="einsatz gewinn" id="g_' + s.id + '" ' +
        'value="' + gewinnWert(s, z, gesamt) + '" title="Was der Anbieter als möglichen Gewinn anzeigt. Vorbelegt ist die Schätzung nach Gebühr - trag ein, was wirklich dasteht." ' +
        'oninput="gewinnGeaendert(\x27' + s.id + '\x27, this.value, ' + gesamt + ', ' + gesamtRoh + ')"> &euro;' +
      ' <span class="mini gebuehr" id="geb_' + s.id + '">' + gebuehrText(einsatzWert(s, z), gewinnWert(s, z, gesamt), gesamtRoh) + "</span>" +
      '<button class="merken' + (imVerlauf ? ' schonda' : '') + '" ' +
        'onclick="scheinMerken(\'' + s.id + '\')">' +
        (imVerlauf ? 'nochmal in den Verlauf' : 'In den Verlauf') + '</button>' +
      '<button onclick="scheinTeilen(\'' + s.id + '\')" title="Der Anbieter lässt nicht mehr zu? Gleiche Wetten zusätzlich bei einem weiteren Anbieter setzen.">&#10133; Rest bei weiterem Anbieter</button>' +
      '<button class="knopfweg" title="Diese Kombination löschen" ' +
        'onclick="kombiLoeschen(\'' + s.id + '\')">&#128465; Löschen</button>' +
      '<label class="fotoknopf">&#128247; Foto vom Wettschein' +
        '<input type="file" accept="image/*" style="display:none" ' +
        'onchange="fotoHochladen(\'' + s.id + '\', this)"></label>' +
      '<button class="fotoknopf" onclick="ausschnittStarten(\'' + s.id + '\')" ' +
        'title="Schneidet einen Bereich direkt vom Bildschirm aus - ohne Umweg über eine Datei auf dem Laptop.">' +
        "&#9986; Bildschirm-Ausschnitt</button>" +
    "</div>" +
    '<div class="zielzeile" id="ziel_' + s.id + '">' + gruppenText(z, s.nr) + "</div>" +
    '<div class="ordnerwahl" id="ordnerwahl_' + s.id + '"></div>' +
    (foto ? (function () {
      const name = localStorage.getItem(fotoSchluessel(s.id) + "_name") || "Wettschein";
      return '<div class="s-foto"><div class="fotoname">' + name + "</div>" +
        '<img src="' + foto + '" alt="' + name + '">' +
        '<div class="mini">hochgeladen ' + (fotoZeit ? new Date(fotoZeit).toLocaleString("de-AT") : "") +
        ' &nbsp;<a href="' + foto + '" download="' + fotoDateiname(name) + '">unter diesem Namen herunterladen</a>' +
        ' &nbsp;<button onclick="fotoLoeschen(\'' + s.id + '\')">Foto weg</button></div>' +
        "</div>";
    })() : "") +
    "</div>";
}

function zeichneReste(z) {
  let html = "";
  const liste = (arr, titel, hinweis) => {
    if (!arr.length) return "";
    let h = "<h3>" + titel + " (" + arr.length + ")</h3><p class='mini'>" + hinweis + "</p><ul>";
    for (const x of arr) {
      const w = wetteNachId(x.id || x);
      if (w) h += "<li>" + w.spiel + " <span class='mini'>(" + w.wette + ")</span></li>";
    }
    return h + "</ul>";
  };
  if (KT_AUTOBAU) {
    html += liste(z.uebrig, "Uebrig geblieben", "Erfuellen die Mindestquote, aber beim selben Anbieter waren keine drei mehr uebrig.");
    html += liste(z.uebrigNiedrig, "Uebrig, zu niedrige Quote", "Unter der Mindestquote und keine drei für einen eigenen Schein.");
  }
  html += liste(z.doppelt, "Doppel-Spiele", "Dieses Spiel steckt schon mit einer anderen Wette in einem Schein.");
  // Karams eigene Beobachtung: hier stehen die Wetten, die es bei keinem
  // seiner Anbieter gibt. Die kann niemand mehr setzen.
  const nirgends = nirgendsDaListe(z);
  if (nirgends.length) {
    // MIT WEG ZURUECK: ein Merker liess sich bisher nie wieder loeschen.
    // Ein Vertippen haette die Wette fuer immer aus allen Kombinationen
    // gehalten, ohne dass man etwas dagegen tun kann.
    html += "<h3>Kein Anbieter hat sie (" + nirgends.length + ")</h3>" +
      "<p class='mini'>Du hast bei allen vier gesagt, dass es die Wette dort nicht " +
      "gibt. Sie kommt deshalb in keine Kombination mehr. War es ein Versehen, " +
      "hol sie mit dem Knopf zurück.</p><ul>";
    for (const w of nirgends) {
      html += "<li>" + w.spiel + " <span class='mini'>(" + w.wette + ")</span> " +
        '<button onclick="merkerLoeschen(&quot;' + w.id + '&quot;)">doch verfügbar</button></li>';
    }
    html += "</ul>";
  }
  
  document.getElementById("reste").innerHTML = html || "<p class='mini'>Alles verbaut.</p>";
}

// Karams Ziel: im Schnitt ~400 Euro je Kombi. Laesst ein Anbieter nicht
// so viel Einsatz zu, wird derselbe Schein zusaetzlich bei einem weiteren
// Anbieter gesetzt - jeder Teil hat sein eigenes Einsatzfeld.
function zielEinsatz() {
  const f = document.getElementById("ziel");
  const z = f ? (parseFloat(f.value) || 400) : zielGemerkt();
  // Mitschreiben, damit der Mein-Bereich dasselbe Ziel kennt: dort
  // gibt es das Feld nicht, und ohne den Wert waere die Trennung
  // "voll gesetzt / nicht voll" dort schlicht geraten.
  if (f) { try { localStorage.setItem("kt_ziel", String(z)); } catch (e) { } }
  return z;
}

function zielGemerkt() {
  try {
    const w = parseFloat(localStorage.getItem("kt_ziel"));
    if (isFinite(w) && w > 0) return w;
  } catch (e) { }
  return 400;
}

// ---------- Karams Ziel-Logik: 400 Euro je Kombination ----------
// Jede Kombination (Gruppe mit derselben Nummer) soll den Ziel-Einsatz
// erreichen. Laesst ein Anbieter nicht so viel zu, kommen weitere Teile
// dazu: gleiche Wetten bei einem anderen Anbieter, oder - wenn das auch
// nicht geht - eine ANDERE Mischung aus demselben Ordner fuer den Rest.

function gruppeScheine(z, nr) {
  return z.scheine.filter(s => s.nr === nr);
}

function einsatzWert(s, z) {
  if (s.einsatz !== undefined && s.einsatz !== null) return s.einsatz;
  const gruppe = gruppeScheine(z, s.nr);
  const andere = gruppe.filter(x => x.id !== s.id)
    .reduce((p, x) => p + (parseFloat(x.einsatz) || 0), 0);
  const rest = zielEinsatz() - andere;
  return rund2(Math.max(0, rest));
}

function gruppeGesetzt(z, nr) {
  return gruppeScheine(z, nr).reduce((p, s) => {
    const feld = document.getElementById("e_" + s.id);
    // Feld noch nicht gezeichnet: den vorbelegten Wert nehmen, damit die
    // Ziel-Zeile von Anfang an stimmt
    let wert = feld ? parseFloat(feld.value) : parseFloat(s.einsatz);
    if (isNaN(wert)) wert = parseFloat(einsatzWert(s, z));
    return p + (isNaN(wert) ? 0 : wert);
  }, 0);
}

function gruppenText(z, nr) {
  const ziel = zielEinsatz();
  const gesetzt = gruppeGesetzt(z, nr);
  const rest = rund2(ziel - gesetzt);
  const teile = gruppeScheine(z, nr).length;
  if (rest <= 0.004) {
    return '<span class="ziel-gut">&#9989; Ziel erreicht: ' + rund2(gesetzt).toFixed(2) +
      " &euro; von " + ziel.toFixed(2) + " &euro;" + (teile > 1 ? " (in " + teile + " Teilen)" : "") + "</span>";
  }
  return '<span class="ziel-offen">&#9888; Von deinem Ziel <b>' + ziel.toFixed(2) + " &euro;</b> sind erst <b>" +
    rund2(gesetzt).toFixed(2) + " &euro;</b> gesetzt" + (teile > 1 ? " (in " + teile + " Teilen)" : "") +
    " - es fehlen noch <b>" + rest.toFixed(2) + " &euro;</b>. Nimm dafür <b>Rest bei weiterem Anbieter</b> " +
    "oder <b>Andere Mischung für den Rest</b>.</span>";
}

function aktualisiereZielzeilen() {
  const z = liesZustand();
  if (!z) return;
  for (const s of z.scheine) {
    const el = document.getElementById("ziel_" + s.id);
    if (el) el.innerHTML = gruppenText(z, s.nr);
  }
}

function einsatzGeaendert(scheinId, wert, gesamt, gesamtRoh) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (s) {
    const w = parseFloat(wert);
    s.einsatz = isNaN(w) ? 0 : w;
    speichereZustand(z);
  }
  rechneGewinn(scheinId, gesamt, gesamtRoh);
  aktualisiereZielzeilen();
}

// Der moegliche Gewinn, wie der Anbieter ihn zeigt. Leeres Feld = zurueck
// zur Schaetzung. Gemerkt am Schein (s.gewinn), damit er beim Neuzeichnen
// nicht verschwindet.
function gewinnGeaendert(scheinId, wert, gesamt, gesamtRoh) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (s) {
    const w = parseFloat(wert);
    if (isNaN(w) || wert === "") delete s.gewinn; else s.gewinn = w;
    speichereZustand(z);
  }
  rechneGewinn(scheinId, gesamt, gesamtRoh);
}

// Vorbelegung: eigener Eintrag, sonst Einsatz x Quote nach Gebuehr.
function gewinnWert(s, z, gesamt) {
  if (s.gewinn !== undefined && s.gewinn !== null) return s.gewinn;
  return rund2(einsatzWert(s, z) * gesamt).toFixed(2);
}

// Die Gebuehr ist keine Schaetzung mehr, sondern die Differenz zwischen
// dem, was der Schein verspricht (Einsatz x Quote laut Schein), und dem,
// was der Anbieter wirklich auszahlt.
function gebuehrText(einsatz, gewinn, gesamtRoh) {
  const e = parseFloat(einsatz) || 0, g = parseFloat(gewinn) || 0;
  if (!e || !g) return "";
  const brutto = rund2(e * gesamtRoh);
  const geb = rund2(brutto - g);
  if (Math.abs(geb) < 0.005) return "ohne Gebühr (Schein: " + brutto.toFixed(2) + " €)";
  if (geb < 0) return "⚠ mehr als der Schein hergibt (" + brutto.toFixed(2) + " €) - Zahl prüfen";
  return "davon Gebühr <b>" + geb.toFixed(2) + " €</b> (" + rund2(geb / brutto * 100).toFixed(1) + " %, Schein: " + brutto.toFixed(2) + " €)";
}

// Andere Mischung fuer den Rest: neue Wetten aus DEMSELBEN Ordner
function scheinNeuMischen(scheinId) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (!s) return;
  const e = z.einst || einstellungenLesen();
  const rest = rund2(zielEinsatz() - gruppeGesetzt(z, s.nr));
  if (rest <= 0.004) { meldung("Diese Kombination hat ihr Ziel schon erreicht.", "warn"); return; }

  // Spiele, die in DIESER Gruppe schon stecken, kommen nicht noch einmal rein
  const gruppe = gruppeScheine(z, s.nr);
  const gesperrt = new Set();
  for (const g of gruppe) for (const w of g.wetten) {
    const ww = wetteNachId(w.id);
    if (ww) gesperrt.add(spielKennung(ww));
  }
  // Anbieter, die in dieser Gruppe schon dran waren, hinten anstellen
  const benutzt = gruppe.map(g => g.kz);
  const erlaubt = (e.anbieter && e.anbieter.length) ? e.anbieter : KT_ANBIETER_RANG.slice();
  const kz = erlaubt.find(x => !benutzt.includes(x)) || s.kz;

  const frei = satzWetten().filter(w => !istVorbei(anstossFeld(w)) && !gesperrt.has(spielKennung(w)));
  const passend = [];
  const schonDrin = new Set();
  for (const w of frei) {
    const k = spielKennung(w);
    if (schonDrin.has(k)) continue;
    const optIdx = gewaehlteOption(w);
    const q = zielQuote(w, optIdx, kz);
    if (ueberMind(q.echt, mindFuer(w, optIdx, e.mind))) { passend.push({ id: w.id, optIdx: optIdx }); schonDrin.add(k); }
    if (passend.length === 3) break;
  }
  if (passend.length < 3) {
    meldung("<b>Keine andere Mischung möglich:</b> im Ordner sind nicht genug freie Spiele, " +
      "die deine Mindestquote schaffen und noch nicht in dieser Kombination stecken. " +
      "Möglichkeiten: Mindestquote senken, mehr Anbieter anhaken, oder den Rest bei einem " +
      "weiteren Anbieter auf die gleichen Wetten setzen.", "warn");
    return;
  }
  const nummer = gruppe.length + 1;
  z.scheine.splice(z.scheine.indexOf(gruppe[gruppe.length - 1]) + 1, 0, {
    id: s.id + "_m" + nummer, nr: s.nr, kz: kz, art: "variante", teil: nummer,
    variante: true, einsatz: rest,
    wetten: passend, entfernt: []
  });
  speichereZustand(z);
  meldung("<b>Andere Mischung angelegt</b> (Teil " + nummer + " bei " + anbieterName(kz) + "): " +
    "drei andere Spiele aus demselben Ordner, Einsatz " + rest.toFixed(2) +
    " &euro; - damit erreicht diese Kombination ihr Ziel von " + zielEinsatz().toFixed(2) + " &euro;.", "gut");
  zeichne_();
}

function scheinTeilen(scheinId) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (!s) return;
  const e = z.einst || einstellungenLesen();
  const nr = s.nr;
  const teile = z.scheine.filter(x => x.nr === nr);
  const benutzt = teile.map(x => x.kz);
  const frei = (e.anbieter || KT_ANBIETER_RANG.slice()).find(kz => !benutzt.includes(kz));
  if (!frei) { meldung("Alle erlaubten Anbieter haben diesen Schein schon.", "warn"); return; }
  const rest = rund2(zielEinsatz() - gruppeGesetzt(z, nr));
  const kopie = {
    id: s.id + "_t" + (teile.length + 1), nr: nr, kz: frei,
    art: (s.art === "niedrig") ? "niedrig" : "normal",
    teil: teile.length + 1, einsatz: Math.max(0, rest),
    wetten: s.wetten.map(w => ({ id: w.id, optIdx: w.optIdx })),
    entfernt: []
  };
  const pos = z.scheine.indexOf(s);
  z.scheine.splice(pos + teile.length, 0, kopie);
  speichereZustand(z);
  meldung("Schein " + nr + " zusätzlich bei <b>" + anbieterName(frei) + "</b> angelegt (Teil " +
    kopie.teil + ") mit dem offenen Rest von <b>" + Math.max(0, rest).toFixed(2) + " &euro;</b>. " +
    "Geht dort auch nicht die volle Summe, nimm <b>Andere Mischung für den Rest</b>.", "gut");
  zeichne_();
}

// ---------- Eigener Schein: Wetten aus dem offenen Ordner selbst mischen ----------

// ---------- Farbe je Kombination, Anbieter-Zeichen je Zeile ----------
// Karam (01.09.2026): jede gesetzte Kombination bekommt eine eigene helle
// Hintergrundfarbe. Dieselbe Farbe tragen in der Tabelle die Zeilen ihrer
// Wetten; steckt eine Wette in zwei Kombinationen, teilt sich die Zeile
// halb/halb, bei drei gedrittelt. Davor stehen die Zeichen der Anbieter,
// bei denen die Kombination gesetzt wurde (Teile bei weiteren Anbietern
// zaehlen zur selben Kombination, also mehrere Zeichen).
//
// Farbe haengt am STAMM (stammId), nicht an der exakten Kennung: der Teil
// "_t2" beim zweiten Anbieter ist dieselbe Kombination. Vergeben wird in
// der Reihenfolge des Setzens, damit die Farbe beim Neuzeichnen bleibt.
// Bewusst keine Rosa-, Gruen- oder Orangetoene: die bedeuten hier schon
// "unter Mindestquote", "bester Wert" und "offen".
//
// Karam (02.09.): innerhalb EINES Ordners darf sich keine Farbe
// wiederholen, kein Rhythmus. Frueher lief eine 8er-Palette im Kreis.
// Jetzt: 9 erlaubte Farbtoene mal 3 Helligkeiten = 27 eigene Farben je
// Ordner (mehr Staemme hat kein Ordner; erst die 28. bekaeme wieder die
// erste). Der naechste Ordner faengt von selbst wieder vorn an, weil
// kombiKarte immer nur die Eintraege des aktiven Ordners bekommt.
const KOMBI_TOENE = [218, 187, 262, 42, 240, 300, 202, 35, 280];   // Grad: Blau, Tuerkis, Violett, Sand, Indigo, Mauve, Eisblau, Taupe, Lila
const KOMBI_SATT = { 42: 45, 35: 25, 300: 30 };                    // Sand/Taupe/Mauve gedeckt, sonst 62
const KOMBI_LICHT = [88, 81, 74];
function kombiFarbe(n) {
  const ton = KOMBI_TOENE[n % KOMBI_TOENE.length];
  const licht = KOMBI_LICHT[Math.floor(n / KOMBI_TOENE.length) % KOMBI_LICHT.length];
  return "hsl(" + ton + "," + (KOMBI_SATT[ton] || 62) + "%," + licht + "%)";
}

function kombiKarte(liste) {
  const eintraege = (liste || gesetzteEintraege()).slice()
    .sort((a, b) => String(a.zeit || "").localeCompare(String(b.zeit || "")));
  const farbe = {}, kzJe = {}, zeilen = {};
  let n = 0;
  for (const e of eintraege) {
    const st = e.stamm || e.scheinId || ("zeit:" + e.zeit);
    if (!(st in farbe)) { farbe[st] = kombiFarbe(n); n++; kzJe[st] = []; }
    if (e.kz && kzJe[st].indexOf(e.kz) < 0) kzJe[st].push(e.kz);
    for (const t of (e.wetten || [])) {
      if (!t || !t.id) continue;      // Handeingaben (personkombi.js) haben keine Wetten-Kennung
      const k = t.id + "|" + (t.linie || "");
      (zeilen[k] = zeilen[k] || []).push({ stamm: st, kz: e.kz, nummer: e.nummer });
    }
  }
  return { farbe: farbe, kzJe: kzJe, zeilen: zeilen, anzahl: n };
}

// Welche gesetzten Kombinationen enthalten diese Tabellenzeile? Erst
// zeilengenau (Kennung + Linie). Alte Eintraege ohne Linie, oder solche,
// deren Linie zu keiner Zeile mehr passt (Wettentext nachtraeglich
// geaendert), landen bei der ERSTEN Linie - lieber dort als nirgends.
function zeilenTreffer(karte, w, i) {
  const genau = karte.zeilen[w.id + "|" + optionName(w, i)] || [];
  if (genau.length) return genau;
  if (i !== 0) return [];
  const alle = [];
  const linien = (w.o || []).map((_, j) => optionName(w, j));
  for (const k in karte.zeilen) {
    if (k.indexOf(w.id + "|") !== 0) continue;
    const linie = k.slice(w.id.length + 1);
    if (!linie || linien.indexOf(linie) < 0) alle.push.apply(alle, karte.zeilen[k]);
  }
  return alle;
}

// Inline-Stil fuer die Zeile: eine Farbe, oder ein harter Farbverlauf in
// gleich grosse Teile. Inline, weil die Zebra-Regeln (html[data-zeilen]
// tbody tr:nth-child(even)) jede Klassenregel schlagen wuerden.
function hintergrundFuer(karte, treffer) {
  const staemme = [];
  for (const t of treffer) if (staemme.indexOf(t.stamm) < 0) staemme.push(t.stamm);
  if (!staemme.length) return "";
  if (staemme.length === 1) return "background:" + karte.farbe[staemme[0]];
  const teil = 100 / staemme.length;
  const stops = staemme.map((s, k) => karte.farbe[s] + " " + (k * teil).toFixed(1) + "% " + ((k + 1) * teil).toFixed(1) + "%");
  return "background:linear-gradient(90deg," + stops.join(",") + ")";
}

// Kleines Zeichen in der Hausfarbe des Anbieters (eigene Marke, kein
// fremdes Logo - Logobilder muesste Karam erst liefern).
function anbieterZeichen(kz) {
  const kurz = { st: "S", iw: "IW", bw: "bw", b3: "365" };
  return '<span class="ab ab-' + kz + '" title="' + textSicher(anbieterName(kz) || kz) + '">' + (kurz[kz] || kz) + "</span>";
}

// ---------- Was wirklich gesetzt ist ----------
// Karam am 30.08.2026: "Ich will nur die Liste von den Scheinen, die
// gesetzt wurden, aber nix Leeres. Und dann seh ich auch, welche Personen."
// Quelle ist gesetzteEintraege() - BEIDE Ablagen, nur der aktive Ordner.
// liesVerlauf() allein waere bei angemeldetem Nutzer leer.
function zeichneGesetzte() {
  const box = document.getElementById("gesetzteliste");
  if (!box) return;
  const alle = gesetzteEintraege()
    .slice()
    .sort((a, b) => String(b.zeit || "").localeCompare(String(a.zeit || "")));
  // Anbieter-Filter von den Karten oben: nur die Anzeige. Unlesbare
  // Eintraege bleiben IMMER sichtbar - sie duerfen nie verschwinden.
  const liste = (typeof bauAnbieterFilter !== "undefined" && bauAnbieterFilter)
    ? alle.filter(e => e.unlesbar || e.kz === bauAnbieterFilter) : alle;
  if (!liste.length) {
    box.innerHTML = '<p class="mini">' + ((typeof bauAnbieterFilter !== "undefined" && bauAnbieterFilter)
      ? "Bei " + textSicher(anbieterName(bauAnbieterFilter)) + " ist in diesem Ordner nichts gesetzt (" +
        alle.length + " bei anderen Anbietern ausgeblendet - Karte oben nochmal antippen zeigt alle)."
      : "In diesem Ordner ist noch nichts gesetzt.") + "</p>";
    return;
  }
  // Farben IMMER ueber die ungefilterte Liste vergeben - sonst wechselt
  // jede Kombination beim Filtern ihre Farbe (Vergabe nach Reihenfolge).
  const karte = kombiKarte(alle);
  let summe = 0, zeilen = "";
  for (const e of liste) {
    summe += Number(e.einsatz) || 0;
    const st = e.stamm || e.scheinId || ("zeit:" + e.zeit);
    const stil = karte.farbe[st] ? ' style="background:' + karte.farbe[st] + '"' : "";
    if (e.unlesbar) {
      zeilen += '<tr class="gs-unlesbar"><td>' + (e.nummer || "?") + "</td>" +
        '<td colspan="5">Kombination liegt im Konto, ist auf diesem Gerät aber ' +
        "nicht lesbar (Schlüssel fehlt). Sie zählt trotzdem als gesetzt.</td></tr>";
      continue;
    }
    const wetten = (e.wetten || []).map(w =>
      textSicher(w.spiel || "") + (w.linie ? ' <span class="mini">' + textSicher(w.linie) + "</span>" : "")
    ).join("<br>");
    const person = personName(e.ordner);
    // Moeglicher Gewinn: was Karam an der Karte eingetragen hat (so wie der
    // Anbieter ihn zeigt), sonst die Schaetzung Einsatz x Quote.
    const moeg = (Number(e.moeglich) > 0) ? Number(e.moeglich)
      : (Number(e.einsatz) || 0) * (Number(e.quote) || 0);
    zeilen += "<tr" + stil + " data-erg='" + liste.indexOf(e) + "'>" +
      '<td class="gs-nr">' + (e.nummer || "-") + "</td>" +
      "<td>" + (e.kz ? anbieterZeichen(e.kz) + " " : "") + textSicher(e.anbieter || anbieterName(e.kz) || "") + "</td>" +
      '<td class="tb-q">' + (Number(e.einsatz) || 0).toFixed(2) + " &euro;</td>" +
      '<td class="tb-q">' + (Number(e.quote) || 0).toFixed(2) + "</td>" +
      '<td class="tb-q">' + moeg.toFixed(2) + " &euro;" +
        (Number(e.gebuehr) > 0 ? '<div class="mini">Geb&uuml;hr ' + Number(e.gebuehr).toFixed(2) + " &euro;</div>" : "") + "</td>" +
      "<td>" + (person ? textSicher(person) : '<span class="mini">keine Person</span>') + "</td>" +
      '<td class="gs-wetten">' + wetten + "</td></tr>";
  }
  box.innerHTML =
    '<div class="tabellenrand"><table class="tb-tafel gs-tafel"><thead><tr>' +
      "<th>Nr.</th><th>Anbieter</th><th>Einsatz</th><th>Quote</th><th>möglich</th>" +
      "<th>Person</th><th>Wetten</th></tr></thead><tbody>" + zeilen +
    "</tbody></table></div>" +
    '<p class="mini"><b>' + liste.length + " gesetzt</b>, zusammen <b>" +
      summe.toFixed(2) + " &euro;</b> in diesem Ordner" +
      (liste.length !== alle.length ? " (gefiltert: " + (alle.length - liste.length) +
        " bei anderen Anbietern ausgeblendet)" : "") + ". " +
      '<span id="gs_stand_summe"></span></p>';
  zeichneGesetzteAusgaenge(liste);
}

// ---------- Die Tabelle: alles wie im Foto, zum Selberbauen ----------
// Karams Wunsch (30.08.2026): keine fertig gestellten Scheine mehr raten
// muessen, sondern die ganze Tabelle sehen - jede Wettmoeglichkeit als
// eigene Zeile, daneben BEIDE Quoten, und ganz rechts, wie viel auf diese
// Wette schon gesetzt wurde. Anhaken, Anbieter waehlen, Kombi bauen.
function zeichneEigenbau() {
  const box = document.getElementById("eigenbau");
  if (!box) return;
  const alle = satzWetten();
  if (!alle.length) { box.innerHTML = '<p class="mini">Keine Wetten im Ordner.</p>'; return; }
  const ersatzMind = mindWert(liesZustand() || {});

  // Wie viel steht schon auf welcher LINIE? Karam (03.09.): die Summe
  // gehoert an die Zeile der Linie, die wirklich gesetzt wurde - nicht
  // immer an die oberste Zeile der Wette. BEIDE Ablagen, dieser Ordner.
  // Alte Eintraege ohne Linien-Angabe landen weiter bei der ersten Zeile.
  const proLinie = {};
  const gesetztListe = gesetzteEintraege();
  for (const e of gesetztListe)
    for (const t of (e.wetten || [])) {
      const k = t.id + "|" + (t.linie || "");
      proLinie[k] = (proLinie[k] || 0) + (Number(e.einsatz) || 0);
    }
  // Farbe je Kombination und Anbieter-Zeichen je Zeile (siehe kombiKarte)
  const karte = kombiKarte(gesetztListe);

  let zeilen = "", offen = 0;
  for (const w of alle) {
    const vorbei = istVorbei(anstossFeld(w));
    const anzahl = Array.isArray(w.o) ? w.o.length : 0;
    for (let i = 0; i < anzahl; i++) {
      // Die Summe DIESER Linie; Altbestand ohne Linie zaehlt zur ersten.
      const gesetztH = (proLinie[w.id + "|" + optionName(w, i)] || 0) +
        (i === 0 ? (proLinie[w.id + "|"] || 0) : 0);
      if (!vorbei) offen++;
      const treffer = zeilenTreffer(karte, w, i);
      const kzs = [];
      for (const t of treffer) if (t.kz && kzs.indexOf(t.kz) < 0) kzs.push(t.kz);
      const stil = hintergrundFuer(karte, treffer);
      zeilen += '<tr class="' + (vorbei ? "tb-vorbei" : "") + (i ? " tb-weiter" : "") + '"' +
        (stil ? ' style="' + stil + '"' : "") + ">" +
        '<td class="tb-marken">' + kzs.map(anbieterZeichen).join("") + "</td>" +
        '<td class="tb-wahl"><input type="checkbox" class="eb-wahl" value="' + w.id + "|" + i + '"' +
          (vorbei ? " disabled" : "") + ' onchange="ebZaehlen()"></td>' +
        '<td class="mini tb-zeit">' + (i ? "" : zeitText(anstossFeld(w))) + "</td>" +
        '<td class="mini">' + (i ? "" : textSicher(w.liga)) + "</td>" +
        "<td>" + (i ? "" : "<b>" + textSicher(w.spiel) + "</b>") + "</td>" +
        '<td class="tb-wette">' + textSicher(optionName(w, i)) +
          ' <span class="reiter-chip">' + textSicher(w.s) + "</span></td>" +
        '<td class="tb-q">' + Number(w.o[i][1]).toFixed(2) + "</td>" +
        '<td class="tb-q tb-mind">' + mindFuer(w, i, ersatzMind).toFixed(2) +
          (w.o[i].length > 2 ? "" : '<span class="tb-ersatz">*</span>') + "</td>" +
        '<td class="tb-gesetzt">' + (gesetztH ? gesetztH.toFixed(2) + " &euro;" : "") + "</td></tr>";
    }
  }

  const anb = KT_ANBIETER_RANG.map(kz =>
    '<option value="' + kz + '">' + textSicher(anbieterName(kz)) + "</option>").join("");

  box.innerHTML =
    '<div class="tb-leiste">' +
      '<label>Anbieter: <select id="eb_kz">' + anb + "</select></label> " +
      '<button class="haupt" onclick="eigenbauAnlegen()">&#129513; Kombination aus der Auswahl bauen</button> ' +
      '<span id="eb_zaehler" class="mini">nichts angehakt</span>' +
    "</div>" +
    '<div class="tabellenrand"><table class="tb-tafel"><thead><tr>' +
      '<th class="tb-marken" title="Bei welchen Anbietern diese Wette schon gesetzt ist">wo</th>' +
      "<th></th><th>Anstoß</th><th>Liga</th><th>Spiel</th><th>Wette</th>" +
      "<th>Quote</th><th>Mindest</th><th>gesetzt</th></tr></thead><tbody>" +
      zeilen + "</tbody></table></div>" +
    '<p class="mini">' + offen + " Wettmöglichkeiten offen. Jede Linie eines Spiels steht als " +
      "eigene Zeile - du setzt nur eine davon. <b>Quote</b> ist die linke Spalte aus dem Foto, " +
      "<b>Mindest</b> die rechte. Ein <b>*</b> heißt: für diese Zeile stand im Foto keine " +
      "Mindestquote, es gilt der Ersatzwert " + ersatzMind.toFixed(2) + ". " +
      "<b>gesetzt</b> ist die Summe, die auf GENAU DIESE Linie schon draußen ist " +
      "(ältere Einträge ohne Linien-Angabe zählen zur ersten Zeile). " +
      "<b>wo</b> zeigt die Anbieter, bei denen die Wette in einer gesetzten Kombination steckt; " +
      "die Hintergrundfarbe ist die Farbe dieser Kombination (siehe Gesetzt), bei mehreren geteilt.</p>";
  ebZaehlen();
}

// Zeigt laufend, was angehakt ist - und warnt sofort bei zwei Zeilen
// desselben Spiels, statt erst beim Bauen.
function ebZaehlen() {
  const feld = document.getElementById("eb_zaehler");
  if (!feld) return;
  const wahl = [...document.querySelectorAll(".eb-wahl:checked")].map(c => c.value);
  const spiele = new Set(), doppelt = new Set();
  for (const v of wahl) {
    const w = wetteNachId(v.split("|")[0]);
    if (!w) continue;
    const k = spielKennung(w);
    if (spiele.has(k)) doppelt.add(w.spiel);
    spiele.add(k);
  }
  feld.className = "mini" + (doppelt.size ? " tb-warnung" : "");
  feld.innerHTML = wahl.length
    ? wahl.length + " angehakt" +
      (doppelt.size ? " - <b>" + textSicher([...doppelt].join(", ")) +
        "</b> steckt zweimal drin (gleiches Spiel, geht nicht in EINEN Schein)" : "")
    : "nichts angehakt";
}

// Karams Logik-Wunsch (02.09. spaet): eine Kombination, die GENAU SO
// schon gesetzt ist (gleicher Anbieter, gleiche Wetten samt Linie),
// darf nicht unbemerkt noch einmal entstehen. Rueckfrage statt Verbot -
// BEWUSST doppelt setzen bleibt erlaubt (Teile derselben Kombination
// beim selben Anbieter nachlegen ist ein echter Fall).
function schonGesetztGleich(kz, wetten) {
  const soll = (wetten || []).map(x => {
    const w = wetteNachId(x.id);
    return String(x.id) + ":" + (w ? optionName(w, x.optIdx) : "");
  }).sort().join("|");
  if (!soll) return null;
  for (const e of gesetzteEintraege()) {
    if (e.unlesbar || e.kz !== kz) continue;
    const ist = (e.wetten || []).map(t => String(t.id) + ":" + String(t.linie || "")).sort().join("|");
    if (ist && ist === soll) return e;
  }
  return null;
}

function eigenbauAnlegen() {
  const wahl = [...document.querySelectorAll(".eb-wahl:checked")].map(c => c.value);
  if (wahl.length < 2) { meldung("Bitte mindestens zwei Zeilen anhaken.", "warn"); return; }
  const kennungen = new Set();
  const wetten = [];
  for (const v of wahl) {
    const teile = v.split("|");
    const w = wetteNachId(teile[0]);
    if (!w) continue;
    const k = spielKennung(w);
    if (kennungen.has(k)) {
      meldung("<b>" + textSicher(w.spiel) + "</b> ist zweimal angehakt (gleiches Spiel) - " +
        "ein Spiel darf nur einmal in denselben Schein.", "warn");
      return;
    }
    kennungen.add(k);
    wetten.push({ id: w.id, optIdx: parseInt(teile[1], 10) || 0 });
  }
  const kzFeld = document.getElementById("eb_kz");
  const kz = (kzFeld && kzFeld.value) || KT_ANBIETER_RANG[0];
  // Schon genau so gesetzt? Dann erst fragen (mit Nummer), nie stumm doppeln.
  const gleich = schonGesetztGleich(kz, wetten);
  if (gleich && !confirm("ACHTUNG: Genau diese Kombination (gleiche Wetten und Linien) ist bei " +
    anbieterName(kz) + " schon GESETZT" + (gleich.nummer ? " - als Nr. " + gleich.nummer : "") +
    ".\n\nWirklich noch einmal anlegen?")) return;
  const z = liesZustand() || baueAlles();
  const nr = z.scheine.reduce((p, s) => Math.max(p, s.nr || 0), 0) + 1;
  z.scheine.push({ id: "E" + Date.now(), nr: nr, kz: kz, art: "eigen",
    wetten: wetten, entfernt: [] });
  speichereZustand(z);
  // anzeigeNr erst NACH dem Speichern: vorher steht der neue Schein noch
  // nicht in der Liste, ueber die gezaehlt wird.
  meldung("<b>Kombination " + anzeigeNr(z, nr) + "</b> mit " + wetten.length +
    " Wetten bei " + textSicher(anbieterName(kz)) + " angelegt - oben bei den Scheinen: " +
    "Einsatz eintragen, fertig.", "gut");
  zeichne_();
}

// Alter Name, gleiche Sache - damit nichts ins Leere laeuft.
function scheinAufloesen(scheinId) { kombiLoeschen(scheinId); }

// Haengt an DIESER Kennung noch ein Verlaufseintrag? Dann darf das Foto
// nicht weg: der oertliche Verlauf (kombis.js) und der spaetere
// Konto-Import (mein.js) holen es beide ueber "foto_"+scheinId.
function fotoNochGebraucht(scheinId) {
  try {
    for (const e of (liesVerlauf() || [])) if (e.scheinId === scheinId) return true;
  } catch (e) { return true; }   // im Zweifel behalten
  return false;
}

function kombiLoeschen(scheinId) {
  const z = liesZustand();
  if (!z || !z.scheine) return;
  const s = z.scheine.find(x => x.id === scheinId);
  if (!s) return;

  // Hauptkarte nimmt alle Teile mit, eine Teil-Karte nur sich selbst.
  const gruppe = gruppeScheine(z, s.nr);
  const weg = s.teil ? [s] : gruppe;
  const nr = anzeigeNr(z, s.nr);

  // Was davon steht schon im Verlauf? Das ist der gefaehrliche Fall:
  // eine geloeschte Kombination gilt beim naechsten Mischen als NICHT
  // gesetzt, und dieselben Wetten koennten ein zweites Mal rausgehen.
  const gesetzt = gesetzteEintraege();
  const schonDrin = weg.filter(x => gesetzt.some(e => e.scheinId === x.id));

  let frage = s.teil
    ? "Teil " + s.teil + " von Kombination " + nr + " bei " + anbieterName(s.kz) +
      // "Die anderen 1 Teile" - Karam liest das am Handy, das darf nicht holpern.
      " löschen?\n\n" + (gruppe.length === 2
        ? "Der andere Teil bleibt stehen."
        : "Die anderen " + (gruppe.length - 1) + " Teile bleiben stehen.")
    : "Kombination " + nr + " löschen?" +
      (gruppe.length > 1
        ? "\n\nEs fallen ALLE " + gruppe.length + " Teile weg (" +
          [...new Set(gruppe.map(x => anbieterName(x.kz)))].join(", ") + ")."
        : "\n\nAnbieter: " + anbieterName(s.kz) + ".");

  frage += "\n\nDie Wetten werden wieder frei und beim nächsten Mischen neu verteilt.";

  if (schonDrin.length) {
    frage = "ACHTUNG: " + (schonDrin.length === 1 ? "Diese Kombination steht" : schonDrin.length + " Teile stehen") +
      " schon im Verlauf - du hast sie also beim Anbieter gesetzt.\n\n" +
      "Im Verlauf bleibt sie stehen, hier verschwindet sie. Danach weiß der " +
      "Kombi-Bau nicht mehr, dass diese Wetten schon draußen sind, und kann " +
      "sie ein ZWEITES MAL verbauen.\n\n" + frage;
  }

  if (!confirm(frage)) return;

  const raus = new Set(weg.map(x => x.id));
  z.scheine = z.scheine.filter(x => !raus.has(x.id));
  speichereZustand(z);

  // Fotos nur wegwerfen, wenn kein Verlaufseintrag mehr daran haengt -
  // sonst steht der Eintrag ohne Bild da. Ohne dieses Aufraeumen fuellen
  // die Bilder still den Speicher, bis das Speichern scheitert.
  let fotosWeg = 0;
  for (const x of weg) {
    if (fotoNochGebraucht(x.id)) continue;
    if (localStorage.getItem(fotoSchluessel(x.id))) fotosWeg++;
    fotoLoeschen(x.id);
  }

  meldung((s.teil ? "Teil " + s.teil + " von Kombination " : "Kombination ") + nr +
    " gelöscht" + (fotosWeg ? " (mit Foto)" : "") + ". Die Wetten sind wieder frei. " +
    "<b>Die Nummern der folgenden Kombinationen rücken um eins nach vorne.</b>", "gut");

  // Im Einzel-Modus ist damit die eine Kombination weg - gleich die
  // naechste holen, sonst steht Karam vor einer leeren Seite.
  if (typeof einzelnAktiv === "function" && einzelnAktiv() && s.einzeln) {
    if (typeof einzelnNaechste === "function") { einzelnNaechste(); return; }
  }
  zeichne_();
}

function rechneGewinn(scheinId, gesamt, gesamtRoh) {
  const e = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  const gFeld = document.getElementById("g_" + scheinId);
  const z = liesZustand();
  const s = z && z.scheine ? z.scheine.find(x => x.id === scheinId) : null;
  const eigen = s && s.gewinn !== undefined && s.gewinn !== null;
  if (gFeld && !eigen) gFeld.value = rund2(e * gesamt).toFixed(2);
  const geb = document.getElementById("geb_" + scheinId);
  if (geb) geb.innerHTML = gebuehrText(e, gFeld ? gFeld.value : 0,
    (typeof gesamtRoh === "number" && gesamtRoh > 0) ? gesamtRoh : gesamt);
}

// ---------- Verlauf ----------

function liesVerlauf() {
  try { return JSON.parse(localStorage.getItem("verlauf") || "[]"); } catch (e) { return []; }
}
// Gibt true/false zurueck und sagt es laut, wenn der Speicher voll ist.
// Der schon gespeicherte Verlauf bleibt dabei heil - verloren waere nur
// der neue Eintrag, und genau das darf nicht stillschweigend passieren.
function speichereVerlauf(v) {
  try {
    localStorage.setItem("verlauf", JSON.stringify(v));
    return true;
  } catch (e) {
    const text = "Der Speicher dieses Browsers ist voll - der Eintrag konnte NICHT " +
      "gesichert werden. Meist liegt es an den vielen Scheinfotos. Alte Scheine " +
      "loeschen oder ein Konto anlegen, dann liegt alles auf dem Server.";
    if (typeof meldung === "function") meldung(text, "warn");
    else if (typeof weckerBalken === "function") weckerBalken(text, "warn");
    else alert(text);
    return false;
  }
}

function baueVerlaufsEintrag(scheinId) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (!s) return null;
  const einsatz = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  let gesamt = 1, gesamtRoh = 1;
  const wetten = s.wetten.map(eintrag => {
    const w = wetteNachId(eintrag.id);
    const q = zielQuote(w, eintrag.optIdx, s.kz);
    gesamt *= q.echt; gesamtRoh *= q.roh;
    return { id: w.id, spiel: w.spiel, wette: w.wette, linie: optionName(w, eintrag.optIdx),
             an: anstossFeld(w),
             quote: rund2(q.echt), quelle: q.quelle, mind: mindFuer(w, eintrag.optIdx, null) };
  });
  // HIER entsteht die feste Nummer, und nur hier: eine Kombination, die
  // wirklich gesetzt wird, bekommt eine, die es nie wieder gibt. Blosses
  // Bauen und Mischen verbraucht keine.
  const eintrag = {
    zeit: new Date().toISOString(), scheinId: scheinId, kz: s.kz, satz: aktiverSatzId(),
    nummer: nrNaechste(),
    anbieter: anbieterName(s.kz), einsatz: einsatz, quote: rund2(gesamt),
    moeglich: rund2(einsatz * gesamt), wetten: wetten, stand: "offen", notiz: ""
  };
  // Moeglicher Gewinn, wie der Anbieter ihn angezeigt hat (Feld an der
  // Karte). Steht dort etwas, ist DAS der Wert - nicht die Schaetzung.
  // Dazu Quote laut Schein, Brutto und die daraus folgende echte Gebuehr.
  const gFeld = document.getElementById("g_" + scheinId);
  const gewinn = gFeld ? parseFloat(gFeld.value) : NaN;
  eintrag.quoteRoh = rund2(gesamtRoh);
  eintrag.brutto = rund2(einsatz * gesamtRoh);
  if (isFinite(gewinn) && gewinn > 0) eintrag.moeglich = rund2(gewinn);
  eintrag.gebuehr = rund2(eintrag.brutto - eintrag.moeglich);
  // Frueher hing hier die Foto-Auswertung mit dran. Das Foto wird jetzt
  // nur noch mitgenommen, nicht mehr gelesen.
  return { s: s, eintrag: eintrag,
    foto: localStorage.getItem(fotoSchluessel(scheinId)),
    fotoName: localStorage.getItem(fotoSchluessel(scheinId) + "_name") };
}

function scheinMerken(scheinId) {
  const einsatz = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  if (!einsatz) { meldung("Bitte zuerst einen Einsatz eintragen.", "warn"); return; }
  // Doppelt gespeichert heisst doppelt in der Buchhaltung. Karam nennt
  // genau das als Grund fuer den Loeschknopf: "haben wir da doppelt
  // reingemacht". Also lieber einmal fragen.
  const drin = schonGesetzt(scheinId);
  if (drin && !confirm("Diese Kombination steht schon im Verlauf" +
      (drin.nummer ? " als Nr. " + drin.nummer : "") +
      (drin.einsatz ? " mit " + Number(drin.einsatz).toFixed(2) + " Euro" : "") + ".\n\n" +
      "Noch einmal speichern? Dann steht sie zweimal drin und zaehlt in der " +
      "Buchhaltung doppelt.")) return;
  // Eingeloggt? Dann ist die Konto-Ordner-Frage PFLICHT (Karams Regel:
  // jede Kombination muss zugeordnet sein). Ohne Konto wie bisher lokal.
  if (typeof supaNutzer === "function" && window.supa) {
    supaNutzer().then(u => {
      if (u) ordnerWahlZeigen(scheinId, u.id);
      else scheinLokalMerken(scheinId, true);
    });
  } else {
    scheinLokalMerken(scheinId, false);
  }
}

function scheinLokalMerken(scheinId, ohneKonto) {
  const b = baueVerlaufsEintrag(scheinId);
  if (!b) return;
  const v = liesVerlauf();
  v.unshift(b.eintrag);
  speichereVerlauf(v);
  meldung(ohneKonto
    ? "Schein " + b.eintrag.nummer + " auf diesem Gerät gespeichert. Melde dich in <a href=\"mein.html\"><b>Mein Bereich</b></a> an, um ihn ins Konto zu holen und zu teilen."
    : "Schein " + b.eintrag.nummer + " gespeichert. Du findest ihn in <a href=\"mein.html\"><b>Mein Bereich</b></a>.", "gut");
  zeichneVerlauf();
  zeichneKonto();
  // Die Liste "Gesetzt" muss sofort nachziehen, sonst sieht Karam seinen
  // gerade gespeicherten Schein erst nach dem naechsten Laden.
  if (typeof zeichneGesetzte === "function") zeichneGesetzte();
  // ... und die Tabelle gleich mit: dort haengen jetzt die Anbieter-Zeichen
  // und die Kombi-Farben an den gesetzten Eintraegen.
  if (typeof zeichneEigenbau === "function") zeichneEigenbau();
  if (typeof zeichnePanel === "function") zeichnePanel();
  if (typeof einzelnKarteVergessen === "function") einzelnKarteVergessen();
  // Im Einzel-Modus ist die Kombination damit erledigt und wandert ans
  // Ende: sie steht jetzt im Verlauf und wird nie wieder vorgeschlagen.
  if (typeof einzelnAktiv === "function" && einzelnAktiv() && b.s && b.s.einzeln) {
    einzelnNaechste();
  }
}

// ---------- Konto-Ordner-Pflicht beim Speichern ----------
// Karams Ordner sind Accounts/Personen, bei denen gesetzt wurde. Jeder
// gespeicherte Schein MUSS einem zugeordnet werden.

function textSicher(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

async function ordnerWahlZeigen(scheinId, bereichId) {
  const box = document.getElementById("ordnerwahl_" + scheinId);
  if (!box) return;
  box.innerHTML = '<div class="ordnerpflicht mini">Personen werden geladen...</div>';
  const liste = await supaOrdnerLaden(bereichId);
  let knoepfe = "";
  for (const o of liste) {
    knoepfe += '<button onclick="ordnerGewaehlt(\'' + scheinId + "','" + bereichId + "','" + o.id + '\')">' +
      textSicher(o.name) + "</button> ";
  }
  box.innerHTML = '<div class="ordnerpflicht"><b>Bei wem hast du diesen Schein gesetzt?</b> ' +
    '<span class="mini">Jede Kombination gehört zu einer Person, damit du in Mein Bereich ' +
    "siehst, bei wem sie lief. Die Buchhaltung bleibt eine gemeinsame.</span><br>" +
    (liste.length ? knoepfe : '<span class="mini">Du hast noch keine Personen - leg gleich hier die erste an.</span> ') +
    '<input id="neuordner_' + scheinId + '" placeholder="Neue Person, z. B. ein Name"> ' +
    '<button class="haupt" onclick="ordnerNeuUndSpeichern(\'' + scheinId + "','" + bereichId + '\')">Anlegen und speichern</button> ' +
    '<button onclick="ordnerWahlZu(\'' + scheinId + '\')">abbrechen</button></div>';
}

function ordnerWahlZu(scheinId) {
  const box = document.getElementById("ordnerwahl_" + scheinId);
  if (box) box.innerHTML = "";
}

function ordnerGewaehlt(scheinId, bereichId, ordnerId) {
  scheinInsKonto(scheinId, bereichId, ordnerId);
}

async function ordnerNeuUndSpeichern(scheinId, bereichId) {
  const feld = document.getElementById("neuordner_" + scheinId);
  const r = await supaOrdnerAnlegen(bereichId, feld ? feld.value : "");
  if (r.fehler) { meldung("Person nicht hinzugefuegt: " + r.fehler, "warn"); return; }
  scheinInsKonto(scheinId, bereichId, r.ordner.id);
}

function scheinInsKonto(scheinId, bereichId, ordnerId) {
  const b = baueVerlaufsEintrag(scheinId);
  if (!b) return;
  if (!b.eintrag.einsatz) { meldung("Bitte zuerst einen Einsatz eintragen.", "warn"); return; }
  // Doppelklick-Schutz: Panel sofort stilllegen, sonst speichert ein
  // zweiter Klick den Schein doppelt in die Datenbank.
  const box = document.getElementById("ordnerwahl_" + scheinId);
  if (box) {
    if (box.dataset.laeuft === "1") return;
    box.dataset.laeuft = "1";
    box.innerHTML = '<div class="ordnerpflicht mini">Wird gespeichert...</div>';
  }
  // Die feste Nummer wandert mit ins Konto - danach sucht Karam.
  supaScheinAnlegen(bereichId, b.eintrag, b.foto, b.fotoName, ordnerId, b.eintrag.nummer).then(r => {
    if (box) box.dataset.laeuft = "";
    if (r.error) {
      meldung("Nicht ins Konto gespeichert: " + r.error.message, "warn");
      ordnerWahlZeigen(scheinId, bereichId);
      return;
    }
    ordnerWahlZu(scheinId);
    meldung("Kombination " + b.eintrag.nummer + " in dein Konto gespeichert und der Person zugeordnet: " +
      '<a href="mein.html"><b>Mein Bereich</b></a>.', "gut");
    zeichneKonto();
    // Frisch nachladen, sonst haelt der Kombi-Bau die Kombination
    // weiter fuer ungesetzt - genau der Fehler, der Karam aufgefallen ist.
    if (typeof einzelnKarteVergessen === "function") einzelnKarteVergessen();
    kontoScheineLaden();
  });
}

function zeichneVerlauf() {
  verlaufZahlSetzen();
  const ziel = document.getElementById("verlauf");
  if (!ziel) return;
  const v = liesVerlauf();
  if (!v.length) {
    ziel.innerHTML = "<p class='mini'>Noch nichts gemerkt. Bei jedem Schein, den du wirklich " +
      "setzt, auf \"In den Verlauf\" drücken.</p>";
    return;
  }
  const summe = v.reduce((p, x) => p + (x.einsatz || 0), 0);
  let html = "<p><b>" + v.length + " Scheine</b>, eingesetzt insgesamt <b>" + summe.toFixed(2) + " &euro;</b></p>";
  html += "<table><thead><tr><th>Wann</th><th>Anbieter</th><th>Wetten</th><th>Quote</th>" +
    "<th>Einsatz</th><th>Möglich</th><th>Stand</th><th>Notiz</th><th></th></tr></thead><tbody>";
  v.forEach((x, i) => {
    const d = new Date(x.zeit);
    const foto = x.scheinId ? localStorage.getItem(fotoSchluessel(x.scheinId)) : null;
    html += "<tr><td class='mini'>" + String(d.getDate()).padStart(2, "0") + "." +
      String(d.getMonth() + 1).padStart(2, "0") + ". " + String(d.getHours()).padStart(2, "0") +
      ":" + String(d.getMinutes()).padStart(2, "0") + "</td><td>" + textSicherK2(x.anbieter) + "</td>" +
      "<td class='mini'>" + x.wetten.map(t =>
        textSicherK2(t.spiel) + " (" + textSicherK2(t.linie) + ")").join("<br>") +
      (foto ? '<div class="fotoname mini">' +
        (localStorage.getItem(fotoSchluessel(x.scheinId) + "_name") || "") + "</div>" +
        '<div><img src="' + foto + '" class="minifoto"></div>' : "") + "</td>" +
      "<td><b>" + x.quote.toFixed(2) + "</b></td><td>" + x.einsatz.toFixed(2) + " &euro;</td>" +
      "<td>" + x.moeglich.toFixed(2) + " &euro;</td>" +
      "<td><select onchange='standAendern(" + i + ", this.value)'>" +
      ["offen", "gewonnen", "verloren"].map(o =>
        "<option" + (x.stand === o ? " selected" : "") + ">" + o + "</option>").join("") +
      "</select></td>" +
      "<td class='notizzelle'><textarea class='notizfeld' placeholder='Notiz...' " +
      "onchange='notizSpeichern(" + i + ", this.value)'>" + textSicherK2(x.notiz || "") + "</textarea></td>" +
      "<td><button class='knopfweg' title='Diese Kombination aus dem Verlauf loeschen' " +
        "onclick='verlaufLoeschen(" + i + ")'>&#128465;</button></td></tr>";
  });
  html += "</tbody></table>";
  const gew = v.filter(x => x.stand === "gewonnen"), ver = v.filter(x => x.stand === "verloren");
  if (gew.length || ver.length) {
    const ein = gew.concat(ver).reduce((p, x) => p + x.einsatz, 0);
    const aus = gew.reduce((p, x) => p + x.moeglich, 0);
    const saldo = aus - ein;
    html += "<div class='" + (saldo >= 0 ? "merk" : "warn") + "'><b>Bilanz:</b> " + gew.length +
      " gewonnen, " + ver.length + " verloren. Eingesetzt " + ein.toFixed(2) + " &euro;, zurueck " +
      aus.toFixed(2) + " &euro;, Saldo <b>" + (saldo >= 0 ? "+" : "") + saldo.toFixed(2) + " &euro;</b></div>";
  }
  ziel.innerHTML = html;
}

// Kontostand je Anbieter aus dem Verlauf
function zeichneKonto() {
  const ziel = document.getElementById("konto");
  if (!ziel) return;
  const v = liesVerlauf();
  if (!v.length) {
    ziel.innerHTML = "<p class='mini'>Noch keine Scheine im Verlauf. Sobald du Scheine merkst " +
      "und ihren Stand setzt, rechnet hier dein Konto je Anbieter mit.</p>";
    return;
  }
  const konto = {};
  for (const a of ANBIETER) konto[a.kz] = { n: 0, offen: 0, gew: 0, ver: 0,
    eingesetzt: 0, imSpiel: 0, zurueck: 0 };
  for (const x of v) {
    const k = konto[x.kz];
    if (!k) continue;
    k.n++;
    k.eingesetzt += x.einsatz;
    if (x.stand === "offen") { k.offen++; k.imSpiel += x.einsatz; }
    else if (x.stand === "gewonnen") { k.gew++; k.zurueck += x.moeglich; }
    else k.ver++;
  }
  let html = "<table><thead><tr><th>Anbieter</th><th>Scheine</th><th>offen</th>" +
    "<th>gewonnen</th><th>verloren</th><th>eingesetzt</th><th>zurück</th>" +
    "<th>Saldo</th><th>noch im Spiel</th></tr></thead><tbody>";
  let gEin = 0, gZur = 0, gSpiel = 0, gN = 0, gOffen = 0, gGew = 0, gVer = 0;
  for (const a of ANBIETER) {
    const k = konto[a.kz];
    if (!k.n) continue;
    const entschieden = k.eingesetzt - k.imSpiel;
    const saldo = k.zurueck - entschieden;
    gEin += k.eingesetzt; gZur += k.zurueck; gSpiel += k.imSpiel;
    gN += k.n; gOffen += k.offen; gGew += k.gew; gVer += k.ver;
    html += "<tr><td>" + marke(a.kz) + "</td><td>" + k.n + "</td><td>" + k.offen + "</td>" +
      "<td class='gruen'>" + k.gew + "</td><td class='rot'>" + k.ver + "</td>" +
      "<td>" + k.eingesetzt.toFixed(2) + " &euro;</td><td>" + k.zurueck.toFixed(2) + " &euro;</td>" +
      "<td class='" + (saldo >= 0 ? "e-gew" : "e-ver") + "'><b>" + (saldo >= 0 ? "+" : "") +
      saldo.toFixed(2) + " &euro;</b></td><td>" + k.imSpiel.toFixed(2) + " &euro;</td></tr>";
  }
  const gEntschieden = gEin - gSpiel;
  const gSaldo = gZur - gEntschieden;
  html += "</tbody><tfoot><tr><td><b>Gesamt</b></td><td><b>" + gN + "</b></td><td><b>" + gOffen +
    "</b></td><td class='gruen'><b>" + gGew + "</b></td><td class='rot'><b>" + gVer + "</b></td>" +
    "<td><b>" + gEin.toFixed(2) + " &euro;</b></td><td><b>" + gZur.toFixed(2) + " &euro;</b></td>" +
    "<td class='" + (gSaldo >= 0 ? "e-gew" : "e-ver") + "'><b>" + (gSaldo >= 0 ? "+" : "") +
    gSaldo.toFixed(2) + " &euro;</b></td><td><b>" + gSpiel.toFixed(2) + " &euro;</b></td></tr></tfoot></table>";

  const quote = (gGew + gVer) ? (gGew / (gGew + gVer) * 100) : 0;
  const rendite = gEntschieden ? (gSaldo / gEntschieden * 100) : 0;
  html += "<div class='" + (gSaldo >= 0 ? "merk" : "warn") + "'>" +
    "<b>Dein Stand:</b> " + gN + " Scheine gesetzt, davon " + gOffen + " noch offen. " +
    "Von den entschiedenen hast du <b>" + gGew + " von " + (gGew + gVer) + "</b> getroffen (" +
    quote.toFixed(0) + " %). Eingesetzt <b>" + gEntschieden.toFixed(2) + " &euro;</b>, " +
    "zurueckbekommen <b>" + gZur.toFixed(2) + " &euro;</b>, macht <b>" +
    (gSaldo >= 0 ? "+" : "") + gSaldo.toFixed(2) + " &euro;</b>" +
    (gEntschieden ? " (Rendite " + (rendite >= 0 ? "+" : "") + rendite.toFixed(1) + " %)" : "") +
    ". Noch im Spiel: <b>" + gSpiel.toFixed(2) + " &euro;</b>.</div>";
  ziel.innerHTML = html;
}

function notizSpeichern(i, wert) {
  const v = liesVerlauf();
  if (v[i]) { v[i].notiz = wert; speichereVerlauf(v); }
}

function standAendern(i, wert) {
  const v = liesVerlauf();
  if (v[i]) { v[i].stand = wert; speichereVerlauf(v); zeichneVerlauf(); zeichneKonto(); }
}
// MIT RUECKFRAGE: hier steht eine gesetzte Kombination mit echtem Geld.
// Frueher loeschte der Knopf sofort, und rueckgaengig ging gar nichts.
function verlaufLoeschen(i) {
  const v = liesVerlauf();
  const x = v[i];
  if (!x) return;
  const wann = new Date(x.zeit);
  const frage = "Diese Kombination aus dem Verlauf loeschen?\n\n" +
    (x.anbieter || "") + ", " + Number(x.einsatz || 0).toFixed(2) + " Euro, Quote " +
    Number(x.quote || 0).toFixed(2) + "\n" +
    (Array.isArray(x.wetten) ? x.wetten.map(t => t.spiel).join("\n") : "") + "\n\n" +
    "Gemerkt am " + wann.toLocaleString("de-AT") + ".\n" +
    "Das laesst sich nicht rueckgaengig machen.";
  if (!confirm(frage)) return;
  v.splice(i, 1);
  if (!speichereVerlauf(v)) return;
  meldung("Kombination aus dem Verlauf geloescht. <b>Achtung:</b> in deinem Konto " +
    "unter Mein Bereich steht sie weiter - dort musst du sie eigens loeschen.", "gut");
  zeichneVerlauf();
  zeichneKonto();
}

// Fremder Text nie als HTML. Spielnamen und Notizen kommen aus den
// Foto-Importen und aus geteilten Bereichen.
function textSicherK2(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// ---------- Knöpfe ----------

// Ohne Automatikbau raeumt dieser Knopf nur noch auf: er wirft die selbst
// gebauten Kombinationen weg und liest die Tabelle frisch. Deshalb fragt er
// vorher nach - es sind Karams eigene Scheine, keine geratenen.
function neuBauen() {
  if (!KT_AUTOBAU) {
    const z0 = liesZustand();
    const eigene = (z0 && z0.scheine ? z0.scheine : []).filter(s => s.art === "eigen");
    if (eigene.length && !confirm("Das wirft deine " + eigene.length +
        " selbst gebaute(n) Kombination(en) weg und liest die Tabelle frisch ein. " +
        "Schon gespeicherte Kombinationen im Verlauf bleiben. Wirklich?")) return;
  }
  localStorage.removeItem(zustandSchluessel());
  baueAlles();
  meldung(KT_AUTOBAU
    ? "Neu gebaut. Mindestquote je Wette aus dem Foto, Ersatzwert " +
      einstellungenLesen().mind.toFixed(2) + "."
    : "Tabelle frisch eingelesen. Bau deine Kombinationen unten in der Tabelle.", "gut");
  zeichne_();
}

// Welche Kombinationen sind schon gesetzt? Die stehen im Verlauf, und
// zwar mit ihrer Schein-Kennung. Alle Teile derselben Kombination
// (gleiche nr) gelten mit als gesetzt - sonst risse man eine halb
// gesetzte Kombination auseinander.
function gesetzteScheine() {
  const z = liesZustand();
  if (!z || !z.scheine) return [];
  // BEIDE Ablagen (gesetzteEintraege), nicht nur die oertliche: wer
  // angemeldet ist, speichert ausschliesslich ins Konto.
  const staemme = new Set(gesetzteEintraege().map(e => e.stamm));
  if (!staemme.size) return [];
  // Ueber den Stamm vergleichen: ein gesetzter Teil (S7-3_t2) haelt die
  // ganze Kombination fest, damit sie beim Neumischen nicht auseinander-
  // geriessen wird.
  const nummern = new Set();
  for (const s of z.scheine) if (staemme.has(stammId(s.id))) nummern.add(s.nr);
  return z.scheine.filter(s => nummern.has(s.nr));
}

function restNeuMischen() {
  const behalten = gesetzteScheine();
  if (!behalten.length) {
    meldung("Es ist noch nichts gesetzt - dann ist \"neu bauen\" das Richtige.", "warn");
    return;
  }
  const f = document.getElementById("mischzahl");
  if (f) f.value = (parseInt(f.value, 10) || 1) + 1;
  // Den Zustand hier NICHT loeschen: baueAlles liest die gesetzten
  // Kombinationen genau daraus. baueAlles speichert am Ende ohnehin neu.
  const z = baueAlles(true);
  const gruppen = new Set(z.scheine.map(s => s.nr)).size;
  const behaltenGruppen = new Set(behalten.map(s => s.nr)).size;
  meldung("<b>" + behaltenGruppen + " gesetzte Kombination" + (behaltenGruppen === 1 ? "" : "en") +
    " bleiben unberührt</b>, der Rest ist neu gemischt (" + (gruppen - behaltenGruppen) +
    " neue Kombinationen).", "gut");
  zeichne_();
}

function neuMischen() {
  const f = document.getElementById("mischzahl");
  f.value = (parseInt(f.value, 10) || 1) + 1;
  neuBauen();
}

document.addEventListener("DOMContentLoaded", zeichne_);


// Welche Quote sollte Karam als Naechstes eintippen? Jeder Tipp macht aus
// "geschaetzt" ein "belegt" und verbessert damit die naechste Verteilung.
function tippsHtml(z) {
  const tipps = (z.tipps || []).slice(0, 6);
  if (!tipps.length) return "";
  let h = '<div class="tippkasten"><b>&#128161; Das bringt am meisten:</b> diese Quoten beim Anbieter nachschauen und hier eintippen<ul>';
  for (const t of tipps) {
    const w = wetteNachId(t.id);
    h += "<li><b>" + (w ? w.spiel : t.id) + "</b> bei <b>" + anbieterName(t.kz) + "</b>" +
      (t.grund ? ' <span class="mini">' + t.grund + "</span>" : "") + "</li>";
  }
  return h + "</ul></div>";
}

// Springt zum Verlauf und macht ihn kurz sichtbar. Reine Bedienung -
// am Verlauf selbst aendert sich nichts.
function zumVerlauf() {
  const ziel = document.getElementById("verlaufkasten") || document.getElementById("verlauf");
  if (!ziel) return;
  ziel.scrollIntoView({ behavior: "smooth", block: "start" });
  ziel.classList.add("hervor");
  setTimeout(() => ziel.classList.remove("hervor"), 1600);
}

// Wie viele Scheine liegen schon im Verlauf? Fuer die Zahl am Knopf.
function verlaufZahlSetzen() {
  const knopf = document.getElementById("knopf_verlauf");
  if (!knopf) return;
  let n = 0;
  try { n = (liesVerlauf() || []).length; } catch (e) { n = 0; }
  // Die Beschriftung muss zu dem passen, was der Knopf tut: er fuehrt
  // nach Mein Bereich, weil der Verlauf dort liegt und nicht hier.
  knopf.innerHTML = "&#128220; Gesetzte ansehen" +
    (n ? ' <span class="f-zahl">' + n + "</span>" : "");
}
// ============================================================
// REST AUFFUELLEN: jede Kombination auf den Ziel-Einsatz bringen
//
// Karams Lage: eine Kombination bekommt bei Stake nur 200 Euro, weil er
// dort schon gesetzt hat oder eine Einsatz-Grenze gilt. Die restlichen
// 200 sollen dann bei DEMSELBEN Dreier bei einem anderen Anbieter
// stehen, in seiner Reihenfolge: Stake, Interwetten, Bwin, Bet365.
//
// Geprueft wird vor jedem Teil, ob der neue Anbieter die drei Wetten
// ueberhaupt fuehrt und ob jede Quote dort ihre Untergrenze aus der
// Tabelle erreicht. Sonst kommt der naechste dran.
//
// Es ist ausdruecklich in Ordnung, wenn eine Kombination am Ende nicht
// auf den vollen Betrag kommt - dann steht es hinterher da.
// ============================================================

// Fuehrt dieser Anbieter ALLE Wetten des Scheins ueber ihrer Untergrenze?
// mind wird uebergeben, nicht je Wette neu aus dem Speicher gelesen.
function anbieterTraegt(wetten, kz, mind) {
  const grenze = isFinite(mind) ? mind : mindWert(liesZustand() || {});
  for (const eintrag of wetten) {
    // Zuerst der Merker: was er dort nicht hat, traegt er nicht.
    if (nichtDa(eintrag.id, kz)) return false;
    const w = wetteNachId(eintrag.id);
    if (!w) return false;
    const q = zielQuote(w, eintrag.optIdx, kz);
    if (!ueberMind(q.echt, grenze)) return false;
  }
  return true;
}

// Wie viel darf bei diesem Anbieter in DIESER Kombination noch dazu?
// Die Grenze gilt JE KOMBINATION - so steht es in der Seite ("Wie viel
// nimmt dieser Anbieter je Kombination hoechstens an?") und so rechnet
// auch der Verteiler damit. Vorher wurde hier ueber ALLE Kombinationen
// summiert; nach ein paar Scheinen war die Grenze scheinbar voll und es
// wurde gar nichts mehr aufgefuellt.
function grenzeRest(z, kz, nr) {
  const grenzen = (z.einst && z.einst.limits) || null;
  if (!grenzen || !isFinite(grenzen[kz])) return Infinity;
  let schon = 0;
  for (const s of z.scheine) if (s.nr === nr && s.kz === kz)
    schon += parseFloat(einsatzWert(s, z)) || 0;
  return Math.max(0, rund2(grenzen[kz] - schon));
}

function alleAuffuellen() {
  const z = liesZustand();
  if (!z || !z.scheine.length) { meldung("Es gibt noch keine Scheine.", "warn"); return; }
  const ziel = zielEinsatz();
  const reihe = (z.einst && z.einst.anbieter && z.einst.anbieter.length)
    ? z.einst.anbieter : KT_ANBIETER_RANG.slice();

  const nummern = [...new Set(z.scheine.map(s => s.nr))];
  let dazu = 0, voll = 0, offenGeblieben = [];

  for (const nr of nummern) {
    // Immer frisch rechnen: jeder neue Teil aendert die Summe.
    let rest = rund2(ziel - gruppeGesetzt(z, nr));
    if (rest <= 0.004) { voll++; continue; }
    for (const kz of reihe) {
      if (rest <= 0.004) break;
      const teile = z.scheine.filter(x => x.nr === nr);
      if (teile.some(x => x.kz === kz)) continue;        // dort steht dieser Dreier schon
      const vorlage = teile[0];
      if (!vorlage) break;
      if (!anbieterTraegt(vorlage.wetten, kz, mindWert(z))) continue; // fuehrt die Wetten nicht
      const platz = grenzeRest(z, kz, nr);
      if (platz <= 0.004) continue;                      // Einsatz-Grenze schon voll
      const betrag = rund2(Math.min(rest, platz));
      if (betrag <= 0.004) continue;
      z.scheine.splice(z.scheine.indexOf(vorlage) + teile.length, 0, {
        id: vorlage.id + "_t" + (teile.length + 1), nr: nr, kz: kz,
        art: (vorlage.art === "niedrig") ? "niedrig" : "normal",
        teil: teile.length + 1, einsatz: betrag,
        wetten: vorlage.wetten.map(w => ({ id: w.id, optIdx: w.optIdx })),
        entfernt: []
      });
      dazu++;
      rest = rund2(rest - betrag);
    }
    if (rest <= 0.004) voll++;
    else offenGeblieben.push({ nr: nr, rest: rest });
  }

  if (!dazu) {
    meldung("<b>Nichts aufzufüllen.</b> " + (offenGeblieben.length
      ? offenGeblieben.length + " Kombination(en) kommen nicht auf " + ziel.toFixed(2) +
        " &euro;, aber kein weiterer Anbieter führt die Wetten über ihrer Untergrenze " +
        "oder hat noch Platz unter deiner Einsatz-Grenze."
      : "Alle Kombinationen stehen schon auf " + ziel.toFixed(2) + " &euro;."),
      offenGeblieben.length ? "warn" : "gut");
    return;
  }

  speichereZustand(z);
  let text = "<b>" + dazu + " Teil" + (dazu === 1 ? "" : "e") + " bei weiteren Anbietern angelegt.</b> " +
    voll + " von " + nummern.length + " Kombinationen stehen jetzt auf " + ziel.toFixed(2) + " &euro;.";
  if (offenGeblieben.length) {
    const summe = offenGeblieben.reduce((p, x) => p + x.rest, 0);
    text += " Bei " + offenGeblieben.length + " Kombination(en) bleiben zusammen " +
      summe.toFixed(2) + " &euro; offen - dort führt kein weiterer Anbieter die Wetten " +
      "über ihrer Untergrenze, oder deine Einsatz-Grenze ist erreicht.";
  }
  meldung(text, offenGeblieben.length ? "warn" : "gut");
  zeichne_();
}
// ============================================================
// DIE KOMBINATION WANDERT ZUM NAECHSTEN ANBIETER
//
// Sucht in Karams Reihenfolge den naechsten Anbieter, der ALLE Wetten
// dieses Scheins fuehrt (keine davon als "nicht da" gemerkt) und bei dem
// jede echte Quote die Mindestquote erreicht.
// Gibt true zurueck, wenn gewandert wurde - dann bleibt die Wette drin.
// ============================================================
function anbieterWeiterwandern(z, sch, wettId) {
  const erlaubt = (z.einst && z.einst.anbieter && z.einst.anbieter.length)
    ? z.einst.anbieter : KT_ANBIETER_RANG.slice();
  const mind = mindWert(z);

  // Zuerst festhalten, was er gesehen hat.
  nichtDaSetzen(wettId, sch.kz, true);

  const w = wetteNachId(wettId);
  const name = w ? w.spiel : wettId;

  for (const kz of erlaubt) {
    if (kz === sch.kz) continue;
    // Fuehrt er ALLE Wetten dieses Scheins - und ist keine davon als
    // "nicht da" gemerkt?
    let geht = true;
    let grund = "";
    for (const eintrag of sch.wetten) {
      if (nichtDa(eintrag.id, kz)) {
        geht = false;
        const ww = wetteNachId(eintrag.id);
        grund = (ww ? ww.spiel : eintrag.id) + " hat er auch nicht";
        break;
      }
      const ww = wetteNachId(eintrag.id);
      if (!ww) { geht = false; grund = "Wette unbekannt"; break; }
      const q = zielQuote(ww, eintrag.optIdx, kz);
      if (!ueberMind(q.echt, mind)) {
        geht = false;
        grund = ww.spiel + " nur " + rund2(q.echt).toFixed(2) + ", unter " + mind.toFixed(2);
        break;
      }
    }
    if (!geht) continue;

    const alt = sch.kz;
    sch.kz = kz;
    speichereZustand(z);
    meldung("<b>" + anbieterName(alt) + " hat " + name + " nicht.</b> " +
      "Die ganze Kombination steht jetzt bei <b>" + anbieterName(kz) + "</b> - " +
      "alle drei Wetten bleiben drin. Hat der sie auch nicht, sag es wieder, " +
      "dann geht es zum naechsten.", "gut");
    zeichne_();
    return true;
  }

  // Keiner mehr uebrig. Die Wette selbst ist der Grund, wenn sie
  // ueberall als "nicht da" steht.
  if (nirgendsDa(wettId, erlaubt)) {
    meldung("<b>Keiner deiner Anbieter hat " + name + ".</b> " +
      "Die Wette verlaesst die Kombination und steht unten unter " +
      "<b>Kein Anbieter hat sie</b>. Fuer den Schein wird Ersatz gesucht.", "warn");
  } else {
    meldung("<b>" + anbieterName(sch.kz) + " hat " + name + " nicht,</b> und kein anderer " +
      "Anbieter fuehrt alle drei Wetten dieses Scheins ueber der Mindestquote. " +
      "Die Wette wird deshalb aus dem Schein genommen und Ersatz gesucht.", "warn");
  }
  return false;
}

// Alle Wetten des offenen Ordners, die bei KEINEM erlaubten Anbieter zu
// haben sind. Reine Anzeige.
function nirgendsDaListe(z) {
  const erlaubt = (z && z.einst && z.einst.anbieter && z.einst.anbieter.length)
    ? z.einst.anbieter : KT_ANBIETER_RANG.slice();
  return satzWetten().filter(w => nirgendsDa(w.id, erlaubt));
}

// Loescht alle Merker zu EINER Wette - fuer den Fall, dass Karam sich
// vertippt hat oder der Anbieter sie doch wieder anbietet.
function merkerLoeschen(wettId) {
  const m = nichtDaLesen();
  let weg = 0;
  for (const s of Object.keys(m)) if (s.indexOf(wettId + "|") === 0) { delete m[s]; weg++; }
  if (!weg) return;
  try { localStorage.setItem(NICHT_DA_SCHLUESSEL, JSON.stringify(m)); }
  catch (e) { meldung("Speicher voll - konnte den Merker nicht löschen.", "warn"); return; }
  const w = wetteNachId(wettId);
  meldung("<b>" + (w ? w.spiel : wettId) + "</b> ist wieder frei. " +
    "Beim nächsten <b>Scheine neu bauen</b> kann sie wieder in eine Kombination.", "gut");
  zeichne_();
}
// ============================================================
// DAS PANEL OBEN: wo steht was?
//
// Karam will auf einen Blick drei Dinge sehen:
//   1. was gebaut, aber noch NICHT gesetzt ist
//   2. was gesetzt ist, aber den Ziel-Einsatz nicht erreicht hat
//   3. was voll gesetzt ist
// Dazu, wie viel Geld in jeder Gruppe steckt und wie viel noch offen ist.
//
// Die Zahlen entstehen hier NICHT neu: sie kommen aus dem Zustand
// (gebaut) und aus dem Verlauf (gesetzt). Es wird nichts gespeichert.
// ============================================================

// Teile derselben Kombination gehoeren zusammen. Beim Setzen bekommt
// jeder Teil einen eigenen Verlaufseintrag, aber die scheinId verraet
// die Herkunft: S41, S41_t2, S41_m2 gehoeren alle zu S41.
function stammId(scheinId) {
  // MEHRFACH abschneiden: ein Teil kann noch einmal geteilt werden
  // (S7-3_t2_m2). Mit nur einem Schnitt haette der als eigene
  // Kombination gezaehlt und waere ewig "nicht voll gesetzt".
  return String(scheinId || "").replace(/(_(t|m)\d+)+$/, "");
}

function panelZahlen() {
  const ziel = zielEinsatz();
  const z = liesZustand();

  // 1. Gebaut, aber noch nichts gesetzt: alles im Zustand, dessen Stamm
  //    im Verlauf noch gar nicht vorkommt. "Verlauf" heisst BEIDE
  //    Ablagen - Geraet und Konto (siehe gesetzteEintraege).
  const v = gesetzteEintraege();
  const gesetztProStamm = {};
  for (const e of v) {
    if (e.unlesbar) continue;   // eigene Warnung, siehe zeichnePanel
    const s = e.stamm;
    if (!gesetztProStamm[s]) gesetztProStamm[s] = { einsatz: 0, teile: [] };
    gesetztProStamm[s].einsatz += Number(e.einsatz) || 0;
    gesetztProStamm[s].teile.push(e);
  }

  const offeneNrn = new Set();
  for (const s of ((z && z.scheine) || [])) {
    if (gesetztProStamm[stammId(s.id)]) continue;
    offeneNrn.add(s.nr);
  }

  const voll = [], unter = [];
  for (const s of Object.keys(gesetztProStamm)) {
    const g = gesetztProStamm[s];
    g.stamm = s;
    g.fehlt = rund2(Math.max(0, ziel - g.einsatz));
    (g.fehlt <= 0.004 ? voll : unter).push(g);
  }
  unter.sort((a, b) => b.fehlt - a.fehlt);

  const summe = liste => rund2(liste.reduce((p, x) => p + x.einsatz, 0));
  return {
    ziel: ziel,
    offen: { anzahl: offeneNrn.size, moeglich: rund2(offeneNrn.size * ziel) },
    unter: { anzahl: unter.length, gesetzt: summe(unter),
             fehlt: rund2(unter.reduce((p, x) => p + x.fehlt, 0)), liste: unter },
    voll: { anzahl: voll.length, gesetzt: summe(voll) }
  };
}

function zeichnePanel() {
  const kasten = document.getElementById("panel");
  if (!kasten) return;
  const p = panelZahlen();
  const geld = x => Number(x).toFixed(2) + " &euro;";
  const dopp = doppelte();
  // Wie viele Eintraege sind zu viel? Je Gruppe alle ausser dem ersten.
  const doppZuviel = dopp.reduce((q, g) => q + g.length - 1, 0);
  const auf = w => panelAuf === w ? " offen" : "";

  kasten.innerHTML =
    '<div class="pn-kachel pn-offen anklick' + auf("offen") + '" onclick="panelKlappe(\'offen\')">' +
      '<div class="pn-zahl">' + p.offen.anzahl + "</div>" +
      '<div class="pn-titel">noch nichts gesetzt</div>' +
      '<div class="pn-mini">' + geld(p.offen.moeglich) + " möglich bei " +
        geld(p.ziel) + " je Kombination</div></div>" +

    '<div class="pn-kachel pn-unter anklick' + auf("unter") + '" onclick="panelKlappe(\'unter\')">' +
      '<div class="pn-zahl">' + p.unter.anzahl + "</div>" +
      '<div class="pn-titel">gesetzt, aber nicht voll</div>' +
      '<div class="pn-mini">' + geld(p.unter.gesetzt) + " gesetzt, <b>" +
        geld(p.unter.fehlt) + "</b> fehlen noch</div>" +
      (p.unter.anzahl
        ? '<button onclick="event.stopPropagation(); panelRestMischen()">Rest neu mischen</button>'
        : "") + "</div>" +

    '<div class="pn-kachel pn-voll anklick' + auf("voll") + '" onclick="panelKlappe(\'voll\')">' +
      '<div class="pn-zahl">' + p.voll.anzahl + "</div>" +
      '<div class="pn-titel">voll gesetzt</div>' +
      '<div class="pn-mini">' + geld(p.voll.gesetzt) + " im Spiel</div></div>" +

    '<div class="pn-kachel pn-summe">' +
      '<div class="pn-zahl">' + geld(p.unter.gesetzt + p.voll.gesetzt) + "</div>" +
      '<div class="pn-titel">insgesamt gesetzt</div>' +
      '<div class="pn-mini">' + (p.voll.anzahl + p.unter.anzahl) +
        " Kombinationen im Verlauf</div></div>" +

    // Nur zeigen, wenn es wirklich etwas gibt - eine Kachel "0 doppelt"
    // waere jeden Tag da und niemand sieht mehr hin.
    (doppZuviel
      ? '<div class="pn-kachel pn-doppelt anklick' + auf("doppelt") +
        '" onclick="panelKlappe(\'doppelt\')">' +
        '<div class="pn-zahl">' + doppZuviel + "</div>" +
        '<div class="pn-titel">doppelt gespeichert</div>' +
        '<div class="pn-mini">zählt in der Buchhaltung doppelt - antippen und wegräumen</div></div>'
      : "");

  // Karams Anbieter-Blick (02.09.): ganz oben nebeneinander Stake,
  // Interwetten, Bwin, Bet365 - wie viele gesetzte Kombinationen dieses
  // Ordners bei wem liegen. Klick = Filter fuer die Gesetzt-Liste UND
  // die Kombis in Arbeit. Daneben der Misch-Knopf (mischOhnePaare).
  const jeKz = {};
  for (const g of gesetzteEintraege()) {
    if (g.unlesbar || !g.kz) continue;
    if (!jeKz[g.kz]) jeKz[g.kz] = { staemme: new Set(), einsatz: 0 };
    jeKz[g.kz].staemme.add(g.stamm);
    jeKz[g.kz].einsatz += Number(g.einsatz) || 0;
  }
  let ak = '<div class="ak-leiste pn-ak">';
  for (const kz of KT_ANBIETER_RANG) {
    const d = jeKz[kz];
    const n = d ? d.staemme.size : 0;
    ak += '<button class="ak-karte ak-' + kz + " pn-ak-karte" +
      (bauAnbieterFilter === kz ? " ak-aktiv" : "") +
      '" onclick="bauAnbieterFiltern(\'' + kz + '\')" title="Nur ' +
      textSicherK2(anbieterName(kz)) + ' zeigen - nochmal antippen hebt den Filter auf">' +
      '<span class="ak-name">' + textSicherK2(anbieterName(kz)) + "</span>" +
      '<span class="ak-zeile"><b>' + n + "</b> Kombination" + (n === 1 ? "" : "en") + "</span>" +
      '<span class="ak-zeile">' + (d ? d.einsatz : 0).toFixed(2) + " &euro; gesetzt</span></button>";
  }
  const zielWert = parseInt(localStorage.getItem("kt_misch_ziel") || "2", 10) || 2;
  ak += '<span class="pn-mischgruppe">' +
    '<button class="haupt pn-misch" onclick="mischOhnePaare()" title="Je Anbieter: die dort ' +
    'gesetzten Einsätze neu mischen; keine zwei Wetten, die schon zusammen gesetzt waren, ' +
    'kommen wieder zusammen">' +
    "&#127922; Kombis neu mischen<br><span class='mini'>je Anbieter, keine Paare doppelt</span></button>" +
    '<label class="pn-mischziel mini">jeder Einsatz insgesamt<br>' +
    '<input id="pn_misch_ziel" type="number" min="1" max="9" value="' + zielWert +
    '" inputmode="numeric"> mal</label></span></div>';
  kasten.insertAdjacentHTML("afterbegin", ak);

  // Die einzelnen Luecken darunter, damit man sieht, wo es klemmt.
  if (p.unter.anzahl) {
    let h = '<div class="pn-luecken"><b>Wo noch etwas fehlt:</b><ul>';
    for (const g of p.unter.liste.slice(0, 8)) {
      const wo = [...new Set(g.teile.map(t => t.anbieter))].join(", ");
      h += "<li>" + textSicherK2(wo) + ": " + geld(g.einsatz) + " gesetzt, <b>" +
        geld(g.fehlt) + "</b> fehlen</li>";
    }
    if (p.unter.liste.length > 8) h += "<li class='mini'>und " +
      (p.unter.liste.length - 8) + " weitere</li>";
    h += "</ul></div>";
    kasten.insertAdjacentHTML("beforeend", h);
  }

  // Wenn etwas fehlt, muss es DASTEHEN. Ein Panel, das zu wenig zeigt,
  // ist gefaehrlicher als gar keins: Karam setzt dann doppelt.
  const unlesbar = gesetzteEintraege().filter(e => e.unlesbar).length;
  let warnung = "";
  if (unlesbar) warnung +=
    '<div class="pn-warn"><b>&#9888; ' + unlesbar + " Kombination" +
    (unlesbar === 1 ? "" : "en") + " aus deinem Konto " +
    (unlesbar === 1 ? "lässt" : "lassen") + " sich nicht öffnen</b> " +
    "(Schlüssel fehlt oder passt nicht). Was darin steht, weiß dieses Panel " +
    "nicht - die Zahlen oben sind unvollständig. <b>Setz nichts neu, bevor das " +
    "geklärt ist</b>, sonst geht dieselbe Wette zweimal raus.</div>";
  if (!kontoGeladen && window.supa) warnung +=
    '<div class="pn-warn">Die Kombinationen aus deinem Konto konnten nicht ' +
    "geladen werden (Netz oder Anmeldung). Was hier steht, ist unvollständig.</div>";
  if (warnung) kasten.insertAdjacentHTML("beforeend", warnung);

  const liste = panelListeHtml(p);
  if (liste) kasten.insertAdjacentHTML("beforeend", liste);
}

// Karam: was nicht voll gesetzt werden konnte, soll neu gemischt werden -
// dieselbe Kombination geht beim naechsten Anbieter selten genauso durch.
// Deshalb wird NEU gebaut, nicht kopiert. Die schon gesetzten bleiben
// unberuehrt, das macht restNeuMischen ohnehin.
function panelRestMischen() {
  const p = panelZahlen();
  if (!p.unter.anzahl) { meldung("Es fehlt nirgends etwas.", "gut"); return; }
  const frage = "Bei " + p.unter.anzahl + " Kombination(en) fehlen zusammen " +
    p.unter.fehlt.toFixed(2) + " Euro.\n\n" +
    "Ich mische die noch nicht gesetzten Wetten neu, damit du das Geld anders " +
    "unterbringen kannst. Die schon gesetzten Kombinationen bleiben unberührt.\n\n" +
    "Neu mischen?";
  if (!confirm(frage)) return;
  restNeuMischen();
}

// ============================================================
// KOMBIS NEU MISCHEN - JE ANBIETER, OHNE PAAR-WIEDERHOLUNG
// (Karams Auftrag, 02.09., praezisiert am Abend)
//
// Der Gedanke: was bei einem Anbieter gesetzt wurde, GILT bei
// diesem Anbieter - die Anbieter mischen sich nicht mehr. Der
// Knopf nimmt je Anbieter die Einsaetze (Wetten) aus den dort
// GESETZTEN Kombinationen dieses Ordners und wuerfelt daraus neue
// 3er-Kombinationen beim SELBEN Anbieter. Einzige harte Regel:
// keine zwei Wetten, die schon einmal zusammen in einer gesetzten
// Kombination waren, kommen je wieder zusammen in eine. So lassen
// sich dieselben Einsaetze viel oefter spielen (aus 4 Kombis mit
// 12 Einsaetzen werden ueber mehrere Runden bis zu 22 neue).
//
// Jeder Druck baut EINE Runde: jeder Einsatz hoechstens einmal je
// Anbieter. Nochmal druecken = naechste Runde, neue Paarungen.
// Gesetzte Scheine bleiben unberuehrt; ungesetzte werden ersetzt.
// Jedes Spiel weiter nur einmal je Kombination.
// ============================================================

// Der Anbieter-Filter fuer den Kombi-Bau (Karam, 02.09.): Klick auf eine
// der vier Karten oben zeigt in der Gesetzt-Liste und bei den Kombis in
// Arbeit nur diesen Anbieter. Bewusst NUR im Speicher, nicht in
// localStorage - beim naechsten Laden ist wieder alles zu sehen.
let bauAnbieterFilter = "";

function bauAnbieterFiltern(kz) {
  bauAnbieterFilter = (bauAnbieterFilter === kz) ? "" : kz;
  zeichne_();
}

function paarSchluessel(a, b) {
  const x = String(a), y = String(b);
  return x < y ? x + "~" + y : y + "~" + x;
}

// Der Sperr-Schluessel eines Beins: das SPIEL, nicht die Wetten-Kennung.
// Karams Fund vom 03.09.: bei hohem Ziel kamen zwei SPIELE ueber
// verschiedene Linien wieder zusammen - ein [doppelt]-Spiel hat mehrere
// Wetten-Kennungen, die alte Kennungs-Sperre sah das nicht. Ohne
// lesbaren Spieltext (Uralt-Eintraege) faellt der Schluessel auf die
// Kennung zurueck - sperrt dann wenigstens kennungsgenau.
function mischSpielSchluessel(spiel, id) {
  const t = String(spiel || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t || (id ? "id:" + String(id) : "");
}

// Alle SPIEL-Paare aus den GESETZTEN Kombinationen dieses Ordners -
// beide Ablagen (gesetzteEintraege), Teile derselben Kombination zaehlen
// mit. Handeingaben ohne Spiel und Kennung koennen nichts sperren.
function gesetztePaare() {
  const verboten = new Set();
  for (const e of gesetzteEintraege()) {
    const spiele = [...new Set((e.wetten || [])
      .map(t => t && mischSpielSchluessel(t.spiel, t.id)).filter(Boolean))];
    for (let i = 0; i < spiele.length; i++)
      for (let j = i + 1; j < spiele.length; j++)
        verboten.add(paarSchluessel(spiele[i], spiele[j]));
  }
  return verboten;
}

// Wie oft soll jeder Einsatz INSGESAMT gespielt sein? (Karam, 03.09.:
// "alles einmal gesetzt -> ich will alles ein zweites Mal; oder drei,
// vier ..."). Gemerkt je Geraet, Standard 2.
function mischZielLesen() {
  const feld = document.getElementById("pn_misch_ziel");
  let ziel = feld ? parseInt(feld.value, 10) : parseInt(localStorage.getItem("kt_misch_ziel") || "2", 10);
  if (!isFinite(ziel) || ziel < 1) ziel = 2;
  if (ziel > 9) ziel = 9;
  try { localStorage.setItem("kt_misch_ziel", String(ziel)); } catch (e) { }
  return ziel;
}

function mischOhnePaare() {
  const e = einstellungenLesen();
  const z = liesZustand() || baueAlles();
  const gesetzt = gesetzteEintraege().filter(g => !g.unlesbar);
  const ziel = mischZielLesen();

  // Topf je Anbieter: die Einsaetze aus den dort gesetzten Kombinationen,
  // mit NUTZUNGSZAEHLER (wie oft schon gespielt). Wer sein Ziel erreicht
  // hat, wird NICHT mehr gemischt; wer darunter liegt, darf so oft in
  // neue Kombinationen, bis das Ziel steht. Nur laufende Wetten.
  const topfJeKz = {};
  for (const g of gesetzt) {
    if (!g.kz) continue;
    for (const t of (g.wetten || [])) {
      if (!t || !t.id) continue;
      const w = wetteNachId(t.id);
      if (!w || istVorbei(anstossFeld(w))) continue;
      if (nichtDa(t.id, g.kz)) continue;
      const topf = (topfJeKz[g.kz] = topfJeKz[g.kz] || new Map());
      const eintrag = topf.get(String(t.id)) || { w: w, nutzung: 0 };
      eintrag.nutzung++;
      topf.set(String(t.id), eintrag);
    }
  }
  const kzListe = KT_ANBIETER_RANG.filter(kz => topfJeKz[kz] && topfJeKz[kz].size >= 3);
  if (!kzListe.length) {
    meldung("<b>Zum Mischen braucht es gesetzte Kombinationen:</b> der Knopf nimmt je Anbieter " +
      "die Einsätze aus deinen GESETZTEN Kombinationen dieses Ordners und mischt daraus neue - " +
      "beim selben Anbieter. Es ist noch nichts (Laufendes) gesetzt, also gibt es nichts zu mischen.", "warn");
    return;
  }

  // DAS HOECHSTLIMIT (Karam, 03.09.: "das muss anerkannt werden").
  // Reine Mathematik: ein Spiel hat im Topf (S-1) moegliche Partner-
  // Spiele; jede Verwendung verbraucht 2 davon, und kein Spiel-Paar
  // darf sich je wiederholen. Also geht jedes Spiel hoechstens
  // floor((S-1)/2)-mal. Bei 12 Einsaetzen: (12-1)/2 = 5.
  // Liegt Karams Ziel darueber, wird HART gedeckelt und angesagt.
  const maxJeKz = {};
  for (const kz of kzListe) {
    const spiele = new Set([...topfJeKz[kz].values()]
      .map(x => mischSpielSchluessel(x.w.spiel, null)).filter(Boolean));
    maxJeKz[kz] = Math.max(1, Math.floor((spiele.size - 1) / 2));
  }

  // Gesetzte Scheine bleiben, ungesetzte werden ersetzt.
  const behaltenIds = new Set(gesetzteScheine().map(s => s.id));
  const behalten = (z.scheine || []).filter(s => behaltenIds.has(s.id));
  const weg = (z.scheine || []).filter(s => !behaltenIds.has(s.id));
  const wegEigene = weg.filter(s => s.art === "eigen").length;
  const verboten = gesetztePaare();
  const toepfe = kzListe.map(kz => {
    const zielKz = Math.min(ziel, maxJeKz[kz]);
    const offenN = [...topfJeKz[kz].values()].filter(x => x.nutzung < zielKz).length;
    return anbieterName(kz) + ": " + topfJeKz[kz].size + " Einsätze, Höchstlimit " + maxJeKz[kz] +
      "-mal (" + offenN + " unter dem Ziel)";
  }).join("\n  ");
  const gedeckelt = kzListe.filter(kz => ziel > maxJeKz[kz]);
  if (!confirm("Kombis neu mischen - je Anbieter, KEIN Spiel-Paar je zweimal:\n\n" +
    "- Dein Ziel: jeder Einsatz insgesamt " + ziel + "-mal\n" +
    (gedeckelt.length
      ? "- ACHTUNG: das liegt über dem mathematischen Höchstlimit bei " +
        gedeckelt.map(kz => anbieterName(kz) + " (max " + maxJeKz[kz] + ")").join(", ") +
        " - dort wird mit dem Höchstlimit gerechnet.\n"
      : "") +
    "- Töpfe (NUR aus gesetzten Kombinationen):\n  " + toepfe + "\n" +
    "- " + behalten.length + " gesetzte(r) Schein(e) bleiben unberührt\n" +
    "- " + weg.length + " ungesetzte Kombination(en) im Bau werden ersetzt" +
    (wegEigene ? " (davon " + wegEigene + " selbst gebaut!)" : "") + "\n" +
    "- " + verboten.size + " Spiel-Paare aus gesetzten Kombinationen sind gesperrt\n" +
    "- die Anbieter mischen sich nicht: jeder Einsatz bleibt bei seinem Anbieter\n\n" +
    "Mischen?")) return;

  // Je Anbieter mehrere Mischungen probieren, die mit den meisten
  // Kombinationen gewinnt. Die Paar-Sperre gilt ueber ALLE Anbieter
  // (Teile derselben Kombination liegen bei zweien - sonst kaeme
  // dieselbe Dreiergruppe woanders wieder heraus).
  const paare = new Set(verboten);
  // Sicherheitsgurt (Karam, 02.09. spaet): kein neuer Dreier darf einer
  // schon GESETZTEN Kombination gleichen. Die Paar-Sperre verhindert das
  // rechnerisch schon (jedes Paar eines gesetzten Dreiers ist gesperrt) -
  // hier steht die Regel trotzdem ausdruecklich, damit sie auch haelt,
  // falls die Paar-Logik je umgebaut wird.
  // Dreier-Gurt jetzt ebenfalls auf SPIEL-Ebene.
  const dreierGesetzt = new Set();
  for (const g of gesetzt) {
    const sp = [...new Set((g.wetten || [])
      .map(t => t && mischSpielSchluessel(t.spiel, t.id)).filter(Boolean))].sort();
    if (sp.length) dreierGesetzt.add(String(g.kz) + "|" + sp.join("~"));
  }
  const neu = [];
  const zielVerfehlt = [];   // Rest-Topf: wer sein Ziel nicht erreicht, wird GENANNT
  for (const kz of kzListe) {
    const zielKz = Math.min(ziel, maxJeKz[kz]);   // das anerkannte Hoechstlimit
    const info = [...topfJeKz[kz].entries()].map(([id, x]) =>
      ({ id: id, optIdx: gewaehlteOption(x.w), spiel: spielKennung(x.w),
         sKey: mischSpielSchluessel(x.w.spiel, id),
         spielName: x.w.spiel, rest: Math.max(0, zielKz - x.nutzung) }));
    if (!info.some(x => x.rest > 0)) continue;
    let beste = null, bestePaare = null, besteRest = null;
    for (let v = 0; v < 40; v++) {
      // Jeder Einsatz darf so oft hinein, wie ihm zum (gedeckelten)
      // Ziel fehlt.
      const arbeit = new Map(info.map(x => [x.id, x.rest]));
      const p2 = new Set(paare);
      const gruppen = [];
      let sicherung = 200;                 // gegen Endlosschleifen
      while (sicherung-- > 0) {
        // Kandidaten mit Restbedarf, gemischt, hoher Bedarf zuerst -
        // so werden die Untergespielten bevorzugt aufgefuellt.
        const frei = mische(info.filter(x => arbeit.get(x.id) > 0), e.saat * 131 + v * 17 + sicherung)
          .sort((x, y) => arbeit.get(y.id) - arbeit.get(x.id));
        if (frei.length < 3) break;
        let fund = null;
        suche:
        for (let a = 0; a < frei.length; a++) {
          for (let i = a + 1; i < frei.length; i++) {
            const A = frei[a], B = frei[i];
            // Verschiedene SPIELE (beide Lesarten: Tafel-Kennung mit
            // doppel-Verknuepfung UND Spieltext) ...
            if (B.spiel === A.spiel || B.sKey === A.sKey) continue;
            // ... und dieses SPIEL-Paar war noch NIE zusammen gesetzt.
            if (p2.has(paarSchluessel(A.sKey, B.sKey))) continue;
            for (let j = i + 1; j < frei.length; j++) {
              const C = frei[j];
              if (C.spiel === A.spiel || C.spiel === B.spiel) continue;
              if (C.sKey === A.sKey || C.sKey === B.sKey) continue;
              if (p2.has(paarSchluessel(A.sKey, C.sKey))) continue;
              if (p2.has(paarSchluessel(B.sKey, C.sKey))) continue;
              if (dreierGesetzt.has(kz + "|" + [A.sKey, B.sKey, C.sKey].sort().join("~"))) continue;
              fund = [A, B, C];
              break suche;
            }
          }
        }
        if (!fund) break;
        for (const x of fund) arbeit.set(x.id, arbeit.get(x.id) - 1);
        p2.add(paarSchluessel(fund[0].sKey, fund[1].sKey));
        p2.add(paarSchluessel(fund[0].sKey, fund[2].sKey));
        p2.add(paarSchluessel(fund[1].sKey, fund[2].sKey));
        gruppen.push(fund);
      }
      if (!beste || gruppen.length > beste.length) { beste = gruppen; bestePaare = p2; besteRest = arbeit; }
    }
    for (const g of (beste || [])) neu.push({ kz: kz, teile: g });
    if (bestePaare) for (const pk of bestePaare) paare.add(pk);
    if (besteRest) for (const x of info) {
      const r = besteRest.get(x.id);
      if (r > 0) zielVerfehlt.push(anbieterName(kz) + ": " + x.spielName + " (fehlt noch " + r + "x zum Limit " + zielKz + ")");
    }
  }

  if (!neu.length) {
    const limitText = kzListe.map(kz => anbieterName(kz) + " max " +
      Math.min(ziel, maxJeKz[kz]) + "-mal").join(", ");
    meldung("<b>Keine neue Kombination möglich:</b> jedes erlaubte Spiel-Paar dieser Einsätze war " +
      "schon einmal zusammen in einer gesetzten Kombination, oder alle haben ihr Limit erreicht (" +
      textSicher(limitText) + "). Es wurde nichts verändert." +
      (zielVerfehlt.length ? "<br><b>Unter dem Limit bleiben:</b> " +
        textSicher(zielVerfehlt.slice(0, 8).join("; ")) +
        (zielVerfehlt.length > 8 ? " und " + (zielVerfehlt.length - 8) + " weitere" : "") : ""), "warn");
    return;
  }

  // In Scheine uebersetzen - art "normal", wie frueher der Automatikbau.
  const marke = bauMarke();
  let lfd = 0;
  for (const s of behalten) if ((s.nr || 0) > lfd) lfd = s.nr;
  const scheine = behalten.slice();
  for (const g of neu) {
    scheine.push(macheSchein(marke, ++lfd, g.kz,
      g.teile.map(x => ({ id: x.id, optIdx: x.optIdx })), "normal"));
  }
  z.scheine = scheine;
  z.gebautAm = new Date().toISOString();
  speichereZustand(z);
  const jeKzText = kzListe.map(kz =>
    anbieterName(kz) + ": " + neu.filter(g => g.kz === kz).length +
    (ziel > maxJeKz[kz] ? " (Ziel " + ziel + " auf Höchstlimit " + maxJeKz[kz] + " gedeckelt)" : "")).join(", ");
  meldung("<b>&#127922; " + neu.length + " neue Kombination(en) gemischt</b> (" + textSicher(jeKzText) + ") - " +
    "NUR aus gesetzten Einsätzen, jeder bleibt bei seinem Anbieter, und KEIN Spiel-Paar, das " +
    "schon einmal zusammen gesetzt war, steckt wieder in einer. " +
    behalten.length + " gesetzte(r) Schein(e) unberührt." +
    (zielVerfehlt.length
      ? "<br><b>&#9888; Unter dem Limit bleiben:</b> " + textSicher(zielVerfehlt.slice(0, 8).join("; ")) +
        (zielVerfehlt.length > 8 ? " und " + (zielVerfehlt.length - 8) + " weitere" : "") +
        " - für sie gibt es kein erlaubtes Spiel-Paar mehr."
      : " Alle Einsätze erreichen ihr Limit."), "gut");
  zeichne_();
}
// ============================================================
// WAS STEHT SCHON IM VERLAUF? - beide Wege zusammen
//
// Es gibt zwei Ablagen, und bis heute hat der Kombi-Bau nur eine
// gelesen (siehe oben im Kommentar zu diesem Patch):
//   oertlich   localStorage "verlauf"  - wenn niemand angemeldet ist
//   Konto      kt_scheine in der Datenbank - wenn Karam angemeldet ist
// Karam ist angemeldet. Deshalb war fuer den Kombi-Bau immer alles
// "noch nichts gesetzt", obwohl es gesetzt war.
//
// kontoScheine wird einmal beim Laden geholt und nach jedem Speichern
// aufgefrischt. Faellt das Netz aus, bleibt die Liste leer - dann zeigt
// das Panel weniger an, aber es erfindet nichts.
// ============================================================
let kontoScheine = [];
let kontoOrdner = [];       // die Personen, fuer die Namen in der Liste
let kontoGeladen = false;   // false = wir wissen es (noch) nicht
let kontoLauf = null;       // das laufende Laden, damit man darauf warten kann

// Wie heisst die Person? Ohne Namen sagt die Rueckfrage nur "die Person" -
// und wer loescht, muss sehen, WESSEN Guthaben sich aendert.
function personName(ordnerId) {
  if (!ordnerId) return "";
  const o = kontoOrdner.find(x => x.id === ordnerId);
  return o ? String(o.name || "") : "";
}

// Laeuft schon eines? Dann auf DAS warten, statt still nichts zu tun.
function kontoScheineLaden() {
  if (kontoLauf) return kontoLauf;
  if (!window.supa || typeof supaNutzer !== "function" ||
      typeof supaScheineKurz !== "function") return Promise.resolve();
  kontoLauf = (async () => {
    try {
      const u = await supaNutzer();
      if (!u) { kontoScheine = []; kontoOrdner = []; kontoGeladen = false; return; }
      // Der Kombi-Bau speichert immer in den EIGENEN Bereich (siehe
      // scheinMerken: ordnerWahlZeigen(scheinId, u.id)). Also dort auch
      // nachsehen - nicht in geteilten Bereichen.
      const liste = await supaScheineKurz(u.id);
      if (liste && liste._fehler) { kontoGeladen = false; return; }
      kontoScheine = liste || [];
      kontoGeladen = true;
      // Die Personen dazu. Schlaegt das fehl, bleibt nur der Name weg -
      // die Kombinationen selbst sind wichtiger.
      try {
        if (typeof supaOrdnerLaden === "function") {
          const o = await supaOrdnerLaden(u.id);
          if (o && !o._fehler) kontoOrdner = o;
        }
      } catch (e2) { }
    } catch (e) {
      kontoGeladen = false;
    } finally {
      kontoLauf = null;
      if (typeof zeichnePanel === "function") zeichnePanel();
      if (typeof zeichne_ === "function" && kontoGeladen) zeichne_();
    }
  })();
  return kontoLauf;
}

// Alle Kombinationen, die fuer DIESEN Ordner schon gesetzt sind -
// aus beiden Ablagen, in einer Form.
function gesetzteEintraege() {
  const satz = aktiverSatzId();
  const raus = [];
  let oertlich = [];
  try { oertlich = liesVerlauf() || []; } catch (e) { oertlich = []; }
  for (const e of oertlich) {
    // Alte Eintraege ohne satz gehoerten zum damals einzigen Ordner:
    // lieber mitzaehlen als eine gesetzte Kombination uebersehen.
    if (e.satz && e.satz !== satz) continue;
    const eG = { scheinId: e.scheinId, einsatz: Number(e.einsatz) || 0,
                 anbieter: e.anbieter, nummer: e.nummer, kz: e.kz,
                 quote: Number(e.quote) || 0, wetten: e.wetten || [],
                 moeglich: Number(e.moeglich) || 0, gebuehr: Number(e.gebuehr) || 0,
                 zeit: e.zeit, woher: "geraet" };
    // Ohne scheinId kein gemeinsamer Stamm - sonst faellt alles, was
    // keine hat, zu EINER Kombination zusammen und die Einsaetze werden
    // addiert.
    eG.stamm = e.scheinId ? stammId(e.scheinId) : ("zeit:" + e.zeit);
    eG.finger = kombiFinger(eG);
    raus.push(eG);
  }
  for (const x of kontoScheine) {
    const d = x.daten;
    if (!d) {
      // NICHT wegwerfen. supaScheineKurz merkt sich ausdruecklich
      // "unlesbar", damit die Kombination nicht als leer durchgeht -
      // sonst gilt sie als ungesetzt und Karam setzt sie ein zweites Mal.
      // Ohne finger nimmt die Doppelt-Erkennung sie nicht auf, ohne
      // Einsatz verfaelscht sie keine Summe. Sichtbar wird sie ueber
      // unlesbar:true (siehe zeichnePanel).
      raus.push({ scheinId: null, stamm: "db:" + x.id, einsatz: 0,
                  anbieter: null, nummer: x.nummer, kz: null,
                  quote: 0, wetten: [], finger: "", zeit: x.created_at,
                  dbId: x.id, ordner: x.ordner, unlesbar: true, woher: "konto" });
      continue;
    }
    if (d.satz && d.satz !== satz) continue;
    const eK = { scheinId: d.scheinId, einsatz: Number(d.einsatz) || 0,
                 anbieter: d.anbieter, nummer: x.nummer || d.nummer, kz: d.kz,
                 quote: Number(d.quote) || 0, wetten: d.wetten || [],
                 moeglich: Number(d.moeglich) || 0, gebuehr: Number(d.gebuehr) || 0,
                 zeit: x.created_at, dbId: x.id,
                 ordner: x.ordner, woher: "konto" };
    // Uebernommene Alt-Scheine (tuImport) haben keine scheinId - jeder
    // bekommt seinen eigenen Stamm ueber die Datenbank-Kennung.
    eK.stamm = d.scheinId ? stammId(d.scheinId) : ("db:" + x.id);
    eK.finger = kombiFinger(eK);
    raus.push(eK);
  }
  return raus;
}

// Steht GENAU DIESE Karte schon im Verlauf? EXAKTE Kennung, kein Stamm:
// jeder Teil ist beim Anbieter eine eigene Wette und braucht seinen
// eigenen Eintrag. Wer hier ueber den Stamm ginge, wuerde einen noch
// nicht gesetzten zweiten Teil gruen als "erledigt" melden - und eine
// falsche gruene Meldung sieht sich niemand nach.
function schonGesetzt(scheinId, gesetzt) {
  const liste = gesetzt || gesetzteEintraege();
  return liste.find(e => e.scheinId === scheinId) || null;
}
// ============================================================
// DOPPELT GESPEICHERT
//
// Karam: "Einer hab ich es doppelt bei der Person." Passiert leicht:
// speichern, nicht sicher sein, ob es angekommen ist, noch einmal
// speichern. Danach zaehlt die Kombination in der Buchhaltung zweimal
// und das Guthaben der Person ist um einen ganzen Einsatz zu niedrig.
//
// Zwei Eintraege sind dieselbe Kombination, wenn Anbieter und die drei
// Wetten uebereinstimmen. Die LINIE gehoert dazu: dieselben drei Spiele
// mit "ueber 2,5" statt "ueber 3,5" sind eine andere Wette, keine
// Kopie. Der Einsatz gehoert NICHT dazu - wer zweimal speichert, tippt
// beim zweiten Mal leicht etwas anderes ein.
// ============================================================
function kombiFinger(e) {
  const kz = e.kz || "?";
  const teile = (e.wetten || [])
    .map(w => String(w.id) + ":" + String(w.linie === undefined ? "" : w.linie))
    .sort();
  if (!teile.length) return "";      // ohne Wetten kein Vergleich
  // Die PERSON gehoert dazu. Dieselbe Kombination bei zwei Personen ist
  // kein Doppeleintrag, sondern zweimal gesetztes Geld bei zwei Leuten.
  // Ohne sie haette das Panel eine davon zum Loeschen angeboten.
  return String(e.ordner || "-") + "|" + kz + "|" + teile.join("|");
}

// Gruppiert die gesetzten Eintraege nach Fingerabdruck und gibt nur die
// Gruppen zurueck, die mehr als einen Eintrag haben.
function doppelte(liste) {
  const nach = {};
  for (const e of (liste || gesetzteEintraege())) {
    if (!e.finger) continue;
    (nach[e.finger] = nach[e.finger] || []).push(e);
  }
  return Object.keys(nach).filter(f => nach[f].length > 1).map(f => nach[f]);
}

// ============================================================
// DIE KACHELN SIND KNOEPFE
//
// Karam: "wenn ich auf Verlauf oder auf gesetzt-aber-nicht-vollstaendig
// klicke, sollen auch die Kombinationen kommen, die dazugehoeren, und
// ich die auch loeschen koennen."
// ============================================================
let panelAuf = "";   // "", "offen", "unter", "voll", "doppelt"

function panelKlappe(welche) {
  panelAuf = (panelAuf === welche) ? "" : welche;
  zeichnePanel();
  const liste = document.getElementById("panelliste");
  if (liste && panelAuf) liste.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Eine Zeile in der aufgeklappten Liste.
function panelZeile(e, extra) {
  const wer = e.woher === "konto" ? personName(e.ordner) : "";
  const wohin = e.woher === "konto"
    ? (wer ? "in deinem Konto, bei " + textSicherK2(wer) : "in deinem Konto")
    : "nur auf diesem Gerät";
  const spiele = (e.wetten || []).map(w => textSicherK2(w.spiel || w.id)).join(", ");
  return '<li class="pl-zeile">' +
    '<span class="pl-kopf"><b>' + (e.nummer ? "Nr. " + e.nummer : "ohne Nummer") + "</b> " +
      textSicherK2(e.anbieter || "?") + " &middot; " +
      Number(e.einsatz).toFixed(2) + " &euro;" +
      (extra ? ' <span class="pl-warn">' + extra + "</span>" : "") + "</span>" +
    (spiele ? '<span class="pl-spiele mini">' + spiele + "</span>" : "") +
    '<span class="pl-wo mini">' + wohin + "</span>" +
    '<button class="knopfweg" title="Diese Kombination aus dem Verlauf löschen" ' +
      "onclick=\"verlaufEintragLoeschen('" + (e.dbId || "") + "','" +
      String(e.zeit || "").replace(/'/g, "") + "')\">&#128465;</button>" +
    "</li>";
}

function panelListeHtml(p) {
  if (!panelAuf) return "";
  const gesetzt = gesetzteEintraege();
  const dopp = doppelte(gesetzt);
  const doppFinger = new Set();
  // Nur die ZWEITEN und weiteren einer Gruppe sind das Doppelte - der
  // erste ist der richtige Eintrag.
  const spaeter = new Set();
  for (const g of dopp) {
    doppFinger.add(g[0].finger);
    const sortiert = g.slice().sort((a, b) => String(a.zeit || "").localeCompare(String(b.zeit || "")));
    for (let i = 1; i < sortiert.length; i++) spaeter.add(sortiert[i]);
  }

  let titel = "", zeilen = "", hinweis = "";

  if (panelAuf === "offen") {
    // Hier gibt es nichts zu loeschen, was im Verlauf steht - das sind
    // die noch NICHT gesetzten. Der Muelleimer sitzt an der Karte selbst.
    const z = liesZustand();
    const staemme = new Set(gesetzt.map(e => e.stamm));
    const offen = ((z && z.scheine) || []).filter(s => !staemme.has(stammId(s.id)));
    titel = "Noch nichts gesetzt";
    hinweis = "Diese Kombinationen liegen nur im Kombi-Bau, beim Anbieter ist noch " +
      "nichts abgeschickt. Der Mülleimer wirft sie aus dem Bau - im Verlauf " +
      "steht davon ohnehin nichts.";
    // Eine Zeile je KOMBINATION, nicht je Karte - sonst passt die Zahl
    // in der Kachel nicht zur Zahl der Zeilen.
    const nachNr = {};
    for (const s of offen) (nachNr[s.nr] = nachNr[s.nr] || []).push(s);
    zeilen = Object.keys(nachNr)
      .sort((a, b) => anzeigeNr(z, Number(a)) - anzeigeNr(z, Number(b)))
      .map(nr => {
        const teile = nachNr[nr];
        const haupt = teile.find(x => !x.teil) || teile[0];
        const summe = teile.reduce((q, x) => q + (Number(einsatzWert(x, z)) || 0), 0);
        const wo = [...new Set(teile.map(x => anbieterName(x.kz)))].join(", ");
        return '<li class="pl-zeile"><span class="pl-kopf"><b>Kombination ' +
          anzeigeNr(z, haupt.nr) + "</b> " + textSicherK2(wo) + " &middot; " +
          summe.toFixed(2) + " &euro;" +
          (teile.length > 1 ? ' <span class="mini">' + teile.length + " Teile</span>" : "") +
          "</span>" +
          '<button class="knopfweg" title="Diese Kombination aus dem Kombi-Bau löschen" ' +
            "onclick=\"kombiLoeschen('" + haupt.id + "')\">&#128465;</button></li>";
      }).join("");
  } else if (panelAuf === "doppelt") {
    titel = "Doppelt gespeichert";
    const zuviel = dopp.reduce((q, g) => q + g.length - 1, 0);
    hinweis = "Dieselben Wetten beim selben Anbieter stehen mehr als einmal im " +
      "Verlauf. Der <b>erste</b> Eintrag ist der richtige - lösch die späteren. " +
      "Hier stehen alle " + dopp.reduce((q, g) => q + g.length, 0) + " Einträge aus " +
      dopp.length + " Gruppe" + (dopp.length === 1 ? "" : "n") + "; <b>" + zuviel +
      "</b> davon " + (zuviel === 1 ? "ist" : "sind") + " zu viel - das ist die Zahl auf der Kachel.";
    for (const g of dopp) {
      const sortiert = g.slice().sort((a, b) => String(a.zeit || "").localeCompare(String(b.zeit || "")));
      zeilen += sortiert.map((e, i) => panelZeile(e, i === 0 ? "der erste" : "später - das ist das Doppelte")).join("");
    }
  } else {
    // voll oder unter: ueber die Gruppen des Panels gehen
    const ziel = p.ziel;
    const proStamm = {};
    for (const e of gesetzt) {
      if (e.unlesbar) continue;      // die stehen in ihrer eigenen Warnung
      (proStamm[e.stamm] = proStamm[e.stamm] || []).push(e);
    }
    const gruppen = [];
    for (const s of Object.keys(proStamm)) {
      const summe = proStamm[s].reduce((q, x) => q + x.einsatz, 0);
      // GENAU wie in panelZahlen runden, sonst faellt eine Kombination
      // in der Kachel in die eine und in der Liste in die andere Gruppe.
      const fehltR = rund2(Math.max(0, ziel - summe));
      const voll = fehltR <= 0.004;
      if ((panelAuf === "voll") === voll) gruppen.push({ stamm: s, teile: proStamm[s], summe: summe, fehlt: fehltR });
    }
    titel = panelAuf === "voll" ? "Voll gesetzt" : "Gesetzt, aber nicht voll";
    hinweis = "Ein Kasten je Kombination, darin die einzelnen Einträge. Löschen nimmt " +
      "den Eintrag aus dem Verlauf <b>und von der Person</b> - ihr Guthaben steigt " +
      "danach um genau diesen Einsatz.";
    zeilen = gruppen.map(g => {
      const wo = [...new Set(g.teile.map(x => x.anbieter || "?"))].join(", ");
      return '<li class="pl-block"><div class="pl-blockkopf"><b>' + textSicherK2(wo) + "</b> " +
        g.summe.toFixed(2) + " &euro;" +
        (g.teile.length > 1 ? ' <span class="mini">' + g.teile.length + " Einträge</span>" : "") +
        (g.fehlt > 0.004 ? ' <span class="pl-fehlt">es fehlen ' + g.fehlt.toFixed(2) + " &euro;</span>" : "") +
        "</div><ul>" +
        g.teile.map(e => panelZeile(e, spaeter.has(e) ? "doppelt gespeichert" : "")).join("") +
        "</ul></li>";
    }).join("");
  }

  return '<div class="pn-liste" id="panelliste"><b>' + titel + "</b>" +
    '<div class="mini">' + hinweis + "</div>" +
    (zeilen ? "<ul>" + zeilen + "</ul>" : '<p class="mini">Hier ist nichts.</p>') +
    '<button onclick="panelKlappe(\'' + panelAuf + '\')">zuklappen</button></div>';
}

// ============================================================
// EINEN VERLAUFSEINTRAG LOESCHEN
//
// Karam: "wenn ich eine Kombination loesche, wird sie auch von der
// Person geloescht, und das Geld startet wieder beim Account der Person."
// Das Guthaben wird nicht gespeichert, sondern aus den Kombinationen
// gerechnet (personPruefen in mein.js): faellt der Eintrag weg, ist der
// Einsatz sofort wieder frei. Es muss also nichts "zurueckgebucht"
// werden - aber es muss WIRKLICH geloescht werden, und das wird geprueft.
// ============================================================
async function verlaufEintragLoeschen(dbId, zeit) {
  const gesetzt = gesetzteEintraege();
  // Ueber die ZEIT, nicht ueber die scheinId: zwei doppelt gespeicherte
  // Eintraege haben dieselbe scheinId, und dann loescht jeder Klick
  // denselben - waehrend die Rueckfrage die Zahlen des anderen zeigt.
  const e = dbId
    ? gesetzt.find(x => x.dbId === dbId)
    : gesetzt.find(x => x.woher === "geraet" && x.zeit === zeit);
  if (!e) { meldung("Diese Kombination steht nicht mehr im Verlauf.", "warn"); return; }
  const wer = personName(e.ordner);

  if (!confirm(
      "Diese Kombination aus dem Verlauf löschen?\n\n" +
      "   " + (e.nummer ? "Nr. " + e.nummer + "  " : "") + (e.anbieter || "?") +
      "  " + Number(e.einsatz).toFixed(2) + " Euro" +
      (wer ? "\n   bei " + wer : "") + "\n\n" +
      (e.woher === "konto"
        ? "Sie verschwindet aus deinem Konto" + (wer ? " und von " + wer : " und von der Person") +
          ". Das Guthaben " + (wer ? "von " + wer : "der Person") + " steigt danach um " +
          Number(e.einsatz).toFixed(2) + " Euro.\n\n"
        : "Sie verschwindet aus dem Verlauf auf diesem Gerät.\n\n") +
      "Das lässt sich nicht rückgängig machen. Die Wette beim Anbieter " +
      "bleibt davon unberührt - die musst du dort selbst ansehen.")) return;

  if (e.woher === "konto") {
    const r = await supaScheinLoeschen(e.dbId);
    if (r.error) { meldung("Nicht gelöscht: " + r.error.message, "warn"); return; }
    if (!r.data || !r.data.length) {
      meldung("Nicht gelöscht: kein Recht dazu, oder sie war schon weg.", "warn");
      await kontoScheineLaden();
      return;
    }
    // SOFORT aus der oertlichen Liste nehmen. Das Nachladen kann still
    // ausfallen (kein Netz, oder es laeuft gerade schon eines) - dann
    // stuende die geloeschte Kombination weiter im Panel, waehrend die
    // Meldung sagt, das Guthaben sei gestiegen.
    kontoScheine = kontoScheine.filter(x => x.id !== e.dbId);
    await kontoScheineLaden();
  } else {
    // Nur EINEN entfernen, nicht alle mit denselben Werten.
    const alt = liesVerlauf();
    const i = alt.findIndex(x => x.scheinId === e.scheinId && x.zeit === e.zeit);
    if (i < 0) { meldung("Diese Kombination steht nicht mehr im Verlauf.", "warn"); return; }
    alt.splice(i, 1);
    if (!speichereVerlauf(alt)) return;
  }

  // ERST zeichnen, DANN melden: zeichne_ schreibt selbst in denselben
  // Meldungskasten (abgelaufene Wetten) und wuerde die Bestaetigung
  // sofort wieder ueberschreiben.
  zeichne_();
  meldung("Kombination gelöscht." +
    (e.woher === "konto"
      ? " Das Guthaben " + (wer ? "von " + textSicherK2(wer) : "der Person") + " ist um " +
        Number(e.einsatz).toFixed(2) +
        ' Euro höher - nachsehen in <a href="mein.html"><b>Mein Bereich</b></a>.'
      : ""), "gut");
}
// ---------- Ausgaenge in der Gesetzt-Liste ----------
// Liest die Ergebnisse des offenen Ordners (kt_ergebnisse) und schreibt
// je gesetzter Kombination hinter die Wetten, wie sie stehen:
// je Bein ein Zeichen, dazu der Stand der ganzen Kombination.
// NUR ANZEIGE. Verbucht wird ausschliesslich in Mein Bereich
// (ergebnisse.js) - zwei Schreiber fuer denselben Stand waeren die
// naechste Zwei-Ablagen-Falle.
async function zeichneGesetzteAusgaenge(liste) {
  try {
    if (typeof supaErgebnisseLaden !== "function" || typeof kombiAuswerten !== "function") return;
    if (!liste || !liste.length) return;
    const satz = aktiverSatzId();
    const ergListe = await supaErgebnisseLaden([satz]);
    if (!ergListe.length) return;
    const karte = {};
    for (const z of ergListe) karte[z.spiel] = { heim: z.heim, gast: z.gast,
      htHeim: z.ht_heim, htGast: z.ht_gast, karten: z.karten, ecken: z.ecken,
      sonder: z.sonder || {}, stand: z.stand };
    const zeichen = { gewonnen: "&#10004;", halbgewonnen: "&#10004;&#189;",
      push: "&#8617;", abgesagt: "&#8617;", halbverloren: "&#10008;&#189;",
      verloren: "&#10008;", offen: "&#183;", unklar: "?" };
    let gew = 0, ver = 0;
    for (let i = 0; i < liste.length; i++) {
      const zeile = document.querySelector('#gesetzteliste tr[data-erg="' + i + '"]');
      const e = liste[i];
      if (!zeile || !e.wetten || !e.wetten.length) continue;
      const a = kombiAuswerten(e.wetten, e.einsatz, (w) => karte[w.spiel] || null);
      if (a.stand === "gewonnen") gew++; else if (a.stand === "verloren") ver++;
      const zelle = zeile.querySelector(".gs-wetten");
      if (zelle && !zelle.querySelector(".gs-ausgang")) {
        const info = a.beine.map(b => zeichen[b.ausgang] || "?").join(" ");
        const d = document.createElement("div");
        d.className = "gs-ausgang gs-" + a.stand;
        d.innerHTML = info + " &nbsp;" + (a.stand === "gewonnen"
          ? "gewonnen, " + (a.auszahlung || 0).toFixed(2) + " &euro;"
          : (a.stand === "verloren" ? "verloren"
          : (a.stand === "unklar" ? "unklar - in Mein Bereich entscheiden" : "laeuft noch")));
        zelle.appendChild(d);
      }
    }
    const summe = document.getElementById("gs_stand_summe");
    if (summe && (gew || ver)) summe.innerHTML =
      "Nach Ergebnissen: <b>" + gew + " gewonnen</b>, <b>" + ver + " verloren</b>.";
  } catch (e) { /* Anzeige-Beigabe: stoert nie die Liste selbst */ }
}

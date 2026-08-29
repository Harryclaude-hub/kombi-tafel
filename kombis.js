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

// Die Mindestquote gilt fuer ALLE Wetten gleich und steht im Feld oben.
// Sie prueft immer die ECHTE Quote nach Gebuehr. Die Foto-Quote ist nur
// eine Einschaetzung und entscheidet nichts.
function mindWert(z) {
  const m = z && z.einst ? Number(z.einst.mind) : NaN;
  return isFinite(m) && m > 0 ? m : 1.5;
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
function nrAufholen(z) {
  let hoch = nrStand();
  for (const s of ((z && z.scheine) || [])) if ((s.nr || 0) > hoch) hoch = s.nr;
  if (hoch !== nrStand()) nrMerken(hoch);
  return hoch;
}

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
    eingabe.wetten.push({ id: w.id, spiel: spielKennung(w), quoten: quoten, belegt: belegt,
      verf: verf, gesperrt: gesperrt });
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
  for (const k of aus.kombis || []) {
    const lfd = ++lfdIntern;
    const wetten = k.wetten.map(id => ({ id: id, optIdx: optVon[id] || 0 }));
    const teile = (k.teile && k.teile.length) ? k.teile
      : [{ kz: e.anbieter[0], einsatz: e.ziel, sicherheit: "geschaetzt" }];
    teile.forEach((t, ti) => {
      scheine.push({
        nr: lfd,
        id: "S" + lfd + (ti ? "_t" + (ti + 1) : ""),
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
      ueberMind(zielQuote(w, optVon[w.id], kz).echt, e.mind));
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
      scheine.push(macheSchein(lfd, kzN,
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
    if (sch.art === "normal" && q.echt < z.einst.mind - 0.0001) {
      probleme.push(w.spiel + ": dort nur " + rund2(q.echt).toFixed(2) +
        ", unter deiner Mindestquote " + z.einst.mind.toFixed(2));
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

function macheSchein(nr, kz, gruppe, art) {
  return {
    nr: nr,
    id: "S" + nr,
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
    if (ueberMind(q.echt, e.mind))
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
  if (sch.art === "normal" && echt < z.einst.mind - 0.0001) {
    feld.classList.add("fehler");
    meldung("Nicht übernommen: " + roh.toFixed(2) + " bei " + anbieterName(sch.kz) +
      " sind real nur " + rund2(echt).toFixed(2) + ", das liegt unter deiner Mindestquote " +
      z.einst.mind.toFixed(2) + ". Entweder du nimmst die Wette raus, oder du senkst oben die Mindestquote.",
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
      nachgerückt + " Ersatz nachgerückt. Dein Verlauf in Mein Bereich bleibt unberuehrt.", "gut");
  }

  // Einstellungen zurueckspiegeln
  document.getElementById("mind").value = z.einst.mind;
  document.querySelectorAll(".anbwahl").forEach(c => { c.checked = z.einst.anbieter.includes(c.value); });

  const normal = z.scheine.filter(s => s.art === "normal" || s.art === "eigen" || s.art === "variante");
  const niedrig = z.scheine.filter(s => s.art === "niedrig");
  const verbaut = z.scheine.reduce((p, s) => p + s.wetten.length, 0);

  const gruppenZahl = new Set(normal.map(s => s.nr)).size;
  document.getElementById("uebersicht").innerHTML =
    "<b>" + gruppenZahl + " Kombinationen über der Mindestquote</b> (" + z.einst.mind.toFixed(2) + ")" +
    ", dazu <b>" + niedrig.length + " Scheine mit zu niedrigen Quoten</b>. " +
    verbaut + " Plätze belegt bei " + z.gesamtOffen + " offenen Wetten (jede darf in " +
    "höchstens zwei Scheinen stecken), " + (z.uebrig.length + z.uebrigNiedrig.length) +
    " blieben übrig." + tippsHtml(z);

  document.getElementById("scheine").innerHTML =
    (normal.length ? normal.map(s => scheinHtml(s, z)).join("") :
      '<div class="warnkern">Keine Scheine über der Mindestquote. Senk sie oben, oder trag ' +
      'in der Kombi-Tafel echte Quoten ein.</div>');

  document.getElementById("niedrig").innerHTML =
    (niedrig.length ? niedrig.map(s => scheinHtml(s, z)).join("") :
      '<p class="mini">Keine Wetten unter der Mindestquote.</p>');

  zeichneReste(z);
  zeichneVerlauf();
  zeichneKonto();
  if (typeof einzelnZeichnen === "function") einzelnZeichnen();
}

// Die sichtbare Nummer: 1 bis zur Zahl der gebauten Kombinationen.
// Teile derselben Kombination teilen sich eine Nummer.
function anzeigeNr(z, nr) {
  const alle = [...new Set((z.scheine || []).map(s => s.nr))].sort((a, b) => a - b);
  const i = alle.indexOf(nr);
  return i < 0 ? nr : (i + 1);
}

function scheinHtml(s, z) {
  const mind = mindWert(z);
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
    const unter = !ueberMind(q.echt, mind);
    const opt = w.o[eintrag.optIdx][0];
    const eigen = liesEingabe(w.id, opt, s.kz);
    return "<tr" + (unter ? ' class="unterquote"' : "") + ">" +
      "<td class='s-zeit'>" + zeitText(anstossFeld(w)) + "</td>" +
      "<td class='s-spiel'>" + w.spiel + '<div class="mini">' + w.liga + "</div></td>" +
      "<td class='s-wette'>" + w.wette.split("(")[0].trim() + " " + opt +
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
      "<td class='s-mind'>" + (Math.ceil(mind * GEBUEHREN_TEILER[s.kz] * 100) / 100).toFixed(2) +
        (GEBUEHREN_TEILER[s.kz] !== 1
          ? '<div class="mini">= real ' + mind.toFixed(2) + "</div>" : "") + "</td>" +
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
    '<span class="s-wo"><span class="s-wo-name">' + anbieterName(s.kz) +
    '</span><span class="s-wo-mini">hier suchen</span></span>' +
    "Kombination " + anzeigeNr(z, s.nr) +
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
    '<span class="s-quote">' + s.wetten.length + "er, Gesamtquote <b>" + rund2(gesamt).toFixed(2) + "</b>" +
    (GEBUEHREN_TEILER[s.kz] !== 1 ? ' <span class="mini">(Schein zeigt ' + rund2(gesamtRoh).toFixed(2) + ")</span>" : "") +
    (alleFest ? ' <span class="mini gruen">alle Quoten selbst geprüft</span>'
              : ' <span class="mini">teils noch Foto-Quoten</span>') +
    "</span></div>" +
    "<table class='s-tab'><thead><tr><th>Anstoss</th><th>Spiel</th><th>Wette</th>" +
    "<th>Ziel-Quote</th><th>mind.</th><th>Deine Quote</th><th></th></tr></thead><tbody>" +
    zeilen + "</tbody></table>" +
    (s.entfernt.length ? '<div class="s-raus-liste">Rausgenommen: ' +
      s.entfernt.map(e => (wetteNachId(e.id) ? wetteNachId(e.id).spiel : e.id) +
        " (" + e.grund + ")").join(", ") + "</div>" : "") +
    "<div class='s-fuss'>Einsatz <input type='number' step='0.5' min='0' class='einsatz' " +
      "id='e_" + s.id + "' value='" + einsatzWert(s, z) + "' oninput=\"einsatzGeaendert('" + s.id + "', this.value, " + gesamt + ")\"> &euro;" +
      ' &nbsp;&rarr;&nbsp; moeglich <b id="g_' + s.id + '">' + rund2(einsatzWert(s, z) * gesamt).toFixed(2) + " &euro;</b>" +
      '<button class="merken" onclick="scheinMerken(\'' + s.id + '\')">In den Verlauf</button>' +
      '<button onclick="scheinTeilen(\'' + s.id + '\')" title="Der Anbieter lässt nicht mehr zu? Gleiche Wetten zusätzlich bei einem weiteren Anbieter setzen.">&#10133; Rest bei weiterem Anbieter</button>' +
      '<button onclick="scheinNeuMischen(\'' + s.id + '\')" title="Geht auch beim anderen Anbieter nicht mehr? Andere Wetten aus dem Ordner zu einer neuen Mischung, damit der Rest trotzdem gesetzt wird.">&#128256; Andere Mischung für den Rest</button>' +
      (s.wetten.length !== 3 || s.art === "eigen" || s.teil
        ? '<button class="aufloesen" onclick="scheinAufloesen(\'' + s.id + '\')">Schein auflösen</button>'
        : "") +
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
  html += liste(z.uebrig, "Uebrig geblieben", "Erfuellen die Mindestquote, aber beim selben Anbieter waren keine drei mehr uebrig.");
  html += liste(z.uebrigNiedrig, "Uebrig, zu niedrige Quote", "Unter der Mindestquote und keine drei für einen eigenen Schein.");
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
  return f ? (parseFloat(f.value) || 400) : 400;
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

function einsatzGeaendert(scheinId, wert, gesamt) {
  const z = liesZustand();
  const s = z.scheine.find(x => x.id === scheinId);
  if (s) {
    const w = parseFloat(wert);
    s.einsatz = isNaN(w) ? 0 : w;
    speichereZustand(z);
  }
  rechneGewinn(scheinId, gesamt);
  aktualisiereZielzeilen();
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
    if (ueberMind(q.echt, e.mind)) { passend.push({ id: w.id, optIdx: optIdx }); schonDrin.add(k); }
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

function zeichneEigenbau() {
  const box = document.getElementById("eigenbau");
  if (!box) return;
  const offen = satzWetten().filter(w => !istVorbei(anstossFeld(w)));
  if (!offen.length) { box.innerHTML = '<p class="mini">Keine offenen Wetten im Ordner.</p>'; return; }
  let zeilen = "";
  for (const w of offen) {
    const optIdx = gewaehlteOption(w);
    zeilen += '<label class="eb-zeile"><input type="checkbox" class="eb-wahl" value="' + w.id + '"> ' +
      "<b>" + w.spiel + "</b> <span class='mini'>" + w.wette + " (" + w.o[optIdx][0] + "), Foto-Quote " +
      w.o[optIdx][1].toFixed(2) + ", " + zeitText(anstossFeld(w)) + "</span></label>";
  }
  box.innerHTML = '<div class="eigenbaukasten">' + zeilen +
    '<p><button class="haupt" onclick="eigenbauAnlegen()">&#129513; Eigenen Schein aus den angehakten Wetten anlegen</button></p></div>';
}

function eigenbauAnlegen() {
  const gewaehlt = [...document.querySelectorAll(".eb-wahl:checked")].map(c => c.value);
  if (gewaehlt.length < 2) { meldung("Bitte mindestens zwei Wetten anhaken.", "warn"); return; }
  const kennungen = new Set();
  for (const id of gewaehlt) {
    const w = wetteNachId(id);
    if (!w) continue;
    const k = spielKennung(w);
    if (kennungen.has(k)) {
      meldung("<b>" + w.spiel + "</b> ist zweimal angehakt (gleiches Spiel) - " +
        "ein Spiel darf nur einmal in denselben Schein.", "warn");
      return;
    }
    kennungen.add(k);
  }
  const z = liesZustand() || baueAlles();
  // Auch der Eigenbau nimmt nur eine interne Nummer.
  const nr = z.scheine.reduce((p, s) => Math.max(p, s.nr || 0), 0) + 1;
  z.scheine.push({
    // Der selbst gebaute Schein geht an den ersten erlaubten Anbieter -
    // das ist jetzt Stake, frueher stand hier Bwin als Rueckfall.
    id: "E" + Date.now(), nr: nr, kz: (z.einst && z.einst.anbieter && z.einst.anbieter[0]) || KT_ANBIETER_RANG[0],
    art: "eigen",
    wetten: gewaehlt.map(id => ({ id: id, optIdx: gewaehlteOption(wetteNachId(id)) })),
    entfernt: []
  });
  speichereZustand(z);
  meldung("<b>Eigener Schein " + nr + "</b> mit " + gewaehlt.length + " Wetten angelegt - " +
    "oben bei den Scheinen: Anbieter wählen, Einsatz eintragen, fertig.", "gut");
  zeichne_();
}

function scheinAufloesen(scheinId) {
  const z = liesZustand();
  z.scheine = z.scheine.filter(s => s.id !== scheinId);
  speichereZustand(z);
  meldung("Schein aufgelöst. Die Wetten sind wieder frei und werden beim nächsten " +
    "Anders mischen neu verteilt.", "gut");
  zeichne_();
}

function rechneGewinn(scheinId, gesamt) {
  const e = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  document.getElementById("g_" + scheinId).textContent = rund2(e * gesamt).toFixed(2) + " €";
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
  let gesamt = 1;
  const wetten = s.wetten.map(eintrag => {
    const w = wetteNachId(eintrag.id);
    const q = zielQuote(w, eintrag.optIdx, s.kz);
    gesamt *= q.echt;
    return { id: w.id, spiel: w.spiel, wette: w.wette, linie: w.o[eintrag.optIdx][0],
             quote: rund2(q.echt), quelle: q.quelle };
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
  // Frueher hing hier die Foto-Auswertung mit dran. Das Foto wird jetzt
  // nur noch mitgenommen, nicht mehr gelesen.
  return { s: s, eintrag: eintrag,
    foto: localStorage.getItem(fotoSchluessel(scheinId)),
    fotoName: localStorage.getItem(fotoSchluessel(scheinId) + "_name") };
}

function scheinMerken(scheinId) {
  const einsatz = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  if (!einsatz) { meldung("Bitte zuerst einen Einsatz eintragen.", "warn"); return; }
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
    meldung("Schein " + b.eintrag.nummer + " in dein Konto gespeichert und der Person zugeordnet: " +
      '<a href="mein.html"><b>Mein Bereich</b></a>.', "gut");
    zeichneKonto();
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

function neuBauen() {
  localStorage.removeItem(zustandSchluessel());
  baueAlles();
  meldung("Neu gebaut mit Mindestquote " + einstellungenLesen().mind.toFixed(2) + ".", "gut");
  zeichne_();
}

// Welche Kombinationen sind schon gesetzt? Die stehen im Verlauf, und
// zwar mit ihrer Schein-Kennung. Alle Teile derselben Kombination
// (gleiche nr) gelten mit als gesetzt - sonst risse man eine halb
// gesetzte Kombination auseinander.
function gesetzteScheine() {
  const z = liesZustand();
  if (!z || !z.scheine) return [];
  const satz = aktiverSatzId();
  const ids = new Set();
  for (const e of liesVerlauf()) if (e.satz === satz && e.scheinId) ids.add(e.scheinId);
  if (!ids.size) return [];
  const nummern = new Set();
  for (const s of z.scheine) if (ids.has(s.id)) nummern.add(s.nr);
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
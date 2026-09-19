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

// Karams Reihenfolge, an EINER Stelle. Stake zuerst, danach Bet365,
// seit 06.09.2026 Admiral und seit 11.09.2026 Betway ganz zuletzt.
// Bwin und Sportingbet sind derselbe Anbieter, deshalb steht dort nur bw.
const KT_ANBIETER_RANG = ["st", "iw", "bw", "b3", "ad", "bt", "mb"];   // ad = Admiral (06.09.2026), bt = Betway (NEU 11.09.2026)

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
        gebautAm: new Date().toISOString(),   // Karam: an jeder Karte Datum und Uhrzeit
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
// ============================================================
// ANBIETER-WECHSEL ZIEHT DEN VERLAUF NACH (Karam, 03.09.)
//
// Karams Fall: eine Kombination lag versehentlich auf Stake, in
// Wahrheit war es Interwetten. Er stellt die Karte auf Interwetten um -
// und oben stehen weiter neun bei Stake und eine bei Interwetten. Grund:
// anbieterWechseln hat nur den Schein IM BAU umgestellt. Die Zahlen oben
// und die Buchhaltung kommen aber aus dem VERLAUF, und dort stand noch
// Stake. Auch beim Konto-Eintrag der Person blieb Stake stehen.
//
// Deshalb wird der Wechsel jetzt ueberall nachgezogen, wo diese GENAUE
// Kennung im Verlauf steht: oertlich (localStorage "verlauf") und im
// Konto (kt_scheine, dafuer muss "daten" neu verschluesselt werden).
//
// WAS BEWUSST STEHEN BLEIBT: Einsatz, Quote, moeglicher Gewinn und
// Gebuehr. Das sind die Zahlen, die beim Anbieter WIRKLICH auf dem
// Schein standen - die aendern sich nicht dadurch, dass hier das
// falsche Etikett klebte. Wer sie neu rechnen liesse, wuerde eine
// echte Zahl durch eine geschaetzte ersetzen.
async function verlaufAnbieterNachziehen(scheinId, neuKz) {
  const raus = { geraet: 0, konto: 0, fehler: [] };
  const name = anbieterName(neuKz);

  // 1. Oertlicher Verlauf
  try {
    const v = liesVerlauf();
    let dran = 0;
    for (const e of v) {
      if (e.scheinId !== scheinId || e.kz === neuKz) continue;
      e.kz = neuKz; e.anbieter = name; dran++;
    }
    if (dran) {
      if (speichereVerlauf(v)) raus.geraet = dran;
      else raus.fehler.push("Gerätespeicher voll - der Verlauf auf diesem Gerät blieb, wie er war");
    }
  } catch (e) {
    raus.fehler.push("Verlauf auf dem Gerät: " + (e && e.message ? e.message : "Fehler"));
  }

  // 2. Konto. Ohne Anmeldung gibt es hier nichts zu tun - das ist kein
  //    Fehler, sondern der Normalfall auf einem fremden Geraet.
  if (window.supa && typeof supaScheinDatenSchreiben === "function" &&
      typeof supaNutzer === "function" && typeof kryptoBereich === "function") {
    try {
      const u = await supaNutzer();
      if (u) {
        const key = await kryptoBereich(u.id);
        for (const x of kontoScheine) {
          const d = x.daten;
          if (!d || d.scheinId !== scheinId || d.kz === neuKz) continue;
          d.kz = neuKz; d.anbieter = name;
          const r = await supaScheinDatenSchreiben(x.id, key, d);
          // Die 0-Zeilen-Falle: an RLS gescheitert sieht aus wie geschafft.
          if (r.error) { raus.fehler.push("Nr. " + (x.nummer || "?") + ": " + r.error.message); continue; }
          if (!r.data || !r.data.length) {
            raus.fehler.push("Nr. " + (x.nummer || "?") + ": kein Recht dazu"); continue;
          }
          raus.konto++;
        }
        if (raus.konto) await kontoScheineLaden();
      }
    } catch (e) {
      raus.fehler.push("Konto: " + (e && e.message ? e.message : "Fehler"));
    }
  }
  return raus;
}

async function anbieterWechseln(scheinId, neuKz) {
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

  // Steht diese GENAUE Kombination schon im Verlauf, muss der Wechsel
  // auch dort ankommen - sonst zaehlen die Anbieter-Kacheln oben und die
  // Buchhaltung weiter den alten Anbieter (Karam, 03.09.).
  let nach = null;
  if (schonGesetzt(scheinId)) nach = await verlaufAnbieterNachziehen(scheinId, neuKz);
  let nachText = "";
  if (nach) {
    const teile = [];
    if (nach.geraet) teile.push(nach.geraet + " Verlaufseintrag" +
      (nach.geraet === 1 ? "" : "e") + " auf diesem Gerät");
    if (nach.konto) teile.push(nach.konto + " gespeicherte" +
      (nach.konto === 1 ? "r Schein" : " Scheine") + " im Konto");
    if (teile.length) nachText = " <b>Mit umgestellt:</b> " + teile.join(" und " ) +
      " - Einsatz, Quote und möglicher Gewinn bleiben, wie du sie gespeichert hast.";
    if (nach.fehler.length) nachText += " <b>&#9888; NICHT umgestellt:</b> " +
      textSicher(nach.fehler.join("; ")) + " - dort steht weiter " +
      textSicher(anbieterName(alt)) + ".";
    if (!teile.length && !nach.fehler.length) nachText =
      " Im Verlauf stand schon " + textSicher(anbieterName(neuKz)) + ".";
  }

  if (probleme.length) {
    meldung("Schein " + sch.nr + " steht jetzt auf " + anbieterName(neuKz) +
      ", aber <b>" + probleme.length + " von " + sch.wetten.length +
      " Wetten passen dort nicht</b>:<ul><li>" + probleme.join("</li><li>") +
      "</li></ul>Die betroffenen Zeilen sind rot. Nimm sie mit dem Menue rechts raus, " +
      "dann rueckt automatisch etwas Passendes nach. Oder stell zurueck auf " +
      anbieterName(alt) + "." + nachText, "warn");
  } else {
    meldung("Schein " + sch.nr + " steht jetzt auf <b>" + anbieterName(neuKz) +
      "</b>. Alle " + sch.wetten.length + " Wetten sind dort verfügbar und über der Mindestquote." +
      nachText, nach && nach.fehler.length ? "warn" : "gut");
  }
  zeichne_();
}

function macheSchein(marke, nr, kz, gruppe, art) {
  return {
    nr: nr,
    id: "S" + marke + "-" + nr,
    kz: kz,
    art: art,                 // "normal" oder "niedrig"
    gebautAm: new Date().toISOString(),   // Karam: an jeder Karte Datum und Uhrzeit
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

  // Eine Einzelwette hat nur diese eine Wette. Sie herauszunehmen und
  // Ersatz nachruecken zu lassen ergaebe eine andere Wette, die Karam
  // nie angehakt hat. Deshalb: nichts tun und auf Loeschen verweisen.
  if (sch.art === "eigen" && sch.wetten.length === 1) {
    meldung("Das ist eine <b>Einzelwette</b> - sie hat nur diese eine Wette. " +
      "Willst du sie weg haben, drück unten <b>Löschen</b>.", "warn");
    return;
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
    if (i.offen === 0) grundText = "keine Wette im Ordner mehr offen.";
    else if (i.frei === 0) grundText = "keine der " + i.offen + " offenen Wetten passt in diesen Schein.";
    else grundText = "keine der " + i.frei + " passenden schafft bei " + anbieterName(sch.kz) +
      " die Mindestquote " + z.einst.mind.toFixed(2) + ".";
    meldung("<b>Kein Ersatz:</b> " + grundText + " Schein hat jetzt " + sch.wetten.length +
      " Wetten - stehen lassen, <b>Anders mischen</b> oder Mindestquote senken.", "warn");
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
    // Kurz melden (Karam 05.09.): Zahlen ja, Gelaber nein. Der
    // "real"-Zusatz kommt nur, wenn ein Teiler wirklich abzieht.
    meldung("<b>Nicht übernommen:</b> " + roh.toFixed(2) + " bei " + anbieterName(sch.kz) +
      (rund2(echt) !== rund2(roh) ? " (real " + rund2(echt).toFixed(2) + ")" : "") +
      " liegt unter der Mindestquote " + mindW.toFixed(2) + ". Wette raus oder andere Linie.",
      "warn");
    return;
  }
  feld.classList.remove("fehler");
  // Karams Regel: unter der Mindestquote ist gesperrt (oben), weit UEBER der
  // Foto-Quote gibt es eine Mahnung - das riecht nach Tippfehler.
  const fotoRoh = w.o[eintrag.optIdx][1];
  if (fotoRoh && roh > fotoRoh * 1.15) {
    meldung("<b>Prüfen:</b> " + roh.toFixed(2) + " liegt weit über der Foto-Quote " +
      fotoRoh.toFixed(2) + " - vertippt? Übernommen ist sie.", "warn");
  }
  speichereEingabe(wettId, opt, sch.kz, String(roh));
  merkeGeprueft(wettId, sch.kz);
  zeichne_();
}

// ---------- Foto zum Schein ----------

function fotoSchluessel(scheinId) { return "foto_" + scheinId; }

// ---------- Wo das Bild einer Karte herkommt ----------
// Karam (14.09.2026): "es soll in der Datenbank gespeichert werden und
// nicht im Browser." Sobald eine Kombination im Konto liegt, ist ihr Bild
// dort mitgespeichert (supaScheinAnlegen) - der Browser gibt seine Kopie
// dann ab (siehe scheinInsKonto). Zum Anzeigen wird das Bild einmal
// nachgeladen und nur im Arbeitsspeicher gehalten, nie wieder auf die
// Platte geschrieben. Solange die Kombination noch NICHT gespeichert ist,
// gibt es in der Datenbank keine Zeile dafuer - dann bleibt es lokal.
const scheinFotoCache = {};      // scheinId -> {foto, name}
const scheinFotoVersucht = {};   // scheinId -> true: nur EIN Anlauf je Karte

function fotoFuerKarte(scheinId, imVerlauf) {
  // 1. Was schon im Arbeitsspeicher liegt, ist sofort da.
  const c = scheinFotoCache[scheinId];
  if (c && c.foto) return { foto: c.foto, name: c.name, zeit: c.zeit || null, ausDb: !!c.ausDb };
  // 2. Alter Bestand im localStorage, falls der Umzug ins Bildlager
  //    gerade noch laeuft. Danach gibt es dort nichts mehr.
  const lokal = localStorage.getItem(fotoSchluessel(scheinId));
  if (lokal) {
    return { foto: lokal,
      name: localStorage.getItem(fotoSchluessel(scheinId) + "_name") || "Wettschein",
      zeit: localStorage.getItem(fotoSchluessel(scheinId) + "_zeit"),
      ausDb: false };
  }
  // 3. Sonst einmal nachsehen: erst im Bildlager (IndexedDB), dann in
  //    der Datenbank. scheinFotoVersucht sorgt dafuer, dass ein
  //    Fehlschlag nicht bei jedem Zeichnen neu abgefragt wird.
  if (!scheinFotoVersucht[scheinId]) {
    scheinFotoVersucht[scheinId] = true;
    (async () => {
      let satz = (typeof bildLagerHolen === "function") ? await bildLagerHolen(scheinId) : null;
      if ((!satz || !satz.foto) && imVerlauf && imVerlauf.dbId &&
          typeof supaScheinFotoHolen === "function") {
        const r = await supaScheinFotoHolen(imVerlauf.dbId);
        if (r && r.foto) {
          satz = { foto: r.foto, name: r.name, zeit: null, ausDb: true };
          // Einmal geholt, bleibt es oertlich liegen - im Bildlager,
          // nicht im localStorage.
          if (typeof bildLagerSetzen === "function") await bildLagerSetzen(scheinId, satz);
        }
      }
      if (satz && satz.foto) {
        scheinFotoCache[scheinId] = satz;
        neuZeichnenSicher();
      }
    })().catch(() => { /* dann eben kein Bild - die Kombination zaehlt trotzdem */ });
  }
  return null;
}

// Ein Bild ablegen: sofort sichtbar (Arbeitsspeicher) und dauerhaft
// (Bildlager). Der localStorage wird dafuer NICHT mehr angefasst - er
// muss frei bleiben, sonst kann sich Karam nicht mehr einloggen.
async function fotoAblegen(scheinId, daten, name) {
  const satz = { foto: daten, name: name || "Wettschein", zeit: new Date().toISOString() };
  scheinFotoCache[scheinId] = satz;
  scheinFotoVersucht[scheinId] = true;
  if (typeof bildLagerSetzen !== "function") return false;
  try { return await bildLagerSetzen(scheinId, satz); }
  catch (e) { return false; }
}

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
// Es geht ins Bildlager (IndexedDB), NICHT mehr in den localStorage:
// der muss frei bleiben, sonst kann die Anmeldung nicht geschrieben
// werden und das Einloggen scheitert (siehe bildlager.js).
// Verkleinert wird deshalb auch nichts mehr - der Wettschein bleibt
// scharf, im Bildlager ist Platz.
async function fotoAusCanvas(c, scheinId, herkunft) {
  const name = fotoName(scheinId);
  const daten = c.toDataURL("image/jpeg", 0.82);
  const ok = await fotoAblegen(scheinId, daten, name);
  if (!ok) {
    meldung("Das Bild konnte <b>nicht</b> abgelegt werden und steht deshalb auch nicht " +
      "unter der Kombination. Melde dich, das darf nicht passieren.", "warn");
    return false;
  }
  // ERST zeichnen, DANN melden: zeichne_ schreibt selbst in denselben
  // Meldungskasten (archivierte Wetten) und wuerde die Bestaetigung
  // sofort wieder ueberschreiben - dann sieht es aus, als sei nichts
  // passiert (14.09.2026, dieselbe Falle wie bei verlaufEintragLoeschen).
  // Scheitert das Zeichnen, kommt die Bestaetigung trotzdem.
  neuZeichnenSicher();
  meldung((herkunft || "Bild") + " übernommen und benannt: <b>" + name + "</b> (" +
    Math.round(daten.length / 1024) + " KB). Es liegt im Bildlager dieses Browsers " +
    'und wandert in die Datenbank, sobald die Kombination in den Verlauf kommt. ' +
    '<a href="bilder.html"><b>Alle Bilder ansehen</b></a>', "gut");
  return true;
}

// Dateiname zum Herunterladen (ohne Leerzeichen)
function fotoDateiname(name) {
  return name.replace(/ /g, "_").replace("Quote_", "Q") + ".jpg";
}

// KEIN STILLES SCHEITERN MEHR (14.09.2026).
// Karam: "ich druecke drauf, es passiert gar nichts." Genau das konnte
// hier passieren: schlug das Lesen der Datei oder das Decodieren des
// Bildes fehl, gab es dafuer keinen Empfaenger - bild.onload kam nie,
// und niemand hat je etwas gesagt. Ein HEIC-Bild vom iPhone reicht dafuer
// schon, das kann der Browser nicht decodieren. Ab jetzt sagt jeder Weg,
// was los ist.
function fotoHochladen(scheinId, input) {
  const datei = input.files && input.files[0];
  if (!datei) return;
  // Das Feld sofort leeren: sonst loest dieselbe Datei beim naechsten Mal
  // gar kein "change" mehr aus - und es "passiert wieder nichts".
  const feldLeeren = () => { try { input.value = ""; } catch (e) { /* egal */ } };
  meldung("Foto wird gelesen...", "gut");
  const leser = new FileReader();
  leser.onerror = () => {
    feldLeeren();
    meldung("Diese Datei liess sich nicht lesen (" + textSicher(datei.name) + "). " +
      "Versuch es mit dem <b>Bildschirm-Ausschnitt</b>.", "warn");
  };
  leser.onload = ev => {
    const bild = new Image();
    bild.onerror = () => {
      feldLeeren();
      meldung("Dieses Bildformat kann der Browser nicht öffnen (" + textSicher(datei.name) +
        "). Das passiert vor allem bei <b>HEIC</b> vom iPhone. Nimm einen " +
        "normalen Screenshot als JPG oder PNG, oder den <b>Bildschirm-Ausschnitt</b>.", "warn");
    };
    bild.onload = async () => {
      feldLeeren();
      try {
      // Im Bildlager ist Platz, also bleibt der Schein lesbar: 1400 statt
      // der frueheren 700 Punkte. Frueher musste hier kleingerechnet
      // werden, weil alles in den 5-MB-localStorage sollte.
      const maxB = 1400;
      const faktor = Math.min(1, maxB / bild.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bild.width * faktor);
      c.height = Math.round(bild.height * faktor);
      c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
      const daten = c.toDataURL("image/jpeg", 0.82);
      const name = fotoName(scheinId);
      const gespeichert = await fotoAblegen(scheinId, daten, name);
      if (gespeichert) {
        // Erst zeichnen, dann melden - sonst wischt zeichne_ die
        // Bestaetigung gleich wieder weg (siehe fotoAusCanvas). Scheitert
        // das Zeichnen, darf die Bestaetigung trotzdem nicht ausfallen:
        // das Bild IST gespeichert, und Karam muss das sehen.
        neuZeichnenSicher();
        meldung("Foto gespeichert und benannt: <b>" + name + "</b> (" +
          Math.round(daten.length / 1024) + " KB). Es liegt im Bildlager dieses " +
          "Browsers und wandert in die Datenbank, sobald die Kombination in den " +
          'Verlauf kommt. <a href="bilder.html"><b>Alle Bilder ansehen</b></a>', "gut");
      } else {
        meldung("Das Foto konnte <b>nicht</b> abgelegt werden und steht deshalb auch " +
          "nicht unter der Kombination. Melde dich, das darf nicht passieren.", "warn");
      }
      } catch (e) {
        meldung("Das Foto konnte nicht verarbeitet werden: " +
          textSicher(e && e.message ? e.message : String(e)), "warn");
      }
    };
    bild.src = ev.target.result;
  };
  leser.readAsDataURL(datei);
}

// Neu zeichnen, ohne dass ein Fehler beim Zeichnen die Bestaetigung
// verschluckt. Vorher galt: wirft zeichne_, kommt die Meldung nie, und
// fuer Karam "passiert gar nichts" - obwohl das Bild laengst liegt.
function neuZeichnenSicher() {
  try { zeichne_(); return true; }
  catch (e) {
    try {
      console.error("zeichne_ ist gescheitert:", e);
    } catch (e2) { /* egal */ }
    return false;
  }
}

function fotoLoeschen(scheinId) {
  localStorage.removeItem(fotoSchluessel(scheinId));
  localStorage.removeItem(fotoSchluessel(scheinId) + "_zeit");
  localStorage.removeItem(fotoSchluessel(scheinId) + "_name");
  localStorage.removeItem("foto_analyse_" + scheinId);
  // Das Bild liegt an bis zu drei Stellen: Arbeitsspeicher, Bildlager
  // und Datenbank. Es muss ueberall weg, sonst kaeme es beim naechsten
  // Zeichnen einfach wieder. Die Kombination selbst bleibt.
  delete scheinFotoCache[scheinId];
  scheinFotoVersucht[scheinId] = true;
  if (typeof bildLagerWeg === "function") bildLagerWeg(scheinId).catch(() => { });
  const drin = schonGesetzt(scheinId);
  if (drin && drin.dbId && typeof supaScheinFotoLoeschen === "function") {
    supaScheinFotoLoeschen(drin.dbId).then(r => {
      if (r && r.error) meldung("Das Bild ist auf diesem Gerät weg, in der Datenbank " +
        "aber noch da: " + textSicher(r.error.message), "warn");
    }).catch(() => { });
  }
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
  zeichneOrdnerWahl();
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
      // Selbst gebaute Scheine (auch Einzelwetten) werden NICHT auf drei
      // aufgefuellt: Karam hat genau diese Zeilen angehakt. Vorher wurde
      // eine Einzelwette hier nach dem Archivieren still zum Dreier.
      if (sch.art === "eigen") continue;
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
          'wähl den Anbieter und drück <b>Aus der Auswahl bauen</b>. Eine Zeile ergibt eine Einzelwette.</div>'));

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
// "Kombination" oder "Einzelwette", je nachdem, wie viele Wetten auf dem
// Schein stehen. Karam (15.09.2026): eine angehakte Zeile ergibt eine
// Einzelwette. Bewusst NICHT "einzeln" genannt: s.einzeln, einzelnAktiv
// und einzelnNaechste gehoeren zum Modus "Einer nach dem anderen"
// (einzeln.js), der Dreier nacheinander vorschlaegt - etwas ganz anderes.
function scheinWort(s) {
  return (s && s.wetten && s.wetten.length === 1) ? "Einzelwette" : "Kombination";
}

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

  const bild = fotoFuerKarte(s.id, imVerlauf);
  const foto = bild ? bild.foto : null;
  const fotoZeit = bild ? bild.zeit : null;
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
    scheinWort(s) + " " + anzeigeNr(z, s.nr) +
    // Karam (15.09.2026): an JEDER Kombination Datum und Uhrzeit. Ist sie
    // gespeichert, zaehlt der Speicher-Moment - das ist der Moment, der in
    // der Buchhaltung steht. Vorher der Bau-Moment. Aeltere Karten ohne
    // gebautAm zeigen nichts, statt etwas zu erfinden.
    (imVerlauf && imVerlauf.zeit
      ? ' <span class="s-wann mini" title="Gespeichert am">&#128337; gespeichert ' + wannText(imVerlauf.zeit) + "</span>"
      : (s.gebautAm
        ? ' <span class="s-wann mini" title="Gebaut am">&#128337; gebaut ' + wannText(s.gebautAm) + "</span>"
        : "")) +
    (imVerlauf
      ? ' <span class="s-drin" title="Diese ' + scheinWort(s) + ' ist gespeichert - du findest sie in Mein Bereich.">' +
        '&#10003; im Verlauf' + (imVerlauf.nummer ? ' als Nr. ' + imVerlauf.nummer : '') +
        (imVerlauf.einsatz ? ', ' + Number(imVerlauf.einsatz).toFixed(2) + ' &euro;' : '') +
        // Karam (14.09.2026): "bei wem hab ich das gespeichert?" Das muss
        // an der Kombination stehen, nicht nur in Mein Bereich. Fehlt die
        // Person, wird das ausdruecklich gesagt - eine Kombination ohne
        // Person faellt in der Abrechnung sonst durch.
        (imVerlauf.woher === "konto" ? ' &middot; ' + personLinkHtml(imVerlauf) : '') + '</span>'
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
    // Die Dreier-Warnung gilt nur fuer gebaute Scheine. Ein selbst gebauter
    // (auch die Einzelwette) sollte nie ein Dreier sein - "nur 1 Wetten,
    // kein Dreier mehr" in Rot laese sich wie ein Fehler.
    (s.wetten.length !== 3 && s.art !== "eigen" ? ' <span class="s-warn">nur ' + s.wetten.length +
      ' Wetten, kein Dreier mehr</span>' : "") +
    '<span class="s-quote">' + (s.wetten.length === 1
      ? "Einzelwette, Quote laut Schein <b>"
      : s.wetten.length + "er, Gesamtquote laut Schein <b>") + rund2(gesamtRoh).toFixed(2) + "</b>" +
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
      // Karam (17.09.2026): "Jede einzelne Wette hat eine ID beim
      // Anbieter - die will ich beim Auswerten suchen koennen." Das Feld
      // ist freiwillig; was hier steht, geht mit in den Verlauf
      // (baueVerlaufsEintrag) und ist ab dann ueberall sichtbar und
      // durchsuchbar. type=text: IDs koennen Buchstaben tragen.
      '<div class="mini anbid-zeile">Anbieter-ID vom Schein: ' +
        '<input type="text" class="anbid-feld" id="sid_' + s.id + '" ' +
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="steht auf dem Wettschein, z. B. 1234567890" ' +
        'title="Die Kennung, unter der der Anbieter diesen Schein fuehrt. Freiwillig - hilft spaeter beim Wiederfinden."></div>' +
      '<button class="merken' + (imVerlauf ? ' schonda' : '') + '" ' +
        'onclick="scheinMerken(\'' + s.id + '\')">' +
        (imVerlauf ? 'nochmal in den Verlauf' : 'In den Verlauf') + '</button>' +
      // Karam (15.09.2026): "gleich hinter dem Verlauf-Knopf muss stehen,
      // bei welcher Person sie ist - und draufklicken bringt mich hin."
      (imVerlauf ? personLinkHtml(imVerlauf) : "") +
      // Karam (14.09.2026): der Weg zurueck stand bisher nur im Panel.
      // Wer hier speichert, muss es auch hier wieder zuruecknehmen
      // koennen - dieselbe gepruefte Loeschung wie im Panel, mit
      // Rueckfrage und Guthaben-Hinweis (verlaufEintragLoeschen).
      (imVerlauf
        ? '<button title="Diese ' + scheinWort(s) + ' wieder aus dem Verlauf nehmen. ' +
          'Die Wette beim Anbieter bleibt davon unberührt." ' +
          'onclick="verlaufEintragLoeschen(\'' + (imVerlauf.dbId || "") + '\',\'' +
          String(imVerlauf.zeit || "").replace(/'/g, "") + '\')">&#8617; aus dem Verlauf nehmen</button>'
        : "") +
      '<button onclick="scheinTeilen(\'' + s.id + '\')" title="Der Anbieter lässt nicht mehr zu? Gleiche Wetten zusätzlich bei einem weiteren Anbieter setzen.">&#10133; Rest bei weiterem Anbieter</button>' +
      '<button class="knopfweg" title="Diese ' + scheinWort(s) + ' löschen" ' +
        'onclick="kombiLoeschen(\'' + s.id + '\')">&#128465; Löschen</button>' +
      '<label class="fotoknopf">&#128247; Foto vom Wettschein' +
        '<input type="file" accept="image/*" style="display:none" ' +
        'onchange="fotoHochladen(\'' + s.id + '\', this)"></label>' +
      '<button class="fotoknopf" onclick="ausschnittStarten(\'' + s.id + '\')" ' +
        'title="Schneidet einen Bereich direkt vom Bildschirm aus - ohne Umweg über eine Datei auf dem Laptop.">' +
        "&#9986; Bildschirm-Ausschnitt</button>" +
    "</div>" +
    // Ganz unten an der Karte noch einmal im Klartext: bei WEM liegt diese
    // Kombination? Karam (14.09.2026) liest genau hier nach, wenn er den
    // Schein in der Hand hat - oben im Kopf ist es ihm zu weit weg.
    (imVerlauf
      ? '<div class="s-wer mini">&#10003; Gespeichert' +
        (imVerlauf.nummer ? ' als <b>Nr. ' + imVerlauf.nummer + '</b>' : '') +
        (imVerlauf.zeit ? ' am <b>' + wannText(imVerlauf.zeit) + '</b>' : '') +
        (imVerlauf.woher === "konto"
          ? ' ' + personLinkHtml(imVerlauf, true)
          : ' auf diesem Gerät (kein Konto)') +
        (imVerlauf.einsatz ? ', Einsatz ' + Number(imVerlauf.einsatz).toFixed(2) + ' &euro;' : '') +
        "</div>"
      : "") +
    '<div class="zielzeile" id="ziel_' + s.id + '">' + gruppenText(z, s.nr) + "</div>" +
    '<div class="ordnerwahl" id="ordnerwahl_' + s.id + '"></div>' +
    (foto ? (function () {
      const name = bild.name || "Wettschein";
      return '<div class="s-foto"><div class="fotoname">' + name + "</div>" +
        '<img src="' + foto + '" alt="' + name + '">' +
        '<div class="mini">' + (bild.ausDb
          ? "liegt in der Datenbank"
          : "hochgeladen " + (fotoZeit ? new Date(fotoZeit).toLocaleString("de-AT") : "")) +
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
      "<p class='mini'>Du hast bei allen Anbietern gesagt, dass es die Wette dort nicht " +
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
    entfernt: [],
    gebautAm: new Date().toISOString()    // die Kopie ist ein neuer Schein, also jetzt
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

// liste  = woraus das Zeilenverzeichnis gebaut wird (Anzahl, Summe, Anbieter).
// farbListe = wer eine FARBE bekommt. Fehlt sie, gilt liste.
//
// Warum zwei Listen: es gibt nur 27 unterscheidbare Farben (neun Toene mal
// drei Helligkeiten). Faerbte man alle Kombinationen aller Ordner ein,
// liefe die Palette um und zwei verschiedene Kombinationen saehen gleich
// aus. Eine Farbe heisst deshalb: diese Kombination steht in der Liste
// "Gesetzt" darunter, also im offenen Ordner. Was aus einem anderen
// Ordner kommt, bleibt farblos, zaehlt aber mit und traegt sein
// Anbieter-Zeichen. So bedeutet die Farbe immer noch genau eine Sache.
function kombiKarte(liste, farbListe) {
  const eintraege = (liste || gesetzteEintraege()).slice()
    .sort((a, b) => String(a.zeit || "").localeCompare(String(b.zeit || "")));
  const farbe = {}, kzJe = {}, zeilen = {};
  let n = 0;
  // Erst die Farben, streng in derselben Reihenfolge wie die Gesetzt-Liste
  // sie vergibt. Sonst haette dieselbe Kombination oben und unten eine
  // andere Farbe und waere als Wiedererkennung wertlos.
  for (const e of (farbListe || eintraege).slice()
      .sort((a, b) => String(a.zeit || "").localeCompare(String(b.zeit || "")))) {
    const st = e.stamm || e.scheinId || ("zeit:" + e.zeit);
    if (!(st in farbe)) { farbe[st] = kombiFarbe(n); n++; }
  }
  for (const e of eintraege) {
    const st = e.stamm || e.scheinId || ("zeit:" + e.zeit);
    if (!kzJe[st]) kzJe[st] = [];
    if (e.kz && kzJe[st].indexOf(e.kz) < 0) kzJe[st].push(e.kz);
    for (const t of (e.wetten || [])) {
      if (!t || !t.id) continue;      // Handeingaben (personkombi.js) haben keine Wetten-Kennung
      // EIN Satz je Bein, in beide Verzeichnisse dasselbe Objekt. Die
      // Anzahl und die Euro-Summe der Tabelle kommen genau hieraus, also
      // koennen sie nie auseinanderlaufen.
      const eintrag = { stamm: st, kz: e.kz, nummer: e.nummer,
                        einsatz: Number(e.einsatz) || 0, zeit: e.zeit,
                        stand: e.stand || "", finger: e.finger || "",
                        satz: t.satz || e.satz || "" };
      const k = t.id + "|" + (t.linie || "");
      (zeilen[k] = zeilen[k] || []).push(eintrag);
    }
  }
  return { farbe: farbe, kzJe: kzJe, zeilen: zeilen, anzahl: n };
}

// Der Text hinter der Anzahl in der Spalte "gesetzt": jeder einzelne
// Schein, der auf dieser Linie steht. Erfindet nichts - fehlt eine
// Angabe, steht das da.
function gesetztMalText(treffer) {
  const zeilen = treffer.map(t => {
    const teile = [t.nummer ? ("Nr. " + t.nummer) : "ohne Nummer"];
    if (t.kz) teile.push(anbieterName(t.kz) || t.kz);
    teile.push(t.einsatz ? (t.einsatz.toFixed(2) + " EUR") : "Einsatz unbekannt");
    if (t.stand && t.stand !== "offen") teile.push(t.stand);
    if (t.satz) teile.push(satzTitelVon(t.satz));
    return teile.join(", ");
  });
  // Ein geteilter Schein liegt als zwei Eintraege vor (_t2, _m2). Die
  // Zahl zaehlt SCHEINE, denn jeder ist beim Anbieter eine eigene Wette.
  // Wie viele Kombinationen das sind, steht extra da - sonst liest sich
  // "2x" wie zwei verschiedene Kombinationen.
  const staemme = [];
  for (const t of treffer) if (staemme.indexOf(t.stamm) < 0) staemme.push(t.stamm);
  // Zwei Eintraege mit demselben Fingerabdruck sind vermutlich einmal
  // doppelt gespeichert worden (das kennt Karam). Dann ist die Zahl hier
  // zu hoch. Das muss dastehen, nicht stillschweigend verrechnet werden:
  // bewusst doppelt setzen ist ein echter Fall.
  const finger = {};
  let doppeltVerdacht = 0;
  for (const t of treffer) {
    if (!t.finger) continue;
    finger[t.finger] = (finger[t.finger] || 0) + 1;
    if (finger[t.finger] === 2) doppeltVerdacht++;
  }
  const kopf = treffer.length + "x gesetzt" +
    (staemme.length && staemme.length !== treffer.length
      ? " (" + staemme.length + " Kombination" + (staemme.length === 1 ? "" : "en") +
        ", geteilt auf mehrere Scheine)" : "") + ":";
  return kopf + "\n" + zeilen.join("\n") +
    (doppeltVerdacht ? "\nAchtung: davon sehen welche gleich aus - vielleicht " +
      "doppelt gespeichert. Dann ist die Zahl zu hoch." : "");
}

// Welche gesetzten Kombinationen enthalten diese Tabellenzeile? Erst
// zeilengenau (Kennung + Linie). Alte Eintraege ohne Linie, oder solche,
// deren Linie zu keiner Zeile mehr passt (Wettentext nachtraeglich
// geaendert), landen bei der ERSTEN Linie - lieber dort als nirgends.
// ACHTUNG, hier stand ein stiller Fehler: frueher hiess es
// "if (genau.length) return genau;". Hatte die erste Linie einen genauen
// Treffer, kam der Notweg gar nicht mehr dran, und alles, was unter einer
// nicht mehr passenden Linie liegt, fiel weg. Die Zeile meldete dann
// "1x gesetzt", obwohl zwei Scheine draussen sind. Zu niedrig ist genau
// die Richtung, die eine zweite Wette ausloest. Jetzt wird gesammelt.
function zeilenTreffer(karte, w, i) {
  const genau = (karte.zeilen[w.id + "|" + optionName(w, i)] || []).slice();
  if (i !== 0) return genau;
  // Nur an der ERSTEN Linie: alles einsammeln, was zu keiner heutigen
  // Linie dieser Wette passt. Das sind Beine ohne Linie und Altbestand,
  // dessen Linientext sich seither geaendert hat. Lieber an der ersten
  // Zeile als nirgends.
  const linien = (w.o || []).map((_, j) => optionName(w, j));
  for (const k in karte.zeilen) {
    if (k.indexOf(w.id + "|") !== 0) continue;
    const linie = k.slice(w.id.length + 1);
    if (linie && linien.indexOf(linie) >= 0) continue;
    for (const e of karte.zeilen[k]) if (genau.indexOf(e) < 0) genau.push(e);
  }
  return genau;
}

// Inline-Stil fuer die Zeile: eine Farbe, oder ein harter Farbverlauf in
// gleich grosse Teile. Inline, weil die Zebra-Regeln (html[data-zeilen]
// tbody tr:nth-child(even)) jede Klassenregel schlagen wuerden.
function hintergrundFuer(karte, treffer) {
  const staemme = [];
  // Nur Staemme MIT Farbe. Ein Stamm aus einem anderen Ordner hat keine
  // (siehe kombiKarte); "background:undefined" waere sonst das Ergebnis.
  for (const t of treffer)
    if (karte.farbe[t.stamm] && staemme.indexOf(t.stamm) < 0) staemme.push(t.stamm);
  if (!staemme.length) return "";
  if (staemme.length === 1) return "background:" + karte.farbe[staemme[0]];
  const teil = 100 / staemme.length;
  const stops = staemme.map((s, k) => karte.farbe[s] + " " + (k * teil).toFixed(1) + "% " + ((k + 1) * teil).toFixed(1) + "%");
  return "background:linear-gradient(90deg," + stops.join(",") + ")";
}

// Kleines Zeichen in der Hausfarbe des Anbieters (eigene Marke, kein
// fremdes Logo - Logobilder muesste Karam erst liefern).
function anbieterZeichen(kz) {
  const kurz = { st: "S", iw: "IW", bw: "bw", b3: "365", ad: "AD", bt: "BTW", mb: "MB" };
  return '<span class="ab ab-' + kz + '" title="' + textSicher(anbieterName(kz) || kz) + '">' + (kurz[kz] || kz) + "</span>";
}

// ---------- Was wirklich gesetzt ist ----------
// Karam am 30.08.2026: "Ich will nur die Liste von den Scheinen, die
// gesetzt wurden, aber nix Leeres. Und dann seh ich auch, welche Personen."
// Quelle ist gesetzteEintraege() - BEIDE Ablagen, nur der aktive Ordner.
// liesVerlauf() allein waere bei angemeldetem Nutzer leer.
// Karam (16.09.2026): "Mir ist wichtig, dass immer die Kombis angezeigt
// werden, die eine dieser Wetten enthalten, die gerade in der Liste sind.
// Wenn ich mal in einem Ordner setze und mal in einem Zeitraum, moechte
// ich, dass immer die Kombis da sind, wo mindestens eine Wette aus dieser
// Liste dabei ist. Die Wetten dieser Kombi, die in der Liste sind, sind
// hell, der Rest ist grau. Und ich will sehen, in welchem Ordner die
// andere Wette ist."
//
// gsNurPassende = true ist der Normalfall. Der Knopf "alle zeigen" haengt
// daran; ausgeblendet wird NIE stillschweigend, die Zahl steht immer da.
let gsNurPassende = true;
// Karam (17.09.2026, spaet abends): "Gib mir bei Gesetzt die Moeglichkeit,
// nicht nur alle zu sehen, sondern unterschiedliche Ordner direkt zu
// oeffnen - hinter einem Knopf zum Zuklappen. Oder alles Gesetzte zu
// einem bestimmten Datum suchen."
// gsWahl haelt die Auswahl NUR im Speicher (wie gsNurPassende): eine
// gemerkte Auswahl liesse beim naechsten Oeffnen Kombinationen fehlen,
// ohne dass irgendwo steht warum.
//   art: "passend" (zur Tabelle, Normalfall) | "alle" | "ordner" | "ohne"
//   satz: der gewaehlte Ordner bei art "ordner"
//   von/bis: Setz-Datum (e.zeit), gilt in JEDER Art
let gsWahl = { art: "passend", satz: "", von: "", bis: "" };
let gsWahlOffen = false;

function gsWahlUm() { gsWahlOffen = !gsWahlOffen; zeichneGesetzte(); }
function gsArt(art, satz) {
  gsWahl.art = art;
  gsWahl.satz = satz || "";
  gsNurPassende = (art === "passend");
  gsLimit = GS_BLOCK;                 // neue Menge, wieder beim ersten Block
  zeichneGesetzte();
}
function gsZeit() {
  const von = document.getElementById("gs_von"), bis = document.getElementById("gs_bis");
  gsWahl.von = von ? von.value : "";
  gsWahl.bis = bis ? bis.value : "";
  gsLimit = GS_BLOCK;
  zeichneGesetzte();
}
function gsZeitWeg() {
  gsWahl.von = ""; gsWahl.bis = "";
  gsLimit = GS_BLOCK;
  zeichneGesetzte();
}
// Die zwei alten Knoepfe laufen ueber DENSELBEN Zustand weiter.
// "alle zeigen" hebt auch den Zeitraum auf - der Knopf verspricht ALLE,
// und ein stehengebliebener Zeitfilter machte das Versprechen zur Luege.
function gsAlleZeigen() { gsWahl.von = ""; gsWahl.bis = ""; gsArt("alle"); }
function gsNurPassendeZeigen() { gsArt("passend"); }

// Gehoert dieser Eintrag STRENG zu diesem Ordner? Anders als
// eintragImOrdner gibt es hier KEINEN Freibrief fuer Eintraege ohne
// Ordner - der Waehler hat fuer die ein eigenes Fach ("ohne").
function gsImOrdnerStreng(e, satz) {
  if (e.satz === satz) return true;
  for (const t of (e.wetten || [])) if (t && t.satz === satz) return true;
  return false;
}
function gsOhneOrdner(e) {
  if (e.satz) return false;
  for (const t of (e.wetten || [])) if (t && t.satz) return false;
  return true;
}
// Traegt einen Ordner, aber KEINEN, den es in SAETZE noch gibt.
// Karams Fund (17.09., Nacht): so eine Kombination (Nr. 2 aus dem
// geloeschten Ordner 2026-08-29-mittag) stand als einzige Zeile in
// jedem frisch geoeffneten Ordner. Sie lebt jetzt im eigenen Fach
// "Ordner geloescht" statt ueberall.
function gsOrdnerWeg(e) {
  if (gsOhneOrdner(e)) return false;
  const da = (x) => !!x && (Array.isArray(SAETZE) ? SAETZE : []).some(s2 => s2.id === x);
  if (da(e.satz)) return false;
  for (const t of (e.wetten || [])) if (t && da(t.satz)) return false;
  return true;
}

// Der zuklappbare Waehler ueber der Gesetzt-Liste. Zu: ein Knopf und
// EIN Satz, was gerade gilt. Auf: Faecher (passend, alles, ohne Ordner,
// jeder Foto-Ordner mit Anzahl) und das Setz-Datum von/bis.
// Der Warnkasten fuer unlesbare Kombinationen: sie stehen seit Karams
// Nacht-Fund (17.09.) nicht mehr als Zeile in jedem Ordner, aber
// verschwinden duerfen sie NIE - ohne diese Warnung koennte dieselbe
// Kombination ein zweites Mal gesetzt werden. Der Kasten haengt an
// jeder Ansicht, in der sie nicht selbst als Zeilen stehen.
function gsUnlesbarKasten(ausAllen) {
  if (gsWahl.art === "alle" || gsWahl.art === "unlesbar") return "";
  const zahl = (ausAllen || []).filter(e => e.unlesbar).length;
  if (!zahl) return "";
  return '<div class="warnkern gs-unlesbarkasten">&#9888; <b>' + zahl +
    " Kombination" + (zahl === 1 ? "" : "en") + " im Konto " +
    (zahl === 1 ? "ist" : "sind") + " auf diesem Gerät nicht lesbar.</b> " +
    "Sie können zu JEDEM Ordner gehören und zählen als gesetzt - Einsatz unbekannt, " +
    "alle Summen ohne sie. " +
    '<button onclick="gsArt(\'unlesbar\')">ansehen</button></div>';
}

function gsWahlHtml(ausAllen) {
  // Was ein Klick zeigen WUERDE: gezaehlt wird mit dem aktiven
  // Zeitfenster, denn das gilt in jedem Fach.
  const imZeit = (e) => {
    if (!(gsWahl.von || gsWahl.bis)) return true;
    const tag = String(e.zeit || "").slice(0, 10);
    if (!tag) return false;
    if (gsWahl.von && tag < gsWahl.von) return false;
    if (gsWahl.bis && tag > gsWahl.bis) return false;
    return true;
  };
  const basis = (ausAllen || []).filter(e => !e.unlesbar && imZeit(e));
  const ohneZahl = basis.filter(gsOhneOrdner).length;
  const wegZahl = basis.filter(gsOrdnerWeg).length;
  const unlesbarZahl = (ausAllen || []).filter(e => e.unlesbar).length;

  const zeit = (gsWahl.von || gsWahl.bis)
    ? " Gesetzt " + (gsWahl.von ? "ab <b>" + gsWahl.von + "</b>" : "") +
      (gsWahl.von && gsWahl.bis ? " " : "") +
      (gsWahl.bis ? "bis <b>" + gsWahl.bis + "</b>" : "") + "."
    : "";
  const lage =
    (gsWahl.art === "alle" ? "Gezeigt wird <b>alles</b> aus allen Ordnern."
    : gsWahl.art === "ohne" ? "Gezeigt werden nur Kombinationen <b>ohne Ordner</b> (Handeinträge und Screenshot-Kombis)."
    : gsWahl.art === "weg" ? "Gezeigt werden nur Kombinationen aus <b>gelöschten Ordnern</b>."
    : gsWahl.art === "unlesbar" ? "Gezeigt werden nur die <b>nicht lesbaren</b> Kombinationen."
    : gsWahl.art === "ordner" ? "Gezeigt wird nur der Ordner <b>" +
        textSicher(typeof satzTitelVon === "function" ? satzTitelVon(gsWahl.satz) : gsWahl.satz) + "</b>."
    : "Gezeigt wird, was zur <b>Tabelle oben</b> passt.") + zeit;

  let h = '<div class="gs-wahl">' +
    '<button class="gs-wahl-knopf" onclick="gsWahlUm()">&#128194; Ordner und Zeitraum ' +
      (gsWahlOffen ? "&#9662;" : "&#9656;") + "</button> " +
    '<span class="mini gs-lage">' + lage + "</span>";
  if (gsWahlOffen) {
    const chip = (an, ruf, text, zahl) =>
      '<button class="gs-chip' + (an ? " aktiv" : "") + '" onclick="' + ruf + '">' + text +
      (zahl === null ? "" : ' <span class="gs-chipz">' + zahl + "</span>") + "</button>";
    let chips =
      chip(gsWahl.art === "passend", "gsNurPassendeZeigen()", "zur Tabelle passend", null) +
      chip(gsWahl.art === "alle", "gsArt('alle')", "alles", basis.length) +
      chip(gsWahl.art === "ohne", "gsArt('ohne')", "ohne Ordner", ohneZahl) +
      // Die zwei Rest-Faecher stehen nur da, wenn es sie braucht - ein
      // leeres Fach waere ein Knopf ohne Sinn.
      (wegZahl || gsWahl.art === "weg"
        ? chip(gsWahl.art === "weg", "gsArt('weg')", "Ordner gelöscht", wegZahl) : "") +
      (unlesbarZahl || gsWahl.art === "unlesbar"
        ? chip(gsWahl.art === "unlesbar", "gsArt('unlesbar')", "nicht lesbar", unlesbarZahl) : "");
    for (const s of (Array.isArray(SAETZE) ? SAETZE : [])) {
      if (s.id === SATZ_ALLE) continue;
      const zahl = basis.filter(e => gsImOrdnerStreng(e, s.id)).length;
      chips += chip(gsWahl.art === "ordner" && gsWahl.satz === s.id,
        "gsArt('ordner','" + String(s.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "')",
        textSicher(s.titel || s.id), zahl);
    }
    h += '<div class="gs-wahl-panel">' +
      '<div class="gs-wahl-chips">' + chips + "</div>" +
      '<div class="gs-wahl-zeit mini">Gesetzt am: von ' +
        '<input type="date" id="gs_von" value="' + textSicher(gsWahl.von) + '" onchange="gsZeit()"> bis ' +
        '<input type="date" id="gs_bis" value="' + textSicher(gsWahl.bis) + '" onchange="gsZeit()">' +
        ((gsWahl.von || gsWahl.bis)
          ? ' <button onclick="gsZeitWeg()">Zeitraum leeren</button>' : "") +
        " <span>(der Tag, an dem gesetzt wurde - nicht der Spieltag)</span>" +
      "</div>" +
    "</div>";
  }
  return h + "</div>";
}

// Grosse Mengen (Karam, 17.09.2026): gezeichnet wird in Bloecken von
// 200 Zeilen. Summe und Zaehler unten laufen IMMER ueber die ganze
// Liste - nur das Zeichnen selbst ist begrenzt, und die Grenze steht
// mit Zahl und Knopf ausdruecklich da.
const GS_BLOCK = 200;
let gsLimit = GS_BLOCK;
function gsMehrZeilen() { gsLimit += GS_BLOCK; zeichneGesetzte(); }
function gsAlleZeilen() { gsLimit = Number.MAX_SAFE_INTEGER; zeichneGesetzte(); }

// Zu welchem Ordner gehoert dieses Bein? Erst das Bein selbst (seit
// 16.09. traegt es seinen Ordner mit), sonst die Wette nachschlagen.
// Nichts erfinden: ohne Fund bleibt es leer.
function gsBeinOrdner(t, e) {
  if (t && t.satz) return t.satz;
  const w = (t && t.id && typeof wetteNachId === "function") ? wetteNachId(t.id) : null;
  if (w && w.satz) return w.satz;
  return (e && e.satz) || "";
}

function zeichneGesetzte() {
  const box = document.getElementById("gesetzteliste");
  if (!box) return;
  // ALLE Ordner. Eine Kombination, deren eine Haelfte aus einem aelteren
  // Ordner stammt, soll hier auftauchen, sobald die andere Haelfte in der
  // Tabelle steht.
  const ausAllen = gesetzteEintraege(SATZ_ALLE)
    .slice()
    .sort((a, b) => String(b.zeit || "").localeCompare(String(a.zeit || "")));
  const sichtIds = ebSichtbareIds();
  const satzJetzt = (typeof aktiverSatzId === "function") ? aktiverSatzId() : null;
  // WARUM eine Kombination nicht gezeigt wird. Leerer Text heisst: sie
  // wird gezeigt. Ein Richter, ein Kriterium - die Toepfe unten zaehlen
  // genau den Grund, der hier entschieden wurde, und koennen deshalb
  // nicht auseinanderlaufen.
  //
  // Karam (17.09.2026): "Ich habe auf einmal so richtig viele Kombis, so
  // fast 40 Kombis noch da, und ich weiss nicht warum. Die gehoeren ja
  // nicht zusammen."
  // HIER STAND: keine Wetten-Kennung, also IMMER zeigen. Gemeint waren
  // die von Hand angelegten und die unlesbaren, und solange es zwei davon
  // gab, fiel es nicht auf. Am 17.09.2026 kamen 36 alte Fotoscheine dazu
  // (altimport.js). Deren Spiele stehen nur auf dem Foto, sie KOENNEN
  // keine Kennung tragen - und damit standen 38 fremde Kombinationen in
  // jedem Ordner. Ohne Kennung entscheidet jetzt der ORDNER, und der ist
  // selbst eine Kennung (Regel 2).
  // Bewusst NICHT der Zeitraum: ebZeitPasst fragt in seiner ersten Zeile
  // ebNurOffen ab, und das steht auf an. Beim ersten getippten Datum
  // waeren damit 30 der 38 verschwunden - auch bei genau dem Zeitraum,
  // der sie treffen soll.
  // Karam (17.09.2026, spaet abends): "Bei der aktuellen Folder gesetzt
  // ist irgendwas, das sich da nicht gehoert." Das waren die Eintraege
  // OHNE eigenen Ordner (Kombis von Hand, seit heute auch jede
  // Screenshot-Kombi aus schnell.js): eintragImOrdner laesst sie mit
  // Absicht ueberall durch, und seit dem Schnell-Eintrag ist "ueberall"
  // eine Plage. Sie haben jetzt ihr EIGENES Fach im Ordner-Waehler
  // ("ohne Ordner") und werden im Passend-Modus gezaehlt ausgeblendet -
  // nie still (Regel 4).
  const grundWeg = (e) => {
    // Unlesbare Kombinationen: sie KOENNEN zu jedem Ordner gehoeren.
    // Frueher standen sie deshalb als Zeile in JEDEM Ordner - Karams
    // zweite Quelle fuer "was macht die hier?". Jetzt haben sie ihr
    // eigenes Fach und einen unuebersehbaren Warnkasten ueber der
    // Liste (gsUnlesbarKasten) - verschwinden tun sie also NIE, sie
    // stehen nur nicht mehr als Karteileiche zwischen den echten.
    if (e.unlesbar) {
      return (gsWahl.art === "alle" || gsWahl.art === "unlesbar") ? "" : "unlesbar";
    }
    if (gsWahl.art === "unlesbar") return "andererOrdner";
    // Das Setz-Datum (gsWahl.von/bis) gilt in JEDER Art. Verglichen
    // wird ueber e.zeit - den Moment des Speicherns, NICHT ueber
    // ebZeitPasst (das fragt ebNurOffen mit, die bekannte Falle).
    if (gsWahl.von || gsWahl.bis) {
      const tag = String(e.zeit || "").slice(0, 10);
      if (!tag) return "ohneZeit";           // Resttopf: gezaehlt, nicht still
      if (gsWahl.von && tag < gsWahl.von) return "zeit";
      if (gsWahl.bis && tag > gsWahl.bis) return "zeit";
    }
    if (gsWahl.art === "alle") return "";
    if (gsWahl.art === "ohne") return gsOhneOrdner(e) ? "" : "andererOrdner";
    if (gsWahl.art === "weg") return gsOrdnerWeg(e) ? "" : "andererOrdner";
    if (gsWahl.art === "ordner") {
      return gsImOrdnerStreng(e, gsWahl.satz) ? "" : "andererOrdner";
    }
    // art "passend": wie bisher an der Tabelle des offenen Ordners.
    const mitId = (e.wetten || []).filter(t => t && t.id);
    if (mitId.some(t => sichtIds.has(String(t.id)))) return "";
    if (mitId.length) return "keinTreffer";
    // Ab hier traegt kein einziges Bein eine Kennung.
    // Ist der Massstab unbekannt (Ordner noch nicht geladen) oder
    // ausdruecklich "alles", wird nicht geurteilt, sondern stehengelassen -
    // derselbe Resttopf-Gedanke wie in ebSichtbareWetten.
    if (!satzJetzt || satzJetzt === SATZ_ALLE) return "";
    // GANZ ohne Ordner: frueher "ueberall zeigen", seit heute das
    // eigene Fach (siehe oben) - der Zaehler unten nennt sie.
    if (gsOhneOrdner(e)) return "ohneOrdner";
    // Ordner geloescht (Karams Nacht-Fund, Nr. 2 aus 2026-08-29-mittag):
    // frueher "kein Urteil, stehenlassen" - und damit in JEDEM Ordner.
    // Jetzt das eigene Fach, gezaehlt statt still.
    if (gsOrdnerWeg(e)) return "ordnerWeg";
    return eintragImOrdner(e.satz, e.wetten, satzJetzt) ? "" : "ohneKennung";
  };
  const weg = { keinTreffer: 0, ohneKennung: 0, ohneOrdner: 0, ordnerWeg: 0,
    andererOrdner: 0, zeit: 0, ohneZeit: 0, unlesbar: 0, euro: 0 };
  const alle = [];
  for (const e of ausAllen) {
    const g = grundWeg(e);
    if (!g) { alle.push(e); continue; }
    weg[g]++;
    weg.euro += Number(e.einsatz) || 0;
  }
  // Unlesbare zaehlen NICHT in die Euro-Summe (ihr Einsatz ist auf
  // diesem Geraet unbekannt) und laufen ueber den eigenen Warnkasten,
  // nicht ueber den Ausgeblendet-Satz.
  weg.euro -= 0;   // (unlesbare tragen ohnehin keinen lesbaren einsatz)
  const wegGefiltert = weg.keinTreffer + weg.ohneKennung + weg.ohneOrdner +
    weg.ordnerWeg + weg.andererOrdner + weg.zeit + weg.ohneZeit;
  // Derselbe Satz an JEDER Stelle, an der etwas ausgeblendet ist - sonst
  // haengt es vom Zufall ab, welchen Zweig Karam gerade vor sich hat.
  // Mit Geld dahinter: sichtbare Summe plus ausgeblendete Summe ergibt
  // wieder die Gesamtsumme, und das ist der zweite Weg (Regel 5).
  // JEDER Grund bekommt seinen eigenen Satz - ein falscher Grund ist
  // schlimmer als gar keiner, weil man ihm nachgeht.
  const wegText = () => wegGefiltert
    ? " <b>" + wegGefiltert + "</b> weitere sind ausgeblendet, zusammen <b>" +
      weg.euro.toFixed(2) + " &euro;</b>:" +
      (weg.keinTreffer ? " " + weg.keinTreffer + " ohne Wette in dieser Tabelle," : "") +
      (weg.ohneKennung ? " " + weg.ohneKennung + " aus einem anderen Ordner (alte Fotoscheine)," : "") +
      (weg.ohneOrdner ? " <b>" + weg.ohneOrdner + " ganz ohne Ordner</b> (Handeinträge und " +
        "Screenshot-Kombis - eigenes Fach im Ordner-Wähler)," : "") +
      (weg.ordnerWeg ? " <b>" + weg.ordnerWeg + " aus einem Ordner, den es nicht mehr " +
        "gibt</b> (eigenes Fach im Ordner-Wähler)," : "") +
      (weg.andererOrdner ? " " + weg.andererOrdner + " in anderen Ordnern," : "") +
      (weg.zeit ? " " + weg.zeit + " außerhalb des gewählten Zeitraums," : "") +
      (weg.ohneZeit ? " " + weg.ohneZeit + " ohne Setz-Zeit (dem Zeitraum nicht zuzuordnen)," : "") +
      " " +
      '<button onclick="gsAlleZeigen()">alle ' + ausAllen.length + " zeigen</button>"
    : "";
  // Anbieter-Filter von den Karten oben: nur die Anzeige. Unlesbare
  // Eintraege bleiben IMMER sichtbar - sie duerfen nie verschwinden.
  const liste = (typeof bauAnbieterFilter !== "undefined" && bauAnbieterFilter)
    ? alle.filter(e => e.unlesbar || e.kz === bauAnbieterFilter) : alle;
  if (!liste.length) {
    // Auch der Anbieter-Zweig bekommt den Satz ueber die Ausgeblendeten.
    // Ohne ihn stuende dort eine Zahl, die um die Ausgeblendeten zu klein
    // ist, samt der Zusage "zeigt alle" - und die waere dann gelogen.
    // Der Waehler steht AUCH hier - aus einem leeren Fach muss man
    // wieder herauskommen.
    box.innerHTML = gsWahlHtml(ausAllen) + gsUnlesbarKasten(ausAllen) +
      '<p class="mini">' + ((typeof bauAnbieterFilter !== "undefined" && bauAnbieterFilter)
      ? "Bei " + textSicher(anbieterName(bauAnbieterFilter)) + " ist hier nichts gesetzt (" +
        alle.length + " bei anderen Anbietern ausgeblendet - Karte oben nochmal antippen zeigt die übrigen)."
      : (wegGefiltert
        ? "In dieser Auswahl ist nichts gesetzt."
        : "Es ist noch nichts gesetzt.")) +
      wegText() + "</p>";
    return;
  }
  // Farben IMMER ueber die ungefilterte Liste vergeben - sonst wechselt
  // jede Kombination beim Filtern ihre Farbe (Vergabe nach Reihenfolge).
  // Und ueber ALLE Ordner, weil die Bau-Tabelle darueber genau dasselbe
  // tut. Zwei verschiedene Farbskalen auf einer Seite hiessen: dieselbe
  // Kombination haette oben eine andere Farbe als unten, und die Farbe
  // waere als Wiedererkennung wertlos.
  // Die Farbliste ist DIESELBE, die zeichneEigenbau oben benutzt
  // (gesetzteEintraege des offenen Ordners). Vorher stand hier nur
  // kombiKarte(alle) - also die bereits gefilterte Liste. Damit bekam
  // jede Kombination eine andere Farbe, sobald sich die Filterung
  // aenderte, und genau das schliesst der Kommentar darueber aus.
  const karte = kombiKarte(alle, gesetzteEintraege());
  // Die Summe ueber ALLES, gezeichnet wird nur bis gsLimit.
  let summe = 0;
  for (const e of liste) summe += Number(e.einsatz) || 0;
  const zeigenListe = liste.length > gsLimit ? liste.slice(0, gsLimit) : liste;
  let zeilen = "";
  for (const e of zeigenListe) {
    const st = e.stamm || e.scheinId || ("zeit:" + e.zeit);
    const stil = karte.farbe[st] ? ' style="background:' + karte.farbe[st] + '"' : "";
    if (e.unlesbar) {
      zeilen += '<tr class="gs-unlesbar"><td>' + (e.nummer || "?") + "</td>" +
        '<td colspan="6">Kombination liegt im Konto, ist auf diesem Gerät aber ' +
        "nicht lesbar (Schlüssel fehlt). Sie zählt trotzdem als gesetzt.</td></tr>";
      continue;
    }
    // Jede Wette der Kombination. Die, die gerade in der Tabelle steht,
    // ist MARKIERT (Haken davor) und anklickbar: der Klick springt zu
    // ihrer Zeile in der Bau-Tabelle (gsZuWette). Die anderen werden
    // zurueckgenommen und sagen dazu, aus welchem Ordner sie kommen.
    // Markiert wird NUR ueber die Wetten-Kennung (Regel 2): ein Spiel
    // mit demselben Namen von vor drei Wochen ist eine andere Zeile und
    // bekommt nie einen Haken.
    const beine = e.wetten || [];
    const drinZahl = beine.filter(w => w && w.id && sichtIds.has(String(w.id))).length;
    // Karam (17.09.2026): "da sind alle drei markiert, da ist die ganze
    // Kombi eigentlich schon gespielt worden von diesen Einsaetzen."
    const treffMarke = drinZahl
      ? '<div class="gs-treff' +
        (drinZahl === beine.length ? " gs-treff-voll" : "") + '">' +
        (drinZahl === beine.length
          ? (beine.length === 1
            ? "der Einsatz steht in dieser Tabelle - von hier schon gespielt"
            : "alle " + beine.length + " Einsätze aus dieser Tabelle - die ganze Kombi " +
              "ist mit genau diesen Zeilen schon gespielt")
          : drinZahl + " von " + beine.length + " Einsätzen aus dieser Tabelle") + "</div>"
      : "";
    const wetten = treffMarke + beine.map(w => {
      const drin = w && w.id && sichtIds.has(String(w.id));
      const ordner = drin ? "" : gsBeinOrdner(w, e);
      const text = textSicher(w.spiel || "") +
        (w.linie ? ' <span class="mini">' + textSicher(w.linie) + "</span>" : "");
      if (drin) {
        const ruf = "gsZuWette('" + String(w.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "')";
        return '<span class="gs-bein gs-drin" role="button" tabindex="0" onclick="' +
          textSicher(ruf) + '" title="Diese Wette steht in der Tabelle - antippen ' +
          'springt zu ihrer Zeile, dort kannst du sie anhaken">&#10003; ' + text + "</span>";
      }
      return '<span class="gs-bein gs-weg">' + text +
        (ordner ? ' <span class="gs-ordner">' +
          textSicher(typeof satzTitelVon === "function" ? satzTitelVon(ordner) : ordner) +
          "</span>" : ' <span class="gs-ordner">Ordner unbekannt</span>') + "</span>";
    }).join("<br>");
    const person = personName(e.ordner);
    // Moeglicher Gewinn: was Karam an der Karte eingetragen hat (so wie der
    // Anbieter ihn zeigt), sonst die Schaetzung Einsatz x Quote.
    const moeg = (Number(e.moeglich) > 0) ? Number(e.moeglich)
      : (Number(e.einsatz) || 0) * (Number(e.quote) || 0);
    zeilen += "<tr" + stil + " data-erg='" + zeigenListe.indexOf(e) + "'>" +
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
    gsWahlHtml(ausAllen) + gsUnlesbarKasten(ausAllen) +
    '<div class="tabellenrand"><table class="tb-tafel gs-tafel"><thead><tr>' +
      "<th>Nr.</th><th>Anbieter</th><th>Einsatz</th><th>Quote</th><th>möglich</th>" +
      "<th>Person</th><th>Wetten</th></tr></thead><tbody>" + zeilen +
    "</tbody></table></div>" +
    '<p class="mini"><b>' + liste.length + " gesetzt</b>, zusammen <b>" +
      summe.toFixed(2) + " &euro;</b>" +
      (zeigenListe.length < liste.length
        ? ". <b>Gezeichnet sind die ersten " + zeigenListe.length + " Zeilen</b> - " +
          "Summe und Zähler zählen trotzdem alle. " +
          '<button onclick="gsMehrZeilen()">die nächsten ' +
          Math.min(GS_BLOCK, liste.length - zeigenListe.length) + "</button> " +
          '<button onclick="gsAlleZeilen()">alle ' + liste.length +
          " zeichnen (kann träge werden)</button>"
        : "") +
      (gsWahl.art === "passend"
        ? ". Gezeigt wird jede Kombination, in der mindestens eine Wette aus der Tabelle " +
          "oben steckt. <b>Helle</b> Wetten stehen in der Tabelle, <b>graue</b> kommen aus " +
          "einem anderen Ordner - der steht dahinter."
        : "") +
      // Im Ordner der alten Fotoscheine gibt es gar keine Wetten-Zeilen.
      // Dann stimmt der Satz darueber nicht: es steckt KEINE Wette aus der
      // Tabelle drin, und die grauen Beine kommen nicht aus einem anderen
      // Ordner, sondern aus genau diesem. Das gehoert dazugesagt.
      // Getrennt nach dem WIRKLICHEN Grund. Ein falscher Grund ist
      // schlimmer als gar keiner, weil man ihm nachgeht: eine Kombination
      // aus einem Ordner, den es nicht mehr gibt, steht hier NICHT, weil
      // sie hierher gehoert, sondern weil ueber sie nichts zu sagen ist.
      (function () {
        if (gsWahl.art !== "passend") return "";
        // Ohne Ordner und aus geloeschten Ordnern stehen seit 17.09.
        // in ihren eigenen Faechern - hier bleibt nur der Fall "gehoert
        // wirklich zu DIESEM Ordner, aber ohne Wetten-Kennung".
        let hier = 0;
        for (const e of liste) {
          if (e.unlesbar || (e.wetten || []).some(t => t && t.id)) continue;
          if (!e.satz) continue;
          if (SAETZE.some(x => x.id === e.satz)) hier++;
        }
        return hier
          ? " <b>" + hier + "</b> Kombination(en) <b>ganz ohne Wetten-Kennung</b> (alte " +
            "Fotoscheine) stehen hier, weil sie zu <b>diesem</b> Ordner gehören - ihre " +
            "Wetten sind deshalb alle grau."
          : "";
      })() +
      wegText() +
      (gsWahl.art !== "passend"
        ? ' <button onclick="gsNurPassendeZeigen()">zurück: passend zur Tabelle</button>' : "") +
      (liste.length !== alle.length ? " (dazu " + (alle.length - liste.length) +
        " bei anderen Anbietern ausgeblendet)" : "") + " " +
      '<span id="gs_stand_summe"></span></p>';
  // Die Ausgaenge nur fuer die gezeichneten Zeilen holen - die
  // data-erg-Nummern zeigen in genau diese Liste.
  zeichneGesetzteAusgaenge(zeigenListe);
}

// Karam (17.09.2026): "Dann kann ich auf den jeweiligen Einsatz druecken
// bei den gesetzten Kombis, und dann bringt es mich direkt zu dem
// vorgeschlagenen Einsatz bei der Liste unten dran, wo ich sie
// auswaehlen kann."
// Der Sprung laeuft NUR ueber die Wetten-Kennung (Regel 2). Steht die
// Zeile gerade nicht in der Tabelle (Zeitraumfilter, anderer Ordner),
// wird das GESAGT statt still nichts zu tun.
function gsZuWette(wetteId) {
  const kaesten = [...document.querySelectorAll(".eb-wahl")]
    .filter(c => String(c.value).split("|")[0] === String(wetteId));
  if (!kaesten.length) {
    meldung("Diese Wette steht gerade nicht in der Tabelle. Meist ist ein " +
      "Zeitraum-Filter offen oder ein anderer Ordner gewählt.", "warn");
    return;
  }
  const zeilen = kaesten.map(c => c.closest("tr")).filter(Boolean);
  if (!zeilen.length) return;
  // Alte Blitzmarken weg, dann die neuen setzen. Die Marke ist eine
  // Umrandung, KEIN Hintergrund - der Hintergrund traegt die Kombi-Farbe
  // und darf nicht ueberdeckt werden.
  document.querySelectorAll(".tb-blitz").forEach(z => z.classList.remove("tb-blitz"));
  for (const z of zeilen) z.classList.add("tb-blitz");
  try { zeilen[0].scrollIntoView({ block: "center", behavior: "smooth" }); }
  catch (e) { zeilen[0].scrollIntoView(); }
  // Die Marke raeumt sich selbst weg - sie soll zeigen, nicht bleiben.
  setTimeout(() => zeilen.forEach(z => z.classList.remove("tb-blitz")), 4000);
}

// ---------- Die Tabelle: alles wie im Foto, zum Selberbauen ----------
// Karams Wunsch (30.08.2026): keine fertig gestellten Scheine mehr raten
// muessen, sondern die ganze Tabelle sehen - jede Wettmoeglichkeit als
// eigene Zeile, daneben BEIDE Quoten, und ganz rechts, wie viel auf diese
// Wette schon gesetzt wurde. Anhaken, Anbieter waehlen, Kombi bauen.
// ---------- Zeitraum-Filter der Tabelle (nur Anzeige) ----------
// Karam (16.09.2026): "Ich kann mir aussuchen, welche Spiele ich suchen
// moechte. Deren Abpfiffdatum ist mir wichtig. Ich will Spiele, die nur
// ab diesem Datum bis diesem Datum abgepfiffen werden. Das kann halt nur
// in die Zukunft reinschauen. Davon werden alle noch offenen oder noch
// moeglichen Wetten angezeigt."
// Er filtert NUR die Anzeige. satzWetten(), istVorbei() und liesAnstoss()
// bleiben unangetastet, es wird nichts geloescht und nichts umgerechnet.
let ebVon = "";            // "JJJJ-MM-TT" oder leer
let ebBis = "";
let ebNurOffen = true;     // nur Spiele, die noch nicht angepfiffen sind

// Karam (16.09.2026): "Wenn ich ein Datum angebe, ist es unabhaengig vom
// Ordner. Alles, was in jeder einzelnen Zeile ein Spiel zwischen diesem
// Datum und diesem Datum hat, ist drinnen, unabhaengig vom Ordner. Auch
// von alten Ordnern."
// Sobald also eine der beiden Grenzen steht, sucht die Tabelle in ALLEN
// Foto-Ordnern, nicht nur im offenen. Ohne Grenze bleibt alles wie zuvor.
function ebZeitraumAn() { return !!(ebVon || ebBis); }

// ---------- "Steht auch woanders" ----------
// Dieselbe Partie kann in ZWEI Foto-Ordnern stehen und bekommt dort zwei
// verschiedene Wetten-Kennungen (die Doppelt-Pruefung beim Einlesen sieht
// immer nur den Ziel-Ordner, admin.js). Der Zaehler "schon dreimal
// gesetzt" laeuft ueber die Kennung und saehe die zweite Zeile nicht.
//
// Darum dieser WEICHE Vergleich. Er ist ausdruecklich NUR ein Hinweis
// neben der Zahl, nie die Zahl selbst: die harte Zahl bleibt die ueber
// die Kennung, weil die immer stimmt.
// Die Liga bleibt bewusst draussen. Sie kommt aus der Texterkennung und
// bleibt oft leer (admin.js laesst sie weg, wenn die Foto-Zeile nur zwei
// Textfelder hergibt). Waere sie im Schluessel, gaelte dieselbe Partie je
// nach Foto als zwei verschiedene und der Hinweis bliebe genau dann aus,
// wenn man ihn braucht.
// Ohne Anpfiff-Tag gibt es KEINEN Schluessel: ueber Spielnamen allein
// wird hier nichts behauptet.
function ebTagVon(an) {
  const t = String(an || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
}

function ebWeich(t) {
  return String(t == null ? "" : t).toLowerCase().trim().replace(/\s+/g, " ");
}

function ebWeichSchluessel(spiel, an, linie) {
  const tag = ebTagVon(an), s = ebWeich(spiel);
  if (!tag || !s) return "";
  return s + "@" + tag + "|" + ebWeich(linie);
}

// Drei Antworten, nicht zwei: true = zeigen, false = raus, null = ueber
// den Abpfiff ist nichts bekannt. null darf NIE stillschweigend
// verschwinden, sonst fehlt Karam eine Wette, die es sehr wohl gibt.
function ebZeitPasst(w) {
  const an = anstossFeld(w);
  if (ebNurOffen && istVorbei(an)) return false;
  if (!ebVon && !ebBis) return true;
  const e = abpfiffZeit(an);
  if (!e) return null;
  // Ein unlesbares Datumsfeld darf nicht heimlich alles wegfiltern:
  // dann gilt diese Grenze schlicht nicht.
  if (ebVon) {
    const v = new Date(ebVon + "T00:00");
    if (!isNaN(v.getTime()) && e < v) return false;
  }
  if (ebBis) {
    const b = new Date(ebBis + "T23:59");
    if (!isNaN(b.getTime()) && e > b) return false;
  }
  return true;
}

function ebFiltern() {
  const v = document.getElementById("eb_von");
  const b = document.getElementById("eb_bis");
  const o = document.getElementById("eb_nuroffen");
  if (v) ebVon = v.value;
  if (b) ebBis = b.value;
  if (o) ebNurOffen = o.checked;
  // Beide: die Gesetzt-Liste haengt seit heute daran, WELCHE Wetten in
  // der Tabelle stehen. Zeichnete man nur die Tabelle, zeigte die Liste
  // darunter weiter den alten Zeitraum - zwei Wahrheiten auf einer Seite.
  // Auch die Auswahl oben: sie sagt in einem Satz, was gerade gilt.
  // Zeichnete man sie nicht mit, staende dort der alte Zustand.
  zeichneOrdnerWahl();
  zeichneEigenbau();          // nichts wird nachgeladen, nur neu gezeichnet
  zeichneGesetzte();
}

function ebAllesZeigen() {
  ebVon = ""; ebBis = ""; ebNurOffen = false;
  zeichneOrdnerWahl();
  zeichneEigenbau();
  zeichneGesetzte();
}

// WELCHE WETTEN STEHEN GERADE IN DER GROSSEN TABELLE?
// Genau EINE Stelle beantwortet das. Die Tabelle selbst fragt hier, und
// die Gesetzt-Liste darunter fragt hier ebenfalls - sonst zeigten die
// beiden Listen auf einer Seite verschiedene Mengen, ohne dass es
// jemandem auffiele.
function ebSichtbareWetten() {
  // Ein gesetzter Zeitraum hebt die Ordnergrenze auf (siehe ebZeitraumAn).
  const roh = ebZeitraumAn() ? WETTEN.slice() : satzWetten();
  // Angehakte Zeilen werden NIE ausgeblendet. Sonst faellt eine Wette
  // aus der Auswahl, ohne dass jemand es merkt, und die gebaute
  // Kombination haette ein Bein weniger als gewollt.
  const angehakt = new Set([...document.querySelectorAll(".eb-wahl:checked")]
    .map(c => String(c.value).split("|")[0]));
  let ausZeit = 0, ohneZeit = 0;
  const liste = roh.filter(w => {
    if (angehakt.has(String(w.id))) return true;
    const p = ebZeitPasst(w);
    if (p === null) { ohneZeit++; return true; }   // Resttopf: bleibt sichtbar
    if (!p) { ausZeit++; return false; }
    return true;
  });
  return { roh: roh, liste: liste, ausZeit: ausZeit, ohneZeit: ohneZeit };
}

// Die Kennungen davon, als Menge. Die Gesetzt-Liste fragt damit je Bein:
// "steckst du in dem, was Karam gerade vor sich hat?"
function ebSichtbareIds() {
  const m = new Set();
  for (const w of ebSichtbareWetten().liste) m.add(String(w.id));
  return m;
}

// ============================================================
// ORDNER ODER ZEITRAUM - die Auswahl ueber der grossen Tabelle
// ============================================================
// Karam (17.09.2026): "Beim Kombibau moechte ich da, wo ich die ganze
// Tabelle habe, eine Auswahl haben. Ich kann einen Ordner aussuchen oder
// einen Zeitraum. Wenn ich gerade einen aktiven Ordner habe, dann suche
// ich mir den aus, das ist der Default-Ordner, wenn ich nichts anderes
// aussuche. Sonst muss ich bei der Suchleiste daneben den Ordner suchen,
// den ich jetzt spielen moechte. Oder ich suche mir einen Zeitraum, und
// dann fallen die Ordner aus."
//
// DREI ZUSTAENDE, ABER KEIN VIERTER SPEICHER.
// Die Lage wird aus dem abgeleitet, was ohnehin schon gilt: "kt_satz" und
// die beiden Datumsfelder. Ein eigener gespeicherter "Modus" koennte dem
// widersprechen, was die Tabelle wirklich zeigt - und dann staende auf
// dem Schirm etwas anderes, als unten in der Liste steht.
//
// Der Zeitraum UEBERSTIMMT den Ordner nur, er aendert ihn nie. Genau das
// meint Karam mit "dann fallen die Ordner aus": ebSichtbareWetten nimmt
// bei gesetztem Zeitraum WETTEN.slice(), also alle Ordner. Nimmt er den
// Zeitraum weg, ist er wieder in seinem Ordner.
//
// Das Suchfeld steht NICHT in #eigenbau. zeichneEigenbau ersetzt dort
// alles, und bei jedem Tastendruck wuerde die ganze Tabelle neu gebaut
// und der Fokus spraenge aus dem Feld.
let owSuche = "";          // absichtlich NICHT gemerkt, wie obSuche in mein.js
let owOffen = "";          // "" | "ordner" | "zeit"

function owLage() {
  const id = (typeof aktiverSatzId === "function") ? aktiverSatzId() : null;
  if (ebZeitraumAn()) return { art: "zeit", satz: id };
  if (id === SATZ_ALLE) return { art: "alle", satz: id };
  return { art: "ordner", satz: id };
}

function owReiter(art) {
  const lage = owLage();
  if (art === "alle") {
    if (lage.satz !== SATZ_ALLE) { satzWaehlen(SATZ_ALLE); return; }  // laedt neu
    owOffen = (owOffen === "ordner") ? "" : "ordner";
  } else if (art === "ordner") {
    // Der Heimatknopf: steht ein Zeitraum, nimmt ein Tipp ihn weg und man
    // ist zurueck im eigenen Ordner.
    if (ebZeitraumAn()) { owZeitWeg(); return; }
    owOffen = (owOffen === "ordner") ? "" : "ordner";
  } else {
    owOffen = (owOffen === "zeit") ? "" : "zeit";
  }
  zeichneOrdnerWahl();
}

// Zeitraum weg, Ordner zurueck. Bewusst NICHT ebAllesZeigen(): das
// schaltet zusaetzlich "nur noch offene Spiele" aus, und dieser Haken ist
// eine eigene Entscheidung von Karam. Ihn stillschweigend mitzukippen
// waere eine Aenderung, die er nicht verlangt hat.
function owZeitWeg() {
  ebVon = ""; ebBis = "";
  zeichneOrdnerWahl();
  zeichneEigenbau();
  zeichneGesetzte();
}

// Nur die Liste neu, nie den ganzen Kasten: sonst ist das Suchfeld nach
// dem ersten Buchstaben weg. Dieselbe Falle wie bei obSuchen in mein.js.
function owSuchen(wert) {
  owSuche = String(wert || "");
  const k = document.getElementById("ow_liste");
  if (k) k.innerHTML = owListeHtml();
  const z = document.getElementById("ow_treffer");
  if (z) z.innerHTML = owTrefferText();
}

function owTreffer() {
  return SAETZE.slice().reverse().filter(x => satzPasst(x, owSuche));
}

function owTrefferText() {
  if (!owSuche) return SAETZE.length + " Ordner";
  const n = owTreffer().length;
  return n + " von " + SAETZE.length + " passen auf die Suche";
}

function owListeHtml() {
  const id = aktiverSatzId();
  const treffer = owTreffer();
  if (!treffer.length) {
    return '<p class="mini">Kein Ordner gefunden. Tippfehler? Er ist nicht weg, ' +
      "nur nicht getroffen. Notizen findest du nur auf dem Gerät, auf dem du sie " +
      "geschrieben hast.</p>";
  }
  return treffer.map(x => {
    const d = (typeof satzDeko === "function") ? satzDeko(x.id) : {};
    const n = WETTEN.filter(w => wettenSatz(w) === x.id).length;
    return '<button class="ordnerwahl' + (x.id === id ? " aktiv" : "") +
      '" style="border-color:' + (d.farbe || "#1a2c50") + '" ' +
      'onclick="satzWaehlen(\'' + x.id + '\')">' +
      (d.emoji ? d.emoji + " " : "") + textSicher(x.titel) +
      ' <span class="mini">' + n + " Wetten</span>" +
      (x.id === id ? " (offen)" : "") + "</button>";
  }).join("");
}

// Ein ganzer Satz, der sagt, was gerade gilt. Karam hat heute zweimal
// nicht verstanden, warum er etwas sieht - der Zustand muss dastehen,
// nicht erraten werden.
function owLageSatz() {
  const lage = owLage();
  const tag = (t) => t ? t.split("-").reverse().join(".") : "";
  if (lage.art === "zeit") {
    return "Du siehst den <b>Zeitraum " +
      (ebVon ? tag(ebVon) : "Anfang") + " bis " + (ebBis ? tag(ebBis) : "offen") +
      "</b> aus <b>allen " + SAETZE.length + " Ordnern</b>. Dein Ordner <b>" +
      textSicher(satzTitelVon(lage.satz)) + "</b> gilt hier nicht - er ist zurück, " +
      "sobald du den Zeitraum wegnimmst.";
  }
  if (lage.art === "alle") {
    return "Du siehst <b>alle " + SAETZE.length + " Ordner zusammen</b>, " +
      WETTEN.length + " Wetten.";
  }
  const n = satzWetten().length;
  const offen = satzWetten().filter(w => !istVorbei(anstossFeld(w))).length;
  return "Du siehst <b>einen Ordner: " + textSicher(satzTitelVon(lage.satz)) +
    "</b>. " + n + " Wetten, " + offen + " noch offen. Kein Zeitraum gesetzt.";
}

// Was ist angehakt, und aus wie vielen Ordnern? Sobald mehr als ein
// Ordner auf dem Schirm ist, kann eine Kombination unbemerkt aus zwei
// Ordnern zusammengebaut werden. Das ist Geld, also muss es dastehen.
function owHakenWarnung() {
  const lage = owLage();
  if (lage.art === "ordner") return "";
  let haken = [];
  try {
    haken = [...document.querySelectorAll(".eb-wahl:checked")]
      .map(c => String(c.value).split("|")[0]);
  } catch (e) { return ""; }
  if (!haken.length) return "";
  const ordner = new Set();
  for (const id of haken) {
    const w = wetteNachId(id);
    if (w) ordner.add(wettenSatz(w));
  }
  if (ordner.size < 2) return "";
  return '<div class="ow-warn mini"><b>Achtung:</b> von den ' + haken.length +
    " angehakten Zeilen kommen die Spiele aus <b>" + ordner.size +
    " verschiedenen Ordnern</b>. Das darf so sein, es ist nur selten gewollt - " +
    "in der Tabelle steht bei jeder Zeile, aus welchem Ordner sie kommt.</div>";
}

function zeichneOrdnerWahl() {
  const box = document.getElementById("ordnerwahl");
  if (!box) return;
  if (!SAETZE.length) {
    box.innerHTML = '<div class="ow-kasten mini">Noch kein Foto-Ordner eingelesen.</div>';
    return;
  }
  const lage = owLage();
  const heim = (lage.satz && lage.satz !== SATZ_ALLE)
    ? satzTitelVon(lage.satz) : "Ordner wählen";
  const reiter = (art, text, an) =>
    '<button class="ow-reiter' + (an ? " aktiv" : "") +
    '" onclick="owReiter(\'' + art + '\')">' + text + "</button>";

  let html = '<div class="ow-kasten">' +
    '<div class="ow-reiter-zeile">' +
      reiter("ordner", "&#128193; " + textSicher(heim), lage.art === "ordner") +
      reiter("alle", "&#128218; ALLE " + SAETZE.length + " Ordner", lage.art === "alle") +
      reiter("zeit", "&#128197; Zeitraum", lage.art === "zeit") +
    "</div>";

  if (owOffen === "ordner") {
    html += '<div class="ow-panel">' +
      '<input id="ow_suche" class="ow-suche" placeholder="Ordner suchen: 24.08, 2026-09, oder ein Wort" ' +
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
        'value="' + textSicher(owSuche) + '" oninput="owSuchen(this.value)">' +
      ' <span id="ow_treffer" class="mini">' + owTrefferText() + "</span>" +
      '<div class="ordnerliste" id="ow_liste">' + owListeHtml() + "</div></div>";
  }

  if (owOffen === "zeit" || lage.art === "zeit") {
    // DIESELBEN Felder wie bisher, nur an einer anderen Stelle: ebFiltern
    // sucht sie ueber ihre Kennung, nicht ueber ihren Platz. Sie stehen
    // jetzt nur noch HIER, nicht mehr zusaetzlich an der Tabelle - zwei
    // Felder mit derselben Kennung waeren ein Fehler, den niemand sieht.
    html += '<div class="ow-panel"><b>Abpfiff</b> ' +
      '<label>von <input type="date" id="eb_von" value="' + textSicher(ebVon) +
        '" onchange="ebFiltern()"></label> ' +
      '<label>bis <input type="date" id="eb_bis" value="' + textSicher(ebBis) +
        '" onchange="ebFiltern()"></label> ' +
      '<label><input type="checkbox" id="eb_nuroffen"' + (ebNurOffen ? " checked" : "") +
        ' onchange="ebFiltern()"> nur noch offene Spiele</label>' +
      (ebZeitraumAn()
        ? ' <button onclick="owZeitWeg()">Zeitraum weg, zurück zum Ordner</button>'
        : ' <span class="mini">Sobald hier ein Datum steht, sucht die Tabelle in ' +
          "ALLEN Ordnern.</span>") +
      "</div>";
  }

  html += '<div class="ow-satz mini">' + owLageSatz() + "</div>" +
    '<div id="ow_haken">' + owHakenWarnung() + "</div></div>";
  box.innerHTML = html;
}

function zeichneEigenbau() {
  const box = document.getElementById("eigenbau");
  if (!box) return;
  const sicht = ebSichtbareWetten();
  const roh = sicht.roh;
  if (!roh.length) { box.innerHTML = '<p class="mini">Keine Wetten im Ordner.</p>'; return; }
  const alle = sicht.liste;
  const ausZeit = sicht.ausZeit, ohneZeit = sicht.ohneZeit;
  const ersatzMind = mindWert(liesZustand() || {});
  // Sobald mehr als ein Ordner in der Tabelle steht, bekommt jede Zeile
  // eine Ordner-Spalte. Ohne sie saehen zwei gleich benannte Spiele aus
  // verschiedenen Tagen identisch aus.
  const alleOrdner = (aktiverSatzId() === SATZ_ALLE) || ebZeitraumAn();

  // Was steht schon auf welcher LINIE? Karam (03.09.): die Summe gehoert
  // an die Zeile der Linie, die wirklich gesetzt wurde - nicht immer an
  // die oberste Zeile der Wette. Alte Eintraege ohne Linien-Angabe landen
  // weiter bei der ersten Zeile (das macht zeilenTreffer).
  //
  // IMMER alle Ordner (SATZ_ALLE), auch wenn nur einer offen ist.
  // Karam (16.09.2026): "Wie oft das gesetzt wurde, ist mir sehr wichtig,
  // auch von alten Ordnern." Ein Zaehler, der einen Ordner uebersieht,
  // sagt "noch nie gesetzt" - und dann setzt er sie ein zweites Mal.
  //
  // Anzahl UND Summe kommen aus derselben Liste (zeilenTreffer), damit
  // sie nie auseinanderlaufen koennen.
  const gesetztListe = gesetzteEintraege(SATZ_ALLE);
  // Unlesbare Kombinationen haben gar keine Beine (gesetzteEintraege legt
  // sie ausdruecklich mit wetten: [] ein, damit sie keine Summe
  // verfaelschen). Sie koennen deshalb in KEINER Zeile mitzaehlen. Das
  // muss dastehen, sonst liest Karam eine zu niedrige Zahl als Wahrheit.
  const unlesbarZahl = gesetztListe.filter(e => e.unlesbar).length;
  // Und der schlimmere Fall: das Konto ist gar nicht geladen. Dann kennt
  // die Spalte nur den Geraetespeicher, steht ueberall leer - und leer
  // heisst fuer Karam "noch nie gesetzt". Der Fusstext verspricht aber
  // ALLE Ordner. Eine stille Luecke unter einer ausgesprochenen Zusage
  // ist das Gefaehrlichste, was hier stehen kann.
  const kontoFehlt = (typeof kontoGeladen !== "undefined") && !kontoGeladen && !!window.supa;
  // Zaehlung und Anbieter-Zeichen ueber ALLE Ordner, Farben nur fuer die
  // Kombinationen des offenen Ordners - genau die stehen unten in der
  // Liste "Gesetzt", und nur dort hilft die Farbe beim Wiederfinden.
  const karte = kombiKarte(gesetztListe, gesetzteEintraege());
  // Zusaetzlich der weiche Schluessel (siehe ebWeichSchluessel): damit
  // faellt auf, wenn dieselbe Partie ueber die Zeile eines ANDEREN
  // Ordners schon gesetzt ist. Nur Hinweis, nie Zahl.
  const weich = {};
  for (const e of gesetztListe)
    for (const t of (e.wetten || [])) {
      if (!t) continue;
      // Kein "if (!t.id) continue" wie sonst: von Hand angelegte
      // Kombinationen (personkombi.js) haben gar keine Wetten-Kennung und
      // faellen sonst aus jeder Zaehlung heraus. Fuer den Hinweis reichen
      // Spielname, Anpfiff und Linie.
      // Den Anpfiff moeglichst von der WETTE nehmen, nicht vom Bein: das
      // Bein hat die Zeit vom Tag des Setzens gespeichert. Wird sie
      // spaeter korrigiert, haette die Zeile den neuen Tag und das Bein
      // den alten, und der Hinweis bliebe genau dann aus.
      const bw = t.id ? wetteNachId(t.id) : null;
      const an = bw ? anstossFeld(bw) : (t.an || t.an_zeit);
      const k = ebWeichSchluessel(t.spiel, an, t.linie);
      if (!k) continue;
      (weich[k] = weich[k] || []).push({ id: t.id ? String(t.id) : "", nummer: e.nummer,
        kz: e.kz, einsatz: Number(e.einsatz) || 0, stand: e.stand || "",
        finger: e.finger || "", stamm: e.stamm || "",
        satz: t.satz || e.satz || "" });
    }

  let zeilen = "", offen = 0;
  // Karam (18.09.2026): "In der Kombi-Bau-Tabelle immer eine Nummerierung,
  // 1, 2, 3 - jeder EINSATZ eine Nummer, nicht jede Linie. Diese Zahl
  // bedeutet gar nichts, nur fuer die Tabellenanzeige."
  // Also die vierte Zahl-Falle gleich mit ansagen (UEBERGABE Punkt 5):
  // das hier ist WEDER s.nr noch anzeigeNr noch die feste nummer. Sie
  // laeuft bei jedem Zeichnen neu von 1 und haengt an nichts.
  let lfdNr = 0;
  for (const w of alle) {
    lfdNr++;
    const vorbei = istVorbei(anstossFeld(w));
    const anzahl = Array.isArray(w.o) ? w.o.length : 0;
    for (let i = 0; i < anzahl; i++) {
      if (!vorbei) offen++;
      const treffer = zeilenTreffer(karte, w, i);
      // Wie oft und wie viel auf GENAU DIESE Linie schon draussen ist.
      const malH = treffer.length;
      const gesetztH = treffer.reduce((s, t) => s + (Number(t.einsatz) || 0), 0);
      // Dieselbe Partie, aber ueber die Zeile eines anderen Ordners.
      const wk = ebWeichSchluessel(w.spiel, anstossFeld(w), optionName(w, i));
      // Ohne Kennung (Handeingabe) kann es nicht dieselbe Zeile sein.
      const anderswo = wk ? (weich[wk] || []).filter(x => !x.id || x.id !== String(w.id)) : [];
      const kzs = [];
      for (const t of treffer) if (t.kz && kzs.indexOf(t.kz) < 0) kzs.push(t.kz);
      const stil = hintergrundFuer(karte, treffer);
      zeilen += '<tr class="' + (vorbei ? "tb-vorbei" : "") + (i ? " tb-weiter" : "") + '"' +
        (stil ? ' style="' + stil + '"' : "") + ">" +
        // Die laufende Nummer nur an der ERSTEN Zeile eines Einsatzes -
        // weitere Linien desselben Spiels sind derselbe Einsatz.
        '<td class="tb-lfd">' + (i ? "" : lfdNr) + "</td>" +
        '<td class="tb-marken">' + kzs.map(anbieterZeichen).join("") + "</td>" +
        '<td class="tb-wahl"><input type="checkbox" class="eb-wahl" value="' + w.id + "|" + i + '"' +
          (vorbei ? " disabled" : "") + ' onchange="ebZaehlen()"></td>' +
        '<td class="mini tb-zeit">' + (i ? "" : zeitText(anstossFeld(w))) + "</td>" +
        (alleOrdner ? '<td class="mini tb-ordner">' +
          (i ? "" : textSicher(satzTitelVon(w.satz))) + "</td>" : "") +
        '<td class="mini">' + (i ? "" : textSicher(w.liga)) + "</td>" +
        "<td>" + (i ? "" : "<b>" + textSicher(w.spiel) + "</b>") + "</td>" +
        '<td class="tb-wette">' + textSicher(optionName(w, i)) +
          ' <span class="reiter-chip">' + textSicher(w.s) + "</span></td>" +
        '<td class="tb-q">' + Number(w.o[i][1]).toFixed(2) + "</td>" +
        '<td class="tb-q tb-mind">' + mindFuer(w, i, ersatzMind).toFixed(2) +
          (w.o[i].length > 2 ? "" : '<span class="tb-ersatz">*</span>') + "</td>" +
        // Karam will die ANZAHL sehen: "die wurde schon dreimal gesetzt".
        // Bei null bleibt die Zelle leer, es wird keine Null behauptet.
        '<td class="tb-gesetzt"' + (malH ? ' title="' + textSicher(gesetztMalText(treffer)) + '"' : "") + ">" +
          (malH ? '<b class="tb-mal">' + malH + "&times;</b>" +
            (gesetztH ? " " + gesetztH.toFixed(2) + " &euro;" : "") : "") +
          (anderswo.length ? '<span class="tb-anderswo" title="' +
            textSicher(gesetztMalText(anderswo) +
              "\nDasselbe Spiel zur selben Anstoßzeit, aber über die Zeile eines " +
              "anderen Ordners. Nicht in der Zahl links mitgezählt.") + '">+' +
            anderswo.length + " anderswo</span>" : "") +
        "</td></tr>";
    }
  }

  const anb = KT_ANBIETER_RANG.map(kz =>
    '<option value="' + kz + '">' + textSicher(anbieterName(kz)) + "</option>").join("");

  const gefiltert = (ausZeit > 0) || ebVon || ebBis;
  box.innerHTML =
    '<div class="tb-leiste">' +
      '<label>Anbieter: <select id="eb_kz">' + anb + "</select></label> " +
      '<button class="haupt" onclick="eigenbauAnlegen()">&#129513; Aus der Auswahl bauen</button> ' +
      '<span id="eb_zaehler" class="mini">nichts angehakt</span>' +
    "</div>" +
    // Die Zeitraum-FELDER stehen seit 17.09.2026 oben in der Auswahl
    // (zeichneOrdnerWahl), damit Ordner und Zeitraum an EINER Stelle
    // gewaehlt werden. Zwei Felder mit derselben Kennung waeren ein
    // Fehler, den niemand sieht: getElementById nimmt immer nur das
    // erste. Hier bleiben nur die Hinweise, die zur TABELLE gehoeren.
    '<div class="tb-leiste tb-zeitraum">' +
      (gefiltert ? '<button onclick="ebAllesZeigen()">alles zeigen</button> ' : "") +
      (kontoFehlt ? '<span class="mini warnton"> Die gesetzten Kombinationen aus dem Konto ' +
        "konnten nicht geladen werden. Die Spalte &quot;gesetzt&quot; zeigt nur, was auf " +
        "diesem Gerät liegt, und ist damit unvollständig.</span>" : "") +
      (unlesbarZahl ? '<span class="mini warnton"> ' + unlesbarZahl +
        (unlesbarZahl === 1 ? " Kombination ist" : " Kombinationen sind") +
        " auf diesem Gerät nicht lesbar. Was darin steckt, fehlt in der Spalte " +
        "&quot;gesetzt&quot; - die Zahlen dort können also zu niedrig sein.</span>" : "") +
      (ausZeit ? '<span class="mini"> ' + ausZeit +
        (ausZeit === 1 ? " Spiel" : " Spiele") + " ausgeblendet</span>" : "") +
      (ohneZeit ? '<span class="mini warnton"> ' + ohneZeit +
        (ohneZeit === 1 ? " Spiel hat" : " Spiele haben") + " keine Anstoßzeit - " +
        "sie bleiben stehen, weil über ihren Abpfiff niemand etwas sagen kann</span>" : "") +
    "</div>" +
    (alle.length ? "" : '<p class="mini warnton">In diesem Zeitraum liegt kein Spiel. ' +
      '<button onclick="ebAllesZeigen()">alles zeigen</button></p>') +
    // tb-mitordner sagt dem Stil, dass eine Spalte mehr dasteht. Ohne
    // diese Kennung wuerde die Handy-Regel die Ordner-Spalte ausblenden
    // statt der Liga - also genau die Spalte, die die Ordner unterscheidet.
    '<div class="tabellenrand"><table class="tb-tafel' +
      (alleOrdner ? " tb-mitordner" : "") + '"><thead><tr>' +
      // ACHTUNG Spaltenfolge: die Handy-Regel in stil.css blendet die
      // Liga ueber th/td:nth-child aus - wer hier Spalten einschiebt,
      // zieht dort die Nummern nach (so wie am 18.09. fuer diese Spalte
      // geschehen: Liga ist seither Spalte 5 bzw. 6).
      '<th class="tb-lfd" title="Laufende Nummer, nur zum Zählen der Einsätze - sie bedeutet nichts und läuft bei jedem Neuzeichnen wieder ab 1">#</th>' +
      '<th class="tb-marken" title="Bei welchen Anbietern diese Wette schon gesetzt ist">wo</th>' +
      "<th></th><th>Anstoß</th>" + (alleOrdner ? "<th>Ordner</th>" : "") +
      "<th>Liga</th><th>Spiel</th><th>Wette</th>" +
      "<th>Quote</th><th>Mindest</th>" +
      '<th title="Wie oft und wie viel auf diese Linie schon gesetzt wurde">gesetzt' +
        (kontoFehlt ? '<br><span class="mini warnton">unvollständig</span>'
                    : '<br><span class="mini">alle Ordner</span>') + "</th>" +
      "</tr></thead><tbody>" +
      zeilen + "</tbody></table></div>" +
    '<p class="mini"><b>' + alle.length + " Einsätze</b> in der Tabelle (die Nummern links), " +
      offen + " Wettmöglichkeiten offen. Jede Linie eines Spiels steht als " +
      "eigene Zeile - du setzt nur eine davon. <b>Quote</b> ist die linke Spalte aus dem Foto, " +
      "<b>Mindest</b> die rechte. Ein <b>*</b> heißt: für diese Zeile stand im Foto keine " +
      "Mindestquote, es gilt der Ersatzwert " + ersatzMind.toFixed(2) + ". " +
      "<b>gesetzt</b> sagt, <b>wie oft</b> diese Linie schon gesetzt wurde und wie viel " +
      "insgesamt darauf steht" +
      (kontoFehlt ? " - <b>unvollständig, das Konto konnte nicht geladen werden</b>"
                  : " - über ALLE Foto-Ordner, nicht nur über den offenen") +
      " (ältere Einträge ohne Linien-Angabe zählen zur ersten Zeile). " +
      "Der Betrag ist der <b>ganze Einsatz der Kombination</b> und steht deshalb an jedem " +
      "ihrer Beine: die Spalte darf man nicht von oben nach unten addieren. " +
      "Zeig mit der Maus darauf, dann stehen die einzelnen Scheine da. " +
      "<b>+N anderswo</b> heißt: dasselbe Spiel zur selben Anstoßzeit steht auch in einem " +
      "anderen Ordner und wurde dort gesetzt. Das ist ein Hinweis, keine Zahl - in der " +
      "Zahl links steckt es nicht drin. " +
      "<b>wo</b> zeigt die Anbieter, bei denen die Wette in einer gesetzten Kombination steckt; " +
      "die Hintergrundfarbe ist die Farbe dieser Kombination (siehe Gesetzt), bei mehreren geteilt.</p>";
  ebZaehlen();
}

// Zeigt laufend, was angehakt ist - und warnt sofort bei zwei Zeilen
// desselben Spiels, statt erst beim Bauen.
function ebZaehlen() {
  // Die Warnung oben haengt an den Haken: nur SIE wird aufgefrischt, nicht
  // der ganze Kasten - sonst waere ein offenes Suchfeld nach jedem Haken
  // wieder leer.
  const hk = document.getElementById("ow_haken");
  if (hk) hk.innerHTML = owHakenWarnung();
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
    ? wahl.length + " angehakt" + (wahl.length === 1 ? " = Einzelwette" : " = Kombination") +
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
  // SATZ_ALLE, nicht der offene Ordner. Seit die Tabelle bei gesetztem
  // Zeitraum Zeilen aus allen Ordnern zeigt, kann dieselbe Kombination
  // aus einem aelteren Ordner stammen. Wer hier nur den offenen Ordner
  // liest, laesst sie ohne Rueckfrage ein zweites Mal entstehen.
  for (const e of gesetzteEintraege(SATZ_ALLE)) {
    if (e.unlesbar || e.kz !== kz) continue;
    const ist = (e.wetten || []).map(t => String(t.id) + ":" + String(t.linie || "")).sort().join("|");
    if (ist && ist === soll) return e;
  }
  return null;
}

function eigenbauAnlegen() {
  const wahl = [...document.querySelectorAll(".eb-wahl:checked")].map(c => c.value);
  // Karam (15.09.2026): eine angehakte Zeile ergibt eine Einzelwette,
  // mehrere eine Kombination. Vorher war bei einer Zeile Schluss.
  if (wahl.length < 1) { meldung("Bitte mindestens eine Zeile anhaken - eine ergibt eine Einzelwette.", "warn"); return; }
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
    wetten: wetten, entfernt: [], gebautAm: new Date().toISOString() });
  speichereZustand(z);
  // anzeigeNr erst NACH dem Speichern: vorher steht der neue Schein noch
  // nicht in der Liste, ueber die gezaehlt wird.
  meldung("<b>" + (wetten.length === 1 ? "Einzelwette " : "Kombination ") + anzeigeNr(z, nr) + "</b> (" +
    wetten.length + (wetten.length === 1 ? " Wette, " : " Wetten, ") +
    textSicher(anbieterName(kz)) + ") angelegt - oben Einsatz eintragen.", "gut");
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
    ? "Teil " + s.teil + " von " + scheinWort(s) + " " + nr + " bei " + anbieterName(s.kz) +
      // "Die anderen 1 Teile" - Karam liest das am Handy, das darf nicht holpern.
      " löschen?\n\n" + (gruppe.length === 2
        ? "Der andere Teil bleibt stehen."
        : "Die anderen " + (gruppe.length - 1) + " Teile bleiben stehen.")
    : scheinWort(s) + " " + nr + " löschen?" +
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

  meldung((s.teil ? "Teil " + s.teil + " von " : "") + scheinWort(s) + " " + nr +
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
             // Der Ordner JE WETTE. Im Modus "alle Ordner" kann eine
             // Kombination Wetten aus mehreren Ordnern haben; ohne das
             // faende die Ergebnis-Suche spaeter nichts, weil sie ueber
             // Ordner UND Spiel geht (ergebnisFuer in ergebnisse.js).
             satz: (typeof wettenSatz === "function") ? wettenSatz(w) : undefined,
             quote: rund2(q.echt), quelle: q.quelle, mind: mindFuer(w, eintrag.optIdx, null) };
  });
  // Der Ordner des ganzen Scheins: im Normalfall der offene Ordner, im
  // Modus "alle Ordner" der des ersten Beins. Niemals die Hilfskennung
  // __alle__ - die waere in der Datenbank eine Luege.
  const satzFuerSchein = (aktiverSatzId() === SATZ_ALLE)
    ? ((wetten[0] && wetten[0].satz) || "")
    : aktiverSatzId();
  // HIER entsteht die feste Nummer, und nur hier: eine Kombination, die
  // wirklich gesetzt wird, bekommt eine, die es nie wieder gibt. Blosses
  // Bauen und Mischen verbraucht keine.
  const eintrag = {
    zeit: new Date().toISOString(), scheinId: scheinId, kz: s.kz, satz: satzFuerSchein,
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
  // Die Anbieter-ID vom Feld an der Karte (17.09.2026). Immer als Text
  // dabei, auch leer - "keine ID" ist eine Aussage, kein fehlendes Feld.
  const idFeld = document.getElementById("sid_" + scheinId);
  eintrag.anbieterId = idFeld ? String(idFeld.value).trim() : "";
  // Frueher hing hier die Foto-Auswertung mit dran. Das Foto wird jetzt
  // nur noch mitgenommen, nicht mehr gelesen.
  return { s: s, eintrag: eintrag,
    // Das Bild kommt aus dem Arbeitsspeicher (dort liegt es, seit die
    // Karte gezeichnet wurde), sonst noch aus dem alten localStorage.
    // So wandert es beim Speichern mit in die Datenbank.
    foto: (scheinFotoCache[scheinId] && scheinFotoCache[scheinId].foto) ||
          localStorage.getItem(fotoSchluessel(scheinId)),
    fotoName: (scheinFotoCache[scheinId] && scheinFotoCache[scheinId].name) ||
          localStorage.getItem(fotoSchluessel(scheinId) + "_name") };
}

// ============================================================
// SCHON DA? DANN AENDERN, NICHT DANEBENLEGEN (Karam, 10.09.2026)
//
// Karam: "Wenn ich was im Verlauf aendere, soll das komplett geaendert
// werden - nicht dass das Geld doppelt gilt. Einmal gerechnet, und nur
// die Zahl wird umgeaendert."
//
// Frueher gab es hier nur ja/nein: noch einmal speichern oder gar
// nichts. Wer den falschen Einsatz eingetippt hatte, musste den alten
// Eintrag erst in Mein Bereich suchen und loeschen. Tat er das nicht,
// stand die Kombination zweimal in der Buchhaltung - genau Karams Fall
// "haben wir da doppelt reingemacht".
//
// Jetzt ist AENDERN der erste Vorschlag. Der zweite Eintrag bleibt
// moeglich, aber nur nach einer eigenen, deutlichen Rueckfrage.
//
// Karam (19.09.2026): "Die Quote, die im Verlauf ist, soll fuer immer
// gleich bleiben, die ich dort eingetragen habe - ausser ich gehe in
// diese Kombi rein und aendere das dort bei ihr. Die Quoten aendern
// sich regelmaessig." Beim AENDERN wird deshalb NUR noch der Einsatz
// neu; Quote, Wetten und Anbieter des alten Eintrags bleiben stehen
// (frueher ueberschrieb dieser Weg auch die Quote mit der aktuellen
// Karten-Quote - genau das hat ihm die Vergangenheit verbogen).
// Geaendert wird die Quote nur noch direkt am Eintrag im Auswerten.
// Der Anbieter hat seinen eigenen Weg: verlaufAnbieterNachziehen.
// ============================================================

// Die eine Rechnung fuer beide Speicherorte (Geraet und Konto):
// moeglich und brutto wachsen im selben Verhaeltnis wie der Einsatz,
// damit ein von Hand eingetragener Anbieter-Gewinn sein Verhaeltnis
// behaelt. Ohne alten Wert rechnet die alte Quote.
function aenderNurEinsatz(alt, neuEinsatz) {
  const altEinsatz = Number(alt.einsatz) || 0;
  const f = altEinsatz > 0 ? (neuEinsatz / altEinsatz) : null;
  const moeglich = (f !== null && Number(alt.moeglich))
    ? rund2(Number(alt.moeglich) * f)
    : rund2(neuEinsatz * (Number(alt.quote) || 0));
  const brutto = (f !== null && Number(alt.brutto))
    ? rund2(Number(alt.brutto) * f)
    : rund2(neuEinsatz * (Number(alt.quoteRoh) || Number(alt.quote) || 0));
  return { einsatz: neuEinsatz, moeglich: moeglich, brutto: brutto,
           gebuehr: rund2(brutto - moeglich) };
}
function scheinSchonDaFragen(scheinId, drin, einsatz) {
  const wo = drin.woher === "konto" ? "in deinem Konto" : "auf diesem Gerät";
  const alt = Number(drin.einsatz) || 0;
  const kopf = "Diese Kombination steht schon im Verlauf" +
    (drin.nummer ? " als Nr. " + drin.nummer : "") + " (" + wo +
    (alt ? ", " + alt.toFixed(2) + " Euro" : "") + ").\n\n";

  // Gleicher Betrag: da gibt es nichts zu aendern, nur die harte Frage.
  if (Math.abs(alt - einsatz) >= 0.005) {
    if (confirm(kopf +
        "Den vorhandenen Eintrag auf " + einsatz.toFixed(2) + " Euro ÄNDERN?\n\n" +
        "   OK        = ändern. Es bleibt EINE Buchung, nur die Zahl wird neu.\n" +
        "   Abbrechen = nicht ändern (danach wirst du gefragt, ob du sie\n" +
        "               wirklich ein zweites Mal daneben speichern willst).")) {
      scheinAendernStattDoppelt(scheinId, drin, einsatz);
      return false;
    }
  }
  return confirm(kopf +
    "Wirklich ein ZWEITES Mal speichern?\n\n" +
    "Dann steht sie zweimal im Verlauf und zählt in der Buchhaltung mit " +
    einsatz.toFixed(2) + " Euro doppelt.\n\n" +
    "   OK        = trotzdem zusätzlich speichern\n" +
    "   Abbrechen = gar nichts tun");
}

async function scheinAendernStattDoppelt(scheinId, drin, einsatz) {
  // BEWUSST kein baueVerlaufsEintrag mehr: der brachte die AKTUELLE
  // Karten-Quote mit (und verbrauchte nebenbei eine feste Nummer).
  // Geaendert wird nur der Einsatz - siehe Karams Regel oben.
  const neuEinsatz = Number(einsatz) || 0;
  if (!(neuEinsatz > 0)) { meldung("Nicht geändert: es fehlt der Einsatz.", "warn"); return; }

  // ---- Auf diesem Geraet ----
  if (drin.woher !== "konto") {
    const v = liesVerlauf();
    const i = v.findIndex(e => e.scheinId === scheinId);
    if (i < 0) { meldung("Nicht geändert: der Eintrag ist nicht mehr da.", "warn"); return; }
    const altBetrag = Number(v[i].einsatz) || 0;
    // Stand, Notiz, Zeit, Nummer, QUOTE und WETTEN bleiben - geaendert
    // wird nur der Einsatz samt moeglich/brutto im selben Verhaeltnis.
    v[i] = Object.assign({}, v[i], aenderNurEinsatz(v[i], neuEinsatz));
    if (!speichereVerlauf(v)) return;    // speichereVerlauf sagt selbst Bescheid
    meldung("Eintrag geändert: " + altBetrag.toFixed(2) + " -> " + neuEinsatz.toFixed(2) +
      " Euro. Er steht weiter <b>einmal</b> im Verlauf.", "gut");
    zeichneVerlauf(); zeichneKonto();
    if (typeof zeichneGesetzte === "function") zeichneGesetzte();
    if (typeof zeichnePanel === "function") zeichnePanel();
    return;
  }

  // ---- Im Konto ----
  if (!drin.dbId || typeof supaScheinHolen !== "function") {
    meldung("Nicht geändert: dieser Eintrag lässt sich von hier aus nicht öffnen. " +
      "Ändere ihn in <a href=\"mein.html\"><b>Mein Bereich</b></a>.", "warn");
    return;
  }
  // FRISCH holen, nicht aus der Ansicht: die kann alt sein, und ein
  // Ueberschreiben mit alten Werten faellt niemandem auf (dieselbe
  // Lektion wie bei tuEinsatz in mein.js).
  const holen = await supaScheinHolen(drin.dbId);
  if (holen.fehler) { meldung("Nicht geändert: " + textSicher(holen.fehler), "warn"); return; }
  const alt = holen.daten || {};
  const altBetrag = Number(alt.einsatz) || 0;
  // Auch hier: nur der Einsatz. Quote und Wetten des Eintrags bleiben,
  // wie sie beim Setzen gespeichert wurden.
  const daten = Object.assign({}, alt, aenderNurEinsatz(alt, neuEinsatz));
  const r = await supaScheinDatenSchreiben(drin.dbId, holen.key, daten);
  if (r.error) { meldung("Nicht geändert: " + textSicher(String(r.error.message).slice(0, 140)), "warn"); return; }
  // Die 0-Zeilen-Falle: an den Rechten gescheitert sieht aus wie geschafft.
  if (!r.data || !r.data.length) {
    meldung("Nicht geändert - kein Schreibrecht oder die Kombination ist weg.", "warn"); return;
  }
  // Die Spur. Schlaegt sie fehl, ist der Einsatz trotzdem geaendert -
  // das muss dann auch so dastehen und nicht als Gesamtfehler.
  if (typeof supaAnmerken === "function") {
    try {
      const a = await supaAnmerken(holen.bereich, drin.dbId,
        "Einsatz beim erneuten Speichern geändert: " + altBetrag.toFixed(2) +
        " -> " + neuEinsatz.toFixed(2) + " Euro (statt zweitem Eintrag)");
      if (a && a.error) {
        meldung("Eintrag geändert auf " + neuEinsatz.toFixed(2) +
          " Euro. Die Anmerkung dazu ließ sich nicht speichern.", "warn");
        await kontoScheineLaden(); zeichneKonto();
        if (typeof zeichnePanel === "function") zeichnePanel();
        return;
      }
    } catch (e) { }
  }
  meldung("Eintrag geändert: " + altBetrag.toFixed(2) + " -> " + neuEinsatz.toFixed(2) +
    " Euro. Er steht weiter <b>einmal</b> im Konto und zählt in der Buchhaltung einmal.", "gut");
  await kontoScheineLaden();
  zeichneKonto();
  if (typeof zeichneGesetzte === "function") zeichneGesetzte();
  if (typeof zeichnePanel === "function") zeichnePanel();
}

function scheinMerken(scheinId) {
  const einsatz = parseFloat(document.getElementById("e_" + scheinId).value) || 0;
  if (!einsatz) { meldung("Bitte zuerst einen Einsatz eintragen.", "warn"); return; }
  // Karam (19.09.2026): "Ab jetzt muss wirklich bei jeder neuen Kombi
  // der Anstoss bekannt sein - das wird eben angegeben." Ohne die Zeit
  // weiss spaeter niemand, wann der Schein faellig ist (Filter
  // "ueberfaellig" und "ohne Anstoss" im Auswerten). Harte Pruefung
  // VOR dem Speichern, kein stilles Durchrutschen.
  const zM = liesZustand();
  const sM = zM.scheine.find(x => x.id === scheinId);
  if (sM) {
    const ohneZeit = sM.wetten
      .map(e => wetteNachId(e.id))
      .filter(w => w && !anstossFeld(w))
      .map(w => textSicher(w.spiel));
    if (ohneZeit.length) {
      meldung("<b>Nicht gespeichert: ohne Anstoßzeit kommt keine neue Kombination " +
        "mehr in den Verlauf.</b> Bitte zuerst in der Tafel die Anstoßzeit eintragen bei: <b>" +
        ohneZeit.join("</b>, <b>") + "</b>.", "warn");
      return;
    }
  }
  // Doppelt gespeichert heisst doppelt in der Buchhaltung. Karam nennt
  // genau das als Grund fuer den Loeschknopf: "haben wir da doppelt
  // reingemacht". Deshalb wird zuerst ANDERN angeboten (siehe oben).
  const drin = schonGesetzt(scheinId);
  if (drin && !scheinSchonDaFragen(scheinId, drin, einsatz)) return;
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

// Karam (15.09.2026): "wenn ich etwas in den Verlauf speichere, ist immer
// alles durcheinander. Ich moechte, dass nur fuenf Personen angezeigt
// werden, und zwar die aktuellen - und ein Feld, um Personen zu suchen."
//
// Oben stehen deshalb die fuenf zuletzt benutzten. Alle anderen sind
// WEITER DA, nur eingeklappt: die Suche findet sie, und "alle zeigen"
// klappt die volle Liste auf. Niemand wird weggeworfen - eine Person, die
// man nicht mehr findet, waere schlimmer als eine lange Liste.
// PERSONEN_OBEN liegt seit 17.09.2026 in logik.js, weil mein.js dieselbe
// Zahl braucht. Hier steht sie deshalb nicht mehr.
// Die Helfer personNorm, personNummer, personenZuletzt, personGemerkt und
// personenSortiert liegen seit 15.09.2026 in logik.js, weil mein.js sie
// auch braucht (Zuordnen, Anlegen). Hier bleibt nur, was der Kasten
// selbst ist.

async function ordnerWahlZeigen(scheinId, bereichId) {
  const box = document.getElementById("ordnerwahl_" + scheinId);
  if (!box) return;
  box.innerHTML = '<div class="ordnerpflicht mini">Personen werden geladen...</div>';
  // Erst die eigenen Scheine abwarten: aus ihnen kommt "zuletzt benutzt".
  // Ohne das Warten stuenden auf einem frischen Geraet P-1 bis P-5 oben,
  // was richtig aussieht und falsch ist. Der Kasten sagt derweil
  // "werden geladen", die Wartezeit ist also sichtbar.
  try {
    if (kontoLauf) await kontoLauf;
    else if (!kontoGeladen && typeof kontoScheineLaden === "function") await kontoScheineLaden();
  } catch (e) { }
  const liste = await supaOrdnerLaden(bereichId);
  // Ein Ladefehler ist NICHT dasselbe wie "keine Personen". Stand hier
  // vorher beides gleich da, und Karam haette eine Person neu angelegt,
  // die es laengst gibt - mitsamt getrenntem Guthaben.
  if (liste && liste._fehler) {
    box.innerHTML = '<div class="ordnerpflicht"><b>Die Personen konnten nicht geladen werden.</b> ' +
      '<span class="mini">' + textSicher(liste._fehler) + " Leg jetzt bitte KEINE neue Person an - " +
      "sie gibt es wahrscheinlich schon.</span><br>" +
      '<button class="haupt" onclick="ordnerWahlZeigen(\'' + scheinId + "','" + bereichId + '\')">nochmal versuchen</button> ' +
      '<button onclick="ordnerWahlZu(\'' + scheinId + '\')">abbrechen</button></div>';
    return;
  }
  personenMerklisteBereinigen(liste);
  const sortiert = personenSortiert(liste, kontoScheine);
  const rest = sortiert.length - PERSONEN_OBEN;
  let knoepfe = "";
  sortiert.forEach((o, i) => {
    const oben = i < PERSONEN_OBEN;
    const nr = personNummer(o.name);
    // Ein Name, der sich auf diesem Geraet nicht entschluesseln laesst,
    // ist nicht waehlbar: Karam wuerde den Schein sonst einer Person
    // zuordnen, deren Namen er gar nicht sieht.
    const unlesbar = /^\[verschl/i.test(String(o.name || ""));
    knoepfe += '<button class="ordner-person" data-top="' + (oben ? "1" : "0") +
      '" data-i="' + i + '" data-nr="' + (nr === null ? "" : nr) +
      '" data-norm="' + textSicher(personNorm(o.name)) + '"' + (oben ? "" : " hidden") +
      (unlesbar ? ' disabled title="Name auf diesem Geraet nicht lesbar - der Schluessel fehlt"' : "") +
      ' onclick="ordnerGewaehlt(\'' + scheinId + "','" + bereichId + "','" + o.id + '\')">' +
      textSicher(o.name) + "</button> ";
  });
  const suchzeile = rest > 0
    ? '<input id="ordnersuche_' + scheinId + '" class="ordnersuche" placeholder="Person suchen - die Nummer reicht" ' +
      'oninput="ordnerFiltern(\'' + scheinId + '\')" onkeydown="ordnerSucheTaste(event,\'' + scheinId + '\')"> ' +
      '<button id="ordneralle_' + scheinId + '" onclick="ordnerAlleZeigen(\'' + scheinId + '\')">alle ' +
      sortiert.length + " zeigen</button> "
    : "";
  box.innerHTML = '<div class="ordnerpflicht"><b>Bei wem hast du diesen Schein gesetzt?</b> ' +
    '<span class="mini">Jede Kombination gehört zu einer Person, damit du in Mein Bereich ' +
    "siehst, bei wem sie lief. Die Buchhaltung bleibt eine gemeinsame." +
    (rest > 0 ? " Oben die fünf zuletzt benutzten, die übrigen " + rest + " über die Suche." : "") +
    "</span><br>" +
    (sortiert.length
      ? '<div id="ordnerliste_' + scheinId + '" class="ordnerliste">' + knoepfe + "</div>" +
        '<span id="ordnerleer_' + scheinId + '" class="mini" hidden>Keine Person gefunden. ' +
        "Tippfehler? Sie ist nicht gelöscht, nur nicht getroffen. " +
        '<button onclick="ordnerNeuZeigen(\'' + scheinId + '\', true)">als neue Person anlegen</button></span> ' +
        suchzeile
      : '<span class="mini">Du hast noch keine Personen - leg gleich hier die erste an.</span> ') +
    // "Neue Person" ist ein eigener Knopf. Das Eingabefeld erscheint erst
    // auf Klick - vorher stand es dauerhaft direkt unter dem Suchfeld,
    // beide sahen gleich aus, und ein Suchbegriff im falschen Feld haette
    // eine Doppelperson angelegt.
    '<button id="ordnerneuknopf_' + scheinId + '" onclick="ordnerNeuZeigen(\'' + scheinId + '\')">&#10133; Neue Person anlegen</button> ' +
    '<span id="ordnerneu_' + scheinId + '" hidden>' +
      '<input id="neuordner_' + scheinId + '" placeholder="Name der neuen Person, z. B. P-23" ' +
      'onkeydown="ordnerNeuTaste(event,\'' + scheinId + "','" + bereichId + '\')"> ' +
      '<button class="haupt" onclick="ordnerNeuUndSpeichern(\'' + scheinId + "','" + bereichId + '\')">Anlegen und speichern</button> ' +
    "</span>" +
    '<button onclick="ordnerWahlZu(\'' + scheinId + '\')">abbrechen</button></div>';
  if (!sortiert.length) ordnerNeuZeigen(scheinId);
  else {
    const f = document.getElementById("ordnersuche_" + scheinId);
    if (f) f.focus();
  }
}

// Klappt das Feld fuer die neue Person auf. Kommt der Klick aus
// "Keine Person gefunden", wandert der Suchtext gleich mit hinein -
// Karam soll den Namen nicht ein zweites Mal tippen.
function ordnerNeuZeigen(scheinId, ausSuche) {
  const kasten = document.getElementById("ordnerneu_" + scheinId);
  if (!kasten) return;
  kasten.hidden = false;
  const knopf = document.getElementById("ordnerneuknopf_" + scheinId);
  if (knopf) knopf.hidden = true;
  const feld = document.getElementById("neuordner_" + scheinId);
  if (!feld) return;
  if (ausSuche) {
    const s = document.getElementById("ordnersuche_" + scheinId);
    if (s && s.value.trim()) feld.value = s.value.trim();
  }
  feld.focus();
}

function ordnerNeuTaste(ev, scheinId, bereichId) {
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  ordnerNeuUndSpeichern(scheinId, bereichId);
}

// Enter im Suchfeld: ist genau EIN Treffer sichtbar, wird er gewaehlt.
// Sind mehrere sichtbar, zaehlt nur ein exakter Treffer (genau diese
// P-Nummer oder genau dieser Name). Sonst passiert nichts - lieber ein
// Klick mehr als der falsche Name.
function ordnerSucheTaste(ev, scheinId) {
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  const liste = document.getElementById("ordnerliste_" + scheinId);
  if (!liste) return;
  const sichtbar = Array.prototype.slice.call(liste.querySelectorAll("button.ordner-person"))
    .filter(b => !b.hidden && !b.disabled);
  if (sichtbar.length === 1) { sichtbar[0].click(); return; }
  const feld = document.getElementById("ordnersuche_" + scheinId);
  const q = personNorm(feld ? feld.value : "");
  if (!q) return;
  const nurZahl = /^\d+$/.test(q);
  const genau = sichtbar.filter(b =>
    (nurZahl && String(b.dataset.nr || "") === String(parseInt(q, 10))) || String(b.dataset.norm || "") === q);
  if (genau.length === 1) genau[0].click();
}

// Gesucht wird im Namen, GEWAEHLT wird ueber die Kennung: zwei Personen
// duerfen gleich heissen, ohne dass etwas vertauscht wird.
// Leeres Feld = wieder nur die fuenf aktuellen.
//
// Die Treffer werden sortiert, damit bei Karams P-Nummern das Richtige
// oben steht. "7" soll P-7 bringen, nicht P-17:
//   Rang 0  genau diese P-Nummer, oder der Name exakt getroffen
//   Rang 1  Name faengt damit an  ("p1" -> P-12)
//   Rang 2  kommt irgendwo vor    ("7"  -> P-17)
function ordnerFiltern(scheinId) {
  const liste = document.getElementById("ordnerliste_" + scheinId);
  if (!liste) return;
  const feld = document.getElementById("ordnersuche_" + scheinId);
  const q = personNorm(feld ? feld.value : "");
  const nurZahl = /^\d+$/.test(q);
  const knoepfe = Array.prototype.slice.call(liste.querySelectorAll("button.ordner-person"));
  const treffer = [];
  for (const b of knoepfe) {
    if (!q) { b.hidden = b.dataset.top !== "1"; continue; }
    const norm = String(b.dataset.norm || "");
    const nr = String(b.dataset.nr || "");
    let rang = -1;
    if (nurZahl && nr !== "" && nr === String(parseInt(q, 10))) rang = 0;
    else if (norm === q) rang = 0;
    else if (norm.indexOf(q) === 0) rang = 1;
    else if (norm.indexOf(q) !== -1) rang = 2;
    b.hidden = rang < 0;
    if (rang >= 0) treffer.push({ b: b, rang: rang, i: Number(b.dataset.i) });
  }
  // Reihenfolge setzen. Ohne Suche zurueck in die urspruengliche.
  const ordnung = q
    ? treffer.sort((x, y) => x.rang - y.rang || x.i - y.i)
    : knoepfe.map(b => ({ b: b, i: Number(b.dataset.i) })).sort((x, y) => x.i - y.i);
  for (const t of ordnung) liste.appendChild(t.b);
  // Nichts gefunden wird GESAGT - sonst sieht ein Tippfehler aus wie
  // "die Person gibt es nicht" und sie wird ein zweites Mal angelegt.
  const leer = document.getElementById("ordnerleer_" + scheinId);
  if (leer) leer.hidden = !(q && treffer.length === 0);
  const alle = document.getElementById("ordneralle_" + scheinId);
  if (alle) alle.hidden = !!q;
}

function ordnerAlleZeigen(scheinId) {
  const liste = document.getElementById("ordnerliste_" + scheinId);
  if (!liste) return;
  for (const b of liste.querySelectorAll("button.ordner-person")) b.hidden = false;
  const alle = document.getElementById("ordneralle_" + scheinId);
  if (alle) alle.hidden = true;
}

function ordnerWahlZu(scheinId) {
  const box = document.getElementById("ordnerwahl_" + scheinId);
  if (box) box.innerHTML = "";
}

function ordnerGewaehlt(scheinId, bereichId, ordnerId) {
  // Wer gerade dran war, steht beim naechsten Speichern oben.
  personGemerkt(ordnerId);
  scheinInsKonto(scheinId, bereichId, ordnerId);
}

async function ordnerNeuUndSpeichern(scheinId, bereichId) {
  const feld = document.getElementById("neuordner_" + scheinId);
  const r = await supaOrdnerAnlegen(bereichId, feld ? feld.value : "");
  if (r.fehler) { meldung("Person nicht hinzugefuegt: " + r.fehler, "warn"); return; }
  // Die frisch angelegte Person ist die aktuellste, die es gibt.
  personGemerkt(r.ordner.id);
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
    // DER BROWSER GIBT SEINE KOPIE AB (14.09.2026, Karams Mittelweg).
    // Das Bild ist jetzt in der Datenbank (supaScheinAnlegen hat es
    // verschluesselt mitgeschrieben) - erst JETZT, nach bestaetigtem
    // Speichern, faellt die oertliche Kopie weg. So sammelt sich im
    // Browser nichts mehr an, und unter der Karte bleibt es trotzdem
    // stehen: es kommt aus dem Arbeitsspeicher, nicht mehr von der Platte.
    if (b.foto) {
      scheinFotoCache[scheinId] = { foto: b.foto, name: b.fotoName || "Wettschein" };
      localStorage.removeItem(fotoSchluessel(scheinId));
      localStorage.removeItem(fotoSchluessel(scheinId) + "_zeit");
      localStorage.removeItem(fotoSchluessel(scheinId) + "_name");
      localStorage.removeItem("foto_analyse_" + scheinId);
    }
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
    const foto = x.scheinId ? localStorage.getItem(fotoSchluessel(x.scheinId)) : null;
    html += "<tr><td class='mini'>" + wannText(x.zeit) + "</td><td>" + textSicherK2(x.anbieter) + "</td>" +
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
  // Standard 1 (Karam, 03.09.): 1 heisst "jeder Einsatz einmal im Spiel" -
  // und das ist er schon, also passiert nichts. Wer mehr will, stellt hoch.
  const zielWert = parseInt(localStorage.getItem("kt_misch_ziel") || "1", 10) || 1;
  ak += '<span class="pn-mischgruppe">' +
    '<button class="haupt pn-misch" onclick="mischOhnePaare()" title="Erst den Anbieter ' +
    'aussuchen, dann NUR dessen gesetzte Einsätze untereinander neu mischen; keine zwei ' +
    'Wetten, die schon zusammen gesetzt waren, kommen wieder zusammen">' +
    "&#127922; Kombis neu mischen<br><span class='mini'>ein Anbieter, keine Paare doppelt</span></button>" +
    '<label class="pn-mischziel mini">jeder Einsatz insgesamt<br>' +
    '<input id="pn_misch_ziel" type="number" min="1" max="9" value="' + zielWert +
    '" inputmode="numeric" oninput="mischZielGeaendert()" onchange="mischZielGeaendert()"> mal</label>' +
    '<button class="pn-leeren" onclick="panelOffeneLoeschen()" title="Wirft alles aus ' +
    'dem Bau, wo noch NICHTS gesetzt wurde - gesetzte Kombinationen bleiben unberührt">' +
    "&#129529; Ungesetzte löschen<br><span class='mini'>alles ohne Einsatz</span></button>" +
    '</span><div class="pn-grenzen" id="pn_grenzen">' + mischGrenzenHtml(zielWert) + "</div></div>";
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

  // Bau und Verlauf uneins? Genau Karams Fall: oben stehen die alten
  // Anbieter, weil die Kacheln den VERLAUF zaehlen. Das muss dastehen,
  // sonst sucht er den Fehler bei den Zahlen.
  const abw = bauVerlaufAbweichungen();
  if (abw.length) {
    let ah = '<div class="pn-warn pn-abw"><b>&#9888; Bei ' + abw.length + " Kombination" +
      (abw.length === 1 ? "" : "en") + " steht im Verlauf ein anderer Anbieter als auf der " +
      "Karte im Bau:</b><ul>";
    for (const x of abw.slice(0, 8)) {
      ah += "<li>" + (x.nummer ? "Nr. " + textSicherK2(String(x.nummer)) + ": " : "") +
        "Verlauf <b>" + textSicherK2(anbieterName(x.verlauf)) + "</b>, Karte <b>" +
        textSicherK2(anbieterName(x.karte)) + "</b></li>";
    }
    if (abw.length > 8) ah += "<li class='mini'>und " + (abw.length - 8) + " weitere</li>";
    ah += "</ul>Die Kacheln oben zählen den Verlauf - deshalb steht dort noch der alte " +
      "Anbieter. Ein Klick stellt es überall um, auch im Konto der Person. " +
      '<button class="haupt" onclick="bauVerlaufAngleichen()">Verlauf angleichen</button></div>';
    kasten.insertAdjacentHTML("beforeend", ah);
  }

  const liste = panelListeHtml(p);
  if (liste) kasten.insertAdjacentHTML("beforeend", liste);
}

// Karam (03.09.): ein Knopf oben rechts, der in EINEM Zug alles aus dem
// Bau wirft, wo noch NICHTS gesetzt wurde. Das ist genau die Menge hinter
// der Kachel "noch nichts gesetzt": Scheine, deren Stamm im Verlauf
// (Geraet UND Konto) gar nicht vorkommt. Gesetztes wird nie angefasst.
//
// WARUM DER UNLESBAR-RIEGEL: eine Konto-Kombination ohne Schluessel
// verraet ihre scheinId nicht. Ihr Stamm heisst dann "db:...", trifft
// nie einen Schein im Bau - und eine in Wahrheit GESETZTE Kombination
// saehe hier ungesetzt aus. Beim Einzel-Loeschen waere das ein Fehler,
// hier waere es ein Massen-Fehler. Deshalb steht die Warnung ganz oben
// in der Rueckfrage, mit Zahl.
// ============================================================
// BAU UND VERLAUF UNEINS (Karam, 03.09.)
//
// Sein Fall: er hat den Anbieter auf der Karte umgestellt, BEVOR es den
// Nachzug gab (Fassung 20260903d). Seitdem sagt der Bau Interwetten und
// der Verlauf weiter Stake - und oben stehen neun bei Stake, eins bei
// Interwetten. Solche Altfaelle heilen NICHT von selbst: anbieterWechseln
// steigt gleich aus, wenn die Karte schon auf dem richtigen Anbieter
// steht, also gibt es dort nichts mehr nachzuziehen.
//
// Deshalb hier: die Abweichung suchen, ZEIGEN und mit einem Klick
// angleichen. Nicht still im Hintergrund - das sind
// Buchhaltungseintraege, und die aendert man nicht hinter Karams Ruecken.
function bauVerlaufAbweichungen() {
  const z = liesZustand();
  if (!z || !z.scheine) return [];
  const gesetzt = gesetzteEintraege();
  const raus = [];
  for (const s of z.scheine) {
    for (const e of gesetzt) {
      // EXAKTE Kennung, kein Stamm: jeder Teil ist beim Anbieter eine
      // eigene Wette und kann woanders liegen als seine Geschwister.
      if (e.unlesbar || e.scheinId !== s.id) continue;
      if (!e.kz || e.kz === s.kz) continue;
      raus.push({ id: s.id, nr: s.nr, karte: s.kz, verlauf: e.kz,
                  nummer: e.nummer, woher: e.woher });
    }
  }
  return raus;
}

async function bauVerlaufAngleichen() {
  const ab = bauVerlaufAbweichungen();
  if (!ab.length) { meldung("Es weicht nichts ab - Bau und Verlauf sind einig.", "gut"); return; }

  const zeilen = ab.map(x => "   " + (x.nummer ? "Nr. " + x.nummer + "   " : "") +
    anbieterName(x.verlauf) + "   ->   " + anbieterName(x.karte)).join("\n");
  if (!confirm("Im Verlauf steht bei " + ab.length + " Kombination(en) ein anderer Anbieter " +
      "als auf der Karte im Bau:\n\n" + zeilen + "\n\n" +
      "Der Verlauf wird auf den Anbieter der Karte umgestellt - auf diesem Gerät und im " +
      "Konto der Person.\n\n" +
      "Einsatz, Quote und möglicher Gewinn bleiben unverändert: das sind die Zahlen, die " +
      "beim Anbieter wirklich auf dem Schein standen.\n\nAngleichen?")) return;

  let geraet = 0, konto = 0;
  const fehler = [];
  const schonDran = new Set();   // je Schein einmal, auch wenn er doppelt im Verlauf steht
  for (const x of ab) {
    if (schonDran.has(x.id)) continue;
    schonDran.add(x.id);
    const r = await verlaufAnbieterNachziehen(x.id, x.karte);
    geraet += r.geraet; konto += r.konto;
    for (const f of r.fehler) fehler.push(f);
  }

  const teile = [];
  if (geraet) teile.push(geraet + " Verlaufseintrag" + (geraet === 1 ? "" : "e") + " auf diesem Gerät");
  if (konto) teile.push(konto + " gespeicherte" + (konto === 1 ? "r Schein" : " Scheine") + " im Konto");
  meldung(
    (teile.length
      ? "<b>Angeglichen:</b> " + teile.join(" und ") + ". Die Zahlen oben zählen jetzt richtig."
      : "<b>Es wurde nichts geändert.</b>") +
    (fehler.length
      ? " <b>&#9888; NICHT umgestellt:</b> " + textSicherK2(fehler.join("; ")) + "."
      : ""),
    fehler.length ? "warn" : "gut");
  zeichne_();
}

function panelOffeneLoeschen() {
  const z = liesZustand();
  if (!z || !z.scheine || !z.scheine.length) {
    meldung("Im Bau steht nichts, was man löschen könnte.", "warn"); return;
  }

  const eintraege = gesetzteEintraege();
  const gesetztStamm = new Set();
  for (const e of eintraege) if (!e.unlesbar) gesetztStamm.add(e.stamm);
  const unlesbar = eintraege.filter(e => e.unlesbar).length;

  const weg = z.scheine.filter(s => !gesetztStamm.has(stammId(s.id)));
  if (!weg.length) { meldung("Es steht nichts Ungesetztes im Bau.", "gut"); return; }

  const nrn = new Set(weg.map(s => s.nr));
  const eigene = weg.filter(s => s.art === "eigen").length;

  let frage = "";
  if (unlesbar) frage +=
    "ACHTUNG: " + unlesbar + " Kombination(en) aus deinem Konto lassen sich nicht " +
    "öffnen (Schlüssel fehlt oder passt nicht). Was darin steht, weiß der Bau " +
    "nicht. Ist eine davon in Wahrheit gesetzt, wird sie hier trotzdem als " +
    "ungesetzt gelöscht - und die Wetten könnten ein ZWEITES MAL rausgehen.\n" +
    "Kläre das erst, bevor du hier löschst.\n\n";

  frage +=
    "Alles löschen, wo noch NICHTS gesetzt wurde?\n\n" +
    "- " + nrn.size + " Kombination(en), " + weg.length + " Schein(e) fallen weg" +
    (eigene ? "\n- davon " + eigene + " SELBST GEBAUT" : "") + "\n" +
    "- gesetzte Kombinationen bleiben unberührt\n" +
    "- die Wetten werden wieder frei und beim nächsten Mischen neu verteilt\n\n" +
    "Löschen?";

  if (!confirm(frage)) return;

  const raus = new Set(weg.map(s => s.id));
  z.scheine = z.scheine.filter(s => !raus.has(s.id));
  speichereZustand(z);

  // Gleiche Aufraeumregel wie beim Einzel-Loeschen: ein Foto darf nur weg,
  // wenn kein Verlaufseintrag mehr daran haengt. Sonst steht der Eintrag
  // spaeter ohne Bild da.
  let fotosWeg = 0;
  for (const s of weg) {
    if (fotoNochGebraucht(s.id)) continue;
    if (localStorage.getItem(fotoSchluessel(s.id))) fotosWeg++;
    fotoLoeschen(s.id);
  }

  meldung("<b>" + nrn.size + " ungesetzte Kombination(en) gelöscht</b>" +
    (fotosWeg ? " (mit " + fotosWeg + " Foto" + (fotosWeg === 1 ? "" : "s") + ")" : "") +
    ". Die Wetten sind wieder frei. <b>Die Nummern der übrigen Kombinationen " +
    "rücken nach vorne.</b>", "gut");
  zeichne_();
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
// der Anbieter-Karten oben zeigt in der Gesetzt-Liste und bei den Kombis in
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
  let ziel = feld ? parseInt(feld.value, 10) : parseInt(localStorage.getItem("kt_misch_ziel") || "1", 10);
  if (!isFinite(ziel) || ziel < 1) ziel = 1;
  if (ziel > 9) ziel = 9;
  try { localStorage.setItem("kt_misch_ziel", String(ziel)); } catch (e) { }
  return ziel;
}

// ============================================================
// TOEPFE UND GRENZEN - EINE Quelle fuer beide
//
// Der Misch-Knopf und die Anzeige darunter muessen dieselben Zahlen
// sehen. Zwei Rechenwege waeren zwei Wahrheiten, und die driften
// auseinander (genau das ist in diesem Projekt schon passiert).
//
// Topf je Anbieter: die Einsaetze aus den dort GESETZTEN
// Kombinationen, mit Nutzungszaehler (wie oft schon gespielt).
// Nur laufende Wetten, und nichts, was dort als "gibt es nicht"
// markiert ist.
function mischToepfe() {
  const topfJeKz = {};
  for (const g of gesetzteEintraege().filter(x => !x.unlesbar)) {
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
  return topfJeKz;
}

// DIE GRENZE, je Anbieter - Karams Rechnung vom 03.09.:
// "bei drei Kombis kann ich nicht neunmal jede Zahl vorkommen lassen,
//  ohne dass sich das wiederholt."
//
// Reine Mathematik, keine Schaetzung. Ein Spiel hat im Topf (S-1)
// moegliche Partner-Spiele. Jede Verwendung in einer Dreier-Kombination
// verbraucht zwei davon, und kein Spiel-Paar darf sich je wiederholen.
// Also geht jedes Spiel hoechstens floor((S-1)/2)-mal.
//   Karams Beispiel: 3 gesetzte Kombis = 9 Spiele -> floor(8/2) = 4-mal
//   je Einsatz, also 9*4/3 = 12 Kombinationen insgesamt, davon 3 schon
//   gesetzt: 9 neue. Genau seine Zahl.
// Unter 3 verschiedenen Spielen geht gar nichts - eine Kombination
// braucht drei.
function mischGrenzen(toepfe) {
  const topfJeKz = toepfe || mischToepfe();
  const raus = {};
  for (const kz of KT_ANBIETER_RANG) {
    const topf = topfJeKz[kz];
    if (!topf) continue;
    const spiele = new Set([...topf.values()]
      .map(x => mischSpielSchluessel(x.w.spiel, null)).filter(Boolean));
    const max = Math.max(1, Math.floor((spiele.size - 1) / 2));
    let wenigste = Infinity;
    for (const x of topf.values()) if (x.nutzung < wenigste) wenigste = x.nutzung;
    raus[kz] = {
      kz: kz,
      einsaetze: topf.size,
      spiele: spiele.size,
      max: max,
      // Dieselbe Bedingung wie kzMoeglich im Misch-Knopf, plus die
      // Spiel-Bedingung: mit zwei verschiedenen Spielen laesst sich
      // keine Dreier-Kombination bauen.
      moeglich: topf.size >= 3 && spiele.size >= 3,
      wenigste: wenigste === Infinity ? 0 : wenigste,
      // Wie viele Kombinationen dieser Topf insgesamt hergibt und wie
      // viele davon noch offen sind.
      kombisGesamt: Math.floor(spiele.size * max / 3)
    };
  }
  return raus;
}

// Was steht unter dem Misch-Knopf? Karam will es SEHEN, nicht erst in
// der Rueckfrage lesen: "sag mir, okay, du kannst bei Stake so viel
// mischen, bei Interwetten nur zweimal."
function mischGrenzenHtml(ziel) {
  const gr = mischGrenzen();
  const kzs = KT_ANBIETER_RANG.filter(kz => gr[kz]);
  let h = "";
  if (Number(ziel) <= 1) h +=
    '<div class="pn-gr-zeile pn-gr-stop">Bei <b>1</b> ist jeder Einsatz schon einmal im ' +
    'Spiel - da gibt es nichts zu mischen. Stell auf 2, dann kommt jeder ein zweites Mal.</div>';
  if (!kzs.length) return h +
    '<div class="pn-gr-aus">Noch nichts gesetzt - es gibt nichts zu mischen.</div>';
  for (const kz of kzs) {
    const g = gr[kz];
    const name = textSicherK2(anbieterName(kz));
    if (!g.moeglich) {
      h += '<div class="pn-gr-zeile pn-gr-stop">' + name + ": <b>geht nicht</b> - nur " +
        g.spiele + (g.spiele === 1 ? " verschiedenes Spiel" : " verschiedene Spiele") +
        " gesetzt. Eine Kombination braucht drei.</div>";
      continue;
    }
    const eng = Number(ziel) > g.max;
    h += '<div class="pn-gr-zeile' + (eng ? " pn-gr-stop" : "") + '">' + name +
      ": höchstens <b>" + g.max + "-mal</b> je Einsatz (" + g.spiele + " Spiele, " +
      g.kombisGesamt + " Kombinationen insgesamt möglich)" +
      (eng ? " &ndash; <b>" + ziel + " geht dort nicht mehr</b>, sonst wiederholt sich ein Paar. " +
        "Es wird auf " + g.max + " gedeckelt." : "") + "</div>";
  }
  return h;
}

// Zahl im Feld geaendert: die Grenzen sofort neu schreiben. Kein
// zeichne_(), das wuerde beim Tippen die halbe Seite neu bauen.
function mischZielGeaendert() {
  const kasten = document.getElementById("pn_grenzen");
  if (kasten) kasten.innerHTML = mischGrenzenHtml(mischZielLesen());
}

function mischOhnePaare(kzWahl) {
  const e = einstellungenLesen();
  const z = liesZustand() || baueAlles();
  const gesetzt = gesetzteEintraege().filter(g => !g.unlesbar);
  const ziel = mischZielLesen();

  // Karam, 03.09.: 1 ist der Standard und heisst "jeder Einsatz einmal
  // im Spiel". Das ist er bereits - es gibt also nichts zu mischen.
  if (ziel <= 1) {
    meldung("<b>Bei 1 gibt es nichts zu mischen:</b> jeder Einsatz ist schon einmal im Spiel. " +
      "Stell die Zahl auf 2 oder mehr.", "warn");
    return;
  }

  // Topf je Anbieter: die Einsaetze aus den dort gesetzten Kombinationen,
  // mit NUTZUNGSZAEHLER (wie oft schon gespielt). Wer sein Ziel erreicht
  // hat, wird NICHT mehr gemischt; wer darunter liegt, darf so oft in
  // neue Kombinationen, bis das Ziel steht. Nur laufende Wetten.
  const topfJeKz = mischToepfe();
  const kzMoeglich = KT_ANBIETER_RANG.filter(kz => topfJeKz[kz] && topfJeKz[kz].size >= 3);
  if (!kzMoeglich.length) {
    meldung("<b>Nichts zu mischen:</b> es ist noch nichts Laufendes gesetzt. Gemischt wird " +
      "nur aus GESETZTEN Kombinationen (je Anbieter, mindestens 3 Einsätze).", "warn");
    return;
  }

  // EIN ANBIETER JE MISCHUNG (Karam, 03.09.: "ich muss es mir dann aussuchen").
  // Vorher lief der Knopf ueber ALLE Anbieter auf einmal - danach stand der
  // Bau voll mit Kombinationen bei Anbietern, an die Karam gar nicht gedacht
  // hatte, und die sahen fuer ihn aus wie Einsaetze, die er nie gesetzt hat.
  // Jetzt wird genau ein Topf gemischt: die dort gesetzten Einsaetze
  // untereinander. Ist oben eine Anbieter-Karte angetippt (bauAnbieterFilter),
  // gilt die als Auswahl - sonst wird gefragt.
  let kz1 = kzWahl && kzMoeglich.includes(kzWahl) ? kzWahl : null;
  if (!kz1 && typeof bauAnbieterFilter !== "undefined" &&
      bauAnbieterFilter && kzMoeglich.includes(bauAnbieterFilter)) kz1 = bauAnbieterFilter;
  if (!kz1 && kzMoeglich.length === 1) kz1 = kzMoeglich[0];
  if (!kz1) {
    const wahlText = kzMoeglich.map((kz, i) =>
      (i + 1) + " = " + anbieterName(kz) + " (" + topfJeKz[kz].size + " gesetzte Einsätze)").join("\n");
    const a = prompt("Welchen Anbieter mischen?\n\nEs wird NUR dieser eine Topf gemischt - " +
      "die dort gesetzten Einsätze untereinander. Die anderen Anbieter bleiben, wie sie sind.\n\n" +
      wahlText + "\n\nNummer eingeben:", "1");
    if (a === null) return;
    const i = parseInt(a, 10);
    if (!(i >= 1 && i <= kzMoeglich.length)) {
      meldung("Das war keine der Nummern - es wurde nichts verändert.", "warn"); return;
    }
    kz1 = kzMoeglich[i - 1];
  }
  const kzListe = [kz1];

  // DAS HOECHSTLIMIT (Karam, 03.09.: "das muss anerkannt werden").
  // Reine Mathematik: ein Spiel hat im Topf (S-1) moegliche Partner-
  // Spiele; jede Verwendung verbraucht 2 davon, und kein Spiel-Paar
  // darf sich je wiederholen. Also geht jedes Spiel hoechstens
  // floor((S-1)/2)-mal. Bei 12 Einsaetzen: (12-1)/2 = 5.
  // Liegt Karams Ziel darueber, wird HART gedeckelt und angesagt.
  const grenzen = mischGrenzen(topfJeKz);
  const maxJeKz = {};
  for (const kz of kzListe) maxJeKz[kz] = grenzen[kz].max;

  // Gesetzte Scheine bleiben. Von den ungesetzten fallen NUR die des
  // gewaehlten Anbieters weg - sonst raeumte eine Stake-Mischung Karams
  // ungesetzte Bwin-Kombinationen mit ab, ohne dass er es merkt.
  const behaltenIds = new Set(gesetzteScheine().map(s => s.id));
  const behalten = (z.scheine || []).filter(s => behaltenIds.has(s.id) || s.kz !== kz1);
  const weg = (z.scheine || []).filter(s => !behaltenIds.has(s.id) && s.kz === kz1);
  const gesetztAnzahl = (z.scheine || []).filter(s => behaltenIds.has(s.id)).length;
  const fremdOffen = behalten.length - gesetztAnzahl;
  const wegEigene = weg.filter(s => s.art === "eigen").length;
  const verboten = gesetztePaare();
  const toepfe = kzListe.map(kz => {
    const zielKz = Math.min(ziel, maxJeKz[kz]);
    const offenN = [...topfJeKz[kz].values()].filter(x => x.nutzung < zielKz).length;
    return anbieterName(kz) + ": " + topfJeKz[kz].size + " Einsätze, Höchstlimit " + maxJeKz[kz] +
      "-mal (" + offenN + " unter dem Ziel)";
  }).join("\n  ");
  const gedeckelt = kzListe.filter(kz => ziel > maxJeKz[kz]);
  if (!confirm("Kombis neu mischen bei " + anbieterName(kz1) +
    " - KEIN Spiel-Paar je zweimal:\n\n" +
    "- Dein Ziel: jeder Einsatz insgesamt " + ziel + "-mal\n" +
    (gedeckelt.length
      ? "- ACHTUNG: das liegt über dem mathematischen Höchstlimit bei " +
        gedeckelt.map(kz => anbieterName(kz) + " (max " + maxJeKz[kz] + ")").join(", ") +
        " - dort wird mit dem Höchstlimit gerechnet.\n"
      : "") +
    "- Topf (NUR aus dort gesetzten Kombinationen):\n  " + toepfe + "\n" +
    "- " + gesetztAnzahl + " gesetzte(r) Schein(e) bleiben unberührt\n" +
    (fremdOffen ? "- " + fremdOffen + " ungesetzte Kombination(en) bei ANDEREN Anbietern " +
      "bleiben ebenfalls stehen\n" : "") +
    "- " + weg.length + " ungesetzte Kombination(en) bei " + anbieterName(kz1) +
    " werden ersetzt" +
    (wegEigene ? " (davon " + wegEigene + " selbst gebaut!)" : "") + "\n" +
    "- " + verboten.size + " Spiel-Paare aus gesetzten Kombinationen sind gesperrt\n" +
    "- es wird NUR bei " + anbieterName(kz1) + " gemischt, kein Einsatz wechselt den Anbieter\n\n" +
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
    meldung("<b>Ausgemischt:</b> alle Spiel-Paare verbraucht oder Limit erreicht (" +
      textSicher(limitText) + "). Nichts verändert." +
      (zielVerfehlt.length ? "<br><b>Unter dem Limit:</b> " +
        textSicher(zielVerfehlt.slice(0, 8).join("; ")) +
        (zielVerfehlt.length > 8 ? " +" + (zielVerfehlt.length - 8) : "") : ""), "warn");
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
  meldung("<b>&#127922; " + neu.length + " neue Kombination(en)</b> (" + textSicher(jeKzText) + "). " +
    "Nur aus Gesetzten bei " + textSicher(anbieterName(kz1)) + ", kein Spiel-Paar doppelt. " +
    gesetztAnzahl + " Gesetzte unberührt." +
    (zielVerfehlt.length
      ? "<br><b>&#9888; Unter dem Limit:</b> " + textSicher(zielVerfehlt.slice(0, 8).join("; ")) +
        (zielVerfehlt.length > 8 ? " +" + (zielVerfehlt.length - 8) : "") + " - kein erlaubtes Paar mehr."
      : " Alle am Limit."), "gut");
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

// "Bei WEM liegt diese Kombination" - als Link nach Mein Bereich,
// dort schon auf die Person gefiltert (mein.js liest ?person=...).
// Karam (15.09.2026): "ich will draufklicken und dann komm ich auf die
// Person, bei der ich es gespeichert hab."
// Ist der Name noch nicht geladen, steht "Person" - NIE "ohne Person",
// solange eine zugeordnet ist. Das waere eine falsche Warnung.
function personLinkHtml(e, lang) {
  if (!e || e.woher !== "konto") return "";
  if (e.ordner) {
    const name = personName(e.ordner) || "Person";
    return '<a class="s-person" href="mein.html?person=' + encodeURIComponent(e.ordner) +
      '" title="Zu ' + textSicher(name) + ' in Mein Bereich">&#128100; bei <b>' +
      textSicher(name) + '</b></a>';
  }
  return '<a class="s-person s-person-fehlt" href="mein.html?person=ohne" ' +
    'title="Diese Kombination hat keine Person - in Mein Bereich zuordnen">&#9888; ohne Person' +
    (lang ? ' - jetzt zuordnen' : '') + '</a>';
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

// Gehoert eine gesetzte Kombination in die Ansicht DIESES Ordners?
// Ja, wenn sie selbst dazu gezaehlt wird ODER auch nur EIN Bein aus
// diesem Ordner stammt.
// Warum das zweite: seit dem Modus "alle Ordner" kann eine Kombination
// Beine aus zwei Tagen haben. Gespeichert wird sie unter dem Ordner des
// ersten Beins. Ginge es nur danach, saehe das Bein aus dem anderen
// Ordner dort ungesetzt aus - und Karam setzt es ein zweites Mal.
// Fuer jede Kombination aus EINEM Ordner (also alles, was es bisher
// gibt) aendert diese Regel nichts: alle Beine haben denselben Ordner.
function eintragImOrdner(eigenerSatz, wetten, satz) {
  // Altbestand ohne Ordner gehoerte zum damals einzigen: ueberall zeigen.
  if (!eigenerSatz) return true;
  if (eigenerSatz === satz) return true;
  for (const t of (wetten || [])) if (t && t.satz === satz) return true;
  return false;
}

// Alle Kombinationen, die fuer DIESEN Ordner schon gesetzt sind -
// aus beiden Ablagen, in einer Form.
// satzWahl ist ein Ausnahmefall und bleibt fast immer leer: dann gilt der
// offene Ordner. Wer SATZ_ALLE uebergibt, bekommt alles aus allen Ordnern,
// ohne dass der offene Ordner sich aendert. Das braucht die Tabelle, damit
// ein Zaehler "schon dreimal gesetzt" nie zu niedrig ist.
function gesetzteEintraege(satzWahl) {
  const satz = satzWahl || aktiverSatzId();
  // Im Modus "alle Ordner" darf hier NICHTS weggefiltert werden. Wuerde
  // gegen "__alle__" verglichen, faellt jeder gesetzte Schein heraus,
  // die Gesetzt-Liste saehe leer aus, schonGesetzt() meldete nichts -
  // und dieselbe Kombination wuerde ein zweites Mal gesetzt.
  const alleOrdner = (satz === SATZ_ALLE);
  const raus = [];
  let oertlich = [];
  try { oertlich = liesVerlauf() || []; } catch (e) { oertlich = []; }
  for (const e of oertlich) {
    // Alte Eintraege ohne satz gehoerten zum damals einzigen Ordner:
    // lieber mitzaehlen als eine gesetzte Kombination uebersehen.
    if (!alleOrdner && !eintragImOrdner(e.satz, e.wetten, satz)) continue;
    const eG = { scheinId: e.scheinId, einsatz: Number(e.einsatz) || 0,
                 anbieter: e.anbieter, nummer: e.nummer, kz: e.kz,
                 quote: Number(e.quote) || 0, wetten: e.wetten || [],
                 moeglich: Number(e.moeglich) || 0, gebuehr: Number(e.gebuehr) || 0,
                 zeit: e.zeit, satz: e.satz, stand: e.stand || "offen",
                 woher: "geraet" };
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
    if (!alleOrdner && !eintragImOrdner(d.satz, d.wetten, satz)) continue;
    const eK = { scheinId: d.scheinId, einsatz: Number(d.einsatz) || 0,
                 anbieter: d.anbieter, nummer: x.nummer || d.nummer, kz: d.kz,
                 quote: Number(d.quote) || 0, wetten: d.wetten || [],
                 moeglich: Number(d.moeglich) || 0, gebuehr: Number(d.gebuehr) || 0,
                 zeit: x.created_at, dbId: x.id, satz: d.satz,
                 // Gewonnen oder verloren? Nur fuer den Hinweistext an der
                 // Zeile, damit "3x gesetzt" nicht wie "3x noch draussen"
                 // aussieht. In keine Summe geht der Stand ein.
                 stand: x.stand || d.stand || "offen",
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
    // Im Alle-Modus stammen die Beine aus verschiedenen Ordnern. Mit
    // "__alle__" kaeme gar nichts zurueck und jede Kombination saehe
    // offen aus, obwohl sie laengst entschieden ist.
    const ergListe = await supaErgebnisseLaden(
      satz === SATZ_ALLE ? SAETZE.map(s => s.id) : [satz]);
    if (!ergListe.length) return;
    // Zwei Schluessel: einmal streng je Ordner, einmal nur nach dem
    // Spielnamen. Der Name-Schluessel gilt NUR, solange der Name in genau
    // einem Ordner vorkommt. Kommt er in zweien vor, bleibt er leer -
    // lieber "laeuft noch" als das Ergebnis des falschen Tages.
    const karte = {}, nachName = {}, mehrdeutig = {};
    for (const z of ergListe) {
      const erg = { heim: z.heim, gast: z.gast,
        htHeim: z.ht_heim, htGast: z.ht_gast, karten: z.karten, ecken: z.ecken,
        sonder: z.sonder || {}, stand: z.stand };
      karte[z.satz + "|" + z.spiel] = erg;
      if (nachName[z.spiel] !== undefined) mehrdeutig[z.spiel] = true;
      else nachName[z.spiel] = erg;
    }
    const ergSuche = (satzId, spiel) => karte[satzId + "|" + spiel] ||
      (mehrdeutig[spiel] ? null : (nachName[spiel] || null));
    const zeichen = { gewonnen: "&#10004;", halbgewonnen: "&#10004;&#189;",
      push: "&#8617;", abgesagt: "&#8617;", halbverloren: "&#10008;&#189;",
      verloren: "&#10008;", offen: "&#183;", unklar: "?" };
    let gew = 0, ver = 0;
    for (let i = 0; i < liste.length; i++) {
      const zeile = document.querySelector('#gesetzteliste tr[data-erg="' + i + '"]');
      const e = liste[i];
      if (!zeile || !e.wetten || !e.wetten.length) continue;
      const a = kombiAuswerten(e.wetten, e.einsatz,
        (w) => ergSuche(w.satz || e.satz || satz, w.spiel));
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

// ============================================================
// EINER NACH DEM ANDEREN
//
// Karams Arbeitsweise: nicht dreissig Scheine auf einmal, sondern EINE
// Kombination oben, mit der er zum Anbieter geht. Passt sie, setzt er sie,
// macht ein Foto, traegt den Einsatz ein - und die naechste kommt.
// Passt sie nicht, sagt er warum, und das Programm merkt es sich.
//
// DIE REGELN, so wie er sie beschrieben hat:
//   1. Erst wird Stake durchgearbeitet, dann Interwetten, dann Bwin,
//      zuletzt Bet365. Der naechste Anbieter kommt erst dran, wenn beim
//      vorigen keine drei Wetten mehr uebrig sind.
//   2. Eine Wette kommt bei DEMSELBEN Anbieter nur einmal vor. Was dort
//      schon gesetzt ist, wird dort nicht mehr vorgeschlagen.
//   3. Sagt er "Quote passt nicht" oder "hat er nicht", kommt diese Wette
//      bei diesem Anbieter NIE wieder. Das ist das Gedaechtnis - sonst
//      schlaegt das Programm dieselbe Wette in der naechsten Kombination
//      gleich wieder vor.
//   4. Bei jeder Wette steht, wie weit sie ist: offen bei Stake, oder
//      schon gesetzt, oder dort durchgefallen. So sieht man auf einen
//      Blick, warum man bei Bwin gelandet ist.
//
// Diese Datei baut KEINE eigene Speicherung und KEINE eigene Rechnung.
// Sie stellt eine Kombination in den vorhandenen Zustand und laesst alles
// Weitere die geprueften Wege machen: Einsatzfeld, Foto, "In den Verlauf",
// Zuordnung zur Person. Loescht man sie, bleibt der Kombi-Bau wie er war.
// ============================================================
"use strict";

const EINZELN_AN = "kt_einzeln_an";

function einzelnAktiv() {
  try { return localStorage.getItem(EINZELN_AN) === "ja"; } catch (e) { return false; }
}

function einzelnUmschalten() {
  const an = !einzelnAktiv();
  try { localStorage.setItem(EINZELN_AN, an ? "ja" : "nein"); } catch (e) { }
  if (an) einzelnNaechste(true); else { einzelnAufraeumen(); zeichne_(); }
}

// ---------- Wo steht eine Wette bei einem Anbieter? ----------
// "gesetzt"  steht schon in einer gesetzten Kombination dieses Anbieters
// "keine"    er hat sie nicht (Karams Meldung)
// "quote"    die Quote passt dort nicht (Karams Meldung)
// "niedrig"  die Quote erreicht die Mindestquote nicht
// "offen"    kann dort noch gesetzt werden
function einzelnStand(wettId, kz, mind) {
  if (einzelnSchonGesetzt(wettId, kz)) return "gesetzt";
  const grund = nichtDaGrund(wettId, kz);
  if (grund === "quote") return "quote";
  if (grund) return "keine";
  const w = wetteNachId(wettId);
  if (!w) return "keine";
  const q = zielQuote(w, gewaehlteOption(w), kz);
  if (!ueberMind(q.echt, mind)) return "niedrig";
  return "offen";
}

// Steht die Wette schon in einer gesetzten Kombination dieses Anbieters?
// Das ist Regel 2: nicht zweimal beim selben Anbieter.
let _einzelnGesetztKarte = null;
function einzelnGesetztKarte() {
  if (_einzelnGesetztKarte) return _einzelnGesetztKarte;
  const karte = {};
  // BEIDE Ablagen. liesVerlauf allein ist bei angemeldetem Nutzer leer -
  // dann waere Regel 2 ("nicht zweimal beim selben Anbieter") wirkungslos
  // und dieselbe Wette koennte zweimal beim selben Anbieter landen.
  let v = [];
  try {
    v = (typeof gesetzteEintraege === "function")
      ? gesetzteEintraege()
      : (liesVerlauf() || []);
  } catch (e) { v = []; }
  for (const e of v) {
    if (!e || !e.kz || !Array.isArray(e.wetten)) continue;
    for (const x of e.wetten) if (x && x.id) karte[x.id + "|" + e.kz] = true;
  }
  _einzelnGesetztKarte = karte;
  return karte;
}
function einzelnSchonGesetzt(wettId, kz) {
  return einzelnGesetztKarte()[wettId + "|" + kz] === true;
}
function einzelnKarteVergessen() { _einzelnGesetztKarte = null; }

// ---------- Welcher Anbieter ist gerade dran? ----------
// Der erste aus Karams Reihenfolge, bei dem noch drei Wetten aus
// VERSCHIEDENEN Spielen offen sind.
function einzelnFrei(kz, mind) {
  return satzWetten().filter(w =>
    !istVorbei(anstossFeld(w)) && einzelnStand(w.id, kz, mind) === "offen");
}

function einzelnGenug(liste) {
  const spiele = new Set();
  for (const w of liste) spiele.add(spielKennung(w));
  return spiele.size >= 3;
}

function einzelnAnbieter(z) {
  const mind = mindWert(z);
  const reihe = (z && z.einst && z.einst.anbieter && z.einst.anbieter.length)
    ? z.einst.anbieter : KT_ANBIETER_RANG.slice();
  for (const kz of reihe) if (einzelnGenug(einzelnFrei(kz, mind))) return kz;
  return null;
}

// ---------- Die naechste Kombination vorschlagen ----------
// Drei offene Wetten aus verschiedenen Spielen, frueheste Anstosszeit
// zuerst - so ist immer das dringendste oben.
function einzelnDreiWaehlen(kz, mind, ausser) {
  const raus = new Set(ausser || []);
  const frei = einzelnFrei(kz, mind)
    .filter(w => !raus.has(w.id))
    .sort((a, b) => liesAnstoss(anstossFeld(a)).zeit - liesAnstoss(anstossFeld(b)).zeit);
  const gewaehlt = [], spiele = new Set();
  for (const w of frei) {
    const s = spielKennung(w);
    if (spiele.has(s)) continue;
    spiele.add(s);
    gewaehlt.push({ id: w.id, optIdx: gewaehlteOption(w) });
    if (gewaehlt.length === 3) break;
  }
  return gewaehlt;
}

// Raeumt die laufende Einzel-Kombination aus dem Zustand.
function einzelnAufraeumen() {
  const z = liesZustand();
  if (!z) return;
  const vorher = z.scheine.length;
  z.scheine = z.scheine.filter(s => !s.einzeln);
  if (z.scheine.length !== vorher) speichereZustand(z);
}

function einzelnNaechste(ersteRunde) {
  einzelnKarteVergessen();
  const z = liesZustand() || baueAlles();
  z.scheine = z.scheine.filter(s => !s.einzeln);
  const kz = einzelnAnbieter(z);
  if (!kz) {
    speichereZustand(z);
    meldung("<b>Fertig.</b> Bei keinem deiner Anbieter sind noch drei Wetten aus " +
      "verschiedenen Spielen offen. Alles, was ging, ist gesetzt oder abgelehnt.", "gut");
    zeichne_();
    return;
  }
  const drei = einzelnDreiWaehlen(kz, mindWert(z));
  if (drei.length < 3) {
    speichereZustand(z);
    meldung("Bei " + anbieterName(kz) + " sind keine drei Wetten aus verschiedenen " +
      "Spielen mehr offen.", "warn");
    zeichne_();
    return;
  }
  z.scheine.unshift({
    // Auch hier nur eine interne Nummer - die feste kommt beim Speichern.
    nr: z.scheine.reduce((p, s) => Math.max(p, s.nr || 0), 0) + 1,
    id: "EZ" + Date.now(), kz: kz, art: "normal",
    einzeln: true, entfernt: [], wetten: drei
  });
  speichereZustand(z);
  if (!ersteRunde) meldung("Naechste Kombination bei <b>" + anbieterName(kz) + "</b>.", "gut");
  zeichne_();
}

// ---------- Was Karam zu einer Wette sagt ----------
// Beides fuehrt zum selben Ergebnis - diese Wette kommt bei DIESEM
// Anbieter nicht wieder. Der Grund wird trotzdem festgehalten, damit man
// spaeter sieht, ob es an der Quote lag oder am Angebot.
function einzelnAbgelehnt(wettId, grund) {
  const z = liesZustand();
  if (!z) return;
  const sch = z.scheine.find(s => s.einzeln);
  if (!sch) return;
  nichtDaSetzen(wettId, sch.kz, grund === "quote" ? "quote" : "keine");
  const w = wetteNachId(wettId);
  const name = w ? w.spiel : wettId;
  // Nur diese eine Wette tauschen, die anderen zwei bleiben stehen.
  const ausser = sch.wetten.map(x => x.id);
  const ersatz = einzelnDreiWaehlen(sch.kz, mindWert(z), ausser);
  const pos = sch.wetten.findIndex(x => x.id === wettId);
  if (ersatz.length && pos >= 0) {
    sch.wetten[pos] = ersatz[0];
    speichereZustand(z);
    const neu = wetteNachId(ersatz[0].id);
    meldung("<b>" + name + "</b> kommt bei " + anbieterName(sch.kz) + " nicht mehr. " +
      "Dafuer jetzt <b>" + (neu ? neu.spiel : ersatz[0].id) + "</b>.", "gut");
    zeichne_();
    return;
  }
  meldung("<b>" + name + "</b> kommt bei " + anbieterName(sch.kz) + " nicht mehr. " +
    "Es ist aber nichts mehr frei - ich stelle die naechste Kombination zusammen.", "warn");
  einzelnNaechste();
}

// Eine Wette tauschen, ohne sie abzulehnen (sie darf spaeter wiederkommen).
function einzelnTauschen(wettId) {
  const z = liesZustand();
  if (!z) return;
  const sch = z.scheine.find(s => s.einzeln);
  if (!sch) return;
  const ausser = sch.wetten.map(x => x.id);
  const ersatz = einzelnDreiWaehlen(sch.kz, mindWert(z), ausser);
  const pos = sch.wetten.findIndex(x => x.id === wettId);
  if (!ersatz.length || pos < 0) {
    meldung("Es ist keine andere Wette frei, die hier hineinpasst.", "warn");
    return;
  }
  sch.wetten[pos] = ersatz[0];
  speichereZustand(z);
  const neu = wetteNachId(ersatz[0].id);
  meldung("Getauscht: jetzt <b>" + (neu ? neu.spiel : ersatz[0].id) + "</b>. " +
    "Die alte kann spaeter wiederkommen.", "gut");
  zeichne_();
}

// Ganz andere Mischung, ohne etwas abzulehnen.
function einzelnNeuMischen() {
  const z = liesZustand();
  if (!z) return;
  const sch = z.scheine.find(s => s.einzeln);
  if (!sch) { einzelnNaechste(); return; }
  const ausser = sch.wetten.map(x => x.id);
  const drei = einzelnDreiWaehlen(sch.kz, mindWert(z), ausser);
  if (drei.length < 3) {
    meldung("Es sind keine drei anderen Wetten frei. Die Kombination bleibt.", "warn");
    return;
  }
  sch.wetten = drei;
  speichereZustand(z);
  meldung("Andere Mischung bei <b>" + anbieterName(sch.kz) + "</b>.", "gut");
  zeichne_();
}

// ---------- Die Anzeige ----------

const EINZELN_WORT = {
  offen: "offen", gesetzt: "gesetzt", keine: "hat er nicht",
  quote: "Quote passt nicht", niedrig: "unter Mindestquote"
};

function einzelnZeichnen() {
  const kasten = document.getElementById("einzeln");
  if (!kasten) return;
  const knopf = document.getElementById("knopf_einzeln");
  if (knopf) knopf.classList.toggle("aktiv", einzelnAktiv());
  if (!einzelnAktiv()) { kasten.innerHTML = ""; return; }

  einzelnKarteVergessen();
  const z = liesZustand();
  if (!z) { kasten.innerHTML = "<p class='mini'>Erst Scheine bauen.</p>"; return; }
  const mind = mindWert(z);
  const reihe = (z.einst && z.einst.anbieter && z.einst.anbieter.length)
    ? z.einst.anbieter : KT_ANBIETER_RANG.slice();
  const sch = z.scheine.find(s => s.einzeln);
  const dran = sch ? sch.kz : einzelnAnbieter(z);

  let html = '<div class="ez-kopf"><b>Einer nach dem anderen</b>';
  if (dran) {
    const nr = reihe.indexOf(dran) + 1;
    html += ' <span class="ez-schritt">Durchgang ' + nr + " von " + reihe.length +
      ": <b>" + anbieterName(dran) + "</b></span>";
    const frei = einzelnFrei(dran, mind);
    html += ' <span class="mini">' + frei.length + " Wetten dort noch offen</span>";
  } else {
    html += ' <span class="ez-schritt">alles durch</span>';
  }
  html += ' <button onclick="einzelnNeuMischen()">andere Mischung</button>' +
    ' <button onclick="einzelnNaechste()">naechste Kombination</button></div>';

  // Der Fortschritt je Anbieter
  html += '<div class="ez-reihe">';
  for (const kz of reihe) {
    const frei = einzelnFrei(kz, mind);
    const fertig = !einzelnGenug(frei);
    html += '<span class="ez-anb' + (kz === dran ? " dran" : (fertig ? " fertig" : "")) + '">' +
      anbieterName(kz) + " <span class='mini'>" + frei.length + " offen" +
      (fertig ? ", durch" : "") + "</span></span>";
  }
  html += "</div>";

  // Alle Wetten mit ihrem Stand je Anbieter
  const alle = satzWetten().filter(w => !istVorbei(anstossFeld(w)));
  html += '<table class="ez-tab"><thead><tr><th>Spiel</th><th>Wette</th>' +
    reihe.map(kz => "<th>" + anbieterName(kz) + "</th>").join("") +
    "</tr></thead><tbody>";
  for (const w of alle) {
    const imSchein = sch && sch.wetten.some(x => x.id === w.id);
    html += "<tr" + (imSchein ? ' class="ez-drin"' : "") + "><td>" + textSicherK(w.spiel) +
      '<div class="mini">' + textSicherK(w.liga || "") + "</div></td>" +
      "<td class='mini'>" + textSicherK(w.wette) + "</td>";
    for (const kz of reihe) {
      const st = einzelnStand(w.id, kz, mind);
      html += '<td class="ez-' + st + '">' + EINZELN_WORT[st] + "</td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  kasten.innerHTML = html;
}

// Fremden Text nie als HTML einsetzen.
function textSicherK(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

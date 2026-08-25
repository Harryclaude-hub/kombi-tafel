// ============================================================
// KOMBI-BAU: baut aus den noch offenen Wetten 3er-Scheine.
//
// Karams drei harte Regeln:
//   1. Jede Einzelquote muss >= Mindestquote sein (nach Gebuehr!)
//   2. Alle drei Wetten eines Scheins beim GLEICHEN Anbieter
//   3. Jedes Spiel darf insgesamt nur EINMAL vorkommen
//
// Braucht daten.js, roh.js, recherche.js und logik.js.
// ============================================================
"use strict";

// ---------- Welche Quote gilt fuer die Kombi-Rechnung ----------
// modus "geprueft" = nur was du selbst getippt oder per Screenshot hast
// modus "auchfoto" = zusaetzlich die Foto-Quote als Notbehelf
function kombiQuote(w, optIdx, kz, modus) {
  const opt = w.o[optIdx][0];
  const teiler = GEBUEHREN_TEILER[kz];

  const eigen = liesEingabe(w.id, opt, kz);
  if (eigen) return { roh: eigen, echt: eigen / teiler, quelle: "getippt" };

  const shot = screenshotQuote(w, optIdx, kz);
  if (shot) return { roh: shot.wert, echt: shot.wert / teiler, quelle: "Screenshot" };

  if (modus === "auchfoto") {
    const ref = w.o[optIdx][1];
    return { roh: ref, echt: ref / teiler, quelle: "Foto" };
  }
  return null;
}

// Spiel-Kennung: doppelte Spiele duerfen nur einmal verwendet werden
function spielKennung(w) {
  return w.doppel || (w.liga + "|" + w.spiel);
}

// ---------- Der Bau ----------

function baueScheine(einst) {
  const mind = einst.mindestquote;
  const modus = einst.quellen;
  const erlaubt = einst.anbieter;   // Array von Kuerzeln

  // 1. Alle noch offenen Wetten, sortiert nach Anstoss
  const offen = WETTEN.filter(w => !istVorbei(anstossFeld(w)))
    .sort((a, b) => liesAnstoss(anstossFeld(a)).zeit - liesAnstoss(anstossFeld(b)).zeit);

  // 2. Fuer jede Wette: bei welchen Anbietern erfuellt sie die Mindestquote?
  const kandidaten = [];
  const rausgeflogen = [];
  for (const w of offen) {
    const optIdx = gewaehlteOption(w);
    const v = verfuegbarkeit(w);
    const moeglich = [];
    for (const kz of erlaubt) {
      if (v[kz] === "N") continue;              // Markt gibt es dort nicht
      const q = kombiQuote(w, optIdx, kz, modus);
      if (q && q.echt >= mind - 0.0001) moeglich.push({ kz: kz, q: q });
    }
    if (moeglich.length === 0) {
      rausgeflogen.push({ w: w, optIdx: optIdx, grund: grundFuerRaus(w, optIdx, erlaubt, modus, mind) });
    } else {
      moeglich.sort((a, b) => b.q.echt - a.q.echt);   // beste Quote zuerst
      kandidaten.push({ w: w, optIdx: optIdx, moeglich: moeglich, kennung: spielKennung(w) });
    }
  }

  // 3. Doppelte Spiele: nur die erste Wette je Kennung behalten
  const gesehen = new Set();
  const eindeutig = [];
  const doppelt = [];
  for (const k of kandidaten) {
    if (gesehen.has(k.kennung)) { doppelt.push(k); continue; }
    gesehen.add(k.kennung);
    eindeutig.push(k);
  }

  // 4. Jede Wette ihrem besten erlaubten Anbieter zuordnen
  const topf = {};
  for (const kz of erlaubt) topf[kz] = [];
  for (const k of eindeutig) topf[k.moeglich[0].kz].push(k);

  // 5. Reste umverteilen: wenn bei einem Anbieter 1 oder 2 uebrig blieben,
  //    schau ob sie bei einem anderen Anbieter eine Dreiergruppe vollmachen.
  for (let runde = 0; runde < 3; runde++) {
    for (const kz of erlaubt) {
      const rest = topf[kz].length % 3;
      if (rest === 0 || topf[kz].length === 0) continue;
      // die letzten "rest" Stueck versuchen zu verschieben
      for (let i = 0; i < rest; i++) {
        const k = topf[kz][topf[kz].length - 1];
        const ziel = k.moeglich.find(m => m.kz !== kz && topf[m.kz] && (topf[m.kz].length % 3) !== 0);
        if (ziel) { topf[kz].pop(); topf[ziel.kz].push(k); }
        else break;
      }
    }
  }

  // 6. Je Anbieter Dreiergruppen bilden (Reihenfolge gemischt, aber wiederholbar)
  const scheine = [];
  const uebrig = [];
  for (const kz of erlaubt) {
    const liste = mische(topf[kz].slice(), einst.mischzahl);
    let i = 0;
    while (i + 3 <= liste.length) {
      const drei = liste.slice(i, i + 3);
      const teile = drei.map(k => {
        const m = k.moeglich.find(x => x.kz === kz);
        return { w: k.w, optIdx: k.optIdx, q: m.q };
      });
      const gesamt = teile.reduce((p, t) => p * t.q.echt, 1);
      const gesamtRoh = teile.reduce((p, t) => p * t.q.roh, 1);
      scheine.push({ kz: kz, teile: teile, gesamt: gesamt, gesamtRoh: gesamtRoh });
      i += 3;
    }
    for (; i < liste.length; i++) uebrig.push({ kz: kz, k: liste[i] });
  }

  scheine.sort((a, b) => b.gesamt - a.gesamt);
  return { scheine: scheine, uebrig: uebrig, rausgeflogen: rausgeflogen, doppelt: doppelt,
           gesamtOffen: offen.length };
}

function grundFuerRaus(w, optIdx, erlaubt, modus, mind) {
  const v = verfuegbarkeit(w);
  let hatMarkt = false, hatQuote = false, beste = 0;
  for (const kz of erlaubt) {
    if (v[kz] === "N") continue;
    hatMarkt = true;
    const q = kombiQuote(w, optIdx, kz, modus);
    if (q) { hatQuote = true; if (q.echt > beste) beste = q.echt; }
  }
  if (!hatMarkt) return "kein Anbieter fuehrt diesen Markt";
  if (!hatQuote) return "noch keine Quote geprueft";
  return "beste echte Quote nur " + beste.toFixed(2) + ", unter der Mindestquote " + mind.toFixed(2);
}

// Wiederholbares Mischen: gleiche Mischzahl gibt gleiche Reihenfolge
function mische(liste, saat) {
  let s = saat || 1;
  const zufall = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

// ---------- Verlauf ----------

function liesVerlauf() {
  try { return JSON.parse(localStorage.getItem("verlauf") || "[]"); }
  catch (e) { return []; }
}

function speichereVerlauf(v) { localStorage.setItem("verlauf", JSON.stringify(v)); }

function scheinSpeichern(schein, einsatz) {
  const v = liesVerlauf();
  const jetzt = new Date();
  v.unshift({
    zeit: jetzt.toISOString(),
    kz: schein.kz,
    anbieter: anbieterName(schein.kz),
    einsatz: einsatz,
    quote: rund2(schein.gesamt),
    moeglich: rund2(einsatz * schein.gesamt),
    wetten: schein.teile.map(t => ({
      id: t.w.id, spiel: t.w.spiel, wette: t.w.wette,
      linie: t.w.o[t.optIdx][0], quote: rund2(t.q.echt), quelle: t.q.quelle
    })),
    stand: "offen"
  });
  speichereVerlauf(v);
}

// ---------- Anzeige ----------

let letzteScheine = null;

function einstellungenLesen() {
  const anb = [];
  document.querySelectorAll(".anbwahl:checked").forEach(c => anb.push(c.value));
  return {
    mindestquote: parseFloat(document.getElementById("mind").value) || 1.5,
    quellen: document.getElementById("quellen").value,
    anbieter: anb.length ? anb : ["iw", "bw", "b3", "st"],
    mischzahl: parseInt(document.getElementById("mischzahl").value, 10) || 1
  };
}

function zeichneKombis() {
  const einst = einstellungenLesen();
  const erg = baueScheine(einst);
  letzteScheine = erg.scheine;

  // Kopfzahlen
  const anzahlWetten = erg.scheine.length * 3;
  document.getElementById("uebersicht").innerHTML =
    "<b>" + erg.scheine.length + " Scheine</b> aus " + anzahlWetten + " Wetten gebaut. " +
    "Offen waren " + erg.gesamtOffen + " Wetten: " +
    erg.rausgeflogen.length + " unter der Mindestquote oder ohne Quote, " +
    erg.doppelt.length + " als Doppel-Spiel aussortiert, " +
    erg.uebrig.length + " blieben uebrig (weniger als drei beim selben Anbieter).";

  // Scheine
  let html = "";
  if (erg.scheine.length === 0) {
    html = '<div class="warnkern">Keine Scheine moeglich. Entweder ist die Mindestquote zu hoch, ' +
      'oder es sind noch zu wenige Quoten geprueft. Stell oben auf "auch Foto-Quoten verwenden", ' +
      'dann siehst du, was mit den Zahlen vom Foto-Tag ginge.</div>';
  }
  erg.scheine.forEach((s, nr) => {
    const einsatzId = "e_" + nr;
    html += '<div class="schein"><div class="s-kopf">Schein ' + (nr + 1) +
      ' <span class="s-anb">' + anbieterName(s.kz) + "</span>" +
      '<span class="s-quote">Gesamtquote <b>' + rund2(s.gesamt).toFixed(2) + "</b>" +
      (GEBUEHREN_TEILER[s.kz] !== 1
        ? ' <span class="mini">(angezeigt waeren ' + rund2(s.gesamtRoh).toFixed(2) + ")</span>" : "") +
      "</span></div><table class='s-tab'>";
    for (const t of s.teile) {
      html += "<tr><td class='s-zeit'>" + zeitText(anstossFeld(t.w)) + "</td>" +
        "<td class='s-liga'>" + t.w.liga + "</td>" +
        "<td class='s-spiel'>" + t.w.spiel + "</td>" +
        "<td class='s-wette'>" + t.w.wette.split("(")[0].trim() + " " + t.w.o[t.optIdx][0] + "</td>" +
        "<td class='s-q'><b>" + rund2(t.q.echt).toFixed(2) + "</b>" +
        '<div class="mini">' + t.q.quelle +
        (GEBUEHREN_TEILER[s.kz] !== 1 ? ", angezeigt " + t.q.roh.toFixed(2) : "") + "</div></td>" +
        "<td class='s-reiter'><span class='reiter-chip'>" + t.w.s + "</span></td></tr>";
    }
    html += "</table><div class='s-fuss'>Einsatz " +
      '<input type="number" step="0.5" min="0" class="einsatz" id="' + einsatzId +
      '" value="10" oninput="rechneGewinn(' + nr + ')"> &euro; ' +
      '&nbsp;&rarr;&nbsp; moeglicher Gewinn <b id="g_' + nr + '">' +
      rund2(10 * s.gesamt).toFixed(2) + " &euro;</b>" +
      '<button class="merken" onclick="scheinMerken(' + nr + ')">In den Verlauf</button></div></div>';
  });
  document.getElementById("scheine").innerHTML = html;

  // Uebrige und aussortierte
  let rest = "";
  if (erg.uebrig.length) {
    rest += "<h3>Uebrig geblieben (" + erg.uebrig.length + ")</h3><p class='mini'>" +
      "Diese Wetten erfuellen die Mindestquote, aber beim selben Anbieter waren keine drei mehr uebrig.</p><ul>";
    for (const u of erg.uebrig)
      rest += "<li>" + u.k.w.spiel + " <span class='mini'>(" + u.k.w.wette + ", waere " +
        anbieterName(u.kz) + ")</span></li>";
    rest += "</ul>";
  }
  if (erg.doppelt.length) {
    rest += "<h3>Als Doppel-Spiel aussortiert (" + erg.doppelt.length + ")</h3>" +
      "<p class='mini'>Dieses Spiel steckt schon mit einer anderen Wette in einem Schein. " +
      "Zwei Wetten auf dasselbe Spiel haengen zusammen und wuerden gemeinsam fallen.</p><ul>";
    for (const d of erg.doppelt)
      rest += "<li>" + d.w.spiel + " <span class='mini'>(" + d.w.wette + ")</span></li>";
    rest += "</ul>";
  }
  if (erg.rausgeflogen.length) {
    rest += "<h3>Nicht verwendbar (" + erg.rausgeflogen.length + ")</h3><ul>";
    for (const r of erg.rausgeflogen)
      rest += "<li>" + r.w.spiel + " <span class='mini'>(" + r.w.wette + "): " + r.grund + "</span></li>";
    rest += "</ul>";
  }
  document.getElementById("reste").innerHTML = rest;

  zeichneVerlauf();
}

function rechneGewinn(nr) {
  const s = letzteScheine[nr];
  const e = parseFloat(document.getElementById("e_" + nr).value) || 0;
  document.getElementById("g_" + nr).textContent = rund2(e * s.gesamt).toFixed(2) + " €";
}

function scheinMerken(nr) {
  const s = letzteScheine[nr];
  const e = parseFloat(document.getElementById("e_" + nr).value) || 0;
  if (!e) { alert("Bitte zuerst einen Einsatz eintragen."); return; }
  scheinSpeichern(s, e);
  zeichneVerlauf();
}

function zeichneVerlauf() {
  const v = liesVerlauf();
  const ziel = document.getElementById("verlauf");
  if (!v.length) {
    ziel.innerHTML = "<p class='mini'>Noch keine Scheine gemerkt. Bau oben Scheine und " +
      "druecke bei den Scheinen, die du wirklich setzt, auf \"In den Verlauf\".</p>";
    return;
  }
  const summe = v.reduce((p, x) => p + (x.einsatz || 0), 0);
  const offen = v.filter(x => x.stand === "offen").length;
  let html = "<p><b>" + v.length + " Scheine im Verlauf</b>, davon " + offen +
    " offen. Eingesetzt insgesamt: <b>" + summe.toFixed(2) + " &euro;</b></p>";
  html += "<table><thead><tr><th>Wann</th><th>Anbieter</th><th>Wetten</th><th>Quote</th>" +
    "<th>Einsatz</th><th>Moeglich</th><th>Stand</th><th></th></tr></thead><tbody>";
  v.forEach((x, i) => {
    const d = new Date(x.zeit);
    html += "<tr><td class='mini'>" + String(d.getDate()).padStart(2, "0") + "." +
      String(d.getMonth() + 1).padStart(2, "0") + ". " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + "</td>" +
      "<td>" + x.anbieter + "</td><td class='mini'>" +
      x.wetten.map(t => t.spiel + " (" + t.wette + ")").join("<br>") + "</td>" +
      "<td><b>" + x.quote.toFixed(2) + "</b></td><td>" + x.einsatz.toFixed(2) + " &euro;</td>" +
      "<td>" + x.moeglich.toFixed(2) + " &euro;</td>" +
      "<td><select onchange='standAendern(" + i + ", this.value)'>" +
      ["offen", "gewonnen", "verloren"].map(o =>
        "<option" + (x.stand === o ? " selected" : "") + ">" + o + "</option>").join("") +
      "</select></td>" +
      "<td><button onclick='verlaufLoeschen(" + i + ")'>weg</button></td></tr>";
  });
  html += "</tbody></table>";

  // Bilanz
  const gew = v.filter(x => x.stand === "gewonnen");
  const ver = v.filter(x => x.stand === "verloren");
  if (gew.length || ver.length) {
    const ein = gew.concat(ver).reduce((p, x) => p + x.einsatz, 0);
    const aus = gew.reduce((p, x) => p + x.moeglich, 0);
    const saldo = aus - ein;
    html += "<div class='" + (saldo >= 0 ? "merk" : "warn") + "'><b>Bilanz der abgeschlossenen Scheine:</b> " +
      gew.length + " gewonnen, " + ver.length + " verloren. Eingesetzt " + ein.toFixed(2) +
      " &euro;, zurueck " + aus.toFixed(2) + " &euro;, Saldo <b>" +
      (saldo >= 0 ? "+" : "") + saldo.toFixed(2) + " &euro;</b></div>";
  }
  ziel.innerHTML = html;
}

function standAendern(i, wert) {
  const v = liesVerlauf();
  if (v[i]) { v[i].stand = wert; speichereVerlauf(v); zeichneVerlauf(); }
}

function verlaufLoeschen(i) {
  const v = liesVerlauf();
  v.splice(i, 1);
  speichereVerlauf(v);
  zeichneVerlauf();
}

function neuMischen() {
  const f = document.getElementById("mischzahl");
  f.value = (parseInt(f.value, 10) || 1) + 1;
  zeichneKombis();
}

document.addEventListener("DOMContentLoaded", zeichneKombis);

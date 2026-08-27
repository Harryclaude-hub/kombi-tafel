// ============================================================
// SCHEINLESEN: liest die Zahlen aus einem Wettschein-Foto.
//
// KEIN KI-Dienst: die Texterkennung (Tesseract) läuft komplett
// im Browser, deterministisch, ohne dass das Foto irgendwohin
// geschickt wird. Danach rechnet PURE MATHEMATIK:
//
//   Einsatz x Gesamtquote = erwarteter Gewinn
//   erwarteter Gewinn - möglicher Gewinn laut Schein = GEBÜHR
//   möglicher Gewinn / Einsatz = echte Quote nach Gebühren
//   Produkt der Einzelquoten = Gesamtquote (Gegenprobe)
//
// Nur wenn die Zahlen sich GEGENSEITIG bestätigen, gilt die
// Lesung als sicher. Sonst wird NICHTS übernommen - lieber
// ehrlich "bitte selbst prüfen" als eine stille falsche Zahl.
// ============================================================
"use strict";

const LESE_ANKER = {
  einsatz: /einsatz|wetteinsatz|gesamteinsatz|stake|bet\b/i,
  gewinn: /gewinn|auszahlung|r.ckzahlung|ausbezahlt|return|winnings/i,
  quote: /gesamtquote|quote|odds/i
};

// Alle Zahlen einer Textzeile (deutsches und englisches Format)
function leseZahlen(zeile) {
  const werte = [];
  const re = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?/g;
  let m;
  while ((m = re.exec(zeile)) !== null) {
    const ganz = m[1].replace(/[.\s]/g, "");
    const wert = parseFloat(ganz + "." + (m[2] || "0"));
    if (wert >= 0.01 && wert <= 1000000) werte.push(wert);
  }
  return werte;
}

// Deterministische Auswertung des erkannten Textes
function scheinFotoAuswerten(text) {
  const zeilen = String(text).split(/\n+/);
  const alle = [];            // { wert, anker: "einsatz"|"gewinn"|"quote"|null }
  for (const zeile of zeilen) {
    let anker = null;
    if (LESE_ANKER.einsatz.test(zeile)) anker = "einsatz";
    else if (LESE_ANKER.gewinn.test(zeile)) anker = "gewinn";
    else if (LESE_ANKER.quote.test(zeile)) anker = "quote";
    for (const wert of leseZahlen(zeile)) alle.push({ wert: wert, anker: anker });
  }
  if (!alle.length) return { sicher: false, grund: "Keine Zahlen im Foto gefunden." };

  // Bestes Tripel (Einsatz, Gesamtquote, Gewinn) über die Rechenprobe suchen
  let best = null;
  for (const e of alle) {
    if (e.wert < 0.5 || e.wert > 100000) continue;
    for (const q of alle) {
      if (q === e || q.wert < 1.01 || q.wert > 10000) continue;
      for (const g of alle) {
        if (g === e || g === q || g.wert <= e.wert) continue;
        const erwartet = e.wert * q.wert;
        const diff = erwartet - g.wert;
        const rel = diff / erwartet;
        let art = null;
        if (Math.abs(rel) <= 0.01) art = "exakt";
        else if (rel > 0 && rel <= 0.12) art = "gebuehr";
        if (!art) continue;
        const score = (e.anker === "einsatz" ? 4 : 0) + (g.anker === "gewinn" ? 4 : 0) +
          (q.anker === "quote" ? 2 : 0) + (art === "exakt" ? 3 : 1);
        if (!best || score > best.score || (score === best.score && g.wert > best.gewinn)) {
          best = { einsatz: e.wert, quote: q.wert, gewinn: g.wert, score: score,
            gebuehr: art === "gebuehr" ? diff : 0, art: art };
        }
      }
    }
  }
  if (!best) return { sicher: false, grund: "Die Zahlen gehen sich nicht auf: kein Einsatz x Quote " +
    "passt zum möglichen Gewinn. Bitte selbst prüfen und von Hand eintragen." };

  // Einzelquoten: kleine Quoten, deren Produkt die Gesamtquote bestätigt
  const kandidaten = alle.map(x => x.wert).filter(w =>
    w >= 1.01 && w <= 30 && w !== best.quote && w !== best.einsatz && w !== best.gewinn);
  let einzel = [], einzelProbe = false;
  if (kandidaten.length >= 2 && kandidaten.length <= 6) {
    const produkt = kandidaten.reduce((p, w) => p * w, 1);
    if (Math.abs(produkt - best.quote) / best.quote <= 0.02) {
      einzel = kandidaten;
      einzelProbe = true;
    }
  }
  if (!einzelProbe) einzel = kandidaten;

  const sicher = best.score >= 5 || (best.art === "exakt" && einzelProbe);
  return {
    sicher: sicher,
    einsatz: rund2_(best.einsatz),
    quote: rund2_(best.quote),
    gewinn: rund2_(best.gewinn),
    gebuehr: rund2_(best.gebuehr),
    gebuehrProzent: rund2_(best.gebuehr / (best.einsatz * best.quote) * 100),
    effektiveQuote: rund2_(best.gewinn / best.einsatz),
    einzel: einzel.map(rund2_),
    einzelProbe: einzelProbe,
    exakt: best.art === "exakt",
    gelesenAm: new Date().toISOString()
  };
}

function rund2_(x) { return Math.round(x * 100) / 100; }

// ---------- Ablauf: Foto -> Text -> Auswertung -> Anzeige ----------

async function scheinFotoLesen(scheinId) {
  const box = document.getElementById("fotolese_" + scheinId);
  const foto = localStorage.getItem(fotoSchluessel(scheinId));
  if (!foto) { meldung("Zuerst ein Foto vom Wettschein hochladen.", "warn"); return; }
  if (typeof Tesseract === "undefined") {
    meldung("Die Texterkennung ist noch nicht geladen - Seite einmal neu laden.", "warn");
    return;
  }
  if (box) box.innerHTML = '<div class="mini">Lese das Foto... beim ersten Mal dauert das ' +
    "ein paar Sekunden (die Erkennung lädt einmalig ihre Daten).</div>";
  let text;
  try {
    const erg = await Tesseract.recognize(foto, "deu");
    text = erg.data.text;
  } catch (e) {
    if (box) box.innerHTML = '<div class="mini rot">Texterkennung fehlgeschlagen: ' +
      String(e.message || e).slice(0, 80) + "</div>";
    return;
  }
  const a = scheinFotoAuswerten(text);
  localStorage.setItem("foto_analyse_" + scheinId, JSON.stringify(a));
  if (box) box.innerHTML = fotoAnalyseHtml(scheinId, a);
}

function fotoAnalyseHtml(scheinId, a) {
  if (!a.sicher && a.grund) {
    return '<div class="lesekasten lesewarn"><b>Nicht sicher lesbar.</b> ' + a.grund + "</div>";
  }
  let h = '<div class="lesekasten' + (a.sicher ? "" : " lesewarn") + '">';
  h += a.sicher
    ? '<p class="gruen"><b>Die Zahlen bestätigen sich gegenseitig</b> - die Rechenprobe geht auf.</p>'
    : '<p class="rot"><b>Nur teilweise sicher</b> - bitte mit dem Schein vergleichen, bevor du etwas übernimmst.</p>';
  h += "<table><tbody>" +
    "<tr><td>Einsatz laut Foto</td><td><b>" + a.einsatz.toFixed(2) + " &euro;</b></td></tr>" +
    "<tr><td>Gesamtquote laut Foto</td><td><b>" + a.quote.toFixed(2) + "</b></td></tr>" +
    "<tr><td>Möglicher Gewinn laut Foto</td><td><b>" + a.gewinn.toFixed(2) + " &euro;</b></td></tr>" +
    "<tr><td>Rechenprobe " + a.einsatz.toFixed(2) + " x " + a.quote.toFixed(2) + "</td><td>" +
      (a.einsatz * a.quote).toFixed(2) + " &euro;</td></tr>" +
    "<tr><td><b>Gebühr</b> (Differenz)</td><td class='" + (a.gebuehr > 0 ? "rot" : "gruen") + "'><b>" +
      a.gebuehr.toFixed(2) + " &euro;" + (a.gebuehr > 0 ? " (" + a.gebuehrProzent.toFixed(1) + " %)" : ", keine") +
      "</b></td></tr>" +
    "<tr><td><b>Echte Quote nach Gebühr</b></td><td><b>" + a.effektiveQuote.toFixed(2) + "</b></td></tr>" +
    (a.einzel && a.einzel.length ? "<tr><td>Einzelquoten" +
      (a.einzelProbe ? " <span class='gruen'>(Produkt passt zur Gesamtquote)</span>"
                     : " <span class='mini'>(ohne Gegenprobe)</span>") + "</td><td>" +
      a.einzel.map(x => x.toFixed(2)).join(" / ") + "</td></tr>" : "") +
    "</tbody></table>";
  if (a.sicher) {
    h += '<button class="haupt" onclick="fotoEinsatzUebernehmen(\'' + scheinId + '\')">' +
      "Einsatz " + a.einsatz.toFixed(2) + " &euro; übernehmen</button> " +
      '<span class="mini">Die Analyse ist am Schein gespeichert und wandert beim Merken mit ' +
      "in dein Konto (fürs Feld \"Wirklich bekommen\").</span>";
  }
  h += "</div>";
  return h;
}

function fotoEinsatzUebernehmen(scheinId) {
  let a;
  try { a = JSON.parse(localStorage.getItem("foto_analyse_" + scheinId) || "null"); } catch (e) { return; }
  if (!a || !a.sicher) return;
  const feld = document.getElementById("e_" + scheinId);
  if (!feld) return;
  feld.value = a.einsatz;
  feld.dispatchEvent(new Event("input"));
  meldung("Einsatz " + a.einsatz.toFixed(2) + " &euro; aus dem Foto übernommen.", "gut");
}

function fotoAnalyseLesen(scheinId) {
  try { return JSON.parse(localStorage.getItem("foto_analyse_" + scheinId) || "null"); } catch (e) { return null; }
}

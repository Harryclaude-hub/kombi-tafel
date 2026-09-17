// ============================================================
// BILDER AUS DEM KOMBI-BAU KOPIEREN - JEDES FUER SICH
// ============================================================
// Karam (17.09.2026): "Beim Kopieren moechte ich, dass die Bilder
// wirklich alle separat sind. Wenn ich sie kopiere und irgendwo
// hinzufuege, sind das nicht EIN Bild, sondern sechs unterschiedliche
// Dateien und Bilder. Sonst ist das viel zu unscharf."
//
// DARAUFHIN IST DIE MONTAGE RAUS.
// Vorher wurden die Scheine zu einem Blatt zusammengesetzt und dabei auf
// 640 Punkte Breite gebracht. Genau das war das Unscharfe. Diese Datei
// verkleinert jetzt NICHTS mehr: jedes Bild geht in voller Groesse in
// die Zwischenablage, so wie es aufgenommen wurde.
//
// WAS DIE ZWISCHENABLAGE KANN, AM 17.09.2026 IM BROWSER NACHGEMESSEN,
// nicht aus dem Kopf:
//   navigator.clipboard.write([bild1, bild2])
//     -> NotAllowedError: "Support for multiple ClipboardItems is not
//        implemented". Mehrere Bilder GLEICHZEITIG gehen also nicht.
//   ClipboardItem.supports("image/png")  -> true
//   ClipboardItem.supports("image/jpeg") -> FALSE (deshalb wird jedes
//        Bild vorher nach PNG gewandelt, verlustfrei)
//   ClipboardItem.supports("text/html")  -> true
//
// DARAUS FOLGEN GENAU ZWEI WEGE, und beide geben EINZELNE Bilder:
//   1. EINZELN (der sichere Weg): ein Klick, ein Bild, einfuegen,
//      naechster Klick. Der Knopf sagt immer, wo er steht. Das
//      funktioniert ueberall, auch im einfachsten Chatfenster.
//   2. ALLE AUF EINMAL: ein einziger Eintrag vom Typ text/html, in dem
//      alle Bilder als eigene img-Elemente stehen. Wo man formatierten
//      Text einfuegen kann (Word, Mail, viele Chats), kommen sie als
//      MEHRERE einzelne Bilder an, jedes in voller Groesse. Wo nur
//      reiner Text geht, kommt nichts an - deshalb steht das am Knopf
//      dran und deshalb bleibt Weg 1 der Hauptknopf.
//
// Heruntergeladen wird NICHTS. Karam ausdruecklich: "ohne dass ich etwas
// runterladen muss."
//
// KEIN STILLES SCHEITERN: es kommt nie eine gruene Meldung, ohne dass
// wirklich kopiert wurde. Geht ein Schritt daneben, bleibt der Zaehler
// stehen, der Grund steht da, und es wird nichts uebersprungen.
//
// EIGENE DATEI, damit sie in einem Stueck wieder verschwinden kann.
// kombis.js wird nicht angefasst, nur kombis.html laedt diese Datei und
// hat einen leeren Behaelter dafuer.

"use strict";

// Nachgesehen: im Kombi-Bau gibt es genau EINEN Ort mit Wettschein-
// Bildern, naemlich das img in div.s-foto an jeder gebauten Karte.
// #niedrig enthaelt dieselben Karten, steht aber dauerhaft auf hidden -
// die faengt bkSichtbar ab. Das Logo der Kopfleiste, die Chat-Bilder im
// Glocken-Fenster und das Vollbild am Handy sind ausdruecklich NICHT
// dabei; sie sind keine Wettscheine.
const BK_ORTE = [
  "#scheine .s-foto img",      // das Foto an einer gebauten Karte
  "#niedrig .s-foto img"       // dieselben Karten, aber versteckt: faellt raus
];

// Sichtbar heisst: es ist wirklich auf dem Schirm, nicht in einem
// zugeklappten oder ausgefilterten Kasten. offsetParent ist null, sobald
// irgendein Elternteil display:none hat - genau das wollen wir.
function bkSichtbar(el) {
  if (!el) return false;
  if (el.hidden) return false;
  if (!el.getAttribute("src")) return false;
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Die Beschriftung zu einem Bild: der Dateiname, den Karam vergeben hat,
// sonst der Kopf der Karte, sonst gar nichts. Nichts erfinden.
function bkTitel(img) {
  const kasten = img.closest(".s-foto") || img.closest("td") || img.parentElement;
  if (kasten) {
    const n = kasten.querySelector(".fotoname");
    if (n && n.textContent.trim()) return n.textContent.trim();
  }
  const karte = img.closest(".schein");
  if (karte) {
    const kopf = karte.querySelector(".s-kopf");
    if (kopf && kopf.textContent.trim()) {
      return kopf.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
    }
  }
  if (img.alt && img.alt.trim()) return img.alt.trim();
  return "";
}

function bkBilderSammeln() {
  const raus = [], gesehen = new Set();
  for (const ort of BK_ORTE) {
    for (const img of document.querySelectorAll(ort)) {
      if (!bkSichtbar(img)) continue;
      const q = img.getAttribute("src");
      // Dasselbe Bild kann an zwei Stellen stehen. Zweimal kopieren
      // waere nur Verwirrung.
      if (gesehen.has(q)) continue;
      gesehen.add(q);
      raus.push({ quelle: q, titel: bkTitel(img) });
    }
  }
  return raus;
}

// Ein Bild wirklich laden. Kommt es nicht, wird es gezaehlt, nicht
// verschwiegen.
function bkLaden(quelle) {
  return new Promise((fertig) => {
    const b = new Image();
    b.onload = () => fertig(b);
    b.onerror = () => fertig(null);
    // Daten-URLs brauchen das nicht, fremde Adressen schon, sonst waere
    // die Zeichenflaeche danach gesperrt und toBlob wuerde werfen.
    if (!/^data:/.test(quelle)) b.crossOrigin = "anonymous";
    b.src = quelle;
  });
}

function bkBlob(flaeche) {
  return new Promise((fertig) => {
    // PNG, weil die Zwischenablage image/jpeg ausdruecklich NICHT nimmt
    // (nachgemessen: ClipboardItem.supports("image/jpeg") ist false).
    flaeche.toBlob((b) => fertig(b), "image/png");
  });
}

// Ein Bild in voller Groesse als PNG. KEIN Verkleinern: genau das war
// vorher das Unscharfe.
async function bkPngVon(quelle) {
  const b = await bkLaden(quelle);
  if (!b || !b.naturalWidth) return null;
  const f = document.createElement("canvas");
  f.width = b.naturalWidth;
  f.height = b.naturalHeight;
  f.getContext("2d").drawImage(b, 0, 0);
  return await bkBlob(f);
}

function bkMeldung(text, art) {
  if (typeof meldung === "function") { meldung(text, art); return; }
  if (art === "warn") alert(text.replace(/<[^>]+>/g, ""));
}


// ============================================================
// WEG 1: EINZELN
// ============================================================

let bkLaeuft = false;
let bkListe = [];      // [{quelle, titel}] der Durchgang, der gerade laeuft
let bkIndex = 0;       // welches Bild als naechstes drankommt

async function bkEinesKopieren(eintrag) {
  const blob = await bkPngVon(eintrag.quelle);
  if (!blob) return { ok: false, grund: "das Bild liess sich nicht laden" };
  if (!navigator.clipboard || !window.ClipboardItem) {
    return { ok: false, grund: "dieser Browser kann keine Bilder in die Zwischenablage legen" };
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true };
  } catch (e) {
    return { ok: false, grund: String(e && e.message ? e.message : e).slice(0, 120) };
  }
}

async function bkEinzelnStart() {
  if (bkLaeuft) return;
  bkListe = bkBilderSammeln();
  bkIndex = 0;
  if (!bkListe.length) {
    bkMeldung("Hier ist gerade <b>kein Bild</b> zu sehen. Fotos haengen an den Karten " +
      "unter &quot;In Arbeit&quot; - ist dort keins, gibt es auch nichts zu kopieren.", "warn");
    bkLeisteZeichnen();
    return;
  }
  await bkSchritt();
}

// Das naechste Bild. Genau ein Klick, genau ein Bild.
async function bkSchritt() {
  if (bkLaeuft) return;
  if (bkIndex >= bkListe.length) { bkFertig(); return; }
  bkLaeuft = true;
  bkLeisteZeichnen();
  try {
    const nr = bkIndex + 1;
    const eintrag = bkListe[bkIndex];
    const r = await bkEinesKopieren(eintrag);
    if (r.ok) {
      bkIndex++;
      const rest = bkListe.length - bkIndex;
      bkMeldung("<b>Bild " + nr + " von " + bkListe.length + "</b> ist in der Zwischenablage" +
        (eintrag.titel ? " (" + eintrag.titel + ")" : "") + ", in voller Groesse. Jetzt einfuegen" +
        (rest ? ", dann auf <b>N&auml;chstes Bild</b> dr&uuml;cken." : ". Das war das letzte."),
        "gut");
    } else {
      // NICHT weiterzaehlen. Sonst waere ein Bild uebersprungen und
      // niemand haette es gemerkt.
      bkMeldung("<b>Bild " + nr + " konnte nicht kopiert werden</b> (" + r.grund +
        "). Es wurde nichts uebersprungen - du stehst weiter bei Bild " + nr + ".", "warn");
    }
  } finally {
    bkLaeuft = false;
    bkLeisteZeichnen();
  }
}

function bkZurueck() {
  if (bkIndex > 0) bkIndex--;
  bkLeisteZeichnen();
}

function bkFertig() {
  const zahl = bkListe.length;
  bkListe = [];
  bkIndex = 0;
  bkLeisteZeichnen();
  if (zahl) bkMeldung("Fertig, alle " + zahl + " Bilder waren dran.", "gut");
}


// ============================================================
// WEG 2: ALLE AUF EINMAL, ABER ALS EINZELNE BILDER
// ============================================================
// Ein einziger Eintrag vom Typ text/html, in dem jedes Bild ein eigenes
// img-Element ist. Das ist KEINE Montage: beim Einfuegen entstehen
// mehrere einzelne Bilder, jedes in voller Groesse.
// Die Quellen bleiben die Original-Daten-URLs, es wird nichts neu
// gerechnet und nichts verkleinert.

function bkHtmlBauen(bilder) {
  // Jedes Bild in einer eigenen Zeile, mit seinem Namen darueber. Der
  // Absatz dazwischen ist der Grund, warum das Ziel sie als getrennte
  // Bilder uebernimmt und nicht als eine Zeile.
  return bilder.map(b =>
    "<p>" + (b.titel ? "<b>" + b.titel.replace(/[<>&]/g, "") + "</b><br>" : "") +
    '<img src="' + b.quelle + '"></p>'
  ).join("\n");
}

async function bkAlleAufEinmal() {
  if (bkLaeuft) return;
  const stelle = bkBilderSammeln();
  if (!stelle.length) {
    bkMeldung("Hier ist gerade <b>kein Bild</b> zu sehen.", "warn");
    return;
  }
  if (!navigator.clipboard || !window.ClipboardItem) {
    bkMeldung("Dieser Browser kann nichts in die Zwischenablage legen. " +
      "Kopiert wurde nichts.", "warn");
    return;
  }
  bkLaeuft = true;
  bkLeisteZeichnen();
  try {
    const html = bkHtmlBauen(stelle);
    const text = stelle.map((b, i) => (i + 1) + ". " + (b.titel || "Wettschein")).join("\n");
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    })]);
    bkMeldung("<b>" + stelle.length + " Bilder kopiert</b>, jedes einzeln und in voller " +
      "Groesse. Einfuegen in Word, Mail oder einen Chat, der Bilder im Text kann. " +
      "Kommt dort nur Text an, nimm den Knopf <b>einzeln kopieren</b> - der geht ueberall.",
      "gut");
  } catch (e) {
    bkMeldung("<b>Nicht kopiert</b> (" + String(e && e.message ? e.message : e).slice(0, 120) +
      "). Nimm den Knopf <b>einzeln kopieren</b>, der geht immer.", "warn");
  } finally {
    bkLaeuft = false;
    bkLeisteZeichnen();
  }
}


// ---------- Die Leiste ----------
// Sie zeigt immer denselben Stand wie der Durchgang. Es gibt nur diese
// eine Stelle, die sie baut - so kann die Beschriftung nie etwas anderes
// behaupten als bkIndex und bkListe.
function bkLeisteZeichnen() {
  const box = document.getElementById("bilderleiste");
  if (!box) return;
  const zahl = bkBilderSammeln().length;
  let h = "";

  if (bkListe.length) {
    const fertig = bkIndex >= bkListe.length;
    h += '<span class="bk-stand">' +
      (fertig ? "Alle " + bkListe.length + " Bilder waren dran."
              : "Bild <b>" + (bkIndex + 1) + "</b> von <b>" + bkListe.length + "</b>") +
      "</span> " +
      (fertig
        ? '<button class="haupt" onclick="bkFertig()">Fertig</button>'
        : '<button class="haupt" id="bk_knopf" onclick="bkSchritt()"' +
          (bkLaeuft ? " disabled" : "") + ">" +
          (bkLaeuft ? "kopiere..." : (bkIndex === 0
            ? "📋 Erstes Bild kopieren"
            : "📋 Nächstes Bild kopieren")) + "</button>") +
      (bkIndex > 0 && !fertig
        ? ' <button onclick="bkZurueck()" title="nochmal dasselbe Bild">ein Bild zur&uuml;ck</button>' : "") +
      ' <button onclick="bkFertig()">abbrechen</button>';
  } else {
    h += '<button class="haupt" id="bk_knopf" onclick="bkEinzelnStart()"' +
      (bkLaeuft || !zahl ? " disabled" : "") + ' title="' +
      (zahl ? "Ein Klick je Bild, jedes in voller Groesse. Geht in jedem Programm."
            : "Im Kombi-Bau ist gerade kein Bild zu sehen.") + '">' +
      (zahl ? "📋 " + zahl + " Bilder einzeln kopieren"
            : "📋 Bilder kopieren (gerade keins)") + "</button>" +
      (zahl > 1
        ? ' <button onclick="bkAlleAufEinmal()"' + (bkLaeuft ? " disabled" : "") +
          ' title="Alle auf einmal, als einzelne Bilder. Braucht ein Ziel, das Bilder' +
          ' im Text kann - Word, Mail, viele Chats.">alle ' + zahl +
          " auf einmal</button>" +
          ' <span class="mini bk-hinweis">einzeln geht &uuml;berall; ' +
          "auf einmal braucht Word, Mail oder einen Chat mit Bildern im Text</span>"
        : "");
  }
  box.innerHTML = h;
}

// Frueher hiess die Funktion bkKnopfText. Sie heisst weiter so, damit
// nichts bricht, was sie ruft, und macht jetzt dasselbe wie die Leiste.
function bkKnopfText() { bkLeisteZeichnen(); }

// Die Zahl im Knopf frisch halten: der Kombi-Bau zeichnet staendig neu.
// WAEHREND eines Durchgangs wird NICHT neu gesammelt - sonst verschoebe
// sich mitten im Kopieren die Reihenfolge und er bekaeme ein Bild
// zweimal und eines gar nicht.
document.addEventListener("DOMContentLoaded", () => {
  bkLeisteZeichnen();
  const ziel = document.getElementById("scheine");
  if (ziel && window.MutationObserver) {
    let warte = null;
    new MutationObserver(() => {
      if (bkListe.length) return;
      clearTimeout(warte);
      warte = setTimeout(bkLeisteZeichnen, 250);
    }).observe(ziel, { childList: true, subtree: true });
  }
});

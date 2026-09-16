// ============================================================
// BILDER AUS DEM KOMBI-BAU KOPIEREN
// ============================================================
// Karam, zuerst am 16.09.2026: "Beim Kombi-Bau will ich oben einen
// Knopf: alle Bilder kopieren, alle die sichtbar sind."
// Und danach, genauer: "Wenn ich sage, sechsundzwanzig Bilder kopieren,
// dass sie EINZELN kopiert werden. Ohne dass ich etwas runterladen muss."
//
// ZWEI WEGE, und der erste ist der, den er wollte:
//   1. EINZELN: ein Klick, ein Bild in der Zwischenablage, einfuegen,
//      naechster Klick. Der Knopf sagt immer, wo er steht (7 von 26).
//      Es wird nichts heruntergeladen.
//   2. ALLE AUF EIN BLATT: die Scheine werden zu EINEM Bild
//      zusammengesetzt und das kommt in die Zwischenablage. Ein Klick,
//      ein Einfuegen, alles drauf.
//
// WARUM ES NICHT ANDERS GEHT.
// Die Zwischenablage haelt zu jedem Zeitpunkt GENAU EINEN Eintrag.
// Sechsundzwanzig Bilder gleichzeitig hineinzulegen gibt es in keinem
// Browser; jedes wuerde das vorige ueberschreiben. Dazu erlaubt ein
// Browser das Kopieren nur, solange ein Klick frisch ist, eine Schleife
// ueber zwanzig Bilder lehnt er nach dem ersten ab. Der Schrittweg ist
// deshalb nicht eine Notloesung, sondern die einzige ehrliche Form von
// "einzeln kopieren".
//
// KEIN STILLES SCHEITERN.
// Nie kommt eine gruene Meldung, ohne dass wirklich etwas kopiert wurde.
// Geht ein Schritt daneben, bleibt der Zaehler stehen, der Grund steht
// da, und es wird nichts uebersprungen.
//
// EIGENE DATEI, damit sie in einem Stueck wieder verschwinden kann.
// kombis.js wird nicht angefasst, nur kombis.html laedt diese Datei und
// hat einen leeren Behaelter dafuer.

"use strict";

// Hoechstbreite je Schein im fertigen Blatt. Groesser bringt nichts:
// die Fotos werden beim Aufnehmen ohnehin auf 1400 px gebracht, und ein
// Blatt aus zehn Scheinen in voller Groesse waere 14000 px hoch und in
// keinem Chatfenster mehr zu gebrauchen.
const BK_BREITE = 640;
const BK_LUFT = 18;          // Abstand zwischen den Scheinen
const BK_KOPF = 30;          // Hoehe der Beschriftung ueber jedem Schein
const BK_RAND = 20;

// Wo ueberall im Kombi-Bau Bilder stehen koennen. Kommt eine Stelle
// dazu, gehoert sie hierher und sonst nirgendwohin.
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

// Die Beschriftung ueber einem Bild: der Dateiname, den Karam vergeben
// hat, sonst die Scheinnummer, sonst gar nichts. Nichts erfinden.
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
      // Dasselbe Bild kann an zwei Stellen stehen (Karte und Verlauf).
      // Zweimal im Blatt waere nur Verwirrung.
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

// Wie viele Spalten? So viele, dass das Blatt nicht zu einem endlosen
// Streifen wird. Bei drei Scheinen ist eine Spalte richtig, bei zwanzig
// sind es drei.
function bkSpalten(anzahl) {
  if (anzahl <= 3) return 1;
  if (anzahl <= 8) return 2;
  return 3;
}

// Setzt die geladenen Bilder zu EINEM Blatt zusammen.
function bkBlattBauen(bilder) {
  const spalten = bkSpalten(bilder.length);
  // b ist {bild, titel}, das Bild selbst liegt in b.bild. Stand hier
  // einmal b.naturalHeight, wurde jede Hoehe NaN, das Blatt 680x0 gross
  // und toBlob gab null zurueck. Im Browser aufgefallen, nicht im Kopf.
  const hoehen = bilder.map(b =>
    Math.round(b.bild.naturalHeight * (BK_BREITE / b.bild.naturalWidth)));
  // Zeilenweise fuellen, die Zeilenhoehe ist die hoechste Karte darin.
  const zeilen = [];
  for (let i = 0; i < bilder.length; i += spalten) {
    const teil = hoehen.slice(i, i + spalten);
    zeilen.push(Math.max.apply(null, teil));
  }
  const breite = BK_RAND * 2 + spalten * BK_BREITE + (spalten - 1) * BK_LUFT;
  const hoehe = BK_RAND * 2 +
    zeilen.reduce((s, h) => s + h + BK_KOPF + BK_LUFT, 0) - BK_LUFT;

  const flaeche = document.createElement("canvas");
  flaeche.width = breite;
  flaeche.height = hoehe;
  const stift = flaeche.getContext("2d");
  stift.fillStyle = "#ffffff";
  stift.fillRect(0, 0, breite, hoehe);

  let y = BK_RAND;
  for (let z = 0; z * spalten < bilder.length; z++) {
    for (let s = 0; s < spalten; s++) {
      const i = z * spalten + s;
      if (i >= bilder.length) break;
      const x = BK_RAND + s * (BK_BREITE + BK_LUFT);
      const h = hoehen[i];
      const titel = bilder[i].titel;
      if (titel) {
        stift.fillStyle = "#1a2c50";
        stift.font = "bold 16px Arial, sans-serif";
        stift.textBaseline = "bottom";
        stift.fillText(titel, x, y + BK_KOPF - 8, BK_BREITE);
      }
      stift.drawImage(bilder[i].bild, x, y + BK_KOPF, BK_BREITE, h);
      // Ein duenner Rahmen, damit zwei helle Scheine nicht ineinander laufen.
      stift.strokeStyle = "#8c94a6";
      stift.lineWidth = 1;
      stift.strokeRect(x + 0.5, y + BK_KOPF + 0.5, BK_BREITE - 1, h - 1);
    }
    y += zeilen[z] + BK_KOPF + BK_LUFT;
  }
  return flaeche;
}

function bkBlob(flaeche) {
  return new Promise((fertig) => {
    // PNG, nicht JPEG: die Zwischenablage nimmt nur PNG entgegen.
    flaeche.toBlob((b) => fertig(b), "image/png");
  });
}

function bkMeldung(text, art) {
  if (typeof meldung === "function") { meldung(text, art); return; }
  if (art === "warn") alert(text.replace(/<[^>]+>/g, ""));
}

function bkHerunterladen(blob, name) {
  const adresse = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = adresse;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 4000);
}


// ============================================================
// EINZELN KOPIEREN - der Weg, den Karam wollte
// ============================================================
// Karam (16.09.2026): "Wenn ich sage, sechsundzwanzig Bilder kopieren,
// dass sie einzeln kopiert werden. Ich druecke rein und es kopieren
// sich sechsundzwanzig einzelne Bilder. Ohne dass ich etwas
// runterladen muss."
//
// WAS GEHT UND WAS NICHT, ehrlich:
// Die Zwischenablage des Rechners haelt zu jedem Zeitpunkt GENAU EINEN
// Eintrag. Sechsundzwanzig Bilder gleichzeitig hineinzulegen gibt es
// nicht, in keinem Browser: jedes wuerde das vorige sofort
// ueberschreiben, und am Ende haette er nur das letzte. Dazu kommt,
// dass ein Browser nur kopieren laesst, solange ein Klick "frisch" ist
// (transient user activation). Zwanzig Kopien in einer Schleife lehnt er
// nach der ersten ab.
//
// Deshalb der Schrittweg: EIN Klick, EIN Bild in der Zwischenablage,
// einfuegen, naechster Klick. Der Knopf sagt immer, bei welchem Bild er
// steht (7 von 26). Das ist genau "einzeln kopieren", nur ehrlich
// darueber, dass die Zwischenablage nicht mehr als eines fasst.
// Heruntergeladen wird dabei NICHTS.
//
// Wer lieber alles auf einmal einfuegt, nimmt den zweiten Knopf: dann
// werden alle Scheine zu EINEM Blatt zusammengesetzt (bkBlattBauen).

let bkLaeuft = false;
let bkListe = [];      // [{quelle, titel}] der Durchgang, der gerade laeuft
let bkIndex = 0;       // welches Bild als naechstes drankommt

// Ein einzelnes Bild in die Zwischenablage. JPEG muss dafuer ueber eine
// Zeichenflaeche zu PNG werden - die Zwischenablage nimmt nur PNG.
async function bkEinesKopieren(eintrag) {
  const b = await bkLaden(eintrag.quelle);
  if (!b || !b.naturalWidth) return { ok: false, grund: "das Bild liess sich nicht laden" };
  const f = document.createElement("canvas");
  f.width = b.naturalWidth;
  f.height = b.naturalHeight;
  f.getContext("2d").drawImage(b, 0, 0);
  const blob = await bkBlob(f);
  if (!blob) return { ok: false, grund: "das Bild liess sich nicht umwandeln" };
  if (!navigator.clipboard || !window.ClipboardItem) {
    return { ok: false, grund: "dieser Browser kann keine Bilder in die Zwischenablage legen" };
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true, blob: blob };
  } catch (e) {
    return { ok: false, grund: String(e && e.message ? e.message : e).slice(0, 120), blob: blob };
  }
}

// Startet den Durchgang neu und kopiert gleich das erste Bild.
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
        (eintrag.titel ? " (" + eintrag.titel + ")" : "") + ". Jetzt einfuegen" +
        (rest ? ", dann auf <b>N&auml;chstes Bild</b> dr&uuml;cken." : ". Das war das letzte."),
        "gut");
    } else {
      // NICHT weiterzaehlen und NICHT heimlich herunterladen. Karam hat
      // ausdruecklich gesagt: ohne dass er etwas runterladen muss.
      // Also stehen bleiben, den Grund nennen, und das Herunterladen
      // als eigenen Knopf anbieten.
      bkMeldung("<b>Bild " + nr + " konnte nicht kopiert werden</b> (" + r.grund +
        "). Es wurde nichts heruntergeladen und nichts uebersprungen - " +
        "du stehst weiter bei Bild " + nr + ".", "warn");
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

async function bkAlleKopieren() {
  if (bkLaeuft) return;
  const stelle = bkBilderSammeln();
  if (!stelle.length) {
    bkMeldung("Hier ist gerade <b>kein Bild</b> zu sehen. Fotos haengen an den Karten " +
      "unter &quot;In Arbeit&quot; - ist dort keins, gibt es auch nichts zu kopieren.", "warn");
    return;
  }
  bkLaeuft = true;
  bkLeisteZeichnen();
  try {
    const geladen = await Promise.all(stelle.map(x => bkLaden(x.quelle)));
    const gut = [], kaputt = [];
    geladen.forEach((b, i) => {
      if (b && b.naturalWidth > 0) gut.push({ bild: b, titel: stelle[i].titel });
      else kaputt.push(stelle[i].titel || "ohne Namen");
    });
    if (!gut.length) {
      bkMeldung("<b>Keines der " + stelle.length + " Bilder liess sich laden.</b> " +
        "Kopiert wurde nichts.", "warn");
      return;
    }
    const blatt = bkBlattBauen(gut);
    const blob = await bkBlob(blatt);
    if (!blob) {
      bkMeldung("Das Blatt liess sich nicht erzeugen. Kopiert wurde nichts.", "warn");
      return;
    }
    const nachsatz = kaputt.length
      ? " <b>" + kaputt.length + " von " + stelle.length + " Bildern liessen sich nicht laden</b> (" +
        kaputt.slice(0, 3).join(", ") + (kaputt.length > 3 ? ", ..." : "") +
        ") und fehlen auf dem Blatt."
      : "";

    let kopiert = false, grund = "";
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        kopiert = true;
      } catch (e) { grund = String(e && e.message ? e.message : e).slice(0, 120); }
    } else {
      grund = "dieser Browser kann keine Bilder in die Zwischenablage legen";
    }

    if (kopiert) {
      bkMeldung("<b>" + gut.length + " Bild" + (gut.length === 1 ? "" : "er") +
        " auf einem Blatt kopiert.</b> Jetzt irgendwo einfuegen." + nachsatz, "gut");
    } else {
      bkHerunterladen(blob, "Wettscheine_" + gut.length + ".png");
      bkMeldung("Die Zwischenablage hat es nicht angenommen (" + (grund || "kein Grund genannt") +
        "). Das Blatt mit <b>" + gut.length + " Bild" + (gut.length === 1 ? "" : "ern") +
        "</b> wurde deshalb <b>heruntergeladen</b>." + nachsatz, "warn");
    }
  } catch (e) {
    bkMeldung("Beim Zusammensetzen ist etwas schiefgegangen: " +
      String(e && e.message ? e.message : e).slice(0, 140) + ". Kopiert wurde nichts.", "warn");
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
    // Ein Durchgang laeuft.
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
      (zahl ? "Ein Klick je Bild. Die Zwischenablage fasst immer nur eines."
            : "Im Kombi-Bau ist gerade kein Bild zu sehen.") + '">' +
      (zahl ? "📋 " + zahl + " Bilder einzeln kopieren"
            : "📋 Bilder kopieren (gerade keins)") + "</button>" +
      (zahl > 1
        ? ' <button onclick="bkAlleKopieren()" title="Alle Scheine zu einem Blatt zusammensetzen">' +
          "alle auf <b>ein</b> Blatt</button>" : "");
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

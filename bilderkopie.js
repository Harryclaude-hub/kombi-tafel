// ============================================================
// ALLE BILDER AUS DEM KOMBI-BAU AUF EINMAL KOPIEREN
// ============================================================
// Karam (16.09.2026): "Beim Kombi-Bau will ich oben einen Knopf: alle
// Bilder kopieren. Er kopiert jedes Bild, das gerade im Kombi-Bau
// vorhanden ist, alle die sichtbar sind. Statt jedes einzeln zu
// kopieren, alle mit einem Klick."
//
// WARUM EIN BILD UND NICHT ZEHN.
// Die Zwischenablage haelt genau EINEN Eintrag. Zehn Bilder
// hineinzulegen geht nicht, auch nicht nacheinander: jedes wuerde das
// vorige ueberschreiben, und am Ende haette er nur das letzte. Deshalb
// werden die Scheine zu EINEM Blatt zusammengesetzt, untereinander und
// nebeneinander, jeder mit seiner Beschriftung. Ein Klick, ein
// Einfuegen, alles drauf.
//
// KEIN STILLES SCHEITERN.
// Drei Stellen koennen schiefgehen, und jede sagt es:
//   1. kein Bild gefunden        -> es steht da, wo er suchen soll
//   2. ein Bild laedt nicht      -> es wird gezaehlt und genannt
//   3. Zwischenablage verweigert -> das Blatt wird stattdessen
//      heruntergeladen, und es steht da, warum
// Nie kommt eine gruene Meldung, ohne dass wirklich etwas kopiert wurde.
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
const BK_ORTE = [
  "#scheine .s-foto img",      // das Foto an einer gebauten Karte
  "#verlauf img.minifoto",     // die Miniaturen im Verlauf
  "#gesetzteliste img",        // falls dort einmal Bilder stehen
  "#eigenbau img"
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

let bkLaeuft = false;

async function bkAlleKopieren() {
  if (bkLaeuft) return;
  const knopf = document.getElementById("bk_knopf");
  const stelle = bkBilderSammeln();
  if (!stelle.length) {
    bkMeldung("Hier ist gerade <b>kein Bild</b> zu sehen. Fotos haengen an den Karten " +
      "unter &quot;In Arbeit&quot; und im Verlauf - ist dort keins, gibt es auch nichts " +
      "zu kopieren.", "warn");
    return;
  }
  bkLaeuft = true;
  if (knopf) { knopf.disabled = true; knopf.textContent = "sammle " + stelle.length + " Bilder..."; }
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
        " kopiert</b>, alle auf einem Blatt. Jetzt irgendwo einfuegen." + nachsatz, "gut");
    } else {
      // NICHT so tun, als waere es kopiert. Stattdessen als Datei, und
      // dazu der Grund.
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
    if (knopf) { knopf.disabled = false; bkKnopfText(); }
  }
}

// Die Beschriftung sagt, wie viele Bilder gerade zu holen waeren. Steht
// dort 0, weiss er es, bevor er drueckt.
function bkKnopfText() {
  const knopf = document.getElementById("bk_knopf");
  if (!knopf) return;
  const n = bkBilderSammeln().length;
  knopf.textContent = n
    ? "📋 Alle " + n + " Bilder kopieren"
    : "📋 Alle Bilder kopieren (gerade keins)";
  knopf.title = n
    ? n + " Bilder werden zu einem Blatt zusammengesetzt und in die Zwischenablage gelegt."
    : "Im Kombi-Bau ist gerade kein Bild zu sehen.";
}

function bkLeisteZeichnen() {
  const box = document.getElementById("bilderleiste");
  if (!box) return;
  if (!box.querySelector("#bk_knopf")) {
    box.innerHTML = '<button id="bk_knopf" onclick="bkAlleKopieren()"></button>';
  }
  bkKnopfText();
}

// Die Zahl im Knopf frisch halten: der Kombi-Bau zeichnet staendig neu.
document.addEventListener("DOMContentLoaded", () => {
  bkLeisteZeichnen();
  const ziel = document.getElementById("scheine");
  if (ziel && window.MutationObserver) {
    let warte = null;
    new MutationObserver(() => {
      clearTimeout(warte);
      warte = setTimeout(bkKnopfText, 250);
    }).observe(ziel, { childList: true, subtree: true });
  }
});

// ============================================================
// SCHULE: erzeugt die visuellen Ergebnis-Tafeln.
// Reine Anzeige-Logik, keine Berechnung fuer die Kombi-Tafel.
// ============================================================
"use strict";

const EINSATZ = 10;
const TESTQUOTE = 2.00;

// Was passiert bei einem Ergebnis? Rueckgabe: Anteil des Einsatzes,
// der zurueckkommt, plus Kurzwort.
//   1    = voller Gewinn
//   0.5  = halber Gewinn (halbe Haelfte gewinnt, halbe zurueck)
//   0    = Einsatz zurueck
//   -0.5 = halber Verlust
//   -1   = alles weg
function bewerte(linie, tore_heim, tore_gast, seite) {
  // seite: "H" = wir haben auf Heim gesetzt, "A" = auf Auswaerts
  const diff = (seite === "H") ? (tore_heim - tore_gast) : (tore_gast - tore_heim);
  const l = parseFloat(linie);

  // Viertel-Linien werden in zwei Haelften zerlegt
  if (Math.abs(l * 4) % 2 === 1) {
    const a = l - 0.25, b = l + 0.25;
    const ra = bewerte(a.toFixed(2), tore_heim, tore_gast, seite).wert;
    const rb = bewerte(b.toFixed(2), tore_heim, tore_gast, seite).wert;
    return deute((ra + rb) / 2);
  }
  const ergebnis = diff + l;   // Handicap draufrechnen
  if (ergebnis > 0.01) return deute(1);
  if (ergebnis < -0.01) return deute(-1);
  return deute(0);             // genau null: Einsatz zurueck
}

function deute(w) {
  if (w >= 0.99) return { wert: 1, wort: "gewonnen", kl: "e-gew" };
  if (w >= 0.49) return { wert: 0.5, wort: "halb gewonnen", kl: "e-halbgew" };
  if (w >= -0.01 && w <= 0.01) return { wert: 0, wort: "Einsatz zurueck", kl: "e-zur" };
  if (w >= -0.51) return { wert: -0.5, wort: "halb verloren", kl: "e-halbver" };
  return { wert: -1, wort: "verloren", kl: "e-ver" };
}

// Was bekommst du bei 10 Euro Einsatz und Quote 2,00 zurueck?
function auszahlung(wert) {
  if (wert === 1) return (EINSATZ * TESTQUOTE).toFixed(2);
  if (wert === 0.5) return (EINSATZ / 2 * TESTQUOTE + EINSATZ / 2).toFixed(2);
  if (wert === 0) return EINSATZ.toFixed(2);
  if (wert === -0.5) return (EINSATZ / 2).toFixed(2);
  return "0.00";
}

// Ergebnisse, die wir bei jeder Linie durchspielen
const SPIELE = [
  { h: 3, g: 0, txt: "3:0" },
  { h: 2, g: 0, txt: "2:0" },
  { h: 1, g: 0, txt: "1:0" },
  { h: 1, g: 1, txt: "1:1" },
  { h: 0, g: 1, txt: "0:1" },
  { h: 0, g: 2, txt: "0:2" }
];

const LINIEN = [
  ["-1.75", "Sieg mit 2 Toren gibt halben Gewinn, ab 3 vollen"],
  ["-1.00", "Sieg mit genau 1 Tor gibt den Einsatz zurueck"],
  ["-0.75", "Sieg mit genau 1 Tor gibt halben Gewinn"],
  ["-0.50", "Muss einfach gewinnen. Das ist die normale Siegwette"],
  ["-0.25", "Muss gewinnen. Unentschieden kostet die Haelfte"],
  ["0.00", "Muss gewinnen. Unentschieden gibt alles zurueck (DNB)"],
  ["+0.25", "Unentschieden bringt schon halben Gewinn"],
  ["+0.50", "Sieg ODER Unentschieden reicht"],
  ["+0.75", "Sieg und Unentschieden gewinnen, knappe Niederlage kostet die Haelfte"],
  ["+1.00", "Niederlage mit genau 1 Tor gibt den Einsatz zurueck"]
];

function baueTafel() {
  const ziel = document.getElementById("tafel");
  let html = '<table class="ergebnistafel"><thead><tr><th>Handicap auf das Heimteam</th>';
  for (const s of SPIELE) html += "<th>" + s.txt + "</th>";
  html += "<th>Bedeutung im Klartext</th></tr></thead><tbody>";

  for (const [linie, klartext] of LINIEN) {
    const istNormal = (linie === "-0.50");
    html += '<tr' + (istNormal ? ' class="hervor"' : "") + '><td class="linie"><b>' +
      linie.replace(".", ",").replace("+0,00", "0") + "</b>" +
      (istNormal ? '<div class="mini">= normale Siegwette</div>' : "") + "</td>";
    for (const s of SPIELE) {
      const r = bewerte(linie, s.h, s.g, "H");
      html += '<td class="' + r.kl + '">' + r.wort +
        '<div class="mini">' + auszahlung(r.wert) + " &euro;</div></td>";
    }
    html += '<td class="klartext">' + klartext + "</td></tr>";
  }
  html += "</tbody></table>";
  ziel.innerHTML = html;
}

// Zerlegung einer Viertel-Linie zeigen
function baueTeilung() {
  const ziel = document.getElementById("teilung");
  const faelle = [
    ["-0.25", "0", "-0.5"],
    ["+0.25", "0", "+0.5"],
    ["-0.75", "-0.5", "-1"],
    ["+0.75", "+0.5", "+1"],
    ["-1.75", "-1.5", "-2"]
  ];
  let html = '<table><thead><tr><th>Wenn da steht</th><th>dann liegen</th>' +
    '<th>und</th><th>auf</th></tr></thead><tbody>';
  for (const [l, a, b] of faelle) {
    html += "<tr><td><b>" + l.replace(".", ",") + "</b></td>" +
      '<td class="haelfte">5 &euro;</td><td class="haelfte">5 &euro;</td>' +
      "<td>Handicap <b>" + a.replace(".", ",") + "</b> und Handicap <b>" +
      b.replace(".", ",") + "</b></td></tr>";
  }
  html += "</tbody></table>";
  ziel.innerHTML = html;
}

// Ueber/Unter-Tafel
const TORLINIEN = [
  ["1.50", "Ab 2 Toren gewonnen"],
  ["2.00", "Ab 3 gewonnen, bei genau 2 Geld zurueck"],
  ["2.25", "Bei genau 2 Toren halber Verlust"],
  ["2.50", "Ab 3 Toren gewonnen, sonst nichts"],
  ["2.75", "Bei genau 3 Toren halber Gewinn"],
  ["3.00", "Ab 4 gewonnen, bei genau 3 Geld zurueck"],
  ["3.50", "Ab 4 Toren gewonnen"]
];

function bewerteTore(linie, tore) {
  const l = parseFloat(linie);
  if (Math.abs(l * 4) % 2 === 1) {
    const ra = bewerteTore((l - 0.25).toFixed(2), tore).wert;
    const rb = bewerteTore((l + 0.25).toFixed(2), tore).wert;
    return deute((ra + rb) / 2);
  }
  if (tore > l + 0.01) return deute(1);
  if (tore < l - 0.01) return deute(-1);
  return deute(0);
}

function baueToreTafel() {
  const ziel = document.getElementById("toretafel");
  const anzahl = [0, 1, 2, 3, 4, 5];
  let html = '<table class="ergebnistafel"><thead><tr><th>OVER (Ueber) Linie</th>';
  for (const t of anzahl) html += "<th>" + t + " Tore</th>";
  html += "<th>Bedeutung</th></tr></thead><tbody>";
  for (const [l, txt] of TORLINIEN) {
    html += '<tr' + (l === "2.50" ? ' class="hervor"' : "") + '><td class="linie"><b>OVER ' +
      l.replace(".", ",") + "</b></td>";
    for (const t of anzahl) {
      const r = bewerteTore(l, t);
      html += '<td class="' + r.kl + '">' + r.wort + '<div class="mini">' +
        auszahlung(r.wert) + " &euro;</div></td>";
    }
    html += '<td class="klartext">' + txt + "</td></tr>";
  }
  html += "</tbody></table>";
  ziel.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
  baueTafel();
  baueTeilung();
  baueToreTafel();
});

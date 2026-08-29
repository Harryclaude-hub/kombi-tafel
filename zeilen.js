// ============================================================
// ZEILEN-SCHICHT: reine Optik, jederzeit loeschbar.
//
// Sie faerbt jede zweite Zeile der grossen Tabellen ein und kann die
// Zeilen durchnummerieren. Sonst tut sie NICHTS: keine Rechnung, keine
// Abfrage, keine Reihenfolge, kein Takt.
//
// LOESCHPROBE: Datei loeschen und die Zeile <script src="zeilen.js">
// aus den drei Seiten nehmen. Danach sehen die Tabellen aus wie vorher,
// alles rechnet und laedt unveraendert weiter.
//
// Sie setzt nur zwei Merkmale am <html>-Element:
//   data-zeilen    aus | blau | rot | gelb | lila
//   data-zeilennr  ja | nein
// Alles Weitere macht stil.css. Farben stehen KEINE in dieser Datei.
// ============================================================
"use strict";

const ZEILEN_FARBEN = [
  ["aus", "Aus"],
  ["blau", "Blau"],
  ["rot", "Rot"],
  ["gelb", "Gelb"],
  ["lila", "Lila"]
];

// Nur dort, wo Karam es wollte: Kombi-Tafel, Kombi-Bau, Original-Tabelle.
const ZEILEN_SEITEN = ["tafel", "bau", "original"];

function zeilenWahlLesen() {
  let f = "aus", n = "nein";
  try {
    f = localStorage.getItem("kt_zeilenfarbe") || "aus";
    n = localStorage.getItem("kt_zeilennummern") || "nein";
  } catch (e) { }
  if (!ZEILEN_FARBEN.some(x => x[0] === f)) f = "aus";
  return { farbe: f, nummern: n === "ja" };
}

function zeilenAnwenden() {
  const w = zeilenWahlLesen();
  const h = document.documentElement;
  h.setAttribute("data-zeilen", w.farbe);
  h.setAttribute("data-zeilennr", w.nummern ? "ja" : "nein");
  return w;
}

function zeilenFarbeSetzen(farbe) {
  try { localStorage.setItem("kt_zeilenfarbe", farbe); } catch (e) { }
  zeilenAnwenden();
  zeilenSchalterZeichnen();
}

function zeilenNummernSetzen(an) {
  try { localStorage.setItem("kt_zeilennummern", an ? "ja" : "nein"); } catch (e) { }
  zeilenAnwenden();
  zeilenSchalterZeichnen();
}

function zeilenSchalterZeichnen() {
  const kasten = document.getElementById("zeilenschalter");
  if (!kasten) return;
  const w = zeilenWahlLesen();
  kasten.innerHTML = "";

  const titel = document.createElement("span");
  titel.className = "zl-titel";
  titel.textContent = "Zeilen:";
  kasten.appendChild(titel);

  for (const [wert, name] of ZEILEN_FARBEN) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zl-knopf zl-" + wert + (w.farbe === wert ? " aktiv" : "");
    b.textContent = name;
    b.title = wert === "aus"
      ? "Keine Einfaerbung"
      : "Jede zweite Zeile leicht " + name.toLowerCase() + " hinterlegen";
    b.onclick = () => zeilenFarbeSetzen(wert);
    kasten.appendChild(b);
  }

  const label = document.createElement("label");
  label.className = "zl-nummern";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = w.nummern;
  box.onchange = () => zeilenNummernSetzen(box.checked);
  label.appendChild(box);
  label.appendChild(document.createTextNode(" nummerieren"));
  label.title = "Stellt vor jede Zeile eine laufende Nummer - nur zum Mitzaehlen, " +
    "sie hat nichts mit der Schein-Nummer zu tun.";
  kasten.appendChild(label);
}

// Den Kasten selbst anlegen, damit in den Seiten nichts stehen muss,
// was beim Loeschen dieser Datei uebrigbliebe.
function zeilenSchalterAnlegen() {
  if (document.getElementById("zeilenschalter")) return true;
  const nav = document.querySelector(".navleiste");
  if (!nav || !nav.parentNode) return false;
  const d = document.createElement("div");
  d.id = "zeilenschalter";
  d.className = "zeilenschalter";
  nav.parentNode.insertBefore(d, nav.nextSibling);
  return true;
}

function zeilenStart() {
  // Die Farbe IMMER anwenden, auch auf Seiten ohne Schalter - sonst
  // springt die Ansicht beim Blaettern hin und her.
  zeilenAnwenden();
  const seite = document.body && document.body.dataset ? document.body.dataset.seite : "";
  if (ZEILEN_SEITEN.indexOf(seite) < 0) return;
  if (zeilenSchalterAnlegen()) zeilenSchalterZeichnen();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", zeilenStart);
else zeilenStart();

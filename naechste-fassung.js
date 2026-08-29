// ============================================================
// DIE NAECHSTE FASSUNGSNUMMER - nie wieder geraten.
//
// WARUM ES DAS GIBT
// Am 29.08.2026 wurde v=20260829b zum zweiten Mal vergeben. Folge:
// jeder Browser, der vorher schon einmal da war, behielt seine alten
// Dateien. Die Seite sah frisch aus (neues HTML), fuehrte aber alten
// Code aus - und die Fehlersuche ging in die falsche Richtung.
//
// Deshalb wird die Nummer jetzt NICHT gewaehlt, sondern aus dem
// Verlauf abgeleitet: sie schaut nach, welche Nummern schon einmal
// hochgeladen wurden, und nimmt die naechste freie.
//
// Aufruf:
//   node naechste-fassung.js          zeigt sie nur an
//   node naechste-fassung.js --setzen schreibt sie in alle HTML-Dateien
// ============================================================
"use strict";
const fs = require("fs");
const { execSync } = require("child_process");

// ORTSZEIT, nicht UTC: um 00:50 in Oesterreich ist es in UTC noch der
// Vortag - toISOString haette hier den falschen Tag geliefert.
const _d = new Date();
const heute = _d.getFullYear() + String(_d.getMonth() + 1).padStart(2, "0") +
  String(_d.getDate()).padStart(2, "0");
const buchstaben = "abcdefghijklmnopqrstuvwxyz";

// Alle jemals festgeschriebenen Nummern einsammeln (nicht nur die letzte:
// ein Zurueckspringen im Verlauf koennte sonst eine alte wieder vergeben).
const vergeben = new Set();
try {
  const commits = execSync("git log --format=%h", { encoding: "utf8" }).trim().split("\n");
  for (const c of commits) {
    let t = "";
    // Aeltere Commits haben mein.html noch gar nicht - das ist kein Fehler,
    // deshalb wird die Meldung von git geschluckt (stdio pipe).
    try { t = execSync("git show " + c + ":mein.html",
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { continue; }
    for (const m of t.matchAll(/v=(\d{8}[a-z]*)/g)) vergeben.add(m[1]);
  }
} catch (e) {
  console.error("Kein Git-Verlauf lesbar - dann bitte von Hand pruefen.");
  process.exit(1);
}
// Auch das, was gerade im Ordner liegt, gilt als vergeben.
for (const f of fs.readdirSync(".").filter(x => x.endsWith(".html"))) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/v=(\d{8}[a-z]*)/g)) vergeben.add(m[1]);
}

// Die Nummer darf NIE zurueckspringen. Am 29.08. waere sonst nach dem
// hochgeladenen g wieder ein f gekommen, weil f zwar lokal gesetzt, aber
// nie festgeschrieben worden war. Unschaedlich, aber verwirrend - und beim
// naechsten Mal koennte daraus echtes Durcheinander werden.
let hoechste = "";
const heutige = [];
for (const v of vergeben) if (v.slice(0, 8) === heute) heutige.push(v);
// wird weiter unten mit spaeter() verglichen, deshalb erst sammeln
// Nach z geht es mit aa, ab, ac weiter. An einem langen Arbeitstag sind
// 26 Nummern schnell aufgebraucht - dann darf der Helfer nicht einfach
// aufgeben, sonst muss man doch wieder von Hand raten.
// Wichtig: "aa" ist als Text KLEINER als "z". Deshalb wird nicht mit >
// verglichen, sondern nach Laenge und dann nach Text.
function spaeter(a, b) {
  const sa = a.slice(8), sb = b.slice(8);
  if (sa.length !== sb.length) return sa.length > sb.length;
  return sa > sb;
}
for (const v of heutige) if (!hoechste || spaeter(v, hoechste)) hoechste = v;
const kandidaten = [];
for (const b of buchstaben) kandidaten.push(heute + b);
for (const b1 of buchstaben) for (const b2 of buchstaben) kandidaten.push(heute + b1 + b2);
let neu = null;
for (const k of kandidaten) {
  if (!vergeben.has(k) && (!hoechste || spaeter(k, hoechste))) { neu = k; break; }
}
if (!neu) { console.error("Heute sind alle Nummern vergeben (bis zz)."); process.exit(1); }

if (process.argv.indexOf("--setzen") < 0) {
  console.log("naechste freie Fassung: " + neu);
  console.log("(vergeben waren " + vergeben.size + " Nummern, zuletzt " +
    Array.from(vergeben).sort().slice(-3).join(", ") + ")");
  process.exit(0);
}

let n = 0;
for (const f of fs.readdirSync(".").filter(x => x.endsWith(".html"))) {
  const t = fs.readFileSync(f, "utf8");
  // Auch die Logo-Bilder: iOS merkt sich das Symbol nach der Adresse.
  // Ohne Fassungsnummer behaelt ein Geraet, das schon einmal da war,
  // fuer immer das alte Bild - und beim Beheben des leeren Symbols
  // haette niemand gemerkt, dass die Behebung gar nicht ankommt.
  const v = t.replace(/(\.(?:js|css|webmanifest|png))\?v=[0-9a-z]+/g, "$1?v=" + neu);
  if (v !== t) { fs.writeFileSync(f, v); n++; }
}
// Das Manifest zaehlt seine Bilder selbst auf - die muessen mit,
// sonst behaelt ein Android-Geraet ewig das alte Symbol.
try {
  const m = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
  let geaendert = false;
  m.icons = (m.icons || []).map(i => {
    const s = String(i.src).replace(/\?v=[0-9a-z]+/, "?v=" + neu);
    if (s !== i.src) geaendert = true;
    return { ...i, src: s };
  });
  if (geaendert) {
    fs.writeFileSync("manifest.webmanifest", JSON.stringify(m, null, 2) + "\n");
    console.log("  ok  manifest.webmanifest: Bilder auf " + neu);
  }
} catch (e) { console.error("  !!  manifest.webmanifest nicht angepasst: " + e.message); }

console.log("  ok  " + n + " Seiten auf " + neu);

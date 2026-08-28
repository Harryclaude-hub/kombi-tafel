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

let neu = null;
for (const b of buchstaben) { if (!vergeben.has(heute + b)) { neu = heute + b; break; } }
if (!neu) { console.error("Alle 26 Nummern von heute sind vergeben."); process.exit(1); }

if (process.argv.indexOf("--setzen") < 0) {
  console.log("naechste freie Fassung: " + neu);
  console.log("(vergeben waren " + vergeben.size + " Nummern, zuletzt " +
    Array.from(vergeben).sort().slice(-3).join(", ") + ")");
  process.exit(0);
}

let n = 0;
for (const f of fs.readdirSync(".").filter(x => x.endsWith(".html"))) {
  const t = fs.readFileSync(f, "utf8");
  const v = t.replace(/(\.(?:js|css|webmanifest))\?v=[0-9a-z]+/g, "$1?v=" + neu);
  if (v !== t) { fs.writeFileSync(f, v); n++; }
}
console.log("  ok  " + n + " Seiten auf " + neu);

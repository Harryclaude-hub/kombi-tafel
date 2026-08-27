// ============================================================
// SATZDATEN: laedt die vom Programm selbst eingelesenen
// Foto-Saetze (kt_saetze + kt_wetten) aus der Datenbank und
// haengt sie an die eingebauten SAETZE/WETTEN aus daten.js an.
// Danach werden Ordner-Leiste, Tafel, Kombi-Bau und
// Original-Tabelle neu gezeichnet.
//
// Der alte Satz vom 24.08. bleibt fest in daten.js - nichts
// Bestehendes aendert sich. Neue Saetze brauchen kein Warten
// auf Claude mehr: Admin liest sie auf admin.html selbst ein.
// ============================================================
"use strict";

async function satzdatenLaden() {
  try {
    if (!window.supa || typeof WETTEN === "undefined" || typeof SAETZE === "undefined") return;
    const saetze = await supaSaetzeLaden();
    if (!saetze.length) return;
    const wetten = await supaWettenLaden();

    for (const s of saetze) {
      if (!SAETZE.some(x => x.id === s.id)) SAETZE.push({ id: s.id, titel: s.titel });
    }
    // Bei erneutem Laden: alte Datenbank-Wetten austauschen
    for (let i = WETTEN.length - 1; i >= 0; i--) if (WETTEN[i].dbid) WETTEN.splice(i, 1);
    for (const w of wetten) {
      WETTEN.push({
        id: "d" + w.id, dbid: w.id, satz: w.satz, von: w.von || "", an: w.an_zeit,
        liga: w.liga || "", spiel: w.spiel, wette: w.wette,
        kat: w.kat || w.s, s: w.s || "SIEG", o: Array.isArray(w.o) ? w.o : []
      });
    }
    // Aufsteigend sortieren: aktiverSatzId nimmt den LETZTEN Eintrag als
    // neuesten Satz - so ist der frisch eingelesene Ordner der offene.
    SAETZE.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    satzdatenNeuZeichnen();
  } catch (e) { /* Satzdaten stoeren nie die Seite */ }
}

function satzdatenNeuZeichnen() {
  if (typeof zeichneOrdnerLeiste === "function") zeichneOrdnerLeiste();
  if (typeof zeichne === "function" && document.getElementById("koerper")) zeichne();
  if (typeof zeichne_ === "function") zeichne_();
  if (typeof zeichneOriginal === "function" && document.getElementById("rohkoerper")) zeichneOriginal();
}

document.addEventListener("DOMContentLoaded", satzdatenLaden);

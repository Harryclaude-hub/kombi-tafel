// ============================================================
// ORIGINAL-ANSICHT: die vier Fotos 1:1 als eine Tabelle,
// gleiche Spalten wie Saschas Excel. Nichts wird gerechnet.
// Braucht daten.js (WETTEN) und roh.js (ROH, ROH_EXTRA).
// ============================================================
"use strict";

function rohZeitText(an) {
  // Anstoss im Foto-Format dd/mm/jjjj hh:mm; "?" = nur Datum bekannt.
  // Hier BEWUSST ohne Zeitversatz: die Original-Ansicht zeigt die Foto-Werte.
  const unklar = an.endsWith("?");
  const t = new Date(unklar ? an.slice(0, -1) : an);
  const dd = String(t.getDate()).padStart(2, "0");
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const basis = dd + "/" + mm + "/" + t.getFullYear();
  if (unklar) return basis;
  return basis + " " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
}

function rohZeile(eintrag) {
  const tr = document.createElement("tr");
  if (eintrag.storniert) tr.className = "storniert";

  const zellen = [
    '<span class="von ' + eintrag.von + '">' + eintrag.von + "</span>",
    eintrag.anText, eintrag.meld, eintrag.liga, eintrag.spiel, eintrag.wette,
    eintrag.qg, eintrag.qh || "-", "-", "-"
  ];
  zellen.forEach((inhalt, i) => {
    const td = document.createElement("td");
    td.innerHTML = inhalt;
    if (i >= 6) td.className = "q";
    tr.appendChild(td);
  });
  if (eintrag.hinweis) tr.title = eintrag.hinweis;
  return tr;
}

function zeichneOriginal() {
  const koerper = document.getElementById("rohkoerper");
  koerper.innerHTML = "";

  // Nur der offene Ordner; die Gruppen ("Bilder") ergeben sich aus den id-Praefixen
  const basis = (typeof satzWetten === "function") ? satzWetten() : WETTEN;
  // Extra-Zeilen (Storno, Ueberlappung) gehoeren nur zum Foto-Satz vom 24.08.
  const extraZeigen = (typeof aktiverSatzId !== "function" || aktiverSatzId() === "2026-08-24");
  const gruppen = [];
  for (const w of basis) {
    const g = w.id.split(".")[0];
    if (!gruppen.includes(g)) gruppen.push(g);
  }
  for (const bild of gruppen) {
    const kopf = document.createElement("tr");
    kopf.className = "bildtrenner";
    kopf.innerHTML = '<td colspan="10">Bild ' + bild + "</td>";
    koerper.appendChild(kopf);

    // Ueberlappungszeile am Anfang von Bild 4 zuerst (wie im Foto)
    if (String(bild) === "4" && (typeof aktiverSatzId !== "function" || aktiverSatzId() === "2026-08-24")) {
      const u = ROH_EXTRA.find(e => e.ueberlappung);
      if (u) koerper.appendChild(rohZeile({
        von: u.von, anText: u.an, meld: u.meld, liga: u.liga, spiel: u.spiel,
        wette: u.wette, qg: u.qg, qh: u.qh, hinweis: u.hinweis
      }));
    }

    const zeilen = basis.filter(w => w.id.split(".")[0] === String(bild));
    for (const w of zeilen) {
      const r = ROH[w.id] || ["?", "?", "?"];
      koerper.appendChild(rohZeile({
        von: w.von, anText: rohZeitText(w.an), meld: r[0], liga: w.liga,
        spiel: w.spiel, wette: w.wette, qg: r[1], qh: r[2]
      }));
      // stornierte Foto-Zeile an ihrer Original-Position einschieben
      const extra = extraZeigen ? ROH_EXTRA.find(e => e.storniert && e.nach === w.id) : null;
      if (extra) koerper.appendChild(rohZeile({
        von: extra.von, anText: extra.an, meld: extra.meld, liga: extra.liga,
        spiel: extra.spiel, wette: extra.wette, qg: extra.qg, qh: extra.qh,
        storniert: true, hinweis: extra.hinweis
      }));
    }
  }

  document.getElementById("rohzaehler").textContent = !extraZeigen
    ? (basis.length + " Wetten in diesem Ordner.")
    :
    WETTEN.length + " Wetten aus 4 Fotos, dazu 1 stornierte Zeile (durchgestrichen) und " +
    "1 Foto-Ueberlappung (nur zur Vollstaendigkeit, zaehlt nicht doppelt).";
}

document.addEventListener("DOMContentLoaded", zeichneOriginal);

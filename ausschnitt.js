// ============================================================
// AUSSCHNITT: Bildschirm-Ausschnitt direkt im Programm.
//
// Karams Wunsch: kein Snipping Tool, keine Datei auf dem Laptop.
// Der Bildschirm wird im Browser aufgenommen, du ziehst ein
// Rechteck um den Wettschein, und das Bild landet SOFORT beim
// richtigen Schein - mit fertigem Namen aus Teams, Einsatz,
// Einzelquoten (nach Gebuehr), Gesamtquote und Datum.
//
// Auf die Festplatte wird dabei nichts geschrieben: das Bild
// geht vom Bildschirm direkt in den Speicher des Programms.
// ============================================================
"use strict";

// Am Handy gibt es die Bildschirmaufnahme im Browser nicht.
function ausschnittGehtHier() {
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function");
}

async function ausschnittStarten(scheinId) {
  if (!ausschnittGehtHier()) {
    meldung("Dieses Gerät kann den Bildschirm nicht im Programm aufnehmen (am Handy geht das nie). " +
      "Mach dort einen normalen Screenshot und nimm den Knopf <b>Foto vom Wettschein</b>.", "warn");
    return;
  }
  let strom = null;
  try {
    strom = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
  } catch (e) {
    meldung("Es wurde kein Bildschirm ausgewählt - es ist nichts aufgenommen worden.", "warn");
    return;
  }
  let bild = null;
  try {
    bild = await ausschnittBildHolen(strom);
  } catch (e) {
    bild = null;
  } finally {
    // Die Aufnahme wird sofort wieder beendet: ein einziges Standbild reicht.
    strom.getTracks().forEach(t => t.stop());
  }
  if (!bild) { meldung("Der Bildschirm kam leer an. Bitte noch einmal versuchen.", "warn"); return; }
  ausschnittBuehne(bild, scheinId);
}

// Ein einziges Standbild aus dem laufenden Bildschirm-Strom holen
async function ausschnittBildHolen(strom) {
  const v = document.createElement("video");
  v.srcObject = strom;
  v.muted = true;
  v.playsInline = true;
  await v.play();
  // Ohne kurze Pause ist das erste Bild oft noch schwarz.
  await new Promise(r => setTimeout(r, 350));
  if (!v.videoWidth || !v.videoHeight) return null;
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  v.pause();
  v.srcObject = null;
  return c;
}

function ausschnittSchliessen() {
  const alt = document.querySelector(".ausschnittbuehne");
  if (alt) alt.remove();
  document.removeEventListener("keydown", ausschnittTaste);
}

function ausschnittTaste(ev) {
  if (ev.key === "Escape") ausschnittSchliessen();
}

// Die Auswahl-Bühne: Standbild anzeigen, Rechteck ziehen lassen
function ausschnittBuehne(voll, scheinId) {
  ausschnittSchliessen();
  const buehne = document.createElement("div");
  buehne.className = "ausschnittbuehne";
  buehne.innerHTML =
    '<div class="ausschnittkopf">' +
      "<b>&#9986; Ausschnitt wählen</b> " +
      '<span class="mini">Zieh mit der Maus ein Rechteck um den Wettschein. Nichts davon wird ' +
      "auf deinem Laptop gespeichert.</span>" +
      '<span class="ausschnittknoepfe">' +
        '<button id="asch_ok" class="haupt" disabled>&#10004; Übernehmen</button>' +
        '<button id="asch_ganz">Ganzes Bild</button>' +
        '<button id="asch_ab">Abbrechen</button>' +
      "</span></div>" +
    '<div class="ausschnittflaeche" id="asch_flaeche">' +
      '<img id="asch_bild" alt="Bildschirm-Aufnahme" draggable="false">' +
      '<div class="ausschnittrahmen" id="asch_rahmen" style="display:none"></div>' +
      '<div class="ausschnittmass" id="asch_mass" style="display:none"></div>' +
    "</div>";
  document.body.appendChild(buehne);

  const bild = document.getElementById("asch_bild");
  bild.src = voll.toDataURL("image/png");

  const flaeche = document.getElementById("asch_flaeche");
  const rahmen = document.getElementById("asch_rahmen");
  const mass = document.getElementById("asch_mass");
  const knopfOk = document.getElementById("asch_ok");
  let start = null;
  let wahl = null;

  function punkt(ev) {
    const r = bild.getBoundingClientRect();
    return {
      x: Math.min(Math.max(ev.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(ev.clientY - r.top, 0), r.height)
    };
  }

  function zeichneRahmen() {
    const r = bild.getBoundingClientRect();
    const f = flaeche.getBoundingClientRect();
    rahmen.style.display = "block";
    rahmen.style.left = (r.left - f.left + wahl.x) + "px";
    rahmen.style.top = (r.top - f.top + wahl.y) + "px";
    rahmen.style.width = wahl.b + "px";
    rahmen.style.height = wahl.h + "px";
    const skala = voll.width / (bild.clientWidth || 1);
    mass.style.display = "block";
    mass.style.left = (r.left - f.left + wahl.x) + "px";
    mass.style.top = (r.top - f.top + wahl.y + wahl.h + 4) + "px";
    mass.textContent = Math.round(wahl.b * skala) + " x " + Math.round(wahl.h * skala) + " Punkte";
    knopfOk.disabled = (wahl.b < 12 || wahl.h < 12);
  }

  bild.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    start = punkt(ev);
    wahl = null;
    knopfOk.disabled = true;
    try { bild.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
  });
  bild.addEventListener("pointermove", ev => {
    if (!start) return;
    const p = punkt(ev);
    wahl = {
      x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
      b: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y)
    };
    zeichneRahmen();
  });
  bild.addEventListener("pointerup", () => { start = null; });
  bild.addEventListener("pointercancel", () => { start = null; });

  knopfOk.onclick = () => {
    if (!wahl) return;
    const f = voll.width / (bild.clientWidth || 1);
    ausschnittFertig(voll, wahl.x * f, wahl.y * f, wahl.b * f, wahl.h * f, scheinId);
  };
  document.getElementById("asch_ganz").onclick = () =>
    ausschnittFertig(voll, 0, 0, voll.width, voll.height, scheinId);
  document.getElementById("asch_ab").onclick = ausschnittSchliessen;
  document.addEventListener("keydown", ausschnittTaste);
}

// Zuschneiden und dem Schein zuordnen
function ausschnittFertig(voll, x, y, b, h, scheinId) {
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  b = Math.max(1, Math.min(Math.round(b), voll.width - x));
  h = Math.max(1, Math.min(Math.round(h), voll.height - y));
  // Beim Wettschein zaehlt die Lesbarkeit der Zahlen, darum grosszuegiger
  // als beim Handy-Foto: bis 1000 Punkte Breite bleibt es scharf.
  const maxB = 1000;
  const f = Math.min(1, maxB / b);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(b * f));
  c.height = Math.max(1, Math.round(h * f));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(voll, x, y, b, h, 0, 0, c.width, c.height);
  ausschnittSchliessen();
  fotoAusCanvas(c, scheinId, "Bildschirm-Ausschnitt");
}

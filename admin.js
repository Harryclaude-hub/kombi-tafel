// ============================================================
// ADMIN: die eigene Admin-Seite (admin.html).
// Zwei Blöcke: Foto-Sätze der Homebase hochladen und alle
// User verwalten. Die Datenbank prüft jede Aktion selbst
// (RLS + Admin-RPCs) - die Seite ist nur die Oberflaeche.
// ============================================================
"use strict";

function elA(id) { return document.getElementById(id); }

function meldungA(text, art) {
  const box = elA("meldung");
  if (!box) return;
  box.innerHTML = '<div class="' + (art === "gut" ? "kern" : "warnkern") + '">' + text + "</div>";
  box.scrollIntoView({ block: "nearest" });
}

function sicherA(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function zeitA(iso) {
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    "." + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

let adminIch = null;

async function startAdmin() {
  const ziel = elA("admininhalt");
  if (!window.supa) {
    ziel.innerHTML = '<div class="warnkern">Die Datenbank-Bibliothek konnte nicht laden. Bitte Seite neu laden.</div>';
    return;
  }
  const u = await supaNutzer();
  if (!u) {
    ziel.innerHTML = '<div class="kern">Du bist nicht angemeldet. ' +
      '<a href="mein.html"><b>Zuerst in Mein Bereich anmelden</b></a>, dann hierher zurueck.</div>';
    return;
  }
  const admin = await supaIstAdmin();
  if (!admin) {
    ziel.innerHTML = '<div class="warnkern"><b>Nur für Admins.</b> Dein Konto hat keine Admin-Rolle - ' +
      "hier gibt es für dich nichts zu sehen.</div>";
    return;
  }
  adminIch = u;
  ziel.innerHTML = `
<h2>Foto-Sätze der Homebase hochladen</h2>
<p class="mini">Jede Foto-Lieferung ist ein eigener Ordner mit Datum, für ALLE Nutzer gleich
(die Homebase). Du laedst die Fotos hier hoch, Claude liest sie beim nächsten Auftrag ein und
legt daraus den neuen Satz in der Kombi-Tafel an. <b>Sätze mischen sich nie.</b>
Jeder Admin sieht hier auch die Uploads der anderen Admins.</p>
<div id="adm_fotos"></div>
<h2>Alle User</h2>
<p class="mini">Löschen entfernt ein Konto RESTLOS - samt allem, was der User angelegt hat,
auch in geteilten Bereichen. Der Knopf will zur Sicherheit zweimal gedrückt werden.
Admins ernennst du mit "zum Admin machen" - auch das fragt zweimal.</p>
<div id="adm_user"></div>`;
  await adminFotoSaetze();
  await adminUserliste();
}

// ---------- Foto-Sätze ----------

async function adminFotoSaetze() {
  const box = elA("adm_fotos");
  if (!box) return;
  const uploads = await supaSatzUploadsLaden();
  const gruppen = {};
  for (const u of uploads) {
    gruppen[u.satz_datum] = gruppen[u.satz_datum] || { n: 0, wartet: 0 };
    gruppen[u.satz_datum].n++;
    if (u.status === "wartet") gruppen[u.satz_datum].wartet++;
  }
  let liste = "";
  for (const datum of Object.keys(gruppen)) {
    const g = gruppen[datum];
    liste += "<li><b>Satz vom " + sicherA(datum) + "</b>: " + g.n + " Foto(s), " +
      (g.wartet ? '<span class="rot">' + g.wartet + " warten auf Einlesen durch Claude</span>"
                : '<span class="gruen">eingelesen</span>') + "</li>";
  }
  const d = new Date();
  const heute = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
  box.innerHTML =
    '<label>Datum des Satzes: <input type="date" id="satz_datum" value="' + heute + '"></label> ' +
    '<label class="fotoknopf">Fotos hochladen' +
    '<input type="file" accept="image/*" multiple style="display:none" ' +
    'onchange="tuSatzFotos(this)"></label>' +
    (liste ? "<ul>" + liste + "</ul>" : '<p class="mini">Noch keine Foto-Sätze hochgeladen.</p>');
}

async function tuSatzFotos(input) {
  const datum = elA("satz_datum").value;
  if (!datum) { meldungA("Bitte zuerst das Datum des Satzes wählen.", "warn"); return; }
  const dateien = Array.from(input.files || []);
  input.value = "";
  if (!dateien.length) return;
  let ok = 0;
  for (const datei of dateien) {
    const dataUrl = await verkleinereBild(datei, 1100);
    if (!dataUrl) continue;
    const r = await supaSatzFotoHochladen(adminIch.id, datum, dataUrl);
    if (!r.error) ok++;
    else meldungA("Foto nicht gespeichert: " + sicherA(r.error.message), "warn");
  }
  meldungA(ok + " von " + dateien.length + " Fotos zum Satz vom " + sicherA(datum) +
    " hochgeladen. Claude liest sie beim nächsten Auftrag ein.", ok ? "gut" : "warn");
  adminFotoSaetze();
}

function verkleinereBild(datei, maxBreite) {
  return new Promise(fertig => {
    const leser = new FileReader();
    leser.onload = ev => {
      const bild = new Image();
      bild.onload = () => {
        const faktor = Math.min(1, maxBreite / bild.width);
        const c = document.createElement("canvas");
        c.width = Math.round(bild.width * faktor);
        c.height = Math.round(bild.height * faktor);
        c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
        fertig(c.toDataURL("image/jpeg", 0.8));
      };
      bild.onerror = () => fertig(null);
      bild.src = ev.target.result;
    };
    leser.onerror = () => fertig(null);
    leser.readAsDataURL(datei);
  });
}

// ---------- Userliste ----------

async function adminUserliste() {
  const box = elA("adm_user");
  if (!box) return;
  const r = await supaAdminUserliste();
  if (r.error) {
    box.innerHTML = '<p class="mini rot">Admin-Liste nicht ladbar: ' + sicherA(r.error.message) + "</p>";
    return;
  }
  let zeilen = "";
  for (const u of (r.data || [])) {
    zeilen += "<tr><td>" + sicherA(u.username || "(kein Name)") +
      (u.rolle === "admin" ? ' <span class="mini">(Admin)</span>' : "") + "</td>" +
      "<td>" + sicherA(u.email || "") + "</td>" +
      "<td class='mini'>" + zeitA(u.registriert) + "</td>" +
      "<td class='mini'>" + (u.zuletzt ? zeitA(u.zuletzt) : "-") + "</td>" +
      "<td>" + u.scheine + "</td>" +
      "<td>" + (u.id === adminIch.id
        ? "<span class='mini'>das bist du</span>"
        : (u.rolle === "admin"
          ? '<button id="adminrolle_' + u.id + '" onclick="tuAdminRolle(\'' + u.id + '\', \'user\')">Admin-Rolle nehmen</button>'
          : '<button id="adminrolle_' + u.id + '" onclick="tuAdminRolle(\'' + u.id + '\', \'admin\')">zum Admin machen</button> ' +
            '<button id="adminweg_' + u.id + '" onclick="tuAdminLoeschen(\'' + u.id + '\')">löschen</button>')) +
      "</td></tr>";
  }
  box.innerHTML = "<table><thead><tr><th>Benutzername</th><th>E-Mail</th><th>registriert</th>" +
    "<th>zuletzt da</th><th>Scheine</th><th></th></tr></thead><tbody>" + zeilen + "</tbody></table>";
}

async function tuAdminRolle(id, neu) {
  const knopf = elA("adminrolle_" + id);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = (neu === "admin") ? "Wirklich zum Admin machen?" : "Wirklich Rolle nehmen?";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supaAdminRolle(id, neu);
  if (r.error) { meldungA("Rolle nicht geändert: " + sicherA(r.error.message), "warn"); return; }
  meldungA(neu === "admin"
    ? "Der Nutzer ist jetzt Admin: er sieht diese Seite und darf Foto-Sätze hochladen."
    : "Admin-Rolle entfernt - er ist wieder normaler Nutzer.", "gut");
  adminUserliste();
}

async function tuAdminLoeschen(id) {
  const knopf = elA("adminweg_" + id);
  if (knopf && knopf.dataset.sicher !== "1") {
    knopf.dataset.sicher = "1";
    knopf.textContent = "Wirklich? Alles weg!";
    knopf.classList.add("adminrot");
    return;
  }
  const r = await supaAdminUserLoeschen(id);
  if (r.error) { meldungA("Nicht gelöscht: " + sicherA(r.error.message), "warn"); return; }
  meldungA("User restlos gelöscht.", "gut");
  adminUserliste();
}

document.addEventListener("DOMContentLoaded", startAdmin);

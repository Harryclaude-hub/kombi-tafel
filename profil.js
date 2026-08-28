// ============================================================
// PROFIL: Anzeigename, Farbe, Schrift, Foto und ein paar Worte
// ueber sich.
//
// Der Anzeigename hat NICHTS mit dem Benutzernamen zu tun. Der
// Benutzername ist der Name zum Anmelden und der, unter dem
// Freunde einen finden - er bleibt, wie er ist. Der Anzeigename
// darf alles sein: Emojis, arabische oder kyrillische Schrift,
// Sonderzeichen.
//
// EHRLICH GESAGT: ein Profil ist dazu da, dass ANDERE es sehen.
// Es ist deshalb NICHT Ende-zu-Ende verschluesselt wie deine
// Nachrichten. Das steht auch so in der Oberflaeche, an zwei
// Stellen: oben im Block und direkt beim Foto-Knopf.
//
// SICHERHEIT: der Name kommt vom Menschen und landet deshalb
// NIE als HTML im Bildschirm - immer nur als Text. Sonst koennte
// sich jemand Unfug in die Bildschirme aller Freunde schreiben.
// Farben und Schriften sind eine feste Liste zum Anklicken,
// nichts frei Eintippbares.
// ============================================================
"use strict";

const PROFIL_FARBEN = [
  ["blau", "Blau"], ["gruen", "Grün"], ["rot", "Rot"], ["lila", "Lila"],
  ["orange", "Orange"], ["tuerkis", "Türkis"], ["schwarz", "Schwarz"], ["pink", "Pink"]
];
const PROFIL_SCHRIFTEN = [
  ["system", "Normal"], ["rund", "Rund"], ["schreib", "Schreibschrift"],
  ["fett", "Fett"], ["schmal", "Schmal"], ["breit", "Breit"]
];
const PROFIL_NAME_MAX = 40;
const PROFIL_BIO_MAX = 300;

// Gedaechtnis: id -> {anzeigename, username, farbe, schrift, bio}
// Das Foto steht bewusst NICHT hier drin - es wird einzeln geholt,
// sonst zieht das Handy bei zehn Freunden ein halbes Megabyte fuer nichts.
const _profile = {};
const _fotos = {};
let _profilSpaltenFehlen = false;

function profilKuerzen(t, max) {
  // Array.from zaehlt ZEICHEN, nicht halbe Zeichen. Sonst zerbricht
  // ein Emoji am Ende zu einem leeren Kaestchen.
  const z = Array.from(String(t || ""));
  return z.length > max ? z.slice(0, max).join("") : z.join("");
}

async function profileLaden(ids) {
  const fehlen = [...new Set((ids || []).filter(x => x && !_profile[x]))];
  if (!fehlen.length || !window.supa) return;
  const felder = _profilSpaltenFehlen
    ? "id, username"
    : "id, username, anzeigename, farbe, schrift, bio";
  const r = await supa.from("kt_profiles").select(felder).in("id", fehlen);
  if (r.error) {
    // NUR wenn die Spalten wirklich fehlen dauerhaft umschalten. Ein
    // einmaliger Netzhaenger darf nicht dazu fuehren, dass bis zum
    // Neuladen ueberall wieder nackte Benutzernamen stehen.
    if (/column .* does not exist/i.test(r.error.message || "")) {
      _profilSpaltenFehlen = true;
      const z = await supa.from("kt_profiles").select("id, username").in("id", fehlen);
      for (const p of (z.data || [])) _profile[p.id] = p;
    }
    return;
  }
  for (const p of (r.data || [])) _profile[p.id] = p;
}

function profilVon(id) { return _profile[id] || null; }

// Wie soll die Person heissen? Anzeigename, sonst Benutzername.
function profilName(id, ersatz) {
  const p = _profile[id];
  const n = p && p.anzeigename && p.anzeigename.trim();
  return profilKuerzen(n || (p && p.username) || ersatz || "?", PROFIL_NAME_MAX);
}

// Ein FERTIGES Element mit dem gestalteten Namen. Immer ueber textContent,
// damit nie fremdes HTML in den Bildschirm kommt.
// schlicht = true: ohne Farbe und Zierschrift (fuer Tabellen, damit keine
// Wunschfarbe neben den Bedeutungsfarben steht).
function profilNameEl(id, ersatz, schlicht) {
  const s = document.createElement("span");
  const p = _profile[id];
  s.className = "profilname" +
    (schlicht || !p ? " pf-schlicht"
      : " pf-c-" + (p.farbe || "blau") + " pf-f-" + (p.schrift || "system"));
  s.textContent = profilName(id, ersatz);
  if (!schlicht && p) s.dataset.pfKarte = id;
  return s;
}

// ---------- Das Foto ----------

async function profilFotoLaden(id) {
  if (!id || !window.supa) return null;
  if (Object.prototype.hasOwnProperty.call(_fotos, id)) return _fotos[id];
  const r = await supa.from("kt_profilfoto").select("foto").eq("id", id).maybeSingle();
  // Nur echte JPEG-Bilddaten annehmen - das Programm prueft nicht
  // schwaecher als die Datenbank.
  const f = (r.data && typeof r.data.foto === "string" &&
    r.data.foto.indexOf("data:image/jpeg;base64,") === 0) ? r.data.foto : null;
  _fotos[id] = f;
  return f;
}

function profilBuchstabe(id, ersatz) {
  return Array.from(profilName(id, ersatz)).find(z => /\S/.test(z)) || "?";
}

// Ein rundes Bild, das sich das Foto selbst nachholt. Ohne Foto steht
// der erste Buchstabe darin.
function profilBildEl(id, ersatz, groesse) {
  const d = document.createElement("span");
  d.className = "pf-bild";
  if (groesse) { d.style.width = groesse + "px"; d.style.height = groesse + "px"; }
  d.textContent = profilBuchstabe(id, ersatz);
  profilFotoLaden(id).then(f => {
    if (!f) return;
    const b = document.createElement("img");
    b.src = f; b.alt = "";
    d.textContent = "";
    d.appendChild(b);
  }).catch(() => {});
  return d;
}

// ============================================================
// DER KNOPF OBEN: neben Nachrichten und Freunden.
// Sobald ein Profilfoto da ist, WIRD das Foto zum Knopf.
// ============================================================

async function profilNavKnopf() {
  try {
    if (document.getElementById("nav_profil")) return;
    const nav = document.querySelector(".navleiste");
    if (!nav || !window.supa) return;
    const u = await supaNutzer();
    if (!u) return;                       // ohne Konto gibt es kein Profil
    const k = document.createElement("a");
    k.id = "nav_profil";
    k.href = "mein.html";
    k.className = "navknopf glocke profilknopf";
    k.title = "Dein Profil: Name, Bild und ein paar Worte über dich";
    k.textContent = "👤 Profil";
    k.onclick = ev => {
      // Auf Mein Bereich direkt den Block aufmachen, sonst dorthin gehen.
      if (typeof mbBlockZeigen === "function" && document.getElementById("blk_profil")) {
        ev.preventDefault();
        mbBlockZeigen("profil");
        const b = document.getElementById("blk_profil");
        if (b) b.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    // Vor den Nachrichten einhaengen, damit die Reihenfolge
    // Profil - Freunde - Nachrichten ergibt.
    const freunde = document.getElementById("nav_freunde");
    nav.insertBefore(k, freunde || null);
    await profileLaden([u.id]);
    profilNavAuffrischen();
  } catch (e) { /* der Knopf darf nie die Seite stoeren */ }
}

// Foto da? Dann ist das Foto der Knopf.
async function profilNavAuffrischen() {
  try {
    const k = document.getElementById("nav_profil");
    if (!k || !window.supa) return;
    const u = await supaNutzer();
    if (!u) return;
    const foto = await profilFotoLaden(u.id);
    k.textContent = "";
    if (foto) {
      const b = document.createElement("img");
      b.src = foto; b.alt = "Dein Profil";
      b.className = "pf-navbild";
      k.appendChild(b);
      k.classList.add("pf-hatbild");
    } else {
      k.classList.remove("pf-hatbild");
      k.textContent = "👤 Profil";
    }
  } catch (e) { }
}

document.addEventListener("DOMContentLoaded", () => setTimeout(profilNavKnopf, 800));

// ============================================================
// DIE VISITENKARTE: tippt man irgendwo auf einen Namen, klappt
// sie auf - mit Bild, Namen und den Worten ueber die Person.
// ============================================================

function profilKarteZu() {
  const k = document.getElementById("profilkarte");
  if (k) k.remove();
}

async function profilKarteZeigen(id) {
  profilKarteZu();
  if (!id) return;
  await profileLaden([id]);
  const p = profilVon(id) || {};
  const d = document.createElement("div");
  d.id = "profilkarte";
  // Die tragende Geometrie steht hier, nicht nur im CSS: die Design-Schicht
  // muss sich loeschen lassen, ohne dass die Karte unsichtbar wird.
  d.style.position = "fixed";
  d.style.left = "0"; d.style.top = "0"; d.style.right = "0"; d.style.bottom = "0";
  d.style.zIndex = "2000";
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.style.justifyContent = "center";
  d.style.background = "rgba(10, 18, 32, 0.55)";
  d.onclick = ev => { if (ev.target === d) profilKarteZu(); };

  const karte = document.createElement("div");
  karte.className = "pf-karte";
  karte.appendChild(profilBildEl(id, p.username, 96));
  const name = profilNameEl(id, p.username);
  name.classList.add("pf-kartenname");
  delete name.dataset.pfKarte;            // in der Karte selbst nicht nochmal klickbar
  karte.appendChild(name);
  const unter = document.createElement("div");
  unter.className = "mini pf-kartenuser";
  unter.textContent = "@" + (p.username || "?");
  karte.appendChild(unter);
  if (p.bio && p.bio.trim()) {
    const bio = document.createElement("div");
    bio.className = "pf-kartenbio";
    bio.textContent = profilKuerzen(p.bio, PROFIL_BIO_MAX);
    karte.appendChild(bio);
  }
  const zu = document.createElement("button");
  zu.className = "haupt";
  zu.textContent = "Schliessen";
  zu.onclick = profilKarteZu;
  karte.appendChild(zu);
  d.appendChild(karte);
  document.body.appendChild(d);
}

// Ein Klick-Ohr fuer alle Namen, egal wo sie stehen.
document.addEventListener("click", ev => {
  const t = ev.target && ev.target.closest && ev.target.closest("[data-pf-karte]");
  if (!t) return;
  // In einem Knopf oder Link soll der Knopf gewinnen, nicht die Karte.
  if (t.closest("button, a")) return;
  ev.preventDefault();
  profilKarteZeigen(t.dataset.pfKarte);
}, false);
document.addEventListener("keydown", ev => { if (ev.key === "Escape") profilKarteZu(); });

// ============================================================
// DER BEARBEITEN-BLOCK in Mein Bereich.
// Alles, was man antippt, waechst sofort in der Vorschau mit.
// ============================================================

function profilBlockHtml() {
  let farben = "";
  for (const [wert, name] of PROFIL_FARBEN)
    farben += '<button type="button" class="pf-wahl pf-c-' + wert + '" data-pf-farbe="' + wert +
      '" onclick="tuProfilFarbe(\'' + wert + '\')" title="' + name + '">Aa</button>';
  let schriften = "";
  for (const [wert, name] of PROFIL_SCHRIFTEN)
    schriften += '<button type="button" class="pf-wahl pf-f-' + wert + '" data-pf-schrift="' + wert +
      '" onclick="tuProfilSchrift(\'' + wert + '\')">' + name + "</button>";

  return '<div class="profilkasten">' +
    "<h3>&#128100; Dein Profil</h3>" +
    '<div class="pf-hinweis"><b>Dein Profil sehen deine Freunde.</b> Es ist NICHT wie deine ' +
    "Nachrichten verschlüsselt - schreib also nichts hinein, was niemand sehen soll.</div>" +

    '<div class="pf-vorschau" id="pf_vorschau"></div>' +

    '<label class="pf-feld"><b>Dein Anzeigename</b>' +
    '<span class="mini">Frei wählbar - Emojis, jede Schrift, alles erlaubt. Er hat nichts mit ' +
    "deinem Benutzernamen zum Anmelden zu tun.</span>" +
    '<input id="pf_name" maxlength="' + PROFIL_NAME_MAX + '" oninput="profilVorschau()" ' +
    'placeholder="zum Beispiel: Karam 🎯"></label>' +

    '<div class="pf-feld"><b>Farbe</b><div class="pf-wahlreihe" id="pf_farben">' + farben + "</div></div>" +
    '<div class="pf-feld"><b>Schrift</b><div class="pf-wahlreihe" id="pf_schriften">' + schriften + "</div>" +
    '<span class="mini">Manche Zierschriften gibt es auf dem iPhone nicht - dort sieht dein Name ' +
    "dann normal aus. Das ist kein Fehler.</span></div>" +

    '<label class="pf-feld"><b>Ein paar Worte über dich</b>' +
    '<textarea id="pf_bio" maxlength="' + PROFIL_BIO_MAX + '" rows="3" oninput="profilVorschau()" ' +
    'placeholder="Was sollen die anderen über dich wissen?"></textarea></label>' +

    '<div class="pf-feld"><b>Dein Bild</b>' +
    '<div class="pf-fotoreihe">' +
    '<label class="fotoknopf">&#128247; Bild wählen' +
    '<input type="file" accept="image/*" style="display:none" onchange="tuProfilFoto(this)"></label> ' +
    '<button type="button" onclick="tuProfilFotoWeg()">Bild entfernen</button>' +
    "</div>" +
    '<span class="mini">Auch das Bild sehen deine Freunde und es ist nicht verschlüsselt. ' +
    "Es wird vor dem Hochladen klein gerechnet.</span>" +
    '<div id="pf_fotomeldung" class="mini"></div></div>' +

    '<div class="pf-feld"><button class="haupt" onclick="tuProfilSpeichern()">&#128190; Profil speichern</button>' +
    '<span class="mini" id="pf_stand"></span></div>' +
    "</div>";
}

let _pfWahl = { farbe: "blau", schrift: "system" };

function tuProfilFarbe(w) {
  if (!PROFIL_FARBEN.some(x => x[0] === w)) return;     // nur aus der Liste
  _pfWahl.farbe = w;
  profilWahlMalen(); profilVorschau();
}
function tuProfilSchrift(w) {
  if (!PROFIL_SCHRIFTEN.some(x => x[0] === w)) return;
  _pfWahl.schrift = w;
  profilWahlMalen(); profilVorschau();
}
function profilWahlMalen() {
  document.querySelectorAll("[data-pf-farbe]").forEach(b =>
    b.classList.toggle("aktiv", b.dataset.pfFarbe === _pfWahl.farbe));
  document.querySelectorAll("[data-pf-schrift]").forEach(b =>
    b.classList.toggle("aktiv", b.dataset.pfSchrift === _pfWahl.schrift));
}

// Die Vorschau zeigt genau das, was die anderen sehen werden.
function profilVorschau() {
  const ziel = document.getElementById("pf_vorschau");
  if (!ziel) return;
  const name = (document.getElementById("pf_name") || {}).value || "";
  const bio = (document.getElementById("pf_bio") || {}).value || "";
  ziel.innerHTML = "";
  const zeile = document.createElement("div");
  zeile.className = "pf-vorschauzeile";
  const bild = document.createElement("span");
  bild.className = "pf-bild";
  bild.id = "pf_vorschaubild";
  bild.textContent = Array.from(name.trim() || "?").find(z => /\S/.test(z)) || "?";
  if (_pfFotoNeu || _pfFotoDa) {
    const b = document.createElement("img");
    b.src = _pfFotoNeu || _pfFotoDa; b.alt = "";
    bild.textContent = ""; bild.appendChild(b);
  }
  zeile.appendChild(bild);
  const rechts = document.createElement("div");
  const n = document.createElement("span");
  n.className = "profilname pf-c-" + _pfWahl.farbe + " pf-f-" + _pfWahl.schrift;
  n.textContent = profilKuerzen(name.trim() || "(noch kein Anzeigename)", PROFIL_NAME_MAX);
  rechts.appendChild(n);
  if (bio.trim()) {
    const b = document.createElement("div");
    b.className = "mini pf-vorschaubio";
    b.textContent = profilKuerzen(bio, PROFIL_BIO_MAX);
    rechts.appendChild(b);
  }
  zeile.appendChild(rechts);
  ziel.appendChild(zeile);
}

let _pfFotoDa = null;    // was in der Datenbank steht
let _pfFotoNeu = null;   // was gerade gewaehlt wurde, aber noch nicht gespeichert

async function profilBlockFuellen() {
  if (!window.supa) return;
  const u = await supaNutzer();
  if (!u) return;
  _profile[u.id] = null; delete _profile[u.id];
  await profileLaden([u.id]);
  const p = profilVon(u.id) || {};
  const n = document.getElementById("pf_name");
  const b = document.getElementById("pf_bio");
  if (n) n.value = p.anzeigename || "";
  if (b) b.value = p.bio || "";
  _pfWahl.farbe = p.farbe || "blau";
  _pfWahl.schrift = p.schrift || "system";
  _pfFotoDa = await profilFotoLaden(u.id);
  _pfFotoNeu = null;
  profilWahlMalen();
  profilVorschau();
}

// ---------- Foto waehlen, klein rechnen, speichern ----------

function profilBildKleinRechnen(datei, kante) {
  return new Promise(fertig => {
    try {
      const leser = new FileReader();
      leser.onload = () => {
        const bild = new Image();
        bild.onload = () => {
          // Quadratisch zuschneiden: ein Profilbild ist immer rund.
          const seite = Math.min(bild.width, bild.height);
          const x = (bild.width - seite) / 2, y = (bild.height - seite) / 2;
          const c = document.createElement("canvas");
          c.width = kante; c.height = kante;
          const ctx = c.getContext("2d");
          ctx.drawImage(bild, x, y, seite, seite, 0, 0, kante, kante);
          // Immer JPEG - genau das laesst die Datenbank zu.
          fertig(c.toDataURL("image/jpeg", 0.82));
        };
        bild.onerror = () => fertig(null);
        bild.src = leser.result;
      };
      leser.onerror = () => fertig(null);
      leser.readAsDataURL(datei);
    } catch (e) { fertig(null); }
  });
}

async function tuProfilFoto(eingabe) {
  const meld = document.getElementById("pf_fotomeldung");
  const datei = eingabe && eingabe.files && eingabe.files[0];
  if (eingabe) eingabe.value = "";
  if (!datei) return;
  if (!/^image\//.test(datei.type)) {
    if (meld) meld.textContent = "Das ist kein Bild. Nimm ein Foto (JPG, PNG oder WEBP).";
    return;
  }
  if (meld) meld.textContent = "Bild wird klein gerechnet...";
  const klein = await profilBildKleinRechnen(datei, 256);
  if (!klein) { if (meld) meld.textContent = "Das Bild liess sich nicht lesen."; return; }
  _pfFotoNeu = klein;
  if (meld) meld.textContent = "Bild bereit (" + Math.round(klein.length / 1024) +
    " KB). Jetzt unten auf Profil speichern drücken.";
  profilVorschau();
}

function tuProfilFotoWeg() {
  _pfFotoNeu = "weg";
  const meld = document.getElementById("pf_fotomeldung");
  if (meld) meld.textContent = "Bild wird beim Speichern entfernt.";
  _pfFotoDa = null;
  profilVorschau();
}

async function tuProfilSpeichern() {
  const stand = document.getElementById("pf_stand");
  const sag = t => { if (stand) stand.textContent = t; };
  if (!window.supa) { sag("Keine Verbindung."); return; }
  const u = await supaNutzer();
  if (!u) { sag("Zuerst anmelden."); return; }
  sag("Wird gespeichert...");

  const name = profilKuerzen(((document.getElementById("pf_name") || {}).value || "").trim(), PROFIL_NAME_MAX);
  const bio = profilKuerzen(((document.getElementById("pf_bio") || {}).value || "").trim(), PROFIL_BIO_MAX);
  const r = await supa.from("kt_profiles").update({
    anzeigename: name || null, bio: bio || null,
    farbe: _pfWahl.farbe, schrift: _pfWahl.schrift
  }).eq("id", u.id);
  if (r.error) { sag("Nicht gespeichert: " + profilFehlerKlartext(r.error.message)); return; }

  // Das Bild getrennt, es liegt in einer eigenen Tabelle.
  if (_pfFotoNeu === "weg") {
    const w = await supa.from("kt_profilfoto").delete().eq("id", u.id);
    if (w.error) { sag("Name gespeichert, Bild nicht entfernt: " + profilFehlerKlartext(w.error.message)); return; }
    delete _fotos[u.id];
  } else if (_pfFotoNeu) {
    const w = await supa.from("kt_profilfoto")
      .upsert({ id: u.id, foto: _pfFotoNeu, geaendert_am: new Date().toISOString() }, { onConflict: "id" });
    if (w.error) { sag("Name gespeichert, Bild nicht: " + profilFehlerKlartext(w.error.message)); return; }
    _fotos[u.id] = _pfFotoNeu;
    _pfFotoDa = _pfFotoNeu;
  }
  _pfFotoNeu = null;
  delete _profile[u.id];
  await profileLaden([u.id]);
  sag("✅ Gespeichert. So sehen dich die anderen jetzt.");
  profilVorschau();
  profilNavAuffrischen();
  // Der Messenger soll die neuen Namen sofort zeigen.
  if (typeof glockeListe === "function" && document.getElementById("glockenpanel")) glockeListe();
}

function profilFehlerKlartext(m) {
  const t = String(m || "");
  if (/kt_profiles_anzeigename_laenge/.test(t)) return "Der Anzeigename ist zu lang (höchstens 40 Zeichen).";
  if (/kt_profiles_bio_laenge/.test(t)) return "Der Text über dich ist zu lang (höchstens 300 Zeichen).";
  if (/kt_profilfoto_groesse/.test(t)) return "Das Bild ist zu groß. Nimm ein kleineres.";
  if (/kt_profilfoto_art/.test(t)) return "Dieses Bildformat geht nicht. Nimm ein normales Foto.";
  if (/row-level|policy|42501/i.test(t)) return "Die Datenbank hat das abgelehnt. Einmal ab- und wieder anmelden.";
  if (/JWT|expired/i.test(t)) return "Deine Anmeldung ist abgelaufen - bitte die Seite neu laden.";
  if (/Failed to fetch|NetworkError/i.test(t)) return "Keine Verbindung. Internet prüfen.";
  if (/column .* does not exist/i.test(t)) return "Das Profil ist in der Datenbank noch nicht eingerichtet.";
  return t.slice(0, 120);
}

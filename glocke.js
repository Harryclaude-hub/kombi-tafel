// ============================================================
// GLOCKE: der Nachrichten-Knopf oben rechts, auf jeder Seite.
// Klick oeffnet ein kleines Nachrichten-Fenster (wie ein Messenger)
// nur fuer Direktnachrichten mit Freunden. Die tiefe Kommunikation
// je Bereich bleibt im Bereichs-Chat in "Mein Bereich".
// ============================================================
"use strict";

let glockeOffen = false;
let glockePartner = null;      // {partnerId, username}
let glockeLetzteId = 0;
let glockePoll = null;

async function glockeStart() {
  try {
    if (!window.supa || typeof supaNutzer !== "function") return;
    const knopf = document.getElementById("nav_nachrichten");
    if (!knopf) return;
    knopf.addEventListener("click", (ev) => { ev.preventDefault(); glockeUmschalten(); });
    const fk = document.getElementById("nav_freunde");
    if (fk) fk.addEventListener("click", (ev) => { ev.preventDefault(); freundePanelUmschalten(); });
    await glockeZaehlen();
    setInterval(glockeZaehlen, 30000);
  } catch (e) { /* Glocke stoert nie die Seite */ }
}

// ---------- Freunde-Dashboard (oben rechts) ----------
// Wer sind meine Freunde, wann haben wir zuletzt geschrieben, wer folgt
// meinem Bereich (Follower) und wem folge ich. Freunde lassen sich
// ausblenden (nur Ansicht - die Freundschaft bleibt).

let freundeOffen = false;

function freundAusgeblendet(id) { return localStorage.getItem("kt_freund_aus_" + id) === "1"; }

function tuFreundAus(id, ja) {
  if (ja) localStorage.setItem("kt_freund_aus_" + id, "1");
  else localStorage.removeItem("kt_freund_aus_" + id);
  freundeZeichnen();
}

function freundePanelUmschalten() {
  freundeOffen = !freundeOffen;
  let panel = document.getElementById("freundepanel");
  if (!freundeOffen) { if (panel) panel.remove(); return; }
  const alt = document.getElementById("glockenpanel");
  if (alt) { alt.remove(); glockeOffen = false; }
  panel = document.createElement("div");
  panel.id = "freundepanel";
  panel.innerHTML = '<div class="gp-kopf">Freunde <button class="gp-zu" ' +
    'onclick="freundePanelUmschalten()">schliessen</button></div><div id="fp-inhalt">Laedt...</div>';
  document.body.appendChild(panel);
  freundeZeichnen();
}

function fpSicher(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

async function freundeZeichnen() {
  const ziel = document.getElementById("fp-inhalt");
  if (!ziel) return;
  const u = await supaNutzer();
  if (!u) {
    ziel.innerHTML = '<p class="mini">Fuer Freunde brauchst du ein Konto: ' +
      '<a href="mein.html">anmelden oder registrieren</a>.</p>';
    return;
  }
  const kontakte = await supaKontakteLaden();
  const vonMir = await supaFreigabenVonMir();
  const fuerMich = await supaBereicheFuerMich();

  let html = "<h4>Deine Freunde (" + kontakte.length + ")</h4>";
  if (!kontakte.length) html += '<p class="mini">Noch keine. Adden geht in <a href="mein.html">Mein Bereich</a>.</p>';
  const versteckte = [];
  for (const k of kontakte) {
    if (freundAusgeblendet(k.partnerId)) { versteckte.push(k); continue; }
    const letzte = await supa.from("kt_direkt").select("created_at")
      .or("and(von.eq." + u.id + ",an.eq." + k.partnerId + "),and(von.eq." + k.partnerId + ",an.eq." + u.id + ")")
      .order("id", { ascending: false }).limit(1);
    const wann = (letzte.data && letzte.data.length)
      ? "zuletzt geschrieben: " + new Date(letzte.data[0].created_at).toLocaleString("de-AT",
          { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "noch nie geschrieben";
    html += '<div class="fp-freund"><b>' + fpSicher(k.username) + "</b> " +
      '<span class="mini">' + wann + "</span> " +
      '<button onclick="freundePanelUmschalten();glockeUmschalten();glockeThread(\'' + k.partnerId + "','" + fpSicher(k.username) + '\')">&#128172;</button> ' +
      '<button onclick="tuFreundAus(\'' + k.partnerId + '\', true)">ausblenden</button></div>';
  }
  if (versteckte.length) {
    html += '<details><summary class="mini">Ausgeblendete Freunde (' + versteckte.length + ")</summary>";
    for (const k of versteckte) {
      html += '<div class="fp-freund mini">' + fpSicher(k.username) +
        ' <button onclick="tuFreundAus(\'' + k.partnerId + '\', false)">wieder zeigen</button></div>';
    }
    html += "</details>";
  }

  html += "<h4>Follower: die sehen deinen Bereich (" + vonMir.length + ")</h4>";
  for (const f of vonMir) {
    html += '<div class="fp-freund mini">' + fpSicher(f.kt_profiles.username) +
      " <span class='mini'>(" + (f.rolle === "close" ? "darf mitarbeiten" : "schaut nur zu") + ")</span></div>";
  }
  if (!vonMir.length) html += '<p class="mini">Noch niemand.</p>';

  html += "<h4>Du folgst: diese Bereiche siehst du (" + fuerMich.length + ")</h4>";
  for (const f of fuerMich) {
    html += '<div class="fp-freund mini">' + fpSicher(f.kt_profiles.username) +
      " <span class='mini'>(" + (f.rolle === "close" ? "mitarbeiten" : "nur lesen") + ")</span></div>";
  }
  if (!fuerMich.length) html += '<p class="mini">Noch keine.</p>';

  ziel.innerHTML = html;
}

async function glockeZaehlen() {
  const u = await supaNutzer();
  const knopf = document.getElementById("nav_nachrichten");
  if (!u || !knopf) return;
  let n = 0;
  const geteilt = await supa.from("kt_freigaben").select("owner").eq("gast", u.id);
  const bereiche = [u.id].concat((geteilt.data || []).map(g => g.owner));
  for (const b of bereiche) {
    const gelesen = parseInt(localStorage.getItem("kt_gelesen_" + b) || "0", 10);
    const r = await supa.from("kt_nachrichten").select("id", { count: "exact", head: true })
      .eq("bereich", b).gt("id", gelesen).neq("autor", u.id);
    n += r.count || 0;
  }
  const kontakte = await supaKontakteLaden();
  for (const k of kontakte) {
    const gelesen = parseInt(localStorage.getItem("kt_dm_gelesen_" + k.partnerId) || "0", 10);
    const r = await supa.from("kt_direkt").select("id", { count: "exact", head: true })
      .eq("an", u.id).eq("von", k.partnerId).gt("id", gelesen);
    n += r.count || 0;
  }
  const b = knopf.querySelector(".badge");
  if (b) {
    b.textContent = n > 99 ? "99+" : String(n);
    b.style.display = n > 0 ? "inline-block" : "none";
  }
}

function glockeUmschalten() {
  const fp = document.getElementById("freundepanel");
  if (fp) { fp.remove(); freundeOffen = false; }
  glockeOffen = !glockeOffen;
  let panel = document.getElementById("glockenpanel");
  if (!glockeOffen) {
    if (panel) panel.remove();
    if (glockePoll) clearInterval(glockePoll);
    return;
  }
  panel = document.createElement("div");
  panel.id = "glockenpanel";
  panel.innerHTML = '<div class="gp-kopf">Nachrichten <button class="gp-zu" ' +
    'onclick="glockeUmschalten()">schliessen</button></div><div id="gp-inhalt">Laedt...</div>';
  document.body.appendChild(panel);
  glockeListe();
}

async function glockeListe() {
  glockePartner = null;
  if (glockePoll) clearInterval(glockePoll);
  const ziel = document.getElementById("gp-inhalt");
  if (!ziel) return;
  const u = await supaNutzer();
  if (!u) {
    ziel.innerHTML = '<p class="mini">Zum Schreiben brauchst du ein Konto: ' +
      '<a href="mein.html">anmelden oder registrieren</a>.</p>';
    return;
  }
  const kontakte = await supaKontakteLaden();
  if (!kontakte.length) {
    ziel.innerHTML = '<p class="mini">Keine Nachrichten. Freunde addest du in ' +
      '<a href="mein.html">Mein Bereich</a> unter "Freunde und Nachrichten".</p>';
    return;
  }
  let html = "";
  for (const k of kontakte) {
    const gelesen = parseInt(localStorage.getItem("kt_dm_gelesen_" + k.partnerId) || "0", 10);
    const r = await supa.from("kt_direkt").select("id", { count: "exact", head: true })
      .eq("an", u.id).eq("von", k.partnerId).gt("id", gelesen);
    const neu = r.count || 0;
    html += '<button class="gp-freund" onclick="glockeThread(\'' + k.partnerId + "','" +
      k.username + '\')">' + k.username +
      (neu ? ' <span class="badge">' + neu + "</span>" : "") + "</button>";
  }
  ziel.innerHTML = html;
}

async function glockeThread(partnerId, username) {
  glockePartner = { partnerId: partnerId, username: username };
  glockeLetzteId = 0;
  const ziel = document.getElementById("gp-inhalt");
  ziel.innerHTML = '<button class="gp-zurueck" onclick="glockeListe()">zurueck</button> ' +
    "<b>" + username + '</b><div id="gp-liste" class="chatliste gp-liste"></div>' +
    '<div class="chateingabe"><input id="gp-text" placeholder="Nachricht..." ' +
    'onkeydown="if(event.key===\'Enter\')glockeSenden()">' +
    '<button class="haupt" onclick="glockeSenden()">Senden</button></div>';
  await glockeNachladen();
  if (glockePoll) clearInterval(glockePoll);
  glockePoll = setInterval(glockeNachladen, 10000);
}

async function glockeNachladen() {
  if (!glockePartner || !document.getElementById("gp-liste")) return;
  const u = await supaNutzer();
  const neue = await supaDmLaden(glockePartner.partnerId, glockeLetzteId || null);
  if (!neue.length) return;
  const box = document.getElementById("gp-liste");
  for (const n of neue) {
    glockeLetzteId = Math.max(glockeLetzteId, n.id);
    const z = document.createElement("div");
    z.className = "chatzeile" + (n.von === u.id ? " vonmir" : "");
    z.innerHTML = "<span class='mini'>" +
      new Date(n.created_at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) +
      "</span> " + n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    box.appendChild(z);
  }
  box.scrollTop = box.scrollHeight;
  localStorage.setItem("kt_dm_gelesen_" + glockePartner.partnerId, String(glockeLetzteId));
  glockeZaehlen();
}

async function glockeSenden() {
  const feld = document.getElementById("gp-text");
  const text = feld.value.trim();
  if (!text) return;
  const r = await supaDmSenden(glockePartner.partnerId, text);
  if (r.error) { alert("Nicht gesendet: " + r.error.message); return; }
  feld.value = "";
  glockeNachladen();
}

document.addEventListener("DOMContentLoaded", glockeStart);

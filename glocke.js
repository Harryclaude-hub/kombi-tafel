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
    await glockeZaehlen();
    setInterval(glockeZaehlen, 30000);
  } catch (e) { /* Glocke stoert nie die Seite */ }
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

// ============================================================
// GLOCKE: der Nachrichten-Knopf oben rechts, auf jeder Seite.
// Klick öffnet ein kleines Nachrichten-Fenster (wie ein Messenger)
// nur für Direktnachrichten mit Freunden. Die tiefe Kommunikation
// je Bereich bleibt im Bereichs-Chat in "Mein Bereich".
// ============================================================
"use strict";

let glockeOffen = false;
let _glockeVorher = -1;   // Zaehlerstand der letzten Runde (fuer Meldungen)
let glockePartner = null;      // {partnerId, username}
let glockeLetzteId = 0;
let glockePoll = null;

async function glockeStart() {
  try {
    if (!window.supa || typeof supaNutzer !== "function") {
      // Frueher stieg die Glocke hier still aus: keine Zaehlung, KEINE
      // Anrufe - und auf sechs von sieben Seiten stand nirgends, warum.
      if (typeof weckerBalken === "function")
        weckerBalken("Die Verbindung zur Datenbank konnte nicht laden (Werbeblocker, Firmennetz " +
          "oder kurze Netzstoerung). Solange das so ist, kommen hier keine Nachrichten und keine " +
          "Anrufe an. Meist hilft: Seite neu laden.", "warn", "keine-supa", 30);
      return;
    }
    const knopf = document.getElementById("nav_nachrichten");
    if (!knopf) return;
    knopf.addEventListener("click", (ev) => { ev.preventDefault(); glockeUmschalten(); });
    const fk = document.getElementById("nav_freunde");
    if (fk) fk.addEventListener("click", (ev) => { ev.preventDefault(); freundePanelUmschalten(); });
    if (typeof anrufBereit === "function") anrufBereit();
    await glockeZaehlen();
    setInterval(glockeZaehlen, 30000);
  } catch (e) { /* Glocke stört nie die Seite */ }
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
    'onclick="freundePanelUmschalten()">schliessen</button></div><div id="fp-inhalt">Lädt...</div>';
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
    ziel.innerHTML = '<p class="mini">Für Freunde brauchst du ein Konto: ' +
      '<a href="mein.html">anmelden oder registrieren</a>.</p>';
    return;
  }
  const kontakte = await supaKontakteLaden();
  const vonMir = await supaFreigabenVonMir();
  const fuerMich = await supaBereicheFuerMich();

  let html = "<h4>&#128101; Deine Freunde (" + kontakte.length + ")</h4>";
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

  html += "<h4>&#128064; Follower: die sehen deinen Bereich (" + vonMir.length + ")</h4>";
  for (const f of vonMir) {
    html += '<div class="fp-freund mini">' + fpSicher(f.kt_profiles.username) +
      " <span class='mini'>(" + (f.rolle === "close" ? "darf mitarbeiten" : "schaut nur zu") + ")</span></div>";
  }
  if (!vonMir.length) html += '<p class="mini">Noch niemand.</p>';

  html += "<h4>&#11088; Du folgst: diese Bereiche siehst du (" + fuerMich.length + ")</h4>";
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
  // Kam etwas Neues dazu, waehrend die Seite im Hintergrund liegt? Melden.
  if (_glockeVorher >= 0 && n > _glockeVorher && typeof benachrichtige === "function") {
    benachrichtige("Neue Nachricht", "In der Kombi-Tafel lesen.", "nachricht");
  }
  _glockeVorher = n;
}

function glockeUmschalten() {
  const fp = document.getElementById("freundepanel");
  if (fp) { fp.remove(); freundeOffen = false; }
  glockeOffen = !glockeOffen;
  let panel = document.getElementById("glockenpanel");
  if (!glockeOffen) {
    if (panel) panel.remove();
    if (glockePoll) clearInterval(glockePoll);
    if (typeof aufnahmeAbbrechen === "function") aufnahmeAbbrechen();
    tippKanalZu();
    return;
  }
  panel = document.createElement("div");
  panel.id = "glockenpanel";
  // ZWEI SPALTEN: links alle Gespraeche, rechts das offene. Am Handy ist
  // immer nur eine davon zu sehen (das steuert die Klasse gp-zeigt-*).
  panel.innerHTML =
    '<div class="gp-kopf">&#128172; Nachrichten' +
    '<button class="gp-zu" onclick="glockeUmschalten()">schliessen</button></div>' +
    '<div id="gp-inhalt" class="gp-zwei gp-zeigt-liste">' +
    '<div id="gp-spalte" class="gp-spalte"><div class="mini gp-spaltekopf">Deine Chats</div>' +
    '<div id="gp-liste-inhalt">Lädt...</div></div>' +
    '<div id="gp-gespraech" class="gp-gespraech">' +
    '<div class="gp-leer mini">Links ein Gespräch antippen.</div></div>' +
    "</div>";
  document.body.appendChild(panel);
  glockeListe();
}

// Klappt am Handy die Anhang-Zeichen auf und zu.
function glockeMehr() {
  const e = document.getElementById("gp-eingabe");
  if (e) e.classList.toggle("offen");
}

// Zeigt am Handy entweder die Liste oder das Gespraech.
function glockeSpalteZeigen(was) {
  const i = document.getElementById("gp-inhalt");
  if (!i) return;
  i.classList.toggle("gp-zeigt-liste", was === "liste");
  i.classList.toggle("gp-zeigt-gespraech", was === "gespraech");
}

async function glockeListe(nurListe) {
  if (!nurListe) { glockePartner = null; if (glockePoll) clearInterval(glockePoll); tippKanalZu(); }
  const ziel = document.getElementById("gp-liste-inhalt");
  if (!ziel) return;
  const u = await supaNutzer();
  if (!u) {
    ziel.innerHTML = '<p class="mini">Zum Schreiben brauchst du ein Konto: ' +
      '<a href="mein.html">anmelden oder registrieren</a>.</p>';
    return;
  }
  const kontakte = await supaKontakteLaden();
  if (!kontakte.length) {
    ziel.innerHTML = '<p class="mini">Noch keine Freunde. Freunde addest du in ' +
      '<a href="mein.html">Mein Bereich</a> unter "Freunde und Teilen".</p>';
    return;
  }
  // Die Anzeigenamen aller Gespraechspartner auf einmal holen.
  if (typeof profileLaden === "function") await profileLaden(kontakte.map(k => k.partnerId));

  ziel.innerHTML = "";
  for (const k of kontakte) {
    const gelesen = parseInt(localStorage.getItem("kt_dm_gelesen_" + k.partnerId) || "0", 10);
    const r = await supa.from("kt_direkt").select("id", { count: "exact", head: true })
      .eq("an", u.id).eq("von", k.partnerId).gt("id", gelesen);
    const neu = r.count || 0;

    const b = document.createElement("button");
    b.className = "gp-freund" + (glockePartner && glockePartner.partnerId === k.partnerId ? " offen" : "");
    b.onclick = () => glockeThread(k.partnerId, k.username);
    if (typeof profilBildEl === "function") b.appendChild(profilBildEl(k.partnerId, k.username, 40));
    const mitte = document.createElement("span");
    mitte.className = "gp-freundname";
    mitte.appendChild(typeof profilNameEl === "function"
      ? profilNameEl(k.partnerId, k.username, true)
      : document.createTextNode(k.username));
    const wer = document.createElement("span");
    wer.className = "mini gp-freunduser";
    wer.textContent = "@" + k.username;
    mitte.appendChild(wer);
    b.appendChild(mitte);
    if (neu) {
      const z = document.createElement("span");
      z.className = "badge";
      z.textContent = String(neu);
      b.appendChild(z);
    }
    ziel.appendChild(b);
  }
}

async function glockeThread(partnerId, username) {
  glockePartner = { partnerId: partnerId, username: username };
  glockeLetzteId = 0;
  const ziel = document.getElementById("gp-gespraech");
  if (!ziel) return;
  glockeSpalteZeigen("gespraech");
  if (typeof profileLaden === "function") await profileLaden([partnerId]);

  ziel.innerHTML =
    '<div class="gp-gkopf">' +
    '<button class="gp-zurueck" onclick="glockeSpalteZeigen(\'liste\')" title="Zurück zur Liste">&#8592;</button>' +
    '<span id="gp-kopfbild"></span>' +
    '<span class="gp-kopfmitte">' +
    '<span class="gp-kopfname" id="gp-kopfname"></span>' +
    '<span class="gp-kopfuser" id="gp-kopfuser"></span></span>' +
    '<button class="gp-ruf" onclick="anrufStarten(glockePartner.partnerId, glockePartner.username, false)" ' +
    'title="Anrufen">&#128222;</button>' +
    '<button class="gp-ruf" onclick="anrufStarten(glockePartner.partnerId, glockePartner.username, true)" ' +
    'title="Video-Anruf">&#128249;</button></div>' +
    '<div class="mini gp-e2e">&#128274; Ende-zu-Ende verschlüsselt</div>' +
    '<div id="gp-vorschau"></div>' +
    '<div id="gp-liste" class="chatliste gp-liste"></div>' +
    '<div id="gp-tippt" class="gp-tippt"></div>' +
    '<div class="chateingabe" id="gp-eingabe">' +
    '<button class="gp-ikon gp-mehr" onclick="glockeMehr()" ' +
    'title="Foto, Ton, Kombination anhängen">&#43;</button>' +
    '<span class="gp-extras">' +
    '<label class="gp-ikon fotoknopf" title="Foto oder Datei">&#128206;' +
    '<input type="file" style="display:none" onchange="glockeDatei(this)"></label>' +
    '<button id="gp-ton" class="gp-ikon" onclick="glockeTon()" title="Sprachnachricht">&#127908;</button>' +
    '<button id="gp-video" class="gp-ikon" onclick="glockeVideo()" title="Video">&#128249;</button>' +
    '<button class="gp-ikon" onclick="anhangWaehlen(&quot;kombi&quot;)" ' +
    'title="Kombination anhängen (oder k- tippen)">&#127919;</button>' +
    '<button class="gp-ikon" onclick="anhangWaehlen(&quot;person&quot;)" ' +
    'title="Person zeigen (oder p- tippen)">&#128100;</button></span>' +
    '<input id="gp-text" placeholder="Nachricht, oder k- für eine Kombination" autocomplete="off" ' +
    'oninput="tippMelden(); anhangTippen(this)" onkeydown="if(event.key===\'Enter\')glockeSenden()">' +
    '<button class="haupt gp-senden" onclick="glockeSenden()" title="Senden">&#10148;</button>' +
    "</div>";

  const kb = document.getElementById("gp-kopfbild");
  if (kb && typeof profilBildEl === "function") kb.appendChild(profilBildEl(partnerId, username, 36));
  const ku = document.getElementById("gp-kopfuser");
  // Nur der Benutzername des ANDEREN. Wer wen geschrieben hat, steht
  // ohnehin ueber jeder Blase - ein Satz dazu waere nur Gedraenge.
  if (ku) ku.textContent = "@" + username;
  const kn = document.getElementById("gp-kopfname");
  if (kn) kn.appendChild(typeof profilNameEl === "function"
    ? profilNameEl(partnerId, username) : document.createTextNode(username));

  await glockeNachladen();
  if (glockePoll) clearInterval(glockePoll);
  glockePoll = setInterval(glockeNachladen, 10000);
  tippKanalAuf(partnerId);
  glockeListe(true);            // die Liste markiert das offene Gespraech
}

// ============================================================
// "schreibt gerade ..." - laeuft ueber denselben Live-Weg wie die
// Anrufe. Es wird NUR gemeldet, DASS jemand tippt, nie was.
// ============================================================

let _tippKanal = null, _tippZiel = null, _tippUhr = null, _tippZuletzt = 0;

function tippRaum(a, b) {
  return "kt-tipp-" + [String(a), String(b)].sort().join("-");
}

function tippKanalZu() {
  if (_tippKanal) { try { supa.removeChannel(_tippKanal); } catch (e) { } _tippKanal = null; }
  _tippZiel = null;
  if (_tippUhr) { clearTimeout(_tippUhr); _tippUhr = null; }
}

async function tippKanalAuf(partnerId) {
  try {
    tippKanalZu();
    if (!window.supa) return;
    const u = await supaNutzer();
    if (!u) return;
    _tippZiel = partnerId;
    const k = supa.channel(tippRaum(u.id, partnerId), { config: { broadcast: { self: false } } });
    k.on("broadcast", { event: "tippt" }, p => {
      if (!p || !p.payload || p.payload.von !== partnerId) return;
      tippAnzeigen(true);
    });
    k.subscribe(() => {});
    _tippKanal = k;
  } catch (e) { /* die Anzeige darf nie den Chat stoeren */ }
}

function tippAnzeigen(an) {
  const z = document.getElementById("gp-tippt");
  if (!z) return;
  if (!an) { z.textContent = ""; z.classList.remove("da"); return; }
  const name = (typeof profilName === "function" && glockePartner)
    ? profilName(glockePartner.partnerId, glockePartner.username)
    : (glockePartner ? glockePartner.username : "");
  z.textContent = name + " schreibt gerade ...";
  z.classList.add("da");
  if (_tippUhr) clearTimeout(_tippUhr);
  // Nach drei Sekunden Stille wieder ausblenden.
  _tippUhr = setTimeout(() => tippAnzeigen(false), 3000);
}

// Beim Tippen hoechstens alle 1,5 Sekunden etwas hinausschicken.
async function tippMelden() {
  try {
    if (!_tippKanal || !glockePartner) return;
    const jetzt = Date.now();
    if (jetzt - _tippZuletzt < 1500) return;
    _tippZuletzt = jetzt;
    const u = await supaNutzer();
    if (!u) return;
    _tippKanal.send({ type: "broadcast", event: "tippt", payload: { von: u.id } });
  } catch (e) { }
}

async function glockeNachladen() {
  if (!glockePartner || !document.getElementById("gp-liste")) return;
  const u = await supaNutzer();
  const neue = await supaDmLaden(glockePartner.partnerId, glockeLetzteId || null);
  if (!neue.length) return;
  const box = document.getElementById("gp-liste");
  const key = await kryptoDm(glockePartner.partnerId);
  const nachzuladen = [];
  for (const n of neue) {
    glockeLetzteId = Math.max(glockeLetzteId, n.id);
    const z = document.createElement("div");
    const istMeine = n.von === u.id;
    z.className = "chatzeile" + (istMeine ? " vonmir" : "");
    // Wer hat das geschrieben? Bei mir steht "Du", beim anderen sein Name.
    const wer = document.createElement("span");
    wer.className = "gp-wer";
    wer.textContent = istMeine ? "Du" :
      ((typeof profilName === "function")
        ? profilName(glockePartner.partnerId, glockePartner.username)
        : glockePartner.username);
    const m = (typeof medienLesen === "function") ? medienLesen(n.text) : null;
    // Ist es ein Anhang (Kombination oder Person)? Dann eine Karte statt Text.
    const karte = (typeof anhangLesen === "function") ? anhangLesen(n.text) : null;
    const uhr = "<span class='mini'>" +
      new Date(n.created_at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) +
      "</span> ";
    if (karte) {
      z.innerHTML = uhr;
      z.appendChild(anhangKarteEl(karte));
    } else {
      const inhalt = m ? medienPlatzhalter(m)
        : n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      z.innerHTML = uhr + inhalt;
    }
    z.insertBefore(wer, z.firstChild);
    box.appendChild(z);
    if (m) nachzuladen.push(m);
  }
  for (const m of nachzuladen) medienNachladen(key, m);
  box.scrollTop = box.scrollHeight;
  localStorage.setItem("kt_dm_gelesen_" + glockePartner.partnerId, String(glockeLetzteId));
  glockeZaehlen();
}

async function glockeSenden() {
  const _e = document.getElementById("gp-eingabe");
  if (_e) _e.classList.remove("offen");
  const feld = document.getElementById("gp-text");
  const text = feld.value.trim();
  if (!text) return;
  const r = await supaDmSenden(glockePartner.partnerId, text, glockePartner.username);
  if (r.error) { alert("Nicht gesendet: " + r.error.message); return; }
  feld.value = "";
  glockeNachladen();
}

document.addEventListener("DOMContentLoaded", glockeStart);

// ---------- Medien senden (Ende-zu-Ende) ----------

async function glockeMedienSenden(blob, art, name) {
  if (!glockePartner) return;
  const u = await supaNutzer();
  const key = await kryptoDm(glockePartner.partnerId);
  const r = await medienHochladen(key, medienDmPfad(u.id, glockePartner.partnerId), blob, art, name);
  if (r.fehler) { alert("Nicht gesendet: " + r.fehler); return; }
  const s = await supaDmSenden(glockePartner.partnerId, r.text, glockePartner.username);
  if (s.error) { alert("Nicht gesendet: " + s.error.message); return; }
  glockeNachladen();
}

async function glockeDatei(input) {
  const datei = input.files && input.files[0];
  input.value = "";
  if (!datei) return;
  const art = datei.type.startsWith("image/") ? "bild" : "datei";
  await glockeMedienSenden(datei, art, datei.name);
}

async function glockeTon() {
  const knopf = document.getElementById("gp-ton");
  if (typeof aufnahmeStart !== "function") return;
  if (aufnahmeLaeuft() && !aufnahmeLaeuft("gp-ton")) { alert("Es laeuft schon eine andere Aufnahme."); return; }
  if (aufnahmeLaeuft("gp-ton")) {
    const blob = await aufnahmeStopp();
    if (knopf) { knopf.innerHTML = "&#127908; Sprachnachricht"; knopf.classList.remove("aufnahme"); }
    if (blob && blob.size) await glockeMedienSenden(blob, "ton", "Sprachnachricht.webm");
    return;
  }
  const s = await aufnahmeStart("ton", "gp-ton");
  if (s.fehler) { alert(s.fehler); return; }
  if (knopf) { knopf.textContent = "Stopp und senden"; knopf.classList.add("aufnahme"); }
}

async function glockeVideo() {
  const knopf = document.getElementById("gp-video");
  const schau = document.getElementById("gp-vorschau");
  if (typeof aufnahmeStart !== "function") return;
  if (aufnahmeLaeuft() && !aufnahmeLaeuft("gp-video")) { alert("Es laeuft schon eine andere Aufnahme."); return; }
  if (aufnahmeLaeuft("gp-video")) {
    const blob = await aufnahmeStopp();
    if (knopf) { knopf.innerHTML = "&#128249; Video"; knopf.classList.remove("aufnahme"); }
    if (schau) schau.innerHTML = "";
    if (blob && blob.size) await glockeMedienSenden(blob, "video", "Video.webm");
    return;
  }
  const s = await aufnahmeStart("video", "gp-video");
  if (s.fehler) { alert(s.fehler); return; }
  if (knopf) { knopf.textContent = "Stopp und senden"; knopf.classList.add("aufnahme"); }
  if (schau) {
    schau.innerHTML = '<video id="gp-live" autoplay muted class="medienvideo"></video>';
    document.getElementById("gp-live").srcObject = s.stream;
  }
}

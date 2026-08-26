// ============================================================
// MEIN BEREICH: Konto, Bereiche, Teilen, Chat.
// Braucht supa.js. Rein fuer mein.html.
// ============================================================
"use strict";

let ich = null;                 // {id, username}
let aktiverBereich = null;      // {id, username, rolle}  rolle: "ich" | "close" | "friend"
let meineBereiche = [];
let chatTimer = null;
let letzteChatId = 0;

function el(id) { return document.getElementById(id); }
function rundM(x) { return Math.round(x * 100) / 100; }
function markeM(kz) {
  const namen = { iw: "Interwetten", bw: "Bwin", b3: "Bet365", st: "Stake" };
  return '<span class="marke m-' + kz + '">' + (namen[kz] || kz) + "</span>";
}
function meldungM(text, art) {
  const box = el("meldung");
  box.className = (art === "warn") ? "warnkern" : "merk";
  box.innerHTML = text;
  box.style.display = "block";
}
function zeitM(iso) {
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    ". " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ---------- Start ----------

async function startMein() {
  if (!window.supa) {
    el("inhalt").innerHTML = '<div class="warnkern">Die Datenbank-Bibliothek konnte nicht laden. ' +
      "Bitte Seite neu laden; wenn es bleibt, sag Claude Bescheid.</div>";
    return;
  }
  // Passwort-Reset-Ruecksprung?
  if (location.hash.includes("type=recovery")) { zeigePasswortNeu(); return; }
  const profil = await supaMeinProfil();
  const nutzer = await supaNutzer();
  if (!nutzer) { zeigeAnmeldung(); return; }
  if (!profil) { zeigeUsernameWahl(); return; }
  ich = profil;
  await zeigeApp();
}

// ---------- Anmelden / Registrieren ----------

function augeHtml(feldId) {
  return '<button type="button" class="auge" onclick="var f=document.getElementById(\'' + feldId +
    '\'); f.type = (f.type === \'password\') ? \'text\' : \'password\'; ' +
    'this.textContent = (f.type === \'password\') ? \'zeigen\' : \'verbergen\';">zeigen</button>';
}

function zeigeAnmeldung() {
  el("inhalt").innerHTML = `
<div class="auth">
  <div class="auth-kasten">
    <h2>Anmelden</h2>
    <label>Benutzername oder E-Mail<br><input id="an_user" autocomplete="username"></label>
    <label>Passwort<br><input id="an_pw" type="password" autocomplete="current-password"> ${augeHtml("an_pw")}</label>
    <button class="haupt" onclick="tuAnmelden()">Anmelden</button>
    <div class="mini"><a href="#" onclick="tuVergessen(); return false;">Passwort vergessen?</a></div>
  </div>
  <div class="auth-kasten">
    <h2>Neues Konto</h2>
    <label>Benutzername<br><input id="reg_user" autocomplete="username"></label>
    <label>E-Mail <span class="mini">(nur fuers Passwort-Zuruecksetzen, keine Bestaetigung noetig)</span><br>
      <input id="reg_mail" type="email" autocomplete="email"></label>
    <label>Passwort <span class="mini">(mindestens 6 Zeichen)</span><br>
      <input id="reg_pw" type="password" autocomplete="new-password"> ${augeHtml("reg_pw")}</label>
    <button class="haupt" onclick="tuRegistrieren()">Konto anlegen</button>
  </div>
</div>
<p class="mini">Dein Bereich ist privat. Nur wer ihn von dir geteilt bekommt, kann ihn sehen.
Alle anderen Seiten (Tafel, Kombi-Bau, Schule) brauchen kein Konto.</p>`;
}

async function tuAnmelden() {
  const r = await supaAnmelden(el("an_user").value, el("an_pw").value);
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  location.reload();
}

async function tuRegistrieren() {
  const r = await supaRegistrieren(el("reg_user").value.trim(), el("reg_mail").value.trim(), el("reg_pw").value);
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  location.reload();
}

async function tuVergessen() {
  const mail = prompt("Deine E-Mail-Adresse (die vom Konto):");
  if (!mail) return;
  const r = await supaPasswortVergessen(mail.trim());
  meldungM(r.fehler ? r.fehler :
    "Wenn die E-Mail ein Konto hat, ist ein Link zum Zuruecksetzen unterwegs. " +
    "Schau auch im Spam-Ordner.", r.fehler ? "warn" : "gut");
}

function zeigePasswortNeu() {
  el("inhalt").innerHTML = `
<div class="auth"><div class="auth-kasten">
  <h2>Neues Passwort setzen</h2>
  <label>Neues Passwort<br><input id="neu_pw" type="password"> ${augeHtml("neu_pw")}</label>
  <button class="haupt" onclick="tuPasswortNeu()">Speichern</button>
</div></div>`;
}

async function tuPasswortNeu() {
  const r = await supaPasswortNeu(el("neu_pw").value);
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  history.replaceState(null, "", location.pathname);
  meldungM("Passwort geaendert. Du bist angemeldet.", "gut");
  startMein();
}

function zeigeUsernameWahl() {
  el("inhalt").innerHTML = `
<div class="auth"><div class="auth-kasten">
  <h2>Benutzernamen waehlen</h2>
  <p class="mini">Dein Konto existiert, hat aber noch keinen Benutzernamen.</p>
  <label>Benutzername<br><input id="uw_user"></label>
  <button class="haupt" onclick="tuUsernameSetzen()">Speichern</button>
</div></div>`;
}

async function tuUsernameSetzen() {
  const name = el("uw_user").value.trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) { meldungM("3 bis 24 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich.", "warn"); return; }
  const u = await supaNutzer();
  const r = await supa.from("kt_profiles").insert({ id: u.id, username: name });
  if (r.error) { meldungM("Name vergeben oder ungueltig.", "warn"); return; }
  location.reload();
}

// ---------- Die App ----------

async function zeigeApp() {
  const geteilt = await supaBereicheFuerMich();
  meineBereiche = [{ id: ich.id, username: ich.username, rolle: "ich" }]
    .concat(geteilt.map(g => ({ id: g.owner, username: g.kt_profiles.username, rolle: g.rolle })));
  if (!aktiverBereich) aktiverBereich = meineBereiche[0];

  el("inhalt").innerHTML = `
<div class="kopfzeile">Angemeldet als <b>${ich.username}</b>
  <button onclick="supaAbmelden().then(()=>location.reload())">Abmelden</button></div>
<div id="bereichtabs" class="navleiste"></div>
<div id="freunde"></div>
<div id="teilen"></div>
<div id="importkasten"></div>
<h2>Konto dieses Bereichs</h2>
<div id="konto_db"></div>
<h2 id="scheine_titel">Kombinationen</h2>
<div id="scheine_db"></div>
<h2>Chat dieses Bereichs</h2>
<p class="mini">Alle, die diesen Bereich sehen koennen, koennen hier schreiben. So benachrichtigt
ihr euch gegenseitig; die Zahl am Bereichs-Knopf oben zeigt neue Nachrichten.</p>
<div id="chatliste" class="chatliste"></div>
<div class="chateingabe"><input id="chat_text" placeholder="Nachricht..."
  onkeydown="if(event.key==='Enter')tuChatSenden()">
  <button class="haupt" onclick="tuChatSenden()">Senden</button></div>`;

  await zeichneTabs();
  await zeichneFreunde();
  await zeichneTeilen();
  zeichneImport();
  await zeichneBereich();
}

async function zeichneTabs() {
  const box = el("bereichtabs");
  box.innerHTML = "";
  for (const b of meineBereiche) {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "navknopf" + (b.id === aktiverBereich.id ? " aktiv" : "");
    const neu = await neueNachrichten(b.id);
    a.innerHTML = (b.rolle === "ich" ? "Mein Bereich" : "Bereich von " + b.username) +
      (b.rolle === "friend" ? ' <span class="mini">(nur lesen)</span>' : "") +
      (b.rolle === "close" ? ' <span class="mini">(mitarbeiten)</span>' : "") +
      (neu > 0 ? ' <span class="badge">' + neu + "</span>" : "");
    a.onclick = (ev) => { ev.preventDefault(); aktiverBereich = b; zeigeApp(); };
    box.appendChild(a);
  }
}

async function neueNachrichten(bereichId) {
  const gelesen = parseInt(localStorage.getItem("kt_gelesen_" + bereichId) || "0", 10);
  const r = await supa.from("kt_nachrichten").select("id", { count: "exact", head: true })
    .eq("bereich", bereichId).gt("id", gelesen);
  return r.count || 0;
}

// ---------- Freunde und Direktnachrichten ----------

let dmPartner = null;
let dmTimer = null;
let letzteDmId = 0;

async function zeichneFreunde() {
  const box = el("freunde");
  const kontakte = await supaKontakteLaden();
  let knoepfe = "";
  for (const k of kontakte) {
    const gelesen = parseInt(localStorage.getItem("kt_dm_gelesen_" + k.partnerId) || "0", 10);
    const r = await supa.from("kt_direkt").select("id", { count: "exact", head: true })
      .eq("an", ich.id).eq("von", k.partnerId).gt("id", gelesen);
    const neu = r.count || 0;
    knoepfe += '<button class="freundknopf' + (dmPartner && dmPartner.partnerId === k.partnerId ? " aktiv" : "") +
      '" onclick="tuDmOeffnen(\'' + k.partnerId + "','" + k.username + '\')">' + k.username +
      (neu ? ' <span class="badge">' + neu + "</span>" : "") + "</button> ";
  }
  box.innerHTML = '<details open><summary>Freunde und Nachrichten (anklicken)</summary><div class="inhalt">' +
    '<p class="mini">Freunde adden geht OHNE deinen Bereich zu teilen: ihr koennt euch dann ' +
    "Direktnachrichten schicken. Teilen kannst du danach immer noch, musst du aber nicht.</p>" +
    '<input id="freund_user" placeholder="Benutzername"> ' +
    '<button class="haupt" onclick="tuFreundAdden()">Als Freund adden</button>' +
    (kontakte.length ? "<p><b>Deine Freunde:</b> " + knoepfe + "</p>" : "") +
    '<div id="dmfenster"></div></div></details>';
  if (dmPartner) zeichneDmFenster();
}

async function tuFreundAdden() {
  const r = await supaKontaktAdden(el("freund_user").value.trim());
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  meldungM("<b>" + r.profil.username + "</b> ist jetzt dein Freund. Ihr koennt euch schreiben.", "gut");
  zeichneFreunde();
}

function tuDmOeffnen(partnerId, username) {
  dmPartner = { partnerId: partnerId, username: username };
  letzteDmId = 0;
  zeichneFreunde();
}

function zeichneDmFenster() {
  el("dmfenster").innerHTML = "<h3>Nachrichten mit " + dmPartner.username +
    ' <button onclick="tuFreundWeg()">Freund entfernen</button></h3>' +
    '<div id="dmliste" class="chatliste"></div>' +
    '<div class="chateingabe"><input id="dm_text" placeholder="Nachricht an ' + dmPartner.username + '..." ' +
    "onkeydown=\"if(event.key==='Enter')tuDmSenden()\">" +
    '<button class="haupt" onclick="tuDmSenden()">Senden</button></div>';
  ladeDm(true);
  if (dmTimer) clearInterval(dmTimer);
  dmTimer = setInterval(() => ladeDm(false), 10000);
}

async function ladeDm(komplett) {
  if (!dmPartner || !el("dmliste")) return;
  if (komplett) { letzteDmId = 0; el("dmliste").innerHTML = ""; }
  const neue = await supaDmLaden(dmPartner.partnerId, letzteDmId || null);
  if (!neue.length) return;
  const box = el("dmliste");
  for (const n of neue) {
    letzteDmId = Math.max(letzteDmId, n.id);
    const zeile = document.createElement("div");
    zeile.className = "chatzeile" + (n.von === ich.id ? " vonmir" : "");
    zeile.innerHTML = "<b>" + (n.von === ich.id ? ich.username : dmPartner.username) + "</b> " +
      "<span class='mini'>" + zeitM(n.created_at) + "</span><br>" +
      n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    box.appendChild(zeile);
  }
  box.scrollTop = box.scrollHeight;
  localStorage.setItem("kt_dm_gelesen_" + dmPartner.partnerId, String(letzteDmId));
}

async function tuDmSenden() {
  const feld = el("dm_text");
  const text = feld.value.trim();
  if (!text) return;
  const r = await supaDmSenden(dmPartner.partnerId, text);
  if (r.error) { meldungM("Nicht gesendet: " + r.error.message, "warn"); return; }
  feld.value = "";
  ladeDm(false);
}

async function tuFreundWeg() {
  await supaKontaktEntfernen(dmPartner.partnerId);
  dmPartner = null;
  if (dmTimer) clearInterval(dmTimer);
  zeichneFreunde();
  meldungM("Freund entfernt.", "gut");
}

// ---------- Teilen ----------

async function zeichneTeilen() {
  const box = el("teilen");
  if (aktiverBereich.rolle !== "ich") { box.innerHTML = ""; return; }
  const liste = await supaFreigabenVonMir();
  let html = '<details><summary>Bereich teilen (anklicken)</summary><div class="inhalt">' +
    '<p class="mini">Such den Benutzernamen und waehle: <b>Mitarbeiten</b> (Close Friend, darf ' +
    "alles wie du) oder <b>Nur zuschauen</b> (Friend, darf lesen und kopieren).</p>" +
    '<input id="teilen_user" placeholder="Benutzername"> ' +
    '<select id="teilen_rolle"><option value="close">Mitarbeiten (Close Friend)</option>' +
    '<option value="friend">Nur zuschauen (Friend)</option></select> ' +
    '<button class="haupt" onclick="tuTeilen()">Teilen</button>';
  if (liste.length) {
    html += "<table><thead><tr><th>Geteilt mit</th><th>Rolle</th><th></th></tr></thead><tbody>";
    for (const f of liste) {
      html += "<tr><td><b>" + f.kt_profiles.username + "</b></td>" +
        "<td><select onchange=\"tuRolle('" + f.gast + "', this.value)\">" +
        '<option value="close"' + (f.rolle === "close" ? " selected" : "") + ">Mitarbeiten</option>" +
        '<option value="friend"' + (f.rolle === "friend" ? " selected" : "") + ">Nur zuschauen</option></select></td>" +
        "<td><button onclick=\"tuTeilenEnde('" + f.gast + "')\">nicht mehr teilen</button></td></tr>";
    }
    html += "</tbody></table>";
  }
  box.innerHTML = html + "</div></details>";
}

async function tuTeilen() {
  const name = el("teilen_user").value.trim();
  const p = await supaProfilSuchen(name);
  if (!p) { meldungM("Benutzer \"" + name + "\" nicht gefunden. Genau so schreiben, wie er heisst.", "warn"); return; }
  if (p.id === ich.id) { meldungM("Mit dir selbst musst du nicht teilen.", "warn"); return; }
  const r = await supaTeilen(p.id, el("teilen_rolle").value);
  if (r.error) { meldungM("Teilen fehlgeschlagen: " + r.error.message, "warn"); return; }
  meldungM("Geteilt mit <b>" + p.username + "</b>. Der Bereich taucht ab sofort in dessen Konto auf.", "gut");
  zeichneTeilen();
}

async function tuRolle(gastId, rolle) { await supaTeilen(gastId, rolle); meldungM("Rolle geaendert.", "gut"); }
async function tuTeilenEnde(gastId) { await supaTeilenBeenden(gastId); zeichneTeilen(); meldungM("Teilen beendet.", "gut"); }

// ---------- Lokale Scheine uebernehmen ----------

function zeichneImport() {
  const box = el("importkasten");
  let lokal = [];
  try { lokal = JSON.parse(localStorage.getItem("verlauf") || "[]"); } catch (e) {}
  if (aktiverBereich.rolle !== "ich" || !lokal.length) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="kern">Auf diesem Geraet liegen noch <b>' + lokal.length +
    " lokal gespeicherte Scheine</b> aus der Zeit ohne Konto. " +
    '<button class="haupt" onclick="tuImport()">In mein Konto uebernehmen</button></div>';
}

async function tuImport() {
  let lokal = [];
  try { lokal = JSON.parse(localStorage.getItem("verlauf") || "[]"); } catch (e) {}
  let ok = 0;
  for (const e of lokal) {
    const foto = e.scheinId ? localStorage.getItem("foto_" + e.scheinId) : null;
    const fotoName = e.scheinId ? localStorage.getItem("foto_" + e.scheinId + "_name") : null;
    const r = await supaScheinAnlegen(ich.id,
      { zeit: e.zeit, kz: e.kz, anbieter: e.anbieter, einsatz: e.einsatz, quote: e.quote,
        moeglich: e.moeglich, wetten: e.wetten, stand: e.stand, notiz: e.notiz || "" },
      foto, fotoName);
    if (!r.error) ok++;
  }
  if (ok === lokal.length) {
    localStorage.removeItem("verlauf");
    meldungM("Alle " + ok + " Scheine uebernommen und lokal aufgeraeumt.", "gut");
  } else {
    meldungM("Nur " + ok + " von " + lokal.length + " uebernommen; die lokalen bleiben zur Sicherheit liegen.", "warn");
  }
  zeigeApp();
}

// ---------- Scheine des Bereichs ----------

function darfSchreiben() { return aktiverBereich.rolle === "ich" || aktiverBereich.rolle === "close"; }

async function zeichneBereich() {
  el("scheine_titel").textContent = (aktiverBereich.rolle === "ich")
    ? "Meine Kombinationen" : "Kombinationen von " + aktiverBereich.username;
  const scheine = await supaScheineLaden(aktiverBereich.id);
  zeichneKontoDb(scheine);
  zeichneScheineDb(scheine);
  await ladeChat(true);
  if (chatTimer) clearInterval(chatTimer);
  chatTimer = setInterval(() => ladeChat(false), 10000);
}

function zeichneKontoDb(scheine) {
  const konto = {};
  for (const s of scheine) {
    const kz = s.daten.kz;
    konto[kz] = konto[kz] || { n: 0, offen: 0, gew: 0, ver: 0, ein: 0, imSpiel: 0, zur: 0 };
    const k = konto[kz];
    k.n++; k.ein += s.daten.einsatz || 0;
    if (s.stand === "offen") { k.offen++; k.imSpiel += s.daten.einsatz || 0; }
    else if (s.stand === "gewonnen") { k.gew++; k.zur += s.daten.moeglich || 0; }
    else k.ver++;
  }
  const kz_ = Object.keys(konto);
  if (!kz_.length) { el("konto_db").innerHTML = '<p class="mini">Noch keine Scheine in diesem Bereich.</p>'; return; }
  let gEin = 0, gZur = 0, gSpiel = 0, gGew = 0, gVer = 0, gN = 0, gOffen = 0;
  let html = "<table><thead><tr><th>Anbieter</th><th>Scheine</th><th>offen</th><th>gewonnen</th>" +
    "<th>verloren</th><th>eingesetzt</th><th>zurueck</th><th>Saldo</th><th>im Spiel</th></tr></thead><tbody>";
  for (const kz of kz_) {
    const k = konto[kz];
    const saldo = k.zur - (k.ein - k.imSpiel);
    gEin += k.ein; gZur += k.zur; gSpiel += k.imSpiel; gGew += k.gew; gVer += k.ver; gN += k.n; gOffen += k.offen;
    html += "<tr><td>" + markeM(kz) + "</td><td>" + k.n + "</td><td>" + k.offen + "</td>" +
      "<td class='gruen'>" + k.gew + "</td><td class='rot'>" + k.ver + "</td>" +
      "<td>" + k.ein.toFixed(2) + " &euro;</td><td>" + k.zur.toFixed(2) + " &euro;</td>" +
      "<td class='" + (saldo >= 0 ? "e-gew" : "e-ver") + "'><b>" + (saldo >= 0 ? "+" : "") + saldo.toFixed(2) + " &euro;</b></td>" +
      "<td>" + k.imSpiel.toFixed(2) + " &euro;</td></tr>";
  }
  const gSaldo = gZur - (gEin - gSpiel);
  html += "</tbody><tfoot><tr><td><b>Gesamt</b></td><td><b>" + gN + "</b></td><td><b>" + gOffen + "</b></td>" +
    "<td class='gruen'><b>" + gGew + "</b></td><td class='rot'><b>" + gVer + "</b></td>" +
    "<td><b>" + gEin.toFixed(2) + " &euro;</b></td><td><b>" + gZur.toFixed(2) + " &euro;</b></td>" +
    "<td class='" + (gSaldo >= 0 ? "e-gew" : "e-ver") + "'><b>" + (gSaldo >= 0 ? "+" : "") + gSaldo.toFixed(2) + " &euro;</b></td>" +
    "<td><b>" + gSpiel.toFixed(2) + " &euro;</b></td></tr></tfoot></table>";
  el("konto_db").innerHTML = html;
}

function zeichneScheineDb(scheine) {
  if (!scheine.length) { el("scheine_db").innerHTML = '<p class="mini">Noch keine Scheine hier. ' +
    'Im <a href="kombis.html">Kombi-Bau</a> Scheine bauen und "In den Verlauf" druecken.</p>'; return; }
  const schreib = darfSchreiben();
  let html = "<table><thead><tr><th>Wann</th><th>Anbieter</th><th>Wetten</th><th>Quote</th>" +
    "<th>Einsatz</th><th>Moeglich</th><th>Stand</th><th>Notiz</th><th></th></tr></thead><tbody>";
  for (const s of scheine) {
    const d = s.daten;
    html += "<tr><td class='mini'>" + zeitM(s.created_at) + "</td><td>" + markeM(d.kz) + "</td>" +
      "<td class='mini'>" + (d.wetten || []).map(t => t.spiel + " (" + t.linie + ")").join("<br>") +
      (s.foto ? '<div class="fotoname mini">' + (s.foto_name || "") + "</div>" +
        '<div><img src="' + s.foto + '" class="minifoto"></div>' : "") + "</td>" +
      "<td><b>" + (d.quote || 0).toFixed(2) + "</b></td><td>" + (d.einsatz || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + (d.moeglich || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + (schreib
        ? "<select onchange=\"tuStand('" + s.id + "', this.value)\">" +
          ["offen", "gewonnen", "verloren"].map(o => "<option" + (s.stand === o ? " selected" : "") + ">" + o + "</option>").join("") + "</select>"
        : s.stand) + "</td>" +
      "<td class='notizzelle'>" + (schreib
        ? "<textarea class='notizfeld' onchange=\"tuNotiz('" + s.id + "', this.value)\">" + (s.notiz || "") + "</textarea>"
        : "<span class='mini'>" + (s.notiz || "") + "</span>") + "</td>" +
      "<td>" + (aktiverBereich.rolle !== "ich"
        ? "<button onclick=\"tuKopieren('" + s.id + "')\">zu mir kopieren</button> " : "") +
        (schreib ? "<button onclick=\"tuLoeschen('" + s.id + "')\">weg</button>" : "") + "</td></tr>";
  }
  el("scheine_db").innerHTML = html + "</tbody></table>";
}

async function tuStand(id, wert) {
  const r = await supaScheinAendern(id, { stand: wert });
  if (r.error) { meldungM("Nicht erlaubt: " + r.error.message, "warn"); return; }
  const scheine = await supaScheineLaden(aktiverBereich.id);
  zeichneKontoDb(scheine);
}

async function tuNotiz(id, wert) {
  const r = await supaScheinAendern(id, { notiz: wert });
  if (r.error) meldungM("Notiz nicht gespeichert: " + r.error.message, "warn");
}

async function tuLoeschen(id) {
  await supaScheinLoeschen(id);
  zeichneBereich();
}

async function tuKopieren(id) {
  const scheine = await supaScheineLaden(aktiverBereich.id);
  const s = scheine.find(x => x.id === id);
  if (!s) return;
  const r = await supaScheinAnlegen(ich.id, s.daten, s.foto, s.foto_name);
  meldungM(r.error ? "Kopieren fehlgeschlagen: " + r.error.message
    : "In deinen Bereich kopiert.", r.error ? "warn" : "gut");
}

// ---------- Chat ----------

async function ladeChat(komplett) {
  if (komplett) { letzteChatId = 0; el("chatliste").innerHTML = ""; }
  const neue = await supaNachrichtenLaden(aktiverBereich.id, letzteChatId || null);
  if (!neue.length) return;
  const box = el("chatliste");
  for (const n of neue) {
    letzteChatId = Math.max(letzteChatId, n.id);
    const wer = n.kt_profiles ? n.kt_profiles.username : "?";
    const zeile = document.createElement("div");
    zeile.className = "chatzeile" + (n.autor === ich.id ? " vonmir" : "");
    zeile.innerHTML = "<b>" + wer + "</b> <span class='mini'>" + zeitM(n.created_at) + "</span><br>" +
      n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    box.appendChild(zeile);
  }
  box.scrollTop = box.scrollHeight;
  localStorage.setItem("kt_gelesen_" + aktiverBereich.id, String(letzteChatId));
  zeichneTabs();
}

async function tuChatSenden() {
  const feld = el("chat_text");
  const text = feld.value.trim();
  if (!text) return;
  const r = await supaNachrichtSenden(aktiverBereich.id, text);
  if (r.error) { meldungM("Nachricht nicht gesendet: " + r.error.message, "warn"); return; }
  feld.value = "";
  ladeChat(false);
}

document.addEventListener("DOMContentLoaded", startMein);

// ============================================================
// MEIN BEREICH: Konto, Bereiche, Teilen, Chat.
// Braucht supa.js. Rein für mein.html.
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
    <label>E-Mail <span class="mini">(nur fürs Passwort-Zurücksetzen, keine Bestaetigung noetig)</span><br>
      <input id="reg_mail" type="email" autocomplete="email"></label>
    <label>Passwort <span class="mini">(mindestens 6 Zeichen)</span><br>
      <input id="reg_pw" type="password" autocomplete="new-password"> ${augeHtml("reg_pw")}</label>
    <button class="haupt" onclick="tuRegistrieren()">Konto anlegen</button>
  </div>
</div>
<p class="mini">Dein Bereich ist privat. Nur wer ihn von dir geteilt bekommt, kann ihn sehen.
Alle anderen Seiten (Tafel, Kombi-Bau, Handbuch) brauchen kein Konto.</p>`;
}

async function tuAnmelden() {
  const r = await supaAnmelden(el("an_user").value, el("an_pw").value);
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  if (r.hinweis) { alert(r.hinweis); }
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
    "Wenn die E-Mail ein Konto hat, ist ein Link zum Zurücksetzen unterwegs. " +
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
  meldungM("Passwort geändert. Du bist angemeldet.", "gut");
  startMein();
}

function zeigeUsernameWahl() {
  el("inhalt").innerHTML = `
<div class="auth"><div class="auth-kasten">
  <h2>Benutzernamen wählen</h2>
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
  binAdmin = await supaIstAdmin();
  const geteilt = await supaBereicheFuerMich();
  meineBereiche = [{ id: ich.id, username: ich.username, rolle: "ich" }]
    .concat(geteilt.map(g => ({ id: g.owner, username: g.kt_profiles.username, rolle: g.rolle })));
  if (!aktiverBereich) aktiverBereich = meineBereiche[0];

  el("inhalt").innerHTML = `
<div class="kopfzeile">Angemeldet als <b>${ich.username}</b>
  <button onclick="supaAbmelden().then(()=>location.reload())">Abmelden</button>
  <span id="benach_platz"></span>
  ${binAdmin ? ' <a href="admin.html" class="navknopf adminknopf">&#9881;&#65039; Admin-Bereich</a>' : ""}</div>
<details class="mini e2ehinweis"><summary>&#128274; Ende-zu-Ende verschlüsselt - was heisst das?</summary>
Nachrichten, Scheine, Personen-Namen, Notizen und Anmerkungen liegen nur verschlüsselt in der
Datenbank - lesbar allein für dich und die, denen du teilst. Wichtig: setzt du dein Passwort auf
einem NEUEN Gerät zurueck, sind alte Nachrichten dort nicht mehr lesbar. Reine Zahlenspalten der
Buchhaltung (Beträge, Daten) bleiben Zahlen, damit die Tabellen rechnen können.</details>
<div id="schluesselkasten"></div>
<div id="bereichtabs" class="navleiste"></div>
<div id="mb_navi" class="mb-navi"></div>

<div id="blk_kombis" class="mb-block">
<h2>&#128100; Personen</h2>
<p class="mini">Deine Personen: je ein Account oder ein Mensch, bei dem du Kombinationen
gesetzt hast. Jede Kombination gehört zu einer Person. <b>Nicht verwechseln:</b> die
Foto-Ordner oben auf der Kombi-Tafel sind für alle gleich und ändern sich nur, wenn ein
Admin neue Fotos bringt. Personen gehören nur dir.</p>
<div id="ordnerbox"></div>
<div id="personenkasse"></div>
<h2 id="scheine_titel">Kombinationen</h2>
<div id="scheine_db"></div>
<h2>&#127974; Konto dieses Bereichs</h2>
<div id="konto_db"></div>
<div id="importkasten"></div>
</div>

<div id="blk_buch" class="mb-block">
<div id="buchhaltung"></div>
</div>

<div id="blk_freunde" class="mb-block">
<div id="freunde"></div>
<div id="teilen"></div>
</div>

<div id="blk_chat" class="mb-block">
<h2>&#128172; Chat dieses Bereichs</h2>
<p class="mini">Alle, die diesen Bereich sehen können, können hier schreiben. So benachrichtigt
ihr euch gegenseitig; die Zahl am Bereichs-Knopf oben zeigt neue Nachrichten.</p>
<div id="chatliste" class="chatliste"></div>
<div class="chateingabe"><input id="chat_text" placeholder="Nachricht..."
  onkeydown="if(event.key==='Enter')tuChatSenden()">
  <button class="haupt" onclick="tuChatSenden()">Senden</button></div>
<div class="medienleiste">
  <label class="fotoknopf">&#128206; Datei<input type="file" style="display:none" onchange="tuChatDatei(this)"></label>
  <button id="bc-ton" onclick="tuChatTon()">&#127908; Sprachnachricht</button>
  <button id="bc-video" onclick="tuChatVideo()">&#128249; Video</button>
  <span id="bc-vorschau"></span>
</div>
</div>

<div id="blk_pruefen" class="mb-block">
<h2>&#128269; Nachrechnen</h2>
<p class="mini">Hier wird jede Zahl noch einmal nachgerechnet: passt die Gesamtquote zu den
Einzelquoten, ist die Gebühr des Anbieters wirklich abgezogen, hängt jede Kombination an einer
Person, stecken die Wetten noch im richtigen Foto-Ordner, und reicht das Geld, das die Person
eingezahlt hat, für das, was gesetzt wurde. Nichts davon wird geschätzt.</p>
<div id="pruefbericht"></div>
<h2>&#128193; Bilanz je Foto-Ordner</h2>
<p class="mini">Ein Foto-Ordner ist eine Lieferung Wettscheine. Hier siehst du pro Ordner
jeden Einsatz, wie er gespielt wurde, und wie viel Geld insgesamt hineingegangen ist.</p>
<div id="ordnerbilanz"></div>
</div>`;

  zeichneMbNavi();
  benachKnopf();
  pruefeSchluessel();
  await zeichneTabs();
  await zeichneFreunde();
  await zeichneTeilen();
  zeichneImport();
  await zeichneBereich();
  await zeichneBuchhaltung();
}

// ---------- Schlüssel auf diesem Gerät ----------
// Fehlen sie (neues Gerät, App neu installiert, Browser-Daten gelöscht),
// lässt sich hier nichts anlegen. Ein Passwort holt sie aus dem Safe zurück.

async function pruefeSchluessel(erzwingen) {
  const box = el("schluesselkasten");
  if (!box || !ich) return;
  // Automatik: das Gerät holt sich die Schlüssel selbst - ohne Passwort.
  if (typeof kryptoSicherstellen === "function") {
    const r = await kryptoSicherstellen();
    if (r.ok) {
      box.innerHTML = r.neu
        ? '<div class="kern mini">&#128273; Für dieses Gerät wurden neue Schlüssel angelegt. ' +
          "Alles funktioniert; nur ältere verschlüsselte Direktnachrichten von früher bleiben unlesbar.</div>"
        : "";
      if (erzwingen && r.ok) meldungM("Schlüssel sind da - bitte noch einmal versuchen.", "gut");
      return;
    }
    if (r.passwort) { schluesselPasswortKasten(box, erzwingen); return; }
  }
  // Alte Fassung im Zwischenspeicher: frisch laden anbieten
  const priv = localStorage.getItem("kt_e2e_priv_" + ich.id);
  if (priv) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="warnkern schluesselwarnung"><b>&#128274; Dein Gerät hat noch eine alte Fassung geladen.</b> ' +
    'Bitte einmal frisch laden: <button onclick="tuFrischLaden()">&#128260; Seite frisch laden</button></div>';
}

// Nur noch im Ausnahmefall: es gibt alte verschlüsselte Daten, aber keinen
// Server-Safe (Konto von vor der Automatik). Einmal Passwort, nie wieder.
function schluesselPasswortKasten(box, erzwingen) {
  box.innerHTML = '<div class="warnkern schluesselwarnung"><b>&#128274; Einmalig: Schlüssel freischalten.</b> ' +
    "Dein Konto stammt aus der Zeit vor der Schlüssel-Automatik. Gib einmal dein Passwort ein - " +
    "danach holt sich jedes Gerät die Schlüssel automatisch, und du wirst nie wieder gefragt.<br><br>" +
    '<input type="password" id="schluessel_pw" placeholder="Dein Passwort" autocomplete="current-password" ' +
    'onkeydown="if(event.key===\'Enter\')tuSchluesselNachtragen()"> ' +
    '<button class="haupt" onclick="tuSchluesselNachtragen()">&#128273; Freischalten</button></div>';
  if (erzwingen) {
    box.scrollIntoView({ block: "start" });
    const f = el("schluessel_pw");
    if (f) f.focus();
  }
}

function tuFrischLaden() {
  const seite = location.pathname.split("/").pop() || "mein.html";
  location.replace(seite + "?frisch=" + Date.now());
}

async function tuSchluesselNachtragen() {
  const pw = el("schluessel_pw") ? el("schluessel_pw").value : "";
  if (!pw) { meldungM("Bitte dein Passwort eintragen.", "warn"); return; }
  const r = await kryptoNachtragen(pw);
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  if (typeof kryptoSicherstellen === "function") await kryptoSicherstellen();
  meldungM("<b>Freigeschaltet.</b> Ab jetzt geht das automatisch - du wirst nicht mehr gefragt.", "gut");
  location.reload();
}

// ---------- Benachrichtigungen einschalten ----------

async function benachKnopf() {
  const platz = el("benach_platz");
  if (!platz || typeof pushStatus !== "function") return;
  const status = await pushStatus();
  // Frueher stand hier gruen "an", sobald der BROWSER eine Anmeldung hatte -
  // auch wenn in der Datenbank nichts stand und nie etwas ankam. Und bei
  // "geht nicht" wurde einfach gar nichts angezeigt (iPhone!).
  // Jetzt sagt jede Zeile die Wahrheit und bietet den passenden Weg an.
  if (status === "an") {
    platz.innerHTML = ' <span class="mini gruen">&#128276; Benachrichtigungen an</span> ' +
      '<button onclick="weckerPanelUmschalten()">Geraete und Probe</button>';
  } else if (status === "geht nicht") {
    platz.innerHTML = ' <span class="mini">&#128276; Dieser Browser kann keine Benachrichtigungen.</span>';
  } else if (status === "ios-install") {
    platz.innerHTML = ' <button onclick="weckerPanelUmschalten()">&#128276; iPhone: so kommen Meldungen an</button>';
  } else if (status === "gesperrt") {
    platz.innerHTML = ' <button onclick="weckerPanelUmschalten()">&#128276; Benachrichtigungen sind gesperrt - so geht es auf</button>';
  } else if (status === "unklar") {
    platz.innerHTML = ' <span class="mini">&#128276; Benachrichtigungen: nicht sicher</span> ' +
      '<button onclick="weckerPanelUmschalten()">nachsehen</button>';
  } else if (status === "halb") {
    platz.innerHTML = ' <button onclick="tuPushEinschalten()">&#128276; Benachrichtigungen reparieren</button>';
  } else {
    platz.innerHTML = ' <button onclick="tuPushEinschalten()">&#128276; Benachrichtigungen einschalten</button>';
  }
}

// Es gibt nur EINEN Weg zum Einschalten: den des Weckers. Sonst gaebe es
// fuer dieselbe Lage zwei verschiedene Antworten - der Wecker kennt zum
// Beispiel den iPhone-Fall und die Browser-Sperre, dieser Knopf frueher nicht.
async function tuPushEinschalten() {
  if (typeof weckerFrageJa === "function") { await weckerFrageJa(); benachKnopf(); return; }
  const r = await pushEinschalten();
  if (r.fehler) { meldungM("Nicht eingeschaltet: " + r.fehler, "warn"); return; }
  meldungM(r.nurLokal
    ? "Meldungen an, solange die App offen ist. Echtes Anklopfen bei geschlossener App kann dieser Browser nicht."
    : "<b>Benachrichtigungen an für dieses Gerät.</b> Du bekommst jetzt eine Meldung bei neuen " +
      "Nachrichten und Anrufen - auch wenn die App zu ist. Am besten auf JEDEM Gerät einmal einschalten " +
      "(Laptop und Handy).", "gut");
  benachKnopf();
}

// ---------- Die vier Blöcke von Mein Bereich ----------
// Immer nur EIN Block sichtbar - das entwirrt die Seite (Karams Wunsch
// vom 26.08.). Der zuletzt offene Block wird gemerkt.

const MB_BLOECKE = [
  ["kombis", "&#127919; Kombinationen und Personen"],
  ["buch", "&#128210; Buchhaltung"],
  ["freunde", "&#128101; Freunde und Teilen"],
  ["chat", "&#128172; Chat"],
  ["pruefen", "&#128269; Nachrechnen"]
];

function mbAktiverBlock() {
  const b = localStorage.getItem("kt_mb_block") || "kombis";
  return MB_BLOECKE.some(x => x[0] === b) ? b : "kombis";
}

function mbBlockZeigen(kurz) {
  localStorage.setItem("kt_mb_block", kurz);
  for (const [k] of MB_BLOECKE) {
    const blk = el("blk_" + k);
    if (blk) blk.classList.toggle("offen", k === kurz);
  }
  const navi = el("mb_navi");
  if (navi) for (const knopf of navi.querySelectorAll("button")) {
    knopf.classList.toggle("aktiv", knopf.dataset.blk === kurz);
  }
}

function zeichneMbNavi() {
  const navi = el("mb_navi");
  if (!navi) return;
  navi.innerHTML = MB_BLOECKE.map(([k, titel]) =>
    '<button data-blk="' + k + '" onclick="mbBlockZeigen(\'' + k + '\')">' + titel + "</button>").join("");
  mbBlockZeigen(mbAktiverBlock());
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
    '<p class="mini">Freunde adden geht OHNE deinen Bereich zu teilen: ihr könnt euch dann ' +
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
  meldungM("<b>" + r.profil.username + "</b> ist jetzt dein Freund. Ihr könnt euch schreiben.", "gut");
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
  const dmKey = await kryptoDm(dmPartner.partnerId);
  const nachzuladen = [];
  for (const n of neue) {
    letzteDmId = Math.max(letzteDmId, n.id);
    const zeile = document.createElement("div");
    zeile.className = "chatzeile" + (n.von === ich.id ? " vonmir" : "");
    const m = (typeof medienLesen === "function") ? medienLesen(n.text) : null;
    zeile.innerHTML = "<b>" + (n.von === ich.id ? ich.username : dmPartner.username) + "</b> " +
      "<span class='mini'>" + zeitM(n.created_at) + "</span><br>" +
      (m ? medienPlatzhalter(m) : n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    box.appendChild(zeile);
    if (m) nachzuladen.push(m);
  }
  for (const m of nachzuladen) medienNachladen(dmKey, m);
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
    '<p class="mini">Such den Benutzernamen und wähle: <b>Mitarbeiten</b> (Close Friend, darf ' +
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
  if (r.ohneSchluessel) {
    meldungM("Geteilt mit <b>" + p.username + "</b> - aber OHNE Verschlüsselungs-Schlüssel: " +
      "er hat sich noch nie mit der neuen Version angemeldet. Sobald er das getan hat, hier " +
      "einfach noch einmal Teilen drücken, dann kann er alles lesen.", "warn");
  } else {
    meldungM("Geteilt mit <b>" + p.username + "</b> - samt Schlüssel, Ende-zu-Ende. " +
      "Der Bereich taucht ab sofort in dessen Konto auf.", "gut");
  }
  zeichneTeilen();
}

async function tuRolle(gastId, rolle) { await supaTeilen(gastId, rolle); meldungM("Rolle geändert.", "gut"); }
async function tuTeilenEnde(gastId) { await supaTeilenBeenden(gastId); zeichneTeilen(); meldungM("Teilen beendet.", "gut"); }

// ---------- Lokale Scheine übernehmen ----------

function zeichneImport() {
  const box = el("importkasten");
  let lokal = [];
  try { lokal = JSON.parse(localStorage.getItem("verlauf") || "[]"); } catch (e) {}
  if (aktiverBereich.rolle !== "ich" || !lokal.length) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="kern">Auf diesem Gerät liegen noch <b>' + lokal.length +
    " lokal gespeicherte Scheine</b> aus der Zeit ohne Konto. " +
    '<button class="haupt" onclick="tuImport()">In mein Konto übernehmen</button></div>';
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
    meldungM("Alle " + ok + " Scheine übernommen und lokal aufgeraeumt. Sie liegen unter " +
      "\"ohne Person\" - bitte in der Tabelle den Personen zuordnen.", "gut");
  } else {
    meldungM("Nur " + ok + " von " + lokal.length + " übernommen; die lokalen bleiben zur Sicherheit liegen.", "warn");
  }
  zeigeApp();
}

// ---------- Scheine des Bereichs ----------

function darfSchreiben() { return aktiverBereich.rolle === "ich" || aktiverBereich.rolle === "close"; }

// ---------- Konto-Ordner ----------

let ordnerListe = [];
let ordnerFilter = "alle";

function textSicherM(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function ordnerNameM(id) {
  const o = ordnerListe.find(x => x.id === id);
  return o ? o.name : null;
}

function zeichneOrdnerBox(scheine) {
  const box = el("ordnerbox");
  if (!box) return;
  const zahl = {};
  const wartend = {};
  let ohne = 0, ohneWartend = 0;
  for (const s of scheine) {
    const fertig = scheinWartet(s);
    if (s.ordner) {
      zahl[s.ordner] = (zahl[s.ordner] || 0) + 1;
      if (fertig) wartend[s.ordner] = (wartend[s.ordner] || 0) + 1;
    } else {
      ohne++;
      if (fertig) ohneWartend++;
    }
  }
  const schreib = darfSchreiben();

  let filter = '<div class="ordnerfilter">' +
    '<button class="' + (ordnerFilter === "alle" ? "aktiv" : "") + '" onclick="tuOrdnerFilter(\'alle\')">Alle (' + scheine.length + ")</button> ";
  let irgendwoWarnung = false;
  for (const o of ordnerListe) {
    const warn = personPruefen(o.id, scheine).probleme.length > 0;
    if (warn) irgendwoWarnung = true;
    filter += '<button class="' + (ordnerFilter === o.id ? "aktiv" : "") + '" onclick="tuOrdnerFilter(\'' + o.id + '\')">' +
      textSicherM(o.name) + " (" + (zahl[o.id] || 0) + ")" +
      (wartend[o.id] ? ' <span class="fertigbadge">' + wartend[o.id] + ' fertig</span>' : "") +
      (warn ? ' <span class="warnbadge">!</span>' : "") + "</button> ";
  }
  filter += '<button class="' + (ordnerFilter === "ohne" ? "aktiv" : "") + '" onclick="tuOrdnerFilter(\'ohne\')">Ohne Person (' + ohne + ")" +
    (ohneWartend ? ' <span class="fertigbadge">' + ohneWartend + ' fertig</span>' : "") + "</button></div>";

  // Klare Personen-Uebersicht: eine Zeile je Person, alles auf einen Blick
  let verwalten = "";
  if (schreib) {
    verwalten = '<p><input id="ordner_neu" placeholder="Neue Person, z. B. ein Name"> ' +
      '<button class="haupt" onclick="tuOrdnerAnlegen()">Person hinzufügen</button></p>';
  }
  if (ordnerListe.length) {
    verwalten += "<table><thead><tr><th>Person</th><th>Kombis</th><th>Einsatz gesamt</th>" +
      "<th>fertig</th><th>Erhalten</th><th>Eingezahlt</th><th>Gewonnen</th><th></th></tr></thead><tbody>";
    for (const o of ordnerListe) {
      const n = zahl[o.id] || 0;
      const kasseN = personBuchungen.filter(b => b.ordner === o.id).length;
      const p = personPruefen(o.id, scheine);
      const warn = p.probleme.length > 0;
      let tasten = '<button onclick="tuOrdnerFilter(\'' + o.id + '\')">öffnen</button>';
      if (schreib) {
        tasten += ' <button onclick="tuOrdnerUmbenennen(\'' + o.id + '\')">umbenennen</button>' +
          ((n === 0 && kasseN === 0)
            ? ' <button onclick="tuOrdnerLoeschen(\'' + o.id + '\')">löschen</button>'
            : ' <span class="mini">löschen erst wenn leer</span>');
      }
      verwalten += "<tr" + (ordnerFilter === o.id ? " class='fertigzeile'" : "") + "><td>" +
        (schreib ? '<input id="ob_neu_' + o.id + '" value="' + textSicherM(o.name) + '" size="16">'
                 : "<b>" + textSicherM(o.name) + "</b>") + "</td>" +
        "<td>" + n + "</td>" +
        "<td>" + personEinsatz(o.id, scheine).toFixed(2) + " &euro;</td>" +
        "<td>" + (wartend[o.id] ? '<span class="fertigbadge">' + wartend[o.id] + ' fertig</span>' : "-") + "</td>" +
        "<td>" + p.erhaltengesamt.toFixed(2) + " &euro;</td>" +
        "<td>" + p.eingesamt.toFixed(2) + " &euro;" +
          (warn ? ' <span class="warnbadge">!</span>' : "") + "</td>" +
        "<td>" + personGewinn(o.id, scheine).toFixed(2) + " &euro;</td>" +
        "<td>" + tasten + "</td></tr>";
    }
    verwalten += "</tbody></table>";
  }
  const wartendGesamt = Object.values(wartend).reduce((p, x) => p + x, 0) + ohneWartend;
  // Erinnerung aufs Gerät: fertige Scheine warten auf dein Ergebnis
  if (wartendGesamt && typeof benachrichtige === "function") {
    const merker = "kt_erinnert_" + new Date().toISOString().slice(0, 10) + "_" + wartendGesamt;
    if (!localStorage.getItem(merker)) {
      localStorage.setItem(merker, "1");
      benachrichtige(wartendGesamt + " Kombination" + (wartendGesamt === 1 ? "" : "en") + " fertig",
        "Bitte gewonnen oder verloren eintragen.", "ergebnis");
    }
  }
  box.innerHTML = filter + verwalten +
    (wartendGesamt ? '<p class="mini"><b>fertig</b> heisst: alle Spiele dieses Scheins sind aus - ' +
      "bitte Person anklicken und unten <b>gewonnen oder verloren</b> eintragen, dann stimmt das Geld.</p>" : "") +
    (irgendwoWarnung ? '<p class="mini rot"><b>Ein rotes ! heisst:</b> die Personen-Kasse dieser Person ' +
      "geht sich nicht aus. Person anklicken und nachsehen.</p>" : "") +
    (ohne > 0 ? '<p class="mini"><b>' + ohne + " Kombination" + (ohne === 1 ? "" : "en") +
      " ohne Person</b> - bitte unten in der Tabelle zuordnen.</p>" : "");
}

function tuOrdnerFilter(wert) {
  ordnerFilter = wert;
  zeichneBereich();
}

async function tuOrdnerAnlegen() {
  const r = await supaOrdnerAnlegen(aktiverBereich.id, el("ordner_neu").value);
  if (r.fehler) {
    meldungM("Person nicht hinzugefügt: " + r.fehler, "warn");
    if (String(r.fehler).includes("Schlüssel")) pruefeSchluessel(true);
    return;
  }
  meldungM('Person <b>' + textSicherM(r.ordner.name) + "</b> hinzugefuegt.", "gut");
  zeichneBereich();
}

async function tuOrdnerUmbenennen(id) {
  const feld = el("ob_neu_" + id);
  const r = await supaOrdnerUmbenennen(id, feld ? feld.value : "");
  if (r.fehler) { meldungM("Nicht umbenannt: " + r.fehler, "warn"); return; }
  meldungM("Person umbenannt.", "gut");
  zeichneBereich();
}

async function tuOrdnerLoeschen(id) {
  // Nie still die Geld-Aufzeichnungen einer Person mitreissen
  if (personBuchungen.some(b => b.ordner === id)) {
    meldungM("Nicht gelöscht: in der Personen-Kasse dieser Person stehen noch Buchungen.", "warn");
    return;
  }
  const r = await supaOrdnerLoeschen(id);
  if (r.error) { meldungM("Nicht gelöscht: " + r.error.message, "warn"); return; }
  if (ordnerFilter === id) ordnerFilter = "alle";
  meldungM("Person gelöscht.", "gut");
  zeichneBereich();
}

async function tuScheinOrdner(id, wert) {
  const r = await supaScheinAendern(id, { ordner: wert || null });
  if (r.error) { meldungM("Nicht zugeordnet: " + r.error.message, "warn"); return; }
  zeichneBereich();
}

async function zeichneBereich() {
  el("scheine_titel").textContent = (aktiverBereich.rolle === "ich")
    ? "&#127919; Meine Kombinationen" : "&#127919; Kombinationen von " + aktiverBereich.username;
  const scheine = await supaScheineLaden(aktiverBereich.id);
  ordnerListe = await supaOrdnerLaden(aktiverBereich.id);
  if (ordnerFilter !== "alle" && ordnerFilter !== "ohne" &&
      !ordnerListe.some(o => o.id === ordnerFilter)) ordnerFilter = "alle";
  personBuchungen = await supaPersonBuchungenLaden(aktiverBereich.id);
  personDatenKarte = await supaPersonDatenLaden(aktiverBereich.id);
  anmerkungenListe = await supaAnmerkungenLaden(aktiverBereich.id);
  kasseScheine = scheine;
  zeichneOrdnerBox(scheine);
  zeichnePersonenKasse(scheine);
  zeichnePruefung(scheine);
  const gefiltert = (ordnerFilter === "alle") ? scheine
    : (ordnerFilter === "ohne") ? scheine.filter(s => !s.ordner)
    : scheine.filter(s => s.ordner === ordnerFilter);
  zeichneKontoDb(gefiltert);
  zeichneScheineDb(gefiltert);
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
    else if (s.stand === "gewonnen") { k.gew++; k.zur += echtZurueckWert(s); }
    else k.ver++;
  }
  const kz_ = Object.keys(konto);
  if (!kz_.length) { el("konto_db").innerHTML = '<p class="mini">Noch keine Scheine in diesem Bereich.</p>'; return; }
  let gEin = 0, gZur = 0, gSpiel = 0, gGew = 0, gVer = 0, gN = 0, gOffen = 0;
  let html = "<table><thead><tr><th>Anbieter</th><th>Scheine</th><th>offen</th><th>gewonnen</th>" +
    "<th>verloren</th><th>eingesetzt</th><th>zurück</th><th>Saldo</th><th>im Spiel</th></tr></thead><tbody>";
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

// ACHTUNG bei Aenderungen an der Spaltenreihenfolge: am Handy stehen ueber
// diesen Spalten Aufschriften (Wann, Anbieter, Person, Wetten, Quote,
// Einsatz, Moeglich, Wirklich bekommen, Stand, Notiz). Sie haengen in
// stil.css am Ende (Handy-Schicht, #scheine_db td:nth-child(n)) an genau
// dieser Reihenfolge. Wer hier umsortiert, muss sie dort nachziehen -
// sonst steht eine falsche Ueberschrift ueber einer richtigen Zahl.
function zeichneScheineDb(scheine) {
  if (!scheine.length) { el("scheine_db").innerHTML = '<p class="mini">Noch keine Scheine hier. ' +
    'Im <a href="kombis.html">Kombi-Bau</a> Scheine bauen und "In den Verlauf" drücken.</p>'; return; }
  const schreib = darfSchreiben();
  let html = "<table><thead><tr><th>Wann</th><th>Anbieter</th><th>Person</th><th>Wetten</th><th>Quote</th>" +
    "<th>Einsatz</th><th>Möglich</th><th>Wirklich bekommen</th><th>Stand</th><th>Notiz</th><th></th></tr></thead><tbody>";
  for (const s of scheine) {
    const d = s.daten;
    const ordnerZelle = schreib
      ? "<select onchange=\"tuScheinOrdner('" + s.id + "', this.value)\">" +
        "<option value=''" + (!s.ordner ? " selected" : "") + ">ohne Person</option>" +
        ordnerListe.map(o => "<option value='" + o.id + "'" + (s.ordner === o.id ? " selected" : "") +
          ">" + textSicherM(o.name) + "</option>").join("") + "</select>"
      : (s.ordner ? textSicherM(ordnerNameM(s.ordner) || "?") : "<span class='mini'>ohne</span>");
    const zklassen = [];
    if (!s.ordner) zklassen.push("ohneordner");
    if (scheinWartet(s)) zklassen.push("fertigzeile");
    html += "<tr" + (zklassen.length ? " class='" + zklassen.join(" ") + "'" : "") + "><td class='mini'>" + zeitM(s.created_at) + "</td><td>" + markeM(d.kz) + "</td>" +
      "<td>" + ordnerZelle + "</td>" +
      "<td class='mini'>" + (d.wetten || []).map(t => t.spiel + " (" + t.linie + ")").join("<br>") +
      (s.foto ? '<div class="fotoname mini">' + (s.foto_name || "") + "</div>" +
        '<div><img src="' + s.foto + '" class="minifoto"></div>' : "") +
      anmerkungenBlock(s) + "</td>" +
      "<td><b>" + (d.quote || 0).toFixed(2) + "</b></td><td>" + (d.einsatz || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + (d.moeglich || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + echtZelle(s, schreib) + "</td>" +
      "<td>" + (schreib
        ? "<select onchange=\"tuStand('" + s.id + "', this.value)\">" +
          ["offen", "gewonnen", "verloren"].map(o => "<option" + (s.stand === o ? " selected" : "") + ">" + o + "</option>").join("") + "</select>"
        : s.stand) +
      (scheinWartet(s) ? "<div class='mini fertigmark'>alle Spiele aus - Ergebnis?</div>" : "") + "</td>" +
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
  // Alles neu zeichnen: an "gewonnen" hängen das Wirklich-bekommen-Feld,
  // die Personen-Kasse und die Warn-Badges.
  zeichneBereich();
}

async function tuNotiz(id, wert) {
  const key = await kryptoBereich(aktiverBereich.id);
  if (!key) { meldungM("Notiz nicht gespeichert: kein Schlüssel für diesen Bereich.", "warn"); return; }
  const r = await supaScheinAendern(id, { notiz: await e2eZu(key, wert) || "" });
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
  if (s.daten && s.daten.gesperrt) {
    meldungM("Nicht kopiert: dieser Schein liess sich nicht entschlüsseln (Schlüssel fehlt).", "warn");
    return;
  }
  const r = await supaScheinAnlegen(ich.id, s.daten, s.foto, s.foto_name);
  meldungM(r.error ? "Kopieren fehlgeschlagen: " + r.error.message
    : "In deinen Bereich kopiert - er liegt dort unter \"ohne Person\", bitte einer deiner Personen zuordnen.",
    r.error ? "warn" : "gut");
}

// ---------- Personen-Kasse ----------
// Jede Person (Konto-Ordner) hat vier Zahlungswege: PayPal, Paysafe,
// Neteller, Skrill. Karam schreibt manuell: was auf einen Weg ERHALTEN
// wurde, was davon ZU einem Wettanbieter eingezahlt und was VOM Anbieter
// zurückgeholt wurde. Das Programm rechnet gegen die Kombinationen der
// Person und warnt, wenn etwas keinen Sinn ergibt. Die Zwei-Listen-
// Buchhaltung oben bleibt davon unberuehrt.

let personBuchungen = [];
let kasseScheine = [];
let personDatenKarte = {};   // ordnerId -> entschluesseltes Personendaten-Objekt

const KASSE_WEGE = [["paypal", "PayPal"], ["paysafe", "Paysafe"], ["neteller", "Neteller"], ["skrill", "Skrill"]];
const KASSE_ARTEN = [["erhalten", "auf den Weg erhalten"], ["zum_anbieter", "zum Anbieter eingezahlt"],
  ["vom_anbieter", "vom Anbieter zurück"], ["ausgezahlt", "auf eigenes Konto ausgezahlt (raus)"]];
const KASSE_ANBIETER = [["iw", "Interwetten"], ["bw", "Bwin"], ["b3", "Bet365"], ["st", "Stake"]];

function wegName(w) { const x = KASSE_WEGE.find(k => k[0] === w); return x ? x[1] : w; }
function artName(a) { const x = KASSE_ARTEN.find(k => k[0] === a); return x ? x[1] : a; }

// Was kam bei einem gewonnenen Schein WIRKLICH zurueck? Solange nichts
// eingetragen ist, rechnen wir mit "moeglich" (also ohne Gebühren).
function echtZurueckWert(s) {
  return (s.echt_zurueck !== null && s.echt_zurueck !== undefined)
    ? Number(s.echt_zurueck) : (s.daten.moeglich || 0);
}

function echtZelle(s, schreib) {
  if (s.stand !== "gewonnen") return "<span class='mini'>-</span>";
  const moeglich = s.daten.moeglich || 0;
  const analyse = s.daten.fotoAnalyse || null;
  const hat = s.echt_zurueck !== null && s.echt_zurueck !== undefined;
  const gebuehr = hat ? (moeglich - Number(s.echt_zurueck)) : 0;
  const gebuehrText = (hat && gebuehr > 0.004)
    ? "<div class='mini rot'>Gebühren: " + gebuehr.toFixed(2) + " &euro;</div>" : "";
  // Das Foto vom Wettschein hat den echten Auszahlungsbetrag schon gelesen:
  // er steht als Vorschlag im Feld, bis Karam etwas anderes eintraegt.
  const vorschlag = (analyse && analyse.gewinn) ? analyse.gewinn : moeglich;
  const fotoText = (analyse && !hat)
    ? "<div class='mini'>Foto sagt: " + Number(analyse.gewinn).toFixed(2) + " &euro;" +
      (analyse.gebuehr > 0 ? " (Gebühr " + Number(analyse.gebuehr).toFixed(2) + " &euro;)" : "") + "</div>" : "";
  if (!schreib) return (hat ? Number(s.echt_zurueck).toFixed(2) + " &euro;" : "<span class='mini'>-</span>") + gebuehrText;
  return "<input type='number' step='0.01' min='0' class='einsatz' value='" +
    (hat ? Number(s.echt_zurueck) : "") + "' placeholder='" + Number(vorschlag).toFixed(2) + "' " +
    "onchange=\"tuEchtZurueck('" + s.id + "', this.value)\"> &euro;" + gebuehrText + fotoText;
}

async function tuEchtZurueck(id, wert) {
  const zahl = wert === "" ? null : parseFloat(wert);
  if (zahl !== null && (isNaN(zahl) || zahl < 0)) { meldungM("Bitte einen gültigen Betrag eintragen.", "warn"); return; }
  const r = await supaScheinAendern(id, { echt_zurueck: zahl });
  if (r.error) { meldungM("Nicht gespeichert: " + r.error.message, "warn"); return; }
  if (!r.data || !r.data.length) { meldungM("Nicht gespeichert: kein Schreibrecht oder Schein weg.", "warn"); return; }
  zeichneBereich();
}

// Prueft eine Person: Stand je Zahlungsweg und rechnerisches Guthaben je
// Anbieter. Negativ heisst: die Zahlen können so nicht stimmen.
function personPruefen(ordnerId, scheine) {
  const buch = personBuchungen.filter(b => b.ordner === ordnerId);
  const meine = scheine.filter(s => s.ordner === ordnerId);
  const wege = {};
  for (const [w] of KASSE_WEGE) wege[w] = { erhalten: 0, hin: 0, zurueck: 0, stand: 0 };
  const anbieter = {};
  for (const [kz] of KASSE_ANBIETER) anbieter[kz] = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, guthaben: 0 };
  for (const b of buch) {
    const betrag = Number(b.betrag) || 0;
    if (!wege[b.weg]) continue;
    if (b.art === "erhalten") wege[b.weg].erhalten += betrag;
    else if (b.art === "ausgezahlt") wege[b.weg].raus = (wege[b.weg].raus || 0) + betrag;
    else if (b.art === "zum_anbieter") { wege[b.weg].hin += betrag; if (anbieter[b.anbieter]) anbieter[b.anbieter].einge += betrag; }
    else { wege[b.weg].zurueck += betrag; if (anbieter[b.anbieter]) anbieter[b.anbieter].geholt += betrag; }
  }
  for (const s of meine) {
    const a = anbieter[s.daten.kz];
    if (!a) continue;
    a.einsatz += s.daten.einsatz || 0;
    if (s.stand === "gewonnen") a.gewonnen += echtZurueckWert(s);
    if (s.stand === "offen") {
      a.imSpiel = (a.imSpiel || 0) + (s.daten.einsatz || 0);
      a.moeglichOffen = (a.moeglichOffen || 0) + (s.daten.moeglich || 0);
      if (scheinWartet(s)) a.wartet = (a.wartet || 0) + 1;
      const e = scheinEnde(s);
      if (e && (!a.endeMax || e > a.endeMax)) a.endeMax = e;
    }
  }
  const probleme = [];
  for (const [w, nameW] of KASSE_WEGE) {
    const x = wege[w];
    x.stand = x.erhalten - x.hin + x.zurueck - (x.raus || 0);
    if (x.stand < -0.004) probleme.push(nameW + " ist im Minus (" + x.stand.toFixed(2) +
      " Euro): mehr weitergezahlt als erhalten. Buchung vergessen oder falsch eingetragen.");
  }
  for (const [kz, nameA] of KASSE_ANBIETER) {
    const a = anbieter[kz];
    a.guthaben = a.einge - a.geholt - a.einsatz + a.gewonnen;
    if (a.guthaben < -0.004) probleme.push("Bei " + nameA + " geht es sich nicht aus: rechnerisch " +
      a.guthaben.toFixed(2) + " Euro. Mehr gesetzt oder zurückgeholt als eingezahlt und gewonnen. " +
      "Entweder fehlt eine Einzahlungs-Buchung, oder ein Schein gehört zu einer anderen Person.");
  }
  const eingesamt = buch.filter(b => b.art === "zum_anbieter").reduce((p, b) => p + Number(b.betrag), 0);
  const erhaltengesamt = buch.filter(b => b.art === "erhalten").reduce((p, b) => p + Number(b.betrag), 0);
  const ausgezahlt = buch.filter(b => b.art === "ausgezahlt").reduce((p, b) => p + Number(b.betrag), 0);
  const aufWegen = Object.values(wege).reduce((p, x) => p + x.stand, 0);
  const beiAnbietern = Object.values(anbieter).reduce((p, x) => p + x.guthaben, 0);
  const imSpiel = Object.values(anbieter).reduce((p, x) => p + (x.imSpiel || 0), 0);
  return { wege: wege, anbieter: anbieter, probleme: probleme, buch: buch,
    eingesamt: eingesamt, erhaltengesamt: erhaltengesamt, ausgezahlt: ausgezahlt,
    aufWegen: aufWegen, beiAnbietern: beiAnbietern, imSpiel: imSpiel,
    bilanz: (aufWegen + beiAnbietern + imSpiel + ausgezahlt) - erhaltengesamt };
}

// Wann ist ein Schein "fertig"? Wenn das letzte Spiel darin sicher aus ist
// (Anstoss + 3 Stunden Spieldauer-Puffer). Ein fertiger OFFENER Schein
// wartet auf Karams Bericht: gewonnen oder verloren.
function scheinEnde(s) {
  if (typeof WETTEN === "undefined" || typeof liesAnstoss !== "function") return null;
  let ende = null;
  for (const t of (s.daten.wetten || [])) {
    const w = WETTEN.find(x => x.id === t.id);
    if (!w) return null;                        // Zeit unbekannt: nicht werten
    const a = liesAnstoss(anstossFeld(w));
    if (a.fehlt) return null;                   // Zeit unbekannt: nicht werten
    const e = new Date(a.zeit);
    if (isNaN(e.getTime())) return null;
    if (a.unklar) e.setHours(23, 59);
    e.setHours(e.getHours() + 3);
    if (!ende || e > ende) ende = e;
  }
  return ende;
}

function scheinWartet(s) {
  if (s.stand !== "offen") return false;
  const e = scheinEnde(s);
  return !!e && new Date() > e;
}

function kasseZeit(d) {
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") +
    ". " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// Was in Ansicht UND PDF gezeigt wird, je Person gemerkt (z. B. kein Neteller)
const KASSE_BLOECKE = [["daten", "Personendaten"], ["statistik", "Statistik"], ["fluss", "Geldfluss"],
  ["wege", "Zahlungswege"], ["anbieter", "Wettanbieter"],
  ["kombis", "Kombinationen"], ["buchungen", "Buchungsliste"]];

function kasseZeigen(ordnerId) {
  try {
    const s = JSON.parse(localStorage.getItem("kt_kasse_zeigen_" + ordnerId) || "{}");
    return { wege: s.wege || {}, anbieter: s.anbieter || {}, bloecke: s.bloecke || {} };
  } catch (e) { return { wege: {}, anbieter: {}, bloecke: {} }; }
}

function blockAn(zg, name) { return zg.bloecke[name] !== false; }

function tuKasseZeigen(ordnerId, typ, key, an) {
  const z = kasseZeigen(ordnerId);
  if (!z[typ]) z[typ] = {};
  z[typ][key] = !!an;
  localStorage.setItem("kt_kasse_zeigen_" + ordnerId, JSON.stringify(z));
  zeichneBereich();
}

function heuteDatum() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function personEinsatz(ordnerId, scheine) {
  return scheine.filter(s => s.ordner === ordnerId)
    .reduce((p, s) => p + (s.daten.einsatz || 0), 0);
}

function personGewinn(ordnerId, scheine) {
  return scheine.filter(s => s.ordner === ordnerId && s.stand === "gewonnen")
    .reduce((p, s) => p + echtZurueckWert(s), 0);
}

// Alle Kombinationen einer Person auf einen Blick: Einsatz, Anbieter,
// Stand, Foto - und wie viele Teile zusammen zum Ziel gehören.
function kombiUebersichtHtml(ordnerId, scheine) {
  const meine = scheine.filter(s => s.ordner === ordnerId);
  if (!meine.length) return '<p class="mini">Noch keine Kombinationen bei dieser Person.</p>';
  const einsatz = meine.reduce((p, s) => p + (s.daten.einsatz || 0), 0);
  const offen = meine.filter(s => s.stand === "offen").length;
  const gew = meine.filter(s => s.stand === "gewonnen").length;
  const ver = meine.filter(s => s.stand === "verloren").length;
  let h = "<h3>&#127919; Kombinationen dieser Person (" + meine.length + ")</h3>" +
    '<p class="mini"><b>Gesamteinsatz ' + einsatz.toFixed(2) + " &euro;</b> - " + offen + " offen, " +
    '<span class="gruen">' + gew + " gewonnen</span>, <span class=\"rot\">" + ver + " verloren</span>. " +
    "Ein Schein hat drei Wetten; setzt du 400 &euro;, zählen die 400 &euro; für die ganze Kombination.</p>" +
    '<div class="tabellenrand"><table><thead><tr><th>Wann</th><th>Anbieter</th><th>Spiele</th>' +
    "<th>Quote</th><th>Einsatz</th><th>möglich</th><th>Stand</th><th>Foto</th></tr></thead><tbody>";
  for (const s of meine) {
    const d = s.daten;
    h += "<tr" + (scheinWartet(s) ? " class='fertigzeile'" : "") + ">" +
      "<td class='mini'>" + zeitM(s.created_at) + "</td>" +
      "<td>" + markeM(d.kz) + "</td>" +
      "<td class='mini'>" + (d.wetten || []).map(t => textSicherM(t.spiel)).join("<br>") + "</td>" +
      "<td><b>" + (d.quote || 0).toFixed(2) + "</b></td>" +
      "<td>" + (d.einsatz || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + (d.moeglich || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + s.stand + (scheinWartet(s) ? ' <span class="fertigbadge">Ergebnis?</span>' : "") + "</td>" +
      "<td>" + (s.foto ? '<img src="' + s.foto + '" class="minifoto">' : '<span class="mini">-</span>') + "</td></tr>";
  }
  return h + "</tbody></table></div>";
}

function zeichnePersonenKasse(scheine) {
  const box = el("personenkasse");
  if (!box) return;
  const person = ordnerListe.find(o => o.id === ordnerFilter);
  if (!person) { box.innerHTML = ""; return; }
  const schreib = darfSchreiben();
  const p = personPruefen(person.id, scheine);
  const zg = kasseZeigen(person.id);
  const meineScheine = scheine.filter(s => s.ordner === person.id);

  let html = '<div class="kassenkasten"><h3>&#128176; ' + textSicherM(person.name) + "</h3>";

  // Fertige Kombinationen zuerst - das ist die wichtigste Meldung
  const wartendHier = meineScheine.filter(s => scheinWartet(s)).length;
  if (wartendHier) {
    html += '<div class="fertighinweis"><b>' + wartendHier + " Schein" + (wartendHier === 1 ? "" : "e") +
      " fertig:</b> alle Spiele sind aus. Bitte unten <b>gewonnen oder verloren</b> eintragen - " +
      "erst dann stimmt die Rechnung hier.</div>";
  }
  if (p.probleme.length) {
    html += '<div class="kassenwarnung"><b>Das macht so keinen Sinn - bitte prüfen:</b><ul>' +
      p.probleme.map(t => "<li>" + t + "</li>").join("") + "</ul></div>";
  }

  // ---------- Was möchtest du sehen? ----------
  html += '<div class="kassewahl mini"><b>&#128065; Anzeigen:</b> ';
  for (const [k, titel] of KASSE_BLOECKE) {
    html += '<label><input type="checkbox"' + (blockAn(zg, k) ? " checked" : "") +
      ' onchange="tuKasseZeigen(\'' + person.id + "','bloecke','" + k + '\', this.checked)"> ' + titel + "</label> ";
  }
  html += '<button onclick="tuKassePdf(\'' + person.id + '\')">&#128196; Als PDF</button></div>';

  // ---------- Personendaten ----------
  if (blockAn(zg, "daten")) html += personDatenHtml(person, schreib);

  // ---------- Statistik ----------
  if (blockAn(zg, "statistik")) {
    html += "<h4>&#128200; Statistik</h4><table><tbody>" +
      zeile2("Von der Person erhalten (rein)", p.erhaltengesamt) +
      zeile2("Auf eigenes Konto ausgezahlt (raus)", p.ausgezahlt) +
      zeile2("Liegt noch auf den Zahlungswegen", p.aufWegen) +
      zeile2("Liegt bei den Wettanbietern", p.beiAnbietern) +
      zeile2("Steckt gerade in offenen Wetten", p.imSpiel) +
      "<tr><td><b>Unterm Strich (Gewinn/Verlust)</b></td><td class='" +
        (p.bilanz >= 0 ? "e-gew" : "e-ver") + "'><b>" + (p.bilanz >= 0 ? "+" : "") +
        p.bilanz.toFixed(2) + " &euro;</b></td></tr>" +
      "</tbody></table>";
  }

  // ---------- Geldfluss (Karte + Verlauf) ----------
  if (blockAn(zg, "fluss")) {
    html += "<h4>&#128260; Geldfluss</h4>" + geldflussHtml(p, zg) + geldflussVerlaufHtml(p, schreib);
  }

  // ---------- Zahlungswege ----------
  if (blockAn(zg, "wege")) {
    html += "<h4>&#128179; Zahlungswege</h4>" +
      '<div class="kassewahl mini">';
    for (const [w, nameW] of KASSE_WEGE) {
      html += '<label><input type="checkbox"' + (zg.wege[w] !== false ? " checked" : "") +
        ' onchange="tuKasseZeigen(\'' + person.id + "','wege','" + w + '\', this.checked)"> ' + nameW + "</label> ";
    }
    html += "</div><table><thead><tr><th>Zahlungsweg</th><th>erhalten</th><th>zum Anbieter</th>" +
      "<th>zurück</th><th>ausgezahlt</th><th>Stand jetzt</th></tr></thead><tbody>";
    for (const [w, nameW] of KASSE_WEGE) {
      if (zg.wege[w] === false) continue;
      const x = p.wege[w];
      html += "<tr><td>" + nameW + "</td><td>" + x.erhalten.toFixed(2) + " &euro;</td>" +
        "<td>" + x.hin.toFixed(2) + " &euro;</td><td>" + x.zurueck.toFixed(2) + " &euro;</td>" +
        "<td>" + (x.raus || 0).toFixed(2) + " &euro;</td>" +
        "<td class='" + (x.stand < -0.004 ? "rot" : "") + "'><b>" + x.stand.toFixed(2) + " &euro;</b></td></tr>";
    }
    html += "</tbody></table>";
  }

  // ---------- Wettanbieter ----------
  if (blockAn(zg, "anbieter")) {
    html += "<h4>&#127967; Wettanbieter</h4>" +
      '<div class="kassewahl mini">';
    for (const [kz, nameA] of KASSE_ANBIETER) {
      html += '<label><input type="checkbox"' + (zg.anbieter[kz] !== false ? " checked" : "") +
        ' onchange="tuKasseZeigen(\'' + person.id + "','anbieter','" + kz + '\', this.checked)"> ' + nameA + "</label> ";
    }
    html += "</div><table><thead><tr><th>Anbieter</th><th>rein</th><th>raus</th>" +
      "<th>eingesetzt</th><th>im Spiel</th><th>möglich offen</th><th>gewonnen</th>" +
      "<th>fertig</th><th>Ergebnis ab</th><th>liegt dort</th></tr></thead><tbody>";
    for (const kz of ["iw", "bw", "b3", "st"]) {
      if (zg.anbieter[kz] === false) continue;
      const a = p.anbieter[kz];
      html += "<tr><td>" + markeM(kz) + "</td><td>" + a.einge.toFixed(2) + " &euro;</td>" +
        "<td>" + a.geholt.toFixed(2) + " &euro;</td><td>" + a.einsatz.toFixed(2) + " &euro;</td>" +
        "<td>" + (a.imSpiel || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + (a.moeglichOffen || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + a.gewonnen.toFixed(2) + " &euro;</td>" +
        "<td>" + (a.wartet ? "<b class='rot'>" + a.wartet + "</b>" : "-") + "</td>" +
        "<td class='mini'>" + (a.endeMax ? kasseZeit(a.endeMax) : "-") + "</td>" +
        "<td class='" + (a.guthaben < -0.004 ? "rot" : "") + "'><b>" + a.guthaben.toFixed(2) + " &euro;</b></td></tr>";
    }
    html += "</tbody></table>";
  }

  // ---------- Kombinationen ----------
  if (blockAn(zg, "kombis")) html += kombiUebersichtHtml(person.id, scheine);

  // ---------- Neue Buchung ----------
  if (schreib) {
    html += '<div class="kassenformular"><b>Neue Buchung:</b> ' +
      '<input type="date" id="pk_datum" value="' + heuteDatum() + '"> ' +
      '<select id="pk_weg">' + KASSE_WEGE.map(w => "<option value='" + w[0] + "'>" + w[1] + "</option>").join("") + "</select> " +
      '<select id="pk_art" onchange="pkArtWechsel()">' + KASSE_ARTEN.map(a => "<option value='" + a[0] + "'>" + a[1] + "</option>").join("") + "</select> " +
      '<select id="pk_anbieter" style="display:none">' + KASSE_ANBIETER.map(a => "<option value='" + a[0] + "'>" + a[1] + "</option>").join("") + "</select> " +
      '<input type="number" id="pk_betrag" step="0.01" min="0" class="einsatz" placeholder="Betrag"> &euro; ' +
      '<input id="pk_notiz" placeholder="Notiz (freiwillig)"> ' +
      '<button class="haupt" id="pk_knopf" onclick="tuPersonBuchen(\'' + person.id + '\')">Eintragen</button>' +
      '<div class="mini">Tipp: <b>auf eigenes Konto ausgezahlt</b> heißt, das Geld verlässt das System - ' +
      "es steht nicht mehr zum Wetten bereit, bleibt aber in der Rechnung sichtbar.</div></div>";
  }

  // ---------- Buchungsliste ----------
  if (blockAn(zg, "buchungen")) {
    if (p.buch.length) {
      html += "<h4>&#128203; Alle Buchungen</h4><table><thead><tr><th>Datum</th><th>Zahlungsweg</th><th>Was</th>" +
        "<th>Anbieter</th><th>Betrag</th><th>Notiz</th>" + (schreib ? "<th></th>" : "") + "</tr></thead><tbody>";
      for (const b of p.buch.slice().reverse()) {
        html += "<tr><td class='mini'>" + b.datum + "</td><td>" + wegName(b.weg) + "</td>" +
          "<td>" + artName(b.art) + "</td><td>" + (b.anbieter ? markeM(b.anbieter) : "-") + "</td>" +
          "<td><b>" + Number(b.betrag).toFixed(2) + " &euro;</b></td>" +
          "<td class='mini'>" + textSicherM(b.notiz || "") + "</td>" +
          (schreib ? "<td><button onclick=\"tuPersonBuchungWeg(" + b.id + ")\">weg</button></td>" : "") + "</tr>";
      }
      html += "</tbody></table>";
    } else {
      html += '<p class="mini">Noch keine Buchungen bei dieser Person.</p>';
    }
  }

  html += "</div>";
  box.innerHTML = html;
}

function zeile2(titel, wert) {
  return "<tr><td>" + titel + "</td><td><b>" + wert.toFixed(2) + " &euro;</b></td></tr>";
}

// ---------- Geldfluss als Karte ----------
// Links die Zahlungswege, rechts die Anbieter, dazu die Auszahlung nach
// aussen. Die Pfeile zeigen, wie viel wohin geflossen ist.
function geldflussHtml(p, zg) {
  const wege = KASSE_WEGE.filter(([w]) => zg.wege[w] !== false && (p.wege[w].erhalten || p.wege[w].hin || p.wege[w].zurueck || p.wege[w].raus));
  const anb = KASSE_ANBIETER.filter(([kz]) => zg.anbieter[kz] !== false && (p.anbieter[kz].einge || p.anbieter[kz].geholt));
  if (!wege.length && !anb.length) return '<p class="mini">Noch kein Geldfluss - trag unten die erste Buchung ein.</p>';
  const hoehe = Math.max(wege.length, anb.length, 1) * 62 + 40;
  let svg = '<svg viewBox="0 0 640 ' + hoehe + '" class="flusskarte" xmlns="http://www.w3.org/2000/svg">';
  svg += '<text x="60" y="18" class="fk-titel">Zahlungswege</text>' +
         '<text x="330" y="18" class="fk-titel">Wettanbieter</text>' +
         '<text x="530" y="18" class="fk-titel">eigenes Konto</text>';
  wege.forEach(([w, nameW], i) => {
    const y = 40 + i * 62;
    svg += '<rect x="20" y="' + y + '" width="150" height="44" rx="7" class="fk-weg"/>' +
      '<text x="30" y="' + (y + 19) + '" class="fk-name">' + nameW + "</text>" +
      '<text x="30" y="' + (y + 36) + '" class="fk-zahl">Stand ' + p.wege[w].stand.toFixed(2) + " &#8364;</text>";
    if (p.wege[w].raus) {
      svg += '<line x1="170" y1="' + (y + 22) + '" x2="500" y2="' + (y + 22) + '" class="fk-raus"/>' +
        '<text x="330" y="' + (y + 14) + '" class="fk-zahl fk-mitte">ausgezahlt ' + p.wege[w].raus.toFixed(2) + " &#8364;</text>";
    }
  });
  anb.forEach(([kz, nameA], i) => {
    const y = 40 + i * 62;
    svg += '<rect x="300" y="' + y + '" width="170" height="44" rx="7" class="fk-anb"/>' +
      '<text x="310" y="' + (y + 19) + '" class="fk-name">' + nameA + "</text>" +
      '<text x="310" y="' + (y + 36) + '" class="fk-zahl">liegt dort ' + p.anbieter[kz].guthaben.toFixed(2) + " &#8364;</text>" +
      '<line x1="170" y1="' + (y + 22) + '" x2="300" y2="' + (y + 22) + '" class="fk-hin"/>' +
      '<text x="180" y="' + (y + 16) + '" class="fk-zahl">&#8594; ' + p.anbieter[kz].einge.toFixed(2) + " &#8364;</text>" +
      (p.anbieter[kz].geholt ? '<text x="180" y="' + (y + 38) + '" class="fk-zahl">&#8592; ' + p.anbieter[kz].geholt.toFixed(2) + " &#8364;</text>" : "");
  });
  if (p.ausgezahlt) {
    svg += '<rect x="500" y="40" width="120" height="44" rx="7" class="fk-bank"/>' +
      '<text x="510" y="59" class="fk-name">Ausgezahlt</text>' +
      '<text x="510" y="76" class="fk-zahl">' + p.ausgezahlt.toFixed(2) + " &#8364;</text>";
  }
  return svg + "</svg>";
}

function geldflussVerlaufHtml(p, schreib) {
  if (!p.buch.length) return "";
  let h = '<details><summary class="mini">Verlauf: jede Bewegung einzeln (' + p.buch.length + ")</summary><ul class='flussliste'>";
  for (const b of p.buch.slice().reverse()) {
    const betrag = Number(b.betrag).toFixed(2) + " &euro;";
    let text;
    if (b.art === "erhalten") text = "<b>" + betrag + "</b> auf <b>" + wegName(b.weg) + "</b> erhalten";
    else if (b.art === "ausgezahlt") text = "<b>" + betrag + "</b> von <b>" + wegName(b.weg) + "</b> &#8594; eigenes Konto (raus)";
    else if (b.art === "zum_anbieter") text = "<b>" + betrag + "</b> von <b>" + wegName(b.weg) + "</b> &#8594; " + anbieterNameM(b.anbieter);
    else text = "<b>" + betrag + "</b> von " + anbieterNameM(b.anbieter) + " &#8594; <b>" + wegName(b.weg) + "</b>";
    h += "<li><span class='mini'>" + b.datum + "</span> " + text +
      (b.notiz ? " <span class='mini'>(" + textSicherM(b.notiz) + ")</span>" : "") + "</li>";
  }
  return h + "</ul></details>";
}

function anbieterNameM(kz) {
  const x = KASSE_ANBIETER.find(a => a[0] === kz);
  return x ? "<b>" + x[1] + "</b>" : kz;
}

function pkArtWechsel() {
  // Anbieter nur bei Ein-/Auszahlung ZUM oder VOM Anbieter
  const art = el("pk_art").value;
  const braucht = (art === "zum_anbieter" || art === "vom_anbieter");
  el("pk_anbieter").style.display = braucht ? "" : "none";
}

async function tuPersonBuchen(ordnerId) {
  const betrag = parseFloat(el("pk_betrag").value);
  if (!betrag || betrag <= 0) { meldungM("Bitte einen Betrag eintragen.", "warn"); return; }
  const datum = el("pk_datum").value;
  if (!datum) { meldungM("Bitte ein Datum wählen.", "warn"); return; }
  const art = el("pk_art").value;
  // Buchhaltungsfehler frueh erwischen: reicht das Geld dafuer ueberhaupt?
  // Erster Klick warnt nur, zweiter Klick ("Trotzdem eintragen") bucht.
  const knopf = el("pk_knopf");
  if (knopf && knopf.dataset.trotzdem !== "1") {
    const p = personPruefen(ordnerId, kasseScheine);
    let problem = null;
    if (art === "zum_anbieter" || art === "ausgezahlt") {
      const st = p.wege[el("pk_weg").value].stand;
      if (st < betrag - 0.004) problem = "Auf " + wegName(el("pk_weg").value) + " liegen rechnerisch nur " +
        st.toFixed(2) + " Euro, du willst aber " + betrag.toFixed(2) + " Euro " +
        (art === "ausgezahlt" ? "auszahlen." : "weiterzahlen.");
    } else if (art === "vom_anbieter") {
      const g = p.anbieter[el("pk_anbieter").value].guthaben;
      if (g < betrag - 0.004) problem = "Beim Anbieter sind rechnerisch nur " + g.toFixed(2) +
        " Euro, du willst aber " + betrag.toFixed(2) + " Euro zurückholen.";
    }
    if (problem) {
      meldungM("<b>Passt rechnerisch nicht:</b> " + problem +
        " Vermutlich fehlt eine Buchung davor. Wenn es trotzdem stimmt, drücke noch einmal.", "warn");
      knopf.dataset.trotzdem = "1";
      knopf.textContent = "Trotzdem eintragen";
      return;
    }
  }
  const r = await supaPersonBuchen(aktiverBereich.id, ordnerId, datum,
    el("pk_weg").value, art, art === "erhalten" ? null : el("pk_anbieter").value,
    betrag, el("pk_notiz").value.trim());
  if (r.error) { meldungM("Nicht gebucht: " + r.error.message, "warn"); return; }
  zeichneBereich();
}

function tuKassePdf(ordnerId) {
  const person = ordnerListe.find(o => o.id === ordnerId);
  if (!person) return;
  const p = personPruefen(ordnerId, kasseScheine);
  const zg = kasseZeigen(ordnerId);
  const jetzt = new Date();
  let h = "<h1>Übersicht: " + textSicherM(person.name) + "</h1>" +
    "<p>Stand: " + kasseZeit(jetzt) + " Uhr</p>";

  if (blockAn(zg, "daten")) {
    const pd = personDatenLesen(ordnerId);
    const zeilen = PERSON_FELDER
      .filter(([feld, , typ]) => typ !== "password" && (pd[feld] || "").trim())
      .map(([feld, titel]) => "<tr><td>" + titel + "</td><td><b>" + textSicherM(pd[feld]) + "</b></td></tr>");
    // Das Passwort kommt NIE in ein PDF: ein Ausdruck liegt offen herum.
    if (zeilen.length) h += "<h2>Personendaten</h2><table>" + zeilen.join("") + "</table>";
  }

  if (blockAn(zg, "statistik")) {
    h += "<h2>Statistik</h2><table>" +
      "<tr><td>Von der Person erhalten (rein)</td><td><b>" + p.erhaltengesamt.toFixed(2) + " Euro</b></td></tr>" +
      "<tr><td>Auf eigenes Konto ausgezahlt (raus)</td><td><b>" + p.ausgezahlt.toFixed(2) + " Euro</b></td></tr>" +
      "<tr><td>Liegt auf den Zahlungswegen</td><td><b>" + p.aufWegen.toFixed(2) + " Euro</b></td></tr>" +
      "<tr><td>Liegt bei den Wettanbietern</td><td><b>" + p.beiAnbietern.toFixed(2) + " Euro</b></td></tr>" +
      "<tr><td>Steckt in offenen Wetten</td><td><b>" + p.imSpiel.toFixed(2) + " Euro</b></td></tr>" +
      "<tr><td><b>Unterm Strich</b></td><td><b>" + (p.bilanz >= 0 ? "+" : "") + p.bilanz.toFixed(2) + " Euro</b></td></tr>" +
      "</table>";
  }

  if (blockAn(zg, "wege")) {
    h += "<h2>Zahlungswege</h2><table><tr><th>Zahlungsweg</th><th>erhalten</th>" +
      "<th>zum Anbieter</th><th>zurück</th><th>ausgezahlt</th><th>Stand jetzt</th></tr>";
    for (const [w, nameW] of KASSE_WEGE) {
      if (zg.wege[w] === false) continue;
      const x = p.wege[w];
      h += "<tr><td>" + nameW + "</td><td>" + x.erhalten.toFixed(2) + "</td><td>" + x.hin.toFixed(2) +
        "</td><td>" + x.zurueck.toFixed(2) + "</td><td>" + (x.raus || 0).toFixed(2) +
        "</td><td><b>" + x.stand.toFixed(2) + "</b></td></tr>";
    }
    h += "</table>";
  }

  if (blockAn(zg, "anbieter")) {
    h += "<h2>Wettanbieter</h2><table><tr><th>Anbieter</th><th>rein</th><th>raus</th>" +
      "<th>eingesetzt</th><th>im Spiel</th><th>möglich offen</th><th>gewonnen</th>" +
      "<th>Ergebnis ab</th><th>liegt dort</th></tr>";
    for (const [kz, nameA] of KASSE_ANBIETER) {
      if (zg.anbieter[kz] === false) continue;
      const a = p.anbieter[kz];
      h += "<tr><td>" + nameA + "</td><td>" + a.einge.toFixed(2) + "</td><td>" + a.geholt.toFixed(2) +
        "</td><td>" + a.einsatz.toFixed(2) + "</td><td>" + (a.imSpiel || 0).toFixed(2) +
        "</td><td>" + (a.moeglichOffen || 0).toFixed(2) + "</td><td>" + a.gewonnen.toFixed(2) +
        "</td><td>" + (a.endeMax ? kasseZeit(a.endeMax) : "-") + "</td><td><b>" + a.guthaben.toFixed(2) + "</b></td></tr>";
    }
    h += "</table>";
  }

  if (blockAn(zg, "fluss") && p.buch.length) {
    h += "<h2>Geldfluss</h2><table><tr><th>Datum</th><th>Bewegung</th><th>Betrag</th></tr>";
    for (const b of p.buch) {
      if (b.weg && zg.wege[b.weg] === false) continue;
      if (b.anbieter && zg.anbieter[b.anbieter] === false) continue;
      let text;
      if (b.art === "erhalten") text = "auf " + wegName(b.weg) + " erhalten";
      else if (b.art === "ausgezahlt") text = "von " + wegName(b.weg) + " auf eigenes Konto ausgezahlt";
      else if (b.art === "zum_anbieter") text = "von " + wegName(b.weg) + " zu " + (KASSE_ANBIETER.find(a => a[0] === b.anbieter) || ["", b.anbieter])[1];
      else text = "von " + (KASSE_ANBIETER.find(a => a[0] === b.anbieter) || ["", b.anbieter])[1] + " zurück auf " + wegName(b.weg);
      h += "<tr><td>" + b.datum + "</td><td>" + text + "</td><td><b>" + Number(b.betrag).toFixed(2) + "</b></td></tr>";
    }
    h += "</table>";
  }

  const offene = blockAn(zg, "kombis")
    ? kasseScheine.filter(s => s.ordner === ordnerId && s.stand === "offen" && zg.anbieter[s.daten.kz] !== false)
    : [];
  if (offene.length) {
    h += "<h2>Offene Kombinationen</h2><table><tr><th>Anbieter</th><th>Spiele</th><th>Quote</th>" +
      "<th>Einsatz</th><th>möglich</th><th>Stand</th></tr>";
    for (const s of offene) {
      const e = scheinEnde(s);
      h += "<tr><td>" + textSicherM(s.daten.anbieter || s.daten.kz) + "</td>" +
        "<td>" + (s.daten.wetten || []).map(t => textSicherM(t.spiel)).join("<br>") + "</td>" +
        "<td>" + (s.daten.quote || 0).toFixed(2) + "</td><td>" + (s.daten.einsatz || 0).toFixed(2) + "</td>" +
        "<td>" + (s.daten.moeglich || 0).toFixed(2) + "</td>" +
        "<td>" + (scheinWartet(s) ? "fertig, Ergebnis offen" : (e ? "läuft bis " + kasseZeit(e) : "läuft")) + "</td></tr>";
    }
    h += "</table>";
  }

  const f = window.open("", "_blank");
  if (!f) { meldungM("Das PDF-Fenster wurde vom Browser geblockt - bitte Pop-ups erlauben.", "warn"); return; }
  f.document.write("<html><head><title>Übersicht " + textSicherM(person.name) + "</title><style>" +
    "body{font-family:Arial,sans-serif;color:#000;background:#fff;margin:24px;}" +
    "h1{font-size:22px;margin:0 0 4px 0;} h2{font-size:16px;margin:18px 0 6px 0;}" +
    "table{border-collapse:collapse;width:100%;margin-bottom:10px;} th,td{border:1px solid #000;padding:4px 8px;" +
    "font-size:13px;text-align:left;} th{background:#eee;}" +
    "</style></head><body>" + h + "</body></html>");
  f.document.close();
  setTimeout(() => { f.print(); }, 400);
}

async function tuPersonBuchungWeg(id) {
  const r = await supaPersonBuchungLoeschen(id);
  if (r.error) { meldungM("Nicht gelöscht: " + r.error.message, "warn"); return; }
  if (!r.data || !r.data.length) { meldungM("Nicht gelöscht: kein Schreibrecht oder Buchung schon weg.", "warn"); return; }
  zeichneBereich();
}

// ---------- Anmerkungen: Freunde-Notizzettel an Scheinen ----------
// Wer zuschauen darf, darf anmerken - auch nur-lesen-Freunde. Eine
// Anmerkung ändert NICHTS am Schein; der Besitzer kann sie ausblenden.

let anmerkungenListe = [];

function anmerkungenBlock(s) {
  const binBesitzer = aktiverBereich.rolle === "ich";
  let alle = anmerkungenListe.filter(a => a.schein === s.id);
  if (!binBesitzer) alle = alle.filter(a => !a.versteckt);
  const sichtbar = alle.filter(a => !a.versteckt);
  let inhalt = "";
  for (const a of alle) {
    const wer = (a.kt_profiles && a.kt_profiles.username) ? a.kt_profiles.username : "?";
    inhalt += '<div class="anmk-zeile' + (a.versteckt ? " anmk-aus" : "") + '">' +
      "<b>" + textSicherM(wer) + "</b> <span class='mini'>" + zeitM(a.created_at) + "</span><br>" +
      textSicherM(a.text) +
      "<span class='anmk-tasten'>" +
      (binBesitzer ? '<button onclick="tuAnmerkungAus(' + a.id + ',' + (a.versteckt ? "false" : "true") + ')">' +
        (a.versteckt ? "wieder zeigen" : "ausblenden") + "</button>" : "") +
      (a.autor === ich.id ? '<button onclick="tuAnmerkungWeg(' + a.id + ')">weg</button>' : "") +
      "</span></div>";
  }
  inhalt += '<div class="anmk-neu"><input id="anmk_' + s.id + '" placeholder="Anmerkung schreiben (ändert nichts am Schein)...">' +
    '<button class="haupt" onclick="tuAnmerken(\'' + s.id + '\')">Anmerken</button></div>';
  return '<details class="anmk"' + '><summary' + (sichtbar.length ? ' class="anmk-marke"' : "") + ">Anmerkungen (" +
    sichtbar.length + ")</summary>" + inhalt + "</details>";
}

async function tuAnmerken(scheinId) {
  const feld = el("anmk_" + scheinId);
  const text = feld ? feld.value.trim() : "";
  if (!text) { meldungM("Bitte zuerst etwas schreiben.", "warn"); return; }
  const r = await supaAnmerken(aktiverBereich.id, scheinId, text);
  if (r.error) { meldungM("Anmerkung nicht gespeichert: " + r.error.message, "warn"); return; }
  meldungM("Anmerkung gespeichert - der Schein selbst bleibt unveraendert.", "gut");
  zeichneBereich();
}

async function tuAnmerkungAus(id, ja) {
  const r = await supaAnmerkungVerstecken(id, ja);
  if (r.error) { meldungM("Nicht geändert: " + r.error.message, "warn"); return; }
  if (!r.data || !r.data.length) { meldungM("Nicht erlaubt (nur der Besitzer blendet aus).", "warn"); return; }
  zeichneBereich();
}

async function tuAnmerkungWeg(id) {
  const r = await supaAnmerkungLoeschen(id);
  if (r.error) { meldungM("Nicht gelöscht: " + r.error.message, "warn"); return; }
  zeichneBereich();
}

// ---------- Admin-Bereich ----------
// Nur Accounts mit rolle=admin in kt_profiles (hochstufen geht NUR direkt
// in der Datenbank). Admins sehen alle User und können sie restlos
// löschen - mit Zwei-Klick-Sicherung, nie mit einem Versehen.

let binAdmin = false;

// Admin-Funktionen und Foto-Sätze leben jetzt auf der eigenen Seite
// admin.html (admin.js) - hier gibt es nur noch den Verweis-Knopf oben.

// ---------- Buchhaltung ----------

async function zeichneBuchhaltung() {
  const box = el("buchhaltung");
  if (!box) return;
  const schreib = darfSchreiben();
  const buchungen = await supaBuchungenLaden(aktiverBereich.id);
  const balancen = await supaBalancenLaden(aktiverBereich.id);
  const heute = new Date().toISOString().slice(0, 10);

  // Karams Formel: Gewinn = Balance + Auszahlungen - Einzahlungen - Startkapital
  const summe = art => buchungen.filter(b => b.art === art)
    .reduce((p, b) => p + parseFloat(b.betrag), 0);
  const einz = summe("einzahlung"), ausz = summe("auszahlung"), start = summe("startkapital");
  const letzteBalance = balancen.length ? parseFloat(balancen[balancen.length - 1].betrag) : null;
  const gewinn = (letzteBalance === null) ? null : letzteBalance + ausz - einz - start;

  let html = '<details open><summary>Buchhaltung (anklicken)</summary><div class="inhalt">' +
    '<div class="kern"><b>Die Methode (deine zwei Listen):</b> Liste 1 sammelt jede Ein- und ' +
    "Auszahlung mit Datum, Konto, Person und Betrag, dazu das Startkapital. Liste 2 ist die " +
    "tägliche <b>Gesamtbalance aller Accounts zusammen</b>. Der Gewinn rechnet sich: " +
    "<b>aktuelle Gesamtbalance + alle Auszahlungen &minus; alle Einzahlungen &minus; Startkapital</b>.</div>";

  // Ergebnis-Kasten
  if (gewinn === null) {
    html += '<div class="warnkern">Noch keine Tagesbalance eingetragen. Trag unten die heutige ' +
      "Gesamtbalance aller Accounts ein, dann rechnet der Gewinn.</div>";
  } else {
    html += '<div class="' + (gewinn >= 0 ? "merk" : "warn") + '"><b>Reiner Gewinn nach der Formel:</b> ' +
      letzteBalance.toFixed(2) + " (Balance vom " + balancen[balancen.length - 1].datum + ") + " +
      ausz.toFixed(2) + " (Auszahlungen) &minus; " + einz.toFixed(2) + " (Einzahlungen) &minus; " +
      start.toFixed(2) + " (Startkapital) = <b>" + (gewinn >= 0 ? "+" : "") + gewinn.toFixed(2) +
      " &euro;</b></div>";
  }

  // Monats-Übersicht (kumuliert bis Monatsende, plus Monatsgewinn)
  if (balancen.length) {
    const monate = [...new Set(balancen.map(b => b.datum.slice(0, 7)))].sort();
    let vorher = null;
    html += "<h3>Monate</h3><table><thead><tr><th>Monat</th><th>letzte Balance</th>" +
      "<th>Auszahlungen bis dahin</th><th>Einzahlungen bis dahin</th>" +
      "<th>Gewinn gesamt</th><th>Gewinn im Monat</th></tr></thead><tbody>";
    for (const m of monate) {
      const ende = m + "-31";
      const bal = balancen.filter(b => b.datum <= ende);
      const letzte = parseFloat(bal[bal.length - 1].betrag);
      const a = buchungen.filter(b => b.art === "auszahlung" && b.datum <= ende)
        .reduce((p, b) => p + parseFloat(b.betrag), 0);
      const e = buchungen.filter(b => b.art === "einzahlung" && b.datum <= ende)
        .reduce((p, b) => p + parseFloat(b.betrag), 0);
      const st = buchungen.filter(b => b.art === "startkapital" && b.datum <= ende)
        .reduce((p, b) => p + parseFloat(b.betrag), 0);
      const g = letzte + a - e - st;
      const imMonat = (vorher === null) ? g : g - vorher;
      html += "<tr><td><b>" + m + "</b></td><td>" + letzte.toFixed(2) + " &euro;</td>" +
        "<td>" + a.toFixed(2) + " &euro;</td><td>" + e.toFixed(2) + " &euro;</td>" +
        "<td class='" + (g >= 0 ? "gruen" : "rot") + "'><b>" + (g >= 0 ? "+" : "") + g.toFixed(2) + " &euro;</b></td>" +
        "<td class='" + (imMonat >= 0 ? "gruen" : "rot") + "'>" + (imMonat >= 0 ? "+" : "") + imMonat.toFixed(2) + " &euro;</td></tr>";
      vorher = g;
    }
    html += "</tbody></table>";
  }

  // Liste 1: Buchungen
  html += "<h3>Liste 1: Ein- und Auszahlungen</h3>";
  if (schreib) {
    html += '<div class="buch-eingabe">' +
      '<input type="date" id="bu_datum" value="' + heute + '">' +
      '<select id="bu_art"><option value="einzahlung">Einzahlung</option>' +
      '<option value="auszahlung">Auszahlung</option>' +
      '<option value="startkapital">Startkapital</option></select>' +
      '<select id="bu_konto"><option>Interwetten</option><option>Bwin</option>' +
      '<option>Bet365</option><option>Stake</option><option>Sonstiges</option></select>' +
      '<input id="bu_person" placeholder="Person" value="' + ich.username + '" style="width:110px">' +
      '<input type="number" step="0.01" min="0.01" id="bu_betrag" placeholder="Betrag" style="width:90px">' +
      '<button class="haupt" onclick="tuBuchen()">Eintragen</button></div>';
  }
  if (buchungen.length) {
    html += "<table><thead><tr><th>Datum</th><th>Art</th><th>Konto</th><th>Person</th>" +
      "<th>Betrag</th>" + (schreib ? "<th></th>" : "") + "</tr></thead><tbody>";
    for (const b of buchungen.slice().reverse()) {
      html += "<tr><td>" + b.datum + "</td><td>" + b.art + "</td><td>" + b.konto + "</td>" +
        "<td>" + b.person + "</td><td>" + parseFloat(b.betrag).toFixed(2) + " &euro;</td>" +
        (schreib ? "<td><button onclick=\"tuBuchungWeg('" + b.id + "')\">weg</button></td>" : "") + "</tr>";
    }
    html += "</tbody></table>";
  } else html += '<p class="mini">Noch keine Buchungen.</p>';

  // Liste 2: Tagesbalancen
  html += "<h3>Liste 2: tägliche Gesamtbalance</h3>" +
    '<p class="mini">Ein Wert pro Tag: alle Account-Staende zusammengezaehlt. ' +
    "Gleicher Tag nochmal eingetragen ueberschreibt den Wert.</p>";
  if (schreib) {
    html += '<div class="buch-eingabe">' +
      '<input type="date" id="ba_datum" value="' + heute + '">' +
      '<input type="number" step="0.01" id="ba_betrag" placeholder="Gesamtbalance" style="width:130px">' +
      '<button class="haupt" onclick="tuBalance()">Speichern</button></div>';
  }
  if (balancen.length) {
    html += "<table><thead><tr><th>Datum</th><th>Gesamtbalance</th>" +
      (schreib ? "<th></th>" : "") + "</tr></thead><tbody>";
    for (const b of balancen.slice().reverse().slice(0, 31)) {
      html += "<tr><td>" + b.datum + "</td><td><b>" + parseFloat(b.betrag).toFixed(2) + " &euro;</b></td>" +
        (schreib ? "<td><button onclick=\"tuBalanceWeg('" + b.datum + "')\">weg</button></td>" : "") + "</tr>";
    }
    html += "</tbody></table>";
  } else html += '<p class="mini">Noch keine Balancen.</p>';

  box.innerHTML = html + "</div></details>";
}

async function tuBuchen() {
  const betrag = parseFloat(el("bu_betrag").value);
  if (!betrag || betrag <= 0) { meldungM("Bitte einen Betrag eintragen.", "warn"); return; }
  const r = await supaBuchen(aktiverBereich.id, el("bu_datum").value, el("bu_konto").value,
    el("bu_person").value.trim(), el("bu_art").value, betrag, "");
  if (r.error) { meldungM("Nicht gespeichert: " + r.error.message, "warn"); return; }
  zeichneBuchhaltung();
}

async function tuBuchungWeg(id) { await supaBuchungLoeschen(id); zeichneBuchhaltung(); }

async function tuBalance() {
  const betrag = parseFloat(el("ba_betrag").value);
  if (isNaN(betrag)) { meldungM("Bitte die Gesamtbalance eintragen.", "warn"); return; }
  const r = await supaBalanceSetzen(aktiverBereich.id, el("ba_datum").value, betrag);
  if (r.error) { meldungM("Nicht gespeichert: " + r.error.message, "warn"); return; }
  zeichneBuchhaltung();
}

async function tuBalanceWeg(datum) {
  await supaBalanceLoeschen(aktiverBereich.id, datum);
  zeichneBuchhaltung();
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
    const m = (typeof medienLesen === "function") ? medienLesen(n.text) : null;
    zeile.innerHTML = "<b>" + wer + "</b> <span class='mini'>" + zeitM(n.created_at) + "</span><br>" +
      (m ? medienPlatzhalter(m) : n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    box.appendChild(zeile);
    if (m) kryptoBereich(aktiverBereich.id).then(k => medienNachladen(k, m));
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

// ---------- Medien im Bereichs-Chat ----------

async function tuChatMedien(blob, art, name) {
  const key = await kryptoBereich(aktiverBereich.id);
  const r = await medienHochladen(key, medienBereichPfad(aktiverBereich.id), blob, art, name);
  if (r.fehler) { meldungM("Nicht gesendet: " + r.fehler, "warn"); return; }
  const s = await supaNachrichtSenden(aktiverBereich.id, r.text);
  if (s.error) { meldungM("Nicht gesendet: " + s.error.message, "warn"); return; }
  ladeChat(false);
}

async function tuChatDatei(input) {
  const datei = input.files && input.files[0];
  input.value = "";
  if (!datei) return;
  await tuChatMedien(datei, datei.type.startsWith("image/") ? "bild" : "datei", datei.name);
}

async function tuChatTon() {
  const knopf = el("bc-ton");
  if (aufnahmeLaeuft() && !aufnahmeLaeuft("bc-ton")) { meldungM("Es laeuft schon eine andere Aufnahme.", "warn"); return; }
  if (aufnahmeLaeuft("bc-ton")) {
    const blob = await aufnahmeStopp();
    if (knopf) { knopf.innerHTML = "&#127908; Sprachnachricht"; knopf.classList.remove("aufnahme"); }
    if (blob && blob.size) await tuChatMedien(blob, "ton", "Sprachnachricht.webm");
    return;
  }
  const s = await aufnahmeStart("ton", "bc-ton");
  if (s.fehler) { meldungM(s.fehler, "warn"); return; }
  if (knopf) { knopf.textContent = "Stopp und senden"; knopf.classList.add("aufnahme"); }
}

async function tuChatVideo() {
  const knopf = el("bc-video");
  const schau = el("bc-vorschau");
  if (aufnahmeLaeuft() && !aufnahmeLaeuft("bc-video")) { meldungM("Es laeuft schon eine andere Aufnahme.", "warn"); return; }
  if (aufnahmeLaeuft("bc-video")) {
    const blob = await aufnahmeStopp();
    if (knopf) { knopf.innerHTML = "&#128249; Video"; knopf.classList.remove("aufnahme"); }
    if (schau) schau.innerHTML = "";
    if (blob && blob.size) await tuChatMedien(blob, "video", "Video.webm");
    return;
  }
  const s = await aufnahmeStart("video", "bc-video");
  if (s.fehler) { meldungM(s.fehler, "warn"); return; }
  if (knopf) { knopf.textContent = "Stopp und senden"; knopf.classList.add("aufnahme"); }
  if (schau) {
    schau.innerHTML = '<video id="bc-live" autoplay muted class="medienvideo"></video>';
    document.getElementById("bc-live").srcObject = s.stream;
  }
}

document.addEventListener("DOMContentLoaded", startMein);


// ============================================================
// NACHRECHNEN: der Zusammenhang zwischen einer Kombination, ihren
// Einsaetzen, dem Foto-Ordner, aus dem sie gebaut wurde, und der
// Person, der sie gehoert.
//
// Grundsatz: nichts wird geschaetzt. Jede Meldung kommt aus einer
// eigenen Rechnung, und im Text steht immer, was gegen was geprueft
// wurde - damit du selbst nachvollziehen kannst, ob die Meldung
// stimmt, statt sie glauben zu muessen.
// ============================================================

const PRUEF_SPIELRAUM = 0.015;   // 1,5 % beim Multiplizieren von Quoten
const PRUEF_CENT = 0.02;         // 2 Cent bei Euro-Betraegen
const PRUEF_ZIEL = 400;          // Karams Ziel je Kombination

function pruefWette(id) {
  return (typeof WETTEN !== "undefined") ? WETTEN.find(w => w.id === id) : null;
}
function pruefTeiler(kz) {
  return (typeof GEBUEHREN_TEILER !== "undefined" && GEBUEHREN_TEILER[kz]) || 1;
}
function pruefSatzTitel(id) {
  if (typeof SAETZE !== "undefined") {
    const s = SAETZE.find(x => x.id === id);
    if (s) return s.titel;
  }
  return id || "ohne Ordner";
}
function pruefStamm(s) {
  return String((s.daten && s.daten.scheinId) || s.id).split("_")[0];
}
function pruefKurz(s) {
  const d = s.daten || {};
  return (d.anbieter || d.kz || "?") + ", " +
    ((d.wetten || []).map(t => t.spiel).filter(Boolean).join(" / ") || "ohne Spiele");
}

function pruefAlles(scheine) {
  const funde = [];
  const add = (stufe, gruppe, text) => funde.push({ stufe: stufe, gruppe: gruppe, text: text });
  const geprueft = [];

  // ---- 1. Jede Kombination gehoert zu einer Person ----
  geprueft.push("jede Kombination hat eine Person");
  const ohne = scheine.filter(s => !s.ordner);
  if (ohne.length) {
    add("fehler", "Person", "<b>" + ohne.length + " Kombination(en) hängen an keiner Person.</b> " +
      "Ohne Person lässt sich nicht sagen, wessen Geld gesetzt wurde: " +
      ohne.slice(0, 5).map(s => textSicherM(pruefKurz(s))).join(" &middot; ") +
      (ohne.length > 5 ? " &middot; ..." : ""));
  }
  const fremd = scheine.filter(s => s.ordner && !ordnerListe.some(o => o.id === s.ordner));
  if (fremd.length) {
    add("fehler", "Person", "<b>" + fremd.length + " Kombination(en) zeigen auf eine gelöschte Person.</b> " +
      "Ordne sie neu zu, sonst fehlen sie in jeder Personen-Statistik.");
  }

  // ---- 2. Rechnung im Schein selbst ----
  geprueft.push("Gesamtquote = alle Einzelquoten multipliziert");
  geprueft.push("möglicher Gewinn = Einsatz × Gesamtquote");
  for (const s of scheine) {
    const d = s.daten || {};
    const wetten = d.wetten || [];
    if (!wetten.length) {
      add("fehler", "Rechnung", "Eine Kombination bei <b>" + textSicherM(d.anbieter || d.kz || "?") +
        "</b> hat gar keine Wetten gespeichert.");
      continue;
    }
    let produkt = 1;
    let luecke = false;
    for (const t of wetten) {
      const q = Number(t.quote);
      if (!q) { luecke = true; break; }
      produkt *= q;
    }
    if (luecke) {
      add("fehler", "Rechnung", "Bei <b>" + textSicherM(pruefKurz(s)) + "</b> fehlt bei mindestens " +
        "einer Wette die Quote - die Gesamtquote kann nicht stimmen.");
      continue;
    }
    const steht = Number(d.quote) || 0;
    if (Math.abs(produkt - steht) > Math.max(PRUEF_CENT, produkt * PRUEF_SPIELRAUM)) {
      add("fehler", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b>: gespeicherte Gesamtquote <b>" +
        steht.toFixed(2) + "</b>, die Einzelquoten (" +
        wetten.map(t => Number(t.quote).toFixed(2)).join(" &times; ") + ") ergeben aber <b>" +
        rundM(produkt).toFixed(2) + "</b>.");
    }
    const sollGewinn = (Number(d.einsatz) || 0) * steht;
    if (Math.abs(sollGewinn - (Number(d.moeglich) || 0)) > PRUEF_CENT) {
      add("fehler", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b>: möglicher Gewinn steht mit <b>" +
        (Number(d.moeglich) || 0).toFixed(2) + " &euro;</b>, Einsatz " + (Number(d.einsatz) || 0).toFixed(2) +
        " &euro; &times; Quote " + steht.toFixed(2) + " ergibt aber <b>" + rundM(sollGewinn).toFixed(2) + " &euro;</b>.");
    }
    if (!Number(d.einsatz)) {
      add("warnung", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b> ist ohne Einsatz gespeichert - " +
        "sie zählt in keiner Statistik mit.");
    }
  }

  // ---- 3. Gebuehr des Anbieters wirklich abgezogen ----
  geprueft.push("Gebühr des Anbieters ist von jeder Quote abgezogen");
  for (const s of scheine) {
    const d = s.daten || {};
    const teiler = pruefTeiler(d.kz);
    if (teiler === 1) continue;
    for (const t of d.wetten || []) {
      const w = pruefWette(t.id);
      if (!w || !Array.isArray(w.o)) continue;
      const foto = w.o.map(x => x[1]).filter(x => x);
      // Steht die gespeicherte Quote GENAU auf einer Quote aus dem Foto,
      // dann wurde nicht durch den Gebuehren-Teiler geteilt.
      if (foto.some(r => Math.abs(r - Number(t.quote)) < 0.005)) {
        add("fehler", "Gebühr", "<b>" + textSicherM(d.anbieter || d.kz) + " / " + textSicherM(t.spiel || "") +
          "</b>: gespeichert ist <b>" + Number(t.quote).toFixed(2) + "</b> - das ist genau die Quote vom Schein. " +
          "Bei " + textSicherM(d.anbieter || d.kz) + " gehen " + Math.round((teiler - 1) * 100) +
          " Prozent Gebühr weg, echt wären <b>" + (Number(t.quote) / teiler).toFixed(2) + "</b>.");
      }
    }
  }

  // ---- 4. Stecken die Wetten noch im Foto-Ordner? ----
  const satzGeladen = {};
  for (const s of scheine) {
    const satz = (s.daten || {}).satz;
    if (!satz || satzGeladen[satz] !== undefined) continue;
    satzGeladen[satz] = (typeof WETTEN !== "undefined") && WETTEN.some(w => w.satz === satz);
  }
  const nichtGeladen = Object.keys(satzGeladen).filter(k => !satzGeladen[k]);
  if (nichtGeladen.length) {
    add("warnung", "Foto-Ordner", "Zu " + nichtGeladen.length + " Foto-Ordner(n) liegen gerade keine " +
      "Wetten vor (" + nichtGeladen.map(k => textSicherM(pruefSatzTitel(k))).join(", ") + "). " +
      "Die Kombinationen daraus lassen sich nicht gegen ihre Herkunft prüfen. Das passiert, wenn " +
      "ein Ordner gelöscht wurde oder die Fotos noch nicht eingelesen sind.");
  } else {
    geprueft.push("jede Wette steckt noch in ihrem Foto-Ordner");
  }
  const fehlt = {};      // je Ordner: welche Spiele stecken nicht mehr drin
  const vermischt = {};  // je Ordner: Wetten, die in einem anderen Ordner liegen
  const anders = [];     // Spielname in der Kombination gegen den im Ordner
  for (const s of scheine) {
    const d = s.daten || {};
    if (!satzGeladen[d.satz]) continue;
    for (const t of d.wetten || []) {
      const w = pruefWette(t.id);
      if (!w) {
        (fehlt[d.satz] = fehlt[d.satz] || []).push(t.spiel || t.id);
        continue;
      }
      if (w.satz && d.satz && w.satz !== d.satz) {
        (vermischt[d.satz] = vermischt[d.satz] || []).push({ spiel: t.spiel || t.id, wo: w.satz });
      }
      if (w.spiel && t.spiel && w.spiel !== t.spiel) anders.push({ hier: t.spiel, dort: w.spiel });
    }
  }
  const beispiele = liste => liste.slice(0, 3).map(x => textSicherM(x)).join(", ") +
    (liste.length > 3 ? " und " + (liste.length - 3) + " weitere" : "");
  for (const [satz, liste] of Object.entries(fehlt)) {
    const einzeln = Array.from(new Set(liste));
    add("warnung", "Foto-Ordner", "<b>" + einzeln.length + " Wette(n)</b> aus <b>" +
      textSicherM(pruefSatzTitel(satz)) + "</b> stecken dort nicht mehr drin (" + beispiele(einzeln) + "). " +
      "Die Kombinationen bleiben gültig und richtig gerechnet, lassen sich aber nicht mehr gegen das " +
      "Foto nachprüfen. Das passiert, wenn der Ordner nach dem Bauen noch einmal eingelesen wurde.");
  }
  for (const [satz, liste] of Object.entries(vermischt)) {
    add("fehler", "Foto-Ordner", "<b>" + liste.length + " Wette(n)</b> sind dem Ordner <b>" +
      textSicherM(pruefSatzTitel(satz)) + "</b> zugeordnet, liegen aber in <b>" +
      textSicherM(pruefSatzTitel(liste[0].wo)) + "</b> (" + beispiele(liste.map(x => x.spiel)) + "). " +
      "Hier sind zwei Lieferungen vermischt.");
  }
  if (anders.length) {
    add("warnung", "Foto-Ordner", "Bei <b>" + anders.length + " Wette(n)</b> steht in der Kombination " +
      "ein anderer Spielname als im Ordner, zum Beispiel <b>" + textSicherM(anders[0].hier) +
      "</b> gegen <b>" + textSicherM(anders[0].dort) + "</b>.");
  }

  // ---- 5. Ziel je Kombination ----
  geprueft.push("jede Kombination erreicht das Ziel von " + PRUEF_ZIEL + " Euro");
  const gruppen = {};
  for (const s of scheine) {
    const d = s.daten || {};
    const k = (d.satz || "?") + "|" + pruefStamm(s) + "|" + (s.ordner || "-");
    gruppen[k] = gruppen[k] || { einsatz: 0, teile: 0, offen: 0, person: s.ordner, beispiel: s };
    gruppen[k].einsatz += Number(d.einsatz) || 0;
    gruppen[k].teile++;
    if (s.stand === "offen") gruppen[k].offen++;
  }
  const zuKlein = Object.values(gruppen).filter(g => g.offen && g.einsatz < PRUEF_ZIEL - 0.5);
  for (const g of zuKlein.slice(0, 8)) {
    add("hinweis", "Ziel", "<b>" + textSicherM(pruefKurz(g.beispiel)) + "</b>" +
      (g.person ? " (" + textSicherM(ordnerNameM(g.person)) + ")" : "") + ": erst <b>" +
      rundM(g.einsatz).toFixed(2) + " &euro;</b> von " + PRUEF_ZIEL + " &euro;" +
      (g.teile > 1 ? " in " + g.teile + " Teilen" : "") + " - es fehlen " +
      rundM(PRUEF_ZIEL - g.einsatz).toFixed(2) + " &euro;.");
  }
  if (zuKlein.length > 8) {
    add("hinweis", "Ziel", "... und " + (zuKlein.length - 8) + " weitere Kombination(en) unter " + PRUEF_ZIEL + " Euro.");
  }

  // ---- 6. Dasselbe Spiel mehrfach bei derselben Person ----
  geprueft.push("kein Spiel in mehr als ZWEI Kombinationen derselben Person (deine Zweimal-Regel)");
  const proPerson = {};
  for (const s of scheine) {
    if (s.stand !== "offen") continue;
    const p = s.ordner || "-";
    const stamm = pruefStamm(s);
    proPerson[p] = proPerson[p] || {};
    for (const t of (s.daten || {}).wetten || []) {
      const spiel = String(t.spiel || "").toLowerCase().trim();
      if (!spiel) continue;
      proPerson[p][spiel] = proPerson[p][spiel] || { staemme: new Set(), name: t.spiel };
      proPerson[p][spiel].staemme.add(stamm);
    }
  }
  for (const [p, spiele] of Object.entries(proPerson)) {
    for (const eintrag of Object.values(spiele)) {
      if (eintrag.staemme.size > 2) {
        add("warnung", "Doppelt", "Bei <b>" + textSicherM(p === "-" ? "ohne Person" : ordnerNameM(p)) +
          "</b> läuft <b>" + textSicherM(eintrag.name) + "</b> in " + eintrag.staemme.size +
          " verschiedenen Kombinationen. Deine Regel ist: jedes Spiel in höchstens zwei. " +
          "(Teile derselben Kombination bei mehreren Anbietern zählen hier nicht mit.)");
      }
    }
  }

  // ---- 7. Reicht das Geld der Person? ----
  geprueft.push("das Geld der Person deckt, was gesetzt wurde");
  for (const o of ordnerListe) {
    const p = personPruefen(o.id, scheine);
    for (const problem of (p.probleme || [])) {
      add("fehler", "Geld", "<b>" + textSicherM(o.name) + ":</b> " + problem);
    }
    const gesetzt = personEinsatz(o.id, scheine);
    if (gesetzt > 0 && p.erhaltengesamt === 0 && p.eingesamt === 0) {
      add("warnung", "Geld", "<b>" + textSicherM(o.name) + "</b> hat " + rundM(gesetzt).toFixed(2) +
        " &euro; gesetzt, aber in der Kasse steht kein einziger Eingang. Trag nach, was du " +
        "bekommen und eingezahlt hast, sonst rechnet die Statistik ins Leere.");
    }
  }

  // ---- 8. Fertig gespielt, aber ohne Ergebnis ----
  geprueft.push("kein fertiges Spiel wartet auf dein Ergebnis");
  const wartet = scheine.filter(s => s.stand === "offen" && scheinWartet(s));
  if (wartet.length) {
    add("hinweis", "Ergebnisse", "<b>" + wartet.length + " Kombination(en)</b> sind durchgespielt und " +
      "warten auf deine Meldung gewonnen oder verloren. Solange bleiben sie als \"im Spiel\" gerechnet.");
  }

  return { funde: funde, geprueft: geprueft };
}

function pruefStufeText(st) {
  return st === "fehler" ? "Fehler" : (st === "warnung" ? "Auffällig" : "Hinweis");
}

function zeichnePruefung(scheine) {
  const box = el("pruefbericht");
  if (!box) return;
  const r = pruefAlles(scheine);
  const zahl = st => r.funde.filter(f => f.stufe === st).length;

  let h = '<div class="pruefkopf">' +
    '<span class="pruefzahl ' + (zahl("fehler") ? "rot" : "gruen") + '">' + zahl("fehler") + " Fehler</span>" +
    '<span class="pruefzahl ' + (zahl("warnung") ? "gelb" : "gruen") + '">' + zahl("warnung") + " auffällig</span>" +
    '<span class="pruefzahl grau">' + zahl("hinweis") + " Hinweise</span>" +
    '<span class="mini">' + scheine.length + " Kombinationen, " + ordnerListe.length +
    " Personen nachgerechnet</span></div>";

  if (!r.funde.length) {
    h += '<div class="pruefzeile gut"><b>&#9989; Alles nachgerechnet, nichts gefunden.</b> ' +
      "Quoten, Gebühren, Einsätze, Zuordnungen und Geldstände passen zusammen.</div>";
  } else {
    for (const stufe of ["fehler", "warnung", "hinweis"]) {
      const liste = r.funde.filter(f => f.stufe === stufe);
      if (!liste.length) continue;
      h += '<div class="pruefgruppe">' + liste.map(f =>
        '<div class="pruefzeile ' + stufe + '"><span class="pruefmarke">' + f.gruppe + "</span>" +
        f.text + "</div>").join("") + "</div>";
    }
  }
  h += '<details class="pruefwas"><summary>Was genau wurde geprüft? (' + r.geprueft.length + " Regeln)</summary>" +
    "<ul>" + r.geprueft.map(x => "<li>" + x + "</li>").join("") + "</ul>" +
    '<p class="mini">Nicht geprüft werden kann, ob eine Quote im Wettbüro wirklich so stand - dafür ' +
    "gibt es das Foto zum Schein. Geprüft wird alles, was das Programm selbst nachrechnen kann.</p></details>";
  box.innerHTML = h;
  zeichneOrdnerBilanz(scheine);
}

// ---------- Bilanz je Foto-Ordner ----------
// Ein Foto-Ordner ist eine Lieferung. Karams Frage dazu: was ist aus dieser
// Lieferung geworden - jeder Einsatz, wie er gespielt wurde, und wie viel
// Geld insgesamt hineingegangen ist.

function zeichneOrdnerBilanz(scheine) {
  const box = el("ordnerbilanz");
  if (!box) return;
  if (!scheine.length) {
    box.innerHTML = '<p class="mini">Noch keine Kombinationen gespeichert - hier steht die Bilanz, ' +
      "sobald du die erste in den Verlauf legst.</p>";
    return;
  }
  const ordner = {};
  for (const s of scheine) {
    const d = s.daten || {};
    const id = d.satz || "ohne";
    ordner[id] = ordner[id] || { scheine: [], einsatz: 0, moeglich: 0, gewonnen: 0, zurueck: 0,
      verloren: 0, offen: 0, imSpiel: 0, personen: {}, anbieter: {} };
    const o = ordner[id];
    const einsatz = Number(d.einsatz) || 0;
    o.scheine.push(s);
    o.einsatz += einsatz;
    o.moeglich += Number(d.moeglich) || 0;
    const p = s.ordner || "-";
    o.personen[p] = (o.personen[p] || 0) + einsatz;
    const kz = d.kz || "?";
    o.anbieter[kz] = (o.anbieter[kz] || 0) + einsatz;
    if (s.stand === "offen") { o.offen++; o.imSpiel += einsatz; }
    else if (s.stand === "gewonnen") { o.gewonnen++; o.zurueck += echtZurueckWert(s); }
    else if (s.stand === "verloren") { o.verloren++; }
  }

  let h = "";
  for (const [id, o] of Object.entries(ordner)) {
    const fertig = o.gewonnen + o.verloren;
    const eingesetztFertig = o.scheine.filter(s => s.stand === "gewonnen" || s.stand === "verloren")
      .reduce((p, s) => p + (Number((s.daten || {}).einsatz) || 0), 0);
    const bilanz = o.zurueck - eingesetztFertig;
    h += '<details class="bilanzordner"><summary><b>' + textSicherM(pruefSatzTitel(id)) + "</b> &middot; " +
      o.scheine.length + " Kombination(en) &middot; insgesamt <b>" + rundM(o.einsatz).toFixed(2) +
      " &euro;</b> hineingespielt" + (fertig ? " &middot; abgerechnet <b class='" +
      (bilanz >= 0 ? "gruen" : "rot") + "'>" + (bilanz >= 0 ? "+" : "") + rundM(bilanz).toFixed(2) +
      " &euro;</b>" : "") + "</summary>";

    const bz = (titel, wert, zusatz) => "<tr><td>" + titel + "</td><td><b>" + wert +
      "</b>" + (zusatz ? ' <span class="mini">' + zusatz + "</span>" : "") + "</td></tr>";
    h += '<table class="tab bilanzzahlen"><tbody>' +
      bz("Insgesamt hineingespielt", rundM(o.einsatz).toFixed(2) + " &euro;",
         o.scheine.length + " Kombination(en)") +
      bz("Steckt noch in offenen Wetten", rundM(o.imSpiel).toFixed(2) + " &euro;",
         o.offen + " offen") +
      bz("Schon abgerechnet (Einsatz)", rundM(eingesetztFertig).toFixed(2) + " &euro;",
         o.gewonnen + " gewonnen, " + o.verloren + " verloren") +
      bz("Davon zurückbekommen", rundM(o.zurueck).toFixed(2) + " &euro;", "") +
      bz("<b>Ergebnis der fertigen Wetten</b>",
         '<span class="' + (bilanz >= 0 ? "gruen" : "rot") + '">' + (bilanz >= 0 ? "+" : "") +
         rundM(bilanz).toFixed(2) + " &euro;</span>", "") +
      "</tbody></table>";

    const personZeilen = Object.entries(o.personen).map(([p, betrag]) =>
      "<tr><td>" + textSicherM(p === "-" ? "ohne Person" : ordnerNameM(p)) + "</td><td>" +
      rundM(betrag).toFixed(2) + " &euro;</td></tr>").join("");
    const anbZeilen = Object.entries(o.anbieter).map(([kz, betrag]) =>
      "<tr><td>" + textSicherM(anbieterNameM(kz)) + "</td><td>" +
      rundM(betrag).toFixed(2) + " &euro;</td></tr>").join("");
    h += '<div class="bilanzpaar">' +
      '<table class="tab"><thead><tr><th>Für welche Person</th><th>Einsatz</th></tr></thead><tbody>' +
      personZeilen + "</tbody></table>" +
      '<table class="tab"><thead><tr><th>Bei welchem Anbieter</th><th>Einsatz</th></tr></thead><tbody>' +
      anbZeilen + "</tbody></table></div>";

    h += '<table class="tab bilanzscheine"><thead><tr><th>Wann</th><th>Person</th><th>Anbieter</th>' +
      "<th>Spiele</th><th>Quote</th><th>Einsatz</th><th>möglich</th><th>Stand</th></tr></thead><tbody>";
    for (const s of o.scheine.slice().sort((a, b) => String(b.daten.zeit || "").localeCompare(String(a.daten.zeit || "")))) {
      const d = s.daten || {};
      h += "<tr><td>" + textSicherM(zeitM(d.zeit) || "") + "</td>" +
        "<td>" + textSicherM(s.ordner ? ordnerNameM(s.ordner) : "-") + "</td>" +
        "<td>" + textSicherM(d.anbieter || d.kz || "?") + "</td>" +
        "<td>" + (d.wetten || []).map(t => textSicherM(t.spiel || "") +
          ' <span class="mini">' + textSicherM(t.wette || "") + " @ " +
          (Number(t.quote) || 0).toFixed(2) + "</span>").join("<br>") + "</td>" +
        "<td><b>" + (Number(d.quote) || 0).toFixed(2) + "</b></td>" +
        "<td>" + (Number(d.einsatz) || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + (Number(d.moeglich) || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + (s.stand === "offen" ? (scheinWartet(s) ? "fertig, Ergebnis offen" : "läuft")
          : textSicherM(s.stand)) + "</td></tr>";
    }
    h += "</tbody></table></details>";
  }
  box.innerHTML = h;
}


// ============================================================
// PERSONENDATEN: je Person ein Katalog mit allen Angaben plus
// Fotos und Ausweise. Alles Ende-zu-Ende verschluesselt: die
// Felder als JSON in kt_person_daten, die Bilder als Datenmuell
// im Speicher (gleicher Weg wie die Messenger-Medien).
// ============================================================

// Der Katalog: Feldname, Beschriftung, Eingabetyp
const PERSON_FELDER = [
  ["vorname", "Vorname", "text"],
  ["nachname", "Nachname", "text"],
  ["geburtsdatum", "Geburtsdatum", "date"],
  ["geburtsort", "Geburtsort", "text"],
  ["staat", "Staatsbürgerschaft", "text"],
  ["adresse", "Adresse (Strasse, PLZ, Ort)", "text"],
  ["telefon", "Telefon", "text"],
  ["email", "E-Mail", "text"],
  ["passwort", "Passwort", "password"],
  ["notiz", "Notizen", "textarea"]
];

function personDatenLesen(ordnerId) {
  const d = personDatenKarte[ordnerId];
  return (d && typeof d === "object") ? d : { dokumente: [] };
}

function personDatenHtml(person, schreib) {
  const d = personDatenLesen(person.id);
  let h = '<h4>&#128100; Personendaten</h4><div class="persondaten">';
  h += '<div class="persondaten-felder">';
  for (const [feld, titel, typ] of PERSON_FELDER) {
    const wert = textSicherM(d[feld] || "");
    const id = "pd_" + feld;
    if (typ === "textarea") {
      h += '<label class="pd-feld pd-breit">' + titel + '<br><textarea id="' + id + '"' +
        (schreib ? "" : " disabled") + ">" + wert + "</textarea></label>";
    } else if (typ === "password") {
      h += '<label class="pd-feld">' + titel + '<br><input id="' + id + '" type="password" value="' + wert + '"' +
        (schreib ? "" : " disabled") + " autocomplete=\"off\"> " + augeHtml(id) + "</label>";
    } else {
      h += '<label class="pd-feld">' + titel + '<br><input id="' + id + '" type="' + typ + '" value="' + wert + '"' +
        (schreib ? "" : " disabled") + "></label>";
    }
  }
  h += "</div>";
  if (schreib) {
    h += '<div class="pd-leiste"><button class="haupt" onclick="tuPersonDatenSpeichern(\'' + person.id + '\')">' +
      "&#128190; Personendaten speichern</button>" +
      '<label class="fotoknopf">&#128247; Foto oder Ausweis hinzufügen' +
      '<input type="file" accept="image/*,.pdf" style="display:none" ' +
      'onchange="tuPersonDokument(\'' + person.id + '\', this)"></label>' +
      '<span class="mini">Alles verschlüsselt - nur du (und wem du teilst) kann das lesen.</span></div>';
  }
  // Dokumente
  const doks = Array.isArray(d.dokumente) ? d.dokumente : [];
  if (doks.length) {
    h += '<div class="pd-doks">';
    for (const m of doks) {
      const kennung = "pddok_" + String(m.pfad || "").replace(/[^a-z0-9]/gi, "");
      h += '<div class="pd-dok" id="' + kennung + '"><b>' + textSicherM(m.name || "Datei") + "</b> " +
        '<span class="mini">' + medienGroesseText(m.groesse || 0) + " &middot; " + textSicherM(m.wann || "") + "</span> " +
        '<span class="pd-dok-bild mini">lädt...</span>' +
        (schreib ? ' <button onclick="tuPersonDokumentWeg(\'' + person.id + "','" +
          textSicherM(m.pfad) + '\')">Weg</button>' : "") + "</div>";
    }
    h += "</div>";
    setTimeout(() => personDokumenteNachladen(person.id), 50);
  } else {
    h += '<p class="mini">Noch keine Fotos oder Ausweise gespeichert.</p>';
  }
  return h + "</div>";
}

async function personDokumenteNachladen(ordnerId) {
  const d = personDatenLesen(ordnerId);
  const key = await kryptoBereich(aktiverBereich.id);
  for (const m of d.dokumente || []) {
    const kennung = "pddok_" + String(m.pfad || "").replace(/[^a-z0-9]/gi, "");
    const kasten = el(kennung);
    if (!kasten) continue;
    const ziel = kasten.querySelector(".pd-dok-bild");
    if (!ziel) continue;
    const url = await medienUrl(key, m);
    if (!url) { ziel.textContent = "[nicht lesbar]"; continue; }
    if (m.art === "bild") {
      ziel.outerHTML = '<a href="' + url + '" target="_blank" rel="noopener">' +
        '<img src="' + url + '" class="pd-vorschau" alt=""></a>';
    } else {
      ziel.outerHTML = '<a href="' + url + '" target="_blank" rel="noopener">öffnen</a>';
    }
  }
}

function personDatenAusFeldern(ordnerId) {
  const d = personDatenLesen(ordnerId);
  for (const [feld] of PERSON_FELDER) {
    const f = el("pd_" + feld);
    if (f) d[feld] = f.value.trim();
  }
  if (!Array.isArray(d.dokumente)) d.dokumente = [];
  return d;
}

async function tuPersonDatenSpeichern(ordnerId) {
  const d = personDatenAusFeldern(ordnerId);
  const r = await supaPersonDatenSpeichern(aktiverBereich.id, ordnerId, d);
  if (r.fehler) { meldungM("Nicht gespeichert: " + r.fehler, "warn"); return; }
  personDatenKarte[ordnerId] = d;
  meldungM("<b>Personendaten gespeichert.</b>", "gut");
}

async function tuPersonDokument(ordnerId, eingabe) {
  const datei = eingabe.files && eingabe.files[0];
  if (!datei) return;
  eingabe.value = "";
  const key = await kryptoBereich(aktiverBereich.id);
  if (!key) { meldungM(OHNE_SCHLUESSEL, "warn"); return; }
  meldungM("Datei wird verschlüsselt und hochgeladen...", "gut");
  const art = /^image\//.test(datei.type) ? "bild" : "datei";
  const r = await medienHochladen(key, medienBereichPfad(aktiverBereich.id), datei, art, datei.name);
  if (r.fehler) { meldungM("Hochladen fehlgeschlagen: " + r.fehler, "warn"); return; }
  const m = medienLesen(r.text);
  m.wann = new Date().toLocaleDateString("de-AT");
  // Erst die Felder mitnehmen (nichts Getipptes verlieren), dann anhaengen
  const d = personDatenAusFeldern(ordnerId);
  d.dokumente.push(m);
  const s = await supaPersonDatenSpeichern(aktiverBereich.id, ordnerId, d);
  if (s.fehler) { meldungM("Nicht gespeichert: " + s.fehler, "warn"); return; }
  personDatenKarte[ordnerId] = d;
  meldungM("<b>" + textSicherM(datei.name) + "</b> gespeichert (verschlüsselt).", "gut");
  zeichnePersonenKasse(kasseScheine);
}

async function tuPersonDokumentWeg(ordnerId, pfadWert) {
  if (!confirm("Diese Datei wirklich löschen?")) return;
  const d = personDatenAusFeldern(ordnerId);
  d.dokumente = (d.dokumente || []).filter(m => m.pfad !== pfadWert);
  const s = await supaPersonDatenSpeichern(aktiverBereich.id, ordnerId, d);
  if (s.fehler) { meldungM("Nicht gespeichert: " + s.fehler, "warn"); return; }
  personDatenKarte[ordnerId] = d;
  try { await supa.storage.from("kt-medien").remove([pfadWert]); } catch (e) { /* Verweis ist weg, Rest egal */ }
  meldungM("Datei gelöscht.", "gut");
  zeichnePersonenKasse(kasseScheine);
}

// ============================================================
// MEIN BEREICH: Konto, Bereiche, Teilen, Chat.
// Braucht supa.js. Rein für mein.html.
// ============================================================
"use strict";

let ich = null;                 // {id, username}
let aktiverBereich = null;      // {id, username, rolle}  rolle: "ich" | "close" | "friend"
let meineBereiche = [];
let meinePins = new Set();   // fixierte Bereiche (kt_bereich_pins)
let chatTimer = null;
let letzteChatId = 0;
let ergSucheTimer = null;   // Selbstsuche fuer Ergebnisse (ergebnisse.js)

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
  // Der Kasten sitzt ganz OBEN auf der Seite. Am Handy steht man beim
  // Anlegen aber weit unten - die Meldung erschien dann ausserhalb des
  // Bildschirms, und es sah aus, als passiere gar nichts. Deshalb wird
  // jetzt immer dorthin gescrollt.
  try { box.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { }
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

// Am Handy passen die beiden Kaesten nicht untereinander auf den Schirm:
// der Knopf "Konto anlegen" lag bei 885 Pixeln, also UNTER dem Rand - man
// sah nur das Anmelden und dachte, es gaebe kein Anlegen. Deshalb zwei
// grosse Reiter, von denen am Handy immer nur einer offen ist. Am Rechner
// stehen weiter beide nebeneinander.
function authReiter(welcher) {
  const bereich = el("authbereich");
  if (bereich) bereich.dataset.zeigt = welcher;
  const a = el("areiter_an"), n = el("areiter_neu");
  if (a) a.classList.toggle("aktiv", welcher === "an");
  if (n) n.classList.toggle("aktiv", welcher === "neu");
}

function zeigeAnmeldung() {
  el("inhalt").innerHTML = `
<div class="authreiter">
  <button id="areiter_an" class="aktiv" onclick="authReiter('an')">Anmelden</button>
  <button id="areiter_neu" onclick="authReiter('neu')">Neues Konto</button>
</div>
<div class="auth" id="authbereich">
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
    <label>E-Mail <span class="mini">(freiwillig! Nur damit du ein vergessenes Passwort zurücksetzen
      kannst. Ohne E-Mail geht alles andere genauso - aber ein vergessenes Passwort ist dann weg.)</span><br>
      <input id="reg_mail" type="email" autocomplete="email"></label>
    <label>Passwort <span class="mini">(mindestens 6 Zeichen)</span><br>
      <input id="reg_pw" type="password" autocomplete="new-password"> ${augeHtml("reg_pw")}</label>
    <button class="haupt" id="reg_knopf" onclick="tuRegistrieren()">Konto anlegen</button>
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
  const name = el("reg_user").value.trim();
  const knopf = el("reg_knopf");
  if (knopf) { knopf.disabled = true; knopf.textContent = "Konto wird angelegt..."; }
  const r = await supaRegistrieren(name, el("reg_mail").value.trim(), el("reg_pw").value);
  if (knopf) { knopf.disabled = false; knopf.textContent = "Konto anlegen"; }
  if (r.fehler) { meldungM(r.fehler, "warn"); return; }
  // Die Bestaetigung muss das Neuladen ueberleben, sonst sieht sie niemand.
  try {
    localStorage.setItem("kt_neu_angelegt", name);
    if (r.ohneMail) localStorage.setItem("kt_neu_ohne_mail", "1");
  } catch (e) { }
  location.reload();
}

// Nach dem Neuladen: einmal deutlich sagen, dass es geklappt hat.
function begruessungZeigen() {
  let name = null;
  try {
    name = localStorage.getItem("kt_neu_angelegt");
    if (name) localStorage.removeItem("kt_neu_angelegt");
  } catch (e) { return; }
  if (!name) return;
  let ohne = false;
  try { ohne = localStorage.getItem("kt_neu_ohne_mail") === "1"; localStorage.removeItem("kt_neu_ohne_mail"); } catch (e) { }
  meldungM("<b>&#9989; Dein Konto ist angelegt, " + textSicherM(name) + ".</b> " +
    (ohne ? "<b>Ohne E-Mail:</b> merk dir dein Passwort gut - ohne E-Mail kann es niemand zurücksetzen. " : "") +
    "Du bist gleich angemeldet - du musst dich nicht noch einmal einloggen. " +
    "Als Nächstes am besten oben auf die Glocke tippen und die Benachrichtigungen " +
    "einschalten, damit du Nachrichten und Anrufe auch dann bekommst, wenn die App zu ist.",
    "gut");
}
document.addEventListener("DOMContentLoaded", () => setTimeout(begruessungZeigen, 900));

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
  // Fixierte Bereiche (Karam, 05.09.): Pin = von diesem geteilten Bereich
  // kommen die Waechter-Meldungen auch auf MEINE Geraete. Gepinnte stehen
  // in der Tab-Leiste direkt nach dem eigenen Bereich.
  meinePins = new Set(typeof supaPinsLaden === "function" ? await supaPinsLaden() : []);
  const geteiltSortiert = geteilt.slice().sort((a, b) =>
    (meinePins.has(b.owner) ? 1 : 0) - (meinePins.has(a.owner) ? 1 : 0));
  meineBereiche = [{ id: ich.id, username: ich.username, rolle: "ich" }]
    .concat(geteiltSortiert.map(g => ({ id: g.owner, username: g.kt_profiles.username, rolle: g.rolle })));
  if (!aktiverBereich) aktiverBereich = meineBereiche[0];

  el("inhalt").innerHTML = `
<div class="kopfzeile">${binAdmin ? '<a href="admin.html" class="navknopf adminknopf">&#9881;&#65039; Admin-Bereich</a>' : ""}</div>
<div id="schluesselkasten"></div>
<div id="bereichtabs" class="navleiste"></div>
<div id="anbieterkopf"></div>
<div id="mb_navi" class="mb-navi"></div>

<div id="blk_tag" class="mb-block">
<div id="tagesuebersicht"></div>
</div>

<div id="blk_kombis" class="mb-block">
<h2>&#128100; Personen</h2>
<p class="mini">Deine Personen: je ein Account oder ein Mensch, bei dem du Kombinationen
gesetzt hast. Jede Kombination gehört zu einer Person. <b>Nicht verwechseln:</b> die
Foto-Ordner oben auf der Kombi-Tafel sind für alle gleich und ändern sich nur, wenn ein
Admin neue Fotos bringt. Personen gehören nur dir.</p>
<div id="ordnerbox"></div>
<div id="personenkasse"></div>
<h2>&#127974; Konto dieses Bereichs</h2>
<div id="konto_db"></div>
<div id="importkasten"></div>
<h2 id="scheine_titel">Kombinationen</h2>
<div id="verlaufschalter" class="vf-schalter"></div>
<div id="scheine_db"></div>
<div id="ergebnisse"></div>
</div>

<div id="blk_buch" class="mb-block">
<div id="buchhaltung"></div>
</div>

<div id="ans_profil" class="mb-ansicht">
<div class="ansicht-kopf"><button class="zurueckknopf" onclick="mbAnsichtZu()">&#8592; Zurück</button>
<h2>&#128100; Mein Profil</h2></div>
<div class="kern">Angemeldet als <b>${ich.username}</b>
  <button onclick="supaAbmelden().then(()=>location.reload())">Abmelden</button></div>
<details class="mini e2ehinweis"><summary>&#128274; Ende-zu-Ende verschlüsselt - was heisst das?</summary>
Nachrichten, Scheine, Personen-Namen, Notizen und Anmerkungen liegen nur verschlüsselt in der
Datenbank - lesbar allein für dich und die, denen du teilst. Wichtig: setzt du dein Passwort auf
einem NEUEN Gerät zurueck, sind alte Nachrichten dort nicht mehr lesbar. Reine Zahlenspalten der
Buchhaltung (Beträge, Daten) bleiben Zahlen, damit die Tabellen rechnen können.</details>
<div id="blk_profil"></div>
</div>

<div id="ans_freunde" class="mb-ansicht">
<div class="ansicht-kopf"><button class="zurueckknopf" onclick="mbAnsichtZu()">&#8592; Zurück</button>
<h2>&#128101; Freunde &amp; Teilen</h2></div>
<div id="freunde"></div>
<div id="teilen"></div>
</div>

<div id="ans_chat" class="mb-ansicht">
<div class="ansicht-kopf"><button class="zurueckknopf" onclick="mbAnsichtZu()">&#8592; Zurück</button>
<h2>&#128172; Chat dieses Bereichs</h2></div>
<p class="mini">Alle, die diesen Bereich sehen können, können hier schreiben. So benachrichtigt
ihr euch gegenseitig; die Zahl am Chat-Knopf oben zeigt neue Nachrichten.</p>
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
  // Stand eine eigene Ansicht offen (Profil/Freunde/Chat), bleibt sie es
  // auch nach einem Neuaufbau, z. B. beim Bereichswechsel aus dem Chat
  // heraus. Den Chat laedt gleich zeichneBereich - nicht doppelt laden.
  if (mbAnsicht) mbAnsichtOeffnen(mbAnsicht, true);
  // Benachrichtigungs-Zeile gibt es hier nicht mehr (Karam, 02.09.):
  // die Klingel oben in der Kopfleiste (wecker_knopf, benachrichtigung.js)
  // zeigt den Zustand und oeffnet dasselbe Panel.
  pruefeSchluessel();
  // Fehlende Bereichsschluessel an meine Gaeste nachliefern. Laeuft NACH dem
  // Aufbau der Seite, sonst gibt es kein Feld fuer die Meldung.
  supaSchluesselNachliefern().then(s => {
    if (s.nachgeliefert)
      meldungM("&#128273; <b>" + s.nachgeliefert + " Freigabe(n) freigeschaltet.</b> Wer deinen Bereich " +
        "sehen darf, kann jetzt wirklich alles lesen und mitarbeiten - vorher standen dort nur Schlösser.", "gut");
    else if (s.offen)
      meldungM("<b>" + s.offen + " Freigabe(n) warten noch.</b> Diese Leute waren noch nie mit der " +
        "verschlüsselten Fassung angemeldet. Sobald sie sich einmal anmelden, wird der Schlüssel " +
        "beim nächsten Laden automatisch nachgeliefert.", "warn");
  });
  await zeichneTabs();
  // Freunde, Teilen und Buchhaltung werden erst gezeichnet, wenn ihre
  // Ansicht bzw. ihr Block wirklich aufgeht (Falle 5 der Umbau-Karte:
  // zeichneFreunde macht eine Zaehl-Abfrage PRO Kontakt).
  zeichneImport();
  await zeichneBereich();
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
  ["tag", "&#128197; Tagesübersicht"],
  ["kombis", "&#127919; Kombinationen und Personen"],
  ["buch", "&#128210; Buchhaltung"],
  ["pruefen", "&#128269; Nachrechnen"]
];

// Profil, Freunde & Teilen und Chat sind seit dem 02.09. KEINE Bloecke
// mehr, sondern eigene Ansichten hinter den Knoepfen oben.
const MB_ANSICHTEN = ["profil", "freunde", "chat"];

function mbAktiverBlock() {
  const b = localStorage.getItem("kt_mb_block") || "kombis";
  return MB_BLOECKE.some(x => x[0] === b) ? b : "kombis";
}

function mbBlockZeigen(kurz) {
  // Alte Aufrufer (z. B. der Profil-Knopf in der Navileiste) kennen die
  // frueheren Blocknamen noch - sie landen in der jeweiligen Ansicht.
  if (MB_ANSICHTEN.includes(kurz)) { mbAnsichtOeffnen(kurz); return; }
  localStorage.setItem("kt_mb_block", kurz);
  // Die Tagesuebersicht wird erst beim Aufmachen gerechnet - sie geht
  // ueber alle Personen und soll nicht bei jedem Zeichnen mitlaufen.
  if (kurz === "tag" && typeof zeichneTagesuebersicht === "function") zeichneTagesuebersicht();
  // Die Buchhaltung genauso (Falle 5): sie laedt ihre Buchungen selbst
  // und wird nach dem Datenladen von zeichneBereich nochmal aufgefrischt.
  if (kurz === "buch" && typeof zeichneBuchhaltung === "function") zeichneBuchhaltung();
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

// ---------- Die eigenen Ansichten: Profil, Freunde & Teilen, Chat ----------
// Karams Wunsch vom 02.09.: das sind eigene Seiten hinter den Knoepfen oben,
// nicht mehr Teil der Block-Leiste. Welche offen ist, steht NUR hier im
// Speicher - nie in localStorage, sonst startet die App beim naechsten
// Laden in der Sonder-Ansicht statt im Alltag (Falle 4 der Umbau-Karte).

let mbAnsicht = null;   // null | "profil" | "freunde" | "chat"

// Die Ansichten haengen an den Kopfleisten-Knoepfen ganz oben (Karams
// Wunsch: nichts doppelt). Der Profil-Knopf kommt aus profil.js, die
// beiden anderen stehen in mein.html; glocke.js leitet sie hierher um.
const MB_ANSICHT_KNOPF = { profil: "nav_profil", freunde: "nav_freunde", chat: "nav_nachrichten" };

function mbAnsichtOeffnen(name, nurZeigen) {
  // Beim Wechsel weg von Freunden das DM-Polling stoppen (Falle 6).
  if (mbAnsicht === "freunde" && name !== "freunde" && dmTimer) {
    clearInterval(dmTimer); dmTimer = null;
  }
  mbAnsicht = name;
  document.body.classList.add("mb-sonder");
  for (const n of MB_ANSICHTEN) {
    const a = el("ans_" + n);
    if (a) a.classList.toggle("offen", n === name);
    const k = el(MB_ANSICHT_KNOPF[n]);
    if (k) k.classList.toggle("aktiv", n === name);
  }
  window.scrollTo(0, 0);
  if (name === "profil") {
    // Erst beim Aufmachen bauen und fuellen - kostet sonst nichts.
    const b = el("blk_profil");
    if (b && typeof profilBlockHtml === "function") {
      if (!b.dataset.gebaut) { b.innerHTML = profilBlockHtml(); b.dataset.gebaut = "1"; }
      if (typeof profilBlockFuellen === "function") profilBlockFuellen();
    }
  }
  if (name === "freunde") { zeichneFreunde(); zeichneTeilen(); }
  // Chat erst laden, wenn er wirklich sichtbar ist: ladeChat markiert als
  // gelesen und scrollt ans Ende - beides braucht die OFFENE Ansicht
  // (Fallen 1 und 2). nurZeigen kommt vom Neuaufbau in zeigeApp, dort
  // laedt gleich danach zeichneBereich den Chat selbst.
  if (name === "chat" && !nurZeigen) ladeChat(true);
}

function mbAnsichtZu() {
  // Freunde-Ansicht zu = DM-Polling aus (Falle 6). Der Timer wuerde sonst
  // unsichtbar weiterladen und alles als gelesen markieren.
  if (dmTimer) { clearInterval(dmTimer); dmTimer = null; }
  mbAnsicht = null;
  document.body.classList.remove("mb-sonder");
  for (const n of MB_ANSICHTEN) {
    const a = el("ans_" + n);
    if (a) a.classList.remove("offen");
    const k = el(MB_ANSICHT_KNOPF[n]);
    if (k) k.classList.remove("aktiv");
  }
}

async function zeichneTabs() {
  const box = el("bereichtabs");
  if (!box) return;
  box.innerHTML = "";
  for (const b of meineBereiche) {
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.bereich = b.id;
    a.className = "navknopf" + (b.id === aktiverBereich.id ? " aktiv" : "");
    // Der Zaehler steckt in einem festen Platzhalter; die Zahl selbst
    // schreibt NUR bereichBadges hinein - eine Stelle, kein Drift.
    a.innerHTML = (b.rolle === "ich" ? "Mein Bereich" : "Bereich von " + b.username) +
      (b.rolle === "friend" ? ' <span class="mini">(nur lesen)</span>' : "") +
      (b.rolle === "close" ? ' <span class="mini">(mitarbeiten)</span>' : "") +
      ' <span class="badge" style="display:none"></span>';
    a.onclick = (ev) => { ev.preventDefault(); aktiverBereich = b; zeigeApp(); };
    box.appendChild(a);
    // Fixieren gibt es nur fuer GETEILTE Bereiche: der eigene meldet
    // sich sowieso. Der Pin ist ein eigener Knopf NEBEN dem Tab, damit
    // der Tab-Klick (Bereich wechseln) unberuehrt bleibt.
    if (b.rolle !== "ich") {
      const p = document.createElement("button");
      const an = meinePins.has(b.id);
      p.type = "button";
      p.className = "tab-pin" + (an ? " aktiv" : "");
      p.innerHTML = "&#128204;";
      p.title = an
        ? "Fixiert: die Gewonnen/Verloren-Meldungen dieses Bereichs kommen auf deine Geräte. Klick = wieder lösen."
        : "Fixieren: dann kommen die Gewonnen/Verloren-Meldungen dieses Bereichs auch auf deine Geräte.";
      p.onclick = (ev) => { ev.preventDefault(); tuBereichPin(b.id, b.username); };
      box.appendChild(p);
    }
  }
  await bereichBadges();
  // Fremder Bereich ohne Schluessel: der Gast sieht sonst nur Schloesser
  // und weiss nicht warum. Er kann sich auch nicht selbst helfen - den
  // Bereichsschluessel hat nur der Besitzer.
  if (aktiverBereich && aktiverBereich.rolle !== "ich" &&
      typeof kryptoBereich === "function" && !(await kryptoBereich(aktiverBereich.id))) {
    const w = document.createElement("div");
    w.className = "warnkern schluesselwarnung";
    w.innerHTML = "&#128274; <b>Der Bereich von " + textSicherM(aktiverBereich.username) +
      " ist für dich noch zugesperrt.</b> Du darfst hinein, aber der Schlüssel fehlt dir. " +
      "Den kann nur " + textSicherM(aktiverBereich.username) + " selbst herausgeben: " +
      "er muss sich einmal in Mein Bereich anmelden, dann geht das von allein. " +
      "Danach hier einmal neu laden.";
    box.parentNode.insertBefore(w, box.nextSibling);
  }
}

// Pin an/aus. Nach dem Speichern werden NUR die Tabs neu gezeichnet -
// die Meldung sagt ehrlich, was der Pin tut und was nicht.
async function tuBereichPin(bereichId, username) {
  const an = !meinePins.has(bereichId);
  const r = await supaPinSetzen(bereichId, an);
  if (r.error) { meldungM("Nicht gespeichert: " + r.error.message, "warn"); return; }
  if (an) meinePins.add(bereichId); else meinePins.delete(bereichId);
  meldungM(an
    ? "&#128204; <b>Bereich von " + textSicherM(username) + " fixiert.</b> Wenn der Server-Wächter dort " +
      "eine Kombination als gewonnen oder verloren meldet, klingelt es jetzt auch auf DEINEN Geräten " +
      "(die Klingel muss auf dem Gerät eingeschaltet sein - oben das &#128276;)."
    : "Fixierung gelöst: vom Bereich von " + textSicherM(username) + " kommen keine Wächter-Meldungen mehr an dich.",
    an ? "gut" : "warn");
  // Reihenfolge der Tabs (gepinnt zuerst) stimmt erst nach dem naechsten
  // vollen Aufbau; die Knopf-Farbe stimmt sofort.
  await zeichneTabs();
}

async function neueNachrichten(bereichId) {
  const gelesen = parseInt(localStorage.getItem("kt_gelesen_" + bereichId) || "0", 10);
  const r = await supa.from("kt_nachrichten").select("id", { count: "exact", head: true })
    .eq("bereich", bereichId).gt("id", gelesen);
  return r.count || 0;
}

// Frischt NUR die Zaehler an den Bereichs-Tabs auf. Bewusst OHNE die Tabs
// neu zu bauen - der 10-Sekunden-Takt darf keine halb angeklickten Knoepfe
// wegreissen und keine Warnkaesten verdoppeln. Der Zaehler am 💬-Knopf
// in der Kopfleiste gehoert allein glockeZaehlen (glocke.js) - EINE Stelle.
async function bereichBadges() {
  const box = el("bereichtabs");
  if (!box) return;
  for (const b of meineBereiche) {
    const neu = await neueNachrichten(b.id);
    const badge = box.querySelector('a[data-bereich="' + b.id + '"] .badge');
    if (badge) { badge.textContent = neu; badge.style.display = neu > 0 ? "" : "none"; }
  }
}

// Der 10-Sekunden-Takt. Frueher lief ladeChat IMMER mit und markierte alles
// sofort als gelesen - der Zaehler konnte deshalb nie etwas zeigen
// (Falle 1). Jetzt: Nachrichten nur bei offener Chat-Ansicht nachladen,
// sonst nur die Zaehler auffrischen.
async function chatTakt() {
  if (mbAnsicht === "chat") await ladeChat(false);
  else await bereichBadges();
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

// Frueher hiess es IMMER "Rolle geaendert" - auch wenn gar nichts
// gespeichert wurde, und auch dann, wenn der Schluessel fehlte.
async function tuRolle(gastId, rolle) {
  const r = await supaTeilen(gastId, rolle);
  if (r && r.error) {
    meldungM("Rolle NICHT geändert: " + textSicherM(String(r.error.message).slice(0, 120)), "warn");
    return;
  }
  if (r && r.ohneSchluessel) {
    meldungM("Rolle geändert. <b>Hinweis:</b> auf diesem Gerät fehlt gerade der Schlüssel, " +
      "deshalb konnte keiner mitgegeben werden. Ein bereits vergebener Schlüssel bleibt " +
      "unverändert gültig - drück später einmal Teilen, wenn der rote Kasten oben weg ist.", "warn");
    zeichneTeilen();
    return;
  }
  meldungM("Rolle geändert.", "gut");
  zeichneTeilen();
}
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
  const liegenGeblieben = [];   // nur die, die NICHT durchgingen
  let ersterFehler = "";
  for (const e of lokal) {
    const foto = e.scheinId ? localStorage.getItem("foto_" + e.scheinId) : null;
    const fotoName = e.scheinId ? localStorage.getItem("foto_" + e.scheinId + "_name") : null;
    // scheinId und satz MUESSEN mit: ohne sie kann der Kombi-Bau nicht
    // erkennen, dass diese Kombination schon gesetzt ist, und alle
    // uebernommenen Scheine fielen dort auf einen gemeinsamen Topf.
    const r = await supaScheinAnlegen(ich.id,
      { zeit: e.zeit, scheinId: e.scheinId, satz: e.satz, nummer: e.nummer,
        kz: e.kz, anbieter: e.anbieter, einsatz: e.einsatz, quote: e.quote,
        moeglich: e.moeglich, wetten: e.wetten, stand: e.stand, notiz: e.notiz || "" },
      foto, fotoName, null, e.nummer);
    if (!r.error) ok++;
    else {
      liegenGeblieben.push(e);
      if (!ersterFehler) ersterFehler = String(r.error.message || r.error);
    }
  }
  if (ok === lokal.length) {
    localStorage.removeItem("verlauf");
    meldungM("Alle " + ok + " Scheine übernommen und lokal aufgeraeumt. Sie liegen unter " +
      "\"ohne Person\" - bitte in der Tabelle den Personen zuordnen.", "gut");
  } else {
    // NUR die nicht uebernommenen bleiben liegen. Frueher blieb alles
    // liegen, und der zweite Druck auf den Knopf legte die schon
    // gespeicherten Scheine ein zweites Mal an.
    try { localStorage.setItem("verlauf", JSON.stringify(liegenGeblieben)); }
    catch (e) { /* voller Speicher: dann bleibt eben die alte Liste stehen */ }
    meldungM("<b>" + ok + " von " + lokal.length + " übernommen.</b> Die " +
      liegenGeblieben.length + " nicht übernommenen bleiben lokal liegen - drück den Knopf " +
      "gleich noch einmal, dann werden NUR diese versucht. Die schon gespeicherten " +
      "werden nicht doppelt angelegt." +
      (ersterFehler ? " Grund: " + textSicherM(ersterFehler.slice(0, 120)) : ""), "warn");
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

// Warnt, wenn Scheine auf DIESEM Geraet nicht lesbar sind. Solange das so
// ist, sind alle Geldsummen darunter zu niedrig - das muss man sehen,
// bevor man ihnen glaubt.
// Zeigt einen roten Kasten und laesst ALLES andere stehen, wie es war.
function zeichneLadefehler(grund) {
  const alt = document.getElementById("ladefehler");
  if (alt) alt.remove();
  const ziel = el("scheine_titel");
  if (!ziel || !ziel.parentNode) return;
  const d = document.createElement("div");
  d.id = "ladefehler";
  d.className = "gesperrtwarn";
  d.innerHTML = "<b>&#9888; Laden fehlgeschlagen - es wurde NICHTS geändert.</b>" +
    "<p>Deine Daten liegen unverändert auf dem Server. Nur das Holen hat gerade nicht " +
    "geklappt, deshalb steht hier noch der alte Stand. <b>Trag jetzt nichts Neues ein</b> - " +
    "lad die Seite in einem Moment einfach neu.</p>" +
    '<p class="mini">Grund: ' + textSicherM(String(grund).slice(0, 160)) + "</p>";
  ziel.parentNode.insertBefore(d, ziel.nextSibling);
}

// Raeumt den roten Kasten weg, sobald es wieder geht.
function zeichneLadefehlerWeg() {
  const alt = document.getElementById("ladefehler");
  if (alt) alt.remove();
}

function zeichneGesperrtWarnung(scheine) {
  const alt = document.getElementById("gesperrt_warnung");
  if (alt) alt.remove();
  const liste = (scheine || []).filter(s => s.daten && s.daten.gesperrt);
  if (!liste.length) return;
  const ziel = el("scheine_titel");
  if (!ziel || !ziel.parentNode) return;
  const d = document.createElement("div");
  d.id = "gesperrt_warnung";
  d.className = "gesperrtwarn";
  d.innerHTML =
    "<b>&#9888; " + liste.length + (liste.length === 1
      ? " Kombination lässt sich" : " Kombinationen lassen sich") +
    " auf diesem Gerät nicht entschlüsseln.</b>" +
    "<p>Sie stehen unten mit <b>0,00 &euro;</b> in der Tabelle. Damit sind <b>alle Summen " +
    "auf dieser Seite zu niedrig</b>: Einsätze, \"im Spiel\", die Anbieter-Tabelle und die " +
    "Buchhaltung. Glaub den Zahlen erst, wenn dieser Kasten weg ist.</p>" +
    "<p class=\"mini\">Das passiert auf einem Gerät, dem der Schlüssel fehlt (neues Handy, " +
    "Browserdaten gelöscht) oder als Gast in einem geteilten Bereich ohne Schlüssel. " +
    "Meist hilft: einmal abmelden und auf dem gewohnten Gerät wieder anmelden. " +
    "<b>Es ist nichts verloren</b> - die Scheine liegen unverändert in der Datenbank.</p>";
  ziel.parentNode.insertBefore(d, ziel.nextSibling);
}

async function zeichneBereich() {
  // innerHTML statt textContent: textContent zeigte die Zeichenfolge
  // "&#127919;" woertlich an. Der Benutzername ist fremder Text -> textSicherM.
  el("scheine_titel").innerHTML = (aktiverBereich.rolle === "ich")
    ? "&#127919; Meine Kombinationen" : "&#127919; Kombinationen von " + textSicherM(aktiverBereich.username);
  const scheine = await supaScheineLaden(aktiverBereich.id);
  const ordnerNeu = await supaOrdnerLaden(aktiverBereich.id);
  // Ging EINES der Laden schief, wird gar nichts neu gezeichnet. Sonst
  // stuende ueberall 0,00 Euro - und es saehe genauso aus, als waeren die
  // Daten weg. Genau dieses Bild gab es hier schon einmal.
  const ladefehler = scheine._fehler || ordnerNeu._fehler;
  if (ladefehler) { zeichneLadefehler(ladefehler); return; }
  ordnerListe = ordnerNeu;
  if (ordnerFilter !== "alle" && ordnerFilter !== "ohne" &&
      !ordnerListe.some(o => o.id === ordnerFilter)) ordnerFilter = "alle";
  personBuchungen = await supaPersonBuchungenLaden(aktiverBereich.id);
  personDatenKarte = await supaPersonDatenLaden(aktiverBereich.id);
  anmerkungenListe = await supaAnmerkungenLaden(aktiverBereich.id);
  zeichneLadefehlerWeg();
  kasseScheine = scheine;
  // Ergebnisse: Eingabetafel zeichnen und alles Offene durchrechnen.
  // NACH dem Fuellen von kasseScheine, sonst rechnet es auf der alten
  // Liste. ergebnisseAuswerten schuetzt sich selbst gegen Schleifen.
  if (typeof ergebnisseZeichnen === "function") ergebnisseZeichnen();
  if (typeof ergebnisseAuswerten === "function") ergebnisseAuswerten();
  zeichneAnbieterKopf();
  zeichneGesperrtWarnung(scheine);
  zeichneOrdnerBox(scheine);
  zeichnePersonenKasse(scheine);
  zeichnePruefung(scheine);
  const gefiltert = (ordnerFilter === "alle") ? scheine
    : (ordnerFilter === "ohne") ? scheine.filter(s => !s.ordner)
    : scheine.filter(s => s.ordner === ordnerFilter);
  zeichneKontoDb(gefiltert);
  zeichneScheineDb(gefiltert);
  // Steht die Tagesuebersicht gerade offen, muss sie die neuen Zahlen sehen.
  if (mbAktiverBlock() === "tag" && typeof zeichneTagesuebersicht === "function")
    zeichneTagesuebersicht();
  // Die Buchhaltung ebenso - sie rechnet mit den offenen Scheinen
  // (bbScheinLage liest kasseScheine, das gerade neu gefuellt wurde).
  if (mbAktiverBlock() === "buch") zeichneBuchhaltung();
  // Chat NUR laden, wenn seine Ansicht offen ist (Falle 1): ladeChat
  // markiert alles als gelesen, und das darf nicht unsichtbar passieren.
  if (mbAnsicht === "chat") await ladeChat(true);
  if (chatTimer) clearInterval(chatTimer);
  chatTimer = setInterval(chatTakt, 10000);
  // Selbstsuche: Endstaende vorbeier Spiele automatisch holen und
  // auswerten (ergebnisse.js). Ohne await - sie meldet sich selbst.
  // Je Spiel fragt sie hoechstens alle 30 Minuten an, der Takt hier
  // schaut nur alle 10 Minuten nach, ob ein Spiel fertig geworden ist.
  if (typeof ergebnisseSelbstSuchen === "function") {
    ergebnisseSelbstSuchen();
    if (ergSucheTimer) clearInterval(ergSucheTimer);
    ergSucheTimer = setInterval(ergebnisseSelbstSuchen, 10 * 60000);
  }
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
  zeichneVerlaufSchalter(scheine);
  if (!scheine.length) { el("scheine_db").innerHTML = '<p class="mini">Noch keine Scheine hier. ' +
    'Im <a href="kombis.html">Kombi-Bau</a> Scheine bauen und "In den Verlauf" drücken.</p>'; return; }

  // Die zwei Verlaeufe. Gefiltert wird erst HIER, damit der Schalter
  // immer alle Zahlen zeigt - sonst stuende auf dem Knopf "Voll (0)",
  // nur weil gerade nach "unter" gefiltert ist.
  const gruppen = verlaufGruppen(scheine);
  // Ueber ALLE Kombinationen, nicht erst nach dem Filtern: sonst faende
  // man die zwei Haelften eines Doppeleintrags nie zusammen.
  const dopp = doppelteM(scheine);
  const doppZuviel = Object.keys(dopp).filter(id => dopp[id].spaeter).length;
  const filter = verlaufFilterLesen();
  const alleZahl = scheine.length;
  // Anbieter-Kopf: ein Klick auf Stake/Interwetten/... filtert die Liste.
  if (anbieterFilter !== "alle") scheine = scheine.filter(s => s.daten && s.daten.kz === anbieterFilter);
  if (filter !== "alle") scheine = scheine.filter(s => {
    const g = gruppen[stammIdM(s.daten && s.daten.scheinId)];
    return g && (filter === "voll" ? g.voll : !g.voll);
  });
  if (!scheine.length) {
    el("scheine_db").innerHTML = '<p class="mini">' +
      (anbieterFilter !== "alle"
        ? "Keine Kombination bei " + anbieterNameM(anbieterFilter) + " unter diesem Filter."
        : (filter === "unter"
          ? "Alles ist voll gesetzt - hier ist nichts offen."
          : "Noch keine Kombination hat den vollen Einsatz erreicht.")) +
      ' (' + alleZahl + ' Einträge ausgeblendet)</p>';
    return;
  }
  const schreib = darfSchreiben();
  // Das Stift-Formular (Foto, Quoten je Wette, Datum, Stand) erscheint
  // ueber der Liste - die Personen-Kasse hat keine eigene Kombi-Liste
  // mehr, also braucht das Bearbeiten hier einen Platz.
  let pkForm = "";
  if (typeof pkOffen !== "undefined" && pkOffen && pkOffen.scheinId &&
      typeof pkFormularHtml === "function") pkForm = pkFormularHtml(pkOffen.ordnerId || "");
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
    const gr = gruppen[stammIdM(d.scheinId)];
    if (gr && !gr.voll) zklassen.push("unterziel");
    const dp = dopp[s.id];
    if (dp && dp.spaeter) zklassen.push("doppelzeile");
    html += "<tr" + (zklassen.length ? " class='" + zklassen.join(" ") + "'" : "") + "><td class='mini'>" + zeitM(s.created_at) + "</td><td>" + markeM(d.kz) + standMarke(s) + "</td>" +
      "<td>" + ordnerZelle + "</td>" +
      // Spiel, Linie, Fotoname und das Foto selbst kommen von Menschen und
      // muessen als TEXT eingesetzt werden, nie als HTML (siehe textSicherM).
      "<td class='mini'>" + (d.wetten || []).map(t =>
        textSicherM(t.spiel) + " (" + textSicherM(t.linie) + ")").join("<br>") +
      (s.foto ? '<div class="fotoname mini">' + textSicherM(s.foto_name || "") + "</div>" +
        '<div><img src="' + textSicherM(s.foto) + '" class="minifoto"></div>' : "") +
      (dopp[s.id]
        ? '<div class="doppelmark">' + (dopp[s.id].spaeter
            ? "&#9888; doppelt gespeichert (" + dopp[s.id].platz + ". von " +
              dopp[s.id].zahl + ") - diese hier kann weg"
            : "steht " + dopp[s.id].zahl + "-mal im Verlauf - <b>das hier ist der erste</b>") +
          "</div>"
        : "") +
      anmerkungenBlock(s) + "</td>" +
      "<td><b>" + (d.quote || 0).toFixed(2) + "</b></td><td>" + einsatzZelle(s, schreib) +
        luecken(gruppen[stammIdM(d.scheinId)]) + "</td>" +
      "<td>" + (d.moeglich || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + echtZelle(s, schreib) + "</td>" +
      "<td class='standzelle st-" + s.stand + "'>" + (schreib
        ? "<select onchange=\"tuStand('" + s.id + "', this.value)\">" +
          ["offen", "gewonnen", "verloren"].map(o => "<option" + (s.stand === o ? " selected" : "") + ">" + o + "</option>").join("") + "</select>"
        : s.stand) +
      (scheinWartet(s) ? "<div class='mini fertigmark'>alle Spiele aus - Ergebnis?</div>" : "") + "</td>" +
      "<td class='notizzelle'>" + (schreib
        // Auch die Notiz: sie steht zwar in einem textarea, aber ein
        // </textarea> darin wuerde das Feld schliessen und den Rest als
        // HTML in die Seite entlassen.
        ? "<textarea class='notizfeld' onchange=\"tuNotiz('" + s.id + "', this.value)\">" + textSicherM(s.notiz || "") + "</textarea>"
        : "<span class='mini'>" + textSicherM(s.notiz || "") + "</span>") + "</td>" +
      "<td>" + (aktiverBereich.rolle !== "ich"
        ? "<button onclick=\"tuKopieren('" + s.id + "')\">zu mir kopieren</button> " : "") +
        (schreib ? "<button title='Bearbeiten: Foto, Quoten je Wette, Datum, Nummer' " +
          "onclick=\"pkBearbeiten('" + (s.ordner || "") + "','" + s.id + "')\">&#9999;&#65039;</button> " : "") +
        (schreib ? "<button class='knopfweg' title='Diese Kombination loeschen' " +
          "onclick=\"tuLoeschen('" + s.id + "')\">&#128465;</button>" : "") + "</td></tr>";
  }
  el("scheine_db").innerHTML = pkForm +
    (doppZuviel
      ? '<div class="warnkern"><b>&#9888; ' + doppZuviel + " Kombination" +
        (doppZuviel === 1 ? "" : "en") + " doppelt gespeichert.</b> " +
        "Dieselben Wetten beim selben Anbieter stehen mehr als einmal hier. " +
        "Jeder Doppeleintrag zählt als zweiter Einsatz und drückt das Guthaben " +
        "der Person um genau diesen Betrag. Die markierten Zeilen können weg - " +
        "der erste Eintrag bleibt.</div>"
      : "") +
    html + "</tbody></table>";
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

// MIT RUECKFRAGE und mit Pruefung, ob es wirklich geklappt hat.
// Frueher wurde sofort geloescht und das Ergebnis weggeworfen: schlug es
// fehl (Rechte, Netz), stand die Kombination nach dem naechsten Laden
// einfach wieder da, ohne dass jemand wusste warum.
async function tuLoeschen(id) {
  const s = (kasseScheine || []).find(x => x.id === id);
  const d = (s && s.daten) || {};
  const spiele = Array.isArray(d.wetten) ? d.wetten.map(t => t.spiel).join("\n") : "";
  const frage = "Diese Kombination wirklich loeschen?\n\n" +
    (d.anbieter || "?") + ", " + Number(d.einsatz || 0).toFixed(2) + " Euro, Quote " +
    Number(d.quote || 0).toFixed(2) + "\n" + spiele + "\n\n" +
    "Das laesst sich nicht rueckgaengig machen.";
  if (!confirm(frage)) return;
  const r = await supaScheinLoeschen(id);
  if (r && r.error) {
    meldungM("NICHT geloescht: " + textSicherM(String(r.error.message).slice(0, 140)), "warn");
    return;
  }
  if (r && r.data && r.data.length === 0) {
    meldungM("Nicht geloescht - dazu fehlt dir das Recht. In einem fremden Bereich " +
      "darf nur der Besitzer loeschen.", "warn");
    return;
  }
  meldungM("Kombination geloescht.", "gut");
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
  for (const [w] of KASSE_WEGE) wege[w] = { erhalten: 0, hin: 0, zurueck: 0, stand: 0, korrektur: 0 };
  const anbieter = {};
  for (const [kz] of KASSE_ANBIETER) anbieter[kz] = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, guthaben: 0, korrektur: 0 };
  for (const b of buch) {
    const betrag = Number(b.betrag) || 0;
    // Die zwei Korrektur-Arten zuerst: "stand_anbieter" hat gar keinen
    // Zahlungsweg und wuerde sonst gleich unten herausfliegen.
    if (b.art === "stand_anbieter") {
      if (anbieter[b.anbieter]) anbieter[b.anbieter].korrektur += betrag;
      continue;
    }
    if (b.art === "stand_weg") {
      if (wege[b.weg]) wege[b.weg].korrektur += betrag;
      continue;
    }
    if (!wege[b.weg]) continue;
    if (b.art === "erhalten") wege[b.weg].erhalten += betrag;
    else if (b.art === "ausgezahlt") wege[b.weg].raus = (wege[b.weg].raus || 0) + betrag;
    else if (b.art === "zum_anbieter") { wege[b.weg].hin += betrag; if (anbieter[b.anbieter]) anbieter[b.anbieter].einge += betrag; }
    else { wege[b.weg].zurueck += betrag; if (anbieter[b.anbieter]) anbieter[b.anbieter].geholt += betrag; }
  }
  const probleme = [];
  for (const s of meine) {
    const a = anbieter[s.daten.kz];
    if (!a) continue;
    a.einsatz += s.daten.einsatz || 0;
    if (s.stand === "gewonnen") {
      a.gewonnen += echtZurueckWert(s);
      // Stiller-0-Schutz (Karam, 03.09.): gewonnen, aber weder "wirklich
      // bekommen" noch ein Moeglich-Wert - dann wuerde der Person NICHTS
      // gutgeschrieben, ohne dass es jemand sieht. Das MUSS dastehen.
      if (echtZurueckWert(s) <= 0)
        probleme.push("Kombination Nr. " + (s.nummer || "?") + " ist GEWONNEN, aber es steht kein " +
          "Betrag dran (weder \"wirklich bekommen\" noch ein Möglich-Wert). Der Gewinn fehlt im " +
          "Konto, bis du ihn bei der Kombination einträgst.");
    }
    if (s.stand === "offen") {
      a.imSpiel = (a.imSpiel || 0) + (s.daten.einsatz || 0);
      a.moeglichOffen = (a.moeglichOffen || 0) + (s.daten.moeglich || 0);
      if (scheinWartet(s)) a.wartet = (a.wartet || 0) + 1;
      const e = scheinEnde(s);
      if (e && (!a.endeMax || e > a.endeMax)) a.endeMax = e;
    }
  }
  for (const [w, nameW] of KASSE_WEGE) {
    const x = wege[w];
    x.stand = x.erhalten - x.hin + x.zurueck - (x.raus || 0) + (x.korrektur || 0);
    if (x.stand < -0.004) probleme.push(nameW + " ist im Minus (" + x.stand.toFixed(2) +
      " Euro): mehr weitergezahlt als erhalten. Buchung vergessen oder falsch eingetragen.");
  }
  for (const [kz, nameA] of KASSE_ANBIETER) {
    const a = anbieter[kz];
    a.guthaben = a.einge - a.geholt - a.einsatz + a.gewonnen + (a.korrektur || 0);
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
  // Alle Korrekturen zusammen. Sie stecken oben schon in den Staenden -
  // hier werden sie aus der Gewinnrechnung wieder herausgenommen, weil
  // niemand weiss, woher das Geld kam. Genau so hat Karam es entschieden.
  const korrekturGesamt =
    Object.values(wege).reduce((p, x) => p + (x.korrektur || 0), 0) +
    Object.values(anbieter).reduce((p, x) => p + (x.korrektur || 0), 0);
  return { wege: wege, anbieter: anbieter, probleme: probleme, buch: buch,
    eingesamt: eingesamt, erhaltengesamt: erhaltengesamt, ausgezahlt: ausgezahlt,
    aufWegen: aufWegen, beiAnbietern: beiAnbietern, imSpiel: imSpiel,
    korrekturGesamt: korrekturGesamt,
    bilanz: (aufWegen + beiAnbietern + imSpiel + ausgezahlt) - erhaltengesamt - korrekturGesamt };
}

// Wann ist ein Schein "fertig"? Wenn das letzte Spiel darin sicher aus ist
// (Anstoss + 3 Stunden Spieldauer-Puffer). Ein fertiger OFFENER Schein
// wartet auf Karams Bericht: gewonnen oder verloren.
function scheinEnde(s) {
  if (typeof liesAnstoss !== "function") return null;
  let ende = null;
  for (const t of (s.daten.wetten || [])) {
    // Seit 20260902a traegt jedes Bein seine Anstosszeit selbst (an).
    // Nur alte Eintraege ohne "an" muessen in der Tafel nachschlagen.
    let an = t.an || "";
    if (!an) {
      const w = (typeof WETTEN !== "undefined") ? WETTEN.find(x => x.id === t.id) : null;
      if (!w) return null;                      // Zeit unbekannt: nicht werten
      an = anstossFeld(w);
    }
    const a = liesAnstoss(an);
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

// Karam (02.09.): an JEDER Kombination soll direkt unter dem Anbieter
// stehen, ob sie gewonnen oder verloren ist - und bei offenen, WANN das
// Ergebnis kommt (letzter Anstoss + 3 h, dieselbe Rechnung wie scheinEnde).
function standMarke(s) {
  if (s.stand === "gewonnen") return '<div class="st-mark st-gewonnen">&#10004; gewonnen</div>';
  if (s.stand === "verloren") return '<div class="st-mark st-verloren">&#10008; verloren</div>';
  const e = scheinEnde(s);
  if (!e) return '<div class="st-mark st-offen">offen</div>';
  if (new Date() > e) return '<div class="st-mark st-offen">offen &middot; alle Spiele aus</div>';
  return '<div class="st-mark st-offen">offen &middot; Ergebnis ~ ' + kasseZeit(e) + "</div>";
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
  if (!meine.length) return '<p class="mini">Noch keine Kombinationen bei dieser Person.</p>' +
    (darfSchreiben() && typeof pkNeu === "function"
      ? '<p><button onclick="pkNeu(\'' + ordnerId + '\')">&#10133; Kombination von Hand anlegen</button></p>'
      : "") +
    (typeof pkFormularHtml === "function" ? pkFormularHtml(ordnerId) : "");
  const einsatz = meine.reduce((p, s) => p + (s.daten.einsatz || 0), 0);
  const offen = meine.filter(s => s.stand === "offen").length;
  const gew = meine.filter(s => s.stand === "gewonnen").length;
  const ver = meine.filter(s => s.stand === "verloren").length;
  let h = "<h3>&#127919; Kombinationen dieser Person (" + meine.length + ")</h3>" +
    '<p class="mini"><b>Gesamteinsatz ' + einsatz.toFixed(2) + " &euro;</b> - " + offen + " offen, " +
    '<span class="gruen">' + gew + " gewonnen</span>, <span class=\"rot\">" + ver + " verloren</span>. " +
    "Ein Schein hat drei Wetten; setzt du 400 &euro;, zählen die 400 &euro; für die ganze Kombination.</p>" +
    (darfSchreiben() && typeof pkNeu === "function"
      ? '<p><button onclick="pkNeu(\'' + ordnerId + '\')">&#10133; Kombination von Hand anlegen</button> ' +
        '<span class="mini">für ältere Kombinationen, die nicht über den Kombi-Bau gelaufen sind</span></p>'
      : "") +
    '<div class="tabellenrand"><table><thead><tr><th>Wann</th><th>Anbieter</th><th>Spiele</th>' +
    "<th>Quote</th><th>Einsatz</th><th>möglich</th><th>Stand</th><th>Foto</th><th></th></tr></thead><tbody>";
  for (const s of meine) {
    const d = s.daten;
    h += "<tr" + (scheinWartet(s) ? " class='fertigzeile'" : "") + ">" +
      "<td class='mini'>" + zeitM((d.handeingabe && d.zeit) ? d.zeit : s.created_at) +
        (d.handeingabe ? '<div class="pkmarke">von Hand</div>' : "") + "</td>" +
      "<td>" + markeM(d.kz) + "</td>" +
      "<td class='mini'>" + (d.wetten || []).map(t => textSicherM(t.spiel) +
        (t.linie ? " (" + textSicherM(t.linie) + ")" : "")).join("<br>") + "</td>" +
      "<td><b>" + (d.quote || 0).toFixed(2) + "</b></td>" +
      "<td>" + (d.einsatz || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + (d.moeglich || 0).toFixed(2) + " &euro;</td>" +
      "<td>" + s.stand + (scheinWartet(s) ? ' <span class="fertigbadge">Ergebnis?</span>' : "") + "</td>" +
      "<td>" + (s.foto ? '<img src="' + textSicherM(s.foto) + '" class="minifoto">' : '<span class="mini">-</span>') + "</td>" +
      "<td>" + (darfSchreiben() && typeof pkBearbeiten === "function"
        ? "<button title='Diese Kombination bearbeiten' " +
          "onclick=\"pkBearbeiten('" + ordnerId + "', '" + s.id + "')\">&#9998;</button> " +
          "<button class='knopfweg' title='Diese Kombination loeschen' " +
          "onclick=\"tuLoeschen('" + s.id + "')\">&#128465;</button>"
        : "") + "</td></tr>";
  }
  return h + "</tbody></table></div>" +
    (typeof pkFormularHtml === "function" ? pkFormularHtml(ordnerId) : "");
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
      "<th>zurück</th><th>ausgezahlt</th><th>Stand jetzt</th>" +
      (schreib ? "<th>wirklich drauf</th>" : "") + "</tr></thead><tbody>";
    for (const [w, nameW] of KASSE_WEGE) {
      if (zg.wege[w] === false) continue;
      const x = p.wege[w];
      html += "<tr><td>" + nameW + korrekturMarke(x.korrektur) + "</td><td>" + x.erhalten.toFixed(2) + " &euro;</td>" +
        "<td>" + x.hin.toFixed(2) + " &euro;</td><td>" + x.zurueck.toFixed(2) + " &euro;</td>" +
        "<td>" + (x.raus || 0).toFixed(2) + " &euro;</td>" +
        "<td class='" + (x.stand < -0.004 ? "rot" : "") + "'><b>" + x.stand.toFixed(2) + " &euro;</b></td>" +
        (schreib ? "<td>" + standFeld(person.id, "weg", w, x.stand) + "</td>" : "") + "</tr>";
    }
    html += "</tbody></table>" + standErklaerung(schreib);
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
      "<th>fertig</th><th>Ergebnis ab</th><th>liegt dort</th>" +
      (schreib ? "<th>wirklich drauf</th>" : "") + "</tr></thead><tbody>";
    for (const kz of ["iw", "bw", "b3", "st"]) {
      if (zg.anbieter[kz] === false) continue;
      const a = p.anbieter[kz];
      html += "<tr><td>" + markeM(kz) + korrekturMarke(a.korrektur) + "</td><td>" + a.einge.toFixed(2) + " &euro;</td>" +
        "<td>" + a.geholt.toFixed(2) + " &euro;</td><td>" + a.einsatz.toFixed(2) + " &euro;</td>" +
        "<td>" + (a.imSpiel || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + (a.moeglichOffen || 0).toFixed(2) + " &euro;</td>" +
        "<td>" + a.gewonnen.toFixed(2) + " &euro;</td>" +
        "<td>" + (a.wartet ? "<b class='rot'>" + a.wartet + "</b>" : "-") + "</td>" +
        "<td class='mini'>" + (a.endeMax ? kasseZeit(a.endeMax) : "-") + "</td>" +
        "<td class='" + (a.guthaben < -0.004 ? "rot" : "") + "'><b>" + a.guthaben.toFixed(2) + " &euro;</b></td>" +
        (schreib ? "<td>" + standFeld(person.id, "anbieter", kz, a.guthaben) + "</td>" : "") + "</tr>";
    }
    html += "</tbody></table>";
  }

  // ---------- Kombinationen ----------
  // Die Liste selbst steht NUR noch unten unter "Kombinationen" - Karam
  // sah jede Kombi doppelt (oben in der Kasse, unten in der Liste).
  // Hier bleibt die Zahl und der Weg, Altbestand von Hand nachzutragen.
  if (blockAn(zg, "kombis")) {
    const meineK = scheine.filter(s => s.ordner === person.id);
    html += '<div class="pk-kombihinweis mini">&#127919; ' + meineK.length +
      ' Kombination(en) dieser Person - stehen unten unter <b>Kombinationen</b> (Person-Filter oben nutzen).' +
      (schreib ? ' <button onclick="pkNeu(\'' + person.id + '\')">&#10133; Alte Kombination von Hand nachtragen</button>' : '') +
      '</div>';
    if (pkOffen && pkOffen.ordnerId === person.id && !pkOffen.scheinId) html += pkFormularHtml(person.id);
  }

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

// ---------- Buchhaltung als Bericht ("Das Armaturenbrett") ----------
// BITTE NICHT ANFASSEN: die Rechenwege sind unveraendert geblieben.
// Karams Formel bleibt Wort fuer Wort dieselbe:
//   Gewinn = aktuelle Gesamtbalance + alle Auszahlungen
//            - alle Einzahlungen - Startkapital
// Neu ist allein, WIE die Zahlen gezeigt werden: oben ein Urteil in einem
// Satz und die wichtigsten Zahlen als Kacheln, darunter der Rechenweg zum
// Mitrechnen, ganz unten die Einzelheiten, die man weiter von Hand
// bearbeiten kann. Keine Zahl wird anders gerundet, keine Summe anders
// gebildet.

// Geld immer mit zwei Nachkommastellen, genau wie vorher.
function bbGeld(x) { return Number(x).toFixed(2) + " &euro;"; }
function bbGeldVz(x) { return (Number(x) >= 0 ? "+" : "") + Number(x).toFixed(2) + " &euro;"; }

// Eine Kachel des Armaturenbretts. Reine Anzeige.
function bbKachel(titel, wert, unter, klasse) {
  return '<div class="bb-kachel' + (klasse ? " " + klasse : "") + '">' +
    '<div class="bb-kacheltitel">' + titel + "</div>" +
    '<div class="bb-kachelwert">' + wert + "</div>" +
    '<div class="bb-kachelunter">' + (unter || "") + "</div></div>";
}

// Wie viel liegt gerade in offenen Kombinationen? Das ist dieselbe
// Rechnung wie in der Anbieter-Tabelle weiter oben (zeichneKontoDb):
// der Einsatz aller Scheine mit Stand "offen". Nichts Neues erfunden.
// Die Scheine liegen schon entschluesselt im Speicher (kasseScheine),
// es wird nichts nachgeladen und nichts im Klartext weggeschrieben.
function bbScheinLage() {
  const liste = Array.isArray(kasseScheine) ? kasseScheine : [];
  const offene = liste.filter(s => s.stand === "offen");
  const imSpiel = offene.reduce((p, s) => p + ((s.daten && s.daten.einsatz) || 0), 0);
  const moeglich = offene.reduce((p, s) => p + ((s.daten && s.daten.moeglich) || 0), 0);
  const wartet = offene.filter(s => scheinWartet(s)).length;
  return { anzahl: offene.length, imSpiel: imSpiel, moeglich: moeglich, wartet: wartet, gesamt: liste.length };
}

// Bei wem liegt das offene Geld gerade? Nur eine Aufteilung derselben
// Einsaetze auf die Personen, keine zweite Rechnung.
function bbPersonenOffen() {
  const liste = (Array.isArray(kasseScheine) ? kasseScheine : []).filter(s => s.stand === "offen");
  const karte = {};
  for (const s of liste) {
    const id = s.ordner || "";
    if (!karte[id]) karte[id] = { id: id, n: 0, einsatz: 0 };
    karte[id].n++;
    karte[id].einsatz += (s.daten && s.daten.einsatz) || 0;
  }
  const raus = Object.keys(karte).map(k => karte[k]);
  raus.sort((a, b) => b.einsatz - a.einsatz);
  return raus;
}

// Welche Buchungsart zeigt Liste 1 gerade? Reine Ansicht, die Liste
// selbst bleibt unveraendert in der Datenbank.
let bbArtFilter = "alle";
function tuBuchArtFilter(wert) { bbArtFilter = wert; zeichneBuchhaltung(); }

// ============================================================
// BERICHTE (Karam, 03.09.): in der Buchhaltung filtern (Zeitraum,
// Anbieter, Person, Foto-Ordner), ansehen und als PDF oder Word
// herunterladen - "alles, was letzten Monat auf Stake gesetzt
// wurde", "alles von dieser Person", "alles aus diesem Ordner".
// REINE ANZEIGE: ein einziger Daten-Rechenweg (berichtDaten) speist
// Bildschirm, PDF und Word; die Gewinn-Formel ist DIESELBE wie in
// der Konto-Tabelle (zurueck minus entschiedene Einsaetze).
// ============================================================

let berichtWahl = null;
function berichtWahlLesen() {
  if (berichtWahl) return berichtWahl;
  try { berichtWahl = JSON.parse(localStorage.getItem("kt_bericht_wahl") || "null"); } catch (e) { }
  if (!berichtWahl) berichtWahl = { zeit: "monat", von: "", bis: "", kz: "alle",
    person: "alle", satz: "alle", statistik: true, kombis: true, buchungen: false };
  return berichtWahl;
}
function tuBerichtWahl(feld, wert) {
  const w = berichtWahlLesen();
  w[feld] = (feld === "statistik" || feld === "kombis" || feld === "buchungen") ? !!wert : wert;
  try { localStorage.setItem("kt_bericht_wahl", JSON.stringify(w)); } catch (e) { }
  zeichneBuchhaltung();
}

// Der gewaehlte Zeitraum als [von, bis) - bis exklusiv.
function berichtZeitraum() {
  const w = berichtWahlLesen();
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tag = 86400000;
  if (w.zeit === "woche") {
    const von = new Date(heute.getTime() - ((heute.getDay() + 6) % 7) * tag);   // Montag
    return { von: von, bis: null, name: "diese Woche (ab " + kasseZeit(von).slice(0, 6) + ")" };
  }
  if (w.zeit === "monat") {
    const von = new Date(heute.getFullYear(), heute.getMonth(), 1);
    return { von: von, bis: null, name: "dieser Monat" };
  }
  if (w.zeit === "letzter") {
    const von = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
    const bis = new Date(heute.getFullYear(), heute.getMonth(), 1);
    return { von: von, bis: bis, name: "letzter Monat" };
  }
  if (w.zeit === "eigen") {
    const von = w.von ? new Date(w.von + "T00:00") : null;
    const bis = w.bis ? new Date(new Date(w.bis + "T00:00").getTime() + tag) : null;
    return { von: von, bis: bis, name: (w.von || "Anfang") + " bis " + (w.bis || "heute") };
  }
  return { von: null, bis: null, name: "alles" };
}

// EIN Rechenweg fuer Anzeige, PDF und Word.
function berichtDaten() {
  const w = berichtWahlLesen();
  const z = berichtZeitraum();
  const imZeitraum = (d) => {
    if (!d || isNaN(d.getTime())) return false;
    if (z.von && d < z.von) return false;
    if (z.bis && d >= z.bis) return false;
    return true;
  };
  const alle = Array.isArray(kasseScheine) ? kasseScheine.filter(s => s.daten) : [];
  const scheine = alle.filter(s => {
    if (!imZeitraum(new Date(s.created_at))) return false;
    if (w.kz !== "alle" && s.daten.kz !== w.kz) return false;
    if (w.person !== "alle") {
      if (w.person === "ohne" ? !!s.ordner : s.ordner !== w.person) return false;
    }
    if (w.satz !== "alle" && (s.daten.satz || "") !== w.satz) return false;
    return true;
  });
  // Dieselbe Formel wie zeichneKontoDb: Saldo = zurueck - (Einsatz - im Spiel).
  const stat = { n: scheine.length, einsatz: 0, imSpiel: 0, zurueck: 0,
    offen: 0, gew: 0, ver: 0, ohneBetrag: 0 };
  for (const s of scheine) {
    stat.einsatz += s.daten.einsatz || 0;
    if (s.stand === "offen") { stat.offen++; stat.imSpiel += s.daten.einsatz || 0; }
    else if (s.stand === "gewonnen") {
      stat.gew++; stat.zurueck += echtZurueckWert(s);
      if (echtZurueckWert(s) <= 0) stat.ohneBetrag++;
    } else stat.ver++;
  }
  stat.gewinn = rundM(stat.zurueck - (stat.einsatz - stat.imSpiel));
  // Buchungen: Personen-Buchungen (kennen Person + Anbieter) ...
  const pb = (Array.isArray(personBuchungen) ? personBuchungen : []).filter(b => {
    if (!imZeitraum(new Date(b.datum + "T12:00"))) return false;
    if (w.person !== "alle" && w.person !== "ohne" && b.ordner !== w.person) return false;
    if (w.kz !== "alle" && b.anbieter && b.anbieter !== w.kz) return false;
    return true;
  });
  const pbSumme = (art) => rundM(pb.filter(b => b.art === art).reduce((p, b) => p + (Number(b.betrag) || 0), 0));
  const erhalten = pbSumme("erhalten"), anAnbieter = pbSumme("zum_anbieter"), anPersonen = pbSumme("ausgezahlt");
  return { wahl: w, zeitraum: z, scheine: scheine, stat: stat, pb: pb,
    erhalten: erhalten, anAnbieter: anAnbieter, anPersonen: anPersonen };
}

// Das Berichts-HTML: bewusst mit Inline-Farben, damit Bildschirm, PDF
// und Word EXAKT dasselbe zeigen (Word kennt unser Stylesheet nicht).
function berichtInnenHtml() {
  const d = berichtDaten();
  const w = d.wahl;
  const kzName = w.kz === "alle" ? "alle Anbieter" : anbieterNameM(w.kz);
  const personName_ = w.person === "alle" ? "alle Personen"
    : (w.person === "ohne" ? "ohne Person" : (ordnerNameM(w.person) || "?"));
  const satzName = w.satz === "alle" ? "alle Ordner"
    : ((typeof SAETZE !== "undefined" && (SAETZE.find(x => x.id === w.satz) || {}).titel) || w.satz);
  const farbe = { st: "#1a2c38", iw: "#0a7d3e", bw: "#111", b3: "#14805e" };
  const marke = (kz) => '<span style="display:inline-block;padding:1px 7px;border-radius:4px;' +
    'color:#fff;font-weight:bold;font-size:11px;background:' + (farbe[kz] || "#555") + '">' +
    textSicherM(anbieterNameM(kz) || kz || "?") + "</span>";
  const geld = (x) => Number(x || 0).toFixed(2) + " &euro;";
  const kachel = (titel, wert, farbe2) =>
    '<td style="border:1px solid #ccd2de;border-radius:8px;padding:10px 14px;text-align:center">' +
    '<div style="font-size:11px;color:#556">' + titel + "</div>" +
    '<div style="font-size:20px;font-weight:bold;color:' + (farbe2 || "#1a2c50") + '">' + wert + "</div></td>";

  let h = '<div style="font-family:Arial,sans-serif">' +
    '<h2 style="margin:0 0 2px">&#128209; Bericht: ' + textSicherM(kzName) + " &middot; " +
    textSicherM(personName_) + " &middot; " + textSicherM(satzName) + "</h2>" +
    '<div style="font-size:12px;color:#556;margin-bottom:10px">Zeitraum: ' + textSicherM(d.zeitraum.name) +
    " &middot; erstellt am " + kasseZeit(new Date()) + " &middot; " + d.stat.n + " Kombination(en)</div>";

  if (w.statistik) {
    h += '<table style="border-collapse:separate;border-spacing:6px;width:100%"><tr>' +
      kachel("Gesetzt gesamt", geld(d.stat.einsatz)) +
      kachel("Noch im Spiel (" + d.stat.offen + " offen)", geld(d.stat.imSpiel), "#7a3d00") +
      kachel("Zur&uuml;ckbekommen (" + d.stat.gew + " gewonnen)", geld(d.stat.zurueck), "#0a5a0a") +
      kachel("Wettgewinn (entschiedene)", (d.stat.gewinn >= 0 ? "+" : "") + geld(d.stat.gewinn),
        d.stat.gewinn >= 0 ? "#0a5a0a" : "#a00000") +
      "</tr><tr>" +
      kachel("Verloren", d.stat.ver + " Kombination(en)", "#a00000") +
      kachel("Von Personen erhalten", geld(d.erhalten)) +
      kachel("Zu Anbietern gezahlt", geld(d.anAnbieter)) +
      kachel("An Personen ausgezahlt", geld(d.anPersonen)) +
      "</tr></table>" +
      '<div style="font-size:11px;color:#556;margin:2px 0 10px">Wettgewinn = Zur&uuml;ckbekommen minus ' +
      "Eins&auml;tze der schon entschiedenen Kombinationen (dieselbe Rechnung wie die Konto-Tabelle). " +
      "Erhalten/gezahlt kommt aus den Personen-Buchungen im Zeitraum." +
      (d.stat.ohneBetrag ? ' <b style="color:#a00000">' + d.stat.ohneBetrag +
        " gewonnene Kombination(en) ohne Betrag - Gewinn unvollst&auml;ndig!</b>" : "") + "</div>";
  }

  if (w.kombis && d.scheine.length) {
    h += '<h3 style="margin:12px 0 4px">Kombinationen (' + d.scheine.length + ")</h3>" +
      '<table style="border-collapse:collapse;width:100%">' +
      '<tr style="background:#eef1f7">' +
      ["Datum", "Nr.", "Anbieter", "Person", "Wetten", "Quote", "Einsatz", "Stand", "Zur&uuml;ck"].map(x =>
        '<th style="border:1px solid #ccd2de;padding:4px 7px;font-size:12px;text-align:left">' + x + "</th>").join("") + "</tr>";
    for (const s of d.scheine) {
      const standFarbe = s.stand === "gewonnen" ? "#0a5a0a" : (s.stand === "verloren" ? "#a00000" : "#556");
      h += "<tr>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' + zeitM(s.created_at) + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px"><b>' + (s.nummer || "-") + "</b></td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px">' + marke(s.daten.kz) + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' +
          (s.ordner ? textSicherM(ordnerNameM(s.ordner) || "?") : "-") + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:11px">' +
          (s.daten.wetten || []).map(t => textSicherM(t.spiel) + " <i>(" + textSicherM(t.linie || "") + ")</i>").join("<br>") + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' + (s.daten.quote || 0).toFixed(2) + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' + geld(s.daten.einsatz) + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px;font-weight:bold;color:' + standFarbe + '">' + s.stand + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' +
          (s.stand === "gewonnen" ? geld(echtZurueckWert(s)) : "-") + "</td></tr>";
    }
    h += "</table>";
  } else if (w.kombis) {
    h += '<p style="font-size:12px;color:#556">Keine Kombination passt auf diese Auswahl.</p>';
  }

  if (w.buchungen && d.pb.length) {
    const kbArt2 = { erhalten: "von Person erhalten", ausgezahlt: "an Person ausgezahlt",
      zum_anbieter: "Geld zum Anbieter", stand_weg: "Stand-Korrektur (Weg)",
      stand_anbieter: "Stand-Korrektur (Anbieter)" };
    h += '<h3 style="margin:12px 0 4px">Personen-Buchungen (' + d.pb.length + ")</h3>" +
      '<table style="border-collapse:collapse;width:100%"><tr style="background:#eef1f7">' +
      ["Datum", "Was", "Person", "Betrag"].map(x =>
        '<th style="border:1px solid #ccd2de;padding:4px 7px;font-size:12px;text-align:left">' + x + "</th>").join("") + "</tr>";
    for (const b of d.pb.slice().reverse()) {
      h += "<tr>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' + textSicherM(b.datum) + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' +
          textSicherM(kbArt2[b.art] || b.art) + (b.anbieter ? " &middot; " + textSicherM(anbieterNameM(b.anbieter) || b.anbieter) : "") +
          (b.weg ? " &middot; " + textSicherM(b.weg) : "") + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' +
          ((b.ordner && ordnerNameM(b.ordner)) ? textSicherM(ordnerNameM(b.ordner)) : "-") + "</td>" +
        '<td style="border:1px solid #dde3ee;padding:4px 7px;font-size:12px">' + geld(b.betrag) + "</td></tr>";
    }
    h += "</table>";
  }
  return h + "</div>";
}

// Die Filterzeile plus Anzeige - eingebaut in die Buchhaltung.
function zeichneBerichtHtml() {
  const w = berichtWahlLesen();
  const kzOpt = [["alle", "alle Anbieter"]].concat(KASSE_ANBIETER)
    .map(([k, n]) => '<option value="' + k + '"' + (w.kz === k ? " selected" : "") + ">" + n + "</option>").join("");
  const persOpt = ['<option value="alle"' + (w.person === "alle" ? " selected" : "") + ">alle Personen</option>",
    '<option value="ohne"' + (w.person === "ohne" ? " selected" : "") + ">ohne Person</option>"]
    .concat((ordnerListe || []).map(o => '<option value="' + o.id + '"' + (w.person === o.id ? " selected" : "") + ">" +
      textSicherM(o.name) + "</option>")).join("");
  const saetze = [...new Set((Array.isArray(kasseScheine) ? kasseScheine : [])
    .filter(s => s.daten && s.daten.satz).map(s => s.daten.satz))].sort().reverse();
  const satzOpt = ['<option value="alle"' + (w.satz === "alle" ? " selected" : "") + ">alle Ordner</option>"]
    .concat(saetze.map(sz => {
      const titel = (typeof SAETZE !== "undefined" && (SAETZE.find(x => x.id === sz) || {}).titel) || sz;
      return '<option value="' + textSicherM(sz) + '"' + (w.satz === sz ? " selected" : "") + ">" + textSicherM(titel) + "</option>";
    })).join("");
  const zeitOpt = [["alles", "alles"], ["woche", "diese Woche"], ["monat", "dieser Monat"],
    ["letzter", "letzter Monat"], ["eigen", "von-bis"]]
    .map(([k, n]) => '<option value="' + k + '"' + (w.zeit === k ? " selected" : "") + ">" + n + "</option>").join("");
  return '<details open class="bb-teil bb-berichte"><summary>&#128209; Berichte: filtern, ansehen, herunterladen</summary>' +
    '<div class="bb-filterzeile">' +
    '<label>Zeitraum <select onchange="tuBerichtWahl(\'zeit\', this.value)">' + zeitOpt + "</select></label>" +
    (w.zeit === "eigen"
      ? ' <input type="date" value="' + textSicherM(w.von) + '" onchange="tuBerichtWahl(\'von\', this.value)">' +
        ' bis <input type="date" value="' + textSicherM(w.bis) + '" onchange="tuBerichtWahl(\'bis\', this.value)">'
      : "") +
    ' <label>Anbieter <select onchange="tuBerichtWahl(\'kz\', this.value)">' + kzOpt + "</select></label>" +
    ' <label>Person <select onchange="tuBerichtWahl(\'person\', this.value)">' + persOpt + "</select></label>" +
    ' <label>Ordner <select onchange="tuBerichtWahl(\'satz\', this.value)">' + satzOpt + "</select></label>" +
    "</div>" +
    '<div class="bb-filterzeile mini">' +
    '<label><input type="checkbox"' + (w.statistik ? " checked" : "") +
      ' onchange="tuBerichtWahl(\'statistik\', this.checked)"> Statistik</label> ' +
    '<label><input type="checkbox"' + (w.kombis ? " checked" : "") +
      ' onchange="tuBerichtWahl(\'kombis\', this.checked)"> Kombinationen</label> ' +
    '<label><input type="checkbox"' + (w.buchungen ? " checked" : "") +
      ' onchange="tuBerichtWahl(\'buchungen\', this.checked)"> Personen-Buchungen</label> ' +
    '<button class="haupt" onclick="tuBerichtPdf()">&#128424; Als PDF speichern</button> ' +
    '<button onclick="tuBerichtWord()">&#11015; Als Word-Datei</button>' +
    "</div>" +
    '<div class="bb-berichtschau">' + berichtInnenHtml() + "</div></details>";
}

// PDF: dasselbe erprobte Muster wie das Kassen-PDF (Fenster + drucken;
// im Druckdialog "Als PDF speichern" waehlen).
function tuBerichtPdf() {
  const f = window.open("", "_blank");
  if (!f) { meldungM("Das PDF-Fenster wurde vom Browser geblockt - bitte Pop-ups erlauben.", "warn"); return; }
  f.document.write("<html><head><title>Kombi-Tafel Bericht</title></head>" +
    '<body style="background:#fff;margin:24px">' + berichtInnenHtml() + "</body></html>");
  f.document.close();
  setTimeout(() => { f.print(); }, 400);
}

// Word: eine .doc-Datei ist fuer Word auch als HTML lesbar - die
// Inline-Farben aus berichtInnenHtml kommen dort 1:1 an.
function tuBerichtWord() {
  try {
    const html = "<html><head><meta charset='utf-8'></head><body>" + berichtInnenHtml() + "</body></html>";
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kombi-tafel-bericht-" + new Date().toISOString().slice(0, 10) + ".doc";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    meldungM("Word-Datei erstellt - sie liegt in deinen Downloads.", "gut");
  } catch (e) {
    meldungM("Word-Datei nicht erstellt: " + String(e.message || e).slice(0, 80), "warn");
  }
}

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
  const balanceDatum = balancen.length ? balancen[balancen.length - 1].datum : null;
  const lage = bbScheinLage();

  // ---- 1. Das Urteil in einem Satz ----
  let urteilKlasse, urteilZahl, urteilText;
  if (gewinn === null) {
    urteilKlasse = "bb-offen";
    urteilZahl = "noch offen";
    urteilText = "Noch keine Tagesbalance eingetragen. Trag unten die heutige " +
      "Gesamtbalance aller Accounts ein, dann rechnet der Gewinn.";
  } else {
    urteilKlasse = (gewinn >= 0) ? "bb-plus" : "bb-minus";
    urteilZahl = bbGeldVz(gewinn);
    urteilText = (gewinn >= 0)
      ? "So steht es gerade: du bist " + gewinn.toFixed(2) + " Euro im Plus."
      : "So steht es gerade: du bist " + Math.abs(gewinn).toFixed(2) + " Euro im Minus.";
    urteilText += lage.anzahl
      ? " Dazu liegen " + lage.imSpiel.toFixed(2) + " Euro in " +
        (lage.anzahl === 1 ? "einer offenen Kombination" : lage.anzahl + " offenen Kombinationen") +
        ". Was daraus wird, steht noch nicht fest."
      : " In offenen Kombinationen liegt gerade nichts.";
  }

  // ---- 0. Die Geld-Geschichte in einem Satz (Karam, 02.09.: so einfach,
  // dass ein Kind es versteht). NUR schon berechnete Werte, nichts Neues.
  const rein = einz + start;
  let kindSatz;
  if (letzteBalance === null) {
    kindSatz = "Ihr habt bisher <b>" + bbGeld(rein) + "</b> hineingesteckt und <b>" + bbGeld(ausz) +
      "</b> wieder herausgeholt. Wie viel gerade auf den Wett-Konten liegt, weiß das Programm erst, " +
      "wenn unten in Liste 2 die heutige Gesamtbalance steht.";
  } else {
    kindSatz = "Ihr habt <b>" + bbGeld(rein) + "</b> hineingesteckt (Einzahlungen + Startkapital) und <b>" +
      bbGeld(ausz) + "</b> wieder herausgeholt. Auf den Wett-Konten liegen gerade <b>" + bbGeld(letzteBalance) +
      "</b>. Unterm Strich " + (gewinn >= 0 ? "habt ihr <b>" + bbGeld(gewinn) + " Gewinn</b> gemacht."
        : "fehlen <b>" + bbGeld(Math.abs(gewinn)) + "</b>.");
  }

  let html = '<details open class="bb-bericht"><summary>&#128202; Buchhaltung: der Bericht (anklicken)</summary>' +
    '<div class="inhalt">' +
    '<div class="bb-kindsatz">' + kindSatz + "</div>" +
    '<div class="bb-urteil ' + urteilKlasse + '">' +
    '<div class="bb-urteilzahl">' + urteilZahl + "</div>" +
    '<div class="bb-urteiltext">' + urteilText + "</div></div>";

  // ---- 2. Was klemmt: nur was wirklich in den Daten steht ----
  const klemmt = [];
  if (balanceDatum && balanceDatum < heute) {
    klemmt.push("Die letzte Gesamtbalance ist vom " + balanceDatum + " und nicht von heute. " +
      "Trag unten die heutige ein, dann ist der Gewinn wieder aktuell.");
  }
  if (lage.wartet) {
    klemmt.push((lage.wartet === 1 ? "Eine offene Kombination ist" : lage.wartet + " offene Kombinationen sind") +
      " laut Anstoßzeit schon durch. Trag unter Kombinationen ein, ob gewonnen oder verloren.");
  }
  if (!buchungen.length) {
    klemmt.push("In Liste 1 steht noch keine einzige Ein- oder Auszahlung. Ohne Startkapital " +
      "und Einzahlungen ist der Gewinn nur die nackte Balance.");
  }
  if (klemmt.length) {
    html += '<div class="bb-klemmt"><div class="bb-abschnitt">Das klemmt gerade</div><ul>' +
      klemmt.map(k => "<li>" + k + "</li>").join("") + "</ul></div>";
  }

  // ---- 3. Die wichtigsten Zahlen: vier grosse Karten, darunter die
  // kleine Reihe. Dieselben Werte wie immer, nur klarer sortiert.
  html += '<div class="bb-kacheln bb-grossreihe">' +
    bbKachel("Euer Gewinn", (gewinn === null) ? "noch offen" : bbGeldVz(gewinn),
      "Konten + Herausgeholtes minus alles Hineingesteckte",
      "bb-gross " + ((gewinn === null) ? "bb-offen" : (gewinn >= 0 ? "bb-plus" : "bb-minus"))) +
    bbKachel("Auf den Konten", (letzteBalance === null) ? "noch keine" : bbGeld(letzteBalance),
      (balanceDatum ? "Gesamtbalance, Stand vom " + balanceDatum : "trag sie unten in Liste 2 ein"), "bb-gross") +
    bbKachel("Im Spiel", bbGeld(lage.imSpiel),
      lage.anzahl + (lage.anzahl === 1 ? " offene Kombination" : " offene Kombinationen"), "bb-gross bb-warten") +
    bbKachel("Kann daraus werden", bbGeld(lage.moeglich), "wenn alle offenen aufgehen", "bb-gross bb-warten") +
    "</div>" +
    '<div class="bb-kacheln">' +
    bbKachel("Eingezahlt", bbGeld(einz), "Geld, das ihr hineingesteckt habt", "") +
    bbKachel("Ausgezahlt", bbGeld(ausz), "Geld, das ihr herausgeholt habt", "") +
    bbKachel("Startkapital", bbGeld(start), "womit ihr angefangen habt", "") +
    "</div>";

  // ---- 3b. Berichte: filtern, ansehen, herunterladen (Karam 03.09.) ----
  html += zeichneBerichtHtml();

  // ---- 4. Bei wem liegt das offene Geld ----
  if (lage.anzahl) {
    html += '<div class="bb-wem"><div class="bb-abschnitt">Bei wem liegt das Geld gerade</div><ul class="bb-wemliste">';
    for (const p of bbPersonenOffen()) {
      const name = p.id ? textSicherM(ordnerNameM(p.id) || "?") : "ohne Person";
      html += '<li><span class="bb-wemname">' + name + "</span>" +
        '<span class="bb-wemzahl">' + bbGeld(p.einsatz) + "</span>" +
        '<span class="bb-wemmini">' + p.n + (p.n === 1 ? " Kombination" : " Kombinationen") + "</span></li>";
    }
    html += "</ul></div>";
  }

  // ---- 4b. Kassenbuch: die letzten Bewegungen (Karam, 02.09.) ----
  // Damit JEDER im Bereich nachpruefen kann, was eingetragen wurde:
  // die Bereichs-Buchungen (Liste 1) und die Personen-Buchungen in
  // EINER Liste, neueste zuerst. Reine Anzeige aus schon geladenen
  // Daten - hier wird nichts gerechnet und nichts veraendert.
  const kbArt = { einzahlung: "Einzahlung", auszahlung: "Auszahlung", startkapital: "Startkapital",
    erhalten: "von Person erhalten", ausgezahlt: "an Person ausgezahlt",
    hin: "Geld zum Anbieter", zurueck: "Geld zurückgeholt", raus: "entnommen",
    stand_weg: "Stand-Korrektur (Weg)", stand_anbieter: "Stand-Korrektur (Anbieter)" };
  const kb = [];
  for (const b of buchungen) kb.push({ datum: b.datum,
    was: (kbArt[b.art] || b.art) + (b.konto ? " · " + b.konto : ""),
    wer: b.person || "", betrag: parseFloat(b.betrag) || 0 });
  for (const b of (Array.isArray(personBuchungen) ? personBuchungen : [])) kb.push({ datum: b.datum,
    was: (kbArt[b.art] || b.art) + (b.anbieter ? " · " + (anbieterNameM(b.anbieter) || b.anbieter) : "") +
      (b.weg ? " · " + b.weg : ""),
    wer: (b.ordner && ordnerNameM(b.ordner)) || "", betrag: parseFloat(b.betrag) || 0 });
  kb.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  if (kb.length) {
    html += '<details class="bb-teil bb-kassenbuch"><summary>Kassenbuch: die letzten Bewegungen (' +
      kb.length + ") - zum Nachpr&uuml;fen f&uuml;r alle im Bereich</summary>" +
      '<p class="mini">Jede Zeile ist ein Eintrag, den jemand im Bereich gemacht hat: ' +
      "Bereichs-Buchungen aus Liste 1 und alle Personen-Buchungen zusammen, die neuesten zuerst.</p>" +
      '<div class="tabellenrand"><table><thead><tr><th>Datum</th><th>Was</th><th>Person</th><th>Betrag</th></tr></thead><tbody>';
    for (const z of kb.slice(0, 30)) {
      html += "<tr><td class='mini'>" + textSicherM(z.datum) + "</td><td>" + textSicherM(z.was) + "</td>" +
        "<td>" + (z.wer ? textSicherM(z.wer) : "<span class='mini'>-</span>") + "</td>" +
        "<td class='tb-q'>" + z.betrag.toFixed(2) + " &euro;</td></tr>";
    }
    if (kb.length > 30) html += "<tr><td colspan='4' class='mini'>und " + (kb.length - 30) +
      " &auml;ltere - alle stehen weiter unten in den Listen und bei den Personen.</td></tr>";
    html += "</tbody></table></div></details>";
  }

  // ---- 5. Der Rechenweg zum Mitrechnen ----
  html += '<details open class="bb-teil bb-weg"><summary>Wie kommt diese Zahl zustande?</summary>' +
    '<p class="mini">Deine zwei Listen: Liste 1 sammelt jede Ein- und Auszahlung mit Datum, ' +
    "Konto, Person und Betrag, dazu das Startkapital. Liste 2 ist die t&auml;gliche " +
    "<b>Gesamtbalance aller Accounts zusammen</b>. Daraus rechnet sich der Gewinn, Zeile f&uuml;r Zeile:</p>" +
    '<div class="bb-rechnung">' +
    '<div class="bb-rz"><span class="bb-rzname">Gesamtbalance' +
      (balanceDatum ? " (Stand vom " + balanceDatum + ")" : "") + "</span>" +
      '<span class="bb-rzwert">' + ((letzteBalance === null) ? "noch keine" : bbGeld(letzteBalance)) + "</span></div>" +
    '<div class="bb-rz"><span class="bb-rzname">plus alle Auszahlungen</span>' +
      '<span class="bb-rzwert">+ ' + bbGeld(ausz) + "</span></div>" +
    '<div class="bb-rz"><span class="bb-rzname">minus alle Einzahlungen</span>' +
      '<span class="bb-rzwert">&minus; ' + bbGeld(einz) + "</span></div>" +
    '<div class="bb-rz"><span class="bb-rzname">minus Startkapital</span>' +
      '<span class="bb-rzwert">&minus; ' + bbGeld(start) + "</span></div>" +
    '<div class="bb-rz bb-rzende ' + ((gewinn === null) ? "bb-offen" : (gewinn >= 0 ? "bb-plus" : "bb-minus")) +
      '"><span class="bb-rzname">= reiner Gewinn</span>' +
      '<span class="bb-rzwert">' + ((gewinn === null) ? "noch offen" : bbGeldVz(gewinn)) + "</span></div>" +
    "</div></details>";

  // ---- 6. Die Einzelheiten: Monate ----
  html += '<details open class="bb-teil"><summary>Monat f&uuml;r Monat</summary>';
  if (balancen.length) {
    const monate = [...new Set(balancen.map(b => b.datum.slice(0, 7)))].sort();
    let vorher = null;
    html += '<div class="tabellenrand"><table><thead><tr><th>Monat</th><th>letzte Balance</th>' +
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
    html += "</tbody></table></div>";
  } else {
    html += '<p class="mini">Sobald unten die erste Gesamtbalance steht, f&uuml;llt sich diese Tabelle von selbst.</p>';
  }
  html += "</details>";

  // ---- 7. Liste 1: Ein- und Auszahlungen (weiter bearbeitbar) ----
  html += '<details open class="bb-teil"><summary>Liste 1: Ein- und Auszahlungen' +
    (buchungen.length ? " (" + buchungen.length + ")" : "") + "</summary>";
  if (schreib) {
    html += '<div class="buch-eingabe">' +
      '<input type="date" id="bu_datum" value="' + heute + '">' +
      '<select id="bu_art"><option value="einzahlung">Einzahlung</option>' +
      '<option value="auszahlung">Auszahlung</option>' +
      '<option value="startkapital">Startkapital</option></select>' +
      '<select id="bu_konto"><option>Interwetten</option><option>Bwin</option>' +
      '<option>Bet365</option><option>Stake</option><option>Sonstiges</option></select>' +
      '<input id="bu_person" placeholder="Person" value="' + textSicherM(ich.username) + '" style="width:110px">' +
      '<input type="number" step="0.01" min="0.01" id="bu_betrag" placeholder="Betrag" style="width:90px">' +
      '<button class="haupt" onclick="tuBuchen()">Eintragen</button></div>';
  }
  if (buchungen.length) {
    html += '<div class="bb-filter"><label for="bu_filter">Zeigen:</label>' +
      '<select id="bu_filter" onchange="tuBuchArtFilter(this.value)">' +
      ["alle", "einzahlung", "auszahlung", "startkapital"].map(a =>
        '<option value="' + a + '"' + (bbArtFilter === a ? " selected" : "") + ">" +
        (a === "alle" ? "alle" : a) + "</option>").join("") + "</select></div>";
    const gezeigt = (bbArtFilter === "alle") ? buchungen : buchungen.filter(b => b.art === bbArtFilter);
    if (gezeigt.length) {
      html += '<div class="tabellenrand"><table><thead><tr><th>Datum</th><th>Art</th><th>Konto</th><th>Person</th>' +
        "<th>Betrag</th>" + (schreib ? "<th></th>" : "") + "</tr></thead><tbody>";
      for (const b of gezeigt.slice().reverse()) {
        // Diese vier Felder tippen Menschen selbst ein, und in einem geteilten
        // Bereich darf das auch ein Mitarbeiter. Ohne textSicherM wuerde ein Name
        // wie <b>Hallo</b> als HTML wirken statt als Text dazustehen.
        html += "<tr><td>" + textSicherM(b.datum) + "</td><td>" + textSicherM(b.art) +
          "</td><td>" + textSicherM(b.konto) + "</td>" +
          "<td>" + textSicherM(b.person) + "</td><td>" + parseFloat(b.betrag).toFixed(2) + " &euro;</td>" +
          (schreib ? "<td><button onclick=\"tuBuchungWeg('" + b.id + "')\">weg</button></td>" : "") + "</tr>";
      }
      html += "</tbody></table></div>";
    } else {
      html += '<p class="mini">Keine Buchung dieser Art. Stell oben auf "alle", dann kommt wieder alles.</p>';
    }
  } else html += '<p class="mini">Noch keine Buchungen.</p>';
  html += "</details>";

  // ---- 8. Liste 2: taegliche Gesamtbalance (weiter bearbeitbar) ----
  html += '<details open class="bb-teil"><summary>Liste 2: t&auml;gliche Gesamtbalance' +
    (balancen.length ? " (" + balancen.length + ")" : "") + "</summary>" +
    '<p class="mini">Ein Wert pro Tag: alle Account-Staende zusammengezaehlt. ' +
    "Gleicher Tag nochmal eingetragen ueberschreibt den Wert.</p>";
  if (schreib) {
    html += '<div class="buch-eingabe">' +
      '<input type="date" id="ba_datum" value="' + heute + '">' +
      '<input type="number" step="0.01" id="ba_betrag" placeholder="Gesamtbalance" style="width:130px">' +
      '<button class="haupt" onclick="tuBalance()">Speichern</button></div>';
  }
  if (balancen.length) {
    html += '<div class="tabellenrand"><table><thead><tr><th>Datum</th><th>Gesamtbalance</th>' +
      (schreib ? "<th></th>" : "") + "</tr></thead><tbody>";
    for (const b of balancen.slice().reverse().slice(0, 31)) {
      html += "<tr><td>" + b.datum + "</td><td><b>" + parseFloat(b.betrag).toFixed(2) + " &euro;</b></td>" +
        (schreib ? "<td><button onclick=\"tuBalanceWeg('" + b.datum + "')\">weg</button></td>" : "") + "</tr>";
    }
    html += "</tbody></table></div>";
    if (balancen.length > 31) {
      html += '<p class="mini">Gezeigt werden die letzten 31 Tage. &Auml;lteres bleibt in der ' +
        "Datenbank und z&auml;hlt in der Monatstabelle weiter mit.</p>";
    }
  } else html += '<p class="mini">Noch keine Balancen.</p>';
  html += "</details>";

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
  // Waechter (Falle 1): nur bei offener Chat-Ansicht. Sonst wuerde alles
  // ungesehen als gelesen markiert, und die Zaehler waeren wieder tot.
  // Ausserdem wirkt scrollTop auf display:none nicht (Falle 2) - so wird
  // immer erst sichtbar gemacht, dann geladen und gescrollt.
  if (mbAnsicht !== "chat" || !el("chatliste")) return;
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
  // Nur die Zaehler auffrischen - die Tabs neu zu bauen hat frueher bei
  // fehlendem Bereichsschluessel den Warnkasten verdoppelt.
  bereichBadges();
  // Der 💬-Knopf oben zaehlt ueber glocke.js (30-Sekunden-Takt). Nach dem
  // Lesen soll er nicht eine halbe Minute lang Altes zeigen.
  if (typeof glockeZaehlen === "function") glockeZaehlen();
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
  geprueft.push("möglicher Gewinn: nie mehr als Einsatz × Gesamtquote, Abzug = Gebühr");
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
    // KARAMS REGEL (03.09.): der moegliche Gewinn ist der vom Anbieter
    // ANGESAGTE Hoechstgewinn. Er darf UNTER Einsatz x Quote liegen -
    // die Differenz ist die Gebuehr (bei Interwetten ~5 %). Fehler ist
    // nur, wenn MEHR dasteht, als der Schein hergibt; eine sehr grosse
    // Differenz nach unten bekommt eine Warnung (riecht nach Tippfehler).
    const sollGewinn = (Number(d.einsatz) || 0) * steht;
    const moeglichIst = Number(d.moeglich) || 0;
    if (moeglichIst - sollGewinn > PRUEF_CENT) {
      add("fehler", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b>: möglicher Gewinn steht mit <b>" +
        moeglichIst.toFixed(2) + " &euro;</b>, Einsatz " + (Number(d.einsatz) || 0).toFixed(2) +
        " &euro; &times; Quote " + steht.toFixed(2) + " gibt aber höchstens <b>" +
        rundM(sollGewinn).toFixed(2) + " &euro;</b> her.");
    } else if (sollGewinn > 0 && moeglichIst > 0 &&
               (sollGewinn - moeglichIst) / sollGewinn > 0.10) {
      add("warnung", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b>: möglicher Gewinn <b>" +
        moeglichIst.toFixed(2) + " &euro;</b> liegt mehr als 10 Prozent unter Einsatz &times; Quote (" +
        rundM(sollGewinn).toFixed(2) + " &euro;) - so viel Gebühr nimmt kein Anbieter, bitte prüfen.");
    }
    if (!Number(d.einsatz)) {
      add("warnung", "Rechnung", "<b>" + textSicherM(pruefKurz(s)) + "</b> ist ohne Einsatz gespeichert - " +
        "sie zählt in keiner Statistik mit.");
    }
  }

  // ---- 3. (entfallen, 03.09.2026) Die fruehere Pruefung "Gebuehr von
  // jeder Quote abgezogen" ist mit Karams Regel tot: die gespeicherte
  // Quote SOLL jetzt genau die vom Schein sein, die Gebuehr steckt in
  // der Differenz zwischen Einsatz x Quote und dem angesagten Gewinn
  // (siehe Pruefung 2). Da alle Teiler auf 1 stehen, haette der alte
  // Code ohnehin nie mehr gefeuert - weg damit, statt tot herumliegen.

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

// ============================================================
// TAGESUEBERSICHT
//
// Drei Fragen auf einem Blatt:
//   1. Welche Personen habe ich an diesem Tag bearbeitet?
//   2. Wie viel Geld liegt bei welchem Anbieter?
//   3. Wer haelt gerade wie viel von meinem Geld?
//
// WICHTIG: hier wird NICHTS neu gerechnet. Jede Zahl kommt aus
// personPruefen() - derselben Funktion, aus der auch die Personen-Kasse
// lebt. Wuerde hier ein zweiter Rechenweg stehen, liefen die beiden
// Ansichten frueher oder spaeter auseinander, und niemand wuesste,
// welche stimmt.
// ============================================================

// Welcher Tag wird gezeigt? Vorgabe heute.
function tagGewaehlt() {
  const f = el("tag_datum");
  if (f && f.value) return f.value;
  return tagHeute();
}

function tagHeute() {
  // ORTSZEIT, nicht UTC: sonst waere abends nach 22 Uhr schon der
  // naechste Tag gemeint und die Uebersicht waere leer.
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

// Faellt ein Zeitstempel auf diesen Tag? Auch hier Ortszeit.
function tagPasst(zeitstempel, tag) {
  if (!zeitstempel) return false;
  const d = new Date(zeitstempel);
  if (isNaN(d.getTime())) return String(zeitstempel).slice(0, 10) === tag;
  return (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")) === tag;
}

function tagGeld(x) { return Number(x || 0).toFixed(2) + " &euro;"; }
function tagGeldVz(x) {
  const n = Number(x || 0);
  return "<span class='" + (n >= 0 ? "e-gew" : "e-ver") + "'>" +
    (n >= 0 ? "+" : "") + n.toFixed(2) + " &euro;</span>";
}

function tagDatumSetzen(wert) {
  const f = el("tag_datum");
  if (f) f.value = wert;
  zeichneTagesuebersicht();
}

function tagVerschieben(tage) {
  const d = new Date(tagGewaehlt() + "T12:00:00");
  if (isNaN(d.getTime())) return;
  d.setDate(d.getDate() + tage);
  tagDatumSetzen(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0"));
}

function zeichneTagesuebersicht() {
  const box = el("tagesuebersicht");
  if (!box) return;
  const tag = tagGewaehlt();
  const scheine = Array.isArray(kasseScheine) ? kasseScheine : [];
  const personen = Array.isArray(ordnerListe) ? ordnerListe : [];

  let html = tagKopfHtml(tag);

  if (!personen.length) {
    box.innerHTML = html + '<p class="mini">Noch keine Personen angelegt. Sobald du unter ' +
      '"Kombinationen und Personen" jemanden anlegst, steht hier die Uebersicht.</p>';
    return;
  }

  // Einmal je Person rechnen - mit DERSELBEN Funktion wie die Personen-Kasse.
  const zeilen = [];
  for (const p of personen) {
    const pr = personPruefen(p.id, scheine);
    const meine = scheine.filter(s => s.ordner === p.id);
    const neu = meine.filter(s => tagPasst(s.created_at, tag));
    const geaendert = meine.filter(s => s.updated_at && tagPasst(s.updated_at, tag) &&
      !tagPasst(s.created_at, tag));
    const zahlungen = (pr.buch || []).filter(b => String(b.datum || "").slice(0, 10) === tag);
    zeilen.push({ person: p, pr: pr, neu: neu, geaendert: geaendert, zahlungen: zahlungen,
      haelt: pr.aufWegen + pr.beiAnbietern + pr.imSpiel });
  }

  html += tagBearbeitetHtml(zeilen, tag);
  html += tagAnbieterHtml(zeilen);
  html += tagHalterHtml(zeilen);
  box.innerHTML = html;
}

function tagKopfHtml(tag) {
  const heute = tagHeute();
  return '<div class="tag-kopf">' +
    '<h2>&#128197; Tagesübersicht</h2>' +
    '<div class="tag-wahl">' +
    '<button onclick="tagVerschieben(-1)" title="Ein Tag zurück">&#8592;</button>' +
    '<input type="date" id="tag_datum" value="' + tag + '" onchange="zeichneTagesuebersicht()">' +
    '<button onclick="tagVerschieben(1)" title="Ein Tag vor">&#8594;</button>' +
    '<button class="haupt" onclick="tagDatumSetzen(&quot;' + heute + '&quot;)">Heute</button>' +
    (tag === heute ? '' : '<span class="mini tag-nichtheute">Du siehst einen anderen Tag als heute.</span>') +
    '</div></div>';
}

// ---------- 1. Wen habe ich an diesem Tag bearbeitet? ----------
function tagBearbeitetHtml(zeilen, tag) {
  const dran = zeilen.filter(z => z.neu.length || z.geaendert.length || z.zahlungen.length);
  let html = '<div class="tag-teil"><h3>&#128221; An diesem Tag bearbeitet</h3>';
  if (!dran.length) {
    return html + '<p class="mini">An diesem Tag hast du bei keiner Person etwas eingetragen. ' +
      'Die Zahlen weiter unten gelten trotzdem - sie zeigen immer den Stand von <b>jetzt</b>.</p></div>';
  }
  html += '<div class="tabellenrand"><table><thead><tr><th>Person</th><th>Neue Kombinationen</th>' +
    '<th>Geändert</th><th>Zahlungen</th><th>Hält gerade</th></tr></thead><tbody>';
  let nNeu = 0, nGeaendert = 0, nZahl = 0;
  for (const z of dran) {
    nNeu += z.neu.length; nGeaendert += z.geaendert.length; nZahl += z.zahlungen.length;
    const einsatzNeu = z.neu.reduce((p, s) => p + (s.daten.einsatz || 0), 0);
    const zahlSumme = z.zahlungen.reduce((p, b) => p + (Number(b.betrag) || 0), 0);
    html += "<tr><td><b>" + textSicherM(z.person.name) + "</b></td>" +
      "<td>" + (z.neu.length ? z.neu.length + " <span class='mini'>(" + tagGeld(einsatzNeu) + ")</span>" : "-") + "</td>" +
      "<td>" + (z.geaendert.length || "-") + "</td>" +
      "<td>" + (z.zahlungen.length ? z.zahlungen.length + " <span class='mini'>(" + tagGeld(zahlSumme) + ")</span>" : "-") + "</td>" +
      "<td>" + tagGeld(z.haelt) + "</td></tr>";
  }
  html += "</tbody><tfoot><tr><td><b>" + dran.length + " Person" + (dran.length === 1 ? "" : "en") +
    "</b></td><td><b>" + nNeu + "</b></td><td><b>" + nGeaendert + "</b></td><td><b>" + nZahl +
    // Hier bewusst KEINE Summe: es waere nur die Summe der an diesem Tag
    // bearbeiteten Personen, nicht aller - das laedt zum Verwechseln ein.
    "</b></td><td class=mini>siehe unten</td></tr></tfoot></table></div>";
  html += '<p class="mini">"Geändert" heißt: die Kombination stand schon vorher da und wurde an ' +
    'diesem Tag angefasst - meist der Eintrag gewonnen oder verloren.</p>';
  return html + "</div>";
}

// ---------- 2. Geldstand bei den Anbietern ----------
function tagAnbieterHtml(zeilen) {
  const summe = {};
  for (const [kz] of KASSE_ANBIETER)
    summe[kz] = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, guthaben: 0, imSpiel: 0, moeglichOffen: 0, wartet: 0 };
  for (const z of zeilen) for (const [kz] of KASSE_ANBIETER) {
    const a = z.pr.anbieter[kz];
    if (!a) continue;
    for (const f of ["einge", "geholt", "einsatz", "gewonnen", "guthaben", "imSpiel", "moeglichOffen", "wartet"])
      summe[kz][f] += a[f] || 0;
  }
  let html = '<div class="tag-teil"><h3>&#127974; Geldstand bei den Anbietern</h3>' +
    '<div class="tabellenrand"><table><thead><tr><th>Anbieter</th><th>eingezahlt</th>' +
    '<th>zurückgeholt</th><th>gesetzt</th><th>gewonnen</th><th>im Spiel</th>' +
    '<th>Guthaben dort</th></tr></thead><tbody>';
  let g = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, imSpiel: 0, guthaben: 0 };
  for (const [kz, name] of KASSE_ANBIETER) {
    const a = summe[kz];
    for (const f in g) g[f] += a[f] || 0;
    html += "<tr><td>" + markeM(kz) +
      (a.wartet ? " <span class='mini fertigmark'>" + a.wartet + " fertig, Ergebnis fehlt</span>" : "") +
      "</td><td>" + tagGeld(a.einge) + "</td><td>" + tagGeld(a.geholt) + "</td>" +
      "<td>" + tagGeld(a.einsatz) + "</td><td>" + tagGeld(a.gewonnen) + "</td>" +
      "<td>" + tagGeld(a.imSpiel) + "</td>" +
      "<td><b>" + tagGeld(a.guthaben) + "</b></td></tr>";
  }
  html += "</tbody><tfoot><tr><td><b>Zusammen</b></td><td><b>" + tagGeld(g.einge) + "</b></td>" +
    "<td><b>" + tagGeld(g.geholt) + "</b></td><td><b>" + tagGeld(g.einsatz) + "</b></td>" +
    "<td><b>" + tagGeld(g.gewonnen) + "</b></td><td><b>" + tagGeld(g.imSpiel) + "</b></td>" +
    "<td><b>" + tagGeld(g.guthaben) + "</b></td></tr></tfoot></table></div>";
  html += '<p class="mini"><b>Guthaben dort</b> = eingezahlt - zurückgeholt - gesetzt + gewonnen. ' +
    'Was noch <b>im Spiel</b> ist, steckt in offenen Kombinationen und ist darin schon abgezogen.</p>';
  return html + "</div>";
}

// ---------- 3. Wer haelt gerade wie viel? ----------
function tagHalterHtml(zeilen) {
  const mitGeld = zeilen.slice().sort((a, b) => b.haelt - a.haelt);
  let html = '<div class="tag-teil"><h3>&#128188; Wer hält gerade wie viel</h3>' +
    '<div class="tabellenrand"><table><thead><tr><th>Person</th><th>auf den Wegen</th>' +
    '<th>bei den Anbietern</th><th>im Spiel</th><th>hält zusammen</th>' +
    '<th>unterm Strich</th></tr></thead><tbody>';
  let g = { wege: 0, anb: 0, spiel: 0, haelt: 0, bilanz: 0 };
  for (const z of mitGeld) {
    g.wege += z.pr.aufWegen; g.anb += z.pr.beiAnbietern;
    g.spiel += z.pr.imSpiel; g.haelt += z.haelt; g.bilanz += z.pr.bilanz;
    html += "<tr><td><b>" + textSicherM(z.person.name) + "</b>" +
      (z.pr.probleme.length ? " <span class='mini e-ver'>&#9888; " + z.pr.probleme.length +
        " Hinweis" + (z.pr.probleme.length === 1 ? "" : "e") + "</span>" : "") + "</td>" +
      "<td>" + tagGeld(z.pr.aufWegen) + "</td><td>" + tagGeld(z.pr.beiAnbietern) + "</td>" +
      "<td>" + tagGeld(z.pr.imSpiel) + "</td><td><b>" + tagGeld(z.haelt) + "</b></td>" +
      "<td>" + tagGeldVz(z.pr.bilanz) + "</td></tr>";
  }
  html += "</tbody><tfoot><tr><td><b>Zusammen</b></td><td><b>" + tagGeld(g.wege) + "</b></td>" +
    "<td><b>" + tagGeld(g.anb) + "</b></td><td><b>" + tagGeld(g.spiel) + "</b></td>" +
    "<td><b>" + tagGeld(g.haelt) + "</b></td><td><b>" + tagGeldVz(g.bilanz) + "</b></td>" +
    "</tr></tfoot></table></div>";
  html += '<p class="mini"><b>Auf den Wegen</b> ist Geld, das die Person erhalten, aber noch nicht ' +
    'zum Anbieter gebracht hat (PayPal, Paysafe, Neteller, Skrill). <b>Unterm Strich</b> ist ' +
    'Gewinn oder Verlust bei dieser Person. Die Zahlen sind dieselben wie in der Personen-Kasse - ' +
    'sie kommen aus derselben Rechnung.</p>';
  return html + "</div>";
}
// ============================================================
// STAND DIREKT EINTRAGEN
//
// Karam tippt hier, wie viel WIRKLICH auf dem Konto liegt. Gespeichert
// wird die Differenz zum gerechneten Stand, nicht die absolute Zahl -
// so wirken spaetere Ein- und Auszahlungen ganz normal weiter, und im
// Verlauf sieht man noch, wann um wie viel korrigiert wurde.
//
// Die Differenz zaehlt NICHT als Gewinn (Karams Entscheidung): sie steht
// als "ungeklaert" daneben und wird in personPruefen aus der Bilanz
// wieder herausgerechnet.
// ============================================================

function standFeld(ordnerId, art, schluessel, jetzt) {
  const id = "st_" + art + "_" + schluessel;
  return '<span class="standfeld">' +
    // BEWUSST type=text mit inputmode=decimal, nicht type=number:
    // ein Zahlenfeld verwirft "250,50" je nach Spracheinstellung des
    // Browsers still - das Feld ist dann leer und niemand weiss warum.
    // Nachgemessen: im Test kam genau das heraus. So geht Komma UND Punkt.
    '<input type="text" inputmode="decimal" id="' + id + '" placeholder="' +
    Number(jetzt || 0).toFixed(2) + '" title="Wie viel liegt hier wirklich?">' +
    '<button onclick="tuStandSetzen(&quot;' + ordnerId + '&quot;,&quot;' + art +
    '&quot;,&quot;' + schluessel + '&quot;,' + Number(jetzt || 0) + ')">setzen</button></span>';
}

// Der Hinweis neben dem Namen, wenn schon einmal korrigiert wurde.
function korrekturMarke(k) {
  const n = Number(k || 0);
  if (Math.abs(n) < 0.005) return "";
  return " <span class='mini korrekturmarke' title='So viel wurde von Hand " +
    "dazugesetzt oder abgezogen. Zaehlt NICHT als Gewinn.'>ungeklärt " +
    (n >= 0 ? "+" : "") + n.toFixed(2) + " &euro;</span>";
}

function standErklaerung(schreib) {
  if (!schreib) return "";
  return '<p class="mini"><b>wirklich drauf:</b> trag hier ein, wie viel auf dem Konto ' +
    'tatsächlich liegt. Das Programm merkt sich die Differenz zum gerechneten Stand. ' +
    'Spätere Ein- und Auszahlungen rechnen ganz normal weiter, und du kannst die Zahl ' +
    'jederzeit wieder ändern. <b>Die Differenz zählt nicht als Gewinn</b> - sie steht ' +
    'als "ungeklärt" daneben, weil niemand weiß, woher das Geld kam.</p>';
}

async function tuStandSetzen(ordnerId, art, schluessel, jetzt) {
  const feld = el("st_" + art + "_" + schluessel);
  if (!feld) return;
  const text = String(feld.value || "").trim().replace(",", ".");
  if (!text) { meldungM("Trag zuerst ein, wie viel wirklich drauf liegt.", "warn"); return; }
  const soll = parseFloat(text);
  if (!isFinite(soll)) { meldungM("Das ist keine Zahl.", "warn"); return; }
  const ist = Number(jetzt || 0);
  const diff = Math.round((soll - ist) * 100) / 100;
  if (Math.abs(diff) < 0.005) {
    meldungM("Der Stand passt schon - es gibt nichts zu ändern.", "gut");
    feld.value = "";
    return;
  }
  const wohin = (art === "weg") ? wegName(schluessel) : anbieterNameM(schluessel);
  // Rueckfrage: hier wird eine Geldzahl von Hand verbogen, das soll man
  // nicht aus Versehen tun.
  const frage = "Bei " + wohin + " stehen gerechnet " + ist.toFixed(2) + " Euro.\n" +
    "Du sagst, es sind " + soll.toFixed(2) + " Euro.\n\n" +
    (diff > 0 ? "Es kommen " + diff.toFixed(2) + " Euro dazu."
              : "Es gehen " + Math.abs(diff).toFixed(2) + " Euro weg.") + "\n\n" +
    "Das zählt NICHT als Gewinn - unterm Strich bleibt gleich.\n\nEintragen?";
  if (!confirm(frage)) return;
  const heute = new Date();
  const datum = heute.getFullYear() + "-" + String(heute.getMonth() + 1).padStart(2, "0") +
    "-" + String(heute.getDate()).padStart(2, "0");
  const r = await supaPersonBuchen(aktiverBereich.id, ordnerId, datum,
    art === "weg" ? schluessel : null,
    art === "weg" ? "stand_weg" : "stand_anbieter",
    art === "weg" ? null : schluessel,
    diff, "Stand von Hand eingetragen: " + soll.toFixed(2) + " Euro");
  if (r && r.error) {
    meldungM("Nicht eingetragen: " + textSicherM(String(r.error.message).slice(0, 140)), "warn");
    return;
  }
  meldungM("<b>" + textSicherM(wohin) + " steht jetzt auf " + soll.toFixed(2) + " &euro;.</b> " +
    "Die " + (diff >= 0 ? "+" : "") + diff.toFixed(2) + " &euro; stehen als <b>ungeklärt</b> " +
    "daneben und zählen nicht als Gewinn. Ändern kannst du die Zahl jederzeit wieder.", "gut");
  zeichneBereich();
}

// Anbietername fuer die Rueckfrage. markeM liefert HTML, hier braucht es Text.
function anbieterNameM(kz) {
  const x = KASSE_ANBIETER.find(a => a[0] === kz);
  return x ? x[1] : kz;
}
// ============================================================
// ZWEI VERLAEUFE: voll gesetzt und nicht voll gesetzt
//
// Karam setzt eine Kombination bei einem Anbieter. Laesst der ihn nicht
// den vollen Betrag setzen, bleibt ein Rest offen. Beides steht im
// Verlauf, aber es sind zwei verschiedene Dinge:
//   voll  = da ist nichts mehr zu tun
//   unter = da liegt noch Geld herum, das untergebracht werden muss
//
// Eine Kombination kann in mehreren Teilen gesetzt sein (derselbe
// Schein bei zwei Anbietern). Die Teile heissen S41, S41_t2, S41_m2 -
// sie zaehlen ZUSAMMEN gegen das Ziel, sonst waere jeder Teil einzeln
// "nicht voll" und die Trennung waere wertlos.
// ============================================================

function stammIdM(scheinId) {
  // Mehrfach abschneiden, siehe stammId in kombis.js.
  return String(scheinId || "").replace(/(_(t|m)\d+)+$/, "");
}

function zielM() {
  try {
    const w = parseFloat(localStorage.getItem("kt_ziel"));
    if (isFinite(w) && w > 0) return w;
  } catch (e) { }
  return 400;
}

function verlaufFilterLesen() {
  let f = "alle";
  try { f = localStorage.getItem("kt_verlauf_filter") || "alle"; } catch (e) { }
  return ["alle", "voll", "unter"].indexOf(f) < 0 ? "alle" : f;
}

function verlaufFilterSetzen(f) {
  try { localStorage.setItem("kt_verlauf_filter", f); } catch (e) { }
  zeichneBereich();
}

function zielSetzenM(wert) {
  const w = parseFloat(String(wert).replace(",", "."));
  if (!isFinite(w) || w <= 0) { meldungM("Bitte eine Zahl größer als 0.", "warn"); return; }
  try { localStorage.setItem("kt_ziel", String(w)); } catch (e) { }
  zeichneBereich();
}

// Summiert die Teile je Kombination und sagt, was noch fehlt.
function verlaufGruppen(scheine) {
  const ziel = zielM();
  const g = {};
  for (const s of scheine) {
    const st = stammIdM(s.daten && s.daten.scheinId);
    if (!g[st]) g[st] = { einsatz: 0, teile: 0 };
    g[st].einsatz += (s.daten && Number(s.daten.einsatz)) || 0;
    g[st].teile++;
  }
  for (const st of Object.keys(g)) {
    g[st].fehlt = Math.round(Math.max(0, ziel - g[st].einsatz) * 100) / 100;
    g[st].voll = g[st].fehlt <= 0.004;
  }
  return g;
}

function zeichneVerlaufSchalter(scheine) {
  const kasten = el("verlaufschalter");
  if (!kasten) return;
  if (!scheine || !scheine.length) { kasten.innerHTML = ""; return; }

  const g = verlaufGruppen(scheine);
  const stt = Object.keys(g);
  const nVoll = stt.filter(s => g[s].voll).length;
  const nUnter = stt.length - nVoll;
  const fehltGesamt = stt.reduce((p, s) => p + g[s].fehlt, 0);
  const f = verlaufFilterLesen();

  const knopf = (wert, text, zahl) =>
    '<button type="button" class="vf-knopf' + (f === wert ? ' aktiv' : '') + '"' +
    ' onclick="verlaufFilterSetzen(&quot;' + wert + '&quot;)">' + text +
    ' <span class="vf-zahl">' + zahl + '</span></button>';

  kasten.innerHTML =
    knopf("alle", "Alle", stt.length) +
    knopf("voll", "Voll gesetzt", nVoll) +
    knopf("unter", "Nicht voll gesetzt", nUnter) +
    '<span class="vf-ziel">Ziel je Kombination: ' +
    '<input type="text" inputmode="decimal" value="' + zielM().toFixed(2) + '"' +
    ' onchange="zielSetzenM(this.value)"> &euro;</span>' +
    (nUnter
      ? '<span class="vf-fehlt">Es fehlen zusammen <b>' + fehltGesamt.toFixed(2) +
        ' &euro;</b> &ndash; im <a href="kombis.html">Kombi-Bau</a> neu mischen.</span>'
      : '<span class="vf-ok">Alles voll gesetzt.</span>');
}

// Zeigt in der Einsatz-Spalte, was an dieser Kombination noch fehlt.
// Bei mehreren Teilen steht dazu, dass die Summe gemeint ist - sonst
// sieht es aus, als fehle der Betrag bei jedem Teil einzeln.
function luecken(g) {
  if (!g || g.voll) return "";
  return '<div class="mini unterziel-mark">es fehlen ' + g.fehlt.toFixed(2) + ' &euro;' +
    (g.teile > 1 ? ' (' + g.teile + ' Teile zusammen)' : '') + '</div>';
}
// ============================================================
// EINSATZ NACHTRAEGLICH AENDERN
//
// Karam kann sich vertippen - er traegt die Zahl am Handy ein, waehrend
// er beim Anbieter steht. Bisher war sie danach fuer immer falsch.
//
// Bewusst mit Rueckfrage und mit einer Anmerkung am Schein: eine stille
// Aenderung an einer Geldzahl waere falsch. Wer spaeter abrechnet, muss
// sehen koennen, dass hier jemand nachgebessert hat.
// ============================================================
function einsatzZelle(s, schreib) {
  const d = s.daten || {};
  const wert = Number(d.einsatz) || 0;
  if (!schreib) return wert.toFixed(2) + " &euro;";
  // type=text mit inputmode: type=number verschluckt je nach
  // Spracheinstellung "250,50" stillschweigend.
  return "<input type='text' inputmode='decimal' class='einsatz' value='" +
    wert.toFixed(2) + "' onchange=\"tuEinsatz('" + s.id + "', this.value)\"> &euro;";
}

async function tuEinsatz(id, wert) {
  const zahl = parseFloat(String(wert).replace(",", "."));
  if (!isFinite(zahl) || zahl < 0) {
    meldungM("Bitte einen gültigen Betrag eintragen.", "warn");
    zeichneBereich(); return;
  }

  // FRISCH holen, nicht aus der Ansicht: die kann alt sein, und ein
  // Ueberschreiben mit alten Werten faellt niemandem auf.
  const holen = await supaScheinHolen(id);
  if (holen.fehler) { meldungM("Nicht geändert: " + holen.fehler, "warn"); zeichneBereich(); return; }

  const d = holen.daten || {};
  const alt = Number(d.einsatz) || 0;
  if (Math.abs(alt - zahl) < 0.005) { zeichneBereich(); return; }   // nichts zu tun

  const quote = Number(d.quote) || 0;
  // KARAMS REGEL (03.09.): d.moeglich ist der vom Anbieter ANGESAGTE
  // Hoechstgewinn (bei Interwetten schon nach Gebuehr). Stumpf
  // Einsatz x Quote wuerde diese Ansage wegradieren. Also skaliert der
  // angesagte Gewinn im Verhaeltnis der Einsaetze mit; nur wenn es
  // keinen brauchbaren Altwert gibt, greift Einsatz x Quote.
  const moeglichAlt = Number(d.moeglich) || 0;
  const moeglichNeu = (alt > 0 && moeglichAlt > 0)
    ? Math.round(moeglichAlt * (zahl / alt) * 100) / 100
    : Math.round(zahl * quote * 100) / 100;

  if (!confirm(
    "Einsatz dieser Kombination ändern?\n\n" +
    "   bisher:  " + alt.toFixed(2) + " Euro\n" +
    "   neu:     " + zahl.toFixed(2) + " Euro\n\n" +
    "Möglicher Gewinn ändert sich mit: " + (Number(d.moeglich) || 0).toFixed(2) +
    " -> " + moeglichNeu.toFixed(2) + " Euro.\n\n" +
    "Diese Zahl geht in Konto, Personenkasse und Buchhaltung ein. " +
    "Die Änderung wird als Anmerkung am Schein vermerkt.")) { zeichneBereich(); return; }

  d.einsatz = Math.round(zahl * 100) / 100;
  d.moeglich = moeglichNeu;

  const r = await supaScheinDatenSchreiben(id, holen.key, d);
  if (r.error) { meldungM("Nicht geändert: " + r.error.message, "warn"); zeichneBereich(); return; }
  if (!r.data || !r.data.length) {
    // Die stille Falle: ohne select() saehe ein an den Rechten
    // gescheitertes Update genauso aus wie ein gelungenes.
    meldungM("Nicht geändert: kein Schreibrecht oder Kombination weg.", "warn");
    zeichneBereich(); return;
  }

  // Die Spur. Schlaegt sie fehl, ist der Einsatz trotzdem geaendert -
  // das muss dann auch so dastehen und nicht als Gesamtfehler.
  try {
    const a = await supaAnmerken(holen.bereich, id,
      "Einsatz geändert: " + alt.toFixed(2) + " -> " + zahl.toFixed(2) + " Euro");
    if (a && a.error) {
      meldungM("Einsatz geändert auf " + zahl.toFixed(2) +
        " Euro. Die Anmerkung dazu ließ sich nicht speichern: " + a.error.message, "warn");
      zeichneBereich(); return;
    }
  } catch (e) {
    meldungM("Einsatz geändert auf " + zahl.toFixed(2) +
      " Euro. Die Anmerkung dazu ließ sich nicht speichern.", "warn");
    zeichneBereich(); return;
  }

  meldungM("Einsatz geändert: " + alt.toFixed(2) + " -> " + zahl.toFixed(2) + " Euro.", "gut");
  zeichneBereich();
}
// Anbieter + die drei Wetten samt LINIE. Dieselben Spiele mit einer
// anderen Linie sind eine andere Wette, keine Kopie. Der Einsatz zaehlt
// NICHT mit: wer zweimal speichert, tippt beim zweiten Mal leicht etwas
// anderes ein.
function kombiFingerM(s) {
  const d = s && s.daten;
  if (!d) return "";
  const teile = (d.wetten || [])
    .map(w => String(w.id) + ":" + String(w.linie === undefined ? "" : w.linie))
    .sort();
  if (!teile.length) return "";
  // Die PERSON gehoert dazu: dieselbe Kombination bei zwei Personen ist
  // zweimal gesetztes Geld bei zwei Leuten, keine Kopie.
  return String(s.ordner || "-") + "|" + (d.kz || "?") + "|" + teile.join("|");
}

// Gibt je Schein-Id zurueck, ob sie ein spaeterer Doppeleintrag ist und
// wie viele es insgesamt sind. Der ERSTE gilt als der richtige.
function doppelteM(scheine) {
  const nach = {};
  for (const s of scheine) {
    const f = kombiFingerM(s);
    if (!f) continue;
    (nach[f] = nach[f] || []).push(s);
  }
  const raus = {};
  for (const f of Object.keys(nach)) {
    const g = nach[f];
    if (g.length < 2) continue;
    const sortiert = g.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    sortiert.forEach((s, i) => {
      raus[s.id] = { zahl: g.length, spaeter: i > 0, platz: i + 1 };
    });
  }
  return raus;
}
// ============================================================
// ANBIETER-KOPF (Karam, 02.09.2026): die vier Anbieter nebeneinander
// ganz oben - je Anbieter der rechnerische Geldstand und was in den
// offenen Kombinationen noch zu holen ist. Ein Klick filtert die EINE
// Kombi-Liste unten und klappt die komplette Uebersicht auf
// (eingezahlt, zurueckgeholt, gesetzt, gewonnen, je Person).
// Die Zahlen sind gerechnet, aber uebersteuerbar: das Feld "wirklich
// drauf" je Person steht direkt in der Uebersicht - eine Korrektur
// wird als Buchung gespeichert und fliesst ab dann in alles ein.
// ============================================================
let anbieterFilter = "alle";

function anbieterNameM(kz) {
  const x = KASSE_ANBIETER.find(k => k[0] === kz);
  return x ? x[1] : kz;
}

// Summen je Anbieter: ueber alle Personen (personPruefen) PLUS die
// Scheine ohne Person - die haben keine Einzahlungen, aber Einsatz,
// Gewinn und offene Moeglichkeiten, und fehlten sonst im Kopf.
function anbieterSummen() {
  const summe = {};
  for (const [kz] of KASSE_ANBIETER)
    summe[kz] = { einge: 0, geholt: 0, einsatz: 0, gewonnen: 0, guthaben: 0,
                  imSpiel: 0, moeglichOffen: 0, wartet: 0, offen: 0, gew: 0, ver: 0,
                  personen: [] };
  const scheine = Array.isArray(kasseScheine) ? kasseScheine : [];
  for (const o of (ordnerListe || [])) {
    const pr = personPruefen(o.id, scheine);
    for (const [kz] of KASSE_ANBIETER) {
      const a = pr.anbieter[kz];
      if (!a) continue;
      for (const f of ["einge", "geholt", "einsatz", "gewonnen", "guthaben", "imSpiel", "moeglichOffen", "wartet"])
        summe[kz][f] += a[f] || 0;
      if ((a.einge || a.einsatz || a.gewonnen || a.imSpiel || a.guthaben))
        summe[kz].personen.push({ id: o.id, name: o.name || "?", a: a });
    }
  }
  for (const s of scheine) {
    const kz = s.daten && s.daten.kz;
    if (!kz || !summe[kz]) continue;
    if (s.stand === "offen") summe[kz].offen++;
    else if (s.stand === "gewonnen") summe[kz].gew++;
    else if (s.stand === "verloren") summe[kz].ver++;
    if (!s.ordner && s.daten) {
      // ohne Person: zaehlt im Kopf mit, sonst fehlt Geld in der Summe
      summe[kz].einsatz += s.daten.einsatz || 0;
      if (s.stand === "gewonnen") summe[kz].gewonnen += echtZurueckWert(s);
      if (s.stand === "offen") {
        summe[kz].imSpiel += s.daten.einsatz || 0;
        summe[kz].moeglichOffen += s.daten.moeglich || 0;
      }
      summe[kz].guthaben += (s.stand === "gewonnen" ? echtZurueckWert(s) : 0) - (s.daten.einsatz || 0);
    }
  }
  return summe;
}

function zeichneAnbieterKopf() {
  const box = el("anbieterkopf");
  if (!box) return;
  if (!aktiverBereich) { box.innerHTML = ""; return; }
  const summe = anbieterSummen();
  let html = '<div class="ak-leiste">';
  html += '<button class="ak-karte ak-alle' + (anbieterFilter === "alle" ? " ak-aktiv" : "") +
    '" onclick="tuAnbieterFilter(\'alle\')"><span class="ak-name">Alle</span>' +
    '<span class="ak-zeile mini">Filter aus</span></button>';
  // Karams Reihenfolge (KT_ANBIETER_RANG steht in kombis.js, das diese
  // Seite nicht laedt - deshalb hier dieselbe Folge ausgeschrieben).
  for (const [kz, name] of ["st", "iw", "bw", "b3"].map(k => KASSE_ANBIETER.find(x => x[0] === k))) {
    const a = summe[kz];
    html += '<button class="ak-karte ak-' + kz + (anbieterFilter === kz ? " ak-aktiv" : "") +
      '" onclick="tuAnbieterFilter(\'' + kz + '\')">' +
      '<span class="ak-name">' + name + '</span>' +
      '<span class="ak-zeile">drauf: <b>' + tagGeld(a.guthaben) + '</b></span>' +
      '<span class="ak-zeile">noch m&ouml;glich: <b>' + tagGeld(a.moeglichOffen) + '</b></span>' +
      '<span class="ak-zeile mini">' + a.offen + ' offen &middot; ' + a.gew + ' gew &middot; ' + a.ver + ' ver' +
      (a.wartet ? ' &middot; ' + a.wartet + ' wartet' : '') + '</span></button>';
  }
  html += '</div>';
  if (anbieterFilter !== "alle") html += anbieterDetailHtml(anbieterFilter, summe[anbieterFilter]);
  box.innerHTML = html;
}

function anbieterDetailHtml(kz, a) {
  const schreib = darfSchreiben();
  let html = '<div class="ak-detail">' + markeM(kz) + ' <b>komplette &Uuml;bersicht</b>' +
    '<div class="tabellenrand"><table><thead><tr><th></th><th>eingezahlt</th><th>zur&uuml;ckgeholt</th>' +
    '<th>gesetzt</th><th>gewonnen</th><th>im Spiel</th><th>noch m&ouml;glich</th><th>rechnerisch drauf</th>' +
    (schreib ? '<th>wirklich drauf</th>' : '') + '</tr></thead><tbody>';
  for (const p of a.personen) {
    html += '<tr><td>' + textSicherM(p.name) + '</td><td>' + tagGeld(p.a.einge) + '</td>' +
      '<td>' + tagGeld(p.a.geholt) + '</td><td>' + tagGeld(p.a.einsatz) + '</td>' +
      '<td>' + tagGeld(p.a.gewonnen) + '</td><td>' + tagGeld(p.a.imSpiel || 0) + '</td>' +
      '<td>' + tagGeld(p.a.moeglichOffen || 0) + '</td><td>' + tagGeld(p.a.guthaben) + '</td>' +
      (schreib ? '<td>' + standFeld(p.id, "anbieter", kz, p.a.guthaben) + '</td>' : '') + '</tr>';
  }
  html += '<tr class="ak-summe"><td><b>Zusammen</b></td><td><b>' + tagGeld(a.einge) + '</b></td>' +
    '<td><b>' + tagGeld(a.geholt) + '</b></td><td><b>' + tagGeld(a.einsatz) + '</b></td>' +
    '<td><b>' + tagGeld(a.gewonnen) + '</b></td><td><b>' + tagGeld(a.imSpiel) + '</b></td>' +
    '<td><b>' + tagGeld(a.moeglichOffen) + '</b></td><td><b>' + tagGeld(a.guthaben) + '</b></td>' +
    (schreib ? '<td></td>' : '') + '</tr></tbody></table></div>' +
    '<p class="mini"><b>rechnerisch drauf</b> = eingezahlt - zur&uuml;ckgeholt - gesetzt + gewonnen (+ Korrekturen). ' +
    'Stimmt die Zahl nicht (Altbestand von vor dem Programm, R&uuml;cknahme, Programmfehler): bei <b>wirklich drauf</b> ' +
    'den echten Stand eintragen - der Unterschied wird als Korrektur-Buchung gespeichert und gilt ab sofort &uuml;berall. ' +
    'Alte Kombinationen tr&auml;gst du in der Personen-Kasse mit <b>von Hand nachtragen</b> ein; ' +
    'gewonnen/verloren stellst du unten am Schein um.</p></div>';
  return html;
}

function tuAnbieterFilter(kz) {
  anbieterFilter = (anbieterFilter === kz) ? "alle" : kz;
  zeichneAnbieterKopf();
  // Nur die Liste neu, nicht der ganze Bereich: gleiche Filterkette wie
  // in zeichneBereich (erst Person, dann drinnen Voll/Unter+Anbieter).
  const scheine = Array.isArray(kasseScheine) ? kasseScheine : [];
  const gefiltert = (ordnerFilter === "alle") ? scheine
    : (ordnerFilter === "ohne") ? scheine.filter(s => !s.ordner)
    : scheine.filter(s => s.ordner === ordnerFilter);
  zeichneKontoDb(gefiltert);
  zeichneScheineDb(gefiltert);
}

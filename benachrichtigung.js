// ============================================================
// BENACHRICHTIGUNG: macht die Kombi-Tafel zur installierbaren
// App (Laptop und Handy) und bringt Meldungen aufs Geraet:
//
//  1. Ist die App/Seite offen (auch im Hintergrund), zeigt der
//     Browser direkt eine Systemmeldung (neue Nachricht, Anruf).
//  2. Ist sie ZU, schickt die Server-Funktion push-senden eine
//     echte Push-Nachricht an alle angemeldeten Geraete - IMMER
//     ohne Inhalt (der bleibt Ende-zu-Ende), nur "X ruft an" /
//     "Neue Nachricht von X".
//
// iOS-Besonderheit: Push funktioniert dort erst, wenn die App
// uebers Teilen-Menue zum Home-Bildschirm hinzugefuegt wurde.
//
// ---- WECKER-UMBAU (28.08.) ----
// Was sich geaendert hat und warum:
//  A) pushStatus hat frueher NUR den Browser gefragt und "an"
//     gemeldet, obwohl in der Datenbank gar keine Zeile stand.
//     Jetzt wird BEIDES geprueft; im Zweifel sagt die App
//     "nicht sicher" statt gruen zu luegen.
//  B) pushEinschalten prueft ZUERST die Anmeldung, holt dann die
//     Erlaubnis, abonniert und speichert. Geht das Speichern
//     schief, wird die eben angelegte Anmeldung wieder
//     abbestellt - kein halber Zustand.
//  C) pushSenden ist nicht mehr "Feuer und vergessen": die
//     Antwort wird gelesen, und wer niemanden erreicht hat,
//     erfaehrt das im Klartext.
//  D) Neu: die freundliche Frage nach dem Anmelden, ein
//     Schalt-Kasten auf JEDER Seite (Glocken-Knopf oben),
//     Selbsttest, Geraeteliste und der iPhone-Hinweis.
// ============================================================
"use strict";

// Welche Fassung laeuft hier gerade? Steht im ?v= des eigenen Skript-Tags.
const APP_FASSUNG = (function () {
  try {
    const s = document.currentScript && document.currentScript.src;
    const m = s && s.match(/[?&]v=([A-Za-z0-9._-]+)/);
    return m ? m[1] : null;
  } catch (e) { return null; }
})();

const PUSH_PUB = "BEOK4zMFAGnbRL1k4VNm_4wX388JIkHCQhBYdijrFk7NsBmbBRawKep6dA579tImu2H6qkU1k_ts6QhCKo-PfR8";
const PUSH_URL = "https://mqmevpyatjsambervgtu.supabase.co/functions/v1/push-senden";

let _installEreignis = null;

// ---------- App installierbar machen ----------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  _installEreignis = e;
  appInstallKnopfZeigen();
});

window.addEventListener("appinstalled", () => {
  _installEreignis = null;
  const k = document.getElementById("app_install_knopf");
  if (k) k.remove();
});

function appInstallKnopfZeigen() {
  if (document.getElementById("app_install_knopf")) return;
  const nav = document.querySelector(".navleiste");
  if (!nav) return;
  const k = document.createElement("a");
  k.id = "app_install_knopf";
  k.href = "#";
  k.className = "navknopf installknopf";
  k.textContent = "App laden";
  k.onclick = ev => {
    ev.preventDefault();
    if (_installEreignis) _installEreignis.prompt();
  };
  nav.appendChild(k);
}

// ---------- Systemmeldung, wenn die Seite offen ist ----------

// Wartet KURZ auf den Service Worker, statt nur nachzusehen, ob er schon
// da ist. Fund: gleich nach dem Laden war er es oft nicht, und der alte
// Rueckfall auf "new Notification" ist auf Android-Chrome verboten.
function wkRegistrierung(wartenMs) {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise(fertig => setTimeout(() => fertig(null), wartenMs || 3000))
  ]).then(r => r || navigator.serviceWorker.getRegistration().catch(() => null));
}

async function benachrichtige(titel, text, tag, mehr) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden && tag !== "anruf") return;   // sichtbar: nur Anrufe melden
    const vonWem = (mehr && mehr.von) || null;
    const reg = await wkRegistrierung();
    const einst = {
      body: text || "",
      icon: "logo-192.png",
      badge: "logo-192.png",
      // Je Absender ein eigener Merkzettel: sonst ersetzt der zweite Anruf
      // den ersten und einer verschwindet spurlos.
      tag: vonWem ? (tag || "kombi-tafel") + "-" + vonWem : (tag || "kombi-tafel"),
      renotify: true,
      requireInteraction: tag === "anruf",
      vibrate: tag === "anruf" ? [500, 250, 500, 250, 500] : [200, 100, 200],
      data: { url: "mein.html", art: tag || "nachricht", von: vonWem }
    };
    if (reg) {
      if (tag === "anruf") einst.actions = [
        { action: "annehmen", title: "Annehmen" },
        { action: "ablehnen", title: "Ablehnen" }
      ];
      await reg.showNotification(titel, einst);
      return;
    }
    // KEIN Rueckfall auf "new Notification": Android-Chrome verbietet den
    // Aufruf und wirft einen Fehler, den der leere catch nur verschlucken
    // wuerde. Ohne Service Worker gibt es hier ehrlich keine Meldung.
  } catch (e) { /* Benachrichtigungen stoeren nie die Seite */ }
}

// ---------- Push-Abo dieses Geraets ----------

function pushB64zuBytes(s) {
  const roh = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const b = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
  return b;
}

// Ein lesbarer Geraetename statt der langen Browser-Kennung.
function pushGeraetName() {
  const ua = navigator.userAgent || "";
  const sys = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android-Handy"
    : /Windows/.test(ua) ? "Windows-Rechner"
    : /Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux-Rechner" : "Geraet";
  const br = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "Browser";
  return (sys + ", " + br + (weckerIstStandalone() ? ", als App" : "")).slice(0, 80);
}

// Ruft die Server-Funktion push-senden auf und LIEST die Antwort.
// Frueher wurde die Antwort weggeworfen - deshalb hat niemand gemerkt,
// wenn gar nichts hinausging.
async function pushFunktion(koerper) {
  try {
    if (!window.supa) return { status: 0, daten: { fehler: "Datenbank-Bibliothek nicht geladen" } };
    const s = await supaSitzung();
    if (!s) return { status: 401, daten: { fehler: "nicht angemeldet" } };
    const a = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.access_token,
        "apikey": SUPA_KEY
      },
      body: JSON.stringify(koerper)
    });
    let d = {};
    try { d = await a.json(); } catch (e) { d = {}; }
    return { status: a.status, daten: d || {} };
  } catch (e) {
    return { status: 0, daten: { fehler: String(e.message || e).slice(0, 120) } };
  }
}

// Traegt dieses Geraet in die Datenbank ein.
//
// Das laeuft ueber die Datenbank-Funktion kt_push_eintragen. Sie loescht
// zuerst jede Zeile mit demselben Geraet und traegt dann DICH ein. Das
// ist noetig, weil sich am selben Laptop auch eine zweite Person anmelden
// kann: die Zeile gehoert dann noch der ersten, und ein gewoehnliches
// Speichern scheitert an den Rechten (dann bekaeme die zweite Person nie
// etwas, und die Meldungen der ersten liefen weiter auf dieses Geraet).
// Die Funktion setzt den Besitzer immer hart auf den Angemeldeten, man
// kann sich also kein fremdes Geraet unterschieben.
async function pushAboEintragen(daten, u, altEndpoint) {
  if (!u) return { fehler: "Zuerst anmelden." };
  const geraet = pushGeraetName();
  const w = await supa.rpc("kt_push_eintragen", {
    p_endpoint: daten.endpoint, p_p256dh: daten.p256dh,
    p_auth: daten.auth, p_geraet: geraet
  });
  if (w.error) return { fehler: pushFehlerKlartext(w.error.message) };
  // Hat der Browser dem Geraet eine neue Anschrift gegeben, die alte
  // Zeile wegraeumen - sonst zaehlt sie in der Geraeteliste doppelt.
  if (altEndpoint && altEndpoint !== daten.endpoint) {
    await supa.from("kt_push_abos").delete().eq("endpoint", altEndpoint).eq("nutzer", u.id);
  }
  return { ok: true };
}

// Datenbank-Fehler sind englisch und technisch. Karam ist kein
// Programmierer, deshalb wird hier uebersetzt statt durchgereicht.
function pushFehlerKlartext(m) {
  const t = String(m || "");
  if (/row-level|policy|permission|42501/i.test(t))
    return "Die Datenbank hat das Eintragen abgelehnt. Bitte einmal abmelden, " +
      "neu anmelden und es noch einmal versuchen.";
  if (/JWT|expired|token/i.test(t))
    return "Deine Anmeldung ist abgelaufen - bitte die Seite neu laden und dich neu anmelden.";
  if (/Failed to fetch|NetworkError|network/i.test(t))
    return "Keine Verbindung zum Server. Internet pruefen und noch einmal versuchen.";
  if (/duplicate|unique/i.test(t))
    return "Dieses Geraet ist schon eingetragen.";
  if (/nicht angemeldet/i.test(t))
    return "Zuerst anmelden - Benachrichtigungen gehoeren zu deinem Konto.";
  return t.slice(0, 140) || "Unbekannter Fehler.";
}

// still = true: nur nachtragen, wenn die Erlaubnis schon da ist (fragt nie).
async function pushEinschalten(still) {
  try {
    if (pushIosOhneApp())
      return { fehler: "Auf dem iPhone und iPad geht das erst, wenn du diese Seite ueber das " +
        "Teilen-Zeichen und \"Zum Home-Bildschirm\" als App ablegst. Danach die App von dort " +
        "starten und hier noch einmal einschalten." };
    if (!("Notification" in window) || !("serviceWorker" in navigator))
      return { fehler: "Dieser Browser kann keine Benachrichtigungen." };

    // 1. ZUERST fragen - und zwar OHNE vorher irgendetwas abzuwarten.
    //    Auf dem iPhone zeigt Safari die Frage nur, wenn sie unmittelbar
    //    aus dem Fingertipp kommt. Stand hier vorher ein "await" (die
    //    Anmelde-Pruefung), war der Tipp verbraucht und Apple hat die
    //    Frage stillschweigend verschluckt: der Knopf tat scheinbar nichts.
    //    Das blosse Fragen legt noch NICHTS an, also entsteht auch kein
    //    halber Zustand, wenn danach etwas schiefgeht.
    let erlaubnis = Notification.permission;
    if (erlaubnis === "denied")
      return { fehler: pushIstApple()
        ? "Das iPhone hat Benachrichtigungen für diese App gesperrt. Wieder einschalten: " +
          "Einstellungen (das graue Zahnrad) öffnen, ganz unten die Kombi-Tafel suchen, " +
          "antippen und Mitteilungen erlauben."
        : "Dieser Browser hat Benachrichtigungen für die Seite gesperrt. Wieder erlauben " +
          "geht nur dort: auf das Schloss-Zeichen links neben der Adresse tippen." };
    if (erlaubnis !== "granted") {
      if (still) return { fehler: "noch nicht erlaubt" };
      erlaubnis = await Notification.requestPermission();
    }
    if (erlaubnis !== "granted")
      return { fehler: "Benachrichtigungen wurden nicht erlaubt." };

    // 2. Erst JETZT die Anmeldung pruefen - vor dem Abonnieren, damit kein
    //    Abo entsteht, das in der Datenbank nie ankommt.
    const u = await supaNutzer();
    if (!u) return { fehler: (pushIstIos() && weckerIstStandalone())
      ? "Du musst dich HIER in der App noch einmal anmelden. Das iPhone hält die " +
        "App vom Home-Bildschirm getrennt von Safari - deine Anmeldung aus Safari " +
        "gilt hier nicht. Einmal anmelden, dann bleibt es."
      : "Zuerst anmelden - Benachrichtigungen gehören zu deinem Konto." };
    const reg = await wkRegistrierung(8000);
    if (!reg || !reg.pushManager) return { ok: true, nurLokal: true };
    // 3. Vorhandene Anmeldung wiederverwenden, sonst eine neue anlegen.
    let abo = await reg.pushManager.getSubscription();
    const warSchonDa = !!abo;
    if (!abo) abo = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pushB64zuBytes(PUSH_PUB)
    });
    // 4. Speichern. Klappt das nicht, die eben angelegte Anmeldung wieder
    //    abbestellen - sonst bleibt ein halber Zustand zurueck.
    const j = abo.toJSON();
    const e = await pushAboEintragen({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, u);
    if (e.fehler) {
      if (!warSchonDa) { try { await abo.unsubscribe(); } catch (x) { } }
      return { fehler: e.fehler };
    }
    pushStatusVergessen();
    return { ok: true, ueberServer: !!e.ueberServer };
  } catch (e) {
    return { fehler: String(e.message || e).slice(0, 140) };
  }
}

// Schaltet dieses Geraet wieder ab: aus der Datenbank UND aus dem Browser.
async function pushAusschalten() {
  try {
    const reg = await wkRegistrierung();
    const abo = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (abo) {
      const u = await supaNutzer();
      if (u) await supa.from("kt_push_abos").delete().eq("endpoint", abo.endpoint).eq("nutzer", u.id);
      try { await abo.unsubscribe(); } catch (x) { }
    }
    pushStatusVergessen();
    return { ok: true };
  } catch (e) { return { fehler: String(e.message || e).slice(0, 140) }; }
}

// Moegliche Antworten:
//  "geht nicht"   - dieser Browser kann es ueberhaupt nicht
//  "ios-install"  - iPhone/iPad: erst zum Home-Bildschirm hinzufuegen
//  "anmelden"     - niemand angemeldet
//  "gesperrt"     - der Mensch hat es im Browser ausdruecklich verboten
//  "aus"          - noch nicht eingeschaltet
//  "halb"         - Browser sagt ja, aber dieses Geraet steht NICHT in der
//                   Datenbank (genau die Luecke, durch die frueher alles fiel)
//  "an"           - wirklich an: Browser UND Datenbank
//  "unklar"       - die Datenbank war nicht erreichbar; wir behaupten nichts
// Kurzes Gedaechtnis: pushStatus wird pro Seitenaufruf mehrfach gebraucht
// (Knopf malen, Frage zeigen, still nachtragen), und jeder Lauf ist eine
// eigene Abfrage an Supabase. Bei sieben Seiten und haeufigem Wechseln
// waeren das unnoetig viele Verbindungen - dieses Projekt ist damit schon
// einmal angeeckt. Zehn Sekunden reichen fuer einen Seitenaufbau.
let _pushStatusMerk = null;
let _pushStatusZeit = 0;

function pushStatusVergessen() { _pushStatusMerk = null; _pushStatusZeit = 0; }

async function pushStatus(frisch) {
  if (!frisch && _pushStatusMerk && (Date.now() - _pushStatusZeit) < 10000) return _pushStatusMerk;
  const st = await pushStatusHolen();
  _pushStatusMerk = st;
  _pushStatusZeit = Date.now();
  return st;
}

async function pushStatusHolen() {
  try {
    if (pushIosOhneApp()) return "ios-install";
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return "geht nicht";
    if (Notification.permission === "denied") return "gesperrt";
    if (Notification.permission !== "granted") return "aus";
    const reg = await wkRegistrierung();
    const abo = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (!abo) return "aus";
    if (!window.supa) return "unklar";
    const u = await supaNutzer();
    if (!u) return "anmelden";
    // DER entscheidende Punkt: steht dieses Geraet auch WIRKLICH mit
    // DIESEM Konto in der Datenbank? Nur den Browser zu fragen hat frueher
    // gruen gemeldet, obwohl nie etwas ankam.
    const r = await supa.from("kt_push_abos").select("id")
      .eq("nutzer", u.id).eq("endpoint", abo.endpoint).maybeSingle();
    if (r.error) return "unklar";
    return r.data ? "an" : "halb";
  } catch (e) { return "unklar"; }
}

function pushStatusText(st) {
  if (st === "an") return "Benachrichtigungen sind auf diesem Geraet an.";
  if (st === "halb") return "Fast: der Browser erlaubt es, aber dieses Geraet steht nicht in deinem Konto. " +
    "Ein Klick auf Einschalten repariert das.";
  if (st === "aus") return "Benachrichtigungen sind auf diesem Geraet aus.";
  // Auf dem iPhone gibt es in der Home-Bildschirm-App gar keine Adressleiste
  // und damit kein Schloss-Zeichen - dort steht der Schalter woanders.
  if (st === "gesperrt") return pushIstIos()
    ? "Das iPhone hat Mitteilungen fuer diese App gesperrt. Wieder einschalten: " +
      "Einstellungen (graues Zahnrad) oeffnen, ganz nach unten zur Kombi-Tafel, " +
      "antippen und Mitteilungen erlauben."
    : "Dieser Browser hat Benachrichtigungen fuer die Seite gesperrt. " +
      "Das laesst sich nur dort wieder erlauben: auf das Schloss-Zeichen links neben der Adresse " +
      "tippen und Benachrichtigungen auf Erlauben stellen.";
  if (st === "anmelden") return "Zuerst anmelden - Benachrichtigungen gehoeren zu deinem Konto.";
  if (st === "ios-install") return "iPhone und iPad: Benachrichtigungen gehen erst, wenn die Seite als App " +
    "auf dem Home-Bildschirm liegt.";
  if (st === "geht nicht") return "Dieser Browser kann keine Benachrichtigungen.";
  return "Nicht sicher: die Datenbank war gerade nicht erreichbar. Lieber noch einmal pruefen.";
}

// ---------- Push an einen Empfaenger schicken ----------

// Gibt IMMER ein Ergebnis zurueck (und wirft nie):
//   { ok:true, gesendet, geraete, verteilt }  oder  { ok:false, fehler }
async function pushSenden(anId, art, mehr) {
  try {
    const koerper = Object.assign({ an: anId, art: art || "dm" }, mehr || {});
    const r = await pushFunktion(koerper);
    const d = r.daten || {};
    if (r.status === 200) {
      return { ok: true, gesendet: d.gesendet || 0, geraete: d.geraete || 0,
        verteilt: !!d.verteilt, test: !!d.test };
    }
    return { ok: false, status: r.status, fehler:
      r.status === 401 ? "Deine Anmeldung ist abgelaufen - bitte einmal neu anmelden."
      : r.status === 403 ? "Ihr seid nicht befreundet und teilt keinen Bereich - deshalb darf ich dort nicht anklopfen."
      : r.status === 500 ? "Der Benachrichtigungs-Server hat gerade ein Problem."
      : r.status === 0 ? "Kein Netz fuer die Benachrichtigung."
      : (d.fehler || "Die Benachrichtigung ging nicht hinaus.") };
  } catch (e) {
    return { ok: false, status: 0, fehler: "Kein Netz fuer die Benachrichtigung." };
  }
}

// Schickt und SAGT ehrlich, wenn niemand erreicht wurde.
// wenName darf null sein; ruheMinuten verhindert Dauergemecker im Chat.
async function pushMelden(anId, art, wenName, mehr, ruheMinuten) {
  const wer = wenName || "Der Empfaenger";
  const r = await pushSenden(anId, art, mehr);
  if (!r.ok) {
    weckerBalken("Anklopfen bei " + wer + " ging nicht: " + r.fehler, "warn",
      "push-fehler-" + anId, ruheMinuten || 5);
    return r;
  }
  if (r.geraete === 0) {
    weckerBalken(wer + " hat auf keinem Geraet Benachrichtigungen eingeschaltet. " +
      "Ist die App dort gerade zu, merkt er nichts davon.", "warn",
      "push-leer-" + anId, ruheMinuten || 30);
  }
  return r;
}

// ============================================================
// DER WECKER
// Alles ab hier ist Bedienung und Anzeige: die freundliche Frage,
// der Schalt-Kasten auf jeder Seite, der Selbsttest, die
// Geraeteliste und der iPhone-Hinweis. Rechenwege und der
// Anruf-Signalweg werden hier NICHT angefasst.
// ============================================================

let _weckerBalkenUhr = null;
const _weckerBalkenZeit = {};

function weckerIstStandalone() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  } catch (e) { return false; }
}

function pushIstIos() {
  const ua = navigator.userAgent || "";
  // iPad ab iOS 13 meldet sich als Macintosh - dann verraet es der Touch.
  return /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

function pushIosOhneApp() { return pushIstIos() && !weckerIstStandalone(); }

// Fuer Hilfetexte: auf dem iPhone stehen die Schalter woanders als am Rechner.
function pushIstApple() { return pushIstIos(); }

// ---------- Der kleine Meldebalken (statt stiller Fehlschlaege) ----------

function weckerBalkenZu() {
  const b = document.getElementById("weckerbalken");
  if (b) b.remove();
}

function weckerBalken(text, art, schluessel, ruheMinuten) {
  try {
    if (schluessel) {
      const jetzt = Date.now();
      const ruhe = (ruheMinuten || 10) * 60000;
      if (_weckerBalkenZeit[schluessel] && jetzt - _weckerBalkenZeit[schluessel] < ruhe) return;
      _weckerBalkenZeit[schluessel] = jetzt;
    }
    if (!document.body) return;
    weckerBalkenZu();
    const b = document.createElement("div");
    b.id = "weckerbalken";
    b.className = art === "warn" ? "wk-warn" : (art === "gut" ? "wk-gut" : "");
    const t = document.createElement("span");
    t.className = "wk-balken-text";
    t.textContent = text;
    const z = document.createElement("button");
    z.className = "wk-balken-zu";
    z.textContent = "schliessen";
    z.onclick = weckerBalkenZu;
    b.appendChild(t);
    b.appendChild(z);
    document.body.appendChild(b);
    clearTimeout(_weckerBalkenUhr);
    _weckerBalkenUhr = setTimeout(weckerBalkenZu, art === "warn" ? 14000 : 7000);
  } catch (e) { /* eine Meldung darf nie die Seite kippen */ }
}

// ---------- Die freundliche Frage (Karams Hauptwunsch) ----------

function weckerFrageZu(spaeter) {
  const f = document.getElementById("weckerfrage");
  if (f) f.remove();
  if (spaeter) {
    // Drei Tage Ruhe - danach fragen wir freundlich noch einmal.
    try { localStorage.setItem("kt_wecker_spaeter", String(Date.now() + 3 * 24 * 3600 * 1000)); } catch (e) { }
  }
}

async function weckerFrageZeigen(trotzSpaeter) {
  try {
    if (!document.body) return;
    if (document.getElementById("weckerfrage")) return;
    if (!trotzSpaeter) {
      const bis = parseInt(localStorage.getItem("kt_wecker_spaeter") || "0", 10);
      if (bis && Date.now() < bis) return;
    }
    const st = await pushStatus();
    // Wer es ausdruecklich gesperrt hat, wird nicht behelligt - der Weg
    // zurueck steht im Schalt-Kasten.
    if (st === "an" || st === "geht nicht" || st === "anmelden" || st === "gesperrt") return;
    if (st === "unklar" && !trotzSpaeter) return;
    const kasten = document.createElement("div");
    kasten.id = "weckerfrage";
    if (st === "ios-install") {
      kasten.innerHTML =
        '<div class="wk-frage-karte">' +
        '<div class="wk-frage-kopf">&#128276; Damit dein iPhone dich anklopft</div>' +
        '<p class="wk-frage-text">Auf dem iPhone und iPad laesst Apple Benachrichtigungen nur zu, ' +
        'wenn die Seite als App auf dem Home-Bildschirm liegt. Das dauert zehn Sekunden:</p>' +
        '<ol class="wk-frage-schritte"><li>Unten in Safari auf das Teilen-Zeichen tippen ' +
        '(Viereck mit Pfeil nach oben).</li><li>Weiter unten "Zum Home-Bildschirm" waehlen.</li>' +
        '<li>Die Kombi-Tafel von dort starten - nicht mehr aus Safari.</li>' +
        '<li>Dann kommt hier die Frage nach den Benachrichtigungen.</li></ol>' +
        '<div class="wk-frage-tasten">' +
        '<button class="wk-ja" onclick="weckerFrageZu(false)">Verstanden</button>' +
        '<button class="wk-spaeter" onclick="weckerFrageZu(true)">Nicht mehr fragen</button>' +
        "</div></div>";
    } else {
      const kopf = st === "halb"
        ? "&#128276; Fast geschafft - ein Klick fehlt"
        : "&#128276; Sollen wir dich anklopfen?";
      const einleitung = st === "halb"
        ? "Dieser Browser darf dir schon Meldungen zeigen, aber dein Geraet steht noch nicht in deinem Konto. " +
          "Deshalb kommt bei dir gerade nichts an. Ein Klick repariert das."
        : "Schalte es ein, dann meldet sich dein Geraet von selbst - auch wenn die Kombi-Tafel gerade zu ist.";
      kasten.innerHTML =
        '<div class="wk-frage-karte">' +
        '<div class="wk-frage-kopf">' + kopf + "</div>" +
        '<p class="wk-frage-text">' + einleitung + "</p>" +
        '<ul class="wk-frage-punkte">' +
        "<li>&#128222; <b>Anrufe</b>: dein Geraet klingelt und ruettelt, wie beim Telefon.</li>" +
        "<li>&#128172; <b>Neue Nachrichten</b>: eine kurze Meldung, wer geschrieben hat.</li>" +
        "<li>&#128274; <b>Ohne Inhalt</b>: in der Meldung steht NIE, was drinsteht - nur wer.</li>" +
        "</ul>" +
        '<div class="wk-frage-tasten">' +
        '<button class="wk-ja" onclick="weckerFrageJa()">Ja, einschalten</button>' +
        '<button class="wk-spaeter" onclick="weckerFrageZu(true)">Spaeter</button>' +
        "</div>" +
        '<p class="wk-frage-fuss">Du kannst es jederzeit oben am Glocken-Knopf wieder abschalten.</p>' +
        "</div>";
    }
    document.body.appendChild(kasten);
  } catch (e) { /* die Frage darf nie die Seite kippen */ }
}

async function weckerFrageJa() {
  const karte = document.querySelector("#weckerfrage .wk-frage-karte");
  if (karte) karte.classList.add("wk-laeuft");
  const r = await pushEinschalten(false);
  weckerFrageZu(false);
  if (r.fehler) { weckerBalken("Nicht eingeschaltet: " + r.fehler, "warn"); weckerKnopfMalen(); return; }
  if (r.nurLokal) {
    weckerBalken("Meldungen an, solange die App offen ist. Echtes Anklopfen bei geschlossener App kann dieser Browser nicht.", "gut");
  } else {
    weckerBalken("Benachrichtigungen sind an. Am besten auf JEDEM Geraet einmal einschalten (Laptop und Handy).", "gut");
  }
  weckerKnopfMalen();
  if (typeof benachKnopf === "function") benachKnopf();
}

// ---------- Der Glocken-Knopf oben (auf JEDER Seite) ----------

function weckerNavKnopf() {
  try {
    if (document.getElementById("wecker_knopf")) return;
    const nav = document.querySelector(".navleiste");
    if (!nav) return;
    const k = document.createElement("a");
    k.id = "wecker_knopf";
    k.href = "#";
    k.className = "navknopf glocke weckerknopf";
    k.title = "Benachrichtigungen: einschalten, pruefen, Geraete verwalten";
    k.innerHTML = "&#128276;";
    k.onclick = ev => { ev.preventDefault(); weckerPanelUmschalten(); };
    nav.appendChild(k);
    weckerKnopfMalen();
  } catch (e) { }
}

async function weckerKnopfMalen() {
  const k = document.getElementById("wecker_knopf");
  if (!k) return;
  const st = await pushStatus();
  k.classList.remove("wk-k-an", "wk-k-aus", "wk-k-halb");
  if (st === "an") { k.classList.add("wk-k-an"); k.title = "Benachrichtigungen sind an"; }
  else if (st === "halb" || st === "unklar") { k.classList.add("wk-k-halb"); k.title = pushStatusText(st); }
  else { k.classList.add("wk-k-aus"); k.title = pushStatusText(st); }
}

function weckerPanelZu() {
  const p = document.getElementById("weckerpanel");
  if (p) p.remove();
}

function weckerPanelUmschalten() {
  if (document.getElementById("weckerpanel")) { weckerPanelZu(); return; }
  const p = document.createElement("div");
  p.id = "weckerpanel";
  p.innerHTML = '<div class="gp-kopf">&#128276; Benachrichtigungen ' +
    '<button class="gp-zu" onclick="weckerPanelZu()">schliessen</button></div>' +
    '<div id="wk-inhalt"><p class="mini">Laedt...</p></div>';
  document.body.appendChild(p);
  weckerPanelZeichnen();
}

async function weckerPanelZeichnen() {
  const ziel = document.getElementById("wk-inhalt");
  if (!ziel) return;
  const st = await pushStatus();
  const schild = st === "an" ? "&#9989; An"
    : st === "halb" ? "&#9888;&#65039; Halb an"
    : st === "unklar" ? "&#10067; Nicht sicher"
    : st === "gesperrt" ? "&#128683; Gesperrt"
    : st === "ios-install" ? "&#128241; Erst als App ablegen"
    : st === "anmelden" ? "&#128100; Erst anmelden"
    : st === "geht nicht" ? "&#128683; Geht hier nicht"
    : "&#9898; Aus";
  let html = '<div class="wk-zeile"><b>&#128269; Was ist hier los?</b><br>' +
    '<button class="haupt" onclick="weckerDiagnoseZeigen()">Dieses Gerät jetzt prüfen</button>' +
    '<p class="mini">Geht etwas nicht, sagt dir das Gerät hier selbst, woran es liegt - ' +
    "Punkt für Punkt, mit dem nächsten Schritt dazu.</p>" +
    '<div id="wk-diagnose"></div></div>';

  html += '<div class="wk-zeile wk-st-' + st.replace(/[^a-z]/g, "-") + '"><b>' +
    schild + "</b> " + pushStatusText(st) + "</div>";

  if (st === "ios-install") {
    html += '<div class="wk-zeile"><b>So geht es auf dem iPhone:</b><ol class="wk-frage-schritte">' +
      "<li>Unten in Safari das Teilen-Zeichen antippen.</li>" +
      '<li>"Zum Home-Bildschirm" waehlen.</li>' +
      "<li>Die Kombi-Tafel von dort starten.</li>" +
      "<li>Dann hier einschalten.</li></ol></div>";
  } else if (st === "an") {
    html += '<div class="wk-zeile"><button onclick="weckerAus()">Auf diesem Geraet abschalten</button></div>';
  } else if (st === "gesperrt") {
    html += '<div class="wk-zeile"><b>So machst du es wieder auf:</b><ol class="wk-frage-schritte">' +
      "<li>Links neben der Adresse auf das Schloss-Zeichen tippen.</li>" +
      "<li>Benachrichtigungen suchen und auf Erlauben stellen.</li>" +
      "<li>Seite neu laden und hier einschalten.</li></ol></div>";
  } else if (st !== "geht nicht") {
    html += '<div class="wk-zeile"><button class="haupt wk-ja" onclick="weckerFrageJa()">' +
      "&#128276; Auf diesem Geraet einschalten</button></div>";
  }

  // ---- Was soll ankommen? Zwei getrennte Schalter ----
  // Die Meldung geht immer hinaus; der Service Worker entscheidet beim
  // Ankommen, ob er sie zeigt. So wirkt der Schalter sofort und auf
  // diesem Geraet, ohne dass der Server etwas davon wissen muss.
  if (st === "an" || st === "halb") {
    const w = weckerWunschLesen();
    html += '<div class="wk-zeile"><b>Was soll auf diesem Gerät ankommen?</b>' +
      '<label class="wk-schalter"><input type="checkbox"' + (w.nachrichten ? " checked" : "") +
      ' onchange="weckerWunschSetzen(\'nachrichten\', this.checked)"> ' +
      "&#128172; <b>Nachrichten</b> - wenn dir jemand schreibt</label>" +
      '<label class="wk-schalter"><input type="checkbox"' + (w.anrufe ? " checked" : "") +
      ' onchange="weckerWunschSetzen(\'anrufe\', this.checked)"> ' +
      "&#128222; <b>Anrufe</b> - klingelt, bleibt stehen, mit Annehmen und Ablehnen</label>" +
      '<p class="mini">Beides getrennt schaltbar. Schaltest du Anrufe aus, klingelt es hier nicht ' +
      "mehr - auf deinen anderen Geräten schon.</p></div>";
  }

  html += '<div class="wk-zeile"><b>Geht es wirklich?</b><br>' +
    '<button onclick="weckerProbeHier()">&#128276; Probemeldung auf diesem Gerät</button>' +
    '<p class="mini">Zeigt sofort eine Meldung. Damit siehst du: die Erlaubnis steht, und dieses ' +
    "Gerät kann Meldungen anzeigen. Ob sie auch von außen ankommen, siehst du daran, dass dieses " +
    "Gerät unten in der Liste steht - und spätestens, wenn dir jemand schreibt oder anruft.</p>" +
    '<div id="wk-probe" class="mini"></div></div>';

  html += '<div class="wk-zeile"><b>Deine angemeldeten Geraete</b><div id="wk-geraete" class="mini">Laedt...</div></div>';

  html += '<div class="wk-zeile mini"><b>Was steht in so einer Meldung?</b><br>' +
    "Nur wer dich anklopft und ob es ein Anruf oder eine Nachricht ist. Der Text selbst " +
    "bleibt Ende-zu-Ende verschluesselt und verlaesst dein Geraet nie im Klartext.</div>";

  ziel.innerHTML = html;
  weckerGeraeteZeichnen();
}

async function weckerGeraeteZeichnen() {
  const ziel = document.getElementById("wk-geraete");
  if (!ziel) return;
  try {
    const u = await supaNutzer();
    if (!u) { ziel.textContent = "Dafuer musst du angemeldet sein."; return; }
    const r = await supa.from("kt_push_abos").select("*").eq("nutzer", u.id);
    if (r.error) { ziel.textContent = "Liste nicht ladbar: " + pushFehlerKlartext(r.error.message); return; }
    const liste = r.data || [];
    if (!liste.length) {
      ziel.innerHTML = "<b>Kein einziges Geraet angemeldet.</b> Solange das so ist, bekommst du " +
        "NICHTS aufs Geraet, wenn die App zu ist.";
      return;
    }
    const reg = await wkRegistrierung();
    const abo = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    const hier = abo ? abo.endpoint : null;
    ziel.innerHTML = "";
    for (const g of liste) {
      const z = document.createElement("div");
      z.className = "wk-geraet" + (g.endpoint === hier ? " wk-dieses" : "");
      const name = document.createElement("span");
      const wann = g.zuletzt_gesehen || g.created_at || null;
      name.textContent = pushGeraetLesbar(g.geraet) +
        (g.endpoint === hier ? "  (dieses Geraet)" : "") +
        (wann ? "  seit " + new Date(wann).toLocaleDateString("de-AT") : "");
      const weg = document.createElement("button");
      weg.textContent = "rauswerfen";
      weg.onclick = () => weckerGeraetWeg(g.id);
      z.appendChild(name);
      z.appendChild(weg);
      ziel.appendChild(z);
    }
  } catch (e) { ziel.textContent = "Liste nicht ladbar."; }
}

// Aeltere Zeilen tragen noch die lange Browser-Kennung als Geraetenamen
// (Karams Eintrag vom 27.08. zum Beispiel). Beim ANZEIGEN uebersetzen,
// damit auch die alten Zeilen lesbar sind und nicht nur neue.
function pushGeraetLesbar(roh) {
  const t = String(roh || "").trim();
  if (!t) return "Unbekanntes Geraet";
  // Schon ein kurzer, selbst gesetzter Name? Dann so lassen.
  if (t.length < 40 && !/Mozilla|AppleWebKit|Gecko/i.test(t)) return t;
  const geraet = /iPhone/i.test(t) ? "iPhone"
    : /iPad/i.test(t) ? "iPad"
    : /Android/i.test(t) ? "Android-Handy"
    : /Macintosh|Mac OS/i.test(t) ? "Mac"
    : /Windows/i.test(t) ? "Windows-Laptop"
    : /Linux/i.test(t) ? "Linux-Rechner" : "Geraet";
  const browser = /Edg\//i.test(t) ? "Edge"
    : /OPR\/|Opera/i.test(t) ? "Opera"
    : /Firefox/i.test(t) ? "Firefox"
    : /Chrome|CriOS/i.test(t) ? "Chrome"
    : /Safari/i.test(t) ? "Safari" : null;
  return geraet + (browser ? " (" + browser + ")" : "");
}

async function weckerGeraetWeg(id) {
  const r = await supa.from("kt_push_abos").delete().eq("id", id).select("id");
  if (r.error) { weckerBalken("Nicht entfernt: " + pushFehlerKlartext(r.error.message), "warn"); return; }
  if (!r.data || !r.data.length) { weckerBalken("Nicht entfernt (keine Berechtigung).", "warn"); return; }
  weckerBalken("Geraet entfernt. Dorthin geht jetzt nichts mehr.", "gut");
  weckerGeraeteZeichnen();
  weckerKnopfMalen();
}

async function weckerAus() {
  const r = await pushAusschalten();
  if (r.fehler) { weckerBalken("Nicht abgeschaltet: " + r.fehler, "warn"); return; }
  weckerBalken("Auf diesem Geraet ist jetzt Ruhe.", "gut");
  weckerPanelZeichnen();
  weckerKnopfMalen();
  if (typeof benachKnopf === "function") benachKnopf();
}

// ---------- Selbsttest ----------

async function weckerProbeHier() {
  const ziel = document.getElementById("wk-probe");
  const sag = t => { if (ziel) ziel.textContent = t; else weckerBalken(t, "gut"); };
  if (!("Notification" in window)) { sag("Dieser Browser kann keine Meldungen."); return; }
  if (Notification.permission !== "granted") { sag("Erst einschalten - der Browser erlaubt es noch nicht."); return; }
  const reg = await wkRegistrierung(8000);
  if (!reg) { sag("Der Service Worker ist noch nicht bereit. Seite einmal neu laden."); return; }
  try {
    await reg.showNotification("Probe: so sieht es aus", {
      body: "Wenn du das siehst, kann dein Geraet Meldungen anzeigen.",
      icon: "logo-192.png", badge: "logo-192.png", tag: "kt-probe", renotify: true,
      vibrate: [200, 100, 200], data: { url: "mein.html", art: "probe" }
    });
    sag("Meldung geschickt. Siehst du sie? Auf dem Handy kommt sie oben herein, am Laptop rechts unten.");
  } catch (e) { sag("Ging nicht: " + String(e.message || e).slice(0, 100)); }
}

// weckerProbeServer ist entfallen: der Server weist eine Meldung an
// einen selbst ab, die Probe konnte also gar nie etwas beweisen.
// Der echte Beweis ist, dass dieses Geraet in der Liste unten steht.

// ---------- Anmeldungen, die leise sterben, wieder einfangen ----------

// Kleine Schublade (IndexedDB), die der Service Worker beschreibt, wenn
// der Browser die Anmeldung dieses Geraets erneuert hat. NICHT der
// Seiten-Cache - der bleibt aus, das ist Karams Regel.
function weckerSchubladeOeffnen() {
  return new Promise((fertig, schiefgegangen) => {
    if (!window.indexedDB) { schiefgegangen(new Error("kein IndexedDB")); return; }
    const a = indexedDB.open("kt-wecker", 1);
    a.onupgradeneeded = () => {
      if (!a.result.objectStoreNames.contains("merker")) a.result.createObjectStore("merker");
    };
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => schiefgegangen(a.error);
  });
}

async function weckerSchubladeNehmen() {
  try {
    const db = await weckerSchubladeOeffnen();
    const wert = await new Promise((fertig, schief) => {
      const t = db.transaction("merker", "readonly");
      const a = t.objectStore("merker").get("offenes_abo");
      a.onsuccess = () => fertig(a.result || null);
      a.onerror = () => schief(a.error);
    });
    if (!wert) return null;
    await new Promise(fertig => {
      const t = db.transaction("merker", "readwrite");
      t.objectStore("merker").delete("offenes_abo");
      t.oncomplete = () => fertig(true);
      t.onerror = () => fertig(false);
    });
    return wert;
  } catch (e) { return null; }
}

// Traegt dieses Geraet still nach: nach dem Anmelden, nach einem
// Browser-Update, nach jeder Erneuerung. Fragt NIE nach - wenn die
// Erlaubnis fehlt, passiert einfach nichts.
async function pushStillNachtragen() {
  try {
    if (!window.supa) return;
    const u = await supaNutzer();
    if (!u) return;
    const zettel = await weckerSchubladeNehmen();
    if (zettel && zettel.endpoint) {
      const e = await pushAboEintragen(zettel, u, zettel.alt || null);
      if (e.fehler) weckerBalken("Deine Benachrichtigungen mussten erneuert werden, das ging aber nicht: " +
        e.fehler, "warn", "nachtrag", 60);
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const st = await pushStatus();
    if (st === "halb" || st === "aus") await pushEinschalten(true);
  } catch (e) { }
}

// ---------- Botschaften vom Service Worker ----------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", ev => {
    const d = (ev && ev.data) || {};
    if (d.kt === "abo-erneuert" && d.zettel) {
      supaNutzer().then(u => { if (u) pushAboEintragen(d.zettel, u, d.zettel.alt || null); }).catch(() => {});
    } else if (typeof anrufVomServiceWorker === "function") {
      anrufVomServiceWorker(d);
    }
  });
}

// ---------- Start ----------

document.addEventListener("DOMContentLoaded", () => {
  weckerNavKnopf();
  // Kurz warten, damit die Sitzung sicher geladen ist.
  setTimeout(() => {
    pushStillNachtragen()
      .then(() => weckerKnopfMalen())
      .then(() => weckerFrageZeigen(false))
      .catch(() => {});
  }, 1500);
});

if (window.supa && supa.auth && typeof supa.auth.onAuthStateChange === "function") {
  // Nicht direkt im Rueckruf mit der Datenbank reden (das kann sich
  // gegenseitig blockieren) - deshalb ueber setTimeout.
  supa.auth.onAuthStateChange(ereignis => {
    if (ereignis === "SIGNED_IN") {
      setTimeout(() => {
        pushStillNachtragen()
          .then(() => weckerKnopfMalen())
          .then(() => weckerFrageZeigen(false))
          .catch(() => {});
      }, 900);
    } else if (ereignis === "SIGNED_OUT") {
      weckerFrageZu(false);
      weckerPanelZu();
      weckerKnopfMalen();
    }
  });
}

// ============================================================
// UPDATE-KNOPF: taucht NUR auf, wenn eine neuere Fassung da ist.
// Erkennung ohne Zusatzdatei: die Startseite wird frisch geholt und
// die dort eingetragene Fassung mit der eigenen verglichen.
// ============================================================

let _updateFassung = null;

async function pruefeUpdate() {
  try {
    if (!APP_FASSUNG) return;
    const html = await fetch("index.html?frisch=" + Date.now(), { cache: "no-store" }).then(r => r.text());
    const m = html.match(/logik\.js\?v=([A-Za-z0-9._-]+)/) || html.match(/stil\.css\?v=([A-Za-z0-9._-]+)/);
    if (!m) return;
    if (m[1] !== APP_FASSUNG && m[1] !== _updateFassung) {
      _updateFassung = m[1];
      zeigeUpdateKnopf();
    }
  } catch (e) { /* Update-Pruefung stoert nie die Seite */ }
}

function zeigeUpdateKnopf() {
  if (document.getElementById("app_update_knopf")) return;
  const nav = document.querySelector(".navleiste");
  if (!nav) return;
  const k = document.createElement("a");
  k.id = "app_update_knopf";
  k.href = "#";
  k.className = "navknopf updateknopf";
  k.innerHTML = "&#128260; Update da - jetzt laden";
  k.title = "Es gibt eine neuere Fassung der App. Ein Klick holt sie sofort.";
  k.onclick = ev => { ev.preventDefault(); appAktualisieren(); };
  nav.appendChild(k);
}

async function appAktualisieren() {
  const k = document.getElementById("app_update_knopf");
  if (k) k.innerHTML = "&#8987; wird geladen...";
  try {
    if ("caches" in window) {
      const namen = await caches.keys();
      await Promise.all(namen.map(n => caches.delete(n)));
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch (e) { /* weiter, das Neuladen holt es ohnehin */ }
  // Mit frischem Anhaengsel neu laden, damit kein alter Zwischenspeicher greift
  const pfad = location.pathname.split("/").pop() || "index.html";
  location.replace(pfad + "?frisch=" + Date.now());
}

document.addEventListener("DOMContentLoaded", () => {
  pruefeUpdate();
  setInterval(pruefeUpdate, 10 * 60 * 1000);          // alle 10 Minuten
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) pruefeUpdate(); });

// ============================================================
// WAS SOLL ANKOMMEN? Nachrichten und Anrufe getrennt schaltbar.
//
// Der Wunsch steht im Browser (localStorage) UND in einer kleinen
// Schublade (IndexedDB), weil der Service Worker den localStorage
// nicht lesen kann. Er entscheidet beim Ankommen einer Meldung, ob
// er sie zeigt. Vorteil: der Schalter wirkt sofort, ohne dass der
// Server etwas davon wissen muss.
// ============================================================

const WK_WUNSCH_SCHLUESSEL = "kt_meldewunsch";

function weckerWunschLesen() {
  try {
    const w = JSON.parse(localStorage.getItem(WK_WUNSCH_SCHLUESSEL) || "{}");
    return { nachrichten: w.nachrichten !== false, anrufe: w.anrufe !== false };
  } catch (e) { return { nachrichten: true, anrufe: true }; }
}

async function weckerWunschSetzen(was, an) {
  const w = weckerWunschLesen();
  w[was] = !!an;
  try { localStorage.setItem(WK_WUNSCH_SCHLUESSEL, JSON.stringify(w)); } catch (e) { }
  await weckerWunschInSchublade(w);
  weckerBalken(was === "anrufe"
    ? (an ? "Anrufe kommen auf diesem Gerät wieder an." : "Anrufe kommen auf diesem Gerät nicht mehr an.")
    : (an ? "Nachrichten kommen auf diesem Gerät wieder an." : "Nachrichten kommen auf diesem Gerät nicht mehr an."),
    "gut");
}

// Die Schublade, aus der auch der Service Worker lesen kann. Bewusst
// DIESELBE wie fuer den Abo-Zettel (kt-wecker/merker), damit es nur eine
// Stelle gibt.
function weckerWunschInSchublade(w) {
  return new Promise(fertig => {
    try {
      const anfrage = indexedDB.open("kt-wecker", 1);
      anfrage.onupgradeneeded = () => {
        const db = anfrage.result;
        if (!db.objectStoreNames.contains("merker")) db.createObjectStore("merker");
      };
      anfrage.onsuccess = () => {
        const db = anfrage.result;
        try {
          const t = db.transaction("merker", "readwrite");
          t.objectStore("merker").put(w, "meldewunsch");
          t.oncomplete = () => { db.close(); fertig(true); };
          t.onerror = () => { db.close(); fertig(false); };
        } catch (x) { fertig(false); }
      };
      anfrage.onerror = () => fertig(false);
    } catch (x) { fertig(false); }
  });
}

// Beim Laden einmal abgleichen, damit die Schublade nie veraltet ist.
document.addEventListener("DOMContentLoaded", () => {
  try { weckerWunschInSchublade(weckerWunschLesen()); } catch (e) { }
});

// ============================================================
// WAS IST HIER LOS? Die Selbst-Diagnose.
//
// Karam sitzt mit seinem iPhone da und ich kann nicht hineinsehen.
// Also sagt das Geraet selbst, woran es haengt - Punkt fuer Punkt,
// in Klartext, mit dem naechsten Schritt dazu. Kein Fachwort.
// ============================================================

function wkPruefpunkt(gut, titel, wennGut, wennSchlecht) {
  return { gut: !!gut, titel: titel, text: gut ? wennGut : wennSchlecht };
}

async function weckerDiagnose() {
  const punkte = [];
  const istApple = pushIstIos();
  const alsApp = weckerIstStandalone();

  // 1. Laeuft das ueberhaupt als App?
  if (istApple) {
    punkte.push(wkPruefpunkt(alsApp, "Läuft als App",
      "Ja. Du hast die Kombi-Tafel vom Home-Bildschirm gestartet - so muss es sein.",
      "NEIN, das ist der Haken. Du bist gerade im normalen Safari. Apple erlaubt " +
      "Mitteilungen nur, wenn die App vom Home-Bildschirm läuft. WICHTIG: hast du " +
      "sie schon einmal abgelegt, BEVOR das repariert war, dann ist das alte Symbol " +
      "kaputt - erst löschen, Seite in Safari neu laden, dann Teilen und " +
      "\"Zum Home-Bildschirm\", und von dort starten."));
  } else {
    punkte.push(wkPruefpunkt(true, "Gerät",
      alsApp ? "Läuft als installierte App." : "Läuft im Browser. Am Rechner ist das völlig in Ordnung.", ""));
  }

  // 2. Kann der Browser Mitteilungen?
  const kann = ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);
  punkte.push(wkPruefpunkt(kann, "Kann dieses Gerät Mitteilungen?",
    "Ja, alles da.",
    istApple && !alsApp
      ? "Noch nicht - das kommt erst, wenn die App vom Home-Bildschirm läuft (siehe oben)."
      : "Dieser Browser kann keine Mitteilungen. Auf dem iPhone braucht es Safari und " +
        "mindestens iOS 16.4."));

  // 3. Erlaubnis
  const erl = ("Notification" in window) ? Notification.permission : "geht nicht";
  punkte.push(wkPruefpunkt(erl === "granted", "Deine Erlaubnis",
    "Erteilt.",
    erl === "denied"
      ? (istApple
          ? "GESPERRT. Wieder aufmachen: Einstellungen (graues Zahnrad) öffnen, ganz nach " +
            "unten zur Kombi-Tafel, antippen, Mitteilungen erlauben."
          : "GESPERRT. Links neben der Adresse auf das Schloss tippen und Benachrichtigungen erlauben.")
      : "Noch nicht gefragt. Unten auf Einschalten drücken."));

  // 4. Der Service Worker (der Teil, der Meldungen annimmt, wenn die App zu ist)
  let swDa = false, swAdresse = "";
  try {
    const reg = await wkRegistrierung(4000);
    swDa = !!(reg && reg.active);
    swAdresse = swDa ? reg.active.scriptURL.split("/").pop() : "";
  } catch (e) { }
  punkte.push(wkPruefpunkt(swDa, "Der Empfänger auf diesem Gerät",
    "Läuft (" + swAdresse + "). Er nimmt Meldungen an, auch wenn die App zu ist.",
    "Läuft NICHT. Meist hilft: Seite einmal ganz schließen und neu öffnen. " +
    "Im privaten Modus geht es grundsätzlich nicht."));

  // 5. Anmeldung
  let u = null;
  try { u = await supaNutzer(); } catch (e) { }
  punkte.push(wkPruefpunkt(!!u, "Angemeldet",
    "Ja, als " + (u ? (u.email || "dein Konto") : ""),
    istApple && alsApp
      ? "NEIN. Das iPhone hält die App vom Home-Bildschirm getrennt von Safari - deine " +
        "Anmeldung aus Safari gilt hier nicht. Melde dich HIER einmal an, dann bleibt es."
      : "NEIN. Zuerst anmelden."));

  // 6. Steht dieses Geraet in der Datenbank?
  let inDb = false, geraeteZahl = 0;
  if (u && window.supa) {
    try {
      const reg = await wkRegistrierung(3000);
      const abo = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      const r = await supa.from("kt_push_abos").select("id, endpoint").eq("nutzer", u.id);
      geraeteZahl = (r.data || []).length;
      inDb = !!(abo && (r.data || []).some(x => x.endpoint === abo.endpoint));
    } catch (e) { }
  }
  punkte.push(wkPruefpunkt(inDb, "Dieses Gerät ist eingetragen",
    "Ja. Der Server weiß, wohin er dir schreiben soll.",
    geraeteZahl
      ? "Dieses Gerät NICHT (es sind " + geraeteZahl + " andere eingetragen). Unten auf Einschalten drücken."
      : "Noch kein einziges Gerät eingetragen. Solange das so ist, kommt bei geschlossener App nichts an."));

  return punkte;
}

async function weckerDiagnoseZeigen() {
  const ziel = document.getElementById("wk-diagnose");
  if (!ziel) return;
  ziel.innerHTML = '<p class="mini">Sehe nach...</p>';
  let punkte = [];
  try { punkte = await weckerDiagnose(); }
  catch (e) { ziel.innerHTML = '<p class="mini">Prüfung nicht möglich.</p>'; return; }
  const schlecht = punkte.filter(p => !p.gut).length;
  const kasten = document.createElement("div");
  const kopf = document.createElement("div");
  kopf.className = schlecht ? "warnkern" : "kern";
  kopf.innerHTML = schlecht
    ? "<b>" + schlecht + " Sache" + (schlecht === 1 ? "" : "n") + " " +
      (schlecht === 1 ? "fehlt" : "fehlen") + " noch.</b> Der erste rote Punkt unten ist der wichtigste."
    : "<b>&#9989; Auf diesem Gerät ist alles in Ordnung.</b> Meldungen kommen an, auch wenn die App zu ist.";
  kasten.appendChild(kopf);
  for (const p of punkte) {
    if (!p.text) continue;
    const z = document.createElement("div");
    z.className = "wk-diag " + (p.gut ? "wk-diag-gut" : "wk-diag-schlecht");
    const t = document.createElement("b");
    // Der Text kommt aus dem Programm, aber wir setzen ihn trotzdem als
    // TEXT ein - dann kann auch spaeter nie etwas Fremdes hineinrutschen.
    t.textContent = (p.gut ? "✅ " : "⚠️ ") + p.titel;
    const s = document.createElement("div");
    s.className = "mini";
    s.textContent = p.text;
    z.appendChild(t); z.appendChild(s);
    kasten.appendChild(z);
  }
  ziel.innerHTML = "";
  ziel.appendChild(kasten);
}

// ============================================================
// SERVICE WORKER der Kombi-Tafel ("Der Wecker").
// Er macht die Seite zur installierbaren App und zeigt
// Push-Benachrichtigungen an, wenn die App geschlossen ist.
//
// GANZ WICHTIG: er speichert BEWUSST NICHTS zwischen (kein
// Cache) - Updates muessen sofort bei allen ankommen, das ist
// Karams harte Regel. Der leere fetch-Handler laesst alles
// normal uebers Netz laufen.
//
// NEU seit der Wecker-Schicht:
//  1. Ein Anruf bleibt stehen (requireInteraction), vibriert und
//     hat die Knoepfe Annehmen und Ablehnen direkt in der Meldung.
//  2. Wird der Klick auf die Meldung ausgewertet: das richtige
//     Fenster kommt nach vorne, ein neues wird an der richtigen
//     Adresse geoeffnet, und die offene App erfaehrt, was gedrueckt
//     wurde (annehmen oder ablehnen).
//  3. pushsubscriptionchange: erneuert der Browser die Anmeldung
//     dieses Geraets, meldet der Service Worker das sofort an jedes
//     offene Fenster UND legt es zusaetzlich in eine kleine
//     Schublade (IndexedDB), damit die Seite es beim naechsten
//     Start nachtragen kann. Vorher sind Anmeldungen leise
//     gestorben und niemand hat es gemerkt.
// ============================================================
"use strict";

// Oeffentlicher VAPID-Schluessel (derselbe wie in benachrichtigung.js).
// Er ist oeffentlich - der geheime Teil liegt nur auf dem Server.
const WK_PUSH_PUB = "BEOK4zMFAGnbRL1k4VNm_4wX388JIkHCQhBYdijrFk7NsBmbBRawKep6dA579tImu2H6qkU1k_ts6QhCKo-PfR8";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* absichtlich leer: kein Cache */ });

// ---------- kleine Schublade (IndexedDB), NICHT der Seiten-Cache ----------
// Hier liegt hoechstens EIN Zettel: "der Browser hat die Push-Anmeldung
// dieses Geraets erneuert, bitte in die Datenbank nachtragen". Die Seite
// leert die Schublade, sobald sie es getan hat.

function wkSchubladeOeffnen() {
  return new Promise((fertig, schiefgegangen) => {
    const a = indexedDB.open("kt-wecker", 1);
    a.onupgradeneeded = () => {
      if (!a.result.objectStoreNames.contains("merker")) a.result.createObjectStore("merker");
    };
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => schiefgegangen(a.error);
  });
}

function wkSchubladeLegen(zettel) {
  return wkSchubladeOeffnen().then(db => new Promise((fertig, schiefgegangen) => {
    const t = db.transaction("merker", "readwrite");
    t.objectStore("merker").put(zettel, "offenes_abo");
    t.oncomplete = () => fertig(true);
    t.onerror = () => schiefgegangen(t.error);
  }));
}

// Was will dieses Geraet ueberhaupt sehen? Die Seite legt den Wunsch in
// DIESELBE Schublade wie den Abo-Zettel (kt-wecker/merker) - eine zweite
// Datenbank waere nur eine weitere Stelle, die auseinanderlaufen kann.
// Steht dort nichts, kommt alles an.
function wkWunschLesen() {
  return wkSchubladeOeffnen().then(db => new Promise(fertig => {
    try {
      const t = db.transaction("merker", "readonly");
      const g = t.objectStore("merker").get("meldewunsch");
      g.onsuccess = () => {
        const w = g.result || {};
        fertig({ nachrichten: w.nachrichten !== false, anrufe: w.anrufe !== false });
      };
      g.onerror = () => fertig({ nachrichten: true, anrufe: true });
    } catch (x) { fertig({ nachrichten: true, anrufe: true }); }
  })).catch(() => ({ nachrichten: true, anrufe: true }));
}

// ---------- Push kommt herein ----------

async function wkPushZeigen(d) {
  const istAnruf = (d.art === "anruf") || String(d.tag || "").indexOf("anruf") === 0;
  // Karams Schalter: hat er Anrufe oder Nachrichten auf DIESEM Geraet
  // abgeschaltet, wird die Meldung hier gar nicht erst gezeigt. Die
  // uebrigen Geraete bekommen sie trotzdem.
  const wunsch = await wkWunschLesen();
  if (istAnruf && !wunsch.anrufe) return;
  if (!istAnruf && !wunsch.nachrichten) return;
  const einstellung = {
    body: d.text || "",
    icon: "logo-192.png",
    badge: "logo-192.png",
    tag: d.tag || (istAnruf ? "anruf" : "kombi-tafel"),
    renotify: true,
    data: { url: d.url || "mein.html", art: d.art || (istAnruf ? "anruf" : "nachricht"), von: d.von || null },
    // Ein Anruf muss man UEBERSEHEN koennen: er bleibt stehen, bis
    // jemand ihn wegklickt, und er ruettelt das Handy.
    requireInteraction: !!istAnruf,
    vibrate: istAnruf ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200]
  };
  if (istAnruf) {
    einstellung.actions = [
      { action: "annehmen", title: "Annehmen" },
      { action: "ablehnen", title: "Ablehnen" }
    ];
  }
  await self.registration.showNotification(d.titel || "Kombi-Tafel", einstellung);
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { }
  e.waitUntil(wkPushZeigen(d));
});

// ---------- Klick auf die Meldung ----------

function wkSichereAdresse(u) {
  // Nur eigene Adressen oeffnen. Kommt vom Server eine fremde Adresse
  // (oder eine aus einer alten Fassung), landen wir bei Mein Bereich.
  try {
    const a = new URL(u || "mein.html", self.registration.scope);
    if (a.origin === self.location.origin) return a.href;
  } catch (e) { }
  return new URL("mein.html", self.registration.scope).href;
}

// Alle offenen Fenster, die WIRKLICH zu dieser App gehoeren.
// Nach dem Scope, nicht nach der Adresse: siehe Begruendung unten.
async function wkEigeneFenster() {
  const liste = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return liste.filter(c => String(c.url || "").indexOf(self.registration.scope) === 0);
}

async function wkFensterAnsprechen(adresse, nachricht) {
  const ziel = wkSichereAdresse(adresse);
  const liste = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Nur Fenster DIESER App ansprechen. Wichtig: nach dem SCOPE filtern und
  // NICHT nach der Adresse allein. Auf harryclaude-hub.github.io liegen alle
  // Programme von Karam unter derselben Adresse (Orion, Finder, Appload und
  // so weiter). Nur nach Adresse gefiltert wuerde ein Klick auf "Annehmen"
  // womoeglich das Orion-Panel nach vorne holen statt der Kombi-Tafel.
  const eigene = liste.filter(c => String(c.url || "").indexOf(self.registration.scope) === 0);
  // Am liebsten ein sichtbares Fenster, sonst irgendeines von uns.
  const gewaehlt = eigene.find(c => c.visibilityState === "visible") || eigene[0];
  if (gewaehlt) {
    if (nachricht) { try { gewaehlt.postMessage(nachricht); } catch (e) { } }
    if ("focus" in gewaehlt) { try { await gewaehlt.focus(); } catch (e) { } }
    // Steht das Fenster auf einer anderen Seite, dorthin schicken (wenn erlaubt).
    if (gewaehlt.url !== ziel && "navigate" in gewaehlt) { try { await gewaehlt.navigate(ziel); } catch (e) { } }
    return;
  }
  await self.clients.openWindow(ziel);
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === "ablehnen") {
    // Nur wegdruecken. Ist die App offen, lehnt sie den Anruf richtig ab
    // (der Anrufer sieht dann "Anruf abgelehnt"); ist sie zu, bleibt es
    // beim stillen Wegdruecken - mehr kann der Service Worker nicht.
    e.waitUntil(wkEigeneFenster().then(liste => {
      for (const c of liste) { try { c.postMessage({ kt: "anruf-ablehnen", von: d.von || null }); } catch (x) { } }
    }));
    return;
  }
  e.waitUntil(wkFensterAnsprechen(d.url, {
    kt: e.action === "annehmen" ? "anruf-annehmen" : "meldung-geklickt",
    art: d.art || null, von: d.von || null
  }));
});

// ---------- Der Browser erneuert die Anmeldung dieses Geraets ----------

function wkB64zuBytes(s) {
  const roh = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const b = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
  return b;
}

async function wkAboErneuern(e) {
  try {
    const alt = (e && e.oldSubscription && e.oldSubscription.endpoint) || null;
    let neu = (e && e.newSubscription) || null;
    if (!neu) {
      neu = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: wkB64zuBytes(WK_PUSH_PUB)
      });
    }
    const j = neu.toJSON();
    const zettel = { alt: alt, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, zeit: Date.now() };
    // 1. Offene Fenster tragen es sofort in die Datenbank ein. NUR eigene
    //    Fenster: der Zettel enthaelt die Schluessel dieses Geraets, die
    //    haben in Karams anderen Programmen auf derselben Adresse nichts
    //    verloren.
    const liste = await wkEigeneFenster();
    for (const c of liste) { try { c.postMessage({ kt: "abo-erneuert", zettel: zettel }); } catch (x) { } }
    // 2. Und in die Schublade, falls gerade kein Fenster offen ist.
    await wkSchubladeLegen(zettel);
  } catch (x) { /* nie den Service Worker abstuerzen lassen */ }
}

self.addEventListener("pushsubscriptionchange", e => e.waitUntil(wkAboErneuern(e)));

// Die Seite kann den Service Worker auch von sich aus fragen.
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.kt === "abo-pruefen") e.waitUntil(wkAboErneuern(null));
});

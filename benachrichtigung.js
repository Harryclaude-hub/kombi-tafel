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

async function benachrichtige(titel, text, tag) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden && tag !== "anruf") return;   // sichtbar: nur Anrufe melden
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      reg.showNotification(titel, { body: text || "", icon: "logo-192.png",
        tag: tag || "kombi-tafel", data: { url: "./mein.html" } });
    } else {
      new Notification(titel, { body: text || "", icon: "logo-192.png" });
    }
  } catch (e) { /* Benachrichtigungen stoeren nie die Seite */ }
}

// ---------- Push-Abo dieses Geraets ----------

function pushB64zuBytes(s) {
  const roh = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const b = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
  return b;
}

async function pushEinschalten() {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator))
      return { fehler: "Dieser Browser kann keine Benachrichtigungen." };
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== "granted")
      return { fehler: "Benachrichtigungen wurden nicht erlaubt - das geht in den Browser-Einstellungen der Seite." };
    const reg = await navigator.serviceWorker.ready;
    if (!("pushManager" in reg))
      return { ok: true, nurLokal: true };
    const abo = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pushB64zuBytes(PUSH_PUB)
    });
    const j = abo.toJSON();
    const u = await supaNutzer();
    if (!u) return { fehler: "Zuerst anmelden." };
    const r = await supa.from("kt_push_abos").upsert({
      nutzer: u.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      geraet: navigator.userAgent.slice(0, 80)
    }, { onConflict: "endpoint" });
    if (r.error) return { fehler: r.error.message };
    return { ok: true };
  } catch (e) {
    return { fehler: String(e.message || e).slice(0, 120) };
  }
}

async function pushStatus() {
  try {
    if (!("Notification" in window)) return "geht nicht";
    if (Notification.permission !== "granted") return "aus";
    const reg = await navigator.serviceWorker.getRegistration();
    const abo = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    return abo ? "an" : "halb";
  } catch (e) { return "aus"; }
}

// ---------- Push an einen Empfaenger schicken (Feuer und vergessen) ----------

async function pushSenden(anId, art) {
  try {
    const s = await supaSitzung();
    if (!s) return;
    fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.access_token,
        "apikey": SUPA_KEY
      },
      body: JSON.stringify({ an: anId, art: art || "dm" })
    }).catch(() => {});
  } catch (e) { /* nie die Seite stoeren */ }
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

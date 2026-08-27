// ============================================================
// SERVICE WORKER der Kombi-Tafel.
// Er macht die Seite zur installierbaren App und zeigt
// Push-Benachrichtigungen an, wenn die App geschlossen ist.
//
// GANZ WICHTIG: er speichert BEWUSST NICHTS zwischen (kein
// Cache) - Updates muessen sofort bei allen ankommen, das ist
// Karams harte Regel. Der leere fetch-Handler laesst alles
// normal uebers Netz laufen.
// ============================================================
"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* absichtlich leer: kein Cache */ });

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.titel || "Kombi-Tafel", {
    body: d.text || "",
    icon: "logo-192.png",
    badge: "logo-192.png",
    tag: d.tag || "kombi-tafel",
    renotify: d.tag === "anruf",
    data: { url: d.url || "./index.html" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(liste => {
    for (const c of liste) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || "./index.html");
  }));
});

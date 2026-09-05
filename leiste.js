// ============================================================
// FUSSLEISTEN-SCHICHT 05.09.2026 ("wie WhatsApp/Instagram unten").
//
// Reine Design-Zutat nach Karams Trennregel: Datei loeschen (plus
// die script-Zeilen in den HTML-Seiten), und alles laeuft wie
// vorher - kein Rechenweg, keine Daten, keine bestehende Funktion
// wird angefasst oder ueberschrieben. Die Leiste RUFT nur, was es
// schon gibt: Seiten-Links und mbAnsichtOeffnen/mbAnsichtZu.
//
// Was sie tut, NUR am Handy (bis 700 Pixel, CSS blendet sie am
// Rechner aus):
//  - unten eine feste Leiste mit FUENF grossen Knoepfen, weit
//    auseinander (Karam: "dass man sich nicht vertippen kann"):
//    Chat | Tafel | Kombi-Bau | Bereich | Profil
//  - auf mein.html oeffnen Chat/Profil die vorhandenen Ansichten,
//    "Bereich" schliesst sie (mbAnsichtZu) und zeigt die Bloecke
//  - von anderen Seiten aus geht es per mein.html#chat / #profil
//    hinueber; diese Datei liest den Anker und oeffnet die Ansicht
//  - am Handy startet mein.html im CHAT (Karam 05.09.: "Chats ist
//    immer im Vordergrund" - bewusste Ausnahme von der Regel
//    "nie in einer Sonder-Ansicht starten", nur schmal, nur hier)
//  - der Ungelesen-Zaehler vom Chat-Knopf oben wird auf den
//    Chat-Knopf unten gespiegelt (nur abgelesen, nie gerechnet)
// ============================================================
"use strict";

(function () {

  function schmal() {
    try { return !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches); }
    catch (e) { return false; }
  }

  var seite = (document.body && document.body.dataset && document.body.dataset.seite) || "";
  var aufMein = /mein\.html$/.test(location.pathname) || seite === "mein";

  // ---- Leiste bauen (immer im DOM, CSS zeigt sie nur am Handy) ----
  function baue() {
    if (document.getElementById("fussleiste")) return;
    var l = document.createElement("nav");
    l.id = "fussleiste";
    // Chat in der MITTE (Karam 05.09. spaet), Bereich rechts davon,
    // Profil ganz rechts.
    var knoepfe = [
      { k: "tafel",   text: "Tafel",     zeichen: "📋" },
      { k: "bau",     text: "Kombi-Bau", zeichen: "🎯" },
      { k: "chat",    text: "Chat",      zeichen: "💬" },
      { k: "bereich", text: "Bereich",   zeichen: "📒" },
      { k: "profil",  text: "Profil",    zeichen: "👤" }
    ];
    for (var i = 0; i < knoepfe.length; i++) {
      var kn = knoepfe[i];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fl-knopf";
      b.dataset.fl = kn.k;
      b.innerHTML = '<span class="fl-zeichen">' + kn.zeichen +
        '<span class="badge" style="display:none"></span></span>' +
        '<span class="fl-text">' + kn.text + "</span>";
      b.addEventListener("click", klick);
      l.appendChild(b);
    }
    document.body.appendChild(l);
    document.body.classList.add("hat-fussleiste");
    markiere();
  }

  function klick(ev) {
    var was = ev.currentTarget.dataset.fl;
    // Ein anderer Bereich als der Chat: erst den offenen Chat zumachen,
    // sonst laege er weiter ueber der Seite.
    if (was !== "chat" && document.getElementById("glockenpanel") &&
        typeof window.glockeUmschalten === "function") window.glockeUmschalten();
    if (was === "tafel")   { geh("original.html"); return; }
    if (was === "bau")     { geh("kombis.html"); return; }
    if (was === "bereich") {
      if (aufMein && typeof window.mbAnsichtZu === "function") { window.mbAnsichtZu(); markiere("bereich"); }
      else location.href = "mein.html";
      return;
    }
    if (was === "chat") {
      // Karam 05.09.: der Chat-Knopf oeffnet den ALLGEMEINEN Chat
      // (Kontaktliste, wie WhatsApp) - nicht den Bereichs-Chat. Der
      // steht dort als erster Eintrag (chatmodus.js).
      if (typeof window.chatmodusAuf === "function") { window.chatmodusAuf(true); markiere("chat"); }
      else if (aufMein) { oeffneAnsicht("chat"); }
      else location.href = "mein.html#chat";
      return;
    }
    if (was === "profil") {
      if (aufMein) { oeffneAnsicht(was); }
      else location.href = "mein.html#" + was;
    }
  }

  function geh(ziel) {
    // Auf der Zielseite selbst nur nach oben rollen statt neu laden.
    if (location.pathname.indexOf(ziel) >= 0) { window.scrollTo(0, 0); return; }
    location.href = ziel;
  }

  // Ansicht auf mein.html oeffnen - aber erst, wenn die App sie gebaut
  // hat (nach dem Anmelden). Bis dahin alle 300 ms nachsehen, hoechstens
  // 15 Sekunden lang.
  function oeffneAnsicht(name, versuche) {
    if (typeof window.mbAnsichtOeffnen === "function" && document.getElementById("ans_" + name)) {
      window.mbAnsichtOeffnen(name);
      markiere(name);
      return;
    }
    versuche = versuche || 0;
    if (versuche < 50) setTimeout(function () { oeffneAnsicht(name, versuche + 1); }, 300);
  }

  // Welcher Knopf leuchtet: auf den festen Seiten die Seite selbst,
  // auf mein.html die gerade offene Ansicht (bzw. "Bereich").
  function markiere(erzwungen) {
    var l = document.getElementById("fussleiste");
    if (!l) return;
    var aktiv = erzwungen || "";
    if (!aktiv) {
      if (seite === "bau") aktiv = "bau";
      else if (seite === "original" || /original\.html$/.test(location.pathname)) aktiv = "tafel";
      else if (aufMein) aktiv = "bereich";
    }
    var alle = l.querySelectorAll(".fl-knopf");
    for (var i = 0; i < alle.length; i++)
      alle[i].classList.toggle("aktiv", alle[i].dataset.fl === aktiv);
  }

  // Ungelesen-Zaehler vom Kopf-Knopf (glocke.js schreibt ihn dort)
  // auf den Chat-Knopf unten spiegeln - nur ablesen, nie rechnen.
  function spiegleBadge() {
    var oben = document.querySelector("#nav_nachrichten .badge");
    var unten = document.querySelector('#fussleiste .fl-knopf[data-fl="chat"] .badge');
    if (!oben || !unten) return;
    var zieh = function () {
      unten.textContent = oben.textContent;
      unten.style.display = oben.style.display;
    };
    zieh();
    try { new MutationObserver(zieh).observe(oben, { childList: true, attributes: true, characterData: true, subtree: true }); }
    catch (e) { }
  }

  // ---- Lange Erklaerkaesten am Handy einklappen (Karam 05.09.:
  // "zu viel Text"). NICHTS wird entfernt: der Kasten zeigt zwei
  // Zeilen, ein Tipp klappt ihn ganz auf und wieder zu. Warnkaesten
  // (warnkern) bleiben immer offen - Warnungen kuerzt man nicht.
  function klappe(el) {
    if (el.dataset.knapp) return;
    if ((el.textContent || "").length < 160) return;
    if (el.closest("#fussleiste, #meldung, .warnkern, .kassenwarnung")) return;
    el.dataset.knapp = "1";
    el.classList.add("knapp", "zu");
    el.addEventListener("click", function (e) {
      if (e.target.closest("a, button, input, select, label, textarea, summary")) return;
      this.classList.toggle("zu");
    });
  }
  function klappAlle() {
    if (!schmal()) return;
    var ziele = document.querySelectorAll(".kern, .fuellkern, .zeitkern, p.mini");
    for (var i = 0; i < ziele.length; i++) klappe(ziele[i]);
  }
  function klappWache() {
    klappAlle();
    // Mein Bereich baut seine Kaesten spaeter - eine gedrosselte Wache
    // klappt Nachzuegler mit ein, ohne bei jedem Tastendruck zu laufen.
    var wartet = false;
    try {
      new MutationObserver(function () {
        if (wartet) return;
        wartet = true;
        setTimeout(function () { wartet = false; klappAlle(); }, 400);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
  }

  // ---- Wischen zwischen den fuenf Bereichen (Karam 05.09.) ----
  // Nur am Handy. passive:true = der Browser scrollt ungebremst,
  // nichts ruckelt. Der Wisch zaehlt NICHT, wenn der Finger in einer
  // quer scrollbaren Tabelle, einem Eingabefeld, dem Foto-Kasten
  // oder dem Logo-Menue liegt - dort gilt das normale Verhalten.
  var REIHE = ["tafel", "bau", "chat", "bereich", "profil"];
  function querScrollbar(el) {
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 5) {
        var o = getComputedStyle(e).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
    }
    return false;
  }
  var wx = null, wy = null, wEl = null;
  document.addEventListener("touchstart", function (e) {
    wx = null; wEl = null;
    if (!schmal() || e.touches.length !== 1) return;
    var z = e.target;
    if (z.closest && z.closest("input, textarea, select, #handyfoto, #logomenue")) return;
    if (querScrollbar(z)) return;
    wx = e.touches[0].clientX; wy = e.touches[0].clientY; wEl = z;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (wx === null) return;
    var dx = e.changedTouches[0].clientX - wx;
    var dy = e.changedTouches[0].clientY - wy;
    var von = wEl;
    wx = null; wEl = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    // IM CHAT gilt WhatsApp: nach rechts wischen geht ZURUECK
    // (Gespraech -> Kontaktliste -> Panel zu). Nie Bereichswechsel.
    if (von && von.closest && von.closest("#glockenpanel")) {
      if (dx > 0) {
        var inh = document.getElementById("gp-inhalt");
        if (inh && inh.classList.contains("gp-zeigt-gespraech") &&
            typeof window.glockeSpalteZeigen === "function") window.glockeSpalteZeigen("liste");
        else if (typeof window.glockeUmschalten === "function") window.glockeUmschalten();
      }
      return;
    }
    if (von && von.closest && von.closest("#ans_chat")) {
      if (dx > 0 && typeof window.mbAnsichtZu === "function") { window.mbAnsichtZu(); markiere("bereich"); }
      return;
    }
    var l = document.getElementById("fussleiste");
    var akt = l && l.querySelector(".fl-knopf.aktiv");
    var i = akt ? REIHE.indexOf(akt.dataset.fl) : -1;
    if (i < 0) return;
    var ziel = REIHE[i + (dx < 0 ? 1 : -1)];   // links wischen = naechster
    if (!ziel) return;
    var k = l.querySelector('.fl-knopf[data-fl="' + ziel + '"]');
    if (k) k.click();
  }, { passive: true });

  // Anker #chat / #profil von anderen Seiten - und Karams Handy-Start
  // im Chat (nur schmal, nur ohne Anker, nur einmal je Laden).
  function start() {
    baue();
    spiegleBadge();
    klappWache();
    if (!aufMein) return;
    var anker = (location.hash || "").replace("#", "");
    if (anker === "chat" || anker === "profil") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
      oeffneAnsicht(anker);
    } else if (schmal()) {
      // Handy-Start wie WhatsApp: die allgemeine Chat-Liste (Karam
      // 05.09.). ERST wenn die App angemeldet aufgebaut ist (ans_chat
      // existiert) - sonst laege das Vollbild ueber der Anmeldemaske.
      (function warte(v) {
        if (document.getElementById("ans_chat")) {
          if (typeof window.chatmodusAuf === "function") { window.chatmodusAuf(true); markiere("chat"); }
          else oeffneAnsicht("chat");
          return;
        }
        if (v < 50) setTimeout(function () { warte(v + 1); }, 300);
      })(0);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

})();

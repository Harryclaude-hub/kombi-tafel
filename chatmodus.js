// ============================================================
// CHATMODUS-SCHICHT 05.09.2026 (Karam: "der ganze Bildschirm soll
// zum Chat werden, Rechtsklick macht einen Mini-Chat wie bei Insta,
// und der Knopf soll den ALLGEMEINEN Chat oeffnen").
//
// Loeschbare Zutat: Datei weg (plus script-Zeilen), und der
// Chat-Knopf verhaelt sich wieder wie vorher. Der Messenger selbst
// (glocke.js) wird NICHT angefasst - hier wird nur sein Panel
// geoeffnet, eine Vollbild-Klasse gesetzt und ein Eintrag
// "Bereichs-Chat" oben in seine Chat-Liste gestellt.
//
// - Linksklick auf den Chat-Knopf oben: allgemeiner Chat im
//   VOLLBILD (Kontakte links, Gespraech rechts - wie WhatsApp Web).
// - Rechtsklick: derselbe Chat als MINI-Fenster oben rechts.
// - Nochmal klicken schliesst; Links/Rechtsklick wechselt den Modus.
// - Der Bereichs-Chat bleibt erreichbar: erster Eintrag der Liste.
//
// Der Klick wird in der CAPTURE-Phase am Dokument abgefangen, damit
// der aeltere Handler aus glocke.js nicht zusaetzlich feuert -
// loeschen dieser Datei stellt ihn unveraendert wieder her.
// ============================================================
"use strict";

(function () {

  // Erster Eintrag der Chat-Liste: der Bereichs-Chat (alle im Bereich).
  function eintrag() {
    var sp = document.getElementById("gp-spalte");
    if (!sp || document.getElementById("gp-bereichschat")) return;
    var b = document.createElement("button");
    b.id = "gp-bereichschat";
    b.className = "gp-freund gp-bereich";
    b.innerHTML = '<span class="gp-bkreis">&#128101;</span>' +
      '<span class="gp-freundname">Bereichs-Chat' +
      '<span class="mini gp-freunduser">alle, die deinen Bereich sehen</span></span>';
    b.onclick = function () {
      if (typeof window.glockeUmschalten === "function") window.glockeUmschalten();
      if (typeof window.mbAnsichtOeffnen === "function" && document.getElementById("ans_chat")) {
        window.mbAnsichtOeffnen("chat");
      } else {
        location.href = "mein.html#chat";
      }
    };
    var kopf = sp.querySelector(".gp-spaltekopf");
    sp.insertBefore(b, kopf ? kopf.nextSibling : sp.firstChild);
  }
  // leiste.js (Fussleiste) nutzt denselben Weg.
  window.chatmodusEintrag = eintrag;

  // ---- Saubere Linien-Symbole fuer Anruf und Video (Karam 05.09.:
  // "andere Symbole") - die Knoepfe samt onclick bleiben von
  // glocke.js, nur ihr Inneres wird getauscht. ----
  var SYMBOL_TELEFON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>';
  var SYMBOL_VIDEO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 8l-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
  function rufSymbole() {
    var alle = document.querySelectorAll("#glockenpanel .gp-ruf");
    for (var i = 0; i < alle.length; i++) {
      var k = alle[i];
      if (k.dataset.symbol) continue;
      k.dataset.symbol = "1";
      k.innerHTML = /video/i.test(k.title || "") ? SYMBOL_VIDEO : SYMBOL_TELEFON;
    }
  }
  // Der Thread wird von glocke.js jederzeit neu gebaut - eine
  // gedrosselte Wache tauscht die Symbole nach, sobald sie auftauchen.
  (function () {
    var wartet = false;
    try {
      new MutationObserver(function () {
        if (wartet) return;
        wartet = true;
        setTimeout(function () {
          wartet = false;
          rufSymbole();
          eintrag();
          // Chat offen = die Seite dahinter haelt still (CSS sperrt
          // ihr Scrollen; am Handy ist der Chat eine eigene Seite).
          document.body.classList.toggle("kt-chat-offen", !!document.getElementById("glockenpanel"));
        }, 250);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
  })();

  // Panel oeffnen/umschalten. voll=true: ganzer Bildschirm.
  function chatAuf(voll) {
    if (typeof window.glockeUmschalten !== "function") { location.href = "mein.html"; return; }
    var p = document.getElementById("glockenpanel");
    if (p) {
      // Gleicher Modus noch einmal = schliessen; anderer = nur wechseln.
      if (p.classList.contains("gp-voll") === !!voll) { window.glockeUmschalten(); return; }
      p.classList.toggle("gp-voll", !!voll);
      return;
    }
    window.glockeUmschalten();
    p = document.getElementById("glockenpanel");
    if (p && voll) p.classList.add("gp-voll");
    eintrag();
  }
  window.chatmodusAuf = chatAuf;

  document.addEventListener("click", function (e) {
    var k = e.target.closest && e.target.closest("#nav_nachrichten");
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    chatAuf(true);
  }, true);

  document.addEventListener("contextmenu", function (e) {
    var k = e.target.closest && e.target.closest("#nav_nachrichten, #fussleiste .fl-knopf[data-fl=\"chat\"]");
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    chatAuf(false);
  }, true);

})();

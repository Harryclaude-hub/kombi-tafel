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

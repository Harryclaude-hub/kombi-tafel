// ============================================================
// EIGENE NACHFRAGE-FENSTER statt der Browser-Popups.
//
// Karam (19.09.2026): "Ersetz die Pop-ups vom Browser mit custom-made
// Pop-ups. Wenn ich was loeschen oder hinzufuegen will, muss klar
// dastehen, was passiert - bestaetigen oder ablehnen. Es darf nicht
// vom Browser kommen, das macht bei der Qualitaet was aus."
//
// Drei Fenster, alle geben ein Promise zurueck:
//   await nachfrage(text, {ok, abbrechen, titel})  -> true/false
//   await eingabeFrage(text, vorgabe)              -> Text oder null
//   await hinweisFenster(text, titel)              -> immer true
//
// Die Texte kommen 1:1 von den alten confirm/prompt-Stellen (\n bleibt
// ein Zeilenumbruch, per CSS white-space). Faellt irgendetwas am DOM
// aus, springt der alte Browser-Weg ein - lieber ein haessliches
// Fenster als eine Geldfrage, die niemand je sieht.
// Enter = OK, Escape oder Klick auf den Schleier = Abbrechen.
// ============================================================
"use strict";

(function () {
  function bauen(inhaltHtml, tasten, fertig) {
    const o = document.createElement("div");
    o.className = "fr-schleier";
    o.innerHTML = '<div class="fr-kasten" role="dialog" aria-modal="true">' +
      inhaltHtml + '<div class="fr-tasten">' + tasten + "</div></div>";
    const zu = (antwort) => {
      document.removeEventListener("keydown", taste, true);
      o.remove();
      fertig(antwort);
    };
    const taste = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); zu(o._beiEsc); }
      else if (ev.key === "Enter" && String(document.activeElement && document.activeElement.tagName) !== "TEXTAREA") {
        ev.preventDefault(); ev.stopPropagation(); zu(o._beiEnter());
      }
    };
    o.addEventListener("mousedown", (ev) => { if (ev.target === o) zu(o._beiEsc); });
    document.addEventListener("keydown", taste, true);
    document.body.appendChild(o);
    return { o: o, zu: zu };
  }

  window.nachfrage = function (text, opt) {
    opt = opt || {};
    return new Promise((fertig) => {
      try {
        const d = bauen(
          (opt.titel ? '<div class="fr-titel"></div>' : "") + '<div class="fr-text"></div>',
          '<button type="button" class="fr-nein"></button>' +
          '<button type="button" class="fr-ja haupt"></button>', fertig);
        if (opt.titel) d.o.querySelector(".fr-titel").textContent = String(opt.titel);
        d.o.querySelector(".fr-text").textContent = String(text || "");
        d.o.querySelector(".fr-ja").textContent = opt.ok || "OK";
        d.o.querySelector(".fr-nein").textContent = opt.abbrechen || "Abbrechen";
        d.o._beiEsc = false;
        d.o._beiEnter = () => true;
        d.o.querySelector(".fr-ja").onclick = () => d.zu(true);
        d.o.querySelector(".fr-nein").onclick = () => d.zu(false);
        d.o.querySelector(".fr-ja").focus();
      } catch (e) { fertig(window.confirm(String(text || ""))); }   // Rueckfall
    });
  };

  window.hinweisFenster = function (text, titel) {
    return new Promise((fertig) => {
      try {
        const d = bauen(
          (titel ? '<div class="fr-titel"></div>' : "") + '<div class="fr-text"></div>',
          '<button type="button" class="fr-ja haupt"></button>', () => fertig(true));
        if (titel) d.o.querySelector(".fr-titel").textContent = String(titel);
        d.o.querySelector(".fr-text").textContent = String(text || "");
        d.o.querySelector(".fr-ja").textContent = "Verstanden";
        d.o._beiEsc = true;
        d.o._beiEnter = () => true;
        d.o.querySelector(".fr-ja").onclick = () => d.zu(true);
        d.o.querySelector(".fr-ja").focus();
      } catch (e) { window.alert(String(text || "")); fertig(true); }
    });
  };

  window.eingabeFrage = function (text, vorgabe) {
    return new Promise((fertig) => {
      try {
        const d = bauen(
          '<div class="fr-text"></div><input class="fr-feld" type="text">',
          '<button type="button" class="fr-nein">Abbrechen</button>' +
          '<button type="button" class="fr-ja haupt">OK</button>', fertig);
        d.o.querySelector(".fr-text").textContent = String(text || "");
        const feld = d.o.querySelector(".fr-feld");
        feld.value = vorgabe === undefined || vorgabe === null ? "" : String(vorgabe);
        d.o._beiEsc = null;
        d.o._beiEnter = () => feld.value;
        d.o.querySelector(".fr-ja").onclick = () => d.zu(feld.value);
        d.o.querySelector(".fr-nein").onclick = () => d.zu(null);
        feld.focus();
        feld.select();
      } catch (e) { fertig(window.prompt(String(text || ""), vorgabe)); }
    });
  };
})();

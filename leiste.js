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

  // In welche Richtung liegt das Ziel? (fuer die Schub-Animation)
  function richtungZu(ziel) {
    var l = document.getElementById("fussleiste");
    var akt = l && l.querySelector(".fl-knopf.aktiv");
    var von = akt ? REIHE.indexOf(akt.dataset.fl) : -1;
    var nach = REIHE.indexOf(ziel);
    if (von < 0 || nach < 0 || von === nach) return null;
    return nach > von ? "links" : "rechts";
  }

  function klick(ev) {
    var was = ev.currentTarget.dataset.fl;
    // Ein anderer Bereich als der Chat: erst den offenen Chat zumachen,
    // sonst laege er weiter ueber der Seite.
    if (was !== "chat" && document.getElementById("glockenpanel") &&
        typeof window.glockeUmschalten === "function") { window.glockeUmschalten(); markiere(); }
    if (was === "tafel")   { geh("original.html", richtungZu("tafel")); return; }
    if (was === "bau")     { geh("kombis.html", richtungZu("bau")); return; }
    if (was === "bereich") {
      if (aufMein && typeof window.mbAnsichtZu === "function") { window.mbAnsichtZu(); markiere("bereich"); }
      else geh("mein.html", richtungZu("bereich"));
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
      else {
        if (schmal()) { try { sessionStorage.setItem("kt_swipe_richtung", "links"); } catch (e) { } }
        location.href = "mein.html#" + was;
      }
    }
  }

  // Seitenwechsel MIT Schub-Animation (Karam 05.09. Nacht: "jede
  // Wisch-Bewegung braucht eine geile Animation"). richtung "links"
  // heisst: die neue Seite kommt von rechts herein. Die Richtung
  // wird ueber den Seitenwechsel gemerkt (sessionStorage), die neue
  // Seite faehrt dann passend ein. Ohne schmalen Schirm oder mit
  // reduzierter Bewegung macht das CSS schlicht nichts daraus.
  function geh(ziel, richtung) {
    // Auf der Zielseite selbst nur nach oben rollen statt neu laden.
    if (location.pathname.indexOf(ziel) >= 0) { window.scrollTo(0, 0); return; }
    if (schmal() && richtung) {
      try { sessionStorage.setItem("kt_swipe_richtung", richtung); } catch (e) { }
      document.body.classList.add(richtung === "links" ? "lw-raus-links" : "lw-raus-rechts");
      setTimeout(function () { location.href = ziel; }, 120);
      return;
    }
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
  // Nach einem ECHTEN Wisch darf der Finger-Abdruck keinen Knopf
  // ausloesen (Karam: "manchmal klickt es einen Knopf"). Der naechste
  // Klick innerhalb von 350 ms wird geschluckt.
  function klickSchlucken() {
    var ohr = function (e) { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("click", ohr, true);
    setTimeout(function () { document.removeEventListener("click", ohr, true); }, 350);
  }

  var wx = null, wy = null, wEl = null, wZeit = 0;
  document.addEventListener("touchstart", function (e) {
    wx = null; wEl = null;
    if (!schmal() || e.touches.length !== 1) return;
    var z = e.target;
    if (z.closest && z.closest("input, textarea, select, #handyfoto, #logomenue")) return;
    if (querScrollbar(z)) return;
    wx = e.touches[0].clientX; wy = e.touches[0].clientY; wEl = z; wZeit = Date.now();
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (wx === null) return;
    var dx = e.changedTouches[0].clientX - wx;
    var dy = e.changedTouches[0].clientY - wy;
    var von = wEl, dauer = Date.now() - wZeit;
    wx = null; wEl = null;
    // Strengere Erkennung (Karam: falsche Treffer beim Scrollen):
    // schnelle, klar waagrechte Geste - sonst ist es Scrollen/Tippen.
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > 50 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dauer > 700) return;
    klickSchlucken();
    // IM CHAT gilt WhatsApp: nach rechts wischen geht ZURUECK
    // (Gespraech -> Kontaktliste -> Panel zu). Nie Bereichswechsel.
    if (von && von.closest && von.closest("#glockenpanel")) {
      if (dx > 0) {
        var inh = document.getElementById("gp-inhalt");
        if (inh && inh.classList.contains("gp-zeigt-gespraech") &&
            typeof window.glockeSpalteZeigen === "function") window.glockeSpalteZeigen("liste");
        else if (typeof window.glockeUmschalten === "function") { window.glockeUmschalten(); markiere(); }
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
    // Den Handler DIREKT rufen, nicht ueber einen DOM-Klick - den
    // wuerde der Klick-Schlucker oben gleich mitfressen.
    if (k) klick({ currentTarget: k });
  }, { passive: true });

  // Anker #chat / #profil von anderen Seiten - und Karams Handy-Start
  // im Chat (nur schmal, nur ohne Anker, nur einmal je Laden).
  // Die anderen Seiten VORLADEN (Karam 06.09.: "die muessten alle
  // geladen werden, damit nichts laedt beim Wischen"). rel=prefetch
  // legt sie in den Browser-Speicher - der Wechsel kommt dann aus
  // dem Cache. BEWUSST kein Service-Worker-Cache: Karams harte
  // Regel "Updates muessen sofort ankommen" (sw.js) bleibt stehen.
  function seitenVorladen() {
    var hier = location.pathname.split("/").pop() || "original.html";
    var alle = ["original.html", "kombis.html", "mein.html", "schule.html", "hilfe.html"];
    for (var i = 0; i < alle.length; i++) {
      if (hier.indexOf(alle[i]) === 0) continue;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.href = alle[i];
      l.as = "document";
      document.head.appendChild(l);
    }
  }

  function start() {
    baue();
    spiegleBadge();
    klappWache();
    setTimeout(seitenVorladen, 1500);   // erst wenn die eigene Seite steht
    // Einfahr-Animation: kam der Wechsel von einem Wisch, faehrt die
    // neue Seite aus der gemerkten Richtung herein.
    try {
      var r = sessionStorage.getItem("kt_swipe_richtung");
      if (r && schmal()) {
        sessionStorage.removeItem("kt_swipe_richtung");
        var kl = (r === "links") ? "lw-rein-rechts" : "lw-rein-links";
        document.body.classList.add(kl);
        document.body.addEventListener("animationend", function ende(ev) {
          if (ev.target !== document.body) return;
          document.body.classList.remove(kl);
          document.body.removeEventListener("animationend", ende);
        });
      }
    } catch (e) { }
    // Sicherheitsnetz fuer die Unten-Markierung: ist der Chat zu und
    // keine Chat-Ansicht offen, darf unten nicht "Chat" leuchten.
    setInterval(function () {
      var l = document.getElementById("fussleiste");
      var akt = l && l.querySelector(".fl-knopf.aktiv");
      if (!akt || akt.dataset.fl !== "chat") return;
      var chatDa = document.getElementById("glockenpanel") ||
        (document.getElementById("ans_chat") && document.getElementById("ans_chat").classList.contains("offen"));
      if (!chatDa) markiere();
    }, 800);
    var anker = aufMein ? (location.hash || "").replace("#", "") : "";
    if (anker === "chat" || anker === "profil") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
      oeffneAnsicht(anker);
    }
    // Handy-Start wie WhatsApp: die allgemeine Chat-Liste - aber nur
    // EINMAL je App-Oeffnung (sessionStorage), nicht bei jedem
    // Seitenwechsel (Karams Fund: "Bereich" gedrueckt, Chat kam).
    // Auf mein.html erst nach dem Anmelden (ans_chat), sonst laege
    // das Vollbild ueber der Anmeldemaske.
    if (schmal() && !anker) {
      var schonGestartet = false;
      try { schonGestartet = !!sessionStorage.getItem("kt_leiste_startchat"); } catch (e) { }
      if (!schonGestartet) {
        try { sessionStorage.setItem("kt_leiste_startchat", "1"); } catch (e) { }
        if (aufMein) {
          (function warte(v) {
            if (document.getElementById("ans_chat")) {
              if (typeof window.chatmodusAuf === "function") { window.chatmodusAuf(true); markiere("chat"); }
              else oeffneAnsicht("chat");
              return;
            }
            if (v < 50) setTimeout(function () { warte(v + 1); }, 300);
          })(0);
        } else if (typeof window.chatmodusAuf === "function") {
          setTimeout(function () { window.chatmodusAuf(true); markiere("chat"); }, 250);
        }
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

})();

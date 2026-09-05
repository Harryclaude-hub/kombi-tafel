// ============================================================
// LOGO-KNOPF-SCHICHT 05.09.2026 (Karams Wunsch: "das Logo soll
// eine Funktion haben - oder ein Easter Egg. Euch ueberlassen.")
//
// Reine Zutat nach der Trennregel: Datei loeschen (plus die sechs
// script-Zeilen), und das Logo ist wieder nur ein Bild. Nichts
// Bestehendes wird angefasst, keine Zahl gerechnet.
//
// Was das Logo jetzt kann (Links- ODER Rechtsklick):
//  - Schnellmenue: alle Seiten, "Frisch laden" (holt garantiert die
//    neueste Fassung - die bekannte Cache-Falle), die laufende
//    Fassungsnummer zum Ablesen, und ein Wuerfel.
//  - EASTER EGG: 7 schnelle Klicks aufs Logo -> das Logo dreht
//    eine Runde und die Tafel meldet sich zackig.
// ============================================================
"use strict";

(function () {

  var logo = document.querySelector(".navleiste .logo");
  if (!logo) return;
  logo.classList.add("logoknopf");
  logo.title = "Klick: Schnellmenü";

  // Die laufende Fassung aus einer eigenen script-Adresse ablesen -
  // nur angezeigt, nirgends verwendet.
  function fassung() {
    var s = document.querySelector('script[src*="?v="]');
    var m = s && s.src.match(/v=([0-9a-z]+)/);
    return m ? m[1] : "unbekannt";
  }

  var SEITEN = [
    ["original.html", "📋 Original-Tabelle"],
    ["kombis.html", "🎯 Kombi-Bau"],
    ["mein.html", "📒 Mein Bereich"],
    ["schule.html", "📖 Handbuch"],
    ["hilfe.html", "❓ Erklärungen"]
  ];

  function zu() {
    var m = document.getElementById("logomenue");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function auf() {
    if (document.getElementById("logomenue")) { zu(); return; }
    var m = document.createElement("div");
    m.id = "logomenue";
    var hier = location.pathname.split("/").pop() || "original.html";
    var html = "";
    // GANZ OBEN: der Boni-Radar (Karam 05.09.: "Gutscheine, echtes
    // Geld"). NUR offizielle Anbieter-Wege - Dritt-Seiten mit
    // "Gratis-Codes" sind fast immer Betrug und gefaehrden das Konto.
    html += '<button type="button" class="lm-boni">🎁 Boni-Radar: täglich abholen</button>' +
      '<div class="lm-bonifeld" hidden>' +
      '<div class="lm-bonizeile"><b>Stake:</b> echte <b>Bonus-Drop-Codes</b>, unregelmäßig im ' +
      '<a href="https://t.me/StakecomDailyDrops" target="_blank" rel="noopener">Telegram-Kanal</a> und auf ' +
      '<a href="https://x.com/Stake" target="_blank" rel="noopener">X</a>. ' +
      'Einlösen: Konto → Einstellungen → Angebote → Bonus Drop. Schnell sein - Codes sind begrenzt. ' +
      'Dazu <a href="https://stake.com/promotions" target="_blank" rel="noopener">Promotions</a> (Races, Rakeback).</div>' +
      '<div class="lm-bonizeile"><b>Interwetten:</b> ' +
      '<a href="https://www.interwetten.com/de/bonus/sportwetten-bonus-bestandskunden" target="_blank" rel="noopener">Bestandskunden-Boni</a> ' +
      '(Reload, Kombi-Boost, Cashback - wechselt wöchentlich).</div>' +
      '<div class="lm-bonizeile"><b>Bwin:</b> ' +
      '<a href="https://sports.bwin.com/de/promo/offers" target="_blank" rel="noopener">Angebote</a> ' +
      'und im Konto unter "Meine Angebote" (Boost-Token).</div>' +
      '<div class="lm-bonizeile"><b>Bet365:</b> ' +
      '<a href="https://extra.bet365.com/offers/de" target="_blank" rel="noopener">Offers-Seite</a>.</div>' +
      '<div class="lm-boniwarn">&#9888; Fremde "Gratis-Gutschein"-Seiten sind fast immer Betrug ' +
      '(Phishing, Kontosperre). Nur diese offiziellen Wege nutzen.</div>' +
      "</div>";
    for (var i = 0; i < SEITEN.length; i++) {
      if (hier.indexOf(SEITEN[i][0]) === 0) continue;   // die eigene Seite nicht anbieten
      html += '<a href="' + SEITEN[i][0] + '">' + SEITEN[i][1] + "</a>";
    }
    html += '<div class="lm-strich"></div>' +
      '<button type="button" class="lm-rechner">🧮 Blitz-Rechner</button>' +
      '<div class="lm-rechnerfeld" hidden>' +
      '<input type="number" step="0.5" min="0" class="lmr" id="lmr_e" placeholder="Einsatz €">' +
      '<input type="number" step="0.01" min="1" class="lmr" id="lmr_1" placeholder="Quote 1">' +
      '<input type="number" step="0.01" min="1" class="lmr" id="lmr_2" placeholder="Quote 2">' +
      '<input type="number" step="0.01" min="1" class="lmr" id="lmr_3" placeholder="Quote 3">' +
      '<div class="lm-ergebnis" id="lmr_aus">Einsatz und Quoten tippen</div>' +
      "</div>" +
      '<button type="button" class="lm-frisch">🔄 Frisch laden (holt sicher den neuesten Stand)</button>' +
      '<div class="lm-fassung">läuft: Fassung ' + fassung() + "</div>";
    m.innerHTML = html;
    // Unters Logo haengen, Position rechnet das CSS.
    logo.parentNode.style.position = "relative";
    logo.parentNode.appendChild(m);

    m.querySelector(".lm-frisch").addEventListener("click", function () {
      var seite = location.pathname.split("/").pop() || "original.html";
      location.replace(seite + "?frisch=" + Date.now());
    });
    m.querySelector(".lm-boni").addEventListener("click", function () {
      var f = m.querySelector(".lm-bonifeld");
      f.hidden = !f.hidden;
    });
    // Blitz-Rechner: Einsatz x Quoten = Gesamtquote und Auszahlung.
    // Reiner Taschenrechner, speichert und veraendert nichts.
    m.querySelector(".lm-rechner").addEventListener("click", function () {
      var f = m.querySelector(".lm-rechnerfeld");
      f.hidden = !f.hidden;
      if (!f.hidden) m.querySelector("#lmr_e").focus();
    });
    function lmrRechnen() {
      var e_ = parseFloat(m.querySelector("#lmr_e").value.replace(",", "."));
      var qs = ["#lmr_1", "#lmr_2", "#lmr_3"]
        .map(function (id) { return parseFloat(m.querySelector(id).value.replace(",", ".")); })
        .filter(function (q) { return isFinite(q) && q > 1; });
      var aus = m.querySelector("#lmr_aus");
      if (!qs.length) { aus.textContent = "Einsatz und Quoten tippen"; return; }
      var gesamt = qs.reduce(function (p, q) { return p * q; }, 1);
      var text = "Gesamtquote " + (Math.round(gesamt * 100) / 100).toFixed(2);
      if (isFinite(e_) && e_ > 0) {
        var zurueck = Math.round(e_ * gesamt * 100) / 100;
        text += " → " + zurueck.toFixed(2) + " € zurück (+" +
          (Math.round((zurueck - e_) * 100) / 100).toFixed(2) + " €)";
      }
      aus.textContent = text;
    }
    var felder = m.querySelectorAll(".lmr");
    for (var j = 0; j < felder.length; j++) felder[j].addEventListener("input", lmrRechnen);
  }

  // Aussenklick und Escape schliessen das Menue.
  document.addEventListener("click", function (e) {
    if (e.target === logo || e.target.closest("#logomenue")) return;
    zu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") zu(); });

  // ---- Easter Egg: 7 schnelle Klicks -> Ehrenrunde ----
  var klicks = 0, zuletzt = 0;
  function ehrenrunde() {
    logo.classList.add("dreht");
    setTimeout(function () { logo.classList.remove("dreht"); }, 900);
    var text = "🎖️ <b>Jawohl, Chef.</b> Die Tafel steht bereit.";
    if (typeof window.meldungM === "function") window.meldungM(text, "gut");
    else if (typeof window.meldung === "function") window.meldung(text, "gut");
  }

  logo.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    var jetzt = Date.now();
    klicks = (jetzt - zuletzt < 700) ? klicks + 1 : 1;
    zuletzt = jetzt;
    if (klicks >= 7) { klicks = 0; zu(); ehrenrunde(); return; }
    auf();
  });
  logo.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    auf();
  });

})();

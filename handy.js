// ============================================================
// HANDY-SCHICHT 28.08.: Fotos formatfuellend oeffnen.
//
// Das ist eine reine Design-Zutat und kann komplett geloescht
// werden (Datei weg, die sieben script-Zeilen weg). Dann sehen
// die Fotos wieder aus wie vorher und alles andere laeuft
// unveraendert weiter.
//
// Sie fasst NICHTS an, was es schon gibt: keine bestehende
// Funktion wird ueberschrieben, keine Variable geteilt, keine
// Nachricht angeruehrt, keine Zahl gerechnet. Sie haengt EIN
// Klick-Ohr an das Dokument und baut bei Bedarf einen eigenen
// Kasten (#handyfoto) ueber die Seite.
//
// Sie arbeitet NUR auf schmalen Schirmen (bis 700 Pixel). Am
// Rechner passiert gar nichts - die erste Zeile jeder Pruefung
// steigt dort sofort wieder aus.
// ============================================================
"use strict";

(function () {

  // Sind wir ueberhaupt am Handy? Kennt ein alter Browser
  // matchMedia nicht, sagen wir "nein" und halten uns raus.
  function handySchmal() {
    try {
      return !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);
    } catch (e) { return false; }
  }

  // Welche Bilder duerfen sich oeffnen: die Foto-Vorschau einer
  // Kombination, das Foto an einem Schein im Kombi-Bau, ein Bild
  // aus dem Messenger, eine Foto-Kachel im Admin und die
  // Ausweis-Vorschau bei den Personendaten.
  var HANDY_BILDER = "img.minifoto, .s-foto img, .medienbild, .fotokachel img, .pd-vorschau";

  function handyFotoZu() {
    var alt = document.getElementById("handyfoto");
    if (alt && alt.parentNode) alt.parentNode.removeChild(alt);
  }

  function handyFotoAuf(quelle, name) {
    handyFotoZu();
    var kasten = document.createElement("div");
    kasten.id = "handyfoto";
    kasten.innerHTML =
      '<div class="hf-kopf"><span class="hf-name"></span>' +
      '<button type="button" class="hf-zu">schliessen</button></div>' +
      '<div class="hf-flaeche"><img alt="Foto"></div>' +
      '<div class="hf-fuss">Auf das Bild tippen: groesser und kleiner. Zum Schieben wischen.</div>';
    document.body.appendChild(kasten);

    // Den Namen als TEXT setzen, nicht als HTML: ein Dateiname
    // aus einer Nachricht darf niemals als Befehl gelesen werden.
    kasten.querySelector(".hf-name").textContent = name || "Foto";
    kasten.querySelector(".hf-flaeche img").src = quelle;

    kasten.querySelector(".hf-zu").addEventListener("click", handyFotoZu);
    // Tippen auf den dunklen Grund schliesst ebenfalls.
    kasten.addEventListener("click", function (e) {
      if (e.target === kasten) handyFotoZu();
    });
    // Tippen auf das Bild schaltet zwischen "ganz sehen" und
    // "gross und schiebbar" um.
    kasten.querySelector(".hf-flaeche img").addEventListener("click", function (e) {
      e.stopPropagation();
      kasten.classList.toggle("hf-gross");
    });
  }

  // Zu welchem Foto gehoert welcher Name? Der Fotoname steht bei
  // den Kombinationen in der Zelle davor (.fotoname aus mein.js),
  // im Kombi-Bau ebenso. Finden wir keinen, heisst es einfach
  // "Foto".
  function handyFotoName(bild) {
    try {
      var zelle = bild.closest("td, .s-foto, .fotokachel, .chatzeile, .pd-dok");
      var n = zelle && zelle.querySelector(".fotoname");
      if (n && n.textContent.trim()) return n.textContent.trim();
      if (bild.alt && bild.alt !== "Foto") return bild.alt;
    } catch (e) { }
    return "Foto";
  }

  document.addEventListener("click", function (e) {
    try {
      if (!handySchmal()) return;
      var ziel = e.target;
      if (!ziel || ziel.tagName !== "IMG" || !ziel.closest) return;
      if (ziel.closest("#handyfoto")) return;         // im Vollbild selbst nicht
      if (!ziel.matches(HANDY_BILDER)) return;
      if (!ziel.src) return;
      e.preventDefault();
      handyFotoAuf(ziel.src, handyFotoName(ziel));
    } catch (fehler) {
      // Ein Fehler hier darf die Seite nie stoeren.
    }
  }, false);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") handyFotoZu();
  });

})();

// ============================================================
// KLAPPEN (Design-Schicht, komplett loeschbar): macht aus den langen
// Textseiten Handbuch (schule.html) und Erklaerungen (hilfe.html)
// Klapp-Abschnitte mit einem Knopf-Inhaltsverzeichnis oben.
//
// Karams Wunsch vom 02.09.: "beim Handbuch ist so viel Text - mehr
// Knoepfe, mehr Bereiche". Die Texte selbst bleiben WORT FUER WORT
// unveraendert: dieses Skript verschiebt Knoten nur mit appendChild
// (Identitaet und ids bleiben erhalten, schule.js findet #teilung/
// #tafel/#toretafel weiter), es serialisiert nie per innerHTML.
//
// Loeschprobe: diese Datei, ihre Script-Zeile in schule.html/hilfe.html
// und den KLAPPEN-Block am Ende von stil.css entfernen - beide Seiten
// sehen wieder exakt aus wie vorher.
// ============================================================
"use strict";

(function () {
  const seite = document.body ? document.body.dataset.seite : "";
  if (seite !== "handbuch" && seite !== "hilfe") return;

  // Ein Knopf-Inhaltsverzeichnis. eintraege: [{text, tu}], extras: [{text, tu}]
  function leisteBauen(titel, eintraege, extras) {
    const l = document.createElement("div");
    l.className = "kl-leiste";
    const t = document.createElement("div");
    t.className = "kl-titel";
    t.textContent = titel;
    l.appendChild(t);
    const reihe = document.createElement("div");
    reihe.className = "kl-reihe";
    for (const e of eintraege) {
      const k = document.createElement("button");
      k.type = "button";
      k.className = "kl-knopf";
      k.textContent = e.text;
      k.addEventListener("click", e.tu);
      reihe.appendChild(k);
    }
    l.appendChild(reihe);
    if (extras && extras.length) {
      const ex = document.createElement("div");
      ex.className = "kl-extras";
      for (const e of extras) {
        const k = document.createElement("button");
        k.type = "button";
        k.className = "kl-extra";
        k.textContent = e.text;
        k.addEventListener("click", e.tu);
        ex.appendChild(k);
      }
      l.appendChild(ex);
    }
    return l;
  }

  function start() {
    if (seite === "handbuch") {
      // schule.html: 8 flache h2-Abschnitte. Muster: h2 plus alle
      // folgenden Geschwister bis zum naechsten h2, .fuss oder script.
      const h2s = [...document.querySelectorAll("body > h2")];
      if (!h2s.length) return;
      const gruppen = [];
      for (const h of h2s) {
        const knoten = [h];
        let n = h.nextSibling;
        while (n) {
          if (n.nodeType === 1 && (n.tagName === "H2" || n.tagName === "SCRIPT" ||
              (n.classList && n.classList.contains("fuss")))) break;
          knoten.push(n);
          n = n.nextSibling;
        }
        gruppen.push(knoten);
      }
      const abschnitte = [];
      gruppen.forEach((knoten, i) => {
        const s = document.createElement("section");
        s.className = "kl-abschnitt" + (i === 0 ? "" : " zu");
        s.id = "klapp-" + (i + 1);          // eigenes Praefix, keine fremden ids
        knoten[0].parentNode.insertBefore(s, knoten[0]);
        for (const k of knoten) s.appendChild(k);
        const h = knoten[0];
        h.classList.add("kl-kopf");
        h.addEventListener("click", () => s.classList.toggle("zu"));
        abschnitte.push(s);
      });
      const eintraege = abschnitte.map((s, i) => ({
        text: gruppen[i][0].textContent.trim(),
        tu: () => { s.classList.remove("zu"); s.scrollIntoView({ block: "start", behavior: "smooth" }); }
      }));
      const extras = [
        { text: "alle aufklappen", tu: () => abschnitte.forEach(s => s.classList.remove("zu")) },
        { text: "alle zuklappen", tu: () => abschnitte.forEach(s => s.classList.add("zu")) }
      ];
      const leiste = leisteBauen("Kapitel - antippen springt hin und klappt auf:", eintraege, extras);
      abschnitte[0].parentNode.insertBefore(leiste, abschnitte[0]);
      return;
    }

    // hilfe.html: die Klappen (details/summary) gibt es schon nativ -
    // hier fehlt nur das Knopf-Inhaltsverzeichnis daruber.
    const alle = [...document.querySelectorAll("body > details")];
    if (!alle.length) return;
    const eintraege = alle.map(d => {
      const su = d.querySelector("summary");
      const text = (su ? su.textContent : "Abschnitt")
        .replace(/\s*\(anklicken[^)]*\)\s*/i, " ").replace(/\s+/g, " ").trim();
      return { text: text, tu: () => { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); } };
    });
    const extras = [
      { text: "alle aufklappen", tu: () => alle.forEach(d => { d.open = true; }) },
      { text: "alle zuklappen", tu: () => alle.forEach(d => { d.open = false; }) }
    ];
    const leiste = leisteBauen("Themen - antippen springt hin und klappt auf:", eintraege, extras);
    alle[0].parentNode.insertBefore(leiste, alle[0]);
  }

  // Als letztes Script eingebunden: DOM steht schon, schule.js hat seine
  // Tafeln gebaut. try/catch, damit die Seite NIE an der Deko scheitert.
  try { start(); } catch (e) { /* Klappen sind Beigabe, nie Pflicht */ }
})();

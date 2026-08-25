// ============================================================
// RECHERCHE-QUOTEN: aktuelle MARKT-Quoten, von Claude gesucht.
//
// WICHTIG, damit kein falscher Eindruck entsteht:
// Das sind VERGLEICHS-Quoten vom Quotenvergleich Oddspedia
// (beste dort gelistete Quote je Linie), NICHT die Quote eines
// bestimmten der vier Anbieter. Interwetten und Stake listet
// Oddspedia gar nicht. Die Zahl sagt dir, wo der Markt GERADE
// steht, damit du Foto-Quote und App-Anzeige einordnen kannst.
//
// werte: je Options-Linie die Marktquote zum Lesezeitpunkt.
// zeit:  wann gesucht wurde. url: die Quelle zum Nachpruefen.
// ============================================================

const RECHERCHE_STAND = "25.08.2026, ca. 13:00 Uhr";

const RECHERCHE = {
"1.11": { werte: { "-0.5": 2.33 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/football/burnley-norwich-50543",
  notiz: "Markt deutlich unter der Foto-Quote 2.57: die Quote ist gefallen." },

"1.17": { werte: { "2.5": 2.02 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/football/metaloglobus-bucuresti-fc-unirea-slobozia-38061",
  notiz: "Markt exakt auf Foto-Niveau." },

"1.15": { werte: { "-0.5": 1.91 }, zeit: "25.08. 13:01",
  url: "https://oddspedia.com/football/america-de-cali-junior-fc-44837",
  notiz: "Quote GESTIEGEN (Foto 1.85). Achtung Termin: laut Oddspedia und 365scores ist der Anstoss Do 27.08. um 01:20 unserer Zeit, nicht 26.08. Der Termin in der Tafel wurde korrigiert." },

"2.15": { werte: { "0": 1.87, "-0.5": 2.70 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/us/soccer/al-khaleej-abha-140711",
  notiz: "Beide Optionen gefallen (Foto 2.04 / 2.80)." },

"2.17": { werte: { "2.25": 1.80 }, zeit: "25.08. 13:01",
  url: "https://oddspedia.com/football/orlando-pirates-sekhukhune-united-828198",
  notiz: "Gefallen (Foto 1.93). Linie 2.5 war nicht direkt sichtbar." },

"2.05": { werte: { "3": 1.91 }, zeit: "25.08. 13:02",
  url: "https://oddspedia.com/football/strommen-raufoss-11030",
  notiz: "Mittlere Linie UNDER 3: Markt 1.91 (Foto 2.00). Linien 2.5 und 3.5 nicht direkt sichtbar; UNDER 2.75 stand bei 2.15." },

"2.04": { werte: { "3.5": 1.71, "3.75": 1.88 }, zeit: "25.08. 13:02",
  url: "https://oddspedia.com/football/odd-bk-kongsvinger-45639",
  notiz: "Beide Linien leicht unter Foto (1.74 / 1.92)." },

"4.07": { werte: { "3.5": 2.07, "3.75": 1.88 }, zeit: "25.08. 13:03",
  url: "https://oddspedia.com/football/haugesund-egersund-45587",
  notiz: "Beide gefallen (Foto 2.20 / 2.00)." }
};

// Spiele, die beim Quotenvergleich NICHT gefunden wurden (zu kleine Bewerbe):
// Airdrieonians vs Stirling, Hamilton vs Edinburgh City, Forfar vs Formartine
// (Scottish Challenge Cup), Coquimbo vs U. Catolica (2026er-Seite nicht auffindbar).
// Deren Felder bleiben Handarbeit in der App.

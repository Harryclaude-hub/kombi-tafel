// ============================================================
// RECHERCHE: Quoten, die NICHT von dir selbst eingetippt wurden.
//
// Zwei getrennte Toepfe:
//
// 1) ANBIETER_QUOTEN  = echte Quoten deiner vier Anbieter.
//    Quelle: Screenshots, die Karam aus den Apps schickt.
//    Claude liest sie ab und traegt sie hier ein. Sie erscheinen
//    in der Tafel als graue Vorbelegung im jeweiligen Feld und
//    koennen jederzeit ueberschrieben werden.
//    Aufbau:  "wette-id": { anbieter: { linie: wert, ... }, _zeit: "...", _quelle: "..." }
//
// 2) FREMDVERGLEICH   = beste Quote eines Quotenvergleichs.
//    NUR zur Einordnung, nicht zum Wetten. Steht nur in der Info-Zeile.
// ============================================================

const RECHERCHE_STAND = "Fremdvergleich 25.08.2026 ca. 13:00 Uhr. Anbieter-Quoten: noch keine.";

// ---- Topf 1: echte Quoten der vier Anbieter (aus Screenshots) ----
// Beispiel, wie ein Eintrag spaeter aussieht:
// "1.11": { b3: { "-0.5": 2.45 }, bw: { "-0.5": 2.40 },
//           _zeit: "25.08. 19:20", _quelle: "Screenshot Karam" },
const ANBIETER_QUOTEN = {
  // noch leer: schick Screenshots aus den Apps, dann fuellt Claude das hier
};

// ---- Topf 2: Fremdvergleich, nur zur Einordnung ----
const RECHERCHE = {
"1.11": { werte: { "-0.5": 2.33 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/football/burnley-norwich-50543",
  notiz: "Deutlich unter der Foto-Quote 2.57: die Quote ist gefallen." },

"1.17": { werte: { "2.5": 2.02 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/football/metaloglobus-bucuresti-fc-unirea-slobozia-38061",
  notiz: "Exakt auf Foto-Niveau." },

"1.15": { werte: { "-0.5": 1.91 }, zeit: "25.08. 13:01",
  url: "https://oddspedia.com/football/america-de-cali-junior-fc-44837",
  notiz: "GESTIEGEN (Foto 1.85). Anstoss ausserdem korrigiert: 27.08. 01:20 deiner Zeit." },

"2.15": { werte: { "0": 1.87, "-0.5": 2.70 }, zeit: "25.08. 13:00",
  url: "https://oddspedia.com/us/soccer/al-khaleej-abha-140711",
  notiz: "Beide Optionen gefallen (Foto 2.04 / 2.80)." },

"2.17": { werte: { "2.25": 1.80 }, zeit: "25.08. 13:01",
  url: "https://oddspedia.com/football/orlando-pirates-sekhukhune-united-828198",
  notiz: "Gefallen (Foto 1.93)." },

"2.05": { werte: { "3": 1.91 }, zeit: "25.08. 13:02",
  url: "https://oddspedia.com/football/strommen-raufoss-11030",
  notiz: "Mittlere Linie UNDER 3: 1.91 (Foto 2.00)." },

"2.04": { werte: { "3.5": 1.71, "3.75": 1.88 }, zeit: "25.08. 13:02",
  url: "https://oddspedia.com/football/odd-bk-kongsvinger-45639",
  notiz: "Beide Linien leicht unter Foto (1.74 / 1.92)." },

"4.07": { werte: { "3.5": 2.07, "3.75": 1.88 }, zeit: "25.08. 13:03",
  url: "https://oddspedia.com/football/haugesund-egersund-45587",
  notiz: "Beide gefallen (Foto 2.20 / 2.00)." }
};

// Nicht auffindbar auf dem Vergleichsportal: Scottish Challenge Cup
// (Airdrieonians, Hamilton, Forfar) und Coquimbo vs U. Catolica.

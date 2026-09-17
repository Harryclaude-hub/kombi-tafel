// ============================================================
// DIE 38 ALTEN SCHEINE VOM 25. BIS 28.08.2026
// ============================================================
// Karam (17.09.2026): "Hier sind 38 Fotos. Die sind zwischen dem 25. und
// 28. August gesetzt worden. Du liest den Einsatz, die Quote und den
// moeglichen Gewinn. Und tust sie bei den Kombis hinzufuegen, mit Datum,
// nur den Datum, keine Uhrzeit. Und ich moechte wirklich, dass du diese
// Scheine zu KEINER Person zuteilst. Es sind die einzigen Ausnahmen."
//
// WOHER DIE ZAHLEN KOMMEN
// Jede Zeile hier ist von genau EINEM Foto abgelesen, Bild fuer Bild.
// Nichts ist gerechnet: der moegliche Gewinn steht so da, wie ihn der
// Anbieter gezeigt hat. Das ist wichtig, weil Einsatz mal Quote bei
// Interwetten NICHT herauskommt (dort geht eine Gebuehr ab) und bei
// Bet365 auch nicht (dort kommt ein Bonus dazu).
//   Beispiel Foto 2:  232,39 x 9,66 = 2.244,88, gezeigt wurden 2.132,64
//   Beispiel Foto 23: 165,00 x 9,66 = 1.593,90, gezeigt wurden 1.665,35
// Wer hier nachrechnet statt abzulesen, traegt falsche Betraege ein.
//
// DAS DATUM ist der Tag, an dem das Foto entstanden ist (Dateidatum).
// Es deckt sich genau mit Karams Angabe 25. bis 28. August. KEINE
// Uhrzeit, so wie er es wollte.
//
// DER ANBIETER ist am Aussehen des Scheins abgelesen, nicht geraten:
//   iw = "Kombiwette" mit Gesamtquote/Einsatz/Moeglicher Gewinn und
//        einer Gebuehr, die vom Produkt abgeht
//   b3 = "MULTI BET"/"Treble" mit Stake/Total odds/Boosted winnings
//   st = dunkler Schein mit dem Stake-Schriftzug und der T-Muenze
// Er steht in der Liste vor dem Anlegen SICHTBAR da. Stimmt einer
// nicht, umstellen - ohne Anbieter faellt der Einsatz in der
// Personen-Rechnung lautlos heraus.
//
// KEINE PERSON. Ausdruecklich. ordner bleibt leer.

"use strict";

// datum: Tag des Scheins (Dateidatum des Fotos)
// kz:    Anbieter
// quote: Gesamtquote laut Schein
// ein:   Einsatz laut Schein
// gew:   MOEGLICHER GEWINN laut Schein (abgelesen, nicht gerechnet)
// foto:  Dateiname, damit die Bilder zugeordnet werden koennen
// beine: was auf dem Schein steht [Spiel, Tipp, Quote, Anstoss]
const ALT_SCHEINE = [
  // ---------- 25.08.2026 ----------
  { nr: 2, datum: "2026-08-25", kz: "iw", quote: 9.66, ein: 232.39, gew: 2132.64,
    foto: "photo_2_2026-09-17_03-24-21.jpg", beine: [
      ["Colchester United - FC Rochdale", "Asian Handicap Colchester United (-0.5), Tipp 1", 2.30, "2026-08-29T16:00"],
      ["Ascoli - Carrarese Calcio 1908", "Über 2.5", 2.40, "2026-08-29T21:00"],
      ["Besiktas - Corum FK", "Über 2.5", 1.75, "2026-08-31T20:30"]] },
  { nr: 3, datum: "2026-08-25", kz: "iw", quote: 5.78, ein: 159.13, gew: 873.18,
    foto: "photo_3_2026-09-17_03-24-21.jpg", beine: [
      ["FC Girona - UD Las Palmas", "Über 2.5", 1.90, "2026-08-29T21:30"],
      ["FC Viktoria Köln - SC Preußen 06 Münster", "Unter 3.5", 1.60, "2026-08-30T19:30"],
      ["FC Inter Turku - Kuopion Palloseura", "Über 2.5", 1.90, "2026-08-31T18:00"]] },
  { nr: 4, datum: "2026-08-25", kz: "iw", quote: 3.04, ein: 83.75, gew: 241.87,
    foto: "photo_4_2026-09-17_03-24-21.jpg", beine: [
      ["FC Viktoria Köln - SC Preußen 06 Münster", "Unter 3.5", 1.60, "2026-08-30T19:30"],
      ["FC Inter Turku - Kuopion Palloseura", "Über 2.5", 1.90, "2026-08-31T18:00"]] },
  { nr: 5, datum: "2026-08-25", kz: "iw", quote: 3.61, ein: 22.86, gew: 78.40,
    foto: "photo_5_2026-09-17_03-24-21.jpg", beine: [
      ["FC Girona - UD Las Palmas", "Über 2.5", 1.90, "2026-08-29T21:30"],
      ["FC Inter Turku - Kuopion Palloseura", "Über 2.5", 1.90, "2026-08-31T18:00"]] },
  { nr: 6, datum: "2026-08-25", kz: "b3", quote: 2.96, ein: 100.00, gew: 299.92,
    foto: "photo_6_2026-09-17_03-24-21.jpg", beine: [
      ["Girona FC - UD Las Palmas", "Over 2,5 Total Goals", 1.85, "2026-08-29T21:30"],
      ["FC Viktoria Cologne - SC Preussen Munster", "Under 3,5 Total Goals", 1.60, "2026-08-30T19:30"]] },

  // ---------- 26.08.2026 ----------
  { nr: 7, datum: "2026-08-26", kz: "st", quote: 7.47, ein: 300.00, gew: 2239.56,
    foto: "photo_7_2026-09-17_03-24-21.jpg", beine: [
      ["AFC Ajax - Real Madrid CF", "AFC Ajax (1.5) Handicap", 1.76, ""],
      ["KAA Gent - FC Brügge", "FC Brügge 1x2", 1.76, ""],
      ["SE Palmeiras SP - Santos FC SP", "unentschieden oder Santos FC SP", 2.41, ""]] },
  { nr: 8, datum: "2026-08-26", kz: "st", quote: 7.62, ein: 300.00, gew: 2286.60,
    foto: "photo_8_2026-09-17_03-24-21.jpg", beine: [
      ["Eintracht Braunschweig - Hertha BSC", "über 2.5 Total", 1.68, ""],
      ["Rapid Wien - SK Sturm Graz", "Rapid Wien 1x2", 2.13, ""],
      ["SK Slovan Bratislava - MFK Zemplin Michalovce", "über 3.5 Total", 2.13, ""]] },
  { nr: 9, datum: "2026-08-26", kz: "iw", quote: 5.43, ein: 165.65, gew: 854.18,
    foto: "photo_9_2026-09-17_03-24-21.jpg", beine: [
      ["FC Universitatea Cluj - FC Petrolul Ploiesti", "Über 2.5", 1.85, "2026-08-28T20:00"],
      ["Stockport County FC - Wycombe Wanderers", "Über 2.5", 1.80, "2026-08-29T16:00"],
      ["Coquimbo Unido - Huachipato", "Coquimbo Unido, Tipp 1", 1.63, "2026-08-31T02:00"]] },
  { nr: 10, datum: "2026-08-26", kz: "b3", quote: 5.22, ein: 235.00, gew: 1278.67,
    foto: "photo_10_2026-09-17_03-24-21.jpg", beine: [
      ["FC Universitatea Cluj - ACS Petrolul 52 Ploiesti", "Over 2,5 Total Goals", 1.87, "2026-08-28T20:00"],
      ["Stockport County FC - Wycombe Wanderers", "Over 2,5 Total Goals", 1.77, "2026-08-29T16:00"],
      ["Coquimbo Unido - Huachipato", "Coquimbo Unido Match Result", 1.58, "2026-08-31T02:00"]] },
  { nr: 11, datum: "2026-08-26", kz: "iw", quote: 12.13, ein: 400.00, gew: 4608.45,
    foto: "photo_11_2026-09-17_03-24-21.jpg", beine: [
      ["Racing Santander - Elche CF", "Racing Santander, Tipp 1", 2.20, "2026-08-28T19:00"],
      ["Levante - Real Betis Balompie", "Real Betis Balompie, Tipp 2", 2.25, "2026-08-29T17:00"],
      ["Celta de Vigo - Athletic Bilbao", "Celta de Vigo, Tipp 1", 2.45, "2026-08-30T21:30"]] },
  { nr: 12, datum: "2026-08-26", kz: "iw", quote: 10.83, ein: 400.00, gew: 4113.59,
    foto: "photo_12_2026-09-17_03-24-21.jpg", beine: [
      ["FC Lorient - Troyes AC", "FC Lorient, Tipp 1", 1.90, "2026-08-29T20:45"],
      ["Paris FC - OGC Nizza", "Paris FC, Tipp 1", 2.15, "2026-08-30T15:00"],
      ["AS Monaco - Olympique Marseille", "Olympique Marseille, Tipp 2", 2.65, "2026-08-30T20:45"]] },
  { nr: 13, datum: "2026-08-26", kz: "iw", quote: 27.90, ein: 13.01, gew: 344.83,
    foto: "photo_13_2026-09-17_03-24-21.jpg", beine: [
      ["Servette FC - FC Luzern", "FC Luzern, Tipp 2", 3.60, "2026-08-29T18:00"],
      ["Young Boys Bern - FC Basel", "Asian Handicap Young Boys Bern (-1.5), Tipp 1", 2.50, "2026-08-29T20:30"],
      ["Cadiz CF - Valladolid", "Valladolid, Tipp 2", 3.10, "2026-08-30T19:00"]] },
  { nr: 14, datum: "2026-08-26", kz: "iw", quote: 14.69, ein: 255.60, gew: 3567.85,
    foto: "photo_14_2026-09-17_03-24-21.jpg", beine: [
      ["SC Austria Lustenau - WSG Tirol", "SC Austria Lustenau, Tipp 1", 2.35, "2026-08-28T19:30"],
      ["Grazer AK - Wolfsberger AC", "Grazer AK, Tipp 1", 3.05, "2026-08-29T17:00"],
      ["Jeju United FC - Daejeon Citizen FC", "Über 2.5", 2.05, "2026-08-30T12:30"]] },
  { nr: 15, datum: "2026-08-26", kz: "st", quote: 27.34, ein: 200.00, gew: 5468.40,
    foto: "photo_15_2026-09-17_03-24-21.jpg", beine: [
      ["Young Boys - Basel", "Young Boys (-1.5) Asian Handicap", 2.45, ""],
      ["Servette - Luzern", "Luzern 1x2", 3.60, ""],
      ["Cadiz - Real Valladolid", "Real Valladolid 1x2", 3.10, ""]] },
  { nr: 16, datum: "2026-08-26", kz: "iw", quote: 13.08, ein: 89.00, gew: 1105.83,
    foto: "photo_16_2026-09-17_03-24-21.jpg", beine: [
      ["RKS Rakow Czestochowa - HNK Hajduk Split", "RKS Rakow Czestochowa, Tipp 1", 2.20, "2026-08-27T19:00"],
      ["TSV Hartberg - SV Ried", "TSV Hartberg, Tipp 1", 2.90, "2026-08-30T17:00"],
      ["CD Universidad Catolica - CD O'Higgins", "CD Universidad Catolica, Tipp 1", 2.05, "2026-09-01T02:45"]] },
  // Achtung: dieselbe Kombination wie Nr. 16, aber ein ANDERER Einsatz.
  // Das sind zwei echte Wetten, kein Doppelfoto.
  { nr: 17, datum: "2026-08-26", kz: "iw", quote: 13.08, ein: 43.04, gew: 534.77,
    foto: "photo_17_2026-09-17_03-24-21.jpg", beine: [
      ["RKS Rakow Czestochowa - HNK Hajduk Split", "RKS Rakow Czestochowa, Tipp 1", 2.20, "2026-08-27T19:00"],
      ["TSV Hartberg - SV Ried", "TSV Hartberg, Tipp 1", 2.90, "2026-08-30T17:00"],
      ["CD Universidad Catolica - CD O'Higgins", "CD Universidad Catolica, Tipp 1", 2.05, "2026-09-01T02:45"]] },

  // ---------- 27.08.2026 ----------
  { nr: 18, datum: "2026-08-27", kz: "st", quote: 33.05, ein: 300.00, gew: 9916.26,
    foto: "photo_18_2026-09-17_03-24-21.jpg", beine: [
      ["Connah's Quay Nomads FC - Cambrian & Clydach Vale", "Cambrian & Clydach Vale 1x2", 5.80, "2026-08-28T20:45"],
      ["Caroline Springs George Cross FC - South Melbourne", "Caroline Springs George Cross 1x2", 4.10, "2026-08-29T07:00"],
      ["Heidelberg United FC - Bentleigh Greens", "Heidelberg United FC 1x2", 1.39, "2026-08-29T07:00"]] },
  { nr: 19, datum: "2026-08-27", kz: "iw", quote: 8.61, ein: 27.60, gew: 225.75,
    foto: "photo_19_2026-09-17_03-24-21.jpg", beine: [
      ["Kayserispor - Bursaspor", "Über 2.5", 2.10, "2026-08-29T18:00"],
      ["Oakland Roots SC - Orange County SC", "Oakland Roots SC, Tipp 1", 2.00, "2026-08-30T02:00"],
      ["FK Spartak 1918 Varna - Ludogorets 1945 Razgrad", "Unter 2.5", 2.05, "2026-08-30T18:00"]] },
  { nr: 20, datum: "2026-08-27", kz: "st", quote: 8.77, ein: 400.00, gew: 3508.33,
    foto: "photo_20_2026-09-17_03-24-21.jpg", beine: [
      ["Boca Juniors - Atletico Lanus", "Beide Mannschaften treffen: ja", 2.26, "2026-08-29T02:30"],
      ["Tochigi City FC - Jubilo Iwata", "über 2.5 Total", 1.97, "2026-08-29T11:00"],
      ["Kataller Toyama - Fujieda MYFC", "Kataller Toyama 1x2", 1.97, "2026-08-29T11:30"]] },
  { nr: 21, datum: "2026-08-27", kz: "st", quote: 7.48, ein: 400.00, gew: 2992.31,
    foto: "photo_21_2026-09-17_03-24-21.jpg", beine: [
      ["Al Ahli Doha SC - Lusail SC", "unter 3.5 Total", 1.69, "2026-08-28T16:15"],
      ["Cambridge United - Huddersfield Town", "unter 2.5 Total", 1.95, "2026-08-29T16:00"],
      ["CA Talleres de Cordoba - CA Central Cordoba SE", "Beide Mannschaften treffen: ja", 2.27, "2026-08-30T02:30"]] },
  { nr: 22, datum: "2026-08-27", kz: "iw", quote: 7.65, ein: 32.50, gew: 236.08,
    foto: "photo_22_2026-09-17_03-24-21.jpg", beine: [
      ["RFC Lüttich - FCV Dender EH", "FCV Dender EH, Tipp 2", 2.40, "2026-08-29T16:00"],
      ["Brackley Town FC - South Shields", "South Shields, Tipp 2", 1.77, "2026-08-29T16:00"],
      ["Bohemians Prag 1905 - Mlada Boleslav", "Über 2.5", 1.80, "2026-08-29T17:00"]] },
  { nr: 23, datum: "2026-08-27", kz: "b3", quote: 9.66, ein: 165.00, gew: 1665.35,
    foto: "photo_23_2026-09-17_03-24-21.jpg", beine: [
      ["RFC de Liege - FCV Dender EH", "FCV Dender EH Match Result", 2.30, ""],
      ["Kayseri - Bursa", "Over 2,5 Total Goals", 2.10, ""],
      ["FK Spartak Varna - PFC Ludogorets Razgrad", "Under 2,5 Total Goals", 2.00, ""]] },
  { nr: 24, datum: "2026-08-27", kz: "st", quote: 8.50, ein: 400.00, gew: 3400.49,
    foto: "photo_24_2026-09-17_03-24-21.jpg", beine: [
      ["SG Sonnenhof Großaspach - FC Ingolstadt", "über 2.5 Total", 1.73, "2026-08-29T14:00"],
      ["FC Lausanne-Sport - FC Zürich", "unter 3 Total", 1.89, "2026-08-29T18:00"],
      ["Dundee FC - St Johnstone FC", "St Johnstone FC 1x2", 2.60, "2026-09-02T20:45"]] },
  { nr: 25, datum: "2026-08-27", kz: "iw", quote: 5.29, ein: 26.81, gew: 134.73,
    foto: "photo_25_2026-09-17_03-24-21.jpg", beine: [
      ["Nishikori Kei - Sakamoto Rei", "Nishikori Kei, Tipp 1", 2.30, "2026-08-27T19:40"],
      ["Cannes - Le Puy Foot 43 Auvergne", "Über 2.5", 2.30, "2026-08-29T14:45"]] },
  { nr: 26, datum: "2026-08-27", kz: "st", quote: 9.02, ein: 275.00, gew: 2479.95,
    foto: "photo_26_2026-09-17_03-24-21.jpg", beine: [
      ["FC Yverdon-Sport - FC Wil 1900", "FC Yverdon-Sport 1x2", 1.67, "2026-08-28T19:30"],
      ["Cardiff Metropolitan University FC - Briton Ferry", "Briton Ferry 1x2", 3.00, "2026-08-28T20:45"],
      ["Tokyo Verdy - Kashima Antlers", "über 8.5 Gesamtanzahl Ecken", 1.80, "2026-08-29T12:00"]] },
  // ACHTUNG: Foto 27 zeigt EXAKT denselben Schein wie Foto 25 (gleiche
  // zwei Spiele, gleiche Quote, gleicher Einsatz, gleicher Gewinn), nur
  // spaeter am Tag fotografiert. Deshalb steht er hier mit doppelt: true
  // und ist in der Liste vorab NICHT angehakt. Wer ihn doch braucht,
  // hakt ihn an. Stillschweigend weggelassen wird nichts.
  { nr: 27, datum: "2026-08-27", kz: "iw", quote: 5.29, ein: 26.81, gew: 134.73,
    foto: "photo_27_2026-09-17_03-24-21.jpg", doppelt: 25, beine: [
      ["Nishikori Kei - Sakamoto Rei", "Nishikori Kei, Tipp 1", 2.30, "2026-08-27T19:40"],
      ["Cannes - Le Puy Foot 43 Auvergne", "Über 2.5", 2.30, "2026-08-29T14:45"]] },
  { nr: 28, datum: "2026-08-27", kz: "st", quote: 13.66, ein: 95.00, gew: 1297.63,
    foto: "photo_28_2026-09-17_03-24-21.jpg", beine: [
      ["Al-Riyadh SC - Neom SC", "unter 9.5 Gesamtanzahl Ecken", 1.96, "2026-08-28T17:50"],
      ["Wealdstone FC - Carlisle United", "Carlisle United 1x2", 2.02, "2026-08-28T20:45"],
      ["Kawasaki Frontale - JEF United Ichihara Chiba", "über 10.5 Gesamtanzahl Ecken", 3.45, "2026-08-29T12:00"]] },
  { nr: 29, datum: "2026-08-27", kz: "st", quote: 11.14, ein: 145.00, gew: 1614.84,
    foto: "photo_29_2026-09-17_03-24-21.jpg", beine: [
      ["Eintracht Braunschweig - Hertha BSC", "unter 10.5 Gesamtanzahl Ecken", 1.77, "2026-08-28T18:30"],
      ["Kawasaki Frontale - JEF United Ichihara Chiba", "über 9.5 Gesamtanzahl Ecken", 2.60, "2026-08-29T12:00"],
      ["Manchester United - Ipswich Town", "über 10.5 Gesamtanzahl Ecken", 2.42, "2026-08-30T17:30"]] },
  { nr: 30, datum: "2026-08-27", kz: "iw", quote: 20.43, ein: 13.84, gew: 268.55,
    foto: "photo_30_2026-09-17_03-24-21.jpg", beine: [
      ["Terengganu FC - Selangor FC", "Terengganu FC, Tipp 1", 3.80, "2026-08-28T15:00"],
      ["Morecambe FC - AFC Telford United", "Morecambe FC, Tipp 1", 2.15, "2026-08-28T20:45"],
      ["Truro City FC - Dagenham & Redbridge FC", "Truro City FC, Tipp 1", 2.50, "2026-08-29T16:00"]] },
  { nr: 31, datum: "2026-08-27", kz: "st", quote: 5.73, ein: 100.00, gew: 573.00,
    foto: "photo_31_2026-09-17_03-24-21.jpg", beine: [
      ["Tokyo Verdy - Kashima Antlers", "über 10.5 Gesamtanzahl Ecken", 3.00, "2026-08-29T12:00"],
      ["Manchester United - Ipswich Town", "über 9.5 Gesamtanzahl Ecken", 1.91, "2026-08-30T17:30"]] },

  // ---------- 28.08.2026 ----------
  { nr: 32, datum: "2026-08-28", kz: "st", quote: 13.12, ein: 400.00, gew: 5246.28,
    foto: "photo_32_2026-09-17_03-24-21.jpg", beine: [
      ["Istanbulspor AS - Fatih Karagümrük SK", "unter 2.5 Total", 1.90, "2026-08-29T18:00"],
      ["FC Slovan Reichenberg - FC Hradec Kralove", "über 2.5 Total", 3.90, "2026-08-30T15:00"],
      ["Wolfsberger AC - LASK", "LASK 1x2", 1.77, "2026-09-01T19:30"]] },
  { nr: 33, datum: "2026-08-28", kz: "st", quote: 1.90, ein: 100.00, gew: 190.00,
    foto: "photo_33_2026-09-17_03-24-21.jpg", beine: [
      ["Pittsburgh Riverhounds - Tampa Bay Rowdies", "unter 2.25 Total", 1.90, "2026-08-29T23:00"]] },
  { nr: 34, datum: "2026-08-28", kz: "iw", quote: 5.75, ein: 24.21, gew: 132.25,
    foto: "photo_34_2026-09-17_03-24-21.jpg", beine: [
      ["Tauro FC - CA Independiente de La Chorrera", "Tauro FC, Tipp 1", 2.50, "2026-08-29T03:30"],
      ["Falkirk FC - Glasgow Rangers", "Unter 2.5", 2.30, "2026-09-02T21:00"]] },
  { nr: 35, datum: "2026-08-28", kz: "st", quote: 3.98, ein: 400.00, gew: 1591.76,
    foto: "photo_35_2026-09-17_03-24-21.jpg", beine: [
      ["Ironi Kiryat Shmona FC - Ironi Tiberias", "Ironi Kiryat Shmona FC 1x2", 2.02, "2026-08-29T19:00"],
      ["Independiente Medellin - Llaneros FC", "Llaneros FC (1) Asian Handicap", 1.97, "2026-08-30T23:10"]] },
  { nr: 36, datum: "2026-08-28", kz: "st", quote: 7.96, ein: 400.04, gew: 3185.92,
    foto: "photo_36_2026-09-17_03-24-21.jpg", beine: [
      ["Melbourne City FC 2 - Green Gully Cavaliers", "Over 3.5 Asian Total", 2.00, ""],
      ["Bnei Sakhnin FC - Maccabi Petah Tikva FC", "Under 2.5 Asian Total", 1.81, ""],
      ["NK Celik Zenica - FK Velez Mostar", "NK Celik Zenica 1x2", 2.20, ""]] },
  { nr: 37, datum: "2026-08-28", kz: "st", quote: 9.19, ein: 400.00, gew: 3676.69,
    foto: "photo_37_2026-09-17_03-24-21.jpg", beine: [
      ["St Mirren - Motherwell", "Over 2.5 Asian Total", 1.94, ""],
      ["FK Kudrivka - FC Epitsentr Dunaivtsi", "FC Epitsentr Dunaivtsi 1x2", 2.30, ""],
      ["Holywell Town - Caernarfon Town FC", "Over 3.5 Asian Total", 2.06, ""]] },
  { nr: 38, datum: "2026-08-28", kz: "st", quote: 2.91, ein: 400.00, gew: 1162.80,
    foto: "photo_38_2026-09-17_03-24-21.jpg", beine: [
      ["Dalibor Svrcina - Mackenzie McDonald", "Mackenzie McDonald Winner", 1.90, ""],
      ["van Trijp, Danny - Dennant, Matthew", "Dennant, Matthew Winner", 1.53, ""]] },

  // ---------- FAELLT AUS DER REIHE ----------
  // Foto 1 traegt als einziges das Dateidatum 15.09.2026, nicht Ende
  // August. Es gehoert also NICHT zu den 25. bis 28. August. Es steht
  // hier mit dabei, aber vorab NICHT angehakt, damit es nicht
  // stillschweigend unter einem falschen Datum landet. Kennt Karam das
  // richtige Datum, traegt er es ein und hakt es an.
  { nr: 1, datum: "2026-09-15", kz: "st", quote: 1.95, ein: 400.00, gew: 780.00,
    foto: "photo_1_2026-09-17_03-24-21.jpg", ausserhalb: true, beine: [
      ["Grasshopper - Sion", "Over 9.5 Total Corners", 1.95, ""]] }
];

// Die Summe zur Kontrolle. Sie steht vor dem Anlegen auf dem Schirm,
// damit Karam sie gegen seine eigene Rechnung halten kann.
function altSumme(liste) {
  let ein = 0, gew = 0;
  for (const s of liste) { ein += s.ein; gew += s.gew; }
  return { anzahl: liste.length, einsatz: Math.round(ein * 100) / 100,
           gewinn: Math.round(gew * 100) / 100 };
}

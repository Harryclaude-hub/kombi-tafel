// ============================================================
// DATEN: die 73 Wetten aus den vier Fotos vom 24.08.2026
// (74 Zeilen abzueglich 1 Foto-Ueberlappung: Villefranche stand
//  am Ende von Bild 1 UND am Anfang von Bild 4)
// Reine Daten, keine Logik. Aenderungen hier, nirgendwo sonst.
//
// Felder:
//   id    : Bild.Zeile
//   von   : Tippgeber (klt / kafa / david)
//   an    : Anstoss als ISO-Text, "?" am Ende = Uhrzeit unbekannt
//   liga  : Wettbewerb
//   spiel : die zwei Namen
//   wette : Text wie im Foto
//   kat   : SIEG | TORE | ECKEN | BTTS | HTFT | DNB | TENNIS
//   s     : Reiter-Code: in welchem Reiter der App die Wette steckt
//           SIEG | ASIA | TORE | ECKEN | BTTS | HZ-END | DNB | TENNIS
//   o     : Optionen [Linie, Tabellenquote], sicherste zuerst
//   doppel: Kennung, wenn dasselbe Spiel mehrfach in der Liste ist
//   anKorrigiert: gesetzt, wenn die Foto-Zeit nachweislich falsch war.
//                 IMMER in UK-Zeit eintragen wie das Feld "an", der
//                 Zeitversatz wird danach genauso angewendet.
// ============================================================

// Saschas Tabelle laeuft in UK-Zeit (UTC+1), Karam sitzt in Oesterreich (UTC+2).
// Geprueft am 25.08.2026 an 7 Spielen gegen den Quotenvergleich, zwei davon
// zusaetzlich gegen eine unabhaengige UTC-Angabe: durchgaengig genau +1 Stunde.
// Beispiel: Norwich vs Burnley steht im Foto als 15:00, ist 14:00 UTC, also 16:00 bei dir.
// Die Tafel rechnet die Foto-Zeit deshalb um. Die Original-Ansicht zeigt weiter die Foto-Zeit.
// Stimmt der Versatz einmal nicht mehr: hier auf 0 setzen, sonst nichts aendern.
const ZEITVERSATZ_MINUTEN = 60;

const GEBUEHREN_TEILER = {   // echte Quote = Eingabe / Teiler
  iw: 1.05,   // Interwetten AT: 5 % Wettgebuehr, geprueft 24.08.2026
  bw: 1.00,   // Bwin uebernimmt selbst (seit Mai 2026)
  b3: 1.00,   // Bet365: kein Abzug
  st: 1.00    // Stake: kein Abzug (aber Krypto-Netzwerkgebuehr bei Auszahlung)
};

const WETTEN = [
// ---------- Bild 1 ----------
{id:"1.01", von:"klt", an:"2026-08-27T18:00", liga:"UEFA Conference League", spiel:"Inter Club d'Escaldes vs FC Drita", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.30]]},
{id:"1.02", von:"klt", an:"2026-08-27T17:00", liga:"UEFA Conference League", spiel:"Maccabi Tel Aviv vs FC Lugano", wette:"HOME (-0.5, 0)", kat:"SIEG", s:"ASIA", o:[["0",1.85],["-0.5",2.55]]},
{id:"1.03", von:"klt", an:"2026-08-25T10:30", liga:"Australia Cup", spiel:"Lions FC vs North Sunshine Eagles SC", wette:"OVER (2.5, 3, 3.5)", kat:"TORE", s:"ASIA", o:[["2.5",1.50],["3",1.90],["3.5",2.15]]},
{id:"1.04", von:"klt", an:"2026-08-28T19:45", liga:"First Division (IRL)", spiel:"University College Dublin vs Finn Harps", wette:"OVER 3.5", kat:"TORE", s:"TORE", o:[["3.5",2.10]]},
{id:"1.05", von:"klt", an:"2026-08-25T11:30", liga:"K League 1", spiel:"Jeju SK vs Pohang Steelers", wette:"OVER (2, 2.5)", kat:"TORE", s:"ASIA", o:[["2",1.78],["2.5",2.42]]},
{id:"1.06", von:"klt", an:"2026-08-25T01:15", liga:"Liga Profesional de Futbol", spiel:"CA Lanus vs Argentinos Juniors", wette:"CORNERS UNDER 8.5", kat:"ECKEN", s:"ECKEN", o:[["8.5",2.02]]},
{id:"1.07", von:"klt", an:"2026-08-29T00:00", liga:"Liga MX, Apertura", spiel:"CF Pachuca vs CD Guadalajara", wette:"AWAY -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.55]]},
{id:"1.08", von:"klt", an:"2026-08-29T19:45", liga:"Pro League (BEL)", spiel:"Oud-Heverlee Leuven vs Standard Liege", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.82]]},
{id:"1.09", von:"klt", an:"2026-08-29T18:00", liga:"Liga AUF Uruguaya", spiel:"Juventud de Las Piedras vs Deportivo Maldonado", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.10]]},
{id:"1.10", von:"klt", an:"2026-08-29T15:00", liga:"Scottish Premiership", spiel:"Kilmarnock vs Dundee United", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.74]]},
{id:"1.11", von:"klt", an:"2026-08-29T15:00", liga:"Championship", spiel:"Norwich City vs Burnley", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.57]]},
{id:"1.12", von:"klt", an:"2026-08-29T13:00", liga:"3. Liga", spiel:"MSV Duisburg vs FC Wuerzburger Kickers", wette:"UNDER 3.5", kat:"TORE", s:"TORE", o:[["3.5",1.65]]},
{id:"1.13", von:"klt", an:"2026-08-29T12:00", liga:"Chinese Super League", spiel:"Zhejiang vs Yunnan Yukun", wette:"OVER 3.5", kat:"TORE", s:"TORE", o:[["3.5",1.85]]},
{id:"1.14", von:"klt", an:"2026-08-29T11:15", liga:"Ekstraklasa", spiel:"Radomiak Radom vs KS Cracovia", wette:"AWAY -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.65]]},
{id:"1.15", von:"klt", an:"2026-08-26T00:20", anKorrigiert:"2026-08-27T00:20", liga:"Primera A (COL)", spiel:"America de Cali vs Junior Barranquilla", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",1.85]]},
{id:"1.16", von:"klt", an:"2026-08-26T23:00", liga:"Liga de Primera (CHI)", spiel:"Coquimbo Unido vs Universidad Catolica", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.87]]},
{id:"1.17", von:"klt", an:"2026-08-25T17:00", liga:"Liga 2 Casa Pariurilor", spiel:"AFC Unirea 04 Slobozia vs FC Metaloglobus Bucuresti", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.02]]},
{id:"1.18", von:"klt", an:"2026-08-27T19:00", liga:"UEFA Conference League", spiel:"AFC Ajax vs FC Sion", wette:"OVER 3.5", kat:"TORE", s:"TORE", o:[["3.5",2.15]]},
{id:"1.19", von:"klt", an:"2026-08-29T15:00", liga:"League Two", spiel:"York City vs Exeter City", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.88]]},
{id:"1.20", von:"klt", an:"2026-08-29T15:00", liga:"League Two", spiel:"Crawley Town vs Bristol Rovers", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.88]]},
{id:"1.21", von:"klt", an:"2026-08-29T13:45", liga:"Ligue 3", spiel:"FC Villefranche Beaujolais vs FC Rouen", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.05]]},

// ---------- Bild 2 ----------
{id:"2.01", von:"klt", an:"2026-08-29T11:00", liga:"J1 League", spiel:"Nagoya Grampus vs Fagiano Okayama", wette:"OVER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.25",1.88],["2.5",2.07]], doppel:"nagoya"},
{id:"2.02", von:"klt", an:"2026-08-24T22:45", liga:"Liga MX, Women, Apertura", spiel:"Atlante FC vs Toluca", wette:"UNDER 3.5", kat:"TORE", s:"TORE", o:[["3.5",1.90]]},
{id:"2.03", von:"klt", an:"2026-08-27T01:30", liga:"Copa Chile", spiel:"Colo-Colo vs Union Espanola", wette:"OVER (2.5, 2.75)", kat:"TORE", s:"ASIA", o:[["2.5",1.60],["2.75",1.83]]},
{id:"2.04", von:"klt", an:"2026-08-26T18:00", liga:"Norwegian 1st Division", spiel:"Odds BK vs Kongsvinger", wette:"OVER (3.5, 3.75)", kat:"TORE", s:"ASIA", o:[["3.5",1.74],["3.75",1.92]]},
{id:"2.05", von:"klt", an:"2026-08-26T17:00", liga:"Norwegian 1st Division", spiel:"Strommen IF vs Raufoss", wette:"UNDER (2.5, 3, 3.5)", kat:"TORE", s:"ASIA", o:[["3.5",1.61],["3",2.00],["2.5",2.46]]},
{id:"2.06", von:"klt", an:"2026-08-27T18:00", liga:"UEFA Conference League", spiel:"SK Brann vs PAOK", wette:"HOME (-0.5, 0.25)", kat:"SIEG", s:"ASIA", o:[["+0.25",1.79],["-0.5",3.00]], doppel:"brann"},
{id:"2.07", von:"klt", an:"2026-08-29T11:00", liga:"J1 League", spiel:"Urawa Red Diamonds vs Yokohama F. Marinos", wette:"OVER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.25",1.85],["2.5",2.05]]},
{id:"2.08", von:"klt", an:"2026-08-30T01:30", liga:"Liga Profesional de Futbol", spiel:"CA Talleres vs Central Cordoba", wette:"OVER (2, 2.25)", kat:"TORE", s:"ASIA", o:[["2",1.73],["2.25",2.35]]},
{id:"2.09", von:"klt", an:"2026-08-30T03:00", liga:"USL Championship", spiel:"Monterey Bay FC vs Sacramento Republic FC", wette:"AWAY -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",1.92]]},
{id:"2.10", von:"klt", an:"2026-08-30T20:15", liga:"SuperLiga Romaniei", spiel:"FCV Farul Constanta vs FC Botosani", wette:"OVER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.25",1.76],["2.5",2.02]]},
{id:"2.11", von:"klt", an:"2026-08-30T20:15", liga:"Besta deild karla", spiel:"Valur Reykjavik vs IA Akranes", wette:"AWAY (-0.5, 0.25)", kat:"SIEG", s:"ASIA", o:[["+0.25",1.90],["-0.5",2.90]]},
{id:"2.12", von:"klt", an:"2026-08-30T19:00", liga:"Czech First League", spiel:"AC Sparta Praha vs SK Slavia Praha", wette:"AWAY (-0.5, 0)", kat:"SIEG", s:"ASIA", o:[["0",1.94],["-0.5",2.57]]},
{id:"2.13", von:"klt", an:"2026-08-30T23:15", liga:"Liga Profesional de Futbol", spiel:"CA Independiente vs Gimnasia y Esgrima Mendoza", wette:"OVER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.25",1.97],["2.5",2.17]]},
{id:"2.14", von:"klt", an:"2026-08-30T17:30", liga:"Stoiximan Super League", spiel:"Aris Thessaloniki vs OFI Crete", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",1.70]]},
{id:"2.15", von:"klt", an:"2026-08-25T17:05", liga:"Saudi Pro League", spiel:"Abha vs Al-Khaleej", wette:"HOME (-0.5, 0)", kat:"SIEG", s:"ASIA", o:[["0",2.04],["-0.5",2.80]]},
{id:"2.16", von:"klt", an:"2026-08-25T02:00", liga:"Liga MX, Women, Apertura", spiel:"Atlas vs Tijuana", wette:"UNDER (2.5, 3)", kat:"TORE", s:"ASIA", o:[["3",1.80],["2.5",2.15]]},
{id:"2.17", von:"klt", an:"2026-08-25T18:30", liga:"South African Premier Division", spiel:"Orlando Pirates vs Sekhukhune United", wette:"OVER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.25",1.93],["2.5",2.18]]},

// ---------- Bild 3 ----------
{id:"3.01", von:"klt", an:"2026-08-24T20:15", liga:"Besta deild karla", spiel:"Breidablik Kopavogur vs Fram Reykjavik", wette:"AWAY (-0.5, 0)", kat:"SIEG", s:"ASIA", o:[["0",1.83],["-0.5",2.37]]},
{id:"3.02", von:"klt", an:"2026-08-24T18:00", liga:"LaLiga 2", spiel:"Celta Fortuna vs FC Andorra", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.95]]},
{id:"3.03", von:"klt", an:"2026-08-25T01:15", liga:"Liga Profesional de Futbol", spiel:"CA Talleres vs Rosario Central", wette:"BTTS YES", kat:"BTTS", s:"BTTS", o:[["yes",2.08]]},
{id:"3.04", von:"klt", an:"2026-08-27T00:00", liga:"Copa Betano do Brasil", spiel:"Internacional vs Gremio", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.67]]},
{id:"3.05", von:"klt", an:"2026-08-27T01:30", liga:"Copa Betano do Brasil", spiel:"Palmeiras vs Santos", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.92]]},
{id:"3.06", von:"klt", an:"2026-08-27T17:00", liga:"UEFA Conference League", spiel:"FK Jablonec vs Rangers", wette:"AWAY (-0.5, -0.25)", kat:"SIEG", s:"ASIA", o:[["-0.25",1.80],["-0.5",2.10]], doppel:"jablonec"},
{id:"3.07", von:"klt", an:"2026-08-27T18:00", liga:"UEFA Conference League", spiel:"Pafos FC vs Dinamo City", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.84]]},
{id:"3.08", von:"klt", an:"2026-08-27T19:00", liga:"UEFA Conference League", spiel:"FC St. Gallen 1879 vs FC Nordsjaelland", wette:"AWAY -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.42]], doppel:"stgallen"},
{id:"3.09", von:"klt", an:"2026-08-27T19:30", liga:"UEFA Conference League", spiel:"FK Austria Wien vs Sporting Braga", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.97]]},
{id:"3.10", von:"klt", an:"2026-09-02T23:00", liga:"Liga de Primera (CHI)", spiel:"Coquimbo Unido vs Universidad de Concepcion", wette:"UNDER (2.25, 2.5)", kat:"TORE", s:"ASIA", o:[["2.5",1.70],["2.25",2.00]]},
{id:"3.11", von:"klt", an:"2026-08-27T17:00", liga:"UEFA Conference League", spiel:"FK Jablonec vs Rangers", wette:"HTFT AWAY/AWAY", kat:"HTFT", s:"HZ-END", o:[["2/2",3.30]], doppel:"jablonec"},
{id:"3.12", von:"david", an:"2026-08-24T00:00?", liga:"Esp2", spiel:"Malaga vs Dep. La Coruna", wette:"DNB Dep. La Coruna", kat:"DNB", s:"DNB", o:[["0",2.10]]},
{id:"3.13", von:"klt", an:"2026-08-28T00:00?", liga:"Challenge League", spiel:"Etoile Carouge FC vs FC Rapperswil-Jona", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.12]]},
{id:"3.14", von:"klt", an:"2026-08-27T19:00", liga:"UEFA Conference League", spiel:"FC St. Gallen 1879 vs FC Nordsjaelland", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.62]], doppel:"stgallen"},
{id:"3.15", von:"klt", an:"2026-08-27T18:00", liga:"UEFA Conference League", spiel:"SK Brann vs PAOK", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.74]], doppel:"brann"},
{id:"3.16", von:"klt", an:"2026-08-24T16:45", liga:"TOPLYGA", spiel:"FK Transinvest vs Siauliai FA", wette:"OVER (2.5, 2.75, 3)", kat:"TORE", s:"ASIA", o:[["2.5",1.64],["2.75",1.79],["3",2.00]]},
{id:"3.17", von:"klt", an:"2026-08-27T19:00", liga:"UEFA Conference League", spiel:"HNK Rijeka vs FC Midtjylland", wette:"AWAY -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",2.37]]},
{id:"3.18", von:"klt", an:"2026-08-27T20:00", liga:"UEFA Conference League", spiel:"FK Partizan vs Getafe", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.98]]},

// ---------- Bild 4 ----------
// (Zeile "Villefranche vs Rouen" ist Foto-Ueberlappung mit Bild 1, Nr. 1.21, nicht doppelt aufgenommen)
{id:"4.02", von:"klt", an:"2026-08-29T11:00", liga:"J1 League", spiel:"Nagoya Grampus vs Fagiano Okayama", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.07]], doppel:"nagoya"},
{id:"4.03", von:"klt", an:"2026-08-29T17:30", liga:"Stoiximan Super League", spiel:"NPS Volos vs POT Iraklis", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.45]]},
{id:"4.04", von:"klt", an:"2026-08-28T23:30", liga:"Liga de Primera (CHI)", spiel:"Cobresal vs Palestino", wette:"HOME (-0.5, 0)", kat:"SIEG", s:"ASIA", o:[["0",2.20],["-0.5",3.00]]},
{id:"4.05", von:"klt", an:"2026-08-27T02:30", liga:"USL Championship", spiel:"New Mexico United vs Lexington SC", wette:"OVER 2.5", kat:"TORE", s:"TORE", o:[["2.5",1.82]]},
{id:"4.06", von:"klt", an:"2026-08-26T18:00", liga:"Norwegian 1st Division", spiel:"Moss FK vs Sogndal IL", wette:"UNDER (3.5, 3.75)", kat:"TORE", s:"ASIA", o:[["3.75",1.92],["3.5",2.04]]},
{id:"4.07", von:"klt", an:"2026-08-26T18:00", liga:"Norwegian 1st Division", spiel:"Haugesund vs Egersund", wette:"UNDER (3.5, 3.75)", kat:"TORE", s:"ASIA", o:[["3.75",2.00],["3.5",2.20]]},
{id:"4.08", von:"kafa", an:"2026-08-30T00:00?", liga:"Spain1", spiel:"Barcelona vs Rayo", wette:"Barcelona -1.75", kat:"SIEG", s:"ASIA", o:[["-1.75",1.80]]},
{id:"4.09", von:"kafa", an:"2026-08-24T00:00?", liga:"WTA", spiel:"Minnen vs Vandromme", wette:"Vandromme ML", kat:"TENNIS", s:"TENNIS", o:[["ML",2.20]]},
{id:"4.10", von:"kafa", an:"2026-08-24T00:00?", liga:"ATP", spiel:"Dedura vs Ferreira da Silva", wette:"Ferreira ML", kat:"TENNIS", s:"TENNIS", o:[["ML",2.10]]},
{id:"4.11", von:"kafa", an:"2026-08-24T00:00?", liga:"WTA", spiel:"Liu vs Watson", wette:"Liu ML", kat:"TENNIS", s:"TENNIS", o:[["ML",1.57]]},
{id:"4.12", von:"kafa", an:"2026-08-24T00:00?", liga:"WTA", spiel:"Havlikova vs Yaneva", wette:"Yaneva ML", kat:"TENNIS", s:"TENNIS", o:[["ML",1.57]]},
{id:"4.13", von:"kafa", an:"2026-08-24T00:00?", liga:"ATP", spiel:"Kouame vs Basavareddy", wette:"Kouame ML", kat:"TENNIS", s:"TENNIS", o:[["ML",2.00]]},
{id:"4.14", von:"kafa", an:"2026-08-24T00:00?", liga:"ATP", spiel:"Spencer vs Garin", wette:"Spencer ML", kat:"TENNIS", s:"TENNIS", o:[["ML",2.00]]},
{id:"4.15", von:"klt", an:"2026-08-25T19:45", liga:"Scottish Challenge Cup", spiel:"Forfar Athletic vs Formartine United FC", wette:"UNDER (2.5, 3, 3.5)", kat:"TORE", s:"ASIA", o:[["3.5",1.57],["3",1.80],["2.5",2.27]]},
{id:"4.16", von:"klt", an:"2026-08-28T19:45", liga:"National League", spiel:"Gateshead vs Sutton United", wette:"UNDER 2.5", kat:"TORE", s:"TORE", o:[["2.5",2.15]]},
{id:"4.17", von:"klt", an:"2026-08-25T19:45", liga:"Scottish Challenge Cup", spiel:"Airdrieonians vs Stirling Albion", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",1.95]]},
{id:"4.18", von:"klt", an:"2026-08-25T19:45", liga:"Scottish Challenge Cup", spiel:"Hamilton Academical vs Edinburgh City F.C.", wette:"HOME -0.5", kat:"SIEG", s:"SIEG", o:[["-0.5",1.87]]}
];

// Anmerkung: die kafa-Zeile "Branstine vs Ngou" war im Foto durchgestrichen
// (storniert) und ist deshalb absichtlich NICHT in dieser Liste.

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

// KARAMS REGEL (03.09.2026): die eingetippte Quote gilt UNGETEILT als
// die echte - auch bei Interwetten. Die fruehere Vorab-Teilung durch
// 1,05 lag oft daneben ("meistens falsch"). Die Gebuehr entsteht jetzt
// NUR noch rueckwaerts: Karam traegt den vom Anbieter angesagten
// Hoechstgewinn ins moeglich-Feld ein, und die Tafel rechnet
// Gebuehr = Einsatz x Quote laut Schein minus angesagter Gewinn
// (kombis.js gebuehrText/baueVerlaufsEintrag). Die Teiler-Mechanik
// bleibt stehen, falls je wieder ein Anbieter vorab teilen soll -
// dann hier UND in den zwei Kopien in verteiler.js aendern.
const GEBUEHREN_TEILER = {   // echte Quote = Eingabe / Teiler
  iw: 1.00,   // Interwetten AT: Eingabe gilt, Gebuehr kommt aus dem angesagten Gewinn
  bw: 1.00,   // Bwin uebernimmt selbst (seit Mai 2026)
  b3: 1.00,   // Bet365: kein Abzug
  st: 1.00,   // Stake: kein Abzug (aber Krypto-Netzwerkgebuehr bei Auszahlung)
  ad: 1.00    // Admiral (NEU 06.09.2026): Eingabe gilt, Gebuehr wie ueberall rueckwaerts
};

const WETTEN = [
  // LEER: die Wetten kommen jetzt komplett aus der Datenbank (kt_wetten,
  // via satzdaten.js). Diese Datei ist nur noch das Notrad fuer die
  // Grundeinstellungen (Zeitversatz, Gebuehren, Stufen).
];

// ============================================================
// FOTO-SAETZE: jede Foto-Lieferung ist ein eigener, strikt
// getrennter Ordner. Der Kombi-Bau mischt NIE ueber Saetze hinweg.
// Neue Lieferung: neuen Eintrag anlegen, neue Wetten bekommen
// satz:"<id>" und ids mit eigenem Praefix (z.B. "b-1.01").
// ============================================================
const SAETZE = [
];
// Alle bisherigen Wetten gehoeren zum ersten Satz:
WETTEN.forEach(w => { if (!w.satz) w.satz = "2026-08-24"; });

// Anmerkung: die kafa-Zeile "Branstine vs Ngou" war im Foto durchgestrichen
// (storniert) und ist deshalb absichtlich NICHT in dieser Liste.

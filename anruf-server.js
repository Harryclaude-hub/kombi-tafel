// ============================================================
// DER UMLEITUNGS-SERVER FUER ANRUFE (eine einzige Stelle)
//
// WOZU DAS DA IST
// Ein Anruf laeuft direkt von Geraet zu Geraet. Damit sich die
// beiden Geraete finden, fragen sie einen STUN-Server: "wie sehe
// ich von aussen aus?" Das reicht in fast jedem WLAN.
//
// In manchen Mobilfunknetzen und hinter strengen Firmen-Routern
// reicht es NICHT. Dann klingelt es, man hebt ab - und es kommt
// kein Ton an. Genau das ist Karam passiert.
//
// Fuer diese Faelle braucht es einen TURN-Server. Der leitet den
// Ton weiter, wenn der direkte Weg nicht zustande kommt.
//
// ES GIBT KEINEN BRAUCHBAREN GRATIS-TURN-SERVER OHNE ANMELDUNG.
// Getestet am 29.08.2026: openrelay.metered.ca, frueher der
// bekannteste offene Dienst, antwortet nicht mehr
// ("STUN host lookup received error", "400 TURN allocate error").
// Ein toter Eintrag ist schlimmer als keiner: jeder Anruf wartet
// dann erst neun Sekunden auf eine Antwort, die nie kommt.
// Deshalb steht hier standardmaessig NICHTS.
//
// SO TRAEGT MAN EINEN EIN (dauert ~5 Minuten, kostet nichts):
//   1. Auf metered.ca ein Gratis-Konto anlegen
//      (50 GB im Monat frei - das sind viele hundert Stunden reden).
//   2. Dort unter "TURN Server" die drei Angaben abschreiben:
//      Adresse, Benutzername, Passwort.
//   3. Sie unten zwischen die eckigen Klammern schreiben, Datei
//      speichern, hochladen. Fertig - fuer ALLE Freunde auf einmal,
//      niemand muss auf seinem Geraet etwas einstellen.
//
// IST DAS SICHER?
// Ja. Der Umleitungs-Server sieht die Daten nur verschluesselt:
// WebRTC verschluesselt Ton und Bild immer zwischen den Geraeten
// (DTLS-SRTP), das laesst sich nicht abschalten. Er kann also
// nicht mithoeren, nur weiterreichen.
// Dass Benutzername und Passwort hier offen stehen, ist bei TURN
// normal und unvermeidbar - jedes Programm im Browser muss sie
// mitliefern. Deshalb: ein eigenes Konto nur dafuer, kein Passwort
// wiederverwenden.
// ============================================================
"use strict";

// Hier hinein kommen die eigenen TURN-Server. Beispiel:
//
// window.KT_TURN = [
//   { urls: "turn:global.relay.metered.ca:80",
//     username: "HIER_BENUTZERNAME", credential: "HIER_PASSWORT" },
//   { urls: "turn:global.relay.metered.ca:443",
//     username: "HIER_BENUTZERNAME", credential: "HIER_PASSWORT" },
//   { urls: "turns:global.relay.metered.ca:443?transport=tcp",
//     username: "HIER_BENUTZERNAME", credential: "HIER_PASSWORT" }
// ];
//
// Solange die Liste leer ist, laufen Anrufe nur ueber STUN. Das
// klappt im WLAN fast immer und im Mobilfunknetz oft, aber nicht
// sicher. Die Selbstprobe in der Glocke sagt jederzeit, woran man ist.
window.KT_TURN = [];

// Die STUN-Server. Die sind wirklich gratis und ohne Anmeldung,
// und sie werden nur gefragt "wie sehe ich von aussen aus?" -
// es laeuft kein Ton darueber.
window.KT_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];

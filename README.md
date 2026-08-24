# Kombi-Tafel

Anzeige-Programm fuer die Wett-Tabelle vom 24.08.2026 (vier Fotos, 73 Wetten).

**Live:** https://harryclaude-hub.github.io/kombi-tafel/

## Was es tut

- Zeigt alle Wetten wie im Original-Tabellenblatt: eine Zeile pro Wette, sortiert nach Anstoss
- Kategorien-Filter: Sieg/Handicap, Tore, Ecken, BTTS, Halbzeit/Endstand, DNB, Tennis
- Vier Anbieter-Spalten (Interwetten, Bwin, Bet365, Stake) mit Eingabefeldern fuer Live-Quoten
- Interwetten-Eingaben werden automatisch durch 1,05 geteilt (5 % Wettgebuehr AT)
- Der beste ECHTE Wert wird gruen markiert, rechts steht die Ansage "Setzen bei"
- Eingaben bleiben im Browser gespeichert (localStorage, nur auf dem eigenen Geraet)
- Vergangene Spiele werden ausgeblendet, Doppel-Spiele sind markiert
- Suchfuehrer S1 bis S8: wo jede Wettart in jeder App zu finden ist

## Aufbau (Design von Funktion getrennt)

| Datei | Inhalt | Darf geloescht werden? |
|---|---|---|
| `daten.js` | die 73 Wetten und die Gebuehren-Teiler | nein (Daten) |
| `logik.js` | Rechnen, Sortieren, Anzeigen, Speichern | nein (Funktion) |
| `stil.css` | weiss/schwarz, gruen/rot nur mit Bedeutung | ja, jederzeit |
| `index.html` | Grundgeruest und Suchfuehrer-Texte | nein |

Kein Build, kein Server, keine Abhaengigkeiten. Datei oeffnen genuegt.

## Wichtig

Die Tabellenquote ist der Stand der Fotos. Live-Quoten aendern sich laufend und
muessen am Wetttag selbst eingetippt werden. Alle Angaben ohne Gewaehr.

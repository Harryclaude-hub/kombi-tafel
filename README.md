# Kombi-Tafel

Anzeige-Programm fuer die Wett-Tabelle vom 24.08.2026 (vier Fotos, 73 Wetten).

**Live:** https://harryclaude-hub.github.io/kombi-tafel/

## Was es tut

- Zeigt alle Wetten wie im Original-Tabellenblatt: eine Zeile pro Wette, sortiert nach Anstoss
- Kategorien-Filter: Sieg/Handicap, Tore, Ecken, BTTS, Halbzeit/Endstand, DNB, Tennis
- Vier Anbieter-Spalten (Interwetten, Bwin, Bet365, Stake) mit Eingabefeldern fuer Live-Quoten
- Interwetten-Eingaben werden automatisch durch 1,05 geteilt (5 % Wettgebuehr AT)
- Der beste ECHTE Wert wird gruen markiert, rechts steht die Ansage "Setzen bei"
- Begriffe-Kasten oben erklaert jeden Begriff aus den Fotos
- Anbieter-Filter: eine Website nach der anderen abarbeiten (Vorgabe-Zuweisung, wandert bei Live-Eingaben mit)
- Eingaben bleiben im Browser gespeichert (localStorage, nur auf dem eigenen Geraet)
- Vergangene Spiele werden ausgeblendet, Doppel-Spiele sind markiert
- Suchfuehrer S1 bis S8: wo jede Wettart in jeder App zu finden ist
- `original.html`: die vier Fotos eins zu eins als eine Tabelle (gleiche Spalten wie das
  Original-Excel, inkl. Meldezeit, beider Quoten-Spalten, der stornierten Zeile und der
  Foto-Ueberlappung; nichts gerechnet)
- Anbieter-Rang-Filter (Bester bis Viertbester): zeigt fuer jede Wette den Anbieter auf
  diesem Platz ihrer Rangliste, falls der beste Anbieter gerade nicht erreichbar ist

## Aufbau (Design von Funktion getrennt)

| Datei | Inhalt | Darf geloescht werden? |
|---|---|---|
| `daten.js` | die 73 Wetten und die Gebuehren-Teiler | nein (Daten) |
| `roh.js` | Meldezeiten und beide Quoten-Spalten, 1:1 wie die Fotos | nein (Daten) |
| `rohansicht.js` | Anzeige der Original-Tabelle | nein (Funktion) |
| `original.html` | Geruest der Original-Ansicht | nein |
| `logik.js` | Rechnen, Sortieren, Anzeigen, Speichern | nein (Funktion) |
| `stil.css` | weiss/schwarz, gruen/rot nur mit Bedeutung | ja, jederzeit |
| `index.html` | Grundgeruest und Suchfuehrer-Texte | nein |

Kein Build, kein Server, keine Abhaengigkeiten. Datei oeffnen genuegt.

## Wichtig

Die Tabellenquote ist der Stand der Fotos. Live-Quoten aendern sich laufend und
muessen am Wetttag selbst eingetippt werden. Alle Angaben ohne Gewaehr.

## Neue Fotos einpflegen (der Ablauf fuer die Zukunft)

Alle paar Tage kommen neue Fotos. Der Weg ist immer derselbe:

1. Fotos an Claude geben
2. Claude tippt die Zeilen ab und traegt sie in `daten.js` UND `roh.js` ein (nur diese zwei Dateien!)
3. Alte, gespielte Wetten koennen in `daten.js` geloescht oder stehen gelassen werden
   (vergangene blendet die Seite selbst aus)
4. `git add daten.js && git commit && git push`, die Seite aktualisiert sich in etwa
   einer Minute von selbst

Wenn ein Anbieter seine Gebuehrenregel aendert: nur `GEBUEHREN_TEILER` in `daten.js`
anpassen, nichts anderes.

## Nach jeder Aenderung: Versionsnummer hochzaehlen

In `index.html` und `original.html` haengt an jedem `.js`- und `.css`-Verweis ein
`?v=JJJJMMTT<buchstabe>`. Diese Nummer nach jeder Aenderung erhoehen, sonst laedt der
Browser die alte Datei aus dem Zwischenspeicher und die Seite bleibt leer oder veraltet.

```
python -c "import io,re; V='20260826a'; [io.open(p,'w',encoding='utf-8').write(re.sub(r'(src|href)=\"([a-z]+\.(js|css))(\?v=[^\"]*)?\"', r'\1=\"\2?v='+V+'\"', io.open(p,encoding='utf-8').read())) for p in ('index.html','original.html')]"
```

## Seiten

| Datei | Zweck |
|---|---|
| `index.html` | Die Kombi-Tafel: rechnen, filtern, Quoten eintragen |
| `original.html` | Die vier Fotos eins zu eins als Tabelle, nichts gerechnet |
| `schule.html` | Handbuch: alle Wettarten von Grund auf erklaert, Tafeln aus `schule.js` erzeugt |
| `kombis.html` | Kombi-Bau: fertige 3er-Scheine nach Mindestquote und Anbieter, mit Einsatz und Verlauf |

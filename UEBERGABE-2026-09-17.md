# Kombi-Tafel - Übergabe vom 17.09.2026

Stand am Ende dieses Tages: Fassung **`20260917v`**, Commit **`0c6eaaf`**,
alles committet und nach `origin/main` gepusht, Arbeitsbaum sauber.
**Ganz unten steht ein NACHTRAG vom Abend** (zweite Sitzung desselben
Tages, Fassungen k bis s) - der gehört mitgelesen, vor allem der neue
Ort der Test-Suiten und die neuen Fallen.

Dieser Text fasst **einen einzigen Arbeitstag** zusammen. Die Grundlagen des
Projekts stehen in **[UEBERGABE-GRUNDLAGEN.md](UEBERGABE-GRUNDLAGEN.md)** (Stand 11.09.; UEBERGABE.md ist seit 18.09. die kurze Startseite) -
lies die zuerst, wenn du das Projekt nicht kennst. Hier steht nur, was seitdem
passiert ist und was du daraus mitnehmen musst.

---

## 0. Auftrag für den nächsten Chat

Karam (17.09.2026): *„Es geht halt bei dem neuen Chat halt um Design, Funktionen
und Qualität. Der Buchhaltung und das Kombibaus."*

Also: **Buchhaltung** und **Kombi-Bau** - Aussehen, Funktionsumfang, Qualität.

### Und das hier ist nicht verhandelbar

> **Jede Änderung wird committet und nach `origin/main` gepusht.**
> Nicht am Ende, sondern nach jedem abgeschlossenen Stück.

Warum das ausdrücklich dasteht: die Seite läuft auf GitHub Pages. Was nicht
gepusht ist, existiert für Karam nicht - er arbeitet am Handy und am Rechner mit
der ausgelieferten Fassung, nicht mit deinem Arbeitsverzeichnis. Dazu gehört
**immer**:

```bash
node naechste-fassung.js --setzen
```

Das zieht die Cache-Marke `?v=…` in allen neun HTML-Dateien und im
`manifest.webmanifest` hoch. Ohne diesen Schritt lädt sein Browser die alten
Dateien, und er meldet „funktioniert nicht", obwohl der Code stimmt. Die Nummer
wird **nie** von Hand gewählt - das Skript leitet sie aus dem Git-Verlauf ab,
weil am 29.08. eine Nummer zweimal vergeben wurde und die Fehlersuche danach in
die völlig falsche Richtung lief.

**Rechne mit 1 bis 2 Minuten, bis GitHub Pages die neue Fassung ausliefert.**
Prüfst du sofort nach dem Push im Browser, siehst du noch die alte - das ist
kein Fehler. Gegenprobe: `document.querySelector('script[src*="mein.js"]')
.getAttribute('src')` muss die neue Nummer zeigen.

---

## 1. Wer Karam ist und wie er arbeitet

- Salzburger Webagentur-Inhaber, kein Entwickler. Er beschreibt, was er sehen
  will, nicht wie es gebaut wird.
- Er diktiert per Sprache. Erwarte Versprecher und Spracherkennungsfehler
  („Einsatz" statt „Eintrag", „isymmetrisch" statt „unsymmetrisch"). Lies auf
  die Absicht, nicht auf das Wort.
- Er ändert seine Meinung, und das ist in Ordnung. Am 16.09. wollte er *alle*
  Personen sehen („Ich habe nur 10 angezeigt, das kann ja nicht sein"), am 17.09.
  nur noch fünf. **Setz die Kehrtwende um, aber denk mit**, was sein
  ursprüngliches Problem war (siehe 3.5).
- **Antwortstil:** Antworten beginnen mit **„Passt, Karam."**, bei reinen
  Design-Aufgaben mit **„Jawohl, Chef."**. Keine Gedankenstriche im Fließtext.

### Seine Code-Regeln

1. **Keine stillen Fehler.** Geht etwas schief, steht es auf dem Schirm. Ein
   leeres Ergebnis muss sagen, *warum* es leer ist.
2. **Niemals nur über den Namen zuordnen.** Immer über eine Kennung (id).
3. **Logik genau einmal.** Gibt es die Funktion schon, wird sie benutzt. Eine
   zweite Stelle, die dasselbe rechnet, ist ein Fehler.
4. **Nichts löschen, sondern sichtbar stehenlassen** (der „sichtbare Resttopf").
5. **Zahlen auf einem zweiten Weg gegenrechnen.**
6. **Kommentare auf Deutsch**, im Kommentartext ohne Umlaute („moeglich",
   „waehlen"), in sichtbaren Texten mit. Kommentare erklären **warum**, nicht
   was, und zitieren Karam oft wörtlich mit Datum.
7. **Das Aussehen ist eine eigene, löschbare Schicht** ganz unten in `stil.css`,
   mit Kopfkommentar und Endmarke (`/* ---- ENDE … ---- */`).
8. Handy **und** Desktop müssen funktionieren.

---

## 2. Technische Fakten, die du sofort brauchst

| | |
|---|---|
| Aufbau | reines Browser-JS, **kein** Bundler, **kein** Framework, keine Imports |
| Dateien | flach in `C:\Users\Home\kombi-tafel`, per `<script src>` geladen |
| Repo | `Harryclaude-hub/kombi-tafel`, Branch `main` |
| Auslieferung | GitHub Pages → <https://harryclaude-hub.github.io/kombi-tafel/> |
| Backend | Supabase, Projekt `mqmevpyatjsambervgtu` |
| Karams Bereich | `e6819ce8-55c2-4beb-aebb-20c7442b3363` |
| Verschlüsselung | Ende zu Ende (`krypto.js`). Der Schlüssel entsteht aus Karams Passwort und liegt **nur in seinem Browser**. |

### Was die Verschlüsselung für dich bedeutet

- Das Feld `daten` eines Scheins ist verschlüsselt, die Spalten `ordner`,
  `nummer`, `stand`, `created_at` sind es **nicht**.
- Wer `daten` schreibt, nimmt **`supaScheinDatenSchreiben(id, key, daten)`**.
  `supaScheinAendern` verschlüsselt **nicht** - damit dürfen nur unverschlüsselte
  Spalten geschrieben werden.
- Vor dem Schreiben von `daten` den Schein **frisch** mit `supaScheinHolen(id)`
  holen. Schreibst du den Stand aus dem Seitenspeicher zurück, verlierst du jede
  Änderung, die inzwischen von einem anderen Gerät kam.
- **Kein Import von außen ist möglich.** Alles, was lesbare Scheine anlegt, muss
  in seinem angemeldeten Browser laufen.

### Die 0-Zeilen-Falle (teuer, kommt immer wieder)

Ein Supabase-`update`, das an RLS scheitert, sieht **genauso aus wie ein
erfolgreiches**: kein Fehler, keine Zeilenzahl. Deshalb hängt an jedem Schreiben
ein `.select("id")`, und du musst **beides** prüfen:

```js
if (r.error) { /* melden */ return; }
if (!r.data || !r.data.length) { /* melden: es wurde NICHTS geaendert */ return; }
```

Am 17.09. hatte `tuScheinOrdner` genau diese zweite Prüfung nicht und meldete
Erfolg, während die Kombination unverändert liegen blieb. Behoben.

---

## 3. Was an diesem Tag gebaut wurde

Neun Commits, in dieser Reihenfolge:

```
e0d214a  Die 38 alten Scheine vom 25. bis 28.08.2026 zum Eintragen
abe6a54  Alte Scheine: Ordner wird mit angelegt, und sie landen im August
c530316  Alte Scheine in Karams Ordner, und die aeltesten stehen unten
a5a44cb  Gesetzt-Liste: fremde Kombis ohne Wetten-Kennung raus aus jedem Ordner
5e79232  Kombi-Bau: Ordner oder Zeitraum, an einer Stelle und mit einem Satz dazu
2ba48a9  Spielsuche im Auswerten, und die Personenliste auf fuenf
bca2cc3  Falsch zugeordnete Kombinationen: abziehen, wiederfinden, zurueckgeben
7b721f8  Personen-Ansicht aufgeraeumt: zwei Kaesten raus, ein gleiches Feldraster
86d18a6  Buchungskasten: das Feldraster wurde auf eine Spalte gequetscht
```

### 3.1 Die 36 alten Fotoscheine sind eingetragen

Karam hatte 38 Fotos von Wettscheinen vom 25. bis 28.08.2026 geschickt. Alle 38
wurden einzeln abgelesen (Einsatz, Quote, möglicher Gewinn) und in
`altscheine.js` festgehalten - **abgelesen, nicht gerechnet**: bei Interwetten
geht eine Gebühr ab, bei Bet365 kommt ein Bonus dazu, und der Schein zeigt die
Wahrheit des Anbieters.

Angelegt wurden **36**. Zwei bewusst nicht: Nr. 27 ist dasselbe Foto wie Nr. 25,
Nr. 1 trägt als Dateidatum den 15.09. und gehört nicht in den Zeitraum. Beide
stehen weiter zum Anhaken da.

Ergebnis, nach dem Neuladen aus der Datenbank gegengeprüft:

- 232 Scheine gesamt (vorher 196), davon 36 neue
- alle im Ordner `2026-08-25-bis-28`, **ohne Person**, alle auf `offen`
- jeder mit seinem eigenen Foto, zugeordnet über den Dateinamen
- Einsatz zusammen **7.504,43 €**, möglicher Gewinn **73.527,71 €**
- Stake 17, Interwetten 16, Bet365 3
- Tage: 25.08. → 5, 26.08. → 11, 27.08. → 13, 28.08. → 7

Wichtig für `supa.js`: `supaScheinAnlegen` hat einen **letzten Parameter
`wann`** bekommen, der `created_at`/`updated_at` setzt. Ohne ihn lägen alle
alten Scheine unter dem heutigen Tag, und Buchhaltung, Tagesübersicht und
Auswerten filtern darüber.

**Hinweis für später:** die Beine dieser 36 Scheine haben **keine
Wetten-Kennung** (`t.id`), weil ihre Spiele nur auf dem Foto stehen und es keine
Zeile in `kt_wetten` dazu gibt. Das ist die Ursache von 3.2 und wird dir wieder
begegnen.

### 3.2 Der Fehler mit den „40 Kombis" - der wichtigste des Tages

Karam: *„Ich habe jetzt neue Kombis gestartet auf einem Folder mit sieben
Einsätzen. Und das Problem ist, ich habe auf einmal so richtig viele Kombis, so
fast 40 Kombis noch da, und ich weiß nicht warum."*

In seinem Browser gemessen: Ordner 17.09. mit 7 Wetten, aber **38 Zeilen** in
der Gesetzt-Liste, davon passten **0** zur Tabelle.

Ursache in `kombis.js`, `zeichneGesetzte()`:

```js
if (!mitId.length) return true;   // keine Wetten-Kennung -> IMMER zeigen
```

Gemeint waren die von Hand angelegten und die unlesbaren Kombinationen. Solange
es zwei davon gab, fiel es nicht auf. Mit den 36 Fotoscheinen aus 3.1 wurden es
38 - **in jedem Ordner**.

Behoben: ohne Kennung entscheidet jetzt der **Ordner** (`eintragImOrdner`), und
der ist selbst eine Kennung. Vier Fälle bleiben ausdrücklich sichtbar, damit
nichts Gesetztes verschwindet und zweimal gesetzt wird:

- unlesbare Scheine
- Kombis von Hand (`satz` ist dort `""`)
- Ordner noch nicht geladen (`aktiverSatzId()` ist `null`)
- ein Ordner, den es in `SAETZE` nicht gibt

> **Die Falle, die dich sonst erwischt hätte:** der naheliegende Rückfall auf den
> **Zeitraum** ist falsch. `ebZeitPasst` fragt in seiner **ersten Zeile**
> `ebNurOffen` ab, und das steht auf `true`. 30 der 38 Scheine wären
> verschwunden, sobald Karam irgendein Datum tippt - **auch bei genau dem
> Zeitraum, der sie treffen soll.** Drei unabhängige Prüfer haben den ersten
> Entwurf daran zerlegt.

Gegenrechnung an echten Daten, in allen vier Ansichten: sichtbares Geld plus
ausgeblendetes Geld ergibt **68.208,27 €** - dieselbe Zahl, die das Auswerten
als Umsatz zeigt.

An **jeder** Stelle steht jetzt, wie viele ausgeblendet sind, wie viel Geld das
ist und **warum** (drei verschiedene Gründe, drei verschiedene Sätze - ein
falscher Grund ist schlimmer als gar keiner, weil man ihm nachgeht).

Nebenbei: die Farben der Gesetzt-Liste kamen aus der bereits gefilterten Liste
und wechselten bei jeder Filterung. Jetzt dieselbe Farbliste wie die Bau-Tabelle.

### 3.3 Kombi-Bau: Ordner oder Zeitraum

Neuer Kasten `#ordnerwahl` über der Bau-Tabelle, gezeichnet von
`zeichneOrdnerWahl()` in `kombis.js`. Drei Reiter: der offene Ordner (Vorgabe),
ALLE Ordner, Zeitraum. Darunter **immer ein ganzer Satz**, was gerade gilt.

Der Zustand wird **abgeleitet**, nicht zusätzlich gespeichert (`owLage()` liest
`kt_satz` und die beiden Datumsfelder). Ein eigener gespeicherter Modus könnte
dem widersprechen, was die Tabelle wirklich zeigt.

Der Zeitraum **überstimmt** den Ordner nur, er ändert `kt_satz` nie. `owZeitWeg()`
bringt ihn zurück und lässt „nur noch offene Spiele" bewusst stehen - das ist
eine eigene Entscheidung von Karam und darf nicht stillschweigend mitkippen.

Die Datumsfelder stehen jetzt **nur noch dort**. Zwei Felder mit derselben
Kennung wären ein Fehler, den niemand sieht: `getElementById` nimmt immer das
erste.

Die Ordnersuche liegt **einmal** in `logik.js` (`satzPasst` / `satzSuchtext`) und
wird von der Ordnerleiste und vom Kombi-Bau benutzt. Dabei ein Altfehler
behoben: die Suche in der Ordnerleiste war groß-/kleinschreibungsempfindlich,
„fotos" fand nichts und „Fotos" fand alles. Live geprüft: `25.08`, `2508`,
`2026-08`, `17.09` und `FOTOS` finden alle das Richtige.

**Geldrisiko benannt:** sobald mehr als ein Ordner auf dem Schirm ist, kann eine
Kombination unbemerkt aus zwei Ordnern gebaut werden. Stehen Haken aus mehreren
Ordnern, sagt der Kasten das ausdrücklich.

### 3.4 Auswerten: Spielsuche

Suchfeld links unter den Zeitraum-Angaben, in der Fläche, die neben dem hohen
Filterkasten leer war.

Der Filter sitzt in **`awGefiltert()`**, in derselben Stufe wie Person und
Anbieter. Das ist der Kern:

- eine Stufe tiefer (`awScheine`) zeigten die Summenkacheln Umsatz und Gewinn
  für den ganzen Zeitraum, während darunter sieben Kombinationen stehen
- eine Stufe höher (`awImZeitraum`) sprängen die Personen- und Anbieter-Chips
  bei jedem Tastendruck in Anzahl und Reihenfolge

Beide Seiten laufen durch dieselbe Verhärtung (`awNorm` → `awHart`: klein, ß→ss,
Diakritika weg, dann ae/oe/ue → a/o/u). An echten Daten geprüft:
`münster`/`muenster`/`munster` finden alle dieselben 3, `Preußen`/`preussen` 3,
`Zürich`/`zuerich` 5, `Köln`/`koln` 6.

**Nicht lesbare Kombinationen werden nie weggesucht** - sie haben keinen Text,
der treffen könnte, und ihr Einsatz darf nicht aus Umsatz und Gewinn fallen.

Getippt wird nur Liste, Summe und Standzeile neu gezeichnet, nicht die ganze
Ansicht (sonst ist das Feld nach dem ersten Buchstaben weg - dieselbe Falle wie
bei `obSuchen` in `mein.js`).

### 3.5 Personen auf fünf

Karam: *„Es sollen nur fünf angezeigt werden, die fünf aktuellsten."*

Die Zahl lag **zweimal** im Code: fünf im Kombi-Bau, zehn in Mein Bereich. Jetzt
einmal, als `PERSONEN_OBEN = 5` in `logik.js`.

**Ein neuer Schlüssel, nicht nur eine neue Vorgabe.** Am 16.09. wurde die
Vorgabe auf „alle" gedreht; auf Karams Gerät steht `kt_ob_kurz` deshalb längst
auf einem Wert. Nur die Vorgabe umzudrehen hätte bei ihm **gar nichts** geändert
- die Arbeit wäre unsichtbar geblieben. Neuer Schlüssel: `kt_ob_ansicht`.
Solange er fehlt, steht ein einmaliger Satz dazu da.

**Zwei Fälle überleben die Kürzung**, auch wenn sie hinten stehen: die gerade
geöffnete Person, und jede Person mit einem **offenen Rechenfehler**. Sonst
liest Karam „irgendwo ist ein Rechenfehler" und kann die Person nicht anklicken.
Live sind das **11 von 29** - 5 aktuellste plus 6 mit Rechenfehler. Die sechs
wären sonst unsichtbar geworden.

### 3.6 Falsch zugeordnete Kombinationen

Karam: *„Es kann gut sein, dass ich vielleicht der Person einen falschen Verlauf
hinzugefügt habe. Man klickt dann drauf und schreibt: diese Kombi ist nicht bei
dieser Person."*

Knopf **„nicht diese Person"** in der großen Tabelle unter der Personen-Auswahl.
Bewusst **nicht** in `personKnopfM` - das ist der geteilte Chip für alle
Tabellen, ein Schreibknopf hat dort nichts verloren.

**Kein echter Ordner.** Ein echter `kt_ordner` hätte wieder ein Guthaben und
eine Kasse, und das Geld läge nur woanders falsch. Es ist ein Zustand am Schein:
keine Person mehr, dazu `daten.personWeg = { id, name, wann }`.

**Zwei Schreibvorgänge, Reihenfolge ist Absicht:** erst der Vermerk
(verschlüsselt), dann `ordner = null`. Geht der zweite Schritt schief, ist der
Schein markiert, hängt aber noch an seiner Person - sichtbar falsch, aber kein
Geld verschoben. Andersherum wäre er ohne Person **und** ohne Vermerk, also
unauffindbar.

Die Bestätigung nennt Nummer, Einsatz und die Kasse der Person vorher/nachher,
gerechnet mit `personPruefen` - **derselben** Funktion, die auch die Kasse
rechnet.

„Ohne Person" und „Falsch zugeordnet" sind zwei getrennte Töpfe, sonst fordert
die Seite weiter auf, genau das zuzuordnen, was Karam absichtlich nicht
zuordnet. Die Zahl wird auf zwei Wegen gezählt; weicht sie ab, steht das auf dem
Schirm.

Im Auswerten gibt es dafür einen eigenen Chip (`awPersonFach`, `AW_LOS = "weg"`).

**Altlast dabei behoben:** die Filterkette der großen Tabelle stand **zweimal**
im Code (`zeichneBereich` und `tuAnbieterFilter`). Ein dritter Wert wäre in der
einen Liste angekommen und in der anderen nicht. Jetzt `scheineNachOrdnerFilter`.

### 3.7 Personen-Ansicht aufgeräumt

- Die Kästen **„Personen abgleichen"** und **„Die 38 alten Scheine"** sind aus
  der Ansicht raus. Die drei Dateien (`personen-import.js`, `altimport.js`,
  `altscheine.js`) sind **nicht gelöscht**, sie werden nur nicht mehr geladen;
  oben in jeder steht, wie man sie zurückholt.
- **Person zuerst, dann ihre Kombinationen.** Dazwischen stand „Konto dieses
  Bereichs". Es wird nicht versteckt, sondern ans Ende gesetzt, solange ein
  Filter offen ist (`kontoBereichEinordnen()`).
- **Ein gleiches Feldraster** (`.feldraster` / `.feld` / `.feld-titel`) für
  Personendaten und Buchungsformular. Vorher ein umbrechender Fluss mit
  `flex: 1 1 220px; max-width: 320px` - jede Zeile teilte den Platz anders auf.
  Jetzt `grid-template-columns: repeat(auto-fill, minmax(230px, 1fr))`.

> **`auto-fill` statt `auto-fit` ist Absicht.** Bei `auto-fit` fallen leere
> Spalten weg und das letzte Feld einer Zeile zieht sich auf die volle Breite -
> genau der Effekt, den Karam „unsymmetrisch" nennt.

Die Beschriftung steht in einem eigenen Element statt hinter einem `<br>`: nur
so beginnen alle Eingabefelder auf derselben Höhe, auch wenn ein Titel
zweizeilig wird.

Gemessen im Browser: Personendaten 9 Felder à **231 px**, Spalten bei
30/277/523/770/1016/1263 (Abstand exakt 246,5), jede Eingabe **38 px** hoch.
Buchung 5 Felder à **275 px**, Spalten 42/333/624/915/1206.

---

## 4. Die Fallen, die diesen Tag gekostet haben

Diese Liste ist der eigentliche Wert dieser Übergabe. Jede davon hat echt
zugeschlagen.

1. **`ebNurOffen` in `ebZeitPasst`** (siehe 3.2). Die Funktion heißt „passt zum
   Zeitraum" und filtert in ihrer ersten Zeile etwas ganz anderes mit. Wer sie
   für gesetzte Kombinationen wiederverwendet, verliert 30 Scheine.
2. **`display: flex` frisst ein Grid.** `.kassenformular` war noch flex aus der
   Zeit der Inline-Zeile. Mein neues Raster wurde flex-Kind und schrumpfte von
   1463 auf **261 Pixel**, also auf eine Spalte. **Im Code sah alles richtig
   aus.** Gefunden nur durch Messen im echten Browser.
3. **Toter Code, der wie der Hauptplatz aussieht.** `kombiUebersichtHtml`
   (`mein.js:1908`) wird im ganzen Projekt **nie aufgerufen**. Der „falsche
   Person"-Knopf wäre dort nie erschienen - ohne Fehler, ohne Meldung.
4. **Ein `localStorage`-Schlüssel, der schon einen Wert hat.** Eine geänderte
   Vorgabe ändert auf Karams Gerät nichts. Neuer Schlüssel plus einmaliger Satz.
5. **Alte Tests halten altes Verhalten fest.** Drei Suiten mussten umgeschrieben
   werden, weil Karam seine Meinung geändert hat (u. a. „alle 27 Personen
   werden gezeigt"). Ein roter Test ist nicht automatisch ein Fehler im Code.
6. **Dateien sind CRLF**, und der Bash-Heredoc frisst Backslashes. Mehrzeilige
   Anker in `node -e` treffen nicht. **Lösung:** Patch-Skripte mit dem
   Write-Tool in eine Datei schreiben und die ausführen, nicht durch die Shell
   reichen. Anker immer einzeilig, danach mit `grep -n` gegenprüfen.
7. **GitHub Pages braucht 1 bis 2 Minuten.** Sofortiges Prüfen zeigt die alte
   Fassung.
8. **Die große Seite ist träge.** `mein.html` mit 232 Scheinen samt Fotos
   braucht 20 bis 40 Sekunden bis `kasseScheine` steht. Warte, bevor du misst - ein
   zu früh gelesener Zustand sieht aus wie ein Fehler.

---

## 5. Prüfungen

Die Test-Suiten liegen **nicht** im Repo, sondern im Scratchpad dieser Sitzung:

```
C:\Users\Home\AppData\Local\Temp\claude\C--Users-Home-kombi-tafel\
  098af9e3-b78a-4412-a1f5-b05d40a73539\scratchpad\t_*.js
```

**21 Suiten, 19 laufen grün.** Sie laden die **echten** Dateien per `eval` in
eine gestellte Browser-Umgebung - kein Nachbau der Logik. Ausführen:

```bash
cd "<scratchpad>" && for f in t_*.js; do node "$f" | tail -1; done
```

Heute neu dazugekommen: `t_gesetzt.js`, `t_wahl.js`, `t_suche.js`, `t_weg.js`,
`t_raster.js`.

`t_logik.js` muss aus `C:\Users\Home\kombi-tafel` heraus laufen (relative Pfade),
`t_export.js` und `t_xlsx.js` brauchen eine Datei als Argument. Das ist alt und
kein Fehler.

> **Tests allein reichen hier nicht.** Falle 2 oben war in jedem Test grün. Was
> aussehen soll, muss im Browser **gemessen** werden:
> `getBoundingClientRect()` über die Felder, dann Breiten, Höhen und linke
> Kanten vergleichen.

---

## 6. Was offen ist

- **Karam macht heute die Buchhaltung fertig** und setzt danach neue Kombis.
  Kommen Rückfragen zu Zahlen, sind sie vermutlich echt.
- **Anbieter-Logos** fehlen weiter: er wollte PNGs in `logos/` legen, hat es
  noch nicht getan.
- **Texterkennung je Anbieter trainieren** wurde als eigenes Vorhaben genannt,
  nie begonnen.
- **Die Fotos der 36 alten Scheine liegen doppelt**: einmal als Ordnerbilder
  (von Karam hochgeladen), einmal am jeweiligen Schein. Stört nichts, kostet
  Platz. Er weiß davon.
- **Die Verschlüsselung bleibt.** Karam hat am 17.09. gesagt, sie sei ihm „egal"
  und dürfe aufgehoben werden - aber ausdrücklich unter der Bedingung, dass sie
  sonst „sehr viel Aufwand" macht. Das war nicht der Fall, also wurde sie
  **nicht** angefasst. Wenn das kommt, ist es eine eigene, bewusste Aufgabe.
- **Sicherheitshinweis:** Karam hat im Chat sein Konto-Passwort geschrieben. Es
  wurde nicht benutzt und steht in keiner Datei. Er sollte es ändern.

---

## 7. Der erste Schritt im neuen Chat

1. `git log --oneline -10` und `git status` - es muss `86d18a6` und sauber sein.
2. `UEBERGABE.md` (Startseite) lesen, dann `UEBERGABE-GRUNDLAGEN.md`, dann diese Datei.
3. Die Suiten einmal laufen lassen, damit du den grünen Ausgangspunkt kennst.
4. Erst dann anfangen. Und **nach jedem fertigen Stück**:
   `node naechste-fassung.js --setzen`, committen, pushen.

---
---

# NACHTRAG vom Abend des 17.09.2026 (zweite Sitzung, k bis s)

Neuer Stand: Fassung **`20260917s`**, Commit **`bea17f7`**, alles gepusht,
live gegengeprüft. Der Prüf-Punkt oben ("es muss 86d18a6 sein") gilt
nicht mehr - jetzt muss es `bea17f7` sein.

## Die Test-Suiten sind UMGEZOGEN

```
C:\Users\Home\AppData\Local\Temp\claude\C--Users-Home-kombi-tafel\
  adca38dc-097a-40c8-b5bf-c78d5823db52\scratchpad\t_*.js
```

Alle alten Suiten wurden dorthin kopiert und dort weitergepflegt.
**28 Dateien, alle grün.** Neu dazugekommen: `t_awpersonen.js`,
`t_awzuordnen.js`, `t_tafelweg.js`, `t_bilder.js`, `t_bloecke.js`,
`t_anbid.js`. Wie gehabt: `t_logik.js` aus dem Repo-Ordner starten,
`t_export.js`/`t_xlsx.js` brauchen eine Datei als Argument.

## Was der Abend gebaut hat (je ein Commit, k bis s)

- **k** Auswerten: Schalter **gewonnen/verloren** neben dem Zeitraum
  (statt des Hakens "nur die noch offenen"; alter Geräte-Wert wird über
  den neuen Schlüssel `kt_aw_zeig` übersetzt). Dazu 0-Zeilen-Wachen in
  `awStand`/`awEcht` nachgezogen.
- **l** Auswerten: Personen-Kurzliste (ABENDS WIEDER GEKIPPT, siehe s).
- **m** Auswerten: **dritter Ausgang in Orange** - "nicht zur Gänze
  gewonnen". KEIN eigener Stand: `stand=gewonnen` + `echt_zurueck` in
  EINEM Schreibvorgang; orange ist die Sichtbarkeit der Abweichung vom
  Möglich-Wert. Das "gekommen"-Feld ist jetzt `type=text
  inputmode=decimal` (Komma-Falle).
- **n** Auswerten: **Person direkt an der Karte** suchen und zuordnen.
  Der EINE Schreibweg heißt jetzt `scheinOrdnerSchreiben` (mein.js),
  `tuScheinOrdner` und `awPersonZuordnen` teilen ihn. "Nicht diese
  Person" ruft `tuPersonWeg` weiter.
- **o** Kombinationen: **Ergebnisse-Eingabetafel aus** über den Schalter
  `ERG_TAFEL_AN = false` in ergebnisse.js (Code komplett da, eine Zeile
  Selbstsuche-Bilanz bleibt sichtbar). In der Tabelle: Verlust als roter
  Betrag statt Strich, orange Marke aus DERSELBEN Funktion
  `awTeilGewinn`, rote Differenzzeile heißt neutral "weniger als
  möglich" (nicht mehr "Gebühren").
- **p** Kombi-Bau: in der Gesetzt-Liste sind **anwesende Einsätze
  markiert** (nur über die Wetten-Kennung), Zähl-Marke "2 von 3 aus
  dieser Tabelle", Klick springt per `gsZuWette` zur Zeile (orange
  Blitz-Umrandung, 4 s).
- **q** **Bilder erst beim Zeigen**: `supaScheineLaden` lädt OHNE die
  foto-Spalte (Spaltenliste aus einer Probezeile; zweite leichte
  Abfrage markiert `fotoDa`). `fotoBildHtml` in mein.js ist der EINE
  Bild-Erzeuger (Tabelle, Personen-Kasse, Kombi-Konto, Auswerten),
  lädt höchstens 3 gleichzeitig nach, Fehlschlag = Nochmal-Knopf mit
  Grund. Export-ZIP lädt fehlende Bilder mit Fortschritt nach,
  Foto-Nachtrag zählt `fotoDa` nicht als "fehlt" (hätte echte Bilder
  überschrieben!), tuKopieren holt das Bild vor dem Kopieren.
- **r** **Blockweises Zeichnen**: Auswerten 150er-, große Tabelle und
  Gesetzt-Liste 200er-Blöcke. Gezählt/gesucht/summiert wird IMMER über
  alles; jeder Schnitt steht mit Zahl und zwei Knöpfen da.
- **s** Vier Stücke: (1) Suche bei 10.000 von 636 ms auf **26 ms** je
  Anschlag (Suchtext-Speicher `_suchtext` am Schein; awGefiltert bekommt
  die Basis hereingereicht, Marke `_istGefiltert` schützt die Summen).
  (2) Personen-Kasten im Auswerten: **ALLE Personen, zwei Reihen, quer
  scrollen** (Karams Kehrtwende vom Abend; gelöschte, aber gewählte
  Kennungen bleiben als Chip sichtbar - Resttopf). (3) **Anbieter-ID**:
  `daten.anbieterId` (VERSCHLÜSSELT), Zeile steht IMMER da ("keine"
  ist eine Aussage), eintippbar im Auswerten (frisch holen ->
  `supaScheinDatenSchreiben`) und an der Bau-Karte (`sid_`-Feld ->
  `baueVerlaufsEintrag`), durchsuchbar. (4) **Logos**: die sieben
  offiziellen Seiten-Symbole liegen in `logos/` (Karams ausdrücklicher
  Wunsch, Herkunft in LIESMICH.txt), Name steht NEBEN dem Logo,
  ak-Karten tragen ihr Symbol per CSS; dazu die Qualitätsschicht
  (Kontrast, Tabellenköpfe, Fokusringe, Touch-Höhen).

## Neue Fallen dieses Abends

1. **Unteragenten können am Sitzungs-Limit sterben.** Ein 8-Agenten-
   Workflow ist komplett mit "session limit" gescheitert - Hauptlauf
   lief weiter. Erst prüfen, dann delegieren.
2. **`getElementById`-Fakes zerlegen kein HTML.** `zeichneAuswerten`
   schreibt in `#auswerten`; der gestellte `#aw_liste`-Knoten bleibt
   leer. Im Test dort lesen, wo wirklich geschrieben wird.
3. **Verstecktes Fenster = eingefrorene Screenshots.** Die Browser-
   Vorschau liefert leere Bilder, wenn das Pane verdeckt ist. Messen
   mit `getBoundingClientRect`/`getComputedStyle`, nicht mit Bildern.
4. **`.aw-keinbild .mini` sah aus wie der Kontrast-Fehler.** Der blasse
   Wert kam vom Platzhalter, nicht von der .mini-Regel - erst die
   RICHTIGE Stelle messen, dann urteilen.
5. **Quelltext-Anker in Suiten reißen bei Refactorings.** Nach dem
   Durchreichen der Filter-Basis mussten fünf Anker in t_zwei/t_suche
   nachgezogen werden - rote Anker heißt oft "Signatur geändert", nicht
   "Fehler".
6. **preview_start sucht launch.json im Sitzungs-Startordner.** Nach
   einem Ordnerwechsel eine Kopie mit ABSOLUTEN Pfaden dort ablegen.

## Offen nach diesem Abend

- **Automatisches Auslesen der Anbieter-ID aus dem Foto.** Bewusst
  nicht gebaut: die Screenshots sind Ende-zu-Ende verschlüsselt (ohne
  Karams Schlüssel kann niemand hineinschauen), und die Texterkennung
  scheinlesen.js/Tesseract ist seit längerem bewusst abgeschaltet.
  Nächster Schritt braucht Karam am echten Gerät: je Anbieter zeigen,
  WO die ID auf dem Schein steht (zwei, drei Beispiele reichen), dann
  gezielte Auslese in die vorhandene OCR und live messen.
- **Karams Buchhaltungs-Fehler**: er sagte "ich hätte noch ein paar
  Fehler gefunden", hat sie aber noch nicht genannt. Nachfragen.
- **Mein Bereich Personen-Karten** stehen weiter auf 5 (PERSONEN_OBEN).
  Die Kehrtwende "alle, zwei Reihen, quer" wurde NUR im Auswerten
  umgesetzt - wenn er es auch dort will, ist es ein kleines Stück.
- Personen-Kassen-Tabelle je Person hat noch keinen Block-Schnitt
  (erst relevant, wenn EINE Person tausende Kombinationen hat).
- Alt-Punkte unverändert: ergebnis-scan Version 3 (Pins), TURN,
  doppelte Fotos der 36 Altscheine, Eingabetafel-Rückholschalter.

---

# ZWEITER NACHTRAG, noch später am 17.09.2026 (Fassung `20260917t`, Commit `e398d12`)

Karams zweites Abend-Paket, alles gepusht, 30 Suiten grün (neu:
`t_schluessel.js`, `t_abend.js`).

- **Auswerten ist DER Bearbeitungsort**: an jeder Karte jetzt auch
  Anbieter umhängen (Geldzahlen bleiben stehen, wie 20260903d), Notiz
  (gleiche Spalte wie die Tabelle, tuNotiz hat jetzt die 0-Zeilen-
  Wache), Einsatz (über tuEinsatz) und der Stift, der das VOLLE
  personkombi-Formular in der Karte öffnet (pkSpeichern/pkAbbrechen
  ziehen die Ansicht nach; `pkAuswertenNachziehen`).
- **Kombinationen + Personen-Kasse sind reine Anzeige**, nur Löschen
  bleibt. **Doppelklick** auf eine Zeile = `awZuKombi`: öffnet das
  Auswerten, stellt SICHTBAR um (Zeitraum alles, Schalter an, Filter
  leer, Suche auf "nr X") und blitzt die Karte an.
- **"Nachrechnen" ist raus** (Funktionen bleiben, Rückweg steht als
  Kommentar im mein-Template). **Buchhaltung und Tagesübersicht sind
  EIN Block** mit Reiterleiste (`buchReiterZeigen`, Merker
  kt_buch_reiter; alte Geräte-Werte tag/pruefen werden übersetzt).
  WICHTIG: nur die Navigation ist gemerged, beide Zeichner unverändert.
  Karams tieferes Prioritäten-Rework der Buchhaltung ist NICHT gebaut -
  siehe offen.
- **Neu: `schnell.js`** - Block "Kombi aus Screenshot": Bild + Einsatz
  + Multiplikator + möglich (fehlendes wird gerechnet und benannt),
  freiwillig Person/Anbieter-ID. Gleiche Datensatz-Form wie personkombi
  (handeingabe + ohneNachweis, H-Kennung); Bild-Pipeline ist
  `pkBildVerkleinern` (aus personkombi herausgezogen).
- **Schlüssel-Erneuerung** (`supaSchluesselNachliefern`): liefert jetzt
  auch, wenn die Freigabe schon einen Schlüssel TRÄGT, aber der Stand
  sich gedreht hat (Bereichsschlüssel des Besitzers oder pubkey des
  Gastes) - Geräte-Merker `kt_nachliefer_<gast>` als Drossel. Der
  stille "ohne eigenen Schlüssel"-Fall wird jetzt gemeldet. Das ist die
  wahrscheinliche Heilung für Karams "der Kollege sieht den 1117er
  verschlüsselt": Karam einmal Mein Bereich öffnen, Kollege neu laden.
  In kt_freigaben ist beidseitig ein Schlüssel da (per SQL geprüft),
  einen Schein/Nutzer "1117" gibt es nicht - vermutlich eine Person
  "P-1117" (Namen sind verschlüsselt, von außen nicht prüfbar).
- **Logo-Chips** sind jetzt ruhig weiß mit Kante (Karams "komischer
  Hintergrund" war die Markenfarbe HINTER dem Symbol).

- **Gesetzt-Liste (Fassung u):** Karams Bug behoben - Einträge OHNE
  Ordner (Handeinträge, Screenshot-Kombis) standen in JEDEM Ordner
  (eintragImOrdner-Freibrief). Sie leben jetzt im Fach „ohne Ordner"
  des neuen zuklappbaren Wählers (gsWahl in kombis.js: passend / alles
  / ohne Ordner / je Foto-Ordner streng, plus Setz-Datum von/bis über
  e.zeit - NICHT ebZeitPasst). Jeder Ausblende-Grund hat seinen Satz,
  Unlesbare stehen in jedem Fach, t_gesetzt §11 und t_drei sind
  nachgezogen.

- **Geisterzeile im frischen Ordner (Fassung v):** Karams Nacht-Fund.
  Gemessen: Schein Nr. 2 (29.08.) stammt aus dem GELÖSCHTEN Ordner
  2026-08-29-mittag; solche Kombis und die unlesbaren standen bewusst
  in jedem Ordner. Jetzt: eigene Fächer „Ordner gelöscht" und „nicht
  lesbar" im Wähler (Chips nur wenn nötig), der frische Ordner ist
  wirklich leer, die Unlesbaren hängen als Warnkasten über jeder
  Ansicht (Doppelt-Setzen-Schutz lauter statt leiser). Merke: in
  Karams Konto liegen außerdem zwei Scheine ohne beine-Spalte
  (29./30.08., einer ohne Nummer) - Kandidaten für „ohne Ordner"
  oder „Ordner gelöscht", falls er fragt.

## Offen nach dem zweiten Nachtrag

- **Buchhaltungs-Rework mit Prioritäten** (Karams Wunsch: "alle
  Anzeigen mit Buttons ganz oben: Anbieter, pro Person, Datum, nur
  Geld, wie viel offen"): heute nur die Navigation gemerged. Das echte
  Umsortieren der Buchhaltungs-Inhalte braucht eine Runde MIT Karam
  vor dem Bildschirm - dort NICHTS auseinandernehmen, bevor er nicht
  je Kachel gesagt hat, was wohin soll.
- **ID-Auslese aus dem Foto** weiter offen (siehe oben).
- **Karams Buchhaltungs-Fehler** weiter unbenannt - nachfragen.
- pk-Formular-Styles in der Auswert-Karte am Handy nachmessen, wenn
  Karam den Stift dort wirklich benutzt (heute nur Desktop gemessen).

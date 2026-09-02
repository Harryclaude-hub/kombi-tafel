# Kombi-Tafel — Übergabe

Stand: **02.09.2026**, Fassung `20260902i` (Abschnitt 14 zuerst lesen!).
Dieser Text ist der Einstieg. Wer ihn gelesen hat, kann weiterarbeiten,
ohne den alten Chat zu kennen.

---

## Inhalt

1. [Worum es geht](#1-worum-es-geht)
2. [Die Rechenregeln](#2-die-rechenregeln--das-hier-nie-raten)
3. [Die Dateien](#3-die-dateien)
4. [Die Fassungsnummer](#4-die-fassungsnummer--die-wichtigste-handregel)
5. [Die vier Zahlen an einer Kombination](#5-die-vier-zahlen-an-einer-kombination)
6. [Die zwei Ablagen für gesetzte Kombinationen](#6-die-zwei-ablagen--die-teuerste-falle-des-projekts)
7. [Was das Programm kann](#7-was-das-programm-kann)
8. [Die Datenbank](#8-die-datenbank)
9. [Was offen ist](#9-was-offen-ist)
10. [Karams Regeln](#10-karams-regeln--die-sind-nicht-verhandelbar)
11. [Fehlerklassen, die hier immer wieder auftreten](#11-fehlerklassen-die-hier-immer-wieder-auftreten)
12. [So arbeitest du hier](#12-so-arbeitest-du-hier)
13. [Wenn Karam schreibt](#13-wenn-karam-schreibt)

---

## 1. Worum es geht

Karam verwaltet mit Freunden **echtes Geld**. Aus einer Tabelle mit Wetten
werden **3er-Kombinationen** gebaut, bei vier Anbietern gesetzt,
fotografiert und abgerechnet. Alles läuft im Browser, ohne Build-Schritt.

**Das ist kein Bastelprojekt.** Ein Rechenfehler kostet Geld, ein
vertauschtes Foto kostet Vertrauen, eine doppelt gespeicherte Kombination
verfälscht die Abrechnung zwischen Freunden. Bei Zweifeln lieber messen
als annehmen.

| | |
|---|---|
| **Live** | https://harryclaude-hub.github.io/kombi-tafel/ (index.html ist seit 01.09. NUR eine Weiterleitung auf original.html - Datei nie loeschen, siehe Manifest/start_url) |
| **Repo** | `harryclaude-hub/kombi-tafel` (öffentlich, GitHub Pages) |
| **Lokal** | `C:\Users\Home\kombi-tafel` |
| **Supabase** | Projekt `mqmevpyatjsambervgtu` (heißt aus historischen Gründen noch „immo-check"), RLS aktiv, Ende-zu-Ende verschlüsselt |
| **Anrede** | Karam (auch „Kai"). Deutsch, einfache Sprache, militärischer Ton erlaubt: „Jawohl, Chef" |

**Der Ablauf, den Karam wirklich geht:**

1. Fotos der Wett-Tabelle hochladen → daraus entsteht ein **Ordner** (ein
   „Satz", z. B. `2026-08-29-mittag`)
2. Im **Kombi-Bau** werden aus den offenen Wetten 3er-Kombinationen gebaut
3. Er geht zum Anbieter, sucht die drei Wetten, setzt sie, tippt den
   **Einsatz** ein
4. Foto vom Wettschein dran, **„In den Verlauf"**, Person zuordnen
5. In **Mein Bereich** stehen danach Kombinationen, Konto, Personenkasse
   und Buchhaltung

---

## 2. Die Rechenregeln — das hier nie raten

### Die vier Anbieter

Reihenfolge steht an **einer** Stelle: `KT_ANBIETER_RANG` in `kombis.js`.

```js
const KT_ANBIETER_RANG = ["st", "iw", "bw", "b3"];
```

1. **Stake** (`st`) — erste Wahl
2. **Interwetten** (`iw`)
3. **Bwin** (`bw`) — Sportingbet ist derselbe Anbieter, deshalb steht dort nur `bw`
4. **Bet365** (`b3`) — letzte Wahl

Wenn nicht lesbar ist, ob ein Spiel dort überhaupt angeboten wird, ist das
in Ordnung — dann wird es geschätzt und als „Markt nur geschätzt" markiert.

### Die Gebührenregel

```js
const GEBUEHREN_TEILER = { iw: 1.05, bw: 1, b3: 1, st: 1 };
```

Nur **Interwetten** gibt die 5 % Gebühr weiter: die angezeigte Quote wird
**durch 1,05 geteilt**. Eine Quote 2,00 bei Interwetten ist in Wirklichkeit
1,90.

**Deshalb steht bei Interwetten eine höhere Mindestquote — 1,89 statt
1,80. Das ist kein Fehler.** Es ist dieselbe Regel, ausgedrückt in der
Währung des Anbieters: 1,89 ÷ 1,05 = 1,80.

Karam ist genau darüber schon einmal gestolpert. Wenn er sagt „warum steht
da unter Quote", ist meistens nicht die Rechnung falsch, sondern er hat
beim falschen Anbieter nachgesehen. Deshalb steht der Anbieter jetzt ganz
oben auf jeder Karte: **„Stake · hier suchen"**.

### Die Mindestquote

**Sie steht im Foto, nicht im Feld oben.** In der Tabelle hat jede Zeile
zwei Quotenspalten: links die Quote, rechts die **Mindestquote**. Die rechte
gilt, und zwar genau für diese eine Zeile.

```js
mindFuer(w, optIdx, ersatz)   // logik.js
// 1. Foto-Wert aus o[optIdx][2]
// 2. sonst das Feld oben im Kombi-Bau (nur noch Ersatz)
// 3. sonst MIND_STANDARD = 1.78
```

Gespeichert als dritter Platz einer Option: `[Linie, Quote, Mindestquote]`.
Alte Wetten haben nur `[Linie, Quote]` und laufen unverändert weiter.

**Mehrere Linien zum selben Spiel** wie `AWAY (-1.5, -1, -0.5)` sind drei
verschiedene Wetten auf dasselbe Spiel. Karam setzt nur EINE davon, braucht
aber je Linie die eigene Quote und die eigene Mindestquote. `optionName()`
macht daraus "AWAY -1.5", "AWAY -1", "AWAY -0.5" - aber nur, wenn zu jeder
Linie auch eine Quote gehört.

**Noch offen:** der Einleser in `admin.js` hält die zweite Quotenspalte
weiter für eine weitere Option. Beim nächsten Foto erst hinsehen, wie die
zwei Spalten stehen, dann umstellen. Nicht raten.

Die Quote vom Foto ist nur eine Schätzung, die Mindestquote entscheidet.

- drüber -> **grün**
- drunter -> **rot**
- genau drauf -> **grün**

Beim Runden gilt: wo eine Untergrenze gemeint ist, wird **auf**gerundet.
`toFixed` rundet ab - eine geforderte Quote von 1,8476 als "1,84"
anzuzeigen und dann gegen 1,84 zu prüfen, wäre zu wenig.

### Die drei Baurregeln

1. Jede Einzelquote liegt über der Mindestquote — die **echte** Quote nach
   Gebühr
2. Alle drei Wetten eines Scheins liegen beim **gleichen Anbieter**
3. Jedes **Spiel kommt nur einmal** vor, sonst hängen zwei Scheine
   aneinander und fallen gemeinsam

### Freigaben: sehen UND mitarbeiten

Karams Wunsch: wer Zugriff auf einen fremden Bereich hat, soll **alles**
sehen, überall navigieren und als `close` auch alles ändern können.

Die Rechte stimmen längst (`darfSchreiben()` gibt für `close` true). Was
fehlte, war der Schlüssel. `supaTeilen` schreibt den Bereichsschlüssel nur
mit, wenn der Gast zu dem Zeitpunkt schon einen `pubkey` hat. War er noch
nie angemeldet, geht die Freigabe ohne Schlüssel raus, und der Gast sieht
überall nur "[verschlüsselt - Schlüssel fehlt]".

`supaSchluesselNachliefern()` (supa.js) sucht das jetzt bei jedem Laden von
Mein Bereich selbst und trägt nach.

**Wichtig:** der Bereichsschlüssel liegt NUR im Browser des Besitzers
(`kt_e2e_bereich_<uid>`). Kein Server, kein Admin und kein MCP kann ihn
herausgeben. Beide Seiten müssen sich also einmal anmelden, damit jeder dem
anderen liefert. Steht in `kt_freigaben.schluessel` NULL, ist immer das die
Ursache.


### Das Ziel: 400 € je Kombination

Lässt ein Anbieter nicht so viel zu, wird die Kombination geteilt:

- **`_t2`** — gleiche Wetten, weiterer Anbieter („Rest bei weiterem Anbieter")
- **`_m2`** — andere Mischung aus demselben Ordner („Andere Mischung für den Rest")

Die Teile zählen **zusammen** gegen die 400 €.

---

## 3. Die Dateien

Kein Build, kein Bundler. Reine `.js`-Dateien, in den HTML-Seiten
eingebunden — die Reihenfolge der `<script>`-Zeilen **ist** die
Ladereihenfolge.

### Kern

| Datei | Was drin steckt |
|---|---|
| `kombis.js` | Kombi-Bau: Zustand, Scheine, Verlauf, Panel, Löschen. Die größte Datei. |
| `verteiler.js` | Die **zwei** Verteil-Verfahren `verteilePaare` und `verteileSuche`; `verteileBeste` wählt das bessere. **Änderungen IMMER in beiden.** `bericht.verfahren` sagt, welches gewonnen hat. |
| `logik.js` | Anbieter, `GEBUEHREN_TEILER`, `rund2`, `anbieterName`, `satzWaehlen`, Ordnerleiste |
| `mein.js` | Mein Bereich: Personen, Kombinationen, Konto, Buchhaltung, Tagesübersicht |
| `einzeln.js` | Modus „Einer nach dem anderen": eine Kombination, tauschen bis sie passt, Gedächtnis je Anbieter |
| `supa.js` | Alles Richtung Datenbank |
| `krypto.js` | Ende-zu-Ende: `e2eZu` / `e2eAuf` / `kryptoBereich` |
| `anruf.js`, `anruf-server.js` | Anrufe (WebRTC). **Alle STUN/TURN-Adressen nur in `anruf-server.js`.** |
| `daten.js` | Notrad: eingebaute `SAETZE`/`WETTEN`, falls die Datenbank nicht antwortet |
| `personkombi.js` | Kombination bei einer Person **von Hand anlegen und bearbeiten**. Eigene Datei, `mein.js` hat nur vier `typeof`-abgesicherte Haken: faellt sie weg, sieht die Liste aus wie vorher. Baut den Datensatz in derselben Form wie `baueVerlaufsEintrag` (`kombis.js`) - wer eines aendert, schaut ins andere. Hand-Eintraege haben `daten.handeingabe = true` und eine Kennung mit `H` statt `S`. |
| `satzdaten.js` | Hängt die Ordner/Wetten aus der Datenbank an `SAETZE`/`WETTEN` an |

**Achtung bei `logik.js`:** sie wird von `index.html`, `kombis.html`,
`mein.html` **und** `original.html` geladen. `kombis.js` dagegen **nur** von
`kombis.html`. Wer aus `logik.js` etwas aus `kombis.js` aufruft, macht die
Ordner-Umschaltung auf drei Seiten kaputt — ohne jede Fehlermeldung.

### Löschbare Schichten

Karams Regel: Design ist eine eigene Schicht, die man wegnehmen kann, ohne
dass etwas aufhört zu funktionieren.

| Datei | Was |
|---|---|
| `zeilen.js` | Zebra-Zeilen, Nummerierung, Fotos klein/groß |
| Ende von `stil.css` | Alle neuen Design-Schichten hängen hinten dran, jede mit Überschrift |

Handy-Regeln stehen in `@media (max-width: 700px)`.

### Werkzeug

| Datei | Was |
|---|---|
| `naechste-fassung.js` | Vergibt die `?v=`-Nummer. **Nie raten!** Siehe Abschnitt 4. |
| `.claude/launch.json` | Vorschau-Server auf Port 8791 |
| `PRUEFBERICHT-2026-08-29.md` | 38 Befunde, 16 von 17 Punkten abgehakt |

---

## 4. Die Fassungsnummer — die wichtigste Handregel

Jede HTML-Seite hängt `?v=JJJJMMTT<Buchstabe>` an jede `.js`, `.css` und
`.png`. Ohne das führt der Browser tagelang alten Code aus.

```bash
node naechste-fassung.js --setzen
```

**Nie selbst eine Nummer ausdenken.** Am 29.08. wurde `20260829b` zweimal
vergeben — Browser haben den alten Code behalten, und die Live-Prüfungen
sahen aus, als sei die Veröffentlichung fehlgeschlagen. Das Skript liest
die Git-Geschichte, geht nie rückwärts und zählt hinter `z` mit `aa`, `ab`
weiter.

Es stempelt auch die `.png` und die Symbole im `manifest.webmanifest` —
iOS merkt sich das Symbol für den Home-Bildschirm nach URL.

**Danach immer live nachsehen.** GitHub Pages braucht 1–3 Minuten:

```bash
curl -s "https://harryclaude-hub.github.io/kombi-tafel/kombis.html?cb=$RANDOM" | grep -o 'v=[0-9a-z]*' | head -1
```

---

## 5. Die vier Zahlen an einer Kombination

Das ist die häufigste Verwechslung in diesem Projekt. Sie hat schon zu
einem Fehler geführt, bei dem ein fremdes Wettschein-Foto an einer neuen
Kombination klebte.

| Zahl | Woher | Wiederholt sich? | Wofür |
|---|---|---|---|
| **`s.nr`** | intern beim Bauen | **ja**, fängt bei jedem Bauen wieder bei 1 an | hält die Teile einer Kombination zusammen |
| **Anzeige** | `anzeigeNr(z, nr)`, bei jedem Zeichnen neu | läuft immer 1..N | was Karam auf dem Schirm liest |
| **`s.id`** | `"S<Durchgang>-<lfd>"`, Durchgang aus `kt_bau_lfd` | **NIEMALS** | technischer Schlüssel; daran hängt das **Foto** (`foto_<id>` im localStorage) |
| **`nummer`** | `nrNaechste()` aus `kt_schein_nr`, **nur** in `baueVerlaufsEintrag` | **NIEMALS** | Karams feste Nummer; danach sucht er später |

**Merksatz:** die Anzeige darf sich ändern, die Kennung nie, und die feste
Nummer entsteht erst, wenn wirklich gesetzt wird. Bloßes Bauen und Mischen
verbraucht **keine** feste Nummer.

### Stamm oder exakte Kennung?

`stammId()` schneidet die Teil-Anhängsel ab — **mehrfach**, denn `S7-3_t2_m2`
ist möglich.

Es gibt zwei verschiedene Fragen, und wer sie verwechselt, baut einen
gefährlichen Fehler:

| Frage | Vergleich |
|---|---|
| „Zählen diese Teile zusammen gegen die 400 €?" | **Stamm** |
| „Steht GENAU DIESE Karte schon im Verlauf?" | **exakte Kennung** |

Der zweite Teil einer Kombination ist beim Anbieter eine **eigene** Wette
und braucht seinen eigenen Verlaufseintrag. Über den Stamm verglichen
würde ein noch nicht gesetzter Teil grün als „erledigt" gemeldet — und
eine falsche grüne Meldung sieht sich niemand nach.

---

## 6. Die zwei Ablagen — die teuerste Falle des Projekts

Es gibt **zwei** Orte, an denen eine gesetzte Kombination landen kann:

| Wer | Wohin | Funktion |
|---|---|---|
| **nicht angemeldet** | localStorage `"verlauf"` | `scheinLokalMerken` |
| **angemeldet** | Datenbank `kt_scheine` | `scheinInsKonto` → `supaScheinAnlegen` |

**Karam ist angemeldet.** Er speichert also ausschließlich in die
Datenbank. Der Kombi-Bau hat aber lange nur die örtliche Liste gelesen —
für ihn war der Verlauf damit **immer leer**. Betroffen waren die
Verlaufsliste, das Konto, das Panel und `gesetzteScheine()`.

Das war nicht nur eine falsche Anzeige: `restNeuMischen` hielt gesetzte
Kombinationen für frei, und dieselben Wetten hätten ein zweites Mal
rausgehen können. Mit echtem Geld.

**Deshalb gibt es jetzt genau eine Stelle, die beides zusammenführt:**

```js
gesetzteEintraege()   // beide Ablagen, gefiltert auf den aktiven Ordner
schonGesetzt(id, liste)  // exakte Kennung, EINE Liste je Zeichnung
```

Wer irgendwo `liesVerlauf()` direkt liest, um zu prüfen, ob etwas gesetzt
ist, baut den Fehler neu ein.

---

## 7. Was das Programm kann

### Kombi-Bau (`kombis.html`)

- **Panel ganz oben**: noch nichts gesetzt / gesetzt aber nicht voll /
  voll gesetzt / insgesamt, darunter namentlich die Lücken und
  „Rest neu mischen"
- **Anbieter als Erstes** im Kopf jeder Karte: „Stake · hier suchen"
- **Grüner Merker „✓ im Verlauf als Nr. 41, 400,00 €"**, sobald die Karte
  gespeichert ist; der Speichern-Knopf heißt dann „nochmal in den Verlauf"
  und fragt nach
- **Löschen an jeder Karte** (🗑) mit Rückfrage:
  Hauptkarte nimmt alle Teile mit, Teil-Karte nur sich selbst; ACHTUNG
  vorweg, wenn schon gesetzt; Foto wird nur weggeworfen, wenn kein
  Verlaufseintrag mehr daran hängt
- **„Anbieter hat die Wette nicht"** → die **ganze Kombination** wandert
  zum nächsten Anbieter, alle drei Wetten bleiben. Erst wenn keiner der
  vier sie hat, fliegt die Wette raus. Gemerkt in `kt_nicht_da`.
- **Nachrücken**: fällt eine Wette raus, kommt Ersatz — **nur aus
  demselben Ordner** — bis wirklich nichts mehr da ist
  (`ERSATZ_MAX_NUTZUNG = 2`, Notfall 3, weil ein voller Bau jede der 51
  Wetten genau zweimal braucht)
- Modus **„Einer nach dem anderen"**: eine Kombination, tauschen bis sie
  passt, Gedächtnis je Anbieter, Anzeige des Durchgangs
- Foto vom Wettschein oder Bildschirm-Ausschnitt, klein rechts,
  Klick = groß

### Mein Bereich (`mein.html`)

- **Zwei Verläufe** über einen Schalter: Alle / Voll gesetzt / Nicht voll
  gesetzt, mit Zahlen und dem Ziel-Betrag zum Ändern. Teile zählen
  **zusammen**.
- **Einsatz nachträglich änderbar** — mit Rückfrage (alt, neu, neuer
  Möglich-Wert) und einer Anmerkung am Schein. Eine stille Änderung an
  einer Geldzahl wäre falsch.
- Personen, Personenkasse, Konto je Bereich, Buchhaltung, Tagesübersicht
- **„Wirklich drauf"**: Stand bei Geldhaltern (PayPal) und Anbietern
  direkt eintragen, ohne Überweisung, jederzeit änderbar, mit Rückfrage.
  Differenzen gelten als „ungeklärt" und bleiben aus dem Gewinn raus.
- Mülleimer mit Rückfrage und Rechteprüfung

### Drumherum

Chat mit Ende-zu-Ende; Lesebestätigung in drei Stufen (1 Punkt = nicht
verschickt, 2 = verschickt, 3 = empfangen, grün = gelesen); Anrufe über
WLAN mit Bild des Anrufers in der Benachrichtigung; Anruf-Fenster unten
rechts mit Stummschalten und Auflegen, verschiebbar; Zebra-Zeilen in vier
Farben; Nummerierung; installierbar als App (Home-Bildschirm-Symbol).

---

## 8. Die Datenbank

Supabase-Projekt `mqmevpyatjsambervgtu`. Zugriff über das Supabase-MCP ist
möglich — **aber `daten` ist Ende-zu-Ende verschlüsselt**. Der Schlüssel
liegt nur in Karams Browser. Einsätze, Quoten und Spiele sind von außen
**nicht lesbar**, und das soll so bleiben.

Die wichtigsten Tabellen:

| Tabelle | Was |
|---|---|
| `kt_saetze`, `kt_wetten` | Die Ordner und ihre Wetten |
| `kt_scheine` | Gesetzte Kombinationen. `daten` verschlüsselt, `nummer`/`stand`/`ordner` offen |
| `kt_ordner` | Personen (Name verschlüsselt) |
| `kt_buchungen`, `kt_person_zahlungen`, `kt_balancen` | Buchhaltung |
| `kt_anmerkungen` | Notizen am Schein (Text verschlüsselt) |
| `kt_freigaben` | Wer darf welchen Bereich sehen |
| `kt_nachrichten`, `kt_direkt` | Chat |

**Beim Schreiben immer `.select()` anhängen und `r.data.length` prüfen.**
Ohne das sieht ein an RLS gescheitertes Update genauso aus wie ein
gelungenes — und beim nächsten Laden steht der alte Wert wieder da, ohne
dass jemand weiß warum.

---

## 9. Was offen ist

1. **ERLEDIGT-Vermerk (02.09. spät): der MCP-Deploy von Edge-Funktionen
   FUNKTIONIERT inzwischen.** Bewiesen mit `ergebnis-push` (Quellcode
   kommt byte-gleich zurück, Probeaufruf antwortet aus dem eigenen Code).
   `push-senden` ließe sich also jetzt neu veröffentlichen - sie läuft
   aber und wird nur angefasst, wenn es einen Grund gibt (Regel:
   Laufendes nie umbauen; erst daneben bauen, testen, dann umstellen).
2. **Prüfbericht Punkt 13**: Benutzername → E-Mail ist für jeden lesbar.
   Braucht eine Edge Function — geht jetzt (siehe Punkt 1).
3. **TURN-Server für Anrufe über Mobilfunk.** Über WLAN läuft es. Für
   Mobilfunk bräuchte es Zugangsdaten von metered.ca — die muss Karam
   holen. `openrelay.metered.ca` ist **tot** (gemessen); ein toter Eintrag
   kostet 9 Sekunden je Anruf. Deshalb `KT_TURN = []`.
4. **`neuBauen` / `restNeuMischen` vergeben neue Kennungen.** Fotos, die
   an alten Kennungen hängen und noch nicht gespeichert sind, werden
   dadurch heimatlos. Eine Rückfrage davor wäre sinnvoll — sie muss aber
   auch dann fragen, wenn das Konto noch gar nicht geladen ist.
5. **Fotos und Buchhaltung** werden gerade erst befüllt. Wenn Karam von
   komischen Zahlen erzählt: erst nachsehen, was wirklich in der Datenbank
   steht.

---

## 10. Karams Regeln — die sind nicht verhandelbar

### Nur aus dem Ordner

> „Nur von den Ordner, nix aus fremdem Ordner. Das ist für mich die
> strengste Disziplin. Du darfst nix aus anderen Orten holen. Nur das, was
> im Ordner zur Verfügung steht."

Ersatzwetten, Auffüllen, Neumischen: **alles** kommt aus dem gerade
gewählten Ordner.

### Design von Funktion trennen

Design ist eine eigene, löschbare Schicht. Neue Optik ans Ende von
`stil.css`, Handy-Regeln in `@media (max-width: 700px)`. Beim Designen
**niemals** einen Rechenweg anfassen.

### Erst sehen, dann urteilen

Browser-Ansicht offen halten und `elementFromPoint` prüfen. Reine
DOM-Werte übersehen Overlays.

### Beide Verfahren gleichzeitig

`verteilePaare` und `verteileSuche` immer zusammen ändern.

### Vor dem Schreiben alle Anker prüfen

Patch-Skripte zählen erst alle Fundstellen, schreiben dann. Das Repo hat
`core.autocrlf=true`, Patches müssen CRLF erhalten.

### Keine Lovable-Credits

Selbst coden, eigenes Supabase, GitHub Pages.

### Bei Geld immer fragen

Löschen, Einsatz ändern, doppelt speichern: immer mit Rückfrage, und die
Rückfrage sagt konkret, **was** passiert — nicht „Sind Sie sicher?".

---

## 11. Fehlerklassen, die hier immer wieder auftreten

Echte Funde, keine Theorie:

- **In der falschen Ablage nachsehen.** Der größte Fehler des Projekts
  (Abschnitt 6). Es gibt zwei Orte für gesetzte Kombinationen.
- **Stille Fehlschläge.** Etwas wird gelöscht oder gespeichert, das
  Ergebnis weggeworfen — beim nächsten Laden steht alles wieder da.
  Immer `.select()` prüfen.
- **Namensgleichheit ohne Sachbezug.** Zwei Zahlen heißen gleich und sind
  es nicht (Abschnitt 5).
- **Drift zwischen zwei Fassungen.** Zwei Listen für dasselbe, eine wird
  gepflegt. Deshalb ist der Verlauf **eine** Liste mit einem Schalter.
- **`toFixed` rundet ab.** Wo eine Untergrenze gemeint ist, aufrunden.
- **`type="number"` verschluckt „250,50"** je nach Spracheinstellung.
  Immer `type="text" inputmode="decimal"` und selbst umwandeln.
- **Heuristiken auf Nebenspuren.** „Der Einsatz wurde von Hand geändert"
  klingt brauchbar, ist es aber nicht: das Feld ist schon vorbelegt, hängt
  an `oninput`, und ein Mausrad reicht. Lieber einen ausgesprochenen
  Merker als eine geratene Ableitung.
- **Meine eigenen Prüfungen sind auch nur Code.** `const WETTEN` lässt
  sich nicht über `window.X` überschreiben; ein `window.__m` für zwei
  Messungen gelesen ergibt eine falsche „Fehlermeldung"; ein gefälschter
  Zustand ohne alle Felder lässt `zeichne_` abstürzen — das ist dann der
  Test, nicht der Code.
- **Gegenprüfung lohnt sich.** Eine Runde mit mehreren unabhängigen
  Prüfern hat in einer einzigen Änderung **acht** echte Fehler gefunden,
  in einer anderen elf.

---

## 12. So arbeitest du hier

```bash
# 1. Ändern - Patch-Skript im Scratchpad, alle Anker vorher zählen
node --check kombis.js && node --check mein.js && node --check supa.js

# 2. Fassung setzen
node naechste-fassung.js --setzen

# 3. Lokal ansehen: preview_start mit dem Namen "kombi-tafel"
#    (.claude/launch.json, Port 8791). NIE einen Server über Bash starten.

# 4. Hochladen
git add -A && git commit -m "..." && git push origin main

# 5. Live nachsehen, ob die neue Fassung wirklich draußen ist
```

**Prüfen statt hoffen.** Alles, was mit Geld zu tun hat, wird im Browser
gemessen: Zustand fälschen, Funktion rufen, Ergebnis vergleichen.
`window.confirm` abfangen, statt es zu beantworten — so sieht man auch
den Text, den Karam lesen wird.

**Commit-Nachrichten** sind hier ausführlich und auf Deutsch: was war das
Problem, warum war es eines, was ist gemessen worden. Das ist bewusst so —
es ist die einzige Erklärung, die später noch da ist.

---

## 13. Wenn Karam schreibt

Er beschreibt Probleme aus seiner Sicht, nicht in Code. Ein paar echte
Beispiele und was wirklich dahintersteckte:

| Er sagt | Es war |
|---|---|
| „Die Zahlen addieren sich" | Die Anzeige-Nummer lief hoch statt bei 1 anzufangen |
| „Warum steht da unter Quote" | Er suchte bei Stake, der Schein lag bei Interwetten |
| „Kannst du sie finden und in den Verlauf tun" | Sie waren im Verlauf — der Kombi-Bau las die falsche Ablage |
| „Es kommt nichts mehr nach" | Der Ersatz war nach zwei Verwendungen erschöpft |

**Erst herausfinden, was er wirklich sieht. Dann messen. Dann bauen.**

Und wenn etwas nicht geht: **sagen, dass es nicht geht**, und warum. Er
trifft die Entscheidung, nicht wir.

---

## 14. Stand 02.09.2026 - fuer den naechsten Chat

Fassung **`20260902b`**, alles committet und live. Was seit dem 01.09. dazukam:

### Automatische Auswertung (der grosse Block)

- **`auswertung.js`**: reine Rechenmaschine. `wetteLesen(text, spiel)` liest
  Karams Wett-Vokabular, `kombiAuswerten(wetten, einsatz, ergebnisJe)`
  entscheidet die ganze Kombination (ein verlorenes Bein = alles verloren;
  Viertellinien zahlen halb; Push/Absage = Einsatz zurueck).
  **Eiserne Regel: was nicht sicher lesbar ist, wird "unklar" und wird NIE
  automatisch verbucht.** Von 4 unabhaengigen Pruefern mit 371 Faellen
  attackiert: 0 Rechenfehler. Laeuft auch unter Node (`require`).
- **`kt_ergebnisse`** (Datenbank, UNverschluesselt - Spielstaende sind
  oeffentlich): PK (satz, spiel); heim/gast, ht_heim/ht_gast, karten,
  ecken, sonder (jsonb, z. B. "asse fritz"), stand fertig/abgesagt, von.
  RLS: lesen alle Angemeldeten, schreiben mit von = auth.uid().
- **`ergebnisse.js`**: Eingabetafel in Mein Bereich (je Spiel NUR die
  Felder, die seine Wetten brauchen), rechnet alle offenen Scheine durch,
  schreibt stand + echt_zurueck (nie eine vorhandene Zahl ueberschreiben),
  meldet nach den zwei neuen Wecker-Schaltern **Gewinne / Verluste**.
- Kombi-Bau, Gesetzt-Liste: zeigt Ausgaenge je Bein - NUR Anzeige,
  verbucht wird ausschliesslich in Mein Bereich.

### Mein Bereich

- **Anbieter-Kopf** (`#anbieterkopf`, zeichneAnbieterKopf in mein.js):
  vier Karten Stake/Interwetten/Bwin/Bet365 mit "drauf", "noch moeglich",
  Zaehlern. Klick = Filter der Kombi-Liste (anbieterFilter) + komplette
  Uebersicht je Person mit dem "wirklich drauf"-Feld (Korrektur wird als
  stand_anbieter-Buchung gespeichert - so uebersteuert Karam jede Zahl,
  auch Altbestand).
- **EINE Kombi-Liste**: die Personen-Kasse zeigt keine eigene Liste mehr;
  die Hauptliste hat einen Stift (pkBearbeiten: Foto, Quoten je Wette,
  Datum, Nummer) - das pk-Formular haengt jetzt UEBER der Hauptliste.

### Eigene Ansichten statt Bloecke (gebaut am 02.09., Fassung 20260902d)

Karams Auftrag ist umgesetzt: Im eigenen Bereich stehen nur noch
**Tagesuebersicht, Kombinationen, Personen-Buchhaltung und Nachrechnen**
(MB_BLOECKE). **Profil** (Angemeldet-als, Abmelden, Schluessel-Erklaerung),
**Freunde & Teilen** und der **Bereichs-Chat** haengen an den
**Kopfleisten-Knoepfen ganz oben** (nav_profil aus profil.js,
nav_freunde und nav_nachrichten aus mein.html - glocke.js leitet die
beiden auf Mein Bereich zu den Ansichten um, auf allen anderen Seiten
oeffnen sie weiter Glocken-/Freundepanel). Eigene Extra-Knoepfe gibt es
NICHT mehr - Karam wollte nichts doppelt (Fassung 20260902c hatte kurz
drei eigene Knoepfe, die sind wieder raus). Jede Ansicht hat einen
Zurueck-Knopf. Der Chat sieht aus wie eine Gruppe (Sprechblasen
links/rechts auf jeder Bildschirmgroesse), und die Kopfleiste ist ein
ruhiger Balken (Glocken-Gruppe rechts gebuendelt) - beides
Design-Schichten ganz am Ende von stil.css, loeschbar, Funktion
unberuehrt. Der Zaehler am Nachrichten-Knopf gehoert allein
glockeZaehlen (glocke.js); ladeChat stoesst ihn nach dem Lesen an.

So haengt es zusammen (mein.js):

- `MB_ANSICHTEN` = profil/freunde/chat. `mbAnsichtOeffnen(name)` /
  `mbAnsichtZu()`; der Zustand steht NUR in der Variable `mbAnsicht`,
  nie in localStorage. `body.mb-sonder` blendet Navi, Anbieter-Kopf und
  Bloecke aus (stil.css bei den .mb-block-Regeln); #schluesselkasten,
  #meldung und #bereichtabs bleiben in jeder Ansicht da.
- `mbBlockZeigen` leitet die alten Namen (profil/freunde/chat) auf die
  Ansichten um - der Profil-Knopf in der Navileiste (profil.js) blieb
  deshalb unangetastet.
- `ladeChat` hat einen Waechter: laeuft NUR bei offener Chat-Ansicht.
  Der 10-Sekunden-Takt heisst jetzt `chatTakt`: Chat offen = nachladen,
  sonst nur `bereichBadges()`. Die schreibt die Zaehler in feste
  Platzhalter an den Tabs und am Chat-Knopf, statt die Tabs neu zu
  bauen (das Neubauen hat frueher bei fehlendem Bereichsschluessel den
  Warnkasten verdoppelt). Ergebnis: der Badge zeigt endlich Neues.
- Freunde/Teilen zeichnen erst beim Oeffnen der Ansicht, die
  Buchhaltung erst beim Oeffnen ihres Blocks (und wird von
  zeichneBereich nachgezogen, weil bbScheinLage kasseScheine liest).
- dmTimer wird bei Zurueck UND beim Wechsel auf eine andere Ansicht
  gestoppt; beim Wiederoeffnen der Freunde-Ansicht baut zeichneFreunde
  das DM-Fenster samt Timer neu auf (dmPartner bleibt gesetzt).

Die acht Fallen der Leser-Karte sind alle beruecksichtigt und im
Browser gemessen (Commit ed9007c beschreibt jede Messung). Die alte
Karte mit Zeilennummern gilt fuer Fassung 20260902b und ist Geschichte -
Zeilennummern von damals NICHT mehr verwenden.

### Ergebnis-Selbstsuche (GEBAUT am 02.09. abends, Fassung 20260902e)

`ergebnisseSelbstSuchen()` in ergebnisse.js, angestossen von
zeichneBereich (sofort + alle 10 Minuten). TheSportsDB searchevents,
Schluessel "123". Gespeichert wird NUR ein eindeutiger Treffer: genau
EIN Spiel, Datum +/-30 h um den Anstoss (Ortszeit des Stadions!),
beide Teamnamen in DERSELBEN Reihenfolge (ergTeamPasst; Jugend-/B-/
Frauen-Marker muessen beidseits gleich sein - "Celtic B U21" trifft
nie "Celtic"). Vorhandene Ergebnisse werden NIE ueberschrieben, nur
der Endstand kommt automatisch (HT/Karten/Ecken bleiben "fehlt noch"),
Absagen entscheidet die Automatik nicht. Drossel: je Spiel eine
Anfrage alle 30 Minuten (localStorage kt_ergsuche_*). Jeder Lauf
zeigt seine Bilanz in der Eingabetafel (ergSucheLageText) - kein
stiller Fehlschlag. Nach einem Fund laeuft ergebnisseAuswerten samt
Wecker-Meldung; Karam bessert in der Eingabetafel aus, seine Zahl gilt.
ACHTUNG Feldname: die Anstosszeit je Bein heisst in den Verlaufsdaten
**`an`** (baueVerlaufsEintrag) - ergebnisse.js las frueher `an_zeit`
und bekam nie eine Zeit (behoben, beide Schreibweisen werden gelesen).

Ausserdem seit 20260902e: an jeder Kombination steht unter dem
Anbieter gruen/rot/offen samt "Ergebnis ~ Zeit" (standMarke, mein.js;
scheinEnde liest jetzt bevorzugt das an-Feld des Beins);
die Stand-Spalte faerbt sich mit; im Kombi-Block stehen die
Kombinationen ganz oben, direkt darunter die Ergebnis-Eingabetafel,
dann Personen, dann Konto; die Kombi-Farben
wiederholen sich innerhalb eines Ordners nicht mehr (kombiFarbe in
kombis.js: 9 Toene x 3 Helligkeiten = 27, Ordnerwechsel beginnt vorn);
die Benachrichtigungs-Zeile in Mein Bereich ist raus, die Klingel in
der Kopfleiste (wecker_knopf) ist die eine Stelle dafuer.

### Fassung 20260902f (spaeter Abend): Misch-Automat + 5-Prozent-Regel

- **Kombis neu mischen** (kombis.js, mischOhnePaare + gesetztePaare +
  paarSchluessel): Knopf oben im Kombi-Bau-Panel. Nimmt JE ANBIETER die
  Einsaetze aus den dort gesetzten Kombinationen des Ordners und baut
  daraus neue 3er-Kombis beim SELBEN Anbieter - die Anbieter mischen
  sich NIE (Karams harte Regel). Keine zwei Wetten, die schon einmal
  zusammen in einer gesetzten Kombination waren, kommen wieder zusammen
  in eine (Paar-Sperre aus BEIDEN Ablagen, gilt ueber Anbietergrenzen).
  Eine Runde je Druck (jeder Einsatz max. einmal), 40 Mischversuche,
  bester gewinnt, Scheine als art "normal". Gemessen: 12 Einsaetze ->
  3 Runden a 4 Kombis, 0 Verstoesse, danach ehrliche
  "ausgemischt"-Meldung ohne Zustandsaenderung.
- **Anbieter-Blick + Filter** im Kombi-Bau-Panel: vier Karten
  (Kombinationen + Einsatz je Anbieter, aus gesetzteEintraege). Klick =
  Anzeige-Filter fuer Gesetzt-Liste und Kombis in Arbeit
  (bauAnbieterFilter, nur im Speicher). Unlesbare bleiben immer
  sichtbar; Farben der Gesetzt-Liste haengen an der UNgefilterten
  Liste (sonst Farbwechsel beim Filtern).
- **5-Prozent-Regel** (logik.js mindFuer): ohne Foto-Mindestquote gilt
  rund2(Quote * 0.95) der jeweiligen Linie; Feld oben und 1,78 nur
  noch ganz ohne lesbare Quote. Der kopierbare Einlese-Auftrag
  (admin.js) sagt das jetzt auch und traegt eine
  Sparsamkeits-Anweisung (gebuendelte Inserts, kein Erkunden).
- **Fotos nachschieben** (admin.js): die Einlese-Vorschau hat eine
  Ziel-Auswahl (vs_ziel/vsZielWahl) - neuer Ordner oder bestehender.
  Bei bestehendem Ziel wird supaSatzAnlegen NICHT gerufen (Upsert
  wuerde Titel/erstellt_von ueberschreiben); Dedupe gegen den
  Ziel-Ordner.
- **Mein Bereich**: im Kombi-Block Reihenfolge Personen -> Konto ->
  Kombinationen -> Ergebnis-Eingabetafel.

### Fassung 20260902g: Ergebnis-Push an die eigenen Geraete

Neue Edge Function **`ergebnis-push`** (Version 1, per MCP deployed -
der Deploy funktioniert wieder, siehe Abschnitt 9 Punkt 1): schickt
Titel/Text/Tag als Web-Push NUR an die eigenen Geraete des
Angemeldeten. `push-senden` blieb unberuehrt (verweigert
Absender=Empfaenger, ist im Betrieb). Client: `pushAnMich()` in
benachrichtigung.js; `ergebnisMelden` (ergebnisse.js) baut je
Kombination "Gewonnen: Nr. 41 (Sascha) bei Stake: +780.00 € - Stand
Sascha bei Stake: 680.50 €" (Stand aus personPruefen, dieselbe
Rechnung wie der Anbieter-Kopf), zeigt oertlich UND pusht mit
gleichem tag (keine Doppel-Meldung). Wecker-Schalter Gewinne/Verluste
gelten (gemessen).

### Fassung 20260902i: DER SERVER-WAECHTER (Karams "sehr wichtig")

Der fruehere Grenz-Hinweis ("laeuft nur bei offenem Geraet") ist
GESCHICHTE: Supabase prueft jetzt selbst, rund um die Uhr.

- **Spalte `kt_scheine.beine`** (Migration scheine_beine_fuer_serverscan):
  je Schein UNverschluesselt NUR `{satz, wetten:[{spiel, linie, an}]}`.
  BEWUSSTE ABWAEGUNG: ohne diese Offenlegung kann kein Server pruefen.
  Einsaetze, Quoten, moeglich, Personen, Fotos, Notizen bleiben
  Ende-zu-Ende in `daten` (gemessen: beineAus traegt keine Geldzahl).
  supa.js `beineAus()` ist die EINE Stelle; supaScheinAnlegen und
  supaScheinDatenSchreiben ziehen beine immer mit;
  ergebnisseAuswerten traegt sie alten offenen Scheinen einmalig nach.
- **Edge Function `ergebnis-scan`** (Version 2): liest offene Scheine
  mit beine, sucht Endstaende vorbei gelaufener Spiele (TheSportsDB,
  dieselben eisernen Regeln, Quelle "automatisch (Server)", nie
  ueberschreiben), entscheidet ueber `scheinEntscheiden` (EIN Weg fuer
  Echtlauf und Probe): ein verlorenes Bein = sofort verloren (geht
  ohne Quote/Einsatz), alle Beine gut = gewonnen; Stand-Wechsel nur
  solange stand='offen'. Push an die Geraete des Bereichs-Besitzers,
  OHNE Betraege (verschluesselt). Drossel: ein Echtlauf je 4 Minuten.
  Probe-Betrieb: POST {probe:{scheine,ergebnisse}} rechnet nur.
  Am Server gemessen: 6 Faelle alle richtig (verloren trotz offenem
  Bein, gewonnen, offen, Absage=zurueck, unklar bleibt offen,
  halbverloren=gewonnen).
- **Uhr**: pg_cron + pg_net, Job "ergebnis-scan" alle 10 Minuten mit
  dem OEFFENTLICHEN anon-Schluessel. Gemessen: Marke
  ergebnis_scan_zuletzt in kt_geheim springt zur vollen 10-Minuten-
  Marke von selbst.
- **Der Client rechnet die Betraege nach**: fuer server-entschiedene
  Gewinne fuellt ergebnisseAuswerten echt_zurueck beim naechsten
  Oeffnen (Karams moeglich-Wert schlaegt die Maschine; vorhandene
  Zahlen werden NIE ueberschrieben; gemessen: 200 aus 100 x 2,0).
- **DRIFT-REGELN (Geld!)**: auswertung.js laeuft als beim Deploy
  erzeugte 1:1-Kopie (auswertung.mjs = Datei + export-Zeile) im
  Waechter - wer auswertung.js aendert, deployt ergebnis-scan neu.
  ergTeamPasst existiert wortgleich in ergebnisse.js UND index.ts der
  Funktion. Verweise stehen in allen Dateien.

### Weitere offene Punkte
1. Dokumentierte Graubereiche der Maschine (bewusst so): 15er-Deckel nur
   fuer nacktes over/under; DC "12" unbekannt; Team-Totals per Teamname
   -> unklar; Handicaps ab 4 -> unklar.
2. Punkte aus Abschnitt 9 (push-senden, TURN, neuBauen-Fotos) unveraendert.
3. Karam traegt heute (02.09.) noch alle aktuellen Staende ein und
   liefert die Zahlen zu Einzahlungen und Wettgewinn fuer die
   Buchhaltung - danach stehen buchhaltungs- und eintragsspezifische
   Aufgaben an (seine Worte, noch nicht naeher beschrieben).
4. Karam testet den Misch-Automaten "die Tage" und will danach am
   Design weitermachen.

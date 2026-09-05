# Kombi-Tafel — Übergabe

Stand: **05.09.2026**, Fassung `20260905b` (Abschnitt 14 zuerst lesen!).
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

### Fassung 20260902j (03.09. frueh): Misch-Ziel + Konto-Haertung

- **Misch-Ziel**: Feld "jeder Einsatz insgesamt [N] mal" neben dem
  Misch-Knopf (mischZielLesen: sichtbares Feld schlaegt kt_misch_ziel,
  Standard 2). Der Automat zaehlt Nutzungen je Anbieter aus den
  GESETZTEN Kombinationen; am Ziel = raus aus dem Topf, darunter =
  mehrfach hinein bis zum Ziel; Paar-Sperre/Dreier-Gurt/Anbieter-Treue
  unveraendert. Zielverfehlungen werden NAMENTLICH gemeldet.
  Gemessen: Ziel 2 dann 3 ueber dieselben 12 Einsaetze, 0 Verstoesse.
- **gesetzt-Spalte im Eigenbau ist LINIEN-genau** (proLinie): die Summe
  steht an der Zeile der wirklich gesetzten Linie; Altbestand ohne
  Linie zaehlt zur ersten Zeile. Gruppen-Optik: 3px-Kante je Spiel,
  gestrichelte Kante zwischen Linien desselben Spiels (Redesign-Layer).
- **Stiller-0-Schutz** in personPruefen: gewonnen ohne Betrag (kein
  echt_zurueck, kein moeglich) landet als Problem-Meldung in der
  Personen-Kasse statt stumm mit 0 gutgeschrieben zu werden. Die
  Plus-Minus-Kette der Konten wurde auf zweitem Weg gegengerechnet
  (einge - geholt - einsatz + gewonnen + korrektur), Gewinne fliessen
  mit Server-Waechter + echt_zurueck-Nachtrag vollautomatisch.
- Merke fuer Messungen: bricht mischOhnePaare ab ("nichts veraendert"),
  bleiben die ALTEN Bau-Scheine im Zustand stehen - ein Pruefer, der
  danach z.scheine liest, sieht keine neuen. Und das sichtbare
  Ziel-Feld schlaegt localStorage.

### Fassung 20260902k: Klingel = Verlauf zuerst, Alle-Geraete-Probe, Anruf klopft nach

- Klingel-Klick zeigt ZUERST den Meldungs-Verlauf, die kompletten
  Einstellungen stecken hinter dem Zahnrad (weckerEinstellungenUmschalten,
  IDs/Handler unveraendert).
- weckerProbeAlle: ECHTE Server-Probe an alle eigenen Geraete via
  pushAnMich/ergebnis-push (derselbe Weg wie Gewonnen/Verloren), nennt
  "hinausgeschickt an X von Y" und aufgeraeumte veraltete Adressen.
  Der alte Panel-Text "Probe an dich selbst kann nicht ankommen" war
  seit ergebnis-push falsch und ist korrigiert.
- Zur Meldung "es kommt gar nix an": Karams iPhone (als App) und
  Windows-Chrome SIND in kt_push_abos (28./29.08.); an sich selbst
  konnte bis zum Server-Waechter technisch nie etwas gehen. Die Probe
  klaert in Sekunden, ob die alten Geraete-Adressen noch leben -
  wenn nicht: Geraet rauswerfen, Klingel dort neu einschalten.
- Anruf: im 3-s-Klingel-Timer geht bei jedem dritten Tick (alle 9 s)
  ein frischer Anruf-Push hinaus (tag "anruf" + renotify = klingelt
  am Handy jedes Mal neu), bis angenommen oder Ende. push-senden
  unveraendert. Anruf-Pfad im Sandkasten nicht ausfuehrbar - nur
  Syntax geprueft, Zusatz haengt am lange laufenden Timer.

### Fassung 20260902l: Berichte in der Buchhaltung

Abschnitt "Berichte: filtern, ansehen, herunterladen" nach den grossen
Karten. EIN Daten-Rechenweg (berichtDaten) fuer Bildschirm, PDF und
Word: Filter Zeitraum (alles/Woche/Monat/letzter Monat/von-bis),
Anbieter, Person (inkl. "ohne"), Foto-Ordner; Haken fuer Statistik/
Kombinationen/Personen-Buchungen (kt_bericht_wahl). Gewinn-Formel =
Konto-Tabelle (zurueck minus entschiedene Einsaetze, gegengerechnet
+180 = 780-600). berichtInnenHtml rendert mit INLINE-Farben (Word
kennt kein Stylesheet); tuBerichtPdf = Druckfenster-Muster des
Kassen-PDFs, tuBerichtWord = .doc per Blob (Word liest HTML). Warnt
sichtbar bei gewonnenen Kombinationen ohne Betrag.

### Fassung 20260902m: Misch-Automat auf SPIEL-Ebene + hartes Hoechstlimit

Karams Fund (03.09.): bei Ziel 9/10 kamen zwei SPIELE zweimal
miteinander. Ursache: die Paar-Sperre lief auf Wetten-Kennungen, und
ein [doppelt]-Spiel hat MEHRERE Kennungen (over- und under-Linie) -
dieselben Spiele kamen ueber andere Linien wieder zusammen.

- **mischSpielSchluessel(spiel, id)** (kombis.js): der Sperr-Schluessel
  ist jetzt der normalisierte SPIELTEXT (klein, Leerraum gebuendelt);
  ohne lesbaren Text Rueckfall auf "id:"+Kennung. gesetztePaare, die
  Paar-Checks im Misch-Loop UND der Dreier-Gurt laufen alle auf dieser
  Ebene; zusaetzlich prueft der Loop die In-Kombi-Verschiedenheit auch
  ueber den Spiel-Schluessel.
- **Hartes Hoechstlimit, ANGESAGT** (Karam: "das muss anerkannt
  werden"): je Anbieter maxJeKz = max(1, floor((SpieleImTopf-1)/2)) -
  reine Mathematik (jede Verwendung eines Spiels verbraucht 2 seiner
  S-1 moeglichen Partner). Liegt das Ziel darueber, rechnet der Automat
  mit dem Limit und SAGT es: ACHTUNG-Zeile in der Rueckfrage ("max X"),
  Toepfe-Zeilen mit "Hoechstlimit X-mal", Erfolgsmeldung "(Ziel N auf
  Hoechstlimit X gedeckelt)", Verfehlt-Liste "fehlt noch Nx zum
  Limit X".
- Gemessen (Fund-Szenario nachgestellt: 12 Einsaetze bei Stake, davon
  tw1+tw13 = DASSELBE Spiel ueber zwei Linien -> 11 Spiele, dazu tw12
  im Ordner aber NIE gesetzt, Ziel 9): Rueckfrage nennt Hoechstlimit 5
  und ACHTUNG; 13 Kombis in Runde 1, danach ehrliche "Keine neue
  Kombination moeglich"-Meldung; ueber ALLES (4 Gesetzte + 13 Neue)
  KEIN Spiel-Paar doppelt, kein Spiel doppelt IN einer Kombi, kein
  Spiel oefter als 5x, und tw12 (ungesetzt) tauchte NIRGENDS auf.
- In der Verfehlt-Liste kann dasselbe Spiel zweimal stehen (je Linie
  ein Einsatz) - das ist ehrlich gemeint: zwei Einsaetze, ein Spiel.

### Fassung 20260903a: Interwetten-Quote gilt UNGETEILT, Gebuehr nur noch rueckwaerts

Karams Regel (03.09.): "Ich will, dass die Quote, die ich eingebe, die
echte ist" - die pauschale Vorab-Teilung durch 1,05 lag meistens
daneben. Und: "wenn alles ausgerechnet ist, schreib ich den
hoechstmoeglichen Gewinn und dann rechnest du die Gebuehren aus."

- **GEBUEHREN_TEILER: iw auf 1.00** (daten.js:32 plus die ZWEI lokalen
  Kopien in verteiler.js Z.~79 und ~780 - alle drei muessen immer
  zusammen geaendert werden). Damit neutralisieren sich ALLE
  Teil-Stellen von selbst: zielQuote/quoteEintragen (kombis.js),
  echteQuote/zelleAnbieter/rangliste (logik.js), verteiler-R5,
  Pflichtquoten-Umrechnung, netto-Suffix im Fotonamen, "minus
  Gebuehr"/"waere real"-Hinweise (alle an teiler!==1 gebunden).
- **Die Gebuehr entsteht NUR noch rueckwaerts**: moeglich-Feld an der
  Schein-Karte = vom Anbieter angesagter Hoechstgewinn; gebuehrText/
  baueVerlaufsEintrag rechnen Gebuehr = Einsatz x Rohquote minus
  angesagt (gab es schon, ist jetzt der EINZIGE Weg). Gemessen:
  100 EUR x 2,0, angesagt 190 -> Gebuehr 10,00 (5,0 %); angesagt
  200 -> "ohne Gebuehr"; 210 -> Warnung "mehr als der Schein hergibt".
- **Nachrechnen (mein.js pruefAlles)**: Pruefung 2 verlangt nicht mehr
  moeglich == Einsatz x Quote, sondern moeglich <= Einsatz x Quote
  (Differenz = Gebuehr); FEHLER nur bei mehr, WARNUNG bei ueber 10 %
  Abzug (so viel nimmt kein Anbieter). Die alte Pruefung 3 ("Gebuehr
  von jeder Quote abgezogen") ist ersatzlos raus - ihre Praemisse ist
  tot. pruefTeiler geloescht.
- **tuEinsatz** radiert den angesagten Gewinn nicht mehr weg: beim
  Einsatz-Aendern skaliert moeglich im Verhaeltnis der Einsaetze mit
  (Rueckfall Einsatz x Quote nur ohne brauchbaren Altwert).
- **Texte nachgezogen**: hilfe.html (Ablauf, AGB-Tabelle, "real",
  Interwetten-besser, BESTER), kombis.html (Regel 1, Fussnote),
  schule.html Kapitel 8 (Zahlentabelle bleibt als Erklaerung, die
  Schwelle ist jetzt Faustregel), logik.js (ANBIETER_GRUND.iw,
  Info-Zeile). admin.js (Saschas-Tabellen-Heuristik Spalte H = G/1,05)
  bleibt UNBERUEHRT - das ist Foto-Einlesen, nicht Live-Quote.
- **Server-Waechter braucht NICHTS**: index.ts und auswertung.mjs
  rechnen nirgends mit Gebuehr oder Teiler (per MCP geprueft);
  auswertung.js wurde nicht angefasst, also kein Redeploy.
- ALT-Bestand: vor dem 03.09. gespeicherte IW-Scheine tragen die
  geteilte Quote und passen weiter zu ihrer eigenen Rechnung -
  Pruefung 2 laesst sie in Ruhe.

### Fassung 20260903b/c: Ungesetzte wegraeumen + Mischen je EINEM Anbieter

Zwei Wuensche von Karam am 03.09., beide im Kombi-Bau, beide in
`kombis.js`.

**b) Knopf "Ungesetzte loeschen"** (oben rechts in der Panel-Leiste,
neben "jeder Einsatz insgesamt"). `panelOffeneLoeschen()` wirft in einem
Zug alles aus dem Bau, wo noch NICHTS gesetzt wurde.

- Die Menge ist genau die hinter der Kachel "noch nichts gesetzt":
  Scheine, deren `stammId` im Verlauf (Geraet UND Konto) nicht vorkommt.
- Gesetztes wird nie angefasst. Fotos gehen nur weg, wenn kein
  Verlaufseintrag mehr daran haengt (`fotoNochGebraucht`) - dieselbe
  Regel wie beim Einzel-Loeschen.
- **Unlesbar-Riegel:** eine Konto-Kombination ohne Schluessel verraet
  ihre `scheinId` nicht, ihr Stamm heisst `db:...` und trifft nie einen
  Schein im Bau. Eine in Wahrheit GESETZTE Kombination saehe hier also
  ungesetzt aus. Beim Einzel-Loeschen waere das ein Fehler, bei einem
  Massen-Loeschen ein teurer - deshalb steht die Warnung mit Zahl ganz
  oben in der Rueckfrage.
- Optik in `stil.css` (`.pn-leeren`), loeschbar ohne Funktionsverlust.

**c) Mischen: erst den Anbieter aussuchen.** Karams Worte: "es duerfen
nur von dem einen Anbieter ... ich muss es mir dann aussuchen, dann
mische ich diese Kombis."

- Vorher lief `mischOhnePaare()` ueber ALLE Anbieter auf einmal. Danach
  stand der Bau voll mit Kombinationen bei Anbietern, an die Karam gar
  nicht gedacht hatte - fuer ihn sahen die aus wie Einsaetze, die er nie
  gesetzt hat.
- Jetzt: `kzListe = [kz1]`. Ist oben eine Anbieter-Karte angetippt
  (`bauAnbieterFilter`), gilt die als Auswahl; sonst fragt der Knopf per
  `prompt` mit Topfgroesse je Anbieter. Genau ein moeglicher Topf laeuft
  ohne Frage durch.
- **Wichtig:** von den ungesetzten Scheinen fallen nur die des
  gewaehlten Anbieters weg (`s.kz === kz1`). Sonst raeumte eine
  Stake-Mischung die ungesetzten Bwin-Kombinationen still mit ab.
- Unveraendert: Topf NUR aus dort gesetzten Kombinationen, Paar-Sperre
  aus gesetzten Kombinationen, Hoechstlimit `floor((S-1)/2)`,
  Dreier-Gurt. Der Server-Waechter ist nicht betroffen
  (`auswertung.js` unberuehrt, kein Redeploy).

### Fassung 20260903d: Anbieter-Wechsel zieht den Verlauf nach

Karams Fall (03.09.): eine Kombination lag versehentlich auf Stake, in
Wahrheit war es Interwetten. Er stellt die Karte im Bau auf Interwetten
um - und oben stehen weiter neun bei Stake und eine bei Interwetten.

**Warum:** `anbieterWechseln()` hat nur `sch.kz` im ZUSTAND geaendert.
Die Anbieter-Kacheln oben und die Buchhaltung kommen aber aus dem
VERLAUF (`gesetzteEintraege`), und dort stand weiter Stake - oertlich
wie im Konto-Eintrag der Person.

**Jetzt:** neue Funktion `verlaufAnbieterNachziehen(scheinId, neuKz)`,
aufgerufen aus `anbieterWechseln` (jetzt `async`), sobald
`schonGesetzt(scheinId)` etwas findet.

- oertlich: `liesVerlauf()` -> `kz` + `anbieter` setzen ->
  `speichereVerlauf()`.
- Konto: passende `kontoScheine` finden (`daten.scheinId`), `daten`
  aendern und mit `supaScheinDatenSchreiben(id, key, daten)` NEU
  VERSCHLUESSELT schreiben (`kryptoBereich(u.id)`), danach
  `kontoScheineLaden()`. `beine` zieht supa.js selbst mit.
- Die 0-Zeilen-Falle wird geprueft: `r.data.length === 0` heisst an RLS
  gescheitert und wird als "NICHT umgestellt" gemeldet, nicht als Erfolg.
- Die Meldung sagt ausdruecklich, WAS mitgezogen wurde und was nicht.

**Was bewusst stehen bleibt:** Einsatz, Quote, moeglicher Gewinn,
Gebuehr. Das sind die Zahlen, die beim Anbieter wirklich auf dem Schein
standen; sie aendern sich nicht dadurch, dass hier das falsche Etikett
klebte. Neu rechnen hiesse, eine echte Zahl durch eine geschaetzte zu
ersetzen.

### Fassung 20260903e: Misch-Ziel Standard 1 + Grenze je Anbieter sichtbar

Karam am 03.09.: "bei drei Kombis kann ich nicht neunmal jede Zahl
vorkommen lassen, ohne dass sich das wiederholt. Ich moechte, dass eins
immer der Standard ist ... und sag mir, du kannst bei Stake so viel
mischen, bei Interwetten nur zweimal."

**Standard ist jetzt 1.** `mischZielLesen()` und das Feld im Panel
gehen von 1 aus statt von 2. 1 heisst "jeder Einsatz einmal im Spiel" -
und das ist er bereits, also passiert nichts. `mischOhnePaare()` bricht
bei `ziel <= 1` gleich mit einer Erklaerung ab, statt still nichts zu
tun. 2 heisst "jeder ein zweites Mal", und so weiter bis zur Grenze.

**Die Grenze steht jetzt unter dem Knopf**, nicht erst in der
Rueckfrage: `mischGrenzenHtml()` schreibt je Anbieter, wie oft jeder
Einsatz hoechstens vorkommen kann, wie viele verschiedene Spiele im
Topf liegen und wie viele Kombinationen der Topf insgesamt hergibt.
Steht die Zahl im Feld darueber, wird die Zeile ROT und sagt, dass dort
gedeckelt wird. `mischZielGeaendert()` schreibt das beim Tippen neu
(nur den Kasten, kein `zeichne_()`).

**Die Rechnung** (unveraendert, jetzt nur sichtbar): ein Spiel hat im
Topf (S-1) moegliche Partner, jede Verwendung verbraucht zwei davon,
kein Paar darf sich wiederholen -> hoechstens `floor((S-1)/2)`-mal je
Einsatz, insgesamt `floor(S*max/3)` Kombinationen.
Karams Beispiel geht auf: 3 gesetzte Kombis = 9 Spiele -> 4-mal je
Einsatz, 12 Kombinationen insgesamt, davon 3 schon gesetzt = 9 neue.

**EINE Quelle für beide Wege:** `mischToepfe()` und `mischGrenzen()`
sind aus `mischOhnePaare()` herausgezogen; der Knopf nutzt jetzt
dieselben Funktionen wie die Anzeige. Zwei Rechenwege waeren zwei
Wahrheiten, und die driften auseinander - genau diese Fehlerklasse
steht schon in `code-fehler-vermeiden`.

Weiter gilt: es wird nur bei EINEM Anbieter gemischt (Abschnitt
20260903b/c), Anbieter mischen sich nie untereinander.

### Fassung 20260903f: Altfaelle heilen - "Verlauf angleichen"

20260903d zieht den Anbieter-Wechsel nach. Was es NICHT tut: schon
bestehende Abweichungen heilen. Karams Fall genau: er hatte die Karte
vor dem Update auf Interwetten gestellt, im Verlauf stand weiter Stake,
und oben blieben neun bei Stake. Von selbst geht das nie weg -
`anbieterWechseln` steigt aus, wenn die Karte schon richtig steht.

- `bauVerlaufAbweichungen()` vergleicht je Schein im Bau die EXAKTE
  Kennung mit den Verlaufseintraegen und meldet jede Zeile, in der
  `e.kz !== s.kz`.
- Das Panel zeigt die Liste als Warnung ("Verlauf X, Karte Y") mit dem
  Hinweis, dass die Kacheln oben den Verlauf zaehlen, plus Knopf
  **Verlauf angleichen**.
- `bauVerlaufAngleichen()` fragt einmal mit allen Zeilen und ruft dann
  je Schein `verlaufAnbieterNachziehen()` (Geraet + Konto, neu
  verschluesselt). Einsatz, Quote, moeglicher Gewinn bleiben.
- Bewusst NICHT still im Hintergrund beim Zeichnen: das sind
  Buchhaltungseintraege.

### Fassung 20260905a: Bereich fixieren + Fussleiste am Handy + Feinschliff

**FUNKTION - Bereich fixieren (Pin):**
- Tabelle `kt_bereich_pins` (nutzer, bereich; RLS: nur eigene Pins,
  Anlegen nur mit Freigabe oder eigener Bereich; Migration
  bereich_pins_fuer_benachrichtigungen). supa.js: supaPinsLaden/
  supaPinSetzen (mit 0-Zeilen-Wache). mein.js: Pin-Knopf 📌 NEBEN
  jedem geteilten Bereichs-Tab (tuBereichPin), gepinnte Bereiche
  stehen in der Tab-Leiste direkt nach dem eigenen.
- **OFFEN, MUSS-PUNKT: ergebnis-scan Version 3 deployen.** Die fertige
  index.ts liegt in `server/ergebnis-scan.index.ts` (Push an Besitzer
  UND Fixierer-mit-Freigabe; Anleitung in server/LIES-MICH.md).
  Der MCP-Deploy scheiterte am 05.09. die GANZE Session an einem
  Werkzeug-Schema-Fehler (alle Parameter kamen als Text an, ZodError
  "expected boolean/array, received string" - auch im Unteragenten).
  Bis zum Deploy speichert die App Pins, aber der Waechter (live:
  Version 2) beachtet sie noch nicht - Karam weiss das.
- Nach dem Deploy: Probe-Betrieb messen + get_edge_function (version 3)
  gegenlesen. auswertung.js wurde NICHT geaendert (auswertung.mjs beim
  Deploy frisch aus auswertung.js erzeugen, siehe LIES-MICH).

**DESIGN (zwei loeschbare Schichten, Funktion unberuehrt):**
- `leiste.js` (NEU, auf allen 6 Seiten nach handy.js): Fussleiste am
  Handy im WhatsApp-Stil - FUENF grosse Knoepfe unten (Chat, Tafel,
  Kombi-Bau, Bereich, Profil; 56px hoch, weit auseinander), badge vom
  Kopf-Chat-Knopf wird per MutationObserver gespiegelt (nur abgelesen).
  Auf mein.html oeffnen Chat/Profil die vorhandenen Ansichten
  (mbAnsichtOeffnen via Poll bis die App steht), von anderen Seiten
  per mein.html#chat/#profil. Am Handy startet mein.html im CHAT
  (Karams Wunsch 05.09., bewusste Ausnahme von "nie in Sonder-Ansicht
  starten" - nur schmal, nur mein.html, steckt in leiste.js).
- stil.css "DESIGN-REWORK 05.09.2026" am Dateiende: Kopfleiste
  (Seiten links, persoenliche Knopf-Gruppe ab #nav_freunde rechts,
  einheitliche 38px-Knoepfe), mb-navi als 4er-Raster (Handy 2er),
  Pin-Knopf-Optik, Buchhaltung symmetrisch (bb-kacheln als Raster
  mit gleichen Hoehen, Kassenbuch rollt ab 420px mit stehender
  Kopfzeile), Fussleisten-Optik; am Handy verschwinden oben die
  Links, die unten liegen (Tafel/Kombi-Bau/Mein Bereich/Chat) -
  oben bleiben Handbuch, Erklaerungen, Freunde, Klingel.
- RUECKWEG: stil.css-Block "DESIGN-REWORK 05.09.2026" loeschen +
  leiste.js samt der sechs script-Zeilen loeschen = alles wie vorher.
- Gemessen (Pane-Artefakt beachten: verstecktes Fenster meldet
  Breite 0 = "schmal"! Immer resize_window setzen): Desktop 1280
  Leiste none + Freunde-Gruppe rechts (margin 184px); Handy 375
  Leiste fixed 5 Spalten, Knopf 56x66, body-Polster 88px, oben
  korrekt ausgeduennt, aktiver Knopf je Seite, Klick Chat ->
  mein.html. Pin-UI und Chat-Start brauchen Anmeldung - nicht im
  Sandkasten messbar, Code-Review + 0-Zeilen-Wachen stattdessen.

### Fassung 20260905b: Handy entdoppelt, kurze Meldungen, maennlicher Look, Schnell-Rechner

- Handy: #nav_profil oben ausgeblendet (liegt unten in der Fussleiste);
  leiste.js klappt lange Erklaerkaesten (.kern/.fuellkern/.zeitkern/
  p.mini ab 160 Zeichen) auf 2 Zeilen ein, Tipp oeffnet - warnkern/
  #meldung/Kassenwarnung NIE; MutationObserver (400-ms-Drossel) fuer
  nachgebaute Kaesten. Klapp-CSS wirkt NUR unter 700px (gemessen:
  breites Fenster schneidet nichts ab).
- Meldungen gekuerzt (Karam: "viel kuerzer, Details behalten"):
  kombis.js quoteEintragen/Mahnung/Misch-Trio/Kein-Ersatz/Eigenbau,
  mein.js Pin + fertighinweis. Muster: Fettkern + Zahlen, kein Absatz.
- Kein Lila: Kennfarben handbuch -> #4e342e (Kastanie), mein ->
  #8a5a00 (Bronze) - NUR Override in der 05.09-Schicht; die
  Tippgeber-Zeilenfarben sind Bedeutung und blieben unangetastet.
  Buttons: Grundton mit Kante/Verlauf/Gewicht (spezifischere
  Alt-Regeln gewinnen weiter), button.haupt = Kennfarben-Verlauf
  (color-mix mit einfachem Fallback), Body-Grund als ruhiger
  Grauverlauf. Handbuch/Erklaerungen: kl-abschnitt als Karten mit
  Kennkante, Tabellen mit Luft, volle Breite bleibt.
- NEU pk-Rechner (mein.js, Personen-Kasse unter der Anbieter-Tabelle):
  je Anbieter rein/raus aus der Kasse + Feld "aktuell drauf" ->
  Gewinn = aktuell + raus - rein, live (pkRechner/pkRechnerText).
  REINER Rechner: localStorage kt_rechner_<ordner>_<kz>, bucht NICHTS.
  Ohne Anmeldung nicht messbar - Formel einfach, Felder numerisch.

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

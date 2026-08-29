# Kombi-Tafel — Übergabe

Stand: **29.08.2026**, Fassung `20260829ah`.
Damit fängst du in einem neuen Chat da an, wo wir aufgehört haben.

---

## 1. Worum es geht

Karam verwaltet mit Freunden **echtes Geld**. Aus einer Tabelle mit Wetten
werden **3er-Kombinationen** gebaut, bei vier Anbietern gesetzt, fotografiert
und abgerechnet. Alles läuft im Browser, ohne Build-Schritt.

**Das ist kein Bastelprojekt.** Ein Rechenfehler kostet Geld, ein vertauschtes
Foto kostet Vertrauen. Bei Zweifeln lieber messen als annehmen.

| | |
|---|---|
| **Live** | https://harryclaude-hub.github.io/kombi-tafel/ |
| **Repo** | `harryclaude-hub/kombi-tafel` (öffentlich, GitHub Pages) |
| **Lokal** | `C:\Users\Home\kombi-tafel` |
| **Supabase** | Projekt der Kombi-Tafel (siehe `supa.js`), RLS aktiv, Ende-zu-Ende verschlüsselt |
| **Anrede** | Karam (auch „Kai"). Antwort auf Deutsch, einfache Sprache, militärischer Ton erlaubt: „Jawohl, Chef" |

---

## 2. Die vier Anbieter und die eine Rechenregel

Reihenfolge steht an **einer** Stelle: `KT_ANBIETER_RANG = ["st","iw","bw","b3"]`
in `kombis.js`.

1. **Stake** (`st`) — erste Wahl
2. **Interwetten** (`iw`)
3. **Bwin** (`bw`) — Sportingbet ist derselbe Anbieter
4. **Bet365** (`b3`) — letzte Wahl

**Die Gebührenregel, die alles durchzieht:**
`GEBUEHREN_TEILER = { iw: 1.05, bw: 1, b3: 1, st: 1 }`

Nur **Interwetten** gibt die 5 % Gebühr weiter: die angezeigte Quote wird
**durch 1,05 geteilt**. Eine Quote 2,00 bei Interwetten ist in Wirklichkeit
1,90. Deshalb steht bei Interwetten eine höhere Mindestquote (1,89 statt 1,80)
— das ist **kein Fehler**, das ist dieselbe Regel in der Währung des Anbieters.

**Mindestquote:** die feste Zahl gilt, das Foto ist nur eine Schätzung.
Drüber = grün, drunter = rot, **genau drauf = grün**.

---

## 3. Die Dateien

Kein Build, kein Bundler. Reine `.js`-Dateien, in den HTML-Seiten
eingebunden — die Reihenfolge der `<script>`-Zeilen ist die Ladereihenfolge.

**Kern:**

| Datei | Was drin steckt |
|---|---|
| `kombis.js` | Kombi-Bau: Zustand, Scheine, Verlauf, Panel. Die größte Datei. |
| `verteiler.js` | Die **zwei** Verteil-Verfahren `verteilePaare` und `verteileSuche`; `verteileBeste` wählt das bessere aus. **Änderungen IMMER in beiden**, sonst gewinnt mal das eine, mal das andere. `bericht.verfahren` sagt, welches gewonnen hat. |
| `logik.js` | Anbieter, Gebührenteiler, `rund2`, `anbieterName` |
| `mein.js` | Mein Bereich: Personen, Kombinationen (= Verlauf), Konto, Buchhaltung, Tagesübersicht |
| `einzeln.js` | Modus „Einer nach dem anderen": eine Kombination, tauschen bis sie passt, Gedächtnis je Anbieter |
| `supa.js` | Alles Richtung Datenbank |
| `krypto.js` | Ende-zu-Ende (`e2eZu` / `e2eAuf`), Schlüssel je Bereich und je Person |
| `anruf.js` / `anruf-server.js` | Anrufe (WebRTC). **Alle STUN/TURN-Adressen nur in `anruf-server.js`.** |

**Löschbare Schichten** (Karams Regel, siehe Abschnitt 8):

| Datei | Was |
|---|---|
| `zeilen.js` | Zebra-Zeilen, Nummerierung, Fotos klein/groß |
| Ende von `stil.css` | Alle neuen Design-Schichten hängen hinten dran |

**Werkzeug:**

| Datei | Was |
|---|---|
| `naechste-fassung.js` | Vergibt die `?v=`-Nummer. **Nie raten!** Siehe Abschnitt 4. |
| `PRUEFBERICHT-2026-08-29.md` | 38 Befunde, 16 von 17 Punkten abgehakt |

---

## 4. Die Fassungsnummer — die wichtigste Handregel

Jede HTML-Seite hängt `?v=JJJJMMTT<Buchstabe>` an jede `.js`/`.css`/`.png`.
Ohne das führt der Browser tagelang alten Code aus.

```bash
node naechste-fassung.js --setzen
```

**Nie selbst eine Nummer ausdenken.** Am 29.08. habe ich `20260829b` zweimal
vergeben — Browser haben den alten Code behalten, und meine Live-Prüfungen sahen
aus, als sei die Veröffentlichung fehlgeschlagen. Das Skript liest die
Git-Geschichte, geht nie rückwärts und zählt hinter `z` mit `aa`, `ab` weiter.

**Danach immer live nachsehen**, ob die neue Nummer wirklich draußen ist —
GitHub Pages braucht 1–3 Minuten:

```bash
curl -s "https://harryclaude-hub.github.io/kombi-tafel/kombis.html?cb=$RANDOM" | grep -o 'v=[0-9a-z]*' | head -1
```

---

## 5. Die drei Zahlen an einer Kombination

Das habe ich am 29.08. **falsch gemacht und dann repariert** — bitte nicht
wieder zusammenwerfen:

| Zahl | Wo sie herkommt | Darf sie sich wiederholen? |
|---|---|---|
| **`nr`** | intern, hält die Teile einer Kombination zusammen | **ja**, fängt bei jedem Bauen wieder bei 1 an |
| **Anzeige** | `anzeigeNr(z, nr)`, beim Zeichnen berechnet | läuft immer 1..N, neu bei jedem Mischen |
| **`id`** | technischer Schlüssel `S<Durchgang>-<lfd>` | **NIEMALS** — daran hängt das Foto (`foto_<id>`) |
| **`nummer`** | Karams feste Nummer, entsteht **nur** beim Speichern in `baueVerlaufsEintrag` | **NIEMALS** — danach sucht er |

**Warum das wichtig ist:** als die `id` noch aus der `nr` gebaut wurde
(`id = "S" + nr`), hieß die erste Kombination von heute genauso wie die von
gestern — und das Foto von gestern klebte an der neuen Kombination. Bei echtem
Geld ist das kein Schönheitsfehler.

`kt_bau_lfd` zählt die Bau-Durchgänge und macht die `id` eindeutig.
`kt_schein_nr` ist die feste Nummer und wird **nur beim Setzen** verbraucht.

---

## 6. Was es alles kann (Stand heute)

**Kombi-Bau (`kombis.html`)**

- **Panel ganz oben**: noch nichts gesetzt / gesetzt aber nicht voll /
  voll gesetzt / insgesamt gesetzt, darunter namentlich, wo Geld fehlt,
  und ein Knopf „Rest neu mischen"
- Anbieter steht **als Erstes** im Kopf jedes Scheins: „Stake · hier suchen"
- Ziel 400 € je Kombination; reicht ein Anbieter nicht, wird geteilt
  (`_t2`) oder anders gemischt (`_m2`)
- „Anbieter hat die Wette nicht" → **die ganze Kombination** wandert zum
  nächsten Anbieter, alle drei Wetten bleiben. Erst wenn keiner der vier
  sie hat, fliegt die Wette raus. Gemerkt in `kt_nicht_da`.
- Fällt eine Wette raus, rückt Ersatz nach — **nur aus demselben Ordner** —
  bis wirklich nichts mehr da ist (`ERSATZ_MAX_NUTZUNG = 2`,
  Notfall 3, weil ein voller Bau jede der 51 Wetten genau zweimal braucht)
- Modus **„Einer nach dem anderen"**: eine Kombination, tauschen bis sie
  passt, Gedächtnis je Anbieter, Anzeige des Durchgangs
- Foto vom Wettschein oder Bildschirm-Ausschnitt, klein rechts, Klick = groß

**Mein Bereich (`mein.html`)**

- **Zwei Verläufe** über einen Schalter: Alle / Voll gesetzt / Nicht voll
  gesetzt, mit Zahlen und dem Ziel-Betrag zum Ändern. Teile einer
  Kombination zählen **zusammen** gegen das Ziel.
- Personen, Personenkasse, Konto je Bereich, Buchhaltung, Tagesübersicht
- **„Wirklich drauf"**: Stand bei Geldhaltern (PayPal) und Anbietern direkt
  eintragen, ohne Überweisung, jederzeit änderbar, mit Rückfrage.
  Differenzen gelten als „ungeklärt" und bleiben aus dem Gewinn raus.
- Mülleimer mit Rückfrage und Rechteprüfung

**Drumherum:** Chat mit Ende-zu-Ende, Lesebestätigung in drei Stufen
(1 Punkt = nicht verschickt, 2 = verschickt, 3 = empfangen, grün = gelesen),
Anrufe über WLAN mit Bild des Anrufers in der Benachrichtigung,
Anruf-Fenster unten rechts mit Stummschalten und Auflegen (verschiebbar),
Zebra-Zeilen in vier Farben, Nummerierung.

---

## 7. Was offen ist

1. **`push-senden` lässt sich nicht neu veröffentlichen.** Das MCP macht aus
   dem `files`-Feld eine Zeichenkette, es gibt keine Supabase-CLI und keinen
   `SUPABASE_ACCESS_TOKEN`. Solange das so ist, bleibt die Funktion, wie sie ist.
2. **Punkt 13 aus dem Prüfbericht**: Benutzername → E-Mail ist für jeden lesbar.
   Braucht eine Edge Function — hängt an Punkt 1.
3. **TURN-Server für Anrufe über Mobilfunk.** Über WLAN läuft es. Für Mobilfunk
   bräuchte es Zugangsdaten von metered.ca — die muss Karam holen.
   `openrelay.metered.ca` ist **tot** (gemessen); ein toter Eintrag kostet
   9 Sekunden je Anruf. Deshalb steht `KT_TURN = []`.
4. **Fotos und Buchhaltung** werden gerade erst befüllt. Wenn Karam von
   komischen Zahlen erzählt: erst nachsehen, was wirklich in der Datenbank steht.

---

## 8. Karams Regeln — die sind nicht verhandelbar

**Nur aus dem Ordner.**
> „Nur von den Ordner, nix aus fremdem Ordner. Das ist für mich die strengste
> Disziplin. Du darfst nix aus anderen Orten holen."

Ersatzwetten, Auffüllen, Neumischen: **alles** kommt aus dem gerade gewählten
Ordner. Nie aus einem anderen.

**Design von Funktion trennen.**
Design ist eine eigene, löschbare Schicht. Neue Optik hinten an `stil.css`,
Handy-Regeln in `@media (max-width: 700px)`. Beim Designen **niemals** einen
Rechenweg anfassen.

**Erst sehen, dann urteilen.**
Browser-Ansicht offen halten und `elementFromPoint` prüfen. Reine DOM-Werte
übersehen Overlays.

**Beide Verfahren gleichzeitig.**
`verteilePaare` und `verteileSuche` immer zusammen ändern.

**Vor dem Schreiben alle Anker prüfen.**
Patch-Skripte erst alle Fundstellen zählen, dann schreiben. Das Repo hat
`core.autocrlf=true`, Patches müssen CRLF erhalten.

**Keine Lovable-Credits.** Selbst coden, eigenes Supabase, GitHub Pages.

---

## 9. Fehlerklassen, die hier immer wieder auftreten

Das sind echte Funde, keine Theorie:

- **Stille Fehlschläge.** Etwas wird gelöscht/gespeichert, das Ergebnis
  weggeworfen — beim nächsten Laden steht alles wieder da, niemand weiß warum.
  Immer `.select()` prüfen und das Ergebnis auswerten.
- **Namensgleichheit ohne Sachbezug.** Zwei Zahlen heißen gleich und sind es
  nicht (siehe Abschnitt 5).
- **Drift zwischen zwei Fassungen.** Zwei Listen für dasselbe, eine wird
  gepflegt. Deshalb ist der Verlauf **eine** Liste mit einem Schalter.
- **`toFixed` rundet ab.** Eine geforderte Quote von 1,8476 wird als 1,84
  angezeigt und dann als 1,84 geprüft — zu wenig. Aufrunden, wo eine
  Untergrenze gemeint ist.
- **`type="number"` verschluckt „250,50"** je nach Spracheinstellung.
  Immer `type="text" inputmode="decimal"` und selbst umwandeln.
- **Meine eigenen Prüfungen sind auch nur Code.** `const WETTEN` lässt sich
  nicht über `window.X` überschreiben; ein `window.__m` für zwei Messungen
  gelesen ergibt eine falsche „Fehlermeldung".
- **Gegenprüfung lohnt sich.** Eine Runde mit mehreren unabhängigen Prüfern
  hat in einer einzigen meiner Änderungen **acht** echte Fehler gefunden.

---

## 10. So arbeitest du hier

```bash
# 1. Ändern (Patch-Skript im Scratchpad, alle Anker vorher zählen)
node --check kombis.js && node --check mein.js

# 2. Fassung setzen
node naechste-fassung.js --setzen

# 3. Lokal ansehen: .claude/launch.json enthält "kombi-tafel" auf Port 8791
#    (preview_start nutzen, nie einen Server über Bash starten)

# 4. Hochladen
git add -A && git commit -m "..." && git push origin main

# 5. Live nachsehen, ob die neue Fassung wirklich draußen ist
```

**Commit-Nachrichten** sind hier ausführlich und auf Deutsch: was war das
Problem, warum war es eines, was ist gemessen worden. Das ist bewusst so —
es ist die einzige Erklärung, die später noch da ist.

---

## 11. Wenn Karam schreibt

Er beschreibt Probleme aus seiner Sicht, nicht in Code. „Die Zahlen addieren
sich" hieß: die Anzeige-Nummer lief hoch statt bei 1 anzufangen. „Warum steht
da unter Quote" hieß: er hat bei Stake gesucht, während der Schein bei
Interwetten stand.

**Erst herausfinden, was er wirklich sieht.** Dann messen. Dann bauen.

# Pruefbericht vom 29.08.2026

Sechs Pruefer haben unabhaengig gesucht, jeder Fund musste danach einen
Widerlegungsversuch ueberstehen. 38 Funde sind stehengeblieben.
Stand 29.08.2026, spaeter Abend: 16 von 17 Punkten sind behoben und mit
[ERLEDIGT] abgehakt. Offen bleibt nur Punkt 13 (Benutzername zu E-Mail):
der braucht eine neue Fassung der Server-Funktion, und die laesst sich von
hier aus nicht hochladen - die Bruecke zu Supabase macht aus der Dateiliste
einen Text, ein Supabase-CLI ist nicht da und kein Zugangsschluessel in der
Umgebung. Punkt 12 war ohnehin kein Fehler; dort wurde der irrefuehrende
Satz im Kopf von krypto.js richtiggestellt.

---

# Abschluss-Bericht kombi-tafel (nur gelesen, nichts geaendert)

## Zusammengefasst oder gestrichen

- **Die Notiz-Sache stand zweimal drin** (beide mein.js:875). Ist ein Fehler, nicht zwei. Ich habe sie mit den anderen ungeschuetzten Stellen derselben Tabelle zu Punkt 11 zusammengelegt, weil es dieselbe Zeile Code, dieselbe Ursache und dieselbe Behebung ist.
- **Zwei Foto-Funde des Einlesens sind derselbe Fehler** (admin.js:247 und admin.js:860). Ursache ist in beiden Faellen: `vsUebernehmen` gibt kein Ergebnis zurueck und verschluckt fehlgeschlagene Speicherungen. Zusammengelegt zu Punkt 5.
- **Kein Fehler im Programm ist Punkt 12** (Schluessel-Safe auf dem Server). Das ist so gebaut und gewollt, sonst koenntest du dich auf einem neuen Handy nie wieder einloggen. Falsch ist nur der Satz im Kopf von krypto.js, der etwas anderes verspricht. Ich lasse es unter Sicherheit stehen, aber als Abwaegung, nicht als Fehler.
- Alle uebrigen Funde habe ich noch einmal Zeile fuer Zeile am Code nachgeschaut. Sie stehen.

---

## Was echtes Geld kostet

**[ERLEDIGT] 1. Ein Schein, der sich nicht entschluesseln laesst, zaehlt still mit 0 Euro**
Datei: supa.js:171, wirkt in mein.js:806, 1089, 1094, 1575, 2232
Was passiert: Wenn ein Schein nicht lesbar ist, wird er durch einen Ersatz mit Einsatz 0, Quote 0, Gewinn 0 ersetzt und mit dem Merkmal `gesperrt` versehen. Dieses Merkmal wird in KEINER Geldrechnung abgefragt, nur beim Kopieren (mein.js:908). Der Schein steht also weiter in der Tabelle, aber mit 0 Euro.
Wann: auf einem Geraet ohne den passenden Schluessel, oder als Gast in einem geteilten Bereich ohne Schluessel. Gefaehrlich ist besonders das frische Geraet, weil dort neue Schluessel angelegt werden und die Oberflaeche sogar "Alles funktioniert" meldet.
Folge: 12 offene Scheine zu 400 Euro erscheinen als "im Spiel 0,00 Euro", und in der Personen-Kasse wachsen die 4800 Euro faelschlich als "liegt dort" an. Keine Warnung.
Kleinste Behebung: in `zeichneBereich` zaehlen, wie viele Scheine `gesperrt` sind, und bei mehr als null einen roten Kasten ueber die Tabellen setzen. Zusaetzlich diese Scheine aus den Summen herausnehmen, statt sie mit 0 mitzurechnen.

**[ERLEDIGT] 2. Teil-Import legt Scheine doppelt an**
Datei: mein.js:621
Was passiert: Beim Uebernehmen der lokalen Scheine ins Konto wird die lokale Liste nur geleert, wenn ALLE durchgingen. Geht einer schief, bleibt die ganze Liste liegen, auch die schon erfolgreich uebertragenen, und der Knopf wird wieder angezeigt.
Wann: 20 Scheine, Nummer 14 scheitert (Netz weg, Foto zu gross). Meldung: "Nur 19 von 20 uebernommen". Zweiter Druck auf den Knopf legt die 19 ein zweites Mal an, es gibt keine Doppelt-Pruefung (supa.js:186).
Folge: 19 mal 400 Euro stehen doppelt in der Datenbank, in "Im Spiel", in der Anbieter-Tabelle und beim Personen-Einsatz.
Kleinste Behebung: in der Schleife die fehlgeschlagenen Eintraege sammeln und den Verlauf auf genau diese kuerzen, statt alles liegen zu lassen.

**[ERLEDIGT] 3. Fotos nachschieben legt den ganzen Ordner ein zweites Mal an**
Datei: admin.js:851
Was passiert: Die Pruefung "steht schon im Ordner" baut ihren Vergleichsschluessel ohne das Feld `wette`. Damit endet jeder Schluessel der vorhandenen Wetten auf "undefined", waehrend die neue Zeile ihren echten Text einsetzt. Die beiden koennen sich nie treffen, die Pruefung greift nie.
Wann: sobald du zu einem Datum weitere Fotos nachlegst. Das Einlesen liest immer ALLE Fotos des Tages neu (supa.js:555), also auch die schon eingelesenen.
Folge: alle alten Zeilen stehen doppelt im Ordner. Der Kombi-Bau baut daraus zwar keinen Dreier mit demselben Spiel (das sperrt kombis.js:816), aber dasselbe Spiel landet in ZWEI verschiedenen Scheinen, also doppelter Einsatz auf dasselbe Ergebnis.
Kleinste Behebung: in admin.js:852 das Feld `wette: w.wette` in das Vergleichsobjekt aufnehmen.

**[ERLEDIGT] 4. Die Interwetten-Spalte wird als zusaetzliche Wett-Option gespeichert**
Datei: admin.js:557 und 585, wirkt in admin.js:857
Was passiert: Beim Einlesen werden ALLE Zahlenfelder einer Zeile als Quoten gesammelt. Saschas Tabelle hat aber zwei Quotenspalten (roh.js: Spalte G und Spalte H, H ist G geteilt durch 1,05). Beide werden gesammelt, und daraus wird eine erfundene zweite Option namens "Option 2" mit dem schon gekuerzten Wert. Dazu fuehrt die LETZTE Zahl als angezeigte Quote, also die Interwetten-Spalte.
Wann: bei jeder Foto-Zeile mit zwei Quotenspalten, also praktisch immer. Beispiel 1.01: 2.30 und 2.19. Bei Zeile 1.02 entstehen sogar vier Optionen.
Folge: die Vorschau zeigt die falsche (bereits gekuerzte) Quote als "Quote", und im Kombi-Bau ist eine sinnlose "Option 2" waehlbar, deren Rechengrundlage schon um 5 Prozent reduziert ist. Nebenwirkung: korrigierst du das Quote-Feld von Hand, wird die Korrektur verworfen, sobald mehrere Quoten in der Zeile stehen.
Kleinste Behebung: in admin.js:585 die Liste entdoppeln und jeden Wert streichen, der auf 0,02 genau einem anderen Wert geteilt durch 1,05 entspricht.

---

## Was Daten kostet

**[ERLEDIGT] 5. Das automatische Einlesen meldet Erfolg, obwohl nichts gespeichert wurde** (zwei Funde, ein Fehler)
Datei: admin.js:249 und admin.js:860 bis 865
Was passiert: `vsUebernehmen` gibt auf keinem Weg ein Ergebnis zurueck. Fehlgeschlagene Speicherungen werden nur nicht mitgezaehlt, sonst nichts. Bricht es ganz ab (Satz nicht angelegt), laeuft der Durchlauf trotzdem weiter. Danach werden ausnahmslos alle Fotos auf "eingelesen" gesetzt.
Wann: kurzer Netzabriss oder eine abgelehnte Zeile mitten in der Schleife.
Folge: Meldung in gruen "45 saubere Zeilen sind schon drin", obwohl sie weder in der Datenbank noch in der Vorschau stehen. Und die Fotos gelten als abgearbeitet, der Hinweis "X noch nicht eingelesen" verschwindet. Die Fotos selbst bleiben erhalten, nachtragbar ist es also, nur merkt es niemand.
Kleinste Behebung: `vsUebernehmen` ein Ergebnis zurueckgeben lassen ({ ok, fehler }), in admin.js:249 pruefen und abbrechen, und die Fotos nur dann auf "eingelesen" setzen, wenn kein Fehler auftrat.

**[ERLEDIGT] 6. Rollenwechsel loescht den Schluessel des Gastes**
Datei: supa.js:150, Meldung mein.js:593
Was passiert: Beim Teilen wird das Schluessel-Feld IMMER mitgeschrieben, auch wenn es leer ist. Der bereits verteilte, gueltige Schluessel des Gastes wird dann mit leer ueberschrieben. Die Meldung sagt in jedem Fall "Rolle geaendert", auch bei Fehler.
Wann: nur wenn auf deinem Geraet der rote Kasten "Einmalig: Schluessel freischalten" steht und du trotzdem bei einem Gast die Rolle umstellst. Im Normalfall holt sich das Programm die Schluessel selbst.
Folge: der Gast sieht ab sofort ueberall "[verschluesselt - Schluessel fehlt]".
Kleinste Behebung: das Feld nur in den Datensatz schreiben, wenn wirklich ein Schluessel berechnet wurde, und in mein.js:593 das Ergebnis auswerten wie beim normalen Teilen.

**[ERLEDIGT] 7. Personendaten werden nach einem missglueckten Laden mit leeren Feldern ueberschrieben**
Datei: supa.js:569 (Laden), mein.js:2409 (Speichern)
Was passiert: Das Laden der Personendaten prueft den Fehler ueberhaupt nicht und ueberspringt unlesbare Zeilen stumm. Fehlt der Eintrag danach, liefert die Karte ein frisches leeres Objekt. Speicherst du dann etwas, wird der alte Datensatz komplett ueberschrieben.
Wann: Ladefehler (Supabase 546, Verbindungspool, Netz) oder wenn der Schluessel zwar da ist, aber nicht zu den alten Daten passt.
Folge: IBAN, Ausweisdaten und die Verweise auf alle hochgeladenen Dokumente sind weg, die Dateien liegen verwaist im Speicher. Meldung: "Personendaten gespeichert."
Kleinste Behebung: beim Laden im Fehlerfall einen Merker zurueckgeben und solange der steht, den Speichern-Knopf gar nicht anzeigen, sondern einen roten Hinweis.

**[ERLEDIGT] 8. Ein einziger fehlgeschlagener Ladevorgang zeichnet den ganzen Bereich als leer**
Datei: mein.js:781 bis 787, Ursache in supa.js:162, 381, 439, 486, 331
Was passiert: Alle fuenf Lader geben im Fehlerfall stumm eine leere Liste zurueck. Nichts wird geloescht, aber die Ansicht sieht aus wie beim Verlust der 49 Zeilen: "Noch keine Scheine hier", "0,00 Euro im Spiel", Personen-Kasse auf null.
Wann: bei einem 546er oder wenn der Verbindungspool voll ist.
Folge gefaehrlich: laedt die Ordnerliste leer, haelt das Anlegen jeden Namen fuer neu und legt die Person ein zweites Mal an (supa.js:398, der Notnagel gegen Dubletten kann nicht greifen, weil die Namen verschluesselt sind).
Kleinste Behebung: den fuenf Ladern einen Fehlerweg geben, in `zeichneBereich` einmal auswerten und im Fehlerfall die alte Ansicht stehen lassen plus roter Kasten "Laden fehlgeschlagen, nichts wurde geaendert".

**[ERLEDIGT] 9. Ist der Browser-Speicher voll, verschwindet der neue Verlaufseintrag ohne Meldung**
Datei: kombis.js:950
Was passiert: Das Schreiben in den lokalen Speicher hat kein Auffangnetz. Ist er voll (die Scheinfotos liegen im selben Kontingent), fliegt der Fehler heraus, bevor die Erfolgsmeldung kommt. Es erscheint weder gruen noch rot etwas, der Schein steht nirgends. Der schon gespeicherte Verlauf bleibt heil, verloren geht nur der neue Eintrag.
Wann: ohne Konto oder mit abgelaufener Sitzung, nach ein paar Dutzend Scheinfotos. Genau in diesem Weg ist der lokale Verlauf die einzige Aufzeichnung des Einsatzes.
Kleinste Behebung: dieselbe Absicherung wie beim Foto-Speichern nebenan (kombis.js:456 bis 476): Fehler abfangen, false zurueckgeben, rote Meldung ausgeben.

**[ERLEDIGT] 10. Die Glocke zu machen bricht eine laufende Sprachaufnahme des Bereichs-Chats ab**
Datei: glocke.js:166
Was passiert: Beim Schliessen wird die Aufnahme abgebrochen, ohne zu pruefen, wem sie gehoert, obwohl das Programm die Quelle kennt (medien.js:180) und an allen anderen Stellen auch abfragt.
Wann: du nimmst im Bereichs-Chat eine Sprach- oder Videonachricht auf und tippst zwischendurch auf die Glocke.
Folge: das Gesprochene ist weg, ohne Meldung. Der Knopf im Bereichs-Chat sagt weiter "Stopp und senden", der naechste Druck startet in Wahrheit eine neue Aufnahme.
Kleinste Behebung: in glocke.js:166 dieselbe Abfrage wie ueberall sonst: nur abbrechen, wenn die Aufnahme wirklich aus der Glocke stammt (`aufnahmeLaeuft("gp-ton")` oder `"gp-video"`).

---

## Sicherheit

**[ERLEDIGT] 11. Die Scheine-Tabelle wird ungeschuetzt zusammengebaut** (drei Funde, eine Ursache)
Datei: mein.js:862 (Spiel und Linie), 863 (Fotoname), 864 (Foto), 875 und 876 (Notiz), dazu dieselbe Foto-Stelle in mein.js:1124
Was passiert: An diesen Stellen werden fremde Texte direkt in die Seite geklebt, ohne die Schutzfunktion `textSicherM`, die es im selben Modul gibt (mein.js:640) und die drei Bildschirme weiter unten fuer genau dieselbe Art Feld ausdruecklich benutzt wird, samt Kommentar warum.
Wann: ein Mitarbeiter darf in einem geteilten Bereich schreiben (Rolle "close"). Alles, was er eintippt oder in den Schein schreibt, landet ungeprueft in DEINEM Browser, sobald du den Bereich oeffnest. Beim Foto reicht ein Anfuehrungszeichen, um aus dem Bild-Feld auszubrechen, die einzige Pruefung schaut nur auf den Anfang "data:" (supa.js:176).
Folge: fremder Code laeuft in deiner Sitzung, dort wo deine Ende-zu-Ende-Schluessel liegen. Es gibt im ganzen Projekt keine Schutzschicht dagegen (keine CSP, kein Reiniger).
Kleinste Behebung: an allen sechs Stellen den Wert durch `textSicherM(...)` schicken. Das reicht auch fuer das Foto-Feld, weil `textSicherM` das Anfuehrungszeichen ersetzt und Base64 unveraendert laesst.

**[ERLEDIGT] 12. Der private Schluessel geht im Klartext zum Server** (Abwaegung, kein Programmierfehler)
Datei: krypto.js:406, Edge-Funktion "schluessel"
Was passiert: Beim Anmelden werden der private Schluessel und der Bereichsschluessel unverpackt an die Server-Funktion geschickt, die sie erst dort verschluesselt, mit einem Geheimnis, das in derselben Datenbank liegt (Tabelle kt_geheim). Beim Abholen genuegt ein gueltiges Anmelde-Token, kein Passwort.
Warum es trotzdem drin ist: ohne diesen Safe kaemst du auf einem neuen Geraet nie wieder an deine alten Daten. Das ist eine bewusste Bequemlichkeit.
Was falsch ist: die Zusage in krypto.js:4 ("Die Datenbank sieht nur verschluesselte Pakete") stimmt so nicht mehr.
Kleinste Behebung, falls du es dichter willst: die beiden Schluessel schon im Browser mit einem aus deinem Passwort abgeleiteten Schluessel verpacken (die Funktion dafuer gibt es, krypto.js:54), dann sieht der Server nur noch ein undurchsichtiges Paket.

**[OFFEN] 13. Jeder Fremde kann Benutzername zu E-Mail aufloesen**
Datei: supa.js:64, dazu die Datenbank-Funktion `kt_email_fuer_username`
Was passiert: Diese Funktion laeuft mit erhoehten Rechten, greift auf die Anmelde-Tabelle zu und hat keinerlei Pruefung, wer fragt. Das Ausfuehrungsrecht liegt bei "jeder, auch unangemeldet".
Wann: jederzeit. Der oeffentliche Schluessel steht in supa.js:10 und das Projekt liegt offen auf GitHub.
Folge: mit einem selbst angelegten Gratis-Konto liest man ueber kt_profiles zusaetzlich alle Benutzernamen und kann so die vollstaendige Liste Name plus E-Mail aller Freunde abziehen. Geschuetzt sind nur Konten ohne echte E-Mail.
Kleinste Behebung: das Ausfuehrungsrecht der Funktion fuer "anon" und "public" entziehen und die Aufloesung in eine Server-Funktion verlegen, die die E-Mail nie herausgibt, sondern gleich selbst anmeldet.

**[ERLEDIGT] 14. Der Fotoname liegt unverschluesselt in der Datenbank**
Datei: supa.js:190
Was passiert: Alles andere am Schein wird verschluesselt (Daten, Foto, Notiz), der Fotoname nicht.
Was da drinsteht: nicht der Handy-Dateiname, sondern der vom Programm gebaute Text (kombis.js:424), also Anbieter, Spielkuerzel, Einsatz in Euro, alle Einzelquoten, Gesamtquote und Datum. Beispiel: "Interwetten BAY_DOR_RMA 400.00EUR 1.85x2.10x1.30 Q5.05netto 28.08.2026". Also praktisch der ganze Scheininhalt, offen lesbar fuer jeden, der die Datenbank sieht.
Kleinste Behebung: den Fotonamen genauso durch die Verschluesselung schicken wie die Notiz und beim Laden zurueckholen. Alte Eintraege bleiben lesbar, weil unverschluesselter Text unveraendert durchgereicht wird.

**[ERLEDIGT] 15. Die Benutzersuche behandelt Unterstrich und Prozent als Platzhalter**
Datei: supa.js:114, Aufrufer mein.js:576 und supa.js:251
Was passiert: Die Suche vergleicht mit einem Muster statt genau. Der Unterstrich ist im Benutzernamen erlaubt und gleichzeitig ein Joker fuer ein beliebiges Zeichen.
Wann: du tippst im Teilen-Feld "max_karam", dieses Konto gibt es nicht, aber "maxXkaram" schon.
Folge: der Bereich wird samt Ende-zu-Ende-Schluessel an ein fremdes Konto gegeben. Die Erfolgsmeldung mit dem Namen kommt erst DANACH, du siehst den falschen Empfaenger zu spaet.
Kleinste Behebung: statt Muster-Vergleich einen Gleichheits-Vergleich verwenden, oder die Zeichen % und _ vor der Suche maskieren.

---

## Kaputtes

**[ERLEDIGT] 16. Beim Wechsel des Gespraechs in der Glocke laeuft der alte Takt weiter**
Datei: glocke.js:301 und 302, dazu 369 und 409
Was passiert: Der alte 10-Sekunden-Takt wird erst NACH dem netzgebundenen Nachladen weggeraeumt. In diesem Fenster startet er ein zweites Nachladen mit demselben Startwert. Beide laden alle Nachrichten und haengen sie an.
Wann: bei jedem Wechsel in ein anderes Gespraech, verstaerkt beim Einstieg ueber das Freunde-Panel, weil dort der alte Takt gar nicht gestoppt wird.
Folge: der Verlauf steht doppelt da, und der Ungelesen-Zaehler wird auf einen Stand gesetzt, der gar nicht angezeigt wurde. Nachrichten gehen nicht verloren, sie stehen weiter in der Datenbank.
Kleinste Behebung: den Takt sofort am Anfang von `glockeThread` stoppen (die Zeile aus 302 direkt hinter 252 ziehen) und im Nachladen den Partner in eine eigene Variable legen und vor dem Anhaengen pruefen, ob es noch derselbe ist.

---

## Stoerendes

**[ERLEDIGT] 17. Doppeltipp auf Mikrofon oder Kamera laesst eine Aufnahme herrenlos weiterlaufen**
Datei: medien.js:141
Was passiert: Die Sperre "es laeuft schon eine Aufnahme" steht VOR der Erlaubnisfrage des Browsers, gesetzt wird der Merker erst danach (medien.js:155). Zwei Antippen waehrend der Frage kommen beide durch.
Wann: beim ersten Mal, wenn der Browser um Erlaubnis fragt und es aussieht, als sei nichts passiert.
Folge: zwei Aufnahmen laufen, nur die zweite ist noch erreichbar. Mikrofon oder Kamera bleiben bis zum Neuladen der Seite an (Kamera-Leuchte an).
Kleinste Behebung: den Merker sofort setzen (zum Beispiel `_aufnahme = { laedt: true }` vor der Erlaubnisfrage) und im Fehlerfall wieder loeschen.

---

## Antwort auf deine Frage

Der Foto-Weg kann morgen NICHT scharf benutzt werden (Punkte 3, 4 und 5 kosten dort direkt Geld oder verschweigen Fehlschlaege), und die Buchhaltung nur mit der Einschraenkung, dass du sie ausschliesslich auf deinem gewohnten Geraet mit funktionierendem Schluessel oeffnest und jede Summe misstrauisch pruefst, solange Punkt 1 und Punkt 8 offen sind.
// ============================================================
// DIE 38 ALTEN SCHEINE IN DEN BEREICH EINTRAGEN
// ============================================================
// Karam (17.09.2026) hat 38 Fotos vom 25. bis 28.08.2026 geschickt und
// wollte, dass sie in seinem Konto landen - mit Einsatz, Quote,
// moeglichem Gewinn, nur Datum ohne Uhrzeit, und zu KEINER Person.
//
// WARUM DAS HIER LAEUFT UND NICHT AUF DEM SERVER.
// Die Daten eines Scheins liegen Ende zu Ende verschluesselt in der
// Datenbank. Der Schluessel dafuer entsteht aus Karams Passwort und
// liegt NUR in seinem Browser. Auf dem Server sieht niemand etwas, auch
// ich nicht, und niemand kann von aussen einen lesbaren Schein
// hineinschreiben. Deshalb laeuft dieser Import DORT, wo der Schluessel
// schon ist: in seinem angemeldeten Browser. Ein Knopf, fertig.
// Genau denselben Weg nimmt der Personen-Import (personen-import.js).
//
// WAS ER ANLEGT
// Die Zahlen stehen in altscheine.js, eine Zeile je Foto, abgelesen und
// nicht gerechnet. Hier wird daraus ein Schein in derselben Form, die
// baueVerlaufsEintrag (Kombi-Bau) und pkSpeichern (Kombi von Hand)
// erzeugen. Der moegliche Gewinn wird UEBERNOMMEN, nicht aus Einsatz mal
// Quote gerechnet: bei Interwetten geht eine Gebuehr ab, bei Bet365 kommt
// ein Bonus dazu, und der Schein zeigt die Wahrheit.
//
// FOTOS
// Die Bilddateien liegen auf Karams Rechner, nicht im Programm. Er waehlt
// den Ordner aus, die Dateien werden ueber ihren NAMEN zugeordnet. Wer
// keine Datei waehlt, bekommt die Scheine ohne Bild - das steht dann
// dabei, es verschwindet nichts stillschweigend.
//
// ZWEIMAL DRUECKEN LEGT NICHT ZWEIMAL AN
// Vor dem Anlegen wird geprueft, ob ein Schein mit derselben Kennung
// schon im Bereich liegt. Bei Geld ist ein zweiter Klick sonst ein
// zweiter Einsatz.

"use strict";

// Feste Kennung je Schein. Sie enthaelt das Datum und die Nummer des
// Fotos und ist damit fuer denselben Schein immer dieselbe - daran
// erkennt der zweite Durchgang, was schon da ist.
function altScheinId(s) { return "ALT-" + s.datum + "-" + s.nr; }

// Karam (17.09.2026): "Du erstellst den Ordner. Das Datum ist 25. bis
// 28. August 2026. Und die sind halt einfach die aeltesten Kombis, die
// es gibt." Der Ordner wird beim Anlegen mit erzeugt, er muss nichts
// vorbereiten. Die Kennung faengt mit dem 25.08. an, damit er in jeder
// nach Datum sortierten Liste ganz unten steht - als aeltester.
// Karam hat den Ordner am 17.09.2026 selbst im Admin angelegt und die 38
// Fotos hineingeladen. Es wird deshalb KEIN zweiter erzeugt - zwei Ordner
// fuer dieselben Scheine waeren nur Verwirrung. Fehlt er wider Erwarten,
// wird er unter derselben Kennung nachgelegt.
// Die Kennung faengt mit dem 25.08. an und steht damit vor jeder anderen:
// der Ordner ist der aelteste, genau wie Karam es wollte.
const ALT_SATZ = "2026-08-25-bis-28";
const ALT_SATZ_TITEL = "Fotos vom 25.08.2026 (bis-28)";

let altBilder = {};        // Dateiname -> Daten-URL
let altAuswahl = null;     // Set der angehakten Nummern, null = noch nicht gebaut

function altGewaehlt() {
  if (altAuswahl) return altAuswahl;
  altAuswahl = new Set();
  // Vorab angehakt ist alles AUSSER dem Doppelfoto und dem, was nicht in
  // den Zeitraum gehoert. Beide bleiben sichtbar und anhakbar.
  for (const s of ALT_SCHEINE) if (!s.doppelt && !s.ausserhalb) altAuswahl.add(s.nr);
  return altAuswahl;
}

function altUm(nr) {
  const a = altGewaehlt();
  if (a.has(nr)) a.delete(nr); else a.add(nr);
  altZeichnen();
}

function altAnbieterSetzen(nr, kz) {
  const s = ALT_SCHEINE.find(x => x.nr === nr);
  if (s) s.kz = kz;
  altZeichnen();
}

function altDatumSetzen(nr, wert) {
  const s = ALT_SCHEINE.find(x => x.nr === nr);
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(wert)) s.datum = wert;
  altZeichnen();
}

// Die Bilddateien einlesen. Zuordnung ueber den Dateinamen, nicht ueber
// die Reihenfolge - eine andere Sortierung im Dateiwaehler wuerde sonst
// jedem Schein das falsche Bild anhaengen.
async function altBilderWaehlen(eingabe) {
  const dateien = [...(eingabe.files || [])];
  if (!dateien.length) return;
  let gelesen = 0, fremd = 0;
  const gebraucht = new Set(ALT_SCHEINE.map(s => s.foto));
  for (const d of dateien) {
    if (!gebraucht.has(d.name)) { fremd++; continue; }
    try {
      altBilder[d.name] = await new Promise((fertig, schief) => {
        const l = new FileReader();
        l.onload = () => fertig(l.result);
        l.onerror = () => schief(new Error("nicht lesbar"));
        l.readAsDataURL(d);
      });
      gelesen++;
    } catch (e) { /* zaehlt unten als fehlend */ }
  }
  const fehlen = ALT_SCHEINE.filter(s => !altBilder[s.foto]).length;
  meldungM("<b>" + gelesen + " Bilder eingelesen.</b>" +
    (fremd ? " " + fremd + " Datei(en) gehoeren nicht dazu und wurden uebergangen." : "") +
    (fehlen ? " <b>" + fehlen + "</b> Schein(e) haben noch kein Bild." : " Alle Scheine haben ein Bild."),
    fehlen ? "warn" : "gut");
  altZeichnen();
}

function altPanelHtml() {
  return '<div class="altkasten" id="altkasten"></div>';
}

function altZeichnen() {
  const k = el("altkasten");
  if (!k) return;
  const gew = altGewaehlt();
  const liste = ALT_SCHEINE.filter(s => gew.has(s.nr));
  const s = altSumme(liste);
  const ohneBild = liste.filter(x => !altBilder[x.foto]).length;

  const anbieter = (typeof ANBIETER !== "undefined" ? ANBIETER : []).map(a => a.kz);
  const zeilen = ALT_SCHEINE.slice().sort((a, b) =>
    (a.datum + String(a.nr).padStart(3, "0")).localeCompare(b.datum + String(b.nr).padStart(3, "0"))
  ).map(x => {
    const an = gew.has(x.nr);
    const bild = altBilder[x.foto];
    return "<tr" + (an ? "" : ' class="alt-aus"') + ">" +
      '<td><input type="checkbox"' + (an ? " checked" : "") +
        ' onchange="altUm(' + x.nr + ')"></td>' +
      "<td>" + x.nr + "</td>" +
      '<td><input type="date" value="' + x.datum +
        '" onchange="altDatumSetzen(' + x.nr + ', this.value)"></td>' +
      "<td><select onchange=\"altAnbieterSetzen(" + x.nr + ", this.value)\">" +
        anbieter.map(kz => '<option value="' + kz + '"' + (kz === x.kz ? " selected" : "") +
          ">" + textSicherM(anbieterName(kz) || kz) + "</option>").join("") + "</select></td>" +
      '<td class="tb-q">' + x.ein.toFixed(2) + "</td>" +
      '<td class="tb-q">' + x.quote.toFixed(2) + "</td>" +
      '<td class="tb-q"><b>' + x.gew.toFixed(2) + "</b></td>" +
      "<td>" + (bild ? '<span class="gruen mini">Bild da</span>'
                     : '<span class="mini warnton">kein Bild</span>') + "</td>" +
      '<td class="mini">' + x.beine.map(b => textSicherM(b[0])).join("<br>") + "</td>" +
      '<td class="mini">' +
        (x.doppelt ? "<b>gleicher Schein wie Nr. " + x.doppelt + "</b>" : "") +
        (x.ausserhalb ? "<b>Dateidatum 15.09., nicht Ende August</b>" : "") +
      "</td></tr>";
  }).join("");

  k.innerHTML =
    "<h3>&#128194; Die 38 alten Scheine (25. bis 28.08.2026)</h3>" +
    '<p class="mini">Abgelesen von den Fotos, Bild fuer Bild. Der <b>moegliche Gewinn</b> ist ' +
      "der Betrag, den der Anbieter gezeigt hat, nicht Einsatz mal Quote - bei Interwetten geht " +
      "eine Gebuehr ab, bei Bet365 kommt ein Bonus dazu. " +
      "Die Scheine bekommen <b>keine Person</b>, so wie du es wolltest, und nur ein Datum ohne Uhrzeit.</p>" +
    '<p><label class="fotoknopf">&#128247; Die 38 Bilder dazu waehlen' +
      '<input type="file" accept="image/*" multiple style="display:none" ' +
      'onchange="altBilderWaehlen(this)"></label> ' +
      '<span class="mini">Im Telegram-Ordner alle 38 markieren. Ohne Bilder geht es auch, ' +
      "dann sind die Scheine ohne Nachweis.</span></p>" +
    '<div class="altsumme">' +
      "<b>" + s.anzahl + "</b> Scheine angehakt &nbsp;|&nbsp; Einsatz zusammen <b>" +
      s.einsatz.toFixed(2) + " &euro;</b> &nbsp;|&nbsp; moeglicher Gewinn zusammen <b>" +
      s.gewinn.toFixed(2) + " &euro;</b>" +
      (ohneBild ? ' &nbsp;|&nbsp; <span class="warnton">' + ohneBild + " ohne Bild</span>" : "") +
    "</div>" +
    '<div class="tabellenrand"><table class="tb-tafel"><thead><tr>' +
      "<th></th><th>Nr.</th><th>Datum</th><th>Anbieter</th><th>Einsatz</th>" +
      "<th>Quote</th><th>Gewinn</th><th>Bild</th><th>Spiele</th><th></th>" +
      "</tr></thead><tbody>" + zeilen + "</tbody></table></div>" +
    '<p><button class="haupt" onclick="altAnlegen()">&#10133; Die ' + s.anzahl +
      " angehakten Scheine anlegen</button> " +
      '<span class="mini">Zweimal dr&uuml;cken legt nichts doppelt an - was schon da ist, ' +
      "wird uebersprungen und gez&auml;hlt.</span></p>";
}

async function altAnlegen() {
  if (!darfSchreiben()) { meldungM("Dazu fehlt dir das Schreibrecht in diesem Bereich.", "warn"); return; }
  const gew = altGewaehlt();
  const liste = ALT_SCHEINE.filter(s => gew.has(s.nr));
  if (!liste.length) { meldungM("Es ist kein Schein angehakt.", "warn"); return; }
  const s = altSumme(liste);
  const ohneBild = liste.filter(x => !altBilder[x.foto]).length;

  if (!confirm("Diese " + s.anzahl + " Scheine jetzt anlegen?\n\n" +
      "   Einsatz zusammen:  " + s.einsatz.toFixed(2) + " Euro\n" +
      "   Moeglicher Gewinn: " + s.gewinn.toFixed(2) + " Euro\n" +
      (ohneBild ? "   OHNE BILD:         " + ohneBild + " Schein(e)\n" : "") +
      "\nSie bekommen KEINE Person und zaehlen ab sofort in Konto und\n" +
      "Buchhaltung mit. Sie stehen alle auf offen - gewonnen oder\n" +
      "verloren traegst du selbst ein.")) return;

  // Erst den Ordner. Schlaegt das fehl, wird trotzdem weitergemacht -
  // die Scheine sind wichtiger als ihre Ueberschrift -, aber es steht
  // am Ende dabei.
  let ordnerText = "";
  if (typeof supaSatzAnlegen === "function") {
    try {
      const r = await supaSatzAnlegen(ALT_SATZ, ALT_SATZ_TITEL);
      if (r && r.error) ordnerText = " Der Ordner liess sich nicht anlegen (" +
        textSicherM(String(r.error.message).slice(0, 60)) + "), die Scheine stehen trotzdem da.";
    } catch (e) {
      ordnerText = " Der Ordner liess sich nicht anlegen, die Scheine stehen trotzdem da.";
    }
  }

  // Was liegt schon da? Ueber die feste Kennung, nicht ueber Betraege.
  const schon = new Set();
  for (const x of (kasseScheine || [])) {
    const d = x.daten || {};
    if (d.scheinId) schon.add(String(d.scheinId));
  }

  let neu = 0, uebersprungen = 0;
  const schief = [];
  for (const x of liste) {
    const id = altScheinId(x);
    if (schon.has(id)) { uebersprungen++; continue; }
    const daten = {
      // Nur das Datum, keine Uhrzeit - so wollte Karam es. 12:00 Uhr
      // steht da, damit die Zeitzone den Tag nicht verschiebt.
      zeit: new Date(x.datum + "T12:00:00").toISOString(),
      scheinId: id,
      kz: x.kz,
      satz: ALT_SATZ,        // der Ordner "Alte Scheine 25. bis 28.08.2026"
      nummer: null,
      anbieter: (typeof anbieterName === "function" ? anbieterName(x.kz) : x.kz),
      einsatz: x.ein,
      quote: x.quote,
      moeglich: x.gew,        // ABGELESEN, nicht gerechnet
      wetten: x.beine.map(b => ({
        spiel: b[0], wette: b[1], linie: b[1],
        an_zeit: b[3] || "", quote: b[2], quelle: "altfoto"
      })),
      stand: "offen",
      notiz: "Alter Schein vom " + x.datum.split("-").reverse().join(".") +
             ", nachtraeglich vom Foto eingetragen.",
      handeingabe: true,
      altfoto: x.foto
    };
    const bild = altBilder[x.foto] || null;
    // Der letzte Wert ist der Zeitpunkt: created_at MUSS auf den alten
    // Tag gesetzt werden. Buchhaltung, Tagesansicht und Auswerten filtern
    // darueber; ohne ihn laegen die Scheine alle unter dem heutigen Tag.
    const r = await supaScheinAnlegen(aktiverBereich.id, daten, bild,
      bild ? x.foto : null, null, null,       // ordner null = KEINE Person
      daten.zeit);
    if (r && r.error) {
      schief.push("Nr. " + x.nr + ": " + String(r.error.message).slice(0, 60));
      continue;
    }
    neu++;
    schon.add(id);
  }

  let text = "<b>" + neu + " von " + liste.length + " Scheinen angelegt.</b>" + ordnerText;
  if (uebersprungen) text += " " + uebersprungen + " waren schon da und wurden uebersprungen.";
  if (schief.length) {
    text += " <b>" + schief.length + " NICHT angelegt:</b> " + textSicherM(schief.slice(0, 3).join("; "));
  }
  meldungM(text, schief.length ? "warn" : "gut");
  if (typeof zeichneBereich === "function") zeichneBereich();
}

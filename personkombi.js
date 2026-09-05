// ============================================================
// Kombinationen bei einer Person VON HAND anlegen und bestehende BEARBEITEN
// ============================================================
// Warum es diese Datei gibt: Karam hat Kombinationen aus der Vergangenheit,
// die nie durch den Kombi-Bau gelaufen sind. Die sollen trotzdem bei der
// Person stehen, mit Datum, Wettart, Quote, Einsatz und Foto - genau wie
// eine gebaute. Und wenn er sich vertippt hat, soll er es aendern koennen,
// statt loeschen und neu anlegen zu muessen.
//
// EIGENE DATEI mit Absicht: mein.js bekommt nur zwei kleine Haken
// (Knopf oben in der Kombi-Uebersicht, Stift je Zeile). Kein Rechenweg
// wird angefasst. Der Datensatz entsteht hier in derselben Form wie in
// baueVerlaufsEintrag() aus kombis.js - wer eines von beiden aendert,
// muss ins andere schauen.
//
// Die Geld-Regeln aus der Uebergabe gelten hier genauso:
//   - jede Aenderung an einer Geldzahl kommt mit Rueckfrage, die sagt WAS passiert
//   - nach jedem Schreiben wird geprueft, ob wirklich etwas geschrieben wurde
//   - "250,50" wird von Hand umgewandelt, nie ueber type="number"

// Was gerade offen ist: null oder { ordnerId, scheinId }.
// scheinId === null heisst "neu anlegen".
let pkOffen = null;
// Der Formularstand. Er liegt hier und nicht nur im DOM, damit ein
// Neuzeichnen (z. B. durch eine Meldung von aussen) nichts verschluckt.
let pkStand = null;

const PK_LEER = () => ({
  zeit: "", kz: "st", einsatz: "", quote: "", quoteHand: false,
  stand: "offen", nummer: "", notiz: "",
  wetten: [pkZeileLeer(), pkZeileLeer(), pkZeileLeer()],
  foto: null, fotoName: "", fotoWeg: false
});

function pkZeileLeer() { return { spiel: "", wette: "", an: "", quote: "" }; }

// "2,05" und "2.05" ergeben beide 2.05. Leer ergibt 0.
function pkZahl(v) {
  const z = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isFinite(z) ? z : 0;
}

function pkRund2(z) {
  return (typeof rund2 === "function") ? rund2(z) : Math.round(z * 100) / 100;
}

// Aus den Einzelquoten die Gesamtquote. Zeilen ohne Quote zaehlen nicht mit.
function pkGesamtquote(wetten) {
  let g = 1, zahl = 0;
  for (const w of wetten) {
    const q = pkZahl(w.quote);
    if (q > 0) { g *= q; zahl++; }
  }
  return zahl ? pkRund2(g) : 0;
}

// Fuer datetime-local: ORTSZEIT, nicht toISOString (das waere UTC und
// wuerde die Uhrzeit um zwei Stunden verschieben).
function pkFuerFeld(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

// ---------- Oeffnen und Schliessen ----------

function pkNeu(ordnerId) {
  pkStand = PK_LEER();
  pkStand.zeit = pkFuerFeld(null);
  pkOffen = { ordnerId: ordnerId, scheinId: null };
  zeichneBereich();
}

// Bearbeiten: die Daten werden FRISCH geholt, nicht aus der Ansicht
// genommen. Die auf dem Schirm kann alt sein, und ein Ueberschreiben mit
// alten Werten faellt niemandem auf (dieselbe Lektion wie bei tuEinsatz).
async function pkBearbeiten(ordnerId, scheinId) {
  const holen = await supaScheinHolen(scheinId);
  if (holen.fehler) { meldungM("Nicht zu bearbeiten: " + holen.fehler, "warn"); return; }
  const d = holen.daten || {};
  const alt = (kasseScheine || []).find(x => x.id === scheinId) || {};
  pkStand = {
    zeit: pkFuerFeld(d.zeit || alt.created_at),
    kz: d.kz || "st",
    einsatz: (Number(d.einsatz) || 0).toFixed(2),
    quote: (Number(d.quote) || 0).toFixed(2),
    quoteHand: true,                       // vorhandene Gesamtquote nicht ueberschreiben
    stand: alt.stand || d.stand || "offen",
    nummer: (d.nummer == null ? "" : String(d.nummer)),
    notiz: alt.notiz || d.notiz || "",
    wetten: (Array.isArray(d.wetten) && d.wetten.length ? d.wetten : [pkZeileLeer()])
      .map(w => ({ spiel: w.spiel || "", wette: w.linie || w.wette || "",
                   an: w.an_zeit || "", quote: (Number(w.quote) || 0) ? String(w.quote) : "" })),
    foto: null, fotoName: alt.foto_name || "", fotoWeg: false,
    fotoDa: !!alt.foto, gebaut: !!(d.scheinId && !d.handeingabe)
  };
  pkOffen = { ordnerId: ordnerId, scheinId: scheinId };
  zeichneBereich();
}

function pkAbbrechen() { pkOffen = null; pkStand = null; zeichneBereich(); }

// ---------- Formular ----------

// Wird aus kombiUebersichtHtml() aufgerufen. Gibt "" zurueck, wenn fuer
// diese Person gerade nichts offen ist.
function pkFormularHtml(ordnerId) {
  if (!pkOffen || pkOffen.ordnerId !== ordnerId || !pkStand) return "";
  const s = pkStand;
  const neu = !pkOffen.scheinId;
  const anbieter = (typeof KASSE_ANBIETER !== "undefined" && KASSE_ANBIETER.length)
    ? KASSE_ANBIETER : [["st", "Stake"], ["iw", "Interwetten"], ["bw", "Bwin"], ["b3", "Bet365"], ["ad", "Admiral"]];

  let zeilen = "";
  s.wetten.forEach((w, i) => {
    zeilen +=
      '<tr><td class="mini pknr">Wette ' + (i + 1) + "</td>" +
      '<td><input class="pkfeld" id="pk_spiel_' + i + '" value="' + textSicherM(w.spiel) +
        '" placeholder="Heim vs Auswärts" oninput="pkMerken()"></td>' +
      '<td><input class="pkfeld pkkurz" id="pk_wette_' + i + '" value="' + textSicherM(w.wette) +
        '" placeholder="OVER 2.5" oninput="pkMerken()"></td>' +
      '<td><input class="pkfeld pkkurz" type="datetime-local" id="pk_an_' + i + '" value="' +
        textSicherM(w.an) + '" oninput="pkMerken()"></td>' +
      '<td><input class="pkfeld pkmini" id="pk_quote_' + i + '" value="' + textSicherM(w.quote) +
        '" inputmode="decimal" placeholder="1,94" oninput="pkMerken(); pkRechnen()"></td>' +
      '<td>' + (s.wetten.length > 1
        ? '<button class="knopfweg" title="Diese Wette aus der Kombination nehmen" ' +
          'onclick="pkZeileWeg(' + i + ')">&#128465;</button>' : "") + "</td></tr>";
  });

  const gesamt = pkGesamtquote(s.wetten);
  const einsatz = pkZahl(s.einsatz);
  const quote = s.quoteHand ? pkZahl(s.quote) : gesamt;

  return '<div class="pkkasten" id="pk_kasten">' +
    "<h4>" + (neu ? "&#10133; Kombination von Hand anlegen"
                  : "&#9998; Kombination bearbeiten") + "</h4>" +
    (neu
      ? '<p class="mini">Für Kombinationen, die nicht über den Kombi-Bau gelaufen sind, ' +
        "zum Beispiel ältere. Sie zählt danach ganz normal in Konto, Personenkasse und " +
        "Buchhaltung dieser Person mit.</p>"
      : '<p class="mini">Die Zahlen hier gehen in Konto, Personenkasse und Buchhaltung ein. ' +
        "Vor dem Speichern wird gefragt, was sich ändert.</p>") +
    (s.gebaut
      ? '<div class="warnkern mini">Diese Kombination kommt aus dem Kombi-Bau. Die Verbindung ' +
        "dorthin (Kennung und Ordner) bleibt unangetastet, geändert werden nur die Werte hier.</div>"
      : "") +

    '<div class="pkreihe">' +
      '<label>Datum der Kombination<br><input type="datetime-local" id="pk_zeit" value="' +
        textSicherM(s.zeit) + '" oninput="pkMerken()"></label>' +
      "<label>Anbieter<br><select id=\"pk_kz\" onchange=\"pkMerken()\">" +
        anbieter.map(a => '<option value="' + a[0] + '"' + (s.kz === a[0] ? " selected" : "") +
          ">" + textSicherM(a[1]) + "</option>").join("") + "</select></label>" +
      "<label>Stand<br><select id=\"pk_stand\" onchange=\"pkMerken()\">" +
        ["offen", "gewonnen", "verloren"].map(o => "<option" + (s.stand === o ? " selected" : "") +
          ">" + o + "</option>").join("") + "</select></label>" +
      '<label>Scheinnummer <span class="mini">(wenn du eine hast; der Kombi-Bau ' +
        'zählt getrennt weiter)</span><br>' +
        '<input class="pkmini" id="pk_nummer" value="' + textSicherM(s.nummer) +
        '" inputmode="numeric" placeholder="41" oninput="pkMerken()"></label>' +
    "</div>" +

    '<div class="tabellenrand"><table class="pktabelle"><thead><tr><th></th><th>Spiel</th>' +
      "<th>Wettart</th><th>Anstoß</th><th>Quote</th><th></th></tr></thead><tbody>" +
      zeilen + "</tbody></table></div>" +
    '<p><button onclick="pkZeileDazu()">&#10133; Wette dazu</button></p>' +

    '<div class="pkreihe">' +
      '<label>Einsatz<br><input class="pkkurz" id="pk_einsatz" value="' + textSicherM(s.einsatz) +
        '" inputmode="decimal" placeholder="400,00" oninput="pkMerken(); pkRechnen()"> &euro;</label>' +
      '<label>Gesamtquote<br><input class="pkkurz" id="pk_quote" value="' +
        textSicherM(s.quoteHand ? s.quote : (gesamt ? gesamt.toFixed(2) : "")) +
        '" inputmode="decimal" oninput="pkMerken(true); pkRechnen()"></label>' +
    "</div>" +
    '<p class="mini" id="pk_rechnung">' + pkRechnungText(gesamt, quote, einsatz) + "</p>" +

    "<p><label>Foto vom Wettschein" + (s.fotoDa && !s.fotoWeg ? " (eines ist schon dran)" : "") +
      '<br><input type="file" accept="image/*" onchange="pkFotoWaehlen(this)"></label> ' +
      (s.foto ? '<span class="gruen mini">neues Foto gewählt: ' + textSicherM(s.fotoName) + "</span> " : "") +
      (s.fotoDa && !s.fotoWeg
        ? '<button onclick="pkFotoWeg()">Foto entfernen</button>' : "") +
      (s.fotoWeg ? '<span class="rot mini">Foto wird beim Speichern entfernt.</span>' : "") + "</p>" +

    '<p><label>Notiz<br><textarea class="notizfeld" id="pk_notiz" oninput="pkMerken()">' +
      textSicherM(s.notiz) + "</textarea></label></p>" +

    '<p><button class="haupt" onclick="pkSpeichern()">' +
      (neu ? "Kombination anlegen" : "Änderungen speichern") + "</button> " +
      '<button onclick="pkAbbrechen()">Abbrechen</button></p>' +
    "</div>";
}

function pkRechnungText(gesamt, quote, einsatz) {
  const moeglich = pkRund2(einsatz * quote);
  return "Aus den Einzelquoten: <b>" + (gesamt ? gesamt.toFixed(2) : "-") + "</b>. " +
    "Gerechnet wird mit <b>" + (quote ? quote.toFixed(2) : "-") + "</b>. " +
    "Möglicher Gewinn: <b>" + moeglich.toFixed(2) + " &euro;</b>." +
    (gesamt && quote && Math.abs(gesamt - quote) > 0.005
      ? ' <span class="rot">Die Gesamtquote weicht von den Einzelquoten ab - gewollt?</span>' : "");
}

// Alles aus den Feldern in pkStand uebernehmen. Wird bei jedem Tippen
// gerufen, damit ein Neuzeichnen von aussen nichts verliert.
function pkMerken(quoteVonHand) {
  if (!pkStand) return;
  // Fehlt ein Feld auf dem Schirm, bleibt der bisherige Wert stehen.
  // Frueher stand hier ein "" als Ersatz - dann haette ein Aufruf ohne
  // sichtbares Formular den ganzen Entwurf ausgeleert, lautlos.
  const w = (id, bisher) => { const e = el(id); return e ? e.value : bisher; };
  pkStand.zeit = w("pk_zeit", pkStand.zeit);
  pkStand.kz = w("pk_kz", pkStand.kz) || pkStand.kz;
  pkStand.stand = w("pk_stand", pkStand.stand) || pkStand.stand;
  pkStand.nummer = w("pk_nummer", pkStand.nummer);
  pkStand.einsatz = w("pk_einsatz", pkStand.einsatz);
  pkStand.notiz = w("pk_notiz", pkStand.notiz);
  if (quoteVonHand) pkStand.quoteHand = true;
  if (pkStand.quoteHand) pkStand.quote = w("pk_quote", pkStand.quote);
  pkStand.wetten.forEach((z, i) => {
    z.spiel = w("pk_spiel_" + i, z.spiel);
    z.wette = w("pk_wette_" + i, z.wette);
    z.an = w("pk_an_" + i, z.an);
    z.quote = w("pk_quote_" + i, z.quote);
  });
}

// Nur die eine Zeile neu schreiben, nicht das ganze Formular: sonst
// springt der Mauszeiger beim Tippen aus dem Feld.
function pkRechnen() {
  if (!pkStand) return;
  const gesamt = pkGesamtquote(pkStand.wetten);
  if (!pkStand.quoteHand) {
    const f = el("pk_quote");
    if (f) f.value = gesamt ? gesamt.toFixed(2) : "";
    pkStand.quote = gesamt ? gesamt.toFixed(2) : "";
  }
  const ziel = el("pk_rechnung");
  if (ziel) ziel.innerHTML = pkRechnungText(gesamt, pkZahl(pkStand.quote), pkZahl(pkStand.einsatz));
}

function pkZeileDazu() { pkMerken(); pkStand.wetten.push(pkZeileLeer()); zeichneBereich(); }

function pkZeileWeg(i) {
  pkMerken();
  const z = pkStand.wetten[i];
  const beschriftet = z && (z.spiel || z.wette || z.quote);
  if (beschriftet && !confirm("Diese Wette aus der Kombination nehmen?\n\n" +
      (z.spiel || "(ohne Spiel)") + " " + (z.wette || "") + " " + (z.quote || ""))) return;
  pkStand.wetten.splice(i, 1);
  if (!pkStand.wetten.length) pkStand.wetten.push(pkZeileLeer());
  zeichneBereich();
}

// ---------- Foto ----------
// Gleiche Behandlung wie beim Foto-Upload im Admin: auf 1600 px verkleinern
// und als JPEG 0.8 ablegen. Ein Handyfoto in voller Groesse waere sonst
// mehrere Megabyte, und es liegt verschluesselt in einer Textspalte.
function pkFotoWaehlen(eingabe) {
  const datei = (eingabe.files || [])[0];
  eingabe.value = "";
  if (!datei) return;
  const leser = new FileReader();
  leser.onload = ev => {
    const bild = new Image();
    bild.onload = () => {
      const faktor = Math.min(1, 1600 / bild.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bild.width * faktor);
      c.height = Math.round(bild.height * faktor);
      c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
      pkMerken();
      pkStand.foto = c.toDataURL("image/jpeg", 0.8);
      pkStand.fotoName = datei.name || "wettschein.jpg";
      pkStand.fotoWeg = false;
      zeichneBereich();
    };
    bild.onerror = () => meldungM("Das Bild liess sich nicht lesen.", "warn");
    bild.src = ev.target.result;
  };
  leser.onerror = () => meldungM("Die Datei liess sich nicht lesen.", "warn");
  leser.readAsDataURL(datei);
}

function pkFotoWeg() {
  if (!confirm("Das Foto von dieser Kombination entfernen?")) return;
  pkMerken();
  pkStand.foto = null; pkStand.fotoName = ""; pkStand.fotoWeg = true;
  zeichneBereich();
}

// ---------- Speichern ----------

async function pkSpeichern() {
  if (!pkOffen || !pkStand) return;
  if (!darfSchreiben()) { meldungM("Dazu fehlt dir das Schreibrecht in diesem Bereich.", "warn"); return; }
  pkMerken();
  const s = pkStand;

  // Nur Zeilen mit Inhalt. Eine leere Zeile ist keine Wette.
  const wetten = s.wetten
    .filter(z => (z.spiel || "").trim() || (z.wette || "").trim() || pkZahl(z.quote) > 0)
    .map(z => ({
      spiel: (z.spiel || "").trim(),
      wette: (z.wette || "").trim(),
      linie: (z.wette || "").trim(),      // linie ist das, was die Listen anzeigen
      an_zeit: z.an || "",
      quote: pkRund2(pkZahl(z.quote)),
      quelle: "hand"
    }));

  const fehlt = [];
  if (!wetten.length) fehlt.push("mindestens eine Wette mit Spiel oder Wettart");
  if (wetten.some(w => !w.spiel)) fehlt.push("bei jeder Wette ein Spiel");
  if (wetten.some(w => !(w.quote > 1))) fehlt.push("bei jeder Wette eine Quote über 1");
  const einsatz = pkRund2(pkZahl(s.einsatz));
  if (!(einsatz > 0)) fehlt.push("einen Einsatz über 0");
  const quote = pkRund2(pkZahl(s.quote) || pkGesamtquote(s.wetten));
  if (!(quote > 1)) fehlt.push("eine Gesamtquote über 1");
  if (fehlt.length) {
    meldungM("So nicht gespeichert - es fehlt noch: " + textSicherM(fehlt.join(", ")) +
      ". Lieber nichts als eine halbe Kombination.", "warn");
    return;
  }

  const zeit = s.zeit ? new Date(s.zeit) : new Date();
  if (isNaN(zeit)) { meldungM("Das Datum der Kombination ist nicht lesbar.", "warn"); return; }
  const moeglich = pkRund2(einsatz * quote);
  const nummer = s.nummer.trim() === "" ? null : parseInt(s.nummer, 10);
  if (nummer !== null && !isFinite(nummer)) { meldungM("Die Scheinnummer ist keine Zahl.", "warn"); return; }

  // Karams feste Nummer darf sich NIE wiederholen - danach sucht er spaeter.
  // Der Zaehler des Kombi-Baus (kt_schein_nr) laeuft getrennt weiter und
  // weiss von einer hier eingetippten Nummer nichts. Deshalb wird hier
  // wenigstens gegen das geprueft, was schon im Bereich liegt.
  if (nummer !== null) {
    const belegt = (kasseScheine || []).filter(x => x.nummer === nummer && x.id !== pkOffen.scheinId);
    if (belegt.length && !confirm(
        "Die Scheinnummer " + nummer + " gibt es hier schon " + belegt.length + "-mal.\n\n" +
        "Nach dieser Nummer suchst du später. Zwei Kombinationen mit derselben " +
        "Nummer lassen sich dann nicht mehr auseinanderhalten.\n\n" +
        "Trotzdem so speichern?")) return;
  }

  const neu = !pkOffen.scheinId;
  const uebersicht =
    (typeof anbieterName === "function" ? anbieterName(s.kz) : s.kz) + "\n" +
    wetten.map(w => "   " + w.spiel + " - " + (w.linie || "?") + " - " + w.quote.toFixed(2)).join("\n") +
    "\n\n   Einsatz:  " + einsatz.toFixed(2) + " Euro\n" +
    "   Quote:    " + quote.toFixed(2) + "\n" +
    "   Möglich:  " + moeglich.toFixed(2) + " Euro\n" +
    "   Stand:    " + s.stand;

  if (neu) {
    if (!confirm("Diese Kombination bei der Person anlegen?\n\n" + uebersicht +
        "\n\nSie zählt ab sofort in Konto, Personenkasse und Buchhaltung mit.")) return;
    const daten = {
      zeit: zeit.toISOString(),
      scheinId: "H" + Date.now().toString(36),   // H = von Hand, kollidiert nie mit "S<n>-<n>"
      kz: s.kz, satz: "", nummer: nummer,
      anbieter: (typeof anbieterName === "function" ? anbieterName(s.kz) : s.kz),
      einsatz: einsatz, quote: quote, moeglich: moeglich,
      wetten: wetten, stand: s.stand, notiz: s.notiz || "",
      handeingabe: true
    };
    const r = await supaScheinAnlegen(aktiverBereich.id, daten, s.foto, s.foto ? s.fotoName : null,
      pkOffen.ordnerId, nummer);
    if (r.error) { meldungM("Nicht angelegt: " + textSicherM(String(r.error.message).slice(0, 140)), "warn"); return; }
    meldungM("Kombination bei der Person angelegt.", "gut");
    pkOffen = null; pkStand = null;
    zeichneBereich();
    return;
  }

  // ---- Bearbeiten ----
  const id = pkOffen.scheinId;
  const holen = await supaScheinHolen(id);
  if (holen.fehler) { meldungM("Nicht gespeichert: " + holen.fehler, "warn"); return; }
  const alt = holen.daten || {};
  const altBetrag = Number(alt.einsatz) || 0;
  const altQuote = Number(alt.quote) || 0;

  let geld = "";
  if (Math.abs(altBetrag - einsatz) > 0.005 || Math.abs(altQuote - quote) > 0.005) {
    geld = "\n\nGeld ändert sich:\n" +
      "   Einsatz:  " + altBetrag.toFixed(2) + "  ->  " + einsatz.toFixed(2) + " Euro\n" +
      "   Quote:    " + altQuote.toFixed(2) + "  ->  " + quote.toFixed(2) + "\n" +
      "   Möglich:  " + (Number(alt.moeglich) || 0).toFixed(2) + "  ->  " + moeglich.toFixed(2) + " Euro";
  }
  if (!confirm("Änderungen an dieser Kombination speichern?\n\n" + uebersicht + geld +
      "\n\nDiese Zahlen gehen in Konto, Personenkasse und Buchhaltung ein.")) return;

  // Der verschluesselte Block: alles Alte bleibt stehen, nur die Felder,
  // die das Formular kennt, werden ersetzt. So gehen scheinId, satz und
  // was sonst noch drinsteht nicht verloren.
  const daten = Object.assign({}, alt, {
    zeit: zeit.toISOString(), kz: s.kz, nummer: nummer,
    anbieter: (typeof anbieterName === "function" ? anbieterName(s.kz) : s.kz),
    einsatz: einsatz, quote: quote, moeglich: moeglich,
    wetten: wetten, stand: s.stand, notiz: s.notiz || ""
  });

  const rd = await supaScheinDatenSchreiben(id, holen.key, daten);
  if (rd.error) { meldungM("Nicht gespeichert: " + textSicherM(String(rd.error.message).slice(0, 140)), "warn"); return; }
  if (!rd.data || !rd.data.length) {
    meldungM("Nicht gespeichert - kein Schreibrecht oder die Kombination ist weg.", "warn"); return;
  }

  // Die offenen Spalten daneben (stand, notiz, nummer, ordner, foto).
  const key = holen.key;
  const felder = { stand: s.stand, nummer: nummer, ordner: pkOffen.ordnerId,
                   notiz: await e2eZu(key, s.notiz || "") || "" };
  if (s.foto) { felder.foto = await e2eZu(key, s.foto); felder.foto_name = await e2eZu(key, s.fotoName || ""); }
  else if (s.fotoWeg) { felder.foto = null; felder.foto_name = null; }
  const rf = await supaScheinAendern(id, felder);
  if (rf.error) { meldungM("Die Werte sind gespeichert, aber Stand/Foto nicht: " +
    textSicherM(String(rf.error.message).slice(0, 120)), "warn"); }
  else if (!rf.data || !rf.data.length) {
    meldungM("Die Werte sind gespeichert, aber Stand/Foto nicht - dazu fehlt das Recht.", "warn");
  } else {
    meldungM("Kombination geändert.", "gut");
  }
  pkOffen = null; pkStand = null;
  zeichneBereich();
}

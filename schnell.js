// ============================================================
// SCHNELL-EINTRAG: eine Kombination aus einem Screenshot.
//
// Karam (17.09.2026): "Ich will eine Section, wo ich einfach einen
// Screenshot hinzufuege, Einsatz, Multiplikator und moeglicher Gewinn -
// und dann kann ich den einfach hinzufuegen zum Auswerten, ohne
// wirklich da irgendwelche Zeilen zusammenzustellen."
//
// Der Datensatz hat DIESELBE Form wie eine Handeingabe bei einer Person
// (personkombi.js, pkSpeichern im Neu-Zweig): handeingabe: true und
// ohneNachweis: true. Wer dort etwas an der Form aendert, schaut auch
// hier herein - und umgekehrt. Die Bild-Verkleinerung kommt aus
// pkBildVerkleinern (personkombi.js), keine zweite Fassung.
//
// Faellt diese Datei weg, fehlt nur der Reiter "Kombi aus Screenshot" -
// sonst nichts.
// ============================================================
"use strict";

let seFoto = null;
let seFotoName = "";
let seKzWert = "st";

function seAnbieterListe() {
  return (typeof KASSE_ANBIETER !== "undefined" && KASSE_ANBIETER.length)
    ? KASSE_ANBIETER
    : [["st", "Stake"], ["iw", "Interwetten"], ["bw", "Bwin"], ["b3", "Bet365"],
       ["ad", "Admiral"], ["bt", "Betway"], ["mb", "Merkur Bets"]];
}

function zeichneSchnell() {
  const box = el("schnellkasten");
  if (!box) return;
  if (typeof darfSchreiben === "function" && !darfSchreiben()) {
    box.innerHTML = '<p class="mini">In diesem Bereich fehlt dir das Schreibrecht - ' +
      "hier kann nur der Besitzer oder ein Mitarbeiter eintragen.</p>";
    return;
  }
  let chips = "";
  for (const [kz, name] of seAnbieterListe()) {
    chips += '<button type="button" class="aw-chip' + (seKzWert === kz ? " aktiv" : "") +
      '" onclick="seKzWaehlen(\'' + kz + '\')">' + textSicherM(name) + "</button>";
  }
  const personen = (Array.isArray(ordnerListe) ? ordnerListe : []).map(o =>
    '<option value="' + o.id + '">' + textSicherM(o.name || "Person") + "</option>").join("");
  box.innerHTML =
    '<div class="se-kasten">' +
    '<div class="se-foto">' +
      (seFoto
        ? '<img class="minifoto" src="' + textSicherM(seFoto) + '" alt="Screenshot">' +
          '<div class="mini">' + textSicherM(seFotoName) + "</div>" +
          '<button type="button" class="mini" onclick="seFotoWeg()">Bild entfernen</button>'
        : '<label class="fotoknopf">&#128247; Screenshot wählen' +
          '<input type="file" accept="image/*" style="display:none" onchange="seFotoWaehlen(this)">' +
          "</label>" +
          '<div class="mini">Ohne Bild geht es auch - dann steht die Kombination eben ohne Foto da.</div>') +
    "</div>" +
    '<div class="se-felder feldraster">' +
      '<div class="feld"><span class="feld-titel">Anbieter</span><div class="se-chips">' + chips + "</div></div>" +
      '<div class="feld"><span class="feld-titel">Einsatz (&euro;)</span>' +
        '<input id="se_einsatz" type="text" inputmode="decimal" placeholder="z. B. 400" oninput="seRechnen()"></div>' +
      '<div class="feld"><span class="feld-titel">Multiplikator (Gesamtquote)</span>' +
        '<input id="se_quote" type="text" inputmode="decimal" placeholder="z. B. 12,5" oninput="seRechnen()"></div>' +
      '<div class="feld"><span class="feld-titel">Möglicher Gewinn (&euro;)</span>' +
        '<input id="se_moeglich" type="text" inputmode="decimal" placeholder="leer = Einsatz &times; Multiplikator"></div>' +
      // Karam (19.09.2026): "dass man das Anstoßdatum, wann es faellig
      // ist, hinzufuegen kann." Damit greifen wartet/ueberfaellig auch
      // hier - ohne Datum landet der Schein im Fach "ohne Anstoß".
      '<div class="feld"><span class="feld-titel">Anstoß des letzten Spiels (wann fällig)</span>' +
        '<input id="se_anstoss" type="datetime-local"></div>' +
      '<div class="feld"><span class="feld-titel">Anbieter-ID (freiwillig)</span>' +
        '<input id="se_anbid" type="text" autocomplete="off" spellcheck="false" placeholder="steht auf dem Wettschein"></div>' +
      '<div class="feld"><span class="feld-titel">Person (freiwillig)</span>' +
        '<select id="se_person"><option value="">ohne Person</option>' + personen + "</select></div>" +
    "</div>" +
    '<div class="se-fuss">' +
      '<button class="haupt" onclick="seSpeichern()">In den Verlauf - zum Auswerten</button>' +
      // Karam (19.09.2026): "ein Button, alle Kombis aus Screenshots -
      // oeffnet sich eine Page, wo man alle sieht."
      '<a href="screenshots.html"><button type="button">&#128248; Alle Kombis aus Screenshots</button></a>' +
      '<span class="mini" id="se_stand"></span>' +
    "</div>" +
    "</div>";
  seRechnen();
}

function seKzWaehlen(kz) {
  seKzWert = kz;
  // Nur die Chips tauschen wuerde reichen - aber die Felder behalten
  // ihre Werte, weil sie beim Zeichnen nicht angefasst werden? Nein:
  // zeichneSchnell baut alles neu. Also Werte retten und zurueckschreiben.
  const merken = ["se_einsatz", "se_quote", "se_moeglich", "se_anstoss", "se_anbid", "se_person"]
    .map(id => [id, el(id) ? el(id).value : ""]);
  zeichneSchnell();
  for (const [id, wert] of merken) if (el(id)) el(id).value = wert;
  seRechnen();
}

function seZahl(id) {
  const roh = String(el(id) ? el(id).value : "").trim().replace(",", ".");
  if (roh === "") return null;
  const z = parseFloat(roh);
  return isFinite(z) ? z : NaN;
}

// Der Live-Satz unter dem Knopf: was wuerde gespeichert?
function seRechnen() {
  const s = el("se_stand");
  if (!s) return;
  const einsatz = seZahl("se_einsatz"), quote = seZahl("se_quote");
  if (einsatz > 0 && quote > 0) {
    s.innerHTML = "Rechnung: " + einsatz.toFixed(2) + " &times; " + quote.toFixed(2) +
      " = <b>" + (Math.round(einsatz * quote * 100) / 100).toFixed(2) + " &euro;</b> möglich" +
      " (das Feld daneben überstimmt diese Schätzung).";
  } else s.innerHTML = "";
}

function seFotoWaehlen(eingabe) {
  const datei = (eingabe.files || [])[0];
  eingabe.value = "";
  if (!datei) return;
  if (typeof pkBildVerkleinern !== "function") {
    meldungM("Bild-Verkleinerung fehlt (personkombi.js nicht geladen).", "warn");
    return;
  }
  pkBildVerkleinern(datei, (foto, name) => {
    seFoto = foto;
    seFotoName = name;
    seKzWaehlen(seKzWert);          // neu zeichnen, Feldwerte bleiben
  });
}

function seFotoWeg() {
  seFoto = null; seFotoName = "";
  seKzWaehlen(seKzWert);
}

async function seSpeichern() {
  const einsatz = seZahl("se_einsatz");
  let quote = seZahl("se_quote");
  let moeglich = seZahl("se_moeglich");
  if (!(einsatz > 0)) { meldungM("Bitte einen Einsatz eintragen.", "warn"); return; }
  if (isNaN(quote) || isNaN(moeglich)) { meldungM("Das ist keine Zahl. Nichts gespeichert.", "warn"); return; }
  if (!(quote > 0) && !(moeglich > 0)) {
    meldungM("Bitte Multiplikator ODER möglichen Gewinn eintragen - sonst lässt sich nichts rechnen.", "warn");
    return;
  }
  // Fehlt eines von beiden, wird es aus dem anderen gerechnet - und in
  // der Rueckfrage steht, welches gerechnet ist.
  let gerechnet = "";
  if (!(moeglich > 0)) { moeglich = Math.round(einsatz * quote * 100) / 100; gerechnet = "möglich"; }
  if (!(quote > 0)) { quote = Math.round((moeglich / einsatz) * 100) / 100; gerechnet = "Multiplikator"; }
  const kz = seKzWert;
  const name = (typeof anbieterName === "function" && anbieterName(kz)) || kz;
  const anbId = String(el("se_anbid") ? el("se_anbid").value : "").trim();
  const personId = String(el("se_person") ? el("se_person").value : "");
  const personName = personId ? (ordnerNameM(personId) || "Person") : "";
  const ablauf = String(el("se_anstoss") ? el("se_anstoss").value : "").trim();
  // Die EIGENE Nummer der Screenshot-Kombis (Karam, 19.09.2026): eine
  // eigene Reihe S-1, S-2, ... - hergeleitet aus der hoechsten schon
  // gespeicherten S-Nummer, nicht aus einem Geraete-Zaehler, damit zwei
  // Geraete nicht dieselbe vergeben.
  let snr = 0;
  for (const s of (Array.isArray(kasseScheine) ? kasseScheine : [])) {
    const alt = s.daten ? parseInt(s.daten.snr, 10) : NaN;
    if (isFinite(alt) && alt > snr) snr = alt;
  }
  snr += 1;

  // Dieselbe ACHTUNG wie bei der Handeingabe (personkombi.js): eine
  // Kombination ohne einzelne Wetten kann kein Automat je auswerten.
  if (!await nachfrage("Diese Kombination speichern als S-" + snr + "?\n\n" +
      "   Anbieter:  " + name + "\n" +
      "   Einsatz:   " + einsatz.toFixed(2) + " Euro\n" +
      "   Quote:     " + quote.toFixed(2) + (gerechnet === "Multiplikator" ? "  (gerechnet)" : "") + "\n" +
      "   Möglich:   " + moeglich.toFixed(2) + " Euro" + (gerechnet === "möglich" ? "  (gerechnet)" : "") + "\n" +
      "   Person:    " + (personName || "ohne") + "\n" +
      "   Fällig:    " + (ablauf ? ablauf.replace("T", " ") : "ohne Anstoß (landet im Fach \"ohne Anstoß\")") + "\n" +
      "   Bild:      " + (seFoto ? "ja" : "nein") + "\n" +
      (anbId ? "   Anbieter-ID: " + anbId + "\n" : "") +
      "\nACHTUNG, sie hat KEINE einzelnen Wetten:\n" +
      "   - sie zählt beim Geld voll mit (Einsatz, Gewinn, Kontostand)\n" +
      "   - aber sie wird NIE automatisch ausgewertet\n" +
      "   - gewonnen oder verloren stellst du im Auswerten selbst\n" +
      "   - die Doppelt-Erkennung sieht sie nicht")) return;

  const daten = {
    zeit: new Date().toISOString(),
    scheinId: "H" + Date.now().toString(36),   // H = von Hand, wie personkombi.js
    kz: kz, satz: "", nummer: null,
    anbieter: name,
    einsatz: Math.round(einsatz * 100) / 100,
    quote: quote, moeglich: moeglich,
    wetten: [], stand: "offen", notiz: "",
    handeingabe: true, ohneNachweis: true,
    anbieterId: anbId,
    // Herkunft und eigene Nummer (19.09.2026): quelle macht die Kombis
    // auf screenshots.html auffindbar, snr ist die S-Nummer, ablauf das
    // Faellig-Datum (scheinEnde in mein.js nimmt es als letzten Anstoss).
    quelle: "screenshot", snr: snr, ablauf: ablauf || ""
  };
  const r = await supaScheinAnlegen(aktiverBereich.id, daten, seFoto,
    seFoto ? seFotoName : null, personId || null, null);
  if (r.error) {
    meldungM("Nicht angelegt: " + textSicherM(String(r.error.message).slice(0, 140)), "warn");
    return;
  }
  meldungM("<b>Kombination S-" + snr + " angelegt</b> (" + textSicherM(name) + ", " + einsatz.toFixed(2) +
    " &euro;)" + (personName ? " bei " + textSicherM(personName) : "") +
    ". Sie steht jetzt im <b>Auswerten</b> und auf der Seite <b>Alle Kombis aus Screenshots</b>.", "gut");
  seFoto = null; seFotoName = "";
  zeichneSchnell();
  // Alles andere (Konto, Kacheln, Auswerten) rechnet mit der frischen
  // Liste weiter.
  if (typeof zeichneBereich === "function") await zeichneBereich();
  if (typeof mbAktiverBlock === "function" && mbAktiverBlock() === "auswerten" &&
      typeof zeichneAuswerten === "function") zeichneAuswerten();
}

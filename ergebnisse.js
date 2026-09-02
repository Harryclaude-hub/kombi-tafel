// ============================================================
// ERGEBNISSE: verbindet die Auswertungsmaschine (auswertung.js)
// mit der Datenbank und Mein Bereich.
//
//  1. Sammelt aus den OFFENEN Kombinationen des Bereichs alle
//     Spiele und zeigt eine Eingabetafel: je Spiel genau die
//     Felder, die die Wetten dieses Spiels brauchen
//     (benoetigteFelder) - nicht mehr, nicht weniger.
//  2. Sobald ein Ergebnis da ist, wird jede offene Kombination
//     durchgerechnet (kombiAuswerten). Ein verlorenes Bein ->
//     verloren. Alles entschieden -> gewonnen mit Auszahlung.
//  3. Der Stand wird in kt_scheine geschrieben (stand +
//     echt_zurueck), die bestehende Buchhaltung uebernimmt ab da.
//  4. Meldung je Umstellung, Benachrichtigung nach den Schaltern
//     "Gewinne" / "Verluste" (benachrichtigung.js, Wecker).
//
// Ergebnisse sind oeffentliche Tatsachen (Spielstaende), deshalb
// liegen sie UNverschluesselt in kt_ergebnisse - jeder Angemeldete
// liest sie, wer schreibt, steht mit seiner Kennung dabei.
//
// HARTE REGEL (Karam): niemals raten. Was die Maschine nicht
// sicher lesen kann, steht als "unklar" da und wird von Hand
// entschieden - ueber den vorhandenen Stand-Schalter am Schein.
// ============================================================
"use strict";

let _ergKarte = null;          // "satz|spiel" -> Zeile aus kt_ergebnisse
let _ergLaeuft = false;        // Auswertung laeuft gerade (gegen Schleifen)

function ergSchluessel(satz, spiel) { return String(satz || "") + "|" + String(spiel || ""); }

// ---------- Laden ----------

async function ergebnisseLaden(saetze) {
  _ergKarte = {};
  const liste = (typeof supaErgebnisseLaden === "function") ? await supaErgebnisseLaden(saetze) : [];
  for (const z of liste) _ergKarte[ergSchluessel(z.satz, z.spiel)] = z;
  return _ergKarte;
}

// Das Ergebnis eines Spiels in der Form, die wetteAuswerten erwartet.
function ergebnisFuer(satz, spiel) {
  const z = _ergKarte ? _ergKarte[ergSchluessel(satz, spiel)] : null;
  if (!z) return null;
  return { heim: z.heim, gast: z.gast, htHeim: z.ht_heim, htGast: z.ht_gast,
           karten: z.karten, ecken: z.ecken, sonder: z.sonder || {}, stand: z.stand };
}

// ---------- Eine Kombination aus kt_scheine durchrechnen ----------

function scheinDurchrechnen(s) {
  const d = s.daten || {};
  return kombiAuswerten(d.wetten || [], d.einsatz, (w) =>
    ergebnisFuer(d.satz || "", w.spiel));
}

// ---------- Der Lauf: alles Offene pruefen, Entschiedenes verbuchen ----------

async function ergebnisseAuswerten() {
  if (_ergLaeuft) return;
  if (!aktiverBereich || typeof darfSchreiben !== "function" || !darfSchreiben()) return;
  const liste = Array.isArray(kasseScheine) ? kasseScheine : [];
  const offene = liste.filter(s => s.stand === "offen" && s.daten && (s.daten.wetten || []).length);
  if (!offene.length) return;
  _ergLaeuft = true;
  try {
    const saetze = [...new Set(offene.map(s => s.daten.satz).filter(Boolean))];
    await ergebnisseLaden(saetze);
    const umgestellt = [];
    for (const s of offene) {
      const a = scheinDurchrechnen(s);
      if (a.stand !== "gewonnen" && a.stand !== "verloren") continue;
      const felder = { stand: a.stand };
      // "wirklich bekommen" nur vorbelegen, wenn Karam dort noch nichts
      // eingetragen hat - seine Zahl schlaegt jede Rechnung.
      if (a.stand === "gewonnen" && (s.echt_zurueck === null || s.echt_zurueck === undefined)) {
        // Auszahlung: hat Karam am Schein den Anbieter-Gewinn eingetragen
        // (moeglich) und ist nichts halb/zurueck (faktor == Produkt der
        // vollen Quoten), gilt SEINE Zahl. Bei Halb-Ausgaengen rechnet
        // die Maschine aus den Beinen.
        const glatt = a.beine.every(b => b.ausgang === "gewonnen");
        felder.echt_zurueck = (glatt && Number(s.daten.moeglich) > 0)
          ? Number(s.daten.moeglich) : a.auszahlung;
      }
      const r = await supaScheinAendern(s.id, felder);
      // .select() liefert die Zeilen - 0 Zeilen heisst: nicht geschrieben.
      if (r.error || !r.data || !r.data.length) continue;
      s.stand = a.stand;
      if (felder.echt_zurueck !== undefined) s.echt_zurueck = felder.echt_zurueck;
      umgestellt.push({ s: s, a: a });
    }
    if (umgestellt.length) {
      ergebnisMelden(umgestellt);
      // Einmal neu zeichnen, damit Kasse, Badges und Listen nachziehen.
      if (typeof zeichneBereich === "function") await zeichneBereich();
    }
  } finally { _ergLaeuft = false; }
}

// ---------- Melden: Kasten + Benachrichtigung nach Schaltern ----------

function ergebnisMelden(umgestellt) {
  const gew = umgestellt.filter(x => x.a.stand === "gewonnen");
  const ver = umgestellt.filter(x => x.a.stand === "verloren");
  const teile = [];
  if (gew.length) teile.push("<b>" + gew.length + " gewonnen</b> (" +
    gew.map(x => "Nr. " + (x.s.nummer || "?") + ": " + (x.a.auszahlung || 0).toFixed(2) + " €").join(", ") + ")");
  if (ver.length) teile.push("<b>" + ver.length + " verloren</b> (" +
    ver.map(x => "Nr. " + (x.s.nummer || "?")).join(", ") + ")");
  if (typeof meldungM === "function")
    meldungM("&#9917; Ergebnisse ausgewertet: " + teile.join(", ") + ".", gew.length ? "gut" : "warn");

  // Benachrichtigung nur nach den Schaltern im Wecker (gewinne/verluste).
  const w = (typeof weckerWunschLesen === "function") ? weckerWunschLesen() : {};
  const melden = [];
  if (gew.length && w.gewinne !== false)
    melden.push("Gewonnen: " + gew.map(x => "Nr. " + (x.s.nummer || "?") + " (" + (x.a.auszahlung || 0).toFixed(2) + " €)").join(", "));
  if (ver.length && w.verluste !== false)
    melden.push("Verloren: " + ver.map(x => "Nr. " + (x.s.nummer || "?")).join(", "));
  if (!melden.length) return;
  try {
    if ("Notification" in window && Notification.permission === "granted" &&
        navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg =>
        reg.showNotification("Kombi-Tafel", { body: melden.join("\n"), tag: "kt-ergebnis",
          icon: "logo-192.png", data: { url: "mein.html", art: "ergebnis" } }));
    }
  } catch (e) { /* Benachrichtigung ist Beigabe, nie Pflicht */ }
}

// ---------- Die Eingabetafel ----------

function ergFeldWert(z, feld) {
  return (z && z[feld] !== null && z[feld] !== undefined) ? z[feld] : "";
}

async function ergebnisseZeichnen() {
  const box = document.getElementById("ergebnisse");
  if (!box || !aktiverBereich) return;
  const liste = Array.isArray(kasseScheine) ? kasseScheine : [];
  const offene = liste.filter(s => s.stand === "offen" && s.daten && (s.daten.wetten || []).length);
  if (!offene.length) { box.innerHTML = ""; return; }

  // Je Spiel: alle Wett-Texte sammeln (fuer die Frage, welche Felder es braucht)
  const spiele = {};
  for (const s of offene) {
    for (const w of (s.daten.wetten || [])) {
      if (!w.spiel) continue;
      const k = ergSchluessel(s.daten.satz || "", w.spiel);
      // Das Feld heisst in den Verlaufsdaten "an" (baueVerlaufsEintrag,
      // kombis.js) - "an_zeit" nur zur Sicherheit fuer alte Eintraege.
      if (!spiele[k]) spiele[k] = { satz: s.daten.satz || "", spiel: w.spiel, texte: [], an: w.an || w.an_zeit || "" };
      if (!spiele[k].an) spiele[k].an = w.an || w.an_zeit || "";
      spiele[k].texte.push(w.linie || w.wette || "");
    }
  }
  const schluessel = Object.keys(spiele);
  if (!schluessel.length) { box.innerHTML = ""; return; }
  const saetze = [...new Set(schluessel.map(k => spiele[k].satz).filter(Boolean))];
  await ergebnisseLaden(saetze);

  const sicher = (t) => (typeof textSicherM === "function") ? textSicherM(t) : String(t);
  let zeilen = "", fertigZahl = 0;
  for (const k of schluessel) {
    const sp = spiele[k];
    const z = _ergKarte[k] || null;
    const f = benoetigteFelder(sp.texte, sp.spiel);
    const unklare = sp.texte.filter(t => wetteLesen(t, sp.spiel).art === "unklar");
    if (z && z.stand) fertigZahl++;
    const id = "erg_" + schluessel.indexOf(k);
    const num = (feld, breite, hinweis) =>
      '<input type="text" inputmode="decimal" id="' + id + "_" + feld + '" value="' + ergFeldWert(z, feld) + '"' +
      ' style="width:' + (breite || 34) + 'px" placeholder="' + (hinweis || "") + '">';
    let felder = "";
    if (f.endstand || f.halbzeit) felder += "Endstand " + num("heim") + " : " + num("gast") + " ";
    if (f.halbzeit) felder += " &nbsp;Halbzeit " + num("ht_heim") + " : " + num("ht_gast") + " ";
    if (f.karten) felder += " &nbsp;Karten " + num("karten") + " ";
    if (f.ecken) felder += " &nbsp;Ecken " + num("ecken") + " ";
    for (const so of f.sonder)
      felder += ' &nbsp;<span class="mini">' + sicher(so) + "</span> " +
        '<input type="text" inputmode="decimal" class="erg-sonder" data-schluessel="' + sicher(so) + '"' +
        ' id="' + id + '_sonder_' + f.sonder.indexOf(so) + '" value="' +
        sicher(z && z.sonder && z.sonder[so] !== undefined ? z.sonder[so] : "") + '" style="width:44px">';
    zeilen += '<tr class="' + (z ? "erg-fertig" : "") + '">' +
      "<td><b>" + sicher(sp.spiel) + "</b><div class='mini'>" + sicher(sp.texte.join(" · ")) +
        (unklare.length ? '<div class="erg-unklar">&#9888; nicht automatisch lesbar: ' + sicher(unklare.join(", ")) +
          " - Stand unten am Schein von Hand setzen.</div>" : "") + "</div></td>" +
      "<td class='erg-felder'>" + (felder || '<span class="mini">nur von Hand entscheidbar</span>') + "</td>" +
      "<td><label class='mini'><input type='checkbox' id='" + id + "_abgesagt'" +
        (z && z.stand === "abgesagt" ? " checked" : "") + "> abgesagt</label></td>" +
      "<td><button onclick=\"ergebnisSpeichernKlick('" + id + "'," + JSON.stringify(sp.satz).replace(/"/g, "&quot;") + "," +
        JSON.stringify(sp.spiel).replace(/"/g, "&quot;") + ')">' + (z ? "ändern" : "speichern") + "</button>" +
        (z ? '<div class="mini">' + sicher(z.quelle || "") + "</div>" : "") + "</td></tr>";
  }
  box.innerHTML = "<h2>&#9917; Ergebnisse eintragen</h2>" +
    '<p class="mini">Alle Spiele deiner offenen Kombinationen. Endstände holt sich das Programm ' +
    "selbst, sobald ein Spiel vorbei ist (nur bei eindeutigem Treffer); du kannst jeden Wert " +
    "ändern, deine Zahl gilt. Halbzeit, Karten und Ecken kann die Selbstsuche nicht - die " +
    "trägst du ein. " + fertigZahl + " von " + schluessel.length + " Spielen haben schon ein Ergebnis." +
    ergSucheLageText() + "</p>" +
    '<div class="tabellenrand"><table class="tb-tafel erg-tafel"><thead><tr>' +
    "<th>Spiel und Wetten</th><th>Ergebnis</th><th></th><th></th></tr></thead><tbody>" +
    zeilen + "</tbody></table></div>";
}

async function ergebnisSpeichernKlick(id, satz, spiel) {
  const wert = (feld) => {
    const el = document.getElementById(id + "_" + feld);
    if (!el || el.value === "") return null;
    const z = parseFloat(String(el.value).replace(",", "."));
    return isFinite(z) ? z : null;
  };
  const sonder = {};
  document.querySelectorAll('[id^="' + id + '_sonder_"]').forEach(el => {
    if (el.value !== "") {
      const z = parseFloat(String(el.value).replace(",", "."));
      if (isFinite(z)) sonder[el.dataset.schluessel] = z;
    }
  });
  const abgesagt = document.getElementById(id + "_abgesagt");
  const felder = { satz: satz, spiel: spiel,
    heim: wert("heim"), gast: wert("gast"), ht_heim: wert("ht_heim"), ht_gast: wert("ht_gast"),
    karten: wert("karten"), ecken: wert("ecken"), sonder: sonder,
    stand: (abgesagt && abgesagt.checked) ? "abgesagt" : "fertig", quelle: "von Hand" };
  const r = await supaErgebnisSpeichern(felder);
  if (r.error || !r.data || !r.data.length) {
    if (typeof meldungM === "function") meldungM("Ergebnis NICHT gespeichert: " +
      (r.error ? r.error.message : "keine Zeile geschrieben (Rechte?)"), "warn");
    return;
  }
  if (typeof meldungM === "function") meldungM("Ergebnis gespeichert. Werte jetzt aus...", "gut");
  await ergebnisseAuswerten();
  await ergebnisseZeichnen();
}

// ============================================================
// SELBSTSUCHE: Endstaende automatisch holen (TheSportsDB,
// oeffentlicher Test-Schluessel "123", CORS aus dem Browser ok -
// gemessen am 02.09.). Karams Auftrag vom 02.09.: Kombinationen
// sollen automatisch ausgewertet werden, er bessert nur aus.
//
// Die EISERNE REGEL gilt weiter - niemals raten:
//  - gespeichert wird nur ein EINDEUTIGER Treffer: genau EIN
//    Spiel der Antwort passt, das Datum liegt am Anstosstag
//    (+/- 1 Tag wegen Zeitzonen), UND beide Teamnamen passen in
//    DERSELBEN Reihenfolge (Heim = Heim). Nie ueber den Namen
//    allein verknuepfen - Name + Datum sind zwei Eigenschaften.
//  - ein vorhandenes Ergebnis (auch von Hand) wird NIE angefasst.
//  - nur der Endstand: Halbzeit/Karten/Ecken bleiben leer, die
//    Maschine wertet betroffene Wetten dann als "fehlt noch".
//  - abgesagte/verschobene Spiele entscheidet die Automatik nicht
//    (Absage = Einsatz zurueck = Geld) - das bleibt bei Karam.
// Jeder Ausgang wird gezaehlt und in der Tafel angezeigt - kein
// stiller Fehlschlag (drei Zustaende: gefunden / nichts / Fehler).
// ============================================================

const ERG_SUCHE_PAUSE_MIN = 30;   // je Spiel hoechstens alle 30 Minuten anfragen
let _ergSucheLage = null;         // Ergebnis des letzten Laufs (fuer die Anzeige)
let _ergSucheLaeuft = false;

// Passt Karams Teamname zum API-Namen? Wortanfaenge wie awSeiteVonName
// ("Leipzig" trifft "RB Leipzig"), Fuellwoerter zaehlen nicht.
// WICHTIG (Geld!): "Celtic B U21" darf NIE auf "Celtic" passen - Jugend-,
// B- und Frauen-Marker muessen auf BEIDEN Seiten gleich sein, sonst
// waere es ein anderes Team desselben Vereins.
function ergTeamPasst(karam, api) {
  const putz = (t) => String(t || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const kw = putz(karam).split(" "), aw = putz(api).split(" ");
  const marker = { u16: 1, u17: 1, u18: 1, u19: 1, u20: 1, u21: 1, u23: 1, ii: 1, b: 1,
    women: 1, w: 1, frauen: 1, fem: 1, feminino: 1, femenino: 1, reserve: 1, reserves: 1, youth: 1 };
  const markerVon = (worte) => worte.filter(x => marker[x]).sort().join(",");
  if (markerVon(kw) !== markerVon(aw)) return false;
  const fueller = { fc: 1, cf: 1, fk: 1, sk: 1, sc: 1, ac: 1, afc: 1, cd: 1, club: 1, de: 1 };
  const kern = (worte) => worte.filter(x => !fueller[x] && !marker[x] && x.length >= 3);
  const kk = kern(kw), ak = kern(aw);
  if (!kk.length || !ak.length) return false;
  const enthaelt = (worte, teile) => teile.every(t => worte.some(w => w.indexOf(t) === 0));
  // Der kuerzere Name muss komplett im laengeren stecken (als Wortanfaenge).
  return enthaelt(aw, kk) || enthaelt(kw, ak);
}

async function ergebnisseSelbstSuchen() {
  if (_ergSucheLaeuft) return;
  if (!aktiverBereich || typeof darfSchreiben !== "function" || !darfSchreiben()) return;
  if (typeof awSeiten !== "function" || typeof liesAnstoss !== "function") return;
  const liste = Array.isArray(kasseScheine) ? kasseScheine : [];
  const offene = liste.filter(s => s.stand === "offen" && s.daten && (s.daten.wetten || []).length);
  if (!offene.length) { _ergSucheLage = null; return; }
  _ergSucheLaeuft = true;
  try {
    const spiele = {};
    for (const s of offene) for (const w of (s.daten.wetten || [])) {
      if (!w.spiel) continue;
      const k = ergSchluessel(s.daten.satz || "", w.spiel);
      if (!spiele[k]) spiele[k] = { satz: s.daten.satz || "", spiel: w.spiel, an: w.an || w.an_zeit || "" };
      if (!spiele[k].an) spiele[k].an = w.an || w.an_zeit || "";
    }
    const schluessel = Object.keys(spiele);
    if (!schluessel.length) { _ergSucheLage = null; return; }
    await ergebnisseLaden([...new Set(schluessel.map(k => spiele[k].satz).filter(Boolean))]);
    const lage = { laeuft: 0, ohneZeit: 0, gesucht: 0, gefunden: 0, unsicher: 0, fehler: 0, wann: new Date() };
    for (const k of schluessel) {
      const sp = spiele[k];
      if (_ergKarte[k]) continue;                              // Ergebnis da - nie anfassen
      const a = liesAnstoss(sp.an);
      if (a.fehlt || a.unklar || isNaN(a.zeit.getTime())) { lage.ohneZeit++; continue; }
      const ende = new Date(a.zeit);
      ende.setMinutes(ende.getMinutes() + 110);                // Spiel muss vorbei sein
      if (new Date() < ende) { lage.laeuft++; continue; }
      const merk = "kt_ergsuche_" + k;
      const zuletzt = parseInt(localStorage.getItem(merk) || "0", 10);
      if (Date.now() - zuletzt < ERG_SUCHE_PAUSE_MIN * 60000) continue;   // gerade erst gefragt
      localStorage.setItem(merk, String(Date.now()));
      const seiten = awSeiten(sp.spiel);
      if (!seiten) { lage.unsicher++; continue; }
      lage.gesucht++;
      let antwort;
      try {
        const r = await fetch("https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=" +
          encodeURIComponent(sp.spiel.replace(/\s+-\s+/, " vs ").replace(/\s+/g, "_")));
        if (!r.ok) { lage.fehler++; continue; }
        antwort = await r.json();
      } catch (e) { lage.fehler++; continue; }
      // +/- 30 Stunden um den Anstoss: dateEvent ist die Ortszeit des
      // Stadions, Karams Zeit ist Oesterreich - ein Tag Unterschied kommt vor.
      const treffer = (antwort && Array.isArray(antwort.event) ? antwort.event : []).filter(ev => {
        if (!ev || !ev.dateEvent) return false;
        const evTag = new Date(ev.dateEvent + "T12:00");
        if (isNaN(evTag.getTime()) || Math.abs(evTag - a.zeit) > 30 * 3600000) return false;
        if (ev.intHomeScore === null || ev.intHomeScore === undefined || ev.intHomeScore === "") return false;
        if (ev.intAwayScore === null || ev.intAwayScore === undefined || ev.intAwayScore === "") return false;
        if (/postpon|cancel|abandon|susp/i.test(String(ev.strStatus || "") + " " + String(ev.strPostponed || ""))) return false;
        return true;
      });
      if (treffer.length !== 1) { lage.unsicher++; continue; }
      const ev = treffer[0];
      if (!ergTeamPasst(seiten.heim, ev.strHomeTeam) || !ergTeamPasst(seiten.gast, ev.strAwayTeam)) { lage.unsicher++; continue; }
      const heim = parseInt(ev.intHomeScore, 10), gast = parseInt(ev.intAwayScore, 10);
      if (!isFinite(heim) || !isFinite(gast) || heim < 0 || gast < 0) { lage.unsicher++; continue; }
      const r2 = await supaErgebnisSpeichern({ satz: sp.satz, spiel: sp.spiel,
        heim: heim, gast: gast, ht_heim: null, ht_gast: null, karten: null, ecken: null,
        sonder: {}, stand: "fertig", quelle: "automatisch (TheSportsDB)" });
      if (r2.error || !r2.data || !r2.data.length) { lage.fehler++; continue; }
      lage.gefunden++;
    }
    _ergSucheLage = lage;
    if (lage.gefunden) {
      if (typeof meldungM === "function")
        meldungM("&#128269; Selbstsuche: <b>" + lage.gefunden + " Endstand/-stände</b> automatisch " +
          "eingetragen (Quelle steht an der Zeile, du kannst jeden Wert ändern). Werte jetzt aus...", "gut");
      await ergebnisseAuswerten();
      await ergebnisseZeichnen();
    } else if (lage.gesucht) {
      // Auch "nichts gefunden" ist ein Ergebnis - die Tafel zeigt es an.
      await ergebnisseZeichnen();
    }
  } finally { _ergSucheLaeuft = false; }
}

// Eine Zeile fuer die Eingabetafel: was der letzte Suchlauf ergab.
function ergSucheLageText() {
  const l = _ergSucheLage;
  if (!l) return "";
  const teile = [];
  if (l.gefunden) teile.push("<b>" + l.gefunden + " gefunden</b>");
  if (l.gesucht && !l.gefunden) teile.push(l.gesucht + " gesucht, nichts Eindeutiges");
  if (l.unsicher) teile.push(l.unsicher + " nicht eindeutig (von Hand)");
  if (l.laeuft) teile.push(l.laeuft + " Spiel(e) noch nicht vorbei");
  if (l.ohneZeit) teile.push(l.ohneZeit + " ohne Anstosszeit (von Hand)");
  if (l.fehler) teile.push('<span class="rot">' + l.fehler + " Abfragefehler</span>");
  if (!teile.length) return "";
  return '<br>&#128269; Selbstsuche ' +
    (typeof kasseZeit === "function" ? kasseZeit(l.wann) : "") + ": " + teile.join(" · ") + ".";
}

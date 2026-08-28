// ============================================================
// ANHAENGE IM CHAT: Kombinationen und Personen zeigen.
//
// Karams Wunsch: der Chat ist zum Besprechen von Geschaeften da.
// Man soll eine Kombination anhaengen koennen ("schau dir K-7 an")
// und eine Person zeigen koennen ("das ist der, von dem ich rede"),
// OHNE dafuer seinen ganzen Bereich teilen zu muessen.
//
// WIE ES GEHT: der Anhang traegt seine Angaben SELBST mit sich.
// Es wird also keine Kennung verschickt, die der andere erst
// nachschlagen muesste (das ginge auch gar nicht, weil er keinen
// Zugriff auf meinen Bereich hat). Stattdessen wird ein Abzug der
// Zahlen mitgeschickt - und weil die ganze Nachricht Ende-zu-Ende
// verschluesselt ist, sieht ihn auch nur der Empfaenger.
//
// So sieht so eine Nachricht innen aus:
//   [kt-karte]{"art":"kombi","nr":7,...}
// Eine alte Fassung des Programms wuerde diesen Text roh anzeigen -
// haesslich, aber nichts geht kaputt.
//
// SICHERHEIT: alle Angaben stammen vom Absender. Sie werden
// deshalb NIE als HTML eingesetzt, immer nur als Text.
// ============================================================
"use strict";

const ANHANG_MARKE = "[kt-karte]";

// ---------- Erkennen und lesen ----------

function anhangLesen(text) {
  const t = String(text || "");
  if (t.indexOf(ANHANG_MARKE) !== 0) return null;
  try {
    const o = JSON.parse(t.slice(ANHANG_MARKE.length));
    return (o && (o.art === "kombi" || o.art === "person")) ? o : null;
  } catch (e) { return null; }
}

function anhangSchreiben(o) { return ANHANG_MARKE + JSON.stringify(o); }

// ---------- Die Karte im Chat zeichnen ----------

function anhangKarteEl(o) {
  const k = document.createElement("div");
  k.className = "ah-karte ah-" + (o.art === "person" ? "person" : "kombi");

  const kopf = document.createElement("div");
  kopf.className = "ah-kopf";
  kopf.textContent = o.art === "person"
    ? "👤 Person"
    : "🎯 Kombination " + (o.nr ? "K-" + o.nr : "");
  k.appendChild(kopf);

  if (o.art === "person") {
    const n = document.createElement("div");
    n.className = "ah-name";
    n.textContent = String(o.name || "(ohne Namen)");
    k.appendChild(n);
    if (o.zahlen) {
      const z = document.createElement("div");
      z.className = "mini ah-zahlen";
      z.textContent = String(o.zahlen);
      k.appendChild(z);
    }
    return k;
  }

  // Kombination
  const oben = document.createElement("div");
  oben.className = "ah-zeile1";
  oben.textContent = (o.anbieter || "?") +
    (o.person ? "  ·  " + o.person : "") +
    (o.stand ? "  ·  " + o.stand : "");
  k.appendChild(oben);

  if (Array.isArray(o.wetten) && o.wetten.length) {
    const liste = document.createElement("ul");
    liste.className = "ah-wetten";
    for (const w of o.wetten.slice(0, 6)) {
      const li = document.createElement("li");
      li.textContent = String(w.spiel || "?") +
        (w.wette ? " — " + w.wette : "") +
        (w.quote ? "  (" + w.quote + ")" : "");
      liste.appendChild(li);
    }
    k.appendChild(liste);
  }

  const zahlen = document.createElement("div");
  zahlen.className = "ah-zahlen";
  const teile = [];
  if (o.einsatz != null) teile.push("Einsatz " + Number(o.einsatz).toFixed(2) + " €");
  if (o.quote != null) teile.push("Quote " + Number(o.quote).toFixed(2));
  if (o.moeglich != null) teile.push("möglich " + Number(o.moeglich).toFixed(2) + " €");
  if (o.zurueck != null) teile.push("zurück " + Number(o.zurueck).toFixed(2) + " €");
  zahlen.textContent = teile.join("  ·  ");
  k.appendChild(zahlen);

  const fuss = document.createElement("div");
  fuss.className = "mini ah-fuss";
  fuss.textContent = "Abzug vom " + (o.wann || "Zeitpunkt des Sendens") +
    ". Änderungen danach sieht der andere nicht.";
  k.appendChild(fuss);
  return k;
}

// ---------- Etwas zum Anhaengen aussuchen ----------

let _ahListe = null;   // gemerkte Kombinationen des eigenen Bereichs

async function anhangWaehlen(art) {
  const alt = document.getElementById("ah-waehler");
  if (alt) alt.remove();
  if (!window.supa) return;
  const u = await supaNutzer();
  if (!u) { if (typeof weckerBalken === "function") weckerBalken("Zuerst anmelden.", "warn"); return; }

  const d = document.createElement("div");
  d.id = "ah-waehler";
  d.style.position = "fixed";
  d.style.left = "0"; d.style.top = "0"; d.style.right = "0"; d.style.bottom = "0";
  d.style.zIndex = "2100";
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.style.justifyContent = "center";
  d.style.background = "rgba(10, 18, 32, 0.55)";
  d.onclick = ev => { if (ev.target === d) d.remove(); };

  const kasten = document.createElement("div");
  kasten.className = "ah-waehlkasten";
  const kopf = document.createElement("div");
  kopf.className = "ah-waehlkopf";
  kopf.textContent = art === "person" ? "Welche Person zeigen?" : "Welche Kombination anhängen?";
  kasten.appendChild(kopf);
  const inhalt = document.createElement("div");
  inhalt.className = "ah-waehlliste";
  inhalt.textContent = "Lädt...";
  kasten.appendChild(inhalt);
  const zu = document.createElement("button");
  zu.textContent = "Abbrechen";
  zu.onclick = () => d.remove();
  kasten.appendChild(zu);
  d.appendChild(kasten);
  document.body.appendChild(d);

  try {
    if (art === "person") {
      const r = await supa.from("kt_ordner").select("id, name").eq("bereich", u.id).order("name");
      inhalt.textContent = "";
      const liste = r.data || [];
      if (!liste.length) { inhalt.textContent = "Du hast noch keine Personen angelegt."; return; }
      for (const p of liste) {
        const b = document.createElement("button");
        b.className = "ah-waehlzeile";
        b.textContent = p.name;
        b.onclick = () => { d.remove(); anhangPersonSenden(p); };
        inhalt.appendChild(b);
      }
    } else {
      const scheine = await supaScheineLaden(u.id);
      _ahListe = scheine;
      inhalt.textContent = "";
      if (!scheine.length) {
        inhalt.textContent = "Du hast noch keine Kombination in deinem Konto. " +
          "Im Kombi-Bau auf merken drücken, dann steht sie hier.";
        return;
      }
      const ordner = await supa.from("kt_ordner").select("id, name").eq("bereich", u.id);
      const namen = {};
      for (const o of (ordner.data || [])) namen[o.id] = o.name;
      for (const s of scheine.slice(0, 60)) {
        const dt = s.daten || {};
        const b = document.createElement("button");
        b.className = "ah-waehlzeile";
        const t1 = document.createElement("b");
        t1.textContent = "K-" + (s.nummer || "?") + "  " + (dt.anbieter || "?");
        const t2 = document.createElement("span");
        t2.className = "mini";
        t2.textContent = "  " + (dt.einsatz != null ? Number(dt.einsatz).toFixed(2) + " € · " : "") +
          (dt.quote != null ? "Quote " + Number(dt.quote).toFixed(2) + " · " : "") +
          (s.stand || "offen") + (namen[s.ordner] ? " · " + namen[s.ordner] : "");
        b.appendChild(t1); b.appendChild(t2);
        b.onclick = () => { d.remove(); anhangKombiSenden(s, namen[s.ordner]); };
        inhalt.appendChild(b);
      }
    }
  } catch (e) {
    inhalt.textContent = "Ging nicht: " + String(e.message || e).slice(0, 90);
  }
}

function anhangHeute() {
  const d = new Date();
  return String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
}

async function anhangKombiSenden(s, personName) {
  const dt = s.daten || {};
  const karte = {
    art: "kombi",
    nr: s.nummer || null,
    anbieter: dt.anbieter || dt.kz || "?",
    person: personName || null,
    stand: s.stand || "offen",
    einsatz: dt.einsatz != null ? Number(dt.einsatz) : null,
    quote: dt.quote != null ? Number(dt.quote) : null,
    moeglich: dt.moeglich != null ? Number(dt.moeglich) : null,
    zurueck: s.echt_zurueck != null ? Number(s.echt_zurueck) : null,
    wetten: Array.isArray(dt.wetten) ? dt.wetten.slice(0, 6).map(w => ({
      spiel: String(w.spiel || "").slice(0, 70),
      wette: String(w.wette || w.linie || "").slice(0, 40),
      quote: w.quote != null ? Number(w.quote) : null
    })) : [],
    wann: anhangHeute()
  };
  await anhangSenden(karte);
}

async function anhangPersonSenden(p) {
  const karte = { art: "person", name: String(p.name || "").slice(0, 60), wann: anhangHeute() };
  // Ein paar Zahlen dazu, wenn es sie gibt - dann sieht der andere gleich,
  // worum es geht, ohne dass der ganze Bereich geteilt werden muss.
  try {
    const u = await supaNutzer();
    const scheine = await supaScheineLaden(u.id);
    const meine = scheine.filter(s => s.ordner === p.id);
    if (meine.length) {
      const offen = meine.filter(s => (s.stand || "offen") === "offen").length;
      karte.zahlen = meine.length + " Kombination" + (meine.length === 1 ? "" : "en") +
        ", davon " + offen + " noch offen";
    }
  } catch (e) { }
  await anhangSenden(karte);
}

async function anhangSenden(karte) {
  if (!window.glockePartner) {
    if (typeof weckerBalken === "function") weckerBalken("Mach zuerst ein Gespräch auf.", "warn");
    return;
  }
  const text = anhangSchreiben(karte);
  const r = await supaDmSenden(glockePartner.partnerId, text);
  if (r && r.error) {
    if (typeof weckerBalken === "function")
      weckerBalken("Nicht gesendet: " + String(r.error.message).slice(0, 90), "warn");
    return;
  }
  if (typeof glockeNachladen === "function") glockeNachladen();
}

// ---------- Die Abkuerzungen k- und p- im Schreibfeld ----------

function anhangTippen(feld) {
  if (!feld) return;
  const t = feld.value;
  if (/(^|\s)k-$/i.test(t)) { feld.value = t.replace(/k-$/i, ""); anhangWaehlen("kombi"); return; }
  if (/(^|\s)p-$/i.test(t)) { feld.value = t.replace(/p-$/i, ""); anhangWaehlen("person"); return; }
}

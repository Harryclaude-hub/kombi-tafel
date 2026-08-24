// ============================================================
// LOGIK: Rechnen, Sortieren, Anzeigen, Eingaben merken.
// Keine Gestaltung hier, die liegt komplett in stil.css.
// ============================================================
"use strict";

// ---------- Rechnen ----------

function echteQuote(anbieter, eingabe) {
  // echte Quote = Schaufenster-Quote geteilt durch den Gebuehren-Teiler
  const t = GEBUEHREN_TEILER[anbieter];
  if (!eingabe || eingabe <= 1) return null;
  return eingabe / t;
}

function rund2(x) { return Math.round(x * 100) / 100; }

// Anstoss lesen; "?" am Ende = Uhrzeit unbekannt
function liesAnstoss(an) {
  const unklar = an.endsWith("?");
  const iso = unklar ? an.slice(0, -1) : an;
  return { zeit: new Date(iso), unklar: unklar };
}

function zeitText(an) {
  const a = liesAnstoss(an);
  const t = a.zeit;
  const dd = String(t.getDate()).padStart(2, "0");
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const hh = String(t.getHours()).padStart(2, "0");
  const mi = String(t.getMinutes()).padStart(2, "0");
  if (a.unklar) return dd + "." + mm + ". Zeit?";
  return dd + "." + mm + ". " + hh + ":" + mi;
}

function istVorbei(an) {
  const a = liesAnstoss(an);
  if (a.unklar) {
    // Uhrzeit unbekannt: erst am Folgetag als vorbei werten
    const ende = new Date(a.zeit); ende.setHours(23, 59);
    return new Date() > ende;
  }
  return new Date() > a.zeit;
}

// ---------- Eingaben merken (localStorage) ----------

function schluessel(id, opt, anbieter) { return "q_" + id + "_" + opt + "_" + anbieter; }

function liesEingabe(id, opt, anbieter) {
  const v = localStorage.getItem(schluessel(id, opt, anbieter));
  return v ? parseFloat(v) : null;
}

function speichereEingabe(id, opt, anbieter, wert) {
  const k = schluessel(id, opt, anbieter);
  if (wert) localStorage.setItem(k, wert); else localStorage.removeItem(k);
}

function gewaehlteOption(w) {
  const v = localStorage.getItem("opt_" + w.id);
  if (v !== null) {
    const i = parseInt(v, 10);
    if (i >= 0 && i < w.o.length) return i;
  }
  return 0; // Standard: sicherste Option (deine Regel Nr. 1)
}

// ---------- Bester Anbieter je Zeile ----------

const ANBIETER = [
  { kz: "iw", name: "Interwetten" },
  { kz: "bw", name: "Bwin" },
  { kz: "b3", name: "Bet365" },
  { kz: "st", name: "Stake" }
];

function besterAnbieter(w, optIdx) {
  const opt = w.o[optIdx][0];
  let bester = null, wert = 0, anzahl = 0;
  for (const a of ANBIETER) {
    const e = liesEingabe(w.id, opt, a.kz);
    const echt = echteQuote(a.kz, e);
    if (echt) {
      anzahl++;
      if (echt > wert) { wert = echt; bester = a.kz; }
    }
  }
  return { kz: bester, echt: wert, anzahl: anzahl };
}

// Standard-Ansage ohne Eingaben: wo zuerst schauen
function standardAnsage(w) {
  if (w.kat === "ECKEN") return "Bet365 oder Stake (nie die .de-Seite!)";
  if (w.kat === "TENNIS") return "Bet365 zuerst, dann Stake";
  if (w.s === "S2") return "Bet365 zuerst (Asiatische Linien), dann Stake";
  return "Bet365 oder Bwin zuerst";
}

// ---------- Anzeigen ----------

const KATEGORIEN = [
  ["ALLE", "Alle"],
  ["SIEG", "Sieg + Handicap"],
  ["TORE", "Tore Ueber/Unter"],
  ["ECKEN", "Ecken"],
  ["BTTS", "Beide treffen"],
  ["HTFT", "Halbzeit/Endstand"],
  ["DNB", "Draw No Bet"],
  ["TENNIS", "Tennis"]
];

let aktiveKat = "ALLE";
let nurKommende = true;

function baueFilter() {
  const leiste = document.getElementById("filter");
  leiste.innerHTML = "";
  for (const [kz, name] of KATEGORIEN) {
    const n = WETTEN.filter(w => kz === "ALLE" || w.kat === kz).length;
    const b = document.createElement("button");
    b.textContent = name + " (" + n + ")";
    b.className = (kz === aktiveKat) ? "aktiv" : "";
    b.onclick = () => { aktiveKat = kz; zeichne(); };
    leiste.appendChild(b);
  }
  const v = document.createElement("button");
  v.textContent = nurKommende ? "Vergangene: aus" : "Vergangene: an";
  v.className = "schalter";
  v.onclick = () => { nurKommende = !nurKommende; zeichne(); };
  leiste.appendChild(v);
}

function eingabeFeld(w, opt, anbieter) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = "0.01"; inp.min = "1"; inp.placeholder = "-";
  const v = liesEingabe(w.id, opt, anbieter);
  if (v) inp.value = v;
  inp.oninput = () => {
    speichereEingabe(w.id, opt, anbieter, inp.value);
    aktualisiereZeile(w.id);
  };
  return inp;
}

function zelleAnbieter(w, optIdx, anbieter, best) {
  const td = document.createElement("td");
  td.className = "anbieter " + anbieter;
  const opt = w.o[optIdx][0];
  td.appendChild(eingabeFeld(w, opt, anbieter));
  const e = liesEingabe(w.id, opt, anbieter);
  const echt = echteQuote(anbieter, e);
  const info = document.createElement("div");
  info.className = "real";
  if (anbieter === "iw") {
    info.textContent = echt ? ("real " + rund2(echt).toFixed(2)) : "real: /1,05";
  } else {
    info.textContent = echt ? ("real " + rund2(echt).toFixed(2)) : "";
  }
  td.appendChild(info);
  if (best.kz === anbieter && best.anzahl >= 2) td.classList.add("bester");
  return td;
}

function baueZeile(w) {
  const tr = document.createElement("tr");
  tr.id = "z_" + w.id;
  const optIdx = gewaehlteOption(w);
  const vorbei = istVorbei(w.an);
  if (vorbei) tr.classList.add("vorbei");

  // Anstoss
  let td = document.createElement("td");
  td.className = "zeit";
  td.textContent = zeitText(w.an);
  tr.appendChild(td);

  // Liga + Tippgeber
  td = document.createElement("td");
  td.innerHTML = w.liga + ' <span class="von ' + w.von + '">' + w.von + "</span>";
  tr.appendChild(td);

  // Spiel (+ Doppel-Warnung)
  td = document.createElement("td");
  td.className = "spiel";
  td.textContent = w.spiel;
  if (w.doppel) {
    const s = document.createElement("span");
    s.className = "doppel";
    s.title = "Dieses Spiel steht mehrfach in der Liste. Nur EINE der Wetten in eine Kombi nehmen!";
    s.textContent = " [doppelt]";
    td.appendChild(s);
  }
  tr.appendChild(td);

  // Wette + Optionswahl
  td = document.createElement("td");
  td.className = "wette";
  if (w.o.length > 1) {
    const sel = document.createElement("select");
    w.o.forEach((o, i) => {
      const op = document.createElement("option");
      op.value = i;
      op.textContent = w.wette.split("(")[0].trim() + " " + o[0] + "  (Tab. " + o[1].toFixed(2) + ")";
      if (i === optIdx) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = () => { localStorage.setItem("opt_" + w.id, sel.value); zeichne(); };
    td.appendChild(sel);
    const hinweis = document.createElement("div");
    hinweis.className = "real";
    hinweis.textContent = "sicherste zuerst";
    td.appendChild(hinweis);
  } else {
    td.textContent = w.wette;
  }
  tr.appendChild(td);

  // Tabellenquote der gewaehlten Option
  td = document.createElement("td");
  td.className = "tabq";
  td.textContent = w.o[optIdx][1].toFixed(2);
  tr.appendChild(td);

  // vier Anbieter
  const best = besterAnbieter(w, optIdx);
  for (const a of ANBIETER) tr.appendChild(zelleAnbieter(w, optIdx, a.kz, best));

  // Ansage: wo setzen
  td = document.createElement("td");
  td.className = "ansage";
  if (best.kz && best.anzahl >= 2) {
    const nm = ANBIETER.find(a => a.kz === best.kz).name;
    td.innerHTML = '<b class="gruen">' + nm + "</b> real " + rund2(best.echt).toFixed(2);
  } else {
    td.textContent = standardAnsage(w);
  }
  tr.appendChild(td);

  // Suchcode
  td = document.createElement("td");
  td.className = "such";
  td.textContent = w.s;
  td.title = "Suchfuehrer oben aufklappen";
  tr.appendChild(td);

  return tr;
}

function aktualisiereZeile(id) {
  const w = WETTEN.find(x => x.id === id);
  const alt = document.getElementById("z_" + id);
  if (w && alt) {
    const fokus = document.activeElement;
    const neu = baueZeile(w);
    alt.replaceWith(neu);
    // Fokus im gerade getippten Feld halten
    if (fokus && fokus.tagName === "INPUT") {
      const inputsAlt = Array.from(alt.querySelectorAll("input"));
      const idx = inputsAlt.indexOf(fokus);
      if (idx >= 0) {
        const inputsNeu = neu.querySelectorAll("input");
        if (inputsNeu[idx]) {
          inputsNeu[idx].focus();
          const l = inputsNeu[idx].value.length;
          inputsNeu[idx].setSelectionRange && inputsNeu[idx].setSelectionRange(l, l);
        }
      }
    }
  }
}

function zeichne() {
  baueFilter();
  const koerper = document.getElementById("koerper");
  koerper.innerHTML = "";
  let liste = WETTEN.filter(w => aktiveKat === "ALLE" || w.kat === aktiveKat);
  if (nurKommende) liste = liste.filter(w => !istVorbei(w.an));
  liste.sort((a, b) => liesAnstoss(a.an).zeit - liesAnstoss(b.an).zeit);
  for (const w of liste) koerper.appendChild(baueZeile(w));
  document.getElementById("zaehler").textContent =
    liste.length + " von " + WETTEN.length + " Wetten angezeigt" +
    (nurKommende ? " (vergangene ausgeblendet)" : "");
}

document.addEventListener("DOMContentLoaded", zeichne);

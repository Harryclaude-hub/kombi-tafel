// ============================================================
// ANRUF: 1:1-Anrufe zwischen Freunden, direkt von Gerät zu
// Gerät (WebRTC). Ton und Bild laufen IMMER verschlüsselt
// direkt zwischen den beiden Geräten (DTLS-SRTP, fester Teil
// von WebRTC) - unsere Datenbank sieht sie nie.
// Nur das "Klingeln" (der Verbindungsaufbau) laeuft über
// Supabase Realtime, und diese Signale verpacken wir zusätzlich
// Ende-zu-Ende mit dem Freundschafts-Schlüssel.
// ============================================================
"use strict";

// WOHER DIE SERVER KOMMEN
// Alles Einstellbare steht in anruf-server.js - eine Datei, eine Stelle.
//
// Gemessen am 29.08.2026 mit einer echten Probeverbindung: der frueher
// hier eingetragene Gratis-Dienst openrelay.metered.ca antwortet nicht
// mehr ("STUN host lookup received error", "400 TURN allocate error").
// Er stand fuenf Minuten lang drin und war reiner Schaden: jeder Anruf
// haette erst neun Sekunden auf eine Antwort gewartet, die nie kommt.
// Deshalb: keine erfundenen Server. Was drinsteht, ist geprueft.
//
// TON UND BILD BLEIBEN IMMER VERSCHLUESSELT (DTLS-SRTP, fester Teil
// von WebRTC). Ein Umleitungs-Server reicht nur weiter, er hoert nicht mit.
function anrufEisBauen() {
  const stun = (typeof window !== "undefined" && Array.isArray(window.KT_STUN) && window.KT_STUN.length)
    ? window.KT_STUN : [{ urls: "stun:stun.l.google.com:19302" }];
  const turn = (typeof window !== "undefined" && Array.isArray(window.KT_TURN)) ? window.KT_TURN : [];
  return { iceServers: stun.concat(turn), iceCandidatePoolSize: 4 };
}

// Wird bei jedem Anruf frisch gelesen: so wirkt eine geaenderte
// anruf-server.js sofort, ohne dass jemand etwas umstellen muss.
let ANRUF_STUN = anrufEisBauen();
let anrufPc = null;              // die laufende Verbindung
let anrufStream = null;          // eigenes Mikro/Kamera
let anrufPartner = null;         // { id, name, video }
let anrufEingehend = null;       // { von, name, offer, video, eis: [] }
let anrufEigenerKanal = null;
let anrufKlingelTimer = null;    // wiederholt das Klingeln beim Anrufer
const _anrufKanaele = {};        // zielId -> subscribed channel
let _anrufVersuche = 0;          // wie oft die Klingel-Leitung schon scheiterte

// Auf jedem Seitenaufruf: eigenen Klingel-Kanal abonnieren
async function anrufBereit() {
  try {
    const u = await supaNutzer();
    if (!u || anrufEigenerKanal) return;
    const k = supa.channel("kt-anruf-" + u.id, { config: { broadcast: { self: true } } });
    anrufEigenerKanal = k;
    k.on("broadcast", { event: "signal" }, p => anrufSignal(p.payload));
    k.subscribe(status => {
      // ZWEI Kanaele mit demselben Topic vertragen sich nicht - der eigene
      // Hörer-Kanal ist deshalb auch der Sende-Kanal an mich selbst.
      if (status === "SUBSCRIBED") { _anrufKanaele[u.id] = k; _anrufVersuche = 0; return; }
      // Frueher passierte hier NICHTS. Kam CHANNEL_ERROR, TIMED_OUT oder
      // CLOSED, klingelte das Geraet die ganze Sitzung lang nicht mehr -
      // ohne jede Meldung, und weil anrufEigenerKanal schon belegt war,
      // stieg jeder neue Versuch sofort wieder aus.
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        try { supa.removeChannel(k); } catch (x) { }
        if (_anrufKanaele[u.id] === k) delete _anrufKanaele[u.id];
        if (anrufEigenerKanal === k) anrufEigenerKanal = null;
        _anrufVersuche++;
        if (_anrufVersuche <= 5) setTimeout(anrufBereit, Math.min(30000, 3000 * _anrufVersuche));
        else if (typeof weckerBalken === "function")
          weckerBalken("Die Klingel-Leitung steht gerade nicht: solange die App offen ist, kommen " +
            "Anrufe auf diesem Geraet nicht an. Meist hilft: Seite neu laden.", "warn", "anrufkanal", 5);
      }
    });
  } catch (e) { /* Anrufe stoeren nie die Seite */ }
}

function anrufKanalZu(zielId) {
  return new Promise(fertig => {
    const alt = _anrufKanaele[zielId];
    if (alt) {
      // Ein einmal gemerkter Kanal kann laengst tot sein. Frueher wurde er
      // nie verworfen - dann ging jedes Klingeln stumm ins Leere.
      if (alt === anrufEigenerKanal || alt.state === "joined") { fertig(alt); return; }
      try { supa.removeChannel(alt); } catch (e) { }
      delete _anrufKanaele[zielId];
    }
    // self:true auch beim Sende-Kanal: noetig, damit Sender- und
    // Hörer-Kanal desselben Clients sich erreichen (Test und Sonderfaelle);
    // im normalen Zwei-Geräte-Anruf ohne Wirkung (kein Hörer hier).
    const k = supa.channel("kt-anruf-" + zielId, { config: { broadcast: { self: true } } });
    let gemeldet = false;
    const melde = wert => { if (!gemeldet) { gemeldet = true; fertig(wert); } };
    k.subscribe(status => {
      if (status === "SUBSCRIBED") { _anrufKanaele[zielId] = k; melde(k); return; }
      // Fehler sofort melden statt sechs Sekunden ins Leere zu warten
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        try { supa.removeChannel(k); } catch (e) { }
        melde(null);
      }
    });
    setTimeout(() => melde(_anrufKanaele[zielId] || null), 6000);
  });
}

// Gibt jetzt ein Ergebnis zurueck statt hart true:
//   { ok: true }  oder  { ok: false, grund: "..." }
// Frueher wurde die Antwort von k.send weggeworfen und IMMER true
// gemeldet - ein nie zugestelltes Klingeln galt damit als zugestellt.
async function anrufSenden(zielId, obj) {
  const key = await kryptoDm(zielId);
  if (!key) return { ok: false, grund: "kein Schluessel zu diesem Freund" };
  const u = await supaNutzer();
  const k = await anrufKanalZu(zielId);
  if (!k) return { ok: false, grund: "keine Leitung zum Freund" };
  let antwort = "error";
  try {
    antwort = await k.send({ type: "broadcast", event: "signal",
      payload: { von: u.id, daten: await e2eZu(key, JSON.stringify(obj)) } });
  } catch (e) { antwort = "error"; }
  if (antwort !== "ok")
    return { ok: false, grund: antwort === "timed out" ? "Zeit abgelaufen" : "nicht hinausgegangen" };
  return { ok: true };
}

async function anrufSignal(roh) {
  if (!roh || !roh.von) return;
  const key = await kryptoDm(roh.von);
  let s;
  try { s = JSON.parse(await e2eAuf(key, roh.daten)); } catch (e) {
    // Frueher wurde hier kommentarlos aufgegeben: der Angerufene sah NICHTS,
    // der Anrufer bekam nach 45 Sekunden "Keine Antwort". Meist fehlt nur
    // der Ende-zu-Ende-Schluessel zu diesem Freund auf diesem Geraet.
    if (typeof weckerBalken === "function")
      weckerBalken("Jemand versucht dich anzurufen, aber auf diesem Geraet fehlt der Schluessel " +
        "zu ihm. Einmal abmelden und wieder anmelden holt ihn zurueck.", "warn", "anruf-schluessel", 2);
    return;
  }
  if (!s || !s.typ) return;

  if (s.typ === "klingeln") {
    // Wiederholtes Klingeln DESSELBEN Anrufers ist kein besetzt: er klingelt
    // regelmaessig weiter, damit eine per Push geoeffnete App es noch faengt.
    if ((anrufEingehend && anrufEingehend.von === roh.von) ||
        (anrufPartner && anrufPartner.id === roh.von)) return;
    if (anrufPc || anrufEingehend) { anrufSenden(roh.von, { typ: "besetzt" }); return; }
    const p = await supa.from("kt_profiles").select("username").eq("id", roh.von).maybeSingle();
    anrufEingehend = { von: roh.von, name: (p.data && p.data.username) || "?",
      offer: s.offer, video: !!s.video, eis: [] };
    anrufWartenWeg();
    // Hat er schon auf dem Sperrbildschirm "Annehmen" gedrueckt, wird
    // JETZT abgehoben - ohne dass er in der App noch einmal druecken muss.
    if (anrufWunschEinloesen(roh.von)) return;
    // DER WECKER: Vollbild, echter Klingelton, Vibrieren. Und der Anruf
    // raeumt sich nach 60 Sekunden selbst weg, damit ein toter Anruf nicht
    // alle weiteren Anrufer auf "besetzt" laufen laesst.
    anrufWeckerAn(anrufEingehend.name, !!s.video, roh.von);
    anrufEingehendUhrStellen();
    // Die Meldung erst bauen, wenn das Bild da ist - aber hoechstens
    // 800 Millisekunden warten. Ein Anruf darf nie auf ein Bild warten.
    anrufMeldungMitBild(roh.von, anrufEingehend.name, !!s.video);
  } else if (s.typ === "annahme") {
    anrufKlingelStopp();
    // Das Freizeichen MUSS hier aufhoeren, sonst tutet es beim Anrufer
    // waehrend des ganzen Gespraechs weiter. Bewusst hier und NICHT in
    // anrufKlingelStopp(): anrufStarten ruft das gleich nach dem
    // Einschalten des Freizeichens auf und wuerde es sofort abwuergen.
    anrufFreizeichenAus();
    // Nur der Angerufene selbst darf antworten - sonst könnte ein Dritter
    // mit Schlüssel die Verbindung übernehmen.
    if (anrufPc && anrufPartner && roh.von === anrufPartner.id) await anrufPc.setRemoteDescription(s.answer);
  } else if (s.typ === "eis") {
    if (anrufPc && anrufPartner && roh.von === anrufPartner.id) { try { await anrufPc.addIceCandidate(s.eis); } catch (e) {} }
    else if (anrufEingehend && anrufEingehend.von === roh.von) anrufEingehend.eis.push(s.eis);
  } else if (s.typ === "besetzt" || s.typ === "abgelehnt" || s.typ === "aufgelegt") {
    const text = s.typ === "besetzt" ? "Besetzt: dort laeuft schon ein Anruf."
      : s.typ === "abgelehnt" ? "Anruf abgelehnt." : "Aufgelegt.";
    if (anrufPartner && roh.von === anrufPartner.id) anrufBeenden(text);
    else if (anrufEingehend && roh.von === anrufEingehend.von) {
      anrufEingehend = null; anrufWeckerAus(); anrufPanelZu();
    }
  }
}

function anrufPanel(text, tasten) {
  let p = document.getElementById("anrufpanel");
  if (!p) {
    p = document.createElement("div");
    p.id = "anrufpanel";
    // Ohne diese Zeilen haengt das Fenster unformatiert am Seitenende
    // und die Knoepfe waeren praktisch unerreichbar.
    p.style.position = "fixed";
    p.style.zIndex = "2147482000";
    document.body.appendChild(p);
    anrufFensterSchiebbar(p);
    anrufFensterStellen(p);
  }
  p.innerHTML =
    '<div class="anruf-griff" title="Zum Verschieben ziehen">' +
    '<span class="anruf-griffbalken"></span></div>' +
    '<div class="anruf-kopf"><span id="anruf-bild" class="anruf-bild"></span>' +
    '<span class="anruf-wer"><span class="anruf-text">' + text + "</span>" +
    '<span id="anruf-dauer" class="anruf-dauer mini"></span></span></div>' +
    '<div id="anruf-medien"></div><div class="anruf-tasten">' + (tasten || "") + "</div>";
  return p;
}

// ---------- Verschieben mit Maus und Finger ----------
// Ein einziger Satz Zeiger-Ereignisse, damit es am Laptop und am Handy
// gleich funktioniert. Das Fenster bleibt immer im Bild.
function anrufFensterSchiebbar(p) {
  let ab = null;
  const runter = e => {
    // Nur am Griff ziehen, sonst kaeme man an die Knoepfe nicht mehr heran.
    if (!e.target.closest || !e.target.closest(".anruf-griff")) return;
    const r = p.getBoundingClientRect();
    ab = { x: e.clientX - r.left, y: e.clientY - r.top };
    p.classList.add("anruf-faehrt");
    try { p.setPointerCapture(e.pointerId); } catch (x) { }
    e.preventDefault();
  };
  const zieht = e => {
    if (!ab) return;
    const r = p.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, e.clientX - ab.x));
    const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, e.clientY - ab.y));
    p.style.left = x + "px"; p.style.top = y + "px";
    p.style.right = "auto"; p.style.bottom = "auto";
    e.preventDefault();
  };
  const hoch = () => {
    if (!ab) return;
    ab = null;
    p.classList.remove("anruf-faehrt");
    try { localStorage.setItem("kt_anrufplatz",
      JSON.stringify({ left: p.style.left, top: p.style.top })); } catch (x) { }
  };
  p.addEventListener("pointerdown", runter);
  p.addEventListener("pointermove", zieht);
  p.addEventListener("pointerup", hoch);
  p.addEventListener("pointercancel", hoch);
}

// Dorthin stellen, wo es zuletzt stand - aber nur, wenn das noch im Bild
// ist (anderer Bildschirm, Fenster kleiner gemacht).
function anrufFensterStellen(p) {
  try {
    const o = JSON.parse(localStorage.getItem("kt_anrufplatz") || "null");
    if (!o || !o.left || !o.top) return;
    const x = parseInt(o.left, 10), y = parseInt(o.top, 10);
    if (isNaN(x) || isNaN(y)) return;
    if (x < 0 || y < 0 || x > window.innerWidth - 80 || y > window.innerHeight - 60) return;
    p.style.left = x + "px"; p.style.top = y + "px";
    p.style.right = "auto"; p.style.bottom = "auto";
  } catch (e) { }
}

function anrufPanelZu() {
  anrufDauerStoppen();
  const p = document.getElementById("anrufpanel");
  if (p) p.remove();
}

async function anrufPcBauen(zielId, mitVideo) {
  ANRUF_STUN = anrufEisBauen();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      mitVideo ? { video: true, audio: true } : { audio: true });
  } catch (e) {
    return { fehler: "Mikrofon" + (mitVideo ? "/Kamera" : "") +
      " nicht erlaubt oder nicht vorhanden (" + e.name + ")." };
  }
  const pc = new RTCPeerConnection(ANRUF_STUN);
  for (const t of stream.getTracks()) pc.addTrack(t, stream);
  pc.onicecandidate = ev => { if (ev.candidate) anrufSenden(zielId, { typ: "eis", eis: ev.candidate }); };
  pc.ontrack = ev => {
    const ziel = document.getElementById("anruf-medien");
    if (!ziel || ziel.querySelector("[data-fern]")) return;
    const el = document.createElement(mitVideo ? "video" : "audio");
    el.autoplay = true;
    el.dataset.fern = "1";
    if (mitVideo) el.className = "medienvideo";
    el.srcObject = ev.streams[0];
    ziel.appendChild(el);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      // Jetzt steht das Gespraech: die Bedienung einblenden und die Uhr starten.
      const t = document.querySelector("#anrufpanel .anruf-tasten");
      if (t && !document.getElementById("anruf-stumm"))
        t.innerHTML = anrufTastenLeiste(!!(anrufPartner && anrufPartner.video));
      if (!_anrufDauerUhr) anrufDauerStarten();
    }
    if (pc.connectionState === "connected" && typeof weckerBalken === "function") {
      weckerBalken("Verbunden. Wenn du nichts hoerst: pruefe die Lautstaerke und ob das " +
        "Mikrofon erlaubt ist.", "gut", "anruf-verbunden", 1);
    }
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected")
      anrufBeenden("Verbindung verloren.");
  };
  // Kommt gar keine Verbindung zustande, sagt das Programm WARUM - frueher
  // hiess es nur "Verbindung verloren", ohne dass jemand wusste, woran es lag.
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed" && typeof weckerBalken === "function") {
      weckerBalken("Der Ton findet keinen Weg zwischen euren Geraeten. Das passiert in " +
        "manchen Mobilfunknetzen. Versuch es ueber WLAN noch einmal.", "warn", "anruf-eis", 2);
    }
  };
  anrufPc = pc;
  anrufStream = stream;
  return { ok: true };
}

async function anrufStarten(partnerId, name, mitVideo) {
  if (anrufPc || anrufEingehend) { alert("Es laeuft schon ein Anruf."); return; }
  const key = await kryptoDm(partnerId);
  if (!key) { alert("Anruf nicht moeglich: dein Freund braucht einmal die neue Version."); return; }
  const b = await anrufPcBauen(partnerId, mitVideo);
  if (b.fehler) { alert(b.fehler); return; }
  anrufPartner = { id: partnerId, name: name, video: mitVideo };
  anrufPanel("Rufe <b>" + String(name).replace(/</g, "&lt;") + "</b> an...",
    '<button onclick="anrufAuflegen()">Auflegen</button>');
  const offer = await anrufPc.createOffer();
  await anrufPc.setLocalDescription(offer);
  const gesendet = await anrufSenden(partnerId, { typ: "klingeln", offer: offer, video: mitVideo });
  // Der Push geht IMMER hinaus - auch wenn der Signalweg nicht steht.
  // Frueher stand das return davor: ausgerechnet wenn die App des Freundes
  // zu war, wurde gar nichts geschickt.
  let pushErgebnis = null;
  if (typeof pushSenden === "function") pushErgebnis = await pushSenden(partnerId, "anruf");
  if (!gesendet.ok) {
    const dazu = (pushErgebnis && pushErgebnis.ok && pushErgebnis.gesendet > 0)
      ? " Eine Benachrichtigung auf sein Geraet ist aber hinausgegangen."
      : " Auch eine Benachrichtigung auf sein Geraet ging nicht hinaus.";
    anrufBeenden("Das Klingeln kam nicht durch (" + gesendet.grund + ")." + dazu);
    return;
  }
  // Freizeichen fuer den Anrufer: man hoert, dass es wirklich laeuft.
  if (typeof anrufFreizeichenAn === "function") anrufFreizeichenAn();
  if (typeof weckerBalken === "function" && pushErgebnis) {
    if (!pushErgebnis.ok)
      weckerBalken("Hinweis: die Benachrichtigung auf sein Geraet ging nicht hinaus (" +
        pushErgebnis.fehler + "). Merkt er den Anruf nicht, liegt es daran.", "warn", "anrufpush", 5);
    else if (pushErgebnis.geraete === 0)
      weckerBalken(String(name) + " hat auf keinem Geraet Benachrichtigungen eingeschaltet. " +
        "Ist die App dort gerade zu, klingelt bei ihm gar nichts.", "warn", "anrufpush", 5);
  }
  // ... und alle 3 Sekunden weiterklingeln, bis er annimmt oder 45 s um sind
  let versuche = 0;
  anrufKlingelStopp();
  anrufKlingelTimer = setInterval(() => {
    versuche++;
    if (!anrufPc || versuche > 15) {
      anrufKlingelStopp();
      if (anrufPc && versuche > 15) anrufBeenden("Keine Antwort.");
      return;
    }
    anrufSenden(partnerId, { typ: "klingeln", offer: offer, video: mitVideo });
  }, 3000);
}

function anrufKlingelStopp() {
  if (anrufKlingelTimer) { clearInterval(anrufKlingelTimer); anrufKlingelTimer = null; }
}

async function anrufAnnehmen() {
  const ein = anrufEingehend;
  if (!ein) return;
  anrufEingehend = null;   // sofort sperren: ein zweiter Klick baut sonst doppelt
  anrufWeckerAus();        // Klingelton, Vibrieren und Vollbild aus
  const b = await anrufPcBauen(ein.von, ein.video);
  if (b.fehler) { alert(b.fehler); anrufSenden(ein.von, { typ: "abgelehnt" }); anrufPanelZu(); return; }
  anrufPartner = { id: ein.von, name: ein.name, video: ein.video };
  anrufPanel("Im Gespraech mit <b>" + ein.name.replace(/</g, "&lt;") + "</b>",
    anrufTastenLeiste(ein.video));
  anrufKopfSchmuecken(ein.von, ein.name);
  anrufDauerStarten();
  await anrufPc.setRemoteDescription(ein.offer);
  for (const eis of ein.eis) { try { await anrufPc.addIceCandidate(eis); } catch (e) {} }
  const answer = await anrufPc.createAnswer();
  await anrufPc.setLocalDescription(answer);
  await anrufSenden(ein.von, { typ: "annahme", answer: answer });
}

function anrufAblehnen() {
  if (anrufEingehend) anrufSenden(anrufEingehend.von, { typ: "abgelehnt" });
  anrufEingehend = null;
  anrufWeckerAus();
  anrufPanelZu();
}

function anrufAuflegen() {
  if (anrufPartner) anrufSenden(anrufPartner.id, { typ: "aufgelegt" });
  anrufBeenden(null);
}

function anrufBeenden(meldungText) {
  anrufKlingelStopp();
  anrufWeckerAus();
  if (anrufPc) { try { anrufPc.close(); } catch (e) {} }
  if (anrufStream) anrufStream.getTracks().forEach(t => t.stop());
  anrufPc = null; anrufStream = null; anrufPartner = null; anrufEingehend = null;
  anrufPanelZu();
  if (meldungText) {
    anrufPanel(meldungText, '<button onclick="anrufPanelZu()">schliessen</button>');
    setTimeout(anrufPanelZu, 4000);
  }
}

// ============================================================
// DER WECKER, Teil Anruf (28.08.)
// Ein Anruf muss unmoeglich zu uebersehen sein - auch wenn die
// App offen im Hintergrund liegt. Deshalb:
//   1. Vollbild-Klingeln mit grossem gruenem Annehmen und rotem
//      Ablehnen (wie beim Telefon).
//   2. Ein echter Klingelton, im Browser SELBST erzeugt
//      (Web-Audio, zwei Toene uebereinander) - keine fremde Datei,
//      nichts nachzuladen, funktioniert auch offline.
//   3. Vibrieren, solange es klingelt.
//   4. Ein leises Freizeichen fuer den Anrufer, damit er hoert,
//      dass es wirklich hinausgegangen ist.
//   5. Ein eingehender Anruf raeumt sich nach 60 Sekunden selbst
//      auf - vorher blieb ein toter Anruf haengen und alle
//      weiteren Anrufer hoerten "besetzt".
//
// Alles hier ist Anzeige und Ton. Der Signalweg (WebRTC, die
// verschluesselten Klingel-Signale) wird NICHT angefasst.
// ============================================================

let _wkTon = null;            // der Ton-Baukasten des Browsers
let _wkKlingelUhr = null;     // Takt fuer das Klingeln
let _wkFreiUhr = null;        // Takt fuer das Freizeichen
let _wkEingehendUhr = null;   // raeumt einen toten Anruf nach 60 s weg

function wkTonKontext() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_wkTon) _wkTon = new AC();
    if (_wkTon.state === "suspended") { try { _wkTon.resume(); } catch (e) { } }
    return _wkTon;
  } catch (e) { return null; }
}

// Ein Klingel-Stoss: zweimal kurz, zwei Toene uebereinander.
// Gibt false zurueck, wenn der Browser Ton noch sperrt (dann sagen
// wir das ehrlich, statt so zu tun, als klaenge etwas).
function wkTonStoss(muster, laut, hoehen) {
  const ac = wkTonKontext();
  if (!ac || ac.state !== "running") return false;
  const jetzt = ac.currentTime;
  for (const teil of muster) {
    for (const hz of hoehen) {
      try {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "sine";
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, jetzt + teil[0]);
        g.gain.exponentialRampToValueAtTime(laut, jetzt + teil[0] + 0.04);
        g.gain.setValueAtTime(laut, jetzt + teil[0] + teil[1] - 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, jetzt + teil[0] + teil[1]);
        o.connect(g);
        g.connect(ac.destination);
        o.start(jetzt + teil[0]);
        o.stop(jetzt + teil[0] + teil[1] + 0.03);
      } catch (e) { return false; }
    }
  }
  return true;
}

function wkKlingelStoss() { return wkTonStoss([[0, 0.42], [0.62, 0.42]], 0.09, [440, 660]); }
function wkFreiStoss() { return wkTonStoss([[0, 0.9]], 0.035, [425]); }

let _wkNachholen = null;   // haengt, solange der Ton auf den ersten Klick wartet

function anrufKlingelnAus() {
  if (_wkKlingelUhr) { clearInterval(_wkKlingelUhr); _wkKlingelUhr = null; }
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { }
  // Die Zuhoerer vom stummen Klingeln wieder abraeumen. Ohne das kaeme bei
  // jedem lautlos gebliebenen Anruf ein weiterer Satz dazu und sie
  // haetten sich mit der Zeit angesammelt.
  if (_wkNachholen) {
    document.removeEventListener("click", _wkNachholen, true);
    document.removeEventListener("keydown", _wkNachholen, true);
    document.removeEventListener("touchstart", _wkNachholen, true);
    _wkNachholen = null;
  }
}

// Gibt zurueck, ob wirklich ein Ton kam.
function anrufKlingelnAn() {
  anrufKlingelnAus();
  const einmal = () => {
    wkKlingelStoss();
    try { if (navigator.vibrate) navigator.vibrate([500, 250, 500]); } catch (e) { }
  };
  const gingLos = wkKlingelStoss();
  try { if (navigator.vibrate) navigator.vibrate([500, 250, 500]); } catch (e) { }
  _wkKlingelUhr = setInterval(einmal, 2400);
  if (!gingLos) {
    // Manche Browser lassen Ton erst zu, nachdem der Mensch einmal
    // irgendwo geklickt hat. Dann holen wir es beim ersten Klick nach.
    const nachholen = () => {
      document.removeEventListener("click", nachholen, true);
      document.removeEventListener("keydown", nachholen, true);
      document.removeEventListener("touchstart", nachholen, true);
      if (_wkNachholen === nachholen) _wkNachholen = null;
      if (_wkKlingelUhr) einmal();
    };
    _wkNachholen = nachholen;
    document.addEventListener("click", nachholen, true);
    document.addEventListener("keydown", nachholen, true);
    document.addEventListener("touchstart", nachholen, true);
  }
  return gingLos;
}

function anrufFreizeichenAus() {
  if (_wkFreiUhr) { clearInterval(_wkFreiUhr); _wkFreiUhr = null; }
}

function anrufFreizeichenAn() {
  anrufFreizeichenAus();
  wkFreiStoss();
  _wkFreiUhr = setInterval(wkFreiStoss, 4000);
}

// ---------- Das Vollbild-Klingeln ----------

function anrufVollbildZu() {
  const d = document.getElementById("weckerruf");
  if (d) d.remove();
}

function anrufVollbild(name, mitVideo, tonHinweis, vonId) {
  anrufVollbildZu();
  if (!document.body) return;
  const d = document.createElement("div");
  d.id = "weckerruf";
  d.innerHTML =
    '<div class="wk-karte">' +
    '<div class="wk-oben">Eingehender ' + (mitVideo ? "Video-Anruf" : "Anruf") + "</div>" +
    '<div class="wk-kreis"><span class="wk-buchstabe"></span><img class="wk-foto" alt=""></div>' +
    '<div class="wk-name"></div>' +
    '<div class="wk-art">' + (mitVideo ? "mit Bild und Ton" : "nur Ton") + "</div>" +
    (tonHinweis ? '<div class="wk-tonhinweis"></div>' : "") +
    '<div class="wk-tasten">' +
    '<button class="wk-ja" onclick="anrufAnnehmen()">&#128222; Annehmen</button>' +
    '<button class="wk-nein" onclick="anrufAblehnen()">Ablehnen</button>' +
    "</div></div>";
  // Die TRAGENDE Geometrie steht direkt hier, nicht nur in stil.css.
  // Grund: die Design-Schicht muss sich loeschen lassen, ohne dass etwas
  // kaputtgeht (Karams Regel). Ohne diese Zeilen haenge der Anrufschirm
  // als unformatierter Kasten ganz unten an der Seite und waere praktisch
  // unsichtbar. Alles Schoene (Farben, Rundungen, Kreis) bleibt im CSS.
  d.style.position = "fixed";
  d.style.left = "0"; d.style.top = "0"; d.style.right = "0"; d.style.bottom = "0";
  d.style.zIndex = "2147483000";
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.style.justifyContent = "center";
  d.style.background = "rgba(10, 18, 32, 0.92)";
  document.body.appendChild(d);
  // Namen NIE als HTML einsetzen - so kann kein Benutzername Unfug bauen.
  d.querySelector(".wk-name").textContent = name || "Unbekannt";
  d.querySelector(".wk-buchstabe").textContent = String(name || "?").slice(0, 1).toUpperCase();
  // Das Profilbild nachholen. Bis es da ist, steht der Anfangsbuchstabe
  // im Kreis - der Anruf klingelt sofort und wartet auf nichts.
  if (vonId && typeof profilFotoLaden === "function") {
    profilFotoLaden(vonId).then(f => {
      const el = d.querySelector(".wk-foto");
      if (f && el && document.body.contains(d)) { el.src = f; d.classList.add("wk-hatfoto"); }
    }).catch(() => { });
  }
  // Und der Anzeigename, wenn die Person sich einen gegeben hat.
  if (vonId && typeof profileLaden === "function") {
    profileLaden([vonId]).then(() => {
      const el = d.querySelector(".wk-name");
      if (el && document.body.contains(d) && typeof profilName === "function")
        el.textContent = profilName(vonId, name || "Unbekannt");
    }).catch(() => { });
  }
  if (tonHinweis) d.querySelector(".wk-tonhinweis").textContent = tonHinweis;
}

// Klingeln komplett an: Bild, Ton, Vibrieren.
function anrufWeckerAn(name, mitVideo, vonId) {
  const tonKam = anrufKlingelnAn();
  anrufVollbild(name, mitVideo, tonKam ? null :
    "Ton konnte noch nicht starten - dieser Browser erlaubt ihn erst, wenn du einmal auf die Seite klickst.",
    vonId);
}

function anrufWeckerAus() {
  anrufWartenWeg();
  anrufMeldungWeg(anrufEingehend ? anrufEingehend.von : null);
  anrufKlingelnAus();
  anrufFreizeichenAus();
  anrufVollbildZu();
  if (_wkEingehendUhr) { clearTimeout(_wkEingehendUhr); _wkEingehendUhr = null; }
}

// Ein eingehender Anruf, der nie beantwortet und nie abgesagt wird
// (Anrufer schliesst den Laptop, Netz weg), blockierte frueher fuer
// immer: jeder weitere Anrufer bekam "besetzt". Jetzt raeumt er sich
// nach 60 Sekunden selbst weg.
function anrufEingehendUhrStellen() {
  if (_wkEingehendUhr) clearTimeout(_wkEingehendUhr);
  const derselbe = anrufEingehend;
  _wkEingehendUhr = setTimeout(() => {
    if (anrufEingehend && anrufEingehend === derselbe) {
      const wer = anrufEingehend.name;
      const werId = anrufEingehend.von;
      anrufEingehend = null;
      anrufWeckerAus();
      if (typeof weckerBalken === "function")
        weckerBalken("Verpasster Anruf von " + wer + ".", "warn");
      // Ein verpasster Anruf darf nicht spurlos verschwinden. Die
      // "ruft dich an"-Meldung wird weggeraeumt (es ruft ja niemand mehr),
      // dafuer bleibt eine, die stehenbleibt und im Verlauf steht.
      anrufVerpasstMerken(werId, wer);
    }
  }, 60000);
}

// ---------- Was der Service Worker meldet ----------
// Der Klick auf "Annehmen" oder "Ablehnen" in der Push-Meldung
// landet hier, wenn die App offen ist.

// Der Wunsch vom Sperrbildschirm, gemerkt bis das Klingeln da ist.
let _anrufWunsch = null;   // { was: "annehmen"|"ablehnen", von, bis }

function anrufWunschGueltig() {
  if (_anrufWunsch && Date.now() > _anrufWunsch.bis) _anrufWunsch = null;
  return _anrufWunsch;
}

// Passt der gemerkte Wunsch zu DIESEM Anrufer? Der Server schickt die
// Kennung des Anrufers mit; fehlt sie (alte Meldung), gilt der Wunsch
// fuer den naechsten Anruf ueberhaupt - besser als gar nicht abheben.
function anrufWunschEinloesen(vonId) {
  const w = anrufWunschGueltig();
  if (!w) return false;
  if (w.von && vonId && w.von !== vonId) return false;
  _anrufWunsch = null;
  if (w.was === "ablehnen") { anrufAblehnen(); return true; }
  anrufAnnehmen();
  return true;
}

function anrufVomServiceWorker(d) {
  try {
    if (!d || !d.kt) return;
    if (d.kt === "anruf-annehmen" || d.kt === "anruf-ablehnen") {
      const was = d.kt === "anruf-annehmen" ? "annehmen" : "ablehnen";
      // Ist der Anruf schon da: sofort. Sonst 45 Sekunden lang merken -
      // genau so lange klingelt der Anrufer weiter.
      if (anrufEingehend && (!d.von || anrufEingehend.von === d.von)) {
        if (was === "ablehnen") anrufAblehnen(); else anrufAnnehmen();
        return;
      }
      _anrufWunsch = { was: was, von: d.von || null, bis: Date.now() + 45000 };
      if (was === "annehmen") anrufWartenZeigen();
      return;
    }
    // Nur auf die Meldung getippt (am iPhone gibt es keine Knoepfe auf
    // der Meldung): dann keinesfalls von selbst abheben, aber sofort
    // zeigen, dass gleich ein Anruf kommt - statt einer leeren Seite.
    if (d.kt === "anruf-oeffnen" && !anrufEingehend && !anrufPc) anrufWartenZeigen();
  } catch (e) { }
}

// Die kurze Luecke zwischen "App geht auf" und "Klingeln kommt an"
// darf nicht wie ein Fehler aussehen.
function anrufWartenZeigen() {
  if (document.getElementById("anruf-warten")) return;
  const d = document.createElement("div");
  d.id = "anruf-warten";
  d.className = "anruf-warten";
  d.innerHTML = '<div class="aw-ring"></div>' +
    '<div class="aw-text">Anruf wird verbunden...</div>' +
    '<div class="aw-mini">Einen Augenblick, das Klingeln ist gleich da.</div>';
  document.body.appendChild(d);
  // Kommt in 12 Sekunden nichts, war der Anrufer schon weg.
  setTimeout(() => {
    const w = document.getElementById("anruf-warten");
    if (w && !anrufEingehend && !anrufPc) {
      w.querySelector(".aw-text").textContent = "Der Anruf ist nicht mehr da.";
      w.querySelector(".aw-mini").textContent = "Wahrscheinlich hat er inzwischen aufgelegt.";
      setTimeout(anrufWartenWeg, 4000);
    }
  }, 12000);
}

function anrufWartenWeg() {
  const w = document.getElementById("anruf-warten");
  if (w) w.remove();
}

// ============================================================
// SELBSTPROBE: findet dieses Geraet einen Weg fuer den Ton?
// Baut eine Probeverbindung ohne Mikrofon auf und schaut nach,
// welche Wege der Browser findet:
//   host  = nur im eigenen Netz (zu wenig)
//   srflx = ueber STUN gefunden (reicht in fast jedem WLAN)
//   relay = ueber einen Umleitungs-Server (geht ueberall)
// ============================================================
async function anrufProbe(sekunden) {
  const erg = { host: false, srflx: false, relay: false, fehler: [], turnEingetragen: 0 };
  try {
    const einst = anrufEisBauen();
    erg.turnEingetragen = einst.iceServers.filter(s =>
      String(s.urls || "").indexOf("turn") === 0).length;
    const pc = new RTCPeerConnection(einst);
    pc.createDataChannel("probe");
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      const m = /typ (\w+)/.exec(e.candidate.candidate || "");
      if (m && erg[m[1]] === false) erg[m[1]] = true;
    };
    pc.onicecandidateerror = e => {
      if (erg.fehler.length < 4) erg.fehler.push((e.url || "?") + ": " + (e.errorText || e.errorCode));
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(r => setTimeout(r, (sekunden || 6) * 1000));
    pc.close();
  } catch (e) { erg.fehler.push(String(e.message || e)); }
  return erg;
}

// Dasselbe in einem Satz, den man ohne Fachwissen versteht.
async function anrufProbeText() {
  const p = await anrufProbe(6);
  if (p.relay)
    return { gut: true, text: "Anrufe gehen von hier aus ueberall hinaus - auch im Mobilfunknetz." };
  // KEINE Warnung mehr. Ueber WLAN finden sich die beiden Geraete direkt,
  // und genau so wird die Kombi-Tafel benutzt - das ist der Normalfall und
  // kein Mangel. Eine Selbstprobe, die staendig orange leuchtet, obwohl
  // alles stimmt, bringt niemandem etwas: beim naechsten Mal schaut man
  // gar nicht mehr hin, und dann faellt auch ein echter Fehler nicht auf.
  if (p.srflx && p.turnEingetragen === 0)
    return { gut: true, text: "Anrufe gehen von diesem Geraet hinaus. Im WLAN klappt das " +
      "praktisch immer. Nur in manchen Mobilfunknetzen kann der Ton fehlen - dafuer " +
      "braeuchte es einen Umleitungs-Server (steht in anruf-server.js)." };
  if (p.srflx)
    return { gut: true, warn: true, text: "Anrufe gehen im WLAN. Der eingetragene Umleitungs-Server " +
      "antwortet aber nicht" + (p.fehler.length ? " (" + p.fehler[0] + ")" : "") + "." };
  return { gut: false, text: "Dieses Geraet findet gar keinen Weg nach draussen. Anrufe werden hier " +
    "nicht funktionieren" + (p.fehler.length ? " (" + p.fehler[0] + ")" : "") + "." };
}
// ============================================================
// DIE MELDUNG MIT DEM GESICHT DES ANRUFERS
//
// Am Laptop und am Android-Handy zeigt die Meldung das Profilbild -
// so sieht man beim Klingeln sofort, wer dran ist, und kann direkt
// aus der Meldung heraus abheben.
//
// EHRLICH DAZU: auf dem iPhone geht das NICHT. Apple zeigt in einer
// Web-Push-Meldung immer nur das Zeichen der App selbst und laesst
// auch keine Knoepfe auf der Meldung zu. Dort tippt man die Meldung
// an, die App geht auf, und DANN steht das grosse Anrufbild mit Foto
// und den beiden Knoepfen da.
// ============================================================
async function anrufMeldungMitBild(vonId, name, mitVideo) {
  let bild = null;
  try {
    if (typeof profilFotoLaden === "function") {
      bild = await Promise.race([
        profilFotoLaden(vonId),
        new Promise(f => setTimeout(() => f(null), 800))
      ]);
    }
  } catch (e) { bild = null; }
  let anzeige = name;
  try {
    if (typeof profilName === "function") anzeige = profilName(vonId, name);
  } catch (e) { }
  if (typeof benachrichtige === "function")
    benachrichtige(anzeige + " ruft dich an!",
      mitVideo ? "Video-Anruf - annehmen oder ablehnen." : "Annehmen oder ablehnen.",
      "anruf", { von: vonId, bild: bild });
}

// Ist der Anruf vorbei, muss auch die Meldung weg - sonst steht auf dem
// Sperrbildschirm noch "ruft dich an", waehrend laengst niemand mehr ruft.
async function anrufMeldungWeg(vonId) {
  try {
    const reg = (typeof wkRegistrierung === "function") ? await wkRegistrierung(1500) : null;
    if (!reg || !reg.getNotifications) return;
    const liste = await reg.getNotifications({ tag: vonId ? "anruf-" + vonId : "anruf" });
    for (const m of liste) { try { m.close(); } catch (e) { } }
    if (!vonId) return;
    const rest = await reg.getNotifications();
    for (const m of rest) {
      const d = m.data || {};
      if (d.art === "anruf") { try { m.close(); } catch (e) { } }
    }
  } catch (e) { }
}
// Haelt einen verpassten Anruf fest: als Meldung, die stehenbleibt, und
// im Verlauf in der Glocke. Vorher war er nach 60 Sekunden einfach weg.
async function anrufVerpasstMerken(vonId, name) {
  let bild = null, anzeige = name;
  try {
    if (typeof profilFotoLaden === "function") bild = await profilFotoLaden(vonId);
    if (typeof profilName === "function") anzeige = profilName(vonId, name);
  } catch (e) { }
  const titel = "Verpasster Anruf von " + anzeige;
  try {
    if (typeof verlaufSchreiben === "function")
      await verlaufSchreiben({ titel: titel, text: "Nicht angenommen.",
        art: "verpasst", von: vonId, bild: bild });
  } catch (e) { }
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = (typeof wkRegistrierung === "function") ? await wkRegistrierung(2000) : null;
    if (!reg) return;
    await reg.showNotification(titel, {
      body: "Du warst gerade nicht da.",
      icon: bild || "logo-192.png", badge: "logo-192.png",
      tag: "verpasst-" + vonId, renotify: false,
      // requireInteraction bewusst AUS: sie soll im Verlauf des Geraets
      // liegen bleiben, aber nicht den Bildschirm blockieren.
      data: { url: "mein.html", art: "verpasst", von: vonId }
    });
  } catch (e) { }
}
// ---------- Die Bedienung waehrend des Gespraechs ----------

function anrufTastenLeiste(mitVideo) {
  return '<button id="anruf-stumm" class="anruf-taste" onclick="anrufStumm()" ' +
    'title="Mikrofon aus- und einschalten">&#127908; Stumm</button>' +
    (mitVideo ? '<button id="anruf-kamera" class="anruf-taste" onclick="anrufKamera()" ' +
      'title="Kamera aus- und einschalten">&#128247; Kamera</button>' : "") +
    '<button class="anruf-taste anruf-auf" onclick="anrufAuflegen()" ' +
    'title="Auflegen">&#128222; Auflegen</button>';
}

// Gesicht und Anzeigename in den Kopf des Fensters.
async function anrufKopfSchmuecken(vonId, name) {
  try {
    const b = document.getElementById("anruf-bild");
    if (b && typeof profilBildEl === "function") {
      b.innerHTML = "";
      b.appendChild(profilBildEl(vonId, name, 34));
    }
  } catch (e) { }
}

// ---------- Stumm ----------
// Es wird die Spur selbst abgeschaltet (enabled = false). Dann geht
// WIRKLICH nichts mehr hinaus - anders als beim blossen Leiserdrehen.
function anrufStumm() {
  if (!anrufStream) return;
  const spuren = anrufStream.getAudioTracks();
  if (!spuren.length) return;
  const anJetzt = !spuren[0].enabled;
  for (const s of spuren) s.enabled = anJetzt;
  const k = document.getElementById("anruf-stumm");
  if (k) {
    k.classList.toggle("anruf-aus", !anJetzt);
    k.innerHTML = anJetzt ? "&#127908; Stumm" : "&#128263; Stumm AN";
    k.title = anJetzt ? "Mikrofon ist an - antippen zum Stummschalten"
      : "Mikrofon ist AUS - er hoert dich nicht";
  }
  if (typeof weckerBalken === "function")
    weckerBalken(anJetzt ? "Mikrofon wieder an." : "Mikrofon aus - er hoert dich nicht.",
      anJetzt ? "gut" : "warn", "anruf-stumm", 0);
}

function anrufKamera() {
  if (!anrufStream) return;
  const spuren = anrufStream.getVideoTracks();
  if (!spuren.length) return;
  const anJetzt = !spuren[0].enabled;
  for (const s of spuren) s.enabled = anJetzt;
  const k = document.getElementById("anruf-kamera");
  if (k) {
    k.classList.toggle("anruf-aus", !anJetzt);
    k.innerHTML = anJetzt ? "&#128247; Kamera" : "&#128247; Kamera AUS";
  }
}

// ---------- Die laufende Gespraechsdauer ----------
let _anrufDauerUhr = null, _anrufBegonnen = 0;

function anrufDauerStarten() {
  anrufDauerStoppen();
  _anrufBegonnen = Date.now();
  const zeigen = () => {
    const e = document.getElementById("anruf-dauer");
    if (!e) { anrufDauerStoppen(); return; }
    const s = Math.floor((Date.now() - _anrufBegonnen) / 1000);
    e.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" +
      String(s % 60).padStart(2, "0");
  };
  zeigen();
  _anrufDauerUhr = setInterval(zeigen, 1000);
}

function anrufDauerStoppen() {
  if (_anrufDauerUhr) { clearInterval(_anrufDauerUhr); _anrufDauerUhr = null; }
}
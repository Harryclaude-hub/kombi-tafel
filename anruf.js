// ============================================================
// ANRUF: 1:1-Anrufe zwischen Freunden, direkt von Geraet zu
// Geraet (WebRTC). Ton und Bild laufen IMMER verschluesselt
// direkt zwischen den beiden Geraeten (DTLS-SRTP, fester Teil
// von WebRTC) - unsere Datenbank sieht sie nie.
// Nur das "Klingeln" (der Verbindungsaufbau) laeuft ueber
// Supabase Realtime, und diese Signale verpacken wir zusaetzlich
// Ende-zu-Ende mit dem Freundschafts-Schluessel.
// ============================================================
"use strict";

const ANRUF_STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

let anrufPc = null;              // die laufende Verbindung
let anrufStream = null;          // eigenes Mikro/Kamera
let anrufPartner = null;         // { id, name, video }
let anrufEingehend = null;       // { von, name, offer, video, eis: [] }
let anrufEigenerKanal = null;
const _anrufKanaele = {};        // zielId -> subscribed channel

// Auf jedem Seitenaufruf: eigenen Klingel-Kanal abonnieren
async function anrufBereit() {
  try {
    const u = await supaNutzer();
    if (!u || anrufEigenerKanal) return;
    anrufEigenerKanal = supa.channel("kt-anruf-" + u.id, { config: { broadcast: { self: true } } });
    anrufEigenerKanal.on("broadcast", { event: "signal" }, p => anrufSignal(p.payload));
    anrufEigenerKanal.subscribe();
  } catch (e) { /* Anrufe stoeren nie die Seite */ }
}

function anrufKanalZu(zielId) {
  return new Promise(fertig => {
    if (_anrufKanaele[zielId]) { fertig(_anrufKanaele[zielId]); return; }
    // self:true auch beim Sende-Kanal: noetig, damit Sender- und
    // Hoerer-Kanal desselben Clients sich erreichen (Test und Sonderfaelle);
    // im normalen Zwei-Geraete-Anruf ohne Wirkung (kein Hoerer hier).
    const k = supa.channel("kt-anruf-" + zielId, { config: { broadcast: { self: true } } });
    k.subscribe(status => {
      if (status === "SUBSCRIBED") { _anrufKanaele[zielId] = k; fertig(k); }
    });
    setTimeout(() => fertig(_anrufKanaele[zielId] || null), 6000);
  });
}

async function anrufSenden(zielId, obj) {
  const key = await kryptoDm(zielId);
  if (!key) return false;
  const u = await supaNutzer();
  const k = await anrufKanalZu(zielId);
  if (!k) return false;
  await k.send({ type: "broadcast", event: "signal",
    payload: { von: u.id, daten: await e2eZu(key, JSON.stringify(obj)) } });
  return true;
}

async function anrufSignal(roh) {
  if (!roh || !roh.von) return;
  const key = await kryptoDm(roh.von);
  let s;
  try { s = JSON.parse(await e2eAuf(key, roh.daten)); } catch (e) { return; }
  if (!s || !s.typ) return;

  if (s.typ === "klingeln") {
    if (anrufPc || anrufEingehend) { anrufSenden(roh.von, { typ: "besetzt" }); return; }
    const p = await supa.from("kt_profiles").select("username").eq("id", roh.von).maybeSingle();
    anrufEingehend = { von: roh.von, name: (p.data && p.data.username) || "?",
      offer: s.offer, video: !!s.video, eis: [] };
    anrufPanel("<b>" + anrufEingehend.name.replace(/</g, "&lt;") + "</b> ruft an (" +
      (s.video ? "mit Video" : "Ton") + ")...",
      '<button class="haupt" onclick="anrufAnnehmen()">Annehmen</button> ' +
      '<button onclick="anrufAblehnen()">Ablehnen</button>');
  } else if (s.typ === "annahme") {
    if (anrufPc) await anrufPc.setRemoteDescription(s.answer);
  } else if (s.typ === "eis") {
    if (anrufPc) { try { await anrufPc.addIceCandidate(s.eis); } catch (e) {} }
    else if (anrufEingehend && anrufEingehend.von === roh.von) anrufEingehend.eis.push(s.eis);
  } else if (s.typ === "besetzt") {
    anrufBeenden("Besetzt: dort laeuft schon ein Anruf.");
  } else if (s.typ === "abgelehnt") {
    anrufBeenden("Anruf abgelehnt.");
  } else if (s.typ === "aufgelegt") {
    anrufBeenden("Aufgelegt.");
  }
}

function anrufPanel(text, tasten) {
  let p = document.getElementById("anrufpanel");
  if (!p) {
    p = document.createElement("div");
    p.id = "anrufpanel";
    document.body.appendChild(p);
  }
  p.innerHTML = '<div class="anruf-text">' + text + "</div>" +
    '<div id="anruf-medien"></div><div class="anruf-tasten">' + (tasten || "") + "</div>";
}

function anrufPanelZu() {
  const p = document.getElementById("anrufpanel");
  if (p) p.remove();
}

async function anrufPcBauen(zielId, mitVideo) {
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
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected")
      anrufBeenden("Verbindung verloren.");
  };
  anrufPc = pc;
  anrufStream = stream;
  return { ok: true };
}

async function anrufStarten(partnerId, name, mitVideo) {
  if (anrufPc) { alert("Es laeuft schon ein Anruf."); return; }
  const key = await kryptoDm(partnerId);
  if (!key) { alert("Anruf nicht moeglich: dein Freund braucht einmal die neue Version."); return; }
  const b = await anrufPcBauen(partnerId, mitVideo);
  if (b.fehler) { alert(b.fehler); return; }
  anrufPartner = { id: partnerId, name: name, video: mitVideo };
  anrufPanel("Rufe <b>" + String(name).replace(/</g, "&lt;") + "</b> an...",
    '<button onclick="anrufAuflegen()">Auflegen</button>');
  const offer = await anrufPc.createOffer();
  await anrufPc.setLocalDescription(offer);
  const ok = await anrufSenden(partnerId, { typ: "klingeln", offer: offer, video: mitVideo });
  if (!ok) anrufBeenden("Klingeln nicht zustellbar.");
}

async function anrufAnnehmen() {
  const ein = anrufEingehend;
  if (!ein) return;
  const b = await anrufPcBauen(ein.von, ein.video);
  if (b.fehler) { alert(b.fehler); anrufAblehnen(); return; }
  anrufEingehend = null;
  anrufPartner = { id: ein.von, name: ein.name, video: ein.video };
  anrufPanel("Im Gespraech mit <b>" + ein.name.replace(/</g, "&lt;") + "</b>",
    '<button onclick="anrufAuflegen()">Auflegen</button>');
  await anrufPc.setRemoteDescription(ein.offer);
  for (const eis of ein.eis) { try { await anrufPc.addIceCandidate(eis); } catch (e) {} }
  const answer = await anrufPc.createAnswer();
  await anrufPc.setLocalDescription(answer);
  await anrufSenden(ein.von, { typ: "annahme", answer: answer });
}

function anrufAblehnen() {
  if (anrufEingehend) anrufSenden(anrufEingehend.von, { typ: "abgelehnt" });
  anrufEingehend = null;
  anrufPanelZu();
}

function anrufAuflegen() {
  if (anrufPartner) anrufSenden(anrufPartner.id, { typ: "aufgelegt" });
  anrufBeenden(null);
}

function anrufBeenden(meldungText) {
  if (anrufPc) { try { anrufPc.close(); } catch (e) {} }
  if (anrufStream) anrufStream.getTracks().forEach(t => t.stop());
  anrufPc = null; anrufStream = null; anrufPartner = null; anrufEingehend = null;
  anrufPanelZu();
  if (meldungText) {
    anrufPanel(meldungText, '<button onclick="anrufPanelZu()">schliessen</button>');
    setTimeout(anrufPanelZu, 4000);
  }
}

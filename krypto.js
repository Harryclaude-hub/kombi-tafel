// ============================================================
// KRYPTO: die Ende-zu-Ende-Schicht der Kombi-Tafel.
// Alles mit dem eingebauten WebCrypto des Browsers, KEINE fremde
// Bibliothek. Die Datenbank sieht nur verschlüsselte Pakete.
//
// Bausteine:
//  - PBKDF2: aus dem Login-Passwort wird ein Schutz-Schlüssel
//    (der Server sieht das Passwort beim Ableiten nie).
//  - ECDH P-256: jeder Nutzer hat ein Schlüsselpaar. Der
//    OEFFENTLICHE Teil steht für alle lesbar in kt_profiles,
//    der PRIVATE liegt nur auf dem Gerät (localStorage) und als
//    passwort-verschluesselter Safe in kt_schluessel.
//  - AES-GCM: verschlüsselt die eigentlichen Inhalte.
//
// Format eines verschluesselten Textes:
//   "e2e1:" + base64(iv) + ":" + base64(geheimtext)
// Alles OHNE dieses Vorzeichen ist Altbestand im Klartext und
// bleibt lesbar - nichts Bestehendes geht kaputt.
//
// HARTE REGELN (Lehren aus dem Review vom 26.08.):
//  1. Geräte-Schlüssel sind IMMER an die User-ID gebunden
//     (kt_e2e_priv_<uid>). Ein zweites Konto im selben Browser
//     darf NIE die Schlüssel des ersten adoptieren.
//  2. Ein lokaler Schlüssel wird nur übernommen, wenn sein
//     abgeleiteter Public-Teil zum pubkey des Kontos passt.
//  3. Beim Ueberschreiben lokaler Schlüssel (Passwort-Reset auf
//     einem anderen Gerät) werden die alten ARCHIVIERT und beim
//     Entschluesseln als Rettung mitprobiert - alte Daten bleiben
//     auf diesem Gerät lesbar.
// ============================================================
"use strict";

const KRYPTO_ITER = 250000;
const E2E_ZEICHEN = "e2e1:";

// ---------- Kleinkram: Base64 <-> Bytes ----------

function kryB64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function kryB64zu(s) {
  const roh = atob(s);
  const b = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
  return b;
}

// ---------- Passwort -> Schutz-Schlüssel ----------

async function kryptoPassSchluessel(passwort, salzText) {
  const enc = new TextEncoder();
  const basis = await crypto.subtle.importKey("raw", enc.encode(passwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("kombi-tafel:" + salzText), iterations: KRYPTO_ITER, hash: "SHA-256" },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ---------- AES-GCM ----------

async function kryAes(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text));
  return { iv: kryB64(iv), ct: kryB64(ct) };
}

async function kryAesAuf(key, ivB64, ctB64) {
  try {
    const klar = await crypto.subtle.decrypt({ name: "AES-GCM", iv: kryB64zu(ivB64) }, key, kryB64zu(ctB64));
    return new TextDecoder().decode(klar);
  } catch (e) { return null; }
}

// ---------- Schluesselpaare (ECDH P-256) ----------

async function kryptoNeuesPaar() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
}

async function kryPubExport(pub) { return kryB64(await crypto.subtle.exportKey("raw", pub)); }
async function kryPrivExport(priv) { return kryB64(await crypto.subtle.exportKey("pkcs8", priv)); }

async function kryPubImport(b64) {
  return crypto.subtle.importKey("raw", kryB64zu(b64), { name: "ECDH", namedCurve: "P-256" }, true, []);
}

async function kryPrivImport(b64) {
  return crypto.subtle.importKey("pkcs8", kryB64zu(b64), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
}

// Public-Teil aus einem privaten Schlüssel ableiten (über jwk)
async function kryPubAusPriv(privB64) {
  try {
    const priv = await kryPrivImport(privB64);
    const jwk = await crypto.subtle.exportKey("jwk", priv);
    delete jwk.d; jwk.key_ops = [];
    const pub = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
    return await kryPubExport(pub);
  } catch (e) { return null; }
}

// Regel 2: gehört dieser lokale private Schlüssel zu diesem Konto?
async function kryPasstZuKonto(privB64, pubB64) {
  if (!privB64 || !pubB64) return false;
  return (await kryPubAusPriv(privB64)) === pubB64;
}

// Gemeinsamer AES-Schlüssel zweier Schluesselpaare (mein privat + sein public)
async function kryPaarSchluessel(privKey, pubB64) {
  const pub = await kryPubImport(pubB64);
  return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, privKey,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Bereichsschlüssel: einfacher AES-Schlüssel als rohe Bytes
async function kryBereichNeu() {
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  return kryB64(await crypto.subtle.exportKey("raw", k));
}

async function kryBereichImport(rawB64) {
  return crypto.subtle.importKey("raw", kryB64zu(rawB64), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ---------- Geräte-Speicher, an die User-ID gebunden (Regel 1) ----------

function kryLokalPriv(uid) { return localStorage.getItem("kt_e2e_priv_" + uid); }
function kryLokalBereich(uid) { return localStorage.getItem("kt_e2e_bereich_" + uid); }

function kryLokalSetzen(uid, privB64, bereichB64) {
  localStorage.setItem("kt_e2e_priv_" + uid, privB64);
  localStorage.setItem("kt_e2e_bereich_" + uid, bereichB64);
}

// Regel 3: alte Schlüssel nie verwerfen, sondern archivieren
function kryArchivLesen(uid) {
  try { return JSON.parse(localStorage.getItem("kt_e2e_alt_" + uid) || "[]"); } catch (e) { return []; }
}

function kryArchivieren(uid, privB64, bereichB64) {
  const liste = kryArchivLesen(uid);
  if (liste.some(x => x.bereich === bereichB64 && x.priv === privB64)) return;
  liste.push({ priv: privB64, bereich: bereichB64, seit: new Date().toISOString() });
  localStorage.setItem("kt_e2e_alt_" + uid, JSON.stringify(liste));
}

// ---------- Sitzungs-Zustand ----------

let _kryPriv = null;                 // CryptoKey, importiert
let _kryPrivUid = null;
const _kryBereiche = {};             // bereichId -> CryptoKey
const _kryDm = {};                   // partnerId -> CryptoKey
let _kryAltKeys = null;              // [CryptoKey] der archivierten Bereichsschlüssel

function kryptoCacheLeeren() {
  _kryPriv = null; _kryPrivUid = null; _kryAltKeys = null;
  for (const k of Object.keys(_kryBereiche)) delete _kryBereiche[k];
  for (const k of Object.keys(_kryDm)) delete _kryDm[k];
}

async function kryptoMeinPriv() {
  const u = await supaNutzer();
  if (!u) return null;
  if (_kryPriv && _kryPrivUid === u.id) return _kryPriv;
  const b = kryLokalPriv(u.id);
  if (!b) return null;
  try { _kryPriv = await kryPrivImport(b); _kryPrivUid = u.id; } catch (e) { return null; }
  return _kryPriv;
}

// ---------- Einrichtung nach Anmeldung/Registrierung ----------

async function kryptoEinrichten(passwort) {
  const u = await supaNutzer();
  if (!u) return { ok: false };
  kryptoCacheLeeren();
  const kpass = await kryptoPassSchluessel(passwort, u.id);
  const safeR = await supa.from("kt_schluessel").select("*").eq("id", u.id).maybeSingle();
  const safe = safeR.data || null;
  const profR = await supa.from("kt_profiles").select("pubkey").eq("id", u.id).maybeSingle();
  const kontoPub = (profR.data && profR.data.pubkey) || null;
  let hinweis = null;
  let privB64 = null, bereichB64 = null;

  // Uebergang von der ersten Fassung: unbenamste Geräte-Schlüssel nur
  // übernehmen, wenn sie nachweislich zu DIESEM Konto gehören (Regel 2)
  const altPriv = localStorage.getItem("kt_e2e_priv");
  if (altPriv && kontoPub && !kryLokalPriv(u.id) && await kryPasstZuKonto(altPriv, kontoPub)) {
    kryLokalSetzen(u.id, altPriv, localStorage.getItem("kt_e2e_bereich") || "");
    localStorage.removeItem("kt_e2e_priv");
    localStorage.removeItem("kt_e2e_bereich");
  }

  if (safe && safe.keysafe) {
    privB64 = await kryAesAuf(kpass, safe.keysafe.iv, safe.keysafe.ct);
    if (privB64 === null) {
      // Safe passt nicht zum Passwort (Reset). Lokale Kopie nur, wenn sie
      // wirklich zu diesem Konto gehört (Regel 2).
      const lok = kryLokalPriv(u.id);
      if (lok && await kryPasstZuKonto(lok, kontoPub)) privB64 = lok;
      else hinweis = "Neues Schlüsselpaar angelegt (Passwort wurde zurückgesetzt): alte verschlüsselte Nachrichten sind auf diesem Gerät nicht mehr lesbar.";
    }
    if (safe.bereichsafe) {
      bereichB64 = await kryAesAuf(kpass, safe.bereichsafe.iv, safe.bereichsafe.ct);
      // Bereichsschlüssel-Rettung hängt an der (verifizierten) priv-Rettung
      if (bereichB64 === null && privB64 === kryLokalPriv(u.id)) bereichB64 = kryLokalBereich(u.id);
    }
  } else {
    // Kein Safe: nur eine verifizierte lokale Kopie zählt - NIEMALS
    // fremde Geräte-Schlüssel adoptieren (Regel 1 und 2).
    const lok = kryLokalPriv(u.id);
    if (lok && await kryPasstZuKonto(lok, kontoPub)) {
      privB64 = lok;
      bereichB64 = kryLokalBereich(u.id);
    }
  }

  if (!privB64) {
    const paar = await kryptoNeuesPaar();
    privB64 = await kryPrivExport(paar.privateKey);
    await supa.from("kt_profiles").update({ pubkey: await kryPubExport(paar.publicKey) }).eq("id", u.id);
  } else if (!kontoPub) {
    const pub = await kryPubAusPriv(privB64);
    if (pub) await supa.from("kt_profiles").update({ pubkey: pub }).eq("id", u.id);
  }
  if (!bereichB64) bereichB64 = await kryBereichNeu();

  // Regel 3: weichen die neuen Schlüssel von den lokalen ab, die alten
  // archivieren - alte Daten bleiben auf diesem Gerät lesbar.
  const vorherPriv = kryLokalPriv(u.id), vorherBereich = kryLokalBereich(u.id);
  if (vorherBereich && vorherBereich !== bereichB64) {
    kryArchivieren(u.id, vorherPriv || "", vorherBereich);
    if (!hinweis) hinweis = "Das Passwort wurde auf einem anderen Gerät zurückgesetzt. " +
      "Die alten Schlüssel dieses Geräts wurden gesichert - alte Daten bleiben HIER lesbar.";
  }

  kryLokalSetzen(u.id, privB64, bereichB64);

  await supa.from("kt_schluessel").upsert({
    id: u.id,
    keysafe: await kryAes(kpass, privB64),
    bereichsafe: await kryAes(kpass, bereichB64),
    updated_at: new Date().toISOString()
  });
  // ... und in den Server-Safe, damit jedes weitere Gerät sie automatisch bekommt
  if (typeof kryptoEscrowSichern === "function") {
    const s = await kryptoEscrowSichern(privB64, bereichB64);
    if (s && s.ok) localStorage.setItem("kt_escrow_" + u.id, "1");
  }
  return { ok: true, hinweis: hinweis };
}

// ---------- Schlüssel für Bereiche und Freunde ----------

async function kryptoBereich(bereichId) {
  if (_kryBereiche[bereichId]) return _kryBereiche[bereichId];
  const u = await supaNutzer();
  if (!u) return null;
  let key = null;
  if (bereichId === u.id) {
    const raw = kryLokalBereich(u.id);
    if (raw) key = await kryBereichImport(raw);
  } else {
    // Gast: Freigabe trägt den Bereichsschlüssel, verschlüsselt für mich
    const f = await supa.from("kt_freigaben").select("schluessel")
      .eq("owner", bereichId).eq("gast", u.id).maybeSingle();
    const priv = await kryptoMeinPriv();
    if (f.data && f.data.schluessel && priv) {
      const p = await supa.from("kt_profiles").select("pubkey").eq("id", bereichId).maybeSingle();
      if (p.data && p.data.pubkey) {
        const paar = await kryPaarSchluessel(priv, p.data.pubkey);
        const raw = await kryAesAuf(paar, f.data.schluessel.iv, f.data.schluessel.ct);
        if (raw) key = await kryBereichImport(raw);
      }
    }
  }
  if (key) _kryBereiche[bereichId] = key;
  return key;
}

async function kryptoDm(partnerId) {
  if (_kryDm[partnerId]) return _kryDm[partnerId];
  const priv = await kryptoMeinPriv();
  if (!priv) return null;
  const p = await supa.from("kt_profiles").select("pubkey").eq("id", partnerId).maybeSingle();
  if (!p.data || !p.data.pubkey) return null;
  const key = await kryPaarSchluessel(priv, p.data.pubkey);
  _kryDm[partnerId] = key;
  return key;
}

// Archivierte Bereichsschlüssel dieses Geräts (Rettung nach Reset)
async function kryptoAltSchluessel() {
  if (_kryAltKeys) return _kryAltKeys;
  const u = await supaNutzer();
  if (!u) return [];
  const liste = [];
  for (const alt of kryArchivLesen(u.id)) {
    if (alt.bereich) { try { liste.push(await kryBereichImport(alt.bereich)); } catch (e) {} }
  }
  _kryAltKeys = liste;
  return liste;
}

// ---------- Texte packen und auspacken ----------

async function e2eZu(key, text) {
  if (!key || text === null || text === undefined || text === "") return text;
  const p = await kryAes(key, String(text));
  return E2E_ZEICHEN + p.iv + ":" + p.ct;
}

async function e2eAuf(key, s) {
  if (s === null || s === undefined || typeof s !== "string") return s;
  if (!s.startsWith(E2E_ZEICHEN)) return s;         // Altbestand im Klartext
  const teile = s.slice(E2E_ZEICHEN.length).split(":");
  if (key) {
    const klar = await kryAesAuf(key, teile[0], teile[1]);
    if (klar !== null) return klar;
  }
  // Rettung: archivierte Schlüssel dieses Geräts probieren (Regel 3)
  for (const alt of await kryptoAltSchluessel()) {
    const klar = await kryAesAuf(alt, teile[0], teile[1]);
    if (klar !== null) return klar;
  }
  return key ? "[verschlüsselt - Schlüssel passt nicht]" : "[verschlüsselt - Schlüssel fehlt]";
}

// ---------- Schluessel auf diesem Geraet nachtragen ----------
// Faelle: neues Geraet, geleerter Browser-Speicher, App neu installiert.
// Der Safe liegt auf dem Server - er braucht nur das Passwort. Stimmt das
// Passwort nicht, wird NICHTS ueberschrieben (sonst waeren alte Daten weg).

async function kryptoNachtragen(passwort) {
  const u = await supaNutzer();
  if (!u) return { fehler: "Nicht angemeldet." };
  const safeR = await supa.from("kt_schluessel").select("*").eq("id", u.id).maybeSingle();
  const safe = safeR.data || null;
  if (!safe || !safe.keysafe) {
    // Noch gar kein Safe: normal einrichten
    const e = await kryptoEinrichten(passwort);
    return e.ok ? { ok: true, neu: true } : { fehler: "Einrichten fehlgeschlagen." };
  }
  const kpass = await kryptoPassSchluessel(passwort, u.id);
  const priv = await kryAesAuf(kpass, safe.keysafe.iv, safe.keysafe.ct);
  if (priv === null) return { fehler: "Das Passwort stimmt nicht - es wurde nichts geändert." };
  let bereich = safe.bereichsafe
    ? await kryAesAuf(kpass, safe.bereichsafe.iv, safe.bereichsafe.ct) : null;
  if (!bereich) bereich = await kryBereichNeu();
  kryLokalSetzen(u.id, priv, bereich);
  kryptoCacheLeeren();
  return { ok: true };
}

// Hat dieses Geraet die Schluessel des angemeldeten Kontos?
async function kryptoGeraetBereit() {
  const u = await supaNutzer();
  if (!u) return true;
  return !!kryLokalPriv(u.id) && !!kryLokalBereich(u.id);
}

// ---------- Schlüssel-Automatik über den Server-Safe ----------
// Jedes angemeldete Gerät holt sich seine Schlüssel selbst. Niemand muss
// mehr ein Passwort eintippen. Der Safe liegt verschlüsselt in der
// Datenbank; das Geheimnis dazu kennt nur die Server-Funktion.

// Die Adresse erst beim Aufruf zusammenbauen: krypto.js wird VOR supa.js
// geladen, dort steht SUPA_URL - beim Laden waere sie noch unbekannt.
function schluesselUrl() {
  const basis = (typeof SUPA_URL === "string" && SUPA_URL)
    ? SUPA_URL : "https://mqmevpyatjsambervgtu.supabase.co";
  return basis + "/functions/v1/schluessel";
}

async function kryptoServerRuf(koerper) {
  const s = await supaSitzung();
  if (!s) return null;
  try {
    const r = await fetch(schluesselUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.access_token,
        "apikey": (typeof SUPA_KEY === "string" ? SUPA_KEY : "")
      },
      body: JSON.stringify(koerper)
    });
    return await r.json();
  } catch (e) { return null; }
}

async function kryptoEscrowSichern(privB64, bereichB64) {
  return await kryptoServerRuf({ was: "sichern", priv: privB64, bereich: bereichB64 });
}

async function kryptoEscrowHolen() {
  const a = await kryptoServerRuf({ was: "holen" });
  return (a && a.ok && a.priv && a.bereich) ? { priv: a.priv, bereich: a.bereich } : null;
}

// Hat der Nutzer verschlüsselte Daten im EIGENEN Bereich? (Dann dürfen
// keine neuen Schlüssel erzeugt werden, sonst wären sie unlesbar.)
async function kryptoHatDaten(uid) {
  const tabellen = [["kt_ordner", "bereich"], ["kt_scheine", "bereich"],
                    ["kt_nachrichten", "bereich"], ["kt_buchungen", "bereich"],
                    ["kt_person_zahlungen", "bereich"], ["kt_anmerkungen", "bereich"]];
  for (const [t, spalte] of tabellen) {
    const r = await supa.from(t).select("id", { count: "exact", head: true }).eq(spalte, uid);
    if ((r.count || 0) > 0) return true;
  }
  return false;
}

// Frische Schlüssel anlegen (nur wenn es nichts zu verlieren gibt)
async function kryptoFrischErzeugen() {
  const u = await supaNutzer();
  if (!u) return false;
  const paar = await kryptoNeuesPaar();
  const priv = await kryPrivExport(paar.privateKey);
  const bereich = await kryBereichNeu();
  await supa.from("kt_profiles").update({ pubkey: await kryPubExport(paar.publicKey) }).eq("id", u.id);
  kryLokalSetzen(u.id, priv, bereich);
  kryptoCacheLeeren();
  await kryptoEscrowSichern(priv, bereich);
  return true;
}

// DER Einstiegspunkt: sorgt dafür, dass dieses Gerät arbeiten kann.
// Ergebnis: { ok:true } | { ok:true, neu:true } | { ok:false, passwort:true }
async function kryptoSicherstellen() {
  const u = await supaNutzer();
  if (!u) return { ok: false };
  if (kryLokalPriv(u.id) && kryLokalBereich(u.id)) {
    // Vorhanden - beim ersten Mal auch in den Server-Safe legen
    if (!localStorage.getItem("kt_escrow_" + u.id)) {
      const r = await kryptoEscrowSichern(kryLokalPriv(u.id), kryLokalBereich(u.id));
      if (r && r.ok) localStorage.setItem("kt_escrow_" + u.id, "1");
    }
    return { ok: true };
  }
  const e = await kryptoEscrowHolen();
  if (e) {
    kryLokalSetzen(u.id, e.priv, e.bereich);
    kryptoCacheLeeren();
    localStorage.setItem("kt_escrow_" + u.id, "1");
    return { ok: true };
  }
  // Kein Server-Safe: nur wenn nichts zu verlieren ist, frisch anlegen
  if (!(await kryptoHatDaten(u.id))) {
    await kryptoFrischErzeugen();
    localStorage.setItem("kt_escrow_" + u.id, "1");
    return { ok: true, neu: true };
  }
  return { ok: false, passwort: true };
}

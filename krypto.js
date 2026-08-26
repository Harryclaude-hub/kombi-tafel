// ============================================================
// KRYPTO: die Ende-zu-Ende-Schicht der Kombi-Tafel.
// Alles mit dem eingebauten WebCrypto des Browsers, KEINE fremde
// Bibliothek. Die Datenbank sieht nur verschluesselte Pakete.
//
// Bausteine:
//  - PBKDF2: aus dem Login-Passwort wird ein Schutz-Schluessel
//    (der Server sieht das Passwort beim Ableiten nie).
//  - ECDH P-256: jeder Nutzer hat ein Schluesselpaar. Der
//    OEFFENTLICHE Teil steht fuer alle lesbar in kt_profiles,
//    der PRIVATE liegt nur auf dem Geraet (localStorage) und als
//    passwort-verschluesselter Safe in kt_schluessel.
//  - AES-GCM: verschluesselt die eigentlichen Inhalte.
//
// Format eines verschluesselten Textes:
//   "e2e1:" + base64(iv) + ":" + base64(geheimtext)
// Alles OHNE dieses Vorzeichen ist Altbestand im Klartext und
// bleibt lesbar - nichts Bestehendes geht kaputt.
//
// WICHTIG (steht auch in Mein Bereich): setzt jemand sein Passwort
// per E-Mail zurueck AUF EINEM NEUEN GERAET, ist der alte private
// Schluessel weg - alte Nachrichten bleiben dann unlesbar.
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

// ---------- Passwort -> Schutz-Schluessel ----------

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

// Gemeinsamer AES-Schluessel zweier Schluesselpaare (mein privat + sein public)
async function kryPaarSchluessel(privKey, pubB64) {
  const pub = await kryPubImport(pubB64);
  return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, privKey,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Bereichsschluessel: einfacher AES-Schluessel als rohe Bytes
async function kryBereichNeu() {
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  return kryB64(await crypto.subtle.exportKey("raw", k));
}

async function kryBereichImport(rawB64) {
  return crypto.subtle.importKey("raw", kryB64zu(rawB64), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ---------- Sitzungs-Zustand auf diesem Geraet ----------

let _kryPriv = null;                 // CryptoKey, importiert
const _kryBereiche = {};             // bereichId -> CryptoKey
const _kryDm = {};                   // partnerId -> CryptoKey

async function kryptoMeinPriv() {
  if (_kryPriv) return _kryPriv;
  const b = localStorage.getItem("kt_e2e_priv");
  if (!b) return null;
  try { _kryPriv = await kryPrivImport(b); } catch (e) { return null; }
  return _kryPriv;
}

// ---------- Einrichtung nach Anmeldung/Registrierung ----------
// Holt oder erzeugt Schluesselpaar + Bereichsschluessel und legt beide
// passwort-verschluesselt in den Safe (kt_schluessel). Gibt einen Hinweis
// zurueck, wenn ein alter Safe nicht mehr lesbar war (Passwort-Reset).

async function kryptoEinrichten(passwort) {
  const u = await supaNutzer();
  if (!u) return { ok: false };
  const kpass = await kryptoPassSchluessel(passwort, u.id);
  const safeR = await supa.from("kt_schluessel").select("*").eq("id", u.id).maybeSingle();
  const safe = safeR.data || null;
  let hinweis = null;
  let privB64 = null, bereichB64 = null;

  if (safe && safe.keysafe) {
    privB64 = await kryAesAuf(kpass, safe.keysafe.iv, safe.keysafe.ct);
    if (privB64 === null) {
      // Safe passt nicht zum Passwort (Reset auf neuem Geraet). Lokale Kopie?
      privB64 = localStorage.getItem("kt_e2e_priv");
      if (!privB64) hinweis = "Neues Schluesselpaar angelegt (Passwort wurde zurueckgesetzt): alte verschluesselte Nachrichten bleiben auf diesem Geraet unlesbar.";
    }
    if (safe.bereichsafe) {
      bereichB64 = await kryAesAuf(kpass, safe.bereichsafe.iv, safe.bereichsafe.ct);
      if (bereichB64 === null) bereichB64 = localStorage.getItem("kt_e2e_bereich");
    }
  } else {
    privB64 = localStorage.getItem("kt_e2e_priv");
    bereichB64 = localStorage.getItem("kt_e2e_bereich");
  }

  if (!privB64) {
    const paar = await kryptoNeuesPaar();
    privB64 = await kryPrivExport(paar.privateKey);
    await supa.from("kt_profiles").update({ pubkey: await kryPubExport(paar.publicKey) }).eq("id", u.id);
  } else {
    // pubkey sicherstellen (z. B. erster Login nach dem Update)
    const p = await supa.from("kt_profiles").select("pubkey").eq("id", u.id).maybeSingle();
    if (p.data && !p.data.pubkey) {
      const priv = await kryPrivImport(privB64);
      // aus pkcs8 laesst sich der Public-Teil nicht direkt ziehen - deshalb
      // exportieren wir ihn ueber jwk
      const jwk = await crypto.subtle.exportKey("jwk", priv);
      delete jwk.d; jwk.key_ops = [];
      const pub = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
      await supa.from("kt_profiles").update({ pubkey: await kryPubExport(pub) }).eq("id", u.id);
    }
  }
  if (!bereichB64) bereichB64 = await kryBereichNeu();

  localStorage.setItem("kt_e2e_priv", privB64);
  localStorage.setItem("kt_e2e_bereich", bereichB64);
  _kryPriv = null; delete _kryBereiche[u.id];

  await supa.from("kt_schluessel").upsert({
    id: u.id,
    keysafe: await kryAes(kpass, privB64),
    bereichsafe: await kryAes(kpass, bereichB64),
    updated_at: new Date().toISOString()
  });
  return { ok: true, hinweis: hinweis };
}

// ---------- Schluessel fuer Bereiche und Freunde ----------

async function kryptoBereich(bereichId) {
  if (_kryBereiche[bereichId]) return _kryBereiche[bereichId];
  const u = await supaNutzer();
  if (!u) return null;
  let key = null;
  if (bereichId === u.id) {
    const raw = localStorage.getItem("kt_e2e_bereich");
    if (raw) key = await kryBereichImport(raw);
  } else {
    // Gast: Freigabe traegt den Bereichsschluessel, verschluesselt fuer mich
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

// ---------- Texte packen und auspacken ----------

async function e2eZu(key, text) {
  if (!key || text === null || text === undefined || text === "") return text;
  const p = await kryAes(key, String(text));
  return E2E_ZEICHEN + p.iv + ":" + p.ct;
}

async function e2eAuf(key, s) {
  if (s === null || s === undefined || typeof s !== "string") return s;
  if (!s.startsWith(E2E_ZEICHEN)) return s;         // Altbestand im Klartext
  if (!key) return "[verschluesselt - Schluessel fehlt]";
  const teile = s.slice(E2E_ZEICHEN.length).split(":");
  const klar = await kryAesAuf(key, teile[0], teile[1]);
  return (klar === null) ? "[verschluesselt - Schluessel passt nicht]" : klar;
}

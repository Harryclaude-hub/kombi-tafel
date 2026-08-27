// ============================================================
// SUPA: Verbindung zur Datenbank (Supabase-Projekt der Kombi-Tafel).
// Der Schlüssel hier ist der oeffentliche anon-Schlüssel; was
// jeder darf, regeln die RLS-Regeln in der Datenbank, nicht dieser
// Schlüssel. (Karams Regel: RLS schuetzt, nicht die Sichtbarkeit.)
// ============================================================
"use strict";

const SUPA_URL = "https://mqmevpyatjsambervgtu.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xbWV2cHlhdGpzYW1iZXJ2Z3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjA4NjUsImV4cCI6MjEwMTc5Njg2NX0.znjHbWgs6eSeWYBs7q6FtxIU6Q2k1jDejcANzVzU0Uw";

window.supa = (typeof supabase !== "undefined")
  ? supabase.createClient(SUPA_URL, SUPA_KEY)
  : null;

async function supaSitzung() {
  if (!window.supa) return null;
  const { data } = await supa.auth.getSession();
  return data.session || null;
}

async function supaNutzer() {
  const s = await supaSitzung();
  return s ? s.user : null;
}

// ---------- Konto ----------

async function supaRegistrieren(username, email, passwort) {
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username))
    return { fehler: "Benutzername: 3 bis 24 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich, Unterstrich." };
  const frei = await supa.from("kt_profiles").select("id").ilike("username", username).maybeSingle();
  if (frei.data) return { fehler: "Der Benutzername ist schon vergeben." };
  const r = await supa.auth.signUp({ email: email, password: passwort });
  if (r.error) return { fehler: uebersetzeFehler(r.error.message) };
  // Bestaetigung ist serverseitig abgeschaltet: direkt anmelden
  const a = await supa.auth.signInWithPassword({ email: email, password: passwort });
  if (a.error) return { fehler: uebersetzeFehler(a.error.message) };
  const p = await supa.from("kt_profiles").insert({ id: a.data.user.id, username: username });
  if (p.error) return { fehler: "Konto angelegt, aber der Benutzername liess sich nicht speichern: " + p.error.message };
  // Ende-zu-Ende: Schlüsselpaar + Bereichsschlüssel anlegen
  if (typeof kryptoEinrichten === "function") await kryptoEinrichten(passwort);
  return { ok: true };
}

async function supaAnmelden(userOderMail, passwort) {
  let email = userOderMail.trim();
  if (!email.includes("@")) {
    const r = await supa.rpc("kt_email_fuer_username", { u: email });
    if (r.error || !r.data) return { fehler: "Benutzername unbekannt." };
    email = r.data;
  }
  const a = await supa.auth.signInWithPassword({ email: email, password: passwort });
  if (a.error) return { fehler: uebersetzeFehler(a.error.message) };
  let hinweis = null;
  if (typeof kryptoEinrichten === "function") {
    const k = await kryptoEinrichten(passwort);
    hinweis = k.hinweis || null;
  }
  return { ok: true, hinweis: hinweis };
}

async function supaAbmelden() { await supa.auth.signOut(); }

async function supaPasswortVergessen(email) {
  const r = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  return r.error ? { fehler: uebersetzeFehler(r.error.message) } : { ok: true };
}

async function supaPasswortNeu(passwort) {
  const r = await supa.auth.updateUser({ password: passwort });
  if (r.error) return { fehler: uebersetzeFehler(r.error.message) };
  if (typeof kryptoEinrichten === "function") await kryptoEinrichten(passwort);
  return { ok: true };
}

function uebersetzeFehler(m) {
  if (!m) return "Unbekannter Fehler.";
  if (m.includes("Invalid login credentials")) return "Passwort falsch oder Konto unbekannt.";
  if (m.includes("at least 6 characters")) return "Das Passwort braucht mindestens 6 Zeichen.";
  if (m.includes("already registered")) return "Diese E-Mail hat schon ein Konto.";
  if (m.includes("rate limit") || m.includes("Too many")) return "Zu viele Versuche, kurz warten.";
  if (m.includes("valid email")) return "Das ist keine gültige E-Mail-Adresse.";
  return m;
}

// ---------- Profil und Freigaben ----------

async function supaMeinProfil() {
  const u = await supaNutzer();
  if (!u) return null;
  const r = await supa.from("kt_profiles").select("id, username, rolle").eq("id", u.id).maybeSingle();
  return r.data || null;
}

async function supaProfilSuchen(username) {
  const r = await supa.from("kt_profiles").select("id, username").ilike("username", username).maybeSingle();
  return r.data || null;
}

async function supaFreigabenVonMir() {
  const u = await supaNutzer();
  const r = await supa.from("kt_freigaben")
    .select("gast, rolle, kt_profiles!kt_freigaben_gast_fkey(username)")
    .eq("owner", u.id);
  return r.data || [];
}

async function supaBereicheFuerMich() {
  const u = await supaNutzer();
  const r = await supa.from("kt_freigaben")
    .select("owner, rolle, kt_profiles!kt_freigaben_owner_fkey(username)")
    .eq("gast", u.id);
  return r.data || [];
}

async function supaTeilen(gastId, rolle) {
  const u = await supaNutzer();
  // Ende-zu-Ende: der Gast bekommt den Bereichsschlüssel, verschlüsselt
  // für SEIN Schlüsselpaar. Hat er noch keins (nie mit der neuen Version
  // angemeldet), wird ohne Schlüssel geteilt - dann einfach später noch
  // einmal Teilen drücken.
  let schluessel = null;
  if (typeof kryptoMeinPriv === "function") {
    const gp = await supa.from("kt_profiles").select("pubkey").eq("id", gastId).maybeSingle();
    const priv = await kryptoMeinPriv();
    const raw = localStorage.getItem("kt_e2e_bereich_" + u.id);
    if (gp.data && gp.data.pubkey && priv && raw) {
      const paar = await kryPaarSchluessel(priv, gp.data.pubkey);
      schluessel = await kryAes(paar, raw);
    }
  }
  const r = await supa.from("kt_freigaben").upsert({ owner: u.id, gast: gastId, rolle: rolle, schluessel: schluessel });
  r.ohneSchluessel = !schluessel;
  return r;
}

async function supaTeilenBeenden(gastId) {
  const u = await supaNutzer();
  return await supa.from("kt_freigaben").delete().eq("owner", u.id).eq("gast", gastId);
}

// ---------- Scheine ----------

async function supaScheineLaden(bereichId) {
  const r = await supa.from("kt_scheine").select("*")
    .eq("bereich", bereichId).order("created_at", { ascending: false });
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const s of liste) {
    if (s.daten && s.daten.e2e) {
      const klar = await e2eAuf(key, s.daten.e2e);
      try { s.daten = JSON.parse(klar); }
      catch (e) { s.daten = { kz: "?", anbieter: "?", wetten: [], einsatz: 0, quote: 0, moeglich: 0, gesperrt: true }; }
    }
    if (s.foto) {
      s.foto = await e2eAuf(key, s.foto);
      if (s.foto && !s.foto.startsWith("data:")) s.foto = null;
    }
    if (s.notiz) s.notiz = await e2eAuf(key, s.notiz);
  }
  return liste;
}

async function supaScheinAnlegen(bereichId, daten, foto, fotoName, ordnerId) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  return await supa.from("kt_scheine").insert({
    bereich: bereichId, angelegt_von: u.id,
    daten: key ? { e2e: await e2eZu(key, JSON.stringify(daten)) } : daten,
    foto: foto ? await e2eZu(key, foto) : null,
    foto_name: fotoName || null,
    stand: daten.stand || "offen",
    notiz: await e2eZu(key, daten.notiz || "") || "",
    ordner: ordnerId || null
  });
}

async function supaScheinAendern(id, felder) {
  // select() macht die 0-Zeilen-Falle sichtbar (RLS-Lektion, siehe unten)
  return await supa.from("kt_scheine").update(felder).eq("id", id).select("id");
}

async function supaScheinLoeschen(id) {
  return await supa.from("kt_scheine").delete().eq("id", id);
}

// ---------- Chat ----------

async function supaNachrichtenLaden(bereichId, abId) {
  let q = supa.from("kt_nachrichten")
    .select("id, autor, text, created_at, kt_profiles!kt_nachrichten_autor_fkey(username)")
    .eq("bereich", bereichId).order("id", { ascending: true }).limit(200);
  if (abId) q = q.gt("id", abId);
  const r = await q;
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const n of liste) n.text = await e2eAuf(key, n.text);
  return liste;
}

async function supaNachrichtSenden(bereichId, text) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  const r = await supa.from("kt_nachrichten").insert({ bereich: bereichId, autor: u.id, text: await e2eZu(key, text) });
  if (!r.error && typeof pushSenden === "function") {
    if (bereichId !== u.id) pushSenden(bereichId, "chat");
    else supaFreigabenVonMir().then(g => (g || []).forEach(x => pushSenden(x.gast, "chat"))).catch(() => {});
  }
  return r;
}


// ---------- Freunde (unabhaengig vom Bereich-Teilen) ----------

async function supaKontaktAdden(username) {
  const p = await supaProfilSuchen(username);
  if (!p) return { fehler: "Benutzer nicht gefunden." };
  const u = await supaNutzer();
  if (p.id === u.id) return { fehler: "Dich selbst musst du nicht adden." };
  const r = await supa.from("kt_kontakte").insert({ a: u.id, b: p.id });
  if (r.error && !String(r.error.message).includes("duplicate"))
    return { fehler: r.error.message };
  return { ok: true, profil: p };
}

async function supaKontakteLaden() {
  const u = await supaNutzer();
  if (!u) return [];
  const r = await supa.from("kt_kontakte").select("a, b").or("a.eq." + u.id + ",b.eq." + u.id);
  const ids = [...new Set((r.data || []).map(k => k.a === u.id ? k.b : k.a))];
  if (!ids.length) return [];
  const p = await supa.from("kt_profiles").select("id, username").in("id", ids);
  return (p.data || []).map(x => ({ partnerId: x.id, username: x.username }));
}

async function supaKontaktEntfernen(partnerId) {
  const u = await supaNutzer();
  await supa.from("kt_kontakte").delete().eq("a", u.id).eq("b", partnerId);
  await supa.from("kt_kontakte").delete().eq("a", partnerId).eq("b", u.id);
}

async function supaDmLaden(partnerId, abId) {
  const u = await supaNutzer();
  let q = supa.from("kt_direkt").select("id, von, an, text, created_at")
    .or("and(von.eq." + u.id + ",an.eq." + partnerId + "),and(von.eq." + partnerId + ",an.eq." + u.id + ")")
    .order("id", { ascending: true }).limit(200);
  if (abId) q = q.gt("id", abId);
  const r = await q;
  const liste = r.data || [];
  const key = await kryptoDm(partnerId);
  for (const n of liste) n.text = await e2eAuf(key, n.text);
  return liste;
}

async function supaDmSenden(partnerId, text) {
  const u = await supaNutzer();
  const key = await kryptoDm(partnerId);
  if (!key) return { error: { message: "Dein Freund hat noch keinen Schlüssel - er muss sich einmal mit der neuen Version anmelden." } };
  const r = await supa.from("kt_direkt").insert({ von: u.id, an: partnerId, text: await e2eZu(key, text) });
  if (!r.error && typeof pushSenden === "function") pushSenden(partnerId, "dm");
  return r;
}


// ---------- Buchhaltung ----------

async function supaBuchungenLaden(bereichId) {
  const r = await supa.from("kt_buchungen").select("*")
    .eq("bereich", bereichId).order("datum", { ascending: true });
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const b of liste) { if (b.notiz) b.notiz = await e2eAuf(key, b.notiz); if (b.person) b.person = await e2eAuf(key, b.person); if (b.konto) b.konto = await e2eAuf(key, b.konto); }
  return liste;
}

async function supaBuchen(bereichId, datum, konto, person, art, betrag, notiz) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  return await supa.from("kt_buchungen").insert({
    bereich: bereichId, autor: u.id, datum: datum,
    konto: await e2eZu(key, konto), person: await e2eZu(key, person),
    art: art, betrag: betrag, notiz: await e2eZu(key, notiz || "") || ""
  });
}

async function supaBuchungLoeschen(id) {
  return await supa.from("kt_buchungen").delete().eq("id", id);
}

async function supaBalancenLaden(bereichId) {
  const r = await supa.from("kt_balancen").select("*")
    .eq("bereich", bereichId).order("datum", { ascending: true });
  return r.data || [];
}

async function supaBalanceSetzen(bereichId, datum, betrag) {
  const u = await supaNutzer();
  return await supa.from("kt_balancen").upsert({
    bereich: bereichId, datum: datum, betrag: betrag, autor: u.id
  });
}

async function supaBalanceLoeschen(bereichId, datum) {
  return await supa.from("kt_balancen").delete()
    .eq("bereich", bereichId).eq("datum", datum);
}

// ---------- Foto-Satz-Uploads ----------

async function supaSatzUploadsLaden() {
  // Nur Admins sehen die Uploads (RLS); sie sehen ALLE, egal welcher Admin hochlud
  const r = await supa.from("kt_satz_uploads")
    .select("id, satz_datum, status, created_at")
    .order("satz_datum", { ascending: false });
  return r.data || [];
}

async function supaSatzFotoHochladen(bereichId, satzDatum, fotoDataUrl, hash) {
  const u = await supaNutzer();
  return await supa.from("kt_satz_uploads").insert({
    bereich: bereichId, autor: u.id, satz_datum: satzDatum, foto: fotoDataUrl, hash: hash || null
  });
}

// Gibt es dieses Foto (gleicher Fingerabdruck) zu diesem Datum schon?
async function supaUploadHashDa(satzDatum, hash) {
  const r = await supa.from("kt_satz_uploads").select("id", { count: "exact", head: true })
    .eq("satz_datum", satzDatum).eq("hash", hash);
  return (r.count || 0) > 0;
}

async function supaSatzUploadLoeschen(id) {
  return await supa.from("kt_satz_uploads").delete().eq("id", id).select("id");
}

// ---------- Konto-Ordner (Unterordner für die Kombinationen) ----------
// Karams Regel: jeder Ordner ist ein Account/eine Person, bei der gesetzt
// wurde. Die Buchhaltung bleibt EINE - die Ordner sortieren nur die Scheine.

async function supaOrdnerLaden(bereichId) {
  const r = await supa.from("kt_ordner").select("id, name")
    .eq("bereich", bereichId).order("created_at", { ascending: true });
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const o of liste) o.name = await e2eAuf(key, o.name);
  liste.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  return liste;
}

// Ohne Schlüssel wird NICHTS gespeichert - sonst laege der Klartext
// unbemerkt in der Datenbank (Review-Fund vom 26.08.).
const OHNE_SCHLUESSEL = "Auf diesem Gerät fehlt der Verschlüsselungs-Schlüssel. " +
  "Im eigenen Bereich hilft der rote Kasten oben (einmal Passwort eingeben); " +
  "in einem geteilten Bereich muss der Besitzer noch einmal teilen.";

async function supaOrdnerAnlegen(bereichId, name) {
  const sauber = (name || "").trim();
  if (!sauber) return { fehler: "Bitte einen Namen eintragen." };
  if (sauber.length > 60) return { fehler: "Hoechstens 60 Zeichen." };
  // Namen sind verschlüsselt - Doppelte prüft deshalb der Client
  const alle = await supaOrdnerLaden(bereichId);
  if (alle.some(o => String(o.name).toLowerCase() === sauber.toLowerCase()))
    return { fehler: "Diese Person gibt es schon." };
  const key = await kryptoBereich(bereichId);
  if (!key) return { fehler: OHNE_SCHLUESSEL };
  const r = await supa.from("kt_ordner").insert({ bereich: bereichId, name: await e2eZu(key, sauber) })
    .select("id, name").single();
  if (r.error) {
    if (String(r.error.message).includes("duplicate")) return { fehler: "Diese Person gibt es schon." };
    return { fehler: r.error.message };
  }
  r.data.name = sauber;
  return { ok: true, ordner: r.data };
}

async function supaOrdnerUmbenennen(id, name) {
  const sauber = (name || "").trim();
  if (!sauber) return { fehler: "Bitte einen Namen eintragen." };
  // RLS-Lektion: verbotenes UPDATE gibt keinen Fehler, nur 0 Zeilen - deshalb select()
  const alt = await supa.from("kt_ordner").select("bereich").eq("id", id).maybeSingle();
  const key = alt.data ? await kryptoBereich(alt.data.bereich) : null;
  if (!key) return { fehler: OHNE_SCHLUESSEL };
  const r = await supa.from("kt_ordner").update({ name: await e2eZu(key, sauber) }).eq("id", id).select("id").maybeSingle();
  if (r.error) {
    if (String(r.error.message).includes("duplicate")) return { fehler: "Diese Person gibt es schon." };
    return { fehler: r.error.message };
  }
  if (!r.data) return { fehler: "Nicht erlaubt oder Person weg." };
  return { ok: true };
}

async function supaOrdnerLoeschen(id) {
  return await supa.from("kt_ordner").delete().eq("id", id);
}

// ---------- Personen-Kasse (Zahlungswege je Konto-Ordner) ----------

async function supaPersonBuchungenLaden(bereichId) {
  const r = await supa.from("kt_person_zahlungen").select("*")
    .eq("bereich", bereichId).order("datum", { ascending: true }).order("id", { ascending: true });
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const b of liste) if (b.notiz) b.notiz = await e2eAuf(key, b.notiz);
  return liste;
}

async function supaPersonBuchen(bereichId, ordnerId, datum, weg, art, anbieter, betrag, notiz) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  return await supa.from("kt_person_zahlungen").insert({
    bereich: bereichId, ordner: ordnerId, autor: u.id, datum: datum,
    weg: weg, art: art, anbieter: art === "erhalten" ? null : anbieter,
    betrag: betrag, notiz: await e2eZu(key, notiz || "") || ""
  });
}

async function supaPersonBuchungLoeschen(id) {
  // select() macht die 0-Zeilen-Falle sichtbar (RLS-Lektion)
  return await supa.from("kt_person_zahlungen").delete().eq("id", id).select("id");
}

// ---------- Admin ----------
// Karams Rolle steht in kt_profiles.rolle; hochgestuft wird nur direkt in
// der Datenbank, nie über die Oberflaeche.

async function supaIstAdmin() {
  const p = await supaMeinProfil();
  return !!(p && p.rolle === "admin");
}

async function supaAdminUserliste() {
  return await supa.rpc("kt_admin_userliste");
}

async function supaAdminUserLoeschen(zielId) {
  return await supa.rpc("kt_admin_user_loeschen", { ziel: zielId });
}

// ---------- Anmerkungen (Freunde-Notizzettel an Scheinen) ----------
// Aendern NICHTS am Schein. Auch nur-lesen-Freunde duerfen anmerken;
// ausblenden darf nur der Bereichs-Besitzer. Texte sind Ende-zu-Ende.

async function supaAnmerkungenLaden(bereichId) {
  const r = await supa.from("kt_anmerkungen")
    .select("id, schein, autor, text, versteckt, created_at, kt_profiles!kt_anmerkungen_autor_fkey(username)")
    .eq("bereich", bereichId).order("id", { ascending: true });
  const liste = r.data || [];
  const key = await kryptoBereich(bereichId);
  for (const a of liste) a.text = await e2eAuf(key, a.text);
  return liste;
}

async function supaAnmerken(bereichId, scheinId, text) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: "Kein Bereichs-Schlüssel - der Besitzer muss dir einmal neu teilen." } };
  return await supa.from("kt_anmerkungen").insert({
    bereich: bereichId, schein: scheinId, autor: u.id, text: await e2eZu(key, text)
  });
}

async function supaAnmerkungVerstecken(id, ja) {
  return await supa.from("kt_anmerkungen").update({ versteckt: !!ja }).eq("id", id).select("id");
}

async function supaAnmerkungLoeschen(id) {
  return await supa.from("kt_anmerkungen").delete().eq("id", id).select("id");
}

// ---------- Admin: Rolle setzen (promoten) ----------

async function supaAdminRolle(zielId, neu) {
  return await supa.rpc("kt_admin_rolle_setzen", { ziel: zielId, neu: neu });
}

// ---------- Dynamische Foto-Saetze (das Programm liest selbst ein) ----------
// Homebase: fuer alle lesbar, schreiben nur Admins (prueft die Datenbank).

async function supaSaetzeLaden() {
  const r = await supa.from("kt_saetze").select("id, titel").order("id", { ascending: false });
  return r.data || [];
}

async function supaWettenLaden() {
  const r = await supa.from("kt_wetten").select("*")
    .order("satz", { ascending: false }).order("pos", { ascending: true });
  return r.data || [];
}

async function supaSatzAnlegen(id, titel) {
  const u = await supaNutzer();
  const r = await supa.from("kt_saetze").upsert({ id: id, titel: titel, erstellt_von: u ? u.id : null });
  return r;
}

async function supaWetteAnlegen(satz, w) {
  return await supa.from("kt_wetten").insert({
    satz: satz, pos: w.pos || 0, von: w.von || "", an_zeit: w.an_zeit,
    liga: w.liga || "", spiel: w.spiel, wette: w.wette,
    kat: w.kat || w.s || "", s: w.s || "SIEG", o: w.o || []
  }).select("id").single();
}

async function supaWetteAendern(id, felder) {
  return await supa.from("kt_wetten").update(felder).eq("id", id).select("id");
}

async function supaWetteLoeschen(id) {
  return await supa.from("kt_wetten").delete().eq("id", id).select("id");
}

async function supaSatzLoeschen(id) {
  return await supa.from("kt_saetze").delete().eq("id", id).select("id");
}

async function supaSatzUploadsVoll(datum) {
  const r = await supa.from("kt_satz_uploads").select("id, foto, status")
    .eq("satz_datum", datum).order("created_at", { ascending: true });
  return r.data || [];
}

async function supaUploadStatus(id, status) {
  return await supa.from("kt_satz_uploads").update({ status: status }).eq("id", id).select("id");
}

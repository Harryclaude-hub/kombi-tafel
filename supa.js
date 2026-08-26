// ============================================================
// SUPA: Verbindung zur Datenbank (Supabase-Projekt der Kombi-Tafel).
// Der Schluessel hier ist der oeffentliche anon-Schluessel; was
// jeder darf, regeln die RLS-Regeln in der Datenbank, nicht dieser
// Schluessel. (Karams Regel: RLS schuetzt, nicht die Sichtbarkeit.)
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
  return { ok: true };
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
  return r.error ? { fehler: uebersetzeFehler(r.error.message) } : { ok: true };
}

function uebersetzeFehler(m) {
  if (!m) return "Unbekannter Fehler.";
  if (m.includes("Invalid login credentials")) return "Passwort falsch oder Konto unbekannt.";
  if (m.includes("at least 6 characters")) return "Das Passwort braucht mindestens 6 Zeichen.";
  if (m.includes("already registered")) return "Diese E-Mail hat schon ein Konto.";
  if (m.includes("rate limit") || m.includes("Too many")) return "Zu viele Versuche, kurz warten.";
  if (m.includes("valid email")) return "Das ist keine gueltige E-Mail-Adresse.";
  return m;
}

// ---------- Profil und Freigaben ----------

async function supaMeinProfil() {
  const u = await supaNutzer();
  if (!u) return null;
  const r = await supa.from("kt_profiles").select("id, username").eq("id", u.id).maybeSingle();
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
  return await supa.from("kt_freigaben").upsert({ owner: u.id, gast: gastId, rolle: rolle });
}

async function supaTeilenBeenden(gastId) {
  const u = await supaNutzer();
  return await supa.from("kt_freigaben").delete().eq("owner", u.id).eq("gast", gastId);
}

// ---------- Scheine ----------

async function supaScheineLaden(bereichId) {
  const r = await supa.from("kt_scheine").select("*")
    .eq("bereich", bereichId).order("created_at", { ascending: false });
  return r.data || [];
}

async function supaScheinAnlegen(bereichId, daten, foto, fotoName) {
  const u = await supaNutzer();
  return await supa.from("kt_scheine").insert({
    bereich: bereichId, angelegt_von: u.id, daten: daten,
    foto: foto || null, foto_name: fotoName || null,
    stand: daten.stand || "offen", notiz: daten.notiz || ""
  });
}

async function supaScheinAendern(id, felder) {
  return await supa.from("kt_scheine").update(felder).eq("id", id);
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
  return r.data || [];
}

async function supaNachrichtSenden(bereichId, text) {
  const u = await supaNutzer();
  return await supa.from("kt_nachrichten").insert({ bereich: bereichId, autor: u.id, text: text });
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
  return r.data || [];
}

async function supaDmSenden(partnerId, text) {
  const u = await supaNutzer();
  return await supa.from("kt_direkt").insert({ von: u.id, an: partnerId, text: text });
}


// ---------- Buchhaltung ----------

async function supaBuchungenLaden(bereichId) {
  const r = await supa.from("kt_buchungen").select("*")
    .eq("bereich", bereichId).order("datum", { ascending: true });
  return r.data || [];
}

async function supaBuchen(bereichId, datum, konto, person, art, betrag, notiz) {
  const u = await supaNutzer();
  return await supa.from("kt_buchungen").insert({
    bereich: bereichId, autor: u.id, datum: datum, konto: konto,
    person: person, art: art, betrag: betrag, notiz: notiz || ""
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

async function supaSatzUploadsLaden(bereichId) {
  const r = await supa.from("kt_satz_uploads")
    .select("id, satz_datum, status, created_at")
    .eq("bereich", bereichId).order("satz_datum", { ascending: false });
  return r.data || [];
}

async function supaSatzFotoHochladen(bereichId, satzDatum, fotoDataUrl) {
  const u = await supaNutzer();
  return await supa.from("kt_satz_uploads").insert({
    bereich: bereichId, autor: u.id, satz_datum: satzDatum, foto: fotoDataUrl
  });
}

async function supaSatzUploadLoeschen(id) {
  return await supa.from("kt_satz_uploads").delete().eq("id", id);
}

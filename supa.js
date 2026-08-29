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
  if (!passwort || String(passwort).length < 6)
    return { fehler: "Das Passwort braucht mindestens 6 Zeichen." };
  // Die E-Mail ist FREIWILLIG. Wer keine angibt, bekommt eine erfundene -
  // dann geht alles ausser "Passwort vergessen". Darauf wird im Formular
  // deutlich hingewiesen.
  const echteMail = String(email || "").trim();
  if (echteMail && !/^[^@s]+@[^@s]+.[^@s]+$/.test(echteMail))
    return { fehler: "Diese E-Mail sieht nicht richtig aus. Entweder eine gültige eintragen oder das Feld ganz leer lassen." };
  const ohneMail = !echteMail;
  email = echteMail || (username.toLowerCase().replace(/[^a-z0-9]/g, "") + "." +
    Math.random().toString(36).slice(2, 8) + "@ohne-mail.kombi-tafel.at");
  const frei = await supa.from("kt_profiles").select("id").ilike("username", username).maybeSingle();
  if (frei.data) return { fehler: "Der Benutzername ist schon vergeben." };
  // Kennzeichen mitgeben: diese Anmeldung kommt aus der Kombi-Tafel.
  // Daran erkennen die Datenbank-Ausloeser, dass der Nutzer NICHT zum
  // Immo-Check gehoert (beide Programme teilen sich die Konten-Tabelle).
  const r = await supa.auth.signUp({ email: email, password: passwort,
    options: { data: { app: "kombi-tafel" } } });
  if (r.error) return { fehler: uebersetzeFehler(r.error.message) };
  // Bestaetigung ist serverseitig abgeschaltet: direkt anmelden
  const a = await supa.auth.signInWithPassword({ email: email, password: passwort });
  if (a.error) return { fehler: uebersetzeFehler(a.error.message) };
  const p = await supa.from("kt_profiles").insert({ id: a.data.user.id, username: username });
  if (p.error) return { fehler: "Konto angelegt, aber der Benutzername liess sich nicht speichern: " + p.error.message };
  // Ende-zu-Ende: Schlüsselpaar + Bereichsschlüssel anlegen
  if (typeof kryptoEinrichten === "function") await kryptoEinrichten(passwort);
  return { ok: true, ohneMail: ohneMail };
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
  const gesucht = String(username == null ? "" : username).trim();
  if (!gesucht) return null;
  // Die Joker entschaerfen: in einem LIKE-Muster steht _ fuer ein
  // beliebiges Zeichen und % fuer beliebig viele. Beide sind in
  // Benutzernamen erlaubt, also muessen sie hier woertlich gemeint sein.
  const muster = gesucht.replace(/([\\%_])/g, "\\$1");
  const r = await supa.from("kt_profiles").select("id, username").ilike("username", muster).maybeSingle();
  const p = r.data || null;
  // ZWEITE SICHERUNG, und die ist die wichtige: egal wie der Server das
  // Muster auslegt - was zurueckkommt, muss WOERTLICH der gesuchte Name
  // sein (Gross- und Kleinschreibung darf abweichen). Hier haengt dran,
  // an wen ein ganzer Bereich samt Schluessel geht.
  if (!p || String(p.username).toLowerCase() !== gesucht.toLowerCase()) return null;
  return p;
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
  // Das Feld "schluessel" NUR mitschreiben, wenn wirklich einer berechnet
  // wurde. Frueher ging es auch als null hinaus und hat einen laengst
  // verteilten, gueltigen Schluessel des Gastes ueberschrieben - danach
  // sah der Gast ueberall nur noch "Schluessel fehlt".
  const satz = { owner: u.id, gast: gastId, rolle: rolle };
  if (schluessel) satz.schluessel = schluessel;
  const r = await supa.from("kt_freigaben").upsert(satz);
  r.ohneSchluessel = !schluessel;
  return r;
}

async function supaTeilenBeenden(gastId) {
  const u = await supaNutzer();
  return await supa.from("kt_freigaben").delete().eq("owner", u.id).eq("gast", gastId);
}

// Haengt einen Fehler-Merker an eine Liste, ohne dass er beim Zaehlen
// oder Durchlaufen mitkommt. So bleibt jeder bestehende Aufrufer heil.
//
// WOZU: alle Lader gaben im Fehlerfall stumm eine leere Liste zurueck.
// Nichts war geloescht, aber die Ansicht sah aus wie beim Verlust der
// 49 Zeilen - "noch keine Scheine", "0,00 Euro im Spiel". Und laedt die
// Ordnerliste leer, haelt das Anlegen jeden Namen fuer neu und legt die
// Person ein zweites Mal an.
function mitFehler(liste, r) {
  Object.defineProperty(liste, "_fehler",
    { value: (r && r.error) ? String(r.error.message || r.error) : null, enumerable: false });
  return liste;
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
    // Der Fotoname traegt praktisch den ganzen Schein (Anbieter, Einsatz,
    // alle Quoten). Frueher stand er offen in der Datenbank.
    if (s.foto_name) s.foto_name = await e2eAuf(key, s.foto_name);
  }
  return mitFehler(liste, r);
}

// nummer ist Karams feste Scheinnummer. Die Spalte gab es schon, wurde
// aber nie gefuellt - deshalb stand im Chat-Anhang immer "K-?".
async function supaScheinAnlegen(bereichId, daten, foto, fotoName, ordnerId, nummer) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  return await supa.from("kt_scheine").insert({
    bereich: bereichId, angelegt_von: u.id,
    daten: key ? { e2e: await e2eZu(key, JSON.stringify(daten)) } : daten,
    foto: foto ? await e2eZu(key, foto) : null,
    foto_name: fotoName ? await e2eZu(key, fotoName) : null,
    nummer: (typeof nummer === "number" && isFinite(nummer)) ? nummer : null,
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
  // select() macht die 0-Zeilen-Falle sichtbar (dieselbe Lektion wie bei
  // supaScheinAendern): ohne select kommt weder ein Fehler noch eine
  // Zeilenzahl zurueck, und ein an den Rechten gescheitertes Loeschen
  // saehe genauso aus wie ein erfolgreiches.
  return await supa.from("kt_scheine").delete().eq("id", id).select("id");
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
    // Frueher bekam in einem FREMDEN Bereich nur der Besitzer eine Meldung -
    // die uebrigen Gaeste erfuhren nie etwas. Jetzt verteilt der Server an
    // alle im Bereich (Besitzer und Gaeste), den Absender ausgenommen.
    pushSenden(bereichId, "chat", { bereich: bereichId }).then(async erg => {
      if (erg && erg.ok && erg.verteilt) {
        if (erg.geraete === 0 && typeof weckerBalken === "function")
          weckerBalken("Niemand in diesem Bereich hat Benachrichtigungen eingeschaltet - deine " +
            "Nachricht steht da, aber es klopft bei niemandem an.", "warn", "chat-" + bereichId, 30);
        return;
      }
      // Aeltere Server-Fassung kann noch nicht verteilen: dann wie bisher.
      // (Im fremden Bereich hat die erste Sendung den Besitzer schon erreicht.)
      if (bereichId === u.id) {
        const gaeste = await supaFreigabenVonMir().catch(() => []);
        for (const x of (gaeste || [])) await pushSenden(x.gast, "chat");
      }
    }).catch(() => {});
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
  let q = supa.from("kt_direkt").select("id, von, an, text, created_at, zugestellt, gelesen")
    .or("and(von.eq." + u.id + ",an.eq." + partnerId + "),and(von.eq." + partnerId + ",an.eq." + u.id + ")")
    .order("id", { ascending: true }).limit(200);
  if (abId) q = q.gt("id", abId);
  const r = await q;
  const liste = r.data || [];
  const key = await kryptoDm(partnerId);
  for (const n of liste) n.text = await e2eAuf(key, n.text);
  return liste;
}

// Holt nur die Haken meiner eigenen letzten Nachrichten an diesen Freund.
// Absichtlich ohne Text: das ist eine kleine, haeufige Abfrage.
async function supaDmHaken(partnerId, wieviel) {
  const u = await supaNutzer();
  if (!u) return [];
  const r = await supa.from("kt_direkt").select("id, zugestellt, gelesen")
    .eq("von", u.id).eq("an", partnerId)
    .order("id", { ascending: false }).limit(wieviel || 40);
  return r.data || [];
}

// Ich habe die Nachrichten dieses Freundes auf meinem Geraet - zweiter Punkt
// wird zum dritten. Laeuft still: klappt es nicht, bleibt es beim zweiten.
async function supaDmZugestellt(partnerId) {
  try {
    const u = await supaNutzer();
    if (!u) return;
    await supa.from("kt_direkt").update({ zugestellt: new Date().toISOString() })
      .eq("an", u.id).eq("von", partnerId).is("zugestellt", null);
  } catch (e) { }
}

// Ich habe das Gespraech offen - die Punkte werden gruen.
async function supaDmGelesen(partnerId) {
  try {
    const u = await supaNutzer();
    if (!u) return;
    const jetzt = new Date().toISOString();
    await supa.from("kt_direkt").update({ zugestellt: jetzt, gelesen: jetzt })
      .eq("an", u.id).eq("von", partnerId).is("gelesen", null);
  } catch (e) { }
}

async function supaDmSenden(partnerId, text, name) {
  const u = await supaNutzer();
  const key = await kryptoDm(partnerId);
  if (!key) return { error: { message: "Dein Freund hat noch keinen Schlüssel - er muss sich einmal mit der neuen Version anmelden." } };
  const r = await supa.from("kt_direkt").insert({ von: u.id, an: partnerId, text: await e2eZu(key, text) });
  // Ehrlich statt Feuer und vergessen: hat der Freund kein Geraet
  // angemeldet oder fehlt die Verbindung, erfaehrt der Absender es sofort.
  if (!r.error && typeof pushMelden === "function") pushMelden(partnerId, "dm", name || null);
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
  return mitFehler(liste, r);
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
  return mitFehler(liste, r);
}

async function supaPersonBuchen(bereichId, ordnerId, datum, weg, art, anbieter, betrag, notiz) {
  const u = await supaNutzer();
  const key = await kryptoBereich(bereichId);
  if (!key) return { error: { message: OHNE_SCHLUESSEL } };
  // Welche Felder zu welcher Art gehoeren, prueft auch die Datenbank.
  // Hier steht dasselbe noch einmal, damit ein Tippfehler nicht erst
  // dort auffaellt: "stand_weg" hat keinen Anbieter, "stand_anbieter"
  // keinen Zahlungsweg.
  const nurWeg = (art === "erhalten" || art === "ausgezahlt" || art === "stand_weg");
  return await supa.from("kt_person_zahlungen").insert({
    bereich: bereichId, ordner: ordnerId, autor: u.id, datum: datum,
    weg: art === "stand_anbieter" ? null : weg,
    art: art, anbieter: nurWeg ? null : anbieter,
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
  return mitFehler(liste, r);
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

// ---------- Personendaten (kt_person_daten) ----------
// Je Person EIN Datensatz: ein JSON mit allen Angaben, als Ganzes
// Ende-zu-Ende verschluesselt. Die Datenbank sieht nur Datenmuell.

// Gibt die Karte zurueck und haengt zwei Merker daran:
//   _fehler   das Laden selbst ging schief
//   _unlesbar wie viele Zeilen da waren, sich aber nicht oeffnen liessen
// Beide muessen das Speichern sperren: sonst schreibt ein leeres Formular
// ueber Daten, die es in Wirklichkeit noch gibt.
async function supaPersonDatenLaden(bereichId) {
  const r = await supa.from("kt_person_daten").select("ordner, daten")
    .eq("bereich", bereichId);
  const key = await kryptoBereich(bereichId);
  const karte = {};
  let unlesbar = 0;
  for (const z of r.data || []) {
    const klar = await e2eAuf(key, z.daten);
    try { karte[z.ordner] = JSON.parse(klar); }
    catch (e) { unlesbar++; }
  }
  Object.defineProperty(karte, "_fehler", { value: r.error ? String(r.error.message) : null, enumerable: false });
  Object.defineProperty(karte, "_unlesbar", { value: unlesbar, enumerable: false });
  return karte;
}

async function supaPersonDatenSpeichern(bereichId, ordnerId, objekt) {
  const key = await kryptoBereich(bereichId);
  if (!key) return { fehler: OHNE_SCHLUESSEL };
  const r = await supa.from("kt_person_daten").upsert({
    bereich: bereichId, ordner: ordnerId,
    daten: await e2eZu(key, JSON.stringify(objekt)),
    updated_at: new Date().toISOString()
  }, { onConflict: "ordner" }).select("id");
  if (r.error) return { fehler: r.error.message };
  if (!r.data || !r.data.length) return { fehler: "Nicht gespeichert (keine Berechtigung?)." };
  return { ok: true };
}

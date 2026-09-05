// ============================================================
// ergebnis-scan Version 3: Karams Server-Waechter (02.09.2026,
// Pins 05.09.2026). Laeuft alle 10 Minuten per pg_cron auf Supabase -
// unabhaengig davon, ob irgendwo ein Geraet die Kombi-Tafel offen hat.
//
// Was er tut:
//  1. offene Scheine mit "beine" lesen (satz + spiel/linie/anstoss -
//     Einsaetze, Quoten, Personen bleiben Ende-zu-Ende verschluesselt)
//  2. fuer vorbei gelaufene Spiele ohne Ergebnis den Endstand bei
//     TheSportsDB suchen - NUR eindeutige Treffer, nie ueberschreiben
//     (dieselben eisernen Regeln wie ergebnisseSelbstSuchen im Browser)
//  3. Kombinationen entscheiden: EIN verlorenes Bein = verloren
//     (geht ohne Quote/Einsatz); alle Beine gut = gewonnen. Betraege
//     rechnet der Client beim naechsten Oeffnen nach (verschluesselt).
//  4. Web-Push an die Geraete des Bereichs-Besitzers UND an alle,
//     die den Bereich FIXIERT haben (kt_bereich_pins) und noch eine
//     Freigabe darauf halten (Karam, 05.09.2026).
//
// PROBE-BETRIEB: POST { probe: { scheine: [{kennung, beine}],
// ergebnisse: [...] } } rechnet nur und schreibt NICHTS - derselbe
// Entscheidungsweg (scheinEntscheiden) wie im Echtlauf, kein zweiter.
//
// auswertung.mjs ist eine beim Deploy erzeugte 1:1-Kopie von
// auswertung.js im Repo. WER auswertung.js AENDERT, MUSS DIESE
// FUNKTION NEU DEPLOYEN (Verweis steht auch dort und in UEBERGABE.md).
// ergTeamPasst ist wortgleich aus ergebnisse.js uebernommen - auch
// dort steht der Rueckverweis. Drift waere ein Geldfehler.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { kombiAuswerten, awSeiten } from "./auswertung.mjs";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const KOPF = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: KOPF });

// WORTGLEICHE Kopie aus ergebnisse.js (ergTeamPasst) - wer dort
// aendert, aendert hier mit. "Celtic B U21" trifft nie "Celtic".
// (Der Kombinationszeichen-Bereich steht hier als \u0300-\u036f -
// dieselbe Zeichenmenge, nur sicher gegen Editor-Normalisierung.)
function ergTeamPasst(karam: unknown, api: unknown): boolean {
  const putz = (t: unknown) => String(t || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const kw = putz(karam).split(" "), aw = putz(api).split(" ");
  const marker: Record<string, number> = { u16: 1, u17: 1, u18: 1, u19: 1, u20: 1, u21: 1, u23: 1, ii: 1, b: 1,
    women: 1, w: 1, frauen: 1, fem: 1, feminino: 1, femenino: 1, reserve: 1, reserves: 1, youth: 1 };
  const markerVon = (worte: string[]) => worte.filter(x => marker[x]).sort().join(",");
  if (markerVon(kw) !== markerVon(aw)) return false;
  const fueller: Record<string, number> = { fc: 1, cf: 1, fk: 1, sk: 1, sc: 1, ac: 1, afc: 1, cd: 1, club: 1, de: 1 };
  const kern = (worte: string[]) => worte.filter(x => !fueller[x] && !marker[x] && x.length >= 3);
  const kk = kern(kw), ak = kern(aw);
  if (!kk.length || !ak.length) return false;
  const enthaelt = (worte: string[], teile: string[]) => teile.every(t => worte.some(w => w.indexOf(t) === 0));
  return enthaelt(aw, kk) || enthaelt(kw, ak);
}

// Anstoss "2026-09-02T18:00" ist die UK-Zeit vom Foto. Fuer die Fragen
// "ist das Spiel vorbei?" (+3 h Puffer wie scheinEnde) und das
// 30-Stunden-Datumsfenster reicht die Lesart als UTC.
function anZeit(an: unknown): Date | null {
  if (typeof an !== "string" || !an.trim() || an.endsWith("?")) return null;
  const d = new Date(an.length === 16 ? an + ":00Z" : an);
  return isNaN(d.getTime()) ? null : d;
}

type Bein = { spiel: string; linie: string; an?: string };
type Beine = { satz?: string; wetten: Bein[] };
type ErgZeile = Record<string, unknown>;

// DER Entscheidungsweg - Echtlauf UND Probe nutzen genau diesen.
// Verloren geht ohne Zahlen (ein Bein reisst alles); gewonnen ueber
// die Bein-Ausgaenge (alle entschieden, keiner verloren/unklar).
const FERTIG_GUT = ["gewonnen", "halbgewonnen", "push", "abgesagt", "halbverloren"];
function scheinEntscheiden(beine: Beine, ergKarte: Map<string, ErgZeile>) {
  const satz = beine.satz || "";
  const wetten = (beine.wetten || []).map(w => ({ spiel: w.spiel, linie: w.linie }));
  const a = kombiAuswerten(wetten, 0, (w: { spiel: string }) => {
    const row = ergKarte.get(satz + "|" + w.spiel);
    if (!row) return null;
    return { heim: row.heim, gast: row.gast, htHeim: row.ht_heim, htGast: row.ht_gast,
      karten: row.karten, ecken: row.ecken, sonder: row.sonder || {}, stand: row.stand };
  });
  let neu: string | null = null;
  if (a.stand === "verloren") neu = "verloren";
  else if (a.beine.length && a.beine.every((b: { ausgang: string }) => FERTIG_GUT.includes(b.ausgang))) neu = "gewonnen";
  return { neu: neu, maschine: a };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  try {
    const koerper = await req.json().catch(() => ({} as Record<string, unknown>));

    // ---- Probe-Betrieb: nur rechnen, nichts schreiben, nichts schicken ----
    if (koerper && (koerper as { probe?: unknown }).probe) {
      const p = (koerper as { probe: { scheine?: { kennung?: string; beine: Beine }[]; ergebnisse?: ErgZeile[] } }).probe;
      const ergKarte = new Map<string, ErgZeile>();
      for (const row of (p.ergebnisse || [])) ergKarte.set(String(row.satz || "") + "|" + String(row.spiel || ""), row);
      const raus = (p.scheine || []).map(s => {
        const e = scheinEntscheiden(s.beine, ergKarte);
        return { kennung: s.kennung || "", neu: e.neu, stand: e.maschine.stand,
          beine: e.maschine.beine.map((b: { spiel: string; ausgang: string }) => b.spiel + ": " + b.ausgang) };
      });
      return json({ probe: raus });
    }

    const admin = createClient(URL_, SERVICE);
    const jetzt = Date.now();

    // Drossel: hoechstens alle 4 Minuten wirklich laufen - egal wer ruft.
    const marke = await admin.from("kt_geheim").select("wert").eq("name", "ergebnis_scan_zuletzt").maybeSingle();
    if (marke.data && jetzt - Date.parse(marke.data.wert) < 4 * 60000)
      return json({ uebersprungen: true, zuletzt: marke.data.wert });
    await admin.from("kt_geheim").upsert({ name: "ergebnis_scan_zuletzt", wert: new Date(jetzt).toISOString() });

    // 1. Offene Scheine mit Beinen
    const sr = await admin.from("kt_scheine").select("id, bereich, nummer, stand, beine")
      .eq("stand", "offen").not("beine", "is", null).limit(500);
    if (sr.error) return json({ fehler: sr.error.message }, 500);
    const scheine = (sr.data || []).filter(s => s.beine && Array.isArray(s.beine.wetten) && s.beine.wetten.length);
    const z = { scheine: scheine.length, spiele: 0, gesucht: 0, gefunden: 0, unsicher: 0,
      laeuft: 0, ohneZeit: 0, fehlerSuche: 0, gewonnen: 0, verloren: 0 };
    if (!scheine.length) return json(z);

    // 2. Spiele einsammeln
    const spiele = new Map<string, { satz: string; spiel: string; an: string }>();
    for (const s of scheine) for (const w of s.beine.wetten) {
      if (!w || !w.spiel) continue;
      const k = (s.beine.satz || "") + "|" + w.spiel;
      if (!spiele.has(k)) spiele.set(k, { satz: s.beine.satz || "", spiel: w.spiel, an: w.an || "" });
      else if (!spiele.get(k)!.an) spiele.get(k)!.an = w.an || "";
    }
    z.spiele = spiele.size;
    const saetze = [...new Set([...spiele.values()].map(x => x.satz).filter(Boolean))];
    const er = await admin.from("kt_ergebnisse").select("*").in("satz", saetze.length ? saetze : ["-"]);
    const ergKarte = new Map<string, ErgZeile>();
    for (const row of (er.data || [])) ergKarte.set(row.satz + "|" + row.spiel, row);

    // 3. Selbstsuche: fertige Spiele ohne Ergebnis. Eiserne Regeln wie im
    //    Browser: eindeutiger Treffer (Datum +/-30 h, beide Teamnamen in
    //    DERSELBEN Reihenfolge), nur Endstand, keine Absagen, NIE ein
    //    vorhandenes Ergebnis anfassen.
    for (const [k, sp] of spiele) {
      if (ergKarte.has(k)) continue;
      const a = anZeit(sp.an);
      if (!a) { z.ohneZeit++; continue; }
      if (jetzt < a.getTime() + 3 * 3600000) { z.laeuft++; continue; }
      const seiten = awSeiten(sp.spiel);
      if (!seiten) { z.unsicher++; continue; }
      z.gesucht++;
      let antwort: { event?: unknown } | null = null;
      try {
        const r = await fetch("https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=" +
          encodeURIComponent(sp.spiel.replace(/\s+-\s+/, " vs ").replace(/\s+/g, "_")));
        if (!r.ok) { z.fehlerSuche++; continue; }
        antwort = await r.json();
      } catch (_e) { z.fehlerSuche++; continue; }
      const kandidaten = Array.isArray(antwort?.event) ? antwort!.event as Record<string, unknown>[] : [];
      const treffer = kandidaten.filter(ev => {
        if (!ev || !ev.dateEvent) return false;
        const tag = new Date(String(ev.dateEvent) + "T12:00Z");
        if (isNaN(tag.getTime()) || Math.abs(tag.getTime() - a.getTime()) > 30 * 3600000) return false;
        if (ev.intHomeScore === null || ev.intHomeScore === undefined || ev.intHomeScore === "") return false;
        if (ev.intAwayScore === null || ev.intAwayScore === undefined || ev.intAwayScore === "") return false;
        if (/postpon|cancel|abandon|susp/i.test(String(ev.strStatus || "") + " " + String(ev.strPostponed || ""))) return false;
        return true;
      });
      if (treffer.length !== 1) { z.unsicher++; continue; }
      const ev = treffer[0];
      if (!ergTeamPasst(seiten.heim, ev.strHomeTeam) || !ergTeamPasst(seiten.gast, ev.strAwayTeam)) { z.unsicher++; continue; }
      const heim = parseInt(String(ev.intHomeScore), 10), gast = parseInt(String(ev.intAwayScore), 10);
      if (!isFinite(heim) || !isFinite(gast) || heim < 0 || gast < 0) { z.unsicher++; continue; }
      const zeile = { satz: sp.satz, spiel: sp.spiel, heim, gast, ht_heim: null, ht_gast: null,
        karten: null, ecken: null, sonder: {}, stand: "fertig",
        quelle: "automatisch (Server)", von: null, updated_at: new Date(jetzt).toISOString() };
      const w = await admin.from("kt_ergebnisse").insert(zeile).select();
      if (w.error || !w.data || !w.data.length) { z.fehlerSuche++; continue; }
      ergKarte.set(k, zeile as unknown as ErgZeile);
      z.gefunden++;
    }

    // 4. Kombinationen entscheiden - derselbe Weg wie die Probe
    //    (scheinEntscheiden). Der Wechsel passiert NUR, solange der
    //    Schein noch "offen" ist (Wache gegen gleichzeitige Handaenderung).
    const jeBereich = new Map<string, { gew: (number | string)[]; ver: (number | string)[] }>();
    for (const s of scheine) {
      const e = scheinEntscheiden(s.beine, ergKarte);
      if (!e.neu) continue;
      const u = await admin.from("kt_scheine").update({ stand: e.neu })
        .eq("id", s.id).eq("stand", "offen").select("id");
      if (u.error || !u.data || !u.data.length) continue;
      if (e.neu === "gewonnen") z.gewonnen++; else z.verloren++;
      const m = jeBereich.get(s.bereich) || { gew: [], ver: [] };
      m[e.neu === "gewonnen" ? "gew" : "ver"].push(s.nummer || "?");
      jeBereich.set(s.bereich, m);
    }

    // 5. Push: an die Geraete des Bereichs-Besitzers UND an die
    //    Fixierer (kt_bereich_pins, Karam 05.09.2026). Ein Fixierer
    //    bekommt die Meldung NUR, solange er noch eine Freigabe auf
    //    den Bereich hat - Pin ohne Freigabe ist stumm. Betraege sind
    //    verschluesselt und stehen deshalb absichtlich NICHT drin.
    if (jeBereich.size) {
      const geheim = await admin.from("kt_geheim").select("name, wert").in("name", ["vapid_pub", "vapid_priv"]);
      const pub = geheim.data?.find((x: { name: string }) => x.name === "vapid_pub")?.wert;
      const priv = geheim.data?.find((x: { name: string }) => x.name === "vapid_priv")?.wert;
      if (pub && priv) {
        webpush.setVapidDetails("mailto:saifokaram1@gmail.com", pub, priv);
        for (const [bereich, m] of jeBereich) {
          const teile: string[] = [];
          if (m.gew.length) teile.push("✅ Gewonnen: Nr. " + m.gew.join(", Nr. "));
          if (m.ver.length) teile.push("❌ Verloren: Nr. " + m.ver.join(", Nr. "));
          const titel = "Kombi-Tafel: " + [m.gew.length ? m.gew.length + " gewonnen" : "",
            m.ver.length ? m.ver.length + " verloren" : ""].filter(Boolean).join(", ");
          const nutzlast = JSON.stringify({ titel: titel,
            text: teile.join("\n") + "\nBeträge und Details stehen in Mein Bereich.",
            tag: "kt-ergebnis",
            url: "https://harryclaude-hub.github.io/kombi-tafel/mein.html" });
          const empfaenger = new Set<string>([bereich]);
          const pins = await admin.from("kt_bereich_pins").select("nutzer").eq("bereich", bereich);
          if (pins.data && pins.data.length) {
            const frei = await admin.from("kt_freigaben").select("gast").eq("owner", bereich);
            const erlaubt = new Set((frei.data || []).map((x: { gast: string }) => x.gast));
            for (const p of pins.data) if (erlaubt.has(p.nutzer)) empfaenger.add(p.nutzer);
          }
          const abos = await admin.from("kt_push_abos").select("id, endpoint, p256dh, auth").in("nutzer", [...empfaenger]);
          const tot: number[] = [];
          for (const abo of (abos.data || [])) {
            try {
              await webpush.sendNotification(
                { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
                nutzlast, { TTL: 86400 });
            } catch (e) {
              const code = (e as { statusCode?: number }).statusCode || 0;
              if (code === 404 || code === 410) tot.push(abo.id);
            }
          }
          if (tot.length) await admin.from("kt_push_abos").delete().in("id", tot);
        }
      }
    }
    return json(z);
  } catch (e) {
    return json({ fehler: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});

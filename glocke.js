// ============================================================
// GLOCKE: der Nachrichten-Knopf im Kopf jeder Seite.
// Zaehlt ungelesene Bereichs-Chats und Direktnachrichten und
// haengt die rote Zahl an den Knopf. Ohne Anmeldung bleibt er still.
// ============================================================
"use strict";

async function glockeStart() {
  try {
    if (!window.supa || typeof supaNutzer !== "function") return;
    const u = await supaNutzer();
    if (!u) return;
    let n = 0;

    // Bereichs-Chats: eigener Bereich plus geteilte
    const geteilt = await supa.from("kt_freigaben").select("owner").eq("gast", u.id);
    const bereiche = [u.id].concat((geteilt.data || []).map(g => g.owner));
    for (const b of bereiche) {
      const gelesen = parseInt(localStorage.getItem("kt_gelesen_" + b) || "0", 10);
      const r = await supa.from("kt_nachrichten").select("id", { count: "exact", head: true })
        .eq("bereich", b).gt("id", gelesen).neq("autor", u.id);
      n += r.count || 0;
    }

    // Direktnachrichten von Freunden
    const kontakte = await supaKontakteLaden();
    for (const k of kontakte) {
      const gelesen = parseInt(localStorage.getItem("kt_dm_gelesen_" + k.partnerId) || "0", 10);
      const r = await supa.from("kt_direkt").select("id", { count: "exact", head: true })
        .eq("an", u.id).eq("von", k.partnerId).gt("id", gelesen);
      n += r.count || 0;
    }

    const knopf = document.getElementById("nav_nachrichten");
    if (knopf && n > 0) {
      const b = knopf.querySelector(".badge");
      b.textContent = n > 99 ? "99+" : String(n);
      b.style.display = "inline-block";
    }
  } catch (e) { /* Glocke stoert nie die Seite */ }
}

document.addEventListener("DOMContentLoaded", glockeStart);

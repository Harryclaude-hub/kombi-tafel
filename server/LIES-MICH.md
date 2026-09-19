# Server-Waechter: Deploy-Ablage

`ergebnis-scan.index.ts` ist die Version 3 der Edge Function
`ergebnis-scan` (Projekt mqmevpyatjsambervgtu): Push an Besitzer UND
Fixierer (kt_bereich_pins), und seit 19.09.2026 mit dem Schalter
`AUTO_AUSWERTEN = false` (Karam: "nichts mehr automatisch auswerten,
nur noch manuell") - Schritt 4 stellt keinen Schein mehr um.
`auswertung.deploy.mjs` ist die frisch erzeugte Begleitdatei
(auswertung.js aus dem Repo + ESM-export-Zeile).

**LIVE laeuft weiter Version 2** (Stand 19.09.2026): das MCP-Werkzeug
deploy_edge_function nimmt `files` weiterhin nur als Text an
(ZodError expected array - dieselbe Falle wie am 05.09.), und die
Supabase-CLI hat auf diesem Rechner kein Zugangstoken.

**Das automatische Auswerten ist TROTZDEM aus** - nicht per Deploy,
sondern in der Datenbank (Wanderung
`kein_auto_auswerten_stand_sperre_wirklich`): service_role hat das
UPDATE-Recht auf kt_scheine.stand verloren (alle anderen Spalten
behalten, nachgemessen mit has_column_privilege). Das Update in
Schritt 4 der Live-V2 laeuft damit auf permission denied und die
Funktion macht einfach weiter; Ergebnis-SUCHE (kt_ergebnisse) und
alles im Browser (Rolle authenticated) sind unberuehrt.

Naechste Session mit funktionierendem Deploy:
1. deploy_edge_function: project_id mqmevpyatjsambervgtu, name
   ergebnis-scan, entrypoint_path index.ts, verify_jwt true,
   files = [ergebnis-scan.index.ts, auswertung.deploy.mjs als
   auswertung.mjs].
2. Probe-Betrieb messen (POST {probe:{scheine,ergebnisse}}) und
   get_edge_function gegenlesen (version 3).
3. Die stand-Sperre kann danach BLEIBEN (doppelter Boden) - soll das
   Auto-Auswerten je wieder an: AUTO_AUSWERTEN auf true, neu deployen
   UND `GRANT UPDATE (stand) ON public.kt_scheine TO service_role;`.

Danach diese Ablage AKTUELL halten: wer die Live-Funktion aendert,
zieht diese Datei nach (Drift-Regel wie auswertung.js).

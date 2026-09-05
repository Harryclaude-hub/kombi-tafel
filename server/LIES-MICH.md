# Server-Waechter: Deploy-Ablage

`ergebnis-scan.index.ts` ist die FERTIGE Version 3 der Edge Function
`ergebnis-scan` (Projekt mqmevpyatjsambervgtu): Push geht an den
Bereichs-Besitzer UND an alle Fixierer (kt_bereich_pins) mit Freigabe.

**NOCH NICHT DEPLOYT** (Stand 05.09.2026): das MCP-Werkzeug
deploy_edge_function bekam in der Session nur Text-Parameter
(ZodError expected boolean/array). Naechste Session:

1. auswertung.mjs frisch erzeugen: Inhalt = auswertung.js aus dem
   Repo + die ESM-export-Zeile (steht am Ende der deployten Fassung,
   get_edge_function zeigt sie). NIE von Hand abtippen.
2. deploy_edge_function: project_id mqmevpyatjsambervgtu, name
   ergebnis-scan, entrypoint_path index.ts, verify_jwt true,
   files = [diese index.ts, auswertung.mjs].
3. Probe-Betrieb messen (POST {probe:{scheine,ergebnisse}}) und
   get_edge_function gegenlesen (version 3).

Danach diese Ablage AKTUELL halten: wer die Live-Funktion aendert,
zieht diese Datei nach (Drift-Regel wie auswertung.js).
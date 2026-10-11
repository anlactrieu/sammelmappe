# HANDOFF – Sammelmappe (Stand 2026-10-11)

## Stand
PWA (React+Vite+TS+Dexie) im Projektroot, MVP laufend: Suche (TCGdex DE), Sammlung (Filter, Raster/Liste), Details/Preis-Override, Dashboard (Wert, Verlauf, Wert nach Set, Bewegungen), Sets/Master, Wunschliste, Backup JSON/CSV, Produkte (manuell/EAN), Scan (OCR-Nummer + Barcode).
Verifiziert: `npx tsc --noEmit` ok, `npx vitest run` 26/26, `npm run build` ok, UI im Browser-Pane (Mobile) geprüft. Kamera/OCR im Pane nicht testbar (Kamera blockiert).
Review-Runden 1+2 (Subagent) und 2 Advisor-Runden abgearbeitet. OCR im Browser-Pane auf echten DE-Kartenbildern verifiziert (`006/165`, `025/198`, ~1,2 s; Filter `grayscale+contrast` nötig, Safari-Fallback per Pixelschleife). Build/Preview: HTML, Manifest, Icons, sw.js liefern 200; Service-Worker-Registrierung im Browser-Pane nicht prüfbar (Pane blockiert SW, auch bei direktem `register`). Kein Git-Repo → `/code-review` übersprungen (User fragen, ob `git init`).

## Letzte 3 Entscheidungen
1. **OCR über enge Streifen** (`src/lib/strips.ts`, `src/services/ocr.ts`): Node-Test auf echten DE-Karten – Vollkarte/breite Bereiche liefern keine Nummer, enge Streifen unten links/rechts (4× skaliert, Whitelist `0-9/`, PSM 11) lesen `025/198`. Rahmen→Videopixel via `frameToVideo`.
2. **HashRouter + `base: './'`**: kein Server-Rewrite für Deep-Links nötig; HTTPS für Kamera via `npm run dev:https` (basic-ssl).
3. **Preislogik** (`src/lib/pricing.ts`): TCGdex `trend/avg/low` = Hauptprodukt (Normal/Holo), `*-holo` = Reverse; 0/null = kein Preis. Zustandsabschläge nur Schätzung (≈), Eigenpreis gewinnt.

## Offene TODOs
- Optional: 24-h-Option in Bewegungen (`avg1`), Seltenheit-Filter, Sheet-Fokus-Trap, Segmented als radiogroup.
- SW/Offline auf echtem Gerät prüfen.
- Echte Handy-Kameratests (OCR/Barcode) durch User; ggf. Streifenparameter nachjustieren.
- Phase 2 (siehe SPEC.md): Foto je Exemplar, Preisalarme, Playwright, Binder, CSV-Import Cardmarket.
- Browser-Viewport ist auf Desktop zurückgesetzt; Dev-Server (`preview_start sammelmappe`) läuft evtl. noch.

## Wichtige Dateien
`src/lib/actions.ts` (addCard/addProduct transaktional), `src/services/tcgdex.ts` (`fetchCard`, `resolveByNumber`), `src/services/priceSync.ts` (`syncPrices` mit Lock, `saveSnapshot`), `src/pages/Scan.tsx`, `src/components/CardSheets.tsx`, `src/__tests__/core.test.ts`.

## Learnings
- TCGdex `/v2/de` liefert deutsche Namen + `pricing.cardmarket` (EUR, täglich), CORS offen; `/sets` listet älteste zuerst, ohne `releaseDate`; `localId` ist set-abhängig gepaddet (`025` vs `4`).
- CSS-Klasse `.card` kollidiert mit Modus-Klassennamen (Scan-Rahmen wurde weiß) → `is-card`.
- macOS `sed -i ''` nötig; `sips -c` für Bildcrops, kein PIL installiert.
- Dexie: Chip-/Stepper-Gruppen nicht in `<label>` (löst ersten Button aus).

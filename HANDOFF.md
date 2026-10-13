# HANDOFF – Sammelmappe (Stand 2026-10-11)

## Stand
PWA (React+Vite+TS+Dexie) im Projektroot, MVP laufend: Suche (TCGdex DE), Sammlung (Filter, Raster/Liste), Details/Preis-Override, Dashboard (Wert, Verlauf, Wert nach Set, Bewegungen), Sets/Master, Wunschliste, Backup JSON/CSV, Produkte (manuell/EAN), Scan (OCR-Nummer + Barcode).
Verifiziert: `npx tsc --noEmit` ok, `npx vitest run` 26/26, `npm run build` ok, UI im Browser-Pane (Mobile) geprüft. Kamera/OCR im Pane nicht testbar (Kamera blockiert).
Review-Runden 1+2 (Subagent) und 2 Advisor-Runden abgearbeitet. OCR im Browser-Pane auf echten DE-Kartenbildern verifiziert (`006/165`, `025/198`, ~1,2 s; Filter `grayscale+contrast` nötig, Safari-Fallback per Pixelschleife). Build/Preview: HTML, Manifest, Icons, sw.js liefern 200; Service-Worker-Registrierung im Browser-Pane nicht prüfbar (Pane blockiert SW, auch bei direktem `register`). Kein Git-Repo → `/code-review` übersprungen (User fragen, ob `git init`).

## Online
Live: https://anlactrieu.github.io/sammelmappe/ (Repo anlactrieu/sammelmappe, öffentlich, Pages via Actions). Täglicher Katalog-Refresh per Cron 21:30 UTC. Sammlung bleibt lokal pro Gerät (kein Sync). Produktkatalog: `scripts/build-catalog.mjs` (tcgcsv.com, eigener User-Agent, 100 ms Pause). Produkt-Foto-Suche: Scan → „Produkt“ → „Packung fotografieren“.

## Internationale Karten (neu, lokal – noch nicht committet/gepusht)
Sprachen de/en/ja/zh-tw/zh-cn (TCGdex `/v2/{lang}`; ko bewusst nicht: 239 Karten, keine Bilder). Karten-Schlüssel: de roh (`sv01-025`), sonst `ja:SV2a-025` (`src/lib/lang.ts`). `CardRef.lang/dexId/nameDe`; deutsche Namen über Pokédex-Nr. (PokeAPI, Cache-Tabelle `dex`, Dexie v2: Sets-Cache `setcache` je Sprache). Suche fremdsprachig: DE/EN-Name → dexId → Zielsprachen-Name (`searchCards`). Preise = Cardmarket-Richtwert aus TCGdex (bei ja/zh JP-Produkt). Scan: Sprachwahl in `Scan.tsx`, `resolveByNumber(..., lang)`. Offen: JP-Bilder fehlen zu ~70 % (Idee: TCGCSV-Kategorie 85 als Fallback), Bild-Index für Karten, ko/zh-cn kaum Daten.

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


## Aktuell (2026-10-11, spät)
Technische Gesamtdoku: `ARCHITEKTUR.md`. Scan ist nur noch Foto (Nummer-/Live-Scan entfernt). Karten-Index-Lauf (`cards-index.yml`) läuft/setzt fort; danach mit den drei Test-Karten (Necrozma SM106, Galar-Lauchzelot 079/198, Galagladi 081/198) prüfen. Regel: alles kostenlos halten (Repo öffentlich).


## Stand 2026-10-13
- JP-Bilder-Fallback ist umgesetzt: TCGCSV-Katalog (`cards-ja.json`, live 27.920 Karten/402 Sets, US-Preis in Euro, Bild tcgplayer-CDN) + Dubletten-Abgleich mit TCGdex (`src/services/jaCards.ts`). Der Punkt „JP-Bilder fehlen" oben ist damit erledigt.
- Foto-Index (Branch `data`, `cards-emb.*`) hatte beim Lauf vom 12.10. 0 Einträge `ja:cat-…` (Log: „japanische Katalogkarten: 0 neu", vermutlich war `cards-ja.json` live noch nicht deployt). Neuer Lauf `cards-index.yml` am 13.10. 18:27 UTC per workflow_dispatch gestartet (Run 38446924096).
- Danach prüfen: Index enthält `ja:cat-*`; Foto-Test mit einer JP-Karte ohne TCGdex-Bild, plus Necrozma SM106, 079/198, 081/198 (SV1 ist de/en, nicht JP).


## Stand 2026-10-13 (abends) – Juice-Feature
**Stand:** Juice nach dem Hinzufügen umgesetzt und gepusht (SPEC.md-Abschnitt „Juice"). tsc ok, Vitest 57/57, Build ok. Index-Lauf `cards-index.yml` (Run 38446924096) wurde gestartet – Ergebnis noch nicht geprüft (Index soll `ja:cat-*` enthalten).

**Letzte 3 Entscheidungen**
1. Overlay nur beim Einzel-Hinzufügen (`AddCardSheet`), Schnell-Modus nur Flug + „+N" am Tab – damit Dauer-Erfassen nicht bremst.
2. Meilenstein-Logik als reine Funktion in `src/lib/milestones.ts` (`findMilestone`, `isHighlight`, `collectionStats`) – testbar ohne UI; Priorität Set > Gesamtzahl > erstes Holo.
3. Keine Bibliothek: Flug per Web Animations API, Konfetti als kleines Canvas, Tab per `document.querySelector('.tabbar a[href$="/collection"]')` – keine Änderung an `App.tsx`-Navigation nötig.

**Offen**
- Echte Handy-Prüfung der Animationen (Konfetti/Glanz nicht visuell bestätigt).
- `/code-review` über den Diff nicht gelaufen.
- Wunschlisten-Treffer ohne eigenen Effekt.
- Index-Lauf prüfen, dann JP-Foto-Test (siehe oben).

**Dateien:** `src/components/Celebrate.tsx` (`CelebrateProvider`, `useCelebrate`), `src/lib/milestones.ts`, `src/components/quickAdd.ts`, `src/components/CardSheets.tsx` (`AddCardSheet.save`), Styles am Ende von `src/styles.css`.

**Learnings**
- Das Browser-Pane meldet `prefers-reduced-motion: reduce` → Animationen sind dort aus; zum Testen `window.matchMedia` per Skript überschreiben. WAAPI (`element.animate`) wird vom globalen CSS-`animation:none` nicht gestoppt, darum prüft `Celebrate.tsx` `reduced()` selbst.
- Timer im verdeckten Browser-Pane laufen gedrosselt (javascript_tool-Timeouts bei langen `await`-Schleifen).

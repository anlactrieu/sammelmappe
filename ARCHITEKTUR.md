# Sammelmappe – technische Dokumentation (Stand 2026-10-11)

PWA zum Erfassen und Bewerten deutscher (und internationaler) Pokémon-Karten und versiegelter Produkte. Läuft komplett im Browser, Daten liegen lokal. **Muss für den Betreiber 100 % kostenlos bleiben** (öffentliches Repo, nur Gratis-Dienste ohne Key).

Live: https://anlactrieu.github.io/sammelmappe/ · Repo: `anlactrieu/sammelmappe` (öffentlich)

## 1. Stack
React 19 + Vite + TypeScript, `react-router-dom` (HashRouter, kein Server-Rewrite nötig), Dexie (IndexedDB), `vite-plugin-pwa` (Workbox), Vitest (+ fake-indexeddb). Keine Backend-Komponente.

## 2. Datenquellen (alle gratis, ohne Key)
| Zweck | Quelle | Hinweis |
|---|---|---|
| Karten, Sets, Bilder, Cardmarket-EUR-Preise | TCGdex `api.tcgdex.net/v2/{de,en,ja,zh-tw,zh-cn}` | CORS offen; Preise = Cardmarket-Richtwert (bei ja/zh das JP-Produkt) |
| Pokémon-Namen je Sprache (Pokédex-Nr.) | PokeAPI `pokemon-species/{id}` | Cache in Dexie-Tabelle `dex` |
| Versiegelte Produkte (en + ja) mit Bild/USD-Preis | tcgcsv.com (TCGplayer-Export, Kategorien 3 und 85) | nur serverseitig/CI, eigener User-Agent, 100 ms Pause, höchstens 1×/Tag |
| Wechselkurs USD→EUR | frankfurter.dev | 24 h gecacht |
| Bild-Modell | Hugging Face `Xenova/dinov2-small` (q8) | lädt der Browser einmalig, Cache |
| OCR-Daten | tesseract.js über jsDelivr | nur noch für Produkttext im Foto |

## 3. Datenmodell (Dexie, `src/db.ts`, aktuell Version 3)
`items` (Sammlung: kind card/product, refId, qty, condition, variant, language, graded, buyPrice, manualPrice), `cards` (Katalog-Cache), `setcache` (Sets je Sprache, Schlüssel `lang/id`), `products` (eigene/Katalog-Produkte inkl. `catalogId`, `priceSource`, `region`, `image`), `wishlist`, `snapshots` (Tageswert), `settings`, `dex`, `learned` (vom Nutzer bestätigte Foto-Vektoren).
- Karten-Schlüssel: Deutsch roh (`sv01-025`), sonst `ja:SV2a-025` (`src/lib/lang.ts`).
- Preislogik `src/lib/pricing.ts`: Cardmarket `trend/avg/low` = Hauptprodukt, `*Holo` = Reverse; Zustandsabschläge (EX 85 % …) nur Schätzung; Eigenpreis schlägt alles; Preise >7 Tage = veraltet.
- Backup: JSON (alles) und CSV (Excel DE).

## 4. Seiten (`src/pages`)
Home (Wert, Verlauf, Wert nach Set, Bewegungen), Collection (Filter, Raster/Liste), Add (Suche Karte/Produkt, Sprachchips), **Quick** (Tippen→Antippen, `2x`-Menge, Rückgängig), **Scan** (ein Foto → Auswertung), Sets (+Master-Set), Wishlist, Settings (Preis-Refresh, Backup, Katalog).

## 5. Erkennung
- **Produkte per Foto:** DINOv2-small-Vektor (384 Dim., int8) im Browser, Vergleich gegen `catalog-emb.*` (Katalog + eigene Produkte). Zusätzlich lernt die App bestätigte Treffer lokal (`learned`, max. 5 Fotos/Produkt).
- **Karten per Foto:** gleicher Weg gegen `cards-emb.*` (alle Sprachen). Index wird per CI aufgebaut (siehe 7). **Keine** Nummer-/Texterkennung mehr: sie war bei echten Fotos (Toploader, Spiegelung) unbrauchbar.
- **Barcode im Foto:** native `BarcodeDetector`, sonst `zxing-wasm`; UPC-A/EAN-13 normalisiert, mehrere EANs je Produkt (`eanList`).
- Auswertung in `src/services/analyze.ts` (Barcode, Bild global + Bildmitte, Ergebnis Karten/Produkte).
- Gemessen (digital/simuliert): Produkt-Bildsuche ~9/10 richtig; Karten 27/30 Platz 1, 29/30 Top 3. Echte Handyfotos können schlechter sein.

## 6. Produktkatalog & eigene Produkte
- `scripts/build-catalog.mjs` → `public/catalog.json` (~6.3k Produkte, en + ja, USD). Inkrementell je Kategorie, nur einmal pro Datenstand.
- **Eigene Produkte:** `public/custom-products.json` + Bilder in `public/custom/` (negative IDs, EUR-Preis, EAN(s), Notiz mit Quellen). Werden in Katalogsuche, Barcode-Erkennung und Foto-Index berücksichtigt. Chinesische/koreanische Produkte haben keine offene Preisquelle → manuell belegt gepflegt.
- Deutsche Suchwörter → englische Katalognamen (`WORDS` in `src/services/catalog.ts`: Koffer→chest, Nachtara→umbreon, …).

## 7. Automatisierung (GitHub Actions)
- `.github/workflows/deploy.yml`: bei Push und täglich 21:30 UTC → `npm ci`, `npm run catalog`, `npm run embeddings` (Produkt-Vektoren, setzt von der Live-Seite fort), Karten-Index vom Branch `data` holen, Tests, Build, Deploy nach GitHub Pages.
- `.github/workflows/cards-index.yml`: wöchentlich/per Hand → `scripts/build-card-embeddings.mjs` berechnet Karten-Vektoren (de, ja, zh-tw, en), setzt fort, Zeitbudget ~320 min/Lauf, legt `cards-emb.{json,bin}` als einzigen Commit auf Branch `data`, stößt danach das Deploy an.
- Geplante Läufe pausiert GitHub nach 60 Tagen Repo-Inaktivität → dann manuell starten.

## 8. PWA / Caching (`vite.config.ts`)
`base: './'`, HTTPS-Dev (`npm run dev:https`) für die Kamera. Precache nur kleine Dateien; große/tägliche Daten (`catalog.json`, `catalog-emb.*`, `custom-products.json`, `custom/*`) **NetworkFirst**, `cards-emb.*` StaleWhileRevalidate, Karten-/Produktbilder CacheFirst, Modell-/WASM-Dateien CacheFirst.

## 9. Tests & Qualität
`npx tsc --noEmit`, `npx vitest run` (42 Tests: Preislogik, Parsing, Aktionen/Transaktionen, Backup, Katalogsuche, EAN, Mengen, Sprachen), `npm run build`. Kein Playwright/Lint.

## 10. Design
Kühles Papier, Tinte, Preisschild-Gelb (`--label`), Big Shoulders Display / Schibsted Grotesk / JetBrains Mono, Folienglanz nur auf seltenen Karten. Touch-Ziele ≥44 px, Dark Mode, Reduced Motion.

## 11. Bekannte Grenzen / offen
- Karten-Foto-Erkennung erst nach fertigem Index; Wirksamkeit auf echten Fotos noch offen.
- Preise sind Händler-/Cardmarket-Richtwerte, keine Verkaufspreise; viele Produktpreise von Subagenten aus Suchtreffern gelesen und nicht selbst geprüft (Notiz je Eintrag).
- Daten nur lokal pro Gerät (kein Sync); Backup unter Profil.
- Koreanisch fehlt (TCGdex hat nur 239 Karten), Chinesisch vereinfacht kaum Bilder.
- Foto-Suche beim ersten Aufruf: Modell-Download; Index später ~15–20 MB.

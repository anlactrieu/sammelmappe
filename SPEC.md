# SPEC – Pokémon TCG Sammlungs-Tracker (DE)

Arbeitstitel: **Sammelmappe**. Ziel: deutsche Pokémon-Karten und versiegelte Produkte scannen, zur Sammlung hinzufügen und den aktuellen Marktwert (Cardmarket, EUR) tracken.

## Entscheidungen (geklärt)
| Thema | Entscheidung |
|---|---|
| Plattform | PWA (React + Vite + TypeScript), mobile-first, installierbar, Kamera-Scan |
| Umfang | Pokémon TCG deutsch: Einzelkarten + versiegelte Produkte (Booster, Display, ETB, Decks, Tins) |
| Preise | Cardmarket (EUR) über API, manueller Override, Live-Refresh, Preisverlauf |
| Daten | Lokal im Gerät (IndexedDB via Dexie), Export/Import JSON + CSV, kein Konto |

## Datenquellen (in Phase 1 verifizieren!)
- **Kartendaten DE + Preise:** TCGdex (`api.tcgdex.net/v2/de/…`) – deutsche Namen/Sets, Bilder, `pricing.cardmarket` (avg, low, trend, avg7/30, Holo-Varianten). Fallback: pokemontcg.io (nur EN-Namen, Cardmarket-EUR). Annahme muss vor Umsetzung per Testabruf bestätigt werden (Felder, CORS, Rate-Limits).
- **Versiegelte Produkte:** keine verlässliche freie API. Lösung: kleiner mitgelieferter Produktkatalog (JSON, pflegbar) + EAN-Zuordnung durch den Nutzer (einmal zuordnen, danach merkt sich die App den Barcode) + manueller Preis.
- Aktualität: Preise werden beim App-Start (wenn älter als 24 h), per Pull-to-Refresh und per „Alle aktualisieren“ geholt; jeder Preis zeigt Quelle + Zeitstempel („Cardmarket · vor 3 Std."). Veraltet (>7 Tage) = Warnhinweis.

## Kernfunktionen (MVP)
1. **Scan-Flow**
   - Karte: Kamera → OCR (Tesseract.js, `deu`) liest Kartennummer (z. B. `025/165`) + Set-Kürzel/Name → Treffer-Vorschläge mit Bild; Nutzer bestätigt mit einem Tap.
   - Produkt: Barcode/EAN-Scan (`BarcodeDetector`, Fallback `zxing-wasm` für iOS Safari) → Katalog-Treffer oder „Neu anlegen“.
   - Immer vorhanden: Suche per Name/Nummer als Fallback, Serien-/Mehrfach-Scan („nächste Karte“ ohne Zurück).
2. **Sammlung**: Raster/Liste, Filter (Set, Seltenheit, Typ, Zustand, Sprache, Karte/Produkt), Sortierung (Wert, Name, Hinzugefügt), Suche.
3. **Exemplar-Details**: Menge, Zustand (M/NM/EX/GD/LP/PL/PO), Variante (Normal/Holo/Reverse/1st Ed.), Sprache (DE Standard), Gradet (PSA/CGC/BGS + Note, manueller Wert), Kaufpreis, Notizen, Foto.
4. **Wert-Dashboard**: Gesamtwert, Kaufpreis vs. Wert (Gewinn/Verlust €/%), Top-Karten, Wert nach Set, Verlaufsgraph, Preisänderungen 24 h/7 T/30 T.
5. **Preis-Management**: manueller Override pro Exemplar, „Preis schnell ergänzen“ direkt aus der Detailansicht und für Produkte ohne API-Preis, Hinweis „Preis fehlt“ in Liste.
6. **Set-Fortschritt**: Fehlende Karten pro Set, Prozent komplett, Master-Set-Ansicht.
7. **Wunschliste**: Karten mit Zielpreis, Markierung wenn Preis darunter fällt.
8. **Backup**: Export/Import JSON, CSV-Export (für Excel/Cardmarket-Listen).

## Wünsche der Zielgruppe (priorisiert)
- Muss (MVP): oben genannt.
- Soll (Phase 2): Preisalarm-Benachrichtigungen, Tauschliste/Verkaufsliste inkl. Teilen als Bild/Link, Binder-Ansicht (virtueller Ordner), Mehrfach-Sammlungen/Ordner, Dubletten-Erkennung, Cardmarket-CSV-Import.
- Kann (später): Deck-Builder, Zustandsbewertung per Foto, Cloud-Sync.

## UX / Design
- „Intuitiv und rund“: Bottom-Tab-Bar (Start · Sammlung · **Scan** (zentraler runder Button) · Wunschliste · Profil), große Touch-Ziele (≥44 px), abgerundete Karten (Radius 20–28), weiche Schatten, Daumenzonen-Layout.
- Design über `frontend-design` + `ui-ux-pro-max` (global Standard): eigene Typografie, Pokémon-nahe aber eigenständige Farbwelt, Hell/Dunkel, `prefers-reduced-motion`, Kontrast AA.
- Sprache: komplett Deutsch, Preise `1.234,56 €`.
- Leere Zustände mit Anleitung, Onboarding in 3 Schritten, Optimistic UI, Skeletons beim Laden, Offline: Sammlung und letzte Preise bleiben nutzbar.

## Architektur (Ist-Stand)
- `src/db.ts` (Dexie: `items`, `cards`, `sets`, `products`, `wishlist`, `snapshots`, `settings`), `src/types.ts`, `src/hooks.ts`
- `src/lib/` : `pricing` (Preislogik, Zustandsabschlag, Stale), `parse` (Kartennummer/EAN), `strips` (OCR-Streifengeometrie), `format`, `actions` (transaktionale DB-Aktionen)
- `src/services/` : `tcgdex`, `priceSync` (24-h-Auto-Sync, Snapshot, Lock), `ocr`, `barcode`, `backup`
- `src/pages/` : Home, Collection, Scan, Add, Sets (+Detail), Wishlist, Settings; `src/components/` : Sheets, UI, Icons
- PWA: `vite-plugin-pwa`, HashRouter (kein Server-Rewrite nötig), CacheFirst für Kartenbilder/OCR-Assets, NetworkFirst für API. Kamera braucht HTTPS: `npm run dev:https`.
- Tests: Vitest (Preislogik, Parsing, Aktionen/Transaktionen, Backup, Geometrie).

## Phasen
1. Spike: TCGdex-Abruf (DE, Preise) + OCR-Genauigkeit an Testbildern prüfen → Annahmen bestätigen.
2. Fundament: Projekt, DB, Design-System, Navigation.
3. Suche + manuelles Hinzufügen + Sammlung + Details.
4. Preis-Sync + Dashboard + Verlauf + Override.
5. Scan (Karte OCR, Produkt EAN).
6. Wunschliste, Set-Fortschritt, Export/Import, PWA-Politur.
7. Verifikation (Tests, Build, Lint), `/code-review`, Advisor.

## Verschoben auf Phase 2 (bewusst nicht im MVP)
Foto je Exemplar, Pull-to-Refresh (Button + Auto-Sync vorhanden), Playwright-Smoke, Preisalarm-Benachrichtigungen, Cardmarket-CSV-Import, Binder-Ansicht, Tausch-/Verkaufsliste, Preisverlauf je Karte, mitgelieferter Produktkatalog (Namen kommen aus der Set-Liste, EANs lernt die App beim ersten Scan).

## Hinweis Preise
Angezeigte Werte sind **Cardmarket-Richtwerte** auf Produktebene (Trend), nicht nach Sprache gefiltert und keine Echtzeitpreise. Zustandsabschläge (EX 85 %, GD 70 % …) sind Schätzungen („≈“). Eigener Preis überschreibt immer.

## Offene Risiken
- OCR-Treffsicherheit bei Glanz/Holo → Fallback Suche immer sichtbar, Nutzer bestätigt.
- Cardmarket-Preise sind Tageswerte von Drittanbieter-APIs, kein Echtzeit-Marktpreis; UI kennzeichnet Quelle/Alter.
- Sealed-Preise nur manuell/katalogbasiert, bis eine verlässliche Quelle gefunden ist.
- Keine Cardmarket-Offiziell-API-Nutzung (Zugang eingeschränkt); API-Nutzungsbedingungen von TCGdex beachten.

## Status
MVP umgesetzt (siehe README.md für Start/Test).


## Feature: „Juice" nach dem Hinzufügen einer Karte (2026-10-13)
**Ziel:** Nach dem Anlegen soll sich das Hinzufügen belohnend anfühlen (bisher nur Toast in `AddCardSheet`/`quickAdd.ts`).

**Entscheidungen (AskUserQuestion):**
- Enthalten: (1) Karten-Flug in die Sammlung, (2) Konfetti/Glanz bei Highlights, (3) Erfolgs-Karte mit Kontext. Kein Sound/Haptik.
- Intensität: voll beim Einzel-Hinzufügen (`AddCardSheet`); im Schnell-Modus (`Quick.tsx`/`quickAdd.ts`) nur kurzer Flug + Zähler, nichts, was bremst.
- Meilensteine: ja – Set-Fortschritt (z. B. 25/50/75/100 %), Gesamtzahl (z. B. 100. Karte), erstes Holo/Highlight mit Sondermoment.

**Umsetzung (Vorschlag):**
- Erfolgs-Overlay statt Toast beim Einzel-Hinzufügen: große Karte, Name, Wert, „Neu im Set X: n/total" mit Fortschrittsbalken, Sammlungswert +X €. Auto-Schließen nach ~2,5 s, per Tap sofort.
- Flug: Kartenbild skaliert zum Sammlungs-Tab; Tab pulsiert, Zähler springt hoch (CSS-Transform/Web Animations, keine Library).
- Highlight-Kriterium: seltene Seltenheit oder Preis ≥ Schwelle (Konstante, z. B. 20 €) → Glanz-Sweep/Konfetti (Canvas, klein, selbst geschrieben).
- Meilensteine: nach `addCard` aus Dexie berechnen (Set-Anteil vorher/nachher, Gesamtanzahl); höchster erreichter Meilenstein ersetzt den Standard-Text.
- Muss: `prefers-reduced-motion` respektieren (bereits globales Abschalten in `styles.css:178` → Overlay bleibt statisch), kostenlos/ohne neue Dienste, Mobile-first, `frontend-design`/`ui-ux-pro-max` anwenden.
- Tests: Meilenstein-Berechnung als reine Funktion mit Vitest; UI im Browser-Pane (Mobile) prüfen.

**Offen:** Schwelle für „Highlight"; ob der Wunschliste-Treffer („Wunschkarte erfüllt") eigenen Effekt bekommt.

**Vorgehen:** Umsetzung in frischer Session mit dieser Spec als Referenz.

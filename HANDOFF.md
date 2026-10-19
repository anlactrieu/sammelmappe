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


## Stand 2026-10-13 (Review-Checkpoint)
**Stand:** `/code-review` (high) über das Juice-Feature gelaufen, 7 Befunde, noch keiner behoben. Index-Lauf `cards-index.yml` (Run 38446924096) lief zuletzt noch; Ergebnis (`ja:cat-*` im Index) steht aus.

**Letzte 3 Entscheidungen**
1. Review-Befunde erst nach Rückfrage beheben (User hat noch nicht geantwortet) – 1–3 und 7 sind echte Fehler, 4–6 klein.
2. Index-Lauf nicht gepollt, später erneut prüfen (läuft mehrere Stunden).
3. HANDOFF.md nur anhängen statt umschreiben, damit der Verlauf lesbar bleibt.

**Offene TODOs (Review-Befunde)**
1. `collectionStats` (`src/lib/milestones.ts`): Set-Zähler nur Grundset zählen (`inBaseId(localId, official)` wie `Sets.tsx`), sonst „203/198“ / zu frühes „Set komplett!".
2. `CelebrateProvider`: `onDone` stabil (useCallback/Ref), sonst setzt Provider-Re-Render Timer + Konfetti zurück.
3. Wertzuwachs im Overlay: `manualPrice` aus dem Sheet berücksichtigen (`CelebrateOpts` erweitern), Highlight-Prüfung ebenso.
4. `after`-Stats aus `before` ableiten statt zweiter Voll-Abfrage.
5. `pulseTab`: schnelle Folge-Adds (+N hochzählen, Timer pro Aufruf).
6. Overlay per Tastatur schließbar (Escape, Rolle/Fokus).
7. Test für `collectionStats` (zwei Sprachen, Secret Rare).
- Außerdem: echte Handy-Prüfung der Animationen, Wunschlisten-Treffer-Effekt, Index-Lauf prüfen.

**Dateien:** `src/lib/milestones.ts`, `src/components/Celebrate.tsx`, `src/__tests__/core.test.ts` (Block „Meilensteine"), `src/pages/Sets.tsx` (`baseCount`/`inBaseId` als Vorbild).

**Learnings**
- Set-Fortschritt muss überall dieselbe Definition nutzen (Grundset = Nummer ≤ offizielle Kartenzahl); `setTotal` ist die offizielle Zahl, Secret Rares liegen darüber.


## Stand 2026-10-13 (spät) – Bilder-Fallback & Sprache
**Stand:** Alles gepusht, tsc ok, Vitest 59/59, Build ok. Juice-Review-Befunde 1–3 und 7 behoben; 4–6 bewusst offen (doppelte `collectionStats`-Abfrage, überlagerte „+1" bei schnellen Taps, Overlay nicht per Tastatur schließbar). Index-Lauf `cards-index.yml` (Run 38446924096) läuft, zuletzt 1.925 von ~28.000 `ja:cat-*` indiziert.

**Letzte 3 Entscheidungen**
1. Bildlose JA/ZH-Karten bekommen das Bild der JP-Katalogkarte mit gleichem Set-Kürzel + Nummer (`catalogImageFor` in `jaCards.ts`; angewandt in `fetchCard`, `searchCards`/`fillImages`, `fetchSetCards`, `backfillJaImages` beim App-Start). Grund: TCGdex hat bei 9.124/13.006 JA-, 5.290/7.436 zh-tw- und allen zh-cn-Karten kein Bild; 40er-Stichprobe per Pokédex-Nr. ohne Fehlzuordnung.
2. Bei zh ist es das Motiv der japanischen Karte (nicht die chinesische Karte selbst) – bewusst akzeptiert, kostenlose Quelle gibt es nicht.
3. Detail-Sheet: Sprach-Select enthält jetzt immer den gespeicherten Wert (vorher sprang JA/ZH auf „DE").

**Offen**
- Sprach-Codes vereinheitlichen: `LANGS` in `CardSheets.tsx` hat `JP`, gespeichert wird `JA` (ggf. Migration alter `JP`-Items).
- Rest ohne Bild: ~3.800 JA, ~1.800 zh-tw (v. a. chinesische Exklusiv-Sets `SC1a/SC1b`, Promos).
- Index-Lauf prüfen; danach Foto-Test mit JP-Karte.
- Echte Handy-Prüfung Juice-Animationen; Wunschlisten-Effekt; Review-Befunde 4–6.

**Dateien:** `src/services/jaCards.ts` (`catalogImageFor`, `backfillJaImages`), `src/services/tcgdex.ts` (`ASIA`, `fillImages`, `fetchCard`, `fetchSetCards`), `src/components/CardSheets.tsx` (Sprach-Select), `src/lib/milestones.ts` (`inBaseId`, `collectionStats`).

**Learnings**
- Ein `<select>` zeigt den ersten Eintrag, wenn der gespeicherte Wert nicht in den Optionen steht – Wert immer mit aufnehmen.
- `cmd1; git commit && git push` nach einem fehlgeschlagenen `cmd1 &&` pusht trotzdem: Build vor dem Push gesondert prüfen (einmal kaputten Stand gepusht, direkt repariert).


## Offen: Karten ohne Bild/Daten (Foto 2026-10-13, Entscheidung offen)
- McDonald's 2019 (de: Evoli 12/12, Pikachu 6/12, Menki 8/12): TCGdex hat Set nur en (`2019sm`), dort alle ohne Bild → keine Quelle.
- Knarbon `mep-022` (de/en vorhanden, ohne Bild) → Foto-Erkennung findet sie nicht; Idee: englischer tcgcsv-Katalog (Kategorie 3) als Bildquelle für bildlose de/en-Karten.
- zh-cn Banette `CSMPiC-045`: ohne Bild, JP-Fallback greift nicht (Set-Kürzel fehlt im JP-Katalog).
- Hitokage 289/S-P (ja): im JP-Katalog, wird mit Index-Lauf (`ja:cat-597462`) auffindbar.
- Optionen: (a) EN-Katalog als Bildquelle, (b) eigene Einzelkarten mit Nutzerfoto (analog `custom-products.json`). User noch unsicher.


## Stand 2026-10-16 – Tester-Feedback
**Stand:** Zwei Commits auf `main` gepusht (tsc ok, Vitest 61/61, Build ok): (1) Scroll-Fix + ＋ aus Namenssuche entfernt, (2) Suche „Name + Nummer“ (`Glurak 006`, `Pikachu 25/198`).

**Letzte 3 Entscheidungen**
1. `overflow-x: clip` nur am `body` statt `hidden` auf `html`+`body` – Verdacht auf mobiles Scroll-Hängen; ungeprüft auf echtem Gerät.
2. ＋ (Direkt-Hinzufügen) in `src/pages/Add.tsx` entfernt, damit immer das `AddCardSheet` (Zustand/Sprache/Menge) kommt; in `src/pages/Sets.tsx` bleibt es zum schnellen Abhaken.
3. Name+Nummer: `parseNameNumberQuery` (`src/lib/parse.ts`) + `searchNameNumber` (`src/services/tcgdex.ts`): Namenssuche, Filter auf `localId`, bei Gesamtzahl zusätzlich Set-Filter; ohne Treffer Fallback auf reine Namenssuche.

**Offen**
- Tester-Rückmeldung zum Scrollen abwarten.
- Fehlende Bilder (30-Jahre-Set) liegen an TCGdex, kein Code-Fix.
- ＋ auf Sets-Seite bleibt (User-Entscheidung 2026-10-16).
- `/code-review` für diese zwei Commits nicht gelaufen.
- Slab-Feature verworfen (keine kostenlose automatische Preisquelle), Begründung in `SPEC.md` Abschnitt „Slabs“. `graded` bleibt optional im Bearbeiten-Fenster; Slab ohne Eigenpreis = „Preis fehlt“ (`pricing.ts`), mit Eigenpreis normal bewertet.


## Stand 2026-10-18 – Tester-Feedback Runde 2
**Stand:** Alles auf `main` gepusht (tsc ok, Vitest 61/61, Build ok). Nicht auf echtem Gerät/optisch geprüft.

**Letzte 3 Entscheidungen**
1. Alias-Tabelle `REPRINTS` (`src/services/tcgdex.ts`, `withReprints`): `base1-4` → `30th-c-001`. Die API nummeriert die Klassische-Sammlung-Neuauflage 001/030, gedruckt steht 4/102. Bewusst nur verifizierte Einzelkarten (Namensabgleich würde falsche Treffer bringen); weitere Karten nur mit bestätigter gedruckter Nummer ergänzen.
2. Variante sichtbar: `Row.variantLabel` (`src/hooks.ts`) → Badge `.badge.var` im Raster, Text in der Liste, durchsuchbar. „Normal“ nur, wenn die Karte mehrere Varianten hat.
3. Schnell erfassen: Variante-Schalter (Auto/Normal/Holo/Reverse, localStorage `quickVariant`), `useQuickAdd(cardId, qty, wanted)` fällt auf erste Variante zurück; `AddCardSheet` merkt `lastVariant`.

**Offen**
- Tester-Rückmeldung zu Scrollen (`overflow-x: clip`) und Variantenanzeige abwarten.
- Fehlende deutsche Bilder (Grundset-Glurak, 30th-c) liegen an TCGdex.
- Weitere Klassische-Sammlung-Neuauflagen in `REPRINTS` ergänzen, falls gedruckte Nummern bekannt.
- `/code-review` für die Commits seit 2026-10-16 nicht gelaufen.

**Learnings**
- TCGdex liefert zeitweise 503 (Ausfall Dritter): bei leeren Live-Tests erst `curl`-Statuscode prüfen, bevor man den eigenen Code verdächtigt.
- PWA-Nutzer sehen neue Versionen erst nach komplettem Schließen/Neuöffnen (Service Worker) – bei „funktioniert bei mir nicht“-Feedback zuerst Versionsstand klären.
- `pricing.ts`: Slab (`item.graded`) ohne Eigenpreis = kein Wert (Raw-Preis gilt nicht für Slabs).


## Stand 2026-10-19 – Einkaufs-/Rechnungs-Tracking (Planung) + 4 neue Produkte
**Stand:** 4 deutsche 30th-Celebration-Produkte als eigene Katalogeinträge angelegt (`public/custom-products.json`, IDs -22…-25; Fotos `public/custom/30th-*.jpg`, aus Nutzerfoto zugeschnitten). Preis bewusst `null` (kommt aus Rechnung). **Nicht committet/gepusht** (Frage an Nutzer offen, CI-Lauf darf nicht laufen). tsc ok, JSON gültig.

**Letzte 3 Entscheidungen**
1. Preis = `null` statt Recherche: Nutzer hat Rechnung, belegter Preis > Händler-Snippets.
2. Tin-EANs aus Position der Nutzerfotos abgeleitet (Packungen nur umgedreht, gleiche Plätze): Quajutsu = 10-10466-116 / 0196214147041, Feelinara = 10-10466-110 / 0196214146983.
3. Blister Lucario/Alola-Kokowei teilen EAN 0196214144989 → bei beiden gesetzt (Scan nimmt ersten Treffer, Lucario).

**Geplantes Feature (noch nicht in SPEC.md):** Kaufbelege lokal (IndexedDB/Dexie, Foto als Blob verkleinert). Rechnung als eigene Tabelle `invoices` (Datum, Händler, Gesamtbetrag, Foto), Produkte verweisen per `invoiceId` darauf (eine Rechnung für mehrere Produkte). Status versiegelt/geöffnet/verkauft, Dashboard investiert vs. Marktwert. Backup-Export muss Fotos einbetten (Größe!). Fragen offen: Kaufpreis auch für Einzelkarten? Mehrere Seiten pro Rechnung? Danach SPEC.md, Umsetzung in frischer Session.

**Offen:** Commit/Push der 4 Produkte, SPEC.md für Rechnungsfeature, vorher offene Punkte oben (Index-Lauf `ja:cat-*`).

**Dateien:** `src/services/catalog.ts` (`CustomProduct`, `mergeCustom`), `src/components/ProductSheet.tsx` (EAN-Lookup, `eanList`), `scripts/build-embeddings.mjs`.

**Learnings**
- `sips -c H W --cropOffset Y X in --out out` schneidet zuverlässig; Nutzerfotos sind 1512×2016, Anzeigekoordinaten ≈ ×1,008.
- Identische Barcodes bei Varianten (Lucario/Kokowei, Glumanda/Nebulak): Lookup nimmt `find` → erster Eintrag gewinnt.


## Stand 2026-10-19 (später) – Rechnungs-Feature umgesetzt (lokal committet, Push nach CI-Ende)
**Stand:** Rechnungen zu Produkten fertig. `invoices`-Tabelle (Dexie v5, Index `id, date, *refIds`), Verweise liegen an der Rechnung (`refIds` = `Product.id`, nicht am `Item`). UI: `src/components/InvoiceSheet.tsx` (`InvoiceSheet`, `ProductInvoices` im `ItemSheet`), Seite `src/pages/Invoices.tsx` (Route `/rechnungen`, Link „Belege“ in Sammlung + Profil). Backup v2 enthält `invoices` (v1 weiter importierbar). tsc ok, Vitest 63/63, Build ok, im Browser-Pane (Desktop + Mobil) geprüft; Review (7 Funde) behoben.

**Letzte 3 Entscheidungen**
1. `refIds` an der Rechnung statt `invoiceId` am Item: Items werden bei Nachkäufen zusammengeführt und beim Import neu nummeriert, `Product.id` ist stabil; ein Produkt kann an mehreren Rechnungen hängen.
2. Sheet-Stapel in `ui.tsx` (`openSheets`): nur oberstes Sheet reagiert auf Escape, Scroll-Sperre bis zum letzten – nötig wegen Rechnungsfenster im Produktfenster.
3. Fotos nur für verknüpfte Rechnungen laden (Index `*refIds`), Auswahl „Bestehende zuordnen“ lädt erst auf Klick.

**Offen:** Push (CI-Lauf vorher prüfen), echter Handytest Foto/Kamera-Dialog bei `<input type=file accept=image/*>`, Dashboard „Investiert vs. Marktwert“ nutzt weiter `Item.buyPrice` (Kaufpreis je Produkt im Produktfenster eintragen – für die 4 neuen Produkte aus der Rechnung nachtragen), optional Status versiegelt/geöffnet/verkauft.

**Learnings**
- Dexie: Indexänderung innerhalb derselben, noch unveröffentlichten Version verlangt im Dev-Browser ein `indexedDB.deleteDatabase('sammelmappe')`.
- `form_input` im Browser-Pane löst bei Checkboxen kein React-onChange aus → echte Klicks (`computer left_click`) nutzen.
- `toISOString().slice(0,10)` ist UTC → `localDateIso()` in `src/lib/format.ts`.

- Nachtrag: `addProductTx` erkennt Katalogprodukte jetzt zuerst über `catalogId` (nicht EAN); Varianten mit gleicher EAN (Lucario/Alola-Kokowei) bekommen eigene Produkt-ID (`ean-…-<catalogId>`), sonst hätte die zweite Variante die erste überschrieben. Escape-Stapel als `useLayer` in `ui.tsx` (Sheet + Lightbox).

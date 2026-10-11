# Sammelmappe – Pokémon-Sammlung (DE)

Deutsche Karten & Produkte scannen, Sammlung tracken, Cardmarket-Richtwerte (EUR) immer aktuell.

**Online:** https://anlactrieu.github.io/sammelmappe/ (GitHub Pages, Kamera ohne Zertifikatswarnung, als App installierbar). Ein täglicher Job (`.github/workflows/deploy.yml`, 21:30 UTC) erneuert den Produktkatalog und veröffentlicht neu.

```bash
npm install
npm run dev:https   # HTTPS nötig für die Handykamera (Zertifikatswarnung einmal bestätigen), Adresse im WLAN öffnen
npm test            # Vitest
npm run build       # Produktions-Build (PWA)
```
- Preise: TCGdex (Cardmarket EUR), Auto-Update bei App-Start/Rückkehr wenn >24 h, manuell per „Preise aktualisieren“.
- Daten liegen lokal (IndexedDB). Backup: Profil → JSON/CSV.
- Foto-Scan: ein Foto von Karte oder Produkt (Kamera oder Galerie) – die App erkennt es per Bildvergleich in allen Sprachen, plus Barcode im Bild. Fallback: Namenssuche / „Schnell erfassen“. Technik: siehe ARCHITEKTUR.md.

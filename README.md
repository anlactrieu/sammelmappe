# Sammelmappe – Pokémon-Sammlung (DE)

Deutsche Karten & Produkte scannen, Sammlung tracken, Cardmarket-Richtwerte (EUR) immer aktuell.

```bash
npm install
npm run dev:https   # HTTPS nötig für die Handykamera (Zertifikatswarnung einmal bestätigen), Adresse im WLAN öffnen
npm test            # Vitest
npm run build       # Produktions-Build (PWA)
```
- Preise: TCGdex (Cardmarket EUR), Auto-Update bei App-Start/Rückkehr wenn >24 h, manuell per „Preise aktualisieren“.
- Daten liegen lokal (IndexedDB). Backup: Profil → JSON/CSV.
- Karten-Scan: Kartennummer unten am Rand („025/198“) muss im Rahmen lesbar sein; Fallback: Nummer eintippen oder Namenssuche.

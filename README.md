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

## Lizenz und Hinweise

Der Quellcode steht unter der [MIT-Lizenz](LICENSE). Die App ist kostenlos, werbefrei und speichert die Sammlung nur lokal auf dem Gerät.

**Nicht enthalten in der Lizenz:** Pokémon-Namen, Kartenbilder, Logos und Preisdaten. Sie gehören ihren jeweiligen Rechteinhabern und Datenanbietern und werden zur Laufzeit von dort geladen (TCGdex, TCGplayer über tcgcsv.com, Pokémon-Daten von PokeAPI).

Sammelmappe ist ein inoffizielles Fan-Projekt und steht in keiner Verbindung zu Nintendo, The Pokémon Company, Creatures, Game Freak, Cardmarket oder TCGplayer. Pokémon und Pokémon-Charaktere sind Marken der jeweiligen Inhaber. Preise sind unverbindliche Richtwerte.

**Datenquellen:** [TCGdex](https://tcgdex.dev) (Karten, Sets, Bilder, Cardmarket-Preisrichtwerte), [TCGplayer](https://www.tcgplayer.com) über [tcgcsv.com](https://tcgcsv.com) (Produkte, japanische Katalogkarten), [PokeAPI](https://pokeapi.co) (Namen), [Frankfurter](https://frankfurter.dev) (Wechselkurs). Schriften: Big Shoulders Display, JetBrains Mono, Schibsted Grotesk (SIL Open Font License, über `@fontsource`).

**Preisquellen und Hinweis:** Preise stammen von Cardmarket (über TCGdex) und von TCGplayer (über tcgcsv.com, bei Produkten und japanischen Katalogkarten). This product uses TCGplayer data but is not endorsed or certified by TCGplayer. Bei TCGplayer-Preisen führt in der App ein Link zur jeweiligen TCGplayer-Produktseite.

**Datenschutz:** Die Sammlung bleibt lokal im Browser. Welche Fremdserver die App anspricht, steht in der App unter Profil → Datenschutz. Schriften werden selbst ausgeliefert, nicht von Google geladen.

**Löschwünsche:** Wenn du Rechteinhaber bist und etwas entfernt haben möchtest (zum Beispiel ein Produktfoto in `public/custom/`), öffne ein [Issue](https://github.com/anlactrieu/sammelmappe/issues). Ich kümmere mich zeitnah darum.

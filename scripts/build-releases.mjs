// Erscheinungstermine für die Seite „Neuheiten“ → public/releases.json
//  - kommende/jüngste Sets (englisch + japanisch) aus tcgcsv.com (nur 2 Anfragen: Gruppenlisten)
//  - zuletzt erschienene deutsche Sets mit Datum aus TCGdex (letzte 14 Sets)
// Wird nachts mit dem Katalog gebaut (nicht bei jedem Push), eigener User-Agent, kleine Pausen.
import { writeFile } from 'node:fs/promises'

const UA = { 'User-Agent': 'Sammelmappe/0.1 (private collection tracker)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (url, headers = {}) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers }); if (r.ok) return r.json() } catch { /* retry */ } await sleep(300) } return null }

const sets = []
for (const [cat, region] of [[3, 'EN'], [85, 'JA']]) {
  await sleep(150)
  const groups = (await get(`https://tcgcsv.com/tcgplayer/${cat}/groups`, UA))?.results ?? []
  for (const g of groups) {
    // Echte Sets haben ein reines Datum; Sammelgruppen (Promos, Misc) tragen den Zeitstempel des Datenstands
    const m = /^(\d{4}-\d{2}-\d{2})T00:00:00$/.exec(g.publishedOn ?? '')
    const n = /^([A-Za-z0-9.\-]+):\s*(.+)$/.exec(g.name ?? '')
    if (!m || !n) continue
    sets.push({ code: n[1], name: n[2], date: m[1], region })
  }
}
sets.sort((a, b) => a.date.localeCompare(b.date))

const de = []
const list = (await get('https://api.tcgdex.net/v2/de/sets')) ?? []
for (const s of list.slice(-14)) {
  await sleep(60)
  const d = await get(`https://api.tcgdex.net/v2/de/sets/${encodeURIComponent(s.id)}`)
  if (d?.releaseDate) de.push({ id: d.id, name: d.name, date: d.releaseDate, cards: d.cardCount?.official ?? 0 })
}
de.sort((a, b) => a.date.localeCompare(b.date))

if (!sets.length && !de.length) { console.log('Keine Daten – bestehende releases.json bleibt'); process.exit(0) }
await writeFile(new URL('../public/releases.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), sets, de }))
console.log(`${sets.length} Sets (EN/JA), ${de.length} deutsche Sets`)

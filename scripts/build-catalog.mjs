// Erzeugt public/catalog.json: alle versiegelten Pokémon-Produkte (TCGplayer-Daten via tcgcsv.com) mit Marktpreis in USD.
// Aufruf: npm run catalog   (Node 20, kein CORS-Problem). Wird vom Browser nur als statische Datei gelesen.
import { readFile, writeFile } from 'node:fs/promises'

// Kategorie 3 = Pokémon (international/englisch), 85 = Pokémon Japan (japanische Produkte mit englischen Namen)
const CATEGORIES = [{ id: 3, region: undefined }, { id: 85, region: 'JA' }]
// Nutzungsregeln von tcgcsv.com: eigener User-Agent, 100 ms Pause je Anfrage, höchstens 1 Abruf pro Tag (Daten ändern sich nur täglich)
const UA = { 'User-Agent': 'Sammelmappe/0.1 (private collection tracker)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (url) => { for (let i = 0; i < 3; i++) { await sleep(100); try { const r = await fetch(url, { headers: UA }); if (r.ok) return (await r.json()).results } catch { /* retry */ } } return [] }

const stamp = (await (await fetch('https://tcgcsv.com/last-updated.txt', { headers: UA })).text()).trim()
const file = new URL('../public/catalog.json', import.meta.url)
// Bereits vorhandener Katalog: gleicher Datenstand → nur fehlende Kategorien nachladen (kein erneuter Komplettabruf am selben Tag)
let prev = null
try { prev = JSON.parse(await readFile(file, 'utf8')) } catch { /* noch keiner da */ }
const sameDay = prev && prev.source === stamp && !process.argv.includes('--force')
const have = sameDay ? new Set(prev.cats ?? [3]) : new Set()
const wanted = CATEGORIES.filter((c) => !have.has(c.id))
if (!wanted.length) { console.log('Katalog ist aktuell (' + stamp + ')'); process.exit(0) }

const out = sameDay ? [...prev.products] : [], groupNames = sameDay ? { ...prev.groups } : {}
for (const cat of wanted) {
  const BASE = `https://tcgcsv.com/tcgplayer/${cat.id}`
  const groups = await get(`${BASE}/groups`)
  for (const g of groups) {
    const [products, prices] = await Promise.all([get(`${BASE}/${g.groupId}/products`), get(`${BASE}/${g.groupId}/prices`)])
    const price = new Map()
    for (const p of prices) {
      const v = p.marketPrice ?? p.midPrice
      if (v != null && (!price.has(p.productId) || p.subTypeName === 'Normal')) price.set(p.productId, v)
    }
    for (const p of products) {
      const isCard = (p.extendedData ?? []).some((e) => e.name === 'Number')
      if (isCard || /^Code Card/i.test(p.name)) continue
      groupNames[g.groupId] = g.name
      out.push({ id: p.productId, g: g.groupId, n: p.name, p: price.get(p.productId) ?? null, ...(cat.region ? { l: cat.region } : {}) })
    }
  }
}
out.sort((a, b) => b.id - a.id)
await writeFile(file, JSON.stringify({ source: stamp, cats: CATEGORIES.map((c) => c.id), generatedAt: new Date().toISOString(), groups: groupNames, products: out }))
console.log(`${out.length} Produkte aus ${Object.keys(groupNames).length} Sets`)

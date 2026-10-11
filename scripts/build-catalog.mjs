// Erzeugt public/catalog.json: alle versiegelten Pokémon-Produkte (TCGplayer-Daten via tcgcsv.com) mit Marktpreis in USD.
// Aufruf: npm run catalog   (Node 20, kein CORS-Problem). Wird vom Browser nur als statische Datei gelesen.
import { readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://tcgcsv.com/tcgplayer/3'
// Nutzungsregeln von tcgcsv.com: eigener User-Agent, 100 ms Pause je Anfrage, höchstens 1 Abruf pro Tag (Daten ändern sich nur täglich)
const UA = { 'User-Agent': 'Sammelmappe/0.1 (private collection tracker)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (url) => { for (let i = 0; i < 3; i++) { await sleep(100); try { const r = await fetch(url, { headers: UA }); if (r.ok) return (await r.json()).results } catch { /* retry */ } } return [] }

const stamp = (await (await fetch('https://tcgcsv.com/last-updated.txt', { headers: UA })).text()).trim()
const file = new URL('../public/catalog.json', import.meta.url)
try { if (JSON.parse(await readFile(file, 'utf8')).source === stamp && !process.argv.includes('--force')) { console.log('Katalog ist aktuell (' + stamp + ')'); process.exit(0) } } catch { /* noch keiner da */ }

const groups = await get(`${BASE}/groups`)
const out = [], groupNames = {}
let next = 0
async function worker() {
  for (; next < groups.length; ) {
    const g = groups[next++]
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
      out.push({ id: p.productId, g: g.groupId, n: p.name, p: price.get(p.productId) ?? null })
    }
  }
}
await worker()
out.sort((a, b) => b.id - a.id)
await writeFile(file, JSON.stringify({ source: stamp, generatedAt: new Date().toISOString(), groups: groupNames, products: out }))
console.log(`${out.length} Produkte aus ${Object.keys(groupNames).length} Sets`)

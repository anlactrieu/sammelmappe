// Berechnet Bild-Vektoren (DINOv2-small, 384 Dim.) für alle Katalogprodukte → public/catalog-emb.{json,bin}.
// Damit findet die App ein Produkt anhand eines Fotos der Packung. Läuft in GitHub Actions (Linux);
// bereits berechnete Produkte werden von der veröffentlichten Seite wiederverwendet (nur neue kommen dazu).
// Aufruf: npm run embeddings
import { readFile, writeFile } from 'node:fs/promises'

const SITE = process.env.SITE_URL ?? 'https://anlactrieu.github.io/sammelmappe/'
const DIM = 384
const MODEL = 'Xenova/dinov2-small'
const UA = { 'User-Agent': 'Sammelmappe/0.1 (private collection tracker)' }
const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'))
const imageUrl = (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_400w.jpg`
// Eigene Produkte (public/custom-products.json) mit lokalem Bild in public/custom/
let custom = []
try { custom = JSON.parse(await readFile(new URL('../public/custom-products.json', import.meta.url), 'utf8')).filter((c) => c.image) } catch { /* keine */ }
catalog.products = [...custom.map((c) => ({ id: c.id, local: new URL(`../public/custom/${c.image}`, import.meta.url).pathname })), ...catalog.products]

// Vorhandene Vektoren laden (lokal, sonst von der Live-Seite)
const have = new Map()
async function loadExisting() {
  let meta, bin
  try { meta = JSON.parse(await readFile(new URL('../public/catalog-emb.json', import.meta.url), 'utf8')); bin = await readFile(new URL('../public/catalog-emb.bin', import.meta.url)) } catch { /* lokal nichts da */ }
  if (!meta) {
    try {
      const m = await fetch(SITE + 'catalog-emb.json', { headers: UA }), b = await fetch(SITE + 'catalog-emb.bin', { headers: UA })
      if (m.ok && b.ok) { meta = await m.json(); bin = Buffer.from(await b.arrayBuffer()) }
    } catch { /* offline */ }
  }
  if (!meta || meta.model !== MODEL || meta.dim !== DIM) return
  const row = 4 + DIM
  meta.ids.forEach((id, i) => { if ((i + 1) * row <= bin.length) have.set(id, bin.subarray(i * row, (i + 1) * row)) })
}
await loadExisting()
const todo = catalog.products.filter((p) => !have.has(p.id))
console.log(`${have.size} Vektoren vorhanden, ${todo.length} neu zu berechnen`)

if (todo.length) {
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('image-feature-extraction', MODEL, { dtype: 'q8' })
  let done = 0, failed = 0
  for (const p of todo) {
    try {
      const t = await extractor(p.local ?? imageUrl(p.id))
      const v = Array.from(t.data.slice(0, DIM)) // CLS-Token
      const n = Math.hypot(...v) || 1
      const max = Math.max(...v.map((x) => Math.abs(x / n))) || 1
      const row = Buffer.alloc(4 + DIM)
      row.writeFloatLE(max / 127, 0)
      v.forEach((x, i) => row.writeInt8(Math.round(x / n / (max / 127)), 4 + i))
      have.set(p.id, row)
    } catch { failed++ }
    if (++done % 200 === 0) console.log(`${done}/${todo.length} (${failed} fehlgeschlagen)`)
    await new Promise((r) => setTimeout(r, 30))
  }
  console.log(`fertig: ${done - failed} berechnet, ${failed} fehlgeschlagen`)
}

// Nur Produkte des aktuellen Katalogs behalten, in Katalogreihenfolge schreiben
const ids = catalog.products.map((p) => p.id).filter((id) => have.has(id))
const rev = Date.now().toString(36)
await writeFile(new URL('../public/catalog-emb.json', import.meta.url), JSON.stringify({ model: MODEL, dim: DIM, rev, ids }))
await writeFile(new URL('../public/catalog-emb.bin', import.meta.url), Buffer.concat(ids.map((id) => have.get(id))))
console.log(`${ids.length} Vektoren gespeichert`)

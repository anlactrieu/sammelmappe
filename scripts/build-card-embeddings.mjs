// Bild-Vektoren (DINOv2-small) für Sammelkarten aller Sprachen → cards-emb.{json,bin}.
// Damit erkennt die App eine Karte per Foto – ohne Nummer lesen zu müssen und ohne dass man die Sprache kennt.
// Läuft in GitHub Actions (cards-index.yml), setzt vorhandene Vektoren fort und arbeitet in Zeitbudget-Häppchen.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = process.env.OUT_DIR ?? 'public'
const LANGS = (process.env.LANGS ?? 'de,ja,zh-tw,en').split(',')
const MAX_MIN = Number(process.env.MAX_MINUTES ?? 300)
const PUSH = process.env.GIT_PUSH === '1'
const DIM = 384, MODEL = 'Xenova/dinov2-small', ROW = 4 + DIM
const API = 'https://api.tcgdex.net/v2'
const started = Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const key = (lang, id) => (lang === 'de' ? id : `${lang}:${id}`)
const get = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json() } catch { /* retry */ } await sleep(300) } return null }

await mkdir(OUT, { recursive: true })
const have = new Map()
if (existsSync(join(OUT, 'cards-emb.json'))) {
  const meta = JSON.parse(await readFile(join(OUT, 'cards-emb.json'), 'utf8')), bin = await readFile(join(OUT, 'cards-emb.bin'))
  if (meta.model === MODEL && meta.dim === DIM) meta.keys.forEach((k, i) => { if ((i + 1) * ROW <= bin.length) have.set(k, bin.subarray(i * ROW, (i + 1) * ROW)) })
}
console.log(`${have.size} Karten-Vektoren vorhanden`)

// Alle Karten mit Bild einsammeln
const todo = []
const enImages = new Map()
for (const s of (await get(`${API}/en/sets`)) ?? []) {
  await sleep(40)
  for (const c of (await get(`${API}/en/sets/${encodeURIComponent(s.id)}`))?.cards ?? []) if (c.image) enImages.set(c.id, c.image)
}
for (const lang of LANGS) {
  const sets = (await get(`${API}/${lang}/sets`)) ?? []
  for (const s of sets) {
    await sleep(40)
    const d = await get(`${API}/${lang}/sets/${encodeURIComponent(s.id)}`)
    for (const c of d?.cards ?? []) {
      if (have.has(key(lang, c.id))) continue
      if (c.image) todo.push({ k: key(lang, c.id), url: `${c.image}/low.webp` })
      else if (lang === 'de') { // deutsche Karte ohne Bild: Bild der englischen Karte mit gleicher ID (gleiches Motiv)
        const en = enImages.get(c.id)
        if (en) todo.push({ k: key(lang, c.id), url: `${en}/low.webp` })
      }
    }
  }
  console.log(`${lang}: ${todo.length} neue Karten gesamt`)
}

// Japanische Katalogkarten (cards-ja.json von der Live-Seite): Bild von tcgplayer, Schlüssel "ja:cat-<id>"
try {
  let ja = null
  try { ja = JSON.parse(await readFile(new URL('../public/cards-ja.json', import.meta.url), 'utf8')) } catch { /* nicht lokal */ }
  if (!ja) { const r = await fetch(process.env.SITE_URL ? process.env.SITE_URL + 'cards-ja.json' : 'https://anlactrieu.github.io/sammelmappe/cards-ja.json'); if (r.ok) ja = await r.json() }
  let added = 0
  for (const c of ja?.cards ?? []) { const k = `ja:cat-${c[0]}`; if (!have.has(k)) { todo.push({ k, url: `https://tcgplayer-cdn.tcgplayer.com/product/${c[0]}_200w.jpg` }); added++ } }
  console.log(`japanische Katalogkarten: ${added} neu`)
} catch { console.log('cards-ja.json nicht verfügbar – übersprungen') }

async function save() {
  const keys = [...have.keys()]
  await writeFile(join(OUT, 'cards-emb.json'), JSON.stringify({ model: MODEL, dim: DIM, keys }))
  await writeFile(join(OUT, 'cards-emb.bin'), Buffer.concat(keys.map((k) => have.get(k))))
  if (PUSH) {
    const run = (...a) => execFileSync('git', a, { cwd: OUT, stdio: 'inherit' })
    run('add', '-A'); run('commit', '-q', '--amend', '-m', 'Karten-Index', '--allow-empty') // immer genau 1 Commit, kein Wachstum der Historie
    run('push', '-f', 'origin', 'HEAD:data')
  }
}

if (todo.length) {
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('image-feature-extraction', MODEL, { dtype: 'q8' })
  let n = 0, failed = 0
  for (const c of todo) {
    if ((Date.now() - started) / 60000 > MAX_MIN) { console.log('Zeitbudget erreicht – nächster Lauf macht weiter'); break }
    try {
      const t = await extractor(c.url)
      const v = Array.from(t.data.slice(0, DIM)), nrm = Math.hypot(...v) || 1
      const max = Math.max(...v.map((x) => Math.abs(x / nrm))) || 1
      const row = Buffer.alloc(ROW)
      row.writeFloatLE(max / 127, 0)
      v.forEach((x, i) => row.writeInt8(Math.round(x / nrm / (max / 127)), 4 + i))
      have.set(c.k, row)
    } catch { failed++ }
    if (++n % 2000 === 0) { console.log(`${n}/${todo.length} (${failed} fehlgeschlagen)`); await save() }
    await sleep(15)
  }
  console.log(`fertig: ${n - failed} berechnet, ${failed} fehlgeschlagen`)
}
await save()
console.log(`${have.size} Karten-Vektoren gespeichert`)

import type { CardRef } from '../types'
import { db } from '../db'
import type { CardBrief } from './tcgdex'

/** Japanische Einzelkarten aus dem Katalog (tcgcsv/TCGplayer JP): englischer Name, Nummer, Bild, US-Preis. Datei: cards-ja.json */
export interface JaCatalog { source: string; groups: Record<string, [string, string, string]>; cards: [number, number, string, string, number | null][] }

let cache: Promise<JaCatalog | null> | null = null
export function loadJaCards(): Promise<JaCatalog | null> {
  cache ??= fetch('./cards-ja.json').then((r) => (r.ok ? (r.json() as Promise<JaCatalog>) : null)).catch(() => null).then((c) => { if (!c) cache = null; return c })
  return cache
}

export const jaImage = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_400w.jpg`
export const catKey = (id: number) => `ja:cat-${id}`
export const isCatKey = (apiId: string) => apiId.startsWith('cat-')

/** "025/165" → "25/165" für Vergleiche (führende Nullen egal) */
const normNum = (n: string) => n.replace(/\b0+(?=\d)/g, '').toLowerCase()

export function toBrief(cat: JaCatalog, c: JaCatalog['cards'][number]): CardBrief {
  const g = cat.groups[c[1]]
  return { id: catKey(c[0]), localId: c[2].split('/')[0], name: c[3], image: jaImage(c[0]), lang: 'ja', setName: g ? `${g[1]}${g[0] ? ` (${g[0]})` : ''}` : undefined }
}

/** Suche in den japanischen Katalogkarten: Nummer ("025/165", "25/165") oder Name (englisch, mehrere Wörter UND). */
/** Schlüssel für den Abgleich mit TCGdex-Karten: "sv2a-25" */
export const dedupeKey = (cat: JaCatalog, c: JaCatalog['cards'][number]) => `${(cat.groups[c[1]]?.[0] ?? '').toLowerCase()}-${parseInt(c[2], 10)}`

export function searchJaCards(cat: JaCatalog, query: string, englishName?: string, exclude: Set<string> = new Set(), limit = 60): CardBrief[] {
  const q = query.trim().toLowerCase()
  const num = /^(\d{1,3})\s*\/\s*(\d{2,3})$/.exec(q)
  let hits: JaCatalog['cards'] = []
  if (num) {
    const want = normNum(`${num[1]}/${num[2]}`)
    hits = cat.cards.filter((c) => normNum(c[2]) === want)
  } else {
    const words = (englishName ?? q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2)
    if (!words.length) return []
    hits = cat.cards.filter((c) => { const n = c[3].toLowerCase(); return words.every((w) => n.includes(w)) })
  }
  // neuere Sets zuerst (Gruppen-Datum), Karten mit Preis vor Karten ohne
  hits = hits.filter((c) => !exclude.has(dedupeKey(cat, c)))
  hits.sort((a, b) => (cat.groups[b[1]]?.[2] ?? '').localeCompare(cat.groups[a[1]]?.[2] ?? '') || Number(b[4] != null) - Number(a[4] != null))
  return hits.slice(0, limit).map((c) => toBrief(cat, c))
}

/** Katalogkarte → CardRef (Preis in USD; wird in der Anzeige umgerechnet). */
export function jaCardRef(cat: JaCatalog, id: number): CardRef | undefined {
  const c = cat.cards.find((x) => x[0] === id)
  if (!c) return undefined
  const g = cat.groups[c[1]] ?? ['', '', '']
  return { id: catKey(id), lang: 'ja', name: c[3], localId: c[2].split('/')[0], setId: g[0] || String(c[1]), setName: `${g[1]}${g[0] ? ` (${g[0]})` : ''}`,
    setTotal: Number(c[2].split('/')[1]) || undefined, image: jaImage(id), usd: c[4] ?? undefined, priceSource: 'catalog-ja', variants: { normal: true }, priceFetchedAt: Date.parse(cat.source.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || Date.now() }
}

/** Bild der Katalogkarte zu einer TCGdex-Karte ohne Bild (gleiches Set-Kürzel und gleiche Nummer). */
const imgIndex = new WeakMap<JaCatalog, Map<string, number>>()
export function catalogImageFor(cat: JaCatalog, setId: string, localId: string): string | undefined {
  let m = imgIndex.get(cat)
  if (!m) { m = new Map(); for (const c of cat.cards) { const k = dedupeKey(cat, c); if (!m.has(k)) m.set(k, c[0]) } imgIndex.set(cat, m) }
  const id = m.get(`${setId.toLowerCase()}-${parseInt(localId, 10)}`)
  return id != null ? jaImage(id) : undefined
}

/** Einmal beim Start: gespeicherte japanische Karten ohne Bild bekommen das Katalogbild nachträglich. */
export async function backfillJaImages(): Promise<number> {
  const cat = await loadJaCards(); if (!cat) return 0
  const missing = (await db.cards.toArray()).filter((c) => c.lang === 'ja' && !c.image && !isCatKey(c.id.replace(/^ja:/, '')))
  let n = 0
  for (const c of missing) { const img = catalogImageFor(cat, c.setId, c.localId); if (img) { await db.cards.update(c.id, { image: img }); n++ } }
  return n
}

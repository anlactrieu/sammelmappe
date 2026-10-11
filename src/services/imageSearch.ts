/** Produktsuche per Foto: DINOv2-Bildvektor der Aufnahme gegen die vorberechneten Katalogbilder vergleichen. */
const DIM = 384
const MODEL = 'Xenova/dinov2-small'

/** fetch mit bis zu 3 Versuchen (wackeliges Mobilnetz: der erste Versuch schlägt oft fehl, der zweite klappt) */
async function fetchRetry(url: string, tries = 3): Promise<Response> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r; last = new Error(`HTTP ${r.status}`) } catch (e) { last = e }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)))
  }
  throw last
}

interface Index { ids: number[]; scales: Float32Array; q: Int8Array }
let indexP: Promise<Index | null> | null = null
let extractorP: Promise<(img: HTMLCanvasElement) => Promise<Float32Array>> | null = null

export function loadIndex(): Promise<Index | null> {
  indexP ??= (async () => {
    try {
      const m = await fetchRetry('./catalog-emb.json').catch(() => null)
      if (!m) return null
      const meta = (await m.json()) as { model: string; dim: number; ids: number[]; rev?: string }
      if (meta.model !== MODEL || meta.dim !== DIM) return null
      const b = await fetchRetry(`./catalog-emb.bin?rev=${meta.rev ?? ''}`).catch(() => null) // Revision im Namen: json und bin gehören immer zusammen
      if (!b) return null
      const buf = await b.arrayBuffer(), row = 4 + DIM, n = meta.ids.length
      if (buf.byteLength !== n * row) return null // exakt, sonst passt die Datei nicht zur Liste
      const scales = new Float32Array(n), q = new Int8Array(n * DIM)
      const dv = new DataView(buf), bytes = new Int8Array(buf)
      for (let i = 0; i < n; i++) { scales[i] = dv.getFloat32(i * row, true); q.set(bytes.subarray(i * row + 4, i * row + row), i * DIM) }
      return { ids: meta.ids, scales, q }
    } catch { return null }
  })().then((r) => { if (!r) indexP = null; return r })
  return indexP
}

function getExtractor(onProgress?: (pct: number) => void) {
  extractorP ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const pipe = await pipeline('image-feature-extraction', MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status?: string; progress?: number }) => { if (p.status === 'progress' && p.progress != null) onProgress?.(p.progress) },
    })
    return async (canvas: HTMLCanvasElement) => {
      const t = await pipe(canvas)
      const v = Float32Array.from((t.data as Float32Array).slice(0, DIM))
      const n = Math.hypot(...v) || 1
      return v.map((x) => x / n)
    }
  })().catch((e) => { extractorP = null; throw e })
  return extractorP
}

import { db } from '../db'

export interface ImageHit { id: number; score: number }
export interface ImageSearchResult { hits: ImageHit[]; vec: Float32Array }

/** Die ähnlichsten Katalogprodukte zu einem Foto (Katalog-IDs, bestes zuerst). `null` = Bildsuche nicht verfügbar. */
export async function searchByImage(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void, limit = 8): Promise<ImageSearchResult | null> {
  const index = await loadIndex()
  if (!index) return null
  const embed = await getExtractor(onProgress)
  const v = await embed(canvas)
  const n = index.ids.length, out: { id: number; score: number }[] = []
  for (let i = 0; i < n; i++) {
    let dot = 0; const o = i * DIM
    for (let d = 0; d < DIM; d++) dot += index.q[o + d] * v[d]
    out.push({ id: index.ids[i], score: dot * index.scales[i] })
  }
  // Vom Nutzer bestätigte Fotos (lokal gelernt) zählen mit leichtem Bonus mit
  const best = new Map(out.map((h) => [h.id, h.score]))
  for (const l of await db.learned.toArray()) {
    let dot = 0
    for (let d = 0; d < DIM; d++) dot += l.vec[d] * v[d]
    const s = dot + 0.05
    if (s > (best.get(l.catalogId) ?? -1)) best.set(l.catalogId, s)
  }
  const hits = Array.from(best, ([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, limit)
  return { hits, vec: v }
}

/** Merkt sich: dieses Foto zeigt dieses Produkt (bis zu 5 Fotos je Produkt), damit die nächste Suche es findet. */
export async function learnPhoto(catalogId: number, vec: Float32Array) {
  const mine = await db.learned.where('catalogId').equals(catalogId).toArray()
  if (mine.length >= 5 && mine[0].id != null) await db.learned.delete(mine[0].id)
  await db.learned.add({ catalogId, vec, at: Date.now() })
}

/* ---------- Karten per Foto (alle Sprachen, Index cards-emb.*) ---------- */
interface CardIndex { keys: string[]; scales: Float32Array; q: Int8Array }
let cardIndexP: Promise<CardIndex | null> | null = null

export function loadCardIndex(): Promise<CardIndex | null> {
  cardIndexP ??= (async () => {
    try {
      const [m, b] = await Promise.all([fetchRetry('./cards-emb.json').catch(() => null), fetchRetry('./cards-emb.bin').catch(() => null)])
      if (!m || !b) return null
      const meta = (await m.json()) as { model: string; dim: number; keys: string[] }
      if (meta.model !== MODEL || meta.dim !== DIM) return null
      const buf = await b.arrayBuffer(), row = 4 + DIM, n = meta.keys.length
      if (buf.byteLength < n * row) return null
      const scales = new Float32Array(n), q = new Int8Array(n * DIM)
      const dv = new DataView(buf), bytes = new Int8Array(buf)
      for (let i = 0; i < n; i++) { scales[i] = dv.getFloat32(i * row, true); q.set(bytes.subarray(i * row + 4, i * row + row), i * DIM) }
      return { keys: meta.keys, scales, q }
    } catch { return null }
  })().then((r) => { if (!r) cardIndexP = null; return r })
  return cardIndexP
}

export interface CardImageHit { key: string; score: number }
/** Die ähnlichsten Karten (Schlüssel wie "sv01-025" oder "ja:SV2a-025") zu einem Kartenfoto. `null` = Index nicht verfügbar. */
export async function searchCardsByImage(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void, limit = 8): Promise<{ hits: CardImageHit[]; vec: Float32Array } | null> {
  const index = await loadCardIndex()
  if (!index) return null
  const embed = await getExtractor(onProgress)
  const v = await embed(canvas)
  const n = index.keys.length, top: CardImageHit[] = []
  let floor = -1
  for (let i = 0; i < n; i++) {
    let dot = 0; const o = i * DIM
    for (let d = 0; d < DIM; d++) dot += index.q[o + d] * v[d]
    const score = dot * index.scales[i]
    if (top.length < limit || score > floor) {
      top.push({ key: index.keys[i], score }); top.sort((a, b) => b.score - a.score)
      if (top.length > limit) top.pop()
      floor = top[top.length - 1].score
    }
  }
  return { hits: top, vec: v }
}

/* ---------- Gemeinsame Bausteine für die Foto-Auswertung ---------- */
export async function embedCanvas(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void): Promise<Float32Array> {
  return (await getExtractor(onProgress))(canvas)
}

function topK<T extends { score: number }>(items: T[], limit: number): T[] { return items.sort((a, b) => b.score - a.score).slice(0, limit) }

/** Katalogprodukte zu einem fertigen Bildvektor (inkl. gelernter Fotos). */
export async function searchProductsByVec(v: Float32Array, limit = 8): Promise<ImageHit[] | null> {
  const index = await loadIndex()
  if (!index) return null
  const n = index.ids.length, out: ImageHit[] = []
  for (let i = 0; i < n; i++) {
    let dot = 0; const o = i * DIM
    for (let d = 0; d < DIM; d++) dot += index.q[o + d] * v[d]
    out.push({ id: index.ids[i], score: dot * index.scales[i] })
  }
  const best = new Map(out.map((h) => [h.id, h.score]))
  for (const l of await db.learned.toArray()) {
    let dot = 0
    for (let d = 0; d < DIM; d++) dot += l.vec[d] * v[d]
    if (dot + 0.05 > (best.get(l.catalogId) ?? -1)) best.set(l.catalogId, dot + 0.05)
  }
  return topK(Array.from(best, ([id, score]) => ({ id, score })), limit)
}

/** Karten (alle Sprachen) zu einem fertigen Bildvektor. */
export async function searchCardsByVec(v: Float32Array, limit = 8): Promise<CardImageHit[] | null> {
  const index = await loadCardIndex()
  if (!index) return null
  const n = index.keys.length, top: CardImageHit[] = []
  let floor = -1
  for (let i = 0; i < n; i++) {
    let dot = 0; const o = i * DIM
    for (let d = 0; d < DIM; d++) dot += index.q[o + d] * v[d]
    const score = dot * index.scales[i]
    if (top.length < limit || score > floor) { top.push({ key: index.keys[i], score }); top.sort((a, b) => b.score - a.score); if (top.length > limit) top.pop(); floor = top[top.length - 1].score }
  }
  return top
}

/** Gibt es überhaupt einen Index (Karten oder Produkte)? Dann erst lohnt sich der Modell-Download. */
export async function hasIndex(): Promise<boolean> {
  const [a, b] = await Promise.all([loadIndex(), loadCardIndex()])
  return !!(a || b)
}

let warm: Promise<void> | null = null
/** Modell und Indizes vorab laden (beim Öffnen der Foto-Seite), damit das erste Foto nicht länger braucht als das zweite. */
export function warmUp(onProgress?: (pct: number) => void): Promise<void> {
  warm ??= (async () => {
    const [a, b] = await Promise.all([loadIndex(), loadCardIndex()])
    if (a || b) await getExtractor(onProgress)
  })().catch((e) => { warm = null; throw e })
  return warm
}

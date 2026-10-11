/** Produktsuche per Foto: DINOv2-Bildvektor der Aufnahme gegen die vorberechneten Katalogbilder vergleichen. */
const DIM = 384
const MODEL = 'Xenova/dinov2-small'

interface Index { ids: number[]; scales: Float32Array; q: Int8Array }
let indexP: Promise<Index | null> | null = null
let extractorP: Promise<(img: HTMLCanvasElement) => Promise<Float32Array>> | null = null

export function loadIndex(): Promise<Index | null> {
  indexP ??= (async () => {
    try {
      const [m, b] = await Promise.all([fetch('./catalog-emb.json'), fetch('./catalog-emb.bin')])
      if (!m.ok || !b.ok) return null
      const meta = (await m.json()) as { model: string; dim: number; ids: number[] }
      if (meta.model !== MODEL || meta.dim !== DIM) return null
      const buf = await b.arrayBuffer(), row = 4 + DIM, n = meta.ids.length
      if (buf.byteLength < n * row) return null
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
      const [m, b] = await Promise.all([fetch('./cards-emb.json'), fetch('./cards-emb.bin')])
      if (!m.ok || !b.ok) return null
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

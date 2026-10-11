import { eanList, normalizeEan } from '../lib/parse'
import type { CardRef } from '../types'
import { detectEanInCanvas } from './barcode'
import { catalogEur, loadCatalog, usdToEur, type CatalogProduct } from './catalog'
import { embedCanvas, hasIndex, searchCardsByVec, searchProductsByVec } from './imageSearch'
import { fetchCard } from './tcgdex'

export interface ProductHit { p: CatalogProduct; eur: number | null; score: number }
export interface Analysis {
  ean?: string
  cards: CardRef[]
  products: ProductHit[]
  /** Was zuerst gezeigt werden soll */
  first: 'cards' | 'products'
  /** Ist der Bildindex für Karten/Produkte vorhanden? */
  index: { cards: boolean; products: boolean }
  vec?: Float32Array
}

const timeout = <T,>(p: Promise<T>, ms: number, fb: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))])

function centerCrop(src: HTMLCanvasElement, f = 0.72): HTMLCanvasElement {
  const c = document.createElement('canvas'), w = src.width * f, h = src.height * f
  c.width = Math.round(w); c.height = Math.round(h)
  c.getContext('2d')!.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, c.width, c.height)
  return c
}

/** Ein Foto auswerten: Bildvergleich (Karten + Produkte, alle Sprachen) und, falls im Bild, der Barcode. Keine Texterkennung. */
export type Kind = 'card' | 'product'

export async function analyzePhoto(photo: HTMLCanvasElement, onStatus: (s: string) => void, kind: Kind = 'product'): Promise<Analysis> {
  const wantCards = kind === 'card', wantProducts = kind === 'product'
  if (wantProducts) onStatus('Suche Barcode …')
  const eanRaw = wantProducts ? await timeout(detectEanInCanvas(photo).catch(() => null), 4000, null) : null
  const ean = eanRaw ? normalizeEan(eanRaw) : undefined

  const [cat, rate] = await Promise.all([loadCatalog(), usdToEur()])
  const byId = new Map((cat?.products ?? []).map((p) => [p.id, p]))
  const toHit = (p: CatalogProduct, score: number): ProductHit => ({ p, eur: catalogEur(p, rate), score })

  // Barcode → Produkt (eigene Liste/Katalog)
  const eanHit = ean && cat ? cat.products.find((x) => eanList(x.ean).includes(ean)) : undefined

  // Bildvergleich: ganzes Foto und zwei Bildmitten (72 % / 60 %, Karte liegt selten bildfüllend), bester Wert je Treffer zählt
  onStatus('Vergleiche mit Karten und Produkten …')
  const cardBest = new Map<string, number>(), prodBest = new Map<number, number>()
  let indexCards = false, indexProducts = false, vec: Float32Array | undefined
  try {
    if (!(await hasIndex())) throw new Error('kein Index')
    for (const img of [photo, centerCrop(photo, 0.72), centerCrop(photo, 0.6)]) {
      const v = await embedCanvas(img, (pct) => onStatus(`Lade Bilderkennung (einmalig): ${Math.round(pct)} %`))
      vec ??= v
      const [ch, ph] = await Promise.all([wantCards ? searchCardsByVec(v, 8) : null, wantProducts ? searchProductsByVec(v, 8) : null])
      if (ch) { indexCards = true; for (const h of ch) cardBest.set(h.key, Math.max(h.score, cardBest.get(h.key) ?? -1)) }
      if (ph) { indexProducts = true; for (const h of ph) prodBest.set(h.id, Math.max(h.score, prodBest.get(h.id) ?? -1)) }
    }
  } catch { /* Bilderkennung nicht verfügbar → nur Barcode/Nummer */ }

  const certain: CardRef[] = []
  const cardKeys = Array.from(cardBest, ([k, s]) => ({ k, s })).sort((a, b) => b.s - a.s).slice(0, 6)
  const known = new Set(certain.map((c) => c.id))
  const imgCards = (await Promise.all(cardKeys.filter((x) => !known.has(x.k)).map((x) => timeout(fetchCard(x.k, undefined, false), 8000, null).catch(() => null)))).filter((c): c is CardRef => !!c)
  const cards = [...certain, ...imgCards].slice(0, 8)

  const prodList = Array.from(prodBest, ([id, s]) => ({ id, s })).sort((a, b) => b.s - a.s).slice(0, 6)
    .map((x) => { const p = byId.get(x.id); return p ? toHit(p, x.s) : null }).filter((x): x is ProductHit => !!x)
  const products = eanHit ? [toHit(eanHit, 2), ...prodList.filter((x) => x.p.id !== eanHit.id)] : prodList

  // Barcode/Nummer sind eindeutig, sonst entscheidet die Bildähnlichkeit
  const first: Analysis['first'] = wantProducts ? 'products' : 'cards'
  return { ean, cards, products, first, index: { cards: indexCards, products: indexProducts }, vec }
}

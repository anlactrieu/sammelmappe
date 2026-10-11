import { getSetting, setSetting } from '../db'

export interface CatalogProduct { id: number; g: number; n: string; p: number | null; l?: string }
export interface Catalog { source: string; generatedAt: string; groups: Record<string, string>; products: CatalogProduct[] }

let cache: Promise<Catalog | null> | null = null

/** Statischer Produktkatalog (npm run catalog). Immer frisch vom Server probieren, sonst Cache. */
export function loadCatalog(force = false): Promise<Catalog | null> {
  if (!cache || force) {
    cache = fetch('./catalog.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<Catalog>) : null)).catch(() => null)
  }
  return cache
}

/** "2026-10-10T20:06:02+0000" (Safari-sicher) → ms */
export const catalogTime = (c: Catalog) => Date.parse(c.source.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || Date.parse(c.generatedAt)

export const productImage = (id: number, size: 200 | 400 = 200) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_${size}w.jpg`

/** Katalogeinträge sind englisch benannt: deutsche Begriffe auf englische Suchwörter abbilden. */
const PHRASES: [RegExp, string][] = [
  [/top[\s-]*trainer[\s-]*box|ttb/g, 'elite trainer box'], [/pokemon[\s-]*center[\s-]*top[\s-]*trainer[\s-]*box/g, 'pokemon center elite trainer box'],
  [/\d+\s*jahre?|jubil[äa]e?um/g, 'celebration'], [/booster[\s-]*display/g, 'booster box'], [/ü/g, 'u'],
]
const WORDS: Record<string, string[]> = {
  kollektion: ['collection'], display: ['display', 'booster box'], karmesin: ['scarlet'], purpur: ['violet'], schwert: ['sword'], schild: ['shield'],
  sonne: ['sun'], mond: ['moon'], prämie: ['premium'], praemie: ['premium'], mini: ['mini'], dose: ['tin'], deck: ['deck'], spiel: ['battle'],
}

export function normalizeQuery(q: string): string[][] {
  let s = q.toLowerCase().trim()
  for (const [re, rep] of PHRASES) s = s.replace(re, rep)
  return s.split(/[^a-z0-9äöüß'+]+/).filter(Boolean).map((t) => [t, ...(WORDS[t] ?? [])])
}

export function searchCatalog(cat: Catalog, query: string, limit = 40): CatalogProduct[] {
  const tokens = normalizeQuery(query)
  if (!tokens.length) return []
  const scored: { p: CatalogProduct; s: number }[] = []
  for (const p of cat.products) {
    const hay = `${p.n} ${cat.groups[p.g] ?? ''}`.toLowerCase()
    if (!tokens.every((alts) => alts.some((a) => hay.includes(a)))) continue
    const name = p.n.toLowerCase()
    const inName = tokens.filter((alts) => alts.some((a) => name.includes(a))).length
    scored.push({ p, s: inName * 100 - p.n.length + (p.p != null ? 5 : 0) - (/ case\b/i.test(p.n) ? 30 : 0) + p.id / 1e7 })
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p)
}

const STOP = new Set(['pokemon', 'pokémon', 'tcg', 'karten', 'sammelkartenspiel', 'trading', 'card', 'game', 'the', 'und', 'mit', 'für', 'fur', 'von', 'der', 'die', 'das', 'ein', 'alter', 'ab', 'jahren', 'enthält', 'enthalt', 'inhalt', 'zufällige', 'inhalte'])

/** Lose Suche für Packungstext aus einem Foto: Rauschen und Füllwörter ignorieren, möglichst viele Wörter treffen. */
export function searchLoose(cat: Catalog, texts: string[], limit = 12): CatalogProduct[] {
  const tokens = normalizeQuery(texts.join(' ')).filter(([t]) => !STOP.has(t) && (t.length >= 3 || /^\d+$/.test(t)))
  const uniq = Array.from(new Map(tokens.map((a) => [a[0], a])).values())
  if (!uniq.length) return []
  const need = uniq.length >= 2 ? 2 : 1
  const scored: { p: CatalogProduct; s: number }[] = []
  for (const p of cat.products) {
    const name = `${p.n} ${cat.groups[p.g] ?? ''}`.toLowerCase()
    const hit = uniq.filter((alts) => alts.some((a) => name.includes(a))).length
    if (hit < need) continue
    scored.push({ p, s: hit * 100 - p.n.length - (/ case\b/i.test(p.n) ? 30 : 0) + (p.p != null ? 5 : 0) })
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p)
}

/** USD→EUR (EZB-Referenzkurs via frankfurter), 24 h gecacht, mit Rückfallwert. */
export async function usdToEur(): Promise<number> {
  const saved = await getSetting<{ rate: number; at: number } | null>('fx', null)
  if (saved && Date.now() - saved.at < 24 * 3600e3) return saved.rate
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR')
    const rate = (await r.json()).rates?.EUR as number
    if (rate > 0) { await setSetting('fx', { rate, at: Date.now() }); return rate }
  } catch { /* offline */ }
  return saved?.rate ?? 0.89
}

export const toEur = (usd: number, rate: number) => Math.round(usd * rate * 100) / 100

/** Passenden Produkttyp aus dem englischen Katalognamen ableiten. */
export function guessType(name: string): 'Booster' | 'Display' | 'Top-Trainer-Box' | 'Kollektion' | 'Deck' | 'Tin' | 'Sonstiges' {
  const n = name.toLowerCase()
  if (/elite trainer/.test(n)) return 'Top-Trainer-Box'
  if (/booster box|display|\bcase\b/.test(n)) return 'Display'
  if (/\btin\b/.test(n)) return 'Tin'
  if (/deck/.test(n)) return 'Deck'
  if (/collection|box|bundle|blister/.test(n)) return /bundle|blister|pack/.test(n) ? 'Booster' : 'Kollektion'
  if (/pack/.test(n)) return 'Booster'
  return 'Sonstiges'
}

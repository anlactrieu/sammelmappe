import { db, getSetting, setSetting } from '../db'
import type { CardRef, CardmarketPrice, SetRef } from '../types'
import { normalizeLocalId } from '../lib/parse'

const API = 'https://api.tcgdex.net/v2/de'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal })
  if (!res.ok) throw new Error(`TCGdex ${res.status}`)
  return res.json() as Promise<T>
}

export const imageUrl = (base: string | undefined, size: 'low' | 'high' = 'low') => (!base ? '' : /^data:|\.(jpe?g|png|webp)$/.test(base) ? base : `${base}/${size}.webp`)

interface RawCm {
  updated?: string; avg?: number; low?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number
  'avg-holo'?: number; 'low-holo'?: number; 'trend-holo'?: number; 'avg1-holo'?: number; 'avg7-holo'?: number; 'avg30-holo'?: number
}
interface RawCard {
  id: string; localId: string; name: string; image?: string; rarity?: string
  set?: { id: string; name: string; cardCount?: { official?: number; total?: number } }
  variants?: { normal?: boolean; holo?: boolean; reverse?: boolean; firstEdition?: boolean }
  pricing?: { cardmarket?: RawCm | null }
}

export function mapCardmarket(cm?: RawCm | null): CardmarketPrice | undefined {
  if (!cm) return undefined
  return {
    updated: cm.updated ?? new Date().toISOString(),
    avg: cm.avg, low: cm.low, trend: cm.trend, avg1: cm.avg1, avg7: cm.avg7, avg30: cm.avg30,
    avgHolo: cm['avg-holo'], lowHolo: cm['low-holo'], trendHolo: cm['trend-holo'],
    avg1Holo: cm['avg1-holo'], avg7Holo: cm['avg7-holo'], avg30Holo: cm['avg30-holo'],
  }
}

export function mapCard(raw: RawCard): CardRef {
  return {
    id: raw.id, name: raw.name, localId: raw.localId,
    setId: raw.set?.id ?? raw.id.split('-')[0], setName: raw.set?.name ?? '',
    image: raw.image, rarity: raw.rarity, setTotal: raw.set?.cardCount?.official,
    variants: raw.variants, cm: mapCardmarket(raw.pricing?.cardmarket), priceFetchedAt: Date.now(),
  }
}

/** Volle Karte inkl. Preisen laden und im Katalog cachen. */
export async function fetchCard(id: string, signal?: AbortSignal, persist = true): Promise<CardRef> {
  const card = mapCard(await get<RawCard>(`/cards/${encodeURIComponent(id)}`, signal))
  if (!persist) return card
  const old = await db.cards.get(id)
  // Liefert die API einmal keinen Preis, den zuletzt bekannten behalten
  if (!card.cm && old?.cm) card.cm = old.cm
  await db.cards.put(card)
  return card
}

export async function getCard(id: string): Promise<CardRef | undefined> {
  return (await db.cards.get(id)) ?? fetchCard(id).catch(() => undefined)
}

export interface CardBrief { id: string; localId: string; name: string; image?: string }

export async function searchCards(query: string, signal?: AbortSignal): Promise<CardBrief[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const list = await get<CardBrief[]>(`/cards?name=${encodeURIComponent(q)}`, signal)
  const rank = (n: string) => (n.toLowerCase() === q.toLowerCase() ? 0 : n.toLowerCase().startsWith(q.toLowerCase()) ? 1 : 2)
  return [...list].sort((a, b) => rank(a.name) - rank(b.name))
}

export async function loadSets(force = false): Promise<SetRef[]> {
  const cached = await db.sets.toArray()
  if (cached.length && !force) {
    // Stale-While-Revalidate: neue Sets höchstens alle 7 Tage nachladen
    getSetting<number>('setsFetchedAt', 0).then((t) => { if (Date.now() - t > 7 * 864e5 && navigator.onLine) loadSets(true).catch(() => undefined) })
    return cached
  }
  try {
    const raw = await get<{ id: string; name: string; logo?: string; symbol?: string; cardCount: { total: number; official: number } }[]>('/sets')
    const sets: SetRef[] = raw.map((s) => ({ id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, total: s.cardCount.total, official: s.cardCount.official }))
    await db.sets.bulkPut(sets)
    await setSetting('setsFetchedAt', Date.now())
    return sets
  } catch (e) {
    if (cached.length) return cached
    throw e
  }
}

export async function fetchSetCards(setId: string): Promise<{ set: SetRef; cards: CardBrief[] }> {
  const raw = await get<{ id: string; name: string; logo?: string; symbol?: string; abbreviation?: string; releaseDate?: string
    cardCount: { total: number; official: number }; cards: CardBrief[] }>(`/sets/${encodeURIComponent(setId)}`)
  const set: SetRef = { id: raw.id, name: raw.name, logo: raw.logo, symbol: raw.symbol, abbreviation: raw.abbreviation,
    releaseDate: raw.releaseDate, total: raw.cardCount.total, official: raw.cardCount.official }
  await db.sets.put(set)
  return { set, cards: raw.cards }
}

/**
 * Kandidaten für eine gescannte Kartennummer ("025/198"): alle Sets mit passender Kartenzahl,
 * dann die Karte mit dieser Nummer laden. Namensfragmente aus dem OCR-Text sortieren Treffer nach vorn.
 */
export async function resolveByNumber(number: string, totals: number[] | undefined, words: string[]): Promise<CardRef[]> {
  const sets = await loadSets()
  const hay = words.join(' ')
  // Erster Kandidat mit passendem Set gewinnt (z. B. 165 vor 16)
  const match = (totals ?? []).map((t) => sets.filter((s) => s.official === t || s.total === t)).find((l) => l.length) ?? []
  const candidates = [...match].reverse() // API: älteste zuerst
    .sort((a, b) => Number(hay.includes(b.name.toLowerCase())) - Number(hay.includes(a.name.toLowerCase())) || (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  const ids = new Set([number, normalizeLocalId(number), number.padStart(3, '0')])
  const found: CardRef[] = []
  await Promise.all(candidates.slice(0, 16).map(async (s) => {
    for (const lid of ids) {
      try { found.push(await fetchCard(`${s.id}-${lid}`, undefined, false)); return } catch { /* nächste Schreibweise */ }
    }
  }))
  const score = (c: CardRef) => words.filter((w) => c.name.toLowerCase().includes(w)).length
  return found.sort((a, b) => score(b) - score(a))
}

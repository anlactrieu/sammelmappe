import { db, getSetting, setSetting } from '../db'
import type { CardRef, CardmarketPrice, SetRef } from '../types'
import { normalizeLocalId, totalVariants } from '../lib/parse'

import { cardKey, parseKey, type Lang } from '../lib/lang'
import { attachGermanName, dexNames } from './names'

const apiBase = (lang: Lang) => `https://api.tcgdex.net/v2/${lang}`

async function get<T>(path: string, lang: Lang = 'de', signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase(lang)}${path}`, { signal })
  if (!res.ok) throw new Error(`TCGdex ${res.status}`)
  return res.json() as Promise<T>
}

export const imageUrl = (base: string | undefined, size: 'low' | 'high' = 'low') => (!base ? '' : /^data:|\.(jpe?g|png|webp)$/.test(base) ? base : `${base}/${size}.webp`)

interface RawCm {
  updated?: string; avg?: number; low?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number
  'avg-holo'?: number; 'low-holo'?: number; 'trend-holo'?: number; 'avg1-holo'?: number; 'avg7-holo'?: number; 'avg30-holo'?: number
}
interface RawCard {
  id: string; localId: string; name: string; image?: string; rarity?: string; dexId?: number[]
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

export function mapCard(raw: RawCard, lang: Lang = 'de'): CardRef {
  return {
    id: cardKey(lang, raw.id), lang: lang === 'de' ? undefined : lang, name: raw.name, localId: raw.localId,
    setId: raw.set?.id ?? raw.id.split('-')[0], setName: raw.set?.name ?? '', dexId: raw.dexId?.[0],
    image: raw.image, rarity: raw.rarity, setTotal: raw.set?.cardCount?.official,
    variants: raw.variants, cm: mapCardmarket(raw.pricing?.cardmarket), priceFetchedAt: Date.now(),
  }
}

/** Volle Karte inkl. Preisen laden und im Katalog cachen. `key` = Karten-Schlüssel (de roh, sonst "ja:SV2a-025"). */
export async function fetchCard(key: string, signal?: AbortSignal, persist = true): Promise<CardRef> {
  const { lang, apiId } = parseKey(key)
  let card = mapCard(await get<RawCard>(`/cards/${encodeURIComponent(apiId)}`, lang, signal), lang)
  const old = await db.cards.get(key)
  card.nameDe = old?.nameDe
  card = await attachGermanName(card)
  if (!persist) return card
  // Liefert die API einmal keinen Preis, den zuletzt bekannten behalten
  if (!card.cm && old?.cm) card.cm = old.cm
  await db.cards.put(card)
  return card
}

export async function getCard(id: string): Promise<CardRef | undefined> {
  return (await db.cards.get(id)) ?? fetchCard(id).catch(() => undefined)
}

export interface CardBrief { id: string; localId: string; name: string; image?: string; lang?: Lang }

const rankBy = (q: string) => (n: string) => (n.toLowerCase() === q.toLowerCase() ? 0 : n.toLowerCase().startsWith(q.toLowerCase()) ? 1 : 2)
const withLang = (list: CardBrief[], lang: Lang): CardBrief[] => list.map((c) => ({ ...c, id: cardKey(lang, c.id), lang }))

/** Pokémon-Name → Pokédex-Nr. (über deutsche, sonst englische Kartensuche), dann Name in der Zielsprache. */
async function translateName(q: string, target: Lang, signal?: AbortSignal): Promise<string[]> {
  for (const src of ['de', 'en'] as Lang[]) {
    const brief = (await get<CardBrief[]>(`/cards?name=${encodeURIComponent(q)}`, src, signal).catch(() => []))[0]
    if (!brief) continue
    const raw = await get<RawCard>(`/cards/${encodeURIComponent(brief.id)}`, src, signal).catch(() => null)
    const dex = raw?.dexId?.[0]
    if (!dex) continue
    const n = await dexNames(dex)
    const name = target === 'ja' ? n?.ja : target === 'zh-tw' ? n?.zhTw : target === 'zh-cn' ? n?.zhCn : n?.en
    if (name) return [name]
  }
  return []
}

/** Kartensuche je Sprache. Fremdsprachig: deutscher/englischer Name wird über die Pokédex-Nr. übersetzt. */
export async function searchCards(query: string, lang: Lang = 'de', signal?: AbortSignal): Promise<CardBrief[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const direct = async (name: string) => withLang(await get<CardBrief[]>(`/cards?name=${encodeURIComponent(name)}`, lang, signal), lang)
  let list: CardBrief[] = []
  const latin = /^[\p{L}\p{N} .'’:&é-]+$/u.test(q) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(q)
  if (lang === 'de' || !latin) list = await direct(q).catch(() => [])
  else {
    const [name] = await translateName(q, lang, signal)
    list = name ? await direct(name).catch(() => []) : []
    if (!list.length && lang === 'en') list = await direct(q).catch(() => [])
  }
  const rank = rankBy(q)
  return [...list].sort((a, b) => rank(a.name) - rank(b.name))
}

export async function loadSets(lang: Lang = 'de', force = false): Promise<SetRef[]> {
  const cached = (await db.setcache.toArray()).filter((x) => x.lang === lang)
  const stampKey = `setsFetchedAt:${lang}`
  if (cached.length && !force) {
    // Stale-While-Revalidate: neue Sets höchstens alle 7 Tage nachladen
    getSetting<number>(stampKey, 0).then((t) => { if (Date.now() - t > 7 * 864e5 && navigator.onLine) loadSets(lang, true).catch(() => undefined) })
    return cached
  }
  try {
    const raw = await get<{ id: string; name: string; logo?: string; symbol?: string; cardCount: { total: number; official: number } }[]>('/sets', lang)
    const sets: SetRef[] = raw.map((s) => ({ key: `${lang}/${s.id}`, lang, id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, total: s.cardCount.total, official: s.cardCount.official }))
    await db.setcache.bulkPut(sets)
    await setSetting(stampKey, Date.now())
    return sets
  } catch (e) {
    if (cached.length) return cached
    throw e
  }
}

export async function fetchSetCards(lang: Lang, setId: string): Promise<{ set: SetRef; cards: CardBrief[] }> {
  const raw = await get<{ id: string; name: string; logo?: string; symbol?: string; abbreviation?: string; releaseDate?: string
    cardCount: { total: number; official: number }; cards: CardBrief[] }>(`/sets/${encodeURIComponent(setId)}`, lang)
  const set: SetRef = { key: `${lang}/${raw.id}`, lang, id: raw.id, name: raw.name, logo: raw.logo, symbol: raw.symbol, abbreviation: raw.abbreviation,
    releaseDate: raw.releaseDate, total: raw.cardCount.total, official: raw.cardCount.official }
  await db.setcache.put(set)
  return { set, cards: withLang(raw.cards, lang) }
}

/**
 * Kandidaten für eine gescannte Kartennummer ("025/198"): alle Sets mit passender Kartenzahl,
 * dann die Karte mit dieser Nummer laden. Namensfragmente aus dem OCR-Text sortieren Treffer nach vorn.
 */
export async function resolveByNumber(number: string, totals: number[] | undefined, words: string[], lang: Lang = 'de'): Promise<CardRef[]> {
  const sets = await loadSets(lang)
  const hay = words.join(' ')
  const ids = new Set([number, normalizeLocalId(number), number.padStart(3, '0')])
  // Gesamtzahlen der Reihe nach probieren (erst gelesen, dann typische Verwechslungen); erster Treffer gewinnt
  const totalsToTry = Array.from(new Set((totals ?? []).flatMap((t) => totalVariants(t)))).slice(0, 8)
  let found: CardRef[] = []
  for (const t of totalsToTry) {
    const match = sets.filter((s) => s.official === t || s.total === t)
    if (!match.length) continue
    const candidates = [...match].reverse() // API: älteste zuerst
      .sort((a, b) => Number(hay.includes(b.name.toLowerCase())) - Number(hay.includes(a.name.toLowerCase())) || (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    const hit: CardRef[] = []
    await Promise.all(candidates.slice(0, 16).map(async (s) => {
      for (const lid of ids) {
        try { hit.push(await fetchCard(cardKey(lang, `${s.id}-${lid}`), undefined, false)); return } catch { /* nächste Schreibweise */ }
      }
    }))
    if (hit.length) { found = hit; break }
  }
  const score = (c: CardRef) => words.filter((w) => c.name.toLowerCase().includes(w)).length
  return found.sort((a, b) => score(b) - score(a))
}

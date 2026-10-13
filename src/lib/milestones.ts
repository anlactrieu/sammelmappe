import { db } from '../db'
import type { CardRef, Variant } from '../types'

/** Grundset: nur Nummern ≤ offizielle Kartenzahl (ohne Secret Rares). */
export const inBaseId = (localId: string, official: number) => /^\d+$/.test(localId) && parseInt(localId, 10) <= official

export const HIGHLIGHT_EUR = 20
const HIGHLIGHT_RARITY = /ultra|secret|illustration|hyper|rainbow|gold|special|shiny|mega|vmax|vstar|ace spec/i
const COUNT_STEPS = [10, 25, 50, 100, 250, 500, 1000]
const SET_STEPS = [25, 50, 75, 100]

/** Zustand der Sammlung für eine Karte (vor/nach dem Hinzufügen) */
export interface Stats { total: number; setOwned: number; cardQty: number; hasHolo: boolean }
export interface Milestone { kind: 'count' | 'set' | 'holo'; title: string; sub?: string }

export function isHighlight(card: Pick<CardRef, 'rarity'>, unitEur: number | null): boolean {
  return (unitEur != null && unitEur >= HIGHLIGHT_EUR) || (!!card.rarity && HIGHLIGHT_RARITY.test(card.rarity))
}

/** Höchster neu erreichter Meilenstein (Set > Gesamtzahl > erstes Holo) oder null. */
export function findMilestone(before: Stats, after: Stats, card: Pick<CardRef, 'setName' | 'setTotal'>, variant: Variant): Milestone | null {
  const T = card.setTotal
  if (T && T > 0 && after.setOwned > before.setOwned) {
    const pct = (n: number) => Math.floor((n / T) * 100)
    const hit = SET_STEPS.filter((s) => pct(before.setOwned) < s && pct(after.setOwned) >= s).pop()
    if (hit) return hit === 100
      ? { kind: 'set', title: 'Set komplett!', sub: `${card.setName}: alle ${T} Karten` }
      : { kind: 'set', title: `${hit} % vom Set`, sub: `${card.setName}: ${after.setOwned}/${T}` }
  }
  const c = COUNT_STEPS.filter((s) => before.total < s && after.total >= s).pop()
  if (c) return { kind: 'count', title: `${c}. Karte!`, sub: 'Deine Sammlung wächst' }
  if (!before.hasHolo && after.hasHolo && (variant === 'holo' || variant === 'reverse')) return { kind: 'holo', title: 'Erste Holo-Karte!' }
  return null
}

/** Sammlungsstand aus Dexie: Stückzahl gesamt, verschiedene Karten im Set, Menge dieser Karte, Holo vorhanden. */
export async function collectionStats(card: CardRef): Promise<Stats> {
  const items = (await db.items.toArray()).filter((i) => i.kind === 'card')
  const lang = card.lang ?? 'de'
  // nur Grundset zählen (wie die Sets-Seite), sonst überschreiten Secret Rares die offizielle Kartenzahl
  const base = new Set((await db.cards.where('setId').equals(card.setId).toArray())
    .filter((c) => (c.lang ?? 'de') === lang && (!card.setTotal || inBaseId(c.localId, card.setTotal))).map((c) => c.id))
  const inSet = new Set(items.filter((i) => base.has(i.refId)).map((i) => i.refId))
  return {
    total: items.reduce((s, i) => s + i.qty, 0),
    setOwned: inSet.size,
    cardQty: items.filter((i) => i.refId === card.id).reduce((s, i) => s + i.qty, 0),
    hasHolo: items.some((i) => i.variant === 'holo' || i.variant === 'reverse'),
  }
}

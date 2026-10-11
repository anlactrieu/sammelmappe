import type { CardRef, Condition, Item, Product, UnitPrice, Variant } from '../types'

export const STALE_MS = 7 * 24 * 3600 * 1000
export const CONDITIONS: Condition[] = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']
export const CONDITION_LABEL: Record<Condition, string> = {
  M: 'Mint', NM: 'Near Mint', EX: 'Excellent', GD: 'Good', LP: 'Light Played', PL: 'Played', PO: 'Poor',
}
/** Cardmarket-Preise gelten für NM; Abschläge sind Schätzwerte. */
export const CONDITION_FACTOR: Record<Condition, number> = { M: 1, NM: 1, EX: 0.85, GD: 0.7, LP: 0.6, PL: 0.4, PO: 0.25 }
export const VARIANT_LABEL: Record<Variant, string> = { normal: 'Normal', holo: 'Holo', reverse: 'Reverse Holo', firstEdition: '1. Edition' }

const r2 = (n: number) => Math.round(n * 100) / 100

const pos = (n?: number | null) => (n != null && n > 0 ? n : undefined)

/**
 * Basispreis (NM) einer Karte je Variante. Cardmarket führt das Hauptprodukt (Normal bzw. Holo bei Holo-only-Karten)
 * unter trend/avg/low und die Reverse-Holo-Version unter den "-holo"-Feldern; 0 oder null heißt "kein Preis".
 */
export function cardBasePrice(card: CardRef, variant: Variant): { value: number; estimated: boolean } | null {
  const cm = card.cm
  if (!cm) return null
  const main = pos(cm.trend) ?? pos(cm.avg) ?? pos(cm.low)
  const rev = pos(cm.trendHolo) ?? pos(cm.avgHolo) ?? pos(cm.lowHolo)
  if (variant === 'reverse') {
    if (rev != null) return { value: rev, estimated: false }
    return main != null ? { value: main, estimated: true } : null
  }
  if (variant === 'normal' || variant === 'holo') {
    if (main != null) return { value: main, estimated: false }
    return rev != null ? { value: rev, estimated: true } : null
  }
  // 1. Edition: kein eigener API-Preis → Näherung über Hauptpreis, klar als Schätzung markiert
  const base = main ?? rev
  return base != null ? { value: base, estimated: true } : null
}

export function unitPrice(item: Item, card?: CardRef, product?: Product, now = Date.now()): UnitPrice {
  if (item.manualPrice != null) return { value: item.manualPrice, source: 'manual', updatedAt: item.manualPriceAt }
  if (item.kind === 'product') {
    if (product?.price == null) return { value: null, source: 'none' }
    const cat = product.priceSource === 'catalog'
    return { value: product.price, source: cat ? 'catalog' : 'product', estimated: cat, updatedAt: product.priceUpdated, stale: product.priceUpdated ? now - product.priceUpdated > STALE_MS : false }
  }
  if (!card) return { value: null, source: 'none' }
  const base = cardBasePrice(card, item.variant)
  if (!base) return { value: null, source: 'none' }
  const gradedNoManual = !!item.graded
  const factor = item.graded ? 1 : CONDITION_FACTOR[item.condition]
  const updatedAt = card.cm?.updated ? Date.parse(card.cm.updated) : card.priceFetchedAt
  return {
    value: r2(base.value * factor),
    source: 'cardmarket',
    updatedAt,
    estimated: base.estimated || factor !== 1 || gradedNoManual,
    stale: updatedAt ? now - updatedAt > STALE_MS : true,
  }
}

export interface Totals { value: number; cost: number; count: number; missing: number }
export function totals(rows: { item: Item; price: UnitPrice }[]): Totals {
  let value = 0, cost = 0, count = 0, missing = 0
  for (const { item, price } of rows) {
    count += item.qty
    cost += (item.buyPrice ?? 0) * item.qty
    if (price.value == null) missing += item.qty
    else value += price.value * item.qty
  }
  return { value: r2(value), cost: r2(cost), count, missing }
}

/** Preisänderung in % von avg7 bzw. avg30 zum aktuellen Trend. */
export function priceChange(card: CardRef, days: 7 | 30, holo = false): number | null {
  const cm = card.cm
  if (!cm) return null
  const now = pos(holo ? cm.trendHolo : cm.trend)
  const then = pos(holo ? (days === 7 ? cm.avg7Holo : cm.avg30Holo) : (days === 7 ? cm.avg7 : cm.avg30))
  if (now == null || then == null) return null
  return ((now - then) / then) * 100
}

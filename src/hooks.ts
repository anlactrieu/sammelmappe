import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from './db'
import { totals, unitPrice } from './lib/pricing'
import { cardNames } from './services/names'
import { langTag } from './lib/lang'
import type { CardRef, Item, Product, UnitPrice } from './types'

export interface Row { item: Item; card?: CardRef; product?: Product; price: UnitPrice; name: string; sub: string; image?: string; tag?: string }

export function useCollection() {
  const items = useLiveQuery(() => db.items.orderBy('addedAt').reverse().toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const ready = !!(items && cards && products)
  const rows = useMemo<Row[]>(() => {
    if (!items || !cards || !products) return []
    const cm = new Map(cards.map((c) => [c.id, c])), pm = new Map(products.map((p) => [p.id, p]))
    return items.map((item) => {
      const card = cm.get(item.refId), product = pm.get(item.refId)
      return {
        item, card, product, price: unitPrice(item, card, product),
        name: card ? cardNames(card).name : product?.name ?? 'Unbekannt',
        tag: card ? (card.lang ? langTag(card.lang) : undefined) : product?.region && product.region !== 'DE' ? product.region : undefined,
        sub: card ? `${cardNames(card).alt ? cardNames(card).alt + ' · ' : ''}${card.setName} · ${card.localId}${card.setTotal ? '/' + card.setTotal : ''}` : (product?.type ?? ''),
        image: card?.image ?? product?.image,
      }
    })
  }, [items, cards, products])
  const sum = useMemo(() => totals(rows), [rows])
  return { rows, totals: sum, ready }
}

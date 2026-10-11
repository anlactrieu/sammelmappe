import { db } from '../db'
import type { CardRef, Condition, Item, Product, ProductType, Variant } from '../types'

export interface AddOpts { qty: number; condition: Condition; variant: Variant; language: string; buyPrice?: number; manualPrice?: number; graded?: Item['graded'] }

/** Karte hinzufügen; identische Exemplare (gleiche Variante/Zustand/Sprache, ungradet) werden zusammengeführt. */
export function addCard(card: CardRef, o: AddOpts): Promise<number> {
  return db.transaction('rw', db.cards, db.items, () => addCardTx(card, o))
}
async function addCardTx(card: CardRef, o: AddOpts): Promise<number> {
  await db.cards.put(card)
  const same = !o.graded && o.manualPrice == null
    ? (await db.items.where('refId').equals(card.id).toArray()).find(
        (i) => !i.graded && i.manualPrice == null && i.variant === o.variant && i.condition === o.condition && i.language === o.language
          && (i.buyPrice == null) === (o.buyPrice == null))
    : undefined
  if (same?.id != null) {
    const qty = same.qty + o.qty
    // gewichteter Durchschnitts-Kaufpreis nur wenn beide bekannt
    const buyPrice = same.buyPrice != null && o.buyPrice != null ? Math.round(((same.buyPrice * same.qty + o.buyPrice * o.qty) / qty) * 100) / 100 : undefined
    await db.items.update(same.id, { qty, buyPrice })
    return same.id
  }
  return db.items.add({ kind: 'card', refId: card.id, addedAt: Date.now(), manualPriceAt: o.manualPrice != null ? Date.now() : undefined, ...o })
}

export function productId(name: string, ean?: string) {
  return ean ? `ean-${ean}` : 'p-' + name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
}

export function addProduct(p: { name: string; type: ProductType; ean?: string; setName?: string; price?: number; image?: string; catalogId?: number; priceSource?: 'catalog' | 'manual'; priceUpdated?: number; region?: string }, qty: number, buyPrice?: number): Promise<number> {
  return db.transaction('rw', db.products, db.items, () => addProductTx(p, qty, buyPrice))
}
async function addProductTx(p: { name: string; type: ProductType; ean?: string; setName?: string; price?: number; image?: string; catalogId?: number; priceSource?: 'catalog' | 'manual'; priceUpdated?: number; region?: string }, qty: number, buyPrice?: number): Promise<number> {
  const existing = (p.ean ? await db.products.where('ean').equals(p.ean).first() : undefined)
    ?? (p.catalogId != null ? (await db.products.toArray()).find((x) => x.catalogId === p.catalogId) : undefined)
  const id = existing?.id ?? productId(p.name, p.ean)
  const product: Product = { ...(existing ?? {}), id, name: existing?.name ?? p.name, type: existing?.type ?? p.type, ean: p.ean ?? existing?.ean, setName: p.setName ?? existing?.setName, image: existing?.image ?? p.image, region: p.region ?? existing?.region, catalogId: p.catalogId ?? existing?.catalogId,
    // Ein vom Nutzer gesetzter Preis wird beim erneuten Hinzufügen aus dem Katalog nie überschrieben
    ...(existing?.priceSource === 'manual' && existing.price != null && p.priceSource !== 'manual'
      ? { price: existing.price, priceSource: 'manual' as const, priceUpdated: existing.priceUpdated }
      : {
        priceSource: p.price != null && p.price !== existing?.price ? p.priceSource ?? 'manual' : existing?.priceSource ?? p.priceSource,
        price: p.price ?? existing?.price, priceUpdated: p.price != null && p.price !== existing?.price ? p.priceUpdated ?? Date.now() : existing?.priceUpdated }),
    custom: true }
  await db.products.put(product)
  const item = (await db.items.where('refId').equals(id).toArray()).find((i) => (i.buyPrice == null) === (buyPrice == null))
  if (item?.id != null) {
    const q = item.qty + qty
    const bp = item.buyPrice != null && buyPrice != null ? Math.round(((item.buyPrice * item.qty + buyPrice * qty) / q) * 100) / 100 : undefined
    await db.items.update(item.id, { qty: q, buyPrice: bp }); return item.id
  }
  return db.items.add({ kind: 'product', refId: id, qty, condition: 'NM', variant: 'normal', language: 'DE', buyPrice, addedAt: Date.now() })
}

/** Produktpreis schnell aktualisieren (gilt für alle Exemplare dieses Produkts). */
/** Katalog-/Eigenes-Produkt direkt zur Sammlung (Menge, ohne Fenster). Gibt die Item-ID zurück. */
export async function addCatalogProduct(c: { id: number; n: string; l?: string; ean?: string; img?: string }, eur: number | null, qty: number, opts: { image: string; type: ProductType; priceUpdated?: number; firstEan?: string }): Promise<number> {
  return addProduct({ name: c.n, type: opts.type, ean: opts.firstEan, image: opts.image, catalogId: c.id, region: c.l ?? (c.id < 0 ? 'DE' : 'EN'),
    price: eur ?? undefined, priceSource: c.id < 0 ? 'manual' : 'catalog', priceUpdated: opts.priceUpdated }, qty)
}

/** Menge eines Items um `qty` verringern (Rückgängig); löscht bei 0. */
export async function undoItemQty(id: number, qty: number) {
  const it = await db.items.get(id)
  if (!it) return
  if (it.qty > qty) await db.items.update(id, { qty: it.qty - qty }); else await db.items.delete(id)
}

export async function setProductPrice(productId: string, price: number | undefined) {
  const cur = await db.products.get(productId)
  if (cur?.price === price) return
  await db.products.update(productId, { price, priceUpdated: price == null ? undefined : Date.now(), priceSource: price == null ? undefined : 'manual' })
}

export async function removeItem(id: number) { await db.items.delete(id) }

export const cardmarketSearchUrl = (q: string) => `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`

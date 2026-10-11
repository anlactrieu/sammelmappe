import { db, getSetting, setSetting } from '../db'
import { fetchCard } from './tcgdex'
import { catalogEur, catalogTime, loadCatalog, usdToEur } from './catalog'
import { totals, unitPrice } from '../lib/pricing'

export const SYNC_INTERVAL_MS = 24 * 3600 * 1000
export type SyncResult = { updated: number; failed: number; total: number }

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Gesamtwert der Sammlung als Tagespunkt für den Verlaufsgraph speichern. */
export async function saveSnapshot() {
  const [items, cards, products] = await Promise.all([db.items.toArray(), db.cards.toArray(), db.products.toArray()])
  const cm = new Map(cards.map((c) => [c.id, c])), pm = new Map(products.map((p) => [p.id, p]))
  const t = totals(items.map((item) => ({ item, price: unitPrice(item, cm.get(item.refId), pm.get(item.refId)) })))
  if (t.count === 0) return
  await db.snapshots.put({ date: today(), value: t.value, cost: t.cost })
}

/** Produkte mit Katalogpreis aus dem (täglich neu erzeugten) Katalog nachziehen. */
export async function syncProductPrices(): Promise<number> {
  const linked = (await db.products.toArray()).filter((p) => p.catalogId != null && p.priceSource === 'catalog')
  if (!linked.length) return 0
  const cat = await loadCatalog(true)
  if (!cat) return 0
  const rate = await usdToEur(), at = catalogTime(cat), byId = new Map(cat.products.map((c) => [c.id, c]))
  let n = 0
  for (const p of linked) {
    const c = byId.get(p.catalogId!)
    const eur = c ? catalogEur(c, rate) : null
    if (eur == null) continue
    await db.products.update(p.id, { price: eur, priceUpdated: at }); n++
  }
  return n
}

/** Alle Karten der Sammlung + Wunschliste neu laden (max. 6 parallel). */
let running: Promise<SyncResult> | null = null
export function syncPrices(onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  return (running ??= runSync(onProgress).finally(() => { running = null }))
}
async function runSync(onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  const [items, wishes] = await Promise.all([db.items.where('kind').equals('card').toArray(), db.wishlist.toArray()])
  const ids = Array.from(new Set([...items.map((i) => i.refId), ...wishes.map((w) => w.cardId)]))
  let done = 0, failed = 0
  const queue = [...ids]
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try { await fetchCard(id) } catch { failed++ }
      onProgress?.(++done, ids.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker))
  if (ids.length === 0 || failed < ids.length) await setSetting('lastSync', Date.now())
  const products = await syncProductPrices().catch(() => 0)
  await saveSnapshot()
  return { updated: ids.length - failed + products, failed, total: ids.length + products }
}

export async function syncIfDue(): Promise<SyncResult | null> {
  if (!navigator.onLine) return null
  const last = await getSetting<number>('lastSync', 0)
  if (Date.now() - last < SYNC_INTERVAL_MS) return null
  return syncPrices()
}

import { db } from '../db'
import type { CardRef, Item, Product, Snapshot, WishItem } from '../types'
import { CONDITION_LABEL, unitPrice } from '../lib/pricing'

interface BackupFile { app: 'sammelmappe'; version: 1; exportedAt: string
  items: Item[]; cards: CardRef[]; products: Product[]; wishlist: WishItem[]; snapshots: Snapshot[] }

export async function exportJson(): Promise<string> {
  const data: BackupFile = { app: 'sammelmappe', version: 1, exportedAt: new Date().toISOString(),
    items: await db.items.toArray(), cards: await db.cards.toArray(), products: await db.products.toArray(),
    wishlist: await db.wishlist.toArray(), snapshots: await db.snapshots.toArray() }
  return JSON.stringify(data)
}

export async function importJson(text: string, mode: 'merge' | 'replace' = 'replace'): Promise<number> {
  const data = JSON.parse(text) as Partial<BackupFile>
  if (data.app !== 'sammelmappe' || !Array.isArray(data.items)) throw new Error('Keine gültige Sammelmappe-Sicherung.')
  await db.transaction('rw', [db.items, db.cards, db.products, db.wishlist, db.snapshots], async () => {
    if (mode === 'replace') await Promise.all([db.items.clear(), db.wishlist.clear(), db.snapshots.clear()])
    const items = data.items!.map(({ id: _id, ...rest }) => rest as Item)
    await db.items.bulkAdd(items)
    await db.cards.bulkPut(data.cards ?? [])
    await db.products.bulkPut(data.products ?? [])
    await db.wishlist.bulkPut((data.wishlist ?? []).map(({ id: _id, ...r }) => r as WishItem)).catch(() => undefined)
    await db.snapshots.bulkPut(data.snapshots ?? [])
  })
  return data.items.length
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV mit Semikolon + deutschem Dezimalkomma (Excel DE). */
export async function exportCsv(): Promise<string> {
  const [items, cards, products] = await Promise.all([db.items.toArray(), db.cards.toArray(), db.products.toArray()])
  const cm = new Map(cards.map((c) => [c.id, c])), pm = new Map(products.map((p) => [p.id, p]))
  const num = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2).replace('.', ','))
  const head = ['Typ', 'Name', 'Set', 'Nummer', 'Menge', 'Zustand', 'Variante', 'Sprache', 'Kaufpreis', 'Einzelwert', 'Gesamtwert', 'Preisquelle']
  const rows = items.map((i) => {
    const c = cm.get(i.refId), p = pm.get(i.refId), u = unitPrice(i, c, p)
    return [i.kind === 'card' ? 'Karte' : 'Produkt', c?.name ?? p?.name ?? i.refId, c?.setName ?? p?.setName ?? '', c?.localId ?? '',
      i.qty, i.kind === 'card' ? CONDITION_LABEL[i.condition] : '', i.kind === 'card' ? i.variant : '', i.language,
      num(i.buyPrice), num(u.value), num(u.value == null ? null : u.value * i.qty), u.source].map(csvCell).join(';')
  })
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

export function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

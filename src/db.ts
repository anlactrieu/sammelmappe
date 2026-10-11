import Dexie, { type Table } from 'dexie'
import type { CardRef, Item, Product, SetRef, Setting, Snapshot, WishItem } from './types'

class AppDB extends Dexie {
  items!: Table<Item, number>
  cards!: Table<CardRef, string>
  sets!: Table<SetRef, string>
  products!: Table<Product, string>
  wishlist!: Table<WishItem, number>
  snapshots!: Table<Snapshot, string>
  settings!: Table<Setting, string>
  constructor(name = 'sammelmappe') {
    super(name)
    this.version(1).stores({
      items: '++id, kind, refId, addedAt',
      cards: 'id, setId, name',
      sets: 'id',
      products: 'id, ean, type',
      wishlist: '++id, &cardId',
      snapshots: 'date',
      settings: 'key',
    })
  }
}
export const db = new AppDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key)
  return s ? (s.value as T) : fallback
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

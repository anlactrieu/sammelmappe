import Dexie, { type Table } from 'dexie'
import type { CardRef, DexNames, Item, Product, SetRef, Setting, Snapshot, WishItem } from './types'

class AppDB extends Dexie {
  items!: Table<Item, number>
  cards!: Table<CardRef, string>
  setcache!: Table<SetRef, string>
  dex!: Table<DexNames, number>
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
    // v2: mehrsprachige Sets (Schlüssel „sprache/id“), Pokédex-Namen; alte Set-Tabelle entfällt (wird neu geladen)
    this.version(2).stores({ sets: null, setcache: 'key', dex: 'id' })
  }
}
export const db = new AppDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key)
  return s ? (s.value as T) : fallback
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

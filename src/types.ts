export type Condition = 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'
export type Variant = 'normal' | 'holo' | 'reverse' | 'firstEdition'
export type ProductType = 'Booster' | 'Display' | 'Top-Trainer-Box' | 'Kollektion' | 'Deck' | 'Tin' | 'Sonstiges'

/** Cardmarket-Preise (EUR) wie von TCGdex geliefert. */
export interface CardmarketPrice {
  updated: string
  avg?: number; low?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number
  avgHolo?: number; lowHolo?: number; trendHolo?: number; avg1Holo?: number; avg7Holo?: number; avg30Holo?: number
}

/** Zwischengespeicherte Karte (Katalog). */
export interface CardRef {
  id: string            // z. B. sv01-025
  name: string
  localId: string
  setId: string         // API-Set-ID (ohne Sprachpräfix)
  lang?: 'de' | 'en' | 'ja' | 'zh-tw' | 'zh-cn'   // fehlt = Deutsch
  nameDe?: string       // deutscher Pokémon-Name (bei fremdsprachigen Karten, über Pokédex-Nr.)
  dexId?: number
  setName: string
  image?: string        // Basis-URL ohne /low.webp
  rarity?: string
  setTotal?: number
  variants?: { normal?: boolean; holo?: boolean; reverse?: boolean; firstEdition?: boolean }
  cm?: CardmarketPrice
  priceFetchedAt?: number
}

export interface SetRef {
  key: string; lang: 'de' | 'en' | 'ja' | 'zh-tw' | 'zh-cn'
  id: string; name: string; total: number; official: number
  abbreviation?: string; logo?: string; symbol?: string; releaseDate?: string
}

export interface DexNames { id: number; v?: number; de?: string; en?: string; ja?: string; zhTw?: string; zhCn?: string }

export interface Product {
  id: string
  name: string
  type: ProductType
  ean?: string
  setName?: string
  image?: string        // Katalogbild-URL oder eigenes Foto (verkleinertes JPEG als Data-URL)
  catalogId?: number    // TCGplayer-Produkt-ID aus dem Katalog
  region?: string       // Sprache/Region der Ausgabe: DE, EN, JA, ZH, KO …
  priceSource?: 'catalog' | 'manual'
  price?: number        // aktueller Marktpreis (manuell/Katalog)
  priceUpdated?: number
  custom?: boolean
}

export interface Item {
  id?: number
  kind: 'card' | 'product'
  refId: string
  qty: number
  condition: Condition
  variant: Variant
  language: string
  graded?: { company: 'PSA' | 'CGC' | 'BGS' | 'Sonstige'; grade: string }
  buyPrice?: number     // pro Stück
  manualPrice?: number  // Override pro Stück
  manualPriceAt?: number
  notes?: string
  addedAt: number
}

export interface WishItem { id?: number; cardId: string; targetPrice?: number; addedAt: number }

export interface Snapshot { date: string; value: number; cost: number }

export interface Setting { key: string; value: unknown }

export type PriceSource = 'cardmarket' | 'manual' | 'product' | 'catalog' | 'none'
export interface UnitPrice {
  value: number | null
  source: PriceSource
  updatedAt?: number
  estimated?: boolean   // z. B. Zustandsabschlag oder Variante ohne eigenen Preis
  stale?: boolean
}

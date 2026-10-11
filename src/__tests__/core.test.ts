import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { isValidEan, normalizeLocalId, parseCardText, totalCandidates } from '../lib/parse'
import { cardBasePrice, priceChange, totals, unitPrice } from '../lib/pricing'
import { formatEur, isBadAmount, parseEur, relativeTime } from '../lib/format'
import { addCard, addProduct, setProductPrice } from '../lib/actions'
import { exportCsv, exportJson, importJson } from '../services/backup'
import { nameSuggestions } from '../lib/photo'
import { frameToVideo, numberStrips } from '../lib/strips'
import { mapCard } from '../services/tcgdex'
import { cardKey, langTag, parseKey } from '../lib/lang'
import { cardNames } from '../services/names'
import { catalogEur, catalogTime, guessType, mergeCustom, searchCatalog, searchLoose, toEur } from '../services/catalog'
import type { CardRef, Item } from '../types'

const card: CardRef = {
  id: 'sv01-025', name: 'Tentagra', localId: '025', setId: 'sv01', setName: 'Karmesin & Purpur', setTotal: 198,
  variants: { normal: true, reverse: true },
  cm: { updated: new Date().toISOString(), trend: 0.06, avg7: 0.05, avg30: 0.04, trendHolo: 0.1, avg7Holo: 0.08 },
}
const base = (o: Partial<Item> = {}): Item => ({ kind: 'card', refId: card.id, qty: 1, condition: 'NM', variant: 'normal', language: 'DE', addedAt: 1, ...o })

describe('parse', () => {
  it('liest Kartennummern', () => {
    expect(parseCardText('Tentagra KP 60\n025/198 C')).toMatchObject({ number: '025', total: 198 })
    expect(parseCardText('4/102')).toMatchObject({ number: '4', total: 102 })
    expect(parseCardText('TG05/TG30')).toMatchObject({ number: 'TG05', total: 30 })
    expect(parseCardText('kein treffer').number).toBeUndefined()
  })
  it('liest echte OCR-Ausgaben (Rarity-Symbol als Ziffer)', () => {
    expect(parseCardText('006/1654')).toMatchObject({ number: '006', total: 165 })
    expect(parseCardText('025/198\n\n0232')).toMatchObject({ number: '025', total: 198 })
    expect(parseCardText('7 006/165')).toMatchObject({ number: '006', total: 165 })
    expect(parseCardText('64/644').totals).toEqual([644, 64])
    expect(totalCandidates('198')).toEqual([198, 19])
  })
  it('sammelt Namensfragmente', () => expect(parseCardText('Glurak Feuer 120').words).toContain('glurak'))
  it('normalisiert localId', () => { expect(normalizeLocalId('025')).toBe('25'); expect(normalizeLocalId('TG05')).toBe('TG5') })
  it('validiert EAN', () => { expect(isValidEan('4006381333931')).toBe(true); expect(isValidEan('4006381333932')).toBe(false); expect(isValidEan('123')).toBe(false) })
})

describe('pricing', () => {
  it('wählt Preis je Variante', () => {
    expect(cardBasePrice(card, 'normal')?.value).toBe(0.06)
    expect(cardBasePrice(card, 'reverse')?.value).toBe(0.1)
    expect(cardBasePrice(card, 'holo')?.value).toBe(0.06)
    expect(cardBasePrice(card, 'firstEdition')?.estimated).toBe(true)
    // trend-holo 0 = kein Reverse-Preis → Hauptpreis als Schätzung
    expect(cardBasePrice({ ...card, cm: { updated: 'x', trend: 7.94, trendHolo: 0 } }, 'reverse')).toEqual({ value: 7.94, estimated: true })
  })
  it('Zustandsabschlag ist Schätzung, Override gewinnt', () => {
    const lp = unitPrice(base({ condition: 'LP' }), { ...card, cm: { ...card.cm!, trend: 10 } })
    expect(lp.value).toBe(6); expect(lp.estimated).toBe(true)
    expect(unitPrice(base({ manualPrice: 99 }), card)).toMatchObject({ value: 99, source: 'manual' })
  })
  it('markiert veraltete Preise', () => {
    const old = { ...card, cm: { ...card.cm!, updated: new Date(Date.now() - 9 * 864e5).toISOString() } }
    expect(unitPrice(base(), old).stale).toBe(true)
    expect(unitPrice(base(), card).stale).toBe(false)
  })
  it('fehlender Preis → null und zählt als missing', () => {
    const p = unitPrice(base(), { ...card, cm: undefined })
    expect(p.value).toBeNull()
    expect(totals([{ item: base({ qty: 3 }), price: p }])).toMatchObject({ value: 0, missing: 3, count: 3 })
  })
  it('Summen inkl. Kaufpreis', () => {
    const t = totals([{ item: base({ qty: 2, buyPrice: 1 }), price: { value: 5, source: 'cardmarket' } }])
    expect(t).toMatchObject({ value: 10, cost: 2 })
  })
  it('Preisänderung', () => expect(priceChange(card, 7)).toBeCloseTo(20))
  it('Produktpreis', () => expect(unitPrice({ ...base({ kind: 'product', refId: 'p1' }) }, undefined, { id: 'p1', name: 'x', type: 'Booster', price: 4.5, priceUpdated: Date.now() }).value).toBe(4.5))
})

describe('format', () => {
  it('parst deutsche Eingaben', () => { expect(parseEur('1.234,56')).toBe(1234.56); expect(parseEur('12.5')).toBe(12.5); expect(parseEur('')).toBeUndefined(); expect(parseEur('abc')).toBeUndefined(); expect(parseEur('-3')).toBeUndefined() })
  it('Tausenderpunkt ohne Komma', () => { expect(parseEur('1.200')).toBe(1200); expect(parseEur('1.234.567')).toBe(1234567) })
  it('ungültig ≠ leer', () => { expect(isBadAmount('abc')).toBe(true); expect(isBadAmount('  ')).toBe(false) })
  it('formatiert', () => { expect(formatEur(1234.5)).toMatch(/1\.234,50\s€/); expect(formatEur(null)).toBe('–') })
  it('relative Zeit', () => { const n = 1e9; expect(relativeTime(n - 3 * 3600e3, n)).toBe('vor 3 Std.'); expect(relativeTime(undefined)).toBe('nie') })
})

describe('strips', () => {
  it('Streifen liegen innerhalb der Karte', () => {
    for (const st of numberStrips()) { expect(st.y).toBeGreaterThanOrEqual(0.8); expect(st.y + st.h).toBeLessThanOrEqual(1.0001); expect(st.x + st.w).toBeLessThanOrEqual(1) }
  })
  it('rechnet Rahmen auf Videopixel um (object-fit: cover)', () => {
    // Video 1920x1080 in 400x400-Ansicht: scale=400/1080, seitlich beschnitten
    const r = frameToVideo({ left: 100, top: 50, width: 200, height: 280 }, { left: 0, top: 0, width: 400, height: 400 }, 1920, 1080)
    const sc = 400 / 1080
    expect(r.h).toBeCloseTo(280 / sc); expect(r.y).toBeCloseTo(50 / sc); expect(r.x).toBeCloseTo((100 + (1920 * sc - 400) / 2) / sc)
  })
})

describe('nameSuggestions', () => {
  it('bevorzugt große Schrift, filtert Rauschen und Duplikate', () => {
    const r = nameSuggestions([
      { text: 'Booster Bundle', confidence: 90, height: 80 }, { text: 'booster bundle', confidence: 88, height: 70 },
      { text: '30 JAHRE Jubiläum', confidence: 85, height: 120 }, { text: '|| ;; 12', confidence: 90, height: 200 },
      { text: 'kleingedruckter Text hier', confidence: 40, height: 300 }])
    expect(r).toEqual(['30 JAHRE Jubiläum', 'Booster Bundle'])
  })
})

describe('mapCard', () => {
  it('mappt TCGdex-Preisfelder', () => {
    const c = mapCard({ id: 'sv01-025', localId: '025', name: 'Tentagra', set: { id: 'sv01', name: 'KP', cardCount: { official: 198 } },
      pricing: { cardmarket: { updated: 'x', trend: 0.06, 'trend-holo': 0.1, 'avg7-holo': 0.06 } } })
    expect(c.cm).toMatchObject({ trend: 0.06, trendHolo: 0.1, avg7Holo: 0.06 }); expect(c.setTotal).toBe(198)
  })
})

describe('db actions', () => {
  beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })
  it('führt identische Exemplare zusammen', async () => {
    await addCard(card, { qty: 1, condition: 'NM', variant: 'normal', language: 'DE', buyPrice: 1 })
    await addCard(card, { qty: 3, condition: 'NM', variant: 'normal', language: 'DE', buyPrice: 2 })
    await addCard(card, { qty: 1, condition: 'LP', variant: 'normal', language: 'DE' })
    const items = await db.items.toArray()
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.condition === 'NM')).toMatchObject({ qty: 4, buyPrice: 1.75 })
  })
  it('Kaufpreis wird nicht mit Unbekanntem vermischt', async () => {
    await addCard(card, { qty: 1, condition: 'NM', variant: 'normal', language: 'DE', buyPrice: 1.5 })
    await addCard(card, { qty: 2, condition: 'NM', variant: 'normal', language: 'DE' })
    expect(await db.items.count()).toBe(2)
  })
  it('Produkt-Kaufpreis geht beim erneuten Scan ohne Preis nicht verloren', async () => {
    await addProduct({ name: 'ETB', type: 'Top-Trainer-Box', ean: '4006381333931' }, 1, 50)
    await addProduct({ name: 'ETB', type: 'Top-Trainer-Box', ean: '4006381333931' }, 1)
    const items = await db.items.toArray()
    expect(items.find((i) => i.buyPrice === 50)?.qty).toBe(1)
    expect(totals(items.map((item) => ({ item, price: { value: 10, source: 'product' as const } }))).cost).toBe(50)
  })
  it('Preis-Zeitstempel bleibt, wenn Preis gleich', async () => {
    await addProduct({ name: 'Box', type: 'Display', ean: '4006381333931', price: 10 }, 1)
    const p0 = (await db.products.toArray())[0]
    await new Promise((r) => setTimeout(r, 5))
    await setProductPrice(p0.id, 10)
    expect((await db.products.get(p0.id))!.priceUpdated).toBe(p0.priceUpdated)
  })
  it('gleichzeitiges Hinzufügen verliert keine Menge', async () => {
    const o = { qty: 1, condition: 'NM' as const, variant: 'normal' as const, language: 'DE' }
    await Promise.all([addCard(card, o), addCard(card, o), addCard(card, o)])
    const items = await db.items.toArray(); expect(items).toHaveLength(1); expect(items[0].qty).toBe(3)
  })
  it('Produkte per EAN wiedererkennen und Preis schnell setzen', async () => {
    await addProduct({ name: 'Top-Trainer-Box', type: 'Top-Trainer-Box', ean: '4006381333931', price: 54.9 }, 1)
    await addProduct({ name: 'egal', type: 'Booster', ean: '4006381333931' }, 2)
    const items = await db.items.toArray(); expect(items).toHaveLength(1); expect(items[0].qty).toBe(3)
    const p = (await db.products.toArray())[0]; expect(p.name).toBe('Top-Trainer-Box')
    await setProductPrice(p.id, 59.9); expect((await db.products.get(p.id))!.price).toBe(59.9)
  })
  it('Backup Roundtrip + CSV', async () => {
    await addCard(card, { qty: 2, condition: 'NM', variant: 'normal', language: 'DE' })
    const json = await exportJson()
    await db.items.clear(); expect(await db.items.count()).toBe(0)
    expect(await importJson(json)).toBe(1); expect((await db.items.toArray())[0].qty).toBe(2)
    const csv = await exportCsv(); expect(csv).toContain('Tentagra'); expect(csv).toContain('0,06')
    await expect(importJson('{"foo":1}')).rejects.toThrow()
  })
})

describe('Produktkatalog', () => {
  const cat = { source: '2026-10-10T20:06:02+0000', generatedAt: '', groups: { '1': 'ME: 30th Celebration', '2': 'Scarlet & Violet: 151' }, products: [
    { id: 1, g: 1, n: '30th Celebration Booster Bundle', p: 72.19 }, { id: 2, g: 1, n: '30th Celebration Booster Bundle Case', p: 1849 },
    { id: 3, g: 1, n: '30th Celebration Elite Trainer Box', p: 90 }, { id: 4, g: 2, n: '151 Elite Trainer Box', p: 120 }] }
  it('findet deutsche Suchbegriffe', () => {
    expect(searchCatalog(cat, '30 Jahre Jubiläum Booster Bundle')[0].id).toBe(1)
    expect(searchCatalog(cat, 'Top-Trainer-Box 151').map((p) => p.id)).toEqual([4])
    expect(searchCatalog(cat, 'Top Trainer Box Jubiläum')[0].id).toBe(3)
  })
  it('lose Foto-Suche ignoriert Füllwörter und Rauschen', () => {
    const r = searchLoose(cat, ['POKÉMON TCG', 'Booster Bundle', 'Jubiläum', 'xq zz'])
    expect(r[0].id).toBe(1)
    expect(searchLoose(cat, ['Pokémon', 'Sammelkartenspiel'])).toEqual([])
  })
  it('eigene Produkte werden eingehängt und mit EUR-Preis bewertet', () => {
    const m = mergeCustom(cat, [{ id: -1, name: '宝可梦 礼盒', region: 'ZH', price: 45, image: 'a.jpg', ean: '6942600401297' }])
    expect(m.products[0]).toMatchObject({ id: -1, n: '宝可梦 礼盒', l: 'ZH', e: 45, img: './custom/a.jpg', ean: '6942600401297' })
    expect(catalogEur(m.products[0], 0.9)).toBe(45); expect(catalogEur(cat.products[0], 0.89)).toBe(64.25)
    expect(searchCatalog(m, '礼盒')[0].id).toBe(-1); expect(isValidEan('6942600401297')).toBe(true)
  })
  it('Case hinter dem Einzelprodukt', () => expect(searchCatalog(cat, 'booster bundle').map((p) => p.id)).toEqual([1, 2]))
  it('Typ & Zeit & Umrechnung', () => {
    expect(guessType('151 Elite Trainer Box')).toBe('Top-Trainer-Box'); expect(guessType('X Booster Bundle')).toBe('Booster')
    expect(catalogTime(cat)).toBe(Date.parse('2026-10-10T20:06:02+00:00')); expect(toEur(72.19, 0.89)).toBe(64.25)
  })
  it('Katalogpreis wird als Schätzung geführt, manuelle Eingabe löst sie ab', async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await addProduct({ name: 'Bundle', type: 'Booster', catalogId: 1, price: 64.25, priceSource: 'catalog' }, 1)
    const p = (await db.products.toArray())[0]
    const it = (await db.items.toArray())[0]
    expect(unitPrice(it, undefined, p)).toMatchObject({ source: 'catalog', estimated: true, value: 64.25 })
    await setProductPrice(p.id, 70)
    expect(unitPrice(it, undefined, (await db.products.get(p.id))!)).toMatchObject({ source: 'product', value: 70 })
  })
})

describe('Sprachen', () => {
  it('Karten-Schlüssel: Deutsch roh, sonst mit Präfix', () => {
    expect(cardKey('de', 'sv01-025')).toBe('sv01-025'); expect(cardKey('ja', 'SV2a-025')).toBe('ja:SV2a-025')
    expect(parseKey('sv01-025')).toEqual({ lang: 'de', apiId: 'sv01-025' })
    expect(parseKey('zh-tw:SV2a-025')).toEqual({ lang: 'zh-tw', apiId: 'SV2a-025' })
    expect(langTag('zh-tw')).toBe('ZH')
  })
  it('deutscher Name vor Originalname', () => {
    expect(cardNames({ name: 'ピカチュウ', nameDe: 'Pikachu' })).toEqual({ name: 'Pikachu', alt: 'ピカチュウ' })
    expect(cardNames({ name: 'Tentagra' })).toEqual({ name: 'Tentagra' })
  })
  it('mapCard setzt Sprache und Schlüssel', () => {
    const c = mapCard({ id: 'SV2a-025', localId: '025', name: 'ピカチュウ', dexId: [25], set: { id: 'SV2a', name: '151', cardCount: { official: 165 } } }, 'ja')
    expect(c).toMatchObject({ id: 'ja:SV2a-025', lang: 'ja', dexId: 25, setId: 'SV2a', setTotal: 165 })
  })
})

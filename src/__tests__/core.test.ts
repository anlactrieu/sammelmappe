import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { catalogImageFor, jaCardRef, searchJaCards, type JaCatalog } from '../services/jaCards'
import { eanList, isValidEan, parseNameNumberQuery, parseNumberQuery, parseQty, totalVariants, normalizeEan, normalizeLocalId, parseCardText, totalCandidates } from '../lib/parse'
import { cardBasePrice, priceChange, setFx, totals, unitPrice } from '../lib/pricing'
import { formatEur, isBadAmount, parseEur, relativeTime } from '../lib/format'
import { addCard, addProduct, repairItemLanguages, setProductPrice } from '../lib/actions'
import { exportCsv, exportJson, importJson } from '../services/backup'
import { nameSuggestions } from '../lib/photo'
import { countdownLabel, daysUntil, formatDate, upcoming } from '../services/releases'
import { frameToVideo, numberStrips } from '../lib/strips'
import { mapCard } from '../services/tcgdex'
import { collectionStats, findMilestone, isHighlight } from '../lib/milestones'
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
  it('Gewinn nur über Einträge mit Kaufpreis', () => {
    const rows = [{ item: base({ qty: 3, buyPrice: 20 }), price: { value: 30, source: 'manual' as const } }, { item: base({ qty: 1 }), price: { value: 500, source: 'manual' as const } }]
    const t = totals(rows)
    expect(t).toMatchObject({ value: 590, cost: 60, costed: 3, costedValue: 90 })
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

describe('EAN', () => {
  it('UPC-A und EAN-13 passen zusammen, mehrere EANs je Eintrag', () => {
    expect(normalizeEan('820650454097')).toBe('0820650454097'); expect(normalizeEan('0820650454097')).toBe('0820650454097')
    expect(eanList('4007396203226, 0820650454097')).toEqual(['4007396203226', '0820650454097'])
    expect(eanList('4007396203226, 820650454097').includes(normalizeEan('0820650454097'))).toBe(true)
  })
})

describe('OCR-Verwechslungen bei der Gesamtzahl', () => {
  it('probiert Varianten, Original zuerst', () => {
    const v = totalVariants(195); expect(v[0]).toBe(195); expect(v).toContain(198); expect(totalVariants(165)).toContain(185)
  })
})

describe('Menge in der Schnell-Eingabe', () => {
  it('liest Mengen vorn und hinten', () => {
    expect(parseQty('2x Nachtara Mini Tin')).toEqual({ qty: 2, text: 'Nachtara Mini Tin' })
    expect(parseQty('3 nachtara')).toEqual({ qty: 3, text: 'nachtara' })
    expect(parseQty('nachtara x4')).toEqual({ qty: 4, text: 'nachtara' })
    expect(parseQty('151 Booster')).toEqual({ qty: 1, text: '151 Booster' })
    expect(parseQty('Glurak')).toEqual({ qty: 1, text: 'Glurak' })
  })
})

describe('Nummern-Suche', () => {
  it('erkennt Kartennummern, Promos und Namen', () => {
    expect(parseNumberQuery('079/198')).toEqual({ number: '079', total: 198 })
    expect(parseNumberQuery('79 / 198')).toEqual({ number: '79', total: 198 })
    expect(parseNumberQuery('TG05/TG30')).toEqual({ number: 'TG05', total: 30 })
    expect(parseNameNumberQuery('Glurak 006')).toEqual({ name: 'Glurak', number: '006', total: undefined })
    expect(parseNameNumberQuery('Pikachu 25/198')).toEqual({ name: 'Pikachu', number: '25', total: 198 })
    expect(parseNameNumberQuery('Glurak')).toBeNull()
    expect(parseNameNumberQuery('079/198')).toBeNull()
    expect(parseNumberQuery('SM106')).toEqual({ number: 'SM106', promoCode: 'SM' })
    expect(parseNumberQuery('swsh 245')).toEqual({ number: 'SWSH245', promoCode: 'SWSH' })
    expect(parseNumberQuery('Glurak')).toBeNull(); expect(parseNumberQuery('Pikachu V')).toBeNull(); expect(parseNumberQuery('151')).toBeNull()
  })
})

describe('Japanische Katalogkarten', () => {
  const cat: JaCatalog = { source: '2026-10-10T20:06:02+0000', groups: { '1': ['SV2a', 'Pokemon Card 151', '2023-06-16'], '2': ['M2', 'Neues Set', '2026-05-01'] },
    cards: [[10, 1, '025/165', 'Pikachu', 0.45], [11, 1, '006/165', 'Charizard ex', 12.5], [12, 2, '025/080', 'Pikachu ex', null]] }
  it('findet per Nummer (führende Nullen egal) und Name, neues Set zuerst', () => {
    expect(searchJaCards(cat, '25/165').map((c) => c.id)).toEqual(['ja:cat-10'])
    expect(searchJaCards(cat, 'pikachu').map((c) => c.id)).toEqual(['ja:cat-12', 'ja:cat-10'])
    expect(searchJaCards(cat, 'Glurak', 'charizard').map((c) => c.id)).toEqual(['ja:cat-11'])
  })
  it('lässt Karten aus, die TCGdex schon hat', () => {
    expect(searchJaCards(cat, '25/165', undefined, new Set(['sv2a-25']))).toEqual([])
  })
  it('Preis: USD in Euro, mit Zustandsabschlag und Schätz-Kennzeichen', () => {
    setFx(0.9)
    const ref = jaCardRef(cat, 11)!
    const price = unitPrice(base({ refId: ref.id, condition: 'LP' }), ref)
    expect(price).toMatchObject({ source: 'catalog', estimated: true, value: 6.75 })
  })
})

describe('Neuheiten', () => {
  const today = new Date(2026, 9, 11)
  it('Countdown und Datum', () => {
    expect(daysUntil('2026-11-06', today)).toBe(26); expect(countdownLabel(26)).toBe('in 4 Wochen'); expect(countdownLabel(1)).toBe('morgen'); expect(countdownLabel(0)).toBe('heute'); expect(countdownLabel(-3)).toBe('vor 3 Tagen')
    expect(formatDate('2026-11-06')).toBe('6. November 2026')
  })
  it('eigene Termine vor Handelsdaten, ohne Dublette, Vergangenes raus', () => {
    const r = { generatedAt: '', de: [], sets: [{ code: 'ME06', name: 'Delta Reign', date: '2026-11-06', region: 'EN' as const }, { code: 'M7', name: 'X', date: '2026-12-01', region: 'JA' as const }, { code: 'OLD', name: 'Alt', date: '2026-01-01', region: 'EN' as const }] }
    const u = upcoming(r, [{ name: 'Delta-Herrschaft', date: '2026-11-06', region: 'DE' }], today)
    expect(u.map((x) => x.title)).toEqual(['Delta-Herrschaft', 'X'])
  })
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
  it('Katalog-Hinzufügen überschreibt weder eigenen Preis noch eigenes Foto', async () => {
    await addProduct({ name: 'Bundle', type: 'Booster', catalogId: 5, price: 80, priceSource: 'manual', image: 'eigen.jpg' }, 1)
    await addProduct({ name: 'Bundle', type: 'Booster', catalogId: 5, price: 64.25, priceSource: 'catalog', image: 'katalog.jpg' }, 1)
    const p = (await db.products.toArray())[0]
    expect(p).toMatchObject({ price: 80, priceSource: 'manual', image: 'eigen.jpg' })
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
  it('deutsche Produktwörter (Koffer, Abenteuer) finden englische Namen', () => {
    const c2 = { ...cat, products: [...cat.products, { id: 9, g: 2, n: 'Paldea Adventure Chest', p: 116 }, { id: 10, g: 2, n: 'Fall 2025 Collector Chest', p: 48 }] }
    expect(searchCatalog(c2, 'Paldea Abenteuer Koffer')[0].id).toBe(9)
    expect(searchCatalog(c2, 'Sammlerkoffer').map((p) => p.id).sort()).toEqual([10, 9])
  })
  it('deutsche Pokémon-Namen und Setnamen finden den Katalog', () => {
    const c3 = { ...cat, products: [...cat.products, { id: 20, g: 2, n: 'Prismatic Evolutions Mini Tin [Umbreon]', p: 41 }, { id: 21, g: 2, n: 'Prismatic Evolutions Mini Tin [Sylveon]', p: 43 }] }
    expect(searchCatalog(c3, 'Nachtara Mini Tin Prismatische Entwicklungen')[0].id).toBe(20)
    expect(searchCatalog(c3, 'Feelinara Mini Tin').map((p) => p.id)).toEqual([21])
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

describe('Meilensteine', () => {
  const card = { setName: 'Test', setTotal: 100 }
  const st = (total: number, setOwned: number, hasHolo = true) => ({ total, setOwned, cardQty: 1, hasHolo })
  it('Set-Schwelle schlägt Gesamtzahl', () => {
    expect(findMilestone(st(9, 24), st(10, 25), card, 'normal')?.title).toBe('25 % vom Set')
  })
  it('Set komplett', () => { expect(findMilestone(st(50, 99), st(51, 100), card, 'normal')?.title).toBe('Set komplett!') })
  it('Gesamtzahl', () => { expect(findMilestone(st(99, 3), st(100, 4), card, 'normal')?.title).toBe('100. Karte!') })
  it('Duplikat im Set zählt nicht fürs Set', () => { expect(findMilestone(st(20, 25), st(21, 25), card, 'normal')).toBeNull() })
  it('erstes Holo', () => { expect(findMilestone(st(3, 1, false), st(4, 2, true), card, 'holo')?.kind).toBe('holo') })
  it('kein Meilenstein', () => { expect(findMilestone(st(3, 1), st(4, 2), card, 'normal')).toBeNull() })
  it('Highlight nach Preis oder Seltenheit', () => {
    expect(isHighlight({ rarity: 'Common' }, 25)).toBe(true)
    expect(isHighlight({ rarity: 'Illustration rare' }, 2)).toBe(true)
    expect(isHighlight({ rarity: 'Common' }, 2)).toBe(false)
  })
})

describe('collectionStats', () => {
  beforeEach(async () => { await db.items.clear(); await db.cards.clear() })
  const mk = (id: string, localId: string, lang?: 'en'): any => ({ id, name: id, localId, setId: 's1', setName: 'S', setTotal: 10, lang })
  const own = async (c: any, variant = 'normal') => { await db.cards.put(c); await db.items.add({ kind: 'card', refId: c.id, qty: 2, condition: 'NM', variant, language: 'DE', addedAt: 1 } as any) }
  it('zählt nur Grundset und Sprache, Holo und Mengen', async () => {
    const a = mk('s1-1', '1'), secret = mk('s1-11', '11'), en = mk('en-s1-1', '1', 'en')
    await own(a); await own(secret, 'holo'); await own(en)
    const st = await collectionStats(a)
    expect(st).toMatchObject({ total: 6, setOwned: 1, cardQty: 2, hasHolo: true })
  })
})

describe('JP-Bild-Fallback', () => {
  const cat: JaCatalog = { source: 'x', groups: { '7': ['SV2a', '151', '2023-06-16'] }, cards: [[111, 7, '025/165', 'Pikachu', 1]] }
  it('liefert Katalogbild zu Set-Kürzel und Nummer (Nullen egal, Groß/Klein egal)', () => {
    expect(catalogImageFor(cat, 'sv2a', '25')).toContain('/111_')
    expect(catalogImageFor(cat, 'SV2a', '026')).toBeUndefined()
  })
})

describe('Sprach-Migration', () => {
  it('Backup-Import wandelt JP in JA', async () => {
    const json = JSON.stringify({ app: 'sammelmappe', items: [{ kind: 'card', refId: 'x', qty: 1, condition: 'NM', variant: 'normal', language: 'JP', addedAt: 1 }], cards: [], products: [] })
    await db.items.clear(); await importJson(json, 'replace')
    expect((await db.items.toArray())[0].language).toBe('JA')
  })
})

describe('repairItemLanguages', () => {
  it('setzt DE bei JA-Karte auf JA, lässt deutsche Karten', async () => {
    await db.items.clear(); await db.cards.clear()
    await db.cards.bulkPut([{ id: 'ja:A-1', lang: 'ja', name: 'a', localId: '1', setId: 'A', setName: 'A' }, { id: 'de-1', name: 'b', localId: '1', setId: 'd', setName: 'd' }] as any)
    const base = { kind: 'card', qty: 1, condition: 'NM', variant: 'normal', language: 'DE', addedAt: 1 }
    await db.items.bulkAdd([{ ...base, refId: 'ja:A-1' }, { ...base, refId: 'de-1' }] as any)
    expect(await repairItemLanguages()).toBe(1)
    expect((await db.items.toArray()).map((i) => i.language).sort()).toEqual(['DE', 'JA'])
  })
})

import { useEffect, useState } from 'react'
import { db } from '../db'
import { fileToThumb } from '../lib/photo'
import { findByPhoto } from '../services/photoFind'
import { ProductPicker } from './ProductPicker'
import { catalogImage, catalogTime, guessType, loadCatalog, type CatalogProduct } from '../services/catalog'
import { loadSets } from '../services/tcgdex'
import type { SetRef } from '../types'
import { addProduct, cardmarketSearchUrl } from '../lib/actions'
import { isBadAmount, parseEur } from '../lib/format'
import type { ProductType } from '../types'
import { Sheet, useToast } from './ui'

const TYPES: ProductType[] = ['Booster', 'Display', 'Top-Trainer-Box', 'Kollektion', 'Deck', 'Tin', 'Sonstiges']

/** Versiegeltes Produkt hinzufügen (optional mit gescanntem EAN). */
export function ProductSheet({ open, ean, prefill, onClose, onAdded }: { open: boolean; ean?: string; prefill?: { c: CatalogProduct; eur: number | null }; onClose: () => void; onAdded?: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState<ProductType>('Booster')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState('')
  const [buy, setBuy] = useState('')
  const [known, setKnown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sets, setSets] = useState<SetRef[]>([])
  const [pickedSet, setPickedSet] = useState('')
  const [touched, setTouched] = useState(false)
  const [photo, setPhoto] = useState<string | undefined>()
  const [sugg, setSugg] = useState<string[]>([])
  const [rankedIds, setRankedIds] = useState<number[]>([])
  const [reading, setReading] = useState(false)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('DE')
  const [catalog, setCatalog] = useState<{ id: number; price: number | null; at?: number; img?: string; mine?: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setTouched(false); setPickedSet(''); setPhoto(undefined); setSugg([]); setRankedIds([]); setQuery(''); setCatalog(null); setRegion('DE'); loadSets().then((s) => setSets([...s].reverse())).catch(() => undefined)
    setName(''); setType('Booster'); setQty(1); setPrice(''); setBuy(''); setKnown(false)
    if (prefill) pickCatalog(prefill.c, prefill.eur)
    if (ean) db.products.where('ean').equals(ean).first().then((p) => {
      if (!p) return
      setKnown(true); setName(p.name); setType(p.type)
      if (p.price != null) setPrice(String(p.price).replace('.', ','))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ean, prefill])

  const onPhoto = async (file?: File) => {
    if (!file) return
    try {
      const { dataUrl, canvas } = await fileToThumb(file, 900)
      setPhoto(canvas.width > 600 ? (await fileToThumb(file, 480)).dataUrl : dataUrl)
      setReading(true); setSugg([])
      const r = await findByPhoto(canvas)
      const names = r.texts
      setSugg(names); setRankedIds(r.ids)
      setQuery('')
      if (!names.length) toast('Im Foto kein Text erkannt – Namen bitte tippen')
    } catch (e) { toast(`Foto konnte nicht verarbeitet werden: ${(e as Error).message || 'Texterkennung nicht geladen (offline?)'}`) }
    finally { setReading(false) }
  }
  function pickCatalog(c: CatalogProduct, eur: number | null) {
    setRegion(c.l ?? 'EN'); setCatalog({ id: c.id, price: eur, img: c.img, mine: c.id < 0 }); loadCatalog().then((cat) => cat && setCatalog((cur) => (cur && cur.id === c.id ? { ...cur, at: catalogTime(cat) } : cur)))
    setTouched(true); setName(c.n); setType(guessType(c.n))
    setPrice(eur != null ? String(eur).replace('.', ',') : ''); setQuery('')
  }
  const suggest = (set: string, t: ProductType) => { if (!touched && set) setName(`${set} ${t === 'Sonstiges' ? '' : t}`.trim()) }
  const save = async () => {
    if (!name.trim()) return toast('Bitte einen Namen eingeben')
    if (saving) return
    if (isBadAmount(price) || isBadAmount(buy)) return toast('Bitte gültige Beträge eingeben, z. B. 12,50')
    setSaving(true)
    try {
      await addProduct({ name: name.trim(), type, ean, image: photo ?? (catalog ? catalogImage({ id: catalog.id, img: catalog.img } as CatalogProduct, 400) : undefined), catalogId: catalog?.id, priceUpdated: catalog?.at, region, priceSource: catalog && !catalog.mine && parseEur(price) === catalog.price ? 'catalog' : 'manual', setName: pickedSet || undefined, price: parseEur(price) }, qty, parseEur(buy))
      toast(`${qty}× ${name.trim()} hinzugefügt`)
      onAdded?.(); onClose()
    } finally { setSaving(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={known ? 'Bekanntes Produkt' : 'Produkt hinzufügen'} footer={<button className="btn primary grow-btn" disabled={saving} onClick={save}>{qty > 1 ? `${qty}× hinzufügen` : 'Hinzufügen'}</button>}>
      {ean && <p className="muted small">Barcode (EAN): <code>{ean}</code>{known ? ' – erkannt, Daten übernommen' : ' – wird für das nächste Mal gemerkt'}</p>}
      {!known && <>
        <h2 style={{ marginTop: 8 }}>Im Katalog suchen</h2>
        {catalog ? <p className="hint">Aus dem Katalog übernommen. Preis ≈ umgerechnet aus dem US-Markt (TCGplayer) – passe ihn an, wenn dein Markt abweicht.</p> : null}
        {!catalog && <ProductPicker query={query} onQuery={setQuery} onPick={pickCatalog} photoTexts={sugg} rankedIds={rankedIds} />}
      </>}
      {!known && !catalog && <div className="photo-box">
        {photo ? <img src={photo} alt="Produktfoto" /> : <span className="muted small">Noch kein Foto</span>}
        <div className="grow">
          <label className="btn small-btn file-btn">{photo ? 'Foto ersetzen' : 'Produkt fotografieren'}
            <input type="file" accept="image/*" capture="environment" className="file-overlay" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
          <small className="muted">{reading ? 'Lese Text auf der Verpackung …' : 'Das Foto wird gespeichert und liest den Namen von der Packung.'}</small>
        </div>
      </div>}
      {sugg.length > 0 && <div className="field" role="group">Erkannter Text – antippen, um im Katalog zu suchen
        <div className="chips">{sugg.map((t) => <button key={t} className="chip" onClick={() => setQuery(t)}>{t}</button>)}</div></div>}
      {!known && !catalog && sets.length > 0 && <label className="field">Set (schlägt den Namen vor)
        <select value={pickedSet} onChange={(e) => { setPickedSet(e.target.value); suggest(e.target.value, type) }}>
          <option value="">– optional –</option>{sets.map((s) => <option key={s.id}>{s.name}</option>)}</select></label>}
      <label className="field">Name
        <input value={name} onChange={(e) => { setTouched(true); setName(e.target.value) }} placeholder="z. B. Karmesin & Purpur Top-Trainer-Box" autoFocus={!catalog && !!ean || known} />
      </label>
      <div className="field" role="group">Sprache der Ausgabe
        <div className="chips tight">{['DE', 'EN', 'JA', 'ZH', 'KO'].map((r) => <button key={r} className={`chip${r === region ? ' on' : ''}`} aria-pressed={r === region} onClick={() => setRegion(r)}>{r}</button>)}</div>
        {(region === 'ZH' || region === 'KO') && <small className="muted">Für chinesische und koreanische Produkte gibt es keine offene Preisquelle – trage den Preis selbst ein (z. B. von Cardmarket, eBay oder dem Kaufbeleg).</small>}
      </div>
      <div className="field" role="group">Art
        <div className="chips">{TYPES.map((t) => <button key={t} aria-pressed={t === type} className={`chip${t === type ? ' on' : ''}`} onClick={() => { setType(t); suggest(pickedSet, t) }}>{t}</button>)}</div>
      </div>
      <div className="row2">
        <div className="field" role="group">Menge
          <div className="stepper"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Weniger">−</button><output>{qty}</output>
            <button onClick={() => setQty(qty + 1)} aria-label="Mehr">+</button></div></div>
        <label className="field">Kaufpreis / Stück<input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="optional" /></label>
      </div>
      <label className="field">Aktueller Marktpreis / Stück
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="z. B. 54,90" />
      </label>
      <a className="link" target="_blank" rel="noreferrer" href={cardmarketSearchUrl(name || 'Pokemon')}>Preis auf Cardmarket nachschauen ↗</a>
      {(region === 'ZH' || region === 'KO' || region === 'JA') && <>
        <a className="link" target="_blank" rel="noreferrer" href={`https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(`pokemon ${region === 'ZH' ? 'chinese' : region === 'KO' ? 'korean' : 'japanese'} ${name}`.trim())}&LH_Sold=1&LH_Complete=1`}>Verkaufte Preise auf eBay ansehen ↗</a>
        <a className="link" target="_blank" rel="noreferrer" href="https://lens.google.com/">Produkt per Foto im Web finden (Google Lens) ↗</a>
      </>}
      {ean && <a className="link" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(ean + ' pokemon')}`}>Barcode im Web nachschlagen ↗</a>}
      <p className="hint">Für versiegelte Produkte gibt es keine freie Preis-API. Trage den Preis einmal ein – du kannst ihn später in der Sammlung mit einem Tap aktualisieren.</p>
    </Sheet>
  )
}

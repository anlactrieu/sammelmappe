import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LangChips } from '../components/LangChips'
import { useQuickAdd } from '../components/quickAdd'
import { Segmented, useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import { addCatalogProduct, undoItemQty } from '../lib/actions'
import { formatEur } from '../lib/format'
import { eanList, parseQty } from '../lib/parse'
import type { Lang } from '../lib/lang'
import { VARIANT_LABEL } from '../lib/pricing'
import type { Variant } from '../types'
import { catalogEur, catalogImage, catalogTime, guessType, loadCatalog, searchCatalog, usdToEur, type Catalog, type CatalogProduct } from '../services/catalog'
import { imageUrl, searchCards, type CardBrief } from '../services/tcgdex'

interface Done { key: number; label: string; qty: number; undo?: () => Promise<void>; undone?: boolean }

/** Schnell erfassen: tippen, antippen, fertig – ohne Kamera und ohne Dialoge. */
export default function Quick() {
  const toast = useToast()
  const quickAddCard = useQuickAdd()
  const input = useRef<HTMLInputElement>(null)
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'product' | 'card'>(params.get('mode') === 'card' ? 'card' : params.get('mode') === 'product' ? 'product' : (() => { try { return localStorage.getItem('snapKind') === 'product' ? 'product' : 'card' } catch { return 'card' } })())
  const [lang, setLang] = useState<Lang>('de')
  const [q, setQ] = useState('')
  // Variante gilt für alle Treffer, bis man sie wechselt („auto“ = erste Variante der Karte); gilt nur, wenn die Karte sie hat
  const [variant, setVariantState] = useState<Variant | 'auto'>(() => { try { const v = localStorage.getItem('quickVariant'); return v && v in VARIANT_LABEL ? (v as Variant) : 'auto' } catch { return 'auto' } })
  const setVariant = (v: Variant | 'auto') => { setVariantState(v); try { localStorage.setItem('quickVariant', v) } catch { /* privater Modus */ } input.current?.focus() }
  const [cat, setCat] = useState<Catalog | null | undefined>(undefined)
  const [rate, setRate] = useState(0.89)
  const [cards, setCards] = useState<CardBrief[]>([])
  const [done, setDone] = useState<Done[]>([])
  const seq = useRef(0)
  const { qty, text } = useMemo(() => parseQty(q), [q])

  useEffect(() => { loadCatalog().then(setCat); usdToEur().then(setRate); input.current?.focus() }, [])
  const products = useMemo(() => (cat && mode === 'product' ? searchCatalog(cat, text, 8) : []), [cat, mode, text])

  useEffect(() => {
    if (mode !== 'card' || text.trim().length < 2) { setCards([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => searchCards(text, lang, ctrl.signal).then((r) => setCards(r.slice(0, 12))).catch(() => undefined), 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [text, mode, lang])

  const finish = (label: string, n: number, undo: () => Promise<void>) => {
    const key = ++seq.current
    setDone((d) => [{ key, label, qty: n, undo }, ...d].slice(0, 12))
    toast(`${n > 1 ? n + '× ' : ''}${label} hinzugefügt`)
    setQ(''); input.current?.focus()
  }

  const addProduct = async (c: CatalogProduct) => {
    const eur = catalogEur(c, rate)
    const id = await addCatalogProduct(c, eur, qty, { image: catalogImage(c, 400), type: guessType(c.n), priceUpdated: cat ? catalogTime(cat) : undefined, firstEan: eanList(c.ean)[0] })
    finish(c.n, qty, () => undoItemQty(id, qty))
  }
  const addCard = async (c: CardBrief) => {
    if (await quickAddCard(c.id, qty, variant === 'auto' ? undefined : variant)) { setQ(''); input.current?.focus(); setDone((d) => [{ key: ++seq.current, label: c.name, qty, }, ...d].slice(0, 12)) }
  }
  const undo = async (d: Done) => { await d.undo?.(); setDone((x) => x.map((y) => (y.key === d.key ? { ...y, undone: true } : y))); toast('Rückgängig gemacht') }

  return (
    <div className="page">
      <header className="page-head"><Link to={mode === 'card' ? '/add' : '/add?mode=product'} className="back" aria-label="Zurück">‹</Link><h1>Schnell</h1></header>
      <p className="muted small">Tippen, antippen, fertig. Mit Menge: „2x Nachtara Mini Tin“.</p>
      <Segmented label="Was erfassen" value={mode} onChange={(m) => { setMode(m); input.current?.focus() }} options={[{ value: 'product', label: 'Produkt' }, { value: 'card', label: 'Karte' }]} />
      {mode === 'card' && <LangChips value={lang} onChange={setLang} />}
      {mode === 'card' && <div role="group" aria-label="Variante für alle Treffer" className="chips">
        {(['auto', 'normal', 'holo', 'reverse'] as const).map((v) => <button key={v} aria-pressed={v === variant} className={`chip${v === variant ? ' on' : ''}`} onClick={() => setVariant(v)}>{v === 'auto' ? 'Auto' : VARIANT_LABEL[v]}</button>)}
      </div>}
      {mode === 'card' && <p className="muted small" style={{ marginTop: 0 }}>Variante gilt für jeden Tipp. Hat eine Karte sie nicht, wird ihre erste Variante genommen.</p>}
      <input ref={input} className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
        placeholder={mode === 'product' ? 'z. B. 2x Fatale Flammen Display' : 'Name oder Nummer, z. B. Glurak oder 079/198'} aria-label="Name eingeben" />
      {qty > 1 && <p className="small"><b className="langtag">× {qty}</b> wird mit jedem Tippen auf einen Treffer hinzugefügt</p>}

      {mode === 'product' && cat === null && <p className="error small">Produktkatalog nicht gefunden. Du kannst Produkte trotzdem unter Hinzufügen → Produkt manuell anlegen.</p>}
      {mode === 'product' && text.trim().length >= 2 && cat && products.length === 0 && <p className="muted">Nichts gefunden. Probier den englischen Namen oder weniger Wörter.</p>}
      <ul className="list">
        {products.map((p) => (
          <li key={p.id}><button className="rowbtn" onClick={() => addProduct(p)}>
            <img src={catalogImage(p)} alt="" loading="lazy" />
            <div className="grow"><strong>{p.l && <><b className="langtag">{p.l}</b> </>}{p.n}</strong><small className="muted">{cat?.groups[p.g]}</small>
              <span className="price"><strong>{catalogEur(p, rate) != null ? `${p.e != null ? '' : '≈ '}${formatEur(catalogEur(p, rate))}` : 'kein Preis'}</strong></span></div>
            <span className="quick-plus" aria-hidden><Icon name="plus" size={22} /></span>
          </button></li>))}
      </ul>
      {mode === 'card' && <ul className="list">
        {cards.map((c) => (
          <li key={c.id}><button className="rowbtn" onClick={() => addCard(c)}>
            {c.image ? <img src={imageUrl(c.image)} alt="" loading="lazy" /> : <span className="thumb-ph"><Icon name="card" /></span>}
            <div className="grow"><strong>{c.name}</strong><small className="muted">{c.id.replace(/^(en|ja|zh-tw|zh-cn):/, '').replace(/-[^-]+$/, '').toUpperCase()} · {c.localId}</small></div>
            <span className="quick-plus" aria-hidden><Icon name="plus" size={22} /></span>
          </button></li>))}
      </ul>}

      {done.length > 0 && <section>
        <h2>Gerade erfasst</h2>
        <ul className="list">
          {done.map((d) => (
            <li key={d.key} className="done-row"><span className={d.undone ? 'strike' : ''}>{d.qty > 1 ? `${d.qty}× ` : ''}{d.label}</span>
              {!d.undone && d.undo && <button className="btn small-btn ghost" onClick={() => undo(d)}>Rückgängig</button>}</li>))}
        </ul>
        <Link className="btn primary" to="/collection">Fertig – zur Sammlung</Link>
      </section>}
    </div>
  )
}

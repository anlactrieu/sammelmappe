import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCollection, type Row } from '../hooks'
import { imageUrl } from '../services/tcgdex'
import { formatEur } from '../lib/format'
import { Icon } from '../components/Icon'
import { Empty, PriceLine, Segmented, Sheet } from '../components/ui'
import { ItemSheet } from '../components/CardSheets'

const PLAIN = ['Häufig', 'Nicht so häufig']
const isFoil = (r: Row) => !!r.card && (r.item.variant !== 'normal' || (!!r.card.rarity && !PLAIN.includes(r.card.rarity)))

type Kind = 'all' | 'card' | 'product'
type Sort = 'added' | 'value' | 'name'
type View = 'grid' | 'list'

export default function Collection() {
  const { rows, ready } = useCollection()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<Sort>('added')
  const [open, setOpen] = useState<Row | null>(null)
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem('view') === 'list' ? 'list' : 'grid' } catch { return 'grid' } })
  const [fOpen, setFOpen] = useState(false)
  const [fSet, setFSet] = useState('')
  const [fCond, setFCond] = useState('')
  const [fLang, setFLang] = useState('')
  const changeView = (v: View) => { setView(v); try { localStorage.setItem('view', v) } catch { /* privater Modus */ } }
  const setNames = useMemo(() => Array.from(new Set(rows.map((r) => r.card?.setName ?? r.product?.setName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'de')), [rows])
  const langs = useMemo(() => Array.from(new Set(rows.map((r) => r.item.language))).sort(), [rows])
  const activeFilters = [fSet, fCond, fLang].filter(Boolean).length
  const missingOnly = params.get('filter') === 'missing'

  const list = useMemo(() => {
    let r = rows.filter((x) => (kind === 'all' || x.item.kind === kind) && (!missingOnly || x.price.value == null) &&
      (!fSet || (x.card?.setName ?? x.product?.setName) === fSet) && (!fCond || (x.item.kind === 'card' && x.item.condition === fCond)) && (!fLang || x.item.language === fLang) &&
      (!q || `${x.name} ${x.sub}`.toLowerCase().includes(q.toLowerCase())))
    const val = (x: Row) => (x.price.value ?? -1) * x.item.qty
    if (sort === 'value') r = [...r].sort((a, b) => val(b) - val(a))
    if (sort === 'name') r = [...r].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    return r
  }, [rows, q, kind, sort, missingOnly, fSet, fCond, fLang])
  const live = open ? rows.find((r) => r.item.id === open.item.id) ?? null : null

  return (
    <div className="page">
      <header className="page-head"><h1>Sammlung</h1>
        <Link className="btn small-btn" to="/sets">Sets</Link></header>
      <input className="search" type="search" placeholder="Name oder Set suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sammlung durchsuchen" />
      <div className="toolbar">
        <Segmented label="Art" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Alle' }, { value: 'card', label: 'Karten' }, { value: 'product', label: 'Produkte' }]} />
      </div>
      <div className="toolbar">
        <button className={`chip${activeFilters ? ' on' : ''}`} onClick={() => setFOpen(true)}>Filter{activeFilters ? ` (${activeFilters})` : ''}</button>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
          <option value="added">Neueste zuerst</option><option value="value">Wert</option><option value="name">Name A–Z</option></select>
      </div>
      {missingOnly && <button className="chip on" onClick={() => setParams({})}>Nur ohne Preis ✕</button>}
      {ready && <div className="toolbar"><p className="muted small">{list.length} Einträge · {formatEur(list.reduce((s, r) => s + (r.price.value ?? 0) * r.item.qty, 0))}{list.length === rows.length ? ' gesamt' : ' (gefiltert)'}</p>
        <Segmented label="Ansicht" value={view} onChange={changeView} options={[{ value: 'grid', label: 'Raster' }, { value: 'list', label: 'Liste' }]} /></div>}

      {ready && rows.length === 0 && <Empty icon="🗂️" title="Noch nichts hier" text="Füge deine erste Karte oder dein erstes Produkt hinzu – per Scan oder Suche." ><div className="actions"><Link className="btn primary" to="/add">Karte suchen</Link><Link className="btn" to="/add?mode=product">Produkt hinzufügen</Link></div></Empty>}
      {ready && rows.length > 0 && list.length === 0 && <Empty icon="🔍" title="Keine Treffer" text="Passe Suche oder Filter an."><button className="btn" onClick={() => { setQ(''); setKind('all'); setFSet(''); setFCond(''); setFLang(''); setParams({}) }}>Alles zurücksetzen</button></Empty>}

      <ul className={view === 'grid' ? 'grid' : 'list'}>
        {list.map((r) => (
          <li key={r.item.id}>
            {view === 'list' ? (
              <button className="rowbtn" onClick={() => setOpen(r)} aria-label={`${r.name}, ${r.item.qty} Stück`}>
                {r.image ? <img crossOrigin="anonymous" src={imageUrl(r.image)} alt="" loading="lazy" /> : <span className="thumb-ph"><Icon name="box" /></span>}
                <div className="grow"><strong>{r.name}</strong><small className="muted">{r.sub}{r.item.kind === 'card' ? ` · ${r.item.condition}` : ''}{r.item.qty > 1 ? ` · ${r.item.qty}×` : ''}</small></div>
                <PriceLine price={r.price} qty={r.item.qty} compact />
              </button>
            ) : (
            <button className="tile" onClick={() => setOpen(r)} aria-label={`${r.name}, ${r.item.qty} Stück`}>
              <div className={`tile-img${isFoil(r) ? ' foil' : ''}`}>
                {r.image ? <img crossOrigin="anonymous" src={imageUrl(r.image)} alt="" loading="lazy" /> : <span className="thumb-ph big"><Icon name="box" size={40} /></span>}
                {r.tag && <span className="badge lang">{r.tag}</span>}
                {r.item.qty > 1 && <span className="badge">{r.item.qty}×</span>}
                {r.item.graded && <span className="badge grade">{r.item.graded.company} {r.item.graded.grade}</span>}
              </div>
              <strong className="tile-name">{r.name}</strong>
              <small className="muted tile-sub">{r.sub}</small>
              <PriceLine price={r.price} qty={r.item.qty} compact />
            </button>)}
          </li>))}
      </ul>
      <Sheet open={fOpen} onClose={() => setFOpen(false)} title="Filter">
        <label className="field">Set<select value={fSet} onChange={(e) => setFSet(e.target.value)}><option value="">Alle Sets</option>{setNames.map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="field">Zustand<select value={fCond} onChange={(e) => setFCond(e.target.value)}><option value="">Alle</option>{['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Sprache<select value={fLang} onChange={(e) => setFLang(e.target.value)}><option value="">Alle</option>{langs.map((l) => <option key={l}>{l}</option>)}</select></label>
        <div className="actions"><button className="btn primary" onClick={() => setFOpen(false)}>{list.length} Treffer anzeigen</button>
          <button className="btn ghost" onClick={() => { setFSet(''); setFCond(''); setFLang('') }}>Zurücksetzen</button></div>
      </Sheet>
      <ItemSheet item={live?.item ?? null} card={live?.card} product={live?.product} onClose={() => setOpen(null)} />
    </div>
  )
}

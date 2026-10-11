import { useEffect, useMemo, useState } from 'react'
import { catalogTime, loadCatalog, productImage, searchCatalog, searchLoose, toEur, usdToEur, type Catalog, type CatalogProduct } from '../services/catalog'
import { formatEur, relativeTime } from '../lib/format'

/** Versiegelte Produkte im Katalog suchen (Name, deutsch oder englisch). */
export function ProductPicker({ query, onQuery, onPick, autoFocus, photoTexts, rankedIds }: { query: string; onQuery: (q: string) => void; onPick: (p: CatalogProduct, eur: number | null) => void; autoFocus?: boolean; photoTexts?: string[]; rankedIds?: number[] }) {
  const [cat, setCat] = useState<Catalog | null | undefined>(undefined)
  const [rate, setRate] = useState(0.89)
  useEffect(() => { loadCatalog().then(setCat); usdToEur().then(setRate) }, [])
  const photo = !query.trim() && (!!photoTexts?.length || !!rankedIds?.length)
  const loose = photo
  const results = useMemo(() => {
    if (!cat) return []
    if (!photo) return searchCatalog(cat, query)
    const byId = new Map(cat.products.map((p) => [p.id, p]))
    const ranked = (rankedIds ?? []).map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p)
    const seen = new Set(ranked.map((p) => p.id))
    return [...ranked, ...(photoTexts?.length ? searchLoose(cat, photoTexts, 6).filter((p) => !seen.has(p.id)) : [])]
  }, [cat, query, photo, photoTexts, rankedIds])

  return (
    <div className="picker">
      <input className="search" type="search" autoFocus={autoFocus} value={query} onChange={(e) => onQuery(e.target.value)}
        placeholder={loose ? 'Foto-Treffer – oder hier eintippen' : 'Produkt suchen, z. B. 30 Jahre Booster Bundle'} aria-label="Produkt im Katalog suchen" />
      {cat === null && <p className="error small">Produktkatalog nicht gefunden. Erzeuge ihn mit <code>npm run catalog</code> oder tippe das Produkt manuell ein.</p>}
      {cat && !photo && <p className="muted small">{cat.products.length.toLocaleString('de-DE')} Produkte · Stand {relativeTime(catalogTime(cat))}</p>}
      {photo && results.length > 0 && <p className="muted small">Ähnlichste Produkte zu deinem Foto – das beste zuerst:</p>}
      {cat && (query.trim().length >= 2 || loose) && results.length === 0 && <p className="muted">Nichts gefunden. Probiere englische Namen („Elite Trainer Box“) oder weniger Wörter.</p>}
      <ul className="list">
        {results.map((p) => (
          <li key={p.id}>
            <button className="rowbtn" onClick={() => onPick(p, p.p != null ? toEur(p.p, rate) : null)}>
              <img src={productImage(p.id)} alt="" loading="lazy" />
              <div className="grow"><strong>{p.n}</strong><small className="muted">{cat?.groups[p.g]}</small></div>
              <span className="price">{p.p != null ? <strong>≈ {formatEur(toEur(p.p, rate))}</strong> : <span className="missing">kein Preis</span>}</span>
            </button>
          </li>))}
      </ul>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatEur, isoToDe } from '../lib/format'
import { Empty } from '../components/ui'
import { InvoiceSheet } from '../components/InvoiceSheet'
import type { Invoice } from '../types'

export default function Invoices() {
  const list = useLiveQuery(() => db.invoices.orderBy('date').reverse().toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const [edit, setEdit] = useState<{ inv: Invoice | null } | null>(null)
  const names = new Map((products ?? []).map((p) => [p.id, p.name]))
  const sum = (list ?? []).reduce((s, i) => s + (i.total ?? 0), 0)
  return (
    <div className="page">
      <header className="page-head"><Link to="/collection" className="back" aria-label="Zurück">‹</Link><h1>Belege</h1>
        <button className="btn small-btn primary" onClick={() => setEdit({ inv: null })}>+ Rechnung</button></header>
      {list && list.length === 0 && <Empty icon="🧾" title="Noch keine Rechnungen" text="Fotografiere eine Rechnung und ordne ihr die gekauften Produkte zu – eine Rechnung kann an mehreren Produkten hängen.">
        <button className="btn primary" onClick={() => setEdit({ inv: null })}>Rechnung hinzufügen</button></Empty>}
      {list && list.length > 0 && <p className="muted small">{list.length} Rechnung{list.length === 1 ? '' : 'en'} · {formatEur(sum)} laut Rechnungen</p>}
      <ul className="invoice-list">{(list ?? []).map((i) => (
        <li key={i.id}>
          <button className="invoice-thumb" onClick={() => setEdit({ inv: i })} aria-label={`Rechnung bearbeiten, ${i.merchant || 'ohne Händler'}, ${isoToDe(i.date)}`}><img src={i.photo} alt="" /></button>
          <div className="grow"><strong>{i.merchant || 'Rechnung'}</strong>
            <small className="muted">{isoToDe(i.date)}{i.total != null ? ` · ${formatEur(i.total)}` : ''}</small>
            <small className="muted">{i.refIds.map((r) => names.get(r) ?? 'Entferntes Produkt').join(', ') || 'Keine Produkte zugeordnet'}</small></div>
        </li>))}</ul>
      <InvoiceSheet open={!!edit} invoice={edit?.inv} onClose={() => setEdit(null)} />
    </div>
  )
}

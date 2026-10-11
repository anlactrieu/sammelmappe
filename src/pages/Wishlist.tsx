import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { cardBasePrice } from '../lib/pricing'
import { formatEur, isBadAmount, parseEur } from '../lib/format'
import { cardNames } from '../services/names'
import { langTag } from '../lib/lang'
import { imageUrl } from '../services/tcgdex'
import { Empty, useToast } from '../components/ui'
import { AddCardSheet } from '../components/CardSheets'
import type { CardRef } from '../types'

export default function Wishlist() {
  const toast = useToast()
  const wishes = useLiveQuery(() => db.wishlist.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const [adding, setAdding] = useState<CardRef | null>(null)
  if (!wishes || !cards) return <div className="page"><div className="skeleton hero" /></div>
  const cm = new Map(cards.map((c) => [c.id, c]))
  return (
    <div className="page">
      <header className="page-head"><h1>Wunschliste</h1></header>
      {wishes.length === 0 && <Empty icon="♡" title="Noch keine Wünsche" text="Beim Hinzufügen einer Karte findest du „Merken“. Setze einen Zielpreis und sieh sofort, wenn sie günstig wird.">
        <Link className="btn primary" to="/add">Karte suchen</Link></Empty>}
      <ul className="list">
        {wishes.map((w) => {
          const c = cm.get(w.cardId); if (!c) return null
          const p = cardBasePrice(c, 'normal')?.value ?? null
          const hit = p != null && w.targetPrice != null && p <= w.targetPrice
          return (
            <li key={w.id} className={`wish${hit ? ' hit' : ''}`}>
              <img src={imageUrl(c.image)} alt="" loading="lazy" />
              <div className="grow"><strong>{cardNames(c).name}{c.lang && <> <b className="langtag">{langTag(c.lang)}</b></>}</strong><small className="muted">{c.setName} · {c.localId}</small>
                <small>{formatEur(p)}{hit && <b className="up"> · unter Zielpreis!</b>}</small>
                <label className="inline">Zielpreis <input inputMode="decimal" defaultValue={w.targetPrice != null ? String(w.targetPrice).replace('.', ',') : ''} placeholder="€"
                  onBlur={(e) => { if (isBadAmount(e.target.value)) return toast('Ungültiger Betrag, z. B. 4,50'); db.wishlist.update(w.id!, { targetPrice: parseEur(e.target.value) }) }} aria-label={`Zielpreis für ${c.name}`} /></label>
              </div>
              <div className="col">
                <button className="btn small-btn primary" onClick={() => setAdding(c)}>Habe ich</button>
                <button className="icon-btn" aria-label="Entfernen" onClick={() => { db.wishlist.delete(w.id!); toast('Entfernt') }}>✕</button>
              </div>
            </li>)
        })}
      </ul>
      <AddCardSheet card={adding} onClose={() => setAdding(null)} onAdded={() => adding && db.wishlist.where('cardId').equals(adding.id).delete()} />
    </div>
  )
}

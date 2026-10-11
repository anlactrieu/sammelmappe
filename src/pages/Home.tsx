import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from '../db'
import { useCollection, type Row } from '../hooks'
import { priceChange } from '../lib/pricing'
import { formatEur, formatPct, relativeTime } from '../lib/format'
import { syncPrices } from '../services/priceSync'
import { imageUrl } from '../services/tcgdex'
import { Empty, Segmented, Sparkline, useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import { saveSnapshot } from '../services/priceSync'

export function RefreshButton({ className = 'btn' }: { className?: string }) {
  const toast = useToast()
  const [prog, setProg] = useState<[number, number] | null>(null)
  const run = async () => {
    if (!navigator.onLine) return toast('Offline – Preise können gerade nicht geladen werden')
    setProg([0, 1])
    const r = await syncPrices((d, t) => setProg([d, t]))
    setProg(null)
    toast(r.total === 0 ? 'Keine Karten zum Aktualisieren' : r.failed ? `${r.updated} aktualisiert, ${r.failed} fehlgeschlagen` : `${r.updated} Preise aktualisiert ✓`)
  }
  return <button className={className} onClick={run} disabled={!!prog}>{prog ? `Lade ${prog[0]}/${prog[1]} …` : <><Icon name="refresh" size={18} />&nbsp;Preise aktualisieren</>}</button>
}

export default function Home() {
  const { rows, totals, ready } = useCollection()
  const [days, setDays] = useState<7 | 30>(7)
  const snaps = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), [])
  const lastSync = useLiveQuery(() => getSetting<number>('lastSync', 0), [])
  useEffect(() => { if (ready && rows.length) saveSnapshot().catch(() => undefined) }, [ready, totals.value, totals.count, rows.length])
  if (!ready) return <div className="page"><div className="skeleton hero" /></div>
  if (rows.length === 0) return (
    <div className="page">
      <Empty icon="🎴" title="Willkommen bei Sammelmappe" text="In drei Schritten zum Marktwert deiner Sammlung:">
        <ol className="steps">
          <li><span><strong>Scannen oder suchen</strong><br /><small className="muted">Kartennummer unten am Rand (z. B. 025/198) oder Produkt-Barcode in die Kamera halten.</small></span></li>
          <li><span><strong>Zustand &amp; Variante wählen</strong><br /><small className="muted">Menge, Zustand, Holo/Reverse und optional dein Kaufpreis.</small></span></li>
          <li><span><strong>Wert ansehen</strong><br /><small className="muted">Cardmarket-Richtwerte aktualisieren sich täglich; Preise kannst du jederzeit selbst überschreiben.</small></span></li>
        </ol>
        <div className="actions"><Link className="btn primary" to="/scan">Karte scannen</Link><Link className="btn" to="/add">Per Suche hinzufügen</Link></div>
        <p className="muted small">Du hast schon ein Backup? Unter Profil kannst du es einspielen.</p>
        <Link className="link" to="/settings">Zu Profil & Backup →</Link>
      </Empty>
    </div>
  )
  // Gewinn/Verlust nur für Einträge mit Kaufpreis – sonst würde der Gesamtwert gegen einen Teil der Kosten verglichen
  const diff = totals.costedValue - totals.cost
  const pct = totals.cost > 0 ? (diff / totals.cost) * 100 : null
  const top = [...rows].filter((r) => r.price.value != null).sort((a, b) => b.price.value! * b.item.qty - a.price.value! * a.item.qty).slice(0, 5)
  const stale = rows.some((r) => r.price.stale)
  const bySet = Object.values(rows.reduce<Record<string, { name: string; value: number }>>((acc, r) => {
    const name = r.card?.setName ?? r.product?.setName ?? (r.item.kind === 'product' ? 'Produkte' : 'Sonstige')
    if (r.price.value != null) (acc[name] ??= { name, value: 0 }).value += r.price.value * r.item.qty
    return acc
  }, {})).sort((a, b) => b.value - a.value).slice(0, 5)
  const maxSet = bySet[0]?.value || 1
  const movers = rows.filter((r) => r.card && r.item.kind === 'card' && !r.item.manualPrice)
    .map((r) => ({ r, pct: priceChange(r.card!, days, r.item.variant === 'reverse') }))
    .filter((m): m is { r: Row; pct: number } => m.pct != null && Math.abs(m.pct) >= 0.5)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4)
  return (
    <div className="page">
      <header className="page-head"><h1>Deine Sammlung</h1></header>
      <section className="hero card">
        <p className="eyebrow">Gesamtwert</p>
        <p className="hero-value">{formatEur(totals.value)}</p>
        <p className="muted">{totals.count} Stück{totals.missing ? ` · ${totals.missing} ohne Preis` : ''}</p>
        {totals.cost > 0 && (
          <p className={`pill ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? '▲' : '▼'} {formatEur(Math.abs(diff))}{pct != null ? ` (${formatPct(pct)})` : ''} ggü. Kaufpreis{totals.costed < totals.count ? ` (nur ${totals.costed} von ${totals.count} Stück mit Kaufpreis)` : ''}</p>
        )}
        <Sparkline points={(snaps ?? []).slice(-30).map((s) => s.value)} />
        <div className="sync-row">
          <span className={`small ${stale ? 'warn' : 'muted'}`}>Stand: {relativeTime(lastSync)}{stale ? ' – Preise teils veraltet' : ''}</span>
          <RefreshButton className="btn small-btn" />
        </div>
      </section>

      <div className="actions" style={{ marginTop: 0 }}><Link className="btn primary" to="/add">Karte hinzufügen</Link><Link className="btn" to="/add?mode=product">Produkt hinzufügen</Link></div>

      {totals.missing > 0 && <Link to="/collection?filter=missing" className="banner">⚠ {totals.missing} {totals.missing === 1 ? 'Eintrag' : 'Einträge'} ohne Preis – jetzt ergänzen →</Link>}

      {bySet.length > 0 && <section>
        <h2>Wert nach Set</h2>
        {bySet.map((s) => (
          <div key={s.name} className="bar-row"><span>{s.name}</span><strong>{formatEur(s.value)}</strong>
            <div className="bar" aria-hidden><i style={{ width: `${(s.value / maxSet) * 100}%` }} /></div></div>))}
      </section>}

      <section>
        <div className="page-head"><h2>Bewegungen</h2>
          <Segmented label="Zeitraum" value={String(days) as '7' | '30'} onChange={(v) => setDays(v === '7' ? 7 : 30)} options={[{ value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }]} /></div>
        {movers.length === 0 ? <p className="muted small">Keine nennenswerten Preisänderungen.</p> : movers.map(({ r, pct }) => (
          <div key={r.item.id} className="mover"><div className="grow"><strong>{r.name}</strong><small className="muted">{r.sub}</small></div>
            <strong className={pct >= 0 ? 'up' : 'down'}>{pct >= 0 ? '▲' : '▼'} {formatPct(Math.abs(pct)).replace('+', '')}</strong></div>))}
        <p className="muted small">Cardmarket-Trend gegenüber dem {days}-Tage-Schnitt.</p>
      </section>

      <section>
        <h2>Wertvollste Stücke</h2>
        <ol className="toplist">
          {top.map((r, i) => (
            <li key={r.item.id}>
              <span className="rank">{i + 1}</span>
              {r.image ? <img src={imageUrl(r.image)} alt="" loading="lazy" /> : <span className="thumb-ph"><Icon name="box" /></span>}
              <div className="grow"><strong>{r.name}</strong><small className="muted">{r.sub}{r.item.qty > 1 ? ` · ${r.item.qty}×` : ''}</small></div>
              <strong>{formatEur(r.price.value! * r.item.qty)}</strong>
            </li>))}
        </ol>
      </section>
    </div>
  )
}

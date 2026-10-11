import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../db'
import { download, exportCsv, exportJson, importJson } from '../services/backup'
import { relativeTime } from '../lib/format'
import { useToast } from '../components/ui'
import { RefreshButton } from './Home'
import { catalogTime, loadCatalog, type Catalog } from '../services/catalog'
import { syncProductPrices } from '../services/priceSync'
import { useEffect, useState } from 'react'

export default function Settings() {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const last = useLiveQuery(() => getSetting<number>('lastSync', 0), [])
  const lastBackup = useLiveQuery(() => getSetting<number>('lastBackup', 0), [])
  const [cat, setCat] = useState<Catalog | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { loadCatalog().then(setCat) }, [])
  const refreshCatalog = async () => {
    setBusy(true)
    try {
      const r = await fetch('./api/refresh-catalog', { method: 'POST' })
      const j = r.ok ? await r.json() : null
      if (!j) toast('Nur über den Entwicklungsserver möglich. Im Terminal: npm run catalog')
      else { const c = await loadCatalog(true); setCat(c); const n = await syncProductPrices(); toast(j.ok ? `${j.out.split('\n').pop()} · ${n} Produktpreise aktualisiert` : `Fehler: ${j.out}`) }
    } catch { toast('Aktualisierung fehlgeschlagen – offline?') } finally { setBusy(false) }
  }
  const date = () => new Date().toISOString().slice(0, 10)

  const onImport = async (f?: File) => {
    if (!f) return
    const reset = () => { if (file.current) file.current.value = '' }
    if (!confirm('Import ersetzt deine aktuelle Sammlung. Fortfahren?')) return reset()
    try { toast(`${await importJson(await f.text())} Einträge importiert`) } catch (e) { toast((e as Error).message) }
    reset()
  }
  const wipe = async () => {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return
    await Promise.all(db.tables.map((t) => t.clear())); toast('Alles gelöscht')
  }
  return (
    <div className="page">
      <header className="page-head"><h1>Profil & Daten</h1></header>
      <section className="card">
        <h2>Preise</h2>
        <p className="muted">Quelle: Cardmarket (EUR) über TCGdex, täglich aktualisiert. Letzter Abruf: {relativeTime(last).replace(/\.$/, '')}. Beim Öffnen der App wird automatisch aktualisiert, wenn die Preise älter als 24 Std. sind.</p>
        <RefreshButton className="btn primary" />
      </section>
      <section className="card">
        <h2>Produktkatalog</h2>
        <p className="muted">Versiegelte Produkte (Booster Bundle, ETB, Displays …) samt Bild und Marktpreis. Quelle: TCGplayer (US-Markt, USD, umgerechnet) über tcgcsv.com – einmal täglich aktualisiert.{cat ? ` Stand: ${relativeTime(catalogTime(cat))}, ${cat.products.length.toLocaleString('de-DE')} Produkte.` : ' Noch kein Katalog vorhanden.'}</p>
        <button className="btn primary" disabled={busy} onClick={refreshCatalog}>{busy ? 'Lade …' : 'Katalog aktualisieren'}</button>
      </section>
      <section className="card">
        <h2>Sicherung</h2>
        <p className="muted">Deine Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig. Letztes Backup: {relativeTime(lastBackup).replace(/\.$/, '')}.</p>
        <div className="actions">
          <button className="btn" onClick={async () => { download(`sammelmappe-${date()}.json`, await exportJson(), 'application/json'); await setSetting('lastBackup', Date.now()) }}>Backup (JSON)</button>
          <button className="btn" onClick={async () => download(`sammlung-${date()}.csv`, await exportCsv(), 'text/csv;charset=utf-8')}>Export (CSV/Excel)</button>
          <button className="btn" onClick={() => file.current?.click()}>Backup einspielen</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
      </section>
      <section className="card">
        <h2>Gefahrenzone</h2>
        <button className="btn danger" onClick={wipe}>Alle Daten löschen</button>
      </section>
      <p className="muted small center">Sammelmappe · inoffiziell, nicht mit Nintendo, The Pokémon Company oder Cardmarket verbunden. Preise sind Richtwerte ohne Gewähr.</p>
    </div>
  )
}

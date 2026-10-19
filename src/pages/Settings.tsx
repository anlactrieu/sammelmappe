import { useRef } from 'react'
import { Link } from 'react-router-dom'
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
  const [diag, setDiag] = useState<[string, string, boolean][] | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  const runDiag = async () => {
    setDiagBusy(true)
    const rows: [string, string, boolean][] = []
    const step = async (name: string, f: () => Promise<string>) => {
      const t0 = performance.now()
      try { rows.push([name, `${await Promise.race([f(), new Promise<string>((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung (8 s)')), 8000))])} · ${Math.round(performance.now() - t0)} ms`, true]) }
      catch (e) { rows.push([name, (e as Error).message || String(e), false]) }
      setDiag([...rows])
    }
    await step('Online', async () => (navigator.onLine ? 'ja' : 'nein'))
    await step('Datenbank im Gerät', async () => `${await db.items.count()} Einträge`)
    await step('Kartensuche (TCGdex, Glurak)', async () => { const r = await fetch('https://api.tcgdex.net/v2/de/cards?name=Glurak'); if (!r.ok) throw new Error('HTTP ' + r.status); return `${(await r.json()).length} Treffer` })
    await step('Kartenbilder (TCGdex)', async () => { const r = await fetch('https://assets.tcgdex.net/de/sv/sv01/025/low.webp'); if (!r.ok) throw new Error('HTTP ' + r.status); return 'ok' })
    await step('Produktkatalog', async () => { const c = await loadCatalog(true); if (!c) throw new Error('nicht geladen'); return `${c.products.length} Produkte` })
    await step('Service Worker', async () => { const r = await navigator.serviceWorker?.getRegistration(); return r ? `aktiv (${r.active ? 'läuft' : 'wartet'})` : 'keiner' })
    await step('Sprache der Suche', async () => localStorage.getItem('cardLang') || 'de (Standard)')
    setDiagBusy(false)
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
        <h2>Diagnose</h2>
        <p className="muted small">Version: {__BUILD__}. Wenn etwas nicht funktioniert (z. B. Suche liefert nichts), drücke „Verbindung testen“ und schick mir das Ergebnis.</p>
        <button className="btn" disabled={diagBusy} onClick={runDiag}>{diagBusy ? 'Teste …' : 'Verbindung testen'}</button>
        {diag && <ul className="diag">{diag.map(([k, v, ok]) => <li key={k} className={ok ? 'ok' : 'bad'}><b>{ok ? '✓' : '✗'}</b> {k}: {v}</li>)}</ul>}
      </section>
      <section className="card">
        <h2>Produktkatalog</h2>
        <p className="muted">Versiegelte Produkte (Booster Bundle, ETB, Displays …) samt Bild und Marktpreis. Quelle: TCGplayer (US-Markt, USD, umgerechnet) über tcgcsv.com – einmal täglich aktualisiert.{cat ? ` Stand: ${relativeTime(catalogTime(cat))}, ${cat.products.length.toLocaleString('de-DE')} Produkte.` : ' Noch kein Katalog vorhanden.'}</p>
        <button className="btn primary" disabled={busy} onClick={refreshCatalog}>{busy ? 'Lade …' : 'Katalog aktualisieren'}</button>
      </section>
      <section className="card">
        <h2>Sicherung</h2>
        <p className="muted">Deine Daten (auch Rechnungsfotos) liegen nur auf diesem Gerät. Sichere sie regelmäßig – das Backup wird mit Rechnungen größer. Letztes Backup: {relativeTime(lastBackup).replace(/\.$/, '')}.</p>
        <div className="actions">
          <button className="btn" onClick={async () => { download(`sammelmappe-${date()}.json`, await exportJson(), 'application/json'); await setSetting('lastBackup', Date.now()) }}>Backup (JSON)</button>
          <button className="btn" onClick={async () => download(`sammlung-${date()}.csv`, await exportCsv(), 'text/csv;charset=utf-8')}>Export (CSV/Excel)</button>
          <button className="btn" onClick={() => file.current?.click()}>Backup einspielen</button>
          <Link className="btn" to="/rechnungen">Belege &amp; Rechnungen</Link>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
      </section>
      <section className="card">
        <h2>Gefahrenzone</h2>
        <button className="btn danger" onClick={wipe}>Alle Daten löschen</button>
      </section>
      <p className="muted small center">Sammelmappe · inoffiziell, nicht mit Nintendo, The Pokémon Company oder Cardmarket verbunden. Preise sind Richtwerte ohne Gewähr. This product uses TCGplayer data but is not endorsed or certified by TCGplayer. · <Link className="link" to="/datenschutz">Datenschutz</Link></p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { deleteInvoice, saveInvoice, setInvoiceLink } from '../lib/actions'
import { formatEur, isBadAmount, isoToDe, localDateIso, parseEur } from '../lib/format'
import { fileToThumb } from '../lib/photo'
import type { Invoice } from '../types'
import { Lightbox } from './Lightbox'
import { Sheet, useToast } from './ui'

const today = () => localDateIso()

/** Rechnung anlegen/bearbeiten: ein Foto, Händler, Datum, Betrag und die Produkte, die darauf stehen. */
export function InvoiceSheet({ open, invoice, presetRefId, onClose }: { open: boolean; invoice?: Invoice | null; presetRefId?: string; onClose: () => void }) {
  const toast = useToast()
  const [photo, setPhoto] = useState('')
  const [date, setDate] = useState(today())
  const [merchant, setMerchant] = useState('')
  const [total, setTotal] = useState('')
  const [note, setNote] = useState('')
  const [refIds, setRefIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const owned = useLiveQuery(async () => {
    const ids = [...new Set((await db.items.where('kind').equals('product').toArray()).map((i) => i.refId))]
    return (await db.products.bulkGet(ids)).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [])

  useEffect(() => {
    if (!open) return
    setPhoto(invoice?.photo ?? ''); setDate(invoice?.date ?? today()); setMerchant(invoice?.merchant ?? '')
    setTotal(invoice?.total != null ? String(invoice.total).replace('.', ',') : ''); setNote(invoice?.note ?? '')
    setRefIds(invoice?.refIds ?? (presetRefId ? [presetRefId] : []))
  }, [open, invoice, presetRefId])

  const onPhoto = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try { setPhoto((await fileToThumb(file, 1600)).dataUrl) } catch (e) { toast(`Foto konnte nicht verarbeitet werden: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const toggle = (id: string) => setRefIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))

  const save = async () => {
    if (!photo) return toast('Bitte zuerst die Rechnung fotografieren')
    if (isBadAmount(total)) return toast('Bitte einen gültigen Betrag eingeben, z. B. 84,95')
    try {
      await saveInvoice({ id: invoice?.id, createdAt: invoice?.createdAt, date, merchant: merchant.trim(), total: parseEur(total), photo, note: note.trim() || undefined, refIds })
    } catch (e) { return toast(`Speichern fehlgeschlagen (Speicher voll?): ${(e as Error).message || e}`) }
    toast('Rechnung gespeichert'); onClose()
  }
  const del = async () => {
    if (!invoice) return
    if (confirm(`Rechnung${invoice.merchant ? ` von ${invoice.merchant}` : ''} löschen? Sie hängt an ${invoice.refIds.length} Produkt${invoice.refIds.length === 1 ? '' : 'en'}.`)) { await deleteInvoice(invoice.id); toast('Rechnung gelöscht'); onClose() }
  }

  return (
    <Sheet open={open} onClose={onClose} title={invoice ? 'Rechnung bearbeiten' : 'Neue Rechnung'} footer={<>
      <button className="btn primary grow-btn" onClick={save} disabled={busy}>Speichern</button>
      {invoice && <button className="btn danger" onClick={del}>Löschen</button>}
    </>}>
      {photo && <img src={photo} alt="Foto der Rechnung" className="invoice-photo" />}
      <label className="btn invoice-pick">{photo ? 'Anderes Foto' : 'Rechnung fotografieren'}
        <input type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
      <div className="row2">
        <label className="field">Datum<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Gesamtbetrag<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="optional" /></label>
      </div>
      <label className="field">Händler<input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="z. B. Amazon, Cardmarket" /></label>
      <fieldset className="invoice-products"><legend>Produkte auf dieser Rechnung</legend>
        {owned && owned.length === 0 && <p className="muted small">Noch keine Produkte in der Sammlung – füge sie zuerst hinzu.</p>}
        {owned?.map((p) => (
          <label key={p.id} className="invoice-check"><input type="checkbox" checked={refIds.includes(p.id)} onChange={() => toggle(p.id)} /><span>{p.name}</span></label>))}
        {refIds.filter((id) => !owned?.some((p) => p.id === id)).length > 0 && <p className="muted small">{refIds.filter((id) => !owned?.some((p) => p.id === id)).length} verknüpfte(s) Produkt(e) nicht mehr in der Sammlung.</p>}
      </fieldset>
      <label className="field">Notiz<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="hint">Die Rechnung bleibt nur auf diesem Gerät und ist im Backup enthalten.</p>
    </Sheet>
  )
}

/** Abschnitt im Produktfenster: verknüpfte Rechnungen ansehen, bestehende zuordnen oder neue anlegen. */
export function ProductInvoices({ refId }: { refId: string }) {
  // Fotos sind groß: nur die verknüpften Rechnungen laden (Index auf refIds), die übrigen erst auf Wunsch
  const linked = useLiveQuery(() => db.invoices.where('refIds').equals(refId).reverse().sortBy('date'), [refId])
  const total = useLiveQuery(() => db.invoices.count(), [])
  const [pick, setPick] = useState(false)
  const others = useLiveQuery(async () => (pick ? (await db.invoices.orderBy('date').reverse().toArray()).filter((i) => !i.refIds.includes(refId)) : []), [pick, refId])
  const [zoom, setZoom] = useState<Invoice | null>(null)
  const [edit, setEdit] = useState<{ inv: Invoice | null } | null>(null)
  if (!linked) return null
  return (
    <section className="invoice-section" aria-label="Rechnungen">
      <h3>Rechnung</h3>
      {linked.length === 0 && <p className="muted small">Noch keine Rechnung zugeordnet.</p>}
      <ul className="invoice-list">{linked.map((i) => (
        <li key={i.id}>
          <button className="invoice-thumb" onClick={() => setZoom(i)} aria-label={`Rechnung ansehen, ${i.merchant || 'ohne Händler'}, ${i.date}`}><img src={i.photo} alt="" /></button>
          <div className="grow"><strong>{i.merchant || 'Rechnung'}</strong><small className="muted">{isoToDe(i.date)}{i.total != null ? ` · ${formatEur(i.total)}` : ''} · {i.refIds.length} Produkt{i.refIds.length === 1 ? '' : 'e'}</small></div>
          <button className="btn small-btn" onClick={() => setEdit({ inv: i })}>Bearbeiten</button>
        </li>))}</ul>
      <div className="actions">
        <button className="btn" onClick={() => setEdit({ inv: null })}>Neue Rechnung</button>
        {(total ?? 0) > linked.length && !pick && <button className="btn" onClick={() => setPick(true)}>Bestehende zuordnen …</button>}
        {pick && others && <select aria-label="Bestehende Rechnung zuordnen" value="" onChange={(e) => { if (e.target.value) setInvoiceLink(e.target.value, refId, true); setPick(false) }}>
          <option value="">Rechnung wählen …</option>
          {others.map((i) => <option key={i.id} value={i.id}>{`${isoToDe(i.date)} · ${i.merchant || 'Rechnung'}`}</option>)}</select>}
      </div>
      {linked.length > 0 && <p className="hint">Änderungen an einer Rechnung gelten für alle ihre Produkte.</p>}
      <InvoiceSheet open={!!edit} invoice={edit?.inv} presetRefId={refId} onClose={() => setEdit(null)} />
      {zoom && <Lightbox src={zoom.photo} alt={`Rechnung ${zoom.merchant}`.trim()} onClose={() => setZoom(null)} />}
    </section>
  )
}

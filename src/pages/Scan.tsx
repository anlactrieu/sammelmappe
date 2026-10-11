import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddCardSheet } from '../components/CardSheets'
import { ProductSheet } from '../components/ProductSheet'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { catalogImage } from '../services/catalog'
import { analyzePhoto, type Analysis, type ProductHit } from '../services/analyze'
import { learnPhoto } from '../services/imageSearch'
import { cardNames } from '../services/names'
import { imageUrl } from '../services/tcgdex'
import { fileToThumb } from '../lib/photo'
import { formatEur } from '../lib/format'
import { langTag } from '../lib/lang'
import type { CardRef } from '../types'

/**
 * Foto machen → App erkennt → antippen. Kein Dauerlauf, kein Halten: Das Handy kann nach dem Auslösen weggelegt werden.
 * Mehrere Fotos aus der Galerie werden nacheinander ausgewertet.
 */
export default function Scan() {
  const nav = useNavigate()
  const toast = useToast()
  const [queue, setQueue] = useState<File[]>([])
  const [pos, setPos] = useState(0)
  const [thumb, setThumb] = useState<string>()
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'results'>('idle')
  const [status, setStatus] = useState('')
  const [res, setRes] = useState<Analysis | null>(null)
  const [card, setCard] = useState<CardRef | null>(null)
  const [prefill, setPrefill] = useState<{ c: ProductHit['p']; eur: number | null } | undefined>()
  const [added, setAdded] = useState(0)
  const run = useRef(0)
  const cam = useRef<HTMLInputElement>(null)
  const [kind, setKindState] = useState<'card' | 'product'>(() => { try { return localStorage.getItem('snapKind') === 'product' ? 'product' : 'card' } catch { return 'card' } })
  const setKind = (k: 'card' | 'product') => { setKindState(k); try { localStorage.setItem('snapKind', k) } catch { /* privater Modus */ } }
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb) }, [thumb])

  const analyze = async (file: File) => {
    const id = ++run.current
    setPhase('analyzing'); setRes(null); setStatus('Foto wird geladen …')
    setThumb((t) => { if (t) URL.revokeObjectURL(t); return URL.createObjectURL(file) })
    try {
      const { canvas } = await fileToThumb(file, 1400)
      const r = await analyzePhoto(canvas, (s) => { if (id === run.current) setStatus(s) }, kind)
      if (id !== run.current) return
      setRes(r); setPhase('results')
    } catch (e) {
      if (id !== run.current) return
      setRes({ cards: [], products: [], first: 'cards', index: { cards: false, products: false } }); setPhase('results')
      toast(`Foto konnte nicht ausgewertet werden: ${(e as Error).message || 'unbekannter Fehler'}`)
    }
  }

  const start = (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/') || f.type === '')
    if (!list.length) return
    setQueue(list); setPos(0); analyze(list[0])
  }
  const next = () => {
    if (pos + 1 < queue.length) { setPos(pos + 1); analyze(queue[pos + 1]) } else { setPhase('idle'); setQueue([]); setPos(0); setRes(null) }
  }
  /** „Nichts davon“: zurück zum Start und sofort die Kamera für ein neues Foto öffnen */
  const retake = () => {
    run.current++
    setPhase('idle'); setRes(null); setQueue([]); setPos(0)
    setThumb((t) => { if (t) URL.revokeObjectURL(t); return undefined })
    setTimeout(() => cam.current?.click(), 60)
  }
  const afterAdd = () => { if (picked != null && res?.vec) learnPhoto(picked, res.vec).catch(() => undefined); setPicked(null); setAdded((n) => n + 1); setCard(null); setPrefill(undefined); next() }

  const pickProduct = (h: ProductHit) => {
    setPicked(h.p.id)
    setPrefill({ c: h.p, eur: h.eur })
  }

  const sections = res ? ((kind === 'product' ? ['products'] : ['cards']) as ('products' | 'cards')[]) : []

  return (
    <div className="page snap">
      <header className="page-head">
        <h1>Foto</h1>
        {added > 0 && <Link className="btn small-btn scan-done" to="/collection">Fertig ({added})</Link>}
      </header>

      {phase === 'idle' && (<div className="snap-idle">
        <div>
          <h2 className="snap-q">Was möchtest du erfassen?</h2>
          <div className="kind-grid" role="radiogroup" aria-label="Was fotografierst du?">
            <button role="radio" aria-checked={kind === 'card'} className={`kind${kind === 'card' ? ' on' : ''}`} onClick={() => setKind('card')}>
              <span className="kind-art kind-card" aria-hidden />
              <strong>Karte</strong><small>Einzelkarte, jede Sprache</small>
            </button>
            <button role="radio" aria-checked={kind === 'product'} className={`kind${kind === 'product' ? ' on' : ''}`} onClick={() => setKind('product')}>
              <span className="kind-art kind-box" aria-hidden />
              <strong>Produkt</strong><small>Booster, Box, Tin, Blister</small>
            </button>
          </div>
          <p className="snap-hint">{kind === 'card'
            ? 'Ganze Vorderseite, möglichst bildfüllend und von oben.'
            : 'Ganze Vorderseite. Ein Barcode im Bild hilft zusätzlich.'} Besser ohne Spiegelung.</p>
        </div>
        <div className="snap-actions">
          <label className="btn primary snap-btn">
            <Icon name="camera" size={26} /> {kind === 'card' ? 'Karte fotografieren' : 'Produkt fotografieren'}
            <input ref={cam} type="file" accept="image/*" capture="environment" className="file-overlay" onChange={(e) => { start(e.target.files); e.target.value = '' }} />
          </label>
          <label className="btn snap-alt">
            Fotos aus der Galerie
            <input type="file" accept="image/*" multiple className="file-overlay" onChange={(e) => { start(e.target.files); e.target.value = '' }} />
          </label>
          <Link className="link snap-link" to="/quick">Lieber tippen statt fotografieren →</Link>
        </div>
      </div>)}

      {phase !== 'idle' && (
        <div className="snap-photo">
          {thumb && <img src={thumb} alt="Dein Foto" />}
          <div className="grow">
            {queue.length > 1 && <small className="muted">Foto {pos + 1} von {queue.length}</small>}
            <strong>{phase === 'analyzing' ? 'Wird erkannt …' : 'Das ist es?'}</strong>
            {phase === 'analyzing' && <small className="muted" role="status">{status}</small>}
            {phase === 'results' && res && !res.cards.length && !res.products.length && <small className="muted">Nichts erkannt.</small>}
          </div>
        </div>
      )}

      {phase === 'results' && res && (<>
        {sections.map((sec) => sec === 'cards' ? (res.cards.length > 0 && (
          <section key="cards">
            <h2>Karte wählen</h2>
            <ul className="grid">
              {res.cards.map((c) => (
                <li key={c.id}><button className="tile" onClick={() => setCard(c)}>
                  <div className="tile-img">{c.image ? <img src={imageUrl(c.image)} alt="" /> : <span className="thumb-ph big">{c.localId}</span>}</div>
                  <strong className="tile-name">{c.lang && <><b className="langtag">{langTag(c.lang)}</b> </>}{cardNames(c).name}</strong>
                  <small className="muted tile-sub">{c.setName} · {c.localId}</small>
                </button></li>))}
            </ul>
          </section>)) : (res.products.length > 0 && (
          <section key="products">
            <h2>Produkt wählen</h2>
            <ul className="list">
              {res.products.map((h) => (
                <li key={h.p.id}><button className="rowbtn" onClick={() => pickProduct(h)}>
                  <img src={catalogImage(h.p)} alt="" loading="lazy" />
                  <div className="grow"><strong>{h.p.l && <><b className="langtag">{h.p.l}</b> </>}{h.p.n}</strong></div>
                  <span className="price"><strong>{h.eur != null ? `${h.p.e != null ? '' : '≈ '}${formatEur(h.eur)}` : 'kein Preis'}</strong></span>
                </button></li>))}
            </ul>
          </section>)))}

        {((kind === 'card' && !res.index.cards) || (kind === 'product' && !res.index.products && !res.ean)) && <p className="hint">Die Bilderkennung für {kind === 'card' ? 'Karten' : 'Produkte'} ist gerade nicht verfügbar (offline oder noch im Aufbau). Suche in dem Fall per Namen.</p>}
        {kind === 'card' && res.cards.length === 0 && res.index.cards && <p className="hint">Keine passende Karte gefunden. Foto näher und gerade aufnehmen oder per Namen suchen.</p>}
        {kind === 'product' && res.products.length === 0 && res.index.products && <p className="hint">Kein passendes Produkt gefunden. Ganze Vorderseite fotografieren oder per Namen suchen.</p>}
        {res.ean && <p className="muted small">Barcode gelesen: <code>{res.ean}</code></p>}

        <div className="actions">
          <button className="btn primary" onClick={pos + 1 < queue.length ? next : retake}>{pos + 1 < queue.length ? 'Weiter zum nächsten Foto' : 'Nichts davon – neues Foto'}</button>
          <button className="btn ghost" onClick={() => { setKind(kind === 'card' ? 'product' : 'card'); setPhase('idle'); setRes(null); setQueue([]) }}>{kind === 'card' ? 'Es ist ein Produkt' : 'Es ist eine Karte'}</button>
          <Link className="btn ghost" to="/quick">Per Namen erfassen</Link>
        </div>
      </>)}

      <AddCardSheet card={card} onClose={() => setCard(null)} onAdded={afterAdd} />
      <ProductSheet open={prefill != null} ean={res?.ean} prefill={prefill} onClose={() => setPrefill(undefined)} onAdded={afterAdd} />
      {phase === 'idle' && added > 0 && <button className="btn ghost" onClick={() => nav('/collection')}>Zur Sammlung</button>}
    </div>
  )
}

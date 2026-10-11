import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Segmented, Sheet } from '../components/ui'
import { LangChips } from '../components/LangChips'
import type { Lang } from '../lib/lang'
import { AddCardSheet } from '../components/CardSheets'
import { ProductSheet } from '../components/ProductSheet'
import { detectEan } from '../services/barcode'
import { readCardNumber } from '../services/ocr'
import { findByPhoto } from '../services/photoFind'
import { ProductPicker } from '../components/ProductPicker'
import type { CatalogProduct } from '../services/catalog'
import { imageUrl, resolveByNumber } from '../services/tcgdex'
import { normalizeEan, parseCardText } from '../lib/parse'
import type { CardRef } from '../types'

type Mode = 'card' | 'barcode' | 'photo'
const MODE_HELP: Record<Mode, { banner: string; status: string }> = {
  card: { banner: 'Karte scannen', status: 'Halte die Karte ruhig in den Rahmen' },
  barcode: { banner: 'Barcode scannen', status: 'Barcode der Verpackung in den Rahmen halten – wird automatisch erkannt' },
  photo: { banner: 'Produkt fotografieren', status: 'Ganze Vorderseite ins Bild, dann „Foto aufnehmen“' },
}

export default function Scan() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [cardLang, setCardLangState] = useState<Lang>(() => { try { return (localStorage.getItem('cardLang') as Lang) || 'de' } catch { return 'de' } })
  const setCardLang = (l: Lang) => { setCardLangState(l); try { localStorage.setItem('cardLang', l) } catch { /* privater Modus */ } }
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'barcode' ? 'barcode' : params.get('mode') === 'photo' ? 'photo' : 'card')
  const video = useRef<HTMLVideoElement>(null)
  const frameEl = useRef<HTMLDivElement>(null)
  const [camError, setCamError] = useState('')
  const [status, setStatus] = useState(MODE_HELP[params.get('mode') === 'barcode' ? 'barcode' : params.get('mode') === 'photo' ? 'photo' : 'card'].status)
  const [cands, setCands] = useState<CardRef[]>([])
  const [card, setCard] = useState<CardRef | null>(null)
  const [ean, setEan] = useState<string | undefined>()
  const [series, setSeriesState] = useState(() => { try { return localStorage.getItem('scanSeries') !== '0' } catch { return true } })
  const [added, setAdded] = useState(0)
  const setSeries = (v: boolean) => { setSeriesState(v); try { localStorage.setItem('scanSeries', v ? '1' : '0') } catch { /* privater Modus */ } }
  const [manual, setManual] = useState('')
  const busy = useRef(false)
  const gen = useRef(0)
  const cooldown = useRef({ keys: new Set<string>(), until: 0 })
  const streamRef = useRef<MediaStream | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [finder, setFinder] = useState<{ texts: string[]; ids: number[]; vec?: Float32Array } | null>(null)
  const [fq, setFq] = useState('')
  const [prefill, setPrefill] = useState<{ c: CatalogProduct; eur: number | null } | undefined>()
  const [live, setLive] = useState(false)
  const [slow, setSlow] = useState(false)
  const paused = card != null || ean != null || cands.length > 0 || finder != null || prefill != null

  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices) { setCamError('Kamera nur über https oder localhost verfügbar. Nutze die Suche unten.'); return }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      if (!mounted.current) { s.getTracks().forEach((t) => t.stop()); return } // Seite wurde während der Berechtigungsabfrage verlassen
      setCamError('')
      s.getVideoTracks()[0]?.addEventListener('ended', () => { if (streamRef.current === s) setStream(null) })
      setStream(s)
    } catch { setCamError('Kein Kamerazugriff. Erlaube die Kamera im Browser oder nutze die Suche unten.') }
  }, [])

  // Stream-Lebenszyklus: starten, beim Rückkehren nur bei totem Track neu starten, beim Verlassen stoppen
  useEffect(() => {
    streamRef.current = stream
    return () => { stream?.getTracks().forEach((t) => t.stop()) }
  }, [stream])
  useEffect(() => {
    start()
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const s = streamRef.current
      if (!s || !s.active || s.getVideoTracks()[0]?.readyState === 'ended') start()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [start])
  useEffect(() => {
    const v = video.current
    if (!v || !stream) return
    setLive(false); setSlow(false)
    v.srcObject = stream
    v.play().catch(() => undefined)
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [stream, camError])

  /** 'ok' = Treffer angezeigt, 'none' = nichts gefunden, 'stale' = Scan inzwischen verworfen/übersprungen */
  const lookup = useCallback(async (text: string, g: number, auto: boolean): Promise<'ok' | 'none' | 'stale'> => {
    const p = parseCardText(text)
    if (!p.number) return 'none'
    setStatus(`Nummer ${p.number}${p.total ? '/' + p.total : ''} erkannt – suche …`)
    const found = await resolveByNumber(p.number, p.totals, p.words, cardLang)
    if (g !== gen.current) return 'stale'
    if (auto && Date.now() < cooldown.current.until && found.some((c) => cooldown.current.keys.has(c.id))) return 'stale'
    if (found.length === 1) setCard(found[0])
    else if (found.length > 1) setCands(found)
    else return 'none'
    return 'ok'
  }, [cardLang])

  const tick = useCallback(async () => {
    const v = video.current
    if (busy.current || paused || !v || v.readyState < 2 || mode === 'photo') return
    busy.current = true
    const g = gen.current
    try {
      if (mode === 'barcode') {
        const code = await detectEan(v)
        if (g !== gen.current) return
        if (code && !(Date.now() < cooldown.current.until && cooldown.current.keys.has(code))) { navigator.vibrate?.(60); setEan(normalizeEan(code)) }
      } else {
        setStatus('Lese Karte …')
        const text = await readCardNumber(v, frameEl.current)
        if (g !== gen.current) return
        const r = await lookup(text, g, true)
        if (r === 'ok') navigator.vibrate?.(60)
        else if (r === 'none') setStatus(parseCardText(text).number ? 'Keine passende Karte gefunden' : 'Nummer unten am Kartenrand nicht lesbar – Karte füllt den Rahmen? Weniger Glanz, mehr Licht')
      }
    } catch { setStatus('Scan-Fehler – bitte erneut versuchen') }
    finally { busy.current = false }
  }, [mode, paused, lookup])

  useEffect(() => {
    if (camError || mode === 'photo') return
    const id = setInterval(tick, mode === 'barcode' ? 600 : 2500)
    return () => clearInterval(id)
  }, [tick, mode, camError])

  /** Standbild der Kamera lesen und direkt im Produktkatalog suchen. */
  const photoSearch = async () => {
    const v = video.current
    if (!v || !v.videoWidth || busy.current) return
    busy.current = true
    setStatus('Werte Foto aus …')
    try {
      const k = Math.min(1, 1400 / Math.max(v.videoWidth, v.videoHeight))
      const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k)
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      const r = await findByPhoto(c, setStatus)
      if (r.imageSearch === 'error') setStatus('Bilderkennung nicht geladen (offline?)')
      setFq(''); setFinder({ texts: r.texts, ids: r.ids, vec: r.vec })
      setStatus('Bereit')
    } finally { busy.current = false }
  }
  const afterAdd = () => { setAdded((n) => n + 1); if (!series) nav('/collection') }
  const closeAll = () => {
    gen.current++
    const keys = new Set<string>(cands.map((c) => c.id))
    if (card) keys.add(card.id)
    if (ean) keys.add(ean)
    cooldown.current = { keys, until: Date.now() + 4000 }
    setCard(null); setCands([]); setEan(undefined); setStatus('Bereit für die nächste Karte')
  }

  return (
    <div className="scan">
      <div className="scan-top">
        <button className="icon-btn scan-x" onClick={() => nav('/collection')} aria-label="Scan beenden und zur Sammlung">✕</button>
        <Segmented label="Scan-Art" value={mode} onChange={(m) => { gen.current++; setMode(m); setStatus(MODE_HELP[m].status) }}
          options={[{ value: 'card', label: 'Karte' }, { value: 'barcode', label: 'Barcode' }, { value: 'photo', label: 'Foto' }]} />
        {added > 0 ? <button className="btn small-btn scan-done" onClick={() => nav('/collection')}>Fertig ({added})</button> : <span className="scan-x" aria-hidden />}
      </div>
      <div className={`viewfinder mode-${mode}`}>
        <div className="mode-banner" aria-hidden>{MODE_HELP[mode].banner}</div>
        {!camError && <video ref={video} playsInline muted autoPlay aria-label="Kamera-Vorschau" onPlaying={() => setLive(true)} />}
        {!camError && !live && <p className="cam-error">{slow ? 'Die Kamera liefert noch kein Bild. Tippe einmal auf den Bildschirm, lade die Seite neu oder prüfe die Kameraberechtigung des Browsers.' : 'Kamera startet …'}</p>}
        {camError && <p className="cam-error">{camError}</p>}
        {!camError && <div ref={frameEl} className={`frame is-${mode}`} aria-hidden />}
      </div>
      {mode === 'card' && <div className="scan-lang"><LangChips value={cardLang} onChange={setCardLang} label="Sprache der Karte" /></div>}
      <p className="scan-status" role="status">{status}</p>
      <div className="scan-bottom">
        {mode === 'card' && <button className="btn primary" disabled={!!camError} onClick={tick}>Jetzt lesen</button>}
        {mode === 'barcode' && <button className="btn primary" disabled={!!camError} onClick={tick}>Jetzt scannen</button>}
        {mode === 'photo' && <button className="btn primary shutter" disabled={!!camError} onClick={photoSearch}>Foto aufnehmen</button>}
        <label className="switch"><input type="checkbox" checked={series} onChange={(e) => setSeries(e.target.checked)} /> Mehrere nacheinander</label>
      </div>
      <details className="scan-alt" open={!!camError || undefined}>
        <summary>{mode === 'card' ? 'Klappt nicht? Nummer eintippen oder Namen suchen' : 'Klappt nicht? Produkt per Name suchen'}</summary>
      {mode === 'card' && (
        <form className="manual" onSubmit={async (e) => { e.preventDefault(); if (!manual) return; const r = await lookup(manual, gen.current, false); if (r === 'none') setStatus('Nichts gefunden – Format: 025/198') }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Nummer eintippen, z. B. 025/198" aria-label="Kartennummer manuell" />
          <button className="btn">Suchen</button>
        </form>)}

      <Link className="link" to={mode === 'card' ? '/add' : '/add?mode=product'}>{mode === 'card' ? 'Per Namen suchen →' : 'Produkt im Katalog suchen →'}</Link>
      </details>

      <Sheet open={cands.length > 0 && !card} onClose={closeAll} title="Welche Karte ist es?">
        <p className="muted small">Mehrere Sets haben diese Kartennummer. Tippe auf die richtige Karte.</p>
        <div className="cand-grid">{cands.map((c) => (
          <button key={c.id} className="tile" onClick={() => setCard(c)}>
            <div className="tile-img"><img crossOrigin="anonymous" src={imageUrl(c.image)} alt="" /></div>
            <strong className="tile-name">{c.name}</strong><small className="muted tile-sub">{c.setName}</small></button>))}</div>
        <div className="actions"><button className="btn ghost" onClick={closeAll}>Keine davon</button></div>
      </Sheet>

      <Sheet open={finder != null && !prefill} onClose={() => { setFinder(null); setFq('') }} title="Welches Produkt?">
        <p className="muted small">{finder?.texts.length || finder?.ids.length ? 'Ähnlichste Produkte zur Packung. Tippe auf das richtige.' : 'Nichts erkannt. Tippe den Namen ein.'}</p>
        <ProductPicker query={fq} onQuery={setFq} photoTexts={finder?.texts} rankedIds={finder?.ids} photoVec={finder?.vec} onPick={(c, eur) => setPrefill({ c, eur })} autoFocus={!finder?.texts.length && !finder?.ids.length} />
        <div className="actions"><button className="btn ghost" onClick={() => { setPrefill(undefined); setEan(''); setFinder(null) }}>Manuell eingeben</button></div>
      </Sheet>
      <AddCardSheet card={card} onClose={closeAll} onAdded={afterAdd} />
      <ProductSheet open={ean != null || prefill != null} ean={ean || undefined} prefill={prefill} onClose={() => { setPrefill(undefined); setFinder(null); closeAll() }} onAdded={afterAdd} />
    </div>
  )
}

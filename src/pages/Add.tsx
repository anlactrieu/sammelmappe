import { useEffect, useMemo, useState } from 'react'
import { useQuickAdd } from '../components/quickAdd'
import { LangChips } from '../components/LangChips'
import { langLabel, langTag, type Lang } from '../lib/lang'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchCard, imageUrl, loadSets, searchCards, type CardBrief } from '../services/tcgdex'
import { Icon } from '../components/Icon'
import { Empty, Segmented, useToast } from '../components/ui'
import { AddCardSheet } from '../components/CardSheets'
import { ProductSheet } from '../components/ProductSheet'
import { ProductPicker } from '../components/ProductPicker'
import { fileToThumb } from '../lib/photo'
import { findByPhoto } from '../services/photoFind'
import type { CatalogProduct } from '../services/catalog'
import type { CardRef } from '../types'

export default function Add() {
  const toast = useToast()
  const quickAdd = useQuickAdd()
  const [lang, setLangState] = useState<Lang>(() => { try { return (localStorage.getItem('cardLang') as Lang) || 'de' } catch { return 'de' } })
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('cardLang', l) } catch { /* privater Modus */ } }
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'card' | 'product'>(params.get('mode') === 'product' ? 'product' : 'card')
  const [q, setQ] = useState('')
  const [res, setRes] = useState<CardBrief[] | null>(null)
  const [setNames, setSetNames] = useState<Map<string, { name: string; order: number }>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [card, setCard] = useState<CardRef | null>(null)
  const [productOpen, setProductOpen] = useState(false)
  const [pq, setPq] = useState('')
  const [texts, setTexts] = useState<string[]>([])
  const [ranked, setRanked] = useState<number[]>([])
  const [vec, setVec] = useState<Float32Array | undefined>()
  const [status, setStatus] = useState('')
  const [reading, setReading] = useState(false)
  const onPhoto = async (file?: File) => {
    if (!file) return
    setReading(true); setTexts([]); setRanked([]); setPq('')
    try {
      const { canvas } = await fileToThumb(file, 1000)
      const r = await findByPhoto(canvas, setStatus)
      setTexts(r.texts); setRanked(r.ids); setVec(r.vec)
      if (r.imageSearch === 'unavailable') toast('Bildsuche noch nicht verfügbar – nutze Text oder Namen')
      else if (r.imageSearch === 'error') toast('Bilderkennung konnte nicht geladen werden (offline?)')
      else if (!r.ids.length && !r.texts.length) toast('Nichts erkannt – Namen bitte eintippen')
    } catch (e) { toast(`Foto konnte nicht verarbeitet werden: ${(e as Error).message || 'Texterkennung nicht geladen (offline?)'}`) }
    finally { setReading(false) }
  }
  const [prefill, setPrefill] = useState<{ c: CatalogProduct; eur: number | null } | undefined>()
  const [limit, setLimit] = useState(60)

  useEffect(() => { loadSets(lang).then((s) => setSetNames(new Map(s.map((x, i) => [x.id, { name: x.name, order: i }])))).catch(() => undefined) }, [lang])
  const apiSetId = (id: string) => id.replace(/^(en|ja|zh-tw|zh-cn):/, '').replace(/-[^-]+$/, '')
  // Treffer: exakter Name zuerst, dann neuere Sets zuerst (die Set-Liste kommt von alt nach neu)
  const sorted = useMemo(() => [...(res ?? [])].sort((a, b) => (Number(b.name.toLowerCase() === q.trim().toLowerCase()) - Number(a.name.toLowerCase() === q.trim().toLowerCase())) || ((setNames.get(apiSetId(b.id))?.order ?? -1) - (setNames.get(apiSetId(a.id))?.order ?? -1))), [res, setNames, q])
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); setError(''); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true); setError('')
      try { { setRes(await searchCards(q, lang, ctrl.signal)); setLimit(60) } }
      catch (e) { if ((e as Error).name !== 'AbortError') setError('Suche nicht möglich – bist du online?') }
      finally { setLoading(false) }
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, lang])

  const pick = async (b: CardBrief) => {
    try { setCard(await fetchCard(b.id)) } catch { toast('Karte konnte nicht geladen werden') }
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Hinzufügen</h1><Link className="btn small-btn" to={`/quick?mode=${mode}`}>Schnell erfassen</Link></header>
      <Segmented label="Was hinzufügen" value={mode} onChange={setMode} options={[{ value: 'card', label: 'Karte' }, { value: 'product', label: 'Produkt' }]} />
      {mode === 'product' ? (<>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn primary" to="/scan">Produkt fotografieren</Link>
          <label className="btn file-btn">Packung fotografieren
            <input type="file" accept="image/*" capture="environment" className="file-overlay" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
          <button className="btn ghost" onClick={() => { setPrefill(undefined); setProductOpen(true) }}>Manuell</button>
        </div>
        {reading && <p className="muted small" role="status">{status || 'Werte Foto aus …'}</p>}
        <ProductPicker query={pq} onQuery={setPq} photoTexts={texts} rankedIds={ranked} photoVec={vec} onPick={(c, eur) => { setPrefill({ c, eur }); setProductOpen(true) }} autoFocus />
      </>) : (<>
        <LangChips value={lang} onChange={setLang} />
        {lang !== 'de' && <p className="muted small">Tippe den deutschen Namen (z. B. Glurak) – die App findet die Karte in {lang === 'en' ? 'Englisch' : lang === 'ja' ? 'Japanisch' : lang === 'zh-tw' ? 'traditionellem Chinesisch' : 'vereinfachtem Chinesisch'} automatisch. Der Kartentext bleibt in der Originalsprache.</p>}
        <input className="search" type="search" placeholder="Name oder Nummer, z. B. Glurak oder 079/198" value={q} autoFocus
          onChange={(e) => setQ(e.target.value)} aria-label="Karte suchen" />
        {loading && <p className="muted small">Suche läuft …</p>}
        {error && <p className="error">{error}</p>}
        {res && res.length === 0 && !loading && <Empty icon="🔍" title="Nichts gefunden" text={`Gesucht in: ${langLabel(lang)}. ${lang === 'de' ? 'Probiere den deutschen Namen (z. B. „Glurak“) oder die Nummer (079/198).' : 'Probiere den deutschen Namen oder die Nummer – oder wechsle oben auf „DE“.'}`}>{lang !== 'de' && <button className="btn" onClick={() => setLang('de')}>Auf Deutsch suchen</button>}</Empty>}
        {!res && !error && lang === 'de' && <p className="hint">Tipp: Alle Namen sind deutsch. Mit Scan geht’s noch schneller.</p>}
        <ul className="grid">
          {sorted.slice(0, limit).map((b) => (
            <li key={b.id} className="tile-wrap"><button className="quick" onClick={() => quickAdd(b.id)} aria-label={`${b.name} direkt hinzufügen`}>＋</button><button className="tile" onClick={() => pick(b)}>
              <div className="tile-img">{b.image ? <img src={imageUrl(b.image)} alt="" loading="lazy" /> : <span className="thumb-ph big"><Icon name="card" size={40} /></span>}</div>
              <strong className="tile-name">{b.name}</strong><small className="muted tile-sub">{lang !== 'de' && <b className="langtag">{langTag(lang)}</b>} {b.setName ?? setNames.get(apiSetId(b.id))?.name ?? apiSetId(b.id).toUpperCase()} · {b.localId}</small>
            </button></li>))}
        </ul>
        {res && res.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Mehr laden ({res.length - limit} weitere)</button>}
      </>)}
      <AddCardSheet card={card} onClose={() => setCard(null)} />
      <ProductSheet open={productOpen} prefill={prefill} onClose={() => setProductOpen(false)} />
    </div>
  )
}

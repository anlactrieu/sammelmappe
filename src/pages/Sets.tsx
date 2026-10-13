import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { fetchCard, fetchSetCards, imageUrl, loadSets, type CardBrief } from '../services/tcgdex'
import { Icon } from '../components/Icon'
import { useQuickAdd } from '../components/quickAdd'
import { Empty, Segmented, useToast } from '../components/ui'
import { AddCardSheet } from '../components/CardSheets'
import { LangChips } from '../components/LangChips'
import { parseKey, type Lang } from '../lib/lang'
import type { CardRef, SetRef } from '../types'

/** Grundset = rein numerische Nummer ≤ offizielle Kartenzahl (TG/GG/Promos zählen nicht). */

export function SetList() {
  const [params, setParams] = useSearchParams()
  const lang = (params.get('lang') as Lang) || 'de'
  const [sets, setSets] = useState<SetRef[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const items = useLiveQuery(() => db.items.where('kind').equals('card').toArray(), [])
  useEffect(() => { setSets(null); setErr(''); loadSets(lang).then((s) => setSets(s)).catch(() => setErr('Sets konnten nicht geladen werden (offline?).')) }, [lang])

  const owned = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const i of items ?? []) {
      const { lang: l, apiId } = parseKey(i.refId)
      const sid = `${l}/${apiId.slice(0, apiId.lastIndexOf('-'))}`
      ;(m.get(sid) ?? m.set(sid, new Set()).get(sid)!).add(i.refId)
    }
    return m
  }, [items])
  /** Grundset: nur Nummern ≤ offizielle Kartenzahl (ohne Secret Rares). */
  const baseCount = (s: SetRef) => Array.from(owned.get(s.key) ?? []).filter((id) => inBaseId(id.slice(id.lastIndexOf('-') + 1), s.official)).length
  const list = (sets ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => baseCount(b) - baseCount(a))

  return (
    <div className="page">
      <header className="page-head"><Link to="/collection" className="back" aria-label="Zurück">‹</Link><h1>Sets</h1><Link className="btn small-btn" to="/releases">Neuheiten</Link></header>
      <LangChips value={lang} onChange={(l) => setParams(l === 'de' ? {} : { lang: l })} />
      <input className="search" type="search" placeholder="Set suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Set suchen" />
      {err && <p className="error">{err}</p>}
      {!sets && !err && <div className="skeleton row" />}
      <ul className="setlist">
        {list.filter((s) => s.official > 0 || lang === 'de').map((s) => {
          const n = baseCount(s), pct = s.official ? Math.min(100, (n / s.official) * 100) : 0
          return (
            <li key={s.key}><Link to={`/sets/${s.lang}/${s.id}`} className="set-row">
              {s.logo ? <img src={`${s.logo}.webp`} alt="" loading="lazy" /> : <span className="thumb-ph"><Icon name="card" /></span>}
              <div className="grow"><strong>{s.name}</strong>
                <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} Fortschritt`}><i style={{ width: `${pct}%` }} /></div>
              </div>
              <small className="muted">{n}/{s.official}</small></Link></li>)
        })}
      </ul>
    </div>
  )
}

export function SetDetail() {
  const { id = '', lang: langParam } = useParams()
  const lang = (langParam as Lang) || 'de'
  const toast = useToast()
  const quickAdd = useQuickAdd()
  const [data, setData] = useState<{ set: SetRef; cards: CardBrief[] } | null>(null)
  const [err, setErr] = useState('')
  const [card, setCard] = useState<CardRef | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [master, setMaster] = useState(false)
  const items = useLiveQuery(() => db.items.where('kind').equals('card').toArray(), [])
  const owned = useMemo(() => new Set((items ?? []).map((i) => i.refId)), [items])

  useEffect(() => {
    let stale = false
    setData(null); setErr('')
    fetchSetCards(lang, id).then((d) => { if (!stale) setData(d) }).catch(() => { if (!stale) setErr('Set konnte nicht geladen werden.') })
    return () => { stale = true }
  }, [id, lang])
  if (err) return <div className="page"><p className="error">{err}</p></div>
  if (!data) return <div className="page"><div className="skeleton hero" /></div>
  const inBase = (c: CardBrief) => inBaseId(c.localId, data.set.official)
  const goal = master ? data.cards.length : data.set.official
  const have = data.cards.filter((c) => owned.has(c.id) && (master || inBase(c))).length
  const shown = data.cards.filter((c) => (!onlyMissing || !owned.has(c.id)) && (master || inBase(c) || owned.has(c.id)))
  const pick = async (c: CardBrief) => { try { setCard(await fetchCard(c.id)) } catch { toast('Karte konnte nicht geladen werden') } }
  return (
    <div className="page">
      <header className="page-head"><Link to={lang === 'de' ? '/sets' : `/sets?lang=${lang}`} className="back" aria-label="Zurück">‹</Link><h1>{data.set.name}</h1></header>
      <div className="card set-summary">
        <strong>{have} / {goal}</strong> <span className="muted">Karten ({Math.round((have / (goal || 1)) * 100)} %)</span>
        <div className="bar"><i style={{ width: `${Math.min(100, (have / (goal || 1)) * 100)}%` }} /></div>
        {data.cards.length > data.set.official && <Segmented label="Set-Ziel" value={master ? 'master' : 'base'} onChange={(v) => setMaster(v === 'master')} options={[{ value: 'base', label: `Grundset (${data.set.official})` }, { value: 'master', label: `Master (${data.cards.length})` }]} />}
      </div>
      <label className="switch"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Nur fehlende zeigen</label>
      {shown.length === 0 && <Empty icon="🏆" title="Set komplett!" text="Dir fehlt keine Karte." />}
      <ul className="grid">
        {shown.map((c) => (
          <li key={c.id} className="tile-wrap"><button className="quick" onClick={() => quickAdd(c.id)} aria-label={`${c.name} direkt hinzufügen`}>＋</button><button className={`tile${owned.has(c.id) ? '' : ' ghosted'}`} onClick={() => pick(c)} aria-label={`${c.name} ${c.localId}${owned.has(c.id) ? ', vorhanden' : ', fehlt'}`}>
            <div className="tile-img">{c.image ? <img src={imageUrl(c.image)} alt="" loading="lazy" /> : <span className="thumb-ph big"><Icon name="card" size={40} /></span>}
              {owned.has(c.id) && <span className="badge ok">✓</span>}</div>
            <strong className="tile-name">{c.name}</strong><small className="muted tile-sub">{c.localId}</small></button></li>))}
      </ul>
      <AddCardSheet card={card} onClose={() => setCard(null)} />
    </div>
  )
}

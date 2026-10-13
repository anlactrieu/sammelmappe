import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { imageUrl } from '../services/tcgdex'
import { formatEur } from '../lib/format'
import { CONDITION_FACTOR, cardBasePrice, catalogCardEur } from '../lib/pricing'
import { collectionStats, findMilestone, isHighlight, type Milestone, type Stats } from '../lib/milestones'
import { cardNames } from '../services/names'
import type { CardRef, Condition, Variant } from '../types'

export interface CelebrateOpts { qty: number; condition: Condition; variant: Variant }
type Run = (card: CardRef, opts: CelebrateOpts, add: () => Promise<unknown>, light?: boolean) => Promise<void>
const Ctx = createContext<Run | null>(null)
/** Karte hinzufügen und feiern: `add` führt das eigentliche Speichern aus (Fehler werden weitergereicht). */
export const useCelebrate = () => useContext(Ctx) ?? (async (_c: CardRef, _o: CelebrateOpts, add: () => Promise<unknown>) => { await add() })

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const tabEl = () => document.querySelector<HTMLElement>('.tabbar a[href$="/collection"]')

/** Zähler am Sammlung-Tab: kleines „+N" steigt auf, Tab pulsiert. */
function pulseTab(n: number) {
  const t = tabEl(); if (!t || reduced()) return
  t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse')
  const pop = document.createElement('span'); pop.className = 'tab-pop'; pop.textContent = `+${n}`; pop.setAttribute('aria-hidden', 'true')
  t.appendChild(pop); setTimeout(() => { pop.remove(); t.classList.remove('pulse') }, 1000)
}

/** Kartenbild fliegt vom Ausgangsrechteck zum Sammlung-Tab. */
function flyToTab(src: string, from: DOMRect, n: number) {
  const t = tabEl()
  if (!t || reduced()) { return }
  const to = t.getBoundingClientRect()
  const img = document.createElement('img'); img.src = src; img.alt = ''; img.className = 'fly-card'
  Object.assign(img.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` })
  document.body.appendChild(img)
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const s = Math.min(0.15, 36 / from.width)
  const a = img.animate([{ transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }, { transform: `translate(${dx * 0.5}px,${dy * 0.35 - 40}px) scale(${(1 + s) / 2}) rotate(-6deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(8deg)`, opacity: 0.4 }], { duration: 620, easing: 'cubic-bezier(.5,0,.75,.4)' })
  a.onfinish = () => { img.remove(); pulseTab(n) }
}

function confetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  const w = (canvas.width = innerWidth), h = (canvas.height = innerHeight)
  const colors = ['#ffe14d', '#2b45ff', '#3ad08a', '#ff7a68', '#ffffff']
  const ps = Array.from({ length: 70 }, () => ({ x: w / 2, y: h * 0.42, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 3, r: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 6 }))
  const t0 = performance.now()
  const frame = (now: number) => {
    const t = now - t0; ctx.clearRect(0, 0, w, h)
    for (const p of ps) { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += 0.2; ctx.globalAlpha = Math.max(0, 1 - t / 1500); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore() }
    if (t < 1500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h)
  }
  requestAnimationFrame(frame)
}

interface Show { card: CardRef; qty: number; isNew: boolean; owned: number; setOwned: number; value: number | null; delta: number | null; highlight: boolean; milestone: Milestone | null; n: number }

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState<Show | null>(null)
  const counter = useRef(0)
  const run = useCallback<Run>(async (card, o, add, light) => {
    let before: Stats | null = null
    if (!light) try { before = await collectionStats(card) } catch { /* ohne Kontext weiter */ }
    await add()
    const unit = (cardBasePrice(card, o.variant)?.value ?? catalogCardEur(card) ?? null)
    const delta = unit != null ? unit * CONDITION_FACTOR[o.condition] * o.qty : null
    if (light) { // Schnell-Modus: nur Flug + Zähler, nichts, was bremst
      const w = Math.min(120, innerWidth * 0.3), h = w * 1.4
      if (card.image) flyToTab(imageUrl(card.image, 'low'), new DOMRect(innerWidth / 2 - w / 2, innerHeight * 0.45 - h / 2, w, h), o.qty); else pulseTab(o.qty)
      return
    }
    let after: Stats | null = null
    try { after = await collectionStats(card) } catch { /* s. o. */ }
    const milestone = before && after ? findMilestone(before, after, card, o.variant) : null
    setShow({ card, qty: o.qty, isNew: !before || before.cardQty === 0, owned: after?.cardQty ?? o.qty, setOwned: after?.setOwned ?? 0, value: unit, delta,
      highlight: isHighlight(card, unit) || !!milestone, milestone, n: ++counter.current })
  }, [])
  return <Ctx.Provider value={run}>{children}{show && <Overlay key={show.n} s={show} onDone={() => setShow(null)} />}</Ctx.Provider>
}

function Overlay({ s, onDone }: { s: Show; onDone: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const closing = useRef(false)
  const close = useCallback(() => {
    if (closing.current) return; closing.current = true
    const r = cardRef.current?.getBoundingClientRect()
    if (r && s.card.image) flyToTab(imageUrl(s.card.image, 'low'), r, s.qty); else pulseTab(s.qty)
    onDone()
  }, [onDone, s])
  useEffect(() => {
    if (s.highlight && canvas.current && !reduced()) confetti(canvas.current)
    const id = setTimeout(close, s.milestone ? 3400 : 2400)
    return () => clearTimeout(id)
  }, [s, close])
  const { name } = cardNames(s.card)
  const total = s.card.setTotal
  const pct = total ? Math.min(100, Math.round((s.setOwned / total) * 100)) : null
  const headline = s.milestone ? s.milestone.title : s.isNew ? 'Neu in der Sammlung' : `Jetzt ${s.owned}× vorhanden`
  return createPortal(
    <div className="celebrate" onClick={close} role="status" aria-live="polite">
      <canvas ref={canvas} className="celebrate-confetti" aria-hidden />
      <div className={`celebrate-card${s.highlight ? ' shine' : ''}`} ref={cardRef}>
        <div className="celebrate-img">{s.card.image ? <img src={imageUrl(s.card.image, 'low')} alt={`Karte ${s.card.name}`} /> : <span className="celebrate-noimg" aria-hidden>{s.card.localId}</span>}</div>
      </div>
      <div className="celebrate-info">
        <p className={`celebrate-head${s.milestone ? ' big-m' : ''}`}>{headline}</p>
        {s.milestone?.sub && <p className="muted small">{s.milestone.sub}</p>}
        <p className="celebrate-name">{s.qty > 1 ? `${s.qty}× ` : ''}{name}</p>
        {s.delta != null && <p className="celebrate-val">+{formatEur(s.delta)} <span className="muted small">Sammlungswert</span></p>}
        {pct != null && total && (
          <div className="celebrate-set"><div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Set-Fortschritt ${s.card.setName}`}><i style={{ width: `${pct}%` }} /></div>
            <span className="small">{s.card.setName} · {s.setOwned}/{total}</span></div>)}
      </div>
    </div>, document.body)
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatEur, relativeTime } from '../lib/format'
import type { UnitPrice } from '../types'

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => setMsg(m), [])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t) }, [msg])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">{msg && <div className="toast">{msg}</div>}</div>
    </ToastCtx.Provider>
  )
}

/* ---------- Bottom Sheet ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>, document.body)
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/* ---------- Preis-Anzeige mit Quelle/Alter ---------- */
export function PriceLine({ price, qty = 1, compact }: { price: UnitPrice; qty?: number; compact?: boolean }) {
  if (price.value == null) return <span className="price missing">Preis fehlt</span>
  const label = price.source === 'manual' ? 'manuell' : price.source === 'product' ? 'Marktpreis' : price.source === 'catalog' ? 'TCGplayer US, umgerechnet' : 'Cardmarket-Richtwert'
  return (
    <span className={`price${price.stale ? ' stale' : ''}`}>
      <strong>{formatEur(price.value * qty)}</strong>
      {price.estimated && <span className="est" title="Schätzwert (Zustand/Variante)"> ≈</span>}
      {!compact && <small> {label} · {relativeTime(price.updatedAt)}{price.stale ? ' ⚠' : ''}</small>}
    </span>
  )
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-slot" aria-hidden data-icon={icon} /><h3>{title}</h3><p>{text}</p>{children}</div>
}

/* ---------- Mini-Verlaufsgraph ---------- */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="muted small">Der Verlauf erscheint nach dem zweiten Tag.</p>
  const w = 300, h = 80, min = Math.min(...points), max = Math.max(...points), span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 8 - ((p - min) / span) * (h - 16)] as const)
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" role="img" aria-label={`Wertverlauf von ${formatEur(points[0])} auf ${formatEur(points[points.length - 1])}`}>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="4" className="spark-dot" />
    </svg>
  )
}

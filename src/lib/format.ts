const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
/** Lokales Datum als YYYY-MM-DD (toISOString wäre UTC und nachts einen Tag zurück). */
export const localDateIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** "2026-10-19" → "19.10.2026" */
export const isoToDe = (iso: string) => iso.split('-').reverse().join('.')
export const formatEur = (v: number | null | undefined) => (v == null ? '–' : eur.format(v))
export const formatPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`

export function relativeTime(ts?: number, now = Date.now()): string {
  if (!ts) return 'nie'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 90) return 'gerade eben'
  const m = Math.round(s / 60)
  if (m < 60) return `vor ${m} Min.`
  const h = Math.round(m / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

/** Leer ist ok (undefined), ungültig nicht: unterscheidet "nichts eingegeben" von "Tippfehler". */
export const isBadAmount = (input: string) => input.trim() !== '' && parseEur(input) === undefined

/** "12,50" / "12.50" / "1.234,56" → 12.5 ; ungültig → undefined */
export function parseEur(input: string): number | undefined {
  let s = input.trim().replace(/[€\s]/g, '')
  if (!s) return undefined
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined
}

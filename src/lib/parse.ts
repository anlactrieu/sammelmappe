export interface ParsedCardText { number?: string; total?: number; totals?: number[]; words: string[] }

/** Gesamtzahl-Kandidaten: ein Rarity-Symbol hinter der Zahl wird von Tesseract oft als Ziffer gelesen ("1654" = 165 + ★). */
export function totalCandidates(digits: string): number[] {
  const d = digits.replace(/\D/g, '')
  const out = [d.slice(0, 3), d.slice(0, 2)].filter((x) => x.length >= 2).map(Number).filter((n) => n > 0)
  return Array.from(new Set(d.length <= 3 ? [Number(d), ...out] : out))
}

/** Liest "025/198", "4/102", "SWSH123", "TG05/TG30" aus OCR-Text und sammelt Namensfragmente. */
export function parseCardText(text: string): ParsedCardText {
  const t = text.replace(/[|Il](?=\d)/g, '1').replace(/O(?=\d)/g, '0')
  const m = t.match(/\b([A-Z]{0,3}\d{1,3})\s*\/\s*([A-Z]{0,3}\d{2,4})/)
  const words = Array.from(new Set(
    text.split(/[^A-Za-zÄÖÜäöüß-]+/).filter((w) => w.length >= 4).map((w) => w.toLowerCase()),
  ))
  if (!m) return { words }
  const totals = totalCandidates(m[2])
  return { number: m[1], total: totals[0], totals, words }
}

/** "025" → "25", "TG05" bleibt "TG05" – für Vergleiche mit localId. */
export const normalizeLocalId = (id: string) => id.replace(/^([A-Za-z]*)0+(?=\d)/, '$1')

const CONFUSABLE: Record<string, string[]> = { '0': ['8'], '8': ['0', '3', '5', '6'], '3': ['8'], '5': ['6', '8'], '6': ['5', '8'], '1': ['7'], '7': ['1'] }
/** Gesamtzahl plus Varianten mit einer typischen OCR-Verwechslung (198 ↔ 195, 165 ↔ 185 …); Original zuerst. */
export function totalVariants(total: number): number[] {
  const s = String(total), out = [total]
  for (let i = 0; i < s.length; i++) for (const alt of CONFUSABLE[s[i]] ?? []) { const n = Number(s.slice(0, i) + alt + s.slice(i + 1)); if (n >= 20 && !out.includes(n)) out.push(n) }
  return out
}

/** Menge aus der Eingabe lösen: "2x nachtara mini tin", "2 nachtara", "nachtara x3" → { qty, text } */
export function parseQty(input: string): { qty: number; text: string } {
  const s = input.trim()
  let m = s.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i) ?? s.match(/^(\d{1,2})\s+(\D.*)$/)
  if (m) return { qty: Math.max(1, Number(m[1])), text: m[2].trim() }
  m = s.match(/^(.+?)\s*[x×]\s*(\d{1,3})$/i)
  if (m) return { qty: Math.max(1, Number(m[2])), text: m[1].trim() }
  return { qty: 1, text: s }
}

/** UPC-A (12 Ziffern) → EAN-13 mit führender 0; sonst unverändert. So passen 0820… und 820… zusammen. */
export const normalizeEan = (code: string) => { const d = code.replace(/\D/g, ''); return d.length === 12 ? '0' + d : d }

/** Mehrere EANs in einem Feld ("4007…, 0820…") */
export const eanList = (field?: string) => (field ?? '').split(/[,\s;]+/).filter(Boolean).map(normalizeEan)

/** EAN/UPC plausibel? (8, 12, 13 oder 14 Ziffern + Prüfsumme) */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const d = code.split('').map(Number)
  const check = d.pop()!
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

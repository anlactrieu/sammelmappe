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

/** EAN/UPC plausibel? (8, 12, 13 oder 14 Ziffern + Prüfsumme) */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const d = code.split('').map(Number)
  const check = d.pop()!
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

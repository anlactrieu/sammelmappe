import type { Worker } from 'tesseract.js'
import { nameSuggestions } from '../lib/photo'

let textWorker: Promise<Worker> | null = null
/** Produktfoto lesen (deutsche Texte der Verpackung) → Namensvorschläge. */
export async function suggestNamesFromCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  textWorker ??= import('tesseract.js').then(({ createWorker }) => createWorker('deu')).catch((e) => { textWorker = null; throw e })
  const w = await textWorker
  const { data } = await w.recognize(canvas, {}, { blocks: true })
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({ text: l.text, confidence: l.confidence, height: l.bbox.y1 - l.bbox.y0 }))
  return nameSuggestions(lines)
}


import type { Worker } from 'tesseract.js'
import { frameToVideo, numberStrips, type Strip } from '../lib/strips'
import { parseCardText } from '../lib/parse'
import { nameSuggestions } from '../lib/photo'

/** Rauschen wie "1/10" verwerfen: Sets haben mindestens ~20 Karten. */
const plausible = (text: string) => { const p = parseCardText(text); return !!p.number && (p.totals ?? []).some((t) => t >= 20) }

const DIGITS = '0123456789/'
const WITH_LETTERS = DIGITS + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

let worker: Promise<Worker> | null = null
async function getWorker() {
  worker ??= import('tesseract.js').then(async ({ createWorker }) => {
    const w = await createWorker('eng')
    await w.setParameters({ tessedit_char_whitelist: DIGITS, tessedit_pageseg_mode: '11' as never })
    return w
  }).catch((e) => { worker = null; throw e })
  return worker
}

async function ocrStrip(w: Worker, canvas: HTMLCanvasElement, source: CanvasImageSource, card: Strip, s: Strip, filter: string) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const sx = card.x + s.x * card.w, sy = card.y + s.y * card.h, sw = s.w * card.w, sh = s.h * card.h
  const scale = 1100 / sw
  canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale)
  const nativeFilter = 'filter' in ctx && filter !== 'none'
  if (nativeFilter) ctx.filter = filter
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  if (!nativeFilter && filter !== 'none') { // Safari ohne ctx.filter: Graustufen + Kontrast per Pixelschleife
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.max(0, Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - 128) * 1.5 + 128))
      d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(img, 0, 0)
  }
  return (await w.recognize(canvas)).data.text
}

/**
 * Kartennummer in einer Quelle (Video/Bild) lesen; `card` ist das Kartenrechteck in Quellpixeln.
 * Nur enge Streifen am Kartenrand werden hochskaliert erkannt (breite Bereiche liefern auf echten Karten nichts).
 */
export async function readNumberFromSource(source: CanvasImageSource, card: Strip, filter = 'none'): Promise<string> {
  const w = await getWorker()
  const canvas = document.createElement('canvas')
  for (const s of numberStrips()) {
    const text = await ocrStrip(w, canvas, source, card, s, filter)
    if (plausible(text)) return text
  }
  // Zweiter Durchlauf mit Buchstaben (TG05/TG30, GG, SVP-Promos), nur die mittleren Streifen
  await w.setParameters({ tessedit_char_whitelist: WITH_LETTERS })
  try {
    for (const s of numberStrips().slice(0, 2)) {
      const text = await ocrStrip(w, canvas, source, card, s, filter)
      if (plausible(text)) return text
    }
  } finally { await w.setParameters({ tessedit_char_whitelist: DIGITS }) }
  return ''
}

/** Kartennummer ("025/198") im Videobild lesen; `frame` ist der sichtbare Kartenrahmen. */
export async function readCardNumber(video: HTMLVideoElement, frame: Element | null): Promise<string> {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw) return ''
  const card = frame
    ? frameToVideo(frame.getBoundingClientRect(), video.getBoundingClientRect(), vw, vh)
    : { x: vw * 0.15, y: vh * 0.1, w: vw * 0.7, h: Math.min(vh * 0.8, vw * 0.7 * 1.4) }
  return readNumberFromSource(video, card, 'grayscale(1) contrast(1.5)')
}

let textWorker: Promise<Worker> | null = null
/** Produktfoto lesen (deutsche Texte der Verpackung) → Namensvorschläge. */
export async function suggestNamesFromCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  textWorker ??= import('tesseract.js').then(({ createWorker }) => createWorker('deu')).catch((e) => { textWorker = null; throw e })
  const w = await textWorker
  const { data } = await w.recognize(canvas, {}, { blocks: true })
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({ text: l.text, confidence: l.confidence, height: l.bbox.y1 - l.bbox.y0 }))
  return nameSuggestions(lines)
}

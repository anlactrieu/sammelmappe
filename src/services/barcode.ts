import { isValidEan } from '../lib/parse'

let readerReady: Promise<typeof import('zxing-wasm/reader')> | null = null
async function zxing() {
  readerReady ??= (async () => {
    const mod = await import('zxing-wasm/reader')
    const wasm = (await import('zxing-wasm/reader/zxing_reader.wasm?url')).default
    mod.prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? wasm : prefix + p) }, fireImmediately: true })
    return mod
  })().catch((e) => { readerReady = null; throw e })
  return readerReady
}

type NativeDetector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
let native: NativeDetector | null | undefined

/** Barcode in einem Videoframe suchen: erst nativ (Chrome/Android), sonst zxing-wasm (iOS Safari). */
export async function detectEan(video: HTMLVideoElement): Promise<string | null> {
  if (native === undefined) {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector
    native = BD ? new BD({ formats: ['ean_13', 'ean_8', 'upc_a'] }) : null
  }
  if (native) {
    const r = await native.detect(video).catch(() => [])
    const hit = r.map((b) => b.rawValue).find(isValidEan)
    if (hit) return hit
    return null
  }
  const w = video.videoWidth, h = video.videoHeight
  if (!w) return null
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(video, 0, 0)
  const { readBarcodes } = await zxing()
  const res = await readBarcodes(ctx.getImageData(0, 0, w, h), { formats: ['EAN-13', 'EAN-8', 'UPC-A'], tryHarder: true, maxNumberOfSymbols: 1 })
  return res.map((r) => r.text).find(isValidEan) ?? null
}

/** Barcode in einem Foto (Canvas) suchen – mit mehreren Maßstäben, weil Handyfotos groß und Barcodes oft klein sind. */
export async function detectEanInCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  if (native === undefined) {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector
    native = BD ? new BD({ formats: ['ean_13', 'ean_8', 'upc_a'] }) : null
  }
  if (native) {
    const r = await native.detect(canvas).catch(() => [])
    const hit = r.map((b) => b.rawValue).find(isValidEan)
    if (hit) return hit
  }
  const { readBarcodes } = await zxing()
  for (const scale of [1, 0.6]) {
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * scale); c.height = Math.round(canvas.height * scale)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(canvas, 0, 0, c.width, c.height)
    const res = await readBarcodes(ctx.getImageData(0, 0, c.width, c.height), { formats: ['EAN-13', 'EAN-8', 'UPC-A'], tryHarder: true, maxNumberOfSymbols: 1 }).catch(() => [])
    const hit = res.map((r) => r.text).find(isValidEan)
    if (hit) return hit
  }
  return null
}

/** createImageBitmap, mit Rückfall auf <img> (ältere Safari-Versionen, EXIF-Drehung bleibt erhalten). */
async function loadBitmap(file: Blob): Promise<{ src: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const b = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { src: b, width: b.width, height: b.height, close: () => b.close?.() }
  } catch {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild nicht lesbar')); i.src = url })
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  }
}

/** Foto verkleinern (längste Kante `max` px) und als JPEG-Data-URL liefern – klein genug für IndexedDB und Backup. */
export async function fileToThumb(file: Blob, max = 600): Promise<{ dataUrl: string; canvas: HTMLCanvasElement }> {
  const bmp = await loadBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp.src, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), canvas }
}

/** Zeilen aus OCR-Rohtext zu Namensvorschlägen: nur Zeilen mit genug Buchstaben, ohne Duplikate. */
export function nameSuggestions(lines: { text: string; confidence: number; height?: number }[], limit = 5): string[] {
  const seen = new Set<string>()
  return lines
    .map((l) => ({ t: l.text.replace(/[^\p{L}\p{N}&'’.\- ]+/gu, ' ').replace(/\s+/g, ' ').trim(), c: l.confidence, h: l.height ?? 1 }))
    .filter(({ t, c }) => t.length >= 6 && c >= 55 && (t.match(/\p{L}/gu)?.length ?? 0) / t.length > 0.6)
    .sort((a, b) => b.h * b.c - a.h * a.c) // große Schrift = Produktname
    .map(({ t }) => t)
    .filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, limit)
}

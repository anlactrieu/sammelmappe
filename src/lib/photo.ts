/** Foto verkleinern (längste Kante `max` px) und als JPEG-Data-URL liefern – klein genug für IndexedDB und Backup. */
export async function fileToThumb(file: Blob, max = 600): Promise<{ dataUrl: string; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
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

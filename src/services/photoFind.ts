import { searchByImage } from './imageSearch'
import { suggestNamesFromCanvas } from './ocr'

export interface PhotoResult { ids: number[]; texts: string[]; imageSearch: 'ok' | 'unavailable' | 'error' }

/** Foto einer Packung auswerten: Bildähnlichkeit (Hauptweg) und Text auf der Packung (Zusatz). */
export async function findByPhoto(canvas: HTMLCanvasElement, onStatus?: (s: string) => void): Promise<PhotoResult> {
  let ids: number[] = [], imageSearch: PhotoResult['imageSearch'] = 'ok'
  onStatus?.('Vergleiche mit dem Katalog …')
  try {
    const r = await searchByImage(canvas, (pct) => onStatus?.(`Lade Bilderkennung (einmalig): ${Math.round(pct)} %`))
    if (r === null) imageSearch = 'unavailable'; else ids = r.map((x) => x.id)
  } catch { imageSearch = 'error' }
  onStatus?.('Lese Text auf der Packung …')
  const texts = await suggestNamesFromCanvas(canvas).catch(() => [] as string[])
  return { ids, texts, imageSearch }
}

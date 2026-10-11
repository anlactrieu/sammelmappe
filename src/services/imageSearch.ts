/** Produktsuche per Foto: DINOv2-Bildvektor der Aufnahme gegen die vorberechneten Katalogbilder vergleichen. */
const DIM = 384
const MODEL = 'Xenova/dinov2-small'

interface Index { ids: number[]; scales: Float32Array; q: Int8Array }
let indexP: Promise<Index | null> | null = null
let extractorP: Promise<(img: HTMLCanvasElement) => Promise<Float32Array>> | null = null

export function loadIndex(): Promise<Index | null> {
  indexP ??= (async () => {
    try {
      const [m, b] = await Promise.all([fetch('./catalog-emb.json'), fetch('./catalog-emb.bin')])
      if (!m.ok || !b.ok) return null
      const meta = (await m.json()) as { model: string; dim: number; ids: number[] }
      if (meta.model !== MODEL || meta.dim !== DIM) return null
      const buf = await b.arrayBuffer(), row = 4 + DIM, n = meta.ids.length
      if (buf.byteLength < n * row) return null
      const scales = new Float32Array(n), q = new Int8Array(n * DIM)
      const dv = new DataView(buf), bytes = new Int8Array(buf)
      for (let i = 0; i < n; i++) { scales[i] = dv.getFloat32(i * row, true); q.set(bytes.subarray(i * row + 4, i * row + row), i * DIM) }
      return { ids: meta.ids, scales, q }
    } catch { return null }
  })().then((r) => { if (!r) indexP = null; return r })
  return indexP
}

function getExtractor(onProgress?: (pct: number) => void) {
  extractorP ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const pipe = await pipeline('image-feature-extraction', MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status?: string; progress?: number }) => { if (p.status === 'progress' && p.progress != null) onProgress?.(p.progress) },
    })
    return async (canvas: HTMLCanvasElement) => {
      const t = await pipe(canvas)
      const v = Float32Array.from((t.data as Float32Array).slice(0, DIM))
      const n = Math.hypot(...v) || 1
      return v.map((x) => x / n)
    }
  })().catch((e) => { extractorP = null; throw e })
  return extractorP
}

/** Die ähnlichsten Katalogprodukte zu einem Foto (Katalog-IDs, bestes zuerst). `null` = Bildsuche nicht verfügbar. */
export async function searchByImage(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void, limit = 8): Promise<{ id: number; score: number }[] | null> {
  const index = await loadIndex()
  if (!index) return null
  const embed = await getExtractor(onProgress)
  const v = await embed(canvas)
  const n = index.ids.length, out: { id: number; score: number }[] = []
  for (let i = 0; i < n; i++) {
    let dot = 0; const o = i * DIM
    for (let d = 0; d < DIM; d++) dot += index.q[o + d] * v[d]
    out.push({ id: index.ids[i], score: dot * index.scales[i] })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

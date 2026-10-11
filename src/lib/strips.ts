export interface Strip { x: number; y: number; w: number; h: number }

/**
 * Kandidaten-Streifen (relativ zur Karte 0..1) für die Kartennummer. SV-Karten drucken sie unten links,
 * ältere Karten unten rechts. Mehrere vertikale Versätze fangen ungenaues Einrahmen ab; Tests mit echten
 * deutschen Karten zeigen: nur enge Streifen werden zuverlässig gelesen, breite Bereiche nicht.
 */
export function numberStrips(): Strip[] {
  const out: Strip[] = []
  for (const dy of [0, -0.025, 0.02]) {
    out.push({ x: 0.06, y: 0.925 + dy, w: 0.42, h: 0.055 })   // links
    out.push({ x: 0.5, y: 0.925 + dy, w: 0.44, h: 0.055 })    // rechts
  }
  return out.map((s) => ({ ...s, y: Math.min(s.y, 1 - s.h) }))
}

/** Rechteck des Kartenrahmens (Bildschirm) in Videopixel umrechnen (object-fit: cover). */
export function frameToVideo(frame: DOMRectLike, view: DOMRectLike, vw: number, vh: number): Strip {
  const scale = Math.max(view.width / vw, view.height / vh)
  const offX = (view.width - vw * scale) / 2, offY = (view.height - vh * scale) / 2
  const x = (frame.left - view.left - offX) / scale, y = (frame.top - view.top - offY) / scale
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max))
  const cx = clamp(x, vw), cy = clamp(y, vh)
  return { x: cx, y: cy, w: Math.min(frame.width / scale, vw - cx), h: Math.min(frame.height / scale, vh - cy) }
}
export interface DOMRectLike { left: number; top: number; width: number; height: number }

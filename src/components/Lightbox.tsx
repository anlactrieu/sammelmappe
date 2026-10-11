import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Vollbild-Vorschau einer Karte, optional neben dem eigenen Foto zum Vergleichen. */
export function Lightbox({ src, alt, compare, onClose }: { src: string; alt: string; compare?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button className="icon-btn lightbox-x" onClick={onClose} aria-label="Schließen">✕</button>
      <div className={`lightbox-body${compare ? ' two' : ''}`} onClick={(e) => e.stopPropagation()}>
        {compare && <figure><img src={compare} alt="Dein Foto" /><figcaption>Dein Foto</figcaption></figure>}
        <figure><img src={src} alt={alt} /><figcaption>{compare ? 'Treffer' : alt}</figcaption></figure>
      </div>
      <p className="lightbox-hint">Zum Schließen irgendwo tippen</p>
    </div>, document.body)
}

import { LANGS, type Lang } from '../lib/lang'

/** Kartensprache wählen (merkt sich die Wahl). */
export function LangChips({ value, onChange, label = 'Kartensprache', allowAuto, onAuto }: { value: Lang | 'auto'; onChange: (l: Lang) => void; label?: string; allowAuto?: boolean; onAuto?: () => void }) {
  return (
    <div className="chips langchips" role="group" aria-label={label}>
      {allowAuto && <button className={`chip${value === 'auto' ? ' on' : ''}`} aria-pressed={value === 'auto'} onClick={() => onAuto?.()} title="Sprache automatisch erkennen">Auto</button>}
      {LANGS.map((l) => (
        <button key={l.code} className={`chip${l.code === value ? ' on' : ''}`} aria-pressed={l.code === value} onClick={() => onChange(l.code)} title={`${l.label} (${l.native})`}>
          {l.short ?? l.tag}
        </button>))}
    </div>
  )
}

export function useStoredLang(key = 'cardLang'): [Lang, (l: Lang) => void] {
  const read = (): Lang => { try { const v = localStorage.getItem(key); return LANGS.some((l) => l.code === v) ? (v as Lang) : 'de' } catch { return 'de' } }
  return [read(), (l) => { try { localStorage.setItem(key, l) } catch { /* privater Modus */ } }]
}

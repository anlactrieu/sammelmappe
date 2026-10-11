export interface ReleaseSet { code: string; name: string; date: string; region: 'EN' | 'JA' }
export interface DeSet { id: string; name: string; date: string; cards: number }
export interface Releases { generatedAt: string; sets: ReleaseSet[]; de: DeSet[] }
export interface UpcomingEntry { name: string; original?: string; date: string; region: 'DE' | 'EN' | 'JA'; note?: string; source?: string }

let cache: Promise<{ releases: Releases | null; manual: UpcomingEntry[] }> | null = null
export function loadReleases() {
  cache ??= (async () => {
    const [r, m] = await Promise.all([
      fetch('./releases.json', { cache: 'no-cache' }).then((x) => (x.ok ? (x.json() as Promise<Releases>) : null)).catch(() => null),
      fetch('./upcoming.json', { cache: 'no-cache' }).then((x) => (x.ok ? (x.json() as Promise<UpcomingEntry[]>) : [])).catch(() => [] as UpcomingEntry[]),
    ])
    return { releases: r, manual: m }
  })()
  return cache
}

/** Tage von `today` bis `date` (beide YYYY-MM-DD, lokale Mitternacht). */
export function daysUntil(date: string, today = new Date()): number {
  const [y, m, d] = date.split('-').map(Number)
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((new Date(y, m - 1, d).getTime() - a) / 864e5)
}

export function countdownLabel(days: number): string {
  if (days < 0) return `vor ${-days} ${-days === 1 ? 'Tag' : 'Tagen'}`
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  if (days < 14) return `in ${days} Tagen`
  if (days < 70) return `in ${Math.round(days / 7)} Wochen`
  return `in ${Math.round(days / 30)} Monaten`
}

export const formatDate = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) }

export interface UpcomingItem { key: string; title: string; sub?: string; date: string; region: string; note?: string; source?: string }

/** Kommende Termine: eigene (deutsche) Einträge zuerst, dazu EN/JA-Termine aus den Handelsdaten, ohne Dubletten. */
export function upcoming(r: Releases | null, manual: UpcomingEntry[], today = new Date()): UpcomingItem[] {
  const items: UpcomingItem[] = manual.filter((m) => daysUntil(m.date, today) >= 0).map((m) => ({ key: `m-${m.date}-${m.name}`, title: m.name, sub: m.original, date: m.date, region: m.region, note: m.note, source: m.source }))
  const dates = new Set(items.map((i) => i.date))
  for (const s of r?.sets ?? []) {
    if (daysUntil(s.date, today) < 0) continue
    if (s.region === 'EN' && dates.has(s.date)) continue // schon als deutscher Eintrag erfasst
    items.push({ key: `${s.region}-${s.code}`, title: s.name, sub: s.code, date: s.date, region: s.region })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

export function recentGerman(r: Releases | null, today = new Date(), limit = 8): DeSet[] {
  return (r?.de ?? []).filter((s) => daysUntil(s.date, today) <= 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

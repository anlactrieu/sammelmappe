import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'
import { countdownLabel, daysUntil, formatDate, loadReleases, recentGerman, upcoming, type DeSet, type UpcomingItem } from '../services/releases'

const REGION: Record<string, string> = { DE: 'Deutsch', EN: 'Englisch', JA: 'Japanisch' }

/** Neuheiten: kommende Sets mit Countdown und die zuletzt erschienenen deutschen Sets. */
export default function Releases() {
  const [state, setState] = useState<{ up: UpcomingItem[]; recent: DeSet[]; stamp?: string } | null>(null)
  useEffect(() => { loadReleases().then(({ releases, manual }) => setState({ up: upcoming(releases, manual), recent: recentGerman(releases), stamp: releases?.generatedAt })) }, [])

  return (
    <div className="page">
      <header className="page-head"><Link to="/sets" className="back" aria-label="Zurück">‹</Link><h1>Neuheiten</h1></header>
      {!state && <div className="skeleton row" />}
      {state && (<>
        <section>
          <h2>Bald erhältlich</h2>
          {state.up.length === 0 && <Empty icon="📅" title="Nichts angekündigt" text="Aktuell sind keine kommenden Sets bekannt. Die Liste wird nachts aktualisiert." />}
          <ul className="list">
            {state.up.map((u) => { const d = daysUntil(u.date); return (
              <li key={u.key} className="rel">
                <div className="rel-date" aria-label={formatDate(u.date)}><b>{u.date.slice(8)}</b><small>{new Date(u.date).toLocaleDateString('de-DE', { month: 'short' })}</small></div>
                <div className="grow">
                  <strong>{u.title}</strong>
                  {u.sub && <small className="muted">{u.sub}</small>}
                  <small><b className="langtag">{u.region}</b> {REGION[u.region]} · {formatDate(u.date)} · <b>{countdownLabel(d)}</b></small>
                  {u.note && <small className="muted">{u.note}{u.source && <> <a className="link-inline" href={u.source} target="_blank" rel="noreferrer">Quelle ↗</a></>}</small>}
                </div>
              </li>) })}
          </ul>
          <p className="muted small">Englische und japanische Termine stammen aus Handelsdaten und gelten für die jeweilige Sprachausgabe. Deutsche Termine können abweichen.</p>
        </section>

        <section>
          <h2>Zuletzt auf Deutsch erschienen</h2>
          <ul className="list">
            {state.recent.map((s) => (
              <li key={s.id}><Link className="rowbtn" to={`/sets/de/${s.id}`}>
                <div className="grow"><strong>{s.name}</strong><small className="muted">{formatDate(s.date)} · {s.cards} Karten · {countdownLabel(daysUntil(s.date))}</small></div>
                <span aria-hidden>›</span>
              </Link></li>))}
          </ul>
        </section>
        {state.stamp && <p className="muted small">Stand der Daten: {new Date(state.stamp).toLocaleDateString('de-DE')}</p>}
      </>)}
    </div>
  )
}

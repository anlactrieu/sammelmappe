import { Link } from 'react-router-dom'

/** Kontakt für Datenschutzanfragen (Art. 13 DSGVO). Hier eine eigene Adresse eintragen, falls gewünscht. */
const CONTACT_URL = 'https://github.com/anlactrieu/sammelmappe/issues'

const SERVICES: { host: string; zweck: string; wann: string }[] = [
  { host: 'GitHub Pages (GitHub Inc., USA)', zweck: 'Hosting der App und der Katalogdaten', wann: 'bei jedem Öffnen der App' },
  { host: 'api.tcgdex.net, assets.tcgdex.net', zweck: 'Karten, Sets, Bilder, Preise', wann: 'bei Suche, Karten- und Set-Ansicht, Preisabgleich' },
  { host: 'tcgplayer-cdn.tcgplayer.com', zweck: 'Bilder japanischer Katalogkarten und Produkte', wann: 'wenn solche Karten oder Produkte angezeigt werden' },
  { host: 'pokeapi.co', zweck: 'Pokémon-Namen in mehreren Sprachen', wann: 'bei fremdsprachiger Suche' },
  { host: 'api.frankfurter.dev', zweck: 'Wechselkurs US-Dollar zu Euro', wann: 'beim Start der App' },
  { host: 'huggingface.co', zweck: 'Download des Foto-Erkennungsmodells (läuft danach auf dem Gerät)', wann: 'beim ersten Foto-Scan' },
  { host: 'cdn.jsdelivr.net, tessdata.projectnaptha.com', zweck: 'Daten für die Texterkennung (läuft danach auf dem Gerät)', wann: 'beim ersten Einsatz der Texterkennung' },
  { host: 'raw.githubusercontent.com (GitHub)', zweck: 'Index für die Foto-Erkennung', wann: 'beim Foto-Scan' },
]

export default function Privacy() {
  return (
    <div className="page">
      <header className="page-head"><Link to="/settings" className="back" aria-label="Zurück">‹</Link><h1>Datenschutz</h1></header>
      <section className="card">
        <h2>Kurz gesagt</h2>
        <p>Sammelmappe ist ein kostenloses, privates Hobbyprojekt ohne Konten, Werbung, Cookies und Tracking. Deine Sammlung, Fotos und Einstellungen bleiben auf deinem Gerät (Browser-Speicher) und werden nicht an mich übertragen.</p>
      </section>
      <section className="card">
        <h2>Verantwortlicher und Kontakt</h2>
        <p>Verantwortlich ist der Betreiber des Projekts <a className="link" href="https://github.com/anlactrieu/sammelmappe" target="_blank" rel="noreferrer">anlactrieu/sammelmappe</a>. Anfragen zum Datenschutz bitte über <a className="link" href={CONTACT_URL} target="_blank" rel="noreferrer">GitHub Issues</a>.</p>
      </section>
      <section className="card">
        <h2>Was auf deinem Gerät bleibt</h2>
        <p>Karten, Produkte, Wunschliste, Preisverlauf und Einstellungen liegen in der IndexedDB deines Browsers. Fotos, die du zum Erkennen aufnimmst, werden nur auf dem Gerät ausgewertet und nicht hochgeladen. Mit „Alle Daten löschen“ im Profil oder dem Löschen der Website-Daten im Browser entfernst du alles.</p>
      </section>
      <section className="card">
        <h2>Verbindungen zu Dritten</h2>
        <p>Beim Betrieb ruft die App Daten bei den folgenden Diensten ab. Dabei erhalten diese technisch zwingend deine IP-Adresse, Browser-Angaben und die Anfrage (zum Beispiel Suchbegriff oder Karten-ID). Es werden keine Sammlungsdaten gesendet.</p>
        <ul className="diag">
          {SERVICES.map((s) => <li key={s.host}><b>{s.host}</b><span>{s.zweck} · {s.wann}</span></li>)}
        </ul>
        <p className="muted small">Einige Anbieter sitzen in den USA. Eine Verarbeitung dort erfolgt nach den Regeln des jeweiligen Anbieters. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (Betrieb der gewünschten Funktion). Schriften sind in die App eingebunden und werden nicht von Google geladen.</p>
        <p className="muted small">Links zu Cardmarket, eBay oder Google öffnen sich nur, wenn du sie antippst. Ab dann gelten die Regeln der jeweiligen Seite.</p>
      </section>
      <section className="card">
        <h2>Deine Rechte</h2>
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch nach der DSGVO sowie auf Beschwerde bei einer Datenschutzaufsichtsbehörde. Da ich selbst keine personenbezogenen Daten von dir speichere, betrifft das vor allem die genannten Dienste.</p>
      </section>
      <p className="muted small center">Stand: Oktober 2026</p>
    </div>
  )
}

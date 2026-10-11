import { Component, type ReactNode } from 'react'

/** Fängt Darstellungsfehler ab, damit nie ein leerer Bildschirm bleibt. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { error: Error | null; key?: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null // bei Seitenwechsel neu versuchen
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <h1>Hoppla</h1>
        <p>Auf dieser Seite ist etwas schiefgegangen. Deine Sammlung ist nicht betroffen.</p>
        <pre className="err-detail">{this.state.error.message}</pre>
        <div className="actions">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>Nochmal versuchen</button>
          <a className="btn" href="#/">Zur Startseite</a>
          <button className="btn ghost" onClick={() => location.reload()}>App neu laden</button>
        </div>
      </div>
    )
  }
}

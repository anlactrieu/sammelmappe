import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { imageUrl } from '../services/tcgdex'
import { formatEur, isBadAmount, parseEur } from '../lib/format'
import { CONDITIONS, CONDITION_LABEL, VARIANT_LABEL, unitPrice, priceChange, cardBasePrice, catalogCardEur } from '../lib/pricing'
import { addCard, cardmarketSearchUrl, catalogCardId, tcgplayerUrl, removeItem, setProductPrice, type AddOpts } from '../lib/actions'
import type { CardRef, Condition, Item, Product, Variant } from '../types'
import { PriceLine, Sheet, useToast } from './ui'
import { Lightbox } from './Lightbox'
import { useCelebrate } from './Celebrate'
import { langLabel, langTag } from '../lib/lang'
import { cardNames } from '../services/names'

const LANGS = ['DE', 'EN', 'FR', 'IT', 'ES', 'JA', 'ZH', 'ZH-CN']

export function availableVariants(card: CardRef): Variant[] {
  const v = card.variants
  const list: Variant[] = []
  if (!v || v.normal) list.push('normal')
  if (!v || v.holo) list.push('holo')
  if (v?.reverse) list.push('reverse')
  if (v?.firstEdition) list.push('firstEdition')
  return list.length ? list : ['normal']
}

function ConditionHelp() {
  return (
    <details className="help">
      <summary>Woran erkenne ich den Zustand?</summary>
      <ul>
        <li><b>M (Mint):</b> makellos, wie frisch aus dem Booster – praktisch nur bei bewusst geschützten Karten.</li>
        <li><b>NM (Near Mint):</b> sehr gut, höchstens winzige Spuren. Das ist der Normalfall für frisch gezogene, sofort eingesleevte Karten.</li>
        <li><b>EX (Excellent):</b> leichte Gebrauchsspuren, z. B. minimal weiße Kanten oder Ecken.</li>
        <li><b>GD (Good):</b> deutlich sichtbare Kanten-/Eckenabnutzung, leichte Kratzer.</li>
        <li><b>LP (Light Played):</b> viel gespielt, klare Abnutzung, aber kein Knick.</li>
        <li><b>PL (Played):</b> stark bespielt, Knicke oder Flecken möglich.</li>
        <li><b>PO (Poor):</b> stark beschädigt (Risse, Wasserschaden, große Knicke).</li>
      </ul>
      <small className="muted">Halte die Karte gegen das Licht und prüfe Ecken, Kanten und Oberfläche. Im Zweifel nimm den schlechteren Zustand. Die Wertangabe ist dann ein Abschlag auf den Near-Mint-Preis (≈).</small>
    </details>
  )
}

function VariantHelp() {
  return (
    <details className="help">
      <summary>Woran erkenne ich die Variante?</summary>
      <ul>
        <li><b>Normal:</b> Die ganze Karte ist matt, nichts glitzert.</li>
        <li><b>Holo:</b> Nur das Bild (das Motiv) glitzert, Rahmen und Textfeld sind matt.</li>
        <li><b>Reverse Holo:</b> Umgekehrt – das Motiv ist matt, Rahmen und Hintergrund glitzern. Kippe die Karte im Licht.</li>
        <li><b>1. Edition:</b> Kleiner „1. Edition“-Stempel links neben dem Motiv (nur alte Sets).</li>
      </ul>
      <small className="muted">Unsicher? Nimm „Normal“ – du kannst es später in der Sammlung ändern.</small>
    </details>
  )
}

/** Karte mit Details zur Sammlung hinzufügen. */
export function AddCardSheet({ card, onClose, onAdded, compare }: { card: CardRef | null; onClose: () => void; onAdded?: () => void; compare?: string }) {
  const [zoom, setZoom] = useState(false)
  const toast = useToast()
  const celebrate = useCelebrate()
  const [qty, setQty] = useState(1)
  const [condition, setCondition] = useState<Condition>('NM')
  const [variant, setVariant] = useState<Variant>('normal')
  const [language, setLanguage] = useState('DE')
  const [buy, setBuy] = useState('')
  const [manual, setManual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!card) return
    setQty(1); setCondition('NM'); setBuy(''); setManual(''); setLanguage(langTag(card.lang ?? 'de'))
    const av = availableVariants(card); let last: string | null = null
    try { last = localStorage.getItem('lastVariant') } catch { /* privater Modus */ }
    setVariant(av.find((v) => v === last) ?? av[0])
  }, [card])

  if (!card) return null
  const base = cardBasePrice(card, variant)
  const preview = base ? base.value : catalogCardEur(card)
  const opts = (): AddOpts => ({ qty, condition, variant, language, buyPrice: parseEur(buy), manualPrice: parseEur(manual) })
  const save = async (andClose: boolean) => {
    if (saving) return
    if (isBadAmount(buy) || isBadAmount(manual)) return toast('Bitte gültige Beträge eingeben, z. B. 12,50')
    setSaving(true)
    try {
      try { localStorage.setItem('lastVariant', variant) } catch { /* privater Modus */ }
      await celebrate(card, { qty, condition, variant, manualPrice: parseEur(manual) }, () => addCard(card, opts()))
      onAdded?.()
      if (andClose) onClose(); else { setQty(1); setBuy(''); setManual('') }
    } finally { setSaving(false) }
  }
  const wish = async () => {
    await db.cards.put(card)
    await db.wishlist.put({ cardId: card.id, addedAt: Date.now() }).catch(() => undefined)
    toast(`${cardNames(card).name} auf der Wunschliste`); onClose()
  }
  return (
    <>
    <Sheet open onClose={onClose} title={cardNames(card).name} footer={<>
      <button className="btn primary grow-btn" disabled={saving} onClick={() => save(true)}>{qty > 1 ? `${qty}× hinzufügen` : 'Hinzufügen'}</button>
      <button className="btn" disabled={saving} onClick={() => save(false)} title="Speichern und Fenster offen lassen, z. B. für dieselbe Karte in anderem Zustand">+ Noch eins</button>
      <button className="btn ghost" onClick={wish}>Merken</button>
    </>}>
      <div className="add-head">
        {card.image && <button className="add-img-btn" onClick={() => setZoom(true)} aria-label="Karte vergrößern"><img src={imageUrl(card.image, 'low')} alt={`Karte ${card.name}`} className="add-img" /><span className="zoom-badge" aria-hidden>Vergrößern</span></button>}
        <div>
          {card.lang && <p><b className="langtag">{langTag(card.lang)}</b> <span className="muted small">{langLabel(card.lang)}e Karte{cardNames(card).alt ? ` · ${cardNames(card).alt}` : ''}</span></p>}
          <p className="muted">{card.setName}</p>
          <p className="muted small">Nr. {card.localId}{card.setTotal ? `/${card.setTotal}` : ''}{card.rarity ? ` · ${card.rarity}` : ''}</p>
          <p className="big">{preview != null ? formatEur(preview) : 'Kein Preis'}</p>
          <p className="muted small">{card.usd != null && !card.cm ? 'US-Marktpreis (TCGplayer, Japan) – in Euro umgerechnet, Richtwert' : card.cm ? `Cardmarket-Trend (NM)${card.lang === 'ja' || card.lang === 'zh-tw' || card.lang === 'zh-cn' ? ' – Richtwert der asiatischen Ausgabe' : ''}` : 'Noch kein Marktpreis – unten manuell eintragen'}</p>
          {catalogCardId(card) != null && card.priceSource === 'catalog-ja' && <a className="link small" target="_blank" rel="noreferrer" href={tcgplayerUrl(catalogCardId(card)!)}>Quelle: TCGplayer ↗</a>}
        </div>
      </div>

      <div className="field" role="group">Variante
        <div className="chips">{availableVariants(card).map((v) => { const bp = cardBasePrice(card, v); return (
          <button key={v} aria-pressed={v === variant} className={`chip${v === variant ? ' on' : ''}`} onClick={() => setVariant(v)}>{VARIANT_LABEL[v]}{bp ? ` · ${formatEur(bp.value)}` : ''}</button>) })}</div>
        {availableVariants(card).length === 1 ? <small className="muted">Diese Karte gibt es nur als {VARIANT_LABEL[availableVariants(card)[0]]}.</small> : <VariantHelp />}
      </div>
      <div className="field" role="group">Zustand
        <div className="chips tight">{CONDITIONS.map((c) => (
          <button key={c} aria-pressed={c === condition} className={`chip${c === condition ? ' on' : ''}`} onClick={() => setCondition(c)} title={CONDITION_LABEL[c]}>{c}</button>))}</div>
        <small className="muted">{CONDITION_LABEL[condition]}</small>
        <ConditionHelp />
      </div>
      <div className="field" role="group">Menge
        <div className="stepper">
          <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Weniger">−</button>
          <output aria-live="polite">{qty}</output>
          <button onClick={() => setQty(qty + 1)} aria-label="Mehr">+</button>
        </div>
      </div>
      <details className="help more">
        <summary>Mehr Angaben: Sprache, Kaufpreis …</summary>
        <label className="field">Sprache
          <select value={language} disabled={!!card.lang} onChange={(e) => setLanguage(e.target.value)}>{[...new Set([language, ...LANGS])].map((l) => <option key={l}>{l}</option>)}</select>
        </label>
        <div className="row2">
          <label className="field">Kaufpreis / Stück
            <input inputMode="decimal" placeholder="z. B. 1,50" value={buy} onChange={(e) => setBuy(e.target.value)} />
          </label>
          <label className="field">Eigener Preis
            <input inputMode="decimal" placeholder="statt Marktpreis" value={manual} onChange={(e) => setManual(e.target.value)} />
          </label>
        </div>
      </details>
    </Sheet>
    {zoom && card.image && <Lightbox src={imageUrl(card.image, 'high')} alt={cardNames(card).name} compare={compare} onClose={() => setZoom(false)} />}
    </>
  )
}

/** Exemplar bearbeiten, Preis schnell setzen, entfernen. */
export function ItemSheet({ item, card, product, onClose }: { item: Item | null; card?: CardRef; product?: Product; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<Item | null>(null)
  const [manual, setManual] = useState('')
  const [buy, setBuy] = useState('')
  const [gradeCo, setGradeCo] = useState('')
  const [grade, setGrade] = useState('')

  useEffect(() => {
    if (!item) return
    setF(item)
    setManual(item.kind === 'product' ? (product?.price != null ? String(product.price).replace('.', ',') : '') : item.manualPrice != null ? String(item.manualPrice).replace('.', ',') : '')
    setBuy(item.buyPrice != null ? String(item.buyPrice).replace('.', ',') : '')
    setGradeCo(item.graded?.company ?? ''); setGrade(item.graded?.grade ?? '')
  }, [item, product])

  if (!item || !f) return null
  const price = unitPrice({ ...f, manualPrice: item.kind === 'product' ? undefined : parseEur(manual) }, card, product)
  const name = card ? cardNames(card).name : product?.name ?? 'Eintrag'
  const ch7 = card ? priceChange(card, 7, f.variant === 'reverse') : null

  const save = async () => {
    if (isBadAmount(buy) || isBadAmount(manual)) return toast('Bitte gültige Beträge eingeben, z. B. 12,50')
    const patch: Partial<Item> = { qty: f.qty, condition: f.condition, variant: f.variant, language: f.language, notes: f.notes, buyPrice: parseEur(buy),
      graded: gradeCo ? { company: gradeCo as NonNullable<Item['graded']>['company'], grade: grade || '?' } : undefined }
    if (item.kind === 'product') {
      await setProductPrice(item.refId, parseEur(manual))
    } else {
      const m = parseEur(manual)
      patch.manualPrice = m
      patch.manualPriceAt = m != null ? (m === item.manualPrice ? item.manualPriceAt : Date.now()) : undefined
    }
    await db.items.update(item.id!, patch)
    toast('Gespeichert'); onClose()
  }
  const del = async () => { if (confirm(`„${name}" aus der Sammlung entfernen?`)) { await removeItem(item.id!); toast('Entfernt'); onClose() } }

  return (
    <Sheet open onClose={onClose} title={name} footer={<>
      <button className="btn primary grow-btn" onClick={save}>Speichern</button>
      <button className="btn danger" onClick={del}>Entfernen</button>
    </>}>
      <div className="add-head">
        {card?.image && <img src={imageUrl(card.image, 'low')} alt={`Karte ${name}`} className="add-img" />}
        <div>
          <p className="muted">{card ? `${card.lang ? langTag(card.lang) + ' · ' : ''}${cardNames(card).alt ? cardNames(card).alt + ' · ' : ''}${card.setName} · ${card.localId}` : product?.type}</p>
          <p className="big"><PriceLine price={price} qty={f.qty} compact /></p>
          <p className="muted small"><PriceLine price={price} /></p>
          {ch7 != null && <p className={`small ${ch7 >= 0 ? 'up' : 'down'}`}>{ch7 >= 0 ? '▲' : '▼'} {Math.abs(ch7).toFixed(1).replace('.', ',')} % ggü. 7-Tage-Schnitt</p>}
        </div>
      </div>

      {item.kind === 'card' && card && <>
        <div className="field" role="group">Variante<div className="chips">{availableVariants(card).map((v) => (
          <button key={v} aria-pressed={v === f.variant} className={`chip${v === f.variant ? ' on' : ''}`} onClick={() => setF({ ...f, variant: v })}>{VARIANT_LABEL[v]}</button>))}</div></div>
        <div className="field" role="group">Zustand<div className="chips tight">{CONDITIONS.map((c) => (
          <button key={c} aria-pressed={c === f.condition} className={`chip${c === f.condition ? ' on' : ''}`} onClick={() => setF({ ...f, condition: c })}>{c}</button>))}</div><ConditionHelp /></div>
        <label className="field">Sprache
          <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{[...new Set([f.language, ...LANGS])].map((l) => <option key={l}>{l}</option>)}</select></label>
        <div className="row2">
          <label className="field">Grading
            <select value={gradeCo} onChange={(e) => setGradeCo(e.target.value)}>
              <option value="">Ungradet</option>{['PSA', 'CGC', 'BGS', 'Sonstige'].map((g) => <option key={g}>{g}</option>)}</select></label>
          <label className="field">Note<input value={grade} disabled={!gradeCo} placeholder="z. B. 10" onChange={(e) => setGrade(e.target.value)} /></label>
        </div>
        {gradeCo && <p className="hint">Gradete Karten haben meist einen deutlich anderen Wert – trage unten deinen Preis ein.</p>}
      </>}

      <div className="row2">
        <div className="field" role="group">Menge
          <div className="stepper"><button onClick={() => setF({ ...f, qty: Math.max(1, f.qty - 1) })} aria-label="Weniger">−</button><output>{f.qty}</output>
            <button onClick={() => setF({ ...f, qty: f.qty + 1 })} aria-label="Mehr">+</button></div></div>
        <label className="field">Kaufpreis / Stück<input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="optional" /></label>
      </div>
      <label className="field">{item.kind === 'product' ? 'Marktpreis / Stück' : 'Eigener Preis / Stück (überschreibt Markt)'}
        <input inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="z. B. 129,90" />
      </label>
      <a className="link" target="_blank" rel="noreferrer" href={cardmarketSearchUrl(name + (card ? ' ' + card.localId : ''))}>Preis auf Cardmarket nachschauen ↗</a>
      {(() => { const id = card?.priceSource === 'catalog-ja' ? catalogCardId(card) : product?.priceSource === 'catalog' ? product.catalogId : undefined; return id != null && id > 0 ? <a className="link" target="_blank" rel="noreferrer" href={tcgplayerUrl(id)}>Preisquelle: TCGplayer ↗</a> : null })()}
      <label className="field">Notiz<textarea rows={2} value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      {card && <Link className="link" to={`/sets/${card.lang ?? 'de'}/${card.setId}`} onClick={onClose}>Ganzes Set ansehen →</Link>}
    </Sheet>
  )
}

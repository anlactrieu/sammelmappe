import { db } from '../db'
import type { CardRef, DexNames } from '../types'

interface Species { names: { name: string; language: { name: string } }[] }

/** Pokémon-Namen je Sprache über die Pokédex-Nummer (PokeAPI, gecacht). */
export async function dexNames(id: number): Promise<DexNames | undefined> {
  const hit = await db.dex.get(id)
  if (hit?.v === 2) return hit
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
    if (!r.ok) return undefined
    const s = (await r.json()) as Species
    const n = (l: string) => s.names.find((x) => x.language.name === l)?.name
    const rec: DexNames = { id, v: 2, de: n('de'), en: n('en'), ja: n('ja') ?? n('ja-hrkt'), zhTw: n('zh-hant'), zhCn: n('zh-hans') }
    await db.dex.put(rec)
    return rec
  } catch { return undefined }
}

/** Deutscher Name einer Karte: bei de/en/… über dexId; nur wenn die Karte ein Pokémon ist. */
export async function attachGermanName(card: CardRef): Promise<CardRef> {
  if ((card.lang ?? 'de') === 'de' || card.nameDe || !card.dexId) return card
  const d = await dexNames(card.dexId)
  return d?.de ? { ...card, nameDe: d.de } : card
}

/** Anzeigename (deutsch bevorzugt) und Originalname (nur wenn abweichend). */
export function cardNames(card: Pick<CardRef, 'name' | 'nameDe'>): { name: string; alt?: string } {
  return card.nameDe && card.nameDe !== card.name ? { name: card.nameDe, alt: card.name } : { name: card.name }
}

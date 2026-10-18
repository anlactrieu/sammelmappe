import { db } from '../db'
import { addCard } from '../lib/actions'
import { fetchCard } from '../services/tcgdex'
import { availableVariants } from './CardSheets'
import { useToast } from './ui'
import { useCelebrate } from './Celebrate'
import { cardNames } from '../services/names'
import { langTag } from '../lib/lang'
import { VARIANT_LABEL } from '../lib/pricing'
import type { Variant } from '../types'

/** Ein-Tap-Hinzufügen: Standardwerte (Near Mint, Menge 1, Deutsch, erste Variante) mit Rückgängig. */
export function useQuickAdd() {
  const toast = useToast()
  const celebrate = useCelebrate()
  return async (cardId: string, qty = 1, wanted?: Variant): Promise<boolean> => {
    try {
      const card = await fetchCard(cardId)
      const avail = availableVariants(card)
      const variant = wanted && avail.includes(wanted) ? wanted : avail[0]
      const showVar = avail.length > 1
      let id = 0
      await celebrate(card, { qty, condition: 'NM', variant }, async () => { id = await addCard(card, { qty, condition: 'NM', variant, language: langTag(card.lang ?? 'de') }) }, true)
      toast(`${qty > 1 ? qty + '× ' : ''}${cardNames(card).name}${card.lang ? ' (' + langTag(card.lang) + ')' : ''}${showVar ? ' · ' + VARIANT_LABEL[variant] : ''} hinzugefügt`, {
        label: 'Rückgängig',
        run: async () => {
          const it = await db.items.get(id)
          if (!it) return
          if (it.qty > qty) await db.items.update(id, { qty: it.qty - qty }); else await db.items.delete(id)
        },
      })
      return true
    } catch { toast('Karte konnte nicht hinzugefügt werden – offline?'); return false }
  }
}

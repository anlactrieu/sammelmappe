import { db } from '../db'
import { addCard } from '../lib/actions'
import { fetchCard } from '../services/tcgdex'
import { availableVariants } from './CardSheets'
import { useToast } from './ui'
import { cardNames } from '../services/names'
import { langTag } from '../lib/lang'

/** Ein-Tap-Hinzufügen: Standardwerte (Near Mint, Menge 1, Deutsch, erste Variante) mit Rückgängig. */
export function useQuickAdd() {
  const toast = useToast()
  return async (cardId: string, qty = 1): Promise<boolean> => {
    try {
      const card = await fetchCard(cardId)
      const id = await addCard(card, { qty, condition: 'NM', variant: availableVariants(card)[0], language: langTag(card.lang ?? 'de') })
      toast(`${qty > 1 ? qty + '× ' : ''}${cardNames(card).name}${card.lang ? ' (' + langTag(card.lang) + ')' : ''} hinzugefügt`, {
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

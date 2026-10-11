/** Kartensprachen: Deutsch bleibt Standard (IDs ohne Präfix, damit bestehende Sammlungen weiter passen). */
export type Lang = 'de' | 'en' | 'ja' | 'zh-tw' | 'zh-cn'

export const LANGS: { code: Lang; label: string; tag: string; native: string; short?: string }[] = [
  { code: 'de', label: 'Deutsch', tag: 'DE', native: 'Deutsch' },
  { code: 'en', label: 'Englisch', tag: 'EN', native: 'English' },
  { code: 'ja', label: 'Japanisch', tag: 'JA', native: '日本語', short: 'Japanisch' },
  { code: 'zh-tw', label: 'Chinesisch (trad.)', tag: 'ZH', native: '繁體中文', short: 'Chinesisch trad.' },
  { code: 'zh-cn', label: 'Chinesisch (vereinf.)', tag: 'ZH-CN', native: '简体中文', short: 'Chinesisch einf.' },
]
export const langTag = (l: Lang) => LANGS.find((x) => x.code === l)?.tag ?? l.toUpperCase()
export const langLabel = (l: Lang) => LANGS.find((x) => x.code === l)?.label ?? l

/** Karten-Schlüssel: Deutsch roh ("sv01-025"), sonst "ja:SV2a-025". */
export const cardKey = (lang: Lang, apiId: string) => (lang === 'de' ? apiId : `${lang}:${apiId}`)
export function parseKey(key: string): { lang: Lang; apiId: string } {
  const m = key.match(/^(en|ja|zh-tw|zh-cn):(.+)$/)
  return m ? { lang: m[1] as Lang, apiId: m[2] } : { lang: 'de', apiId: key }
}
/** Sprache des Eintrags (Item.language) ↔ Kartensprache. */
export const itemLang = (l: Lang) => langTag(l)

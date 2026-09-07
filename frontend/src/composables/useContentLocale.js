import { useI18n } from 'vue-i18n'

/**
 * Composable for resolving multilingual content fields.
 *
 * Handles three formats:
 *   1. Plain string (old format): returns as-is
 *   2. Object with locale keys { en: "...", fr: "..." }: returns field[locale]
 *   3. null/undefined: returns ''
 *
 * Fallback chain: current locale → 'en' → first available value
 */
export function useContentLocale() {
  const { locale } = useI18n()

  function tc(field) {
    if (field == null) return ''
    if (typeof field === 'string') return field
    if (typeof field === 'object' && !Array.isArray(field)) {
      if (field[locale.value]) return field[locale.value]
      if (field.en) return field.en
      const first = Object.values(field)[0]
      return typeof first === 'string' ? first : ''
    }
    return String(field)
  }

  /** Returns true if the field is multilingual but missing the current locale */
  function isMissing(field) {
    if (field == null || typeof field === 'string') return false
    if (typeof field === 'object' && !Array.isArray(field)) {
      return !field[locale.value] && !!field.en
    }
    return false
  }

  /** Resolve an array of multilingual items (e.g. tags, learningOutcomes) */
  function tcArray(arr) {
    if (!Array.isArray(arr)) return arr || []
    return arr.map(item => tc(item))
  }

  return { tc, tcArray, isMissing, locale }
}

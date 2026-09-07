import { createI18n } from 'vue-i18n'
import { watch } from 'vue'
import en from './locales/en.json'
import fr from './locales/fr.json'

const messages = { en, fr }

// Detect available locales from the imported files
const availableLocales = Object.keys(messages).sort()

// Restore user preference or default to English
const savedLocale = localStorage.getItem('academy-locale')
const defaultLocale = savedLocale && availableLocales.includes(savedLocale) ? savedLocale : 'en'

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: defaultLocale,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages
})

// Persist locale changes and update <html lang>
document.documentElement.lang = defaultLocale
watch(i18n.global.locale, (newLocale) => {
  localStorage.setItem('academy-locale', newLocale)
  document.documentElement.lang = newLocale
})

export { availableLocales }
export default i18n

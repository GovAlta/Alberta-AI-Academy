<script setup>
import { useI18n } from 'vue-i18n'
import { availableLocales } from '@/i18n.js'

defineProps({
  variant: { type: String, default: 'dark' }
})

const { locale, t } = useI18n()

function setLocale(loc) {
  locale.value = loc
}
</script>

<template>
  <div class="lang-switcher" :class="{ 'lang-switcher--light': variant === 'light' }" role="group" :aria-label="t('language.switchLabel')">
    <button
      v-for="loc in availableLocales"
      :key="loc"
      class="lang-switcher__btn"
      :class="{ 'lang-switcher__btn--active': locale === loc }"
      :aria-pressed="locale === loc"
      @click="setLocale(loc)"
    >
      {{ loc.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.lang-switcher {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  overflow: hidden;
  flex-shrink: 0;
}

.lang-switcher__btn {
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  line-height: 1.4;
}

.lang-switcher__btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.lang-switcher__btn--active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.lang-switcher__btn:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: -1px;
}

/* Dark-on-light variant — used inside modals and light-background contexts */
.lang-switcher--light {
  border-color: var(--goa-color-greyscale-300);
}

.lang-switcher--light .lang-switcher__btn {
  color: var(--goa-color-text-secondary);
}

.lang-switcher--light .lang-switcher__btn:hover {
  color: var(--goa-color-text-default);
  background: var(--goa-color-greyscale-100);
}

.lang-switcher--light .lang-switcher__btn--active {
  background: var(--goa-color-interactive-default);
  color: #fff;
}
</style>

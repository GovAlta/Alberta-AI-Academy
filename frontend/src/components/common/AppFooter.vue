<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <footer class="site-footer" role="contentinfo">
    <div class="goa-container site-footer__inner">
      <div class="site-footer__brand">
        <span class="site-footer__name">{{ t('header.siteName') }}</span>
        <span class="site-footer__gov">&copy; {{ new Date().getFullYear() }} {{ t('footer.copyright') }}</span>
      </div>
      <p class="site-footer__disclaimer">
        {{ t('footer.disclaimer') }}
      </p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  background: var(--goa-color-greyscale-black);
  color: var(--goa-color-text-light);
  padding: var(--goa-space-xl) 0;
}

.site-footer__inner {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
}

.site-footer__brand {
  display: flex;
  align-items: baseline;
  gap: var(--goa-space-m);
  flex-wrap: wrap;
}

.site-footer__name {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
}

.site-footer__gov {
  font-size: var(--goa-font-size-2);
  opacity: 0.7;
}

.site-footer__disclaimer {
  font-size: var(--goa-font-size-2);
  opacity: 0.6;
  margin: 0;
}
</style>

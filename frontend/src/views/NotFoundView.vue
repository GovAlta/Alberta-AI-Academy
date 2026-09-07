<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="page-layout">
    <header class="site-header" role="banner">
      <div class="goa-container site-header__inner">
        <div class="site-header__brand">
          <RouterLink to="/" class="site-header__home-link" :aria-label="t('notFound.goHome')">
            <span aria-hidden="true">🏛</span>
          </RouterLink>
          <div>
            <span class="site-header__gov">{{ t('footer.copyright') }}</span>
            <span class="site-header__name">{{ t('header.siteName') }}</span>
          </div>
        </div>
      </div>
    </header>

    <main id="main-content" class="page-main not-found">
      <div class="goa-container not-found__inner">
        <p class="not-found__code" aria-hidden="true">404</p>
        <h1 class="not-found__title">{{ t('notFound.title') }}</h1>
        <p class="not-found__message">
          {{ t('notFound.message') }}
        </p>
        <div class="not-found__actions">
          <RouterLink to="/" class="btn btn--primary">{{ t('notFound.goHome') }}</RouterLink>
          <RouterLink to="/level/1" class="btn btn--secondary">{{ t('notFound.startLevel1') }}</RouterLink>
        </div>
      </div>
    </main>

    <footer class="site-footer" role="contentinfo">
      <div class="goa-container">
        <span class="site-footer__name">{{ t('header.siteName') }}</span>
        <span class="site-footer__gov"> · &copy; {{ new Date().getFullYear() }} {{ t('footer.copyright') }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site-header {
  background: var(--goa-color-brand-default);
  color: var(--goa-color-text-light);
  padding: var(--goa-space-m) 0;
}

.site-header__inner {
  display: flex;
  align-items: center;
  gap: var(--goa-space-m);
}

.site-header__brand {
  display: flex;
  align-items: center;
  gap: var(--goa-space-m);
}

.site-header__home-link {
  font-size: 1.75rem;
  text-decoration: none;
  line-height: 1;
  color: var(--goa-color-text-light);
}

.site-header__gov {
  display: block;
  font-size: var(--goa-font-size-2);
  opacity: 0.8;
  color: var(--goa-color-text-light);
}

.site-header__name {
  display: block;
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-light);
}

.not-found {
  display: flex;
  align-items: center;
  min-height: 60vh;
}

.not-found__inner {
  text-align: center;
  padding: var(--goa-space-3xl) var(--goa-space-xl);
}

.not-found__code {
  font-size: 6rem;
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-greyscale-200);
  margin: 0;
  line-height: 1;
}

.not-found__title {
  color: var(--goa-color-text-default);
}

.not-found__message {
  color: var(--goa-color-text-secondary);
  margin: 0 0 var(--goa-space-xl) 0;
}

.not-found__actions {
  display: flex;
  justify-content: center;
  gap: var(--goa-space-m);
  flex-wrap: wrap;
}

.site-footer {
  background: var(--goa-color-greyscale-black);
  color: var(--goa-color-text-light);
  padding: var(--goa-space-xl) 0;
}

.site-footer__name {
  font-weight: var(--goa-font-weight-bold);
}

.site-footer__gov {
  font-size: var(--goa-font-size-2);
  opacity: 0.7;
}
</style>

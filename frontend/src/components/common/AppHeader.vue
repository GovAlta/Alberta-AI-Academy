<script setup>
import { ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import albertaLogo from '@/assets/alberta-logo.svg'
import { LOCKED_LEVELS } from '@/stores/content.js'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'

const { t } = useI18n()
const route = useRoute()
const menuOpen = ref(false)

function isCurrentLevel(levelNum) {
  const id = route.params.levelId
  return id === String(levelNum) || id === `level${levelNum}`
}

function isNavLocked(levelId) {
  const id = String(levelId).match(/^\d+$/) ? `level${levelId}` : String(levelId)
  return LOCKED_LEVELS.includes(id)
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <header class="site-header" role="banner">
    <div class="site-header__inner">
      <!-- Brand -->
      <RouterLink to="/" class="site-header__brand" :aria-label="t('header.siteNameAria')" @click="closeMenu">
        <img :src="albertaLogo" :alt="t('footer.copyright')" class="site-header__logo" width="112" height="32" />
        <span class="site-header__name">{{ t('header.siteName') }}</span>
      </RouterLink>

      <!-- Hamburger button -->
      <button
        class="site-header__toggle"
        :aria-expanded="menuOpen"
        aria-controls="main-nav"
        :aria-label="t('header.toggleNav')"
        @click="menuOpen = !menuOpen"
      >
        <span class="hamburger" :class="{ 'hamburger--open': menuOpen }">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      <!-- Nav -->
      <nav id="main-nav" class="site-header__nav" :class="{ 'site-header__nav--open': menuOpen }" aria-label="Main navigation">
        <ul>
          <li class="nav-albert-mobile">
            <a href="https://albert.it.com/" target="_blank" rel="noopener noreferrer" :aria-label="t('nav.albert') + ' (opens in new window)'" @click="closeMenu">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 200" class="site-header__albert-icon" role="presentation" aria-hidden="true">
                <defs>
                  <linearGradient id="albert-icon-bg-sm" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#6366f1"/>
                    <stop offset="100%" stop-color="#22d3ee"/>
                  </linearGradient>
                </defs>
                <rect x="0" y="25" width="150" height="150" rx="33" ry="33" fill="url(#albert-icon-bg-sm)"/>
                <svg x="19" y="44" width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                  <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
                  <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
                  <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
                  <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
                  <path d="M6 18a4 4 0 0 1-1.967-.516"/>
                  <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
                </svg>
              </svg>
              {{ t('nav.albert') }}
            </a>
          </li>
          <li class="nav-lang-mobile">
            <LanguageSwitcher />
          </li>
          <li>
            <RouterLink to="/" :aria-current="route.name === 'home' ? 'page' : undefined" @click="closeMenu">{{ t('nav.home') }}</RouterLink>
          </li>
          <li>
            <RouterLink to="/level/masterclass" :aria-current="route.params.levelId === 'masterclass' ? 'page' : undefined" :class="{ 'nav-locked': isNavLocked('masterclass') }" @click="closeMenu">{{ t('nav.masterclass') }}</RouterLink>
          </li>
          <li>
            <RouterLink to="/level/1" :aria-current="isCurrentLevel(1) ? 'page' : undefined" @click="closeMenu">{{ t('nav.level1') }}</RouterLink>
          </li>
          <li>
            <RouterLink to="/level/2" :aria-current="isCurrentLevel(2) ? 'page' : undefined" :class="{ 'nav-locked': isNavLocked(2) }" @click="closeMenu">{{ t('nav.level2') }}</RouterLink>
          </li>
          <li>
            <RouterLink to="/level/3" :aria-current="isCurrentLevel(3) ? 'page' : undefined" :class="{ 'nav-locked': isNavLocked(3) }" @click="closeMenu">{{ t('nav.level3') }}</RouterLink>
          </li>
          <li>
            <RouterLink to="/chat" :aria-current="route.name === 'chat' ? 'page' : undefined" @click="closeMenu">{{ t('nav.chat') }}</RouterLink>
          </li>
        </ul>
      </nav>

      <!-- Albert link — right of nav on desktop only -->
      <a
        href="https://albert.it.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="site-header__albert"
        :aria-label="t('header.albertAria') + ' (opens in new window)'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 200" class="site-header__albert-icon" role="presentation" aria-hidden="true">
          <defs>
            <linearGradient id="albert-icon-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#6366f1"/>
              <stop offset="100%" stop-color="#22d3ee"/>
            </linearGradient>
          </defs>
          <rect x="0" y="25" width="150" height="150" rx="33" ry="33" fill="url(#albert-icon-bg)"/>
          <svg x="19" y="44" width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
            <path d="M6 18a4 4 0 0 1-1.967-.516"/>
            <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
          </svg>
        </svg>
        <span class="site-header__albert-label">{{ t('nav.albert') }}</span>
      </a>

      <!-- Language switcher — desktop only (mobile version is in nav dropdown) -->
      <LanguageSwitcher class="site-header__lang-desktop" />
    </div>
  </header>
</template>

<style scoped>
.site-header {
  background: var(--goa-color-brand-default);
  color: var(--goa-color-text-light);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: var(--goa-shadow-300);
  height: 60px;
}

.site-header__inner {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 1rem;
  max-width: 1280px;
  margin: 0 auto;
  position: relative;
}

/* Brand */
.site-header__brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
  color: var(--goa-color-text-light);
  flex: 1;
  min-width: 0;
}

/* Alberta logo — invert to white on the dark header */
.site-header__logo {
  display: block;
  flex-shrink: 0;
  filter: brightness(0) invert(1);
  height: 28px;
  width: auto;
}

.site-header__name {
  font-size: 0.9rem;
  font-weight: var(--goa-font-weight-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 1px solid rgba(255, 255, 255, 0.35);
  padding-left: 0.625rem;
}

/* Hamburger toggle */
.site-header__toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--goa-color-text-light);
  border-radius: 4px;
  flex-shrink: 0;
}

.site-header__toggle:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 2px;
}

.hamburger {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 22px;
  height: 16px;
}

.hamburger span {
  display: block;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
  transition: transform 0.2s ease, opacity 0.2s ease;
  transform-origin: center;
}

/* X state */
.hamburger--open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger--open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}
.hamburger--open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Nav — mobile: hidden dropdown */
.site-header__nav {
  display: none;
  position: absolute;
  top: 60px;
  left: 0;
  right: 0;
  background: var(--goa-color-brand-default);
  box-shadow: var(--goa-shadow-300);
  z-index: 99;
}

.site-header__nav--open {
  display: block;
}

.site-header__nav ul {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
}

.site-header__nav li {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.site-header__nav li:last-child {
  border-bottom: none;
}

.site-header__nav a {
  display: block;
  padding: 0.75rem 1.25rem;
  color: var(--goa-color-text-light);
  text-decoration: none;
  font-weight: var(--goa-font-weight-medium);
  font-size: 0.95rem;
  opacity: 0.9;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.site-header__nav a:hover,
.site-header__nav a[aria-current] {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.site-header__nav a[aria-current] {
  font-weight: var(--goa-font-weight-bold);
  border-left: 3px solid var(--goa-color-text-light);
  padding-left: calc(1.25rem - 3px);
}

.site-header__nav a:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: -3px;
}

.site-header__nav a.nav-locked {
  opacity: 0.65;  /* WCAG AA: minimum 4.5:1 contrast for text on dark background */
}

/* Albert link — hidden on mobile (shown in nav dropdown instead) */
.site-header__albert {
  display: none;
}

/* Icon SVG — shared between desktop and mobile */
.site-header__albert-icon {
  display: block;
  height: 33px;
  width: auto;
  flex-shrink: 0;
}

/* Label text */
.site-header__albert-label {
  font-size: 0.875rem;
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-light);
  white-space: nowrap;
  line-height: 1;
  position: relative;
  top: 2px;
}

/* Mobile: Albert as first item in dropdown */
.nav-albert-mobile {
  display: list-item;
}

/* Mobile: language switcher in dropdown */
.nav-lang-mobile {
  display: list-item;
  padding: 0.5rem 1.25rem;
}

/* Desktop: language switcher hidden on mobile */
.site-header__lang-desktop {
  display: none;
}

/* Desktop: inline nav, hide hamburger */
@media (min-width: 768px) {
  .site-header__toggle {
    display: none;
  }

  .site-header__nav {
    display: flex !important;
    position: static;
    background: none;
    box-shadow: none;
    flex-shrink: 0;
  }

  .site-header__nav ul {
    display: flex;
    gap: 0.25rem;
    padding: 0;
  }

  .site-header__nav li {
    border-bottom: none;
  }

  .site-header__nav a {
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .site-header__nav a[aria-current] {
    border-left: none;
    padding-left: 0.75rem;
    background: rgba(255, 255, 255, 0.15);
  }

  /* Albert — right of nav on desktop */
  .site-header__albert {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    text-decoration: none;
    opacity: 0.92;
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
    margin-left: 0.5rem;
    flex-shrink: 0;
  }

  .site-header__albert:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .site-header__albert:focus-visible {
    outline: 3px solid var(--goa-color-interactive-focus);
    outline-offset: 2px;
  }

  /* Hide Albert and lang switcher from desktop nav dropdown */
  .nav-albert-mobile,
  .nav-lang-mobile {
    display: none;
  }

  /* Show desktop language switcher */
  .site-header__lang-desktop {
    display: flex;
    margin-left: 0.5rem;
  }
}
</style>

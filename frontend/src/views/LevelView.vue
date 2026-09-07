<script setup>
import { ref, computed, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useContentLocale } from '@/composables/useContentLocale.js'
import { useContentStore } from '@/stores/content.js'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ContentCard from '@/components/features/ContentCard.vue'
import ContentDetailModal from '@/components/features/ContentDetailModal.vue'

const { t } = useI18n()
const { tc } = useContentLocale()

const props = defineProps({
  levelId: {
    type: String,
    required: true
  }
})

const contentStore = useContentStore()
const router = useRouter()

const isLocked = computed(() => contentStore.isLevelLocked(props.levelId))

const searchQuery = ref('')
const activeTypeFilter = ref('all')
const viewMode = ref('cards') // 'cards' or 'list'

const level = computed(() => contentStore.getLevelById(props.levelId))

// Redirect to 404 if level doesn't exist
watch(level, (val) => {
  if (val === undefined) {
    router.replace({ name: 'not-found' })
  }
}, { immediate: true })

const contentTypes = ['all', 'module', 'video', 'article', 'tool', 'download', 'social', 'link']

function typeLabel(type) {
  return type === 'all' ? t('level.all') : t('contentTypes.' + type)
}

const TYPE_ICONS = {
  module: '📋',
  video: '▶',
  article: '📄',
  tool: '🔧',
  download: '⬇',
  social: '🔗',
  link: '↗'
}

const activeDayFilter = ref('all')

const filteredItems = computed(() => {
  if (!level.value) return []
  const levelId = level.value.id

  let items
  if (searchQuery.value.trim()) {
    items = contentStore.searchItems(searchQuery.value, levelId)
    if (activeTypeFilter.value !== 'all') {
      items = items.filter((item) => item.type === activeTypeFilter.value)
    }
  } else {
    items = contentStore.filterByType(levelId, activeTypeFilter.value)
  }

  // Apply day filter
  if (activeDayFilter.value !== 'all') {
    const dayNum = parseInt(activeDayFilter.value)
    items = items.filter((item) => item.day === dayNum)
  }

  return items
})

/** Days available for filtering */
const availableDays = computed(() => {
  if (!level.value || !level.value.days) return []
  return level.value.days
})

/** Whether this level uses day-based grouping */
const hasDays = computed(() => availableDays.value.length > 0)

/** Items grouped by day for grouped display */
const groupedByDay = computed(() => {
  if (!hasDays.value || searchQuery.value.trim() || activeTypeFilter.value !== 'all' || activeDayFilter.value !== 'all') {
    return null // Show flat grid when filtering/searching
  }
  const groups = []
  for (const day of availableDays.value) {
    const dayItems = filteredItems.value.filter(item => item.day === day.day)
    if (dayItems.length > 0) {
      groups.push({ ...day, items: dayItems })
    }
  }
  return groups.length > 0 ? groups : null
})

// Only show type filter buttons for types that actually exist in this level
const availableTypes = computed(() => {
  if (!level.value) return ['all']
  const typesInLevel = new Set(level.value.items.map((i) => i.type))
  return contentTypes.filter((t) => t === 'all' || typesInLevel.has(t))
})

// Detail modal state
const selectedItem = ref(null)

function openDetail(item) {
  if (isLocked.value) return
  selectedItem.value = item
}

function closeDetail() {
  selectedItem.value = null
}

function downloadCurriculumJSON() {
  if (!level.value) return
  // Serialize the live level data from the store so the download always
  // matches what the site is showing (src/data is the single source of truth).
  const blob = new Blob([JSON.stringify(level.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${level.value.id}-curriculum.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Update page title and meta description to reflect the actual level name
watchEffect(() => {
  if (level.value) {
    document.title = `${tc(level.value.title)} — ${t('header.siteName')}`
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) metaDesc.setAttribute('content', tc(level.value.description))
  }
})

// Reset filters when navigating between levels
watch(() => props.levelId, () => {
  activeDayFilter.value = 'all'
  activeTypeFilter.value = 'all'
  searchQuery.value = ''
  selectedItem.value = null
})

// Level navigation helpers — array-index-based to support any number of levels
const levelIndex = computed(() => {
  const id = props.levelId
  return contentStore.levels.findIndex(l => l.id === id || l.id === `level${id}`)
})
const prevLevel = computed(() => {
  return levelIndex.value > 0 ? contentStore.levels[levelIndex.value - 1].id : null
})
const nextLevel = computed(() => {
  return levelIndex.value < contentStore.levels.length - 1 ? contentStore.levels[levelIndex.value + 1].id : null
})
</script>

<template>
  <div v-if="level" class="page-layout">
    <AppHeader />

    <main id="main-content" class="page-main">
      <!-- Level hero banner -->
      <section
        class="level-hero"
        :style="{ '--level-colour': level.colour }"
        aria-labelledby="level-heading"
      >
        <div class="goa-container level-hero__inner">
          <nav class="level-hero__breadcrumb" aria-label="Breadcrumb">
            <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
            <span aria-hidden="true"> › </span>
            <span aria-current="page">{{ tc(level.title) }}</span>
          </nav>
          <div class="level-hero__content">
            <div>
              <span class="badge" :class="`badge--${level.difficulty}`">{{ level.difficulty }}</span>
              <h1 id="level-heading" class="level-hero__title">{{ tc(level.title) }}</h1>
              <p class="level-hero__subtitle">{{ tc(level.subtitle) }}</p>
            </div>
          </div>
          <p class="level-hero__description">{{ tc(level.description) }}</p>
        </div>
      </section>

      <!-- Coming soon banner (locked levels only) -->
      <div v-if="isLocked" class="locked-banner" role="status">
        <span class="locked-banner__icon" aria-hidden="true">🔒</span>
        <span>{{ t('level.locked') }}</span>
      </div>

      <!-- Search and filter bar -->
      <section class="filter-bar" aria-label="Search and filter resources">
        <div class="goa-container filter-bar__inner">
          <div class="filter-bar__search">
            <label for="search-input" class="sr-only">Search resources</label>
            <input
              id="search-input"
              v-model="searchQuery"
              type="search"
              class="input filter-bar__input"
              :placeholder="t('level.searchPlaceholder')"
              :aria-label="t('level.searchPlaceholder')"
              autocomplete="off"
            />
          </div>
          <div class="filter-bar__types" role="group" aria-label="Filter by content type">
            <button
              v-for="type in availableTypes"
              :key="type"
              class="filter-bar__type-btn"
              :class="{ 'filter-bar__type-btn--active': activeTypeFilter === type }"
              :aria-pressed="activeTypeFilter === type"
              @click="activeTypeFilter = type"
            >
              <span v-if="type !== 'all'" aria-hidden="true">{{ TYPE_ICONS[type] }}</span>
              {{ typeLabel(type) }}
            </button>
          </div>
        </div>
        <!-- Day filter pills -->
        <div v-if="hasDays" class="goa-container">
          <div class="filter-bar__days" role="group" aria-label="Filter by day">
            <button
              class="filter-bar__day-btn"
              :class="{ 'filter-bar__day-btn--active': activeDayFilter === 'all' }"
              @click="activeDayFilter = 'all'"
            >{{ t('level.allDays') }}</button>
            <button
              v-for="day in availableDays"
              :key="day.day"
              class="filter-bar__day-btn"
              :class="{ 'filter-bar__day-btn--active': activeDayFilter === String(day.day) }"
              @click="activeDayFilter = String(day.day)"
              :title="day.title"
            >
              {{ t('level.day') }} {{ day.day }}
            </button>
          </div>
        </div>
      </section>

      <!-- Toolbar: results count + view toggle + download -->
      <div class="goa-container toolbar">
        <p
          class="results-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {{ filteredItems.length }} {{ filteredItems.length !== 1 ? t('level.resources') : t('level.resource') }}
          <span v-if="searchQuery.trim()"> {{ t('level.for') }} "{{ searchQuery }}"</span>
          <span v-if="activeTypeFilter !== 'all'"> · {{ typeLabel(activeTypeFilter) }}</span>
        </p>
        <div class="toolbar__actions">
          <div class="view-toggle" role="group" aria-label="View mode">
            <button
              class="view-toggle__btn"
              :class="{ 'view-toggle__btn--active': viewMode === 'cards' }"
              :aria-pressed="viewMode === 'cards'"
              @click="viewMode = 'cards'"
              :title="t('level.cardView')"
            >
              ▦
            </button>
            <button
              class="view-toggle__btn"
              :class="{ 'view-toggle__btn--active': viewMode === 'list' }"
              :aria-pressed="viewMode === 'list'"
              @click="viewMode = 'list'"
              :title="t('level.listView')"
            >
              ☰
            </button>
          </div>
          <button class="btn btn--secondary toolbar__download" @click="downloadCurriculumJSON" :title="t('level.downloadJSON')">
            ⬇ JSON
          </button>
        </div>
      </div>

      <!-- Content -->
      <section class="content-section" aria-label="Learning resources">
        <div class="goa-container" :class="{ 'content-locked': isLocked }">
          <div v-if="filteredItems.length === 0" class="empty-state" role="status">
            <p class="empty-state__icon" aria-hidden="true">🔍</p>
            <p class="empty-state__message">{{ t('level.noResults') }}</p>
            <button
              class="btn btn--secondary"
              @click="searchQuery = ''; activeTypeFilter = 'all'; activeDayFilter = 'all'"
            >
              {{ t('level.clearFilters') }}
            </button>
          </div>

          <!-- ── LIST VIEW ── -->
          <template v-else-if="viewMode === 'list'">
            <template v-if="groupedByDay">
              <div v-for="group in groupedByDay" :key="group.day" class="day-group">
                <h2 class="day-group__heading">
                  <span class="day-group__number">{{ t('level.day') }} {{ group.day }}</span>
                  <span class="day-group__title">{{ tc(group.title).replace(/^Day \d+\s*[-–—]\s*/, '').replace(/^Jour \d+\s*[-–—]\s*/, '') }}</span>
                </h2>
                <table class="content-table">
                  <thead>
                    <tr>
                      <th class="content-table__th--type">{{ t('level.tableType') }}</th>
                      <th>{{ t('level.tableTitle') }}</th>
                      <th class="content-table__th--meta">{{ t('level.tableDuration') }}</th>
                      <th class="content-table__th--meta">{{ t('level.tableDetails') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in group.items"
                      :key="item.id"
                      class="content-table__row"
                      @click="openDetail(item)"
                    >
                      <td>
                        <span class="badge badge--sm" :class="`badge--${item.type}`">
                          {{ TYPE_ICONS[item.type] }} {{ typeLabel(item.type) }}
                        </span>
                      </td>
                      <td class="content-table__title">{{ tc(item.title) }}</td>
                      <td class="content-table__meta">{{ tc(item.duration) || '—' }}</td>
                      <td class="content-table__meta">
                        <span v-if="item.type === 'module' && item.sections">{{ item.sections.length }} {{ t('card.sections') }}</span>
                        <span v-else-if="item.type === 'video'">{{ t('contentTypes.video') }}</span>
                        <span v-else>—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <table v-else class="content-table">
              <thead>
                <tr>
                  <th class="content-table__th--type">{{ t('level.tableType') }}</th>
                  <th>{{ t('level.tableTitle') }}</th>
                  <th class="content-table__th--meta">{{ t('level.tableDuration') }}</th>
                  <th class="content-table__th--meta">{{ t('level.tableDetails') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in filteredItems"
                  :key="item.id"
                  class="content-table__row"
                  @click="openDetail(item)"
                >
                  <td>
                    <span class="badge badge--sm" :class="`badge--${item.type}`">
                      {{ TYPE_ICONS[item.type] }} {{ typeLabel(item.type) }}
                    </span>
                  </td>
                  <td class="content-table__title">{{ tc(item.title) }}</td>
                  <td class="content-table__meta">{{ tc(item.duration) || '—' }}</td>
                  <td class="content-table__meta">
                    <span v-if="item.type === 'module' && item.sections">{{ item.sections.length }} {{ t('card.sections') }}</span>
                    <span v-else-if="item.type === 'video'">{{ t('contentTypes.video') }}</span>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>

          <!-- ── CARD VIEW ── -->
          <template v-else>
            <!-- Grouped by day -->
            <template v-if="groupedByDay">
              <div v-for="group in groupedByDay" :key="group.day" class="day-group">
                <h2 class="day-group__heading">
                  <span class="day-group__number">{{ t('level.day') }} {{ group.day }}</span>
                  <span class="day-group__title">{{ tc(group.title).replace(/^Day \d+\s*[-–—]\s*/, '').replace(/^Jour \d+\s*[-–—]\s*/, '') }}</span>
                </h2>
                <ul class="content-grid" role="list">
                  <li
                    v-for="item in group.items"
                    :key="item.id"
                    class="content-grid__item"
                    role="listitem"
                  >
                    <ContentCard :item="item" @open-detail="openDetail" />
                  </li>
                </ul>
              </div>
            </template>
            <!-- Flat grid -->
            <ul v-else class="content-grid" role="list">
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="content-grid__item"
                role="listitem"
              >
                <ContentCard :item="item" @open-detail="openDetail" />
              </li>
            </ul>
          </template>
        </div>
      </section>

      <!-- Level navigation -->
      <nav class="level-nav" aria-label="Level navigation">
        <div class="goa-container level-nav__inner">
          <RouterLink
            v-if="prevLevel"
            :to="`/level/${prevLevel}`"
            class="btn btn--secondary level-nav__btn"
          >
            {{ t('level.previousLevel') }}
          </RouterLink>
          <span v-else />
          <RouterLink
            v-if="nextLevel"
            :to="`/level/${nextLevel}`"
            class="btn btn--primary level-nav__btn"
          >
            {{ t('level.nextLevel') }}
          </RouterLink>
        </div>
      </nav>
    </main>

    <AppFooter />

    <!-- Detail modal rendered outside main to avoid stacking context issues -->
    <ContentDetailModal
      :item="selectedItem"
      :level-colour="level.colour"
      @close="closeDetail"
    />
  </div>
</template>

<style scoped>
/* Level hero */
.level-hero {
  background: linear-gradient(135deg, color-mix(in srgb, var(--level-colour) 90%, black) 0%, var(--level-colour) 100%);
  color: var(--goa-color-text-light);
  padding: var(--goa-space-2xl) 0;
}

.level-hero__inner {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
}

.level-hero__breadcrumb {
  font-size: var(--goa-font-size-2);
  opacity: 0.8;
}

.level-hero__breadcrumb a {
  color: var(--goa-color-text-light);
  opacity: 0.8;
}

.level-hero__breadcrumb a:hover {
  opacity: 1;
}

.level-hero__content {
  display: flex;
  align-items: flex-start;
  gap: var(--goa-space-l);
}

.level-hero__icon {
  font-size: 3rem;
  line-height: 1;
  flex-shrink: 0;
  margin-top: var(--goa-space-xs);
}

.level-hero__title {
  color: var(--goa-color-text-light);
  margin: var(--goa-space-xs) 0 var(--goa-space-xs) 0;
  font-size: clamp(1.5rem, 4vw, 2.5rem);
}

.level-hero__subtitle {
  font-size: var(--goa-font-size-5);
  opacity: 0.9;
  margin: 0;
  font-weight: var(--goa-font-weight-medium);
}

.level-hero__description {
  font-size: var(--goa-font-size-3);
  opacity: 0.85;
  max-width: 72ch;
  line-height: var(--goa-line-height-3);
  margin: 0;
}

/* Filter bar — sticky just below the site header */
.filter-bar {
  background: var(--goa-color-greyscale-white);
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  padding: var(--goa-space-m) 0;
  position: sticky;
  top: var(--site-header-height, 4.625rem);
  z-index: 90;
}

@media screen and (max-width: 480px) {
  /* Remove sticky on mobile — header height is unpredictable when nav wraps */
  .filter-bar {
    position: static;
  }
}

.filter-bar__inner {
  display: flex;
  align-items: center;
  gap: var(--goa-space-l);
  flex-wrap: wrap;
}

.filter-bar__search {
  flex: 1;
  min-width: 200px;
}

.filter-bar__input {
  max-width: 360px;
}

.filter-bar__types {
  display: flex;
  gap: var(--goa-space-xs);
  flex-wrap: wrap;
}

.filter-bar__type-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--goa-space-2xs);
  padding: var(--goa-space-xs) var(--goa-space-m);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: 999px;
  background: var(--goa-color-greyscale-white);
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-medium);
  color: var(--goa-color-text-secondary);
  cursor: pointer;
  transition: all var(--goa-transition-fast);
}

.filter-bar__type-btn:hover:not(.filter-bar__type-btn--active) {
  border-color: var(--goa-color-interactive-default);
  color: var(--goa-color-interactive-default);
}

.filter-bar__type-btn:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 2px;
}

.filter-bar__type-btn--active {
  background: var(--goa-color-interactive-default);
  border-color: var(--goa-color-interactive-default);
  color: var(--goa-color-text-light);
}

/* Day filter pills */
.filter-bar__days {
  display: flex;
  gap: var(--goa-space-2xs);
  flex-wrap: wrap;
  padding-top: var(--goa-space-s);
}

.filter-bar__day-btn {
  padding: var(--goa-space-2xs) var(--goa-space-s);
  border: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  border-radius: 999px;
  background: var(--goa-color-greyscale-white);
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
  cursor: pointer;
  transition: all var(--goa-transition-fast);
}

.filter-bar__day-btn:hover:not(.filter-bar__day-btn--active) {
  border-color: var(--goa-color-interactive-default);
  color: var(--goa-color-interactive-default);
}

.filter-bar__day-btn--active {
  background: var(--goa-color-interactive-default);
  border-color: var(--goa-color-interactive-default);
  color: var(--goa-color-text-light);
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--goa-space-m);
  gap: var(--goa-space-m);
  flex-wrap: wrap;
}

.results-count {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
  margin: 0;
}

.toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
}

.toolbar__download {
  font-size: var(--goa-font-size-1);
  padding: var(--goa-space-2xs) var(--goa-space-s);
}

/* View toggle */
.view-toggle {
  display: flex;
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-m);
  overflow: hidden;
}

.view-toggle__btn {
  padding: var(--goa-space-2xs) var(--goa-space-s);
  border: none;
  background: var(--goa-color-greyscale-white);
  font-size: var(--goa-font-size-3);
  cursor: pointer;
  color: var(--goa-color-text-secondary);
  transition: all var(--goa-transition-fast);
  line-height: 1;
}

.view-toggle__btn:hover {
  background: var(--goa-color-greyscale-100);
}

.view-toggle__btn--active {
  background: var(--goa-color-interactive-default);
  color: var(--goa-color-text-light);
}

/* List / table view */
.content-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--goa-font-size-2);
}

.content-table thead {
  position: sticky;
  top: 0;
  background: var(--goa-color-greyscale-white);
}

.content-table th {
  text-align: left;
  padding: var(--goa-space-xs) var(--goa-space-s);
  border-bottom: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-secondary);
  font-size: var(--goa-font-size-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.content-table__th--type {
  width: 100px;
}

.content-table__th--meta {
  width: 100px;
}

.content-table__row {
  cursor: pointer;
  transition: background var(--goa-transition-fast);
}

.content-table__row:hover {
  background: var(--goa-color-greyscale-50);
}

.content-table__row td {
  padding: var(--goa-space-s);
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-100);
  vertical-align: middle;
}

.content-table__title {
  font-weight: var(--goa-font-weight-medium);
  color: var(--goa-color-text-default);
}

.content-table__meta {
  color: var(--goa-color-text-secondary);
  font-size: var(--goa-font-size-1);
}

.badge--sm {
  font-size: 0.65rem;
  padding: 1px var(--goa-space-2xs);
}

@media screen and (max-width: 600px) {
  .content-table__th--meta,
  .content-table__meta {
    display: none;
  }
}

/* Content section */
.content-section {
  padding: var(--goa-space-xl) 0 var(--goa-space-3xl) 0;
}

.content-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--goa-space-xl);
}

.content-grid__item {
  display: flex;
}

/* Day grouping */
.day-group {
  margin-bottom: var(--goa-space-2xl);
}

.day-group__heading {
  display: flex;
  align-items: baseline;
  gap: var(--goa-space-s);
  margin: 0 0 var(--goa-space-l);
  padding-bottom: var(--goa-space-s);
  border-bottom: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
}

.day-group__number {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-interactive-default);
  white-space: nowrap;
}

.day-group__title {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-medium);
  color: var(--goa-color-text-secondary);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: var(--goa-space-3xl) var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--goa-space-l);
}

.empty-state__icon {
  font-size: 3rem;
  margin: 0;
}

.empty-state__message {
  color: var(--goa-color-text-secondary);
  max-width: 40ch;
  margin: 0;
}

/* Level navigation */
.level-nav {
  padding: var(--goa-space-xl) 0;
  background: var(--goa-color-greyscale-50);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
}

.level-nav__inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ── Locked level styles ── */
.locked-banner {
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
  background: var(--goa-color-greyscale-100);
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-300);
  padding: var(--goa-space-s) var(--goa-space-xl);
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
}

.locked-banner__icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.content-locked .content-grid__item,
.content-locked .content-table__row {
  opacity: 0.45;
  pointer-events: none;
  cursor: default;
}

.content-locked .content-table__row:hover {
  background: transparent;
}
</style>

<script setup>
import { useI18n } from 'vue-i18n'
import { useContentLocale } from '@/composables/useContentLocale.js'

const { t } = useI18n()
const { tc, tcArray } = useContentLocale()

const props = defineProps({
  item: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['open-detail'])

const TYPE_ICONS = {
  video: '▶',
  article: '📄',
  tool: '🔧',
  download: '⬇',
  social: '🔗',
  link: '↗',
  module: '📋'
}

function getImageFallback(type) {
  const fallbacks = {
    video: 'https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=400&q=70',
    article: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=400&q=70',
    tool: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=70',
    download: 'https://images.unsplash.com/photo-1568992688065-536aad8a12f6?w=400&q=70',
    social: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=70',
    link: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&q=70',
    module: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=70'
  }
  return fallbacks[type] ?? fallbacks.article
}

function getModuleStats(item) {
  if (item.type !== 'module' || !item.sections) return null
  let quizCount = 0
  for (const sec of item.sections) {
    quizCount += sec.content.filter(b => b.type === 'quiz').length
  }
  return { sections: item.sections.length, quizzes: quizCount }
}
</script>

<template>
  <article class="content-card">
    <div class="content-card__image-wrapper" aria-hidden="true">
      <img
        :src="item.imageUrl || getImageFallback(item.type)"
        :alt="''"
        class="content-card__image"
        loading="lazy"
        @error="$event.target.src = getImageFallback(item.type)"
      />
      <div class="content-card__type-overlay">
        <span class="badge" :class="`badge--${item.type}`">
          {{ TYPE_ICONS[item.type] }} {{ t('contentTypes.' + item.type) }}
        </span>
      </div>
      <div v-if="item.type === 'video'" class="content-card__play-overlay" aria-hidden="true">
        <span class="content-card__play-icon">▶</span>
      </div>
      <div v-if="item.type === 'module'" class="content-card__module-overlay" aria-hidden="true">
        <span class="content-card__module-badge">{{ item.sections?.length || 0 }} {{ t('card.sections') }}</span>
      </div>
    </div>

    <div class="content-card__body">
      <h2 class="content-card__title">{{ tc(item.title) }}</h2>
      <p class="content-card__description">{{ tc(item.description) }}</p>
      <div class="content-card__meta">
        <span v-if="item.duration" class="content-card__meta-item">
          <span aria-hidden="true">⏱</span>
          <span>{{ tc(item.duration) }}</span>
        </span>
        <span v-if="item.fileType" class="content-card__meta-item">
          <span aria-hidden="true">📎</span>
          <span>{{ item.fileType }}{{ item.fileSize ? ` · ${item.fileSize}` : '' }}</span>
        </span>
        <span class="content-card__meta-item content-card__source">
          {{ tc(item.source) }}
        </span>
      </div>
      <div class="content-card__tags" aria-label="Tags">
        <span
          v-for="(tag, tagIdx) in tcArray(item.tags).slice(0, 3)"
          :key="tagIdx"
          class="content-card__tag"
        >{{ tag }}</span>
      </div>
    </div>

    <div v-if="item.type === 'module'" class="content-card__module-meta">
      <span v-if="getModuleStats(item)" class="content-card__module-stat">
        {{ getModuleStats(item).sections }} {{ t('card.sections') }}
        <span v-if="getModuleStats(item).quizzes"> · {{ getModuleStats(item).quizzes }} {{ t('card.quizQuestions') }}</span>
      </span>
    </div>

    <div class="content-card__actions">
      <button
        class="btn content-card__detail-btn"
        :class="item.type === 'module' ? 'btn--primary' : 'btn--secondary'"
        :aria-label="item.type === 'module' ? `${t('card.openModule')}: ${tc(item.title)}` : `${t('card.viewDetails')}: ${tc(item.title)}`"
        @click="emit('open-detail', item)"
      >
        {{ item.type === 'module' ? t('card.openModule') : t('card.viewDetails') }}
      </button>
      <a
        v-if="item.type === 'download' && item.downloadUrl"
        :href="item.downloadUrl"
        class="btn btn--primary content-card__action-btn"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`${t('card.download')} ${tc(item.title)}${item.fileType ? ` (${item.fileType})` : ''}`"
      >
        ⬇ {{ t('card.download') }}
      </a>
      <a
        v-else-if="item.type !== 'module' && item.url"
        :href="item.url"
        class="btn btn--primary content-card__action-btn"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="tc(item.title)"
      >
        <span v-if="item.type === 'video'">▶ {{ t('card.watch') }}</span>
        <span v-else-if="item.type === 'tool'">🔧 {{ t('card.openTool') }}</span>
        <span v-else-if="item.type === 'social'">🔗 {{ t('card.viewPost') }}</span>
        <span v-else>{{ t('card.readMore') }}</span>
      </a>
    </div>
  </article>
</template>

<style scoped>
.content-card {
  background: var(--goa-color-greyscale-white);
  border-radius: var(--goa-border-radius-xl);
  box-shadow: var(--goa-shadow-200);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow var(--goa-transition-base), transform var(--goa-transition-base);
  width: 100%;
}

.content-card:hover {
  box-shadow: var(--goa-shadow-400);
  transform: translateY(-2px);
}

.content-card__image-wrapper {
  position: relative;
  height: 180px;
  overflow: hidden;
  background: var(--goa-color-greyscale-100);
}

.content-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--goa-transition-slow);
}

.content-card:hover .content-card__image {
  transform: scale(1.03);
}

.content-card__type-overlay {
  position: absolute;
  top: var(--goa-space-s);
  left: var(--goa-space-s);
}

.content-card__play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  transition: background var(--goa-transition-base);
}

.content-card:hover .content-card__play-overlay {
  background: rgba(0, 0, 0, 0.35);
}

.content-card__play-icon {
  font-size: 2.5rem;
  color: white;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

.content-card__body {
  padding: var(--goa-space-l);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
}

.content-card__title {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
  line-height: var(--goa-line-height-3);
}

.content-card__description {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-3);
  margin: 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.content-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--goa-space-m);
  align-items: center;
}

.content-card__meta-item {
  display: flex;
  align-items: center;
  gap: var(--goa-space-2xs);
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
}

.content-card__source {
  font-style: italic;
}

.content-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--goa-space-2xs);
}

.content-card__tag {
  display: inline-block;
  padding: 2px var(--goa-space-xs);
  background: var(--goa-color-greyscale-100);
  border-radius: 999px;
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
}

.content-card__actions {
  padding: var(--goa-space-m) var(--goa-space-l) var(--goa-space-l);
  display: flex;
  gap: var(--goa-space-s);
  flex-wrap: wrap;
}

.content-card__detail-btn,
.content-card__action-btn {
  font-size: var(--goa-font-size-2);
  padding: var(--goa-space-xs) var(--goa-space-m);
}

.content-card__module-overlay {
  position: absolute;
  bottom: var(--goa-space-s);
  right: var(--goa-space-s);
}

.content-card__module-badge {
  display: inline-block;
  padding: 2px var(--goa-space-xs);
  background: rgba(0, 0, 0, 0.65);
  color: white;
  border-radius: var(--goa-border-radius-m);
  font-size: var(--goa-font-size-1);
  font-weight: var(--goa-font-weight-medium);
}

.content-card__module-meta {
  padding: 0 var(--goa-space-l);
}

.content-card__module-stat {
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
  font-weight: var(--goa-font-weight-medium);
}
</style>

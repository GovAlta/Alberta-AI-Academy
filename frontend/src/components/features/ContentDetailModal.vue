<script setup>
const props = defineProps({
  item: {
    type: Object,
    default: null
  },
  levelColour: {
    type: String,
    default: 'var(--goa-color-brand-default)'
  }
})

const emit = defineEmits(['close'])

import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import { useContentLocale } from '@/composables/useContentLocale.js'
import { useFocusTrap } from '@/composables/useFocusTrap.js'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import AudioPlayer from '@/components/features/AudioPlayer.vue'

const { t } = useI18n()
const { tc, tcArray, isMissing, locale } = useContentLocale()

const TYPE_ICONS = {
  video: '▶',
  article: '📄',
  tool: '🔧',
  download: '⬇',
  social: '🔗',
  link: '↗',
  module: '📋'
}

function getYoutubeEmbedUrl(youtubeId) {
  const sep = youtubeId.includes('?') ? '&' : '?'
  return `https://www.youtube-nocookie.com/embed/${youtubeId}${sep}rel=0&modestbranding=1`
}

function extractYoutubeId(url) {
  if (!url) return null
  let m = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  m = url.match(/[?&]v=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  return null
}

function renderMarkdown(text) {
  if (!text) return ''
  // Replace YouTube links (bare URLs and markdown links) with embedded players
  const processed = text.replace(
    /\[([^\]]*)\]\((https?:\/\/(?:www\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s)"]*)\)|(?<![([])https?:\/\/(?:www\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s)]*/g,
    (match, label, mdUrl, mdId, bareId) => {
      const id = mdId || bareId
      const caption = label && label !== mdUrl ? `<p class="youtube-caption">${label}</p>` : ''
      return `${caption}<div class="youtube-wrapper"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`
    }
  )
  // Wrap <img> tags so we can apply ::after zoom indicator via CSS
  const html = marked.parse(processed, { breaks: true })
    .replace(/<a href="(\/downloads\/[^"]+)"/g, '<a download href="$1"')
    .replace(/<a href="/g, '<a target="_blank" rel="noopener noreferrer" href="')
  return html.replace(/<img([^>]*)>/g, '<span class="img-zoom-wrapper"><img$1></span>')
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (lightboxUrl.value) { lightboxUrl.value = null; return }
    emit('close')
  }
}

// Manage body overflow and focus trap on open/close
watch(() => props.item, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
  if (val) {
    nextTick(() => activateTrap())
  } else {
    deactivateTrap()
  }
})
onUnmounted(() => {
  document.body.style.overflow = ''
  deactivateTrap()
})

// Scroll container ref and focus management
const scrollPanel = ref(null)
const modalOverlay = ref(null)
const lightboxUrl = ref(null)
const quizAnnouncement = ref('') // aria-live announcement for quiz results

// Focus trap — keeps Tab inside the modal
const { activate: activateTrap, deactivate: deactivateTrap } = useFocusTrap(modalOverlay)

function scrollToTop() {
  scrollPanel.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// Module section navigation
const activeSectionIndex = ref(0)
const quizAnswers = ref({})
const quizSubmitted = ref({})
const moduleComplete = ref(false)

watch(() => props.item, () => {
  activeSectionIndex.value = 0
  quizAnswers.value = {}
  quizSubmitted.value = {}
  moduleComplete.value = false
  // Scroll to top when opening a new item
  nextTick(() => scrollPanel.value?.scrollTo({ top: 0 }))
})

watch(activeSectionIndex, () => {
  scrollToTop()
})

const isModule = computed(() => props.item?.type === 'module')
const sections = computed(() => props.item?.sections || [])

// Fake section for article TTS — wraps longDescription as a text block
const articleSection = computed(() => {
  if (isModule.value || !props.item) return null
  const blocks = []
  if (props.item.longDescription) {
    blocks.push({ type: 'text', content: props.item.longDescription })
  }
  if (props.item.description) {
    blocks.push({ type: 'text', content: props.item.description })
  }
  return blocks.length ? { title: props.item.title, content: blocks } : null
})
const activeSection = computed(() => sections.value[activeSectionIndex.value] || null)
const sectionShortId = computed(() => (props.item?.id || '').replace(/^l[m123]-/, ''))
const firstBlockIsHero = computed(() => activeSection.value?.content?.[0]?.type === 'hero')

function selectQuizAnswer(sectionIdx, quizIdx, optionIndex) {
  const key = `${sectionIdx}-${quizIdx}`
  if (quizSubmitted.value[key]) return
  quizAnswers.value[key] = optionIndex
}

function submitQuizAnswer(sectionIdx, quizIdx) {
  const key = `${sectionIdx}-${quizIdx}`
  quizSubmitted.value[key] = true
  // Announce result to screen readers
  const quiz = sections.value[sectionIdx]?.content?.[quizIdx]
  if (quiz) {
    const correct = quizAnswers.value[key] === getCorrectIndex(quiz)
    quizAnnouncement.value = correct
      ? t('modal.correct')
      : `${t('modal.incorrect')} ${tc(quiz.options[getCorrectIndex(quiz)])}`
  }
}

/** Find the index of correctAnswer within the options array */
function getCorrectIndex(quiz) {
  const ca = quiz.correctAnswer
  return quiz.options.findIndex(opt => {
    if (opt === ca) return true
    // Compare multilingual objects by their 'en' value
    if (typeof opt === 'object' && typeof ca === 'object' && opt?.en && ca?.en) return opt.en === ca.en
    return false
  })
}

function isCorrectAnswer(sectionIdx, quizIdx, quiz) {
  const key = `${sectionIdx}-${quizIdx}`
  return quizAnswers.value[key] === getCorrectIndex(quiz)
}

// Quiz scoring helpers
function getQuizBIdxs(sectionIdx) {
  return (sections.value[sectionIdx]?.content || [])
    .map((b, i) => b.type === 'quiz' ? i : -1)
    .filter(i => i !== -1)
}

function isSectionQuizComplete(sectionIdx) {
  const bIdxs = getQuizBIdxs(sectionIdx)
  return bIdxs.length > 0 && bIdxs.every(bIdx => quizSubmitted.value[`${sectionIdx}-${bIdx}`])
}

function sectionScore(sectionIdx) {
  const bIdxs = getQuizBIdxs(sectionIdx)
  const content = sections.value[sectionIdx]?.content || []
  let correct = 0
  bIdxs.forEach(bIdx => {
    if (quizAnswers.value[`${sectionIdx}-${bIdx}`] === getCorrectIndex(content[bIdx])) correct++
  })
  return { correct, total: bIdxs.length }
}

const moduleScore = computed(() => {
  let correct = 0, total = 0
  sections.value.forEach((_, sIdx) => {
    const s = sectionScore(sIdx)
    correct += s.correct
    total += s.total
  })
  return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : 0 }
})

function retakeSection(sectionIdx) {
  const updated = { ...quizAnswers.value }
  const updatedSub = { ...quizSubmitted.value }
  getQuizBIdxs(sectionIdx).forEach(bIdx => {
    delete updated[`${sectionIdx}-${bIdx}`]
    delete updatedSub[`${sectionIdx}-${bIdx}`]
  })
  quizAnswers.value = updated
  quizSubmitted.value = updatedSub
}

function retakeModule() {
  quizAnswers.value = {}
  quizSubmitted.value = {}
  moduleComplete.value = false
  activeSectionIndex.value = 0
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="item"
      ref="modalOverlay"
      class="modal-overlay"
      role="dialog"
      :aria-label="'Details: ' + tc(item.title)"
      aria-modal="true"
      @click.self="emit('close')"
      @keydown="handleKeydown"
    >
      <!-- Always-visible close button -->
      <button
        class="detail-modal__close-fixed"
        :aria-label="t('modal.close')"
        autofocus
        @click="emit('close')"
      >
        ✕
      </button>

      <div ref="scrollPanel" class="modal-panel detail-modal">
        <div class="detail-modal__header" :style="{ '--level-colour': levelColour }">
          <div class="detail-modal__header-meta">
            <span class="badge" :class="`badge--${item.type}`">
              {{ TYPE_ICONS[item.type] }} {{ t('contentTypes.' + item.type) }}
            </span>
            <span class="badge" :class="`badge--${item.difficulty}`">
              {{ item.difficulty }}
            </span>
          </div>
          <LanguageSwitcher variant="light" />
        </div>

        <div class="detail-modal__body" :class="{ 'detail-modal__body--module': isModule, 'detail-modal__body--level2': item?.id?.startsWith('l2-') }">
          <div v-if="locale !== 'en' && isMissing(item.title)" class="translation-banner">
            {{ t('language.missingTranslation', { lang: t('language.' + locale) }) }}
          </div>
          <!-- Screen reader announcements for quiz and module events -->
          <div class="sr-only" aria-live="assertive" aria-atomic="true">{{ quizAnnouncement }}</div>

          <!-- ── Module view ── -->
          <template v-if="isModule">

            <!-- Compact sticky header: title + progress + section dropdown -->
            <div class="module-topbar">
              <div class="module-topbar__title-row">
                <h2 class="module-topbar__title">{{ tc(item.title) }}</h2>
                <span class="module-topbar__progress">{{ activeSectionIndex + 1 }} / {{ sections.length }}</span>
              </div>

              <!-- Progress bar -->
              <div class="module-topbar__track">
                <div
                  class="module-topbar__fill"
                  :style="{ width: ((activeSectionIndex + 1) / sections.length * 100) + '%' }"
                />
              </div>

              <!-- Section picker dropdown -->
              <details v-if="sections.length > 1" class="module-picker">
                <summary class="module-picker__toggle">
                  <span class="module-picker__current">{{ tc(activeSection?.title) }}</span>
                  <span class="module-picker__arrow" aria-hidden="true">&#9662;</span>
                </summary>
                <ol class="module-picker__list">
                  <li
                    v-for="(sec, idx) in sections"
                    :key="idx"
                  >
                    <button
                      class="module-picker__option"
                      :class="{
                        'module-picker__option--active': idx === activeSectionIndex,
                        'module-picker__option--done': idx < activeSectionIndex
                      }"
                      @click="activeSectionIndex = idx; $event.target.closest('details').open = false"
                    >
                      <span class="module-picker__num">{{ idx + 1 }}</span>
                      {{ tc(sec.title) }}
                    </button>
                  </li>
                </ol>
              </details>
            </div>

            <!-- Module completion screen -->
            <div v-if="moduleComplete" class="module-completion" role="alert" aria-live="assertive">
              <div class="module-completion__trophy">🏆</div>
              <h2 class="module-completion__heading">{{ t('modal.moduleComplete') }}</h2>
              <div class="module-completion__pct" :class="moduleScore.pct >= 70 ? 'module-completion__pct--pass' : 'module-completion__pct--fail'">
                {{ moduleScore.pct }}%
              </div>
              <p v-if="moduleScore.total > 0 && moduleScore.pct >= 70" class="module-completion__message module-completion__message--pass">
                {{ t('modal.congratulations') }}
              </p>
              <p v-else-if="moduleScore.total > 0" class="module-completion__message module-completion__message--fail">
                {{ t('modal.keepItUp') }}
              </p>
              <div v-if="moduleScore.total > 0" class="module-completion__stats">
                <div class="module-completion__stat">
                  <span class="module-completion__stat-label">{{ t('modal.correctAnswers') }}</span>
                  <strong class="module-completion__stat-value">{{ moduleScore.correct }}</strong>
                </div>
                <div class="module-completion__stat">
                  <span class="module-completion__stat-label">{{ t('modal.totalQuestions') }}</span>
                  <strong class="module-completion__stat-value">{{ moduleScore.total }}</strong>
                </div>
              </div>
              <div class="module-completion__actions">
                <button class="btn btn--secondary" @click="retakeModule">{{ t('modal.retakeModule') }}</button>
                <button class="btn btn--primary" @click="emit('close')">{{ t('modal.continueLearning') }}</button>
              </div>
            </div>

            <!-- Active section content (scrolls independently) -->
            <div v-else-if="activeSection" class="module-section" :class="{ 'module-section--has-hero': firstBlockIsHero }">

              <!-- Section header (label + title) -->
              <div class="module-section__header">
                <div class="module-section-label">{{ sectionShortId }}</div>
                <h2 class="module-section__title">{{ tc(activeSection.title) }}</h2>
              </div>

              <!-- TTS Audio Player -->
              <AudioPlayer
                :section="activeSection"
                :section-index="activeSectionIndex"
                :total-sections="sections.length"
                :all-sections="sections"
                :item="item"
                @change-section="(idx) => activeSectionIndex = idx"
              />

              <div
                v-for="(block, bIdx) in activeSection.content"
                :key="bIdx"
                class="module-block"
                :class="{ 'module-block--hero': block.type === 'hero' }"
              >
                <!-- Hero block — CSS order:-1 moves it visually before the section header -->
                <div v-if="block.type === 'hero'" class="module-hero">
                  <div class="module-hero__grid"></div>
                  <div class="module-hero__glow"></div>
                  <div class="module-hero__orbs">
                    <div class="module-hero__orb module-hero__orb--1"></div>
                    <div class="module-hero__orb module-hero__orb--2"></div>
                  </div>
                  <div class="module-hero__content">
                    <div class="module-hero__badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      {{ tc(block.badge) }}
                    </div>
                    <h1 class="module-hero__title">
                      {{ tc(block.title) }}<br>
                      <span class="module-hero__highlight">{{ tc(block.titleHighlight) }}</span>
                    </h1>
                    <p class="module-hero__subtitle">{{ tc(block.subtitle) }}</p>
                  </div>
                </div>

                <!-- Text block -->
                <div v-else-if="block.type === 'text'" class="module-block__text" v-html="renderMarkdown(tc(block.content))" />

                <!-- List block -->
                <ul v-else-if="block.type === 'list'" class="module-block__list">
                  <li v-for="(li, liIdx) in tcArray(block.items)" :key="liIdx" v-html="renderMarkdown(li)" />
                </ul>

                <!-- Image block -->
                <figure v-else-if="block.type === 'image' && block.url" class="module-block__figure" role="button" tabindex="0" :aria-label="t('modal.enlargeImage', 'Enlarge image')" @click="lightboxUrl = block.url" @keydown.enter="lightboxUrl = block.url" @keydown.space.prevent="lightboxUrl = block.url">
                  <img :src="block.url" :alt="tc(block.alt) || t('modal.image')" class="module-block__image module-block__image--zoomable" loading="lazy" />
                </figure>

                <!-- Video block -->
                <div v-else-if="block.type === 'video' && block.url" class="module-block__video">
                  <div v-if="extractYoutubeId(block.url)" class="youtube-wrapper">
                    <iframe
                      :src="getYoutubeEmbedUrl(extractYoutubeId(block.url))"
                      title="Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen
                    />
                  </div>
                  <a v-else :href="block.url" target="_blank" rel="noopener noreferrer" class="btn btn--secondary">
                    {{ t('modal.watchVideo') }}
                  </a>
                </div>

                <!-- Highlight (callout) block -->
                <div v-else-if="block.type === 'highlight'" class="module-highlight">
                  <div class="module-highlight__label">{{ tc(block.label) }}</div>
                  <div class="module-highlight__content" v-html="renderMarkdown(tc(block.content))" />
                </div>

                <!-- Cards block -->
                <div v-else-if="block.type === 'cards'" class="module-cards">
                  <div v-for="(card, cIdx) in block.items" :key="cIdx" class="module-card">
                    <div class="module-card__icon">{{ card.icon }}</div>
                    <h3 class="module-card__title">{{ tc(card.title) }}</h3>
                    <div class="module-card__text" v-html="renderMarkdown(tc(card.content))"></div>
                  </div>
                </div>

                <!-- Stat (callout with stat) block -->
                <div v-else-if="block.type === 'stat'" class="module-stat">
                  <h3 class="module-stat__heading">{{ tc(block.heading) }}</h3>
                  <div class="module-stat__content" v-html="renderMarkdown(tc(block.content))" />
                </div>

                <!-- Quiz block -->
                <div v-else-if="block.type === 'quiz'" class="module-quiz">
                  <p :id="`quiz-q-${activeSectionIndex}-${bIdx}`" class="module-quiz__question">{{ tc(block.question) }}</p>
                  <div class="module-quiz__options" role="radiogroup" :aria-labelledby="`quiz-q-${activeSectionIndex}-${bIdx}`">
                    <button
                      v-for="(opt, optIdx) in block.options"
                      :key="optIdx"
                      role="radio"
                      :aria-checked="quizAnswers[`${activeSectionIndex}-${bIdx}`] === optIdx ? 'true' : 'false'"
                      :aria-label="`${t('tts.option', 'Option')} ${String.fromCharCode(65 + optIdx)}: ${tc(opt)}`"
                      class="module-quiz__option"
                      :class="{
                        'module-quiz__option--selected': quizAnswers[`${activeSectionIndex}-${bIdx}`] === optIdx,
                        'module-quiz__option--correct': quizSubmitted[`${activeSectionIndex}-${bIdx}`] && optIdx === getCorrectIndex(block),
                        'module-quiz__option--wrong': quizSubmitted[`${activeSectionIndex}-${bIdx}`] && quizAnswers[`${activeSectionIndex}-${bIdx}`] === optIdx && optIdx !== getCorrectIndex(block)
                      }"
                      :disabled="quizSubmitted[`${activeSectionIndex}-${bIdx}`]"
                      @click="selectQuizAnswer(activeSectionIndex, bIdx, optIdx)"
                    >
                      {{ tc(opt) }}
                    </button>
                  </div>
                  <button
                    v-if="quizAnswers[`${activeSectionIndex}-${bIdx}`] != null && !quizSubmitted[`${activeSectionIndex}-${bIdx}`]"
                    class="btn btn--primary module-quiz__submit"
                    @click="submitQuizAnswer(activeSectionIndex, bIdx)"
                  >
                    {{ t('modal.checkAnswer') }}
                  </button>
                  <div v-if="quizSubmitted[`${activeSectionIndex}-${bIdx}`]" class="module-quiz__result">
                    <p v-if="isCorrectAnswer(activeSectionIndex, bIdx, block)" class="module-quiz__feedback module-quiz__feedback--correct">
                      {{ t('modal.correct') }}
                    </p>
                    <p v-else class="module-quiz__feedback module-quiz__feedback--wrong">
                      {{ t('modal.incorrect') }} {{ tc(block.options[getCorrectIndex(block)]) }}
                    </p>
                    <p v-if="block.explanation" class="module-quiz__explanation">{{ tc(block.explanation) }}</p>
                  </div>
                </div>
              </div>

              <!-- Quiz score panel — shown after all questions in a quiz section are submitted -->
              <div v-if="isSectionQuizComplete(activeSectionIndex)" class="module-quiz-score" role="status" aria-live="polite">
                <div class="module-quiz-score__fraction">
                  {{ sectionScore(activeSectionIndex).correct }} / {{ sectionScore(activeSectionIndex).total }} {{ t('modal.correctLabel') }}
                </div>
                <div v-if="sectionScore(activeSectionIndex).correct / sectionScore(activeSectionIndex).total >= 0.7" class="module-quiz-score__pass">
                  {{ t('modal.goodWork') }}
                </div>
                <div v-else class="module-quiz-score__fail">
                  <span>{{ t('modal.keepPractising') }}</span>
                  <button class="btn btn--secondary module-quiz-score__retake" @click="retakeSection(activeSectionIndex)">{{ t('modal.retakeQuiz') }}</button>
                </div>
              </div>
            </div>

            <!-- Fixed bottom nav: prev / next — hidden on completion screen -->
            <div v-if="!moduleComplete" class="module-footer">
              <button
                v-if="activeSectionIndex > 0"
                class="btn btn--secondary"
                @click="activeSectionIndex--"
              >
                {{ t('modal.previous') }}
              </button>
              <span v-else />
              <button
                v-if="activeSectionIndex < sections.length - 1"
                class="btn btn--primary"
                @click="activeSectionIndex++"
              >
                {{ t('modal.next') }}
              </button>
              <button
                v-else
                class="btn btn--primary"
                @click="moduleComplete = true"
              >
                {{ t('modal.finishModule') }}
              </button>
            </div>
          </template>

          <!-- ── Standard content view ── -->
          <template v-else>
            <div v-if="item.type === 'video' && item.youtubeId" class="youtube-wrapper detail-modal__video">
              <iframe
                :src="getYoutubeEmbedUrl(item.youtubeId)"
                :title="tc(item.title)"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              />
            </div>
            <div v-else-if="item.imageUrl" class="detail-modal__image-wrapper">
              <img :src="item.imageUrl" alt="" class="detail-modal__image" loading="lazy" />
            </div>

            <h2 class="detail-modal__title">{{ tc(item.title) }}</h2>
            <p class="detail-modal__source">{{ tc(item.source) }}</p>

            <!-- TTS Audio Player for articles/tools/videos -->
            <AudioPlayer
              v-if="articleSection"
              :section="articleSection"
              :section-index="0"
              :total-sections="1"
              :item="item"
            />
            <div v-if="item.longDescription" class="detail-modal__description" v-html="renderMarkdown(tc(item.longDescription))" @click="(e) => { if (e.target.tagName === 'IMG') lightboxUrl = e.target.src }" />

            <div class="detail-modal__meta-row">
              <span v-if="item.duration" class="detail-modal__meta-item">
                <span aria-hidden="true">⏱</span> {{ tc(item.duration) }}
              </span>
              <span v-if="item.fileType" class="detail-modal__meta-item">
                <span aria-hidden="true">📎</span>
                {{ item.fileType }}{{ item.fileSize ? ` · ${item.fileSize}` : '' }}
              </span>
            </div>

            <div class="detail-modal__tags" aria-label="Tags">
              <span v-for="(tag, tagIdx) in tcArray(item.tags)" :key="tagIdx" class="detail-modal__tag">{{ tag }}</span>
            </div>

            <div class="detail-modal__actions">
              <a
                v-if="item.type === 'download' && item.downloadUrl"
                :href="item.downloadUrl"
                class="btn btn--primary"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`${t('modal.download')} ${tc(item.title)} (opens in new window)`"
              >
                {{ t('modal.download') }} {{ item.fileType }}
              </a>
              <a
                v-if="item.url"
                :href="item.url"
                class="btn btn--primary"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`${tc(item.title)} (opens in new window)`"
              >
                <span v-if="item.type === 'video'">{{ t('modal.watchOnYoutube') }}</span>
                <span v-else-if="item.type === 'tool'">{{ t('modal.openTool') }}</span>
                <span v-else-if="item.type === 'social'">{{ t('modal.viewPost') }}</span>
                <span v-else>{{ t('modal.readArticle') }}</span>
              </a>
              <button class="btn btn--secondary" @click="emit('close')">{{ t('modal.close') }}</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Lightbox -->
  <Teleport to="body">
    <div v-if="lightboxUrl" class="lightbox" role="dialog" aria-modal="true" :aria-label="t('modal.image', 'Enlarged image')" @click="lightboxUrl = null" @keydown.escape="lightboxUrl = null">
      <img :src="lightboxUrl" class="lightbox__img" :alt="t('modal.image', 'Enlarged image')" @click.stop />
      <button class="lightbox__close" :aria-label="t('modal.close', 'Close image')" autofocus @click="lightboxUrl = null">✕</button>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Modal shell ── */
.detail-modal {
  display: flex;
  flex-direction: column;
}

.detail-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--goa-space-m) var(--goa-space-xl);
  padding-right: 3.5rem; /* Clear the fixed close button */
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  background: color-mix(in srgb, var(--level-colour) 8%, white);
  flex-shrink: 0;
}

.detail-modal__header-meta {
  display: flex;
  gap: var(--goa-space-xs);
  flex-wrap: wrap;
}

/* Fixed close button — always visible top-right */
.detail-modal__close-fixed {
  position: fixed;
  top: var(--goa-space-m);
  right: var(--goa-space-m);
  z-index: 1001;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: var(--goa-color-interactive-default);
  box-shadow: var(--goa-shadow-400);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  cursor: pointer;
  transition: background var(--goa-transition-fast);
  line-height: 1;
}

.detail-modal__close-fixed:hover {
  background: #4f46e5;
  color: white;
}

/* Desktop: nudge close button up and left */
@media (min-width: 768px) {
  .detail-modal__close-fixed {
    top: calc(var(--goa-space-m) - 5px);
    right: calc(var(--goa-space-m) + 10px);
  }
}

.detail-modal__close-fixed:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 2px;
}

/* ── Body: no overflow — .modal-panel is the sole scroll container ── */
.detail-modal__body {
  padding: var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-l);
}

/* Module body: no padding, topbar/footer stick within .modal-panel */
.detail-modal__body--module {
  padding: 0;
  gap: 0;
}

/* ── Standard (non-module) detail fields ── */
.detail-modal__video {
  border-radius: var(--goa-border-radius-xl);
  overflow: hidden;
  max-width: 560px;
  margin: 0 auto;
}

.detail-modal__description :deep(.youtube-wrapper) {
  max-width: 560px;
  margin: 1rem auto;
  border-radius: var(--goa-border-radius-xl);
  overflow: hidden;
}

.detail-modal__image-wrapper {
  border-radius: var(--goa-border-radius-xl);
  overflow: hidden;
  max-width: 560px;
  max-height: 320px;
  margin: 0 auto;
}

.detail-modal__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-modal__title {
  font-size: var(--goa-font-size-7);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
  line-height: var(--goa-line-height-4);
}

.detail-modal__source {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
  font-style: italic;
  margin: 0;
}

.detail-modal__description {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-default);
  line-height: var(--goa-line-height-4);
  margin: 0;
}

.detail-modal__meta-row {
  display: flex;
  gap: var(--goa-space-l);
  flex-wrap: wrap;
}

.detail-modal__meta-item {
  display: flex;
  align-items: center;
  gap: var(--goa-space-2xs);
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
}

.detail-modal__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--goa-space-2xs);
}

.detail-modal__tag {
  display: inline-block;
  padding: 2px var(--goa-space-xs);
  background: var(--goa-color-greyscale-100);
  border-radius: 999px;
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
}

.detail-modal__actions {
  display: flex;
  gap: var(--goa-space-m);
  flex-wrap: wrap;
  padding-top: var(--goa-space-s);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
}

/* ================================================================
   MODULE VIEWER – three-row layout: topbar | section (scrolls) | footer
   ================================================================ */

/* ── Topbar: title, progress, section picker — sticks to top ── */
.module-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: var(--goa-space-m) var(--goa-space-xl) var(--goa-space-s);
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  background: var(--goa-color-greyscale-white);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-xs);
}

.module-topbar__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--goa-space-m);
}

.module-topbar__title {
  font-size: var(--goa-font-size-5);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
  line-height: 1.3;
  /* truncate very long titles to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.module-topbar__progress {
  flex-shrink: 0;
  font-size: var(--goa-font-size-2);
  font-weight: var(--goa-font-weight-medium);
  color: var(--goa-color-text-secondary);
  white-space: nowrap;
}

/* Progress track */
.module-topbar__track {
  height: 4px;
  border-radius: 2px;
  background: var(--goa-color-greyscale-200);
  overflow: hidden;
}

.module-topbar__fill {
  height: 100%;
  border-radius: 2px;
  background: var(--goa-color-interactive-default);
  transition: width 0.3s ease;
}

/* ── Section picker (dropdown) ── */
.module-picker {
  position: relative;
}

.module-picker__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--goa-space-s);
  padding: var(--goa-space-xs) var(--goa-space-s);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-m);
  background: var(--goa-color-greyscale-50);
  cursor: pointer;
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-default);
  list-style: none;          /* hide default marker */
  user-select: none;
}

.module-picker__toggle::-webkit-details-marker { display: none; }

.module-picker__toggle:hover {
  border-color: var(--goa-color-interactive-default);
}

.module-picker__current {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.module-picker__arrow {
  font-size: 0.7em;
  transition: transform 0.2s ease;
}

.module-picker[open] .module-picker__arrow {
  transform: rotate(180deg);
}

.module-picker__list {
  position: absolute;
  z-index: 10;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 260px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: var(--goa-space-2xs);
  background: var(--goa-color-greyscale-white);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-m);
  box-shadow: var(--goa-shadow-400);
}

.module-picker__option {
  display: flex;
  align-items: center;
  gap: var(--goa-space-xs);
  width: 100%;
  padding: var(--goa-space-xs) var(--goa-space-s);
  border: none;
  border-radius: var(--goa-border-radius-s);
  background: transparent;
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-default);
  cursor: pointer;
  text-align: left;
}

.module-picker__option:hover {
  background: var(--goa-color-greyscale-100);
}

.module-picker__option--active {
  background: color-mix(in srgb, var(--goa-color-interactive-default) 12%, white);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-interactive-default);
}

.module-picker__option--done {
  color: var(--goa-color-text-secondary);
}

.module-picker__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--goa-color-greyscale-200);
  font-size: var(--goa-font-size-1);
  font-weight: var(--goa-font-weight-bold);
  flex-shrink: 0;
}

.module-picker__option--active .module-picker__num {
  background: var(--goa-color-interactive-default);
  color: white;
}

.module-picker__option--done .module-picker__num {
  background: var(--goa-color-status-success);
  color: white;
}

/* ── Section content ── */
.module-section {
  padding: var(--goa-space-l) var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-l);
}

.module-section__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.module-section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6366f1;
}

.module-section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--goa-color-greyscale-200);
}

.module-section__title {
  font-size: 26px;
  font-weight: 800;
  color: var(--goa-color-text-default);
  margin: 0;
  line-height: 1.3;
}

.module-block {
  line-height: var(--goa-line-height-4);
}

.module-block__text {
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-default);
}

.module-block__text :deep(p) {
  margin: 0 0 var(--goa-space-s);
}

.module-block__text :deep(strong) {
  font-weight: var(--goa-font-weight-bold);
}

.module-block__list {
  margin: 0;
  padding-left: var(--goa-space-l);
  font-size: var(--goa-font-size-3);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-xs);
}

.module-block__list :deep(p) {
  margin: 0;
}

.module-block__figure {
  margin: 0 auto;
  border-radius: var(--goa-border-radius-l);
  overflow: hidden;
  max-width: 560px;
  position: relative;
  cursor: zoom-in;
}

.module-block__figure::after {
  content: '🔍';
  position: absolute;
  bottom: var(--goa-space-s);
  right: var(--goa-space-s);
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.module-block__figure:hover::after {
  opacity: 1;
}

.module-block__image {
  width: 100%;
  height: auto;
  display: block;
  max-height: 320px;
  object-fit: contain;
}

.module-block__video {
  border-radius: var(--goa-border-radius-l);
  overflow: hidden;
  max-width: 560px;
  margin: 0 auto;
}

/* ── Quiz ── */
.module-quiz {
  background: var(--goa-color-greyscale-50);
  border-radius: var(--goa-border-radius-l);
  padding: var(--goa-space-l);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
}

.module-quiz__question {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
}

.module-quiz__options {
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-xs);
}

.module-quiz__option {
  text-align: left;
  padding: var(--goa-space-s) var(--goa-space-m);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-m);
  background: var(--goa-color-greyscale-white);
  font-size: var(--goa-font-size-3);
  cursor: pointer;
  transition: all var(--goa-transition-fast);
}

.module-quiz__option:hover:not(:disabled) {
  border-color: var(--goa-color-interactive-default);
  background: color-mix(in srgb, var(--goa-color-interactive-default) 5%, white);
}

.module-quiz__option--selected {
  border-color: var(--goa-color-interactive-default);
  background: color-mix(in srgb, var(--goa-color-interactive-default) 10%, white);
  font-weight: var(--goa-font-weight-medium);
}

.module-quiz__option--correct {
  border-color: var(--goa-color-status-success);
  background: color-mix(in srgb, var(--goa-color-status-success) 10%, white);
}

.module-quiz__option--wrong {
  border-color: var(--goa-color-status-emergency);
  background: color-mix(in srgb, var(--goa-color-status-emergency) 10%, white);
}

.module-quiz__option:disabled {
  cursor: default;
  opacity: 0.85;
}

.module-quiz__submit {
  align-self: flex-start;
}

.module-quiz__feedback {
  font-size: var(--goa-font-size-3);
  font-weight: var(--goa-font-weight-bold);
  margin: 0;
}

.module-quiz__feedback--correct {
  color: var(--goa-color-status-success);
}

.module-quiz__feedback--wrong {
  color: var(--goa-color-status-emergency);
}

.module-quiz__explanation {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
  margin: 0;
  font-style: italic;
}

/* ── Quiz score panel ── */
.module-quiz-score {
  background: var(--goa-color-greyscale-50);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-l);
  padding: var(--goa-space-l) var(--goa-space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--goa-space-s);
  text-align: center;
}

.module-quiz-score__fraction {
  font-size: var(--goa-font-size-6);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
}

.module-quiz-score__pass {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-status-success);
}

.module-quiz-score__fail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--goa-space-m);
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-text-secondary);
}

.module-quiz-score__retake {
  align-self: center;
}

/* ── Module completion screen ── */
.module-completion {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--goa-space-m);
  padding: var(--goa-space-2xl) var(--goa-space-xl);
  text-align: center;
  min-height: 320px;
}

.module-completion__trophy {
  font-size: 3rem;
  line-height: 1;
}

.module-completion__heading {
  font-size: var(--goa-font-size-7);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
  margin: 0;
}

.module-completion__pct {
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1;
}

.module-completion__pct--pass {
  color: var(--goa-color-interactive-default);
}

.module-completion__pct--fail {
  color: var(--goa-color-status-warning, #d97706);
}

.module-completion__message {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-medium);
  margin: 0;
}

.module-completion__message--pass {
  color: var(--goa-color-status-success);
}

.module-completion__message--fail {
  color: var(--goa-color-text-secondary);
}

.module-completion__stats {
  display: flex;
  gap: var(--goa-space-2xl);
  padding: var(--goa-space-m) var(--goa-space-2xl);
  background: var(--goa-color-greyscale-50);
  border-radius: var(--goa-border-radius-l);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-200);
}

.module-completion__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--goa-space-2xs);
}

.module-completion__stat-label {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-text-secondary);
}

.module-completion__stat-value {
  font-size: var(--goa-font-size-6);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-default);
}

.module-completion__actions {
  display: flex;
  gap: var(--goa-space-m);
  flex-wrap: wrap;
  justify-content: center;
  padding-top: var(--goa-space-s);
}

/* ── Footer: prev / next buttons — sticks to bottom ── */
.module-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--goa-space-m) var(--goa-space-xl);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  background: var(--goa-color-greyscale-white);
}

.module-block__image--zoomable {
  cursor: zoom-in;
}

.detail-modal__description :deep(.img-zoom-wrapper) {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 560px;
  margin: 0 auto;
  cursor: zoom-in;
}

.detail-modal__description :deep(.img-zoom-wrapper::after) {
  content: '🔍';
  position: absolute;
  bottom: var(--goa-space-s);
  right: var(--goa-space-s);
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.detail-modal__description :deep(.img-zoom-wrapper:hover::after) {
  opacity: 1;
}

.detail-modal__description :deep(img) {
  cursor: zoom-in;
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
  display: block;
  border-radius: var(--goa-border-radius-m);
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--goa-space-xl);
}

.lightbox__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--goa-border-radius-xl);
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

.lightbox__close {
  position: absolute;
  top: var(--goa-space-m);
  right: var(--goa-space-m);
  background: rgba(255,255,255,0.15);
  border: none;
  color: white;
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox__close:hover {
  background: rgba(255,255,255,0.3);
}

/* ── Hero block ────────────────────────────────────────────────────────── */

.module-section--has-hero {
  padding-top: 0;
}

.module-block--hero {
  /* break out of section padding and visually appear before the header */
  order: -1;
  margin-left: calc(-1 * var(--goa-space-xl));
  margin-right: calc(-1 * var(--goa-space-xl));
  width: calc(100% + 2 * var(--goa-space-xl));
}

.module-hero {
  position: relative;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.module-hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99,102,241,0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,102,241,0.12) 1px, transparent 1px);
  background-size: 40px 40px;
}

.module-hero__glow {
  position: absolute;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.module-hero__orbs {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.module-hero__orb {
  position: absolute;
  border-radius: 50%;
}

.module-hero__orb--1 {
  width: 150px;
  height: 150px;
  top: -30px;
  right: 60px;
  background: radial-gradient(circle, rgba(129,140,248,0.3), transparent 70%);
}

.module-hero__orb--2 {
  width: 90px;
  height: 90px;
  bottom: 20px;
  left: 50px;
  background: radial-gradient(circle, rgba(192,132,252,0.25), transparent 70%);
}

.module-hero__content {
  position: relative;
  text-align: center;
  padding: 44px 32px;
  z-index: 1;
}

.module-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(99,102,241,0.2);
  border: 1px solid rgba(99,102,241,0.4);
  color: #a5b4fc;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 14px;
  border-radius: 99px;
  margin-bottom: 16px;
}

.module-hero__badge svg {
  width: 12px;
  height: 12px;
}

.module-hero__title {
  font-size: clamp(22px, 4vw, 38px);
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
  margin: 0 0 12px;
}

.module-hero__highlight {
  background: linear-gradient(90deg, #818cf8, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.module-hero__subtitle {
  color: #94a3b8;
  font-size: 14px;
  max-width: 400px;
  margin: 0 auto;
  line-height: 1.7;
}

/* ── Highlight (callout) block ─────────────────────────────────────────── */

.module-highlight {
  background: linear-gradient(135deg, #eef2ff, #faf5ff);
  border-left: 4px solid #6366f1;
  border-radius: 12px;
  padding: 20px 24px;
}

.module-highlight__label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6366f1;
  margin-bottom: 10px;
}

.module-highlight__content {
  font-size: 17px;
  line-height: 1.75;
  color: #374151;
}

.module-highlight__content :deep(p) { margin: 0; }
.module-highlight__content :deep(strong) { color: #1a1a2e; }

/* ── Cards block ───────────────────────────────────────────────────────── */

.module-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.module-card {
  background: var(--goa-color-greyscale-white);
  border-radius: 12px;
  padding: 18px;
  border: 1px solid var(--goa-color-greyscale-200);
  transition: transform 0.2s, box-shadow 0.2s;
}

.module-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99,102,241,0.1);
}

.module-card__icon {
  font-size: 26px;
  margin-bottom: 10px;
  font-weight: 700;
  color: #6366f1;
}

.module-card__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--goa-color-text-default);
  margin: 0 0 6px;
}

.module-card__text {
  font-size: 15px;
  color: var(--goa-color-text-secondary);
  line-height: 1.55;
  margin: 0;
}

/* ── Stat block ────────────────────────────────────────────────────────── */

.module-stat {
  background: var(--goa-color-greyscale-white);
  border-radius: 12px;
  padding: 22px 26px;
  border: 1px solid var(--goa-color-greyscale-200);
}

.module-stat__heading {
  font-size: 15px;
  font-weight: 700;
  color: var(--goa-color-text-default);
  margin: 0 0 8px;
}

.module-stat__content {
  font-size: 14px;
  color: var(--goa-color-text-secondary);
  line-height: 1.75;
}

.module-stat__content :deep(p) { margin: 0; }
.module-stat__content :deep(strong) { color: var(--goa-color-text-default); font-weight: 700; }

/* ── Markdown table (inside text blocks) ────────────────────────────────── */
.module-block__text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  margin: 0;
  display: block;
  overflow-x: auto;
}
.module-block__text :deep(th),
.module-block__text :deep(td) {
  padding: 10px 14px;
  border: 1px solid var(--goa-color-greyscale-200);
  line-height: 1.45;
  vertical-align: top;
  text-align: left;
}
.module-block__text :deep(th) {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--goa-color-greyscale-100);
  color: var(--goa-color-text-default);
  white-space: nowrap;
}
.module-block__text :deep(td:first-child) {
  font-weight: 600;
  color: var(--goa-color-text-default);
  white-space: nowrap;
}
.module-block__text :deep(tbody tr:hover) { background: #f8f9fa; }

/* Card text markdown */
.module-card__text :deep(p) { margin: 0 0 4px; }
.module-card__text :deep(p:last-child) { margin: 0; }
.module-card__text :deep(strong) { color: var(--goa-color-text-default); }

.translation-banner {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--goa-border-radius-m);
  padding: var(--goa-space-s) var(--goa-space-m);
  font-size: var(--goa-font-size-2);
  color: #92400e;
  margin: var(--goa-space-m) var(--goa-space-xl);
}

/* ── Orange theme — Level 2 modules (l2- prefix) ───────────────────────── */

.detail-modal__body--level2 .module-topbar__fill {
  background: #f97316;
}

.detail-modal__body--level2 .module-section-label {
  color: #ea580c;
}

.detail-modal__body--level2 .module-hero {
  background: linear-gradient(135deg, #1c0800, #3d1500, #5c2400);
}

.detail-modal__body--level2 .module-hero__grid {
  background-image:
    linear-gradient(rgba(249,115,22,0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(249,115,22,0.12) 1px, transparent 1px);
  background-size: 40px 40px;
}

.detail-modal__body--level2 .module-hero__glow {
  background: radial-gradient(circle, rgba(249,115,22,0.38) 0%, transparent 70%);
}

.detail-modal__body--level2 .module-hero__orb--1 {
  background: radial-gradient(circle, rgba(251,146,60,0.32), transparent 70%);
}

.detail-modal__body--level2 .module-hero__orb--2 {
  background: radial-gradient(circle, rgba(251,191,36,0.28), transparent 70%);
}

.detail-modal__body--level2 .module-hero__badge {
  background: rgba(249,115,22,0.18);
  border-color: rgba(249,115,22,0.42);
  color: #fdba74;
}

.detail-modal__body--level2 .module-hero__highlight {
  background: linear-gradient(90deg, #fb923c, #fbbf24);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.detail-modal__body--level2 .module-highlight {
  background: linear-gradient(135deg, #fff7ed, #fffbeb);
  border-left-color: #f97316;
}

.detail-modal__body--level2 .module-highlight__label {
  color: #ea580c;
}

.detail-modal__body--level2 .module-card:hover {
  box-shadow: 0 6px 20px rgba(249,115,22,0.12);
}

.detail-modal__body--level2 .module-card__icon {
  color: #f97316;
}
.detail-modal__body--level2 .module-block__text :deep(th) {
  background: #fff7ed;
  color: #9a3412;
}
.detail-modal__body--level2 .module-block__text :deep(td:first-child) {
  color: #ea580c;
}
</style>

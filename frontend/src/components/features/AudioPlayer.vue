<script setup>
/**
 * AudioPlayer — WCAG 2.1 AA compliant TTS audio player for module sections.
 *
 * JAWS-compatible keyboard controls:
 *   Space/Enter  — play / pause
 *   Left Arrow   — rewind 5s
 *   Right Arrow  — forward 5s
 *   Shift+Left   — rewind 30s
 *   Shift+Right  — forward 30s
 *   R            — replay from start
 *   Up Arrow     — increase speed
 *   Down Arrow   — decrease speed
 *   Home         — go to start
 *   End          — go to end
 *
 * All state changes are announced via aria-live region.
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTTS, extractSectionText, getPreGeneratedAudio } from '@/composables/useTTS.js'
import { useContentLocale } from '@/composables/useContentLocale.js'

const props = defineProps({
  section: { type: Object, default: null },
  sectionIndex: { type: Number, default: 0 },
  totalSections: { type: Number, default: 1 },
  allSections: { type: Array, default: () => [] },
  /** The full content item — used for Play All metadata (id, title, day, level) */
  item: { type: Object, default: null }
})

const emit = defineEmits(['change-section'])

const { t, locale } = useI18n()
const { tc } = useContentLocale()

const tts = useTTS()
const playerEl = ref(null)
const autoAdvance = ref(false)
const hasAudio = ref(false) // Whether pre-generated audio exists for current section

// Check manifest for current section's audio availability
function checkAudioAvailable() {
  const itemId = props.item?.id || null
  if (!itemId) { hasAudio.value = false; return }
  const sectionIdx = props.item?.type === 'module' ? props.sectionIndex : null
  const url = getPreGeneratedAudio(itemId, locale.value, sectionIdx)
  console.log('[AudioPlayer] check:', itemId, locale.value, sectionIdx, '→', url)
  hasAudio.value = !!url
}

// Re-check when section, item, or locale changes — immediate so it runs on mount
watch(
  [() => props.item, () => props.sectionIndex, locale],
  checkAudioAvailable,
  { immediate: true, deep: false }
)

// Track which section was playing when audio started (for sync logic)
let _playingSectionIdx = -1
let _playAllActive = false
let _playAllCancelled = false

// Format time as m:ss
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const progressPercent = computed(() => {
  if (!tts.duration.value || tts.duration.value === 0) return 0
  return (tts.currentTime.value / tts.duration.value) * 100
})

const progressLabel = computed(() => {
  return `${formatTime(tts.currentTime.value)} of ${formatTime(tts.duration.value)}`
})

// Play the current section — pre-generated file first, then on-demand fallback
function speakSection() {
  const itemId = props.item?.id || null
  const sectionIdx = props.item?.type === 'module' ? props.sectionIndex : null
  const fallbackText = extractSectionText(props.section, tc)

  if (!fallbackText && !itemId) {
    tts.error.value = 'No text content in this section'
    return
  }

  _playingSectionIdx = props.sectionIndex
  tts.smartPlay(itemId, locale.value, sectionIdx, fallbackText)
}

function handlePlayPause() {
  if (tts.isPlaying.value) {
    // Any user-initiated pause/stop kills Play All and Auto Advance chain
    if (_playAllActive) {
      _playAllCancelled = true
      _playAllActive = false
      tts.isPlayingAll.value = false
    }
    tts.pause()
  } else if (tts.isPaused.value) {
    tts.resume()
  } else {
    speakSection()
  }
}

function handleStop() {
  // Any user-initiated stop kills everything
  if (_playAllActive) {
    _playAllCancelled = true
    _playAllActive = false
    tts.isPlayingAll.value = false
  }
  tts.stop()
}

// ── Auto Advance logic ──
// Watch endedCount — only increments when audio reaches its NATURAL end.
// User pause/stop does NOT trigger this. This is the key distinction.
watch(() => tts.endedCount.value, () => {
  if (_playAllActive) return // Play All handles its own sequencing
  if (!autoAdvance.value) return
  if (_playingSectionIdx !== props.sectionIndex) return // User navigated away

  const nextIdx = props.sectionIndex + 1
  if (nextIdx < props.totalSections) {
    emit('change-section', nextIdx)
    // Wait for section to change, then auto-play
    setTimeout(() => speakSection(), 300)
  }
})

// ── Play All — sequential playlist using pre-generated files ──
async function handlePlayAll() {
  if (_playAllActive) {
    _playAllCancelled = true
    _playAllActive = false
    tts.stop()
    tts.isPlayingAll.value = false
    return
  }

  _playAllActive = true
  _playAllCancelled = false
  tts.isPlayingAll.value = true
  tts.playAllTotalSections.value = props.allSections.length

  const itemId = props.item?.id || null
  const startFrom = props.sectionIndex || 0

  for (let i = startFrom; i < props.allSections.length; i++) {
    if (_playAllCancelled) break

    tts.playAllSectionIndex.value = i
    emit('change-section', i)
    _playingSectionIdx = i

    // Try pre-generated file, fall back to on-demand
    const fallbackText = extractSectionText(props.allSections[i], tc)
    await tts.smartPlay(itemId, locale.value, i, fallbackText)

    // Wait for this section's audio to finish
    if (tts.isPlaying.value || tts.isLoading.value) {
      await _waitForAudioEnd()
    }

    if (_playAllCancelled) break

    // Brief pause between sections
    if (i < props.allSections.length - 1) {
      await new Promise(r => setTimeout(r, 1200))
    }
  }

  _playAllActive = false
  tts.isPlayingAll.value = false
  if (!_playAllCancelled) {
    tts.statusMessage.value = 'Module playback complete'
  }
}

/** Returns a promise that resolves when audio reaches its natural end or is cancelled.
 *  Does NOT resolve on user pause — only on ended event or cancellation. */
function _waitForAudioEnd() {
  return new Promise(resolve => {
    const startCount = tts.endedCount.value
    const check = setInterval(() => {
      // Cancelled by user (pause, stop, or Stop Entire Module)
      if (_playAllCancelled) {
        clearInterval(check)
        resolve()
        return
      }
      // Audio reached its natural end (endedCount incremented)
      if (tts.endedCount.value > startCount) {
        clearInterval(check)
        resolve()
      }
    }, 200)
  })
}

// Progress bar click/drag
function handleProgressClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  const time = pct * (tts.duration.value || 0)
  tts.seekTo(time)
}

// Keyboard handler — scoped to the player region
function handleKeydown(e) {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return

  switch (e.key) {
    case ' ':
    case 'Enter':
      e.preventDefault()
      handlePlayPause()
      break
    case 'ArrowLeft':
      e.preventDefault()
      tts.seekBackward(e.shiftKey ? 30 : 5)
      break
    case 'ArrowRight':
      e.preventDefault()
      tts.seekForward(e.shiftKey ? 30 : 5)
      break
    case 'ArrowUp':
      e.preventDefault()
      tts.increaseSpeed()
      break
    case 'ArrowDown':
      e.preventDefault()
      tts.decreaseSpeed()
      break
    case 'r':
    case 'R':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        tts.replay()
      }
      break
    case 'Home':
      e.preventDefault()
      tts.seekTo(0)
      break
    case 'End':
      e.preventDefault()
      if (tts.duration.value) tts.seekTo(tts.duration.value)
      break
  }
}

// When user manually navigates sections: stop audio unless Play All is driving
watch(() => props.sectionIndex, () => {
  if (!_playAllActive) tts.stop()
})

// When language changes: if audio is playing or paused, restart in the new language
watch(locale, () => {
  const wasPlaying = tts.isPlaying.value
  const wasPaused = tts.isPaused.value
  tts.stop()
  if (wasPlaying || wasPaused) {
    // Small delay to let locale propagate to tc() resolver
    setTimeout(() => speakSection(), 200)
  }
})
</script>

<template>
  <div
    v-if="hasAudio"
    ref="playerEl"
    class="audio-player"
    role="region"
    :aria-label="t('tts.playerLabel', 'Audio player — Listen to this section')"
    aria-roledescription="audio player"
    @keydown="handleKeydown"
  >
    <!-- Screen reader announcements -->
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ tts.statusMessage.value }}
    </div>

    <!-- Screen reader instructions — read once on first focus -->
    <div class="sr-only" id="audio-player-instructions">
      Audio player controls. Use Space or Enter to play and pause.
      Left and Right arrows to seek 5 seconds. Shift plus arrows for 30 seconds.
      R to replay. Up and Down arrows to change speed. Tab to move between controls.
    </div>

    <!-- Header label -->
    <div class="audio-player__header">
      <span class="audio-player__label" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        {{ t('tts.listenLabel', 'Listen') }}
      </span>
    </div>

    <!-- Controls row -->
    <div class="audio-player__controls" role="toolbar" :aria-label="t('tts.controls', 'Audio playback controls')" aria-describedby="audio-player-instructions">
      <!-- Replay -->
      <button
        class="audio-player__btn audio-player__btn--secondary"
        :aria-label="t('tts.replay', 'Replay from start')"
        :disabled="!tts.isPlaying.value && !tts.isPaused.value"
        @click="tts.replay()"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      </button>

      <!-- Back 5s -->
      <button
        class="audio-player__btn audio-player__btn--secondary"
        :aria-label="t('tts.back5', 'Back 5 seconds')"
        :disabled="!tts.isPlaying.value && !tts.isPaused.value"
        @click="tts.seekBackward(5)"
      >
        <span aria-hidden="true" class="audio-player__skip-label">-5s</span>
      </button>

      <!-- Play / Pause (primary) -->
      <button
        class="audio-player__btn audio-player__btn--primary"
        :aria-label="tts.isPlaying.value ? t('tts.pause', 'Pause audio') : tts.isPaused.value ? t('tts.resume', 'Resume audio') : t('tts.play', 'Play section audio')"
        :aria-pressed="tts.isPlaying.value ? 'true' : 'false'"
        :disabled="tts.isLoading.value"
        @click="handlePlayPause"
      >
        <!-- Loading spinner -->
        <svg v-if="tts.isLoading.value" class="audio-player__spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke-dasharray="62" stroke-dashoffset="20"/>
        </svg>
        <!-- Pause icon -->
        <svg v-else-if="tts.isPlaying.value" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
        <!-- Play icon -->
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>

      <!-- Forward 5s -->
      <button
        class="audio-player__btn audio-player__btn--secondary"
        :aria-label="t('tts.forward5', 'Forward 5 seconds')"
        :disabled="!tts.isPlaying.value && !tts.isPaused.value"
        @click="tts.seekForward(5)"
      >
        <span aria-hidden="true" class="audio-player__skip-label">+5s</span>
      </button>

      <!-- Stop -->
      <button
        class="audio-player__btn audio-player__btn--secondary"
        :aria-label="t('tts.stop', 'Stop')"
        :disabled="!tts.isPlaying.value && !tts.isPaused.value"
        @click="handleStop"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
      </button>

      <!-- Speed -->
      <button
        class="audio-player__btn audio-player__btn--speed"
        :aria-label="`Playback speed: ${tts.speed.value}x. Press to cycle: 0.75, 1, 1.25, 1.5, 2`"
        aria-roledescription="speed selector"
        @click="tts.cycleSpeed()"
      >
        {{ tts.speed.value }}x
      </button>
    </div>

    <!-- Play All Module button -->
    <div v-if="allSections.length > 1" class="audio-player__play-all-row">
      <button
        class="audio-player__play-all-btn"
        :aria-label="tts.isPlayingAll.value ? t('tts.stopAll', 'Stop full module playback') : t('tts.playAll', 'Play entire module with narrated answers')"
        @click="handlePlayAll"
      >
        <svg v-if="tts.isPlayingAll.value" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        {{ tts.isPlayingAll.value ? t('tts.stopAll', 'Stop Full Module') : t('tts.playAll', 'Play Entire Module') }}
      </button>
      <span v-if="tts.isPlayingAll.value" class="audio-player__play-all-progress" role="status" aria-live="polite">
        Section {{ tts.playAllSectionIndex.value + 1 }} of {{ tts.playAllTotalSections.value }}
      </span>
    </div>

    <!-- Auto Advance toggle -->
    <div v-if="allSections.length > 1" class="audio-player__auto-advance">
      <label class="audio-player__checkbox-label">
        <input
          type="checkbox"
          v-model="autoAdvance"
          class="audio-player__checkbox"
          aria-describedby="auto-advance-desc"
        />
        {{ t('tts.autoAdvance', 'Auto Advance') }}
      </label>
      <span id="auto-advance-desc" class="audio-player__auto-advance-hint">
        When checked, automatically advances to the next section and plays it when the current section finishes
      </span>
    </div>

    <!-- Progress bar -->
    <div class="audio-player__progress-row">
      <span class="audio-player__time" aria-hidden="true">{{ formatTime(tts.currentTime.value) }}</span>
      <div
        class="audio-player__track"
        role="slider"
        :aria-label="t('tts.progress', 'Audio progress')"
        :aria-valuenow="Math.round(tts.currentTime.value)"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(tts.duration.value)"
        :aria-valuetext="progressLabel"
        tabindex="0"
        @click="handleProgressClick"
        @keydown.left.prevent="tts.seekBackward(5)"
        @keydown.right.prevent="tts.seekForward(5)"
      >
        <div class="audio-player__fill" :style="{ width: progressPercent + '%' }"/>
        <div class="audio-player__thumb" :style="{ left: progressPercent + '%' }" />
      </div>
      <span class="audio-player__time" aria-hidden="true">{{ formatTime(tts.duration.value) }}</span>
    </div>

    <!-- Buffering / streaming indicator -->
    <div v-if="tts.isLoading.value || tts.isBuffering.value" class="audio-player__status" role="status" aria-live="polite">
      <svg class="audio-player__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke-dasharray="62" stroke-dashoffset="20"/>
      </svg>
      {{ tts.isLoading.value ? t('tts.loading', 'Generating audio...') : t('tts.buffering', 'Buffering...') }}
    </div>

    <!-- Download button — appears once audio is fully loaded -->
    <div v-if="tts.isFullyLoaded.value && tts.downloadUrl.value" class="audio-player__download-row">
      <a
        :href="tts.downloadUrl.value"
        download="academy-audio.mp3"
        class="audio-player__download-btn"
        :aria-label="t('tts.download', 'Download audio as MP3')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {{ t('tts.downloadMp3', 'Download MP3') }}
      </a>
    </div>

    <!-- Error message -->
    <div v-if="tts.error.value" class="audio-player__error" role="alert">
      {{ tts.error.value }}
    </div>

    <!-- Keyboard hints (visible on focus within) -->
    <div class="audio-player__hints" aria-hidden="true">
      Space: play/pause &middot; Arrows: seek &middot; R: replay &middot; Up/Down: speed
    </div>
  </div>
</template>

<style scoped>
.audio-player {
  background: linear-gradient(135deg, #f0f4ff, #f5f3ff);
  border: 1px solid #e0e7ff;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.audio-player:focus-within {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 2px;
}

/* Header row */
.audio-player__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.audio-player__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6366f1;
}

/* Controls toolbar */
.audio-player__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.audio-player__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
}

.audio-player__btn:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 2px;
}

.audio-player__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.audio-player__btn--primary {
  width: 44px;
  height: 44px;
  background: #6366f1;
  color: white;
}

.audio-player__btn--primary:hover:not(:disabled) {
  background: #4f46e5;
  transform: scale(1.05);
}

.audio-player__btn--secondary {
  width: 36px;
  height: 36px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.audio-player__btn--secondary:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.2);
}

.audio-player__btn--speed {
  width: auto;
  min-width: 44px;
  height: 32px;
  padding: 0 10px;
  border-radius: 16px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  font-size: 12px;
  font-weight: 700;
}

.audio-player__btn--speed:hover {
  background: rgba(99, 102, 241, 0.2);
}

.audio-player__skip-label {
  font-size: 11px;
  font-weight: 700;
}

.audio-player__spinner {
  animation: tts-spin 1s linear infinite;
}

@keyframes tts-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Progress bar */
.audio-player__progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audio-player__time {
  font-size: 11px;
  font-weight: 600;
  color: #6366f1;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: center;
}

.audio-player__track {
  flex: 1;
  height: 6px;
  background: #c7d2fe;
  border-radius: 3px;
  position: relative;
  cursor: pointer;
}

.audio-player__track:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 3px;
}

.audio-player__fill {
  height: 100%;
  background: #6366f1;
  border-radius: 3px;
  transition: width 0.1s linear;
}

.audio-player__thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  background: #6366f1;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: left 0.1s linear;
}

/* Error */
.audio-player__error {
  font-size: 12px;
  color: var(--goa-color-interactive-error, #dc2626);
  padding: 4px 8px;
  background: #fef2f2;
  border-radius: 6px;
}

/* Keyboard hints — only show on focus-within */
.audio-player__hints {
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.audio-player:focus-within .audio-player__hints {
  opacity: 1;
}

/* Status indicator */
.audio-player__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #6366f1;
  font-weight: 600;
}

/* Download */
.audio-player__download-row {
  display: flex;
  justify-content: center;
}

.audio-player__download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid #c7d2fe;
  border-radius: 20px;
  background: white;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}

.audio-player__download-btn:hover {
  background: #eef2ff;
}

.audio-player__download-btn:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 2px;
}

/* Auto Advance */
.audio-player__auto-advance {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.audio-player__checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #4338ca;
  cursor: pointer;
  user-select: none;
}

.audio-player__checkbox {
  width: 16px;
  height: 16px;
  accent-color: #6366f1;
  cursor: pointer;
}

.audio-player__checkbox:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 2px;
}

.audio-player__auto-advance-hint {
  font-size: 10px;
  color: #94a3b8;
}

/* Play All Module */
.audio-player__play-all-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}

.audio-player__play-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #c7d2fe;
  border-radius: 20px;
  background: white;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.audio-player__play-all-btn:hover {
  background: #eef2ff;
  border-color: #818cf8;
}

.audio-player__play-all-btn:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus, #6366f1);
  outline-offset: 2px;
}

.audio-player__play-all-progress {
  font-size: 11px;
  color: #6366f1;
  font-weight: 600;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .audio-player__spinner { animation: none; }
  .audio-player__fill,
  .audio-player__thumb { transition: none; }
}
</style>

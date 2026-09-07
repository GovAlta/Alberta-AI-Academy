/**
 * useTTS — Text-to-speech composable.
 *
 * Priority: pre-generated MP3 files (from audio manifest) → on-demand ElevenLabs streaming.
 * Pre-generated files are created by `npm run generate-audio` and give instant playback.
 * On-demand streaming is the fallback for content not yet in the manifest.
 *
 * Keyboard shortcuts (handled by AudioPlayer.vue):
 *   Space      — play / pause
 *   Left       — rewind 5s
 *   Right      — forward 5s
 *   Shift+Left — rewind 30s
 *   Shift+Right— forward 30s
 *   R          — replay from start
 *   Up         — increase speed
 *   Down       — decrease speed
 *   Home       — go to start
 *   End        — go to end
 */
import { ref, shallowRef, onUnmounted } from 'vue'
import audioManifest from '@/data/audio-manifest.json'
import { assetUrl } from '@/utils/assetUrl.js'

// ── Audio Manifest (imported statically, same as level JSON files) ──

/**
 * Look up a pre-generated audio file in the manifest.
 * @param {string} itemId — e.g. "l1-1.1.1"
 * @param {string} locale — "en" or "fr"
 * @param {number|null} sectionIndex — section index for modules, null for articles
 * @returns {string|null} — URL path to MP3 or null
 */
export function getPreGeneratedAudio(itemId, locale, sectionIndex = null) {
  const entry = audioManifest.files?.[itemId]
  if (!entry) {
    console.log('[TTS] No manifest entry for', itemId, '| manifest has', Object.keys(audioManifest.files || {}).length, 'items')
    return null
  }

  if (sectionIndex !== null && entry.type === 'module') {
    const url = assetUrl(entry.sections?.[sectionIndex]?.[locale]?.file) || null
    if (!url) console.log('[TTS] No section audio:', itemId, 'section', sectionIndex, locale, '| sections:', Object.keys(entry.sections || {}))
    return url
  }
  return assetUrl(entry[locale]?.file) || null
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam — male American

export function useTTS() {
  // ── State ──
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const isLoading = ref(false)
  const isBuffering = ref(false)
  const error = ref('')
  const currentTime = ref(0)
  const duration = ref(0)
  const speed = ref(1)
  const speedIndex = ref(1) // index into SPEED_OPTIONS
  const voices = shallowRef([])
  const selectedVoiceId = ref(DEFAULT_VOICE_ID)
  const voicesLoaded = ref(false)
  const statusMessage = ref('') // for screen reader announcements

  // ── Internal ──
  let _audio = null
  let _abortController = null
  let _currentBlobUrl = null
  let _downloadBlobUrl = null

  // Download URL — exposed so AudioPlayer can offer a download button
  const downloadUrl = ref(null)
  const isFullyLoaded = ref(false)

  // Increments ONLY when audio reaches its natural end (not pause/stop)
  const endedCount = ref(0)

  function _createAudio() {
    if (_audio) return _audio
    _audio = new Audio()
    _audio.addEventListener('ended', _onEnded)
    // duration updates — MediaSource initially reports Infinity, so we poll
    _audio.addEventListener('durationchange', () => {
      const d = _audio.duration
      if (d && isFinite(d)) duration.value = d
    })
    _audio.addEventListener('loadedmetadata', () => {
      const d = _audio.duration
      if (d && isFinite(d)) duration.value = d
    })
    _audio.addEventListener('timeupdate', () => {
      currentTime.value = _audio.currentTime
      // Also re-check duration in case MediaSource has updated it
      const d = _audio.duration
      if (d && isFinite(d) && d !== duration.value) duration.value = d
    })
    _audio.addEventListener('waiting', () => { isBuffering.value = true })
    _audio.addEventListener('playing', () => {
      isBuffering.value = false
      isPlaying.value = true
      isPaused.value = false
    })
    _audio.addEventListener('pause', () => {
      // Only set paused if we didn't just end
      if (_audio && _audio.currentTime < (_audio.duration || Infinity) - 0.1) {
        isPlaying.value = false
        isPaused.value = true
      }
    })
    _audio.addEventListener('error', (e) => {
      error.value = 'Audio playback error'
      isLoading.value = false
      isPlaying.value = false
    })
    return _audio
  }

  function _onEnded() {
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0
    statusMessage.value = 'Audio playback finished'
    endedCount.value++ // Signal that audio reached its natural end
  }

  function _cleanup() {
    if (_abortController) { _abortController.abort(); _abortController = null }
    if (_audio) { _audio.pause(); _audio.removeAttribute('src'); _audio.load() }
    if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null }
    if (_downloadBlobUrl) { URL.revokeObjectURL(_downloadBlobUrl); _downloadBlobUrl = null }
    // Clean up MediaSource
    if (_sourceBuffer) _sourceBuffer = null
    if (_mediaSource && _mediaSource.readyState === 'open') {
      try { _mediaSource.endOfStream() } catch (e) { /* ok */ }
    }
    _mediaSource = null
    _streamingChunks = []
    _lastAppendedCount = 0
    // Reset state
    isPlaying.value = false
    isPaused.value = false
    isLoading.value = false
    isBuffering.value = false
    currentTime.value = 0
    duration.value = 0
    downloadUrl.value = null
    isFullyLoaded.value = false
  }

  // ── Public API ──

  /**
   * Play a pre-generated MP3 file. Instant playback, no API call.
   * Returns true if the file was found and playback started.
   */
  async function playFile(url) {
    if (!url) return false
    _cleanup()
    error.value = ''
    isLoading.value = true
    statusMessage.value = 'Loading audio...'

    const audio = _createAudio()
    try {
      audio.src = url
      audio.playbackRate = speed.value
      await audio.play()
      isPlaying.value = true
      isPaused.value = false
      isLoading.value = false
      isFullyLoaded.value = true
      downloadUrl.value = url
      statusMessage.value = 'Playing audio'
      return true
    } catch (e) {
      error.value = 'Could not play audio file'
      isLoading.value = false
      return false
    }
  }

  /**
   * Smart play — tries pre-generated file first, falls back to on-demand TTS.
   * @param {string} itemId — content item ID
   * @param {string} locale — "en" or "fr"
   * @param {number|null} sectionIndex — section index for modules
   * @param {string} fallbackText — text to speak if no pre-generated file
   */
  async function smartPlay(itemId, locale, sectionIndex, fallbackText) {
    const preGenUrl = getPreGeneratedAudio(itemId, locale, sectionIndex)
    if (preGenUrl) {
      const ok = await playFile(preGenUrl)
      if (ok) return
    }
    // No pre-generated file available
    error.value = 'Audio not yet generated for this section'
    statusMessage.value = 'Audio not available'
    isLoading.value = false
  }

  async function fetchVoices() {
    if (voicesLoaded.value) return
    try {
      const res = await fetch('/api/tts/voices')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      voices.value = (data.voices || []).map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels || {}
      }))
      voicesLoaded.value = true
      // Try to find a male American voice as default
      const american = voices.value.find(v =>
        v.labels?.accent === 'american' && v.labels?.gender === 'male'
      )
      if (american) selectedVoiceId.value = american.id
    } catch (e) {
      error.value = 'Could not load voices: ' + e.message
    }
  }

  // Check once if MediaSource supports audio/mpeg (Chrome/Edge yes, Firefox no)
  const _canStreamMSE = typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported('audio/mpeg')

  // MediaSource refs — persist across the streaming lifecycle
  let _mediaSource = null
  let _sourceBuffer = null
  let _streamingChunks = []
  let _lastAppendedCount = 0

  /**
   * Stream TTS for the given text. Starts playback as soon as data arrives.
   * Uses MediaSource API for true streaming where supported (Chrome/Edge),
   * otherwise collects the full response then plays (Firefox/Safari).
   *
   * Based on the proven streaming approach from vocal-academy-lab.
   */
  async function speak(text) {
    if (!text || !text.trim()) return
    _cleanup()
    error.value = ''
    isLoading.value = true
    statusMessage.value = 'Loading audio...'

    _abortController = new AbortController()
    const audio = _createAudio()
    _streamingChunks = []
    _lastAppendedCount = 0
    _mediaSource = null
    _sourceBuffer = null

    try {
      const res = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoiceId.value || DEFAULT_VOICE_ID,
          model_id: 'eleven_flash_v2_5',
          streaming: true
        }),
        signal: _abortController.signal
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`TTS request failed (${res.status}): ${body}`)
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      let chunkCount = 0
      let hasStartedPlaying = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunkCount++
        _streamingChunks.push(value)

        if (_canStreamMSE) {
          // MediaSource streaming — start after 4 chunks, update every 4
          if (!hasStartedPlaying && chunkCount >= 4) {
            hasStartedPlaying = true
            _initMediaSource(audio)
          } else if (hasStartedPlaying && chunkCount % 4 === 0) {
            _appendNewChunks()
          }
        }
      }

      // Finalize
      if (_canStreamMSE && _mediaSource) {
        // Append any remaining chunks
        _appendNewChunks()
        // Wait for buffer to finish, then end stream
        _finalizeMediaSource()
      }

      // Create the final complete blob for seeking / fallback
      _createFinalBlob(audio, hasStartedPlaying)

    } catch (e) {
      if (e.name === 'AbortError') return
      error.value = e.message
      isLoading.value = false
      isPlaying.value = false
      statusMessage.value = 'Error: ' + e.message
    }
  }

  /**
   * Initialize MediaSource and start playback after a short buffer delay.
   * Mirrors the vocal-academy-lab approach: create MediaSource → sourceopen →
   * addSourceBuffer → append initial chunks → play after 2s delay.
   */
  function _initMediaSource(audio) {
    if (_mediaSource) { _appendNewChunks(); return }

    _mediaSource = new MediaSource()
    _currentBlobUrl = URL.createObjectURL(_mediaSource)
    audio.src = _currentBlobUrl

    _mediaSource.addEventListener('sourceopen', () => {
      try {
        if (_mediaSource && _mediaSource.readyState === 'open') {
          _sourceBuffer = _mediaSource.addSourceBuffer('audio/mpeg')
          _sourceBuffer.addEventListener('updateend', () => {
            // After an append finishes, check if there are more new chunks waiting
            _appendNewChunks()
          })
          // Append the initial chunks we've already collected
          _appendNewChunks()
        }
      } catch (e) {
        // SourceBuffer creation failed — will fall back to blob on finalize
      }
    })

    // Start playback after a 2-second buffer delay to accumulate enough data
    setTimeout(async () => {
      try {
        if (audio && _streamingChunks.length >= 3) {
          audio.playbackRate = speed.value
          await audio.play()
          isPlaying.value = true
          isPaused.value = false
          isLoading.value = false
          statusMessage.value = 'Playing audio'
        }
      } catch (e) {
        // Auto-play blocked — user will need to click play
        isLoading.value = false
        statusMessage.value = 'Audio ready — press play'
      }
    }, 2000)
  }

  /**
   * Append only NEW chunks that haven't been sent to the SourceBuffer yet.
   * Retries after 100ms if the buffer is busy.
   */
  function _appendNewChunks() {
    if (!_sourceBuffer || _sourceBuffer.updating) {
      // Buffer busy — retry shortly
      if (_sourceBuffer) setTimeout(_appendNewChunks, 100)
      return
    }

    const newChunks = _streamingChunks.slice(_lastAppendedCount)
    if (newChunks.length === 0) return

    const totalLen = newChunks.reduce((acc, c) => acc + c.length, 0)
    if (totalLen === 0) return

    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of newChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    try {
      _sourceBuffer.appendBuffer(combined)
      _lastAppendedCount = _streamingChunks.length
    } catch (e) {
      // QuotaExceeded or other — will be retried on updateend
    }
  }

  /**
   * End the MediaSource stream once all data has been appended.
   */
  function _finalizeMediaSource() {
    if (!_mediaSource || _mediaSource.readyState !== 'open') return
    if (_sourceBuffer && _sourceBuffer.updating) {
      // Wait for current update to finish, then finalize
      _sourceBuffer.addEventListener('updateend', function handler() {
        _sourceBuffer.removeEventListener('updateend', handler)
        if (_mediaSource && _mediaSource.readyState === 'open') {
          try { _mediaSource.endOfStream() } catch (e) { /* already ended */ }
        }
      })
    } else {
      try { _mediaSource.endOfStream() } catch (e) { /* already ended */ }
    }
  }

  /**
   * Create a final complete blob. Always create a download URL.
   * If MediaSource was streaming, keep that for playback.
   * Otherwise (fallback), set blob as src and play.
   */
  function _createFinalBlob(audio, wasStreaming) {
    if (_streamingChunks.length === 0) {
      error.value = 'No audio data received'
      isLoading.value = false
      return
    }

    const totalLen = _streamingChunks.reduce((acc, c) => acc + c.length, 0)
    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of _streamingChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    const blob = new Blob([combined], { type: 'audio/mpeg' })

    // Always create a download URL
    if (_downloadBlobUrl) URL.revokeObjectURL(_downloadBlobUrl)
    _downloadBlobUrl = URL.createObjectURL(blob)
    downloadUrl.value = _downloadBlobUrl
    isFullyLoaded.value = true

    if (wasStreaming && _mediaSource) {
      // MediaSource handled playback — keep it, download is ready
      isLoading.value = false
      statusMessage.value = 'Playing audio'
      return
    }

    // Blob fallback — no MediaSource, play the complete blob
    if (_currentBlobUrl) URL.revokeObjectURL(_currentBlobUrl)
    _currentBlobUrl = URL.createObjectURL(blob)

    const wasPlaying = audio && !audio.paused
    const pos = audio ? audio.currentTime : 0

    audio.src = _currentBlobUrl
    audio.playbackRate = speed.value

    if (wasPlaying && pos > 0) {
      audio.currentTime = pos
    }

    // Auto-play if not already playing
    if (!wasPlaying) {
      setTimeout(async () => {
        try {
          await audio.play()
          isPlaying.value = true
          isPaused.value = false
          isLoading.value = false
          statusMessage.value = 'Playing audio'
        } catch (e) {
          isLoading.value = false
          statusMessage.value = 'Audio ready — press play'
        }
      }, 100)
    } else {
      isLoading.value = false
    }
  }

  function pause() {
    if (_audio && isPlaying.value) {
      _audio.pause()
      isPlaying.value = false
      isPaused.value = true
      statusMessage.value = 'Paused'
    }
  }

  function resume() {
    if (_audio && isPaused.value) {
      _audio.play()
      isPlaying.value = true
      isPaused.value = false
      statusMessage.value = 'Playing'
    }
  }

  function togglePlayPause() {
    if (isPlaying.value) pause()
    else if (isPaused.value) resume()
  }

  function stop() {
    _cleanup()
    statusMessage.value = 'Stopped'
  }

  function replay() {
    if (_audio && _currentBlobUrl) {
      _audio.currentTime = 0
      _audio.play()
      isPlaying.value = true
      isPaused.value = false
      statusMessage.value = 'Replaying from start'
    }
  }

  function seekForward(seconds = 5) {
    if (_audio && (isPlaying.value || isPaused.value)) {
      _audio.currentTime = Math.min(_audio.currentTime + seconds, _audio.duration || Infinity)
      statusMessage.value = `Forward ${seconds} seconds`
    }
  }

  function seekBackward(seconds = 5) {
    if (_audio && (isPlaying.value || isPaused.value)) {
      _audio.currentTime = Math.max(_audio.currentTime - seconds, 0)
      statusMessage.value = `Back ${seconds} seconds`
    }
  }

  function seekTo(time) {
    if (_audio && (isPlaying.value || isPaused.value)) {
      _audio.currentTime = Math.max(0, Math.min(time, _audio.duration || 0))
    }
  }

  function setSpeed(newSpeed) {
    speed.value = newSpeed
    if (_audio) _audio.playbackRate = newSpeed
    statusMessage.value = `Speed ${newSpeed}x`
  }

  function cycleSpeed() {
    speedIndex.value = (speedIndex.value + 1) % SPEED_OPTIONS.length
    setSpeed(SPEED_OPTIONS[speedIndex.value])
  }

  function increaseSpeed() {
    if (speedIndex.value < SPEED_OPTIONS.length - 1) {
      speedIndex.value++
      setSpeed(SPEED_OPTIONS[speedIndex.value])
    }
  }

  function decreaseSpeed() {
    if (speedIndex.value > 0) {
      speedIndex.value--
      setSpeed(SPEED_OPTIONS[speedIndex.value])
    }
  }

  // ── Play All Module — narrates every section sequentially ──
  const isPlayingAll = ref(false)
  const playAllSectionIndex = ref(0)
  const playAllTotalSections = ref(0)
  let _playAllSections = []
  let _playAllTc = null
  let _playAllCancelled = false

  /**
   * Play All Module — narrates each section in order.
   * For quiz sections: reads the question, options, pauses 5 seconds,
   * then reveals the correct answer.
   *
   * @param {Array} sections — the module's sections array
   * @param {Function} tcFn — the tc() locale resolver function
   * @param {Function} onSectionChange — callback(sectionIndex) to update the UI section
   * @param {Object} meta — { id, title, day, levelName } for intro/outro narration
   */
  async function playAllModule(sections, tcFn, onSectionChange, meta = {}) {
    if (!sections || sections.length === 0) return
    _playAllSections = sections
    _playAllTc = tcFn
    _playAllCancelled = false
    isPlayingAll.value = true
    playAllTotalSections.value = sections.length
    statusMessage.value = `Playing full module: ${sections.length} sections`

    // ── Intro narration with metadata ──
    if (meta.id || meta.title) {
      const introParts = []
      introParts.push('Welcome to the Alberta AI Academy.')
      if (meta.levelName && meta.day) {
        introParts.push(`This is module ${meta.id || ''} from Day ${meta.day} of ${meta.levelName}.`)
      } else if (meta.title) {
        introParts.push(`This module is: ${tcFn(meta.title)}.`)
      }
      introParts.push(`This module has ${sections.length} sections. Let's begin.`)
      await _speakAndWait(introParts.join(' '))
      if (_playAllCancelled) { isPlayingAll.value = false; return }
      await _sleep(1000)
    }

    for (let i = 0; i < sections.length; i++) {
      if (_playAllCancelled) break
      playAllSectionIndex.value = i
      if (onSectionChange) onSectionChange(i)

      // Announce section number
      const sectionIntro = `Section ${i + 1} of ${sections.length}: ${tcFn(sections[i].title)}.`
      const sectionText = extractSectionTextWithAnswers(sections[i], tcFn)
      const fullText = sectionIntro + '\n' + sectionText
      if (!fullText.trim()) continue

      // Speak this section and wait for it to finish
      await _speakAndWait(fullText)
      if (_playAllCancelled) break

      // Brief pause between sections (1.5s)
      if (i < sections.length - 1) {
        await _sleep(1500)
      }
    }

    // ── Outro narration ──
    if (!_playAllCancelled) {
      await _sleep(1000)
      const outro = 'This concludes the module. Thank you for your attention and participation. We hope you found this content valuable. Feel free to revisit any section or explore more modules in the Academy.'
      await _speakAndWait(outro)
    }

    isPlayingAll.value = false
    if (!_playAllCancelled) {
      statusMessage.value = 'Module playback complete'
    }
  }

  function stopPlayAll() {
    _playAllCancelled = true
    isPlayingAll.value = false
    stop()
  }

  /** Speaks text and returns a promise that resolves when playback ends */
  function _speakAndWait(text) {
    return new Promise(async (resolve) => {
      const onEnd = () => {
        if (_audio) _audio.removeEventListener('ended', onEnd)
        resolve()
      }
      // Wire up the ended listener before speaking
      const audio = _createAudio()
      audio.addEventListener('ended', onEnd)
      await speak(text)
      // If speak failed (error), resolve immediately
      if (error.value) {
        audio.removeEventListener('ended', onEnd)
        resolve()
      }
    })
  }

  function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
  }

  onUnmounted(() => {
    _playAllCancelled = true
    _cleanup()
    if (_audio) {
      _audio.removeEventListener('ended', _onEnded)
      _audio = null
    }
  })

  return {
    // State
    isPlaying,
    isPaused,
    isLoading,
    isBuffering,
    error,
    currentTime,
    duration,
    speed,
    voices,
    selectedVoiceId,
    voicesLoaded,
    statusMessage,
    downloadUrl,
    isFullyLoaded,
    endedCount,
    // Constants
    SPEED_OPTIONS,
    // Play All state
    isPlayingAll,
    playAllSectionIndex,
    playAllTotalSections,
    // Methods
    fetchVoices,
    playFile,
    smartPlay,
    speak,
    pause,
    resume,
    togglePlayPause,
    stop,
    replay,
    seekForward,
    seekBackward,
    seekTo,
    setSpeed,
    cycleSpeed,
    increaseSpeed,
    decreaseSpeed,
    playAllModule,
    stopPlayAll
  }
}

/**
 * Extract readable text from a module section's content blocks.
 * Strips markdown formatting for clean TTS output.
 */
export function extractSectionText(section, tc) {
  if (!section) return ''
  const parts = []

  // Section title
  if (section.title) parts.push(tc(section.title))

  for (const block of (section.content || [])) {
    switch (block.type) {
      case 'hero':
        if (block.title) parts.push(tc(block.title))
        if (block.titleHighlight) parts.push(tc(block.titleHighlight))
        if (block.subtitle) parts.push(tc(block.subtitle))
        break
      case 'text':
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'list':
        if (block.items) {
          block.items.forEach(item => parts.push(stripMarkdown(typeof item === 'object' ? (tc(item)) : item)))
        }
        break
      case 'highlight':
        if (block.label) parts.push(tc(block.label))
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'cards':
        if (block.items) {
          block.items.forEach(card => {
            if (card.title) parts.push(tc(card.title))
            if (card.content) parts.push(tc(card.content))
          })
        }
        break
      case 'stat':
        if (block.heading) parts.push(tc(block.heading))
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'quiz':
        // Read the question and options, but not the answer
        if (block.question) parts.push(tc(block.question))
        if (block.options) {
          block.options.forEach((opt, i) => {
            const text = tc(opt)
            // Don't add letter prefix if option already starts with "A.", "B)", etc.
            const hasPrefix = /^[A-Da-d][.):\s]/.test(text)
            parts.push(hasPrefix ? text : `Option ${String.fromCharCode(65 + i)}: ${text}`)
          })
        }
        break
      case 'image':
        if (block.alt) parts.push(`Image: ${tc(block.alt)}`)
        break
      case 'video':
        if (block.caption) parts.push(`Video: ${tc(block.caption)}`)
        break
    }
  }

  return parts.filter(Boolean).join('. \n')
}

/**
 * Extract text with quiz answers revealed — for Play All Module mode.
 * Reads the question, options, then after a pause cue, the correct answer.
 */
export function extractSectionTextWithAnswers(section, tc) {
  if (!section) return ''
  const parts = []

  if (section.title) parts.push(tc(section.title))

  for (const block of (section.content || [])) {
    switch (block.type) {
      case 'hero':
        if (block.title) parts.push(tc(block.title))
        if (block.titleHighlight) parts.push(tc(block.titleHighlight))
        if (block.subtitle) parts.push(tc(block.subtitle))
        break
      case 'text':
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'list':
        if (block.items) {
          block.items.forEach(item => parts.push(stripMarkdown(typeof item === 'object' ? tc(item) : item)))
        }
        break
      case 'highlight':
        if (block.label) parts.push(tc(block.label))
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'cards':
        if (block.items) {
          block.items.forEach(card => {
            if (card.title) parts.push(tc(card.title))
            if (card.content) parts.push(tc(card.content))
          })
        }
        break
      case 'stat':
        if (block.heading) parts.push(tc(block.heading))
        if (block.content) parts.push(stripMarkdown(tc(block.content)))
        break
      case 'quiz': {
        // Read the question
        if (block.question) parts.push(`Quiz question: ${tc(block.question)}`)
        // Read each option — detect if letter prefix already present
        if (block.options) {
          block.options.forEach((opt, i) => {
            const text = tc(opt)
            const hasPrefix = /^[A-Da-d][.):\s]/.test(text)
            parts.push(hasPrefix ? text : `Option ${String.fromCharCode(65 + i)}: ${text}`)
          })
        }
        // Pause cue then reveal answer
        parts.push('... ... ... ... ... Take a moment to think about your answer.')
        if (block.correctAnswer) {
          const correctText = tc(block.correctAnswer)
          // Strip any existing letter prefix from the answer for cleaner narration
          const cleanAnswer = correctText.replace(/^[A-Da-d][.):\s]\s*/, '')
          const correctIdx = block.options
            ? block.options.findIndex(opt => tc(opt) === correctText)
            : -1
          const letter = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : ''
          parts.push(`The correct answer is ${letter ? `${letter}: ` : ''}${cleanAnswer}.`)
        }
        if (block.explanation) {
          parts.push(`Explanation: ${tc(block.explanation)}`)
        }
        break
      }
      case 'image':
        if (block.alt) parts.push(`Image: ${tc(block.alt)}`)
        break
      case 'video':
        if (block.caption) parts.push(`Video: ${tc(block.caption)}`)
        break
    }
  }

  return parts.filter(Boolean).join('. \n')
}

function stripMarkdown(text) {
  if (!text) return ''
  let result = text
    .replace(/#{1,6}\s+/g, '')          // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
    .replace(/\*([^*]+)\*/g, '$1')      // italic
    .replace(/__([^_]+)__/g, '$1')      // bold alt
    .replace(/_([^_]+)_/g, '$1')        // italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/`([^`]+)`/g, '$1')        // inline code
    .replace(/```[\s\S]*?```/g, '')     // code blocks
    .replace(/~~(.+?)~~/gs, '$1')       // strikethrough
    .replace(/>\s+/g, '')               // blockquotes
    .replace(/[-*+]\s+/g, '')           // list markers
    .replace(/\n{2,}/g, '. ')           // paragraph breaks → sentence breaks
  // Multi-pass HTML tag removal to handle malformed/nested tags
  let prev
  do { prev = result; result = result.replace(/<[^>]*>/g, '') } while (result !== prev)
  return result.trim()
}

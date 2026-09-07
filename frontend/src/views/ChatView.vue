<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import { useContentStore, LOCKED_LEVELS } from '@/stores/content.js'
import { useCurriculumBuilder } from '@/composables/useCurriculumBuilder.js'

const { t } = useI18n()

// ─── Config ──────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL ?? 'https://dev-enterprise-tools-f11d7029-service.onrender.com'
const WS_URL  = import.meta.env.VITE_WS_URL  ?? 'wss://dev-enterprise-tools-f11d7029-service.onrender.com/ws'
const MODEL_PRIORITIES = ['sonnet', 'grok', 'gemini']

// ─── Stores / composables ─────────────────────────────────────────────────────
const contentStore      = useContentStore()
const curriculumBuilder = useCurriculumBuilder()

// ─── Prompt builders (identical logic to AiAssistantPanel) ───────────────────
function buildSystemPrompt() {
  return `You are an AI learning assistant for the Alberta AI Academy — a Government of Alberta training platform for AI literacy.

## YOUR GOAL
Help learners get a personalised curriculum from the Academy's content library as quickly as possible.

## HOW TO RESPOND

**When the user mentions any topic, goal, or interest** (e.g. "machine learning", "AI basics", "leadership", "I work in policy"):
1. Immediately search the CURRICULUM CATALOGUE (provided earlier in this conversation) for the best matching items
2. Recommend 3–6 relevant items — for each include the title as a markdown link using its real URL, the content ID, and one sentence on why it's relevant
3. End your response with the exact text [READY_TO_GENERATE] on its own line
4. After [READY_TO_GENERATE], add: "Click **Generate My Curriculum** below to download your personalised plan as a Word document. Want a more tailored plan? Just ask and I can learn more about your role."

**When the user has no specific topic yet** (e.g. "Hello" or "I want to build a curriculum"):
- Ask one simple question: "What topic or area would you like to focus on? For example: AI basics, machine learning, prompt engineering, AI in government, or leadership."
- Do NOT ask multiple questions first

**When the user wants a more personalised plan**:
- Ask at most 2 short questions (role, experience level) — one at a time
- Then immediately refine your recommendations and include [READY_TO_GENERATE] again

## CRITICAL RULES
- ONLY recommend items from the CURRICULUM CATALOGUE provided in this conversation — use their exact IDs
- NEVER invent or suggest tools, courses, libraries, or resources not in that catalogue
- If no catalogue items closely match a topic, say so honestly and suggest the closest available content
- Always link to items using their "link" field from the catalogue as a markdown link, e.g. [Item Title](/item/l1-1.3.2) — this opens the content directly in the platform
- Keep responses concise — bullet points, bold titles, no long paragraphs`
}

/**
 * Returns a [user, assistant] message pair that injects the full curriculum
 * catalogue into the conversation body. This ensures the AI always has the
 * catalogue regardless of how the backend handles system messages.
 */
function buildCatalogueMessages() {
  const catalogue = contentStore.getCatalogueForAI()
  const itemCount = Object.values(catalogue).reduce((n, l) => n + l.items.length, 0)
  return [
    {
      role: 'user',
      content: `CURRICULUM CATALOGUE — Alberta AI Academy\n\nThe following JSON contains every available resource. You MUST only recommend items from this list. Never suggest any resource, tool, library, or course not present here.\n\n${JSON.stringify(catalogue, null, 2)}`
    },
    {
      role: 'assistant',
      content: `Understood. I have the complete Alberta AI Academy curriculum catalogue with ${itemCount} resources across ${Object.keys(catalogue).length} level${Object.keys(catalogue).length === 1 ? '' : 's'}. I will only ever recommend items from this catalogue and will never suggest anything outside it.`
    }
  ]
}

// ─── WS state ─────────────────────────────────────────────────────────────────
let ws_instance  = null
let pingInterval = null

const connectionStatus = ref('disconnected')
const connectionId     = ref('—')
const models           = ref([])
const selectedModel    = ref(null)
const messages         = ref([])          // { role, content }
const streamingRaw     = ref('')
const isStreaming      = ref(false)
const waitingForFirst  = ref(false)       // between send and first llm:chunk
const chatError        = ref('')

// ─── Curriculum state ─────────────────────────────────────────────────────────
const curriculumReady     = ref(false)
const isGenerating        = ref(false)
const downloadError       = ref('')
const isFallbackCurriculum = ref(false)

// ─── UI state ─────────────────────────────────────────────────────────────────
const isDark           = ref(true)
const sidebarOpen      = ref(false)
const sidebarCollapsed = ref(false)
const isFetchingModels = ref(false)
const messagesEl       = ref(null)
const inputEl          = ref(null)
const inputText        = ref('')
const copiedIdx        = ref(null)

// ─── Computed ─────────────────────────────────────────────────────────────────
const availableModels = computed(() => models.value.filter(m => m.available === true))

/** Human-readable label for the loaded (unlocked) curriculum levels */
const loadedLevelsLabel = computed(() => {
  const unlocked = contentStore.levels.filter(l => !LOCKED_LEVELS.includes(l.id))
  if (!unlocked.length) return 'no curriculum loaded'
  const names = unlocked.map(l => {
    const m = l.id.match(/^level(\d+)$/)
    return m ? `Level ${m[1]}` : l.title
  })
  return names.join(', ') + ' curriculum loaded'
})

const canSend = computed(() =>
  connectionStatus.value === 'connected' &&
  selectedModel.value &&
  !isStreaming.value &&
  !waitingForFirst.value &&
  !isGenerating.value
)

const statusClass = computed(() => ({
  connected:  connectionStatus.value === 'connected',
  connecting: connectionStatus.value === 'connecting',
  error:      connectionStatus.value === 'error',
}))

// ─── Theme ───────────────────────────────────────────────────────────────────
function toggleTheme() { isDark.value = !isDark.value; localStorage.setItem('chat-theme', isDark.value ? 'dark' : 'light') }

function loadTheme() {
  const saved = localStorage.getItem('chat-theme')
  if (saved === 'light') isDark.value = false
  else if (!saved && window.matchMedia?.('(prefers-color-scheme: light)').matches) isDark.value = false
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connect() {
  if (ws_instance && ws_instance.readyState < 2) return
  connectionStatus.value = 'connecting'
  connectionId.value = '—'
  ws_instance = new WebSocket(WS_URL)
  ws_instance.onopen = () => { /* wait for connection:welcome */ }
  ws_instance.onmessage = (e) => {
    try { handleWsMessage(JSON.parse(e.data)) }
    catch { console.warn('[chat] bad WS message', e.data) }
  }
  ws_instance.onerror = () => { connectionStatus.value = 'error' }
  ws_instance.onclose = () => {
    clearInterval(pingInterval); pingInterval = null
    if (connectionStatus.value !== 'error') { connectionStatus.value = 'disconnected'; connectionId.value = '—' }
  }
}

function disconnect() {
  clearInterval(pingInterval); pingInterval = null
  if (ws_instance) {
    ws_instance.onopen = ws_instance.onmessage = ws_instance.onerror = ws_instance.onclose = null
    ws_instance.close(); ws_instance = null
  }
  connectionStatus.value = 'disconnected'; connectionId.value = '—'
}

function toggleConnection() { connectionStatus.value === 'connected' ? disconnect() : connect() }

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'connection:welcome':
      connectionStatus.value = 'connected'
      connectionId.value = msg.connectionId ?? msg.id ?? '—'
      pingInterval = setInterval(() => {
        ws_instance?.readyState === WebSocket.OPEN && ws_instance.send(JSON.stringify({ type: 'ping' }))
      }, 25000)
      break
    case 'llm:started':
      isStreaming.value = true
      waitingForFirst.value = false
      chatError.value = ''
      break
    case 'llm:chunk':
      streamingRaw.value += (msg.content ?? msg.chunk ?? '')
      scrollToBottom()
      break
    case 'llm:done':
      finaliseStream()
      break
    case 'llm:error':
      isStreaming.value = false; waitingForFirst.value = false; streamingRaw.value = ''
      chatError.value = msg.error ?? msg.message ?? 'The AI encountered an error. Please try again.'
      break
    case 'llm:cancelled':
      isStreaming.value = false; waitingForFirst.value = false; streamingRaw.value = ''
      break
    case 'pong': break
  }
}

// ─── Models ───────────────────────────────────────────────────────────────────
async function fetchModels() {
  if (isFetchingModels.value) return
  isFetchingModels.value = true
  try {
    const resp = await fetch(`${API_URL}/api/v1/llm/models`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    const raw = data.data?.models ?? data.models ?? (Array.isArray(data) ? data : [])
    models.value = raw
    autoSelectModel()
  } catch (e) { console.warn('[chat] fetchModels failed:', e.message) }
  finally { isFetchingModels.value = false }
}

function autoSelectModel() {
  const available = availableModels.value
  if (!available.length) return
  let pick = null
  for (const kw of MODEL_PRIORITIES) {
    pick = available.find(m => {
      const id = (m.id ?? m.name ?? '').toLowerCase()
      return id.includes(kw) || (m.name ?? '').toLowerCase().includes(kw)
    })
    if (pick) break
  }
  selectModel(pick ?? available[0])
}

function selectModel(model) {
  selectedModel.value = model.id ?? model.name ?? model
  chatError.value = ''
  if (window.innerWidth < 768) sidebarOpen.value = false
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function _wsSend(messagesPayload) {
  ws_instance.send(JSON.stringify({
    type:     'llm:start',
    taskId:   `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    model:    selectedModel.value,
    messages: messagesPayload
  }))
  isStreaming.value = true
  waitingForFirst.value = true
  streamingRaw.value = ''
  scrollToBottom()
}

// "Let's get started" button — fires the AI's opening question
function startConversation() {
  const greeting = 'Hello, I would like to build my personalised AI learning curriculum.'
  messages.value.push({ role: 'user', content: greeting })
  _wsSend([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    { role: 'user', content: greeting }
  ])
}

function sendMessage() {
  const content = inputText.value.trim()
  if (!content || !canSend.value) return
  chatError.value = ''
  messages.value.push({ role: 'user', content })
  inputText.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  // Catalogue messages are injected into the conversation body so the AI
  // reliably sees the curriculum regardless of backend system-msg handling.
  _wsSend([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    ...messages.value
  ])
}

function finaliseStream() {
  if (streamingRaw.value) {
    const content = streamingRaw.value
    // Detect [READY_TO_GENERATE] signal
    if (content.includes('[READY_TO_GENERATE]')) {
      messages.value.push({ role: 'assistant', content: content.replace('[READY_TO_GENERATE]', '').trim() })
      curriculumReady.value = true
    } else {
      messages.value.push({ role: 'assistant', content })
    }
  }
  streamingRaw.value = ''
  isStreaming.value = false
  waitingForFirst.value = false
  scrollToBottom()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

function autoResize(e) {
  const el = e.target; el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// ─── Curriculum generation (mirrors AiAssistantPanel exactly) ─────────────────
async function handleGenerate() {
  if (isGenerating.value) return
  isGenerating.value = true
  downloadError.value = ''
  isFallbackCurriculum.value = false

  const promptText = curriculumBuilder.buildCurriculumMessage()
  messages.value.push({ role: 'user', content: 'Please generate my personalised curriculum.' })

  // Send generation prompt in place of the last user message
  _wsSend([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    ...messages.value.slice(0, -1),
    { role: 'user', content: promptText }
  ])

  const stopStream = watch(isStreaming, async (streaming) => {
    if (!streaming) { stopStream(); stopError(); await _handleGenerationComplete() }
  })

  const stopError = watch(chatError, (err) => {
    if (err) { stopStream(); stopError(); downloadError.value = err; isGenerating.value = false }
  })
}

async function _handleGenerationComplete() {
  waitingForFirst.value = false
  if (chatError.value) { downloadError.value = chatError.value; isGenerating.value = false; return }

  const lastMsg = messages.value.at(-1)
  if (!lastMsg || lastMsg.role !== 'assistant') {
    downloadError.value = 'No response received. Please try again.'
    isGenerating.value = false; return
  }

  const result = curriculumBuilder.parseAndValidate(lastMsg.content)
  let curriculum, resolvedSections

  if (result.ok) {
    curriculum = result.curriculum; resolvedSections = result.resolvedSections
    lastMsg.content = '✓ Your personalised curriculum has been generated! Click the button below to download your Word document.'
  } else {
    console.warn('[ChatView] Curriculum JSON parse failed — using fallback')
    isFallbackCurriculum.value = true
    const fallback = curriculumBuilder.buildFallbackCurriculum(messages.value)
    curriculum = fallback.curriculum; resolvedSections = fallback.resolvedSections
    lastMsg.content = 'I\'ve prepared a summary of your recommendations. A simplified curriculum document is ready to download.'
  }

  try {
    const { generateDocx } = await import('@/utils/generateDocx.js')
    const blob  = await generateDocx(curriculum, resolvedSections)
    const url   = URL.createObjectURL(blob)
    const a     = Object.assign(document.createElement('a'), { href: url, download: `alberta-ai-academy-curriculum-${Date.now()}.docx` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('[ChatView] DOCX generation failed:', err)
    downloadError.value = 'Document generation failed. Please try again.'
  } finally {
    isGenerating.value = false
  }
}

// ─── Copy / Download helpers ──────────────────────────────────────────────────
async function copyMessage(content, idx) {
  try { await navigator.clipboard.writeText(content) }
  catch { const ta = Object.assign(document.createElement('textarea'), { value: content }); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
  copiedIdx.value = idx; setTimeout(() => { copiedIdx.value = null }, 2000)
}

function downloadMessage(content, idx) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })), download: `response-${idx + 1}.md` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function downloadFullChat() {
  if (!messages.value.length) return
  let md = `# Alberta AI Academy — Chat Export\n\n**Model:** ${selectedModel.value ?? 'Unknown'}\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n`
  messages.value.forEach(m => { md += `## ${m.role === 'user' ? '👤 User' : '🎓 Assistant'}\n\n${m.content}\n\n---\n\n` })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `chat-export-${new Date().toISOString().slice(0, 10)}.md` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function clearChat() {
  messages.value = []; streamingRaw.value = ''; chatError.value = ''
  isStreaming.value = false; waitingForFirst.value = false
  curriculumReady.value = false; downloadError.value = ''
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ''
  try { return marked.parse(text) } catch { return escapeHtml(text) }
}

// Intercept clicks on /item/{id} links to open the content modal
function handleMessageClick(event) {
  const link = event.target.closest('a')
  if (!link) return
  const href = link.getAttribute('href')
  if (!href) return
  const match = href.match(/^\/item\/(.+)$/)
  if (match) {
    event.preventDefault()
    event.stopPropagation()
    contentStore.openItemModal(match[1])
  }
}

function escapeHtml(text) {
  const d = document.createElement('div'); d.textContent = text; return d.innerHTML
}

// ─── Scroll ───────────────────────────────────────────────────────────────────
function scrollToBottom() {
  nextTick(() => { if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(() => {
  loadTheme()
  connect()
  const stop = watch(connectionStatus, async (s) => { if (s === 'connected') { stop(); await fetchModels() } })
})

onUnmounted(() => { disconnect() })

watch(streamingRaw, scrollToBottom)
</script>

<template>
  <div class="cv" :class="{ 'cv--light': !isDark }">
    <!-- Ambient glow -->
    <div class="cv-ambient" aria-hidden="true">
      <div class="cv-orb cv-orb--1"></div>
      <div class="cv-orb cv-orb--2"></div>
    </div>

    <!-- Mobile header -->
    <div class="cv-mobile-bar">
      <div class="cv-logo">
        <div class="cv-logo__icon" aria-hidden="true">🎓</div>
        <span class="cv-logo__text">AI Academy Chat</span>
      </div>
      <div class="cv-mobile-bar__right">
        <button class="cv-icon-btn" @click="downloadFullChat" :disabled="!messages.length" title="Download chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="cv-icon-btn" @click="sidebarOpen = true" aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Mobile overlay -->
    <div class="cv-overlay" :class="{ 'cv-overlay--open': sidebarOpen }" @click="sidebarOpen = false" aria-hidden="true"/>

    <div class="cv-body">
      <!-- ── Sidebar ──────────────────────────────────── -->
      <aside class="cv-sidebar" :class="{ 'cv-sidebar--open': sidebarOpen, 'cv-sidebar--collapsed': sidebarCollapsed }">
        <div class="cv-sidebar__head">
          <div class="cv-logo">
            <div class="cv-logo__icon" aria-hidden="true">🎓</div>
            <span class="cv-logo__text">AI Academy Chat</span>
          </div>
        </div>

        <div class="cv-sidebar__body">
          <!-- Connection -->
          <div class="cv-conn">
            <div class="cv-conn__row">
              <span class="cv-dot" :class="statusClass"></span>
              <span class="cv-conn__label">{{ { disconnected:'Disconnected', connecting:'Connecting…', connected:'Connected', error:'Error' }[connectionStatus] }}</span>
            </div>
            <div class="cv-conn__id">{{ connectionId }}</div>
          </div>

          <!-- Buttons -->
          <div class="cv-sidebar__btns">
            <button class="cv-btn cv-btn--primary" @click="toggleConnection" :disabled="connectionStatus === 'connecting'">
              {{ connectionStatus === 'connected' ? 'Disconnect' : connectionStatus === 'connecting' ? 'Connecting…' : 'Connect' }}
            </button>
            <button class="cv-btn cv-btn--secondary" @click="fetchModels" :disabled="isFetchingModels || connectionStatus !== 'connected'">
              {{ isFetchingModels ? 'Loading…' : 'Refresh Models' }}
            </button>
            <button class="cv-btn cv-btn--ghost" @click="clearChat" :disabled="!messages.length && !chatError">
              Clear Chat
            </button>
          </div>

          <!-- Theme -->
          <div class="cv-theme">
            <span class="cv-theme__label">Theme</span>
            <button class="cv-theme__toggle" @click="toggleTheme" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
              <span :style="{ opacity: isDark ? 0.4 : 1 }">☀️</span>
              <span :style="{ opacity: isDark ? 1 : 0.4 }">🌙</span>
              <span class="cv-theme__knob" :class="{ 'cv-theme__knob--right': !isDark }"></span>
            </button>
          </div>

          <!-- Models -->
          <div class="cv-models">
            <div class="cv-models__title">Available Models</div>
            <template v-if="isFetchingModels">
              <div v-for="n in 3" :key="n" class="cv-skel"><div class="cv-skel__line"></div><div class="cv-skel__line cv-skel__line--short"></div></div>
            </template>
            <div v-else-if="!availableModels.length" class="cv-models__empty">
              {{ models.length ? 'No available models' : 'Click "Refresh Models" to load' }}
            </div>
            <button
              v-else
              v-for="model in availableModels"
              :key="model.id ?? model.name"
              class="cv-model"
              :class="{ 'cv-model--active': selectedModel === (model.id ?? model.name) }"
              @click="selectModel(model)"
            >
              <div class="cv-model__name">{{ model.name ?? model.id }}</div>
              <div class="cv-model__meta">
                <span class="cv-model__provider">{{ model.provider ?? 'unknown' }}</span>
                <span v-if="model.thinkingEnabled" class="cv-model__badge">🧠 Thinking</span>
                <span v-if="model.supportsVision"  class="cv-model__badge">👁 Vision</span>
              </div>
            </button>
          </div>
        </div>
      </aside>

      <!-- ── Main ───────────────────────────────────────── -->
      <main class="cv-main">
        <!-- Desktop header -->
        <header class="cv-chat-head">
          <button class="cv-icon-btn cv-icon-btn--bare" @click="sidebarCollapsed = !sidebarCollapsed" title="Toggle sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="cv-chat-head__info">
            <h1 class="cv-chat-head__title">
              {{ selectedModel ? (availableModels.find(m => (m.id ?? m.name) === selectedModel)?.name ?? selectedModel) : 'Alberta AI Academy' }}
            </h1>
            <p class="cv-chat-head__sub">
              {{ selectedModel
                  ? `${availableModels.find(m => (m.id ?? m.name) === selectedModel)?.provider ?? ''} · ${loadedLevelsLabel}`
                  : 'Connect and select a model to start chatting' }}
            </p>
          </div>
          <button class="cv-icon-btn cv-icon-btn--bare" @click="downloadFullChat" :disabled="!messages.length" title="Export chat as Markdown">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </header>

        <!-- Error banner -->
        <div v-if="chatError" class="cv-error-bar" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span class="cv-error-bar__msg">{{ chatError }}</span>
          <button class="cv-error-bar__dismiss" @click="chatError = ''">Dismiss</button>
        </div>

        <!-- Messages -->
        <div class="cv-msgs" ref="messagesEl" aria-live="polite" aria-label="Conversation" @click="handleMessageClick">

          <!-- Empty / connect state -->
          <div v-if="!messages.length && !isStreaming && !waitingForFirst" class="cv-empty">
            <div class="cv-empty__icon" aria-hidden="true">🎓</div>
            <h2 class="cv-empty__title">Alberta AI Academy</h2>
            <p class="cv-empty__desc">
              Tell me what you want to learn — I'll find the right resources and build a personalised curriculum you can download as a Word document.
            </p>
            <button v-if="connectionStatus === 'connected' && selectedModel" class="cv-start-btn" @click="startConversation">
              Let's get started
            </button>
            <div v-else-if="connectionStatus === 'connecting'" class="cv-connecting">
              <div class="cv-connecting__dots"><span></span><span></span><span></span></div>
              <span>Connecting to AI…</span>
            </div>
            <div v-else-if="connectionStatus === 'error'" class="cv-err-state">
              <span>Connection failed.</span>
              <button class="cv-btn cv-btn--secondary" style="margin-top:8px" @click="connect">Retry</button>
            </div>
          </div>

          <!-- Message history -->
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="cv-msg"
            :class="`cv-msg--${msg.role}`"
          >
            <div class="cv-msg__avatar" aria-hidden="true">{{ msg.role === 'user' ? '👤' : '🎓' }}</div>
            <div class="cv-msg__body">
              <div
                class="cv-msg__content"
                v-html="msg.role === 'user'
                  ? escapeHtml(msg.content).replace(/\n/g, '<br>')
                  : renderMarkdown(msg.content)"
              />
              <div v-if="msg.role === 'assistant'" class="cv-msg__actions">
                <button class="cv-act-btn" :class="{ 'cv-act-btn--copied': copiedIdx === idx }" @click="copyMessage(msg.content, idx)" title="Copy">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {{ copiedIdx === idx ? 'Copied!' : 'Copy' }}
                </button>
                <button class="cv-act-btn" @click="downloadMessage(msg.content, idx)" title="Save as .md">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Save
                </button>
              </div>
            </div>
          </div>

          <!-- Streaming in progress -->
          <div v-if="isStreaming" class="cv-msg cv-msg--assistant">
            <div class="cv-msg__avatar" aria-hidden="true">🎓</div>
            <div class="cv-msg__body">
              <div class="cv-msg__content" v-html="streamingRaw ? renderMarkdown(streamingRaw) : '<div class=\'cv-dots\'><span></span><span></span><span></span></div>'"/>
            </div>
          </div>

          <!-- Waiting for first chunk -->
          <div v-else-if="waitingForFirst" class="cv-msg cv-msg--assistant">
            <div class="cv-msg__avatar" aria-hidden="true">🎓</div>
            <div class="cv-msg__body">
              <div class="cv-msg__content">
                <div class="cv-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Curriculum CTA — shown once AI signals readiness -->
        <div v-if="curriculumReady && !isStreaming && !waitingForFirst" class="cv-curriculum-cta">
          <p class="cv-curriculum-cta__text">Your personalised curriculum is ready to generate.</p>
          <button
            class="cv-btn cv-btn--generate"
            :disabled="isGenerating"
            @click="handleGenerate"
            aria-label="Generate and download curriculum as Word document"
          >
            <span v-if="isGenerating" class="cv-spinner" aria-hidden="true"></span>
            <span>{{ isGenerating ? 'Generating…' : '⬇ Generate My Curriculum' }}</span>
          </button>
          <p v-if="downloadError" class="cv-curriculum-cta__error" role="alert">{{ downloadError }}</p>
          <p v-else-if="isFallbackCurriculum" class="cv-curriculum-cta__warn">A simplified curriculum was generated. Click again for a fully structured version.</p>
          <p v-else class="cv-curriculum-cta__note">Downloads as a .docx Word document</p>
        </div>

        <!-- Input -->
        <div class="cv-input-area">
          <div class="cv-input-wrap">
            <label for="cv-input" class="sr-only">Message the AI</label>
            <textarea
              id="cv-input"
              ref="inputEl"
              v-model="inputText"
              class="cv-input"
              placeholder="What do you want to learn? e.g. machine learning, AI for leaders"
              rows="1"
              :disabled="!canSend"
              @keydown="handleKeydown"
              @input="autoResize"
            />
            <button class="cv-send" :disabled="!canSend || !inputText.trim()" @click="sendMessage" aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Tokens (dark default) ──────────────────────── */
.cv {
  --bg0: #0a0a0b; --bg1: #141416; --bg2: #1c1c1f; --bg3: #252528;
  --tx: #f0f0f2;  --tx2: #9898a0; --tx3: #5c5c66;
  --ac: #6366f1;  --ac-glow: rgba(99,102,241,.3); --ac-soft: rgba(99,102,241,.1);
  --ok: #22c55e;  --err: #ef4444; --warn: #f59e0b;
  --bd: rgba(255,255,255,.06); --bd2: rgba(255,255,255,.1);
}
.cv--light {
  --bg0: #f5f5f7; --bg1: #ffffff; --bg2: #e8e8ed; --bg3: #d8d8de;
  --tx: #1a1a1c;  --tx2: #5c5c66; --tx3: #8c8c96;
  --bd: rgba(0,0,0,.08); --bd2: rgba(0,0,0,.12); --ac-soft: rgba(99,102,241,.15);
}

/* ── Shell ──────────────────────────────────────── */
.cv { position: fixed; inset: 0; z-index: 0; display: flex; flex-direction: column; font-family: 'Outfit','Segoe UI',sans-serif; background: var(--bg0); color: var(--tx); overflow: hidden; }
.cv-ambient { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.cv-orb { position: absolute; border-radius: 50%; filter: blur(120px); opacity: .22; }
.cv-orb--1 { width: 500px; height: 500px; background: linear-gradient(135deg,#6366f1,#8b5cf6); top: -200px; right: -100px; }
.cv-orb--2 { width: 400px; height: 400px; background: linear-gradient(135deg,#06b6d4,#3b82f6); bottom: -100px; left: -100px; }
.cv-body { position: relative; z-index: 1; display: flex; flex: 1; min-height: 0; overflow: hidden; }

/* ── Mobile bar ─────────────────────────────────── */
.cv-mobile-bar { display: none; position: relative; z-index: 2; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--bg1); border-bottom: 1px solid var(--bd); flex-shrink: 0; }
.cv-mobile-bar__right { display: flex; gap: 8px; }

/* ── Overlay ────────────────────────────────────── */
.cv-overlay { display: none; }

/* ── Sidebar ────────────────────────────────────── */
.cv-sidebar { width: 280px; flex-shrink: 0; background: var(--bg1); border-right: 1px solid var(--bd); display: flex; flex-direction: column; height: 100%; transition: transform .3s ease, margin-left .3s ease; }
.cv-sidebar--collapsed { transform: translateX(-100%); margin-left: -280px; }
.cv-sidebar__head { padding: 18px 16px; flex-shrink: 0; border-bottom: 1px solid var(--bd); }
.cv-sidebar__body { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; padding: 14px; gap: 12px; }
.cv-sidebar__body::-webkit-scrollbar { width: 4px; }
.cv-sidebar__body::-webkit-scrollbar-thumb { background: var(--bd2); border-radius: 2px; }

/* Logo */
.cv-logo { display: flex; align-items: center; gap: 10px; }
.cv-logo__icon { width: 34px; height: 34px; background: linear-gradient(135deg,var(--ac),#8b5cf6); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.cv-logo__text { font-size: 16px; font-weight: 600; letter-spacing: -.02em; color: var(--tx); }

/* Connection */
.cv-conn { background: var(--bg2); border-radius: 10px; padding: 12px; flex-shrink: 0; }
.cv-conn__row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.cv-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tx3); flex-shrink: 0; transition: all .3s; }
.cv-dot.connected  { background: var(--ok);   box-shadow: 0 0 10px var(--ok); }
.cv-dot.connecting { background: var(--warn);  animation: dot-pulse 1.5s ease-in-out infinite; }
.cv-dot.error      { background: var(--err); }
@keyframes dot-pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
.cv-conn__label { font-size: 13px; color: var(--tx2); font-weight: 500; }
.cv-conn__id { font-family: 'JetBrains Mono','Consolas',monospace; font-size: 11px; color: var(--tx3); word-break: break-all; }

/* Buttons */
.cv-sidebar__btns { display: flex; flex-direction: column; gap: 7px; flex-shrink: 0; }
.cv-btn { padding: 10px 14px; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all .2s; }
.cv-btn--primary  { background: linear-gradient(135deg,var(--ac),#8b5cf6); color: #fff; }
.cv-btn--primary:hover:not(:disabled)  { transform: translateY(-1px); box-shadow: 0 5px 18px var(--ac-glow); }
.cv-btn--secondary { background: var(--bg2); border: 1px solid var(--bd2); color: var(--tx); }
.cv-btn--secondary:hover:not(:disabled) { background: var(--bg3); border-color: var(--ac); }
.cv-btn--ghost { background: transparent; border: 1px solid var(--bd2); color: var(--tx2); }
.cv-btn--ghost:hover:not(:disabled) { background: var(--bg2); color: var(--tx); }
.cv-btn--generate { background: linear-gradient(135deg,#22c55e,#16a34a); color: #fff; padding: 11px 18px; font-size: 14px; }
.cv-btn--generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 18px rgba(34,197,94,.35); }
.cv-btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }

/* Theme */
.cv-theme { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg2); border-radius: 10px; flex-shrink: 0; }
.cv-theme__label { font-size: 13px; font-weight: 500; color: var(--tx2); }
.cv-theme__toggle { position: relative; width: 56px; height: 28px; background: var(--bg3); border: 1px solid var(--bd2); border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0 6px; }
.cv-theme__toggle:hover { border-color: var(--ac); }
.cv-theme__toggle > span:not(.cv-theme__knob) { font-size: 13px; z-index: 1; }
.cv-theme__knob { position: absolute; left: 3px; width: 22px; height: 22px; background: linear-gradient(135deg,var(--ac),#8b5cf6); border-radius: 50%; transition: transform .3s; box-shadow: 0 2px 8px var(--ac-glow); }
.cv-theme__knob--right { transform: translateX(28px); }

/* Models */
.cv-models { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cv-models__title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--tx3); padding: 0 2px; margin-bottom: 8px; flex-shrink: 0; }
.cv-models__empty { color: var(--tx3); font-size: 13px; padding: 6px 2px; }
.cv-model { padding: 9px 10px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; background: transparent; text-align: left; color: var(--tx); font-family: inherit; transition: all .15s; width: 100%; flex-shrink: 0; }
.cv-model:hover { background: var(--bg3); }
.cv-model--active { background: var(--ac-soft); border-color: var(--ac); }
.cv-model__name { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
.cv-model__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.cv-model__provider { font-size: 11px; color: var(--tx3); text-transform: capitalize; }
.cv-model__badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--bg3); color: var(--tx2); }

/* Skeleton */
.cv-skel { padding: 9px 10px; display: flex; flex-direction: column; gap: 5px; }
.cv-skel__line { height: 11px; background: linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 3px; }
.cv-skel__line--short { width: 55%; }
@keyframes shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }

/* ── Main ───────────────────────────────────────── */
.cv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* Chat header (desktop) */
.cv-chat-head { display: flex; align-items: center; gap: 12px; padding: 14px 24px; border-bottom: 1px solid var(--bd); background: rgba(10,10,11,.8); backdrop-filter: blur(20px); flex-shrink: 0; }
.cv--light .cv-chat-head { background: rgba(245,245,247,.9); }
.cv-chat-head__info { flex: 1; min-width: 0; }
.cv-chat-head__title { font-size: 15px; font-weight: 500; color: var(--tx); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cv-chat-head__sub { font-size: 12px; color: var(--tx3); margin: 2px 0 0; }

/* Error bar */
.cv-error-bar { display: flex; align-items: center; gap: 10px; padding: 11px 20px; background: rgba(239,68,68,.12); border-bottom: 1px solid rgba(239,68,68,.3); flex-shrink: 0; }
.cv-error-bar__msg { flex: 1; font-size: 13px; color: var(--err); }
.cv-error-bar__dismiss { background: transparent; border: 1px solid var(--err); color: var(--err); border-radius: 6px; padding: 3px 10px; font-size: 12px; font-family: inherit; cursor: pointer; flex-shrink: 0; }
.cv-error-bar__dismiss:hover { background: rgba(239,68,68,.12); }

/* Messages */
.cv-msgs { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 28px; display: flex; flex-direction: column; gap: 20px; }
.cv-msgs::-webkit-scrollbar { width: 5px; }
.cv-msgs::-webkit-scrollbar-thumb { background: var(--bd2); border-radius: 3px; }

/* Empty state */
.cv-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; gap: 14px; }
.cv-empty__icon { width: 72px; height: 72px; background: var(--bg2); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 30px; margin: 0 auto 6px; }
.cv-empty__title { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0; }
.cv-empty__desc { color: var(--tx2); font-size: 14px; max-width: 360px; line-height: 1.65; margin: 0; }

.cv-start-btn { background: linear-gradient(135deg,var(--ac),#8b5cf6); color: #fff; border: none; border-radius: 10px; padding: 13px 28px; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all .2s; margin-top: 4px; }
.cv-start-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px var(--ac-glow); }

.cv-connecting { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--tx2); font-size: 14px; }
.cv-connecting__dots { display: flex; gap: 5px; }
.cv-connecting__dots span { width: 8px; height: 8px; background: var(--ac); border-radius: 50%; animation: stream-dot 1.4s ease-in-out infinite; }
.cv-connecting__dots span:nth-child(2) { animation-delay: .2s; }
.cv-connecting__dots span:nth-child(3) { animation-delay: .4s; }
.cv-err-state { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--err); font-size: 14px; }

/* Message bubbles */
.cv-msg { display: flex; gap: 12px; max-width: 820px; width: 100%; animation: msg-in .25s ease; }
@keyframes msg-in { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
.cv-msg--user { margin-left: auto; flex-direction: row-reverse; }
.cv-msg__avatar { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }
.cv-msg--assistant .cv-msg__avatar { background: linear-gradient(135deg,var(--ac),#8b5cf6); }
.cv-msg--user     .cv-msg__avatar { background: var(--bg2); border: 1px solid var(--bd2); }
.cv-msg__body { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-width: 100%; }
.cv-msg__content { background: var(--bg1); border: 1px solid var(--bd); border-radius: 14px; padding: 13px 17px; font-size: 14px; line-height: 1.7; word-break: break-word; overflow-wrap: break-word; }
.cv-msg--user .cv-msg__content { background: var(--ac-soft); border-color: rgba(99,102,241,.2); white-space: pre-wrap; }

/* Markdown */
.cv-msg__content :deep(p)            { margin: 0 0 10px; }
.cv-msg__content :deep(p:last-child) { margin-bottom: 0; }
.cv-msg__content :deep(h1),.cv-msg__content :deep(h2),.cv-msg__content :deep(h3) { margin: 16px 0 8px; font-weight: 600; }
.cv-msg__content :deep(h1:first-child),.cv-msg__content :deep(h2:first-child),.cv-msg__content :deep(h3:first-child) { margin-top: 0; }
.cv-msg__content :deep(ul),.cv-msg__content :deep(ol) { margin: 10px 0; padding-left: 22px; }
.cv-msg__content :deep(li) { margin-bottom: 5px; }
.cv-msg__content :deep(code) { font-family: 'JetBrains Mono','Consolas',monospace; font-size:.88em; background: var(--bg0); padding: 2px 5px; border-radius: 4px; border: 1px solid var(--bd); }
.cv-msg__content :deep(pre) { background: var(--bg0); border: 1px solid var(--bd); border-radius: 8px; padding: 14px; margin: 14px 0; overflow-x: auto; }
.cv-msg__content :deep(pre code) { background: transparent; border: none; padding: 0; font-size: 13px; }
.cv-msg__content :deep(blockquote) { border-left: 3px solid var(--ac); background: var(--ac-soft); padding: 10px 14px; margin: 12px 0; border-radius: 0 8px 8px 0; }
.cv-msg__content :deep(a) { color: var(--ac); text-decoration: none; border-bottom: 1px solid transparent; }
.cv-msg__content :deep(a:hover) { border-bottom-color: var(--ac); }
.cv-msg__content :deep(table) { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 13px; }
.cv-msg__content :deep(th),.cv-msg__content :deep(td) { border: 1px solid var(--bd2); padding: 8px 12px; text-align: left; }
.cv-msg__content :deep(th) { background: var(--bg2); font-weight: 600; }
.cv-msg__content :deep(strong) { font-weight: 600; }
.cv-msg__content :deep(hr) { border: none; border-top: 1px solid var(--bd2); margin: 20px 0; }

/* Streaming dots */
.cv-dots,.cv-msg__content :deep(.cv-dots) { display: inline-flex; gap: 4px; padding: 4px 0; }
.cv-dots span,.cv-msg__content :deep(.cv-dots) span { width: 6px; height: 6px; background: var(--ac); border-radius: 50%; animation: stream-dot 1.4s ease-in-out infinite; }
.cv-dots span:nth-child(2),.cv-msg__content :deep(.cv-dots) span:nth-child(2) { animation-delay: .2s; }
.cv-dots span:nth-child(3),.cv-msg__content :deep(.cv-dots) span:nth-child(3) { animation-delay: .4s; }
@keyframes stream-dot { 0%,80%,100%{transform:scale(.6);opacity:.4;} 40%{transform:scale(1);opacity:1;} }

/* Message actions */
.cv-msg__actions { display: flex; gap: 6px; }
.cv-act-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-family: inherit; font-weight: 500; color: var(--tx2); background: var(--bg2); border: 1px solid var(--bd2); border-radius: 7px; cursor: pointer; transition: all .15s; }
.cv-act-btn svg { width: 13px; height: 13px; }
.cv-act-btn:hover { background: var(--bg3); color: var(--tx); border-color: var(--ac); }
.cv-act-btn--copied { background: var(--ok); color: #fff; border-color: var(--ok); }

/* Curriculum CTA */
.cv-curriculum-cta { flex-shrink: 0; padding: 16px 24px; background: rgba(34,197,94,.08); border-top: 1px solid rgba(34,197,94,.2); display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.cv-curriculum-cta__text { font-size: 14px; font-weight: 500; color: var(--ok); margin: 0; }
.cv-curriculum-cta__note { font-size: 12px; color: var(--tx3); margin: 0; }
.cv-curriculum-cta__error { font-size: 13px; color: var(--err); margin: 0; }
.cv-curriculum-cta__warn  { font-size: 13px; color: var(--warn); margin: 0; }

.cv-spinner { width: 1em; height: 1em; border: 2px solid rgba(255,255,255,.4); border-right-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
@keyframes spin { to{transform:rotate(360deg);} }

/* Input */
.cv-input-area { padding: 18px 28px; background: rgba(10,10,11,.9); backdrop-filter: blur(20px); border-top: 1px solid var(--bd); flex-shrink: 0; }
.cv--light .cv-input-area { background: rgba(245,245,247,.95); }
.cv-input-wrap { display: flex; gap: 10px; max-width: 820px; margin: 0 auto; }
.cv-input { flex: 1; background: var(--bg1); border: 1px solid var(--bd2); border-radius: 10px; padding: 13px 17px; font-family: inherit; font-size: 14px; color: var(--tx); resize: none; min-height: 50px; max-height: 200px; transition: all .2s; }
.cv-input:focus { outline: none; border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-glow); }
.cv-input::placeholder { color: var(--tx3); }
.cv-input:disabled { opacity: .45; cursor: not-allowed; }
.cv-send { width: 50px; height: 50px; background: linear-gradient(135deg,var(--ac),#8b5cf6); border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; align-self: flex-end; transition: all .2s; color: #fff; }
.cv-send svg { width: 18px; height: 18px; }
.cv-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px var(--ac-glow); }
.cv-send:disabled { opacity: .4; cursor: not-allowed; }

/* Icon buttons */
.cv-icon-btn { background: var(--bg2); border: 1px solid var(--bd2); border-radius: 8px; padding: 8px; color: var(--tx); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
.cv-icon-btn svg { width: 18px; height: 18px; }
.cv-icon-btn:hover:not(:disabled) { border-color: var(--ac); background: var(--bg3); }
.cv-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.cv-icon-btn--bare { background: transparent; border: none; }
.cv-icon-btn--bare:hover:not(:disabled) { background: var(--bg2); border: 1px solid var(--bd2); }

/* A11y */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

/* ── Mobile ─────────────────────────────────────── */
@media (max-width: 768px) {
  .cv-mobile-bar { display: flex; }
  .cv-sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 50; transform: translateX(-100%); transition: transform .3s ease; height: 100%; }
  .cv-sidebar--open { transform: translateX(0); }
  .cv-sidebar--collapsed { transform: translateX(-100%); }
  .cv-overlay { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 49; opacity: 0; pointer-events: none; transition: opacity .3s; }
  .cv-overlay--open { opacity: 1; pointer-events: auto; }
  .cv-chat-head { display: none; }
  .cv-msgs { padding: 16px; }
  .cv-input-area { padding: 12px 14px; }
  .cv-msg { max-width: 100%; }
  .cv-curriculum-cta { padding: 14px 16px; }
}
</style>

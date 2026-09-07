<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/stores/ai.js'
import { useContentStore } from '@/stores/content.js'
import { useWebSocket } from '@/composables/useWebSocket.js'
import { useCurriculumBuilder } from '@/composables/useCurriculumBuilder.js'
import { useFocusTrap } from '@/composables/useFocusTrap.js'
import DownloadButton from '@/components/features/DownloadButton.vue'

const { t } = useI18n()
// generateDocx is dynamically imported inside _handleGenerationComplete to defer
// the 341 KB docx chunk until the user actually clicks "Generate My Curriculum"

const aiStore = useAiStore()
const contentStore = useContentStore()
const ws = useWebSocket()
const curriculumBuilder = useCurriculumBuilder()

// ─── Local state ────────────────────────────────────────────────────────────
const inputText = ref('')
const messagesEl = ref(null)
const panelEl = ref(null)
// True between sending a message and receiving the first llm:chunk
const waitingForResponse = ref(false)
// Prevents connecting more than once
const hasConnected = ref(false)
// Curriculum generation state
const isGenerating = ref(false)
const downloadError = ref('')
const isFallbackCurriculum = ref(false)
// Stores the element that opened the panel so focus can be restored on close
let panelTriggerEl = null

// Focus trap — keeps Tab inside the panel when open
const { activate: activatePanelTrap, deactivate: deactivatePanelTrap } = useFocusTrap(panelEl)

// ─── Derived state ──────────────────────────────────────────────────────────
const connectionStatus = computed(() => aiStore.connectionStatus)
const conversationHistory = computed(() => aiStore.conversationHistory)
const isStreaming = computed(() => aiStore.isStreaming)
const streamingContent = computed(() => aiStore.streamingContent)
const errorMessage = computed(() => aiStore.errorMessage)
const isColdStart = computed(() => aiStore.isColdStart)
const panelOpen = computed(() => aiStore.panelOpen)
const curriculumReady = computed(() => aiStore.curriculumReady)
const selectedModel = computed({
  get: () => aiStore.selectedModel,
  set: (val) => aiStore.selectModel(val)
})

// Model display: prefer name property, fall back to ID string
const modelOptions = computed(() =>
  aiStore.availableModels.map((m) =>
    typeof m === 'string' ? { id: m, label: m } : { id: m.id ?? m.name, label: m.name ?? m.id }
  )
)

const canSend = computed(
  () =>
    inputText.value.trim().length > 0 &&
    connectionStatus.value === 'connected' &&
    !isStreaming.value &&
    !waitingForResponse.value
)

const statusColour = computed(() => {
  const map = {
    connected: 'var(--goa-color-success-default)',
    connecting: 'var(--goa-color-warning-default)',
    error: 'var(--goa-color-emergency-default)',
    disconnected: 'var(--goa-color-greyscale-400)',
  }
  return map[connectionStatus.value] ?? map.disconnected
})

const statusLabel = computed(() => {
  const key = `ai.${connectionStatus.value}`
  return t(key, connectionStatus.value)
})

// ─── Prompt builders ─────────────────────────────────────────────────────────
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
      content: `Understood. I have the complete Alberta AI Academy curriculum catalogue with ${itemCount} resources across 3 levels. I will only ever recommend items from this catalogue and will never suggest anything outside it.`
    }
  ]
}

// ─── Actions ─────────────────────────────────────────────────────────────────
function handleOpen() {
  panelTriggerEl = document.activeElement
  aiStore.openPanel()
  if (!hasConnected.value) {
    hasConnected.value = true
    ws.connect()
  }
}

function handleClose() {
  aiStore.closePanel()
  // Restore focus to the element that triggered the panel (the FAB button)
  nextTick(() => {
    if (panelTriggerEl && typeof panelTriggerEl.focus === 'function') {
      panelTriggerEl.focus()
    }
  })
}

function startConversation() {
  const greeting = 'Hello, I would like to build my personalised AI learning curriculum.'
  aiStore.addMessage('user', greeting)
  waitingForResponse.value = true
  ws.sendMessage([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    { role: 'user', content: greeting }
  ])
}

function sendUserMessage() {
  const text = inputText.value.trim()
  if (!text || !canSend.value) return

  aiStore.addMessage('user', text)
  inputText.value = ''
  waitingForResponse.value = true

  // Rebuild full history for the stateless LLM API.
  // Catalogue messages are injected into the conversation body (not just system)
  // so the AI reliably sees the curriculum regardless of backend system-msg handling.
  ws.sendMessage([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    ...aiStore.conversationHistory
  ])
}

function handleInputKeydown(event) {
  // Enter to send; Shift+Enter for newline
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendUserMessage()
  }
}

function retryConnection() {
  // Disconnect first to null out stale socket handlers — prevents orphaned
  // onclose events from triggering spurious _scheduleReconnect() calls
  ws.disconnect()
  aiStore.resetConversation()
  hasConnected.value = false
  ws.connect()
  hasConnected.value = true
}

async function handleGenerate() {
  if (isGenerating.value) return
  isGenerating.value = true
  downloadError.value = ''
  isFallbackCurriculum.value = false

  // Add a friendly visible user message; the full generation prompt goes as the actual payload
  const promptText = curriculumBuilder.buildCurriculumMessage()
  aiStore.addMessage('user', 'Please generate my personalised curriculum.')
  waitingForResponse.value = true

  ws.sendMessage([
    { role: 'system', content: buildSystemPrompt() },
    ...buildCatalogueMessages(),
    // All prior turns, but replace the last user message payload with the generation prompt
    ...aiStore.conversationHistory.slice(0, -1),
    { role: 'user', content: promptText }
  ])

  // Two parallel watchers cover all completion paths:
  // 1. Normal: llm:started sets isStreaming true, llm:done sets it false → streamWatch fires
  // 2. Error-before-stream: llm:error fires without llm:started, isStreaming stays false
  //    (no value change → streamWatch never fires) → errorWatch fires instead
  const stopStreamWatch = watch(
    () => aiStore.isStreaming,
    async (streaming) => {
      if (!streaming) {
        stopStreamWatch()
        stopErrorWatch()
        await _handleGenerationComplete()
      }
    }
  )

  const stopErrorWatch = watch(
    () => aiStore.errorMessage,
    (error) => {
      if (error) {
        stopStreamWatch()
        stopErrorWatch()
        downloadError.value = error
        waitingForResponse.value = false
        isGenerating.value = false
      }
    }
  )
}

async function _handleGenerationComplete() {
  // Always clear waitingForResponse — it may have been skipped by the error-before-stream path
  waitingForResponse.value = false

  // Check for connection error first
  if (aiStore.errorMessage) {
    downloadError.value = aiStore.errorMessage
    isGenerating.value = false
    return
  }

  const lastMsg = aiStore.conversationHistory.at(-1)
  if (!lastMsg || lastMsg.role !== 'assistant') {
    downloadError.value = 'No response received. Please try again.'
    isGenerating.value = false
    return
  }

  const result = curriculumBuilder.parseAndValidate(lastMsg.content)

  let curriculum, resolvedSections

  if (result.ok) {
    curriculum = result.curriculum
    resolvedSections = result.resolvedSections
    // Replace raw JSON in the chat with a friendly confirmation
    lastMsg.content =
      '✓ Your personalised curriculum has been generated! Click the button below to download your Word document.'
  } else {
    console.warn('[AiAssistantPanel] Curriculum JSON parse failed:', result.error, '— using fallback')
    isFallbackCurriculum.value = true
    const fallback = curriculumBuilder.buildFallbackCurriculum(aiStore.conversationHistory)
    curriculum = fallback.curriculum
    resolvedSections = fallback.resolvedSections
    lastMsg.content =
      'I\'ve prepared a summary of your learning recommendations. A simplified curriculum document is ready to download.'
  }

  aiStore.setCurriculum({ ready: true, items: curriculum })

  try {
    const { generateDocx } = await import('@/utils/generateDocx.js')
    const blob = await generateDocx(curriculum, resolvedSections)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `alberta-ai-academy-curriculum-${Date.now()}.docx`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('[AiAssistantPanel] DOCX generation failed:', err)
    downloadError.value = 'Document generation failed. Please try again.'
  } finally {
    isGenerating.value = false
  }
}

// ─── Markdown rendering ──────────────────────────────────────────────────────
// User messages: escape HTML and convert newlines to <br> — no v-html risk
function renderUserMessage(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

// AI messages: full markdown via marked — controlled endpoint, acceptable risk
function renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text)
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

// ─── Auto-scroll ─────────────────────────────────────────────────────────────
async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

// Clear waiting indicator once streaming begins
watch(
  () => aiStore.isStreaming,
  (streaming) => {
    if (streaming) waitingForResponse.value = false
  }
)

// Scroll on every new message or streaming chunk
watch([conversationHistory, streamingContent], scrollToBottom, { deep: true })

// When panel opens: activate focus trap; when it closes: restore focus
watch(panelOpen, (open) => {
  if (open) {
    nextTick(() => {
      activatePanelTrap(panelTriggerEl)
      scrollToBottom()
    })
  } else {
    deactivatePanelTrap()
  }
})
</script>

<template>
  <!-- Floating action button — always visible when panel is closed -->
  <button
    v-show="!panelOpen"
    class="ai-fab"
    :aria-label="t('ai.fabLabel')"
    @click="handleOpen"
  >
    <span aria-hidden="true">🤖</span>
    <span class="ai-fab__label">{{ t('ai.fabLabel') }}</span>
  </button>

  <!-- Panel overlay + drawer -->
  <Transition name="slide-panel">
    <div
      v-if="panelOpen"
      class="ai-panel-overlay"
      @click.self="handleClose"
    >
      <div
        ref="panelEl"
        class="ai-panel"
        role="dialog"
        :aria-label="t('ai.panelTitle')"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc="handleClose"
      >
        <!-- Panel header -->
        <div class="ai-panel__header">
          <div class="ai-panel__status">
            <span
              class="ai-panel__status-dot"
              :style="{ background: statusColour }"
              :aria-label="`Connection status: ${statusLabel}`"
            />
            <span class="ai-panel__title">{{ t('ai.panelTitle') }}</span>
          </div>
          <div class="ai-panel__header-actions">
            <select
              v-if="modelOptions.length > 1"
              v-model="selectedModel"
              class="ai-panel__model-picker"
              aria-label="Select AI model"
            >
              <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
            <button
              class="ai-panel__close"
              :aria-label="t('modal.close')"
              @click="handleClose"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Cold-start banner -->
        <div v-if="isColdStart" class="notification notification--info ai-panel__banner" role="status">
          <span aria-hidden="true">☕</span>
          <span>Waking up the AI… this may take 30–60 seconds on first connection.</span>
        </div>

        <!-- Error banner -->
        <div
          v-if="errorMessage"
          class="notification notification--error ai-panel__banner"
          role="alert"
        >
          <span>{{ errorMessage }}</span>
          <button class="ai-panel__banner-dismiss" @click="retryConnection" :aria-label="t('ai.retry')">
            {{ t('ai.retry') }}
          </button>
        </div>

        <!-- Conversation area -->
        <div class="ai-panel__messages" ref="messagesEl" aria-live="polite" aria-label="Conversation" @click="handleMessageClick">

          <!-- Empty state: connect prompt -->
          <div
            v-if="conversationHistory.length === 0 && !isStreaming && !waitingForResponse"
            class="ai-panel__empty"
          >
            <p class="ai-panel__empty-icon" aria-hidden="true">🎓</p>
            <p class="ai-panel__empty-text">
              Tell me what you want to learn — I'll recommend resources from the Academy and build a personalised curriculum you can download as a Word document.
            </p>
            <button
              v-if="connectionStatus === 'connected'"
              class="btn btn--primary"
              @click="startConversation"
            >
              {{ t('ai.letsGetStarted') }}
            </button>
            <div v-else-if="connectionStatus === 'connecting'" class="ai-panel__connecting">
              <span class="spinner" :aria-label="t('ai.connecting')" />
              <span>{{ t('ai.connectingToAI') }}</span>
            </div>
            <button
              v-else-if="connectionStatus === 'disconnected'"
              class="btn btn--secondary"
              @click="ws.connect(); hasConnected = true"
            >
              Connect
            </button>
          </div>

          <!-- Conversation messages -->
          <div
            v-for="(msg, idx) in conversationHistory"
            :key="idx"
            class="ai-message"
            :class="`ai-message--${msg.role}`"
          >
            <div
              class="ai-message__content"
              v-html="msg.role === 'user' ? renderUserMessage(msg.content) : renderMarkdown(msg.content)"
            />
          </div>

          <!-- Streaming message (in-progress AI response) -->
          <div v-if="isStreaming" class="ai-message ai-message--assistant ai-message--streaming">
            <div class="ai-message__content" v-html="renderMarkdown(streamingContent || '…')" />
            <span class="ai-panel__cursor" aria-hidden="true" />
          </div>

          <!-- Thinking indicator (sent message, waiting for first chunk) -->
          <div v-else-if="waitingForResponse" class="ai-message ai-message--assistant">
            <div class="ai-panel__thinking" aria-label="AI is thinking">
              <span class="ai-panel__thinking-dot" />
              <span class="ai-panel__thinking-dot" />
              <span class="ai-panel__thinking-dot" />
            </div>
          </div>
        </div>

        <!-- Curriculum CTA — shown once AI signals readiness -->
        <DownloadButton
          v-if="curriculumReady && !isStreaming"
          :is-generating="isGenerating"
          :has-error="!!downloadError"
          :error-message="downloadError"
          :is-fallback="isFallbackCurriculum"
          @generate="handleGenerate"
        />

        <!-- Input row -->
        <div class="ai-panel__input-row">
          <label for="ai-input" class="sr-only">Message to AI assistant</label>
          <textarea
            id="ai-input"
            v-model="inputText"
            class="ai-panel__input"
            :placeholder="t('ai.inputPlaceholder')"
            rows="2"
            :disabled="connectionStatus !== 'connected' || isStreaming || waitingForResponse"
            @keydown="handleInputKeydown"
          />
          <button
            class="btn btn--primary ai-panel__send-btn"
            :disabled="!canSend"
            :aria-label="t('ai.send')"
            @click="sendUserMessage"
          >
            Send
          </button>
        </div>

        <!-- Status bar -->
        <div class="ai-panel__status-bar" aria-hidden="true">
          <span :style="{ color: statusColour }">● {{ statusLabel }}</span>
          <span v-if="connectionStatus === 'connected' && conversationHistory.length > 0">
            {{ conversationHistory.filter(m => m.role !== 'system').length }} {{ t('ai.messages') }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Floating action button ─────────────────────────────────── */
.ai-fab {
  position: fixed;
  bottom: var(--goa-space-xl);
  right: var(--goa-space-xl);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: var(--goa-space-xs);
  padding: var(--goa-space-m) var(--goa-space-l);
  background: var(--goa-color-interactive-default);
  color: var(--goa-color-text-light);
  border: none;
  border-radius: 999px;
  font-size: var(--goa-font-size-3);
  font-weight: var(--goa-font-weight-bold);
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--goa-shadow-400);
  transition: background var(--goa-transition-fast), transform var(--goa-transition-fast),
    box-shadow var(--goa-transition-fast);
}

.ai-fab:hover {
  background: var(--goa-color-interactive-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.ai-fab:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 2px;
}

.ai-fab__label {
  font-size: var(--goa-font-size-2);
}

@media screen and (max-width: 480px) {
  .ai-fab {
    bottom: var(--goa-space-l);
    right: var(--goa-space-l);
  }

  .ai-fab__label {
    display: none;
  }
}

/* ── Panel overlay ──────────────────────────────────────────── */
.ai-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 500;
  display: flex;
  justify-content: flex-end;
}

/* ── Panel drawer ───────────────────────────────────────────── */
.ai-panel {
  background: var(--goa-color-greyscale-white);
  width: min(480px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: var(--goa-shadow-400);
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────── */
.ai-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--goa-space-m);
  padding: var(--goa-space-m) var(--goa-space-l);
  background: var(--goa-color-brand-default);
  color: var(--goa-color-text-light);
  flex-shrink: 0;
}

.ai-panel__status {
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
}

.ai-panel__status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background var(--goa-transition-base);
}

.ai-panel__title {
  font-size: var(--goa-font-size-4);
  font-weight: var(--goa-font-weight-bold);
  color: var(--goa-color-text-light);
}

.ai-panel__header-actions {
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
}

.ai-panel__model-picker {
  font-size: var(--goa-font-size-1);
  background: rgba(255, 255, 255, 0.15);
  color: var(--goa-color-text-light);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--goa-border-radius-m);
  padding: var(--goa-space-2xs) var(--goa-space-xs);
  cursor: pointer;
  max-width: 160px;
}

.ai-panel__model-picker option {
  background: var(--goa-color-greyscale-900);
  color: var(--goa-color-text-light);
}

.ai-panel__close {
  background: transparent;
  border: none;
  color: var(--goa-color-text-light);
  font-size: 1.1rem;
  cursor: pointer;
  padding: var(--goa-space-xs);
  border-radius: var(--goa-border-radius-m);
  line-height: 1;
  opacity: 0.8;
  transition: opacity var(--goa-transition-fast);
}

.ai-panel__close:hover {
  opacity: 1;
}

.ai-panel__close:focus-visible {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 2px;
}

/* ── Banners ────────────────────────────────────────────────── */
.ai-panel__banner {
  flex-shrink: 0;
  border-radius: 0;
  border-left: none;
  border-bottom: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
  font-size: var(--goa-font-size-2);
  padding: var(--goa-space-s) var(--goa-space-l);
}

.ai-panel__banner-dismiss {
  margin-left: auto;
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  border-radius: var(--goa-border-radius-m);
  padding: var(--goa-space-2xs) var(--goa-space-s);
  cursor: pointer;
  font-size: var(--goa-font-size-1);
  font-family: inherit;
}

/* ── Messages ───────────────────────────────────────────────── */
.ai-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--goa-space-l);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-m);
  scroll-behavior: smooth;
}

/* ── Empty state ────────────────────────────────────────────── */
.ai-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--goa-space-l);
  padding: var(--goa-space-2xl) var(--goa-space-l);
}

.ai-panel__empty-icon {
  font-size: 3rem;
  margin: 0;
}

.ai-panel__empty-text {
  color: var(--goa-color-text-secondary);
  line-height: var(--goa-line-height-3);
  max-width: 36ch;
  margin: 0;
}

.ai-panel__connecting {
  display: flex;
  align-items: center;
  gap: var(--goa-space-s);
  color: var(--goa-color-text-secondary);
  font-size: var(--goa-font-size-3);
}

/* ── Chat bubbles ───────────────────────────────────────────── */
.ai-message {
  display: flex;
  flex-direction: column;
  max-width: 88%;
}

.ai-message--user {
  align-self: flex-end;
  align-items: flex-end;
}

.ai-message--assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.ai-message__content {
  padding: var(--goa-space-s) var(--goa-space-m);
  border-radius: var(--goa-border-radius-l);
  font-size: var(--goa-font-size-3);
  line-height: var(--goa-line-height-3);
  word-break: break-word;
}

.ai-message--user .ai-message__content {
  background: var(--goa-color-interactive-default);
  color: var(--goa-color-text-light);
  border-bottom-right-radius: 4px;
}

.ai-message--assistant .ai-message__content {
  background: var(--goa-color-greyscale-50);
  color: var(--goa-color-text-default);
  border-bottom-left-radius: 4px;
  border: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
}

/* Markdown inside assistant messages */
.ai-message--assistant .ai-message__content :deep(p) {
  margin: 0 0 var(--goa-space-s) 0;
}

.ai-message--assistant .ai-message__content :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-message--assistant .ai-message__content :deep(ul),
.ai-message--assistant .ai-message__content :deep(ol) {
  margin: var(--goa-space-xs) 0 var(--goa-space-s) var(--goa-space-l);
  padding: 0;
}

.ai-message--assistant .ai-message__content :deep(li) {
  margin-bottom: var(--goa-space-2xs);
}

.ai-message--assistant .ai-message__content :deep(strong) {
  font-weight: var(--goa-font-weight-bold);
}

.ai-message--assistant .ai-message__content :deep(a) {
  color: var(--goa-color-interactive-default);
  text-decoration: underline;
  cursor: pointer;
}

.ai-message--assistant .ai-message__content :deep(a:hover) {
  color: var(--goa-color-interactive-hover);
}

.ai-message--assistant .ai-message__content :deep(h1),
.ai-message--assistant .ai-message__content :deep(h2),
.ai-message--assistant .ai-message__content :deep(h3) {
  margin: var(--goa-space-s) 0 var(--goa-space-xs) 0;
  font-size: var(--goa-font-size-4);
}

/* Streaming cursor blink */
.ai-panel__cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--goa-color-text-default);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 0.8s step-end infinite;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* Thinking dots */
.ai-panel__thinking {
  display: flex;
  gap: var(--goa-space-xs);
  padding: var(--goa-space-s) var(--goa-space-m);
  background: var(--goa-color-greyscale-50);
  border: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  border-radius: var(--goa-border-radius-l);
  border-bottom-left-radius: 4px;
}

.ai-panel__thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--goa-color-greyscale-400);
  animation: thinking-bounce 1.2s ease-in-out infinite;
}

.ai-panel__thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.ai-panel__thinking-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinking-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%            { transform: translateY(-6px); background: var(--goa-color-brand-default); }
}

/* ── Input row ──────────────────────────────────────────────── */
.ai-panel__input-row {
  flex-shrink: 0;
  display: flex;
  gap: var(--goa-space-s);
  padding: var(--goa-space-m) var(--goa-space-l);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  background: var(--goa-color-greyscale-white);
}

.ai-panel__input {
  flex: 1;
  padding: var(--goa-space-s) var(--goa-space-m);
  border: var(--goa-border-width-m) solid var(--goa-color-greyscale-300);
  border-radius: var(--goa-border-radius-l);
  font-family: inherit;
  font-size: var(--goa-font-size-3);
  line-height: var(--goa-line-height-3);
  resize: none;
  transition: border-color var(--goa-transition-fast);
}

.ai-panel__input:focus {
  outline: 3px solid var(--goa-color-interactive-focus);
  outline-offset: 1px;
  border-color: var(--goa-color-interactive-default);
}

.ai-panel__input::placeholder {
  color: var(--goa-color-greyscale-400);
  font-size: var(--goa-font-size-2);
}

.ai-panel__input:disabled {
  background: var(--goa-color-greyscale-50);
  color: var(--goa-color-greyscale-400);
  cursor: not-allowed;
}

.ai-panel__send-btn {
  align-self: flex-end;
  padding: var(--goa-space-s) var(--goa-space-l);
  flex-shrink: 0;
}

/* ── Status bar ─────────────────────────────────────────────── */
.ai-panel__status-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  padding: var(--goa-space-xs) var(--goa-space-l);
  background: var(--goa-color-greyscale-50);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
}

/* ── Slide-in transition ────────────────────────────────────── */
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: opacity var(--goa-transition-base);
}

.slide-panel-enter-active .ai-panel,
.slide-panel-leave-active .ai-panel {
  transition: transform var(--goa-transition-base);
}

.slide-panel-enter-from,
.slide-panel-leave-to {
  opacity: 0;
}

.slide-panel-enter-from .ai-panel,
.slide-panel-leave-to .ai-panel {
  transform: translateX(100%);
}
</style>

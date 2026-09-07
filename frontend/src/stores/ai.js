import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * @typedef {'disconnected'|'connecting'|'connected'|'error'} ConnectionStatus
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 */

export const useAiStore = defineStore('ai', () => {
  /** @type {import('vue').Ref<ConnectionStatus>} */
  const connectionStatus = ref('disconnected')

  /** @type {import('vue').Ref<string|null>} */
  const connectionId = ref(null)

  /** @type {import('vue').Ref<string|null>} */
  const selectedModel = ref(null)

  /** @type {import('vue').Ref<Array>} */
  const availableModels = ref([])

  /** @type {import('vue').Ref<ChatMessage[]>} */
  const conversationHistory = ref([])

  /** @type {import('vue').Ref<boolean>} */
  const isStreaming = ref(false)

  /** @type {import('vue').Ref<string>} */
  const streamingContent = ref('')

  /** @type {import('vue').Ref<string|null>} */
  const errorMessage = ref(null)

  /** @type {import('vue').Ref<boolean>} */
  const panelOpen = ref(false)

  /** @type {import('vue').Ref<boolean>} */
  const isColdStart = ref(false)

  /** @type {import('vue').Ref<boolean>} */
  const curriculumReady = ref(false)

  /** @type {import('vue').Ref<Object|null>} */
  const generatedCurriculum = ref(null)

  const isConnected = computed(() => connectionStatus.value === 'connected')
  const isConnecting = computed(() => connectionStatus.value === 'connecting')
  const hasError = computed(() => connectionStatus.value === 'error')

  function setConnectionStatus(status) {
    connectionStatus.value = status
    if (status !== 'error') {
      errorMessage.value = null
    }
    if (status === 'connected') {
      isColdStart.value = false
    }
  }

  function setColdStart(val) {
    isColdStart.value = val
  }

  function setConnectionId(id) {
    connectionId.value = id
  }

  function setModels(models) {
    availableModels.value = models
    // Auto-select first model that is explicitly available: true
    if (!selectedModel.value && models.length > 0) {
      const first = models.find((m) => m.available === true) ?? models[0]
      selectedModel.value = first.id ?? first.name ?? first
    }
  }

  function selectModel(modelId) {
    selectedModel.value = modelId
  }

  function addMessage(role, content) {
    conversationHistory.value.push({ role, content })
  }

  function setStreaming(streaming) {
    isStreaming.value = streaming
    if (streaming) {
      streamingContent.value = ''
    }
  }

  function appendStreamingChunk(chunk) {
    streamingContent.value += chunk
  }

  function finaliseStreaming() {
    if (streamingContent.value) {
      addMessage('assistant', streamingContent.value)
    }
    streamingContent.value = ''
    isStreaming.value = false
  }

  function setError(message) {
    connectionStatus.value = 'error'
    errorMessage.value = message
    isStreaming.value = false
  }

  function openPanel() {
    panelOpen.value = true
  }

  function closePanel() {
    panelOpen.value = false
  }

  function setCurriculum(curriculum) {
    generatedCurriculum.value = curriculum
    curriculumReady.value = true
  }

  function resetConversation() {
    conversationHistory.value = []
    streamingContent.value = ''
    isStreaming.value = false
    curriculumReady.value = false
    generatedCurriculum.value = null
    errorMessage.value = null
    isColdStart.value = false
  }

  return {
    connectionStatus,
    connectionId,
    selectedModel,
    availableModels,
    conversationHistory,
    isStreaming,
    streamingContent,
    errorMessage,
    panelOpen,
    isColdStart,
    curriculumReady,
    generatedCurriculum,
    isConnected,
    isConnecting,
    hasError,
    setConnectionStatus,
    setConnectionId,
    setColdStart,
    setModels,
    selectModel,
    addMessage,
    setStreaming,
    appendStreamingChunk,
    finaliseStreaming,
    setError,
    openPanel,
    closePanel,
    setCurriculum,
    resetConversation
  }
})

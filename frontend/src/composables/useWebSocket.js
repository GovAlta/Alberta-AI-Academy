import { onUnmounted } from 'vue'
import { useAiStore } from '@/stores/ai.js'
import { useContentStore } from '@/stores/content.js'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'wss://dev-charitydata-ca-data-system-8f3239ff.onrender.com/ws'
const REST_URL = import.meta.env.VITE_API_URL ?? 'https://dev-charitydata-ca-data-system-8f3239ff.onrender.com'
const IS_MOCK = import.meta.env.VITE_WS_MOCK === 'true'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000]
const COLD_START_MS = 5000
const PING_INTERVAL_MS = 25000

export function useWebSocket() {
  const aiStore = useAiStore()
  const contentStore = useContentStore()

  let ws = null
  let reconnectAttempt = 0
  let reconnectTimer = null
  let coldStartTimer = null
  let pingInterval = null
  // Track whether a disconnect was intentional so we don't auto-reconnect
  let intentionalDisconnect = false

  // ─── Public API ────────────────────────────────────────────────────────────

  function connect() {
    if (IS_MOCK) {
      _connectMock()
      return
    }

    intentionalDisconnect = false
    aiStore.setConnectionStatus('connecting')

    // Cold-start detection: Render.com free-tier can take 30–60 s to wake
    coldStartTimer = setTimeout(() => {
      if (aiStore.connectionStatus === 'connecting') {
        aiStore.setColdStart(true)
      }
    }, COLD_START_MS)

    try {
      ws = new WebSocket(WS_URL)
    } catch (err) {
      _handleConnectionFailed()
      return
    }

    ws.onopen = () => {
      // Server sends connection:welcome after TCP open — wait for that event
    }

    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        console.warn('[WS] Non-JSON message received:', event.data)
        return
      }
      _handleMessage(msg)
    }

    ws.onerror = () => {
      // onerror always precedes onclose; actual cleanup happens in onclose
    }

    ws.onclose = () => {
      clearInterval(pingInterval)
      pingInterval = null
      if (!intentionalDisconnect && aiStore.connectionStatus !== 'error') {
        _scheduleReconnect()
      }
    }
  }

  function disconnect() {
    intentionalDisconnect = true
    reconnectAttempt = 0  // reset so a subsequent connect() gets a full 5 fresh attempts
    _clearTimers()
    if (ws) {
      // Null out handlers before closing so stale onclose/onerror callbacks
      // cannot fire after intentionalDisconnect is reset by a subsequent connect()
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
      ws = null
    }
    aiStore.setConnectionStatus('disconnected')
  }

  /**
   * Send the full conversation to the LLM endpoint.
   * @param {Array<{role:string,content:string}>} messages  Full message array including system prompt
   */
  function sendMessage(messages) {
    if (IS_MOCK) {
      _sendMessageMock(messages)
      return
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      aiStore.setError('Not connected. Please wait for the connection to re-establish.')
      return
    }
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    _send({ type: 'llm:start', taskId, model: aiStore.selectedModel, messages })
  }

  async function fetchModels() {
    if (IS_MOCK) return
    try {
      const resp = await fetch(`${REST_URL}/api/v1/llm/models`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      // API may return: array | { models: [] } | { data: { models: [] } }
      const raw = data.data?.models ?? data.models ?? (Array.isArray(data) ? data : [])
      // Only surface models the backend has actually configured
      const models = raw.filter(m => m.available === true)
      aiStore.setModels(models.length ? models : raw)
    } catch (err) {
      console.warn('[WS] fetchModels failed:', err.message)
      // Fallback so the UI is not blocked — default to known working model
      aiStore.setModels(['claude-sonnet-4-6'])
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }

  function _handleMessage(msg) {
    switch (msg.type) {
      case 'connection:welcome':
        _clearTimers()
        reconnectAttempt = 0
        aiStore.setConnectionId(msg.connectionId ?? msg.id ?? null)
        aiStore.setConnectionStatus('connected')
        // Keepalive ping
        pingInterval = setInterval(() => _send({ type: 'ping' }), PING_INTERVAL_MS)
        // Fetch available models now that we're connected
        fetchModels()
        break

      case 'llm:started':
        aiStore.setStreaming(true)
        break

      case 'llm:chunk':
        aiStore.appendStreamingChunk(msg.content ?? msg.chunk ?? '')
        break

      case 'llm:done':
        aiStore.finaliseStreaming()
        // Detect [READY_TO_GENERATE] signal from AI — show the curriculum CTA
        {
          const lastMsg = aiStore.conversationHistory.at(-1)
          if (lastMsg?.content?.includes('[READY_TO_GENERATE]')) {
            // Strip signal token from visible message text
            lastMsg.content = lastMsg.content.replace('[READY_TO_GENERATE]', '').trim()
            // { ready: true, items: null } = offered but not yet generated;
            // Phase 4 overwrites this with the real parsed curriculum object
            aiStore.setCurriculum({ ready: true, items: null })
          }
        }
        break

      case 'llm:error':
        aiStore.setError(msg.error ?? msg.message ?? 'The AI encountered an error. Please try again.')
        break

      case 'llm:cancelled':
        aiStore.setStreaming(false)
        break

      case 'pong':
        // Keepalive acknowledged — no action needed
        break

      default:
        console.debug('[WS] Unhandled message type:', msg.type)
    }
  }

  function _handleConnectionFailed() {
    clearTimeout(coldStartTimer)
    coldStartTimer = null
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      aiStore.setError('Unable to connect after multiple attempts. Please refresh the page.')
      return
    }
    _scheduleReconnect()
  }

  function _scheduleReconnect() {
    if (intentionalDisconnect) return
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      aiStore.setError('Connection lost. Please refresh the page to reconnect.')
      return
    }
    const delay = RECONNECT_DELAYS[reconnectAttempt] ?? RECONNECT_DELAYS.at(-1)
    aiStore.setConnectionStatus('connecting')
    reconnectAttempt++
    reconnectTimer = setTimeout(connect, delay)
  }

  function _clearTimers() {
    clearTimeout(coldStartTimer)
    clearTimeout(reconnectTimer)
    clearInterval(pingInterval)
    coldStartTimer = null
    reconnectTimer = null
    pingInterval = null
  }

  // ─── Mock mode ─────────────────────────────────────────────────────────────

  function _connectMock() {
    aiStore.setConnectionStatus('connecting')
    setTimeout(() => {
      aiStore.setConnectionId('mock-conn-id')
      aiStore.setConnectionStatus('connected')
      aiStore.setModels(['claude-sonnet-4-6'])
    }, 600)
  }

  function _sendMessageMock(messages) {
    const userMessages = messages.filter((m) => m.role === 'user')
    const turn = userMessages.length

    aiStore.setStreaming(true)

    const response = _getMockResponse(turn)
    let i = 0
    const interval = setInterval(() => {
      if (i < response.length) {
        aiStore.appendStreamingChunk(response[i])
        i++
      } else {
        clearInterval(interval)
        aiStore.finaliseStreaming()
        // Identical signal-token logic to real mode
        const last = aiStore.conversationHistory.at(-1)
        if (last?.content?.includes('[READY_TO_GENERATE]')) {
          last.content = last.content.replace('[READY_TO_GENERATE]', '').trim()
          aiStore.setCurriculum({ ready: true, items: null })
        }
      }
    }, 15)
  }

  function _getMockResponse(turn) {
    if (turn === 1) {
      return "Hi! I'm your AI learning assistant for the Alberta AI Academy.\n\nI'll ask you a few quick questions to build your personalised curriculum.\n\n**First:** What is your role in the Government of Alberta? For example: policy analyst, program manager, IT specialist, director, or frontline worker."
    }
    if (turn === 2) {
      return "Thanks! How would you describe your current experience with AI tools?\n\n- 🟢 **Beginner** — I've heard of tools like ChatGPT but haven't used AI for work\n- 🟡 **Intermediate** — I use AI tools occasionally and want to go deeper\n- 🔴 **Advanced** — I lead or make decisions about AI strategy or deployment"
    }
    if (turn === 3) {
      return "Got it. Last question: what's your **primary learning goal** right now?\n\n1. **General awareness** — understand what AI is and what it can do for government\n2. **Practical skills** — use AI tools effectively in my day-to-day work\n3. **Strategic leadership** — lead AI adoption, governance, or transformation in my team"
    }
    return "Based on what you've shared, I've put together a learning path that matches your role and goals.\n\nI recommend starting with **Level 1** to build a solid foundation, then progressing through the practical tools in **Level 2**.\n\nWhen you're ready, click **Generate My Curriculum** to download your personalised plan as a Word document. [READY_TO_GENERATE]"
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  onUnmounted(() => {
    disconnect()
  })

  return { connect, disconnect, sendMessage, fetchModels }
}

import { useContentStore } from '@/stores/content.js'

/**
 * Curriculum JSON schema expected from the AI:
 * {
 *   "title": string,
 *   "learnerProfile": string,
 *   "sections": [
 *     {
 *       "title": string,
 *       "rationale": string,
 *       "items": [{ "id": string, "note": string }]
 *     }
 *   ]
 * }
 */

const GENERATION_PROMPT = `Based on our conversation, generate a personalised curriculum as a JSON object.

Return ONLY the JSON object. No explanation, no markdown, no code fences. Your response must begin with { and end with }.

Use this exact schema:
{
  "title": "Personalised title for this learner",
  "learnerProfile": "One-line summary of role, experience level, and learning goal from our conversation",
  "sections": [
    {
      "title": "Section heading",
      "rationale": "1–2 sentences explaining why this section fits this learner",
      "items": [
        { "id": "exact-content-id-from-catalogue", "note": "One sentence personalised reason for this item" }
      ]
    }
  ]
}

Rules:
- Only use IDs that appear in the CURRICULUM CATALOGUE provided earlier in this conversation
- Include 2–4 sections, 2–5 items per section
- Begin your response with { immediately — no preamble, no commentary`

export function useCurriculumBuilder() {
  const contentStore = useContentStore()

  /**
   * Returns the generation prompt string to append to the conversation.
   */
  function buildCurriculumMessage() {
    return GENERATION_PROMPT
  }

  /**
   * 3-strategy JSON parser + schema validation + ID resolution.
   * @param {string} rawText  Raw text from the AI response
   * @returns {{ ok: true, curriculum: Object, resolvedSections: Array }
   *          |{ ok: false, error: string }}
   */
  function parseAndValidate(rawText) {
    // Strategy 1: bare JSON parse
    let parsed = _tryParse(rawText)

    // Strategy 2: extract from ```json...``` code fence
    if (!parsed) {
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fenceMatch) parsed = _tryParse(fenceMatch[1])
    }

    // Strategy 3: greedy extract from first { to last }
    if (!parsed) {
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        parsed = _tryParse(rawText.slice(firstBrace, lastBrace + 1))
      }
    }

    if (!parsed) {
      return { ok: false, error: 'Could not extract valid JSON from AI response' }
    }

    // Schema validation
    if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
      return { ok: false, error: 'Curriculum JSON missing required "title" field' }
    }
    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return { ok: false, error: 'Curriculum JSON missing required "sections" array' }
    }
    for (const section of parsed.sections) {
      if (typeof section.title !== 'string' || !section.title.trim()) {
        return { ok: false, error: 'A section is missing a required "title" field' }
      }
      if (!Array.isArray(section.items) || section.items.length === 0) {
        return { ok: false, error: `Section "${section.title}" has no items` }
      }
    }

    // ID resolution with console warnings for unknown IDs
    const resolvedSections = parsed.sections.map((section) => ({
      ...section,
      resolvedItems: section.items.map((item) => {
        const content = contentStore.getItemById(item.id)
        if (!content) {
          console.warn(`[CurriculumBuilder] Unknown content ID: "${item.id}"`)
        }
        return { ...item, content: content ?? null }
      })
    }))

    return { ok: true, curriculum: parsed, resolvedSections }
  }

  /**
   * Hard fallback: generate a simple transcript-based curriculum when JSON parsing fails.
   * @param {Array<{role:string,content:string}>} conversationHistory
   * @returns {{ ok: true, isFallback: true, curriculum: Object, resolvedSections: [] }}
   */
  function buildFallbackCurriculum(conversationHistory) {
    const assistantMessages = conversationHistory.filter((m) => m.role === 'assistant')
    const transcript = assistantMessages.map((m, i) => `${i + 1}. ${m.content}`).join('\n\n')

    return {
      ok: true,
      isFallback: true,
      curriculum: {
        title: 'Your Alberta AI Academy Learning Journey',
        learnerProfile: 'Personalised recommendations from your AI assistant conversation',
        sections: [
          {
            title: 'Recommendations from Your AI Conversation',
            rationale:
              'The following is a summary of the recommendations made during your conversation with the AI learning assistant.',
            items: [],
            _fallbackTranscript: transcript
          }
        ]
      },
      resolvedSections: []
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  function _tryParse(str) {
    if (!str || typeof str !== 'string') return null
    try {
      const result = JSON.parse(str.trim())
      return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : null
    } catch {
      return null
    }
  }

  return { buildCurriculumMessage, parseAndValidate, buildFallbackCurriculum }
}

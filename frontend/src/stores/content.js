import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import i18n from '@/i18n.js'
import masterclassData from '@/data/masterclass.json'
import level1Data from '@/data/level1.json'
import level2Data from '@/data/level2.json'
import level3Data from '@/data/level3.json'

/** Resolve a possibly-multilingual field to a string for the given locale */
function resolveField(field, locale) {
  if (field == null) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object' && !Array.isArray(field)) {
    return field[locale] || field.en || Object.values(field)[0] || ''
  }
  return String(field)
}

/** Always resolve to English (authoritative) */
function resolveFieldEn(field) {
  return resolveField(field, 'en')
}

/**
 * @typedef {Object} ModuleSectionContentBlock
 * @property {'text'|'list'|'image'|'video'|'quiz'} type - Block type
 * @property {string} [content] - Markdown text (type: text)
 * @property {string[]} [items] - List items (type: list)
 * @property {string} [url] - Media URL (type: image, video)
 * @property {string} [alt] - Alt text (type: image)
 * @property {string} [caption] - Caption (type: video)
 * @property {string} [question] - Quiz question text (type: quiz)
 * @property {string[]} [options] - Quiz answer options (type: quiz)
 * @property {string} [correctAnswer] - Correct option text (type: quiz)
 * @property {string} [explanation] - Answer explanation (type: quiz)
 */

/**
 * @typedef {Object} ModuleSection
 * @property {string} title - Section heading
 * @property {ModuleSectionContentBlock[]} content - Ordered content blocks
 */

/**
 * @typedef {Object} ContentItem
 * @property {string} id - Unique identifier e.g. 'l1-1.1.1'
 * @property {string} title - Display title
 * @property {'video'|'article'|'tool'|'download'|'social'|'link'|'module'} type - Content type
 * @property {string} description - Short description for card view
 * @property {string} longDescription - Full description for detail view
 * @property {string|null} imageUrl - Thumbnail/hero image URL
 * @property {string|null} youtubeId - YouTube video ID (type: video)
 * @property {string|null} url - Primary external URL
 * @property {string|null} downloadUrl - Direct download URL (type: download)
 * @property {string|null} fileType - e.g. 'PDF', 'DOCX'
 * @property {string|null} fileSize - e.g. '2.4 MB'
 * @property {string} source - Author or originating organization
 * @property {string[]} tags - Topic tags
 * @property {string|null} duration - Estimated reading/watch time
 * @property {'beginner'|'intermediate'|'advanced'} difficulty - Difficulty level
 * @property {boolean} featured - Featured item flag
 * @property {number} [day] - Day number within the course schedule
 * @property {string[]} [learningOutcomes] - Learning outcomes (type: module)
 * @property {ModuleSection[]} [sections] - Module sections (type: module)
 */

/**
 * @typedef {Object} DayInfo
 * @property {number} day - Day number
 * @property {string} title - Day title
 */

/**
 * @typedef {Object} Level
 * @property {string} id - Level identifier e.g. 'level1'
 * @property {string} title - Display title
 * @property {string} subtitle - Short subtitle
 * @property {string} description - Full description
 * @property {string} colour - Brand colour hex code
 * @property {string} icon - Emoji icon
 * @property {'beginner'|'intermediate'|'advanced'} difficulty - Difficulty level
 * @property {DayInfo[]} [days] - Day schedule info
 * @property {ContentItem[]} items - Content items for this level
 */

const ALL_LEVELS = [masterclassData, level1Data, level2Data, level3Data]

// ── Locked levels — content greyed out, excluded from AI catalogue ──
// To unlock: remove the level id from this array (e.g. set to [])
export const LOCKED_LEVELS = ['level3']

export const useContentStore = defineStore('content', () => {
  /** @type {import('vue').Ref<Level[]>} */
  const levels = ref(ALL_LEVELS)

  /** Item to display in the global detail modal (null = closed) */
  const modalItem = ref(null)
  /** Level colour for the modal header */
  const modalLevelColour = ref(null)

  function openItemModal(itemId) {
    for (const level of levels.value) {
      const found = level.items.find((item) => item.id === itemId)
      if (found) {
        modalItem.value = found
        modalLevelColour.value = level.colour
        document.body.style.overflow = 'hidden'
        return true
      }
    }
    return false
  }

  function closeItemModal() {
    modalItem.value = null
    modalLevelColour.value = null
    document.body.style.overflow = ''
  }

  /** All content items across all levels, with levelId injected */
  const allItems = computed(() =>
    levels.value.flatMap((level) =>
      level.items.map((item) => ({ ...item, levelId: level.id }))
    )
  )

  /**
   * Get a level by its numeric string ID ('1', '2', '3') or full ID ('level1')
   * @param {string} id
   * @returns {Level|undefined}
   */
  function getLevelById(id) {
    // Try exact match first (handles 'masterclass', 'level1', etc.)
    const exact = levels.value.find((l) => l.id === id)
    if (exact) return exact
    // Fall back to 'level' + id for numeric shorthand ('1' → 'level1')
    return levels.value.find((l) => l.id === `level${id}`)
  }

  /**
   * Get a single content item by its ID across all levels
   * @param {string} itemId
   * @returns {ContentItem|undefined}
   */
  function getItemById(itemId) {
    for (const level of levels.value) {
      const found = level.items.find((item) => item.id === itemId)
      if (found) return { ...found, levelId: level.id }
    }
    return undefined
  }

  /**
   * Search items across a specific level (or all levels) by title/description/tags
   * @param {string} query
   * @param {string|null} levelId - Optional level filter ('level1', etc.)
   * @returns {ContentItem[]}
   */
  function searchItems(query, levelId = null) {
    const q = query.toLowerCase().trim()
    if (!q) return levelId ? getLevelById(levelId)?.items ?? [] : allItems.value

    const source = levelId
      ? (getLevelById(levelId)?.items ?? []).map((item) => ({ ...item, levelId }))
      : allItems.value

    const locale = i18n.global.locale.value
    return source.filter((item) => {
      const title = resolveField(item.title, locale).toLowerCase()
      const desc = resolveField(item.description, locale).toLowerCase()
      const src = resolveField(item.source, locale).toLowerCase()
      const longDesc = resolveField(item.longDescription, locale).toLowerCase()
      const tags = (item.tags || []).map(t => resolveField(t, locale).toLowerCase())
      return (
        title.includes(q) ||
        desc.includes(q) ||
        tags.some((tag) => tag.includes(q)) ||
        src.includes(q) ||
        longDesc.includes(q)
      )
    })
  }

  /**
   * Filter items by content type within a level
   * @param {string} levelId
   * @param {string} type - Content type or 'all'
   * @returns {ContentItem[]}
   */
  function filterByType(levelId, type) {
    const level = getLevelById(levelId)
    if (!level) return []
    if (type === 'all') return level.items
    return level.items.filter((item) => item.type === type)
  }

  /**
   * Build a compact content catalogue for injecting into AI system prompt.
   * Returns only id, title, type, description — no media URLs.
   * @returns {Object} - Keyed by levelId
   */
  /** Returns true if the given levelId (e.g. '2', 'level2', 'masterclass') is locked */
  function isLevelLocked(levelId) {
    const id = String(levelId).match(/^\d+$/) ? `level${levelId}` : String(levelId)
    return LOCKED_LEVELS.includes(id)
  }

  function getCatalogueForAI() {
    return levels.value.filter(level => !LOCKED_LEVELS.includes(level.id)).reduce((acc, level) => {
      acc[level.id] = {
        title: resolveFieldEn(level.title),
        difficulty: level.difficulty,
        items: level.items.map(({ id, title, type, description, tags, duration, source }) => ({
          id,
          title: resolveFieldEn(title),
          type,
          source: resolveFieldEn(source),
          description: resolveFieldEn(description),
          tags: (tags || []).map(t => resolveFieldEn(t)),
          duration: resolveFieldEn(duration),
          link: `/item/${id}`
        }))
      }
      return acc
    }, {})
  }

  return {
    levels,
    allItems,
    modalItem,
    modalLevelColour,
    openItemModal,
    closeItemModal,
    getLevelById,
    getItemById,
    searchItems,
    filterByType,
    getCatalogueForAI,
    isLevelLocked
  }
})

#!/usr/bin/env node
// @ts-check
/**
 * translator.js
 *
 * Translates all content items in the Alberta AI Academy JSON files
 * from English to French (or another target language) using the Claude API.
 *
 * Usage:
 *   node --experimental-vm-modules scripts/translator.js
 *   node scripts/translator.js --file level1
 *   node scripts/translator.js --dry-run
 *   node scripts/translator.js --target fr
 *
 * Note: If the root package.json does not have "type": "module",
 *       rename this file to translator.mjs or run with:
 *       node --input-type=module scripts/translator.js
 *
 * Requires:
 *   - ANTHROPIC_API_KEY environment variable
 *   - npm install @anthropic-ai/sdk (in root or frontend)
 */

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import Anthropic from '@anthropic-ai/sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, '..', 'frontend', 'src', 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 64000
const MAX_RETRIES = 2
const API_DELAY_MS = 500

const FILE_MAP = {
  level1: 'level1.json',
  level2: 'level2.json',
  level3: 'level3.json',
  masterclass: 'masterclass.json',
}

/** Fields on an item that should be translated (non-module-specific). */
const TRANSLATABLE_ITEM_FIELDS = [
  'title',
  'description',
  'longDescription',
  'source',
  'duration',
]

/** Array-of-string fields on an item that should be translated element-wise. */
const TRANSLATABLE_ITEM_ARRAY_FIELDS = [
  'tags',
  'learningOutcomes',
]

/** Fields that must NEVER be modified. */
const NON_TRANSLATABLE_FIELDS = new Set([
  'id', 'type', 'imageUrl', 'youtubeId', 'url', 'downloadUrl',
  'fileType', 'fileSize', 'featured', 'day', 'difficulty',
])

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { file: null, dryRun: false, target: 'fr' }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        opts.file = args[++i]
        if (!FILE_MAP[opts.file]) {
          console.error(`Unknown file: ${opts.file}. Valid: ${Object.keys(FILE_MAP).join(', ')}`)
          process.exit(1)
        }
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--target':
        opts.target = args[++i]
        break
      default:
        console.error(`Unknown argument: ${args[i]}`)
        process.exit(1)
    }
  }

  return opts
}

// ---------------------------------------------------------------------------
// Multilingual helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the value is already a multilingual object with both
 * 'en' and the target language keys.
 */
function isAlreadyTranslated(value, target) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.en === 'string' &&
    typeof value[target] === 'string'
  )
}

/**
 * Returns true if an array element is already a multilingual object.
 */
function isArrayElementTranslated(value, target) {
  return isAlreadyTranslated(value, target)
}

/**
 * Check if an item is already fully translated (title field has en + target).
 */
function isItemTranslated(item, target) {
  return isAlreadyTranslated(item.title, target)
}

// ---------------------------------------------------------------------------
// Extract translatable content from an item
// ---------------------------------------------------------------------------

/**
 * Extracts only the translatable fields from an item into a plain object
 * suitable for sending to the translation API.
 */
function extractTranslatable(item) {
  const extracted = {}

  // Simple string fields
  for (const field of TRANSLATABLE_ITEM_FIELDS) {
    const val = item[field]
    if (typeof val === 'string' && val.trim() !== '') {
      extracted[field] = val
    }
  }

  // Array-of-string fields
  for (const field of TRANSLATABLE_ITEM_ARRAY_FIELDS) {
    const val = item[field]
    if (Array.isArray(val) && val.length > 0) {
      // Only include string elements (skip already-translated objects)
      const strings = val.filter(v => typeof v === 'string')
      if (strings.length > 0) {
        extracted[field] = strings
      }
    }
  }

  // Module-specific: sections
  if (item.type === 'module' && Array.isArray(item.sections)) {
    extracted.sections = extractSections(item.sections)
  }

  return extracted
}

/**
 * Extract translatable content from sections array.
 */
function extractSections(sections) {
  return sections.map(section => {
    const out = {}
    if (typeof section.title === 'string' && section.title.trim() !== '') {
      out.title = section.title
    }
    if (Array.isArray(section.content)) {
      out.content = section.content.map(block => extractBlock(block))
    }
    return out
  })
}

/**
 * Extract translatable fields from a single content block.
 */
function extractBlock(block) {
  const out = { type: block.type } // keep type for structure matching

  switch (block.type) {
    case 'hero':
      copyIfString(out, block, 'badge')
      copyIfString(out, block, 'title')
      copyIfString(out, block, 'titleHighlight')
      copyIfString(out, block, 'subtitle')
      break

    case 'text':
      copyIfString(out, block, 'content')
      break

    case 'highlight':
      copyIfString(out, block, 'label')
      copyIfString(out, block, 'content')
      break

    case 'cards':
      if (Array.isArray(block.items)) {
        out.items = block.items.map(card => {
          const c = {}
          copyIfString(c, card, 'title')
          copyIfString(c, card, 'content')
          return c
        })
      }
      break

    case 'stat':
      copyIfString(out, block, 'heading')
      copyIfString(out, block, 'content')
      break

    case 'list':
      if (Array.isArray(block.items)) {
        out.items = block.items.filter(v => typeof v === 'string')
      }
      break

    case 'quiz':
      copyIfString(out, block, 'question')
      if (Array.isArray(block.options)) {
        out.options = block.options.filter(v => typeof v === 'string')
      }
      copyIfString(out, block, 'correctAnswer')
      copyIfString(out, block, 'explanation')
      break

    case 'image':
      copyIfString(out, block, 'alt')
      break

    case 'video':
      copyIfString(out, block, 'caption')
      break

    default:
      // Unknown block type — skip translatable extraction
      break
  }

  return out
}

function copyIfString(target, source, key) {
  if (typeof source[key] === 'string' && source[key].trim() !== '') {
    target[key] = source[key]
  }
}

// ---------------------------------------------------------------------------
// Merge translations back into the original item
// ---------------------------------------------------------------------------

/**
 * Merges translated content back into the original item, converting
 * plain strings to {en, target} objects.
 */
function mergeTranslation(item, translated, target) {
  // Simple string fields
  for (const field of TRANSLATABLE_ITEM_FIELDS) {
    if (typeof translated[field] === 'string' && typeof item[field] === 'string') {
      item[field] = { en: item[field], [target]: translated[field] }
    }
  }

  // Array-of-string fields
  for (const field of TRANSLATABLE_ITEM_ARRAY_FIELDS) {
    if (Array.isArray(translated[field]) && Array.isArray(item[field])) {
      item[field] = item[field].map((original, i) => {
        if (typeof original === 'string' && typeof translated[field][i] === 'string') {
          return { en: original, [target]: translated[field][i] }
        }
        return original // already translated or type mismatch
      })
    }
  }

  // Module sections
  if (item.type === 'module' && Array.isArray(translated.sections) && Array.isArray(item.sections)) {
    mergeSections(item.sections, translated.sections, target)
  }
}

function mergeSections(origSections, transSections, target) {
  for (let i = 0; i < origSections.length && i < transSections.length; i++) {
    const orig = origSections[i]
    const trans = transSections[i]

    if (typeof trans.title === 'string' && typeof orig.title === 'string') {
      orig.title = { en: orig.title, [target]: trans.title }
    }

    if (Array.isArray(trans.content) && Array.isArray(orig.content)) {
      for (let j = 0; j < orig.content.length && j < trans.content.length; j++) {
        mergeBlock(orig.content[j], trans.content[j], target)
      }
    }
  }
}

function mergeBlock(origBlock, transBlock, target) {
  switch (origBlock.type) {
    case 'hero':
      mergeStringField(origBlock, transBlock, 'badge', target)
      mergeStringField(origBlock, transBlock, 'title', target)
      mergeStringField(origBlock, transBlock, 'titleHighlight', target)
      mergeStringField(origBlock, transBlock, 'subtitle', target)
      break

    case 'text':
      mergeStringField(origBlock, transBlock, 'content', target)
      break

    case 'highlight':
      mergeStringField(origBlock, transBlock, 'label', target)
      mergeStringField(origBlock, transBlock, 'content', target)
      break

    case 'cards':
      if (Array.isArray(origBlock.items) && Array.isArray(transBlock.items)) {
        for (let k = 0; k < origBlock.items.length && k < transBlock.items.length; k++) {
          mergeStringField(origBlock.items[k], transBlock.items[k], 'title', target)
          mergeStringField(origBlock.items[k], transBlock.items[k], 'content', target)
        }
      }
      break

    case 'stat':
      mergeStringField(origBlock, transBlock, 'heading', target)
      mergeStringField(origBlock, transBlock, 'content', target)
      break

    case 'list':
      if (Array.isArray(origBlock.items) && Array.isArray(transBlock.items)) {
        origBlock.items = origBlock.items.map((original, i) => {
          if (typeof original === 'string' && typeof transBlock.items[i] === 'string') {
            return { en: original, [target]: transBlock.items[i] }
          }
          return original
        })
      }
      break

    case 'quiz':
      mergeStringField(origBlock, transBlock, 'question', target)
      if (Array.isArray(origBlock.options) && Array.isArray(transBlock.options)) {
        origBlock.options = origBlock.options.map((original, i) => {
          if (typeof original === 'string' && typeof transBlock.options[i] === 'string') {
            return { en: original, [target]: transBlock.options[i] }
          }
          return original
        })
      }
      mergeStringField(origBlock, transBlock, 'correctAnswer', target)
      mergeStringField(origBlock, transBlock, 'explanation', target)
      break

    case 'image':
      mergeStringField(origBlock, transBlock, 'alt', target)
      break

    case 'video':
      mergeStringField(origBlock, transBlock, 'caption', target)
      break

    default:
      break
  }
}

function mergeStringField(orig, trans, key, target) {
  if (typeof trans[key] === 'string' && typeof orig[key] === 'string') {
    orig[key] = { en: orig[key], [target]: trans[key] }
  }
}

// ---------------------------------------------------------------------------
// Claude API translation
// ---------------------------------------------------------------------------

function buildPrompt(jsonContent, target) {
  const langName = target === 'fr' ? 'French' : target
  return `You are a professional translator for the Government of Alberta's AI Academy educational platform.
Translate the following JSON content from English to ${langName}.

Rules:
- Maintain the exact same JSON structure and keys
- Preserve all markdown formatting (bold, italic, links, headings)
- Keep technical terms that are commonly used in English in the AI/tech domain
- Use formal ${langName} (vous form)
- Do not translate proper nouns (Alberta, Government of Alberta, etc.)
- Return ONLY the JSON object with ${langName} translations, no explanation

${JSON.stringify(jsonContent, null, 2)}`
}

async function translateWithClaude(client, jsonContent, target, retryCount = 0) {
  const prompt = buildPrompt(jsonContent, target)

  // Use streaming to handle large responses that exceed the 10-minute timeout
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
  })

  const response = await stream.finalMessage()

  // Check for truncation (stop_reason !== 'end_turn')
  const wasTruncated = response.stop_reason !== 'end_turn'

  // Extract text content from the response
  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock) {
    throw new Error('No text block in Claude response')
  }

  // Prepend the '{' we used as assistant prefill
  let rawText = '{' + textBlock.text.trim()

  // Strip markdown code fences if present
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    if (wasTruncated && retryCount < MAX_RETRIES) {
      console.warn(`    Response truncated (${response.stop_reason}), retrying (${retryCount + 1}/${MAX_RETRIES})...`)
      await delay(1000)
      return translateWithClaude(client, jsonContent, target, retryCount + 1)
    }
    throw new Error(`Failed to parse Claude response as JSON: ${err.message}\nRaw: ${rawText.slice(0, 500)}`)
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Translate top-level metadata (days array, file-level title/subtitle/description)
// ---------------------------------------------------------------------------

async function translateDays(client, days, target) {
  const toTranslate = days.map(d => {
    const out = {}
    if (typeof d.title === 'string') out.title = d.title
    if (typeof d.description === 'string') out.description = d.description
    return out
  })

  // Only translate if there's something to translate
  const hasContent = toTranslate.some(d => Object.keys(d).length > 0)
  if (!hasContent) return

  console.log('  Translating day metadata...')
  const translated = await translateWithClaude(client, toTranslate, target)

  if (!Array.isArray(translated) || translated.length !== days.length) {
    console.warn('  WARNING: Days translation array length mismatch, skipping days merge')
    return
  }

  for (let i = 0; i < days.length; i++) {
    if (typeof translated[i].title === 'string' && typeof days[i].title === 'string') {
      days[i].title = { en: days[i].title, [target]: translated[i].title }
    }
    if (typeof translated[i].description === 'string' && typeof days[i].description === 'string') {
      days[i].description = { en: days[i].description, [target]: translated[i].description }
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateTranslatedData(original, translated) {
  const errors = []

  if (translated.items.length !== original.items.length) {
    errors.push(`Item count changed: ${original.items.length} → ${translated.items.length}`)
  }

  for (let i = 0; i < Math.min(original.items.length, translated.items.length); i++) {
    const origItem = original.items[i]
    const transItem = translated.items[i]

    if (origItem.id !== transItem.id) {
      errors.push(`Item ${i} ID changed: ${origItem.id} → ${transItem.id}`)
    }

    for (const field of NON_TRANSLATABLE_FIELDS) {
      if (field === 'id') continue // already checked
      const origVal = JSON.stringify(origItem[field])
      const transVal = JSON.stringify(transItem[field])
      if (origVal !== transVal) {
        errors.push(`Item ${origItem.id}: non-translatable field '${field}' changed`)
      }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

async function createBackup(filePath, fileName) {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const backupName = fileName.replace('.json', `-${timestamp}.json`)
  const backupPath = path.join(BACKUP_DIR, backupName)
  await fs.copyFile(filePath, backupPath)
  console.log(`  Backup created: backups/${backupName}`)
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processFile(client, fileName, opts) {
  const filePath = path.join(DATA_DIR, fileName)
  const levelName = fileName.replace('.json', '')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Processing: ${fileName}`)
  console.log('='.repeat(60))

  // Read the file
  let raw
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    console.error(`  ERROR: Could not read ${filePath}: ${err.message}`)
    return { translated: 0, skipped: 0, errors: 1 }
  }

  const data = JSON.parse(raw)

  // Deep clone for validation later
  const originalSnapshot = JSON.parse(raw)

  const items = data.items || []
  let translated = 0
  let skipped = 0
  const failedItems = []

  // Translate day metadata
  if (Array.isArray(data.days) && data.days.length > 0) {
    const daysNeedTranslation = data.days.some(d => typeof d.title === 'string')
    if (daysNeedTranslation) {
      if (!opts.dryRun) {
        try {
          await translateDays(client, data.days, opts.target)
          await delay(API_DELAY_MS)
        } catch (err) {
          console.error(`  ERROR translating days: ${err.message}`)
        }
      } else {
        console.log('  [dry-run] Would translate day metadata')
      }
    }
  }

  // Translate items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const progress = `[${i + 1}/${items.length}]`

    // Skip if already translated
    if (isItemTranslated(item, opts.target)) {
      console.log(`  ${progress} Skipping ${item.id} (already translated)`)
      skipped++
      continue
    }

    // Extract translatable content
    const extractedContent = extractTranslatable(item)

    // Skip if nothing to translate
    if (Object.keys(extractedContent).length === 0) {
      console.log(`  ${progress} Skipping ${item.id} (no translatable content)`)
      skipped++
      continue
    }

    if (opts.dryRun) {
      console.log(`  ${progress} [dry-run] Would translate ${item.id} (${item.type})`)
      translated++
      continue
    }

    console.log(`  ${progress} Translating ${item.id}...`)

    let success = false
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const translatedContent = await translateWithClaude(client, extractedContent, opts.target)
        mergeTranslation(item, translatedContent, opts.target)
        translated++
        success = true
        break
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          console.warn(`  ${progress} Attempt ${attempt + 1} failed for ${item.id}, retrying...`)
          await delay(2000)
        } else {
          console.error(`  ${progress} ERROR translating ${item.id} after ${MAX_RETRIES + 1} attempts: ${err.message}`)
          failedItems.push(item.id)
        }
      }
    }

    // Rate-limit delay
    if (i < items.length - 1) {
      await delay(API_DELAY_MS)
    }
  }

  if (failedItems.length > 0) {
    console.log(`\n  Failed items (${failedItems.length}): ${failedItems.join(', ')}`)
  }

  // Validation and write — write even if some items failed (partial progress is valuable)
  if (!opts.dryRun && translated > 0) {
    console.log('\n  Validating...')
    const validationErrors = validateTranslatedData(originalSnapshot, data)
    if (validationErrors.length > 0) {
      console.error('  VALIDATION ERRORS:')
      validationErrors.forEach(e => console.error(`    - ${e}`))
      console.error('  File will NOT be written due to validation errors.')
      return { translated, skipped, errors: validationErrors.length + failedItems.length }
    }
    console.log('  Validation passed.')

    // Backup and write
    await createBackup(filePath, fileName)
    const output = JSON.stringify(data, null, 2) + '\n'
    await fs.writeFile(filePath, output, 'utf-8')
    console.log(`  Written: ${filePath}`)
  }

  return { translated, skipped, errors: failedItems.length }
}

async function main() {
  const opts = parseArgs(process.argv)

  console.log('Alberta AI Academy — Content Translator')
  console.log(`Target language: ${opts.target}`)
  if (opts.dryRun) console.log('Mode: DRY RUN (no files will be written)')
  console.log()

  // Validate API key
  if (!opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.')
    console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...')
    process.exit(1)
  }

  // Initialize Anthropic client
  const client = opts.dryRun ? null : new Anthropic()

  // Determine which files to process
  const filesToProcess = opts.file
    ? { [opts.file]: FILE_MAP[opts.file] }
    : FILE_MAP

  const totals = { translated: 0, skipped: 0, errors: 0, filesWritten: 0 }

  for (const [key, fileName] of Object.entries(filesToProcess)) {
    const result = await processFile(client, fileName, opts)
    totals.translated += result.translated
    totals.skipped += result.skipped
    totals.errors += result.errors
    if (result.translated > 0 && result.errors === 0 && !opts.dryRun) {
      totals.filesWritten++
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`  Items translated: ${totals.translated}`)
  console.log(`  Items skipped:    ${totals.skipped}`)
  console.log(`  Errors:           ${totals.errors}`)
  if (!opts.dryRun) {
    console.log(`  Files written:    ${totals.filesWritten}`)
  }
  console.log()

  if (totals.errors > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

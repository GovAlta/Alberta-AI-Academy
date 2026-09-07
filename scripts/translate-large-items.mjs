#!/usr/bin/env node
/**
 * translate-large-items.mjs
 *
 * Handles the 2 remaining large modules that are too big for a single API call.
 * Translates them section-by-section, then merges results.
 *
 * Usage: node scripts/translate-large-items.mjs
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import Anthropic from '@anthropic-ai/sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '..', 'frontend', 'src', 'data')
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 16384
const TARGET = 'fr'

const client = new Anthropic()

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function buildPrompt(json) {
  return `You are a professional translator for the Government of Alberta's AI Academy educational platform.
Translate the following JSON content from English to French.

Rules:
- Maintain the exact same JSON structure and keys
- Preserve all markdown formatting (bold, italic, links, headings)
- Keep technical terms commonly used in English in the AI/tech domain
- Use formal French (vous form)
- Do not translate proper nouns (Alberta, Government of Alberta, etc.)
- Return ONLY the JSON object with French translations, no explanation

${JSON.stringify(json, null, 2)}`
}

async function callClaude(json) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'user', content: buildPrompt(json) },
      { role: 'assistant', content: '{' },
    ],
  })
  const resp = await stream.finalMessage()
  const text = '{' + resp.content.find(b => b.type === 'text').text.trim()
  return JSON.parse(text)
}

function makeMulti(en, fr) {
  if (en == null) return en
  if (typeof en === 'string') return { en, fr: fr ?? en }
  return en
}

function makeMultiArr(enArr, frArr) {
  if (!Array.isArray(enArr)) return enArr
  return enArr.map((en, i) => {
    const fr = frArr?.[i]
    if (typeof en === 'string') return { en, fr: fr ?? en }
    return en
  })
}

async function translateItem(filePath, itemId) {
  const raw = await fs.readFile(filePath, 'utf-8')
  const data = JSON.parse(raw)
  const item = data.items.find(i => i.id === itemId)
  if (!item) { console.error(`Item ${itemId} not found`); return }

  console.log(`\nTranslating ${itemId} section-by-section...`)

  // 1. Translate base fields
  const baseFields = {
    title: item.title,
    description: item.description,
    longDescription: item.longDescription,
    source: item.source,
    duration: item.duration,
    tags: item.tags,
    learningOutcomes: item.learningOutcomes,
  }
  // Extract only string values for base fields
  const baseToTranslate = {}
  for (const [k, v] of Object.entries(baseFields)) {
    if (typeof v === 'string' && v) baseToTranslate[k] = v
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') baseToTranslate[k] = v
  }

  console.log('  Translating base fields...')
  try {
    const baseFr = await callClaude(baseToTranslate)
    for (const k of ['title', 'description', 'longDescription', 'source', 'duration']) {
      if (typeof item[k] === 'string' && typeof baseFr[k] === 'string') {
        item[k] = { en: item[k], [TARGET]: baseFr[k] }
      }
    }
    for (const k of ['tags', 'learningOutcomes']) {
      if (Array.isArray(item[k]) && Array.isArray(baseFr[k])) {
        item[k] = makeMultiArr(item[k], baseFr[k])
      }
    }
    console.log('  Base fields done.')
  } catch (e) {
    console.error(`  ERROR on base fields: ${e.message}`)
  }
  await delay(500)

  // 2. Translate each section
  if (item.sections && item.sections.length > 0) {
    for (let sIdx = 0; sIdx < item.sections.length; sIdx++) {
      const sec = item.sections[sIdx]
      console.log(`  Section ${sIdx + 1}/${item.sections.length}: ${typeof sec.title === 'string' ? sec.title.slice(0, 50) : '...'}`)

      // Build section content for translation
      const secContent = { title: sec.title }
      const blocks = []
      for (const block of (sec.content || [])) {
        const b = {}
        switch (block.type) {
          case 'hero': b.badge = block.badge; b.title = block.title; b.titleHighlight = block.titleHighlight; b.subtitle = block.subtitle; break
          case 'text': b.content = block.content; break
          case 'highlight': b.label = block.label; b.content = block.content; break
          case 'cards': b.items = block.items?.map(c => ({ title: c.title, content: c.content })); break
          case 'stat': b.heading = block.heading; b.content = block.content; break
          case 'list': b.items = block.items; break
          case 'quiz': b.question = block.question; b.options = block.options; b.correctAnswer = block.correctAnswer; b.explanation = block.explanation; break
          case 'image': b.alt = block.alt; break
          case 'video': b.caption = block.caption; break
        }
        b._type = block.type
        blocks.push(b)
      }
      secContent.blocks = blocks

      try {
        const secFr = await callClaude(secContent)

        // Merge section title
        if (typeof sec.title === 'string' && typeof secFr.title === 'string') {
          sec.title = { en: sec.title, [TARGET]: secFr.title }
        }

        // Merge blocks
        const frBlocks = secFr.blocks || []
        for (let bIdx = 0; bIdx < (sec.content || []).length && bIdx < frBlocks.length; bIdx++) {
          const block = sec.content[bIdx]
          const fb = frBlocks[bIdx]
          switch (block.type) {
            case 'hero':
              for (const f of ['badge', 'title', 'titleHighlight', 'subtitle']) {
                if (typeof block[f] === 'string' && typeof fb[f] === 'string') block[f] = makeMulti(block[f], fb[f])
              }
              break
            case 'text':
              if (typeof block.content === 'string' && typeof fb.content === 'string') block.content = makeMulti(block.content, fb.content)
              break
            case 'highlight':
              if (typeof block.label === 'string' && typeof fb.label === 'string') block.label = makeMulti(block.label, fb.label)
              if (typeof block.content === 'string' && typeof fb.content === 'string') block.content = makeMulti(block.content, fb.content)
              break
            case 'cards':
              if (block.items && fb.items) {
                for (let ci = 0; ci < block.items.length && ci < fb.items.length; ci++) {
                  if (typeof block.items[ci].title === 'string' && typeof fb.items[ci].title === 'string') block.items[ci].title = makeMulti(block.items[ci].title, fb.items[ci].title)
                  if (typeof block.items[ci].content === 'string' && typeof fb.items[ci].content === 'string') block.items[ci].content = makeMulti(block.items[ci].content, fb.items[ci].content)
                }
              }
              break
            case 'stat':
              if (typeof block.heading === 'string' && typeof fb.heading === 'string') block.heading = makeMulti(block.heading, fb.heading)
              if (typeof block.content === 'string' && typeof fb.content === 'string') block.content = makeMulti(block.content, fb.content)
              break
            case 'list':
              if (block.items && fb.items) block.items = makeMultiArr(block.items, fb.items)
              break
            case 'quiz':
              for (const f of ['question', 'correctAnswer', 'explanation']) {
                if (typeof block[f] === 'string' && typeof fb[f] === 'string') block[f] = makeMulti(block[f], fb[f])
              }
              if (block.options && fb.options) block.options = makeMultiArr(block.options, fb.options)
              break
            case 'image':
              if (typeof block.alt === 'string' && typeof fb.alt === 'string') block.alt = makeMulti(block.alt, fb.alt)
              break
            case 'video':
              if (typeof block.caption === 'string' && typeof fb.caption === 'string') block.caption = makeMulti(block.caption, fb.caption)
              break
          }
        }
        console.log(`    Done.`)
      } catch (e) {
        console.error(`    ERROR: ${e.message.slice(0, 200)}`)
      }
      await delay(500)
    }
  }

  // Write back
  const output = JSON.stringify(data, null, 2) + '\n'
  await fs.writeFile(filePath, output, 'utf-8')
  console.log(`  Written: ${filePath}`)
}

async function main() {
  const targets = [
    { file: 'level1.json', id: 'l1-1.8.2' },
    { file: 'level2.json', id: 'l2-2.2.2' },
  ]

  for (const { file, id } of targets) {
    const filePath = path.join(DATA_DIR, file)
    await translateItem(filePath, id)
  }

  console.log('\nDone!')
}

main().catch(e => { console.error(e); process.exit(1) })

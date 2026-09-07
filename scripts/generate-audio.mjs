#!/usr/bin/env node
/**
 * generate-audio.mjs — Pre-generates MP3 audio files for all academy content.
 *
 * Reads all 4 level JSON files, extracts text from each module section (and
 * article/video longDescriptions), calls ElevenLabs to generate MP3 files,
 * and saves them to frontend/public/audio/{locale}/{itemId}-s{sectionIdx}.mp3.
 *
 * A manifest file (frontend/public/audio/manifest.json) tracks which files
 * have been generated and their content hashes. Re-running only regenerates
 * files whose content has changed.
 *
 * Usage:
 *   npm run generate-audio              # Generate all EN + FR
 *   npm run generate-audio -- --lang en  # English only
 *   npm run generate-audio -- --lang fr  # French only
 *   npm run generate-audio -- --dry-run  # Show what would be generated
 *
 *   npm run generate-audio -- --no-compress  # Keep ElevenLabs' 128 kbps output (not for production)
 *
 * Requires: ELEVENLABS_API_KEY in ../.env, and ffmpeg on PATH.
 *
 * Every file is re-encoded to 48 kbps mono MP3 after download. The site is
 * published on GitHub Pages, which has a hard 1 GB limit per site; at the
 * original 128 kbps the narration alone was 1.6 GB. See scripts/compress-audio.mjs
 * to re-compress files that were generated some other way.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DATA_DIR = resolve(ROOT, 'frontend/src/data')
const AUDIO_DIR = resolve(ROOT, 'frontend/public/audio')
const MANIFEST_PATH = resolve(ROOT, 'frontend/src/data/audio-manifest.json')

// ── Config ──
const VOICE_MALE   = 'pNInz6obpgDQGcFmaJgB' // Adam — male American
const VOICE_FEMALE = 'EXAVITQu4vr4xnSDxMaL' // Sarah — female American
const MODEL_ID = 'eleven_flash_v2_5'
const LOCALES = ['en', 'fr']
const DELAY_MS = 500 // Delay between API calls to respect rate limits
const MAX_TEXT_LENGTH = 5000 // ElevenLabs limit per request
const TARGET_BITRATE = '48k' // Output bitrate after compression (mono) — keeps the Pages site under 1 GB

// ── Load .env ──
function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) { console.error('❌ .env file not found'); process.exit(1) }
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.+)/)
    if (m) process.env[m[1]] = m[2].split('#')[0].trim()
  }
}

loadEnv()
const API_KEY = process.env.ELEVENLABS_API_KEY
if (!API_KEY) { console.error('❌ ELEVENLABS_API_KEY not set in .env'); process.exit(1) }

// ── CLI args ──
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const langFlag = args.indexOf('--lang')
const langFilter = langFlag !== -1 ? [args[langFlag + 1]] : LOCALES
const levelFlag = args.indexOf('--level')
const levelFilter = levelFlag !== -1 ? args[levelFlag + 1] : null
const noCompress = args.includes('--no-compress')

// ffmpeg is required for compression (skip the check on dry runs)
if (!noCompress && !dryRun) {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' })
  if (probe.error || probe.status !== 0) {
    console.error('❌ ffmpeg not found on PATH. Install it (winget install Gyan.FFmpeg) or pass --no-compress.')
    process.exit(1)
  }
}

// ── Helpers ──

function hash(text) {
  return createHash('md5').update(text, 'utf-8').digest('hex').slice(0, 12)
}

/** Resolve a bilingual field to the given locale */
function tc(field, locale) {
  if (field == null) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object') return field[locale] || field.en || Object.values(field)[0] || ''
  return String(field)
}

/** Strip markdown formatting for clean TTS output */
function stripMd(text) {
  if (!text) return ''
  let result = text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/>\s+/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/\n{2,}/g, '. ')
  // Multi-pass HTML tag removal to handle malformed/nested tags
  let prev
  do { prev = result; result = result.replace(/<[^>]*>/g, '') } while (result !== prev)
  return result.trim()
}

/** Extract readable text from a module section */
function extractSectionText(section, locale) {
  if (!section) return ''
  const parts = []
  if (section.title) parts.push(tc(section.title, locale))

  for (const block of (section.content || [])) {
    switch (block.type) {
      case 'hero':
        if (block.title) parts.push(tc(block.title, locale))
        if (block.titleHighlight) parts.push(tc(block.titleHighlight, locale))
        if (block.subtitle) parts.push(tc(block.subtitle, locale))
        break
      case 'text':
        if (block.content) parts.push(stripMd(tc(block.content, locale)))
        break
      case 'list':
        if (block.items) block.items.forEach(li => parts.push(stripMd(tc(li, locale))))
        break
      case 'highlight':
        if (block.label) parts.push(tc(block.label, locale))
        if (block.content) parts.push(stripMd(tc(block.content, locale)))
        break
      case 'cards':
        if (block.items) block.items.forEach(c => {
          if (c.title) parts.push(tc(c.title, locale))
          if (c.content) parts.push(tc(c.content, locale))
        })
        break
      case 'stat':
        if (block.heading) parts.push(tc(block.heading, locale))
        if (block.content) parts.push(stripMd(tc(block.content, locale)))
        break
      case 'quiz':
        if (block.question) parts.push(tc(block.question, locale))
        if (block.options) block.options.forEach((opt, i) => {
          const text = tc(opt, locale)
          // Don't add "A:" prefix if option already starts with "A.", "A)", etc.
          const hasPrefix = /^[A-Da-d][.):\s]/.test(text)
          parts.push(hasPrefix ? text : `${String.fromCharCode(65 + i)}. ${text}`)
        })
        break
      case 'image':
        if (block.alt) parts.push(tc(block.alt, locale))
        break
      case 'video':
        if (block.caption) parts.push(tc(block.caption, locale))
        break
    }
  }
  return parts.filter(Boolean).join('. \n')
}

/** Extract text from a non-module item (article, video, tool, etc.) */
function extractItemText(item, locale) {
  const parts = []
  if (item.title) parts.push(tc(item.title, locale))
  if (item.description) parts.push(stripMd(tc(item.description, locale)))
  if (item.longDescription) parts.push(stripMd(tc(item.longDescription, locale)))
  return parts.filter(Boolean).join('. \n')
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Save manifest to disk — called progressively so crashes don't lose work */
function _saveManifest(manifest) {
  manifest.generated = new Date().toISOString()
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
}

/** Call ElevenLabs API and return MP3 buffer
 * @param {string} text
 * @param {string} voiceId — alternates between VOICE_MALE and VOICE_FEMALE per module
 */
async function generateAudio(text, voiceId = VOICE_MALE) {
  // Truncate if too long
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: truncated,
        model_id: MODEL_ID,
        output_format: 'mp3_44100_128',
        voice_settings: { stability: 0.5, similarity_boost: 0.5, use_speaker_boost: true }
      })
    }
  )

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${res.status}: ${err}`)
  }

  const chunks = []
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const total = chunks.reduce((a, c) => a + c.length, 0)
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { buf.set(c, offset); offset += c.length }
  return compressMp3(Buffer.from(buf))
}

/** Re-encode an MP3 buffer to TARGET_BITRATE mono via ffmpeg (no-op with --no-compress) */
function compressMp3(input) {
  if (noCompress) return input
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-ac', '1', '-ar', '44100', '-b:a', TARGET_BITRATE,
    '-f', 'mp3', 'pipe:1'
  ], { input, maxBuffer: 256 * 1024 * 1024 })
  if (r.error || r.status !== 0 || !r.stdout?.length) {
    throw new Error(`ffmpeg failed: ${r.error?.message || r.stderr?.toString().trim()}`)
  }
  return r.stdout
}

// ── Main ──

async function main() {
  console.log('\n🎙  Alberta AI Academy — Audio Generator\n')
  console.log(`   Model: ${MODEL_ID}`)
  console.log(`   Languages: ${langFilter.join(', ')}`)
  console.log(`   Levels: ${levelFilter || 'all'}`)
  console.log(`   Dry run: ${dryRun}`)
  console.log(`   Force rebuild: ${force}`)
  console.log(`   Compression: ${noCompress ? 'off (128 kbps as delivered)' : TARGET_BITRATE + ' mono via ffmpeg'}\n`)

  // Ensure directories exist
  for (const loc of LOCALES) {
    mkdirSync(resolve(AUDIO_DIR, loc), { recursive: true })
  }

  // Load manifest (or start fresh if --force)
  let manifest = { version: 1, generated: '', voiceId: VOICE_MALE, modelId: MODEL_ID, files: {} }
  if (force) {
    console.log('   ⚠ --force: ignoring existing manifest, regenerating all files\n')
  } else if (existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) } catch (e) { /* fresh start */ }
  }

  // Load level files (filter by --level if provided)
  const ALL_LEVELS = [
    { file: 'level1.json', name: 'Level 1', keys: ['1', 'level1', 'l1'] },
    { file: 'level2.json', name: 'Level 2', keys: ['2', 'level2', 'l2'] },
    { file: 'level3.json', name: 'Level 3', keys: ['3', 'level3', 'l3'] },
    { file: 'masterclass.json', name: 'Masterclass', keys: ['m', 'masterclass', 'mc'] }
  ]

  const levels = levelFilter
    ? ALL_LEVELS.filter(l => l.keys.includes(levelFilter.toLowerCase()))
    : ALL_LEVELS

  if (levels.length === 0) {
    console.error(`❌ Unknown level "${levelFilter}". Use: 1, 2, 3, masterclass, l1, l2, l3, m, mc`)
    process.exit(1)
  }

  let totalGenerated = 0
  let totalSkipped = 0
  let totalErrors = 0
  let itemIndex = 0 // Tracks item order for alternating voices

  for (const level of levels) {
    const data = JSON.parse(readFileSync(resolve(DATA_DIR, level.file), 'utf-8'))
    const items = data.items || []
    console.log(`\n📂 ${level.name} — ${items.length} items`)

    for (const item of items) {
      const id = item.id
      if (!id) continue

      // Alternate voice per item: even = male, odd = female
      const voiceId = itemIndex % 2 === 0 ? VOICE_MALE : VOICE_FEMALE
      const voiceLabel = voiceId === VOICE_MALE ? '♂' : '♀'
      itemIndex++

      if (item.type === 'module' && item.sections?.length > 0) {
        // ── Module: generate per-section (same voice for all sections in a module) ──
        if (!manifest.files[id]) manifest.files[id] = { type: 'module', voiceId, sections: {} }
        else manifest.files[id].voiceId = voiceId

        for (let sIdx = 0; sIdx < item.sections.length; sIdx++) {
          for (const locale of langFilter) {
            const text = extractSectionText(item.sections[sIdx], locale)
            if (!text || text.length < 20) continue // Skip empty/trivial sections

            const h = hash(text)
            const existing = manifest.files[id].sections[sIdx]?.[locale]
            if (existing && existing.hash === h) {
              totalSkipped++
              continue
            }

            const relPath = `/audio/${locale}/${id}-s${sIdx}.mp3`
            const absPath = resolve(ROOT, 'frontend/public', relPath.slice(1))

            if (dryRun) {
              console.log(`   ${voiceLabel} 📝 [dry-run] ${relPath} (${text.length} chars)`)
              totalGenerated++
              continue
            }

            try {
              process.stdout.write(`   ${voiceLabel} 🔊 ${relPath} ...`)
              const mp3 = await generateAudio(text, voiceId)
              writeFileSync(absPath, mp3)

              if (!manifest.files[id].sections[sIdx]) manifest.files[id].sections[sIdx] = {}
              manifest.files[id].sections[sIdx][locale] = { hash: h, file: relPath, size: mp3.length }

              console.log(` ✓ (${(mp3.length / 1024).toFixed(1)} KB)`)
              totalGenerated++
              // Save manifest every 25 files so crashes don't lose progress
              if (totalGenerated % 25 === 0) _saveManifest(manifest)
              await sleep(DELAY_MS)
            } catch (e) {
              console.log(` ✗ ${e.message}`)
              totalErrors++
              await sleep(2000) // Longer delay on error
            }
          }
        }
      } else {
        // ── Non-module: generate per-item (same alternating voice) ──
        if (!manifest.files[id]) manifest.files[id] = { type: item.type, voiceId }
        else manifest.files[id].voiceId = voiceId

        for (const locale of langFilter) {
          const text = extractItemText(item, locale)
          if (!text || text.length < 20) continue

          const h = hash(text)
          const existing = manifest.files[id][locale]
          if (existing && existing.hash === h) {
            totalSkipped++
            continue
          }

          const relPath = `/audio/${locale}/${id}.mp3`
          const absPath = resolve(ROOT, 'frontend/public', relPath.slice(1))

          if (dryRun) {
            console.log(`   ${voiceLabel} 📝 [dry-run] ${relPath} (${text.length} chars)`)
            totalGenerated++
            continue
          }

          try {
            process.stdout.write(`   ${voiceLabel} 🔊 ${relPath} ...`)
            const mp3 = await generateAudio(text, voiceId)
            writeFileSync(absPath, mp3)
            manifest.files[id][locale] = { hash: h, file: relPath, size: mp3.length }
            console.log(` ✓ (${(mp3.length / 1024).toFixed(1)} KB)`)
            totalGenerated++
            if (totalGenerated % 25 === 0) _saveManifest(manifest)
            await sleep(DELAY_MS)
          } catch (e) {
            console.log(` ✗ ${e.message}`)
            totalErrors++
            await sleep(2000)
          }
        }
      }
    }
  }

  // Save manifest (also saved progressively every 50 files — see below)
  manifest.generated = new Date().toISOString()
  manifest.voiceId = VOICE_MALE
  manifest.modelId = MODEL_ID
  _saveManifest(manifest)

  console.log('\n' + '═'.repeat(50))
  console.log(`\n📊 Results:`)
  console.log(`   ✓ Generated: ${totalGenerated}`)
  console.log(`   ⏭ Skipped (unchanged): ${totalSkipped}`)
  console.log(`   ✗ Errors: ${totalErrors}`)
  console.log(`   📄 Manifest: ${MANIFEST_PATH}\n`)
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})

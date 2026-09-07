#!/usr/bin/env node
/**
 * compress-audio.mjs — Re-encodes narration MP3s in frontend/public/audio to
 * 48 kbps mono and refreshes the `size` fields in the audio manifest.
 *
 * generate-audio.mjs already compresses every file it produces. Run this only
 * when audio files were added or replaced some other way (manual upload, an
 * older generator, a different tool) and the site is creeping toward the
 * GitHub Pages 1 GB limit.
 *
 * Usage:
 *   npm run compress-audio               # Re-encode any file above the target bitrate
 *   npm run compress-audio -- --dry-run  # Report what would change
 *   npm run compress-audio -- --all      # Re-encode everything, even files already at target
 *
 * Requires: ffmpeg and ffprobe on PATH.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const AUDIO_DIR = resolve(ROOT, 'frontend/public/audio')
const MANIFEST_PATH = resolve(ROOT, 'frontend/src/data/audio-manifest.json')

const TARGET_BITRATE_K = 48
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')

for (const tool of ['ffmpeg', 'ffprobe']) {
  const r = spawnSync(tool, ['-version'], { encoding: 'utf-8' })
  if (r.error || r.status !== 0) {
    console.error(`❌ ${tool} not found on PATH. Install ffmpeg (winget install Gyan.FFmpeg).`)
    process.exit(1)
  }
}

function listMp3s(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listMp3s(p))
    else if (entry.name.toLowerCase().endsWith('.mp3')) out.push(p)
  }
  return out
}

function bitrateKbps(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=bit_rate', '-of', 'csv=p=0', file], { encoding: 'utf-8' })
  const n = parseInt(r.stdout, 10)
  return Number.isFinite(n) ? Math.round(n / 1000) : null
}

function reencode(file) {
  const tmp = file + '.tmp.mp3'
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', file, '-ac', '1', '-ar', '44100', '-b:a', `${TARGET_BITRATE_K}k`, tmp
  ], { encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(r.stderr.trim() || 'ffmpeg failed')
  renameSync(tmp, file)
}

// Build a lookup of manifest entries by file path so sizes can be refreshed
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
const entriesByPath = new Map()
for (const item of Object.values(manifest.files || {})) {
  for (const loc of ['en', 'fr']) if (item[loc]?.file) entriesByPath.set(item[loc].file, item[loc])
  for (const sec of Object.values(item.sections || {})) {
    for (const loc of ['en', 'fr']) if (sec[loc]?.file) entriesByPath.set(sec[loc].file, sec[loc])
  }
}

let changed = 0, skipped = 0, before = 0, after = 0
for (const file of listMp3s(AUDIO_DIR)) {
  const rel = '/' + relative(resolve(ROOT, 'frontend/public'), file).split(sep).join('/')
  const kbps = bitrateKbps(file)
  const size0 = statSync(file).size
  before += size0
  if (!all && kbps !== null && kbps <= TARGET_BITRATE_K) { skipped++; after += size0; continue }

  if (dryRun) {
    console.log(`  [dry-run] ${rel}  ${kbps ?? '?'} kbps → ${TARGET_BITRATE_K} kbps`)
    changed++; after += size0
    continue
  }
  process.stdout.write(`  🔻 ${rel}  ${kbps ?? '?'} kbps → ${TARGET_BITRATE_K} kbps ...`)
  try {
    reencode(file)
    const size1 = statSync(file).size
    after += size1
    const entry = entriesByPath.get(rel)
    if (entry) entry.size = size1
    console.log(` ✓ ${(size0 / 1048576).toFixed(1)} → ${(size1 / 1048576).toFixed(1)} MB`)
    changed++
  } catch (e) {
    after += size0
    console.log(` ✗ ${e.message}`)
  }
}

if (!dryRun && changed) writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')

console.log(`\n📊 ${changed} re-encoded, ${skipped} already at ≤${TARGET_BITRATE_K} kbps`)
console.log(`   Audio folder: ${(before / 1048576).toFixed(0)} MB → ${(after / 1048576).toFixed(0)} MB${dryRun ? ' (estimate unchanged in dry run)' : ''}`)

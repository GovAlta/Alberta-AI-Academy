# Alberta AI Academy — Frontend

Vue 3 + Vite static site with pre-generated text-to-speech audio for all learning content.

## Quick Start

```bash
cd frontend
npm install
npm run dev          # Start dev server on http://localhost:5173
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

---

## Audio Generation

All module and article audio is pre-generated as MP3 files using ElevenLabs TTS. This avoids per-user API costs and gives instant playback.

### Prerequisites

- `ELEVENLABS_API_KEY` set in the root `.env` file
- Node.js 18+ (uses native `fetch`)

### Commands

All commands are run from the `frontend/` directory:

```bash
npm run generate-audio                          # Generate all levels, EN + FR
npm run generate-audio -- --lang en             # English only
npm run generate-audio -- --lang fr             # French only
npm run generate-audio -- --level masterclass   # Masterclass only
npm run generate-audio -- --level 1             # Level 1 only
npm run generate-audio -- --level 2 --lang en   # Level 2, English only
npm run generate-audio -- --force               # Rebuild ALL files (ignore cache)
npm run generate-audio -- --force --level m     # Force rebuild masterclass only
npm run generate-audio -- --dry-run             # Preview what would be generated
```

### Level aliases

| Level | Aliases |
|-------|---------|
| Level 1 | `1`, `l1`, `level1` |
| Level 2 | `2`, `l2`, `level2` |
| Level 3 | `3`, `l3`, `level3` |
| Masterclass | `m`, `mc`, `masterclass` |

### Flags

| Flag | Description |
|------|-------------|
| `--lang <en\|fr>` | Generate only one language (default: both) |
| `--level <alias>` | Generate only one level (default: all) |
| `--force` | Ignore existing manifest and regenerate all files |
| `--dry-run` | Show what would be generated without calling the API |

### How it works

1. Reads all content from `src/data/level1.json` through `masterclass.json`
2. Extracts readable text from each module section (and article descriptions)
3. Hashes each section's text with MD5
4. Compares hashes against `src/data/audio-manifest.json` — skips unchanged content
5. Calls ElevenLabs API (`eleven_flash_v2_5` model) to generate MP3
6. Saves files to `public/audio/{locale}/{itemId}-s{sectionIndex}.mp3`
7. Updates the manifest with hash, file path, and size
8. Manifest saves every 25 files so crashes don't lose progress

### Output structure

```
frontend/public/audio/
  manifest.json                    # Tracks all files + content hashes
  en/
    l1-1.1.1.mp3                   # Article/video audio
    l1-1.1.7-s0.mp3                # Module section 0
    l1-1.1.7-s1.mp3                # Module section 1
    ...
  fr/
    l1-1.1.1.mp3                   # French article audio
    l1-1.1.7-s0.mp3                # French module section 0
    ...
```

### Voices

Audio alternates between two voices per content item:
- **Adam** (male American) — even-indexed items
- **Sarah** (female American) — odd-indexed items

All sections within a module use the same voice. The voice assignment is stored in the manifest.

### When to regenerate

Run `npm run generate-audio` (without `--force`) after editing any content JSON file. Only changed sections are regenerated — the hash comparison makes re-runs fast and cheap.

Use `--force` only when you want to completely rebuild (e.g., after changing the voice or model).

### Approximate file counts

| Level | Sections (EN) | Sections (FR) | Total |
|-------|---------------|---------------|-------|
| Level 1 | ~200 | ~200 | ~400 |
| Level 2 | ~180 | ~180 | ~360 |
| Level 3 | ~280 | ~280 | ~560 |
| Masterclass | ~67 | ~67 | ~134 |
| **Total** | **~730** | **~730** | **~1,460** |

### Playback

The `AudioPlayer` component loads `manifest.json` once, then looks up pre-generated files by item ID, section index, and locale. If a pre-generated file exists, playback is instant (no API call). If not, it falls back to on-demand ElevenLabs streaming.

---

## Accessibility

The site meets **WCAG 2.1 AA** standards for screen reader compatibility (JAWS, NVDA, VoiceOver).

### Audio player keyboard shortcuts

| Key | Action |
|-----|--------|
| Space / Enter | Play / Pause |
| Left Arrow | Rewind 5 seconds |
| Right Arrow | Forward 5 seconds |
| Shift + Left | Rewind 30 seconds |
| Shift + Right | Forward 30 seconds |
| R | Replay from start |
| Up Arrow | Increase speed |
| Down Arrow | Decrease speed |
| Home | Jump to start |
| End | Jump to end |

### Audio player features

- **Play / Pause / Stop / Replay** — full playback controls
- **Speed control** — 0.75x, 1x, 1.25x, 1.5x, 2x
- **Progress slider** — click to seek, keyboard accessible with `role="slider"`
- **Play Entire Module** — plays all sections as a sequential playlist, starting from the current section
- **Auto Advance** — checkbox that automatically advances to the next section when audio finishes (pausing or stopping cancels the chain)
- **Download MP3** — download button appears once audio is fully loaded
- **Language switching** — changing language during playback restarts in the new language

### Accessibility test script

```bash
cd ..   # from frontend/ to project root
node scripts/test-a11y.js
```

Runs 97 automated checks across focus traps, ARIA attributes, quiz semantics, keyboard navigation, color contrast, and audio player compliance.

---

## Production Deployment

Production is **GitHub Pages**. Pushing to `main` runs `.github/workflows/deploy-pages.yml`, which builds this folder and publishes `dist/`. No manual steps.

**Audio size rule:** GitHub Pages rejects sites over 1 GB. All narration MP3s must be 48 kbps mono — `npm run generate-audio` does this automatically (it needs `ffmpeg` on PATH), and `npm run compress-audio` re-encodes anything that slipped through. Never commit 128 kbps narration.

The on-demand ElevenLabs proxy (`/api/tts/*`) is not available on Pages, so new content has no narration until `generate-audio` has been run for it. To host with the proxy instead, run the Node server from the repo root with `ELEVENLABS_API_KEY` set:

```bash
cd ..
node server/index.js   # Serves dist/ + /api/tts/* proxy
```

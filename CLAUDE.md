# CLAUDE.md — Alberta AI Academy

This file is read automatically by Claude Code every session on this repository.
Follow all instructions here without being asked.

At the start of every session, greet the user and show them the Quick Reference table below.

---

## Quick Reference — What you can ask me to do

| # | Task | Example prompt |
|---|------|---------------|
| 1 | **Edit wording in any content item** | "In article l2-2.3.1, update the description to say..." |
| 2 | **Edit a block inside a module** | "In module l3-3.2.1, section 'Introduction', change the text block to say..." |
| 3 | **Add a block to a module** | "Add a Practice Exercise highlight card to the bottom of masterclass module m.1.4" |
| 4 | **Insert an image into a module** | "Insert this image into module l2-2.1.3 — file: images/my-photo.png" |
| 5 | **Insert a video into a module** | "Add a YouTube video (ID: abc123) to section 2 of module l1-1.4.1" |
| 6 | **Add a new article** | "Add a new article to Level 2, Day 3 — title: X, URL: Y, description: Z" |
| 7 | **Add a new video item** | "Add a new video to Level 3, Day 1 — title: X, YouTube ID: Y" |
| 8 | **Add a new module** | "Create a new module in Level 1, Day 4 — title: X, here is the content..." |
| 9 | **Add a new tool** | "Add a new tool to Level 2, Day 2 — name: X, URL: Y, description: Z" |
| 10 | **Add a new download** | "Add a new PDF download to Level 1, Day 5 — title: X, download URL: Y, file size: Z" |
| 11 | **Rewrite a masterclass module** | "Rewrite masterclass module m.3.2 from the PDF source" |
| 12 | **Lock a level** | "Lock Level 3 so it is greyed out and hidden from Albert" |
| 13 | **Unlock a level** | "Unlock Level 2 for public access" |
| 14 | **Add a new day to a level** | "Add Day 6 to Level 1 with the title 'AI in Practice'" |
| 15 | **Check what changed in a JSON file** | "Show me the diff for level2.json" |
| 16 | **Restore a file from a clean baseline** | "Restore level1.json to the last working baseline commit" |
| 17 | **Commit and push changes** | "Commit and push this as the latest working baseline" |
| 18 | **Port content from the old academy** | "Port module 2.3.1 from the old academy into Level 2" |

For every JSON edit I will automatically:
1. Run `scripts/check-diff.py` and show you exactly what changed
2. Wait for your explicit approval before committing
3. Push to `origin` (GitHub) after your go-ahead — GitHub Pages redeploys automatically

---

## Repository Overview

The Alberta AI Academy is a Vue 3 / Vite static site. All learning content is stored in
four JSON files — no database or backend required for content.

**One remote — push after every commit:**
```bash
git push origin main
```
- `origin` = GovAlta/Alberta-AI-Academy (GitHub — source of truth)
- Production is **GitHub Pages**, deployed automatically by `.github/workflows/deploy-pages.yml`
  on every push to `main`. See "Deployment (GitHub Pages)" below.

**Python:** use `py` on Windows, `python3` on Mac/Linux. Always pass `encoding='utf-8'` to `open()`.

---

## Content Files

| File | Level | ID prefix | Status |
|------|-------|-----------|--------|
| `frontend/src/data/level1.json` | Level 1: AI Awareness & Foundations | `l1-` | Unlocked |
| `frontend/src/data/level2.json` | Level 2: Practical AI Skills | `l2-` | Unlocked |
| `frontend/src/data/level3.json` | Level 3: Advanced & Enterprise AI | `l3-` | Locked (see below) |
| `frontend/src/data/masterclass.json` | Masterclass (multi-day structured course) | `lm-` | Unlocked |

Each file has two top-level keys: `days[]` (day metadata) and `items[]` (content items).
All four levels are edited identically — the same schema, same block types, same workflows.

**Legacy content for porting:** `AI Academy Dump/` — six JSON export files from the
original Supabase-backed academy (articles, modules, news, prompts, resources, tools).
Use the `convert-academy-dump` skill to convert these records to the current site schema.

---

## Level Lock Feature

Levels can be locked — their nav links are greyed out and their content is excluded from
Albert's AI curriculum recommendations. Locked items are still accessible via direct URL.

**Current state:** Level 3 is locked. Level 1, Level 2 and Masterclass are live.

**To lock or unlock a level**, edit one line in `frontend/src/stores/content.js`:

```js
// Current state — Level 3 locked:
export const LOCKED_LEVELS = ['level3']

// Lock Level 2 and 3:
export const LOCKED_LEVELS = ['level2', 'level3']

// Unlock everything:
export const LOCKED_LEVELS = []

// Lock masterclass:
export const LOCKED_LEVELS = ['level2', 'level3', 'masterclass']
```

Valid IDs: `'level1'`, `'level2'`, `'level3'`, `'masterclass'`

**Side-effects:**
- Nav link shows at reduced opacity with lock styling
- Level is excluded from Albert's AI curriculum (items won't be recommended)
- Level page and items are still reachable via direct URL
- Unlocking a level immediately exposes all its items to Albert — make sure the content is ready

**Commit as a code change** (not a data change):
```bash
git add frontend/src/stores/content.js
git commit -m "config: unlock level3 for public release"
git push origin main
```

---

## CRITICAL: Safe JSON Editing

> This is the most important rule. A script that rewrites an entire JSON file to change
> two fields will silently overwrite every other field — including content fixed in
> unrelated items. This has already caused data loss on this project.

### Mandatory workflow for every JSON edit

**Step 1 — Write targeted scripts — only touch intended fields**

```python
# WRONG — reassigns the whole item, losing all other fields
for item in data['items']:
    if item['id'] == 'l2-2.3.1':
        item = { 'title': 'New Title', ... }  # dangerous — never do this

# CORRECT — only touches the fields being changed
for item in data['items']:
    if item['id'] == 'l2-2.3.1':
        item['title'] = 'New Title'
```

**Step 2 — Run the diff checker immediately after saving**

```bash
# Windows
py scripts/check-diff.py frontend/src/data/level2.json

# Mac / Linux
python3 scripts/check-diff.py frontend/src/data/level2.json
```

Works for all four level files. Reports every changed item and field vs HEAD.

**Step 3 — Show the diff report and wait for approval**

Present the output and ask: "These are the only changes. Does this look correct before I commit?"

**Step 4 — Only commit after explicit user approval**

If unexpected items or fields appear in the diff, investigate and fix before proceeding.

### Hard rules

- NEVER use `git add .` or `git add -A` when any JSON data file is modified
- ALWAYS commit JSON data changes in their own dedicated commit, separate from code
- NEVER commit a JSON file without a reviewed and approved diff
- If a bulk regeneration is needed, restore from the last known-good baseline commit first, then apply only targeted changes on top

---

## Content Types — Full Reference

### article
A written resource linking to an external article or page.

```jsonc
{
  "id": "l2-2.3.1",
  "title": "2.3.1 - Title of Article",
  "type": "article",
  "description": "Short summary shown on the card (≤ 160 chars).",
  "longDescription": "## Heading\n\nMarkdown body shown in the detail modal.",
  "imageUrl": "https://example.com/image.jpg",  // or "" if none
  "youtubeId": null,
  "url": "https://external-article-url.com",
  "downloadUrl": null,
  "fileType": null,
  "fileSize": null,
  "source": "Source Name",
  "tags": ["ai", "policy"],
  "duration": "10 min",
  "difficulty": "intermediate",
  "featured": false,
  "day": 3,
  "learningOutcomes": [],
  "sections": []
}
```

---

### video
A YouTube video. The player is embedded automatically from `youtubeId`.

```jsonc
{
  "id": "l1-1.4.2",
  "type": "video",
  "youtubeId": "dQw4w9WgXcQ",   // YouTube video ID only — NOT the full URL
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",  // full URL for external link button
  "longDescription": "## About this video\n\nMarkdown description.",
  // All other fields same as article
}
```

> **Important:** Do NOT embed the same YouTube URL inside `longDescription`. If a YouTube
> URL appears in `longDescription`, it renders a second embedded player below the first.
> Keep `longDescription` to descriptive text only.

---

### module
A structured multi-section learning module with blocks, highlights, cards, and quizzes.

```jsonc
{
  "id": "l2-2.1.1",
  "type": "module",
  "longDescription": "",          // always empty string for modules
  "youtubeId": null,
  "url": null,
  "learningOutcomes": [
    "Understand X",
    "Apply Y in practice"
  ],
  "sections": [
    {
      "title": "Section Title",
      "content": [ /* blocks — see Block Type Reference */ ]
    }
  ]
  // All other base fields same as article
}
```

---

### tool
A link to an external AI tool or application.

```jsonc
{
  "id": "l1-1.7.1",
  "type": "tool",
  "url": "https://tool-url.com",
  "longDescription": "Markdown description of what the tool does and how to use it.",
  "youtubeId": null,
  "downloadUrl": null,
  // All other base fields same as article
}
```

---

### download
A file available for direct download (PDF, DOCX, etc.).

```jsonc
{
  "id": "l1-1.5.1",
  "type": "download",
  "downloadUrl": "https://direct-download-link.com/file.pdf",
  "fileType": "PDF",
  "fileSize": "2.4 MB",
  "url": null,
  "youtubeId": null,
  // All other base fields same as article
}
```

---

### link
A generic external link (used when none of the above categories apply).

```jsonc
{
  "id": "l3-3.4.1",
  "type": "link",
  "url": "https://external-resource.com",
  // All other base fields same as article
}
```

---

### social
A social media post or external social content.

```jsonc
{
  "id": "l1-1.2.3",
  "type": "social",
  "url": "https://linkedin.com/posts/...",
  // All other base fields same as article
}
```

---

## ID Conventions

| Level | Pattern | Example |
|-------|---------|---------|
| Level 1 | `l1-1.DAY.ITEM` | `l1-1.3.2` = Level 1, Day 3, Item 2 |
| Level 2 | `l2-2.DAY.ITEM` | `l2-2.5.1` = Level 2, Day 5, Item 1 |
| Level 3 | `l3-3.DAY.ITEM` | `l3-3.2.4` = Level 3, Day 2, Item 4 |
| Masterclass | `lm-m.DAY.ITEM` | `lm-m.2.3` = Masterclass Day 2, Item 3 |

**IDs must be unique across all four files.** Before assigning a new ID, check all four
level files to ensure no collision. Duplicate IDs cause silent AI curriculum failures.

---

## Common Tasks

### Edit a field on any existing content item

Works identically for Level 1, 2, 3, and Masterclass. Just use the correct file path.

1. Identify the item ID and which field(s) to change
2. Write a targeted Python script modifying only those fields
3. Run `py scripts/check-diff.py frontend/src/data/<levelfile>.json`
4. Confirm only the intended item and field changed
5. Get approval, commit, push

```bash
# Commit messages by level
git commit -m "content: update description for l2-2.3.1"
git commit -m "content: update title for l3-3.1.2"
git commit -m "content: fix wording in masterclass m.2.1"
```

---

### Add any new content item to any level

Works the same for Level 1, 2, 3, and Masterclass.

1. Identify the target level file and day number
2. Assign an unused ID (check all four files first)
3. Build the full item object — all 20 fields required, no omissions
4. Write a script that:
   - Appends to `data['items']`
   - Adds the new ID to the correct `data['days'][n]['itemIds']` array
5. Run diff check — confirm 1 item added, correct day updated
6. Get approval and commit

---

### Edit a block inside a module (any level)

1. Find the item ID and the section/block position
2. Write a targeted script that modifies only the specific field(s)
3. Run diff check — confirm only that section/block changed

```python
# Example: edit a text block in Level 2 module l2-2.1.3, section 1, block 0
item = next(i for i in data['items'] if i['id'] == 'l2-2.1.3')
item['sections'][1]['content'][0]['content'] = 'New text here'
```

---

### Insert an image into a module (any level)

1. Copy the image file to `frontend/public/images/<descriptive-name>.<ext>`
   - Use kebab-case: `ai-workflow-diagram.png`, `prompt-structure.jpg`
2. Add an `image` block at the desired position in the section:
   ```json
   { "type": "image", "url": "/images/ai-workflow-diagram.png", "alt": "Description of the image" }
   ```
3. Use `.append()` to add at end, or `.insert(index, block)` for a specific position
4. Run diff check — confirm block count increases by 1 on target section only
5. Stage both the image file and the JSON file in the same commit:
   ```bash
   git add frontend/public/images/ai-workflow-diagram.png
   git add frontend/src/data/level2.json
   git commit -m "content: add workflow diagram image to module l2-2.1.3"
   ```

**Image rendering notes:**
- Images in modules are click-to-zoom (lightbox behaviour built in)
- Images are displayed at max 560px wide, max 320px tall, `object-fit: contain`
- PNG and JPG both work; use PNG for diagrams, JPG/WebP for photos

---

### Insert a video into a module (any level)

Add a `video` block at the desired position in the section:

```json
{ "type": "video", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "caption": "Optional caption text" }
```

The video block renders as an embedded YouTube player inside the module section.

> This is different from a `video` item type. Module video blocks embed inline within
> the section flow. A `video` item type is a standalone card on the level page.

---

### Add a block to a module section

Use `.append()` to add at the end or `.insert(index, block)` for a specific position.

Available block types to add:
- `text` — paragraph of markdown
- `highlight` — callout card with a label (e.g. "Practice Exercise", "Key Principle")
- `cards` — grid of 2–4 items with icon, title, body
- `stat` — striking fact or closing insight
- `image` — local or external image (click to zoom)
- `video` — embedded YouTube video
- `list` — bulleted list of items
- `quiz` — multiple choice question with explanation

---

### Create a new module (any level)

New modules use `type: "module"`, empty `longDescription: ""`, and a `sections` array.

**Structure rules (applies to all levels, not just masterclass):**
- First section, first block: `hero` (dark gradient header) — optional but recommended
- `text` blocks: short intros only (1–3 sentences); one per section maximum
- `cards`: for all parallel/list items — prefer over `list` blocks for visual quality
- `highlight`: for key principles, important callouts, and practice exercises
- `stat`: for striking facts or module-closing insights
- Final section: quiz with 4 questions covering the module's core concepts
- Hero blocks appear on the first section only — never on sections 2+

---

### Add a new day to any level

Works identically for Level 1, 2, 3, and Masterclass.

1. Add a new entry to `data['days']`:
   ```python
   data['days'].append({ "day": 6, "title": "Day 6: AI in Practice", "itemIds": [] })
   ```
2. Add new items with `"day": 6`
3. Append each item's ID to `data['days'][-1]['itemIds']`
4. Run diff check — confirm correct number of items added

---

### Port content from the old academy

The legacy academy exports are in `AI Academy Dump/`:
- `articles-export-2026-03-04.json` — articles and video articles
- `modules-export-2026-03-04.json` — modules with sections and content blocks
- `tools-export-2026-03-04.json` — tool links
- `resources-export-2026-03-04.json` — general resources
- `news-export-2026-03-04.json` — news items
- `prompts-export-2026-03-04.json` — prompt templates

Use the `convert-academy-dump` skill to convert a record to site schema.
The skill maps all field names, cleans text, converts block types, and detects YouTube-as-image.

---

## Module Block Type Reference

```jsonc
// Hero — first block of first section only; never on later sections
{ "type": "hero", "badge": "Alberta AI Academy", "title": "Plain headline", "titleHighlight": "Highlighted words", "subtitle": "One sentence." }

// Text — short intro paragraph (markdown); one per section
{ "type": "text", "content": "Markdown paragraph text." }

// Highlight — callout card with label
{ "type": "highlight", "label": "Key Principle", "content": "**Bold terms** and markdown body." }

// Cards — grid of parallel items (2–6 cards)
{ "type": "cards", "items": [
    { "icon": "01", "title": "Card Title", "content": "Card body text." },
    { "icon": "02", "title": "Card Title", "content": "Card body text." }
]}
// Card icon options: "01"–"10" for numbered sequences, "◆" for standalone, "→" for directional

// Stat — striking fact or closing insight
{ "type": "stat", "heading": "Heading text", "content": "Body with **bold** key phrase." }

// Image — local or remote image (click to zoom)
{ "type": "image", "url": "/images/filename.jpg", "alt": "Alt text describing the image" }

// Video — embedded YouTube player inline in the section
{ "type": "video", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "caption": "Optional caption" }

// List — bulleted list (prefer cards for visual quality in masterclass)
{ "type": "list", "items": ["Item one", "Item two", "Item three"] }

// Quiz — multiple choice question
{ "type": "quiz", "question": "1. Question text?", "options": ["Option A", "Option B", "Option C", "Option D"], "correctAnswer": "Option B", "explanation": "Explanation of why B is correct." }
```

---

## Quiz Scoring Behaviour

- After all questions in a quiz section are answered, a score panel shows **X / Y correct**
- **≥ 70%:** green "Good work!" message
- **< 70%:** amber message + "Retake Quiz" button (Next is always available regardless)
- "Finish Module →" on the last section opens the **Module Completion Summary** with overall score, percentage, pass/fail, Retake Module, and Continue Learning buttons
- To change the pass threshold: edit `>= 0.7` in `frontend/src/components/features/ContentDetailModal.vue` (3 occurrences)

---

## Image Assets

Static images are served from `frontend/public/images/`.
Reference in JSON as `"/images/filename.ext"` — leading slash, no `public/` in the path.

```bash
# Stage an image with its JSON change in the same commit
git add frontend/public/images/new-image.png frontend/src/data/level1.json
```

---

## Git Workflow

```bash
# Stage only the specific JSON file(s) that changed — NEVER git add . or git add -A
git add frontend/src/data/level2.json

# Commit (JSON data changes only — no code mixed in)
git commit -m "content: <what changed and why>"

# Push — GitHub Pages redeploys automatically (about 3–5 minutes)
git push origin main
```

**Commit message prefixes:**
- `content:` — JSON data changes (any level, any content type)
- `feat:` — new site feature (UI, behaviour)
- `fix:` — bug fix
- `config:` — level locking, env vars, configuration
- `docs:` — README, CLAUDE.md, documentation only
- `chore:` — maintenance, scripts, non-functional changes

**Working version commits:** After several edits are approved and stable, include
`WORKING VERSION — verified clean baseline` in the commit body. This makes
it easy to restore a known-good state from git history if content is later corrupted:
```bash
git log --oneline | grep "WORKING VERSION"   # find baseline commits
git show <commit-hash>:frontend/src/data/level1.json > frontend/src/data/level1.json  # restore
```

---

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `scripts/check-diff.py` | `py scripts/check-diff.py frontend/src/data/<file>.json` | Compare working JSON vs HEAD; list every changed item and field |
| `scripts/scan-pdf.py` | `py scripts/scan-pdf.py` | Scan all pages of the Masterclass PDF showing first 300 chars per page — for finding which pages contain which modules |
| `scripts/read-pdf-pages.py` | `py scripts/read-pdf-pages.py <start> <end>` | Read specific page range from the Masterclass PDF (1-indexed). Replaces all the old one-off `read-pdf-dayN.py` scripts |
| `scripts/convert-editor-output.js` | `node scripts/convert-editor-output.js <export.json> <level1\|level2\|level3\|masterclass>` | Insert or update items exported from academy-editor.py into a live level JSON file. Creates a timestamped backup before writing |
| `scripts/generate-audio.mjs` | `cd frontend && npm run generate-audio` | Generate EN/FR narration MP3s via ElevenLabs for changed content, compressed to 48 kbps mono. Needs `ELEVENLABS_API_KEY` in root `.env` and ffmpeg on PATH |
| `scripts/compress-audio.mjs` | `cd frontend && npm run compress-audio` | Re-encode any narration file above 48 kbps and refresh manifest sizes — only needed for audio added outside `generate-audio` |
| `scripts/translator.mjs` | `cd frontend && npm run translate` | Add French translations to content items (needs `ANTHROPIC_API_KEY`) |
| `scripts/test-a11y.js` | `node scripts/test-a11y.js` | Automated accessibility checks on the Vue components |
| `academy-editor.py` | `py academy-editor.py` | Desktop GUI for drafting new content items offline; exports site-compatible JSON. **⚠ Not fully tested — use with caution and always review the diff after inserting** |

**PDF path (hardcoded in scan/read scripts):**
`C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf`

**Writing Python scripts:** For any script that modifies a JSON file, write it to a `.py` file, run it, then delete it. Never use `python -c '...'` inline for multi-line scripts.

---

## Markdown Rendering Behaviour

Text blocks in modules are rendered with `marked.parse(text, { breaks: true })`:
- Single `\n` → `<br>` (line break)
- Double `\n\n` → paragraph break (`<p>`)
- Triple or more `\n\n\n` → no additional spacing (markdown collapses multiple blank lines)

**Adding extra vertical space between items in a text block:**
Use an explicit `<br>` tag embedded in the markdown:

```
"Paragraph one.\n\n<br>\n\n## Next Heading"
```

This inserts one extra blank line before the heading — useful when headings feel too crowded.
Do not use `&nbsp;` for spacing — it renders visibly wide white space.

**`imageUrl` field on video items:** This field is the card thumbnail, not an embedded image.
- For YouTube videos: set `imageUrl` to `https://img.youtube.com/vi/<VIDEO_ID>/hqdefault.jpg`
- This shows the YouTube thumbnail on the card without embedding the video outside the modal

---

## Restore From Baseline

If a JSON file is corrupted or contains unintended changes, restore from a known-good commit:

```bash
# Find the most recent WORKING VERSION commit
git log --oneline | grep "WORKING VERSION"

# Restore one file from that commit (replace <hash> with the commit hash)
git show <hash>:frontend/src/data/level1.json > frontend/src/data/level1.json

# Verify the restore looks correct
py scripts/check-diff.py frontend/src/data/level1.json

# Commit the restoration
git add frontend/src/data/level1.json
git commit -m "content: restore level1.json to working baseline <hash>"
git push origin main
```

**After restoring a baseline, apply any new changes as targeted scripts on top — never batch-regenerate content on top of a restore.**

---

## Deployment (GitHub Pages)

The site is a static build published on GitHub Pages from this repo.

- **Trigger:** every push to `main` runs `.github/workflows/deploy-pages.yml`, which builds
  `frontend/` with Vite and publishes `frontend/dist/`. Nothing to do by hand.
- **Progress:** GitHub → Actions tab → "Deploy to GitHub Pages". A deploy takes roughly 3–5 minutes
  (the audio folder makes the upload the slow step).
- **Deep links:** Vue Router uses HTML5 history mode. The workflow copies `index.html` to `404.html`
  so `/level/level1` style URLs work on Pages.
- **Base path:** the site is built for the root (`/`). It is served from a custom domain
  (Settings → Pages → Custom domain), not from `govalta.github.io/Alberta-AI-Academy/`, where asset
  paths would not resolve.
- **Size limit — important:** GitHub Pages refuses sites over **1 GB**. The published site is about
  700 MB, of which ~600 MB is narration audio. That is why `generate-audio.mjs` compresses every MP3
  to 48 kbps mono. Never commit audio at a higher bitrate; if in doubt run `npm run compress-audio`.
  Check the "Site size" line in the workflow log after adding media.
- **What does not work on Pages:** the on-demand ElevenLabs proxy (`/api/tts/*`, provided by
  `server/index.js` on a Node host). Every item currently has pre-generated audio in the manifest,
  so this only matters for brand-new content until `generate-audio` has been run for it.
- **Albert (AI chat):** talks to the backend named in `frontend/.env.production`. If the site's
  domain changes, the backend's allowed origins must include the new domain.

---

## Preventing Cross-File Side Effects

The site loads all four level files on startup. These rules prevent a change in one file
from breaking something elsewhere:

1. **ID uniqueness** — check all four files before assigning any new ID
2. **Video `youtubeId`** — never also embed the same YouTube URL in `longDescription`; it causes a duplicate embedded player
3. **`featured` items** — max 3 per level file; a 4th does not error but exceeds the Home page design
4. **Level locking** — unlocking a level immediately exposes all its content to Albert; ensure content is complete and ready before unlocking
5. **Day numbers** — `day` on each item must match a value in the level's `days[]` array; a mismatch orphans the item from its day group in the UI
6. **Hero blocks** — must only appear as the first block of the first section in a module; a hero anywhere else breaks the section rendering
7. **Module `longDescription`** — must be `""` (empty string) for all module items; non-empty values may render unexpected content above the module viewer

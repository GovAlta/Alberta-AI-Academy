# Alberta AI Academy

Open-access AI literacy training for the Government of Alberta and all Albertans.
No login required — learners access all content immediately.

## What It Does

- **Four learning tracks:** Level 1 (Awareness & Foundations), Level 2 (Practical Skills), Level 3 (Advanced & Enterprise), and **Masterclass** (a full multi-day structured course with modules, quizzes, and progress tracking)
- **Interactive module viewer** with section-by-section navigation, per-question quiz feedback, quiz scoring (with pass/fail at 70%), and a module completion summary screen
- **AI assistant** (Albert) that interviews the learner and builds a personalised curriculum
- **DOCX download** of the personalised curriculum with working hyperlinks to all resources
- **No backend, no authentication** — the entire application is static files

---

## Working with Claude Code

All content editing on this site is done through [Claude Code](https://claude.ai/code) — an AI coding assistant that reads `CLAUDE.md` at the start of every session and follows the documented workflows automatically.

### First-time setup

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Clone this repo and `cd` into it
3. Run `claude` — Claude Code will read `CLAUDE.md` automatically

> **GitHub access:** `GovAlta-EMU/AIM-AI-ACADEMY` (private) is the authoritative source and the only repo you push to. A workflow there mirrors every push to `main` into `GovAlta/Alberta-AI-Academy` (public), which hosts the live site on GitHub Pages. Ask the repository owners for write access to the EMU repo.

### How to update content

Just describe what you want in plain English. Claude Code knows the full content schema, safe editing workflow, and git process. Example prompts:

| Task | Example prompt |
|------|---------------|
| Edit wording in a module | "In module 1.6.2, section 'The Four Pillars', update the Pillar 1 description to say..." |
| Add a new article | "Add a new article to Level 1, Day 3 about AI ethics — here are the details..." |
| Add a block to a module | "Add a Practice Exercise highlight card to the bottom of masterclass module m.1.4" |
| Upload an image | "Insert this image into masterclass module m.2.1 — path: images/my-image.png" |
| Lock or unlock a level | "Unlock Level 2 for public access" |
| Rewrite a masterclass module | "Rewrite masterclass module m.3.2 from the PDF source" |

### Safety — what Claude Code enforces automatically

- **Diff check before every commit** — after any JSON edit, `scripts/check-diff.py` is run and the output is shown for approval before anything is committed
- **Targeted edits only** — scripts only touch the specific fields being changed, never rewrite entire items
- **Separate commits** — JSON data changes are always committed separately from code changes
- **Push to deploy** — every push to `main` is built and published to GitHub Pages automatically

### Skills

Claude Code uses specialised skills (stored in `~/.claude/skills/`) to handle repeatable tasks:

| Skill | Purpose |
|-------|---------|
| `safe-json-edit` | Enforces the diff-check workflow for all JSON edits |
| `rewrite-masterclass-module` | Rewrites a masterclass module from the PDF source into structured blocks |
| `convert-academy-dump` | Converts records from the legacy Supabase dump into site-compatible items |
| `insert-academy-items` | Inserts a JSON export from `academy-editor.py` into a level file |

To install skills on a new machine, copy the `skills/` folder from this repo into `~/.claude/skills/`.

---

## Installation & Running

**Prerequisites:** Node.js 20+ and npm.

```bash
cd frontend
npm install
npm run dev       # dev server at http://localhost:5173
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WS_URL` | **Yes** | WebSocket endpoint, e.g. `wss://your-backend.onrender.com/ws`. Without this the AI panel shows a connection error immediately. |
| `VITE_API_URL` | **Yes** | HTTP base URL for the backend API, e.g. `https://your-backend.onrender.com`. Used by the model picker (`GET /api/v1/llm/models`). |
| `VITE_WS_MOCK` | No | Set `true` to run the AI assistant in mock mode — no live backend required. Simulates a 4-turn conversation and full curriculum generation. Defaults to `false`. |
| `VITE_APP_TITLE` | No | Overrides the HTML `<title>`. Defaults to `Alberta AI Academy`. |

Copy `frontend/.env.development` and fill in `VITE_WS_URL` and `VITE_API_URL`, or set `VITE_WS_MOCK=true` to run fully locally:

```bash
# .env.development — run locally without a backend
VITE_WS_MOCK=true
```

### Production build

```bash
cd frontend
npm run build     # outputs to frontend/dist/
npm run preview   # serves dist/ locally at http://localhost:4173
```

### Deployment

Production is **GitHub Pages**, served from the public `GovAlta/Alberta-AI-Academy` repo at https://albertaaiacademy.com. The workflow in `.github/workflows/deploy-pages.yml` builds `frontend/` and publishes `frontend/dist/` on every push to `main` there (Settings → Pages → Source must be "GitHub Actions"); it is a no-op in the private EMU repo. Progress is visible in the public repo's Actions tab; a deploy takes a few minutes.

The app uses HTML5 history routing, so the workflow copies `index.html` to `404.html` to make deep links work on Pages. The public base path is detected automatically: `/` when a custom domain is configured, `/Alberta-AI-Academy/` otherwise (override with a `VITE_BASE` repository variable). Asset paths in content JSON stay root-relative; `src/utils/assetUrl.js` applies the base at render time.

GitHub Pages has a hard **1 GB** limit per site. Narration audio (`frontend/public/audio/`) is the bulk of the site, which is why the audio scripts compress every MP3 to 48 kbps mono — see "Audio narration" in `frontend/README.md`.

`frontend/dist/` can also be hosted on any other static host. The optional Node server in `server/` serves `dist/` and adds an ElevenLabs proxy for on-demand narration; it is not used on Pages.

---

## Updating Content

All learning content lives in JSON files — no code changes required.

| File | Level |
|------|-------|
| `frontend/src/data/level1.json` | Level 1: AI Awareness & Foundations |
| `frontend/src/data/level2.json` | Level 2: Practical AI Skills |
| `frontend/src/data/level3.json` | Level 3: Advanced & Enterprise AI |
| `frontend/src/data/masterclass.json` | Masterclass: full multi-day course |

### Content item schema

Each item in a level's `items` array must include all fields — never omit nullable ones:

```jsonc
{
  "id": "l1-1.1.1",        // Unique across all files. Level 1: l1-, Level 2: l2-, Level 3: l3-, Masterclass: lm-
  "title": "...",
  "type": "article",        // article | video | module | tool | download | social | link
  "description": "...",     // Short text shown on the card (≤ 160 chars recommended)
  "longDescription": "...", // Full markdown text shown in the detail modal ("" for modules)
  "imageUrl": "...",        // Card thumbnail — string, never null (use "" if none)
  "youtubeId": null,        // YouTube video ID — set when type is "video"; null otherwise
  "url": null,              // Primary external URL; null for modules
  "downloadUrl": null,      // Direct download URL — set when type is "download"; null otherwise
  "fileType": null,         // e.g. "PDF", "DOCX" — set for downloads only
  "fileSize": null,         // e.g. "2.4 MB" — set for downloads only
  "source": "Alberta AI Academy",
  "tags": ["tag1"],         // Used for full-text search
  "duration": "10 min",     // Estimated read/watch time — string like "15 min", or null
  "difficulty": "beginner", // beginner | intermediate | advanced
  "featured": false,        // Shows on the Home page level card when true (max 3 per level)
  "day": 1,                 // Day number within the level (integer)
  "learningOutcomes": [],   // Array of strings — used by modules; empty array for other types
  "sections": []            // Array of section objects — used by modules; empty array for other types
}
```

### Module sections and content blocks

Items of `type: "module"` use `sections` instead of `longDescription`. Each section has a `title` and a `content` array of blocks:

```jsonc
{
  "title": "Section Title",
  "content": [
    { "type": "hero", "badge": "...", "title": "...", "titleHighlight": "...", "subtitle": "..." },
    { "type": "text", "content": "Markdown paragraph." },
    { "type": "highlight", "label": "Key Principle", "content": "Markdown body." },
    { "type": "cards", "items": [{ "icon": "01", "title": "Card Title", "content": "Body." }] },
    { "type": "stat", "heading": "Heading", "content": "Markdown body." },
    { "type": "image", "url": "/images/filename.jpg", "alt": "Description" },
    { "type": "video", "url": "https://youtube.com/watch?v=...", "caption": "Optional caption" },
    { "type": "list", "items": ["Item one", "Item two"] },
    { "type": "quiz", "question": "1. Question?", "options": ["A","B","C","D"], "correctAnswer": "B", "explanation": "Why B is correct." }
  ]
}
```

**Block rules for masterclass modules:**
- `hero` — first block of the first section only; never on sections 2+
- `text` — short intro paragraphs only (1–3 sentences); one per section at most
- `cards` — use for all parallel items; icons use `◆` (standalone), `→` (directional), or `"01"`–`"10"` (numbered sequences)
- `highlight` — left-border callout for core concepts and key principles
- `stat` — striking fact or closing insight
- No `list` or `image` blocks in masterclass modules — use `cards` instead
- Each module ends with a quiz section containing exactly 4 questions

### Quiz scoring

The module viewer automatically scores quiz sections:
- After all questions in a section are answered, a score panel appears showing **X / Y correct**
- **≥ 70%** — "Good work!" shown in green; learner proceeds with Next
- **< 70%** — message shown with a "Retake Quiz" option; Next is still available
- On the final section, "Finish Module →" opens a **Module Completion Summary** showing the overall score, percentage, pass/fail message, and options to retake the module or continue learning

### Locking and unlocking levels

Levels can be locked — their nav links are greyed out and their content is excluded from the AI assistant's curriculum recommendations. Locked levels are still accessible via direct URL.

Edit one line in `frontend/src/stores/content.js`:

```js
// Lock Level 3 (current default):
export const LOCKED_LEVELS = ['level3']

// Lock Level 2 and 3:
export const LOCKED_LEVELS = ['level2', 'level3']

// Unlock everything:
export const LOCKED_LEVELS = []
```

Valid IDs: `'level1'`, `'level2'`, `'level3'`, `'masterclass'`

> Unlocking a level immediately exposes all its content to the AI assistant — make sure the content is ready before unlocking.

Commit this as a code change (not a data change):
```bash
git add frontend/src/stores/content.js
git commit -m "config: unlock level3 for public release"
git push origin main
```

---

### Safe content editing

> **Important:** Never use a script that reads and rewrites an entire JSON file to change a small number of fields. This causes silent data corruption by overwriting unrelated content that was previously fixed.

The `safe-json-edit` Claude skill enforces the correct workflow:
1. Write scripts that modify only the specific fields intended
2. After saving, run the diff checker: `py scripts/check-diff.py frontend/src/data/<file>.json`
3. Review the diff output — confirm only intended items and fields changed
4. Commit only after explicit approval

Always commit JSON data file changes in their own dedicated commit, never bundled with code changes.

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `scripts/check-diff.py` | `py scripts/check-diff.py frontend/src/data/<file>.json` | Compare working JSON vs HEAD; reports every changed item and field |
| `scripts/scan-pdf.py` | `py scripts/scan-pdf.py` | Scan all pages of the Masterclass PDF — shows first 300 chars per page to locate modules |
| `scripts/read-pdf-pages.py` | `py scripts/read-pdf-pages.py <start> <end>` | Read a page range from the Masterclass PDF (1-indexed) |
| `scripts/convert-editor-output.js` | `node scripts/convert-editor-output.js <export.json> <level>` | Insert or update items from `academy-editor.py` into a live level JSON file |
| `scripts/generate-audio.mjs` | `cd frontend && npm run generate-audio` | Generate EN/FR narration via ElevenLabs for changed content (48 kbps mono; needs ffmpeg) |
| `scripts/compress-audio.mjs` | `cd frontend && npm run compress-audio` | Re-encode narration files above 48 kbps and refresh manifest sizes |

### Standalone content editor

`academy-editor.py` (in the project root) is a desktop Python/tkinter app for drafting new content items offline. It exports a JSON array compatible with the level JSON schema, ready to insert via `scripts/convert-editor-output.js` or the `insert-academy-items` Claude skill.

> **Note:** `academy-editor.py` has not been fully tested end-to-end. Review exported JSON carefully and always run the diff checker after inserting items.

```bash
py academy-editor.py
```

### ID conventions

- **Level 1** IDs: `l1-1.X.Y` — e.g. `l1-1.3.2`
- **Level 2** IDs: `l2-2.X.Y`
- **Level 3** IDs: `l3-3.X.Y`
- **Masterclass** IDs: `lm-m.X.Y` — e.g. `lm-m.1.4`
- IDs must be unique across all four files. Duplicates cause silent AI curriculum failures.

### Rules

- After editing JSON files, run `npm run build` to verify the build still passes.
- Static image assets go in `frontend/public/images/` and are referenced as `/images/filename.jpg`.

---

## Project Structure

```
AIM-AI-ACADEMY/
├── README.md
├── CLAUDE.md                 — auto-read by Claude Code each session; full task workflows
├── .github/workflows/deploy-pages.yml — builds and publishes the site to GitHub Pages on push
├── academy-editor.py         — offline desktop content editor (Python/tkinter) ⚠ not fully tested
├── generate-images.js        — Gemini image generation helper for module artwork (needs GEMINI_API_KEY)
├── server/index.js           — optional Node host: serves dist/ + ElevenLabs proxy (not used on Pages)
├── AI Academy Dump/  — legacy Supabase export files for content porting reference
├── skills/
│   ├── safe-json-edit/           — enforces diff-check workflow for JSON edits
│   ├── rewrite-masterclass-module/ — PDF-to-module rewrite workflow
│   ├── convert-academy-dump/     — converts legacy dump records to site schema
│   └── insert-academy-items/     — inserts academy-editor.py exports into level files
├── scripts/
│   ├── check-diff.py         — safe JSON edit diff checker
│   ├── scan-pdf.py           — scan Masterclass PDF page by page
│   ├── read-pdf-pages.py     — read a specific page range from the Masterclass PDF
│   ├── convert-editor-output.js — insert academy-editor.py exports into level JSON files
│   ├── generate-audio.mjs    — ElevenLabs narration generator (compresses to 48 kbps mono)
│   ├── compress-audio.mjs    — re-encode oversized narration files
│   ├── translator.mjs        — French translation of content items
│   └── test-a11y.js          — automated accessibility checks
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── .env.development
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/index.js
        ├── stores/
        │   ├── content.js        — loads all level JSON, exposes search/filter/catalogue/locking
        │   └── ai.js             — WebSocket state, conversation history, streaming
        ├── data/
        │   ├── level1.json       — Level 1: AI Awareness & Foundations
        │   ├── level2.json       — Level 2: Practical AI Skills
        │   ├── level3.json       — Level 3: Advanced & Enterprise AI
        │   ├── masterclass.json  — Masterclass: full multi-day structured course
        │   └── audio-manifest.json — which narration MP3 belongs to which item/section
        ├── composables/
        │   ├── useWebSocket.js   — WebSocket lifecycle, exponential backoff, mock mode
        │   └── useCurriculumBuilder.js — JSON parser, schema validation, ID resolution
        ├── utils/
        │   └── generateDocx.js   — DOCX generation (dynamically imported)
        ├── components/
        │   ├── common/
        │   │   ├── AppHeader.vue — sticky nav with level links, Albert link, mobile hamburger
        │   │   └── AppFooter.vue
        │   └── features/
        │       ├── ContentCard.vue
        │       ├── ContentDetailModal.vue — detail view + full module viewer with quiz scoring
        │       ├── AiAssistantPanel.vue   — FAB + slide-in chat panel
        │       └── DownloadButton.vue
        └── views/
            ├── HomeView.vue
            ├── LevelView.vue     — used for all four levels (/level/level1, /level/level2, /level/level3, /level/masterclass)
            ├── ChatView.vue      — standalone chat page (/chat)
            └── NotFoundView.vue
```

**Static assets:** `frontend/public/images/` — card thumbnails and module images, served at `/images/`.
`frontend/public/audio/{en,fr}/` — pre-generated narration MP3s (48 kbps mono), served at `/audio/`.

---

## AI Assistant

The AI assistant is backed by a WebSocket endpoint at the URL in `VITE_WS_URL`.

**Conversation flow:**
1. Learner clicks the floating "AI Assistant" button
2. AI asks 3–5 questions about role, experience, and learning goals
3. AI recommends resources and includes `[READY_TO_GENERATE]` in its final response
4. "Generate My Curriculum" button activates — learner clicks to download a `.docx` file

**The generated DOCX contains:**
- Cover page with learner profile and date
- Sections matching the AI's recommendations
- Each item hyperlinked to its original resource URL
- GoA footer

**WebSocket protocol:**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `{ type: 'llm:start', taskId, model, messages }` | → server | Start an LLM completion |
| `{ type: 'ping' }` | → server | Keepalive (every 25 s) |
| `{ type: 'connection:welcome', connectionId }` | ← server | Connection established |
| `{ type: 'llm:started' }` | ← server | Stream beginning |
| `{ type: 'llm:chunk', content }` | ← server | Streaming text chunk |
| `{ type: 'llm:done' }` | ← server | Stream complete |
| `{ type: 'llm:error', error }` | ← server | LLM error |
| `{ type: 'pong' }` | ← server | Keepalive response |

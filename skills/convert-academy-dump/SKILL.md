---
name: convert-academy-dump
description: >
  Converts raw dump records from the Alberta AI Academy legacy Supabase export
  (AI Academy Dump/*.json) into site-compatible item objects matching the level JSON schema.
  Handles modules (with sections and content blocks), articles, videos, tools, and downloads.
  Maps all field names, cleans text, converts block types, detects YouTube-as-image, and
  outputs a complete ready-to-paste JSON item. Use this skill when asked to convert a dump
  record, import from the academy dump, or transform legacy content into site format.
---

# Academy Dump → Site Converter

## Position in workflow

**Comes after:** `academy-workflow` (routes here when source is a Supabase dump record)

**Comes before:** `safe-json-edit` → `site-update`

Convert a raw dump record into a valid Alberta AI Academy site item.

## Reference files (read these first)

- Dump source files: `AI Academy Dump/` in the repo root
- Live level data: `frontend/src/data/level1|2|3|masterclass.json`

---

## Workflow

### Step 1 — Identify the record

If the user pastes a dump record, determine its type:
- Has `name` + `json_data.sections` → **module**
- Has `title` + flat `json_data` array → **article** (or **video** if `video_url` is set)
- Has `name` + `url` + `type` (free/paid) → **tool**

If the user asks to find a record by title/name, read the appropriate dump file and locate it.

### Step 2 — Extract and map fields

**ID assignment** — derive from the item name pattern `"X.Y.Z - Title"`:
- Level 1 item 2.3 → `l1-1.2.3`
- Level 2 item 4.1 → `l2-2.4.1`
- Level 3 item 1.2 → `l3-3.1.2`
- Masterclass → `lm-m.Y.Z`

**Day** — the middle number in the name pattern (e.g., `1.2.1` → day 2).

**Difficulty** — level `"1"` → `beginner`, `"2"` → `intermediate`, `"3"` → `advanced`.

**Duration** — dump stores as a number (minutes); convert to `"30 min"` format.

### Step 3 — Convert content blocks (modules only)

For each block in each section, apply:

| Dump type | Condition | Site output |
|-----------|-----------|------------|
| `text` | always | `{ "type": "text", "content": cleanText(value \|\| content) }` |
| `list` | always | `{ "type": "list", "items": value \|\| items }` |
| `image` | url contains `youtu.be` or `youtube.com` | `{ "type": "video", "url": url, "caption": caption \|\| "" }` |
| `image` | url is a real image | `{ "type": "image", "url": url, "alt": alt \|\| caption \|\| "" }` |
| `video` | always | `{ "type": "video", "url": url, "caption": caption \|\| "" }` |
| `quiz` | always | `{ "type": "quiz", "question": question, "options": options, "correctAnswer": correctAnswer, "explanation": feedback.correct \|\| "" }` |

**Text cleanup** — apply to all text content values:
```
- Replace &nbsp; with a space
- Collapse 3+ consecutive newlines → 2
- Strip trailing whitespace from lines
- .trim()
```

### Step 4 — Convert article json_data → longDescription (articles only)

The dump article `json_data` is a flat array of blocks. Convert to a Markdown string:

| Block type | Markdown output |
|-----------|----------------|
| `text` | paragraph (content as-is, cleaned) |
| `header` | `## content` |
| `hyperlink` | `[title](content)` |
| `list` | `- item` per line |
| `image` | `![alt](url)` |

Separate blocks with a blank line.

### Step 5 — Assemble the full item

Always output **all fields** — never omit nullable ones.
All text fields use the multilingual `{ "en": "...", "fr": "..." }` format.
If you do not have a French translation, duplicate the English value as a placeholder.

```json
{
  "id": "l1-1.2.1",
  "title": { "en": "1.2.1 - Title Here", "fr": "1.2.1 - Titre ici" },
  "type": "module",
  "description": { "en": "Short summary.", "fr": "Résumé court." },
  "longDescription": { "en": "Markdown body...", "fr": "Corps markdown..." },
  "imageUrl": "https://... or empty string",
  "youtubeId": null,
  "url": null,
  "downloadUrl": null,
  "fileType": null,
  "fileSize": null,
  "source": { "en": "Alberta AI Academy", "fr": "Alberta AI Academy" },
  "tags": [
    { "en": "tag1", "fr": "tag1" },
    { "en": "tag2", "fr": "tag2" }
  ],
  "duration": { "en": "30 min", "fr": "30 min" },
  "difficulty": "beginner",
  "featured": false,
  "day": 2,
  "learningOutcomes": [
    { "en": "Outcome 1", "fr": "Résultat 1" }
  ],
  "sections": [
    {
      "title": { "en": "Section Title", "fr": "Titre de section" },
      "content": []
    }
  ]
}
```

**Block content is also multilingual.** For each block in sections, wrap text values in `{ en, fr }`:

```json
{ "type": "text",      "content": { "en": "Paragraph.", "fr": "Paragraphe." } }
{ "type": "highlight", "label": { "en": "Key Principle", "fr": "Principe clé" }, "content": { "en": "Body.", "fr": "Corps." } }
{ "type": "image",     "url": "/images/file.jpg", "alt": { "en": "Alt text", "fr": "Texte alternatif" } }
{ "type": "stat",      "heading": { "en": "Heading", "fr": "Titre" }, "content": { "en": "Body.", "fr": "Corps." } }
{ "type": "cards",     "items": [{ "icon": "◆", "title": { "en": "Title", "fr": "Titre" }, "content": { "en": "Body.", "fr": "Corps." } }] }
{ "type": "quiz",
  "question":      { "en": "1. Question?", "fr": "1. Question ?" },
  "options":       [{ "en": "Option A", "fr": "Option A" }, { "en": "Option B", "fr": "Option B" }],
  "correctAnswer": { "en": "Option B", "fr": "Option B" },
  "explanation":   { "en": "Why B.", "fr": "Pourquoi B." }
}
```

### Step 6 — Check for existing item

Before presenting the output, read the target level JSON and check if an item with the same ID already exists. If it does, note this and ask whether to update or create a new ID.

### Step 7 — Offer to insert

After presenting the converted item, ask:
> "Would you like me to run `scripts/convert-editor-output.js` to insert this into `levelX.json`?"

If yes:
1. Write the item to a temp file (e.g., `converted-item.json`)
2. Run: `node scripts/convert-editor-output.js converted-item.json levelX`
3. Show the output

---

## Quality checks

Before presenting output, verify:
- [ ] All 20 schema fields are present
- [ ] `sections` is `[]` for non-module types
- [ ] `learningOutcomes` is `[]` for non-module types (plain empty array `[]`)
- [ ] `imageUrl` is a plain string (not null, not multilingual)
- [ ] No YouTube URL appears as an image block
- [ ] No `&nbsp;` or triple+ newlines remain in text
- [ ] `duration` is `{ "en": "30 min", "fr": "30 min" }`, not a plain string or number
- [ ] `day` is a number, not a string
- [ ] `title`, `description`, `longDescription`, `source` are `{ en, fr }` objects, not plain strings
- [ ] `tags` is an array of `{ en, fr }` objects, not an array of plain strings
- [ ] `learningOutcomes` entries are `{ en, fr }` objects (when non-empty)
- [ ] All section `title` fields are `{ en, fr }` objects
- [ ] All block text/content/label/heading/alt fields are `{ en, fr }` objects

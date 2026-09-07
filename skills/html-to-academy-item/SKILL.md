---
name: html-to-academy-item
description: >
  Converts an HTML file containing module or article content into a valid Alberta AI Academy
  JSON item in the current multilingual { "en": "...", "fr": "..." } schema.
  Maps HTML elements (headings, paragraphs, lists, images, videos, quizzes) to the correct
  Academy block types (hero, text, highlight, cards, stat, image, video, quiz).
  Outputs a complete ready-to-insert JSON item with all 20 required fields.
  Use this skill when the user provides an HTML file as the source for new academy content.
  After completing, hand off to safe-json-edit, then site-update.
---

# HTML → Academy Item Converter

Convert an HTML file into a valid Alberta AI Academy JSON item.

**This skill is Step 1 of a 3-step workflow:**
1. **This skill** — convert HTML → JSON item
2. **`safe-json-edit`** — insert the item into the level JSON file safely
3. **`site-update`** — deploy to the live site

---

## Before Starting

Ask the user if not already provided:
1. Path to the HTML file
2. Which level this belongs to (`level1`, `level2`, `level3`, or `masterclass`)
3. Which day number
4. Item type: `module` or `article`
5. Suggested item ID (or derive it from the day + next available item number)

---

## Workflow

### Step 1 — Read and analyse the HTML file

Read the full HTML file. Identify:
- Overall title (usually `<h1>` or `<title>`)
- Natural section boundaries (usually `<h2>` tags)
- Content within each section (paragraphs, lists, images, videos, callouts)
- Any quiz-like structures (questions with options)

Report back a brief summary of what you found:
> "Found 4 sections, 2 images, 1 video embed, 6 list items, and a quiz at the end."

### Step 2 — Map HTML elements to Academy block types

Apply these mapping rules in order:

| HTML pattern | Academy block type | Notes |
|---|---|---|
| First `<h1>` or page title | `hero` (section 1 only) | badge, title, titleHighlight, subtitle |
| `<h2>` | New section boundary | becomes `section.title` |
| `<h3>` | Sub-heading within section | incorporate into text or highlight block |
| Short `<p>` (1–3 sentences) at section start | `text` | one per section only |
| `<p class="callout">`, `<blockquote>`, `<aside>` | `highlight` | label + content |
| `<ul>` or `<ol>` with 2–6 items | `cards` | each `<li>` becomes a card |
| Large statistic, key fact, closing insight | `stat` | heading + content |
| `<img>` | `image` | for levels 1–3 only; **not allowed in masterclass** |
| `<iframe>` or YouTube URL | `video` | extract YouTube ID |
| Question + options structure | `quiz` | question, options[], correctAnswer, explanation |

**Masterclass-specific rules:**
- No `image` blocks — describe images as text or skip them
- No `list` blocks — convert all lists to `cards`
- Final section must be quiz with exactly 4 questions
- Hero on first section only

**Level 1/2/3 rules:**
- `list` blocks allowed but prefer `cards` for visual quality
- Quiz questions — no fixed count requirement

### Step 3 — Build the JSON item

Assemble the full 20-field item. All text fields use `{ "en": "...", "fr": "..." }` format.
For French, duplicate the English value as a placeholder — the translator will fill it in later.

```json
{
  "id": "l2-2.4.1",
  "title": { "en": "2.4.1 - Title from HTML", "fr": "2.4.1 - Title from HTML" },
  "type": "module",
  "description": { "en": "Short summary (≤160 chars).", "fr": "Short summary (≤160 chars)." },
  "longDescription": { "en": "", "fr": "" },
  "imageUrl": "",
  "youtubeId": null,
  "url": null,
  "downloadUrl": null,
  "fileType": null,
  "fileSize": null,
  "source": { "en": "Alberta AI Academy", "fr": "Alberta AI Academy" },
  "tags": [{ "en": "tag1", "fr": "tag1" }],
  "duration": { "en": "30 min", "fr": "30 min" },
  "difficulty": "intermediate",
  "featured": false,
  "day": 4,
  "learningOutcomes": [
    { "en": "Outcome 1.", "fr": "Outcome 1." }
  ],
  "sections": [
    {
      "title": { "en": "Section Title", "fr": "Section Title" },
      "content": [ /* blocks */ ]
    }
  ]
}
```

**Block format reminders (all text fields multilingual):**
```json
{ "type": "text",      "content": { "en": "...", "fr": "..." } }
{ "type": "highlight", "label": { "en": "Key Principle", "fr": "Key Principle" }, "content": { "en": "...", "fr": "..." } }
{ "type": "cards",     "items": [{ "icon": "01", "title": { "en": "...", "fr": "..." }, "content": { "en": "...", "fr": "..." } }] }
{ "type": "stat",      "heading": { "en": "...", "fr": "..." }, "content": { "en": "...", "fr": "..." } }
{ "type": "image",     "url": "/images/filename.jpg", "alt": { "en": "...", "fr": "..." } }
{ "type": "video",     "url": "https://www.youtube.com/watch?v=ID", "caption": { "en": "...", "fr": "..." } }
{ "type": "quiz",
  "question":      { "en": "1. Question?", "fr": "1. Question?" },
  "options":       [{ "en": "A", "fr": "A" }, { "en": "B", "fr": "B" }],
  "correctAnswer": { "en": "A", "fr": "A" },
  "explanation":   { "en": "Why A.", "fr": "Why A." }
}
```

### Step 4 — Quality check

Before presenting the output, verify:
- [ ] All 20 fields present
- [ ] `type` is correct (`module` or `article`)
- [ ] `longDescription` is `{ "en": "", "fr": "" }` for modules
- [ ] `sections` is `[]` for articles
- [ ] `imageUrl` is a string (not null)
- [ ] `day` is a number matching the target level's days
- [ ] No `image` or `list` blocks if this is a masterclass module
- [ ] Hero appears only on section 1 if present
- [ ] All text fields are `{ en, fr }` objects, not plain strings
- [ ] French values populated (even if duplicated from English)

### Step 5 — Check for ID collision

Before finalising the ID, search the target level JSON to confirm the ID is not already in use.
If a collision exists, increment the item number and try again.

### Step 6 — Present and confirm

Show the user:
1. A summary of how the HTML was mapped (sections found, block types used)
2. The full JSON output
3. Any content that could not be mapped and was skipped (with reason)

Ask:
> "Does this look correct? Any sections or blocks you'd like adjusted before I insert it?"

### Step 7 — Hand off to safe-json-edit

After the user approves the JSON, say:
> "I'll now insert this using the safe-json-edit workflow."

Then proceed with `safe-json-edit`:
- Write a targeted Python script that appends the item to `items[]` and adds the ID to `days[day].itemIds[]`
- Run `py scripts/check-diff.py frontend/src/data/<levelfile>.json`
- Show diff and get explicit approval before committing

---

## Images in HTML files

If the HTML references local image files (e.g. `<img src="images/diagram.png">`):
1. Copy the image to `frontend/public/images/<descriptive-name>.png`
2. Use the path `/images/<descriptive-name>.png` in the JSON block
3. Stage the image file in the same commit as the JSON change

If the image is a remote URL, use it as-is in the `url` field of the image block.

---

## After This Skill

Once the item is inserted and the diff is approved:
→ Use **`site-update`** to commit, push to origin, confirm, then push to render (production).

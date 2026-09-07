---
name: safe-json-edit
description: >
  Enforces safe editing practices whenever a Python script modifies an Alberta AI Academy
  level JSON file (level1.json, level2.json, level3.json, masterclass.json).
  USE THIS SKILL whenever you are about to write a Python script that reads and rewrites
  any of these files — even if the script only intends to change a small number of fields.
  The skill prevents the recurring bug where a script rewrites the whole file and
  accidentally overwrites unrelated content that was previously fixed.
---

# Safe JSON Edit

## Position in workflow

**Comes after:** `html-to-academy-item`, `convert-academy-dump`, or `rewrite-masterclass-module`
(or directly if editing existing content)

**Comes before:** `site-update`

## The Problem This Solves

Scripts that load a full JSON file, modify a few fields, and write it back out can silently
overwrite unrelated content — even content that was carefully fixed in a previous commit.
This has already caused data loss on this project (ec6394c reintroduced bugs fixed in e3e3163).

## Mandatory Workflow — Follow Every Time

### 1. Write the script with targeted edits only

Only touch the specific fields the script is supposed to change.
Never reassign a whole item or section object — only update exact keys.

Bad (overwrites everything in the item):
```python
for item in data['items']:
    if item['id'] == target_id:
        item = new_item_object  # DANGEROUS - reassigns local var, or worse replaces whole object
```

Good (touches only intended fields):
```python
for item in data['items']:
    if item['id'] == target_id:
        item['type'] = 'video'
        item['youtubeId'] = 'abc123'
        item['imageUrl'] = 'https://...'
```

### 2. After writing the file, ALWAYS run the diff check script

```bash
py scripts/check-diff.py <path-to-json>
```

The script lives at `scripts/check-diff.py` in the repo root. Run from the repo root directory.

This script runs git diff, counts changed items, and lists every modified field.

### 3. Show the diff summary to the user and get explicit approval

Present the output clearly — which items changed, which fields — and ask:
"These are the only changes. Does this look correct before I commit?"

### 4. Only commit after the user explicitly approves the diff

Never commit if:
- More items changed than intended
- Fields changed that the script was not supposed to touch
- The user has not explicitly said yes

If unexpected changes appear, investigate and fix before proceeding.

## Hard Rules

- NEVER stage JSON data files with `git add .` or `git add -A`
- NEVER include level JSON files in a catch-all commit with other files
- ALWAYS commit JSON data changes in their own dedicated commit
- If regenerating large portions of a file, restore from a known-good git commit first,
  then apply only the targeted changes on top

---

## Current JSON Schema — Multilingual Fields

**All text fields are now multilingual objects `{ "en": "...", "fr": "..." }`.**
This was applied to all four level files by `translator.mjs`. Scripts must preserve this format.

### Fields that are multilingual objects
```json
"title":           { "en": "1.1.1 - Title", "fr": "1.1.1 - Titre" }
"description":     { "en": "...", "fr": "..." }
"longDescription": { "en": "...", "fr": "..." }
"source":          { "en": "Alberta AI Academy", "fr": "Alberta AI Academy" }
"duration":        { "en": "30 min", "fr": "30 min" }
```

### Fields that are arrays of multilingual objects
```json
"tags":             [{ "en": "AI", "fr": "IA" }, ...]
"learningOutcomes": [{ "en": "Understand X", "fr": "Comprendre X" }, ...]
```

### Fields that remain plain (not multilingual)
```
id, type, imageUrl, youtubeId, url, downloadUrl, fileType, fileSize,
difficulty, featured, day, sections (array — see below)
```

### Module sections — multilingual structure
```json
"sections": [
  {
    "title": { "en": "Section Title", "fr": "Titre de section" },
    "content": [
      {
        "type": "text",
        "content": { "en": "English paragraph.", "fr": "Paragraphe français." }
      },
      {
        "type": "image",
        "url": "/images/filename.jpg",
        "alt": { "en": "Alt text", "fr": "Texte alternatif" }
      },
      {
        "type": "hero",
        "badge": { "en": "Alberta AI Academy", "fr": "Alberta AI Academy" },
        "title": { "en": "Headline", "fr": "Titre" },
        "titleHighlight": { "en": "Highlight", "fr": "Mettre en évidence" },
        "subtitle": { "en": "Subtitle.", "fr": "Sous-titre." }
      },
      {
        "type": "highlight",
        "label": { "en": "Key Principle", "fr": "Principe clé" },
        "content": { "en": "**Bold** markdown body.", "fr": "Corps **gras** en markdown." }
      },
      {
        "type": "cards",
        "items": [
          { "icon": "01", "title": { "en": "Card Title", "fr": "Titre" }, "content": { "en": "Body.", "fr": "Corps." } }
        ]
      },
      {
        "type": "stat",
        "heading": { "en": "Heading", "fr": "Titre" },
        "content": { "en": "Body with **bold**.", "fr": "Corps avec **gras**." }
      },
      {
        "type": "quiz",
        "question": { "en": "1. Question?", "fr": "1. Question ?" },
        "options": [
          { "en": "Option A", "fr": "Option A" },
          { "en": "Option B", "fr": "Option B" }
        ],
        "correctAnswer": { "en": "Option B", "fr": "Option B" },
        "explanation": { "en": "Why B is correct.", "fr": "Pourquoi B est correct." }
      }
    ]
  }
]
```

### Writing targeted scripts with multilingual fields

When editing a multilingual field, update both `en` and `fr` keys:

```python
# CORRECT — update both languages
item['title'] = { 'en': 'New English Title', 'fr': 'Nouveau titre français' }

# CORRECT — update only English when French is unchanged
item['title']['en'] = 'Updated English Title'

# WRONG — overwrites multilingual object with plain string
item['title'] = 'New Title'
```

**Pattern replacement trap:** Never use an English word as the search string when replacing text in `fr` fields — the French translation will be different. For example, replacing `'Additional - '` in `fr` will silently fail if the French says `'Supplémentaire - '`. Always write the French replacement explicitly:

```python
# WRONG — English pattern won't match French text
item['title']['fr'] = item['title']['fr'].replace('Additional - ', '2.1.3 - ')

# CORRECT — match the actual French word
item['title']['fr'] = item['title']['fr'].replace('Supplémentaire - ', '2.1.3 - ')
# OR set it directly
item['title']['fr'] = '2.1.3 - Rappel sur le prompting'
```

When adding a new item, always provide both `en` and `fr` values for every multilingual field.
If you do not have a French translation, duplicate the English value as a placeholder:
```python
item['title'] = { 'en': 'My New Module', 'fr': 'My New Module' }
```

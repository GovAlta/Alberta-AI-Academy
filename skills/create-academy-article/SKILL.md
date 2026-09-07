# Create Academy Article

Create or update an `article` type item in an AI Academy level JSON file.

Articles render their content from the `longDescription` field as markdown — they do **not** use `sections`. All content must be written into `longDescription` as a well-structured markdown document.

---

## When to Use This Skill

Use for content that:
- Is a reference document, assignment brief, FAQ, or capstone description
- Does not require a step-by-step module structure (hero, cards, quizzes)
- Should render as a single scrollable markdown page

For content with multiple sections, quizzes, and structured blocks → use `claude-design-html-to-module` instead.

---

## Inputs to Confirm Before Starting

1. **Level file** — which level JSON (`level1`, `level2`, `level3`, `masterclass`)
2. **Item ID** — e.g. `l2-2.1.2`
3. **Title** — including module number, e.g. `2.1.2 - AI Use Case Capstone`
4. **Day** — which day the item belongs to
5. **Content** — the full text to include (user-provided or from a source file)
6. **Existing item or new?** — if updating, read current state first

---

## Article JSON Schema

```json
{
  "id": "l2-2.1.2",
  "type": "article",
  "title":           { "en": "2.1.2 - Title", "fr": "2.1.2 - Titre" },
  "description":     { "en": "One-line summary.", "fr": "Résumé en une ligne." },
  "longDescription": { "en": "# Full markdown content...", "fr": "# Contenu complet en markdown..." },
  "imageUrl": "/images/some-image.png",
  "difficulty": "beginner",
  "duration":   { "en": "10 min", "fr": "10 min" },
  "day": 1,
  "tags": [ { "en": "Tag", "fr": "Étiquette" } ],
  "learningOutcomes": [ { "en": "Outcome.", "fr": "Résultat." } ],
  "source":   { "en": "Alberta AI Academy", "fr": "Alberta AI Academy" },
  "featured": false,
  "sections": []
}
```

**Key rules:**
- `type` must be `"article"` — never `"module"`
- `sections` must be `[]` — sections are ignored for article type
- `longDescription` carries ALL the content — format it as markdown
- All text fields use `{ "en": "...", "fr": "..." }` — provide real French translations

---

## Step 1 — Structure the longDescription

Convert the provided content into well-structured markdown. Use:

- `##` headings for major sections
- `**bold**` for key terms and labels
- Bullet lists (`-`) for unordered items
- Numbered lists (`1.`) for ordered steps or criteria
- `[Link text](URL)` for hyperlinks
- Horizontal rules `---` sparingly to separate major blocks

**Do not use:**
- `#` H1 headings (the article title is shown by the UI)
- Code blocks (not appropriate for article content)
- Tables (only if the content is genuinely tabular)

Write the full markdown for both `en` and `fr`. Provide real French translations — not English duplicates.

---

## Step 2 — Write the Update Script

Save to `scripts/update-<slug>.py`. Follow safe-json-edit rules — only touch the specific fields being changed.

```python
import json

level_path = 'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/src/data/<levelN>.json'

with open(level_path, encoding='utf-8') as f:
    data = json.load(f)

long_en = """<full markdown content>"""

long_fr = """<full French markdown content>"""

for item in data['items']:
    if item['id'] == '<item-id>':
        item['type'] = 'article'
        item['title']['en'] = '<title>'
        item['title']['fr'] = '<titre>'
        item['description']['en'] = '<description>'
        item['description']['fr'] = '<description fr>'
        item['longDescription'] = {'en': long_en, 'fr': long_fr}
        item['sections'] = []
        print(f"Updated: {item['title']['en']}")
        break

with open(level_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
```

Run it:
```bash
py scripts/update-<slug>.py
```

---

## Step 3 — Check Diff and Confirm

```bash
py scripts/check-diff.py frontend/src/data/<levelN>.json
```

Show the diff to the user. Confirm only the intended item was modified and only the expected fields changed.

**Only commit after the user explicitly approves the diff.**

---

## Step 4 — Commit

Stage only the JSON file and the update script:

```bash
git add frontend/src/data/<levelN>.json scripts/update-<slug>.py
git commit -m "content: update <item-id> <title>"
```

---

## Notes

- If the article needs a new image, generate one with the OpenAI image generation pattern used in other scripts (`generate-*.py`), then update `imageUrl` in a separate targeted script.
- If the item does not yet exist in the JSON (new item), append it to `data['items']` rather than looping to find it.
- `(UNDER REVIEW)` in a title means the content is provisional — append it to both EN and FR titles: `(UNDER REVIEW)` / `(EN RÉVISION)`.

# Skill: Rewrite Masterclass Module

## Position in workflow

**Comes after:** `academy-workflow` (routes here for masterclass module rewrites)

**Comes before:** `safe-json-edit` → `site-update`

Rewrites a raw transcript-based masterclass module into a fully designed, properly structured module with edited prose and a quiz. Apply to any masterclass module in `masterclass.json`.

The workflow has two creative stages:
1. **Content stage** — rewrite the transcript into clean prose with sections and a quiz
2. **HTML design stage** — produce a styled HTML layout (the design checkpoint), then map it to JSON block types

This mirrors the process: *"we are teaching AI Academy and we have a nice website that hosts our curriculum divided by modules. Make it look better and add an inspiring image that would look good in our learning materials."* No emojis.

---

## Source Files

- **PDF**: `C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf` (41 pages)
- **Data**: `C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/src/data/masterclass.json`

---

## Status: All modules complete

All Day 1–5 masterclass modules have been rewritten:
- **Day 1:** m.1.1–m.1.4 ✓
- **Day 2:** m.2.1–m.2.4 ✓ (m.2.4 is type=video with YouTube embed)
- **Day 3:** m.3.1–m.3.3 ✓
- **Day 4:** m.4.1–m.4.4 ✓
- **Day 5:** m.5.1–m.5.3 ✓

## PDF Page Map (41 pages total)

| Pages | Module | Topic |
|-------|--------|-------|
| 1–5   | m.1.1  | The AI Maximalist / Introduction / Roadmap / Who it's for / About Janak |
| 6–7   | m.1.2  | Human-Centred AI & Two Boxes |
| 8     | m.1.3  | AI Usage Levels |
| 9     | m.1.4  | The Power of Clear Thought |
| 10–11 | m.2.1  | Working with Data / Effectiveness alignment |
| 12    | m.2.2  | How AI Thinks & Why It Lies |
| 13–14 | m.2.3  | AI Toolkit / Best Tools 2025 |
| 15–16 | m.3.1  | Balancing Enablement & Privacy / Private Cloud |
| 17–18 | m.3.2  | Level 1 Prompting / Wedge of Context |
| 19–20 | m.3.3  | RICECO Framework |
| 21–23 | m.4.1  | Advanced Prompting |
| 24–26 | m.4.2  | Agents & Automation |
| 27–29 | m.4.3  | AI in the Organisation |
| 30–31 | m.4.4  | Strategic AI Planning |
| 32–35 | m.5.1  | Future of Work |
| 36–38 | m.5.2  | AI Ethics & Governance |
| 39–41 | m.5.3  | Your AI Journey |

*Verify page ranges by reading PDF text before extracting — the map above is approximate.*

---

## Workflow

### Step 1 — Identify the target module

Read `masterclass.json` and find the item by ID. Note:
- Current sections and raw content
- `day` field
- Existing `learningOutcomes` (keep or improve)

### Step 2 — Find and read relevant PDF pages

```python
import fitz
doc = fitz.open('C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf')
for i in range(len(doc)):
    print(f'--- Page {i+1} ---')
    print(doc[i].get_text()[:400])
```

Read the full text of the relevant pages before writing any content.

### Step 3 — Rewrite content into clean prose

For each conceptual section:
- Write in clear, direct prose — no transcript filler ("so", "um", "I would say")
- Use **bold** for key terms on first use, em dashes (—) for parenthetical phrases
- Keep intro paragraphs short (1–3 sentences)
- **No image blocks** — sections are composed entirely from block types
- **No list blocks** — parallel items always become `cards`
- For numbered sequences (e.g. 10 modules), use the number ("01", "02" etc.) as the card `icon`

Final section is always the quiz (4 questions, see quiz rules below).

### Step 4 — Produce the HTML design layout (design checkpoint)

**This is a required creative step.** For each module section produce a self-contained styled HTML page that:
- Looks polished and inspiring — suitable for professional learning materials
- Uses the indigo/purple palette (`#6366f1`, `#4f46e5`, `#818cf8`, `#c084fc`)
- **Hero on section 1 only** — dark gradient background, grid overlay, glow, badge, large headline. All other sections start directly with their content.
- Uses highlight callout boxes for core concepts and key principles
- Uses card grids for all parallel items (3–4 items, or numbered sequences up to 10)
- Uses stat boxes for striking facts or closing insights
- Short intro paragraph (`text`) before the first visual block only — everything else is cards, highlights, stats
- **No emojis** — use symbols (→, ◆, ✓) or module numbers as card icons
- **No slide images** — the design is entirely typographic and block-based

This HTML does not go anywhere — it is the design blueprint used to decide the block layout.

### Step 5 — Map HTML layout to JSON block types

| HTML pattern | JSON block type |
|---|---|
| Dark gradient hero with badge + headline (section 1 only) | `hero` |
| Left-border callout box with label | `highlight` |
| Card grid — parallel items or numbered sequence | `cards` |
| White box with heading + insight/stat text | `stat` |
| Short intro paragraph (1–3 sentences max) | `text` |
| ~~Bulleted/numbered list~~ | **never** — use `cards` |
| ~~Slide image~~ | **never** — no image blocks |
| Quiz question | `quiz` |

**Design philosophy:** Every section is a designed page, not a document. Favour cards, highlights, and stats over prose. A `text` block should only appear once per section as a brief intro — everything else gets structured visually.

**Block type schemas — all text fields are multilingual `{ "en": "...", "fr": "..." }` objects:**

```json
{ "type": "hero",
  "badge":          { "en": "Alberta AI Academy Masterclass", "fr": "Classe de maître : Alberta AI Academy" },
  "title":          { "en": "First line of headline", "fr": "Première ligne du titre" },
  "titleHighlight": { "en": "Highlighted words", "fr": "Mots mis en évidence" },
  "subtitle":       { "en": "One sentence subtitle.", "fr": "Sous-titre d'une phrase." }
}
{ "type": "highlight",
  "label":   { "en": "Label Text", "fr": "Texte de l'étiquette" },
  "content": { "en": "Markdown with **bold** terms.", "fr": "Markdown avec termes **gras**." }
}
{ "type": "cards", "items": [
  { "icon": "◆",
    "title":   { "en": "Card Title", "fr": "Titre de la carte" },
    "content": { "en": "Card body text.", "fr": "Corps de la carte." }
  }
]}
{ "type": "stat",
  "heading": { "en": "Heading text", "fr": "Texte du titre" },
  "content": { "en": "Body with **bold** key phrase.", "fr": "Corps avec expression clé **en gras**." }
}
{ "type": "text",
  "content": { "en": "Short intro paragraph only.", "fr": "Court paragraphe d'introduction seulement." }
}
{ "type": "quiz",
  "question":      { "en": "1. Question?", "fr": "1. Question ?" },
  "options":       [
    { "en": "Option A", "fr": "Option A" },
    { "en": "Option B", "fr": "Option B" },
    { "en": "Option C", "fr": "Option C" },
    { "en": "Option D", "fr": "Option D" }
  ],
  "correctAnswer": { "en": "Option B", "fr": "Option B" },
  "explanation":   { "en": "Why B is correct.", "fr": "Pourquoi B est correct." }
}
```

**Section titles are also multilingual:**
```json
{ "title": { "en": "Section Title", "fr": "Titre de section" }, "content": [...] }
```

**If you do not have a French translation, duplicate the English value as a placeholder:**
```json
{ "en": "Key Principle", "fr": "Key Principle" }
```

**Hero rules:**
- First block of section 1 only — never on sections 2+
- `title` is the plain part of the headline, `titleHighlight` gets the gradient treatment
- `badge` is always `"Alberta AI Academy Masterclass"`

**Card icon rules:** Use `◆` for standalone items, `→` for directional/example items, `"01"`–`"10"` for numbered sequences. Never emojis.

### Step 6 — Update masterclass.json

Write a Python script to a temp `.py` file and run it (never use `-c` — apostrophes break shell quoting):

```python
import json
path = 'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/src/data/masterclass.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# All section titles and block content must use { "en": "...", "fr": "..." } objects
new_sections = [
    {
        "title": { "en": "Section Title", "fr": "Section Title" },
        "content": [
            {
                "type": "hero",
                "badge":          { "en": "Alberta AI Academy Masterclass", "fr": "Alberta AI Academy Masterclass" },
                "title":          { "en": "Headline", "fr": "Headline" },
                "titleHighlight": { "en": "Highlight", "fr": "Highlight" },
                "subtitle":       { "en": "Subtitle.", "fr": "Subtitle." }
            }
        ]
    }
    # ... add more sections
]

for item in data['items']:
    if item['id'] == 'lm-m.1.2':  # change to target ID
        item['sections'] = new_sections
        break

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print('Done')
```

### Step 7 — Commit and push

```bash
cd "C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY"
git add frontend/src/data/masterclass.json
git commit -m "content: rewrite <module-id> <module-title> with proper module structure"
git push origin main && git push render main
```

---

## Quiz rules

- 4 questions per module
- Test comprehension of core ideas, not trivia
- Number as "1.", "2.", etc. in the `question` field
- 4 options — one clearly correct, distractors plausible but wrong
- `explanation` explains why the correct answer is right (2–3 sentences)
- No repeated concepts across questions
- No "according to the video" phrasing
- Quiz scoring is automatic: ≥ 70% shows "Good work!"; < 70% shows a retake option. Design questions so a well-prepared learner can reasonably score 70%+.

---

## Quality checklist before committing

- [ ] No raw transcript sentences remain
- [ ] HTML design stage produced before mapping to blocks
- [ ] No emojis anywhere
- [ ] No image blocks, no list blocks
- [ ] Hero on section 1 only
- [ ] Every section (except quiz) has at least one card grid or highlight
- [ ] `text` blocks used only as short section intros
- [ ] Quiz has exactly 4 questions
- [ ] JSON valid (`json.load` succeeded without error)
- [ ] Pushed to both `origin` and `render`

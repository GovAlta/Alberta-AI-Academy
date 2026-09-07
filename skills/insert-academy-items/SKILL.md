---
name: insert-academy-items
description: >
  Takes a JSON export from academy-editor.py and inserts or updates the items into a live
  Alberta AI Academy level JSON file (level1, level2, level3, or masterclass).
  Runs convert-editor-output.js, validates the result, and confirms what was added or updated.
  Use this skill when the user says "insert these items", "add to level", "push editor output
  to the site", or hands over a JSON file exported from academy-editor.py.
---

# Insert Academy Editor Items into Site

## Position in workflow

**Comes after:** content has been prepared in a JSON export file from academy-editor.py

**Comes before:** `site-update`

> Note: For HTML, dump, or masterclass content, use `safe-json-edit` directly instead.
> This skill is specifically for academy-editor.py JSON exports.

Take an `academy-editor.py` JSON export and merge it into a live level JSON file.

## Reference files

- Script: `scripts/convert-editor-output.js`
- Live data: `frontend/src/data/level1|2|3|masterclass.json`

---

## Workflow

### Step 1 — Get the export file path

If the user hasn't provided a file path, ask:
> "What is the path to your academy-editor.py JSON export file?"

### Step 2 — Get the target level

If the user hasn't specified, ask:
> "Which level should these items go into? (level1, level2, level3, or masterclass)"

### Step 3 — Pre-flight checks

Before running, read the export file and check:

1. **Is it a valid JSON array?** If not, report the parse error.
2. **Do all items have an `id` field?** List any without one — warn the user they will be skipped.
3. **Do any IDs already exist in the target level?** List them — confirm the user wants to update (not just add).
4. **Are all `day` values valid?** Check each item's `day` against the days that exist in the target level file. Warn if any day is missing.
5. **Schema check** — verify all 20 required fields are present on each item:
   `id, title, type, description, longDescription, imageUrl, youtubeId, url, downloadUrl, fileType, fileSize, source, tags, duration, difficulty, featured, day, learningOutcomes, sections`
6. **Multilingual check** — verify that text fields use the `{ "en": "...", "fr": "..." }` format:
   - `title`, `description`, `longDescription`, `source`, `duration` must be `{ en, fr }` objects
   - `tags` and `learningOutcomes` (when non-empty) must be arrays of `{ en, fr }` objects
   - Section titles and block content fields must be `{ en, fr }` objects
   - `convert-editor-output.js` will auto-wrap plain strings as `{ en: val, fr: val }` if needed,
     but flag any plain-string fields so the user knows French will be missing

Report findings clearly before proceeding. Stop on blockers (no id, invalid JSON); confirm on warnings (missing day, existing IDs, missing French translations).

### Step 4 — Run the script

From the repo root:

```bash
node scripts/convert-editor-output.js "<export-file>" <level>
```

### Step 5 — Verify the result

After the script runs, read the updated level JSON and confirm:
- Each new item's `id` appears in `items[]`
- Each new item's `id` appears in the correct `days[].itemIds[]`
- Updated items have the new field values

Report a summary table:

| ID | Title | Action | Day |
|----|-------|--------|-----|
| l1-1.3.1 | ... | Added | 3 |
| l1-1.2.1 | ... | Updated | 2 |

### Step 6 — Run diff check

```bash
py scripts/check-diff.py frontend/src/data/<levelfile>.json
```

Show the output and wait for user approval before committing.

### Step 7 — Commit and push

After approval:
```bash
git add frontend/src/data/<levelfile>.json
git commit -m "content: insert items from academy-editor export"
git push origin main && git push render main
```

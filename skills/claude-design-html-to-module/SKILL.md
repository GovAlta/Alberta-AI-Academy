---
name: claude-design-html-to-module
description: >
  Converts an HTML slide deck in the Alberta Academy bundler format into a valid
  Academy module JSON item. The bundler format stores slide HTML as a JSON-encoded
  string inside <script type="__bundler/template"> and images as base64 PNGs inside
  <script type="__bundler/manifest">. Extracts all slide content faithfully, writes
  a Python build script, runs it, and inserts the result into the level JSON as a
  preview item for local review.
  Use this skill when the user provides a .html file from the Level 2 slide deck system.
---

# Claude Design HTML → Academy Module

Convert a bundler-format HTML slide deck into an Alberta AI Academy module.

---

## Before Starting

Confirm:
1. Path to the `.html` file
2. Level and day number
3. Item ID (or derive it)
4. Any supplementary `.docx` or `.pdf` files with extra detail for specific sections

---

## Step 1 — Extract and List All Slides

```python
import json, re, html as htmlmod
with open(r'<PATH>', encoding='utf-8') as f:
    src = f.read()
scripts = re.findall(r'<script type="__bundler/template">(.*?)</script>', src, re.DOTALL)
content = htmlmod.unescape(json.loads(scripts[0]))
slides = re.findall(r'<section[^>]*>.*?</section>', content, re.DOTALL)
def clean(h):
    t = re.sub(r'<[^>]+>', ' ', h)
    return re.sub(r'\s+', ' ', t).strip()
for i, s in enumerate(slides):
    label = re.search(r'data-label="([^"]+)"', s)
    print(f'{i:02d}: [{label.group(1) if label else ""}] {clean(s)[:200]}')
```

Report the full slide list. Mark which slides to **skip** (Demo/live screen share, Q&A, Cover, wrap/end) and which to **include** as content.

For any slide containing complex layout (comparison grids, tables), print its full HTML to inspect the structure:
```python
print(slides[N])
```

---

## Step 2 — Extract Images from Manifest

```python
import json, re, base64, os, html as htmlmod
with open(r'<PATH>', encoding='utf-8') as f:
    src = f.read()
manifest_raw = re.findall(r'<script type="__bundler/manifest">(.*?)</script>', src, re.DOTALL)
if not manifest_raw:
    print("No manifest found")
else:
    manifest = json.loads(manifest_raw[0])
    template = htmlmod.unescape(json.loads(re.findall(r'<script type="__bundler/template">(.*?)</script>', src, re.DOTALL)[0]))
    img_uuids = set(re.findall(r'src="([a-f0-9]{8}-[a-f0-9\-]+)"', template))
    dest = r'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/public/images'
    for uuid, entry in manifest.items():
        if uuid not in img_uuids: continue
        mime = entry.get('type', '')
        if not any(t in mime for t in ['png','jpeg','jpg','gif','webp']): continue
        ext = mime.split('/')[-1].replace('jpeg','jpg')
        fname = f'<MODULE_PREFIX>-img-{uuid[:8]}.{ext}'
        with open(os.path.join(dest, fname), 'wb') as out:
            out.write(base64.b64decode(entry['data']))
        print(f'Extracted: {fname} ({len(entry["data"])//1365} KB)')
```

**After extraction:** Read each image to understand what it shows, then rename files descriptively (e.g. `cowork-setup-step2-all-agents.png` not `cowork-img-13116e67.png`).

---

## Step 3 — Map Slides to Sections and Blocks

| Slide pattern | Block mapping |
|---|---|
| Title / "What is X" slide | `hero` + `highlight` (definition) in section 1 |
| Comparison grid (CSS grid, 4 columns) | `text` block with markdown table — the grid is NOT a `<table>`, it's `div[style*=grid-template-columns]` rows |
| Numbered steps | `cards` with icons "01"–"05" etc. |
| Key principles / framing | `highlight` block |
| Skills list (many items) | `cards` split into 2 blocks if > 6 items |
| Use case (brief + output) | `highlight` with **bold** Task/Brief/Output labels |
| Screenshot after use case | `image` block immediately after the highlight |
| File location / folder tree | `stat` + `text` with code-fenced tree |
| Exercise (numbered steps) | Separate "Exercise" section with `cards` |
| Additional reading / links | Separate "Additional Reading" section with `highlight` |
| Quiz (Q + Answer slide pairs) | `quiz` blocks in final "Quiz" section — use all questions from the HTML |
| Demo, Q&A, wrap | **Skip** |

**Markdown in blocks:** Only `text`, `highlight`, and `stat` blocks render markdown. Card `content` is plain text — no markdown syntax in card bodies.

**Images with steps:** When a section has step-by-step instructions with screenshots, interleave `highlight` blocks (one per step) with `image` blocks so each screenshot sits directly below the step it illustrates. Do NOT put all steps in a `cards` block then dump all images at the end.

---

## Step 4 — Write the Build Script

Save to `scripts/build-<module-name>.py`. All text fields must use `{"en": "...", "fr": "..."}` — provide real French translations, not English duplicates.

Run it:
```bash
py scripts/build-<module-name>.py
```

Verify output shows the expected section count and block types for every section.

---

## Step 5 — Write and Run the Insert Script

Save to `scripts/insert-<module-name>-preview.py`:

```python
import json
level_path = 'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/src/data/<levelN>.json'
draft_path = 'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/scripts/draft-<module-name>.json'
with open(level_path, encoding='utf-8') as f: data = json.load(f)
with open(draft_path, encoding='utf-8') as f: item = json.load(f)
preview_id = '<prefix>-preview-<module-name>'
item['id'] = preview_id
item['title'] = {"en": f"PREVIEW - {item['title']['en']}", "fr": f"PREVIEW - {item['title']['fr']}"}
data['items'] = [i for i in data['items'] if i['id'] != preview_id]
data['items'].append(item)
with open(level_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print(f"Inserted. Total items: {len(data['items'])}, day: {item['day']}")
```

Run it:
```bash
py scripts/insert-<module-name>-preview.py
```

---

## Step 6 — Supplementary Files

If the user provides `.docx` files with extra detail for a section:

**Extract text:**
```python
import zipfile, re
with zipfile.ZipFile(r'<PATH>', 'r') as z:
    with z.open('word/document.xml') as f: xml = f.read().decode('utf-8')
text = re.sub(r'</w:p>', '\n', xml)
text = re.sub(r'<[^>]+>', '', text)
print(re.sub(r'\n{3,}', '\n\n', text).strip())
```

**Extract images:**
```python
import zipfile, shutil, os
with zipfile.ZipFile(r'<PATH>', 'r') as z:
    for m in [n for n in z.namelist() if n.startswith('word/media/')]:
        fname = '<prefix>-' + os.path.basename(m)
        dest = r'C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY/frontend/public/images/' + fname
        with z.open(m) as src, open(dest, 'wb') as dst: shutil.copyfileobj(src, dst)
        print(f'Extracted: {fname}')
```

Read each image, rename descriptively, then merge into the relevant section of the build script.

---

## Step 7 — Review and Confirm

Tell the user:
> "Preview is live at http://localhost:5173/<levelN> — look for 'PREVIEW - <Title>' on Day <N>. Check all sections and let me know if anything needs adjusting."

Wait for the user to confirm the content is correct before assigning a final ID and inserting.

---

## Orange Theme (Level 2)

Level 2 modules get the orange theme automatically when `item.id.startsWith('l2-')`. No extra config needed.

---

## After This Skill

Once content is approved → use **`safe-json-edit`** to assign the final ID and insert, then **`site-update`** to deploy.

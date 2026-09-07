---
name: academy-workflow
description: >
  Orchestrates the correct sequence of skills for any Alberta AI Academy site update.
  Routes to the right entry skill based on what the user is doing and what their content
  source is, then enforces the common safe-edit → deploy tail.
  Use this skill when the user says "I want to update the site", "I have new content",
  "I need to add a module", "I need to edit something", or any request that involves
  changing content or deploying the Alberta AI Academy site.
---

# Academy Workflow Orchestrator

Identify what the user is doing and route to the correct skill sequence.

**The site is live with active users. Every update follows a safe sequence — no shortcuts.**

---

## Step 1 — Identify the operation

Ask the user (if not already clear from context):

> "What are you working on today?"
> - Adding new content
> - Editing existing content
> - Rewriting a masterclass module
> - Deploying changes that are already committed

---

## Step 2 — Identify the content source (for new content only)

If adding new content, ask:

> "What format is your source content in?"
> - HTML file
> - PDF file *(coming soon — skill not yet available)*
> - Word / DOCX file *(coming soon — skill not yet available)*
> - Legacy Supabase dump record
> - Writing directly from scratch

---

## Step 3 — Route to the correct workflow

### A. Adding new content from an HTML file
```
html-to-academy-item  →  safe-json-edit  →  site-update
```
1. Use **`html-to-academy-item`** to convert the HTML into a valid JSON item
2. Use **`safe-json-edit`** to insert it into the level JSON safely
3. Use **`site-update`** to commit and deploy

### B. Adding new content from the legacy Supabase dump
```
convert-academy-dump  →  safe-json-edit  →  site-update
```
1. Use **`convert-academy-dump`** to convert the dump record into a JSON item
2. Use **`safe-json-edit`** to insert it into the level JSON safely
3. Use **`site-update`** to commit and deploy

### C. Adding new content from a PDF file
> PDF → Academy converter skill is not yet available.
> Ask the user to convert the content to HTML first, then use workflow A.

### D. Adding new content from a Word / DOCX file
> Word → Academy converter skill is not yet available.
> Ask the user to convert the content to HTML first, then use workflow A.

### E. Editing existing content (any level or masterclass)
```
safe-json-edit  →  site-update
```
1. Use **`safe-json-edit`** to make the targeted change safely
2. Use **`site-update`** to commit and deploy

### F. Rewriting a masterclass module from PDF
```
rewrite-masterclass-module  →  safe-json-edit  →  site-update
```
1. Use **`rewrite-masterclass-module`** to rewrite the module content from the PDF
2. Use **`safe-json-edit`** to apply the updated sections to `masterclass.json`
3. Use **`site-update`** to commit and deploy

### G. Deploying already-committed changes
```
site-update
```
1. Use **`site-update`** directly — changes are already in the working copy

---

## Rules that apply to every workflow

- **Never skip `safe-json-edit`** — even small JSON changes must go through the diff check
- **Never push to `render` without pushing to `origin` first**
- **Never commit JSON and code changes in the same commit**
- **Always get explicit user approval of the diff before committing**
- **French values** — when adding new content, duplicate English as placeholder French.
  Do not leave French fields empty.

---

## Skill Quick Reference

| Skill | What it does |
|---|---|
| `html-to-academy-item` | Converts an HTML file into a valid Academy JSON item |
| `convert-academy-dump` | Converts a legacy Supabase dump record into a JSON item |
| `rewrite-masterclass-module` | Rewrites a masterclass module from the PDF source |
| `safe-json-edit` | Safely inserts or edits items in level JSON with diff check |
| `site-update` | Commits, pushes to origin, confirms, then deploys to render |

---

## Upcoming Skills (not yet available)

| Skill | Status |
|---|---|
| `pdf-to-academy-item` | Planned — converts PDF content to Academy JSON |
| `docx-to-academy-item` | Planned — converts Word files to Academy JSON |

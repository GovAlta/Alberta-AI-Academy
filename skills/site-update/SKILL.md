---
name: site-update
description: >
  Safe workflow for updating the live Alberta AI Academy site while it is in active use.
  Covers making changes locally, testing, running the diff check, and deploying to production
  via the two-remote git setup (origin = GitHub, render = production).
  Use this skill when the user says "update the site", "push changes", "deploy", or
  "commit and push" — especially when the site has active users.
---

# Site Update — Safe Deployment Workflow

## Position in workflow

**Always last** — this skill is the final step in every Academy update workflow.

**Comes after:** `safe-json-edit` (or `insert-academy-items` for editor exports)

The Alberta AI Academy is a **live site with active users**. Every update must follow
this workflow to avoid breaking the site mid-session for someone using it.

---

## Remotes

| Remote | Repo | Effect |
|--------|------|--------|
| `origin` | GovAlta-EMU/AIM-AI-ACADEMY (GitHub) | Source of truth — no auto-deploy |
| `render` | pronghorn-cloud/newacademy-* | **Auto-deploys to production on every push** |

**Rule:** Always push to `origin` first. Only push to `render` when the change is confirmed ready.

---

## Workflow

### Step 1 — Make changes locally

Work in `C:/_LOCALdata/AI Academy Site/AIM-AI-ACADEMY`.

For JSON content changes, follow the `safe-json-edit` skill rules:
- Use targeted Python scripts (never reassign whole items)
- All text fields must use multilingual `{ "en": "...", "fr": "..." }` format

### Step 2 — Run the diff check

After any JSON file change, always run:

```bash
py scripts/check-diff.py frontend/src/data/<levelfile>.json
```

Review the output. Confirm only the intended items and fields changed.
**Do not proceed if unexpected items appear in the diff.**

### Step 3 — Test locally

```bash
cd frontend
npm run dev
```

Open the browser and verify:
- The changed content displays correctly
- Navigation still works
- No console errors

If it's a code change (Vue components, scripts), check multiple pages and edge cases.

### Step 4 — Stage and commit

**JSON data changes — stage only the specific file(s):**
```bash
git add frontend/src/data/level1.json
git commit -m "content: <what changed>"
```

**Code changes:**
```bash
git add <specific files only — never git add . or git add -A on JSON files>
git commit -m "feat|fix|config: <what changed>"
```

**Commit message prefixes:**
- `content:` — JSON data changes (any level, any content type)
- `feat:` — new UI feature or behaviour
- `fix:` — bug fix
- `config:` — level locking, env vars, settings
- `docs:` — README, CLAUDE.md, documentation
- `chore:` — maintenance, scripts, non-functional

### Step 5 — Push to origin (GitHub) first

```bash
git push origin main
```

This updates GitHub but does **not** trigger a production deploy.
The site remains unchanged for users.

### Step 6 — Confirm and push to render (production)

Ask the user:
> "Changes are on GitHub. Ready to push to production (render)? This will deploy immediately."

After confirmation:

```bash
git push render main
```

Render auto-deploys on push. The deploy typically takes **1–3 minutes**.
During this window, users on the site see the previous version until the new build is live.
Because it is a static site, there is no downtime or broken mid-state.

### Step 7 — Verify production

After the deploy completes, confirm the change is live:
- Open the production URL and check the updated content
- If something looks wrong, report it to the user immediately

---

## Emergency Rollback

If a bad deploy goes out:

```bash
# Revert to previous commit
git revert HEAD --no-edit
git push origin main && git push render main
```

Or restore a specific file from a known-good baseline commit:
```bash
git show <baseline-hash>:frontend/src/data/level1.json > frontend/src/data/level1.json
git add frontend/src/data/level1.json
git commit -m "content: restore level1.json to baseline <hash>"
git push origin main && git push render main
```

Known baseline commits (from memory):
- `2307b70` — 2026-03-12 — l1-1.5.1 walkthrough video, quiz at section 14
- `79b8623` — 2026-03-11 — l1-1.1.8 text edits, home page video fixes

---

## Quick Reference — Full Push Command

```bash
git push origin main && git push render main
```

Only use this combined form after the diff has been reviewed and the user has confirmed
the change is ready for production.

---

## What NOT to do

- Never `git push render main` without reviewing `check-diff.py` output first
- Never use `git add .` or `git add -A` when any JSON data file is modified
- Never push code and JSON data changes in the same commit
- Never push directly to render without pushing to origin first

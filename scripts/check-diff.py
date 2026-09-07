"""
check-diff.py — Safe JSON Edit diff checker
Usage: py check-diff.py <path-to-json-file>

Compares the current working copy of a level JSON file against HEAD,
reports every item that changed and which fields were affected.

Schema note: All text fields (title, description, longDescription, source,
duration, tags, learningOutcomes, section titles, block content) are
multilingual objects: { "en": "...", "fr": "..." }
This script handles both plain strings and multilingual objects.
"""
import sys
import json
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

if len(sys.argv) < 2:
    print("Usage: py check-diff.py <path-to-json-file>")
    sys.exit(1)

filepath = sys.argv[1]

# Load current working copy
with open(filepath, encoding='utf-8') as f:
    current = json.load(f)

# Load HEAD version from git
try:
    git_root = subprocess.check_output(
        ['git', 'rev-parse', '--show-toplevel'],
        stderr=subprocess.DEVNULL
    ).decode('utf-8').strip()

    rel_path = filepath.replace('\\', '/').replace(git_root.replace('\\', '/') + '/', '')

    head_raw = subprocess.check_output(
        ['git', 'show', f'HEAD:{rel_path}'],
        stderr=subprocess.DEVNULL
    )
    head = json.loads(head_raw)
except subprocess.CalledProcessError:
    print("ERROR: Could not load HEAD version from git. Is this file tracked?")
    sys.exit(1)

def en(val):
    """Extract English string for display; handles plain strings and { en, fr } objects."""
    if isinstance(val, dict):
        return val.get('en', str(val))
    return str(val) if val is not None else ''

def display(val, max_len=50):
    """Short display string for a field value (handles multilingual objects)."""
    if isinstance(val, dict) and 'en' in val:
        return repr(val['en'])[:max_len]
    if isinstance(val, list) and val and isinstance(val[0], dict) and 'en' in val[0]:
        preview = ', '.join(v.get('en', '') for v in val[:3])
        return f'[{preview[:max_len]}]'
    return repr(val)[:max_len]

# Build maps by item ID
head_map = {i['id']: i for i in head.get('items', [])}
curr_map = {i['id']: i for i in current.get('items', [])}

added = [id for id in curr_map if id not in head_map]
removed = [id for id in head_map if id not in curr_map]
changed = []

TOP_LEVEL_FIELDS = ['type', 'title', 'description', 'longDescription', 'youtubeId',
                    'imageUrl', 'url', 'downloadUrl', 'source', 'tags', 'duration',
                    'difficulty', 'featured', 'day', 'learningOutcomes']

for id in head_map:
    if id not in curr_map:
        continue
    h = head_map[id]
    c = curr_map[id]
    if h == c:
        continue

    diffs = []
    for field in TOP_LEVEL_FIELDS:
        if h.get(field) != c.get(field):
            diffs.append(f'  {field}: {display(h.get(field))} -> {display(c.get(field))}')

    # Check sections
    h_secs = h.get('sections') or []
    c_secs = c.get('sections') or []
    if len(h_secs) != len(c_secs):
        diffs.append(f'  sections count: {len(h_secs)} -> {len(c_secs)}')
    else:
        for si, (hs, cs) in enumerate(zip(h_secs, c_secs)):
            h_blocks = hs.get('content') or []
            c_blocks = cs.get('content') or []
            sec_title = en(hs.get('title', ''))
            if h_blocks != c_blocks:
                if len(h_blocks) != len(c_blocks):
                    diffs.append(f'  section[{si}] "{sec_title[:40]}" block count: {len(h_blocks)} -> {len(c_blocks)}')
                else:
                    for bi, (hb, cb) in enumerate(zip(h_blocks, c_blocks)):
                        if hb != cb:
                            diffs.append(f'  section[{si}] "{sec_title[:30]}" block[{bi}] ({hb.get("type")}) changed')

    if diffs:
        changed.append((id, diffs))

# Report
print('=' * 60)
print('SAFE JSON EDIT — DIFF REPORT')
print('=' * 60)
print(f'File: {filepath}')
print()

if not added and not removed and not changed:
    print('No changes detected vs HEAD.')
    sys.exit(0)

if added:
    print(f'ADDED items ({len(added)}):')
    for id in added:
        item = curr_map[id]
        print(f'  + {id} — {en(item.get("title",""))}')
    print()

if removed:
    print(f'REMOVED items ({len(removed)}):')
    for id in removed:
        item = head_map[id]
        print(f'  - {id} — {en(item.get("title",""))}')
    print()

if changed:
    print(f'MODIFIED items ({len(changed)}):')
    for id, diffs in changed:
        item = curr_map[id]
        print(f'\n  {id} — {en(item.get("title",""))}:')
        for d in diffs:
            print(f'   {d}')
    print()

print('=' * 60)
print(f'SUMMARY: {len(added)} added, {len(removed)} removed, {len(changed)} modified')
print('Review the above and confirm with the user before committing.')
print('=' * 60)

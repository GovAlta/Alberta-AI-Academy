#!/usr/bin/env node
/**
 * convert-editor-output.js
 *
 * Inserts or updates items exported from academy-editor.py into a live level JSON file.
 *
 * Usage:
 *   node convert-editor-output.js <items-export.json> <level1|level2|level3|masterclass>
 *
 * Examples:
 *   node convert-editor-output.js new-day3-items.json level1
 *   node convert-editor-output.js masterclass-items.json masterclass
 *
 * Behaviour:
 *   - If item.id already exists in the level file → updates the item in-place
 *   - If item.id is new → appends to items[] and adds to days[day].itemIds[]
 *   - Items with no id are skipped with a warning
 *   - Creates a timestamped backup of the level file before writing
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── paths ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'frontend', 'src', 'data');

const VALID_LEVELS = ['level1', 'level2', 'level3', 'masterclass'];

// ─── cli args ────────────────────────────────────────────────────────────────

const [,, editorFile, levelArg] = process.argv;

if (!editorFile || !levelArg) {
  console.error('Usage: node convert-editor-output.js <items-export.json> <level1|level2|level3|masterclass>');
  process.exit(1);
}

if (!VALID_LEVELS.includes(levelArg)) {
  console.error(`Invalid level "${levelArg}". Must be one of: ${VALID_LEVELS.join(', ')}`);
  process.exit(1);
}

// ─── load files ──────────────────────────────────────────────────────────────

let editorItems;
try {
  const raw = fs.readFileSync(editorFile, 'utf8');
  editorItems = JSON.parse(raw);
} catch (e) {
  console.error(`Could not read editor export file "${editorFile}":\n${e.message}`);
  process.exit(1);
}

if (!Array.isArray(editorItems)) {
  console.error('Editor export must be a JSON array of items.');
  process.exit(1);
}

const levelFile = path.join(DATA_DIR, `${levelArg}.json`);
let levelData;
try {
  levelData = JSON.parse(fs.readFileSync(levelFile, 'utf8'));
} catch (e) {
  console.error(`Could not read level file "${levelFile}":\n${e.message}`);
  process.exit(1);
}

// ─── validate level structure ────────────────────────────────────────────────

if (!Array.isArray(levelData.items)) {
  console.error('Level JSON does not have an "items" array.');
  process.exit(1);
}
if (!Array.isArray(levelData.days)) {
  console.error('Level JSON does not have a "days" array.');
  process.exit(1);
}

// ─── backup ──────────────────────────────────────────────────────────────────

const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = levelFile.replace('.json', `-backup-${ts}.json`);
fs.copyFileSync(levelFile, backup);
console.log(`Backup created: ${path.basename(backup)}`);

// ─── process items ───────────────────────────────────────────────────────────

let added = 0, updated = 0, skipped = 0;

for (const item of editorItems) {
  // Validate required fields
  if (!item.id || !item.id.trim()) {
    console.warn(`  SKIP (no id): "${item.title || '(untitled)'}"`);
    skipped++;
    continue;
  }

  const id = item.id.trim();

  // Ensure the item has a type
  if (!item.type) {
    console.warn(`  SKIP (no type): "${id}"`);
    skipped++;
    continue;
  }

  // Normalise: guarantee all schema fields present
  const clean = normaliseItem(item);

  const existingIdx = levelData.items.findIndex(i => i.id === id);

  if (existingIdx >= 0) {
    // ── Update existing item ──
    levelData.items[existingIdx] = clean;
    updated++;
    console.log(`  UPDATE: ${id} — ${displayStr(clean.title)}`);
  } else {
    // ── Add new item ──
    levelData.items.push(clean);

    const day = typeof clean.day === 'number' ? clean.day : parseInt(clean.day, 10) || 1;
    const dayEntry = levelData.days.find(d => d.day === day);

    if (dayEntry) {
      if (!dayEntry.itemIds.includes(id)) {
        dayEntry.itemIds.push(id);
      }
      console.log(`  ADD:    ${id} — ${displayStr(clean.title)}  →  day ${day}`);
    } else {
      console.warn(`  ADD:    ${id} — ${displayStr(clean.title)}  (WARNING: day ${day} not found in ${levelArg} — item added to items[] but not to any day)`);
    }

    added++;
  }
}

// ─── write output ────────────────────────────────────────────────────────────

fs.writeFileSync(levelFile, JSON.stringify(levelData, null, 2), 'utf8');

console.log('');
console.log('─────────────────────────────────────────');
console.log(`Done.`);
console.log(`  ${added}   item(s) added`);
console.log(`  ${updated}   item(s) updated`);
console.log(`  ${skipped}   item(s) skipped`);
console.log(`  Output → ${levelFile}`);

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap a value as a multilingual object { en, fr } if it is a plain string.
 * If it is already a { en, fr } object, pass it through unchanged.
 * Used for: title, description, longDescription, source, duration.
 */
function mlStr(val, fallback = '') {
  if (val && typeof val === 'object' && ('en' in val || 'fr' in val)) return val;
  const s = String(val || fallback).trim();
  return { en: s, fr: s };
}

/**
 * Ensure an array of tags or learningOutcomes is an array of { en, fr } objects.
 * Plain strings are wrapped; objects are passed through.
 */
function mlArr(val) {
  if (!Array.isArray(val)) return [];
  return val.map(v => {
    if (v && typeof v === 'object' && ('en' in v || 'fr' in v)) return v;
    const s = String(v || '');
    return { en: s, fr: s };
  });
}

/**
 * Extract a display string from a multilingual field (for console logging).
 */
function displayStr(val) {
  if (val && typeof val === 'object' && 'en' in val) return val.en;
  return String(val || '');
}

/**
 * Guarantee every required schema field is present on an item.
 * All text fields are normalised to multilingual { en, fr } objects.
 * Extra fields from the editor are preserved as-is.
 */
function normaliseItem(item) {
  return {
    id:               String(item.id || '').trim(),
    title:            mlStr(item.title),
    type:             String(item.type || 'article'),
    description:      mlStr(item.description),
    longDescription:  mlStr(item.longDescription),
    imageUrl:         String(item.imageUrl || ''),
    youtubeId:        item.youtubeId   || null,
    url:              item.url         || null,
    downloadUrl:      item.downloadUrl || null,
    fileType:         item.fileType    || null,
    fileSize:         item.fileSize    || null,
    source:           mlStr(item.source, 'Alberta AI Academy'),
    tags:             mlArr(item.tags),
    duration:         mlStr(item.duration),
    difficulty:       String(item.difficulty || 'beginner'),
    featured:         Boolean(item.featured),
    day:              typeof item.day === 'number' ? item.day : (parseInt(item.day, 10) || 1),
    learningOutcomes: mlArr(item.learningOutcomes),
    sections:         Array.isArray(item.sections) ? item.sections : [],
  };
}

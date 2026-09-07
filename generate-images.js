/**
 * generate-images.js
 *
 * Scans all curriculum JSON files for items missing imageUrl, reads their
 * content to build a contextual prompt, generates an image via Gemini,
 * saves it to frontend/public/images/, and updates the JSON file.
 *
 * Usage:
 *   node generate-images.js              # Generate all missing images
 *   node generate-images.js --dry-run    # Preview prompts without generating
 *   node generate-images.js --limit 5    # Generate only the first 5 missing
 *   node generate-images.js --file level3.json  # Only process one file
 *
 * Requires: GEMINI_API_KEY in .env (or environment variable)
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ── Config ──────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'frontend', 'src', 'data');
const IMG_DIR = path.join(ROOT, 'frontend', 'public', 'images');
const ENV_FILE = path.join(ROOT, '.env');

const JSON_FILES = ['masterclass.json', 'level1.json', 'level2.json', 'level3.json'];

const MODEL = 'gemini-3.1-flash-image-preview';

// ── Load API key ────────────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const match = content.match(/GEMINI_API_KEY=([^\s#]+)/);
    if (match) return match[1];
  }
  throw new Error('GEMINI_API_KEY not found in environment or .env file');
}

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
const fileIdx = args.indexOf('--file');
const FILE_FILTER = fileIdx >= 0 ? args[fileIdx + 1] : null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashString(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
}

/** Extract a concise content summary from an item for the image prompt */
function getContentSummary(item) {
  const parts = [];
  parts.push(item.title);
  if (item.description) parts.push(item.description);

  // Pull first 2 text blocks from first section for context
  if (item.sections && item.sections.length > 0) {
    const firstSec = item.sections[0];
    let textCount = 0;
    for (const block of firstSec.content) {
      if (block.type === 'text' && block.content && textCount < 2) {
        parts.push(block.content.substring(0, 200));
        textCount++;
      }
    }
  }

  return parts.join('. ').substring(0, 600);
}

/** Build the image generation prompt for an item */
function buildPrompt(item, levelTitle) {
  const summary = getContentSummary(item);

  return `Create a professional, modern illustration for an e-learning module card image.
The module is part of "${levelTitle}" in the Alberta AI Academy, a government AI training program.

Module title: "${item.title}"
Module topic: ${summary}

Style requirements:
- Clean, professional illustration suitable for a government training platform
- Modern flat design or subtle 3D style with soft gradients
- Color palette: blues, teals, and purples (professional government tones)
- Abstract or conceptual representation of the topic — NOT text-heavy
- 16:9 aspect ratio, suitable as a card thumbnail
- No text, no words, no letters, no numbers in the image
- No faces or identifiable people
- Visually represent the key concept with icons, shapes, or abstract imagery`;
}

/** Sleep helper for rate limiting */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = loadApiKey();
  const ai = new GoogleGenAI({ apiKey });

  fs.mkdirSync(IMG_DIR, { recursive: true });

  const filesToProcess = FILE_FILTER
    ? [FILE_FILTER]
    : JSON_FILES;

  // Collect all items that need images
  const tasks = [];
  for (const file of filesToProcess) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} — not found`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.imageUrl) {
        tasks.push({ file, filePath, itemIndex: i, item, levelTitle: data.title });
      }
    }
  }

  console.log(`Found ${tasks.length} items missing images`);
  if (DRY_RUN) console.log('DRY RUN — no images will be generated\n');

  const toProcess = tasks.slice(0, LIMIT);
  console.log(`Processing ${toProcess.length} items...\n`);

  let generated = 0;
  let failed = 0;

  for (let t = 0; t < toProcess.length; t++) {
    const { file, filePath, itemIndex, item, levelTitle } = toProcess[t];
    const prompt = buildPrompt(item, levelTitle);

    console.log(`[${t + 1}/${toProcess.length}] ${item.id} — ${item.title}`);

    if (DRY_RUN) {
      console.log(`  Prompt: ${prompt.substring(0, 120)}...`);
      console.log('');
      continue;
    }

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseModalities: ['image', 'text'],
        },
      });

      let saved = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, 'base64');

          // Determine extension from MIME type
          const mime = part.inlineData.mimeType || 'image/png';
          const ext = mime.includes('jpeg') ? '.jpg' : mime.includes('webp') ? '.webp' : '.png';

          const filename = `gen-${hashString(item.id)}${ext}`;
          const imgPath = path.join(IMG_DIR, filename);
          fs.writeFileSync(imgPath, buffer);

          const localUrl = `/images/${filename}`;

          // Update the JSON in memory
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          data.items[itemIndex].imageUrl = localUrl;
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

          console.log(`  ✓ Saved: ${filename} (${(buffer.length / 1024).toFixed(0)}KB)`);
          generated++;
          saved = true;
          break;
        }
      }

      if (!saved) {
        console.log(`  ✗ No image in response`);
        failed++;
      }

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      failed++;
    }

    // Rate limiting — Gemini has limits, be gentle
    if (t < toProcess.length - 1) {
      await sleep(3000);
    }
  }

  console.log(`\nDone! Generated: ${generated}, Failed: ${failed}`);
  if (generated > 0) {
    console.log(`Images saved to: ${IMG_DIR}`);
    console.log('JSON files updated with local image paths.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

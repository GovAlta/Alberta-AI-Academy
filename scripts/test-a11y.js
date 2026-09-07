#!/usr/bin/env node
/**
 * Accessibility Audit Test Script
 *
 * Scans the Vue component source files for WCAG 2.1 AA compliance markers.
 * This is a static analysis tool — it checks that the required ARIA attributes,
 * semantic HTML, focus management, and TTS integration are present in the codebase.
 *
 * Run: node scripts/test-a11y.js
 *
 * Exit code 0 = all checks pass, 1 = failures found.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const WARN = '\x1b[33m⚠\x1b[0m'
let passed = 0
let failed = 0
let warned = 0

function read(relPath) {
  const full = resolve(ROOT, relPath)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf-8')
}

function check(label, condition) {
  if (condition) {
    console.log(`  ${PASS} ${label}`)
    passed++
  } else {
    console.log(`  ${FAIL} ${label}`)
    failed++
  }
}

function warn(label, condition) {
  if (condition) {
    console.log(`  ${PASS} ${label}`)
    passed++
  } else {
    console.log(`  ${WARN} ${label} (warning)`)
    warned++
  }
}

// ════════════════════════════════════════════════════════════════════════════════
console.log('\n🔍 Alberta AI Academy — Accessibility Audit\n')
console.log('═'.repeat(60))

// ── 1. Focus Trap Composable ──
console.log('\n📋 1. Focus Trap (WCAG 2.4.3 Focus Order)')
const focusTrap = read('frontend/src/composables/useFocusTrap.js')
check('useFocusTrap.js exists', focusTrap !== null)
if (focusTrap) {
  check('Traps Tab key', focusTrap.includes("e.key !== 'Tab'") || focusTrap.includes("key === 'Tab'"))
  check('Handles Shift+Tab', focusTrap.includes('e.shiftKey'))
  check('Has activate() function', focusTrap.includes('function activate'))
  check('Has deactivate() function', focusTrap.includes('function deactivate'))
  check('Restores focus on deactivate', focusTrap.includes('_restoreEl') && focusTrap.includes('.focus()'))
  check('Handles autofocus elements', focusTrap.includes('[autofocus]'))
  check('Cleans up on unmount', focusTrap.includes('onUnmounted'))
}

// ── 2. ContentDetailModal Accessibility ──
console.log('\n📋 2. ContentDetailModal — Modal Dialog (WCAG 2.4.3, 4.1.2)')
const modal = read('frontend/src/components/features/ContentDetailModal.vue')
if (modal) {
  check('role="dialog" present', modal.includes('role="dialog"'))
  check('aria-modal="true" present', modal.includes('aria-modal="true"'))
  check('aria-label on dialog', modal.includes(':aria-label="\'Details:'))
  check('Focus trap imported', modal.includes('useFocusTrap'))
  check('Focus trap activated on open', modal.includes('activateTrap'))
  check('Focus trap deactivated on close/unmount', modal.includes('deactivateTrap'))
  check('Escape key closes modal', modal.includes("event.key === 'Escape'") || modal.includes("key === 'Escape'"))
  check('AudioPlayer component imported', modal.includes('AudioPlayer'))
  check('AudioPlayer rendered in module view', modal.includes('<AudioPlayer'))
}

// ── 3. Quiz Accessibility ──
console.log('\n📋 3. Quiz — Radio Group Semantics (WCAG 4.1.2)')
if (modal) {
  check('role="radiogroup" on quiz options', modal.includes('role="radiogroup"'))
  check('role="radio" on each option button', modal.includes('role="radio"'))
  check('aria-checked on radio buttons', modal.includes(':aria-checked='))
  check('aria-labelledby links question to group', modal.includes(':aria-labelledby='))
  check('Quiz feedback aria-live region', modal.includes('aria-live="assertive"'))
  check('quizAnnouncement ref for screen readers', modal.includes('quizAnnouncement'))
  check('Score panel has role="status"', modal.includes('role="status"'))
  check('Module completion has role="alert"', modal.includes('class="module-completion" role="alert"'))
}

// ── 4. Lightbox Accessibility ──
console.log('\n📋 4. Lightbox — Dialog Semantics (WCAG 4.1.2)')
if (modal) {
  check('Lightbox has role="dialog"', modal.includes('class="lightbox" role="dialog"'))
  check('Lightbox has aria-modal="true"', /lightbox.*aria-modal="true"/s.test(modal))
  check('Lightbox has aria-label', /lightbox.*:aria-label=/s.test(modal))
  check('Lightbox image has alt text', /lightbox__img.*:alt=/s.test(modal))
  check('Lightbox close has aria-label', /lightbox__close.*:aria-label=/s.test(modal))
}

// ── 5. AI Assistant Panel — Focus Trap ──
console.log('\n📋 5. AI Assistant Panel — Focus Management (WCAG 2.4.3)')
const aiPanel = read('frontend/src/components/features/AiAssistantPanel.vue')
if (aiPanel) {
  check('Focus trap imported', aiPanel.includes('useFocusTrap'))
  check('Focus trap activated on open', aiPanel.includes('activatePanelTrap'))
  check('Focus trap deactivated on close', aiPanel.includes('deactivatePanelTrap'))
  check('Panel has role="dialog"', aiPanel.includes('role="dialog"'))
  check('Panel has aria-modal="true"', aiPanel.includes('aria-modal="true"'))
  check('Escape closes panel', aiPanel.includes('keydown.esc'))
}

// ── 6. Navigation — Locked Items Contrast ──
console.log('\n📋 6. Navigation — Color Contrast (WCAG 1.4.3)')
const header = read('frontend/src/components/common/AppHeader.vue')
if (header) {
  // Extract the opacity value for nav-locked
  const lockMatch = header.match(/\.nav-locked\s*\{[^}]*opacity:\s*([0-9.]+)/)
  const opacity = lockMatch ? parseFloat(lockMatch[1]) : 0
  check('Locked nav opacity >= 0.6 (WCAG AA)', opacity >= 0.6)
  check('Header has role="banner"', header.includes('role="banner"'))
  check('Nav has aria-label', header.includes('aria-label="Main navigation"') || header.includes(':aria-label'))
  check('Hamburger has aria-expanded', header.includes(':aria-expanded'))
  check('Focus-visible styles on toggle', header.includes('focus-visible'))
}

// ── 7. Diagram — Alt Text ──
console.log('\n📋 7. Diagram — Alternative Text (WCAG 1.1.1)')
const diagram = read('frontend/src/components/diagrams/DiagramFlow.vue')
if (diagram) {
  check('Diagram wrapper has role="img"', diagram.includes('role="img"'))
  check('Diagram wrapper has aria-label', diagram.includes(':aria-label=') && diagram.includes('Diagram'))
  check('VueFlow canvas hidden from AT', diagram.includes('aria-hidden="true"'))
}

// ── 8. Skip Link ──
console.log('\n📋 8. Skip Link (WCAG 2.4.1)')
const appVue = read('frontend/src/App.vue')
if (appVue) {
  check('Skip link present', appVue.includes('skip-link'))
  check('Links to #main-content', appVue.includes('#main-content'))
}

// ── 9. Accessibility CSS ──
console.log('\n📋 9. Accessibility CSS (WCAG 2.x AA Utilities)')
const a11yCss = read('frontend/src/assets/styles/accessibility.css')
if (a11yCss) {
  check('.sr-only class defined', a11yCss.includes('.sr-only'))
  check('.skip-link with focus styles', a11yCss.includes('.skip-link:focus'))
  check('prefers-reduced-motion support', a11yCss.includes('prefers-reduced-motion'))
  check('prefers-contrast: high support', a11yCss.includes('prefers-contrast: high'))
  check('Minimum 44px touch targets', a11yCss.includes('min-height: 44px'))
  check('[tabindex="-1"]:focus no outline', a11yCss.includes('[tabindex="-1"]:focus'))
  check('Dialog focus-visible styles', a11yCss.includes('[role="dialog"]:focus-visible'))
}

// ── 10. TTS Composable ──
console.log('\n📋 10. TTS Composable — ElevenLabs Integration')
const tts = read('frontend/src/composables/useTTS.js')
check('useTTS.js exists', tts !== null)
if (tts) {
  check('Has speak() function', tts.includes('async function speak'))
  check('Has pause() function', tts.includes('function pause'))
  check('Has resume() function', tts.includes('function resume'))
  check('Has stop() function', tts.includes('function stop'))
  check('Has replay() function', tts.includes('function replay'))
  check('Has seekForward()', tts.includes('function seekForward'))
  check('Has seekBackward()', tts.includes('function seekBackward'))
  check('Has speed control', tts.includes('function setSpeed') || tts.includes('function cycleSpeed'))
  check('Has voice selection', tts.includes('fetchVoices'))
  check('Has statusMessage for announcements', tts.includes('statusMessage'))
  check('Streams from /api/tts/stream', tts.includes('/api/tts/stream'))
  check('extractSectionText function', tts.includes('function extractSectionText'))
  check('Handles all block types', tts.includes("case 'hero'") && tts.includes("case 'quiz'"))
  check('Cleans up on unmount', tts.includes('onUnmounted'))
}

// ── 11. AudioPlayer Component ──
console.log('\n📋 11. AudioPlayer — WCAG Compliant Controls')
const player = read('frontend/src/components/features/AudioPlayer.vue')
check('AudioPlayer.vue exists', player !== null)
if (player) {
  check('Has role="region"', player.includes('role="region"'))
  check('Has role="toolbar" on controls', player.includes('role="toolbar"'))
  check('Has role="slider" on progress', player.includes('role="slider"'))
  check('aria-valuenow on slider', player.includes(':aria-valuenow'))
  check('aria-valuemin on slider', player.includes(':aria-valuemin'))
  check('aria-valuemax on slider', player.includes(':aria-valuemax'))
  check('aria-valuetext on slider', player.includes(':aria-valuetext'))
  check('aria-live region for announcements', player.includes('aria-live="polite"'))
  check('Play button has aria-label', player.includes("t('tts.play'") || player.includes("'Play"))
  check('Pause button has aria-label', player.includes("t('tts.pause'") || player.includes("'Pause"))
  check('Keyboard handler present', player.includes('handleKeydown'))
  check('Space key toggles play/pause', player.includes("case ' '"))
  check('Arrow keys for seeking', player.includes("ArrowLeft") && player.includes("ArrowRight"))
  check('R key for replay', player.includes("case 'R'") || player.includes("case 'r'"))
  check('Speed control buttons', player.includes('cycleSpeed'))
  check('Auto Advance checkbox', player.includes('autoAdvance'))
  check('Auto Advance has aria-describedby', player.includes('aria-describedby="auto-advance-desc"'))
  check('Focus-visible styles', player.includes('focus-visible'))
  check('Reduced motion support', player.includes('prefers-reduced-motion'))
}

// ── 12. TTS Proxy ──
console.log('\n📋 12. TTS Proxy — Server Configuration')
const viteConfig = read('frontend/vite.config.js')
if (viteConfig) {
  check('Vite dev proxy for /api/tts/voices', viteConfig.includes('/api/tts/voices'))
  check('Vite dev proxy for /api/tts/stream', viteConfig.includes('/api/tts/stream'))
  check('API key loaded server-side (not exposed)', viteConfig.includes('ELEVENLABS_API_KEY') && !viteConfig.includes('VITE_ELEVENLABS'))
  check('Streams audio response', viteConfig.includes('audio/mpeg'))
}

const server = read('server/index.js')
check('Production server exists', server !== null)
if (server) {
  check('Production proxy for /api/tts/voices', server.includes('/api/tts/voices'))
  check('Production proxy for /api/tts/stream', server.includes('/api/tts/stream'))
  check('Streams response to client', server.includes('Transfer-Encoding') || server.includes('res.write'))
  check('API key not in response', !server.includes('res.end(API_KEY)') && !server.includes('JSON.stringify(API_KEY)'))
}

// ── Summary ──
console.log('\n' + '═'.repeat(60))
console.log(`\n📊 Results: ${PASS} ${passed} passed  ${FAIL} ${failed} failed  ${WARN} ${warned} warnings\n`)

if (failed > 0) {
  console.log('❌ Some accessibility checks failed. Please review the failures above.\n')
  process.exit(1)
} else {
  console.log('✅ All accessibility checks passed!\n')
  process.exit(0)
}

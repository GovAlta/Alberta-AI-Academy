/**
 * useFocusTrap — traps keyboard focus inside a container element.
 * Designed for modals/dialogs to meet WCAG 2.1 AA (2.4.3 Focus Order, 2.1.2 No Keyboard Trap).
 *
 * Usage:
 *   const { activate, deactivate } = useFocusTrap(containerRef)
 *   // Call activate() when modal opens, deactivate() when it closes.
 *   // activate(restoreEl) stores the element to restore focus to on deactivate.
 */
import { onUnmounted } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary',
  'audio[controls]',
  'video[controls]'
].join(', ')

export function useFocusTrap(containerRef) {
  let _restoreEl = null
  let _active = false

  function _getFocusable() {
    if (!containerRef.value) return []
    return [...containerRef.value.querySelectorAll(FOCUSABLE)]
      .filter(el => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null)
  }

  function _handleKeydown(e) {
    if (e.key !== 'Tab' || !_active) return
    const focusable = _getFocusable()
    if (focusable.length === 0) { e.preventDefault(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first || !containerRef.value?.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last || !containerRef.value?.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  function activate(restoreEl) {
    _restoreEl = restoreEl || document.activeElement
    _active = true
    document.addEventListener('keydown', _handleKeydown, true)
    // Move focus into the container on next frame
    requestAnimationFrame(() => {
      if (!containerRef.value) return
      // Focus the first element with autofocus, or the first focusable, or the container itself
      const autoFocused = containerRef.value.querySelector('[autofocus]')
      if (autoFocused) { autoFocused.focus(); return }
      const focusable = _getFocusable()
      if (focusable.length > 0) { focusable[0].focus(); return }
      // Fallback: make container itself focusable
      containerRef.value.setAttribute('tabindex', '-1')
      containerRef.value.focus()
    })
  }

  function deactivate() {
    _active = false
    document.removeEventListener('keydown', _handleKeydown, true)
    if (_restoreEl && typeof _restoreEl.focus === 'function') {
      requestAnimationFrame(() => _restoreEl.focus())
    }
    _restoreEl = null
  }

  onUnmounted(() => {
    deactivate()
  })

  return { activate, deactivate }
}

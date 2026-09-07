/**
 * assetUrl — prefix a site-relative asset path with the Vite base path.
 *
 * Content JSON and the audio manifest reference static files as absolute paths
 * such as "/images/foo.png" or "/audio/en/l1-1.1.1.mp3". That is correct when
 * the site is served from a domain root, but GitHub Pages also serves it under
 * "/Alberta-AI-Academy/" until a custom domain is attached. The build sets
 * `base` from VITE_BASE (see vite.config.js); this helper applies it at render
 * time so the JSON never has to change.
 *
 * External URLs (http://, https://, //cdn…), data: URIs and relative paths are
 * returned untouched.
 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

export function assetUrl(path) {
  if (typeof path !== 'string' || !path) return path
  if (!path.startsWith('/') || path.startsWith('//')) return path
  return BASE ? BASE + path : path
}

/** Same as assetUrl but returns a fully-qualified URL (for documents, sharing, etc.). */
export function absoluteAssetUrl(path) {
  const p = assetUrl(path)
  if (typeof p !== 'string' || !p.startsWith('/') || typeof window === 'undefined') return p
  return window.location.origin + p
}

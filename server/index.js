/**
 * TTS Proxy Server — serves the static frontend and proxies ElevenLabs API requests.
 *
 * In production (Render), this replaces the static site deployment.
 * The ELEVENLABS_API_KEY env var is read server-side and never exposed to the client.
 *
 * Routes:
 *   GET  /api/tts/voices  — List available ElevenLabs voices
 *   POST /api/tts/stream  — Stream TTS audio from ElevenLabs
 *   *    /*               — Serve static files from frontend/dist/
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = resolve(__dirname, '../frontend/dist')
const PORT = process.env.PORT || 3000
const API_KEY = process.env.ELEVENLABS_API_KEY || ''

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}

if (!API_KEY) {
  console.warn('⚠ ELEVENLABS_API_KEY not set — TTS endpoints will fail')
}

// ── API handlers ──

async function handleVoices(req, res) {
  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': API_KEY }
    })
    const data = await upstream.json()
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify(data))
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}

async function handleStream(req, res) {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())

    const { text, voice_id, model_id } = body
    if (!text || !voice_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'text and voice_id are required' }))
      return
    }

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice_id)}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: model_id || 'eleven_flash_v2_5',
          output_format: 'mp3_44100_128',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            use_speaker_boost: true
          }
        })
      }
    )

    if (!upstream.ok) {
      const errText = await upstream.text()
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: errText }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    })

    // Pipe the audio stream to the client
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
  }
}

// ── Static file server ──

function serveStatic(req, res) {
  const resolvedDist = resolve(DIST_DIR)

  // Sanitize URL path: split into segments and strip traversal components (.., .)
  // Filtering out '..' is the required sanitizer for path injection (CodeQL js/path-injection)
  const rawPath = (req.url || '/').split('?')[0]
  const segments = rawPath.split('/').filter(s => s && s !== '.' && s !== '..')

  // Reconstruct a safe path entirely within DIST_DIR from clean segments
  let filePath = segments.length > 0
    ? join(resolvedDist, ...segments)
    : join(resolvedDist, 'index.html')

  // SPA fallback — if file doesn't exist or is a directory, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(resolvedDist, 'index.html')
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  const ext = extname(filePath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'
  const content = readFileSync(filePath)

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  })
  res.end(content)
}

// ── Server ──

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    })
    res.end()
    return
  }

  // API routes
  if (req.url === '/api/tts/voices' && req.method === 'GET') {
    return handleVoices(req, res)
  }
  if (req.url === '/api/tts/stream' && req.method === 'POST') {
    return handleStream(req, res)
  }

  // Static files
  serveStatic(req, res)
})

server.listen(PORT, () => {
  console.log(`🎙 TTS proxy + static server running on port ${PORT}`)
})

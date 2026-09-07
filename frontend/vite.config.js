import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'

export default defineConfig(({ mode }) => {
  // Load env from project root (one level up from frontend/)
  const env = loadEnv(mode, resolve(dirname(fileURLToPath(import.meta.url)), '..'), '')
  const ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY || ''

  return {
    plugins: [
      vue(),
      VueI18nPlugin({
        // Pre-compile locale JSON files at build time so the runtime compiler is not needed
        include: resolve(dirname(fileURLToPath(import.meta.url)), './src/locales/**'),
        strictMessage: false,
        runtimeOnly: true,
        compositionOnly: true,
        fullInstall: true
      }),

      // TTS proxy — dev server middleware that proxies /api/tts/* to ElevenLabs
      {
        name: 'tts-proxy',
        configureServer(server) {
          // GET /api/tts/voices — list available voices
          server.middlewares.use('/api/tts/voices', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
              res.end()
              return
            }
            try {
              const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
                headers: { 'xi-api-key': ELEVENLABS_API_KEY }
              })
              const data = await upstream.json()
              res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(data))
            } catch (e) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: e.message }))
            }
          })

          // POST /api/tts/stream — stream TTS audio
          server.middlewares.use('/api/tts/stream', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type'
              })
              res.end()
              return
            }
            if (req.method !== 'POST') {
              res.writeHead(405)
              res.end()
              return
            }
            try {
              const chunks = []
              for await (const chunk of req) chunks.push(chunk)
              const body = JSON.parse(Buffer.concat(chunks).toString())

              const { text, voice_id, model_id } = body
              if (!text || !voice_id) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'text and voice_id required' }))
                return
              }

              const upstream = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice_id)}/stream`,
                {
                  method: 'POST',
                  headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
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
                'Cache-Control': 'no-cache'
              })

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
          })
        }
      }
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (['vue', 'vue-router', 'pinia', 'vue-i18n'].some(p => id.includes(`/node_modules/${p}/`))) return 'vendor'
            if (id.includes('/node_modules/docx/')) return 'docx'
            if (id.includes('/node_modules/marked/')) return 'marked'
          }
        }
      }
    },
    server: {
      port: 5173,
      host: true
    }
  }
})

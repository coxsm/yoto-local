import { timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { OutgoingHttpHeaders } from 'node:http'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import {
  COMPANION_TOKEN_HEADER,
  COMPANION_TOKEN_QUERY,
  type HealthResponse
} from '@yoto-local/shared'
import pkg from '../package.json' with { type: 'json' }
import { toolStatus, updateYtDlp } from './binaries.js'
import type { CompanionConfig, StateStore } from './config.js'
import type { DownloadManager } from './downloads.js'
import type { EventHub } from './events.js'
import {
  HttpError,
  deleteAlbumDir,
  findAlbumCover,
  imageMimeType,
  resolveAlbumDir,
  resolveTrackFile,
  saveCoverFromUrl,
  scanLibrary
} from './library.js'
import { deleteYotoPlaylist, syncAlbumToYoto } from './yoto.js'

export interface ServerDeps {
  config: CompanionConfig
  store: StateStore
  hub: EventHub
  downloads: DownloadManager
  /** Called after POST /api/shutdown has responded. */
  onShutdown?: () => void
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const PUBLIC_ROUTES = new Set(['/', '/api/health'])
const HEALTH_CACHE_MS = 60_000

function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given.trim().toUpperCase())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Missing ${name}`)
  return value
}

/** Streams a file with HTTP range support so <audio> can seek. */
async function sendFile(req: FastifyRequest, reply: FastifyReply, path: string, type: string) {
  const { size } = await stat(path)
  reply.header('Accept-Ranges', 'bytes').type(type)

  const range = req.headers.range
  if (!range) {
    reply.header('Content-Length', size)
    return reply.send(createReadStream(path))
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  let start = NaN
  let end = size - 1
  if (match && match[1]) {
    start = Number(match[1])
    if (match[2]) end = Math.min(Number(match[2]), size - 1)
  } else if (match && match[2]) {
    start = Math.max(0, size - Number(match[2]))
  }
  if (!Number.isFinite(start) || start > end) {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send()
  }
  reply
    .code(206)
    .header('Content-Range', `bytes ${start}-${end}/${size}`)
    .header('Content-Length', end - start + 1)
  return reply.send(createReadStream(path, { start, end }))
}

export function buildServer({ config, store, hub, downloads, onShutdown }: ServerDeps) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } })
  const allowedOrigins = new Set(config.allowedOrigins)
  const syncing = new Set<string>()
  let healthCache: { at: number; value: HealthResponse } | null = null

  // --- Security: loopback-only Host, CORS allow-list, private network access, pairing token.
  app.addHook('onRequest', async (req, reply) => {
    const hostname = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (!LOOPBACK_HOSTS.has(hostname)) {
      // Blocks DNS-rebinding: a hostile domain resolving to 127.0.0.1 has the wrong Host.
      return reply.code(403).send({ error: 'Forbidden host' })
    }

    const origin = req.headers.origin
    if (origin) {
      if (!allowedOrigins.has(origin)) {
        return reply.code(403).send({ error: `Origin ${origin} is not allowed` })
      }
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Headers', `content-type, ${COMPANION_TOKEN_HEADER}`)
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        .header('Access-Control-Max-Age', '600')
      // Chrome's Private/Local Network Access preflight for public site → loopback.
      if (req.headers['access-control-request-private-network'] === 'true') {
        reply.header('Access-Control-Allow-Private-Network', 'true')
      }
    }

    if (req.method === 'OPTIONS') return reply.code(204).send()

    const path = req.url.split('?')[0]
    if (PUBLIC_ROUTES.has(path)) return

    // <img>, <audio> and EventSource can't set headers, so GETs may pass the token as ?t=.
    const query = req.query as Record<string, string | undefined>
    const token =
      (req.headers[COMPANION_TOKEN_HEADER] as string | undefined) ??
      (req.method === 'GET' ? query[COMPANION_TOKEN_QUERY] : undefined)
    if (!token || !tokensMatch(token, config.pairingToken)) {
      return reply.code(401).send({ error: 'Pairing code required' })
    }
  })

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.message })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message })
    app.log.error(error)
    return reply.code(500).send({ error: (error as Error).message || 'Internal error' })
  })

  app.get('/', async () => ({
    name: 'yoto-local-companion',
    message: 'The Yoto Local companion is running. Open the Yoto Local web app to use it.'
  }))

  app.get('/api/health', async (): Promise<HealthResponse> => {
    if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) return healthCache.value
    const [ytDlp, ffmpeg] = await Promise.all([toolStatus('yt-dlp'), toolStatus('ffmpeg')])
    const value: HealthResponse = {
      name: 'yoto-local-companion',
      version: pkg.version,
      libraryPath: config.libraryPath,
      tools: { ytDlp, ffmpeg }
    }
    healthCache = { at: Date.now(), value }
    return value
  })

  /** Lets the web app confirm a pairing code without side effects. */
  app.get('/api/session', async () => ({ paired: true }))

  /** Lets the app stop a companion that's running without a console window. */
  app.post('/api/shutdown', async () => {
    if (!onShutdown) throw new HttpError(501, 'Shutdown is not available')
    // Give the response time to reach the browser before the process exits.
    setTimeout(onShutdown, 250)
    return { success: true }
  })

  app.post('/api/tools/ytdlp/update', async () => {
    const result = await updateYtDlp()
    healthCache = null
    return result
  })

  // --- Server-Sent Events

  app.get('/api/events', (_req, reply) => {
    reply.hijack()
    const headers: OutgoingHttpHeaders = {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
    reply.raw.writeHead(200, headers)
    reply.raw.write('retry: 3000\n\n')
    for (const job of downloads.list()) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'job', job })}\n\n`)
    }
    hub.add(reply.raw)
  })

  // --- Downloads

  app.get('/api/downloads', async () => downloads.list())

  app.post('/api/downloads', async (req, reply) => {
    const { url } = (req.body ?? {}) as { url?: unknown }
    return reply.code(202).send(downloads.enqueue(requireString(url, 'url')))
  })

  app.delete('/api/downloads/:id', async (req) => {
    const { id } = req.params as { id: string }
    return downloads.cancel(id)
  })

  // --- Library

  app.get('/api/library', async () => scanLibrary(config.libraryPath, store))

  app.get('/api/library/:id/art', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { dir } = await resolveAlbumDir(config.libraryPath, id)
    const cover = await findAlbumCover(dir)
    if (!cover) throw new HttpError(404, 'No artwork')
    // URLs carry ?v=<mtime>, so a changed cover gets a new URL.
    reply.header('Cache-Control', 'private, max-age=31536000, immutable')
    return sendFile(req, reply, cover, imageMimeType(cover))
  })

  app.put('/api/library/:id/art', async (req) => {
    const { id } = req.params as { id: string }
    const { imageUrl } = (req.body ?? {}) as { imageUrl?: unknown }
    const { dir } = await resolveAlbumDir(config.libraryPath, id)
    await saveCoverFromUrl(dir, requireString(imageUrl, 'imageUrl'))
    hub.emit({ type: 'library-changed' })
    return { success: true }
  })

  app.get('/api/library/:id/tracks/:file', async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string }
    const { dir } = await resolveAlbumDir(config.libraryPath, id)
    const path = await resolveTrackFile(dir, file)
    reply.header('Cache-Control', 'private, max-age=3600')
    return sendFile(req, reply, path, 'audio/mpeg')
  })

  app.delete('/api/library/:id', async (req) => {
    const { id } = req.params as { id: string }
    const { key, dir } = await resolveAlbumDir(config.libraryPath, id)
    await deleteAlbumDir(config.libraryPath, dir)
    store.delete(key)
    hub.emit({ type: 'library-changed' })
    return { success: true }
  })

  // --- Yoto sync

  app.post('/api/library/:id/sync', async (req) => {
    const { id } = req.params as { id: string }
    const { accessToken } = (req.body ?? {}) as { accessToken?: unknown }
    const token = requireString(accessToken, 'accessToken')
    const { key, dir } = await resolveAlbumDir(config.libraryPath, id)
    if (syncing.has(key)) throw new HttpError(409, 'This album is already syncing')

    syncing.add(key)
    try {
      const result = await syncAlbumToYoto({
        albumId: id,
        albumName: key.split('/').pop() ?? key,
        dir,
        accessToken: token,
        cardId: store.get(key)?.remoteId,
        onProgress: (progress) => hub.emit({ type: 'sync', progress })
      })
      if (result.success) {
        store.set(key, { synced: true, remoteId: result.remoteId ?? null })
        hub.emit({ type: 'library-changed' })
      }
      return result
    } finally {
      syncing.delete(key)
    }
  })

  /** Removes the playlist from Yoto (when we know its id) and marks the album unsynced. */
  app.post('/api/library/:id/unsync', async (req) => {
    const { id } = req.params as { id: string }
    const { accessToken } = (req.body ?? {}) as { accessToken?: unknown }
    const { key } = await resolveAlbumDir(config.libraryPath, id)
    const remoteId = store.get(key)?.remoteId
    if (remoteId && typeof accessToken === 'string' && accessToken) {
      await deleteYotoPlaylist(remoteId, accessToken)
    }
    store.set(key, { synced: false, remoteId: null })
    hub.emit({ type: 'library-changed' })
    return { success: true, deletedRemote: !!remoteId && !!accessToken }
  })

  /** Manual toggle for albums uploaded through the Yoto app instead. */
  app.patch('/api/library/:id/sync', async (req) => {
    const { id } = req.params as { id: string }
    const { synced } = (req.body ?? {}) as { synced?: unknown }
    if (typeof synced !== 'boolean') throw new HttpError(400, 'Missing synced')
    const { key } = await resolveAlbumDir(config.libraryPath, id)
    store.set(key, { synced })
    hub.emit({ type: 'library-changed' })
    return { success: true }
  })

  return app
}

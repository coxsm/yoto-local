import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { StateStore, type CompanionConfig } from '../src/config.js'
import { DownloadManager } from '../src/downloads.js'
import { EventHub } from '../src/events.js'
import { albumIdFromKey } from '../src/library.js'
import { buildServer } from '../src/server.js'

const TOKEN = 'ABCDE-FGHJK'
const ORIGIN = 'https://coxsm.github.io'
let root: string
let hub: EventHub
let app: ReturnType<typeof buildServer>
let onShutdown: Mock<() => void>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yoto-local-server-'))
  const libraryPath = join(root, 'library')
  mkdirSync(join(libraryPath, 'Artist', 'Album'), { recursive: true })
  writeFileSync(join(libraryPath, 'Artist', 'Album', 'Song.mp3'), Buffer.alloc(1000, 1))
  const config: CompanionConfig = {
    port: 5174,
    libraryPath,
    dataDir: root,
    allowedOrigins: [ORIGIN],
    pairingToken: TOKEN
  }
  hub = new EventHub()
  const store = new StateStore(root, libraryPath)
  onShutdown = vi.fn<() => void>()
  app = buildServer({
    config,
    store,
    hub,
    downloads: new DownloadManager(libraryPath, hub),
    onShutdown
  })
})

afterEach(async () => {
  hub.close()
  await app.close()
  rmSync(root, { recursive: true, force: true })
})

const host = { host: '127.0.0.1:5174' }

describe('security', () => {
  it('answers private-network CORS preflights from the allowed origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/library',
      headers: {
        ...host,
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-private-network': 'true'
      }
    })
    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(res.headers['access-control-allow-private-network']).toBe('true')
  })

  it('rejects other origins', async () => {
    const res = await app.inject({
      url: '/api/health',
      headers: { ...host, origin: 'https://evil.example' }
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects non-loopback Host headers (DNS rebinding)', async () => {
    const res = await app.inject({ url: '/api/health', headers: { host: 'evil.example:5174' } })
    expect(res.statusCode).toBe(403)
  })

  it('allows health without pairing but not the library', async () => {
    expect((await app.inject({ url: '/api/health', headers: host })).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/library', headers: host })).statusCode).toBe(401)
  })

  it('accepts the pairing code as a header, case-insensitively', async () => {
    const res = await app.inject({
      url: '/api/library',
      headers: { ...host, 'x-companion-token': TOKEN.toLowerCase() }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('only accepts the ?t= token on GET requests', async () => {
    const id = albumIdFromKey('Artist/Album')
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/library/${id}?t=${TOKEN}`,
      headers: host
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('media', () => {
  it('streams tracks with range support', async () => {
    const id = albumIdFromKey('Artist/Album')
    const res = await app.inject({
      url: `/api/library/${id}/tracks/Song.mp3?t=${TOKEN}`,
      headers: { ...host, range: 'bytes=100-199' }
    })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 100-199/1000')
    expect(res.rawPayload).toHaveLength(100)
  })

  it('refuses path traversal in track names', async () => {
    const id = albumIdFromKey('Artist/Album')
    const res = await app.inject({
      url: `/api/library/${id}/tracks/${encodeURIComponent('../../x.mp3')}?t=${TOKEN}`,
      headers: host
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('downloads', () => {
  it('validates URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { ...host, 'x-companion-token': TOKEN },
      payload: { url: '--exec calc' }
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('shutdown', () => {
  it('requires pairing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/shutdown', headers: host })
    expect(res.statusCode).toBe(401)
    await new Promise((r) => setTimeout(r, 400))
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it('responds, then shuts down', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/shutdown',
      headers: { ...host, 'x-companion-token': TOKEN }
    })
    expect(res.statusCode).toBe(200)
    await new Promise((r) => setTimeout(r, 400))
    expect(onShutdown).toHaveBeenCalledOnce()
  })
})

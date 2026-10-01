import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlaylistPayload, syncAlbumToYoto } from '../src/yoto.js'

describe('buildPlaylistPayload', () => {
  it('points each track at its transcoded audio, one chapter per track', () => {
    const payload = buildPlaylistPayload(
      'Album',
      [
        {
          title: 'One',
          transcodedSha256: 'aaa',
          duration: 60,
          fileSize: 1_048_576,
          channels: 2,
          format: 'aac'
        },
        {
          title: 'Two',
          transcodedSha256: 'bbb',
          duration: 30,
          fileSize: 524_288,
          channels: 2,
          format: 'aac'
        }
      ],
      'https://cdn/cover.jpg'
    )
    expect(payload).not.toHaveProperty('cardId')
    expect(payload.content.chapters).toHaveLength(2)
    expect(payload.content.chapters[1]).toMatchObject({
      key: '02',
      overlayLabel: '2',
      tracks: [{ key: '02', title: 'Two', trackUrl: 'yoto:#bbb', type: 'audio', duration: 30 }]
    })
    expect(payload.metadata).toMatchObject({
      cover: { imageL: 'https://cdn/cover.jpg' },
      media: { duration: 90, fileSize: 1_572_864, readableFileSize: 1.5 }
    })
  })

  it('includes cardId when updating an existing playlist', () => {
    expect(buildPlaylistPayload('Album', [], null, 'abc12')).toMatchObject({ cardId: 'abc12' })
  })
})

describe('syncAlbumToYoto', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yoto-sync-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '01 Song.mp3'), 'audio')
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  it('uploads, waits for transcoding, then creates the playlist and returns card.cardId', async () => {
    let polls = 0
    let created: Record<string, unknown> | null = null
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/media/transcode/audio/uploadUrl')) {
          return json({ upload: { uploadUrl: 'https://s3/put', uploadId: 'up1' } })
        }
        if (url === 'https://s3/put') return new Response(null, { status: 200 })
        if (url.includes('/media/upload/up1/transcoded')) {
          polls++
          return polls < 3
            ? json({ transcode: {} })
            : json({
                transcode: {
                  transcodedSha256: 'sha-1',
                  transcodedInfo: { duration: 12, fileSize: 2048, channels: 2, format: 'aac' }
                }
              })
        }
        if (url.endsWith('/content') && init?.method === 'POST') {
          created = JSON.parse(String(init.body))
          return json({ card: { cardId: 'card42', title: 'Album' } })
        }
        throw new Error(`Unexpected fetch ${url}`)
      })
    )

    const stages: string[] = []
    const result = await syncAlbumToYoto({
      albumId: 'id',
      albumName: 'Album',
      dir,
      accessToken: 'token',
      onProgress: (p) => stages.push(p.stage)
    })

    expect(result).toEqual({ success: true, remoteId: 'card42' })
    expect(polls).toBe(3)
    expect(stages).toEqual(['tracks', 'transcoding', 'artwork', 'playlist'])
    expect(created).toMatchObject({
      title: 'Album',
      content: {
        chapters: [{ tracks: [{ title: '01 Song', trackUrl: 'yoto:#sha-1', duration: 12 }] }]
      }
    })
  })
})

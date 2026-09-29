import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateStore } from '../src/config.js'
import {
  albumIdFromKey,
  deleteAlbumDir,
  findCoverFile,
  resolveAlbumDir,
  resolveTrackFile,
  scanLibrary
} from '../src/library.js'

let root: string
let library: string
let store: StateStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yoto-local-test-'))
  library = join(root, 'library')
  mkdirSync(join(library, 'Artist', 'Album'), { recursive: true })
  writeFileSync(join(library, 'Artist', 'Album', '2 Second.mp3'), 'x')
  writeFileSync(join(library, 'Artist', 'Album', '10 Tenth.mp3'), 'x')
  writeFileSync(join(library, 'Artist', 'Album', '1 First.mp3'), 'x')
  writeFileSync(join(library, 'Artist', 'Album', 'folder.jpg'), 'img')
  writeFileSync(join(root, 'secret.mp3'), 'x')
  mkdirSync(join(root, 'data'))
  store = new StateStore(join(root, 'data'), library)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('resolveAlbumDir', () => {
  it('resolves ids inside the library', async () => {
    const { dir, key } = await resolveAlbumDir(library, albumIdFromKey('Artist/Album'))
    expect(dir).toBe(join(library, 'Artist', 'Album'))
    expect(key).toBe('Artist/Album')
  })

  it.each(['..', '../', '../data', 'Artist/../..', '', '/etc', 'C:\\Windows'])(
    'rejects %j',
    async (key) => {
      await expect(resolveAlbumDir(library, albumIdFromKey(key))).rejects.toMatchObject({
        statusCode: expect.any(Number)
      })
    }
  )

  it('404s for missing albums', async () => {
    await expect(resolveAlbumDir(library, albumIdFromKey('Nope'))).rejects.toMatchObject({
      statusCode: 404
    })
  })
})

describe('resolveTrackFile', () => {
  const dir = (): string => join(library, 'Artist', 'Album')

  it('accepts a track in the album', async () => {
    expect(await resolveTrackFile(dir(), '1 First.mp3')).toBe(join(dir(), '1 First.mp3'))
  })

  it.each(['../../../secret.mp3', '..\\..\\..\\secret.mp3', 'folder.jpg', 'sub/1 First.mp3'])(
    'rejects %j',
    async (file) => {
      await expect(resolveTrackFile(dir(), file)).rejects.toMatchObject({ statusCode: 400 })
    }
  )
})

describe('findCoverFile', () => {
  it('prefers folder.* over other covers', () => {
    expect(findCoverFile(['a.mp3', 'cover.png', 'folder.jpg'])).toBe('folder.jpg')
  })

  it('ignores per-track thumbnails yt-dlp is still processing', () => {
    expect(findCoverFile(['Song.webm', 'Song.webp'])).toBeNull()
  })

  it('falls back to any standalone image', () => {
    expect(findCoverFile(['a.mp3', 'art.jpeg'])).toBe('art.jpeg')
  })
})

describe('scanLibrary', () => {
  it('lists albums with naturally sorted tracks and sync state', async () => {
    store.set('Artist/Album', { synced: true, remoteId: 'abc' })
    const [album, ...rest] = await scanLibrary(library, store)
    expect(rest).toHaveLength(0)
    expect(album.name).toBe('Album')
    expect(album.artist).toBe('Artist')
    expect(album.isSynced).toBe(true)
    expect(album.remoteId).toBe('abc')
    expect(album.art).toMatch(new RegExp(`^/api/library/${album.id}/art\\?v=\\d+$`))
    expect(album.tracks.map((t) => t.name)).toEqual(['1 First', '2 Second', '10 Tenth'])
  })
})

describe('deleteAlbumDir', () => {
  it('removes the album and its now-empty artist folder', async () => {
    await deleteAlbumDir(library, join(library, 'Artist', 'Album'))
    expect(existsSync(join(library, 'Artist'))).toBe(false)
    expect(existsSync(library)).toBe(true)
  })
})

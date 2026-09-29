import { readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseFile } from 'music-metadata'
import type { Album, Track } from '@yoto-local/shared'
import type { StateStore } from './config.js'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message)
  }
}

const IMAGE_RE = /\.(jpe?g|png|webp)$/i
const PREFERRED_COVER_RE = /^(folder|cover|front|album)\.(jpe?g|png|webp)$/i
const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}
const MAX_ART_BYTES = 10 * 1024 * 1024

// Album ids are the album folder's path relative to the library root, base64url-encoded.
// They are opaque to the web app and every use is re-validated against the library root.
export function albumIdFromKey(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url')
}

export function albumKeyFromId(id: string): string {
  return Buffer.from(id, 'base64url').toString('utf8')
}

function toKey(libraryPath: string, dir: string): string {
  return relative(libraryPath, dir).split('\\').join('/')
}

function isTrackFile(file: string): boolean {
  return /\.mp3$/i.test(file) && !/\.temp\.mp3$/i.test(file)
}

export function imageMimeType(file: string): string {
  return IMAGE_MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Maps an album id back to a directory, refusing anything outside the library. */
export async function resolveAlbumDir(
  libraryPath: string,
  id: string
): Promise<{ key: string; dir: string }> {
  const key = albumKeyFromId(id)
  if (!key || key.includes('\0')) throw new HttpError(400, 'Invalid album id')
  const root = resolve(libraryPath)
  const dir = resolve(root, key)
  const rel = relative(root, dir)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new HttpError(400, 'Invalid album id')
  const info = await stat(dir).catch(() => null)
  if (!info?.isDirectory()) throw new HttpError(404, 'Album not found')
  return { key: toKey(root, dir), dir }
}

/** Resolves a track file name inside an album dir, rejecting path tricks. */
export async function resolveTrackFile(dir: string, file: string): Promise<string> {
  // Reject both separators on every OS; POSIX basename() treats "\" as a normal character.
  if (!file || /[\\/]/.test(file) || basename(file) !== file || !isTrackFile(file)) {
    throw new HttpError(400, 'Invalid track')
  }
  const path = join(dir, file)
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new HttpError(404, 'Track not found')
  return path
}

/**
 * Picks the album cover among the folder's files. Named covers win (folder.jpg is what
 * "Change art" writes); otherwise any image that isn't a per-track thumbnail yt-dlp is
 * still working on (those share a file stem with another file in the folder).
 */
export function findCoverFile(files: string[]): string | null {
  const images = files.filter((f) => IMAGE_RE.test(f))
  const named = images
    .filter((f) => PREFERRED_COVER_RE.test(f))
    .sort(
      (a, b) =>
        Number(b.toLowerCase().startsWith('folder.')) -
        Number(a.toLowerCase().startsWith('folder.'))
    )
  if (named.length) return named[0]

  const stem = (f: string): string => f.slice(0, f.length - extname(f).length)
  const otherStems = new Set(files.filter((f) => !IMAGE_RE.test(f)).map(stem))
  return images.find((f) => !otherStems.has(stem(f))) ?? null
}

/** Pulls the embedded cover out of an MP3 and caches it next to the tracks. */
async function extractEmbeddedCover(dir: string, mp3: string): Promise<string | null> {
  try {
    const metadata = await parseFile(join(dir, mp3), { duration: false, skipPostHeaders: true })
    const picture = metadata.common.picture?.[0]
    if (!picture?.data?.length) return null
    const ext = picture.format.includes('png') ? 'png' : 'jpg'
    const file = `cover.${ext}`
    await writeFile(join(dir, file), picture.data)
    return file
  } catch {
    return null
  }
}

export async function findAlbumCover(dir: string): Promise<string | null> {
  const files = await readdir(dir)
  const cover = findCoverFile(files)
  if (cover) return join(dir, cover)
  const firstTrack = files.filter(isTrackFile).sort(naturalCompare)[0]
  if (!firstTrack) return null
  const extracted = await extractEmbeddedCover(dir, firstTrack)
  return extracted ? join(dir, extracted) : null
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Lists the MP3s in an album folder in display order. */
export async function listTracks(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter(isTrackFile).sort(naturalCompare)
}

async function buildAlbum(
  libraryPath: string,
  dir: string,
  files: string[],
  store: StateStore
): Promise<Album> {
  const key = toKey(libraryPath, dir)
  const id = albumIdFromKey(key)
  const parent = dirname(dir)

  const coverPath = await findAlbumCover(dir)
  let art: string | null = null
  if (coverPath) {
    const { mtimeMs } = await stat(coverPath)
    art = `/api/library/${id}/art?v=${Math.round(mtimeMs)}`
  }

  const tracks: Track[] = files
    .filter(isTrackFile)
    .sort(naturalCompare)
    .map((file) => ({
      file,
      name: file.replace(/\.mp3$/i, ''),
      url: `/api/library/${id}/tracks/${encodeURIComponent(file)}`
    }))

  const sync = store.get(key)
  return {
    id,
    name: basename(dir),
    artist: resolve(parent) === resolve(libraryPath) ? 'Unsorted' : basename(parent),
    art,
    tracks,
    isSynced: !!sync?.synced,
    remoteId: sync?.remoteId ?? null
  }
}

/** Every folder under the library root that contains MP3s is an album. */
export async function scanLibrary(libraryPath: string, store: StateStore): Promise<Album[]> {
  const albums: Album[] = []

  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name)
    if (dir !== libraryPath && files.some(isTrackFile)) {
      albums.push(await buildAlbum(libraryPath, dir, files, store))
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) await walk(join(dir, entry.name))
    }
  }

  await walk(resolve(libraryPath))
  return albums.sort((a, b) => naturalCompare(`${a.artist}/${a.name}`, `${b.artist}/${b.name}`))
}

/** Downloads an image and saves it as the album's folder.<ext> cover. */
export async function saveCoverFromUrl(dir: string, imageUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(imageUrl)
  } catch {
    throw new HttpError(400, 'Invalid image URL')
  }
  if (url.protocol !== 'https:') throw new HttpError(400, 'Image URL must use https')

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new HttpError(502, `Image download failed: ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  const ext = type.includes('png')
    ? 'png'
    : type.includes('webp')
      ? 'webp'
      : type.includes('jpeg')
        ? 'jpg'
        : null
  if (!ext) throw new HttpError(400, 'URL is not a supported image')
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_ART_BYTES) throw new HttpError(400, 'Image is too large')

  for (const file of await readdir(dir)) {
    if (/^folder\.(jpe?g|png|webp)$/i.test(file)) await rm(join(dir, file), { force: true })
  }
  await writeFile(join(dir, `folder.${ext}`), buffer)
}

/** Deletes an album folder, plus its artist folder if that is now empty. */
export async function deleteAlbumDir(libraryPath: string, dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
  const parent = dirname(dir)
  if (resolve(parent) !== resolve(libraryPath)) {
    await rmdir(parent).catch(() => undefined) // Only succeeds when empty.
  }
}

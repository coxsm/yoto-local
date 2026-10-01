import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SyncProgress, SyncResult } from '@yoto-local/shared'
import { findAlbumCover, imageMimeType, listTracks } from './library.js'

// Flow follows https://yoto.dev/myo/uploading-to-cards/: get an upload URL, PUT the file,
// poll until Yoto has transcoded it, then create the playlist pointing at the transcoded audio.

const API = 'https://api.yotoplay.com'
/** Yoto's default 16x16 track icon, as used in the MYO upload guide. */
const DEFAULT_ICON = 'yoto:#aUm9i3ex3qqAMYBv-i-O-pYMKuMJGICtR3Vhf289u2Q'
const TRANSCODE_TIMEOUT_MS = 5 * 60_000

interface SyncOptions {
  albumId: string
  albumName: string
  dir: string
  accessToken: string
  /** Existing Yoto cardId to update instead of creating a new playlist. */
  cardId?: string | null
  onProgress: (progress: SyncProgress) => void
}

export interface TranscodedTrack {
  title: string
  transcodedSha256: string
  duration?: number
  fileSize?: number
  channels?: number
  format?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function yotoFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers }
  })
  if (res.status === 401) {
    throw new Error('Your Yoto session has expired. Please reconnect your account.')
  }
  if (res.status === 403) {
    throw new Error(
      'Yoto denied access. Reconnect your account so the app is granted the user:content:manage permission.'
    )
  }
  return res
}

/** Uploads the file (unless Yoto already has it) and returns the upload id to poll. */
async function uploadTrack(file: string, dir: string, accessToken: string): Promise<string> {
  const buffer = await readFile(join(dir, file))
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const params = new URLSearchParams({ sha256, filename: file })

  const initRes = await yotoFetch(`/media/transcode/audio/uploadUrl?${params}`, accessToken, {
    headers: { Accept: 'application/json' }
  })
  if (!initRes.ok) {
    throw new Error(`Failed to start upload for ${file}: ${initRes.status} ${await initRes.text()}`)
  }
  const { upload } = (await initRes.json()) as {
    upload?: { uploadUrl?: string | null; uploadId?: string }
  }
  if (!upload?.uploadId) throw new Error(`Yoto did not return an upload id for ${file}`)

  // A null uploadUrl means Yoto already has this exact file.
  if (upload.uploadUrl) {
    const putRes = await fetch(upload.uploadUrl, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': 'audio/mpeg' }
    })
    if (!putRes.ok) throw new Error(`Failed to upload ${file}: ${putRes.status}`)
  }
  return upload.uploadId
}

/** Polls until Yoto has transcoded the upload, returning the transcoded file's details. */
async function waitForTranscode(
  uploadId: string,
  title: string,
  accessToken: string
): Promise<TranscodedTrack> {
  const deadline = Date.now() + TRANSCODE_TIMEOUT_MS
  let delay = 1000
  while (Date.now() < deadline) {
    const res = await yotoFetch(
      `/media/upload/${encodeURIComponent(uploadId)}/transcoded?loudnorm=false`,
      accessToken,
      { headers: { Accept: 'application/json' } }
    )
    // 404 can mean "not transcoded yet"; anything else unexpected is fatal.
    if (res.ok) {
      const { transcode } = (await res.json()) as {
        transcode?: {
          transcodedSha256?: string
          transcodedInfo?: Omit<TranscodedTrack, 'title' | 'transcodedSha256'>
        }
      }
      if (transcode?.transcodedSha256) {
        const info = transcode.transcodedInfo ?? {}
        return {
          title,
          transcodedSha256: transcode.transcodedSha256,
          duration: info.duration,
          fileSize: info.fileSize,
          channels: info.channels,
          format: info.format
        }
      }
    } else if (res.status !== 404) {
      throw new Error(`Yoto failed to process ${title}: ${res.status} ${await res.text()}`)
    }
    await sleep(delay)
    delay = Math.min(delay * 1.5, 5000)
  }
  throw new Error(`Timed out waiting for Yoto to process ${title}`)
}

async function uploadCover(dir: string, accessToken: string): Promise<string | null> {
  const coverPath = await findAlbumCover(dir)
  if (!coverPath) return null
  const res = await yotoFetch('/media/coverImage/user/me/upload?autoconvert=true', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': imageMimeType(coverPath) },
    body: await readFile(coverPath)
  })
  if (!res.ok) {
    console.warn('[sync] Cover upload failed:', res.status, await res.text())
    return null
  }
  const data = (await res.json()) as {
    coverImage?: { mediaUrl?: string }
    mediaUrl?: string
    url?: string
  }
  return data.coverImage?.mediaUrl ?? data.mediaUrl ?? data.url ?? null
}

/** Builds the POST /content body: one chapter per track so the player can skip between them. */
export function buildPlaylistPayload(
  title: string,
  tracks: TranscodedTrack[],
  coverUrl: string | null,
  cardId?: string | null
) {
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  const totalSize = tracks.reduce((sum, t) => sum + (t.fileSize ?? 0), 0)

  return {
    ...(cardId ? { cardId } : {}),
    title,
    content: {
      chapters: tracks.map((track, index) => {
        const key = String(index + 1).padStart(2, '0')
        const label = String(index + 1)
        return {
          key,
          title: track.title,
          overlayLabel: label,
          display: { icon16x16: DEFAULT_ICON },
          tracks: [
            {
              key,
              title: track.title,
              trackUrl: `yoto:#${track.transcodedSha256}`,
              duration: track.duration,
              fileSize: track.fileSize,
              channels: track.channels,
              format: track.format,
              type: 'audio',
              overlayLabel: label,
              display: { icon16x16: DEFAULT_ICON }
            }
          ]
        }
      })
    },
    metadata: {
      ...(coverUrl ? { cover: { imageL: coverUrl } } : {}),
      media: {
        duration: totalDuration,
        fileSize: totalSize,
        readableFileSize: Math.round((totalSize / 1024 / 1024) * 10) / 10
      }
    }
  }
}

/** Uploads every track and the cover, then creates (or updates) a MYO playlist on Yoto. */
export async function syncAlbumToYoto(options: SyncOptions): Promise<SyncResult> {
  const { albumId, albumName, dir, accessToken, cardId, onProgress } = options
  try {
    const files = await listTracks(dir)
    if (!files.length) throw new Error('This album has no tracks')
    const total = files.length

    // Upload everything first so Yoto transcodes in parallel while we keep uploading.
    const uploadIds: string[] = []
    for (const [index, file] of files.entries()) {
      onProgress({ albumId, current: index, total, filename: file, stage: 'tracks' })
      uploadIds.push(await uploadTrack(file, dir, accessToken))
      // Pace uploads rather than bursting the Yoto API.
      if (index < total - 1) await sleep(1000)
    }

    const tracks: TranscodedTrack[] = []
    for (const [index, file] of files.entries()) {
      onProgress({ albumId, current: index, total, filename: file, stage: 'transcoding' })
      const title = file.replace(/\.mp3$/i, '')
      tracks.push(await waitForTranscode(uploadIds[index], title, accessToken))
    }

    onProgress({ albumId, current: total, total, filename: 'Artwork', stage: 'artwork' })
    const coverUrl = await uploadCover(dir, accessToken).catch((e) => {
      console.warn('[sync] Cover upload error:', e)
      return null
    })

    onProgress({ albumId, current: total, total, filename: albumName, stage: 'playlist' })
    const createRes = await yotoFetch('/content', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPlaylistPayload(albumName, tracks, coverUrl, cardId))
    })
    if (!createRes.ok) {
      throw new Error(`Failed to create playlist: ${createRes.status} ${await createRes.text()}`)
    }
    const created = (await createRes.json()) as {
      card?: { cardId?: string; id?: string }
      cardId?: string
      id?: string
    }
    const remoteId = created.card?.cardId ?? created.cardId ?? created.card?.id ?? created.id
    return { success: true, remoteId }
  } catch (error) {
    console.error('[sync] Failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteYotoPlaylist(remoteId: string, accessToken: string): Promise<void> {
  const res = await yotoFetch(`/content/${encodeURIComponent(remoteId)}`, accessToken, {
    method: 'DELETE'
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete playlist: ${res.status} ${await res.text()}`)
  }
}

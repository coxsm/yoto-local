import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SyncProgress, SyncResult } from '@yoto-local/shared'
import { findAlbumCover, imageMimeType, listTracks } from './library.js'

const API = 'https://api.yotoplay.com'

interface SyncOptions {
  albumId: string
  albumName: string
  dir: string
  accessToken: string
  onProgress: (progress: SyncProgress) => void
}

async function yotoFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers }
  })
}

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
    upload?: { uploadUrl?: string; uploadId?: string }
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

/** Uploads every track and the cover, then creates a MYO playlist in the user's Yoto library. */
export async function syncAlbumToYoto(options: SyncOptions): Promise<SyncResult> {
  const { albumId, albumName, dir, accessToken, onProgress } = options
  try {
    const userRes = await fetch('https://login.yotoplay.com/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!userRes.ok)
      throw new Error('Your Yoto session has expired. Please reconnect your account.')

    const files = await listTracks(dir)
    if (!files.length) throw new Error('This album has no tracks')

    const uploadIds: string[] = []
    for (const [index, file] of files.entries()) {
      onProgress({ albumId, current: index, total: files.length, filename: file, stage: 'tracks' })
      uploadIds.push(await uploadTrack(file, dir, accessToken))
      // Pace uploads; the Yoto API rate-limits bursts.
      if (index < files.length - 1) await new Promise((r) => setTimeout(r, 1000))
    }

    onProgress({
      albumId,
      current: files.length,
      total: files.length,
      filename: 'Artwork',
      stage: 'artwork'
    })
    const coverUrl = await uploadCover(dir, accessToken).catch((e) => {
      console.warn('[sync] Cover upload error:', e)
      return null
    })

    onProgress({
      albumId,
      current: files.length,
      total: files.length,
      filename: albumName,
      stage: 'playlist'
    })
    const payload = {
      title: albumName,
      content: {
        chapters: [
          {
            key: 'chapter-1',
            title: 'Chapter 1',
            tracks: files.map((file, index) => ({
              key: `track-${index + 1}`,
              title: file.replace(/\.mp3$/i, ''),
              trackUrl: 'http://yoto.local/placeholder',
              id: uploadIds[index],
              type: 'audio'
            }))
          }
        ]
      },
      ...(coverUrl ? { metadata: { cover: { imageL: coverUrl } } } : {})
    }

    const createRes = await yotoFetch('/content', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!createRes.ok) {
      throw new Error(`Failed to create playlist: ${createRes.status} ${await createRes.text()}`)
    }
    const created = (await createRes.json()) as { id?: string; card?: { id?: string } }
    const remoteId = created.id ?? created.card?.id
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

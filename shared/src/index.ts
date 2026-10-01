// Types and constants shared by the web app and the local companion.
// The companion is the only thing that touches the filesystem or runs yt-dlp;
// the web app talks to it over HTTP on 127.0.0.1.

export const DEFAULT_COMPANION_PORT = 5174
export const DEFAULT_COMPANION_URL = `http://127.0.0.1:${DEFAULT_COMPANION_PORT}`

/** Header the web app sends with every authenticated companion request. */
export const COMPANION_TOKEN_HEADER = 'x-companion-token'
/** Query parameter used where headers can't be sent (<img>, <audio>, EventSource). */
export const COMPANION_TOKEN_QUERY = 't'

export interface ToolStatus {
  path: string | null
  version: string | null
}

export interface HealthResponse {
  name: 'yoto-local-companion'
  version: string
  libraryPath: string
  tools: {
    ytDlp: ToolStatus
    ffmpeg: ToolStatus
  }
}

export interface Track {
  /** File name inside the album folder, e.g. "Song.mp3". */
  file: string
  name: string
  /** Path (relative to the companion URL) that streams the audio. */
  url: string
}

export interface Album {
  /** Opaque id derived from the album's path relative to the library root. */
  id: string
  name: string
  artist: string
  /** Path (relative to the companion URL) of the cover image, or null. */
  art: string | null
  tracks: Track[]
  isSynced: boolean
  remoteId: string | null
}

export type DownloadStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface DownloadJob {
  id: string
  url: string
  status: DownloadStatus
  /** Overall progress across the whole playlist, 0–100. */
  progress: number
  /** 1-based index of the item currently downloading. */
  current: number
  total: number
  title: string | null
  /** e.g. "Downloading", "Converting", "Embedding artwork". */
  stage: string | null
  error: string | null
  createdAt: string
}

export interface SyncProgress {
  albumId: string
  current: number
  total: number
  filename: string
  stage: 'tracks' | 'transcoding' | 'artwork' | 'playlist'
}

export type CompanionEvent =
  | { type: 'job'; job: DownloadJob }
  | { type: 'sync'; progress: SyncProgress }
  | { type: 'library-changed' }

export interface SyncResult {
  success: boolean
  remoteId?: string
  error?: string
}

export interface ApiError {
  error: string
}

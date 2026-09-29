import {
  COMPANION_TOKEN_HEADER,
  COMPANION_TOKEN_QUERY,
  DEFAULT_COMPANION_URL,
  type Album,
  type CompanionEvent,
  type DownloadJob,
  type HealthResponse,
  type SyncResult
} from '@yoto-local/shared'

const URL_KEY = 'yoto_companion_url'
const TOKEN_KEY = 'yoto_companion_token'

export class CompanionError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Storage unavailable (private mode); the value just won't persist.
  }
}

/** HTTP client for the local companion running on 127.0.0.1. */
export const companion = {
  get baseUrl(): string {
    return read(URL_KEY) ?? DEFAULT_COMPANION_URL
  },

  setBaseUrl(url: string | null): void {
    write(URL_KEY, url?.replace(/\/$/, '') ?? null)
  },

  get token(): string | null {
    return read(TOKEN_KEY)
  },

  setToken(token: string | null): void {
    write(TOKEN_KEY, token?.trim().toUpperCase() ?? null)
  },

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (this.token) headers[COMPANION_TOKEN_HEADER] = this.token
    if (body !== undefined) headers['content-type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
    } catch {
      throw new CompanionError(0, 'Cannot reach the Yoto Local companion. Is it running?')
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new CompanionError(
        res.status,
        (data as { error?: string } | null)?.error ?? res.statusText
      )
    }
    return data as T
  },

  /** Absolute URL for companion media (<img>/<audio> can't send headers, so the token rides in the query). */
  mediaUrl(path: string): string {
    const sep = path.includes('?') ? '&' : '?'
    return `${this.baseUrl}${path}${sep}${COMPANION_TOKEN_QUERY}=${encodeURIComponent(this.token ?? '')}`
  },

  subscribe(onEvent: (event: CompanionEvent) => void): () => void {
    const source = new EventSource(this.mediaUrl('/api/events'))
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as CompanionEvent)
      } catch {
        // Ignore malformed events.
      }
    }
    return () => source.close()
  },

  health: () => companion.request<HealthResponse>('GET', '/api/health'),
  verifyPairing: () => companion.request<{ paired: boolean }>('GET', '/api/session'),
  library: () => companion.request<Album[]>('GET', '/api/library'),
  downloads: () => companion.request<DownloadJob[]>('GET', '/api/downloads'),
  startDownload: (url: string) => companion.request<DownloadJob>('POST', '/api/downloads', { url }),
  cancelDownload: (id: string) => companion.request<DownloadJob>('DELETE', `/api/downloads/${id}`),
  setArt: (albumId: string, imageUrl: string) =>
    companion.request('PUT', `/api/library/${albumId}/art`, { imageUrl }),
  deleteAlbum: (albumId: string) => companion.request('DELETE', `/api/library/${albumId}`),
  sync: (albumId: string, accessToken: string) =>
    companion.request<SyncResult>('POST', `/api/library/${albumId}/sync`, { accessToken }),
  unsync: (albumId: string, accessToken: string | null) =>
    companion.request('POST', `/api/library/${albumId}/unsync`, { accessToken }),
  markSynced: (albumId: string, synced: boolean) =>
    companion.request('PATCH', `/api/library/${albumId}/sync`, { synced }),
  updateYtDlp: () => companion.request<{ output: string }>('POST', '/api/tools/ytdlp/update')
}

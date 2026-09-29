import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { DEFAULT_COMPANION_PORT } from '@yoto-local/shared'

export interface CompanionConfig {
  port: number
  libraryPath: string
  dataDir: string
  allowedOrigins: string[]
  pairingToken: string
}

// Origins allowed to call the companion. The hosted app plus local Vite dev/preview.
const DEFAULT_ORIGINS = [
  'https://coxsm.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]

function platformConfigDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support')
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

/** Human-friendly pairing code, e.g. "K7QMZ-2XPAB" (50 bits). */
function generatePairingToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(10)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CompanionConfig {
  const dataDir = env.YOTO_LOCAL_DATA_DIR ?? join(platformConfigDir(), 'yoto-local-companion')
  mkdirSync(dataDir, { recursive: true })

  const configFile = join(dataDir, 'config.json')
  const stored = readJson<{ pairingToken?: string }>(configFile) ?? {}
  if (!stored.pairingToken) {
    stored.pairingToken = generatePairingToken()
    writeJsonAtomic(configFile, stored)
  }

  const libraryPath = env.YOTO_LOCAL_LIBRARY ?? join(homedir(), 'Music', 'YotoLocal')
  mkdirSync(libraryPath, { recursive: true })

  const extraOrigins = (env.YOTO_LOCAL_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return {
    port: Number(env.YOTO_LOCAL_PORT) || DEFAULT_COMPANION_PORT,
    libraryPath,
    dataDir,
    allowedOrigins: [...DEFAULT_ORIGINS, ...extraOrigins],
    pairingToken: stored.pairingToken
  }
}

export interface SyncRecord {
  synced: boolean
  lastSynced: string
  remoteId: string | null
}

interface StateFile {
  /** Keyed by album path relative to the library root, using forward slashes. */
  syncStatus: Record<string, SyncRecord>
}

/** Persistent per-album sync state, stored in the companion's data dir. */
export class StateStore {
  private readonly file: string
  private data: StateFile

  constructor(dataDir: string, libraryPath: string) {
    this.file = join(dataDir, 'state.json')
    const existing = readJson<StateFile>(this.file)
    if (existing) {
      this.data = { syncStatus: existing.syncStatus ?? {} }
    } else {
      this.data = { syncStatus: migrateElectronStore(libraryPath) }
      this.save()
    }
  }

  get(albumKey: string): SyncRecord | undefined {
    return this.data.syncStatus[albumKey]
  }

  set(albumKey: string, record: Partial<SyncRecord> & { synced: boolean }): void {
    const previous = this.data.syncStatus[albumKey]
    this.data.syncStatus[albumKey] = {
      synced: record.synced,
      lastSynced: new Date().toISOString(),
      remoteId: record.remoteId !== undefined ? record.remoteId : (previous?.remoteId ?? null)
    }
    this.save()
  }

  delete(albumKey: string): void {
    delete this.data.syncStatus[albumKey]
    this.save()
  }

  private save(): void {
    writeJsonAtomic(this.file, this.data)
  }
}

/**
 * The old Electron app stored sync status via electron-store, keyed by absolute path.
 * Import whatever lives inside the current library so existing sync state survives.
 */
function migrateElectronStore(libraryPath: string): Record<string, SyncRecord> {
  const legacyFile = join(platformConfigDir(), 'yoto-local', 'config.json')
  if (!existsSync(legacyFile)) return {}
  const legacy = readJson<{ syncStatus?: Record<string, Partial<SyncRecord>> }>(legacyFile)
  const result: Record<string, SyncRecord> = {}
  for (const [absPath, record] of Object.entries(legacy?.syncStatus ?? {})) {
    const rel = relative(libraryPath, absPath)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
    result[rel.split('\\').join('/')] = {
      synced: !!record.synced,
      lastSynced: record.lastSynced ?? new Date().toISOString(),
      remoteId: record.remoteId ?? null
    }
  }
  return result
}

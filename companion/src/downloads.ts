import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { isSea } from 'node:sea'
import type { DownloadJob } from '@yoto-local/shared'
import { resolveTool } from './binaries.js'
import type { EventHub } from './events.js'
import { HttpError } from './library.js'

// Machine-readable progress: "[progress] <index>|<count>|<percent>|<title>"
const PROGRESS_TEMPLATE =
  'download:[progress] %(info.playlist_index|1)s|%(info.n_entries|1)s|%(progress._percent_str)s|%(info.title)s'
// Each part is capped (in bytes) so long titles don't push paths past Windows' 260-char limit,
// which makes yt-dlp fail with "No such file or directory" on the thumbnail.
const OUTPUT_TEMPLATE =
  '%(playlist_uploader,uploader|Unknown).40B/%(playlist_title,title).60B/%(title).80B.%(ext)s'
const MAX_JOBS_KEPT = 20
const EMIT_INTERVAL_MS = 200

export interface ProgressLine {
  current: number
  total: number
  percent: number
  title: string
}

export function parseProgressLine(line: string): ProgressLine | null {
  const match = line.match(/^\[progress\] (\S+)\|(\S+)\|\s*([\d.]+)%\|(.*)$/)
  if (!match) return null
  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  return {
    current: Number.isFinite(current) && current > 0 ? current : 1,
    total: Number.isFinite(total) && total > 0 ? total : 1,
    percent: Math.min(100, Math.max(0, Number.parseFloat(match[3]) || 0)),
    title: match[4].trim()
  }
}

export function stageFromLine(line: string): string | null {
  if (line.startsWith('[youtube:tab]') || /Downloading playlist/i.test(line))
    return 'Reading playlist'
  if (line.startsWith('[ExtractAudio]')) return 'Converting to MP3'
  if (line.startsWith('[Metadata]')) return 'Writing tags'
  if (line.startsWith('[EmbedThumbnail]')) return 'Embedding artwork'
  return null
}

export function overallProgress(current: number, total: number, percent: number): number {
  const done = Math.max(0, current - 1)
  return Math.min(100, Math.max(0, (done * 100 + percent) / Math.max(1, total)))
}

export function buildYtDlpArgs(
  url: string,
  libraryPath: string,
  ffmpegPath: string | null
): string[] {
  const args = [
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--embed-thumbnail',
    '--embed-metadata',
    '--yes-playlist',
    // YouTube intermittently 403s media requests mid-playlist; retry before giving up on an item.
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    '--extractor-retries',
    '3',
    '--newline',
    '--color',
    'never',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--paths',
    libraryPath,
    '--output',
    OUTPUT_TEMPLATE
  ]
  if (ffmpegPath) args.push('--ffmpeg-location', dirname(ffmpegPath))
  // YouTube now needs a JS runtime to solve its challenges; reuse the Node running us.
  if (!isSea()) args.push('--js-runtimes', `node:${process.execPath}`)
  args.push('--', url)
  return args
}

function validateUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    throw new HttpError(400, 'Enter a valid URL')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'URL must start with http:// or https://')
  }
  return parsed.toString()
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    // yt-dlp spawns ffmpeg; kill the whole tree so nothing keeps writing.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

/** Runs yt-dlp jobs one at a time and broadcasts their progress. */
export class DownloadManager {
  private readonly jobs = new Map<string, DownloadJob>()
  private readonly queue: string[] = []
  private running: { id: string; child: ChildProcess; cancelled: boolean } | null = null
  private lastEmit = 0

  constructor(
    private readonly libraryPath: string,
    private readonly hub: EventHub
  ) {}

  list(): DownloadJob[] {
    return [...this.jobs.values()].reverse()
  }

  enqueue(rawUrl: string): DownloadJob {
    const url = validateUrl(rawUrl)
    const job: DownloadJob = {
      id: randomUUID(),
      url,
      status: 'queued',
      progress: 0,
      current: 0,
      total: 0,
      title: null,
      stage: null,
      error: null,
      createdAt: new Date().toISOString()
    }
    this.jobs.set(job.id, job)
    this.prune()
    this.queue.push(job.id)
    this.emit(job, true)
    this.next()
    return job
  }

  cancel(id: string): DownloadJob {
    const job = this.jobs.get(id)
    if (!job) throw new HttpError(404, 'Download not found')
    if (job.status === 'queued') {
      this.queue.splice(this.queue.indexOf(id), 1)
      job.status = 'cancelled'
      this.emit(job, true)
    } else if (this.running?.id === id) {
      this.running.cancelled = true
      killTree(this.running.child)
    }
    return job
  }

  /** Stops everything, e.g. on shutdown; on Windows yt-dlp would otherwise outlive us. */
  cancelAll(): void {
    for (const id of [...this.queue]) this.cancel(id)
    if (this.running) this.cancel(this.running.id)
  }

  private prune(): void {
    const finished = [...this.jobs.values()].filter(
      (j) => j.status !== 'queued' && j.status !== 'running'
    )
    while (this.jobs.size > MAX_JOBS_KEPT && finished.length) this.jobs.delete(finished.shift()!.id)
  }

  private emit(job: DownloadJob, force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < EMIT_INTERVAL_MS) return
    this.lastEmit = now
    this.hub.emit({ type: 'job', job: { ...job } })
  }

  private next(): void {
    if (this.running) return
    const id = this.queue.shift()
    if (!id) return
    const job = this.jobs.get(id)!
    try {
      this.run(job)
    } catch (error) {
      job.status = 'error'
      job.error = error instanceof Error ? error.message : String(error)
      this.emit(job, true)
      this.next()
    }
  }

  private run(job: DownloadJob): void {
    const ytDlp = resolveTool('yt-dlp')
    if (!ytDlp) throw new Error('yt-dlp was not found. Set YTDLP_PATH or install yt-dlp.')

    const child = spawn(ytDlp, buildYtDlpArgs(job.url, this.libraryPath, resolveTool('ffmpeg')), {
      windowsHide: true
    })
    this.running = { id: job.id, child, cancelled: false }
    job.status = 'running'
    job.stage = 'Starting'
    this.emit(job, true)

    let completedItems = 0
    let errorLines: string[] = []
    let stdoutBuffer = ''

    const handleLine = (line: string): void => {
      const progress = parseProgressLine(line)
      if (progress) {
        if (progress.current !== job.current && job.current > 0) {
          this.hub.emit({ type: 'library-changed' })
        }
        job.current = progress.current
        job.total = progress.total
        job.title = progress.title
        job.stage = 'Downloading'
        job.progress = overallProgress(progress.current, progress.total, progress.percent)
        this.emit(job)
        return
      }
      const stage = stageFromLine(line)
      if (stage) {
        if (stage === 'Converting to MP3') completedItems++
        job.stage = stage
        this.emit(job, true)
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''
      lines.forEach(handleLine)
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      const errors = chunk.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'))
      errorLines = [...errorLines, ...errors].slice(-5)
    })

    const finish = (status: DownloadJob['status'], error: string | null): void => {
      job.status = status
      job.error = error
      job.stage = null
      if (status === 'done') job.progress = 100
      this.running = null
      this.emit(job, true)
      this.hub.emit({ type: 'library-changed' })
      this.next()
    }

    child.on('error', (err) => finish('error', err.message))
    child.on('close', (code) => {
      if (this.running?.id !== job.id) return // Already finished via 'error'.
      if (stdoutBuffer) handleLine(stdoutBuffer)
      const errorText = errorLines.map((l) => l.replace(/^ERROR:\s*/, '')).join('\n') || null
      if (this.running.cancelled) finish('cancelled', null)
      else if (code === 0) finish('done', null)
      // yt-dlp exits non-zero when any playlist item fails; keep the ones that worked.
      else if (completedItems > 0) finish('done', `Some items failed:\n${errorText ?? ''}`.trim())
      else finish('error', errorText ?? `yt-dlp exited with code ${code}`)
    })
  }
}

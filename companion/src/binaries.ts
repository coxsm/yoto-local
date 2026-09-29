import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ToolStatus } from '@yoto-local/shared'

const execFileAsync = promisify(execFile)

// Works from both src/ (tsx) and dist/ (bundled): each is one level below companion/.
const BUNDLED_BIN_DIR = fileURLToPath(new URL('../bin', import.meta.url))

type ToolName = 'yt-dlp' | 'ffmpeg'

const ENV_OVERRIDES: Record<ToolName, string> = {
  'yt-dlp': 'YTDLP_PATH',
  ffmpeg: 'FFMPEG_PATH'
}

function executableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, executableName(name))
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Resolution order: env override → bundled companion/bin/<platform> → PATH. */
export function resolveTool(name: ToolName): string | null {
  const override = process.env[ENV_OVERRIDES[name]]
  if (override) return existsSync(override) ? override : null

  const bundled = join(BUNDLED_BIN_DIR, process.platform, executableName(name))
  if (existsSync(bundled)) return bundled

  return findOnPath(name)
}

async function readVersion(name: ToolName, path: string): Promise<string | null> {
  try {
    const args = name === 'ffmpeg' ? ['-version'] : ['--version']
    const { stdout } = await execFileAsync(path, args, { timeout: 15_000, windowsHide: true })
    const firstLine = stdout.split(/\r?\n/)[0].trim()
    return name === 'ffmpeg'
      ? (firstLine.match(/ffmpeg version (\S+)/)?.[1] ?? firstLine)
      : firstLine
  } catch {
    return null
  }
}

export async function toolStatus(name: ToolName): Promise<ToolStatus> {
  const path = resolveTool(name)
  return { path, version: path ? await readVersion(name, path) : null }
}

/** Runs `yt-dlp -U`. Only works for the standalone binary, not pip installs. */
export async function updateYtDlp(): Promise<{ output: string }> {
  const path = resolveTool('yt-dlp')
  if (!path) throw new Error('yt-dlp not found')
  const { stdout, stderr } = await execFileAsync(path, ['-U'], {
    timeout: 120_000,
    windowsHide: true
  })
  return { output: `${stdout}${stderr}`.trim() }
}

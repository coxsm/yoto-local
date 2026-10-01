// Starting the companion from the web app. Browsers can't run local files, so a one-time
// .reg file registers a per-user `yoto-local:` URL protocol that runs the user's
// start-companion.bat (or, in background mode, start-companion-hidden.vbs from the same folder,
// which runs it without a console window). The registered command ignores the URL, so a link
// from any other site can only start the companion, never run anything else.

export const LAUNCH_URL = 'yoto-local://start'

const PATH_KEY = 'yoto_companion_launcher_path'
const INSTALLED_KEY = 'yoto_companion_launcher_installed'
const HIDDEN_KEY = 'yoto_companion_launcher_hidden'
const HIDDEN_SCRIPT = 'start-companion-hidden.vbs'

export const isWindows = /Windows/i.test(navigator.userAgent)

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
    // Storage unavailable; the setting just won't persist.
  }
}

export const launcher = {
  get path(): string | null {
    return read(PATH_KEY)
  },

  /** Saving a different path means the .reg file has to be installed again. */
  setPath(path: string | null): void {
    if (path !== this.path) write(INSTALLED_KEY, null)
    write(PATH_KEY, path)
  },

  get hidden(): boolean {
    return read(HIDDEN_KEY) === 'true'
  },

  /** Switching modes changes the registered command, so the .reg has to be installed again. */
  setHidden(hidden: boolean): void {
    if (hidden !== this.hidden) write(INSTALLED_KEY, null)
    write(HIDDEN_KEY, hidden ? 'true' : null)
  },

  get installed(): boolean {
    return read(INSTALLED_KEY) === 'true'
  },

  setInstalled(installed: boolean): void {
    write(INSTALLED_KEY, installed ? 'true' : null)
  },

  launch(): void {
    window.location.href = LAUNCH_URL
  }
}

/** Trims whitespace and the quotes Explorer's "Copy as path" adds. */
export function normalizeBatchPath(path: string): string {
  return path
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
}

/** Returns an error message, or null when the path looks like a Windows batch file. */
export function validateBatchPath(path: string): string | null {
  const trimmed = normalizeBatchPath(path)
  if (!/^[a-zA-Z]:\\/.test(trimmed) && !trimmed.startsWith('\\\\')) {
    return 'Use the full path, e.g. C:\\Users\\you\\yoto-local\\start-companion.bat'
  }
  if (!/\.(bat|cmd)$/i.test(trimmed)) return 'The path should end in .bat or .cmd'
  if (/["\r\n]/.test(trimmed)) return 'The path can’t contain quotes or line breaks'
  return null
}

/** The command Windows runs for yoto-local:// links. */
export function launchCommand(batchPath: string, hidden: boolean): string {
  const path = batchPath.trim()
  if (!hidden) return `"${path}"`
  const folder = path.slice(0, path.lastIndexOf('\\') + 1)
  return `wscript.exe "${folder}${HIDDEN_SCRIPT}"`
}

/** Builds the .reg file that maps yoto-local:// to the launch command (HKCU only, no admin). */
export function buildRegFile(batchPath: string, hidden = false): string {
  // .reg string values escape backslashes and quotes.
  const command = launchCommand(batchPath, hidden).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return [
    'Windows Registry Editor Version 5.00',
    '',
    '[HKEY_CURRENT_USER\\Software\\Classes\\yoto-local]',
    '@="URL:Yoto Local companion"',
    '"URL Protocol"=""',
    '',
    '[HKEY_CURRENT_USER\\Software\\Classes\\yoto-local\\shell\\open\\command]',
    `@="${command}"`,
    ''
  ].join('\r\n')
}

/** Downloads the .reg file as UTF-16LE with a BOM so non-ASCII paths survive regedit. */
export function downloadRegFile(batchPath: string, hidden = false): void {
  const text = buildRegFile(batchPath, hidden)
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[2 + i * 2] = code & 0xff
    bytes[3 + i * 2] = code >> 8
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'yoto-local-launcher.reg'
  link.click()
  URL.revokeObjectURL(url)
}

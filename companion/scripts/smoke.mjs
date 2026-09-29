// Starts the built companion against a throwaway library and checks it is healthy
// and can see yt-dlp. Used by CI on every OS.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'yoto-local-smoke-'))
const port = 5199

const child = spawn(process.execPath, [join(root, 'dist', 'index.mjs')], {
  env: {
    ...process.env,
    YOTO_LOCAL_PORT: String(port),
    YOTO_LOCAL_LIBRARY: join(temp, 'library'),
    YOTO_LOCAL_DATA_DIR: join(temp, 'data')
  },
  stdio: 'inherit'
})

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return res.json()
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Companion did not become healthy')
}

let exitCode = 0
try {
  const health = await waitForHealth()
  console.log('Health:', JSON.stringify(health, null, 2))
  if (!health.tools.ytDlp.version) throw new Error('yt-dlp not found by the companion')

  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/library`)
  if (unauthorized.status !== 401)
    throw new Error(`Expected 401 without pairing, got ${unauthorized.status}`)
  console.log('Smoke test passed')
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  child.kill()
  rmSync(temp, { recursive: true, force: true })
}
process.exitCode = exitCode

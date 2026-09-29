// Downloads the pinned yt-dlp standalone build (bin-versions.json) into bin/<platform>/.
// Usage: node scripts/fetch-ytdlp.mjs [--force]
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { 'yt-dlp': version } = JSON.parse(await readFile(join(root, 'bin-versions.json'), 'utf8'))

const assets = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
}
const asset = assets[process.platform]
if (!asset) throw new Error(`No yt-dlp build for ${process.platform}`)

const target = join(
  root,
  'bin',
  process.platform,
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
)
const exists = await stat(target).then(
  () => true,
  () => false
)
if (exists && !process.argv.includes('--force')) {
  console.log(`yt-dlp already present at ${target} (use --force to replace)`)
  process.exit(0)
}

const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${asset}`
console.log(`Downloading ${url}`)
const res = await fetch(url)
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

await mkdir(join(root, 'bin', process.platform), { recursive: true })
await writeFile(target, Buffer.from(await res.arrayBuffer()))
if (process.platform !== 'win32') await chmod(target, 0o755)
console.log(`Saved yt-dlp ${version} to ${target}`)

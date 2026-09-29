import { loadConfig, StateStore } from './config.js'
import { DownloadManager } from './downloads.js'
import { EventHub } from './events.js'
import { buildServer } from './server.js'
import { toolStatus } from './binaries.js'

const APP_URL = process.env.YOTO_LOCAL_APP_URL ?? 'https://coxsm.github.io/yoto-local/'

async function main(): Promise<void> {
  const config = loadConfig()
  const store = new StateStore(config.dataDir, config.libraryPath)
  const hub = new EventHub()
  const downloads = new DownloadManager(config.libraryPath, hub)
  const app = buildServer({ config, store, hub, downloads })

  await app.listen({ host: '127.0.0.1', port: config.port })

  const [ytDlp, ffmpeg] = await Promise.all([toolStatus('yt-dlp'), toolStatus('ffmpeg')])
  const line = '─'.repeat(52)
  console.log(`\n${line}`)
  console.log(`  Yoto Local companion  http://127.0.0.1:${config.port}`)
  console.log(line)
  console.log(`  Pairing code:  ${config.pairingToken}`)
  console.log(`  Open:          ${APP_URL}`)
  console.log(`  Library:       ${config.libraryPath}`)
  console.log(
    `  yt-dlp:        ${ytDlp.version ?? 'NOT FOUND'}${ytDlp.path ? `  (${ytDlp.path})` : ''}`
  )
  console.log(
    `  ffmpeg:        ${ffmpeg.version ?? 'NOT FOUND'}${ffmpeg.path ? `  (${ffmpeg.path})` : ''}`
  )
  console.log(`${line}\n`)

  const shutdown = async (): Promise<void> => {
    hub.close()
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(
      'Port is already in use. Is the companion already running? Set YOTO_LOCAL_PORT to change it.'
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})

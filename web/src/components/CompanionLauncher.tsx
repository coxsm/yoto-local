import React, { useEffect, useState } from 'react'
import { Download, Loader2, Play } from 'lucide-react'
import {
  downloadRegFile,
  launcher,
  normalizeBatchPath,
  useLauncherConfig,
  validateBatchPath
} from '../lib/launcher'

interface CompanionLauncherProps {
  /** Called after launching so the page reconnects as soon as the companion is up. */
  onLaunched: () => void
}

/** How long to wait for the companion before offering the Start button again. */
const GIVE_UP_MS = 30000

export const bigInput =
  'w-full px-5 py-4 rounded-2xl bg-black/20 border border-white/10 focus:border-primary focus:ring-2 focus:ring-primary outline-none font-mono text-base sm:text-lg'
export const bigPrimary =
  'w-full flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-gradient-to-r from-accent to-orange-600 text-white text-xl sm:text-2xl font-bold hover:brightness-110 active:scale-[0.99] disabled:opacity-60 transition'
const bigSecondary =
  'w-full flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-lg sm:text-xl font-semibold transition'

// Auto-start at most once per page load, so a closed console window isn't reopened endlessly.
let autoStarted = false

/** Windows-only: start the companion's batch file from the page via a yoto-local:// link. */
export function CompanionLauncher({ onLaunched }: CompanionLauncherProps) {
  const { path, installed } = useLauncherConfig()
  if (!path) return <PathStep />
  if (!installed) return <InstallStep path={path} />
  return <StartStep onLaunched={onLaunched} />
}

function Heading({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-3xl sm:text-4xl font-bold font-display">{title}</h2>
      {hint && <p className="text-lg sm:text-xl text-muted-foreground">{hint}</p>}
    </div>
  )
}

function PathStep() {
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateBatchPath(path)
    setError(problem)
    if (!problem) launcher.setPath(normalizeBatchPath(path))
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Heading
        title="Step 1 of 2: Find the file"
        hint={
          <>
            Open your yoto-local folder. Hold <b>Shift</b>, right-click{' '}
            <code className="font-mono">start-companion.bat</code>, choose <b>Copy as path</b>, then
            paste it here.
          </>
        }
      />
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="Paste the path here"
        aria-label="Path to start-companion.bat"
        spellCheck={false}
        autoComplete="off"
        autoFocus
        className={bigInput}
      />
      {error && <p className="text-lg text-red-400">{error}</p>}
      <button type="submit" disabled={!path.trim()} className={bigPrimary}>
        Next
      </button>
    </form>
  )
}

function InstallStep({ path }: { path: string }) {
  const [downloaded, setDownloaded] = useState(false)

  return (
    <div className="space-y-6">
      <Heading
        title="Step 2 of 2: Allow the Start button"
        hint="Download this small file, open it, and click Yes. You only do this once."
      />
      <button
        onClick={() => {
          downloadRegFile(path)
          setDownloaded(true)
        }}
        className={downloaded ? bigSecondary : bigPrimary}
      >
        <Download size={28} />
        Download file
      </button>
      {downloaded && (
        <button onClick={() => launcher.setInstalled(true)} className={bigPrimary}>
          <Play size={28} />I opened it. Start!
        </button>
      )}
      <button
        onClick={() => launcher.setPath(null)}
        className="text-lg text-muted-foreground hover:text-foreground underline"
      >
        Back
      </button>
    </div>
  )
}

function StartStep({ onLaunched }: { onLaunched: () => void }) {
  const [launching, setLaunching] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  const start = () => {
    launcher.launch()
    setLaunching(true)
    setTimedOut(false)
  }

  // The companion rebuilds before listening, so check again shortly, then give up and offer
  // the button again if it still hasn't appeared.
  useEffect(() => {
    if (!launching) return
    const recheck = window.setTimeout(onLaunched, 4000)
    const giveUp = window.setTimeout(() => {
      setLaunching(false)
      setTimedOut(true)
    }, GIVE_UP_MS)
    return () => {
      window.clearTimeout(recheck)
      window.clearTimeout(giveUp)
    }
  }, [launching, onLaunched])

  useEffect(() => {
    if (autoStarted) return
    autoStarted = true
    launcher.launch()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLaunching(true)
  }, [])

  if (launching) {
    return (
      <div className="space-y-6 text-center py-4">
        <Loader2 className="w-16 h-16 animate-spin text-accent mx-auto" />
        <Heading
          title="Starting..."
          hint="This takes a few seconds. If your browser asks to open Yoto Local, choose Open."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {timedOut && (
        <Heading
          title="It didn’t start"
          hint="Check that the console window opened, or try once more."
        />
      )}
      <button onClick={start} className={bigPrimary + ' py-8 text-3xl sm:text-4xl'}>
        <Play size={40} />
        {timedOut ? 'Try again' : 'Start'}
      </button>
    </div>
  )
}

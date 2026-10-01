import React, { useState } from 'react'
import { AlertTriangle, Link2, Loader2, RefreshCw, Terminal } from 'lucide-react'
import type { HealthResponse } from '@yoto-local/shared'
import type { CompanionStatus } from '../hooks/useCompanion'
import { isWindows } from '../lib/launcher'
import { CompanionLauncher } from './CompanionLauncher'

const SETUP_URL = 'https://github.com/coxsm/yoto-local#running-the-companion'

interface CompanionPanelProps {
  status: CompanionStatus
  health: HealthResponse | null
  pairError: string | null
  onRetry: () => void
  onPair: (code: string) => Promise<boolean>
}

/** Explains how to start/pair the local companion; renders nothing once everything is ready. */
export function CompanionPanel({
  status,
  health,
  pairError,
  onRetry,
  onPair
}: CompanionPanelProps) {
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setPairing(true)
    await onPair(code)
    setPairing(false)
  }

  if (status === 'checking') {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Looking for the Yoto Local companion...
      </div>
    )
  }

  if (status === 'ready') {
    const missing = [
      !health?.tools.ytDlp.path && 'yt-dlp',
      !health?.tools.ffmpeg.path && 'ffmpeg'
    ].filter(Boolean)
    if (!missing.length) return null
    return (
      <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
        <AlertTriangle className="w-5 h-5 text-accent shrink-0" />
        <p>
          The companion couldn’t find {missing.join(' and ')}, so downloads won’t work yet.{' '}
          <a href={SETUP_URL} target="_blank" rel="noreferrer" className="underline">
            Setup help
          </a>
        </p>
      </div>
    )
  }

  if (status === 'unpaired') {
    return (
      <form
        onSubmit={submit}
        className="rounded-2xl border border-white/10 bg-card/50 p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-bold">Pair with the companion</h2>
            <p className="text-sm text-muted-foreground">
              Enter the pairing code shown in the companion window (or in{' '}
              <code className="font-mono text-xs">companion.log</code> in your yoto-local folder if
              it runs in the background). You only need to do this once per browser.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            spellCheck={false}
            aria-label="Pairing code"
            className="flex-1 px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono uppercase tracking-widest"
          />
          <button
            type="submit"
            disabled={pairing || !code.trim()}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {pairing ? 'Pairing...' : 'Pair'}
          </button>
        </div>
        {pairError && <p className="text-sm text-red-400">{pairError}</p>}
      </form>
    )
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card/50 p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Terminal className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="font-bold">Start the Yoto Local companion</h2>
          <p className="text-sm text-muted-foreground">
            Downloads happen on your computer through a small companion app. Start it, then this
            page will connect automatically. If your browser asks to allow access to devices on your
            local network, choose Allow.
          </p>
        </div>
      </div>
      {isWindows ? (
        <CompanionLauncher onLaunched={onRetry} />
      ) : (
        <pre className="overflow-x-auto rounded-xl bg-black/30 px-4 py-3 text-sm font-mono">
          npm start
        </pre>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium"
        >
          <RefreshCw size={16} />
          Try again
        </button>
        <a
          href={SETUP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center px-4 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Setup instructions
        </a>
      </div>
    </div>
  )
}

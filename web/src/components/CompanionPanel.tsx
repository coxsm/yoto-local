import React, { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { HealthResponse } from '@yoto-local/shared'
import type { CompanionStatus } from '../hooks/useCompanion'
import { isWindows } from '../lib/launcher'
import { bigInput, bigPrimary, CompanionLauncher } from './CompanionLauncher'

const SETUP_URL = 'https://github.com/coxsm/yoto-local#running-the-companion'

const cardClass =
  'mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-card/50 p-6 sm:p-10 space-y-6'

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
      <div className="flex items-center justify-center gap-4 py-10 text-xl text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        Getting ready...
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
      <form onSubmit={submit} className={cardClass}>
        <div className="space-y-2">
          <h2 className="text-3xl sm:text-4xl font-bold font-display">Enter the code</h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            Type the code shown in the black window. You only do this once.
          </p>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXXX-XXXXX"
          autoComplete="off"
          spellCheck={false}
          aria-label="Pairing code"
          className={bigInput + ' uppercase tracking-widest text-center text-2xl sm:text-3xl'}
        />
        {pairError && <p className="text-lg text-red-400">{pairError}</p>}
        <button type="submit" disabled={pairing || !code.trim()} className={bigPrimary}>
          {pairing ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    )
  }

  return (
    <div className={cardClass}>
      {isWindows ? (
        <CompanionLauncher onLaunched={onRetry} />
      ) : (
        <div className="space-y-4">
          <h2 className="text-3xl sm:text-4xl font-bold font-display">Start Yoto Local</h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            In a terminal, run this in the yoto-local folder:
          </p>
          <pre className="overflow-x-auto rounded-2xl bg-black/30 px-5 py-4 text-xl font-mono">
            npm start
          </pre>
        </div>
      )}
      <a
        href={SETUP_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-base text-muted-foreground hover:text-foreground underline"
      >
        Need help?
      </a>
    </div>
  )
}

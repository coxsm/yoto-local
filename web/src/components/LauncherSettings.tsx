import React, { useState } from 'react'
import { Download, X } from 'lucide-react'
import {
  downloadRegFile,
  launcher,
  normalizeBatchPath,
  useLauncherConfig,
  validateBatchPath
} from '../lib/launcher'
import { bigInput, bigPrimary } from './CompanionLauncher'

interface LauncherSettingsProps {
  onClose: () => void
}

/** Settings dialog for the Windows Start button: where start-companion.bat lives. */
export function LauncherSettings({ onClose }: LauncherSettingsProps) {
  const config = useLauncherConfig()
  const [path, setPath] = useState(config.path ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateBatchPath(path)
    setError(problem)
    if (problem) return
    const normalized = normalizeBatchPath(path)
    launcher.setPath(normalized)
    setPath(normalized)
    setSaved(true)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/10 bg-card p-6 sm:p-8 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold font-display">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-3 rounded-full bg-white/5 hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={save} className="space-y-4">
          <label htmlFor="settings-path" className="block text-xl font-semibold">
            Where is <code className="font-mono">start-companion.bat</code>?
          </label>
          <input
            id="settings-path"
            value={path}
            onChange={(e) => {
              setPath(e.target.value)
              setSaved(false)
            }}
            placeholder="Paste the path here"
            spellCheck={false}
            autoComplete="off"
            className={bigInput}
          />
          {error && <p className="text-lg text-red-400">{error}</p>}
          <button type="submit" disabled={!path.trim()} className={bigPrimary}>
            Save
          </button>
        </form>

        <label className="flex items-start gap-4 cursor-pointer text-lg">
          <input
            type="checkbox"
            checked={config.hidden}
            onChange={(e) => {
              launcher.setHidden(e.target.checked)
              setSaved(true)
            }}
            className="mt-1.5 w-6 h-6 accent-[hsl(var(--primary))]"
          />
          <span>
            Run in the background (no black window). Stop it with the <b>Stop companion</b> button.
            The pairing code is saved in <code className="font-mono">companion.log</code>.
          </span>
        </label>

        {config.path && (
          <div className="space-y-3 border-t border-white/10 pt-6">
            <p className="text-lg text-muted-foreground">
              {saved || !config.installed
                ? 'Settings changed. Download this file and open it once, then click Yes.'
                : 'Start button not working? Download this file and open it again.'}
            </p>
            <button
              onClick={() => {
                downloadRegFile(config.path as string, config.hidden)
                launcher.setInstalled(true)
              }}
              className="w-full flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-lg font-semibold"
            >
              <Download size={24} />
              Download file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

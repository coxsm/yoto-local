import React, { useState } from 'react'
import { Download, Pencil, Play } from 'lucide-react'
import { downloadRegFile, launcher, normalizeBatchPath, validateBatchPath } from '../lib/launcher'

interface CompanionLauncherProps {
  /** Called after launching so the page reconnects as soon as the companion is up. */
  onLaunched: () => void
}

const inputClass =
  'flex-1 min-w-0 px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono text-sm'
const secondaryButton =
  'flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium'

/** Windows-only: start the companion's batch file from the page via a yoto-local:// link. */
export function CompanionLauncher({ onLaunched }: CompanionLauncherProps) {
  const [path, setPath] = useState(() => launcher.path ?? '')
  const [editing, setEditing] = useState(() => !launcher.path)
  const [installed, setInstalled] = useState(() => launcher.installed)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [hidden, setHidden] = useState(() => launcher.hidden)

  const toggleHidden = (value: boolean) => {
    launcher.setHidden(value)
    setHidden(value)
    setInstalled(launcher.installed)
  }

  const hiddenToggle = (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={hidden}
        onChange={(e) => toggleHidden(e.target.checked)}
        className="mt-0.5 accent-[hsl(var(--primary))]"
      />
      <span>
        Run in the background (no console window). Stop it with{' '}
        <span className="font-semibold">Stop companion</span>; output goes to{' '}
        <code className="font-mono text-xs">companion.log</code>. Changing this needs the launcher
        reinstalled.
      </span>
    </label>
  )

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateBatchPath(path)
    setError(problem)
    if (problem) return
    const normalized = normalizeBatchPath(path)
    launcher.setPath(normalized)
    setPath(normalized)
    setInstalled(launcher.installed)
    setEditing(false)
  }

  const start = () => {
    launcher.launch()
    setLaunching(true)
    // npm start rebuilds before listening; give it a moment, then keep retrying via onLaunched.
    window.setTimeout(() => {
      setLaunching(false)
      onLaunched()
    }, 4000)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2">
        <label htmlFor="launcher-path" className="text-sm font-medium">
          Path to <code className="font-mono">start-companion.bat</code>
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="launcher-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Users\you\Documents\GitHub\yoto-local\start-companion.bat"
            spellCheck={false}
            autoComplete="off"
            className={inputClass}
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          It’s in the root of your yoto-local folder. In File Explorer, Shift + right-click it and
          choose “Copy as path”.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    )
  }

  if (!installed) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-semibold">One-time setup:</span> download the launcher, double-click
          it and confirm the Registry Editor prompt. It lets this page start{' '}
          <code className="font-mono text-xs break-all">{path}</code> for your Windows user only.
        </p>
        {hiddenToggle}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => downloadRegFile(path, hidden)} className={secondaryButton}>
            <Download size={16} />
            Download launcher
          </button>
          <button
            onClick={() => {
              launcher.setInstalled(true)
              setInstalled(true)
            }}
            className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110"
          >
            I’ve installed it
          </button>
          <button onClick={() => setEditing(true)} className={secondaryButton}>
            <Pencil size={16} />
            Change path
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={start}
          disabled={launching}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-accent to-orange-600 text-white font-bold hover:brightness-110 disabled:opacity-70"
        >
          <Play size={18} />
          {launching ? 'Starting...' : 'Start companion'}
        </button>
        <button onClick={() => setEditing(true)} className={secondaryButton}>
          <Pencil size={16} />
          Change path
        </button>
        <button
          onClick={() => {
            launcher.setInstalled(false)
            setInstalled(false)
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Reinstall launcher
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hidden
          ? 'If your browser asks to open Yoto Local, allow it. The companion starts in the background and keeps running until you click Stop companion.'
          : 'If your browser asks to open Yoto Local, allow it. A console window opens with the companion; keep it open while you use the app.'}
      </p>
      {hiddenToggle}
    </div>
  )
}

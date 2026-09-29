import React, { useState } from 'react'
import { Download, Loader2, Music } from 'lucide-react'
import { cn } from '../lib/utils'

interface PlaylistInputProps {
  onSubmit: (url: string) => Promise<void>
  disabled?: boolean
}

export function PlaylistInput({ onSubmit, disabled = false }: PlaylistInputProps) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || disabled || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(url.trim())
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the download')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!url.trim() && !disabled && !submitting

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="url" className="text-sm font-medium text-muted-foreground ml-1">
        YouTube Playlist or Video URL
      </label>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative group flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
            <Music size={20} />
          </div>
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full pl-12 pr-4 py-4 rounded-xl bg-black/20 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50 text-foreground disabled:opacity-60"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'h-[60px] sm:w-56 rounded-xl font-bold text-lg flex items-center justify-center gap-3 px-6 shadow-lg transition-all active:scale-[0.99]',
            canSubmit
              ? 'bg-gradient-to-r from-accent to-orange-600 text-white hover:brightness-110'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {submitting ? <Loader2 className="animate-spin w-6 h-6" /> : <Download size={24} />}
          <span>Download</span>
        </button>
      </div>
      {error && <p className="text-sm text-red-400 ml-1">{error}</p>}
    </form>
  )
}

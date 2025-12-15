import React, { useState } from 'react'
import { Download, Loader2, Music } from 'lucide-react'
import { cn } from '../lib/utils'

interface PlaylistInputProps {
    onDownloadStart: (url: string) => void
    onCancel: () => void
    isDownloading?: boolean
    progress?: number
    status?: string
}

export function PlaylistInput({ onDownloadStart, isDownloading = false, progress = 0, status = '' }: PlaylistInputProps) {
    const [url, setUrl] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (url && !isDownloading) {
            onDownloadStart(url)
        }
    }

    return (
        <div className="p-0">
            <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-stretch md:items-end">
                <div className="flex-1 flex flex-col gap-2">
                    <label htmlFor="url" className="text-sm font-medium text-muted-foreground ml-1">
                        YouTube Playlist or Video URL
                    </label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                            <Music size={20} />
                        </div>
                        <input
                            id="url"
                            type="text"
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full pl-12 pr-4 py-4 rounded-xl bg-black/20 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50 text-foreground"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isDownloading}
                        />
                    </div>
                </div>

                <div className="relative rounded-xl overflow-hidden shadow-lg transition-all active:scale-[0.99] md:w-64 h-[60px]">
                    {/* Progress Bar Background */}
                    {isDownloading && (
                        <div
                            className="absolute inset-0 bg-emerald-600/20 z-0 bg-emerald-900"
                            style={{ width: `${progress}%`, transition: 'width 0.2s linear' }}
                        />
                    )}

                    <button
                        type="submit"
                        disabled={!url && !isDownloading}
                        className={cn(
                            "w-full h-full font-bold text-lg flex items-center justify-center gap-3 relative z-10 transition-colors px-6 group/btn",
                            !url && !isDownloading
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : isDownloading
                                    ? "bg-transparent text-emerald-400 border-2 border-emerald-500/50 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-all"
                                    : "bg-gradient-to-r from-accent to-orange-600 text-white hover:brightness-110"
                        )}
                    >
                        {isDownloading ? (
                            <>
                                <Loader2 className="animate-spin w-5 h-5 flex-shrink-0 group-hover/btn:hidden" />
                                <span className="font-mono text-base whitespace-nowrap group-hover/btn:hidden">{status ? `${Math.round(progress)}%` : '...'}</span>
                                <span className="hidden group-hover/btn:inline font-bold">Cancel</span>
                            </>
                        ) : (
                            <>
                                <Download size={24} />
                                <span>Download</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    )
}

import React, { useState, useEffect } from 'react'
import { ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { AuthStatus } from '../components/AuthStatus'
import { PlaylistInput } from '../components/PlaylistInput'
import { LibraryGrid } from '../components/LibraryGrid'
import { AlbumDetail, AlbumData } from '../components/AlbumDetail'
import logo from '../assets/logo.png'

export function Dashboard(): React.JSX.Element {
    const [isDownloading, setIsDownloading] = useState(false)
    const [status, setStatus] = useState<string>('Ready')
    const [progress, setProgress] = useState(0)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [selectedAlbum, setSelectedAlbum] = useState<AlbumData | null>(null)

    // Listen for progress events
    useEffect(() => {
        // @ts-ignore
        const removeListener = window.electron.ipcRenderer.on('download-progress', (_, percent) => {
            setProgress(percent)
            setStatus(`Downloading... ${percent.toFixed(1)}%`)
        })
        return () => removeListener()
    }, [])

    const handleDownloadStart = async (url: string) => {
        setIsDownloading(true)
        setStatus('Initializing download...')
        setProgress(0)

        try {
            // @ts-ignore
            await window.electron.ipcRenderer.invoke('download-playlist', url)
            setStatus('Download complete!')
            setRefreshTrigger(prev => prev + 1) // Refresh library
        } catch (error: any) {
            console.error(error)
            const msg = error.message || 'Download failed'
            setStatus(`Error: ${msg}`)
        } finally {
            setIsDownloading(false)
            setProgress(0)
            if (!status.startsWith('Error')) {
                setTimeout(() => setStatus('Ready'), 5000)
            }
        }
    }

    const handleCancelDownload = () => {
        // @ts-ignore
        window.electron.ipcRenderer.send('cancel-download')
        setIsDownloading(false)
        setStatus('Cancelled')
        setTimeout(() => setStatus('Ready'), 2000)
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            {/* Header */}
            <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <img src={logo} alt="Yoto Local" className="h-10 w-auto" />
                    <span className="text-xl font-display font-bold text-white hidden md:inline-block">yoto-local</span>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => window.open('https://my.yotoplay.com/my-cards/playlists', '_blank')}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors border border-white/5"
                        title="Open Yoto Library"
                    >
                        <span>Yoto Library</span>
                        <ExternalLink size={14} />
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-2" />
                    <AuthStatus />
                </div>
            </header>

            <main className="w-full px-8 py-8 space-y-8">

                {/* Input Area */}
                <div className="w-full">
                    <PlaylistInput
                        onDownloadStart={handleDownloadStart}
                        onCancel={handleCancelDownload}
                        isDownloading={isDownloading}
                        progress={progress}
                        status={status}
                    />
                </div>

                {/* Local Library Section */}
                <div className="space-y-6 pt-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white font-display">Local Library</h2>
                        <button
                            onClick={() => setRefreshTrigger(p => p + 1)}
                            className="text-xs text-muted-foreground hover:text-white transition-colors uppercase tracking-wider font-semibold"
                        >
                            Refresh
                        </button>
                    </div>

                    <LibraryGrid
                        refreshTrigger={refreshTrigger}
                        onAlbumClick={setSelectedAlbum}
                    />
                </div>
            </main>
            {/* Album Detail Modal */}
            {selectedAlbum && (
                <AlbumDetail
                    album={selectedAlbum}
                    onClose={() => setSelectedAlbum(null)}
                    onUpdate={() => setRefreshTrigger(p => p + 1)}
                />
            )}
        </div>
    )
}

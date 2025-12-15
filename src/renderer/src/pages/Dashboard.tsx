import React, { useState, useEffect } from 'react'
import { ExternalLink, LogOut } from 'lucide-react'

import { authService, UserProfile } from '../services/auth'
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
    const [user, setUser] = useState<UserProfile | null>(null)

    // Listen for progress events & Get User
    useEffect(() => {
        // @ts-ignore
        const removeListener = window.electron.ipcRenderer.on('download-progress', (_, percent) => {
            setProgress(percent)
            setStatus(`Downloading... ${percent.toFixed(1)}%`)
        })

        // Initial User Load
        setUser(authService.getUser())

        return () => removeListener()
    }, [])

    // Auth Handlers
    const handleLogin = () => {
        authService.initiateLogin()
    }
    const handleLogout = () => {
        authService.logout()
        setUser(null)
    }

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
            {/* Header (Second Bar) */}
            <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <img src={logo} alt="Yoto Local" className="h-10 w-auto" />
                    {user ? (
                        <span className="text-xl font-display font-medium text-white">
                            Welcome, {user.name || user.given_name || 'Friend'}
                        </span>
                    ) : (
                        <span className="text-xl font-display font-medium text-white/50">
                            Welcome
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {user ? (
                        <>
                            <button
                                onClick={() => window.open('https://my.yotoplay.com/my-cards/playlists', '_blank')}
                                className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5"
                                title="View Yoto Account"
                            >
                                <ExternalLink size={20} />
                            </button>
                            <button
                                onClick={handleLogout}
                                className="p-3 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                                title="Logout"
                            >
                                <LogOut size={20} />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleLogin}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
                        >
                            <span>Connect Account</span>
                        </button>
                    )}
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

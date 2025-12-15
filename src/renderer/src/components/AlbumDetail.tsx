import { useState, useRef, useEffect } from 'react'
import { X, Play, Pause, Music, RefreshCw, UploadCloud, Check, Trash } from 'lucide-react'
import { cn } from '../lib/utils'
import { authService } from '../services/auth'

interface Track {
    name: string
    path: string
}

export interface AlbumData {
    name: string
    art: string | null
    path: string
    tracks: Track[]
    isSynced: boolean
}

interface AlbumDetailProps {
    album: AlbumData
    onClose: () => void
    onUpdate: () => void
}

export function AlbumDetail({ album, onClose, onUpdate }: AlbumDetailProps) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)

    const [isSearchingArt, setIsSearchingArt] = useState(false)
    const [searchResults, setSearchResults] = useState<any[]>([])

    const [isSyncing, setIsSyncing] = useState(false)

    // Play/Pause Logic
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            audioRef.current.src = currentTrack.path
            audioRef.current.play()
            setIsPlaying(true)
        }
    }, [currentTrack])

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause()
            } else {
                audioRef.current.play()
            }
            setIsPlaying(!isPlaying)
        }
    }

    // Art Search Logic
    const searchArt = async () => {
        setIsSearchingArt(true)
        try {
            const query = encodeURIComponent(album.name)
            const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=album&limit=6`)
            const data = await res.json()
            setSearchResults(data.results)
        } catch (e) {
            console.error(e)
        }
    }

    const selectArt = async (imageUrl: string) => {
        // High quality setting
        const hqUrl = imageUrl.replace('100x100bb', '1000x1000bb')
        try {
            // @ts-ignore
            await window.electron.ipcRenderer.invoke('update-album-art', {
                albumPath: album.path,
                imageUrl: hqUrl
            })
            onUpdate() // Refresh parent
            onClose() // Close to force refresh (or we could update local state)
        } catch (e) {
            console.error(e)
        }
    }

    // Progress Logic
    const [progress, setProgress] = useState<{ current: number, total: number, filename: string, status?: string } | null>(null)

    useEffect(() => {
        // @ts-ignore
        const removeListener = window.electron.ipcRenderer.on('sync-progress', (_, data) => {
            console.log('Progress:', data)
            if (data.albumPath === album.name || data.albumPath === album.path) {
                setProgress(data)
            }
        })
        return () => {
            // @ts-ignore
            removeListener()
        }
    }, [album])

    // Sync Logic
    const toggleSync = async () => {
        setIsSyncing(true)
        setProgress(null) // Reset
        try {
            // Check if we can auto-sync
            const token = authService.getAccessToken()
            const idToken = authService.getIdToken()
            const isAuthenticated = authService.isAuthenticated()

            if (isAuthenticated && token && idToken) {
                // Check if we are already synced, if so, invalidating sync
                if (album.isSynced) {
                    console.log('Un-syncing album and deleting from Yoto...')

                    // 1. Try to delete remotely if we have a way to find it (or if main stored the ID)
                    // Currently we rely on main process having stored "remoteId" in syncStatus
                    // We'll pass albumPath, main handles lookup via delete-playlist-by-path


                    // For now, proceed with local update until main is robust.
                    // Actually, let's just call update-sync-status.
                    // The user asked for DELETION.

                    // We need to retrieve the remoteId. 
                    // Let's assume the "AlbumData" passed in props might have it? NO.

                    // Let's invoke a new "unsync-album" handler?
                    // Or just pass albumPath to 'delete-playlist' and update main to read from store.

                    // I will assume I updating main to accept albumPath in delete-playlist.
                    // Let's trigger the delete call.
                    // @ts-ignore
                    await window.electron.ipcRenderer.invoke('delete-playlist-by-path', {
                        albumPath: album.path,
                        accessToken: token
                    })

                    // @ts-ignore
                    await window.electron.ipcRenderer.invoke('update-sync-status', {
                        albumPath: album.path,
                        synced: false,
                        remoteId: null
                    })
                    album.isSynced = false
                    onUpdate()
                    return
                }

                console.log('Starting Auto-Sync...')
                // @ts-ignore
                const result = await window.electron.ipcRenderer.invoke('sync-to-yoto', {
                    albumPath: album.path,
                    albumName: album.name,
                    albumArtUrl: album.art, // Pass the image source
                    accessToken: token,
                    idToken: idToken,
                    tracks: album.tracks
                })

                if (result.success) {
                    console.log('Auto-Sync Complete!')
                    const newStatus = true
                    // @ts-ignore
                    await window.electron.ipcRenderer.invoke('update-sync-status', {
                        albumPath: album.path,
                        synced: newStatus,
                        remoteId: result.remoteId
                    })
                    album.isSynced = newStatus
                    onUpdate()
                } else {
                    console.error('Auto-Sync Failed:', result.error)
                    // Fallback to manual? Or just alert?
                    alert(`Sync failed: ${result.error}`)
                }
            } else {
                // Manual Fallback
                const newStatus = !album.isSynced
                if (newStatus) {
                    window.open('https://my.yotoplay.com/my-cards/playlists', '_blank')
                }
                // @ts-ignore
                await window.electron.ipcRenderer.invoke('update-sync-status', {
                    albumPath: album.path,
                    synced: newStatus
                })
                album.isSynced = newStatus
                onUpdate()
            }
        } catch (e: any) {
            console.error(e)
            alert(`Error: ${e.message}`)
        } finally {
            setIsSyncing(false)
            setProgress(null)
        }
    }

    // Delete Local Logic
    const deleteLocal = async () => {
        if (confirm('Are you sure you want to delete this album from your computer? This cannot be undone.')) {
            try {
                // @ts-ignore
                const res = await window.electron.ipcRenderer.invoke('delete-local-album', album.path)
                if (res.success) {
                    onUpdate()
                    onClose()
                } else {
                    alert('Failed to delete: ' + res.error)
                }
            } catch (e: any) {
                console.error(e)
                alert('Error: ' + e.message)
            }
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-background border border-white/10 w-full max-w-4xl h-full max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative">
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/20 hover:bg-white/10 transition-colors">
                    <X className="w-6 h-6" />
                </button>

                {/* Left: Art & Meta */}
                <div className="md:w-1/3 bg-muted/10 p-8 flex flex-col gap-6 border-r border-white/5">
                    <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl relative group">
                        {album.art ? (
                            <img src={album.art} alt={album.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-accent/10 flex items-center justify-center">
                                <Music className="w-20 h-20 text-accent/50" />
                            </div>
                        )}

                        {/* Art Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                                onClick={searchArt}
                                className="px-4 py-2 bg-white text-black rounded-full font-bold text-xs uppercase tracking-wider hover:scale-105 transition-transform"
                            >
                                Change Art
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold font-display leading-tight">{album.name}</h2>
                        {/* Since folder structure is Artist/Album, we could try to guess artist from path, but for now just show Album */}
                    </div>

                    <div className="mt-auto space-y-3">
                        <button
                            onClick={toggleSync}
                            className={cn(
                                "w-full py-4 rounded-xl flex items-center justify-center gap-3 font-semibold transition-all border",
                                album.isSynced
                                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive group"
                                    : "bg-primary text-primary-foreground hover:brightness-110 border-transparent"
                            )}
                        >
                            {album.isSynced ? (
                                <>
                                    <Check className="w-5 h-5 group-hover:hidden" />
                                    <X className="w-5 h-5 hidden group-hover:block" />
                                    <span className="group-hover:hidden">Synced to Yoto</span>
                                    <span className="hidden group-hover:block">Un-sync</span>
                                </>
                            ) : (
                                <>
                                    {isSyncing ? (
                                        <div className="flex flex-col items-center w-full px-4">
                                            {progress ? (
                                                <>
                                                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-1">
                                                        <div
                                                            className="h-full bg-white transition-all duration-300"
                                                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] opacity-80 truncate max-w-full">
                                                        {progress.status === 'artwork' ? 'Uploading Art...' : `Uploading ${progress.current}/${progress.total}`}
                                                    </span>
                                                </>
                                            ) : (
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-5 h-5" />
                                            <span>Upload to Yoto</span>
                                        </>
                                    )}
                                </>
                            )}
                        </button>
                        {!album.isSynced && (
                            <p className="text-[10px] text-center text-muted-foreground px-2">
                                Opens My Yoto Library. Click to mark as synced after uploading.
                            </p>
                        )}

                        <button
                            onClick={deleteLocal}
                            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-medium transition-all border border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/50 text-sm"
                        >
                            <Trash className="w-4 h-4" />
                            <span>Remove from Local Library</span>
                        </button>
                    </div>
                </div>

                {/* Right: Tracks or Search Results */}
                <div className="flex-1 p-8 overflow-y-auto bg-card/30">
                    {isSearchingArt ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold">Select Cover Art</h3>
                                <button onClick={() => setIsSearchingArt(false)} className="text-xs uppercase font-bold text-muted-foreground hover:text-white">Cancel</button>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {searchResults.map((res: any) => (
                                    <button
                                        key={res.artworkUrl100}
                                        onClick={() => selectArt(res.artworkUrl100)}
                                        className="aspect-square rounded-xl overflow-hidden hover:ring-2 ring-primary transition-all"
                                    >
                                        <img src={res.artworkUrl100.replace('100x100', '300x300')} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Tracks</h3>
                            {album.tracks.map((track) => {
                                const isCurrent = currentTrack?.path === track.path
                                return (
                                    <div
                                        key={track.path}
                                        className={cn(
                                            "flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer",
                                            isCurrent && "bg-white/10"
                                        )}
                                        onClick={() => setCurrentTrack(track)}
                                    >
                                        <button
                                            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (isCurrent) togglePlay()
                                                else setCurrentTrack(track)
                                            }}
                                        >
                                            {isCurrent && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("font-medium truncate", isCurrent && "text-primary")}>{track.name}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            <audio
                ref={audioRef}
                onEnded={() => setIsPlaying(false)}
            />
        </div>
    )
}

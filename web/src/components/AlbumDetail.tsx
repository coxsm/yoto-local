import { useState, useRef, useEffect } from 'react'
import { X, Play, Pause, Music, RefreshCw, UploadCloud, Check, Trash } from 'lucide-react'
import type { Album, SyncProgress, Track } from '@yoto-local/shared'
import { companion } from '../api/companion'
import { cn } from '../lib/utils'
import { authService } from '../services/auth'

interface ArtResult {
  collectionId: number
  artworkUrl100: string
}

interface AlbumDetailProps {
  album: Album
  syncProgress: SyncProgress | null
  onClose: () => void
  onChanged: () => void
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function AlbumDetail({ album, syncProgress, onClose, onChanged }: AlbumDetailProps) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [isSearchingArt, setIsSearchingArt] = useState(false)
  const [searchResults, setSearchResults] = useState<ArtResult[]>([])

  const [isSyncing, setIsSyncing] = useState(false)
  const isAuthenticated = authService.isAuthenticated()

  // Play/Pause Logic
  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = companion.mediaUrl(currentTrack.url)
      audioRef.current.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false)
      )
    }
  }, [currentTrack])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  // Art Search Logic
  const searchArt = async () => {
    setIsSearchingArt(true)
    try {
      const query = encodeURIComponent(album.name)
      const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=album&limit=6`)
      const data = (await res.json()) as { results: ArtResult[] }
      setSearchResults(data.results)
    } catch (e) {
      console.error(e)
    }
  }

  const selectArt = async (imageUrl: string) => {
    // High quality setting
    const hqUrl = imageUrl.replace('100x100bb', '1000x1000bb')
    try {
      await companion.setArt(album.id, hqUrl)
      onChanged()
      onClose()
    } catch (e) {
      alert(`Could not update artwork: ${errorMessage(e)}`)
    }
  }

  const toggleSync = async () => {
    setIsSyncing(true)
    try {
      if (album.isSynced) {
        // Deletes the Yoto playlist too when we're signed in and know its id.
        const token = isAuthenticated ? await authService.getValidAccessToken() : null
        await companion.unsync(album.id, token)
      } else if (isAuthenticated) {
        const token = await authService.getValidAccessToken()
        if (!token) {
          alert('Your Yoto session has expired. Please reconnect your account.')
          return
        }
        const result = await companion.sync(album.id, token)
        if (!result.success) alert(`Sync failed: ${result.error}`)
      } else {
        // Manual fallback: upload through the Yoto site, then mark as synced here.
        window.open('https://my.yotoplay.com/my-cards/playlists', '_blank')
        await companion.markSynced(album.id, true)
      }
      onChanged()
    } catch (e) {
      console.error(e)
      alert(`Error: ${errorMessage(e)}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const deleteLocal = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this album from your computer? This cannot be undone.'
      )
    ) {
      return
    }
    try {
      await companion.deleteAlbum(album.id)
      onChanged()
      onClose()
    } catch (e) {
      alert(`Failed to delete: ${errorMessage(e)}`)
    }
  }

  const progress = syncProgress?.albumId === album.id ? syncProgress : null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center sm:p-8 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={album.name}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-white/10 w-full max-w-4xl h-full sm:max-h-[80vh] sm:rounded-3xl shadow-2xl overflow-y-auto md:overflow-hidden flex flex-col md:flex-row relative"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/40 hover:bg-white/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Left: Art & Meta */}
        <div className="md:w-1/3 bg-muted/10 p-6 sm:p-8 flex flex-col gap-6 md:border-r border-white/5">
          <div className="aspect-square max-w-xs w-full mx-auto md:max-w-none rounded-2xl overflow-hidden shadow-2xl relative group">
            {album.art ? (
              <img
                src={companion.mediaUrl(album.art)}
                alt={album.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-accent/10 flex items-center justify-center">
                <Music className="w-20 h-20 text-accent/50" />
              </div>
            )}

            {/* Art Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={searchArt}
                className="px-4 py-2 bg-white text-black rounded-full font-bold text-xs uppercase tracking-wider hover:scale-105 transition-transform"
              >
                Change Art
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold font-display leading-tight">{album.name}</h2>
            <p className="text-sm text-muted-foreground">{album.artist}</p>
          </div>

          <div className="md:mt-auto space-y-3">
            <button
              onClick={toggleSync}
              disabled={isSyncing}
              className={cn(
                'w-full py-4 rounded-xl flex items-center justify-center gap-3 font-semibold transition-all border',
                album.isSynced
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive group'
                  : 'bg-primary text-primary-foreground hover:brightness-110 border-transparent'
              )}
            >
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
                        {progress.stage === 'artwork'
                          ? 'Uploading Art...'
                          : progress.stage === 'playlist'
                            ? 'Creating playlist...'
                            : progress.stage === 'transcoding'
                              ? `Processing ${progress.current + 1}/${progress.total}`
                              : `Uploading ${progress.current + 1}/${progress.total}`}
                      </span>
                    </>
                  ) : (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  )}
                </div>
              ) : album.isSynced ? (
                <>
                  <Check className="w-5 h-5 group-hover:hidden" />
                  <X className="w-5 h-5 hidden group-hover:block" />
                  <span className="group-hover:hidden">Synced to Yoto</span>
                  <span className="hidden group-hover:block">Un-sync</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  <span>Upload to Yoto</span>
                </>
              )}
            </button>
            {!album.isSynced && !isAuthenticated && (
              <p className="text-[10px] text-center text-muted-foreground px-2">
                Opens My Yoto Library. Connect your account to upload automatically.
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
        <div className="flex-1 p-6 sm:p-8 md:overflow-y-auto bg-card/30">
          {isSearchingArt ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Select Cover Art</h3>
                <button
                  onClick={() => setIsSearchingArt(false)}
                  className="text-xs uppercase font-bold text-muted-foreground hover:text-white"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {searchResults.map((res) => (
                  <button
                    key={res.collectionId}
                    onClick={() => selectArt(res.artworkUrl100)}
                    className="aspect-square rounded-xl overflow-hidden hover:ring-2 ring-primary transition-all"
                  >
                    <img
                      src={res.artworkUrl100.replace('100x100', '300x300')}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">
                Tracks
              </h3>
              {album.tracks.map((track) => {
                const isCurrent = currentTrack?.file === track.file
                return (
                  <div
                    key={track.file}
                    className={cn(
                      'flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer',
                      isCurrent && 'bg-white/10'
                    )}
                    onClick={() => (isCurrent ? togglePlay() : setCurrentTrack(track))}
                  >
                    <button
                      aria-label={
                        isCurrent && isPlaying ? `Pause ${track.name}` : `Play ${track.name}`
                      }
                      className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors"
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium truncate', isCurrent && 'text-primary')}>
                        {track.name}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
    </div>
  )
}

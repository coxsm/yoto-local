import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, LogOut } from 'lucide-react'
import type { Album, DownloadJob, SyncProgress } from '@yoto-local/shared'

import { companion } from '../api/companion'
import { useCompanion } from '../hooks/useCompanion'
import { authService, UserProfile } from '../services/auth'
import { AlbumDetail } from '../components/AlbumDetail'
import { CompanionPanel } from '../components/CompanionPanel'
import { DownloadQueue } from '../components/DownloadQueue'
import { LibraryGrid } from '../components/LibraryGrid'
import { PlaylistInput } from '../components/PlaylistInput'
import logo from '../assets/logo.png'

export function Dashboard(): React.JSX.Element {
  const { status, health, pairError, check, pair } = useCompanion()
  const ready = status === 'ready'

  const [user, setUser] = useState<UserProfile | null>(() => authService.getUser())
  const [albums, setAlbums] = useState<Album[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const refreshTimer = useRef<number | undefined>(undefined)

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    try {
      setAlbums(await companion.library())
    } catch (error) {
      console.error(error)
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  // Live updates from the companion: download progress, sync progress, library changes.
  useEffect(() => {
    if (!ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLibrary()
    const unsubscribe = companion.subscribe((event) => {
      if (event.type === 'job') {
        setJobs((prev) => {
          const others = prev.filter((j) => j.id !== event.job.id)
          const existed = others.length !== prev.length
          return existed
            ? prev.map((j) => (j.id === event.job.id ? event.job : j))
            : [event.job, ...others]
        })
      } else if (event.type === 'sync') {
        setSyncProgress(event.progress)
      } else if (event.type === 'library-changed') {
        window.clearTimeout(refreshTimer.current)
        refreshTimer.current = window.setTimeout(loadLibrary, 300)
      }
    })
    return () => {
      unsubscribe()
      window.clearTimeout(refreshTimer.current)
    }
  }, [ready, loadLibrary])

  const handleLogout = () => {
    authService.logout()
    setUser(null)
  }

  const handleDownload = async (url: string) => {
    const job = await companion.startDownload(url)
    setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]))
  }

  const handleCancel = (id: string) => {
    companion.cancelDownload(id).catch((error) => console.error(error))
  }

  const handleDismiss = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id))

  const selectedAlbum = albums.find((a) => a.id === selectedId) ?? null

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans selection:bg-primary/20">
      <header className="min-h-16 sm:h-20 border-b border-white/5 flex items-center justify-between gap-4 px-4 sm:px-8 pt-[env(safe-area-inset-top)] bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <img src={logo} alt="Yoto Local" className="h-8 sm:h-10 w-auto" />
          <span className="text-lg sm:text-xl font-display font-medium text-white truncate">
            {user ? `Welcome, ${user.name || user.given_name || 'Friend'}` : 'Welcome'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <a
                href="https://my.yotoplay.com/my-cards/playlists"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-sm font-semibold whitespace-nowrap transition-colors border border-white/5"
                title="Open your Yoto account"
              >
                <ExternalLink size={18} />
                <span>My Account</span>
              </a>
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
              onClick={() => authService.initiateLogin()}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              Connect Account
            </button>
          )}
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <CompanionPanel
          status={status}
          health={health}
          pairError={pairError}
          onRetry={check}
          onPair={pair}
        />

        <div className="space-y-4">
          <PlaylistInput onSubmit={handleDownload} disabled={!ready} />
          <DownloadQueue jobs={jobs} onCancel={handleCancel} onDismiss={handleDismiss} />
        </div>

        {ready && (
          <section className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white font-display">Local Library</h2>
              <button
                onClick={loadLibrary}
                className="text-xs text-muted-foreground hover:text-white transition-colors uppercase tracking-wider font-semibold"
              >
                Refresh
              </button>
            </div>

            <LibraryGrid
              albums={albums}
              loading={libraryLoading}
              onAlbumClick={(album) => setSelectedId(album.id)}
            />
          </section>
        )}
      </main>

      {selectedAlbum && (
        <AlbumDetail
          album={selectedAlbum}
          syncProgress={syncProgress}
          onClose={() => setSelectedId(null)}
          onChanged={loadLibrary}
        />
      )}
    </div>
  )
}

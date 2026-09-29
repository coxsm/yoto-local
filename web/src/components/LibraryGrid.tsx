import { Music, Disc } from 'lucide-react'
import type { Album } from '@yoto-local/shared'
import { companion } from '../api/companion'

interface LibraryGridProps {
  albums: Album[]
  loading: boolean
  onAlbumClick: (album: Album) => void
}

export function LibraryGrid({ albums, loading, onAlbumClick }: LibraryGridProps) {
  if (loading && albums.length === 0) {
    return <div className="text-muted-foreground text-sm animate-pulse">Loading library...</div>
  }

  if (albums.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl">
        <Music className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">No downloads yet</h3>
        <p className="text-sm text-muted-foreground/60">Downloaded playlists will appear here</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6 pb-12">
      {albums.map((album) => (
        <button
          key={album.id}
          type="button"
          className="group text-left"
          onClick={() => onAlbumClick(album)}
        >
          <div className="aspect-square rounded-xl bg-card border border-white/5 overflow-hidden relative shadow-lg group-hover:shadow-primary/20 transition-all mb-3">
            {album.art ? (
              <img
                src={companion.mediaUrl(album.art)}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-accent/5">
                <Disc className="w-12 h-12 text-accent/50" />
              </div>
            )}
            {album.isSynced && (
              <div
                className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg"
                title="Synced to Yoto"
              >
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <p className="text-xs text-white font-medium">{album.tracks.length} tracks</p>
            </div>
          </div>
          <h4
            className="font-bold text-sm truncate group-hover:text-primary transition-colors"
            title={album.name}
          >
            {album.name}
          </h4>
          <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
        </button>
      ))}
    </div>
  )
}

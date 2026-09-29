import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Shows a toast when a new deploy is available; the service worker waits until the user accepts. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), UPDATE_CHECK_MS)
    }
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-[200] flex items-center gap-3 rounded-2xl border border-white/10 bg-card px-4 py-3 shadow-2xl sm:max-w-sm"
    >
      <p className="flex-1 text-sm">A new version of Yoto Local is available.</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
      >
        <RefreshCw size={16} />
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}

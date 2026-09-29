import React, { useEffect, useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { UpdatePrompt } from './components/UpdatePrompt'
import { authService } from './services/auth'

type CallbackState =
  { status: 'idle' } | { status: 'connecting' } | { status: 'error'; message: string }

// OAuth codes are single-use; guard against StrictMode running the effect twice.
let callbackHandled = false

function readCallbackParams(): { code: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search)
  return {
    code: params.get('code'),
    error: params.get('error_description') ?? params.get('error')
  }
}

function clearCallbackParams(): void {
  window.history.replaceState(null, '', import.meta.env.BASE_URL)
}

function App(): React.JSX.Element {
  const [callback, setCallback] = useState<CallbackState>(() => {
    const { code, error } = readCallbackParams()
    if (error) return { status: 'error', message: error }
    return code ? { status: 'connecting' } : { status: 'idle' }
  })

  useEffect(() => {
    const { code } = readCallbackParams()
    if (!code || callbackHandled) return
    callbackHandled = true
    authService
      .handleCallback(code)
      .then(() => {
        clearCallbackParams()
        setCallback({ status: 'idle' })
      })
      .catch((err: Error) => setCallback({ status: 'error', message: err.message }))
  }, [])

  if (callback.status === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-background text-foreground">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-lg font-medium">Connecting to Yoto...</p>
      </div>
    )
  }

  if (callback.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-background text-foreground p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
        <p className="text-muted-foreground mb-6 font-mono text-sm bg-black/20 p-4 rounded-lg max-w-lg break-all">
          {callback.message}
        </p>
        <button
          onClick={() => {
            clearCallbackParams()
            setCallback({ status: 'idle' })
          }}
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  return (
    <>
      <Dashboard />
      <UpdatePrompt />
    </>
  )
}

export default App

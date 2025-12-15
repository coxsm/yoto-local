import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'

export default function Callback() {
    const [error, setError] = useState<string | null>(null)
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const hasCalled = useRef(false)

    useEffect(() => {
        const code = searchParams.get('code')

        if (hasCalled.current) return
        hasCalled.current = true

        if (code) {
            console.log('Exchanging auth code...')
            authService.handleCallback(code)
                .then(() => {
                    console.log('Authentication successful')
                    // Wait a moment to ensure storage is set
                    setTimeout(() => navigate('/'), 100)
                })
                .catch((err) => {
                    console.error('Authentication failed', err)
                    setError(err.message || 'Authentication failed')
                })
        } else {
            setError('No authorization code found in URL')
        }
    }, [searchParams, navigate])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
                <p className="text-muted-foreground mb-6 font-mono text-sm bg-black/20 p-4 rounded-lg max-w-lg break-all">
                    {error}
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 rounded-full bg-primary text-white font-medium hover:brightness-110"
                >
                    Return to Dashboard
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
            <p className="text-lg font-medium">Connecting to Yoto...</p>
        </div>
    )
}

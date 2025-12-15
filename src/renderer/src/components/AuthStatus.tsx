import { useEffect, useState } from 'react'
import { User, LogOut } from 'lucide-react'
import { authService, UserProfile } from '../services/auth'

export function AuthStatus() {
    const [user, setUser] = useState<UserProfile | null>(null)

    useEffect(() => {
        const profile = authService.getUser()
        setUser(profile)
    }, [])

    const handleLogin = () => {
        authService.initiateLogin()
    }

    const handleLogout = () => {
        authService.logout()
        setUser(null)
    }

    if (user) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-sm text-foreground/80">
                    Hello, {user.name || user.email || 'friend'}
                </span>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-colors text-sm font-medium"
                >
                    <LogOut size={16} />
                    <span>Disconnect</span>
                </button>
            </div>
        )
    }

    return (
        <button
            onClick={handleLogin}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent hover:bg-accent/90 text-white border border-accent transition-colors text-sm font-medium shadow-lg shadow-accent/20"
        >
            <User size={16} />
            <span>Connect Yoto Account</span>
        </button>
    )
}
